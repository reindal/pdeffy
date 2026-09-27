/**
 * AI tool panels for the unified PDF editor (summary / anonymize / questions).
 */
(function (global) {
    const AI_TOOLS = new Set(['summary', 'anonymize', 'questions']);
    const LAST_AI_TOOL_KEY = 'pdeffy.pdfEditor.lastAiTool';

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

    function getLastAiTool() {
        try {
            const t = sessionStorage.getItem(LAST_AI_TOOL_KEY);
            if (t && AI_TOOLS.has(t)) return t;
        } catch (_) { /* ignore */ }
        return 'summary';
    }

    function saveLastAiTool(tool) {
        if (!AI_TOOLS.has(tool)) return;
        try {
            sessionStorage.setItem(LAST_AI_TOOL_KEY, tool);
        } catch (_) { /* ignore */ }
    }

    function createAiPanels(ctx) {
        const { getFilePath, getStatusSelector, getModel, getPdfPage, onEntitiesChanged, onGoToPage } = ctx;
        const anonymizePanel = global.PdfEditorAnonymizePanel?.createAnonymizePanel({
            getFilePath,
            getStatusSelector,
            getModel,
            getPdfPage,
            onEntitiesChanged,
            onGoToPage,
        });
        const STATUS = getStatusSelector?.() || '#pdfEditorStatus';

        let modelReady = false;
        let summaryWired = false;
        let activeContainer = null;

        function isAiTool(tool) {
            return AI_TOOLS.has(tool);
        }

        function resolveEntryTool() {
            return getLastAiTool();
        }

        function summaryPanelHtml() {
            return `
                <div class="aiPanel aiPanelSummary is-ai-panel-visible" data-ai-panel="summary" data-ai="summary">
                  <div class="aiPanelScroll aiPanelScrollFill">
                    <p class="aiPanelLead langText" id="assistenteSummaryLead">${msg('assistenteSummaryLead', 'Genera un riassunto del documento con AI locale.')}</p>
                    <div class="aiSummaryOptions">
                      <label class="aiSummaryField">
                        <span class="langText" data-i18n="assistenteSummaryLength">${msg('assistenteSummaryLength', 'Lunghezza')}</span>
                        <select id="pdfEditorSummaryLength" class="pdfEditorInput aiSummarySelect">
                          <option value="short" class="langText" data-i18n="assistenteSummaryLengthShort">${msg('assistenteSummaryLengthShort', 'Breve')}</option>
                          <option value="medium" selected class="langText" data-i18n="assistenteSummaryLengthMedium">${msg('assistenteSummaryLengthMedium', 'Media')}</option>
                          <option value="long" class="langText" data-i18n="assistenteSummaryLengthLong">${msg('assistenteSummaryLengthLong', 'Dettagliata')}</option>
                        </select>
                      </label>
                      <label class="aiSummaryField">
                        <span class="langText" data-i18n="assistenteSummaryScope">${msg('assistenteSummaryScope', 'Ambito pagine')}</span>
                        <select id="pdfEditorSummaryScope" class="pdfEditorInput aiSummarySelect">
                          <option value="all" selected class="langText" data-i18n="assistenteSummaryScopeAll">${msg('assistenteSummaryScopeAll', 'Intero documento')}</option>
                          <option value="current" class="langText" data-i18n="assistenteSummaryScopeCurrent">${msg('assistenteSummaryScopeCurrent', 'Pagina corrente')}</option>
                        </select>
                      </label>
                      <label class="aiSummaryField">
                        <span class="langText" data-i18n="assistenteSummaryFormat">${msg('assistenteSummaryFormat', 'Formato')}</span>
                        <select id="pdfEditorSummaryFormat" class="pdfEditorInput aiSummarySelect">
                          <option value="paragraphs" selected class="langText" data-i18n="assistenteSummaryFormatParagraphs">${msg('assistenteSummaryFormatParagraphs', 'Paragrafi')}</option>
                          <option value="bullets" class="langText" data-i18n="assistenteSummaryFormatBullets">${msg('assistenteSummaryFormatBullets', 'Elenco puntato')}</option>
                        </select>
                      </label>
                    </div>
                    <div id="pdfEditorAiModelNotice" class="aiNotice" hidden>
                      <p class="langText" id="summarizeNeedModel">${msg('summarizeNeedModel', 'Scarica un modello AI dalle Impostazioni.')}</p>
                      <a class="pdeffy-btn pdeffy-btn-ghost langText" href="../settings/settings.html" id="summarizeOpenSettingsBtn">${msg('summarizeOpenSettingsBtn', 'Apri Impostazioni')}</a>
                    </div>
                    <textarea id="pdfEditorAiSummaryText" class="aiTextarea aiTextareaFill" readonly placeholder="…"></textarea>
                  </div>
                  <div class="aiPanelFooter">
                    <button type="button" id="assistenteSummarizeBtn" class="pdeffy-btn pdeffy-btn-primary aiFullBtn langText" disabled>${msg('summarizeSubmitBtn', 'Genera sommario')}</button>
                    <button type="button" id="assistenteCopySummary" class="pdeffy-btn pdeffy-btn-ghost aiFullBtn langText" hidden>${msg('summarizeCopyBtn', 'Copia')}</button>
                  </div>
                </div>`;
        }

        function questionsPanelHtml() {
            return `
                <div class="aiPanel aiPanelQuestions" data-ai-panel="questions" hidden>
                  <div class="aiPanelScroll">
                    <p class="aiPanelLead langText" id="pdfEditorQuestionsComingSoon">${msg('pdfEditorQuestionsComingSoon', 'Le domande sul documento arriveranno a breve.')}</p>
                  </div>
                </div>`;
        }

        function ensureRoot(containerEl) {
            if (containerEl.querySelector('.aiPanelsRoot')) return;
            const anonHtml = anonymizePanel
                ? anonymizePanel.panelHtml()
                : '<div class="aiPanel" data-ai-panel="anonymize" hidden></div>';
            containerEl.innerHTML = `
              <div class="aiPanelsRoot">
                ${summaryPanelHtml()}
                ${anonHtml}
                ${questionsPanelHtml()}
              </div>`;
            activeContainer = containerEl;
            wireSummaryOnce();
            showPanel(containerEl, getLastAiTool());
        }

        async function refreshModelStatus() {
            try {
                const { ipcRenderer } = require('electron');
                const status = await ipcRenderer.invoke('get-model-status');
                modelReady = Boolean(status?.downloaded) && !status?.downloading;
            } catch (_) {
                modelReady = false;
            }
            const notice = document.getElementById('pdfEditorAiModelNotice');
            if (notice) notice.hidden = modelReady;
            const btn = document.getElementById('assistenteSummarizeBtn');
            if (btn) btn.disabled = !(getFilePath?.() && modelReady);
        }

        function wireSummaryOnce() {
            if (summaryWired) return;
            summaryWired = true;
            refreshModelStatus();
            document.getElementById('assistenteSummarizeBtn')?.addEventListener('click', async () => {
                const pdfPath = getFilePath?.();
                if (!pdfPath) {
                    StatusManager.show(STATUS, 'error', 'pleaseSelectFile');
                    return;
                }
                if (!modelReady) {
                    StatusManager.show(STATUS, 'error', 'summarizeNeedModel');
                    return;
                }
                const btn = document.getElementById('assistenteSummarizeBtn');
                btn.disabled = true;
                StatusManager.show(STATUS, 'processing', 'summarizeWorking');
                try {
                    const { ipcRenderer } = require('electron');
                    const summary = await ipcRenderer.invoke('summarize-pdf', { path: pdfPath });
                    const ta = document.getElementById('pdfEditorAiSummaryText');
                    ta.value = typeof summary === 'string' ? summary : String(summary ?? '');
                    const copy = document.getElementById('assistenteCopySummary');
                    if (copy) copy.hidden = false;
                    StatusManager.show(STATUS, 'success', 'summarizeDone');
                } catch (err) {
                    StatusManager.show(STATUS, 'error', formatInvokeError(err));
                } finally {
                    btn.disabled = !(getFilePath?.() && modelReady);
                }
            });
            document.getElementById('assistenteCopySummary')?.addEventListener('click', async () => {
                const ta = document.getElementById('pdfEditorAiSummaryText');
                try {
                    await navigator.clipboard.writeText(ta.value);
                    StatusManager.show(STATUS, 'success', 'summarizeCopied');
                } catch (_) {
                    StatusManager.show(STATUS, 'error', 'copyFailed');
                }
            });
        }

        function showPanel(containerEl, tool) {
            const host = containerEl || activeContainer;
            if (!host) return;
            const root = host.querySelector('.aiPanelsRoot');
            if (!root) return;
            for (const panel of root.children) {
                if (!panel.dataset?.aiPanel) continue;
                const on = panel.dataset.aiPanel === tool;
                panel.classList.toggle('is-ai-panel-visible', on);
                if (on) panel.removeAttribute('hidden');
                else panel.setAttribute('hidden', '');
            }
        }

        function setAnonymizeChrome(active) {
            document.body.classList.toggle('pdfEditorAiAnonymizeTab', active);
            document.body.classList.remove('pdfEditorAnonInspector');
        }

        function activate(containerEl, tool) {
            if (!containerEl || !AI_TOOLS.has(tool)) return;
            saveLastAiTool(tool);
            ensureRoot(containerEl);
            activeContainer = containerEl;
            showPanel(containerEl, tool);

            const privacy = document.getElementById('pdfEditorAiPrivacyBadge');
            if (privacy) privacy.hidden = false;

            if (tool === 'summary' || tool === 'questions') {
                setAnonymizeChrome(false);
                if (typeof global.__pdfEditorSetAnonDualView === 'function') {
                    global.__pdfEditorSetAnonDualView(false);
                }
                if (tool === 'summary') refreshModelStatus();
                return;
            }

            if (tool === 'anonymize') {
                setAnonymizeChrome(true);
                if (typeof global.__pdfEditorSetAnonDualView === 'function') {
                    global.__pdfEditorSetAnonDualView(true);
                }
                anonymizePanel?.mount();
                if (typeof global.__pdfEditorRefreshAiHighlights === 'function') {
                    global.__pdfEditorRefreshAiHighlights();
                }
            }
        }

        /** @deprecated use activate */
        function panelHtml(tool) {
            const el = activeContainer || document.getElementById('pdfEditorToolBody');
            if (el) {
                ensureRoot(el);
                showPanel(el, tool);
            }
            return el?.innerHTML || '';
        }

        function mount(tool) {
            if (activeContainer) activate(activeContainer, tool);
        }

        function onDocumentLoaded() {
            anonymizePanel?.onDocumentLoaded();
            if (typeof global.__pdfEditorSetAnonDualView === 'function') {
                global.__pdfEditorSetAnonDualView(false);
            }
            document.body.classList.remove('pdfEditorAiAnonymizeTab', 'pdfEditorAnonInspector', 'pdfEditorAnonSeqMode');
            refreshModelStatus();
        }

        function onLeaveAiTools() {
            document.body.classList.remove('pdfEditorAiAnonymizeTab', 'pdfEditorAnonInspector', 'pdfEditorAnonSeqMode');
            const privacy = document.getElementById('pdfEditorAiPrivacyBadge');
            if (privacy) privacy.hidden = true;
            if (typeof global.__pdfEditorSetAnonDualView === 'function') {
                global.__pdfEditorSetAnonDualView(false);
            }
            global.__pdfEditorAnonPreviewOnPdf = false;
        }

        return {
            isAiTool,
            resolveEntryTool,
            saveLastAiTool,
            getLastAiTool,
            activate,
            panelHtml,
            mount,
            onDocumentLoaded,
            onLeaveAiTools,
            refreshModelStatus,
            AI_TOOLS,
            LAST_AI_TOOL_KEY,
        };
    }

    global.PdfEditorAiPanels = { createAiPanels, AI_TOOLS };
})(typeof window !== 'undefined' ? window : global);
