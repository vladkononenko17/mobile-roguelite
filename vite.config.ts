import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/mobile-roguelite/",
  build: {
    target: "es2020",
    sourcemap: false,
    rollupOptions: {
      input: {
        // Legacy Phaser game (gameplay reference).
        main: resolve(__dirname, "index.html"),
        // PlayCanvas 3D vertical slice.
        playcanvas: resolve(__dirname, "playcanvas.html"),
      },
      output: { manualChunks: { phaser: ["phaser"], "playcanvas-engine": ["playcanvas"] } },
    },
  },
});
