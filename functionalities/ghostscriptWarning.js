var { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { hasGhostscript, platform } = await ipcRenderer.invoke('check-ghostscript-availability');

        if (hasGhostscript) return;

        const submitBtn = document.querySelector('.submitBtn');
        if (submitBtn) submitBtn.disabled = true;

        let instructionHTML = '';

        if (platform === 'linux') {
            instructionHTML = `
                <p class="langText" data-i18n="gsWarningDescLinux"></p>
                <code class="gsInstallCmd">sudo apt install ghostscript</code>
            `;
        } else if (platform === 'darwin') {
            instructionHTML = `
                <p class="langText" data-i18n="gsWarningDescMac"></p>
                <div class="gsBrewBlock">
                    <span id="downloadGsButton" class="gsExternalLink engine-modal-btn langText" data-i18n="gsWarningMacDownloadBtn" id="gsDownloadLink" style="cursor:pointer">Download Ghostscript</span>
                </div>
                <p class="gsAdvancedLabel langText" data-i18n="gsWarningMacAdvanced"></p>
                <code class="gsInstallCmd">brew install ghostscript</code>
            `;
        }

        const modalHTML = `
            <div id="gsWarningOverlay" class="engine-overlay">
                <div class="engine-modal critical">
                    <h2 class="langText" data-i18n="gsWarningTitle">Ghostscript not found</h2>
                    ${instructionHTML}
                    <a href="../../index.html" class="engine-modal-btn langText" data-i18n="gsWarningBtn">Understood</a>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        if (typeof changeLanguage === 'function' && window.currentLanguage) {
            changeLanguage(window.currentLanguage);
        }

        const downloadLink = document.getElementById('gsDownloadLink');
        if (downloadLink) {
            downloadLink.addEventListener('click', () => {
                ipcRenderer.invoke('open-external-url', 'https://pages.uoregon.edu/koch/');
            });
        }

    } catch (error) {
        console.error('[GhostscriptWarning] Error checking Ghostscript availability:', error);
    }
});