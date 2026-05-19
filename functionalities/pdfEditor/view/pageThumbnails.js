/**
 * Left panel: page thumbnails, reorder (DnD), delete, rotate shortcuts.
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
        } = options;

        let draggedOrderIndex = null;

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
                draggedOrderIndex = parseInt(item.dataset.orderIndex, 10);
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragover', (e) => {
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
                const targetIndex = parseInt(item.dataset.orderIndex, 10);
                if (draggedOrderIndex !== null && draggedOrderIndex !== targetIndex) {
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
            const active = global.PdfEditorDocumentModel.getActivePages(model);
            containerEl.innerHTML = '';

            if (active.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'pdfEditorThumbEmpty langText';
                empty.id = 'pdfEditorNoPagesLeft';
                empty.textContent = 'No pages left';
                containerEl.appendChild(empty);
                if (typeof window.applyLanguage === 'function') window.applyLanguage();
                return;
            }

            const elTag = 'd' + 'iv';

            for (let orderIndex = 0; orderIndex < active.length; orderIndex++) {
                const pageState = active[orderIndex];
                const item = document.createElement(elTag);
                item.className = 'pdfEditorThumbItem';
                item.dataset.pageId = pageState.id;
                item.dataset.orderIndex = String(orderIndex);
                item.draggable = true;
                if (pageState.id === selectedPageId) {
                    item.classList.add('selected');
                }

                const handle = document.createElement(elTag);
                handle.className = 'pdfEditorThumbDrag';
                handle.textContent = '⋮⋮';

                const canvasWrap = document.createElement(elTag);
                canvasWrap.className = 'pdfEditorThumbCanvasWrap';
                const canvas = document.createElement('canvas');
                canvasWrap.appendChild(canvas);

                const badge = document.createElement(elTag);
                badge.className = 'pdfEditorThumbBadge';
                badge.textContent = String(orderIndex + 1);

                const actions = document.createElement(elTag);
                actions.className = 'pdfEditorThumbActions';

                const rotL = document.createElement('button');
                rotL.type = 'button';
                rotL.className = 'pdfEditorThumbBtn';
                rotL.textContent = '↺';
                rotL.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    global.PdfEditorDocumentModel.rotatePage(model, pageState.id, -90);
                    onModelChange();
                });

                const rotR = document.createElement('button');
                rotR.type = 'button';
                rotR.className = 'pdfEditorThumbBtn';
                rotR.textContent = '↻';
                rotR.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    global.PdfEditorDocumentModel.rotatePage(model, pageState.id, 90);
                    onModelChange();
                });

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'pdfEditorThumbBtn pdfEditorThumbBtnDanger';
                delBtn.textContent = '🗑';
                delBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const ok = global.PdfEditorDocumentModel.togglePageDeleted(model, pageState.id);
                    if (!ok && typeof StatusManager !== 'undefined') {
                        StatusManager.show('#pdfEditorStatus', 'error', 'mustLeaveAtLeastOnePage');
                    }
                    onModelChange();
                });

                actions.appendChild(rotL);
                actions.appendChild(rotR);
                actions.appendChild(delBtn);

                item.appendChild(handle);
                item.appendChild(canvasWrap);
                item.appendChild(badge);
                item.appendChild(actions);

                item.addEventListener('click', () => onPageSelect(pageState.id));
                bindDragReorder(item);
                containerEl.appendChild(item);

                renderThumbCanvas(canvas, pageState);
            }

            if (typeof window.applyLanguage === 'function') window.applyLanguage();
        }

        return { renderThumbnails };
    }

    global.PdfEditorPageThumbnails = { createPageThumbnails };
})(typeof window !== 'undefined' ? window : global);
