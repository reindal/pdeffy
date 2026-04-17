const StatusManager = (() => {

    // Resolve ipcRenderer once
    function _getIpc() {
        if (window.ipcRenderer) return window.ipcRenderer;
        try { return require('electron').ipcRenderer; } catch (_) { return null; }
    }

    // Modal elements references
    let modalOverlay = null;
    let modalGrid = null;

    function _initModal() {
        if (modalOverlay) return; // Already initialized

        // Create overlay
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'status-results-modal';
        modalOverlay.style.cssText = `
            display: none; 
            position: fixed; 
            top: 0; 
            left: 0; 
            width: 100%; 
            height: 100%; 
            background: rgba(0,0,0,0.85); 
            z-index: 10000; 
            padding: 2rem; 
            box-sizing: border-box;
            backdrop-filter: blur(4px);
        `;

        // Create modal container
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: var(--bg-color, #1e1e1e); 
            color: var(--text-color, #ffffff); 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 2rem; 
            border-radius: 8px; 
            max-height: 90vh; 
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            border: 1px solid var(--border-color, #333);
        `;

        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 1.5rem;
            border-bottom: 1px solid var(--border-color, #333);
            padding-bottom: 1rem;
        `;

        // Use class and data-i18n for dynamic translation
        const title = document.createElement('h2');
        title.style.margin = '0';
        title.className = 'langText';
        title.setAttribute('data-i18n', 'modalGeneratedFilesTitle');
        title.innerText = (typeof window.getMessage === 'function')
            ? window.getMessage('modalGeneratedFilesTitle')
            : 'Generated Files';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'langText';
        closeBtn.setAttribute('data-i18n', 'modalCloseBtn');
        closeBtn.innerText = (typeof window.getMessage === 'function')
            ? window.getMessage('modalCloseBtn')
            : '✕ Close';
        closeBtn.style.cssText = `
            background: none; 
            border: none; 
            color: inherit; 
            font-size: 1rem; 
            cursor: pointer;
            text-decoration: underline;
        `;
        closeBtn.onclick = _closeModal;

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Create 2-column grid
        modalGrid = document.createElement('div');
        modalGrid.style.cssText = `
            display: grid; 
            grid-template-columns: repeat(2, 1fr); 
            gap: 1.5rem;
        `;

        modalContent.appendChild(header);
        modalContent.appendChild(modalGrid);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Close when clicking outside the modal content
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) _closeModal();
        });
    }

    // Helper function to render the first page of a PDF onto a canvas
    async function _renderPdfPreview(filePath, canvasElement) {
        try {
            // Require fs dynamically so it works in the renderer process
            const fs = require('fs').promises;
            const fileBuffer = await fs.readFile(filePath);
            const data = new Uint8Array(fileBuffer);

            if (!window.pdfjsLib) {
                throw new Error('pdf.js library is not loaded on this page.');
            }

            // Load the document using pdf.js
            const loadingTask = window.pdfjsLib.getDocument({ data: data });
            const pdf = await loadingTask.promise;

            // Get the first page
            const page = await pdf.getPage(1);

            // Calculate scale to fit our preview box (max height ~140px)
            const unscaledViewport = page.getViewport({ scale: 1.0 });
            const targetHeight = 140;
            const scale = targetHeight / unscaledViewport.height;
            const viewport = page.getViewport({ scale: scale });

            // Set canvas dimensions
            canvasElement.height = viewport.height;
            canvasElement.width = viewport.width;

            // Render the page on the canvas
            const context = canvasElement.getContext('2d');
            await page.render({ canvasContext: context, viewport: viewport }).promise;

        } catch (error) {
            console.error('Failed to render PDF preview for:', filePath, error);
            // Draw a generic error/fallback box on the canvas
            const ctx = canvasElement.getContext('2d');
            canvasElement.width = 100;
            canvasElement.height = 140;
            ctx.fillStyle = '#333';
            ctx.fillRect(0, 0, 100, 140);
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Preview Error', 50, 70);
        }
    }

    // Helper function to render image previews natively
    async function _renderImagePreview(filePath, imgElement) {
        try {
            const fs = require('fs').promises;
            const fileBuffer = await fs.readFile(filePath);

            // Determine MIME type from extension
            const ext = filePath.split('.').pop().toLowerCase();
            const mimeType = ext === 'jpg' ? 'jpeg' : ext;

            // Convert buffer to base64 and set as src
            imgElement.src = `data:image/${mimeType};base64,${fileBuffer.toString('base64')}`;
        } catch (error) {
            console.error('Failed to load image preview for:', filePath, error);
            imgElement.alt = 'Preview Error';
        }
    }

    function _openModal(filesArray) {
        _initModal();
        modalGrid.innerHTML = ''; // Clear previous results

        filesArray.forEach((filePath) => {
            const sep = filePath.includes('\\') ? '\\' : '/';
            const fileName = filePath.substring(filePath.lastIndexOf(sep) + 1);

            const card = document.createElement('div');
            card.style.cssText = `
            background: var(--panel-bg, #2a2a2a);
            border: 1px solid var(--border-color, #444); 
            padding: 1rem; 
            border-radius: 6px; 
            display: flex; 
            flex-direction: column;
            align-items: center;
            transition: transform 0.2s;
        `;

            const previewBox = document.createElement('div');
            previewBox.style.cssText = `
            width: 100%;
            height: 150px; 
            background: var(--bg-color, #1a1a1a); 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            margin-bottom: 1rem;
            border-radius: 4px;
            overflow: hidden;
        `;

            // Detect file type and render accordingly
            const ext = filePath.split('.').pop().toLowerCase();
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);

            if (isImage) {
                // Render as standard image
                const img = document.createElement('img');
                img.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 2px 5px rgba(0,0,0,0.5);';
                previewBox.appendChild(img);
                _renderImagePreview(filePath, img);

            } else if (ext === 'pdf') {
                // Render as PDF Canvas
                const canvas = document.createElement('canvas');
                canvas.style.boxShadow = '0 2px 5px rgba(0,0,0,0.5)';
                previewBox.appendChild(canvas);
                _renderPdfPreview(filePath, canvas);

            } else {
                // Generic fallback for other file types
                previewBox.innerHTML = `<span style="opacity: 0.5;">${ext.toUpperCase()} File</span>`;
            }

            const nameLabel = document.createElement('p');
            nameLabel.innerText = fileName;
            nameLabel.style.cssText = `
            font-size: 0.9rem; 
            margin: 0 0 1rem 0; 
            word-break: break-all;
            text-align: center;
            flex-grow: 1;
        `;

            // Dynamic repeated button using data-i18n instead of ID
            const openBtn = document.createElement('button');
            openBtn.className = 'submitBtn langText';
            openBtn.setAttribute('data-i18n', 'statusOpenFile');
            openBtn.innerText = (typeof window.getMessage === 'function')
                ? window.getMessage('statusOpenFile')
                : 'Open file';
            openBtn.style.cssText = `
            width: 100%;
            padding: 8px;
            background-color: var(--primary-color, #0078d4);
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        `;
            openBtn.onclick = () => {
                const ipc = _getIpc();
                if (ipc) ipc.invoke('open-file', filePath);
            };

            card.appendChild(previewBox);
            card.appendChild(nameLabel);
            card.appendChild(openBtn);
            modalGrid.appendChild(card);
        });

        modalOverlay.style.display = 'block';
    }

    function _closeModal() {
        if (modalOverlay) {
            modalOverlay.style.display = 'none';
        }
    }

    function show(container, type, messageKey, params = {}) {
        const el = _resolve(container);
        if (!el) return;

        const text = (typeof window.getMessage === 'function')
            ? window.getMessage(messageKey, params)
            : messageKey;

        let inner = `<span class="status-message-text">${text}</span>`;

        // Determine if the output is a ZIP file by checking the extension
        const isZip = params.savePath && String(params.savePath).toLowerCase().endsWith('.zip');

        // Only treat as multiple files if it's an array of >1 AND it is NOT a ZIP archive
        const hasMultipleFiles = Array.isArray(params.savedFiles) && params.savedFiles.length > 1 && !isZip;
        const hasSingleFile = params.savePath !== undefined;

        if (type === 'success') {
            inner += `<br>`;

            // If it's a zip, use savePath as the reference, otherwise use the first saved file
            const referencePath = hasMultipleFiles ? params.savedFiles[0] : params.savePath;
            const sep = referencePath.includes('\\') ? '\\' : '/';
            const folderPath = referencePath.substring(0, referencePath.lastIndexOf(sep));

            const folderLabel = (typeof window.getMessage === 'function')
                ? window.getMessage('statusOpenFolder')
                : 'Open folder';

            if (hasMultipleFiles) {
                const viewResultsLabel = (typeof window.getMessage === 'function')
                    ? window.getMessage('statusViewResults')
                    : 'View results';

                inner += `
                    <span 
                        class="view-results-btn langText" 
                        data-i18n="statusViewResults"
                        style="cursor: pointer; text-decoration: underline; font-weight: 600;"
                        data-files='${_escapeAttr(JSON.stringify(params.savedFiles))}'
                    >${viewResultsLabel}</span>
                    <span style="margin: 0 8px;">|</span>`;
            } else if (hasSingleFile) {
                const fileLabel = (typeof window.getMessage === 'function')
                    ? window.getMessage('statusOpenFile')
                    : 'Open file';

                inner += `
                    <span 
                        class="open-file-btn langText" 
                        data-i18n="statusOpenFile"
                        style="cursor: pointer; text-decoration: underline; font-weight: 600;"
                        data-file="${_escapeAttr(params.savePath)}"
                    >${fileLabel}</span>
                    <span style="margin: 0 8px;">|</span>`;
            }

            inner += `
                <span 
                    class="open-folder-btn langText" 
                    data-i18n="statusOpenFolder"
                    style="cursor: pointer; text-decoration: underline;"
                    data-folder="${_escapeAttr(folderPath)}"
                >${folderLabel}</span>`;
        }

        el.innerHTML = inner;
        el.className = `status-box status-${type}`;
        el.style.display = 'block';

        // Bind the open-folder click
        const folderBtn = el.querySelector('.open-folder-btn');
        if (folderBtn) {
            folderBtn.addEventListener('click', () => {
                const folder = folderBtn.dataset.folder;
                const ipc = _getIpc();
                if (ipc) ipc.invoke('open-folder', folder);
            });
        }

        // Bind the open-file click
        const fileBtn = el.querySelector('.open-file-btn');
        if (fileBtn) {
            fileBtn.addEventListener('click', () => {
                const file = fileBtn.dataset.file;
                const ipc = _getIpc();
                if (ipc) ipc.invoke('open-file', file);
            });
        }

        // Bind the view-results click
        const resultsBtn = el.querySelector('.view-results-btn');
        if (resultsBtn) {
            resultsBtn.addEventListener('click', () => {
                const filesArray = JSON.parse(resultsBtn.dataset.files);
                _openModal(filesArray);
            });
        }

        // Auto-hide ONLY if it's a single file (or no file) success
        if (type === 'success' && !hasMultipleFiles) {
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

    function _resolve(target) {
        if (!target) return null;
        if (typeof target === 'string') return document.querySelector(target);
        return target;
    }

    function _escapeAttr(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    return { show, hide };
})();

window.StatusManager = StatusManager;