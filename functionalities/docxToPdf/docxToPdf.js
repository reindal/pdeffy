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

        // Extract HTML with styling from DOCX (preserves formatting better)
        const result = await mammoth.convertToHtml({
            buffer: buffer,
            includeDefaultStyleMap: true,
            styleMap: [
                "p[style-name='Heading 1'] => h1:fresh",
                "p[style-name='Heading 2'] => h2:fresh",
                "p[style-name='Heading 3'] => h3:fresh",
                "b => b",
                "i => i",
                "u => u"
            ]
        });

        const html = result.value;
        const pdfDoc = await PDFDocument.create();

        // Embed multiple fonts for better formatting
        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
        const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

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
        const margin = 50;
        let cursorY = height - margin;
        const maxWidth = width - (margin * 2);

        // Parse HTML and extract text with formatting
        const parseHtml = (html) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const elements = [];

            const traverse = (node, inheritedStyle = {}) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent.trim();
                    if (text) {
                        elements.push({
                            text: text,
                            ...inheritedStyle
                        });
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    let style = { ...inheritedStyle };

                    switch (node.tagName.toLowerCase()) {
                        case 'h1':
                            style = { ...style, fontSize: 24, bold: true };
                            break;
                        case 'h2':
                            style = { ...style, fontSize: 20, bold: true };
                            break;
                        case 'h3':
                            style = { ...style, fontSize: 16, bold: true };
                            break;
                        case 'strong':
                        case 'b':
                            style = { ...style, bold: true };
                            break;
                        case 'em':
                        case 'i':
                            style = { ...style, italic: true };
                            break;
                        case 'u':
                            style = { ...style, underline: true };
                            break;
                        case 'p':
                            style = { ...style, paragraph: true };
                            break;
                    }

                    node.childNodes.forEach(child => traverse(child, style));

                    if (node.tagName.toLowerCase() === 'p' || node.tagName.toLowerCase() === 'br') {
                        elements.push({ text: '\n', ...style });
                    }
                }
            };

            traverse(doc.body);
            return elements;
        };

        const elements = parseHtml(html);

        // Helper function to get appropriate font
        const getFont = (bold, italic) => {
            if (bold && italic) return timesBold; // Closest approximation
            if (bold) return helveticaBold;
            if (italic) return helveticaOblique;
            return helvetica;
        };

        // Helper function to wrap text
        const wrapText = (text, maxWidth, font, fontSize) => {
            const words = text.split(' ');
            const lines = [];
            let currentLine = '';

            words.forEach(word => {
                const testLine = currentLine ? currentLine + ' ' + word : word;
                const testWidth = font.widthOfTextAtSize(testLine, fontSize);
                if (testWidth > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            });
            if (currentLine) lines.push(currentLine);
            return lines;
        };

        // Render text with formatting
        for (const element of elements) {
            if (element.text === '\n') {
                cursorY -= 12;
                continue;
            }

            const fontSize = element.fontSize || 11;
            const font = getFont(element.bold, element.italic);
            const wrappedLines = wrapText(element.text, maxWidth, font, fontSize);

            for (const line of wrappedLines) {
                if (cursorY < margin + fontSize) {
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

                cursorY -= fontSize + 4;
            }

            if (element.paragraph) {
                cursorY -= 6; // Extra space after paragraph
            }
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
