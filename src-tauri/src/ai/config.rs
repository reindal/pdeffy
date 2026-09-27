//! Catalog of supported local GGUF models and selection helpers.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Soft character budget for extracted PDF text fed into the prompt.
/// Kept modest so tokenized prompts fit a 4k context with room for the summary.
pub const MAX_INPUT_CHARS: usize = 6_000;

/// Max new tokens to generate for a summary.
pub const N_PREDICT: i32 = 512;

/// Sampling temperature.
pub const TEMPERATURE: f32 = 0.3;

/// Default selected model when none is stored.
pub const DEFAULT_MODEL_ID: &str = "phi-4-mini-instruct-Q4_K_M";

/// Static catalog entry (download + UI metadata).
#[derive(Debug, Clone, Copy)]
pub struct ModelDef {
    pub id: &'static str,
    pub display_name: &'static str,
    pub filename: &'static str,
    pub url: &'static str,
    pub expected_bytes: u64,
    /// Approximate parameter count, e.g. "3.8B".
    pub params: &'static str,
    /// Quantization label, e.g. "Q4_K_M".
    pub quant: &'static str,
    /// Human size label for UI, e.g. "~2.5 GB".
    pub size_label: &'static str,
    /// Suggested RAM for comfortable use.
    pub ram_label: &'static str,
    /// Context window used when loading.
    pub n_ctx: u32,
    /// Relative speed tier: fast | balanced | quality.
    pub speed: &'static str,
    /// Short language / capability note (English; UI may translate via i18n keys).
    pub languages: &'static str,
    /// One-line English summary of strengths.
    pub summary: &'static str,
    /// Recommended use case tag: light | recommended | quality.
    pub tier: &'static str,
}

/// Frontend-facing model info (includes disk / selection state).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub display_name: String,
    pub filename: String,
    pub params: String,
    pub quant: String,
    pub size_label: String,
    pub ram_label: String,
    pub n_ctx: u32,
    pub speed: String,
    pub languages: String,
    pub summary: String,
    pub tier: String,
    pub expected_bytes: u64,
    pub downloaded: bool,
    pub bytes_on_disk: u64,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AiSettingsFile {
    #[serde(default)]
    selected_model_id: Option<String>,
}

/// Supported models (order = UI order).
pub const MODELS: &[ModelDef] = &[
    ModelDef {
        id: "qwen2.5-1.5b-instruct-Q4_K_M",
        display_name: "Qwen2.5 1.5B Instruct",
        filename: "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
        url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
        expected_bytes: 1_120_000_000,
        params: "1.5B",
        quant: "Q4_K_M",
        size_label: "~1.0 GB",
        ram_label: "~2 GB",
        n_ctx: 4096,
        speed: "fast",
        languages: "Strong multilingual (incl. IT/EN/ES/PL)",
        summary: "Smallest option — fastest on modest hardware, good for short PDFs.",
        tier: "light",
    },
    ModelDef {
        id: "phi-4-mini-instruct-Q4_K_M",
        display_name: "Phi-4 mini Instruct",
        filename: "Phi-4-mini-instruct-Q4_K_M.gguf",
        url: "https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf",
        expected_bytes: 2_500_000_000,
        params: "3.8B",
        quant: "Q4_K_M",
        size_label: "~2.5 GB",
        ram_label: "~4 GB",
        n_ctx: 4096,
        speed: "balanced",
        languages: "Multilingual, strong reasoning for its size",
        summary: "Recommended default — solid summaries with a balanced size/quality trade-off.",
        tier: "recommended",
    },
    ModelDef {
        id: "llama-3.2-3b-instruct-Q4_K_M",
        display_name: "Llama 3.2 3B Instruct",
        filename: "llama-3.2-3b-instruct-q4_k_m.gguf",
        url: "https://huggingface.co/hugging-quants/Llama-3.2-3B-Instruct-Q4_K_M-GGUF/resolve/main/llama-3.2-3b-instruct-q4_k_m.gguf",
        expected_bytes: 2_020_000_000,
        params: "3B",
        quant: "Q4_K_M",
        size_label: "~2.0 GB",
        ram_label: "~3.5 GB",
        n_ctx: 4096,
        speed: "balanced",
        languages: "Strong English; solid general instruction following",
        summary: "Alternative mid-size model — clear prose, good for English-heavy documents.",
        tier: "quality",
    },
];

pub fn models_dir(app_data: &Path) -> PathBuf {
    app_data.join("models")
}

pub fn find_model(id: &str) -> Option<&'static ModelDef> {
    MODELS.iter().find(|m| m.id == id)
}

pub fn model_path_for(app_data: &Path, def: &ModelDef) -> PathBuf {
    models_dir(app_data).join(def.filename)
}

pub fn model_partial_path_for(app_data: &Path, def: &ModelDef) -> PathBuf {
    models_dir(app_data).join(format!("{}.partial", def.filename))
}

fn ai_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create app data dir: {e}"))?;
    Ok(dir.join("ai-settings.json"))
}

fn read_ai_settings(app: &AppHandle) -> AiSettingsFile {
    let Ok(path) = ai_settings_path(app) else {
        return AiSettingsFile::default();
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return AiSettingsFile::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn write_ai_settings(app: &AppHandle, settings: &AiSettingsFile) -> Result<(), String> {
    let path = ai_settings_path(app)?;
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("JSON serialize error: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

/// Currently selected model id (falls back to default if missing/unknown).
pub fn selected_model_id(app: &AppHandle) -> String {
    let stored = read_ai_settings(app).selected_model_id;
    match stored {
        Some(id) if find_model(&id).is_some() => id,
        _ => DEFAULT_MODEL_ID.to_string(),
    }
}

pub fn selected_model(app: &AppHandle) -> &'static ModelDef {
    let id = selected_model_id(app);
    find_model(&id).unwrap_or_else(|| find_model(DEFAULT_MODEL_ID).expect("default model"))
}

pub fn set_selected_model_id(app: &AppHandle, id: &str) -> Result<&'static ModelDef, String> {
    let def = find_model(id).ok_or_else(|| format!("Unknown model id: {id}"))?;
    let mut settings = read_ai_settings(app);
    settings.selected_model_id = Some(def.id.to_string());
    write_ai_settings(app, &settings)?;
    Ok(def)
}

pub fn disk_status(app_data: &Path, def: &ModelDef) -> (bool, u64) {
    let path = model_path_for(app_data, def);
    let bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let downloaded = path.is_file() && bytes > 1_000_000;
    (downloaded, bytes)
}

pub fn list_models(app: &AppHandle, app_data: &Path) -> Vec<ModelInfo> {
    let selected = selected_model_id(app);
    MODELS
        .iter()
        .map(|def| {
            let (downloaded, bytes_on_disk) = disk_status(app_data, def);
            ModelInfo {
                id: def.id.to_string(),
                display_name: def.display_name.to_string(),
                filename: def.filename.to_string(),
                params: def.params.to_string(),
                quant: def.quant.to_string(),
                size_label: def.size_label.to_string(),
                ram_label: def.ram_label.to_string(),
                n_ctx: def.n_ctx,
                speed: def.speed.to_string(),
                languages: def.languages.to_string(),
                summary: def.summary.to_string(),
                tier: def.tier.to_string(),
                expected_bytes: def.expected_bytes,
                downloaded,
                bytes_on_disk,
                selected: def.id == selected,
            }
        })
        .collect()
}
