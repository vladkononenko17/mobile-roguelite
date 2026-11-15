// Renders the six chapters' key art (title screen tabs and backdrop, loading screen):
// public/menu/<chapter>.webp, 720 x 1296. Each is staged in the game itself: the chapter's hero
// stands a little above the middle (the menu and the loading screen put their text over the bottom
// half), aiming at a few of the chapter's enemies closing in from the camera's side, with the
// chapter's last boss looming behind; no HUD, the camera low and close.
//   npm run build:itch && node scripts/render-key-art.mjs [chapter ...]
// Uses the preinstalled Playwright Chromium (software WebGL: a minute or two per picture) and sharp.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const need = (name) => { try { return require(name); } catch { return require(path.join(globalRoot, name)); } };
const { chromium } = need("playwright");
const sharp = need("sharp");

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist-itch");
const OUT = process.env.OUTDIR ?? path.join(ROOT, "public/menu");
const W = 720, H = 1296;

/**
 * Per chapter: the level (`wave`, 1-based) whose scenery is the backdrop, the hero and gun, the
 * camera (metres, degrees; `yaw` turns it around the hero), how many enemies come from the front,
 * the boss behind (`bossAt`: metres up-screen and to the right; `bossScale` shrinks a giant to fit).
 */
const CHAPTERS = {
  outpost: { level: "outpost", wave: 3, hero: "survivor", weapon: "rifle", distance: 8.2, pitch: 34, yaw: 0, enemies: 6 },
  facility: { level: "space", wave: 2, hero: "survivor", weapon: "plasma", distance: 8.2, pitch: 34, yaw: 0, enemies: 6 },
  medieval: { level: "medieval", wave: 2, hero: "survivor", weapon: "autoShotgun", distance: 8.4, pitch: 34, yaw: 0, enemies: 6 },
  hell: { level: "hell", wave: 3, hero: "demolitionist", weapon: "battleRifle", distance: 8.4, pitch: 34, yaw: 0, enemies: 6 },
  pirate: { level: "pirate", wave: 2, hero: "medic", weapon: "mp5", distance: 8.4, pitch: 34, yaw: 0, enemies: 6 },
  winter: { level: "winter", wave: 4, hero: "drifter", weapon: "rifle", distance: 8.2, pitch: 34, yaw: 0, enemies: 6 },
};
for (const [id, extra] of Object.entries(JSON.parse(process.env.TWEAK ?? "{}"))) Object.assign(CHAPTERS[id], extra);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const file = path.join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname).slice(1) || "index.html");
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"] });
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CHAPTERS);

for (const id of wanted) {
  const c = CHAPTERS[id];
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?level=${c.level}&difficulty=hard&debug=1&wave=${c.wave}&model=${c.hero}&weapon=${c.weapon}`);
  await page.waitForFunction(() => window.game?.gameplay?.phase === "combat", null, { timeout: 300000 });
  await page.evaluate((c) => {
    const g = window.game, gp = g.gameplay;
    // No interface, no deaths, no level-ups; full resolution however slow the frames are.
    for (const sel of ["#hud", "#hpbars", "#tut", "#arsenal", "#debug"]) { const el = document.querySelector(sel); if (el) el.style.display = "none"; }
    document.body.classList.remove("debug-on");
    gp.testGod = true;
    gp.testFreeze = true;
    gp.stats.gainXp = () => 0;
    Object.assign(g.resolution, { minRatio: 1, maxRatio: 1, ratio: 1 });
    g.app.graphicsDevice.maxPixelRatio = 1;
    g.player.moveInput = { read: (v) => v.set(0, 0) };
    if (c.at) g.player.entity.setPosition(c.at[0], g.player.entity.getPosition().y, c.at[1]);
    Object.assign(g.camera.settings, { distance: c.distance, pitchDeg: c.pitch, yawDeg: c.yaw, screenOffset: c.offset ?? -0.02, ...(c.fov ? { fovDeg: c.fov } : {}) });
    const step = (seconds) => { for (let i = 0; i < Math.round(seconds * 30); i++) g.update(1 / 30); };
    step(1.2);
    // The horde: cleared, then a few of this level's kinds placed by hand. Up-screen is the camera's
    // forward on the ground; the enemies stand on the camera's side of the hero (he turns to face us).
    gp.enemies.clear();
    step(0.2);
    const P = g.player.entity.getPosition();
    const f = g.camera.entity.forward, up = { x: f.x, z: f.z }, len = Math.hypot(up.x, up.z) || 1;
    up.x /= len; up.z /= len;
    const right = { x: -up.z, z: up.x };
    const put = (type, u, r, elite) => {
      const e = gp.enemies.spawn(type, P.x + up.x * u + right.x * r, P.z + up.z * u + right.z * r, 1, 1);
      if (e && elite) gp.enemies.makeElite(e, 3, 1.3, 1);
      return e;
    };
    const level = gp.director.wave;
    const kinds = c.kinds ?? Object.entries(level.phases[level.phases.length - 1].weights).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    // An arc below and beside the hero, nearest first (the gun picks the nearest).
    const spots = c.spots ?? [[-2.6, -0.9], [-3.4, 1.7], [-2.2, -3.0], [-4.6, -2.1], [-1.2, 3.4], [-5.2, 0.6], [0.6, -3.9], [-0.4, 4.6]];
    spots.slice(0, c.enemies).forEach(([u, r], i) => put(kinds[i % kinds.length], u, r, false));
    const boss = c.boss === null ? null : c.boss ?? [...gp.levels].reverse().find((l) => l.boss)?.boss.type;
    if (boss) {
      const b = put(boss, c.bossAt?.[0] ?? 5.2, c.bossAt?.[1] ?? 1.6, false);
      // No boss fight: it only stands there.
      if (b) b.brain = null;
    }
    gp.testFreeze = true;
    step(c.settle ?? 0.9);
    g.app.timeScale = 0.0001;
  }, c);
  await page.waitForTimeout(6000);
  const png = await page.screenshot({ timeout: 300000 });
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${id}.webp`);
  await sharp(png).webp({ quality: Number(process.env.QUALITY ?? 80) }).toFile(file);
  console.log(id, fs.statSync(file).size, "bytes", errors.length ? `errors: ${errors.slice(0, 2).join(" | ")}` : "");
  await page.close();
}
await browser.close();
server.close();
