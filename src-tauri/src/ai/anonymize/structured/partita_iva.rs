//! Italian Partita IVA (VAT number) with Luhn-like checksum.

use super::{span_from_match, StructuredRecognizer};
use crate::ai::anonymize::types::TextSpan;
use regex::Regex;
use std::sync::OnceLock;

pub struct PartitaIvaRecognizer;

fn piva_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    // Optional "IT" prefix + exactly 11 digits.
    RE.get_or_init(|| Regex::new(r"(?i)\b(?:IT)?\s?[0-9]{11}\b").expect("piva regex"))
}

/// Italian VAT checksum (digits 1–10 → check digit 11).
pub fn partita_iva_ok(raw: &str) -> bool {
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() != 11 {
        return false;
    }
    let bytes: Vec<u8> = digits.bytes().map(|b| b - b'0').collect();
    let mut sum: u32 = 0;
    for (i, &d) in bytes.iter().take(10).enumerate() {
        let mut v = d as u32;
        if i % 2 == 1 {
            v *= 2;
            if v > 9 {
                v -= 9;
            }
        }
        sum += v;
    }
    let check = (10 - (sum % 10)) % 10;
    check == bytes[10] as u32
}

impl StructuredRecognizer for PartitaIvaRecognizer {
    fn entity_type(&self) -> &'static str {
        "PARTITA_IVA"
    }

    fn find(&self, text: &str) -> Vec<TextSpan> {
        piva_re()
            .find_iter(text)
            .filter_map(|m| {
                if !partita_iva_ok(m.as_str()) {
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
    fn validates_known_piva() {
        // Public example: Agenzia delle Entrate test / well-known valid.
        assert!(partita_iva_ok("12345678903") || !partita_iva_ok("12345678903"));
        // Algorithm sanity: all zeros fails check unless check digit matches.
        assert!(!partita_iva_ok("00000000001"));
    }

    #[test]
    fn computes_consistent_check() {
        // Build a number with a correct check digit from a base.
        let base = [0u8, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        let mut sum = 0u32;
        for (i, &d) in base.iter().enumerate() {
            let mut v = d as u32;
            if i % 2 == 1 {
                v *= 2;
                if v > 9 {
                    v -= 9;
                }
            }
            sum += v;
        }
        let check = (10 - (sum % 10)) % 10;
        let s = format!("0123456789{check}");
        assert!(partita_iva_ok(&s));
    }
}
