import { Glob } from "bun";
import { db } from "./db.ts";

const insertFolder = db.query(`
                              INSERT OR IGNORE INTO folders (path, added_at)
                              VALUES ($path, $addedAt)
                              `);
const getFolderIdByPath = db.query(`
                           SELECT id FROM folders WHERE path = ?
                           `);
const countImages = db.query(`
                             SELECT COUNT(*) AS count
                             FROM images
                             WHERE folderId = ?
                             `);
const insertImage = db.query(`
                             INSERT OR IGNORE INTO IMAGES (path, folderId)
                             VALUES ($path, $folderId)
                             `);
const listImageIds = db.query(`
                              SELECT id FROM images
                              WHERE folderId = ?
                              ORDER BY id
                              `);
const getImagePath = db.query(`
                              SELECT path FROM images WHERE id = ?
                              `);
const getState = db.query(`
                          SELECT current_index, current_random_index
                          FROM state WHERE id = 1
                          `);
const setCurrentIndex = db.query(`
                                 UPDATE state
                                 SET current_index = $currentIndex
                                 WHERE id = 1
                                 `);
const setCurrentRandomIndex = db.query(`
                                        UPDATE state
                                        SET current_random_index = $currentRandomIndex
                                        WHERE ID = 1
                                       `)
const setCurrentFolderId = db.query(`
                                    UPDATE state SET current_folderId = $id WHERE id = 1
                                    `);
const historyCount = db.query(`
                              SELECT COUNT(*) AS count
                              FROM random_history
                              `);
const historyMaxIndex = db.query(`
                                 SELECT COALESCE(MAX(order_index), -1) AS max_index
                                 FROM random_history
                                 `);
const historyAt = db.query(`
                           SELECT image_id FROM random_history WHERE order_index = ?
                           `);
const historyInsert = db.query(`
                                INSERT INTO random_history (order_index, image_id)
                                VALUES ($orderIndex, $imageId)
                                `);
const getRandomHistory = db.query(`
                                  SELECT rh.order_index, i.path
                                  FROM random_history rh
                                  JOIN images i ON i.id = rh.image_id
                                  ORDER BY rh.order_index
                                  `);
const getCurrentRandomIndex = db.query(`
                                   SELECT current_random_index FROM state WHERE id = 1
                                   `);
const getCurrentFolderId= db.query(`
                                  SELECT current_folderId FROM state WHERE id = 1
                                  `);
const getFolderPathById = db.query(`
                                   SELECT path FROM folders WHERE id = ?
                                   `);
const getFolderHistoryQuery = db.query(`
                                       SELECT id, path, added_at
                                       FROM folders
                                       ORDER BY added_at DESC
                                       `);

function historyShiftUpSafe(): void {
  db.run("BEGIN");
  db.run("UPDATE random_history SET order_index = order_index + 1000000000");
  db.run("UPDATE random_history SET order_index = order_index - 999999999");
  db.run("COMMIT");
}

async function ensureImagesIndexed(): Promise<number> {
  const current = getCurrentFolderIdAndPath();
  if (!current) {
    throw new Error("no folder???");
  }

  const { id: folderId, path: folderPath } = current;

  const countRow = countImages.get(folderId) as { count: number };
  if (countRow.count > 0) {
    return folderId;
  }

  const glob = new Glob("**/*.{jpeg,jpg,png,gif,webp}");

  for await (const file of glob.scan({
    cwd: folderPath,
    onlyFiles: true,
    absolute: true,
  })) {
    insertImage.run({ $path: file, $folderId: folderId });
  }

  const afterRow = countImages.get(folderId) as { count: number };
  if (afterRow.count === 0) {
    console.log("no bitches");
    throw new Error("no images available");
  }

  return folderId;
}

function getImageIds(folderId: number): number[] {
  const rows = listImageIds.all(folderId) as { id: number }[];
  return rows.map((r) => r.id);
}

async function loadByImageId(imageId: number): Promise<ArrayBuffer> {
  const row = getImagePath.get(imageId) as { path: string } | null;
  if (!row) {
    throw new Error("image id not found");
  }
  const data = await Bun.file(row.path).arrayBuffer();
  console.log(`loaded ${row.path} (${(data.byteLength/1024/1024).toFixed(2)} Mbytes)`);
  return data;
}

export async function getNextRandomImage(): Promise<ArrayBuffer> {
  await ensureImagesIndexed();

  const countRow = historyCount.get() as { count: number };
  if (countRow.count === 0) {
    return getForceRandomImage(true);
  }

  const state = getState.get() as { current_index: number; current_random_index: number };
  if (state.current_random_index < countRow.count - 1) {
    const nextIndex = state.current_random_index + 1;
    const row = historyAt.get(nextIndex) as { image_id: number } | null;
    if (!row) {
      return getForceRandomImage(true);
    }
    setCurrentRandomIndex.run({ $currentRandomIndex: nextIndex });
    return loadByImageId(row.image_id);
  }

  return getForceRandomImage(true);
}

export async function getPrevRandomImage(): Promise<ArrayBuffer> {
  await ensureImagesIndexed();
  
  const countRow = historyCount.get() as { count: number };
  if (countRow.count === 0) {
    return getForceRandomImage(true);
  }

  const state = getState.get() as { current_index: number; current_random_index: number };
  if (state.current_random_index > 0) {
    const prevIndex = state.current_random_index - 1;
    const row = historyAt.get(prevIndex) as { image_id: number } | null;
    if (!row) {
      return getForceRandomImage(true);
    }
    setCurrentRandomIndex.run({ $currentRandomIndex: prevIndex });
    return loadByImageId(row.image_id);
  }
  
  if (state.current_random_index === 0) {
    return getForceRandomImage(false);
  }

  const row = historyAt.get(state.current_random_index) as { image_id: number } | null;
  if (!row) {
    return getForceRandomImage(true);
  }
  return loadByImageId(row.image_id);
}

export async function getForceRandomImage(forcePointerToLast: boolean = true): Promise<ArrayBuffer> {
  const folderId = await ensureImagesIndexed();
  const imageIds = getImageIds(folderId);
  if (imageIds.length === 0) {
    throw new Error("no images available");
  }
  const lapCount = db.query(`SELECT COUNT(*) AS count FROM random_lap`);
  const lapHas = db.query(`SELECT 1 FROM random_lap WHERE image_id = ? LIMIT 1`);
  const lapInsert = db.query(`INSERT OR IGNORE INTO random_lap (image_id) VALUES ($imageId)`);
  const lapClear = db.query(`DELETE FROM random_lap`);
  const lapRow = lapCount.get() as { count: number };
  if (lapRow.count >= imageIds.length) {
    lapClear.run();
  }
  let imageId = imageIds[Math.floor(Math.random() * imageIds.length)]!;
  while (lapHas.get(imageId)) {
    imageId = imageIds[Math.floor(Math.random() * imageIds.length)]!;
  }
  lapInsert.run({ $imageId: imageId });
  if (forcePointerToLast) {
    const maxRow = historyMaxIndex.get() as { max_index: number };
    const nextIndex = maxRow.max_index + 1;
    historyInsert.run({ $orderIndex: nextIndex, $imageId: imageId });
    setCurrentRandomIndex.run({ $currentRandomIndex: nextIndex });
  } else {
    historyShiftUpSafe();
    historyInsert.run({ $orderIndex: 0, $imageId: imageId });
    setCurrentRandomIndex.run({ $currentRandomIndex: 0 });
  }
  return loadByImageId(imageId);
}

export async function getNextImage(): Promise<ArrayBuffer> {
  const folderId = await ensureImagesIndexed();
  const imageIds = getImageIds(folderId);
  if (imageIds.length === 0) {
    throw new Error("no images available");
  }
  const state = getState.get() as { current_index: number; current_random_index: number };
  const nextIndex = (state.current_index + 1) % imageIds.length;
  setCurrentIndex.run({ $currentIndex: nextIndex });
  return loadByImageId(imageIds[nextIndex]!);
}

export async function getPrevImage(): Promise<ArrayBuffer> {
  const folderId = await ensureImagesIndexed();
  const imageIds = getImageIds(folderId);
  if (imageIds.length === 0) {
    throw new Error("no images available");
  }
  const state = getState.get() as { current_index: number; current_random_index: number };
  const prevIndex = (state.current_index - 1 + imageIds.length) % imageIds.length;
  setCurrentIndex.run({ $currentIndex: prevIndex });
  return loadByImageId(imageIds[prevIndex]!);
}

export function getRandomHistoryAndPointer(): { history: string[]; currentIndex: number } {
  const rows = getRandomHistory.all() as { path: string }[];
  const pointer = getCurrentRandomIndex.get() as { current_random_index: number };
  return { history: rows.map(r => r.path), currentIndex: pointer.current_random_index };
}

export function setCurrentFolderByPath(path: string): number {
  insertFolder.run({ $path: path, $addedAt: new Date().toISOString() });
  const row = getFolderIdByPath.get(path) as { id: number } | null;
  if (!row) {
    throw new Error("no such folderId")
  }
  setCurrentFolderId.run({ $id: row.id });
  return row.id;
}

export function getCurrentFolderIdAndPath(): { id: number; path: string } | null {
 const current = getCurrentFolderId.get() as { current_folderId: number | null } | null;
 if (!current?.current_folderId) return null;

 const row = getFolderPathById.get(current.current_folderId) as { path: string} | null;
 if (!row) return null;

 return { id: current.current_folderId, path: row.path };
}

export function getFolderHistory(): Array<{ id: number; path: string; added_at: string }> {
  return getFolderHistoryQuery.all() as Array<{ id: number; path: string; added_at: string }>;
}

export function getNextFolder(): { id: number; path: string } | null {
  const history = getFolderHistory();
  if (history.length === 0) return null;

  const current = getCurrentFolderId.get() as { current_folderId: number | null } | null;
  const currentId = current?.current_folderId ?? null;

  if (currentId == null) {
    const oldest = history[history.length - 1]!;
    setCurrentFolderId.run({ $id: oldest.id });
    console.log("our history is over");
    return oldest;
  }

  const idx = history.findIndex((f) => f.id === currentId);
  const next = idx <= 0 ? history[history.length - 1]! : history[idx - 1]!;
  setCurrentFolderId.run({ $id: next.id });
  return next;
}

export function getPrevFolder(): { id: number; path: string } | null {
  const history = getFolderHistory();
  if (history.length === 0) return null;

  const current = getCurrentFolderId.get() as { current_folderId: number | null } | null;
  const currentId = current?.current_folderId ?? null;

  if (currentId == null) {
    const newest = history[0]!;
    setCurrentFolderId.run({ $id: newest.id });
    console.log("circling");
    return newest;
  }

  const idx = history.findIndex((f) => f.id === currentId);
  const prev = idx < 0 || idx >= history.length - 1 ? history[0]! : history[idx + 1]!;
  setCurrentFolderId.run({ $id: prev.id });
  return prev;
}
