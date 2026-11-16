// Builds Hell's and ORION's extra monsters from Quaternius "Ultimate Monsters" (CC0,
// quaternius.com/packs/ultimatemonsters.html; glTF in assets-src/ultimate-monsters/, also mirrored at
// github.com/series-ai/jam-ready-assets, `quaternius-ultimate-monsters/`).
//
//   node scripts/build-ultimate-monsters.mjs [in dir] [out dir]
//
// Every model of the pack shares one 50-colour swatch atlas, so a skin is a colour map over the whole
// atlas and fits every model: Hell's maps squeeze all hues into a fire band, darken the greys and turn
// the white googly eyes into glowing embers; ORION's keep the pack's alien colours or shift them.
// Written at 256 px nearest-neighbour. Output: <out>/<id>.glb, <out>/skins/um_<skin>.webp.
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune } from "@gltf-transform/functions";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const inDir = process.argv[2] ?? path.join(ROOT, "assets-src/ultimate-monsters");
const outDir = process.argv[3] ?? path.join(ROOT, "public/models/monsters");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** id -> source file, default skin, clips kept. */
const BIG = ["Idle", "Walk", "Run", "Punch", "HitReact", "Death", "Weapon", "Wave", "Jump_Land"];
const FLY = ["Flying_Idle", "Fast_Flying", "Punch", "Headbutt", "HitReact", "Death"];
const BLOB = ["Idle", "Walk", "Bite_Front", "HitRecieve", "Death", "Jump"];
const MODELS = {
  // Hell
  umDemon: { file: "Big/glTF/Demon.gltf", skin: "hellRed", clips: BIG },
  umSkull: { file: "Big/glTF/Orc_Skull.gltf", skin: "hellAsh", clips: BIG },
  umTribal: { file: "Big/glTF/Tribal.gltf", skin: "hellRed", clips: BIG },
  umWraith: { file: "Flying/glTF/Ghost_Skull.gltf", skin: "hellObsidian", clips: FLY },
  umWyvern: { file: "Flying/glTF/Dragon_Evolved.gltf", skin: "hellRed", clips: FLY },
  // ORION
  umAlien: { file: "Big/glTF/Alien.gltf", skin: "alien", clips: BIG },
  umSquidle: { file: "Flying/glTF/Squidle.gltf", skin: "alien", clips: FLY },
  umHywirl: { file: "Flying/glTF/Hywirl.gltf", skin: "alien", clips: FLY },
  umBee: { file: "Flying/glTF/Armabee_Evolved.gltf", skin: "alien", clips: FLY },
  umBlob: { file: "Blob/glTF/Alien.gltf", skin: "alien", clips: BLOB },
};

/**
 * Skins. fire: [hue from, hue to] band every saturated colour is squeezed into; sat / light factors;
 * grey: lightness factor of the greys; eyes: the colour near-white becomes. Or shift: plain
 * hue / saturation / lightness move (eyes kept).
 */
const SKINS = {
  hellRed: { fire: [350, 18], sat: 1.15, light: 0.8, grey: 0.4, eyes: "ffc23a" },
  hellAsh: { fire: [5, 30], sat: 0.35, light: 0.6, grey: 0.6, eyes: "ff8a1a" },
  hellObsidian: { fire: [330, 360], sat: 0.8, light: 0.38, grey: 0.3, eyes: "ff4a1c" },
  hellEmber: { fire: [10, 45], sat: 1.15, light: 0.9, grey: 0.4, eyes: "fff06a" },
  alien: { shift: 0, sat: 1, light: 1 },
  alienToxic: { shift: 95, sat: 1.05, light: 0.95 },
  alienCold: { shift: -150, sat: 0.85, light: 1 },
  alienVoid: { fire: [255, 300], sat: 0.9, light: 0.5, grey: 0.4, eyes: "d8a8ff" },
};

const hex = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
function mapColour(c, k) {
  const [h, s, l] = rgb2hsl(c);
  if (k.shift !== undefined) return hsl2rgb([h + k.shift, Math.min(1, s * k.sat), Math.min(1, l * k.light)]);
  if (c[0] === 0x90 && c[1] === 0x93 && c[2] === 0xa1) return hex(k.eyes); // the googly eyes (#9093a1)
  if (l > 0.68 && s < 0.12) return hex(k.eyes);
  if (s < 0.15) return hsl2rgb([k.fire[0], 0.15, l * k.grey]);
  const band = (k.fire[1] - k.fire[0] + 360) % 360;
  return hsl2rgb([k.fire[0] + (h / 360) * band, Math.min(1, Math.max(0.55, s) * k.sat), Math.min(0.85, l * k.light)]);
}

fs.mkdirSync(path.join(outDir, "skins"), { recursive: true });
const { data, info } = await sharp(path.join(inDir, "Big/glTF/Atlas_Monsters.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const skinFiles = {};
for (const [id, k] of Object.entries(SKINS)) {
  const cache = new Map(), out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let c = cache.get(key);
    if (!c) cache.set(key, (c = mapColour([data[i], data[i + 1], data[i + 2]], k).map((v) => Math.round(Math.max(0, Math.min(255, v))))));
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
  }
  const file = path.join(outDir, "skins", `um_${id}.webp`);
  await sharp(out, { raw: info }).resize(256, 256, { kernel: "nearest" }).webp({ lossless: true }).toFile(file);
  skinFiles[id] = file;
}
console.log(`skins: ${Object.keys(SKINS).map((s) => `um_${s}`).join(", ")}`);

for (const [id, m] of Object.entries(MODELS)) {
  const doc = await io.read(path.join(inDir, m.file));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) {
    a.setName(a.getName().replace(/^.*\|/, ""));
    if (!m.clips.includes(a.getName())) a.dispose();
  }
  for (const t of root.listTextures()) t.setImage(fs.readFileSync(skinFiles[m.skin])).setMimeType("image/webp").setURI("");
  for (const mat of root.listMaterials()) mat.setMetallicFactor(0).setRoughnessFactor(0.75);
  await doc.transform(prune(), dedup());
  const out = path.join(outDir, `${id}.glb`);
  await io.write(out, doc);
  const { getBounds } = await import("@gltf-transform/core");
  const b = getBounds(root.listScenes()[0]);
  console.log(`${id.padEnd(10)} ${(fs.statSync(out).size / 1e3).toFixed(0)} KB, ${(b.max[1] - b.min[1]).toFixed(2)} units tall, clips: ${root.listAnimations().map((a) => a.getName()).join(" ")}`);
}
