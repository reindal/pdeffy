use super::types::ExtractedPage;
use super::{default_style, merge_blocks_text};
use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::model::TextBlock;
use lopdf::{Document, Object};

pub fn extract_with_lopdf(pdf_bytes: &[u8]) -> Result<Vec<ExtractedPage>, PdfExportError> {
    let doc = Document::load_mem(pdf_bytes).map_err(|e| PdfExportError::Pipeline(e.to_string()))?;
    let pages_id = doc.get_pages();
    let mut out = Vec::new();

    for (_page_num, page_id) in pages_id {
        let (width, height) = page_size(&doc, page_id).unwrap_or((595.0, 842.0));
        let mut blocks = extract_text_blocks(&doc, page_id);
        blocks.sort_by(|a, b| {
            b.bbox
                .1
                .partial_cmp(&a.bbox.1)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| {
                    a.bbox
                        .0
                        .partial_cmp(&b.bbox.0)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
        });
        if blocks.is_empty() {
            let fallback = pdf_extract::extract_text_from_mem(pdf_bytes).unwrap_or_default();
            if !fallback.trim().is_empty() {
                blocks.push(TextBlock {
                    text: fallback,
                    bbox: (36.0, height - 48.0, width - 36.0, height - 36.0),
                    style: default_style(),
                });
            }
        }
        let _ = merge_blocks_text(&blocks);
        out.push(ExtractedPage {
            width,
            height,
            text_blocks: blocks,
            rendered_image: None,
        });
    }

    if out.is_empty() {
        return Err(PdfExportError::Pipeline("No pages found in PDF.".into()));
    }
    Ok(out)
}

fn page_size(doc: &Document, page_id: lopdf::ObjectId) -> Option<(f32, f32)> {
    let page = doc.get_object(page_id).ok()?;
    let dict = page.as_dict().ok()?;
    let media = dict.get(b"MediaBox").ok()?.as_array().ok()?;
    if media.len() >= 4 {
        let w = media[2].as_float().ok()? - media[0].as_float().ok()?;
        let h = media[3].as_float().ok()? - media[1].as_float().ok()?;
        return Some((w as f32, h as f32));
    }
    None
}

fn extract_text_blocks(doc: &Document, page_id: lopdf::ObjectId) -> Vec<TextBlock> {
    let mut blocks = Vec::new();
    let Ok(page) = doc.get_object(page_id) else {
        return blocks;
    };
    let Ok(dict) = page.as_dict() else {
        return blocks;
    };
    let Ok(contents) = dict.get(b"Contents") else {
        return blocks;
    };

    let mut y_cursor = 800.0_f32;
    let mut x_cursor = 36.0_f32;
    let mut current = String::new();
    let style = default_style();

    let flush = |blocks: &mut Vec<TextBlock>, text: &mut String, x: f32, y: f32| {
        let t = text.trim().to_string();
        if !t.is_empty() {
            blocks.push(TextBlock {
                text: t,
                bbox: (x, y, (x + 220.0).min(560.0), y + 14.0),
                style: style.clone(),
            });
        }
        text.clear();
    };

    let content_streams: Vec<lopdf::ObjectId> = match contents {
        Object::Reference(r) => vec![*r],
        Object::Array(arr) => arr.iter().filter_map(|o| o.as_reference().ok()).collect(),
        _ => Vec::new(),
    };

    for stream_id in content_streams {
        let Ok(stream) = doc.get_object(stream_id) else {
            continue;
        };
        let Ok(content) = stream.as_stream().and_then(|s| s.decompressed_content()) else {
            continue;
        };
        let content_str = String::from_utf8_lossy(&content);
        for line in content_str.lines() {
            let line = line.trim();
            if line.ends_with(" Tj") || line.ends_with(" TJ") {
                if let Some(text) = parse_tj_operand(line) {
                    current.push_str(&text);
                    current.push(' ');
                }
            } else if line.ends_with(" Td") || line.ends_with(" TD") {
                flush(&mut blocks, &mut current, x_cursor, y_cursor);
                if let Some((tx, ty)) = parse_two_floats(line) {
                    x_cursor = tx;
                    y_cursor = ty;
                }
            } else if line.ends_with(" Tm") {
                flush(&mut blocks, &mut current, x_cursor, y_cursor);
                if let Some(vals) = parse_tm(line) {
                    x_cursor = vals.0;
                    y_cursor = vals.1;
                }
            }
        }
        flush(&mut blocks, &mut current, x_cursor, y_cursor);
    }

    blocks
}

fn parse_tj_operand(line: &str) -> Option<String> {
    let open = line.find('(')?;
    let rest = &line[open + 1..];
    let close = rest.find(')')?;
    Some(unescape_pdf_string(&rest[..close]))
}

fn unescape_pdf_string(s: &str) -> String {
    let mut out = String::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            if let Some(n) = chars.next() {
                match n {
                    'n' => out.push('\n'),
                    'r' => out.push('\r'),
                    't' => out.push('\t'),
                    _ => out.push(n),
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

fn parse_two_floats(line: &str) -> Option<(f32, f32)> {
    let nums: Vec<f32> = line
        .split_whitespace()
        .filter_map(|t| t.parse().ok())
        .collect();
    if nums.len() >= 2 {
        Some((nums[nums.len() - 2], nums[nums.len() - 1]))
    } else {
        None
    }
}

fn parse_tm(line: &str) -> Option<(f32, f32)> {
    let nums: Vec<f32> = line
        .split_whitespace()
        .filter_map(|t| t.parse().ok())
        .collect();
    if nums.len() >= 6 {
        Some((nums[4], nums[5]))
    } else {
        None
    }
}
