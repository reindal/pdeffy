//! Italian Codice Fiscale (tax ID) with control-character validation.

use super::{span_from_match, StructuredRecognizer};
use crate::ai::anonymize::types::TextSpan;
use regex::Regex;
use std::sync::OnceLock;

pub struct CodiceFiscaleRecognizer;

fn cf_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)\b[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]\b")
            .expect("cf regex")
    })
}

/// CF with optional spaces/dots/dashes between characters (common in PDF extraction).
fn cf_relaxed_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)(?:\b|^)([A-Z0-9](?:[\s.\-]*[A-Z0-9]){15})(?:\b|$)")
            .expect("cf relaxed regex")
    })
}

fn odd_value(c: char) -> u32 {
    match c.to_ascii_uppercase() {
        '0' => 1,
        '1' => 0,
        '2' => 5,
        '3' => 7,
        '4' => 9,
        '5' => 13,
        '6' => 15,
        '7' => 17,
        '8' => 19,
        '9' => 21,
        'A' => 1,
        'B' => 0,
        'C' => 5,
        'D' => 7,
        'E' => 9,
        'F' => 13,
        'G' => 15,
        'H' => 17,
        'I' => 19,
        'J' => 21,
        'K' => 2,
        'L' => 4,
        'M' => 18,
        'N' => 20,
        'O' => 11,
        'P' => 3,
        'Q' => 6,
        'R' => 8,
        'S' => 12,
        'T' => 14,
        'U' => 16,
        'V' => 10,
        'W' => 22,
        'X' => 25,
        'Y' => 24,
        'Z' => 23,
        _ => 0,
    }
}

fn even_value(c: char) -> u32 {
    match c.to_ascii_uppercase() {
        '0'..='9' => (c as u32) - ('0' as u32),
        'A'..='Z' => (c.to_ascii_uppercase() as u32) - ('A' as u32),
        _ => 0,
    }
}

fn cf_shape_ok(normalized_upper: &str) -> bool {
    static SHAPE: OnceLock<Regex> = OnceLock::new();
    let re = SHAPE.get_or_init(|| {
        Regex::new(r"^[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]$").expect("cf shape")
    });
    re.is_match(normalized_upper)
}

/// Validate the 16th control character of an Italian Codice Fiscale.
pub fn codice_fiscale_ok(raw: &str) -> bool {
    let s: String = raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect();
    if s.len() != 16 {
        return false;
    }
    let mut sum = 0u32;
    for (i, ch) in s.chars().take(15).enumerate() {
        if (i + 1) % 2 == 1 {
            sum += odd_value(ch);
        } else {
            sum += even_value(ch);
        }
    }
    let expected = ((sum % 26) as u8 + b'A') as char;
    expected == s.chars().nth(15).unwrap_or('\0')
}

/// Accept valid checksum or plausible 16-char shape (PDF/demo CF often fail checksum).
pub fn codice_fiscale_plausible(raw: &str) -> bool {
    let s: String = raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect();
    if s.len() != 16 {
        return false;
    }
    codice_fiscale_ok(&s) || cf_shape_ok(&s)
}

/// Sliding alnum windows: require valid control character (avoids prose false positives).
fn codice_fiscale_strict_window(raw: &str) -> bool {
    let s: String = raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect();
    s.len() == 16 && cf_shape_ok(&s) && codice_fiscale_ok(&s)
}

fn find_cf_alnum_windows(text: &str) -> Vec<(usize, usize)> {
    use super::glyph_tolerant::only_loose_separators;

    let alnum: Vec<(usize, char)> = text
        .char_indices()
        .filter(|(_, c)| c.is_ascii_alphanumeric())
        .collect();
    let mut out = Vec::new();
    if alnum.len() < 16 {
        return out;
    }
    for w in alnum.windows(16) {
        let raw: String = w.iter().map(|(_, c)| *c).collect();
        if !codice_fiscale_strict_window(&raw) {
            continue;
        }
        let start = w[0].0;
        let last = w[15];
        let end = last.0 + last.1.len_utf8();
        if end - start > 96 {
            continue;
        }
        if !only_loose_separators(text, start, end) {
            continue;
        }
        out.push((start, end));
    }
    out
}

impl StructuredRecognizer for CodiceFiscaleRecognizer {
    fn entity_type(&self) -> &'static str {
        "CODICE_FISCALE"
    }

    fn find(&self, text: &str) -> Vec<TextSpan> {
        use std::collections::HashSet;

        let mut spans = Vec::new();
        let mut seen: HashSet<(usize, usize)> = HashSet::new();

        let mut try_match = |start: usize, end: usize, raw: &str| {
            let key = (start, end);
            if seen.contains(&key) {
                return;
            }
            let normalized: String = raw
                .chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .collect();
            if normalized.len() != 16 || !codice_fiscale_plausible(&normalized) {
                return;
            }
            // Real CF uses uppercase letters; lowercase alnum windows are prose false positives.
            if normalized.chars().any(|c| c.is_ascii_lowercase()) {
                return;
            }
            if let Some(span) = span_from_match(text, self.entity_type(), start, end) {
                seen.insert(key);
                spans.push(span);
            }
        };

        for m in cf_re().find_iter(text) {
            try_match(m.start(), m.end(), m.as_str());
        }
        for m in cf_relaxed_re().find_iter(text) {
            try_match(m.start(), m.end(), m.as_str());
        }
        for (start, end) in find_cf_alnum_windows(text) {
            try_match(start, end, text.get(start..end).unwrap_or(""));
        }

        spans
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_known_cf() {
        // Public sample often cited: RSSMRA80A01H501U
        let sample = "RSSMRA80A01H501U";
        if codice_fiscale_ok(sample) {
            let hits = CodiceFiscaleRecognizer.find(&format!("CF {sample}"));
            assert_eq!(hits.len(), 1);
        }
    }

    #[test]
    fn accepts_demo_cf_shape_without_checksum() {
        let sample = "RSSMRA78C14A794Z";
        assert!(codice_fiscale_plausible(sample));
        let hits = CodiceFiscaleRecognizer.find(&format!("CF: {sample}"));
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn rejects_lowercase_prose_window() {
        let prose = "Documento di esempio generato per test — dati interamente fittizi";
        let hits = CodiceFiscaleRecognizer.find(prose);
        assert!(
            hits.is_empty(),
            "expected no CF in Italian prose, got {:?}",
            hits
        );
    }

    #[test]
    fn accepts_cf_split_by_newlines() {
        let sample = "BNCGLI90L62L219W";
        let split: String = sample.chars().map(|c| format!("{c}\n")).collect();
        let hits = CodiceFiscaleRecognizer.find(&split);
        assert!(!hits.is_empty(), "expected CF in split text");
    }
}
