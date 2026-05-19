const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');

const STATUS = '#status';

if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = './../../libs/pdf.worker.min.js';
}

const form = document.getElementById('watermarkForm');
const pdfFileInput = document.getElementById('pdfFile');
const watermarkTextInput = document.getElementById('watermarkPlaceholder');
const fontSizeInput = document.getElementById('fontSize');
const opacityInput = document.getElementById('opacity');
const opacityValue = document.getElementById('opacityValue');
const rotationSelect = document.getElementById('rotation');
const customRotationInput = document.getElementById('customRotation');
const colorSelect = document.getElementById('color');
const customColorWrapper = document.getElementById('customColorWrapper');
const customColorHex = document.getElementById('customColorHex');
const colorPicker = document.getElementById('colorPicker');
const colorError = document.getElementById('colorError');
const customRotationWrapper = document.getElementById('customRotationWrapper');
const customRotSlider = document.getElementById('customRotSlider');
const layersHeaderBtn = document.getElementById('layersHeaderBtn');
const layersListWrapper = document.getElementById('layersListWrapper');
const layersToggleIcon = document.getElementById('layersToggleIcon');

const submitBtn = document.getElementById('submitBtn');
const fileNameDiv = document.getElementById('fileName');
const addLayerBtn = document.getElementById('addLayerBtn');
const previewSection = document.getElementById('previewSection');
const pagesGrid = document.getElementById('pagesGrid');
const layersContainer = document.getElementById('watermarkLayersContainer');
const layersList = document.getElementById('layersList');

const watermarkWorkspace = document.getElementById('watermarkWorkspace');
const finalSubmitGroup = document.getElementById('finalSubmitGroup');
const watermarkContainer = document.querySelector('.watermarkContainer');

const typeRadios = document.querySelectorAll('input[name="watermarkType"]');
const textSettingsGroup = document.getElementById('textSettingsGroup');
const imageSettingsGroup = document.getElementById('imageSettingsGroup');
const imageFileInput = document.getElementById('imageFile');
const imageFileNameDiv = document.getElementById('imageFileName');
const imageScaleInput = document.getElementById('imageScale');

let selectedFile = null;
let originalFileBuffer = null;
let watermarkLayers = [];
let editingLayerIndex = null;
let pdfPageDimensions = new Map();
let activeWatermarkId = null;
let dragState = null;

let currentImageFile = null;
let currentImageObj = null;
let currentImageBytes = null;

customColorHex.value = '#000000';
colorPicker.value = '#000000';

opacityInput.addEventListener('input', function() {
    opacityValue.textContent = this.value + '%';
    updatePreview();
});

rotationSelect.addEventListener('change', function() {
    if (this.value !== 'custom') {
        const val = parseInt(this.value) || 0;
        customRotSlider.value = val;
        customRotationInput.value = val;
    }
    updatePreview();
});

// Sync Inputs to Select
function syncRotationInputs(sourceElement) {
    let val = parseInt(sourceElement.value) || 0;
    
    // Set limits
    if (val < -360) val = -360;
    if (val > 360) val = 360;

    customRotSlider.value = val;
    customRotationInput.value = val;
    
    // Automatically switch select to 'custom' when manually edited
    rotationSelect.value = 'custom';
    updatePreview();
}

customRotSlider.addEventListener('input', () => syncRotationInputs(customRotSlider));
customRotationInput.addEventListener('input', () => syncRotationInputs(customRotationInput));

colorSelect.addEventListener('change', function() {
    if (this.value === 'custom') {
        customColorWrapper.style.display = 'block';
        customColorHex.required = true;
        validateColor();
    } else {
        customColorWrapper.style.display = 'none';
        customColorHex.required = false;
        colorError.textContent = '';
    }
    updatePreview();
});

customColorHex.addEventListener('input', function() {
    if (validateColor()) colorPicker.value = customColorHex.value;
    updatePreview();
});

colorPicker.addEventListener('input', function() {
    customColorHex.value = this.value.toUpperCase();
    validateColor();
    updatePreview();
});

typeRadios.forEach(radio => {
    radio.addEventListener('change', function() {
        if (this.value === 'text') {
            textSettingsGroup.style.display = 'block';
            imageSettingsGroup.style.display = 'none';
        } else {
            textSettingsGroup.style.display = 'none';
            imageSettingsGroup.style.display = 'block';
        }
        updatePreview();
    });
});

imageFileInput.addEventListener('change', async function(e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        currentImageFile = file;
        currentImageBytes = await file.arrayBuffer();
        
        
        const reader = new FileReader();
        reader.onload = (event) => {
            currentImageObj = new Image();
            currentImageObj.onload = () => {
                updatePreview();
            };
            currentImageObj.src = event.target.result;
        };
        reader.readAsDataURL(file);

        if (imageFileNameDiv) {
            const prefix = window.getMessage ? window.getMessage('selectedFile') : 'Selected: ';
            imageFileNameDiv.textContent = `${prefix}${file.name}`;
        }
    } else {
        currentImageFile = null;
        currentImageObj = null;
        currentImageBytes = null;
        if (imageFileNameDiv) imageFileNameDiv.textContent = '';
        updatePreview();
    }
});

[watermarkTextInput, fontSizeInput, customRotationInput, imageScaleInput].forEach(element => {
    element.addEventListener('input', updatePreview);
    element.addEventListener('change', updatePreview);
});

function validateColor() {
    const hexValue = customColorHex.value.trim();
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;

    if (hexValue === '') {
        customColorHex.classList.remove('valid', 'invalid');
        colorError.textContent = '';
        return false;
    }

    if (hexPattern.test(hexValue)) {
        customColorHex.classList.remove('invalid', 'valid');
        customColorHex.classList.add('valid');
        colorError.textContent = '';
        colorPicker.value = hexValue;
        return true;
    } else {
        customColorHex.classList.remove('valid');
        customColorHex.classList.add('invalid');
        colorError.textContent = window.getMessage ? window.getMessage('invalidHexColor') : 'Invalid HEX';
        return false;
    }
}

function updateFileNameDisplay() {
    if (selectedFile && fileNameDiv) {
        const prefix = window.getMessage ? window.getMessage('selectedFile') : 'Selected: ';
        fileNameDiv.textContent = `${prefix}${selectedFile.name}`;
    }
}

if (typeof window.changeLanguage === 'function') {
    const originalChangeLanguage = window.changeLanguage;
    window.changeLanguage = function(lang) {
        originalChangeLanguage(lang);
        updateFileNameDisplay();
        updateLayersList();
    };
}

function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function renderPagePreviews(buffer) {
    pagesGrid.innerHTML = `<p class="loadingText langText" data-i18n="loadingPdf">Loading document...</p>`;

    const loadingTask = window.pdfjsLib.getDocument({ data: buffer, disableWorker: true });
    const pdf = await loadingTask.promise;
    pagesGrid.innerHTML = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const pageIndex = i - 1;
        const page = await pdf.getPage(i);
        const unscaledViewport = page.getViewport({ scale: 1 });
        pdfPageDimensions.set(pageIndex, {
            width: unscaledViewport.width,
            height: unscaledViewport.height,
        });

        const scrollContainer = document.querySelector('.pagesScrollContainer');
        let targetWidth = scrollContainer.clientWidth - 40;
        if (targetWidth > 850) targetWidth = 850;
        if (targetWidth < 300) targetWidth = 300;

        const scale = targetWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        const wrapper = document.createElement('div');
        wrapper.className = 'pageWrapper';
        wrapper.dataset.pageIndex = pageIndex;

        const pdfCanvas = document.createElement('canvas');
        pdfCanvas.className = 'pdfCanvas';
        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        const pdfContext = pdfCanvas.getContext('2d');

        const watermarkLayer = document.createElement('div');
        watermarkLayer.className = 'watermarkLayer';
        watermarkLayer.id = `watermarkLayer_${pageIndex}`;

        const badge = document.createElement('div');
        badge.className = 'pageBadge';
        badge.innerText = `Pg ${i}`;

        await page.render({ canvasContext: pdfContext, viewport }).promise;

        wrapper.appendChild(pdfCanvas);
        wrapper.appendChild(watermarkLayer);
        wrapper.appendChild(badge);
        pagesGrid.appendChild(wrapper);
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

function getLayerElement(pageIndex) {
    return document.getElementById(`watermarkLayer_${pageIndex}`);
}

pdfFileInput.addEventListener('change', async function(e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const blocked = await PdfEncryptionGuard.check(file, STATUS);
        if (blocked) {
            selectedFile = null;
            originalFileBuffer = null;
            return;
        }

        selectedFile = file;
        updateFileNameDisplay();
        watermarkWorkspace.style.display = 'flex';
        finalSubmitGroup.style.display = 'block';
        watermarkContainer.classList.add('expanded');

        try {
            const fileBuffer = await selectedFile.arrayBuffer();
            originalFileBuffer = fileBuffer.slice(0);
            watermarkLayers = [];
            activeWatermarkId = null;
            editingLayerIndex = null;
            pdfPageDimensions.clear();
            await renderPagePreviews(fileBuffer.slice(0));
        } catch (error) {
            console.error('Error loading PDF for preview:', error);
            originalFileBuffer = null;
            pdfPageDimensions.clear();
            pagesGrid.innerHTML = `<p class="errorText">Failed to load document preview.</p>`;
        }

        updateLayersList();
        updatePreview();
    } else {
        selectedFile = null;
        originalFileBuffer = null;
        watermarkLayers = [];
        activeWatermarkId = null;
        pdfPageDimensions.clear();
        pagesGrid.innerHTML = '';
        watermarkWorkspace.style.display = 'none';
        finalSubmitGroup.style.display = 'none';
        watermarkContainer.classList.remove('expanded');
    }
});

if (layersHeaderBtn) {
    layersHeaderBtn.addEventListener('click', () => {
        layersListWrapper.classList.toggle('collapsed');
        layersToggleIcon.classList.toggle('collapsed');
    });
}

function getCurrentFormLayer() {
    const isImageMode = document.getElementById('typeImage').checked;

    let rotation = parseInt(customRotationInput.value);
    if (isNaN(rotation)) rotation = 0;
    if (rotationSelect.value === 'custom') {
        rotation = parseInt(customRotationInput.value);
        if (isNaN(rotation)) rotation = 0;
    } else {
        rotation = parseInt(rotationSelect.value);
    }

    if (isImageMode) {
        if (!currentImageObj) return null;
        return {
            type: 'image',
            imageFile: currentImageFile,
            imageObj: currentImageObj,
            imageBytes: currentImageBytes,
            imageScale: parseInt(imageScaleInput.value) || 50,
            opacity: parseInt(opacityInput.value) / 100,
            rotation,
            posX: 50,
            posY: 50,
            isPreview: true
        };
    } else {
        const watermarkText = watermarkTextInput.value.trim();
        if (!watermarkText) return null;

        const colorValue = colorSelect.value;
        let textColor = colorValue;
        if (colorValue === 'custom') {
            textColor = validateColor() ? customColorHex.value.trim() : '#000000';
        }

        return {
            type: 'text',
            text: watermarkText,
            fontSize: parseInt(fontSizeInput.value) || 50,
            color: textColor,
            opacity: parseInt(opacityInput.value) / 100,
            rotation,
            posX: 50,
            posY: 50,
            isPreview: true
        };
    }
}

addLayerBtn.addEventListener('click', function(e) {
    e.preventDefault();

    const layer = getCurrentFormLayer();
    if (!layer) {
        const errorMsg = document.getElementById('typeImage').checked ? 'pleaseSelectImage' : 'pleaseEnterWatermark';
        StatusManager.show(STATUS, 'error', errorMsg);
        return;
    }

    if (editingLayerIndex !== null) {
        layer.id = watermarkLayers[editingLayerIndex].id;
        layer.posX = watermarkLayers[editingLayerIndex].posX;
        layer.posY = watermarkLayers[editingLayerIndex].posY;
        delete layer.isPreview;
        watermarkLayers[editingLayerIndex] = layer;
        activeWatermarkId = layer.id;
        editingLayerIndex = null;
        if (window.getMessage) addLayerBtn.querySelector('span').textContent = window.getMessage('addLayerBtnText');
    } else {
        layer.id = createId('wm');
        layer.posX = 50;
        layer.posY = 50;
        delete layer.isPreview;
        const currentPageIndex = getCurrentPageIndex();
        const layerDom = getLayerElement(currentPageIndex);
        if (layerDom) {
            const centerX = layerDom.offsetWidth / 2;
            const centerY = layerDom.offsetHeight / 2;
            layer.posX = (centerX / layerDom.offsetWidth) * 100;
            layer.posY = 100 - ((centerY / layerDom.offsetHeight) * 100);
        }
        watermarkLayers.push(layer);
        activeWatermarkId = layer.id;
    }

    updateLayersList();
    clearForm();
    updatePreview();
    
    
    try {
        StatusManager.show(STATUS, 'success', 'layerAdded');
    } catch (e) {
        console.warn("StatusMessage missing key for layerAdded. Layer was added successfully.");
    }
});

function clearForm() {
    document.getElementById('typeText').checked = true;
    textSettingsGroup.style.display = 'block';
    imageSettingsGroup.style.display = 'none';

    watermarkTextInput.value = '';
    fontSizeInput.value = '50';
    opacityInput.value = '30';
    opacityValue.textContent = '30%';
    
    // Reset rotation values to default 45 degrees and keep them visible
    rotationSelect.value = '45';
    customRotSlider.value = 45;
    customRotationInput.value = 45;
    
    colorSelect.value = 'black';

    // Only hide custom color wrapper
    customColorWrapper.style.display = 'none';
    
    // Reset image states
    imageFileInput.value = '';
    currentImageFile = null;
    currentImageObj = null;
    currentImageBytes = null;
    if (imageFileNameDiv) imageFileNameDiv.textContent = '';
    imageScaleInput.value = '50';
}

function updateLayersList() {
    layersList.innerHTML = '';

    if (watermarkLayers.length === 0) {
        layersContainer.style.display = 'none';
        return;
    }

    layersContainer.style.display = 'block';

    watermarkLayers.forEach((layer, index) => {
        const layerItem = document.createElement('div');
        layerItem.className = 'layerItem';
        const getMsg = window.getMessage || (k => k);

        let detailsHtml = '';
        if (layer.type === 'image') {
            detailsHtml = `
                ${getMsg('scale') || 'Scale'}: ${layer.imageScale}% | 
                ${getMsg('opacity')}: ${Math.round(layer.opacity * 100)}% | 
                ${getMsg('rotation')}: ${layer.rotation}° | 
                Pos: X:${layer.posX}% Y:${layer.posY}%
            `;
        } else {
            const colorName = typeof layer.color === 'string' && layer.color.startsWith('#')
                ? layer.color
                : layer.color.charAt(0).toUpperCase() + layer.color.slice(1);
            detailsHtml = `
                ${getMsg('fontSize')}: ${layer.fontSize}px | 
                ${getMsg('opacity')}: ${Math.round(layer.opacity * 100)}% | 
                ${getMsg('rotation')}: ${layer.rotation}° | 
                ${getMsg('color')}: ${colorName} | 
                Pos: X:${layer.posX}% Y:${layer.posY}%
            `;
        }

        const layerLabel = layer.type === 'image' 
            ? `[${getMsg('image') || 'Image'}] ${layer.imageFile.name}` 
            : layer.text;

        layerItem.innerHTML = `
            <div class="layerInfo">
                <div class="layerText">${layerLabel}</div>
                <div class="layerDetails">${detailsHtml}</div>
            </div>
            <div class="layerActions">
                <button type="button" class="layerBtn editLayerBtn" data-index="${index}">${getMsg('editBtn')}</button>
                <button type="button" class="layerBtn removeLayerBtn" data-index="${index}">${getMsg('removeBtn')}</button>
            </div>
        `;

        layersList.appendChild(layerItem);
    });

    document.querySelectorAll('.editLayerBtn').forEach(btn => {
        btn.addEventListener('click', function() { editLayer(parseInt(this.dataset.index)); });
    });

    document.querySelectorAll('.removeLayerBtn').forEach(btn => {
        btn.addEventListener('click', function() { removeLayer(parseInt(this.dataset.index)); });
    });
}

function editLayer(index) {
    const layer = watermarkLayers[index];
    editingLayerIndex = index;
    activeWatermarkId = layer.id;

    opacityInput.value = Math.round(layer.opacity * 100);
    opacityValue.textContent = Math.round(layer.opacity * 100) + '%';

    if (Number.isInteger(layer.rotation)) {
        const rotationOptions = [0, 15, 30, 45, 60, 90, -15, -30, -45];
        if (rotationOptions.includes(layer.rotation)) {
            rotationSelect.value = layer.rotation;
        } else {
            rotationSelect.value = 'custom';
        }
        // Always update the inputs
        customRotSlider.value = layer.rotation;
        customRotationInput.value = layer.rotation;
    }

    if (layer.type === 'image') {
        document.getElementById('typeImage').checked = true;
        textSettingsGroup.style.display = 'none';
        imageSettingsGroup.style.display = 'block';

        currentImageFile = layer.imageFile;
        currentImageObj = layer.imageObj;
        currentImageBytes = layer.imageBytes;
        imageScaleInput.value = layer.imageScale;
        if (imageFileNameDiv) {
            const prefix = window.getMessage ? window.getMessage('selectedFile') : 'Selected: ';
            imageFileNameDiv.textContent = `${prefix}${layer.imageFile.name}`;
        }
    } else {
        document.getElementById('typeText').checked = true;
        textSettingsGroup.style.display = 'block';
        imageSettingsGroup.style.display = 'none';

        watermarkTextInput.value = layer.text;
        fontSizeInput.value = layer.fontSize;

        if (typeof layer.color === 'string' && layer.color.startsWith('#')) {
            colorSelect.value = 'custom';
            customColorHex.value = layer.color;
            colorPicker.value = layer.color;
            customColorWrapper.style.display = 'block';
        } else {
            colorSelect.value = layer.color;
            customColorWrapper.style.display = 'none';
        }
    }

    if (window.getMessage) addLayerBtn.querySelector('span').textContent = window.getMessage('updateLayerBtn');
    watermarkTextInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    updatePreview();
}

function removeLayer(index) {
    const removed = watermarkLayers[index];
    watermarkLayers.splice(index, 1);
    if (removed?.id === activeWatermarkId) {
        activeWatermarkId = watermarkLayers[0]?.id || null;
    }
    if (editingLayerIndex === index) {
        editingLayerIndex = null;
        clearForm();
        if (window.getMessage) addLayerBtn.querySelector('span').textContent = window.getMessage('addLayerBtnText');
    }
    updateLayersList();
    updatePreview();
    StatusManager.show(STATUS, 'success', 'layerRemoved');
}

function updatePreview() {
    if (!selectedFile) return;
    renderWatermarkOverlays();
}


function renderWatermarkOverlays() {
    document.querySelectorAll('.watermarkLayer').forEach(layerDom => {
        layerDom.innerHTML = '';
        const pageIndex = parseInt(layerDom.closest('.pageWrapper')?.dataset.pageIndex || '0', 10);
        watermarkLayers.forEach((layer, index) => {
            if (index !== editingLayerIndex) createWatermarkOverlay(pageIndex, layer, layerDom);
        });
    });
}

function getWatermarkCssColor(layer) {
    if (typeof layer.color === 'string' && layer.color.startsWith('#')) return layer.color;
    const colorMap = { red: '#CC0000', gray: '#808080', black: '#000000', blue: '#0000CC', green: '#009900' };
    return colorMap[layer.color] || '#000000';
}

function createWatermarkOverlay(pageIndex, layer, layerDom) {
    const pageDims = pdfPageDimensions.get(pageIndex) || { width: layerDom.offsetWidth };
    const uiScale = layerDom.offsetWidth / pageDims.width;
    const item = document.createElement('div');
    item.className = 'watermarkOverlayItem';
    if (layer.id === activeWatermarkId) item.classList.add('active');
    item.dataset.id = layer.id;
    item.dataset.pageIndex = pageIndex;
    item.style.left = `${(layer.posX / 100) * layerDom.offsetWidth}px`;
    item.style.top = `${(1 - layer.posY / 100) * layerDom.offsetHeight}px`;
    item.style.opacity = String(layer.opacity);
    item.style.transform = `translate(-50%, -50%) rotate(${-layer.rotation}deg)`;

    if (layer.type === 'image' && layer.imageObj) {
        const img = document.createElement('img');
        img.src = layer.imageObj.src;
        img.alt = '';
        img.style.width = `${layer.imageObj.width * (layer.imageScale / 100) * uiScale}px`;
        img.style.height = `${layer.imageObj.height * (layer.imageScale / 100) * uiScale}px`;
        item.appendChild(img);
    } else if (layer.type === 'text') {
        item.textContent = layer.text;
        item.style.fontSize = `${layer.fontSize * uiScale}px`;
        item.style.fontWeight = 'bold';
        item.style.color = getWatermarkCssColor(layer);
    }

    item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        activeWatermarkId = layer.id;
        document.querySelectorAll('.watermarkOverlayItem').forEach(el => el.classList.remove('active'));
        document.querySelectorAll(`.watermarkOverlayItem[data-id="${layer.id}"]`).forEach(el => el.classList.add('active'));
        dragState = {
            layer,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: (layer.posX / 100) * layerDom.offsetWidth,
            startTop: (1 - layer.posY / 100) * layerDom.offsetHeight,
            layerWidth: layerDom.offsetWidth,
            layerHeight: layerDom.offsetHeight,
        };
    });

    layerDom.appendChild(item);
}

document.addEventListener('mousemove', (e) => {
    if (!dragState) return;

    const left = Math.max(0, Math.min(dragState.layerWidth, dragState.startLeft + e.clientX - dragState.startX));
    const top = Math.max(0, Math.min(dragState.layerHeight, dragState.startTop + e.clientY - dragState.startY));

    dragState.layer.posX = (left / dragState.layerWidth) * 100;
    dragState.layer.posY = 100 - ((top / dragState.layerHeight) * 100);

    document.querySelectorAll(`.watermarkOverlayItem[data-id="${dragState.layer.id}"]`).forEach(item => {
        const layerDom = item.parentElement;
        item.style.left = `${(dragState.layer.posX / 100) * layerDom.offsetWidth}px`;
        item.style.top = `${(1 - dragState.layer.posY / 100) * layerDom.offsetHeight}px`;
    });
});

document.addEventListener('mouseup', () => {
    if (dragState) {
        updateLayersList();
    }
    dragState = null;
});

function drawWatermarkContentAt(ctx, layer, x, y, renderScale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((-(layer.rotation || 0) * Math.PI) / 180);

    if (layer.type === 'image' && layer.imageObj) {
        const width = layer.imageObj.width * ((layer.imageScale || 50) / 100) * renderScale;
        const height = layer.imageObj.height * ((layer.imageScale || 50) / 100) * renderScale;
        ctx.drawImage(layer.imageObj, -width / 2, -height / 2, width, height);
    } else if (layer.type === 'text' && layer.text) {
        const fontSize = (layer.fontSize || 50) * renderScale;
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = getWatermarkCssColor(layer);
        ctx.fillText(layer.text, 0, 0);
    }

    ctx.restore();
}

function getWatermarkTileSpacing(ctx, layer, renderScale) {
    if (layer.type === 'image' && layer.imageObj) {
        return {
            x: Math.max(220 * renderScale, layer.imageObj.width * ((layer.imageScale || 50) / 100) * renderScale * 1.6),
            y: Math.max(160 * renderScale, layer.imageObj.height * ((layer.imageScale || 50) / 100) * renderScale * 1.8),
        };
    }

    const fontSize = (layer.fontSize || 50) * renderScale;
    ctx.save();
    ctx.font = `bold ${fontSize}px Arial`;
    const textWidth = ctx.measureText(layer.text || '').width;
    ctx.restore();

    return {
        x: Math.max(260 * renderScale, textWidth * 1.45),
        y: Math.max(150 * renderScale, fontSize * 3),
    };
}

function drawWatermarkLayerOnCanvas(ctx, layer, canvasWidth, canvasHeight, renderScale) {
    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 0.3;

    const baseX = (layer.posX / 100) * canvasWidth;
    const baseY = (1 - layer.posY / 100) * canvasHeight;
    const spacing = getWatermarkTileSpacing(ctx, layer, renderScale);
    const startX = ((baseX % spacing.x) + spacing.x) % spacing.x;
    const startY = ((baseY % spacing.y) + spacing.y) % spacing.y;

    for (let y = startY - spacing.y; y <= canvasHeight + spacing.y; y += spacing.y) {
        for (let x = startX - spacing.x; x <= canvasWidth + spacing.x; x += spacing.x) {
            drawWatermarkContentAt(ctx, layer, x, y, renderScale);
        }
    }

    ctx.restore();
}

async function renderWatermarkedPdfBytes(fileBuffer, metadata) {
    const sourcePdf = await window.pdfjsLib.getDocument({ data: fileBuffer.slice(0), disableWorker: true }).promise;
    const outDoc = await PDFDocument.create();
    const renderScale = 2;

    if (metadata.author) outDoc.setAuthor(metadata.author);
    if (metadata.title) outDoc.setTitle(metadata.title);
    if (metadata.subject) outDoc.setSubject(metadata.subject);

    for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber++) {
        const sourcePage = await sourcePdf.getPage(pageNumber);
        const viewport = sourcePage.getViewport({ scale: renderScale });
        const outputViewport = sourcePage.getViewport({ scale: 1 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        await sourcePage.render({ canvasContext: ctx, viewport }).promise;
        // Draw watermarks on a separate overlay canvas so no PDF.js render state
        // (transforms/clips) can affect watermark angle or position.
        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.width = canvas.width;
        overlayCanvas.height = canvas.height;
        const overlayCtx = overlayCanvas.getContext('2d');
        overlayCtx.setTransform(1, 0, 0, 1, 0, 0);

        watermarkLayers.forEach(layer => {
            drawWatermarkLayerOnCanvas(
                overlayCtx,
                layer,
                overlayCanvas.width,
                overlayCanvas.height,
                renderScale
            );
        });

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(overlayCanvas, 0, 0);

        const pngDataUrl = canvas.toDataURL('image/png');
        const pngBytes = Uint8Array.from(atob(pngDataUrl.split(',')[1]), char => char.charCodeAt(0));
        const pngImage = await outDoc.embedPng(pngBytes);
        const outPage = outDoc.addPage([outputViewport.width, outputViewport.height]);
        outPage.drawImage(pngImage, {
            x: 0,
            y: 0,
            width: outputViewport.width,
            height: outputViewport.height,
        });
    }

    return outDoc.save();
}

form.addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!selectedFile) {
        StatusManager.show(STATUS, 'error', 'pleaseSelectFile');
        return;
    }

    if (watermarkLayers.length === 0) {
        StatusManager.show(STATUS, 'error', 'pleaseAddAtLeastOneLayer');
        return;
    }

    const fileNameWithoutExt = selectedFile.name.replace(/\.pdf$/i, '');
    const defaultFileName = `${fileNameWithoutExt}_watermarked.pdf`;

    StatusManager.show(STATUS, 'processing', 'processing');
    submitBtn.disabled = true;

    try {
        const fileBuffer = originalFileBuffer ? originalFileBuffer.slice(0) : await selectedFile.arrayBuffer();
        const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
        const pdfBytes = await renderWatermarkedPdfBytes(fileBuffer, finalMetadata);

        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: path.join(downloadsPath, defaultFileName),
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (!outputPath) {
            StatusManager.show(STATUS, 'error', 'saveCancelled');
            submitBtn.disabled = false;
            return;
        }

        await fs.writeFile(outputPath, pdfBytes);

        StatusManager.show(STATUS, 'success', 'successPdfCreated', {
            filename: path.basename(outputPath),
            savePath: outputPath
        });

        submitBtn.disabled = false;

        form.reset();
        clearForm();
        watermarkLayers = [];
        activeWatermarkId = null;
        originalFileBuffer = null;
        pdfPageDimensions.clear();
        pagesGrid.innerHTML = '';
        editingLayerIndex = null;
        opacityValue.textContent = '30%';
        previewSection.style.display = 'none';
        layersContainer.style.display = 'none';
        
        watermarkWorkspace.style.display = 'none';
        finalSubmitGroup.style.display = 'none';
        watermarkContainer.classList.remove('expanded');
        
        updateLayersList();
        CustomMetadataModule.reset();

    } catch (error) {
        console.error('Error adding watermark:', error);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
        submitBtn.disabled = false;
    }
});
