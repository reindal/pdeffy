//! Stage-2 NER via GLiNER + ONNX Runtime (separate from the generative LLM).

mod chunking;
mod config;
mod download;
mod gliner_infer;
mod gliner_onnx;

use chunking::{chunk_text, dedupe_global_entities, globalize_chunk_entities, GlobalEntity};
use config::NER_PACK_SIZE_LABEL;
use crate::ai::anonymize::types::TextSpan;
use crate::ai::error::AiError;
use crate::ai::progress::{emit_progress, AiProgress};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NerStatus {
    pub pack_id: String,
    pub downloaded: bool,
    pub loaded: bool,
    pub downloading: bool,
    pub path: Option<String>,
    pub size_label: String,
    pub detail: String,
}

pub fn status(app_data: &Path, downloading: bool) -> NerStatus {
    let downloaded = is_downloaded(app_data);
    let dir = ner_pack_dir(app_data);
    NerStatus {
        pack_id: NER_PACK_ID.to_string(),
        downloaded,
        loaded: NerEngine::session_loaded(),
        downloading,
        path: downloaded.then(|| dir.display().to_string()),
        size_label: NER_PACK_SIZE_LABEL.to_string(),
        detail: if downloaded {
            "GLiNER pack ready for name/org/address detection.".into()
        } else {
            "Download the GLiNER pack for person, organization and address detection.".into()
        },
    }
}

pub use config::NER_PACK_ID;
pub use download::{download_pack, is_downloaded, ner_pack_dir};

/// NER spans lose to structured recognizers on overlap (`merge.rs`).
pub const NER_PRIORITY: u8 = 10;

/// When `true`, missing pack → `AiError::NerNotDownloaded` (no silent skip).
const REQUIRE_MODEL: bool = false;

const SCORE_THRESHOLD: f32 = 0.33;

/// Zero-shot GLiNER labels (extend here for new categories).
pub fn default_labels() -> &'static [&'static str] {
    &["person", "organization", "address"]
}

fn label_to_entity_type(label: &str) -> String {
    match label.trim().to_lowercase().as_str() {
        "person" | "per" | "nome" | "name" => "NOME".into(),
        "organization" | "org" | "company" | "organizzazione" => "ORGANIZZAZIONE".into(),
        "address" | "loc" | "location" | "indirizzo" => "INDIRIZZO".into(),
        other => other.to_uppercase().replace(' ', "_"),
    }
}

fn entities_to_spans(text: &str, entities: Vec<GlobalEntity>) -> Vec<TextSpan> {
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    for ent in entities {
        if ent.end > bytes.len() || ent.start >= ent.end {
            continue;
        }
        if !text.is_char_boundary(ent.start) || !text.is_char_boundary(ent.end) {
            continue;
        }
        let value = text[ent.start..ent.end].to_string();
        if value.trim().is_empty() {
            continue;
        }
        out.push(TextSpan {
            entity_type: label_to_entity_type(&ent.label),
            start: ent.start,
            end: ent.end,
            value,
            priority: NER_PRIORITY,
        });
    }
    out
}

pub struct NerEngine;

impl NerEngine {
    pub fn pack_dir(app_data: &Path) -> PathBuf {
        ner_pack_dir(app_data)
    }

    pub fn is_downloaded(app_data: &Path) -> bool {
        is_downloaded(app_data)
    }

    pub fn ensure(app: &AppHandle, app_data: &Path) -> Result<Self, AiError> {
        if REQUIRE_MODEL && !Self::is_downloaded(app_data) {
            return Err(AiError::NerNotDownloaded);
        }
        if Self::is_downloaded(app_data) {
            emit_progress(app, AiProgress::Loading);
            gliner_onnx::GlinerOnnx::ensure_cached(&Self::pack_dir(app_data))?;
        }
        Ok(Self)
    }

    pub fn unload_session() {
        gliner_onnx::GlinerOnnx::unload();
    }

    pub fn session_loaded() -> bool {
        gliner_onnx::GlinerOnnx::is_loaded()
    }

    /// Run GLiNER over full document text (with chunking).
    pub fn find(&mut self, _app: &AppHandle, text: &str) -> Result<Vec<TextSpan>, AiError> {
        if !gliner_onnx::GlinerOnnx::is_loaded() {
            if REQUIRE_MODEL {
                return Err(AiError::NerNotDownloaded);
            }
            return Ok(Vec::new());
        }

        let labels = default_labels();
        let mut global: Vec<GlobalEntity> = Vec::new();

        for chunk in chunk_text(text) {
            let local = gliner_onnx::GlinerOnnx::predict_chunk(chunk.text, labels, SCORE_THRESHOLD)?;
            global.extend(globalize_chunk_entities(chunk, local));
        }

        let deduped = dedupe_global_entities(global);
        Ok(entities_to_spans(text, deduped))
    }

    pub fn download(app: &AppHandle, app_data: &Path) -> Result<PathBuf, AiError> {
        download_pack(app, app_data)
    }
}
