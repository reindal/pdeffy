//! Phase 3 DOCX rebuild from [`DocumentModel`].
//!
//! This module is the layout-pipeline DOCX exporter (pdfium + ONNX/heuristic).
//! LibreOffice / MS Office conversion paths are unchanged.

use super::ExportOutput;
use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::layout::region_plain_text;
use crate::pdf_to_office::model::{DocumentModel, RegionType};
use docx_rs::{Docx, Paragraph, Run};
use std::io::Cursor;

pub fn export_docx(model: &DocumentModel) -> Result<ExportOutput, PdfExportError> {
    let mut docx = Docx::new();

    for page in &model.pages {
        for region in &page.regions {
            let text = region_plain_text(region);
            if text.trim().is_empty() && region.region_type != RegionType::Table {
                continue;
            }
            let mut run = Run::new().add_text(&text);
            if region
                .text_blocks
                .first()
                .map(|b| b.style.bold)
                .unwrap_or(false)
            {
                run = run.bold();
            }
            if region
                .text_blocks
                .first()
                .map(|b| b.style.italic)
                .unwrap_or(false)
            {
                run = run.italic();
            }
            docx = docx.add_paragraph(Paragraph::new().add_run(run));
        }
    }

    let mut buffer = Cursor::new(Vec::new());
    docx.pack(&mut buffer)
        .map_err(|e| PdfExportError::Export(e.to_string()))?;
    Ok(ExportOutput {
        bytes: buffer.into_inner(),
        file_extension: "docx".into(),
    })
}
