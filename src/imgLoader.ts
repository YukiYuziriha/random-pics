import { join } from "deno.land";
import { userHomeDir } from "@std/os";

const dirPath = join(await userHomeDir(), "Downloads");

for await (const entry of Deno.readDir(dirPath)) {
  if (entry.isFile && /\.(jpg|jpeg|png|webp|gif)$/i.test(entry.name)) {
    console.log(`Found image: ${entry.name}`);

  }
}
