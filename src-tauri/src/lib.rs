mod commands;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build());

    #[cfg(feature = "updater")]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_pdf_metadata,
            commands::settings::save_pdf_metadata,
            commands::settings::get_language,
            commands::settings::save_language,
            commands::settings::check_first_launch,
            commands::settings::get_warning_settings,
            commands::settings::save_warning_settings,
            commands::convert::convert_with_libreoffice,
            commands::convert::convert_file_path,
            commands::ghostscript::compress_with_ghostscript,
            commands::ghostscript::protect_with_ghostscript,
            commands::ghostscript::check_ghostscript_availability,
            commands::engines::check_engines_availability,
            commands::shell_ops::open_folder,
            commands::shell_ops::open_file,
            commands::shell_ops::open_external_url,
            commands::shell_ops::set_file_readonly,
            commands::shell_ops::get_downloads_path,
            commands::shell_ops::get_temp_dir,
            commands::shell_ops::write_file_bytes,
            commands::shell_ops::read_file_bytes,
            commands::shell_ops::mkdir_path,
            commands::shell_ops::remove_path,
            commands::shell_ops::path_exists,
            commands::shell_ops::file_stat,
            commands::dialog::dialog_backend_ready,
            commands::pdf_ops::pdf_merge,
            commands::pdf_ops::pdf_split_pages,
            commands::pdf_ops::pdf_rotate,
            commands::pdf_ops::pdf_delete_pages,
            commands::pdf_ops::pdf_redact_true,
            commands::pdf_ops::pdf_to_images_gs,
            commands::pdf_ops::image_to_pdf,
            commands::pdf_ops::zip_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
