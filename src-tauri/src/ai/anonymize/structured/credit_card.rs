//! Payment-card numbers with Luhn checksum.

use super::{span_from_match, StructuredRecognizer};
use crate::ai::anonymize::types::TextSpan;
use regex::Regex;
use std::sync::OnceLock;

pub struct CreditCardRecognizer;

fn card_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    // 13–19 digits, optional spaces/hyphens between groups of 4.
    RE.get_or_init(|| Regex::new(r"\b(?:\d[ -]*?){13,19}\b").expect("card regex"))
}

pub fn luhn_ok(raw: &str) -> bool {
    let digits: Vec<u32> = raw
        .chars()
        .filter(|c| c.is_ascii_digit())
        .filter_map(|c| c.to_digit(10))
        .collect();
    if digits.len() < 13 || digits.len() > 19 {
        return false;
    }
    let mut sum = 0u32;
    let mut alt = false;
    for &d in digits.iter().rev() {
        let mut v = d;
        if alt {
            v *= 2;
            if v > 9 {
                v -= 9;
            }
        }
        sum += v;
        alt = !alt;
    }
    sum % 10 == 0
}

impl StructuredRecognizer for CreditCardRecognizer {
    fn entity_type(&self) -> &'static str {
        "CARTA"
    }

    fn find(&self, text: &str) -> Vec<TextSpan> {
        card_re()
            .find_iter(text)
            .filter_map(|m| {
                if !luhn_ok(m.as_str()) {
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
    fn luhn_visa_test_number() {
        assert!(luhn_ok("4111 1111 1111 1111"));
        assert!(!luhn_ok("4111 1111 1111 1112"));
    }
}
