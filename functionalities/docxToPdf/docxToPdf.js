const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const mammoth = require('mammoth');
const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');

const form = document.getElementById('docxToPdfForm');
const docxFileInput = document.getElementById('docxFile');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const fileInfo = document.getElementById('fileInfo');

docxFileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        fileInfo.style.display = 'block';
        fileNameDisplay.textContent = e.target.files[0].name;
    }
});

form.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!docxFileInput.files[0]) return;

    submitBtn.disabled = true;
    showStatus(getMessage('convertingDocx'), 'info');

    try {
        const file = docxFileInput.files[0];
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Extract raw text from DOCX and clean incompatible characters (like tabs)
        const result = await mammoth.extractRawText({ buffer: buffer });
        const text = result.value;
        const cleanText = text.replace(/\t/g, "    ");

        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 11;
        const margin = 50;
        
        let page = pdfDoc.addPage();
        let { width, height } = page.getSize();
        let cursorY = height - margin;
        const maxWidth = width - (margin * 2);

        // Calculate text wrapping to prevent text from overflowing the page width
        const wrapText = (cleanText, maxWidth, font, fontSize) => {
            const words = cleanText.split(' ');
            const lines = [];
            let currentLine = '';

            words.forEach(word => {
                const testLine = currentLine ? currentLine + ' ' + word : word;
                const testWidth = font.widthOfTextAtSize(testLine, fontSize);
                if (testWidth > maxWidth) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            });
            lines.push(currentLine);
            return lines;
        };

        const paragraphs = cleanText.split(/\r?\n/);

        // Iterate through paragraphs and draw them line by line, creating new pages if needed
        for (const para of paragraphs) {
            if (para.trim() === '') {
                cursorY -= fontSize;
                continue;
            }

            const wrappedLines = wrapText(para, maxWidth, font, fontSize);

            for (const line of wrappedLines) {
                if (cursorY < margin) {
                    page = pdfDoc.addPage();
                    cursorY = height - margin;
                }

                page.drawText(line, {
                    x: margin,
                    y: cursorY,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0),
                });

                cursorY -= fontSize + 5; // Move cursor down for next line
            }
            cursorY -= 7; // Add extra space between paragraphs
        }

        // Finalize PDF and trigger the "Save As" dialog via Electron IPC
        const pdfBytes = await pdfDoc.save();
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const defaultPath = path.join(downloadsPath, file.name.replace('.docx', '.pdf'));
        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: defaultPath,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (outputPath) {
            await fs.writeFile(outputPath, pdfBytes);
            showStatus(getMessage('successDocxCreated'), 'success');
        }

    } catch (error) {
        console.error(error);
        showStatus(getMessage('errorDocx') + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
}

function getMessage(key, params = {}) {
    const lang = localStorage.getItem('language') || 'es'; 
    
    const messages = {
        es: {
            pleaseSelectDocx: "Por favor, selecciona un archivo .docx",
            convertingDocx: "Convirtiendo documento Word...",
            successDocxCreated: "✓ PDF creado correctamente",
            successPdfCreatedPath: "✓ PDF guardado: {filename}\nen: {path}",
            saveCancelled: "Guardado cancelado",
            errorPrefix: "Error: ",
            errorDocx: "Error al convertir el Docx: "
        },
        en: {
            pleaseSelectDocx: "Please select a .docx file",
            convertingDocx: "Converting Word document...",
            successDocxCreated: "✓ PDF created successfully",
            successPdfCreatedPath: "✓ Saved PDF: {filename}\nin: {path}",
            saveCancelled: "Save cancelled",
            errorPrefix: "Error: ",
            errorDocx: "Error converting Docx: "
        },
        it: {
            pleaseSelectDocx: "Per favore, seleziona un file .docx",
            convertingDocx: "Conversione del documento Word...",
            successDocxCreated: "✓ PDF creato con successo",
            successPdfCreatedPath: "✓ PDF salvato: {filename}\nin: {path}",
            saveCancelled: "Salvataggio annullato",
            errorPrefix: "Errore: ",
            errorDocx: "Errore durante la conversione del Docx: "
        },
        pl: {
            pleaseSelectDocx: "Proszę wybrać plik .docx",
            convertingDocx: "Konwertowanie dokumentu Word...",
            successDocxCreated: "✓ PDF utworzony pomyślnie",
            successPdfCreatedPath: "✓ Zapisano PDF: {filename}\nw: {path}",
            saveCancelled: "Zapisywanie anulowane",
            errorPrefix: "Błąd: ",
            errorDocx: "Błąd podczas konwersji Docx: "
        }
    };

    let message = (messages[lang] && messages[lang][key]) || messages['en'][key] || key;

    Object.keys(params).forEach(param => {
        message = message.replace(`{${param}}`, params[param]);
    });

    return message;
}