use super::libreoffice;
use super::msoffice;
use super::pdf_excel;
use super::settings::PdfMetadata;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertRequest {
    pub file_data: Vec<u8>,
    pub file_name: String,
    pub output_path: String,
    #[serde(default = "default_format")]
    pub format: String,
    pub metadata: Option<PdfMetadata>,
}

fn default_format() -> String {
    "pdf".to_string()
}

#[tauri::command(rename = "convert-with-libreoffice")]
pub async fn convert_with_libreoffice(
    #[allow(non_snake_case)] fileData: Vec<u8>,
    #[allow(non_snake_case)] fileName: String,
    #[allow(non_snake_case)] outputPath: String,
    format: Option<String>,
    metadata: Option<PdfMetadata>,
) -> Result<serde_json::Value, String> {
    convert_inner(fileData, fileName, outputPath, format, metadata)
}

/// Path-based conversion (frontend already wrote the input file).
#[tauri::command(rename = "convert-file-path")]
pub async fn convert_file_path(
    #[allow(non_snake_case)] inputPath: String,
    #[allow(non_snake_case)] outputPath: String,
    format: Option<String>,
    metadata: Option<PdfMetadata>,
) -> Result<serde_json::Value, String> {
    let input = PathBuf::from(&inputPath);
    if !input.exists() {
        return Err(format!("Input file not found: {inputPath}"));
    }
    let file_name = input
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("input.bin")
        .to_string();

    // Prefer converting the existing file in place (no second IPC copy).
    let format = format.unwrap_or_else(default_format).to_lowercase();
    let result = convert_existing_file(&input, &file_name, &outputPath, &format, metadata.as_ref());
    let _ = fs::remove_file(&input);
    result
}

fn convert_existing_file(
    input_path: &Path,
    file_name: &str,
    output_path_str: &str,
    format: &str,
    metadata: Option<&PdfMetadata>,
) -> Result<serde_json::Value, String> {
    let output_path = PathBuf::from(output_path_str);
    let target_dir = output_path
        .parent()
        .ok_or_else(|| "Invalid output path.".to_string())?;
    fs::create_dir_all(target_dir).map_err(|e| format!("Cannot create output dir: {e}"))?;

    let parsed = PathBuf::from(file_name);
    let ext = parsed
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let input_ext = if ext.is_empty() {
        String::new()
    } else {
        format!(".{}", ext.to_lowercase())
    };
    let is_pdf = input_ext.eq_ignore_ascii_case(".pdf");

    let mut conversion_success = false;

    let can_use_msoffice = cfg!(target_os = "windows")
        && ((is_pdf && (format == "docx" || format == "pptx"))
            || ((input_ext == ".docx" || input_ext == ".pptx") && format == "pdf"));

    if can_use_msoffice {
        if msoffice::convert_with_msoffice(input_path, &output_path, format, &input_ext).is_ok() {
            conversion_success = true;
        }
    }

    if !conversion_success && is_pdf && format == "xlsx" {
        match pdf_excel::pdf_to_xlsx(input_path, &output_path) {
            Ok(()) => {
                if let Some(metadata) = metadata {
                    apply_metadata(&output_path, format, metadata)?;
                }
                return Ok(serde_json::json!({ "success": true }));
            }
            Err(e) => {
                eprintln!("[Conversion] Native PDF→Excel failed: {e}");
            }
        }
    }

    if !conversion_success {
        libreoffice::convert_with_libreoffice_engine(input_path, &output_path, format)?;
    }

    if let Some(metadata) = metadata {
        apply_metadata(&output_path, format, metadata)?;
    }

    if !output_path.exists() {
        return Err(format!(
            "Conversion reported success but output missing: {}",
            output_path.display()
        ));
    }

    Ok(serde_json::json!({ "success": true }))
}

fn convert_inner(
    file_data: Vec<u8>,
    file_name: String,
    output_path_str: String,
    format: Option<String>,
    metadata: Option<PdfMetadata>,
) -> Result<serde_json::Value, String> {
    if file_data.is_empty() {
        return Err("Input file data is empty.".into());
    }

    let payload = ConvertRequest {
        file_data,
        file_name,
        output_path: output_path_str,
        format: format.unwrap_or_else(default_format),
        metadata,
    };

    let output_path = PathBuf::from(&payload.output_path);
    let target_dir = output_path
        .parent()
        .ok_or_else(|| "Invalid output path.".to_string())?;
    fs::create_dir_all(target_dir).map_err(|e| format!("Cannot create output dir: {e}"))?;

    let parsed = PathBuf::from(&payload.file_name);
    let ext = parsed
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let stem = parsed
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("temp");

    let unique_name = format!(
        "temp_{}_{}{}",
        chrono::Utc::now().timestamp_millis(),
        stem,
        if ext.is_empty() {
            String::new()
        } else {
            format!(".{ext}")
        }
    );
    let temp_input = target_dir.join(&unique_name);
    fs::write(&temp_input, &payload.file_data)
        .map_err(|e| format!("Failed to write temp input {}: {e}", temp_input.display()))?;

    let format = payload.format.to_lowercase();
    let input_ext = if ext.is_empty() {
        String::new()
    } else {
        format!(".{}", ext.to_lowercase())
    };
    let is_pdf = input_ext.eq_ignore_ascii_case(".pdf");

    let mut conversion_success = false;

    let can_use_msoffice = cfg!(target_os = "windows")
        && ((is_pdf && (format == "docx" || format == "pptx"))
            || ((input_ext == ".docx" || input_ext == ".pptx") && format == "pdf"));

    if can_use_msoffice {
        if msoffice::convert_with_msoffice(&temp_input, &output_path, &format, &input_ext).is_ok() {
            conversion_success = true;
        }
    }

    if !conversion_success && is_pdf && format == "xlsx" {
        match pdf_excel::pdf_to_xlsx(&temp_input, &output_path) {
            Ok(()) => {
                let _ = fs::remove_file(&temp_input);
                return Ok(serde_json::json!({ "success": true }));
            }
            Err(e) => {
                eprintln!("[Conversion] Native PDF→Excel failed: {e}");
            }
        }
    }

    if !conversion_success {
        libreoffice::convert_with_libreoffice_engine(&temp_input, &output_path, &format)
            .map_err(|e| {
                let _ = fs::remove_file(&temp_input);
                e
            })?;
    }

    let _ = fs::remove_file(&temp_input);

    if let Some(metadata) = payload.metadata {
        apply_metadata(&output_path, &format, &metadata)?;
    }

    if !output_path.exists() {
        return Err(format!(
            "Conversion reported success but output missing: {}",
            output_path.display()
        ));
    }

    Ok(serde_json::json!({ "success": true }))
}

fn apply_metadata(path: &Path, format: &str, metadata: &PdfMetadata) -> Result<(), String> {
    match format {
        "pdf" => inject_pdf_metadata(path, metadata),
        "docx" | "pptx" => inject_openxml_metadata(path, metadata),
        _ => Ok(()),
    }
}

fn inject_pdf_metadata(path: &Path, metadata: &PdfMetadata) -> Result<(), String> {
    use lopdf::{Dictionary, Document, Object};

    let mut doc = Document::load(path).map_err(|e| e.to_string())?;
    let info_id = if let Ok(id) = doc.trailer.get(b"Info") {
        if let Ok(reference) = id.as_reference() {
            reference
        } else {
            doc.new_object_id()
        }
    } else {
        doc.new_object_id()
    };

    let mut info = Dictionary::new();
    if !metadata.title.is_empty() {
        info.set("Title", Object::string_literal(metadata.title.clone()));
    }
    if !metadata.author.is_empty() {
        info.set("Author", Object::string_literal(metadata.author.clone()));
    }
    if !metadata.subject.is_empty() {
        info.set("Subject", Object::string_literal(metadata.subject.clone()));
    }

    doc.objects
        .insert(info_id, Object::Dictionary(info));
    doc.trailer.set("Info", Object::Reference(info_id));
    doc.save(path).map_err(|e| e.to_string())?;
    Ok(())
}

fn inject_openxml_metadata(path: &Path, metadata: &PdfMetadata) -> Result<(), String> {
    let data = fs::read(path).map_err(|e| e.to_string())?;
    let reader = std::io::Cursor::new(data);
    let mut archive = zip::read::ZipArchive::new(reader).map_err(|e| e.to_string())?;

    let mut out_buf = std::io::Cursor::new(Vec::new());
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    {
        let mut writer = ZipWriter::new(&mut out_buf);
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = file.name().to_string();
            let mut contents = Vec::new();
            std::io::copy(&mut file, &mut contents).map_err(|e| e.to_string())?;

            if name == "docProps/core.xml" {
                if let Ok(text) = String::from_utf8(contents.clone()) {
                    contents = update_core_xml(text, metadata).into_bytes();
                }
            }

            writer
                .start_file(name, options)
                .map_err(|e| e.to_string())?;
            std::io::Write::write_all(&mut writer, &contents).map_err(|e| e.to_string())?;
        }
        writer.finish().map_err(|e| e.to_string())?;
    }

    fs::write(path, out_buf.into_inner()).map_err(|e| e.to_string())
}

fn update_core_xml(xml: String, metadata: &PdfMetadata) -> String {
    let mut out = xml;
    out = update_tag(&out, "dc:title", &metadata.title);
    out = update_tag(&out, "dc:creator", &metadata.author);
    out = update_tag(&out, "cp:lastModifiedBy", &metadata.author);
    out = update_tag(&out, "dc:subject", &metadata.subject);
    out
}

fn update_tag(xml: &str, tag: &str, value: &str) -> String {
    if value.is_empty() {
        return xml.to_string();
    }
    let safe = value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let pattern = format!(r"<{tag}[^>]*>.*?</{tag}>");
    let re = regex::Regex::new(&pattern).unwrap();
    if re.is_match(xml) {
        re.replace(xml, format!("<{tag}>{safe}</{tag}>"))
            .to_string()
    } else {
        xml.replace(
            "</cp:coreProperties>",
            &format!("  <{tag}>{safe}</{tag}>\n</cp:coreProperties>"),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn converts_docx_to_pdf() {
        let input = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../_test_doc.docx");
        assert!(input.exists(), "run from repo with _test_doc.docx");
        let out = temp_dir().join(format!("pdeffy_test_{}.pdf", uuid::Uuid::new_v4()));
        let data = fs::read(&input).unwrap();
        let result = convert_inner(
            data,
            "test.docx".into(),
            out.to_string_lossy().to_string(),
            Some("pdf".into()),
            None,
        );
        assert!(result.is_ok(), "{result:?}");
        assert!(out.exists());
        let _ = fs::remove_file(&out);
    }
}
