use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const AI_PROGRESS_EVENT: &str = "ai-progress";

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "phase", rename_all = "camelCase")]
pub enum AiProgress {
    Download {
        downloaded: u64,
        total: Option<u64>,
    },
    Loading,
    Generating {
        tokens: u32,
    },
    Ready,
    Unloaded,
    Error {
        message: String,
    },
}

pub fn emit_progress(app: &AppHandle, progress: AiProgress) {
    let _ = app.emit(AI_PROGRESS_EVENT, progress);
}
