use super::{span_from_match, StructuredRecognizer};
use crate::ai::anonymize::types::TextSpan;
use regex::Regex;
use std::sync::OnceLock;

pub struct EmailRecognizer;

fn email_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b").expect("email regex")
    })
}

impl StructuredRecognizer for EmailRecognizer {
    fn entity_type(&self) -> &'static str {
        "EMAIL"
    }

    fn find(&self, text: &str) -> Vec<TextSpan> {
        use std::collections::HashSet;

        let mut spans = Vec::new();
        let mut seen: HashSet<(usize, usize)> = HashSet::new();

        let mut push = |start: usize, end: usize| {
            if seen.contains(&(start, end)) {
                return;
            }
            if let Some(span) = span_from_match(text, self.entity_type(), start, end) {
                seen.insert((start, end));
                spans.push(span);
            }
        };

        for m in email_re().find_iter(text) {
            push(m.start(), m.end());
        }
        for (start, end, _) in super::glyph_tolerant::find_emails_glyph_tolerant(text) {
            push(start, end);
        }

        spans.sort_by(|a, b| a.start.cmp(&b.start).then(b.end.cmp(&a.end)));
        let mut deduped: Vec<TextSpan> = Vec::with_capacity(spans.len());
        for span in spans {
            if deduped
                .last()
                .is_some_and(|prev| span.start < prev.end)
            {
                continue;
            }
            deduped.push(span);
        }
        deduped
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_emails() {
        let hits = EmailRecognizer.find("Contatta mario.rossi@example.com subito");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].value, "mario.rossi@example.com");
    }

    #[test]
    fn finds_email_split_across_line() {
        let text = "marco.ferrari@rossibianchiconsultin\ng.it";
        let hits = EmailRecognizer.find(text);
        assert_eq!(hits.len(), 1, "hits: {:?}", hits);
        assert!(
            hits[0]
                .value
                .chars()
                .filter(|c| !c.is_whitespace())
                .collect::<String>()
                .eq_ignore_ascii_case("marco.ferrari@rossibianchiconsulting.it")
        );
    }

    #[test]
    fn finds_cf_and_split_email_on_one_line() {
        use super::super::codice_fiscale::CodiceFiscaleRecognizer;
        use super::super::StructuredRecognizer;
        let text = "CLMCHR95A41Z404K chiara.colombo@rossibianchiconsul\nting.it";
        let cf = CodiceFiscaleRecognizer.find(text);
        assert_eq!(cf.len(), 1);
        let mail = EmailRecognizer.find(text);
        assert_eq!(mail.len(), 1);
    }
}
