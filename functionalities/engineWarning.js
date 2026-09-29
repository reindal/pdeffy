var { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const engines = await ipcRenderer.invoke('check-engines-availability');
    const { hasLibreOffice, hasMSOffice } = engines;
    const hasOffice2Pdf = engines.hasOffice2Pdf !== false;
    const hasPdfLayout = engines.hasPdfLayoutExport !== false;

    const currentUrl = window.location.href.toLowerCase();

    const isPdfToDocx = currentUrl.includes('pdftodocx');
    const isPdfToPptx = currentUrl.includes('pdftopptx');
    const isPdfToExcel = currentUrl.includes('pdftoexcel');
    const isPdfToOffice = isPdfToDocx || isPdfToPptx || isPdfToExcel;

    const isOfficeToPdf =
      currentUrl.includes('docxtopdf') ||
      currentUrl.includes('exceltopdf') ||
      currentUrl.includes('powerpointtopdf') ||
      currentUrl.includes('pdfgenerator');

    if (!isPdfToOffice && !isOfficeToPdf) return;

    const builtInCovers =
      (isOfficeToPdf && hasOffice2Pdf) || (isPdfToOffice && hasPdfLayout);

    if (builtInCovers) {
      return;
    }

    let featureId = 'unknown';
    if (isPdfToDocx) featureId = 'pdftodocx';
    else if (isPdfToPptx) featureId = 'pdftopptx';
    else if (isPdfToExcel) featureId = 'pdftoexcel';

    const isPdfToOfficeLoPath = isPdfToOffice && !hasPdfLayout;

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

      if (typeof changeLanguage === 'function' && window.currentLanguage) {
        changeLanguage(window.currentLanguage);
      }

      document.getElementById('closeEngineWarning').addEventListener('click', () => {
        window.location.replace('../../index.html');
      });
      return;
    }

    if (hasLibreOffice && !hasMSOffice && isPdfToOfficeLoPath) {
      const warningSettings = await ipcRenderer.invoke('get-warning-settings');
      if (warningSettings[featureId]) {
        return;
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

      if (typeof changeLanguage === 'function' && window.currentLanguage) {
        changeLanguage(window.currentLanguage);
      }

      document.getElementById('closeEngineWarning').addEventListener('click', async () => {
        const checkbox = document.getElementById('dontShowAgainCheck');

        if (checkbox && checkbox.checked) {
          await ipcRenderer.invoke('save-warning-settings', featureId);
        }

        const overlay = document.getElementById('engineWarningOverlay');
        if (overlay) overlay.remove();
      });
    }
  } catch (error) {
    console.error('[Engine Checker] Error verifying conversion engines:', error);
  }
});
