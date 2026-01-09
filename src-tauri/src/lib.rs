// Random Pics - Gesture Drawing Clone
// Tauri v2 + WebGPU + TypeScript

mod adapters;
mod app;
mod commands;
mod domain;

use commands::effects;
use commands::folder;
use commands::navigation;
use commands::timer;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Folder commands
            folder::select_folder,
            folder::scan_status,
            // Navigation commands
            navigation::next,
            navigation::prev,
            // Timer commands
            timer::start,
            timer::pause,
            timer::set_duration,
            // Effects commands
            effects::toggle_grayscale,
            effects::toggle_blur,
            effects::set_blur_amount,
            effects::toggle_flip_h,
            effects::toggle_flip_v,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
