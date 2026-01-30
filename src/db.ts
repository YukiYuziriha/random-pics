import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";

const dbPath = resolve(import.meta.dir, "../data/imgstate.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new Database(dbPath, { create: true, readwrite: true });

db.run(`
  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    added_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    folder_id INTEGER,
    FOREIGN KEY (folder_id) REFERENCES folders(id)
  );
  CREATE TABLE IF NOT EXISTS state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_index INTEGER NOT NULL DEFAULT -1,
    current_random_index INTEGER NOT NULL DEFAULT -1,
    current_folder_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS random_history (
    order_index INTEGER PRIMARY KEY,
    image_id INTEGER NOT NULL,
    FOREIGN KEY (image_id) REFERENCES images(id)
  );
  CREATE TABLE IF NOT EXISTS current_lap (
    image_id INTEGER PRIMARY KEY,
    FOREIGN KEY (image_id) REFERENCES images(id)
  );
`);
db.run(`INSERT OR IGNORE INTO state (id) VALUES (1);`);
try {
  db.run(`ALTER TABLE state ADD COLUMN current_random_index INTEGER NOT NULL DEFAULT -1`);
} catch {
}
db.run(`UPDATE state SET current_random_index = current_index WHERE current_random_index = -1`);
