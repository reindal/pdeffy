use crate::ai::config::{self, ModelDef};
use crate::ai::error::AiError;
use crate::ai::progress::{emit_progress, AiProgress};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// Download a catalog GGUF into `app_data/models/`, emitting `ai-progress` events.
pub fn download_model(
    app: &AppHandle,
    app_data: &Path,
    def: &ModelDef,
) -> Result<PathBuf, AiError> {
    let models = config::models_dir(app_data);
    fs::create_dir_all(&models).map_err(|e| AiError::Download(e.to_string()))?;

    let dest = config::model_path_for(app_data, def);
    if dest.is_file() && file_len(&dest)? > 1_000_000 {
        emit_progress(app, AiProgress::Ready);
        return Ok(dest);
    }

    let partial = config::model_partial_path_for(app_data, def);
    if partial.exists() {
        let _ = fs::remove_file(&partial);
    }

    let downloaded = stream_first_available(
        &[def.url, def.fallback_url],
        &partial,
        1_000_000,
        def.id,
        |got, content_len| {
            emit_progress(
                app,
                AiProgress::Download {
                    downloaded: got,
                    total: content_len.or(Some(def.expected_bytes)),
                },
            );
        },
    )?;

    if dest.exists() {
        let _ = fs::remove_file(&dest);
    }
    fs::rename(&partial, &dest).map_err(|e| AiError::Download(e.to_string()))?;

    emit_progress(
        app,
        AiProgress::Download {
            downloaded,
            total: Some(downloaded),
        },
    );
    emit_progress(app, AiProgress::Ready);

    Ok(dest)
}

/// Download `partial` from the first URL that returns a body of at least `min_bytes`.
/// Later URLs run only after an earlier one fails. The caller renames `partial` into place.
pub fn stream_first_available(
    urls: &[&str],
    partial: &Path,
    min_bytes: u64,
    label: &str,
    mut on_progress: impl FnMut(u64, Option<u64>),
) -> Result<u64, AiError> {
    if urls.is_empty() {
        return Err(AiError::Download(format!("{label} has no download URL")));
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60 * 60))
        .build()
        .map_err(|e| AiError::Download(e.to_string()))?;

    let mut errors = Vec::new();
    for (index, url) in urls.iter().enumerate() {
        if index > 0 {
            eprintln!("[pdeffy] {label}: primary download failed, trying fallback {url}");
        }
        match stream_one(&client, url, partial, min_bytes, &mut on_progress) {
            Ok(bytes) => return Ok(bytes),
            Err(err) => {
                let _ = fs::remove_file(partial);
                errors.push(format!("{url}: {err}"));
            }
        }
    }

    Err(AiError::Download(format!(
        "{label} download failed ({})",
        errors.join("; ")
    )))
}

fn stream_one(
    client: &reqwest::blocking::Client,
    url: &str,
    partial: &Path,
    min_bytes: u64,
    on_progress: &mut impl FnMut(u64, Option<u64>),
) -> Result<u64, String> {
    let mut response = client
        .get(url)
        .send()
        .map_err(|e| format!("request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("HTTP error: {e}"))?;
    let total = response.content_length();

    let mut file = File::create(partial).map_err(|e| e.to_string())?;
    let mut buffer = [0u8; 64 * 1024];
    let mut downloaded: u64 = 0;
    on_progress(0, total);

    loop {
        let n = response
            .read(&mut buffer)
            .map_err(|e| format!("read failed: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
        downloaded += n as u64;
        if downloaded % (512 * 1024) < n as u64 || n < buffer.len() {
            on_progress(downloaded, total);
        }
    }

    file.flush().map_err(|e| e.to_string())?;
    drop(file);

    if downloaded < min_bytes {
        return Err(format!("file too small ({downloaded} bytes)"));
    }
    Ok(downloaded)
}

fn file_len(path: &Path) -> Result<u64, AiError> {
    Ok(fs::metadata(path)
        .map_err(|e| AiError::Download(e.to_string()))?
        .len())
}
