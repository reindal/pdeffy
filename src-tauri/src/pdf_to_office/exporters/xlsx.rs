use super::ExportOutput;
use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::layout::region_plain_text;
use crate::pdf_to_office::model::{DocumentModel, RegionType};
use rust_xlsxwriter::{Workbook, Worksheet};

pub fn export_xlsx(model: &DocumentModel) -> Result<ExportOutput, PdfExportError> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name("Export").map_err(map_xlsx_err)?;

    let mut row: u32 = 0;
    let mut last_page = 0_usize;

    for (page_idx, page) in model.pages.iter().enumerate() {
        if page_idx != last_page && model.pages.len() > 1 {
            if row > 0 {
                row += 1;
                write_row(sheet, row, &format!("— Page {} —", page_idx + 1))?;
                row += 1;
            }
            last_page = page_idx;
        }

        for region in &page.regions {
            match region.region_type {
                RegionType::Table => {
                    if let Some(cells) = &region.table_cells {
                        for table_row in cells {
                            row += 1;
                            for (col, value) in table_row.iter().enumerate() {
                                sheet
                                    .write_string(row, col as u16, value)
                                    .map_err(map_xlsx_err)?;
                            }
                        }
                        row += 1;
                    }
                }
                _ => {
                    let text = region_plain_text(region);
                    if text.trim().is_empty() {
                        continue;
                    }
                    row += 1;
                    write_row(sheet, row, &text)?;
                }
            }
        }
    }

    let bytes = workbook
        .save_to_buffer()
        .map_err(|e| PdfExportError::Export(e.to_string()))?;
    Ok(ExportOutput {
        bytes,
        file_extension: "xlsx".into(),
    })
}

fn write_row(sheet: &mut Worksheet, row: u32, text: &str) -> Result<(), PdfExportError> {
    sheet
        .write_string(row, 0, text)
        .map_err(map_xlsx_err)?;
    Ok(())
}

fn map_xlsx_err(e: rust_xlsxwriter::XlsxError) -> PdfExportError {
    PdfExportError::Export(e.to_string())
}
