# Pdeffy 2.0

**Pdeffy** is a desktop application for advanced PDF work: merge, split, convert, edit, and automate documents **entirely on your machine**, without sending files to cloud services.

**Version 2.0** is a major technological and functional step beyond the **1.x** line: the same practical spirit as the original project, with architecture, performance, and scope fully renewed by **[Reindal S.r.l.](https://www.reindal.com)**’s in-house team (Reggio Emilia, Italy).

### Downloads

| Line | Release | Notes |
|------|---------|--------|
| **2.x (Tauri)** | [Latest `v2.*` on Releases](https://github.com/reindal/pdeffy/releases) | Current product — see [docs/releases.md](docs/releases.md) for store-style URLs |
| **1.x (Electron, frozen)** | **[v1.11.0-final](https://github.com/reindal/pdeffy/releases/tag/v1.11.0-final)** | Final 1.x source + installers; patches only on `release/1.x` |

---

## From Electron 1.x to Tauri 2.0

### Origins (Pdeffy 1.x)

Pdeffy started as a **student project** built with **Electron**, through an international collaboration program led by Reindal:

- **Łukasz** and **Mikołaj** (Poland)
- **Adrian** (Spain)
- Reindal’s development team in Italy

That first generation proved the concept: a local tool for essential PDF tasks, born from **hands-on learning** and cross-cultural exchange inside a software house.

### The rewrite (Pdeffy 2.0)

The **2.x** series is not a minor upgrade—it is a **full rewrite** led by Reindal’s team:

| Area | Pdeffy 1.x (Electron) | Pdeffy 2.0 (Tauri) |
|------|------------------------|---------------------|
| Runtime | Node.js + embedded Chromium | Native **Rust** + lightweight WebView |
| Footprint | Heavier app bundle | Leaner binary, faster startup |
| PDF / Office | Core features | Rust engines, LibreOffice / Word, Ghostscript |
| AI | — | **On-device LLM, OCR, and NER** (`ai` feature) |
| Editor | Limited | Unified PDF editor (annotations, forms, signatures, attachments) |
| Platforms | Windows-focused | **Windows, macOS, Linux** |

The UI remains web-based (HTML/JS) for UX and maintainability; **critical logic** (PDF, conversions, AI, filesystem) runs in **Rust** via [Tauri 2](https://tauri.app/), improving security, performance, and resource control.

### Vibe coding spirit

The **1.x** codebase was born in a **vibe coding** mindset: learn by building, try ideas quickly, keep the tool practical and fun to extend. **Pdeffy 2.0 keeps that spirit**—fast iteration, bold feature experiments, tight feedback loops with real users—while the in-house Reindal team adds structure, tests, and production-grade Rust/Tauri architecture.

Modern **AI-assisted development** (in the editor and in the product) accelerates exploration; **100% local processing** draws a hard line: we can move fast on code without moving your documents off the machine. Same energy as the student years, grown into a shipping desktop product.

---

## 100% privacy: AI stays local too

Pdeffy 2 adds **optional AI tools** aimed at sensitive environments (business, public sector, healthcare, legal):

- **PDF summarization** with in-process **llama.cpp** models (no mandatory external APIs)
- **OCR** (RapidOCR) to extract text from scans
- **Anonymization** with on-device **NER** (ONNX)
- Model downloads are managed by the app; processing happens **without uploading** your documents

Offline (or without AI models installed), all **non-AI** features remain available: merge, split, conversions, editor, Word/Excel template batch generation, and more.

> **No required cloud.** Your PDFs are not training data and are not processed by third-party services.

---

## Main features

### PDF — organize and clean up
- Merge and split (ranges, single pages)
- Reorder and delete pages, rotation
- Compression and password protection
- Watermark, redaction, custom metadata

### PDF — advanced editor
- Viewing with **pdf.js**, text selection, search
- Annotations, form field editing, export
- **Digital signature** detection and embedded **attachment** extraction
- AI assistant (summarize / anonymize) from the editor flow

### Conversions to PDF
- Word (DOCX), Excel, PowerPoint, images, Markdown → PDF
- **LibreOffice** integration and, where available, **Microsoft Office**

### Conversions from PDF
- PDF → DOCX, XLSX, PPTX, images, Markdown (layout pipeline with **pdfium** when enabled)

### Template automation
- **PDF by template**: Excel/CSV + DOCX placeholders → PDF batches (multi-level folders, optional ZIP, optional DOCX export)
- Smart preservation of graphical headers and footers

### First launch
- **Setup wizard** for LibreOffice, Ghostscript, AI models, and preferences

---

## System requirements

- **Windows 10/11**, **macOS** (Apple Silicon / Intel), **Linux** (Tauri system deps)
- **Node.js** (npm) — frontend tooling
- **Rust** stable — [rustup](https://rustup.rs/)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS

### Optional (recommended)
- **LibreOffice** — Office ↔ PDF conversions
- **Microsoft Word** (macOS/Windows) — best fidelity for complex templates
- **Ghostscript** — compression and some PDF pipelines (portable build may ship on Windows)

```bash
node -v && npm -v && rustc -V
```

---

## Development and build

### Run in dev

```bash
npm install
npm run dev
```

Starts Vite (port 1420) and the Tauri window (`tauri dev`).

### Production build

```bash
npm run build
```

Installers are written to `src-tauri/target/release/bundle/` (`.dmg`, NSIS/`.msi`, `.deb` / AppImage depending on OS).

### Rust features (Cargo)

- `ai` (default) — local LLM, OCR, NER
- `pdf-layout` — layout-aware PDF→Office export (pdfium)
- `updater` — in-app updates
- `ai-metal` / `ai-cuda` / `ai-vulkan` — GPU acceleration for llama.cpp

---

## Architecture (overview)

```
┌─────────────────────────────────────────┐
│  Web UI (Vite, pdf.js, pdf-lib, …)      │
├─────────────────────────────────────────┤
│  Tauri 2 — IPC bridge                   │
├─────────────────────────────────────────┤
│  Rust: lopdf, Office conversion,        │
│  Ghostscript, AI (llama.cpp, OCR, NER)  │
└─────────────────────────────────────────┘
```

Each functional area (`functionalities/…`) maps to UI modules; native commands live in `src-tauri/src/commands/` and registered converters.

---

## Who built it

**Reindal S.r.l.**, a software house in Reggio Emilia, **designed and rewrote Pdeffy 2.0** as an in-house product, evolving the Electron student prototype into a mature desktop platform.

The **1.x** journey is still acknowledged: a concrete example of how international study-and-work programs can produce useful software, later grown professionally inside the company.

---

## Contributing

1. Fork the repository  
2. Create a feature branch (`feat/…`)  
3. Open a pull request with a clear description  

Active development: `dev` → `main`. Frozen Electron line: `release/1.x` / tag `v1.11.0-final`.

---

## License and dependencies

**MIT License** — see the license file in the repository.

Key dependencies: **Tauri 2**, **lopdf**, **pdf.js**, **pdf-lib**, **docxtemplater**, **llama-cpp-2** (AI feature), **Vite** — full lists in `package.json` and `src-tauri/Cargo.toml`.

---

**Pdeffy 2** — capable PDF tooling, **privacy by design**, **vibe coding** energy with Reindal craft: from a student idea to a product built to ship.
