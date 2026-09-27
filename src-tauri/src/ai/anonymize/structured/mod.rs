//! Stage-1 structured recognizers (regex + validation).

mod codice_fiscale;
mod glyph_tolerant;
mod credit_card;
mod email;
mod iban;
mod ip;
mod italian_heuristic;
mod partita_iva;

pub use italian_heuristic::ItalianHeuristicRecognizer;
pub use glyph_tolerant::collapse_soft_line_breaks;
mod phone;

use crate::ai::anonymize::types::TextSpan;

/// Common interface for deterministic entity detectors.
pub trait StructuredRecognizer: Send + Sync {
    fn entity_type(&self) -> &'static str;
    fn find(&self, text: &str) -> Vec<TextSpan>;
}

/// Priority for all stage-1 matches (wins over NER on overlap).
pub const STAGE1_PRIORITY: u8 = 0;

pub fn default_recognizers() -> Vec<Box<dyn StructuredRecognizer>> {
    vec![
        Box::new(email::EmailRecognizer),
        Box::new(iban::IbanRecognizer),
        Box::new(codice_fiscale::CodiceFiscaleRecognizer),
        Box::new(partita_iva::PartitaIvaRecognizer),
        Box::new(phone::PhoneRecognizer),
        Box::new(credit_card::CreditCardRecognizer),
        Box::new(ip::IpRecognizer),
    ]
}

/// Helper: build a TextSpan from a regex capture over `text`.
pub(crate) fn span_from_match(
    text: &str,
    entity_type: &str,
    start: usize,
    end: usize,
) -> Option<TextSpan> {
    if start >= end || end > text.len() {
        return None;
    }
    if !text.is_char_boundary(start) || !text.is_char_boundary(end) {
        return None;
    }
    Some(TextSpan {
        entity_type: entity_type.to_string(),
        start,
        end,
        value: text[start..end].to_string(),
        priority: STAGE1_PRIORITY,
    })
}
