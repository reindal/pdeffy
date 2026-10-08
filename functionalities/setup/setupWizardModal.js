/**
 * Modale di prima configurazione: obbligatoria fino al completamento.
 */
import { listen } from '@tauri-apps/api/event';

const { ipcRenderer } = require('electron');

const STEP_COUNT = 7;
const LIBREOFFICE_DOWNLOAD_URL = 'https://www.libreoffice.org/';
/** @type {HTMLElement | null} */
let overlay = null;
/** @type {ReturnType<typeof buildWizard> | null} */
let wizard = null;

function msg(key, fallback) {
  try {
    if (typeof window.getMessage === 'function') {
      const m = window.getMessage(key);
      if (m && m !== key) return m;
    }
  } catch (_) { /* ignore */ }
  return fallback || key;
}

function wizardAssetBase() {
  const path = window.location.pathname.replace(/\\/g, '/');
  const idx = path.indexOf('/functionalities/');
  if (idx === -1) return './functionalities/setup/';
  const after = path.slice(idx + '/functionalities/'.length);
  const depth = after.split('/').filter(Boolean).length;
  return `${'../'.repeat(depth)}setup/`;
}

function logoSrc() {
  const path = window.location.pathname.replace(/\\/g, '/');
  const idx = path.indexOf('/functionalities/');
  const base =
    idx === -1
      ? './assets/pdeffy-flat-light.svg'
      : `${'../'.repeat(path.slice(idx + '/functionalities/'.length).split('/').filter(Boolean).length + 1)}assets/pdeffy-flat-light.svg`;
  return base;
}

function setupWizardStylesheetHref() {
  const rel = `${wizardAssetBase()}setupWizard.css`;
  try {
    return new URL(rel, window.location.href).href;
  } catch (_) {
    return rel;
  }
}

const SETUP_WIZARD_OVERLAY_INLINE =
  'position:fixed;inset:0;z-index:200000;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(8,12,24,0.88);';

const SETUP_WIZARD_CARD_INLINE =
  'background:#ffffff;color:#101a3a;border:2px solid #c5cad6;border-radius:18px;padding:28px 26px 22px;box-sizing:border-box;width:100%;max-width:540px;max-height:min(90vh,720px);overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.45);';

function ensureStylesheet() {
  if (document.querySelector('link[data-pdeffy-setup-wizard]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = setupWizardStylesheetHref();
  link.setAttribute('data-pdeffy-setup-wizard', '1');
  document.head.appendChild(link);
}

function mountWizardRoot() {
  const host = document.createElement('div');
  host.id = 'setup-wizard-host';
  host.style.cssText =
    'position:fixed;inset:0;z-index:200000;margin:0;padding:0;width:100%;height:100%;pointer-events:auto;';
  document.body.appendChild(host);
  return host;
}

function formatBytes(n) {
  if (!n || n <= 0) return '0 B';
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
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

function fillName(template, name) {
  return String(template || '').replace(/\{name\}/g, name || '');
}

function updateModelHint(w, model) {
  if (!w.modelHint || !model) return;
  w.modelHint.textContent = fillName(
    msg(
      'setupWizardModelHint',
      'Choose and download {name} for PDF summaries. Required to finish setup.'
    ),
    model.displayName
  );
}

function renderModelDetail(w, model) {
  if (!w.modelDetail) return;
  w.modelDetail.innerHTML = '';
  if (!model) return;

  const head = document.createElement('div');
  head.className = 'setupWizardModelDetailHead';
  const tier = document.createElement('span');
  tier.className = `setupWizardModelTier is-${model.tier || 'balanced'}`;
  tier.textContent = tierLabel(model.tier);
  head.append(tier);

  const summary = document.createElement('p');
  summary.className = 'setupWizardModelSummary';
  summary.textContent = modelSummary(model);

  const specs = document.createElement('div');
  specs.className = 'setupWizardModelSpecs';
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
    chip.className = `setupWizardModelSpec${model.downloaded && i === chips.length - 1 ? ' is-ok' : ''}`;
    chip.textContent = label;
    specs.appendChild(chip);
  }

  w.modelDetail.append(head, summary, specs);
}

async function applyThemeSafe(theme) {
  try {
    const mod = await import('/src/ui/shell.js');
    if (typeof mod.applyTheme === 'function') {
      return mod.applyTheme(theme);
    }
  } catch (_) { /* ignore */ }
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  try {
    localStorage.setItem('pdeffy.theme', theme === 'dark' ? 'dark' : 'light');
  } catch (_) { /* ignore */ }
}

function buildWizardMarkup() {
  return `
<div class="setupWizardOverlay" id="setupWizardOverlay" role="dialog" aria-modal="true" aria-labelledby="setupWizardWelcomeTitle" style="${SETUP_WIZARD_OVERLAY_INLINE}">
  <div class="setupWizardCard" id="setupWizardCard" style="${SETUP_WIZARD_CARD_INLINE}">
    <p class="setupWizardStepCounter langText" id="setupWizardStepCounter" data-i18n="setupWizardStepCounter">1 / 7</p>
    <div class="setupWizardProgress" id="setupWizardProgress" aria-hidden="true"></div>

    <section class="setupWizardStep is-active" data-step="0">
      <img class="setupWizardLogo" src="${logoSrc()}" alt="" width="120" height="40">
      <h1 class="langText" id="setupWizardWelcomeTitle">Benvenuto in Pdeffy</h1>
      <p class="setupWizardLead langText" id="setupWizardWelcomeLead"></p>
    </section>

    <section class="setupWizardStep" data-step="1" hidden>
      <h2 class="langText" id="setupWizardPreferencesTitle">Preferenze</h2>
      <p class="setupWizardHint langText" id="setupWizardPreferencesHint"></p>
      <div class="setupWizardPrefBlock">
        <p class="setupWizardPrefLabel langText" id="setupWizardLangTitle">Lingua</p>
        <select id="setupWizardLanguageSelect" data-pdeffy-language-select class="setupWizardSelect setupWizardLanguageSelect" aria-label="Language">
          <option value="en">English</option>
          <option value="it">Italiano</option>
          <option value="pl">Polski</option>
          <option value="es">Español</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
        </select>
      </div>
      <div class="setupWizardPrefBlock">
        <p class="setupWizardPrefLabel langText" id="setupWizardThemeTitle">Tema</p>
        <div class="setupWizardThemeGrid" role="radiogroup">
          <button type="button" class="setupWizardThemeOption is-selected" data-theme-value="light">
            <span class="setupWizardThemePreview setupWizardThemePreviewLight"></span>
            <span class="langText" id="themeOptionLight">Chiaro</span>
          </button>
          <button type="button" class="setupWizardThemeOption" data-theme-value="dark">
            <span class="setupWizardThemePreview setupWizardThemePreviewDark"></span>
            <span class="langText" id="themeOptionDark">Scuro</span>
          </button>
        </div>
      </div>
      <div class="setupWizardPrefBlock setupWizardPrefBlockLast">
        <p class="setupWizardPrefLabel langText" id="setupWizardPdfTitle">PDF e metadati</p>
        <label class="setupWizardCheckboxRow">
          <input type="checkbox" id="setupDefaultPdfAppCheckbox">
          <span class="langText" id="settingsDefaultPdfCheckbox"></span>
        </label>
        <div class="setupWizardField">
          <label for="setupMetaAuthor" class="langText" id="authorLabel">Autore</label>
          <input type="text" id="setupMetaAuthor" class="setupWizardInput langTextPlaceholder" placeholder="">
        </div>
        <div class="setupWizardField">
          <label for="setupMetaCompany" class="langText" id="companyLabel">Azienda</label>
          <input type="text" id="setupMetaCompany" class="setupWizardInput langTextPlaceholder" placeholder="">
        </div>
      </div>
    </section>

    <section class="setupWizardStep" data-step="2" hidden>
      <h2 class="langText" id="setupWizardOcrTitle">OCR scansioni</h2>
      <p class="setupWizardHint langText" id="setupWizardOcrHint"></p>
      <p class="setupWizardDownloadStatus" id="setupOcrStatus"></p>
      <div class="setupWizardProgressTrack" id="setupOcrProgressTrack" hidden>
        <div class="setupWizardProgressBar" id="setupOcrProgressBar"></div>
      </div>
      <button type="button" class="setupWizardBtn setupWizardBtnSecondary" id="setupOcrDownloadBtn">
        <span class="langText" id="settingsOcrDownloadBtn">Scarica</span>
      </button>
    </section>

    <section class="setupWizardStep" data-step="3" hidden>
      <h2 class="langText" id="setupWizardModelTitle">Modello riassunti</h2>
      <p class="setupWizardHint" id="setupWizardModelHint"></p>
      <select id="setupModelSelect" class="setupWizardSelect" aria-label="AI model"></select>
      <div class="setupWizardModelDetail" id="setupModelDetail" aria-live="polite"></div>
      <p class="setupWizardDownloadStatus" id="setupModelStatus"></p>
      <div class="setupWizardProgressTrack" id="setupModelProgressTrack" hidden>
        <div class="setupWizardProgressBar" id="setupModelProgressBar"></div>
      </div>
      <button type="button" class="setupWizardBtn setupWizardBtnSecondary" id="setupModelDownloadBtn">
        <span class="langText" id="summarizeDownloadBtn">Scarica</span>
      </button>
    </section>

    <section class="setupWizardStep" data-step="4" hidden>
      <h2 class="langText" id="setupWizardNerTitle">Anonimizzazione</h2>
      <p class="setupWizardHint langText" id="setupWizardNerHint"></p>
      <p class="setupWizardDownloadStatus" id="setupNerStatus"></p>
      <div class="setupWizardProgressTrack" id="setupNerProgressTrack" hidden>
        <div class="setupWizardProgressBar" id="setupNerProgressBar"></div>
      </div>
      <button type="button" class="setupWizardBtn setupWizardBtnSecondary" id="setupNerDownloadBtn">
        <span class="langText" id="settingsNerDownloadBtn">Scarica</span>
      </button>
    </section>

    <section class="setupWizardStep" data-step="5" hidden>
      <h2 class="langText" id="setupWizardLibreOfficeTitle">Conversioni Office</h2>
      <p class="setupWizardHint langText" id="setupWizardLibreOfficeHint"></p>
      <p class="setupWizardDownloadStatus" id="setupLoStatus"></p>
      <p class="setupWizardHint setupWizardLoLater langText" id="setupWizardLibreOfficeLater"></p>
      <button type="button" class="setupWizardBtn setupWizardBtnSecondary" id="setupLoOpenBtn">
        <span class="langText" id="setupWizardLibreOfficeDownloadBtn">Scarica LibreOffice</span>
      </button>
    </section>

    <section class="setupWizardStep" data-step="6" hidden>
      <h2 class="langText" id="setupWizardDoneTitle">Tutto pronto</h2>
      <p class="setupWizardLead langText" id="setupWizardDoneLead"></p>
    </section>

    <footer class="setupWizardActions">
      <button type="button" class="setupWizardBtn setupWizardBtnGhost langText" id="setupWizardBack" data-i18n="setupWizardBackBtn" hidden>Indietro</button>
      <button type="button" class="setupWizardBtn setupWizardBtnPrimary langText" id="setupWizardNext" data-i18n="setupWizardStartBtn">Inizia</button>
    </footer>
    <p class="setupWizardError" id="setupWizardError" hidden role="alert"></p>
  </div>
</div>`;
}

function buildWizard(root) {
  root.innerHTML = buildWizardMarkup();
  const dotsHost = root.querySelector('#setupWizardProgress');
  for (let i = 0; i < STEP_COUNT; i++) {
    const dot = document.createElement('span');
    dot.className = 'setupWizardDot';
    dot.dataset.step = String(i);
    dotsHost.appendChild(dot);
  }

  return {
    root,
    overlay: root.querySelector('#setupWizardOverlay'),
    steps: Array.from(root.querySelectorAll('.setupWizardStep')),
    dots: Array.from(root.querySelectorAll('.setupWizardDot')),
    counter: root.querySelector('#setupWizardStepCounter'),
    backBtn: root.querySelector('#setupWizardBack'),
    nextBtn: root.querySelector('#setupWizardNext'),
    errorEl: root.querySelector('#setupWizardError'),
    themeButtons: Array.from(root.querySelectorAll('.setupWizardThemeOption')),
    defaultPdfAppCheckbox: root.querySelector('#setupDefaultPdfAppCheckbox'),
    metaAuthor: root.querySelector('#setupMetaAuthor'),
    metaCompany: root.querySelector('#setupMetaCompany'),
    ocrStatus: root.querySelector('#setupOcrStatus'),
    ocrProgressTrack: root.querySelector('#setupOcrProgressTrack'),
    ocrProgressBar: root.querySelector('#setupOcrProgressBar'),
    ocrDownloadBtn: root.querySelector('#setupOcrDownloadBtn'),
    modelSelect: root.querySelector('#setupModelSelect'),
    modelStatus: root.querySelector('#setupModelStatus'),
    modelProgressTrack: root.querySelector('#setupModelProgressTrack'),
    modelProgressBar: root.querySelector('#setupModelProgressBar'),
    modelDownloadBtn: root.querySelector('#setupModelDownloadBtn'),
    modelHint: root.querySelector('#setupWizardModelHint'),
    modelDetail: root.querySelector('#setupModelDetail'),
    nerStatus: root.querySelector('#setupNerStatus'),
    nerProgressTrack: root.querySelector('#setupNerProgressTrack'),
    nerProgressBar: root.querySelector('#setupNerProgressBar'),
    nerDownloadBtn: root.querySelector('#setupNerDownloadBtn'),
    loStatus: root.querySelector('#setupLoStatus'),
    loOpenBtn: root.querySelector('#setupLoOpenBtn'),
  };
}

function setError(w, text) {
  if (!w.errorEl) return;
  if (!text) {
    w.errorEl.hidden = true;
    w.errorEl.textContent = '';
    return;
  }
  w.errorEl.hidden = false;
  w.errorEl.textContent = text;
}

function updateCounter(w, index) {
  if (w.counter) {
    w.counter.textContent = msg('setupWizardStepCounter', '{current} / {total}')
      .replace('{current}', String(index + 1))
      .replace('{total}', String(STEP_COUNT));
  }
}

function createController(w) {
  let stepIndex = 0;
  let selectedTheme = 'light';
  /** @type {Array<Record<string, unknown>>} */
  let models = [];
  let selectedModelId = null;
  /** @type {'ocr' | 'summarize' | 'ner' | null} */
  let activeDownload = null;

  function readStoredTheme() {
    try {
      return localStorage.getItem('pdeffy.theme') === 'dark' ? 'dark' : 'light';
    } catch (_) {
      return 'light';
    }
  }

  function updateThemeUi(theme) {
    selectedTheme = theme === 'dark' ? 'dark' : 'light';
    w.themeButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.themeValue === selectedTheme);
    });
  }

  async function refreshOcrStep() {
    try {
      const status = await ipcRenderer.invoke('get-ocr-status');
      const downloaded = !!status.downloaded;
      const downloading = !!status.downloading;
      w.ocrDownloadBtn.hidden = downloaded && !downloading;
      w.ocrDownloadBtn.disabled = downloading;
      if (downloading) {
        w.ocrStatus.textContent = msg('settingsOcrDownloading', 'Download RapidOCR in corso…');
      } else if (downloaded) {
        w.ocrStatus.textContent = msg('setupWizardDownloadReady', 'Download completato.');
        w.ocrProgressTrack.hidden = true;
      } else {
        w.ocrStatus.textContent = msg('settingsOcrMissing', 'Scarica il pack RapidOCR (~15–25 MB).');
      }
      return downloaded;
    } catch (err) {
      w.ocrStatus.textContent = err?.message || String(err);
      return false;
    }
  }

  async function refreshModelStep() {
    try {
      models = await ipcRenderer.invoke('list-ai-models');
      const sel = w.modelSelect;
      const prev = sel?.value;
      if (sel) {
        sel.innerHTML = '';
        for (const m of models) {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = `${m.displayName} (${m.sizeLabel})`;
          sel.appendChild(opt);
        }
        selectedModelId =
          (prev && models.some((m) => m.id === prev) ? prev : null) ||
          models.find((m) => m.selected)?.id ||
          models[0]?.id;
        if (selectedModelId) sel.value = selectedModelId;
      }

      const id = sel?.value || selectedModelId;
      const model = models.find((m) => m.id === id) || models[0];
      updateModelHint(w, model);
      renderModelDetail(w, model);

      const status = await ipcRenderer.invoke('get-model-status');
      const downloading = !!status.downloading && (!id || status.modelId === id);
      const downloaded = !!model?.downloaded;

      w.modelDownloadBtn.hidden = downloaded && !downloading;
      w.modelDownloadBtn.disabled = downloading;
      if (downloading) {
        w.modelStatus.textContent = fillName(
          msg('setupWizardModelDownloading', 'Downloading {name}…'),
          model?.displayName
        );
      } else if (downloaded) {
        w.modelStatus.textContent = fillName(
          msg('setupWizardModelDownloadReady', '{name} is ready.'),
          model?.displayName
        );
        w.modelProgressTrack.hidden = true;
      } else if (model) {
        w.modelStatus.textContent = fillName(
          msg('setupWizardModelDownloadPrompt', 'Download {name} to continue.'),
          model.displayName
        );
      }
      return downloaded;
    } catch (err) {
      w.modelStatus.textContent = err?.message || String(err);
      return false;
    }
  }

  async function refreshNerStep() {
    try {
      const status = await ipcRenderer.invoke('get-ner-status');
      const downloaded = !!status.downloaded;
      const downloading = !!status.downloading;
      w.nerDownloadBtn.hidden = downloaded && !downloading;
      w.nerDownloadBtn.disabled = downloading;
      if (downloading) {
        w.nerStatus.textContent = msg('settingsNerDownloading', 'Download GLiNER in corso…');
      } else if (downloaded) {
        w.nerStatus.textContent = msg('setupWizardDownloadReady', 'Download completato.');
        w.nerProgressTrack.hidden = true;
      } else {
        w.nerStatus.textContent = msg('settingsNerMissing', 'Scarica il pack GLiNER (~200 MB).');
      }
      return downloaded;
    } catch (err) {
      w.nerStatus.textContent = err?.message || String(err);
      return false;
    }
  }

  async function refreshLibreOfficeStep() {
    try {
      const engines = await ipcRenderer.invoke('check-engines-availability');
      const hasLo = !!engines?.hasLibreOffice;
      const hasWord = !!engines?.hasMSOffice;
      if (hasLo) {
        w.loStatus.textContent = msg(
          'setupWizardLibreOfficeInstalled',
          'LibreOffice è installato: le conversioni possono essere più fedeli al layout originale.'
        );
        if (w.loOpenBtn) w.loOpenBtn.hidden = true;
      } else if (hasWord) {
        w.loStatus.textContent = msg(
          'setupWizardWordInstalled',
          'Microsoft Word è installato: puoi usarlo per conversioni Office con layout più fedele.'
        );
        if (w.loOpenBtn) w.loOpenBtn.hidden = true;
      } else {
        w.loStatus.textContent = msg(
          'setupWizardLibreOfficeMissing',
          'LibreOffice non è installato. Pdeffy converte già Word/Excel/PowerPoint con il motore integrato; LibreOffice migliora layout e piè di pagina.'
        );
        if (w.loOpenBtn) w.loOpenBtn.hidden = false;
      }
    } catch (err) {
      w.loStatus.textContent = err?.message || String(err);
      if (w.loOpenBtn) w.loOpenBtn.hidden = false;
    }
  }

  async function onStepEnter(index) {
    setError(w, '');
    if (index === 2) await refreshOcrStep();
    if (index === 3) await refreshModelStep();
    if (index === 4) await refreshNerStep();
    if (index === 5) await refreshLibreOfficeStep();
    updateNextButtonState(index);
  }

  function updateNextButtonState(index) {
    if (!w.nextBtn || index === STEP_COUNT - 1) return;
    w.nextBtn.disabled = false;
  }

  function showStep(index) {
    stepIndex = Math.max(0, Math.min(STEP_COUNT - 1, index));
    w.steps.forEach((el, i) => {
      const active = i === stepIndex;
      el.classList.toggle('is-active', active);
      el.hidden = !active;
    });
    w.dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === stepIndex);
      dot.classList.toggle('is-done', i < stepIndex);
    });
    updateCounter(w, stepIndex);
    if (w.backBtn) w.backBtn.hidden = stepIndex === 0;
    if (w.nextBtn) {
      if (stepIndex === STEP_COUNT - 1) {
        w.nextBtn.textContent = msg('setupWizardFinishBtn', 'Inizia a usare Pdeffy');
        w.nextBtn.dataset.i18n = 'setupWizardFinishBtn';
      } else if (stepIndex === 0) {
        w.nextBtn.textContent = msg('setupWizardStartBtn', 'Inizia');
        w.nextBtn.dataset.i18n = 'setupWizardStartBtn';
      } else {
        w.nextBtn.textContent = msg('setupWizardNextBtn', 'Avanti');
        w.nextBtn.dataset.i18n = 'setupWizardNextBtn';
      }
    }
    onStepEnter(stepIndex);
  }

  async function validateBeforeLeave(index) {
    if (index === 2) {
      const ok = await refreshOcrStep();
      if (!ok) {
        setError(w, msg('setupWizardMustDownload', 'Completa il download per continuare.'));
        return false;
      }
    }
    if (index === 3) {
      const ok = await refreshModelStep();
      if (!ok) {
        setError(w, msg('setupWizardMustDownload', 'Completa il download per continuare.'));
        return false;
      }
    }
    if (index === 4) {
      const ok = await refreshNerStep();
      if (!ok) {
        setError(w, msg('setupWizardMustDownload', 'Completa il download per continuare.'));
        return false;
      }
    }
    return true;
  }

  async function persistSettings() {
    const metadata = {
      author: w.metaAuthor?.value.trim() || '',
      company: w.metaCompany?.value.trim() || '',
      title: '',
      subject: '',
    };
    await ipcRenderer.invoke('save-pdf-metadata', metadata);
    if (w.defaultPdfAppCheckbox) {
      await ipcRenderer.invoke('set-default-pdf-app', w.defaultPdfAppCheckbox.checked);
    }
    await applyThemeSafe(selectedTheme);
  }

  async function finishWizard() {
    w.nextBtn.disabled = true;
    setError(w, '');
    try {
      await persistSettings();
      await ipcRenderer.invoke('complete-first-launch');
      document.body.classList.remove('setup-wizard-locked');
      document.getElementById('setup-wizard-host')?.remove();
      overlay = null;
      wizard = null;
    } catch (err) {
      setError(w, err?.message || String(err));
      w.nextBtn.disabled = false;
    }
  }

  function onAiProgress(payload) {
    if (!payload?.phase) return;
    if (payload.phase === 'download') {
      const total = payload.total || 0;
      const pct = total > 0 ? Math.min(100, Math.round((payload.downloaded / total) * 100)) : 0;
      const line = total
        ? `${formatBytes(payload.downloaded)} / ${formatBytes(total)} (${pct}%)`
        : formatBytes(payload.downloaded);
      const target = payload.component || activeDownload;
      if (target === 'ocr' && w.ocrProgressBar) {
        w.ocrProgressTrack.hidden = false;
        w.ocrProgressBar.style.width = `${pct}%`;
        w.ocrStatus.textContent = `${msg('localModelsProgressOcr', 'Download RapidOCR…')} ${line}`;
      } else if (target === 'ner' && w.nerProgressBar) {
        w.nerProgressTrack.hidden = false;
        w.nerProgressBar.style.width = `${pct}%`;
        w.nerStatus.textContent = `${msg('localModelsProgressNer', 'Download GLiNER…')} ${line}`;
      } else if (w.modelProgressBar) {
        w.modelProgressTrack.hidden = false;
        w.modelProgressBar.style.width = `${pct}%`;
        w.modelStatus.textContent = `${msg('localModelsProgressSummarize', 'Download modello…')} ${line}`;
      }
    } else if (payload.phase === 'ready' || payload.phase === 'unloaded') {
      activeDownload = null;
      refreshOcrStep();
      refreshModelStep();
      refreshNerStep();
    } else if (payload.phase === 'error') {
      setError(w, payload.message || msg('errorPrefix', 'Errore'));
    }
  }

  async function loadInitialValues() {
    selectedTheme = readStoredTheme();
    updateThemeUi(selectedTheme);
    try {
      const settings = await ipcRenderer.invoke('get-pdf-metadata');
      if (settings && w.metaAuthor) w.metaAuthor.value = settings.author || '';
      if (settings && w.metaCompany) w.metaCompany.value = settings.company || '';
    } catch (_) { /* ignore */ }
    if (w.defaultPdfAppCheckbox) {
      try {
        w.defaultPdfAppCheckbox.checked = await ipcRenderer.invoke('get-default-pdf-app');
      } catch (_) {
        w.defaultPdfAppCheckbox.checked = false;
      }
    }
  }

  w.themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.themeValue === 'dark' ? 'dark' : 'light';
      updateThemeUi(theme);
      applyThemeSafe(theme);
    });
  });

  w.ocrDownloadBtn?.addEventListener('click', async () => {
    activeDownload = 'ocr';
    w.ocrDownloadBtn.disabled = true;
    try {
      await ipcRenderer.invoke('download-ocr-models');
    } catch (err) {
      setError(w, err?.message || String(err));
    } finally {
      await refreshOcrStep();
    }
  });

  w.modelDownloadBtn?.addEventListener('click', async () => {
    activeDownload = 'summarize';
    w.modelDownloadBtn.disabled = true;
    const id = w.modelSelect?.value || selectedModelId;
    try {
      if (id) await ipcRenderer.invoke('set-selected-model', id);
      await ipcRenderer.invoke('download-model', id || null);
    } catch (err) {
      setError(w, err?.message || String(err));
    } finally {
      await refreshModelStep();
    }
  });

  w.modelSelect?.addEventListener('change', async () => {
    selectedModelId = w.modelSelect.value;
    setError(w, '');
    try {
      await ipcRenderer.invoke('set-selected-model', selectedModelId);
    } catch (_) { /* ignore */ }
    await refreshModelStep();
  });

  w.nerDownloadBtn?.addEventListener('click', async () => {
    activeDownload = 'ner';
    w.nerDownloadBtn.disabled = true;
    try {
      await ipcRenderer.invoke('download-ner-models');
    } catch (err) {
      setError(w, err?.message || String(err));
    } finally {
      await refreshNerStep();
    }
  });

  w.backBtn?.addEventListener('click', () => showStep(stepIndex - 1));

  w.loOpenBtn?.addEventListener('click', () => {
    ipcRenderer.invoke('open-external-url', LIBREOFFICE_DOWNLOAD_URL).catch((err) => {
      setError(w, err?.message || String(err));
    });
  });

  w.nextBtn?.addEventListener('click', async () => {
    if (stepIndex === 1) {
      const sel = document.getElementById('setupWizardLanguageSelect');
      if (sel?.value) {
        await ipcRenderer.invoke('save-language', sel.value);
        window.currentLanguage = sel.value;
        if (typeof window.changeLanguage === 'function') window.changeLanguage(sel.value);
      }
      await applyThemeSafe(selectedTheme);
    }
    if (stepIndex < STEP_COUNT - 1) {
      const ok = await validateBeforeLeave(stepIndex);
      if (!ok) return;
      showStep(stepIndex + 1);
      return;
    }
    await finishWizard();
  });

  listen('ai-progress', (event) => onAiProgress(event.payload)).catch(() => {});

  return {
    loadInitialValues,
    showStep,
    onLanguageChanged() {
      if (w.nextBtn?.dataset.i18n && typeof window.getMessage === 'function') {
        w.nextBtn.textContent = window.getMessage(w.nextBtn.dataset.i18n);
      }
      updateCounter(w, stepIndex);
      if (stepIndex === 3) {
        const id = w.modelSelect?.value || selectedModelId;
        const model = models.find((m) => m.id === id) || models[0];
        updateModelHint(w, model);
        renderModelDetail(w, model);
      }
    },
  };
}

function blockDismiss() {
  document.addEventListener(
    'keydown',
    (e) => {
      if (overlay && (e.key === 'Escape' || e.key === 'Esc')) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
}

export async function initSetupWizardIfNeeded() {
  if (overlay) return;
  let isFirst;
  try {
    isFirst = await ipcRenderer.invoke('check-first-launch');
  } catch (_) {
    return;
  }
  if (!isFirst) return;

  ensureStylesheet();
  blockDismiss();

  const host = mountWizardRoot();
  wizard = buildWizard(host);
  overlay = wizard.overlay;

  const ctrl = createController(wizard);
  await ctrl.loadInitialValues();

  document.body.classList.add('setup-wizard-locked');
  try {
    const lang = await ipcRenderer.invoke('get-language');
    window.currentLanguage = lang || window.currentLanguage || 'en';
  } catch (_) { /* ignore */ }
  if (typeof window.applyLanguage === 'function') {
    window.applyLanguage();
  } else if (typeof window.changeLanguage === 'function') {
    window.changeLanguage(window.currentLanguage || 'en');
  }
  window.dispatchEvent(new Event('settingsUIReady'));

  window.addEventListener('languageChanged', () => ctrl.onLanguageChanged());

  ctrl.showStep(0);
}

export default { initSetupWizardIfNeeded };
