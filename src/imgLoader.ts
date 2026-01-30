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
const listImageIds = db.query(`
                               SELECT id FROM images
                               WHERE folder_id = ?
                               ORDER BY id
                               `);
const getImagePath = db.query(`
                              SELECT path FROM images WHERE id = ?
                              `);
const setCurrentIndex = db.query(`
                                 UPDATE state
                                 SET current_index = $currentIndex
                                 WHERE id = 1
                                 `);
const setCurrentFolderId = db.query(`
                                     UPDATE state SET current_folder_id = $id WHERE id = 1
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
const lapCount = db.query(`SELECT COUNT(*) AS count FROM current_lap`);
const lapHas = db.query(`SELECT 1 FROM current_lap WHERE image_id = ? LIMIT 1`);
const lapInsert = db.query(`INSERT OR IGNORE INTO current_lap (image_id) VALUES ($imageId)`);
const lapClear = db.query(`DELETE FROM current_lap`);
const getRandomHistory = db.query(`
                                  SELECT rh.order_index, i.path
                                  FROM random_history rh
                                  JOIN images i ON i.id = rh.image_id
                                  ORDER BY rh.order_index
                                  `);
const getCurrentIndex = db.query(`
                                 SELECT current_index FROM state WHERE id = 1
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

function historyShiftUpSafe(): void {
  db.run("BEGIN");
  db.run("UPDATE random_history SET order_index = order_index + 1000000000");
  db.run("UPDATE random_history SET order_index = order_index - 999999999");
  db.run("COMMIT");
}

function getCurrentHistoryIndex(): number {
  const row = getCurrentIndex.get() as { current_index: number };
  return row.current_index;
}

function getHistoryImageIdAt(index: number): number | null {
  if (index < 0) return null;
  const row = historyAt.get(index) as { image_id: number } | null;
  return row ? row.image_id : null;
}

function appendHistory(imageId: number): number {
  const maxRow = historyMaxIndex.get() as { max_index: number };
  const nextIndex = maxRow.max_index + 1;
  historyInsert.run({ $orderIndex: nextIndex, $imageId: imageId });
  return nextIndex;
}

function prependHistory(imageId: number): number {
  historyShiftUpSafe();
  historyInsert.run({ $orderIndex: 0, $imageId: imageId });
  return 0;
}

function setCurrentHistoryIndex(index: number): void {
  setCurrentIndex.run({ $currentIndex: index });
}

function addToLap(imageId: number): void {
  lapInsert.run({ $imageId: imageId });
}

function lapHasImage(imageId: number): boolean {
  return Boolean(lapHas.get(imageId));
}

function ensureLapCapacity(totalImages: number): void {
  const lapRow = lapCount.get() as { count: number };
  if (lapRow.count >= totalImages) {
    lapClear.run();
  }
}

function findNonLapImage(
  imageIds: number[],
  startIndex: number,
  direction: 1 | -1,
): number | null {
  let idx = (startIndex + direction + imageIds.length) % imageIds.length;
  let attempts = 0;
  while (attempts < imageIds.length) {
    const candidateId = imageIds[idx]!;
    if (!lapHasImage(candidateId)) {
      return candidateId;
    }
    idx = (idx + direction + imageIds.length) % imageIds.length;
    attempts++;
  }
  return null;
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

  const currentIndex = getCurrentHistoryIndex();
  if (currentIndex < countRow.count - 1) {
    const nextIndex = currentIndex + 1;
    const imageId = getHistoryImageIdAt(nextIndex);
    if (!imageId) {
      return getForceRandomImage(true);
    }
    setCurrentHistoryIndex(nextIndex);
    return loadByImageId(imageId);
  }

  return getForceRandomImage(true);
}

export async function getPrevRandomImage(): Promise<ArrayBuffer> {
  await ensureImagesIndexed();

  const countRow = historyCount.get() as { count: number };
  if (countRow.count === 0) {
    return getForceRandomImage(true);
  }

  const currentIndex = getCurrentHistoryIndex();
  if (currentIndex > 0) {
    const prevIndex = currentIndex - 1;
    const imageId = getHistoryImageIdAt(prevIndex);
    if (!imageId) {
      return getForceRandomImage(true);
    }
    setCurrentHistoryIndex(prevIndex);
    return loadByImageId(imageId);
  }

  if (currentIndex === 0) {
    return getForceRandomImage(false);
  }

  const imageId = getHistoryImageIdAt(currentIndex);
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
  ensureLapCapacity(imageIds.length);
  let imageId = imageIds[Math.floor(Math.random() * imageIds.length)]!;
  while (lapHasImage(imageId)) {
    imageId = imageIds[Math.floor(Math.random() * imageIds.length)]!;
  }
  addToLap(imageId);
  if (forcePointerToLast) {
    const nextIndex = appendHistory(imageId);
    setCurrentHistoryIndex(nextIndex);
  } else {
    const nextIndex = prependHistory(imageId);
    setCurrentHistoryIndex(nextIndex);
  }
  return loadByImageId(imageId);
}

export async function getNextImage(): Promise<ArrayBuffer> {
  const folderId = await ensureImagesIndexed();
  const imageIds = getImageIds(folderId);
  if (imageIds.length === 0) {
    throw new Error("no images available");
  }

  const currentIndex = getCurrentHistoryIndex();
  const currentImageId = getHistoryImageIdAt(currentIndex);

  let startIndex = 0;
  if (currentImageId !== null) {
    const currentIdx = imageIds.indexOf(currentImageId);
    if (currentIdx >= 0) {
      startIndex = currentIdx;
    }
  }

  const candidateImageId = findNonLapImage(imageIds, startIndex, 1);
  if (candidateImageId) {
    addToLap(candidateImageId);
    const nextHistoryIndex = appendHistory(candidateImageId);
    setCurrentHistoryIndex(nextHistoryIndex);
    return loadByImageId(candidateImageId);
  }

  return getForceRandomImage(true);
}

export async function getPrevImage(): Promise<ArrayBuffer> {
  const folderId = await ensureImagesIndexed();
  const imageIds = getImageIds(folderId);
  if (imageIds.length === 0) {
    throw new Error("no images available");
  }

  const currentIndex = getCurrentHistoryIndex();
  const currentImageId = getHistoryImageIdAt(currentIndex);

  let startIndex = 0;
  if (currentImageId !== null) {
    const currentIdx = imageIds.indexOf(currentImageId);
    if (currentIdx >= 0) {
      startIndex = currentIdx;
    }
  }

  const candidateImageId = findNonLapImage(imageIds, startIndex, -1);
  if (candidateImageId) {
    addToLap(candidateImageId);
    const nextHistoryIndex = appendHistory(candidateImageId);
    setCurrentHistoryIndex(nextHistoryIndex);
    return loadByImageId(candidateImageId);
  }

  return getForceRandomImage(true);
}

export function getRandomHistoryAndPointer(): { history: string[]; currentIndex: number } {
  const rows = getRandomHistory.all() as { path: string }[];
  const pointer = getCurrentIndex.get() as { current_index: number };
  return { history: rows.map(r => r.path), currentIndex: pointer.current_index };
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
