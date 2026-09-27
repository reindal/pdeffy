//! Tauri commands for the local AI layer.

use crate::ai::anonymize::{self, AnonymizeResult};
use crate::ai::config::{self, ModelInfo};
use crate::ai::download;
use crate::ai::error::AiError;
use crate::ai::functions::summarize::Summarize;
use crate::ai::functions::AiFunction;
use crate::ai::pdf_text;
use crate::ai::progress::{emit_progress, AiProgress};
use crate::ai::AiState;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub model_id: String,
    pub display_name: String,
    pub downloaded: bool,
    pub loaded: bool,
    pub downloading: bool,
    pub path: Option<String>,
    pub bytes_on_disk: u64,
    pub size_label: String,
    pub ram_label: String,
    pub params: String,
    pub quant: String,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))
}

#[tauri::command(rename = "list-ai-models")]
pub fn list_ai_models(app: AppHandle) -> Result<Vec<ModelInfo>, String> {
    let data = app_data_dir(&app)?;
    Ok(config::list_models(&app, &data))
}

#[tauri::command(rename = "set-selected-model")]
pub fn set_selected_model(
    app: AppHandle,
    state: State<'_, AiState>,
    model_id: String,
) -> Result<ModelInfo, String> {
    let def = config::set_selected_model_id(&app, &model_id)?;
    let data = app_data_dir(&app)?;
    let path = config::model_path_for(&data, def);

    // Unload if a different file was in memory.
    if let Ok(mut engine) = state.engine.lock() {
        if let Some(loaded) = engine.loaded_path() {
            if loaded != path.as_path() {
                engine.unload(&app);
            }
        }
    }

    let list = config::list_models(&app, &data);
    list.into_iter()
        .find(|m| m.id == def.id)
        .ok_or_else(|| "Selected model missing from catalog".into())
}

#[tauri::command(rename = "get-model-status")]
pub fn get_model_status(app: AppHandle, state: State<'_, AiState>) -> Result<ModelStatus, String> {
    let data = app_data_dir(&app)?;
    let def = config::selected_model(&app);
    let path = config::model_path_for(&data, def);
    let (downloaded, bytes) = config::disk_status(&data, def);
    let loaded = state
        .engine
        .lock()
        .map(|e| e.is_loaded() && e.loaded_path() == Some(path.as_path()))
        .unwrap_or(false);

    Ok(ModelStatus {
        model_id: def.id.to_string(),
        display_name: def.display_name.to_string(),
        downloaded,
        loaded,
        downloading: state.is_downloading(),
        path: downloaded.then(|| path.display().to_string()),
        bytes_on_disk: bytes,
        size_label: def.size_label.to_string(),
        ram_label: def.ram_label.to_string(),
        params: def.params.to_string(),
        quant: def.quant.to_string(),
    })
}

#[tauri::command(rename = "download-model")]
pub async fn download_model(app: AppHandle, model_id: Option<String>) -> Result<(), String> {
    let state = app.state::<AiState>();
    if state.is_downloading() {
        return Err(AiError::Busy.to_frontend());
    }
    state.set_downloading(true);

    let data = match app_data_dir(&app) {
        Ok(d) => d,
        Err(e) => {
            state.set_downloading(false);
            return Err(e);
        }
    };

    let id = model_id.unwrap_or_else(|| config::selected_model_id(&app));
    if let Err(e) = config::set_selected_model_id(&app, &id) {
        state.set_downloading(false);
        return Err(e);
    }
    let def = match config::find_model(&id) {
        Some(d) => d,
        None => {
            state.set_downloading(false);
            return Err(format!("Unknown model id: {id}"));
        }
    };

    let app_bg = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        download::download_model(&app_bg, &data, def)
            .map(|_| ())
            .map_err(AiError::to_frontend)
    })
    .await
    .map_err(|e| format!("download task failed: {e}"))?;

    app.state::<AiState>().set_downloading(false);

    if let Err(ref err) = result {
        emit_progress(
            &app,
            AiProgress::Error {
                message: err.clone(),
            },
        );
    }
    result
}

#[tauri::command(rename = "unload-model")]
pub fn unload_model(app: AppHandle, state: State<'_, AiState>) -> Result<(), String> {
    let mut engine = state
        .engine
        .lock()
        .map_err(|_| AiError::Busy.to_frontend())?;
    engine.unload(&app);
    Ok(())
}

/// Extract PDF text, ensure the local model is loaded, run the summarize function.
#[tauri::command(rename = "summarize-pdf")]
pub async fn summarize_pdf(path: String, app: AppHandle) -> Result<String, String> {
    let data = app_data_dir(&app)?;
    let def = config::selected_model(&app);
    let model_file = config::model_path_for(&data, def);
    if !model_file.is_file() {
        return Err(AiError::ModelNotDownloaded.to_frontend());
    }

    let app_bg = app.clone();
    let data_bg = data.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let pdf_path = Path::new(&path);
        let text = pdf_text::extract_and_normalize(&app_bg, &data_bg, pdf_path)
            .map_err(AiError::to_frontend)?;

        let state = app_bg.state::<AiState>();
        let mut engine = state
            .engine
            .lock()
            .map_err(|_| AiError::Busy.to_frontend())?;
        engine
            .ensure_loaded(&model_file, &app_bg)
            .map_err(AiError::to_frontend)?;

        Summarize
            .run(&text, &engine, &app_bg)
            .map_err(AiError::to_frontend)
    })
    .await
    .map_err(|e| format!("summarize task failed: {e}"))?
}

/// Deterministic anonymization (structured regex + NER stub). No generative LLM.
#[tauri::command(rename = "anonymize-pdf")]
pub async fn anonymize_pdf(path: String, app: AppHandle) -> Result<AnonymizeResult, String> {
    let data = app_data_dir(&app)?;

    let app_bg = app.clone();
    let data_bg = data.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let pdf_path = Path::new(&path);
        anonymize::anonymize_pdf(&app_bg, &data_bg, pdf_path).map_err(AiError::to_frontend)
    })
    .await
    .map_err(|e| format!("anonymize task failed: {e}"))??;

    // Keep decode map in memory for this session only (never write cleartext to disk).
    if let Ok(mut map) = app.state::<AiState>().anonymize_mapping.lock() {
        *map = result.mapping.clone();
    }

    Ok(result)
}

#[tauri::command(rename = "get-ocr-status")]
pub fn get_ocr_status(app: AppHandle, state: State<'_, AiState>) -> Result<crate::ai::ocr::OcrStatus, String> {
    let data = app_data_dir(&app)?;
    Ok(crate::ai::ocr::status(&data, state.is_ocr_downloading()))
}

#[tauri::command(rename = "download-ocr-models")]
pub async fn download_ocr_models(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AiState>();
    if state.is_ocr_downloading() {
        return Err(AiError::Busy.to_frontend());
    }
    state.set_ocr_downloading(true);

    let data = match app_data_dir(&app) {
        Ok(d) => d,
        Err(e) => {
            state.set_ocr_downloading(false);
            return Err(e);
        }
    };

    let app_bg = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::ai::ocr::download_models(&app_bg, &data).map_err(AiError::to_frontend)
    })
    .await
    .map_err(|e| format!("ocr download task failed: {e}"))?;

    app.state::<AiState>().set_ocr_downloading(false);

    if let Err(ref err) = result {
        emit_progress(
            &app,
            AiProgress::Error {
                message: err.clone(),
            },
        );
    }
    result.map(|_| ())
}

#[tauri::command(rename = "get-ner-status")]
pub fn get_ner_status(app: AppHandle, state: State<'_, AiState>) -> Result<crate::ai::anonymize::ner::NerStatus, String> {
    let data = app_data_dir(&app)?;
    Ok(crate::ai::anonymize::ner::status(&data, state.is_ner_downloading()))
}

#[tauri::command(rename = "download-ner-models")]
pub async fn download_ner_models(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AiState>();
    if state.is_ner_downloading() {
        return Err(AiError::Busy.to_frontend());
    }
    state.set_ner_downloading(true);

    let data = match app_data_dir(&app) {
        Ok(d) => d,
        Err(e) => {
            state.set_ner_downloading(false);
            return Err(e);
        }
    };

    let app_bg = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::ai::anonymize::ner::NerEngine::download(&app_bg, &data).map_err(AiError::to_frontend)
    })
    .await
    .map_err(|e| format!("ner download task failed: {e}"))?;

    app.state::<AiState>().set_ner_downloading(false);

    if let Err(ref err) = result {
        emit_progress(
            &app,
            AiProgress::Error {
                message: err.clone(),
            },
        );
    }
    result.map(|_| ())
}

#[tauri::command(rename = "unload-ner-model")]
pub fn unload_ner_model() -> Result<(), String> {
    crate::ai::anonymize::ner::NerEngine::unload_session();
    Ok(())
}
