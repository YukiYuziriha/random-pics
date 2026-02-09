use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;

pub struct Db {
    conn: Arc<std::sync::Mutex<Connection>>,
}

impl Db {
    pub fn open(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        let db = Db {
            conn: Arc::new(std::sync::Mutex::new(conn)),
        };
        db.init_schema()?;
        db.run_migrations()?;
        Ok(db)
    }

    fn execute<P: rusqlite::Params>(&self, sql: &str, params: P) -> Result<usize> {
        self.conn.lock().unwrap().execute(sql, params)
    }

    fn query_row<T, P, F>(&self, sql: &str, params: P, f: F) -> Result<T>
    where
        P: rusqlite::Params,
        F: FnOnce(&rusqlite::Row) -> Result<T, rusqlite::Error>,
    {
        self.conn.lock().unwrap().query_row(sql, params, f)
    }

    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap()
    }

    pub fn with_conn<F, R>(&self, f: F) -> Result<R>
    where
        F: FnOnce(&Connection) -> Result<R>,
    {
        let conn = self.conn.lock().unwrap();
        f(&*conn)
    }

    fn init_schema(&self) -> Result<()> {
        self.execute(
            "CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                added_at TEXT NOT NULL,
                current_index INTEGER NOT NULL DEFAULT -1,
                current_random_index INTEGER NOT NULL DEFAULT -1
            )",
            rusqlite::params![],
        )?;

        self.execute(
            "CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                folder_id INTEGER,
                FOREIGN KEY (folder_id) REFERENCES folders(id)
            )",
            rusqlite::params![],
        )?;

        self.execute(
            "CREATE TABLE IF NOT EXISTS state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                current_index INTEGER NOT NULL DEFAULT -1,
                current_random_index INTEGER NOT NULL DEFAULT -1,
                current_folder_id INTEGER,
                vertical_mirror INTEGER NOT NULL DEFAULT 0,
                horizontal_mirror INTEGER NOT NULL DEFAULT 0,
                greyscale INTEGER NOT NULL DEFAULT 0,
                timer_flow_mode TEXT NOT NULL DEFAULT 'random',
                show_folder_history_panel INTEGER NOT NULL DEFAULT 1,
                show_top_controls INTEGER NOT NULL DEFAULT 1,
                show_image_history_panel INTEGER NOT NULL DEFAULT 1,
                show_bottom_controls INTEGER NOT NULL DEFAULT 1,
                is_fullscreen_image INTEGER NOT NULL DEFAULT 0,
                last_image_id INTEGER
            )",
            rusqlite::params![],
        )?;

        self.execute(
            "CREATE TABLE IF NOT EXISTS random_history (
                folder_id INTEGER NOT NULL,
                order_index INTEGER NOT NULL,
                image_id INTEGER NOT NULL,
                PRIMARY KEY (folder_id, order_index),
                FOREIGN KEY (folder_id) REFERENCES folders(id),
                FOREIGN KEY (image_id) REFERENCES images(id)
            )",
            rusqlite::params![],
        )?;

        self.execute(
            "CREATE TABLE IF NOT EXISTS current_lap (
                folder_id INTEGER NOT NULL,
                image_id INTEGER NOT NULL,
                PRIMARY KEY (folder_id, image_id),
                FOREIGN KEY (folder_id) REFERENCES folders(id),
                FOREIGN KEY (image_id) REFERENCES images(id)
            )",
            rusqlite::params![],
        )?;

        self.execute(
            "INSERT OR IGNORE INTO state (id) VALUES (1)",
            rusqlite::params![],
        )?;

        Ok(())
    }

    fn run_migrations(&self) -> Result<()> {
        self.ensure_state_column("timer_flow_mode", "TEXT NOT NULL DEFAULT 'random'")?;
        self.ensure_state_column("show_folder_history_panel", "INTEGER NOT NULL DEFAULT 1")?;
        self.ensure_state_column("show_top_controls", "INTEGER NOT NULL DEFAULT 1")?;
        self.ensure_state_column("show_image_history_panel", "INTEGER NOT NULL DEFAULT 1")?;
        self.ensure_state_column("show_bottom_controls", "INTEGER NOT NULL DEFAULT 1")?;
        self.ensure_state_column("is_fullscreen_image", "INTEGER NOT NULL DEFAULT 0")?;
        self.ensure_state_column("last_image_id", "INTEGER")?;
        Ok(())
    }

    fn ensure_state_column(&self, column_name: &str, column_def: &str) -> Result<()> {
        let column_exists: Result<i64> = self.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('state') WHERE name = ?1",
            rusqlite::params![column_name],
            |row: &rusqlite::Row| row.get(0),
        );

        if let Ok(0) = column_exists {
            let full_def = format!("{} {}", column_name, column_def);
            self.execute(
                &format!("ALTER TABLE state ADD COLUMN {}", full_def),
                rusqlite::params![],
            )?;
        }

        Ok(())
    }
}

use tauri::Manager;

pub fn get_db_path(app: &AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;
    Ok(app_data_dir.join("imgstate.sqlite"))
}
