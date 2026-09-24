var { ipcRenderer } = require('electron');
const fs = require('fs').promises;
const path = require('path');

// Worker already configured by src/platform/pdfjs-setup.js

const STATUS = '#pdfEditorStatus';

const dropZone = document.getElementById('pdfEditorDropZone');
const fileInput = document.getElementById('pdfEditorFileInput');
const workspace = document.getElementById('pdfEditorWorkspace');
const fileNameEl = document.getElementById('pdfEditorFileName');
const changeFileBtn = document.getElementById('pdfEditorChangeFile');
const thumbsContainer = document.getElementById('pdfEditorThumbs');
const viewerSingle = document.getElementById('pdfEditorViewerSingle');
const viewerScroll = document.getElementById('pdfEditorViewerScroll');
const exportBtn = document.getElementById('pdfEditorExport');
const pageIndicator = document.getElementById('pdfEditorPageIndicator');
const zoomLabel = document.getElementById('pdfEditorZoomLabel');
const toolBody = document.getElementById('pdfEditorToolBody');

const model = PdfEditorDocumentModel.createDocumentModel();
let selectedPageId = null;
let thumbsApi = null;
let viewerApi = null;
let toolController = null;

async function getPdfPage(sourceIndex) {
    if (!model.pdfJsDoc) return null;
    if (model.pdfJsPagesBySource.has(sourceIndex)) {
        return model.pdfJsPagesBySource.get(sourceIndex);
    }
    const page = await model.pdfJsDoc.getPage(sourceIndex + 1);
    model.pdfJsPagesBySource.set(sourceIndex, page);
    return page;
}

function updateExportButton() {
    const hasWmDraft =
        typeof PdfEditorOverlayManager !== 'undefined' &&
        !!PdfEditorOverlayManager.getWatermarkDraft?.();
    exportBtn.disabled =
        !model.originalBuffer ||
        !(PdfEditorDocumentModel.hasExportableEdits(model) || hasWmDraft);
}

function updatePageIndicator(displayIndex) {
    const total = PdfEditorDocumentModel.getActivePageCount(model);
    const current = total === 0 ? 0 : displayIndex + 1;
    const tpl =
        typeof window.getMessage === 'function'
            ? window.getMessage('pdfEditorPageIndicator')
            : 'Page {current} / {total}';
    pageIndicator.textContent = tpl
        .replace('{current}', String(current))
        .replace('{total}', String(total));
}

async function refreshUi() {
    updateExportButton();
    if (!selectedPageId && model.pages.length) {
        const active = PdfEditorDocumentModel.getActivePages(model);
        selectedPageId = active[0]?.id ?? null;
    }
    const active = PdfEditorDocumentModel.getActivePages(model);
    if (selectedPageId && !active.find((p) => p.id === selectedPageId)) {
        selectedPageId = active[0]?.id ?? null;
    }

    if (thumbsApi) await thumbsApi.renderThumbnails(selectedPageId);
    if (viewerApi) await viewerApi.render(selectedPageId);

    const idx = active.findIndex((p) => p.id === selectedPageId);
    updatePageIndicator(idx >= 0 ? idx : 0);

}

function onModelChange() {
    model.pdfJsPagesBySource.clear();
    refreshUi();
}

function onPageSelect(pageId) {
    selectedPageId = pageId;
    if (viewerApi?.getViewMode() === viewerApi.VIEW_CONTINUOUS) {
        viewerApi.scrollToPageId(pageId);
    }
    refreshUi();
}

function onPageInView(displayIndex, pageId) {
    selectedPageId = pageId;
    updatePageIndicator(displayIndex);
    document.querySelectorAll('.pdfEditorThumbItem').forEach((el) => {
        el.classList.toggle('selected', el.dataset.pageId === pageId);
    });
}

function isPasswordException(err) {
    if (!err) return false;
    const name = err.name || '';
    const msg = String(err.message || err).toLowerCase();
    return (
        name === 'PasswordException' ||
        err.code === 1 ||
        err.code === 2 ||
        msg.includes('password') ||
        msg.includes('encrypted')
    );
}

function promptPdfPassword(isRetry) {
    const modal = document.getElementById('pdfEditorPasswordModal');
    const input = document.getElementById('pdfEditorPasswordInput');
    const errEl = document.getElementById('pdfEditorPasswordError');
    const okBtn = document.getElementById('pdfEditorPasswordOk');
    const cancelBtn = document.getElementById('pdfEditorPasswordCancel');
    const hint = document.getElementById('pdfEditorPasswordHint');

    return new Promise((resolve, reject) => {
        if (!modal || !input || !okBtn || !cancelBtn) {
            reject(new Error('Password UI missing'));
            return;
        }

        input.value = '';
        if (errEl) {
            errEl.hidden = !isRetry;
            errEl.textContent = isRetry
                ? (typeof window.getMessage === 'function'
                    ? window.getMessage('pdfEditorPasswordWrong')
                    : 'Incorrect password. Try again.')
                : '';
        }
        if (hint && typeof window.getMessage === 'function') {
            hint.textContent = window.getMessage('pdfEditorPasswordHint');
        }

        modal.hidden = false;
        requestAnimationFrame(() => input.focus());

        const cleanup = () => {
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            input.removeEventListener('keydown', onKey);
            modal.hidden = true;
        };

        const onOk = () => {
            const value = input.value;
            cleanup();
            resolve(value);
        };
        const onCancel = () => {
            cleanup();
            const cancelErr = new Error('Cancelled');
            cancelErr.name = 'PasswordCancelled';
            reject(cancelErr);
        };
        const onKey = (e) => {
            if (e.key === 'Enter') onOk();
            if (e.key === 'Escape') onCancel();
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        input.addEventListener('keydown', onKey);
    });
}

async function openPdfWithPassword(previewBuffer) {
    let password = '';
    let attempt = 0;

    while (attempt < 5) {
        try {
            const data = previewBuffer.slice(0);
            const opts = { data, disableWorker: true };
            if (password) opts.password = password;
            const loadingTask = window.pdfjsLib.getDocument(opts);
            const pdf = await loadingTask.promise;
            return { pdf, password: password || null };
        } catch (err) {
            if (!isPasswordException(err)) throw err;
            password = await promptPdfPassword(attempt > 0);
            attempt += 1;
        }
    }

    throw new Error(
        typeof window.getMessage === 'function'
            ? window.getMessage('pdfEditorPasswordWrong')
            : 'Incorrect password'
    );
}

async function loadPdfFile(file, filePath = null) {
    StatusManager.show(STATUS, 'processing', 'pdfEditorLoading');

    try {
        const buffer = await file.arrayBuffer();
        // Keep a dedicated copy for export; PDF.js may detach the buffer used for preview.
        const exportBuffer = buffer.slice(0);
        const previewBuffer = buffer.slice(0);

        const { pdf, password } = await openPdfWithPassword(previewBuffer);

        PdfEditorDocumentModel.resetModel(model);
        model.originalBuffer = exportBuffer;
        model.fileName = file.name;
        model.pdfJsDoc = pdf;
        model.pdfPassword = password || null;
        model.isEncrypted = !!password;
        model.sourcePageCount = pdf.numPages;
        model.pages = PdfEditorDocumentModel.initPagesFromSourceCount(pdf.numPages);

        const active = PdfEditorDocumentModel.getActivePages(model);
        selectedPageId = active[0]?.id ?? null;

        fileNameEl.textContent = file.name;
        dropZone.style.display = 'none';
        const recentSection = document.getElementById('pdfEditorRecent');
        if (recentSection) recentSection.style.display = 'none';
        workspace.classList.add('visible');
        document.body.classList.add('pdfEditorEditing', 'pdeffy-sidebar-collapsed');

        const resolvedPath = filePath || file?.pdeffyPath || null;
        try {
            const { pushRecentDocument, getPdfEditorHref } = await import('/src/ui/shell.js');
            pushRecentDocument({
                name: file.name,
                path: resolvedPath,
                href: getPdfEditorHref?.() || './pdfEditor.html',
            });
        } catch (_) { /* ignore */ }
        try {
            const { cacheRecentFile } = await import('/src/ui/recentFiles.js');
            // Cache a copy for reopen even if path is lost across sessions.
            await cacheRecentFile({
                name: file.name,
                path: resolvedPath,
                buffer: exportBuffer.slice(0),
            });
        } catch (_) { /* ignore */ }

        if (!thumbsApi) {
            thumbsApi = PdfEditorPageThumbnails.createPageThumbnails({
                containerEl: thumbsContainer,
                model,
                onPageSelect,
                onModelChange,
                getPdfPage,
            });
        }

        if (!viewerApi) {
            viewerApi = PdfEditorViewer.createPdfViewer({
                scrollContainerEl: viewerScroll,
                singleContainerEl: viewerSingle,
                model,
                getPdfPage,
                onPageInView,
                onAfterRender: () => {
                    if (toolController) toolController.onViewerRendered();
                },
            });
        }

        if (toolController) {
            toolController.onDocumentLoaded();
        }

        if (!toolController) {
            toolController = PdfEditorToolController.createToolController({
                model,
                toolBodyEl: toolBody,
                viewerApi,
                getSelectedPageId: () => selectedPageId,
                onModelChange,
                onExportStateChange: updateExportButton,
                getPdfPage,
                onGoToPage: async (pageId, displayIndex) => {
                    selectedPageId = pageId;
                    document.querySelectorAll('.pdfEditorThumbItem').forEach((el) => {
                        el.classList.toggle('selected', el.dataset.pageId === pageId);
                    });
                    if (viewerApi?.getViewMode() === viewerApi.VIEW_CONTINUOUS) {
                        viewerApi.scrollToPageId(pageId);
                        updatePageIndicator(displayIndex);
                        if (toolController) toolController.onViewerRendered();
                    } else {
                        await refreshUi();
                    }
                },
            });
            toolController.initTabs();
        }

        await refreshUi();
        StatusManager.hide(STATUS);
        fileInput.value = '';
        try {
            delete fileInput.dataset.pdeffyPaths;
        } catch (_) { /* ignore */ }
    } catch (err) {
        if (err?.name === 'PasswordCancelled') {
            StatusManager.hide(STATUS);
            fileInput.value = '';
            return;
        }
        console.error('[pdfEditor] load', err);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: err.message || String(err) });
        fileInput.value = '';
    }
}

function resetWorkspace() {
    if (typeof PdfEditorTextSearch !== 'undefined') PdfEditorTextSearch.clear();
    PdfEditorDocumentModel.resetModel(model);
    selectedPageId = null;
    toolController = null;
    document.querySelectorAll('.pdfEditorToolTab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tool === 'watermark');
    });
    if (toolBody) toolBody.innerHTML = '';
    workspace.classList.remove('visible');
    document.body.classList.remove('pdfEditorEditing', 'pdeffy-sidebar-collapsed');
    dropZone.style.display = '';
    const recentSection = document.getElementById('pdfEditorRecent');
    if (recentSection) recentSection.style.display = '';
    fileInput.value = '';
    fileNameEl.textContent = '';
    thumbsContainer.innerHTML = '';
    viewerSingle.innerHTML = '';
    viewerScroll.innerHTML = '';
    exportBtn.disabled = true;
    renderEditRecent();
}

dropZone.addEventListener('click', (e) => {
    // Label "Open PDF" already opens the dialog via htmlFor; avoid a second dialog.
    if (e.target === fileInput || e.target.closest('label[for="pdfEditorFileInput"]')) {
        return;
    }
    fileInput.click();
});

changeFileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    resetWorkspace();
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
        e.target.value = '';
        return;
    }

    let filePath = null;
    try {
        const paths = JSON.parse(fileInput.dataset.pdeffyPaths || '[]');
        if (Array.isArray(paths) && paths[0]) filePath = String(paths[0]);
    } catch (_) { /* ignore */ }

    if (!filePath) {
        try {
            const { pathOfFile } = await import('/src/ui/filePicker.js');
            const { getLastNativePaths } = await import('/src/ui/recentFiles.js');
            filePath = pathOfFile(file) || getLastNativePaths()?.[0] || null;
        } catch (_) { /* ignore */ }
    }

    loadPdfFile(file, filePath);
    e.target.value = '';
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('dragover', 'is-dragover');
});
dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('dragover', 'is-dragover');
});
dropZone.addEventListener('dragleave', (e) => {
    // Ignore leave events when moving between children inside the dropzone.
    if (e.relatedTarget && dropZone.contains(e.relatedTarget)) return;
    dropZone.classList.remove('dragover', 'is-dragover');
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover', 'is-dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file && isPdfFile(file)) loadPdfFile(file);
});

function isPdfFile(file) {
    if (!file) return false;
    if (file.type === 'application/pdf') return true;
    return /\.pdf$/i.test(file.name || '');
}

// Tauri intercepts OS file drops — HTML5 dataTransfer is often empty.
import('/src/ui/filePicker.js')
    .then((m) =>
        m.wireTauriDropZone?.(dropZone, {
            acceptExtensions: ['pdf'],
            isActive: () => !document.body.classList.contains('pdfEditorEditing'),
            onFiles: (files, paths) => {
                const file = files?.[0];
                if (file && isPdfFile(file)) loadPdfFile(file, paths?.[0] || null);
            },
        })
    )
    .catch(() => { /* ignore */ });

function showLandingError(message) {
    const recent = document.getElementById('pdfEditorRecent');
    if (!recent || document.body.classList.contains('pdfEditorEditing')) {
        try {
            StatusManager.show(STATUS, 'error', 'errorPrefix', { error: message });
        } catch (_) {
            console.warn('[pdfEditor]', message);
        }
        return;
    }
    let el = document.getElementById('pdfEditorRecentError');
    if (!el) {
        el = document.createElement('p');
        el.id = 'pdfEditorRecentError';
        el.className = 'pdfEditorRecentError';
        recent.querySelector('.pdfEditorRecentHeader')?.after(el);
    }
    el.textContent = message;
    el.hidden = false;
}

async function openRecentDoc(doc) {
    try {
        document.getElementById('pdfEditorRecentError')?.setAttribute('hidden', '');

        const { fileForRecentDoc } = await import('/src/ui/recentFiles.js');
        const resolved = await fileForRecentDoc(doc);

        if (resolved?.file && isPdfFile(resolved.file)) {
            await loadPdfFile(resolved.file, resolved.path || doc.path || null);
            return;
        }

        // Last resort: let the user pick the file again (keeps UX working for legacy entries).
        showLandingError(
            typeof window.getMessage === 'function' && window.getMessage('editRecentMissingPath') !== 'editRecentMissingPath'
                ? window.getMessage('editRecentMissingPath')
                : 'Percorso non disponibile. Seleziona di nuovo il PDF.'
        );
        fileInput.click();
    } catch (err) {
        console.warn('[pdfEditor] recent open failed', err);
        showLandingError(err?.message || String(err));
    }
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function renderEditRecent() {
    const list = document.getElementById('pdfEditorRecentList');
    const empty = document.getElementById('editRecentEmpty');
    if (!list) return;

    let docs = [];
    try {
        const { getRecentDocuments } = await import('/src/ui/shell.js');
        docs = (getRecentDocuments() || []).filter((d) => {
            const n = d?.name || '';
            return /\.pdf$/i.test(n) || !n.includes('.');
        });
    } catch (err) {
        console.warn('[pdfEditor] render recent failed', err);
        docs = [];
    }

    list.innerHTML = '';
    if (!docs.length) {
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';

    let openLabel = 'Apri';
    try {
        if (typeof window.getMessage === 'function') {
            const t = window.getMessage('editRecentOpen');
            if (t && t !== 'editRecentOpen') openLabel = t;
        }
    } catch (_) { /* ignore */ }

    docs.slice(0, 6).forEach((doc) => {
        const card = document.createElement('div');
        card.className = 'pdeffy-recent-card';
        card.style.cursor = 'pointer';
        card.innerHTML = `
            <span class="pdeffy-recent-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/></svg></span>
            <span class="pdeffy-recent-card-body"><strong>${escapeHtml(doc.name)}</strong><span>${doc.openedAt ? new Date(doc.openedAt).toLocaleString() : ''}</span></span>
            <button type="button" class="pdeffy-btn pdeffy-btn-primary pdfEditorRecentOpenBtn">${escapeHtml(openLabel)}</button>`;

        const open = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openRecentDoc(doc);
        };
        // Only bind once on the card (button clicks bubble here).
        card.addEventListener('click', open);
        list.appendChild(card);
    });
}

renderEditRecent();
window.addEventListener('languageChanged', () => {
    if (!document.body.classList.contains('pdfEditorEditing')) renderEditRecent();
});
window.addEventListener('pdeffy:theme-changed', () => {
    if (!document.body.classList.contains('pdfEditorEditing')) renderEditRecent();
});
window.addEventListener('pdeffy:open-recent', (e) => {
    openRecentDoc(e.detail || {});
});

// Open a recent file handed off from the Recenti hub.
(async () => {
    try {
        const { consumeRecentOpenRequest } = await import('/src/ui/shell.js');
        const doc = consumeRecentOpenRequest?.();
        if (!doc) return;
        await new Promise((r) => setTimeout(r, 50));
        await openRecentDoc(doc);
    } catch (err) {
        console.warn('[pdfEditor] open recent handoff failed', err);
    }
})();

document.getElementById('pdfEditorZoomIn').addEventListener('click', async () => {
    viewerApi?.stepZoom(25);
    zoomLabel.textContent = `${viewerApi?.getZoomPercent() ?? 100}%`;
    await refreshUi();
});

document.getElementById('pdfEditorZoomOut').addEventListener('click', async () => {
    viewerApi?.stepZoom(-25);
    zoomLabel.textContent = `${viewerApi?.getZoomPercent() ?? 100}%`;
    await refreshUi();
});

document.getElementById('pdfEditorZoomFit').addEventListener('click', async () => {
    viewerApi?.setZoomPercent(100);
    zoomLabel.textContent = '100%';
    await refreshUi();
});

const btnSingle = document.getElementById('pdfEditorViewSingle');
const btnContinuous = document.getElementById('pdfEditorViewContinuous');

btnSingle.addEventListener('click', async () => {
    viewerApi?.setViewMode(viewerApi.VIEW_SINGLE);
    btnSingle.classList.add('active');
    btnContinuous.classList.remove('active');
    await refreshUi();
});

btnContinuous.addEventListener('click', async () => {
    viewerApi?.setViewMode(viewerApi.VIEW_CONTINUOUS);
    btnContinuous.classList.add('active');
    btnSingle.classList.remove('active');
    await refreshUi();
});

document.getElementById('pdfEditorPrevPage').addEventListener('click', async () => {
    if (!viewerApi || viewerApi.getViewMode() !== viewerApi.VIEW_SINGLE) return;
    const idx = viewerApi.getCurrentDisplayIndex();
    const id = viewerApi.goToDisplayIndex(idx - 1);
    if (id) {
        selectedPageId = id;
        await refreshUi();
    }
});

document.getElementById('pdfEditorNextPage').addEventListener('click', async () => {
    if (!viewerApi || viewerApi.getViewMode() !== viewerApi.VIEW_SINGLE) return;
    const idx = viewerApi.getCurrentDisplayIndex();
    const id = viewerApi.goToDisplayIndex(idx + 1);
    if (id) {
        selectedPageId = id;
        await refreshUi();
    }
});

exportBtn.addEventListener('click', async () => {
    if (!model.originalBuffer) return;

    // Live watermark preview is a draft until "Add layer" — commit it so export matches the preview.
    if (toolController?.commitWatermarkDraft?.()) {
        // Draft was promoted; keep export enabled for the build below.
    }

    exportBtn.disabled = true;
    StatusManager.show(STATUS, 'processing', 'processing');

    try {
        const metadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
        const pdfBytes = await PdfEditorBuildPdf.buildPdf(model, metadata);

        const base = (model.fileName || 'document.pdf').replace(/\.pdf$/i, '');
        const filename = `${base}_edited.pdf`;
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const savePath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: path.join(downloadsPath, filename),
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
        });

        if (!savePath) {
            StatusManager.show(STATUS, 'error', 'saveCancelled');
            return;
        }

        await fs.writeFile(savePath, pdfBytes);
        StatusManager.show(STATUS, 'success', 'successPdfCreated', {
            filename: path.basename(savePath),
            savePath,
        });
        setTimeout(() => CustomMetadataModule.reset(), 2000);
    } catch (err) {
        console.error('[pdfEditor] export', err);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: err.message || String(err) });
    } finally {
        updateExportButton();
    }
});

window.addEventListener('languageChanged', () => {
    updatePageIndicator(
        PdfEditorDocumentModel.getActivePages(model).findIndex((p) => p.id === selectedPageId)
    );
});

document.getElementById('pdfEditorPropsToggle')?.addEventListener('click', () => {
    document.body.classList.toggle('pdfEditorPropsCollapsed');
    const btn = document.getElementById('pdfEditorPropsToggle');
    if (btn) {
        const collapsed = document.body.classList.contains('pdfEditorPropsCollapsed');
        btn.textContent = collapsed ? '›' : '‹';
    }
});
