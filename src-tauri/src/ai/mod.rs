//! Local on-device AI layer (llama.cpp in-process).
//!
//! Functions (summarize, anonymize, …) live under `functions/` and share the
//! model engine without touching load/unload/download logic.
//!
//! Deterministic anonymization (regex + NER) lives in `anonymize/` and does
//! **not** use the generative LLM engine.

pub mod anonymize;
pub mod config;
pub mod download;
pub mod engine;
pub mod error;
pub mod functions;
pub mod ocr;
pub mod pdf_text;
pub mod progress;

pub use engine::ModelEngine;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// Shared Tauri state for the local AI runtime.
pub struct AiState {
    pub engine: Mutex<ModelEngine>,
    pub downloading: AtomicBool,
    pub ocr_downloading: AtomicBool,
    pub ner_downloading: AtomicBool,
    /// Last anonymize session mapping (placeholder → original). In-memory only.
    pub anonymize_mapping: Mutex<HashMap<String, String>>,
}

impl Default for AiState {
    fn default() -> Self {
        Self {
            engine: Mutex::new(ModelEngine::default()),
            downloading: AtomicBool::new(false),
            ocr_downloading: AtomicBool::new(false),
            ner_downloading: AtomicBool::new(false),
            anonymize_mapping: Mutex::new(HashMap::new()),
        }
    }
}

impl AiState {
    pub fn is_downloading(&self) -> bool {
        self.downloading.load(Ordering::SeqCst)
    }

    pub fn set_downloading(&self, value: bool) {
        self.downloading.store(value, Ordering::SeqCst);
    }

    pub fn is_ocr_downloading(&self) -> bool {
        self.ocr_downloading.load(Ordering::SeqCst)
    }

    pub fn set_ocr_downloading(&self, value: bool) {
        self.ocr_downloading.store(value, Ordering::SeqCst);
    }

    pub fn is_ner_downloading(&self) -> bool {
        self.ner_downloading.load(Ordering::SeqCst)
    }

    pub fn set_ner_downloading(&self, value: bool) {
        self.ner_downloading.store(value, Ordering::SeqCst);
    }
}
