mod docx_rebuild;
pub mod image;
mod markdown;
mod pptx;
mod txt;
mod xlsx;

use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::format::PdfExportFormat;
use crate::pdf_to_office::model::DocumentModel;

pub struct ExportOutput {
    pub bytes: Vec<u8>,
    pub file_extension: String,
}

pub fn export_from_model(
    model: &DocumentModel,
    format: PdfExportFormat,
) -> Result<ExportOutput, PdfExportError> {
    match format {
        PdfExportFormat::Docx => docx_rebuild::export_docx(model),
        PdfExportFormat::Xlsx => xlsx::export_xlsx(model),
        PdfExportFormat::Pptx => pptx::export_pptx(model),
        PdfExportFormat::Txt => txt::export_txt(model),
        PdfExportFormat::Markdown => markdown::export_markdown(model),
        PdfExportFormat::Image(_) => Err(PdfExportError::Export(
            "Image export bypasses DocumentModel; use export_images_direct.".into(),
        )),
    }
}

