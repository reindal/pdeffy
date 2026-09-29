//! PDF → Office/text/image export via a shared layout pipeline.
//!
//! ## Pipeline
//! 1. **Extract** (`extract/`) — pdfium-render when `pdf-layout` feature is on; lopdf fallback.
//! 2. **Layout** (`layout/`) — ONNX layout model when `ner-onnx` + model assets exist; else heuristic.
//! 3. **Export** (`exporters/`) — format-specific writers from [`DocumentModel`](model::DocumentModel).
//!
//! ## Lontar evaluation (v0.1.1)
//! [`lontar`](https://crates.io/crates/lontar) targets a unified AST → DOCX/PPTX/XLSX/MD/TXT, but current
//! release backends are mostly stubs (`PlainTextWriter`, `XlsxWriter`, …). Our layout needs per-region
//! bbox, table cells, and figure bytes — finer than lontar’s block-level AST today. We therefore keep
//! dedicated exporters (`docx-rs`, `rust_xlsxwriter`, minimal OOXML PPTX) and can introduce a
//! `DocumentModel → lontar::Document` mapper when lontar matures.

pub mod backends;
pub mod error;
pub mod exporters;
pub mod extract;
pub mod format;
pub mod layout;
pub mod model;
pub mod pipeline;
