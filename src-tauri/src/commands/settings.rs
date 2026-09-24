use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PdfMetadata {
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub company: String,
    /// Kept for per-document custom overrides / older settings files.
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub subject: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LanguageSettings {
    language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FirstLaunchMarker {
    completed_at: String,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))
}

fn settings_path(app: &AppHandle, filename: &str) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {e}"))?;
    Ok(dir.join(filename))
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Option<T> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_json_file<T: Serialize>(path: &PathBuf, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {e}"))?;
    }
    let content =
        serde_json::to_string_pretty(value).map_err(|e| format!("JSON serialize error: {e}"))?;
    fs::write(path, content).map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

#[tauri::command(rename = "get-pdf-metadata")]
pub fn get_pdf_metadata(app: AppHandle) -> Result<PdfMetadata, String> {
    let path = settings_path(&app, "pdf-settings.json")?;
    if path.exists() {
        if let Some(metadata) = read_json_file::<PdfMetadata>(&path) {
            return Ok(metadata);
        }
    }
    Ok(PdfMetadata::default())
}

#[tauri::command(rename = "save-pdf-metadata")]
pub fn save_pdf_metadata(app: AppHandle, metadata: PdfMetadata) -> Result<serde_json::Value, String> {
    let settings = PdfMetadata {
        author: metadata.author,
        company: metadata.company,
        title: metadata.title,
        subject: metadata.subject,
    };
    let path = settings_path(&app, "pdf-settings.json")?;
    write_json_file(&path, &settings)?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command(rename = "get-language")]
pub fn get_language(app: AppHandle) -> Result<String, String> {
    let path = settings_path(&app, "language-settings.json")?;
    if path.exists() {
        if let Some(data) = read_json_file::<LanguageSettings>(&path) {
            return Ok(data.language);
        }
    }
    Ok("en".to_string())
}

#[tauri::command(rename = "save-language")]
pub fn save_language(app: AppHandle, language: String) -> Result<serde_json::Value, String> {
    let path = settings_path(&app, "language-settings.json")?;
    write_json_file(&path, &LanguageSettings { language })?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command(rename = "check-first-launch")]
pub fn check_first_launch(app: AppHandle) -> Result<bool, String> {
    let path = settings_path(&app, "first-launch-complete.json")?;
    if path.exists() {
        return Ok(false);
    }

    let marker = FirstLaunchMarker {
        completed_at: chrono::Utc::now().to_rfc3339(),
    };
    if write_json_file(&path, &marker).is_err() {
        return Ok(false);
    }
    Ok(true)
}

#[tauri::command(rename = "get-warning-settings")]
pub fn get_warning_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    let path = settings_path(&app, "warnings-settings.json")?;
    if path.exists() {
        if let Some(value) = read_json_file::<serde_json::Value>(&path) {
            return Ok(value);
        }
    }
    Ok(serde_json::json!({}))
}

#[tauri::command(rename = "save-warning-settings")]
pub fn save_warning_settings(
    app: AppHandle,
    #[allow(non_snake_case)] featureId: String,
) -> Result<serde_json::Value, String> {
    let path = settings_path(&app, "warnings-settings.json")?;
    let mut settings: serde_json::Map<String, serde_json::Value> = if path.exists() {
        read_json_file(&path).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };
    settings.insert(featureId, serde_json::Value::Bool(true));
    write_json_file(&path, &settings)?;
    Ok(serde_json::json!({ "success": true }))
}
