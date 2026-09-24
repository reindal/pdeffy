# Piano migrazione Pdeffy: Electron → Tauri 2

> Branch di lavoro: `feat/tauri-migration`  
> Strategia: **cutover** (sostituzione Electron in un unico rilascio)  
> Riferimento: [Tauri 2](https://tauri.app/)

## Checklist

- [x] Fase 1 — Scaffold Tauri 2 + Vite multi-page
- [x] Fase 2 — Platform bridge (sostituisce ipcRenderer)
- [x] Fase 3 — Port Rust del backend (da index.js)
- [x] Fase 4 — Casi speciali (Markdown PDF, PDF Editor, menu, DevTools)
- [x] Fase 5 — Packaging, risorse, CI
- [x] Fase 6 — Test di regressione cross-platform (checklist in `docs/QA-tauri-regression.md`)
- [x] Fase 7 — Restyle UI desktop (design system + shell + pagine)

---

## Stato attuale

Pdeffy è un'app **multi-pagina HTML/JS** senza bundler, con:

- **Main process monolitico** in `index.js` (~1500 righe): dialog, settings JSON, auto-update, LibreOffice/Ghostscript/MS Office, `printToPDF` per Markdown, conversione PDF→Excel nativa.
- **Renderer con Node abilitato** (`nodeIntegration: true`, `contextIsolation: false`): ~25 file in `functionalities/` usano `require('electron')`, `require('fs')`, `require('pdf-lib')` direttamente.
- **Packaging** via Electron Forge (`forge.config.js`): Squirrel (Win), DMG (macOS), deb/rpm (Linux), Ghostscript bundled su Windows in `resources/ghostscript/win`.
- **CI** GitHub Actions (`.github/workflows/build.yml`) con `npm run make`.

```mermaid
flowchart LR
  subgraph electron [Architettura attuale]
    HTML[HTML pages] -->|require fs pdf-lib| NodeRenderer[Renderer Node]
    NodeRenderer -->|ipcRenderer.invoke| Main[index.js]
    Main --> LO[LibreOffice exec]
    Main --> GS[Ghostscript exec]
    Main --> MSO[PowerShell COM Win]
    Main --> PrintPDF[Hidden BrowserWindow printToPDF]
  end
```

## Architettura target (Tauri 2)

Tauri usa il **webview nativo del SO** + backend **Rust**. Il frontend non può usare Node/`require` nel webview.

```mermaid
flowchart LR
  subgraph tauri [Architettura target]
    ViteUI[Vite bundled UI] -->|invoke| Rust[Rust commands]
    ViteUI -->|import| PdfLib[pdf-lib pdfjs in browser]
    Rust --> Dialog[tauri-plugin-dialog]
    Rust --> Store[tauri-plugin-store]
    Rust --> Shell[tauri-plugin-shell]
    Rust --> LO2[LibreOffice]
    Rust --> GS2[Ghostscript bundled]
    Rust --> MSO2[PowerShell Win]
    Rust --> FS[tauri fs / std fs]
  end
```

## Strategia: cutover

Un branch dedicato (`feat/tauri-migration`) con **un unico rilascio** che sostituisce Electron. Sei fasi sequenziali nello stesso branch, senza doppia manutenzione Electron+Tauri.

---

## Fase 1 — Scaffold Tauri 2 + Vite

1. Inizializzare Tauri 2 nel repo (cartella `src-tauri/`):
   - `tauri.conf.json`: `devUrl` / `frontendDist`, finestra maximized, icona da `assets/icon`, bundle identifier `com.reindal.pdeffy`.
   - Includere risorse Windows Ghostscript come `resources` (equivalente di `extraResource` in Forge).

2. Aggiungere **Vite** come build frontend:
   - Input multi-page: `index.html` + tutte le pagine in `functionalities/**/*.html`.
   - Output in `dist/` referenziato da Tauri.
   - Alias npm per librerie già in `package.json`: `pdf-lib`, `pdfjs-dist`, `jspdf`, `jszip`, `pptxgenjs`, ecc.

3. Aggiornare script in `package.json`:
   - `dev`: `tauri dev`
   - `build`: `tauri build`
   - Rimuovere `@electron-forge/*`, `electron`, `update-electron-app`, `electron-squirrel-startup`.

---

## Fase 2 — Platform bridge (sostituisce ipcRenderer)

Creare un modulo unico, es. `src/platform/bridge.js`, che espone la stessa API semantica usata oggi dai tool:

| API attuale (Electron) | Nuova implementazione |
|---|---|
| `ipcRenderer.invoke('show-save-dialog', opts)` | `@tauri-apps/plugin-dialog` `save()` |
| `ipcRenderer.invoke('get-downloads-path')` | `path.downloadDir()` da `@tauri-apps/api/path` |
| `ipcRenderer.invoke('get/save-pdf-metadata')` | `tauri-plugin-store` o command Rust |
| `ipcRenderer.invoke('get/save-language')` | idem |
| `ipcRenderer.invoke('check-first-launch')` | command Rust (marker file in app data) |
| `ipcRenderer.invoke('convert-with-libreoffice', …)` | command Rust |
| `ipcRenderer.invoke('compress/protect-with-ghostscript', …)` | command Rust |
| `ipcRenderer.invoke('check-engines-availability')` | command Rust |
| `ipcRenderer.invoke('check-ghostscript-availability')` | command Rust |
| `ipcRenderer.invoke('markdown-file-to-pdf', …)` | command Rust o frontend jsPDF (vedi Fase 4) |
| `ipcRenderer.invoke('generate-pptx', …)` | frontend `pptxgenjs` + `writeFile` via Rust |
| `ipcRenderer.invoke('open-external-url')` | `@tauri-apps/plugin-opener` |
| `ipcRenderer.invoke('open-file'/'open-folder')` | plugin opener / shell |

Aggiornare in batch:

- `changeLang.js`, `settings.js`
- Tutti i file in `functionalities/**/*.js` (~25 file con `require('electron')`)

Pattern di migrazione renderer:

```javascript
// prima
const fs = require('fs').promises;
await fs.writeFile(savePath, pdfBytes);

// dopo
import { writeFile } from '@tauri-apps/plugin-fs';
await writeFile(savePath, pdfBytes);
```

Per i PDF già in memoria (`ArrayBuffer`/`Uint8Array`), la maggior parte della logica `pdf-lib` resta nel frontend; cambia solo **persistenza su disco** e **dialoghi**.

---

## Fase 3 — Port Rust del backend (da index.js)

Suddividere `index.js` in moduli Rust sotto `src-tauri/src/commands/`:

| Modulo Rust | Contenuto portato da index.js |
|---|---|
| `settings.rs` | `pdf-settings.json`, `language-settings.json`, `warnings-settings.json`, first-launch marker |
| `dialog.rs` | save/open dialog wrappers |
| `libreoffice.rs` | `getSystemLibreOfficePath`, `convert-with-libreoffice` (incluso 2-step PDF→ODT→DOCX, infilter PPTX, metadata OpenXML) |
| `msoffice.rs` | `convertWithMSOfficeWindows` (solo Win, PowerShell COM) |
| `pdf_excel.rs` | pipeline `pdf2json` + `xlsx` — valutare port JS→Rust o logica JS lato frontend |
| `ghostscript.rs` | `getGhostscriptPath`, compress, protect AES |
| `engines.rs` | check LibreOffice / MS Office / Ghostscript |

**Plugin Tauri da abilitare:**

- `tauri-plugin-dialog`
- `tauri-plugin-shell` (exec LibreOffice/Ghostscript con argomenti controllati)
- `tauri-plugin-fs` (scope limitato a Downloads + path scelti dall'utente)
- `tauri-plugin-store` (settings)
- `tauri-plugin-opener`
- `tauri-plugin-updater` (sostituisce `update-electron-app`)

**Capabilities / security:** definire allowlist comandi shell (`soffice`, `gs`, `powershell.exe`) e permessi fs minimi in `capabilities/default.json` (Tauri 2 ACL).

---

## Fase 4 — Casi speciali

### 4a. Markdown / HTML → PDF

Oggi: `printHtmlStringToPdf` in `index.js` con `BrowserWindow.printToPDF`.

Opzioni cutover (in ordine di preferenza):

1. **Frontend**: `marked` + `jspdf`/`html2canvas` (già dipendenze) — niente finestra nascosta.
2. **Rust**: crate tipo `headless_chrome` / servizio esterno — più pesante.

Consiglio: **opzione 1** per ridurre dipendenza da API Chromium.

### 4b. PDF Editor unified

`functionalities/pdfEditor/` usa `fs`, `ipcRenderer`, `require('pdf-lib')` in export modules.

- Bundlare `pdf-lib` via Vite (sostituire `require('pdf-lib')` in `applyAnnotations.js`, `buildPdf.js`).
- Export: `writeFile` via Tauri dopo save dialog.
- `pdfjs` worker path: servire da `dist` con path assoluti Vite.

### 4c. Menu nativo + About

Sostituire `Menu.setApplicationMenu` con Tauri menu in `tauri.conf.json` / Rust `MenuBuilder`, oppure menu in-app minimal (già presente header con back link).

### 4d. DevTools

Shortcut Ctrl+Shift+I: abilitare solo in debug build (`#[cfg(debug_assertions)]`).

---

## Fase 5 — Packaging, risorse, CI

1. **Risorse bundled:**
   - Ghostscript Windows → `src-tauri/resources/ghostscript/win/` (come oggi).
   - Risolvere path runtime con `tauri::path::resource_dir()`.

2. **Target build:**
   - Windows: NSIS o WiX (Tauri default) — sostituisce Squirrel `.exe` + `.nupkg`.
   - macOS: `.dmg` / `.app`.
   - Linux: `.deb` + AppImage (Tauri supporta entrambi).

3. **Aggiornare CI** `.github/workflows/build.yml`:
   - Install Rust stable + dipendenze Linux (`libwebkit2gtk`, `libappindicator`, …).
   - `npm ci && npm run tauri build`.
   - Upload artefatti `.exe`, `.dmg`, `.deb`.
   - **Updater:** migrare release `latest` a formato Tauri updater (firma, manifest JSON) — il flusso `.nupkg`/`RELEASES` Squirrel non si applica più.

4. **Rimuovere:** `index.js`, `forge.config.js`, dipendenze Electron.

---

## Fase 6 — Test di regressione

| Area | Test |
|---|---|
| Dialog save/open | ogni tool che esporta PDF |
| Settings / i18n | author/title/subject, 4 lingue, first launch |
| Conversioni LO | docx/xlsx/pptx→pdf, pdf→docx/pptx |
| PDF→Excel | algoritmo nativo JS |
| Ghostscript | compress + protect |
| MS Office fallback | solo Windows, se installato |
| PDF Editor | load, watermark, redact flatten export, signature, search |
| Updater | check download su Win/macOS |

---

## Fase 7 — Restyle UI desktop

> **Stato:** da fare (post cutover funzionale)  
> **Mockup di riferimento:** [`docs/assets/ui-restyle-mockup.jpg`](./assets/ui-restyle-mockup.jpg)  
> **Vincolo:** funzionalità e logica Rust/Tauri **invariate**; solo UI/CSS/markup/shell. Nessuna riscrittura della pipeline PDF.

### Obiettivo

Trasformare l’UI multi-page attuale in un’app **desktop-first** moderna (stile suite tipo iLovePDF, ma nativa), con sidebar persistente, home a griglia di tool e editor a layout a 4 colonne.

### Stack da rispettare (analisi preventiva obbligatoria)

Prima di toccare file: confermare punto di ingresso, routing multi-page HTML, bridge Tauri (`src/platform/`), comandi Rust e asset esistenti.

- Frontend attuale: **HTML + JS vanilla** multi-page + **Vite** (non React/Vue/Svelte).
- Entry: `index.html` + pagine in `functionalities/**/*.html`.
- Bridge: `src/platform/bridge.js` + shim `vite-plugin-pdeffy-shim.js`.
- Backend: comandi in `src-tauri/src/commands/` — **riutilizzare**, non duplicare.
- Design tokens esistenti: `variables.css` / `styles.css` — evolvere in CSS variables globali, non spargere hex hardcoded.

### Design system (token)

| Token | Valore |
|---|---|
| Background | `#FFFCF3` |
| Surface / card | `#FFFFFF` |
| Sidebar | `#FFFDF8` |
| Primary yellow | `#FFD91A` (hover `#F2C900`) |
| Testo primario | `#101A3A` |
| Testo secondario | `#52617A` |
| Border | `#E7E7E2` |
| Accenti icone | blue `#3478F6`, pink `#F54C9B`, purple `#A94CF5`, green `#24C875`, orange `#FF922B`, cyan `#2DD4BF`, red `#FF4D67` |
| Radius | card 14–18px, button/input 10–12px |
| Ombre | estremamente leggere |
| Motion | hover ~120–160ms, sidebar collapse ~180ms |

Definire in CSS variables globali (`--pdeffy-*`): colori, spacing, radius, shadow. Niente colori ripetuti nei singoli componenti.

### Layout shell

Sidebar sinistra persistente (~180–210px; collassata ~56–64px, solo icone + tooltip):

- Logo Pdeffy
- **Home** (sempre raggiungibile)
- Organizza PDF
- Converti PDF
- Modifica PDF
- Recenti
- —  
- **Impostazioni** ancorate in basso

Voce attiva: background giallo, testo scuro, shape arrotondata.  
**Non** aggiungere una voce “Strumenti”.  
In editor PDF: sidebar **auto-collassata** per massimizzare l’area documento.

### Pagine

**Home** — niente tre mega-card di categoria. Header “Ciao! / Cosa vuoi fare oggi?”, search “Cerca uno strumento o un formato…”, griglia **3 colonne** di tool card compatte orizzontali `[icona] Nome + descrizione [→]`.

**Organizza PDF** — Unisci, Dividi, PDF da Modello, Proteggi, Comprimi (stesse card della home).

**Converti PDF** — due sezioni: *Da altro formato a PDF* (DOCX/Excel/PPTX/Immagine/Markdown) e *Da PDF a altro formato* (DOCX/Excel/PPTX/Immagine).

**Modifica PDF (ingresso)** — solo drop zone grande + “Apri PDF” (primary yellow) + “Documenti recenti” (3–4 voci). **Niente** le 4 card Aggiungi testi / Immagini / Filigrana / Censura.

**Editor PDF** — resta concettualmente dentro “Modifica PDF”. Layout:

`| sidebar collassata | thumbnails ~140–170px | documento flex:1 | properties ~250–290px |`

Header: nome file + [Cambia file] [Esporta PDF]. Toolbar zoom/fit/view/nav. Properties tabs: Cerca / Filigrana / Censura / Firma. Thumbnails con ruota/elimina e bordo selezione chiaro. Properties ridimensionabile o collassabile.

### Componenti riutilizzabili (markup/CSS condivisi)

Dato lo stack vanilla, organizzare in partial CSS/JS (o snippet HTML condivisi), non in un framework nuovo:

`AppShell`, `Sidebar`, `PageHeader`, `SearchBar`, `ToolCard`, `ToolGrid`, `DropZone`, `RecentDocumentCard`, `EditorToolbar`, `PageThumbnail`, `PropertiesPanel`, `Button`, `IconButton`, `SectionTitle`.

### Asset

Preferire SVG in struttura tipo:

```
src/assets/
  logo/     pdeffy-logo.svg, pdeffy-mark.svg
  icons/    home, organize, convert, edit, recent, settings, merge, split, …
  illustrations/  pdf-friendly.svg, empty-recent.svg
```

Niente emoji come icone UI. Stroke arrotondato, leggibili a 20–24px, colore via CSS quando possibile.

### Responsive desktop (Tauri)

Target: 1280×720, 1440×900, 1920×1080. A 1280px: zero overflow orizzontale; in editor ridurre sidebar/thumbnails e collassare properties **prima** di sacrificare il documento.

### Accessibilità

Focus visibile, keyboard nav, tooltip sidebar collassata, `aria-label` su IconButton, contrasto adeguato, hit target ≥ ~36px.

### Ordine di implementazione

1. Analisi repo (entry, routing multi-page, bridge, comandi, asset).
2. Token CSS globali + `AppShell` / `Sidebar`.
3. Home + Organizza + Converti (shell + card + search).
4. Modifica PDF ingresso (drop zone + recenti).
5. Restyle Editor (layout 4 colonne, toolbar, properties, thumbnails) **senza** cambiare `documentModel` / export / comandi Rust.
6. Settings ancorate in sidebar; i18n (`changeLang.js`) aggiornato alle nuove stringhe UI.
7. Build Vite + smoke: ogni tool esistente ancora raggiungibile; Home da ogni schermata; editor con spazio documento adeguato.

### Cosa non fare

- Non modificare Rust salvo necessità minima di collegamento UI.
- Non rimuovere funzionalità.
- Non introdurre React/Vue/Svelte solo per il restyle.
- Non riscrivere logica PDF (pdf-lib, pdfjs, convert, GS, LO) per adattarla allo stile.
- Non dipendenze UI pesanti (Material, Bootstrap, ecc.) se evitabili con CSS proprio.

---

## Stima effort (cutover)

| Fase | Effort indicativo |
|---|---|
| Scaffold Tauri + Vite multi-page | 2–3 giorni |
| Platform bridge + migrazione renderer | 4–6 giorni |
| Port Rust conversioni/settings | 5–8 giorni |
| Markdown PDF + edge cases | 1–2 giorni |
| CI/updater/packaging | 2–3 giorni |
| QA cross-platform | 3–5 giorni |
| Restyle UI desktop (Fase 7) | 4–7 giorni |
| **Totale** | **~4–5 settimane** |

---

## Rischi principali

1. **`require()` diffuso nel renderer** — senza Vite la migrazione fallisce; Vite multi-page è obbligatorio.
2. **Permessi fs Tauri** — ogni scrittura fuori da path utente va passata per dialog + scope esplicito.
3. **LibreOffice su Linux Snap** — mantenere workaround profilo isolato (già in index.js) nel port Rust.
4. **Updater** — cambio formato release; utenti Electron non ricevono update automatico verso Tauri (comunicare reinstallazione major).
5. **Dimensione bundle vs Electron** — vantaggio Tauri (~600KB base) ma Ghostscript bundled resta pesante su Windows.

---

## Deliverable finali del cutover

- App avviabile con `npm run tauri dev` / `npm run tauri build`
- Nessun riferimento a `electron`, `ipcRenderer`, `require('fs')` nel frontend
- `index.js` e Forge rimossi
- CI verde su macOS, Windows, Ubuntu
- Documentazione breve in README: prerequisiti (LibreOffice opzionale, Ghostscript su macOS/Linux)

## Deliverable Fase 7 (restyle)

- Shell con sidebar (espansa/collassata) e navigazione Home / Organizza / Converti / Modifica / Recenti / Impostazioni
- Home a griglia tool + search; niente mega-card di categoria
- Modifica PDF: drop zone + recenti; editor a 4 colonne con properties (Cerca / Filigrana / Censura / Firma)
- Design tokens CSS + asset SVG; mockup di riferimento rispettato
- Tutte le funzioni pre-restyle ancora raggiungibili; Rust invariato (salvo glue UI minimo)
