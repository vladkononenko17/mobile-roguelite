// Turns the four survivors of Quaternius' "Zombie Apocalypse Kit" (CC0: Lis, Matt, Sam, Shaun) into
// infected: the kit's zombie clips (Zombie_Basic: hunched walk, arms-out run, punch, lunge, death...)
// are copied onto their rig (same bone names; rotations, plus the Root/Body translation), their
// carried weapons dropped, and colour skins painted for the horde, the ORION crew and the drowned.
//
//   node scripts/build-zombified-survivors.mjs [kit Characters/glTF dir] [out dir]
//
// The kit's characters share one 512 px swatch atlas (flat colour cells), so a skin is a colour map
// over the whole atlas and fits all four bodies: the two skin tones become rotting flesh, every
// clothing colour is moved (hue / saturation / lightness, a seeded jitter per colour so each swatch
// ends up different) and dirtied. Written at 256 px with nearest-neighbour so the cells stay flat.
// Output: <out>/z<name>.glb and <out>/skins/zs_<skin>.webp.
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune } from "@gltf-transform/functions";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const inDir = process.argv[2] ?? path.join(ROOT, "assets-src/zombie-kit/Characters/glTF");
const outDir = process.argv[3] ?? path.join(ROOT, "public/models/infected");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const BODIES = ["Lis", "Matt", "Sam", "Shaun"];
/** Clips taken from Zombie_Basic (EnemyVisual.clips): Run_Arms is the arms-out sprint of runners. */
const CLIPS = new Set(["Idle", "Walk", "Run", "Run_Arms", "Punch", "Run_Attack", "HitReact", "Death", "Jump_Land", "Idle_Attack"]);
/** Bones whose translation is animated too (the rest keep the survivor's own proportions). */
const MOVE_BONES = new Set(["Root", "Body"]);

/** The kit's two skin tones (dark: Matt, Sam; light: Lis, Shaun). */
const SKIN_DARK = "7d4f26", SKIN_LIGHT = "c19364";

/**
 * Skins. skin: [dark tone, light tone]; clothes: hue shift (deg), saturation and lightness factors,
 * jitter (deg of seeded hue spread per colour), grime (mix towards mud), seed; red: [hex] colours of
 * the clothes forced to blood; palette: optional fixed colours the clothes snap to (uniforms).
 */
const SKINS = {
  // The horde (chapters I and the outpost): four kinds of dead.
  rot: { skin: ["5f6b45", "8a9666"], hue: 0, sat: 0.6, light: 0.8, jitter: 50, grime: 0.25, seed: 1, blood: 0.18 },
  pale: { skin: ["66707a", "9aa4ab"], hue: 25, sat: 0.45, light: 0.85, jitter: 70, grime: 0.2, seed: 2, blood: 0.12 },
  jaundice: { skin: ["7c7240", "a99d63"], hue: -30, sat: 0.7, light: 0.75, jitter: 80, grime: 0.3, seed: 3, blood: 0.22 },
  charred: { skin: ["3d3530", "5f544a"], hue: 10, sat: 0.35, light: 0.55, jitter: 40, grime: 0.45, seed: 4, blood: 0.1 },
  // ORION's crew: station jumpsuits (off-white with orange or teal), cold dead skin.
  crewOrange: { skin: ["5b6670", "8c98a0"], palette: ["dedbd3", "c4c1b9", "d8742a", "8e9196", "3a3d42"], grime: 0.12, seed: 5, blood: 0.12 },
  crewTeal: { skin: ["5e6b62", "8f9d93"], palette: ["d4d7d4", "b4b8b6", "2f9494", "6f7478", "2e3236"], grime: 0.12, seed: 6, blood: 0.12 },
  // The Black Tide's drowned: bleached sea-green and blue, salt-faded rags.
  drownedKelp: { skin: ["5d7a6c", "8fb0a0"], hue: 140, sat: 0.4, light: 0.8, jitter: 40, grime: 0.15, tint: "6f9a86", seed: 7, blood: 0 },
  drownedBlue: { skin: ["5b6f86", "8ea3ba"], hue: 190, sat: 0.35, light: 0.85, jitter: 40, grime: 0.15, tint: "7f97b4", seed: 8, blood: 0 },
};

// ---- colour helpers -----------------------------------------------------------------------------
const hex = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const toHex = (c) => c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
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
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function rand(seed, key) { // deterministic 0..1 per (seed, colour)
  let x = seed * 2654435761 ^ parseInt(key, 16);
  x = Math.imul(x ^ (x >>> 16), 2246822507); x = Math.imul(x ^ (x >>> 13), 3266489909);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const MUD = hex("4a4030"), BLOOD = hex("5c1712");

function mapColour(key, k) {
  if (key === SKIN_DARK) return hex(k.skin[0]);
  if (key === SKIN_LIGHT) return hex(k.skin[1]);
  let c = hex(key);
  if (k.palette) {
    // Uniform: most cloth takes the suit's light colours (weighted pick per swatch), the near-black
    // parts (boots, belts, straps) the palette's darkest.
    const [, , l] = rgb2hsl(c);
    const sorted = [...k.palette].sort((a, b) => rgb2hsl(hex(b))[2] - rgb2hsl(hex(a))[2]);
    const weights = [0.38, 0.24, 0.2, 0.1, 0.08];
    let r = rand(k.seed, key), i = 0;
    while (i < sorted.length - 1 && r > weights[i]) r -= weights[i++];
    const pick = l < 0.1 ? sorted[sorted.length - 1] : sorted[i];
    c = mix(hex(pick), c, 0.15);
  } else {
    const [h, s, l] = rgb2hsl(c);
    const jitter = (rand(k.seed, key) - 0.5) * 2 * k.jitter;
    c = hsl2rgb([h + k.hue + jitter, Math.min(1, s * k.sat), Math.min(0.92, l * k.light)]);
    if (k.tint) c = mix(c, hex(k.tint), 0.35);
  }
  c = mix(c, MUD, k.grime);
  if (rand(k.seed + 99, key) < k.blood) c = mix(c, BLOOD, 0.7);
  return c;
}

// ---- skins ----------------------------------------------------------------------------------------
fs.mkdirSync(path.join(outDir, "skins"), { recursive: true });
const sample = await io.read(path.join(inDir, `Characters_${BODIES[0]}.gltf`));
const atlas = Buffer.from(sample.getRoot().listTextures()[0].getImage());
const { data, info } = await sharp(atlas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const colours = new Set();
for (let i = 0; i < data.length; i += 4) colours.add(toHex([data[i], data[i + 1], data[i + 2]]));
for (const [id, k] of Object.entries(SKINS)) {
  const map = new Map([...colours].map((c) => [c, mapColour(c, k)]));
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const c = map.get(toHex([data[i], data[i + 1], data[i + 2]]));
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
  }
  await sharp(out, { raw: info }).resize(256, 256, { kernel: "nearest" }).webp({ lossless: true }).toFile(path.join(outDir, "skins", `zs_${id}.webp`));
}
console.log(`skins: ${Object.keys(SKINS).map((s) => `zs_${s}`).join(", ")} (${colours.size} atlas colours)`);

// ---- bodies ---------------------------------------------------------------------------------------
const zombie = await io.read(path.join(inDir, "Zombie_Basic.gltf"));
for (const name of BODIES) {
  const doc = await io.read(path.join(inDir, `Characters_${name}.gltf`));
  const root = doc.getRoot();
  // The survivor's own clips go; the carried weapons (static meshes) go.
  for (const a of root.listAnimations()) a.dispose();
  for (const n of root.listNodes()) if (n.getMesh() && !n.getSkin()) n.dispose();
  const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const buffer = root.listBuffers()[0];
  for (const src of zombie.getRoot().listAnimations()) {
    const clip = src.getName().replace(/^.*\|/, "");
    if (!CLIPS.has(clip)) continue;
    const anim = doc.createAnimation(clip);
    for (const ch of src.listChannels()) {
      const target = byName.get(ch.getTargetNode()?.getName());
      const p = ch.getTargetPath();
      if (!target || p === "scale" || (p === "translation" && !MOVE_BONES.has(target.getName()))) continue;
      const s = ch.getSampler();
      const copy = (acc) => doc.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setBuffer(buffer);
      const sampler = doc.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(p).setSampler(sampler));
    }
  }
  // The default look is the horde's "rot" skin; its atlas is replaced per enemy at runtime.
  for (const t of root.listTextures()) t.setImage(fs.readFileSync(path.join(outDir, "skins", "zs_rot.webp"))).setMimeType("image/webp");
  for (const m of root.listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.8);
  await doc.transform(prune(), dedup());
  const out = path.join(outDir, `z${name.toLowerCase()}.glb`);
  await io.write(out, doc);
  const tris = root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + p.getIndices().getCount() / 3, 0), 0);
  console.log(`wrote ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1e3).toFixed(0)} KB, ${tris} tris), clips: ${root.listAnimations().map((a) => a.getName()).join(", ")}`);
}
