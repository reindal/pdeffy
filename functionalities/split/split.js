const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const { ipcRenderer } = require('electron');

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
    const outputNamePrefix = document.getElementById('outputName').value || 'split';
    const splitMode = document.querySelector('input[name="splitMode"]:checked').value;

    if (!file) {
        showStatus('Please select a PDF file', 'error');
        return;
    }

    showStatus('Processing...', 'success');
    submitBtn.disabled = true;

    try {
        const fileBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(fileBuffer);
        const totalPages = pdfDoc.getPageCount();

        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');

        let successCount = 0;

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
                    showStatus('Page numbers must be greater than 0', 'error');
                    submitBtn.disabled = false;
                    return;
                }

                if (startPage > endPage) {
                    showStatus('Start page cannot be greater than end page', 'error');
                    submitBtn.disabled = false;
                    return;
                }

                if (startPage > totalPages || endPage > totalPages) {
                    showStatus(`PDF has only ${totalPages} pages. Please select valid page range.`, 'error');
                    submitBtn.disabled = false;
                    return;
                }

                ranges.push({ startPage, endPage });
            }

            if (ranges.length === 0) {
                showStatus('Please add at least one page range', 'error');
                submitBtn.disabled = false;
                return;
            }

            for (let i = 0; i < ranges.length; i++) {
                const range = ranges[i];
                const newPdf = await PDFDocument.create();

                for (let pageIdx = range.startPage - 1; pageIdx < range.endPage; pageIdx++) {
                    const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIdx]);
                    newPdf.addPage(copiedPage);
                }

                const newPdfBytes = await newPdf.save();
                const outputFileName = `${outputNamePrefix}_${i + 1}.pdf`;
                const filePath = path.join(downloadsPath, outputFileName);
                await fs.writeFile(filePath, newPdfBytes);
                successCount++;
            }

        } else if (splitMode === 'every') {
            const interval = parseInt(document.getElementById('pagesInterval').value);

            if (interval < 1) {
                showStatus('Interval must be at least 1', 'error');
                submitBtn.disabled = false;
                return;
            }

            let currentPage = 0;
            let fileIndex = 1;

            while (currentPage < totalPages) {
                const newPdf = await PDFDocument.create();
                const endPage = Math.min(currentPage + interval, totalPages);

                for (let pageIdx = currentPage; pageIdx < endPage; pageIdx++) {
                    const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIdx]);
                    newPdf.addPage(copiedPage);
                }

                const newPdfBytes = await newPdf.save();
                const outputFileName = `${outputNamePrefix}_${fileIndex}.pdf`;
                const filePath = path.join(downloadsPath, outputFileName);
                await fs.writeFile(filePath, newPdfBytes);

                currentPage = endPage;
                fileIndex++;
                successCount++;
            }

        } else if (splitMode === 'custom') {
            const customFileItems = document.querySelectorAll('.customFileItem');

            if (customFileItems.length === 0) {
                showStatus('Please add at least one output file', 'error');
                submitBtn.disabled = false;
                return;
            }

            for (let i = 0; i < customFileItems.length; i++) {
                const fileItem = customFileItems[i];
                const rangeItems = fileItem.querySelectorAll('.customRangeItem');
                const newPdf = await PDFDocument.create();

                for (let rangeItem of rangeItems) {
                    const startInput = rangeItem.querySelector('.customStartPage');
                    const endInput = rangeItem.querySelector('.customEndPage');
                    const startPage = parseInt(startInput.value);
                    const endPage = parseInt(endInput.value);

                    if (startPage < 1 || endPage < 1) {
                        showStatus('Page numbers must be greater than 0', 'error');
                        submitBtn.disabled = false;
                        return;
                    }

                    if (startPage > endPage) {
                        showStatus('Start page cannot be greater than end page', 'error');
                        submitBtn.disabled = false;
                        return;
                    }

                    if (startPage > totalPages || endPage > totalPages) {
                        showStatus(`PDF has only ${totalPages} pages. Please select valid page range.`, 'error');
                        submitBtn.disabled = false;
                        return;
                    }

                    for (let pageIdx = startPage - 1; pageIdx < endPage; pageIdx++) {
                        const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIdx]);
                        newPdf.addPage(copiedPage);
                    }
                }

                const newPdfBytes = await newPdf.save();
                const outputFileName = `${outputNamePrefix}_${i + 1}.pdf`;
                const filePath = path.join(downloadsPath, outputFileName);
                await fs.writeFile(filePath, newPdfBytes);
                successCount++;
            }
        } else if (splitMode === 'size') {
            const maxSize = parseFloat(document.getElementById('maxFileSize').value);
            const sizeUnit = document.getElementById('sizeUnit').value;

            if (maxSize <= 0 || isNaN(maxSize)) {
                showStatus('Please enter a valid file size', 'error');
                submitBtn.disabled = false;
                return;
            }

            // Convert to bytes
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

            // Calculate minimum page size to check if split is possible
            let minPageSize = Infinity;
            let maxPageSize = 0;

            for (let i = 0; i < totalPages; i++) {
                const singlePagePdf = await PDFDocument.create();
                const [copiedPage] = await singlePagePdf.copyPages(pdfDoc, [i]);
                singlePagePdf.addPage(copiedPage);
                const singlePageBytes = await singlePagePdf.save();

                if (singlePageBytes.length < minPageSize) {
                    minPageSize = singlePageBytes.length;
                }
                if (singlePageBytes.length > maxPageSize) {
                    maxPageSize = singlePageBytes.length;
                }
            }

            // Check if the requested size is too small
            if (maxBytes < minPageSize) {
                const minSizeFormatted = formatFileSize(minPageSize);
                const lang = localStorage.getItem('language') || 'en';
                const errorMessages = {
                    en: `Cannot split: minimum required size is ${minSizeFormatted} (smallest page size)`,
                    it: `Impossibile dividere: la dimensione minima richiesta è ${minSizeFormatted} (dimensione pagina più piccola)`,
                    pl: `Nie można podzielić: minimalny wymagany rozmiar to ${minSizeFormatted} (rozmiar najmniejszej strony)`
                };
                showStatus(errorMessages[lang] || errorMessages.en, 'error');
                submitBtn.disabled = false;
                return;
            }

            let currentPage = 0;
            let fileIndex = 1;

            while (currentPage < totalPages) {
                let newPdf = await PDFDocument.create();
                let currentSize = 0;
                let pagesInCurrentFile = 0;

                while (currentPage < totalPages) {
                    // Create a temporary PDF with current pages + next page
                    const tempPdf = await PDFDocument.create();

                    // Copy all pages we already have
                    if (pagesInCurrentFile > 0) {
                        const existingBytes = await newPdf.save();
                        const existingPdf = await PDFDocument.load(existingBytes);
                        const existingPages = await tempPdf.copyPages(existingPdf, existingPdf.getPageIndices());
                        existingPages.forEach(page => tempPdf.addPage(page));
                    }

                    // Add the next page
                    const [nextPage] = await tempPdf.copyPages(pdfDoc, [currentPage]);
                    tempPdf.addPage(nextPage);

                    const tempBytes = await tempPdf.save();

                    // Check if adding this page would exceed the limit
                    if (pagesInCurrentFile > 0 && tempBytes.length > maxBytes) {
                        // Don't add this page, save current file and start new one
                        break;
                    }

                    // If even a single page exceeds the limit, we still need to save it
                    if (pagesInCurrentFile === 0 && tempBytes.length > maxBytes) {
                        const [copiedPage] = await newPdf.copyPages(pdfDoc, [currentPage]);
                        newPdf.addPage(copiedPage);
                        currentPage++;
                        pagesInCurrentFile++;
                        break;
                    }

                    // Add the page to our actual PDF
                    const [copiedPage] = await newPdf.copyPages(pdfDoc, [currentPage]);
                    newPdf.addPage(copiedPage);
                    currentPage++;
                    pagesInCurrentFile++;
                    currentSize = tempBytes.length;
                }

                if (pagesInCurrentFile > 0) {
                    const newPdfBytes = await newPdf.save();
                    const outputFileName = `${outputNamePrefix}_${fileIndex}.pdf`;
                    const filePath = path.join(downloadsPath, outputFileName);
                    await fs.writeFile(filePath, newPdfBytes);
                    fileIndex++;
                    successCount++;
                }
            }
        }

        showStatus(`✓ Successfully created ${successCount} file(s) in Downloads folder!`, 'success');
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
        showStatus(`Error: ${error.message}`, 'error');
        submitBtn.disabled = false;
    }
});

function addRange() {
    const rangeDiv = document.createElement('div');
    rangeDiv.className = 'rangeItem';
    rangeDiv.innerHTML = `
        <div>
            <label>Start page:</label>
            <input type="number" class="startPage" min="1" value="${rangeCount}" required>
        </div>
        <div>
            <label>End page:</label>
            <input type="number" class="endPage" min="1" value="${rangeCount}" required>
        </div>
        <button type="button" class="removeRangeBtn">Remove</button>
    `;

    const removeBtn = rangeDiv.querySelector('.removeRangeBtn');
    removeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (rangesContainer.querySelectorAll('.rangeItem').length > 1) {
            rangeDiv.remove();
        } else {
            showStatus('You must have at least one range', 'error');
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
            <h4>Output File #${customFileCount}</h4>
            <button type="button" class="removeFileBtn">Remove File</button>
        </div>
        <div class="customFileRanges"></div>
        <button type="button" class="addCustomRangeBtn">+ Add Range to This File</button>
    `;

    const rangesDiv = fileDiv.querySelector('.customFileRanges');

    addCustomRange(rangesDiv);

    const addRangeButton = fileDiv.querySelector('.addCustomRangeBtn');
    addRangeButton.addEventListener('click', function(e) {
        e.preventDefault();
        addCustomRange(rangesDiv);
    });

    const removeFileButton = fileDiv.querySelector('.removeFileBtn');
    removeFileButton.addEventListener('click', function(e) {
        e.preventDefault();
        if (customFilesContainer.querySelectorAll('.customFileItem').length > 1) {
            fileDiv.remove();
        } else {
            showStatus('You must have at least one output file', 'error');
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
            <label>Start page:</label>
            <input type="number" class="customStartPage" min="1" value="1" required>
        </div>
        <div>
            <label>End page:</label>
            <input type="number" class="customEndPage" min="1" value="1" required>
        </div>
        <button type="button" class="removeCustomRangeBtn">Remove</button>
    `;  

    const removeBtn = rangeDiv.querySelector('.removeCustomRangeBtn');
    removeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (container.querySelectorAll('.customRangeItem').length > 1) {
            rangeDiv.remove();
        } else {
            showStatus('Each file must have at least one range', 'error');
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
            pl: 'Rozmiar pliku: '
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

