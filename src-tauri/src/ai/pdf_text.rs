use crate::ai::config::MAX_INPUT_CHARS;
use crate::ai::error::AiError;
use crate::ai::{ocr, progress::{emit_progress, AiProgress}};
use regex::Regex;
use std::path::Path;
use std::sync::OnceLock;
use tauri::AppHandle;

/// Extract text from a PDF and normalize whitespace / control chars.
///
/// If the PDF has no embedded text and RapidOCR is installed, pages are
/// rasterized (Ghostscript) and OCR'd automatically.
pub fn extract_and_normalize(app: &AppHandle, app_data: &Path, path: &Path) -> Result<String, AiError> {
    if !path.is_file() {
        return Err(AiError::PdfUnreadable(format!(
            "File not found: {}",
            path.display()
        )));
    }

    let raw = super::pdf_extract_safe::extract_text(path)?;

    let cleaned = normalize_text(&raw);
    if !cleaned.trim().is_empty() {
        return Ok(cleaned);
    }

    // Scanned / image-only PDF → RapidOCR fallback when the pack is present.
    if ocr::is_downloaded(app_data) {
        emit_progress(app, AiProgress::Loading);
        let ocr_text = ocr::extract_text_from_scanned_pdf(app, app_data, path)?;
        let cleaned = normalize_text(&ocr_text);
        if cleaned.trim().is_empty() {
            return Err(AiError::PdfNoText);
        }
        return Ok(cleaned);
    }

    Err(AiError::OcrNotDownloaded)
}

/// Collapse whitespace, strip NULs / form-feeds, keep paragraph breaks.
pub fn normalize_text(input: &str) -> String {
    static CTRL: OnceLock<Regex> = OnceLock::new();
    static SPACE: OnceLock<Regex> = OnceLock::new();
    static BLANK: OnceLock<Regex> = OnceLock::new();

    let ctrl = CTRL.get_or_init(|| Regex::new(r"[\u0000-\u0008\u000B\u000C\u000E-\u001F]").unwrap());
    let space = SPACE.get_or_init(|| Regex::new(r"[ \t]+").unwrap());
    let blank = BLANK.get_or_init(|| Regex::new(r"\n{3,}").unwrap());

    let mut s = ctrl.replace_all(input, "").into_owned();
    s = s.replace('\r', "\n");
    s = space.replace_all(&s, " ").into_owned();
    s = blank.replace_all(&s, "\n\n").into_owned();
    s.trim().to_string()
}

/// Truncate to a soft char budget; returns (text, truncated).
pub fn truncate_for_prompt(text: &str) -> (String, bool) {
    if text.chars().count() <= MAX_INPUT_CHARS {
        return (text.to_string(), false);
    }
    let truncated: String = text.chars().take(MAX_INPUT_CHARS).collect();
    (format!("{truncated}\n\n[…truncated…]"), true)
}
