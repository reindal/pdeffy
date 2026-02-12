const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const { ipcRenderer } = require('electron');

const form = document.getElementById('imageToPdfForm');
const imageFiles = document.getElementById('imageFiles');
const imagesList = document.getElementById('imagesList');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const imagesOrderContainer = document.getElementById('imagesOrderContainer');

let selectedImages = [];

imageFiles.addEventListener('change', function(e) {
    selectedImages = Array.from(e.target.files);
    updateImagesList();
    updateImagesOrder();
});

function updateImagesList() {
    imagesList.innerHTML = '';

    if (selectedImages.length > 0) {
        imagesList.classList.add('active');
        selectedImages.forEach((image, index) => {
            const imageItem = document.createElement('div');
            imageItem.className = 'imageItem';
            imageItem.textContent = `${index + 1}. ${image.name}`;
            imagesList.appendChild(imageItem);
        });
    } else {
        imagesList.classList.remove('active');
    }
}

function updateImagesOrder() {
    imagesOrderContainer.innerHTML = '';

    selectedImages.forEach((image, index) => {
        const imageOrderItem = document.createElement('div');
        imageOrderItem.className = 'imageOrderItem';
        imageOrderItem.draggable = true;
        imageOrderItem.dataset.index = index;

        // Create preview
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = imageOrderItem.querySelector('.imageOrderPreview');
            if (preview) {
                preview.src = e.target.result;
            }
        };
        reader.readAsDataURL(image);

        imageOrderItem.innerHTML = `
            <div class="imageOrderIndex">${index + 1}</div>
            <img class="imageOrderPreview" src="" alt="Preview">
            <div class="imageOrderName">${image.name}</div>
            <button type="button" class="imageOrderRemove langText" data-index="${index}">Remove</button>
        `;

        const removeBtn = imageOrderItem.querySelector('.imageOrderRemove');
        removeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            selectedImages.splice(index, 1);
            updateImagesList();
            updateImagesOrder();
            imageFiles.value = '';
        });

        imageOrderItem.addEventListener('dragstart', handleDragStart);
        imageOrderItem.addEventListener('dragover', handleDragOver);
        imageOrderItem.addEventListener('drop', handleDrop);
        imageOrderItem.addEventListener('dragend', handleDragEnd);
        imageOrderItem.addEventListener('dragleave', handleDragLeave);

        imagesOrderContainer.appendChild(imageOrderItem);
    });
}

let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (this !== draggedItem) {
        this.classList.add('dragover');
    }
}

function handleDragLeave(e) {
    this.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();

    if (this !== draggedItem) {
        this.classList.remove('dragover');

        const draggedIndex = parseInt(draggedItem.dataset.index);
        const targetIndex = parseInt(this.dataset.index);

        const [draggedImage] = selectedImages.splice(draggedIndex, 1);
        selectedImages.splice(targetIndex, 0, draggedImage);

        updateImagesList();
        updateImagesOrder();
    }
}

function handleDragEnd(e) {
    this.classList.remove('dragging');

    const allItems = document.querySelectorAll('.imageOrderItem');
    allItems.forEach(item => {
        item.classList.remove('dragover');
    });
}

form.addEventListener('submit', async function(e) {
    e.preventDefault();

    if (selectedImages.length === 0) {
        showStatus(getMessage('pleaseSelectAtLeastOneImage'), 'error');
        return;
    }

    submitBtn.disabled = true;
    showStatus(getMessage('creatingPdf'), 'info');

    try {
        const pdfDoc = await PDFDocument.create();

        // Get metadata from environment variables
        const metadata = await ipcRenderer.invoke('get-pdf-metadata');
        if (metadata.author) pdfDoc.setAuthor(metadata.author);
        if (metadata.title) pdfDoc.setTitle(metadata.title);
        if (metadata.subject) pdfDoc.setSubject(metadata.subject);

        for (const imageFile of selectedImages) {
            const imageBytes = await imageFile.arrayBuffer();
            let image;

            const fileExtension = imageFile.name.toLowerCase().split('.').pop();

            if (fileExtension === 'png') {
                image = await pdfDoc.embedPng(imageBytes);
            } else if (fileExtension === 'jpg' || fileExtension === 'jpeg') {
                image = await pdfDoc.embedJpg(imageBytes);
            } else {
                // Convert other formats to PNG using canvas
                const img = await createImageBitmap(new Blob([imageBytes]));
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                const pngBytes = await pngBlob.arrayBuffer();
                image = await pdfDoc.embedPng(pngBytes);
            }

            const page = pdfDoc.addPage();
            const pageWidth = page.getWidth();
            const pageHeight = page.getHeight();

            const imageWidth = image.width;
            const imageHeight = image.height;

            // Scale image to fit page while maintaining aspect ratio
            let scale = Math.min(pageWidth / imageWidth, pageHeight / imageHeight);
            const scaledWidth = imageWidth * scale;
            const scaledHeight = imageHeight * scale;

            // Center image on page
            const x = (pageWidth - scaledWidth) / 2;
            const y = (pageHeight - scaledHeight) / 2;

            page.drawImage(image, {
                x: x,
                y: y,
                width: scaledWidth,
                height: scaledHeight,
            });
        }

        const pdfBytes = await pdfDoc.save();

        const outputName = document.getElementById('outputName').value || 'images_document';
        const fileName = outputName.endsWith('.pdf') ? outputName : `${outputName}.pdf`;

        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const outputPath = path.join(downloadsPath, fileName);

        await fs.writeFile(outputPath, pdfBytes);

        // Set read-only if checkbox is checked
        const readOnlyCheckbox = document.getElementById('readOnlyCheckbox');
        if (readOnlyCheckbox && readOnlyCheckbox.checked) {
            try {
                await ipcRenderer.invoke('set-file-readonly', outputPath);
            } catch (error) {
                console.error('Error setting read-only:', error);
            }
        }

        showStatus(getMessage('successPdfCreated', { filename: fileName }), 'success');

        // Reset form
        setTimeout(() => {
            form.reset();
            selectedImages = [];
            updateImagesList();
            updateImagesOrder();
        }, 2000);

    } catch (error) {
        console.error('Error creating PDF:', error);
        showStatus(getMessage('errorPrefix') + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';

    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}

// Helper function to get translated message
function getMessage(key, params = {}) {
    const lang = localStorage.getItem('language') || 'en';
    const messages = {
        en: {
            pleaseSelectAtLeastOneImage: "Please select at least one image",
            creatingPdf: "Creating PDF...",
            successPdfCreated: "✓ PDF created successfully: {filename}",
            errorPrefix: "Error: "
        },
        it: {
            pleaseSelectAtLeastOneImage: "Seleziona almeno un'immagine",
            creatingPdf: "Creazione PDF...",
            successPdfCreated: "✓ PDF creato con successo: {filename}",
            errorPrefix: "Errore: "
        },
        pl: {
            pleaseSelectAtLeastOneImage: "Proszę wybrać co najmniej jeden obraz",
            creatingPdf: "Tworzenie PDF...",
            successPdfCreated: "✓ PDF utworzony pomyślnie: {filename}",
            errorPrefix: "Błąd: "
        }
    };

    let message = (messages[lang] && messages[lang][key]) || messages['en'][key] || key;

    Object.keys(params).forEach(param => {
        message = message.replace(`{${param}}`, params[param]);
    });

    return message;
}