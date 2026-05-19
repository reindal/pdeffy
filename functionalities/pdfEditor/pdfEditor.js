var { ipcRenderer } = require('electron');
const fs = require('fs').promises;
const path = require('path');

window.pdfjsLib.GlobalWorkerOptions.workerSrc = './../../libs/pdf.worker.min.js';

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
    exportBtn.disabled =
        !model.originalBuffer || !PdfEditorDocumentModel.hasExportableEdits(model);
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

async function loadPdfFile(file) {
    const blocked = await PdfEncryptionGuard.check(file, STATUS);
    if (blocked) return;

    StatusManager.show(STATUS, 'processing', 'pdfEditorLoading');

    try {
        const buffer = await file.arrayBuffer();
        // Keep a dedicated copy for export; PDF.js may detach the buffer used for preview.
        const exportBuffer = buffer.slice(0);
        const previewBuffer = buffer.slice(0);

        const loadingTask = window.pdfjsLib.getDocument({ data: previewBuffer, disableWorker: true });
        const pdf = await loadingTask.promise;

        PdfEditorDocumentModel.resetModel(model);
        model.originalBuffer = exportBuffer;
        model.fileName = file.name;
        model.pdfJsDoc = pdf;
        model.sourcePageCount = pdf.numPages;
        model.pages = PdfEditorDocumentModel.initPagesFromSourceCount(pdf.numPages);

        const active = PdfEditorDocumentModel.getActivePages(model);
        selectedPageId = active[0]?.id ?? null;

        fileNameEl.textContent = file.name;
        dropZone.style.display = 'none';
        workspace.classList.add('visible');
        document.body.classList.add('pdfEditorEditing');

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
    } catch (err) {
        console.error('[pdfEditor] load', err);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: err.message });
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
    document.body.classList.remove('pdfEditorEditing');
    dropZone.style.display = 'block';
    fileInput.value = '';
    fileNameEl.textContent = '';
    thumbsContainer.innerHTML = '';
    viewerSingle.innerHTML = '';
    viewerScroll.innerHTML = '';
    exportBtn.disabled = true;
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

fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
        loadPdfFile(file);
    }
    e.target.value = '';
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') loadPdfFile(file);
});

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
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: err.message });
    } finally {
        updateExportButton();
    }
});

window.addEventListener('languageChanged', () => {
    updatePageIndicator(
        PdfEditorDocumentModel.getActivePages(model).findIndex((p) => p.id === selectedPageId)
    );
});
