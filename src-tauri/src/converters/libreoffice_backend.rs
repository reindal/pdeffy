use super::{BackendOutput, ConversionError, OfficeFormat, OfficeToPdfConverter};
use crate::commands::libreoffice;
use std::fs;
use std::path::{Path, PathBuf};

pub struct LibreOfficeBackend;

impl LibreOfficeBackend {
    pub fn new() -> Self {
        Self
    }
}

impl Default for LibreOfficeBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl OfficeToPdfConverter for LibreOfficeBackend {
    fn is_available(&self) -> bool {
        libreoffice::is_libreoffice_installed()
    }

    fn name(&self) -> &'static str {
        "libreoffice"
    }

    fn alternate_backend(&self) -> Option<&'static str> {
        Some("office2pdf")
    }

    fn convert(
        &self,
        input_path: &Path,
        input_format: OfficeFormat,
    ) -> Result<BackendOutput, ConversionError> {
        if !self.is_available() {
            return Err(ConversionError::BackendUnavailable(self.name()));
        }

        let output_path = temp_pdf_output_path(input_path, input_format)?;
        let output_dir = output_path
            .parent()
            .ok_or(ConversionError::BackendFailed {
                backend: self.name(),
                message: "Percorso di output temporaneo non valido.".into(),
                alternate: self.alternate_backend(),
            })?;

        libreoffice::convert_with_libreoffice_engine(input_path, &output_path, "pdf").map_err(
            |message| ConversionError::BackendFailed {
                backend: self.name(),
                message,
                alternate: self.alternate_backend(),
            },
        )?;

        let pdf_bytes = fs::read(&output_path).map_err(|e| ConversionError::BackendFailed {
            backend: self.name(),
            message: format!("PDF generato ma non leggibile: {e}"),
            alternate: self.alternate_backend(),
        })?;
        let _ = fs::remove_file(&output_path);
        let _ = fs::remove_dir_all(output_dir);

        Ok(BackendOutput {
            pdf_bytes,
            warnings: Vec::new(),
        })
    }
}

fn temp_pdf_output_path(input_path: &Path, format: OfficeFormat) -> Result<PathBuf, ConversionError> {
    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let dir = std::env::temp_dir().join(format!(
        "pdeffy_lo_{}_{}",
        format.as_str(),
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&dir).map_err(|e| ConversionError::BackendFailed {
        backend: "libreoffice",
        message: format!("Impossibile creare directory temporanea: {e}"),
        alternate: Some("office2pdf"),
    })?;
    Ok(dir.join(format!("{stem}.pdf")))
}
