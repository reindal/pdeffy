//! Legacy AiFunction stub — anonymization now lives in `crate::ai::anonymize`
//! (deterministic structured + NER, not the generative LLM engine).

use crate::ai::engine::ModelEngine;
use crate::ai::error::AiError;
use crate::ai::functions::AiFunction;
use tauri::AppHandle;

pub struct Anonymize;

impl AiFunction for Anonymize {
    fn id(&self) -> &'static str {
        "anonymize"
    }

    fn run(
        &self,
        _text: &str,
        _engine: &ModelEngine,
        _app: &AppHandle,
    ) -> Result<String, AiError> {
        Err(AiError::Message(
            "Use anonymize_pdf / ai::anonymize — not the generative engine.".into(),
        ))
    }
}
