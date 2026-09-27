/**
 * Left panel: page thumbnails, multi-select, reorder (DnD), rotate/delete.
 */
(function (global) {
    const THUMB_SCALE = 0.22;

    function createPageThumbnails(options) {
        const {
            containerEl,
            model,
            onPageSelect,
            onModelChange,
            getPdfPage,
            onSelectionChange,
        } = options;

        let draggedOrderIndex = null;
        /** @type {Set<string>} */
        let selectedIds = new Set();
        let anchorPageId = null;
        let multiSelectMode = false;

        function getActive() {
            return global.PdfEditorDocumentModel.getActivePages(model);
        }

        function msg(key, fallback) {
            if (typeof window.getMessage === 'function') {
                const v = window.getMessage(key);
                if (v && v !== key) return v;
            }
            return fallback;
        }

        function emitSelection() {
            if (typeof onSelectionChange === 'function') {
                onSelectionChange([...selectedIds]);
            }
            updateSelectionBar();
        }

        function updateSelectionBar() {
            const bar = document.getElementById('pdfEditorPageSelectionBar');
            const countEl = document.getElementById('pdfEditorPageSelectionCount');
            if (!bar || !countEl) return;
            const n = selectedIds.size;
            // In multi-select mode keep the bar visible so rotate/delete stay reachable.
            bar.hidden = multiSelectMode ? false : n < 1;
            if (n > 0) {
                const tpl = msg('pdfEditorPagesSelected', '{count} selezionate');
                countEl.textContent = String(tpl).replace('{count}', String(n));
            } else {
                countEl.textContent = multiSelectMode
                    ? msg('pdfEditorPagesSelectHint', 'Tocca le miniature per selezionarle')
                    : '';
            }
        }

        function syncSelectModeUi() {
            const btn = document.getElementById('pdfEditorPagesSelectMode');
            btn?.classList.toggle('is-active', multiSelectMode);
            btn?.setAttribute('aria-pressed', multiSelectMode ? 'true' : 'false');
            if (btn) {
                btn.textContent = multiSelectMode
                    ? msg('pdfEditorPagesSelectDone', 'Fine')
                    : msg('pdfEditorToolSelect', 'Seleziona');
            }
            containerEl.classList.toggle('pdfEditorThumbsMultiSelect', multiSelectMode);
            containerEl.querySelectorAll('.pdfEditorThumbItem').forEach((el) => {
                el.draggable = !multiSelectMode;
            });
            updateSelectionBar();
        }

        function setMultiSelectMode(on) {
            multiSelectMode = !!on;
            if (!multiSelectMode) {
                const current =
                    containerEl.querySelector('.pdfEditorThumbItem.is-current')?.dataset.pageId ||
                    [...selectedIds][0] ||
                    null;
                if (current) {
                    selectedIds = new Set([current]);
                    anchorPageId = current;
                }
            }
            syncSelectModeUi();
            applyThumbClasses(
                containerEl.querySelector('.pdfEditorThumbItem.is-current')?.dataset.pageId ||
                    [...selectedIds][0] ||
                    null
            );
        }

        function applyThumbClasses(currentPageId) {
            const current = currentPageId || null;
            containerEl.querySelectorAll('.pdfEditorThumbItem').forEach((el) => {
                const id = el.dataset.pageId;
                el.classList.toggle('selected', selectedIds.has(id));
                el.classList.toggle('is-current', !!current && id === current);
            });
        }

        function setPrimarySelection(pageId, { additive = false, range = false } = {}) {
            const active = getActive();
            if (!active.length) return;

            if (range && anchorPageId) {
                const a = active.findIndex((p) => p.id === anchorPageId);
                const b = active.findIndex((p) => p.id === pageId);
                if (a >= 0 && b >= 0) {
                    const lo = Math.min(a, b);
                    const hi = Math.max(a, b);
                    if (!additive) selectedIds = new Set();
                    for (let i = lo; i <= hi; i++) selectedIds.add(active[i].id);
                }
            } else if (additive) {
                if (selectedIds.has(pageId)) selectedIds.delete(pageId);
                else selectedIds.add(pageId);
                anchorPageId = pageId;
            } else {
                selectedIds = new Set([pageId]);
                anchorPageId = pageId;
            }

            applyThumbClasses(pageId);
            onPageSelect(pageId);
            emitSelection();
        }

        /** Keep multi-select marks; only move the "current page" ring. */
        function setCurrentPage(pageId) {
            if (!multiSelectMode) {
                selectedIds = new Set(pageId ? [pageId] : []);
                anchorPageId = pageId || null;
            }
            applyThumbClasses(pageId);
        }

        function getSelectedPageIds() {
            return [...selectedIds];
        }

        function rotateSelected(delta) {
            const ids = getSelectedPageIds();
            if (!ids.length) return;
            if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
            ids.forEach((id) => global.PdfEditorDocumentModel.rotatePage(model, id, delta));
            onModelChange();
        }

        function deleteSelected() {
            const ids = getSelectedPageIds();
            if (!ids.length) return;
            const tpl = msg('pdfEditorConfirmDeletePages', 'Eliminare {count} pagine?');
            if (!window.confirm(String(tpl).replace('{count}', String(ids.length)))) return;
            if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
            let failed = false;
            ids.forEach((id) => {
                const ok = global.PdfEditorDocumentModel.togglePageDeleted(model, id);
                if (!ok) failed = true;
            });
            if (failed && typeof StatusManager !== 'undefined') {
                StatusManager.show('#pdfEditorStatus', 'error', 'mustLeaveAtLeastOnePage');
            }
            selectedIds = new Set();
            onModelChange();
            emitSelection();
        }

        function wireSelectionBar() {
            if (wireSelectionBar._done) return;
            wireSelectionBar._done = true;
            document.getElementById('pdfEditorPagesRotateLeft')?.addEventListener('click', () => {
                rotateSelected(-90);
            });
            document.getElementById('pdfEditorPagesRotateRight')?.addEventListener('click', () => {
                rotateSelected(90);
            });
            document.getElementById('pdfEditorPagesDelete')?.addEventListener('click', () => {
                deleteSelected();
            });
            document.getElementById('pdfEditorPagesSelectMode')?.addEventListener('click', () => {
                setMultiSelectMode(!multiSelectMode);
            });
            syncSelectModeUi();
        }

        async function renderThumbCanvas(canvas, pageState) {
            const pdfPage = await getPdfPage(pageState.sourceIndex);
            if (!pdfPage) return;

            const baseRot = pdfPage.rotate || 0;
            const extraRot = pageState.rotation || 0;
            const totalRot = (baseRot + extraRot) % 360;
            const viewport = pdfPage.getViewport({ scale: THUMB_SCALE, rotation: totalRot });

            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await pdfPage.render({
                canvasContext: canvas.getContext('2d'),
                viewport,
            }).promise;
        }

        function bindDragReorder(item) {
            item.addEventListener('dragstart', (e) => {
                if (multiSelectMode) {
                    e.preventDefault();
                    return;
                }
                draggedOrderIndex = parseInt(item.dataset.orderIndex, 10);
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragover', (e) => {
                if (multiSelectMode) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (draggedOrderIndex !== null) item.classList.add('drag-over');
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('drag-over');
                if (multiSelectMode) return;
                const targetIndex = parseInt(item.dataset.orderIndex, 10);
                if (draggedOrderIndex !== null && draggedOrderIndex !== targetIndex) {
                    if (typeof global.__pdfEditorBeforeEdit === 'function') global.__pdfEditorBeforeEdit();
                    global.PdfEditorDocumentModel.reorderPages(model, draggedOrderIndex, targetIndex);
                    onModelChange();
                }
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                document.querySelectorAll('.pdfEditorThumbItem').forEach((el) => el.classList.remove('drag-over'));
                draggedOrderIndex = null;
            });
        }

        async function renderThumbnails(selectedPageId) {
            const active = getActive();
            containerEl.innerHTML = '';

            // Keep selection in sync with active pages
            const activeIds = new Set(active.map((p) => p.id));
            selectedIds = new Set([...selectedIds].filter((id) => activeIds.has(id)));
            if (selectedPageId && activeIds.has(selectedPageId) && selectedIds.size === 0) {
                selectedIds.add(selectedPageId);
                anchorPageId = selectedPageId;
            }

            if (active.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'pdfEditorThumbEmpty langText';
                empty.id = 'pdfEditorNoPagesLeft';
                empty.textContent = 'No pages left';
                containerEl.appendChild(empty);
                emitSelection();
                if (typeof window.applyLanguage === 'function') window.applyLanguage();
                return;
            }

            for (let orderIndex = 0; orderIndex < active.length; orderIndex++) {
                const pageState = active[orderIndex];
                const item = document.createElement('div');
                item.className = 'pdfEditorThumbItem';
                item.dataset.pageId = pageState.id;
                item.dataset.orderIndex = String(orderIndex);
                item.draggable = !multiSelectMode;
                if (selectedIds.has(pageState.id)) {
                    item.classList.add('selected');
                }
                if (pageState.id === selectedPageId) {
                    item.classList.add('is-current');
                }

                const check = document.createElement('span');
                check.className = 'pdfEditorThumbCheck';
                check.setAttribute('aria-hidden', 'true');

                const card = document.createElement('div');
                card.className = 'pdfEditorThumbCard';

                const canvasWrap = document.createElement('div');
                canvasWrap.className = 'pdfEditorThumbCanvasWrap';
                const canvas = document.createElement('canvas');
                canvasWrap.appendChild(canvas);
                card.appendChild(canvasWrap);

                const caption = document.createElement('div');
                caption.className = 'pdfEditorThumbCaption';
                caption.textContent = String(orderIndex + 1);

                item.append(check, card, caption);
                item.addEventListener('click', (ev) => {
                    const additive = multiSelectMode || ev.metaKey || ev.ctrlKey;
                    setPrimarySelection(pageState.id, {
                        additive,
                        range: ev.shiftKey,
                    });
                });
                bindDragReorder(item);
                containerEl.appendChild(item);

                renderThumbCanvas(canvas, pageState);
            }

            containerEl.classList.toggle('pdfEditorThumbsMultiSelect', multiSelectMode);
            emitSelection();
            if (typeof window.applyLanguage === 'function') window.applyLanguage();
            // Re-apply select button label after i18n may overwrite it.
            syncSelectModeUi();
        }

        wireSelectionBar();

        return {
            renderThumbnails,
            getSelectedPageIds,
            rotateSelected,
            deleteSelected,
            setMultiSelectMode,
            isMultiSelectMode: () => multiSelectMode,
            setCurrentPage,
            syncThumbClasses: applyThumbClasses,
        };
    }

    global.PdfEditorPageThumbnails = { createPageThumbnails };
})(typeof window !== 'undefined' ? window : global);
