// Weapon pose test sheet: drives the real PlayCanvas page and captures, for each weapon state
// (rifle / pistol / axe / none x idle / run), the gameplay camera plus close-ups of the hands with and
// without the grip debug frames. Writes PNGs and an index.html contact sheet.
//
//   npm run dev:3d            (or any server for playcanvas.html)
//   node scripts/weapon-pose-sheet.mjs [base url] [out dir] [model]
//
// Defaults: http://localhost:5173/mobile-roguelite/playcanvas.html, ./weapon-poses, the default hero.
// Not part of the build. Needs Playwright with a Chromium (resolved from PLAYWRIGHT_PATH, else
// "playwright"; e.g. npm i --no-save playwright).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright");
const [base = "http://localhost:5173/mobile-roguelite/playcanvas.html", outDir = "weapon-poses", model = ""] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const WEAPONS = ["rifle", "pistol", "axe", "none"];
const MODES = [["idle", [0, 0]], ["run", [0.3, 1]]];
// Close-up cameras around the hands: [name, right (hero's left = +), up, forward] in metres.
const CLOSE = [["left", 1.3, 0.15, 0.3], ["front", 0.45, 0.2, 1.4], ["right", -1.2, 0.3, 0.4]];

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const rows = [];
for (const weapon of WEAPONS) {
  for (const [mode, stick] of MODES) {
    const shots = [];
    for (const debug of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${base}?weapon=${weapon}${model ? `&model=${model}` : ""}${debug ? "&grips=1" : ""}`);
      await page.waitForFunction(() => document.querySelector("#loading")?.classList.contains("done"), null, { timeout: 300000 });
      await page.evaluate((s) => {
        document.querySelector("#debug").style.display = "none";
        window.game.player.moveInput.read = (v) => v.set(s[0], s[1]);
      }, stick);
      await page.waitForTimeout(2200);
      const tag = `${weapon}-${mode}${debug ? "-grips" : ""}`;
      if (!debug) {
        const file = `${tag}-gameplay.png`;
        await page.screenshot({ path: path.join(outDir, file), clip: { x: 70, y: 200, width: 250, height: 320 } });
        shots.push(file);
      }
      // Freeze, then look at the hands.
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
        const file = `${tag}-${name}.png`;
        await page.screenshot({ path: path.join(outDir, file), clip: { x: 0, y: 150, width: 390, height: 400 } });
        shots.push(file);
      }
      if (errors.length) console.warn(`${tag}: page errors`, errors);
      await page.close();
    }
    rows.push({ label: `${weapon} ${mode}`, shots });
    console.log(`captured ${weapon} ${mode}`);
  }
}
await browser.close();

const html = `<!doctype html><meta charset="utf-8"><title>Weapon poses</title>
<style>body{background:#111;color:#eee;font:14px sans-serif;margin:16px}h2{margin:18px 0 6px}
.row{display:flex;gap:6px;overflow-x:auto}.row img{height:220px;border-radius:4px}</style>
<h1>Weapon poses</h1><p>Gameplay camera, then close-ups (left / front / right), then the same with the grip frames
(RGB = XYZ; RightHand, WeaponSocket, LeftHand, LeftHandGrip; yellow cross = left-wrist IK target).</p>
${rows.map((r) => `<h2>${r.label}</h2><div class="row">${r.shots.map((s) => `<img src="${s}" alt="${s}">`).join("")}</div>`).join("\n")}`;
fs.writeFileSync(path.join(outDir, "index.html"), html);
console.log(`wrote ${path.join(outDir, "index.html")}`);
