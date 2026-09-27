/**
 * Entity highlights — precise glyph ranges (same geometry as text search).
 */
(function (global) {
    let entities = [];
    let selectedId = null;
    let guidedReview = false;
    let showAllDetected = false;

    const CAT_COLOR = {
        NOME: '#EAB308',
        ORGANIZZAZIONE: '#F97316',
        INDIRIZZO: '#06B6D4',
        EMAIL: '#EC4899',
        TELEFONO: '#EC4899',
        CODICE_FISCALE: '#22C55E',
        IBAN: '#EF4444',
        CARTA: '#EF4444',
        PARTITA_IVA: '#EF4444',
        IP: '#EF4444',
    };

    function normValue(s) {
        return String(s || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function clearLayers() {
        document.querySelectorAll('.pdfEditorSearchLayer').forEach((layer) => {
            layer.querySelectorAll('.aiEntityHl').forEach((el) => el.remove());
        });
    }

    function setEntities(list) {
        entities = Array.isArray(list) ? list.slice() : [];
    }

    function setReviewState(payload) {
        if (!payload) return;
        entities = Array.isArray(payload.entities) ? payload.entities.slice() : [];
        selectedId = payload.selectedId || null;
        guidedReview = Boolean(payload.guidedReview);
        showAllDetected = Boolean(payload.showAllDetected);
    }

    function getEntities() {
        return entities;
    }

    function isPreviewOnPdf() {
        return Boolean(global.__pdfEditorAnonPreviewOnPdf);
    }

    function shouldDraw(ent) {
        const st = ent.reviewStatus || (ent.approved === false ? 'ignored' : 'pending');
        if (st === 'ignored') return false;
        if (isPreviewOnPdf()) return st === 'approved';
        if (showAllDetected && st !== 'ignored') return true;
        if (!guidedReview) return st !== 'ignored';
        if (st === 'approved' || ent.id === selectedId) return true;
        return false;
    }

    function getViewportForPage(pdfPage, pageState, pageId, zoomPercent) {
        const baseRot = pdfPage.rotate || 0;
        const extraRot = pageState.rotation || 0;
        const totalRot = (baseRot + extraRot) % 360;
        const frame = document.querySelector(`.pdfEditorPageFrame[data-page-id="${pageId}"]`);
        const canvas = frame?.querySelector('canvas');
        const pdfW = parseFloat(frame?.dataset.pdfWidth);
        if (canvas?.width && pdfW > 0) {
            const scale = canvas.width / pdfW;
            return pdfPage.getViewport({ scale, rotation: totalRot });
        }
        return pdfPage.getViewport({ scale: (zoomPercent || 100) / 100, rotation: totalRot });
    }

    /** @see textSearch.js — keep in sync */
    function buildPageTextIndex(items) {
        let pageText = '';
        const spans = [];

        (items || []).forEach((item) => {
            const str = item.str;
            if (str == null || str === '') return;
            if (pageText.length && !/\s$/.test(pageText) && !/^\s/.test(str) && item.hasEOL) {
                pageText += ' ';
            }
            spans.push({
                item,
                start: pageText.length,
                end: pageText.length + str.length,
            });
            pageText += str;
            if (item.hasEOL) pageText += '\n';
        });

        return { pageText, spans };
    }

    function findTextRanges(pageText, searchQ) {
        const needle = normValue(searchQ);
        if (!needle || !pageText) return [];
        const haystack = pageText.toLowerCase();
        const nLower = needle.toLowerCase();
        const ranges = [];
        let idx = 0;
        while (idx <= haystack.length - nLower.length) {
            const pos = haystack.indexOf(nLower, idx);
            if (pos === -1) break;
            ranges.push({ start: pos, end: pos + needle.length });
            idx = pos + Math.max(nLower.length, 1);
        }
        return ranges;
    }

    function rectForItemRange(item, charStart, charEnd, viewport) {
        const str = item.str || '';
        const len = str.length;
        if (len === 0) return null;

        const pdfjsLib = global.pdfjsLib || global.window?.pdfjsLib;
        if (!pdfjsLib?.Util || !item.transform) return null;

        const start = Math.max(0, Math.min(charStart, len));
        const end = Math.max(start + 1, Math.min(charEnd, len));

        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]) || 12;
        const angle = Math.atan2(tx[1], tx[0]);
        const totalWidth = (item.width || 0) * (viewport.scale || 1);
        const charW = len > 0 ? totalWidth / len : fontHeight * 0.5;
        const sliceW = Math.max((end - start) * charW, 4);
        const offset = start * charW;

        let left;
        let top;
        if (Math.abs(angle) < 1e-5) {
            left = tx[4] + offset;
            top = tx[5] - fontHeight * 0.85;
        } else {
            left = tx[4] + offset * Math.cos(angle) + fontHeight * 0.15 * Math.sin(angle);
            top = tx[5] + offset * Math.sin(angle) - fontHeight * 0.85 * Math.cos(angle);
        }

        return {
            left,
            top,
            width: sliceW,
            height: Math.max(fontHeight * 1.2, 10),
        };
    }

    function rectsForRange(spans, rangeStart, rangeEnd, viewport) {
        const rects = [];
        spans.forEach((span) => {
            const overlapStart = Math.max(rangeStart, span.start);
            const overlapEnd = Math.min(rangeEnd, span.end);
            if (overlapStart >= overlapEnd) return;
            const rect = rectForItemRange(
                span.item,
                overlapStart - span.start,
                overlapEnd - span.start,
                viewport
            );
            if (rect) rects.push(rect);
        });
        return rects;
    }

    function pickRangeForEntity(ent, ranges, pageNum, entityList) {
        if (!ranges.length) return null;
        if (ent.pageRange && typeof ent.pageRange.start === 'number') {
            const hit = ranges.find((r) => r.start === ent.pageRange.start && r.end === ent.pageRange.end);
            if (hit) return hit;
        }
        const needle = normValue(ent.value).toLowerCase();
        const same = entityList
            .filter((e) => e.page === pageNum && normValue(e.value).toLowerCase() === needle)
            .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
        const occ = Math.max(0, same.findIndex((e) => e.id === ent.id));
        return ranges[Math.min(occ, ranges.length - 1)];
    }

    /**
     * Map each entity to a precise character range on its PDF page (pdf.js text layer).
     */
    async function assignPageRanges(entityList, model, getPdfPage) {
        if (!model?.pdfJsDoc || !entityList?.length) return;
        const active = global.PdfEditorDocumentModel.getActivePages(model);
        const byPage = new Map();

        for (const pageState of active) {
            const pdfPage = await getPdfPage(pageState.sourceIndex);
            if (!pdfPage) continue;
            const tc = await pdfPage.getTextContent();
            const built = buildPageTextIndex(tc.items);
            byPage.set(pageState.sourceIndex + 1, {
                pageId: pageState.id,
                ...built,
            });
        }

        for (const ent of entityList) {
            const needle = normValue(ent.value);
            if (needle.length < 2) continue;

            for (const [pageNum, data] of byPage.entries()) {
                const ranges = findTextRanges(data.pageText, needle);
                if (!ranges.length) continue;
                if (ent.page != null && ent.page !== pageNum) continue;

                ent.page = pageNum;
                ent.pageId = data.pageId;
                break;
            }
        }

        for (const [pageNum, data] of byPage.entries()) {
            const onPage = entityList.filter((e) => e.page === pageNum);
            onPage.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
            for (const ent of onPage) {
                const needle = normValue(ent.value);
                const ranges = findTextRanges(data.pageText, needle);
                const range = pickRangeForEntity(ent, ranges, pageNum, entityList);
                if (!range) continue;
                ent.pageRange = { start: range.start, end: range.end };
                const from = Math.max(0, range.start - 40);
                const to = Math.min(data.pageText.length, range.end + 40);
                let snippet = data.pageText.slice(from, to).replace(/\s+/g, ' ').trim();
                if (from > 0) snippet = `…${snippet}`;
                if (to < data.pageText.length) snippet = `${snippet}…`;
                ent.context = snippet;
            }
        }
    }

    function appendHighlight(layer, parts, scaleX, scaleY, ent, isSelected) {
        for (const r of parts) {
            const hl = document.createElement('div');
            hl.className = `aiEntityHl${isSelected ? ' is-selected' : ''}`;
            hl.dataset.entityId = ent.id || '';
            hl.style.left = `${r.left * scaleX}px`;
            hl.style.top = `${r.top * scaleY}px`;
            hl.style.width = `${r.width * scaleX}px`;
            hl.style.height = `${r.height * scaleY}px`;
            applyStyles(hl, ent, isSelected);
            layer.appendChild(hl);
        }
    }

    function applyStyles(hl, ent, isSelected) {
        const color = CAT_COLOR[ent.entityType] || '#52617A';
        const st = ent.reviewStatus || 'pending';
        hl.style.borderRadius = '3px';
        hl.style.pointerEvents = 'none';
        hl.style.mixBlendMode = 'normal';
        hl.style.display = 'flex';
        hl.style.alignItems = 'center';
        hl.style.justifyContent = 'center';
        hl.style.overflow = 'hidden';
        hl.style.boxSizing = 'border-box';
        hl.textContent = '';

        if (st === 'approved') {
            if (isPreviewOnPdf()) {
                hl.style.background = '#101a3a';
                hl.style.outline = 'none';
                hl.style.borderBottom = 'none';
                hl.textContent = '';
                hl.title = ent.placeholder || ent.value;
                return;
            }
            hl.style.background = 'rgba(231, 231, 226, 0.92)';
            hl.style.outline = '1px solid #c8c8c0';
            hl.style.borderBottom = 'none';
            hl.style.color = '#101a3a';
            hl.style.fontSize = '8px';
            hl.style.fontWeight = '700';
            hl.style.lineHeight = '1.1';
            hl.style.padding = '0 2px';
            hl.textContent = ent.placeholder || '';
            hl.title = ent.placeholder || ent.value;
            return;
        }

        if (isSelected) {
            hl.style.background = 'rgba(255, 217, 26, 0.28)';
            hl.style.outline = '2px solid #e5b900';
            hl.style.borderBottom = 'none';
            hl.style.boxShadow = 'none';
            hl.title = `${ent.entityType}: ${ent.value}`;
            return;
        }

        hl.style.background = 'transparent';
        hl.style.outline = 'none';
        hl.style.borderBottom = `2px solid color-mix(in srgb, ${color} 55%, transparent)`;
        hl.style.opacity = '0.65';
        hl.title = `${ent.entityType}: ${ent.value}`;
    }

    async function paint(model, getPdfPage, zoomPercent) {
        clearLayers();
        if (!model?.pdfJsDoc || !entities.length) return;

        const active = global.PdfEditorDocumentModel.getActivePages(model);

        for (const pageState of active) {
            const frame = document.querySelector(`.pdfEditorPageFrame[data-page-id="${pageState.id}"]`);
            const layer = frame?.querySelector('.pdfEditorSearchLayer');
            const canvas = frame?.querySelector('canvas');
            if (!frame || !layer || !canvas) continue;

            const pdfPage = await getPdfPage(pageState.sourceIndex);
            if (!pdfPage) continue;
            const viewport = getViewportForPage(pdfPage, pageState, pageState.id, zoomPercent);
            const textContent = await pdfPage.getTextContent();
            const { pageText, spans } = buildPageTextIndex(textContent.items);
            const scaleX = canvas.clientWidth / canvas.width;
            const scaleY = canvas.clientHeight / canvas.height;
            const pageNum = pageState.sourceIndex + 1;
            const onPage = entities.filter((e) => e.page == null || e.page === pageNum);

            for (const ent of entities) {
                if (!shouldDraw(ent)) continue;
                if (ent.page != null && ent.page !== pageNum) continue;

                const needle = normValue(ent.value);
                if (needle.length < 2) continue;
                const isSelected = ent.id === selectedId;

                let range = ent.pageRange;
                if (!range || typeof range.start !== 'number') {
                    const ranges = findTextRanges(pageText, needle);
                    range = pickRangeForEntity(ent, ranges, pageNum, onPage);
                }
                if (!range) continue;

                const parts = rectsForRange(spans, range.start, range.end, viewport);
                if (!parts.length) continue;
                appendHighlight(layer, parts, scaleX, scaleY, ent, isSelected);
            }
        }
    }

    function pulseSelection(entityId) {
        selectedId = entityId;
        document.querySelectorAll(`.aiEntityHl[data-entity-id="${CSS.escape(entityId)}"]`).forEach((el) => {
            el.classList.add('is-pulse');
            el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
            setTimeout(() => el.classList.remove('is-pulse'), 1200);
        });
    }

    function paintOcrText(containerEl) {
        if (!containerEl) return;
        const raw = containerEl.dataset.rawText || containerEl.textContent || '';
        if (!raw) {
            containerEl.innerHTML = '';
            return;
        }
        containerEl.dataset.rawText = raw;
        const visible = entities.filter(shouldDraw);
        if (!visible.length) {
            containerEl.textContent = raw;
            return;
        }
        const escape = (s) =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let html = escape(raw);
        const sorted = visible.slice().sort((a, b) => b.value.length - a.value.length);
        for (const ent of sorted) {
            const st = ent.reviewStatus || 'pending';
            const lit = normValue(ent.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(lit, 'gi');
            const isSel = ent.id === selectedId;
            const replacement =
                st === 'approved'
                    ? escape(ent.placeholder || ent.value)
                    : (m) =>
                          `<mark class="aiEntityHlInline${isSel ? ' is-selected' : ''}" style="text-decoration:underline;text-decoration-color:${CAT_COLOR[ent.entityType] || '#52617A'}">${m}</mark>`;
            html = html.replace(re, replacement);
        }
        containerEl.innerHTML = html;
    }

    function entityOnPage(ent, pageState, pageNum) {
        if (ent.pageId) return ent.pageId === pageState.id;
        if (ent.page != null) return ent.page === pageNum;
        return false;
    }

    function exportViewportForPage(pdfPage, pageState) {
        const baseRot = pdfPage.rotate || 0;
        const extraRot = pageState.rotation || 0;
        const totalRot = (baseRot + extraRot) % 360;
        return pdfPage.getViewport({ scale: 1, rotation: totalRot });
    }

    function pushNormRedactionsFromRects(redactions, pageId, parts, viewport) {
        const vw = viewport.width || 1;
        const vh = viewport.height || 1;
        for (const r of parts) {
            redactions.push({
                pageId,
                x: r.left / vw,
                y: r.top / vh,
                width: Math.max(r.width / vw, 0.002),
                height: Math.max(r.height / vh, 0.002),
                color: '#000000',
            });
        }
    }

    /** Normalized redaction rects (0–1) for approved export — pdf.js geometry (no DOM required). */
    async function getNormRedactionsForEntities(entityList, model, getPdfPage, zoomPercent) {
        const redactions = [];
        if (!model?.pdfJsDoc || !entityList?.length) return redactions;

        const active = global.PdfEditorDocumentModel.getActivePages(model);
        const list = entityList.slice();

        if (typeof assignPageRanges === 'function') {
            await assignPageRanges(list, model, getPdfPage);
        }

        for (const pageState of active) {
            const pdfPage = await getPdfPage(pageState.sourceIndex);
            if (!pdfPage) continue;

            const pageNum = pageState.sourceIndex + 1;
            const onPage = list.filter((e) => entityOnPage(e, pageState, pageNum));
            if (!onPage.length) continue;

            const textContent = await pdfPage.getTextContent();
            const { pageText, spans } = buildPageTextIndex(textContent.items);
            const viewport = exportViewportForPage(pdfPage, pageState);

            for (const ent of onPage) {
                const needle = normValue(ent.value);
                if (needle.length < 2) continue;

                let range = ent.pageRange;
                if (!range || typeof range.start !== 'number') {
                    const ranges = findTextRanges(pageText, needle);
                    range = pickRangeForEntity(ent, ranges, pageNum, list);
                }
                if (!range) continue;

                const parts = rectsForRange(spans, range.start, range.end, viewport);
                pushNormRedactionsFromRects(redactions, pageState.id, parts, viewport);
            }
        }

        return redactions;
    }

    global.PdfEditorAnonymizeHighlights = {
        setEntities,
        setReviewState,
        getEntities,
        assignPageRanges,
        getNormRedactionsForEntities,
        paint,
        paintOcrText,
        pulseSelection,
        clear: clearLayers,
    };
})(typeof window !== 'undefined' ? window : global);
