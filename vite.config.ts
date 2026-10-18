import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/mobile-roguelite/",
  build: {
    target: "es2020",
    sourcemap: false,
    rollupOptions: {
      // Two games share one Pages site: the roguelite at / and «Не клюёт» at /fishing/.
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        fishing: fileURLToPath(new URL("./fishing/index.html", import.meta.url)),
      },
      output: { manualChunks: { phaser: ["phaser"], three: ["three"] } },
    },
  },
});
