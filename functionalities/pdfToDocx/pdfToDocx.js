const { Document, Packer, Paragraph, TextRun, ImageRun } = require('docx');
const fs = require('fs').promises;
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.min.mjs');
var { ipcRenderer } = require('electron');

// Set worker source for legacy build
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

const form = document.getElementById('pdfToDocxForm');
const pdfFile = document.getElementById('pdfFile');
const fileNameDisplay = document.getElementById('fileName');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');

let selectedFile = null;

pdfFile.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        fileNameDisplay.textContent = getMessage('selectedFile') + selectedFile.name;
    }
});

form.addEventListener('submit', async function(e) {
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

        // Parse PDF using pdfjs-dist (legacy build without worker)
        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(pdfBuffer),
            useWorkerFetch: false,
            isEvalSupported: false,
            useSystemFonts: true
        });
        const pdf = await loadingTask.promise;

        const allParagraphs = [];

        // Extract text from all pages with formatting
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.5 });

            // Group text items by vertical position (y coordinate)
            const lineGroups = {};

            textContent.items.forEach(item => {
                const y = Math.round(item.transform[5]); // Y position
                if (!lineGroups[y]) {
                    lineGroups[y] = [];
                }
                lineGroups[y].push(item);
            });

            // Sort lines by Y position (top to bottom)
            const sortedYs = Object.keys(lineGroups).sort((a, b) => b - a);

            // Process each line
            sortedYs.forEach(y => {
                const lineItems = lineGroups[y].sort((a, b) => a.transform[4] - b.transform[4]); // Sort by X position

                const textRuns = lineItems.map(item => {
                    // Extract font properties
                    const fontName = item.fontName || 'Helvetica';
                    const fontSize = Math.round(item.height * 1.33); // Convert to points
                    const isBold = fontName.toLowerCase().includes('bold');
                    const isItalic = fontName.toLowerCase().includes('italic') || fontName.toLowerCase().includes('oblique');

                    return new TextRun({
                        text: item.str,
                        size: fontSize > 0 ? fontSize : 11,
                        bold: isBold,
                        italics: isItalic,
                        font: fontName.includes('Times') ? 'Times New Roman' :
                              fontName.includes('Courier') ? 'Courier New' :
                              fontName.includes('Helvetica') || fontName.includes('Arial') ? 'Arial' :
                              'Calibri'
                    });
                });

                if (textRuns.length > 0) {
                    allParagraphs.push(new Paragraph({
                        children: textRuns,
                        spacing: {
                            after: 100,
                        }
                    }));
                }
            });

            // Add page break except for the last page
            if (i < pdf.numPages) {
                allParagraphs.push(new Paragraph({
                    text: '',
                    pageBreakBefore: true
                }));
            }
        }

        // Extract images from PDF
        try {
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const ops = await page.getOperatorList();

                for (let j = 0; j < ops.fnArray.length; j++) {
                    if (ops.fnArray[j] === pdfjsLib.OPS.paintImageXObject ||
                        ops.fnArray[j] === pdfjsLib.OPS.paintJpegXObject) {
                        try {
                            const imageName = ops.argsArray[j][0];
                            const image = await page.objs.get(imageName);

                            if (image && image.data) {
                                // Create canvas to convert image
                                const canvas = document.createElement('canvas');
                                canvas.width = image.width;
                                canvas.height = image.height;
                                const ctx = canvas.getContext('2d');

                                const imageData = ctx.createImageData(image.width, image.height);
                                imageData.data.set(image.data);
                                ctx.putImageData(imageData, 0, 0);

                                // Convert to base64
                                const base64 = canvas.toDataURL('image/png').split(',')[1];
                                const buffer = Buffer.from(base64, 'base64');

                                // Add image to document
                                allParagraphs.push(new Paragraph({
                                    children: [
                                        new ImageRun({
                                            data: buffer,
                                            transformation: {
                                                width: Math.min(600, image.width),
                                                height: Math.min(800, image.height * (600 / image.width))
                                            }
                                        })
                                    ],
                                    spacing: { before: 200, after: 200 }
                                }));
                            }
                        } catch (imgErr) {
                            console.warn('Could not extract image:', imgErr);
                        }
                    }
                }
            }
        } catch (imgError) {
            console.warn('Image extraction not fully supported:', imgError);
        }

        // Create DOCX document
        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: 720,
                            right: 720,
                            bottom: 720,
                            left: 720
                        }
                    }
                },
                children: allParagraphs.length > 0 ? allParagraphs : [new Paragraph('Document is empty')]
            }]
        });

        // Show save dialog
        const filePath = await ipcRenderer.invoke('show-save-dialog', {
            title: 'Save DOCX File',
            defaultPath: path.join(require('os').homedir(), 'Downloads', 'converted_document.docx'),
            filters: [
                { name: 'Word Documents', extensions: ['docx'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!filePath) {
            showStatus('Conversion cancelled', 'error');
            submitBtn.disabled = false;
            return;
        }

        // Save DOCX file
        const docBuffer = await Packer.toBuffer(doc);
        await fs.writeFile(filePath, docBuffer);

        const fileName = path.basename(filePath);
        showStatus(getMessage('successPdfConverted', { filename: fileName }), 'success');

    } catch (error) {
        console.error('Error converting PDF to DOCX:', error);
        showStatus(getMessage('errorLoadingPdf', { error: error.message }), 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
}



