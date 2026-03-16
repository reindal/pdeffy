const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');
const STATUS = '#status';

const form = document.getElementById('imageToPdfForm');
const imageFiles = document.getElementById('imageFiles');
const submitBtn = document.getElementById('submitBtn');
const imagesOrderContainer = document.getElementById('imagesOrderContainer');

let selectedImages = [];

imageFiles.addEventListener('change', function (e) {
    const newFiles = Array.from(e.target.files);
    selectedImages = [...selectedImages, ...newFiles];
    updateImagesOrder();
    imageFiles.value = '';
});

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
        StatusManager.show(STATUS, 'error', 'pleaseSelectAtLeastOneImage');
        return;
    }

    submitBtn.disabled = true;
    StatusManager.show(STATUS, 'processing', 'processing');

    try {
        const pdfDoc = await PDFDocument.create();

        // Get final metadata from module
        const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);

        if (finalMetadata.author) pdfDoc.setAuthor(finalMetadata.author);
        if (finalMetadata.title) pdfDoc.setTitle(finalMetadata.title);
        if (finalMetadata.subject) pdfDoc.setSubject(finalMetadata.subject);

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

        // Show Save As dialog with default path in Downloads
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const defaultFileName = 'images_document.pdf';
        const defaultPath = path.join(downloadsPath, defaultFileName);

        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: defaultPath,
            filters: [
                { name: 'PDF Files', extensions: ['pdf'] }
            ]
        });

        if (!outputPath) {
            // User cancelled the save dialog
            StatusManager.show(STATUS, 'error', 'saveCancelled');
            submitBtn.disabled = false;
            return;
        }

        await fs.writeFile(outputPath, pdfBytes);

        StatusManager.show(STATUS, 'success', 'successPdfCreated', {
            filename: path.basename(outputPath),
            savePath: outputPath
        });

        // Reset form
        setTimeout(() => {
            form.reset();
            selectedImages = [];
            updateImagesOrder();
            CustomMetadataModule.reset();
        }, 2000);

    } catch (error) {
        console.error('Error creating PDF:', error);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
    } finally {
        submitBtn.disabled = false;
    }
});