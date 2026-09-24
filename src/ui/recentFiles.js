/**
 * Recent PDF reopen: persist path + optional byte cache so "Recenti" opens the editor.
 */
const IDB_NAME = 'pdeffy.recentFiles';
const IDB_STORE = 'files';
const IDB_VERSION = 1;
const MAX_CACHED_BYTES = 40 * 1024 * 1024; // skip caching huge PDFs
const MAX_ENTRIES = 12;

function rememberPath(name, path) {
  if (!name || !path) return;
  try {
    const map = window.__pdeffyRecentPaths || {};
    map[name] = path;
    window.__pdeffyRecentPaths = map;
    window.__pdeffyLastPath = path;
  } catch (_) { /* ignore */ }
}

export { rememberPath };

export function getRememberedPath(name) {
  try {
    if (name && window.__pdeffyRecentPaths?.[name]) return window.__pdeffyRecentPaths[name];
    return window.__pdeffyLastPath || null;
  } catch (_) {
    return null;
  }
}

export function setLastNativePaths(paths) {
  const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean).map(String);
  try {
    window.__pdeffyLastNativePaths = list;
  } catch (_) { /* ignore */ }
  return list;
}

export function getLastNativePaths() {
  try {
    return Array.isArray(window.__pdeffyLastNativePaths)
      ? window.__pdeffyLastNativePaths.slice()
      : [];
  } catch (_) {
    return [];
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheRecentFile({ name, path, buffer }) {
  if (!name || !buffer) return;
  rememberPath(name, path);
  if (buffer.byteLength > MAX_CACHED_BYTES) return;

  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({
        name,
        path: path || null,
        buffer,
        savedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[recentFiles] cache failed', err);
  }
}

export async function readCachedRecent(name) {
  if (!name) return null;
  try {
    const db = await openDb();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(name);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return row;
  } catch (err) {
    console.warn('[recentFiles] read cache failed', err);
    return null;
  }
}

export async function pruneRecentCache(keepNames = []) {
  try {
    const db = await openDb();
    const all = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    const keep = new Set(keepNames);
    const sorted = all.slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    const toDelete = sorted
      .filter((row, idx) => !keep.has(row.name) && idx >= MAX_ENTRIES)
      .map((row) => row.name);
    if (toDelete.length) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        toDelete.forEach((n) => store.delete(n));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    db.close();
  } catch (_) { /* ignore */ }
}

/**
 * Resolve a File for a recent entry: path → disk, else IndexedDB cache.
 */
export async function fileForRecentDoc(doc) {
  const name = doc?.name;
  const path = doc?.path || getRememberedPath(name);

  if (path) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const bytes = new Uint8Array(await invoke('read-file-bytes', { path }));
      const base = String(path).replace(/\\/g, '/').split('/').pop() || name || 'document.pdf';
      const file = new File([bytes], base, { type: 'application/pdf' });
      try {
        Object.defineProperty(file, 'pdeffyPath', { value: path, enumerable: false });
      } catch (_) {
        file.pdeffyPath = path;
      }
      return { file, path };
    } catch (err) {
      console.warn('[recentFiles] path open failed', err);
    }
  }

  const cached = await readCachedRecent(name);
  if (cached?.buffer) {
    const file = new File([cached.buffer], name || 'document.pdf', {
      type: 'application/pdf',
    });
    return { file, path: cached.path || path || null };
  }

  return null;
}

export default {
  cacheRecentFile,
  readCachedRecent,
  fileForRecentDoc,
  setLastNativePaths,
  getLastNativePaths,
  getRememberedPath,
  rememberPath,
  pruneRecentCache,
};
