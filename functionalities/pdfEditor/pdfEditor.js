var { ipcRenderer } = require('electron');
const fs = require('fs').promises;
const path = require('path');

/** Browser / Tauri WebView has no Node `global`; align with IIFE scripts on `window`. */
const global = typeof globalThis !== 'undefined' ? globalThis : window;

// Worker already configured by src/platform/pdfjs-setup.js

const STATUS = '#pdfEditorStatus';

const dropZone = document.getElementById('pdfEditorDropZone');
const fileInput = document.getElementById('pdfEditorFileInput');
const workspace = document.getElementById('pdfEditorWorkspace');
const fileNameEl = document.getElementById('pdfEditorFileName');
const openFileBtn = document.getElementById('pdfEditorOpenFile');
const saveBtn = document.getElementById('pdfEditorSave');
const saveAsBtn = document.getElementById('pdfEditorSaveAs');
const exportMenuBtn = document.getElementById('pdfEditorExportMenu');
const exportMenu = document.getElementById('pdfEditorExportMenuList');
const shareBtn = document.getElementById('pdfEditorShare');
const printBtn = document.getElementById('pdfEditorPrint');
const fileMoreBtn = document.getElementById('pdfEditorFileMore');
const fileMoreMenu = document.getElementById('pdfEditorFileMoreMenu');
const dirtyBadge = document.getElementById('pdfEditorDirtyBadge');
const thumbsContainer = document.getElementById('pdfEditorThumbs');
const viewerSingle = document.getElementById('pdfEditorViewerSingle');
const viewerScroll = document.getElementById('pdfEditorViewerScroll');
const pageIndicator = document.getElementById('pdfEditorPageIndicator');
const pageInput = document.getElementById('pdfEditorPageInput');
const pageTotalEl = document.getElementById('pdfEditorPageTotal');
const viewSingleBtn = document.getElementById('pdfEditorViewSingle');
const viewContinuousBtn = document.getElementById('pdfEditorViewContinuous');
const zoomLabel = document.getElementById('pdfEditorZoomLabel');
const toolBody = document.getElementById('pdfEditorToolBody');

const model = PdfEditorDocumentModel.createDocumentModel();
let selectedPageId = null;
let thumbsApi = null;
let viewerApi = null;
let toolController = null;
/** Last path written by Save / Save As (user-chosen, not temp). */
let lastSavedPath = null;
/** @type {{ attachments: any[], signatures: any[], hasAttachments: boolean, hasSignatures: boolean, isCertified: boolean }} */
let documentExtras = {
    attachments: [],
    signatures: [],
    hasAttachments: false,
    hasSignatures: false,
    isCertified: false,
};
/** @type {ReturnType<typeof PdfEditorDocumentTabBar.createDocumentTabBar>|null} */
let documentTabBar = null;
/** @type {string|null} */
let activeDocId = null;
/** @type {object[]} */
let documentSessions = [];
let sessionSwitchToken = 0;

function emptyDocumentExtras() {
    return {
        attachments: [],
        signatures: [],
        hasAttachments: false,
        hasSignatures: false,
        isCertified: false,
    };
}

function createSessionId() {
    return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function createDocumentSession(id = createSessionId()) {
    return {
        id,
        fileName: null,
        filePath: null,
        originalBuffer: null,
        pdfPassword: null,
        isEncrypted: false,
        sourcePageCount: 0,
        pages: [],
        watermarks: [],
        redactions: [],
        signatures: [],
        markups: [],
        comments: [],
        inks: [],
        bookmarks: [],
        formFields: [],
        formValues: {},
        formInitialValues: {},
        manualFormFills: [],
        acroFormPresent: false,
        ocrText: '',
        anonymizedText: '',
        hasEmbeddedText: true,
        viewerContentMode: 'pdf',
        selectedPageId: null,
        lastSavedPath: null,
        documentExtras: emptyDocumentExtras(),
        documentMetadata: null,
        isDirty: false,
    };
}

function getActiveSession() {
    return documentSessions.find((s) => s.id === activeDocId) || null;
}

function destroyCurrentPdfDoc() {
    try {
        model.pdfJsDoc?.destroy?.();
    } catch (_) {
        /* ignore */
    }
}

function prepareInspectorForDocumentSwitch() {
    if (document.body.classList.contains('pdfEditorDocInfoOpen') && typeof PdfEditorDocumentInfo !== 'undefined') {
        PdfEditorDocumentInfo.close(false);
    }
    setInspectorMode('tool');
}

function persistActiveSession() {
    const session = getActiveSession();
    if (!session || !model.originalBuffer) return;
    session.fileName = model.fileName;
    session.filePath = model.filePath;
    session.originalBuffer = model.originalBuffer;
    session.pdfPassword = model.pdfPassword;
    session.isEncrypted = model.isEncrypted;
    session.sourcePageCount = model.sourcePageCount;
    session.pages = model.pages.map((p) => ({ ...p }));
    session.watermarks = model.watermarks.map((x) => ({ ...x }));
    session.redactions = model.redactions.map((x) => ({ ...x }));
    session.signatures = model.signatures.map((x) => ({ ...x }));
    session.markups = model.markups.map((x) => ({ ...x }));
    session.comments = model.comments.map((x) => ({ ...x }));
    session.inks = model.inks.map((x) => ({ ...x }));
    session.bookmarks = model.bookmarks.map((x) => ({ ...x }));
    session.formFields = model.formFields.map((x) => ({ ...x }));
    session.formValues = { ...model.formValues };
    session.formInitialValues = { ...model.formInitialValues };
    session.manualFormFills = model.manualFormFills.map((x) => ({ ...x }));
    session.acroFormPresent = model.acroFormPresent;
    session.ocrText = model.ocrText;
    session.anonymizedText = model.anonymizedText;
    session.hasEmbeddedText = model.hasEmbeddedText;
    session.viewerContentMode = model.viewerContentMode;
    session.selectedPageId = selectedPageId;
    session.lastSavedPath = lastSavedPath;
    session.documentExtras = {
        ...documentExtras,
        attachments: [...(documentExtras.attachments || [])],
        signatures: [...(documentExtras.signatures || [])],
    };
    session.isDirty = isDirty;
    session.documentMetadata = model.documentMetadata || null;
}

function applySessionEditsToModel(session) {
    model.fileName = session.fileName;
    model.filePath = session.filePath;
    model.originalBuffer = session.originalBuffer;
    model.pdfPassword = session.pdfPassword;
    model.isEncrypted = session.isEncrypted;
    model.sourcePageCount = session.sourcePageCount;
    model.pages = session.pages.map((p) => ({ ...p }));
    model.watermarks = session.watermarks.map((x) => ({ ...x }));
    model.redactions = session.redactions.map((x) => ({ ...x }));
    model.signatures = session.signatures.map((x) => ({ ...x }));
    model.markups = session.markups.map((x) => ({ ...x }));
    model.comments = session.comments.map((x) => ({ ...x }));
    model.inks = session.inks.map((x) => ({ ...x }));
    model.bookmarks = session.bookmarks.map((x) => ({ ...x }));
    model.formFields = session.formFields.map((x) => ({ ...x }));
    model.formValues = { ...session.formValues };
    model.formInitialValues = { ...session.formInitialValues };
    model.manualFormFills = session.manualFormFills.map((x) => ({ ...x }));
    model.acroFormPresent = session.acroFormPresent;
    model.ocrText = session.ocrText;
    model.anonymizedText = session.anonymizedText;
    model.hasEmbeddedText = session.hasEmbeddedText;
    model.viewerContentMode = session.viewerContentMode;
    model.documentMetadata = session.documentMetadata || null;
}

function signatureUiForSession(session) {
    const extras = session.documentExtras || emptyDocumentExtras();
    if (!extras.hasSignatures || typeof PdfEditorSignatureStatus === 'undefined') return null;
    const agg = PdfEditorSignatureStatus.aggregateSignatureUi(extras.signatures);
    if (!agg) return null;
    const label = tMsg(agg.labelKey, agg.fallback, agg.counts || {});
    return { ...agg, tooltip: label };
}

function tabStateForSession(session) {
    const extras = session.id === activeDocId ? documentExtras : session.documentExtras || emptyDocumentExtras();
    const sigUi =
        session.id === activeDocId ? signatureUiForTab() : signatureUiForSession(session);
    return {
        id: session.id,
        active: session.id === activeDocId,
        fileName: session.fileName || 'document.pdf',
        attachmentsCount: extras.attachments?.length || 0,
        signatureUi: sigUi,
        signatureTooltip: sigUi?.tooltip || '',
        dirty: session.id === activeDocId ? isDirty : !!session.isDirty,
    };
}

async function activateDocumentSession(id) {
    if (!id || id === activeDocId) return;
    const token = ++sessionSwitchToken;
    persistActiveSession();
    const session = documentSessions.find((s) => s.id === id);
    if (!session?.originalBuffer) return;

    prepareInspectorForDocumentSwitch();
    StatusManager.show(STATUS, 'processing', 'pdfEditorLoading');

    try {
        destroyCurrentPdfDoc();
        PdfEditorDocumentModel.resetModel(model);
        applySessionEditsToModel(session);
        activeDocId = session.id;

        const previewBuffer = session.originalBuffer.slice(0);
        const { pdf, password } = await openPdfWithPassword(previewBuffer, session.pdfPassword || '');
        if (token !== sessionSwitchToken) return;

        model.pdfJsDoc = pdf;
        model.pdfPassword = password || session.pdfPassword || null;
        model.isEncrypted = !!model.pdfPassword || session.isEncrypted;
        model.pdfJsPagesBySource.clear();

        selectedPageId = session.selectedPageId;
        const active = PdfEditorDocumentModel.getActivePages(model);
        if (selectedPageId && !active.find((p) => p.id === selectedPageId)) {
            selectedPageId = active[0]?.id ?? null;
        }
        lastSavedPath = session.lastSavedPath;
        documentExtras = session.documentExtras || emptyDocumentExtras();
        isDirty = session.isDirty;
        if (fileNameEl) fileNameEl.textContent = model.fileName || '';

        if (toolController) toolController.onDocumentLoaded();
        await refreshUi();
        await refreshDocumentExtras();
        if (!model.documentMetadata) await refreshDocumentMetadata();
        syncDocumentTabs();
        updateFileActions();
        StatusManager.hide(STATUS);
        requestAnimationFrame(() => {
            refreshUi();
        });
    } catch (err) {
        console.error('[pdfEditor] activate session', err);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: err.message || String(err) });
    }
}

function closeDocumentSession(id) {
    const idx = documentSessions.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const session = documentSessions[idx];
    const dirty = id === activeDocId ? isDirty : !!session.isDirty;
    if (dirty) {
        if (
            !window.confirm(
                tMsg('pdfEditorTabCloseConfirmDirty', 'Chiudere il documento con modifiche non salvate?')
            )
        ) {
            return;
        }
    } else if (!window.confirm(tMsg('pdfEditorTabCloseConfirm', 'Chiudere il documento?'))) {
        return;
    }

    documentSessions.splice(idx, 1);
    if (id === activeDocId) {
        destroyCurrentPdfDoc();
    }

    if (!documentSessions.length) {
        activeDocId = null;
        resetWorkspace();
        return;
    }

    if (id === activeDocId) {
        const next = documentSessions[Math.min(idx, documentSessions.length - 1)];
        activateDocumentSession(next.id);
    } else {
        syncDocumentTabs();
    }
}

function setDocInfoInspectorTitle(i18nKey, fallback) {
    const titleEl = document.getElementById('pdfEditorInspectorTitle');
    if (!titleEl) return;
    titleEl.textContent = tMsg(i18nKey, fallback);
    titleEl.classList.add('langText');
    titleEl.setAttribute('data-i18n', i18nKey);
}

function setInspectorMode(mode) {
    const toolBodyEl = document.getElementById('pdfEditorToolBody');
    const panel = document.getElementById('pdfEditorDocInfoPanel');
    const aiSub = document.getElementById('pdfEditorAiSubTabs');
    const propsToggle = document.getElementById('pdfEditorPropsToggle');
    if (mode === 'docinfo') {
        if (toolBodyEl) toolBodyEl.hidden = true;
        if (panel) panel.hidden = false;
        if (aiSub) aiSub.hidden = true;
        if (propsToggle) propsToggle.hidden = true;
        setDocInfoInspectorTitle('pdfEditorDocInfoTitle', 'Informazioni documento');
    } else {
        if (toolBodyEl) toolBodyEl.hidden = false;
        if (panel) {
            panel.hidden = true;
            panel.innerHTML = '';
        }
        if (propsToggle) propsToggle.hidden = false;
        if (toolController?.refreshInspectorTitle) toolController.refreshInspectorTitle();
    }
}

function signatureUiForTab() {
    if (!documentExtras.hasSignatures || typeof PdfEditorSignatureStatus === 'undefined') return null;
    const agg = PdfEditorSignatureStatus.aggregateSignatureUi(documentExtras.signatures);
    if (!agg) return null;
    const label = tMsg(agg.labelKey, agg.fallback, agg.counts || {});
    return { ...agg, tooltip: label };
}

function syncDocumentTabs() {
    ensureDocumentUi();
    documentTabBar?.render();
}

function openDocumentInfo(tab, returnFocusEl) {
    ensureDocumentUi();
    if (typeof PdfEditorDocumentInfo === 'undefined') return;
    const infoTab =
        tab === 'signatures' ? 'signatures' : tab === 'properties' ? 'properties' : 'attachments';
    PdfEditorDocumentInfo.open({
        docId: activeDocId,
        tab: infoTab,
        returnFocusEl,
    });
    setInspectorMode('docinfo');
    document.body.classList.remove('pdfEditorPropsCollapsed');
}

window.__pdfEditorOpenSelectInspector = function openSelectInspector() {
    if (!model.pdfJsDoc) return;
    openDocumentInfo('properties');
};

function ensureDocumentUi() {
    if (ensureDocumentUi._done) return;
    ensureDocumentUi._done = true;

    const tabsEl = document.getElementById('pdfEditorDocumentTabs');
    if (typeof PdfEditorDocumentTabBar !== 'undefined' && tabsEl) {
        documentTabBar = PdfEditorDocumentTabBar.createDocumentTabBar({
            getContainer: () => tabsEl,
            getTabState: () => ({
                tabs: documentSessions.filter((s) => s.originalBuffer).map((s) => tabStateForSession(s)),
            }),
            onActivateTab: (tabId) => {
                activateDocumentSession(tabId);
            },
            onCloseTab: (tabId) => {
                closeDocumentSession(tabId);
            },
            onOpenAttachments: async (tabId, el) => {
                if (tabId !== activeDocId) await activateDocumentSession(tabId);
                if (toolController?.switchTool) toolController.switchTool('select', { skipDocInfo: true });
                openDocumentInfo('attachments', el || document.activeElement);
            },
            onOpenSignatures: async (tabId, el) => {
                if (tabId !== activeDocId) await activateDocumentSession(tabId);
                if (toolController?.switchTool) toolController.switchTool('select', { skipDocInfo: true });
                openDocumentInfo('signatures', el || document.activeElement);
            },
        });
    }

    if (typeof PdfEditorDocumentInfo !== 'undefined') {
        PdfEditorDocumentInfo.bind({
            getActiveDocId: () => activeDocId,
            getDocumentExtras: () => documentExtras,
            getActiveTool: () => toolController?.getActiveTool?.() || 'select',
            getToolBodyHtml: () => toolBody?.innerHTML || '',
            getToolBodyScroll: () => toolBody?.scrollTop || 0,
            getReturnInspectorLabel: () => toolController?.getReturnInspectorLabel?.() || tMsg('pdfEditorReturnSelect', 'Torna a Seleziona'),
            setInspectorMode: (mode) => {
                if (mode === 'docinfo') setInspectorMode('docinfo');
                else {
                    document.body.classList.remove('pdfEditorDocInfoOpen');
                    setInspectorMode('tool');
                    if (toolController?.getActiveTool) {
                        const t = toolController.getActiveTool();
                        const aiSub = document.getElementById('pdfEditorAiSubTabs');
                        if (aiSub) aiSub.hidden = !['ai', 'summary', 'anonymize', 'questions'].includes(t);
                    }
                }
            },
            restoreInspectorState: (saved) => toolController?.restoreInspectorState?.(saved),
            saveAttachment,
            openAttachment: openAttachmentFromInspector,
            getDocumentMetadata: () => refreshDocumentMetadata(),
            setDocInfoInspectorTitle: (key, fallback) => setDocInfoInspectorTitle(key, fallback),
        });
    }

    document.getElementById('pdfEditorMenuDocProps')?.addEventListener('click', () => {
        closeFileMoreMenu();
        if (toolController?.switchTool) toolController.switchTool('select');
        else openDocumentInfo('properties');
    });
}

async function refreshDocumentMetadata() {
    if (!model.pdfJsDoc || typeof PdfEditorDocumentMetadata === 'undefined') {
        model.documentMetadata = null;
        return null;
    }
    const active = PdfEditorDocumentModel.getActivePages(model);
    try {
        model.documentMetadata = await PdfEditorDocumentMetadata.inspectPdfMetadata(model.pdfJsDoc, {
            fileName: model.fileName,
            filePath: model.filePath,
            byteLength: model.originalBuffer?.byteLength || 0,
            pageCount: model.pdfJsDoc.numPages,
            activePageCount: active.length,
            isEncrypted: model.isEncrypted,
            acroFormPresent: model.acroFormPresent,
            hasEmbeddedText: model.hasEmbeddedText,
        });
    } catch (err) {
        console.warn('[pdfEditor] document metadata', err);
        model.documentMetadata = null;
    }
    const session = getActiveSession();
    if (session) session.documentMetadata = model.documentMetadata;
    return model.documentMetadata;
}

async function openAttachmentFromInspector(att) {
    if (!att?.content?.length) return;
    if (att.mime === 'application/pdf' || /\.pdf$/i.test(att.filename || '')) {
        if (model.originalBuffer && hasUnsavedChanges()) {
            const confirmMsg = tMsg(
                'pdfEditorConfirmDiscard',
                'Scartare le modifiche non salvate e aprire un altro PDF?'
            );
            if (!window.confirm(confirmMsg)) return;
        }
        const blob = new Blob([att.content], { type: 'application/pdf' });
        const file = new File([blob], att.filename || 'attachment.pdf', { type: 'application/pdf' });
        await loadPdfFile(file, null, { newTab: true });
        return;
    }
    await viewAttachment(att);
}

function tMsg(key, fallback, params) {
    if (typeof window.getMessage === 'function') {
        const v = window.getMessage(key, params || {});
        if (v && v !== key) return v;
    }
    let out = fallback;
    if (params && typeof out === 'string') {
        Object.keys(params).forEach((param) => {
            out = out.split(`{${param}}`).join(String(params[param] ?? ''));
        });
    }
    return out;
}

function clearDocumentExtrasUi() {
    documentExtras = {
        attachments: [],
        signatures: [],
        hasAttachments: false,
        hasSignatures: false,
        isCertified: false,
    };
    const attachBtn = document.getElementById('pdfEditorAttachmentsBtn');
    const sigBtn = document.getElementById('pdfEditorSignaturesBtn');
    const banner = document.getElementById('pdfEditorSignedBanner');
    if (attachBtn) attachBtn.hidden = true;
    if (sigBtn) sigBtn.hidden = true;
    if (banner) banner.hidden = true;
    closeAttachmentsModal();
    closeSignaturesModal();
}

function updateDocumentExtrasUi() {
    const attachBtn = document.getElementById('pdfEditorAttachmentsBtn');
    const attachCount = document.getElementById('pdfEditorAttachmentsCount');
    const sigBtn = document.getElementById('pdfEditorSignaturesBtn');
    const banner = document.getElementById('pdfEditorSignedBanner');
    const bannerText = document.getElementById('pdfEditorSignedBannerText');
    const nAtt = documentExtras.attachments.length;
    const nSig = documentExtras.signatures.length;

    if (attachBtn) {
        attachBtn.hidden = nAtt === 0;
        attachBtn.title = tMsg('pdfEditorAttachmentsTitle', 'Allegati');
        attachBtn.setAttribute(
            'aria-label',
            `${tMsg('pdfEditorAttachmentsTitle', 'Allegati')}: ${nAtt}`
        );
    }
    if (attachCount) attachCount.textContent = String(nAtt);

    if (sigBtn) {
        sigBtn.hidden = nSig === 0;
        sigBtn.classList.toggle('is-certified', !!documentExtras.isCertified);
        const label = document.getElementById('pdfEditorSignaturesChipLabel');
        if (label) {
            label.textContent = documentExtras.isCertified
                ? tMsg('pdfEditorSignedCertified', 'Certificato')
                : tMsg('pdfEditorSignedChip', 'Firmato');
        }
    }
    if (banner) {
        banner.hidden = nSig === 0;
        banner.classList.toggle('is-certified', !!documentExtras.isCertified);
        if (bannerText) {
            const key = documentExtras.isCertified
                ? 'pdfEditorSignedBannerCertified'
                : 'pdfEditorSignedBannerText';
            const fallback = documentExtras.isCertified
                ? 'Questo PDF è certificato digitalmente · {count} firme'
                : 'Questo PDF è firmato digitalmente · {count} firme';
            bannerText.textContent = tMsg(key, fallback, { count: nSig });
        }
    }
    syncDocumentTabs();
    if (typeof PdfEditorDocumentInfo !== 'undefined') PdfEditorDocumentInfo.refresh();
}

async function refreshDocumentExtras() {
    clearDocumentExtrasUi();
    if (!model.pdfJsDoc || typeof PdfEditorDocumentExtras === 'undefined') return;
    try {
        documentExtras = await PdfEditorDocumentExtras.inspectPdfDocument(
            model.pdfJsDoc,
            model.originalBuffer
        );
    } catch (err) {
        console.warn('[pdfEditor] document extras', err);
        return;
    }
    updateDocumentExtrasUi();
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
}

function closeAttachmentsModal() {
    closeModal('pdfEditorAttachmentsModal');
    document.getElementById('pdfEditorAttachmentsBtn')?.setAttribute('aria-expanded', 'false');
}

function closeSignaturesModal() {
    closeModal('pdfEditorSignaturesModal');
    document.getElementById('pdfEditorSignaturesBtn')?.setAttribute('aria-expanded', 'false');
}

function renderAttachmentsList() {
    const list = document.getElementById('pdfEditorAttachmentsList');
    const empty = document.getElementById('pdfEditorAttachmentsEmpty');
    if (!list) return;
    list.innerHTML = '';
    const items = documentExtras.attachments || [];
    if (empty) empty.hidden = items.length > 0;
    items.forEach((att, idx) => {
        const row = document.createElement('div');
        row.className = 'pdfEditorExtrasItem';
        row.innerHTML = `
            <div class="pdfEditorExtrasItemHeader">
                <div>
                    <div class="pdfEditorExtrasItemTitle"></div>
                    <div class="pdfEditorExtrasItemMeta"></div>
                </div>
            </div>
            <div class="pdfEditorExtrasItemActions"></div>`;
        row.querySelector('.pdfEditorExtrasItemTitle').textContent = att.filename;
        const metaParts = [att.sizeLabel];
        if (att.description) metaParts.push(att.description);
        row.querySelector('.pdfEditorExtrasItemMeta').textContent = metaParts.join(' · ');
        const actions = row.querySelector('.pdfEditorExtrasItemActions');
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'pdeffy-btn pdeffy-btn-primary';
        saveBtn.textContent = tMsg('pdfEditorAttachmentSave', 'Salva');
        saveBtn.disabled = !att.content?.length;
        saveBtn.addEventListener('click', () => saveAttachment(att));
        actions.appendChild(saveBtn);
        if (att.canPreview) {
            const viewBtn = document.createElement('button');
            viewBtn.type = 'button';
            viewBtn.className = 'pdeffy-btn pdeffy-btn-ghost';
            viewBtn.textContent = tMsg('pdfEditorAttachmentView', 'Visualizza');
            viewBtn.addEventListener('click', () => viewAttachment(att));
            actions.appendChild(viewBtn);
        }
        list.appendChild(row);
    });
}

function renderSignaturesList() {
    const list = document.getElementById('pdfEditorSignaturesList');
    if (!list) return;
    list.innerHTML = '';
    (documentExtras.signatures || []).forEach((sig) => {
        const row = document.createElement('div');
        row.className = 'pdfEditorExtrasItem';
        const badges = [];
        if (sig.certified) {
            badges.push(
                `<span class="pdfEditorExtrasBadge">${tMsg('pdfEditorSigBadgeCertified', 'Certificazione')}</span>`
            );
        }
        if (sig.intact === true) {
            badges.push(
                `<span class="pdfEditorExtrasBadge is-ok">${tMsg('pdfEditorSigBadgeIntact', 'Copertura ByteRange OK')}</span>`
            );
        } else if (sig.intact === false) {
            badges.push(
                `<span class="pdfEditorExtrasBadge is-warn">${tMsg('pdfEditorSigBadgeAltered', 'Possibile modifica')}</span>`
            );
        }
        row.innerHTML = `
            <div class="pdfEditorExtrasItemHeader">
                <div>
                    <div class="pdfEditorExtrasItemTitle"></div>
                    <div class="pdfEditorExtrasItemMeta"></div>
                </div>
                <div class="pdfEditorExtrasItemActions">${badges.join('')}</div>
            </div>
            <dl class="pdfEditorExtrasFields"></dl>`;
        row.querySelector('.pdfEditorExtrasItemTitle').textContent = sig.name;
        row.querySelector('.pdfEditorExtrasItemMeta').textContent =
            sig.signedAtLabel ||
            tMsg('pdfEditorSigNoDate', 'Data non disponibile');
        const dl = row.querySelector('.pdfEditorExtrasFields');
        const fields = [
            [tMsg('pdfEditorSigFieldReason', 'Motivo'), sig.reason],
            [tMsg('pdfEditorSigFieldLocation', 'Luogo'), sig.location],
            [tMsg('pdfEditorSigFieldContact', 'Contatto'), sig.contact],
            [tMsg('pdfEditorSigFieldFilter', 'Filtro'), sig.filter],
            [tMsg('pdfEditorSigFieldSubFilter', 'Sottofiltro'), sig.subFilter],
        ];
        fields.forEach(([label, value]) => {
            if (!value) return;
            const dt = document.createElement('dt');
            dt.textContent = label;
            const dd = document.createElement('dd');
            dd.textContent = value;
            dl.append(dt, dd);
        });
        list.appendChild(row);
    });
}

function showAttachmentsModal() {
    toolController?.switchTool?.('select', { skipDocInfo: true });
    openDocumentInfo('attachments');
}

function showSignaturesModal() {
    toolController?.switchTool?.('select', { skipDocInfo: true });
    openDocumentInfo('signatures');
}

async function saveAttachment(att) {
    if (!att?.content?.length) return;
    try {
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const savePath = await ipcRenderer.invoke('show-save-dialog', {
            title: tMsg('pdfEditorAttachmentSave', 'Salva'),
            defaultPath: path.join(downloadsPath || '', att.filename),
        });
        if (!savePath) return;
        await fs.writeFile(savePath, att.content);
        StatusManager.show(STATUS, 'success', 'pdfEditorAttachmentSaved');
    } catch (err) {
        console.error('[pdfEditor] save attachment', err);
        StatusManager.show(STATUS, 'error', 'errorPrefix', {
            error: err.message || String(err),
        });
    }
}

async function viewAttachment(att) {
    if (!att?.content?.length) return;
    try {
        const tempDir = await ipcRenderer.invoke('get-temp-dir');
        const safeName = String(att.filename || 'attachment').replace(/[\\/:*?"<>|]/g, '_');
        const out = path.join(tempDir, `pdeffy-att-${Date.now()}-${safeName}`);
        await fs.writeFile(out, att.content);
        await ipcRenderer.invoke('open-file', out);
    } catch (err) {
        console.error('[pdfEditor] view attachment', err);
        StatusManager.show(STATUS, 'error', 'errorPrefix', {
            error: err.message || String(err),
        });
    }
}

function wireDocumentExtrasUi() {
    if (wireDocumentExtrasUi._done) return;
    wireDocumentExtrasUi._done = true;
    ensureDocumentUi();

    document.getElementById('pdfEditorAttachmentsBtn')?.addEventListener('click', () => {
        showAttachmentsModal();
    });
    document.getElementById('pdfEditorAttachmentsClose')?.addEventListener('click', () => {
        closeAttachmentsModal();
    });
    document.getElementById('pdfEditorAttachmentsModal')?.addEventListener('click', (e) => {
        if (e.target?.id === 'pdfEditorAttachmentsModal') closeAttachmentsModal();
    });

    document.getElementById('pdfEditorSignaturesBtn')?.addEventListener('click', () => {
        showSignaturesModal();
    });
    document.getElementById('pdfEditorSignedBannerBtn')?.addEventListener('click', () => {
        showSignaturesModal();
    });
    document.getElementById('pdfEditorSignaturesClose')?.addEventListener('click', () => {
        closeSignaturesModal();
    });
    document.getElementById('pdfEditorSignaturesModal')?.addEventListener('click', (e) => {
        if (e.target?.id === 'pdfEditorSignaturesModal') closeSignaturesModal();
    });

    window.addEventListener('languageChanged', () => {
        if (documentExtras?.hasSignatures || documentExtras?.hasAttachments) {
            updateDocumentExtrasUi();
        }
    });
}
/** True when the open document has edits not yet saved to lastSavedPath / filePath. */
let isDirty = false;

async function getPdfPage(sourceIndex) {
    if (!model.pdfJsDoc) return null;
    if (model.pdfJsPagesBySource.has(sourceIndex)) {
        return model.pdfJsPagesBySource.get(sourceIndex);
    }
    const page = await model.pdfJsDoc.getPage(sourceIndex + 1);
    model.pdfJsPagesBySource.set(sourceIndex, page);
    return page;
}

function hasPendingEdits() {
    const hasWmDraft =
        typeof PdfEditorOverlayManager !== 'undefined' &&
        !!PdfEditorOverlayManager.getWatermarkDraft?.();
    return PdfEditorDocumentModel.hasExportableEdits(model) || hasWmDraft;
}

function hasUnsavedChanges() {
    const hasWmDraft =
        typeof PdfEditorOverlayManager !== 'undefined' &&
        !!PdfEditorOverlayManager.getWatermarkDraft?.();
    return isDirty || hasWmDraft;
}

function markDirty() {
    isDirty = true;
    updateFileActions();
    persistActiveSession();
    syncDocumentTabs();
}

window.__pdfEditorMarkDirty = markDirty;

function clearDirty() {
    isDirty = false;
    updateFileActions();
    syncDocumentTabs();
}

function isTempEditPath(filePath) {
    if (!filePath) return true;
    const name = path.basename(String(filePath));
    return /pdeffy-edit-/i.test(name) || /pdeffy_in_/i.test(name);
}

function normalizeDocPath(filePath) {
    if (!filePath) return '';
    return String(filePath).replace(/\\/g, '/').toLowerCase();
}

function findSessionIdByFilePath(filePath) {
    const key = normalizeDocPath(filePath);
    if (!key) return null;
    for (const session of documentSessions) {
        if (
            normalizeDocPath(session.filePath) === key ||
            normalizeDocPath(session.lastSavedPath) === key
        ) {
            return session.id;
        }
    }
    if (document.body.classList.contains('pdfEditorEditing') && activeDocId) {
        if (normalizeDocPath(model.filePath) === key || normalizeDocPath(lastSavedPath) === key) {
            return activeDocId;
        }
    }
    return null;
}

function updateExportButton() {
    updateFileActions();
}

function updateFileActions() {
    const open = !!model.originalBuffer;
    if (saveBtn) saveBtn.disabled = !open;
    if (saveAsBtn) saveAsBtn.disabled = !open;
    if (exportMenuBtn) exportMenuBtn.disabled = !open;
    if (shareBtn) shareBtn.disabled = !open;
    if (printBtn) printBtn.disabled = !open;
    if (fileMoreBtn) fileMoreBtn.disabled = !open;
    if (dirtyBadge) dirtyBadge.hidden = !(open && hasUnsavedChanges());
}

function closeExportMenu() {
    if (!exportMenu || !exportMenuBtn) return;
    exportMenu.hidden = true;
    exportMenuBtn.setAttribute('aria-expanded', 'false');
}

function closeFileMoreMenu() {
    if (!fileMoreMenu || !fileMoreBtn) return;
    closeExportMenu();
    fileMoreMenu.hidden = true;
    fileMoreBtn.setAttribute('aria-expanded', 'false');
}

function toggleExportMenu() {
    if (!exportMenu || !exportMenuBtn || exportMenuBtn.disabled) return;
    const open = exportMenu.hidden;
    exportMenu.hidden = !open;
    exportMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleFileMoreMenu() {
    if (!fileMoreMenu || !fileMoreBtn || fileMoreBtn.disabled) return;
    closeExportMenu();
    const open = fileMoreMenu.hidden;
    fileMoreMenu.hidden = !open;
    fileMoreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

async function buildCurrentPdfBytes() {
    if (toolController?.commitWatermarkDraft?.()) {
        // Draft promoted into the model before build.
    }
    if (hasPendingEdits()) {
        const metadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
        if (model.redactions?.length) {
            StatusManager.show(STATUS, 'processing', 'pdfEditorFlatteningRedactions');
        }
        return PdfEditorBuildPdf.buildPdf(model, metadata);
    }
    return new Uint8Array(model.originalBuffer.slice(0));
}

/** Warn before writing a file that permanently burns redactions into page images. */
function confirmRedactionFlattenIfNeeded() {
    if (!model.redactions?.length) return true;
    const msg =
        typeof window.getMessage === 'function'
            ? window.getMessage('pdfEditorConfirmRedactFlatten')
            : 'This document has redactions. Saved pages with redactions will be converted to images so the hidden content cannot be recovered or removed later. Continue?';
    return window.confirm(msg);
}

async function writePdfToPath(savePath, { quiet, adoptDocument = true } = {}) {
    const pdfBytes = await buildCurrentPdfBytes();
    await fs.writeFile(savePath, pdfBytes);
    if (adoptDocument) {
        model.filePath = savePath;
        lastSavedPath = savePath;
        model.fileName = path.basename(savePath);
        if (fileNameEl) fileNameEl.textContent = model.fileName;
        clearDirty();
    }
    if (!quiet) {
        StatusManager.show(STATUS, 'success', 'successPdfCreated', {
            filename: path.basename(savePath),
            savePath,
        });
        setTimeout(() => CustomMetadataModule.reset(), 2000);
    }
    persistActiveSession();
    syncDocumentTabs();
    return savePath;
}

async function savePdfAs({ skipRedactConfirm = false } = {}) {
    if (!model.originalBuffer) return null;
    if (!skipRedactConfirm && !confirmRedactionFlattenIfNeeded()) {
        StatusManager.show(STATUS, 'error', 'saveCancelled');
        return null;
    }
    StatusManager.show(STATUS, 'processing', 'processing');
    try {
        const base = (model.fileName || 'document.pdf').replace(/\.pdf$/i, '');
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const defaultName = lastSavedPath && !isTempEditPath(lastSavedPath)
            ? lastSavedPath
            : path.join(downloadsPath, `${base}.pdf`);
        const savePath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: defaultName,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
        });
        if (!savePath) {
            StatusManager.show(STATUS, 'error', 'saveCancelled');
            return null;
        }
        const originPath =
            model.filePath && !isTempEditPath(model.filePath) ? model.filePath : null;
        const keepOriginTab =
            originPath && normalizeDocPath(originPath) !== normalizeDocPath(savePath);
        return await writePdfToPath(savePath, { adoptDocument: !keepOriginTab });
    } catch (err) {
        console.error('[pdfEditor] save as', err);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: err.message || String(err) });
        return null;
    }
}

async function savePdf() {
    if (!model.originalBuffer) return null;
    if (!confirmRedactionFlattenIfNeeded()) {
        StatusManager.show(STATUS, 'error', 'saveCancelled');
        return null;
    }
    const target =
        (lastSavedPath && !isTempEditPath(lastSavedPath) && lastSavedPath) ||
        (model.filePath && !isTempEditPath(model.filePath) && model.filePath) ||
        null;
    if (!target) return savePdfAs({ skipRedactConfirm: true });
    StatusManager.show(STATUS, 'processing', 'processing');
    try {
        return await writePdfToPath(target);
    } catch (err) {
        console.error('[pdfEditor] save', err);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: err.message || String(err) });
        return null;
    }
}

async function ensureShareablePdfPath() {
    if (hasPendingEdits() || !model.filePath || isTempEditPath(model.filePath)) {
        const pdfBytes = await buildCurrentPdfBytes();
        const tempDir = await ipcRenderer.invoke('get-temp-dir');
        const base = (model.fileName || 'document.pdf').replace(/\.pdf$/i, '');
        const out = path.join(tempDir, `${base}-share-${Date.now()}.pdf`);
        await fs.writeFile(out, pdfBytes);
        return out;
    }
    return model.filePath;
}

async function shareCurrentPdf() {
    if (!model.originalBuffer) return;
    if (!confirmRedactionFlattenIfNeeded()) {
        StatusManager.show(STATUS, 'error', 'saveCancelled');
        return;
    }
    StatusManager.show(STATUS, 'processing', 'processing');
    try {
        const filePath = await ensureShareablePdfPath();
        const title = model.fileName || path.basename(filePath);

        // Web Share API when available (rare on desktop WebView).
        if (typeof navigator !== 'undefined' && navigator.canShare && navigator.share) {
            try {
                const bytes = await fs.readFile(filePath);
                const file = new File([bytes], title, { type: 'application/pdf' });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title });
                    StatusManager.hide(STATUS);
                    return;
                }
            } catch (shareErr) {
                if (shareErr?.name === 'AbortError') {
                    StatusManager.hide(STATUS);
                    return;
                }
                // fall through to native share
            }
        }

        await ipcRenderer.invoke('share-file', { filePath, title });
        StatusManager.show(STATUS, 'success', 'pdfEditorShareOpened', {
            filename: title,
        });
    } catch (err) {
        console.error('[pdfEditor] share', err);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: err.message || String(err) });
    }
}

async function printCurrentPdf() {
    if (!model.originalBuffer) return;
    if (!confirmRedactionFlattenIfNeeded()) {
        StatusManager.show(STATUS, 'error', 'saveCancelled');
        return;
    }
    StatusManager.show(STATUS, 'processing', 'processing');
    try {
        // WKWebView: window.print() is a silent no-op — use native PDFKit dialog.
        const filePath = await ensureShareablePdfPath();
        const title = model.fileName || path.basename(filePath);
        await ipcRenderer.invoke('print-file', { filePath, title });
        StatusManager.show(STATUS, 'success', 'pdfEditorPrintOpened');
    } catch (err) {
        console.error('[pdfEditor] print', err);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: err.message || String(err) });
    }
}

async function installActionIcons() {
    try {
        const { svgAbsoluteUrl } = await import('/src/ui/icons.js');
        const { getAppBase } = await import('/src/ui/shell.js');
        const base = typeof getAppBase === 'function' ? getAppBase() : '../../';
        document.querySelectorAll('.pdfEditorActionIcon[data-icon]').forEach((el) => {
            const file = el.getAttribute('data-icon');
            if (!file) return;
            const url = svgAbsoluteUrl(base, `actions/${file}`);
            el.className = 'pdeffy-icon-mask pdfEditorActionIcon';
            el.style.setProperty('--pdeffy-icon', `url('${url}')`);
        });
    } catch (err) {
        console.warn('[pdfEditor] action icons', err);
    }
}

installActionIcons();

async function extractPdfText() {
    if (!model.pdfJsDoc) return '';
    const parts = [];
    const n = model.pdfJsDoc.numPages || 0;
    for (let i = 1; i <= n; i++) {
        const page = await model.pdfJsDoc.getPage(i);
        const content = await page.getTextContent();
        const line = (content.items || [])
            .map((it) => (typeof it.str === 'string' ? it.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (line) parts.push(line);
        parts.push('');
    }
    return parts.join('\n').trim();
}

async function exportAsDocx() {
    const pdfBytes = await buildCurrentPdfBytes();
    const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
    const base = (model.fileName || 'document.pdf').replace(/\.pdf$/i, '');
    const outputPath = await ipcRenderer.invoke('show-save-dialog', {
        defaultPath: path.join(downloadsPath, `${base}.docx`),
        filters: [{ name: 'Word Documents', extensions: ['docx'] }],
    });
    if (!outputPath) {
        StatusManager.show(STATUS, 'error', 'saveCancelled');
        return;
    }
    StatusManager.show(STATUS, 'processing', 'processing');
    const metadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
    await ipcRenderer.invoke('convert-with-libreoffice', {
        fileData: pdfBytes,
        fileName: model.fileName || 'document.pdf',
        outputPath,
        format: 'docx',
        metadata,
    });
    StatusManager.show(STATUS, 'success', 'successPdfConverted', {
        format: 'DOCX',
        filename: path.basename(outputPath),
        savePath: outputPath,
    });
}

async function exportAsTxt() {
    const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
    const base = (model.fileName || 'document.pdf').replace(/\.pdf$/i, '');
    const outputPath = await ipcRenderer.invoke('show-save-dialog', {
        defaultPath: path.join(downloadsPath, `${base}.txt`),
        filters: [{ name: 'Text Files', extensions: ['txt'] }],
    });
    if (!outputPath) {
        StatusManager.show(STATUS, 'error', 'saveCancelled');
        return;
    }
    StatusManager.show(STATUS, 'processing', 'processing');
    const text = await extractPdfText();
    await fs.writeFile(outputPath, text || '', 'utf8');
    StatusManager.show(STATUS, 'success', 'pdfEditorExportTxtDone', {
        filename: path.basename(outputPath),
        savePath: outputPath,
    });
}

async function exportAsImages(format) {
    if (!model.pdfJsDoc) throw new Error('PDF not loaded');
    const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
    const base = (model.fileName || 'document.pdf').replace(/\.pdf$/i, '');
    const picked = await ipcRenderer.invoke('show-save-dialog', {
        defaultPath: path.join(downloadsPath, `${base}_${format}`),
        filters: [{ name: format === 'jpg' ? 'JPEG' : 'PNG', extensions: [format === 'jpg' ? 'jpg' : 'png'] }],
    });
    if (!picked) {
        StatusManager.show(STATUS, 'error', 'saveCancelled');
        return;
    }
    // Use chosen path (without image ext) as output folder.
    const outDir = picked.replace(/\.(png|jpe?g)$/i, '');
    StatusManager.show(STATUS, 'processing', 'processing');
    await fs.mkdir(outDir, { recursive: true });
    const n = model.pdfJsDoc.numPages || 0;
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpg' ? 0.92 : undefined;
    for (let i = 1; i <= n; i++) {
        const page = await model.pdfJsDoc.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
        if (!blob) throw new Error('Image encode failed');
        const buf = new Uint8Array(await blob.arrayBuffer());
        const name = `page-${String(i).padStart(3, '0')}.${format === 'jpg' ? 'jpg' : 'png'}`;
        await fs.writeFile(path.join(outDir, name), buf);
    }
    StatusManager.show(STATUS, 'success', 'pdfEditorExportImagesDone', {
        count: n,
        savePath: outDir,
        isDirectory: true,
    });
}

async function handleExportFormat(format) {
    if (!model.originalBuffer) return;
    closeExportMenu();
    try {
        if (format === 'docx') {
            if (!confirmRedactionFlattenIfNeeded()) {
                StatusManager.show(STATUS, 'error', 'saveCancelled');
                return;
            }
            await exportAsDocx();
        } else if (format === 'txt') await exportAsTxt();
        else if (format === 'png' || format === 'jpg') await exportAsImages(format);
    } catch (err) {
        console.error('[pdfEditor] export', err);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: err.message || String(err) });
    }
}

function updatePageIndicator(displayIndex) {
    const total = PdfEditorDocumentModel.getActivePageCount(model);
    const current = total === 0 ? 0 : Math.max(1, Math.min(total, displayIndex + 1));
    if (pageInput) {
        pageInput.max = String(Math.max(1, total));
        pageInput.value = String(current || 1);
        pageInput.disabled = total === 0;
    }
    if (pageTotalEl) {
        pageTotalEl.textContent = `/ ${total}`;
    }
    // Legacy element (if present in older markup)
    if (pageIndicator) {
        const tpl =
            typeof window.getMessage === 'function'
                ? window.getMessage('pdfEditorPageIndicator')
                : 'Page {current} / {total}';
        pageIndicator.textContent = tpl
            .replace('{current}', String(current))
            .replace('{total}', String(total));
    }
}

function syncViewModeButtons() {
    const mode = viewerApi?.getViewMode?.() || 'single';
    const isContinuous = mode === (viewerApi?.VIEW_CONTINUOUS || 'continuous');
    viewSingleBtn?.classList.toggle('is-active', !isContinuous);
    viewContinuousBtn?.classList.toggle('is-active', isContinuous);
    viewSingleBtn?.setAttribute('aria-pressed', (!isContinuous).toString());
    viewContinuousBtn?.setAttribute('aria-pressed', isContinuous.toString());
    const singleTitle =
        typeof window.getMessage === 'function'
            ? window.getMessage('pdfEditorViewSingle')
            : 'Pagina singola';
    const contTitle =
        typeof window.getMessage === 'function'
            ? window.getMessage('pdfEditorViewContinuous')
            : 'Scorrimento continuo';
    if (viewSingleBtn) viewSingleBtn.title = singleTitle;
    if (viewContinuousBtn) viewContinuousBtn.title = contTitle;
}

async function goToPageNumber(pageNum) {
    if (!viewerApi) return;
    const total = PdfEditorDocumentModel.getActivePageCount(model);
    if (total === 0) return;
    const clamped = Math.max(1, Math.min(total, Math.floor(Number(pageNum) || 1)));
    const id = viewerApi.goToDisplayIndex(clamped - 1);
    if (!id) return;
    selectedPageId = id;
    if (thumbsApi?.setCurrentPage) {
        thumbsApi.setCurrentPage(id);
    } else {
        document.querySelectorAll('.pdfEditorThumbItem').forEach((el) => {
            el.classList.toggle('selected', el.dataset.pageId === id);
            el.classList.toggle('is-current', el.dataset.pageId === id);
        });
    }
    if (viewerApi.getViewMode() === viewerApi.VIEW_CONTINUOUS) {
        viewerApi.scrollToPageId(id);
        updatePageIndicator(clamped - 1);
        if (toolController) toolController.onViewerRendered();
    } else {
        await refreshUi();
    }
}

async function stepPage(delta) {
    if (!viewerApi) return;
    const idx = viewerApi.getCurrentDisplayIndex();
    await goToPageNumber(idx + 1 + delta);
}

async function setViewMode(mode) {
    if (!viewerApi) return;
    const next =
        mode === 'continuous' || mode === viewerApi.VIEW_CONTINUOUS
            ? viewerApi.VIEW_CONTINUOUS
            : viewerApi.VIEW_SINGLE;
    if (viewerApi.getViewMode() === next) {
        syncViewModeButtons();
        return;
    }
    viewerApi.setViewMode(next);
    syncViewModeButtons();
    await refreshUi();
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
    syncViewModeButtons();
}

function onModelChange() {
    model.pdfJsPagesBySource.clear();
    refreshUi();
    updateUndoRedoButtons();
    markDirty();
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('pdfEditorUndo');
    const redoBtn = document.getElementById('pdfEditorRedo');
    const canUndo = typeof PdfEditorHistory !== 'undefined' && PdfEditorHistory.canUndo();
    const canRedo = typeof PdfEditorHistory !== 'undefined' && PdfEditorHistory.canRedo();
    if (undoBtn) undoBtn.disabled = !canUndo;
    if (redoBtn) redoBtn.disabled = !canRedo;
}

window.__pdfEditorBeforeEdit = () => {
    if (typeof PdfEditorHistory !== 'undefined' && !PdfEditorHistory.isRestoring()) {
        PdfEditorHistory.record(model);
        updateUndoRedoButtons();
    }
    markDirty();
};

function runUndo() {
    if (typeof PdfEditorHistory === 'undefined' || !PdfEditorHistory.canUndo()) return;
    PdfEditorHistory.undo(model);
    model.pdfJsPagesBySource.clear();
    refreshUi();
    updateUndoRedoButtons();
    markDirty();
    if (toolController) toolController.onViewerRendered?.();
}

function runRedo() {
    if (typeof PdfEditorHistory === 'undefined' || !PdfEditorHistory.canRedo()) return;
    PdfEditorHistory.redo(model);
    model.pdfJsPagesBySource.clear();
    refreshUi();
    updateUndoRedoButtons();
    markDirty();
    if (toolController) toolController.onViewerRendered?.();
}

function onPageSelect(pageId) {
    selectedPageId = pageId;
    if (viewerApi?.getViewMode() === viewerApi.VIEW_CONTINUOUS) {
        viewerApi.scrollToPageId(pageId);
        const active = PdfEditorDocumentModel.getActivePages(model);
        const idx = active.findIndex((p) => p.id === pageId);
        updatePageIndicator(idx >= 0 ? idx : 0);
        if (toolController) toolController.onViewerRendered();
        // Don't rebuild thumbs — preserves multi-select highlights.
        thumbsApi?.setCurrentPage?.(pageId);
        return;
    }
    refreshUi();
}

function onPageInView(displayIndex, pageId) {
    selectedPageId = pageId;
    updatePageIndicator(displayIndex);
    if (thumbsApi?.setCurrentPage) {
        thumbsApi.setCurrentPage(pageId);
    } else {
        document.querySelectorAll('.pdfEditorThumbItem').forEach((el) => {
            el.classList.toggle('is-current', el.dataset.pageId === pageId);
        });
    }
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

/** In-app text dialog (Tauri webview does not support window.prompt reliably). */
let askEditorTextPending = null;

function askEditorText({ title = '', value = '', placeholder = '', meta = '' } = {}) {
    const modal = document.getElementById('pdfEditorCommentModal');
    const input = document.getElementById('pdfEditorCommentModalInput');
    const okBtn = document.getElementById('pdfEditorCommentModalOk');
    const cancelBtn = document.getElementById('pdfEditorCommentModalCancel');
    const titleEl = document.getElementById('pdfEditorCommentModalTitle');
    const metaEl = document.getElementById('pdfEditorCommentModalMeta');

    // Close any previous dialog so listeners don't stack / cancel each other.
    if (askEditorTextPending) {
        try {
            askEditorTextPending.cancel();
        } catch (_) { /* ignore */ }
        askEditorTextPending = null;
    }

    return new Promise((resolve) => {
        if (!modal || !input || !okBtn || !cancelBtn) {
            console.warn('[pdfEditor] comment modal missing from DOM');
            resolve(null);
            return;
        }

        // Ensure dialog is not trapped under overflow:hidden editor chrome (WKWebView).
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }

        if (titleEl) titleEl.textContent = title || 'Commento';
        if (metaEl) {
            const metaText = String(meta || '').trim();
            metaEl.textContent = metaText;
            metaEl.hidden = !metaText;
        }
        input.value = value == null ? '' : String(value);
        input.placeholder =
            placeholder ||
            (typeof window.getMessage === 'function'
                ? window.getMessage('pdfEditorCommentPlaceholder')
                : 'Scrivi il commento…');

        modal.hidden = false;
        modal.style.display = 'flex';
        // Force visible above shell chrome.
        modal.style.zIndex = '12000';

        const finish = (result) => {
            if (askEditorTextPending && askEditorTextPending.resolve === resolve) {
                askEditorTextPending = null;
            }
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            input.removeEventListener('keydown', onKey);
            modal.removeEventListener('click', onBackdrop);
            modal.hidden = true;
            modal.style.display = '';
            resolve(result);
        };

        const onOk = () => finish(input.value);
        const onCancel = () => finish(null);
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onOk();
            }
        };
        const onBackdrop = (e) => {
            if (e.target === modal) onCancel();
        };

        askEditorTextPending = {
            resolve,
            cancel: () => finish(null),
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        input.addEventListener('keydown', onKey);
        modal.addEventListener('click', onBackdrop);

        requestAnimationFrame(() => {
            try {
                input.focus({ preventScroll: true });
                const len = input.value.length;
                if (len > 0) input.setSelectionRange(len, len);
            } catch (_) { /* ignore */ }
        });
    });
}

window.__pdfEditorAskText = askEditorText;

async function resolveCommentAuthor() {
    try {
        const ipc = window.ipcRenderer;
        if (ipc?.invoke) {
            const meta = await ipc.invoke('get-pdf-metadata');
            const a = String(meta?.author || '').trim();
            if (a) return a;
        }
    } catch (_) { /* ignore */ }
    return typeof window.getMessage === 'function'
        ? window.getMessage('pdfEditorCommentAuthorFallback')
        : 'Utente';
}

function formatCommentTimestamp(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return '';
    try {
        return new Date(n).toLocaleString(undefined, {
            dateStyle: 'short',
            timeStyle: 'short',
        });
    } catch (_) {
        return '';
    }
}

function formatCommentMeta(comment) {
    const author =
        String(comment?.author || '').trim() ||
        (typeof window.getMessage === 'function'
            ? window.getMessage('pdfEditorCommentAuthorFallback')
            : 'Utente');
    const when = formatCommentTimestamp(comment?.createdAt || comment?.updatedAt);
    if (author && when) return `${author} · ${when}`;
    return author || when || '';
}

window.__pdfEditorGetCommentAuthor = resolveCommentAuthor;
window.__pdfEditorFormatCommentMeta = formatCommentMeta;

async function openPdfWithPassword(previewBuffer, knownPassword = '') {
    let password = knownPassword || '';
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

async function loadPdfFile(file, filePath = null, options = {}) {
    StatusManager.show(STATUS, 'processing', 'pdfEditorLoading');

    try {
        prepareInspectorForDocumentSwitch();

        const alreadyEditing = document.body.classList.contains('pdfEditorEditing');
        const forceNewTab = options.newTab === true || fileInput.dataset.pdeffyNewTab === '1';
        try {
            delete fileInput.dataset.pdeffyNewTab;
        } catch (_) {
            /* ignore */
        }
        const openNewTab = forceNewTab || (alreadyEditing && options.replaceActive !== true);

        if (openNewTab && alreadyEditing) {
            persistActiveSession();
            const session = createDocumentSession();
            documentSessions.push(session);
            activeDocId = session.id;
            destroyCurrentPdfDoc();
            PdfEditorDocumentModel.resetModel(model);
            selectedPageId = null;
            lastSavedPath = null;
            documentExtras = emptyDocumentExtras();
            isDirty = false;
        } else if (!documentSessions.length) {
            const session = createDocumentSession(createSessionId());
            documentSessions.push(session);
            activeDocId = session.id;
            destroyCurrentPdfDoc();
            PdfEditorDocumentModel.resetModel(model);
        } else if (!openNewTab) {
            persistActiveSession();
            destroyCurrentPdfDoc();
            PdfEditorDocumentModel.resetModel(model);
        }

        const buffer = await file.arrayBuffer();
        // Keep a dedicated copy for export; PDF.js may detach the buffer used for preview.
        const exportBuffer = buffer.slice(0);
        const previewBuffer = buffer.slice(0);

        const { pdf, password } = await openPdfWithPassword(previewBuffer);
        model.originalBuffer = exportBuffer;
        model.fileName = file.name;
        model.filePath = null;
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
        if (resolvedPath) {
            model.filePath = resolvedPath;
            if (!isTempEditPath(resolvedPath)) lastSavedPath = resolvedPath;
            else lastSavedPath = null;
        } else {
            lastSavedPath = null;
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                const tempDir = await ipcRenderer.invoke('get-temp-dir');
                const out = path.join(tempDir, `pdeffy-edit-${Date.now()}-${file.name}`);
                await invoke('write-file-bytes', {
                    path: out,
                    contents: Array.from(new Uint8Array(exportBuffer.slice(0))),
                });
                model.filePath = out;
            } catch (_) {
                model.filePath = null;
            }
        }
        clearDirty();
        try {
            const { pushRecentDocument, getPdfEditorHref } = await import('/src/ui/shell.js');
            pushRecentDocument({
                name: file.name,
                path: model.filePath,
                href: getPdfEditorHref?.() || './pdfEditor.html',
            });
        } catch (_) { /* ignore */ }
        try {
            const { cacheRecentFile } = await import('/src/ui/recentFiles.js');
            // Cache a copy for reopen even if path is lost across sessions.
            await cacheRecentFile({
                name: file.name,
                path: model.filePath,
                buffer: exportBuffer.slice(0),
            });
        } catch (_) { /* ignore */ }

        model.hasEmbeddedText = true;
        model.ocrText = '';
        model.anonymizedText = '';
        model.anonDualView = false;
        model.viewerContentMode = 'pdf';
        model.markups = model.markups || [];
        model.comments = [];
        model.inks = [];
        model.bookmarks = [];
        model.formFields = [];
        model.formValues = {};
        model.formInitialValues = {};
        model.manualFormFills = [];
        model.acroFormPresent = false;
        if (typeof PdfEditorHistory !== 'undefined') {
            PdfEditorHistory.clear();
            updateUndoRedoButtons();
        }
        try {
            model.hasEmbeddedText = await probeEmbeddedText(pdf);
        } catch (_) {
            model.hasEmbeddedText = true;
        }
        try {
            const meta = await pdf.getMetadata();
            model.acroFormPresent = !!meta?.info?.IsAcroFormPresent;
        } catch (_) {
            model.acroFormPresent = false;
        }
        try {
            if (typeof PdfEditorFormFields !== 'undefined') {
                const extracted = await PdfEditorFormFields.extractFormFields(pdf, model.pages);
                model.formFields = extracted.fields || [];
                model.formValues = { ...(extracted.values || {}) };
                model.formInitialValues = { ...(extracted.values || {}) };
            }
        } catch (err) {
            console.warn('[pdfEditor] extract form fields', err);
            model.formFields = [];
            model.formValues = {};
            model.formInitialValues = {};
        }
        updateOcrViewTabs();

        if (!thumbsApi) {
            thumbsApi = PdfEditorPageThumbnails.createPageThumbnails({
                containerEl: thumbsContainer,
                getModel: () => model,
                onPageSelect,
                onModelChange,
                getPdfPage,
            });
        }

        if (!viewerApi) {
            viewerApi = PdfEditorViewer.createPdfViewer({
                scrollContainerEl: viewerScroll,
                singleContainerEl: viewerSingle,
                getModel: () => model,
                getPdfPage,
                onPageInView,
                onAfterRender: () => {
                    if (toolController) toolController.onViewerRendered();
                    refreshAiHighlights();
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
                getFilePath: () => model.filePath || null,
                onModelChange,
                onExportStateChange: updateExportButton,
                getPdfPage,
                onGoToPage: async (pageId, displayIndex) => {
                    selectedPageId = pageId;
                    if (thumbsApi?.setCurrentPage) {
                        thumbsApi.setCurrentPage(pageId);
                    } else {
                        document.querySelectorAll('.pdfEditorThumbItem').forEach((el) => {
                            el.classList.toggle('is-current', el.dataset.pageId === pageId);
                            el.classList.toggle('selected', el.dataset.pageId === pageId);
                        });
                    }
                    if (viewerApi?.getViewMode() === viewerApi.VIEW_CONTINUOUS) {
                        viewerApi.scrollToPageId(pageId);
                        updatePageIndicator(displayIndex);
                        // Keep overlays in sync; search highlights are painted by goToIndex after await.
                        if (toolController) toolController.onViewerRendered();
                    } else if (viewerApi?.getCurrentDisplayIndex?.() === displayIndex) {
                        // Already on this page — avoid a full DOM rebuild that races highlight paint.
                        updatePageIndicator(displayIndex);
                    } else {
                        await refreshUi();
                    }
                },
            });
            toolController.initTabs();
        }

        await refreshUi();
        await refreshDocumentExtras();
        await refreshDocumentMetadata();
        persistActiveSession();
        syncDocumentTabs();
        requestAnimationFrame(() => {
            refreshUi();
        });
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
    if (document.body.classList.contains('pdfEditorDocInfoOpen') && typeof PdfEditorDocumentInfo !== 'undefined') {
        PdfEditorDocumentInfo.close(false);
    }
    setInspectorMode('tool');
    documentSessions.forEach((s) => {
        if (s.id === activeDocId) destroyCurrentPdfDoc();
    });
    documentSessions = [];
    activeDocId = null;
    documentTabBar?.render();
    if (typeof PdfEditorTextSearch !== 'undefined') PdfEditorTextSearch.clear();
    PdfEditorDocumentModel.resetModel(model);
    selectedPageId = null;
    toolController = null;
    document.querySelectorAll('.pdfEditorToolTab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tool === 'select');
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
    lastSavedPath = null;
    clearDirty();
    clearDocumentExtrasUi();
    updateFileActions();
    closeExportMenu();
    closeFileMoreMenu();
    if (dirtyBadge) dirtyBadge.hidden = true;
    const ocrTabs = document.getElementById('pdfEditorViewModeTabs');
    if (ocrTabs) ocrTabs.hidden = true;
    const ocrView = document.getElementById('pdfEditorOcrView');
    if (ocrView) ocrView.hidden = true;
    renderEditRecent();
}

dropZone.addEventListener('click', (e) => {
    // Label "Open PDF" already opens the dialog via htmlFor; avoid a second dialog.
    if (e.target === fileInput || e.target.closest('label[for="pdfEditorFileInput"]')) {
        return;
    }
    fileInput.click();
});

openFileBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.click();
});

saveBtn?.addEventListener('click', async () => {
    closeFileMoreMenu();
    await savePdf();
});

saveAsBtn?.addEventListener('click', async () => {
    closeFileMoreMenu();
    await savePdfAs();
});

exportMenuBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleExportMenu();
});

fileMoreBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFileMoreMenu();
});

exportMenu?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-export]');
    if (!btn) return;
    closeExportMenu();
    await handleExportFormat(btn.dataset.export);
});

shareBtn?.addEventListener('click', async () => {
    closeExportMenu();
    closeFileMoreMenu();
    await shareCurrentPdf();
});

printBtn?.addEventListener('click', async () => {
    closeExportMenu();
    closeFileMoreMenu();
    await printCurrentPdf();
});

document.addEventListener('click', (e) => {
    if (e.target.closest('.pdfEditorActionMenuWrap')) return;
    closeExportMenu();
    closeFileMoreMenu();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeExportMenu();
        closeFileMoreMenu();
        closeAttachmentsModal();
        closeSignaturesModal();
        if (document.body.classList.contains('pdfEditorDocInfoOpen') && typeof PdfEditorDocumentInfo !== 'undefined') {
            PdfEditorDocumentInfo.close(true);
        }
    }
});

wireDocumentExtrasUi();

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
        e.target.value = '';
        return;
    }

    if (model.originalBuffer && hasUnsavedChanges()) {
        const confirmMsg =
            typeof window.getMessage === 'function'
                ? window.getMessage('pdfEditorConfirmDiscard')
                : 'Discard unsaved changes and open another PDF?';
        if (!window.confirm(confirmMsg)) {
            e.target.value = '';
            return;
        }
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

        const targetPath = doc?.path || null;

        const { fileForRecentDoc } = await import('/src/ui/recentFiles.js');
        const resolved = await fileForRecentDoc(doc);
        const resolvedPath = resolved?.path || targetPath;

        if (resolvedPath && document.body.classList.contains('pdfEditorEditing')) {
            const existingId = findSessionIdByFilePath(resolvedPath);
            if (existingId) {
                await activateDocumentSession(existingId);
                return;
            }
        }

        if (resolved?.file && isPdfFile(resolved.file)) {
            await loadPdfFile(resolved.file, resolvedPath);
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

const zoomMenuBtn = document.getElementById('pdfEditorZoomMenuBtn');
const zoomMenu = document.getElementById('pdfEditorZoomMenu');
const zoomMenuWrap = document.querySelector('.pdfEditorZoomMenu');

function closeZoomMenu() {
    if (zoomMenu) zoomMenu.hidden = true;
    zoomMenuBtn?.setAttribute('aria-expanded', 'false');
}

zoomMenuBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const willOpen = zoomMenu?.hidden !== false;
    if (zoomMenu) zoomMenu.hidden = !willOpen;
    zoomMenuBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
});
zoomMenu?.addEventListener('click', (e) => e.stopPropagation());
zoomMenu?.querySelectorAll('[data-zoom]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const z = parseInt(btn.dataset.zoom, 10);
        viewerApi?.setZoomPercent(z);
        zoomLabel.textContent = `${z}%`;
        closeZoomMenu();
        await refreshUi();
    });
});
document.addEventListener('click', (e) => {
    if (zoomMenuWrap?.contains(e.target)) return;
    closeZoomMenu();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeZoomMenu();
});

document.getElementById('pdfEditorSearchToggle')?.addEventListener('click', () => {
    const bar = document.getElementById('pdfEditorSearchBar');
    if (!bar) return;
    bar.hidden = !bar.hidden;
    document.getElementById('pdfEditorSearchToggle')?.setAttribute('aria-expanded', bar.hidden ? 'false' : 'true');
    if (!bar.hidden) document.getElementById('pdfEditorSearchInput')?.focus();
});

document.getElementById('pdfEditorFullscreen')?.addEventListener('click', async () => {
    const panel = document.querySelector('.pdfEditorPreviewPanel');
    if (!panel) return;
    const btn = document.getElementById('pdfEditorFullscreen');

    // Prefer native fullscreen; fall back to CSS overlay (more reliable in Tauri webview).
    try {
        if (!document.fullscreenElement && panel.requestFullscreen) {
            await panel.requestFullscreen();
            btn?.classList.add('is-active');
            return;
        }
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            btn?.classList.remove('is-active');
            return;
        }
    } catch (_) { /* use CSS fallback */ }

    const on = panel.classList.toggle('pdfEditorFs');
    document.body.classList.toggle('pdfEditorFsActive', on);
    btn?.classList.toggle('is-active', on);
});

document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('pdfEditorFullscreen');
    if (!document.fullscreenElement) {
        btn?.classList.remove('is-active');
        document.querySelector('.pdfEditorPreviewPanel')?.classList.remove('pdfEditorFs');
        document.body.classList.remove('pdfEditorFsActive');
    }
});

document.getElementById('pdfEditorUndo')?.addEventListener('click', () => runUndo());
document.getElementById('pdfEditorRedo')?.addEventListener('click', () => runRedo());

document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('pdfEditorEditing')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        runUndo();
    } else if (key === 'z' && e.shiftKey) {
        e.preventDefault();
        runRedo();
    } else if (key === 'y') {
        e.preventDefault();
        runRedo();
    }
});

let panEnabled = false;
document.getElementById('pdfEditorPanTool')?.addEventListener('click', () => {
    panEnabled = !panEnabled;
    const btn = document.getElementById('pdfEditorPanTool');
    btn?.setAttribute('aria-pressed', panEnabled ? 'true' : 'false');
    btn?.classList.toggle('is-active', panEnabled);
    document.body.classList.toggle('pdfEditorPanning', panEnabled);
});

if (typeof window.PdfEditorTextSelection !== 'undefined') {
    window.PdfEditorTextSelection.init({
        model,
        getPdfPage,
        onChange: () => {
            updateExportButton();
            if (viewerApi) {
                PdfEditorOverlayManager.syncOverlays(model, viewerApi);
            }
            if (toolController) toolController.onViewerRendered?.();
        },
        isPanActive: () => panEnabled,
    });
}

(function wirePanDrag() {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;
    let el = null;

    function scrollTarget() {
        const scroll = document.getElementById('pdfEditorViewerScroll');
        const single = document.getElementById('pdfEditorViewerSingle');
        if (scroll && scroll.style.display !== 'none' && scroll.offsetParent !== null) return scroll;
        return single;
    }

    document.addEventListener('pointerdown', (e) => {
        if (!panEnabled || e.button !== 0) return;
        el = scrollTarget();
        if (!el || !el.contains(e.target)) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        scrollLeft = el.scrollLeft;
        scrollTop = el.scrollTop;
        el.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    });
    document.addEventListener('pointermove', (e) => {
        if (!dragging || !el) return;
        el.scrollLeft = scrollLeft - (e.clientX - startX);
        el.scrollTop = scrollTop - (e.clientY - startY);
    });
    document.addEventListener('pointerup', () => {
        dragging = false;
        el = null;
    });
})();

document.getElementById('pdfEditorPrevPage').addEventListener('click', () => stepPage(-1));

document.getElementById('pdfEditorNextPage').addEventListener('click', () => stepPage(1));

pageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        goToPageNumber(pageInput.value);
        pageInput.blur();
    }
});
pageInput?.addEventListener('change', () => {
    goToPageNumber(pageInput.value);
});

viewSingleBtn?.addEventListener('click', () => setViewMode('single'));
viewContinuousBtn?.addEventListener('click', () => setViewMode('continuous'));

async function probeEmbeddedText(pdf) {
    const maxPages = Math.min(pdf.numPages, 3);
    let chars = 0;
    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        for (const item of tc.items || []) {
            chars += (item.str || '').trim().length;
            if (chars > 40) return true;
        }
    }
    return chars > 20;
}

function updateOcrViewTabs() {
    const bar = document.getElementById('pdfEditorAnonViewBar');
    const tabs = document.getElementById('pdfEditorViewModeTabs');
    if (!bar || !tabs) return;

    const isScan = model.hasEmbeddedText === false;
    const hasOcrResult = Boolean(model.ocrText);
    const hasAnon = Boolean(model.anonymizedText);
    const anonMode = Boolean(model.anonDualView);
    const show = anonMode || hasAnon || (isScan && hasOcrResult);
    bar.hidden = !show;

    if (!show && model.viewerContentMode === 'text') {
        setViewerContentMode('pdf');
    }
}

function buildAnonLegendMenu() {
    const menu = document.getElementById('pdfEditorAnonLegendMenu');
    if (!menu) return;
    const items = [
        ['NOME', 'assistenteCatNames', '#EAB308'],
        ['ORGANIZZAZIONE', 'assistenteCatOrg', '#F97316'],
        ['INDIRIZZO', 'assistenteCatAddresses', '#06B6D4'],
        ['EMAIL', 'assistenteCatContact', '#EC4899'],
        ['CODICE_FISCALE', 'assistenteCatCf', '#22C55E'],
        ['IBAN', 'assistenteCatIban', '#EF4444'],
    ];
    menu.innerHTML = '';
    if (!global.__pdfEditorAnonLegendHidden) {
        global.__pdfEditorAnonLegendHidden = new Set();
    }
    for (const [type, labelKey, color] of items) {
        const row = document.createElement('label');
        row.className = 'pdfEditorAnonLegendRow';
        const hidden = global.__pdfEditorAnonLegendHidden.has(type);
        row.innerHTML = `<input type="checkbox" ${hidden ? '' : 'checked'} data-cat="${type}"><span class="anonCatDot" style="--anon-cat:${color}"></span><span class="langText">${typeof window.getMessage === 'function' ? window.getMessage(labelKey) : type}</span>`;
        row.querySelector('input')?.addEventListener('change', (ev) => {
            if (ev.target.checked) global.__pdfEditorAnonLegendHidden.delete(type);
            else global.__pdfEditorAnonLegendHidden.add(type);
            if (typeof global.__pdfEditorRefreshAiHighlights === 'function') {
                global.__pdfEditorRefreshAiHighlights();
            }
        });
        menu.appendChild(row);
    }
}

global.__pdfEditorAnonPreviewOnPdf = false;

window.__pdfEditorSetAnonViewBarVisible = (visible) => {
    const bar = document.getElementById('pdfEditorAnonViewBar');
    if (bar) bar.hidden = !visible;
    updateOcrViewTabs();
};

window.__pdfEditorSetAnonLegendVisible = () => {
    /* legend removed in sequential review */
};

window.__pdfEditorSetAnonPreviewText = (text) => {
    model.anonPreviewText = text || '';
};

function setViewerContentMode(mode) {
    if (mode === 'preview') {
        model.viewerContentMode = 'preview';
        global.__pdfEditorAnonPreviewOnPdf = true;
    } else if (mode === 'ocr' || mode === 'anon') {
        model.viewerContentMode = 'text';
        global.__pdfEditorAnonPreviewOnPdf = false;
    } else {
        model.viewerContentMode = mode;
        global.__pdfEditorAnonPreviewOnPdf = false;
    }
    const ocrView = document.getElementById('pdfEditorOcrView');
    const single = document.getElementById('pdfEditorViewerSingle');
    const scroll = document.getElementById('pdfEditorViewerScroll');
    document.querySelectorAll('.pdfEditorViewModeTab').forEach((btn) => {
        const view = btn.dataset.view;
        const active =
            (view === 'pdf' && model.viewerContentMode === 'pdf') ||
            (view === 'preview' && model.viewerContentMode === 'preview') ||
            (view === 'text' && model.viewerContentMode === 'text');
        btn.classList.toggle('active', active);
    });
    if (model.viewerContentMode === 'text') {
        if (ocrView) ocrView.hidden = false;
        if (single) single.style.display = 'none';
        if (scroll) scroll.style.display = 'none';
        const pre = document.getElementById('pdfEditorOcrText');
        if (!pre) return;
        const formatted = model.anonPreviewText || model.ocrText || model.anonymizedText;
        if (formatted) {
            pre.dataset.rawText = formatted;
            pre.textContent = formatted;
            PdfEditorAnonymizeHighlights?.paintOcrText?.(pre);
        } else if (model.hasEmbeddedText === false && model.filePath) {
            loadOcrTextIntoView();
        } else {
            pre.textContent =
                typeof window.getMessage === 'function'
                    ? window.getMessage('pdfEditorOcrNeedDetect')
                    : 'Nessun testo disponibile.';
        }
    } else {
        if (ocrView) ocrView.hidden = true;
        if (single) single.style.display = '';
        if (scroll) scroll.style.display = '';
        if (viewerApi) refreshUi();
        if (typeof global.__pdfEditorRefreshAiHighlights === 'function') {
            global.__pdfEditorRefreshAiHighlights();
        }
    }
}

async function loadOcrTextIntoView() {
    const pre = document.getElementById('pdfEditorOcrText');
    if (!pre) return;
    pre.textContent = '…';

    // Prefer already-cached extract (e.g. after Rileva).
    if (model.ocrText) {
        pre.dataset.rawText = model.ocrText;
        pre.textContent = model.ocrText;
        PdfEditorAnonymizeHighlights?.paintOcrText?.(pre);
        return;
    }

    // Text PDFs: build extract from pdf.js without round-tripping the AI pipeline.
    if (model.hasEmbeddedText !== false && model.pdfJsDoc) {
        try {
            const parts = [];
            const n = model.pdfJsDoc.numPages;
            for (let i = 1; i <= n; i++) {
                const page = await getPdfPage(i - 1);
                if (!page) continue;
                const tc = await page.getTextContent();
                const line = (tc.items || []).map((it) => it.str || '').join(' ');
                if (line.trim()) parts.push(line.trim());
            }
            model.ocrText = parts.join('\n\n');
            pre.dataset.rawText = model.ocrText;
            pre.textContent = model.ocrText || '(nessun testo)';
            PdfEditorAnonymizeHighlights?.paintOcrText?.(pre);
            updateOcrViewTabs();
            return;
        } catch (err) {
            console.warn('[pdfEditor] extract text', err);
        }
    }

    if (!model.filePath) {
        pre.textContent =
            typeof window.getMessage === 'function'
                ? window.getMessage('pdfEditorOcrNeedDetect')
                : 'Usa Rileva per estrarre il testo (OCR).';
        return;
    }

    try {
        const { ipcRenderer } = require('electron');
        const result = await ipcRenderer.invoke('anonymize-pdf', { path: model.filePath });
        let text = result?.anonymizedText || result?.anonymized_text || '';
        const mapping = result?.mapping || {};
        for (const [ph, original] of Object.entries(mapping)) {
            text = text.split(ph).join(original);
        }
        model.ocrText = text || '';
        pre.dataset.rawText = model.ocrText;
        pre.textContent = model.ocrText || '(nessun testo)';
        PdfEditorAnonymizeHighlights?.paintOcrText?.(pre);
        updateOcrViewTabs();
    } catch (err) {
        pre.textContent = String(err?.message || err || 'OCR failed');
    }
}

document.getElementById('pdfEditorViewTabPdf')?.addEventListener('click', () => setViewerContentMode('pdf'));
document.getElementById('pdfEditorViewTabPreview')?.addEventListener('click', () => setViewerContentMode('preview'));
async function refreshAiHighlights() {
    if (!model.pdfJsDoc || typeof PdfEditorAnonymizeHighlights === 'undefined') return;
    if (model.viewerContentMode === 'text' || model.viewerContentMode === 'ocr') {
        const pre = document.getElementById('pdfEditorOcrText');
        PdfEditorAnonymizeHighlights.paintOcrText?.(pre);
        return;
    }
    await PdfEditorAnonymizeHighlights.paint(model, getPdfPage, viewerApi?.getZoomPercent?.() ?? 100);
}
window.__pdfEditorRefreshAiHighlights = refreshAiHighlights;
window.__pdfEditorSetViewerContentMode = setViewerContentMode;
window.__pdfEditorEnsureOcrText = async () => {
    if (model.ocrText) return model.ocrText;
    await loadOcrTextIntoView();
    return model.ocrText || '';
};
window.__pdfEditorSetExtractedText = (text) => {
    model.ocrText = text || '';
    updateOcrViewTabs();
    const pre = document.getElementById('pdfEditorOcrText');
    if (pre && !model.anonymizedText) {
        pre.dataset.rawText = model.ocrText;
        pre.textContent = model.ocrText || '(nessun testo)';
        PdfEditorAnonymizeHighlights?.paintOcrText?.(pre);
    }
};
window.__pdfEditorStoreAnonBaseText = (text) => {
    model.anonymizedText = text || '';
    model.anonDualView = true;
    updateOcrViewTabs();
};

window.__pdfEditorSetAnonymizedText = (text) => {
    window.__pdfEditorStoreAnonBaseText(text);
};

window.__pdfEditorExportAnonymizedPdf = async ({ text, entities }) => {
    window.__pdfEditorSetAnonPreviewText(text || '');
    setViewerContentMode('preview');

    const approved = Array.isArray(entities) ? entities.map((e) => ({ ...e })) : [];
    if (!approved.length) {
        StatusManager.show(STATUS, 'error', 'anonNeedApprove');
        return;
    }

    const savedRedactions = (model.redactions || []).map((r) => ({ ...r }));
    let anonRedactions = [];

    try {
        if (toolController?.commitWatermarkDraft?.()) {
            /* watermark draft merged into model before export */
        }

        if (typeof PdfEditorAnonymizeHighlights?.getNormRedactionsForEntities === 'function') {
            const zoom = viewerApi?.getZoomPercent?.() ?? 100;
            anonRedactions = await PdfEditorAnonymizeHighlights.getNormRedactionsForEntities(
                approved,
                model,
                getPdfPage,
                zoom
            );
        }

        if (!anonRedactions.length) {
            StatusManager.show(STATUS, 'error', 'anonExportNoGeometry');
            return;
        }

        model.redactions = [
            ...savedRedactions,
            ...anonRedactions.map((r, i) => ({
                ...r,
                id: r.id || `anon-export-${Date.now()}-${i}`,
            })),
        ];

        const needsFlatten =
            model.redactions.length > 0 ||
            (model.watermarks && model.watermarks.length > 0);
        if (needsFlatten && !confirmRedactionFlattenIfNeeded()) {
            return;
        }

        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const base = (model.fileName || 'document.pdf').replace(/\.pdf$/i, '');
        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: path.join(downloadsPath, `${base}_anonimizzato.pdf`),
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (!outputPath) {
            StatusManager.show(STATUS, 'error', 'saveCancelled');
            return;
        }

        StatusManager.show(
            STATUS,
            'processing',
            model.redactions.length ? 'pdfEditorFlatteningRedactions' : 'processing'
        );
        const metadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
        const pdfBytes = await PdfEditorBuildPdf.buildPdf(model, metadata);
        await fs.writeFile(outputPath, pdfBytes);
        StatusManager.show(STATUS, 'success', 'anonExportPdfDone', {
            filename: path.basename(outputPath),
            savePath: outputPath,
        });
    } catch (err) {
        console.warn('[pdfEditor] anon pdf export', err);
        StatusManager.show(STATUS, 'error', String(err?.message || err || 'Export failed'));
    } finally {
        model.redactions = savedRedactions;
        refreshUi();
        if (typeof global.__pdfEditorRefreshAiHighlights === 'function') {
            global.__pdfEditorRefreshAiHighlights();
        }
    }
};
window.__pdfEditorSetAnonDualView = (enabled) => {
    model.anonDualView = !!enabled;
    if (!enabled && !model.anonymizedText && model.hasEmbeddedText !== false) {
        if (model.viewerContentMode === 'text') setViewerContentMode('pdf');
    }
    updateOcrViewTabs();
};

window.addEventListener('languageChanged', () => {
    updatePageIndicator(
        PdfEditorDocumentModel.getActivePages(model).findIndex((p) => p.id === selectedPageId)
    );
    const undoBtn = document.getElementById('pdfEditorUndo');
    const redoBtn = document.getElementById('pdfEditorRedo');
    if (undoBtn) {
        undoBtn.title =
            typeof window.getMessage === 'function' ? window.getMessage('pdfEditorUndo') : 'Annulla';
        undoBtn.setAttribute('aria-label', undoBtn.title);
    }
    if (redoBtn) {
        redoBtn.title =
            typeof window.getMessage === 'function' ? window.getMessage('pdfEditorRedo') : 'Ripristina';
        redoBtn.setAttribute('aria-label', redoBtn.title);
    }
});

document.getElementById('pdfEditorPropsToggle')?.addEventListener('click', () => {
    document.body.classList.toggle('pdfEditorPropsCollapsed');
    const btn = document.getElementById('pdfEditorPropsToggle');
    if (btn) {
        const collapsed = document.body.classList.contains('pdfEditorPropsCollapsed');
        btn.textContent = collapsed ? '›' : '×';
    }
});
