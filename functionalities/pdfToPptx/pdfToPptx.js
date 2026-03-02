const pptxgen = require('pptxgenjs');
const fs = require('fs').promises;
var { ipcRenderer } = require('electron');
// main.js (o tu archivo principal)
const { app } = require('electron');
const path = require('path');
const fsSync = require('fs');

// --- Debugging code ---

// Función de log para el proceso Main
function logMainCrash(message) {
    const desktopPath = path.join(require('os').homedir(), 'Desktop', 'pdf_debug_MAIN.txt');
    const time = new Date().toLocaleTimeString();
    fsSync.appendFileSync(desktopPath, `[${time}] ${message}\n`);
}

// Iniciar Crash Reporter (opcional, pero ayuda)
console.log('Crash dumps guardados en:', app.getPath('crashDumps'));

// Escuchar cuando la ventana (renderer) muere
app.on('render-process-gone', (event, webContents, details) => {
    const reason = details.reason; 
    const exitCode = details.exitCode;
    logMainCrash(`💥 CRASH DETECTADO: El renderer murió. Razón: ${reason}, Código: ${exitCode}`);
});

process.on('uncaughtException', (error) => {
    logMainCrash(`🔥 EXCEPCIÓN NO CAPTURADA EN MAIN: ${error.message}`);
});

// --- End of Debugging Code ---
console.log('Crash dumps guardados en:', app.getPath('crashDumps'));

window.pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdf.worker.min.js';

const form = document.getElementById('pdfToPptxForm');
const pdfFile = document.getElementById('pdfFile');
const fileNameDisplay = document.getElementById('fileName');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');

let selectedFile = null;

function logPhysical(message) {
    const desktopPath = path.join(require('os').homedir(), 'Desktop', 'pdf_debug.txt');
    const time = new Date().toLocaleTimeString();
    fsSync.appendFileSync(desktopPath, `[${time}] ${message}\n`);
}

pdfFile.addEventListener('change', function (e) {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        fileNameDisplay.textContent = getMessage('selectedFile') + selectedFile.name;
    }
});

form.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (!selectedFile) {
        showStatus(getMessage('pleaseSelectFile'), 'error');
        return;
    }

    showStatus(getMessage('processing'), 'success');
    submitBtn.disabled = true;

    try {
        // Read PDF file
        const pdfBuffer = await selectedFile.arrayBuffer();

        // Parse PDF using window.pdfjsLib
        const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;

        // Create PowerPoint presentation
        const pptx = new pptxgen();

        // Process each page
        for (let i = 1; i <= pdf.numPages; i++) {
            showStatus(getMessage('convertingPage', { current: i, total: pdf.numPages }), 'success');

            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });

            // Extract text content with formatting
            const textContent = await page.getTextContent();

            // Create slide
            const slide = pptx.addSlide();

            // Group text by Y coordinate (lines)
            const lineGroups = {};
            textContent.items.forEach(item => {
                const y = Math.round(item.transform[5]);
                if (!lineGroups[y]) {
                    lineGroups[y] = [];
                }
                lineGroups[y].push(item);
            });

            // Sort by Y position (top to bottom)
            const sortedYs = Object.keys(lineGroups).sort((a, b) => b - a);

            // Add text to slide with formatting
            let textY = 0.5;
            sortedYs.slice(0, 15).forEach((y, index) => { // Limit to 15 lines per slide
                const lineItems = lineGroups[y].sort((a, b) => a.transform[4] - b.transform[4]);

                lineItems.forEach(item => {
                    const fontName = item.fontName || 'Helvetica';
                    const fontSize = Math.max(10, Math.round(item.height * 0.75));
                    const isBold = fontName.toLowerCase().includes('bold');
                    const isItalic = fontName.toLowerCase().includes('italic');

                    const text = item.str.trim();
                    if (text) {
                        slide.addText(text, {
                            x: (item.transform[4] / viewport.width) * 10, // Convert to inches
                            y: textY,
                            w: 9,
                            h: 0.4,
                            fontSize: fontSize,
                            bold: isBold,
                            italic: isItalic,
                            fontFace: fontName.includes('Times') ? 'Times New Roman' :
                                fontName.includes('Courier') ? 'Courier New' : 'Arial',
                            color: '000000',
                            valign: 'top',
                            wrap: false
                        });
                    }
                });

                textY += 0.35;
            });

            // Try to extract and add images
            try {
                // Create canvas for rendering page as image (fallback)
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                // Render PDF page to canvas
                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                // Convert canvas to base64 image
                const imageData = canvas.toDataURL('image/jpeg', 0.7);

                // ¡LIBERAMOS LA MEMORIA DEL CANVAS AL INSTANTE!
                canvas.width = 0;
                canvas.height = 0;

                // Calculate image size to fit slide background (16:9 aspect ratio)
                const slideWidth = 10; // inches
                const slideHeight = 5.625; // inches (16:9 ratio)

                const imgWidth = viewport.width;
                const imgHeight = viewport.height;
                const imgRatio = imgWidth / imgHeight;
                const slideRatio = slideWidth / slideHeight;

                let w, h, x, y;

                if (imgRatio > slideRatio) {
                    w = slideWidth;
                    h = slideWidth / imgRatio;
                    x = 0;
                    y = (slideHeight - h) / 2;
                } else {
                    h = slideHeight;
                    w = slideHeight * imgRatio;
                    x = (slideWidth - w) / 2;
                    y = 0;
                }

                // Add as background with low opacity if there's text
                if (sortedYs.length === 0) {
                    slide.addImage({
                        data: imageData,
                        x: x,
                        y: y,
                        w: w,
                        h: h
                    });
                }
            } catch (imgErr) {
                console.warn('Could not render page as image:', imgErr);
            }
        }

        // Show save dialog
        logPhysical("1. Abriendo diálogo de guardado...");
        const filePath = await ipcRenderer.invoke('show-save-dialog', {
            title: 'Save PowerPoint File',
            defaultPath: path.join(require('os').homedir(), 'Downloads', 'converted_presentation.pptx'),
            filters: [
                { name: 'PowerPoint Presentations', extensions: ['pptx'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!filePath) {
            showStatus('Conversion cancelled', 'error');
            submitBtn.disabled = false;
            return;
        }
        logPhysical("2. Diálogo aceptado. Empezando a generar el PPTX...");

        showStatus(getMessage('processing'), 'success');

        logPhysical("3. Usando el método nativo writeFile de pptxgen...");
        
        // pptxgenjs tiene un método writeFile que maneja mucho mejor la memoria
        // ya que evita crear un ArrayBuffer gigante en la RAM del Renderer.
        await pptx.writeFile({ fileName: filePath });

        logPhysical("4. ¡Éxito total! Archivo escrito en el disco.");

        const fileName = path.basename(filePath);
        showStatus(getMessage('successPdfConvertedToPptx', { filename: fileName }), 'success');

    } catch (error) {
        console.error('Error converting PDF to PPTX:', error);
        logPhysical("ERROR FATAL: " + error.message);
        showStatus(getMessage('errorLoadingPdf', { error: error.message }), 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
}