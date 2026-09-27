//! Deterministic PDF anonymization (structured recognizers + NER stub).
//!
//! Layout:
//! ```text
//! anonymize/
//!   mod.rs              # orchestrate: extract → stage1+2 → merge → placeholders
//!   types.rs            # AnonymizeResult, EntityMatch, TextSpan
//!   merge.rs            # overlap resolution + coherent placeholder assignment
//!   structured/
//!     mod.rs            # StructuredRecognizer trait + registry
//!     email.rs
//!     iban.rs
//!     codice_fiscale.rs
//!     partita_iva.rs
//!     phone.rs
//!     credit_card.rs
//!     ip.rs
//!   ner/                # GLiNER + ONNX (non-generative)
//! ```

mod merge;
pub mod ner;
mod structured;
mod types;

#[allow(unused_imports)] // re-exported for callers / UI serde
pub use types::{AnonymizeResult, EntityMatch};

use crate::ai::error::AiError;
use crate::ai::pdf_text;
use crate::ai::progress::{emit_progress, AiProgress};
use merge::{apply_placeholders, merge_spans};
use ner::NerEngine;
use std::path::Path;
use structured::{default_recognizers, StructuredRecognizer};
use tauri::AppHandle;
use types::TextSpan;

/// Run the full anonymization pipeline on a PDF path.
pub fn anonymize_pdf(app: &AppHandle, app_data: &Path, pdf_path: &Path) -> Result<AnonymizeResult, AiError> {
    emit_progress(app, AiProgress::Loading);
    let text = pdf_text::extract_and_normalize(app, app_data, pdf_path)?;

    anonymize_text(app, app_data, &text)
}

/// Anonymize an already-extracted plain text (useful for tests / UI preview).
pub fn anonymize_text(app: &AppHandle, app_data: &Path, text: &str) -> Result<AnonymizeResult, AiError> {
    emit_progress(app, AiProgress::Loading);

    let scan_text = structured::collapse_soft_line_breaks(text);

    // Stage 1 — structured (deterministic).
    let mut stage1: Vec<TextSpan> = Vec::new();
    for recognizer in default_recognizers() {
        stage1.extend(recognizer.find(&scan_text));
    }

    let stage1_count = stage1.len();

    // Heuristic IT fallbacks (PDF layout); lower priority than GLiNER on overlap.
    let heuristics = structured::ItalianHeuristicRecognizer.find(&scan_text);
    let heuristic_count = heuristics.len();

    // Stage 2 — GLiNER NER (names / org / address).
    let ner_downloaded = NerEngine::is_downloaded(app_data);
    let mut ner = NerEngine::ensure(app, app_data)?;
    let stage2 = ner.find(app, &scan_text)?;
    let ner_loaded = NerEngine::session_loaded();
    let ner_count = stage2.len();

    emit_progress(app, AiProgress::Generating { tokens: 0 });

    let mut stage15 = stage1;
    stage15.extend(heuristics);
    let merged = merge_spans(stage15, stage2);
    let mut result = apply_placeholders(&scan_text, merged);

    result.diagnostics = Some(types::AnonymizeDiagnostics {
        extracted_chars: scan_text.chars().count(),
        structured_count: stage1_count,
        heuristic_count,
        ner_count,
        ner_downloaded,
        ner_loaded,
        hint: anonymize_hint(&scan_text, ner_downloaded, ner_loaded, stage1_count + heuristic_count + ner_count),
    });

    emit_progress(app, AiProgress::Ready);
    Ok(result)
}

fn anonymize_hint(
    text: &str,
    ner_downloaded: bool,
    ner_loaded: bool,
    total_spans: usize,
) -> Option<String> {
    if text.trim().is_empty() {
        return Some("anonHintNoText".into());
    }
    if !ner_downloaded {
        return Some("anonHintNerMissing".into());
    }
    if ner_downloaded && !ner_loaded && total_spans == 0 {
        return Some("anonHintNerLoadFailed".into());
    }
    if total_spans == 0 {
        return Some("anonHintNoMatches".into());
    }
    None
}
