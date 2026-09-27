//! IPv4 / IPv6 address detection.

use super::{span_from_match, StructuredRecognizer};
use crate::ai::anonymize::types::TextSpan;
use regex::Regex;
use std::net::{Ipv4Addr, Ipv6Addr};
use std::sync::OnceLock;

pub struct IpRecognizer;

fn ipv4_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b")
            .expect("ipv4 regex")
    })
}

fn ipv6_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    // Conservative: compressed forms with at least two colons.
    RE.get_or_init(|| {
        Regex::new(r"(?i)\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b").expect("ipv6 regex")
    })
}

impl StructuredRecognizer for IpRecognizer {
    fn entity_type(&self) -> &'static str {
        "IP"
    }

    fn find(&self, text: &str) -> Vec<TextSpan> {
        let mut out = Vec::new();
        for m in ipv4_re().find_iter(text) {
            if m.as_str().parse::<Ipv4Addr>().is_ok() {
                if let Some(s) = span_from_match(text, self.entity_type(), m.start(), m.end()) {
                    out.push(s);
                }
            }
        }
        for m in ipv6_re().find_iter(text) {
            let raw = m.as_str();
            // Avoid matching lone hex that isn't a real address.
            if raw.matches(':').count() < 2 {
                continue;
            }
            if raw.parse::<Ipv6Addr>().is_ok() {
                if let Some(s) = span_from_match(text, self.entity_type(), m.start(), m.end()) {
                    out.push(s);
                }
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_ipv4() {
        let hits = IpRecognizer.find("server 192.168.1.1 online");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].value, "192.168.1.1");
    }
}
