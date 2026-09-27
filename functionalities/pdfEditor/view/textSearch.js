/**
 * In-document text search with highlight overlays (PDF.js text content).
 * Match geometry is stored as page-normalized 0–1 rects so paint stays correct
 * across zoom and single/continuous view rebuilds.
 */
(function (global) {
    let query = '';
    let matches = [];
    let pageResults = [];
    let currentIndex = -1;
    let caseSensitive = false;
    let ocrMode = false;
    let ocrRanges = [];

    function getContainerWidth() {
        const scroll = document.getElementById('pdfEditorViewerScroll');
        const single = document.getElementById('pdfEditorViewerSingle');
        if (scroll && scroll.style.display !== 'none' && scroll.clientWidth) {
            return scroll.clientWidth;
        }
        if (single && single.style.display !== 'none' && single.clientWidth) {
            return single.clientWidth;
        }
        return 800;
    }

    function pageRotation(pdfPage, pageState) {
        return ((pdfPage.rotate || 0) + (pageState.rotation || 0)) % 360;
    }

    /** Viewport matching the rendered canvas when present; otherwise fit-to-width @ 100%. */
    function getViewportForPage(pdfPage, pageState, pageId) {
        const totalRot = pageRotation(pdfPage, pageState);
        const frame = document.querySelector(`.pdfEditorPageFrame[data-page-id="${pageId}"]`);
        const canvas = frame?.querySelector('canvas');
        const pdfW = parseFloat(frame?.dataset.pdfWidth);

        if (canvas?.width && pdfW > 0) {
            return pdfPage.getViewport({ scale: canvas.width / pdfW, rotation: totalRot });
        }

        const baseViewport = pdfPage.getViewport({ scale: 1, rotation: totalRot });
        const targetWidth = Math.max(280, getContainerWidth() - 48);
        return pdfPage.getViewport({
            scale: targetWidth / baseViewport.width,
            rotation: totalRot,
        });
    }

    function buildPageTextIndex(items) {
        let pageText = '';
        const spans = [];

        (items || []).forEach((item) => {
            const str = item.str;
            if (str == null || str === '') return;
            if (
                pageText.length &&
                !/\s$/.test(pageText) &&
                !/^\s/.test(str) &&
                item.hasEOL
            ) {
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
        if (!searchQ || !pageText) return [];

        const ranges = [];
        const needle = caseSensitive ? searchQ : searchQ.toLowerCase();
        const haystack = caseSensitive ? pageText : pageText.toLowerCase();
        let idx = 0;

        while (idx <= haystack.length - needle.length) {
            const pos = haystack.indexOf(needle, idx);
            if (pos === -1) break;
            ranges.push({ start: pos, end: pos + searchQ.length });
            idx = pos + Math.max(needle.length, 1);
        }

        return ranges;
    }

    /**
     * Bounding box in viewport (canvas) pixels for a character slice of one text item.
     * item.width is in PDF user units; multiply by viewport.scale (not font-size).
     */
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

    function toNorm(rect, viewport) {
        const w = viewport.width || 1;
        const h = viewport.height || 1;
        return {
            x: rect.left / w,
            y: rect.top / h,
            w: rect.width / w,
            h: rect.height / h,
        };
    }

    async function findOnPage(pdfPage, pageState, pageId, searchQ) {
        const textContent = await pdfPage.getTextContent();
        const { pageText, spans } = buildPageTextIndex(textContent.items);
        const ranges = findTextRanges(pageText, searchQ);
        if (!ranges.length) return [];

        const viewport = getViewportForPage(pdfPage, pageState, pageId);
        const pageMatches = [];
        ranges.forEach((range) => {
            // One highlight per query occurrence (union of glyph boxes).
            const parts = rectsForRange(spans, range.start, range.end, viewport);
            if (!parts.length) return;
            let left = Infinity;
            let top = Infinity;
            let right = -Infinity;
            let bottom = -Infinity;
            parts.forEach((r) => {
                left = Math.min(left, r.left);
                top = Math.min(top, r.top);
                right = Math.max(right, r.left + r.width);
                bottom = Math.max(bottom, r.top + r.height);
            });
            pageMatches.push(
                toNorm(
                    {
                        left,
                        top,
                        width: Math.max(right - left, 4),
                        height: Math.max(bottom - top, 8),
                    },
                    viewport
                )
            );
        });
        return pageMatches;
    }

    function buildPageResults() {
        const byPage = new Map();
        matches.forEach((m) => {
            if (!byPage.has(m.pageId)) {
                byPage.set(m.pageId, {
                    pageId: m.pageId,
                    displayIndex: m.displayIndex,
                    count: 0,
                });
            }
            byPage.get(m.pageId).count += 1;
        });
        pageResults = Array.from(byPage.values()).sort((a, b) => a.displayIndex - b.displayIndex);
    }

    function waitForPaint() {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
            });
        });
    }

    async function waitForFrameCanvas(pageId, attempts = 12) {
        for (let i = 0; i < attempts; i++) {
            const frame = document.querySelector(`.pdfEditorPageFrame[data-page-id="${pageId}"]`);
            const canvas = frame?.querySelector('canvas');
            const layer = frame?.querySelector('.pdfEditorSearchLayer');
            if (frame && layer && canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
                return { frame, canvas, layer };
            }
            await waitForPaint();
        }
        return null;
    }

    async function runSearch(model, getPdfPage, _zoomPercent, searchQuery) {
        query = (searchQuery || '').trim();
        matches = [];
        pageResults = [];
        currentIndex = -1;
        ocrMode = false;
        ocrRanges = [];

        if (!query || !model.pdfJsDoc) {
            clearHighlights();
            return { count: 0, pageResults: [] };
        }

        const active = global.PdfEditorDocumentModel.getActivePages(model);

        for (let i = 0; i < active.length; i++) {
            const pageState = active[i];
            const pdfPage = await getPdfPage(pageState.sourceIndex);
            if (!pdfPage) continue;

            const norms = await findOnPage(pdfPage, pageState, pageState.id, query);
            norms.forEach((norm) => {
                matches.push({
                    pageId: pageState.id,
                    displayIndex: i,
                    norm,
                });
            });
        }

        buildPageResults();
        if (matches.length > 0) currentIndex = 0;
        return { count: matches.length, pageResults };
    }

    function clearHighlights() {
        document.querySelectorAll('.pdfEditorSearchLayer').forEach((layer) => {
            layer.querySelectorAll('.pdfEditorSearchHighlight').forEach((el) => el.remove());
        });
    }

    function paintMatch(match, idx, frame, canvas, layer) {
        if (!match?.norm) return;
        const { x, y, w, h } = match.norm;
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;
        if (!cw || !ch) return;

        const el = document.createElement('div');
        el.className = 'pdfEditorSearchHighlight';
        if (idx === currentIndex) el.classList.add('pdfEditorSearchHighlightCurrent');
        el.style.left = `${x * cw}px`;
        el.style.top = `${y * ch}px`;
        el.style.width = `${Math.max(w * cw, 4)}px`;
        el.style.height = `${Math.max(h * ch, 8)}px`;
        layer.appendChild(el);
    }

    function renderHighlights() {
        clearHighlights();
        if (ocrMode) return;

        matches.forEach((m, idx) => {
            const frame = document.querySelector(`.pdfEditorPageFrame[data-page-id="${m.pageId}"]`);
            if (!frame) return;
            const canvas = frame.querySelector('canvas');
            const layer = frame.querySelector('.pdfEditorSearchLayer');
            if (!canvas || !layer || !canvas.clientWidth) return;
            paintMatch(m, idx, frame, canvas, layer);
        });
    }

    function getCurrentMatch() {
        return currentIndex >= 0 ? matches[currentIndex] : null;
    }

    function goToFirstOnPage(pageId, onGoToPage) {
        const idx = matches.findIndex((m) => m.pageId === pageId);
        if (idx < 0) return Promise.resolve(null);
        return goToIndex(idx, onGoToPage);
    }

    function scrollHighlightIntoView(match) {
        const frame = document.querySelector(`.pdfEditorPageFrame[data-page-id="${match.pageId}"]`);
        const highlight = frame?.querySelector('.pdfEditorSearchHighlightCurrent');
        if (highlight) {
            highlight.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } else if (frame) {
            frame.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function clearOcrHighlights() {
        ocrMode = false;
        ocrRanges = [];
        const pre = document.getElementById('pdfEditorOcrText');
        if (!pre) return;
        const raw = pre.dataset.rawText || pre.textContent || '';
        pre.dataset.rawText = raw;
        if (typeof global.PdfEditorAnonymizeHighlights?.paintOcrText === 'function') {
            pre.textContent = raw;
            global.PdfEditorAnonymizeHighlights.paintOcrText(pre);
        } else {
            pre.textContent = raw;
        }
    }

    function clear() {
        query = '';
        matches = [];
        pageResults = [];
        currentIndex = -1;
        clearHighlights();
        clearOcrHighlights();
    }

    function runOcrTextSearch(text, searchQuery) {
        query = (searchQuery || '').trim();
        matches = [];
        pageResults = [];
        currentIndex = -1;
        ocrRanges = [];
        ocrMode = true;
        clearHighlights();

        if (!query || !text) {
            return { count: 0, pageResults: [] };
        }

        const needle = caseSensitive ? query : query.toLowerCase();
        const haystack = caseSensitive ? text : text.toLowerCase();
        let idx = 0;
        while (idx <= haystack.length - needle.length) {
            const pos = haystack.indexOf(needle, idx);
            if (pos === -1) break;
            ocrRanges.push({ start: pos, end: pos + query.length });
            matches.push({
                pageId: 'ocr',
                displayIndex: 0,
                norm: null,
                ocrIndex: ocrRanges.length - 1,
            });
            idx = pos + Math.max(needle.length, 1);
        }

        if (matches.length) currentIndex = 0;
        renderOcrHighlights();
        return { count: matches.length, pageResults: [] };
    }

    function renderOcrHighlights() {
        const pre = document.getElementById('pdfEditorOcrText');
        if (!pre) return;
        const raw = pre.dataset.rawText || '';
        if (!raw || !ocrRanges.length) {
            pre.textContent = raw;
            return;
        }

        const escape = (s) =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        let html = '';
        let cursor = 0;
        ocrRanges.forEach((r, i) => {
            html += escape(raw.slice(cursor, r.start));
            const cls =
                i === currentIndex
                    ? 'pdfEditorOcrSearchHit pdfEditorOcrSearchHitCurrent'
                    : 'pdfEditorOcrSearchHit';
            html += `<mark class="${cls}" data-ocr-hit="${i}">${escape(raw.slice(r.start, r.end))}</mark>`;
            cursor = r.end;
        });
        html += escape(raw.slice(cursor));
        pre.innerHTML = html;
        pre.querySelector('.pdfEditorOcrSearchHitCurrent')?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }

    async function goToIndex(index, onGoToPage) {
        if (!matches.length) return null;
        currentIndex = ((index % matches.length) + matches.length) % matches.length;
        const m = matches[currentIndex];

        if (ocrMode) {
            renderOcrHighlights();
            return m;
        }

        if (typeof onGoToPage === 'function') {
            await onGoToPage(m.pageId, m.displayIndex);
        }

        await waitForFrameCanvas(m.pageId);
        renderHighlights();
        scrollHighlightIntoView(m);
        return m;
    }

    function goToNext(onGoToPage) {
        if (!matches.length) return Promise.resolve(null);
        return goToIndex(currentIndex + 1, onGoToPage);
    }

    function goToPrev(onGoToPage) {
        if (!matches.length) return Promise.resolve(null);
        return goToIndex(currentIndex - 1, onGoToPage);
    }

    function isOcrMode() {
        return ocrMode;
    }

    function hasActiveSearch() {
        return query.length > 0 && matches.length > 0;
    }

    function getState() {
        return { query, count: matches.length, currentIndex, caseSensitive, pageResults };
    }

    function getPageResults() {
        return pageResults.slice();
    }

    function setCaseSensitive(value) {
        caseSensitive = !!value;
    }

    global.PdfEditorTextSearch = {
        runSearch,
        runOcrTextSearch,
        renderHighlights,
        clear,
        clearHighlights,
        goToNext,
        goToPrev,
        goToIndex,
        goToFirstOnPage,
        getCurrentMatch,
        hasActiveSearch,
        getState,
        getPageResults,
        setCaseSensitive,
        isOcrMode,
    };
})(typeof window !== 'undefined' ? window : global);
