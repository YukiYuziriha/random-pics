import { getNextRandomImage, getNextImage, getPrevImage, getPrevRandomImage, getForceRandomImage, getRandomHistoryAndPointer, getNextFolder, getPrevFolder, getCurrentFolderIdAndPath, getFolderHistory, setCurrentFolderAndIndexIt } from "./src/imgLoader.ts";
import { API_PREFIX, NEXT_RANDOM_ENDPOINT, PREV_RANDOM_ENDPOINT, FORCE_RANDOM_ENDPOINT, NEXT_ENDPOINT, PREV_ENDPOINT, RANDOM_HISTORY_ENDPOINT, NEXT_FOLDER_ENDPOINT, PREV_FOLDER_ENDPOINT, FOLDER_HISTORY_ENDPOINT, PICK_FOLDER_ENDPOINT } from "./src/constants/endpoints.ts";

const PORT: number = 3000;
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
      let indexHtml = await Bun.file("./index.html").text();
      try {
        const authInfoText = await Bun.file("./.tmp/auth_info.json").text();
        const authInfo = JSON.parse(authInfoText) as { nlPort?: number; nlToken?: string };
        if (authInfo?.nlPort && authInfo?.nlToken) {
          const inject = `<script>window.NL_PORT=${authInfo.nlPort};window.NL_TOKEN="${authInfo.nlToken}";</script>`;
          if (indexHtml.includes("</body>")) {
            indexHtml = indexHtml.replace("</body>", `${inject}</body>`);
          } else {
            indexHtml += inject;
          }
        }
      } catch {
        // ignore missing/invalid auth info
      }
      return new Response(indexHtml, {
        headers: { "Content-Type": "text/html" }
      });
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
