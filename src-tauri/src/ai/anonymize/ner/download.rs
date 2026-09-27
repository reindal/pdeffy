use super::config::{pack_subdir, NER_ASSETS};
use crate::ai::error::AiError;
use crate::ai::progress::{emit_progress, AiProgress};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub fn ner_pack_dir(app_data: &Path) -> PathBuf {
    app_data.join("models").join("ner").join(pack_subdir())
}

pub fn is_downloaded(app_data: &Path) -> bool {
    super::gliner_onnx::GlinerOnnx::is_pack_complete(&ner_pack_dir(app_data))
}

fn download_one(
    app: &AppHandle,
    dest: &Path,
    asset: &super::config::NerAsset,
    downloaded_total: &mut u64,
    pack_bytes: u64,
) -> Result<(), AiError> {
    if dest.is_file() {
        if fs::metadata(dest)
            .map(|m| m.len() >= asset.min_bytes)
            .unwrap_or(false)
        {
            return Ok(());
        }
        let _ = fs::remove_file(dest);
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60 * 60))
        .build()
        .map_err(|e| AiError::Download(e.to_string()))?;

    let mut response = client
        .get(asset.url)
        .send()
        .map_err(|e| AiError::Download(format!("NER {}: {e}", asset.filename)))?
        .error_for_status()
        .map_err(|e| AiError::Download(format!("NER {} HTTP: {e}", asset.filename)))?;

    let partial = dest.with_extension("partial");
    let mut file = File::create(&partial).map_err(|e| AiError::Download(e.to_string()))?;
    let mut buffer = [0u8; 64 * 1024];
    let mut file_bytes: u64 = 0;

    loop {
        let n = response
            .read(&mut buffer)
            .map_err(|e| AiError::Download(e.to_string()))?;
        if n == 0 {
            break;
        }
        file.write_all(&buffer[..n])
            .map_err(|e| AiError::Download(e.to_string()))?;
        file_bytes += n as u64;
        *downloaded_total += n as u64;
        emit_progress(
            app,
            AiProgress::Download {
                downloaded: *downloaded_total,
                total: Some(pack_bytes),
            },
        );
    }
    drop(file);

    if file_bytes < asset.min_bytes {
        let _ = fs::remove_file(&partial);
        return Err(AiError::Download(format!(
            "NER asset {} too small ({file_bytes} B)",
            asset.filename
        )));
    }

    if dest.exists() {
        let _ = fs::remove_file(dest);
    }
    fs::rename(&partial, dest).map_err(|e| AiError::Download(e.to_string()))?;
    Ok(())
}

pub fn download_pack(app: &AppHandle, app_data: &Path) -> Result<PathBuf, AiError> {
    let dir = ner_pack_dir(app_data);
    fs::create_dir_all(&dir).map_err(|e| AiError::Download(e.to_string()))?;

    let pack_bytes: u64 = NER_ASSETS.iter().map(|a| a.min_bytes).sum();
    let mut downloaded_total: u64 = 0;

    emit_progress(
        app,
        AiProgress::Download {
            downloaded: 0,
            total: Some(pack_bytes),
        },
    );

    for asset in NER_ASSETS {
        let dest = dir.join(asset.filename);
        download_one(app, &dest, asset, &mut downloaded_total, pack_bytes)?;
    }

    emit_progress(app, AiProgress::Ready);
    Ok(dir)
}
