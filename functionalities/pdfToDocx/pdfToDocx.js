var { ipcRenderer } = require('electron');
const path = require('path');
const STATUS = '#status';

const form = document.getElementById('pdfToDocxForm');
const pdfFile = document.getElementById('pdfFile');
const fileNameDisplay = document.getElementById('fileName');
const submitBtn = document.getElementById('submitBtn');

let selectedFile = null;

pdfFile.addEventListener('change', function (e) {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        fileNameDisplay.textContent = selectedFile.name;
    }
});

form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!selectedFile) return;

    const arrayBuffer = await selectedFile.arrayBuffer();
    submitBtn.disabled = true;

    try {
        // Get final metadata from module
        const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const defaultPath = path.join(downloadsPath, selectedFile.name.replace('.pdf', '.docx'));

        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: defaultPath,
            filters: [{ name: 'Word Documents', extensions: ['docx'] }]
        });

        if (!outputPath) {
            submitBtn.disabled = false;
            return;
        }

        StatusManager.show(STATUS, 'processing', 'processing');

        await ipcRenderer.invoke('convert-with-libreoffice', {
            fileData: arrayBuffer,
            fileName: selectedFile.name,
            outputPath: outputPath,
            format: 'docx',
            metadata: finalMetadata
        });

        StatusManager.show(STATUS, 'success', 'successPdfConverted', {
            format: 'DOCX',
            filename: path.basename(outputPath),
            savePath: outputPath
        });

        setTimeout(() => CustomMetadataModule.reset(), 2000);

    } catch (error) {
        console.error('Error converting PDF to DOCX:', error);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
    } finally {
        submitBtn.disabled = false;
    }
});