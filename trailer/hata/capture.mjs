// Frame-by-frame capture of the real game for the trailer.
//
//   node capture.mjs [shot names…]          (all shots in shots.mjs when none given)
//
// The game runs in headless Chromium in its offline "still" mode: nothing runs
// on its own, each frame advances the simulation by a fixed step through the
// game's own update loop (window.__hata.simulate), then the frame is read back.
// That makes the footage deterministic and smooth no matter how slowly the
// software GPU renders. Frames land in clips/<shot>/0001.jpg…
//
// Needs the dev server of this branch: (repo root) npx vite --port 5173
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { lib, shots, W, H } from "./shots.mjs";

const want = process.argv.slice(2);
const list = want.length ? shots.filter((s) => want.includes(s.name)) : shots;
const GAME = process.env.GAME_URL ?? "http://localhost:5173/mobile-roguelite/hata/";

const b = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  headless: true,
  protocolTimeout: 3_600_000,
});
const pg = await b.newPage();
// a phone held upright, retina text for the HUD; the 3D renders at 1× (see dpr below)
await pg.setViewport({ width: W, height: H, deviceScaleFactor: 1.5 });
pg.on("pageerror", (e) => console.log("pageerror", e.message));
pg.on("console", (m) => { if (m.type() === "error") console.log("console", m.text().slice(0, 200)); });
await pg.evaluateOnNewDocument(() => localStorage.clear());
const t0 = Date.now();
await pg.goto(`${GAME}?still=1&dpr=1&q=medium`, { waitUntil: "load", timeout: 600_000 });
await pg.waitForFunction("window.__hata && (window.__hata.ready || window.__hata.error)", { timeout: 1_800_000, polling: 1000 });
// the game asks to turn the phone sideways; the trailer is filmed upright
await pg.addStyleTag({ content: "#rotate,#joyhint{display:none!important}" });
await pg.evaluate(() => { window.__hata.play(); window.__hata.simulate(0.2, false); });
await pg.evaluate(lib);
// STRIDE=n: preview — simulate every frame, but only save every n-th (and the last)
const STRIDE = Number(process.env.STRIDE ?? 1);
console.log("loaded", Math.round((Date.now() - t0) / 1000) + "s");

for (const s of list) {
  const dir = new URL(`./clips/${s.name}/`, import.meta.url).pathname;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const t1 = Date.now();
  if (s.setup) await pg.evaluate(s.setup);
  for (let i = 0; i < s.frames; i++) {
    await pg.evaluate(s.frame, i, s.frames);
    if (STRIDE > 1 && i % STRIDE !== 0 && i !== s.frames - 1) continue;
    const file = `${dir}${String(i + 1).padStart(4, "0")}.jpg`;
    if (s.mode === "page") {
      await pg.evaluate(() => window.__hata.capture()); // draws the frame into the canvas
      await pg.screenshot({ path: file, type: "jpeg", quality: 92 });
    } else {
      const url = await pg.evaluate(() => window.__hata.capture());
      writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
    }
  }
  if (s.after) await pg.evaluate(s.after);
  console.log("shot", s.name, s.frames, "frames", Math.round((Date.now() - t1) / 1000) + "s");
}
await b.close();
