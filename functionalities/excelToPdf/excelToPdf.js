var { ipcRenderer } = require('electron');
const path = require('path');
const STATUS = '#status';

const form = document.getElementById('excelToPdfForm');
const excelFileInput = document.getElementById('excelFile');
const submitBtn = document.getElementById('submitBtn');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const fileInfo = document.getElementById('fileInfo');

// Display the selected file name
excelFileInput.addEventListener('change', function (e) {
    if (e.target.files.length > 0) {
        fileInfo.style.display = 'block';
        fileNameDisplay.textContent = e.target.files[0].name;
    }
});

form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!excelFileInput.files[0]) return;

    const file = excelFileInput.files[0];
    const arrayBuffer = await file.arrayBuffer();

    submitBtn.disabled = true;

    try {
        // Get final metadata from module
        const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);

        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        
        // Handle both .xlsx and .xls extensions for the default save path
        let defaultFileName = file.name;
        if (defaultFileName.toLowerCase().endsWith('.xlsx')) {
            defaultFileName = defaultFileName.replace(/.xlsx$/i, '.pdf');
        } else if (defaultFileName.toLowerCase().endsWith('.xls')) {
            defaultFileName = defaultFileName.replace(/.xls$/i, '.pdf');
        } else {
            defaultFileName += '.pdf';
        }

        const defaultPath = path.join(downloadsPath, defaultFileName);

        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: defaultPath,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (!outputPath) {
            submitBtn.disabled = false;
            return;
        }

        StatusManager.show(STATUS, 'processing', 'processing');

        // LibreOffice headless mode handles Excel files with the same command
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