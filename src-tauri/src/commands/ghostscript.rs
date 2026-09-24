use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;
#[cfg(target_os = "windows")]
use tauri::Manager;


#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectPermissions {
    #[serde(default = "default_printing")]
    pub printing: String,
    #[serde(default)]
    pub copying: bool,
    #[serde(default)]
    pub editing: bool,
}

fn default_printing() -> String {
    "none".to_string()
}

pub fn find_ghostscript_path(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(resource_dir) = app.path().resource_dir() {
            let bundled = resource_dir
                .join("ghostscript")
                .join("win")
                .join("bin")
                .join("gswin64c.exe");
            if bundled.exists() {
                return Some(bundled);
            }
        }

        let dev_bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("resources")
            .join("ghostscript")
            .join("win")
            .join("bin")
            .join("gswin64c.exe");
        if dev_bundled.exists() {
            return Some(dev_bundled);
        }
        return None;
    }

    #[cfg(target_os = "macos")]
    {
        for candidate in [
            "/usr/local/bin/gs",
            "/opt/homebrew/bin/gs",
            "/usr/bin/gs",
        ] {
            let path = PathBuf::from(candidate);
            if path.exists() {
                return Some(path);
            }
        }
        if let Ok(output) = Command::new("which").arg("gs").output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                let path = PathBuf::from(text.trim());
                if path.exists() {
                    return Some(path);
                }
            }
        }
        return None;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Ok(output) = Command::new("which").arg("gs").output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                let path = PathBuf::from(text.trim());
                if path.exists() {
                    return Some(path);
                }
            }
        }
        None
    }
}

fn run_gs(gs: &Path, args: &[String]) -> Result<(), String> {
    let output = Command::new(gs)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run Ghostscript: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Ghostscript failed: {stderr}"));
    }
    Ok(())
}

pub fn compress_pdf(
    gs: &Path,
    input_path: &Path,
    output_path: &Path,
    quality: &str,
) -> Result<u64, String> {
    let valid = ["screen", "ebook", "printer", "prepress"];
    let safe_quality = if valid.contains(&quality) {
        quality
    } else {
        "ebook"
    };

    let args = vec![
        "-dBATCH".to_string(),
        "-dNOPAUSE".to_string(),
        "-dQUIET".to_string(),
        "-sDEVICE=pdfwrite".to_string(),
        format!("-dPDFSETTINGS=/{safe_quality}"),
        "-dCompatibilityLevel=1.4".to_string(),
        "-dEmbedAllFonts=true".to_string(),
        "-dSubsetFonts=true".to_string(),
        format!("-sOutputFile={}", output_path.to_string_lossy()),
        input_path.to_string_lossy().to_string(),
    ];

    run_gs(gs, &args)?;
    Ok(fs::metadata(output_path)
        .map_err(|e| e.to_string())?
        .len())
}

pub fn build_permission_mask(permissions: &ProtectPermissions) -> i32 {
    let mut perm_bits: u32 = 0;

    let allow_print = permissions.printing != "none";
    if allow_print {
        perm_bits |= 1 << 2;
    }
    if permissions.editing {
        perm_bits |= 1 << 3;
    }
    if permissions.copying {
        perm_bits |= 1 << 4;
    }
    perm_bits |= 1 << 5;
    perm_bits |= 1 << 8;
    perm_bits |= 1 << 9;
    if permissions.editing {
        perm_bits |= 1 << 10;
    }
    if permissions.printing == "highResolution" {
        perm_bits |= 1 << 11;
    }

    ((perm_bits | 0xFFFFF000) as i32) >> 0
}

pub fn protect_pdf(
    gs: &Path,
    input_path: &Path,
    output_path: &Path,
    user_password: Option<&str>,
    owner_password: Option<&str>,
    permissions: &ProtectPermissions,
) -> Result<(), String> {
    let gs_permissions = build_permission_mask(permissions);

    let mut args = vec![
        "-dBATCH".to_string(),
        "-dNOPAUSE".to_string(),
        "-dQUIET".to_string(),
        "-sDEVICE=pdfwrite".to_string(),
        "-dEncryptionR=3".to_string(),
        "-dKeyLength=128".to_string(),
        format!("-dPermissions={gs_permissions}"),
        format!("-sOutputFile={}", output_path.to_string_lossy()),
    ];

    if let Some(password) = user_password.filter(|p| !p.is_empty()) {
        args.push(format!("-sUserPassword={password}"));
    }
    if let Some(password) = owner_password.filter(|p| !p.is_empty()) {
        args.push(format!("-sOwnerPassword={password}"));
    }

    args.push(input_path.to_string_lossy().to_string());
    run_gs(gs, &args)
}

pub fn pdf_to_images(
    gs: &Path,
    input_path: &Path,
    output_dir: &Path,
    format: &str,
    dpi: u32,
) -> Result<Vec<PathBuf>, String> {
    fs::create_dir_all(output_dir).map_err(|e| e.to_string())?;

    let device = match format.to_lowercase().as_str() {
        "jpeg" | "jpg" => "jpeg",
        _ => "png16m",
    };

    let pattern = output_dir.join(format!("page_%03d.{format}"));
    let args = vec![
        "-dBATCH".to_string(),
        "-dNOPAUSE".to_string(),
        "-dQUIET".to_string(),
        format!("-sDEVICE={device}"),
        format!("-r{dpi}"),
        format!("-sOutputFile={}", pattern.to_string_lossy()),
        input_path.to_string_lossy().to_string(),
    ];

    run_gs(gs, &args)?;

    let mut files: Vec<PathBuf> = fs::read_dir(output_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .collect();
    files.sort();
    Ok(files)
}

#[tauri::command(rename = "compress-with-ghostscript")]
pub async fn compress_with_ghostscript(
    app: AppHandle,
    #[allow(non_snake_case)] fileData: Vec<u8>,
    #[allow(non_snake_case)] fileName: String,
    #[allow(non_snake_case)] outputPath: String,
    quality: String,
) -> Result<serde_json::Value, String> {
    let gs = find_ghostscript_path(&app)
        .ok_or_else(|| "Ghostscript not found on this system.".to_string())?;

    let output_path = PathBuf::from(&outputPath);
    let target_dir = output_path
        .parent()
        .ok_or_else(|| "Invalid output path.".to_string())?;
    let temp_input = target_dir.join(format!(
        ".gs_temp_{}_{}",
        chrono::Utc::now().timestamp_millis(),
        PathBuf::from(&fileName)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("input.pdf")
    ));

    fs::write(&temp_input, &fileData).map_err(|e| e.to_string())?;
    let result = compress_pdf(&gs, &temp_input, &output_path, &quality);
    let _ = fs::remove_file(&temp_input);

    let output_size = result?;
    Ok(serde_json::json!({
        "success": true,
        "outputSize": output_size
    }))
}

#[tauri::command(rename = "protect-with-ghostscript")]
pub async fn protect_with_ghostscript(
    app: AppHandle,
    #[allow(non_snake_case)] fileData: Vec<u8>,
    #[allow(non_snake_case)] fileName: String,
    #[allow(non_snake_case)] outputPath: String,
    #[allow(non_snake_case)] userPassword: Option<String>,
    #[allow(non_snake_case)] ownerPassword: Option<String>,
    permissions: ProtectPermissions,
) -> Result<serde_json::Value, String> {
    let gs = find_ghostscript_path(&app)
        .ok_or_else(|| "Ghostscript not found on this system.".to_string())?;

    let output_path = PathBuf::from(&outputPath);
    let target_dir = output_path
        .parent()
        .ok_or_else(|| "Invalid output path.".to_string())?;
    let temp_input = target_dir.join(format!(
        ".gs_protect_{}_{}",
        chrono::Utc::now().timestamp_millis(),
        PathBuf::from(&fileName)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("input.pdf")
    ));

    fs::write(&temp_input, &fileData).map_err(|e| e.to_string())?;
    let result = protect_pdf(
        &gs,
        &temp_input,
        &output_path,
        userPassword.as_deref(),
        ownerPassword.as_deref(),
        &permissions,
    );
    let _ = fs::remove_file(&temp_input);
    result?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command(rename = "check-ghostscript-availability")]
pub fn check_ghostscript_availability(app: AppHandle) -> serde_json::Value {
    let platform = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    };
    serde_json::json!({
        "hasGhostscript": find_ghostscript_path(&app).is_some(),
        "platform": platform
    })
}
