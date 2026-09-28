/**
 * Document information inspector (attachments + digital signatures) in the right panel.
 */
(function (global) {
    const TAB_ICONS = {
        paperclip: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05 12.7 19.78a5.25 5.25 0 0 1-7.43-7.43l9.9-9.9a3.5 3.5 0 0 1 4.95 4.95l-9.9 9.9a1.75 1.75 0 0 1-2.47-2.48l8.49-8.48"/></svg>`,
        shield: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.85" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-3Z"/></svg>`,
        properties: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.85" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01" stroke-linecap="round"/></svg>`,
    };

    /** @type {Map<string, object>} */
    const returnStateByDoc = new Map();

    let ctx = null;
    let activeDocId = null;
    let activeInfoTab = 'attachments';
    let certViewSigId = null;
    let lastFocusEl = null;

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

    function extLabel(filename) {
        const ext = String(filename || '').split('.').pop()?.toUpperCase() || 'FILE';
        return ext.length <= 5 ? ext : 'FILE';
    }

    function isExecutableName(name) {
        return /\.(exe|msi|bat|cmd|com|scr|ps1|sh|app|dmg|pkg|deb|rpm)$/i.test(String(name || ''));
    }

    function bind(context) {
        ctx = context;
    }

    function getReturnState(docId) {
        return returnStateByDoc.get(docId || activeDocId) || null;
    }

    function setReturnState(docId, state) {
        if (!docId) return;
        returnStateByDoc.set(docId, state);
    }

    function clearReturnState(docId) {
        if (docId) returnStateByDoc.delete(docId);
    }

    function open(options = {}) {
        if (!ctx) return;
        const docId = options.docId || ctx.getActiveDocId?.();
        activeDocId = docId;
        const t = options.tab || 'properties';
        activeInfoTab =
            t === 'attachments' || t === 'signatures' || t === 'properties' ? t : 'properties';
        certViewSigId = null;
        lastFocusEl = options.returnFocusEl || document.activeElement;

        const previous = {
            previousInspectorType: ctx.getActiveTool?.() || 'select',
            previousInspectorHtml: ctx.getToolBodyHtml?.() || '',
            previousScrollPosition: ctx.getToolBodyScroll?.() || 0,
            previousBodyClasses: [...document.body.classList].filter((c) => c.startsWith('pdfEditor')),
        };
        setReturnState(docId, previous);

        document.body.classList.add('pdfEditorDocInfoOpen');
        ctx.setInspectorMode?.('docinfo');
        const panel = document.getElementById('pdfEditorDocInfoPanel');
        if (panel) panel.hidden = false;
        render();
        panel?.querySelector('.docInfoTabBtn[data-tab="' + activeInfoTab + '"]')?.focus?.();
    }

    function close(restorePrevious = true) {
        const docId = activeDocId;
        document.body.classList.remove('pdfEditorDocInfoOpen');
        certViewSigId = null;

        if (restorePrevious && docId) {
            const saved = getReturnState(docId);
            if (saved && ctx?.restoreInspectorState) {
                ctx.restoreInspectorState(saved);
            }
        }
        if (docId) clearReturnState(docId);

        ctx?.setInspectorMode?.('tool');
        activeDocId = null;
        const panel = document.getElementById('pdfEditorDocInfoPanel');
        if (panel) panel.innerHTML = '';

        if (lastFocusEl && typeof lastFocusEl.focus === 'function') {
            try {
                lastFocusEl.focus();
            } catch (_) { /* ignore */ }
        }
        lastFocusEl = null;
    }

    function render() {
        const panel = document.getElementById('pdfEditorDocInfoPanel');
        if (!panel || !ctx) return;
        const extras = ctx.getDocumentExtras?.() || { attachments: [], signatures: [] };

        if (certViewSigId) {
            renderCertificateView(panel, extras);
            return;
        }

        const nAtt = extras.attachments?.length || 0;
        const nSig = extras.signatures?.length || 0;
        const agg = global.PdfEditorSignatureStatus?.aggregateSignatureUi(extras.signatures || []);

        ctx.setDocInfoInspectorTitle?.('pdfEditorDocInfoTitle', 'Informazioni documento');

        panel.innerHTML = `
          <div class="docInfoShell">
            <div class="docInfoTabs" role="tablist">
              <button type="button" role="tab" class="docInfoTabBtn ${activeInfoTab === 'properties' ? 'is-active' : ''}" data-tab="properties" aria-selected="${activeInfoTab === 'properties'}">
                <span class="docInfoTabIcon" aria-hidden="true">${TAB_ICONS.properties}</span>
                <span class="docInfoTabLabel langText" data-i18n="pdfEditorDocPropsTab">Proprietà</span>
              </button>
              <button type="button" role="tab" class="docInfoTabBtn ${activeInfoTab === 'attachments' ? 'is-active' : ''}" data-tab="attachments" aria-selected="${activeInfoTab === 'attachments'}">
                <span class="docInfoTabIcon" aria-hidden="true">${TAB_ICONS.paperclip}</span>
                <span class="docInfoTabLabel">${msg('pdfEditorAttachmentsTitle', 'Allegati')}${nAtt ? ` ${nAtt}` : ''}</span>
              </button>
              <button type="button" role="tab" class="docInfoTabBtn ${activeInfoTab === 'signatures' ? 'is-active' : ''}" data-tab="signatures" aria-selected="${activeInfoTab === 'signatures'}" ${nSig ? '' : 'disabled'} title="${msg('pdfEditorSignaturesTitle', 'Firme digitali')}">
                <span class="docInfoTabIcon" aria-hidden="true">${TAB_ICONS.shield}</span>
                <span class="docInfoTabLabel">${msg('pdfEditorSignaturesTabShort', 'Firme')}${nSig ? ` ${nSig}` : ''}</span>
              </button>
            </div>
            <div class="docInfoContent" id="docInfoContent"></div>
            <p class="docInfoFooterHint langText" data-i18n="pdfEditorDocInfoFooter" ${activeInfoTab === 'attachments' ? '' : 'hidden'}>Gli allegati fanno parte di questo PDF.</p>
          </div>`;

        panel.querySelectorAll('.docInfoTabBtn').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                activeInfoTab = btn.dataset.tab || 'properties';
                render();
            });
        });

        const content = panel.querySelector('#docInfoContent');
        if (activeInfoTab === 'signatures') renderSignaturesTab(content, extras, agg);
        else if (activeInfoTab === 'properties') renderPropertiesTab(content);
        else renderAttachmentsTab(content, extras);
    }

    function renderPropertiesTab(contentEl) {
        if (!contentEl) return;
        contentEl.innerHTML = `<p class="docInfoEmptyHint">${msg('pdfEditorMetaLoading', 'Caricamento metadati…')}</p>`;

        Promise.resolve(ctx.getDocumentMetadata?.())
            .then((data) => {
                if (activeInfoTab !== 'properties') return;
                if (!data?.sections?.length) {
                    contentEl.innerHTML = `<p class="docInfoEmptyTitle">${msg('pdfEditorMetaEmpty', 'Nessun metadato disponibile')}</p>`;
                    return;
                }
                contentEl.innerHTML = '<div class="docInfoMetaSections"></div>';
                const wrap = contentEl.querySelector('.docInfoMetaSections');
                data.sections.forEach((section) => {
                    const block = document.createElement('section');
                    block.className = 'docInfoMetaSection';
                    const h4 = document.createElement('h4');
                    h4.className = 'docInfoMetaSectionTitle';
                    h4.textContent = msg(section.titleKey, section.titleFallback);
                    block.appendChild(h4);
                    const dl = document.createElement('dl');
                    dl.className = 'docInfoSigFields docInfoMetaFields';
                    section.fields.forEach((field) => {
                        const dt = document.createElement('dt');
                        dt.textContent = msg(field.labelKey, field.fallback);
                        const dd = document.createElement('dd');
                        const raw = field.valueKey ? msg(field.valueKey, field.value) : field.value;
                        dd.textContent = raw;
                        if (raw === '—') dd.classList.add('docInfoMetaMissing');
                        dl.append(dt, dd);
                    });
                    block.appendChild(dl);
                    wrap.appendChild(block);
                });
            })
            .catch(() => {
                if (activeInfoTab !== 'properties') return;
                contentEl.innerHTML = `<p class="docInfoEmptyTitle">${msg('pdfEditorMetaEmpty', 'Nessun metadato disponibile')}</p>`;
            });
    }

    function renderAttachmentsTab(contentEl, extras) {
        if (!contentEl) return;
        const items = extras.attachments || [];
        if (!items.length) {
            contentEl.innerHTML = `
              <p class="docInfoEmptyTitle langText" data-i18n="pdfEditorAttachmentsEmptyTitle">Nessun allegato incorporato</p>
              <p class="docInfoEmptyHint langText" data-i18n="pdfEditorAttachmentsEmptyHint">Gli allegati aggiunti al PDF compariranno qui.</p>`;
            return;
        }
        contentEl.innerHTML = `<p class="docInfoListLead">${msg('pdfEditorAttachmentsLead', '{count} allegati incorporati nel documento', { count: items.length })}</p><div class="docInfoAttachmentList"></div>`;
        const list = contentEl.querySelector('.docInfoAttachmentList');
        items.forEach((att) => {
            const row = document.createElement('div');
            row.className = 'docInfoAttachmentRow';
            row.innerHTML = `
              <div class="docInfoAttachmentMain">
                <span class="docInfoFileIcon" aria-hidden="true">${extLabel(att.filename)}</span>
                <div class="docInfoAttachmentText">
                  <div class="docInfoAttachmentName" title="${att.filename}">${att.filename}</div>
                  <div class="docInfoAttachmentMeta">${extLabel(att.filename)} · ${att.sizeLabel || ''}</div>
                </div>
              </div>
              <div class="docInfoAttachmentActions">
                <button type="button" class="docInfoActionBtn docInfoOpenBtn">${msg('pdfEditorAttachmentOpen', 'Apri')}</button>
                <button type="button" class="docInfoActionBtn docInfoSaveBtn">${msg('pdfEditorAttachmentSave', 'Salva')}</button>
              </div>`;
            row.querySelector('.docInfoOpenBtn')?.addEventListener('click', () => openAttachment(att));
            row.querySelector('.docInfoSaveBtn')?.addEventListener('click', () => saveAttachment(att));
            list.appendChild(row);
        });
    }

    function renderSignaturesTab(contentEl, extras, agg) {
        if (!contentEl) return;
        const sigs = extras.signatures || [];
        if (!sigs.length) {
            contentEl.innerHTML = `<p class="docInfoEmptyTitle">${msg('pdfEditorSignaturesEmpty', 'Nessuna firma digitale')}</p>`;
            return;
        }
        const summaryClass =
            agg?.kind === 'invalid' ? 'is-invalid' : agg?.kind === 'warning' ? 'is-warning' : 'is-unknown';
        const summaryText =
            agg?.kind === 'invalid'
                ? msg('pdfEditorSigSummaryInvalid', 'Problemi rilevati sull\'integrità del documento')
                : agg?.kind === 'warning'
                  ? msg('pdfEditorSigSummaryHeuristic', 'Firme rilevate · verifica certificato non disponibile')
                  : msg('pdfEditorSigSummaryUnknown', 'Firme rilevate · verifica non disponibile');

        contentEl.innerHTML = `<div class="docInfoSigSummary ${summaryClass}">${summaryText}</div><div class="docInfoSigList"></div>`;
        const list = contentEl.querySelector('.docInfoSigList');
        sigs.forEach((sig) => {
            const ui = global.PdfEditorSignatureStatus?.singleSignatureUi(sig);
            const block = document.createElement('details');
            block.className = 'docInfoSigBlock';
            block.open = sigs.length === 1;
            block.innerHTML = `
              <summary class="docInfoSigSummaryRow">
                <span class="docInfoSigName">${sig.name || msg('pdfEditorSigUntitled', 'Firma')}</span>
                <span class="docInfoSigState ${ui?.kind || 'unknown'}">${msg(ui?.labelKey, ui?.fallback)}</span>
              </summary>
              <div class="docInfoSigBody">
                <p class="docInfoSigWhen">${sig.signedAtLabel || msg('pdfEditorSigNoDate', 'Data non disponibile')}</p>
                <dl class="docInfoSigFields"></dl>
                <div class="docInfoSigActions">
                  <button type="button" class="docInfoActionBtn docInfoCertBtn">${msg('pdfEditorSigShowCert', 'Mostra certificato')}</button>
                </div>
              </div>`;
            const dl = block.querySelector('.docInfoSigFields');
            appendField(dl, msg('pdfEditorSigFieldIntegrity', 'Integrità documento'), integrityLabel(sig));
            appendField(dl, msg('pdfEditorSigFieldReason', 'Motivo'), sig.reason);
            appendField(dl, msg('pdfEditorSigFieldLocation', 'Luogo'), sig.location);
            appendField(dl, msg('pdfEditorSigFieldFilter', 'Filtro'), sig.filter);
            appendField(dl, msg('pdfEditorSigFieldSubFilter', 'Sottofiltro'), sig.subFilter);
            block.querySelector('.docInfoCertBtn')?.addEventListener('click', () => {
                certViewSigId = sig.id;
                render();
            });
            list.appendChild(block);
        });
    }

    function appendField(dl, label, value) {
        if (!value || !dl) return;
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        dl.append(dt, dd);
    }

    function integrityLabel(sig) {
        if (sig.intact === true) return msg('pdfEditorSigIntegrityOk', 'ByteRange coerente (analisi preliminare)');
        if (sig.intact === false) return msg('pdfEditorSigIntegrityFail', 'ByteRange non coerente');
        return msg('pdfEditorSigIntegrityUnknown', 'Non verificabile');
    }

    function renderCertificateView(panel, extras) {
        const sig = (extras.signatures || []).find((s) => s.id === certViewSigId);
        ctx.setDocInfoInspectorTitle?.('pdfEditorSigCertTitle', 'Certificato');

        panel.innerHTML = `
          <div class="docInfoShell">
            <button type="button" class="docInfoCertBackLink" id="docInfoCertBack">← ${msg('pdfEditorDocInfoBack', 'Indietro')}</button>
            <div class="docInfoCertBody">
              <p class="docInfoCertNotice langText" data-i18n="pdfEditorSigCertNotice">I dati del certificato X.509 non sono estratti da Pdeffy. Di seguito i metadati disponibili nel dizionario firma.</p>
              <dl class="docInfoSigFields" id="docInfoCertFields"></dl>
            </div>
          </div>`;
        panel.querySelector('#docInfoCertBack')?.addEventListener('click', () => {
            certViewSigId = null;
            render();
        });
        const dl = panel.querySelector('#docInfoCertFields');
        if (!sig) {
            appendField(dl, msg('pdfEditorSigCertMissing', 'Firma'), msg('pdfEditorSigCertNotFound', 'Non trovata'));
            return;
        }
        appendField(dl, msg('pdfEditorSigFieldName', 'Intestatario'), sig.name);
        appendField(dl, msg('pdfEditorSigFieldFilter', 'Emittente / filtro'), sig.filter || sig.subFilter);
        appendField(dl, msg('pdfEditorSigFieldDate', 'Data firma'), sig.signedAtLabel || sig.dateRaw);
        appendField(dl, msg('pdfEditorSigFieldContact', 'Contatto'), sig.contact);
        appendField(dl, msg('pdfEditorSigFieldReason', 'Motivo'), sig.reason);
    }

    async function saveAttachment(att) {
        if (!att?.content?.length || !ctx?.saveAttachment) return;
        await ctx.saveAttachment(att);
    }

    async function openAttachment(att) {
        if (!att?.content?.length || !ctx?.openAttachment) return;
        if (isExecutableName(att.filename)) {
            const ok = window.confirm(
                msg(
                    'pdfEditorAttachmentExecWarn',
                    'Questo file potrebbe essere eseguibile o non sicuro. Aprire comunque?'
                )
            );
            if (!ok) return;
        }
        await ctx.openAttachment(att);
    }

    function refresh() {
        if (document.body.classList.contains('pdfEditorDocInfoOpen')) render();
    }

    global.PdfEditorDocumentInfo = {
        bind,
        open,
        close,
        refresh,
        getReturnState,
        setReturnState,
    };
})(typeof window !== 'undefined' ? window : global);
