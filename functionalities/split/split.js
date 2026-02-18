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

let rangeCount = 1;
let customFileCount = 1;

addRange();
addCustomFile();
updateLanguage();

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
    updateLanguage();
});

addCustomFileBtn.addEventListener('click', function(e) {
    e.preventDefault();
    addCustomFile();
});

pdfFile.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        fileNameDisplay.textContent = '✓ Selected file: ' + e.target.files[0].name;
        fileNameDisplay.classList.add('active');
        updateFileSizeInfo();
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
                const startInput = item.querySelector('.startPage');
                const endInput = item.querySelector('.endPage');
                const startPage = parseInt(startInput.value);
                const endPage = parseInt(endInput.value);

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
                    showStatus(getMessage('pdfHasOnlyPages'), 'error');
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

            for (let i = 0; i < ranges.length; i++) {
                const range = ranges[i];
                const newPdf = await PDFDocument.create();

                const metadata = await ipcRenderer.invoke('get-pdf-metadata');
                if (metadata.author) newPdf.setAuthor(metadata.author);
                if (metadata.title) newPdf.setTitle(metadata.title);
                if (metadata.subject) newPdf.setSubject(metadata.subject);

                for (let pageIdx = range.startPage - 1; pageIdx < range.endPage; pageIdx++) {
                    const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIdx]);
                    newPdf.addPage(copiedPage);
                }

                const newPdfBytes = await newPdf.save();
                pdfFiles.push(newPdfBytes);
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

                const metadata = await ipcRenderer.invoke('get-pdf-metadata');
                if (metadata.author) newPdf.setAuthor(metadata.author);
                if (metadata.title) newPdf.setTitle(metadata.title);
                if (metadata.subject) newPdf.setSubject(metadata.subject);

                const endPage = Math.min(currentPage + interval, totalPages);

                for (let pageIdx = currentPage; pageIdx < endPage; pageIdx++) {
                    const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIdx]);
                    newPdf.addPage(copiedPage);
                }

                const newPdfBytes = await newPdf.save();
                pdfFiles.push(newPdfBytes);

                currentPage = endPage;
            }

        } else if (splitMode === 'custom') {
            const customFileItems = document.querySelectorAll('.customFileItem');

            if (customFileItems.length === 0) {
                showStatus(getMessage('pleaseAddAtLeastOneOutputFile'), 'error');
                submitBtn.disabled = false;
                return;
            }

            for (let i = 0; i < customFileItems.length; i++) {
                const fileItem = customFileItems[i];
                const rangeItems = fileItem.querySelectorAll('.customRangeItem');
                const newPdf = await PDFDocument.create();

                const metadata = await ipcRenderer.invoke('get-pdf-metadata');
                if (metadata.author) newPdf.setAuthor(metadata.author);
                if (metadata.title) newPdf.setTitle(metadata.title);
                if (metadata.subject) newPdf.setSubject(metadata.subject);

                for (let rangeItem of rangeItems) {
                    const startInput = rangeItem.querySelector('.customStartPage');
                    const endInput = rangeItem.querySelector('.customEndPage');
                    const startPage = parseInt(startInput.value);
                    const endPage = parseInt(endInput.value);

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
                        showStatus(getMessage('pdfHasOnlyPages'), 'error');
                        submitBtn.disabled = false;
                        return;
                    }

                    for (let pageIdx = startPage - 1; pageIdx < endPage; pageIdx++) {
                        const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIdx]);
                        newPdf.addPage(copiedPage);
                    }
                }

                const newPdfBytes = await newPdf.save();
                pdfFiles.push(newPdfBytes);
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

                const metadata = await ipcRenderer.invoke('get-pdf-metadata');
                if (metadata.author) newPdf.setAuthor(metadata.author);
                if (metadata.title) newPdf.setTitle(metadata.title);
                if (metadata.subject) newPdf.setSubject(metadata.subject);

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

            for (let i = 0; i < pdfFiles.length; i++) {
                const fileName = `${baseName}_${i + 1}.pdf`;
                zip.file(fileName, pdfFiles[i]);
            }

            const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
            await fs.writeFile(outputPath, zipContent);

            outputFolder = path.dirname(outputPath);
            showStatus(getMessage('successSplitFilesZip', { count: pdfFiles.length, path: outputFolder }), 'success');

        } else {
            // Save as PDF dialog
            outputPath = await ipcRenderer.invoke('show-save-dialog', {
                defaultPath: path.join(downloadsPath, `${originalFileName}.pdf`),
                filters: [
                    { name: 'PDF Files', extensions: ['pdf'] }
                ]
            });

            if (!outputPath) {
                showStatus(getMessage('saveCancelled'), 'info');
                submitBtn.disabled = false;
                return;
            }

            outputFolder = path.dirname(outputPath);
            baseName = path.basename(outputPath, '.pdf');

            // Save all PDF files
            for (let i = 0; i < pdfFiles.length; i++) {
                const fileName = `${baseName}_${i + 1}.pdf`;
                const filePath = path.join(outputFolder, fileName);
                await fs.writeFile(filePath, pdfFiles[i]);
            }

            showStatus(getMessage('successSplitFilesPath', { count: pdfFiles.length, path: outputFolder }), 'success');
        }

        submitBtn.disabled = false;

        form.reset();
        fileNameDisplay.classList.remove('active');

        // Reset range mode
        rangesContainer.innerHTML = '';
        rangeCount = 1;
        addRange();

        customFilesContainer.innerHTML = '';
        customFileCount = 1;
        addCustomFile();

        rangeModeContainer.style.display = 'block';
        everyModeContainer.style.display = 'none';
        customModeContainer.style.display = 'none';
        sizeModeContainer.style.display = 'none';

    } catch (error) {
        console.error('Error splitting PDF:', error);
        showStatus(getMessage('errorPrefix') + error.message, 'error');
        submitBtn.disabled = false;
    }
});

function addRange() {
    const rangeDiv = document.createElement('div');
    rangeDiv.className = 'rangeItem';
    rangeDiv.innerHTML = `
        <div>
            <label class="langText" data-i18n="startPageLabel">Start page:</label>
            <input type="number" class="startPage" min="1" value="${rangeCount}" required>
        </div>
        <div>
            <label class="langText" data-i18n="endPageLabel">End page:</label>
            <input type="number" class="endPage" min="1" value="${rangeCount}" required>
        </div>
        <button type="button" class="removeRangeBtn langText" data-i18n="removeBtn">Remove</button>
    `;

    const removeBtn = rangeDiv.querySelector('.removeRangeBtn');
    removeBtn.addEventListener('click', function(e) {
        e.preventDefault();
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
    
    const addRangeButton = fileDiv.querySelector('.addCustomRangeBtn');
    addRangeButton.addEventListener('click', function(e) {
        e.preventDefault();
        addCustomRange(rangesDiv);
        updateLanguage();
    });

    const removeFileButton = fileDiv.querySelector('.removeFileBtn');
    removeFileButton.addEventListener('click', function(e) {
        e.preventDefault();
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
    const rangeDiv = document.createElement('div');
    rangeDiv.className = 'customRangeItem';
    rangeDiv.innerHTML = `
        <div>
            <label class="langText" data-i18n="startPageLabel">Start page:</label>
            <input type="number" class="customStartPage" min="1" value="1" required>
        </div>
        <div>
            <label class="langText" data-i18n="endPageLabel">End page:</label>
            <input type="number" class="customEndPage" min="1" value="1" required>
        </div>
        <button type="button" class="removeCustomRangeBtn langText" data-i18n="removeBtn">Remove</button>
    `;

    const removeBtn = rangeDiv.querySelector('.removeCustomRangeBtn');
    removeBtn.addEventListener('click', function(e) {
        e.preventDefault();
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
        const sizeInBytes = file.size;
        let sizeText = formatFileSize(sizeInBytes);

        const lang = localStorage.getItem('language') || 'en';
        const fileSizeLabels = {
            en: 'Current file size: ',
            it: 'Dimensione file: ',
            pl: 'Rozmiar pliku: ',
            es: 'Tamaño del archivo:'
        };

        fileSizeInfo.textContent = (fileSizeLabels[lang] || fileSizeLabels.en) + sizeText;
        fileSizeInfo.style.display = 'block';
    } else if (fileSizeInfo) {
        fileSizeInfo.style.display = 'none';
    }
}

function formatFileSize(bytes) {
    if (bytes >= 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    } else if (bytes >= 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    } else if (bytes >= 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    } else {
        return bytes + ' B';
    }
}

function updateLanguage() {
    const lang = localStorage.getItem('language') || 'en';
    changeLanguage(lang);
}