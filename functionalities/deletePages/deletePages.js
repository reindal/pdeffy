const pdfjsLib = require('pdfjs-dist/build/pdf.js');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');

const form = document.getElementById('deleteForm');
const fileInput = document.getElementById('pdfFile');
const pagesGrid = document.getElementById('pagesGrid');
const previewSection = document.getElementById('pagesPreviewSection');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');

// Configuración de PDF.js para las miniaturas
pdfjsLib.GlobalWorkerOptions.workerSrc =
    require('pdfjs-dist/build/pdf.worker.js');

let originalFileBuffer = null;
let pagesToDelete = new Set(); // Guardamos los índices de páginas a borrar
let totalPages = 0;

fileInput.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    pagesToDelete.clear();
    const fileArrayBuffer = await file.arrayBuffer();

    // Copias separadas: una para previsualizar y otra para guardar
    const previewBuffer = fileArrayBuffer.slice(0);
    originalFileBuffer = fileArrayBuffer.slice(0);

    await renderPagePreviews(previewBuffer);
});

async function renderPagePreviews(buffer) {
    pagesGrid.innerHTML = '<p>Cargando previsualización...</p>';
    previewSection.style.display = 'block';

    const loadingTask = pdfjsLib.getDocument({ data: buffer, disableWorker: true });
    const pdf = await loadingTask.promise;
    totalPages = pdf.numPages;

    pagesGrid.innerHTML = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 }); // Miniatura pequeña

        const wrapper = document.createElement('div');
        wrapper.className = 'pageItem';
        wrapper.dataset.pageIndex = i - 1; // Índice 0-based para pdf-lib

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        const badge = document.createElement('div');
        badge.className = 'pageBadge';
        badge.innerText = i;

        wrapper.appendChild(canvas);
        wrapper.appendChild(badge);

        wrapper.addEventListener('click', () => {
            const idx = parseInt(wrapper.dataset.pageIndex);
            if (pagesToDelete.has(idx)) {
                pagesToDelete.delete(idx);
                wrapper.classList.remove('selected');
            } else {
                pagesToDelete.add(idx);
                wrapper.classList.add('selected');
            }
            submitBtn.disabled = pagesToDelete.size === 0 || pagesToDelete.size === totalPages;
        });

        pagesGrid.appendChild(wrapper);
    }
    submitBtn.disabled = true;
}

form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (pagesToDelete.size === 0 || pagesToDelete.size === totalPages) {
        showStatus('Debes dejar al menos una página sin seleccionar.', 'error');
        return;
    }

    submitBtn.disabled = true;
    showStatus(getMessage('processing'), 'success');

    try {
        const pdfDoc = await PDFDocument.load(originalFileBuffer.slice(0));

        // ¡Importante! Borrar de atrás hacia adelante para no alterar los índices
        const sortedIndices = Array.from(pagesToDelete).sort((a, b) => b - a);

        sortedIndices.forEach(index => {
            pdfDoc.removePage(index);
        });

        const pdfBytes = await pdfDoc.save();
        const fileName = `cleaned_${Date.now()}.pdf`;
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const savePath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: path.join(downloadsPath, fileName),
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (!savePath) {
            showStatus('Guardado cancelado', 'error');
            submitBtn.disabled = false;
            return;
        }

        await fs.writeFile(savePath, pdfBytes);

        showStatus(getMessage('successDeleted', { filename: path.basename(savePath) }), 'success');
        submitBtn.disabled = false;

    } catch (error) {
        console.error(error);
        showStatus(getMessage('errorPrefix') + error.message, 'error');
        submitBtn.disabled = false;
    }
});

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
}

// Función getMessage adaptada con el array que pediste abajo
