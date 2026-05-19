# Piano: Editor PDF unificato (“Modifica PDF”)

Documento di progettazione per unificare in un unico strumento le funzionalità attualmente distribuite in pagine separate, con anteprima interattiva, paginazione e firma visiva.

**Stato attuale in Pdeffy (branch `dev`):**

| Funzione | Percorso | Anteprima PDF.js | Manipolazione |
|----------|----------|------------------|---------------|
| Filigrana | `functionalities/watermark/` | Parziale (canvas pagina 1) | `pdf-lib` |
| Elimina pagine | `functionalities/deletePages/` | Sì (griglia miniature) | `pdf-lib` |
| Ruota pagine | `functionalities/rotatePdf/` | Sì (griglia + rotazione live) | `pdf-lib` |
| Censura | `functionalities/redactPdf/` | Sì (scroll continuo + overlay) | `pdf-lib` |
| Riordino pagine | — | **Non implementato** | — |
| Firma PDF | — | **Non implementato** | — |

**Obiettivo:** un solo strumento `functionalities/pdfEditor/` (nome provvisorio) accessibile dalla sezione **Modifica PDF** in `index.html`, che sostituisca gradualmente le cinque card attuali.

---

## 1. Visione prodotto

### 1.1 Flusso utente

1. Aprire lo strumento → scegliere un PDF (click o drag-and-drop sulla drop zone).
2. Controllo crittografia (`PdfEncryptionGuard`, già usato ovunque).
3. Caricamento documento → **workspace** con:
   - **Pannello pagine** (sinistra): miniature ordinabili, azioni rapide per pagina.
   - **Area anteprima** (centro): visualizzazione con zoom e modalità scroll.
   - **Pannello strumenti** (destra): tab o accordion per Filigrana / Censura / Firma / (opzionale) impostazioni globali.
4. L’utente applica una o più modifiche **senza uscire** dallo stesso file caricato.
5. **Esporta PDF** → dialog salva (`show-save-dialog` IPC) → applicazione batch di tutte le operazioni pendenti → messaggio di successo (`StatusManager`).

### 1.2 Principio architetturale: modello + vista + export

```
┌─────────────────────────────────────────────────────────────┐
│  PDF originale (ArrayBuffer immutabile in memoria)          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  DocumentModel (stato editabile, non distruttivo)           │
│  • pages[]: { id, sourceIndex, rotation°, deleted, order }  │
│  • watermarks[]: layer globali o per pagina                 │
│  • redactions[]: rettangoli normalizzati per pagina         │
│  • signatures[]: annotazioni (testo / tratto / immagine)    │
└───────────────────────────┬─────────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
    PDF.js render    Overlay HTML/Canvas   pdf-lib export
    (solo display)   (interazione UI)      (file finale)
```

- **PDF.js** = motore di **rendering** e, opzionalmente, layer testo per hit-test.
- **pdf-lib** = unica fonte di verità per il **file PDF in uscita**.
- Le modifiche restano nello **stato JavaScript** fino all’export (supporto futuro a Undo/Redo).

---

## 2. Librerie consigliate

### 2.1 Già presenti nel progetto (da riusare)

| Libreria | Versione attuale | Ruolo nell’editor |
|----------|------------------|------------------|
| **[PDF.js](https://mozilla.github.io/pdf.js/)** (`pdfjs-dist`) | ^5.4.624 | Rendering pagine su `<canvas>`, numero pagine, viewport, zoom, modalità scroll continuo. Worker: `libs/pdf.worker.min.js` (pattern già in `rotatePdf.js`, `redactPdf.js`, `deletePages.js`). |
| **pdf-lib** | ^1.17.1 | Rotazione, rimozione/riordino pagine, disegno filigrane, rettangoli di censura, embedding immagini/font per firme. |
| **html2canvas** | ^1.4.1 | Opzionale: rasterizzare firma disegnata su canvas prima di `embedPng` (solo se si evita export vettoriale manuale). |
| Moduli interni | — | `statusManager.js`, `pdfEncryptionGuard.js`, `changeLang.js`, IPC `show-save-dialog` / `show-open-dialog`. |

**Perché PDF.js + pdf-lib insieme**

- PDF.js eccelle nel **mostrare** PDF complessi (font, immagini, trasparenze) nel renderer Chromium/Electron.
- pdf-lib eccelle nel **costruire** PDF modificati in modo programmatico, già integrato in tutto Pdeffy.
- Non usare PDF.js per scrivere il file finale (non è il suo scopo); non usare solo pdf-lib per l’anteprima ad alta fedeltà su documenti pesanti.

### 2.2 Nuove dipendenze (consigliate)

| Libreria | Scopo | Priorità | Note |
|----------|--------|----------|------|
| **SortableJS** | Drag-and-drop ordinamento miniature pagine | Alta | Alternativa: HTML5 DnD nativo come in `merge.js` (zero dipendenze, più codice). SortableJS riduce bug cross-browser sul reorder. |
| **Konva.js** *oppure* **Fabric.js** | Layer overlay unificato: box censura, posizionamento firma, handles resize | Media | `redactPdf.js` oggi usa DOM + mouse custom; unificare su un solo layer canvas semplifica firma disegnata + rettangoli. **Konva** è più leggero per solo rettangoli/linee/immagini. |
| **perfect-scrollbar** o CSS `overflow` | Scrollbar affinata nel pannello pagine | Bassa | Opzionale estetica. |

### 2.3 Firma: due livelli da distinguere nel piano

| Tipo | Descrizione | Libreria / approccio |
|------|-------------|----------------------|
| **Firma visiva (Fase 1–2)** | Testo, disegno a mano libera, immagine (PNG/JPG) apposti come contenuto grafico sul PDF | **pdf-lib**: `embedFont` / `drawText`, `embedPng` / `drawImage`; input disegno: `<canvas>` o Konva export `toDataURL()`. |
| **Firma digitale crittografica (Fase 3+)** | PKCS#7, certificato, validità legale | **Non coperta da pdf-lib da sola.** Valutare `@signpdf/signpdf`, `node-signpdf`, o pipeline esterna (es. `pdfsig` / Ghostscript se già in stack). **`signtool` in `package.json` oggi non è usato dall’app** — non confondere con firma documento. |

Il piano implementativo sotto assume **firma visiva** nelle prime release; la firma digitale è backlog esplicito.

---

## 3. Architettura UI

### 3.1 Layout (desktop-first, responsive)

```
┌──────────────────────────────────────────────────────────────────┐
│ [← Home]  Editor PDF     [Apri PDF]  [Annulla] [Esporta PDF]      │
├──────────┬───────────────────────────────────────┬───────────────┤
│ PAGINE   │  Toolbar anteprima                     │ STRUMENTI     │
│          │  [−][100%][+]  [▢1][☰][↕]  Pag 3/12   │ ○ Filigrana   │
│ [thumb1] │  ┌─────────────────────────────────┐  │ ○ Censura     │
│ [thumb2] │  │                                 │  │ ○ Firma       │
│ [thumb3] │  │   Canvas PDF.js                 │  │               │
│  ⋮⋮ drag │  │   + overlay (Konva/DOM)         │  │  (form tool)  │
│ [🗑][↻] │  │                                 │  │               │
│          │  └─────────────────────────────────┘  │               │
│          │  ◀ Prev   Pagina 3   Next ▶           │               │
└──────────┴───────────────────────────────────────┴───────────────┘
```

### 3.2 Modalità di visualizzazione anteprima

| Modalità | Comportamento | Implementazione PDF.js |
|----------|---------------|-------------------------|
| **Pagina singola** | Una pagina alla volta, toolbar Prev/Next | `getPage(n)` + un canvas |
| **Scroll continuo** | Tutte le pagine in colonna, scroll verticale | Loop `1..numPages` come `redactPdf.js` |
| **Miniature + focus** | Griglia piccola + anteprima grande pagina selezionata | Combinazione `deletePages` + viewer centrale |

**Zoom:** fattore `scale` su `page.getViewport({ scale })`; slider 25%–400%; “Adatta larghezza” calcola scale da `container.clientWidth` (già simile in `redactPdf.js` righe 82–88).

**Paginazione:** indicatore `Pagina corrente / totale`; in scroll continuo, `IntersectionObserver` sulla pagina più visibile per aggiornare l’indice.

### 3.3 Pannello pagine (sinistra)

Per ogni pagina (miniatura):

| Controllo | Azione sul modello |
|-----------|-------------------|
| Click miniatura | `currentPageIndex = orderIndex` → aggiorna anteprima centrale |
| Icona 🗑 | `page.deleted = true` (ghost in UI, barrato) |
| ↺ / ↻ | `page.rotation = (page.rotation ± 90) % 360` |
| Drag handle ⋮⋮ | Riordina `pages[]` (SortableJS o DnD nativo) |
| Badge numero | Mostra **nuovo** ordine (1…N), non solo indice sorgente |

**Elimina pagine:** riuso logica `deletePages.js` (`pagesToDelete` Set) ma integrata nel modello globale.

**Ruota:** riuso `pageRotations` Map da `rotatePdf.js` + `drawCanvas` con `getViewport({ rotation })`.

**Riordino:** nuovo; in export: `pdfDoc.copyPages(source, [indicesInNewOrder])` escludendo `deleted`.

---

## 4. Funzionalità per strumento

### 4.1 Filigrana (da `watermark/`)

**UI nel pannello destro:**

- Tipo: testo | immagine (come oggi).
- Testo, font size, opacità, colore, rotazione, posizione (preset + slider X/Y).
- Anteprima live sulla **pagina corrente** (overlay semi-trasparente) o su tutte le pagine.
- Layer multipli (lista con drag reorder — già in watermark).

**Export (`pdf-lib`):** portare `applyWatermarkLayers()` da `watermark.js` in modulo condiviso `pdfEditor/export/watermark.js`.

**Modello:**

```js
watermarks: [{
  id, type: 'text'|'image', text?, imageBytes?,
  opacity, rotation, color, position: { x, y }, // normalizzato 0–1
  pageScope: 'all' | 'current' | number[]
}]
```

### 4.2 Elimina pagine

- Toggle eliminazione da miniatura o da toolbar (“Elimina pagina corrente”).
- Anteprima: pagina eliminata grigia / icona cestino; esclusa dall’export.
- **Undo:** ripristino `deleted = false`.

### 4.3 Ruota pagine

- Rotazione per pagina corrente o per selezione multipla (checkbox su miniature, pattern `rotatePdf.js`).
- Applicazione solo visiva fino all’export; `pdf-lib`: `page.setRotation(degrees)`.

### 4.4 Riordino pagine

- Sortable sulla lista miniature.
- Export: creare nuovo `PDFDocument`, `copyPages` nell’ordine di `pages.filter(p => !p.deleted)`.
- Opzionale: pulsante “Inverti ordine”, “Ripristina ordine originale”.

### 4.5 Censura (da `redactPdf/`)

**UI:** tool “Rettangolo” attivo → drag su overlay per creare box; handles resize (logica esistente in `redactPdf.js`).

**Modello:**

```js
redactions: [{
  id, pageIndex, // indice nell'ordine corrente
  rect: { x, y, width, height }, // coordinate normalizzate 0–1 rispetto alla pagina
  color: '#000000'
}]
```

**Export:** `page.drawRectangle({ ... rgb, opacity: 1 })` — come `redactPdf.js` finale.

**Nota:** la censura in Pdeffy oggi è **visiva** (rettangoli opachi), non rimozione strutturale del testo PDF. Documentare in UI: “Maschera contenuto; per sicurezza massima verificare il file esportato.”

### 4.6 Firma PDF (nuovo)

#### 4.6.1 Modalità firma

| Modalità | Input utente | Rendering overlay | Export pdf-lib |
|----------|--------------|-------------------|----------------|
| **Testo** | Nome, font, dimensione, colore | Testo draggable sulla pagina | `drawText` + `embedFont` (Helvetica standard o font custom embedded) |
| **Disegno** | Canvas touch/mouse, gomma, spessore penna | Layer Konva Line / canvas 2D | `embedPng` da canvas rasterizzato, `drawImage` scalato |
| **Immagine** | File PNG/JPG con trasparenza | Immagine draggable + resize | `embedPng` / `embedJpg` |

#### 4.6.2 UX firma

1. Tab “Firma” → scegli modalità.
2. Clic “Aggiungi firma” → overlay in modalità edit sulla pagina corrente.
3. Drag per posizione; angoli per scala; opzionale campo “Applica a tutte le pagine” (stessa posizione normalizzata).
4. Lista firme applicate con elimina/modifica.

**Modello:**

```js
signatures: [{
  id, pageIndex, type: 'text'|'drawing'|'image',
  rect: { x, y, width, height },
  payload: { text?, pngBytes?, paths? }
}]
```

#### 4.6.3 Firma digitale (backlog)

- Richiesta certificato (.p12), password, campo firma PDF AcroForm.
- Valutare servizio IPC dedicato in `index.js` se libreria Node non gira in renderer.
- Separare chiaramente in UI: **“Firma visiva”** vs **“Firma digitale certificata”** (fase successiva).

---

## 5. Struttura file proposta

```
functionalities/pdfEditor/
├── pdfEditor.html              # Shell UI
├── pdfEditor.css
├── pdfEditor.js                # Bootstrap, IPC, wiring
├── model/
│   ├── documentModel.js        # Stato, immutabilità buffer, serializzazione
│   └── commands.js             # (fase 2) undo/redo command pattern
├── view/
│   ├── pageThumbnails.js       # Griglia + sortable + azioni pagina
│   ├── pdfViewer.js            # PDF.js: single / continuous / zoom
│   └── overlayLayer.js         # Konva o DOM overlay unificato
├── tools/
│   ├── toolWatermark.js
│   ├── toolRedact.js
│   ├── toolSignature.js
│   └── toolPages.js            # delete, rotate, reorder (model ops)
├── export/
│   └── buildPdf.js             # Pipeline pdf-lib unica
└── lib/
    └── coords.js               # conversione viewport ↔ normalizzato
```

**Moduli conmotionati da estrarre (refactor):**

- `watermark.js` → funzioni pure export filigrana.
- `deletePages.js` / `rotatePdf.js` / `redactPdf.js` → logica model + export, senza duplicare `getDocument`.

---

## 6. Pipeline di export (ordine operazioni)

Ordine consigliato su `pdf-lib` per minimizzare errori di coordinate:

1. Caricare PDF sorgente da `originalBuffer`.
2. **Riordino + eliminazione:** nuovo documento con sole pagine attive nell’ordine `pages[]`.
3. **Rotazione:** per ogni pagina copiata, `setRotation`.
4. **Filigrane:** per ogni pagina destinazione (o tutte), disegnare layer.
5. **Censura:** `drawRectangle` per ogni box.
6. **Firme:** `drawText` / `drawImage` per ogni firma.
7. `save()` → `Uint8Array` → scrittura file via IPC/fs.

Progresso: `StatusManager.show(..., 'info', 'exportingStep', { step, total })` con chiavi i18n nuove.

---

## 7. Integrazione Electron / IPC

| Necessità | Soluzione |
|-----------|-----------|
| Apri PDF | `<input type="file">` + drag-drop su workspace |
| Salva PDF | `ipcRenderer.invoke('show-save-dialog', …)` poi `fs.writeFile` in renderer (come oggi) o `ipcMain` handler `save-pdf-bytes` se si vuole centralizzare |
| PDF grandi | Avviso se `numPages > 200` o size > 50 MB; rendering lazy miniature (solo pagine visibili + buffer ±2) |
| Worker PDF.js | Allineare versione worker in `libs/` con `pdfjs-dist` (già criticità nota nel progetto) |
| DevTools | Nessun cambiamento; opzionale handler debug solo dev |

Nessun nuovo IPC obbligatorio in fase 1 se si mantiene scrittura lato renderer.

---

## 8. Internazionalizzazione

Aggiungere in `changeLang.js` (en, it, pl, es) chiavi prefisso `pdfEditor*`:

- Titoli sezione, toolbar, modalità vista, zoom, strumenti.
- Messaggi: file non selezionato, export in corso, successo con path.
- Avvisi censura/firma visiva vs digitale.
- Sostituire in `index.html` le 4 card Modifica PDF con **una** card “Editor PDF” (mantenere redirect temporaneo dalle vecchie URL per 1–2 release se necessario).

---

## 9. Piano di implementazione per fasi

### Fase 0 — Preparazione (1–2 giorni)

- [x] Creare cartella `functionalities/pdfEditor/` con HTML/CSS scheletro.
- [x] Estrarre utility coordinate (`lib/coords.js`).
- [x] Documentare contratto `DocumentModel` (`model/documentModel.js`).

### Fase 1 — Core viewer (3–5 giorni)

- [x] Caricamento file + `PdfEncryptionGuard` + drag-and-drop.
- [x] `pdfViewer.js`: modalità singola + scroll continuo + zoom.
- [x] `pageThumbnails.js`: rendering miniature (PDF.js).
- [x] Selezione pagina corrente sincronizzata viewer ↔ thumbnails.

### Fase 2 — Operazioni pagina (3–4 giorni)

- [x] Elimina pagina (con blocco ultima pagina).
- [x] Ruota ±90° da miniature.
- [x] Riordino drag-and-drop (HTML5 DnD nativo).
- [x] `buildPdf.js`: reorder + delete + rotate.
- [x] Export con dialog salva.
- [ ] Ripristino pagina eliminata (toggle / undo).

### Fase 3 — Censura (2–3 giorni)

- [ ] Migrare overlay e export rettangoli da `redactPdf.js`.
- [ ] Tool unificato nel pannello destro.
- [ ] Lista box con delete e navigazione a pagina.

### Fase 4 — Filigrana (3–4 giorni)

- [ ] Migrare layer testo/immagine da `watermark.js`.
- [ ] Anteprima overlay su pagina corrente / tutte.
- [ ] Export filigrane in pipeline.

### Fase 5 — Firma visiva (4–5 giorni)

- [ ] Tab firma: testo, disegno (canvas), immagine.
- [ ] Posizionamento drag + resize su overlay.
- [ ] Export `drawText` / `embedPng`.
- [ ] Copy i18n e help in UI.

### Fase 6 — Polish e migrazione (2–3 giorni)

- [ ] Undo/Redo base (stack comandi su modello).
- [ ] Scorciatoie: `Del` elimina pagina, `Ctrl+S` export, frecce cambio pagina.
- [ ] Card unica in `index.html`; deprecare link vecchi (banner “Usa il nuovo Editor PDF”).
- [ ] Test regressione su Windows / macOS (Electron 33).

### Fase 7 — Backlog firma digitale

- [ ] Spike tecnico `@signpdf/signpdf` o alternativa.
- [ ] UI certificato, validazione, limitazioni legali.

**Stima complessiva:** ~18–26 giorni sviluppo per fasi 0–6 (1 sviluppatore), esclusa firma digitale.

---

## 10. Rischi e mitigazioni

| Rischio | Mitigazione |
|---------|-------------|
| Performance su PDF > 100 pagine | Lazy render miniature; debounce zoom; non tenere tutti i canvas HD in memoria |
| Disallineamento overlay / PDF (zoom) | Coordinate **sempre normalizzate** 0–1; ricalcolo su resize/zoom |
| PDF crittografati | Blocco upfront con `PdfEncryptionGuard` |
| Duplicazione codice con tool vecchi | Refactor moduli export conmotionati; deprecare pagine legacy dopo fase 6 |
| Firma “legalmente vincolante” | Messaggio chiaro: firma visiva ≠ firma digitale; fase 7 separata |
| Versione PDF.js / worker | Script post-install o check CI che allinei `libs/pdf.worker.min.js` a `pdfjs-dist` |

---

## 11. Criteri di accettazione (MVP fase 6)

1. Un solo PDF aperto per sessione; riaprire file resetta o chiede conferma se modifiche pendenti.
2. Anteprima con **zoom** e almeno due modalità (**pagina singola** e **scroll continuo**).
3. Pannello pagine con **elimina**, **ruota**, **riordina** (drag).
4. **Filigrana** testo e immagine applicabile e visibile in anteprima approssimata.
5. **Censura** con almeno un rettangolo per pagina, export con box opachi.
6. **Firma** con le tre modalità (testo, disegno, immagine) esportate nel PDF.
7. Export produce PDF apribile in lettori standard; nessuna regressione su PDF non criptati usati nei test esistenti.
8. Tutte le stringhe UI in **4 lingue** come il resto di Pdeffy.

---

## 12. Riferimenti interni

| File | Pattern da riusare |
|------|-------------------|
| `functionalities/redactPdf/redactPdf.js` | Scroll continuo, overlay drag/resize, `pdfPageDimensions` |
| `functionalities/rotatePdf/rotatePdf.js` | Rotazione viewport, selezione multipla, cache pagine |
| `functionalities/deletePages/deletePages.js` | Griglia miniature, toggle elimina |
| `functionalities/watermark/watermark.js` | Layer filigrana, anteprima canvas, immagine |
| `functionalities/merge/merge.js` | HTML5 drag-and-drop lista |
| `functionalities/pdfEncryptionGuard.js` | Blocco PDF protetti |
| `package.json` | `pdfjs-dist`, `pdf-lib` |

**Documentazione esterna**

- [PDF.js — Home & API](https://mozilla.github.io/pdf.js/)
- [pdf-lib — PDFDocument](https://pdf-lib.js.org/)

---

## 13. Decisioni aperte (da confermare prima dello sviluppo)

1. **Nome prodotto:** “Editor PDF” vs “Studio Modifica PDF”?
2. **Un documento alla volta** o sessioni multiple (tab)?
3. **Salvataggio automatico** bozza in `os.tmpdir()`?
4. **Firma digitale** in scope v1 o solo backlog?
5. Deprecazione immediata delle 4 pagine legacy o convivenza per N release?

---

*Documento creato per il repository Pdeffy. Aggiornare questo file ad ogni milestone di implementazione.*
