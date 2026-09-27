//! GLiNER ONNX inference (onnx-community pack, 4D logits decoder).

use super::chunking::ChunkEntity;
use super::config::{NER_ASSETS, NER_ONNX_FILE};
use crate::ai::error::AiError;
use regex::Regex;
use serde::Deserialize;
use std::path::Path;
use std::sync::OnceLock;

#[cfg(feature = "ner-onnx")]
use ort::session::Session;
#[cfg(feature = "ner-onnx")]
use ort::value::Tensor;
#[cfg(feature = "ner-onnx")]
use tokenizers::{InputSequence, Tokenizer};

const MAX_SEQ_LEN: usize = 512;

#[derive(Debug, Deserialize)]
struct GlinerCfgFile {
    max_len: usize,
    max_width: usize,
    ent_token: String,
    sep_token: String,
}

#[cfg(feature = "ner-onnx")]
pub struct GlinerRuntime {
    session: Session,
    tokenizer: Tokenizer,
    max_len: usize,
    max_width: usize,
    ent_token: String,
    sep_token: String,
}

#[cfg(not(feature = "ner-onnx"))]
pub struct GlinerRuntime;

static WORD_RE: OnceLock<Regex> = OnceLock::new();

fn word_re() -> &'static Regex {
    WORD_RE.get_or_init(|| Regex::new(r"\S+").expect("word regex"))
}

#[derive(Debug, Clone)]
struct WordSpan {
    word: String,
    start: usize,
    end: usize,
}

fn split_words(text: &str) -> Vec<WordSpan> {
    word_re()
        .find_iter(text)
        .map(|m| WordSpan {
            word: m.as_str().to_string(),
            start: m.start(),
            end: m.end(),
        })
        .collect()
}

fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}

#[cfg(feature = "ner-onnx")]
impl GlinerRuntime {
    pub fn load(pack_dir: &Path) -> Result<Self, AiError> {
        if !super::gliner_onnx::GlinerOnnx::is_pack_complete(pack_dir) {
            return Err(AiError::NerNotDownloaded);
        }

        let cfg_path = pack_dir.join("gliner_config.json");
        let cfg_raw = std::fs::read_to_string(&cfg_path)
            .map_err(|e| AiError::ModelLoad(format!("gliner_config.json: {e}")))?;
        let cfg: GlinerCfgFile = serde_json::from_str(&cfg_raw)
            .map_err(|e| AiError::ModelLoad(format!("gliner_config parse: {e}")))?;

        let tok_path = pack_dir.join("tokenizer.json");
        let tokenizer = Tokenizer::from_file(&tok_path)
            .map_err(|e| AiError::ModelLoad(format!("tokenizer: {e}")))?;

        let model = pack_dir.join(NER_ONNX_FILE);
        let session = Session::builder()
            .map_err(|e| AiError::ModelLoad(e.to_string()))?
            .commit_from_file(&model)
            .map_err(|e| AiError::ModelLoad(e.to_string()))?;

        Ok(Self {
            session,
            tokenizer,
            max_len: cfg.max_len,
            max_width: cfg.max_width,
            ent_token: cfg.ent_token,
            sep_token: cfg.sep_token,
        })
    }

    pub fn predict(
        &mut self,
        text: &str,
        labels: &[&str],
        threshold: f32,
    ) -> Result<Vec<ChunkEntity>, AiError> {
        if labels.is_empty() {
            return Ok(Vec::new());
        }

        let mut words = split_words(text);
        if words.is_empty() {
            return Ok(Vec::new());
        }
        if words.len() > self.max_len {
            words.truncate(self.max_len);
        }
        let n = words.len();

        let mut input_words: Vec<String> = Vec::new();
        for lab in labels {
            input_words.push(self.ent_token.clone());
            input_words.push((*lab).to_string());
        }
        input_words.push(self.sep_token.clone());
        for w in &words {
            input_words.push(w.word.clone());
        }
        let prompt_len = input_words.len() - n;

        let word_refs: Vec<&str> = input_words.iter().map(String::as_str).collect();
        let encoding = self
            .tokenizer
            .encode(InputSequence::from(word_refs), true)
            .map_err(|e| AiError::Inference(e.to_string()))?;

        let mut input_ids: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();
        let mut attention_mask: Vec<i64> = encoding
            .get_attention_mask()
            .iter()
            .map(|&m| m as i64)
            .collect();
        if input_ids.len() > MAX_SEQ_LEN {
            input_ids.truncate(MAX_SEQ_LEN);
            attention_mask.truncate(MAX_SEQ_LEN);
        }
        let seq_len = MAX_SEQ_LEN;
        input_ids.resize(seq_len, 0);
        attention_mask.resize(seq_len, 0);

        let word_ids = encoding.get_word_ids();
        let mut words_mask: Vec<i64> = Vec::with_capacity(seq_len);
        let mut prev: Option<u32> = None;
        let mut wc: usize = 0;
        for opt in word_ids.iter().take(seq_len) {
            match opt {
                None => words_mask.push(0),
                Some(wid) => {
                    let wid = *wid;
                    if Some(wid) != prev {
                        if wc < prompt_len {
                            words_mask.push(0);
                        } else {
                            words_mask.push(i64::from(wid) - (prompt_len as i64) + 1);
                        }
                        wc += 1;
                    } else {
                        words_mask.push(0);
                    }
                    prev = Some(wid);
                }
            }
        }
        words_mask.resize(seq_len, 0);

        let num_spans = n * self.max_width;
        let mut span_idx: Vec<i64> = Vec::with_capacity(num_spans * 2);
        let mut span_mask: Vec<bool> = Vec::with_capacity(num_spans);
        for i in 0..n {
            for j in 0..self.max_width {
                let end = i + j;
                span_idx.push(i as i64);
                span_idx.push(end as i64);
                span_mask.push(end <= n - 1);
            }
        }

        let text_lengths = vec![n as i64];

        let input_ids_t = Tensor::from_array(([1_i64, seq_len as i64], input_ids))
            .map_err(|e| AiError::Inference(e.to_string()))?;
        let attention_t = Tensor::from_array(([1_i64, seq_len as i64], attention_mask))
            .map_err(|e| AiError::Inference(e.to_string()))?;
        let words_mask_t = Tensor::from_array(([1_i64, seq_len as i64], words_mask))
            .map_err(|e| AiError::Inference(e.to_string()))?;
        let text_lengths_t = Tensor::from_array(([1_i64, 1_i64], text_lengths))
            .map_err(|e| AiError::Inference(e.to_string()))?;
        let span_idx_t = Tensor::from_array(([1_i64, num_spans as i64, 2_i64], span_idx))
            .map_err(|e| AiError::Inference(e.to_string()))?;
        let span_mask_t = Tensor::from_array(([1_i64, num_spans as i64], span_mask))
            .map_err(|e| AiError::Inference(e.to_string()))?;

        let outputs = self
            .session
            .run(ort::inputs![
                "input_ids" => input_ids_t,
                "attention_mask" => attention_t,
                "words_mask" => words_mask_t,
                "text_lengths" => text_lengths_t,
                "span_idx" => span_idx_t,
                "span_mask" => span_mask_t,
            ])
            .map_err(|e| AiError::Inference(e.to_string()))?;

        let logits_val = outputs
            .get("logits")
            .ok_or_else(|| AiError::Inference("missing logits output".into()))?;
        let (shape, data) = logits_val
            .try_extract_tensor::<f32>()
            .map_err(|e| AiError::Inference(e.to_string()))?;

        // Expected [1, n_words, max_width, n_classes]
        if shape.len() != 4 {
            return Err(AiError::Inference(format!(
                "unexpected logits rank {}",
                shape.len()
            )));
        }
        let n_w = shape[1] as usize;
        let n_k = shape[2] as usize;
        let n_c = shape[3] as usize;
        let n_labels = labels.len().min(n_c);

        let mut candidates: Vec<(usize, usize, usize, f32)> = Vec::new();
        for s in 0..n_w.min(n) {
            for k in 0..n_k.min(self.max_width) {
                if s + k >= n {
                    continue;
                }
                for c in 0..n_labels {
                    let idx = s * (n_k * n_c) + k * n_c + c;
                    let prob = sigmoid(data[idx]);
                    if prob >= threshold {
                        candidates.push((s, s + k, c, prob));
                    }
                }
            }
        }
        candidates.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal));

        let mut picked: Vec<(usize, usize)> = Vec::new();
        let mut out = Vec::new();
        for (st, ed, c, score) in candidates {
            let overlap = picked
                .iter()
                .any(|&(pst, ped)| !(ed < pst || st > ped));
            if overlap {
                continue;
            }
            picked.push((st, ed));
            out.push(ChunkEntity {
                local_start: words[st].start,
                local_end: words[ed].end,
                label: labels[c].to_string(),
                score,
            });
        }

        Ok(out)
    }
}

#[cfg(not(feature = "ner-onnx"))]
impl GlinerRuntime {
    pub fn load(_pack_dir: &Path) -> Result<Self, AiError> {
        Err(AiError::NotImplemented("ner-onnx feature disabled"))
    }

    pub fn predict(
        &mut self,
        _text: &str,
        _labels: &[&str],
        _threshold: f32,
    ) -> Result<Vec<ChunkEntity>, AiError> {
        Ok(Vec::new())
    }
}

/// Pack completeness check (shared with download UI).
#[cfg(all(test, feature = "ner-onnx"))]
mod integration {
    use super::*;

    #[test]
    fn predict_italian_sample_when_pack_on_disk() {
        let pack = std::env::var("GLINER_PACK_DIR").unwrap_or_else(|_| "/tmp/gliner_pack".into());
        let path = Path::new(&pack);
        if !is_pack_complete(path) {
            eprintln!("skip predict_italian_sample: pack missing at {}", path.display());
            return;
        }
        let mut rt = GlinerRuntime::load(path).expect("load");
        let text = "Mario Rossi lavora per Acme S.r.l. in Via Roma 1, Milano.";
        let labels = ["person", "organization", "address"];
        let found = rt.predict(text, &labels, 0.33).expect("predict");
        assert!(
            found.iter().any(|e| e.label == "person" && e.local_start == 0),
            "expected person Mario Rossi, got {found:?}"
        );
    }
}

pub fn is_pack_complete(pack_dir: &Path) -> bool {
    NER_ASSETS.iter().all(|a| {
        let p = pack_dir.join(a.filename);
        p.is_file()
            && std::fs::metadata(&p)
                .map(|m| m.len() >= a.min_bytes)
                .unwrap_or(false)
    })
}
