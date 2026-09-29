mod fallback;
mod types;

#[cfg(feature = "pdf-layout")]
mod pdfium;

pub use types::ExtractedPage;

use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::model::{TextBlock, TextStyleFlags};
use std::path::Path;

/// Phase 1 — text/geometry extraction (pdfium-render when enabled, else lopdf fallback).
pub fn extract_document(
    #[allow(unused_variables)] pdf_path: &Path,
    pdf_bytes: &[u8],
) -> Result<Vec<ExtractedPage>, PdfExportError> {
    #[cfg(feature = "pdf-layout")]
    {
        if let Ok(pages) = pdfium::extract_with_pdfium(pdf_path) {
            return Ok(pages);
        }
    }
    fallback::extract_with_lopdf(pdf_bytes)
}

pub fn render_page_images_gs(
    gs: &Path,
    pdf_path: &Path,
    format: &str,
    dpi: u32,
) -> Result<Vec<Vec<u8>>, PdfExportError> {
    use crate::commands::ghostscript;
    use std::fs;

    let temp = std::env::temp_dir().join(format!("pdeffy_pdfimg_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&temp).map_err(PdfExportError::Io)?;
    let files = ghostscript::pdf_to_images(gs, pdf_path, &temp, format, dpi)
        .map_err(PdfExportError::Export)?;
    let mut out = Vec::new();
    for path in files {
        out.push(fs::read(&path).map_err(PdfExportError::Io)?);
        let _ = fs::remove_file(path);
    }
    let _ = fs::remove_dir_all(temp);
    Ok(out)
}

pub fn merge_blocks_text(blocks: &[TextBlock]) -> String {
    blocks
        .iter()
        .map(|b| b.text.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn default_style() -> TextStyleFlags {
    TextStyleFlags {
        bold: false,
        italic: false,
        font_size_pt: Some(11.0),
        font_name: None,
    }
}
