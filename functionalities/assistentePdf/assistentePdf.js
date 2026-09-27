/**
 * Assistente PDF — unified local AI workspace (summary / anonymize / ask).
 * Reuses pdfEditor viewer + thumbnails; right panel hosts AI tools.
 */
import { invoke } from '@tauri-apps/api/core';
import { pathOfFile } from '../../src/ui/filePicker.js';

const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs').promises;

const STATUS = '#pdfEditorStatus';

const dropZone = document.getElementById('pdfEditorDropZone');
const fileInput = document.getElementById('pdfEditorFileInput');
const workspace = document.getElementById('pdfEditorWorkspace');
const fileNameEl = document.getElementById('pdfEditorFileName');
const changeFileBtn = document.getElementById('pdfEditorChangeFile');
const thumbsContainer = document.getElementById('pdfEditorThumbs');
const viewerSingle = document.getElementById('pdfEditorViewerSingle');
const viewerScroll = document.getElementById('pdfEditorViewerScroll');
const pageIndicator = document.getElementById('pdfEditorPageIndicator');
const zoomLabel = document.getElementById('pdfEditorZoomLabel');

const model = PdfEditorDocumentModel.createDocumentModel();
let selectedPageId = null;
let thumbsApi = null;
let viewerApi = null;
let pdfNativePath = null;

/** @type {{ entityType: string, placeholder: string, start: number, end: number, value: string, approved: boolean, id: string }[]} */
let entities = [];
let lastMapping = {};
let lastAnonymizedText = '';
let modelReady = false;

const ENTITY_LABELS = {
  NOME: 'assistenteTypeName',
  INDIRIZZO: 'assistenteTypeAddress',
  ORGANIZZAZIONE: 'assistenteTypeOrg',
  EMAIL: 'assistenteTypeEmail',
  TELEFONO: 'assistenteTypePhone',
  CODICE_FISCALE: 'assistenteTypeCf',
  PARTITA_IVA: 'assistenteTypePiva',
  IBAN: 'assistenteTypeIban',
  CARTA: 'assistenteTypeCard',
  IP: 'assistenteTypeIp',
};

function t(key, fallback) {
  if (typeof window.getMessage === 'function') {
    const v = window.getMessage(key);
    if (v && v !== key) return v;
  }
  return fallback;
}

function formatInvokeError(err) {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err.trim() || 'Unknown error';
  if (err instanceof Error && err.message) return err.message;
  if (typeof err.message === 'string' && err.message.trim()) return err.message;
  try {
    const json = JSON.stringify(err);
    if (json && json !== '{}') return json;
  } catch (_) { /* ignore */ }
  return String(err);
}

async function getPdfPage(sourceIndex) {
  if (!model.pdfJsDoc) return null;
  if (model.pdfJsPagesBySource.has(sourceIndex)) {
    return model.pdfJsPagesBySource.get(sourceIndex);
  }
  const page = await model.pdfJsDoc.getPage(sourceIndex + 1);
  model.pdfJsPagesBySource.set(sourceIndex, page);
  return page;
}

function updatePageIndicator(displayIndex) {
  const total = PdfEditorDocumentModel.getActivePageCount(model);
  const current = total === 0 ? 0 : displayIndex + 1;
  const tpl = t('pdfEditorPageIndicator', 'Pagina {current} / {total}');
  pageIndicator.textContent = tpl
    .replace('{current}', String(current))
    .replace('{total}', String(total));
}

async function refreshUi() {
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
  scheduleHighlightPaint();
}

function onPageSelect(pageId) {
  selectedPageId = pageId;
  refreshUi();
}

function onPageInView(displayIndex, pageId) {
  selectedPageId = pageId;
  updatePageIndicator(displayIndex);
  document.querySelectorAll('.pdfEditorThumbItem').forEach((el) => {
    el.classList.toggle('selected', el.dataset.pageId === pageId);
  });
  scheduleHighlightPaint();
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

  return new Promise((resolve, reject) => {
    if (!modal || !input || !okBtn || !cancelBtn) {
      reject(new Error('Password UI missing'));
      return;
    }
    input.value = '';
    if (errEl) {
      errEl.hidden = !isRetry;
      errEl.textContent = isRetry ? t('pdfEditorPasswordWrong', 'Password errata') : '';
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
      const opts = { data: previewBuffer.slice(0), disableWorker: true };
      if (password) opts.password = password;
      const pdf = await window.pdfjsLib.getDocument(opts).promise;
      return { pdf, password: password || null };
    } catch (err) {
      if (!isPasswordException(err)) throw err;
      password = await promptPdfPassword(attempt > 0);
      attempt += 1;
    }
  }
  throw new Error(t('pdfEditorPasswordWrong', 'Password errata'));
}

async function resolvePdfPath(file) {
  const native = pathOfFile(file);
  if (native) return native;
  const tempDir = await ipcRenderer.invoke('get-temp-dir');
  const out = path.join(tempDir, `pdeffy-assistente-${Date.now()}-${file.name}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await invoke('write-file-bytes', { path: out, contents: Array.from(bytes) });
  return out;
}

async function loadPdfFile(file, filePath = null) {
  StatusManager.show(STATUS, 'processing', 'pdfEditorLoading');
  try {
    const buffer = await file.arrayBuffer();
    const exportBuffer = buffer.slice(0);
    const { pdf, password } = await openPdfWithPassword(buffer.slice(0));

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

    pdfNativePath = filePath || file?.pdeffyPath || (await resolvePdfPath(file));

    fileNameEl.textContent = file.name;
    dropZone.style.display = 'none';
    const recentSection = document.getElementById('pdfEditorRecent');
    if (recentSection) recentSection.style.display = 'none';
    workspace.classList.add('visible');
    document.body.classList.add('pdfEditorEditing', 'pdeffy-sidebar-collapsed');

    try {
      const { pushRecentDocument, getAssistentePdfHref } = await import('/src/ui/shell.js');
      pushRecentDocument({
        name: file.name,
        path: pdfNativePath,
        href: getAssistentePdfHref?.() || './assistentePdf.html',
      });
    } catch (_) { /* ignore */ }

    try {
      const { cacheRecentFile } = await import('/src/ui/recentFiles.js');
      await cacheRecentFile({
        name: file.name,
        path: pdfNativePath,
        buffer: exportBuffer.slice(0),
      });
    } catch (_) { /* ignore */ }

    if (!thumbsApi) {
      thumbsApi = PdfEditorPageThumbnails.createPageThumbnails({
        containerEl: thumbsContainer,
        model,
        onPageSelect,
        onModelChange: () => {
          model.pdfJsPagesBySource.clear();
          refreshUi();
        },
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
        onAfterRender: () => scheduleHighlightPaint(),
      });
      viewerApi.setViewMode?.(viewerApi.VIEW_SINGLE || 'single');
    }

    entities = [];
    lastMapping = {};
    lastAnonymizedText = '';
    renderEntityList();
    document.getElementById('assistenteAnonResult').hidden = true;
    document.getElementById('assistenteSummaryResult').hidden = true;

    await refreshUi();
    StatusManager.show(STATUS, 'success', 'pdfEditorReady');
    await refreshModelStatus();
  } catch (err) {
    if (err?.name === 'PasswordCancelled') {
      StatusManager.show(STATUS, 'error', 'pdfEditorCancelled');
      return;
    }
    console.error(err);
    StatusManager.show(STATUS, 'error', formatInvokeError(err));
  }
}

/* —— Tabs —— */
function setActiveTab(tab) {
  document.querySelectorAll('.assistenteTabs .pdfEditorToolTab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.assistentePanel').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tab;
  });
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    history.replaceState(null, '', url);
  } catch (_) { /* ignore */ }
}

document.querySelectorAll('.assistenteTabs .pdfEditorToolTab').forEach((btn) => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

/* —— Summary —— */
async function refreshModelStatus() {
  try {
    const status = await ipcRenderer.invoke('get-model-status');
    modelReady = Boolean(status?.downloaded) && !status?.downloading;
  } catch (_) {
    modelReady = false;
  }
  const notice = document.getElementById('assistenteModelNotice');
  if (notice) notice.hidden = modelReady;
  const btn = document.getElementById('assistenteSummarizeBtn');
  if (btn) btn.disabled = !(pdfNativePath && modelReady);
}

document.getElementById('assistenteSummarizeBtn')?.addEventListener('click', async () => {
  if (!pdfNativePath) return;
  if (!modelReady) {
    StatusManager.show(STATUS, 'error', 'summarizeNeedModel');
    return;
  }
  const btn = document.getElementById('assistenteSummarizeBtn');
  btn.disabled = true;
  StatusManager.show(STATUS, 'processing', 'summarizeWorking');
  try {
    const summary = await ipcRenderer.invoke('summarize-pdf', { path: pdfNativePath });
    const box = document.getElementById('assistenteSummaryResult');
    const ta = document.getElementById('assistenteSummaryText');
    ta.value = typeof summary === 'string' ? summary : String(summary ?? '');
    box.hidden = false;
    StatusManager.show(STATUS, 'success', 'summarizeDone');
  } catch (err) {
    StatusManager.show(STATUS, 'error', formatInvokeError(err));
  } finally {
    btn.disabled = !(pdfNativePath && modelReady);
  }
});

document.getElementById('assistenteCopySummary')?.addEventListener('click', async () => {
  const ta = document.getElementById('assistenteSummaryText');
  try {
    await navigator.clipboard.writeText(ta.value);
    StatusManager.show(STATUS, 'success', 'summarizeCopied');
  } catch (_) {
    StatusManager.show(STATUS, 'error', 'copyFailed');
  }
});

/* —— Anonymize —— */
function categoryAllows(entityType) {
  const checked = new Set(
    [...document.querySelectorAll('#assistenteCategories input:checked')].map((el) => el.value)
  );
  if (entityType === 'EMAIL' || entityType === 'TELEFONO') return checked.has('CONTACT');
  if (entityType === 'CARTA' || entityType === 'IBAN' || entityType === 'PARTITA_IVA' || entityType === 'IP') {
    return checked.has('IBAN') || checked.has(entityType);
  }
  return checked.has(entityType);
}

function entityTypeLabel(type) {
  const key = ENTITY_LABELS[type];
  return key ? t(key, type) : type;
}

function renderEntityList() {
  const list = document.getElementById('assistenteEntityList');
  const visible = entities.filter((e) => categoryAllows(e.entityType));
  document.getElementById('assistenteDetectCount').textContent = String(visible.length);
  list.innerHTML = '';

  for (const ent of visible) {
    const card = document.createElement('div');
    card.className = `assistenteEntityCard${ent.approved ? '' : ' is-ignored'}`;
    card.dataset.id = ent.id;

    const value = document.createElement('div');
    value.className = 'assistenteEntityValue';
    value.textContent = ent.value;

    const type = document.createElement('div');
    type.className = 'assistenteEntityType';
    type.textContent = entityTypeLabel(ent.entityType);

    const actions = document.createElement('div');
    actions.className = 'assistenteEntityActions';

    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'pdeffy-btn pdeffy-btn-primary';
    approve.textContent = t('assistenteApprove', 'Approva');
    approve.addEventListener('click', (e) => {
      e.stopPropagation();
      ent.approved = true;
      renderEntityList();
      scheduleHighlightPaint();
      updateApplyEnabled();
    });

    const ignore = document.createElement('button');
    ignore.type = 'button';
    ignore.className = 'pdeffy-btn pdeffy-btn-ghost';
    ignore.textContent = t('assistenteIgnore', 'Ignora');
    ignore.addEventListener('click', (e) => {
      e.stopPropagation();
      ent.approved = false;
      renderEntityList();
      scheduleHighlightPaint();
      updateApplyEnabled();
    });

    actions.append(approve, ignore);
    card.append(value, type, actions);
    card.addEventListener('click', () => {
      document.querySelectorAll('.assistenteEntityCard').forEach((c) => c.classList.remove('is-active'));
      card.classList.add('is-active');
      focusEntityInViewer(ent);
    });
    list.appendChild(card);
  }
  updateApplyEnabled();
}

function updateApplyEnabled() {
  const btn = document.getElementById('assistenteApplyBtn');
  const hasApproved = entities.some((e) => e.approved && categoryAllows(e.entityType));
  btn.disabled = !hasApproved;
}

document.getElementById('assistenteCategories')?.addEventListener('change', () => {
  renderEntityList();
  scheduleHighlightPaint();
});

document.getElementById('assistenteDetectBtn')?.addEventListener('click', runDetect);

async function runDetect() {
  if (!pdfNativePath) {
    StatusManager.show(STATUS, 'error', 'pleaseSelectFile');
    return;
  }
  StatusManager.show(STATUS, 'processing', 'assistenteDetecting');
  try {
    const result = await ipcRenderer.invoke('anonymize-pdf', { path: pdfNativePath });
    lastAnonymizedText = result?.anonymizedText || result?.anonymized_text || '';
    lastMapping = result?.mapping || {};
    const found = result?.entitiesFound || result?.entities_found || [];

    // Invert mapping for display values
    const phToValue = lastMapping;
    entities = found.map((e, i) => {
      const placeholder = e.placeholder;
      const value = phToValue[placeholder] || '';
      return {
        id: `ent_${i}`,
        entityType: e.entityType || e.entity_type || 'UNKNOWN',
        placeholder,
        start: e.start ?? 0,
        end: e.end ?? 0,
        value,
        approved: true,
      };
    });

    // Deduplicate by value+type for the list UI
    const seen = new Set();
    entities = entities.filter((e) => {
      const key = `${e.entityType}::${e.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return Boolean(e.value);
    });

    renderEntityList();
    document.getElementById('assistenteAnonResult').hidden = true;
    scheduleHighlightPaint();
    const n = entities.filter((e) => categoryAllows(e.entityType)).length;
    StatusManager.show(
      STATUS,
      'success',
      n ? 'assistenteDetectDone' : 'assistenteDetectEmpty'
    );
  } catch (err) {
    StatusManager.show(STATUS, 'error', formatInvokeError(err));
  }
}

document.getElementById('assistenteApplyBtn')?.addEventListener('click', () => {
  const ignoredValues = new Set(
    entities.filter((e) => !e.approved || !categoryAllows(e.entityType)).map((e) => e.placeholder)
  );

  // Rebuild text from last anonymized: restore ignored placeholders to originals
  let text = lastAnonymizedText;
  for (const [ph, original] of Object.entries(lastMapping)) {
    if (ignoredValues.has(ph)) {
      text = text.split(ph).join(original);
    }
  }

  const box = document.getElementById('assistenteAnonResult');
  document.getElementById('assistenteAnonText').value = text;
  box.hidden = false;
  StatusManager.show(STATUS, 'success', 'assistenteApplyDone');
});

document.getElementById('assistenteCopyAnon')?.addEventListener('click', async () => {
  const ta = document.getElementById('assistenteAnonText');
  try {
    await navigator.clipboard.writeText(ta.value);
    StatusManager.show(STATUS, 'success', 'summarizeCopied');
  } catch (_) {
    StatusManager.show(STATUS, 'error', 'copyFailed');
  }
});

/* —— Highlights via pdf.js text content —— */
let highlightTimer = null;
function scheduleHighlightPaint() {
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    paintHighlights().catch(() => {});
  }, 80);
}

async function paintHighlights() {
  const layer = document.getElementById('assistenteHighlightLayer');
  if (!layer || !model.pdfJsDoc || !viewerApi) {
    if (layer) layer.innerHTML = '';
    return;
  }
  layer.innerHTML = '';

  const visible = entities.filter((e) => e.value && categoryAllows(e.entityType));
  if (!visible.length) return;

  const frame = viewerSingle.querySelector('.pdfEditorPageFrame');
  if (!frame) return;
  const canvasWrap = frame.querySelector('.pdfEditorPageCanvasWrap');
  const canvas = frame.querySelector('canvas');
  if (!canvas || !canvasWrap) return;

  const pageState = PdfEditorDocumentModel.findPageById(model, selectedPageId);
  if (!pageState) return;
  const pdfPage = await getPdfPage(pageState.sourceIndex);
  if (!pdfPage) return;

  const wrapRect = canvasWrap.getBoundingClientRect();
  const panelRect = layer.getBoundingClientRect();
  const scaleX = canvas.clientWidth / canvas.width;
  const scaleY = canvas.clientHeight / canvas.height;

  const textContent = await pdfPage.getTextContent();
  const viewport = pdfPage.getViewport({
    scale: canvas.width / pdfPage.getViewport({ scale: 1 }).width,
  });

  for (const ent of visible) {
    const needle = ent.value.trim();
    if (needle.length < 2) continue;

    for (const item of textContent.items) {
      const str = item.str || '';
      if (!str.includes(needle) && !needle.includes(str.trim())) {
        // also try case-insensitive contains for short tokens
        if (!str.toLowerCase().includes(needle.toLowerCase())) continue;
      }
      if (!str.toLowerCase().includes(needle.toLowerCase()) && str.trim().length < needle.length) {
        continue;
      }

      const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]);
      const width = (item.width || 0) * (viewport.scale || 1);
      const x = tx[4];
      const y = tx[5] - fontHeight;

      const hl = document.createElement('div');
      hl.className = `assistenteHl type-${ent.entityType.toLowerCase()}${ent.approved ? '' : ' is-ignored'}`;
      const left = wrapRect.left - panelRect.left + x * scaleX;
      const top = wrapRect.top - panelRect.top + y * scaleY;
      hl.style.left = `${left}px`;
      hl.style.top = `${top}px`;
      hl.style.width = `${Math.max(width * scaleX, 8)}px`;
      hl.style.height = `${Math.max(fontHeight * scaleY, 8)}px`;
      hl.title = ent.value;
      layer.appendChild(hl);
    }
  }
}

function focusEntityInViewer(ent) {
  // Best-effort: keep current page; future: jump to page containing the value
  scheduleHighlightPaint();
  void ent;
}

/* —— Open / change file —— */
changeFileBtn?.addEventListener('click', () => {
  workspace.classList.remove('visible');
  dropZone.style.display = '';
  const recentSection = document.getElementById('pdfEditorRecent');
  if (recentSection) recentSection.style.display = '';
  document.body.classList.remove('pdfEditorEditing', 'pdeffy-sidebar-collapsed');
  fileInput.value = '';
  pdfNativePath = null;
  entities = [];
});

fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) loadPdfFile(file);
});

dropZone?.addEventListener('click', (e) => {
  if (e.target.closest('label') || e.target.closest('input')) return;
  fileInput?.click();
});

(async () => {
  try {
    const { wireTauriDropZone } = await import('/src/ui/filePicker.js');
    wireTauriDropZone?.(dropZone, {
      accept: ['.pdf', 'application/pdf'],
      onFiles: (files) => {
        const f = files?.[0];
        if (f) loadPdfFile(f, f.pdeffyPath || null);
      },
    });
  } catch (_) { /* ignore */ }
})();

document.getElementById('pdfEditorZoomIn')?.addEventListener('click', () => {
  if (!viewerApi) return;
  viewerApi.setZoomPercent?.(Math.min(200, (viewerApi.getZoomPercent?.() || 100) + 10));
  zoomLabel.textContent = `${viewerApi.getZoomPercent?.() || 100}%`;
  refreshUi();
});
document.getElementById('pdfEditorZoomOut')?.addEventListener('click', () => {
  if (!viewerApi) return;
  viewerApi.setZoomPercent?.(Math.max(40, (viewerApi.getZoomPercent?.() || 100) - 10));
  zoomLabel.textContent = `${viewerApi.getZoomPercent?.() || 100}%`;
  refreshUi();
});
document.getElementById('pdfEditorZoomFit')?.addEventListener('click', () => {
  if (!viewerApi) return;
  viewerApi.setZoomPercent?.(100);
  zoomLabel.textContent = '100%';
  refreshUi();
});
document.getElementById('pdfEditorPrevPage')?.addEventListener('click', () => {
  const active = PdfEditorDocumentModel.getActivePages(model);
  const idx = active.findIndex((p) => p.id === selectedPageId);
  if (idx > 0) onPageSelect(active[idx - 1].id);
});
document.getElementById('pdfEditorNextPage')?.addEventListener('click', () => {
  const active = PdfEditorDocumentModel.getActivePages(model);
  const idx = active.findIndex((p) => p.id === selectedPageId);
  if (idx >= 0 && idx < active.length - 1) onPageSelect(active[idx + 1].id);
});

/* —— Recent docs —— */
async function openRecentDoc(doc) {
  if (!doc) return;
  try {
    if (doc.path) {
      const bytes = await fs.readFile(doc.path);
      const file = new File([bytes], doc.name || path.basename(doc.path), { type: 'application/pdf' });
      file.pdeffyPath = doc.path;
      await loadPdfFile(file, doc.path);
      return;
    }
  } catch (_) { /* fall through to cache */ }
  try {
    const { loadRecentFile } = await import('/src/ui/recentFiles.js');
    const cached = await loadRecentFile(doc);
    if (cached?.buffer) {
      const file = new File([cached.buffer], doc.name || 'document.pdf', { type: 'application/pdf' });
      await loadPdfFile(file, cached.path || null);
    }
  } catch (err) {
    console.error(err);
  }
}

window.addEventListener('pdeffy:open-recent', (e) => openRecentDoc(e.detail || {}));

(async () => {
  try {
    const { consumeRecentOpenRequest, getRecentDocuments } = await import('/src/ui/shell.js');
    const pending = consumeRecentOpenRequest?.();
    if (pending) {
      await openRecentDoc(pending);
      return;
    }
    const listEl = document.getElementById('pdfEditorRecentList');
    const emptyEl = document.getElementById('editRecentEmpty');
    const docs = getRecentDocuments?.() || [];
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!docs.length) {
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    for (const doc of docs.slice(0, 6)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pdeffy-recent-item';
      btn.textContent = doc.name || doc.path || 'PDF';
      btn.addEventListener('click', () => openRecentDoc(doc));
      listEl.appendChild(btn);
    }
  } catch (_) { /* ignore */ }
})();

/* —— Init tab from query —— */
(function initTab() {
  let tab = 'anonymize';
  try {
    tab = new URL(window.location.href).searchParams.get('tab') || 'anonymize';
  } catch (_) { /* ignore */ }
  if (!['summary', 'anonymize', 'ask'].includes(tab)) tab = 'anonymize';
  setActiveTab(tab);
  refreshModelStatus();
})();
