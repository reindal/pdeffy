use super::{
    BackendOutput, ConversionError, LibreOfficeBackend, Office2PdfBackend, OfficeFormat,
    OfficeToPdfConverter,
};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackendChoice {
    Auto,
    Office2Pdf,
    LibreOffice,
}

fn parse_backend_choice(raw: Option<&str>) -> BackendChoice {
    match raw.unwrap_or("auto").trim().to_ascii_lowercase().as_str() {
        "libreoffice" | "lo" => BackendChoice::LibreOffice,
        "office2pdf" | "typst" | "rust" => BackendChoice::Office2Pdf,
        _ => BackendChoice::Auto,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionResult {
    pub pdf_bytes: Vec<u8>,
    pub backend_used: String,
    pub warnings: Vec<String>,
}

fn office2pdf() -> Office2PdfBackend {
    Office2PdfBackend::new()
}

fn libreoffice() -> LibreOfficeBackend {
    LibreOfficeBackend::new()
}

enum ActiveBackend {
    Office2Pdf(Office2PdfBackend),
    LibreOffice(LibreOfficeBackend),
}

impl ActiveBackend {
    fn as_trait(&self) -> &dyn OfficeToPdfConverter {
        match self {
            Self::Office2Pdf(b) => b,
            Self::LibreOffice(b) => b,
        }
    }
}

fn backend_by_id(id: BackendChoice) -> Result<ActiveBackend, ConversionError> {
    match id {
        BackendChoice::Office2Pdf | BackendChoice::Auto => Ok(ActiveBackend::Office2Pdf(
            office2pdf(),
        )),
        BackendChoice::LibreOffice => {
            let b = libreoffice();
            if !b.is_available() {
                return Err(ConversionError::BackendUnavailable(b.name()));
            }
            Ok(ActiveBackend::LibreOffice(b))
        }
    }
}

/// Effective backend from persisted preference + optional per-call override.
pub fn effective_backend_choice(
    persisted: Option<&str>,
    per_call: Option<&str>,
) -> BackendChoice {
    if let Some(override_choice) = per_call {
        return parse_backend_choice(Some(override_choice));
    }
    parse_backend_choice(persisted)
}

pub fn list_available_backends() -> Vec<&'static str> {
    let mut names = vec![office2pdf().name()];
    if libreoffice().is_available() {
        names.push(libreoffice().name());
    }
    names
}

/// Convert using exactly one backend — no automatic fallback.
pub fn convert_office_to_pdf(
    input_path: &Path,
    format: OfficeFormat,
    choice: BackendChoice,
) -> Result<ConversionResult, ConversionError> {
    let backend = backend_by_id(choice)?;
    let name = backend.as_trait().name();
    let output = backend.as_trait().convert(input_path, format)?;
    Ok(map_output(output, name))
}

fn map_output(output: BackendOutput, backend_used: &str) -> ConversionResult {
    ConversionResult {
        pdf_bytes: output.pdf_bytes,
        backend_used: backend_used.to_string(),
        warnings: output.warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_defaults_to_office2pdf_id() {
        assert!(BackendChoice::Auto.resolves_to_office2pdf());
    }

    #[test]
    fn parse_backend_aliases() {
        assert_eq!(
            parse_backend_choice(Some("libreoffice")),
            BackendChoice::LibreOffice
        );
        assert_eq!(parse_backend_choice(Some("auto")), BackendChoice::Auto);
    }
}
