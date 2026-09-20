import { defineConfig } from "vite";

export default defineConfig({
  base: "/mobile-roguelite/",
  build: {
    target: "es2020",
    sourcemap: false,
    rollupOptions: { output: { manualChunks: { phaser: ["phaser"] } } },
  },
});
