use crate::db::Db;
use rand::seq::SliceRandom;
use rusqlite::{params, OptionalExtension};
use std::collections::HashSet;
use std::path::Path;
use walkdir::WalkDir;

pub struct ImageLoader {
    db: Db,
}

#[derive(Clone, Copy)]
enum HiddenImageTable {
    Normal,
    Random,
}

impl HiddenImageTable {
    fn select_sql(self) -> &'static str {
        match self {
            HiddenImageTable::Normal => {
                "SELECT image_id FROM hidden_normal_images WHERE folder_id = ?1"
            }
            HiddenImageTable::Random => {
                "SELECT image_id FROM hidden_random_images WHERE folder_id = ?1"
            }
        }
    }
}

unsafe impl Send for ImageLoader {}
unsafe impl Sync for ImageLoader {}

impl ImageLoader {
    fn canonicalize_folder_path(path: &str) -> Result<String, Box<dyn std::error::Error>> {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            return Err("invalid folder path".into());
        }

        let canonical = std::fs::canonicalize(Path::new(trimmed))
            .map_err(|_| "invalid folder path")?;

        if !canonical.is_dir() {
            return Err("folder path is not a directory".into());
        }

        std::fs::read_dir(&canonical).map_err(|_| "folder path is unreadable")?;

        canonical
            .to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "invalid folder path".into())
    }

    fn is_supported_image_ext(ext: &str) -> bool {
        ext.eq_ignore_ascii_case("jpeg")
            || ext.eq_ignore_ascii_case("jpg")
            || ext.eq_ignore_ascii_case("png")
            || ext.eq_ignore_ascii_case("gif")
            || ext.eq_ignore_ascii_case("webp")
    }

    pub fn new(db: Db) -> Self {
        Self { db }
    }

    pub fn get_current_folder_id_and_path(
        &self,
    ) -> Result<Option<(i64, String)>, Box<dyn std::error::Error>> {
        eprintln!("[RUST] get_current_folder_id_and_path: querying state table");
        let current = self.db.conn().query_row(
            "SELECT current_folder_id FROM state WHERE id = 1",
            [],
            |row| {
                let id: Option<i64> = row.get(0)?;
                Ok(id)
            },
        )?;

        eprintln!(
            "[RUST] get_current_folder_id_and_path: current_folder_id = {:?}",
            current
        );
        match current {
            Some(folder_id) => {
                let path: String = self.db.conn().query_row(
                    "SELECT path FROM folders WHERE id = ?1",
                    params![folder_id],
                    |row| row.get(0),
                )?;
                eprintln!(
                    "[RUST] get_current_folder_id_and_path: returning ({}, {})",
                    folder_id, path
                );
                Ok(Some((folder_id, path)))
            }
            None => {
                eprintln!("[RUST] get_current_folder_id_and_path: returning None");
                Ok(None)
            }
        }
    }

    fn get_image_ids(&self, folder_id: i64) -> Result<Vec<i64>, Box<dyn std::error::Error>> {
        self.db
            .with_conn(|conn| {
                let mut stmt =
                    conn.prepare("SELECT id FROM images WHERE folder_id = ?1 ORDER BY id")?;
                let ids = stmt
                    .query_map(params![folder_id], |row| row.get(0))?
                    .collect::<Result<Vec<i64>, _>>()?;
                Ok::<Vec<i64>, rusqlite::Error>(ids)
            })
            .map_err(|e| e.into())
    }

    fn get_hidden_image_ids(
        &self,
        table: HiddenImageTable,
        folder_id: i64,
    ) -> Result<HashSet<i64>, Box<dyn std::error::Error>> {
        let sql = table.select_sql();
        let ids = self.db.with_conn(|conn| {
            let mut stmt = conn.prepare(sql)?;
            let rows = stmt
                .query_map(params![folder_id], |row| row.get(0))?
                .collect::<Result<Vec<i64>, _>>()?;
            Ok(rows)
        })?;
        Ok(ids.into_iter().collect())
    }

    fn get_visible_random_image_ids(
        &self,
        folder_id: i64,
    ) -> Result<Vec<i64>, Box<dyn std::error::Error>> {
        let mut image_ids = self.get_image_ids(folder_id)?;
        let hidden_random_ids = self.get_hidden_image_ids(HiddenImageTable::Random, folder_id)?;
        image_ids.retain(|id| !hidden_random_ids.contains(id));
        Ok(image_ids)
    }

    fn get_normal_entries(
        &self,
        folder_id: i64,
    ) -> Result<Vec<(i64, i64, String)>, Box<dyn std::error::Error>> {
        self.db
            .with_conn(|conn| {
                let mut stmt =
                    conn.prepare("SELECT id, path FROM images WHERE folder_id = ?1 ORDER BY id")?;
                let rows = stmt
                    .query_map(params![folder_id], |row| {
                        let image_id: i64 = row.get(0)?;
                        let path: String = row.get(1)?;
                        Ok((image_id, path))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows
                    .into_iter()
                    .enumerate()
                    .map(|(idx, (image_id, path))| (idx as i64, image_id, path))
                    .collect::<Vec<_>>())
            })
            .map_err(|e| e.into())
    }

    fn get_visible_normal_entries(
        &self,
        folder_id: i64,
    ) -> Result<Vec<(i64, i64, String)>, Box<dyn std::error::Error>> {
        let hidden = self.get_hidden_image_ids(HiddenImageTable::Normal, folder_id)?;
        let entries = self.get_normal_entries(folder_id)?;
        Ok(entries
            .into_iter()
            .filter(|(_, image_id, _)| !hidden.contains(image_id))
            .collect())
    }

    fn get_random_entries(
        &self,
        folder_id: i64,
    ) -> Result<Vec<(i64, i64, String)>, Box<dyn std::error::Error>> {
        self.db
            .with_conn(|conn| {
                let mut stmt = conn.prepare(
                    "SELECT rh.order_index, rh.image_id, i.path FROM random_history rh JOIN images i ON i.id = rh.image_id WHERE rh.folder_id = ?1 ORDER BY rh.order_index",
                )?;
                let rows = stmt
                    .query_map(params![folder_id], |row| {
                        let order_index: i64 = row.get(0)?;
                        let image_id: i64 = row.get(1)?;
                        let path: String = row.get(2)?;
                        Ok((order_index, image_id, path))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .map_err(|e| e.into())
    }

    fn get_visible_random_entries(
        &self,
        folder_id: i64,
    ) -> Result<Vec<(i64, i64, String)>, Box<dyn std::error::Error>> {
        let hidden = self.get_hidden_image_ids(HiddenImageTable::Random, folder_id)?;
        let entries = self.get_random_entries(folder_id)?;
        Ok(entries
            .into_iter()
            .filter(|(_, image_id, _)| !hidden.contains(image_id))
            .collect())
    }

    fn count_images(&self, folder_id: i64) -> Result<i64, Box<dyn std::error::Error>> {
        let count: i64 = self.db.conn().query_row(
            "SELECT COUNT(*) FROM images WHERE folder_id = ?1",
            params![folder_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    fn get_current_folder_index(&self, folder_id: i64) -> Result<i64, Box<dyn std::error::Error>> {
        let index: i64 = self.db.conn().query_row(
            "SELECT current_index FROM folders WHERE id = ?1",
            params![folder_id],
            |row| row.get(0),
        )?;
        Ok(index)
    }

    fn set_current_folder_index(
        &self,
        folder_id: i64,
        index: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "UPDATE folders SET current_index = ?1 WHERE id = ?2",
            params![index, folder_id],
        )?;
        Ok(())
    }

    fn get_current_folder_random_index(
        &self,
        folder_id: i64,
    ) -> Result<i64, Box<dyn std::error::Error>> {
        let index: i64 = self.db.conn().query_row(
            "SELECT current_random_index FROM folders WHERE id = ?1",
            params![folder_id],
            |row| row.get(0),
        )?;
        Ok(index)
    }

    fn set_current_folder_random_index(
        &self,
        folder_id: i64,
        index: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "UPDATE folders SET current_random_index = ?1 WHERE id = ?2",
            params![index, folder_id],
        )?;
        Ok(())
    }

    fn get_image_path(&self, image_id: i64) -> Result<String, Box<dyn std::error::Error>> {
        let path: String = self.db.conn().query_row(
            "SELECT path FROM images WHERE id = ?1",
            params![image_id],
            |row| row.get(0),
        )?;
        Ok(path)
    }

    fn get_image_folder_id(
        &self,
        image_id: i64,
    ) -> Result<Option<i64>, Box<dyn std::error::Error>> {
        let folder_id: Option<i64> = self.db.conn().query_row(
            "SELECT folder_id FROM images WHERE id = ?1",
            params![image_id],
            |row| row.get(0),
        )?;
        Ok(folder_id)
    }

    fn set_last_image_id(&self, image_id: Option<i64>) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "UPDATE state SET last_image_id = ?1 WHERE id = 1",
            params![image_id],
        )?;
        Ok(())
    }

    fn get_last_image_id(&self) -> Result<Option<i64>, Box<dyn std::error::Error>> {
        let last_image_id: Option<i64> = self.db.conn().query_row(
            "SELECT last_image_id FROM state WHERE id = 1",
            [],
            |row| row.get(0),
        )?;
        Ok(last_image_id)
    }

    pub fn get_current_folder_id(&self) -> Result<Option<i64>, Box<dyn std::error::Error>> {
        let current_id: Option<i64> = self.db.conn().query_row(
            "SELECT current_folder_id FROM state WHERE id = 1",
            [],
            |row| row.get(0),
        )?;
        Ok(current_id)
    }

    fn random_history_count(&self, folder_id: i64) -> Result<i64, Box<dyn std::error::Error>> {
        let count: i64 = self.db.conn().query_row(
            "SELECT COUNT(*) FROM random_history WHERE folder_id = ?1",
            params![folder_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    fn random_history_max_index(&self, folder_id: i64) -> Result<i64, Box<dyn std::error::Error>> {
        let max_index: Option<i64> = self.db.conn().query_row(
            "SELECT COALESCE(MAX(order_index), -1) FROM random_history WHERE folder_id = ?1",
            params![folder_id],
            |row| row.get(0),
        )?;
        Ok(max_index.unwrap_or(-1))
    }

    fn random_history_at(
        &self,
        folder_id: i64,
        index: i64,
    ) -> Result<Option<i64>, Box<dyn std::error::Error>> {
        if index < 0 {
            return Ok(None);
        }
        let image_id: Option<i64> = self.db.conn().query_row(
            "SELECT image_id FROM random_history WHERE folder_id = ?1 AND order_index = ?2",
            params![folder_id, index],
            |row| row.get(0),
        )?;
        Ok(image_id)
    }

    fn random_history_insert(
        &self,
        folder_id: i64,
        order_index: i64,
        image_id: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "INSERT INTO random_history (folder_id, order_index, image_id) VALUES (?1, ?2, ?3)",
            params![folder_id, order_index, image_id],
        )?;
        Ok(())
    }

    fn random_history_shift_up_safe(
        &self,
        folder_id: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.db.conn();
        let tx = conn.transaction()?;
        tx.execute(
            "UPDATE random_history SET order_index = order_index + 1000000000 WHERE folder_id = ?1",
            params![folder_id],
        )?;
        tx.execute(
            "UPDATE random_history SET order_index = order_index - 999999999 WHERE folder_id = ?1",
            params![folder_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    fn append_random_history(
        &self,
        folder_id: i64,
        image_id: i64,
    ) -> Result<i64, Box<dyn std::error::Error>> {
        let max_index = self.random_history_max_index(folder_id)?;
        let next_index = max_index + 1;
        self.random_history_insert(folder_id, next_index, image_id)?;
        Ok(next_index)
    }

    fn prepend_random_history(
        &self,
        folder_id: i64,
        image_id: i64,
    ) -> Result<i64, Box<dyn std::error::Error>> {
        self.random_history_shift_up_safe(folder_id)?;
        self.random_history_insert(folder_id, 0, image_id)?;
        Ok(0)
    }

    fn clear_random_history(&self, folder_id: i64) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "DELETE FROM random_history WHERE folder_id = ?1",
            params![folder_id],
        )?;
        self.set_current_folder_random_index(folder_id, -1)?;
        Ok(())
    }

    fn lap_count(&self, folder_id: i64) -> Result<i64, Box<dyn std::error::Error>> {
        let count: i64 = self.db.conn().query_row(
            "SELECT COUNT(*) FROM current_lap WHERE folder_id = ?1",
            params![folder_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    fn lap_has(&self, folder_id: i64, image_id: i64) -> Result<bool, Box<dyn std::error::Error>> {
        let exists: Option<i64> = self
            .db
            .conn()
            .query_row(
                "SELECT 1 FROM current_lap WHERE folder_id = ?1 AND image_id = ?2 LIMIT 1",
                params![folder_id, image_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(exists.is_some())
    }

    fn lap_insert(&self, folder_id: i64, image_id: i64) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "INSERT OR IGNORE INTO current_lap (folder_id, image_id) VALUES (?1, ?2)",
            params![folder_id, image_id],
        )?;
        Ok(())
    }

    fn lap_clear(&self, folder_id: i64) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "DELETE FROM current_lap WHERE folder_id = ?1",
            params![folder_id],
        )?;
        Ok(())
    }

    fn ensure_lap_capacity(
        &self,
        folder_id: i64,
        total_images: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let count = self.lap_count(folder_id)?;
        if count >= total_images {
            self.lap_clear(folder_id)?;
        }
        Ok(())
    }

    fn insert_folder(&self, path: &str, added_at: &str) -> Result<i64, Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "INSERT OR IGNORE INTO folders (path, added_at) VALUES (?1, ?2)",
            params![path, added_at],
        )?;

        let id: i64 = self.db.conn().query_row(
            "SELECT id FROM folders WHERE path = ?1",
            params![path],
            |row| row.get(0),
        )?;
        Ok(id)
    }

    pub fn set_current_folder_id(
        &self,
        folder_id: Option<i64>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        eprintln!("[RUST] set_current_folder_id: setting to {:?}", folder_id);
        let rows = self.db.conn().execute(
            "UPDATE state SET current_folder_id = ?1 WHERE id = 1",
            params![folder_id],
        )?;
        eprintln!("[RUST] set_current_folder_id: updated {} rows", rows);
        Ok(())
    }

    fn insert_image(&self, path: &str, folder_id: i64) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "INSERT OR IGNORE INTO images (path, folder_id) VALUES (?1, ?2)",
            params![path, folder_id],
        )?;
        Ok(())
    }

    fn delete_images_by_folder_id(&self, folder_id: i64) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.db.conn();
        let tx = conn.transaction()?;
        
        // Must delete from dependent tables first due to FOREIGN KEY constraints
        tx.execute(
            "DELETE FROM hidden_normal_images WHERE folder_id = ?1",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM hidden_random_images WHERE folder_id = ?1",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM random_history WHERE folder_id = ?1",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM current_lap WHERE folder_id = ?1",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM images WHERE folder_id = ?1",
            params![folder_id],
        )?;
        
        tx.commit()?;
        Ok(())
    }

    pub fn delete_folder_by_id(&self, folder_id: i64) -> Result<(), Box<dyn std::error::Error>> {
        let current_folder_id: Option<i64> = self.db.conn().query_row(
            "SELECT current_folder_id FROM state WHERE id = 1",
            [],
            |row| row.get(0),
        )?;
        let fallback_folder_id = if current_folder_id == Some(folder_id) {
            let history = self.get_folder_history()?;
            history
                .iter()
                .position(|(id, _, _, _)| *id == folder_id)
                .and_then(|idx| {
                    if history.len() <= 1 {
                        None
                    } else {
                        let prev_idx = if idx + 1 < history.len() { idx + 1 } else { 0 };
                        Some(history[prev_idx].0)
                    }
                })
        } else {
            None
        };

        let mut conn = self.db.conn();
        let tx = conn.transaction()?;
        
        // Delete related records first
        tx.execute(
            "DELETE FROM hidden_normal_images WHERE folder_id = ?1",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM hidden_random_images WHERE folder_id = ?1",
            params![folder_id],
        )?;
        tx.execute("DELETE FROM random_history WHERE folder_id = ?1", params![folder_id])?;
        tx.execute("DELETE FROM current_lap WHERE folder_id = ?1", params![folder_id])?;
        tx.execute("DELETE FROM images WHERE folder_id = ?1", params![folder_id])?;
        tx.execute("DELETE FROM folders WHERE id = ?1", params![folder_id])?;
        
        // If this was the current folder, fall back to previous history item
        if current_folder_id == Some(folder_id) {
            tx.execute(
                "UPDATE state SET current_folder_id = ?1 WHERE id = 1",
                params![fallback_folder_id],
            )?;
        }
        
        tx.commit()?;
        Ok(())
    }

    pub fn set_current_folder_by_path(
        &self,
        path: &str,
    ) -> Result<(i64, String), Box<dyn std::error::Error>> {
        let canonical_path = Self::canonicalize_folder_path(path)?;
        let added_at = chrono::Utc::now().to_rfc3339();
        let id = self.insert_folder(&canonical_path, &added_at)?;
        self.set_current_folder_id(Some(id))?;
        Ok((id, canonical_path))
    }

    /// Returns (folder_id, auto_switched)
    pub async fn ensure_images_indexed_with_progress<F>(
        &self,
        mut on_progress: F,
        force_rescan: bool,
    ) -> Result<(i64, bool), Box<dyn std::error::Error>>
    where
        F: FnMut(String),
    {
        // First, check if current folder is valid and switch if needed
        let (folder_id, auto_switched) = self.ensure_valid_current_folder(&mut on_progress)?;
        
        // Now index the valid folder
        self.index_folder_with_progress(folder_id, &mut on_progress, force_rescan).await?;
        Ok((folder_id, auto_switched))
    }
    
    /// Ensures we have a valid current folder, switching to another if needed.
    /// Returns (folder_id, auto_switched) where auto_switched is true if a
    /// deleted folder was detected and we fell back to another one.
    fn ensure_valid_current_folder<F>(
        &self,
        on_progress: &mut F,
    ) -> Result<(i64, bool), Box<dyn std::error::Error>>
    where
        F: FnMut(String),
    {
        // Check current folder
        if let Some((folder_id, folder_path)) = self.get_current_folder_id_and_path()? {
            if std::path::Path::new(&folder_path).exists() {
                return Ok((folder_id, false));
            }
            // Current folder deleted, remove it
            on_progress(format!("folder deleted: {}", folder_path));
            self.delete_folder_by_id(folder_id)?;
        }
        
        // Try to find another valid folder from history
        let history = self.get_folder_history()?;
        
        if history.is_empty() {
            return Err("no folders available - pick a folder first".into());
        }

        // Try each folder in history
        for (folder_id, folder_path, _, _) in history {
            if std::path::Path::new(&folder_path).exists() {
                on_progress(format!("switched to folder: {}", folder_path));
                self.set_current_folder_id(Some(folder_id))?;
                return Ok((folder_id, true));
            } else {
                on_progress(format!("cleaning up deleted folder: {}", folder_path));
                self.delete_folder_by_id(folder_id)?;
            }
        }

        Err("all folders in history have been deleted - pick a folder first".into())
    }
    
    /// Indexes a specific folder (internal method)
    async fn index_folder_with_progress<F>(
        &self,
        folder_id: i64,
        on_progress: &mut F,
        force_rescan: bool,
    ) -> Result<i64, Box<dyn std::error::Error>>
    where
        F: FnMut(String),
    {
        let folder_path: String = self.db.conn().query_row(
            "SELECT path FROM folders WHERE id = ?1",
            params![folder_id],
            |row| row.get(0),
        )?;

        on_progress(format!("scan:start {}", folder_path));

        let count = self.count_images(folder_id)?;
        if count > 0 && !force_rescan {
            on_progress(format!("scan:skip already indexed count={}", count));
            return Ok(folder_id);
        }

        let mut paths: Vec<String> = Vec::new();
        paths.reserve(1024);

        for entry in WalkDir::new(&folder_path)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
        {
            let path = entry.path();
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if Self::is_supported_image_ext(ext) {
                    if let Some(path_str) = path.to_str() {
                        paths.push(path_str.to_string());
                        if paths.len() % 200 == 0 {
                            on_progress(format!("scan:found {}", paths.len()));
                        }
                    }
                }
            }
        }

        on_progress(format!("scan:done total={}", paths.len()));

        if !paths.is_empty() {
            let mut conn = self.db.conn();
            let tx = conn.transaction()?;
            {
                let total = paths.len();
                let mut stmt = tx.prepare(
                    "INSERT OR IGNORE INTO images (path, folder_id) VALUES (?1, ?2)",
                )?;
                for (i, path) in paths.iter().enumerate() {
                    stmt.execute(params![path, folder_id])?;
                    let done = i + 1;
                    if done <= 10 || done == total || done % 100 == 0 {
                        on_progress(format!("index:{}/{} {}", done, total, path));
                    }
                }
            }
            tx.commit()?;
            on_progress("index:done".to_string());
        }

        let after_count = self.count_images(folder_id)?;
        if after_count == 0 {
            on_progress("index:error no images found".to_string());
            return Err("no images found in folder".into());
        }

        on_progress(format!("index:ready count={}", after_count));
        Ok(folder_id)
    }

    /// Returns (folder_id, auto_switched)
    pub async fn ensure_images_indexed(&self) -> Result<(i64, bool), Box<dyn std::error::Error>> {
        self.ensure_images_indexed_with_progress(|_| {}, false).await
    }

    pub async fn set_current_folder_and_index(
        &self,
        path: &str,
    ) -> Result<(i64, String), Box<dyn std::error::Error>> {
        let (_id, canonical_path) = self.set_current_folder_by_path(path)?;
        let (folder_id, _) = self.ensure_images_indexed().await?;
        Ok((folder_id, canonical_path))
    }

    pub async fn set_current_folder_and_index_with_progress<F>(
        &self,
        path: &str,
        on_progress: F,
    ) -> Result<(i64, String), Box<dyn std::error::Error>>
    where
        F: FnMut(String),
    {
        let (_id, canonical_path) = self.set_current_folder_by_path(path)?;
        let (folder_id, _) = self.ensure_images_indexed_with_progress(on_progress, false).await?;
        Ok((folder_id, canonical_path))
    }

    pub async fn load_by_image_id(
        &self,
        image_id: i64,
    ) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let path = self.get_image_path(image_id)?;
        self.set_last_image_id(Some(image_id))?;

        match std::fs::read(&path) {
            Ok(data) => Ok(data),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // Image file no longer exists - remove from database and return specific error
                self.delete_image_by_id(image_id)?;
                Err(format!("image file not found: {} - reindex please", path).into())
            }
            Err(e) => Err(format!("failed to read image: {} - reindex please", e).into()),
        }
    }

    fn delete_image_by_id(&self, image_id: i64) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.db.conn();
        let tx = conn.transaction()?;
        
        tx.execute(
            "DELETE FROM hidden_normal_images WHERE image_id = ?1",
            params![image_id],
        )?;
        tx.execute(
            "DELETE FROM hidden_random_images WHERE image_id = ?1",
            params![image_id],
        )?;

        // Delete references in random_history first (foreign key constraint)
        tx.execute(
            "DELETE FROM random_history WHERE image_id = ?1",
            params![image_id],
        )?;
        
        // Then delete the image
        tx.execute(
            "DELETE FROM images WHERE id = ?1",
            params![image_id],
        )?;
        
        tx.commit()?;
        Ok(())
    }

    /// Returns (image_data, auto_switched_folder)
    pub async fn get_next_image(&self) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (folder_id, auto_switched) = self.ensure_images_indexed().await?;
        let visible = self.get_visible_normal_entries(folder_id)?;
        if visible.is_empty() {
            return Err("all images for this folder are hidden in normal mode - reindex to clear hidden images".into());
        }

        let current_raw_index = self.get_current_folder_index(folder_id)?;
        let next_pos = match visible
            .iter()
            .position(|(order_index, _, _)| *order_index == current_raw_index)
        {
            Some(pos) => (pos + 1) % visible.len(),
            None => 0,
        };

        let (order_index, image_id, _) = visible[next_pos].clone();
        self.set_current_folder_index(folder_id, order_index)?;
        let data = self.load_by_image_id(image_id).await?;
        Ok((data, auto_switched))
    }

    /// Returns (image_data, auto_switched_folder)
    pub async fn get_prev_image(&self) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (folder_id, auto_switched) = self.ensure_images_indexed().await?;
        let visible = self.get_visible_normal_entries(folder_id)?;
        if visible.is_empty() {
            return Err("all images for this folder are hidden in normal mode - reindex to clear hidden images".into());
        }

        let current_raw_index = self.get_current_folder_index(folder_id)?;
        let prev_pos = match visible
            .iter()
            .position(|(order_index, _, _)| *order_index == current_raw_index)
        {
            Some(pos) if pos == 0 => visible.len() - 1,
            Some(pos) => pos - 1,
            None => visible.len() - 1,
        };

        let (order_index, image_id, _) = visible[prev_pos].clone();
        self.set_current_folder_index(folder_id, order_index)?;
        let data = self.load_by_image_id(image_id).await?;
        Ok((data, auto_switched))
    }

    pub async fn get_current_image_or_first(&self) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (folder_id, auto_switched) = self.ensure_images_indexed().await?;
        let visible = self.get_visible_normal_entries(folder_id)?;
        if visible.is_empty() {
            return Err("all images for this folder are hidden in normal mode - reindex to clear hidden images".into());
        }

        let current_raw_index = self.get_current_folder_index(folder_id)?;
        let selected = visible
            .iter()
            .find(|(order_index, _, _)| *order_index == current_raw_index)
            .cloned()
            .unwrap_or_else(|| visible[0].clone());

        self.set_current_folder_index(folder_id, selected.0)?;
        let data = self.load_by_image_id(selected.1).await?;
        Ok((data, auto_switched))
    }

    pub async fn get_force_random_image(
        &self,
        force_pointer_to_last: bool,
    ) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (folder_id, auto_switched) = self.ensure_images_indexed().await?;
        let mut image_ids = self.get_visible_random_image_ids(folder_id)?;

        if image_ids.is_empty() {
            return Err("all images for this folder are hidden in random mode - reindex to clear hidden images".into());
        }

        self.ensure_lap_capacity(folder_id, image_ids.len() as i64)?;

        let mut skipped_count = 0;
        let image_id = {
            let mut rng = rand::thread_rng();
            let mut attempts = 0;
            let max_attempts = image_ids.len() * 3; // Increased attempts to handle stale images
            
            loop {
                if image_ids.is_empty() {
                    if skipped_count > 0 {
                        return Err(format!("all images were deleted ({} found) - reindex please", skipped_count).into());
                    }
                    return Err("no images available".into());
                }
                
                if attempts >= max_attempts {
                    // Check if all remaining images are in the current lap
                    let all_in_lap = image_ids.iter().all(|&id| {
                        self.lap_has(folder_id, id).unwrap_or(false)
                    });
                    
                    if all_in_lap {
                        // Lap is full, clear it and try again
                        self.lap_clear(folder_id)?;
                        attempts = 0;
                        continue;
                    }
                    
                    if skipped_count > 0 {
                        return Err(format!("skipped {} deleted image(s), no valid images found - reindex please", skipped_count).into());
                    }
                    return Err("no images available".into());
                }
                
                attempts += 1;
                
                let candidate = match image_ids.choose(&mut rng) {
                    Some(&id) => id,
                    None => {
                        if skipped_count > 0 {
                            return Err(format!("skipped {} deleted image(s) - reindex please", skipped_count).into());
                        }
                        return Err("no images available".into());
                    }
                };
                
                // Check if image file actually exists
                let path = match self.get_image_path(candidate) {
                    Ok(p) => p,
                    Err(_) => {
                        // Image doesn't exist in DB anymore, refresh and continue
                        image_ids = self.get_visible_random_image_ids(folder_id)?;
                        continue;
                    }
                };
                
                if !std::path::Path::new(&path).exists() {
                    // Image was deleted from disk, remove it from DB and continue
                    self.delete_image_by_id(candidate)?;
                    skipped_count += 1;
                    image_ids = self.get_visible_random_image_ids(folder_id)?;
                    continue;
                }
                
                if !self.lap_has(folder_id, candidate)? {
                    self.lap_insert(folder_id, candidate)?;
                    break candidate;
                }
            }
        };

        let next_index = if force_pointer_to_last {
            self.append_random_history(folder_id, image_id)?
        } else {
            self.prepend_random_history(folder_id, image_id)?
        };

        self.set_current_folder_random_index(folder_id, next_index)?;
        
        match self.load_by_image_id(image_id).await {
            Ok(data) => {
                if skipped_count > 0 {
                    return Err(format!("skipped {} deleted image(s) - reindex please", skipped_count).into());
                }
                Ok((data, auto_switched))
            }
            Err(e) => {
                // If we still failed to load, delete and report
                let error_str = e.to_string();
                if error_str.contains("not found") || error_str.contains("reindex") {
                    self.delete_image_by_id(image_id)?;
                    if skipped_count > 0 {
                        return Err(format!("skipped {} deleted image(s) - reindex please", skipped_count + 1).into());
                    }
                    return Err("deleted image found - reindex please".into());
                }
                Err(e)
            }
        }
    }

    pub async fn get_next_random_image(&self) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (folder_id, auto_switched) = self.ensure_images_indexed().await?;
        if self.random_history_count(folder_id)? == 0 {
            return self.get_force_random_image(true).await;
        }

        let visible = self.get_visible_random_entries(folder_id)?;
        if visible.is_empty() {
            return self.get_force_random_image(true).await;
        }

        let current_order_index = self.get_current_folder_random_index(folder_id)?;
        if let Some((order_index, image_id, _)) = visible
            .iter()
            .find(|(order_index, _, _)| *order_index > current_order_index)
            .cloned()
        {
            self.set_current_folder_random_index(folder_id, order_index)?;
            let data = self.load_by_image_id(image_id).await?;
            return Ok((data, auto_switched));
        }

        self.get_force_random_image(true).await
    }

    pub async fn get_prev_random_image(&self) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (folder_id, auto_switched) = self.ensure_images_indexed().await?;
        if self.random_history_count(folder_id)? == 0 {
            return self.get_force_random_image(false).await;
        }

        let visible = self.get_visible_random_entries(folder_id)?;
        if visible.is_empty() {
            return self.get_force_random_image(false).await;
        }

        let current_order_index = self.get_current_folder_random_index(folder_id)?;
        if let Some((order_index, image_id, _)) = visible
            .iter()
            .rev()
            .find(|(order_index, _, _)| *order_index < current_order_index)
            .cloned()
        {
            self.set_current_folder_random_index(folder_id, order_index)?;
            let data = self.load_by_image_id(image_id).await?;
            return Ok((data, auto_switched));
        }

        self.get_force_random_image(false).await
    }

    fn delete_image_from_random_history(&self, folder_id: i64, image_id: i64) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "DELETE FROM random_history WHERE folder_id = ?1 AND image_id = ?2",
            params![folder_id, image_id],
        )?;
        Ok(())
    }

    pub fn get_normal_history(
        &self,
    ) -> Result<(Vec<crate::commands::ImageHistoryItem>, i64), Box<dyn std::error::Error>> {
        let current = match self.get_current_folder_id_and_path()? {
            Some(c) => c,
            None => return Ok((vec![], -1)),
        };

        let visible = self.get_visible_normal_entries(current.0)?;
        let pointer_raw = self.get_current_folder_index(current.0)?;
        let pointer = visible
            .iter()
            .position(|(order_index, _, _)| *order_index == pointer_raw)
            .map(|idx| idx as i64)
            .unwrap_or(-1);
        let items = visible
            .into_iter()
            .map(|(order_index, image_id, path)| crate::commands::ImageHistoryItem {
                image_id,
                order_index,
                path,
            })
            .collect::<Vec<_>>();
        Ok((items, pointer))
    }

    pub fn get_random_history(
        &self,
    ) -> Result<(Vec<crate::commands::ImageHistoryItem>, i64), Box<dyn std::error::Error>> {
        let current = match self.get_current_folder_id_and_path()? {
            Some(c) => c,
            None => return Ok((vec![], -1)),
        };

        let visible = self.get_visible_random_entries(current.0)?;
        let pointer_raw = self.get_current_folder_random_index(current.0)?;
        let pointer = visible
            .iter()
            .position(|(order_index, _, _)| *order_index == pointer_raw)
            .map(|idx| idx as i64)
            .unwrap_or(-1);
        let items = visible
            .into_iter()
            .map(|(order_index, image_id, path)| crate::commands::ImageHistoryItem {
                image_id,
                order_index,
                path,
            })
            .collect::<Vec<_>>();
        Ok((items, pointer))
    }

    pub fn reset_normal_history(&self) -> Result<(), Box<dyn std::error::Error>> {
        if let Some((folder_id, _)) = self.get_current_folder_id_and_path()? {
            self.set_current_folder_index(folder_id, -1)?;
        }
        Ok(())
    }

    pub fn reset_random_history(&self) -> Result<(), Box<dyn std::error::Error>> {
        if let Some((folder_id, _)) = self.get_current_folder_id_and_path()? {
            self.clear_random_history(folder_id)?;
            self.lap_clear(folder_id)?;
        }
        Ok(())
    }

    fn clear_hidden_images_for_folder(
        &self,
        folder_id: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "DELETE FROM hidden_normal_images WHERE folder_id = ?1",
            params![folder_id],
        )?;
        self.db.conn().execute(
            "DELETE FROM hidden_random_images WHERE folder_id = ?1",
            params![folder_id],
        )?;
        Ok(())
    }

    pub fn hide_normal_history_image(
        &self,
        image_id: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (folder_id, _) = self
            .get_current_folder_id_and_path()?
            .ok_or("no folder selected - pick a folder first")?;

        self.db.conn().execute(
            "INSERT OR IGNORE INTO hidden_normal_images (folder_id, image_id) VALUES (?1, ?2)",
            params![folder_id, image_id],
        )?;

        let visible = self.get_visible_normal_entries(folder_id)?;
        if visible.is_empty() {
            return Err("all images for this folder are hidden in normal mode - reindex to clear hidden images".into());
        }

        let current_raw_index = self.get_current_folder_index(folder_id)?;
        let current_still_visible = visible
            .iter()
            .any(|(order_index, _, _)| *order_index == current_raw_index);
        if current_raw_index >= 0 && !current_still_visible {
            let next_order_index = visible
                .iter()
                .rev()
                .find(|(order_index, _, _)| *order_index < current_raw_index)
                .map(|(order_index, _, _)| *order_index)
                .unwrap_or_else(|| visible[visible.len() - 1].0);
            self.set_current_folder_index(folder_id, next_order_index)?;
        }

        Ok(())
    }

    pub fn hide_random_history_image(
        &self,
        image_id: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (folder_id, _) = self
            .get_current_folder_id_and_path()?
            .ok_or("no folder selected - pick a folder first")?;

        self.db.conn().execute(
            "INSERT OR IGNORE INTO hidden_random_images (folder_id, image_id) VALUES (?1, ?2)",
            params![folder_id, image_id],
        )?;

        let visible_history = self.get_visible_random_entries(folder_id)?;
        let hidden_all_images = self
            .get_hidden_image_ids(HiddenImageTable::Random, folder_id)?
            .len()
            >= self.get_image_ids(folder_id)?.len();
        if visible_history.is_empty() && hidden_all_images {
            return Err("all images for this folder are hidden in random mode - reindex to clear hidden images".into());
        }

        let current_order_index = self.get_current_folder_random_index(folder_id)?;
        let current_still_visible = visible_history
            .iter()
            .any(|(order_index, _, _)| *order_index == current_order_index);
        if current_order_index >= 0 && !current_still_visible {
            let next_order_index = visible_history
                .iter()
                .rev()
                .find(|(order_index, _, _)| *order_index < current_order_index)
                .map(|(order_index, _, _)| *order_index)
                .unwrap_or_else(|| visible_history[visible_history.len() - 1].0);
            self.set_current_folder_random_index(folder_id, next_order_index)?;
        }

        Ok(())
    }

    pub fn get_folder_history(
        &self,
    ) -> Result<Vec<(i64, String, String, i64)>, Box<dyn std::error::Error>> {
        self.db
            .with_conn(|conn| {
                let history: Vec<(i64, String, String, i64)> = conn
                    .prepare(
                        "SELECT f.id, f.path, f.added_at, COUNT(i.id) AS image_count FROM folders f LEFT JOIN images i ON i.folder_id = f.id GROUP BY f.id ORDER BY f.added_at DESC",
                    )?
                    .query_map([], |row| {
                        let id: i64 = row.get(0)?;
                        let path: String = row.get(1)?;
                        let added_at: String = row.get(2)?;
                        let image_count: i64 = row.get(3)?;
                        Ok((id, path, added_at, image_count))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;

                Ok::<Vec<(i64, String, String, i64)>, rusqlite::Error>(history)
            })
            .map_err(|e| e.into())
    }

    pub fn get_next_folder(&self) -> Result<Option<(i64, String)>, Box<dyn std::error::Error>> {
        let history = self.get_folder_history()?;
        if history.is_empty() {
            return Ok(None);
        }

        let current_id = self.db.conn().query_row(
            "SELECT current_folder_id FROM state WHERE id = 1",
            [],
            |row| {
                let id: Option<i64> = row.get(0)?;
                Ok(id)
            },
        )?;

        let start_idx = match current_id {
            Some(id) => {
                let idx = history.iter().position(|(fid, _, _, _)| *fid == id);
                match idx {
                    Some(i) if i <= 0 => history.len() - 1,
                    Some(i) => i - 1,
                    None => history.len() - 1,
                }
            }
            None => history.len() - 1,
        };

        // Try folders starting from start_idx, skip deleted ones
        for i in 0..history.len() {
            let try_idx = (start_idx + i) % history.len();
            let (folder_id, folder_path, _, _) = &history[try_idx];
            
            if std::path::Path::new(folder_path).exists() {
                self.set_current_folder_id(Some(*folder_id))?;
                return Ok(Some((*folder_id, folder_path.clone())));
            } else {
                // Folder no longer exists - delete it from history
                self.delete_folder_by_id(*folder_id)?;
            }
        }

        Err("all folders in history no longer exist - reindex please".into())
    }

    pub fn get_prev_folder(&self) -> Result<Option<(i64, String)>, Box<dyn std::error::Error>> {
        let history = self.get_folder_history()?;
        if history.is_empty() {
            return Ok(None);
        }

        let current_id = self.db.conn().query_row(
            "SELECT current_folder_id FROM state WHERE id = 1",
            [],
            |row| {
                let id: Option<i64> = row.get(0)?;
                Ok(id)
            },
        )?;

        let start_idx = match current_id {
            Some(id) => {
                let idx = history.iter().position(|(fid, _, _, _)| *fid == id);
                match idx {
                    Some(i) if i >= history.len() - 1 => 0usize,
                    Some(i) => i + 1,
                    None => 0,
                }
            }
            None => 0,
        };

        // Try folders starting from start_idx, skip deleted ones
        for i in 0..history.len() {
            let try_idx = (start_idx + i) % history.len();
            let (folder_id, folder_path, _, _) = &history[try_idx];

            if std::path::Path::new(folder_path).exists() {
                self.set_current_folder_id(Some(*folder_id))?;
                return Ok(Some((*folder_id, folder_path.clone())));
            } else {
                // Folder no longer exists - delete it from history
                self.delete_folder_by_id(*folder_id)?;
            }
        }

        Err("all folders in history no longer exist - reindex please".into())
    }

    pub async fn reindex_current_folder(
        &self,
    ) -> Result<(i64, String), Box<dyn std::error::Error>> {
        let (folder_id, folder_path) = match self.get_current_folder_id_and_path()? {
            Some((id, path)) => (id, path),
            None => return Err("no folder selected - pick a folder first".into()),
        };

        // Validate folder still exists on disk before reindexing
        if !std::path::Path::new(&folder_path).exists() {
            // Delete the stale folder entry and its related data
            self.delete_folder_by_id(folder_id)?;
            return Err(format!("folder no longer exists: {} - deleted from history", folder_path).into());
        }

        self.delete_images_by_folder_id(folder_id)?;
        self.clear_hidden_images_for_folder(folder_id)?;
        self.set_current_folder_index(folder_id, -1)?;
        self.set_current_folder_random_index(folder_id, -1)?;
        self.ensure_images_indexed_with_progress(|_| {}, true).await?;
        Ok((folder_id, folder_path))
    }

    pub async fn reindex_current_folder_with_progress<F>(
        &self,
        on_progress: F,
    ) -> Result<(i64, String), Box<dyn std::error::Error>>
    where
        F: FnMut(String),
    {
        let (folder_id, folder_path) = match self.get_current_folder_id_and_path()? {
            Some((id, path)) => (id, path),
            None => return Err("no folder selected - pick a folder first".into()),
        };

        // Validate folder still exists on disk before reindexing
        if !std::path::Path::new(&folder_path).exists() {
            // Delete the stale folder entry and its related data
            self.delete_folder_by_id(folder_id)?;
            return Err(format!("folder no longer exists: {} - deleted from history", folder_path).into());
        }

        self.delete_images_by_folder_id(folder_id)?;
        self.clear_hidden_images_for_folder(folder_id)?;
        self.set_current_folder_index(folder_id, -1)?;
        self.set_current_folder_random_index(folder_id, -1)?;
        self.ensure_images_indexed_with_progress(on_progress, true).await?;
        Ok((folder_id, folder_path))
    }

    pub fn full_wipe(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.db.conn();
        let tx = conn.transaction()?;

        tx.execute("DELETE FROM random_history", [])?;
        tx.execute("DELETE FROM current_lap", [])?;
        tx.execute("DELETE FROM hidden_normal_images", [])?;
        tx.execute("DELETE FROM hidden_random_images", [])?;
        tx.execute("DELETE FROM images", [])?;
        tx.execute("DELETE FROM folders", [])?;
        tx.execute(
            "UPDATE state SET current_folder_id = NULL, last_image_id = NULL WHERE id = 1",
            [],
        )?;

        tx.commit()?;
        Ok(())
    }

    pub fn get_image_state(
        &self,
    ) -> Result<crate::commands::ImageState, Box<dyn std::error::Error>> {
        let row = self.db.conn().query_row(
            "SELECT vertical_mirror, horizontal_mirror, greyscale, timer_flow_mode, show_folder_history_panel, show_top_controls, show_image_history_panel, show_bottom_controls, is_fullscreen_image FROM state WHERE id = 1",
            [],
            |row| {
                let vertical_mirror: i64 = row.get(0)?;
                let horizontal_mirror: i64 = row.get(1)?;
                let greyscale: i64 = row.get(2)?;
                let timer_flow_mode: String = row.get(3)?;
                let show_folder_history_panel: i64 = row.get(4)?;
                let show_top_controls: i64 = row.get(5)?;
                let show_image_history_panel: i64 = row.get(6)?;
                let show_bottom_controls: i64 = row.get(7)?;
                let is_fullscreen_image: i64 = row.get(8)?;
                Ok((vertical_mirror, horizontal_mirror, greyscale, timer_flow_mode, show_folder_history_panel, show_top_controls, show_image_history_panel, show_bottom_controls, is_fullscreen_image))
            },
        )?;

        Ok(crate::commands::ImageState {
            vertical_mirror: row.0 != 0,
            horizontal_mirror: row.1 != 0,
            greyscale: row.2 != 0,
            timer_flow_mode: if row.3 == "normal" {
                "normal".to_string()
            } else {
                "random".to_string()
            },
            show_folder_history_panel: row.4 != 0,
            show_top_controls: row.5 != 0,
            show_image_history_panel: row.6 != 0,
            show_bottom_controls: row.7 != 0,
            is_fullscreen_image: row.8 != 0,
        })
    }

    pub fn set_image_state(
        &self,
        state: &crate::commands::ImageState,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "UPDATE state SET vertical_mirror = ?1, horizontal_mirror = ?2, greyscale = ?3, timer_flow_mode = ?4, show_folder_history_panel = ?5, show_top_controls = ?6, show_image_history_panel = ?7, show_bottom_controls = ?8, is_fullscreen_image = ?9 WHERE id = 1",
            params![
                state.vertical_mirror as i64,
                state.horizontal_mirror as i64,
                state.greyscale as i64,
                &state.timer_flow_mode,
                state.show_folder_history_panel as i64,
                state.show_top_controls as i64,
                state.show_image_history_panel as i64,
                state.show_bottom_controls as i64,
                state.is_fullscreen_image as i64,
            ],
        )?;
        Ok(())
    }

    pub fn set_folder_by_index(
        &self,
        index: i64,
    ) -> Result<(i64, String), Box<dyn std::error::Error>> {
        let history = self.get_folder_history()?;
        if history.is_empty() {
            return Err("no folders available".into());
        }

        let idx = if index < 0 {
            0
        } else if index >= history.len() as i64 {
            history.len() as i64 - 1
        } else {
            index
        };

        let (folder_id, path, _, _) = &history[idx as usize];

        // Check if folder still exists
        if !std::path::Path::new(path).exists() {
            // Folder no longer exists - delete it from history
            self.delete_folder_by_id(*folder_id)?;
            return Err(format!("folder no longer exists: {} - reindex please", path).into());
        }

        self.set_current_folder_id(Some(*folder_id))?;
        Ok((*folder_id, path.clone()))
    }

    pub async fn set_normal_image_by_index(
        &self,
        index: i64,
    ) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (folder_id, auto_switched) = self.ensure_images_indexed().await?;
        let visible = self.get_visible_normal_entries(folder_id)?;

        if visible.is_empty() {
            return Err("all images for this folder are hidden in normal mode - reindex to clear hidden images".into());
        }

        let idx = if index < 0 {
            0
        } else if index >= visible.len() as i64 {
            visible.len() as i64 - 1
        } else {
            index
        };

        let (order_index, image_id, _) = visible[idx as usize].clone();
        self.set_current_folder_index(folder_id, order_index)?;
        let data = self.load_by_image_id(image_id).await?;
        Ok((data, auto_switched))
    }

    pub async fn set_random_image_by_index(
        &self,
        index: i64,
    ) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (folder_id, auto_switched) = self.ensure_images_indexed().await?;
        let visible = self.get_visible_random_entries(folder_id)?;

        if visible.is_empty() {
            return self.get_force_random_image(true).await;
        }

        let idx = if index < 0 {
            0
        } else if index >= visible.len() as i64 {
            visible.len() as i64 - 1
        } else {
            index
        };

        let (order_index, image_id, _) = visible[idx as usize].clone();
        self.set_current_folder_random_index(folder_id, order_index)?;
        let data = self.load_by_image_id(image_id).await?;
        Ok((data, auto_switched))
    }
}
