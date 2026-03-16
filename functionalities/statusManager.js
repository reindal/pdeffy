const StatusManager = (() => {
 
    // Resolve ipcRenderer once, works both with contextIsolation off (require)
    // and when exposed via preload as window.ipcRenderer
    function _getIpc() {
        if (window.ipcRenderer) return window.ipcRenderer;
        try { return require('electron').ipcRenderer; } catch (_) { return null; }
    }
 

    function show(container, type, messageKey, params = {}) {
        const el = _resolve(container);
        if (!el) return;
 
        // Translate the main message
        const text = (typeof window.getMessage === 'function')
            ? window.getMessage(messageKey, params)
            : messageKey;
 
        // Build inner HTML
        let inner = `<span class="status-message-text">${text}</span>`;
 
        // If success and a save path is provided, append the open-folder link.
        // We store the FOLDER (dirname) in data-folder so clicking opens the directory.
        if (type === 'success' && params.savePath) {
            // Derive folder from full file path using a cross-platform approach
            const savePath = params.savePath;
            const sep = savePath.includes('\\') ? '\\' : '/';
            const folderPath = savePath.substring(0, savePath.lastIndexOf(sep));
 
            // Label is read at render time using the current language
            const linkLabel = (typeof window.getMessage === 'function')
                ? window.getMessage('statusOpenFolder')
                : 'Open folder';
 
            inner += `<br><span
                class="open-folder-btn"
                data-folder="${_escapeAttr(folderPath)}"
            >${linkLabel}</span>`;
        }
 
        el.innerHTML = inner;
        el.className = `status-box status-${type}`;
        el.style.display = 'block';
 
        // Bind the open-folder click — uses shell.openPath via main process
        const folderBtn = el.querySelector('.open-folder-btn');
        if (folderBtn) {
            folderBtn.addEventListener('click', () => {
                const folder = folderBtn.dataset.folder;
                const ipc = _getIpc();
                if (ipc) {
                    ipc.invoke('open-folder', folder);
                }
            });
        }
 
        // Auto-hide success after 12 s
        if (type === 'success') {
            setTimeout(() => hide(el), 12000);
        }
    }
 
    function hide(container) {
        const el = _resolve(container);
        if (!el) return;
        el.style.display = 'none';
        el.className = 'status-box';
        el.innerHTML = '';
    }
 
    // ── helpers ──────────────────────────────────────────────────────────────
 
    function _resolve(target) {
        if (!target) return null;
        if (typeof target === 'string') return document.querySelector(target);
        return target;
    }
 
    function _escapeAttr(str) {
        return String(str).replace(/"/g, '&quot;');
    }
 
    return { show, hide };
})();
 
window.StatusManager = StatusManager;