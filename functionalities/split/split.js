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

let rangeCount = 1;

addRange();

addRangeBtn.addEventListener('click', function(e) {
    e.preventDefault();
    addRange();
});

pdfFile.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        fileNameDisplay.textContent = languages[localStorage.getItem("language")].selectedFile + e.target.files[0].name;
        fileNameDisplay.classList.add('active');
    }
});

form.addEventListener('submit', async function(e) {
    e.preventDefault();

    const file = pdfFile.files[0];
    const outputNamePrefix = document.getElementById('outputName').value;

    const rangeItems = document.querySelectorAll('.rangeItem');
    const ranges = [];

    for (let item of rangeItems) {
        const startInput = item.querySelector('.startPage');
        const endInput = item.querySelector('.endPage');

        const startPage = parseInt(startInput.value);
        const endPage = parseInt(endInput.value);

        if (startPage < 1 || endPage < 1) {
            showStatus('Page numbers must be greater than 0', 'error');
            return;
        }

        if (startPage > endPage) {
            showStatus('Start page cannot be greater than end page', 'error');
            return;
        }

        ranges.push({ startPage, endPage });
    }

    if (ranges.length === 0) {
        showStatus('Please add at least one page range', 'error');
        return;
    }

    if (!file) {
        showStatus('Please select a PDF file', 'error');
        return;
    }

    showStatus(`Processing ${ranges.length} range(s)...`, 'success');
    submitBtn.disabled = true;

    try {
        const fileBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(fileBuffer);

        const totalPages = pdfDoc.getPageCount();

        for (let range of ranges) {
            if (range.startPage > totalPages || range.endPage > totalPages) {
                showStatus(`PDF has only ${totalPages} pages. Please select valid page range.`, 'error');
                submitBtn.disabled = false;
                return;
            }
        }

        // Use Electron API to get downloads path
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');

        let successCount = 0;
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

        showStatus(languages[localStorage.getItem("language")].createdSuccesful.replace('${successCount}', successCount), 'success');
        submitBtn.disabled = false;

        form.reset();
        fileNameDisplay.classList.remove('active');
        rangesContainer.innerHTML = '';
        rangeCount = 1;
        addRange();

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
            <label id="startPageLabel" class="langText">${languages[localStorage.getItem("language")].startPageLabel}</label>
            <input type="number" class="startPage" min="1" value="${rangeCount}" required>
        </div>
        <div>
            <label id="endPageLabel" class="langText">${languages[localStorage.getItem("language")].endPageLabel}</label>
            <input type="number" class="endPage" min="1" value="${rangeCount}" required>
        </div>
        <button type="button" class="removeRangeBtn langText" id="removeBtn">${languages[localStorage.getItem("language")].removeBtn}</button>
    `;

    const removeBtn = rangeDiv.querySelector('.removeRangeBtn');
    removeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (rangesContainer.querySelectorAll('.rangeItem').length > 1) {
            rangeDiv.remove();
        } else {
            let statusMsg = languages[localStorage.getItem("language")].rangeError || 'At least one range is required';
            showStatus(statusMsg, 'error');
        }
    });

    rangesContainer.appendChild(rangeDiv);
    rangeCount++;
}

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
}