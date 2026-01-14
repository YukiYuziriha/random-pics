import { readdir } from "node:fs/promises";
import { join } from "node:path";

const dirPath = "/mnt/ssd/refs/800 Rebel Girl Fighter/Spear";

const files = await readdir(dirPath);
const images = [];

for (const file of files) {
  if (/\.(jpg|jpeg|png|webp|gif)$/i.test(file)) {
    
    console.log(`image ${file}`); //just list images
    
    const pathToImage = `${dirPath}/${file}`;
    const buffer = await Bun.file(pathToImage).arrayBuffer();
    images.push(Buffer.from(buffer));
  }
}

