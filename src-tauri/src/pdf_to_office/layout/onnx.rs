//! ONNX layout model hook (same `ort` stack as GLiNER NER).

use crate::pdf_to_office::extract::ExtractedPage;
use crate::pdf_to_office::model::PageModel;

pub fn classify_with_onnx(_pages: Vec<ExtractedPage>) -> Result<Vec<PageModel>, crate::pdf_to_office::error::PdfExportError> {
    Err(crate::pdf_to_office::error::PdfExportError::Pipeline(
        "Layout ONNX model not configured.".into(),
    ))
}
