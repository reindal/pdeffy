/**
 * Selectable PDF.js text layer + context menu (copy / highlight / underline / redact).
 * Scanned PDFs: drag a region, then highlight or redact (no copy/underline).
 */
(function (global) {
    let modelRef = null;
    let onChange = null;
    let isPanActive = () => false;
    let wired = false;

    /** @type {{ pageId: string, text: string, rects: { x:number,y:number,width:number,height:number }[] } | null} */
    let pendingSelection = null;
    let areaDrag = null;

    function menuEl() {
        return document.getElementById('pdfEditorCtxMenu');
    }

    function hideMenu() {
        const el = menuEl();
        if (el) el.hidden = true;
        pendingSelection = null;
        clearAreaPreview();
    }

    function clearAreaPreview() {
        document.querySelectorAll('.pdfEditorAreaSelect').forEach((n) => n.remove());
    }

    function isScan() {
        return (
            modelRef?.hasEmbeddedText === false ||
            modelRef?.textSelectionWeak === true
        );
    }

    /** @returns {{ withText: number, hitable: number, ratio: number }} */
    function measureTextLayer(layer) {
        const spans = layer.querySelectorAll('span[role="presentation"]');
        let withText = 0;
        let hitable = 0;
        spans.forEach((s) => {
            const t = s.textContent || '';
            if (!t.trim()) return;
            withText += 1;
            const r = s.getBoundingClientRect();
            if (r.width >= 1 && r.height >= 1) hitable += 1;
        });
        return {
            withText,
            hitable,
            ratio: withText > 0 ? hitable / withText : 0,
        };
    }

    function markTextSelectionWeak() {
        if (!modelRef || modelRef.textSelectionWeak) return;
        modelRef.textSelectionWeak = true;
        onChange?.();
    }

    function showMenu(clientX, clientY, selection, { allowCopy, allowUnderline }) {
        const el = menuEl();
        if (!el) return;
        pendingSelection = selection;

        el.querySelectorAll('[data-action]').forEach((btn) => {
            const action = btn.dataset.action;
            let show = true;
            if (action === 'copy') show = allowCopy;
            if (action === 'underline') show = allowUnderline;
            btn.hidden = !show;
        });

        el.hidden = false;
        const pad = 8;
        const mw = el.offsetWidth || 160;
        const mh = el.offsetHeight || 140;
        let left = clientX;
        let top = clientY;
        if (left + mw > window.innerWidth - pad) left = window.innerWidth - mw - pad;
        if (top + mh > window.innerHeight - pad) top = window.innerHeight - mh - pad;
        el.style.left = `${Math.max(pad, left)}px`;
        el.style.top = `${Math.max(pad, top)}px`;
    }

    function rectsFromRange(range, canvasWrap) {
        const wrapRect = canvasWrap.getBoundingClientRect();
        const w = wrapRect.width || 1;
        const h = wrapRect.height || 1;
        const out = [];
        const clientRects = range.getClientRects();
        for (let i = 0; i < clientRects.length; i++) {
            const r = clientRects[i];
            if (r.width < 1 || r.height < 1) continue;
            out.push({
                x: (r.left - wrapRect.left) / w,
                y: (r.top - wrapRect.top) / h,
                width: r.width / w,
                height: r.height / h,
            });
        }
        return out;
    }

    function applyAction(action) {
        if (!pendingSelection || !modelRef) {
            hideMenu();
            return;
        }
        const { pageId, text, rects } = pendingSelection;

        if (action === 'copy') {
            const t = text || '';
            if (t) {
                navigator.clipboard?.writeText(t).catch(() => {
                    try {
                        const ta = document.createElement('textarea');
                        ta.value = t;
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        ta.remove();
                    } catch (_) { /* ignore */ }
                });
            }
            hideMenu();
            window.getSelection()?.removeAllRanges();
            return;
        }

        if (!rects?.length) {
            hideMenu();
            return;
        }

        if (action === 'redact') {
            if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
            rects.forEach((r) => {
                global.PdfEditorDocumentModel.addRedaction(modelRef, {
                    pageId,
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                    color: '#000000',
                });
            });
        } else if (action === 'highlight' || action === 'underline') {
            if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
            rects.forEach((r) => {
                global.PdfEditorDocumentModel.addMarkup(modelRef, {
                    pageId,
                    type: action,
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                    color: action === 'highlight' ? '#ffe066' : '#1a73e8',
                    text: text || '',
                });
            });
        }

        hideMenu();
        window.getSelection()?.removeAllRanges();
        onChange?.();
    }

    /**
     * Build a selectable text layer matching the rendered canvas viewport.
     * Requires --total-scale-factor (pdf.js TextLayer CSS) or spans end up zero-sized.
     */
    async function mountTextLayer(canvasWrap, canvas, pdfPage, pageState, viewport) {
        if (!pdfPage || isScan()) return;
        const pdfjsLib = global.pdfjsLib || global.window?.pdfjsLib;
        if (!pdfjsLib?.TextLayer) {
            console.warn('[pdfEditor] pdfjs TextLayer not available');
            return;
        }

        // Ensure layout so clientWidth is valid when CSS scales the canvas.
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));

        canvasWrap.querySelector('.pdfEditorTextLayer')?.remove();

        const layer = document.createElement('div');
        layer.className = 'textLayer pdfEditorTextLayer';
        layer.dataset.pageId = pageState.id;

        const vpW = viewport.width || 1;
        const cssW = canvas.clientWidth || vpW;
        const cssH = canvas.clientHeight || viewport.height || 1;
        const cssScale = cssW / vpW;
        const layerViewport =
            Math.abs(cssScale - 1) < 0.002
                ? viewport
                : pdfPage.getViewport({
                      scale: viewport.scale * cssScale,
                      rotation: viewport.rotation,
                  });
        const totalScale = layerViewport.scale;

        // pdf.js TextLayer + viewer CSS depend on these custom properties.
        layer.style.setProperty('--scale-factor', String(totalScale));
        layer.style.setProperty('--user-unit', '1');
        layer.style.setProperty('--total-scale-factor', String(totalScale));
        layer.style.setProperty('--scale-round-x', '1px');
        layer.style.setProperty('--scale-round-y', '1px');

        canvasWrap.appendChild(layer);

        try {
            const textContent = await pdfPage.getTextContent();
            const textLayer = new pdfjsLib.TextLayer({
                textContentSource: textContent,
                container: layer,
                viewport: layerViewport,
            });
            await textLayer.render();

            await new Promise((r) => requestAnimationFrame(r));
            const { withText, hitable, ratio } = measureTextLayer(layer);
            if (withText > 0 && ratio < 0.12) {
                console.warn('[pdfEditor] text layer weak', { withText, hitable, ratio });
                layer.remove();
                markTextSelectionWeak();
                return;
            }
            if (cssW > 0 && cssH > 0) {
                layer.style.width = `${cssW}px`;
                layer.style.height = `${cssH}px`;
            }
        } catch (err) {
            console.warn('[pdfEditor] text layer', err);
            layer.remove();
            markTextSelectionWeak();
        }
    }

    function selectionInside(wrap) {
        const sel = window.getSelection();
        const text = sel?.toString() || '';
        if (!text.trim() || !sel.rangeCount) return null;
        const range = sel.getRangeAt(0);
        if (!wrap.contains(range.commonAncestorContainer)) return null;
        return { sel, text: text.trim(), range };
    }

    function isAnnotationTarget(el) {
        return !!el?.closest?.(
            '[data-ann-type], .pdfEditorInkStroke, .pdfEditorSignatureMarker, .pdfEditorRedactBox, .pdfEditorCommentPin, .pdfEditorWatermarkItem, .pdfEditorFormField, .pdfEditorManualFormField'
        );
    }

    function isToolOverlayTarget(el) {
        return !!el?.closest?.(
            '.pdfEditorOverlayLayer.pdfEditorOverlayActive, .pdfEditorOverlayLayer.pdfEditorOverlaySigActive, .pdfEditorOverlayLayer.pdfEditorOverlayDrawActive, .pdfEditorOverlayLayer.pdfEditorOverlayCommentActive, .pdfEditorOverlayLayer.pdfEditorOverlayFormActive'
        );
    }

    function onContextMenu(e) {
        if (isPanActive()) return;
        if (document.body.classList.contains('pdfEditorToolCapture')) return;
        if (isAnnotationTarget(e.target) || isToolOverlayTarget(e.target)) return;
        const wrap = e.target.closest?.('.pdfEditorPageCanvasWrap');
        if (!wrap) return;
        const frame = wrap.closest('.pdfEditorPageFrame');
        const pageId = frame?.dataset.pageId;
        if (!pageId) return;

        if (isScan()) {
            const preview = wrap.querySelector('.pdfEditorAreaSelect');
            if (!preview) return;
            e.preventDefault();
            const wrapRect = wrap.getBoundingClientRect();
            const pr = preview.getBoundingClientRect();
            const rect = {
                x: (pr.left - wrapRect.left) / (wrapRect.width || 1),
                y: (pr.top - wrapRect.top) / (wrapRect.height || 1),
                width: pr.width / (wrapRect.width || 1),
                height: pr.height / (wrapRect.height || 1),
            };
            showMenu(e.clientX, e.clientY, { pageId, text: '', rects: [rect] }, {
                allowCopy: false,
                allowUnderline: false,
            });
            return;
        }

        const hit = selectionInside(wrap);
        if (!hit) return;
        e.preventDefault();
        const rects = rectsFromRange(hit.range, wrap);
        if (!rects.length) return;
        showMenu(e.clientX, e.clientY, { pageId, text: hit.text, rects }, {
            allowCopy: true,
            allowUnderline: true,
        });
    }

    /** Show menu on mouseup after a text selection (easier than requiring right-click). */
    function onMouseUp(e) {
        if (isPanActive() || isScan() || e.button !== 0) return;
        if (document.body.classList.contains('pdfEditorToolCapture')) return;
        if (isAnnotationTarget(e.target) || isToolOverlayTarget(e.target)) return;
        const wrap = e.target.closest?.('.pdfEditorPageCanvasWrap');
        if (!wrap) return;
        const frame = wrap.closest('.pdfEditorPageFrame');
        const pageId = frame?.dataset.pageId;
        if (!pageId) return;

        // Defer so the selection is committed.
        setTimeout(() => {
            const hit = selectionInside(wrap);
            if (!hit) return;
            const rects = rectsFromRange(hit.range, wrap);
            if (!rects.length) return;
            showMenu(e.clientX, e.clientY, { pageId, text: hit.text, rects }, {
                allowCopy: true,
                allowUnderline: true,
            });
        }, 0);
    }

    function onPointerDown(e) {
        if (!isScan() || isPanActive()) return;
        if (e.button !== 0) return;
        // Never steal gestures from editing tools or existing annotations (ink move, etc.).
        if (document.body.classList.contains('pdfEditorToolCapture')) return;
        if (isAnnotationTarget(e.target) || isToolOverlayTarget(e.target)) return;
        const wrap = e.target.closest?.('.pdfEditorPageCanvasWrap');
        if (!wrap) return;
        const frame = wrap.closest('.pdfEditorPageFrame');
        const pageId = frame?.dataset.pageId;
        if (!pageId) return;

        hideMenu();
        clearAreaPreview();
        const rect = wrap.getBoundingClientRect();
        areaDrag = {
            wrap,
            pageId,
            startX: e.clientX - rect.left,
            startY: e.clientY - rect.top,
            el: null,
        };
        wrap.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!areaDrag) return;
        const rect = areaDrag.wrap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const left = Math.min(areaDrag.startX, x);
        const top = Math.min(areaDrag.startY, y);
        const width = Math.abs(x - areaDrag.startX);
        const height = Math.abs(y - areaDrag.startY);
        if (!areaDrag.el) {
            areaDrag.el = document.createElement('div');
            areaDrag.el.className = 'pdfEditorAreaSelect';
            areaDrag.wrap.appendChild(areaDrag.el);
        }
        areaDrag.el.style.left = `${left}px`;
        areaDrag.el.style.top = `${top}px`;
        areaDrag.el.style.width = `${width}px`;
        areaDrag.el.style.height = `${height}px`;
    }

    function onPointerUp(e) {
        if (!areaDrag) return;
        const drag = areaDrag;
        areaDrag = null;
        if (!drag.el) return;
        const w = parseFloat(drag.el.style.width) || 0;
        const h = parseFloat(drag.el.style.height) || 0;
        if (w < 6 || h < 6) {
            clearAreaPreview();
            return;
        }
        const wrapRect = drag.wrap.getBoundingClientRect();
        const pr = drag.el.getBoundingClientRect();
        const norm = {
            x: (pr.left - wrapRect.left) / (wrapRect.width || 1),
            y: (pr.top - wrapRect.top) / (wrapRect.height || 1),
            width: pr.width / (wrapRect.width || 1),
            height: pr.height / (wrapRect.height || 1),
        };
        showMenu(e.clientX, e.clientY, { pageId: drag.pageId, text: '', rects: [norm] }, {
            allowCopy: false,
            allowUnderline: false,
        });
    }

    function wire() {
        if (wired) return;
        wired = true;
        document.addEventListener('contextmenu', onContextMenu);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideMenu();
        });
        document.addEventListener('pointerdown', (e) => {
            const el = menuEl();
            if (!el || el.hidden) return;
            if (el.contains(e.target)) return;
            // Don't dismiss while finishing a text selection drag.
            if (e.target.closest?.('.pdfEditorTextLayer')) return;
            hideMenu();
        });

        menuEl()?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            applyAction(btn.dataset.action);
        });
    }

    function init(opts) {
        modelRef = opts.model;
        onChange = opts.onChange;
        isPanActive = opts.isPanActive || (() => false);
        wire();
    }

    function afterPageRender(canvasWrap, canvas, pdfPage, pageState, viewport) {
        return mountTextLayer(canvasWrap, canvas, pdfPage, pageState, viewport);
    }

    global.PdfEditorTextSelection = {
        init,
        afterPageRender,
        hideMenu,
        isScan,
    };
})(typeof window !== 'undefined' ? window : global);
