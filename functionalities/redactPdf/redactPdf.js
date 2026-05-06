var { ipcRenderer } = require('electron');
const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

window.pdfjsLib.GlobalWorkerOptions.workerSrc = './../../libs/pdf.worker.min.js';

const STATUS = '#status';

const form = document.getElementById('redactForm');
const fileInput = document.getElementById('pdfFile');
const redactWorkspace = document.getElementById('redactWorkspace');
const pagesGrid = document.getElementById('pagesGrid');
const submitBtn = document.getElementById('submitBtn');
const finalSubmitGroup = document.getElementById('finalSubmitGroup');
const redactColorInput = document.getElementById('redactColor');
const redactionList = document.getElementById('redactionList');
const addBoxBtn = document.getElementById('addBoxBtn');

let originalFileBuffer = null;
let totalPages = 0;

let redactionsMap = new Map();
let pdfPageDimensions = new Map();

// Variables for Drag & Resize Engine
let activeAction = null;
let activeBoxDOM = null;
let initialRect = null;
let mouseStart = { x: 0, y: 0 };

fileInput.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) {
        redactWorkspace.style.display = 'none';
        finalSubmitGroup.style.display = 'none';
        submitBtn.disabled = true;
        return;
    }

    const blocked = await PdfEncryptionGuard.check(file, STATUS);
    if (blocked) {
        redactWorkspace.style.display = 'none';
        finalSubmitGroup.style.display = 'none';
        submitBtn.disabled = true;
        originalFileBuffer = null;
        return;
    }

    redactionsMap.clear();
    pdfPageDimensions.clear();
    updateRedactionSidebar();

    const fileArrayBuffer = await file.arrayBuffer();
    const previewBuffer = fileArrayBuffer.slice(0);
    originalFileBuffer = fileArrayBuffer.slice(0);

    redactWorkspace.style.display = 'flex';
    finalSubmitGroup.style.display = 'block';
    submitBtn.disabled = false;

    await renderPagePreviews(previewBuffer);
});

async function renderPagePreviews(buffer) {
    pagesGrid.innerHTML = `<p class="loadingText langText" data-i18n="loadingPdf">Loading document...</p>`;

    try {
        const loadingTask = window.pdfjsLib.getDocument({ data: buffer, disableWorker: true });
        const pdf = await loadingTask.promise;
        totalPages = pdf.numPages;

        pagesGrid.innerHTML = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const pageIndex = i - 1;
            const page = await pdf.getPage(i);

            const unscaledViewport = page.getViewport({ scale: 1 });
            pdfPageDimensions.set(pageIndex, { width: unscaledViewport.width, height: unscaledViewport.height });

            const scrollContainer = document.querySelector('.pagesScrollContainer');
            let targetWidth = scrollContainer.clientWidth - 40;

            if (targetWidth > 900) targetWidth = 900;
            if (targetWidth < 300) targetWidth = 300;

            const scale = targetWidth / unscaledViewport.width;
            const viewport = page.getViewport({ scale: scale });

            const wrapper = document.createElement('div');
            wrapper.className = 'pageWrapper';
            wrapper.dataset.pageIndex = pageIndex;

            const pdfCanvas = document.createElement('canvas');
            pdfCanvas.className = 'pdfCanvas';
            pdfCanvas.height = viewport.height;
            pdfCanvas.width = viewport.width;
            const pdfContext = pdfCanvas.getContext('2d');

            const redactionLayer = document.createElement('div');
            redactionLayer.className = 'redactionLayer';
            redactionLayer.id = `layer_${pageIndex}`;

            const badge = document.createElement('div');
            badge.className = 'pageBadge';
            badge.innerText = `Pg ${i}`;

            await page.render({ canvasContext: pdfContext, viewport: viewport }).promise;

            wrapper.appendChild(pdfCanvas);
            wrapper.appendChild(redactionLayer);
            wrapper.appendChild(badge);

            pagesGrid.appendChild(wrapper);
        }
    } catch (error) {
        console.error("Error rendering PDF preview:", error);
        pagesGrid.innerHTML = `<p class="errorText">Failed to load document preview.</p>`;
    }
}


function getCurrentPageIndex() {
    let bestIndex = 0;
    let minDistance = Infinity;
    const viewportCenter = window.innerHeight / 2;

    document.querySelectorAll('.pageWrapper').forEach(wrapper => {
        const rect = wrapper.getBoundingClientRect();
        const wrapperCenter = rect.top + rect.height / 2;
        const distance = Math.abs(viewportCenter - wrapperCenter);
        if (distance < minDistance) {
            minDistance = distance;
            bestIndex = parseInt(wrapper.dataset.pageIndex);
        }
    });
    return bestIndex;
}

addBoxBtn.addEventListener('click', () => {
    if (totalPages === 0) return;

    const pageIndex = getCurrentPageIndex();
    const layer = document.getElementById(`layer_${pageIndex}`);
    if (!layer) return;

    const boxW = 150;
    const boxH = 50;
    const boxX = (layer.offsetWidth / 2) - (boxW / 2);
    const boxY = (layer.offsetHeight / 2) - (boxH / 2);

    if (!redactionsMap.has(pageIndex)) redactionsMap.set(pageIndex, []);
    const rectList = redactionsMap.get(pageIndex);

    const getMsg = window.getMessage || (k => k);
    const defaultName = getMsg('redactionBlock') || 'Redaction Block';

    const uniqueId = `rect_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newRect = {
        id: uniqueId,
        name: `${defaultName} ${rectList.length + 1}`,
        x: boxX,
        y: boxY,
        w: boxW,
        h: boxH,
        color: redactColorInput.value
    };

    rectList.push(newRect);

    createBoxDOM(pageIndex, newRect, layer);
    updateRedactionSidebar();
});

function createBoxDOM(pageIndex, rect, layer) {
    const box = document.createElement('div');
    box.className = 'redactionBox active';
    box.dataset.id = rect.id;
    box.dataset.pageIndex = pageIndex;
    box.style.left = rect.x + 'px';
    box.style.top = rect.y + 'px';
    box.style.width = rect.w + 'px';
    box.style.height = rect.h + 'px';
    box.style.backgroundColor = rect.color;
    box.style.zIndex = 10 + (redactionsMap.get(pageIndex).length - 1);

    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    handles.forEach(pos => {
        const h = document.createElement('div');
        h.className = `handle ${pos}`;
        h.dataset.action = pos;
        box.appendChild(h);
    });

    box.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.redactionBox').forEach(b => b.classList.remove('active'));
        box.classList.add('active');

        activeBoxDOM = box;
        mouseStart = { x: e.clientX, y: e.clientY };
        initialRect = {
            l: parseFloat(box.style.left),
            t: parseFloat(box.style.top),
            w: parseFloat(box.style.width),
            h: parseFloat(box.style.height)
        };

        const pageRects = redactionsMap.get(pageIndex);
        const thisRect = pageRects.find(r => r.id === rect.id);
        if (thisRect) {
            redactColorInput.value = thisRect.color;
        }

        if (e.target.classList.contains('handle')) {
            activeAction = e.target.dataset.action;
        } else {
            activeAction = 'drag';
        }
    });
    layer.appendChild(box);
}

document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.redactionBox') && !e.target.closest('.addBoxBtn')) {
        document.querySelectorAll('.redactionBox').forEach(b => b.classList.remove('active'));
    }
});


document.addEventListener('mousemove', (e) => {
    if (!activeAction || !activeBoxDOM) return;

    const dx = e.clientX - mouseStart.x;
    const dy = e.clientY - mouseStart.y;
    let { l, t, w, h } = initialRect;


    const parent = activeBoxDOM.parentElement;
    const maxW = parent.offsetWidth;
    const maxH = parent.offsetHeight;

    if (activeAction === 'drag') {
        l += dx;
        t += dy;


        if (l < 0) l = 0;
        if (t < 0) t = 0;
        if (l + w > maxW) l = maxW - w;
        if (t + h > maxH) t = maxH - h;
    } else {

        if (activeAction.includes('w')) {
            let proposedL = initialRect.l + dx;
            let proposedW = initialRect.w - dx;


            if (proposedL < 0) {
                proposedW = initialRect.w + initialRect.l;
                proposedL = 0;
            }
            if (proposedW >= 20) {
                l = proposedL;
                w = proposedW;
            }
        }

        if (activeAction.includes('e')) {
            let proposedW = initialRect.w + dx;


            if (initialRect.l + proposedW > maxW) {
                proposedW = maxW - initialRect.l;
            }
            if (proposedW >= 20) w = proposedW;
        }

        if (activeAction.includes('n')) {
            let proposedT = initialRect.t + dy;
            let proposedH = initialRect.h - dy;


            if (proposedT < 0) {
                proposedH = initialRect.h + initialRect.t;
                proposedT = 0;
            }
            if (proposedH >= 20) {
                t = proposedT;
                h = proposedH;
            }
        }

        if (activeAction.includes('s')) {
            let proposedH = initialRect.h + dy;


            if (initialRect.t + proposedH > maxH) {
                proposedH = maxH - initialRect.t;
            }
            if (proposedH >= 20) h = proposedH;
        }
    }


    activeBoxDOM.style.left = l + 'px';
    activeBoxDOM.style.top = t + 'px';
    activeBoxDOM.style.width = w + 'px';
    activeBoxDOM.style.height = h + 'px';
});

document.addEventListener('mouseup', () => {
    if (activeAction && activeBoxDOM) {
        const pageIndex = parseInt(activeBoxDOM.dataset.pageIndex);
        const boxId = activeBoxDOM.dataset.id;

        const rects = redactionsMap.get(pageIndex);
        const rectObj = rects.find(r => r.id === boxId);
        if (rectObj) {
            rectObj.x = parseFloat(activeBoxDOM.style.left);
            rectObj.y = parseFloat(activeBoxDOM.style.top);
            rectObj.w = parseFloat(activeBoxDOM.style.width);
            rectObj.h = parseFloat(activeBoxDOM.style.height);
            updateRedactionSidebar();
        }
    }
    activeAction = null;
    activeBoxDOM = null;
});

function clearPageRedactions(pageIndex) {
    redactionsMap.set(pageIndex, []);
    const layer = document.getElementById(`layer_${pageIndex}`);
    if (layer) layer.innerHTML = '';
    updateRedactionSidebar();
}

function removeSingleRedaction(pageIndex, rectId) {
    let rects = redactionsMap.get(pageIndex);
    if (!rects) return;


    redactionsMap.set(pageIndex, rects.filter(r => r.id !== rectId));


    const boxDom = document.querySelector(`.redactionBox[data-id="${rectId}"]`);
    if (boxDom) boxDom.remove();

    updateRedactionSidebar();
}

function updateRedactionSidebar() {
    redactionList.innerHTML = '';
    let totalRects = 0;


    const getMsg = window.getMessage || (k => k);

    for (let [pageIndex, rects] of redactionsMap.entries()) {
        if (rects.length === 0) continue;

        const pageGroup = document.createElement('div');
        pageGroup.className = 'sidebarPageGroup';

        const groupHeader = document.createElement('div');
        groupHeader.className = 'pageGroupHeader';


        groupHeader.innerHTML = `
            <h4 class="pageGroupTitle">${getMsg('pageWord') || 'Page'} ${pageIndex + 1}</h4>
            <button type="button" class="clearAllPageBtn" data-page="${pageIndex}">${getMsg('clearAllBtn') || 'Clear All'}</button>
        `;
        pageGroup.appendChild(groupHeader);

        const reversedRects = rects.slice().reverse();

        reversedRects.forEach(rect => {
            totalRects++;
            const item = document.createElement('div');
            item.className = 'layerItem';

            item.draggable = true;
            item.dataset.id = rect.id;
            item.dataset.page = pageIndex;

            item.innerHTML = `
                <div class="dragHandle" title="Drag to reorder">⋮⋮</div>
                <div class="layerInfo">
                    <div class="layerText" style="display:flex; align-items:center; gap:8px;">
                        <input type="color" class="layerColorPicker" data-page="${pageIndex}" data-id="${rect.id}" value="${rect.color}" title="Change block color">
                        <input type="text" class="layerNameInput" data-page="${pageIndex}" data-id="${rect.id}" value="${rect.name}" />
                    </div>
                </div>
                <div class="layerActions">
                    <button type="button" class="layerBtn removeLayerBtn" data-page="${pageIndex}" data-id="${rect.id}">${getMsg('removeBtn') || 'Remove'}</button>
                </div>
            `;

            item.addEventListener('mouseenter', () => {
                const b = document.querySelector(`.redactionBox[data-id="${rect.id}"]`);
                if (b && !b.classList.contains('active')) b.style.boxShadow = '0 0 0 3px var(--reindalYellow)';
            });
            item.addEventListener('mouseleave', () => {
                const b = document.querySelector(`.redactionBox[data-id="${rect.id}"]`);
                if (b) b.style.boxShadow = 'none';
            });

            item.addEventListener('click', (e) => {
                if (e.target.closest('.dragHandle') ||
                    e.target.tagName === 'INPUT' ||
                    e.target.tagName === 'BUTTON') {
                    return;
                }

                document.querySelectorAll('.redactionBox').forEach(b => {
                    b.classList.remove('active');
                    b.style.boxShadow = 'none';
                });

                const boxDom = document.querySelector(`.redactionBox[data-id="${rect.id}"]`);
                if (boxDom) {
                    boxDom.classList.add('active');
                    activeBoxDOM = boxDom;
                    redactColorInput.value = rect.color;
                    boxDom.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });

            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragenter', handleDragEnter);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('dragleave', handleDragLeave);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);

            pageGroup.appendChild(item);
        });

        redactionList.appendChild(pageGroup);
    }

    if (totalRects === 0) {

        redactionList.innerHTML = `<p class="placeholderText">${getMsg('noRedactionsYet') || 'No redactions created yet.'}</p>`;
    }


    document.querySelectorAll('.removeLayerBtn').forEach(btn => {
        btn.addEventListener('click', function () {
            const page = parseInt(this.dataset.page);
            const id = this.dataset.id;
            removeSingleRedaction(page, id);
        });
    });


    document.querySelectorAll('.clearAllPageBtn').forEach(btn => {
        btn.addEventListener('click', function () {
            const page = parseInt(this.dataset.page);
            clearPageRedactions(page);
        });
    });


    document.querySelectorAll('.layerNameInput').forEach(input => {
        input.addEventListener('change', function () {
            const page = parseInt(this.dataset.page);
            const id = this.dataset.id;
            const newName = this.value.trim() || 'Unnamed Block';

            const rects = redactionsMap.get(page);
            const rect = rects.find(r => r.id === id);
            if (rect) {
                rect.name = newName;
                this.value = newName;
            }
        });
        input.addEventListener('mousedown', (e) => e.stopPropagation());
    });


    document.querySelectorAll('.layerColorPicker').forEach(picker => {
        picker.addEventListener('input', function (e) {
            const page = parseInt(this.dataset.page);
            const id = this.dataset.id;
            const newColor = this.value;

            const rects = redactionsMap.get(page);
            const rectObj = rects.find(r => r.id === id);
            if (rectObj) {
                rectObj.color = newColor;
            }

            const boxDom = document.querySelector(`.redactionBox[data-id="${id}"]`);
            if (boxDom) {
                boxDom.style.backgroundColor = newColor;
                if (activeBoxDOM && activeBoxDOM.dataset.id === id) {
                    redactColorInput.value = newColor;
                }
            }
        });
        picker.addEventListener('mousedown', (e) => e.stopPropagation());
    });
}

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return rgb(
        parseInt(hex.substring(0, 2), 16) / 255,
        parseInt(hex.substring(2, 4), 16) / 255,
        parseInt(hex.substring(4, 6), 16) / 255
    );
}



let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    e.dataTransfer.effectAllowed = 'move';
    this.classList.add('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    e.preventDefault();

    if (this !== draggedItem && this.dataset.page === draggedItem?.dataset.page) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.stopPropagation();
    this.classList.remove('drag-over');

    if (draggedItem && draggedItem !== this && this.dataset.page === draggedItem.dataset.page) {
        const pageIndex = parseInt(this.dataset.page);
        const draggedId = draggedItem.dataset.id;
        const targetId = this.dataset.id;

        reorderRedactions(pageIndex, draggedId, targetId);
    }
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.layerItem').forEach(item => item.classList.remove('drag-over'));
    draggedItem = null;
}

function reorderRedactions(pageIndex, draggedId, targetId) {
    let rects = redactionsMap.get(pageIndex);


    let visualArray = rects.slice().reverse();

    const draggedIndex = visualArray.findIndex(r => r.id === draggedId);

    if (draggedIndex > -1) {

        const [draggedRect] = visualArray.splice(draggedIndex, 1);


        const targetIndex = visualArray.findIndex(r => r.id === targetId);

        if (targetIndex > -1) {

            visualArray.splice(targetIndex, 0, draggedRect);


            redactionsMap.set(pageIndex, visualArray.reverse());

            updateBoxesZIndex(pageIndex);
            updateRedactionSidebar();
        }
    }
}

function updateBoxesZIndex(pageIndex) {
    const rects = redactionsMap.get(pageIndex) || [];
    rects.forEach((rect, index) => {
        const boxDom = document.querySelector(`.redactionBox[data-id="${rect.id}"]`);
        if (boxDom) {

            boxDom.style.zIndex = 10 + index;
        }
    });
}


redactColorInput.addEventListener('input', (e) => {
    const newColor = e.target.value;


    if (activeBoxDOM) {
        const pageIndex = parseInt(activeBoxDOM.dataset.pageIndex);
        const boxId = activeBoxDOM.dataset.id;


        activeBoxDOM.style.backgroundColor = newColor;


        const rects = redactionsMap.get(pageIndex);
        const rect = rects.find(r => r.id === boxId);
        if (rect) rect.color = newColor;


        const sidebarPicker = document.querySelector(`.layerColorPicker[data-id="${boxId}"]`);
        if (sidebarPicker) sidebarPicker.value = newColor;
    }
});

form.addEventListener('submit', async function (e) {
    e.preventDefault();

    let hasRedactions = false;
    for (let [pageIndex, rects] of redactionsMap.entries()) {
        if (rects.length > 0) {
            hasRedactions = true;
            break;
        }
    }

    if (!hasRedactions) {
        StatusManager.show(STATUS, 'info', 'noRedactionsAdded');
        setTimeout(() => StatusManager.hide(STATUS), 5000);
        return;
    }

    submitBtn.disabled = true;
    StatusManager.show(STATUS, 'processing', 'processing');

    try {
        const pdfDoc = await PDFDocument.load(originalFileBuffer.slice(0));

        const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
        if (finalMetadata.author) pdfDoc.setAuthor(finalMetadata.author);
        if (finalMetadata.title) pdfDoc.setTitle(finalMetadata.title);
        if (finalMetadata.subject) pdfDoc.setSubject(finalMetadata.subject);

        const pages = pdfDoc.getPages();

        for (let i = 0; i < pages.length; i++) {
            const rects = redactionsMap.get(i) || [];
            if (rects.length === 0) continue;

            const page = pages[i];
            const originalDims = pdfPageDimensions.get(i);


            const layerDom = document.getElementById(`layer_${i}`);
            const uiCanvasWidth = layerDom ? layerDom.offsetWidth : 600;
            const uiScale = uiCanvasWidth / originalDims.width;

            rects.forEach(rect => {
                const pdfX = rect.x / uiScale;
                const pdfWidth = rect.w / uiScale;
                const pdfHeight = rect.h / uiScale;

                const canvasY = rect.y / uiScale;
                const pdfY = originalDims.height - canvasY - pdfHeight;

                page.drawRectangle({
                    x: pdfX,
                    y: pdfY,
                    width: pdfWidth,
                    height: pdfHeight,
                    color: hexToRgb(rect.color),
                    borderWidth: 0,
                });
            });
        }

        const pdfBytes = await pdfDoc.save();
        const originalName = fileInput.files[0].name.replace('.pdf', '');
        const filename = `${originalName}_redacted.pdf`;

        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const savePath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: path.join(downloadsPath, filename),
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (!savePath) {
            StatusManager.show(STATUS, 'error', 'saveCancelled');
            submitBtn.disabled = false;
            return;
        }

        await fs.writeFile(savePath, pdfBytes);

        StatusManager.show(STATUS, 'success', 'successPdfCreated', {
            filename: path.basename(savePath),
            savePath: savePath
        });

        setTimeout(() => CustomMetadataModule.reset(), 2000);

        redactWorkspace.style.display = 'none';
        finalSubmitGroup.style.display = 'none';
        form.reset();
        redactionsMap.clear();
        pdfPageDimensions.clear();

    } catch (error) {
        console.error(error);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
    } finally {
        submitBtn.disabled = false;
    }
});