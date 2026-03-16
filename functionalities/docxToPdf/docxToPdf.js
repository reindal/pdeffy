var { ipcRenderer } = require('electron');
const path = require('path');
const STATUS = '#status';

const form = document.getElementById('docxToPdfForm');
const docxFileInput = document.getElementById('docxFile');
const submitBtn = document.getElementById('submitBtn');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const fileInfo = document.getElementById('fileInfo');

docxFileInput.addEventListener('change', function (e) {
    if (e.target.files.length > 0) {
        fileInfo.style.display = 'block';
        fileNameDisplay.textContent = e.target.files[0].name;
    }
});

form.addEventListener('submit', async function (e) {
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

        StatusManager.show(STATUS, 'processing', 'processing');

        await ipcRenderer.invoke('convert-with-libreoffice', {
            fileData: arrayBuffer,
            fileName: file.name,
            outputPath: outputPath,
            metadata: finalMetadata
        });

        StatusManager.show(STATUS, 'success', 'successPdfCreated', {
            filename: path.basename(outputPath),
            savePath: outputPath
        });

        setTimeout(() => CustomMetadataModule.reset(), 2000);

    } catch (error) {
        console.error(error);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
    } finally {
        submitBtn.disabled = false;
    }
});