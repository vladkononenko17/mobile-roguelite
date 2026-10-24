// Renders the 540 output frames through compose.html and encodes the videos.
//
//   python3 audio.py && node compose.mjs        → out/klin-klinych-trailer-vertical.mp4
//                                                 out/klin-klinych-trailer-horizontal.mp4
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { createServer } from "node:http";
import { readFileSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const edit = JSON.parse(readFileSync(join(HERE, "edit.json"), "utf8"));
const ONLY = process.env.FRAMES ? process.env.FRAMES.split(",").map(Number) : null; // preview a few frames

// a tiny static server, so the canvas may read the clip images back
const types = { ".html": "text/html; charset=utf-8", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".json": "application/json" };
const server = createServer((req, res) => {
  const p = join(HERE, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(HERE) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(5199, r));

const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true, protocolTimeout: 600000 });
const pg = await b.newPage();
await pg.setViewport({ width: 1080, height: 1920 });
pg.on("pageerror", (e) => console.log("pageerror", e.message));
await pg.goto("http://localhost:5199/compose.html", { waitUntil: "load" });
await pg.evaluate(async (e) => { await window.ready; window.setEdit(e); }, edit);

const dir = join(OUT, ONLY ? "preview" : "frames");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const list = ONLY ?? Array.from({ length: edit.frames }, (_, i) => i);
const t0 = Date.now();
for (const f of list) {
  const url = await pg.evaluate((n) => window.renderFrame(n), f);
  writeFileSync(join(dir, `${String(f + 1).padStart(4, "0")}.jpg`), Buffer.from(url.split(",")[1], "base64"));
}
console.log("frames", list.length, Math.round((Date.now() - t0) / 1000) + "s");
await b.close();
server.close();
if (ONLY) process.exit(0);

const v = join(OUT, "klin-klinych-trailer-vertical.mp4");
execFileSync("ffmpeg", ["-y", "-v", "error",
  "-framerate", String(edit.fps), "-i", join(dir, "%04d.jpg"),
  "-i", join(OUT, "trailer.wav"),
  "-map", "0:v", "-map", "1:a",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(edit.fps),
  "-c:a", "aac", "-b:a", "192k",
  "-t", "18", "-movflags", "+faststart", v], { stdio: "inherit" });
console.log("wrote", v);

// 16:9: the upright film in the middle over a blurred, darkened copy of itself
const h = join(OUT, "klin-klinych-trailer-horizontal.mp4");
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", v,
  "-filter_complex",
  "[0:v]split[a][b];[a]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=28:2,eq=brightness=-0.12:saturation=1.1[bg];[b]scale=-2:1080[fg];[bg][fg]overlay=(W-w)/2:0,format=yuv420p",
  "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-c:a", "copy", "-movflags", "+faststart", h], { stdio: "inherit" });
console.log("wrote", h);
