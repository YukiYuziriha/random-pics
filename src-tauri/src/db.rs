use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;

pub struct Db {
    conn: Arc<std::sync::Mutex<Connection>>,
}

impl Db {
    pub fn open(db_path: PathBuf) -> Result<Self> {
        eprintln!("[RUST] Db::open: opening database at {}", db_path.display());
        let conn = Connection::open(db_path)?;
        let db = Db {
            conn: Arc::new(std::sync::Mutex::new(conn)),
        };
        db.init_schema()?;
        db.run_migrations()?;
        eprintln!("[RUST] Db::open: database opened successfully");
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
                path TEXT NOT NULL,
                folder_id INTEGER,
                FOREIGN KEY (folder_id) REFERENCES folders(id)
            )",
            rusqlite::params![],
        )?;

        self.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_images_folder_path ON images(folder_id, path)",
            rusqlite::params![],
        )?;
        self.execute(
            "CREATE INDEX IF NOT EXISTS idx_images_folder_id ON images(folder_id)",
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
                last_image_id INTEGER,
                shortcut_hints_visible INTEGER NOT NULL DEFAULT 0,
                shortcut_hint_side TEXT NOT NULL DEFAULT 'left'
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

        self.ensure_hidden_tables_and_indexes()?;

        self.execute(
            "INSERT OR IGNORE INTO state (id) VALUES (1)",
            rusqlite::params![],
        )?;

        Ok(())
    }

    fn run_migrations(&self) -> Result<()> {
        self.migrate_images_to_folder_scoped_paths()?;
        self.ensure_state_column("timer_flow_mode", "TEXT NOT NULL DEFAULT 'random'")?;
        self.ensure_state_column("show_folder_history_panel", "INTEGER NOT NULL DEFAULT 1")?;
        self.ensure_state_column("show_top_controls", "INTEGER NOT NULL DEFAULT 1")?;
        self.ensure_state_column("show_image_history_panel", "INTEGER NOT NULL DEFAULT 1")?;
        self.ensure_state_column("show_bottom_controls", "INTEGER NOT NULL DEFAULT 1")?;
        self.ensure_state_column("is_fullscreen_image", "INTEGER NOT NULL DEFAULT 0")?;
        self.ensure_state_column("last_image_id", "INTEGER")?;
        self.ensure_state_column("shortcut_hints_visible", "INTEGER NOT NULL DEFAULT 0")?;
        self.ensure_state_column("shortcut_hint_side", "TEXT NOT NULL DEFAULT 'left'")?;
        self.ensure_hidden_tables_and_indexes()?;
        Ok(())
    }

    fn migrate_images_to_folder_scoped_paths(&self) -> Result<()> {
        let needs_migration: i64 = self.query_row(
            "SELECT COUNT(*) FROM pragma_index_list('images') WHERE origin = 'u'",
            rusqlite::params![],
            |row| row.get(0),
        )?;

        if needs_migration == 0 {
            self.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_images_folder_path ON images(folder_id, path)",
                rusqlite::params![],
            )?;
            self.execute(
                "CREATE INDEX IF NOT EXISTS idx_images_folder_id ON images(folder_id)",
                rusqlite::params![],
            )?;
            return Ok(());
        }

        let mut conn = self.conn();
        conn.execute("PRAGMA foreign_keys = OFF", rusqlite::params![])?;
        let tx = conn.transaction()?;
        tx.execute(
            "DROP INDEX IF EXISTS idx_images_folder_path",
            rusqlite::params![],
        )?;
        tx.execute(
            "DROP INDEX IF EXISTS idx_images_folder_id",
            rusqlite::params![],
        )?;
        tx.execute(
            "ALTER TABLE images RENAME TO images_old",
            rusqlite::params![],
        )?;
        tx.execute(
            "CREATE TABLE images (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL,
                folder_id INTEGER,
                FOREIGN KEY (folder_id) REFERENCES folders(id)
            )",
            rusqlite::params![],
        )?;
        tx.execute(
            "INSERT INTO images (id, path, folder_id)
             SELECT id, path, folder_id FROM images_old",
            rusqlite::params![],
        )?;
        tx.execute(
            "CREATE UNIQUE INDEX idx_images_folder_path ON images(folder_id, path)",
            rusqlite::params![],
        )?;
        tx.execute(
            "CREATE INDEX idx_images_folder_id ON images(folder_id)",
            rusqlite::params![],
        )?;
        tx.execute("DROP TABLE images_old", rusqlite::params![])?;
        tx.commit()?;
        conn.execute("PRAGMA foreign_keys = ON", rusqlite::params![])?;
        Ok(())
    }

    fn ensure_hidden_tables_and_indexes(&self) -> Result<()> {
        self.execute(
            "CREATE TABLE IF NOT EXISTS hidden_normal_images (
                folder_id INTEGER NOT NULL,
                image_id INTEGER NOT NULL,
                PRIMARY KEY (folder_id, image_id),
                FOREIGN KEY (folder_id) REFERENCES folders(id),
                FOREIGN KEY (image_id) REFERENCES images(id)
            )",
            rusqlite::params![],
        )?;
        self.execute(
            "CREATE TABLE IF NOT EXISTS hidden_random_images (
                folder_id INTEGER NOT NULL,
                image_id INTEGER NOT NULL,
                PRIMARY KEY (folder_id, image_id),
                FOREIGN KEY (folder_id) REFERENCES folders(id),
                FOREIGN KEY (image_id) REFERENCES images(id)
            )",
            rusqlite::params![],
        )?;
        self.execute(
            "CREATE INDEX IF NOT EXISTS idx_hidden_normal_folder ON hidden_normal_images(folder_id)",
            rusqlite::params![],
        )?;
        self.execute(
            "CREATE INDEX IF NOT EXISTS idx_hidden_normal_image ON hidden_normal_images(image_id)",
            rusqlite::params![],
        )?;
        self.execute(
            "CREATE INDEX IF NOT EXISTS idx_hidden_random_folder ON hidden_random_images(folder_id)",
            rusqlite::params![],
        )?;
        self.execute(
            "CREATE INDEX IF NOT EXISTS idx_hidden_random_image ON hidden_random_images(image_id)",
            rusqlite::params![],
        )?;
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
