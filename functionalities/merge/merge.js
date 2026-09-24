const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');
import { enableListReorder, moveArrayItem } from '../../src/ui/listReorder.js';
const STATUS = '#status';

const form = document.getElementById('mergeForm');
const pdfFiles = document.getElementById('pdfFiles');
const submitBtn = document.getElementById('submitBtn');
const filesOrderContainer = document.getElementById('filesOrderContainer');

let selectedFiles = [];

pdfFiles.addEventListener('change', function (e) {
    const newFiles = Array.from(e.target.files);
    newFiles.forEach(file => {
        PdfEncryptionGuard.checkSync(file, STATUS, (blocked) => {
            if (!blocked) {
                selectedFiles.push(file);
                updateFilesOrder();
            }
        });
    });
    pdfFiles.value = '';
});

function formatSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function updateFilesOrder() {
    const filesOrder = document.getElementById('filesOrder');
    filesOrderContainer.innerHTML = '';

    if (filesOrder) {
        filesOrder.hidden = selectedFiles.length === 0;
    }

    const title = document.getElementById('filesOrderTitle');
    const head = document.querySelector('#filesOrder .pdeffy-ws-files-head');
    if (title) {
        const base = title.getAttribute('data-base-label') || title.textContent.replace(/\s*\(\d+\)\s*$/, '').trim();
        title.setAttribute('data-base-label', base);
        title.textContent = selectedFiles.length ? `${base} (${selectedFiles.length})` : base;
    }

    let clearBtn = document.getElementById('mergeClearAllBtn');
    if (selectedFiles.length && head && !clearBtn) {
        clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'pdeffy-ws-clear';
        clearBtn.id = 'mergeClearAllBtn';
        clearBtn.innerHTML = `<span class="pdeffy-icon-mask" style="--pdeffy-icon:url('../../assets/icons/svg/actions/trash.svg')" aria-hidden="true"></span><span class="langText" id="mergeClearAll">Rimuovi tutti</span>`;
        head.appendChild(clearBtn);
        clearBtn.addEventListener('click', () => {
            selectedFiles = [];
            updateFilesOrder();
            pdfFiles.value = '';
            updateSubmitLabel();
        });
        if (typeof window.applyLanguage === 'function') {
            try { window.applyLanguage(); } catch (_) { /* ignore */ }
        }
    } else if (!selectedFiles.length && clearBtn) {
        clearBtn.remove();
    }

    selectedFiles.forEach((file, index) => {
        const fileOrderItem = document.createElement('div');
        fileOrderItem.className = 'fileOrderItem';
        fileOrderItem.dataset.reorderItem = '';
        fileOrderItem.dataset.index = String(index);

        const pagesLabel = file.__pageCount
            ? (file.__pageCount === 1 ? '1 pagina' : `${file.__pageCount} pagine`)
            : '…';

        fileOrderItem.innerHTML = `
            <span class="pdeffy-ws-grip" aria-hidden="true"><img src="../../assets/icons/svg/actions/drag-handle.svg" alt="" draggable="false"></span>
            <span class="pdeffy-ws-file-icon" aria-hidden="true"><img src="../../assets/icons/svg/pdf-tools/pdf-file.svg" alt="" draggable="false"></span>
            <div class="fileOrderName">
              <div class="pdeffy-ws-file-title">${file.name}</div>
              <div class="pdeffy-ws-file-meta">${formatSize(file.size)}</div>
            </div>
            <span class="pdeffy-ws-pill" data-pages="${index}">${pagesLabel}</span>
            <div class="pdeffy-ws-move">
              <button type="button" class="fileOrderMove fileOrderMoveUp" data-index="${index}" aria-label="Sposta su" title="Sposta su" ${index === 0 ? 'disabled' : ''}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3.5 3.5 9h9L8 3.5Z" fill="currentColor"/></svg>
              </button>
              <button type="button" class="fileOrderMove fileOrderMoveDown" data-index="${index}" aria-label="Sposta giù" title="Sposta giù" ${index === selectedFiles.length - 1 ? 'disabled' : ''}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 12.5 12.5 7h-9L8 12.5Z" fill="currentColor"/></svg>
              </button>
            </div>
            <button type="button" class="fileOrderRemove" data-index="${index}" aria-label="Remove"><img src="../../assets/icons/svg/actions/remove.svg" alt="" draggable="false"></button>
        `;

        const removeBtn = fileOrderItem.querySelector('.fileOrderRemove');
        removeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            selectedFiles.splice(index, 1);
            updateFilesOrder();
            pdfFiles.value = '';
            updateSubmitLabel();
        });

        fileOrderItem.querySelector('.fileOrderMoveUp')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (index <= 0) return;
            moveArrayItem(selectedFiles, index, index - 1);
            updateFilesOrder();
        });
        fileOrderItem.querySelector('.fileOrderMoveDown')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (index >= selectedFiles.length - 1) return;
            moveArrayItem(selectedFiles, index, index + 1);
            updateFilesOrder();
        });

        filesOrderContainer.appendChild(fileOrderItem);
        if (!file.__pageCount) {
            fillPageCount(file, fileOrderItem.querySelector('[data-pages]'));
        }
    });

    updateSubmitLabel();
}

async function fillPageCount(file, el) {
    if (!el) return;
    try {
        const buf = await file.arrayBuffer();
        const doc = await PDFDocument.load(buf);
        const n = doc.getPageCount();
        file.__pageCount = n;
        el.textContent = n === 1 ? '1 pagina' : `${n} pagine`;
    } catch (_) {
        el.textContent = 'PDF';
    }
}

function updateSubmitLabel() {
    const label = document.getElementById('mergeSubmitBtn');
    if (!label) return;
    const base = label.getAttribute('data-base-label') || label.textContent.replace(/\s*\(\d+\s*file\)\s*$/i, '').trim();
    label.setAttribute('data-base-label', base);
    if (selectedFiles.length > 0) {
        label.textContent = `${base} (${selectedFiles.length} file)`;
    } else {
        label.textContent = base;
    }
}

if (filesOrderContainer) {
    enableListReorder(filesOrderContainer, {
        itemSelector: '.fileOrderItem',
        ignoreSelector: 'button, a, input, textarea, select, label, .fileOrderRemove, .fileOrderMove, .pdeffy-ws-move',
        onReorder(fromIndex, toIndex) {
            moveArrayItem(selectedFiles, fromIndex, toIndex);
            updateFilesOrder();
        },
    });
}

form.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (selectedFiles.length < 2) {
        StatusManager.show(STATUS, 'error', 'pleaseSelectAtLeastTwoPdfs');
        return;
    }

    StatusManager.show(STATUS, 'processing', 'processingFiles', { count: selectedFiles.length });
    submitBtn.disabled = true;

    try {
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const defaultFileName = 'merged_document.pdf';
        const defaultPath = path.join(downloadsPath, defaultFileName);

        const filePath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: defaultPath,
            filters: [
                { name: 'PDF Files', extensions: ['pdf'] }
            ]
        });

        if (!filePath) {
            StatusManager.show(STATUS, 'error', 'saveCancelled');
            submitBtn.disabled = false;
            return;
        }

        const totalSize = selectedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
        const LARGE_PDF_BYTES = 20 * 1024 * 1024;
        let usedRustMerge = false;

        if (totalSize >= LARGE_PDF_BYTES) {
            try {
                const workDir = path.join(path.dirname(filePath), `.pdeffy_merge_${Date.now()}`);
                await fs.mkdir(workDir, { recursive: true });
                const tempPaths = [];
                for (let i = 0; i < selectedFiles.length; i++) {
                    const tempPath = path.join(workDir, `${i}_${selectedFiles[i].name}`);
                    await fs.writeFile(tempPath, new Uint8Array(await selectedFiles[i].arrayBuffer()));
                    tempPaths.push(tempPath);
                }
                await ipcRenderer.invoke('pdf-merge', { paths: tempPaths, output: filePath });
                usedRustMerge = true;
            } catch (rustErr) {
                console.warn('[merge] Rust merge failed, falling back to pdf-lib:', rustErr);
            }
        }

        if (!usedRustMerge) {
            const mergedPdf = await PDFDocument.create();
            const metadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);

            CustomMetadataModule.applyToPdfDoc(mergedPdf, metadata);

            for (let file of selectedFiles) {
                const fileBuffer = await file.arrayBuffer();
                const pdfDoc = await PDFDocument.load(fileBuffer);

                const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
                pages.forEach(page => {
                    mergedPdf.addPage(page);
                });
            }

            const mergedPdfBytes = await mergedPdf.save();
            await fs.writeFile(filePath, mergedPdfBytes);
        } else {
            try {
                const metadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
                if (metadata) {
                    const bytes = await fs.readFile(filePath);
                    const doc = await PDFDocument.load(bytes);
                    CustomMetadataModule.applyToPdfDoc(doc, metadata);
                    await fs.writeFile(filePath, await doc.save());
                }
            } catch (_) { /* optional metadata */ }
        }

        const readOnlyCheckbox = document.getElementById('readOnlyCheckbox');
        if (readOnlyCheckbox && readOnlyCheckbox.checked) {
            try {
                await ipcRenderer.invoke('set-file-readonly', filePath);
            } catch (error) {
                console.error('Error setting read-only:', error);
            }
        }

        StatusManager.show(STATUS, 'success', 'successPdfCreated', {
            filename: path.basename(filePath),
            savePath: filePath
        });
        submitBtn.disabled = false;

        form.reset();
        selectedFiles = [];
        updateFilesOrder();
        pdfFiles.value = '';
        CustomMetadataModule.reset();

    } catch (error) {
        console.error('Error merging PDFs:', error);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
        submitBtn.disabled = false;
    }
});
