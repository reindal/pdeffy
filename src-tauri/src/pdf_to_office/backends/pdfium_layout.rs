use super::PdfToOfficeConverter;
use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::exporters::{self, ExportOutput};
use crate::pdf_to_office::format::PdfExportFormat;
use crate::pdf_to_office::pipeline::build_document_model;
use std::path::Path;

pub struct PdfiumLayoutBackend;

impl PdfToOfficeConverter for PdfiumLayoutBackend {
    fn name(&self) -> &'static str {
        "pdeffy-layout"
    }

    fn is_available(&self) -> bool {
        true
    }

    fn supports_format(&self, format: PdfExportFormat) -> bool {
        matches!(
            format,
            PdfExportFormat::Docx
                | PdfExportFormat::Xlsx
                | PdfExportFormat::Pptx
                | PdfExportFormat::Txt
                | PdfExportFormat::Markdown
        )
    }

    fn convert(
        &self,
        input_path: &Path,
        format: PdfExportFormat,
        _image_dpi: u32,
        _ghostscript: Option<&Path>,
    ) -> Result<ExportOutput, PdfExportError> {
        let bytes = std::fs::read(input_path).map_err(PdfExportError::Io)?;
        let model = build_document_model(input_path, &bytes)?;
        exporters::export_from_model(&model, format)
    }
}
