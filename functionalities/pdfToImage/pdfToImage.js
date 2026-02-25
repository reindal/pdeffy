const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');

// Wait for PDF.js to load from CDN
let pdfjsLib = null;

// Initialize PDF.js
async function initPdfJs() {
    if (!pdfjsLib) {
        // Wait for PDF.js to be available from CDN
        let attempts = 0;
        while (!window.pdfjsLib && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (!window.pdfjsLib) {
            throw new Error('PDF.js library failed to load');
        }

        pdfjsLib = window.pdfjsLib;

        // Configure worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
    }
    return pdfjsLib;
}

let pdfDocument = null;
let selectedFile = null;

let form, pdfFile, fileInfo, submitBtn, statusDiv, pagesPreview, pagesPreviewContainer, imageFormat;
let togglePreviewBtn, togglePreviewText, togglePreviewIcon;

// Toggle preview functionality
let isPreviewCollapsed = false;

// Initialize DOM elements when ready
document.addEventListener('DOMContentLoaded', function() {
    form = document.getElementById('pdfToImageForm');
    pdfFile = document.getElementById('pdfFile');
    fileInfo = document.getElementById('fileInfo');
    submitBtn = document.getElementById('submitBtn');
    statusDiv = document.getElementById('status');
    pagesPreview = document.getElementById('pagesPreview');
    pagesPreviewContainer = document.getElementById('pagesPreviewContainer');
    imageFormat = document.getElementById('imageFormat');
    togglePreviewBtn = document.getElementById('togglePreviewBtn');
    togglePreviewText = document.getElementById('togglePreviewText');
    togglePreviewIcon = document.getElementById('togglePreviewIcon');

    // Add toggle button event listener
    if (togglePreviewBtn) {
        togglePreviewBtn.addEventListener('click', function(e) {
            e.preventDefault();

            isPreviewCollapsed = !isPreviewCollapsed;

            if (isPreviewCollapsed) {
                // Ukrywamy podgląd
                pagesPreviewContainer.style.display = 'none';
                updateToggleButtonText('show');  // Przycisk: "Show preview"
            } else {
                // Pokazujemy podgląd
                pagesPreviewContainer.style.display = 'grid';
                updateToggleButtonText('hide');  // Przycisk: "Hide preview"
            }
        });
    }

    // Add file input listener
    if (pdfFile) {
        pdfFile.addEventListener('change', async function(e) {
            selectedFile = e.target.files[0];
            if (selectedFile) {
                await loadPDF(selectedFile);
            }
        });
    }

    // Add form submit listener
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // Add language change listener
    const langSelector = document.getElementById('languageSelector');
    if (langSelector) {
        langSelector.addEventListener('change', () => {
            if (pagesPreview && pagesPreview.style.display !== 'none') {
                updateToggleButtonText(isPreviewCollapsed ? 'show' : 'hide');
            }
        });
    }
});

function updateToggleButtonText(action) {
    const lang = localStorage.getItem('language') || 'en';
    const texts = {
        en: {
            show: 'Show preview',
            hide: 'Hide preview'
        },
        it: {
            show: 'Mostra anteprima',
            hide: 'Nascondi anteprima'
        },
        pl: {
            show: 'Pokaż podgląd',
            hide: 'Ukryj podgląd'
        }
    };

    if (togglePreviewText) {
        togglePreviewText.textContent = texts[lang][action] || texts['en'][action];
    }
}

async function loadPDF(file) {
    try {
        showStatus(getMessage('loadingPdf'), 'info');

        // Initialize PDF.js if not already initialized
        const pdfjs = await initPdfJs();

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
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

        // Auto-collapse preview if more than 10 pages
        if (numPages > 10) {
            isPreviewCollapsed = true;
            pagesPreviewContainer.style.display = 'none';
            updateToggleButtonText('show');
        } else {
            isPreviewCollapsed = false;
            pagesPreviewContainer.style.display = 'grid';
            updateToggleButtonText('hide');
        }

        statusDiv.style.display = 'none';
    } catch (error) {
        console.error('Error loading PDF:', error);
        showStatus(getMessage('errorLoadingPdf', { error: error.message }), 'error');
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

async function handleFormSubmit(e) {
    e.preventDefault();

    if (!pdfDocument || !selectedFile) {
        showStatus(getMessage('pleaseSelectPdfFirst'), 'error');
        return;
    }

    submitBtn.disabled = true;
    const numPages = pdfDocument.numPages;
    const format = imageFormat.value;
    const saveAsZipCheckbox = document.getElementById('saveAsZipCheckbox');
    const saveAsZip = saveAsZipCheckbox ? saveAsZipCheckbox.checked : false;

    showStatus(getMessage('convertingPages', { count: numPages }), 'info');

    try {
        // Collect all images first
        const imageFiles = [];

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            showStatus(getMessage('convertingPage', { current: pageNum, total: numPages }), 'info');

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
            imageFiles.push(Buffer.from(buffer));
        }

        // Show Save As dialog
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const originalFileName = selectedFile.name.replace('.pdf', '');

        let outputPath;
        let outputFolder;
        let baseName;

        if (saveAsZip) {
            // Save as ZIP dialog
            outputPath = await ipcRenderer.invoke('show-save-dialog', {
                defaultPath: path.join(downloadsPath, `${originalFileName}.zip`),
                filters: [
                    { name: 'ZIP Files', extensions: ['zip'] }
                ]
            });

            if (!outputPath) {
                showStatus(getMessage('saveCancelled'), 'info');
                submitBtn.disabled = false;
                return;
            }

            // Create ZIP file
            const JSZip = require('jszip');
            const zip = new JSZip();

            baseName = path.basename(outputPath, '.zip');

            for (let i = 0; i < imageFiles.length; i++) {
                const fileName = `${baseName}_${i + 1}.${format}`;
                zip.file(fileName, imageFiles[i]);
            }

            const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
            await fs.writeFile(outputPath, zipContent);

            outputFolder = path.dirname(outputPath);
            showStatus(getMessage('successConvertedZip', { count: numPages, format: format.toUpperCase(), path: outputFolder }), 'success');

        } else {
            // Save as image dialog
            outputPath = await ipcRenderer.invoke('show-save-dialog', {
                defaultPath: path.join(downloadsPath, `${originalFileName}.${format}`),
                filters: [
                    { name: format.toUpperCase() + ' Files', extensions: [format] }
                ]
            });

            if (!outputPath) {
                showStatus(getMessage('saveCancelled'), 'info');
                submitBtn.disabled = false;
                return;
            }

            outputFolder = path.dirname(outputPath);
            baseName = path.basename(outputPath, `.${format}`);

            // Save all image files
            for (let i = 0; i < imageFiles.length; i++) {
                const fileName = `${baseName}_${i + 1}.${format}`;
                const filePath = path.join(outputFolder, fileName);
                await fs.writeFile(filePath, imageFiles[i]);
            }

            showStatus(getMessage('successConvertedPath', { count: numPages, format: format.toUpperCase(), path: outputFolder }), 'success');
        }

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
        showStatus(getMessage('errorPrefix') + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
    }
}

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

