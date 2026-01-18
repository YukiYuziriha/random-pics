import index from "./index.html";

const PORT: number = 3000

Bun.serve({
  port: PORT,
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
  }
});

console.log(`server is running at port ${PORT}`)
