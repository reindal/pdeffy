var { ipcRenderer } = require('electron');
const path = require('path');

const STATUS = '#status';

const form                     = document.getElementById('protectForm');
const pdfFileInput             = document.getElementById('pdfFile');
const submitBtn                = document.getElementById('submitBtn');
const fileInfo                 = document.getElementById('fileInfo');
const fileNameDisplay          = document.getElementById('fileNameDisplay');

const userPasswordInput        = document.getElementById('userPassword');
const userPasswordConfirm      = document.getElementById('userPasswordConfirm');
const ownerPasswordInput       = document.getElementById('ownerPassword');
const ownerPasswordConfirm     = document.getElementById('ownerPasswordConfirm');
const userPassMismatch         = document.getElementById('userPassMismatch');
const ownerPassMismatch        = document.getElementById('ownerPassMismatch');

const permPrinting  = document.getElementById('permPrinting');
const permCopying   = document.getElementById('permCopying');
const permEditing   = document.getElementById('permEditing');

const generatedOwnerBlock   = document.getElementById('generatedOwnerBlock');
const generatedOwnerDisplay = document.getElementById('generatedOwnerDisplay');
const copiedMsg             = document.getElementById('copiedMsg');

let selectedFile = null;
let lastGeneratedOwnerPass = null;

// ── Generated owner password buttons ─────────────────────────
document.getElementById('toggleGeneratedOwner').addEventListener('click', () => {
    const btn   = document.getElementById('toggleGeneratedOwner');
    const input = generatedOwnerDisplay;
    const isVisible = input.type === 'text';
    input.type  = isVisible ? 'password' : 'text';
    btn.innerHTML = isVisible ? EYE_OPEN : EYE_CLOSED;
});

document.getElementById('copyGeneratedOwner').addEventListener('click', () => {
    if (!lastGeneratedOwnerPass) return;
    navigator.clipboard.writeText(lastGeneratedOwnerPass).then(() => {
        copiedMsg.textContent = window.getMessage ? window.getMessage('protectCopied') : 'Copied to clipboard!';
        copiedMsg.style.display = 'block';
        setTimeout(() => { copiedMsg.style.display = 'none'; }, 2000);
    });
});

// ── Eye toggle buttons ────────────────────────────────────────
const EYE_OPEN   = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function setupEyeToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    btn.addEventListener('click', () => {
        const input = document.getElementById(inputId);
        const isVisible = input.type === 'text';
        input.type = isVisible ? 'password' : 'text';
        btn.innerHTML = isVisible ? EYE_OPEN : EYE_CLOSED;
    });
}
setupEyeToggle('toggleUserPass',         'userPassword');
setupEyeToggle('toggleUserPassConfirm',  'userPasswordConfirm');
setupEyeToggle('toggleOwnerPass',        'ownerPassword');
setupEyeToggle('toggleOwnerPassConfirm', 'ownerPasswordConfirm');

// ── File input ────────────────────────────────────────────────
pdfFileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) {
        selectedFile = null;
        fileInfo.style.display = 'none';
        updateSubmitBtn();
        return;
    }
    selectedFile = file;
    fileNameDisplay.textContent = file.name;
    fileInfo.style.display = 'flex';
    updateSubmitBtn();
});

// ── Listen to all protection inputs ──────────────────────────
[userPasswordInput, userPasswordConfirm, ownerPasswordInput, ownerPasswordConfirm,
 permPrinting, permCopying, permEditing].forEach(el => {
    el.addEventListener('input',  () => { validate(); updateSubmitBtn(); });
    el.addEventListener('change', () => { validate(); updateSubmitBtn(); });
});

// ── Validation ────────────────────────────────────────────────
function validate() {
    let valid = true;

    const uPass = userPasswordInput.value;
    const uConf = userPasswordConfirm.value;

    // If user typed a password, confirmation must match and not be empty
    if (uPass.length > 0) {
        const uMismatch = uConf.length === 0 || uPass !== uConf;
        userPassMismatch.style.display = uMismatch ? 'block' : 'none';
        userPassMismatch.textContent = uMismatch
            ? (window.getMessage ? window.getMessage('protectPassMismatch') : 'Passwords do not match')
            : '';
        if (uMismatch) valid = false;
    } else {
        userPassMismatch.style.display = 'none';
    }

    const oPass = ownerPasswordInput.value;
    const oConf = ownerPasswordConfirm.value;

    // Same for owner password
    if (oPass.length > 0) {
        const oMismatch = oConf.length === 0 || oPass !== oConf;
        ownerPassMismatch.style.display = oMismatch ? 'block' : 'none';
        ownerPassMismatch.textContent = oMismatch
            ? (window.getMessage ? window.getMessage('protectPassMismatch') : 'Passwords do not match')
            : '';
        if (oMismatch) valid = false;
    } else {
        ownerPassMismatch.style.display = 'none';
    }

    return valid;
}

function hasAnyProtection() {
    const userPass  = userPasswordInput.value.trim();
    const ownerPass = ownerPasswordInput.value.trim();
    const printingChanged = permPrinting.value !== 'highResolution';
    const copyingChanged  = !permCopying.checked;
    const editingChanged  = !permEditing.checked;
    return userPass.length > 0 || ownerPass.length > 0
        || printingChanged || copyingChanged || editingChanged;
}

function updateSubmitBtn() {
    submitBtn.disabled = !selectedFile || !hasAnyProtection() || !validate();
}

// ── Form submit ───────────────────────────────────────────────
form.addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!selectedFile) {
        StatusManager.show(STATUS, 'error', 'pleaseSelectFile');
        return;
    }
    if (!validate()) return;

    const userPass  = userPasswordInput.value.trim();
    const ownerPass = ownerPasswordInput.value.trim();

    // If permissions are restricted but no ownerPassword provided → auto-generate one
    const printingChanged = permPrinting.value !== 'highResolution';
    const copyingChanged  = !permCopying.checked;
    const editingChanged  = !permEditing.checked;
    const permsChanged    = printingChanged || copyingChanged || editingChanged;

    const wasAutoGenerated = ownerPass.length === 0 && (permsChanged || userPass.length > 0);
    const effectiveOwnerPass = ownerPass.length > 0
        ? ownerPass
        : (wasAutoGenerated ? generateRandomPassword() : '');
    lastGeneratedOwnerPass = wasAutoGenerated ? effectiveOwnerPass : null;

    submitBtn.disabled = true;
    StatusManager.show(STATUS, 'processing', 'processing');

    try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
        const baseName = path.basename(selectedFile.name, '.pdf');
        const defaultPath = path.join(downloadsPath, `${baseName}_protected.pdf`);

        const outputPath = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (!outputPath) {
            StatusManager.show(STATUS, 'error', 'saveCancelled');
            submitBtn.disabled = false;
            return;
        }

        // Build permissions object to send to main process
        const permissions = {
            printing:  permPrinting.value,   // 'highResolution' | 'lowResolution' | 'none'
            copying:   permCopying.checked,
            editing:   permEditing.checked,
        };

        await ipcRenderer.invoke('protect-with-ghostscript', {
            fileData:       arrayBuffer,
            fileName:       selectedFile.name,
            outputPath,
            userPassword:   userPass,
            ownerPassword:  effectiveOwnerPass,
            permissions,
        });

        StatusManager.show(STATUS, 'success', 'successPdfCreated', {
            filename: path.basename(outputPath),
            savePath: outputPath
        });

        setTimeout(() => CustomMetadataModule.reset(), 2000);

        // Show generated owner password block if applicable
        if (lastGeneratedOwnerPass) {
            generatedOwnerDisplay.value = lastGeneratedOwnerPass;
            generatedOwnerDisplay.type  = 'password';
            generatedOwnerBlock.style.display = 'block';
        } else {
            generatedOwnerBlock.style.display = 'none';
        }

        // Reset form
        form.reset();
        selectedFile = null;
        fileInfo.style.display = 'none';
        submitBtn.disabled = true;

    } catch (error) {
        console.error('Error protecting PDF:', error);
        StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
    } finally {
        submitBtn.disabled = false;
    }
});

// ── Helpers ───────────────────────────────────────────────────
function generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    return Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}