// Module to handle the injection, retrieval, and reset of custom metadata in the UI
const CustomMetadataModule = {
    
    // Inject the metadata HTML elements right above the submit button
    init: function() {
        const submitBtn = document.getElementById('submitBtn');
        if (!submitBtn) return;

        // Prevent duplicate injection if the UI is already in the DOM
        if (document.getElementById('addMetadataCheckbox')) return;

        // Create the container for the metadata toggle and input fields
        const container = document.createElement('div');
        container.className = 'metadataCheckboxGroup';
        container.innerHTML = `
            <label class="metadataCheckboxLabel">
                <input type="checkbox" id="addMetadataCheckbox">
                <span class="langText" id="addCustomMetadata">Add custom metadata properties</span>
            </label>
            <div id="metadataFields" class="metadataFields">
                <div class="formGroup">
                    <label for="metadataTitleInput" class="langText" id="metadataTitle">Title:</label>
                    <input type="text" id="metadataTitleInput" class="langTextPlaceholder" placeholder="Enter document title">
                </div>
                <div class="formGroup">
                    <label for="metadataDescriptionInput" class="langText" id="metadataDescription">Description:</label>
                    <textarea id="metadataDescriptionInput" class="langTextPlaceholder" placeholder="Enter document description"></textarea>
                </div>
            </div>
        `;

        // Insert the container into the DOM just before the submit button
        submitBtn.parentNode.insertBefore(container, submitBtn);

        // Bind the change event to toggle the visibility of the input fields
        const checkbox = document.getElementById('addMetadataCheckbox');
        const fieldsDiv = document.getElementById('metadataFields');
        
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                fieldsDiv.classList.add('visible');
            } else {
                fieldsDiv.classList.remove('visible');
            }
        });
    },

    // Author + optional company, e.g. "Mario Rossi — Reindal"
    formatAuthorField: function(author, company) {
        const a = String(author || '').trim();
        const c = String(company || '').trim();
        if (a && c) return `${a} — ${c}`;
        return a || c || '';
    },

    // Apply metadata to a pdf-lib PDFDocument
    applyToPdfDoc: function(pdfDoc, metadata) {
        if (!pdfDoc || !metadata) return;
        const author = this.formatAuthorField(metadata.author, metadata.company);
        if (author) pdfDoc.setAuthor(author);
        if (metadata.title) pdfDoc.setTitle(metadata.title);
        if (metadata.subject) pdfDoc.setSubject(metadata.subject);
        if (typeof pdfDoc.setCreator === 'function') pdfDoc.setCreator('Pdeffy');
        if (typeof pdfDoc.setProducer === 'function') pdfDoc.setProducer('Pdeffy');
    },

    // Always include settings author/company; title/description only when the user fills them.
    getFinalMetadata: async function(ipcRenderer) {
        const globalMetadata = await ipcRenderer.invoke('get-pdf-metadata');

        const finalMetadata = {
            author: globalMetadata.author || '',
            company: globalMetadata.company || '',
            title: '',
            subject: ''
        };

        const checkbox = document.getElementById('addMetadataCheckbox');
        const titleInput = document.getElementById('metadataTitleInput');
        const descInput = document.getElementById('metadataDescriptionInput');

        if (checkbox && checkbox.checked) {
            const customTitle = titleInput ? titleInput.value.trim() : '';
            const customDesc = descInput ? descInput.value.trim() : '';
            if (customTitle) finalMetadata.title = customTitle;
            if (customDesc) finalMetadata.subject = customDesc;
        }

        return finalMetadata;
    },

    // Reset the custom metadata inputs to their default state after processing
    reset: function() {
        const checkbox = document.getElementById('addMetadataCheckbox');
        const fieldsDiv = document.getElementById('metadataFields');
        const titleInput = document.getElementById('metadataTitleInput');
        const descInput = document.getElementById('metadataDescriptionInput');

        // Clear values and hide the input container
        if (titleInput) titleInput.value = '';
        if (descInput) descInput.value = '';
        if (checkbox) checkbox.checked = false;
        if (fieldsDiv) fieldsDiv.classList.remove('visible');
    }
};

// ES modules don't share scope — expose for page scripts (Electron used a shared classic scope).
window.CustomMetadataModule = CustomMetadataModule;

// Automatically initialize the module when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    CustomMetadataModule.init();
});