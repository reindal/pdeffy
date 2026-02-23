const { PDFDocument, rgb, degrees } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');

const form = document.getElementById('watermarkForm');
const pdfFileInput = document.getElementById('pdfFile');
const watermarkTextInput = document.getElementById('watermarkText');
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

// Custom metadata toggle
const addMetadataCheckbox = document.getElementById('addMetadataCheckbox');
const metadataFieldsDiv = document.getElementById('metadataFields');
const metadataTitleInput = document.getElementById('metadataTitleInput');
const metadataDescriptionInput = document.getElementById('metadataDescriptionInput');

addMetadataCheckbox.addEventListener('change', function() {
    if (this.checked) {
        metadataFieldsDiv.classList.add('visible');
    } else {
        metadataFieldsDiv.classList.remove('visible');
    }
});

// Initialize default color value
customColorHex.value = '#000000';
colorPicker.value = '#000000';

// Update opacity value display
opacityInput.addEventListener('input', function() {
    opacityValue.textContent = this.value + '%';
});

// Handle rotation select change
rotationSelect.addEventListener('change', function() {
    if (this.value === 'custom') {
        customRotationInput.style.display = 'block';
        customRotationInput.required = true;
    } else {
        customRotationInput.style.display = 'none';
        customRotationInput.required = false;
    }
});

// Handle color select change
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
});

// Validate HEX color input
customColorHex.addEventListener('input', function() {
    validateColor();
    // Sync with color picker if valid
    if (validateColor()) {
        colorPicker.value = customColorHex.value;
    }
});

// Handle color picker change
colorPicker.addEventListener('input', function() {
    customColorHex.value = this.value.toUpperCase();
    validateColor();
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
        // Sync color picker with valid hex
        colorPicker.value = hexValue;
        return true;
    } else {
        customColorHex.classList.remove('valid');
        customColorHex.classList.add('invalid');
        colorError.textContent = getMessage('invalidHexColor');
        return false;
    }
}

// Show selected file name
pdfFileInput.addEventListener('change', async function(e) {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        fileNameDiv.textContent = `✓ ${getMessage('selectedFile')}${selectedFile.name}`;

        // Load PDF to get actual page dimensions
        try {
            const fileBuffer = await selectedFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(fileBuffer);
            const pages = pdfDoc.getPages();

            if (pages.length > 0) {
                const firstPage = pages[0];
                const { width, height } = firstPage.getSize();
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

// Add watermark layer button
addLayerBtn.addEventListener('click', function(e) {
    e.preventDefault();

    const watermarkText = watermarkTextInput.value.trim();
    if (!watermarkText) {
        showStatus(getMessage('pleaseEnterWatermark'), 'error');
        return;
    }

    // Get rotation angle
    let rotation;
    if (rotationSelect.value === 'custom') {
        rotation = parseInt(customRotationInput.value);
        if (isNaN(rotation) || rotation < -360 || rotation > 360) {
            showStatus(getMessage('invalidRotation'), 'error');
            return;
        }
    } else {
        rotation = parseInt(rotationSelect.value);
    }

    // Get color
    const colorValue = colorSelect.value;
    let textColor;

    if (colorValue === 'custom') {
        if (!validateColor()) {
            showStatus(getMessage('pleaseEnterValidColor'), 'error');
            return;
        }
        textColor = customColorHex.value.trim();
    } else {
        textColor = colorValue;
    }

    const layer = {
        text: watermarkText,
        fontSize: parseInt(fontSizeInput.value),
        opacity: parseInt(opacityInput.value) / 100,
        rotation: rotation,
        color: textColor,
        position: positionSelect.value
    };

    if (editingLayerIndex !== null) {
        // Update existing layer
        watermarkLayers[editingLayerIndex] = layer;
        editingLayerIndex = null;
        addLayerBtn.querySelector('span').textContent = getMessage('addLayerBtnText');
    } else {
        // Add new layer
        watermarkLayers.push(layer);
    }

    updateLayersList();
    updatePreview();
    clearForm();
    showStatus(getMessage('layerAdded'), 'success');
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

        layerItem.innerHTML = `
            <div class="layerInfo">
                <div class="layerText">${layer.text}</div>
                <div class="layerDetails">
                    ${getMessage('fontSize')}: ${layer.fontSize}px | 
                    ${getMessage('opacity')}: ${Math.round(layer.opacity * 100)}% | 
                    ${getMessage('rotation')}: ${layer.rotation}° | 
                    ${getMessage('color')}: ${colorName}
                </div>
            </div>
            <div class="layerActions">
                <button type="button" class="layerBtn editLayerBtn" data-index="${index}">${getMessage('editBtn')}</button>
                <button type="button" class="layerBtn removeLayerBtn" data-index="${index}">${getMessage('removeBtn')}</button>
            </div>
        `;

        layersList.appendChild(layerItem);
    });

    // Add event listeners
    document.querySelectorAll('.editLayerBtn').forEach(btn => {
        btn.addEventListener('click', function() {
            editLayer(parseInt(this.dataset.index));
        });
    });

    document.querySelectorAll('.removeLayerBtn').forEach(btn => {
        btn.addEventListener('click', function() {
            removeLayer(parseInt(this.dataset.index));
        });
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

    addLayerBtn.querySelector('span').textContent = getMessage('updateLayerBtn');

    // Scroll to form
    watermarkTextInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function removeLayer(index) {
    watermarkLayers.splice(index, 1);
    updateLayersList();
    updatePreview();
    showStatus(getMessage('layerRemoved'), 'success');
}

function updatePreview() {
    if (!selectedFile) return;

    // Clear canvas
    previewCtx.fillStyle = 'white';
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

    // Draw all watermark layers
    watermarkLayers.forEach(layer => {
        drawWatermarkOnCanvas(layer);
    });
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
        const colorMap = {
            'red': '#CC0000',
            'gray': '#808080',
            'black': '#000000',
            'blue': '#0000CC',
            'green': '#009900'
        };
        color = colorMap[layer.color] || '#000000';
    }

    // Set fill color and opacity
    ctx.fillStyle = color;
    ctx.globalAlpha = layer.opacity;

    // Calculate position in PDF coordinates, then scale to canvas
    let pdfX, pdfY;

    switch(layer.position) {
        case 'center':
        case 'diagonal':
            pdfX = pdfPageDimensions.width / 2;
            pdfY = pdfPageDimensions.height / 2;
            break;
        case 'top':
            pdfX = pdfPageDimensions.width / 2;
            pdfY = pdfPageDimensions.height - 50;
            break;
        case 'bottom':
            pdfX = pdfPageDimensions.width / 2;
            pdfY = 50;
            break;
        case 'top-left':
            pdfX = 80;
            pdfY = pdfPageDimensions.height - 50;
            break;
        case 'top-right':
            pdfX = pdfPageDimensions.width - 80;
            pdfY = pdfPageDimensions.height - 50;
            break;
        case 'bottom-left':
            pdfX = 80;
            pdfY = 50;
            break;
        case 'bottom-right':
            pdfX = pdfPageDimensions.width - 80;
            pdfY = 50;
            break;
        default:
            pdfX = pdfPageDimensions.width / 2;
            pdfY = pdfPageDimensions.height / 2;
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

    ctx.restore();
}

form.addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!selectedFile) {
        showStatus(getMessage('pleaseSelectPdf'), 'error');
        return;
    }

    if (watermarkLayers.length === 0) {
        showStatus(getMessage('pleaseAddAtLeastOneLayer'), 'error');
        return;
    }

    // Generate default output name based on original file
    const originalFileName = selectedFile.name;
    const fileNameWithoutExt = originalFileName.replace(/\.pdf$/i, '');
    const defaultFileName = `${fileNameWithoutExt}_watermarked.pdf`;

    showStatus(getMessage('processingFile'), 'success');
    submitBtn.disabled = true;

    try {
        const fileBuffer = await selectedFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(fileBuffer);

        // Always get author from global settings
        const metadata = await ipcRenderer.invoke('get-pdf-metadata');
        if (metadata.author) pdfDoc.setAuthor(metadata.author);

        // Check if custom metadata is enabled
        if (addMetadataCheckbox.checked) {
            // Use custom metadata from form fields for Title and Subject
            const customTitle = metadataTitleInput.value.trim();
            const customDescription = metadataDescriptionInput.value.trim();

            if (customTitle) pdfDoc.setTitle(customTitle);
            if (customDescription) pdfDoc.setSubject(customDescription);
        } else {
            // Use global settings for Title and Subject
            if (metadata.title) pdfDoc.setTitle(metadata.title);
            if (metadata.subject) pdfDoc.setSubject(metadata.subject);
        }

        // Embed font
        const helveticaFont = await pdfDoc.embedFont('Helvetica-Bold');

        const pages = pdfDoc.getPages();

        // Apply all watermark layers to each page
        pages.forEach(page => {
            const { width, height } = page.getSize();

            watermarkLayers.forEach(layer => {
                const textWidth = helveticaFont.widthOfTextAtSize(layer.text, layer.fontSize);

                let x, y, rotationAngle;

                switch(layer.position) {
                    case 'center':
                    case 'diagonal':
                        // Center the text properly
                        x = width / 2;
                        y = height / 2;
                        rotationAngle = layer.rotation;
                        break;
                    case 'top':
                        x = width / 2;
                        y = height - 50;
                        rotationAngle = layer.rotation;
                        break;
                    case 'bottom':
                        x = width / 2;
                        y = 50;
                        rotationAngle = layer.rotation;
                        break;
                    case 'top-left':
                        x = 80;
                        y = height - 50;
                        rotationAngle = layer.rotation;
                        break;
                    case 'top-right':
                        x = width - 80;
                        y = height - 50;
                        rotationAngle = layer.rotation;
                        break;
                    case 'bottom-left':
                        x = 80;
                        y = 50;
                        rotationAngle = layer.rotation;
                        break;
                    case 'bottom-right':
                        x = width - 80;
                        y = 50;
                        rotationAngle = layer.rotation;
                        break;
                    default:
                        x = width / 2;
                        y = height / 2;
                        rotationAngle = layer.rotation;
                }

                // Get text color
                let textColor;
                if (typeof layer.color === 'string' && layer.color.startsWith('#')) {
                    textColor = hexToRgb(layer.color);
                } else {
                    switch(layer.color) {
                        case 'red':
                            textColor = rgb(0.8, 0, 0);
                            break;
                        case 'gray':
                            textColor = rgb(0.5, 0.5, 0.5);
                            break;
                        case 'blue':
                            textColor = rgb(0, 0, 0.8);
                            break;
                        case 'green':
                            textColor = rgb(0, 0.6, 0);
                            break;
                        case 'black':
                        default:
                            textColor = rgb(0, 0, 0);
                            break;
                    }
                }

                // pdf-lib rotates around the baseline start point, not the center
                // We need to manually center and adjust for rotation

                // Convert rotation to radians
                const rotationRad = (rotationAngle * Math.PI) / 180;

                // Calculate text dimensions
                const textHeight = layer.fontSize;

                // Offset to center the text at the desired position
                // When rotated, we need to account for both width and height
                const offsetX = (textWidth / 2) * Math.cos(rotationRad) + (textHeight / 2) * Math.sin(rotationRad);
                const offsetY = (textWidth / 2) * Math.sin(rotationRad) - (textHeight / 2) * Math.cos(rotationRad);

                // Apply offsets to center the rotated text at the target position
                const finalX = x - offsetX;
                const finalY = y - offsetY;

                page.drawText(layer.text, {
                    x: finalX,
                    y: finalY,
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
        const defaultPath = path.join(downloadsPath, defaultFileName);

        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: defaultPath,
            filters: [
                { name: 'PDF Files', extensions: ['pdf'] }
            ]
        });

        if (!outputPath) {
            // User cancelled the save dialog
            showStatus(getMessage('saveCancelled'), 'error');
            submitBtn.disabled = false;
            return;
        }

        await fs.writeFile(outputPath, pdfBytes);

        const fileName = path.basename(outputPath);

        showStatus(getMessage('successWatermark', { filename: fileName }), 'success');
        submitBtn.disabled = false;

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
        metadataTitleInput.value = '';
        metadataDescriptionInput.value = '';
        addMetadataCheckbox.checked = false;
        metadataFieldsDiv.classList.remove('visible');

    } catch (error) {
        console.error('Error adding watermark:', error);
        showStatus(getMessage('errorPrefix') + error.message, 'error');
        submitBtn.disabled = false;
    }
});

function hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace('#', '');

    // Parse RGB values
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    return rgb(r, g, b);
}

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    statusDiv.style.display = 'block';

    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}


















