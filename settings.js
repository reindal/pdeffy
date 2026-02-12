const { ipcRenderer } = require('electron');

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
        const lang = localStorage.getItem('language') || 'en';
        const messages = {
            en: 'Settings saved successfully!',
            it: 'Impostazioni salvate con successo!',
            pl: 'Ustawienia zapisane pomyślnie!'
        };

        settingsStatus.textContent = messages[lang] || messages.en;
        settingsStatus.className = 'settingsStatus success';
        settingsStatus.style.display = 'block';

        setTimeout(() => {
            settingsModal.classList.remove('active');
            settingsStatus.style.display = 'none';
        }, 5000);
    } catch (error) {
        console.error('Error saving settings:', error);
    }
});

// Load settings when page loads
loadSettings();


