/**
 * App shell: persistent sidebar + shared navigation for multi-page HTML.
 */
const ICONS = {
  mark: `<svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="3" y="2" width="16" height="20" rx="3" fill="#FFD91A"/><rect x="9" y="6" width="16" height="20" rx="3" fill="#3478F6"/><path d="M14 12h6M14 16h4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"/></svg>`,
  organize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="13" width="7" height="7" rx="1.5"/><rect x="14" y="13" width="7" height="7" rx="1.5"/></svg>`,
  convert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h11l-3-3M17 17H6l3 3"/><path d="M7 7v7a3 3 0 0 0 3 3h1M17 17v-7a3 3 0 0 0-3-3h-1"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>`,
  recent: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V5M8 8l4-4 4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>`,
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

const RECENT_KEY = 'pdeffy.recentDocuments';

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
    { id: 'home', href: `${base}index.html`, labelKey: 'navHome', label: 'Home', icon: 'home' },
    { id: 'organize', href: `${base}functionalities/hubs/organize.html`, labelKey: 'navOrganize', label: 'Organizza PDF', icon: 'organize' },
    { id: 'convert', href: `${base}functionalities/hubs/convert.html`, labelKey: 'navConvert', label: 'Converti PDF', icon: 'convert' },
    { id: 'edit', href: `${base}functionalities/pdfEditor/pdfEditor.html`, labelKey: 'navEdit', label: 'Modifica PDF', icon: 'edit' },
    { id: 'recent', href: `${base}functionalities/hubs/recent.html`, labelKey: 'navRecent', label: 'Recenti', icon: 'recent' },
  ];
}

function buildSidebar(base, active) {
  const items = navItems(base)
    .map(
      (item) => `
      <a class="pdeffy-nav-item${item.id === active ? ' is-active' : ''}" href="${item.href}" data-nav-id="${item.id}" title="${item.label}" aria-label="${item.label}">
        <span class="pdeffy-nav-icon">${ICONS[item.icon]}</span>
        <span class="pdeffy-nav-label langText" id="${item.labelKey}">${item.label}</span>
      </a>`
    )
    .join('');

  return `
    <aside class="pdeffy-sidebar" aria-label="Primary">
      <a class="pdeffy-sidebar-brand" href="${base}index.html" title="Pdeffy">
        ${ICONS.mark}
        <span class="pdeffy-sidebar-brand-text">pdeffy</span>
      </a>
      <nav class="pdeffy-nav">${items}</nav>
      <div class="pdeffy-sidebar-footer">
        <button type="button" class="pdeffy-nav-item" id="pdeffyOpenSettings" title="Impostazioni" aria-label="Impostazioni">
          <span class="pdeffy-nav-icon">${ICONS.settings}</span>
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
    document.body.classList.add('pdeffy-editor-mode', 'pdeffy-sidebar-collapsed');
  }

  const main = document.createElement('div');
  main.className = 'pdeffy-main';

  Array.from(document.body.children)
    .filter((el) => !['SCRIPT', 'LINK', 'STYLE'].includes(el.tagName))
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
  return ICONS[name] || '';
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
  const list = getRecentDocuments().filter((x) => x.name !== entry.name);
  list.unshift({
    name: entry.name,
    openedAt: entry.openedAt || Date.now(),
    href: entry.href || null,
  });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
}

export function clearRecentDocuments() {
  localStorage.removeItem(RECENT_KEY);
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

function boot() {
  ensureStylesheet();
  wrapBody();
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
  filterToolCards,
  wireHomeSearch,
  setSidebarCollapsed,
  ICONS,
};
