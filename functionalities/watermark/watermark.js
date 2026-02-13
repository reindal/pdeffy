const { PDFDocument, rgb, degrees } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const { ipcRenderer } = require('electron');

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

let selectedFile = null;

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
pdfFileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        fileNameDiv.textContent = `✓ ${getMessage('selectedFile')}${selectedFile.name}`;
    }
});

form.addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!selectedFile) {
        showStatus(getMessage('pleaseSelectPdf'), 'error');
        return;
    }

    const watermarkText = watermarkTextInput.value.trim();
    if (!watermarkText) {
        showStatus(getMessage('pleaseEnterWatermark'), 'error');
        return;
    }

    const fontSize = parseInt(fontSizeInput.value);
    const opacity = parseInt(opacityInput.value) / 100;

    // Get rotation angle
    let rotation;
    if (rotationSelect.value === 'custom') {
        rotation = parseInt(customRotationInput.value);
        if (isNaN(rotation) || rotation < -360 || rotation > 360) {
            showStatus(getMessage('invalidRotation'), 'error');
            submitBtn.disabled = false;
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
            submitBtn.disabled = false;
            return;
        }
        const hexValue = customColorHex.value.trim();
        textColor = hexToRgb(hexValue);
    } else {
        switch(colorValue) {
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

    const position = positionSelect.value;

    // Generate default output name based on original file
    const originalFileName = selectedFile.name;
    const fileNameWithoutExt = originalFileName.replace(/\.pdf$/i, '');
    const defaultFileName = `${fileNameWithoutExt}_watermarked.pdf`;

    showStatus(getMessage('processingFile'), 'success');
    submitBtn.disabled = true;

    try {
        const fileBuffer = await selectedFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(fileBuffer);

        // Get metadata from environment variables
        const metadata = await ipcRenderer.invoke('get-pdf-metadata');
        if (metadata.author) pdfDoc.setAuthor(metadata.author);
        if (metadata.title) pdfDoc.setTitle(metadata.title);
        if (metadata.subject) pdfDoc.setSubject(metadata.subject);

        // Embed font
        const helveticaFont = await pdfDoc.embedFont('Helvetica-Bold');

        const pages = pdfDoc.getPages();

        pages.forEach(page => {
            const { width, height } = page.getSize();
            const textWidth = helveticaFont.widthOfTextAtSize(watermarkText, fontSize);
            const textHeight = fontSize;

            let x, y, rotationAngle;

            switch(position) {
                case 'center':
                    x = (width - textWidth) / 2;
                    y = height / 2;
                    rotationAngle = rotation;
                    break;
                case 'diagonal':
                    x = (width - textWidth) / 2;
                    y = height / 2;
                    rotationAngle = 45;
                    break;
                case 'top':
                    x = (width - textWidth) / 2;
                    y = height - textHeight - 50;
                    rotationAngle = 0;
                    break;
                case 'bottom':
                    x = (width - textWidth) / 2;
                    y = 50;
                    rotationAngle = 0;
                    break;
                default:
                    x = (width - textWidth) / 2;
                    y = height / 2;
                    rotationAngle = rotation;
            }

            page.drawText(watermarkText, {
                x: x,
                y: y,
                size: fontSize,
                font: helveticaFont,
                color: textColor,
                opacity: opacity,
                rotate: degrees(rotationAngle),
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
        fileNameDiv.textContent = '';
        opacityValue.textContent = '30%';
        customRotationInput.style.display = 'none';
        customColorWrapper.style.display = 'none';
        customColorHex.classList.remove('valid', 'invalid');
        colorError.textContent = '';
        customColorHex.value = '#000000';
        colorPicker.value = '#000000';

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
}

// Helper function to get translated message
function getMessage(key, params = {}) {
    const lang = localStorage.getItem('language') || 'en';
    const messages = {
        en: {
            selectedFile: "Selected file: ",
            pleaseSelectPdf: "Please select a PDF file",
            pleaseEnterWatermark: "Please enter watermark text",
            processingFile: "Adding watermark...",
            successWatermark: "✓ Successfully created watermarked PDF: {filename}!",
            saveCancelled: "Save cancelled",
            invalidHexColor: "Invalid color format. Use #RRGGBB (e.g., #FF0000)",
            invalidRotation: "Rotation angle must be between -360 and 360 degrees",
            pleaseEnterValidColor: "Please enter a valid HEX color",
            errorPrefix: "Error: "
        },
        it: {
            selectedFile: "File selezionato: ",
            pleaseSelectPdf: "Seleziona un file PDF",
            pleaseEnterWatermark: "Inserisci il testo della filigrana",
            processingFile: "Aggiunta filigrana...",
            successWatermark: "✓ PDF con filigrana creato con successo: {filename}!",
            saveCancelled: "Salvataggio annullato",
            invalidHexColor: "Formato colore non valido. Usa #RRGGBB (es. #FF0000)",
            invalidRotation: "L'angolo di rotazione deve essere tra -360 e 360 gradi",
            pleaseEnterValidColor: "Inserisci un colore HEX valido",
            errorPrefix: "Errore: "
        },
        pl: {
            selectedFile: "Wybrany plik: ",
            pleaseSelectPdf: "Proszę wybrać plik PDF",
            pleaseEnterWatermark: "Proszę wprowadzić tekst znaku wodnego",
            processingFile: "Dodawanie znaku wodnego...",
            successWatermark: "✓ Pomyślnie utworzono PDF ze znakiem wodnym: {filename}!",
            saveCancelled: "Anulowano zapisywanie",
            invalidHexColor: "Nieprawidłowy format koloru. Użyj #RRGGBB (np. #FF0000)",
            invalidRotation: "Kąt obrotu musi być między -360 a 360 stopni",
            pleaseEnterValidColor: "Proszę wprowadzić prawidłowy kolor HEX",
            errorPrefix: "Błąd: "
        },
        es: {
            selectedFile: "Archivo seleccionado: ",
            pleaseSelectPdf: "Por favor seleccione un archivo PDF",
            pleaseEnterWatermark: "Por favor ingrese el texto de la marca de agua",
            processingFile: "Agregando marca de agua...",
            successWatermark: "✓ PDF con marca de agua creado exitosamente: {filename}!",
            saveCancelled: "Guardado cancelado",
            invalidHexColor: "Formato de color no válido. Use #RRGGBB (ej. #FF0000)",
            invalidRotation: "El ángulo de rotación debe estar entre -360 y 360 grados",
            pleaseEnterValidColor: "Por favor ingrese un color HEX válido",
            errorPrefix: "Error: "
        }
    };

    let message = messages[lang]?.[key] || messages.en[key] || key;

    // Replace parameters
    Object.keys(params).forEach(paramKey => {
        message = message.replace(`{${paramKey}}`, params[paramKey]);
    });

    return message;
}



















