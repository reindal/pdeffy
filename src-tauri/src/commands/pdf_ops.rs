use lopdf::{Dictionary, Document, Object, ObjectId, Stream};
use regex::Regex;
use serde::Deserialize;
use std::collections::{BTreeMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use super::ghostscript;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedactRegion {
    pub page: u32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitPagesRequest {
    pub path: String,
    pub page_ranges: Option<Vec<String>>,
    pub every_n: Option<u32>,
    pub output_dir: Option<String>,
    pub zip_output: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotateRequest {
    pub path: String,
    pub rotations: BTreeMap<u32, i32>,
    pub output: String,
}

#[tauri::command]
pub fn pdf_merge(paths: Vec<String>, output: String) -> Result<serde_json::Value, String> {
    if paths.is_empty() {
        return Err("No input paths provided.".into());
    }

    let mut merged = Document::load(&paths[0]).map_err(|e| e.to_string())?;
    for path in paths.iter().skip(1) {
        let incoming = Document::load(path).map_err(|e| e.to_string())?;
        append_document(&mut merged, incoming)?;
    }

    merged.save(&output).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "output": output }))
}

fn get_pages_root_id(doc: &Document) -> Result<ObjectId, String> {
    let catalog_ref = doc
        .trailer
        .get(b"Root")
        .map_err(|e| e.to_string())?
        .as_reference()
        .map_err(|e| e.to_string())?;
    let catalog = doc
        .get_object(catalog_ref)
        .map_err(|e| e.to_string())?
        .as_dict()
        .map_err(|e| e.to_string())?;
    catalog
        .get(b"Pages")
        .map_err(|e| e.to_string())?
        .as_reference()
        .map_err(|e| e.to_string())
}

fn append_document(base: &mut Document, mut incoming: Document) -> Result<(), String> {
    incoming.renumber_objects_with(base.max_id + 1);

    let pages_root = get_pages_root_id(base)?;
    let incoming_pages: Vec<ObjectId> = incoming.get_pages().into_values().collect();
    let imported_count = incoming_pages.len() as i64;

    let imported_objects: Vec<(ObjectId, Object)> = incoming.objects.into_iter().collect();
    for (id, obj) in imported_objects {
        base.objects.insert(id, obj);
    }

    for page_id in &incoming_pages {
        if let Ok(page_obj) = base.get_object_mut(*page_id) {
            if let Ok(dict) = page_obj.as_dict_mut() {
                dict.set("Parent", Object::Reference(pages_root));
            }
        }
    }

    let pages_dict = base
        .get_object_mut(pages_root)
        .map_err(|e| e.to_string())?
        .as_dict_mut()
        .map_err(|e| e.to_string())?;

    {
        let kids = pages_dict
            .get_mut(b"Kids")
            .map_err(|e| e.to_string())?
            .as_array_mut()
            .map_err(|e| e.to_string())?;

        for page_id in incoming_pages {
            kids.push(Object::Reference(page_id));
        }
    }

    let current_count = pages_dict
        .get(b"Count")
        .ok()
        .and_then(|o| o.as_i64().ok())
        .unwrap_or(0);
    pages_dict.set("Count", Object::Integer(current_count + imported_count));

    base.max_id = base.max_id.max(incoming.max_id);
    Ok(())
}

#[tauri::command]
pub fn pdf_split_pages(request: SplitPagesRequest) -> Result<serde_json::Value, String> {
    let source = Document::load(&request.path).map_err(|e| e.to_string())?;
    let total = source.get_pages().len();

    let ranges = if let Some(every_n) = request.every_n.filter(|n| *n > 0) {
        let mut chunks = Vec::new();
        let mut start = 1usize;
        while start <= total {
            let end = (start + every_n as usize - 1).min(total);
            chunks.push((start, end));
            start = end + 1;
        }
        chunks
    } else if let Some(specs) = request.page_ranges {
        parse_page_ranges(&specs, total)?
    } else {
        (1..=total).map(|p| (p, p)).collect()
    };

    let output_dir = if let Some(dir) = request.output_dir.clone() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        PathBuf::from(dir)
    } else {
        std::env::temp_dir().join(format!("pdeffy_split_{}", uuid::Uuid::new_v4()))
    };
    fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;

    let source_path = PathBuf::from(&request.path);
    let stem = source_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("split")
        .to_string();

    let mut created = Vec::new();
    for (idx, (start, end)) in ranges.iter().enumerate() {
        let mut part = Document::load(&request.path).map_err(|e| e.to_string())?;
        let all_pages: Vec<u32> = part.get_pages().into_keys().collect();
        let mut keep = HashSet::new();
        for page in *start..=*end {
            keep.insert(page as u32);
        }
        let delete: Vec<u32> = all_pages
            .into_iter()
            .filter(|p| !keep.contains(p))
            .collect();
        part.delete_pages(&delete);

        let out_file = output_dir.join(format!("{stem}_part_{}.pdf", idx + 1));
        part.save(&out_file).map_err(|e| e.to_string())?;
        created.push(out_file.to_string_lossy().to_string());
    }

    if let Some(zip_path) = request.zip_output {
        zip_files(created.clone(), zip_path.clone())?;
        Ok(serde_json::json!({
            "success": true,
            "files": created,
            "zip": zip_path
        }))
    } else {
        Ok(serde_json::json!({
            "success": true,
            "files": created,
            "outputDir": output_dir.to_string_lossy()
        }))
    }
}

fn parse_page_ranges(specs: &[String], total: usize) -> Result<Vec<(usize, usize)>, String> {
    let mut ranges = Vec::new();
    for spec in specs {
        if spec.contains('-') {
            let parts: Vec<&str> = spec.split('-').collect();
            if parts.len() != 2 {
                return Err(format!("Invalid page range: {spec}"));
            }
            let start: usize = parts[0]
                .trim()
                .parse()
                .map_err(|_| format!("Invalid page range: {spec}"))?;
            let end: usize = parts[1]
                .trim()
                .parse()
                .map_err(|_| format!("Invalid page range: {spec}"))?;
            if start == 0 || end == 0 || start > total || end > total || start > end {
                return Err(format!("Page range out of bounds: {spec}"));
            }
            ranges.push((start, end));
        } else {
            let page: usize = spec
                .trim()
                .parse()
                .map_err(|_| format!("Invalid page: {spec}"))?;
            if page == 0 || page > total {
                return Err(format!("Page out of bounds: {spec}"));
            }
            ranges.push((page, page));
        }
    }
    Ok(ranges)
}

#[tauri::command]
pub fn pdf_rotate(request: RotateRequest) -> Result<serde_json::Value, String> {
    let mut doc = Document::load(&request.path).map_err(|e| e.to_string())?;
    let pages = doc.get_pages();

    for (page_num, page_id) in pages {
        let rotation = request.rotations.get(&page_num).copied().unwrap_or(0);
        if rotation == 0 {
            continue;
        }

        if let Ok(page_obj) = doc.get_object_mut(page_id) {
            if let Ok(dict) = page_obj.as_dict_mut() {
                let current = dict
                    .get(b"Rotate")
                    .ok()
                    .and_then(|o| o.as_i64().ok())
                    .unwrap_or(0);
                dict.set("Rotate", Object::Integer(current + rotation as i64));
            }
        }
    }

    doc.save(&request.output).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "output": request.output }))
}

#[tauri::command]
pub fn pdf_delete_pages(
    path: String,
    pages_to_delete: Vec<u32>,
    output: String,
) -> Result<serde_json::Value, String> {
    let mut doc = Document::load(&path).map_err(|e| e.to_string())?;
    let remaining = doc.get_pages().len().saturating_sub(pages_to_delete.len());
    if remaining == 0 {
        return Err("Cannot delete all pages.".into());
    }

    doc.delete_pages(&pages_to_delete);
    doc.save(&output).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "output": output }))
}

#[tauri::command]
pub fn pdf_redact_true(
    path: String,
    regions: Vec<RedactRegion>,
    output: String,
) -> Result<serde_json::Value, String> {
    let mut doc = Document::load(&path).map_err(|e| e.to_string())?;
    let pages = doc.get_pages();

    let mut by_page: BTreeMap<u32, Vec<&RedactRegion>> = BTreeMap::new();
    for region in &regions {
        by_page.entry(region.page).or_default().push(region);
    }

    for (page_num, page_id) in pages {
        let Some(page_regions) = by_page.get(&page_num) else {
            continue;
        };
        redact_page(&mut doc, page_id, page_regions)?;
    }

    doc.save(&output).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "output": output }))
}

fn page_height(doc: &Document, page_id: ObjectId) -> f64 {
    doc.get_object(page_id)
        .ok()
        .and_then(|o| o.as_dict().ok())
        .and_then(|d| d.get(b"MediaBox").ok())
        .and_then(|o| o.as_array().ok())
        .and_then(|arr| arr.get(3))
        .and_then(|o| o.as_i64().ok().map(|v| v as f64))
        .unwrap_or(792.0)
}

fn redact_page(
    doc: &mut Document,
    page_id: ObjectId,
    regions: &[&RedactRegion],
) -> Result<(), String> {
    let height = page_height(doc, page_id);
    let content = doc
        .get_page_content(page_id)
        .map_err(|e| e.to_string())?;
    let content_str = String::from_utf8_lossy(&content);
    let filtered = filter_text_in_regions(&content_str, regions, height);

    let mut overlay = String::from("\nq\n");
    for region in regions {
        let pdf_y = height - region.y - region.height;
        overlay.push_str(&format!(
            "{} {} {} {} re f\n",
            region.x, pdf_y, region.width, region.height
        ));
    }
    overlay.push_str("Q\n");

    let mut combined = filtered;
    combined.push_str(&overlay);
    doc.change_page_content(page_id, combined.into_bytes())
        .map_err(|e| e.to_string())
}

fn filter_text_in_regions(content: &str, regions: &[&RedactRegion], page_height: f64) -> String {
    let tm_re = Regex::new(
        r"(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Tm",
    )
    .unwrap();
    let tj_re = Regex::new(r"\((?:\\.|[^\\)])*\)\s*Tj").unwrap();

    let mut x = 0.0;
    let mut y = 0.0;
    let mut out_lines: Vec<String> = Vec::new();

    for line in content.lines() {
        if let Some(caps) = tm_re.captures(line) {
            x = caps[5].parse().unwrap_or(x);
            y = caps[6].parse().unwrap_or(y);
            out_lines.push(line.to_string());
            continue;
        }

        if tj_re.is_match(line) {
            let top = page_height - y;
            let intersects = regions.iter().any(|r| {
                let rx2 = r.x + r.width;
                let ry2 = r.y + r.height;
                x >= r.x && x <= rx2 && top >= r.y && top <= ry2
            });
            if !intersects {
                out_lines.push(line.to_string());
            }
            continue;
        }

        out_lines.push(line.to_string());
    }

    out_lines.join("\n")
}

#[tauri::command(rename = "pdf_to_images_gs")]
pub fn pdf_to_images_gs(
    app: AppHandle,
    path: String,
    output_dir: String,
    format: String,
    dpi: u32,
) -> Result<serde_json::Value, String> {
    let gs = ghostscript::find_ghostscript_path(&app)
        .ok_or_else(|| "Ghostscript not found on this system.".to_string())?;
    let files = ghostscript::pdf_to_images(
        &gs,
        Path::new(&path),
        Path::new(&output_dir),
        &format,
        dpi,
    )?;
    Ok(serde_json::json!({
        "success": true,
        "files": files.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>()
    }))
}

#[tauri::command]
pub fn image_to_pdf(image_paths: Vec<String>, output: String) -> Result<serde_json::Value, String> {
    if image_paths.is_empty() {
        return Err("No images provided.".into());
    }

    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let mut kids = Vec::new();

    for image_path in &image_paths {
        let img_path = Path::new(image_path);
        let img = image::open(img_path).map_err(|e| e.to_string())?;
        let (width, height) = (img.width(), img.height());
        let rgb = img.to_rgb8();
        let data = rgb.into_raw();

        let img_stream = Stream::new(
            Dictionary::from_iter(vec![
                ("Type", Object::Name(b"XObject".to_vec())),
                ("Subtype", Object::Name(b"Image".to_vec())),
                ("Width", Object::Integer(width as i64)),
                ("Height", Object::Integer(height as i64)),
                ("ColorSpace", Object::Name(b"DeviceRGB".to_vec())),
                ("BitsPerComponent", Object::Integer(8)),
            ]),
            data,
        );
        let img_id = doc.add_object(Object::Stream(img_stream));

        let content = format!("q {} 0 0 {} 0 0 cm /Im1 Do Q", width, height);
        let content_id = doc.add_object(Object::Stream(Stream::new(
            Dictionary::new(),
            content.into_bytes(),
        )));

        let resources = Dictionary::from_iter(vec![(
            "XObject",
            Object::Dictionary(Dictionary::from_iter(vec![("Im1", Object::Reference(img_id))])),
        )]);

        let page_id = doc.add_object(Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Page".to_vec())),
            (
                "MediaBox",
                Object::Array(vec![
                    Object::Integer(0),
                    Object::Integer(0),
                    Object::Integer(width as i64),
                    Object::Integer(height as i64),
                ]),
            ),
            ("Resources", Object::Dictionary(resources)),
            ("Contents", Object::Reference(content_id)),
        ]));
        kids.push(Object::Reference(page_id));
    }

    doc.objects.insert(
        pages_id,
        Object::Dictionary(Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Pages".to_vec())),
            ("Count", Object::Integer(kids.len() as i64)),
            ("Kids", Object::Array(kids)),
        ])),
    );

    let catalog_id = doc.add_object(Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Catalog".to_vec())),
        ("Pages", Object::Reference(pages_id)),
    ]));
    doc.trailer.set("Root", Object::Reference(catalog_id));

    doc.save(&output).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "output": output }))
}

#[tauri::command]
pub fn zip_files(paths: Vec<String>, output: String) -> Result<serde_json::Value, String> {
    let file = File::create(&output).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for path in paths {
        let src = Path::new(&path);
        if !src.exists() {
            continue;
        }
        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file");
        zip.start_file(name, options).map_err(|e| e.to_string())?;
        let mut input = File::open(src).map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        input.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        zip.write_all(&buffer).map_err(|e| e.to_string())?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "output": output }))
}
