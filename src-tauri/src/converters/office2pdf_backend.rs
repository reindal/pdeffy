use super::{BackendOutput, ConversionError, OfficeFormat, OfficeToPdfConverter};
use office2pdf::config::{ConvertOptions, Format};
use std::fs;
use std::path::Path;

pub struct Office2PdfBackend;

impl Office2PdfBackend {
    pub fn new() -> Self {
        Self
    }
}

impl Default for Office2PdfBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl OfficeToPdfConverter for Office2PdfBackend {
    fn is_available(&self) -> bool {
        true
    }

    fn name(&self) -> &'static str {
        "office2pdf"
    }

    fn alternate_backend(&self) -> Option<&'static str> {
        Some("libreoffice")
    }

    fn convert(
        &self,
        input_path: &Path,
        input_format: OfficeFormat,
    ) -> Result<BackendOutput, ConversionError> {
        let format = match input_format {
            OfficeFormat::Docx => Format::Docx,
            OfficeFormat::Xlsx => Format::Xlsx,
            OfficeFormat::Pptx => Format::Pptx,
        };

        let data = fs::read(input_path).map_err(|e| ConversionError::BackendFailed {
            backend: self.name(),
            message: format!("Impossibile leggere il file: {e}"),
            alternate: self.alternate_backend(),
        })?;

        let result = office2pdf::convert_bytes(&data, format, &ConvertOptions::default())
            .map_err(|e| ConversionError::BackendFailed {
                backend: self.name(),
                message: e.to_string(),
                alternate: self.alternate_backend(),
            })?;

        let warnings = result
            .warnings
            .into_iter()
            .map(|w| w.to_string())
            .collect();

        Ok(BackendOutput {
            pdf_bytes: result.pdf,
            warnings,
        })
    }
}
