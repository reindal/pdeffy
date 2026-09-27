/**
 * Tool tabs: pages, watermark, redact, signature.
 */
(function (global) {
    function createToolController(ctx) {
        const {
            model,
            toolBodyEl,
            viewerApi,
            getSelectedPageId,
            onModelChange,
            getPdfPage,
            onGoToPage,
            onExportStateChange,
            getFilePath,
        } = ctx;

        let activeTool = 'select';
        const aiPanels = global.PdfEditorAiPanels.createAiPanels({
            getFilePath: getFilePath || (() => model.filePath || null),
            getStatusSelector: () => '#pdfEditorStatus',
            getModel: () => model,
            getPdfPage,
            getViewerApi: () => viewerApi,
            onEntitiesChanged: () => {
                if (typeof global.__pdfEditorRefreshAiHighlights === 'function') {
                    global.__pdfEditorRefreshAiHighlights();
                }
            },
            onGoToPage,
        });
        const sigDrawCanvas = document.createElement('canvas');
        sigDrawCanvas.width = 280;
        sigDrawCanvas.height = 90;
        let sigDrawing = false;
        let sigCtx = sigDrawCanvas.getContext('2d');
        let sigImageBytes = null;

        function msg(key, fallback) {
            return typeof window.getMessage === 'function' ? window.getMessage(key) : fallback;
        }

        function renderWatermarkList() {
            const list = document.getElementById('pdfEditorWmList');
            if (!list) return;
            list.innerHTML = '';
            model.watermarks.forEach((layer, i) => {
                const row = document.createElement('div');
                row.className = 'pdfEditorListItem';
                const label =
                    layer.type === 'image'
                        ? `${msg('image', 'Image')} #${i + 1}`
                        : (layer.text || '').slice(0, 40);
                row.innerHTML = `<span>${label}</span><button type="button" class="pdfEditorListRemove" data-id="${layer.id}">×</button>`;
                row.querySelector('button').addEventListener('click', () => {
                    if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                    PdfEditorDocumentModel.removeWatermark(model, layer.id);
                    if (!model.watermarks.length) clearWatermarkImagePreview();
                    notifyOverlayAnnotationChange();
                    renderWatermarkList();
                    refreshWatermarkPreview();
                });
                list.appendChild(row);
            });
        }

        function renderRedactList() {
            const list = document.getElementById('pdfEditorRedactList');
            if (!list) return;
            list.innerHTML = '';
            if (!model.redactions.length) {
                list.innerHTML = `<p class="pdfEditorHint langText" id="noRedactionsYet">${msg('noRedactionsYet', 'No redactions yet.')}</p>`;
                return;
            }
            model.redactions.forEach((r, i) => {
                const row = document.createElement('div');
                row.className = 'pdfEditorListItem';
                row.innerHTML = `<span>${msg('redactionBlock', 'Block')} ${i + 1}</span><button type="button" class="pdfEditorListRemove" data-id="${r.id}">×</button>`;
                row.querySelector('button').addEventListener('click', () => {
                    if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                    PdfEditorDocumentModel.removeRedaction(model, r.id);
                    notifyOverlayAnnotationChange();
                    renderRedactList();
                });
                list.appendChild(row);
            });
        }

        function renderSigList() {
            const list = document.getElementById('pdfEditorSigList');
            if (!list) return;
            list.innerHTML = '';
            model.signatures.forEach((s, i) => {
                const row = document.createElement('div');
                row.className = 'pdfEditorListItem';
                const label =
                    s.type === 'text' ? s.text : s.type === 'drawing' ? `Drawing ${i + 1}` : `Image ${i + 1}`;
                row.innerHTML = `<span>${label}</span><button type="button" class="pdfEditorListRemove" data-id="${s.id}">×</button>`;
                row.querySelector('button').addEventListener('click', () => {
                    if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                    PdfEditorDocumentModel.removeSignature(model, s.id);
                    notifyOverlayAnnotationChange();
                    renderSigList();
                });
                list.appendChild(row);
            });
        }

        const TOOL_TITLES = {
            select: 'pdfEditorToolSelect',
            signature: 'pdfEditorToolSignature',
            watermark: 'pdfEditorToolWatermark',
            redact: 'pdfEditorToolRedact',
            comment: 'pdfEditorToolComment',
            draw: 'pdfEditorToolDraw',
            bookmarks: 'pdfEditorToolBookmarks',
            form: 'pdfEditorToolForm',
            text: 'pdfEditorToolForm',
            summary: 'assistenteTabSummary',
            anonymize: 'assistenteTabAnonymize',
            questions: 'pdfEditorToolQuestions',
        };

        const TOOL_TITLE_FALLBACKS = {
            select: 'Select',
            signature: 'Signature',
            watermark: 'Watermark',
            redact: 'Redact',
            comment: 'Comments',
            draw: 'Draw',
            bookmarks: 'Bookmarks',
            form: 'Forms',
            text: 'Forms',
            summary: 'Summary',
            anonymize: 'Anonymize',
            questions: 'Questions',
        };

        function updateInspectorTitle(tool) {
            const titleEl = document.getElementById('pdfEditorInspectorTitle');
            const headerEl = document.querySelector('.pdfEditorInspectorHeader');
            if (!titleEl) return;
            document.body.classList.remove('pdfEditorAnonInspector');
            if (headerEl) headerEl.hidden = false;
            if (aiPanels.isAiTool(tool)) {
                const key = 'assistenteInspectorTitle';
                titleEl.textContent = msg(key, 'Assistente AI');
                titleEl.classList.add('langText');
                titleEl.setAttribute('data-i18n', key);
                return;
            }
            const key = TOOL_TITLES[tool];
            const fallback = TOOL_TITLE_FALLBACKS[tool] || tool;
            titleEl.textContent = key ? msg(key, fallback) : fallback;
            titleEl.classList.add('langText');
            if (key) titleEl.setAttribute('data-i18n', key);
            else titleEl.removeAttribute('data-i18n');
        }

        function syncAiSubTabs(tool) {
            const sub = document.getElementById('pdfEditorAiSubTabs');
            if (!sub) return;
            const isAi = aiPanels.isAiTool(tool);
            sub.hidden = !isAi;
            if (!isAi) return;
            sub.querySelectorAll('.pdfEditorAiSubTab').forEach((btn) => {
                const active = btn.dataset.tool === tool;
                btn.classList.toggle('active', active);
                btn.dataset.active = active ? 'true' : 'false';
                btn.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            const qTab = document.getElementById('pdfEditorAiTabQuestions');
            if (qTab) {
                qTab.title = msg('pdfEditorQuestionsTabSoon', 'Disponibile prossimamente');
            }
        }

        function switchTool(tool) {
            // Persist live watermark preview before leaving the watermark panel.
            if (activeTool === 'watermark' && tool !== 'watermark') {
                if (commitWatermarkDraft()) {
                    notifyOverlayAnnotationChange();
                }
            }

            if (tool === 'ai') tool = aiPanels.resolveEntryTool();
            if (tool === 'text') tool = 'form';

            activeTool = tool;
            syncTabButtons(tool);
            syncAiSubTabs(tool);
            updateInspectorTitle(tool);
            setModeUi(aiPanels.isAiTool(tool) ? 'ai' : 'edit');
            syncUrl(tool);

            const mode =
                tool === 'redact'
                    ? 'redact'
                    : tool === 'signature'
                      ? 'signature'
                      : tool === 'draw'
                        ? 'draw'
                        : tool === 'comment'
                          ? 'comment'
                          : tool === 'form'
                            ? 'form'
                            : 'none';
            PdfEditorOverlayManager.setMode(mode);
            document.body.classList.toggle(
                'pdfEditorToolCapture',
                mode === 'draw' ||
                    mode === 'comment' ||
                    mode === 'redact' ||
                    mode === 'signature' ||
                    mode === 'form'
            );
            if (tool !== 'watermark') {
                PdfEditorOverlayManager.setWatermarkDraft(null);
            }

            if (aiPanels.isAiTool(tool)) {
                aiPanels.activate(toolBodyEl, tool);
                if (typeof window.applyLanguage === 'function') window.applyLanguage();
            } else {
                aiPanels.onLeaveAiTools?.();
                toolBodyEl.innerHTML = panels[tool] ? panels[tool]() : '';
                if (typeof window.applyLanguage === 'function') window.applyLanguage();
                if (tool === 'watermark') wireWatermark();
                if (tool === 'redact') wireRedact();
                if (tool === 'signature') wireSignature();
                if (tool === 'comment') wireComments();
                if (tool === 'draw') wireDraw();
                if (tool === 'bookmarks') wireBookmarks();
                if (tool === 'form') wireFormFields();
            }

            // Re-bind capture layers after tool switch (fresh overlays / comment delegation).
            PdfEditorOverlayManager.bindAllRedactLayers(model, viewerApi, () => {
                notifyOverlayAnnotationChange();
            });
            PdfEditorOverlayManager.syncOverlays(model, viewerApi);
            if (typeof onExportStateChange === 'function') onExportStateChange();
        }

        /** Update overlays/lists without rebuilding the viewer (preserves scroll). */
        function notifyOverlayAnnotationChange() {
            if (typeof global.__pdfEditorMarkDirty === 'function') {
                global.__pdfEditorMarkDirty();
            } else if (typeof onExportStateChange === 'function') {
                onExportStateChange();
            }
            PdfEditorOverlayManager.syncOverlays(model, viewerApi);
            if (typeof onExportStateChange === 'function') onExportStateChange();
            if (activeTool === 'draw') wireDrawListOnly();
            if (activeTool === 'comment') renderCommentList();
            if (activeTool === 'redact') renderRedactList();
            if (activeTool === 'signature') renderSigList();
            if (activeTool === 'form') {
                renderFormFieldList();
                renderManualFormList();
                syncManualFormStylePanel();
            }
            if (activeTool === 'watermark') {
                renderWatermarkList();
                refreshWatermarkPreview();
            }
            const sel = PdfEditorOverlayManager.getSelectedAnnotation?.();
            if (sel) {
                requestAnimationFrame(() => highlightAnnotationInList(sel.type, sel.id));
            }
        }

        function highlightAnnotationInList(type, id) {
            document.querySelectorAll('.pdfEditorListItem.is-selected').forEach((el) => {
                el.classList.remove('is-selected');
            });
            const listId = {
                signature: 'pdfEditorSigList',
                redact: 'pdfEditorRedactList',
                watermark: 'pdfEditorWmList',
                ink: 'pdfEditorInkList',
                comment: 'pdfEditorCommentList',
                manualForm: 'pdfEditorFormManualList',
            }[type];
            if (!listId || !id) return;
            const list = document.getElementById(listId);
            const removeBtn = list?.querySelector(`.pdfEditorListRemove[data-id="${id}"]`);
            const row = removeBtn?.closest('.pdfEditorListItem');
            if (row) {
                row.classList.add('is-selected');
                row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }

        function setModeUi(mode) {
            // Unified sidebar entry for edit + AI tools.
            document.body.dataset.nav = 'open';
            document.querySelectorAll('.pdeffy-nav-item[data-nav-id]').forEach((el) => {
                const id = el.getAttribute('data-nav-id');
                el.classList.toggle('is-active', id === 'open');
            });
        }

        function syncUrl(tool) {
            try {
                const url = new URL(window.location.href);
                const mode = aiPanels.isAiTool(tool) ? 'ai' : 'edit';
                url.searchParams.set('mode', mode);
                url.searchParams.set('tool', tool);
                history.replaceState(null, '', url);
            } catch (_) { /* ignore */ }
        }

        function syncTabButtons(tool) {
            const isAi = aiPanels.isAiTool(tool);
            document.querySelectorAll('.pdfEditorToolTab').forEach((t) => {
                const tabTool = t.dataset.tool;
                if (!tabTool) {
                    t.classList.remove('active');
                    return;
                }
                // Single AI entry point in the editing toolbar.
                if (tabTool === 'anonymize' || tabTool === 'ai' || tabTool === 'summary' || tabTool === 'questions') {
                    t.classList.toggle('active', isAi);
                    return;
                }
                t.classList.toggle('active', tabTool === tool);
            });
        }

        function updateSearchStatus(count) {
            const statusEl = document.getElementById('pdfEditorSearchStatus');
            if (!statusEl) return;
            if (!count) {
                const q = PdfEditorTextSearch.getState().query;
                statusEl.textContent = q
                    ? msg('pdfEditorSearchNoResults', 'No results found.')
                    : '';
                return;
            }
            const st = PdfEditorTextSearch.getState();
            const tpl = msg('pdfEditorSearchStatus', '{current} of {total}');
            statusEl.textContent = tpl
                .replace('{current}', String(st.currentIndex + 1))
                .replace('{total}', String(count));
        }

        function renderSearchPageList() {
            const list = document.getElementById('pdfEditorSearchPages');
            if (!list) return;

            const pages = PdfEditorTextSearch.getPageResults();
            list.innerHTML = '';

            if (!pages.length) return;

            const label = document.createElement('p');
            label.className = 'pdfEditorHint pdfEditorSearchPagesTitle langText';
            label.id = 'pdfEditorSearchPagesTitle';
            label.textContent = msg('pdfEditorSearchPagesTitle', 'Pages with matches');
            list.appendChild(label);

            pages.forEach((p) => {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'pdfEditorSearchPageItem';
                const tpl = msg('pdfEditorSearchPageItem', 'Page {page} ({count})');
                row.textContent = tpl
                    .replace('{page}', String(p.displayIndex + 1))
                    .replace('{count}', String(p.count));
                row.addEventListener('click', () => {
                    PdfEditorTextSearch.goToFirstOnPage(p.pageId, onGoToPage).then(() => {
                        updateSearchStatus(PdfEditorTextSearch.getState().count);
                    });
                });
                list.appendChild(row);
            });
        }

        const panels = {
            select: () => `
                <div class="pdfEditorForm">
                    <p class="pdfEditorHint langText" id="pdfEditorSelectHint">${msg('pdfEditorSelectHintShort', 'Clicca o trascina sul documento per selezionare un elemento.')}</p>
                    <p class="pdfEditorHint langText" id="pdfEditorSelectMultiHint">${msg('pdfEditorSelectMultiHint', 'Selezione multipla: Cmd/Ctrl + clic')}</p>
                </div>`,
            form: () => `
                <div class="pdfEditorForm">
                    <p class="pdfEditorHint langText" id="pdfEditorFormHint">${msg('pdfEditorFormHint', 'Fill checkboxes, text fields, dropdowns and radio buttons on the page.')}</p>
                    <p class="pdfEditorFormStaticNotice langText pdfEditorHidden" id="pdfEditorFormStaticNotice">${msg('pdfEditorFormStaticNotice', 'This PDF has no interactive form fields (often exported from Canva or similar). Click on the page to add text or checkmarks.')}</p>
                    <div class="pdfEditorFormManualToolbar pdfEditorHidden" id="pdfEditorFormManualToolbar">
                        <div class="pdfEditorFormManualToolGrid" id="pdfEditorFormManualTools" role="group" aria-label="${msg('pdfEditorToolForm', 'Forms')}">
                            <button type="button" class="pdfEditorFormManualToolBtn active" data-manual-form="text" id="pdfEditorFormManualText">
                                <span class="pdfEditorFormManualToolIcon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 5h14M12 5v14M9 19h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
                                <span class="langText" data-i18n="pdfEditorFormManualText">${msg('pdfEditorFormManualText', 'Text')}</span>
                            </button>
                            <button type="button" class="pdfEditorFormManualToolBtn" data-manual-form="check" id="pdfEditorFormManualCheck">
                                <span class="pdfEditorFormManualToolIcon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="5" y="5" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 12.5 10.5 15 16 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                                <span class="langText" data-i18n="pdfEditorFormManualCheck">${msg('pdfEditorFormManualCheck', 'Check')}</span>
                            </button>
                            <button type="button" class="pdfEditorFormManualToolBtn" data-manual-form="radio" id="pdfEditorFormManualRadio">
                                <span class="pdfEditorFormManualToolIcon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg></span>
                                <span class="langText" data-i18n="pdfEditorFormManualRadio">${msg('pdfEditorFormManualRadio', 'Radio')}</span>
                            </button>
                        </div>
                        <div class="pdfEditorFormManualStylePanel pdfEditorHidden" id="pdfEditorFormManualStylePanel">
                            <p class="pdfEditorFormManualStyleHeading langText" id="pdfEditorFormManualStyleHeading" data-i18n="pdfEditorFormManualStyleHeading">${msg('pdfEditorFormManualStyleHeading', 'Style')}</p>
                            <div class="pdfEditorFormManualStyleMark pdfEditorHidden" id="pdfEditorFormManualStyleMark">
                                <button type="button" class="pdfEditorFormManualToolBtn pdfEditorFormManualStyleBtn active" data-manual-framed="1" id="pdfEditorFormManualFramed">
                                    <span class="pdfEditorFormManualToolIcon pdfEditorFormManualStyleIcon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="4.5" y="4.5" width="15" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 12.5 10.5 15 16 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                                    <span class="langText" data-i18n="pdfEditorFormManualFramed">${msg('pdfEditorFormManualFramed', 'With box')}</span>
                                </button>
                                <button type="button" class="pdfEditorFormManualToolBtn pdfEditorFormManualStyleBtn" data-manual-framed="0" id="pdfEditorFormManualPlain">
                                    <span class="pdfEditorFormManualToolIcon pdfEditorFormManualStyleIcon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 12.5 10 16.5 18 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                                    <span class="langText" data-i18n="pdfEditorFormManualPlain">${msg('pdfEditorFormManualPlain', 'Mark only')}</span>
                                </button>
                            </div>
                            <div class="pdfEditorFieldGrid pdfEditorFormManualStyleFields" id="pdfEditorFormManualStyleFields">
                                <div class="pdfEditorField pdfEditorFormManualStyleFont pdfEditorHidden" id="pdfEditorFormManualStyleFont">
                                    <label class="langText" for="pdfEditorFormManualFontSize" data-i18n="fontSize">${msg('fontSize', 'Size')}</label>
                                    <input type="number" id="pdfEditorFormManualFontSize" class="pdfEditorInput" min="6" max="72" step="1" value="12">
                                </div>
                                <div class="pdfEditorField">
                                    <label class="langText" id="pdfEditorFormManualColorLabel" for="pdfEditorFormManualColor" data-i18n="pdfEditorFormManualColorText">${msg('pdfEditorFormManualColorText', 'Text color:')}</label>
                                    <input type="color" id="pdfEditorFormManualColor" value="#000000">
                                </div>
                            </div>
                        </div>
                    </div>
                    <p class="pdfEditorHint" id="pdfEditorFormCount"></p>
                    <div id="pdfEditorFormList" class="pdfEditorList pdfEditorFormFieldList"></div>
                    <div id="pdfEditorFormManualList" class="pdfEditorList pdfEditorHidden"></div>
                </div>`,
            text: () => panels.form(),
            watermark: () => `
                <div class="pdfEditorForm">
                    <div class="pdfEditorSegmented" role="tablist" aria-label="${msg('watermarkTypeLabel', 'Watermark type')}">
                        <button type="button" class="pdfEditorSegmentedBtn active langText" data-wm-type="text" id="pdfEditorWmTypeText">${msg('typeTextLabel', 'Text')}</button>
                        <button type="button" class="pdfEditorSegmentedBtn langText" data-wm-type="image" id="pdfEditorWmTypeImage">${msg('typeImageLabel', 'Image')}</button>
                    </div>
                    <div id="pdfEditorWmTextPanel">
                        <div class="pdfEditorField">
                            <label class="langText" id="watermarkTextLabel">${msg('watermarkTextLabel', 'Text')}</label>
                            <input type="text" id="pdfEditorWmText" class="pdfEditorInput" placeholder="${msg('watermarkPlaceholder', 'CONFIDENTIAL')}" value="RISERVATO">
                        </div>
                        <div class="pdfEditorFieldGrid">
                            <div class="pdfEditorField">
                                <label>${msg('fontSize', 'Size')}</label>
                                <input type="number" id="pdfEditorWmSize" class="pdfEditorInput" value="48" min="8" max="200">
                            </div>
                            <div class="pdfEditorField">
                                <label>${msg('color', 'Color')}</label>
                                <input type="color" id="pdfEditorWmColorPicker" value="#000000">
                                <select id="pdfEditorWmColor" class="pdfEditorInput" hidden>
                                    <option value="black" selected>Black</option>
                                    <option value="gray">Gray</option>
                                    <option value="red">Red</option>
                                    <option value="#0066cc">Blue</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div id="pdfEditorWmImagePanel" class="pdfEditorHidden">
                        <div class="pdfEditorField">
                            <label class="langText" id="watermarkTypeLabel">${msg('imageFileLabel', 'Image')}</label>
                            <input type="file" id="pdfEditorWmImage" accept="image/png,image/jpeg" class="pdfEditorInput">
                        </div>
                        <div class="pdfEditorField pdfEditorFieldRow">
                            <label>${msg('scale', 'Scale')} %</label>
                            <input type="number" id="pdfEditorWmImgScale" class="pdfEditorInput" value="50" min="10" max="200">
                        </div>
                    </div>
                    <div class="pdfEditorField pdfEditorFieldRow">
                        <label>${msg('opacity', 'Opacity')} %</label>
                        <input type="range" id="pdfEditorWmOpacity" min="5" max="100" value="50">
                    </div>
                    <div class="pdfEditorField pdfEditorFieldRow">
                        <label>${msg('rotation', 'Rotation')}</label>
                        <input type="number" id="pdfEditorWmRot" class="pdfEditorInput" value="45">
                    </div>
                    <div class="pdfEditorField">
                        <label>${msg('position', 'Position')}</label>
                        <select id="pdfEditorWmPosPreset" class="pdfEditorInput">
                            <option value="50,50" selected>${msg('posCenter', 'Center')}</option>
                            <option value="50,20">${msg('posTop', 'Top')}</option>
                            <option value="50,80">${msg('posBottom', 'Bottom')}</option>
                            <option value="20,20">${msg('posTopLeft', 'Top left')}</option>
                            <option value="80,20">${msg('posTopRight', 'Top right')}</option>
                            <option value="20,80">${msg('posBottomLeft', 'Bottom left')}</option>
                            <option value="80,80">${msg('posBottomRight', 'Bottom right')}</option>
                            <option value="custom">${msg('posCustom', 'Custom')}</option>
                        </select>
                    </div>
                    <details class="pdfEditorAdvancedDetails" id="pdfEditorWmAdvanced">
                        <summary class="langText" id="pdfEditorWmAdvancedLabel">${msg('pdfEditorWmAdvanced', 'Advanced positioning')}</summary>
                        <div class="pdfEditorField">
                            <label>${msg('position', 'Position')} X / Y %</label>
                            <div class="pdfEditorRow">
                                <input type="number" id="pdfEditorWmX" class="pdfEditorInput" value="50" min="0" max="100" aria-label="X">
                                <input type="number" id="pdfEditorWmY" class="pdfEditorInput" value="50" min="0" max="100" aria-label="Y">
                            </div>
                        </div>
                    </details>
                    <div class="pdfEditorFormActions">
                        <button type="button" id="pdfEditorWmAddText" class="pdfEditorPrimaryCta langText">${msg('pdfEditorWmAdd', '+ Add watermark')}</button>
                        <button type="button" id="pdfEditorWmAddImage" class="pdfEditorPrimaryCta langText pdfEditorHidden">${msg('pdfEditorWmAdd', '+ Add watermark')}</button>
                        <button type="button" id="pdfEditorWmClearAll" class="pdfEditorPanelBtn pdfEditorPanelBtnDanger langText">${msg('pdfEditorWmClearAll', 'Remove all watermarks')}</button>
                    </div>
                    <div id="pdfEditorWmList" class="pdfEditorList"></div>
                </div>`,
            redact: () => `
                <div class="pdfEditorForm">
                    <p class="pdfEditorHint langText" id="pdfEditorRedactHint">${msg('pdfEditorRedactHint', 'Draw a rectangle on the page preview, or use the button below.')}</p>
                    <div class="pdfEditorField">
                        <label class="langText" id="redactColor">${msg('redactColor', 'Color')}</label>
                        <input type="color" id="pdfEditorRedactColor" value="#000000">
                    </div>
                    <div class="pdfEditorFormActions">
                        <button type="button" id="pdfEditorRedactAdd" class="pdfEditorPanelBtn langText">${msg('addBoxBtn', 'Add box')}</button>
                    </div>
                    <div id="pdfEditorRedactList" class="pdfEditorList"></div>
                </div>`,
            signature: () => `
                <div class="pdfEditorForm">
                    <p class="pdfEditorHint langText" id="pdfEditorSigHint">${msg('pdfEditorSigHint', 'Choose text, drawing or image, then click on the page to place the signature.')}</p>
                    <div class="pdfEditorSigTypeRow">
                        <label class="pdfEditorChipRadio"><input type="radio" name="pdfEditorSigType" value="text" checked> <span>${msg('pdfEditorSigText', 'Text')}</span></label>
                        <label class="pdfEditorChipRadio"><input type="radio" name="pdfEditorSigType" value="drawing"> <span>${msg('pdfEditorSigDraw', 'Draw')}</span></label>
                        <label class="pdfEditorChipRadio"><input type="radio" name="pdfEditorSigType" value="image"> <span>${msg('pdfEditorSigImage', 'Image')}</span></label>
                    </div>
                    <div id="pdfEditorSigTextFields" class="pdfEditorField">
                        <input type="text" id="pdfEditorSigText" class="pdfEditorInput" placeholder="${msg('pdfEditorSigName', 'Your name')}">
                    </div>
                    <div id="pdfEditorSigDrawFields" class="pdfEditorHidden pdfEditorField">
                        <canvas id="pdfEditorSigCanvas" class="pdfEditorSigCanvas" width="280" height="90"></canvas>
                        <div class="pdfEditorFormActions">
                            <button type="button" id="pdfEditorSigClearDraw" class="pdfEditorPanelBtn langText">${msg('pdfEditorClearDraw', 'Clear')}</button>
                        </div>
                        <div id="pdfEditorSigDrawSaved" class="pdfEditorSigSaved" hidden>
                            <img id="pdfEditorSigDrawPreview" class="pdfEditorSigSavedPreview" alt="">
                            <button type="button" id="pdfEditorSigDrawReuse" class="pdfEditorPanelBtn langText">${msg('pdfEditorSigReuseDraw', 'Reuse saved drawing')}</button>
                        </div>
                    </div>
                    <div id="pdfEditorSigImageFields" class="pdfEditorHidden pdfEditorField">
                        <input type="file" id="pdfEditorSigImage" accept="image/png,image/jpeg,image/webp" class="pdfEditorInput">
                        <div id="pdfEditorSigImageSaved" class="pdfEditorSigSaved" hidden>
                            <img id="pdfEditorSigImagePreview" class="pdfEditorSigSavedPreview" alt="">
                            <button type="button" id="pdfEditorSigImageReuse" class="pdfEditorPanelBtn langText">${msg('pdfEditorSigReuseImage', 'Reuse saved image')}</button>
                        </div>
                    </div>
                    <div class="pdfEditorFormActions">
                        <button type="button" id="pdfEditorSigPlace" class="pdfEditorPanelBtn langText">${msg('pdfEditorSigPlace', 'Place on current page')}</button>
                    </div>
                    <div id="pdfEditorSigList" class="pdfEditorList"></div>
                </div>`,
            comment: () => `
                <div class="pdfEditorForm">
                    <p class="pdfEditorHint langText" id="pdfEditorCommentHint">${msg('pdfEditorCommentHint', 'Click on the page to place a comment. Click a pin to edit.')}</p>
                    <div class="pdfEditorFormActions">
                        <button type="button" id="pdfEditorCommentAdd" class="pdfEditorPanelBtn langText">${msg('pdfEditorCommentAdd', 'Add comment on current page')}</button>
                    </div>
                    <div id="pdfEditorCommentList" class="pdfEditorList"></div>
                </div>`,
            draw: () => `
                <div class="pdfEditorForm">
                    <p class="pdfEditorHint langText" id="pdfEditorDrawHint">${msg('pdfEditorDrawHint', 'Choose a tool, then draw on the page.')}</p>
                    <div class="pdfEditorShapeTools" role="group" aria-label="${msg('pdfEditorDrawTools', 'Drawing tools')}">
                        <button type="button" class="pdfEditorShapeTool is-active" data-shape="freehand" id="pdfEditorShapeFreehand">
                            <span class="langText" id="pdfEditorShapeFreehandLabel">${msg('pdfEditorShapeFreehand', 'Pen')}</span>
                        </button>
                        <button type="button" class="pdfEditorShapeTool" data-shape="rect" id="pdfEditorShapeRect">
                            <span class="langText" id="pdfEditorShapeRectLabel">${msg('pdfEditorShapeRect', 'Rectangle')}</span>
                        </button>
                        <button type="button" class="pdfEditorShapeTool" data-shape="ellipse" id="pdfEditorShapeEllipse">
                            <span class="langText" id="pdfEditorShapeEllipseLabel">${msg('pdfEditorShapeEllipse', 'Ellipse')}</span>
                        </button>
                        <button type="button" class="pdfEditorShapeTool" data-shape="arrow" id="pdfEditorShapeArrow">
                            <span class="langText" id="pdfEditorShapeArrowLabel">${msg('pdfEditorShapeArrow', 'Arrow')}</span>
                        </button>
                        <button type="button" class="pdfEditorShapeTool" data-shape="polygon" id="pdfEditorShapePolygon">
                            <span class="langText" id="pdfEditorShapePolygonLabel">${msg('pdfEditorShapePolygon', 'Polygon')}</span>
                        </button>
                    </div>
                    <div class="pdfEditorFieldGrid">
                        <div class="pdfEditorField">
                            <label class="langText" id="pdfEditorDrawColorLabel">${msg('color', 'Color')}</label>
                            <input type="color" id="pdfEditorInkColor" value="#e53935">
                        </div>
                        <div class="pdfEditorField">
                            <label class="langText" id="pdfEditorDrawWidthLabel">${msg('pdfEditorDrawWidth', 'Thickness')}</label>
                            <input type="range" id="pdfEditorInkWidth" min="1" max="12" value="3">
                        </div>
                    </div>
                    <div class="pdfEditorFormActions pdfEditorDrawPolygonActions pdfEditorHidden" id="pdfEditorDrawPolygonActions">
                        <button type="button" id="pdfEditorPolygonDone" class="pdfEditorPanelBtn langText">${msg('pdfEditorPolygonDone', 'Close polygon')}</button>
                        <button type="button" id="pdfEditorPolygonCancel" class="pdfEditorPanelBtn langText">${msg('pdfEditorPolygonCancel', 'Cancel')}</button>
                    </div>
                    <div class="pdfEditorFormActions">
                        <button type="button" id="pdfEditorInkClearPage" class="pdfEditorPanelBtn langText">${msg('pdfEditorInkClearPage', 'Clear drawings on page')}</button>
                    </div>
                    <div id="pdfEditorInkList" class="pdfEditorList"></div>
                </div>`,
            bookmarks: () => `
                <div class="pdfEditorForm">
                    <p class="pdfEditorHint langText" id="pdfEditorBookmarksHint">${msg('pdfEditorBookmarksHint', 'Bookmarks jump to a page. Add one for the current page.')}</p>
                    <div class="pdfEditorFormActions">
                        <button type="button" id="pdfEditorBookmarkAdd" class="pdfEditorPanelBtn langText">${msg('pdfEditorBookmarkAdd', 'Add bookmark')}</button>
                    </div>
                    <div id="pdfEditorBookmarkList" class="pdfEditorList"></div>
                </div>`,
        };

        let wmPreviewImageBytes = null;
        let wmPreviewImageType = null;

        function getWatermarkColor() {
            const picker = document.getElementById('pdfEditorWmColorPicker');
            if (picker?.value) return picker.value;
            return document.getElementById('pdfEditorWmColor')?.value || '#000000';
        }

        function collectWatermarkDraft() {
            const textPanel = document.getElementById('pdfEditorWmTextPanel');
            const imageMode = textPanel?.classList.contains('pdfEditorHidden');
            const text = document.getElementById('pdfEditorWmText')?.value.trim() || 'RISERVATO';
            const opacity = (parseInt(document.getElementById('pdfEditorWmOpacity')?.value, 10) || 50) / 100;
            const rotation = parseInt(document.getElementById('pdfEditorWmRot')?.value, 10) || 0;
            const posX = parseInt(document.getElementById('pdfEditorWmX')?.value, 10) || 50;
            const posY = parseInt(document.getElementById('pdfEditorWmY')?.value, 10) || 50;

            if (imageMode) {
                if (!wmPreviewImageBytes) return null;
                return {
                    type: 'image',
                    imageBytes: wmPreviewImageBytes,
                    imageMediaType: wmPreviewImageType,
                    imageScale: parseInt(document.getElementById('pdfEditorWmImgScale')?.value, 10) || 50,
                    opacity,
                    rotation,
                    posX,
                    posY,
                    isDraft: true,
                };
            }

            return {
                type: 'text',
                text,
                fontSize: parseInt(document.getElementById('pdfEditorWmSize')?.value, 10) || 48,
                opacity,
                rotation,
                posX,
                posY,
                color: getWatermarkColor(),
                isDraft: true,
            };
        }

        function refreshWatermarkPreview() {
            PdfEditorOverlayManager.setWatermarkDraft(collectWatermarkDraft());
            // Defer until layout has canvas sizes (avoids empty preview right after render).
            requestAnimationFrame(() => {
                PdfEditorOverlayManager.syncOverlays(model, viewerApi);
            });
            if (typeof onExportStateChange === 'function') onExportStateChange();
        }

        function clearWatermarkFormFields() {
            const textInput = document.getElementById('pdfEditorWmText');
            if (textInput) textInput.value = '';
            clearWatermarkImagePreview();
        }

        /**
         * Promote live preview draft into model.watermarks so export matches the preview.
         * @returns {boolean} true if a draft was committed
         */
        function commitWatermarkDraft() {
            const draft = collectWatermarkDraft();
            if (!draft) {
                // Form may be unmounted (other tool); fall back to overlay draft.
                const overlayDraft = PdfEditorOverlayManager.getWatermarkDraft?.();
                if (!overlayDraft) return false;
                const { isDraft, ...layer } = overlayDraft;
                PdfEditorDocumentModel.addWatermark(model, layer);
                PdfEditorOverlayManager.setWatermarkDraft(null);
                return true;
            }
            const { isDraft, ...layer } = draft;
            PdfEditorDocumentModel.addWatermark(model, layer);
            clearWatermarkFormFields();
            PdfEditorOverlayManager.setWatermarkDraft(null);
            return true;
        }

        function clearWatermarkImagePreview() {
            wmPreviewImageBytes = null;
            wmPreviewImageType = null;
            const fileInput = document.getElementById('pdfEditorWmImage');
            if (fileInput) fileInput.value = '';
        }

        function wireWatermark() {
            const setWmType = (type) => {
                const textPanel = document.getElementById('pdfEditorWmTextPanel');
                const imagePanel = document.getElementById('pdfEditorWmImagePanel');
                const addText = document.getElementById('pdfEditorWmAddText');
                const addImage = document.getElementById('pdfEditorWmAddImage');
                document.querySelectorAll('.pdfEditorSegmentedBtn[data-wm-type]').forEach((btn) => {
                    btn.classList.toggle('active', btn.dataset.wmType === type);
                });
                textPanel?.classList.toggle('pdfEditorHidden', type !== 'text');
                imagePanel?.classList.toggle('pdfEditorHidden', type !== 'image');
                addText?.classList.toggle('pdfEditorHidden', type !== 'text');
                addImage?.classList.toggle('pdfEditorHidden', type !== 'image');
                refreshWatermarkPreview();
            };

            document.querySelectorAll('.pdfEditorSegmentedBtn[data-wm-type]').forEach((btn) => {
                btn.addEventListener('click', () => setWmType(btn.dataset.wmType));
            });

            document.getElementById('pdfEditorWmPosPreset')?.addEventListener('change', (e) => {
                const v = e.target.value;
                if (v === 'custom') {
                    document.getElementById('pdfEditorWmAdvanced')?.setAttribute('open', '');
                    return;
                }
                const [x, y] = String(v).split(',').map((n) => parseInt(n, 10));
                const xEl = document.getElementById('pdfEditorWmX');
                const yEl = document.getElementById('pdfEditorWmY');
                if (xEl) xEl.value = String(x);
                if (yEl) yEl.value = String(y);
                refreshWatermarkPreview();
            });

            document.getElementById('pdfEditorWmColorPicker')?.addEventListener('input', () => {
                const picker = document.getElementById('pdfEditorWmColorPicker');
                const select = document.getElementById('pdfEditorWmColor');
                if (select && picker) select.value = picker.value;
                refreshWatermarkPreview();
            });

            const previewIds = [
                'pdfEditorWmText',
                'pdfEditorWmSize',
                'pdfEditorWmOpacity',
                'pdfEditorWmRot',
                'pdfEditorWmX',
                'pdfEditorWmY',
                'pdfEditorWmImgScale',
            ];
            previewIds.forEach((id) => {
                const el = document.getElementById(id);
                el?.addEventListener('input', refreshWatermarkPreview);
                el?.addEventListener('change', refreshWatermarkPreview);
            });

            document.getElementById('pdfEditorWmImage')?.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                    wmPreviewImageBytes = null;
                    wmPreviewImageType = null;
                } else {
                    wmPreviewImageBytes = new Uint8Array(await file.arrayBuffer());
                    wmPreviewImageType = file.type;
                }
                refreshWatermarkPreview();
            });

            document.getElementById('pdfEditorWmAddText')?.addEventListener('click', () => {
                const text = document.getElementById('pdfEditorWmText').value.trim();
                if (!text) return;
                if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                PdfEditorDocumentModel.addWatermark(model, {
                    type: 'text',
                    text,
                    fontSize: parseInt(document.getElementById('pdfEditorWmSize').value, 10) || 48,
                    opacity: parseInt(document.getElementById('pdfEditorWmOpacity').value, 10) / 100,
                    rotation: parseInt(document.getElementById('pdfEditorWmRot').value, 10) || 0,
                    posX: parseInt(document.getElementById('pdfEditorWmX').value, 10) || 50,
                    posY: parseInt(document.getElementById('pdfEditorWmY').value, 10) || 50,
                    color: getWatermarkColor(),
                });
                clearWatermarkFormFields();
                notifyOverlayAnnotationChange();
                renderWatermarkList();
                refreshWatermarkPreview();
            });

            document.getElementById('pdfEditorWmClearAll')?.addEventListener('click', () => {
                const hadLayers = model.watermarks.length > 0;
                const hadDraft = !!collectWatermarkDraft();
                if (!hadLayers && !hadDraft) return;

                if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                PdfEditorDocumentModel.clearAllWatermarks(model);
                clearWatermarkFormFields();
                PdfEditorOverlayManager.setWatermarkDraft(null);
                if (hadLayers) notifyOverlayAnnotationChange();
                else refreshWatermarkPreview();
                renderWatermarkList();
            });

            document.getElementById('pdfEditorWmAddImage')?.addEventListener('click', async () => {
                const fileInput = document.getElementById('pdfEditorWmImage');
                const file = fileInput.files?.[0];
                if (!file && !wmPreviewImageBytes) return;
                const bytes = file
                    ? new Uint8Array(await file.arrayBuffer())
                    : wmPreviewImageBytes;
                if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                PdfEditorDocumentModel.addWatermark(model, {
                    type: 'image',
                    imageBytes: bytes,
                    imageMediaType: file?.type || wmPreviewImageType,
                    imageScale: parseInt(document.getElementById('pdfEditorWmImgScale').value, 10) || 50,
                    opacity: parseInt(document.getElementById('pdfEditorWmOpacity').value, 10) / 100,
                    rotation: parseInt(document.getElementById('pdfEditorWmRot').value, 10) || 0,
                    posX: parseInt(document.getElementById('pdfEditorWmX').value, 10) || 50,
                    posY: parseInt(document.getElementById('pdfEditorWmY').value, 10) || 50,
                });
                clearWatermarkFormFields();
                notifyOverlayAnnotationChange();
                renderWatermarkList();
                refreshWatermarkPreview();
            });
            renderWatermarkList();
            refreshWatermarkPreview();
        }

        function wireRedact() {
            const colorInput = document.getElementById('pdfEditorRedactColor');
            colorInput?.addEventListener('input', (e) => {
                PdfEditorOverlayManager.setRedactColor(e.target.value);
            });
            PdfEditorOverlayManager.setRedactColor(colorInput?.value || '#000000');

            document.getElementById('pdfEditorRedactAdd')?.addEventListener('click', () => {
                const pageId = getSelectedPageId();
                if (pageId) {
                    PdfEditorOverlayManager.addRedactBoxToCurrentPage(model, pageId, viewerApi, () => {
                        notifyOverlayAnnotationChange();
                    });
                }
            });
            renderRedactList();
        }

        function wireComments() {
            const addBtn = document.getElementById('pdfEditorCommentAdd');
            if (addBtn && !addBtn.dataset.wired) {
                addBtn.dataset.wired = '1';
                addBtn.addEventListener('click', async () => {
                    const pageId = getSelectedPageId();
                    if (!pageId) return;
                    const getAuthor =
                        global.__pdfEditorGetCommentAuthor || window.__pdfEditorGetCommentAuthor;
                    const author = typeof getAuthor === 'function' ? await getAuthor() : '';
                    const createdAt = Date.now();
                    const formatMeta =
                        global.__pdfEditorFormatCommentMeta || window.__pdfEditorFormatCommentMeta;
                    const meta =
                        typeof formatMeta === 'function'
                            ? formatMeta({ author, createdAt })
                            : '';
                    const text = await (global.__pdfEditorAskText?.({
                        title: msg('pdfEditorCommentPrompt', 'New comment'),
                        value: '',
                        meta,
                    }) ?? Promise.resolve(null));
                    if (text == null || !String(text).trim()) return;
                    if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                    PdfEditorDocumentModel.addComment(model, {
                        pageId,
                        x: 0.12,
                        y: 0.12,
                        text: String(text).trim(),
                        color: '#f4b400',
                        author,
                        createdAt,
                    });
                    PdfEditorOverlayManager.syncOverlays(model, viewerApi);
                    if (typeof onExportStateChange === 'function') onExportStateChange();
                    renderCommentList();
                });
            }
            renderCommentList();
        }

        function renderCommentList() {
            const list = document.getElementById('pdfEditorCommentList');
            if (!list) return;
            list.innerHTML = '';
            const active = PdfEditorDocumentModel.getActivePages(model);
            const pageIndex = new Map(active.map((p, i) => [p.id, i]));
            const items = [...(model.comments || [])].sort((a, b) => {
                const pa = pageIndex.has(a.pageId) ? pageIndex.get(a.pageId) : Number.MAX_SAFE_INTEGER;
                const pb = pageIndex.has(b.pageId) ? pageIndex.get(b.pageId) : Number.MAX_SAFE_INTEGER;
                if (pa !== pb) return pa - pb;
                const ta = Number(a.createdAt) || 0;
                const tb = Number(b.createdAt) || 0;
                if (ta !== tb) return ta - tb;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });
            if (!items.length) {
                list.innerHTML = `<p class="pdfEditorHint">${msg('pdfEditorCommentEmpty', 'No comments yet.')}</p>`;
                return;
            }
            items.forEach((c, i) => {
                const pageNo = pageIndex.has(c.pageId) ? pageIndex.get(c.pageId) + 1 : 0;
                const formatMeta =
                    global.__pdfEditorFormatCommentMeta || window.__pdfEditorFormatCommentMeta;
                const meta =
                    typeof formatMeta === 'function' ? formatMeta(c) : '';
                const esc = (s) =>
                    String(s)
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/"/g, '&quot;');
                const preview = esc((c.text || '').slice(0, 40));
                const row = document.createElement('div');
                row.className = 'pdfEditorListItem';
                row.innerHTML = `<button type="button" class="pdfEditorListJump"><strong>#${i + 1}</strong> p.${pageNo || '?'} — ${preview}${meta ? `<span class="pdfEditorCommentListMeta">${esc(meta)}</span>` : ''}</button><button type="button" class="pdfEditorListRemove" data-id="${esc(c.id)}">×</button>`;
                row.querySelector('.pdfEditorListJump')?.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onGoToPage) {
                        try {
                            await onGoToPage(c.pageId, Math.max(0, pageNo - 1));
                        } catch (_) { /* ignore */ }
                    }
                    if (typeof PdfEditorOverlayManager.openCommentEdit === 'function') {
                        await PdfEditorOverlayManager.openCommentEdit(c.id, model);
                    }
                });
                row.querySelector('.pdfEditorListRemove')?.addEventListener('click', () => {
                    if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                    PdfEditorDocumentModel.removeComment(model, c.id);
                    PdfEditorOverlayManager.syncOverlays(model, viewerApi);
                    if (typeof onExportStateChange === 'function') onExportStateChange();
                    renderCommentList();
                });
                list.appendChild(row);
            });
        }

        function wireDraw() {
            const color = document.getElementById('pdfEditorInkColor');
            const width = document.getElementById('pdfEditorInkWidth');
            const hint = document.getElementById('pdfEditorDrawHint');
            const polygonActions = document.getElementById('pdfEditorDrawPolygonActions');

            const shapeHints = {
                freehand: () => msg('pdfEditorDrawHintPen', 'Draw freely on the page with the pointer.'),
                rect: () => msg('pdfEditorDrawHintRect', 'Drag on the page to draw a rectangle. Hold Shift for a square.'),
                ellipse: () => msg('pdfEditorDrawHintEllipse', 'Drag on the page to draw an ellipse. Hold Shift for a circle.'),
                arrow: () => msg('pdfEditorDrawHintArrow', 'Drag on the page to draw an arrow. Hold Shift to snap angle.'),
                polygon: () =>
                    msg(
                        'pdfEditorDrawHintPolygon',
                        'Click to place vertices. Double-click, click the first point, or press Enter to close.'
                    ),
            };

            const syncInk = () => {
                const activeBtn = document.querySelector('.pdfEditorShapeTool.is-active');
                const shape = activeBtn?.dataset.shape || 'freehand';
                PdfEditorOverlayManager.setInkStyle?.({
                    color: color?.value || '#e53935',
                    width: parseFloat(width?.value) || 3,
                    shape,
                });
                if (hint) hint.textContent = (shapeHints[shape] || shapeHints.freehand)();
                const style = PdfEditorOverlayManager.getInkStyle?.();
                polygonActions?.classList.toggle(
                    'pdfEditorHidden',
                    (style?.shape || shape) !== 'polygon'
                );
            };

            document.querySelectorAll('.pdfEditorShapeTool').forEach((btn) => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.pdfEditorShapeTool').forEach((b) => b.classList.remove('is-active'));
                    btn.classList.add('is-active');
                    PdfEditorOverlayManager.cancelPolygonIfAny?.();
                    syncInk();
                });
            });

            color?.addEventListener('input', syncInk);
            width?.addEventListener('input', syncInk);
            syncInk();

            document.getElementById('pdfEditorPolygonDone')?.addEventListener('click', () => {
                PdfEditorOverlayManager.finishPolygonIfAny?.(model, () => notifyOverlayAnnotationChange());
                wireDrawListOnly();
            });
            document.getElementById('pdfEditorPolygonCancel')?.addEventListener('click', () => {
                PdfEditorOverlayManager.cancelPolygonIfAny?.();
            });

            document.getElementById('pdfEditorInkClearPage')?.addEventListener('click', () => {
                const pageId = getSelectedPageId();
                if (!pageId) return;
                const before = (model.inks || []).length;
                if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                model.inks = (model.inks || []).filter((ink) => ink.pageId !== pageId);
                if ((model.inks || []).length !== before) notifyOverlayAnnotationChange();
                wireDrawListOnly();
            });

            wireDrawListOnly();
        }

        function wireDrawListOnly() {
            const list = document.getElementById('pdfEditorInkList');
            if (!list) return;
            list.innerHTML = '';
            const items = model.inks || [];
            if (!items.length) {
                list.innerHTML = `<p class="pdfEditorHint">${msg('pdfEditorInkEmpty', 'No drawings yet.')}</p>`;
                return;
            }
            const shapeLabel = (shape) => {
                const map = {
                    freehand: 'pdfEditorShapeFreehand',
                    rect: 'pdfEditorShapeRect',
                    ellipse: 'pdfEditorShapeEllipse',
                    arrow: 'pdfEditorShapeArrow',
                    polygon: 'pdfEditorShapePolygon',
                };
                return msg(map[shape || 'freehand'] || 'pdfEditorInkStroke', 'Stroke');
            };
            items.forEach((ink, i) => {
                const active = PdfEditorDocumentModel.getActivePages(model);
                const pageNo = active.findIndex((p) => p.id === ink.pageId) + 1;
                const row = document.createElement('div');
                row.className = 'pdfEditorListItem';
                row.innerHTML = `<span>${shapeLabel(ink.shape)} ${i + 1} (p.${pageNo || '?'})</span><button type="button" class="pdfEditorListRemove" data-id="${ink.id}">×</button>`;
                row.querySelector('button')?.addEventListener('click', () => {
                    if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                    PdfEditorDocumentModel.removeInk(model, ink.id);
                    notifyOverlayAnnotationChange();
                    wireDrawListOnly();
                });
                list.appendChild(row);
            });
        }

        function wireBookmarks() {
            const addBtn = document.getElementById('pdfEditorBookmarkAdd');
            if (addBtn && !addBtn.dataset.wired) {
                addBtn.dataset.wired = '1';
                addBtn.addEventListener('click', async () => {
                    const pageId = getSelectedPageId();
                    if (!pageId) return;
                    const active = PdfEditorDocumentModel.getActivePages(model);
                    const pageNo = active.findIndex((p) => p.id === pageId) + 1;
                    const defaultTitle = `${msg('pdfEditorPageWord', 'Page')} ${pageNo}`;
                    const ask = global.__pdfEditorAskText;
                    const title = ask
                        ? await ask({
                              title: msg('pdfEditorBookmarkPrompt', 'Bookmark title'),
                              value: defaultTitle,
                          })
                        : defaultTitle;
                    if (title == null || !String(title).trim()) return;
                    if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                    PdfEditorDocumentModel.addBookmark(model, {
                        pageId,
                        title: String(title).trim(),
                        y: 0,
                    });
                    if (typeof global.__pdfEditorMarkDirty === 'function') global.__pdfEditorMarkDirty();
                    if (typeof onExportStateChange === 'function') onExportStateChange();
                    renderBookmarkList();
                });
            }
            renderBookmarkList();
        }

        function formTypeLabel(type) {
            const map = {
                text: msg('pdfEditorFormTypeText', 'Text'),
                checkbox: msg('pdfEditorFormTypeCheckbox', 'Checkbox'),
                radio: msg('pdfEditorFormTypeRadio', 'Radio'),
                dropdown: msg('pdfEditorFormTypeDropdown', 'Dropdown'),
                listbox: msg('pdfEditorFormTypeList', 'List'),
            };
            return map[type] || type;
        }

        function syncManualFormStyleButtonIcons(toolKind) {
            const framedIcon = document.querySelector(
                '#pdfEditorFormManualFramed .pdfEditorFormManualStyleIcon'
            );
            const plainIcon = document.querySelector(
                '#pdfEditorFormManualPlain .pdfEditorFormManualStyleIcon'
            );
            if (!framedIcon || !plainIcon) return;
            if (toolKind === 'radio') {
                framedIcon.innerHTML =
                    '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
                plainIcon.innerHTML =
                    '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>';
            } else if (toolKind === 'check') {
                framedIcon.innerHTML =
                    '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="4.5" y="4.5" width="15" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 12.5 10.5 15 16 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                plainIcon.innerHTML =
                    '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 12.5 10 16.5 18 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            }
        }

        function getSelectedManualFormEntry() {
            const sel = PdfEditorOverlayManager.getSelectedAnnotation?.();
            if (!sel || sel.type !== 'manualForm') return null;
            return (model.manualFormFills || []).find((x) => x.id === sel.id) || null;
        }

        function syncManualFormStylePanel() {
            const panel = document.getElementById('pdfEditorFormManualStylePanel');
            if (!panel || (model.formFields || []).length) return;
            const entry = getSelectedManualFormEntry();
            panel.classList.toggle('pdfEditorHidden', !entry);
            if (!entry) return;

            const markSec = document.getElementById('pdfEditorFormManualStyleMark');
            const fontSec = document.getElementById('pdfEditorFormManualStyleFont');
            const isText = entry.type === 'text';
            markSec?.classList.toggle('pdfEditorHidden', isText);
            fontSec?.classList.toggle('pdfEditorHidden', !isText);

            if (!isText) {
                syncManualFormStyleButtonIcons(entry.type === 'radio' ? 'radio' : 'check');
                const framed = entry.framed !== false;
                panel.querySelectorAll('[data-manual-framed]').forEach((b) => {
                    b.classList.toggle('active', (b.dataset.manualFramed !== '0') === framed);
                });
            }

            const colorLabel = document.getElementById('pdfEditorFormManualColorLabel');
            const colorIn = document.getElementById('pdfEditorFormManualColor');
            const sizeIn = document.getElementById('pdfEditorFormManualFontSize');
            const colorKey = isText ? 'pdfEditorFormManualColorText' : 'pdfEditorFormManualColorMark';
            if (colorLabel) {
                colorLabel.dataset.i18n = colorKey;
                colorLabel.textContent = msg(
                    colorKey,
                    isText ? 'Text color:' : 'Mark color:'
                );
            }
            const color = entry.color || '#000000';
            if (colorIn && colorIn.value !== color) colorIn.value = color;
            if (sizeIn && isText) {
                const fs = entry.fontSize || 12;
                if (String(sizeIn.value) !== String(fs)) sizeIn.value = String(fs);
            }

            if (!isText) {
                PdfEditorOverlayManager.setManualFormStyleDefaults?.({
                    framed: entry.framed !== false,
                });
            }
        }

        function wireManualFormStylePanel() {
            const panel = document.getElementById('pdfEditorFormManualStylePanel');
            if (!panel) return;

            const placementDefaults = PdfEditorOverlayManager.getManualFormStyleDefaults?.() || {};
            const colorInInit = document.getElementById('pdfEditorFormManualColor');
            if (colorInInit && placementDefaults.color) {
                colorInInit.value = placementDefaults.color;
            }

            panel.querySelectorAll('[data-manual-framed]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const entry = getSelectedManualFormEntry();
                    if (!entry || entry.type === 'text') return;
                    const framed = btn.dataset.manualFramed !== '0';
                    panel.querySelectorAll('[data-manual-framed]').forEach((b) =>
                        b.classList.toggle('active', b === btn)
                    );
                    if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                    PdfEditorDocumentModel.updateManualFormFill(model, entry.id, { framed });
                    PdfEditorOverlayManager.setManualFormFramed?.(framed);
                    PdfEditorOverlayManager.setManualFormStyleDefaults?.({ framed });
                    notifyOverlayAnnotationChange();
                });
            });

            const colorIn = document.getElementById('pdfEditorFormManualColor');
            const applyManualColor = (recordHistory) => {
                const entry = getSelectedManualFormEntry();
                const color = colorIn?.value || '#000000';
                PdfEditorOverlayManager.setManualFormStyleDefaults?.({ color });
                if (!entry) return;
                if ((entry.color || '#000000') === color) return;
                if (recordHistory && typeof global.__pdfEditorBeforeEdit === 'function') {
                    global.__pdfEditorBeforeEdit();
                }
                PdfEditorDocumentModel.updateManualFormFill(model, entry.id, { color });
                notifyOverlayAnnotationChange();
            };
            colorIn?.addEventListener('input', () => applyManualColor(false));
            colorIn?.addEventListener('change', () => applyManualColor(true));

            const sizeIn = document.getElementById('pdfEditorFormManualFontSize');
            const applySize = (recordHistory) => {
                const entry = getSelectedManualFormEntry();
                if (!entry || entry.type !== 'text') return;
                let fs = parseInt(sizeIn?.value, 10);
                if (!Number.isFinite(fs)) fs = 12;
                fs = Math.max(6, Math.min(72, fs));
                if (sizeIn) sizeIn.value = String(fs);
                if ((entry.fontSize || 12) === fs) return;
                if (recordHistory && typeof global.__pdfEditorBeforeEdit === 'function') {
                    global.__pdfEditorBeforeEdit();
                }
                PdfEditorDocumentModel.updateManualFormFill(model, entry.id, { fontSize: fs });
                PdfEditorOverlayManager.setManualFormStyleDefaults?.({ fontSize: fs });
                notifyOverlayAnnotationChange();
            };
            sizeIn?.addEventListener('input', () => applySize(false));
            sizeIn?.addEventListener('change', () => applySize(true));
        }

        function wireManualFormToolbar() {
            const tools = document.getElementById('pdfEditorFormManualTools');
            if (!tools) return;
            tools.querySelectorAll('[data-manual-form]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    tools.querySelectorAll('[data-manual-form]').forEach((b) =>
                        b.classList.toggle('active', b === btn)
                    );
                    const kind = btn.dataset.manualForm || 'text';
                    PdfEditorOverlayManager.setManualFormTool?.(kind);
                });
            });
            PdfEditorOverlayManager.setManualFormTool?.(
                tools.querySelector('[data-manual-form].active')?.dataset.manualForm || 'text'
            );
            wireManualFormStylePanel();
        }

        function syncManualFormUi() {
            const widgets = model.formFields || [];
            const manual = !widgets.length;
            const notice = document.getElementById('pdfEditorFormStaticNotice');
            const toolbar = document.getElementById('pdfEditorFormManualToolbar');
            const manualList = document.getElementById('pdfEditorFormManualList');
            if (notice) notice.classList.toggle('pdfEditorHidden', !manual);
            if (toolbar) toolbar.classList.toggle('pdfEditorHidden', !manual);
            if (manualList) manualList.classList.toggle('pdfEditorHidden', !manual);
            syncManualFormStylePanel();
        }

        function wireFormFields() {
            syncManualFormUi();
            wireManualFormToolbar();
            renderFormFieldList();
            renderManualFormList();
        }

        function renderManualFormList() {
            const list = document.getElementById('pdfEditorFormManualList');
            if (!list || (model.formFields || []).length) return;
            list.innerHTML = '';
            const items = model.manualFormFills || [];
            if (!items.length) {
                list.innerHTML = `<p class="pdfEditorHint langText">${msg('pdfEditorFormManualEmpty', 'Click on the document to place fields.')}</p>`;
                return;
            }
            items.forEach((entry) => {
                const active = PdfEditorDocumentModel.getActivePages(model);
                const pageNo = active.findIndex((p) => p.id === entry.pageId) + 1;
                const row = document.createElement('div');
                row.className = 'pdfEditorListItem pdfEditorListItem--selectable';
                row.dataset.entryId = entry.id;
                const framedLabel =
                    entry.framed === false
                        ? msg('pdfEditorFormManualPlain', 'Mark only')
                        : msg('pdfEditorFormManualFramed', 'With box');
                const label =
                    entry.type === 'check'
                        ? `${msg('pdfEditorFormTypeCheckbox', 'Checkbox')} · ${framedLabel}`
                        : entry.type === 'radio'
                          ? `${msg('pdfEditorFormTypeRadio', 'Radio')} · ${framedLabel}`
                          : entry.text || msg('pdfEditorFormManualText', 'Text');
                row.innerHTML = `<span>${label} <span class="pdfEditorHint">p.${pageNo || '?'}</span></span><button type="button" class="pdfEditorListRemove" data-id="${entry.id}">×</button>`;
                row.addEventListener('click', (e) => {
                    if (e.target.closest('.pdfEditorListRemove')) return;
                    const pages = PdfEditorDocumentModel.getActivePages(model);
                    const pageIdx = pages.findIndex((p) => p.id === entry.pageId);
                    if (onGoToPage && pageIdx >= 0) onGoToPage(entry.pageId, pageIdx);
                    requestAnimationFrame(() => {
                        PdfEditorOverlayManager.selectAnnotation?.('manualForm', entry.id);
                    });
                });
                row.querySelector('button')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                    PdfEditorDocumentModel.removeManualFormFill(model, entry.id);
                    PdfEditorOverlayManager.clearAnnotationSelection?.();
                    notifyOverlayAnnotationChange();
                    renderManualFormList();
                    syncManualFormStylePanel();
                });
                list.appendChild(row);
            });
        }

        function renderFormFieldList() {
            const list = document.getElementById('pdfEditorFormList');
            const countEl = document.getElementById('pdfEditorFormCount');
            if (!list) return;

            syncManualFormUi();

            const widgets = model.formFields || [];
            const logical = global.PdfEditorFormFields?.uniqueLogicalFields(widgets) || [];
            if (countEl) {
                if (!logical.length) {
                    countEl.textContent = '';
                } else {
                    const tpl = msg('pdfEditorFormCount', '{count} fields');
                    countEl.textContent = tpl.replace('{count}', String(logical.length));
                }
            }

            list.innerHTML = '';
            if (!logical.length) return;

            logical.forEach((field) => {
                const row = document.createElement('div');
                row.className = 'pdfEditorListItem pdfEditorFormListItem';
                row.dataset.fieldName = field.name;

                const active = PdfEditorDocumentModel.getActivePages(model);
                const pageNo = active.findIndex((p) => p.id === field.pageId) + 1;
                const typeLabel = formTypeLabel(field.type);
                const head = document.createElement('div');
                head.className = 'pdfEditorFormListHead';
                head.innerHTML = `<button type="button" class="pdfEditorListJump"><span class="pdfEditorFormListName">${field.name}</span> <span class="pdfEditorHint">${typeLabel} · p.${pageNo || '?'}</span></button>`;
                head.querySelector('.pdfEditorListJump')?.addEventListener('click', () => {
                    if (onGoToPage) onGoToPage(field.pageId, Math.max(0, pageNo - 1));
                });
                row.appendChild(head);

                const FF = global.PdfEditorFormFields;
                const current = FF?.getFormValue(model, field.name);

                if (field.type === 'checkbox') {
                    const label = document.createElement('label');
                    label.className = 'pdfEditorFormListControl';
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.checked = !!FF?.isCheckboxChecked(model, field);
                    cb.disabled = !!field.readOnly;
                    cb.addEventListener('change', () => {
                        if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                        FF.setFormValue(model, field.name, cb.checked);
                        notifyOverlayAnnotationChange();
                    });
                    label.appendChild(cb);
                    label.appendChild(document.createTextNode(` ${msg('pdfEditorFormChecked', 'Checked')}`));
                    row.appendChild(label);
                } else if (field.type === 'radio') {
                    const opts = field.groupOptions || field.options || [];
                    const group = document.createElement('div');
                    group.className = 'pdfEditorFormListControl pdfEditorFormListRadios';
                    opts.forEach((opt) => {
                        const label = document.createElement('label');
                        label.className = 'pdfEditorChipRadio';
                        const radio = document.createElement('input');
                        radio.type = 'radio';
                        radio.name = `pdfEditorFormRadio_${field.name}`;
                        radio.value = opt.value;
                        radio.checked = String(current ?? '') === String(opt.value);
                        radio.disabled = !!field.readOnly;
                        radio.addEventListener('change', () => {
                            if (!radio.checked) return;
                            if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                            FF.setFormValue(model, field.name, opt.value);
                            notifyOverlayAnnotationChange();
                        });
                        label.appendChild(radio);
                        label.appendChild(document.createTextNode(` ${opt.label || opt.value}`));
                        group.appendChild(label);
                    });
                    row.appendChild(group);
                } else if (field.type === 'dropdown' || field.type === 'listbox') {
                    const select = document.createElement('select');
                    select.className = 'pdfEditorInput';
                    select.disabled = !!field.readOnly;
                    const empty = document.createElement('option');
                    empty.value = '';
                    empty.textContent = '—';
                    select.appendChild(empty);
                    (field.options || []).forEach((opt) => {
                        const o = document.createElement('option');
                        o.value = opt.value;
                        o.textContent = opt.label || opt.value;
                        select.appendChild(o);
                    });
                    select.value = current == null ? '' : String(current);
                    select.addEventListener('change', () => {
                        if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                        FF.setFormValue(model, field.name, select.value);
                        notifyOverlayAnnotationChange();
                    });
                    row.appendChild(select);
                } else {
                    const input = document.createElement(field.multiLine ? 'textarea' : 'input');
                    if (!field.multiLine) input.type = 'text';
                    input.className = 'pdfEditorInput';
                    input.value = current == null ? '' : String(current);
                    input.disabled = !!field.readOnly;
                    if (field.maxLen > 0) input.maxLength = field.maxLen;
                    const commit = () => {
                        if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                        FF.setFormValue(model, field.name, input.value);
                        notifyOverlayAnnotationChange();
                    };
                    input.addEventListener('change', commit);
                    row.appendChild(input);
                }

                list.appendChild(row);
            });
        }

        function renderBookmarkList() {
            const list = document.getElementById('pdfEditorBookmarkList');
            if (!list) return;
            list.innerHTML = '';
            const items = model.bookmarks || [];
            if (!items.length) {
                list.innerHTML = `<p class="pdfEditorHint">${msg('pdfEditorBookmarkEmpty', 'No bookmarks yet.')}</p>`;
                return;
            }
            items.forEach((bm) => {
                const active = PdfEditorDocumentModel.getActivePages(model);
                const pageNo = active.findIndex((p) => p.id === bm.pageId) + 1;
                const row = document.createElement('div');
                row.className = 'pdfEditorListItem';
                row.innerHTML = `<button type="button" class="pdfEditorListJump">${bm.title || 'Bookmark'} <span class="pdfEditorHint">p.${pageNo || '?'}</span></button><button type="button" class="pdfEditorListRemove" data-id="${bm.id}">×</button>`;
                row.querySelector('.pdfEditorListJump')?.addEventListener('click', () => {
                    if (onGoToPage) onGoToPage(bm.pageId, Math.max(0, pageNo - 1));
                });
                row.querySelector('.pdfEditorListRemove')?.addEventListener('click', () => {
                    if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                    PdfEditorDocumentModel.removeBookmark(model, bm.id);
                    if (typeof global.__pdfEditorMarkDirty === 'function') global.__pdfEditorMarkDirty();
                    if (typeof onExportStateChange === 'function') onExportStateChange();
                    renderBookmarkList();
                });
                list.appendChild(row);
            });
        }

        async function performSearch() {
            const input = document.getElementById('pdfEditorSearchInput');
            const q = input?.value?.trim() || '';
            const caseBox = document.getElementById('pdfEditorSearchCase');
            PdfEditorTextSearch.setCaseSensitive(caseBox?.checked || false);

            // Scanned PDFs: search OCR text view (no pdf.js text layer).
            if (model.hasEmbeddedText === false) {
                if (typeof global.__pdfEditorEnsureOcrText === 'function') {
                    await global.__pdfEditorEnsureOcrText();
                }
                if (typeof global.__pdfEditorSetViewerContentMode === 'function') {
                    global.__pdfEditorSetViewerContentMode('text');
                }
                const text =
                    model.ocrText ||
                    document.getElementById('pdfEditorOcrText')?.dataset?.rawText ||
                    '';
                const { count } = PdfEditorTextSearch.runOcrTextSearch(text, q);
                updateSearchStatus(count);
                renderSearchPageList();
                return;
            }

            const zoom = viewerApi?.getZoomPercent?.() ?? 100;
            const { count } = await PdfEditorTextSearch.runSearch(model, getPdfPage, zoom, q);
            updateSearchStatus(count);
            renderSearchPageList();

            if (count > 0) {
                await PdfEditorTextSearch.goToIndex(0, onGoToPage);
                updateSearchStatus(count);
            }
        }

        function wireSignature() {
            const SIG_DRAW_KEY = 'pdeffy.sig.draw';
            const SIG_IMAGE_KEY = 'pdeffy.sig.image';
            const canvas = document.getElementById('pdfEditorSigCanvas');
            const ctx = canvas?.getContext('2d');
            let pendingImageBytes = null;
            let drawing = false;
            let strokeStarted = false;

            function canvasIsBlank() {
                if (!ctx || !canvas) return true;
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                for (let i = 3; i < data.length; i += 4) {
                    if (data[i] !== 0) return false;
                }
                return true;
            }

            function saveDrawToStore() {
                if (!canvas || canvasIsBlank()) return;
                try {
                    localStorage.setItem(SIG_DRAW_KEY, canvas.toDataURL('image/png'));
                } catch (_) { /* ignore quota */ }
                refreshDrawSavedUi();
            }

            function saveImageToStore(dataUrl) {
                if (!dataUrl) return;
                try {
                    localStorage.setItem(SIG_IMAGE_KEY, dataUrl);
                } catch (_) { /* ignore */ }
                refreshImageSavedUi();
            }

            function refreshDrawSavedUi() {
                const box = document.getElementById('pdfEditorSigDrawSaved');
                const img = document.getElementById('pdfEditorSigDrawPreview');
                const stored = localStorage.getItem(SIG_DRAW_KEY);
                if (!box || !img) return;
                if (stored) {
                    img.src = stored;
                    box.hidden = false;
                } else {
                    box.hidden = true;
                    img.removeAttribute('src');
                }
            }

            function refreshImageSavedUi() {
                const box = document.getElementById('pdfEditorSigImageSaved');
                const img = document.getElementById('pdfEditorSigImagePreview');
                const stored = localStorage.getItem(SIG_IMAGE_KEY);
                if (!box || !img) return;
                if (stored) {
                    img.src = stored;
                    box.hidden = false;
                } else {
                    box.hidden = true;
                    img.removeAttribute('src');
                }
            }

            function loadDrawOntoCanvas(dataUrl) {
                if (!ctx || !canvas || !dataUrl) return;
                const img = new Image();
                img.onload = () => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                };
                img.src = dataUrl;
            }

            async function dataUrlToBytes(dataUrl) {
                const res = await fetch(dataUrl);
                const buf = await res.arrayBuffer();
                return new Uint8Array(buf);
            }

            async function prefillAuthorName() {
                const input = document.getElementById('pdfEditorSigText');
                if (!input || input.value.trim()) return;
                try {
                    const ipc = global.ipcRenderer || window.ipcRenderer;
                    if (!ipc?.invoke) return;
                    const meta = await ipc.invoke('get-pdf-metadata');
                    const author = String(meta?.author || '').trim();
                    if (author) input.value = author;
                } catch (_) { /* ignore */ }
            }

            if (ctx && canvas) {
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                const pointerPos = (e) => {
                    const r = canvas.getBoundingClientRect();
                    const sx = canvas.width / Math.max(1, r.width);
                    const sy = canvas.height / Math.max(1, r.height);
                    return {
                        x: (e.clientX - r.left) * sx,
                        y: (e.clientY - r.top) * sy,
                    };
                };

                canvas.addEventListener('pointerdown', (e) => {
                    if (e.button != null && e.button !== 0) return;
                    drawing = true;
                    strokeStarted = true;
                    canvas.setPointerCapture?.(e.pointerId);
                    const { x, y } = pointerPos(e);
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    e.preventDefault();
                });
                canvas.addEventListener('pointerup', () => {
                    if (drawing && strokeStarted) saveDrawToStore();
                    drawing = false;
                });
                canvas.addEventListener('pointercancel', () => {
                    drawing = false;
                });
                canvas.addEventListener('pointerleave', () => {
                    if (drawing && strokeStarted) saveDrawToStore();
                    drawing = false;
                });
                canvas.addEventListener('pointermove', (e) => {
                    if (!drawing) return;
                    const { x, y } = pointerPos(e);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                });

                const storedDraw = localStorage.getItem(SIG_DRAW_KEY);
                if (storedDraw) loadDrawOntoCanvas(storedDraw);
            }

            refreshDrawSavedUi();
            refreshImageSavedUi();
            prefillAuthorName();

            document.getElementById('pdfEditorSigClearDraw')?.addEventListener('click', () => {
                if (!ctx || !canvas) return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                try {
                    localStorage.removeItem(SIG_DRAW_KEY);
                } catch (_) { /* ignore */ }
                refreshDrawSavedUi();
            });

            document.getElementById('pdfEditorSigDrawReuse')?.addEventListener('click', () => {
                const stored = localStorage.getItem(SIG_DRAW_KEY);
                if (stored) loadDrawOntoCanvas(stored);
            });

            document.getElementById('pdfEditorSigImageReuse')?.addEventListener('click', async () => {
                const stored = localStorage.getItem(SIG_IMAGE_KEY);
                if (!stored) return;
                pendingImageBytes = await dataUrlToBytes(stored);
                const fileInput = document.getElementById('pdfEditorSigImage');
                if (fileInput) fileInput.value = '';
            });

            document.getElementById('pdfEditorSigImage')?.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                    pendingImageBytes = null;
                    return;
                }
                const bytes = new Uint8Array(await file.arrayBuffer());
                pendingImageBytes = bytes;
                const blob = new Blob([bytes], { type: file.type || 'image/png' });
                const reader = new FileReader();
                reader.onload = () => {
                    if (typeof reader.result === 'string') saveImageToStore(reader.result);
                };
                reader.readAsDataURL(blob);
            });

            document.querySelectorAll('input[name="pdfEditorSigType"]').forEach((radio) => {
                radio.addEventListener('change', () => {
                    const v = document.querySelector('input[name="pdfEditorSigType"]:checked')?.value;
                    document.getElementById('pdfEditorSigTextFields').classList.toggle('pdfEditorHidden', v !== 'text');
                    document.getElementById('pdfEditorSigDrawFields').classList.toggle('pdfEditorHidden', v !== 'drawing');
                    document.getElementById('pdfEditorSigImageFields').classList.toggle('pdfEditorHidden', v !== 'image');
                });
            });

            async function buildSignaturePayload() {
                const type = document.querySelector('input[name="pdfEditorSigType"]:checked')?.value;
                if (!type) return null;
                const payload = { type };

                if (type === 'text') {
                    payload.text = document.getElementById('pdfEditorSigText')?.value.trim() || 'Signature';
                    payload.fontSize = 22;
                    payload.color = '#000000';
                    return payload;
                }

                if (type === 'drawing' && canvas) {
                    let dataUrl = null;
                    if (!canvasIsBlank()) {
                        dataUrl = canvas.toDataURL('image/png');
                        try {
                            localStorage.setItem(SIG_DRAW_KEY, dataUrl);
                        } catch (_) { /* ignore */ }
                        refreshDrawSavedUi();
                    } else {
                        dataUrl = localStorage.getItem(SIG_DRAW_KEY);
                    }
                    if (!dataUrl) return null;
                    payload.pngBytes = await dataUrlToBytes(dataUrl);
                    return payload;
                }

                if (type === 'image') {
                    if (!pendingImageBytes) {
                        const file = document.getElementById('pdfEditorSigImage')?.files?.[0];
                        if (file) {
                            pendingImageBytes = new Uint8Array(await file.arrayBuffer());
                        } else {
                            const stored = localStorage.getItem(SIG_IMAGE_KEY);
                            if (stored) pendingImageBytes = await dataUrlToBytes(stored);
                        }
                    }
                    if (!pendingImageBytes) return null;
                    payload.pngBytes = pendingImageBytes;
                    try {
                        const blob = new Blob([pendingImageBytes], { type: 'image/png' });
                        const reader = new FileReader();
                        reader.onload = () => {
                            if (typeof reader.result === 'string') saveImageToStore(reader.result);
                        };
                        reader.readAsDataURL(blob);
                    } catch (_) { /* ignore */ }
                    return payload;
                }

                return null;
            }

            PdfEditorOverlayManager.setSignaturePayloadProvider?.(buildSignaturePayload);

            document.getElementById('pdfEditorSigPlace')?.addEventListener('click', async () => {
                const pageId = getSelectedPageId();
                if (!pageId) return;
                const payload = await buildSignaturePayload();
                if (!payload) return;

                PdfEditorOverlayManager.placeSignatureOnPage(model, pageId, payload, viewerApi, () => {
                    notifyOverlayAnnotationChange();
                    // Keep drawing/image for reuse — do not clear.
                });
            });
            renderSigList();
        }

        function onViewerRendered() {
            PdfEditorOverlayManager.bindAllRedactLayers(model, viewerApi, () => {
                notifyOverlayAnnotationChange();
            });
            requestAnimationFrame(() => {
                PdfEditorOverlayManager.syncOverlays(model, viewerApi);
            });
            if (PdfEditorTextSearch.getState().query && PdfEditorTextSearch.hasActiveSearch()) {
                requestAnimationFrame(() => {
                    PdfEditorTextSearch.renderHighlights();
                    updateSearchStatus(PdfEditorTextSearch.getState().count);
                });
            }
        }

        function onDocumentLoaded() {
            PdfEditorTextSearch.clear();
            updateSearchStatus(0);
            const input = document.getElementById('pdfEditorSearchInput');
            if (input) input.value = '';
            aiPanels.onDocumentLoaded();
            switchTool(activeTool === 'search' ? 'select' : activeTool);
        }

        let searchWired = false;

        function wireSearch() {
            if (searchWired) return;
            const input = document.getElementById('pdfEditorSearchInput');
            const searchBtn = document.getElementById('pdfEditorSearchBtn');
            const prevBtn = document.getElementById('pdfEditorSearchPrev');
            const nextBtn = document.getElementById('pdfEditorSearchNext');
            const caseBox = document.getElementById('pdfEditorSearchCase');
            if (!input || !searchBtn) return;
            searchWired = true;
            input.placeholder = msg('pdfEditorSearchPlaceholder', 'Search text...');

            searchBtn.addEventListener('click', () => performSearch());
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        PdfEditorTextSearch.goToPrev(onGoToPage).then(() => {
                            updateSearchStatus(PdfEditorTextSearch.getState().count);
                        });
                    } else {
                        const st = PdfEditorTextSearch.getState();
                        if (st.count > 0) {
                            PdfEditorTextSearch.goToNext(onGoToPage).then(() => {
                                updateSearchStatus(PdfEditorTextSearch.getState().count);
                            });
                        } else {
                            performSearch();
                        }
                    }
                }
            });

            caseBox?.addEventListener('change', () => {
                if (PdfEditorTextSearch.getState().query) performSearch();
            });

            prevBtn?.addEventListener('click', () => {
                PdfEditorTextSearch.goToPrev(onGoToPage).then(() => {
                    updateSearchStatus(PdfEditorTextSearch.getState().count);
                });
            });

            nextBtn?.addEventListener('click', () => {
                PdfEditorTextSearch.goToNext(onGoToPage).then(() => {
                    updateSearchStatus(PdfEditorTextSearch.getState().count);
                });
            });
        }

        function initTabs() {
            PdfEditorOverlayManager.setupGlobalListeners();
            PdfEditorOverlayManager.setOverlayChangeHandler(() => {
                notifyOverlayAnnotationChange();
            });
            PdfEditorOverlayManager.setAnnotationSelectHandler?.(({ type, id }) => {
                const toolByType = {
                    signature: 'signature',
                    redact: 'redact',
                    watermark: 'watermark',
                    ink: 'draw',
                    comment: 'comment',
                    form: 'form',
                    manualForm: 'form',
                };
                const tool = toolByType[type];
                if (tool && activeTool !== tool) {
                    switchTool(tool);
                }
                // Re-apply selection after tool switch rebuilds overlays.
                requestAnimationFrame(() => {
                    const still = PdfEditorOverlayManager.getSelectedAnnotation?.();
                    if (still?.id === id && still?.type === type) {
                        // syncOverlays already ran; force highlight refresh
                        document
                            .querySelectorAll(
                                `[data-ann-type="${type}"][data-ann-id="${id}"]`
                            )
                            .forEach((el) => el.classList.add('pdfEditorAnnotationSelected'));
                    }
                    highlightAnnotationInList(type, id);
                    syncManualFormStylePanel();
                });
            });
            document.querySelectorAll('.pdfEditorToolTab[data-tool]').forEach((tab) => {
                tab.addEventListener('click', () => {
                    switchTool(tab.dataset.tool);
                });
            });
            document.querySelectorAll('#pdfEditorAiSubTabs .pdfEditorAiSubTab').forEach((btn) => {
                btn.addEventListener('click', (ev) => {
                    const tabTool = ev.currentTarget?.dataset?.tool;
                    if (!tabTool || ev.currentTarget?.disabled) return;
                    ev.preventDefault();
                    switchTool(tabTool);
                });
            });
            wireSearch();

            let initial = 'select';
            try {
                const params = new URL(window.location.href).searchParams;
                const tool = params.get('tool');
                const mode = params.get('mode');
                if (tool && (panels[tool] || aiPanels.isAiTool(tool))) {
                    initial = tool;
                } else if (mode === 'ai') {
                    initial = aiPanels.resolveEntryTool();
                } else if (tool === 'ai') {
                    initial = aiPanels.resolveEntryTool();
                }
            } catch (_) { /* ignore */ }

            switchTool(initial);
        }

        return { initTabs, onViewerRendered, switchTool, onDocumentLoaded, commitWatermarkDraft };
    }

    global.PdfEditorToolController = { createToolController };
})(typeof window !== 'undefined' ? window : global);
