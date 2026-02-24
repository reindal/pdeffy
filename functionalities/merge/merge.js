const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');

const form = document.getElementById('mergeForm');
const pdfFiles = document.getElementById('pdfFiles');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const filesOrderContainer = document.getElementById('filesOrderContainer');

// Custom metadata toggle
const addMetadataCheckbox = document.getElementById('addMetadataCheckbox');
const metadataFieldsDiv = document.getElementById('metadataFields');
const metadataTitleInput = document.getElementById('metadataTitleInput');
const metadataDescriptionInput = document.getElementById('metadataDescriptionInput');

let selectedFiles = [];

addMetadataCheckbox.addEventListener('change', function() {
    if (this.checked) {
        metadataFieldsDiv.classList.add('visible');
    } else {
        metadataFieldsDiv.classList.remove('visible');
    }
});

pdfFiles.addEventListener('change', function (e) {
    const newFiles = Array.from(e.target.files);
    selectedFiles = [...selectedFiles, ...newFiles];
    updateFilesOrder();
    pdfFiles.value = '';
});


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
            <button type="button" class="fileOrderRemove" data-i18n="removeBtn" data-index="${index}">Remove</button>
        `;

        const removeBtn = fileOrderItem.querySelector('.fileOrderRemove');
        removeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            selectedFiles.splice(index, 1);
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

form.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (selectedFiles.length === 0) {
        showStatus(getMessage('pleaseSelectAtLeastOnePdf'), 'error');
        return;
    }

    if (selectedFiles.length === 1) {
        showStatus(getMessage('pleaseSelectAtLeastTwoPdfs'), 'error');
        return;
    }

    showStatus(getMessage('processingFiles', { count: selectedFiles.length }), 'success');
    submitBtn.disabled = true;

    try {
        const mergedPdf = await PDFDocument.create();

        // Get metadata from global settings
        const metadata = await ipcRenderer.invoke('get-pdf-metadata');

        // Always set author from global settings
        if (metadata.author) {
            mergedPdf.setAuthor(metadata.author);
        }

        // Check if custom metadata is enabled
        if (addMetadataCheckbox && addMetadataCheckbox.checked) {
            // Use custom metadata from form fields for Title and Subject (only if not empty)
            const customTitle = metadataTitleInput ? metadataTitleInput.value.trim() : '';
            const customDescription = metadataDescriptionInput ? metadataDescriptionInput.value.trim() : '';

            if (customTitle) {
                mergedPdf.setTitle(customTitle);
            }
            if (customDescription) {
                mergedPdf.setSubject(customDescription);
            }
        } else {
            // Use global settings for Title and Subject
            if (metadata.title) {
                mergedPdf.setTitle(metadata.title);
            }
            if (metadata.subject) {
                mergedPdf.setSubject(metadata.subject);
            }
        }

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
        const defaultFileName = 'merged_document.pdf';
        const defaultPath = path.join(downloadsPath, defaultFileName);

        const filePath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: defaultPath,
            filters: [
                { name: 'PDF Files', extensions: ['pdf'] }
            ]
        });

        if (!filePath) {
            showStatus('saveCancelled', 'error');
            submitBtn.disabled = false;
            return;
        }

        await fs.writeFile(filePath, mergedPdfBytes);

        // Set read-only if checkbox is checked
        const readOnlyCheckbox = document.getElementById('readOnlyCheckbox');
        if (readOnlyCheckbox && readOnlyCheckbox.checked) {
            try {
                await ipcRenderer.invoke('set-file-readonly', filePath);
            } catch (error) {
                console.error('Error setting read-only:', error);
            }
        }

        showStatus(getMessage('successMerged', { filename: path.basename(filePath) }), 'success');
        submitBtn.disabled = false;

        form.reset();
        selectedFiles = [];
        updateFilesOrder();
        pdfFiles.value = '';

    } catch (error) {
        console.error('Error merging PDFs:', error);
        showStatus(getMessage('errorPrefix') + error.message, 'error');
        submitBtn.disabled = false;
    }
});

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
}

