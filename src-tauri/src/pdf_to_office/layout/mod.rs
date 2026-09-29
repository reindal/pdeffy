mod heuristic;

#[cfg(feature = "ner-onnx")]
mod onnx;

pub use heuristic::{infer_heading_level, region_plain_text};

use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::extract::ExtractedPage;
use crate::pdf_to_office::model::PageModel;

/// Phase 2 — layout classification (ONNX when enabled, else heuristic).
pub fn classify_layout(pages: Vec<ExtractedPage>) -> Result<Vec<PageModel>, PdfExportError> {
    #[cfg(feature = "ner-onnx")]
    {
        if let Ok(model) = onnx::classify_with_onnx(pages.clone()) {
            return Ok(model);
        }
    }
    Ok(heuristic::classify_extracted_pages(pages))
}
