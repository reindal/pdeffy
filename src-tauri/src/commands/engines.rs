use super::{ghostscript, libreoffice, msoffice};
use tauri::AppHandle;

#[tauri::command(rename = "check-engines-availability")]
pub fn check_engines_availability(app: AppHandle) -> serde_json::Value {
    serde_json::json!({
        "hasLibreOffice": libreoffice::is_libreoffice_usable(),
        "hasOffice2Pdf": true,
        "hasPdfLayoutExport": true,
        "hasMSOffice": msoffice::is_msoffice_installed(),
        "hasGhostscript": ghostscript::find_ghostscript_path(&app).is_some()
    })
}
