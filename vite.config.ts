import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/mobile-roguelite/",
  build: {
    target: "es2020",
    sourcemap: false,
    rollupOptions: {
      // Three games share one Pages site: the roguelite at /, «Не клюёт» at /fishing/, «Розшук» at /rozshuk/, «Чотири стіни» at /stiny/, «Тікай!» at /tikai/, «Ставка» at /stavka/, «З гірки!» at /zhirky/.
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        fishing: fileURLToPath(new URL("./fishing/index.html", import.meta.url)),
        rozshuk: fileURLToPath(new URL("./rozshuk/index.html", import.meta.url)),
        stiny: fileURLToPath(new URL("./stiny/index.html", import.meta.url)),
        tikai: fileURLToPath(new URL("./tikai/index.html", import.meta.url)),
        stavka: fileURLToPath(new URL("./stavka/index.html", import.meta.url)),
        zhirky: fileURLToPath(new URL("./zhirky/index.html", import.meta.url)),
        hata: fileURLToPath(new URL("./hata/index.html", import.meta.url)),
        // PlayCanvas 3D game (Wasteland / Station ORION / Hell) at /playcanvas.html, as before.
        playcanvas: fileURLToPath(new URL("./playcanvas.html", import.meta.url)),
      },
      output: { manualChunks: { phaser: ["phaser"], three: ["three"] } },
    },
  },
});
