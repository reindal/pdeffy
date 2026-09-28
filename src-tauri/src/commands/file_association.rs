use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};

const PDF_MIME: &str = "application/pdf";
const PDF_UTI: &str = "com.adobe.pdf";

#[cfg(target_os = "macos")]
mod macos {
    use super::PDF_UTI;
    use core_foundation::base::TCFType;
    use core_foundation::string::CFString;
    use core_foundation_sys::base::OSStatus;
    use tauri::AppHandle;

    const K_LS_ROLES_ALL: u32 = 0x0000_FFFF;

    extern "C" {
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: core_foundation_sys::string::CFStringRef,
            in_role: u32,
            in_handler_bundle_id: core_foundation_sys::string::CFStringRef,
        ) -> OSStatus;

        fn LSCopyDefaultRoleHandlerForContentType(
            content_type: core_foundation_sys::string::CFStringRef,
            in_role: u32,
        ) -> core_foundation_sys::string::CFStringRef;
    }

    pub fn is_default_pdf_app(app: &AppHandle) -> Result<bool, String> {
        let bundle_id = app.config().identifier.clone();
        let uti = CFString::new(PDF_UTI);
        unsafe {
            let current = LSCopyDefaultRoleHandlerForContentType(uti.as_concrete_TypeRef(), K_LS_ROLES_ALL);
            if current.is_null() {
                return Ok(false);
            }
            let current = CFString::wrap_under_create_rule(current);
            Ok(current.to_string() == bundle_id)
        }
    }

    pub fn set_default_pdf_app(app: &AppHandle, enabled: bool) -> Result<(), String> {
        if !enabled {
            return Ok(());
        }
        let bundle_id = CFString::new(&app.config().identifier);
        let uti = CFString::new(PDF_UTI);
        unsafe {
            let status = LSSetDefaultRoleHandlerForContentType(
                uti.as_concrete_TypeRef(),
                K_LS_ROLES_ALL,
                bundle_id.as_concrete_TypeRef(),
            );
            if status != 0 {
                return Err(format!(
                    "Could not set Pdeffy as default PDF app (Launch Services error {status}). \
                     Open System Settings → Desktop & Dock → Default web browser / or right-click a PDF → Get Info → Open with."
                ));
            }
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use std::os::windows::process::CommandExt;
    use std::path::Path;
    use std::process::Command;

    const PROG_ID: &str = "Pdeffy.Pdf";
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    pub fn is_default_pdf_app() -> Result<bool, String> {
        let script = format!(
            r#"
$progId = (Get-ItemProperty -Path 'Registry::HKEY_CURRENT_USER\Software\Classes\.pdf' -ErrorAction SilentlyContinue).'(default)'
if (-not $progId) {{
  $progId = (Get-ItemProperty -Path 'Registry::HKEY_LOCAL_MACHINE\Software\Classes\.pdf' -ErrorAction SilentlyContinue).'(default)'
}}
if ($progId -eq '{PROG_ID}') {{ exit 0 }} else {{ exit 1 }}
"#
        );
        let status = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| format!("Failed to read PDF default app: {e}"))?;
        Ok(status.success())
    }

    pub fn set_default_pdf_app(install_dir: &Path, exe_name: &str, enabled: bool) -> Result<(), String> {
        if !enabled {
            return Ok(());
        }
        let install_dir = install_dir
            .to_str()
            .ok_or_else(|| "Invalid install path".to_string())?;
        let icon = format!(r"{install_dir}\resources\pdf-document.ico");
        let exe = format!(r"{install_dir}\{exe_name}");
        let script = format!(
            r#"
$progId = '{PROG_ID}'
New-Item -Path "Registry::HKEY_CURRENT_USER\Software\Classes\$progId" -Force | Out-Null
Set-ItemProperty -Path "Registry::HKEY_CURRENT_USER\Software\Classes\$progId" -Name '(default)' -Value 'PDF Document'
New-Item -Path "Registry::HKEY_CURRENT_USER\Software\Classes\$progId\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "Registry::HKEY_CURRENT_USER\Software\Classes\$progId\DefaultIcon" -Name '(default)' -Value '{icon}'
New-Item -Path "Registry::HKEY_CURRENT_USER\Software\Classes\$progId\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "Registry::HKEY_CURRENT_USER\Software\Classes\$progId\shell\open\command" -Name '(default)' -Value '"{exe}" "%1"'
New-Item -Path "Registry::HKEY_CURRENT_USER\Software\Classes\.pdf\OpenWithProgids" -Force | Out-Null
Set-ItemProperty -Path "Registry::HKEY_CURRENT_USER\Software\Classes\.pdf\OpenWithProgids" -Name $progId -Value '' -Type String
Set-ItemProperty -Path "Registry::HKEY_CURRENT_USER\Software\Classes\.pdf" -Name '(default)' -Value $progId
"#
        );
        let status = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| format!("Failed to set default PDF app: {e}"))?;
        if !status.success() {
            return Err("Could not register Pdeffy as the default PDF app.".into());
        }
        Ok(())
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use super::PDF_MIME;
    use std::process::Command;

    pub fn desktop_id() -> &'static str {
        "com.reindal.pdeffy.desktop"
    }

    pub fn is_default_pdf_app() -> Result<bool, String> {
        let out = Command::new("xdg-mime")
            .args(["query", "default", PDF_MIME])
            .output()
            .map_err(|e| format!("xdg-mime failed: {e}"))?;
        if !out.status.success() {
            return Ok(false);
        }
        let current = String::from_utf8_lossy(&out.stdout).trim().to_string();
        Ok(current == desktop_id())
    }

    pub fn set_default_pdf_app(enabled: bool) -> Result<(), String> {
        if !enabled {
            return Ok(());
        }
        let status = Command::new("xdg-mime")
            .args(["default", desktop_id(), PDF_MIME])
            .status()
            .map_err(|e| format!("xdg-mime default failed: {e}"))?;
        if !status.success() {
            return Err("Could not set Pdeffy as default PDF application.".into());
        }
        Ok(())
    }
}

#[tauri::command(rename = "get-default-pdf-app")]
pub fn get_default_pdf_app(app: AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        return macos::is_default_pdf_app(&app);
    }
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        return windows::is_default_pdf_app();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        return linux::is_default_pdf_app();
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = app;
        Ok(false)
    }
}

#[tauri::command(rename = "set-default-pdf-app")]
pub fn set_default_pdf_app(app: AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return macos::set_default_pdf_app(&app, enabled);
    }
    #[cfg(target_os = "windows")]
    {
        let exe_path = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
        let install_dir = exe_path
            .parent()
            .ok_or_else(|| "Could not resolve install directory".to_string())?;
        let exe_name = exe_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("pdeffy.exe");
        return windows::set_default_pdf_app(install_dir, exe_name, enabled);
    }
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        return linux::set_default_pdf_app(enabled);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = (app, enabled);
        Ok(())
    }
}

pub fn dispatch_opened_pdf(app: &AppHandle, path: &Path) {
    if path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("pdf")) != Some(true) {
        return;
    }
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document.pdf")
        .to_string();
    let path_str = path.display().to_string();
    let payload = serde_json::json!({ "path": path_str, "name": name });
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("pdeffy-open-pdf", payload);
    }
}
