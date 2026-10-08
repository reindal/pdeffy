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
const namePatternChips = document.getElementById('namePatternChips');
const groupLevelsList = document.getElementById('groupLevelsList');
const groupLevelPick = document.getElementById('groupLevelPick');
const groupLevelAddBtn = document.getElementById('groupLevelAddBtn');
const createZipCheckbox = document.getElementById('createZipCheckbox');
const keepDocxCheckbox = document.getElementById('keepDocxCheckbox');
const submitBtn = document.getElementById('submitBtn');
const submitLabel = document.getElementById('pdfByTemplateSubmitBtn');

const docxInfo = document.getElementById('docxInfo');
const excelInfo = document.getElementById('excelInfo');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressModal = document.getElementById('pdfGenProgressModal');
const progressModalBar = document.getElementById('pdfGenProgressBar');
const progressModalCount = document.getElementById('pdfGenProgressCount');
const progressModalDetail = document.getElementById('pdfGenProgressDetail');

let selectedDocxFile = null;
let selectedExcelFile = null;
let excelHeaders = [];
/** @type {string[]} */
let groupLevels = [];

function msg(key, fallback, params) {
  if (typeof window.getMessage === 'function') {
    try {
      const m = window.getMessage(key, params || {});
      if (m && m !== key) return m;
    } catch (_) { /* ignore */ }
  }
  if (params && fallback) {
    let out = fallback;
    Object.keys(params).forEach((p) => {
      out = out.split(`{${p}}`).join(String(params[p] ?? ''));
    });
    return out;
  }
  return fallback;
}

/** Keep header/footer parts and media from the template after docxtemplater render. */
async function preserveTemplateHeaderFooter(templateBytes, renderedBytes) {
  const tpl = await JSZip.loadAsync(templateBytes);
  const out = await JSZip.loadAsync(renderedBytes);
  const paths = [];
  tpl.forEach((relPath, file) => {
    if (file.dir) return;
    if (
      /^word\/(header|footer)\d+\.xml$/i.test(relPath) ||
      /^word\/_rels\/(header|footer)\d+\.xml\.rels$/i.test(relPath) ||
      relPath.startsWith('word/media/') ||
      relPath.startsWith('word/theme/') ||
      relPath === 'word/fontTable.xml'
    ) {
      paths.push(relPath);
    }
  });
  for (const relPath of paths) {
    const entry = tpl.file(relPath);
    if (entry) out.file(relPath, await entry.async('nodebuffer'));
  }
  return out.generate({ type: 'uint8array', compression: 'DEFLATE' });
}

function bytesForWrite(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
}

function sanitizeFilePart(value) {
  const raw = String(value ?? '').trim() || 'item';
  return raw.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').slice(0, 80);
}

function applyNamePattern(pattern, rowData, fallbackIndex) {
  const raw = String(pattern ?? '').trim();
  if (!raw) {
    return `file${fallbackIndex}`;
  }
  let name = raw.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const k = String(key).trim();
    const val = rowData[k];
    if (val == null || val === '') return sanitizeFilePart(k);
    return sanitizeFilePart(val);
  });
  name = sanitizeFilePart(name).replace(/_+/g, '_');
  if (!name || name === 'item') name = `file${fallbackIndex}`;
  return name;
}

function groupFolderForRow(rowData, levels) {
  if (!levels || !levels.length) return '';
  return levels
    .map((field) => {
      const val = rowData[field];
      return sanitizeFilePart(val == null || val === '' ? '_vuoto' : val);
    })
    .join('/');
}

function insertPlaceholderToken(header) {
  if (!baseFileNameInput || !header) return;
  const token = `{{${header}}}`;
  const input = baseFileNameInput;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  input.value = `${before}${token}${after}`;
  const pos = start + token.length;
  input.setSelectionRange(pos, pos);
  input.focus();
}

function renderNamePatternChips(headers) {
  if (!namePatternChips) return;
  namePatternChips.innerHTML = '';
  if (!headers.length) {
    namePatternChips.hidden = true;
    return;
  }
  namePatternChips.hidden = false;
  headers.forEach((h) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pdfgen-chip';
    btn.textContent = h;
    btn.title = `{{${h}}}`;
    btn.addEventListener('click', () => insertPlaceholderToken(h));
    namePatternChips.appendChild(btn);
  });
}

function renderGroupLevelsList() {
  if (!groupLevelsList) return;
  groupLevelsList.innerHTML = '';
  groupLevels.forEach((field, index) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${index + 1}. ${field}`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'pdfgen-level-remove';
    removeBtn.setAttribute('aria-label', msg('pdfByTemplateGroupRemoveLevel', 'Remove level'));
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      groupLevels.splice(index, 1);
      renderGroupLevelsList();
    });
    li.appendChild(label);
    li.appendChild(removeBtn);
    groupLevelsList.appendChild(li);
  });
}

function resetGroupLevelPick(headers = []) {
  if (!groupLevelPick) return;
  const prev = groupLevelPick.value;
  groupLevelPick.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '—';
  groupLevelPick.appendChild(empty);
  headers.forEach((h) => {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = h;
    groupLevelPick.appendChild(opt);
  });
  if (prev && headers.includes(prev)) groupLevelPick.value = prev;
}

function docxBaseStem(file) {
  const n = file?.name || 'modello';
  return sanitizeFilePart(n.replace(/\.docx$/i, '') || 'modello');
}

function showProgressModal(current, total, options) {
  if (!progressModal) return;
  progressModal.hidden = false;
  document.body.classList.add('pdfgen-busy');
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  if (progressModalBar) progressModalBar.style.width = `${pct}%`;
  if (progressModalCount) progressModalCount.textContent = `${current} / ${total}`;
  if (progressModalDetail) {
    if (options?.batchPhase) {
      progressModalDetail.textContent = msg(
        'pdfByTemplateBatchConverting',
        'Converting all documents to PDF (single session)…'
      );
    } else {
      progressModalDetail.textContent = msg('generatingItem', 'Generating PDF {current} of {total}...', {
        current,
        total,
      });
    }
  }
}

function hideProgressModal() {
  if (!progressModal) return;
  progressModal.hidden = true;
  document.body.classList.remove('pdfgen-busy');
  if (progressModalBar) progressModalBar.style.width = '0%';
}

function updateSubmitLabel() {
  if (!submitLabel) return;
  submitLabel.textContent = msg('pdfByTemplateSubmitBtn', 'Genera files PDF');
}

function resetExcelColumnUi(headers = []) {
  excelHeaders = headers;
  renderNamePatternChips(headers);
  resetGroupLevelPick(headers);
  groupLevels = groupLevels.filter((f) => headers.includes(f));
  renderGroupLevelsList();
}

async function loadExcelHeaders(file) {
  const excelBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  const headers = rows.length
    ? Object.keys(rows[0])
    : (XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] || []).map(String);
  resetExcelColumnUi(headers.filter(Boolean));
  return { workbook, rows };
}

groupLevelAddBtn?.addEventListener('click', () => {
  const field = groupLevelPick?.value;
  if (!field || groupLevels.includes(field)) return;
  groupLevels.push(field);
  renderGroupLevelsList();
  if (groupLevelPick) groupLevelPick.value = '';
});

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
      resetExcelColumnUi([]);
    }
  }
});

createZipCheckbox?.addEventListener('change', updateSubmitLabel);
updateSubmitLabel();

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  if (!selectedDocxFile || !selectedExcelFile) return;

  const namePattern = baseFileNameInput.value.trim();
  const createZip = !!createZipCheckbox?.checked;
  const keepDocx = !!keepDocxCheckbox?.checked;
  const folderLevels = [...groupLevels];

  try {
    StatusManager.show(STATUS, 'processing', 'readingExcel');
    const excelBuffer = await selectedExcelFile.arrayBuffer();
    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const excelData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (excelData.length === 0) {
      throw new Error(msg('errorEmptyExcel', 'Excel file is empty'));
    }
    resetExcelColumnUi(Object.keys(excelData[0] || {}));

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
    showProgressModal(0, excelData.length);

    const finalMetadata = await CustomMetadataModule.getFinalMetadata(ipcRenderer);
    const finalZip = createZip ? new JSZip() : null;
    const docxBufferBase = await selectedDocxFile.arrayBuffer();

    const sessionId = Date.now();
    const workRoot = createZip ? path.dirname(zipOutputPath) : outputRootDir;
    const sessionTempDir = workRoot;
    // Avoid "~" prefix: Windows/Word treat "~*" as lock/temp owner files and confuse Explorer.
    const tempName = (base) => `_pdeffy_${sessionId}_${base}`;

    const templateDocxPath = path.join(sessionTempDir, tempName('_template.docx'));
    await fs.writeFile(templateDocxPath, bytesForWrite(docxBufferBase));

    const usedNames = new Map();
    /** @type {{ inputPath: string, outputPath: string }[]} */
    const batchJobs = [];
    /** @type {{ currentFileName: string, groupFolder: string, tempPdfPath: string, tempDocxPath: string }[]} */
    const generatedFiles = [];

    for (let i = 0; i < excelData.length; i++) {
      const rowData = excelData[i];
      let currentFileName = applyNamePattern(namePattern, rowData, i + 1);
      const count = (usedNames.get(currentFileName) || 0) + 1;
      usedNames.set(currentFileName, count);
      if (count > 1) currentFileName = `${currentFileName}_${count}`;

      const groupFolder = groupFolderForRow(rowData, folderLevels);

      StatusManager.show(STATUS, 'processing', 'generatingItem', {
        current: i + 1,
        total: excelData.length,
      });
      progressBar.style.width = `${(i / excelData.length) * 100}%`;
      progressText.textContent = `${i} / ${excelData.length}`;
      showProgressModal(i + 1, excelData.length);

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
      let generatedDocxBuffer = doc.getZip().generate({ type: 'uint8array' });
      try {
        generatedDocxBuffer = await preserveTemplateHeaderFooter(docxBufferBase, generatedDocxBuffer);
      } catch (err) {
        console.warn('[pdfGenerator] preserve header/footer', err);
      }
      const tempDocxPath = path.join(sessionTempDir, tempName(`${currentFileName}.docx`));
      const tempPdfPath = path.join(sessionTempDir, tempName(`${currentFileName}.pdf`));
      await fs.writeFile(tempDocxPath, bytesForWrite(generatedDocxBuffer));
      batchJobs.push({ inputPath: tempDocxPath, outputPath: tempPdfPath });
      generatedFiles.push({ currentFileName, groupFolder, tempPdfPath, tempDocxPath });
    }

    StatusManager.show(STATUS, 'processing', 'pdfByTemplateBatchConverting');
    showProgressModal(0, excelData.length, { batchPhase: true, workRoot });

    await ipcRenderer.invoke('batch-convert-docx-to-pdf', {
      templatePath: templateDocxPath,
      jobs: batchJobs,
      metadata: finalMetadata,
    });

    for (let i = 0; i < generatedFiles.length; i++) {
      const { currentFileName, groupFolder, tempPdfPath, tempDocxPath } = generatedFiles[i];

      showProgressModal(i + 1, excelData.length);
      progressBar.style.width = `${((i + 1) / excelData.length) * 100}%`;
      progressText.textContent = `${i + 1} / ${excelData.length}`;

      const pdfBytes = await fs.readFile(tempPdfPath);
      const docxRelPath = groupFolder
        ? `${groupFolder}/${currentFileName}.docx`
        : `${currentFileName}.docx`;
      const pdfRelPath = groupFolder
        ? `${groupFolder}/${currentFileName}.pdf`
        : `${currentFileName}.pdf`;

      if (createZip) {
        finalZip.file(pdfRelPath, pdfBytes);
        if (keepDocx) {
          const docxBytes = await fs.readFile(tempDocxPath);
          finalZip.file(docxRelPath, docxBytes);
        }
      } else {
        if (groupFolder) {
          await fs.mkdir(path.join(outputRootDir, groupFolder), { recursive: true });
        }
        await fs.writeFile(path.join(outputRootDir, pdfRelPath), pdfBytes);
        if (keepDocx) {
          const docxBytes = await fs.readFile(tempDocxPath);
          await fs.writeFile(path.join(outputRootDir, docxRelPath), docxBytes);
        }
      }

      try {
        await fs.unlink(tempPdfPath);
        await fs.unlink(tempDocxPath);
      } catch (_) { /* ignore */ }
    }

    let savePath;
    showProgressModal(excelData.length, excelData.length);
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
      await fs.unlink(templateDocxPath);
    } catch (_) { /* ignore */ }

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
      hideProgressModal();
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
      createZipCheckbox.checked = false;
      if (keepDocxCheckbox) keepDocxCheckbox.checked = false;
      if (baseFileNameInput) baseFileNameInput.value = '';
      groupLevels = [];
      renderGroupLevelsList();
      updateSubmitLabel();
      resetExcelColumnUi([]);
      CustomMetadataModule.reset();
      if (typeof window.applyLanguage === 'function') {
        try { window.applyLanguage(); } catch (_) { /* ignore */ }
      }
    }, 4000);
  } catch (error) {
    console.error('Error in Generator process:', error);
    StatusManager.show(STATUS, 'error', 'errorPrefix', { error: error.message });
  } finally {
    hideProgressModal();
    submitBtn.disabled = false;
  }
});
