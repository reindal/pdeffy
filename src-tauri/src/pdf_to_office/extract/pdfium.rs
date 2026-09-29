//! pdfium-render extraction (enable Cargo feature `pdf-layout`).

use super::types::ExtractedPage;
use crate::pdf_to_office::error::PdfExportError;
use std::path::Path;

pub fn extract_with_pdfium(_pdf_path: &Path) -> Result<Vec<ExtractedPage>, PdfExportError> {
    Err(PdfExportError::Pipeline(
        "pdfium-render not linked in this build.".into(),
    ))
}
