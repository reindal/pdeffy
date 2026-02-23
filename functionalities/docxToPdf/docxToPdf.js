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

// Custom metadata toggle
const addMetadataCheckbox = document.getElementById('addMetadataCheckbox');
const metadataFieldsDiv = document.getElementById('metadataFields');
const metadataTitleInput = document.getElementById('metadataTitleInput');
const metadataDescriptionInput = document.getElementById('metadataDescriptionInput');

addMetadataCheckbox.addEventListener('change', function() {
    if (this.checked) {
        metadataFieldsDiv.classList.add('visible');
    } else {
        metadataFieldsDiv.classList.remove('visible');
    }
});

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

        // Always get author from global settings
        const metadata = await ipcRenderer.invoke('get-pdf-metadata');
        if (metadata.author) pdfDoc.setAuthor(metadata.author);

        // Check if custom metadata is enabled
        if (addMetadataCheckbox.checked) {
            // Use custom metadata from form fields for Title and Subject
            const customTitle = metadataTitleInput.value.trim();
            const customDescription = metadataDescriptionInput.value.trim();

            if (customTitle) pdfDoc.setTitle(customTitle);
            if (customDescription) pdfDoc.setSubject(customDescription);
        } else {
            // Use global settings for Title and Subject
            if (metadata.title) pdfDoc.setTitle(metadata.title);
            if (metadata.subject) pdfDoc.setSubject(metadata.subject);
        }

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
            // Clear custom metadata fields
            setTimeout(() => {
                metadataTitleInput.value = '';
                metadataDescriptionInput.value = '';
                addMetadataCheckbox.checked = false;
                metadataFieldsDiv.classList.remove('visible');
            }, 2000);
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
