use crate::converters::{
    convert_office_to_pdf as run_conversion, effective_backend_choice, list_available_backends,
    BackendChoice, ConversionResult, OfficeFormat,
};
#[cfg(target_os = "windows")]
use crate::commands::{libreoffice, msoffice};
use crate::commands::settings;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[tauri::command(rename = "convert-office-to-pdf")]
pub async fn convert_office_to_pdf(
    app: AppHandle,
    path: String,
    backend: Option<String>,
) -> Result<ConversionResult, String> {
    let input = PathBuf::from(&path);
    if !input.is_file() {
        return Err(format!("File non trovato: {path}"));
    }

    let format = OfficeFormat::from_path(&input).ok_or_else(|| {
        "Estensione non supportata. Usa .docx, .xlsx o .pptx.".to_string()
    })?;

    let persisted = settings::get_office_pdf_backend(&app)?;
    let choice = effective_backend_choice(Some(&persisted), backend.as_deref());

    run_conversion(&input, format, choice).map_err(|e| e.user_message())
}

#[tauri::command(rename = "list-office-pdf-backends")]
pub fn list_office_pdf_backends() -> serde_json::Value {
    serde_json::json!({
        "backends": list_available_backends(),
        "default": "office2pdf",
    })
}

#[tauri::command(rename = "get-office-pdf-backend")]
pub fn get_office_pdf_backend(app: AppHandle) -> Result<String, String> {
    settings::get_office_pdf_backend(&app)
}

#[tauri::command(rename = "save-office-pdf-backend")]
pub fn save_office_pdf_backend(
    app: AppHandle,
    backend: String,
) -> Result<serde_json::Value, String> {
    settings::save_office_pdf_backend(&app, &backend)?;
    Ok(serde_json::json!({ "success": true }))
}

/// Word/LibreOffice preserve header/footer layout better than the built-in engine.
fn try_word_for_docx_header_footer(
    input_path: &Path,
    output_path: &Path,
    format: OfficeFormat,
    choice: BackendChoice,
) -> Result<Option<(String, Vec<String>)>, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (input_path, output_path, format, choice);
        return Ok(None);
    }

    #[cfg(target_os = "windows")]
    {
        use crate::converters::docx_has_header_or_footer;

        if choice != BackendChoice::Auto || format != OfficeFormat::Docx {
            return Ok(None);
        }
        if !docx_has_header_or_footer(input_path) {
            return Ok(None);
        }
        if libreoffice::is_libreoffice_usable() {
            return Ok(None);
        }
        if !msoffice::is_msoffice_installed() {
            return Ok(None);
        }
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        match msoffice::convert_with_msoffice(input_path, output_path, "pdf", ".docx") {
            Ok(()) => Ok(Some(("microsoft-word".into(), Vec::new()))),
            Err(e) => {
                eprintln!("[Conversion] Word DOCX→PDF (header/footer) failed: {e}");
                Ok(None)
            }
        }
    }
}

/// Used from `convert-file-path` when writing PDF to disk.
pub fn convert_office_file_to_pdf_path(
    app: &AppHandle,
    input_path: &std::path::Path,
    output_path: &std::path::Path,
    backend_override: Option<&str>,
) -> Result<(String, Vec<String>), String> {
    let format = OfficeFormat::from_path(input_path)
        .ok_or_else(|| "Formato Office non supportato.".to_string())?;
    let persisted = settings::get_office_pdf_backend(app)?;
    let choice = effective_backend_choice(Some(&persisted), backend_override);

    if let Some(word_result) = try_word_for_docx_header_footer(input_path, output_path, format, choice)? {
        return Ok(word_result);
    }

    let result = run_conversion(input_path, format, choice).map_err(|e| e.user_message())?;

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(output_path, &result.pdf_bytes).map_err(|e| e.to_string())?;

    Ok((result.backend_used, result.warnings))
}
