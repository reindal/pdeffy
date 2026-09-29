use super::PdfToOfficeConverter;
use crate::commands::libreoffice;
use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::exporters::ExportOutput;
use crate::pdf_to_office::format::PdfExportFormat;
use std::path::Path;

pub struct LibreOfficePdfBackend;

impl PdfToOfficeConverter for LibreOfficePdfBackend {
    fn name(&self) -> &'static str {
        "libreoffice"
    }

    fn is_available(&self) -> bool {
        libreoffice::is_libreoffice_installed()
    }

    fn supports_format(&self, format: PdfExportFormat) -> bool {
        matches!(format, PdfExportFormat::Docx | PdfExportFormat::Pptx)
    }

    fn convert(
        &self,
        input_path: &Path,
        format: PdfExportFormat,
        _image_dpi: u32,
        _ghostscript: Option<&Path>,
    ) -> Result<ExportOutput, PdfExportError> {
        if !self.supports_format(format) {
            return Err(PdfExportError::UnsupportedFormat {
                backend: self.name(),
                format: format!("{format:?}"),
            });
        }
        let ext = match format {
            PdfExportFormat::Docx => "docx",
            PdfExportFormat::Pptx => "pptx",
            _ => unreachable!(),
        };
        let temp_dir = std::env::temp_dir().join(format!("pdeffy_lo_pdf_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).map_err(PdfExportError::Io)?;
        let out_path = temp_dir.join(format!("output.{ext}"));

        libreoffice::convert_with_libreoffice_engine(input_path, &out_path, ext).map_err(|e| {
            PdfExportError::Export(format!("LibreOffice: {e}"))
        })?;

        let bytes = std::fs::read(&out_path).map_err(PdfExportError::Io)?;
        let _ = std::fs::remove_dir_all(&temp_dir);

        let file_extension = match format {
            PdfExportFormat::Docx => "docx",
            PdfExportFormat::Pptx => "pptx",
            _ => unreachable!(),
        };

        Ok(ExportOutput {
            bytes,
            file_extension: file_extension.into(),
        })
    }
}
