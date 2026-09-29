const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');
const STATUS = '#status';

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
        if (!window.pdfjsLib) throw new Error('PDF.js library failed to load');
        pdfjsLib = window.pdfjsLib;

        // Configure worker
        // Worker already configured by src/platform/pdfjs-setup.js
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
document.addEventListener('DOMContentLoaded', function () {
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
        togglePreviewBtn.addEventListener('click', function (e) {
            e.preventDefault();

            isPreviewCollapsed = !isPreviewCollapsed;

            if (isPreviewCollapsed) {
                pagesPreviewContainer.style.display = 'none';
                updateToggleButtonText('show');  //"Show preview"
            } else {
                pagesPreviewContainer.style.display = 'grid';
                updateToggleButtonText('hide');  // "Hide preview"
            }
        });
    }

    // Add file input listener
    if (pdfFile) {
        pdfFile.addEventListener('change', async function (e) {
            const file = e.target.files[0];
            if (!file) return;

            const blocked = await PdfEncryptionGuard.check(file, STATUS);
            if (blocked) {
                selectedFile = null;
                return;
            }

            selectedFile = file;
            await loadPDF(selectedFile);
        });
    }

    // Add form submit listener
    if (form) form.addEventListener('submit', handleFormSubmit);

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
    if (togglePreviewText) {
        const key = action === 'show' ? 'showPreview' : 'hidePreview';
        togglePreviewText.textContent = (typeof window.getMessage === 'function')
            ? window.getMessage(key)
            : (action === 'show' ? 'Show preview' : 'Hide preview');
    }
}

async function loadPDF(file) {
    try {
        StatusManager.show(STATUS, 'processing', 'loadingPdf');

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

        StatusManager.hide(STATUS);

    } catch (error) {
        console.error('Error loading PDF:', error);
        StatusManager.show(STATUS, 'error', 'errorLoadingPdf', { error: error.message || String(error) });
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

        await page.render({ canvasContext: context, viewport }).promise;

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
        StatusManager.show(STATUS, 'error', 'pleaseSelectPdfFirst');
        return;
    }

    submitBtn.disabled = true;
    const numPages = pdfDocument.numPages;
    const format = imageFormat.value;
    const saveAsZipCheckbox = document.getElementById('saveAsZipCheckbox');
    const saveAsZip = saveAsZipCheckbox ? saveAsZipCheckbox.checked : false;

    StatusManager.show(STATUS, 'processing', 'convertingPages', { count: numPages });

    try {
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const originalFileName = selectedFile.name.replace('.pdf', '');

        // Prefer Ghostscript rasterization when available (faster, native).
        try {
            const gsCheck = await ipcRenderer.invoke('check-ghostscript-availability');
            if (gsCheck && gsCheck.hasGhostscript) {
                let outputPath;
                let savedFiles = [];
                if (saveAsZip) {
                    outputPath = await ipcRenderer.invoke('show-save-dialog', {
                        defaultPath: path.join(downloadsPath, `${originalFileName}.zip`),
                        filters: [{ name: 'ZIP Files', extensions: ['zip'] }]
                    });
                    if (!outputPath) {
                        StatusManager.show(STATUS, 'error', 'saveCancelled');
                        submitBtn.disabled = false;
                        return;
                    }

                    const workDir = path.join(path.dirname(outputPath), `.pdeffy_img_${Date.now()}`);
                    const tempPdf = path.join(workDir, selectedFile.name);
                    await fs.mkdir(workDir, { recursive: true });
                    await fs.writeFile(tempPdf, new Uint8Array(await selectedFile.arrayBuffer()));

                    const result = await ipcRenderer.invoke('pdf-to-images-gs', {
                        path: tempPdf,
                        outputDir: workDir,
                        format,
                        dpi: 144,
                    });
                    const files = (result && result.files) || [];
                    await ipcRenderer.invoke('zip-files', { paths: files, output: outputPath });
                    savedFiles = [outputPath];
                } else {
                    const pickedDir = await ipcRenderer.invoke('show-open-dialog', {
                        title: (typeof window.getMessage === 'function')
                            ? window.getMessage('pdfToImagePickFolderTitle')
                            : 'Scegli cartella di destinazione',
                        defaultPath: downloadsPath,
                        properties: ['openDirectory', 'createDirectory'],
                    });
                    if (!pickedDir) {
                        StatusManager.show(STATUS, 'error', 'saveCancelled');
                        submitBtn.disabled = false;
                        return;
                    }
                    outputPath = typeof pickedDir === 'string' ? pickedDir : pickedDir;

                    const tempDir = await ipcRenderer.invoke('get-temp-dir');
                    const tempPdf = path.join(tempDir, `pdeffy_in_${Date.now()}_${selectedFile.name}`);
                    await fs.writeFile(tempPdf, new Uint8Array(await selectedFile.arrayBuffer()));

                    const conv = await ipcRenderer.invoke('convert-pdf-to-office', {
                        inputPath: tempPdf,
                        outputPath,
                        format,
                        imageDpi: 144,
                        imageOutputMode: 'folder',
                        fileNamePrefix: originalFileName,
                    });
                    try {
                        await fs.unlink(tempPdf);
                    } catch (_) { /* ignore */ }

                    savedFiles = (conv && conv.savedFiles) || [];
                }

                StatusManager.show(STATUS, 'success', 'successConverted', {
                    count: savedFiles.length || numPages,
                    format: saveAsZip ? 'ZIP' : format.toUpperCase(),
                    filename: path.basename(outputPath),
                    savePath: outputPath,
                    savedFiles,
                });
                submitBtn.disabled = false;
                return;
            }
        } catch (gsErr) {
            console.warn('[pdfToImage] Ghostscript path failed, falling back to PDF.js:', gsErr);
        }

        // Collect all images first (PDF.js canvas fallback)
        const imageFiles = [];

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            StatusManager.show(STATUS, 'processing', 'convertingPage', { current: pageNum, total: numPages });

            const page = await pdfDocument.getPage(pageNum);

            // Higher scale for better quality
            const scale = 2.0;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport }).promise;

            // Convert canvas to blob
            const blob = await new Promise(resolve => {
                if (format === 'jpeg') {
                    canvas.toBlob(resolve, 'image/jpeg', 0.95);
                } else {
                    canvas.toBlob(resolve, 'image/png');
                }
            });

            const buffer = await blob.arrayBuffer();
            imageFiles.push(new Uint8Array(buffer));
        }

        // Show Save As dialog
        let outputPath;

        if (saveAsZip) {
            // Save as ZIP dialog
            outputPath = await ipcRenderer.invoke('show-save-dialog', {
                defaultPath: path.join(downloadsPath, `${originalFileName}.zip`),
                filters: [{ name: 'ZIP Files', extensions: ['zip'] }]
            });

            if (!outputPath) {
                StatusManager.show(STATUS, 'error', 'saveCancelled');
                submitBtn.disabled = false;
                return;
            }

            // Create ZIP file
            const JSZip = require('jszip');
            const zip = new JSZip();
            const baseName = path.basename(outputPath, '.zip');

            for (let i = 0; i < imageFiles.length; i++) {
                zip.file(`${baseName}_${i + 1}.${format}`, imageFiles[i]);
            }

            const zipContent = await zip.generateAsync({ type: 'uint8array' });
            await fs.writeFile(outputPath, zipContent);

            StatusManager.show(STATUS, 'success', 'successConverted', {
                count: numPages,
                format: 'ZIP',
                filename: path.basename(outputPath),
                savePath: outputPath
            });

        } else {
            const outputFolder = await ipcRenderer.invoke('show-open-dialog', {
                title: (typeof window.getMessage === 'function')
                    ? window.getMessage('pdfToImagePickFolderTitle')
                    : 'Scegli cartella di destinazione',
                defaultPath: downloadsPath,
                properties: ['openDirectory', 'createDirectory'],
            });

            if (!outputFolder) {
                StatusManager.show(STATUS, 'error', 'saveCancelled');
                submitBtn.disabled = false;
                return;
            }

            const folder = typeof outputFolder === 'string' ? outputFolder : outputFolder;
            const generatedFiles = [];

            for (let i = 0; i < imageFiles.length; i++) {
                const finalPath = path.join(
                    folder,
                    imageFiles.length === 1
                        ? `${originalFileName}.${format}`
                        : `${originalFileName}_${String(i + 1).padStart(3, '0')}.${format}`
                );
                await fs.writeFile(finalPath, imageFiles[i]);
                generatedFiles.push(finalPath);
            }

            StatusManager.show(STATUS, 'success', 'successConverted', {
                count: numPages,
                format: format.toUpperCase(),
                filename: path.basename(folder),
                savePath: folder,
                savedFiles: generatedFiles,
            });
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
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message || String(error) });
    } finally {
        submitBtn.disabled = false;
    }
}