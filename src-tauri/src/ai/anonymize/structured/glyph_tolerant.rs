//! PDF text often breaks emails, CF and phones across line / glyph boundaries.

use regex::Regex;
use std::sync::OnceLock;

const EMAIL_LOCAL: &str = r"[a-z0-9._%+\-]";
const EMAIL_DOMAIN: &str = r"[a-z0-9.\-]";

/// Join soft line breaks inside tokens (keep `\n\n` paragraph gaps).
pub fn collapse_soft_line_breaks(input: &str) -> String {
    static PARA: OnceLock<Regex> = OnceLock::new();
    static LOWER_CONT: OnceLock<Regex> = OnceLock::new();
    static ALNUM_CONT: OnceLock<Regex> = OnceLock::new();
    static PHONE_CONT: OnceLock<Regex> = OnceLock::new();

    let para = PARA.get_or_init(|| Regex::new(r"\n{2,}").expect("para"));
    let lower_cont = LOWER_CONT.get_or_init(|| {
        Regex::new(r"([a-z0-9@._+\-])\n([a-z])").expect("lower cont")
    });
    let alnum_cont = ALNUM_CONT.get_or_init(|| {
        Regex::new(r"([A-Za-z0-9])\n([A-Za-z0-9])").expect("alnum cont")
    });
    let phone_cont = PHONE_CONT.get_or_init(|| {
        Regex::new(r"([)\d])\n(\d|\()").expect("phone cont")
    });

    let mut out = String::with_capacity(input.len());
    let mut last = 0usize;
    for m in para.find_iter(input) {
        out.push_str(&input[last..m.start()]);
        out.push_str("\n\n");
        last = m.end();
    }
    out.push_str(&input[last..]);

    let mut s = lower_cont.replace_all(&out, "$1$2").into_owned();
    s = alnum_cont.replace_all(&s, "$1$2").into_owned();
    s = phone_cont.replace_all(&s, "$1 $2").into_owned();
    s
}

pub fn only_loose_separators(text: &str, start: usize, end: usize) -> bool {
    if end > text.len() || start >= end {
        return false;
    }
    text.get(start..end)
        .map(|slice| {
            slice.chars().all(|c| {
                c.is_ascii_alphanumeric()
                    || c.is_whitespace()
                    || matches!(c, '.' | '-' | '_' | '/' | '(' | ')')
            })
        })
        .unwrap_or(false)
}

/// Expand around `@` allowing whitespace/newlines between glyph runs.
pub fn find_emails_glyph_tolerant(text: &str) -> Vec<(usize, usize, String)> {
    static COMPACT_RE: OnceLock<Regex> = OnceLock::new();
    let compact_re = COMPACT_RE.get_or_init(|| {
        Regex::new(&format!(
            r"(?i)({EMAIL_LOCAL}+(?:\.{EMAIL_LOCAL}+)*)@({EMAIL_DOMAIN}+\.[a-z]{{2,24}})"
        ))
        .expect("email compact")
    });

    let mut found = Vec::new();
    let mut search_from = 0usize;
    while let Some(rel) = text[search_from..].find('@') {
        let at = search_from + rel;
        let (local_start, local_end) = expand_email_part(text, at, true);
        let (domain_start, domain_end) = expand_email_part(text, at + 1, false);
        if local_start >= local_end || domain_start >= domain_end {
            search_from = at + 1;
            continue;
        }
        let start = local_start;
        let end = domain_end;
        let raw = text.get(start..end).unwrap_or("");
        let compact: String = raw
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect();
        if compact_re.is_match(&compact) {
            found.push((start, end, compact));
        }
        search_from = at + 1;
    }

    // Deduplicate overlapping (keep longest).
    found.sort_by_key(|(s, e, _)| (*s, std::cmp::Reverse(*e)));
    let mut kept: Vec<(usize, usize, String)> = Vec::new();
    for item in found {
        if kept.iter().any(|(s, e, _)| item.0 >= *s && item.1 <= *e) {
            continue;
        }
        kept.push(item);
    }
    kept
}

fn allowed_email_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '%' | '+' | '-')
}

fn expand_email_part(text: &str, boundary: usize, backward: bool) -> (usize, usize) {
    if backward {
        // Local part: do not swallow spaces (avoids "Contatta mario@…").
        let mut i = boundary;
        while i > 0 {
            let ch = match text[..i].chars().next_back() {
                Some(c) => c,
                None => break,
            };
            let pos = i - ch.len_utf8();
            if allowed_email_char(ch) {
                i = pos;
                continue;
            }
            break;
        }
        (i, boundary)
    } else {
        let mut end = boundary;
        while end < text.len() {
            let ch = match text[end..].chars().next() {
                Some(c) => c,
                None => break,
            };
            if allowed_email_char(ch) {
                end += ch.len_utf8();
                continue;
            }
            // Only newline/tab glue inside a broken domain — not normal spaces between words.
            if matches!(ch, '\n' | '\r' | '\t') {
                let after = text[end + ch.len_utf8()..]
                    .chars()
                    .next()
                    .map(allowed_email_char)
                    .unwrap_or(false);
                if after {
                    end += ch.len_utf8();
                    continue;
                }
            }
            break;
        }
        (boundary, end)
    }
}
