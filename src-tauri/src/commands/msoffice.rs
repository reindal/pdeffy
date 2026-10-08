#[cfg(target_os = "windows")]
use std::fs;
#[cfg(target_os = "windows")]
use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use std::process::Command;

#[cfg(target_os = "windows")]
pub fn is_msoffice_installed() -> bool {
    let paths = [
        r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE",
        r"C:\Program Files (x86)\Microsoft Office\root\Office16\WINWORD.EXE",
        r"C:\Program Files\Microsoft Office\Office16\WINWORD.EXE",
        r"C:\Program Files (x86)\Microsoft Office\Office16\WINWORD.EXE",
        r"C:\Program Files\Microsoft Office\root\Office15\WINWORD.EXE",
    ];
    paths.iter().any(|p| PathBuf::from(p).exists())
}

#[cfg(target_os = "macos")]
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::Command;

#[cfg(target_os = "macos")]
pub fn is_msoffice_installed() -> bool {
    PathBuf::from("/Applications/Microsoft Word.app/Contents/MacOS/Microsoft Word").exists()
        || PathBuf::from("/Applications/Microsoft Word.app").exists()
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
use std::path::PathBuf;

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
pub fn is_msoffice_installed() -> bool {
    false
}

#[cfg(target_os = "windows")]
fn escape_ps_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

/// Word COM expects absolute native paths (backslashes on Windows).
#[cfg(target_os = "windows")]
fn path_for_com(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('/', "\\")
}

#[cfg(target_os = "windows")]
pub fn convert_with_msoffice(
    input_path: &Path,
    output_path: &Path,
    format: &str,
    input_ext: &str,
) -> Result<(), String> {
    let route = format!("{input_ext}_to_{format}");
    let input = escape_ps_single_quoted(&path_for_com(input_path));
    let output = escape_ps_single_quoted(&path_for_com(output_path));

    let ps_script = match route.as_str() {
        ".pdf_to_docx" => format!(
            r#"$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {{
    $doc = $word.Documents.Open('{input}')
    $doc.SaveAs([ref]'{output}', [ref]16)
    $doc.Close()
    $word.Quit()
    exit 0
}} catch {{
    if ($word) {{ $word.Quit() }}
    exit 1
}}"#
        ),
        ".pdf_to_pptx" => format!(
            r#"$ppt = New-Object -ComObject PowerPoint.Application
$ppt.DisplayAlerts = 1
try {{
    $pres = $ppt.Presentations.Open('{input}', $false, $false, $false)
    $pres.SaveAs('{output}', 24)
    $pres.Close()
    $ppt.Quit()
    exit 0
}} catch {{
    if ($ppt) {{ $ppt.Quit() }}
    exit 1
}}"#
        ),
        ".docx_to_pdf" => format!(
            r#"$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {{
    $doc = $word.Documents.Open('{input}')
    $doc.SaveAs([ref]'{output}', [ref]17)
    $doc.Close()
    $word.Quit()
    exit 0
}} catch {{
    if ($word) {{ $word.Quit() }}
    exit 1
}}"#
        ),
        ".pptx_to_pdf" => format!(
            r#"$ppt = New-Object -ComObject PowerPoint.Application
$ppt.DisplayAlerts = 1
try {{
    $pres = $ppt.Presentations.Open('{input}', $false, $false, $false)
    $pres.SaveAs('{output}', 32)
    $pres.Close()
    $ppt.Quit()
    exit 0
}} catch {{
    if ($ppt) {{ $ppt.Quit() }}
    exit 1
}}"#
        ),
        _ => return Err("Format not supported by MS Office engine.".into()),
    };

    let temp_dir = std::env::temp_dir();
    let ps_path = temp_dir.join(format!("msoffice_{}.ps1", chrono::Utc::now().timestamp_millis()));
    fs::write(&ps_path, ps_script).map_err(|e| e.to_string())?;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let output = Command::new("powershell.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &ps_path.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("Failed to run PowerShell: {e}"))?;

    let _ = fs::remove_file(&ps_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("MS Office conversion failed: {stderr}"));
    }

    if output_path.is_file() {
        return Ok(());
    }

    // Word sometimes writes next to the source DOCX with the same stem.
    let sibling = input_path.with_extension("pdf");
    if sibling.is_file() && sibling != output_path {
        fs::rename(&sibling, output_path).map_err(|e| e.to_string())?;
        return Ok(());
    }

    Err(format!(
        "MS Office reported success but the PDF was not found at {}",
        output_path.display()
    ))
}

#[cfg(target_os = "macos")]
fn escape_applescript_str(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(target_os = "macos")]
fn word_mac_quit_saving_no() {
    let _ = Command::new("osascript")
        .args([
            "-e",
            r#"tell application "Microsoft Word"
  try
    quit saving no
  end try
end tell"#,
        ])
        .output();
}

#[cfg(target_os = "macos")]
struct WordMacQuitGuard;

#[cfg(target_os = "macos")]
impl Drop for WordMacQuitGuard {
    fn drop(&mut self) {
        word_mac_quit_saving_no();
    }
}

#[cfg(target_os = "macos")]
pub fn word_mac_staging_dir() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home)
            .join("Documents")
            .join("pdeffy_word_staging");
    }
    std::env::temp_dir().join("pdeffy_word_staging")
}

#[cfg(target_os = "macos")]
fn escape_vba_str(value: &str) -> String {
    value.replace('"', "\"\"")
}

/// One VBA run: ScreenUpdating off, open each doc hidden, ExportAsFixedFormat2, close — fewer window flashes than AppleScript open/save.
#[cfg(target_os = "macos")]
fn word_mac_build_vba_batch(jobs: &[(PathBuf, PathBuf)]) -> String {
    let mut vba = String::from(
        "Application.ScreenUpdating = False : Application.Visible = False : Dim d As Document",
    );
    for (input, output) in jobs {
        let input = input
            .canonicalize()
            .unwrap_or_else(|_| input.to_path_buf());
        let output = output
            .canonicalize()
            .unwrap_or_else(|_| output.to_path_buf());
        let inp = escape_vba_str(&input.to_string_lossy());
        let out = escape_vba_str(&output.to_string_lossy());
        vba.push_str(&format!(
            " : Set d = Documents.Open(FileName:=\"{inp}\", Visible:=False, ReadOnly:=True) : d.ExportAsFixedFormat2 OutputFileName:=\"{out}\", ExportFormat:=17, OpenAfterExport:=False : d.Close SaveChanges:=False"
        ));
    }
    vba
}

#[cfg(target_os = "macos")]
fn word_mac_script_open_save_close(in_posix: &str, out_posix: &str) -> String {
    format!(
        r#"  open POSIX file "{in_posix}"
  tell active document
    save as it file name POSIX file "{out_posix}" file format format PDF
    close saving no
  end tell
"#
    )
}

#[cfg(target_os = "macos")]
pub fn convert_with_msoffice(
    input_path: &Path,
    output_path: &Path,
    format: &str,
    input_ext: &str,
) -> Result<(), String> {
    if input_ext != ".docx" || format != "pdf" {
        return Err("Su macOS Microsoft Word supporta solo DOCX→PDF.".into());
    }
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let jobs = [(input_path.to_path_buf(), output_path.to_path_buf())];
    word_mac_run_batch_on_jobs(&jobs)
}

#[cfg(target_os = "macos")]
fn word_mac_run_batch_on_jobs(jobs: &[(PathBuf, PathBuf)]) -> Result<(), String> {
    let _quit_guard = WordMacQuitGuard;

    let vba = word_mac_build_vba_batch(jobs);
    let vba_escaped = escape_applescript_str(&vba);
    let body = format!(
        r#"tell application "Microsoft Word"
  if not running then
    launch
  end if
  set visible to false
  do Visual Basic "{vba_escaped}"
end tell"#
    );

    let script_path = std::env::temp_dir().join(format!(
        "pdeffy_word_batch_{}.applescript",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    std::fs::write(&script_path, &body).map_err(|e| e.to_string())?;

    let output = Command::new("osascript")
        .arg(&script_path)
        .output()
        .map_err(|e| format!("Impossibile avviare AppleScript/Word: {e}"))?;
    let _ = std::fs::remove_file(&script_path);

    if !output.status.success() {
        return word_mac_run_batch_on_jobs_applescript_fallback(jobs);
    }

    for (_, out) in jobs {
        if !out.is_file() {
            return word_mac_run_batch_on_jobs_applescript_fallback(jobs);
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn word_mac_run_batch_on_jobs_applescript_fallback(jobs: &[(PathBuf, PathBuf)]) -> Result<(), String> {
    let mut steps = String::new();
    for (idx, (input, output)) in jobs.iter().enumerate() {
        let input = input
            .canonicalize()
            .unwrap_or_else(|_| input.to_path_buf());
        let output = output
            .canonicalize()
            .unwrap_or_else(|_| output.to_path_buf());
        let in_posix = escape_applescript_str(&input.to_string_lossy());
        let out_posix = escape_applescript_str(&output.to_string_lossy());
        steps.push_str(&format!(
            r#"  try
{}
  on error errMsg number errNum
    error "Documento {}: " & errMsg number errNum
  end try
"#,
            word_mac_script_open_save_close(&in_posix, &out_posix),
            idx + 1
        ));
    }

    let body = format!(
        r#"tell application "Microsoft Word"
  if not running then
    launch
  end if
  set visible to false
{steps}end tell"#
    );

    let output = Command::new("osascript")
        .args(["-e", &body])
        .output()
        .map_err(|e| format!("Impossibile avviare AppleScript/Word: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Conversione Word fallita: {stderr}{stdout}"));
    }

    for (_, out) in jobs {
        if !out.is_file() {
            return Err(format!("PDF mancante dopo Word: {}", out.display()));
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn batch_convert_docx_to_pdf(jobs: &[(PathBuf, PathBuf)]) -> Result<(), String> {
    use std::fs;
    if jobs.is_empty() {
        return Ok(());
    }
    for (input, output) in jobs {
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if !input.is_file() {
            return Err(format!("File DOCX mancante: {}", input.display()));
        }
    }

    let mut pairs = String::new();
    for (input, output) in jobs {
        let inp = escape_ps_single_quoted(&path_for_com(input));
        let out = escape_ps_single_quoted(&path_for_com(output));
        pairs.push_str(&format!("@('{}','{}'),", inp, out));
    }

    let ps_script = format!(
        r#"$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$jobs = @({pairs})
try {{
  foreach ($job in $jobs) {{
    $doc = $word.Documents.Open($job[0])
    $doc.SaveAs([ref]$job[1], [ref]17)
    $doc.Close()
  }}
  $word.Quit()
  exit 0
}} catch {{
  if ($word) {{ $word.Quit() }}
  exit 1
}}"#
    );

    let temp_dir = std::env::temp_dir();
    let ps_path = temp_dir.join(format!("msoffice_batch_{}.ps1", chrono::Utc::now().timestamp_millis()));
    fs::write(&ps_path, ps_script).map_err(|e| e.to_string())?;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let output = Command::new("powershell.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &ps_path.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("Failed to run PowerShell: {e}"))?;
    let _ = fs::remove_file(&ps_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("MS Office batch conversion failed: {stderr}"));
    }

    for (_, output) in jobs {
        if !output.is_file() {
            return Err(format!("PDF mancante dopo Word: {}", output.display()));
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn batch_convert_docx_to_pdf(jobs: &[(PathBuf, PathBuf)]) -> Result<(), String> {
    if jobs.is_empty() {
        return Ok(());
    }
    for (input, output) in jobs {
        if let Some(parent) = output.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if !input.is_file() {
            return Err(format!("File DOCX mancante: {}", input.display()));
        }
    }

    word_mac_run_batch_on_jobs(jobs).map_err(|e| {
        if e.starts_with("Conversione Word fallita:") {
            e.replacen("Conversione Word fallita:", "Conversione Word batch fallita:", 1)
        } else {
            e
        }
    })
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
pub fn batch_convert_docx_to_pdf(_jobs: &[(PathBuf, PathBuf)]) -> Result<(), String> {
    Err("Microsoft Office batch conversion is only supported on Windows and macOS.".into())
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
pub fn convert_with_msoffice(
    _input_path: &std::path::Path,
    _output_path: &std::path::Path,
    _format: &str,
    _input_ext: &str,
) -> Result<(), String> {
    Err("Microsoft Office conversion is only supported on Windows and macOS.".into())
}
