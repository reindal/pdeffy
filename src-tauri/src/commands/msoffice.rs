#[cfg(target_os = "windows")]
use std::fs;
#[cfg(target_os = "windows")]
use std::path::{Path, PathBuf};
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

#[cfg(not(target_os = "windows"))]
pub fn is_msoffice_installed() -> bool {
    false
}

#[cfg(target_os = "windows")]
fn escape_ps_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

#[cfg(target_os = "windows")]
pub fn convert_with_msoffice(
    input_path: &Path,
    output_path: &Path,
    format: &str,
    input_ext: &str,
) -> Result<(), String> {
    let route = format!("{input_ext}_to_{format}");
    let input = escape_ps_single_quoted(&input_path.to_string_lossy());
    let output = escape_ps_single_quoted(&output_path.to_string_lossy());

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

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
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
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn convert_with_msoffice(
    _input_path: &std::path::Path,
    _output_path: &std::path::Path,
    _format: &str,
    _input_ext: &str,
) -> Result<(), String> {
    Err("Only supported on Windows environment.".into())
}
