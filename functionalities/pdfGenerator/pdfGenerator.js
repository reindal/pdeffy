const fs = require('fs').promises;
const path = require('path');
const os = require('os');
var { ipcRenderer } = require('electron');

// Necessary libraries
const XLSX = require('xlsx');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const JSZip = require('jszip');

const form = document.getElementById('pdfGeneratorForm');
const docxInput = document.getElementById('docxTemplate');
const excelInput = document.getElementById('excelData');
const baseFileNameInput = document.getElementById('baseFileName');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');

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

    const baseName = baseFileNameInput.value.trim() || 'Document';
    submitBtn.disabled = true;
    progressContainer.style.display = 'block';

    try {
        // 1. READ EXCEL DATA
        showStatus(getLocalMessage('readingExcel'), 'info');
        const excelBuffer = await selectedExcelFile.arrayBuffer();
        const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert Excel to an array of objects (each row is an object)
        // Example: [{ company: "Reindal", Agent: "Adrian" }, ...]
        const excelData = XLSX.utils.sheet_to_json(worksheet);

        if (excelData.length === 0) {
            throw new Error(getLocalMessage('errorEmptyExcel'));
        }

        // 2. PREPARE FINAL ZIP AND BASE DOCX
        const finalZip = new JSZip();
        const docxBufferBase = await selectedDocxFile.arrayBuffer();
        const tempDir = os.tmpdir();

        // 3. ASK USER WHERE TO SAVE THE FINAL ZIP
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const zipOutputPath = await ipcRenderer.invoke('show-save-dialog', {
            title: 'Save Generated PDFs',
            defaultPath: path.join(downloadsPath, `${baseName}_Batch.zip`),
            filters: [{ name: 'ZIP Archives', extensions: ['zip'] }]
        });

        if (!zipOutputPath) {
            submitBtn.disabled = false;
            progressContainer.style.display = 'none';
            return;
        }

        // 4. PROCESS ROW BY ROW
        for (let i = 0; i < excelData.length; i++) {
            const rowData = excelData[i];
            const currentFileName = `${baseName}_${i + 1}`;
            
            // Update UI
            showStatus(getLocalMessage('generatingItem', { current: i + 1, total: excelData.length }), 'info');
            progressBar.style.width = `${((i) / excelData.length) * 100}%`;
            progressText.textContent = `${i} / ${excelData.length}`;

            // A. Inject data into DOCX
            const zip = new PizZip(docxBufferBase);
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                delimiters: { start: '[', end: ']' }, // Changing {} to []
                nullGetter() { return ""; } // If cell is empty, return empty string instead of crashing
            });

            doc.render(rowData); // Replaces [company] with actual value

            const generatedDocxBuffer = doc.getZip().generate({ type: 'nodebuffer' });

            // B. Send to LibreOffice for PDF conversion
            const tempPdfPath = path.join(tempDir, `${currentFileName}.pdf`);
            
            await ipcRenderer.invoke('convert-with-libreoffice', {
                fileData: generatedDocxBuffer,
                fileName: `temp_${i}.docx`,
                outputPath: tempPdfPath,
                format: 'pdf',
                metadata: null 
            });

            // C. Read generated PDF and add to JSZip
            const pdfBytes = await fs.readFile(tempPdfPath);
            finalZip.file(`${currentFileName}.pdf`, pdfBytes);

            // D. Clean up temporary PDF from disk
            try { await fs.unlink(tempPdfPath); } catch (e) {}
            
            progressBar.style.width = `${((i + 1) / excelData.length) * 100}%`;
            progressText.textContent = `${i + 1} / ${excelData.length}`;
        }

        // 5. SAVE FINAL ZIP WITH ALL PDFs
        showStatus(getLocalMessage('savingZip'), 'info');
        const zipContent = await finalZip.generateAsync({ type: 'nodebuffer' });
        await fs.writeFile(zipOutputPath, zipContent);

        showStatus(getLocalMessage('successGeneration'), 'success');

        // Reset Form
        setTimeout(() => {
            form.reset();
            selectedDocxFile = null; 
            selectedExcelFile = null;
            docxInfo.textContent = ''; 
            excelInfo.textContent = '';
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
        }, 4000);

    } catch (error) {
        console.error('Error in Generator:', error);
        showStatus(error.message, 'error');
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
    if (typeof window.getMessage === 'function') {
        return window.getMessage(key, params);
    }
    const fallbacks = {
        readingExcel: "Reading Excel data...",
        errorEmptyExcel: "The Excel file is empty or could not be read.",
        generatingItem: "Generating PDF {current} of {total}...",
        savingZip: "Compressing all PDFs into a ZIP file...",
        successGeneration: "✓ PDF batch generated and saved successfully!"
    };
    let text = fallbacks[key] || key;
    if (params.current) {
        text = text.replace('{current}', params.current).replace('{total}', params.total);
    }
    return text;
}