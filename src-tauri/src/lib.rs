pub mod commands;
pub mod db;
pub mod img_loader;

use commands::ImageLoaderState;
use db::Db;
use img_loader::ImageLoader;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let f11 = Shortcut::new(None, Code::F11);
    let f11_for_handler = f11.clone();

    tauri::Builder::default()
        .manage(ImageLoaderState::new(std::sync::RwLock::new(None)))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &f11_for_handler && event.state() == ShortcutState::Pressed {
                        if let Some(win) = app.get_webview_window("main") {
                            if let Ok(is_fullscreen) = win.is_fullscreen() {
                                let _ = win.set_fullscreen(!is_fullscreen);
                            }
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(move |app| {
            let db_path = db::get_db_path(app.handle())?;
            let db = Db::open(db_path)?;
            let loader = Arc::new(ImageLoader::new(db));
            *app.state::<ImageLoaderState>()
                .write()
                .map_err(|_| std::io::Error::other("image loader state lock poisoned"))? =
                Some(loader);

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app.handle().plugin(tauri_plugin_dialog::init())?;
            app.global_shortcut().register(f11.clone())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pick_folder,
            commands::next_folder,
            commands::prev_folder,
            commands::get_folder_history,
            commands::reindex_current_folder,
            commands::get_current_image,
            commands::get_next_image,
            commands::get_prev_image,
            commands::get_next_random_image,
            commands::get_prev_random_image,
            commands::get_force_random_image,
            commands::get_normal_history,
            commands::get_random_history,
            commands::reset_normal_history,
            commands::reset_random_history,
            commands::get_image_state,
            commands::set_image_state,
            commands::full_wipe,
            commands::is_healthy,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|err| eprintln!("error while running tauri application: {}", err));
}
