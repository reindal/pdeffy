var { ipcRenderer } = require('electron');
const path = require('path');
const STATUS = '#status';

const form = document.getElementById('pdfToExcelForm');
const pdfFile = document.getElementById('pdfFile');
const fileNameDisplay = document.getElementById('fileName');
const submitBtn = document.getElementById('submitBtn');

let selectedFile = null;

// Handle file selection and check for PDF encryption
pdfFile.addEventListener('change', async function (e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const blocked = await PdfEncryptionGuard.check(file, STATUS);
        
        if (!blocked) {
            selectedFile = file;
            fileNameDisplay.textContent = file.name;
            submitBtn.disabled = false;
        } else {
            selectedFile = null;
            fileNameDisplay.textContent = '';
        }
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
        
        // Suggest replacing .pdf with .xlsx
        const defaultPath = path.join(downloadsPath, selectedFile.name.replace('.pdf', '.xlsx'));

        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: defaultPath,
            filters: [{ name: 'Excel Workbooks', extensions: ['xlsx'] }]
        });

        if (!outputPath) {
            submitBtn.disabled = false;
            return;
        }

        StatusManager.show(STATUS, 'processing', 'processing');

        // Call the LibreOffice conversion engine with 'xlsx' format
        await ipcRenderer.invoke('convert-with-libreoffice', {
            fileData: arrayBuffer,
            fileName: selectedFile.name,
            outputPath: outputPath,
            format: 'xlsx',
            metadata: finalMetadata
        });

        StatusManager.show(STATUS, 'success', 'successPdfConverted', {
            format: 'XLSX',
            filename: path.basename(outputPath),
            savePath: outputPath
        });

        setTimeout(() => CustomMetadataModule.reset(), 2000);

    } catch (error) {
        console.error('Error converting PDF to Excel:', error);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
    } finally {
        submitBtn.disabled = false;
    }
});