import { Glob } from "bun";

const paths: string[] = [];
const visitedRandomIndexes: number[] = [];
let currentIndex: number = 0;
let initialized: boolean = false;

const dirPath = "/mnt/ssd/refs/800 Rebel Girl Fighter"

async function initializePathsToImages(): Promise<void> {
  if (initialized) return;

  const glob = new Glob("**/*.{jpeg,jpg,png,gif,webp}");

  for await (const file of glob.scan({
    cwd: dirPath,
    onlyFiles: true,
    absolute: true,
  })) {
    paths.push(file);
  }

  if (paths.length === 0) {
    console.log("no bitches");
    throw new Error("no images available");
  }

  initialized = true;
}

async function loadAtIndex(index: number): Promise<ArrayBuffer> {
  const filePath = paths[index]!;
  const data = await Bun.file(filePath).arrayBuffer();
  console.log(`loaded ${filePath} (${(data.byteLength/1024/1024).toFixed(2)} Mbytes)`);
  return data;
}

export async function getRandomImage(): Promise<ArrayBuffer> {
  await initializePathsToImages();
  if (visitedRandomIndexes.length >= paths.length) {
    console.log("new lap")
    visitedRandomIndexes.length = 0;
  }
  currentIndex = Math.floor(Math.random() * paths.length);

  while (visitedRandomIndexes.includes(currentIndex)) {
    currentIndex = Math.floor(Math.random() * paths.length);
  }
  visitedRandomIndexes.push(currentIndex);
  return loadAtIndex(currentIndex);
}

export async function getNextImage(): Promise<ArrayBuffer> {
  await initializePathsToImages();
  currentIndex = (currentIndex + 1) % paths.length;
  return loadAtIndex(currentIndex);
}

export async function getPrevImage(): Promise<ArrayBuffer> {
  await initializePathsToImages();
  currentIndex = (currentIndex - 1 + paths.length) % paths.length;
  return loadAtIndex(currentIndex);
}
