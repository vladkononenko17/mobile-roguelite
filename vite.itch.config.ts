import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * itch.io / web-portal build of the 3D game alone (npm run build:itch): relative asset paths (the
 * game is served from an iframe under an unknown path), only the PlayCanvas entry, no public/ copy
 * (scripts/package-itch.mjs copies just the folders the 3D game loads, then zips dist-itch/).
 */
export default defineConfig({
  base: "./",
  publicDir: false,
  build: {
    target: "es2020",
    sourcemap: false,
    outDir: "dist-itch",
    emptyOutDir: true,
    rollupOptions: {
      input: { playcanvas: fileURLToPath(new URL("./playcanvas.html", import.meta.url)) },
    },
  },
});
