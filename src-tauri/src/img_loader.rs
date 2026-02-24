use crate::db::Db;
use rusqlite::{params, OptionalExtension};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use walkdir::WalkDir;

pub struct ImageLoader {
    db: Db,
}

const NO_FOLDERS_SELECTED_ERROR: &str = "No folders selected. Check at least one folder.";

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

        let canonical =
            std::fs::canonicalize(Path::new(trimmed)).map_err(|_| "invalid folder path")?;

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
        let loader = Self { db };
        if let Err(err) = loader.bootstrap_checked_scope() {
            eprintln!("[RUST] bootstrap_checked_scope failed: {}", err);
        }
        loader
    }

    fn bootstrap_checked_scope(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.rebuild_missing_folder_nodes()?;
        self.rebuild_selection_indexes_if_missing()?;
        self.db.conn().execute(
            "DELETE FROM checked_folders WHERE path NOT IN (SELECT path FROM folder_nodes)",
            [],
        )?;
        self.db.conn().execute(
            "DELETE FROM checked_folders
             WHERE path IN (
                 SELECT child.path
                 FROM checked_folders child
                 JOIN checked_folders parent ON parent.path <> child.path
                 JOIN folder_closure c
                   ON c.ancestor_path = parent.path
                  AND c.descendant_path = child.path
             )",
            [],
        )?;
        Ok(())
    }

    fn ensure_active_scope_initialized(&self) -> Result<(), Box<dyn std::error::Error>> {
        let checked_count: i64 = self
            .db
            .conn()
            .query_row("SELECT COUNT(*) FROM checked_folders", [], |row| row.get(0))?;

        if checked_count == 0 {
            self.db.conn().execute("DELETE FROM active_image_refcounts", [])?;
            self.db.conn().execute("DELETE FROM active_images", [])?;
            return Ok(());
        }

        let refcount_count: i64 = self
            .db
            .conn()
            .query_row("SELECT COUNT(*) FROM active_image_refcounts", [], |row| {
                row.get(0)
            })?;

        if refcount_count == 0 {
            self.rebuild_active_images()?;
        }

        Ok(())
    }

    fn rebuild_selection_indexes_if_missing(&self) -> Result<(), Box<dyn std::error::Error>> {
        let closure_count: i64 = self
            .db
            .conn()
            .query_row("SELECT COUNT(*) FROM folder_closure", [], |row| row.get(0))?;
        let direct_count: i64 = self
            .db
            .conn()
            .query_row("SELECT COUNT(*) FROM folder_images_direct", [], |row| row.get(0))?;

        if closure_count > 0 && direct_count > 0 {
            return Ok(());
        }

        let folder_ids = self.db.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT id FROM folders")?;
            let ids = stmt
                .query_map([], |row| row.get(0))?
                .collect::<Result<Vec<i64>, _>>()?;
            Ok(ids)
        })?;

        for folder_id in folder_ids {
            self.rebuild_folder_nodes_for_root(folder_id)?;
        }

        Ok(())
    }

    fn rebuild_missing_folder_nodes(&self) -> Result<(), Box<dyn std::error::Error>> {
        let node_count: i64 = self
            .db
            .conn()
            .query_row("SELECT COUNT(*) FROM folder_nodes", [], |row| row.get(0))?;
        if node_count > 0 {
            return Ok(());
        }

        let folder_ids = self.db.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT id FROM folders")?;
            let ids = stmt
                .query_map([], |row| row.get(0))?
                .collect::<Result<Vec<i64>, _>>()?;
            Ok(ids)
        })?;

        for folder_id in folder_ids {
            self.rebuild_folder_nodes_for_root(folder_id)?;
        }
        Ok(())
    }

    fn rebuild_folder_nodes_for_root(&self, folder_id: i64) -> Result<(), Box<dyn std::error::Error>> {
        let root_path: String = self.db.conn().query_row(
            "SELECT path FROM folders WHERE id = ?1",
            params![folder_id],
            |row| row.get(0),
        )?;

        let image_rows = self.db.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT id, path FROM images WHERE folder_id = ?1")?;
            let rows = stmt
                .query_map(params![folder_id], |row| {
                    let id: i64 = row.get(0)?;
                    let path: String = row.get(1)?;
                    Ok((id, path))
                })?
                .collect::<Result<Vec<(i64, String)>, _>>()?;
            Ok(rows)
        })?;

        let root = Path::new(&root_path);
        let mut subtree_counts: HashMap<String, i64> = HashMap::new();
        let mut node_paths: HashSet<String> = HashSet::new();
        node_paths.insert(root_path.clone());
        subtree_counts.insert(root_path.clone(), 0);

        for (_, image_path) in &image_rows {
            let mut current = Path::new(&image_path).parent();
            while let Some(dir) = current {
                if !dir.starts_with(root) {
                    break;
                }
                if let Some(path_str) = dir.to_str() {
                    let key = path_str.to_string();
                    node_paths.insert(key.clone());
                    *subtree_counts.entry(key.clone()).or_insert(0) += 1;
                    if key == root_path {
                        break;
                    }
                } else {
                    break;
                }
                current = dir.parent();
            }
        }

        let mut paths = node_paths.into_iter().collect::<Vec<_>>();
        paths.sort_by(|a, b| {
            let depth_a = Path::new(a).components().count();
            let depth_b = Path::new(b).components().count();
            depth_a.cmp(&depth_b).then_with(|| a.cmp(b))
        });

        let mut conn = self.db.conn();
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM folder_closure
             WHERE ancestor_path IN (SELECT path FROM folder_nodes WHERE root_folder_id = ?1)
                OR descendant_path IN (SELECT path FROM folder_nodes WHERE root_folder_id = ?1)",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM folder_images_direct
             WHERE folder_path IN (SELECT path FROM folder_nodes WHERE root_folder_id = ?1)",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM folder_nodes WHERE root_folder_id = ?1",
            params![folder_id],
        )?;

        let mut parent_lookup: HashMap<String, Option<String>> = HashMap::new();

        for path in paths {
            let parent_path = if path == root_path {
                None
            } else {
                Path::new(&path)
                    .parent()
                    .and_then(|p| p.to_str())
                    .map(|p| p.to_string())
            };
            let subtree_count = *subtree_counts.get(&path).unwrap_or(&0);
            tx.execute(
                "INSERT OR REPLACE INTO folder_nodes (path, parent_path, root_folder_id, subtree_image_count) VALUES (?1, ?2, ?3, ?4)",
                params![path, parent_path, folder_id, subtree_count],
            )?;
            parent_lookup.insert(path, parent_path);
        }

        for descendant in parent_lookup.keys() {
            let mut current = Some(descendant.clone());
            while let Some(ancestor) = current {
                tx.execute(
                    "INSERT OR IGNORE INTO folder_closure (ancestor_path, descendant_path) VALUES (?1, ?2)",
                    params![ancestor, descendant],
                )?;
                current = parent_lookup.get(&ancestor).and_then(|p| p.clone());
            }
        }

        let known_paths: HashSet<String> = parent_lookup.keys().cloned().collect();
        for (image_id, image_path) in &image_rows {
            if let Some(parent) = Path::new(image_path).parent().and_then(|p| p.to_str()) {
                if known_paths.contains(parent) {
                    tx.execute(
                        "INSERT OR IGNORE INTO folder_images_direct (folder_path, image_id) VALUES (?1, ?2)",
                        params![parent, image_id],
                    )?;
                }
            }
        }

        tx.commit()?;
        Ok(())
    }

    fn ensure_default_checked_folder(&self) -> Result<(), Box<dyn std::error::Error>> {
        let checked_count: i64 = self
            .db
            .conn()
            .query_row("SELECT COUNT(*) FROM checked_folders", [], |row| row.get(0))?;
        if checked_count > 0 {
            return Ok(());
        }

        let current_folder_path: Option<String> = self.db.conn().query_row(
            "SELECT f.path
             FROM state s
             JOIN folders f ON f.id = s.current_folder_id
             WHERE s.id = 1",
            [],
            |row| row.get(0),
        )
        .optional()?;

        let fallback_path = if let Some(path) = current_folder_path {
            Some(path)
        } else {
            self.db
                .conn()
                .query_row(
                    "SELECT path FROM folders ORDER BY added_at DESC LIMIT 1",
                    [],
                    |row| row.get(0),
                )
                .optional()?
        };

        if let Some(path) = fallback_path {
            self.db.conn().execute(
                "INSERT OR IGNORE INTO checked_folders(path) VALUES (?1)",
                params![path],
            )?;
        }

        Ok(())
    }

    fn rebuild_active_images(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.db.conn();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM active_image_refcounts", [])?;
        tx.execute("DELETE FROM active_images", [])?;
        tx.execute(
            "INSERT INTO active_image_refcounts (image_id, refcount)
             SELECT fi.image_id, COUNT(*)
             FROM checked_folders cf
             JOIN folder_closure c ON c.ancestor_path = cf.path
             JOIN folder_images_direct fi ON fi.folder_path = c.descendant_path
             GROUP BY fi.image_id",
            [],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO active_images(image_id)
             SELECT image_id FROM active_image_refcounts WHERE refcount > 0",
            [],
        )?;
        tx.commit()?;
        Ok(())
    }

    fn add_subtree_to_active_set(&self, folder_path: &str) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "INSERT INTO active_image_refcounts (image_id, refcount)
             SELECT fi.image_id, COUNT(*)
             FROM folder_closure c
             JOIN folder_images_direct fi ON fi.folder_path = c.descendant_path
             WHERE c.ancestor_path = ?1
             GROUP BY fi.image_id
             ON CONFLICT(image_id) DO UPDATE SET refcount = refcount + excluded.refcount",
            params![folder_path],
        )?;
        self.db.conn().execute(
            "INSERT OR IGNORE INTO active_images(image_id)
             SELECT fi.image_id
             FROM folder_closure c
             JOIN folder_images_direct fi ON fi.folder_path = c.descendant_path
             WHERE c.ancestor_path = ?1",
            params![folder_path],
        )?;
        Ok(())
    }

    fn remove_subtree_from_active_set(
        &self,
        folder_path: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "WITH removed AS (
                SELECT fi.image_id, COUNT(*) AS removed_count
                FROM folder_closure c
                JOIN folder_images_direct fi ON fi.folder_path = c.descendant_path
                WHERE c.ancestor_path = ?1
                GROUP BY fi.image_id
             )
             UPDATE active_image_refcounts
             SET refcount = refcount - (
                 SELECT removed_count
                 FROM removed
                 WHERE removed.image_id = active_image_refcounts.image_id
             )
             WHERE image_id IN (SELECT image_id FROM removed)",
            params![folder_path],
        )?;
        self.db
            .conn()
            .execute("DELETE FROM active_image_refcounts WHERE refcount <= 0", [])?;
        self.db.conn().execute(
            "DELETE FROM active_images
             WHERE image_id NOT IN (SELECT image_id FROM active_image_refcounts)",
            [],
        )?;
        Ok(())
    }

    fn has_checked_folders(&self) -> Result<bool, Box<dyn std::error::Error>> {
        let count: i64 = self
            .db
            .conn()
            .query_row("SELECT COUNT(*) FROM checked_folders", [], |row| row.get(0))?;
        Ok(count > 0)
    }

    fn require_checked_folders(&self) -> Result<(), Box<dyn std::error::Error>> {
        if !self.has_checked_folders()? {
            return Err(NO_FOLDERS_SELECTED_ERROR.into());
        }
        Ok(())
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

    fn get_active_image_ids(&self) -> Result<Vec<i64>, Box<dyn std::error::Error>> {
        self.db
            .with_conn(|conn| {
                let mut stmt = conn.prepare("SELECT image_id FROM active_images ORDER BY image_id")?;
                let ids = stmt
                    .query_map([], |row| row.get(0))?
                    .collect::<Result<Vec<i64>, _>>()?;
                Ok::<Vec<i64>, rusqlite::Error>(ids)
            })
            .map_err(|e| e.into())
    }

    fn get_active_normal_entries(&self) -> Result<Vec<(i64, i64, String)>, Box<dyn std::error::Error>> {
        self.db
            .with_conn(|conn| {
                let mut stmt = conn.prepare(
                    "SELECT a.image_id, i.path
                     FROM active_images a
                     JOIN images i ON i.id = a.image_id
                     ORDER BY a.image_id",
                )?;
                let rows = stmt
                    .query_map([], |row| {
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

    fn get_visible_active_normal_entries(
        &self,
    ) -> Result<Vec<(i64, i64, String)>, Box<dyn std::error::Error>> {
        let hidden_ids = self.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT DISTINCT h.image_id
                 FROM hidden_normal_images h
                 JOIN active_images a ON a.image_id = h.image_id",
            )?;
            let ids = stmt
                .query_map([], |row| row.get(0))?
                .collect::<Result<Vec<i64>, _>>()?;
            Ok(ids)
        })?;
        let hidden: HashSet<i64> = hidden_ids.into_iter().collect();
        let entries = self.get_active_normal_entries()?;
        Ok(entries
            .into_iter()
            .filter(|(_, image_id, _)| !hidden.contains(image_id))
            .collect())
    }

    fn get_visible_active_random_image_ids(&self) -> Result<Vec<i64>, Box<dyn std::error::Error>> {
        let mut ids = self.get_active_image_ids()?;
        let hidden = self.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT DISTINCT h.image_id
                 FROM hidden_random_images h
                 JOIN active_images a ON a.image_id = h.image_id",
            )?;
            let rows = stmt
                .query_map([], |row| row.get(0))?
                .collect::<Result<Vec<i64>, _>>()?;
            Ok(rows)
        })?;
        let hidden_set: HashSet<i64> = hidden.into_iter().collect();
        ids.retain(|id| !hidden_set.contains(id));
        Ok(ids)
    }

    fn get_checked_folder_available_counts(
        &self,
    ) -> Result<Vec<(String, i64)>, Box<dyn std::error::Error>> {
        self.db
            .with_conn(|conn| {
                let mut stmt = conn.prepare(
                    "SELECT cf.path, COUNT(DISTINCT fi.image_id) AS available_count
                     FROM checked_folders cf
                     JOIN folder_closure c ON c.ancestor_path = cf.path
                     JOIN folder_images_direct fi ON fi.folder_path = c.descendant_path
                     LEFT JOIN hidden_random_images h ON h.image_id = fi.image_id
                     LEFT JOIN current_lap_global l ON l.image_id = fi.image_id
                     WHERE h.image_id IS NULL AND l.image_id IS NULL
                     GROUP BY cf.path
                     HAVING available_count > 0",
                )?;
                let rows = stmt
                    .query_map([], |row| {
                        let path: String = row.get(0)?;
                        let count: i64 = row.get(1)?;
                        Ok((path, count))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .map_err(|e| e.into())
    }

    fn get_available_random_image_ids_for_checked_folder(
        &self,
        checked_folder_path: &str,
    ) -> Result<Vec<i64>, Box<dyn std::error::Error>> {
        self.db
            .with_conn(|conn| {
                let mut stmt = conn.prepare(
                    "SELECT DISTINCT fi.image_id
                     FROM folder_closure c
                     JOIN folder_images_direct fi ON fi.folder_path = c.descendant_path
                     LEFT JOIN hidden_random_images h ON h.image_id = fi.image_id
                     LEFT JOIN current_lap_global l ON l.image_id = fi.image_id
                     WHERE c.ancestor_path = ?1
                       AND h.image_id IS NULL
                       AND l.image_id IS NULL",
                )?;
                let ids = stmt
                    .query_map(params![checked_folder_path], |row| row.get(0))?
                    .collect::<Result<Vec<i64>, _>>()?;
                Ok(ids)
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

    fn random_history_global_count(&self) -> Result<i64, Box<dyn std::error::Error>> {
        let count: i64 = self
            .db
            .conn()
            .query_row("SELECT COUNT(*) FROM random_history_global", [], |row| row.get(0))?;
        Ok(count)
    }

    fn random_history_global_max_index(&self) -> Result<i64, Box<dyn std::error::Error>> {
        let max_index: Option<i64> = self.db.conn().query_row(
            "SELECT COALESCE(MAX(order_index), -1) FROM random_history_global",
            [],
            |row| row.get(0),
        )?;
        Ok(max_index.unwrap_or(-1))
    }

    fn append_random_history_global(&self, image_id: i64) -> Result<i64, Box<dyn std::error::Error>> {
        let next = self.random_history_global_max_index()? + 1;
        self.db.conn().execute(
            "INSERT INTO random_history_global (order_index, image_id) VALUES (?1, ?2)",
            params![next, image_id],
        )?;
        Ok(next)
    }

    fn prepend_random_history_global(&self, image_id: i64) -> Result<i64, Box<dyn std::error::Error>> {
        let mut conn = self.db.conn();
        let tx = conn.transaction()?;
        tx.execute(
            "UPDATE random_history_global SET order_index = order_index + 1000000000",
            [],
        )?;
        tx.execute(
            "UPDATE random_history_global SET order_index = order_index - 999999999",
            [],
        )?;
        tx.execute(
            "INSERT INTO random_history_global (order_index, image_id) VALUES (0, ?1)",
            params![image_id],
        )?;
        tx.commit()?;
        Ok(0)
    }

    fn get_state_random_index(&self) -> Result<i64, Box<dyn std::error::Error>> {
        let idx: i64 = self
            .db
            .conn()
            .query_row("SELECT current_random_index FROM state WHERE id = 1", [], |row| {
                row.get(0)
            })?;
        Ok(idx)
    }

    fn set_state_random_index(&self, idx: i64) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "UPDATE state SET current_random_index = ?1 WHERE id = 1",
            params![idx],
        )?;
        Ok(())
    }

    fn get_state_normal_index(&self) -> Result<i64, Box<dyn std::error::Error>> {
        let idx: i64 = self
            .db
            .conn()
            .query_row("SELECT current_index FROM state WHERE id = 1", [], |row| {
                row.get(0)
            })?;
        Ok(idx)
    }

    fn set_state_normal_index(&self, idx: i64) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "UPDATE state SET current_index = ?1 WHERE id = 1",
            params![idx],
        )?;
        Ok(())
    }

    fn clear_random_history_global(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute("DELETE FROM random_history_global", [])?;
        self.set_state_random_index(-1)?;
        Ok(())
    }

    fn get_visible_checked_normal_entries(
        &self,
    ) -> Result<Vec<(i64, i64, String, i64)>, Box<dyn std::error::Error>> {
        let rows: Vec<(String, i64, String, i64)> = self.db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT fi.folder_path, i.id, i.path, COALESCE(i.folder_id, -1)
                 FROM checked_folders cf
                 JOIN folder_closure c ON c.ancestor_path = cf.path
                 JOIN folder_images_direct fi ON fi.folder_path = c.descendant_path
                 JOIN images i ON i.id = fi.image_id
                 LEFT JOIN hidden_normal_images h ON h.image_id = i.id
                 WHERE h.image_id IS NULL
                 ORDER BY fi.folder_path COLLATE NOCASE, i.path COLLATE NOCASE, i.id",
            )?;
            let rows = stmt
                .query_map([], |row| {
                    let folder_path: String = row.get(0)?;
                    let image_id: i64 = row.get(1)?;
                    let image_path: String = row.get(2)?;
                    let folder_id: i64 = row.get(3)?;
                    Ok((folder_path, image_id, image_path, folder_id))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })?;

        let mut dedup = HashSet::new();
        let mut ordered = Vec::new();
        for (_folder_path, image_id, image_path, folder_id) in rows {
            if dedup.insert(image_id) {
                ordered.push((ordered.len() as i64, image_id, image_path, folder_id));
            }
        }

        Ok(ordered)
    }

    fn get_random_entries_global(&self) -> Result<Vec<(i64, i64, String)>, Box<dyn std::error::Error>> {
        self.db
            .with_conn(|conn| {
                let mut stmt = conn.prepare(
                    "SELECT rh.order_index, rh.image_id, i.path
                     FROM random_history_global rh
                     JOIN images i ON i.id = rh.image_id
                     ORDER BY rh.order_index",
                )?;
                let rows = stmt
                    .query_map([], |row| {
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

    fn get_visible_random_entries_global(
        &self,
    ) -> Result<Vec<(i64, i64, String)>, Box<dyn std::error::Error>> {
        let hidden_ids = self.db.with_conn(|conn| {
            let mut stmt = conn.prepare("SELECT DISTINCT image_id FROM hidden_random_images")?;
            let ids = stmt
                .query_map([], |row| row.get(0))?
                .collect::<Result<Vec<i64>, _>>()?;
            Ok(ids)
        })?;
        let hidden: HashSet<i64> = hidden_ids.into_iter().collect();
        let entries = self.get_random_entries_global()?;
        Ok(entries
            .into_iter()
            .filter(|(_, image_id, _)| !hidden.contains(image_id))
            .collect())
    }

    fn lap_global_count(&self) -> Result<i64, Box<dyn std::error::Error>> {
        let count: i64 = self
            .db
            .conn()
            .query_row("SELECT COUNT(*) FROM current_lap_global", [], |row| row.get(0))?;
        Ok(count)
    }

    fn lap_global_has(&self, image_id: i64) -> Result<bool, Box<dyn std::error::Error>> {
        let exists: Option<i64> = self
            .db
            .conn()
            .query_row(
                "SELECT 1 FROM current_lap_global WHERE image_id = ?1 LIMIT 1",
                params![image_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(exists.is_some())
    }

    fn lap_global_insert(&self, image_id: i64) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "INSERT OR IGNORE INTO current_lap_global (image_id) VALUES (?1)",
            params![image_id],
        )?;
        Ok(())
    }

    fn lap_global_clear(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute("DELETE FROM current_lap_global", [])?;
        Ok(())
    }

    fn ensure_lap_global_capacity(&self, total_images: i64) -> Result<(), Box<dyn std::error::Error>> {
        let count = self.lap_global_count()?;
        if count >= total_images {
            self.lap_global_clear()?;
        }
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

    pub fn get_folder_tree(
        &self,
    ) -> Result<Vec<(String, Option<String>, i64, bool)>, Box<dyn std::error::Error>> {
        self.bootstrap_checked_scope()?;
        self.db
            .with_conn(|conn| {
                let mut stmt = conn.prepare(
                    "SELECT fn.path, fn.parent_path, fn.subtree_image_count,
                            CASE WHEN cf.path IS NULL THEN 0 ELSE 1 END AS checked
                     FROM folder_nodes fn
                     LEFT JOIN checked_folders cf ON cf.path = fn.path
                     ORDER BY fn.path",
                )?;
                let rows = stmt
                    .query_map([], |row| {
                        let path: String = row.get(0)?;
                        let parent_path: Option<String> = row.get(1)?;
                        let subtree_image_count: i64 = row.get(2)?;
                        let checked_raw: i64 = row.get(3)?;
                        Ok((path, parent_path, subtree_image_count, checked_raw != 0))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .map_err(|e| e.into())
    }

    pub fn set_folder_checked(
        &self,
        folder_path: &str,
        checked: bool,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.bootstrap_checked_scope()?;
        let exists: Option<i64> = self
            .db
            .conn()
            .query_row(
                "SELECT 1 FROM folder_nodes WHERE path = ?1 LIMIT 1",
                params![folder_path],
                |row| row.get(0),
            )
            .optional()?;
        if exists.is_none() {
            return Err("folder not found in indexed tree".into());
        }

        {
            let mut conn = self.db.conn();
            let tx = conn.transaction()?;
            if checked {
                tx.execute(
                    "INSERT OR IGNORE INTO checked_folders(path) VALUES (?1)",
                    params![folder_path],
                )?;
            } else {
                tx.execute(
                    "DELETE FROM checked_folders WHERE path = ?1",
                    params![folder_path],
                )?;
            }
            tx.commit()?;
        }
        Ok(())
    }

    pub fn set_folder_exclusive(&self, folder_path: &str) -> Result<(), Box<dyn std::error::Error>> {
        self.bootstrap_checked_scope()?;
        let exists: Option<i64> = self
            .db
            .conn()
            .query_row(
                "SELECT 1 FROM folder_nodes WHERE path = ?1 LIMIT 1",
                params![folder_path],
                |row| row.get(0),
            )
            .optional()?;
        if exists.is_none() {
            return Err("folder not found in indexed tree".into());
        }

        {
            let mut conn = self.db.conn();
            let tx = conn.transaction()?;
            tx.execute("DELETE FROM checked_folders", [])?;
            tx.execute(
                "INSERT OR IGNORE INTO checked_folders(path) VALUES (?1)",
                params![folder_path],
            )?;
            tx.commit()?;
        }
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
        {
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
            "DELETE FROM random_history_global
             WHERE image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM current_lap_global
             WHERE image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM active_images
             WHERE image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM active_image_refcounts
             WHERE image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM folder_images_direct
             WHERE image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM images WHERE folder_id = ?1",
            params![folder_id],
        )?;

        tx.commit()?;
        }
        Ok(())
    }

    pub fn delete_folder_by_id(&self, folder_id: i64) -> Result<(), Box<dyn std::error::Error>> {
        let folder_path: Option<String> = self
            .db
            .conn()
            .query_row(
                "SELECT path FROM folders WHERE id = ?1",
                params![folder_id],
                |row| row.get(0),
            )
            .optional()?;

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
        tx.execute(
            "DELETE FROM random_history WHERE folder_id = ?1",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM current_lap WHERE folder_id = ?1",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM random_history_global
             WHERE image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM current_lap_global
             WHERE image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM active_images
             WHERE image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM active_image_refcounts
             WHERE image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM folder_images_direct
             WHERE image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
            params![folder_id],
        )?;
        tx.execute(
            "DELETE FROM images WHERE folder_id = ?1",
            params![folder_id],
        )?;

        if let Some(path) = &folder_path {
            tx.execute(
                "DELETE FROM checked_folders
                 WHERE path IN (
                   SELECT descendant_path
                   FROM folder_closure
                   WHERE ancestor_path = ?1
                 )",
                params![path],
            )?;
        }

        tx.execute(
            "DELETE FROM folder_closure
             WHERE ancestor_path IN (SELECT path FROM folder_nodes WHERE root_folder_id = ?1)
                OR descendant_path IN (SELECT path FROM folder_nodes WHERE root_folder_id = ?1)",
            params![folder_id],
        )?;

        tx.execute(
            "DELETE FROM folder_nodes WHERE root_folder_id = ?1",
            params![folder_id],
        )?;
        tx.execute("DELETE FROM folders WHERE id = ?1", params![folder_id])?;

        // If this was the current folder, fall back to previous history item
        if current_folder_id == Some(folder_id) {
            tx.execute(
                "UPDATE state SET current_folder_id = ?1 WHERE id = 1",
                params![fallback_folder_id],
            )?;
        }

        tx.commit()?;
        drop(conn);
        self.rebuild_active_images()?;
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
        self.index_folder_with_progress(folder_id, &mut on_progress, force_rescan)
            .await?;
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
                let mut stmt =
                    tx.prepare("INSERT OR IGNORE INTO images (path, folder_id) VALUES (?1, ?2)")?;
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

        self.rebuild_folder_nodes_for_root(folder_id)?;
        self.ensure_default_checked_folder()?;
        self.rebuild_active_images()?;

        on_progress(format!("index:ready count={}", after_count));
        Ok(folder_id)
    }

    /// Returns (folder_id, auto_switched)
    pub async fn ensure_images_indexed(&self) -> Result<(i64, bool), Box<dyn std::error::Error>> {
        self.ensure_images_indexed_with_progress(|_| {}, false)
            .await
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
        let (folder_id, _) = self
            .ensure_images_indexed_with_progress(on_progress, false)
            .await?;
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
        tx.execute(
            "DELETE FROM random_history_global WHERE image_id = ?1",
            params![image_id],
        )?;
        tx.execute(
            "DELETE FROM current_lap_global WHERE image_id = ?1",
            params![image_id],
        )?;
        tx.execute("DELETE FROM active_images WHERE image_id = ?1", params![image_id])?;
        tx.execute(
            "DELETE FROM active_image_refcounts WHERE image_id = ?1",
            params![image_id],
        )?;
        tx.execute(
            "DELETE FROM folder_images_direct WHERE image_id = ?1",
            params![image_id],
        )?;

        // Then delete the image
        tx.execute("DELETE FROM images WHERE id = ?1", params![image_id])?;

        tx.commit()?;
        Ok(())
    }

    /// Returns (image_data, auto_switched_folder)
    pub async fn get_next_image(&self) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (_folder_id, auto_switched) = self.ensure_images_indexed().await?;
        self.bootstrap_checked_scope()?;
        self.require_checked_folders()?;
        let visible = self.get_visible_checked_normal_entries()?;
        if visible.is_empty() {
            return Err("all images for this folder are hidden in normal mode - reindex to clear hidden images".into());
        }

        let current_raw_index = self.get_state_normal_index()?;
        let next_pos = match visible
            .iter()
            .position(|(order_index, _, _, _)| *order_index == current_raw_index)
        {
            Some(pos) => (pos + 1) % visible.len(),
            None => 0,
        };

        let (order_index, image_id, _, selected_folder_id) = visible[next_pos].clone();
        self.set_state_normal_index(order_index)?;
        if selected_folder_id > 0 {
            self.set_current_folder_id(Some(selected_folder_id))?;
        }
        let data = self.load_by_image_id(image_id).await?;
        Ok((data, auto_switched))
    }

    /// Returns (image_data, auto_switched_folder)
    pub async fn get_prev_image(&self) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (_folder_id, auto_switched) = self.ensure_images_indexed().await?;
        self.bootstrap_checked_scope()?;
        self.require_checked_folders()?;
        let visible = self.get_visible_checked_normal_entries()?;
        if visible.is_empty() {
            return Err("all images for this folder are hidden in normal mode - reindex to clear hidden images".into());
        }

        let current_raw_index = self.get_state_normal_index()?;
        let prev_pos = match visible
            .iter()
            .position(|(order_index, _, _, _)| *order_index == current_raw_index)
        {
            Some(pos) if pos == 0 => visible.len() - 1,
            Some(pos) => pos - 1,
            None => visible.len() - 1,
        };

        let (order_index, image_id, _, selected_folder_id) = visible[prev_pos].clone();
        self.set_state_normal_index(order_index)?;
        if selected_folder_id > 0 {
            self.set_current_folder_id(Some(selected_folder_id))?;
        }
        let data = self.load_by_image_id(image_id).await?;
        Ok((data, auto_switched))
    }

    pub async fn get_current_image_or_first(
        &self,
    ) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (_folder_id, auto_switched) = self.ensure_images_indexed().await?;
        self.bootstrap_checked_scope()?;
        self.require_checked_folders()?;
        let visible = self.get_visible_checked_normal_entries()?;
        if visible.is_empty() {
            return Err("all images for this folder are hidden in normal mode - reindex to clear hidden images".into());
        }

        let current_raw_index = self.get_state_normal_index()?;
        let selected = visible
            .iter()
            .find(|(order_index, _, _, _)| *order_index == current_raw_index)
            .cloned()
            .unwrap_or_else(|| visible[0].clone());

        self.set_state_normal_index(selected.0)?;
        if selected.3 > 0 {
            self.set_current_folder_id(Some(selected.3))?;
        }
        let data = self.load_by_image_id(selected.1).await?;
        Ok((data, auto_switched))
    }

    pub async fn get_current_random_image_or_last(
        &self,
    ) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (_folder_id, auto_switched) = self.ensure_images_indexed().await?;
        if self.random_history_global_count()? == 0 {
            return self.get_force_random_image(true).await;
        }

        let visible = self.get_visible_random_entries_global()?;
        if visible.is_empty() {
            return self.get_force_random_image(true).await;
        }

        let current_order_index = self.get_state_random_index()?;
        let selected = visible
            .iter()
            .find(|(order_index, _, _)| *order_index == current_order_index)
            .cloned()
            .unwrap_or_else(|| visible[visible.len() - 1].clone());

        self.set_state_random_index(selected.0)?;
        let data = self.load_by_image_id(selected.1).await?;
        Ok((data, auto_switched))
    }

    pub async fn get_force_random_image(
        &self,
        force_pointer_to_last: bool,
    ) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (_folder_id, auto_switched) = self.ensure_images_indexed().await?;
        self.bootstrap_checked_scope()?;
        self.require_checked_folders()?;

        let mut skipped_count = 0;
        let mut reset_lap_once = false;

        let image_id = loop {
            let folder_counts = self.get_checked_folder_available_counts()?;
            if folder_counts.is_empty() {
                if !reset_lap_once {
                    self.lap_global_clear()?;
                    reset_lap_once = true;
                    continue;
                }

                if skipped_count > 0 {
                    return Err(format!(
                        "skipped {} deleted image(s), no valid images found - reindex please",
                        skipped_count
                    )
                    .into());
                }

                return Err(
                    "all images for this folder are hidden in random mode - reindex to clear hidden images"
                        .into(),
                );
            }

            let total: i64 = folder_counts.iter().map(|(_, count)| *count).sum();
            if total <= 0 {
                return Err("no images available".into());
            }

            let mut draw = rand::random::<u64>() % (total as u64);
            let mut selected_folder = folder_counts[0].0.clone();
            for (path, count) in &folder_counts {
                let weight = *count as u64;
                if draw < weight {
                    selected_folder = path.clone();
                    break;
                }
                draw -= weight;
            }

            let image_ids = self.get_available_random_image_ids_for_checked_folder(&selected_folder)?;
            if image_ids.is_empty() {
                continue;
            }
            let pick_idx = (rand::random::<u64>() % (image_ids.len() as u64)) as usize;
            let candidate = image_ids[pick_idx];

            let path = match self.get_image_path(candidate) {
                Ok(p) => p,
                Err(_) => continue,
            };

            if !std::path::Path::new(&path).exists() {
                self.delete_image_by_id(candidate)?;
                skipped_count += 1;
                continue;
            }

            self.lap_global_insert(candidate)?;
            break candidate;
        };

        let next_index = if force_pointer_to_last {
            self.append_random_history_global(image_id)?
        } else {
            self.prepend_random_history_global(image_id)?
        };

        self.set_state_random_index(next_index)?;

        match self.load_by_image_id(image_id).await {
            Ok(data) => {
                if skipped_count > 0 {
                    return Err(format!(
                        "skipped {} deleted image(s) - reindex please",
                        skipped_count
                    )
                    .into());
                }
                Ok((data, auto_switched))
            }
            Err(e) => {
                // If we still failed to load, delete and report
                let error_str = e.to_string();
                if error_str.contains("not found") || error_str.contains("reindex") {
                    self.delete_image_by_id(image_id)?;
                    if skipped_count > 0 {
                        return Err(format!(
                            "skipped {} deleted image(s) - reindex please",
                            skipped_count + 1
                        )
                        .into());
                    }
                    return Err("deleted image found - reindex please".into());
                }
                Err(e)
            }
        }
    }

    pub async fn get_next_random_image(
        &self,
    ) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (_folder_id, auto_switched) = self.ensure_images_indexed().await?;
        if self.random_history_global_count()? == 0 {
            return self.get_force_random_image(true).await;
        }

        let visible = self.get_visible_random_entries_global()?;
        if visible.is_empty() {
            return self.get_force_random_image(true).await;
        }

        let current_order_index = self.get_state_random_index()?;
        if let Some((order_index, image_id, _)) = visible
            .iter()
            .find(|(order_index, _, _)| *order_index > current_order_index)
            .cloned()
        {
            self.set_state_random_index(order_index)?;
            let data = self.load_by_image_id(image_id).await?;
            return Ok((data, auto_switched));
        }

        self.get_force_random_image(true).await
    }

    pub async fn get_prev_random_image(
        &self,
    ) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (_folder_id, auto_switched) = self.ensure_images_indexed().await?;
        if self.random_history_global_count()? == 0 {
            return self.get_force_random_image(false).await;
        }

        let visible = self.get_visible_random_entries_global()?;
        if visible.is_empty() {
            return self.get_force_random_image(false).await;
        }

        let current_order_index = self.get_state_random_index()?;
        if let Some((order_index, image_id, _)) = visible
            .iter()
            .rev()
            .find(|(order_index, _, _)| *order_index < current_order_index)
            .cloned()
        {
            self.set_state_random_index(order_index)?;
            let data = self.load_by_image_id(image_id).await?;
            return Ok((data, auto_switched));
        }

        self.get_force_random_image(false).await
    }

    fn delete_image_from_random_history(
        &self,
        folder_id: i64,
        image_id: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "DELETE FROM random_history WHERE folder_id = ?1 AND image_id = ?2",
            params![folder_id, image_id],
        )?;
        Ok(())
    }

    pub fn get_normal_history(
        &self,
    ) -> Result<(Vec<crate::commands::ImageHistoryItem>, i64), Box<dyn std::error::Error>> {
        self.bootstrap_checked_scope()?;
        let visible = self.get_visible_checked_normal_entries()?;
        let pointer_raw = self.get_state_normal_index()?;
        let pointer = visible
            .iter()
            .position(|(order_index, _, _, _)| *order_index == pointer_raw)
            .map(|idx| idx as i64)
            .unwrap_or(-1);
        let items = visible
            .into_iter()
            .map(
                |(order_index, image_id, path, _)| crate::commands::ImageHistoryItem {
                    image_id,
                    order_index,
                    path,
                },
            )
            .collect::<Vec<_>>();
        Ok((items, pointer))
    }

    pub fn get_random_history(
        &self,
    ) -> Result<(Vec<crate::commands::ImageHistoryItem>, i64), Box<dyn std::error::Error>> {
        let visible = self.get_visible_random_entries_global()?;
        let pointer_raw = self.get_state_random_index()?;
        let pointer = visible
            .iter()
            .position(|(order_index, _, _)| *order_index == pointer_raw)
            .map(|idx| idx as i64)
            .unwrap_or(-1);
        let items = visible
            .into_iter()
            .map(
                |(order_index, image_id, path)| crate::commands::ImageHistoryItem {
                    image_id,
                    order_index,
                    path,
                },
            )
            .collect::<Vec<_>>();
        Ok((items, pointer))
    }

    pub fn reset_normal_history(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.set_state_normal_index(-1)?;
        Ok(())
    }

    pub fn reset_random_history(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.clear_random_history_global()?;
        self.lap_global_clear()?;
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
        let folder_id = self
            .get_image_folder_id(image_id)?
            .ok_or("no folder selected - pick a folder first")?;

        self.db.conn().execute(
            "INSERT OR IGNORE INTO hidden_normal_images (folder_id, image_id) VALUES (?1, ?2)",
            params![folder_id, image_id],
        )?;

        self.bootstrap_checked_scope()?;
        let visible = self.get_visible_checked_normal_entries()?;
        if visible.is_empty() {
            return Err("all images for this folder are hidden in normal mode - reindex to clear hidden images".into());
        }

        let current_raw_index = self.get_state_normal_index()?;
        let current_still_visible = visible
            .iter()
            .any(|(order_index, _, _, _)| *order_index == current_raw_index);
        if current_raw_index >= 0 && !current_still_visible {
            let next_order_index = visible
                .iter()
                .rev()
                .find(|(order_index, _, _, _)| *order_index < current_raw_index)
                .map(|(order_index, _, _, _)| *order_index)
                .unwrap_or_else(|| visible[visible.len() - 1].0);
            self.set_state_normal_index(next_order_index)?;
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

        let visible_history = self.get_visible_random_entries_global()?;
        let has_available_checked_scope = !self.get_checked_folder_available_counts()?.is_empty();
        if visible_history.is_empty() && !has_available_checked_scope {
            return Err("all images for this folder are hidden in random mode - reindex to clear hidden images".into());
        }

        let current_order_index = self.get_state_random_index()?;
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
            self.set_state_random_index(next_order_index)?;
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
            return Err(format!(
                "folder no longer exists: {} - deleted from history",
                folder_path
            )
            .into());
        }

        self.delete_images_by_folder_id(folder_id)?;
        self.clear_hidden_images_for_folder(folder_id)?;
        self.set_current_folder_index(folder_id, -1)?;
        self.set_current_folder_random_index(folder_id, -1)?;
        self.ensure_images_indexed_with_progress(|_| {}, true)
            .await?;
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
            return Err(format!(
                "folder no longer exists: {} - deleted from history",
                folder_path
            )
            .into());
        }

        self.delete_images_by_folder_id(folder_id)?;
        self.clear_hidden_images_for_folder(folder_id)?;
        self.set_current_folder_index(folder_id, -1)?;
        self.set_current_folder_random_index(folder_id, -1)?;
        self.ensure_images_indexed_with_progress(on_progress, true)
            .await?;
        Ok((folder_id, folder_path))
    }

    pub fn full_wipe(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.db.conn();
        let tx = conn.transaction()?;

        tx.execute("DELETE FROM random_history", [])?;
        tx.execute("DELETE FROM random_history_global", [])?;
        tx.execute("DELETE FROM current_lap", [])?;
        tx.execute("DELETE FROM current_lap_global", [])?;
        tx.execute("DELETE FROM active_images", [])?;
        tx.execute("DELETE FROM active_image_refcounts", [])?;
        tx.execute("DELETE FROM hidden_normal_images", [])?;
        tx.execute("DELETE FROM hidden_random_images", [])?;
        tx.execute("DELETE FROM folder_images_direct", [])?;
        tx.execute("DELETE FROM folder_closure", [])?;
        tx.execute("DELETE FROM images", [])?;
        tx.execute("DELETE FROM checked_folders", [])?;
        tx.execute("DELETE FROM folder_nodes", [])?;
        tx.execute("DELETE FROM folders", [])?;
        tx.execute(
            "UPDATE state
             SET current_folder_id = NULL,
                 current_index = -1,
                 current_random_index = -1,
                 last_image_id = NULL
             WHERE id = 1",
            [],
        )?;

        tx.commit()?;
        Ok(())
    }

    pub fn get_image_state(
        &self,
    ) -> Result<crate::commands::ImageState, Box<dyn std::error::Error>> {
        let row = self.db.conn().query_row(
            "SELECT vertical_mirror, horizontal_mirror, greyscale, timer_flow_mode, show_folder_history_panel, show_top_controls, show_image_history_panel, show_bottom_controls, is_fullscreen_image, shortcut_hints_visible, shortcut_hint_side FROM state WHERE id = 1",
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
                let shortcut_hints_visible: i64 = row.get(9)?;
                let shortcut_hint_side: String = row.get(10)?;
                Ok((vertical_mirror, horizontal_mirror, greyscale, timer_flow_mode, show_folder_history_panel, show_top_controls, show_image_history_panel, show_bottom_controls, is_fullscreen_image, shortcut_hints_visible, shortcut_hint_side))
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
            shortcut_hints_visible: row.9 != 0,
            shortcut_hint_side: if row.10 == "right" {
                "right".to_string()
            } else {
                "left".to_string()
            },
        })
    }

    pub fn set_image_state(
        &self,
        state: &crate::commands::ImageState,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.db.conn().execute(
            "UPDATE state SET vertical_mirror = ?1, horizontal_mirror = ?2, greyscale = ?3, timer_flow_mode = ?4, show_folder_history_panel = ?5, show_top_controls = ?6, show_image_history_panel = ?7, show_bottom_controls = ?8, is_fullscreen_image = ?9, shortcut_hints_visible = ?10, shortcut_hint_side = ?11 WHERE id = 1",
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
                state.shortcut_hints_visible as i64,
                &state.shortcut_hint_side,
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
        let (_folder_id, auto_switched) = self.ensure_images_indexed().await?;
        self.bootstrap_checked_scope()?;
        self.require_checked_folders()?;
        let visible = self.get_visible_checked_normal_entries()?;

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

        let (order_index, image_id, _, selected_folder_id) = visible[idx as usize].clone();
        self.set_state_normal_index(order_index)?;
        if selected_folder_id > 0 {
            self.set_current_folder_id(Some(selected_folder_id))?;
        }
        let data = self.load_by_image_id(image_id).await?;
        Ok((data, auto_switched))
    }

    pub async fn set_random_image_by_index(
        &self,
        index: i64,
    ) -> Result<(Vec<u8>, bool), Box<dyn std::error::Error>> {
        let (_folder_id, auto_switched) = self.ensure_images_indexed().await?;
        let visible = self.get_visible_random_entries_global()?;

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
        self.set_state_random_index(order_index)?;
        let data = self.load_by_image_id(image_id).await?;
        Ok((data, auto_switched))
    }
}

#[cfg(test)]
mod tests {
    use super::ImageLoader;
    use crate::db::Db;
    use rusqlite::params;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::async_runtime::block_on;

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn unique_temp_root(name: &str) -> PathBuf {
        let counter = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "random_pics_img_loader_{}_{}_{}_{}",
            name,
            std::process::id(),
            nanos,
            counter
        ));
        std::fs::create_dir_all(&root).expect("test temp root should be created");
        root
    }

    fn write_test_image(path: &Path, seed: u8) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("image parent should exist");
        }
        std::fs::write(path, [seed, seed.wrapping_add(1), seed.wrapping_add(2)])
            .expect("test image should be writable");
    }

    fn setup_loader_with_images(name: &str, image_count: usize) -> (ImageLoader, PathBuf) {
        let root = unique_temp_root(name);
        let folder = root.join("images");
        std::fs::create_dir_all(&folder).expect("image folder should be created");

        for idx in 0..image_count {
            let path = if idx % 2 == 0 {
                folder.join(format!("img_{idx}.jpg"))
            } else {
                folder.join("nested").join(format!("img_{idx}.png"))
            };
            write_test_image(&path, idx as u8);
        }

        let db_path = root.join("imgstate.sqlite");
        let db = Db::open(db_path).expect("db open should succeed");
        let loader = ImageLoader::new(db);
        let folder_str = folder.to_string_lossy().to_string();
        block_on(loader.set_current_folder_and_index(&folder_str))
            .expect("folder should index successfully");

        (loader, root)
    }

    #[test]
    fn force_random_errors_when_all_images_are_hidden_in_random_mode() {
        let (loader, root) = setup_loader_with_images("all_hidden_random", 3);
        let folder_id = loader
            .get_current_folder_id()
            .expect("folder lookup should succeed")
            .expect("current folder should be set");

        {
            let conn = loader.db.conn();
            let mut stmt = conn
                .prepare("SELECT id FROM images WHERE folder_id = ?1")
                .expect("image id query should prepare");
            let image_ids = stmt
                .query_map(params![folder_id], |row| row.get::<_, i64>(0))
                .expect("image id query should run")
                .collect::<Result<Vec<_>, _>>()
                .expect("image ids should collect");

            for image_id in image_ids {
                conn.execute(
                    "INSERT OR IGNORE INTO hidden_random_images (folder_id, image_id) VALUES (?1, ?2)",
                    params![folder_id, image_id],
                )
                .expect("hidden_random insert should succeed");
            }
        }

        let err = block_on(loader.get_force_random_image(true))
            .expect_err("force random should fail when all images are hidden")
            .to_string();
        assert!(err.contains("all images for this folder are hidden in random mode"));

        drop(loader);
        std::fs::remove_dir_all(root).expect("temp root should be removable");
    }

    #[test]
    fn reset_random_history_clears_history_but_preserves_hidden_random_blacklist() {
        let (loader, root) = setup_loader_with_images("reset_preserves_hidden", 4);
        block_on(loader.get_force_random_image(true)).expect("initial random image should load");
        block_on(loader.get_force_random_image(true)).expect("second random image should load");

        let (history, _) = loader
            .get_random_history()
            .expect("random history should be readable");
        assert!(!history.is_empty());
        let hidden_image_id = history[0].image_id;

        loader
            .hide_random_history_image(hidden_image_id)
            .expect("hiding random image should succeed");
        loader
            .reset_random_history()
            .expect("reset random history should succeed");

        let (history_after, current_after) = loader
            .get_random_history()
            .expect("random history should be readable after reset");
        assert!(history_after.is_empty());
        assert_eq!(current_after, -1);

        let folder_id = loader
            .get_current_folder_id()
            .expect("folder lookup should succeed")
            .expect("current folder should exist");
        let hidden_count: i64 = loader
            .db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM hidden_random_images WHERE folder_id = ?1",
                params![folder_id],
                |row| row.get(0),
            )
            .expect("hidden random count query should work");
        assert_eq!(hidden_count, 1);

        drop(loader);
        std::fs::remove_dir_all(root).expect("temp root should be removable");
    }

    #[test]
    fn hide_random_history_image_keeps_pointer_on_a_visible_entry() {
        let (loader, root) = setup_loader_with_images("hide_pointer", 5);
        block_on(loader.get_force_random_image(true)).expect("random image load should work");
        block_on(loader.get_force_random_image(true)).expect("random image load should work");
        block_on(loader.get_force_random_image(true)).expect("random image load should work");

        let (before, before_index) = loader
            .get_random_history()
            .expect("random history should be readable");
        assert!(before.len() >= 2);
        assert!(before_index >= 0);
        let current_image_id = before[before_index as usize].image_id;

        loader
            .hide_random_history_image(current_image_id)
            .expect("hiding current random image should succeed");

        let (after, after_index) = loader
            .get_random_history()
            .expect("random history should be readable after hide");

        assert!(after.iter().all(|item| item.image_id != current_image_id));
        assert!(!after.is_empty());
        assert!(after_index >= 0);
        assert!((after_index as usize) < after.len());

        drop(loader);
        std::fs::remove_dir_all(root).expect("temp root should be removable");
    }

    #[test]
    fn delete_folder_cleans_related_rows_and_clears_current_folder_state() {
        let (loader, root) = setup_loader_with_images("delete_folder_cleanup", 4);
        block_on(loader.get_force_random_image(true)).expect("random image load should work");
        block_on(loader.get_force_random_image(true))
            .expect("second random image load should work");

        let (random_history, _) = loader
            .get_random_history()
            .expect("random history should be readable");
        assert!(!random_history.is_empty());
        let image_id = random_history[0].image_id;

        loader
            .hide_normal_history_image(image_id)
            .expect("hiding normal history image should work");
        loader
            .hide_random_history_image(image_id)
            .expect("hiding random history image should work");

        let folder_id = loader
            .get_current_folder_id()
            .expect("folder lookup should succeed")
            .expect("current folder should be set");
        loader
            .delete_folder_by_id(folder_id)
            .expect("deleting folder should succeed");

        let conn = loader.db.conn();
        let folders_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM folders", [], |row| row.get(0))
            .expect("folders count query should work");
        let images_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM images", [], |row| row.get(0))
            .expect("images count query should work");
        let random_history_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM random_history", [], |row| row.get(0))
            .expect("random history count query should work");
        let current_lap_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM current_lap", [], |row| row.get(0))
            .expect("current lap count query should work");
        let hidden_normal_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM hidden_normal_images", [], |row| {
                row.get(0)
            })
            .expect("hidden normal count query should work");
        let hidden_random_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM hidden_random_images", [], |row| {
                row.get(0)
            })
            .expect("hidden random count query should work");
        let current_folder_id: Option<i64> = conn
            .query_row(
                "SELECT current_folder_id FROM state WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("current folder state query should work");

        assert_eq!(folders_count, 0);
        assert_eq!(images_count, 0);
        assert_eq!(random_history_count, 0);
        assert_eq!(current_lap_count, 0);
        assert_eq!(hidden_normal_count, 0);
        assert_eq!(hidden_random_count, 0);
        assert_eq!(current_folder_id, None);

        drop(conn);
        drop(loader);
        std::fs::remove_dir_all(root).expect("temp root should be removable");
    }
}
