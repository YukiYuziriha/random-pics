import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { exec } from "node:child_process";

const dirPath = "/mnt/ssd/refs/800 Rebel Girl Fighter/Spear";

const files = await readdir(dirPath);
const imagesAvailable = files.filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));

if (imagesAvailable.length === 0) {
  console.log("no bitches");
  throw new Error("no images available");
}

const randomImage = imagesAvailable[Math.floor(Math.random() * imagesAvailable.length)];
const randomImagePath = `${dirPath}/${randomImage}`;

const randomImageLoaded = await Bun.file(randomImagePath).arrayBuffer();
console.log(`loaded ${randomImagePath} (${(randomImageLoaded.byteLength/1024/1024).toFixed(2)} Mbytes)`);

//exec(`xdg-open "${randomImagePath}"`);

Bun.serve({
  port: 3000,
  fetch() {
    return new Response(randomImageLoaded, {
      headers: { "Content-Type": "image/jpeg" }
    });
  }
})

exec("xdg-open http://localhost:3000");
