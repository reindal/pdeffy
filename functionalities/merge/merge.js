const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const { ipcRenderer } = require('electron');

const form = document.getElementById('mergeForm');
const pdfFiles = document.getElementById('pdfFiles');
const filesList = document.getElementById('filesList');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const filesOrderContainer = document.getElementById('filesOrderContainer');

let selectedFiles = [];

pdfFiles.addEventListener('change', function(e) {
    selectedFiles = Array.from(e.target.files);
    updateFilesList();
    updateFilesOrder();
});

function updateFilesList() {
    filesList.innerHTML = '';

    if (selectedFiles.length > 0) {
        filesList.classList.add('active');
        selectedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'fileItem';
            fileItem.textContent = `${index + 1}. ${file.name}`;
            filesList.appendChild(fileItem);
        });
    } else {
        filesList.classList.remove('active');
    }
}

function updateFilesOrder() {
    filesOrderContainer.innerHTML = '';

    selectedFiles.forEach((file, index) => {
        const fileOrderItem = document.createElement('div');
        fileOrderItem.className = 'fileOrderItem';
        fileOrderItem.draggable = true;
        fileOrderItem.dataset.index = index;

        fileOrderItem.innerHTML = `
            <div class="fileOrderIndex">${index + 1}</div>
            <div class="fileOrderName">${file.name}</div>
            <button type="button" class="fileOrderRemove" data-index="${index}">Remove</button>
        `;

        const removeBtn = fileOrderItem.querySelector('.fileOrderRemove');
        removeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            selectedFiles.splice(index, 1);
            updateFilesList();
            updateFilesOrder();
            pdfFiles.value = '';
        });

        fileOrderItem.addEventListener('dragstart', handleDragStart);
        fileOrderItem.addEventListener('dragover', handleDragOver);
        fileOrderItem.addEventListener('drop', handleDrop);
        fileOrderItem.addEventListener('dragend', handleDragEnd);
        fileOrderItem.addEventListener('dragleave', handleDragLeave);

        filesOrderContainer.appendChild(fileOrderItem);
    });
}

let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (this !== draggedItem) {
        this.classList.add('dragover');
    }
}

function handleDragLeave(e) {
    this.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();

    if (this !== draggedItem) {
        this.classList.remove('dragover');

        const allItems = Array.from(filesOrderContainer.querySelectorAll('.fileOrderItem'));
        const draggedIndex = parseInt(draggedItem.dataset.index);
        const targetIndex = parseInt(this.dataset.index);

        const draggedFile = selectedFiles[draggedIndex];
        selectedFiles.splice(draggedIndex, 1);
        selectedFiles.splice(targetIndex, 0, draggedFile);

        updateFilesOrder();
    }
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.fileOrderItem').forEach(item => {
        item.classList.remove('dragover');
    });
}

form.addEventListener('submit', async function(e) {
    e.preventDefault();

    const outputNamePrefix = document.getElementById('outputName').value || 'merged_document';

    if (selectedFiles.length === 0) {
        showStatus('Please select at least one PDF file', 'error');
        return;
    }

    if (selectedFiles.length === 1) {
        showStatus('Please select at least two PDF files to merge', 'error');
        return;
    }

    showStatus(`Processing ${selectedFiles.length} file(s)...`, 'success');
    submitBtn.disabled = true;

    try {
        const mergedPdf = await PDFDocument.create();

        for (let file of selectedFiles) {
            const fileBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(fileBuffer);

            const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            pages.forEach(page => {
                mergedPdf.addPage(page);
            });
        }

        const mergedPdfBytes = await mergedPdf.save();

        // Use Electron API to get downloads path
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');

        const outputFileName = `${outputNamePrefix}.pdf`;
        const filePath = path.join(downloadsPath, outputFileName);

        await fs.writeFile(filePath, mergedPdfBytes);

        showStatus(`✓ Successfully created merged PDF: ${outputFileName} in Downloads folder!`, 'success');
        submitBtn.disabled = false;

        form.reset();
        selectedFiles = [];
        updateFilesList();
        updateFilesOrder();
        pdfFiles.value = '';

    } catch (error) {
        console.error('Error merging PDFs:', error);
        showStatus(`Error: ${error.message}`, 'error');
        submitBtn.disabled = false;
    }
});

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
}
