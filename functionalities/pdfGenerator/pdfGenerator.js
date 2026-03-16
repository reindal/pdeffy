const fs = require('fs').promises;
const path = require('path');
const os = require('os');
var { ipcRenderer } = require('electron');

// Required modules
const XLSX = require('xlsx');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const JSZip = require('jszip');
const STATUS = '#status';

const form = document.getElementById('pdfGeneratorForm');
const docxInput = document.getElementById('docxTemplate');
const excelInput = document.getElementById('excelData');
const baseFileNameInput = document.getElementById('baseFileName');
const submitBtn = document.getElementById('submitBtn');

// UI Elements
const docxInfo = document.getElementById('docxInfo');
const excelInfo = document.getElementById('excelInfo');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

let selectedDocxFile = null;
let selectedExcelFile = null;

docxInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        selectedDocxFile = e.target.files[0];
        docxInfo.textContent = `✓ Template: ${selectedDocxFile.name}`;
    }
});

excelInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        selectedExcelFile = e.target.files[0];
        excelInfo.textContent = `✓ Data: ${selectedExcelFile.name}`;
    }
});

form.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!selectedDocxFile || !selectedExcelFile) return;

    // Sanitize base name to prevent invalid file paths
    let baseName = baseFileNameInput.value.trim() || 'Document';
    baseName = baseName.replace(/[<>:"/\\|?*]/g, '_');
    
    try {
        // 1. Read input data from Excel/CSV
        StatusManager.show(STATUS, 'processing', 'readingExcel');
        const excelBuffer = await selectedExcelFile.arrayBuffer();
        const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert sheet to JSON array
        const excelData = XLSX.utils.sheet_to_json(worksheet);

        if (excelData.length === 0) {
            throw new Error(getMessage('errorEmptyExcel'));
        }

        // 2. Prompt user for output ZIP location before starting heavy processing
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const zipOutputPath = await ipcRenderer.invoke('show-save-dialog', {
            title: 'Save Generated PDFs',
            defaultPath: path.join(downloadsPath, `${baseName}_Batch.zip`),
            filters: [{ name: 'ZIP Archives', extensions: ['zip'] }]
        });

        if (!zipOutputPath) {
            // Processing aborted by user
            return; 
        }

        // 3. Initialize processing environment
        submitBtn.disabled = true;
        progressContainer.style.display = 'block';
        
        const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
        const finalZip = new JSZip();
        const docxBufferBase = await selectedDocxFile.arrayBuffer();
        
        // Bypass Snap sandbox restrictions by creating the isolated directory 
        // in the same folder as the final ZIP output, utilizing a hidden prefix.
        const targetOutputDirectory = path.dirname(zipOutputPath);
        const sessionTempDir = await fs.mkdtemp(path.join(targetOutputDirectory, '.pdfgen-'));

        // 4. Execute row-by-row document generation
        for (let i = 0; i < excelData.length; i++) {
            const rowData = excelData[i];
            const currentFileName = `${baseName}_${i + 1}`;
            
            // Update progress UI
            StatusManager.show(STATUS, 'processing', 'generatingItem', { current: i + 1, total: excelData.length });
            progressBar.style.width = `${(i / excelData.length) * 100}%`;
            progressText.textContent = `${i} / ${excelData.length}`;

            // 4A. Template data injection
            const zip = new PizZip(docxBufferBase);
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                delimiters: { start: '{{', end: '}}' }, 
                nullGetter() { return ""; }
            });

            doc.render(rowData);
            const generatedDocxBuffer = doc.getZip().generate({ type: 'nodebuffer' });

            // 4B. Invoke LibreOffice engine for PDF conversion
            const tempPdfPath = path.join(sessionTempDir, `${currentFileName}.pdf`);
            
            await ipcRenderer.invoke('convert-with-libreoffice', {
                fileData: generatedDocxBuffer,
                fileName: `temp_${i}.docx`,
                outputPath: tempPdfPath,
                format: 'pdf',
                metadata: finalMetadata 
            });

            // 4C. Package generated PDF into JSZip instance
            const pdfBytes = await fs.readFile(tempPdfPath);
            finalZip.file(`${currentFileName}.pdf`, pdfBytes);

            // 4D. Cleanup intermediate file
            try { await fs.unlink(tempPdfPath); } catch (e) {}
            
            progressBar.style.width = `${((i + 1) / excelData.length) * 100}%`;
            progressText.textContent = `${i + 1} / ${excelData.length}`;
        }

        // 5. Finalize archive creation and global cleanup
        StatusManager.show(STATUS, 'processing', 'savingZip');
        const zipContent = await finalZip.generateAsync({ type: 'nodebuffer' });
        await fs.writeFile(zipOutputPath, zipContent);
        
        try { await fs.rmdir(sessionTempDir); } catch (e) {}

        StatusManager.show(STATUS, 'success', 'successGeneration', {
            savePath: zipOutputPath
        });

        setTimeout(() => {
            form.reset();
            selectedDocxFile = null; 
            selectedExcelFile = null;
            docxInfo.textContent = ''; 
            excelInfo.textContent = '';
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
            CustomMetadataModule.reset();
        }, 4000);

    } catch (error) {
        console.error('Error in Generator process:', error);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
    } finally {
        submitBtn.disabled = false;
    }
});