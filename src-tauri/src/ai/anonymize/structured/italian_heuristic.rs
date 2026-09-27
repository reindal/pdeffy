//! Lightweight Italian fallbacks when PDF text layout breaks NER (priority below GLiNER).

use super::{span_from_match, StructuredRecognizer};
use crate::ai::anonymize::types::TextSpan;
use regex::Regex;
use std::collections::HashSet;
use std::sync::OnceLock;

/// Lower number = wins on overlap; above GLiNER (10), below stage-1 (0).
pub const HEURISTIC_PRIORITY: u8 = 11;

pub struct ItalianHeuristicRecognizer;

fn name_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"[\p{Lu}][\p{Ll}]{1,24}(?:\s+[\p{Lu}][\p{Ll}]{1,24}){1,3}",
        )
        .expect("name regex")
    })
}

fn caps_name_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"[A-ZÀ-Ü]{2,20}(?:\s+[A-ZÀ-Ü]{2,20}){1,3}",
        )
        .expect("caps name regex")
    })
}

/// `regex` crate has no look-around; enforce letter boundaries in code.
fn letter_boundary_ok(text: &str, start: usize, end: usize) -> bool {
    let before = if start == 0 {
        true
    } else {
        text.get(..start)
            .and_then(|s| s.chars().last())
            .map(|c| !c.is_alphabetic())
            .unwrap_or(true)
    };
    let after = if end >= text.len() {
        true
    } else {
        text.get(end..)
            .and_then(|s| s.chars().next())
            .map(|c| !c.is_alphabetic())
            .unwrap_or(true)
    };
    before && after
}

fn company_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b([\p{L}0-9][\p{L}0-9&\.\-'\s]{1,60}?\s+(?:S\.?\s*r\.?\s*l\.?|S\.?\s*p\.?\s*A\.?|S\.?\s*p\.?\s*a\.?|S\.?\s*n\.?\s*c\.?|S\.?\s*a\.?\s*s\.?|SRL|SPA|SNC|SAS))\b",
        )
        .expect("company regex")
    })
}

fn address_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b((?:Via|V\.|Viale|Vle\.|Piazza|P\.?\s*zza|Corso|C\.?\s*so|Largo|L\.?\s*go|Vicolo|V\.?\s*lo)\.?\s+[\p{L}0-9][\p{L}0-9\s,\.'\-]{2,55}(?:\(\s*[A-Z]{2}\s*\))?)\b",
        )
        .expect("address regex")
    })
}

fn push_unique(
    spans: &mut Vec<TextSpan>,
    seen: &mut HashSet<(usize, usize)>,
    text: &str,
    entity_type: &str,
    m: regex::Match<'_>,
    require_letter_boundary: bool,
) {
    let key = (m.start(), m.end());
    if seen.contains(&key) {
        return;
    }
    if require_letter_boundary && !letter_boundary_ok(text, m.start(), m.end()) {
        return;
    }
    if let Some(span) = span_from_match(text, entity_type, m.start(), m.end()) {
        seen.insert(key);
        spans.push(TextSpan {
            priority: HEURISTIC_PRIORITY,
            ..span
        });
    }
}

impl StructuredRecognizer for ItalianHeuristicRecognizer {
    fn entity_type(&self) -> &'static str {
        "NOME"
    }

    fn find(&self, text: &str) -> Vec<TextSpan> {
        let mut spans = Vec::new();
        let mut seen = HashSet::new();

        for m in name_re().find_iter(text) {
            push_unique(&mut spans, &mut seen, text, "NOME", m, true);
        }
        for m in caps_name_re().find_iter(text) {
            push_unique(&mut spans, &mut seen, text, "NOME", m, true);
        }
        for m in company_re().captures_iter(text) {
            if let Some(cap) = m.get(1) {
                push_unique(&mut spans, &mut seen, text, "ORGANIZZAZIONE", cap, false);
            }
        }
        for m in address_re().captures_iter(text) {
            if let Some(cap) = m.get(1) {
                push_unique(&mut spans, &mut seen, text, "INDIRIZZO", cap, false);
            }
        }

        spans
    }
}
