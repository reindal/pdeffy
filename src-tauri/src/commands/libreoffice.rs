use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

static INSTALL_SOFFICE: OnceLock<Option<PathBuf>> = OnceLock::new();

/// Windows console launcher: avoids splash screens and modal dialogs from `soffice.exe`.
fn resolve_soffice_launcher(candidate: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let file_name = candidate
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if file_name.eq_ignore_ascii_case("soffice.exe")
            || file_name.eq_ignore_ascii_case("soffice.com")
        {
            if let Some(parent) = candidate.parent() {
                let com = parent.join("soffice.com");
                if com.is_file() {
                    return com;
                }
            }
        }
    }
    candidate.to_path_buf()
}

#[cfg(target_os = "windows")]
fn configure_soffice_command(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn configure_soffice_command(_cmd: &mut Command) {}

#[cfg(target_os = "windows")]
fn program_dir_has_soffice(program_dir: &Path) -> Option<PathBuf> {
    let com = program_dir.join("soffice.com");
    if com.is_file() {
        return Some(com);
    }
    let exe = program_dir.join("soffice.exe");
    if exe.is_file() {
        return Some(resolve_soffice_launcher(&exe));
    }
    let bin = program_dir.join("soffice");
    if bin.is_file() {
        return Some(bin);
    }
    None
}

/// Returns a path if LibreOffice binaries appear to be installed (no health check).
#[allow(dead_code)]
pub fn find_soffice_path() -> Option<PathBuf> {
    find_soffice_install_path().map(|p| resolve_soffice_launcher(&p))
}

fn find_soffice_install_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let program_dirs = [
            PathBuf::from(r"C:\Program Files\LibreOffice\program"),
            PathBuf::from(r"C:\Program Files (x86)\LibreOffice\program"),
        ];
        for dir in program_dirs {
            if let Some(launcher) = program_dir_has_soffice(&dir) {
                return Some(launcher);
            }
        }
        if let Ok(output) = Command::new("where").arg("soffice").output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    let path = PathBuf::from(trimmed);
                    if path.is_file() {
                        return Some(resolve_soffice_launcher(&path));
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

#[allow(dead_code)]
fn verify_soffice_works(soffice: &Path) -> bool {
    let profile_dir = std::env::temp_dir().join(format!(
        "pdeffy_lo_probe_{}",
        uuid::Uuid::new_v4()
    ));
    if fs::create_dir_all(&profile_dir).is_err() {
        return false;
    }

    let env_flag = profile_env_flag(&profile_dir);
    let mut cmd = Command::new(soffice);
    configure_soffice_command(&mut cmd);
    let output = cmd
        .arg(&env_flag)
        .args([
            "--headless",
            "--invisible",
            "--nologo",
            "--nodefault",
            "--norestore",
            "--version",
        ])
        .output();

    let _ = fs::remove_dir_all(&profile_dir);

    match output {
        Ok(out) if out.status.success() => true,
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let stdout = String::from_utf8_lossy(&out.stdout);
            eprintln!(
                "[LibreOffice] Health check failed (exit {:?}): {stderr}{stdout}",
                out.status.code()
            );
            false
        }
        Err(e) => {
            eprintln!("[LibreOffice] Health check could not run: {e}");
            false
        }
    }
}

/// Cached launcher path (binary presence only — no subprocess probe).
pub fn find_soffice_install_launcher() -> Option<PathBuf> {
    INSTALL_SOFFICE
        .get_or_init(|| {
            find_soffice_install_path().map(|path| resolve_soffice_launcher(&path))
        })
        .clone()
}

pub fn is_libreoffice_installed() -> bool {
    find_soffice_install_launcher().is_some()
}

/// Alias for engine checks: fast path detection, no health probe at startup.
pub fn is_libreoffice_usable() -> bool {
    is_libreoffice_installed()
}

#[allow(dead_code)]
pub fn find_working_soffice_path() -> Option<PathBuf> {
    find_soffice_install_launcher()
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
    configure_soffice_command(&mut cmd);
    cmd.arg(&env_flag).args([
        "--headless",
        "--invisible",
        "--nologo",
        "--nodefault",
        "--norestore",
    ]);
    for arg in args {
        cmd.arg(arg);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run LibreOffice: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        let hint = if detail.to_ascii_lowercase().contains("bootstrap") {
            " L'installazione di LibreOffice sembra danneggiata: reinstalla LibreOffice da libreoffice.org oppure usa Microsoft Word."
        } else {
            ""
        };
        return Err(format!("LibreOffice conversion failed: {detail}.{hint}"));
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
    let soffice = find_soffice_install_launcher().ok_or_else(|| {
        if find_soffice_install_path().is_some() {
            "LibreOffice è installato ma non risponde (installazione danneggiata o incompleta). \
             Reinstalla LibreOffice oppure installa Microsoft Word per la conversione DOCX→PDF."
                .to_string()
        } else {
            "LibreOffice non trovato. Installa LibreOffice oppure Microsoft Word.".to_string()
        }
    })?;
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
