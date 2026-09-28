mod commands;

#[cfg(feature = "ai")]
mod ai;

use std::path::PathBuf;

use tauri::menu::{MenuItemBuilder, MenuBuilder, SubmenuBuilder};
#[cfg(not(target_os = "macos"))]
use tauri::menu::PredefinedMenuItem;
use tauri::{Emitter, Manager, RunEvent};

fn dispatch_cli_pdf_paths(app: &tauri::AppHandle) {
    for arg in std::env::args_os().skip(1) {
        let path = PathBuf::from(arg);
        if path.is_file() {
            commands::file_association::dispatch_opened_pdf(app, &path);
        }
    }
}

fn handle_run_event(app: &tauri::AppHandle, event: RunEvent) {
    #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
    if let RunEvent::Opened { urls } = event {
        for url in urls {
            if let Ok(path) = url.to_file_path() {
                commands::file_association::dispatch_opened_pdf(app, &path);
            }
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
    let _ = (app, event);
}

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

    #[cfg(feature = "ai")]
    {
        builder = builder.manage(ai::AiState::default());
    }

    let builder = builder
        .setup(|app| {
            let version = app.package_info().version.to_string();
            let window_title = format!("Pdeffy {version} — Reindal");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&window_title);
                #[cfg(debug_assertions)]
                let _ = window.open_devtools();

                // Disable trackpad swipe back/forward (WKWebView).
                #[cfg(target_os = "macos")]
                {
                    if let Err(err) = window.with_webview(|webview| {
                        use objc2_web_kit::WKWebView;
                        unsafe {
                            let view: &WKWebView =
                                &*(webview.inner() as *const WKWebView);
                            view.setAllowsBackForwardNavigationGestures(false);
                        }
                    }) {
                        eprintln!("[pdeffy] disable back-forward gestures: {err}");
                    }
                }
            }

            match build_app_menu(app) {
                Ok(menu) => {
                    if let Err(err) = app.set_menu(menu) {
                        eprintln!("[pdeffy] failed to set application menu: {err}");
                    }
                }
                Err(err) => eprintln!("[pdeffy] failed to build application menu: {err}"),
            }

            dispatch_cli_pdf_paths(app.handle());

            Ok(())
        })
        // Bounce browser back/forward navigations before page scripts run.
        .on_page_load(|webview, _payload| {
            let _ = webview.eval(
                r#"(function(){
  try {
    var KEY = 'pdeffy.historyBounce';
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var type = (nav && nav.type) || (performance.navigation && performance.navigation.type);
    if (sessionStorage.getItem(KEY) === '1') { sessionStorage.removeItem(KEY); return; }
    if (type === 'back_forward' || type === 2) {
      sessionStorage.setItem(KEY, '1');
      history.forward();
      return;
    }
  } catch (e) {}
  try { history.pushState({pdeffy:1}, '', location.href); } catch (e) {}
})();"#,
            );
        })
        .on_menu_event(|app, event| {
            if event.id() == "pdeffy-about" {
                let _ = app.emit("pdeffy-about", ());
            }
        });

    #[cfg(feature = "ai")]
    {
        builder
            .invoke_handler(tauri::generate_handler![
                commands::settings::get_pdf_metadata,
                commands::settings::save_pdf_metadata,
                commands::settings::get_language,
                commands::settings::save_language,
                commands::settings::check_first_launch,
                commands::settings::get_warning_settings,
                commands::settings::save_warning_settings,
                commands::file_association::get_default_pdf_app,
                commands::file_association::set_default_pdf_app,
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
                commands::shell_ops::share_file,
                commands::shell_ops::print_file,
                commands::dialog::dialog_backend_ready,
                commands::pdf_ops::pdf_merge,
                commands::pdf_ops::pdf_split_pages,
                commands::pdf_ops::pdf_rotate,
                commands::pdf_ops::pdf_delete_pages,
                commands::pdf_ops::pdf_redact_true,
                commands::pdf_ops::pdf_to_images_gs,
                commands::pdf_ops::image_to_pdf,
                commands::pdf_ops::zip_files,
                commands::ai::list_ai_models,
                commands::ai::set_selected_model,
                commands::ai::get_model_status,
                commands::ai::download_model,
                commands::ai::unload_model,
                commands::ai::summarize_pdf,
                commands::ai::anonymize_pdf,
                commands::ai::get_ocr_status,
                commands::ai::download_ocr_models,
                commands::ai::get_ner_status,
                commands::ai::download_ner_models,
                commands::ai::unload_ner_model,
            ])
            .build(tauri::generate_context!())
            .expect("error while building tauri application")
            .run(|app, event| handle_run_event(&app, event));
    }

    #[cfg(not(feature = "ai"))]
    {
        builder
            .invoke_handler(tauri::generate_handler![
                commands::settings::get_pdf_metadata,
                commands::settings::save_pdf_metadata,
                commands::settings::get_language,
                commands::settings::save_language,
                commands::settings::check_first_launch,
                commands::settings::get_warning_settings,
                commands::settings::save_warning_settings,
                commands::file_association::get_default_pdf_app,
                commands::file_association::set_default_pdf_app,
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
                commands::shell_ops::share_file,
                commands::shell_ops::print_file,
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
            .build(tauri::generate_context!())
            .expect("error while building tauri application")
            .run(|app, event| handle_run_event(&app, event));
    }
}
