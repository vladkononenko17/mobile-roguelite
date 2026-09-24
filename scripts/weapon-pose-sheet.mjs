// Weapon pose test sheet: drives the real PlayCanvas page and captures, per weapon, the gameplay
// camera at four facings standing and running, any attack clips mid-swing, plus hand close-ups with
// and without the grip debug frames. Writes PNGs and an index.html contact sheet.
//
//   npm run dev:3d            (or any server for playcanvas.html)
//   node scripts/weapon-pose-sheet.mjs [base url] [out dir] [weapons,comma,separated] [model]
//
// Defaults: http://localhost:5173/mobile-roguelite/playcanvas.html, ./weapon-poses,
// pistol,rifle,shotgun,axe,none, the default hero. Not part of the build. Needs Playwright with a
// Chromium (resolved from PLAYWRIGHT_PATH, else "playwright"; e.g. npm i --no-save playwright).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright");
const [
  base = "http://localhost:5173/mobile-roguelite/playcanvas.html",
  outDir = "weapon-poses",
  weaponList = "pistol,rifle,shotgun,axe,none",
  model = "",
] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

// Stick directions (screen space: up = away from the camera).
const DIRECTIONS = [["up", [0, 1]], ["right", [1, 0]], ["down", [0, -1]], ["left", [-1, 0]]];
// Extra full-body clips to capture mid-swing, per weapon (besides its own attack).
const EXTRA_ACTIONS = { axe: ["Attack"] };
// Close-up cameras around the hands: [name, left, up, forward] in metres.
const CLOSE = [["left", 1.3, 0.15, 0.3], ["front", 0.45, 0.2, 1.4], ["right", -1.2, 0.3, 0.4]];
const CROP = { x: 70, y: 200, width: 250, height: 320 };

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const sections = [];

async function open(weapon, debug) {
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}?weapon=${weapon}${model ? `&model=${model}` : ""}${debug ? "&grips=1" : ""}`);
  await page.waitForFunction(() => document.querySelector("#loading")?.classList.contains("done"), null, { timeout: 300000 });
  await page.evaluate(() => {
    document.querySelector("#debug").style.display = "none";
    window.__stick = [0, 0];
    window.game.player.moveInput.read = (v) => v.set(window.__stick[0], window.__stick[1]);
  });
  return { page, errors };
}
const stick = (page, s) => page.evaluate((s) => { window.__stick = s; }, s);

for (const weapon of weaponList.split(",")) {
  const shots = [];
  const { page, errors } = await open(weapon, false);
  // Gameplay camera: standing at four facings (nudge the stick, release), then running four ways.
  for (const [name, dir] of DIRECTIONS) {
    await stick(page, dir.map((v) => v * 0.2));
    await page.waitForTimeout(700);
    await stick(page, [0, 0]);
    await page.waitForTimeout(1300);
    const file = `${weapon}-idle-${name}.png`;
    await page.screenshot({ path: path.join(outDir, file), clip: CROP });
    shots.push(file);
  }
  for (const [name, dir] of DIRECTIONS) {
    await stick(page, dir);
    await page.waitForTimeout(1600);
    const file = `${weapon}-run-${name}.png`;
    await page.screenshot({ path: path.join(outDir, file), clip: CROP });
    shots.push(file);
    await stick(page, [0, 0]);
  }
  // Attacks, mid-swing (full-body action layer; the hand IK stands down).
  await page.waitForTimeout(1200);
  const actions = [...(await page.evaluate(() => (window.game.weapons.attackClip ? [window.game.weapons.attackClip] : []))), ...(EXTRA_ACTIONS[weapon] ?? [])];
  for (const clip of actions) {
    await page.evaluate((clip) => window.game.animation.playAction(clip), clip);
    await page.waitForTimeout(500);
    const file = `${weapon}-action-${clip}.png`;
    await page.screenshot({ path: path.join(outDir, file), clip: CROP });
    shots.push(file);
    await page.waitForTimeout(2500);
  }
  if (errors.length) console.warn(`${weapon}: page errors`, errors);
  await page.close();

  // Close-ups (standing and running, facing right), with and without the grip frames.
  for (const debug of [false, true]) {
    for (const [mode, dir] of [["idle", [0.2, 0]], ["run", [1, 0]]]) {
      const { page } = await open(weapon, debug);
      await stick(page, dir);
      await page.waitForTimeout(mode === "idle" ? 700 : 1800);
      if (mode === "idle") {
        await stick(page, [0, 0]);
        await page.waitForTimeout(1300);
      }
      await page.evaluate(() => {
        const g = window.game;
        g.player.update = () => {};
        g.model.anim.speed = 0;
        g.animation.update = () => {};
        g.camera.update = () => {};
        g.camera.entity.camera.fov = 30;
        g.camera.entity.camera.nearClip = 0.03;
      });
      for (const [name, side, up, ahead] of CLOSE) {
        await page.evaluate(([side, up, ahead]) => {
          const g = window.game;
          const e = g.player.entity;
          const f = e.forward.clone().mulScalar(-1);
          const left = f.clone().cross(f, e.up).mulScalar(-1).normalize();
          const r = g.model.findByName("mixamorig:RightHand").getPosition();
          const l = g.model.findByName("mixamorig:LeftHand").getPosition();
          const mid = r.clone().lerp(r, l, 0.5);
          const c = g.camera.entity;
          c.setPosition(mid.x + left.x * side + f.x * ahead, mid.y + up, mid.z + left.z * side + f.z * ahead);
          c.lookAt(mid);
        }, [side, up, ahead]);
        await page.waitForTimeout(350);
        const file = `${weapon}-${mode}-close-${name}${debug ? "-grips" : ""}.png`;
        await page.screenshot({ path: path.join(outDir, file), clip: { x: 0, y: 150, width: 390, height: 400 } });
        shots.push(file);
      }
      await page.close();
    }
  }
  sections.push({ label: weapon, shots });
  console.log(`captured ${weapon}`);
}
await browser.close();

const html = `<!doctype html><meta charset="utf-8"><title>Weapon poses</title>
<style>body{background:#111;color:#eee;font:14px sans-serif;margin:16px}h2{margin:18px 0 6px}
.row{display:flex;gap:6px;flex-wrap:wrap}.row figure{margin:0}.row img{height:200px;border-radius:4px}
figcaption{font-size:11px;opacity:.7}</style>
<h1>Weapon poses</h1><p>Gameplay camera (idle at four facings, running four ways, attacks), then hand close-ups
standing / running, plain and with the grip frames (RGB = XYZ; RightHand, WeaponSocket, LeftHand, LeftHandGrip;
white = weapon forward axis, magenta = stock, yellow = left-wrist IK target).</p>
${sections.map((s) => `<h2>${s.label}</h2><div class="row">${s.shots.map((f) => `<figure><img src="${f}" alt="${f}"><figcaption>${f.replace(/\.png$/, "")}</figcaption></figure>`).join("")}</div>`).join("\n")}`;
fs.writeFileSync(path.join(outDir, "index.html"), html);
console.log(`wrote ${path.join(outDir, "index.html")}`);
