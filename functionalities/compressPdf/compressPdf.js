var { ipcRenderer } = require('electron');
const path = require('path');

const STATUS = '#status';

const form             = document.getElementById('compressForm');
const pdfFileInput     = document.getElementById('pdfFile');
const submitBtn        = document.getElementById('submitBtn');
const fileInfo         = document.getElementById('fileInfo');
const fileNameDisplay  = document.getElementById('fileNameDisplay');
const fileSizeDisplay  = document.getElementById('fileSizeDisplay');
const qualityCards     = document.querySelectorAll('.qualityCard');

let selectedFile = null;

qualityCards.forEach(card => {
    card.addEventListener('click', () => {
        qualityCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
    });
});

pdfFileInput.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) {
        selectedFile = null;
        fileInfo.style.display = 'none';
        submitBtn.disabled = true;
        return;
    }

    const blocked = await PdfEncryptionGuard.check(file, STATUS);
    if (blocked) {
        selectedFile = null;
        fileInfo.style.display = 'none';
        submitBtn.disabled = true;
        return;
    }

    selectedFile = file;
    fileNameDisplay.textContent = file.name;
    fileSizeDisplay.textContent = formatFileSize(file.size);
    fileInfo.style.display = 'flex';
    submitBtn.disabled = false;
});

form.addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!selectedFile) {
        StatusManager.show(STATUS, 'error', 'pleaseSelectFile');
        return;
    }

    const quality = document.querySelector('input[name="quality"]:checked').value;

    submitBtn.disabled = true;
    StatusManager.show(STATUS, 'processing', 'processing');

    try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const baseName = path.basename(selectedFile.name, '.pdf');
        const defaultPath = path.join(downloadsPath, `${baseName}_compressed.pdf`);

        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (!outputPath) {
            StatusManager.show(STATUS, 'error', 'saveCancelled');
            submitBtn.disabled = false;
            return;
        }

        const originalSize = selectedFile.size;

        const result = await ipcRenderer.invoke('compress-with-ghostscript', {
            fileData: arrayBuffer,
            fileName: selectedFile.name,
            outputPath,
            quality
        });

        const savedBytes  = originalSize - result.outputSize;
        const savedPct    = Math.round((savedBytes / originalSize) * 100);
        const savedStr    = savedPct > 0
            ? window.getMessage('compressSaved', { pct: savedPct, size: formatFileSize(result.outputSize) })
            : window.getMessage('compressNoReduction');

        StatusManager.show(STATUS, 'success', 'successPdfCreated', {
            filename: path.basename(outputPath),
            savePath: outputPath
        });

        // Append compression stats under the status box
        const statsEl = document.getElementById('compressionStats');
        if (statsEl) statsEl.remove();
        const stats = document.createElement('div');
        stats.id = 'compressionStats';
        stats.className = 'compressionResult';
        stats.innerHTML = `
            <span>${formatFileSize(originalSize)}</span>
            <span class="arrow">→</span>
            <span>${formatFileSize(result.outputSize)}</span>
            <span class="saved">${savedStr}</span>
        `;
        document.getElementById('status').insertAdjacentElement('afterend', stats);

    } catch (error) {
        console.error('Compression error:', error);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
    } finally {
        submitBtn.disabled = false;
    }
});

function formatFileSize(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576)    return (bytes / 1048576).toFixed(2) + ' MB';
    if (bytes >= 1024)       return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
}