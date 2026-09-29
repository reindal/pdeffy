use super::ExportOutput;
use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::layout::region_plain_text;
use crate::pdf_to_office::model::{DocumentModel, RegionType};

pub fn export_txt(model: &DocumentModel) -> Result<ExportOutput, PdfExportError> {
    let mut parts = Vec::new();
    for (page_idx, page) in model.pages.iter().enumerate() {
        if model.pages.len() > 1 {
            parts.push(format!("--- Page {} ---", page_idx + 1));
        }
        for region in &page.regions {
            let text = match region.region_type {
                RegionType::Table => region_plain_text(region),
                _ => region_plain_text(region),
            };
            if !text.trim().is_empty() {
                parts.push(text);
            }
        }
    }
    let body = parts.join("\n\n");
    Ok(ExportOutput {
        bytes: body.into_bytes(),
        file_extension: "txt".into(),
    })
}
