const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs').promises;
const path = require('path');
const { ipcRenderer } = require('electron');

// Configure worker path - using the bundled worker
const workerPath = path.join(__dirname, '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

const form = document.getElementById('pdfToImageForm');
const pdfFile = document.getElementById('pdfFile');
const fileInfo = document.getElementById('fileInfo');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const pagesPreview = document.getElementById('pagesPreview');
const pagesPreviewContainer = document.getElementById('pagesPreviewContainer');
const imageFormat = document.getElementById('imageFormat');

let pdfDocument = null;
let selectedFile = null;

pdfFile.addEventListener('change', async function(e) {
    selectedFile = e.target.files[0];
    if (selectedFile) {
        await loadPDF(selectedFile);
    }
});

async function loadPDF(file) {
    try {
        showStatus('Loading PDF...', 'info');

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        pdfDocument = await loadingTask.promise;

        const numPages = pdfDocument.numPages;

        // Show file info
        fileInfo.innerHTML = `
            <div class="fileInfoItem">✓ File: ${file.name}</div>
            <div class="fileInfoItem">✓ Pages: ${numPages}</div>
        `;
        fileInfo.classList.add('active');

        // Generate previews
        await generatePreviews(pdfDocument, numPages);

        statusDiv.style.display = 'none';
    } catch (error) {
        console.error('Error loading PDF:', error);
        showStatus(`Error loading PDF: ${error.message}`, 'error');
    }
}

async function generatePreviews(pdfDoc, numPages) {
    pagesPreviewContainer.innerHTML = '';
    pagesPreview.style.display = 'block';

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);

        const scale = 0.5;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        const previewItem = document.createElement('div');
        previewItem.className = 'pagePreviewItem';

        canvas.className = 'pagePreviewCanvas';

        const label = document.createElement('div');
        label.className = 'pagePreviewLabel';
        label.textContent = `Page ${pageNum}`;

        previewItem.appendChild(canvas);
        previewItem.appendChild(label);
        pagesPreviewContainer.appendChild(previewItem);
    }
}

form.addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!pdfDocument || !selectedFile) {
        showStatus('Please select a PDF file first', 'error');
        return;
    }

    submitBtn.disabled = true;
    const numPages = pdfDocument.numPages;
    showStatus(`Converting ${numPages} page(s) to images...`, 'info');

    try {
        const outputName = document.getElementById('outputName').value || 'page';
        const format = imageFormat.value;
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            showStatus(`Converting page ${pageNum} of ${numPages}...`, 'info');

            const page = await pdfDocument.getPage(pageNum);

            // Higher scale for better quality
            const scale = 2.0;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            await page.render(renderContext).promise;

            // Convert canvas to blob
            const blob = await new Promise(resolve => {
                if (format === 'jpeg') {
                    canvas.toBlob(resolve, 'image/jpeg', 0.95);
                } else {
                    canvas.toBlob(resolve, 'image/png');
                }
            });

            const buffer = await blob.arrayBuffer();
            const fileName = `${outputName}_${pageNum}.${format}`;
            const outputPath = path.join(downloadsPath, fileName);

            await fs.writeFile(outputPath, Buffer.from(buffer));
        }

        showStatus(`✓ Successfully converted ${numPages} page(s) to ${format.toUpperCase()} images`, 'success');

        // Reset form
        setTimeout(() => {
            form.reset();
            selectedFile = null;
            pdfDocument = null;
            fileInfo.classList.remove('active');
            fileInfo.innerHTML = '';
            pagesPreview.style.display = 'none';
            pagesPreviewContainer.innerHTML = '';
        }, 3000);

    } catch (error) {
        console.error('Error converting PDF:', error);
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';

    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}


