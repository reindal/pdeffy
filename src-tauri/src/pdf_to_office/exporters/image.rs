use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::extract::render_page_images_gs;
use crate::pdf_to_office::format::ImageFormat;
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageOutputMode {
    /// Write `prefix_001.png`, … into a directory (default).
    Folder,
    Zip,
}

impl ImageOutputMode {
    pub fn parse(raw: Option<&str>) -> Self {
        match raw.unwrap_or("folder").trim().to_ascii_lowercase().as_str() {
            "zip" => Self::Zip,
            _ => Self::Folder,
        }
    }
}

#[derive(Debug)]
pub struct ImageWriteResult {
    pub output_path: PathBuf,
    pub files: Vec<PathBuf>,
    pub file_extension: String,
}

/// Renders PDF pages via Ghostscript (no layout pipeline).
pub fn write_page_images(
    pdf_path: &Path,
    gs: &Path,
    format: ImageFormat,
    dpi: u32,
    output_path: &Path,
    mode: ImageOutputMode,
    file_prefix: &str,
) -> Result<ImageWriteResult, PdfExportError> {
    let ext = format.extension();
    let images = render_page_images_gs(gs, pdf_path, ext, dpi)?;

    if images.is_empty() {
        return Err(PdfExportError::Export(
            "No page images were produced.".into(),
        ));
    }

    let prefix = sanitize_filename_prefix(file_prefix);

    match mode {
        ImageOutputMode::Folder => write_images_to_folder(output_path, &prefix, ext, &images),
        ImageOutputMode::Zip => write_images_to_zip(output_path, ext, &images),
    }
}

fn write_images_to_folder(
    output_dir: &Path,
    prefix: &str,
    ext: &str,
    images: &[Vec<u8>],
) -> Result<ImageWriteResult, PdfExportError> {
    fs::create_dir_all(output_dir).map_err(PdfExportError::Io)?;

    let mut files = Vec::with_capacity(images.len());
    for (i, bytes) in images.iter().enumerate() {
        let name = if images.len() == 1 {
            format!("{prefix}.{ext}")
        } else {
            format!("{prefix}_{:03}.{ext}", i + 1)
        };
        let path = output_dir.join(&name);
        fs::write(&path, bytes).map_err(PdfExportError::Io)?;
        files.push(path);
    }

    Ok(ImageWriteResult {
        output_path: output_dir.to_path_buf(),
        files,
        file_extension: ext.to_string(),
    })
}

fn write_images_to_zip(
    zip_path: &Path,
    ext: &str,
    images: &[Vec<u8>],
) -> Result<ImageWriteResult, PdfExportError> {
    if let Some(parent) = zip_path.parent() {
        fs::create_dir_all(parent).map_err(PdfExportError::Io)?;
    }

    let mut zip_buf = Cursor::new(Vec::new());
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    {
        let mut writer = ZipWriter::new(&mut zip_buf);
        for (i, bytes) in images.iter().enumerate() {
            let name = format!("page_{:03}.{ext}", i + 1);
            writer
                .start_file(name, options)
                .map_err(|e| PdfExportError::Export(e.to_string()))?;
            writer
                .write_all(bytes)
                .map_err(|e| PdfExportError::Export(e.to_string()))?;
        }
        writer
            .finish()
            .map_err(|e| PdfExportError::Export(e.to_string()))?;
    }

    fs::write(zip_path, zip_buf.into_inner()).map_err(PdfExportError::Io)?;

    Ok(ImageWriteResult {
        output_path: zip_path.to_path_buf(),
        files: vec![zip_path.to_path_buf()],
        file_extension: "zip".to_string(),
    })
}

fn sanitize_filename_prefix(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "page".to_string();
    }
    trimmed
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}
