/**
 * Tool tabs: pages, watermark, redact, signature.
 */
(function (global) {
    function createToolController(ctx) {
        const { model, toolBodyEl, viewerApi, getSelectedPageId, onModelChange, getPdfPage, onGoToPage } =
            ctx;

        let activeTool = 'watermark';
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
                    PdfEditorDocumentModel.removeWatermark(model, layer.id);
                    if (!model.watermarks.length) clearWatermarkImagePreview();
                    onModelChange();
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
                    PdfEditorDocumentModel.removeRedaction(model, r.id);
                    onModelChange();
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
                    PdfEditorDocumentModel.removeSignature(model, s.id);
                    onModelChange();
                    renderSigList();
                });
                list.appendChild(row);
            });
        }

        function syncTabButtons(tool) {
            document.querySelectorAll('.pdfEditorToolTab').forEach((t) => {
                t.classList.toggle('active', t.dataset.tool === tool);
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
                    PdfEditorTextSearch.goToFirstOnPage(p.pageId, (pageId, displayIndex) => {
                        if (onGoToPage) onGoToPage(pageId, displayIndex);
                        updateSearchStatus(PdfEditorTextSearch.getState().count);
                    });
                });
                list.appendChild(row);
            });
        }

        const panels = {
            search: () => `
                <div class="pdfEditorForm">
                    <label class="langText" id="pdfEditorSearchLabel">${msg('pdfEditorSearchLabel', 'Find in document')}</label>
                    <input type="text" id="pdfEditorSearchInput" class="pdfEditorInput" placeholder="${msg('pdfEditorSearchPlaceholder', 'Search text...')}" autocomplete="off">
                    <label class="pdfEditorSearchCheck">
                        <input type="checkbox" id="pdfEditorSearchCase"> ${msg('pdfEditorSearchCase', 'Match case')}
                    </label>
                    <div class="pdfEditorSearchActions">
                        <button type="button" id="pdfEditorSearchBtn" class="pdfEditorPanelBtn langText">${msg('pdfEditorSearchBtn', 'Search')}</button>
                    </div>
                    <div class="pdfEditorSearchNav">
                        <button type="button" id="pdfEditorSearchPrev" class="pdfEditorPanelBtn" title="${msg('pdfEditorSearchPrev', 'Previous')}">‹</button>
                        <button type="button" id="pdfEditorSearchNext" class="pdfEditorPanelBtn" title="${msg('pdfEditorSearchNext', 'Next')}">›</button>
                    </div>
                    <p id="pdfEditorSearchStatus" class="pdfEditorHint pdfEditorSearchStatus"></p>
                    <div id="pdfEditorSearchPages" class="pdfEditorSearchPages"></div>
                </div>`,
            watermark: () => `
                <div class="pdfEditorForm">
                    <label class="langText" id="watermarkTextLabel">${msg('watermarkTextLabel', 'Watermark text')}</label>
                    <input type="text" id="pdfEditorWmText" class="pdfEditorInput" placeholder="${msg('watermarkPlaceholder', 'CONFIDENTIAL')}">
                    <label>${msg('fontSize', 'Font size')}</label>
                    <input type="number" id="pdfEditorWmSize" class="pdfEditorInput" value="48" min="8" max="200">
                    <label>${msg('opacity', 'Opacity')} %</label>
                    <input type="range" id="pdfEditorWmOpacity" min="5" max="100" value="30">
                    <label>${msg('rotation', 'Rotation')}°</label>
                    <input type="number" id="pdfEditorWmRot" class="pdfEditorInput" value="45">
                    <label>${msg('position', 'Position')} X / Y %</label>
                    <div class="pdfEditorRow">
                        <input type="number" id="pdfEditorWmX" class="pdfEditorInput" value="50" min="0" max="100">
                        <input type="number" id="pdfEditorWmY" class="pdfEditorInput" value="50" min="0" max="100">
                    </div>
                    <label>${msg('color', 'Color')}</label>
                    <select id="pdfEditorWmColor" class="pdfEditorInput">
                        <option value="black">Black</option>
                        <option value="gray">Gray</option>
                        <option value="red">Red</option>
                        <option value="#0066cc">Blue</option>
                    </select>
                    <hr>
                    <label class="langText" id="watermarkTypeLabel">${msg('watermarkTypeLabel', 'Image watermark')}</label>
                    <input type="file" id="pdfEditorWmImage" accept="image/png,image/jpeg" class="pdfEditorInput">
                    <label>${msg('scale', 'Scale')} %</label>
                    <input type="number" id="pdfEditorWmImgScale" class="pdfEditorInput" value="50" min="10" max="200">
                    <button type="button" id="pdfEditorWmAddText" class="pdfEditorPanelBtn langText">${msg('addLayerBtnText', 'Add text layer')}</button>
                    <button type="button" id="pdfEditorWmAddImage" class="pdfEditorPanelBtn langText">${msg('pdfEditorWmAddImage', 'Add image layer')}</button>
                    <button type="button" id="pdfEditorWmClearAll" class="pdfEditorPanelBtn pdfEditorPanelBtnDanger langText">${msg('pdfEditorWmClearAll', 'Remove all watermarks')}</button>
                    <div id="pdfEditorWmList" class="pdfEditorList"></div>
                </div>`,
            redact: () => `
                <div class="pdfEditorForm">
                    <p class="pdfEditorHint langText" id="pdfEditorRedactHint">${msg('pdfEditorRedactHint', 'Draw a rectangle on the page preview, or use the button below.')}</p>
                    <label class="langText" id="redactColor">${msg('redactColor', 'Color')}</label>
                    <input type="color" id="pdfEditorRedactColor" value="#000000">
                    <button type="button" id="pdfEditorRedactAdd" class="pdfEditorPanelBtn langText">${msg('addBoxBtn', 'Add box')}</button>
                    <div id="pdfEditorRedactList" class="pdfEditorList"></div>
                </div>`,
            signature: () => `
                <div class="pdfEditorForm">
                    <label><input type="radio" name="pdfEditorSigType" value="text" checked> ${msg('pdfEditorSigText', 'Text')}</label>
                    <label><input type="radio" name="pdfEditorSigType" value="drawing"> ${msg('pdfEditorSigDraw', 'Draw')}</label>
                    <label><input type="radio" name="pdfEditorSigType" value="image"> ${msg('pdfEditorSigImage', 'Image')}</label>
                    <div id="pdfEditorSigTextFields">
                        <input type="text" id="pdfEditorSigText" class="pdfEditorInput" placeholder="${msg('pdfEditorSigName', 'Your name')}">
                    </div>
                    <div id="pdfEditorSigDrawFields" class="pdfEditorHidden">
                        <canvas id="pdfEditorSigCanvas" width="280" height="90"></canvas>
                        <button type="button" id="pdfEditorSigClearDraw" class="pdfEditorPanelBtn langText">${msg('pdfEditorClearDraw', 'Clear')}</button>
                    </div>
                    <div id="pdfEditorSigImageFields" class="pdfEditorHidden">
                        <input type="file" id="pdfEditorSigImage" accept="image/png,image/jpeg" class="pdfEditorInput">
                    </div>
                    <button type="button" id="pdfEditorSigPlace" class="pdfEditorPanelBtn langText">${msg('pdfEditorSigPlace', 'Place on current page')}</button>
                    <div id="pdfEditorSigList" class="pdfEditorList"></div>
                </div>`,
        };

        let wmPreviewImageBytes = null;
        let wmPreviewImageType = null;

        function collectWatermarkDraft() {
            const text = document.getElementById('pdfEditorWmText')?.value.trim();
            const opacity = parseInt(document.getElementById('pdfEditorWmOpacity')?.value, 10) / 100;
            const rotation = parseInt(document.getElementById('pdfEditorWmRot')?.value, 10) || 0;
            const posX = parseInt(document.getElementById('pdfEditorWmX')?.value, 10) || 50;
            const posY = parseInt(document.getElementById('pdfEditorWmY')?.value, 10) || 50;

            if (text) {
                return {
                    type: 'text',
                    text,
                    fontSize: parseInt(document.getElementById('pdfEditorWmSize')?.value, 10) || 48,
                    opacity,
                    rotation,
                    posX,
                    posY,
                    color: document.getElementById('pdfEditorWmColor')?.value,
                    isDraft: true,
                };
            }
            if (wmPreviewImageBytes) {
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
            return null;
        }

        function refreshWatermarkPreview() {
            PdfEditorOverlayManager.setWatermarkDraft(collectWatermarkDraft());
            PdfEditorOverlayManager.syncOverlays(model, viewerApi);
        }

        function clearWatermarkImagePreview() {
            wmPreviewImageBytes = null;
            wmPreviewImageType = null;
            const fileInput = document.getElementById('pdfEditorWmImage');
            if (fileInput) fileInput.value = '';
        }

        function wireWatermark() {
            const previewIds = [
                'pdfEditorWmText',
                'pdfEditorWmSize',
                'pdfEditorWmOpacity',
                'pdfEditorWmRot',
                'pdfEditorWmX',
                'pdfEditorWmY',
                'pdfEditorWmColor',
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
                PdfEditorDocumentModel.addWatermark(model, {
                    type: 'text',
                    text,
                    fontSize: parseInt(document.getElementById('pdfEditorWmSize').value, 10) || 48,
                    opacity: parseInt(document.getElementById('pdfEditorWmOpacity').value, 10) / 100,
                    rotation: parseInt(document.getElementById('pdfEditorWmRot').value, 10) || 0,
                    posX: parseInt(document.getElementById('pdfEditorWmX').value, 10) || 50,
                    posY: parseInt(document.getElementById('pdfEditorWmY').value, 10) || 50,
                    color: document.getElementById('pdfEditorWmColor').value,
                });
                onModelChange();
                renderWatermarkList();
                refreshWatermarkPreview();
            });

            document.getElementById('pdfEditorWmClearAll')?.addEventListener('click', () => {
                const hadLayers = model.watermarks.length > 0;
                const hadDraft = !!collectWatermarkDraft();
                if (!hadLayers && !hadDraft) return;

                PdfEditorDocumentModel.clearAllWatermarks(model);
                clearWatermarkImagePreview();
                const textInput = document.getElementById('pdfEditorWmText');
                if (textInput) textInput.value = '';
                PdfEditorOverlayManager.setWatermarkDraft(null);
                if (hadLayers) onModelChange();
                else refreshWatermarkPreview();
                renderWatermarkList();
            });

            document.getElementById('pdfEditorWmAddImage')?.addEventListener('click', async () => {
                const fileInput = document.getElementById('pdfEditorWmImage');
                const file = fileInput.files?.[0];
                if (!file) return;
                const bytes = new Uint8Array(await file.arrayBuffer());
                PdfEditorDocumentModel.addWatermark(model, {
                    type: 'image',
                    imageBytes: bytes,
                    imageMediaType: file.type,
                    imageScale: parseInt(document.getElementById('pdfEditorWmImgScale').value, 10) || 50,
                    opacity: parseInt(document.getElementById('pdfEditorWmOpacity').value, 10) / 100,
                    rotation: parseInt(document.getElementById('pdfEditorWmRot').value, 10) || 0,
                    posX: parseInt(document.getElementById('pdfEditorWmX').value, 10) || 50,
                    posY: parseInt(document.getElementById('pdfEditorWmY').value, 10) || 50,
                });
                clearWatermarkImagePreview();
                onModelChange();
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
                        onModelChange();
                        renderRedactList();
                    });
                }
            });
            renderRedactList();
        }

        async function performSearch() {
            const input = document.getElementById('pdfEditorSearchInput');
            const q = input?.value?.trim() || '';
            const caseBox = document.getElementById('pdfEditorSearchCase');
            PdfEditorTextSearch.setCaseSensitive(caseBox?.checked || false);

            const zoom = viewerApi?.getZoomPercent?.() ?? 100;
            const { count } = await PdfEditorTextSearch.runSearch(model, getPdfPage, zoom, q);
            updateSearchStatus(count);
            renderSearchPageList();

            if (count > 0) {
                const m = PdfEditorTextSearch.getCurrentMatch();
                if (m && onGoToPage) onGoToPage(m.pageId, m.displayIndex);
            }
        }

        function wireSearch() {
            const input = document.getElementById('pdfEditorSearchInput');
            const searchBtn = document.getElementById('pdfEditorSearchBtn');
            const prevBtn = document.getElementById('pdfEditorSearchPrev');
            const nextBtn = document.getElementById('pdfEditorSearchNext');
            const caseBox = document.getElementById('pdfEditorSearchCase');

            searchBtn?.addEventListener('click', () => performSearch());
            input?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        PdfEditorTextSearch.goToPrev((pageId, displayIndex) => {
                            if (onGoToPage) onGoToPage(pageId, displayIndex);
                            updateSearchStatus(PdfEditorTextSearch.getState().count);
                        });
                    } else {
                        const st = PdfEditorTextSearch.getState();
                        if (st.count > 0) {
                            PdfEditorTextSearch.goToNext((pageId, displayIndex) => {
                                if (onGoToPage) onGoToPage(pageId, displayIndex);
                                updateSearchStatus(st.count);
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
                PdfEditorTextSearch.goToPrev((pageId, displayIndex) => {
                    if (onGoToPage) onGoToPage(pageId, displayIndex);
                    updateSearchStatus(PdfEditorTextSearch.getState().count);
                });
            });

            nextBtn?.addEventListener('click', () => {
                PdfEditorTextSearch.goToNext((pageId, displayIndex) => {
                    if (onGoToPage) onGoToPage(pageId, displayIndex);
                    updateSearchStatus(PdfEditorTextSearch.getState().count);
                });
            });

            const st = PdfEditorTextSearch.getState();
            if (st.query && input) {
                input.value = st.query;
                updateSearchStatus(st.count);
            }
        }

        function wireSignature() {
            const canvas = document.getElementById('pdfEditorSigCanvas');
            const ctx = canvas?.getContext('2d');
            if (ctx) {
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                let drawing = false;
                canvas.addEventListener('mousedown', (e) => {
                    drawing = true;
                    const r = canvas.getBoundingClientRect();
                    ctx.beginPath();
                    ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
                });
                canvas.addEventListener('mouseup', () => { drawing = false; });
                canvas.addEventListener('mouseleave', () => { drawing = false; });
                canvas.addEventListener('mousemove', (e) => {
                    if (!drawing) return;
                    const r = canvas.getBoundingClientRect();
                    const x = e.clientX - r.left;
                    const y = e.clientY - r.top;
                    ctx.lineTo(x, y);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                });
            }

            document.getElementById('pdfEditorSigClearDraw')?.addEventListener('click', () => {
                if (!ctx || !canvas) return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            });

            document.querySelectorAll('input[name="pdfEditorSigType"]').forEach((radio) => {
                radio.addEventListener('change', () => {
                    const v = document.querySelector('input[name="pdfEditorSigType"]:checked')?.value;
                    document.getElementById('pdfEditorSigTextFields').classList.toggle('pdfEditorHidden', v !== 'text');
                    document.getElementById('pdfEditorSigDrawFields').classList.toggle('pdfEditorHidden', v !== 'drawing');
                    document.getElementById('pdfEditorSigImageFields').classList.toggle('pdfEditorHidden', v !== 'image');
                });
            });

            document.getElementById('pdfEditorSigPlace')?.addEventListener('click', async () => {
                const pageId = getSelectedPageId();
                if (!pageId) return;
                const type = document.querySelector('input[name="pdfEditorSigType"]:checked')?.value;
                let payload = { type };

                if (type === 'text') {
                    payload.text = document.getElementById('pdfEditorSigText').value.trim() || 'Signature';
                    payload.fontSize = 22;
                    payload.color = '#000000';
                } else if (type === 'drawing' && canvas) {
                    const dataUrl = canvas.toDataURL('image/png');
                    const bin = atob(dataUrl.split(',')[1]);
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    payload.pngBytes = bytes;
                } else if (type === 'image') {
                    const file = document.getElementById('pdfEditorSigImage').files?.[0];
                    if (!file) return;
                    payload.pngBytes = new Uint8Array(await file.arrayBuffer());
                }

                PdfEditorOverlayManager.placeSignatureOnPage(model, pageId, payload, viewerApi, () => {
                    onModelChange();
                    renderSigList();
                    if (type === 'drawing' && ctx && canvas) {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }
                });
            });
            renderSigList();
        }

        function switchTool(tool) {
            activeTool = tool;
            syncTabButtons(tool);

            const mode =
                tool === 'redact' ? 'redact' : tool === 'signature' ? 'signature' : 'none';
            PdfEditorOverlayManager.setMode(mode);
            if (tool !== 'watermark') {
                PdfEditorOverlayManager.setWatermarkDraft(null);
            }
            if (tool !== 'search') {
                PdfEditorTextSearch.clear();
            }

            toolBodyEl.innerHTML = panels[tool] ? panels[tool]() : '';
            if (typeof window.applyLanguage === 'function') window.applyLanguage();

            if (tool === 'search') wireSearch();
            if (tool === 'watermark') wireWatermark();
            if (tool === 'redact') wireRedact();
            if (tool === 'signature') wireSignature();

            PdfEditorOverlayManager.syncOverlays(model, viewerApi);
            if (tool === 'search' && PdfEditorTextSearch.getState().query) {
                performSearch();
            }
        }

        function onViewerRendered() {
            PdfEditorOverlayManager.bindAllRedactLayers(model, viewerApi, () => {
                onModelChange();
                if (activeTool === 'redact') renderRedactList();
            });
            PdfEditorOverlayManager.syncOverlays(model, viewerApi);
            if (activeTool === 'search' && PdfEditorTextSearch.getState().query) {
                const zoom = viewerApi?.getZoomPercent?.() ?? 100;
                PdfEditorTextSearch.runSearch(model, getPdfPage, zoom, PdfEditorTextSearch.getState().query).then(
                    ({ count }) => {
                        updateSearchStatus(count);
                        renderSearchPageList();
                    }
                );
            }
        }

        function onDocumentLoaded() {
            PdfEditorTextSearch.clear();
            switchTool(activeTool);
        }

        function initTabs() {
            PdfEditorOverlayManager.setupGlobalListeners();
            PdfEditorOverlayManager.setOverlayChangeHandler(() => {
                onModelChange();
            });
            document.querySelectorAll('.pdfEditorToolTab').forEach((tab) => {
                tab.addEventListener('click', () => {
                    switchTool(tab.dataset.tool);
                });
            });
            switchTool('watermark');
        }

        return { initTabs, onViewerRendered, switchTool, onDocumentLoaded };
    }

    global.PdfEditorToolController = { createToolController };
})(typeof window !== 'undefined' ? window : global);
