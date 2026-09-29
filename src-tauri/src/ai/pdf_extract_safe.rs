//! pdf-extract 0.8 can panic with "wrong type" on some real-world PDFs (e.g. Europass).
//! Prefer its output when it succeeds; catch panics and fall back to a lightweight lopdf scan.

use crate::ai::error::AiError;
use lopdf::Document;
use regex::Regex;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::Path;
use std::sync::OnceLock;

pub fn extract_text(path: &Path) -> Result<String, AiError> {
    let bytes = std::fs::read(path).map_err(|e| {
        AiError::PdfUnreadable(format!("Cannot read PDF {}: {e}", path.display()))
    })?;
    extract_from_bytes(&bytes)
}

fn extract_from_bytes(bytes: &[u8]) -> Result<String, AiError> {
    let owned = bytes.to_vec();
    let primary = catch_unwind(AssertUnwindSafe(|| pdf_extract::extract_text_from_mem(&owned)));
    match primary {
        Ok(Ok(text)) if text.trim().len() >= 8 => return Ok(text),
        Ok(Ok(_)) | Ok(Err(_)) | Err(_) => {}
    }

    lopdf_plain_text(bytes)
}

fn lopdf_plain_text(bytes: &[u8]) -> Result<String, AiError> {
    let doc = Document::load_mem(bytes).map_err(|e| {
        AiError::PdfUnreadable(format!("lopdf load failed: {e}"))
    })?;
    let pages = doc.get_pages();
    let mut parts = Vec::new();

    for (_page_num, page_id) in pages.iter() {
        let content_data = match doc.get_page_content(*page_id) {
            Ok(data) => data,
            Err(_) => continue,
        };
        let content = String::from_utf8_lossy(&content_data);
        for line in parse_tj_lines(&content) {
            if !line.trim().is_empty() {
                parts.push(line);
            }
        }
    }

    if parts.is_empty() {
        return Err(AiError::PdfNoText);
    }
    Ok(parts.join("\n"))
}

fn parse_tj_lines(content: &str) -> Vec<String> {
    static TJ: OnceLock<Regex> = OnceLock::new();
    static TJ_ARRAY: OnceLock<Regex> = OnceLock::new();
    let tj = TJ.get_or_init(|| Regex::new(r"\((?:\\.|[^\\)])*\)\s*Tj").unwrap());
    let tj_array = TJ_ARRAY.get_or_init(|| Regex::new(r"\[(.*?)\]\s*TJ").unwrap());

    let mut out = Vec::new();
    for line in content.lines() {
        for caps in tj.captures_iter(line) {
            if let Some(text) = decode_pdf_string(caps.get(0).map(|m| m.as_str()).unwrap_or("")) {
                out.push(text);
            }
        }
        for caps in tj_array.captures_iter(line) {
            let inner = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            for part in extract_string_literals(inner) {
                out.push(part);
            }
        }
    }
    out
}

fn extract_string_literals(input: &str) -> Vec<String> {
    static LIT: OnceLock<Regex> = OnceLock::new();
    let re = LIT.get_or_init(|| Regex::new(r"\((?:\\.|[^\\)])*\)").unwrap());
    re.find_iter(input)
        .filter_map(|m| decode_pdf_string(m.as_str()))
        .collect()
}

fn decode_pdf_string(raw: &str) -> Option<String> {
    let inner = raw.trim().trim_end_matches(" Tj");
    if !inner.starts_with('(') || !inner.ends_with(')') {
        return None;
    }
    let body = &inner[1..inner.len() - 1];
    let mut out = String::new();
    let mut chars = body.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            match chars.next() {
                Some('n') => out.push('\n'),
                Some('r') => out.push('\r'),
                Some('t') => out.push('\t'),
                Some('(') => out.push('('),
                Some(')') => out.push(')'),
                Some('\\') => out.push('\\'),
                Some(d) if d.is_ascii_digit() => {
                    let mut octal = String::from(d);
                    for _ in 0..2 {
                        if let Some(&next) = chars.peek() {
                            if next.is_ascii_digit() {
                                octal.push(chars.next().unwrap());
                            } else {
                                break;
                            }
                        }
                    }
                    if let Ok(code) = u8::from_str_radix(&octal, 8) {
                        out.push(code as char);
                    }
                }
                Some(other) => out.push(other),
                None => {}
            }
        } else {
            out.push(ch);
        }
    }
    Some(out)
}
