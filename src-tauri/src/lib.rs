use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if !cfg!(debug_assertions) {
        let app_data_dir = app.path().app_data_dir()?;
        std::fs::create_dir_all(&app_data_dir)?;

        let resource_dir = app.path().resource_dir()?;
        let server_bin_candidates = [
          resource_dir.join("dist-tauri").join("server"),
          resource_dir.join("_up_").join("dist-tauri").join("server"),
        ];
        let server_bin = server_bin_candidates
          .into_iter()
          .find(|path| path.exists())
          .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "bundled backend not found"))?;
        let server_cwd = if resource_dir.join("_up_").exists() {
          resource_dir.join("_up_")
        } else {
          resource_dir.clone()
        };

        let _server = std::process::Command::new(server_bin)
          .current_dir(server_cwd)
          .env("RANDOM_PICS_DATA_DIR", app_data_dir)
          .spawn()?;

        for _ in 0..50 {
          if std::net::TcpStream::connect("127.0.0.1:3000").is_ok() {
            break;
          }
          std::thread::sleep(std::time::Duration::from_millis(100));
        }
      }

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
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
