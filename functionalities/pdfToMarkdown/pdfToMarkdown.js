const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');

const STATUS = '#status';

let pdfjsLib = null;

async function initPdfJs() {
    if (!pdfjsLib) {
        let attempts = 0;
        while (!window.pdfjsLib && attempts < 50) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            attempts++;
        }
        if (!window.pdfjsLib) throw new Error('PDF.js library failed to load');
        pdfjsLib = window.pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
    }
    return pdfjsLib;
}

function extractPageAsPlainLines(textContent) {
    const items = textContent.items
        .filter((it) => it.str && String(it.str).trim())
        .map((it) => ({
            str: it.str,
            x: it.transform[4],
            y: it.transform[5],
        }));
    if (items.length === 0) return '';
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const yTol = 4;
    const lines = [];
    let bucket = [];
    let lineY = null;

    for (const it of items) {
        if (lineY === null || Math.abs(it.y - lineY) <= yTol) {
            bucket.push(it);
            lineY = lineY === null ? it.y : lineY;
        } else {
            lines.push(
                bucket
                    .sort((a, b) => a.x - b.x)
                    .map((x) => x.str)
                    .join(' ')
            );
            bucket = [it];
            lineY = it.y;
        }
    }
    if (bucket.length) {
        lines.push(
            bucket
                .sort((a, b) => a.x - b.x)
                .map((x) => x.str)
                .join(' ')
        );
    }
    return lines.join('\n');
}

async function pdfBufferToMarkdown(arrayBuffer) {
    const pdfjs = await initPdfJs();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const chunks = [];
    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        const body = extractPageAsPlainLines(textContent);
        if (pdf.numPages > 1) {
            chunks.push(`\n\n## Page ${p}\n\n`);
        }
        chunks.push(body || '');
    }
    return chunks.join('').trim() + '\n';
}

function initPdfToMarkdownPage() {
    const pdfInput = document.getElementById('pdfFile');
    const fileInfoPdf = document.getElementById('fileInfoPdf');
    const fileNamePdf = document.getElementById('fileNamePdf');
    const submitPdfToMd = document.getElementById('submitPdfToMd');

    if (!pdfInput || !fileInfoPdf || !fileNamePdf || !submitPdfToMd) {
        throw new Error('PDF to Markdown: missing DOM elements.');
    }

    pdfInput.addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) {
            fileInfoPdf.style.display = 'none';
            return;
        }
        const blocked = await PdfEncryptionGuard.check(f, STATUS);
        if (blocked) {
            pdfInput.value = '';
            fileInfoPdf.style.display = 'none';
            return;
        }
        fileInfoPdf.style.display = 'block';
        fileNamePdf.textContent = f.name;
    });

    submitPdfToMd.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!pdfInput.files || !pdfInput.files[0]) {
            StatusManager.show(STATUS, 'error', 'pdfToMarkdownPleaseSelect');
            return;
        }
        const file = pdfInput.files[0];

        submitPdfToMd.disabled = true;
        try {
            const buf = await file.arrayBuffer();
            const md = await pdfBufferToMarkdown(buf);

            const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
            const base = path.basename(file.name, path.extname(file.name)) || 'document';
            const defaultPath = path.join(downloadsPath, `${base}.md`);

            const outputPath = await ipcRenderer.invoke('show-save-dialog', {
                defaultPath,
                filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
            });
            if (!outputPath) {
                StatusManager.show(STATUS, 'info', 'saveCancelled');
                return;
            }

            StatusManager.show(STATUS, 'processing', 'processing');
            await fs.writeFile(outputPath, md, 'utf8');

            StatusManager.show(STATUS, 'success', 'pdfToMarkdownSuccessPath', {
                filename: path.basename(outputPath),
                path: outputPath,
                savePath: outputPath,
            });
        } catch (err) {
            console.error(err);
            StatusManager.show(STATUS, 'error', 'errorPrefix', { error: err.message });
        } finally {
            submitPdfToMd.disabled = false;
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        try {
            initPdfToMarkdownPage();
        } catch (err) {
            console.error('[pdfToMarkdown]', err);
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
        initPdfToMarkdownPage();
    } catch (err) {
        console.error('[pdfToMarkdown]', err);
        const el = document.getElementById('status');
        if (el) {
            el.className = 'status-box status-error';
            el.style.display = 'block';
            el.textContent = err.message || String(err);
        }
    }
}
