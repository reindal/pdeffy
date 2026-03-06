var { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { hasLibreOffice, hasMSOffice } = await ipcRenderer.invoke('check-engines-availability');
        
        // Identify the exact tool being used based on the current URL
        const currentUrl = window.location.href.toLowerCase();
        let featureId = 'unknown';
        if (currentUrl.includes('pdftodocx')) featureId = 'pdftodocx';
        else if (currentUrl.includes('pdftopptx')) featureId = 'pdftopptx';

        const isPdfToOfficeFormat = featureId === 'pdftodocx' || featureId === 'pdftopptx';

        // ==========================================
        // CRITICAL ERROR 
        // ==========================================
        if (!hasLibreOffice && !hasMSOffice) {
            const submitBtn = document.querySelector('.submitBtn');
            if (submitBtn) submitBtn.disabled = true;

            const modalHTML = `
                <div id="engineWarningOverlay" class="engine-overlay">
                    <div class="engine-modal critical">
                        <h2 class="langText" data-i18n="engineWarningCriticalTitle">Missing Requirements</h2>
                        <p class="langText" data-i18n="engineWarningCriticalDesc">This feature requires LibreOffice or Microsoft Office to be installed on your computer. Please install LibreOffice (free) to enable document conversions.</p>
                        <button id="closeEngineWarning" class="engine-modal-btn langText" data-i18n="engineWarningCriticalBtn">Understood</button>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            if (typeof window.applyTranslations === 'function') window.applyTranslations();

            // Redirect the user back to the main menu upon clicking the button
            document.getElementById('closeEngineWarning').addEventListener('click', () => {
                window.location.href = '../../index.html';
            });
            return; // Halt execution to prevent displaying any other UI elements
        }

        // ==========================================
        // INFO WARNING (With per-feature checkbox)
        // ==========================================
        if (hasLibreOffice && !hasMSOffice && isPdfToOfficeFormat) {
            
            // Check the backend to see if the user previously dismissed this warning FOR THIS SPECIFIC FEATURE
            const warningSettings = await ipcRenderer.invoke('get-warning-settings');
            if (warningSettings[featureId]) {
                return; // If set to true, abort and do not render the modal. The user proceeds normally.
            }

            const modalHTML = `
                <div id="engineWarningOverlay" class="engine-overlay">
                    <div class="engine-modal info">
                        <h2 class="langText" data-i18n="engineWarningInfoTitle">Conversion Quality Notice</h2>
                        <p class="langText" data-i18n="engineWarningInfoDesc">You are using LibreOffice for this conversion. While it works well, complex PDFs might lose some styling or formatting. For pixel-perfect conversions, Microsoft Office is recommended.</p>
                        
                        <label class="engine-dont-show">
                            <input type="checkbox" id="dontShowAgainCheck">
                            <span class="langText" data-i18n="engineWarningDontShow">Don't show this warning again</span>
                        </label>

                        <button id="closeEngineWarning" class="engine-modal-btn langText" data-i18n="engineWarningInfoBtn">Got it, continue</button>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            if (typeof window.applyTranslations === 'function') window.applyTranslations();

            document.getElementById('closeEngineWarning').addEventListener('click', async () => {
                const checkbox = document.getElementById('dontShowAgainCheck');
                
                // If the user checked the box, notify the backend to persist this preference in the JSON file
                if (checkbox && checkbox.checked) {
                    await ipcRenderer.invoke('save-warning-settings', featureId);
                }
                
                // Close the modal overlay
                const overlay = document.getElementById('engineWarningOverlay');
                if (overlay) overlay.remove();
            });
        }

    } catch (error) {
        console.error("[Engine Checker] Error verifying conversion engines:", error);
    }
});