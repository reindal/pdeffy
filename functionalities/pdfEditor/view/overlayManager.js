/**
 * Preview overlays: watermarks, redaction boxes, signatures (move + resize).
 */
(function (global) {
    let activeMode = 'none';
    let activeRedactColor = '#000000';
    let watermarkDraft = null;
    let dragState = null;
    let overlayChangeHandler = null;
    const imageCache = new Map();
    let syncToken = 0;

    const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const MIN_BOX_PX = 24;

    function getOverlaySize(overlay) {
        const canvas = overlay.parentElement?.querySelector('canvas');
        if (canvas) {
            return { w: canvas.width, h: canvas.height };
        }
        return { w: overlay.clientWidth || 1, h: overlay.clientHeight || 1 };
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
        const token = ++syncToken;
        document.querySelectorAll('.pdfEditorOverlayLayer').forEach((layer) => {
            layer.innerHTML = '';
            layer.classList.remove('pdfEditorOverlayActive', 'pdfEditorOverlaySigActive');
            if (activeMode === 'redact') layer.classList.add('pdfEditorOverlayActive');
            if (activeMode === 'signature') layer.classList.add('pdfEditorOverlaySigActive');
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

            (model.signatures || []).forEach((s) => {
                const layer = viewerApi.getOverlayLayer(s.pageId);
                if (!layer) return;
                renderSignatureMarker(layer, s, model);
            });
        });
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
            el.textContent = sig.text || '';
            const pdfScale = getPdfScale(layer);
            el.style.fontSize = `${Math.max(10, (sig.fontSize || 20) * pdfScale)}px`;
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

        layer.appendChild(el);
    }

    function attachBoxHandlers(box, layer, rect, model, isSignature) {
        box.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            const handleEl = e.target.closest('.pdfEditorHandle');
            const { w, h } = getOverlaySize(layer);
            dragState = {
                type: handleEl ? 'resize' : 'move',
                handle: handleEl?.dataset.handle || null,
                box,
                layer,
                rect,
                model,
                isSignature,
                startX: e.clientX,
                startY: e.clientY,
                orig: normToPx(rect, w, h),
                w,
                h,
                changed: false,
            };
            document.querySelectorAll('.pdfEditorSignatureMarker').forEach((m) => {
                m.classList.toggle('pdfEditorSignatureSelected', m === box);
            });
        });
    }

    function applyResize(orig, handle, dx, dy, maxW, maxH) {
        let { left, top, width, height } = orig;

        if (handle.includes('w')) {
            let proposedL = orig.left + dx;
            let proposedW = orig.width - dx;
            if (proposedL < 0) {
                proposedW = orig.width + orig.left;
                proposedL = 0;
            }
            if (proposedW >= MIN_BOX_PX) {
                left = proposedL;
                width = proposedW;
            }
        }
        if (handle.includes('e')) {
            let proposedW = orig.width + dx;
            if (orig.left + proposedW > maxW) proposedW = maxW - orig.left;
            if (proposedW >= MIN_BOX_PX) width = proposedW;
        }
        if (handle.includes('n')) {
            let proposedT = orig.top + dy;
            let proposedH = orig.height - dy;
            if (proposedT < 0) {
                proposedH = orig.height + orig.top;
                proposedT = 0;
            }
            if (proposedH >= MIN_BOX_PX) {
                top = proposedT;
                height = proposedH;
            }
        }
        if (handle.includes('s')) {
            let proposedH = orig.height + dy;
            if (orig.top + proposedH > maxH) proposedH = maxH - orig.top;
            if (proposedH >= MIN_BOX_PX) height = proposedH;
        }

        return { left, top, width, height };
    }

    function onMouseMove(e) {
        if (!dragState) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        let { left, top, width, height } = dragState.orig;

        if (dragState.type === 'move') {
            left += dx;
            top += dy;
            left = Math.max(0, Math.min(left, dragState.w - width));
            top = Math.max(0, Math.min(top, dragState.h - height));
        } else if (dragState.type === 'resize' && dragState.handle) {
            const resized = applyResize(dragState.orig, dragState.handle, dx, dy, dragState.w, dragState.h);
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
        dragState.changed = true;
    }

    function onMouseUp() {
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
    }

    function bindRedactCreate(layer, model, onChange) {
        layer.addEventListener('mousedown', (e) => {
            if (activeMode !== 'redact') return;
            if (e.target.closest('.pdfEditorRedactBox')) return;
            if (e.target.closest('.pdfEditorSignatureMarker')) return;
            const { w, h } = getOverlaySize(layer);
            const rect = layer.getBoundingClientRect();
            const startX = e.clientX - rect.left;
            const startY = e.clientY - rect.top;
            const pageId = layer.dataset.pageId;

            const onUp = (ev) => {
                document.removeEventListener('mouseup', onUp);
                const endX = ev.clientX - rect.left;
                const endY = ev.clientY - rect.top;
                const left = Math.min(startX, endX);
                const top = Math.min(startY, endY);
                const width = Math.abs(endX - startX);
                const height = Math.abs(endY - startY);
                if (width < 8 || height < 8) return;
                const n = pxToNorm(left, top, width, height, w, h);
                global.PdfEditorDocumentModel.addRedaction(model, {
                    pageId,
                    ...n,
                    color: activeRedactColor,
                });
                onChange();
            };
            document.addEventListener('mouseup', onUp);
        });
    }

    function bindAllRedactLayers(model, viewerApi, onChange) {
        viewerApi.getAllOverlayLayers().forEach((layer) => {
            bindRedactCreate(layer, model, onChange);
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
        global.PdfEditorDocumentModel.addRedaction(model, {
            pageId,
            ...n,
            color: activeRedactColor,
        });
        onChange();
    }

    function setMode(mode) {
        activeMode = mode;
    }

    function setRedactColor(color) {
        activeRedactColor = color;
    }

    function setWatermarkDraft(draft) {
        watermarkDraft = draft;
    }

    function setOverlayChangeHandler(fn) {
        overlayChangeHandler = fn;
    }

    function placeSignatureOnPage(model, pageId, signature, viewerApi, onChange) {
        const layer = viewerApi.getOverlayLayer(pageId);
        if (!layer) return;
        const sw = 0.28;
        const sh = signature.type === 'text' ? 0.08 : 0.12;
        global.PdfEditorDocumentModel.addSignature(model, {
            pageId,
            type: signature.type,
            text: signature.text,
            fontSize: signature.fontSize,
            color: signature.color,
            pngBytes: signature.pngBytes,
            x: 0.1,
            y: 0.82,
            width: sw,
            height: sh,
        });
        onChange();
    }

    global.PdfEditorOverlayManager = {
        setupGlobalListeners,
        syncOverlays,
        bindAllRedactLayers,
        addRedactBoxToCurrentPage,
        setMode,
        setRedactColor,
        setWatermarkDraft,
        setOverlayChangeHandler,
        placeSignatureOnPage,
    };
})(typeof window !== 'undefined' ? window : global);
