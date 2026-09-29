mod libreoffice_backend;
mod office2pdf_backend;
mod registry;

pub use libreoffice_backend::LibreOfficeBackend;
pub use office2pdf_backend::Office2PdfBackend;
pub use registry::{
    convert_office_to_pdf, effective_backend_choice, list_available_backends, ConversionResult,
};

use std::path::Path;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OfficeFormat {
    Docx,
    Xlsx,
    Pptx,
}

impl OfficeFormat {
    pub fn from_path(path: &Path) -> Option<Self> {
        path.extension()
            .and_then(|e| e.to_str())
            .and_then(|ext| Self::from_extension(ext))
    }

    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_ascii_lowercase().as_str() {
            "docx" => Some(Self::Docx),
            "xlsx" => Some(Self::Xlsx),
            "pptx" => Some(Self::Pptx),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Docx => "docx",
            Self::Xlsx => "xlsx",
            Self::Pptx => "pptx",
        }
    }
}

#[derive(Debug, Clone)]
pub struct BackendOutput {
    pub pdf_bytes: Vec<u8>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Error)]
pub enum ConversionError {
    #[error("Formato non supportato per la conversione Office→PDF")]
    #[allow(dead_code)]
    UnsupportedFormat,

    #[error("Il motore \"{0}\" non è disponibile su questo sistema")]
    BackendUnavailable(&'static str),

    #[error("Conversione fallita con {backend}: {message}")]
    BackendFailed {
        backend: &'static str,
        message: String,
        alternate: Option<&'static str>,
    },
}

impl ConversionError {
    pub fn user_message(&self) -> String {
        match self {
            Self::UnsupportedFormat => self.to_string(),
            Self::BackendUnavailable(_) => self.to_string(),
            Self::BackendFailed {
                backend,
                message,
                alternate,
            } => {
                let mut text = format!("Conversione fallita con {backend}: {message}");
                if let Some(alt) = alternate {
                    text.push_str(&format!(
                        " Puoi riprovare con il motore \"{alt}\" (qualità/layout possono differire)."
                    ));
                }
                text
            }
        }
    }
}

/// Common interface for Office → PDF engines (no silent cross-backend fallback).
pub trait OfficeToPdfConverter {
    fn is_available(&self) -> bool;
    fn convert(
        &self,
        input_path: &Path,
        input_format: OfficeFormat,
    ) -> Result<BackendOutput, ConversionError>;
    fn name(&self) -> &'static str;
    /// Shown when this backend fails and the other may work.
    fn alternate_backend(&self) -> Option<&'static str> {
        None
    }
}
