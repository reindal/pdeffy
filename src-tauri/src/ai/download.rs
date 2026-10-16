use crate::ai::config::{self, ModelDef};
use crate::ai::error::AiError;
use crate::ai::progress::{emit_progress, AiProgress};
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::AppHandle;

const READ_BUF_BYTES: usize = 256 * 1024;
const MAX_CONNECT_ATTEMPTS: u32 = 6;

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

/// Shared HTTP client for large binary downloads (Hugging Face CDN, mirrors).
pub fn build_download_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(format!(
            "Pdeffy/{} (+https://github.com/reindal/pdeffy; Windows)",
            env!("CARGO_PKG_VERSION")
        ))
        .redirect(reqwest::redirect::Policy::limited(20))
        .connect_timeout(Duration::from_secs(45))
        .timeout(Duration::from_secs(60 * 60 * 3))
        .tcp_keepalive(Duration::from_secs(30))
        .pool_idle_timeout(Duration::from_secs(90))
        // Avoid mid-stream HTTP/2 body errors on some Store / corporate networks.
        .http1_only()
        .build()
        .map_err(|e| e.to_string())
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

    let client = build_download_client().map_err(AiError::Download)?;

    let mut errors = Vec::new();
    for (index, url) in urls.iter().enumerate() {
        if index > 0 {
            eprintln!("[pdeffy] {label}: primary download failed, trying fallback {url}");
        }
        match stream_one_resumable(&client, url, partial, min_bytes, &mut on_progress) {
            Ok(bytes) => return Ok(bytes),
            Err(err) => {
                errors.push(format!("{url}: {err}"));
            }
        }
    }

    Err(AiError::Download(format!(
        "{label} download failed ({})",
        errors.join("; ")
    )))
}

fn partial_len(partial: &Path) -> u64 {
    fs::metadata(partial)
        .map(|m| m.len())
        .unwrap_or(0)
}

fn stream_one_resumable(
    client: &reqwest::blocking::Client,
    url: &str,
    partial: &Path,
    min_bytes: u64,
    on_progress: &mut impl FnMut(u64, Option<u64>),
) -> Result<u64, String> {
    let mut downloaded = partial_len(partial);
    let mut last_err = String::new();

    for attempt in 0..MAX_CONNECT_ATTEMPTS {
        if attempt > 0 {
            let delay = Duration::from_millis(800 * attempt as u64);
            std::thread::sleep(delay);
            eprintln!(
                "[pdeffy] resume download ({attempt}/{MAX_CONNECT_ATTEMPTS}) from {downloaded} bytes: {url}"
            );
        }

        let mut request = client.get(url);
        if downloaded > 0 {
            request = request.header("Range", format!("bytes={downloaded}-"));
        }

        let mut response = match request.send() {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("request failed: {e}");
                continue;
            }
        };

        let status = response.status();
        if !status.is_success() && status.as_u16() != 206 {
            last_err = format!("HTTP error: {status}");
            if status.as_u16() == 404 || status.as_u16() == 403 {
                break;
            }
            continue;
        }

        // Server ignored Range and sent full body — restart file.
        if downloaded > 0 && status.as_u16() == 200 {
            downloaded = 0;
            let _ = fs::remove_file(partial);
        }

        let total = response.content_length().map(|t| t + downloaded);

        let mut file = match OpenOptions::new()
            .create(true)
            .write(true)
            .open(partial)
        {
            Ok(f) => f,
            Err(e) => return Err(e.to_string()),
        };

        if downloaded > 0 {
            file.seek(SeekFrom::Start(downloaded))
                .map_err(|e| e.to_string())?;
        } else {
            file.set_len(0).ok();
        }

        on_progress(downloaded, total);

        let mut buffer = [0u8; READ_BUF_BYTES];
        let mut read_failed = false;

        loop {
            match response.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    file.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
                    downloaded += n as u64;
                    if downloaded % (512 * 1024) < n as u64 || n < buffer.len() {
                        on_progress(downloaded, total);
                    }
                }
                Err(e) => {
                    last_err = format!("read failed: {e}");
                    read_failed = true;
                    break;
                }
            }
        }

        let _ = file.flush();

        if read_failed {
            if downloaded >= min_bytes {
                return Ok(downloaded);
            }
            continue;
        }

        if downloaded >= min_bytes {
            return Ok(downloaded);
        }

        last_err = format!("file too small ({downloaded} bytes)");
    }

    Err(if last_err.is_empty() {
        "download incomplete".into()
    } else {
        last_err
    })
}

fn file_len(path: &Path) -> Result<u64, AiError> {
    Ok(fs::metadata(path)
        .map_err(|e| AiError::Download(e.to_string()))?
        .len())
}
