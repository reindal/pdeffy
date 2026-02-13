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
    showStatus(getMessage('convertingPages', { count: numPages }), 'info');

    try {
        const outputName = document.getElementById('outputName').value || 'page';
        const format = imageFormat.value;
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');

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
            const fileName = `${outputName}_${pageNum}.${format}`;
            const outputPath = path.join(downloadsPath, fileName);

            await fs.writeFile(outputPath, Buffer.from(buffer));
        }

        showStatus(getMessage('successConverted', { count: numPages, format: format.toUpperCase() }), 'success');

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

function getMessage(key, params = {}) {
    const lang = localStorage.getItem('language') || 'en';
    const messages = {
        en: {
            loadingPdf: "Loading PDF...",
            errorLoadingPdf: "Error loading PDF: {error}",
            pleaseSelectPdfFirst: "Please select a PDF file first",
            convertingPages: "Converting {count} page(s) to images...",
            convertingPage: "Converting page {current} of {total}...",
            successConverted: "✓ Successfully converted {count} page(s) to {format} images",
            errorPrefix: "Error: "
        },
        it: {
            loadingPdf: "Caricamento PDF...",
            errorLoadingPdf: "Errore nel caricamento del PDF: {error}",
            pleaseSelectPdfFirst: "Seleziona prima un file PDF",
            convertingPages: "Conversione di {count} pagina/e in immagini...",
            convertingPage: "Conversione pagina {current} di {total}...",
            successConverted: "✓ Convertite con successo {count} pagina/e in immagini {format}",
            errorPrefix: "Errore: "
        },
        pl: {
            loadingPdf: "Ładowanie PDF...",
            errorLoadingPdf: "Błąd ładowania PDF: {error}",
            pleaseSelectPdfFirst: "Najpierw wybierz plik PDF",
            convertingPages: "Konwersja {count} stron(y) na obrazy...",
            convertingPage: "Konwersja strony {current} z {total}...",
            successConverted: "✓ Pomyślnie przekonwertowano {count} stron(y) na obrazy {format}",
            errorPrefix: "Błąd: "
        }
    };

    let message = (messages[lang] && messages[lang][key]) || messages['en'][key] || key;

    Object.keys(params).forEach(param => {
        message = message.replace(`{${param}}`, params[param]);
    });

    return message;
}


