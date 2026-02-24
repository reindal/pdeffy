const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const JSZip = require('jszip');
const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');
var { ipcRenderer } = require('electron');

const form = document.getElementById('pptxToPdfForm');
const pptxFileInput = document.getElementById('pptxFile');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const fileInfo = document.getElementById('fileInfo');

// Custom metadata toggle
const addMetadataCheckbox = document.getElementById('addMetadataCheckbox');
const metadataFieldsDiv = document.getElementById('metadataFields');
const metadataTitleInput = document.getElementById('metadataTitleInput');
const metadataDescriptionInput = document.getElementById('metadataDescriptionInput');

if (addMetadataCheckbox && metadataFieldsDiv) {
    addMetadataCheckbox.addEventListener('change', function() {
        if (this.checked) {
            metadataFieldsDiv.classList.add('visible');
        } else {
            metadataFieldsDiv.classList.remove('visible');
        }
    });
}

pptxFileInput.addEventListener('change', function (e) {
    if (e.target.files.length > 0) {
        fileInfo.style.display = 'block';
        fileNameDisplay.textContent = e.target.files[0].name;
    }
});

form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!pptxFileInput.files[0]) return;

    submitBtn.disabled = true;
    showStatus(getMessage('convertingPptx'), 'info');

    try {
        const file = pptxFileInput.files[0];
        const arrayBuffer = await file.arrayBuffer();

        const zip = await JSZip.loadAsync(arrayBuffer);
        const pdfDoc = await PDFDocument.create();

        // Embed multiple fonts for better formatting
        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
        const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        // Always get author from global settings
        const metadata = await ipcRenderer.invoke('get-pdf-metadata');
        if (metadata.author) pdfDoc.setAuthor(metadata.author);

        // Check if custom metadata is enabled
        if (addMetadataCheckbox && addMetadataCheckbox.checked) {
            // Use custom metadata from form fields for Title and Subject
            const customTitle = metadataTitleInput ? metadataTitleInput.value.trim() : '';
            const customDescription = metadataDescriptionInput ? metadataDescriptionInput.value.trim() : '';

            if (customTitle) pdfDoc.setTitle(customTitle);
            if (customDescription) pdfDoc.setSubject(customDescription);
        } else {
            // Use global settings for Title and Subject
            if (metadata.title) pdfDoc.setTitle(metadata.title);
            if (metadata.subject) pdfDoc.setSubject(metadata.subject);
        }

        const font = await pdfDoc.embedFont(StandardFonts.Helvetica || 'Helvetica');

        // Slide files are located in ppt/slides/slideN.xml
        const slideFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'));

        // Sort slides numerically
        slideFiles.sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)[0]);
            const numB = parseInt(b.match(/\d+/)[0]);
            return numA - numB;
        });

        if (slideFiles.length === 0) throw new Error("No slides found");

        const parser = new xml2js.Parser();

        for (const slidePath of slideFiles) {
            const slideXml = await zip.file(slidePath).async("string");

            // Parse XML to extract text with more detail
            let parsedXml;
            try {
                parsedXml = await parser.parseStringPromise(slideXml);
            } catch (e) {
                console.warn('XML parse error:', e);
                parsedXml = null;
            }

            // Create one page per slide (landscape format)
            const page = pdfDoc.addPage([842, 595]); // A4 Landscape
            const { width, height } = page.getSize();

            // Add slide number
            page.drawText(`Slide ${slideFiles.indexOf(slidePath) + 1}`, {
                x: 50,
                y: height - 40,
                size: 10,
                font: helvetica,
                color: rgb(0.5, 0.5, 0.5)
            });

            let cursorY = height - 80;
            const margin = 70;
            const maxWidth = width - (margin * 2);

            // Extract text from parsed XML with better structure
            const extractTextFromXml = (obj, texts = []) => {
                if (!obj) return texts;

                if (typeof obj === 'string') {
                    texts.push({ text: obj, fontSize: 14, bold: false, italic: false });
                } else if (Array.isArray(obj)) {
                    obj.forEach(item => extractTextFromXml(item, texts));
                } else if (typeof obj === 'object') {
                    // Look for text nodes
                    if (obj['a:t']) {
                        const textContent = Array.isArray(obj['a:t']) ? obj['a:t'].join(' ') : obj['a:t'];

                        // Check for formatting
                        let fontSize = 14;
                        let bold = false;
                        let italic = false;

                        if (obj['a:rPr'] && obj['a:rPr'][0]) {
                            const props = obj['a:rPr'][0];
                            if (props['$'] && props['$']['sz']) {
                                fontSize = Math.max(8, Math.min(24, parseInt(props['$']['sz']) / 100));
                            }
                            if (props['$'] && props['$']['b'] === '1') bold = true;
                            if (props['$'] && props['$']['i'] === '1') italic = true;
                        }

                        texts.push({ text: textContent, fontSize, bold, italic });
                    }

                    // Recursively search all properties
                    Object.keys(obj).forEach(key => {
                        if (key !== '$' && key !== 'a:t') {
                            extractTextFromXml(obj[key], texts);
                        }
                    });
                }

                return texts;
            };

            let textElements = [];
            if (parsedXml) {
                textElements = extractTextFromXml(parsedXml);
            }

            // Fallback: simple regex extraction if XML parsing fails
            if (textElements.length === 0) {
                const textMatches = slideXml.match(/<a:t>([^<]+)<\/a:t>/g) || [];
                textElements = textMatches.map(m => ({
                    text: m.replace(/<\/?a:t>/g, ''),
                    fontSize: 14,
                    bold: false,
                    italic: false
                }));
            }

            // Helper to wrap text
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

            // Draw text with formatting
            for (const element of textElements) {
                if (cursorY < 50) break; // Prevent overflow

                const font = element.bold ? helveticaBold :
                           element.italic ? helveticaOblique :
                           helvetica;

                const wrappedLines = wrapText(element.text, maxWidth, font, element.fontSize);

                for (const line of wrappedLines) {
                    if (cursorY < 50) break;

                    page.drawText(line, {
                        x: margin,
                        y: cursorY,
                        size: element.fontSize,
                        font: font,
                        color: rgb(0, 0, 0)
                    });
                    cursorY -= element.fontSize + 8;
                }

                cursorY -= 5; // Extra space between text elements
            }
        }

        const pdfBytes = await pdfDoc.save();
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const defaultPath = path.join(downloadsPath, file.name.replace('.pptx', '.pdf'));
        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: defaultPath,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (outputPath) {
            await fs.writeFile(outputPath, pdfBytes);
            showStatus(getMessage('successPptxCreated'), 'success');
            // Clear custom metadata fields
            setTimeout(() => {
                if (metadataTitleInput) metadataTitleInput.value = '';
                if (metadataDescriptionInput) metadataDescriptionInput.value = '';
                if (addMetadataCheckbox) addMetadataCheckbox.checked = false;
                if (metadataFieldsDiv) metadataFieldsDiv.classList.remove('visible');
            }, 2000);
        }

    } catch (error) {
        console.error(error);
        showStatus(getMessage('errorPptx') + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

// Reusing utility functions
function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
}

// Helper function to get translated messages
function getMessage(key, params = {}) {
    if (typeof window.getMessage === 'function') {
        return window.getMessage(key, params);
    }
    // Fallback messages if getMessage is not loaded yet
    const fallbackMessages = {
        convertingPptx: "Converting PowerPoint to PDF...",
        successPptxCreated: "✓ PDF created successfully",
        errorPptx: "Error converting PPTX: "
    };
    return fallbackMessages[key] || key;
}





