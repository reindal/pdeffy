const fs = require('fs').promises;
var { ipcRenderer } = require('electron');
const { app } = require('electron');
const path = require('path');
const fsSync = require('fs');

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
        const pdfBuffer = await selectedFile.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;

        // Initialize an array to hold the extracted data for all slides
        const presentationData = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            showStatus(getMessage('convertingPage', { current: i, total: pdf.numPages }), 'success');

            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 }); 
            const textContent = await page.getTextContent();
            
            const currentSlideData = { texts: [], images: [] };

            const lineGroups = {};
            textContent.items.forEach(item => {
                const y = Math.round(item.transform[5]);
                if (!lineGroups[y]) lineGroups[y] = [];
                lineGroups[y].push(item);
            });

            const sortedYs = Object.keys(lineGroups).sort((a, b) => b - a);

            let textY = 0.5;
            sortedYs.slice(0, 15).forEach((y, index) => {
                const lineItems = lineGroups[y].sort((a, b) => a.transform[4] - b.transform[4]);

                lineItems.forEach(item => {
                    const fontName = item.fontName || 'Helvetica';
                    const fontSize = Math.max(10, Math.round(item.height * 0.75));
                    const isBold = fontName.toLowerCase().includes('bold');
                    const isItalic = fontName.toLowerCase().includes('italic');
                    const text = item.str.trim();

                    if (text) {
                        currentSlideData.texts.push({
                            text: text,
                            options: {
                                x: (item.transform[4] / viewport.width) * 10,
                                y: textY,
                                w: 9, h: 0.4,
                                fontSize: fontSize,
                                bold: isBold, italic: isItalic,
                                fontFace: fontName.includes('Times') ? 'Times New Roman' :
                                          fontName.includes('Courier') ? 'Courier New' : 'Arial',
                                color: '000000', valign: 'top', wrap: false
                            }
                        });
                    }
                });
                textY += 0.35;
            });

            // Render page as an image fallback if no text is found
            try {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport: viewport }).promise;
                const imageData = canvas.toDataURL('image/jpeg', 0.7);

                canvas.width = 0; canvas.height = 0; 

                const slideWidth = 10; const slideHeight = 5.625;
                const imgRatio = viewport.width / viewport.height;
                const slideRatio = slideWidth / slideHeight;
                let w, h, x, y;

                if (imgRatio > slideRatio) {
                    w = slideWidth; h = slideWidth / imgRatio;
                    x = 0; y = (slideHeight - h) / 2;
                } else {
                    h = slideHeight; w = slideHeight * imgRatio;
                    x = (slideWidth - w) / 2; y = 0;
                }

                if (sortedYs.length === 0) {
                    currentSlideData.images.push({
                        data: imageData, x: x, y: y, w: w, h: h
                    });
                }
            } catch (imgErr) {
                console.warn('Could not render page as image:', imgErr);
            }
            presentationData.push(currentSlideData);
        }

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

        showStatus(getMessage('processing'), 'success');
        
        logPhysical("2. Diálogo aceptado. Enviando datos al MAIN PROCESS...");
        
        // Dispatch the master data array to the Main Process for PPTX generation
        await ipcRenderer.invoke('generate-pptx', { 
            slides: presentationData, 
            filePath: filePath 
        });

        logPhysical("3. ¡Éxito total! El Main Process guardó el archivo.");

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