var { ipcRenderer } = require('electron');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

// Initialize PDF.js worker
window.pdfjsLib.GlobalWorkerOptions.workerSrc = './../../libs/pdf.worker.min.js';

const STATUS = '#status'; // single source of truth for the container selector

const form = document.getElementById('deleteForm');
const fileInput = document.getElementById('pdfFile');
const pagesPreview = document.getElementById('pagesPreview');
const pagesGrid = document.getElementById('pagesGrid');
const previewSection = document.getElementById('pagesPreviewSection');
const previewHeaderBtn = document.getElementById('previewHeaderBtn');
const previewToggleIcon = document.getElementById('previewToggleIcon');
const submitBtn = document.getElementById('submitBtn');

let currentLang = 'en';
let originalFileBuffer = null;
let pagesToDelete = new Set();
let totalPages = 0;

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

// Handle accordion toggle for the preview section
previewHeaderBtn.addEventListener('click', () => {
    previewSection.classList.toggle('collapsed');
    previewToggleIcon.classList.toggle('collapsed');
});

fileInput.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) {
        pagesPreview.style.display = 'none';
        return;
    }

    const blocked = await PdfEncryptionGuard.check(file, STATUS);
    if (blocked) {
        pagesPreview.style.display = 'none';
        originalFileBuffer = null;
        return;
    }

    pagesToDelete.clear();
    const fileArrayBuffer = await file.arrayBuffer();

    // Maintain separate buffers to preserve data integrity during preview generation
    const previewBuffer = fileArrayBuffer.slice(0);
    originalFileBuffer = fileArrayBuffer.slice(0);

    // Reveal the main preview container once a file is selected
    pagesPreview.style.display = 'block';
    
    // Ensure the accordion is open by default when a new file is loaded
    previewSection.classList.remove('collapsed');
    previewToggleIcon.classList.remove('collapsed');

    await renderPagePreviews(previewBuffer);
});

async function renderPagePreviews(buffer) {
    pagesGrid.innerHTML = `<p class="loadingText">Loading preview...</p>`;
    
    try {
        const loadingTask = window.pdfjsLib.getDocument({ data: buffer, disableWorker: true });
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

            // Handle page selection for deletion
            wrapper.addEventListener('click', () => {
                const idx = parseInt(wrapper.dataset.pageIndex, 10);
                if (pagesToDelete.has(idx)) {
                    pagesToDelete.delete(idx);
                    wrapper.classList.remove('selected');
                } else {
                    pagesToDelete.add(idx);
                    wrapper.classList.add('selected');
                }
                // Prevent submission if no pages are selected or if all pages are selected
                submitBtn.disabled = pagesToDelete.size === 0 || pagesToDelete.size === totalPages;
            });

            pagesGrid.appendChild(wrapper);
        }
    } catch (error) {
        console.error("Error rendering PDF preview:", error);
        pagesGrid.innerHTML = `<p class="errorText">Failed to load document preview.</p>`;
    }

    submitBtn.disabled = true;
}

form.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (pagesToDelete.size === 0 || pagesToDelete.size === totalPages) {
        StatusManager.show(STATUS, 'error', 'mustLeaveAtLeastOnePage');
        return;
    }

    submitBtn.disabled = true;
    StatusManager.show(STATUS, 'processing', 'processing');

    try {
        const pdfDoc = await PDFDocument.load(originalFileBuffer.slice(0));

        // Inject custom metadata if available
        const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);

        if (finalMetadata.author) pdfDoc.setAuthor(finalMetadata.author);
        if (finalMetadata.title) pdfDoc.setTitle(finalMetadata.title);
        if (finalMetadata.subject) pdfDoc.setSubject(finalMetadata.subject);

        // Remove pages in descending order to prevent index shifting issues
        const sortedIndices = Array.from(pagesToDelete).sort((a, b) => b - a);
        sortedIndices.forEach(index => pdfDoc.removePage(index));

        const pdfBytes = await pdfDoc.save();
        const filename = `cleaned_${Date.now()}.pdf`;
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const savePath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: path.join(downloadsPath, filename),
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (!savePath) {
            StatusManager.show(STATUS, 'error', 'saveCancelled');
            submitBtn.disabled = false;
            return;
        }

        await fs.writeFile(savePath, pdfBytes);

        StatusManager.show(STATUS, 'success', 'successPdfCreated', {
            filename: path.basename(savePath),
            savePath: savePath
        });

        setTimeout(() => CustomMetadataModule.reset(), 2000);

        // Reset UI
        pagesPreview.style.display = 'none';
        form.reset();
        pagesToDelete.clear();
        
    } catch (error) {
        console.error(error);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
    } finally {
        submitBtn.disabled = false;
    }
});

window.addEventListener('languageChanged', () => {
    // Refresh status message if visible
});
