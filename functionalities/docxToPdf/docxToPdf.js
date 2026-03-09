var { ipcRenderer } = require('electron');
const path = require('path');

const form = document.getElementById('docxToPdfForm');
const docxFileInput = document.getElementById('docxFile');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const fileInfo = document.getElementById('fileInfo');

docxFileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        fileInfo.style.display = 'block';
        fileNameDisplay.textContent = e.target.files[0].name;
    }
});

form.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!docxFileInput.files[0]) return;

    const file = docxFileInput.files[0];
    const arrayBuffer = await file.arrayBuffer();

    submitBtn.disabled = true;

    try {
        // Get final metadata from module
        const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);

        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const defaultPath = path.join(downloadsPath, file.name.replace('.docx', '.pdf'));
        
        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: defaultPath,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (!outputPath) {
            submitBtn.disabled = false;
            return; 
        }

        showStatus(getLocalMessage('convertingDocx'), 'info');

        await ipcRenderer.invoke('convert-with-libreoffice', {
            fileData: arrayBuffer,
            fileName: file.name,
            outputPath: outputPath,
            metadata: finalMetadata
        });

        showStatus(getLocalMessage('successDocxCreated'), 'success');
        
        setTimeout(() => {
            CustomMetadataModule.reset();
        }, 2000);

    } catch (error) {
        console.error(error);
        showStatus(getLocalMessage('errorDocx') + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
}

function getLocalMessage(key, params = {}) {
    if (typeof window.getMessage === 'function' && window.getMessage !== getLocalMessage) {
        return window.getMessage(key, params);
    }
    const fallbackMessages = {
        convertingDocx: "Converting DOCX to PDF (This might take a moment)...",
        successDocxCreated: "✓ PDF created successfully",
        errorDocx: "Error converting DOCX: "
    };
    return fallbackMessages[key] || key;
}