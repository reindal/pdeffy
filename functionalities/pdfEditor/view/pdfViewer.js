/**
 * Main preview: single-page and continuous scroll modes with zoom + overlay layers.
 */
(function (global) {
    const VIEW_SINGLE = 'single';
    const VIEW_CONTINUOUS = 'continuous';

    function createPdfViewer(options) {
        const {
            scrollContainerEl,
            singleContainerEl,
            model,
            getPdfPage,
            onPageInView,
            onAfterRender,
        } = options;

        let viewMode = VIEW_SINGLE;
        let zoomPercent = 100;
        let currentDisplayIndex = 0;
        let renderToken = 0;

        function getActive() {
            return global.PdfEditorDocumentModel.getActivePages(model);
        }

        function computeScale(pdfPage, pageState, containerWidth) {
            const baseRot = pdfPage.rotate || 0;
            const extraRot = pageState.rotation || 0;
            const totalRot = (baseRot + extraRot) % 360;
            const baseViewport = pdfPage.getViewport({ scale: 1, rotation: totalRot });
            let targetWidth = containerWidth - 48;
            if (targetWidth > 920) targetWidth = 920;
            if (targetWidth < 280) targetWidth = 280;
            const fitScale = targetWidth / baseViewport.width;
            return fitScale * (zoomPercent / 100);
        }

        async function renderPageToCanvas(canvas, pageState, containerWidth) {
            const pdfPage = await getPdfPage(pageState.sourceIndex);
            if (!pdfPage) return null;

            const scale = computeScale(pdfPage, pageState, containerWidth);
            const baseRot = pdfPage.rotate || 0;
            const extraRot = pageState.rotation || 0;
            const totalRot = (baseRot + extraRot) % 360;
            const viewport = pdfPage.getViewport({ scale, rotation: totalRot });

            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await pdfPage.render({
                canvasContext: canvas.getContext('2d'),
                viewport,
            }).promise;
            return { viewport, pdfPage };
        }


        function buildPageFrame(pageState, displayIndex) {
            const wrap = document.createElement('div');
            wrap.className = 'pdfEditorPageFrame';
            wrap.dataset.pageId = pageState.id;
            wrap.dataset.displayIndex = String(displayIndex);
            wrap.dataset.sourceIndex = String(pageState.sourceIndex);

            const label = document.createElement('div');
            label.className = 'pdfEditorPageLabel';
            label.textContent = String(displayIndex + 1);

            const canvasWrap = document.createElement('div');
            canvasWrap.className = 'pdfEditorPageCanvasWrap';

            const canvas = document.createElement('canvas');
            const searchLayer = document.createElement('div');
            searchLayer.className = 'pdfEditorSearchLayer';
            const overlay = document.createElement('div');
            overlay.className = 'pdfEditorOverlayLayer';
            overlay.dataset.pageId = pageState.id;

            canvasWrap.appendChild(canvas);
            canvasWrap.appendChild(searchLayer);
            canvasWrap.appendChild(overlay);
            wrap.appendChild(label);
            wrap.appendChild(canvasWrap);

            return { wrap, canvas, overlay, canvasWrap };
        }

        async function renderSingle(selectedPageId) {
            const token = ++renderToken;
            const active = getActive();
            singleContainerEl.innerHTML = '';
            scrollContainerEl.innerHTML = '';
            scrollContainerEl.style.display = 'none';
            singleContainerEl.style.display = 'flex';

            if (active.length === 0) {
                singleContainerEl.innerHTML =
                    '<p class="pdfEditorViewerEmpty langText" id="pdfEditorNoPagesLeft">No pages left</p>';
                return;
            }

            let displayIndex = active.findIndex((p) => p.id === selectedPageId);
            if (displayIndex < 0) displayIndex = 0;
            currentDisplayIndex = displayIndex;

            const pageState = active[displayIndex];
            const { wrap, canvas } = buildPageFrame(pageState, displayIndex);
            singleContainerEl.appendChild(wrap);

            const width = singleContainerEl.clientWidth || 800;
            const meta = await renderPageToCanvas(canvas, pageState, width);
            if (token !== renderToken) return;
            if (meta?.viewport && meta.pdfPage) {
                const baseVp = meta.pdfPage.getViewport({
                    scale: 1,
                    rotation: (meta.pdfPage.rotate || 0) + (pageState.rotation || 0),
                });
                wrap.dataset.pageWidth = String(meta.viewport.width);
                wrap.dataset.pageHeight = String(meta.viewport.height);
                wrap.dataset.pdfWidth = String(baseVp.width);
                wrap.dataset.pdfHeight = String(baseVp.height);
            }

            if (onPageInView) onPageInView(displayIndex, pageState.id);
            if (onAfterRender) onAfterRender();
        }

        async function renderContinuous(selectedPageId) {
            const token = ++renderToken;
            singleContainerEl.innerHTML = '';
            singleContainerEl.style.display = 'none';
            scrollContainerEl.style.display = 'block';
            scrollContainerEl.innerHTML = '';

            const active = getActive();
            if (active.length === 0) {
                scrollContainerEl.innerHTML =
                    '<p class="pdfEditorViewerEmpty langText" id="pdfEditorNoPagesLeft">No pages left</p>';
                return;
            }

            const containerWidth = scrollContainerEl.clientWidth || 800;

            for (let i = 0; i < active.length; i++) {
                const pageState = active[i];
                const { wrap, canvas } = buildPageFrame(pageState, i);
                scrollContainerEl.appendChild(wrap);

                const meta = await renderPageToCanvas(canvas, pageState, containerWidth);
                if (token !== renderToken) return;
                if (meta?.viewport && meta.pdfPage) {
                    const baseVp = meta.pdfPage.getViewport({
                        scale: 1,
                        rotation: (meta.pdfPage.rotate || 0) + (pageState.rotation || 0),
                    });
                    wrap.dataset.pageWidth = String(meta.viewport.width);
                    wrap.dataset.pageHeight = String(meta.viewport.height);
                    wrap.dataset.pdfWidth = String(baseVp.width);
                    wrap.dataset.pdfHeight = String(baseVp.height);
                }
            }

            setupIntersectionObserver(selectedPageId);
            if (onAfterRender) onAfterRender();
        }

        let observer = null;

        function setupIntersectionObserver(selectedPageId) {
            if (observer) observer.disconnect();
            const frames = scrollContainerEl.querySelectorAll('.pdfEditorPageFrame');
            if (!frames.length) return;

            observer = new IntersectionObserver(
                (entries) => {
                    let best = null;
                    let bestRatio = 0;
                    entries.forEach((entry) => {
                        if (entry.intersectionRatio > bestRatio) {
                            bestRatio = entry.intersectionRatio;
                            best = entry.target;
                        }
                    });
                    if (best) {
                        const idx = parseInt(best.dataset.displayIndex, 10);
                        const id = best.dataset.pageId;
                        currentDisplayIndex = idx;
                        if (onPageInView) onPageInView(idx, id);
                    }
                },
                { root: scrollContainerEl, threshold: [0.25, 0.5, 0.75] }
            );

            frames.forEach((f) => observer.observe(f));

            const target = scrollContainerEl.querySelector(`[data-page-id="${selectedPageId}"]`);
            if (target) target.scrollIntoView({ block: 'start' });
        }

        async function render(selectedPageId) {
            if (viewMode === VIEW_CONTINUOUS) {
                await renderContinuous(selectedPageId);
            } else {
                await renderSingle(selectedPageId);
            }
        }

        function getOverlayLayer(pageId) {
            return document.querySelector(`.pdfEditorOverlayLayer[data-page-id="${pageId}"]`);
        }

        function getAllOverlayLayers() {
            return document.querySelectorAll('.pdfEditorOverlayLayer');
        }

        function setViewMode(mode) {
            viewMode = mode === VIEW_CONTINUOUS ? VIEW_CONTINUOUS : VIEW_SINGLE;
        }

        function getViewMode() {
            return viewMode;
        }

        function setZoomPercent(percent) {
            zoomPercent = Math.max(25, Math.min(400, percent));
        }

        function getZoomPercent() {
            return zoomPercent;
        }

        function stepZoom(delta) {
            setZoomPercent(zoomPercent + delta);
        }

        function goToDisplayIndex(index) {
            const active = getActive();
            if (active.length === 0) return null;
            const clamped = Math.max(0, Math.min(active.length - 1, index));
            currentDisplayIndex = clamped;
            return active[clamped].id;
        }

        function getCurrentDisplayIndex() {
            return currentDisplayIndex;
        }

        function scrollToPageId(pageId) {
            const frame = document.querySelector(`.pdfEditorPageFrame[data-page-id="${pageId}"]`);
            if (frame) frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        return {
            render,
            setViewMode,
            getViewMode,
            setZoomPercent,
            getZoomPercent,
            stepZoom,
            goToDisplayIndex,
            getCurrentDisplayIndex,
            scrollToPageId,
            getOverlayLayer,
            getAllOverlayLayers,
            VIEW_SINGLE,
            VIEW_CONTINUOUS,
        };
    }

    global.PdfEditorViewer = { createPdfViewer };
})(typeof window !== 'undefined' ? window : global);
