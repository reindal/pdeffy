/**
 * Anonymize inspector — sequential guided review (one entity at a time).
 */
(function (global) {
    const CAT_META = {
        NOME: { color: '#EAB308', labelKey: 'assistenteCatNames' },
        ORGANIZZAZIONE: { color: '#F97316', labelKey: 'assistenteCatOrg' },
        INDIRIZZO: { color: '#06B6D4', labelKey: 'assistenteCatAddresses' },
        EMAIL: { color: '#EC4899', labelKey: 'assistenteCatContact' },
        TELEFONO: { color: '#EC4899', labelKey: 'assistenteCatContact' },
        CODICE_FISCALE: { color: '#22C55E', labelKey: 'assistenteCatCf' },
        IBAN: { color: '#EF4444', labelKey: 'assistenteCatIban' },
        CARTA: { color: '#EF4444', labelKey: 'assistenteCatIban' },
        PARTITA_IVA: { color: '#EF4444', labelKey: 'assistenteCatIban' },
        IP: { color: '#EF4444', labelKey: 'assistenteCatIban' },
    };

    const ENTITY_LABELS = {
        NOME: 'assistenteTypeName',
        INDIRIZZO: 'assistenteTypeAddress',
        ORGANIZZAZIONE: 'assistenteTypeOrg',
        EMAIL: 'assistenteTypeEmail',
        TELEFONO: 'assistenteTypePhone',
        CODICE_FISCALE: 'assistenteTypeCf',
        PARTITA_IVA: 'assistenteTypePiva',
        IBAN: 'assistenteTypeIban',
        CARTA: 'assistenteTypeCard',
        IP: 'assistenteTypeIp',
    };

    const ALL_CATEGORIES = new Set(['NOME', 'ORGANIZZAZIONE', 'INDIRIZZO', 'CONTACT', 'CODICE_FISCALE', 'IBAN']);

    function msg(key, fallback) {
        return typeof window.getMessage === 'function' ? window.getMessage(key) : fallback;
    }

    function formatInvokeError(err) {
        if (err == null) return 'Unknown error';
        if (typeof err === 'string') return err.trim() || 'Unknown error';
        if (err instanceof Error && err.message) return err.message;
        if (typeof err.message === 'string' && err.message.trim()) return err.message;
        try {
            const json = JSON.stringify(err);
            if (json && json !== '{}') return json;
        } catch (_) { /* ignore */ }
        return String(err);
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

        function modelStoreAnonBase(text) {
            if (typeof global.__pdfEditorStoreAnonBaseText === 'function') {
                global.__pdfEditorStoreAnonBaseText(text);
            }
        }

        const CF_SHAPE =
        /^[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]$/;

    function normalizedCf(value) {
        return String(value || '')
            .replace(/[^A-Za-z0-9]/g, '')
            .toUpperCase();
    }

    function entityValuePlausible(entityType, value) {
        const v = String(value || '').trim();
        if (v.length < 2) return false;
        if (entityType === 'CODICE_FISCALE') {
            const n = normalizedCf(v);
            return n.length === 16 && CF_SHAPE.test(n);
        }
        return true;
    }

    function createAnonymizePanel(ctx) {
        const { getFilePath, getStatusSelector, getModel, getPdfPage, onEntitiesChanged, onGoToPage } = ctx;
        const STATUS = getStatusSelector?.() || '#pdfEditorStatus';

        /** @type {Array<any>} */
        let entities = [];
        let lastMapping = {};
        let lastAnonymizedText = '';
        let sourceText = '';
        let hasDetected = false;
        /** @type {'preDetect'|'overview'|'sequential'|'allDone'|'fullList'|'summary'} */
        let screen = 'preDetect';
        let currentIndex = 0;
        let listSearch = '';
        let listFilterCategory = '';
        let listFilterPage = '';
        let liveRegionTimer = null;

        function categoryAllows(entityType) {
            if (entityType === 'EMAIL' || entityType === 'TELEFONO') return ALL_CATEGORIES.has('CONTACT');
            if (entityType === 'CARTA' || entityType === 'IBAN' || entityType === 'PARTITA_IVA' || entityType === 'IP') {
                return ALL_CATEGORIES.has('IBAN');
            }
            return ALL_CATEGORIES.has(entityType);
        }

        function entityLabel(entityType) {
            const key = ENTITY_LABELS[entityType];
            return key ? msg(key, entityType) : entityType;
        }

        function visibleEntities() {
            return entities.filter((e) => categoryAllows(e.entityType));
        }

        function counts() {
            const vis = visibleEntities();
            let approved = 0;
            let ignored = 0;
            let pending = 0;
            for (const e of vis) {
                if (e.reviewStatus === 'approved') approved += 1;
                else if (e.reviewStatus === 'ignored') ignored += 1;
                else pending += 1;
            }
            return { total: vis.length, approved, ignored, pending, completed: approved + ignored };
        }

        function contextSnippet(text, start, end, value) {
            if (!text) return value || '';
            let s = typeof start === 'number' ? start : text.indexOf(value);
            if (s < 0) s = 0;
            let e = typeof end === 'number' ? end : s + (value?.length || 0);
            const from = Math.max(0, s - 40);
            const to = Math.min(text.length, e + 40);
            let snippet = text.slice(from, to).replace(/\s+/g, ' ').trim();
            if (from > 0) snippet = `…${snippet}`;
            if (to < text.length) snippet = `${snippet}…`;
            return snippet;
        }

        async function resolvePagesForEntities() {
            const model = getModel?.();
            if (!model?.pdfJsDoc) return;
            if (global.PdfEditorAnonymizeHighlights?.assignPageRanges) {
                await global.PdfEditorAnonymizeHighlights.assignPageRanges(entities, model, getPdfPage);
            }
            for (const ent of entities) {
                if (!ent.context) {
                    ent.context = contextSnippet(sourceText, ent.start, ent.end, ent.value);
                }
            }
            entities.sort((a, b) => {
                const pa = a.page ?? 99999;
                const pb = b.page ?? 99999;
                if (pa !== pb) return pa - pb;
                const ra = a.pageRange?.start ?? a.start ?? 0;
                const rb = b.pageRange?.start ?? b.start ?? 0;
                return ra - rb;
            });
        }

        function currentEntity() {
            const list = visibleEntities();
            if (!list.length) return null;
            const idx = Math.max(0, Math.min(currentIndex, list.length - 1));
            return list[idx];
        }

        function notifyHighlights() {
            const ent = currentEntity();
            const payload = {
                entities: visibleEntities(),
                selectedId: screen === 'sequential' ? ent?.id || null : null,
                guidedReview: screen === 'sequential',
                showAllDetected: screen === 'overview' || screen === 'fullList' || screen === 'summary',
            };
            global.__pdfEditorAnonHighlightPayload = payload;
            if (global.PdfEditorAnonymizeHighlights?.setReviewState) {
                global.PdfEditorAnonymizeHighlights.setReviewState(payload);
            }
            onEntitiesChanged?.(payload.entities);
        }

        function announceEntity(ent) {
            const live = document.getElementById('anonLiveRegion');
            if (!live || !ent) return;
            live.textContent = `${entityLabel(ent.entityType)}: ${ent.value}`;
        }

        async function focusCurrentEntity() {
            const ent = currentEntity();
            if (!ent) return;
            announceEntity(ent);
            notifyHighlights();
            if (ent.pageId && onGoToPage) {
                const model = getModel?.();
                const active = global.PdfEditorDocumentModel.getActivePages(model);
                const idx = active.findIndex((p) => p.id === ent.pageId);
                await onGoToPage(ent.pageId, Math.max(0, idx));
            }
            global.PdfEditorAnonymizeHighlights?.pulseSelection?.(ent.id);
        }

        function goToIndex(idx) {
            const list = visibleEntities();
            if (!list.length) return;
            currentIndex = Math.max(0, Math.min(idx, list.length - 1));
            focusCurrentEntity();
            render();
        }

        function navRelative(delta) {
            goToIndex(currentIndex + delta);
        }

        function advanceAfterReview() {
            const list = visibleEntities();
            for (let i = currentIndex + 1; i < list.length; i++) {
                if (list[i].reviewStatus === 'pending') {
                    goToIndex(i);
                    return;
                }
            }
            for (let i = 0; i < currentIndex; i++) {
                if (list[i].reviewStatus === 'pending') {
                    goToIndex(i);
                    return;
                }
            }
            const c = counts();
            if (c.pending === 0 && c.total > 0) {
                screen = 'overview';
            }
            render();
            notifyHighlights();
        }

        function approveAllPending() {
            let n = 0;
            for (const e of visibleEntities()) {
                if (e.reviewStatus === 'pending') {
                    e.reviewStatus = 'approved';
                    n += 1;
                }
            }
            if (n > 0) rebuildLivePreview();
            return n;
        }

        function showApprovedBoxesOnPdf() {
            if (typeof global.__pdfEditorSetViewerContentMode === 'function') {
                global.__pdfEditorSetViewerContentMode('preview');
            }
            notifyHighlights();
            if (typeof global.__pdfEditorRefreshAiHighlights === 'function') {
                global.__pdfEditorRefreshAiHighlights();
            }
        }

        function showDetectionHighlightsOnPdf() {
            if (typeof global.__pdfEditorSetViewerContentMode === 'function') {
                global.__pdfEditorSetViewerContentMode('pdf');
            }
            notifyHighlights();
            if (typeof global.__pdfEditorRefreshAiHighlights === 'function') {
                global.__pdfEditorRefreshAiHighlights();
            }
        }

        function goToSummaryAfterBulkApprove() {
            const n = approveAllPending();
            screen = 'summary';
            render();
            if (n > 0) {
                StatusManager.show(STATUS, 'success', 'anonApproveAllDone', { n: String(n) });
            }
        }

        function rebuildLivePreview() {
            const approved = visibleEntities().filter(
                (e) => e.reviewStatus === 'approved' && categoryAllows(e.entityType)
            );
            let text = sourceText || lastAnonymizedText;
            if (sourceText && approved.some((e) => typeof e.start === 'number' && typeof e.end === 'number')) {
                const ordered = approved
                    .filter((e) => typeof e.start === 'number' && typeof e.end === 'number')
                    .sort((a, b) => b.start - a.start);
                for (const e of ordered) {
                    text = text.slice(0, e.start) + (e.placeholder || '') + text.slice(e.end);
                }
            } else {
                const notApplied = new Set(
                    entities
                        .filter((e) => e.reviewStatus !== 'approved' || !categoryAllows(e.entityType))
                        .map((e) => e.placeholder)
                );
                text = lastAnonymizedText;
                for (const [ph, original] of Object.entries(lastMapping)) {
                    if (notApplied.has(ph)) text = text.split(ph).join(original);
                }
            }
            if (typeof global.__pdfEditorSetAnonPreviewText === 'function') {
                global.__pdfEditorSetAnonPreviewText(text);
            }
            return text;
        }

        function setReview(id, status) {
            const ent = entities.find((e) => e.id === id);
            if (!ent) return;
            ent.reviewStatus = status;
            rebuildLivePreview();
            if (typeof global.__pdfEditorRefreshAiHighlights === 'function') {
                global.__pdfEditorRefreshAiHighlights();
            }
            if (screen === 'sequential') advanceAfterReview();
            else render();
            notifyHighlights();
        }

        function panelHtml() {
            return `
            <div class="aiPanel anonPanel anonPanelSeq" data-ai-panel="anonymize" data-ai="anonymize" hidden>
              <div class="anonMain" id="anonMainContent" aria-live="polite">
                <span id="anonLiveRegion" class="sr-only" aria-live="polite"></span>
              </div>
              <footer class="anonReviewFooter" id="anonReviewFooter"></footer>
            </div>`;
        }

        function renderOverview(main) {
            const c = counts();
            main.innerHTML = `
              <div class="anonOverview">
                <p class="anonSeqSubtitle">${msg('anonOverviewTitle', 'Dati sensibili rilevati')}</p>
                <p class="anonOverviewCount"><strong>${c.total}</strong> ${msg('anonOverviewDetected', 'elementi da gestire')}</p>
                <button type="button" class="pdeffy-btn pdeffy-btn-primary aiFullBtn" id="anonOverviewApproveAll">${msg('anonApproveAll', 'Anonimizza tutti')}</button>
                <button type="button" class="pdeffy-btn pdeffy-btn-ghost aiFullBtn" id="anonOverviewPick">${msg('anonOverviewPick', 'Scegli dall\'elenco')}</button>
              </div>`;
            document.getElementById('anonOverviewApproveAll')?.addEventListener('click', () => {
                goToSummaryAfterBulkApprove();
            });
            document.getElementById('anonOverviewPick')?.addEventListener('click', () => {
                screen = 'fullList';
                render();
                showDetectionHighlightsOnPdf();
            });
        }

        function renderPreDetect(main) {
            main.innerHTML = `
              <div class="anonPreDetect">
                <p class="anonPreDetectLead">${msg('anonPreDetectLead', 'Analizza il documento per trovare dati sensibili da revisionare.')}</p>
                <div id="anonDetectProgress" class="anonDetectProgress" hidden>
                  <div class="anonProgressBarTrack"><div class="anonProgressBarFill"></div></div>
                  <p id="anonProgressLabel" class="anonProgressLabel">${msg('anonProgressIndeterminate', 'Analisi del documento…')}</p>
                </div>
                <button type="button" id="assistenteDetectBtn" class="pdeffy-btn pdeffy-btn-primary anonDetectBtn">${msg('anonDetectBtn', 'Rileva dati sensibili')}</button>
                <div id="pdfEditorAiAnonNotice" class="aiNotice" hidden></div>
              </div>`;
        }

        function renderSequential(main) {
            const c = counts();
            const ent = currentEntity();
            const pos = c.total ? currentIndex + 1 : 0;
            const progressPct = c.total ? Math.round((c.completed / c.total) * 100) : 0;
            const color = CAT_META[ent?.entityType]?.color || '#EAB308';

            main.innerHTML = `
              <div class="anonSeqReview">
                <p class="anonSeqSubtitle">${msg('anonReviewSubtitle', 'Revisiona i dati rilevati')}</p>
                <p class="anonSeqProgressText">${c.completed} ${msg('anonOfCompleted', 'di')} ${c.total} ${msg('anonCompletedLabel', 'completati')}</p>
                <div class="anonProgressBarTrack" role="progressbar" aria-valuenow="${progressPct}" aria-valuemin="0" aria-valuemax="100">
                  <div class="anonProgressBarFill" style="width:${progressPct}%; animation:none"></div>
                </div>
                <div class="anonSeqNav">
                  <button type="button" class="anonNavBtn" id="anonNavPrev" aria-label="${msg('anonNavPrev', 'Precedente')}">←</button>
                  <span class="anonSeqNavPos">${pos} ${msg('anonOfCompleted', 'di')} ${c.total}</span>
                  <button type="button" class="anonNavBtn" id="anonNavNext" aria-label="${msg('anonNavNext', 'Successivo')}">→</button>
                </div>
                ${
                    ent
                        ? `
                <div class="anonCurrentEntity">
                  <div class="anonCurrentCat"><span class="anonCatDot" style="--anon-cat:${color}"></span> ${escapeHtml(entityLabel(ent.entityType))}</div>
                  <div class="anonCurrentValue" title="${escapeHtml(ent.value)}">${escapeHtml(ent.value)}</div>
                  <div class="anonCurrentPage">${ent.page ? `${msg('anonPageLabel', 'Pagina')} ${ent.page}` : msg('anonPageUnknown', 'Pagina —')}</div>
                  <blockquote class="anonCurrentContext">"${escapeHtml(ent.context || ent.value)}"</blockquote>
                  <div class="anonCurrentActions">
                    <button type="button" class="pdeffy-btn pdeffy-btn-ghost anonBtnIgnore" id="anonBtnIgnore">${msg('assistenteIgnore', 'Ignora')}</button>
                    <button type="button" class="pdeffy-btn pdeffy-btn-primary anonBtnAnonymize" id="anonBtnAnonymize">${msg('anonBtnAnonymize', 'Anonimizza')}</button>
                  </div>
                </div>`
                        : `<p class="anonEmptyState">${msg('anonEmptyNone', 'Nessun dato sensibile rilevato.')}</p>`
                }
                <button type="button" class="anonOpenFullList" id="anonOpenFullList">
                  <span class="anonOpenFullListIcon" aria-hidden="true"></span>
                  <span class="langText" data-i18n="anonOpenFullList">${msg('anonOpenFullList', 'Apri elenco completo')}</span>
                </button>
              </div>`;

            document.getElementById('anonNavPrev')?.addEventListener('click', () => navRelative(-1));
            document.getElementById('anonNavNext')?.addEventListener('click', () => navRelative(1));
            document.getElementById('anonBtnIgnore')?.addEventListener('click', () => ent && setReview(ent.id, 'ignored'));
            document.getElementById('anonBtnAnonymize')?.addEventListener('click', () => ent && setReview(ent.id, 'approved'));
            document.getElementById('anonOpenFullList')?.addEventListener('click', () => {
                screen = 'fullList';
                render();
            });
        }

        function renderAllDone(main) {
            const c = counts();
            main.innerHTML = `
              <div class="anonAllDone">
                <h4 class="anonAllDoneTitle">${msg('anonReviewCompleteTitle', 'Revisione completata')}</h4>
                <p>${c.total} ${msg('anonReviewCompleteCount', 'elementi revisionati')}</p>
                <button type="button" class="pdeffy-btn pdeffy-btn-primary" id="anonGoSummary">${msg('anonGoSummary', 'Vai al riepilogo')}</button>
                <button type="button" class="pdeffy-btn pdeffy-btn-ghost" id="anonBackSeq">${msg('anonBackSequential', 'Continua revisione')}</button>
              </div>`;
            document.getElementById('anonGoSummary')?.addEventListener('click', () => {
                screen = 'summary';
                render();
            });
            document.getElementById('anonBackSeq')?.addEventListener('click', () => {
                screen = 'overview';
                render();
            });
        }

        function renderFullList(main) {
            const c = counts();
            let list = visibleEntities();
            const q = listSearch.trim().toLowerCase();
            if (q) {
                list = list.filter(
                    (e) =>
                        (e.value || '').toLowerCase().includes(q) ||
                        entityLabel(e.entityType).toLowerCase().includes(q) ||
                        (e.context || '').toLowerCase().includes(q)
                );
            }
            if (listFilterCategory) {
                if (listFilterCategory === 'CONTACT') {
                    list = list.filter((e) => e.entityType === 'EMAIL' || e.entityType === 'TELEFONO');
                } else if (listFilterCategory === 'IBAN') {
                    list = list.filter((e) => ['IBAN', 'CARTA', 'PARTITA_IVA', 'IP'].includes(e.entityType));
                } else {
                    list = list.filter((e) => e.entityType === listFilterCategory);
                }
            }
            if (listFilterPage) {
                const p = parseInt(listFilterPage, 10);
                if (!Number.isNaN(p)) list = list.filter((e) => e.page === p);
            }

            const rows = list
                .map((ent) => {
                    const color = CAT_META[ent.entityType]?.color || '#52617A';
                    const st =
                        ent.reviewStatus === 'approved'
                            ? msg('anonStatusApproved', 'Approvato')
                            : ent.reviewStatus === 'ignored'
                              ? msg('anonStatusIgnored', 'Ignorato')
                              : msg('anonStatusPending', 'Da revisionare');
                    return `
                    <div class="anonListRow" data-anon-id="${escapeHtml(ent.id)}">
                      <span class="anonCatDot" style="--anon-cat:${color}"></span>
                      <div class="anonListRowMain">
                        <div class="anonListRowValue" title="${escapeHtml(ent.value)}">${escapeHtml(ent.value)}</div>
                        <div class="anonListRowMeta">${escapeHtml(entityLabel(ent.entityType))}${ent.page ? ` · P${ent.page}` : ''} · ${st}</div>
                      </div>
                      <button type="button" class="anonIconBtn anonIconApprove" data-act="approve" aria-label="${msg('assistenteApprove', 'Approva')}">✓</button>
                      <button type="button" class="anonIconBtn anonIconIgnore" data-act="ignore" aria-label="${msg('assistenteIgnore', 'Ignora')}">×</button>
                    </div>`;
                })
                .join('');

            main.innerHTML = `
              <div class="anonFullList">
                <button type="button" class="anonBackGuided" id="anonBackGuided">← ${msg('anonBackOverview', 'Torna indietro')}</button>
                <input type="search" class="anonSearchInput" id="anonListSearch" placeholder="${msg('anonSearchPlaceholder', 'Cerca…')}" value="${escapeHtml(listSearch)}">
                <div class="anonFilterRow">
                  <select id="anonListFilterCat" class="anonFilterSelect">
                    <option value="">${msg('anonFilterCategoryAll', 'Categoria')}</option>
                    <option value="NOME">${msg('assistenteCatNames', 'Nomi')}</option>
                    <option value="ORGANIZZAZIONE">${msg('assistenteCatOrg', 'Aziende')}</option>
                    <option value="INDIRIZZO">${msg('assistenteCatAddresses', 'Indirizzi')}</option>
                    <option value="CONTACT">${msg('assistenteCatContact', 'Contatti')}</option>
                    <option value="CODICE_FISCALE">${msg('assistenteCatCf', 'CF')}</option>
                    <option value="IBAN">${msg('assistenteCatIban', 'IBAN')}</option>
                  </select>
                  <select id="anonListFilterPage" class="anonFilterSelect">
                    <option value="">${msg('anonFilterPageAll', 'Pagina')}</option>
                    ${[...new Set(visibleEntities().map((e) => e.page).filter(Boolean))]
                        .sort((a, b) => a - b)
                        .map((p) => `<option value="${p}"${String(p) === listFilterPage ? ' selected' : ''}>P${p}</option>`)
                        .join('')}
                  </select>
                </div>
                <div class="anonListRows">${rows || `<p class="anonEmptyState">${msg('anonEmptyTab', 'Nessun risultato')}</p>`}</div>
              </div>`;

            document.getElementById('anonBackGuided')?.addEventListener('click', () => {
                screen = 'overview';
                render();
                showDetectionHighlightsOnPdf();
            });
            document.getElementById('anonListSearch')?.addEventListener('input', (ev) => {
                listSearch = ev.target.value;
                render();
            });
            document.getElementById('anonListFilterCat')?.addEventListener('change', (ev) => {
                listFilterCategory = ev.target.value;
                render();
            });
            document.getElementById('anonListFilterPage')?.addEventListener('change', (ev) => {
                listFilterPage = ev.target.value;
                render();
            });
            main.querySelectorAll('.anonListRow').forEach((row) => {
                const id = row.dataset.anonId;
                row.addEventListener('click', (ev) => {
                    if (ev.target.closest('button')) return;
                    const listAll = visibleEntities();
                    const idx = listAll.findIndex((e) => e.id === id);
                    if (idx >= 0) {
                        currentIndex = idx;
                        screen = 'sequential';
                        render();
                        focusCurrentEntity();
                    }
                });
                row.querySelector('[data-act="approve"]')?.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    setReview(id, 'approved');
                });
                row.querySelector('[data-act="ignore"]')?.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    setReview(id, 'ignored');
                });
            });
        }

        function renderSummary(main) {
            const c = counts();
            main.innerHTML = `
              <div class="anonSummaryScreen">
                <h4>${msg('anonSummaryTitle', 'Pronto per l\'anonimizzazione')}</h4>
                <ul class="anonSummaryStats">
                  <li><strong>${c.approved}</strong> ${msg('anonSummaryApprovedLine', 'elementi approvati')}</li>
                  <li><strong>${c.ignored}</strong> ${msg('anonSummaryIgnoredLine', 'elementi ignorati')}</li>
                  <li><strong>${c.pending}</strong> ${msg('anonSummaryPendingLine', 'elementi non revisionati')}</li>
                </ul>
                <p class="anonSummaryNote">${msg('anonSummaryNote', 'Verranno applicati soltanto gli elementi approvati.')}</p>
                ${c.pending > 0 ? `<p class="anonSummaryWarn">${msg('anonSummaryWarn', 'Alcuni elementi non sono stati revisionati.')}</p>` : ''}
                <button type="button" class="pdeffy-btn pdeffy-btn-primary aiFullBtn" id="anonCreatePdf">${msg('anonCreatePdf', 'Crea PDF anonimizzato')}</button>
                <button type="button" class="pdeffy-btn pdeffy-btn-ghost aiFullBtn" id="anonCopyAnonText">${msg('anonCopyText', 'Copia testo anonimizzato')}</button>
                <button type="button" class="pdeffy-btn pdeffy-btn-ghost aiFullBtn" id="anonBackFromSummary">${msg('anonBackOverview', 'Torna indietro')}</button>
                <p class="anonSummaryExportHint">${msg('anonExportPdfHint', 'Il PDF mantiene il layout; le aree approvate vengono oscurate.')}</p>
              </div>`;
            document.getElementById('anonCopyAnonText')?.addEventListener('click', async () => {
                const text = rebuildLivePreview();
                try {
                    await navigator.clipboard.writeText(text);
                    StatusManager.show(STATUS, 'success', 'summarizeCopied');
                } catch (_) {
                    StatusManager.show(STATUS, 'error', 'copyFailed');
                }
            });
            document.getElementById('anonBackFromSummary')?.addEventListener('click', () => {
                screen = 'overview';
                render();
                showDetectionHighlightsOnPdf();
            });
            document.getElementById('anonCreatePdf')?.addEventListener('click', () => doApply());
        }

        function renderFooter() {
            const foot = document.getElementById('anonReviewFooter');
            if (!foot) return;
            if (!hasDetected || screen !== 'sequential') {
                foot.innerHTML = '';
                foot.hidden = true;
                return;
            }
            foot.hidden = false;
            const c = counts();
            foot.innerHTML = `
              <button type="button" class="pdeffy-btn pdeffy-btn-ghost aiFullBtn" id="anonFinishReview">${msg('anonFinishReview', 'Termina revisione')}</button>
              <p class="anonFooterStatus">${c.approved} ${msg('anonFooterApproved', 'approvati')} · ${c.pending} ${msg('anonFooterPending', 'da controllare')}</p>`;
            document.getElementById('anonFinishReview')?.addEventListener('click', () => {
                screen = 'summary';
                render();
            });
        }

        function render() {
            document.body.classList.toggle('pdfEditorAnonSeqMode', screen === 'sequential');
            const main = document.getElementById('anonMainContent');
            if (!main) return;

            if (!hasDetected) {
                screen = 'preDetect';
                renderPreDetect(main);
            } else if (screen === 'fullList') renderFullList(main);
            else if (screen === 'summary') renderSummary(main);
            else if (screen === 'allDone') renderAllDone(main);
            else if (screen === 'sequential') renderSequential(main);
            else {
                screen = 'overview';
                renderOverview(main);
            }
            renderFooter();
            notifyHighlights();
            if (typeof global.__pdfEditorSetAnonLegendVisible === 'function') {
                global.__pdfEditorSetAnonLegendVisible(false);
            }
            if (typeof global.__pdfEditorSetAnonViewBarVisible === 'function') {
                global.__pdfEditorSetAnonViewBarVisible(hasDetected);
            }
            if (screen === 'overview' || screen === 'fullList') {
                showDetectionHighlightsOnPdf();
            } else if (screen === 'summary') {
                showApprovedBoxesOnPdf();
            }
        }

        async function doApply() {
            const text = rebuildLivePreview();
            const approved = entities.filter((e) => e.reviewStatus === 'approved').length;
            if (!approved) {
                StatusManager.show(STATUS, 'error', 'anonNeedApprove');
                return;
            }
            const approvedList = visibleEntities().filter((e) => e.reviewStatus === 'approved');
            if (typeof global.__pdfEditorExportAnonymizedPdf === 'function') {
                await global.__pdfEditorExportAnonymizedPdf({ text, entities: approvedList });
            } else if (typeof global.__pdfEditorFinalizeAnonymization === 'function') {
                await global.__pdfEditorFinalizeAnonymization(text);
            } else {
                if (typeof global.__pdfEditorSetAnonPreviewText === 'function') {
                    global.__pdfEditorSetAnonPreviewText(text);
                }
                if (typeof global.__pdfEditorSetViewerContentMode === 'function') {
                    global.__pdfEditorSetViewerContentMode('preview');
                }
                StatusManager.show(STATUS, 'success', 'assistenteApplyDone');
            }
        }

        async function runDetect() {
            const pdfPath = getFilePath?.();
            if (!pdfPath) {
                StatusManager.show(STATUS, 'error', 'pleaseSelectFile');
                return;
            }
            const prog = document.getElementById('anonDetectProgress');
            if (prog) prog.hidden = false;
            StatusManager.show(STATUS, 'processing', 'assistenteDetecting');
            try {
                const { ipcRenderer } = require('electron');
                const result = await ipcRenderer.invoke('anonymize-pdf', { path: pdfPath });
                lastAnonymizedText = result?.anonymizedText || result?.anonymized_text || '';
                lastMapping = result?.mapping || {};
                let reconstructed = lastAnonymizedText;
                for (const [ph, original] of Object.entries(lastMapping)) {
                    reconstructed = reconstructed.split(ph).join(original);
                }
                sourceText = reconstructed;
                if (typeof global.__pdfEditorSetExtractedText === 'function') {
                    global.__pdfEditorSetExtractedText(reconstructed);
                }
                const found = result?.entitiesFound || result?.entities_found || [];
                entities = [];
                for (let i = 0; i < found.length; i++) {
                    const e = found[i];
                    const placeholder = e.placeholder;
                    const value = e.value || lastMapping[placeholder] || '';
                    const entityType = e.entityType || e.entity_type || 'UNKNOWN';
                    if (!value || !entityValuePlausible(entityType, value)) continue;
                    entities.push({
                        id: `${placeholder}_${i}`,
                        entityType,
                        placeholder,
                        value,
                        start: e.start,
                        end: e.end,
                        reviewStatus: 'pending',
                        page: null,
                        pageId: null,
                        context: contextSnippet(reconstructed, e.start, e.end, value),
                    });
                }
                hasDetected = true;
                screen = 'overview';
                currentIndex = 0;
                await resolvePagesForEntities();
                if (typeof global.__pdfEditorSetAnonPreviewText === 'function') {
                    global.__pdfEditorSetAnonPreviewText(reconstructed);
                }
                modelStoreAnonBase(lastAnonymizedText);
                if (typeof global.__pdfEditorSetAnonDualView === 'function') {
                    global.__pdfEditorSetAnonDualView(true);
                }
                render();
                showDetectionHighlightsOnPdf();
                const n = counts().total;
                StatusManager.show(STATUS, 'success', n ? 'assistenteDetectDone' : 'assistenteDetectEmpty');
            } catch (err) {
                StatusManager.show(STATUS, 'error', formatInvokeError(err));
            } finally {
                if (prog) prog.hidden = true;
            }
        }

        function wireKeyboard() {
            document.addEventListener('keydown', (ev) => {
                const panel = document.querySelector('.anonPanelSeq');
                if (!panel || panel.closest('.pdfEditorToolBody')?.offsetParent === null) return;
                if (screen !== 'sequential' && screen !== 'allDone') return;
                const tag = ev.target?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                if (ev.key === 'ArrowRight') {
                    ev.preventDefault();
                    navRelative(1);
                } else if (ev.key === 'ArrowLeft') {
                    ev.preventDefault();
                    navRelative(-1);
                } else if (ev.key === 'a' || ev.key === 'A') {
                    const ent = currentEntity();
                    if (ent) setReview(ent.id, 'approved');
                } else if (ev.key === 'i' || ev.key === 'I') {
                    const ent = currentEntity();
                    if (ent) setReview(ent.id, 'ignored');
                }
            });
        }

        function mount() {
            const panel = document.querySelector('.anonPanelSeq');
            if (panel?.dataset.anonWired === '1') {
                render();
                if (hasDetected) focusCurrentEntity();
                return;
            }
            if (panel) {
                panel.dataset.anonWired = '1';
                panel.addEventListener('click', (ev) => {
                    if (ev.target.closest('#assistenteDetectBtn')) runDetect();
                });
            }
            wireKeyboard();
            render();
        }

        function onDocumentLoaded() {
            entities = [];
            lastMapping = {};
            lastAnonymizedText = '';
            sourceText = '';
            hasDetected = false;
            screen = 'preDetect';
            currentIndex = 0;
            if (global.PdfEditorAnonymizeHighlights) {
                global.PdfEditorAnonymizeHighlights.setEntities([]);
                global.PdfEditorAnonymizeHighlights.clear();
            }
            if (typeof global.__pdfEditorSetAnonDualView === 'function') {
                global.__pdfEditorSetAnonDualView(false);
            }
            document.body.classList.remove('pdfEditorAnonSeqMode');
            render();
        }

        return { panelHtml, mount, onDocumentLoaded, getEntities: () => entities.slice() };
    }

    global.PdfEditorAnonymizePanel = { createAnonymizePanel, CAT_META };
})(typeof window !== 'undefined' ? window : global);
