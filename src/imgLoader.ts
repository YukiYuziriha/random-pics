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
                              WHERE folder_id = ?
                              `);
const insertImage = db.query(`
                               INSERT OR IGNORE INTO images (path, folder_id)
                               VALUES ($path, $folderId)
                               `);
const insertImageBatch = db.transaction((rows: Array<{ path: string; folderId: number }>) => {
  for (const row of rows) {
    insertImage.run({ $path: row.path, $folderId: row.folderId });
  }
});
const listImageIds = db.query(`
                               SELECT id FROM images
                               WHERE folder_id = ?
                               ORDER BY id
                               `);
const listImagePaths = db.query(`
                                 SELECT path FROM images
                                 WHERE folder_id = ?
                                 ORDER BY id
                                 `);
const getImagePath = db.query(`
                              SELECT path FROM images WHERE id = ?
                              `);
const setCurrentFolderIndex = db.query(`
                                        UPDATE folders
                                        SET current_index = $currentIndex
                                        WHERE id = $folderId
                                        `);
const setCurrentFolderId = db.query(`
                                     UPDATE state SET current_folder_id = $id WHERE id = 1
                                     `);
const randomHistoryCount = db.query(`
                                     SELECT COUNT(*) AS count
                                     FROM random_history
                                     WHERE folder_id = ?
                                     `);
const randomHistoryMaxIndex = db.query(`
                                        SELECT COALESCE(MAX(order_index), -1) AS max_index
                                        FROM random_history
                                        WHERE folder_id = ?
                                        `);
const randomHistoryAt = db.query(`
                                  SELECT image_id
                                  FROM random_history
                                  WHERE folder_id = ? AND order_index = ?
                                  `);
const randomHistoryInsert = db.query(`
                                      INSERT INTO random_history (folder_id, order_index, image_id)
                                      VALUES ($folderId, $orderIndex, $imageId)
                                      `);
const lapCount = db.query(`SELECT COUNT(*) AS count FROM current_lap WHERE folder_id = ?`);
const lapHas = db.query(`SELECT 1 FROM current_lap WHERE folder_id = ? AND image_id = ? LIMIT 1`);
const lapInsert = db.query(`INSERT OR IGNORE INTO current_lap (folder_id, image_id) VALUES ($folderId, $imageId)`);
const lapClear = db.query(`DELETE FROM current_lap WHERE folder_id = ?`);
const getRandomHistory = db.query(`
                                  SELECT rh.order_index, i.path
                                  FROM random_history rh
                                  JOIN images i ON i.id = rh.image_id
                                  WHERE rh.folder_id = ?
                                  ORDER BY rh.order_index
                                  `);
const getCurrentFolderIndex = db.query(`
                                        SELECT current_index
                                        FROM folders
                                        WHERE id = ?
                                        `);
const getCurrentFolderRandomIndex = db.query(`
                                              SELECT current_random_index
                                              FROM folders
                                              WHERE id = ?
                                              `);
const setCurrentFolderRandomIndex = db.query(`
                                              UPDATE folders
                                              SET current_random_index = $currentRandomIndex
                                              WHERE id = $folderId
                                              `);
const getCurrentFolderId= db.query(`
                                   SELECT current_folder_id FROM state WHERE id = 1
                                   `);
const getFolderPathById = db.query(`
                                   SELECT path FROM folders WHERE id = ?
                                   `);
const getFolderHistoryQuery = db.query(`
                                        SELECT id, path, added_at
                                        FROM folders
                                        ORDER BY added_at DESC
                                        `);
const deleteImagesByFolderId = db.query(`
                                         DELETE FROM images
                                         WHERE folder_id = ?
                                         `);

function randomHistoryShiftUpSafe(folderId: number): void {
  db.run("BEGIN");
  db.run("UPDATE random_history SET order_index = order_index + 1000000000 WHERE folder_id = ?", [folderId]);
  db.run("UPDATE random_history SET order_index = order_index - 999999999 WHERE folder_id = ?", [folderId]);
  db.run("COMMIT");
}

function getCurrentNormalHistoryIndex(folderId: number): number {
  const row = getCurrentFolderIndex.get(folderId) as { current_index: number } | null;
  return row?.current_index ?? -1;
}

function getCurrentRandomHistoryIndex(folderId: number): number {
  const row = getCurrentFolderRandomIndex.get(folderId) as { current_random_index: number } | null;
  return row?.current_random_index ?? -1;
}

function getRandomHistoryImageIdAt(folderId: number, index: number): number | null {
  if (index < 0) return null;
  const row = randomHistoryAt.get(folderId, index) as { image_id: number } | null;
  return row ? row.image_id : null;
}

function appendRandomHistory(folderId: number, imageId: number): number {
  const maxRow = randomHistoryMaxIndex.get(folderId) as { max_index: number };
  const nextIndex = maxRow.max_index + 1;
  randomHistoryInsert.run({ $folderId: folderId, $orderIndex: nextIndex, $imageId: imageId });
  return nextIndex;
}

function prependRandomHistory(folderId: number, imageId: number): number {
  randomHistoryShiftUpSafe(folderId);
  randomHistoryInsert.run({ $folderId: folderId, $orderIndex: 0, $imageId: imageId });
  return 0;
}

function setCurrentNormalHistoryIndex(folderId: number, index: number): void {
  setCurrentFolderIndex.run({ $folderId: folderId, $currentIndex: index });
}

function setCurrentRandomHistoryIndex(folderId: number, index: number): void {
  setCurrentFolderRandomIndex.run({ $folderId: folderId, $currentRandomIndex: index });
}

function clearRandomHistory(folderId: number): void {
  db.run("DELETE FROM random_history WHERE folder_id = ?", [folderId]);
  setCurrentRandomHistoryIndex(folderId, -1);
}

function clearLap(folderId: number): void {
  lapClear.run(folderId);
}

function addToLap(folderId: number, imageId: number): void {
  lapInsert.run({ $folderId: folderId, $imageId: imageId });
}

function lapHasImage(folderId: number, imageId: number): boolean {
  return Boolean(lapHas.get(folderId, imageId));
}

function ensureLapCapacity(folderId: number, totalImages: number): void {
  const lapRow = lapCount.get(folderId) as { count: number };
  if (lapRow.count >= totalImages) {
    lapClear.run(folderId);
  }
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

  const rows: Array<{ path: string; folderId: number }> = [];
  for await (const file of glob.scan({
    cwd: folderPath,
    onlyFiles: true,
    absolute: true,
  })) {
    rows.push({ path: file, folderId: folderId });
  }

  if (rows.length > 0) {
    insertImageBatch(rows);
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
  const folderId = await ensureImagesIndexed();

  const countRow = randomHistoryCount.get(folderId) as { count: number };
  if (countRow.count === 0) {
    return getForceRandomImage(true);
  }

  const currentIndex = getCurrentRandomHistoryIndex(folderId);
  if (currentIndex < countRow.count - 1) {
    const nextIndex = currentIndex + 1;
    const imageId = getRandomHistoryImageIdAt(folderId, nextIndex);
    if (!imageId) {
      return getForceRandomImage(true);
    }
    setCurrentRandomHistoryIndex(folderId, nextIndex);
    return loadByImageId(imageId);
  }

  return getForceRandomImage(true);
}

export async function getPrevRandomImage(): Promise<ArrayBuffer> {
  const folderId = await ensureImagesIndexed();

  const countRow = randomHistoryCount.get(folderId) as { count: number };
  if (countRow.count === 0) {
    return getForceRandomImage(true);
  }

  const currentIndex = getCurrentRandomHistoryIndex(folderId);
  if (currentIndex > 0) {
    const prevIndex = currentIndex - 1;
    const imageId = getRandomHistoryImageIdAt(folderId, prevIndex);
    if (!imageId) {
      return getForceRandomImage(true);
    }
    setCurrentRandomHistoryIndex(folderId, prevIndex);
    return loadByImageId(imageId);
  }

  if (currentIndex === 0) {
    return getForceRandomImage(false);
  }

  const imageId = getRandomHistoryImageIdAt(folderId, currentIndex);
  if (!imageId) {
    return getForceRandomImage(true);
  }
  return loadByImageId(imageId);
}

export async function getForceRandomImage(forcePointerToLast: boolean = true): Promise<ArrayBuffer> {
  const folderId = await ensureImagesIndexed();
  const imageIds = getImageIds(folderId);
  if (imageIds.length === 0) {
    throw new Error("no images available");
  }
  ensureLapCapacity(folderId, imageIds.length);
  let imageId = imageIds[Math.floor(Math.random() * imageIds.length)]!;
  while (lapHasImage(folderId, imageId)) {
    imageId = imageIds[Math.floor(Math.random() * imageIds.length)]!;
  }
  addToLap(folderId, imageId);
  if (forcePointerToLast) {
    const nextIndex = appendRandomHistory(folderId, imageId);
    setCurrentRandomHistoryIndex(folderId, nextIndex);
  } else {
    const nextIndex = prependRandomHistory(folderId, imageId);
    setCurrentRandomHistoryIndex(folderId, nextIndex);
  }
  return loadByImageId(imageId);
}

export async function getNextImage(): Promise<ArrayBuffer> {
  const folderId = await ensureImagesIndexed();
  const imageIds = getImageIds(folderId);
  if (imageIds.length === 0) {
    throw new Error("no images available");
  }

  const currentIndex = getCurrentNormalHistoryIndex(folderId);
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + 1) % imageIds.length;
  setCurrentNormalHistoryIndex(folderId, nextIndex);
  return loadByImageId(imageIds[nextIndex]!);
}

export async function getPrevImage(): Promise<ArrayBuffer> {
  const folderId = await ensureImagesIndexed();
  const imageIds = getImageIds(folderId);
  if (imageIds.length === 0) {
    throw new Error("no images available");
  }

  const currentIndex = getCurrentNormalHistoryIndex(folderId);
  const prevIndex = currentIndex < 0
    ? imageIds.length - 1
    : (currentIndex - 1 + imageIds.length) % imageIds.length;
  setCurrentNormalHistoryIndex(folderId, prevIndex);
  return loadByImageId(imageIds[prevIndex]!);
}

export async function getCurrentImageOrFirst(): Promise<ArrayBuffer> {
  const folderId = await ensureImagesIndexed();
  const imageIds = getImageIds(folderId);
  if (imageIds.length === 0) {
    throw new Error("no images available");
  }

  let index = getCurrentNormalHistoryIndex(folderId);
  if (index < 0 || index >= imageIds.length) {
    index = 0;
  }
  setCurrentNormalHistoryIndex(folderId, index);
  return loadByImageId(imageIds[index]!);
}

export function getRandomHistoryAndPointer(): { history: string[]; currentIndex: number } {
  const current = getCurrentFolderIdAndPath();
  if (!current) return { history: [], currentIndex: -1 };

  const rows = getRandomHistory.all(current.id) as { path: string }[];
  const pointer = getCurrentRandomHistoryIndex(current.id);
  return { history: rows.map(r => r.path), currentIndex: pointer };
}

export function getNormalHistoryAndPointer(): { history: string[]; currentIndex: number } {
  const current = getCurrentFolderIdAndPath();
  if (!current) return { history: [], currentIndex: -1 };

  const rows = listImagePaths.all(current.id) as { path: string }[];
  const pointer = getCurrentNormalHistoryIndex(current.id);
  return { history: rows.map(r => r.path), currentIndex: pointer };
}

export async function reindexCurrentFolder(): Promise<{ id: number; path: string }> {
  const current = getCurrentFolderIdAndPath();
  if (!current) {
    throw new Error("no current folder set");
  }
  deleteImagesByFolderId.run(current.id);
  clearLap(current.id);
  clearRandomHistory(current.id);
  setCurrentNormalHistoryIndex(current.id, -1);
  await ensureImagesIndexed();
  return current;
}

export function resetRandomHistory(): void {
  const current = getCurrentFolderIdAndPath();
  if (!current) return;
  clearRandomHistory(current.id);
  clearLap(current.id);
}

export function resetNormalHistory(): void {
  const current = getCurrentFolderIdAndPath();
  if (!current) return;
  setCurrentNormalHistoryIndex(current.id, -1);
}

export function fullWipe(): void {
  db.run("DELETE FROM folders");
  db.run("DELETE FROM images");
  db.run("DELETE FROM random_history");
  db.run("DELETE FROM current_lap");
  setCurrentFolderId.run({ $id: null });
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

export async function setCurrentFolderAndIndexIt(path: string): Promise<{ id: number; path: string }> {
  const id = setCurrentFolderByPath(path);
  await ensureImagesIndexed();
  return { id, path };
}

export function getCurrentFolderIdAndPath(): { id: number; path: string } | null {
 const current = getCurrentFolderId.get() as { current_folder_id: number | null } | null;
 if (!current?.current_folder_id) return null;

 const row = getFolderPathById.get(current.current_folder_id) as { path: string} | null;
 if (!row) return null;

 return { id: current.current_folder_id, path: row.path };
}

export function getFolderHistory(): Array<{ id: number; path: string; added_at: string }> {
  return getFolderHistoryQuery.all() as Array<{ id: number; path: string; added_at: string }>;
}

export function getNextFolder(): { id: number; path: string } | null {
  const history = getFolderHistory();
  if (history.length === 0) return null;

  const current = getCurrentFolderId.get() as { current_folder_id: number | null } | null;
  const currentId = current?.current_folder_id ?? null;

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

  const current = getCurrentFolderId.get() as { current_folder_id: number | null } | null;
  const currentId = current?.current_folder_id ?? null;

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
