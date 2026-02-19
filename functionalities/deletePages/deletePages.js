const pdfjsLib = require('pdfjs-dist/build/pdf.js');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const { pathToFileURL } = require('url');
var { ipcRenderer } = require('electron');

const form = document.getElementById('deleteForm');
const fileInput = document.getElementById('pdfFile');
const pagesGrid = document.getElementById('pagesGrid');
const previewSection = document.getElementById('pagesPreviewSection');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
let currentLang = 'en';

document.addEventListener('DOMContentLoaded', async () => {
    await refreshLanguage();
});


async function refreshLanguage() {
    try {
        currentLang = await ipcRenderer.invoke('get-language');
    } catch (err) {
        currentLang = 'en';
    }
}

// PDF.js configuration for thumbnails
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve('pdfjs-dist/build/pdf.worker.js')
).toString();

let originalFileBuffer = null;
let pagesToDelete = new Set();
let totalPages = 0;

fileInput.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    pagesToDelete.clear();
    const fileArrayBuffer = await file.arrayBuffer();

    // Separate copies: one for preview and another for saving
    const previewBuffer = fileArrayBuffer.slice(0);
    originalFileBuffer = fileArrayBuffer.slice(0);

    await renderPagePreviews(previewBuffer);
});

async function renderPagePreviews(buffer) {
    pagesGrid.innerHTML = `<p>${getMessage('loadingPreview')}</p>`;
    previewSection.style.display = 'block';

    const loadingTask = pdfjsLib.getDocument({ data: buffer, disableWorker: true });
    const pdf = await loadingTask.promise;
    totalPages = pdf.numPages;

    pagesGrid.innerHTML = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });

        const wrapper = document.createElement('div');
        wrapper.className = 'pageItem';
        wrapper.dataset.pageIndex = i - 1;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        const badge = document.createElement('div');
        badge.className = 'pageBadge';
        badge.innerText = i;

        wrapper.appendChild(canvas);
        wrapper.appendChild(badge);

        wrapper.addEventListener('click', () => {
            const idx = parseInt(wrapper.dataset.pageIndex, 10);
            if (pagesToDelete.has(idx)) {
                pagesToDelete.delete(idx);
                wrapper.classList.remove('selected');
            } else {
                pagesToDelete.add(idx);
                wrapper.classList.add('selected');
            }
            submitBtn.disabled = pagesToDelete.size === 0 || pagesToDelete.size === totalPages;
        });

        pagesGrid.appendChild(wrapper);
    }

    submitBtn.disabled = true;
}

form.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (pagesToDelete.size === 0 || pagesToDelete.size === totalPages) {
        showStatus(getMessage('mustLeaveAtLeastOnePage'), 'error');
        return;
    }

    submitBtn.disabled = true;
    showStatus(getMessage('processing'), 'info');

    try {
        const pdfDoc = await PDFDocument.load(originalFileBuffer.slice(0));

        const sortedIndices = Array.from(pagesToDelete).sort((a, b) => b - a);
        sortedIndices.forEach(index => {
            pdfDoc.removePage(index);
        });

        const pdfBytes = await pdfDoc.save();
        const fileName = `cleaned_${Date.now()}.pdf`;
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const savePath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: path.join(downloadsPath, fileName),
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (!savePath) {
            showStatus(getMessage('saveCancelled'), 'info');
            submitBtn.disabled = false;
            return;
        }

        await fs.writeFile(savePath, pdfBytes);
        showStatus(getMessage('successDeleted', { filename: path.basename(savePath) }), 'success');
    } catch (error) {
        console.error(error);
        showStatus(getMessage('errorPrefix') + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    statusDiv.style.display = 'block';

    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}

window.addEventListener('languageChanged', () => {
    showStatus(getMessage('processing'), 'info');
});
