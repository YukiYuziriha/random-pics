pub mod commands;
pub mod db;
pub mod img_loader;

use commands::ImageLoaderState;
use db::Db;
use img_loader::ImageLoader;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ImageLoaderState::new(std::sync::RwLock::new(None)))
        .setup(|app| {
            let db_path = db::get_db_path(app.handle())?;
            let db = Db::open(db_path).expect("Failed to open database");
            let loader = Arc::new(ImageLoader::new(db));
            *app.state::<ImageLoaderState>().write().unwrap() = Some(loader);

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app.handle().plugin(tauri_plugin_dialog::init())?;
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
        .expect("error while running tauri application");
}
