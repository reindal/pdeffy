//! Italian / international phone numbers (conservative format checks).

use super::{span_from_match, StructuredRecognizer};
use crate::ai::anonymize::types::TextSpan;
use regex::Regex;
use std::sync::OnceLock;

pub struct PhoneRecognizer;

fn phone_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // +39 / 0039 / national 0… with optional separators.
        Regex::new(
            r"(?x)
            (?:(?:\+|00)\s*39[\s\-./]?)?     # country
            (?:\(\s*\d{2,4}\s*\)|800|0)?    # (335) or 800 or leading 0
            [\s\-./(]*\d[\d\s\-./)]{6,14}    # digits with separators
            ",
        )
        .expect("phone regex")
    })
}

/// Digits only, then length / prefix sanity for IT (+39 / 0…).
pub fn phone_ok(raw: &str) -> bool {
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    let d = if digits.starts_with("00") {
        digits[2..].to_string()
    } else {
        digits
    };

    if d.starts_with("39") {
        let national = &d[2..];
        return (8..=11).contains(&national.len());
    }
    if d.starts_with('0') {
        return (9..=11).contains(&d.len());
    }
    if d.starts_with("800") && (9..=10).contains(&d.len()) {
        return true;
    }
    // Mobile without leading 0: 3358124467 (10 digits).
    if d.len() == 10 && d.starts_with('3') {
        return true;
    }
    (9..=15).contains(&d.len())
}

impl StructuredRecognizer for PhoneRecognizer {
    fn entity_type(&self) -> &'static str {
        "TELEFONO"
    }

    fn find(&self, text: &str) -> Vec<TextSpan> {
        phone_re()
            .find_iter(text)
            .filter_map(|m| {
                if !phone_ok(m.as_str()) {
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
    fn accepts_italian_mobile() {
        assert!(phone_ok("+39 333 1234567"));
        assert!(phone_ok("03331234567"));
        assert!(phone_ok("(335) 812 4467"));
        assert!(phone_ok("800 123 456"));
    }

    #[test]
    fn finds_parenthesized_mobile() {
        let hits = PhoneRecognizer.find("Tel. (335) 812 4467");
        assert!(!hits.is_empty(), "hits: {:?}", hits);
    }

    #[test]
    fn finds_verde_number() {
        let hits = PhoneRecognizer.find("Numero verde 800 123 456");
        assert!(!hits.is_empty(), "hits: {:?}", hits);
    }
}
