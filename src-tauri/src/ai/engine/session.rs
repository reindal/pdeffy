use crate::ai::config::{N_PREDICT, TEMPERATURE};
use crate::ai::error::AiError;
use crate::ai::progress::{emit_progress, AiProgress};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;
use std::num::NonZeroU32;
use std::path::{Path, PathBuf};
use std::pin::pin;
use tauri::AppHandle;

/// In-session cache for the loaded GGUF model (backend + weights).
///
/// Context is created per `generate` call to avoid self-referential lifetimes.
pub struct ModelEngine {
    backend: Option<LlamaBackend>,
    model: Option<LlamaModel>,
    loaded_path: Option<PathBuf>,
}

impl Default for ModelEngine {
    fn default() -> Self {
        Self {
            backend: None,
            model: None,
            loaded_path: None,
        }
    }
}

impl ModelEngine {
    pub fn is_loaded(&self) -> bool {
        self.model.is_some()
    }

    pub fn loaded_path(&self) -> Option<&Path> {
        self.loaded_path.as_deref()
    }

    /// Load model from disk if not already in memory.
    pub fn ensure_loaded(&mut self, model_path: &Path, app: &AppHandle) -> Result<(), AiError> {
        if self.model.is_some() && self.loaded_path.as_deref() == Some(model_path) {
            return Ok(());
        }

        if !model_path.is_file() {
            return Err(AiError::ModelNotDownloaded);
        }

        emit_progress(app, AiProgress::Loading);

        if self.backend.is_none() {
            let backend = LlamaBackend::init().map_err(|e| {
                AiError::ModelLoad(format!("LlamaBackend::init failed: {e}"))
            })?;
            self.backend = Some(backend);
        }

        self.model = None;
        self.loaded_path = None;

        let model_params = {
            #[cfg(any(feature = "ai-metal", feature = "ai-cuda", feature = "ai-vulkan"))]
            {
                LlamaModelParams::default().with_n_gpu_layers(999)
            }
            #[cfg(not(any(feature = "ai-metal", feature = "ai-cuda", feature = "ai-vulkan")))]
            {
                LlamaModelParams::default()
            }
        };

        let model_params = pin!(model_params);
        let backend = self.backend.as_ref().expect("backend just set");

        let model =
            LlamaModel::load_from_file(backend, model_path, &model_params).map_err(|e| {
                let msg = e.to_string();
                if msg.to_lowercase().contains("memory") || msg.to_lowercase().contains("alloc") {
                    AiError::OutOfMemory(msg)
                } else {
                    AiError::ModelLoad(msg)
                }
            })?;

        self.model = Some(model);
        self.loaded_path = Some(model_path.to_path_buf());
        emit_progress(app, AiProgress::Ready);
        Ok(())
    }

    /// Free model weights from RAM (backend stays initialized).
    pub fn unload(&mut self, app: &AppHandle) {
        self.model = None;
        self.loaded_path = None;
        emit_progress(app, AiProgress::Unloaded);
    }

    /// Run a completion for `prompt`, emitting token progress.
    pub fn generate(
        &self,
        prompt: &str,
        app: &AppHandle,
        max_tokens: Option<i32>,
    ) -> Result<String, AiError> {
        let model = self.model.as_ref().ok_or(AiError::ModelMissing)?;
        let backend = self
            .backend
            .as_ref()
            .ok_or_else(|| AiError::ModelLoad("backend not initialized".into()))?;

        let n_predict = max_tokens.unwrap_or(N_PREDICT);
        let n_ctx = NonZeroU32::new(4096).unwrap();

        let ctx_params = LlamaContextParams::default().with_n_ctx(Some(n_ctx));
        let mut ctx = model
            .new_context(backend, ctx_params)
            .map_err(|e| AiError::Inference(format!("new_context: {e}")))?;

        let tokens_list = model
            .str_to_token(prompt, AddBos::Always)
            .map_err(|e| AiError::Inference(format!("tokenize: {e}")))?;

        let n_ctx_i = ctx.n_ctx() as i32;
        // Leave room for the completion.
        let max_prompt_tokens = (n_ctx_i - n_predict).max(64) as usize;
        let tokens_list = if tokens_list.len() > max_prompt_tokens {
            tokens_list[..max_prompt_tokens].to_vec()
        } else {
            tokens_list
        };

        if tokens_list.is_empty() {
            return Err(AiError::Inference("empty token list for prompt".into()));
        }

        // Decode the prompt in chunks — LlamaBatch capacity is fixed at creation.
        const BATCH_CAPACITY: usize = 512;
        let mut batch = LlamaBatch::new(BATCH_CAPACITY, 1);
        let total = tokens_list.len();
        let mut processed = 0usize;

        while processed < total {
            batch.clear();
            let end = (processed + BATCH_CAPACITY).min(total);
            for i in processed..end {
                let is_last = i + 1 == total;
                batch
                    .add(tokens_list[i], i as i32, &[0], is_last)
                    .map_err(|e| AiError::Inference(format!("batch.add: {e}")))?;
            }
            ctx.decode(&mut batch)
                .map_err(|e| AiError::Inference(format!("decode prompt: {e}")))?;
            processed = end;
        }
        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::temp(TEMPERATURE),
            LlamaSampler::dist(42),
            LlamaSampler::greedy(),
        ]);

        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let mut output = String::new();
        // Position in the KV cache = full prompt length (not last-chunk size).
        let mut n_cur = total as i32;
        let mut n_decode: u32 = 0;
        let n_len = n_cur + n_predict;

        while n_cur <= n_len {
            let token = sampler.sample(&ctx, batch.n_tokens() - 1);
            sampler.accept(token);

            if model.is_eog_token(token) {
                break;
            }

            let chunk = model
                .token_to_piece(token, &mut decoder, true, None)
                .map_err(|e| AiError::Inference(format!("token_to_piece: {e}")))?;
            output.push_str(&chunk);

            n_decode += 1;
            if n_decode == 1 || n_decode % 8 == 0 {
                emit_progress(app, AiProgress::Generating { tokens: n_decode });
            }

            batch.clear();
            batch
                .add(token, n_cur, &[0], true)
                .map_err(|e| AiError::Inference(format!("batch.add gen: {e}")))?;
            ctx.decode(&mut batch)
                .map_err(|e| AiError::Inference(format!("decode gen: {e}")))?;
            n_cur += 1;
        }

        emit_progress(app, AiProgress::Generating { tokens: n_decode });
        Ok(output.trim().to_string())
    }
}
