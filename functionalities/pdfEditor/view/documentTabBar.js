/**
 * Document tabs with interactive attachment / signature controls.
 */
(function (global) {
    const ICONS = {
        pdf: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="#fff" stroke="#101A3A" stroke-width="1.4" d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path fill="#DC2626" d="M7 15h10v4H7z"/><text x="12" y="17.5" text-anchor="middle" fill="#fff" font-size="4" font-weight="700" font-family="Arial,sans-serif">PDF</text></svg>`,
        paperclip: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05 12.7 19.78a5.25 5.25 0 0 1-7.43-7.43l9.9-9.9a3.5 3.5 0 0 1 4.95 4.95l-9.9 9.9a1.75 1.75 0 0 1-2.47-2.48l8.49-8.48"/></svg>`,
        shieldOk: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.85" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-3Z"/><path d="m9 12 2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        shieldBad: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.85" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-3Z"/><path d="m15 9-6 6M9 9l6 6" stroke-linecap="round"/></svg>`,
        shieldWarn: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.85" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-3Z"/><path d="M12 9v4M12 16h.01" stroke-linecap="round"/></svg>`,
        shieldNeutral: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.85" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-3Z"/></svg>`,
        close: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke-linecap="round"/></svg>`,
    };

    function msg(key, fallback, params) {
        if (typeof window.getMessage === 'function') {
            const v = window.getMessage(key, params || {});
            if (v && v !== key) return v;
        }
        let out = fallback;
        if (params && typeof out === 'string') {
            Object.keys(params).forEach((k) => {
                out = out.split(`{${k}}`).join(String(params[k] ?? ''));
            });
        }
        return out;
    }

    function shieldIcon(kind) {
        if (kind === 'invalid') return ICONS.shieldBad;
        if (kind === 'warning') return ICONS.shieldWarn;
        return ICONS.shieldNeutral;
    }

    function shieldClass(kind) {
        if (kind === 'invalid') return 'is-invalid';
        if (kind === 'warning') return 'is-warning';
        return 'is-unknown';
    }

    /**
     * @param {object} ctx
     * @param {() => HTMLElement|null} ctx.getContainer
     * @param {() => object} ctx.getTabState
     * @param {(tabId: string) => void} ctx.onActivateTab
     * @param {(tabId: string) => void} ctx.onCloseTab
     * @param {(tabId: string) => void} ctx.onOpenAttachments
     * @param {(tabId: string) => void} ctx.onOpenSignatures
     */
    function createDocumentTabBar(ctx) {
        let dragTabId = null;

        function render() {
            const container = ctx.getContainer();
            if (!container) return;
            const state = ctx.getTabState();
            const tabs = state?.tabs || [];
            container.hidden = !tabs.length;
            container.innerHTML = '';
            if (!tabs.length) return;

            tabs.forEach((tab) => {
                const root = document.createElement('div');
                root.className = `document-tab${tab.active ? ' is-active' : ''}`;
                root.setAttribute('role', 'tab');
                root.setAttribute('aria-selected', tab.active ? 'true' : 'false');
                root.tabIndex = tab.active ? 0 : -1;
                root.dataset.tabId = tab.id;

                const activate = document.createElement('button');
                activate.type = 'button';
                activate.className = 'document-tab__activate';
                activate.innerHTML = `${ICONS.pdf}<span class="document-tab__name"></span>`;
                activate.querySelector('.document-tab__name').textContent = tab.fileName || 'document.pdf';
                activate.setAttribute('aria-label', msg('pdfEditorTabOpen', 'Apri {name}', { name: tab.fileName || 'PDF' }));
                activate.addEventListener('click', () => ctx.onActivateTab(tab.id));

                root.appendChild(activate);

                const nAtt = tab.attachmentsCount || 0;
                if (nAtt > 0) {
                    const attBtn = document.createElement('button');
                    attBtn.type = 'button';
                    attBtn.className = 'document-tab__attachments';
                    attBtn.innerHTML = `${ICONS.paperclip}<span>${nAtt}</span>`;
                    attBtn.title = msg('pdfEditorAttachmentsCountTitle', '{count} allegati', { count: nAtt });
                    attBtn.setAttribute(
                        'aria-label',
                        msg('pdfEditorTabAttachmentsAria', 'Apri {count} allegati di {name}', {
                            count: nAtt,
                            name: tab.fileName,
                        })
                    );
                    attBtn.addEventListener('mousedown', (e) => e.stopPropagation());
                    attBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        ctx.onOpenAttachments(tab.id, e.currentTarget);
                    });
                    root.appendChild(attBtn);
                }

                const sigUi = tab.signatureUi;
                if (sigUi) {
                    const sigBtn = document.createElement('button');
                    sigBtn.type = 'button';
                    sigBtn.className = `document-tab__signature ${shieldClass(sigUi.kind)}`;
                    sigBtn.innerHTML = shieldIcon(sigUi.kind);
                    sigBtn.title = tab.signatureTooltip || sigUi.fallback || '';
                    sigBtn.setAttribute('aria-label', tab.signatureTooltip || sigUi.fallback || '');
                    sigBtn.addEventListener('mousedown', (e) => e.stopPropagation());
                    sigBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        ctx.onOpenSignatures(tab.id, e.currentTarget);
                    });
                    root.appendChild(sigBtn);
                }

                if (tab.dirty) {
                    const dirty = document.createElement('span');
                    dirty.className = 'document-tab__dirty';
                    dirty.setAttribute('aria-label', msg('pdfEditorDirty', 'Modifiche non salvate'));
                    root.appendChild(dirty);
                }

                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'document-tab__close';
                closeBtn.innerHTML = ICONS.close;
                closeBtn.setAttribute(
                    'aria-label',
                    msg('pdfEditorTabClose', 'Chiudi {name}', { name: tab.fileName || 'PDF' })
                );
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    ctx.onCloseTab(tab.id);
                });
                root.appendChild(closeBtn);

                root.addEventListener('dragstart', (e) => {
                    dragTabId = tab.id;
                    e.dataTransfer?.setData('text/plain', tab.id);
                });
                root.draggable = true;

                container.appendChild(root);
            });
        }

        return { render };
    }

    global.PdfEditorDocumentTabBar = { createDocumentTabBar };
})(typeof window !== 'undefined' ? window : global);
