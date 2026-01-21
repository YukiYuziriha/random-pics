import { getNextRandomImage, getNextImage, getPrevImage, getPrevRandomImage, getForceRandomImage } from "./src/imgLoader.ts";
import { NEXT_RANDOM_ENDPOINT, PREV_RANDOM_ENDPOINT, FORCE_RANDOM_ENDPOINT, NEXT_ENDPOINT, PREV_ENDPOINT } from "./src/constants/endpoints.ts";

const PORT: number = 3000
const indexHtml = await Bun.file("./index.html").text();

Bun.serve({

  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.url.endsWith(`/api/${NEXT_RANDOM_ENDPOINT}`)) {
      const imageBuffer = await getNextRandomImage();
      return new Response(imageBuffer, {
        headers: { "Content-Type": "image/jpeg" }
      });
    }

    if (req.url.endsWith(`/api/${PREV_RANDOM_ENDPOINT}`)) {
      const imageBuffer = await getPrevRandomImage();
      return new Response(imageBuffer, {
        headers: { "Content-Type": "image/jpeg" }
      });
    }

    if (req.url.endsWith(`/api/${FORCE_RANDOM_ENDPOINT}`)) {
      const imageBuffer = await getForceRandomImage();
      return new Response(imageBuffer, {
        headers: { "Content-Type": "image/jpeg" }
      });
    }

    if (req.url.endsWith(`/api/${NEXT_ENDPOINT}`)) {
      const imageBuffer = await getNextImage();
      return new Response(imageBuffer, {
        headers: { "Content-Type": "image/jpeg" }
      });
    }

    if (req.url.endsWith(`/api/${PREV_ENDPOINT}`)) {
      const imageBuffer = await getPrevImage();
      return new Response(imageBuffer, {
        headers: { "Content-Type": "image/jpeg" }
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
