//! Dialog helpers.
//!
//! Save/open dialogs should be handled on the frontend via `@tauri-apps/plugin-dialog`.
//! This module is reserved for any future backend-only dialog needs.

use tauri::AppHandle;

/// Placeholder kept for parity with the Electron IPC surface.
/// Frontend code should prefer `plugin-dialog` directly.
#[tauri::command(rename = "dialog-backend-ready")]
pub fn dialog_backend_ready(_app: AppHandle) -> bool {
    true
}
