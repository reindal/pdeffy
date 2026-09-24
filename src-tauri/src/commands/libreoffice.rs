use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn find_soffice_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let candidates = [
            r"C:\Program Files\LibreOffice\program\soffice.exe",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        ];
        for candidate in candidates {
            let path = PathBuf::from(candidate);
            if path.exists() {
                return Some(path);
            }
        }
        if let Ok(output) = Command::new("where").arg("soffice").output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                if let Some(first) = text.lines().next() {
                    let path = PathBuf::from(first.trim());
                    if path.exists() {
                        return Some(path);
                    }
                }
            }
        }
        return None;
    }

    #[cfg(target_os = "macos")]
    {
        let mac_path = PathBuf::from("/Applications/LibreOffice.app/Contents/MacOS/soffice");
        if mac_path.exists() {
            return Some(mac_path);
        }
        return None;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        for cmd in ["libreoffice", "soffice"] {
            if let Ok(output) = Command::new("which").arg(cmd).output() {
                if output.status.success() {
                    let text = String::from_utf8_lossy(&output.stdout);
                    let path = PathBuf::from(text.trim());
                    if path.exists() {
                        return Some(path);
                    }
                }
            }
        }

        let opt_path = PathBuf::from("/opt");
        if opt_path.exists() {
            if let Ok(entries) = fs::read_dir(&opt_path) {
                let mut lo_dirs: Vec<PathBuf> = entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.path())
                    .filter(|p| {
                        p.file_name()
                            .and_then(|n| n.to_str())
                            .map(|n| n.to_lowercase().starts_with("libreoffice"))
                            .unwrap_or(false)
                    })
                    .collect();
                lo_dirs.sort_by(|a, b| b.cmp(a));
                for dir in lo_dirs {
                    let manual = dir.join("program").join("soffice");
                    if manual.exists() {
                        return Some(manual);
                    }
                }
            }
        }
        None
    }
}

fn path_to_file_url(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    // Encode spaces and other reserved characters for LibreOffice -env:UserInstallation
    let encoded = normalized
        .split('/')
        .map(|seg| {
            if seg.is_empty() {
                String::new()
            } else {
                urlencoding_minimal(seg)
            }
        })
        .collect::<Vec<_>>()
        .join("/");
    if encoded.starts_with("//") {
        format!("file:{encoded}")
    } else if encoded.starts_with('/') {
        format!("file://{encoded}")
    } else {
        format!("file:///{encoded}")
    }
}

fn urlencoding_minimal(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn profile_env_flag(profile_dir: &Path) -> String {
    format!("-env:UserInstallation={}", path_to_file_url(profile_dir))
}

fn run_soffice(soffice: &Path, profile_dir: &Path, args: &[&str]) -> Result<(), String> {
    let env_flag = profile_env_flag(profile_dir);
    let mut cmd = Command::new(soffice);
    cmd.arg(&env_flag).arg("--headless");
    for arg in args {
        cmd.arg(arg);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run LibreOffice: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("LibreOffice conversion failed: {stderr}"));
    }
    Ok(())
}

pub fn convert_standard(
    soffice: &Path,
    input_path: &Path,
    output_dir: &Path,
    format: &str,
    infilter: Option<&str>,
) -> Result<PathBuf, String> {
    let profile_dir = output_dir.join(format!(".lo_profile_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&profile_dir).map_err(|e| e.to_string())?;

    let base_name = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");

    let mut args: Vec<String> = Vec::new();
    if let Some(filter) = infilter {
        args.push(format!("--infilter={filter}"));
    }
    args.push("--convert-to".to_string());
    args.push(format.to_string());
    args.push(input_path.to_string_lossy().to_string());
    args.push("--outdir".to_string());
    args.push(output_dir.to_string_lossy().to_string());

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let result = run_soffice(soffice, &profile_dir, &arg_refs);

    let _ = fs::remove_dir_all(&profile_dir);

    result?;
    Ok(output_dir.join(format!("{base_name}.{format}")))
}

pub fn convert_pdf_to_docx(
    soffice: &Path,
    input_path: &Path,
    output_dir: &Path,
    output_path: &Path,
) -> Result<(), String> {
    let profile_dir = output_dir.join(format!(".lo_profile_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&profile_dir).map_err(|e| e.to_string())?;

    let base_name = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let temp_odt = output_dir.join(format!("{base_name}.odt"));

    let step1 = run_soffice(
        soffice,
        &profile_dir,
        &[
            "--infilter=writer_pdf_import",
            "--convert-to",
            "odt",
            &input_path.to_string_lossy(),
            "--outdir",
            &output_dir.to_string_lossy(),
        ],
    );
    if step1.is_err() {
        let _ = fs::remove_dir_all(&profile_dir);
        return step1;
    }

    let step2 = run_soffice(
        soffice,
        &profile_dir,
        &[
            "--convert-to",
            "docx",
            &temp_odt.to_string_lossy(),
            "--outdir",
            &output_dir.to_string_lossy(),
        ],
    );

    let _ = fs::remove_file(&temp_odt);
    let _ = fs::remove_dir_all(&profile_dir);

    step2?;

    let generated = output_dir.join(format!("{base_name}.docx"));
    if generated.exists() && generated != output_path {
        fs::rename(&generated, output_path).map_err(|e| e.to_string())?;
    } else if !output_path.exists() {
        return Err("LibreOffice process finished, but the expected DOCX file was not found.".into());
    }
    Ok(())
}

pub fn convert_with_libreoffice_engine(
    input_path: &Path,
    output_path: &Path,
    format: &str,
) -> Result<(), String> {
    let soffice = find_soffice_path().ok_or_else(|| "LibreOffice installation not found.".to_string())?;
    let output_dir = output_path
        .parent()
        .ok_or_else(|| "Invalid output path.".to_string())?;

    let is_pdf = input_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);

    if is_pdf && format == "docx" {
        return convert_pdf_to_docx(&soffice, input_path, output_dir, output_path);
    }

    let infilter = if is_pdf && format == "pptx" {
        Some("impress_pdf_import")
    } else {
        None
    };

    let generated = convert_standard(&soffice, input_path, output_dir, format, infilter)?;
    if generated.exists() && generated != output_path {
        fs::rename(&generated, output_path).map_err(|e| e.to_string())?;
    } else if !output_path.exists() {
        return Err(format!(
            "LibreOffice process finished, but the expected {format} file was not found."
        ));
    }
    Ok(())
}
