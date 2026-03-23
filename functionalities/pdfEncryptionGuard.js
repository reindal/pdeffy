const PdfEncryptionGuard = (() => {
    const { PDFDocument } = require('pdf-lib');


    // Create the toast element once and reuse it
    function _getToast() {
        let toast = document.getElementById('peg-toast');
        if (toast) return toast;

        toast = document.createElement('div');
        toast.id = 'peg-toast';
        toast.innerHTML = `
            <svg id="peg-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span id="peg-toast-text"></span>
            <button id="peg-toast-close" aria-label="Close">✕</button>
        `;
        document.body.appendChild(toast);

        document.getElementById('peg-toast-close').addEventListener('click', () => _hideToast());

        return toast;
    }

    let _toastTimer = null;

    function _showToast(message) {
        const toast = _getToast();
        document.getElementById('peg-toast-text').textContent = message;

        // Clear any existing auto-hide timer before showing again
        if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }

        // Trigger animation on next frame to ensure transition fires
        requestAnimationFrame(() => toast.classList.add('peg-toast-visible'));

        _toastTimer = setTimeout(() => _hideToast(), 4000);
    }

    function _hideToast() {
        const toast = document.getElementById('peg-toast');
        if (!toast) return;
        toast.classList.remove('peg-toast-visible');
        if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
    }

    async function check(file, statusSel) {
        if (!file || !file.name.toLowerCase().endsWith('.pdf')) return false;

        try {
            const buffer = await file.arrayBuffer();
            await PDFDocument.load(buffer);

            // Load succeeded — PDF is not encrypted, clear any previous encryption error
            _hideToast();
            StatusManager.hide(statusSel);
            return false;
        } catch (err) {
            const isEncrypted =
                err.message && (
                    err.message.includes('encrypted') ||
                    err.message.includes('password') ||
                    err.message.includes('decrypt')
                );

            if (isEncrypted) {
                // Resolve the translated message the same way StatusManager does
                const message = (typeof window.getMessage === 'function')
                    ? window.getMessage('encryptedPdfError')
                    : 'This PDF is password-protected and cannot be processed.';

                _showToast(message);
                return true;
            }

            // Unknown load error — let the normal processing flow handle it
            return false;
        }
    }

    function checkSync(file, statusSel, onResult) {
        check(file, statusSel).then(blocked => {
            if (typeof onResult === 'function') onResult(blocked);
        });
    }

    return { check, checkSync };
})();

window.PdfEncryptionGuard = PdfEncryptionGuard;