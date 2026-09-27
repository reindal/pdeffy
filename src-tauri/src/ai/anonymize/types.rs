use serde::Serialize;
use std::collections::HashMap;

/// One sensitive span detected in the source text (byte offsets into UTF-8).
#[derive(Debug, Clone)]
pub struct TextSpan {
    pub entity_type: String,
    pub start: usize,
    pub end: usize,
    pub value: String,
    /// Lower number = higher priority when resolving overlaps (stage 1 = 0, NER = 10).
    pub priority: u8,
}

/// Public entity report row for the UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityMatch {
    pub entity_type: String,
    pub placeholder: String,
    pub value: String,
    pub start: usize,
    pub end: usize,
}

/// Pipeline summary for the anonymize UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnonymizeDiagnostics {
    pub extracted_chars: usize,
    pub structured_count: usize,
    pub heuristic_count: usize,
    pub ner_count: usize,
    pub ner_downloaded: bool,
    pub ner_loaded: bool,
    pub hint: Option<String>,
}

/// Result of anonymizing a document.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnonymizeResult {
    pub anonymized_text: String,
    /// Placeholder → original value (session only; never persist in cleartext).
    pub mapping: HashMap<String, String>,
    pub entities_found: Vec<EntityMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostics: Option<AnonymizeDiagnostics>,
}
