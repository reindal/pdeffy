const { PDFDocument, rgb, degrees } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');

const STATUS = '#status';

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

const positionSelect = document.getElementById('position');
const posXSlider = document.getElementById('posXSlider');
const posXInput = document.getElementById('posXInput');
const posYSlider = document.getElementById('posYSlider');
const posYInput = document.getElementById('posYInput');

const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const fileNameDiv = document.getElementById('fileName');
const addLayerBtn = document.getElementById('addLayerBtn');
const previewSection = document.getElementById('previewSection');
const previewCanvas = document.getElementById('watermarkPreview');
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
let watermarkLayers = [];
let editingLayerIndex = null;
const previewCtx = previewCanvas.getContext('2d');
let pdfPageDimensions = { width: 595, height: 842 };

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

const positionPresets = {
    'center': { x: 50, y: 50 },
    'top': { x: 50, y: 92 },
    'bottom': { x: 50, y: 8 },
    'top-left': { x: 15, y: 92 },
    'top-right': { x: 85, y: 92 },
    'bottom-left': { x: 15, y: 8 },
    'bottom-right': { x: 85, y: 8 }
};

positionSelect.addEventListener('change', function() {
    if (positionPresets[this.value]) {
        const { x, y } = positionPresets[this.value];
        posXSlider.value = x;
        posXInput.value = x;
        posYSlider.value = y;
        posYInput.value = y;
    }
    updatePreview();
});

function syncPositionInputs(sourceElement, isXAxis) {
    let val = parseInt(sourceElement.value) || 0;
    if (val < 0) val = 0;
    if (val > 100) val = 100;

    if (isXAxis) {
        posXSlider.value = val;
        posXInput.value = val;
    } else {
        posYSlider.value = val;
        posYInput.value = val;
    }
    
    positionSelect.value = 'custom';
    updatePreview();
}

posXSlider.addEventListener('input', () => syncPositionInputs(posXSlider, true));
posXInput.addEventListener('input', () => syncPositionInputs(posXInput, true));
posYSlider.addEventListener('input', () => syncPositionInputs(posYSlider, false));
posYInput.addEventListener('input', () => syncPositionInputs(posYInput, false));

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

pdfFileInput.addEventListener('change', async function(e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const blocked = await PdfEncryptionGuard.check(file, STATUS);
        if (blocked) {
            selectedFile = null;
            return;
        }

        selectedFile = file;
        updateFileNameDisplay();

        try {
            const fileBuffer = await selectedFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(fileBuffer);
            const pages = pdfDoc.getPages();

            if (pages.length > 0) {
                const { width, height } = pages[0].getSize();
                pdfPageDimensions = { width, height };

                
                previewCanvas.width = width;
                previewCanvas.height = height;
            }
        } catch (error) {
            console.error('Error loading PDF for preview:', error);
            pdfPageDimensions = { width: 595, height: 842 };
            previewCanvas.width = 595;
            previewCanvas.height = 842;
        }

        watermarkWorkspace.style.display = 'flex';
        finalSubmitGroup.style.display = 'block';
        watermarkContainer.classList.add('expanded');
        updatePreview();
    } else {
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

    
    const rawX = parseInt(posXInput.value);
    const rawY = parseInt(posYInput.value);
    const posX = !isNaN(rawX) ? rawX : 50;
    const posY = !isNaN(rawY) ? rawY : 50;

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
            posX,
            posY,
            positionType: positionSelect.value,
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
            posX,
            posY,
            positionType: positionSelect.value,
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

    delete layer.isPreview;

    if (editingLayerIndex !== null) {
        watermarkLayers[editingLayerIndex] = layer;
        editingLayerIndex = null;
        if (window.getMessage) addLayerBtn.querySelector('span').textContent = window.getMessage('addLayerBtnText');
    } else {
        watermarkLayers.push(layer);
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
    positionSelect.value = 'center';
    
    // Reset position values
    posXSlider.value = 50; 
    posXInput.value = 50;
    posYSlider.value = 50; 
    posYInput.value = 50;

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

    opacityInput.value = Math.round(layer.opacity * 100);
    opacityValue.textContent = Math.round(layer.opacity * 100) + '%';
    
    positionSelect.value = layer.positionType || 'custom';
    posXSlider.value = layer.posX; posXInput.value = layer.posX;
    posYSlider.value = layer.posY; posYInput.value = layer.posY;

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
    watermarkLayers.splice(index, 1);
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

    previewCtx.fillStyle = 'white';
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

    watermarkLayers.forEach((layer, index) => {
        if (index !== editingLayerIndex) drawWatermarkOnCanvas(layer);
    });
    
    const liveLayer = getCurrentFormLayer();
    if (liveLayer) drawWatermarkOnCanvas(liveLayer);
}


function drawWatermarkOnCanvas(layer) {
    const canvas = previewCanvas;
    const ctx = previewCtx;
    ctx.save();

    let contentWidth, contentHeight;

    if (layer.type === 'image' && layer.imageObj) {
        contentWidth = layer.imageObj.width * (layer.imageScale / 100);
        contentHeight = layer.imageObj.height * (layer.imageScale / 100);
    } else {
        ctx.font = `bold ${layer.fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let color;
        if (typeof layer.color === 'string' && layer.color.startsWith('#')) color = layer.color;
        else {
            const colorMap = { red: '#CC0000', gray: '#808080', black: '#000000', blue: '#0000CC', green: '#009900' };
            color = colorMap[layer.color] || '#000000';
        }
        ctx.fillStyle = color;
        contentWidth = ctx.measureText(layer.text).width; 
        contentHeight = layer.fontSize;
    }

    ctx.globalAlpha = layer.isPreview ? layer.opacity * 0.8 : layer.opacity;

    
    const canvasX = (layer.posX / 100) * canvas.width;
    const canvasY = canvas.height - ((layer.posY / 100) * canvas.height); 

    ctx.translate(canvasX, canvasY);
    ctx.rotate((-layer.rotation * Math.PI) / 180);

    if (layer.type === 'image' && layer.imageObj) {
        ctx.drawImage(layer.imageObj, -contentWidth / 2, -contentHeight / 2, contentWidth, contentHeight);
        
        if (layer.isPreview) {
            ctx.strokeStyle = '#0066cc';
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2; 
            ctx.strokeRect(-contentWidth / 2 - 5, -contentHeight / 2 - 5, contentWidth + 10, contentHeight + 10);
        }
    } else if (layer.type === 'text') {
        ctx.fillText(layer.text, 0, 0);

        if (layer.isPreview) {
            ctx.strokeStyle = '#0066cc';
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2;
            ctx.strokeRect(-(contentWidth / 2) - 10, -(contentHeight / 2) - 10, contentWidth + 20, contentHeight + 20);
        }
    }

    ctx.restore();
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
        const fileBuffer = await selectedFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(fileBuffer);

        const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
        if (finalMetadata.author)  pdfDoc.setAuthor(finalMetadata.author);
        if (finalMetadata.title)   pdfDoc.setTitle(finalMetadata.title);
        if (finalMetadata.subject) pdfDoc.setSubject(finalMetadata.subject);

        const helveticaFont = await pdfDoc.embedFont('Helvetica-Bold');
        
        for (const layer of watermarkLayers) {
            if (layer.type === 'image' && !layer.embeddedPdfImage) {
                const isJpeg = layer.imageFile.type === 'image/jpeg' || layer.imageFile.type === 'image/jpg';
                layer.embeddedPdfImage = isJpeg 
                    ? await pdfDoc.embedJpg(layer.imageBytes)
                    : await pdfDoc.embedPng(layer.imageBytes);
            }
        }

        const pages = pdfDoc.getPages();

        pages.forEach(page => {
            const { width, height } = page.getSize();

            watermarkLayers.forEach(layer => {
                const x = (layer.posX / 100) * width;
                const y = (layer.posY / 100) * height;
                
                const rotationAngle = layer.rotation || 0;
                const rotationRad = (rotationAngle * Math.PI) / 180;

                if (layer.type === 'image') {
                    const scaledDims = layer.embeddedPdfImage.scale(layer.imageScale / 100);
                    
                    const offsetX = (scaledDims.width / 2) * Math.cos(rotationRad) - (scaledDims.height / 2) * Math.sin(rotationRad);
                    const offsetY = (scaledDims.width / 2) * Math.sin(rotationRad) + (scaledDims.height / 2) * Math.cos(rotationRad);

                    page.drawImage(layer.embeddedPdfImage, {
                        x: x - offsetX,
                        y: y - offsetY,
                        width: scaledDims.width,
                        height: scaledDims.height,
                        opacity: layer.opacity,
                        rotate: degrees(rotationAngle)
                    });
                } else {
                    const textWidth = helveticaFont.widthOfTextAtSize(layer.text, layer.fontSize);
                    const textHeight = layer.fontSize;

                    let textColor;
                    if (typeof layer.color === 'string' && layer.color.startsWith('#')) textColor = hexToRgb(layer.color);
                    else {
                        switch (layer.color) {
                            case 'red':   textColor = rgb(0.8, 0, 0);    break;
                            case 'gray':  textColor = rgb(0.5, 0.5, 0.5); break;
                            case 'blue':  textColor = rgb(0, 0, 0.8);    break;
                            case 'green': textColor = rgb(0, 0.6, 0);    break;
                            default:      textColor = rgb(0, 0, 0);
                        }
                    }

                    const offsetX = (textWidth / 2) * Math.cos(rotationRad) + (textHeight / 2) * Math.sin(rotationRad);
                    const offsetY = (textWidth / 2) * Math.sin(rotationRad) - (textHeight / 2) * Math.cos(rotationRad);

                    page.drawText(layer.text, {
                        x: x - offsetX,
                        y: y - offsetY,
                        size: layer.fontSize,
                        font: helveticaFont,
                        color: textColor,
                        opacity: layer.opacity,
                        rotate: degrees(rotationAngle),
                    });
                }
            });
        });

        const pdfBytes = await pdfDoc.save();

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

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return rgb(
        parseInt(hex.substring(0, 2), 16) / 255,
        parseInt(hex.substring(2, 4), 16) / 255,
        parseInt(hex.substring(4, 6), 16) / 255
    );
}