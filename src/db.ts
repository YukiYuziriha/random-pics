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
    added_at TEXT NOT NULL,
    current_index INTEGER NOT NULL DEFAULT -1,
    current_random_index INTEGER NOT NULL DEFAULT -1
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
    current_folder_id INTEGER,
    vertical_mirror INTEGER NOT NULL DEFAULT 0,
    horizontal_mirror INTEGER NOT NULL DEFAULT 0,
    greyscale INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS random_history (
    folder_id INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    image_id INTEGER NOT NULL,
    PRIMARY KEY (folder_id, order_index),
    FOREIGN KEY (folder_id) REFERENCES folders(id),
    FOREIGN KEY (image_id) REFERENCES images(id)
  );
  CREATE TABLE IF NOT EXISTS current_lap (
    folder_id INTEGER NOT NULL,
    image_id INTEGER NOT NULL,
    PRIMARY KEY (folder_id, image_id),
    FOREIGN KEY (folder_id) REFERENCES folders(id),
    FOREIGN KEY (image_id) REFERENCES images(id)
  );
`);
db.run(`INSERT OR IGNORE INTO state (id) VALUES (1);`);
