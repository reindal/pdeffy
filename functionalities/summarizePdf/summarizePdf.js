import { invoke } from '@tauri-apps/api/core';
import { pathOfFile } from '../../src/ui/filePicker.js';

const { ipcRenderer } = require('electron');
const path = require('path');

const STATUS = '#status';
const form = document.getElementById('summarizeForm');
const pdfFileInput = document.getElementById('pdfFile');
const submitBtn = document.getElementById('submitBtn');
const fileInfo = document.getElementById('fileInfo');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const fileSizeDisplay = document.getElementById('fileSizeDisplay');
const modelNotice = document.getElementById('summarizeModelNotice');
const resultSection = document.getElementById('summarizeResultSection');
const resultText = document.getElementById('summarizeResult');
const copyBtn = document.getElementById('copySummaryBtn');

let selectedFile = null;
let modelReady = false;

function formatFileSize(bytes) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

async function refreshModelStatus() {
  try {
    const status = await ipcRenderer.invoke('get-model-status');
    modelReady = Boolean(status?.downloaded) && !status?.downloading;
  } catch (err) {
    console.error(err);
    modelReady = false;
  }
  if (modelNotice) {
    modelNotice.hidden = modelReady;
  }
  submitBtn.disabled = !(selectedFile && modelReady);
}

async function resolvePdfPath(file) {
  const native = pathOfFile(file);
  if (native) return native;

  const tempDir = await ipcRenderer.invoke('get-temp-dir');
  const out = path.join(tempDir, `pdeffy-summarize-${Date.now()}-${file.name}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contents = Array.from(bytes);
  await invoke('write-file-bytes', { path: out, contents });
  return out;
}

function applySelectedFile(file) {
  if (!file) {
    selectedFile = null;
    fileInfo.style.display = 'none';
    submitBtn.disabled = true;
    return;
  }
  selectedFile = file;
  fileNameDisplay.textContent = file.name;
  fileSizeDisplay.textContent = formatFileSize(file.size);
  fileInfo.style.display = 'flex';
  submitBtn.disabled = !(selectedFile && modelReady);
}

pdfFileInput.addEventListener('change', () => {
  applySelectedFile(pdfFileInput.files?.[0] || null);
});

function formatInvokeError(err) {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err.trim() || 'Unknown error';
  if (err instanceof Error && err.message) return err.message;
  if (typeof err.message === 'string' && err.message.trim()) return err.message;
  try {
    const json = JSON.stringify(err);
    if (json && json !== '{}') return json;
  } catch (_) { /* ignore */ }
  return String(err);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedFile) {
    StatusManager.show(STATUS, 'error', 'pleaseSelectFile');
    return;
  }
  if (!modelReady) {
    StatusManager.show(STATUS, 'error', 'summarizeNeedModel');
    if (modelNotice) modelNotice.hidden = false;
    return;
  }

  submitBtn.disabled = true;
  resultSection.hidden = true;
  StatusManager.show(STATUS, 'processing', 'summarizeWorking');

  try {
    const pdfPath = await resolvePdfPath(selectedFile);
    const summary = await ipcRenderer.invoke('summarize-pdf', pdfPath);
    resultText.value = summary || '';
    resultSection.hidden = false;
    StatusManager.show(STATUS, 'success', 'summarizeDone');
  } catch (err) {
    console.error(err);
    StatusManager.show(STATUS, 'error', 'errorPrefix', { error: formatInvokeError(err) });
  } finally {
    submitBtn.disabled = !(selectedFile && modelReady);
    await refreshModelStatus();
  }
});

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(resultText.value || '');
    StatusManager.show(STATUS, 'success', 'summarizeCopied');
  } catch (_) {
    resultText.select();
    document.execCommand('copy');
    StatusManager.show(STATUS, 'success', 'summarizeCopied');
  }
});

refreshModelStatus();
