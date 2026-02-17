const { Document, Packer, Paragraph } = require('docx');
const fs = require('fs').promises;
const path = require('path');
const pdfjsLib = require('pdfjs-dist');
var { ipcRenderer } = require('electron');

// Set up the worker for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');

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

        // Parse PDF using pdfjs-dist
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;

        let pdfText = '';

        // Extract text from all pages
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            pdfText += pageText + '\n\n';
        }

        // Create DOCX document
        const paragraphs = pdfText.split('\n').filter(line => line.trim()).map(line => {
            return new Paragraph({
                text: line.trim().substring(0, 32767), // Word has character limit per paragraph
                style: "Normal"
            });
        });

        const doc = new Document({
            sections: [{
                children: paragraphs.length > 0 ? paragraphs : [new Paragraph('Document is empty')]
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



