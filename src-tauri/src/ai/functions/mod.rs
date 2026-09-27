pub mod anonymize;
pub mod summarize;

use crate::ai::engine::ModelEngine;
use crate::ai::error::AiError;
use tauri::AppHandle;

/// Modular AI function: receives extracted text + engine, returns typed result.
pub trait AiFunction: Send + Sync {
    #[allow(dead_code)]
    fn id(&self) -> &'static str;
    fn run(
        &self,
        text: &str,
        engine: &ModelEngine,
        app: &AppHandle,
    ) -> Result<String, AiError>;
}
