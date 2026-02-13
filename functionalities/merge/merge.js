const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');

const form = document.getElementById('mergeForm');
const pdfFiles = document.getElementById('pdfFiles');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const filesOrderContainer = document.getElementById('filesOrderContainer');

let selectedFiles = [];

pdfFiles.addEventListener('change', function(e) {
    selectedFiles = Array.from(e.target.files);
    updateFilesOrder();
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
            <button type="button" class="fileOrderRemove" data-index="${index}">Remove</button>
        `;

        const removeBtn = fileOrderItem.querySelector('.fileOrderRemove');
        removeBtn.addEventListener('click', function(e) {
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

form.addEventListener('submit', async function(e) {
    e.preventDefault();

    const outputNamePrefix = document.getElementById('outputName').value || 'merged_document';

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

        // Get metadata from environment variables
        const metadata = await ipcRenderer.invoke('get-pdf-metadata');
        if (metadata.author) mergedPdf.setAuthor(metadata.author);
        if (metadata.title) mergedPdf.setTitle(metadata.title);
        if (metadata.subject) mergedPdf.setSubject(metadata.subject);

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

        // Set read-only if checkbox is checked
        const readOnlyCheckbox = document.getElementById('readOnlyCheckbox');
        if (readOnlyCheckbox && readOnlyCheckbox.checked) {
            try {
                await ipcRenderer.invoke('set-file-readonly', filePath);
            } catch (error) {
                console.error('Error setting read-only:', error);
            }
        }

        showStatus(getMessage('successMerged', { filename: outputFileName }), 'success');
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

// Helper function to get translated message
function getMessage(key, params = {}) {
    const lang = localStorage.getItem('language') || 'en';
    const messages = {
        en: {
            pleaseSelectAtLeastOnePdf: "Please select at least one PDF file",
            pleaseSelectAtLeastTwoPdfs: "Please select at least two PDF files to merge",
            processingFiles: "Processing {count} file(s)...",
            successMerged: "✓ Successfully created merged PDF: {filename} in Downloads folder!",
            errorPrefix: "Error: "
        },
        it: {
            pleaseSelectAtLeastOnePdf: "Seleziona almeno un file PDF",
            pleaseSelectAtLeastTwoPdfs: "Seleziona almeno due file PDF da unire",
            processingFiles: "Elaborazione di {count} file...",
            successMerged: "✓ PDF unito creato con successo: {filename} nella cartella Download!",
            errorPrefix: "Errore: "
        },
        pl: {
            pleaseSelectAtLeastOnePdf: "Proszę wybrać co najmniej jeden plik PDF",
            pleaseSelectAtLeastTwoPdfs: "Proszę wybrać co najmniej dwa pliki PDF do scalenia",
            processingFiles: "Przetwarzanie {count} plik(ów)...",
            successMerged: "✓ Pomyślnie utworzono scalony PDF: {filename} w folderze Pobrane!",
            errorPrefix: "Błąd: "
        }
    };

    let message = (messages[lang] && messages[lang][key]) || messages['en'][key] || key;

    Object.keys(params).forEach(param => {
        message = message.replace(`{${param}}`, params[param]);
    });

    return message;
}

