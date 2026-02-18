const pptxgen = require('pptxgenjs');
const fs = require('fs').promises;
const path = require('path');
const pdfjsLib = require('pdfjs-dist');
var { ipcRenderer } = require('electron');

// Set up the worker for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');

const form = document.getElementById('pdfToPptxForm');
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

        // Create PowerPoint presentation
        const pptx = new pptxgen();

        // Process each page
        for (let i = 1; i <= pdf.numPages; i++) {
            showStatus(getMessage('convertingPage', { current: i, total: pdf.numPages }), 'success');

            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });

            // Create canvas for rendering
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
            const imageData = canvas.toDataURL('image/png');

            // Add slide with the image
            const slide = pptx.addSlide();

            // Calculate image size to fit slide (16:9 aspect ratio)
            const slideWidth = 10; // inches
            const slideHeight = 5.625; // inches (16:9 ratio)

            const imgWidth = viewport.width;
            const imgHeight = viewport.height;
            const imgRatio = imgWidth / imgHeight;
            const slideRatio = slideWidth / slideHeight;

            let w, h, x, y;

            if (imgRatio > slideRatio) {
                // Image is wider than slide
                w = slideWidth;
                h = slideWidth / imgRatio;
                x = 0;
                y = (slideHeight - h) / 2;
            } else {
                // Image is taller than slide
                h = slideHeight;
                w = slideHeight * imgRatio;
                x = (slideWidth - w) / 2;
                y = 0;
            }

            slide.addImage({
                data: imageData,
                x: x,
                y: y,
                w: w,
                h: h
            });

            // Extract text for accessibility
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');

            // Add text as notes if available
            if (pageText.trim()) {
                slide.addNotes(pageText.substring(0, 500)); // Limit to 500 chars
            }
        }

        // Show save dialog
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

        // Save PowerPoint file
        showStatus(getMessage('processing'), 'success');
        await pptx.writeFile({ fileName: filePath });

        const fileName = path.basename(filePath);
        showStatus(getMessage('successPdfConvertedToPptx', { filename: fileName }), 'success');

    } catch (error) {
        console.error('Error converting PDF to PPTX:', error);
        showStatus(getMessage('errorLoadingPdf', { error: error.message }), 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
}

