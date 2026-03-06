var { ipcRenderer } = require('electron');
const path = require('path');

const form = document.getElementById('pptxToPdfForm');
const pptxFileInput = document.getElementById('pptxFile');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const fileInfo = document.getElementById('fileInfo');

const addMetadataCheckbox = document.getElementById('addMetadataCheckbox');
const metadataFieldsDiv = document.getElementById('metadataFields');
const metadataTitleInput = document.getElementById('metadataTitleInput');
const metadataDescriptionInput = document.getElementById('metadataDescriptionInput');

if (addMetadataCheckbox && metadataFieldsDiv) {
    addMetadataCheckbox.addEventListener('change', function() {
        if (this.checked) {
            metadataFieldsDiv.classList.add('visible');
        } else {
            metadataFieldsDiv.classList.remove('visible');
        }
    });
}

pptxFileInput.addEventListener('change', function (e) {
    if (e.target.files.length > 0) {
        fileInfo.style.display = 'block';
        fileNameDisplay.textContent = getLocalMessage('selectedFile') + e.target.files[0].name;
    }
});

form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!pptxFileInput.files[0]) return;

    const file = pptxFileInput.files[0];
    const arrayBuffer = await file.arrayBuffer();

    submitBtn.disabled = true;

    try {
        const globalMetadata = await ipcRenderer.invoke('get-pdf-metadata');
        let finalMetadata = { author: globalMetadata.author || '' };

        if (addMetadataCheckbox && addMetadataCheckbox.checked) {
            finalMetadata.title = metadataTitleInput ? metadataTitleInput.value.trim() : '';
            finalMetadata.subject = metadataDescriptionInput ? metadataDescriptionInput.value.trim() : '';
        } else {
            finalMetadata.title = globalMetadata.title || '';
            finalMetadata.subject = globalMetadata.subject || '';
        }

        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const defaultPath = path.join(downloadsPath, file.name.replace('.pptx', '.pdf'));
        
        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: defaultPath,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (!outputPath) {
            submitBtn.disabled = false;
            return;
        }

        showStatus(getLocalMessage('convertingPptx'), 'info');

        await ipcRenderer.invoke('convert-with-libreoffice', {
            fileData: arrayBuffer,
            fileName: file.name,
            outputPath: outputPath,
            format: 'pdf',
            metadata: finalMetadata
        });

        showStatus(getLocalMessage('successPptxCreated'), 'success');
        
        setTimeout(() => {
            if (metadataTitleInput) metadataTitleInput.value = '';
            if (metadataDescriptionInput) metadataDescriptionInput.value = '';
            if (addMetadataCheckbox) addMetadataCheckbox.checked = false;
            if (metadataFieldsDiv) metadataFieldsDiv.classList.remove('visible');
        }, 2000);

    } catch (error) {
        console.error(error);
        showStatus(getLocalMessage('errorPptx') + error.message, 'error');
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
        convertingPptx: "Converting PowerPoint to PDF...",
        successPptxCreated: "✓ PDF created successfully",
        errorPptx: "Error converting PPTX: "
    };
    return fallbackMessages[key] || key;
}