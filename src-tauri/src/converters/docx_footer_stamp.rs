//! Stamp footer graphics from a template DOCX onto PDFs (LibreOffice keeps text but drops images).

use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

use lopdf::{Dictionary, Document, Object, ObjectId, Stream};
use regex::Regex;
use zip::read::ZipArchive;

const EMU_PER_PT: f64 = 914400.0 / 72.0;

pub struct FooterGraphic {
    pub rgb: Vec<u8>,
    pub width_px: u32,
    pub height_px: u32,
    /// PDF user space: from bottom-left of page.
    pub x_pt: f64,
    pub y_pt: f64,
    pub draw_w_pt: f64,
    pub draw_h_pt: f64,
}

fn emu_to_pt(emu: f64) -> f64 {
    emu / EMU_PER_PT
}

fn read_zip_file(archive: &mut ZipArchive<Cursor<Vec<u8>>>, path: &str) -> Option<Vec<u8>> {
    let mut entry = archive.by_name(path).ok()?;
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf).ok()?;
    Some(buf)
}

fn rels_target_map(rels_xml: &str) -> HashMap<String, String> {
    let re = Regex::new(r#"Id="([^"]+)"[^>]*Target="([^"]+)""#).unwrap();
    let mut map = HashMap::new();
    for cap in re.captures_iter(rels_xml) {
        if let (Some(id), Some(target)) = (cap.get(1), cap.get(2)) {
            map.insert(id.as_str().to_string(), target.as_str().to_string());
        }
    }
    map
}

fn parse_footer_graphics(footer_xml: &str, rels_xml: &str) -> Vec<(String, f64, f64, f64, f64)> {
    let rels = rels_target_map(rels_xml);
    let embed_re = Regex::new(r#"r:embed="([^"]+)""#).unwrap();
    let extent_re = Regex::new(r#"cx="(\d+)"\s+cy="(\d+)""#).unwrap();
    let pos_v_re = Regex::new(r#"(?s)positionV[^>]*>.*?posOffset>(\d+)<"#).unwrap();
    let align_right = footer_xml.contains("<wp:align>right</wp:align>")
        || footer_xml.contains("<wp:align>right</wp:align>");

    let mut out = Vec::new();
    for cap in embed_re.captures_iter(footer_xml) {
        let Some(rid) = cap.get(1) else { continue };
        let Some(target) = rels.get(rid.as_str()) else { continue };
        let media = if target.starts_with("media/") {
            format!("word/{target}")
        } else {
            format!("word/{target}")
        };

        let (cx, cy) = extent_re
            .captures(footer_xml)
            .and_then(|c| {
                Some((
                    c.get(1)?.as_str().parse::<f64>().ok()?,
                    c.get(2)?.as_str().parse::<f64>().ok()?,
                ))
            })
            .unwrap_or((914400.0 * 1.5, 914400.0 * 0.4));

        let draw_w = emu_to_pt(cx);
        let draw_h = emu_to_pt(cy);
        let y_pt = pos_v_re
            .captures(footer_xml)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse::<f64>().ok())
            .map(emu_to_pt)
            .unwrap_or(36.0);

        let x_pt = if align_right {
            -1.0
        } else {
            36.0
        };

        out.push((media, x_pt, y_pt, draw_w, draw_h));
    }
    out
}

pub fn extract_footer_graphics(template_path: &Path) -> Result<Vec<FooterGraphic>, String> {
    let bytes = std::fs::read(template_path).map_err(|e| e.to_string())?;
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("Template ZIP: {e}"))?;

    let mut footer_parts: Vec<String> = Vec::new();
    for i in 0..archive.len() {
        let Ok(entry) = archive.by_index(i) else { continue };
        let name = entry.name().to_string();
        if name.starts_with("word/footer") && name.ends_with(".xml") {
            footer_parts.push(name);
        }
    }

    let zip_bytes = std::fs::read(template_path).map_err(|e| e.to_string())?;
    let mut archive =
        ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| format!("Template ZIP: {e}"))?;

    let mut specs = Vec::new();
    for footer in &footer_parts {
        let rels_path = format!(
            "word/_rels/{}",
            footer.strip_prefix("word/").unwrap_or(footer).replace(".xml", ".xml.rels")
        );
        let Some(footer_xml) = read_zip_file(&mut archive, footer).and_then(|b| String::from_utf8(b).ok()) else {
            continue;
        };
        let rels_xml = read_zip_file(&mut archive, &rels_path)
            .and_then(|b| String::from_utf8(b).ok())
            .unwrap_or_default();
        specs.extend(parse_footer_graphics(&footer_xml, &rels_xml));
    }

    let zip_bytes = std::fs::read(template_path).map_err(|e| e.to_string())?;
    let mut archive =
        ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| format!("Template ZIP: {e}"))?;

    let mut graphics = Vec::new();
    for (media_path, x_pt, y_pt, draw_w, draw_h) in specs {
        let Some(raw) = read_zip_file(&mut archive, &media_path) else {
            continue;
        };
        let img = image::load_from_memory(&raw).map_err(|e| format!("Immagine footer: {e}"))?;
        let rgb8 = img.to_rgb8();
        let (width_px, height_px) = rgb8.dimensions();
        graphics.push(FooterGraphic {
            rgb: rgb8.into_raw(),
            width_px,
            height_px,
            x_pt,
            y_pt,
            draw_w_pt: draw_w,
            draw_h_pt: draw_h,
        });
    }
    Ok(graphics)
}

fn page_size(doc: &Document, page_id: ObjectId) -> (f64, f64) {
    doc.get_object(page_id)
        .ok()
        .and_then(|o| o.as_dict().ok())
        .and_then(|d| d.get(b"MediaBox").ok())
        .and_then(|o| o.as_array().ok())
        .map(|arr| {
            let w = arr.get(2).and_then(|o| o.as_i64().ok()).unwrap_or(595) as f64;
            let h = arr.get(3).and_then(|o| o.as_i64().ok()).unwrap_or(842) as f64;
            (w, h)
        })
        .unwrap_or((595.0, 842.0))
}

fn page_content_bytes(doc: &Document, page_dict: &Dictionary) -> Result<Vec<u8>, String> {
    match page_dict.get(b"Contents") {
        Ok(Object::Reference(content_ref)) => {
            let o = doc.get_object(*content_ref).map_err(|e| e.to_string())?;
            match o.as_stream() {
                Ok(s) => Ok(s.content.clone()),
                Err(_) => Err("Contents non valido".to_string()),
            }
        }
        Ok(Object::Array(refs)) => {
            let mut merged = Vec::new();
            for obj in refs {
                if let Object::Reference(r) = obj {
                    if let Ok(Object::Stream(s)) = doc.get_object(*r) {
                        merged.extend_from_slice(&s.content);
                    }
                }
            }
            Ok(merged)
        }
        _ => Ok(Vec::new()),
    }
}

fn stamp_graphic_on_page(
    doc: &mut Document,
    page_id: ObjectId,
    g: &FooterGraphic,
    idx: usize,
) -> Result<(), String> {
    let (page_w, _page_h) = page_size(doc, page_id);
    let x = if g.x_pt < 0.0 {
        page_w - g.draw_w_pt - 36.0
    } else {
        g.x_pt
    };
    let y = g.y_pt;

    let img_stream = Stream::new(
        Dictionary::from_iter(vec![
            ("Type", Object::Name(b"XObject".to_vec())),
            ("Subtype", Object::Name(b"Image".to_vec())),
            ("Width", Object::Integer(g.width_px as i64)),
            ("Height", Object::Integer(g.height_px as i64)),
            ("ColorSpace", Object::Name(b"DeviceRGB".to_vec())),
            ("BitsPerComponent", Object::Integer(8)),
        ]),
        g.rgb.clone(),
    );
    let img_id = doc.add_object(Object::Stream(img_stream));
    let im_name = format!("PdeffyFt{idx}");

    let draw_ops = format!(
        "q {} 0 0 {} {} {} cm /{} Do Q\n",
        g.draw_w_pt, g.draw_h_pt, x, y, im_name
    );

    let page_dict = doc
        .get_object(page_id)
        .map_err(|e| e.to_string())?
        .as_dict()
        .map_err(|_| "Pagina PDF non valida".to_string())?
        .clone();

    let mut merged = page_content_bytes(doc, &page_dict)?;
    merged.extend_from_slice(draw_ops.as_bytes());
    let new_content_id = doc.add_object(Object::Stream(Stream::new(Dictionary::new(), merged)));

    let mut resources = match page_dict.get(b"Resources") {
        Ok(Object::Dictionary(d)) => d.clone(),
        Ok(Object::Reference(r)) => doc
            .get_object(*r)
            .ok()
            .and_then(|o| o.as_dict().ok())
            .cloned()
            .unwrap_or_default(),
        _ => Dictionary::new(),
    };
    let mut xobj_dict = match resources.get(b"XObject") {
        Ok(Object::Dictionary(d)) => d.clone(),
        _ => Dictionary::new(),
    };
    xobj_dict.set(
        im_name.as_bytes().to_vec(),
        Object::Reference(img_id),
    );
    resources.set("XObject", Object::Dictionary(xobj_dict));
    let resources_id = doc.add_object(Object::Dictionary(resources));

    let page_obj = doc
        .get_object_mut(page_id)
        .map_err(|e| e.to_string())?
        .as_dict_mut()
        .map_err(|_| "Pagina PDF non valida".to_string())?;
    page_obj.set("Contents", Object::Reference(new_content_id));
    page_obj.set("Resources", Object::Reference(resources_id));
    Ok(())
}

pub fn stamp_graphical_footer_on_pdf(pdf_path: &Path, graphics: &[FooterGraphic]) -> Result<(), String> {
    if graphics.is_empty() {
        return Ok(());
    }
    let mut doc = Document::load(pdf_path).map_err(|e| e.to_string())?;
    let pages: Vec<ObjectId> = doc.get_pages().into_values().collect();
    for page_id in pages {
        for (i, g) in graphics.iter().enumerate() {
            stamp_graphic_on_page(&mut doc, page_id, g, i)?;
        }
    }
    doc.save(pdf_path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn stamp_graphical_footer_from_template(
    template_path: &Path,
    pdf_paths: &[PathBuf],
) -> Result<(), String> {
    let graphics = extract_footer_graphics(template_path)?;
    if graphics.is_empty() {
        return Ok(());
    }
    for pdf in pdf_paths {
        if pdf.is_file() {
            stamp_graphical_footer_on_pdf(pdf, &graphics)?;
        }
    }
    Ok(())
}
