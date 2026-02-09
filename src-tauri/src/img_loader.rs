use crate::db::Db;
use rand::seq::SliceRandom;
use rusqlite::{params, OptionalExtension};
use walkdir::WalkDir;

pub struct ImageLoader {
    db: Db,
}

unsafe impl Send for ImageLoader {}
unsafe impl Sync for ImageLoader {}

impl ImageLoader {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    fn get_current_folder_id_and_path(
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

    fn set_current_folder_id(
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
        self.db.conn().execute(
            "DELETE FROM images WHERE folder_id = ?1",
            params![folder_id],
        )?;
        Ok(())
    }

    pub fn set_current_folder_by_path(
        &self,
        path: &str,
    ) -> Result<i64, Box<dyn std::error::Error>> {
        let added_at = chrono::Utc::now().to_rfc3339();
        let id = self.insert_folder(path, &added_at)?;
        self.set_current_folder_id(Some(id))?;
        Ok(id)
    }

    pub async fn ensure_images_indexed(&self) -> Result<i64, Box<dyn std::error::Error>> {
        let (folder_id, folder_path) = self
            .get_current_folder_id_and_path()?
            .ok_or("no folder selected")?;

        let count = self.count_images(folder_id)?;
        if count > 0 {
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
                if ext.eq_ignore_ascii_case("jpeg")
                    || ext.eq_ignore_ascii_case("jpg")
                    || ext.eq_ignore_ascii_case("png")
                    || ext.eq_ignore_ascii_case("gif")
                    || ext.eq_ignore_ascii_case("webp")
                {
                    if let Some(path_str) = path.to_str() {
                        paths.push(path_str.to_string());
                    }
                }
            }
        }

        if !paths.is_empty() {
            let mut conn = self.db.conn();
            let tx = conn.transaction()?;
            tx.execute("PRAGMA journal_mode = WAL", [])?;
            tx.execute("PRAGMA synchronous = NORMAL", [])?;
            {
                let mut stmt = tx.prepare(
                    "INSERT OR IGNORE INTO images (path, folder_id) VALUES (?1, ?2)",
                )?;
                for path in &paths {
                    stmt.execute(params![path, folder_id])?;
                }
            }
            tx.execute("PRAGMA synchronous = FULL", [])?;
            tx.commit()?;
        }

        let after_count = self.count_images(folder_id)?;
        if after_count == 0 {
            return Err("no images found in folder".into());
        }

        Ok(folder_id)
    }

    pub async fn set_current_folder_and_index(
        &self,
        path: &str,
    ) -> Result<(i64, String), Box<dyn std::error::Error>> {
        let _id = self.set_current_folder_by_path(path)?;
        let folder_id = self.ensure_images_indexed().await?;
        Ok((folder_id, path.to_string()))
    }

    pub async fn load_by_image_id(
        &self,
        image_id: i64,
    ) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let path = self.get_image_path(image_id)?;
        self.set_last_image_id(Some(image_id))?;

        let data = std::fs::read(&path)?;
        Ok(data)
    }

    pub async fn get_next_image(&self) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let folder_id = self.ensure_images_indexed().await?;
        let image_ids = self.get_image_ids(folder_id)?;

        if image_ids.is_empty() {
            return Err("no images available".into());
        }

        let current_index = self.get_current_folder_index(folder_id)?;
        let next_index = if current_index < 0 {
            0
        } else {
            (current_index + 1) % image_ids.len() as i64
        };

        self.set_current_folder_index(folder_id, next_index)?;
        let image_id = image_ids[next_index as usize];
        self.load_by_image_id(image_id).await
    }

    pub async fn get_prev_image(&self) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let folder_id = self.ensure_images_indexed().await?;
        let image_ids = self.get_image_ids(folder_id)?;

        if image_ids.is_empty() {
            return Err("no images available".into());
        }

        let current_index = self.get_current_folder_index(folder_id)?;
        let prev_index = if current_index < 0 {
            image_ids.len() as i64 - 1
        } else {
            (current_index - 1 + image_ids.len() as i64) % image_ids.len() as i64
        };

        self.set_current_folder_index(folder_id, prev_index)?;
        let image_id = image_ids[prev_index as usize];
        self.load_by_image_id(image_id).await
    }

    pub async fn get_current_image_or_first(&self) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let folder_id = self.ensure_images_indexed().await?;
        let image_ids = self.get_image_ids(folder_id)?;

        if image_ids.is_empty() {
            return Err("no images available".into());
        }

        let last_image_id = self.get_last_image_id()?;
        if let Some(last_id) = last_image_id {
            let last_folder_id = self.get_image_folder_id(last_id)?;
            if last_folder_id == Some(folder_id) {
                return self.load_by_image_id(last_id).await;
            }
        }

        let mut index = self.get_current_folder_index(folder_id)?;
        if index < 0 || index >= image_ids.len() as i64 {
            index = 0;
        }
        self.set_current_folder_index(folder_id, index)?;
        let image_id = image_ids[index as usize];
        self.load_by_image_id(image_id).await
    }

    pub async fn get_force_random_image(
        &self,
        force_pointer_to_last: bool,
    ) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let folder_id = self.ensure_images_indexed().await?;
        let image_ids = self.get_image_ids(folder_id)?;

        if image_ids.is_empty() {
            return Err("no images available".into());
        }

        self.ensure_lap_capacity(folder_id, image_ids.len() as i64)?;

        let image_id = {
            let mut rng = rand::thread_rng();
            let mut image_id = *image_ids.choose(&mut rng).ok_or("no images available")?;

            while self.lap_has(folder_id, image_id)? {
                image_id = *image_ids.choose(&mut rng).ok_or("no images available")?;
            }

            self.lap_insert(folder_id, image_id)?;
            image_id
        };

        let next_index = if force_pointer_to_last {
            self.append_random_history(folder_id, image_id)?
        } else {
            self.prepend_random_history(folder_id, image_id)?
        };

        self.set_current_folder_random_index(folder_id, next_index)?;
        self.load_by_image_id(image_id).await
    }

    pub async fn get_next_random_image(&self) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let folder_id = self.ensure_images_indexed().await?;
        let count = self.random_history_count(folder_id)?;

        if count == 0 {
            return self.get_force_random_image(true).await;
        }

        let current_index = self.get_current_folder_random_index(folder_id)?;
        if current_index < count - 1 {
            let next_index = current_index + 1;
            let image_id_opt = self.random_history_at(folder_id, next_index)?;
            if let Some(image_id) = image_id_opt {
                self.set_current_folder_random_index(folder_id, next_index)?;
                return self.load_by_image_id(image_id).await;
            }
            return self.get_force_random_image(true).await;
        }

        self.get_force_random_image(true).await
    }

    pub async fn get_prev_random_image(&self) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let folder_id = self.ensure_images_indexed().await?;
        let count = self.random_history_count(folder_id)?;

        if count == 0 {
            return self.get_force_random_image(true).await;
        }

        let current_index = self.get_current_folder_random_index(folder_id)?;
        if current_index > 0 {
            let prev_index = current_index - 1;
            let image_id_opt = self.random_history_at(folder_id, prev_index)?;
            if let Some(image_id) = image_id_opt {
                self.set_current_folder_random_index(folder_id, prev_index)?;
                return self.load_by_image_id(image_id).await;
            }
            return self.get_force_random_image(true).await;
        }

        if current_index == 0 {
            return self.get_force_random_image(false).await;
        }

        let image_id_opt = self.random_history_at(folder_id, current_index)?;
        let image_id = image_id_opt.ok_or("image not found")?;
        self.load_by_image_id(image_id).await
    }

    pub fn get_normal_history(&self) -> Result<(Vec<String>, i64), Box<dyn std::error::Error>> {
        let current = match self.get_current_folder_id_and_path()? {
            Some(c) => c,
            None => return Ok((vec![], -1)),
        };

        let paths = self.db.with_conn(|conn| {
            let paths: Vec<String> = conn
                .prepare("SELECT path FROM images WHERE folder_id = ?1 ORDER BY id")?
                .query_map(params![current.0], |row| row.get(0))?
                .collect::<Result<Vec<String>, _>>()?;
            Ok(paths)
        })?;

        let pointer = self.get_current_folder_index(current.0)?;
        Ok((paths, pointer))
    }

    pub fn get_random_history(&self) -> Result<(Vec<String>, i64), Box<dyn std::error::Error>> {
        let current = match self.get_current_folder_id_and_path()? {
            Some(c) => c,
            None => return Ok((vec![], -1)),
        };

        let paths = self.db.with_conn(|conn| {
            let paths: Vec<String> = conn.prepare(
                "SELECT i.path FROM random_history rh JOIN images i ON i.id = rh.image_id WHERE rh.folder_id = ?1 ORDER BY rh.order_index",
            )?.query_map(params![current.0], |row| row.get(0))?
                .collect::<Result<Vec<String>, _>>()?;
            Ok(paths)
        })?;

        let pointer = self.get_current_folder_random_index(current.0)?;
        Ok((paths, pointer))
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

    pub fn get_folder_history(
        &self,
    ) -> Result<Vec<(i64, String, String)>, Box<dyn std::error::Error>> {
        self.db
            .with_conn(|conn| {
                let history: Vec<(i64, String, String)> = conn
                    .prepare("SELECT id, path, added_at FROM folders ORDER BY added_at DESC")?
                    .query_map([], |row| {
                        let id: i64 = row.get(0)?;
                        let path: String = row.get(1)?;
                        let added_at: String = row.get(2)?;
                        Ok((id, path, added_at))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;

                Ok::<Vec<(i64, String, String)>, rusqlite::Error>(history)
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

        match current_id {
            Some(id) => {
                let idx = history.iter().position(|(fid, _, _)| *fid == id);
                let next_idx = match idx {
                    Some(i) if i <= 0 => history.len() - 1,
                    Some(i) => i - 1,
                    None => history.len() - 1,
                };
                let (next_id, next_path, _) = &history[next_idx];
                self.set_current_folder_id(Some(*next_id))?;
                Ok(Some((*next_id, next_path.clone())))
            }
            None => {
                let (oldest_id, oldest_path, _) = &history[history.len() - 1];
                self.set_current_folder_id(Some(*oldest_id))?;
                Ok(Some((*oldest_id, oldest_path.clone())))
            }
        }
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

        match current_id {
            Some(id) => {
                let idx = history.iter().position(|(fid, _, _)| *fid == id);
                let prev_idx = match idx {
                    Some(i) if i >= history.len() - 1 => 0,
                    Some(i) => i + 1,
                    None => 0,
                };
                let (prev_id, prev_path, _) = &history[prev_idx];
                self.set_current_folder_id(Some(*prev_id))?;
                Ok(Some((*prev_id, prev_path.clone())))
            }
            None => {
                let (newest_id, newest_path, _) = &history[0];
                self.set_current_folder_id(Some(*newest_id))?;
                Ok(Some((*newest_id, newest_path.clone())))
            }
        }
    }

    pub async fn reindex_current_folder(
        &self,
    ) -> Result<(i64, String), Box<dyn std::error::Error>> {
        let (folder_id, folder_path) = self
            .get_current_folder_id_and_path()?
            .ok_or("no current folder set")?;

        self.delete_images_by_folder_id(folder_id)?;
        self.lap_clear(folder_id)?;
        self.clear_random_history(folder_id)?;
        self.set_current_folder_index(folder_id, -1)?;
        self.ensure_images_indexed().await?;
        Ok((folder_id, folder_path))
    }

    pub fn full_wipe(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.db.conn();
        let tx = conn.transaction()?;

        tx.execute("DELETE FROM random_history", [])?;
        tx.execute("DELETE FROM current_lap", [])?;
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
}
