use serde::Deserialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[tauri::command(rename = "open-folder")]
pub async fn open_folder(
    app: AppHandle,
    #[allow(non_snake_case)] folderPath: String,
) -> Result<serde_json::Value, String> {
    app.opener()
        .open_path(folderPath, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command(rename = "open-file")]
pub async fn open_file(
    app: AppHandle,
    #[allow(non_snake_case)] filePath: String,
) -> Result<serde_json::Value, String> {
    app.opener()
        .open_path(filePath, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command(rename = "open-external-url")]
pub async fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command(rename = "set-file-readonly")]
pub fn set_file_readonly(
    #[allow(non_snake_case)] filePath: String,
) -> Result<serde_json::Value, String> {
    #[cfg(unix)]
    {
        fs::set_permissions(&filePath, fs::Permissions::from_mode(0o444))
            .map_err(|e| e.to_string())?;
    }

    #[cfg(windows)]
    {
        let mut perms = fs::metadata(&filePath)
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_readonly(true);
        fs::set_permissions(&filePath, perms).map_err(|e| e.to_string())?;
    }

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command(rename = "get-downloads-path")]
pub fn get_downloads_path(app: AppHandle) -> Result<String, String> {
    app.path()
        .download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command(rename = "get-temp-dir")]
pub fn get_temp_dir() -> Result<String, String> {
    Ok(std::env::temp_dir().to_string_lossy().to_string())
}

/// Bypass plugin-fs ACL: write arbitrary absolute paths chosen by the user.
#[tauri::command(rename = "write-file-bytes")]
pub fn write_file_bytes(
    path: String,
    #[allow(non_snake_case)] contents: Vec<u8>,
) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
        }
    }
    fs::write(&path, contents).map_err(|e| format!("write {}: {e}", path))
}

#[tauri::command(rename = "read-file-bytes")]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("read {}: {e}", path))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MkdirOptions {
    pub recursive: Option<bool>,
}

#[tauri::command(rename = "mkdir-path")]
pub fn mkdir_path(path: String, options: Option<MkdirOptions>) -> Result<(), String> {
    let recursive = options.and_then(|o| o.recursive).unwrap_or(true);
    if recursive {
        fs::create_dir_all(&path).map_err(|e| format!("mkdir {}: {e}", path))?;
    } else {
        fs::create_dir(&path).map_err(|e| format!("mkdir {}: {e}", path))?;
    }
    Ok(())
}

#[tauri::command(rename = "remove-path")]
pub fn remove_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Ok(());
    }
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| format!("remove dir {}: {e}", path))?;
    } else {
        fs::remove_file(&p).map_err(|e| format!("remove file {}: {e}", path))?;
    }
    Ok(())
}

#[tauri::command(rename = "path-exists")]
pub fn path_exists(path: String) -> Result<bool, String> {
    Ok(PathBuf::from(path).exists())
}

#[tauri::command(rename = "file-stat")]
pub fn file_stat(path: String) -> Result<serde_json::Value, String> {
    let meta = fs::metadata(&path).map_err(|e| format!("stat {}: {e}", path))?;
    Ok(serde_json::json!({
        "size": meta.len(),
        "isFile": meta.is_file(),
        "isDirectory": meta.is_dir(),
    }))
}
