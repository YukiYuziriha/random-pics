import { readdir } from "node:fs/promises";
import { Glob } from "bun";
import { exec } from "node:child_process";

export async function getRandomImage() {
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

  const randomImage = imagesAvailable[Math.floor(Math.random() * imagesAvailable.length)]!;

  const randomImageLoaded = await Bun.file(randomImage).arrayBuffer();

  console.log(`loaded ${randomImage} (${(randomImageLoaded.byteLength/1024/1024).toFixed(2)} Mbytes)`);

  return randomImageLoaded;
}
//exec(`xdg-open "${randomImage}"`);


