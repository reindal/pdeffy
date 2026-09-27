/**
 * Preview overlays: watermarks, redaction boxes, signatures (move + resize).
 */
(function (global) {
    let activeMode = 'none';
    /** @type {'text'|'check'|'radio'} */
    let activeManualFormTool = 'text';
    let activeManualFormFramed = true;
    let activeManualFormStyle = {
        framed: true,
        fontSize: 12,
        color: '#000000',
    };
    let activeRedactColor = '#000000';
    let activeInkColor = '#e53935';
    let activeInkWidth = 2.5;
    let activeInkShape = 'freehand';
    let watermarkDraft = null;
    let dragState = null;
    let inkStroke = null;
    /** Polygon-in-progress: { pageId, points, color, width } */
    let polygonDraft = null;
    let overlayChangeHandler = null;
    const imageCache = new Map();
    let syncToken = 0;
    let commentCreateModel = null;
    let commentCreateOnChange = null;
    let commentCreateBusy = false;
    /** Ignore page-create clicks briefly after interacting with a pin. */
    let ignoreCommentCreateUntil = 0;
    /** Active pin press: { id, startX, startY, origX, origY, moved, pointerId, pinEl } */
    let pinGesture = null;

    const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const MIN_BOX_PX = 24;

    function getOverlaySize(overlay) {
        // Prefer CSS box of the overlay (matches visual canvas after max-width scaling).
        const w = overlay.clientWidth;
        const h = overlay.clientHeight;
        if (w > 1 && h > 1) return { w, h };
        const canvas = overlay.parentElement?.querySelector('canvas');
        if (canvas) {
            return {
                w: canvas.clientWidth || canvas.width || 1,
                h: canvas.clientHeight || canvas.height || 1,
            };
        }
        return { w: 1, h: 1 };
    }

    function getPdfScale(overlay) {
        const { w } = getOverlaySize(overlay);
        const frame = overlay.closest('.pdfEditorPageFrame');
        const pdfW = parseFloat(frame?.dataset.pdfWidth);
        if (pdfW > 0) return w / pdfW;
        return 1;
    }

    function normToPx(rect, w, h) {
        return {
            left: rect.x * w,
            top: rect.y * h,
            width: rect.width * w,
            height: rect.height * h,
        };
    }

    function pxToNorm(left, top, width, height, w, h) {
        return {
            x: left / w,
            y: top / h,
            width: width / w,
            height: height / h,
        };
    }

    function watermarkColorCss(layer) {
        if (typeof layer.color === 'string' && layer.color.startsWith('#')) return layer.color;
        const map = {
            red: '#CC0000',
            gray: '#808080',
            black: '#000000',
            blue: '#0066cc',
            green: '#009900',
        };
        return map[layer.color] || '#000000';
    }

    function loadImageFromBytes(bytes, mediaType) {
        const key = bytes.length + '_' + (bytes[0] || 0) + '_' + (bytes[bytes.length - 1] || 0);
        if (imageCache.has(key)) return imageCache.get(key);
        const blob = new Blob([bytes], { type: mediaType || 'image/png' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        const promise = new Promise((resolve, reject) => {
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
        imageCache.set(key, promise);
        return promise;
    }

    async function renderWatermarkOnLayer(layer, wm, w, h, isDraft) {
        const pdfScale = getPdfScale(layer);
        const cx = (wm.posX / 100) * w;
        const cy = (1 - wm.posY / 100) * h;
        const el = document.createElement('div');
        el.className = 'pdfEditorWatermarkItem' + (isDraft ? ' pdfEditorWatermarkDraft' : '');
        el.style.left = `${cx}px`;
        el.style.top = `${cy}px`;
        el.style.opacity = String(wm.opacity ?? 0.3);
        el.style.transform = `translate(-50%, -50%) rotate(${-(wm.rotation || 0)}deg)`;
        if (wm.id && !isDraft) {
            el.dataset.id = wm.id;
            wireSelectable(el, 'watermark', wm.id);
        }

        if (wm.type === 'image' && wm.imageBytes) {
            try {
                const img = await loadImageFromBytes(wm.imageBytes, wm.imageMediaType);
                const scale = (wm.imageScale || 50) / 100;
                const iw = img.naturalWidth * scale * pdfScale;
                const ih = img.naturalHeight * scale * pdfScale;
                const imgEl = document.createElement('img');
                imgEl.src = img.src;
                imgEl.alt = '';
                imgEl.style.width = `${iw}px`;
                imgEl.style.height = `${ih}px`;
                el.appendChild(imgEl);
            } catch {
                /* skip broken image */
            }
        } else if (wm.type === 'text' && wm.text) {
            const fs = (wm.fontSize || 48) * pdfScale;
            el.style.fontSize = `${fs}px`;
            el.style.fontWeight = 'bold';
            el.style.color = watermarkColorCss(wm);
            el.style.whiteSpace = 'nowrap';
            el.textContent = wm.text;
        } else {
            return;
        }

        layer.appendChild(el);
    }

    async function renderWatermarksForPage(layer, model, w, h) {
        const wmLayer = document.createElement('div');
        wmLayer.className = 'pdfEditorWatermarkLayer';
        layer.appendChild(wmLayer);

        const layers = [...(model.watermarks || [])];
        if (watermarkDraft) layers.push({ ...watermarkDraft, isDraft: true });

        for (const wm of layers) {
            await renderWatermarkOnLayer(wmLayer, wm, w, h, !!wm.isDraft);
        }
    }

    function syncOverlays(model, viewerApi) {
        if (model) commentCreateModel = model;
        const token = ++syncToken;
        document.querySelectorAll('.pdfEditorOverlayLayer').forEach((layer) => {
            layer.innerHTML = '';
            layer.classList.remove(
                'pdfEditorOverlayActive',
                'pdfEditorOverlaySigActive',
                'pdfEditorOverlayDrawActive',
                'pdfEditorOverlayCommentActive',
                'pdfEditorOverlayFormActive'
            );
            if (activeMode === 'redact') layer.classList.add('pdfEditorOverlayActive');
            if (activeMode === 'signature') layer.classList.add('pdfEditorOverlaySigActive');
            if (activeMode === 'draw') layer.classList.add('pdfEditorOverlayDrawActive');
            if (activeMode === 'comment') layer.classList.add('pdfEditorOverlayCommentActive');
            if (activeMode === 'form') layer.classList.add('pdfEditorOverlayFormActive');
        });

        const tasks = [];
        document.querySelectorAll('.pdfEditorOverlayLayer').forEach((layer) => {
            const { w, h } = getOverlaySize(layer);
            tasks.push(renderWatermarksForPage(layer, model, w, h));
        });

        Promise.all(tasks).then(() => {
            if (token !== syncToken) return;
            (model.redactions || []).forEach((r) => {
                const layer = viewerApi.getOverlayLayer(r.pageId);
                if (!layer) return;
                renderRedactBox(layer, r, model);
            });

            (model.markups || []).forEach((m) => {
                const layer = viewerApi.getOverlayLayer(m.pageId);
                if (!layer) return;
                renderMarkup(layer, m);
            });

            (model.inks || []).forEach((ink) => {
                const layer = viewerApi.getOverlayLayer(ink.pageId);
                if (!layer) return;
                renderInk(layer, ink, model);
            });

            (model.comments || []).forEach((c) => {
                const layer = viewerApi.getOverlayLayer(c.pageId);
                if (!layer) return;
                renderComment(layer, c, model);
            });

            (model.signatures || []).forEach((s) => {
                const layer = viewerApi.getOverlayLayer(s.pageId);
                if (!layer) return;
                renderSignatureMarker(layer, s, model);
            });

            (model.formFields || []).forEach((field) => {
                const layer = viewerApi.getOverlayLayer(field.pageId);
                if (!layer) return;
                renderFormField(layer, field, model);
            });

            (model.manualFormFills || []).forEach((entry) => {
                const layer = viewerApi.getOverlayLayer(entry.pageId);
                if (!layer) return;
                renderManualFormFill(layer, entry, model);
            });

            if (polygonDraft?.pageId) {
                const layer = viewerApi.getOverlayLayer(polygonDraft.pageId);
                if (layer) renderPolygonPreview(layer, null);
            }
            applySelectionHighlight();
        });
    }

    function toolForAnnotationType(type) {
        if (type === 'signature') return 'signature';
        if (type === 'redact') return 'redact';
        if (type === 'watermark') return 'watermark';
        if (type === 'ink') return 'draw';
        if (type === 'comment') return 'comment';
        if (type === 'form') return 'form';
        return null;
    }

    function modeForAnnotationType(type) {
        if (type === 'signature') return 'signature';
        if (type === 'redact') return 'redact';
        if (type === 'ink') return 'draw';
        if (type === 'comment') return 'comment';
        if (type === 'form') return 'form';
        return 'none';
    }

    function notifyFormValueChange() {
        if (typeof global.__pdfEditorBeforeEdit === 'function') {
            // history recorded by callers that mutate before notify
        }
        if (overlayChangeHandler) overlayChangeHandler();
    }

    function renderFormField(layer, field, model) {
        const { w, h } = getOverlaySize(layer);
        const px = normToPx(field, w, h);
        const wrap = document.createElement('div');
        wrap.className = `pdfEditorFormField pdfEditorFormField--${field.type}`;
        wrap.dataset.annType = 'form';
        wrap.dataset.annId = field.id;
        wrap.dataset.fieldName = field.name;
        wrap.style.left = `${px.left}px`;
        wrap.style.top = `${px.top}px`;
        wrap.style.width = `${Math.max(px.width, 12)}px`;
        wrap.style.height = `${Math.max(px.height, 12)}px`;
        if (field.readOnly) wrap.classList.add('is-readonly');
        if (activeMode === 'form') wrap.classList.add('is-interactive');

        const FF = global.PdfEditorFormFields;
        const value = FF?.getFormValue(model, field.name);

        const wireFormToggle = (btn, onActivate) => {
            const run = (e) => {
                e.preventDefault();
                e.stopPropagation();
                onActivate();
            };
            btn.addEventListener('pointerdown', run);
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        };

        if (field.type === 'checkbox') {
            const checked = FF?.isCheckboxChecked(model, field);
            wrap.classList.toggle('is-checked', !!checked);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pdfEditorFormCheck';
            btn.setAttribute('aria-checked', checked ? 'true' : 'false');
            btn.setAttribute('aria-label', field.altText || field.name);
            btn.disabled = !!field.readOnly || activeMode !== 'form';
            btn.innerHTML =
                '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            wireFormToggle(btn, () => {
                if (field.readOnly || activeMode !== 'form') return;
                if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                FF.setFormValue(model, field.name, !FF.isCheckboxChecked(model, field));
                notifyFormValueChange();
            });
            wrap.appendChild(btn);
        } else if (field.type === 'radio') {
            const selected = FF?.isRadioSelected(model, field);
            wrap.classList.toggle('is-checked', !!selected);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pdfEditorFormRadio';
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', selected ? 'true' : 'false');
            btn.setAttribute('aria-label', field.altText || `${field.name}: ${field.buttonValue || ''}`);
            btn.disabled = !!field.readOnly || activeMode !== 'form';
            const radioValue = field.exportValue ?? field.buttonValue ?? '';
            wireFormToggle(btn, () => {
                if (field.readOnly || activeMode !== 'form') return;
                if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                FF.setFormValue(model, field.name, radioValue);
                notifyFormValueChange();
            });
            wrap.appendChild(btn);
        } else if (field.type === 'dropdown' || field.type === 'listbox') {
            const select = document.createElement('select');
            select.className = 'pdfEditorFormSelect';
            select.disabled = !!field.readOnly || activeMode !== 'form';
            select.setAttribute('aria-label', field.altText || field.name);
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
            select.value = value == null ? '' : String(value);
            select.addEventListener('mousedown', (e) => e.stopPropagation());
            select.addEventListener('click', (e) => e.stopPropagation());
            select.addEventListener('change', () => {
                if (field.readOnly || activeMode !== 'form') return;
                if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                FF.setFormValue(model, field.name, select.value);
                notifyFormValueChange();
            });
            wrap.appendChild(select);
        } else {
            // text
            if (field.multiLine) wrap.classList.add('pdfEditorFormField--textBox');
            const input = document.createElement(field.multiLine ? 'textarea' : 'input');
            if (!field.multiLine) input.type = 'text';
            input.className = field.multiLine
                ? 'pdfEditorFormText pdfEditorFormTextMultiline'
                : 'pdfEditorFormText';
            if (field.multiLine) input.setAttribute('rows', '1');
            input.value = value == null ? '' : String(value);
            input.disabled = !!field.readOnly || activeMode !== 'form';
            input.setAttribute('aria-label', field.altText || field.name);
            if (field.maxLen && field.maxLen > 0) input.maxLength = field.maxLen;
            input.addEventListener('mousedown', (e) => e.stopPropagation());
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('pointerdown', (e) => e.stopPropagation());
            let committed = input.value;
            const commit = () => {
                if (field.readOnly || activeMode !== 'form') return;
                if (input.value === committed) return;
                if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                FF.setFormValue(model, field.name, input.value);
                committed = input.value;
                notifyFormValueChange();
            };
            input.addEventListener('change', commit);
            input.addEventListener('blur', commit);
            wrap.appendChild(input);
        }

        layer.appendChild(wrap);
    }

    function renderManualFormFill(layer, entry, model) {
        const { w, h } = getOverlaySize(layer);
        const px = normToPx(entry, w, h);
        const wrap = document.createElement('div');
        wrap.className = `pdfEditorManualFormField pdfEditorManualFormField--${entry.type}`;
        wrap.dataset.annType = 'manualForm';
        wrap.dataset.annId = entry.id;
        wrap.style.left = `${px.left}px`;
        wrap.style.top = `${px.top}px`;
        wrap.style.width = `${Math.max(px.width, 8)}px`;
        wrap.style.height = `${Math.max(px.height, 8)}px`;
        if (activeMode === 'form') wrap.classList.add('is-interactive');

        const wireManualToggle = (btn, onActivate) => {
            const run = (e) => {
                e.preventDefault();
                e.stopPropagation();
                onActivate();
            };
            btn.addEventListener('pointerdown', run);
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        };

        const framed = entry.framed !== false;
        wrap.classList.toggle('is-framed', framed);
        wrap.classList.toggle('is-mark-only', !framed);

        if (entry.type === 'check' || entry.type === 'radio') {
            wrap.classList.toggle('is-checked', entry.checked !== false);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = entry.type === 'radio' ? 'pdfEditorFormRadio' : 'pdfEditorFormCheck';
            btn.classList.toggle('is-mark-only', !framed);
            btn.setAttribute('aria-label', entry.type === 'radio' ? 'Radio' : 'Check');
            if (entry.type === 'check') {
                btn.innerHTML =
                    '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            }
            const markColor = entry.color || '#000000';
            btn.style.color = markColor;
            if (framed) btn.style.borderColor = markColor;
            wireManualToggle(btn, () => {
                if (activeMode !== 'form') return;
                const current = (model.manualFormFills || []).find((x) => x.id === entry.id);
                if (!current) return;
                if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                global.PdfEditorDocumentModel.updateManualFormFill(model, entry.id, {
                    checked: current.checked === false,
                });
                notifyFormValueChange();
            });
            wrap.appendChild(btn);
        } else {
            wrap.classList.add('pdfEditorManualFormField--textBox');
            const input = document.createElement('textarea');
            input.className = 'pdfEditorFormText pdfEditorFormTextMultiline';
            input.value = entry.text || '';
            input.disabled = activeMode !== 'form';
            input.setAttribute('rows', '1');
            input.setAttribute('aria-label', 'Text');
            input.addEventListener('mousedown', (e) => e.stopPropagation());
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('pointerdown', (e) => e.stopPropagation());
            let committed = input.value;
            const commit = () => {
                if (activeMode !== 'form') return;
                if (input.value === committed) return;
                if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                global.PdfEditorDocumentModel.updateManualFormFill(model, entry.id, {
                    text: input.value,
                });
                committed = input.value;
                notifyFormValueChange();
            };
            input.addEventListener('change', commit);
            input.addEventListener('blur', commit);
            const pdfScale = getPdfScale(layer) || 1;
            const fontPx = Math.max(8, (entry.fontSize || 12) * pdfScale);
            input.style.fontSize = `${fontPx}px`;
            input.style.color = entry.color || '#000000';
            wrap.appendChild(input);
        }

        if (activeMode === 'form') {
            wrap.classList.add('pdfEditorManualFormMarker');
            HANDLES.forEach((pos) => {
                const handle = document.createElement('div');
                handle.className = `pdfEditorHandle ${pos}`;
                handle.dataset.handle = pos;
                wrap.appendChild(handle);
            });
            attachBoxHandlers(wrap, layer, entry, model, {
                selectType: 'manualForm',
                minBoxPx: 12,
            });
        }
        wireSelectable(wrap, 'manualForm', entry.id);
        layer.appendChild(wrap);
    }

    function usesManualFormFill(model) {
        return !(model.formFields && model.formFields.length);
    }

    function placeManualFormAt(layer, model, onChange, clientX, clientY) {
        if (activeMode !== 'form' || !usesManualFormFill(model)) return false;
        const rect = layer.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return false;
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        const pageId = layer.dataset.pageId;
        if (!pageId) return false;

        if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();

        if (activeManualFormTool === 'check' || activeManualFormTool === 'radio') {
            const size = 0.028;
            global.PdfEditorDocumentModel.addManualFormFill(model, {
                pageId,
                type: activeManualFormTool === 'radio' ? 'radio' : 'check',
                x: Math.max(0, Math.min(1 - size, x - size / 2)),
                y: Math.max(0, Math.min(1 - size, y - size / 2)),
                width: size,
                height: size,
                checked: true,
                framed: activeManualFormFramed,
                color: getManualFormPlacementColor(),
            });
        } else {
            const wNorm = 0.32;
            const hNorm = 0.08;
            global.PdfEditorDocumentModel.addManualFormFill(model, {
                pageId,
                type: 'text',
                x: Math.max(0, Math.min(1 - wNorm, x)),
                y: Math.max(0, Math.min(1 - hNorm, y)),
                width: wNorm,
                height: hNorm,
                text: '',
                fontSize: activeManualFormStyle.fontSize,
                color: getManualFormPlacementColor(),
            });
        }
        onChange();
        requestAnimationFrame(() => {
            const added = (model.manualFormFills || [])[model.manualFormFills.length - 1];
            if (!added) return;
            notifyAnnotationSelect('manualForm', added.id);
            if (added.type !== 'text') return;
            const el = layer.querySelector(
                `.pdfEditorManualFormField[data-ann-id="${added.id}"] textarea`
            );
            el?.focus();
        });
        return true;
    }

    function ensureFormPlaceListener() {
        if (ensureFormPlaceListener._done) return;
        ensureFormPlaceListener._done = true;
        document.addEventListener(
            'pointerdown',
            (e) => {
                if (activeMode !== 'form') return;
                if (e.button != null && e.button !== 0) return;
                if (
                    e.target.closest(
                        '.pdfEditorFormCheck, .pdfEditorFormRadio, .pdfEditorFormText, .pdfEditorFormSelect, .pdfEditorManualFormField, .pdfEditorHandle'
                    )
                ) {
                    return;
                }
                const layer = e.target.closest?.('.pdfEditorOverlayLayer');
                if (!layer) return;
                const model = commentCreateModel;
                if (!model || !usesManualFormFill(model)) return;
                if (activeManualFormTool === 'text') return;
                if (
                    e.target.closest(
                        '.pdfEditorCommentPin, .pdfEditorRedactBox, .pdfEditorInkStroke, .pdfEditorSignatureMarker'
                    )
                ) {
                    return;
                }
                if (placeManualFormAt(layer, model, commentCreateOnChange || (() => {}), e.clientX, e.clientY)) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            },
            true
        );
    }

    function bindFormPlace(layer, model, onChange) {
        ensureFormPlaceListener();
        layer.addEventListener('pointerdown', (e) => {
            if (activeMode !== 'form') return;
            if (!usesManualFormFill(model)) return;
            if (activeManualFormTool !== 'text') return;
            if (e.button != null && e.button !== 0) return;
            if (
                e.target.closest(
                    '.pdfEditorFormField, .pdfEditorManualFormField, .pdfEditorCommentPin, .pdfEditorRedactBox, .pdfEditorInkStroke'
                )
            ) {
                return;
            }
            if (placeManualFormAt(layer, model, onChange, e.clientX, e.clientY)) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
    }

    function setManualFormTool(tool) {
        if (tool === 'check' || tool === 'radio') activeManualFormTool = tool;
        else activeManualFormTool = 'text';
        document.querySelectorAll('.pdfEditorOverlayLayer').forEach((layer) => {
            layer.classList.toggle(
                'pdfEditorOverlayFormCheckTool',
                activeManualFormTool === 'check' || activeManualFormTool === 'radio'
            );
        });
    }

    function setManualFormFramed(framed) {
        activeManualFormFramed = framed !== false;
        activeManualFormStyle.framed = activeManualFormFramed;
    }

    function getManualFormStyleDefaults() {
        return { ...activeManualFormStyle };
    }

    function setManualFormStyleDefaults(patch) {
        if (!patch || typeof patch !== 'object') return;
        activeManualFormStyle = { ...activeManualFormStyle, ...patch };
        if (patch.framed !== undefined) activeManualFormFramed = patch.framed !== false;
    }

    function getManualFormPlacementColor() {
        return activeManualFormStyle.color || '#000000';
    }

    function selectAnnotation(type, id) {
        notifyAnnotationSelect(type, id);
    }

    /** Topmost selectable annotation under a point (works across stacked overlays). */
    function findAnnotationAtPoint(clientX, clientY) {
        const stack = document.elementsFromPoint(clientX, clientY) || [];
        for (const el of stack) {
            if (!el || el.closest?.('#pdfEditorCommentModal, .pdfEditorPasswordModal, .pdfEditorInspector, .pdfEditorEditingToolbar, .pdfEditorFileBar, .pdeffy-sidebar')) {
                continue;
            }
            const host =
                el.closest?.('[data-ann-type][data-ann-id]') ||
                (el.dataset?.annType && el.dataset?.annId ? el : null);
            if (host?.dataset?.annType && host?.dataset?.annId) {
                return { type: host.dataset.annType, id: host.dataset.annId, el: host };
            }
        }
        return null;
    }

    /**
     * Capture-phase pick: clicking any annotation selects it and opens its tool,
     * even if another create tool (draw/redact/…) is currently active.
     */
    function ensureAnnotationPickListener() {
        if (ensureAnnotationPickListener._done) return;
        ensureAnnotationPickListener._done = true;

        document.addEventListener(
            'pointerdown',
            (e) => {
                if (e.button != null && e.button !== 0) return;
                if (e.target.closest?.('#pdfEditorCommentModal, .pdfEditorPasswordModal, input, textarea, select, button, a')) {
                    // Allow UI chrome; still allow page annotation buttons (pins).
                    if (!e.target.closest?.('.pdfEditorCommentPin, .pdfEditorPageCanvasWrap')) return;
                }
                const hit = findAnnotationAtPoint(e.clientX, e.clientY);
                if (!hit) return;

                // Form widgets own their pointer events; don't rebuild overlays mid-click.
                if (hit.type === 'form' || hit.type === 'manualForm') {
                    if (
                        e.target.closest?.(
                            '.pdfEditorFormCheck, .pdfEditorFormRadio, .pdfEditorFormText, .pdfEditorFormTextMultiline, .pdfEditorFormSelect, .pdfEditorManualFormField button, .pdfEditorManualFormField textarea'
                        )
                    ) {
                        return;
                    }
                    if (activeMode === 'form') return;
                }

                notifyAnnotationSelect(hit.type, hit.id);

                const neededMode = modeForAnnotationType(hit.type);
                // Another tool is active → don't let it start a new stroke/box on this gesture.
                if (neededMode !== 'none' && activeMode !== neededMode && activeMode !== 'none') {
                    e.stopPropagation();
                }
            },
            true
        );
    }

    function inkShapeOf(ink) {
        return ink?.shape || 'freehand';
    }

    function constrainShapePoint(start, end, shape, shiftKey, w, h) {
        if (!shiftKey || !start || !end) return end;
        if (shape === 'rect' || shape === 'ellipse') {
            const dxPx = (end.x - start.x) * (w || 1);
            const dyPx = (end.y - start.y) * (h || 1);
            const side = Math.max(Math.abs(dxPx), Math.abs(dyPx));
            return {
                x: start.x + (Math.sign(dxPx || 1) * side) / (w || 1),
                y: start.y + (Math.sign(dyPx || 1) * side) / (h || 1),
            };
        }
        if (shape === 'arrow') {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const angle = Math.atan2(dy, dx);
            const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            const len = Math.hypot(dx, dy);
            return {
                x: start.x + Math.cos(snap) * len,
                y: start.y + Math.sin(snap) * len,
            };
        }
        return end;
    }

    function buildInkSvgContent(svg, ink, w, h, minX, minY) {
        const shape = inkShapeOf(ink);
        const pts = ink.points || [];
        const strokeW = ink.width || 2.5;
        const color = ink.color || '#e53935';
        const toLocal = (p) => ({ x: p.x * w - minX, y: p.y * h - minY });

        const addPath = (d, opts = {}) => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            path.setAttribute('fill', opts.fill || 'none');
            path.setAttribute('stroke', opts.stroke || color);
            path.setAttribute('stroke-width', String(opts.strokeWidth ?? strokeW));
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            if (opts.dash) path.setAttribute('stroke-dasharray', opts.dash);
            path.style.pointerEvents = 'none';
            path.classList.add('pdfEditorInkStrokePath');
            svg.appendChild(path);
            return path;
        };

        if (shape === 'rect' && pts.length >= 2) {
            const a = toLocal(pts[0]);
            const b = toLocal(pts[1]);
            const x = Math.min(a.x, b.x);
            const y = Math.min(a.y, b.y);
            const rw = Math.max(1, Math.abs(b.x - a.x));
            const rh = Math.max(1, Math.abs(b.y - a.y));
            addPath(`M ${x} ${y} H ${x + rw} V ${y + rh} H ${x} Z`);
            return;
        }

        if (shape === 'ellipse' && pts.length >= 2) {
            const a = toLocal(pts[0]);
            const b = toLocal(pts[1]);
            const cx = (a.x + b.x) / 2;
            const cy = (a.y + b.y) / 2;
            const rx = Math.max(1, Math.abs(b.x - a.x) / 2);
            const ry = Math.max(1, Math.abs(b.y - a.y) / 2);
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
            el.setAttribute('cx', String(cx));
            el.setAttribute('cy', String(cy));
            el.setAttribute('rx', String(rx));
            el.setAttribute('ry', String(ry));
            el.setAttribute('fill', 'none');
            el.setAttribute('stroke', color);
            el.setAttribute('stroke-width', String(strokeW));
            el.style.pointerEvents = 'none';
            el.classList.add('pdfEditorInkStrokePath');
            svg.appendChild(el);
            return;
        }

        if (shape === 'arrow' && pts.length >= 2) {
            const a = toLocal(pts[0]);
            const b = toLocal(pts[1]);
            const angle = Math.atan2(b.y - a.y, b.x - a.x);
            const head = Math.max(10, strokeW * 4);
            const a1 = angle + Math.PI * 0.82;
            const a2 = angle - Math.PI * 0.82;
            const h1 = { x: b.x + Math.cos(a1) * head, y: b.y + Math.sin(a1) * head };
            const h2 = { x: b.x + Math.cos(a2) * head, y: b.y + Math.sin(a2) * head };
            addPath(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);
            addPath(`M ${h1.x} ${h1.y} L ${b.x} ${b.y} L ${h2.x} ${h2.y}`, { fill: color, strokeWidth: strokeW });
            return;
        }

        if (shape === 'polygon' && pts.length >= 2) {
            let d = '';
            pts.forEach((p, i) => {
                const loc = toLocal(p);
                d += i === 0 ? `M ${loc.x} ${loc.y}` : ` L ${loc.x} ${loc.y}`;
            });
            if (pts.length >= 3) d += ' Z';
            addPath(d);
            return;
        }

        // freehand (default)
        let d = '';
        pts.forEach((p, i) => {
            const loc = toLocal(p);
            d += i === 0 ? `M ${loc.x} ${loc.y}` : ` L ${loc.x} ${loc.y}`;
        });
        if (d) addPath(d);
    }

    function renderInk(layer, ink, model) {
        const { w, h } = getOverlaySize(layer);
        const pts = ink.points || [];
        const shape = inkShapeOf(ink);
        if (pts.length < (shape === 'polygon' ? 1 : 2) && ink.id !== 'preview') return;
        if (pts.length < 1) return;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const strokeW = ink.width || 2.5;
        const pad = Math.max(12, strokeW * 3 + 8);
        pts.forEach((p) => {
            const x = p.x * w;
            const y = p.y * h;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        });
        // Arrow head extends beyond endpoint.
        if (shape === 'arrow' && pts.length >= 2) {
            minX -= pad;
            minY -= pad;
            maxX += pad;
            maxY += pad;
        }
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(w, maxX + pad);
        maxY = Math.min(h, maxY + pad);
        const boxW = Math.max(1, maxX - minX);
        const boxH = Math.max(1, maxY - minY);

        const wrap = document.createElement('div');
        wrap.className =
            'pdfEditorInkStroke' +
            (ink.id === 'preview' ? ' pdfEditorInkPreview' : '') +
            (shape !== 'freehand' ? ` pdfEditorInkShape-${shape}` : '');
        wrap.dataset.id = ink.id;
        wrap.dataset.shape = shape;
        if (ink.id && ink.id !== 'preview') {
            wrap.dataset.annType = 'ink';
            wrap.dataset.annId = ink.id;
        }
        wrap.style.left = `${minX}px`;
        wrap.style.top = `${minY}px`;
        wrap.style.width = `${boxW}px`;
        wrap.style.height = `${boxH}px`;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', String(boxW));
        svg.setAttribute('height', String(boxH));
        svg.style.display = 'block';
        svg.style.overflow = 'visible';
        svg.style.pointerEvents = 'none';

        buildInkSvgContent(svg, ink, w, h, minX, minY);

        const frame = document.createElement('div');
        frame.className = 'pdfEditorInkSelectionFrame';
        frame.setAttribute('aria-hidden', 'true');

        wrap.appendChild(frame);
        wrap.appendChild(svg);

        if (ink.id && ink.id !== 'preview') {
            const hitBox = document.createElement('div');
            hitBox.className = 'pdfEditorInkHitArea';
            hitBox.setAttribute('aria-hidden', 'true');
            wrap.appendChild(hitBox);

            wireSelectable(wrap, 'ink', ink.id);
            wrap.style.pointerEvents = 'auto';
            wrap.style.cursor = activeMode === 'draw' ? 'grab' : 'pointer';
        }

        layer.appendChild(wrap);
    }

    function startInkMoveDrag(e, ink, box, layer) {
        if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
        const { w, h } = getOverlaySize(layer);
        const pts = ink.points || [];
        dragState = {
            type: 'ink-move',
            box,
            layer,
            ink,
            startX: e.clientX,
            startY: e.clientY,
            origLeft: parseFloat(box.style.left) || 0,
            origTop: parseFloat(box.style.top) || 0,
            origPoints: pts.map((p) => ({ x: p.x, y: p.y })),
            w,
            h,
            changed: false,
            pointerId: e.pointerId,
        };
        box.classList.add('pdfEditorAnnotationSelected');
        box.style.cursor = 'grabbing';
        try {
            box.setPointerCapture?.(e.pointerId);
        } catch (_) {
            /* ignore */
        }
    }

    /**
     * Capture-phase ink move: must win over text-layer area-select and draw-create.
     */
    function ensureInkDragListener() {
        if (ensureInkDragListener._done) return;
        ensureInkDragListener._done = true;

        document.addEventListener(
            'pointerdown',
            (e) => {
                if (e.button != null && e.button !== 0) return;
                if (dragState) return;
                if (activeMode !== 'draw') return;
                if (e.target.closest?.('#pdfEditorCommentModal, .pdfEditorPasswordModal, input, textarea, select, button, a')) {
                    if (!e.target.closest?.('.pdfEditorPageCanvasWrap')) return;
                }

                const hit = findAnnotationAtPoint(e.clientX, e.clientY);
                if (!hit || hit.type !== 'ink') return;

                const model = commentCreateModel;
                const ink = (model?.inks || []).find((i) => i.id === hit.id);
                if (!ink || !hit.el) return;
                const layer = hit.el.closest?.('.pdfEditorOverlayLayer');
                if (!layer) return;

                notifyAnnotationSelect('ink', ink.id);
                startInkMoveDrag(e, ink, hit.el, layer);

                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            },
            true
        );

        document.addEventListener(
            'contextmenu',
            (e) => {
                if (dragState?.type === 'ink-move' || e.target.closest?.('.pdfEditorInkStroke')) {
                    e.preventDefault();
                }
            },
            true
        );
    }

    async function openCommentEditDialog(commentId, model) {
        const live = (model?.comments || []).find((c) => c.id === commentId) || null;
        if (!live) {
            console.warn('[pdfEditor] comment not found', commentId);
            return;
        }

        ignoreCommentCreateUntil = Date.now() + 800;

        const title =
            typeof window.getMessage === 'function'
                ? window.getMessage('pdfEditorCommentEdit')
                : 'Modifica commento';
        const ask = global.__pdfEditorAskText || window.__pdfEditorAskText;
        if (typeof ask !== 'function') {
            console.warn('[pdfEditor] comment dialog unavailable');
            return;
        }
        const formatMeta =
            global.__pdfEditorFormatCommentMeta || window.__pdfEditorFormatCommentMeta;
        const meta = typeof formatMeta === 'function' ? formatMeta(live) : '';
        const next = await ask({
            title,
            value: live.text || '',
            meta,
        });
        if (next == null) return;
        if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
        global.PdfEditorDocumentModel.updateComment(model, live.id, {
            text: next.trim(),
            updatedAt: Date.now(),
        });
        if (overlayChangeHandler) overlayChangeHandler();
    }

    function findPinAtPoint(clientX, clientY, maxDist = 36) {
        const pins = document.querySelectorAll('.pdfEditorCommentPin');
        let best = null;
        let bestDist = maxDist;
        for (const pin of pins) {
            const r = pin.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const d = Math.hypot(clientX - cx, clientY - cy);
            if (d <= bestDist) {
                bestDist = d;
                best = pin;
            }
        }
        return best;
    }

    function renderComment(layer, comment, model) {
        const { w, h } = getOverlaySize(layer);
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'pdfEditorCommentPin';
        el.dataset.id = comment.id;
        el.dataset.pageId = comment.pageId || layer.dataset.pageId || '';
        el.title = comment.text || 'Comment';
        el.style.left = `${comment.x * w}px`;
        el.style.top = `${comment.y * h}px`;
        el.setAttribute('aria-label', comment.text || 'Comment');

        // Visual marker (rotated) lives inside a larger unrotated hit target.
        const visual = document.createElement('span');
        visual.className = 'pdfEditorCommentPinVisual';
        visual.style.backgroundColor = comment.color || '#f4b400';
        const icon = document.createElement('span');
        icon.className = 'pdfEditorCommentPinIcon';
        icon.textContent = '●';
        visual.appendChild(icon);
        el.appendChild(visual);
        el.dataset.annType = 'comment';
        el.dataset.annId = comment.id;

        // Interaction is handled globally (capture) — pin buttons are often missed by
        // hit-testing under text/overlay stacking in WKWebView.
        layer.appendChild(el);
    }

    /**
     * Reliable pin open/drag via document capture + geometric hit test.
     * Per-element click handlers are unreliable when text layer / overlay steal hits.
     */
    function ensureCommentPinListener() {
        if (ensureCommentPinListener._done) return;
        ensureCommentPinListener._done = true;

        document.addEventListener(
            'pointerdown',
            (e) => {
                if (e.button != null && e.button !== 0) return;
                if (e.target.closest?.('#pdfEditorCommentModal, .pdfEditorPasswordModal')) return;

                const direct = e.target.closest?.('.pdfEditorCommentPin');
                const pin =
                    direct ||
                    ((activeMode === 'comment' || activeMode === 'none')
                        ? findPinAtPoint(e.clientX, e.clientY)
                        : null);
                if (!pin?.dataset?.id) return;

                const model = commentCreateModel;
                if (!model) return;
                const live = (model.comments || []).find((c) => c.id === pin.dataset.id);
                if (!live) return;

                ignoreCommentCreateUntil = Date.now() + 1000;
                pinGesture = {
                    id: live.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    origX: live.x,
                    origY: live.y,
                    moved: false,
                    pointerId: e.pointerId,
                    pinEl: pin,
                    canDrag: activeMode === 'comment',
                };

                // Keep the gesture; don't preventDefault so we don't break scrolling elsewhere.
                e.stopPropagation();
            },
            true
        );

        document.addEventListener(
            'pointermove',
            (e) => {
                if (!pinGesture || e.pointerId !== pinGesture.pointerId) return;
                if (!pinGesture.canDrag) return;

                const dxPx = e.clientX - pinGesture.startX;
                const dyPx = e.clientY - pinGesture.startY;
                if (!pinGesture.moved && Math.hypot(dxPx, dyPx) > 12) {
                    pinGesture.moved = true;
                    if (typeof global.__pdfEditorBeforeEdit === 'function') {
                        global.__pdfEditorBeforeEdit();
                    }
                }
                if (!pinGesture.moved) return;

                const layer = pinGesture.pinEl?.closest?.('.pdfEditorOverlayLayer');
                const { w, h } = layer ? getOverlaySize(layer) : { w: 1, h: 1 };
                const live = (commentCreateModel?.comments || []).find(
                    (c) => c.id === pinGesture.id
                );
                if (!live) return;
                live.x = Math.max(
                    0,
                    Math.min(0.98, pinGesture.origX + dxPx / Math.max(1, w))
                );
                live.y = Math.max(
                    0,
                    Math.min(0.98, pinGesture.origY + dyPx / Math.max(1, h))
                );
                if (pinGesture.pinEl) {
                    pinGesture.pinEl.style.left = `${live.x * w}px`;
                    pinGesture.pinEl.style.top = `${live.y * h}px`;
                }
            },
            true
        );

        const endPinGesture = (e) => {
            if (!pinGesture) return;
            if (e && e.pointerId != null && e.pointerId !== pinGesture.pointerId) return;

            const tap = pinGesture;
            pinGesture = null;
            ignoreCommentCreateUntil = Date.now() + 1000;

            if (tap.moved) {
                if (overlayChangeHandler) overlayChangeHandler();
                return;
            }

            // Tap → open sidebar + edit dialog.
            e?.stopPropagation?.();
            notifyAnnotationSelect('comment', tap.id);
            openCommentEditDialog(tap.id, commentCreateModel).catch((err) => {
                console.warn('[pdfEditor] open comment from pin', err);
            });
        };

        document.addEventListener('pointerup', endPinGesture, true);
        document.addEventListener('pointercancel', endPinGesture, true);
    }

    function renderMarkup(layer, markup) {
        const { w, h } = getOverlaySize(layer);
        const px = normToPx(markup, w, h);
        const el = document.createElement('div');
        el.className =
            markup.type === 'underline' ? 'pdfEditorMarkupUnderline' : 'pdfEditorMarkupHighlight';
        el.dataset.id = markup.id;
        el.style.left = `${px.left}px`;
        el.style.top = `${px.top}px`;
        el.style.width = `${px.width}px`;
        el.style.height = `${px.height}px`;
        if (markup.type === 'highlight') {
            el.style.backgroundColor = markup.color || '#ffe066';
        } else {
            el.style.borderBottomColor = markup.color || '#1a73e8';
        }
        layer.appendChild(el);
    }

    function renderRedactBox(layer, rect, model) {
        const { w, h } = getOverlaySize(layer);
        const px = normToPx(rect, w, h);
        const box = document.createElement('div');
        box.className = 'pdfEditorRedactBox';
        box.dataset.id = rect.id;
        box.style.left = `${px.left}px`;
        box.style.top = `${px.top}px`;
        box.style.width = `${px.width}px`;
        box.style.height = `${px.height}px`;
        box.style.backgroundColor = rect.color || '#000000';

        if (activeMode === 'redact') {
            attachBoxHandlers(box, layer, rect, model, false);
        }
        wireSelectable(box, 'redact', rect.id);
        layer.appendChild(box);
    }

    function renderSignatureMarker(layer, sig, model) {
        const { w, h } = getOverlaySize(layer);
        const px = normToPx(sig, w, h);
        const el = document.createElement('div');
        el.className = 'pdfEditorSignatureMarker';
        el.dataset.id = sig.id;
        el.style.left = `${px.left}px`;
        el.style.top = `${px.top}px`;
        el.style.width = `${px.width}px`;
        el.style.height = `${px.height}px`;

        if (sig.type === 'text') {
            const span = document.createElement('span');
            span.className = 'pdfEditorSignatureText';
            span.textContent = sig.text || '';
            if (sig.color) span.style.color = sig.color;
            el.appendChild(span);
        } else if (sig.pngBytes) {
            const img = document.createElement('img');
            const blob = new Blob([sig.pngBytes], { type: 'image/png' });
            img.src = URL.createObjectURL(blob);
            img.alt = 'signature';
            el.appendChild(img);
        }

        if (activeMode === 'signature') {
            HANDLES.forEach((pos) => {
                const handle = document.createElement('div');
                handle.className = `pdfEditorHandle ${pos}`;
                handle.dataset.handle = pos;
                el.appendChild(handle);
            });
            attachBoxHandlers(el, layer, sig, model, true);
        }

        wireSelectable(el, 'signature', sig.id);
        layer.appendChild(el);
        if (sig.type === 'text') {
            applySignatureVisualSize(el, sig, layer);
        }
    }

    function measureSignatureTextWidth(text, fontPx) {
        if (!measureSignatureTextWidth._ctx) {
            measureSignatureTextWidth._ctx = document.createElement('canvas').getContext('2d');
        }
        const ctx = measureSignatureTextWidth._ctx;
        ctx.font = `${fontPx}px Helvetica, Arial, sans-serif`;
        return ctx.measureText(text || '').width;
    }

    /**
     * Fit signature text inside the box (width + height) and sync model.fontSize.
     */
    function applySignatureVisualSize(box, rect, layer) {
        if (!box || !rect || rect.type !== 'text') return;
        const textEl = box.querySelector('.pdfEditorSignatureText');
        if (!textEl || !textEl.textContent) return;

        const { w, h } = getOverlaySize(layer);
        const boxW = Math.max(1, (rect.width || 0) * w - 8);
        const boxH = Math.max(1, (rect.height || 0) * h - 4);
        const text = textEl.textContent;

        // Largest size that fits both height and width.
        let fontPx = Math.max(6, boxH * 0.92);
        const textW = measureSignatureTextWidth(text, fontPx);
        if (textW > boxW && textW > 0) {
            fontPx = Math.max(6, fontPx * (boxW / textW));
        }

        textEl.style.fontSize = `${fontPx}px`;
        const pdfScale = getPdfScale(layer) || 1;
        rect.fontSize = Math.max(6, Math.round((fontPx / pdfScale) * 10) / 10);
    }

    function attachBoxHandlers(box, layer, rect, model, legacyOrOpts) {
        const opts =
            typeof legacyOrOpts === 'boolean'
                ? { isSignature: legacyOrOpts, selectType: legacyOrOpts ? 'signature' : 'redact' }
                : { isSignature: false, selectType: 'redact', minBoxPx: MIN_BOX_PX, ...legacyOrOpts };
        box.addEventListener('mousedown', (e) => {
            if (
                e.target.closest(
                    '.pdfEditorFormCheck, .pdfEditorFormRadio, .pdfEditorFormText, .pdfEditorFormTextMultiline'
                )
            ) {
                return;
            }
            e.stopPropagation();
            notifyAnnotationSelect(opts.selectType, rect.id);
            const handleEl = e.target.closest('.pdfEditorHandle');
            const { w, h } = getOverlaySize(layer);
            if (typeof global.__pdfEditorBeforeEdit === 'function') {
                global.__pdfEditorBeforeEdit();
            }
            dragState = {
                type: handleEl ? 'resize' : 'move',
                handle: handleEl?.dataset.handle || null,
                box,
                layer,
                rect,
                model,
                isSignature: !!opts.isSignature,
                minBoxPx: opts.minBoxPx || MIN_BOX_PX,
                startX: e.clientX,
                startY: e.clientY,
                orig: normToPx(rect, w, h),
                w,
                h,
                changed: false,
            };
            document.querySelectorAll('.pdfEditorSignatureMarker, .pdfEditorManualFormMarker').forEach((m) => {
                m.classList.toggle('pdfEditorAnnotationSelected', m === box);
            });
        });
    }

    function applyResize(orig, handle, dx, dy, maxW, maxH, minPx = MIN_BOX_PX) {
        let { left, top, width, height } = orig;

        if (handle.includes('w')) {
            let proposedL = orig.left + dx;
            let proposedW = orig.width - dx;
            if (proposedL < 0) {
                proposedW = orig.width + orig.left;
                proposedL = 0;
            }
            if (proposedW >= minPx) {
                left = proposedL;
                width = proposedW;
            }
        }
        if (handle.includes('e')) {
            let proposedW = orig.width + dx;
            if (orig.left + proposedW > maxW) proposedW = maxW - orig.left;
            if (proposedW >= minPx) width = proposedW;
        }
        if (handle.includes('n')) {
            let proposedT = orig.top + dy;
            let proposedH = orig.height - dy;
            if (proposedT < 0) {
                proposedH = orig.height + orig.top;
                proposedT = 0;
            }
            if (proposedH >= minPx) {
                top = proposedT;
                height = proposedH;
            }
        }
        if (handle.includes('s')) {
            let proposedH = orig.height + dy;
            if (orig.top + proposedH > maxH) proposedH = maxH - orig.top;
            if (proposedH >= minPx) height = proposedH;
        }

        return { left, top, width, height };
    }

    function onMouseMove(e) {
        if (!dragState) return;

        if (dragState.type === 'ink-move') {
            const { w, h, origPoints, ink, box, origLeft, origTop } = dragState;
            let dxN = (e.clientX - dragState.startX) / Math.max(w, 1);
            let dyN = (e.clientY - dragState.startY) / Math.max(h, 1);
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;
            origPoints.forEach((p) => {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            });
            if (minX + dxN < 0) dxN = -minX;
            if (maxX + dxN > 1) dxN = 1 - maxX;
            if (minY + dyN < 0) dyN = -minY;
            if (maxY + dyN > 1) dyN = 1 - maxY;
            box.style.left = `${origLeft + dxN * w}px`;
            box.style.top = `${origTop + dyN * h}px`;
            ink.points = origPoints.map((p) => ({ x: p.x + dxN, y: p.y + dyN }));
            dragState.changed = true;
            return;
        }

        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        let { left, top, width, height } = dragState.orig;

        if (dragState.type === 'move') {
            left += dx;
            top += dy;
            left = Math.max(0, Math.min(left, dragState.w - width));
            top = Math.max(0, Math.min(top, dragState.h - height));
        } else if (dragState.type === 'resize' && dragState.handle) {
            const resized = applyResize(
                dragState.orig,
                dragState.handle,
                dx,
                dy,
                dragState.w,
                dragState.h,
                dragState.minBoxPx || MIN_BOX_PX
            );
            left = resized.left;
            top = resized.top;
            width = resized.width;
            height = resized.height;
        }

        dragState.box.style.left = `${left}px`;
        dragState.box.style.top = `${top}px`;
        dragState.box.style.width = `${width}px`;
        dragState.box.style.height = `${height}px`;
        const n = pxToNorm(left, top, width, height, dragState.w, dragState.h);
        Object.assign(dragState.rect, n);
        if (dragState.isSignature && dragState.type === 'resize') {
            applySignatureVisualSize(dragState.box, dragState.rect, dragState.layer);
        }
        dragState.changed = true;
    }

    function onMouseUp() {
        if (dragState?.box?.style) {
            dragState.box.style.cursor = dragState.type === 'ink-move' ? 'grab' : '';
        }
        if (dragState?.changed && overlayChangeHandler) {
            overlayChangeHandler();
        }
        dragState = null;
    }

    function setupGlobalListeners() {
        if (setupGlobalListeners._done) return;
        setupGlobalListeners._done = true;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('pointermove', onMouseMove);
        document.addEventListener('pointerup', onMouseUp);
        document.addEventListener('pointercancel', onMouseUp);
        ensureCommentPinListener();
        ensureCommentCreateListener();
        ensureAnnotationPickListener();
        ensureInkDragListener();
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && polygonDraft && activeMode === 'draw') {
                if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
                e.preventDefault();
                if (commentCreateModel && commentCreateOnChange) {
                    finishPolygonDraft(commentCreateModel, commentCreateOnChange);
                }
                return;
            }
            if (e.key === 'Escape' && polygonDraft) {
                e.preventDefault();
                cancelPolygonDraft();
                return;
            }
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
            if (!selectedAnnotation || !commentCreateModel) return;
            e.preventDefault();
            deleteSelectedAnnotation(commentCreateModel);
        });
    }

    /**
     * Document-level click: text layer / canvas may sit above the overlay and steal
     * pointer events; bubbling from .pdfEditorPageCanvasWrap still reaches here.
     */
    function ensureCommentCreateListener() {
        if (ensureCommentCreateListener._done) return;
        ensureCommentCreateListener._done = true;

        document.addEventListener('click', async (e) => {
            if (activeMode !== 'comment') return;
            if (commentCreateBusy) return;
            if (!commentCreateModel) return;
            if (e.button != null && e.button !== 0) return;
            if (Date.now() < ignoreCommentCreateUntil) return;
            if (pinGesture) return;

            // Pin taps are handled by ensureCommentPinListener (capture).
            if (e.target.closest?.('.pdfEditorCommentPin') || findPinAtPoint(e.clientX, e.clientY)) {
                return;
            }
            if (e.target.closest?.('#pdfEditorCommentModal, .pdfEditorPasswordModal, .pdfEditorCtxMenu')) {
                return;
            }
            // Ignore chrome / inspector / toolbar clicks.
            if (
                e.target.closest?.(
                    '.pdfEditorInspector, .pdfEditorEditingToolbar, .pdfEditorFileBar, .pdfEditorPagesPanel, .pdeffy-sidebar, .pdfEditorViewerChrome'
                )
            ) {
                return;
            }

            const wrap = e.target.closest?.('.pdfEditorPageCanvasWrap');
            if (!wrap) return;
            const frame = wrap.closest('.pdfEditorPageFrame');
            const pageId = frame?.dataset.pageId;
            const layer = wrap.querySelector('.pdfEditorOverlayLayer');
            if (!pageId || !layer) return;

            const rect = layer.getBoundingClientRect();
            if (rect.width < 8 || rect.height < 8) return;

            const x = Math.max(0, Math.min(0.98, (e.clientX - rect.left) / rect.width));
            const y = Math.max(0, Math.min(0.98, (e.clientY - rect.top) / rect.height));
            const title =
                typeof window.getMessage === 'function'
                    ? window.getMessage('pdfEditorCommentPrompt')
                    : 'Nuovo commento';
            const ask = global.__pdfEditorAskText || window.__pdfEditorAskText;
            if (typeof ask !== 'function') {
                console.warn('[pdfEditor] comment dialog unavailable');
                return;
            }

            commentCreateBusy = true;
            try {
                const getAuthor =
                    global.__pdfEditorGetCommentAuthor || window.__pdfEditorGetCommentAuthor;
                const author =
                    typeof getAuthor === 'function' ? await getAuthor() : '';
                const createdAt = Date.now();
                const formatMeta =
                    global.__pdfEditorFormatCommentMeta || window.__pdfEditorFormatCommentMeta;
                const meta =
                    typeof formatMeta === 'function'
                        ? formatMeta({ author, createdAt })
                        : '';
                const text = await ask({ title, value: '', meta });
                if (text == null || !String(text).trim()) return;
                if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                global.PdfEditorDocumentModel.addComment(commentCreateModel, {
                    pageId,
                    x,
                    y,
                    text: String(text).trim(),
                    color: '#f4b400',
                    author,
                    createdAt,
                });
                if (typeof commentCreateOnChange === 'function') commentCreateOnChange();
            } finally {
                commentCreateBusy = false;
            }
        });
    }

    function bindRedactCreate(layer, model, onChange) {
        layer.addEventListener('pointerdown', (e) => {
            if (activeMode !== 'redact') return;
            if (e.button != null && e.button !== 0) return;
            if (e.target.closest('.pdfEditorRedactBox')) return;
            if (e.target.closest('.pdfEditorSignatureMarker')) return;
            if (e.target.closest('.pdfEditorCommentPin')) return;
            if (e.target.closest('.pdfEditorWatermarkItem[data-ann-id]')) return;
            if (e.target.closest('.pdfEditorInkStroke')) return;
            e.preventDefault();
            e.stopPropagation();

            const { w, h } = getOverlaySize(layer);
            if (w < 8 || h < 8) return;
            const rect = layer.getBoundingClientRect();
            const startX = e.clientX - rect.left;
            const startY = e.clientY - rect.top;
            const pageId = layer.dataset.pageId;

            layer.querySelectorAll('.pdfEditorRedactPreview').forEach((el) => el.remove());
            const preview = document.createElement('div');
            preview.className = 'pdfEditorRedactPreview';
            preview.style.borderColor = activeRedactColor || '#000';
            preview.style.backgroundColor = hexToRgba(activeRedactColor || '#000000', 0.35);
            layer.appendChild(preview);

            const updatePreview = (clientX, clientY) => {
                const endX = Math.max(0, Math.min(w, clientX - rect.left));
                const endY = Math.max(0, Math.min(h, clientY - rect.top));
                const left = Math.min(startX, endX);
                const top = Math.min(startY, endY);
                const width = Math.abs(endX - startX);
                const height = Math.abs(endY - startY);
                preview.style.left = `${left}px`;
                preview.style.top = `${top}px`;
                preview.style.width = `${width}px`;
                preview.style.height = `${height}px`;
                return { left, top, width, height };
            };
            updatePreview(e.clientX, e.clientY);

            try {
                layer.setPointerCapture?.(e.pointerId);
            } catch (_) { /* ignore */ }

            const onMove = (ev) => {
                updatePreview(ev.clientX, ev.clientY);
            };
            const onUp = (ev) => {
                layer.removeEventListener('pointermove', onMove);
                layer.removeEventListener('pointerup', onUp);
                layer.removeEventListener('pointercancel', onUp);
                const { left, top, width, height } = updatePreview(ev.clientX, ev.clientY);
                preview.remove();
                if (width < 8 || height < 8) return;
                const n = pxToNorm(left, top, width, height, w, h);
                if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                global.PdfEditorDocumentModel.addRedaction(model, {
                    pageId,
                    ...n,
                    color: activeRedactColor,
                });
                onChange();
            };
            layer.addEventListener('pointermove', onMove);
            layer.addEventListener('pointerup', onUp);
            layer.addEventListener('pointercancel', onUp);
        });
    }

    function hexToRgba(hex, alpha) {
        const raw = String(hex || '#000000').replace('#', '');
        const full =
            raw.length === 3
                ? raw
                      .split('')
                      .map((c) => c + c)
                      .join('')
                : raw.padEnd(6, '0').slice(0, 6);
        const n = parseInt(full, 16);
        if (!Number.isFinite(n)) return `rgba(0,0,0,${alpha})`;
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return `rgba(${r},${g},${b},${alpha})`;
    }

    function clearInkPreview(layer) {
        layer?.querySelectorAll('.pdfEditorInkPreview').forEach((el) => el.remove());
    }

    function cancelPolygonDraft(layer) {
        polygonDraft = null;
        if (layer) clearInkPreview(layer);
        else document.querySelectorAll('.pdfEditorInkPreview').forEach((el) => el.remove());
        document.dispatchEvent(new CustomEvent('pdfEditorPolygonDraftChange', { detail: { active: false } }));
    }

    function finishPolygonDraft(model, onChange) {
        if (!polygonDraft || (polygonDraft.points || []).length < 3) {
            cancelPolygonDraft();
            return false;
        }
        const stroke = {
            pageId: polygonDraft.pageId,
            color: polygonDraft.color,
            width: polygonDraft.width,
            shape: 'polygon',
            points: polygonDraft.points.slice(),
        };
        const layer = document.querySelector(
            `.pdfEditorOverlayLayer[data-page-id="${polygonDraft.pageId}"]`
        );
        cancelPolygonDraft(layer);
        if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
        global.PdfEditorDocumentModel.addInk(model, stroke);
        onChange();
        return true;
    }

    function renderPolygonPreview(layer, cursorPt) {
        if (!polygonDraft || !layer) return;
        clearInkPreview(layer);
        const pts = polygonDraft.points.slice();
        if (cursorPt) pts.push(cursorPt);
        if (!pts.length) return;
        renderInk(layer, {
            id: 'preview',
            shape: 'polygon',
            color: polygonDraft.color,
            width: polygonDraft.width,
            points: pts,
        });
    }

    function bindDrawCreate(layer, model, onChange) {
        layer.addEventListener('pointerdown', (e) => {
            if (activeMode !== 'draw' || e.button !== 0) return;
            if (e.target.closest('.pdfEditorCommentPin')) return;
            if (e.target.closest('.pdfEditorSignatureMarker')) return;
            if (e.target.closest('.pdfEditorRedactBox')) return;
            if (e.target.closest('.pdfEditorWatermarkItem[data-ann-id]')) return;
            if (e.target.closest('.pdfEditorInkStroke:not(.pdfEditorInkPreview)')) return;
            e.preventDefault();
            e.stopPropagation();
            const { w, h } = getOverlaySize(layer);
            if (w < 8 || h < 8) return;
            const rect = layer.getBoundingClientRect();
            const pageId = layer.dataset.pageId;
            const toNorm = (ev) => ({
                x: Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(w, 1))),
                y: Math.max(0, Math.min(1, (ev.clientY - rect.top) / Math.max(h, 1))),
            });
            const shape = activeInkShape || 'freehand';
            const start = toNorm(e);

            // —— Polygon: click vertices ——
            if (shape === 'polygon') {
                if (!polygonDraft || polygonDraft.pageId !== pageId) {
                    polygonDraft = {
                        pageId,
                        color: activeInkColor,
                        width: activeInkWidth,
                        points: [],
                    };
                    document.dispatchEvent(
                        new CustomEvent('pdfEditorPolygonDraftChange', { detail: { active: true } })
                    );
                }
                // Close if click near first point.
                if (polygonDraft.points.length >= 3) {
                    const first = polygonDraft.points[0];
                    const dxPx = (start.x - first.x) * w;
                    const dyPx = (start.y - first.y) * h;
                    if (Math.hypot(dxPx, dyPx) <= 14) {
                        finishPolygonDraft(model, onChange);
                        return;
                    }
                }
                polygonDraft.points.push(start);
                renderPolygonPreview(layer, null);

                const onMove = (ev) => renderPolygonPreview(layer, toNorm(ev));
                const onUp = (ev) => {
                    layer.removeEventListener('pointermove', onMove);
                    layer.removeEventListener('pointerup', onUp);
                    layer.removeEventListener('pointercancel', onUp);
                    // Double-click finish
                    if (ev.detail >= 2 && polygonDraft?.points.length >= 3) {
                        // Remove duplicate point from second click of dblclick
                        if (polygonDraft.points.length > 3) polygonDraft.points.pop();
                        finishPolygonDraft(model, onChange);
                    }
                };
                layer.addEventListener('pointermove', onMove);
                layer.addEventListener('pointerup', onUp);
                layer.addEventListener('pointercancel', onUp);
                return;
            }

            // —— Rect / ellipse / arrow: drag ——
            if (shape === 'rect' || shape === 'ellipse' || shape === 'arrow') {
                try {
                    layer.setPointerCapture?.(e.pointerId);
                } catch (_) { /* ignore */ }
                let end = start;
                const paint = (ev) => {
                    end = constrainShapePoint(start, toNorm(ev), shape, ev.shiftKey, w, h);
                    clearInkPreview(layer);
                    renderInk(layer, {
                        id: 'preview',
                        shape,
                        color: activeInkColor,
                        width: activeInkWidth,
                        points: [start, end],
                    });
                };
                const onMove = (ev) => paint(ev);
                const onUp = (ev) => {
                    layer.removeEventListener('pointermove', onMove);
                    layer.removeEventListener('pointerup', onUp);
                    layer.removeEventListener('pointercancel', onUp);
                    clearInkPreview(layer);
                    end = constrainShapePoint(start, toNorm(ev), shape, ev.shiftKey, w, h);
                    const dxPx = Math.abs(end.x - start.x) * w;
                    const dyPx = Math.abs(end.y - start.y) * h;
                    if (dxPx < 4 && dyPx < 4) return;
                    if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                    global.PdfEditorDocumentModel.addInk(model, {
                        pageId,
                        color: activeInkColor,
                        width: activeInkWidth,
                        shape,
                        points: [start, end],
                    });
                    onChange();
                };
                layer.addEventListener('pointermove', onMove);
                layer.addEventListener('pointerup', onUp);
                layer.addEventListener('pointercancel', onUp);
                return;
            }

            // —— Freehand ——
            if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
            inkStroke = {
                pageId,
                color: activeInkColor,
                width: activeInkWidth,
                shape: 'freehand',
                points: [start],
            };
            try {
                layer.setPointerCapture?.(e.pointerId);
            } catch (_) { /* ignore */ }

            const onMove = (ev) => {
                if (!inkStroke) return;
                inkStroke.points.push(toNorm(ev));
                clearInkPreview(layer);
                renderInk(layer, { ...inkStroke, id: 'preview' });
            };
            const onUp = () => {
                layer.removeEventListener('pointermove', onMove);
                layer.removeEventListener('pointerup', onUp);
                layer.removeEventListener('pointercancel', onUp);
                const stroke = inkStroke;
                inkStroke = null;
                clearInkPreview(layer);
                if (!stroke || stroke.points.length < 2) return;
                global.PdfEditorDocumentModel.addInk(model, stroke);
                onChange();
            };
            layer.addEventListener('pointermove', onMove);
            layer.addEventListener('pointerup', onUp);
            layer.addEventListener('pointercancel', onUp);
        });
    }

    function bindAllRedactLayers(model, viewerApi, onChange) {
        commentCreateModel = model;
        commentCreateOnChange = onChange;
        ensureCommentPinListener();
        ensureCommentCreateListener();
        viewerApi.getAllOverlayLayers().forEach((layer) => {
            if (layer.dataset.boundTools) return;
            layer.dataset.boundTools = '1';
            bindRedactCreate(layer, model, onChange);
            bindDrawCreate(layer, model, onChange);
            bindSignaturePlace(layer, model, onChange);
            bindFormPlace(layer, model, onChange);
        });
    }

    function addRedactBoxToCurrentPage(model, pageId, viewerApi, onChange) {
        const layer = viewerApi.getOverlayLayer(pageId);
        if (!layer) return;
        const { w, h } = getOverlaySize(layer);
        const bw = Math.min(150, w * 0.35);
        const bh = Math.min(50, h * 0.12);
        const left = (w - bw) / 2;
        const top = (h - bh) / 2;
        const n = pxToNorm(left, top, bw, bh, w, h);
        if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
        global.PdfEditorDocumentModel.addRedaction(model, {
            pageId,
            ...n,
            color: activeRedactColor,
        });
        onChange();
    }

    function setMode(mode) {
        if (mode !== 'draw') {
            cancelPolygonDraft();
            inkStroke = null;
        }
        activeMode = mode;
        const capture =
            mode === 'draw' ||
            mode === 'comment' ||
            mode === 'redact' ||
            mode === 'signature' ||
            mode === 'form';
        document.body.classList.toggle('pdfEditorToolCapture', capture);
    }

    function setRedactColor(color) {
        activeRedactColor = color;
    }

    function setInkStyle({ color, width, shape } = {}) {
        if (color) activeInkColor = color;
        if (width != null) activeInkWidth = Number(width) || 2.5;
        if (shape) {
            if (shape !== activeInkShape) cancelPolygonDraft();
            activeInkShape = shape;
        }
    }

    function getInkStyle() {
        return { color: activeInkColor, width: activeInkWidth, shape: activeInkShape };
    }

    function finishPolygonIfAny(model, onChange) {
        return finishPolygonDraft(model, onChange);
    }

    function cancelPolygonIfAny() {
        cancelPolygonDraft();
    }

    function setWatermarkDraft(draft) {
        watermarkDraft = draft;
    }

    function getWatermarkDraft() {
        return watermarkDraft;
    }

    function setOverlayChangeHandler(fn) {
        overlayChangeHandler = fn;
    }

    let signaturePayloadProvider = null;
    let annotationSelectHandler = null;
    /** @type {{ type: string, id: string } | null} */
    let selectedAnnotation = null;

    function setSignaturePayloadProvider(fn) {
        signaturePayloadProvider = typeof fn === 'function' ? fn : null;
    }

    function setAnnotationSelectHandler(fn) {
        annotationSelectHandler = typeof fn === 'function' ? fn : null;
    }

    function getSelectedAnnotation() {
        return selectedAnnotation;
    }

    function clearAnnotationSelection() {
        selectedAnnotation = null;
        applySelectionHighlight();
    }

    function applySelectionHighlight() {
        document.querySelectorAll('.pdfEditorAnnotationSelected').forEach((el) => {
            el.classList.remove('pdfEditorAnnotationSelected');
        });
        if (!selectedAnnotation) return;
        document
            .querySelectorAll(
                `[data-ann-type="${selectedAnnotation.type}"][data-ann-id="${selectedAnnotation.id}"]`
            )
            .forEach((el) => el.classList.add('pdfEditorAnnotationSelected'));
    }

    function notifyAnnotationSelect(type, id) {
        if (!type || !id) return;
        selectedAnnotation = { type, id };
        applySelectionHighlight();
        if (annotationSelectHandler) annotationSelectHandler({ type, id });
    }

    function wireSelectable(el, type, id) {
        if (!el || !id) return;
        el.dataset.annType = type;
        el.dataset.annId = id;
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            notifyAnnotationSelect(type, id);
        });
    }

    function deleteSelectedAnnotation(model) {
        if (!selectedAnnotation || !model) return false;
        const { type, id } = selectedAnnotation;
        if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
        if (type === 'signature') global.PdfEditorDocumentModel.removeSignature(model, id);
        else if (type === 'redact') global.PdfEditorDocumentModel.removeRedaction(model, id);
        else if (type === 'watermark') global.PdfEditorDocumentModel.removeWatermark(model, id);
        else if (type === 'ink') global.PdfEditorDocumentModel.removeInk(model, id);
        else if (type === 'comment') global.PdfEditorDocumentModel.removeComment(model, id);
        else if (type === 'manualForm') global.PdfEditorDocumentModel.removeManualFormFill(model, id);
        else return false;
        selectedAnnotation = null;
        if (overlayChangeHandler) overlayChangeHandler();
        return true;
    }

    function placeSignatureOnPage(model, pageId, signature, viewerApi, onChange, at = null) {
        const layer = viewerApi?.getOverlayLayer?.(pageId) ||
            document.querySelector(`.pdfEditorOverlayLayer[data-page-id="${pageId}"]`);
        if (!layer) return;

        let sw = 0.28;
        let sh = 0.12;
        if (signature.type === 'text' && signature.text) {
            const { w: pageW, h: pageH } = getOverlaySize(layer);
            const pdfScale = getPdfScale(layer) || 1;
            const fontPx = Math.max(10, (signature.fontSize || 22) * pdfScale);
            const probe = document.createElement('span');
            probe.className = 'pdfEditorSignatureText';
            probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:${fontPx}px;font-family:Helvetica,Arial,sans-serif;`;
            probe.textContent = signature.text;
            document.body.appendChild(probe);
            const textW = Math.ceil(probe.getBoundingClientRect().width) + 12;
            document.body.removeChild(probe);
            sw = Math.min(0.85, Math.max(0.22, pageW > 0 ? textW / pageW : 0.35));
            sh = Math.min(0.12, Math.max(0.045, pageH > 0 ? (fontPx * 1.45) / pageH : 0.06));
        }

        let x = 0.1;
        let y = 0.82;
        if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
            // Place so the click is near the top-left of the signature box.
            x = Math.max(0, Math.min(1 - sw, at.x));
            y = Math.max(0, Math.min(1 - sh, at.y));
        }

        if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
        global.PdfEditorDocumentModel.addSignature(model, {
            pageId,
            type: signature.type,
            text: signature.text,
            fontSize: signature.fontSize,
            color: signature.color,
            pngBytes: signature.pngBytes,
            x,
            y,
            width: sw,
            height: sh,
        });
        onChange();
    }

    function bindSignaturePlace(layer, model, onChange) {
        layer.addEventListener('click', async (e) => {
            if (activeMode !== 'signature') return;
            if (e.button != null && e.button !== 0) return;
            if (e.target.closest('.pdfEditorSignatureMarker')) return;
            if (e.target.closest('.pdfEditorCommentPin')) return;
            if (e.target.closest('.pdfEditorRedactBox')) return;
            if (e.target.closest('.pdfEditorWatermarkItem[data-ann-id]')) return;
            if (e.target.closest('.pdfEditorInkStroke')) return;
            if (typeof signaturePayloadProvider !== 'function') return;
            e.preventDefault();
            e.stopPropagation();

            const rect = layer.getBoundingClientRect();
            if (rect.width < 8 || rect.height < 8) return;
            const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

            let payload = null;
            try {
                payload = await signaturePayloadProvider();
            } catch (err) {
                console.warn('[pdfEditor] signature payload', err);
                return;
            }
            if (!payload) return;

            placeSignatureOnPage(
                model,
                layer.dataset.pageId,
                payload,
                null,
                onChange,
                { x, y }
            );
        });
    }

    global.PdfEditorOverlayManager = {
        setupGlobalListeners,
        syncOverlays,
        bindAllRedactLayers,
        addRedactBoxToCurrentPage,
        setMode,
        setManualFormTool,
        setManualFormFramed,
        getManualFormStyleDefaults,
        setManualFormStyleDefaults,
        selectAnnotation,
        setRedactColor,
        setInkStyle,
        getInkStyle,
        finishPolygonIfAny,
        cancelPolygonIfAny,
        setWatermarkDraft,
        getWatermarkDraft,
        setOverlayChangeHandler,
        placeSignatureOnPage,
        setSignaturePayloadProvider,
        setAnnotationSelectHandler,
        getSelectedAnnotation,
        clearAnnotationSelection,
        deleteSelectedAnnotation,
        openCommentEdit: openCommentEditDialog,
    };
})(typeof window !== 'undefined' ? window : global);
