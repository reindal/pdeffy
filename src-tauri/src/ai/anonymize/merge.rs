use super::types::{AnonymizeResult, EntityMatch, TextSpan};
use std::collections::HashMap;

/// Merge stage-1 and stage-2 spans: sort by start, drop overlaps preferring lower `priority`.
pub fn merge_spans(stage1: Vec<TextSpan>, stage2: Vec<TextSpan>) -> Vec<TextSpan> {
    let mut all = stage1;
    all.extend(stage2);
    if all.is_empty() {
        return all;
    }

    // Prefer earlier start; on equal start prefer higher priority (lower number) then longer span.
    all.sort_by(|a, b| {
        a.start
            .cmp(&b.start)
            .then_with(|| a.priority.cmp(&b.priority))
            .then_with(|| b.end.cmp(&a.end))
    });

    let mut kept: Vec<TextSpan> = Vec::with_capacity(all.len());
    for span in all {
        if span.start >= span.end {
            continue;
        }
        if let Some(last) = kept.last() {
            if span.start < last.end {
                // Overlap: keep the one already selected (better priority / earlier).
                continue;
            }
        }
        kept.push(span);
    }
    kept
}

/// Assign coherent `[TIPO_N]` placeholders and rewrite the text.
///
/// Same original value (case-sensitive) → same placeholder across the document.
pub fn apply_placeholders(text: &str, spans: Vec<TextSpan>) -> AnonymizeResult {
    let bytes = text.as_bytes();
    let mut counters: HashMap<String, usize> = HashMap::new();
    let mut value_to_placeholder: HashMap<(String, String), String> = HashMap::new();
    let mut mapping: HashMap<String, String> = HashMap::new();
    let mut entities_found: Vec<EntityMatch> = Vec::new();

    // Build placeholder assignments first (stable across occurrences).
    for span in &spans {
        let key = (span.entity_type.clone(), span.value.clone());
        if value_to_placeholder.contains_key(&key) {
            continue;
        }
        let n = counters.entry(span.entity_type.clone()).or_insert(0);
        *n += 1;
        let ph = format!("[{}_{}]", span.entity_type, n);
        value_to_placeholder.insert(key, ph.clone());
        mapping.insert(ph, span.value.clone());
    }

    // Replace from the end so earlier byte offsets stay valid.
    let mut ordered = spans;
    ordered.sort_by(|a, b| b.start.cmp(&a.start));

    let mut out = text.to_string();
    for span in &ordered {
        let ph = value_to_placeholder
            .get(&(span.entity_type.clone(), span.value.clone()))
            .cloned()
            .unwrap_or_else(|| format!("[{}_?]", span.entity_type));

        if span.end > bytes.len() || span.start > span.end {
            continue;
        }
        if !text.is_char_boundary(span.start) || !text.is_char_boundary(span.end) {
            continue;
        }
        out.replace_range(span.start..span.end, &ph);
        entities_found.push(EntityMatch {
            entity_type: span.entity_type.clone(),
            placeholder: ph,
            value: span.value.clone(),
            start: span.start,
            end: span.end,
        });
    }

    // Report in document order.
    entities_found.sort_by(|a, b| a.start.cmp(&b.start));

    AnonymizeResult {
        anonymized_text: out,
        mapping,
        entities_found,
        diagnostics: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_stage1_on_overlap() {
        let a = TextSpan {
            entity_type: "EMAIL".into(),
            start: 0,
            end: 10,
            value: "a@b.c".into(),
            priority: 0,
        };
        let b = TextSpan {
            entity_type: "NOME".into(),
            start: 5,
            end: 15,
            value: "Mario".into(),
            priority: 10,
        };
        let merged = merge_spans(vec![a], vec![b]);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].entity_type, "EMAIL");
    }

    #[test]
    fn same_value_same_placeholder() {
        let text = "a@x.it and again a@x.it";
        let spans = vec![
            TextSpan {
                entity_type: "EMAIL".into(),
                start: 0,
                end: 6,
                value: "a@x.it".into(),
                priority: 0,
            },
            TextSpan {
                entity_type: "EMAIL".into(),
                start: 17,
                end: 23,
                value: "a@x.it".into(),
                priority: 0,
            },
        ];
        let r = apply_placeholders(text, spans);
        assert_eq!(r.anonymized_text, "[EMAIL_1] and again [EMAIL_1]");
        assert_eq!(r.mapping.get("[EMAIL_1]").map(String::as_str), Some("a@x.it"));
    }
}
