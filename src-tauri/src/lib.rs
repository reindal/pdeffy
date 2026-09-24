mod commands;

use tauri::menu::{MenuItemBuilder, MenuBuilder, SubmenuBuilder};
#[cfg(not(target_os = "macos"))]
use tauri::menu::PredefinedMenuItem;
use tauri::{Emitter, Manager};

fn build_app_menu(app: &tauri::App) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let about = MenuItemBuilder::with_id("pdeffy-about", "About Pdeffy").build(app)?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, "Pdeffy")
            .item(&about)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;

        let edit_menu = SubmenuBuilder::new(app, "Edit")
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?;

        let window_menu = SubmenuBuilder::new(app, "Window")
            .minimize()
            .maximize()
            .separator()
            .close_window()
            .build()?;

        return MenuBuilder::new(app)
            .item(&app_menu)
            .item(&edit_menu)
            .item(&window_menu)
            .build();
    }

    #[cfg(not(target_os = "macos"))]
    {
        let file_menu = SubmenuBuilder::new(app, "File")
            .item(&PredefinedMenuItem::quit(app, None)?)
            .build()?;

        let help_menu = SubmenuBuilder::new(app, "Help").item(&about).build()?;

        MenuBuilder::new(app)
            .item(&file_menu)
            .item(&help_menu)
            .build()
    }
}

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
            let version = app.package_info().version.to_string();
            let window_title = format!("Pdeffy {version} — Reindal");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&window_title);
                #[cfg(debug_assertions)]
                let _ = window.open_devtools();
            }

            match build_app_menu(app) {
                Ok(menu) => {
                    if let Err(err) = app.set_menu(menu) {
                        eprintln!("[pdeffy] failed to set application menu: {err}");
                    }
                }
                Err(err) => eprintln!("[pdeffy] failed to build application menu: {err}"),
            }

            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == "pdeffy-about" {
                let _ = app.emit("pdeffy-about", ());
            }
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
