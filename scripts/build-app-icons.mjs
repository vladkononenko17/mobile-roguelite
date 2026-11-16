// Renders the Dustline app icons (home screen / install): public/app/icon-512.png, icon-192.png,
// icon-maskable-512.png (full-bleed, the mark inside the safe zone) and apple-touch-icon.png (180).
// The mark: a cream "D" (Barlow Condensed 800, the game's type) over a night road with the amber
// double line. Drawn here, no third-party art.
//   node scripts/build-app-icons.mjs
// Uses the preinstalled Playwright Chromium.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright")); }

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/app");
fs.mkdirSync(OUT, { recursive: true });
const font = fs.readFileSync(path.join(ROOT, "node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2")).toString("base64");

/** `scale`: the size of the letter (maskable icons keep it inside the safe zone); the road is always full-bleed. */
const page = (size, { round, scale }) => `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: "BC"; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 800; }
html, body { margin: 0; background: transparent; }
.icon { position: relative; width: ${size}px; height: ${size}px; overflow: hidden; border-radius: ${round ? size * 0.22 : 0}px;
  background: radial-gradient(ellipse 90% 70% at 50% 34%, #4a3418 0%, #20160d 55%, #0d0a08 100%); }
.mark { position: absolute; inset: 0; transform: scale(${scale}); transform-origin: 50% 48%; }
svg { position: absolute; inset: 0; }
.d { position: absolute; left: 0; right: 0; top: ${size * 0.045}px; text-align: center; font: 800 ${size * 0.74}px/1 "BC", sans-serif; letter-spacing: 0;
  background: linear-gradient(180deg, #fff6e2 18%, #cdb78f 82%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 ${size * 0.022}px 0 rgba(0, 0, 0, 0.65)) drop-shadow(0 0 ${size * 0.06}px rgba(214, 162, 60, 0.35)); }
</style><div class="icon">
<svg viewBox="0 0 100 100">
  <defs><linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2723" stop-opacity="0"/><stop offset="0.35" stop-color="#2b2723"/><stop offset="1" stop-color="#3a352f"/></linearGradient>
  <linearGradient id="line" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6a23c" stop-opacity="0"/><stop offset="0.3" stop-color="#d6a23c"/><stop offset="1" stop-color="#f2c14e"/></linearGradient></defs>
  <polygon points="40,52 60,52 96,104 4,104" fill="url(#road)"/>
  <polygon points="48.6,56 49.5,56 47.6,104 43.6,104" fill="url(#line)"/>
  <polygon points="50.5,56 51.4,56 56.4,104 52.4,104" fill="url(#line)"/>
</svg>
<div class="mark"><div class="d">D</div></div>
</div>`;

const browser = await playwright.chromium.launch();
const shoot = async (file, size, options) => {
  const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(page(size, options));
  await p.evaluate(() => document.fonts.ready);
  await p.locator(".icon").screenshot({ path: path.join(OUT, file), omitBackground: true });
  await p.close();
  console.log(file, fs.statSync(path.join(OUT, file)).size);
};
await shoot("icon-512.png", 512, { round: true, scale: 1 });
await shoot("icon-192.png", 192, { round: true, scale: 1 });
// Maskable: square, full-bleed background; the launcher crops it (circle, squircle), so the mark is smaller.
await shoot("icon-maskable-512.png", 512, { round: false, scale: 0.78 });
// iOS rounds the corners itself and does not want transparency.
await shoot("apple-touch-icon.png", 180, { round: false, scale: 0.92 });
await browser.close();
