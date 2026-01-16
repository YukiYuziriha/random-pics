import { readdir } from "node:fs/promises";
import { Glob } from "bun";
import { exec } from "node:child_process";

const glob = new Glob("**/*.{jpeg,jpg,png,gif,webp}");
const imagesAvailable: string[] = [];

const dirPath = "/mnt/ssd/refs/800 Rebel Girl Fighter"

for await (const file of glob.scan({
  cwd: dirPath,
  onlyFiles: true,
  absolute: true,
})) {
  imagesAvailable.push(file);
}

if (imagesAvailable.length === 0) {
  console.log("no bitches");
  throw new Error("no images available");
}

const randomImage = imagesAvailable[Math.floor(Math.random() * imagesAvailable.length)];
const randomImagePath = randomImage;

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
