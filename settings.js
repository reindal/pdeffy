var { ipcRenderer } = require('electron');
window.addEventListener('load', () => {
    injectSettingsUI();

    const settingsIcon = document.getElementById('settingsIcon');
    const settingsModal = document.getElementById('settingsModal');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    const settingsStatus = document.getElementById('settingsStatus');

    const metaAuthor = document.getElementById('metaAuthor');
    const metaTitle = document.getElementById('metaTitle');
    const metaSubject = document.getElementById('metaSubject');

    // Load saved settings on page load
    async function loadSettings() {
        try {
            const settings = await ipcRenderer.invoke('get-pdf-metadata');
            if (settings) {
                metaAuthor.value = settings.author || '';
                metaTitle.value = settings.title || '';
                metaSubject.value = settings.subject || '';
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    // Open settings modal
    settingsIcon.addEventListener('click', async () => {
        await loadSettings();
        settingsModal.classList.add('active');
    });

    // Close settings modal
    cancelSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('active');
        settingsStatus.style.display = 'none';
    });

    // Close modal when clicking outside
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('active');
            settingsStatus.style.display = 'none';
        }
    });

    // Save settings
    saveSettingsBtn.addEventListener('click', async () => {
        const metadata = {
            author: metaAuthor.value.trim(),
            title: metaTitle.value.trim(),
            subject: metaSubject.value.trim()
        };

        try {
            await ipcRenderer.invoke('save-pdf-metadata', metadata);

            // Show success message
            const lang = await ipcRenderer.invoke('get-language');
            const messages = {
                en: 'Settings saved successfully!',
                it: 'Impostazioni salvate con successo!',
                pl: 'Ustawienia zapisane pomyślnie!',
                es: '¡Configuración guardada correctamente!'
            };

            settingsStatus.textContent = messages[lang] || messages.en;
            settingsStatus.className = 'settingsStatus success';
            settingsStatus.style.display = 'block';

            setTimeout(() => {
                settingsModal.classList.remove('active');
                settingsStatus.style.display = 'none';
            }, 2000);
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    });

    // Load settings when page loads
    loadSettings();

    function injectSettingsUI() {
        // Avoid duplicates of HTML.
        if (!document.getElementById('settingsModal')) {
            document.body.insertAdjacentHTML('beforeend', `
                    <!-- Settings Icon -->
                    <div class="settingsIcon" id="settingsIcon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
                        </svg>
                    </div>

                    <!-- Settings Modal -->
                    <div class="settingsModal" id="settingsModal">
                        <div class="settingsContent">
                            <h2 id="settingsTitle" class="langText">Settings</h2>
                            <h3 id="metadataTitle" class="langText">Change Language</h3>
                            <select id="languageSelector">
                                <option value="en">🇬🇧 English</option>
                                <option value="it">🇮🇹 Italiano</option>
                                <option value="pl">🇵🇱 Polski</option>
                                <option value="es">🇪🇸 Español</option>
                            </select>
                            <h3 id="metadataTitle" class="langText">PDF Metadata</h3>
                            <div class="settingsFormGroup">
                                <label for="metaAuthor" id="authorLabel" class="langText">Author:</label>
                                <input type="text" id="metaAuthor" class="langTextPlaceholder" placeholder="Enter author name">
                            </div>
                            <div class="settingsFormGroup">
                                <label for="metaTitle" id="titleLabel" class="langText">Title:</label>
                                <input type="text" id="metaTitle" class="langTextPlaceholder" placeholder="Enter document title">
                            </div>
                            <div class="settingsFormGroup">
                                <label for="metaSubject" id="subjectLabel" class="langText">Subject:</label>
                                <input type="text" id="metaSubject" class="langTextPlaceholder" placeholder="Enter document subject">
                            </div>
                            <div class="settingsButtons">
                                <button class="settingsBtn cancel" id="cancelSettingsBtn"><span class="langText" id="cancelSettings">Cancel</span></button>
                                <button class="settingsBtn save" id="saveSettingsBtn"><span class="langText" id="saveSettings">Save Settings</span></button>
                            </div>
                            <div class="settingsStatus" id="settingsStatus"></div>
                        </div>
                    </div>
                `);
        }
        window.dispatchEvent(new Event('settingsUIReady'));
    }
});


