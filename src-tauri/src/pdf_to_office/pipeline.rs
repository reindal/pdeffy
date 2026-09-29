use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::extract;
use crate::pdf_to_office::layout;
use crate::pdf_to_office::model::DocumentModel;
use std::path::Path;

/// Runs Phase 1 + Phase 2 once for all layout-based exporters.
pub fn build_document_model(pdf_path: &Path, pdf_bytes: &[u8]) -> Result<DocumentModel, PdfExportError> {
    let extracted = extract::extract_document(pdf_path, pdf_bytes)?;
    let pages = layout::classify_layout(extracted)?;
    Ok(DocumentModel { pages })
}
