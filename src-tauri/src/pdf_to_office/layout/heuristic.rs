use crate::pdf_to_office::extract::merge_blocks_text;
use crate::pdf_to_office::model::{
    LayoutRegion, PageModel, RegionType, TextBlock, TextStyleFlags,
};
use std::collections::BTreeMap;

fn cluster_rows(blocks: &[TextBlock], y_tol: f32) -> BTreeMap<i32, Vec<TextBlock>> {
    let mut rows: BTreeMap<i32, Vec<TextBlock>> = BTreeMap::new();
    for b in blocks {
        let key = (b.bbox.1 / y_tol).round() as i32;
        rows.entry(key).or_default().push(b.clone());
    }
    rows
}

/// Phase 2 fallback when ONNX layout model is unavailable.
pub fn classify_extracted_pages(pages: Vec<super::super::extract::ExtractedPage>) -> Vec<PageModel> {
    pages
        .into_iter()
        .map(|p| PageModel {
            width: p.width,
            height: p.height,
            regions: blocks_to_regions(&p.text_blocks, p.width, p.height),
            rendered_image: p.rendered_image,
        })
        .collect()
}

fn blocks_to_regions(blocks: &[TextBlock], width: f32, height: f32) -> Vec<LayoutRegion> {
    if blocks.is_empty() {
        return Vec::new();
    }

    let max_font = blocks
        .iter()
        .filter_map(|b| b.style.font_size_pt)
        .fold(0.0_f32, f32::max);

    if let Some(table) = detect_table_region(blocks) {
        let table_bbox = table.bbox;
        let mut regions = vec![table];
        for b in blocks {
            if !inside_bbox(b, table_bbox) {
                regions.push(single_block_region(b, max_font, width, height));
            }
        }
        regions.sort_by(|a, b| reading_order_key(a).cmp(&reading_order_key(b)));
        return regions;
    }

    let mut regions: Vec<LayoutRegion> = blocks
        .iter()
        .map(|b| single_block_region(b, max_font, width, height))
        .collect();
    regions.sort_by(|a, b| reading_order_key(a).cmp(&reading_order_key(b)));
    regions
}

fn reading_order_key(r: &LayoutRegion) -> (i32, i32) {
    let (_, y, _, _) = r.bbox;
    (-(y * 10.0) as i32, (r.bbox.0 * 10.0) as i32)
}

fn inside_bbox(b: &TextBlock, bbox: (f32, f32, f32, f32)) -> bool {
    b.bbox.0 >= bbox.0 - 2.0
        && b.bbox.1 >= bbox.1 - 2.0
        && b.bbox.0 <= bbox.2 + 2.0
        && b.bbox.1 <= bbox.3 + 2.0
}

fn single_block_region(b: &TextBlock, max_font: f32, width: f32, height: f32) -> LayoutRegion {
    let region_type = infer_region_type(b, max_font, width, height);
    LayoutRegion {
        region_type,
        bbox: b.bbox,
        text_blocks: vec![b.clone()],
        table_cells: None,
        figure_image: None,
    }
}

fn infer_region_type(b: &TextBlock, max_font: f32, width: f32, height: f32) -> RegionType {
    let text = b.text.trim();
    let size = b.style.font_size_pt.unwrap_or(11.0);
    let (_, y, _, _) = b.bbox;

    if y > height * 0.92 {
        return RegionType::PageHeader;
    }
    if y < height * 0.08 {
        return RegionType::Footer;
    }
    if size >= max_font - 0.5 && max_font >= 14.0 {
        return RegionType::Title;
    }
    if size >= max_font - 1.0 && max_font >= 12.0 {
        return RegionType::SectionHeader;
    }
    if text.starts_with("- ")
        || text.starts_with("• ")
        || text.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)
            && text.contains(". ")
    {
        return RegionType::ListItem;
    }
    let _ = width;
    RegionType::Text
}

fn detect_table_region(blocks: &[TextBlock]) -> Option<LayoutRegion> {
    let rows = cluster_rows(blocks, 4.0);
    if rows.len() < 2 {
        return None;
    }
    let mut row_lens: Vec<usize> = rows.values().map(|r| r.len()).collect();
    row_lens.sort_unstable();
    let median = row_lens[row_lens.len() / 2];
    if median < 2 {
        return None;
    }
    let consistent = rows.values().filter(|r| r.len() == median).count();
    if consistent < 2 {
        return None;
    }

    let mut cells: Vec<Vec<String>> = Vec::new();
    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = 0.0_f32;
    let mut max_y = 0.0_f32;

    for (_, mut row_blocks) in rows {
        row_blocks.sort_by(|a, b| a.bbox.0.partial_cmp(&b.bbox.0).unwrap_or(std::cmp::Ordering::Equal));
        if row_blocks.len() != median {
            continue;
        }
        let row: Vec<String> = row_blocks
            .iter()
            .map(|b| b.text.trim().to_string())
            .collect();
        for b in &row_blocks {
            min_x = min_x.min(b.bbox.0);
            min_y = min_y.min(b.bbox.1);
            max_x = max_x.max(b.bbox.2);
            max_y = max_y.max(b.bbox.3);
        }
        cells.push(row);
    }

    if cells.len() < 2 {
        return None;
    }

    Some(LayoutRegion {
        region_type: RegionType::Table,
        bbox: (min_x, min_y, max_x, max_y),
        text_blocks: blocks.to_vec(),
        table_cells: Some(cells),
        figure_image: None,
    })
}

pub fn infer_heading_level(style: &TextStyleFlags, max_font: f32) -> u8 {
    let size = style.font_size_pt.unwrap_or(11.0);
    if size >= max_font - 0.25 {
        1
    } else if size >= max_font - 2.0 {
        2
    } else {
        3
    }
}

pub fn region_plain_text(region: &LayoutRegion) -> String {
    if let Some(cells) = &region.table_cells {
        return cells
            .iter()
            .map(|row| row.join("\t"))
            .collect::<Vec<_>>()
            .join("\n");
    }
    merge_blocks_text(&region.text_blocks)
}
