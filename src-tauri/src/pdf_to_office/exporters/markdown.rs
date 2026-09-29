use super::ExportOutput;
use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::layout::infer_heading_level;
use crate::pdf_to_office::model::{DocumentModel, RegionType, TextBlock};

pub fn export_markdown(model: &DocumentModel) -> Result<ExportOutput, PdfExportError> {
    let max_font = model
        .pages
        .iter()
        .flat_map(|p| p.regions.iter())
        .flat_map(|r| r.text_blocks.iter())
        .filter_map(|b| b.style.font_size_pt)
        .fold(0.0_f32, f32::max);

    let mut out = String::new();
    for (page_idx, page) in model.pages.iter().enumerate() {
        if model.pages.len() > 1 {
            out.push_str(&format!("\n\n<!-- page {} -->\n\n", page_idx + 1));
        }
        for region in &page.regions {
            match region.region_type {
                RegionType::Table => {
                    if let Some(cells) = &region.table_cells {
                        out.push_str(&markdown_table(cells));
                        out.push_str("\n\n");
                    }
                }
                RegionType::Title | RegionType::SectionHeader => {
                    let level = region
                        .text_blocks
                        .first()
                        .map(|b| infer_heading_level(&b.style, max_font))
                        .unwrap_or(1);
                    let hashes = "#".repeat(level as usize);
                    out.push_str(&format!(
                        "{hashes} {}\n\n",
                        inline_styles(&region.text_blocks)
                    ));
                }
                RegionType::ListItem => {
                    let text = inline_styles(&region.text_blocks);
                    let line = if text.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)
                    {
                        text
                    } else {
                        format!("- {}", text.trim_start_matches('-').trim())
                    };
                    out.push_str(&format!("{line}\n"));
                }
                _ => {
                    let text = inline_styles(&region.text_blocks);
                    if !text.trim().is_empty() {
                        out.push_str(&format!("{text}\n\n"));
                    }
                }
            }
        }
    }

    Ok(ExportOutput {
        bytes: out.into_bytes(),
        file_extension: "md".into(),
    })
}

fn inline_styles(blocks: &[TextBlock]) -> String {
    blocks
        .iter()
        .map(|b| {
            let mut t = b.text.clone();
            if b.style.bold && b.style.italic {
                t = format!("***{t}***");
            } else if b.style.bold {
                t = format!("**{t}**");
            } else if b.style.italic {
                t = format!("*{t}*");
            }
            t
        })
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn markdown_table(cells: &[Vec<String>]) -> String {
    if cells.is_empty() {
        return String::new();
    }
    let cols = cells.iter().map(|r| r.len()).max().unwrap_or(0);
    let mut lines = Vec::new();
    for (i, row) in cells.iter().enumerate() {
        let mut r = row.clone();
        while r.len() < cols {
            r.push(String::new());
        }
        lines.push(format!("| {} |", r.join(" | ")));
        if i == 0 {
            lines.push(format!(
                "| {} |",
                (0..cols).map(|_| "---").collect::<Vec<_>>().join(" | ")
            ));
        }
    }
    lines.join("\n")
}
