use crate::converters::{
    convert_office_to_pdf as run_conversion, docx_has_graphical_header_footer,
    docx_has_header_or_footer, effective_backend_choice, list_available_backends,
    merge_header_footer_from_template, stamp_graphical_footer_from_template, BackendChoice,
    ConversionResult, OfficeFormat,
};
#[cfg(any(target_os = "windows", target_os = "macos"))]
use crate::commands::msoffice;
use crate::commands::{convert, libreoffice, settings};
use crate::commands::settings::PdfMetadata;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocxPdfBatchJob {
    pub input_path: String,
    pub output_path: String,
}

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
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (input_path, output_path, format, choice);
        return Ok(None);
    }

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        use crate::converters::{docx_has_graphical_header_footer, docx_has_header_or_footer};

        if choice != BackendChoice::Auto || format != OfficeFormat::Docx {
            return Ok(None);
        }
        let needs_word = docx_has_header_or_footer(input_path)
            || docx_has_graphical_header_footer(input_path);
        if !needs_word {
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

fn docx_needs_word_engine(sample: &Path) -> bool {
    docx_has_header_or_footer(sample) || docx_has_graphical_header_footer(sample)
}

/// One silent batch: single Word or LibreOffice process for all DOCX→PDF jobs.
pub fn batch_convert_docx_jobs(
    app: &AppHandle,
    template_path: Option<&Path>,
    jobs: &[(PathBuf, PathBuf)],
) -> Result<(String, Vec<String>), String> {
    if jobs.is_empty() {
        return Ok(("none".into(), Vec::new()));
    }

    for (input, output) in jobs {
        if let Some(parent) = output.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if let Some(tpl) = template_path {
            merge_header_footer_from_template(tpl, input)?;
        }
        if !input.is_file() {
            return Err(format!("File DOCX mancante: {}", input.display()));
        }
    }

    let probe = template_path
        .filter(|p| p.is_file())
        .unwrap_or_else(|| jobs[0].0.as_path());
    let needs_word = docx_needs_word_engine(probe);
    let word_ok = msoffice::is_msoffice_installed();
    let lo_ok = libreoffice::is_libreoffice_usable();

    // macOS: LibreOffice batch (silent) + stamp footer images from template (no Word / no TCC).
    #[cfg(target_os = "macos")]
    let backend_used = if lo_ok {
        libreoffice::batch_convert_docx_to_pdf(jobs)?;
        if docx_has_graphical_header_footer(probe) {
            if let Some(tpl) = template_path {
                let pdfs: Vec<PathBuf> = jobs.iter().map(|(_, o)| o.clone()).collect();
                stamp_graphical_footer_from_template(tpl, &pdfs)?;
            }
        }
        "libreoffice".to_string()
    } else if word_ok {
        msoffice::batch_convert_docx_to_pdf(jobs)?;
        "microsoft-word".to_string()
    } else {
        let persisted = settings::get_office_pdf_backend(app)?;
        let choice = effective_backend_choice(Some(&persisted), None);
        let mut warnings = Vec::new();
        if needs_word && !word_ok && !lo_ok {
            warnings.push(
                "Intestazione/piè di pagina con grafica: installa Microsoft Word o LibreOffice \
                 per un PDF fedele al modello."
                    .into(),
            );
        }
        for (input, output) in jobs {
            let result = run_conversion(input, OfficeFormat::Docx, choice)
                .map_err(|e| e.user_message())?;
            if warnings.is_empty() {
                warnings = result.warnings;
            }
            std::fs::write(output, &result.pdf_bytes).map_err(|e| e.to_string())?;
        }
        return Ok(("office2pdf".into(), warnings));
    };

    #[cfg(not(target_os = "macos"))]
    let backend_used = if needs_word && word_ok {
        msoffice::batch_convert_docx_to_pdf(jobs)?;
        "microsoft-word".to_string()
    } else if lo_ok {
        libreoffice::batch_convert_docx_to_pdf(jobs)?;
        "libreoffice".to_string()
    } else {
        let persisted = settings::get_office_pdf_backend(app)?;
        let choice = effective_backend_choice(Some(&persisted), None);
        let mut warnings = Vec::new();
        if needs_word && !word_ok && !lo_ok {
            warnings.push(
                "Intestazione/piè di pagina con grafica: installa Microsoft Word o LibreOffice \
                 per un PDF fedele al modello."
                    .into(),
            );
        }
        for (input, output) in jobs {
            let result = run_conversion(input, OfficeFormat::Docx, choice)
                .map_err(|e| e.user_message())?;
            if warnings.is_empty() {
                warnings = result.warnings;
            }
            std::fs::write(output, &result.pdf_bytes).map_err(|e| e.to_string())?;
        }
        return Ok(("office2pdf".into(), warnings));
    };

    Ok((backend_used, Vec::new()))
}

#[tauri::command(rename = "batch-convert-docx-to-pdf")]
pub async fn batch_convert_docx_to_pdf(
    app: AppHandle,
    template_path: Option<String>,
    jobs: Vec<DocxPdfBatchJob>,
    metadata: Option<PdfMetadata>,
) -> Result<serde_json::Value, String> {
    let tpl = template_path.as_deref().map(Path::new);
    let pairs: Vec<(PathBuf, PathBuf)> = jobs
        .into_iter()
        .map(|j| (PathBuf::from(j.input_path), PathBuf::from(j.output_path)))
        .collect();

    let (backend_used, warnings) = batch_convert_docx_jobs(&app, tpl, &pairs)?;

    if let Some(meta) = metadata.as_ref() {
        for (_, output) in &pairs {
            convert::apply_metadata(output, "pdf", meta)?;
        }
    }

    Ok(serde_json::json!({
        "success": true,
        "backendUsed": backend_used,
        "warnings": warnings,
        "count": pairs.len(),
    }))
}
