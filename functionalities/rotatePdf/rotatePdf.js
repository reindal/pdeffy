var { ipcRenderer } = require('electron');
const { PDFDocument, degrees } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

window.pdfjsLib.GlobalWorkerOptions.workerSrc = './../../libs/pdf.worker.min.js';

const STATUS = '#status';

const fileInput = document.getElementById('pdfFile');
const pagesGrid = document.getElementById('pagesGrid');
const submitBtn = document.getElementById('submitBtn');
const colCountInput = document.getElementById('colCountInput');

// Sidebar Controls
const selectAllBtn = document.getElementById('selectAllBtn');
const deselectAllBtn = document.getElementById('deselectAllBtn');
const rangeInput = document.getElementById('rangeInput');
const rangeModeBtn = document.getElementById('rangeModeBtn');
const applyRangeBtn = document.getElementById('applyRangeBtn');
const rotateLeftBtn = document.getElementById('rotateLeftBtn');
const rotateRightBtn = document.getElementById('rotateRightBtn');

let originalFileBuffer = null;
let selectedFile = null;
let selectedPages = new Set();
let pageRotations = new Map(); // Maps pageIndex -> absolute accumulated rotation
let totalPages = 0;
let pdfPagesCache = []; // Cache pages to make rotation extremely fast

// Update grid columns dynamically
colCountInput.addEventListener('input', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 4) val = 4;
    pagesGrid.style.setProperty('--col-count', val);
});

fileInput.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) {
        clearWorkspace();
        return;
    }

    const blocked = await PdfEncryptionGuard.check(file, STATUS);
    if (blocked) {
        clearWorkspace();
        return;
    }

    selectedFile = file;
    selectedPages.clear();
    pageRotations.clear();
    pdfPagesCache = [];
    
    const fileArrayBuffer = await file.arrayBuffer();
    const previewBuffer = fileArrayBuffer.slice(0);
    originalFileBuffer = fileArrayBuffer.slice(0);

    checkSubmitState();
    await loadPdfCore(previewBuffer);
});

function clearWorkspace() {
    selectedFile = null;
    originalFileBuffer = null;
    selectedPages.clear();
    pageRotations.clear();
    pdfPagesCache = [];
    
    const placeholderMsg = (typeof window.getMessage === 'function') 
        ? window.getMessage('waitingForPdf') 
        : 'Waiting for PDF file...';
        
    pagesGrid.innerHTML = `<p class="placeholderText langText" data-i18n="waitingForPdf">${placeholderMsg}</p>`;
    checkSubmitState();
}

// Renders a single page onto its specific canvas, delegating sizing to CSS percentages
async function drawCanvas(pageIndex, rotation = 0) {
    const page = pdfPagesCache[pageIndex];
    if (!page) return;

    const originalRotation = page.rotate || 0;
    const normalizedAddedRot = ((rotation % 360) + 360) % 360;
    const totalRotation = (originalRotation + normalizedAddedRot) % 360;

    // Renderize at a fixed high quality. CSS (width: 90%) will handle the responsive resizing!
    const scale = 1.5; 
    const viewport = page.getViewport({ scale: scale, rotation: totalRotation });

    const wrapper = document.querySelector(`.pageItem[data-page-index="${pageIndex}"]`);
    if (!wrapper) return;
    
    const canvas = wrapper.querySelector('canvas');
    const context = canvas.getContext('2d');
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({ canvasContext: context, viewport: viewport }).promise;
}

async function loadPdfCore(buffer) {
    const loadingMsg = (typeof window.getMessage === 'function') 
        ? window.getMessage('loadingPdf') 
        : 'Loading document...';
        
    pagesGrid.innerHTML = `<p class="loadingText langText" data-i18n="loadingPdf">${loadingMsg}</p>`;
    
    try {
        const loadingTask = window.pdfjsLib.getDocument({ data: buffer, disableWorker: true });
        const pdf = await loadingTask.promise;
        totalPages = pdf.numPages;

        pagesGrid.innerHTML = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            // Cache the page for fast re-rendering during rotation
            const page = await pdf.getPage(i);
            pdfPagesCache[i - 1] = page;

            const wrapper = document.createElement('div');
            wrapper.className = 'pageItem';
            wrapper.dataset.pageIndex = i - 1;

            const canvasWrapper = document.createElement('div');
            canvasWrapper.className = 'canvasWrapper';

            const canvas = document.createElement('canvas');

            const badge = document.createElement('div');
            badge.className = 'pageBadge';
            badge.innerText = i;

            canvasWrapper.appendChild(canvas);
            wrapper.appendChild(canvasWrapper);
            wrapper.appendChild(badge);

            wrapper.addEventListener('click', () => {
                const idx = i - 1;
                if (selectedPages.has(idx)) {
                    selectedPages.delete(idx);
                    wrapper.classList.remove('selected');
                } else {
                    selectedPages.add(idx);
                    wrapper.classList.add('selected');
                }
            });

            pagesGrid.appendChild(wrapper);
            
            // Draw initial state
            await drawCanvas(i - 1, 0);
        }
    } catch (error) {
        console.error("Error rendering PDF:", error);
        pagesGrid.innerHTML = `<p class="errorText">Failed to load document.</p>`;
    }
}

// --- Selection Tools ---

selectAllBtn.addEventListener('click', () => {
    for (let i = 0; i < totalPages; i++) selectedPages.add(i);
    updateGridSelectionUI();
});

deselectAllBtn.addEventListener('click', () => {
    selectedPages.clear();
    updateGridSelectionUI();
});

rangeModeBtn.addEventListener('click', () => {
    const currentMode = rangeModeBtn.dataset.mode;
    if (currentMode === 'select') {
        rangeModeBtn.dataset.mode = 'deselect';
        rangeModeBtn.classList.remove('selectMode');
        rangeModeBtn.classList.add('deselectMode');
        rangeModeBtn.innerText = (typeof window.getMessage === 'function') 
            ? window.getMessage('modeDeselect') || 'Mode: Deselect' 
            : 'Mode: Deselect';
    } else {
        rangeModeBtn.dataset.mode = 'select';
        rangeModeBtn.classList.remove('deselectMode');
        rangeModeBtn.classList.add('selectMode');
        rangeModeBtn.innerText = (typeof window.getMessage === 'function') 
            ? window.getMessage('modeSelect') || 'Mode: Select' 
            : 'Mode: Select';
    }
});

applyRangeBtn.addEventListener('click', () => {
    const val = rangeInput.value.trim();
    
    // Validates: "5", "1-5", " 2 - 8 " etc.
    const rangeRegex = /^\s*\d+\s*(-\s*\d+\s*)?$/;
    
    if (!rangeRegex.test(val)) {
        StatusManager.show(STATUS, 'error', 'invalidRangeFormat');
        setTimeout(() => StatusManager.hide(STATUS), 6000); 
        return;
    }

    const mode = rangeModeBtn.dataset.mode;
    const parts = val.split('-');
    let start = parseInt(parts[0], 10);
    let end = parts.length > 1 ? parseInt(parts[1], 10) : start;

    if (start > end) {
        const temp = start; start = end; end = temp;
    }

    start = Math.max(1, start);
    end = Math.min(totalPages, end);

    for (let i = start; i <= end; i++) {
        const idx = i - 1;
        if (mode === 'select') selectedPages.add(idx);
        else selectedPages.delete(idx);
    }
    
    updateGridSelectionUI();
});

function updateGridSelectionUI() {
    const items = document.querySelectorAll('.pageItem');
    items.forEach(item => {
        const idx = parseInt(item.dataset.pageIndex, 10);
        if (selectedPages.has(idx)) item.classList.add('selected');
        else item.classList.remove('selected');
    });
}

// --- Rotation Tools ---

async function applyVisualRotation(direction) {
    if (selectedPages.size === 0) {
        StatusManager.show(STATUS, 'info', 'selectPagesFirst');
        setTimeout(() => StatusManager.hide(STATUS), 6000); 
        return;
    }

    const delta = direction === 'right' ? 90 : -90;
    const renderPromises = [];

    selectedPages.forEach(idx => {
        let currentRot = pageRotations.get(idx) || 0;
        currentRot += delta; 
        pageRotations.set(idx, currentRot);

        // Native PDF.js re-render instead of CSS transform
        renderPromises.push(drawCanvas(idx, currentRot));
    });

    await Promise.all(renderPromises);
    checkSubmitState();
}

rotateLeftBtn.addEventListener('click', () => applyVisualRotation('left'));
rotateRightBtn.addEventListener('click', () => applyVisualRotation('right'));

function checkSubmitState() {
    let hasModifications = false;
    for (let [idx, rot] of pageRotations.entries()) {
        if (rot % 360 !== 0) { 
            hasModifications = true;
            break;
        }
    }
    submitBtn.disabled = !hasModifications;
}

// --- Final Generation ---

submitBtn.addEventListener('click', async function (e) {
    e.preventDefault();
    submitBtn.disabled = true;
    StatusManager.show(STATUS, 'processing', 'processing');

    try {
        const pdfDoc = await PDFDocument.load(originalFileBuffer.slice(0));

        const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
        if (finalMetadata.author) pdfDoc.setAuthor(finalMetadata.author);
        if (finalMetadata.title) pdfDoc.setTitle(finalMetadata.title);
        if (finalMetadata.subject) pdfDoc.setSubject(finalMetadata.subject);

        for (let i = 0; i < totalPages; i++) {
            const addedRotation = pageRotations.get(i) || 0;
            if (addedRotation % 360 !== 0) {
                const page = pdfDoc.getPage(i);
                const currentRot = page.getRotation().angle;
                
                // Properly handle negative modulos
                const normalizedAddedRot = ((addedRotation % 360) + 360) % 360;
                const newRot = (currentRot + normalizedAddedRot) % 360;
                
                page.setRotation(degrees(newRot));
            }
        }

        const pdfBytes = await pdfDoc.save();
        
        // Use the original filename + _rotated
        const originalName = selectedFile.name.replace('.pdf', '');
        const filename = `${originalName}_rotated.pdf`;
        
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const savePath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: path.join(downloadsPath, filename),
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (!savePath) {
            StatusManager.show(STATUS, 'error', 'saveCancelled');
            submitBtn.disabled = false;
            setTimeout(() => StatusManager.hide(STATUS), 6000); 
            return;
        }

        await fs.writeFile(savePath, pdfBytes);

        StatusManager.show(STATUS, 'success', 'successPdfCreated', {
            filename: path.basename(savePath),
            savePath: savePath
        });

        setTimeout(() => CustomMetadataModule.reset(), 2000);

    } catch (error) {
        console.error(error);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
    } finally {
        submitBtn.disabled = false;
    }
});