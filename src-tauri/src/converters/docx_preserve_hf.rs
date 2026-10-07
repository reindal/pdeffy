use std::collections::HashSet;
use std::io::{Cursor, Read, Write};
use std::path::Path;

use regex::Regex;
use zip::read::ZipArchive;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

fn should_copy_from_template(name: &str) -> bool {
    if name.starts_with("word/media/") || name.starts_with("word/embeddings/") {
        return true;
    }
    if name.starts_with("word/theme/") {
        return true;
    }
    if name == "word/fontTable.xml" {
        return true;
    }
    if (name.starts_with("word/header") || name.starts_with("word/footer"))
        && name.ends_with(".xml")
    {
        return true;
    }
    if (name.starts_with("word/_rels/header") || name.starts_with("word/_rels/footer"))
        && name.ends_with(".xml.rels")
    {
        return true;
    }
    false
}

fn patch_merged_docx_entry(
    name: &str,
    buf: &[u8],
    template_ct: &Option<Vec<u8>>,
    template_rels: &Option<Vec<u8>>,
    template_document: &Option<Vec<u8>>,
) -> Vec<u8> {
    let Ok(doc_text) = std::str::from_utf8(buf) else {
        return buf.to_vec();
    };
    let patched = match name {
        "[Content_Types].xml" => {
            let Some(tpl) = template_ct.as_ref().and_then(|b| std::str::from_utf8(b).ok()) else {
                return buf.to_vec();
            };
            merge_content_types(tpl, doc_text)
        }
        "word/_rels/document.xml.rels" => {
            let Some(tpl) = template_rels.as_ref().and_then(|b| std::str::from_utf8(b).ok()) else {
                return buf.to_vec();
            };
            merge_document_xml_rels(tpl, doc_text)
        }
        "word/document.xml" => {
            let Some(tpl) = template_document.as_ref().and_then(|b| std::str::from_utf8(b).ok()) else {
                return buf.to_vec();
            };
            patch_document_hf_refs(tpl, doc_text)
        }
        _ => return buf.to_vec(),
    };
    patched.into_bytes()
}

fn merge_content_types(template: &str, doc: &str) -> String {
    let override_re =
        Regex::new(r#"(?s)<Override\s+PartName="([^"]+)"\s+ContentType="[^"]+"\s*/>"#).unwrap();
    let mut out = doc.to_string();
    for cap in override_re.captures_iter(template) {
        let tag = cap.get(0).map(|m| m.as_str()).unwrap_or("");
        let part = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let hf_or_media = part.contains("header")
            || part.contains("footer")
            || part.contains("/media/")
            || part.ends_with(".png")
            || part.ends_with(".jpeg")
            || part.ends_with(".jpg")
            || part.ends_with(".emf")
            || part.ends_with(".wmf");
        if hf_or_media && !out.contains(part) {
            if let Some(idx) = out.rfind("</Types>") {
                out.insert_str(idx, tag);
            }
        }
    }
    out
}

fn merge_document_xml_rels(template: &str, doc: &str) -> String {
    let rel_re = Regex::new(
        r#"(?s)<Relationship\s+[^>]*Target="([^"]+)"[^>]*/>"#,
    )
    .unwrap();
    let mut out = doc.to_string();
    for cap in rel_re.captures_iter(template) {
        let tag = cap.get(0).map(|m| m.as_str()).unwrap_or("");
        let target = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let relevant = target.starts_with("header")
            || target.starts_with("footer")
            || target.starts_with("media/");
        if relevant && !out.contains(&format!("Target=\"{target}\"")) {
            if let Some(idx) = out.rfind("</Relationships>") {
                out.insert_str(idx, tag);
            }
        }
    }
    out
}

fn patch_document_hf_refs(template_doc: &str, doc: &str) -> String {
    let ref_re = Regex::new(r#"<w:(?:header|footer)Reference[^>]*/>"#).unwrap();
    let refs: Vec<String> = ref_re
        .find_iter(template_doc)
        .map(|m| m.as_str().to_string())
        .collect();
    if refs.is_empty() {
        return doc.to_string();
    }
    let mut out = doc.to_string();
    let missing: String = refs
        .iter()
        .filter(|t| !out.contains(t.as_str()))
        .cloned()
        .collect();
    if missing.is_empty() {
        return out;
    }
    if let Some(idx) = out.find("</w:sectPr>") {
        out.insert_str(idx, &missing);
    } else if let Some(idx) = out.find("</w:body>") {
        out.insert_str(idx, &format!("<w:sectPr>{missing}</w:sectPr>"));
    }
    out
}

fn read_zip_entry_bytes<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    name: &str,
) -> Option<Vec<u8>> {
    let mut entry = archive.by_name(name).ok()?;
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf).ok()?;
    Some(buf)
}

/// Re-copy header/footer parts and linked media from the template into a rendered DOCX.
pub fn merge_header_footer_from_template(template_path: &Path, docx_path: &Path) -> Result<(), String> {
    let template_bytes = std::fs::read(template_path).map_err(|e| e.to_string())?;
    let docx_bytes = std::fs::read(docx_path).map_err(|e| e.to_string())?;

    let (template_ct, template_rels, template_document) = {
        let mut arch = ZipArchive::new(Cursor::new(&template_bytes))
            .map_err(|e| format!("Template ZIP: {e}"))?;
        (
            read_zip_entry_bytes(&mut arch, "[Content_Types].xml"),
            read_zip_entry_bytes(&mut arch, "word/_rels/document.xml.rels"),
            read_zip_entry_bytes(&mut arch, "word/document.xml"),
        )
    };

    let mut output = Vec::new();
    {
        let mut docx_archive =
            ZipArchive::new(Cursor::new(&docx_bytes)).map_err(|e| format!("DOCX ZIP: {e}"))?;
        let mut writer = ZipWriter::new(Cursor::new(&mut output));
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        let mut copied = HashSet::new();
        let mut template_archive = ZipArchive::new(Cursor::new(&template_bytes))
            .map_err(|e| format!("Template ZIP: {e}"))?;
        for i in 0..template_archive.len() {
            let mut entry = template_archive.by_index(i).map_err(|e| e.to_string())?;
            let name = entry.name().to_string();
            if !should_copy_from_template(&name) {
                continue;
            }
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            copied.insert(name.clone());
            writer.start_file(&name, opts).map_err(|e| e.to_string())?;
            writer.write_all(&buf).map_err(|e| e.to_string())?;
        }

        for i in 0..docx_archive.len() {
            let mut entry = docx_archive.by_index(i).map_err(|e| e.to_string())?;
            let name = entry.name().to_string();
            if copied.contains(&name) {
                continue;
            }
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            buf = patch_merged_docx_entry(
                &name,
                &buf,
                &template_ct,
                &template_rels,
                &template_document,
            );
            writer.start_file(&name, opts).map_err(|e| e.to_string())?;
            writer.write_all(&buf).map_err(|e| e.to_string())?;
        }

        writer.finish().map_err(|e| e.to_string())?;
    }

    std::fs::write(docx_path, &output).map_err(|e| e.to_string())?;
    Ok(())
}
