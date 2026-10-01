/**
 * App shell: persistent sidebar + shared navigation for multi-page HTML.
 */
import { actionMaskIcon, navMaskIcon } from './icons.js';
import sidebarWordmarkUrl from '../../assets/pdeffy-flat-light.svg?url';
import sidebarMarkUrl from '../../src-tauri/icons/128x128.png?url';

const ICONS = {
  mark: `<svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="3" y="2" width="16" height="20" rx="3" fill="#FFD91A"/><rect x="9" y="6" width="16" height="20" rx="3" fill="#3478F6"/><path d="M14 12h6M14 16h4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  home: null,
  organize: null,
  convert: null,
    edit: null,
    open: null,
    assistant: null,
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
    open: () => navMaskIcon(base, 'open-pdf.svg'),
    assistant: () => navMaskIcon(base, 'assistant.svg'),
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
  if (forced) {
        // Legacy edit/assistant ids map to the unified "Open PDF" entry.
    if (forced === 'edit' || forced === 'assistant' || forced === 'open') return 'open';
    return forced;
  }
  const p = window.location.pathname.replace(/\\/g, '/').toLowerCase();
  if (p.endsWith('/index.html') || p.endsWith('/') || /\/pdeffy\/?$/.test(p)) return 'home';
  if (p.includes('/hubs/organize')) return 'organize';
  if (p.includes('/hubs/convert')) return 'convert';
  if (
    p.includes('/assistentepdf/') ||
    p.includes('/hubs/edit') ||
    p.includes('/pdfeditor/') ||
    p.includes('/watermark/') ||
    p.includes('/redact') ||
    p.includes('/rotate') ||
    p.includes('/delete')
  ) {
    return 'open';
  }
  if (p.includes('/hubs/recent')) return 'recent';
  if (p.includes('/settings/')) return 'settings';
  if (p.includes('/merge/') || p.includes('/split/') || p.includes('/pdfgenerator/') || p.includes('/protectpdf/') || p.includes('/compresspdf/') || p.includes('/summarizepdf/')) {
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
      id: 'open',
      href: `${base}functionalities/pdfEditor/pdfEditor.html`,
      labelKey: 'navOpenPdf',
      label: 'Apri PDF',
      iconHtml: resolveIcon('open', base),
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
      <div class="pdeffy-sidebar-top">
        <a class="pdeffy-sidebar-brand" href="${base}index.html" title="Pdeffy" aria-expanded="true" aria-label="Pdeffy, riduci barra laterale">
          <img class="pdeffy-sidebar-logo pdeffy-sidebar-logo--wordmark" src="${sidebarWordmarkUrl}" alt="" decoding="async">
          <img class="pdeffy-sidebar-logo pdeffy-sidebar-logo--mark" src="${sidebarMarkUrl}" alt="" decoding="async">
        </a>
      </div>
      <nav class="pdeffy-nav">${items}</nav>
      <div class="pdeffy-sidebar-footer">
        <a class="pdeffy-nav-item${active === 'settings' ? ' is-active' : ''}" id="pdeffyOpenSettings" href="${base}functionalities/settings/settings.html" data-nav-id="settings" title="Impostazioni" aria-label="Impostazioni">
          <span class="pdeffy-nav-icon">${resolveIcon('settings', base)}</span>
          <span class="pdeffy-nav-label langText" id="navSettings">Impostazioni</span>
        </a>
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
    'pdfEditorPasswordModal',
    'pdfEditorCommentModal',
    'pdfEditorAttachmentsModal',
    'pdfEditorSignaturesModal',
    'pdfEditorCtxMenu',
    'pdeffyAboutModal',
    'setup-wizard-host',
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
  wireSidebarBrandToggle();
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

/** Absolute Assistente PDF URL (AI mode of the editor). */
export function getAssistentePdfHref(tab = 'anonymize') {
  const tool = tab === 'summary' || tab === 'anonymize' ? tab : 'anonymize';
  return `${appBase()}functionalities/pdfEditor/pdfEditor.html?mode=ai&tool=${encodeURIComponent(tool)}`;
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

    window.location.replace(getPdfEditorHref());
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

function normalizeSearchText(value) {
  // Avoid false positives like "word" ⊂ "password" while keeping mid-token matches.
  return String(value || '')
    .toLowerCase()
    .replace(/password/g, 'pwd');
}

export function filterToolCards(query) {
  const q = normalizeSearchText(String(query || '').trim());
  document.querySelectorAll('[data-tool-card]').forEach((card) => {
    if (!q) {
      card.classList.remove('is-hidden');
      return;
    }
    const hay = normalizeSearchText(
      `${card.getAttribute('data-search') || ''} ${card.textContent || ''}`
    );
    card.classList.toggle('is-hidden', !hay.includes(q));
  });
}

export function wireHomeSearch(input) {
  if (!input) return;
  input.addEventListener('input', () => filterToolCards(input.value));
}

function syncSidebarBrandAria() {
  const brand = document.querySelector('.pdeffy-sidebar-brand');
  if (!brand) return;
  const collapsed = document.body.classList.contains('pdeffy-sidebar-collapsed');
  const editing = document.body.classList.contains('pdfEditorEditing');
  brand.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  if (editing) {
    brand.setAttribute('aria-label', 'Pdeffy');
  } else {
    brand.setAttribute(
      'aria-label',
      collapsed ? 'Pdeffy, espandi barra laterale' : 'Pdeffy, riduci barra laterale'
    );
  }
}

function wireSidebarBrandToggle() {
  const brand = document.querySelector('.pdeffy-sidebar-brand');
  if (!brand || brand.dataset.pdeffyBrandToggleWired) return;
  brand.dataset.pdeffyBrandToggleWired = '1';
  syncSidebarBrandAria();
  brand.addEventListener('click', (e) => {
    if (document.body.classList.contains('pdfEditorEditing')) {
      e.preventDefault();
      setSidebarCollapsed(true);
      return;
    }
    e.preventDefault();
    setSidebarCollapsed(!document.body.classList.contains('pdeffy-sidebar-collapsed'));
  });
  const ariaObserver = new MutationObserver(() => syncSidebarBrandAria());
  ariaObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

export function setSidebarCollapsed(collapsed) {
  if (!collapsed && document.body.classList.contains('pdfEditorEditing')) {
    return;
  }
  document.body.classList.toggle('pdeffy-sidebar-collapsed', !!collapsed);
  syncSidebarBrandAria();
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

/**
 * Desktop app UX: never leave the current page via browser back/forward.
 * Cross-document Back reloads the previous page — bounce with history.forward().
 * A session flag avoids looping when the forward itself is also type back_forward.
 */
function disableBrowserHistoryNavigation() {
  if (window.__pdeffyNoBackInstalled) return;
  window.__pdeffyNoBackInstalled = true;

  const BOUNCE_KEY = 'pdeffy.historyBounce';

  const isBackForwardNav = () => {
    try {
      const nav = performance.getEntriesByType?.('navigation')?.[0];
      const type = nav?.type ?? performance.navigation?.type;
      return type === 'back_forward' || type === 2;
    } catch (_) {
      return false;
    }
  };

  const bounceIfBackForward = () => {
    try {
      if (sessionStorage.getItem(BOUNCE_KEY) === '1') {
        sessionStorage.removeItem(BOUNCE_KEY);
        return false;
      }
      if (!isBackForwardNav()) return false;
      sessionStorage.setItem(BOUNCE_KEY, '1');
      history.forward();
      return true;
    } catch (_) {
      return false;
    }
  };

  bounceIfBackForward();
  window.addEventListener(
    'pageshow',
    (e) => {
      if (e.persisted) {
        try {
          if (sessionStorage.getItem(BOUNCE_KEY) === '1') {
            sessionStorage.removeItem(BOUNCE_KEY);
            return;
          }
          sessionStorage.setItem(BOUNCE_KEY, '1');
          history.forward();
        } catch (_) { /* ignore */ }
        return;
      }
      bounceIfBackForward();
    },
    true
  );

  try {
    history.pushState({ pdeffy: 1 }, '', location.href);
  } catch (_) { /* ignore */ }

  window.addEventListener('popstate', () => {
    try {
      history.pushState({ pdeffy: 1 }, '', location.href);
    } catch (_) { /* ignore */ }
  });

  try {
    history.back = () => {};
    const go = history.go.bind(history);
    history.go = (delta) => {
      if (typeof delta === 'number' && delta < 0) return;
      return go(delta);
    };
  } catch (_) { /* ignore */ }

  try {
    const loc = window.location;
    const replace = loc.replace.bind(loc);
    loc.assign = replace;
    const desc = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    if (desc?.set) {
      Object.defineProperty(loc, 'href', {
        configurable: true,
        enumerable: true,
        get: desc.get?.bind(loc),
        set: (v) => replace(String(v)),
      });
    }
  } catch (_) { /* ignore */ }

  const blockSideButton = (e) => {
    if (e.button === 3 || e.button === 4) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener('mouseup', blockSideButton, true);
  window.addEventListener('auxclick', blockSideButton, true);
  window.addEventListener(
    'keydown',
    (e) => {
      const key = e.key;
      if (
        ((e.metaKey || e.altKey) &&
          (key === '[' || key === ']' || key === 'ArrowLeft' || key === 'ArrowRight')) ||
        (e.altKey && (key === 'Left' || key === 'Right'))
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button != null && e.button !== 0) return;
      const a = e.target?.closest?.('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const raw = a.getAttribute('href');
      if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return;
      let url;
      try {
        url = new URL(a.href, location.href);
      } catch (_) {
        return;
      }
      if (url.origin !== location.origin) return;
      e.preventDefault();
      if (url.href !== location.href) location.replace(url.href);
    },
    true
  );
}

async function installPdfOpenRouting() {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');

  const pending = await invoke('take-pending-pdf-opens');
  if (Array.isArray(pending) && pending.length) {
    const last = pending[pending.length - 1];
    openRecentInEditor({ path: last.path, name: last.name });
  }

  await listen('pdeffy-open-pdf', (event) => {
    const detail = event.payload || {};
    openRecentInEditor({ path: detail.path, name: detail.name });
  });
}

function boot() {
  ensureStylesheet();
  applyTheme(getTheme());
  wrapBody();
  ensureAboutModal();
  wireAboutMenuEvent();
  disableBrowserHistoryNavigation();
  // Re-apply logo after sidebar inject
  applyTheme(getTheme());
  document.documentElement.classList.remove('pdeffy-booting');
  import('./filePicker.js')
    .then((m) => m.installNativeFilePickers?.())
    .catch(() => { /* ignore */ });
  import('./toolWorkspace.js')
    .then((m) => m.enhanceToolWorkspace?.())
    .catch(() => { /* ignore */ });
  installPdfOpenRouting().catch(() => { /* ignore */ });
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
  getAssistentePdfHref,
  filterToolCards,
  wireHomeSearch,
  setSidebarCollapsed,
  getTheme,
  applyTheme,
  logoSrcForTheme,
  openAboutModal,
  ICONS,
};
