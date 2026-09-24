/**
 * App shell: persistent sidebar + shared navigation for multi-page HTML.
 */
import { actionMaskIcon, navMaskIcon } from './icons.js';

const ICONS = {
  mark: `<svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="3" y="2" width="16" height="20" rx="3" fill="#FFD91A"/><rect x="9" y="6" width="16" height="20" rx="3" fill="#3478F6"/><path d="M14 12h6M14 16h4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  home: null,
  organize: null,
  convert: null,
  edit: null,
  recent: null,
  settings: null,
  search: null,
  upload: null,
  merge: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 4v8a4 4 0 0 0 4 4"/><path d="M16 4v8a4 4 0 0 1-4 4"/><path d="M12 16v4"/></svg>`,
  split: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 4v8"/><path d="M12 12 8 20M12 12l4 8"/><path d="M8 8H4M20 8h-4"/></svg>`,
  protect: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  compress: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 4h8v4H8zM8 16h8v4H8z"/><path d="M12 8v8M9 11l3 3 3-3"/></svg>`,
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`,
  docx: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5M8 13l2 5 2-5 2 5 2-5"/></svg>`,
  xlsx: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16"/></svg>`,
  pptx: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m21 15-4.5-4.5L8 19"/></svg>`,
  markdown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16v12H4z"/><path d="m7 15 2-6 2 6 2-6 2 6"/></svg>`,
  pdf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5M8 14h3a1.5 1.5 0 0 0 0-3H8v6M14 17v-6h2.5a2 2 0 0 1 0 4H14"/></svg>`,
};

function resolveIcon(name, base = appBase()) {
  const navMap = {
    home: () => navMaskIcon(base, 'home.svg'),
    organize: () => navMaskIcon(base, 'organize.svg'),
    convert: () => navMaskIcon(base, 'convert.svg'),
    edit: () => navMaskIcon(base, 'edit.svg'),
    recent: () => navMaskIcon(base, 'recent.svg'),
    settings: () => navMaskIcon(base, 'settings.svg'),
    search: () => actionMaskIcon(base, 'search.svg'),
    upload: () => actionMaskIcon(base, 'upload.svg'),
  };
  if (navMap[name]) return navMap[name]();
  return ICONS[name] || '';
}

const RECENT_KEY = 'pdeffy.recentDocuments';
const RECENT_OPEN_KEY = 'pdeffy.openRecent';
const THEME_KEY = 'pdeffy.theme';

try {
  const early = localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', early);
} catch (_) { /* ignore */ }

function appBase() {
  const path = window.location.pathname.replace(/\\/g, '/');
  const idx = path.indexOf('/functionalities/');
  if (idx === -1) return './';
  const after = path.slice(idx + '/functionalities/'.length);
  const depth = after.split('/').filter(Boolean).length;
  return '../'.repeat(depth);
}

function detectNav() {
  const forced = document.body.dataset.nav;
  if (forced) return forced;
  const p = window.location.pathname.replace(/\\/g, '/').toLowerCase();
  if (p.endsWith('/index.html') || p.endsWith('/') || /\/pdeffy\/?$/.test(p)) return 'home';
  if (p.includes('/hubs/organize')) return 'organize';
  if (p.includes('/hubs/convert')) return 'convert';
  if (p.includes('/hubs/edit') || p.includes('/pdfeditor/')) return 'edit';
  if (p.includes('/hubs/recent')) return 'recent';
  if (p.includes('/merge/') || p.includes('/split/') || p.includes('/pdfgenerator/') || p.includes('/protectpdf/') || p.includes('/compresspdf/')) {
    return 'organize';
  }
  if (
    p.includes('topdf') ||
    p.includes('todocx') ||
    p.includes('toexcel') ||
    p.includes('topptx') ||
    p.includes('toimage') ||
    p.includes('tomarkdown') ||
    p.includes('/docx') ||
    p.includes('/excel') ||
    p.includes('/powerpoint') ||
    p.includes('/image') ||
    p.includes('/markdown')
  ) {
    return 'convert';
  }
  if (p.includes('/watermark/') || p.includes('/redact') || p.includes('/rotate') || p.includes('/delete')) {
    return 'edit';
  }
  return 'home';
}

function t(key, fallback) {
  if (typeof window.getMessage === 'function') {
    const v = window.getMessage(key);
    if (v && v !== key) return v;
  }
  return fallback;
}

function navItems(base) {
  return [
    {
      id: 'home',
      href: `${base}index.html`,
      labelKey: 'navHome',
      label: 'Home',
      iconHtml: resolveIcon('home', base),
    },
    {
      id: 'organize',
      href: `${base}functionalities/hubs/organize.html`,
      labelKey: 'navOrganize',
      label: 'Organizza PDF',
      iconHtml: resolveIcon('organize', base),
    },
    {
      id: 'convert',
      href: `${base}functionalities/hubs/convert.html`,
      labelKey: 'navConvert',
      label: 'Converti PDF',
      iconHtml: resolveIcon('convert', base),
    },
    {
      id: 'edit',
      href: `${base}functionalities/pdfEditor/pdfEditor.html`,
      labelKey: 'navEdit',
      label: 'Modifica PDF',
      iconHtml: resolveIcon('edit', base),
    },
    {
      id: 'recent',
      href: `${base}functionalities/hubs/recent.html`,
      labelKey: 'navRecent',
      label: 'Recenti',
      iconHtml: resolveIcon('recent', base),
    },
  ];
}

function buildSidebar(base, active) {
  const items = navItems(base)
    .map(
      (item) => `
      <a class="pdeffy-nav-item${item.id === active ? ' is-active' : ''}" href="${item.href}" data-nav-id="${item.id}" title="${item.label}" aria-label="${item.label}">
        <span class="pdeffy-nav-icon">${item.iconHtml}</span>
        <span class="pdeffy-nav-label langText" id="${item.labelKey}">${item.label}</span>
      </a>`
    )
    .join('');

  return `
    <aside class="pdeffy-sidebar" aria-label="Primary">
      <a class="pdeffy-sidebar-brand" href="${base}index.html" title="Pdeffy">
        <img class="pdeffy-sidebar-logo" src="${logoSrcForTheme(getTheme(), base)}" alt="pdeffy" data-pdeffy-logo data-icon-light="${base}assets/pdeffy-flat-dark.png" data-icon-dark="${base}assets/pdeffy-flat-light.png">
      </a>
      <nav class="pdeffy-nav">${items}</nav>
      <div class="pdeffy-sidebar-footer">
        <button type="button" class="pdeffy-nav-item" id="pdeffyOpenSettings" title="Impostazioni" aria-label="Impostazioni">
          <span class="pdeffy-nav-icon">${resolveIcon('settings', base)}</span>
          <span class="pdeffy-nav-label langText" id="navSettings">Impostazioni</span>
        </button>
      </div>
    </aside>`;
}

function wrapBody() {
  if (document.body.classList.contains('pdeffy-shell')) return;
  const base = appBase();
  const active = detectNav();
  const isEditor = document.body.classList.contains('pdfEditorPage');

  document.body.classList.add('pdeffy-shell');
  if (isEditor) {
    // Keep full-width editor chrome, but collapse sidebar only after a PDF is opened.
    document.body.classList.add('pdeffy-editor-mode');
  }

  const main = document.createElement('div');
  main.className = 'pdeffy-main';

  const keepOnBody = new Set([
    'settingsModal',
    'settingsIcon',
    'pdfEditorPasswordModal',
    'pdeffyAboutModal',
    'peg-toast',
  ]);

  Array.from(document.body.children)
    .filter((el) => {
      if (['SCRIPT', 'LINK', 'STYLE'].includes(el.tagName)) return false;
      if (el.classList?.contains('pdeffy-sidebar')) return false;
      if (el.classList?.contains('pdeffy-main')) return false;
      if (el.id && keepOnBody.has(el.id)) return false;
      return true;
    })
    .forEach((el) => main.appendChild(el));

  document.body.insertAdjacentHTML('afterbegin', buildSidebar(base, active));
  const sidebar = document.querySelector('.pdeffy-sidebar');
  if (sidebar) sidebar.after(main);
  else document.body.prepend(main);

  document.getElementById('pdeffyOpenSettings')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('pdeffy:open-settings'));
    const icon = document.getElementById('settingsIcon');
    if (icon) icon.click();
  });
}

/** Public helpers for hub pages */
export function icon(name) {
  return resolveIcon(name) || ICONS[name] || '';
}

export function getAppBase() {
  return appBase();
}

export function getRecentDocuments() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch (_) {
    return [];
  }
}

export function pushRecentDocument(entry) {
  if (!entry?.name) return;
  const list = getRecentDocuments().filter((x) => {
    if (entry.path && x.path) return x.path !== entry.path;
    return x.name !== entry.name;
  });
  list.unshift({
    name: entry.name,
    openedAt: entry.openedAt || Date.now(),
    href: entry.href || getPdfEditorHref(),
    path: entry.path || null,
  });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
  if (entry.path) {
    import('./recentFiles.js')
      .then((m) => m.rememberPath?.(entry.name, entry.path))
      .catch(() => { /* ignore */ });
  }
}

export function clearRecentDocuments() {
  localStorage.removeItem(RECENT_KEY);
}

/** Absolute editor URL for recent handoff from any page. */
export function getPdfEditorHref() {
  return `${appBase()}functionalities/pdfEditor/pdfEditor.html`;
}

/**
 * Open a recent PDF in the editor.
 * Stashes name/path and navigates; the editor reloads via path or IndexedDB cache.
 */
export function openRecentInEditor(doc) {
  if (!doc?.name && !doc?.path) return false;
  const payload = { path: doc.path || null, name: doc.name || null };

  try {
    sessionStorage.setItem(RECENT_OPEN_KEY, JSON.stringify(payload));
  } catch (_) { /* ignore */ }

  const onEditorPage = /\/pdfEditor\/pdfEditor\.html/i.test(window.location.pathname);
  if (onEditorPage) {
    window.dispatchEvent(new CustomEvent('pdeffy:open-recent', { detail: payload }));
    return true;
  }

  window.location.href = getPdfEditorHref();
  return true;
}

export function consumeRecentOpenRequest() {
  try {
    const raw = sessionStorage.getItem(RECENT_OPEN_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RECENT_OPEN_KEY);
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function ensureStylesheet() {
  const base = appBase();
  if (!document.querySelector('link[data-pdeffy-vars]')) {
    const v = document.createElement('link');
    v.rel = 'stylesheet';
    v.href = `${base}variables.css`;
    v.dataset.pdeffyVars = '1';
    document.head.prepend(v);
  }
  if (!document.querySelector('link[data-pdeffy-shell]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `${base}src/ui/shell.css`;
    l.dataset.pdeffyShell = '1';
    document.head.appendChild(l);
  }
}

export function filterToolCards(query) {
  const q = String(query || '').trim().toLowerCase();
  document.querySelectorAll('[data-tool-card]').forEach((card) => {
    const hay = (card.getAttribute('data-search') || card.textContent || '').toLowerCase();
    card.classList.toggle('is-hidden', q.length > 0 && !hay.includes(q));
  });
}

export function wireHomeSearch(input) {
  if (!input) return;
  input.addEventListener('input', () => filterToolCards(input.value));
}

export function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('pdeffy-sidebar-collapsed', !!collapsed);
}

export function getTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'dark' ? 'dark' : 'light';
  } catch (_) {
    return 'light';
  }
}

export function logoSrcForTheme(theme, base = appBase()) {
  // flat-light = yellow/white mark for dark UI; flat-dark = yellow/black mark for light UI
  return theme === 'dark'
    ? `${base}assets/pdeffy-flat-light.png`
    : `${base}assets/pdeffy-flat-dark.png`;
}

export function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  document.body.setAttribute('data-theme', next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (_) { /* ignore */ }

  const base = appBase();
  const src = logoSrcForTheme(next, base);
  document.querySelectorAll('[data-pdeffy-logo]').forEach((img) => {
    const light = img.dataset.iconLight;
    const dark = img.dataset.iconDark;
    if (light && dark) {
      img.src = next === 'dark' ? dark : light;
    } else {
      img.src = src;
    }
  });
  document.querySelectorAll('[data-pdeffy-nav-icon]').forEach((img) => {
    const nextSrc = next === 'dark' ? img.dataset.iconDark : img.dataset.iconLight;
    if (nextSrc) img.src = nextSrc;
  });

  window.dispatchEvent(new CustomEvent('pdeffy:theme-changed', { detail: { theme: next } }));
  return next;
}

function ensureAboutModal() {
  if (document.getElementById('pdeffyAboutModal')) return;

  const base = appBase();
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="pdeffy-about-modal" id="pdeffyAboutModal" hidden>
      <div class="pdeffy-about-dialog" role="dialog" aria-modal="true" aria-labelledby="pdeffyAboutTitle">
        <img class="pdeffy-about-logo" src="${logoSrcForTheme(getTheme(), base)}" alt="Pdeffy" data-pdeffy-logo data-icon-light="${base}assets/pdeffy-flat-dark.png" data-icon-dark="${base}assets/pdeffy-flat-light.png">
        <h2 id="pdeffyAboutTitle">Pdeffy</h2>
        <p class="pdeffy-about-version" id="pdeffyAboutVersion"></p>
        <p class="pdeffy-about-org">Reindal</p>
        <p class="pdeffy-about-license"><span class="langText" id="aboutLicenseLabel">License</span>: <strong>MIT</strong></p>
        <p class="pdeffy-about-web">
          <a href="https://pdeffy.reindal.com" id="pdeffyAboutWebsite" target="_blank" rel="noopener noreferrer">pdeffy.reindal.com</a>
        </p>
        <button type="button" class="pdeffy-btn pdeffy-btn-primary langText" id="aboutClose">Close</button>
      </div>
    </div>`
  );

  const modal = document.getElementById('pdeffyAboutModal');
  const close = () => modal?.setAttribute('hidden', '');
  document.getElementById('aboutClose')?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  document.getElementById('pdeffyAboutWebsite')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const url = 'https://pdeffy.reindal.com';
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open-external-url', { url });
    } catch (_) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  });
}

export async function openAboutModal() {
  ensureAboutModal();
  applyTheme(getTheme());
  const modal = document.getElementById('pdeffyAboutModal');
  const versionEl = document.getElementById('pdeffyAboutVersion');
  let version = '2.0.0';
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    version = await getVersion();
  } catch (_) { /* browser fallback */ }
  if (versionEl) versionEl.textContent = `v${version}`;
  if (typeof window.applyLanguage === 'function') {
    try {
      window.applyLanguage();
    } catch (_) { /* ignore */ }
  }
  modal?.removeAttribute('hidden');
}

function wireAboutMenuEvent() {
  import('@tauri-apps/api/event')
    .then(({ listen }) => listen('pdeffy-about', () => openAboutModal()))
    .catch(() => { /* not in Tauri */ });
  window.addEventListener('pdeffy:open-about', () => openAboutModal());
}

function boot() {
  ensureStylesheet();
  applyTheme(getTheme());
  wrapBody();
  ensureAboutModal();
  wireAboutMenuEvent();
  // Re-apply logo after sidebar inject
  applyTheme(getTheme());
  document.documentElement.classList.remove('pdeffy-booting');
  import('./filePicker.js')
    .then((m) => m.installNativeFilePickers?.())
    .catch(() => { /* ignore */ });
  import('./toolWorkspace.js')
    .then((m) => m.enhanceToolWorkspace?.())
    .catch(() => { /* ignore */ });
  if (typeof window.applyLanguage === 'function') {
    try {
      window.applyLanguage();
    } catch (_) { /* ignore */ }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

export default {
  icon,
  getAppBase,
  getRecentDocuments,
  pushRecentDocument,
  clearRecentDocuments,
  openRecentInEditor,
  consumeRecentOpenRequest,
  getPdfEditorHref,
  filterToolCards,
  wireHomeSearch,
  setSidebarCollapsed,
  getTheme,
  applyTheme,
  logoSrcForTheme,
  openAboutModal,
  ICONS,
};
