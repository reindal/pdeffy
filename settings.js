var { ipcRenderer } = require('electron');

function settingsPageUrl() {
    const path = window.location.pathname.replace(/\\/g, '/');
    const idx = path.indexOf('/functionalities/');
    if (idx === -1) return './functionalities/settings/settings.html';
    const after = path.slice(idx + '/functionalities/'.length);
    const depth = after.split('/').filter(Boolean).length;
    return `${'../'.repeat(depth)}settings/settings.html`;
}

function isSettingsPage() {
    return /\/settings\/settings\.html/i.test(window.location.pathname.replace(/\\/g, '/'));
}

function openSettingsPage(query = '') {
    const url = settingsPageUrl() + (query ? `?${query}` : '');
    window.location.replace(url);
}

window.addEventListener('load', () => {
    // Legacy floating gear (hidden in shell) — keep as navigation fallback.
    document.getElementById('settingsIcon')?.addEventListener('click', () => {
        if (!isSettingsPage()) openSettingsPage();
    });

    window.addEventListener('pdeffy:open-settings', () => {
        if (!isSettingsPage()) openSettingsPage();
    });

    if (!isSettingsPage()) {
        showFirstLaunchExperience();
    }
});

async function showFirstLaunchExperience() {
    try {
        const isFirstLaunch = await ipcRenderer.invoke('check-first-launch');
        if (!isFirstLaunch) return;
        openSettingsPage('welcome=1');
    } catch (error) {
        console.error('Error handling first-launch experience:', error);
    }
}

window.pdeffyOpenSettings = openSettingsPage;
window.pdeffySettingsPageUrl = settingsPageUrl;
