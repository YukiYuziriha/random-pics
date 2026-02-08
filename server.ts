import { getNextRandomImage, getNextImage, getPrevImage, getPrevRandomImage, getForceRandomImage, getCurrentImageOrFirst, getRandomHistoryAndPointer, getNormalHistoryAndPointer, getNextFolder, getPrevFolder, getCurrentFolderIdAndPath, getFolderHistory, setCurrentFolderAndIndexIt, reindexCurrentFolder, resetRandomHistory, resetNormalHistory, fullWipe, getImageState, setImageState } from "./src/imgLoader.ts";
import { API_PREFIX, NEXT_RANDOM_ENDPOINT, PREV_RANDOM_ENDPOINT, FORCE_RANDOM_ENDPOINT, NEXT_ENDPOINT, PREV_ENDPOINT, CURRENT_IMAGE_ENDPOINT, RANDOM_HISTORY_ENDPOINT, NORMAL_HISTORY_ENDPOINT, NEXT_FOLDER_ENDPOINT, PREV_FOLDER_ENDPOINT, FOLDER_HISTORY_ENDPOINT, PICK_FOLDER_ENDPOINT, REINDEX_CURRENT_FOLDER_ENDPOINT, RESET_RANDOM_HISTORY_ENDPOINT, RESET_NORMAL_HISTORY_ENDPOINT, FULL_WIPE_ENDPOINT, STATE_ENDPOINT } from "./src/constants/endpoints.ts";
import { resolve } from "node:path";

const PORT: number = 3000;
const INDEX_FILE = resolve(process.cwd(), process.env.RANDOM_PICS_INDEX_FILE ?? "./index.html");
const FRONTEND_DIR = resolve(process.cwd(), process.env.RANDOM_PICS_FRONTEND_DIR ?? "./dist");
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

    if (req.url.endsWith(`${API_PREFIX}${CURRENT_IMAGE_ENDPOINT}`)) {
      const imageBuffer = await getCurrentImageOrFirst();
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

    if (req.url.endsWith(`${API_PREFIX}${NORMAL_HISTORY_ENDPOINT}`)) {
      const history = getNormalHistoryAndPointer();
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
      const file = Bun.file(INDEX_FILE);
      if (!(await file.exists())) return new Response("missing index", { status: 500 });
      return new Response(file, {
        headers: { "Content-Type": "text/html" }
      });
    }

    if (path.startsWith("/dist/")) {
      const relativePath = path.slice("/dist/".length);
      const file = Bun.file(resolve(FRONTEND_DIR, relativePath));
      if (!(await file.exists())) return new Response("missing asset", { status: 404 });
      return new Response(file);
    }

    if (req.url.endsWith(`${API_PREFIX}${PREV_FOLDER_ENDPOINT}`)) {
      const folder = getPrevFolder();
      if (!folder) {
        return new Response("no bitches", { status: 404 });
      }
      return new Response(JSON.stringify(folder), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (req.url.endsWith(`${API_PREFIX}${FOLDER_HISTORY_ENDPOINT}`)) {
      const history = getFolderHistory();
      const current = getCurrentFolderIdAndPath();
      const currentIndex = current
        ? history.findIndex((h) => h.id === current.id)
        : -1;
      return new Response(
        JSON.stringify({
          history: history.map((h) => h.path),
          currentIndex,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (req.method === "POST" && req.url.endsWith(`${API_PREFIX}${PICK_FOLDER_ENDPOINT}`)) {
      const body = await req.json();
      const folderPath = body?.path;
      if (!folderPath) {
        return new Response("missing path", { status: 400 });
      }
      const folder = await setCurrentFolderAndIndexIt(folderPath);
      return new Response(JSON.stringify(folder), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && req.url.endsWith(`${API_PREFIX}${REINDEX_CURRENT_FOLDER_ENDPOINT}`)) {
      const folder = await reindexCurrentFolder();
      return new Response(JSON.stringify(folder), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && req.url.endsWith(`${API_PREFIX}${RESET_RANDOM_HISTORY_ENDPOINT}`)) {
      resetRandomHistory();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && req.url.endsWith(`${API_PREFIX}${RESET_NORMAL_HISTORY_ENDPOINT}`)) {
      resetNormalHistory();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && req.url.endsWith(`${API_PREFIX}${FULL_WIPE_ENDPOINT}`)) {
      fullWipe();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (req.url.endsWith(`${API_PREFIX}${STATE_ENDPOINT}`)) {
      if (req.method === "POST") {
        const body = await req.json();
        setImageState({
          verticalMirror: Boolean(body?.verticalMirror),
          horizontalMirror: Boolean(body?.horizontalMirror),
          greyscale: Boolean(body?.greyscale),
          timerFlowMode: body?.timerFlowMode === 'normal' ? 'normal' : 'random',
          showFolderHistoryPanel: Boolean(body?.showFolderHistoryPanel),
          showTopControls: Boolean(body?.showTopControls),
          showImageHistoryPanel: Boolean(body?.showImageHistoryPanel),
          showBottomControls: Boolean(body?.showBottomControls),
          isFullscreenImage: Boolean(body?.isFullscreenImage),
        });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const state = getImageState();
      return new Response(JSON.stringify(state), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("no bitches", { status: 404 });

  },
  development: {
    hmr: true,
  }
});

console.log(`server is running at port ${PORT}`)
