const fs = require('fs').promises;
const path = require('path');
var { ipcRenderer } = require('electron');

const XLSX = require('xlsx');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const JSZip = require('jszip');
const STATUS = '#status';

const form = document.getElementById('pdfGeneratorForm');
const docxInput = document.getElementById('docxTemplate');
const excelInput = document.getElementById('excelData');
const baseFileNameInput = document.getElementById('baseFileName');
const groupByFieldSelect = document.getElementById('groupByField');
const createZipCheckbox = document.getElementById('createZipCheckbox');
const submitBtn = document.getElementById('submitBtn');
const submitLabel = document.getElementById('pdfByTemplateSubmitBtn');

const docxInfo = document.getElementById('docxInfo');
const excelInfo = document.getElementById('excelInfo');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

let selectedDocxFile = null;
let selectedExcelFile = null;
let excelHeaders = [];

function msg(key, fallback) {
  if (typeof window.getMessage === 'function') {
    try {
      const m = window.getMessage(key);
      if (m) return m;
    } catch (_) { /* ignore */ }
  }
  return fallback;
}

function sanitizeFilePart(value) {
  const raw = String(value ?? '').trim() || 'item';
  return raw.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').slice(0, 80);
}

function applyNamePattern(pattern, rowData, fallbackIndex) {
  let name = String(pattern || 'Document').trim() || 'Document';
  name = name.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const k = String(key).trim();
    const val = rowData[k];
    if (val == null || val === '') return sanitizeFilePart(k);
    return sanitizeFilePart(val);
  });
  name = sanitizeFilePart(name).replace(/_+/g, '_');
  if (!name || name === 'item') name = `Document_${fallbackIndex}`;
  return name;
}

function groupFolderForRow(rowData, groupField) {
  if (!groupField) return '';
  const val = rowData[groupField];
  return sanitizeFilePart(val == null || val === '' ? '_vuoto' : val);
}

function docxBaseStem(file) {
  const n = file?.name || 'modello';
  return sanitizeFilePart(n.replace(/\.docx$/i, '') || 'modello');
}

function updateSubmitLabel() {
  if (!submitLabel) return;
  const zip = createZipCheckbox?.checked;
  submitLabel.textContent = zip
    ? msg('pdfByTemplateSubmitBtn', 'Genera PDF in ZIP')
    : msg('pdfByTemplateSubmitFolder', 'Genera PDF in cartella');
}

function resetGroupSelect(headers = []) {
  excelHeaders = headers;
  if (!groupByFieldSelect) return;
  const prev = groupByFieldSelect.value;
  groupByFieldSelect.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.id = 'pdfByTemplateGroupNone';
  none.className = 'langText';
  none.textContent = msg('pdfByTemplateGroupNone', 'Nessun raggruppamento');
  groupByFieldSelect.appendChild(none);
  headers.forEach((h) => {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = h;
    groupByFieldSelect.appendChild(opt);
  });
  if (prev && headers.includes(prev)) groupByFieldSelect.value = prev;
}

async function loadExcelHeaders(file) {
  const excelBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  const headers = rows.length
    ? Object.keys(rows[0])
    : (XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] || []).map(String);
  resetGroupSelect(headers.filter(Boolean));
  return { workbook, rows };
}

docxInput.addEventListener('change', function (e) {
  if (e.target.files.length > 0) {
    selectedDocxFile = e.target.files[0];
    docxInfo.textContent = `✓ Template: ${selectedDocxFile.name}`;
  }
});

excelInput.addEventListener('change', async function (e) {
  if (e.target.files.length > 0) {
    selectedExcelFile = e.target.files[0];
    excelInfo.textContent = `✓ Data: ${selectedExcelFile.name}`;
    try {
      await loadExcelHeaders(selectedExcelFile);
    } catch (err) {
      console.warn('[pdfGenerator] header parse failed', err);
      resetGroupSelect([]);
    }
  }
});

createZipCheckbox?.addEventListener('change', updateSubmitLabel);
updateSubmitLabel();

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  if (!selectedDocxFile || !selectedExcelFile) return;

  const namePattern = baseFileNameInput.value.trim() || 'Document';
  const groupField = groupByFieldSelect?.value || '';
  const createZip = !!createZipCheckbox?.checked;

  try {
    StatusManager.show(STATUS, 'processing', 'readingExcel');
    const excelBuffer = await selectedExcelFile.arrayBuffer();
    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const excelData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (excelData.length === 0) {
      throw new Error(msg('errorEmptyExcel', 'Excel file is empty'));
    }
    resetGroupSelect(Object.keys(excelData[0] || {}));
    if (groupField) groupByFieldSelect.value = groupField;

    const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
    let zipOutputPath = null;
    let outputRootDir = null;

    if (createZip) {
      zipOutputPath = await ipcRenderer.invoke('show-save-dialog', {
        title: msg('pdfByTemplateSaveZipTitle', 'Salva ZIP dei PDF'),
        defaultPath: path.join(downloadsPath, `${docxBaseStem(selectedDocxFile)}_Batch.zip`),
        filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
      });
      if (!zipOutputPath) return;
    } else {
      const picked = await ipcRenderer.invoke('show-open-dialog', {
        title: msg('pdfByTemplatePickFolderTitle', 'Scegli cartella di destinazione'),
        defaultPath: downloadsPath,
        properties: ['openDirectory', 'createDirectory'],
      });
      if (!picked) return;
      const parentDir = typeof picked === 'string' ? picked : picked;
      outputRootDir = path.join(parentDir, `pdeffy_${docxBaseStem(selectedDocxFile)}`);
      await fs.mkdir(outputRootDir, { recursive: true });
    }

    submitBtn.disabled = true;
    progressContainer.style.display = 'block';
    progressContainer.classList.remove('hidden');

    const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
    const finalZip = createZip ? new JSZip() : null;
    const docxBufferBase = await selectedDocxFile.arrayBuffer();

    const workParent = createZip ? path.dirname(zipOutputPath) : outputRootDir;
    const sessionTempDir = path.join(workParent, `.pdfgen-${Date.now()}`);
    await fs.mkdir(sessionTempDir, { recursive: true });

    const usedNames = new Map();

    for (let i = 0; i < excelData.length; i++) {
      const rowData = excelData[i];
      let currentFileName = applyNamePattern(namePattern, rowData, i + 1);
      const count = (usedNames.get(currentFileName) || 0) + 1;
      usedNames.set(currentFileName, count);
      if (count > 1) currentFileName = `${currentFileName}_${count}`;

      const groupFolder = groupFolderForRow(rowData, groupField);

      StatusManager.show(STATUS, 'processing', 'generatingItem', {
        current: i + 1,
        total: excelData.length,
      });
      progressBar.style.width = `${(i / excelData.length) * 100}%`;
      progressText.textContent = `${i} / ${excelData.length}`;

      const zip = new PizZip(docxBufferBase);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' },
        nullGetter() {
          return '';
        },
      });

      doc.render(rowData);
      const generatedDocxBuffer = doc.getZip().generate({ type: 'uint8array' });
      const tempPdfPath = path.join(sessionTempDir, `${currentFileName}.pdf`);

      await ipcRenderer.invoke('convert-with-libreoffice', {
        fileData: generatedDocxBuffer,
        fileName: `temp_${i}.docx`,
        outputPath: tempPdfPath,
        format: 'pdf',
        metadata: finalMetadata,
      });

      const pdfBytes = await fs.readFile(tempPdfPath);
      const pdfRelPath = groupFolder
        ? `${groupFolder}/${currentFileName}.pdf`
        : `${currentFileName}.pdf`;

      if (createZip) {
        finalZip.file(pdfRelPath, pdfBytes);
      } else {
        if (groupFolder) {
          await fs.mkdir(path.join(outputRootDir, groupFolder), { recursive: true });
        }
        await fs.writeFile(path.join(outputRootDir, pdfRelPath), pdfBytes);
      }

      try {
        await fs.unlink(tempPdfPath);
      } catch (_) { /* ignore */ }

      progressBar.style.width = `${((i + 1) / excelData.length) * 100}%`;
      progressText.textContent = `${i + 1} / ${excelData.length}`;
    }

    let savePath;
    if (createZip) {
      StatusManager.show(STATUS, 'processing', 'savingZip');
      const zipContent = await finalZip.generateAsync({ type: 'uint8array' });
      await fs.writeFile(zipOutputPath, zipContent);
      savePath = zipOutputPath;
    } else {
      StatusManager.show(STATUS, 'processing', 'savingFolder');
      savePath = outputRootDir;
    }

    try {
      await fs.rm(sessionTempDir);
    } catch (_) {
      try {
        await fs.rmdir(sessionTempDir);
      } catch (__) { /* ignore */ }
    }

    StatusManager.show(STATUS, 'success', createZip ? 'successGeneration' : 'successGenerationFolder', {
      savePath,
      isDirectory: !createZip,
    });

    setTimeout(() => {
      form.reset();
      selectedDocxFile = null;
      selectedExcelFile = null;
      docxInfo.textContent = '';
      excelInfo.textContent = '';
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
      createZipCheckbox.checked = true;
      if (baseFileNameInput) baseFileNameInput.value = '';
      updateSubmitLabel();
      resetGroupSelect([]);
      CustomMetadataModule.reset();
      if (typeof window.applyLanguage === 'function') {
        try { window.applyLanguage(); } catch (_) { /* ignore */ }
      }
    }, 4000);
  } catch (error) {
    console.error('Error in Generator process:', error);
    StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
  } finally {
    submitBtn.disabled = false;
  }
});
