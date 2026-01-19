import { getRandomImage } from "./src/imgLoader.ts";

const PORT: number = 3000
const indexHtml = await Bun.file("./index.html").text();

Bun.serve({

  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.url.endsWith('/api/random')) {
      const imageBuffer = await getRandomImage();
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
