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
        self.repair_images_old_foreign_keys()?;
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
        let has_global_path_unique: i64 = self.query_row(
            "SELECT COUNT(*) FROM pragma_index_list('images') WHERE origin = 'u'",
            rusqlite::params![],
            |row| row.get(0),
        )?;

        if has_global_path_unique == 0 {
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
            "CREATE TABLE images_new (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL,
                folder_id INTEGER,
                FOREIGN KEY (folder_id) REFERENCES folders(id)
            )",
            rusqlite::params![],
        )?;
        tx.execute(
            "INSERT INTO images_new (id, path, folder_id)
             SELECT id, path, folder_id FROM images",
            rusqlite::params![],
        )?;
        tx.execute("DROP TABLE images", rusqlite::params![])?;
        tx.execute(
            "ALTER TABLE images_new RENAME TO images",
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
        tx.commit()?;
        conn.execute("PRAGMA foreign_keys = ON", rusqlite::params![])?;
        Ok(())
    }

    fn table_references_images_old(&self, table_name: &str) -> Result<bool> {
        let count: i64 = self.query_row(
            "SELECT COUNT(*) FROM pragma_foreign_key_list(?1) WHERE \"table\" = 'images_old'",
            rusqlite::params![table_name],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    fn repair_images_old_foreign_keys(&self) -> Result<()> {
        let targets = [
            "random_history",
            "current_lap",
            "hidden_normal_images",
            "hidden_random_images",
        ];

        let mut needs_repair = false;
        for table in targets {
            if self.table_references_images_old(table)? {
                needs_repair = true;
                break;
            }
        }

        if !needs_repair {
            return Ok(());
        }

        let mut conn = self.conn();
        conn.execute("PRAGMA foreign_keys = OFF", rusqlite::params![])?;
        let tx = conn.transaction()?;

        tx.execute(
            "ALTER TABLE random_history RENAME TO random_history_old",
            rusqlite::params![],
        )?;
        tx.execute(
            "CREATE TABLE random_history (
                folder_id INTEGER NOT NULL,
                order_index INTEGER NOT NULL,
                image_id INTEGER NOT NULL,
                PRIMARY KEY (folder_id, order_index),
                FOREIGN KEY (folder_id) REFERENCES folders(id),
                FOREIGN KEY (image_id) REFERENCES images(id)
            )",
            rusqlite::params![],
        )?;
        tx.execute(
            "INSERT INTO random_history (folder_id, order_index, image_id)
             SELECT folder_id, order_index, image_id FROM random_history_old",
            rusqlite::params![],
        )?;
        tx.execute("DROP TABLE random_history_old", rusqlite::params![])?;

        tx.execute(
            "ALTER TABLE current_lap RENAME TO current_lap_old",
            rusqlite::params![],
        )?;
        tx.execute(
            "CREATE TABLE current_lap (
                folder_id INTEGER NOT NULL,
                image_id INTEGER NOT NULL,
                PRIMARY KEY (folder_id, image_id),
                FOREIGN KEY (folder_id) REFERENCES folders(id),
                FOREIGN KEY (image_id) REFERENCES images(id)
            )",
            rusqlite::params![],
        )?;
        tx.execute(
            "INSERT INTO current_lap (folder_id, image_id)
             SELECT folder_id, image_id FROM current_lap_old",
            rusqlite::params![],
        )?;
        tx.execute("DROP TABLE current_lap_old", rusqlite::params![])?;

        tx.execute(
            "ALTER TABLE hidden_normal_images RENAME TO hidden_normal_images_old",
            rusqlite::params![],
        )?;
        tx.execute(
            "CREATE TABLE hidden_normal_images (
                folder_id INTEGER NOT NULL,
                image_id INTEGER NOT NULL,
                PRIMARY KEY (folder_id, image_id),
                FOREIGN KEY (folder_id) REFERENCES folders(id),
                FOREIGN KEY (image_id) REFERENCES images(id)
            )",
            rusqlite::params![],
        )?;
        tx.execute(
            "INSERT INTO hidden_normal_images (folder_id, image_id)
             SELECT folder_id, image_id FROM hidden_normal_images_old",
            rusqlite::params![],
        )?;
        tx.execute("DROP TABLE hidden_normal_images_old", rusqlite::params![])?;

        tx.execute(
            "ALTER TABLE hidden_random_images RENAME TO hidden_random_images_old",
            rusqlite::params![],
        )?;
        tx.execute(
            "CREATE TABLE hidden_random_images (
                folder_id INTEGER NOT NULL,
                image_id INTEGER NOT NULL,
                PRIMARY KEY (folder_id, image_id),
                FOREIGN KEY (folder_id) REFERENCES folders(id),
                FOREIGN KEY (image_id) REFERENCES images(id)
            )",
            rusqlite::params![],
        )?;
        tx.execute(
            "INSERT INTO hidden_random_images (folder_id, image_id)
             SELECT folder_id, image_id FROM hidden_random_images_old",
            rusqlite::params![],
        )?;
        tx.execute("DROP TABLE hidden_random_images_old", rusqlite::params![])?;

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

#[cfg(test)]
mod tests {
    use super::Db;
    use rusqlite::{params, Connection};
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn unique_temp_db_path(name: &str) -> PathBuf {
        let counter = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "random_pics_{}_{}_{}_{}.sqlite",
            name,
            std::process::id(),
            nanos,
            counter
        ))
    }

    #[test]
    fn open_initializes_schema_and_state_row() {
        let db_path = unique_temp_db_path("schema_init");
        let db = Db::open(db_path.clone()).expect("db open should succeed");

        let conn = db.conn();

        let folders_table: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'folders'",
                [],
                |row| row.get(0),
            )
            .expect("folders table lookup should work");
        assert_eq!(folders_table, 1);

        let hidden_random_index: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_hidden_random_folder'",
                [],
                |row| row.get(0),
            )
            .expect("hidden random index lookup should work");
        assert_eq!(hidden_random_index, 1);

        let state_row: i64 = conn
            .query_row("SELECT COUNT(*) FROM state WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("state lookup should work");
        assert_eq!(state_row, 1);

        drop(conn);
        std::fs::remove_file(db_path).expect("temp db should be removable");
    }

    #[test]
    fn open_adds_missing_state_columns_via_migration() {
        let db_path = unique_temp_db_path("state_migration");

        let legacy = Connection::open(&db_path).expect("legacy db should open");
        legacy
            .execute_batch(
                "
                CREATE TABLE folders (
                    id INTEGER PRIMARY KEY,
                    path TEXT NOT NULL UNIQUE,
                    added_at TEXT NOT NULL,
                    current_index INTEGER NOT NULL DEFAULT -1,
                    current_random_index INTEGER NOT NULL DEFAULT -1
                );
                CREATE TABLE images (
                    id INTEGER PRIMARY KEY,
                    path TEXT NOT NULL,
                    folder_id INTEGER,
                    FOREIGN KEY (folder_id) REFERENCES folders(id)
                );
                CREATE TABLE state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    current_index INTEGER NOT NULL DEFAULT -1,
                    current_random_index INTEGER NOT NULL DEFAULT -1,
                    current_folder_id INTEGER,
                    vertical_mirror INTEGER NOT NULL DEFAULT 0,
                    horizontal_mirror INTEGER NOT NULL DEFAULT 0,
                    greyscale INTEGER NOT NULL DEFAULT 0
                );
                INSERT OR IGNORE INTO state (id) VALUES (1);
                ",
            )
            .expect("legacy schema should be created");
        drop(legacy);

        let db = Db::open(db_path.clone()).expect("db open should migrate schema");
        let conn = db.conn();

        let timer_flow_mode_col: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('state') WHERE name = 'timer_flow_mode'",
                [],
                |row| row.get(0),
            )
            .expect("timer_flow_mode column lookup should work");
        assert_eq!(timer_flow_mode_col, 1);

        let shortcut_side_col: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('state') WHERE name = 'shortcut_hint_side'",
                [],
                |row| row.get(0),
            )
            .expect("shortcut_hint_side column lookup should work");
        assert_eq!(shortcut_side_col, 1);

        drop(conn);
        std::fs::remove_file(db_path).expect("temp db should be removable");
    }

    #[test]
    fn open_migrates_global_unique_image_path_to_folder_scoped_index() {
        let db_path = unique_temp_db_path("images_unique_migration");

        let legacy = Connection::open(&db_path).expect("legacy db should open");
        legacy
            .execute_batch(
                "
                CREATE TABLE folders (
                    id INTEGER PRIMARY KEY,
                    path TEXT NOT NULL UNIQUE,
                    added_at TEXT NOT NULL,
                    current_index INTEGER NOT NULL DEFAULT -1,
                    current_random_index INTEGER NOT NULL DEFAULT -1
                );
                CREATE TABLE images (
                    id INTEGER PRIMARY KEY,
                    path TEXT NOT NULL UNIQUE,
                    folder_id INTEGER,
                    FOREIGN KEY (folder_id) REFERENCES folders(id)
                );
                CREATE TABLE state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    current_index INTEGER NOT NULL DEFAULT -1,
                    current_random_index INTEGER NOT NULL DEFAULT -1,
                    current_folder_id INTEGER,
                    vertical_mirror INTEGER NOT NULL DEFAULT 0,
                    horizontal_mirror INTEGER NOT NULL DEFAULT 0,
                    greyscale INTEGER NOT NULL DEFAULT 0
                );
                INSERT OR IGNORE INTO state (id) VALUES (1);
                ",
            )
            .expect("legacy schema should be created");
        drop(legacy);

        let db = Db::open(db_path.clone()).expect("db open should migrate unique index");
        let conn = db.conn();

        let global_unique_constraints: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_index_list('images') WHERE origin = 'u'",
                [],
                |row| row.get(0),
            )
            .expect("index list query should work");
        assert_eq!(global_unique_constraints, 0);

        conn.execute(
            "INSERT INTO folders (path, added_at) VALUES (?1, ?2)",
            params!["/tmp/folder-a", "now"],
        )
        .expect("folder-a insert should succeed");
        conn.execute(
            "INSERT INTO folders (path, added_at) VALUES (?1, ?2)",
            params!["/tmp/folder-b", "now"],
        )
        .expect("folder-b insert should succeed");

        let folder_a: i64 = conn
            .query_row(
                "SELECT id FROM folders WHERE path = ?1",
                params!["/tmp/folder-a"],
                |row| row.get(0),
            )
            .expect("folder-a id should exist");
        let folder_b: i64 = conn
            .query_row(
                "SELECT id FROM folders WHERE path = ?1",
                params!["/tmp/folder-b"],
                |row| row.get(0),
            )
            .expect("folder-b id should exist");

        conn.execute(
            "INSERT INTO images (path, folder_id) VALUES (?1, ?2)",
            params!["/tmp/shared-image.jpg", folder_a],
        )
        .expect("first image insert should succeed");
        conn.execute(
            "INSERT INTO images (path, folder_id) VALUES (?1, ?2)",
            params!["/tmp/shared-image.jpg", folder_b],
        )
        .expect("same path in different folder should succeed");

        let shared_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM images WHERE path = ?1",
                params!["/tmp/shared-image.jpg"],
                |row| row.get(0),
            )
            .expect("shared image count query should work");
        assert_eq!(shared_count, 2);

        drop(conn);
        std::fs::remove_file(db_path).expect("temp db should be removable");
    }
}
