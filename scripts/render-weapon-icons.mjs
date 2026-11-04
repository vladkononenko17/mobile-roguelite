// Renders a side-view picture of every weapon in public/models/weapons/weapons.glb for the shop and
// the loadout: public/ui/weapons/<id>.webp (transparent, 384 x 176, muzzle to the right, a soft
// warm key light and a dark rim so it reads on the dark cards).
//   node scripts/render-weapon-icons.mjs
// Uses the preinstalled Playwright Chromium and three.js from node_modules (WebGL in the page);
// sharp converts to WebP (npm i --no-save sharp).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import sharp from "sharp";

// Playwright: the project's, else the machine's global install.
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright")); }
const { chromium } = playwright;

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/ui/weapons");
fs.mkdirSync(OUT, { recursive: true });

// Weapon id -> model node, read from WEAPONS.list in src/playcanvas/config.ts.
const config = fs.readFileSync(path.join(ROOT, "src/playcanvas/config.ts"), "utf8");
const list = config.slice(config.indexOf("export const WEAPONS"), config.indexOf("export type WeaponId"));
const weapons = [...list.matchAll(/^\s{4}(\w+): \{(?:\s*\/\/[^\n]*)*\s*label: "([^"]+)", class: "(\w+)", node: "(\w+)"/gm)].map((m) => ({ id: m[1], label: m[2], cls: m[3], node: m[4] }));
if (!weapons.length) throw new Error("no weapons found in config.ts");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg" };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const W = 384, H = 176;
const page = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setPixelRatio(2); r.setSize(${W}, ${H}); r.setClearColor(0x000000, 0);
r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.7;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x50545c, 2.4));
const key = new THREE.DirectionalLight(0xffe2b8, 3.4); key.position.set(2, 3, 4); scene.add(key);
const rim = new THREE.DirectionalLight(0x9fc4ff, 1.8); rim.position.set(-3, 1.5, -3); scene.add(rim);
// Some weapons are skinned without weights in the file (PlayCanvas ignores it; three.js would throw).
const normalize = THREE.SkinnedMesh.prototype.normalizeSkinWeights;
THREE.SkinnedMesh.prototype.normalizeSkinWeights = function () { if (this.geometry.attributes.skinWeight) normalize.call(this); };
const gltf = await new GLTFLoader().loadAsync("/public/models/weapons/weapons.glb");
// Pictures want the rest pose: skinned parts become plain meshes.
const skinned = [];
gltf.scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
for (const o of skinned) {
  const m = new THREE.Mesh(o.geometry, o.material);
  m.name = o.name; m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale);
  o.parent.add(m); o.parent.remove(m === o ? m : o);
}
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
window.render = (nodeName) => {
  const src = gltf.scene.getObjectByName(nodeName);
  if (!src) return null;
  const o = src.clone(true);
  o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.setScalar(1);
  // Weapon space: muzzle -Z, top +Y. Seen from its right side the muzzle points right on screen.
  const holder = new THREE.Group(); holder.add(o); holder.rotation.y = -Math.PI / 2;
  // A slight three-quarter turn and tilt so the silhouette has depth.
  holder.rotation.x = 0.06; holder.rotation.z = 0.0;
  const pivot = new THREE.Group(); pivot.add(holder); pivot.rotation.y = 0.32; pivot.rotation.x = 0.12;
  scene.add(pivot);
  const box = new THREE.Box3().setFromObject(pivot), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  pivot.position.sub(c);
  const aspect = ${W} / ${H}, pad = 1.12;
  const halfW = Math.max(size.x / 2, (size.y / 2) * aspect) * pad;
  cam.left = -halfW; cam.right = halfW; cam.top = halfW / aspect; cam.bottom = -halfW / aspect; cam.updateProjectionMatrix();
  cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0);
  r.render(scene, cam);
  scene.remove(pivot);
  return r.domElement.toDataURL("image/png");
};
window.ready = true;
</script></body></html>`;
fs.writeFileSync(path.join(ROOT, ".weapon-icons.html"), page);

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const p = await browser.newPage({ viewport: { width: W, height: H } });
  p.on("pageerror", (e) => console.error("page:", e.message));
  await p.goto(`${base}/.weapon-icons.html`);
  await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  for (const w of weapons) {
    const url = await p.evaluate((n) => window.render(n), w.node);
    if (!url) { console.warn(`no node ${w.node} (${w.id})`); continue; }
    const png = Buffer.from(url.split(",")[1], "base64");
    const out = path.join(OUT, `${w.id}.webp`);
    await sharp(png).trim({ threshold: 1 }).resize(W, H, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 88, alphaQuality: 90 }).toFile(out);
    console.log(`${w.id.padEnd(16)} ${w.node.padEnd(22)} ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
  }
} finally {
  await browser.close();
  server.close();
  fs.rmSync(path.join(ROOT, ".weapon-icons.html"), { force: true });
}
