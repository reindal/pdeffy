/**
 * In-document text search with highlight overlays (PDF.js text layer).
 */
(function (global) {
    let query = '';
    let matches = [];
    let pageResults = [];
    let currentIndex = -1;
    let caseSensitive = false;

    function computeScale(pdfPage, pageState, containerWidth) {
        const baseRot = pdfPage.rotate || 0;
        const extraRot = pageState.rotation || 0;
        const totalRot = (baseRot + extraRot) % 360;
        const baseViewport = pdfPage.getViewport({ scale: 1, rotation: totalRot });
        let targetWidth = containerWidth - 48;
        if (targetWidth > 920) targetWidth = 920;
        if (targetWidth < 280) targetWidth = 280;
        return targetWidth / baseViewport.width;
    }

    function getContainerWidth() {
        const scroll = document.getElementById('pdfEditorViewerScroll');
        const single = document.getElementById('pdfEditorViewerSingle');
        if (scroll && scroll.offsetParent !== null) {
            return scroll.clientWidth || 800;
        }
        if (single && single.offsetParent !== null) {
            return single.clientWidth || 800;
        }
        return 800;
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

        const fitScale = computeScale(pdfPage, pageState, getContainerWidth());
        const scale = fitScale * (zoomPercent / 100);
        return pdfPage.getViewport({ scale, rotation: totalRot });
    }

    function buildPageTextIndex(items) {
        let pageText = '';
        const spans = [];

        (items || []).forEach((item) => {
            const str = item.str;
            if (str == null || str === '') return;
            spans.push({
                item,
                start: pageText.length,
                end: pageText.length + str.length,
            });
            pageText += str;
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

            const actual = pageText.substring(pos, pos + searchQ.length);
            const actualCmp = caseSensitive ? actual : actual.toLowerCase();
            if (actualCmp === needle) {
                ranges.push({ start: pos, end: pos + searchQ.length });
            }
            idx = pos + Math.max(needle.length, 1);
        }

        return ranges;
    }

    function rectForItemRange(item, charStart, charEnd, viewport) {
        const str = item.str || '';
        const len = str.length;
        if (len === 0) return null;

        const pdfjsLib = global.pdfjsLib || global.window?.pdfjsLib;
        if (!pdfjsLib?.Util) return null;

        const start = Math.max(0, Math.min(charStart, len));
        const end = Math.max(start + 1, Math.min(charEnd, len));

        const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(transform[2], transform[3]) || 12;
        const totalWidth = (item.width || 0) * viewport.scale;
        const charW = len > 0 ? totalWidth / len : fontHeight * 0.5;

        return {
            left: transform[4] + start * charW,
            top: transform[5] - fontHeight,
            width: Math.max((end - start) * charW, 2),
            height: fontHeight * 1.15,
        };
    }

    function rectsForRange(spans, rangeStart, rangeEnd, viewport) {
        const rects = [];

        spans.forEach((span) => {
            const overlapStart = Math.max(rangeStart, span.start);
            const overlapEnd = Math.min(rangeEnd, span.end);
            if (overlapStart >= overlapEnd) return;

            const charStart = overlapStart - span.start;
            const charEnd = overlapEnd - span.start;
            const rect = rectForItemRange(span.item, charStart, charEnd, viewport);
            if (rect) rects.push(rect);
        });

        return rects;
    }

    async function findOnPage(pdfPage, pageState, pageId, searchQ, zoomPercent) {
        const textContent = await pdfPage.getTextContent();
        const { pageText, spans } = buildPageTextIndex(textContent.items);
        const ranges = findTextRanges(pageText, searchQ);
        if (!ranges.length) return [];

        const viewport = getViewportForPage(pdfPage, pageState, pageId, zoomPercent);
        const pageMatches = [];

        ranges.forEach((range) => {
            const rects = rectsForRange(spans, range.start, range.end, viewport);
            rects.forEach((rect) => pageMatches.push(rect));
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

    async function runSearch(model, getPdfPage, zoomPercent, searchQuery) {
        query = (searchQuery || '').trim();
        matches = [];
        pageResults = [];
        currentIndex = -1;

        if (!query || !model.pdfJsDoc) {
            clearHighlights();
            return { count: 0, pageResults: [] };
        }

        const active = global.PdfEditorDocumentModel.getActivePages(model);

        for (let i = 0; i < active.length; i++) {
            const pageState = active[i];
            const pdfPage = await getPdfPage(pageState.sourceIndex);
            if (!pdfPage) continue;

            const rects = await findOnPage(
                pdfPage,
                pageState,
                pageState.id,
                query,
                zoomPercent
            );
            rects.forEach((rect) => {
                matches.push({
                    pageId: pageState.id,
                    displayIndex: i,
                    rect,
                });
            });
        }

        buildPageResults();
        if (matches.length > 0) currentIndex = 0;
        renderHighlights();
        return { count: matches.length, pageResults };
    }

    function clearHighlights() {
        document.querySelectorAll('.pdfEditorSearchLayer').forEach((layer) => {
            layer.innerHTML = '';
        });
    }

    function renderHighlights() {
        clearHighlights();
        matches.forEach((m, idx) => {
            const frame = document.querySelector(`.pdfEditorPageFrame[data-page-id="${m.pageId}"]`);
            if (!frame) return;
            const layer = frame.querySelector('.pdfEditorSearchLayer');
            if (!layer) return;

            const el = document.createElement('div');
            el.className = 'pdfEditorSearchHighlight';
            if (idx === currentIndex) el.classList.add('pdfEditorSearchHighlightCurrent');
            el.style.left = `${m.rect.left}px`;
            el.style.top = `${m.rect.top}px`;
            el.style.width = `${m.rect.width}px`;
            el.style.height = `${m.rect.height}px`;
            layer.appendChild(el);
        });
    }

    function getCurrentMatch() {
        return currentIndex >= 0 ? matches[currentIndex] : null;
    }

    function goToIndex(index, onGoToPage) {
        if (!matches.length) return null;
        currentIndex = ((index % matches.length) + matches.length) % matches.length;
        const m = matches[currentIndex];
        renderHighlights();
        if (onGoToPage) onGoToPage(m.pageId, m.displayIndex);
        scrollHighlightIntoView(m);
        return m;
    }

    function goToFirstOnPage(pageId, onGoToPage) {
        const idx = matches.findIndex((m) => m.pageId === pageId);
        if (idx < 0) return null;
        return goToIndex(idx, onGoToPage);
    }

    function scrollHighlightIntoView(match) {
        const frame = document.querySelector(`.pdfEditorPageFrame[data-page-id="${match.pageId}"]`);
        const highlight = frame?.querySelector('.pdfEditorSearchHighlightCurrent');
        if (highlight) {
            highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (frame) {
            frame.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function goToNext(onGoToPage) {
        if (!matches.length) return;
        goToIndex(currentIndex + 1, onGoToPage);
    }

    function goToPrev(onGoToPage) {
        if (!matches.length) return;
        goToIndex(currentIndex - 1, onGoToPage);
    }

    function clear() {
        query = '';
        matches = [];
        pageResults = [];
        currentIndex = -1;
        clearHighlights();
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
        renderHighlights,
        clear,
        clearHighlights,
        goToNext,
        goToPrev,
        goToFirstOnPage,
        getCurrentMatch,
        hasActiveSearch,
        getState,
        getPageResults,
        setCaseSensitive,
    };
})(typeof window !== 'undefined' ? window : global);
