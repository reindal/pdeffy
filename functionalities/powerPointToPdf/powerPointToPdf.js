const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const JSZip = require('jszip');
const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');

const form = document.getElementById('pptxToPdfForm');
const pptxFileInput = document.getElementById('pptxFile');
const submitBtn = document.getElementById('submitBtn');
const statusDiv = document.getElementById('status');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const fileInfo = document.getElementById('fileInfo');

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

pptxFileInput.addEventListener('change', function (e) {
    if (e.target.files.length > 0) {
        fileInfo.style.display = 'block';
        fileNameDisplay.textContent = e.target.files[0].name;
    }
});

form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!pptxFileInput.files[0]) return;

    submitBtn.disabled = true;
    showStatus(getMessage('convertingPptx'), 'info');

    try {
        const file = pptxFileInput.files[0];
        const arrayBuffer = await file.arrayBuffer();

        const zip = await JSZip.loadAsync(arrayBuffer);
        const pdfDoc = await PDFDocument.create();

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

        const font = await pdfDoc.embedFont(StandardFonts.Helvetica || 'Helvetica');

        // Slide files are located in ppt/slides/slideN.xml
        const slideFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'));

        // Sort slides numerically
        slideFiles.sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)[0]);
            const numB = parseInt(b.match(/\d+/)[0]);
            return numA - numB;
        });

        if (slideFiles.length === 0) throw new Error("No slides found");

        for (const slidePath of slideFiles) {
            const slideXml = await zip.file(slidePath).async("string");

            // Extract text from <a:t> nodes (text tag in Office XML)
            const textMatches = slideXml.match(/<a:t>([^<]+)<\/a:t>/g) || [];
            const slideText = textMatches.map(m => m.replace(/<\/?a:t>/g, ''));

            // Create one page per slide (typical PPT landscape format)
            const page = pdfDoc.addPage([842, 595]); // A4 Landscape
            const { width, height } = page.getSize();

            page.drawText(`Slide ${slideFiles.indexOf(slidePath) + 1}`, {
                x: 50,
                y: height - 40,
                size: 10,
                font: font,
                color: rgb(0.5, 0.5, 0.5)
            });

            let cursorY = height - 80;

            for (const text of slideText) {
                if (cursorY < 50) break; // Simple overflow prevention

                page.drawText(text, {
                    x: 70,
                    y: cursorY,
                    size: 14,
                    font: font,
                    color: rgb(0, 0, 0)
                });
                cursorY -= 25;
            }
        }

        const pdfBytes = await pdfDoc.save();
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const defaultPath = path.join(downloadsPath, file.name.replace('.pptx', '.pdf'));
        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: defaultPath,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (outputPath) {
            await fs.writeFile(outputPath, pdfBytes);
            showStatus(getMessage('successPptxCreated'), 'success');
            // Clear custom metadata fields
            setTimeout(() => {
                metadataTitleInput.value = '';
                metadataDescriptionInput.value = '';
                addMetadataCheckbox.checked = false;
                metadataFieldsDiv.classList.remove('visible');
            }, 2000);
        }

    } catch (error) {
        console.error(error);
        showStatus(getMessage('errorPptx') + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
    }
});

// Reusing utility functions
function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
}

