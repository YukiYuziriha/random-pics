import { getNextRandomImage, getNextImage, getPrevImage, getPrevRandomImage, getForceRandomImage, getRandomHistoryAndPointer, getNextFolder, getPrevFolder, getCurrentFolderIdAndPath, getFolderHistory } from "./src/imgLoader.ts";
import { API_PREFIX, NEXT_RANDOM_ENDPOINT, PREV_RANDOM_ENDPOINT, FORCE_RANDOM_ENDPOINT, NEXT_ENDPOINT, PREV_ENDPOINT, RANDOM_HISTORY_ENDPOINT, NEXT_FOLDER_ENDPOINT } from "./src/constants/endpoints.ts";

const PORT: number = 3000;
const indexHtml = await Bun.file("./index.html").text();

Bun.serve({

  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.url.endsWith(`${API_PREFIX}${NEXT_RANDOM_ENDPOINT}`)) {
      const imageBuffer = await getNextRandomImage();
      return new Response(imageBuffer, {
        headers: { "Content-Type": "image/jpeg" }
      });
    }

    if (req.url.endsWith(`${API_PREFIX}${PREV_RANDOM_ENDPOINT}`)) {
      const imageBuffer = await getPrevRandomImage();
      return new Response(imageBuffer, {
        headers: { "Content-Type": "image/jpeg" }
      });
    }

    if (req.url.endsWith(`${API_PREFIX}${FORCE_RANDOM_ENDPOINT}`)) {
      const imageBuffer = await getForceRandomImage();
      return new Response(imageBuffer, {
        headers: { "Content-Type": "image/jpeg" }
      });
    }

    if (req.url.endsWith(`${API_PREFIX}${NEXT_ENDPOINT}`)) {
      const imageBuffer = await getNextImage();
      return new Response(imageBuffer, {
        headers: { "Content-Type": "image/jpeg" }
      });
    }

    if (req.url.endsWith(`${API_PREFIX}${PREV_ENDPOINT}`)) {
      const imageBuffer = await getPrevImage();
      return new Response(imageBuffer, {
        headers: { "Content-Type": "image/jpeg" }
      });
    }

    if (req.url.endsWith(`${API_PREFIX}${RANDOM_HISTORY_ENDPOINT}`)) {
      const history = getRandomHistoryAndPointer();
      return new Response(JSON.stringify(history), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (req.url.endsWith(`${API_PREFIX}${NEXT_FOLDER_ENDPOINT}`)) {
      const folder = getNextFolder();
      if (!folder) {
        return new Response("no bitches", { status: 404 });
      }
      return new Response(JSON.stringify(folder), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path === '/') {
      return new Response(indexHtml, {
        headers: { "Content-Type": "text/html" }
      });
    }

    if (path.startsWith("/dist/")) {
      const file = Bun.file("." + path);
      if (!(await file.exists())) return new Response("no bitches", { status: 404 });
      return new Response(file);
    }

    return new Response("no bitches", { status: 404 });

  },
  development: {
    hmr: true,
  }
});

console.log(`server is running at port ${PORT}`)
