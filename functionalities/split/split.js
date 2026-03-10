const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');

const form = document.getElementById('splitForm');
const pdfFile = document.getElementById('pdfFile');
const fileNameDisplay = document.getElementById('fileName');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const rangesContainer = document.getElementById('rangesContainer');
const addRangeBtn = document.getElementById('addRangeBtn');
const customFilesContainer = document.getElementById('customFilesContainer');
const addCustomFileBtn = document.getElementById('addCustomFileBtn');

const rangeModeContainer = document.getElementById('rangeModeContainer');
const everyModeContainer = document.getElementById('everyModeContainer');
const customModeContainer = document.getElementById('customModeContainer');
const sizeModeContainer = document.getElementById('sizeModeContainer');
const fileSizeInfo = document.getElementById('fileSizeInfo');
const totalPagesInfo = document.getElementById('totalPagesInfo');
const languageSelector = document.getElementById('languageSelector');

let rangeCount = 1;
let customFileCount = 1;
let totalPdfPages = 0;


if (languageSelector) {
    languageSelector.addEventListener('change', () => {
        setTimeout(() => {
            if (totalPdfPages > 0 && totalPagesInfo) {
                totalPagesInfo.textContent = window.getMessage('totalPagesInfo', { total: totalPdfPages });
            }
        }, 50);
    });
}

if (typeof window.changeLanguage === 'function') {
    const originalChangeLanguage = window.changeLanguage;
    
    window.changeLanguage = function(lang) {
        originalChangeLanguage(lang);
        
        if (typeof totalPdfPages !== 'undefined' && totalPdfPages > 0) {
            const infoDiv = document.getElementById('totalPagesInfo');
            if (infoDiv && typeof window.getMessage === 'function') {
                infoDiv.textContent = window.getMessage('totalPagesInfo', { total: totalPdfPages });
            }
        }
    };
}

// Function to set metadata on a PDF document
async function setMetadata(pdfDoc) {
    // Get metadata from module
    const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);

    if (finalMetadata.author) pdfDoc.setAuthor(finalMetadata.author);
    if (finalMetadata.title) pdfDoc.setTitle(finalMetadata.title);
    if (finalMetadata.subject) pdfDoc.setSubject(finalMetadata.subject);
}

// Helper to enforce max limits and sync start/end values dynamically
function attachRangeListeners(startInput, endInput) {
    startInput.addEventListener('input', () => {
        let startVal = parseInt(startInput.value) || 1;
        let endVal = parseInt(endInput.value) || 1;

        // Cap to total pages if a PDF is loaded
        if (totalPdfPages > 0 && startVal > totalPdfPages) {
            startVal = totalPdfPages;
            startInput.value = startVal;
        }

        // Push the end page up if start page surpasses it
        if (startVal > endVal) {
            endInput.value = startVal;
        }
    });

    endInput.addEventListener('input', () => {
        let startVal = parseInt(startInput.value) || 1;
        let endVal = parseInt(endInput.value) || 1;

        // Cap to total pages if a PDF is loaded
        if (totalPdfPages > 0 && endVal > totalPdfPages) {
            endVal = totalPdfPages;
            endInput.value = endVal;
        }

        // Pull the start page down if end page goes below it
        if (endVal < startVal) {
            startInput.value = endVal;
        }
    });
}

// Force existing inputs to respect the new max page limit when a new PDF is selected
function enforceMaxPagesLimit() {
    if (totalPdfPages <= 0) return;
    const inputs = document.querySelectorAll('.startPage, .endPage, .customStartPage, .customEndPage');
    inputs.forEach(input => {
        input.max = totalPdfPages;
        if (parseInt(input.value) > totalPdfPages) {
            input.value = totalPdfPages;
        }
    });
}

addRange();
addCustomFile();

document.querySelectorAll('input[name="splitMode"]').forEach(radio => {
    radio.addEventListener('change', function() {
        rangeModeContainer.style.display = 'none';
        everyModeContainer.style.display = 'none';
        customModeContainer.style.display = 'none';
        sizeModeContainer.style.display = 'none';

        if (this.value === 'range') {
            rangeModeContainer.style.display = 'block';
        } else if (this.value === 'every') {
            everyModeContainer.style.display = 'block';
        } else if (this.value === 'custom') {
            customModeContainer.style.display = 'block';
        } else if (this.value === 'size') {
            sizeModeContainer.style.display = 'block';
            updateFileSizeInfo();
        }
    });
});

addRangeBtn.addEventListener('click', function(e) {
    e.preventDefault();
    addRange();
    if (window.changeLanguage) window.changeLanguage(window.currentLanguage);
});

addCustomFileBtn.addEventListener('click', function(e) {
    e.preventDefault();
    addCustomFile();
    if (window.changeLanguage) window.changeLanguage(window.currentLanguage);
});

pdfFile.addEventListener('change', async function(e) {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        fileNameDisplay.textContent = getMessage('selectedFile') + selectedFile.name;
        fileNameDisplay.classList.add('active');
        updateFileSizeInfo();

        // Read the PDF to get total pages for validation
        try {
            const arrayBuffer = await selectedFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            totalPdfPages = pdfDoc.getPageCount();
            
            totalPagesInfo.textContent = window.getMessage('totalPagesInfo', { total: totalPdfPages });
            totalPagesInfo.style.display = 'block';
            
            enforceMaxPagesLimit();
        } catch (err) {
            console.error("Error reading PDF pages:", err);
            totalPdfPages = 0;
            totalPagesInfo.style.display = 'none';
        }
    } else {
        totalPdfPages = 0;
        totalPagesInfo.style.display = 'none';
    }
});

form.addEventListener('submit', async function(e) {
    e.preventDefault();

    const file = pdfFile.files[0];
    const splitMode = document.querySelector('input[name="splitMode"]:checked').value;
    const saveAsZipCheckbox = document.getElementById('saveAsZipCheckbox');
    const saveAsZip = saveAsZipCheckbox ? saveAsZipCheckbox.checked : false;

    if (!file) {
        showStatus(getMessage('pleaseSelectFile'), 'error');
        return;
    }

    showStatus(getMessage('processing'), 'success');
    submitBtn.disabled = true;

    try {
        const fileBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(fileBuffer);
        const totalPages = pdfDoc.getPageCount();

        // Collect all PDF files first
        const pdfFiles = [];

        if (splitMode === 'range') {
            // Custom Page Ranges - each range = one file
            const rangeItems = document.querySelectorAll('.rangeItem');
            const ranges = [];

            for (let item of rangeItems) {
                const startPage = parseInt(item.querySelector('.startPage').value);
                const endPage = parseInt(item.querySelector('.endPage').value);

                if (startPage < 1 || endPage < 1) {
                    showStatus(getMessage('pageNumbersGreaterThanZero'), 'error');
                    submitBtn.disabled = false;
                    return;
                }

                if (startPage > endPage) {
                    showStatus(getMessage('startPageCannotBeGreater'), 'error');
                    submitBtn.disabled = false;
                    return;
                }

                if (startPage > totalPages || endPage > totalPages) {
                    showStatus(getMessage('pdfHasOnlyPages', { total: totalPages }), 'error');
                    submitBtn.disabled = false;
                    return;
                }

                ranges.push({ startPage, endPage });
            }

            if (ranges.length === 0) {
                showStatus(getMessage('pleaseAddAtLeastOneRange'), 'error');
                submitBtn.disabled = false;
                return;
            }

            for (let range of ranges) {
                const newPdf = await PDFDocument.create();
                await setMetadata(newPdf);

                for (let pageIdx = range.startPage - 1; pageIdx < range.endPage; pageIdx++) {
                    const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIdx]);
                    newPdf.addPage(copiedPage);
                }
                pdfFiles.push(await newPdf.save());
            }

        } else if (splitMode === 'every') {
            const interval = parseInt(document.getElementById('pagesInterval').value);

            if (interval < 1) {
                showStatus(getMessage('intervalAtLeastOne'), 'error');
                submitBtn.disabled = false;
                return;
            }

            let currentPage = 0;

            while (currentPage < totalPages) {
                const newPdf = await PDFDocument.create();
                await setMetadata(newPdf);

                const endPage = Math.min(currentPage + interval, totalPages);

                for (let pageIdx = currentPage; pageIdx < endPage; pageIdx++) {
                    const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIdx]);
                    newPdf.addPage(copiedPage);
                }
                pdfFiles.push(await newPdf.save());
                currentPage = endPage;
            }

        } else if (splitMode === 'custom') {
            const customFileItems = document.querySelectorAll('.customFileItem');

            if (customFileItems.length === 0) {
                showStatus(getMessage('pleaseAddAtLeastOneOutputFile'), 'error');
                submitBtn.disabled = false;
                return;
            }

            for (let fileItem of customFileItems) {
                const rangeItems = fileItem.querySelectorAll('.customRangeItem');
                const newPdf = await PDFDocument.create();
                await setMetadata(newPdf);

                for (let rangeItem of rangeItems) {
                    const startPage = parseInt(rangeItem.querySelector('.customStartPage').value);
                    const endPage = parseInt(rangeItem.querySelector('.customEndPage').value);

                    if (startPage < 1 || endPage < 1 || startPage > endPage || startPage > totalPages || endPage > totalPages) {
                        showStatus(getMessage('pageNumbersGreaterThanZero'), 'error');
                        submitBtn.disabled = false;
                        return;
                    }

                    for (let pageIdx = startPage - 1; pageIdx < endPage; pageIdx++) {
                        const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIdx]);
                        newPdf.addPage(copiedPage);
                    }
                }
                pdfFiles.push(await newPdf.save());
            }
        } else if (splitMode === 'size') {
            const maxSize = parseFloat(document.getElementById('maxFileSize').value);
            const sizeUnit = document.getElementById('sizeUnit').value;

            if (maxSize <= 0 || isNaN(maxSize)) {
                showStatus(getMessage('pleaseEnterValidFileSize'), 'error');
                submitBtn.disabled = false;
                return;
            }

            let maxBytes;
            switch (sizeUnit) {
                case 'KB':
                    maxBytes = maxSize * 1024;
                    break;
                case 'MB':
                    maxBytes = maxSize * 1024 * 1024;
                    break;
                case 'GB':
                    maxBytes = maxSize * 1024 * 1024 * 1024;
                    break;
                default:
                    maxBytes = maxSize * 1024 * 1024;
            }

            let minPageSize = Infinity;

            for (let i = 0; i < totalPages; i++) {
                const singlePagePdf = await PDFDocument.create();
                const [copiedPage] = await singlePagePdf.copyPages(pdfDoc, [i]);
                singlePagePdf.addPage(copiedPage);
                const singlePageBytes = await singlePagePdf.save();

                if (singlePageBytes.length < minPageSize) {
                    minPageSize = singlePageBytes.length;
                }
            }

            if (maxBytes < minPageSize) {
                const minSizeFormatted = formatFileSize(minPageSize);
                showStatus(getMessage('cannotSplitMinSize', { size: minSizeFormatted }), 'error');
                submitBtn.disabled = false;
                return;
            }

            let currentPage = 0;

            while (currentPage < totalPages) {
                let newPdf = await PDFDocument.create();
                await setMetadata(newPdf);

                let pagesInCurrentFile = 0;

                while (currentPage < totalPages) {
                    const tempPdf = await PDFDocument.create();

                    if (pagesInCurrentFile > 0) {
                        const existingBytes = await newPdf.save();
                        const existingPdf = await PDFDocument.load(existingBytes);
                        const existingPages = await tempPdf.copyPages(existingPdf, existingPdf.getPageIndices());
                        existingPages.forEach(page => tempPdf.addPage(page));
                    }

                    const [nextPage] = await tempPdf.copyPages(pdfDoc, [currentPage]);
                    tempPdf.addPage(nextPage);

                    const tempBytes = await tempPdf.save();

                    if (pagesInCurrentFile > 0 && tempBytes.length > maxBytes) {
                        break;
                    }

                    if (pagesInCurrentFile === 0 && tempBytes.length > maxBytes) {
                        const [copiedPage] = await newPdf.copyPages(pdfDoc, [currentPage]);
                        newPdf.addPage(copiedPage);
                        currentPage++;
                        pagesInCurrentFile++;
                        break;
                    }

                    const [copiedPage] = await newPdf.copyPages(pdfDoc, [currentPage]);
                    newPdf.addPage(copiedPage);
                    currentPage++;
                    pagesInCurrentFile++;
                }

                if (pagesInCurrentFile > 0) {
                    const newPdfBytes = await newPdf.save();
                    pdfFiles.push(newPdfBytes);
                }
            }
        }

        // Now show Save As dialog
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const originalFileName = file.name.replace('.pdf', '');
        // Save as ZIP dialog
        let outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: path.join(downloadsPath, saveAsZip ? `${originalFileName}.zip` : `${originalFileName}.pdf`),
            filters: saveAsZip ? [{ name: 'ZIP Files', extensions: ['zip'] }] : [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (!outputPath) {
            showStatus(getMessage('saveCancelled'), 'info');
            submitBtn.disabled = false;
            return;
        }

        // Create ZIP file
        const outputFolder = path.dirname(outputPath);
        const baseName = path.basename(outputPath, saveAsZip ? '.zip' : '.pdf');

        if (saveAsZip) {
            const JSZip = require('jszip');
            const zip = new JSZip();
            for (let i = 0; i < pdfFiles.length; i++) {
                zip.file(`${baseName}_${i + 1}.pdf`, pdfFiles[i]);
            }
            const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
            await fs.writeFile(outputPath, zipContent);
            showStatus(getMessage('successSplitFilesZip', { count: pdfFiles.length, path: outputFolder }), 'success');
        } else {
            for (let i = 0; i < pdfFiles.length; i++) {
                await fs.writeFile(path.join(outputFolder, `${baseName}_${i + 1}.pdf`), pdfFiles[i]);
            }

            showStatus(getMessage('successSplitFilesPath', { count: pdfFiles.length, path: outputFolder }), 'success');
        }

        submitBtn.disabled = false;

        form.reset();
        fileNameDisplay.classList.remove('active');
        // Reset containers
        rangesContainer.innerHTML = ''; rangeCount = 1; addRange();
        customFilesContainer.innerHTML = ''; customFileCount = 1; addCustomFile();
        if (window.changeLanguage) window.changeLanguage(window.currentLanguage);
        
        // Clear custom metadata fields using module
        CustomMetadataModule.reset();
        totalPdfPages = 0;
        totalPagesInfo.style.display = 'none';

        // Reset mode containers to show only the checked mode
        rangeModeContainer.style.display = 'none';
        everyModeContainer.style.display = 'none';
        customModeContainer.style.display = 'none';
        sizeModeContainer.style.display = 'none';

        const checkedMode = document.querySelector('input[name="splitMode"]:checked');
        if (checkedMode) {
            if (checkedMode.value === 'range') {
                rangeModeContainer.style.display = 'block';
            } else if (checkedMode.value === 'every') {
                everyModeContainer.style.display = 'block';
            } else if (checkedMode.value === 'custom') {
                customModeContainer.style.display = 'block';
            } else if (checkedMode.value === 'size') {
                sizeModeContainer.style.display = 'block';
            }
        }

    } catch (error) {
        showStatus(getMessage('errorPrefix') + error.message, 'error');
        submitBtn.disabled = false;
    }
});

function addRange() {
    let startVal = rangeCount;
    let endVal = rangeCount;

    // Pre-validate max limits if a PDF is already loaded
    if (totalPdfPages > 0 && startVal > totalPdfPages) {
        startVal = totalPdfPages;
        endVal = totalPdfPages;
    }

    const rangeDiv = document.createElement('div');
    rangeDiv.className = 'rangeItem';
    rangeDiv.innerHTML = `
        <div>
            <label class="langText" data-i18n="startPageLabel">Start page:</label>
            <input type="number" class="startPage" min="1" value="${startVal}" max="${totalPdfPages > 0 ? totalPdfPages : ''}" required>
        </div>
        <div>
            <label class="langText" data-i18n="endPageLabel">End page:</label>
            <input type="number" class="endPage" min="1" value="${endVal}" max="${totalPdfPages > 0 ? totalPdfPages : ''}" required>
        </div>
        <button type="button" class="removeRangeBtn langText" data-i18n="removeBtn">Remove</button>
    `;

    // Attach real-time validation to inputs
    const startInput = rangeDiv.querySelector('.startPage');
    const endInput = rangeDiv.querySelector('.endPage');
    attachRangeListeners(startInput, endInput);

    rangeDiv.querySelector('.removeRangeBtn').addEventListener('click', function() {
        if (rangesContainer.querySelectorAll('.rangeItem').length > 1) {
            rangeDiv.remove();
        } else {
            showStatus(getMessage('atLeastOneRangeRequired'), 'error');
        }
    });

    rangesContainer.appendChild(rangeDiv);
    rangeCount++;
}

function addCustomFile() {
    const fileDiv = document.createElement('div');
    fileDiv.className = 'customFileItem';
    fileDiv.innerHTML = `
        <div class="customFileHeader">
            <h4>
                <span class="langText" data-i18n="outputFileLabel">Output File</span>
                <span class="outputFileNumber">#${customFileCount}</span>
            </h4>
            <button type="button" class="removeFileBtn langText" data-i18n="removeFileBtn">Remove File</button>
        </div>
        <div class="customFileRanges"></div>
        <button type="button" class="addCustomRangeBtn langText" data-i18n="addRangeToFileBtn">+ Add Range to This File</button>
    `;

    const rangesDiv = fileDiv.querySelector('.customFileRanges');
    addCustomRange(rangesDiv);
    
    fileDiv.querySelector('.addCustomRangeBtn').addEventListener('click', function() {
        addCustomRange(rangesDiv);
        if (window.changeLanguage) window.changeLanguage(window.currentLanguage);
    });

    fileDiv.querySelector('.removeFileBtn').addEventListener('click', function() {
        if (customFilesContainer.querySelectorAll('.customFileItem').length > 1) {
            fileDiv.remove();
        } else {
            showStatus(getMessage('atLeastOneFileRequired'), 'error');
        }
    });

    customFilesContainer.appendChild(fileDiv);
    customFileCount++;
}

function addCustomRange(container) {
    let nextVal = 1;
    const existingRanges = container.querySelectorAll('.customRangeItem');
    
    // Auto-increment logic: Start from the end of the previous range within this specific file
    if (existingRanges.length > 0) {
        const lastEndInput = existingRanges[existingRanges.length - 1].querySelector('.customEndPage');
        const lastEndPage = parseInt(lastEndInput.value) || 0;
        nextVal = lastEndPage + 1;
    }

    // Pre-validate max limits if a PDF is already loaded
    if (totalPdfPages > 0 && nextVal > totalPdfPages) {
        nextVal = totalPdfPages;
    }

    const rangeDiv = document.createElement('div');
    rangeDiv.className = 'customRangeItem';
    rangeDiv.innerHTML = `
        <div>
            <label class="langText" data-i18n="startPageLabel">Start page:</label>
            <input type="number" class="customStartPage" min="1" value="${nextVal}" max="${totalPdfPages > 0 ? totalPdfPages : ''}" required>
        </div>
        <div>
            <label class="langText" data-i18n="endPageLabel">End page:</label>
            <input type="number" class="customEndPage" min="1" value="${nextVal}" max="${totalPdfPages > 0 ? totalPdfPages : ''}" required>
        </div>
        <button type="button" class="removeCustomRangeBtn langText" data-i18n="removeBtn">Remove</button>
    `;

    // Attach real-time validation to inputs
    const startInput = rangeDiv.querySelector('.customStartPage');
    const endInput = rangeDiv.querySelector('.customEndPage');
    attachRangeListeners(startInput, endInput);

    rangeDiv.querySelector('.removeCustomRangeBtn').addEventListener('click', function() {
        if (container.querySelectorAll('.customRangeItem').length > 1) {
            rangeDiv.remove();
        } else {
            showStatus(getMessage('eachFileMustHaveRange'), 'error');
        }
    });
    container.appendChild(rangeDiv);
}

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
}

function updateFileSizeInfo() {
    const file = pdfFile.files[0];
    if (file && fileSizeInfo) {
        fileSizeInfo.textContent = getMessage('currentFileSize') + formatFileSize(file.size);
        fileSizeInfo.style.display = 'block';
    } else if (fileSizeInfo) {
        fileSizeInfo.style.display = 'none';
    }
}

function formatFileSize(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
}