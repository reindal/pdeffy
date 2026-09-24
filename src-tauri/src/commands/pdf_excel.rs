use regex::Regex;
use rust_xlsxwriter::{Workbook, Worksheet};
use std::collections::{HashMap, HashSet};
use std::path::Path;

const Y_TOLERANCE: f64 = 0.5;
const X_TOLERANCE: f64 = 0.5;
const PAGE_STACK: f64 = 1000.0;

#[derive(Debug, Clone)]
struct TextElement {
    page: usize,
    x: f64,
    y: f64,
    absolute_y: f64,
    text: String,
}

#[derive(Debug, Clone)]
struct Column {
    center: f64,
    xs: Vec<f64>,
}

pub fn pdf_to_xlsx(input_path: &Path, output_path: &Path) -> Result<(), String> {
    let bytes = std::fs::read(input_path).map_err(|e| e.to_string())?;
    let elements = extract_positioned_text(&bytes).unwrap_or_default();

    if elements.is_empty() {
        let fallback = pdf_extract::extract_text_from_mem(&bytes)
            .map_err(|e| format!("PDF text extraction failed: {e}"))?;
        write_single_column_xlsx(&fallback, output_path)?;
        return Ok(());
    }

    let total_pages = elements
        .iter()
        .map(|e| e.page)
        .max()
        .map(|p| p + 1)
        .unwrap_or(1);

    let text_frequency = build_text_frequency(&elements);
    let filtered: Vec<TextElement> = elements
        .into_iter()
        .filter(|el| {
            let key = format!("{}_{}", el.y.round() as i64, el.text);
            let pages = text_frequency.get(&key).map(|s| s.len()).unwrap_or(0);
            !(total_pages > 1 && pages > 1)
        })
        .collect();

    let global_cols = build_global_columns(&filtered);
    let rows_map = build_rows_map(&filtered);
    let mut final_aoa = map_to_grid(&rows_map, &global_cols);
    final_aoa = prune_empty_rows_and_cols(final_aoa);

    write_grid_xlsx(&final_aoa, output_path)
}

fn build_text_frequency(elements: &[TextElement]) -> HashMap<String, HashSet<usize>> {
    let mut text_frequency: HashMap<String, HashSet<usize>> = HashMap::new();
    for el in elements {
        let key = format!("{}_{}", el.y.round() as i64, el.text);
        text_frequency.entry(key).or_default().insert(el.page);
    }
    text_frequency
}

fn build_global_columns(elements: &[TextElement]) -> Vec<Column> {
    let mut x_coords: Vec<f64> = elements.iter().map(|e| e.x).collect();
    x_coords.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let mut global_cols: Vec<Column> = Vec::new();
    for x in x_coords {
        if let Some(found) = global_cols
            .iter_mut()
            .find(|c| (c.center - x).abs() <= X_TOLERANCE)
        {
            found.xs.push(x);
            found.center = found.xs.iter().sum::<f64>() / found.xs.len() as f64;
        } else {
            global_cols.push(Column {
                center: x,
                xs: vec![x],
            });
        }
    }
    global_cols.sort_by(|a, b| {
        a.center
            .partial_cmp(&b.center)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    global_cols
}

fn build_rows_map(elements: &[TextElement]) -> HashMap<i64, Vec<TextElement>> {
    let mut rows_map: HashMap<i64, Vec<TextElement>> = HashMap::new();
    for el in elements {
        let quantized = (el.absolute_y / Y_TOLERANCE).round() as i64;
        let existing_key = rows_map
            .keys()
            .copied()
            .find(|k| (*k as f64 * Y_TOLERANCE - el.absolute_y).abs() <= Y_TOLERANCE);

        let key = existing_key.unwrap_or(quantized);
        rows_map.entry(key).or_default().push(el.clone());
    }
    rows_map
}

fn map_to_grid(
    rows_map: &HashMap<i64, Vec<TextElement>>,
    global_cols: &[Column],
) -> Vec<Vec<String>> {
    let mut sorted_keys: Vec<i64> = rows_map.keys().copied().collect();
    sorted_keys.sort_by(|a, b| a.cmp(b));

    sorted_keys
        .into_iter()
        .map(|y_key| {
            let mut grid_row = vec![String::new(); global_cols.len()];
            if let Some(row_elements) = rows_map.get(&y_key) {
                for el in row_elements {
                    if let Some(col_idx) = global_cols
                        .iter()
                        .position(|c| (c.center - el.x).abs() <= X_TOLERANCE)
                    {
                        if !grid_row[col_idx].is_empty() {
                            grid_row[col_idx].push(' ');
                            grid_row[col_idx].push_str(&el.text);
                        } else {
                            grid_row[col_idx] = el.text.clone();
                        }
                    }
                }
            }
            grid_row
        })
        .collect()
}

fn prune_empty_rows_and_cols(aoa: Vec<Vec<String>>) -> Vec<Vec<String>> {
    let final_aoa: Vec<Vec<String>> = aoa
        .into_iter()
        .filter(|row| row.iter().any(|cell| !cell.trim().is_empty()))
        .collect();

    if final_aoa.is_empty() {
        return final_aoa;
    }

    let col_count = final_aoa[0].len();
    let mut cols_to_keep = Vec::new();
    for c in 0..col_count {
        if final_aoa
            .iter()
            .any(|row| row.get(c).map(|v| !v.trim().is_empty()).unwrap_or(false))
        {
            cols_to_keep.push(c);
        }
    }

    final_aoa
        .into_iter()
        .map(|row| cols_to_keep.iter().map(|&c| row[c].clone()).collect())
        .collect()
}

fn write_grid_xlsx(aoa: &[Vec<String>], output_path: &Path) -> Result<(), String> {
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    write_aoa(worksheet, aoa)?;
    workbook
        .save(output_path)
        .map_err(|e| format!("Failed to write XLSX: {e}"))
}

fn write_single_column_xlsx(text: &str, output_path: &Path) -> Result<(), String> {
    let rows: Vec<Vec<String>> = text
        .lines()
        .map(|line| vec![line.to_string()])
        .collect();
    write_grid_xlsx(&rows, output_path)
}

fn write_aoa(worksheet: &mut Worksheet, aoa: &[Vec<String>]) -> Result<(), String> {
    for (row_idx, row) in aoa.iter().enumerate() {
        for (col_idx, cell) in row.iter().enumerate() {
            worksheet
                .write_string(row_idx as u32, col_idx as u16, cell)
                .map_err(|e| format!("XLSX cell write failed: {e}"))?;
        }
    }
    Ok(())
}

fn extract_positioned_text(bytes: &[u8]) -> Result<Vec<TextElement>, String> {
    use lopdf::Document;

    let doc = Document::load_mem(bytes).map_err(|e| format!("lopdf load failed: {e}"))?;
    let pages = doc.get_pages();
    let mut elements = Vec::new();

    for (page_idx, (_page_num, page_id)) in pages.iter().enumerate() {
        let content_data = match doc.get_page_content(*page_id) {
            Ok(data) => data,
            Err(_) => continue,
        };
        let content = String::from_utf8_lossy(&content_data);
        elements.extend(parse_content_stream(page_idx, &content));
    }

    Ok(elements)
}

fn parse_content_stream(page: usize, content: &str) -> Vec<TextElement> {
    let tj_re = Regex::new(r"\((?:\\.|[^\\)])*\)\s*Tj").unwrap();
    let tj_array_re = Regex::new(r"\[(.*?)\]\s*TJ").unwrap();
    let tm_re = Regex::new(
        r"(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Tm",
    )
    .unwrap();
    let td_re =
        Regex::new(r"(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Td").unwrap();

    let mut x = 0.0_f64;
    let mut y = 0.0_f64;
    let mut out = Vec::new();

    for line in content.lines() {
        if let Some(caps) = tm_re.captures(line) {
            x = caps[5].parse().unwrap_or(x);
            y = caps[6].parse().unwrap_or(y);
        } else if let Some(caps) = td_re.captures(line) {
            x += caps[1].parse::<f64>().unwrap_or(0.0);
            y += caps[2].parse::<f64>().unwrap_or(0.0);
        }

        for caps in tj_re.captures_iter(line) {
            let raw = caps.get(0).map(|m| m.as_str()).unwrap_or("");
            if let Some(text) = decode_pdf_string(raw.trim_end_matches(" Tj")) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    out.push(TextElement {
                        page,
                        x,
                        y,
                        absolute_y: y + page as f64 * PAGE_STACK,
                        text: trimmed.to_string(),
                    });
                }
            }
        }

        for caps in tj_array_re.captures_iter(line) {
            let inner = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            for part in extract_string_literals(inner) {
                let trimmed = part.trim();
                if !trimmed.is_empty() {
                    out.push(TextElement {
                        page,
                        x,
                        y,
                        absolute_y: y + page as f64 * PAGE_STACK,
                        text: trimmed.to_string(),
                    });
                }
            }
        }
    }

    out
}

fn extract_string_literals(input: &str) -> Vec<String> {
    let re = Regex::new(r"\((?:\\.|[^\\)])*\)").unwrap();
    re.find_iter(input)
        .filter_map(|m| decode_pdf_string(m.as_str()))
        .collect()
}

fn decode_pdf_string(raw: &str) -> Option<String> {
    let inner = raw.trim();
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
