use crate::commands::ghostscript;
use crate::pdf_to_office::backends::{
    default_layout_backend, libreoffice_backend, PdfToOfficeConverter,
};
use crate::pdf_to_office::exporters::image::{write_page_images, ImageOutputMode};
use crate::pdf_to_office::format::{ImageFormat, PdfExportFormat};
use serde::Serialize;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOfficeConversionResult {
    pub success: bool,
    pub backend_used: String,
    pub warnings: Vec<String>,
    pub output_path: String,
    pub file_extension: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub saved_files: Vec<String>,
}

fn resolve_backend(choice: Option<&str>) -> Box<dyn PdfToOfficeConverter> {
    match choice
        .unwrap_or("pdeffy-layout")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "libreoffice" | "lo" => Box::new(libreoffice_backend()),
        _ => Box::new(default_layout_backend()),
    }
}

#[tauri::command(rename = "convert-pdf-to-office")]
pub async fn convert_pdf_to_office(
    app: AppHandle,
    #[allow(non_snake_case)] inputPath: String,
    #[allow(non_snake_case)] outputPath: String,
    format: String,
    backend: Option<String>,
    #[allow(non_snake_case)] imageDpi: Option<u32>,
    #[allow(non_snake_case)] imageOutputMode: Option<String>,
    #[allow(non_snake_case)] fileNamePrefix: Option<String>,
) -> Result<PdfOfficeConversionResult, String> {
    let export_format = PdfExportFormat::from_convert_param(&format)
        .ok_or_else(|| format!("Unsupported export format: {format}"))?;

    let input = PathBuf::from(&inputPath);
    if !input.is_file() {
        return Err(format!("Input file not found: {inputPath}"));
    }

    if let PdfExportFormat::Image(img_fmt) = export_format {
        return convert_pdf_to_images(
            &app,
            &input,
            &outputPath,
            img_fmt,
            imageDpi,
            imageOutputMode.as_deref(),
            fileNamePrefix.as_deref(),
        );
    }

    let converter = resolve_backend(backend.as_deref());
    if !converter.is_available() {
        return Err(format!(
            "Backend \"{}\" is not available on this system.",
            converter.name()
        ));
    }
    if !converter.supports_format(export_format) {
        return Err(format!(
            "Backend \"{}\" does not support export to {format}. Try backend \"pdeffy-layout\" or another format.",
            converter.name()
        ));
    }

    let gs = ghostscript::find_ghostscript_path(&app);
    let dpi = imageDpi.unwrap_or(150).clamp(72, 600);
    let output = converter
        .convert(&input, export_format, dpi, gs.as_deref())
        .map_err(|e| e.user_message())?;

    let mut out_path = PathBuf::from(&outputPath);
    if out_path.extension().is_none() {
        out_path.set_extension(&output.file_extension);
    }
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&out_path, &output.bytes).map_err(|e| e.to_string())?;

    Ok(PdfOfficeConversionResult {
        success: true,
        backend_used: converter.name().to_string(),
        warnings: Vec::new(),
        output_path: out_path.display().to_string(),
        file_extension: output.file_extension,
        saved_files: Vec::new(),
    })
}

fn convert_pdf_to_images(
    app: &AppHandle,
    input: &std::path::Path,
    output_path: &str,
    format: ImageFormat,
    image_dpi: Option<u32>,
    image_output_mode: Option<&str>,
    file_name_prefix: Option<&str>,
) -> Result<PdfOfficeConversionResult, String> {
    let gs = ghostscript::find_ghostscript_path(app)
        .ok_or_else(|| "Ghostscript is required for PDF→image export.".to_string())?;

    let mode = ImageOutputMode::parse(image_output_mode);
    let dpi = image_dpi.unwrap_or(150).clamp(72, 600);
    let prefix = file_name_prefix
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| {
            input
                .file_stem()
                .and_then(|s| s.to_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "page".to_string());

    let mut target = PathBuf::from(output_path);
    if mode == ImageOutputMode::Zip && target.extension().is_none() {
        target.set_extension("zip");
    }

    let result = write_page_images(input, &gs, format, dpi, &target, mode, &prefix)
        .map_err(|e| e.user_message())?;

    Ok(PdfOfficeConversionResult {
        success: true,
        backend_used: "ghostscript".to_string(),
        warnings: Vec::new(),
        output_path: result.output_path.display().to_string(),
        file_extension: result.file_extension,
        saved_files: result
            .files
            .iter()
            .map(|p| p.display().to_string())
            .collect(),
    })
}

#[tauri::command(rename = "list-pdf-export-backends")]
pub fn list_pdf_export_backends() -> serde_json::Value {
    let layout = default_layout_backend();
    let lo = libreoffice_backend();
    serde_json::json!({
        "backends": [
            {
                "id": layout.name(),
                "available": layout.is_available(),
                "formats": ["docx", "xlsx", "pptx", "txt", "md", "png", "jpeg"],
            },
            {
                "id": lo.name(),
                "available": lo.is_available(),
                "formats": ["docx", "pptx"],
            }
        ],
        "imageDefaults": {
            "outputMode": "folder",
            "multiPageZipOptional": true
        }
    })
}
