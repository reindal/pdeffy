use super::config::{pack_subdir, NerAsset, NER_ASSETS};
use crate::ai::download::stream_first_available;
use crate::ai::error::AiError;
use crate::ai::progress::{emit_progress, AiProgress};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub fn ner_pack_dir(app_data: &Path) -> PathBuf {
    app_data.join("models").join("ner").join(pack_subdir())
}

pub fn is_downloaded(app_data: &Path) -> bool {
    super::gliner_onnx::GlinerOnnx::is_pack_complete(&ner_pack_dir(app_data))
}

fn asset_complete(dest: &Path, asset: &NerAsset) -> bool {
    dest.is_file()
        && fs::metadata(dest)
            .map(|m| m.len() >= asset.min_bytes)
            .unwrap_or(false)
}

/// Sum of Content-Length for the files still to fetch. `None` when a host
/// does not report a length, so the UI does not invent a cap.
fn probe_pack_bytes(assets: &[&NerAsset]) -> Option<u64> {
    if assets.is_empty() {
        return Some(0);
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .ok()?;
    let mut total = 0u64;
    for asset in assets {
        let len = head_len(&client, asset.url).or_else(|| head_len(&client, asset.fallback_url))?;
        total = total.saturating_add(len);
    }
    Some(total)
}

fn head_len(client: &reqwest::blocking::Client, url: &str) -> Option<u64> {
    let response = client.head(url).send().ok()?.error_for_status().ok()?;
    response.content_length().filter(|n| *n > 0)
}

fn download_one(
    app: &AppHandle,
    dest: &Path,
    asset: &NerAsset,
    downloaded_total: &mut u64,
    pack_bytes: Option<u64>,
) -> Result<(), AiError> {
    if asset_complete(dest, asset) {
        return Ok(());
    }
    if dest.exists() {
        let _ = fs::remove_file(dest);
    }

    let partial = dest.with_extension("partial");
    let base = *downloaded_total;
    let file_bytes = stream_first_available(
        &[asset.url, asset.fallback_url],
        &partial,
        asset.min_bytes,
        asset.filename,
        |got, _| {
            let downloaded = base + got;
            emit_progress(
                app,
                AiProgress::Download {
                    downloaded,
                    total: pack_bytes.map(|total| total.max(downloaded)),
                },
            );
        },
    )?;

    if dest.exists() {
        let _ = fs::remove_file(dest);
    }
    fs::rename(&partial, dest).map_err(|e| AiError::Download(e.to_string()))?;
    *downloaded_total += file_bytes;
    Ok(())
}

pub fn download_pack(app: &AppHandle, app_data: &Path) -> Result<PathBuf, AiError> {
    let dir = ner_pack_dir(app_data);
    fs::create_dir_all(&dir).map_err(|e| AiError::Download(e.to_string()))?;

    let mut downloaded_total: u64 = 0;
    let pending: Vec<&NerAsset> = NER_ASSETS
        .iter()
        .filter(|asset| !asset_complete(&dir.join(asset.filename), asset))
        .collect();
    let pack_bytes = probe_pack_bytes(&pending);

    emit_progress(
        app,
        AiProgress::Download {
            downloaded: 0,
            total: pack_bytes,
        },
    );

    for asset in NER_ASSETS {
        let dest = dir.join(asset.filename);
        download_one(
            app,
            &dest,
            asset,
            &mut downloaded_total,
            pack_bytes,
        )?;
    }

    emit_progress(app, AiProgress::Ready);
    Ok(dir)
}
