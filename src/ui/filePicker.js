/**
 * Native open-file dialogs with extension filters (Tauri).
 * HTML `accept` is only a soft hint in WebView; this uses the OS dialog filters.
 */
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { setLastNativePaths, getLastNativePaths as getSharedLastNativePaths } from './recentFiles.js';

const MIME_TO_EXT = {
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-excel': ['xls'],
  'text/csv': ['csv'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'text/markdown': ['md', 'markdown'],
  'text/plain': ['txt', 'text'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/jpg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'image/bmp': ['bmp'],
  'image/gif': ['gif'],
};

function basename(filePath) {
  const parts = String(filePath).replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || 'file';
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function mimeForName(name) {
  const e = extOf(name);
  const map = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    text: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    bmp: 'image/bmp',
    gif: 'image/gif',
  };
  return map[e] || 'application/octet-stream';
}

export function parseAcceptExtensions(accept) {
  const exts = new Set();
  String(accept || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .forEach((token) => {
      if (token.startsWith('.')) {
        exts.add(token.slice(1));
        return;
      }
      if (token === 'image/*') {
        ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].forEach((e) => exts.add(e));
        return;
      }
      const mapped = MIME_TO_EXT[token];
      if (mapped) mapped.forEach((e) => exts.add(e));
    });
  return [...exts];
}

export function filtersFromAccept(accept) {
  const exts = parseAcceptExtensions(accept);
  if (!exts.length) return undefined;

  const only = (list) => list.every((e) => exts.includes(e)) && exts.length === list.length;

  if (only(['pdf'])) return [{ name: 'PDF', extensions: ['pdf'] }];
  if (exts.every((e) => ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(e))) {
    return [{ name: 'Images', extensions: exts }];
  }
  if (exts.every((e) => ['docx', 'doc'].includes(e))) {
    return [{ name: 'Word', extensions: exts }];
  }
  if (exts.every((e) => ['xlsx', 'xls', 'csv'].includes(e))) {
    return [{ name: 'Spreadsheets', extensions: exts }];
  }
  if (exts.every((e) => ['pptx', 'ppt'].includes(e))) {
    return [{ name: 'PowerPoint', extensions: exts }];
  }
  if (exts.every((e) => ['md', 'markdown', 'txt', 'text'].includes(e))) {
    return [{ name: 'Text', extensions: exts }];
  }
  return [{ name: 'Supported files', extensions: exts }];
}

async function readPathToFile(filePath) {
  const bytes = new Uint8Array(await invoke('read-file-bytes', { path: filePath }));
  const name = basename(filePath);
  const file = new File([bytes], name, { type: mimeForName(name) });
  try {
    Object.defineProperty(file, 'pdeffyPath', { value: filePath, enumerable: false });
  } catch (_) {
    file.pdeffyPath = filePath;
  }
  return file;
}

export async function fileFromPath(filePath) {
  return readPathToFile(filePath);
}

export function getLastNativePaths() {
  return getSharedLastNativePaths();
}

export function pathOfFile(file) {
  if (!file) return null;
  if (file.pdeffyPath) return file.pdeffyPath;
  if (typeof file.path === 'string' && file.path) return file.path;
  return null;
}

/**
 * Open a filtered native dialog and assign FileList onto the given <input type="file">.
 */
export async function assignFilesFromNativeDialog(input) {
  if (!input || input.type !== 'file') return false;

  const filters = filtersFromAccept(input.accept);
  const selected = await open({
    multiple: !!input.multiple,
    filters,
  });
  if (selected == null) return false;

  const paths = Array.isArray(selected) ? selected : [selected];
  if (!paths.length) return false;

  const normalized = setLastNativePaths(paths);
  const dt = new DataTransfer();
  for (const p of normalized) {
    dt.items.add(await readPathToFile(p));
  }
  input.files = dt.files;
  try {
    input.dataset.pdeffyPaths = JSON.stringify(normalized);
  } catch (_) { /* ignore */ }
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

let installed = false;
let picking = false;

/**
 * Intercept file-input / label clicks and use the OS dialog with filters.
 */
export function installNativeFilePickers() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  document.addEventListener(
    'click',
    async (event) => {
      if (picking) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      let input = null;
      const t = event.target;
      if (t instanceof HTMLInputElement && t.type === 'file') {
        input = t;
      } else {
        const label = t instanceof Element ? t.closest('label[for]') : null;
        if (label) {
          const el = document.getElementById(label.getAttribute('for'));
          if (el instanceof HTMLInputElement && el.type === 'file') input = el;
        }
      }

      if (!input || input.disabled) return;
      if (input.dataset.pdeffyNativeBypass === '1') return;

      event.preventDefault();
      event.stopPropagation();

      picking = true;
      try {
        await assignFilesFromNativeDialog(input);
      } catch (err) {
        console.warn('[filePicker] native dialog failed, falling back', err);
        input.dataset.pdeffyNativeBypass = '1';
        try {
          input.click();
        } finally {
          delete input.dataset.pdeffyNativeBypass;
        }
      } finally {
        picking = false;
      }
    },
    true
  );
}

function matchesExtensions(filePathOrName, extensions) {
  if (!extensions?.length) return true;
  const name = String(filePathOrName).toLowerCase();
  return extensions.some((ext) => name.endsWith(`.${String(ext).toLowerCase().replace(/^\./, '')}`));
}

/**
 * Wire a dropzone to Tauri's native file-drop events (HTML5 DnD is intercepted by Tauri).
 * Falls back gracefully when not running inside Tauri.
 */
export async function wireTauriDropZone(dropZoneEl, options = {}) {
  if (!dropZoneEl) return () => {};

  const {
    acceptExtensions = ['pdf'],
    onFiles,
    isActive = () => true,
  } = options;

  const setHover = (on) => {
    dropZoneEl.classList.toggle('dragover', on);
    dropZoneEl.classList.toggle('is-dragover', on);
  };

  let unlisten = null;
  try {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview');
    const webview = getCurrentWebview();
    unlisten = await webview.onDragDropEvent(async (event) => {
      const payload = event.payload || {};
      const type = payload.type;

      if (!isActive()) {
        setHover(false);
        return;
      }

      if (type === 'enter' || type === 'over') {
        setHover(true);
        return;
      }
      if (type === 'leave') {
        setHover(false);
        return;
      }
      if (type !== 'drop') return;

      setHover(false);
      const paths = (payload.paths || []).filter((p) => matchesExtensions(p, acceptExtensions));
      if (!paths.length) return;

      try {
        const { setLastNativePaths } = await import('./recentFiles.js');
        setLastNativePaths(paths);
      } catch (_) { /* ignore */ }

      const files = [];
      for (const p of paths) {
        files.push(await readPathToFile(p));
      }
      if (typeof onFiles === 'function') onFiles(files, paths);
    });
  } catch (err) {
    console.warn('[filePicker] Tauri drag-drop unavailable', err);
  }

  return () => {
    try {
      unlisten?.();
    } catch (_) { /* ignore */ }
  };
}

export default {
  parseAcceptExtensions,
  filtersFromAccept,
  assignFilesFromNativeDialog,
  installNativeFilePickers,
  wireTauriDropZone,
  fileFromPath,
  getLastNativePaths,
  pathOfFile,
};
