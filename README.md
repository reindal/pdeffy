# pdeffy

**pdeffy** is a lightweight, locally installed desktop application designed for advanced PDF manipulation.  
Built with performance, usability, and flexibility in mind, it empowers users to manage and transform PDF documents efficiently — all without relying on external cloud services.

---

## 🚀 About the Project

pdeffy was developed by **Łukasz 🇵🇱, Mikołaj 🇵🇱 and Adrian 🇪🇸** with the help of **Reindal S.r.l.** team, a software house based in Reggio Emilia, Italy.

Reindal actively supports international study-work programs, welcoming students from across Europe every year. This project was created in a dynamic, collaborative environment by a team composed of:

- 🇵🇱 Two Polish students  
- 🇪🇸 One Spanish student  
- 🇮🇹 The Reindal development team  

The result is a modern, practical tool born from cross-cultural collaboration, innovation, and hands-on learning.

---

## ⚙ Requirements

- **Node.js** (npm included) — frontend tooling
- **Rust** (stable) — [rustup](https://rustup.rs/)
- **System deps** for Tauri (see [Tauri prerequisites](https://tauri.app/start/prerequisites/))
- Optional: **LibreOffice** for Office↔PDF conversions
- Optional: **Ghostscript** on macOS/Linux (`brew install ghostscript` / `sudo apt install ghostscript`). Windows ships a bundled portable Ghostscript.

```bash
node -v
npm -v
rustc -V
```

---

## 🏗️ Launch the Project

### Development

```bash
npm install
npm run dev
```

This starts Vite on port 1420 and the Tauri window (`tauri dev`).

### Production build

```bash
npm run build
```

Installers are written under `src-tauri/target/release/bundle/` (`.dmg`, `.msi`/NSIS, `.deb` / AppImage depending on OS).

---

## 🎯 Purpose

pdeffy provides a secure and efficient way to manipulate PDF files directly on your local machine.  
No uploads. No third-party processing. Full control over your documents.

It is ideal for professionals, students, and organizations that need reliable PDF processing with strong privacy guarantees.

---

## ✨ Features

### 📄 PDF Manipulation
- Merge multiple PDF files into a single document
- Split PDF files by:
  - Page range
  - Single pages
  - Custom intervals
- Reorder pages
- Delete selected pages

### 🔄 File Conversion
- Convert PDF to:
  - Image formats (e.g., PNG, JPG)
  - Text formats
- Convert supported file formats into PDF

### ⚡ Performance & Privacy
- Fully local installation
- No internet connection required
- No document uploads
- Fast processing optimized for desktop environments

---

## 🖥 Installation

pdeffy is designed to be installed locally on desktop environments.

### Requirements
- Supported operating system: Windows 10 or Windows 11

### Installation Steps
1. Download the installer from the official repository or release section.
2. Run the installer.
3. Follow the setup instructions.
4. Launch pdeffy from your applications menu.

---

## 🏗 Architecture Overview

pdeffy is built with a modular architecture to ensure:

- Scalability
- Maintainability
- Extensibility
- Clear separation of processing modules (merge, split, extract, convert)

Each feature is implemented as an independent processing component, making the system easy to extend in future releases.

---

## 🌍 Educational & Innovation Context

This project represents more than just a software tool.

It reflects Reindal S.r.l.'s commitment to:

- International collaboration  
- Youth professional development  
- Practical, real-world software engineering experience  
- Innovation through diversity  

By integrating students from Poland and Spain into an Italian software house environment, pdeffy became a hands-on example of European cooperation in technology.

---

## 🔒 Security & Data Protection

Because pdeffy operates entirely offline:

- Documents never leave the user's machine.
- No external APIs process your files.
- No data storage or tracking is involved.

This makes pdeffy particularly suitable for handling sensitive documents.

---

## 📌 Roadmap

Planned future improvements may include:

- OCR (Optical Character Recognition) support
- Batch processing enhancements
- Advanced compression options
- UI/UX improvements
- Plugin-based architecture for extended features

---

## 🤝 Contributing

Contributions, improvements, and suggestions are welcome.

To contribute:
1. Fork the repository.
2. Create a feature branch.
3. Submit a pull request with a clear description of your changes.

---

## 🏢 About Reindal S.r.l.

Reindal S.r.l. is a software house based in Reggio Emilia, Italy.  
The company develops custom digital solutions and actively participates in international educational programs, fostering innovation through collaboration with young European talents.

---

## 📦 Third-Party Dependencies

This project uses the following open-source libraries:

- docx ^8.5.0 — MIT License
- electron-squirrel-startup ^1.0.1 — MIT License
- fs-extra ^11.2.0 — MIT License
- html2canvas ^1.4.1 — MIT License
- jspdf ^4.1.0 — MIT License
- jszip ^3.10.1 — MIT License
- jszip (alias: jszip2) 2.6.1 — MIT License
- mammoth ^1.11.0 — BSD-2-Clause License
- pdf-lib ^1.17.1 — MIT License
- pdfjs-dist ^5.4.624 — Apache-2.0 License
- pptx2html ^0.3.4 — MIT License
- pptxgenjs ^4.0.1 — MIT License
- signtool ^1.0.0 — MIT License
- update-electron-app ^3.1.2 — MIT License
- xml2js ^0.6.2 — MIT License

---

## 📄 License

MIT License

---

**pdeffy** — Smart PDF processing, built locally.  
Crafted through collaboration. Designed for efficiency.
