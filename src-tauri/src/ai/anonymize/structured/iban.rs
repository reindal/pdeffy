//! IBAN detection with ISO 13616 MOD-97 checksum validation.

use super::{span_from_match, StructuredRecognizer};
use crate::ai::anonymize::types::TextSpan;
use regex::Regex;
use std::sync::OnceLock;

pub struct IbanRecognizer;

fn iban_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    // Compact or grouped (typically spaces every 4 chars). Groups of 4 avoid
    // spilling into the next word (unlike per-char optional spaces).
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b[A-Z]{2}\d{2}(?:[ \-]?[A-Z0-9]{4}){2,7}(?:[ \-]?[A-Z0-9]{1,4})?\b",
        )
        .expect("iban regex")
    })
}

/// Normalize IBAN for checksum: strip spaces/hyphens, uppercase.
pub fn normalize_iban(raw: &str) -> String {
    raw.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

/// ISO 13616 MOD-97-10 check (returns true if valid).
pub fn iban_checksum_ok(iban: &str) -> bool {
    let n = normalize_iban(iban);
    if n.len() < 15 || n.len() > 34 {
        return false;
    }
    if !n.chars().take(2).all(|c| c.is_ascii_alphabetic()) {
        return false;
    }
    if !n.chars().skip(2).take(2).all(|c| c.is_ascii_digit()) {
        return false;
    }

    // Move first 4 chars to the end, expand letters A=10 … Z=35.
    let rearranged = format!("{}{}", &n[4..], &n[..4]);
    let mut total = 0u128;
    for ch in rearranged.chars() {
        let v = if ch.is_ascii_digit() {
            ch.to_digit(10).unwrap() as u128
        } else {
            (ch as u128) - ('A' as u128) + 10
        };
        // Fold digit-by-digit for multi-digit letter values.
        if v >= 10 {
            total = (total * 100 + v) % 97;
        } else {
            total = (total * 10 + v) % 97;
        }
    }
    total == 1
}

impl StructuredRecognizer for IbanRecognizer {
    fn entity_type(&self) -> &'static str {
        "IBAN"
    }

    fn find(&self, text: &str) -> Vec<TextSpan> {
        iban_re()
            .find_iter(text)
            .filter_map(|m| {
                let raw = m.as_str();
                if !iban_checksum_ok(raw) {
                    return None;
                }
                span_from_match(text, self.entity_type(), m.start(), m.end())
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_known_iban() {
        // Official example IBAN (Germany).
        assert!(iban_checksum_ok("DE89 3704 0044 0532 0130 00"));
        assert!(!iban_checksum_ok("DE89 3704 0044 0532 0130 01"));
    }

    #[test]
    fn finds_valid_iban_in_text() {
        let text = "Bonifico su DE89 3704 0044 0532 0130 00 grazie";
        let hits = IbanRecognizer.find(text);
        assert_eq!(hits.len(), 1);
        assert!(hits[0].value.contains("DE89"));
    }
}
