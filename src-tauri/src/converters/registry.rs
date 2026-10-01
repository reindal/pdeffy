use super::{
    docx_has_header_or_footer, BackendOutput, ConversionError, LibreOfficeBackend,
    Office2PdfBackend, OfficeFormat, OfficeToPdfConverter,
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

/// In `auto` mode, DOCX with headers/footers use LibreOffice when installed (layout fidelity).
fn resolve_auto_backend(input_path: &Path, format: OfficeFormat) -> BackendChoice {
    if format == OfficeFormat::Docx
        && docx_has_header_or_footer(input_path)
        && libreoffice().is_available()
    {
        BackendChoice::LibreOffice
    } else {
        BackendChoice::Office2Pdf
    }
}

fn backend_by_id(
    id: BackendChoice,
    input_path: &Path,
    format: OfficeFormat,
) -> Result<ActiveBackend, ConversionError> {
    let id = match id {
        BackendChoice::Auto => resolve_auto_backend(input_path, format),
        other => other,
    };
    match id {
        BackendChoice::Office2Pdf => Ok(ActiveBackend::Office2Pdf(office2pdf())),
        BackendChoice::LibreOffice => {
            let b = libreoffice();
            if !b.is_available() {
                return Err(ConversionError::BackendUnavailable(b.name()));
            }
            Ok(ActiveBackend::LibreOffice(b))
        }
        BackendChoice::Auto => Ok(ActiveBackend::Office2Pdf(office2pdf())),
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
    let mut extra_warnings = Vec::new();
    if choice == BackendChoice::Auto
        && format == OfficeFormat::Docx
        && docx_has_header_or_footer(input_path)
        && !libreoffice().is_available()
    {
        extra_warnings.push(
            "Il documento ha intestazione o piè di pagina: installa LibreOffice per un layout \
             più fedele (motore interno attivo)."
                .to_string(),
        );
    }

    let backend = backend_by_id(choice, input_path, format)?;
    let name = backend.as_trait().name();
    let output = backend.as_trait().convert(input_path, format)?;
    Ok(map_output(output, name, extra_warnings))
}

fn map_output(
    output: BackendOutput,
    backend_used: &str,
    mut extra_warnings: Vec<String>,
) -> ConversionResult {
    extra_warnings.extend(output.warnings);
    ConversionResult {
        pdf_bytes: output.pdf_bytes,
        backend_used: backend_used.to_string(),
        warnings: extra_warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_backend_aliases() {
        assert_eq!(
            parse_backend_choice(Some("libreoffice")),
            BackendChoice::LibreOffice
        );
        assert_eq!(parse_backend_choice(Some("auto")), BackendChoice::Auto);
    }
}
