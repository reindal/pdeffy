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

#[tauri::command(rename = "get-documents-path")]
pub fn get_documents_path(app: AppHandle) -> Result<String, String> {
    app.path()
        .document_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// macOS: folder where Word reads/writes during batch PDF (user may grant access once).
#[cfg(target_os = "macos")]
#[tauri::command(rename = "get-word-staging-path")]
pub fn get_word_staging_path() -> Result<String, String> {
    let dir = crate::commands::msoffice::word_mac_staging_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command(rename = "get-word-staging-path")]
pub fn get_word_staging_path() -> Result<String, String> {
    Ok(String::new())
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

/// Share a file via the OS: Mail with attachment on macOS, email client elsewhere.
#[tauri::command(rename = "share-file")]
pub async fn share_file(
    #[allow(unused_variables)] app: AppHandle,
    #[allow(non_snake_case)] filePath: String,
    title: Option<String>,
) -> Result<serde_json::Value, String> {
    let path = PathBuf::from(&filePath);
    if !path.is_file() {
        return Err(format!("File not found: {filePath}"));
    }
    let subject = title
        .unwrap_or_else(|| {
            path.file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "PDF".into())
        })
        .replace('"', "");

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let script = format!(
            r#"on run
  set theFile to POSIX file "{path}"
  set theSubject to "{subject}"
  try
    tell application "Mail"
      set newMessage to make new outgoing message with properties {{subject:theSubject, visible:true}}
      tell newMessage
        make new attachment with properties {{file name:theFile}} at after last paragraph
      end tell
      activate
    end tell
    return "mail"
  on error
    tell application "Finder"
      reveal theFile
      activate
    end tell
    return "finder"
  end try
end run"#,
            path = filePath.replace('\\', "\\\\").replace('"', "\\\""),
            subject = subject.replace('\\', "\\\\"),
        );
        let status = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(serde_json::json!({ "success": true, "method": "mail" }));
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // Outlook / default mail with attachment when available
        let ps = format!(
            r#"$p = '{}'; Start-Process ("mailto:?subject=" + [uri]::EscapeDataString('{}')); explorer.exe /select,$p"#,
            filePath.replace('\'', "''"),
            subject.replace('\'', "''"),
        );
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps])
            .status();
        return Ok(serde_json::json!({ "success": true, "method": "mailto" }));
    }

    // Generic fallback: open mailto + reveal parent folder
    let encoded_subject = subject
        .chars()
        .map(|c| match c {
            ' ' => "%20".to_string(),
            c if c.is_ascii_alphanumeric() || "-._~".contains(c) => c.to_string(),
            c => format!("%{:02X}", c as u8),
        })
        .collect::<String>();
    let mailto = format!("mailto:?subject={encoded_subject}");
    let _ = app.opener().open_url(mailto, None::<&str>);
    if let Some(parent) = path.parent() {
        let _ = app
            .opener()
            .open_path(parent.to_string_lossy().to_string(), None::<&str>);
    }
    Ok(serde_json::json!({ "success": true, "method": "mailto" }))
}

/// Open the system print dialog for a PDF (PDFKit on macOS).
#[tauri::command(rename = "print-file")]
pub async fn print_file(
    app: AppHandle,
    #[allow(non_snake_case)] filePath: String,
    title: Option<String>,
) -> Result<serde_json::Value, String> {
    crate::commands::print_pdf::print_pdf_file(app, filePath, title)?;
    Ok(serde_json::json!({ "success": true }))
}
