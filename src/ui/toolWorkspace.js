/**
 * Restyle tool pages to the Pdeffy workspace mockup:
 * hero, dashed dropzone, file cards, panel + feature aside.
 */

import { actionMaskIcon, navMaskIcon, toolIconFileForPath, toolImg } from './icons.js';

function appBase() {
  const path = window.location.pathname.replace(/\\/g, '/');
  const idx = path.indexOf('/functionalities/');
  if (idx === -1) return './';
  const after = path.slice(idx + '/functionalities/'.length);
  const depth = after.split('/').filter(Boolean).length;
  return '../'.repeat(depth);
}

/** Per-tool right-panel copy (Italian fallbacks; i18n via langText ids). */
const TOOL_GUIDES = {
  merge: {
    icon: 'merge-pdf.svg',
    accent: 'pink',
    title: 'Unisci più PDF',
    lead: 'Combina diversi documenti in un unico file, nell’ordine che scegli tu.',
    steps: [
      'Aggiungi due o più PDF dalla zona di caricamento',
      'Trascina le card per sistemare la sequenza delle pagine',
      'Avvia l’unione e salva il PDF risultante',
    ],
  },
  split: {
    icon: 'split-pdf.svg',
    accent: 'blue',
    title: 'Dividi un PDF',
    lead: 'Estrai intervalli di pagine o crea file separati da un unico documento.',
    steps: [
      'Carica il PDF da suddividere',
      'Scegli le pagine o gli intervalli da estrarre',
      'Genera uno o più PDF più piccoli',
    ],
  },
  compress: {
    icon: 'compress-pdf.svg',
    accent: 'teal',
    title: 'Comprimi il PDF',
    lead: 'Riduci il peso del file senza doverlo ricreare da zero.',
    steps: [
      'Seleziona il PDF da ottimizzare',
      'Scegli il livello di compressione preferito',
      'Scarica la versione più leggera',
    ],
  },
  protect: {
    icon: 'shield.svg',
    accent: 'green',
    title: 'Proteggi con password',
    lead: 'Imposta una password per limitare l’apertura del documento.',
    steps: [
      'Carica il PDF da proteggere',
      'Imposta e conferma la password',
      'Salva il file bloccato in locale',
    ],
  },
  template: {
    icon: 'template-pdf.svg',
    accent: 'purple',
    title: 'PDF da modello',
    lead: 'Compila un template Word con i dati Excel e genera un PDF per ogni riga.',
    steps: [
      'Carica modello DOCX e file dati Excel/CSV',
      'Imposta prefisso, raggruppamento e ZIP o cartella',
      'Genera i PDF in locale',
    ],
  },
  docx: {
    icon: 'docx-to-pdf.svg',
    accent: 'blue',
    title: 'Word → PDF',
    lead: 'Converti un documento DOCX in PDF mantenendo layout e testo.',
    steps: [
      'Seleziona il file Word (.docx)',
      'Avvia la conversione sul dispositivo',
      'Salva il PDF generato',
    ],
  },
  xlsx: {
    icon: 'xlsx-to-pdf.svg',
    accent: 'green',
    title: 'Excel → PDF',
    lead: 'Trasforma fogli di calcolo in un PDF facilmente condividibile.',
    steps: [
      'Seleziona il file Excel (.xlsx / .xls)',
      'Avvia la conversione locale',
      'Apri o salva il PDF',
    ],
  },
  pptx: {
    icon: 'pptx-to-pdf.svg',
    accent: 'orange',
    title: 'PowerPoint → PDF',
    lead: 'Esporta la presentazione in PDF, slide per slide.',
    steps: [
      'Seleziona il file PowerPoint (.pptx)',
      'Avvia la conversione',
      'Scarica il PDF delle slide',
    ],
  },
  image: {
    icon: 'image-to-pdf.svg',
    accent: 'cyan',
    title: 'Immagini → PDF',
    lead: 'Unisci una o più immagini in un unico documento PDF.',
    steps: [
      'Aggiungi le immagini (anche multiple)',
      'Riordina le pagine se serve',
      'Crea e salva il PDF',
    ],
  },
  markdown: {
    icon: 'text-to-pdf.svg',
    accent: 'purple',
    title: 'Markdown → PDF',
    lead: 'Trasforma note Markdown in un PDF leggibile e stampabile.',
    steps: [
      'Seleziona il file .md / .markdown',
      'Avvia la conversione',
      'Salva il PDF generato',
    ],
  },
  pdfToDocx: {
    icon: 'pdf-to-docx.svg',
    accent: 'blue',
    title: 'PDF → Word',
    lead: 'Converti il PDF in DOCX per continuare a modificare il testo.',
    steps: [
      'Carica il PDF di partenza',
      'Avvia la conversione in DOCX',
      'Apri il file in Word o equivalente',
    ],
  },
  pdfToXlsx: {
    icon: 'pdf-to-xlsx.svg',
    accent: 'green',
    title: 'PDF → Excel',
    lead: 'Estrai tabelle e contenuti verso un foglio di calcolo.',
    steps: [
      'Seleziona il PDF con i dati',
      'Converti in formato Excel',
      'Apri e lavora sul foglio .xlsx',
    ],
  },
  pdfToPptx: {
    icon: 'pdf-to-pptx.svg',
    accent: 'orange',
    title: 'PDF → PowerPoint',
    lead: 'Trasforma le pagine del PDF in slide modificabili.',
    steps: [
      'Carica il PDF',
      'Converti in presentazione PPTX',
      'Apri il file in PowerPoint',
    ],
  },
  pdfToImage: {
    icon: 'pdf-to-image.svg',
    accent: 'cyan',
    title: 'PDF → Immagini',
    lead: 'Esporta ogni pagina come immagine PNG o JPEG.',
    steps: [
      'Carica il PDF da esportare',
      'Scegli formato e anteprima',
      'Salva le immagini generate',
    ],
  },
  pdfToMarkdown: {
    icon: 'pdf-to-markdown.svg',
    accent: 'purple',
    title: 'PDF → Markdown',
    lead: 'Estrai il testo del PDF in un file Markdown editabile.',
    steps: [
      'Seleziona il PDF',
      'Avvia l’estrazione del testo',
      'Salva il file .md',
    ],
  },
  watermark: {
    icon: 'watermark.svg',
    accent: 'yellow',
    title: 'Aggiungi filigrana',
    lead: 'Sovrapponi testo o immagini alle pagine per marcare il documento.',
    steps: [
      'Carica il PDF',
      'Configura testo, posizione e stile',
      'Applica e salva il PDF filigranato',
    ],
  },
  redact: {
    icon: 'redact.svg',
    accent: 'pink',
    title: 'Censura contenuti',
    lead: 'Oscura in modo permanente le parti sensibili del documento.',
    steps: [
      'Apri il PDF da censurare',
      'Seleziona le aree da oscurare',
      'Esporta il PDF con le zone rimosse',
    ],
  },
  rotate: {
    icon: 'rotate-pages.svg',
    accent: 'blue',
    title: 'Ruota le pagine',
    lead: 'Correggi l’orientamento di una o più pagine del PDF.',
    steps: [
      'Carica il PDF',
      'Seleziona le pagine da ruotare',
      'Applica la rotazione e salva',
    ],
  },
  deletePages: {
    icon: 'delete-pages.svg',
    accent: 'pink',
    title: 'Elimina pagine',
    lead: 'Rimuovi le pagine inutili e ottieni un PDF più snello.',
    steps: [
      'Carica il PDF',
      'Seleziona le pagine da togliere',
      'Genera il PDF senza quelle pagine',
    ],
  },
  default: {
    icon: 'pdf-file.svg',
    accent: 'yellow',
    title: 'Strumento PDF',
    lead: 'Elabora i file in locale, senza upload su cloud.',
    steps: [
      'Carica i file richiesti',
      'Configura le opzioni',
      'Avvia e salva il risultato',
    ],
  },
};

function detectToolId(pathname = location.pathname) {
  const path = String(pathname).replace(/\\/g, '/');
  if (/\/merge\//.test(path)) return 'merge';
  if (/\/split\//.test(path)) return 'split';
  if (/\/compressPdf\//.test(path)) return 'compress';
  if (/\/protectPdf\//.test(path)) return 'protect';
  if (/\/pdfGenerator\//.test(path)) return 'template';
  if (/\/docxToPdf\//.test(path)) return 'docx';
  if (/\/excelToPdf\//.test(path)) return 'xlsx';
  if (/\/powerPointToPdf\//.test(path)) return 'pptx';
  if (/\/imageToPdf\//.test(path)) return 'image';
  if (/\/markdownToPdf\//.test(path)) return 'markdown';
  if (/\/pdfToDocx\//.test(path)) return 'pdfToDocx';
  if (/\/pdfToExcel\//.test(path)) return 'pdfToXlsx';
  if (/\/pdfToPptx\//.test(path)) return 'pdfToPptx';
  if (/\/pdfToImage\//.test(path)) return 'pdfToImage';
  if (/\/pdfToMarkdown\//.test(path)) return 'pdfToMarkdown';
  if (/\/watermark\//.test(path)) return 'watermark';
  if (/\/redactPdf\//.test(path)) return 'redact';
  if (/\/rotatePdf\//.test(path)) return 'rotate';
  if (/\/deletePages\//.test(path)) return 'deletePages';
  return 'default';
}

function guideKey(toolId, part) {
  const id = toolId.charAt(0).toUpperCase() + toolId.slice(1);
  return `wsGuide${id}${part}`;
}

function featureAside(toolId, base) {
  const guide = TOOL_GUIDES[toolId] || TOOL_GUIDES.default;
  const id = toolId in TOOL_GUIDES ? toolId : 'default';
  const steps = guide.steps
    .map(
      (text, i) => `
      <li class="pdeffy-ws-guide-step">
        <span class="pdeffy-ws-guide-num" aria-hidden="true">${i + 1}</span>
        <span class="langText" id="${guideKey(id, `Step${i + 1}`)}">${text}</span>
      </li>`
    )
    .join('');

  const templateExtra =
    id === 'template'
      ? `
      <div class="pdeffy-ws-guide-format">
        <p class="pdeffy-ws-guide-format-title langText" id="pdfByTemplateInfoTitle">Formato richiesto</p>
        <p class="pdeffy-ws-guide-format-text langText" id="pdfByTemplateInfoText">La prima riga Excel deve usare gli stessi nomi dei placeholder Word (es. {{AZIENDA}}). Ogni riga genera un PDF.</p>
        <table class="pdeffy-ws-guide-table exampleTable" aria-label="Esempio intestazioni">
          <thead>
            <tr>
              <th class="langText" id="pdfByTemplateCompany">AZIENDA</th>
              <th class="langText" id="pdfByTemplateMonth">MESE</th>
              <th class="langText" id="pdfByTemplateAgent">AGENTE</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Reindal</td><td>Gennaio</td><td>Christian</td></tr>
            <tr><td>Acme</td><td>Gennaio</td><td>John Doe</td></tr>
          </tbody>
        </table>
        <p class="pdeffy-ws-guide-samples-label langText" id="pdfByTemplateSamplesLabel">Scarica esempi</p>
        <div class="pdeffy-ws-guide-samples">
          <button type="button" class="pdeffy-ws-guide-sample" data-sample-file="esempio-modello.docx" data-sample-ext="docx">
            <span class="langText" id="pdfByTemplateSampleDocx">Modello Word</span>
          </button>
          <button type="button" class="pdeffy-ws-guide-sample" data-sample-file="esempio-dati.xlsx" data-sample-ext="xlsx">
            <span class="langText" id="pdfByTemplateSampleXlsx">Dati Excel</span>
          </button>
        </div>
      </div>`
      : '';

  return `
    <aside class="pdeffy-ws-aside" data-tool-guide="${id}" aria-label="Guida strumento">
      <div class="pdeffy-ws-guide is-${guide.accent}">
        <div class="pdeffy-ws-guide-visual" aria-hidden="true">
          <span class="pdeffy-ws-guide-glow"></span>
          ${toolImg(base, guide.icon)}
        </div>
        <p class="pdeffy-ws-guide-kicker langText" id="wsGuideHowItWorks">Come funziona</p>
        <h2 class="pdeffy-ws-guide-title langText" id="${guideKey(id, 'Title')}">${guide.title}</h2>
        <p class="pdeffy-ws-guide-lead langText" id="${guideKey(id, 'Lead')}">${guide.lead}</p>
        <ol class="pdeffy-ws-guide-steps">${steps}</ol>
        ${templateExtra}
        <div class="pdeffy-ws-guide-note">
          <span class="pdeffy-ws-guide-note-icon" aria-hidden="true">${toolImg(base, 'shield.svg')}</span>
          <span class="langText" id="wsGuideLocalNote">100% locale: i file restano sul tuo dispositivo.</span>
        </div>
      </div>
    </aside>`;
}

function detectHub() {
  const nav = document.body.getAttribute('data-nav') || '';
  if (nav === 'organize' || nav === 'convert' || nav === 'edit') return nav;
  const path = location.pathname.replace(/\\/g, '/');
  if (/\/(merge|split|compressPdf|protectPdf|pdfGenerator|rotatePdf)\//.test(path)) return 'organize';
  if (/\/(docxToPdf|excelToPdf|powerPointToPdf|imageToPdf|markdownToPdf|pdfToDocx|pdfToExcel|pdfToPptx|pdfToImage|pdfToMarkdown)\//.test(path)) return 'convert';
  if (/\/(watermark|deletePages|redactPdf|pdfEditor)\//.test(path)) return 'edit';
  return 'default';
}

function hubHref(hub, base) {
  if (hub === 'organize') return `${base}functionalities/hubs/organize.html`;
  if (hub === 'convert') return `${base}functionalities/hubs/convert.html`;
  if (hub === 'edit') return `${base}index.html`;
  return `${base}index.html`;
}

function hubBackLabel(hub) {
  if (hub === 'organize') return { id: 'wsBackOrganize', fallback: '← Torna a Organizza PDF' };
  if (hub === 'convert') return { id: 'wsBackConvert', fallback: '← Torna a Converti PDF' };
  return { id: 'backLink', fallback: '← Torna alla Home' };
}

async function saveTemplateSample(base, fileName, ext) {
  const url = `${base}assets/examples/pdf-template/${fileName}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sample not found (${res.status})`);
  const buffer = await res.arrayBuffer();

  const { ipcRenderer } = await import('../platform/bridge.js');
  const path = (await import('../platform/path.js')).default;
  const fs = (await import('../platform/fs.js')).default;

  const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
  const filterName = ext === 'docx' ? 'Word' : ext === 'xlsx' ? 'Excel' : 'File';
  const savePath = await ipcRenderer.invoke('show-save-dialog', {
    title: 'Salva esempio',
    defaultPath: path.join(downloadsPath, fileName),
    filters: [{ name: filterName, extensions: [ext] }],
  });
  if (!savePath) return;

  await fs.promises.writeFile(savePath, new Uint8Array(buffer));
  try {
    await ipcRenderer.invoke('open-folder', path.dirname(savePath));
  } catch (_) { /* optional */ }
}

function wireTemplateSampleDownloads(root, base) {
  root.querySelectorAll('.pdeffy-ws-guide-sample[data-sample-file]').forEach((btn) => {
    if (btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const fileName = btn.getAttribute('data-sample-file');
      const ext = btn.getAttribute('data-sample-ext') || fileName.split('.').pop();
      if (!fileName) return;
      btn.disabled = true;
      try {
        await saveTemplateSample(base, fileName, ext);
      } catch (err) {
        console.error('[template sample]', err);
        alert(err?.message || 'Impossibile scaricare il file di esempio.');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function restyleDropzones(root) {
  root.querySelectorAll('.fileInputWrapper').forEach((wrap) => {
    if (wrap.closest('.pdeffy-ws-drop')) return;
    const input = wrap.querySelector('input[type="file"]');
    const label = wrap.querySelector('label.fileInputLabel');
    if (!input || !label) return;

    const drop = document.createElement('div');
    drop.className = 'pdeffy-ws-drop';
    drop.dataset.dropzone = 'true';

    const accept = (input.getAttribute('accept') || '').toLowerCase();
    let hint = 'Trascina qui i tuoi file oppure';
    if (accept.includes('pdf') && input.multiple) hint = 'Trascina qui i tuoi file PDF oppure';
    else if (accept.includes('pdf')) hint = 'Trascina qui il tuo file PDF oppure';
    else if (accept.includes('docx') || accept.includes('word')) hint = 'Trascina qui il file Word oppure';
    else if (accept.includes('xlsx') || accept.includes('spreadsheet')) hint = 'Trascina qui il file Excel oppure';
    else if (accept.includes('pptx') || accept.includes('presentation')) hint = 'Trascina qui il file PowerPoint oppure';
    else if (accept.includes('image') || accept.includes('png') || accept.includes('jpeg')) {
      hint = input.multiple ? 'Trascina qui le immagini oppure' : 'Trascina qui l’immagine oppure';
    } else if (accept.includes('markdown') || accept.includes('.md')) {
      hint = 'Trascina qui il file Markdown oppure';
    }

    const hintId = label.id ? `${label.id}DropHint` : '';
    const tipId = label.id ? `${label.id}DropTip` : '';
    const base = appBase();
    const multiTip = input.multiple
      ? 'Puoi selezionare più file contemporaneamente'
      : 'Supporta un file alla volta';
    drop.innerHTML = `
      <div class="pdeffy-ws-drop-icon">${actionMaskIcon(base, 'cloud-upload.svg', 'pdeffy-ws-drop-mask')}</div>
      <p class="pdeffy-ws-drop-text langText"${hintId ? ` id="${hintId}"` : ''}>${hint}</p>
    `;

    input.classList.add('pdeffy-ws-file-input');
    label.classList.add('pdeffy-ws-pick');
    label.classList.remove('langText');

    // Keep langText on an inner span so applyLanguage doesn't wipe the icon
    const labelId = label.id;
    const labelText = label.textContent.trim();
    label.removeAttribute('id');
    label.textContent = '';
    label.insertAdjacentHTML('afterbegin', actionMaskIcon(base, 'folder.svg', 'pdeffy-ws-pick-icon'));
    const textSpan = document.createElement('span');
    textSpan.className = 'langText';
    if (labelId) textSpan.id = labelId;
    textSpan.textContent = labelText;
    label.appendChild(textSpan);

    wrap.replaceWith(drop);
    drop.appendChild(input);
    drop.appendChild(label);
    const tip = document.createElement('p');
    tip.className = 'pdeffy-ws-drop-hint langText';
    if (tipId) tip.id = tipId;
    tip.textContent = multiTip;
    drop.appendChild(tip);

    const parentGroup = drop.closest('.formGroup');
    const fieldLabel = parentGroup?.querySelector(`label[for="${input.id}"]`);
    if (fieldLabel && fieldLabel !== label) fieldLabel.classList.add('pdeffy-ws-field-label-hidden');

    ['dragenter', 'dragover'].forEach((evt) => {
      drop.addEventListener(evt, (e) => {
        e.preventDefault();
        drop.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach((evt) => {
      drop.addEventListener(evt, (e) => {
        e.preventDefault();
        drop.classList.remove('is-dragover');
      });
    });
    drop.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      try {
        const dt = new DataTransfer();
        const max = input.multiple ? files.length : 1;
        for (let i = 0; i < max; i++) dt.items.add(files[i]);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) { /* some browsers block DataTransfer assignment */ }
    });
  });
}

function findTitle(container) {
  return (
    container.querySelector('h1.langText') ||
    container.querySelector('h1') ||
    container.querySelector('.pdeffy-page-header h1')
  );
}

function findSubtitleText(container, titleEl) {
  const descCandidates = [
    'mergePdfDesc',
    'splitPdfDesc',
    'compressPdfTileDesc',
    'protectPdfTileDesc',
    'docxToPdfDesc',
    'excelToPdfDesc',
    'pptxToPdfDesc',
    'imageToPdfDesc',
    'pdfByTemplateDesc',
  ];
  for (const id of descCandidates) {
    const el = document.getElementById(id);
    if (el?.textContent?.trim()) return { id, text: el.textContent.trim() };
  }
  const help = container.querySelector('.helpText.langText');
  if (help && help !== titleEl) return { id: '', text: help.textContent.trim() };
  return { id: '', text: '' };
}

function wireMetadataToolbar(panel, base) {
  const metaGroup = panel.querySelector('.metadataCheckboxGroup');
  if (!metaGroup) return false;

  const label = metaGroup.querySelector('.metadataCheckboxLabel');
  if (label && !label.querySelector('.pdeffy-ws-info')) {
    label.insertAdjacentHTML(
      'beforeend',
      `<span class="pdeffy-ws-info" title="Metadata">${actionMaskIcon(base, 'info.svg')}</span>`
    );
  }

  if (!panel.querySelector('.pdeffy-ws-advanced')) {
    const adv = document.createElement('button');
    adv.type = 'button';
    adv.className = 'pdeffy-ws-advanced';
    adv.innerHTML = `${navMaskIcon(base, 'settings.svg')}<span class="langText" id="wsAdvancedOptions">Opzioni avanzate</span>`;
    adv.addEventListener('click', () => {
      const fields = document.getElementById('metadataFields');
      const cb = document.getElementById('addMetadataCheckbox');
      if (cb && !cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      fields?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    metaGroup.appendChild(adv);
  }
  return true;
}

function watchMetadataToolbar(panel, base) {
  if (wireMetadataToolbar(panel, base)) return;
  const obs = new MutationObserver(() => {
    if (wireMetadataToolbar(panel, base)) obs.disconnect();
  });
  obs.observe(panel, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 4000);
}

export function enhanceToolWorkspace() {
  if (document.body.classList.contains('pdfEditorPage')) return;
  if (document.body.classList.contains('pdeffy-hub')) return;
  if (document.querySelector('.pdeffy-tool-grid') && !document.querySelector('form')) return;
  if (document.querySelector('.pdeffy-ws')) return;

  const main =
    document.querySelector('.pdeffy-main > main') ||
    document.querySelector('.pdeffy-main main') ||
    document.querySelector('main');
  if (!main) return;

  const container = Array.from(main.children).find(
    (el) => el.nodeType === 1 && !el.classList.contains('pdeffy-ws')
  );
  if (!container) return;
  if (container.classList.contains('pdeffy-page-header')) return;

  const base = appBase();
  const hub = detectHub();
  document.body.setAttribute('data-tool-hub', hub);
  document.body.classList.add('pdeffy-tool-page');

  const titleEl = findTitle(container);
  const titleHtml = titleEl ? titleEl.outerHTML : '<h1>Tool</h1>';
  const titleId = titleEl?.id || '';
  const subtitleMeta = findSubtitleText(container, titleEl);
  if (titleEl) titleEl.remove();

  const backExisting = container.querySelector('a.backLink');
  const backMeta = hubBackLabel(hub);
  const backHref = hubHref(hub, base);
  if (backExisting) backExisting.remove();

  const path = location.pathname.replace(/\\/g, '/');
  const isMerge = /\/merge\//.test(path);
  const toolId = detectToolId(path);
  const iconFile = toolIconFileForPath(path);
  const iconHtml = toolImg(base, iconFile);
  const iconClass = 'pdeffy-ws-hero-icon';

  const defaultSub = isMerge
    ? 'Unisci più PDF in un unico file, mantenendo l’ordine che desideri.'
    : 'Carica i file e avvia l’operazione.';

  let subHtml;
  if (isMerge) {
    subHtml = `<p class="pdeffy-ws-sub langText" id="mergePdfDesc">${subtitleMeta.text || defaultSub}</p>`;
  } else if (subtitleMeta.id) {
    subHtml = `<p class="pdeffy-ws-sub langText" id="${subtitleMeta.id}">${subtitleMeta.text}</p>`;
  } else if (subtitleMeta.text) {
    subHtml = `<p class="pdeffy-ws-sub" data-ws-sub>${subtitleMeta.text}</p>`;
  } else {
    subHtml = `<p class="pdeffy-ws-sub langText" id="wsDefaultSub">${defaultSub}</p>`;
  }

  const ws = document.createElement('div');
  ws.className = 'pdeffy-ws';
  ws.innerHTML = `
    <a class="pdeffy-ws-back langText" id="${backMeta.id}" href="${backHref}">${backMeta.fallback}</a>
    <div class="pdeffy-ws-hero">
      <div class="${iconClass}">${iconHtml}</div>
      <div class="pdeffy-ws-hero-text">
        ${titleHtml}
        ${subHtml}
      </div>
    </div>
    <div class="pdeffy-ws-grid">
      <div class="pdeffy-ws-panel" data-ws-panel></div>
      ${featureAside(toolId, base)}
    </div>
  `;

  const panel = ws.querySelector('[data-ws-panel]');
  while (container.firstChild) panel.appendChild(container.firstChild);
  container.replaceWith(ws);

  // Avoid duplicate ids when a hidden desc was moved into the panel
  if (subtitleMeta.id) {
    panel.querySelectorAll(`#${CSS.escape(subtitleMeta.id)}`).forEach((el) => el.remove());
  }
  if (isMerge) {
    panel.querySelectorAll('#mergePdfDesc').forEach((el) => el.remove());
  }

  if (titleId && ws.querySelector('h1') && !ws.querySelector(`#${CSS.escape(titleId)}`)) {
    ws.querySelector('h1').id = titleId;
  }

  restyleDropzones(panel);

  const submit = panel.querySelector('#submitBtn, #submitMdToPdf, #submitPdfToMd');
  if (submit) {
    submit.classList.add('pdeffy-ws-submit');
    submit.querySelectorAll('.pdeffy-ws-submit-icon, .pdeffy-ws-submit-arrow').forEach((el) => el.remove());
    // Keep translated label on an inner span so applyLanguage doesn't wipe structure
    const labelSpan = submit.querySelector('.langText');
    if (labelSpan && labelSpan.parentElement === submit) {
      /* already structured */
    } else {
      const existingLabel = submit.querySelector('#mergeSubmitBtn, .langText') || null;
      if (!existingLabel) {
        const span = document.createElement('span');
        span.className = 'langText';
        span.id = 'mergeSubmitBtn';
        span.textContent = submit.textContent.trim();
        submit.textContent = '';
        submit.appendChild(span);
      }
    }
  }

  watchMetadataToolbar(panel, base);

  if (toolId === 'template') {
    wireTemplateSampleDownloads(ws, base);
  }

  if (typeof window.applyLanguage === 'function') {
    try {
      window.applyLanguage();
    } catch (_) { /* ignore */ }
  }
}

export default { enhanceToolWorkspace };
