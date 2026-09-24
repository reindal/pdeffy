# QA regression checklist (Tauri cutover)

Run after `npm run build` / on a `tauri dev` build.

## Platform / shell

- [ ] App launches maximized with title **Pdeffy**
- [ ] Home page language selector switches EN/IT/ES/PL
- [ ] First-launch opens settings once, then not again
- [ ] Settings save author/title/subject and persist after restart

## Organize

- [ ] Merge 2+ PDFs → save dialog → file opens
- [ ] Merge large PDFs (>20MB total) uses Rust path (or falls back to pdf-lib)
- [ ] Split by range / every N / ZIP
- [ ] Compress PDF (Ghostscript present)
- [ ] Protect PDF with password + permissions

## Convert

- [ ] DOCX/XLSX/PPTX → PDF (LibreOffice installed)
- [ ] PDF → DOCX / PPTX / XLSX
- [ ] Image → PDF (PNG/JPEG; WebP if supported)
- [ ] Markdown → PDF (jspdf/html2canvas pipeline, no Chromium window)
- [ ] PDF → Image (Ghostscript path preferred; PDF.js fallback)
- [ ] PDF → Markdown

## Edit

- [ ] PDF Editor: load, watermark, redact flatten, signature, search, export
- [ ] Standalone redact: true-redaction path preferred; text not trivially extractable
- [ ] Watermark / rotate / delete pages

## Engines

- [ ] Missing LibreOffice shows engine warning modal
- [ ] Missing Ghostscript shows install guidance (macOS/Linux)

## Packaging smoke

- [ ] `npm run build:vite` succeeds
- [ ] `cargo check` / `npm run build` succeeds on CI matrix OS
