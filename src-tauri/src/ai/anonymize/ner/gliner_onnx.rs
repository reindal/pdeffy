//! ONNX Runtime session cache for GLiNER.

use super::chunking::ChunkEntity;
use super::gliner_infer::GlinerRuntime;
use crate::ai::error::AiError;
use std::path::Path;
use std::sync::Mutex;

static RUNTIME: Mutex<Option<GlinerRuntime>> = Mutex::new(None);

pub struct GlinerOnnx;

impl GlinerOnnx {
    pub fn is_pack_complete(pack_dir: &Path) -> bool {
        super::gliner_infer::is_pack_complete(pack_dir)
    }

    pub fn ensure_cached(pack_dir: &Path) -> Result<(), AiError> {
        let mut guard = RUNTIME.lock().map_err(|_| AiError::Busy)?;
        if guard.is_some() {
            return Ok(());
        }
        if !Self::is_pack_complete(pack_dir) {
            return Err(AiError::NerNotDownloaded);
        }
        *guard = Some(GlinerRuntime::load(pack_dir)?);
        Ok(())
    }

    pub fn unload() {
        if let Ok(mut guard) = RUNTIME.lock() {
            *guard = None;
        }
    }

    pub fn is_loaded() -> bool {
        RUNTIME
            .lock()
            .map(|g| g.is_some())
            .unwrap_or(false)
    }

    pub fn predict_chunk(
        chunk_text: &str,
        labels: &[&str],
        threshold: f32,
    ) -> Result<Vec<ChunkEntity>, AiError> {
        let mut guard = RUNTIME.lock().map_err(|_| AiError::Busy)?;
        let Some(rt) = guard.as_mut() else {
            return Err(AiError::NerNotDownloaded);
        };
        rt.predict(chunk_text, labels, threshold)
    }
}
