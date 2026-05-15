const fs = require('fs').promises;
const path = require('path');
const os = require('os');
var { ipcRenderer } = require('electron');

const STATUS = '#status';

function initMarkdownToPdfPage() {
    const mdInput = document.getElementById('mdFile');
    const fileInfoMd = document.getElementById('fileInfoMd');
    const fileNameMd = document.getElementById('fileNameMd');
    const submitMdToPdf = document.getElementById('submitMdToPdf');

    if (!mdInput || !fileInfoMd || !fileNameMd || !submitMdToPdf) {
        throw new Error('Markdown to PDF: missing DOM elements.');
    }

    mdInput.addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (f) {
            fileInfoMd.style.display = 'block';
            fileNameMd.textContent = f.name;
        } else {
            fileInfoMd.style.display = 'none';
        }
    });

    submitMdToPdf.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!mdInput.files || !mdInput.files[0]) {
            StatusManager.show(STATUS, 'error', 'markdownToPdfPleaseSelect');
            return;
        }
        const file = mdInput.files[0];

        submitMdToPdf.disabled = true;
        try {
            const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
            const base = path.basename(file.name, path.extname(file.name)) || 'document';
            const defaultPath = path.join(downloadsPath, `${base}.pdf`);

            const outputPath = await ipcRenderer.invoke('show-save-dialog', {
                defaultPath,
                filters: [{ name: 'PDF', extensions: ['pdf'] }],
            });
            if (!outputPath) {
                StatusManager.show(STATUS, 'info', 'saveCancelled');
                return;
            }

            StatusManager.show(STATUS, 'processing', 'processing');

            const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_') || 'document.md';
            const tmpIn = path.join(os.tmpdir(), `pdeffy_md_src_${Date.now()}_${safeName}`);
            await fs.writeFile(tmpIn, Buffer.from(await file.arrayBuffer()));
            try {
                await ipcRenderer.invoke('markdown-file-to-pdf', {
                    inputPath: tmpIn,
                    outputPath,
                });
            } finally {
                await fs.unlink(tmpIn).catch(() => {});
            }

            StatusManager.show(STATUS, 'success', 'successPdfCreatedPath', {
                filename: path.basename(outputPath),
                savePath: outputPath,
                path: outputPath,
            });
        } catch (err) {
            console.error(err);
            StatusManager.show(STATUS, 'error', 'errorPrefix', { error: err.message });
        } finally {
            submitMdToPdf.disabled = false;
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        try {
            initMarkdownToPdfPage();
        } catch (err) {
            console.error('[markdownToPdf]', err);
            const el = document.getElementById('status');
            if (el) {
                el.className = 'status-box status-error';
                el.style.display = 'block';
                el.textContent = err.message || String(err);
            }
        }
    });
} else {
    try {
        initMarkdownToPdfPage();
    } catch (err) {
        console.error('[markdownToPdf]', err);
        const el = document.getElementById('status');
        if (el) {
            el.className = 'status-box status-error';
            el.style.display = 'block';
            el.textContent = err.message || String(err);
        }
    }
}
