// Finishes the itch.io build (after `vite build -c vite.itch.config.ts`): playcanvas.html becomes
// index.html, the public/ folders the 3D game loads are copied next to it, CREDITS.md goes in as
// credits.txt, and everything is zipped to dustline-itch.zip, checked against itch.io's HTML5 limits
// (<= 1000 files, <= 500 MB, <= 200 MB per file).
//   npm run build:itch
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "dist-itch");
const ZIP = path.join(ROOT, "dustline-itch.zip");
const COPY = ["models", "textures", "audio", "menu", "ui", "licenses", "icon.svg"];

fs.renameSync(path.join(OUT, "playcanvas.html"), path.join(OUT, "index.html"));
for (const item of COPY) fs.cpSync(path.join(ROOT, "public", item), path.join(OUT, item), { recursive: true });
fs.copyFileSync(path.join(ROOT, "CREDITS.md"), path.join(OUT, "credits.txt"));

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push({ p, size: fs.statSync(p).size });
  }
};
walk(OUT);
const total = files.reduce((s, f) => s + f.size, 0);
const biggest = files.reduce((a, b) => (b.size > a.size ? b : a));
const mb = (n) => (n / 1048576).toFixed(1);
console.log(`${files.length} files, ${mb(total)} MB (largest ${path.relative(OUT, biggest.p)}, ${mb(biggest.size)} MB)`);
if (files.length > 1000 || total > 500 * 1048576 || biggest.size > 200 * 1048576) throw new Error("over itch.io's HTML5 limits");

fs.rmSync(ZIP, { force: true });
execFileSync("zip", ["-qr9", ZIP, "."], { cwd: OUT });
console.log(`wrote ${path.relative(ROOT, ZIP)} (${mb(fs.statSync(ZIP).size)} MB)`);
