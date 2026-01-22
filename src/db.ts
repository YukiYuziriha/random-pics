import { Database } from "bun:sqlite";

const dbPath = Bun.resolveSync("../data/imgstate.sqlite", import.meta.dir);
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
    current_index INTEGER NOT NULL DEFAULT 0,
    current_random_index INTEGER NOT NULL DEFAULT -1
  );
  CREATE TABLE IF NOT EXISTS random_history (
    order_index INTEGER PRIMARY KEY,
    image_id INTEGER NOT NULL,
    FOREIGN KEY (image_id) REFERENCES images(id)
  );
  CREATE TABLE IF NOT EXISTS random_lap (
    image_id INTEGER PRIMARY KEY,
    FOREIGN KEY (image_id) REFERENCES images(id)
  );
`);
db.run(`INSERT OR IGNORE INTO state (id) VALUES (1);`);
