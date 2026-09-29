import { listen } from '@tauri-apps/api/event';

const { ipcRenderer } = require('electron');

const metaAuthor = document.getElementById('metaAuthor');
const metaCompany = document.getElementById('metaCompany');
const themeSelector = document.getElementById('themeSelector');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsStatus = document.getElementById('settingsStatus');
const firstLaunchIntro = document.getElementById('firstLaunchIntro');
const defaultPdfAppCheckbox = document.getElementById('defaultPdfAppCheckbox');
const modelListEl = document.getElementById('settingsAiModelList');
const downloadBtn = document.getElementById('downloadModelBtn');
const unloadBtn = document.getElementById('unloadModelBtn');
const badge = document.getElementById('settingsModelBadge');
const detail = document.getElementById('settingsModelDetail');
const progressTrack = document.getElementById('settingsAiProgressTrack');
const progressBar = document.getElementById('settingsAiProgressBar');
const ocrBadge = document.getElementById('settingsOcrBadge');
const ocrDetail = document.getElementById('settingsOcrDetail');
const downloadOcrBtn = document.getElementById('downloadOcrBtn');
const nerBadge = document.getElementById('settingsNerBadge');
const nerDetail = document.getElementById('settingsNerDetail');
const downloadNerBtn = document.getElementById('downloadNerBtn');
const unloadNerBtn = document.getElementById('unloadNerBtn');
const progressLabel = document.getElementById('settingsAiProgressLabel');
const summarizeDiskEl = document.getElementById('localModelsSummarizeDisk');
const summarizeRamEl = document.getElementById('localModelsSummarizeRam');
const ocrDiskEl = document.getElementById('localModelsOcrDisk');
const nerDiskEl = document.getElementById('localModelsNerDisk');
const nerRamEl = document.getElementById('localModelsNerRam');

/** @type {Array<Record<string, any>>} */
let models = [];
let selectedId = null;
/** @type {'summarize' | 'ocr' | 'ner' | null} */
let activeDownloadTarget = null;

function msg(key, fallback = '') {
  try {
    if (typeof window.getMessage === 'function') {
      const m = window.getMessage(key);
      if (m && m !== key) return m;
    }
  } catch (_) { /* ignore */ }
  return fallback || key;
}

function modelI18nSuffix(id) {
  return String(id || '').replace(/[^a-zA-Z0-9]+/g, '_');
}

function modelSummary(model) {
  const key = `aiModelSummary_${modelI18nSuffix(model.id)}`;
  return msg(key, model.summary || '');
}

function modelLanguages(model) {
  const key = `aiModelLang_${modelI18nSuffix(model.id)}`;
  return msg(key, model.languages || '');
}

function tierLabel(tier) {
  if (tier === 'light') return msg('aiModelTierLight', 'Light');
  if (tier === 'recommended') return msg('aiModelTierRecommended', 'Recommended');
  if (tier === 'quality') return msg('aiModelTierQuality', 'Quality');
  return tier || '';
}

function speedLabel(speed) {
  if (speed === 'fast') return msg('aiModelSpeedFast', 'Fast');
  if (speed === 'balanced') return msg('aiModelSpeedBalanced', 'Balanced');
  if (speed === 'quality') return msg('aiModelSpeedQuality', 'Higher quality');
  return speed || '';
}

async function applyThemeSafe(theme) {
  try {
    const mod = await import('/src/ui/shell.js');
    if (typeof mod.applyTheme === 'function') {
      return mod.applyTheme(theme);
    }
  } catch (_) { /* ignore */ }
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  document.body.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  try {
    localStorage.setItem('pdeffy.theme', theme === 'dark' ? 'dark' : 'light');
  } catch (_) { /* ignore */ }
  return theme;
}

function readStoredTheme() {
  try {
    return localStorage.getItem('pdeffy.theme') === 'dark' ? 'dark' : 'light';
  } catch (_) {
    return 'light';
  }
}

function setBadge(text, kind) {
  if (!badge) return;
  badge.textContent = text;
  badge.classList.remove('is-ready', 'is-missing', 'is-busy');
  if (kind) badge.classList.add(kind);
}

function setLocalState(el, text, kind) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove('is-ok', 'is-missing', 'is-busy');
  if (kind) el.classList.add(kind);
}

function diskState(downloaded, downloading) {
  if (downloading) {
    return { text: msg('localModelsStateDownloading', 'Download…'), kind: 'is-busy' };
  }
  if (downloaded) {
    return { text: msg('localModelsStateOnDisk', 'Sì'), kind: 'is-ok' };
  }
  return { text: msg('localModelsStateNotOnDisk', 'No'), kind: 'is-missing' };
}

function ramState(loaded, downloading) {
  if (downloading) {
    return { text: msg('localModelsStateLoading', '…'), kind: 'is-busy' };
  }
  if (loaded) {
    return { text: msg('localModelsStateInRam', 'Sì'), kind: 'is-ok' };
  }
  return { text: msg('localModelsStateNotInRam', 'No'), kind: 'is-missing' };
}

function formatBytes(n) {
  if (!n || n <= 0) return '0 B';
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

function showStatus(text, kind = 'success') {
  if (!settingsStatus) return;
  settingsStatus.hidden = false;
  settingsStatus.textContent = text;
  settingsStatus.className = `settingsStatus ${kind}`;
}

function selectedModel() {
  return models.find((m) => m.id === selectedId) || models.find((m) => m.selected) || models[0] || null;
}

function renderModelList() {
  if (!modelListEl) return;
  modelListEl.innerHTML = '';

  for (const model of models) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `settingsAiModelOption${model.id === selectedId ? ' is-selected' : ''}`;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', model.id === selectedId ? 'true' : 'false');
    btn.dataset.modelId = model.id;

    const head = document.createElement('div');
    head.className = 'settingsAiModelOptionHead';
    const title = document.createElement('strong');
    title.textContent = model.displayName;
    const tier = document.createElement('span');
    tier.className = `settingsAiModelTier is-${model.tier || 'balanced'}`;
    tier.textContent = tierLabel(model.tier);
    head.append(title, tier);

    const summary = document.createElement('p');
    summary.className = 'settingsAiModelSummary';
    summary.textContent = modelSummary(model);

    const specs = document.createElement('div');
    specs.className = 'settingsAiSpecs';
    const chips = [
      `${msg('aiModelSpecParams', 'Params')}: ${model.params}`,
      `${msg('aiModelSpecQuant', 'Quant')}: ${model.quant}`,
      `${msg('aiModelSpecSize', 'Size')}: ${model.sizeLabel}`,
      `${msg('aiModelSpecRam', 'RAM')}: ${model.ramLabel}`,
      `${msg('aiModelSpecCtx', 'Context')}: ${model.nCtx}`,
      `${msg('aiModelSpecSpeed', 'Speed')}: ${speedLabel(model.speed)}`,
      modelLanguages(model),
      model.downloaded
        ? msg('aiModelSpecDownloaded', 'Downloaded')
        : msg('aiModelSpecNotDownloaded', 'Not downloaded'),
    ];
    for (const [i, label] of chips.entries()) {
      const chip = document.createElement('span');
      chip.className = `settingsAiSpec${model.downloaded && i === chips.length - 1 ? ' is-ok' : ''}`;
      chip.textContent = label;
      specs.appendChild(chip);
    }

    btn.append(head, summary, specs);
    btn.addEventListener('click', () => selectModel(model.id));
    modelListEl.appendChild(btn);
  }
}

async function selectModel(modelId) {
  if (!modelId || modelId === selectedId) {
    selectedId = modelId;
    renderModelList();
    await refreshModelStatus();
    return;
  }
  try {
    await ipcRenderer.invoke('set-selected-model', modelId);
    selectedId = modelId;
    models = models.map((m) => ({ ...m, selected: m.id === modelId }));
    renderModelList();
    await refreshModelStatus();
  } catch (err) {
    showStatus(err?.message || String(err), 'error');
  }
}

async function loadModels() {
  try {
    models = await ipcRenderer.invoke('list-ai-models');
    selectedId = models.find((m) => m.selected)?.id || models[0]?.id || null;
    renderModelList();
  } catch (err) {
    console.error(err);
    if (modelListEl) {
      modelListEl.innerHTML = `<p class="settingsAiDetail">${err?.message || String(err)}</p>`;
    }
  }
}

async function loadSettings() {
  try {
    const settings = await ipcRenderer.invoke('get-pdf-metadata');
    if (settings) {
      metaAuthor.value = settings.author || '';
      metaCompany.value = settings.company || '';
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  if (themeSelector) {
    themeSelector.value = readStoredTheme();
  }
  if (defaultPdfAppCheckbox) {
    try {
      defaultPdfAppCheckbox.checked = await ipcRenderer.invoke('get-default-pdf-app');
    } catch (_) {
      defaultPdfAppCheckbox.checked = false;
    }
  }
}

async function refreshModelStatus() {
  if (!downloadBtn || !detail) return;
  try {
    const status = await ipcRenderer.invoke('get-model-status');
    selectedId = status.modelId || selectedId;
    downloadBtn.hidden = status.downloaded && !status.downloading;
    downloadBtn.disabled = !!status.downloading;
    unloadBtn.hidden = !status.loaded;

    // Keep list download chips in sync.
    models = models.map((m) =>
      m.id === status.modelId
        ? { ...m, downloaded: status.downloaded, bytesOnDisk: status.bytesOnDisk, selected: true }
        : { ...m, selected: m.id === status.modelId }
    );
    renderModelList();

    const disk = diskState(status.downloaded, status.downloading);
    setLocalState(summarizeDiskEl, disk.text, disk.kind);
    const ram = ramState(status.loaded, status.downloading);
    setLocalState(summarizeRamEl, ram.text, ram.kind);

    if (status.downloading) {
      setBadge(msg('summarizeBadgeDownloading', 'Download…'), 'is-busy');
      detail.textContent = msg('summarizeModelDownloading', 'Download del modello in corso…');
      progressTrack.hidden = false;
      if (progressLabel) {
        progressLabel.textContent = msg('localModelsProgressSummarize', 'Download modello riassunto…');
      }
    } else if (status.loaded) {
      setBadge(msg('summarizeBadgeLoaded', 'In memoria'), 'is-ready');
      detail.textContent = msg('summarizeModelLoaded', 'Modello caricato in RAM per questa sessione.');
      progressTrack.hidden = true;
      if (progressLabel) progressLabel.textContent = '';
    } else if (status.downloaded) {
      setBadge(msg('summarizeBadgeReady', 'Pronto'), 'is-ready');
      detail.textContent = msg(
        'summarizeModelOnDisk',
        'Modello su disco ({size}). Verrà caricato al primo riassunto.'
      ).replace('{size}', formatBytes(status.bytesOnDisk));
      progressTrack.hidden = true;
      if (progressLabel) progressLabel.textContent = '';
    } else {
      setBadge(msg('summarizeBadgeMissing', 'Da scaricare'), 'is-missing');
      detail.textContent = msg(
        'summarizeModelMissing',
        'Serve scaricare il modello GGUF una sola volta. Resta sul tuo computer.'
      );
      progressTrack.hidden = true;
      if (progressLabel) progressLabel.textContent = '';
    }
  } catch (err) {
    setBadge('AI', 'is-missing');
    detail.textContent = err?.message || String(err);
    downloadBtn.hidden = false;
    downloadBtn.disabled = false;
    unloadBtn.hidden = true;
  }
}

function onAiProgress(payload) {
  if (!payload || !payload.phase) return;
  switch (payload.phase) {
    case 'download': {
      progressTrack.hidden = false;
      const total = payload.total || 0;
      const pct = total > 0 ? Math.min(100, Math.round((payload.downloaded / total) * 100)) : 0;
      progressBar.style.width = `${pct}%`;
      const target = payload.component || activeDownloadTarget;
      const progressMsg =
        target === 'ner'
          ? msg('localModelsProgressNer', 'Download GLiNER…')
          : target === 'ocr'
            ? msg('localModelsProgressOcr', 'Download RapidOCR…')
            : msg('localModelsProgressSummarize', 'Download modello riassunto…');
      const line = total
        ? `${progressMsg} ${formatBytes(payload.downloaded)} / ${formatBytes(total)} (${pct}%)`
        : `${progressMsg} ${formatBytes(payload.downloaded)}`;
      if (progressLabel) progressLabel.textContent = progressMsg;
      if (target === 'ner') {
        if (nerDetail) nerDetail.textContent = line;
        if (nerBadge) {
          nerBadge.textContent = msg('summarizeBadgeDownloading', 'Download…');
          nerBadge.className = 'settingsAiBadge is-busy';
        }
        setLocalState(nerDiskEl, diskState(false, true).text, diskState(false, true).kind);
      } else if (target === 'ocr') {
        if (ocrDetail) ocrDetail.textContent = line;
        if (ocrBadge) {
          ocrBadge.textContent = msg('summarizeBadgeDownloading', 'Download…');
          ocrBadge.className = 'settingsAiBadge is-busy';
        }
        setLocalState(ocrDiskEl, diskState(false, true).text, diskState(false, true).kind);
      } else {
        setBadge(msg('summarizeBadgeDownloading', 'Download…'), 'is-busy');
        if (detail) detail.textContent = line;
      }
      break;
    }
    case 'loading':
      setBadge(msg('summarizeBadgeLoading', 'Caricamento…'), 'is-busy');
      detail.textContent = msg('summarizeModelLoading', 'Caricamento modello in memoria…');
      break;
    case 'ready':
    case 'unloaded':
      activeDownloadTarget = null;
      refreshModelStatus();
      refreshOcrStatus();
      refreshNerStatus();
      break;
    case 'error':
      detail.textContent = payload.message || msg('errorPrefix', 'Errore');
      setBadge('Error', 'is-missing');
      break;
    default:
      break;
  }
}

themeSelector?.addEventListener('change', async () => {
  await applyThemeSafe(themeSelector.value);
});

saveSettingsBtn?.addEventListener('click', async () => {
  const metadata = {
    author: metaAuthor.value.trim(),
    company: metaCompany.value.trim(),
    title: '',
    subject: '',
  };

  try {
    await ipcRenderer.invoke('save-pdf-metadata', metadata);
    if (defaultPdfAppCheckbox) {
      await ipcRenderer.invoke('set-default-pdf-app', defaultPdfAppCheckbox.checked);
    }
    const theme = themeSelector?.value === 'dark' ? 'dark' : 'light';
    await applyThemeSafe(theme);

    const lang = await ipcRenderer.invoke('get-language');
    const messages = {
      en: 'Settings saved successfully!',
      it: 'Impostazioni salvate con successo!',
      pl: 'Ustawienia zapisane pomyślnie!',
      es: '¡Configuración guardada correctamente!',
    };
    showStatus(messages[lang] || messages.en, 'success');
    if (firstLaunchIntro) firstLaunchIntro.hidden = true;
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus(error?.message || String(error), 'error');
  }
});

document.getElementById('aboutOpenFromSettings')?.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('pdeffy:open-about'));
  import('/src/ui/shell.js')
    .then((m) => m.openAboutModal?.())
    .catch(() => { /* ignore */ });
});

async function refreshOcrStatus() {
  if (!ocrBadge || !ocrDetail || !downloadOcrBtn) return;
  try {
    const status = await ipcRenderer.invoke('get-ocr-status');
    downloadOcrBtn.hidden = status.downloaded && !status.downloading;
    downloadOcrBtn.disabled = !!status.downloading;
    const disk = diskState(status.downloaded, status.downloading);
    setLocalState(ocrDiskEl, disk.text, disk.kind);
    if (status.downloading) {
      ocrBadge.textContent = msg('summarizeBadgeDownloading', 'Download…');
      ocrBadge.className = 'settingsAiBadge is-busy';
      ocrDetail.textContent = msg('settingsOcrDownloading', 'Download RapidOCR in corso…');
    } else if (status.downloaded) {
      ocrBadge.textContent = msg('summarizeBadgeReady', 'Pronto');
      ocrBadge.className = 'settingsAiBadge is-ready';
      ocrDetail.textContent = msg(
        'settingsOcrReady',
        'RapidOCR pronto ({size}). Verrà usato sui PDF scansionati.'
      ).replace('{size}', status.sizeLabel || '');
    } else {
      ocrBadge.textContent = msg('summarizeBadgeMissing', 'Da scaricare');
      ocrBadge.className = 'settingsAiBadge is-missing';
      ocrDetail.textContent = msg(
        'settingsOcrMissing',
        'Scarica il pack RapidOCR (~15–25 MB) per i PDF senza testo.'
      );
    }
  } catch (err) {
    ocrBadge.textContent = 'OCR';
    ocrBadge.className = 'settingsAiBadge is-missing';
    ocrDetail.textContent = err?.message || String(err);
    downloadOcrBtn.hidden = false;
    downloadOcrBtn.disabled = false;
  }
}

downloadOcrBtn?.addEventListener('click', async () => {
  activeDownloadTarget = 'ocr';
  downloadOcrBtn.disabled = true;
  try {
    await ipcRenderer.invoke('download-ocr-models');
    showStatus(msg('settingsOcrDownloadDone', 'RapidOCR scaricato.'), 'success');
  } catch (err) {
    console.error(err);
    showStatus(err?.message || String(err), 'error');
  } finally {
    await refreshOcrStatus();
  }
});

downloadBtn?.addEventListener('click', async () => {
  activeDownloadTarget = 'summarize';
  const model = selectedModel();
  downloadBtn.disabled = true;
  progressTrack.hidden = false;
  progressBar.style.width = '0%';
  try {
    await ipcRenderer.invoke('download-model', model?.id || null);
    showStatus(msg('summarizeDownloadDone', 'Modello scaricato.'), 'success');
  } catch (err) {
    console.error(err);
    showStatus(err?.message || String(err), 'error');
  } finally {
    await loadModels();
    await refreshModelStatus();
  }
});

unloadBtn?.addEventListener('click', async () => {
  try {
    await ipcRenderer.invoke('unload-model');
    await refreshModelStatus();
  } catch (err) {
    showStatus(err?.message || String(err), 'error');
  }
});

async function refreshNerStatus() {
  if (!nerBadge || !nerDetail || !downloadNerBtn) return;
  try {
    const status = await ipcRenderer.invoke('get-ner-status');
    downloadNerBtn.hidden = status.downloaded && !status.downloading;
    downloadNerBtn.disabled = !!status.downloading;
    if (unloadNerBtn) {
      unloadNerBtn.disabled = !status.loaded;
      unloadNerBtn.hidden = !status.downloaded || !status.loaded;
    }
    const disk = diskState(status.downloaded, status.downloading);
    setLocalState(nerDiskEl, disk.text, disk.kind);
    const ram = ramState(status.loaded, status.downloading);
    setLocalState(nerRamEl, ram.text, ram.kind);

    if (status.downloading) {
      nerBadge.textContent = msg('summarizeBadgeDownloading', 'Download…');
      nerBadge.className = 'settingsAiBadge is-busy';
      nerDetail.textContent = msg('settingsNerDownloading', 'Download GLiNER in corso…');
    } else if (status.downloaded) {
      nerBadge.textContent = status.loaded
        ? msg('settingsNerLoaded', 'In RAM')
        : msg('summarizeBadgeReady', 'Pronto');
      nerBadge.className = 'settingsAiBadge is-ready';
      nerDetail.textContent = msg(
        'settingsNerReady',
        'GLiNER pronto ({size}). Si carica in RAM al primo rilevamento in anonimizzazione.'
      ).replace('{size}', status.sizeLabel || '');
    } else {
      nerBadge.textContent = msg('summarizeBadgeMissing', 'Da scaricare');
      nerBadge.className = 'settingsAiBadge is-missing';
      nerDetail.textContent = msg(
        'settingsNerMissing',
        'Scarica il pack GLiNER (~200 MB) per rilevare persone e organizzazioni.'
      );
    }
  } catch (err) {
    nerBadge.textContent = 'NER';
    nerBadge.className = 'settingsAiBadge is-missing';
    nerDetail.textContent = err?.message || String(err);
    downloadNerBtn.hidden = false;
    downloadNerBtn.disabled = false;
  }
}

downloadNerBtn?.addEventListener('click', async () => {
  activeDownloadTarget = 'ner';
  downloadNerBtn.disabled = true;
  try {
    await ipcRenderer.invoke('download-ner-models');
    showStatus(msg('settingsNerDownloadDone', 'GLiNER scaricato.'), 'success');
  } catch (err) {
    console.error(err);
    showStatus(err?.message || String(err), 'error');
  } finally {
    await refreshNerStatus();
  }
});

unloadNerBtn?.addEventListener('click', async () => {
  try {
    await ipcRenderer.invoke('unload-ner-model');
    await refreshNerStatus();
  } catch (err) {
    showStatus(err?.message || String(err), 'error');
  }
});

window.addEventListener('languageChanged', () => {
  renderModelList();
  refreshModelStatus();
  refreshNerStatus();
});

window.dispatchEvent(new Event('settingsUIReady'));
loadSettings();
loadModels().then(() => refreshModelStatus());
refreshOcrStatus();
refreshNerStatus();
listen('ai-progress', (event) => onAiProgress(event.payload)).catch(() => {});
