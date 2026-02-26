let pdfjsLib;

import('pdfjs-dist/legacy/build/pdf.min.mjs').then(module => {
  pdfjsLib = module;
});
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');

// Set worker source for legacy build
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

const form = document.getElementById('deleteForm');
const fileInput = document.getElementById('pdfFile');
const pagesGrid = document.getElementById('pagesGrid');
const previewSection = document.getElementById('pagesPreviewSection');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');

// Custom metadata toggle
const addMetadataCheckbox = document.getElementById('addMetadataCheckbox');
const metadataFieldsDiv = document.getElementById('metadataFields');
const metadataTitleInput = document.getElementById('metadataTitleInput');
const metadataDescriptionInput = document.getElementById('metadataDescriptionInput');

let currentLang = 'en';

if (addMetadataCheckbox && metadataFieldsDiv) {
    addMetadataCheckbox.addEventListener('change', function() {
        if (this.checked) {
            metadataFieldsDiv.classList.add('visible');
        } else {
            metadataFieldsDiv.classList.remove('visible');
        }
    });
}

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
    pagesGrid.innerHTML = `<p>Loading preview...</p>`;
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
        showStatus('You must leave at least one page in the document', 'error');
        return;
    }

    submitBtn.disabled = true;
    showStatus('Processing...', 'info');

    try {
        const pdfDoc = await PDFDocument.load(originalFileBuffer.slice(0));

        // Get metadata from global settings
        const metadata = await ipcRenderer.invoke('get-pdf-metadata');

        // Always set author from global settings
        if (metadata.author) {
            pdfDoc.setAuthor(metadata.author);
        }

        // Check if custom metadata is enabled
        if (addMetadataCheckbox && addMetadataCheckbox.checked) {
            // Use custom metadata from form fields for Title and Subject (only if not empty)
            const customTitle = metadataTitleInput ? metadataTitleInput.value.trim() : '';
            const customDescription = metadataDescriptionInput ? metadataDescriptionInput.value.trim() : '';

            if (customTitle) {
                pdfDoc.setTitle(customTitle);
            }
            if (customDescription) {
                pdfDoc.setSubject(customDescription);
            }
        } else {
            // Use global settings for Title and Subject
            if (metadata.title) {
                pdfDoc.setTitle(metadata.title);
            }
            if (metadata.subject) {
                pdfDoc.setSubject(metadata.subject);
            }
        }

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
            showStatus('Save cancelled', 'info');
            submitBtn.disabled = false;
            return;
        }

        await fs.writeFile(savePath, pdfBytes);
        showStatus(`PDF saved successfully: ${path.basename(savePath)}`, 'success');

        // Clear custom metadata fields
        setTimeout(() => {
            metadataTitleInput.value = '';
            metadataDescriptionInput.value = '';
            addMetadataCheckbox.checked = false;
            metadataFieldsDiv.classList.remove('visible');
        }, 2000);
    } catch (error) {
        console.error(error);
        showStatus('Error: ' + error.message, 'error');
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
    // Refresh status message if visible
});
