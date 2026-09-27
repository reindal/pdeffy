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

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60 * 60))
        .build()
        .map_err(|e| AiError::Download(e.to_string()))?;

    let mut response = client
        .get(def.url)
        .send()
        .map_err(|e| AiError::Download(format!("request failed: {e}")))?
        .error_for_status()
        .map_err(|e| AiError::Download(format!("HTTP error: {e}")))?;

    let total = response.content_length().or(Some(def.expected_bytes));

    let mut file = File::create(&partial).map_err(|e| AiError::Download(e.to_string()))?;
    let mut buffer = [0u8; 64 * 1024];
    let mut downloaded: u64 = 0;

    emit_progress(
        app,
        AiProgress::Download {
            downloaded: 0,
            total,
        },
    );

    loop {
        let n = response
            .read(&mut buffer)
            .map_err(|e| AiError::Download(format!("read failed: {e}")))?;
        if n == 0 {
            break;
        }
        file.write_all(&buffer[..n])
            .map_err(|e| AiError::Download(e.to_string()))?;
        downloaded += n as u64;

        if downloaded % (512 * 1024) < n as u64 || n < buffer.len() {
            emit_progress(
                app,
                AiProgress::Download {
                    downloaded,
                    total,
                },
            );
        }
    }

    file.flush()
        .map_err(|e| AiError::Download(e.to_string()))?;
    drop(file);

    if downloaded < 1_000_000 {
        let _ = fs::remove_file(&partial);
        return Err(AiError::Download(format!(
            "Downloaded file too small ({downloaded} bytes); check model URL for {}",
            def.id
        )));
    }

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

fn file_len(path: &Path) -> Result<u64, AiError> {
    Ok(fs::metadata(path)
        .map_err(|e| AiError::Download(e.to_string()))?
        .len())
}
