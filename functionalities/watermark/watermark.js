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
const positionSelect = document.getElementById('position');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const fileNameDiv = document.getElementById('fileName');
const addLayerBtn = document.getElementById('addLayerBtn');
const previewSection = document.getElementById('previewSection');
const previewCanvas = document.getElementById('watermarkPreview');
const layersContainer = document.getElementById('watermarkLayersContainer');
const layersList = document.getElementById('layersList');

let selectedFile = null;
let watermarkLayers = [];
let editingLayerIndex = null;
const previewCtx = previewCanvas.getContext('2d');
let pdfPageDimensions = { width: 595, height: 842 }; // Default A4 size in points

// Initialize default color value
customColorHex.value = '#000000';
colorPicker.value = '#000000';

// Real-time UI updates and validations
opacityInput.addEventListener('input', function() {
    opacityValue.textContent = this.value + '%';
    updatePreview();
});

rotationSelect.addEventListener('change', function() {
    if (this.value === 'custom') {
        customRotationInput.style.display = 'block';
        customRotationInput.required = true;
    } else {
        customRotationInput.style.display = 'none';
        customRotationInput.required = false;
    }
    updatePreview();
});

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

// Attach live preview updates to all relevant inputs
[watermarkTextInput, fontSizeInput, customRotationInput, positionSelect].forEach(element => {
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
        customColorHex.classList.remove('invalid');
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

// Function to safely update file name maintaining selected language
function updateFileNameDisplay() {
    if (selectedFile && fileNameDiv) {
        const prefix = window.getMessage ? window.getMessage('selectedFile') : 'Selected: ';
        fileNameDiv.textContent = `✓ ${prefix}${selectedFile.name}`;
    }
}

// Monkey-patch the global language change to update local dynamic strings
if (typeof window.changeLanguage === 'function') {
    const originalChangeLanguage = window.changeLanguage;
    window.changeLanguage = function(lang) {
        originalChangeLanguage(lang);
        updateFileNameDisplay();
        updateLayersList(); // Refresh translated keys in the layers list
    };
}

// Show selected file name and initialize canvas
pdfFileInput.addEventListener('change', async function(e) {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        updateFileNameDisplay();

        // Load PDF to get actual page dimensions
        try {
            const fileBuffer = await selectedFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(fileBuffer);
            const pages = pdfDoc.getPages();

            if (pages.length > 0) {
                const { width, height } = pages[0].getSize();
                pdfPageDimensions = { width, height };

                // Adjust canvas to match PDF aspect ratio
                const maxCanvasWidth = 500;
                const maxCanvasHeight = 400;
                const pdfAspectRatio = width / height;

                if (pdfAspectRatio > maxCanvasWidth / maxCanvasHeight) {
                    // Width is limiting factor
                    previewCanvas.width = maxCanvasWidth;
                    previewCanvas.height = maxCanvasWidth / pdfAspectRatio;
                } else {
                    // Height is limiting factor
                    previewCanvas.height = maxCanvasHeight;
                    previewCanvas.width = maxCanvasHeight * pdfAspectRatio;
                }
            }
        } catch (error) {
            console.error('Error loading PDF for preview:', error);
            // Use default dimensions if loading fails
            pdfPageDimensions = { width: 595, height: 842 };
        }

        previewSection.style.display = 'block';
        updatePreview();
    }
});

// Helper function to extract current form settings into a layer object
function getCurrentFormLayer() {
    const watermarkText = watermarkTextInput.value.trim();
    if (!watermarkText) return null;

    let rotation;
    if (rotationSelect.value === 'custom') {
        rotation = parseInt(customRotationInput.value);
        if (isNaN(rotation) || rotation < -360 || rotation > 360) rotation = 0;
    } else {
        rotation = parseInt(rotationSelect.value);
    }

    const colorValue = colorSelect.value;
    let textColor = colorValue;
    if (colorValue === 'custom') {
        textColor = validateColor() ? customColorHex.value.trim() : '#000000';
    }

    return {
        text: watermarkText,
        fontSize: parseInt(fontSizeInput.value) || 50,
        opacity: parseInt(opacityInput.value) / 100,
        rotation,
        color: textColor,
        position: positionSelect.value,
        isPreview: true // Flag to render differently in preview
    };
}

// Add watermark layer button
addLayerBtn.addEventListener('click', function(e) {
    e.preventDefault();

    const layer = getCurrentFormLayer();
    if (!layer) {
        StatusManager.show(STATUS, 'error', 'pleaseEnterWatermark');
        return;
    }

    // Remove the preview flag before saving
    delete layer.isPreview;

    if (editingLayerIndex !== null) {
        // Update existing layer
        watermarkLayers[editingLayerIndex] = layer;
        editingLayerIndex = null;
        if (window.getMessage) addLayerBtn.querySelector('span').textContent = window.getMessage('addLayerBtnText');
    } else {
        // Add new layer
        watermarkLayers.push(layer);
    }

    updateLayersList();
    clearForm();
    updatePreview();
    StatusManager.show(STATUS, 'success', 'layerAdded');
});

function clearForm() {
    watermarkTextInput.value = '';
    fontSizeInput.value = '50';
    opacityInput.value = '30';
    opacityValue.textContent = '30%';
    rotationSelect.value = '45';
    colorSelect.value = 'black';
    positionSelect.value = 'center';
    customRotationInput.style.display = 'none';
    customColorWrapper.style.display = 'none';
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

        const colorName = typeof layer.color === 'string' && layer.color.startsWith('#')
            ? layer.color
            : layer.color.charAt(0).toUpperCase() + layer.color.slice(1);

        const getMsg = window.getMessage || (k => k);

        layerItem.innerHTML = `
            <div class="layerInfo">
                <div class="layerText">${layer.text}</div>
                <div class="layerDetails">
                    ${getMsg('fontSize')}: ${layer.fontSize}px | 
                    ${getMsg('opacity')}: ${Math.round(layer.opacity * 100)}% | 
                    ${getMsg('rotation')}: ${layer.rotation}° | 
                    ${getMsg('color')}: ${colorName}
                </div>
            </div>
            <div class="layerActions">
                <button type="button" class="layerBtn editLayerBtn" data-index="${index}">${getMsg('editBtn')}</button>
                <button type="button" class="layerBtn removeLayerBtn" data-index="${index}">${getMsg('removeBtn')}</button>
            </div>
        `;

        layersList.appendChild(layerItem);
    });

    // Add event listeners
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

    watermarkTextInput.value = layer.text;
    fontSizeInput.value = layer.fontSize;
    opacityInput.value = Math.round(layer.opacity * 100);
    opacityValue.textContent = Math.round(layer.opacity * 100) + '%';
    positionSelect.value = layer.position;

    if (Number.isInteger(layer.rotation)) {
        const rotationOptions = [0, 15, 30, 45, 60, 90, -15, -30, -45];
        if (rotationOptions.includes(layer.rotation)) {
            rotationSelect.value = layer.rotation;
            customRotationInput.style.display = 'none';
        } else {
            rotationSelect.value = 'custom';
            customRotationInput.value = layer.rotation;
            customRotationInput.style.display = 'block';
        }
    }

    if (typeof layer.color === 'string' && layer.color.startsWith('#')) {
        colorSelect.value = 'custom';
        customColorHex.value = layer.color;
        colorPicker.value = layer.color;
        customColorWrapper.style.display = 'block';
    } else {
        colorSelect.value = layer.color;
        customColorWrapper.style.display = 'none';
    }

    if (window.getMessage) addLayerBtn.querySelector('span').textContent = window.getMessage('updateLayerBtn');

    // Scroll to form and trigger live preview
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

    // Clear canvas
    previewCtx.fillStyle = 'white';
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

    // Draw all confirmed watermark layers
    watermarkLayers.forEach((layer, index) => {
        // Skip drawing the layer being currently edited to avoid visual duplication
        if (index !== editingLayerIndex) drawWatermarkOnCanvas(layer);
    });
    // Overlay the current form state as a live preview
    const liveLayer = getCurrentFormLayer();
    if (liveLayer) drawWatermarkOnCanvas(liveLayer);
}

function drawWatermarkOnCanvas(layer) {
    const canvas = previewCanvas;
    const ctx = previewCtx;

    ctx.save();

    // Calculate scale factor from PDF dimensions to canvas dimensions
    const scaleX = canvas.width / pdfPageDimensions.width;
    const scaleY = canvas.height / pdfPageDimensions.height;

    // Set font with scaled size
    const scaledFontSize = layer.fontSize * scaleY;
    ctx.font = `bold ${scaledFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Set color
    let color;
    if (typeof layer.color === 'string' && layer.color.startsWith('#')) {
        color = layer.color;
    } else {
        const colorMap = { red: '#CC0000', gray: '#808080', black: '#000000', blue: '#0000CC', green: '#009900' };
        color = colorMap[layer.color] || '#000000';
    }

    // Set fill color and opacity
    ctx.fillStyle = color;
    
    // Slightly differentiate the live preview layer visually if desired
    ctx.globalAlpha = layer.isPreview ? layer.opacity * 0.8 : layer.opacity;

    // Calculate position in PDF coordinates, then scale to canvas
    let pdfX, pdfY;
    switch (layer.position) {
        case 'center': case 'diagonal': pdfX = pdfPageDimensions.width / 2; pdfY = pdfPageDimensions.height / 2; break;
        case 'top':          pdfX = pdfPageDimensions.width / 2;       pdfY = pdfPageDimensions.height - 50; break;
        case 'bottom':       pdfX = pdfPageDimensions.width / 2;       pdfY = 50; break;
        case 'top-left':     pdfX = 80;                                 pdfY = pdfPageDimensions.height - 50; break;
        case 'top-right':    pdfX = pdfPageDimensions.width - 80;      pdfY = pdfPageDimensions.height - 50; break;
        case 'bottom-left':  pdfX = 80;                                 pdfY = 50; break;
        case 'bottom-right': pdfX = pdfPageDimensions.width - 80;      pdfY = 50; break;
        default:             pdfX = pdfPageDimensions.width / 2;       pdfY = pdfPageDimensions.height / 2;
    }

    // Scale PDF coordinates to canvas coordinates
    // Note: PDF Y is bottom-up, canvas Y is top-down
    const canvasX = pdfX * scaleX;
    const canvasY = canvas.height - (pdfY * scaleY);

    // Apply rotation
    // NOTE: pdf-lib rotates counter-clockwise (mathematical convention)
    // Canvas rotates clockwise by default, so we need to negate the angle
    ctx.translate(canvasX, canvasY);
    ctx.rotate((-layer.rotation * Math.PI) / 180);

    // Draw text centered at (0, 0) after translation
    ctx.fillText(layer.text, 0, 0);

    // Visual indicator for active editing layer
    if (layer.isPreview) {
        ctx.strokeStyle = '#0066cc';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        const metrics = ctx.measureText(layer.text);
        const padding = 10;
        ctx.strokeRect(
            -(metrics.width / 2) - padding,
            -(scaledFontSize / 2) - padding,
            metrics.width + padding * 2,
            scaledFontSize + padding * 2
        );
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

        // Get final metadata from module
        const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
        if (finalMetadata.author)  pdfDoc.setAuthor(finalMetadata.author);
        if (finalMetadata.title)   pdfDoc.setTitle(finalMetadata.title);
        if (finalMetadata.subject) pdfDoc.setSubject(finalMetadata.subject);

        // Embed font
        const helveticaFont = await pdfDoc.embedFont('Helvetica-Bold');
        const pages = pdfDoc.getPages();

        // Apply all watermark layers to each page
        pages.forEach(page => {
            const { width, height } = page.getSize();

            watermarkLayers.forEach(layer => {
                const textWidth = helveticaFont.widthOfTextAtSize(layer.text, layer.fontSize);

                let x, y, rotationAngle;
                switch (layer.position) {
                    case 'center': case 'diagonal': x = width / 2;       y = height / 2;      rotationAngle = layer.rotation; break;
                    case 'top':          x = width / 2;       y = height - 50;  rotationAngle = layer.rotation; break;
                    case 'bottom':       x = width / 2;       y = 50;           rotationAngle = layer.rotation; break;
                    case 'top-left':     x = 80;              y = height - 50;  rotationAngle = layer.rotation; break;
                    case 'top-right':    x = width - 80;      y = height - 50;  rotationAngle = layer.rotation; break;
                    case 'bottom-left':  x = 80;              y = 50;           rotationAngle = layer.rotation; break;
                    case 'bottom-right': x = width - 80;      y = 50;           rotationAngle = layer.rotation; break;
                    default:             x = width / 2;       y = height / 2;   rotationAngle = layer.rotation;
                }

                // Get text color
                let textColor;
                if (typeof layer.color === 'string' && layer.color.startsWith('#')) {
                    textColor = hexToRgb(layer.color);
                } else {
                    switch (layer.color) {
                        case 'red':   textColor = rgb(0.8, 0, 0);    break;
                        case 'gray':  textColor = rgb(0.5, 0.5, 0.5); break;
                        case 'blue':  textColor = rgb(0, 0, 0.8);    break;
                        case 'green': textColor = rgb(0, 0.6, 0);    break;
                        default:      textColor = rgb(0, 0, 0);
                    }
                }

                // Convert rotation to radians
                const rotationRad = (rotationAngle * Math.PI) / 180;

                // Calculate text dimensions
                const textHeight = layer.fontSize;

                // Offset to center the text at the desired position
                const offsetX = (textWidth / 2) * Math.cos(rotationRad) + (textHeight / 2) * Math.sin(rotationRad);
                const offsetY = (textWidth / 2) * Math.sin(rotationRad) - (textHeight / 2) * Math.cos(rotationRad);

                // Apply offsets to center the rotated text at the target position
                const finalX = x - offsetX;
                const finalY = y - offsetY;

                page.drawText(layer.text, {
                    x: x - offsetX,
                    y: y - offsetY,
                    size: layer.fontSize,
                    font: helveticaFont,
                    color: textColor,
                    opacity: layer.opacity,
                    rotate: degrees(rotationAngle),
                });
            });
        });

        const pdfBytes = await pdfDoc.save();

        // Show Save As dialog with default path in Downloads
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

        // Reset
        form.reset();
        selectedFile = null;
        watermarkLayers = [];
        editingLayerIndex = null;
        fileNameDiv.textContent = '';
        opacityValue.textContent = '30%';
        customRotationInput.style.display = 'none';
        customColorWrapper.style.display = 'none';
        customColorHex.classList.remove('valid', 'invalid');
        colorError.textContent = '';
        customColorHex.value = '#000000';
        colorPicker.value = '#000000';
        previewSection.style.display = 'none';
        layersContainer.style.display = 'none';
        updateLayersList();
        
        // Clear custom metadata fields
        CustomMetadataModule.reset();

    } catch (error) {
        console.error('Error adding watermark:', error);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
        submitBtn.disabled = false;
    }
});

function hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace('#', '');
    return rgb(
        parseInt(hex.substring(0, 2), 16) / 255,
        parseInt(hex.substring(2, 4), 16) / 255,
        parseInt(hex.substring(4, 6), 16) / 255
    );
}