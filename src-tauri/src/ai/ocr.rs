//! RapidOCR (PP-OCRv6 tiny) — downloadable on-device OCR for scanned PDFs.

use crate::ai::error::AiError;
use crate::ai::progress::{emit_progress, AiProgress};
use crate::commands::ghostscript::{self, find_ghostscript_path};
use rapidocr_core::config::PipelineConfig;
use rapidocr_core::model::{model_set_by_name, ModelCache, ModelDownloadMode};
use rapidocr_core::RapidOcr;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// Light multilingual RapidOCR pack (det + rec + dict; no orientation cls).
pub const OCR_MODEL_SET: &str = "ppocrv6-tiny";

/// Max pages to OCR for a single summarize call (keeps latency bounded).
pub const OCR_MAX_PAGES: usize = 8;

/// Rasterization DPI for OCR.
pub const OCR_DPI: u32 = 150;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrStatus {
    pub model_set: String,
    pub downloaded: bool,
    pub downloading: bool,
    pub path: Option<String>,
    pub size_label: String,
    pub detail: String,
}

pub fn ocr_dir(app_data: &Path) -> PathBuf {
    app_data.join("ocr").join(OCR_MODEL_SET)
}

fn model_set() -> Result<&'static rapidocr_core::model::ModelSetSpec, AiError> {
    model_set_by_name(OCR_MODEL_SET).ok_or_else(|| {
        AiError::Message(format!("Unknown RapidOCR model set: {OCR_MODEL_SET}"))
    })
}

/// Whether required ONNX assets for the OCR pack are present on disk.
pub fn is_downloaded(app_data: &Path) -> bool {
    let Ok(set) = model_set() else {
        return false;
    };
    let dir = ocr_dir(app_data);
    let pipeline = PipelineConfig::without_cls();
    set.assets_for_pipeline(pipeline).iter().all(|asset| {
        let path = dir.join(asset.filename);
        path.is_file() && fs::metadata(&path).map(|m| m.len() > 10_000).unwrap_or(false)
    })
}

pub fn status(app_data: &Path, downloading: bool) -> OcrStatus {
    let downloaded = is_downloaded(app_data);
    let dir = ocr_dir(app_data);
    let bytes: u64 = if downloaded {
        fs::read_dir(&dir)
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .filter_map(|e| e.metadata().ok())
            .map(|m| m.len())
            .sum()
    } else {
        0
    };
    let size_label = if bytes >= 1_000_000 {
        format!("~{:.0} MB", bytes as f64 / 1_000_000.0)
    } else if downloaded {
        format!("{bytes} B")
    } else {
        "~15–25 MB".into()
    };

    OcrStatus {
        model_set: OCR_MODEL_SET.to_string(),
        downloaded,
        downloading,
        path: downloaded.then(|| dir.display().to_string()),
        size_label,
        detail: if downloaded {
            "RapidOCR ready for scanned PDFs.".into()
        } else {
            "Download the RapidOCR pack to extract text from scanned PDFs.".into()
        },
    }
}

/// Download PP-OCRv6 tiny ONNX assets into app data (idempotent).
pub fn download_models(app: &AppHandle, app_data: &Path) -> Result<PathBuf, AiError> {
    let set = model_set()?;
    let dir = ocr_dir(app_data);
    fs::create_dir_all(&dir).map_err(|e| AiError::Download(e.to_string()))?;

    emit_progress(
        app,
        AiProgress::Download {
            downloaded: 0,
            total: None,
        },
    );

    let cache = ModelCache::new(&dir);
    cache
        .ensure_model_set_for_pipeline(set, PipelineConfig::without_cls(), ModelDownloadMode::Missing)
        .map_err(|e| AiError::Download(format!("RapidOCR download failed: {e}")))?;

    emit_progress(app, AiProgress::Ready);
    Ok(dir)
}

fn build_ocr(app_data: &Path) -> Result<RapidOcr, AiError> {
    if !is_downloaded(app_data) {
        return Err(AiError::OcrNotDownloaded);
    }
    let set = model_set()?;
    let dir = ocr_dir(app_data);
    let cache = ModelCache::new(&dir);
    let cfg = cache
        .config_for(set)
        .with_pipeline(PipelineConfig::without_cls());
    RapidOcr::from_config(cfg).map_err(|e| AiError::Ocr(format!("init RapidOCR: {e}")))
}

/// Rasterize PDF pages with Ghostscript and OCR them with RapidOCR.
pub fn extract_text_from_scanned_pdf(
    app: &AppHandle,
    app_data: &Path,
    pdf_path: &Path,
) -> Result<String, AiError> {
    let mut ocr = build_ocr(app_data)?;

    let gs = find_ghostscript_path(app).ok_or_else(|| {
        AiError::Ocr(
            "Ghostscript is required to OCR scanned PDFs. Install Ghostscript and try again."
                .into(),
        )
    })?;

    let out_dir = app_data.join("ocr").join("tmp").join(format!(
        "pages-{}",
        chrono::Utc::now().timestamp_millis()
    ));
    let _ = fs::remove_dir_all(&out_dir);
    fs::create_dir_all(&out_dir).map_err(|e| AiError::Ocr(e.to_string()))?;

    let images = ghostscript::pdf_to_images(&gs, pdf_path, &out_dir, "png", OCR_DPI)
        .map_err(|e| AiError::Ocr(format!("PDF rasterize failed: {e}")))?;

    if images.is_empty() {
        let _ = fs::remove_dir_all(&out_dir);
        return Err(AiError::PdfNoText);
    }

    emit_progress(app, AiProgress::Loading);

    let mut parts: Vec<String> = Vec::new();
    for (idx, img_path) in images.iter().take(OCR_MAX_PAGES).enumerate() {
        emit_progress(
            app,
            AiProgress::Generating {
                tokens: (idx + 1) as u32,
            },
        );
        match ocr.run_path(img_path) {
            Ok(output) => {
                let page_text: String = output
                    .lines
                    .into_iter()
                    .map(|l| l.text)
                    .filter(|t| !t.trim().is_empty())
                    .collect::<Vec<_>>()
                    .join("\n");
                if !page_text.trim().is_empty() {
                    parts.push(page_text);
                }
            }
            Err(e) => {
                eprintln!("[pdeffy] OCR page {} failed: {e}", idx + 1);
            }
        }
    }

    let _ = fs::remove_dir_all(&out_dir);

    let joined = parts.join("\n\n");
    if joined.trim().is_empty() {
        return Err(AiError::PdfNoText);
    }
    Ok(joined)
}
