// Builds the Black Tide's crew (public/models/pirate/):
// - bodies from the KayKit "Adventurers" and "Skeletons" character packs (CC0, Kay Lousberg,
//   github.com/KayKit-Game-Assets; cloned into assets-src/medieval/): each keeps its skinned mesh,
//   rig, the clips the game plays and the gear its look carries; colour skins are the atlas
//   re-tinted (salt-bleached bones, sea-rotted coats, barnacle crust) at 256 px WebP;
// - gear modelled here in code: a tricorn hat, a musket, the bosun's anchor (EnemyVisual.attachments);
// - the carrion crab, modelled and animated here in code (node animation, no skin);
// - "drowned" skins for the zombie pack's bodies (re-tints of models/zombies/skins/*.webp).
//
//   node scripts/build-pirate-creatures.mjs
// Not part of the normal build. Needs (npm i --no-save): @gltf-transform/core@4,
// @gltf-transform/extensions@4, @gltf-transform/functions@4, sharp.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { Document, NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample } from "@gltf-transform/functions";
import sharp from "sharp";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "assets-src/medieval");
const OUT = path.join(ROOT, "public/models/pirate");
const files = execSync(`find -L "${SRC}" -name "*.gltf" -o -name "*.glb"`, { encoding: "utf8" }).split("\n").filter(Boolean);
const find = (name) => files.find((f) => path.basename(f).replace(/\.gltf\.glb$|\.gltf$|\.glb$/, "") === name) ?? (() => { throw new Error(name); })();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(path.join(OUT, "skins"), { recursive: true });
fs.mkdirSync(path.join(OUT, "gear"), { recursive: true });

/* ------------------------------------------------------------------------------------------------
 * KayKit bodies
 * ---------------------------------------------------------------------------------------------- */

// sharp modulate (saturation, brightness, hue) and an optional tint per skin.
const CREATURES = [
  // The boarder: a bleached skeleton with a cutlass (the blade comes as an attachment).
  { name: "boarder", file: "Skeleton_Minion", keep: null,
    clips: ["Idle_Combat", "Running_C", "Walking_D_Skeletons", "1H_Melee_Attack_Slice_Diagonal", "1H_Melee_Attack_Chop", "Hit_A", "Death_C_Skeletons", "Death_A", "Spawn_Ground_Skeletons"],
    skins: { bone_salt: { saturation: 0.45, brightness: 1.0, tint: "#e9e2cc" }, bone_kelp: { saturation: 0.5, brightness: 0.82, tint: "#b8c9a2" } } },
  // The musketeer: a drowned sailor in a sea-rotted coat; aims and fires a musket.
  { name: "musketeer", file: "Rogue", keep: [],
    clips: ["Idle", "Walking_B", "Running_A", "2H_Ranged_Aiming", "2H_Ranged_Shoot", "Hit_A", "Death_A", "Death_B", "Unarmed_Melee_Attack_Punch_A"],
    skins: { coat_blue: { saturation: 0.45, brightness: 0.7, tint: "#7f9cb0" }, coat_red: { saturation: 0.55, brightness: 0.68, tint: "#b07466" } } },
  // The powder monkey: hooded, a lit bomb in hand; lobs it.
  { name: "powder", file: "Rogue_Hooded", keep: ["Throwable"],
    clips: ["Idle", "Walking_C", "Running_B", "Throw", "Hit_B", "Death_A", "Death_B"],
    skins: { powder_tar: { saturation: 0.3, brightness: 0.5, tint: "#8a7a62" } } },
  // The quartermaster: round shield and hatchet, crusted with barnacles; charges.
  { name: "quartermaster", file: "Barbarian", keep: ["1H_Axe", "Barbarian_Round_Shield"],
    clips: ["Idle", "Walking_A", "Running_A", "1H_Melee_Attack_Chop", "Block_Hit", "Death_A", "Death_B", "Dodge_Forward"],
    skins: { qm_barnacle: { saturation: 0.4, brightness: 0.72, tint: "#8fb0a8" }, qm_rust: { saturation: 0.5, brightness: 0.66, tint: "#b38a6a" } } },
  // The barnacle brute: a two-handed axe, coral grown over him.
  { name: "brute", file: "Barbarian", keep: ["2H_Axe"],
    clips: ["2H_Melee_Idle", "Walking_B", "2H_Melee_Attack_Chop", "2H_Melee_Attack_Spin", "Hit_A", "Death_A", "Jump_Land"],
    skins: { coral: { saturation: 0.7, brightness: 0.7, tint: "#c98f7e" } } },
  // Boss: the Bosun - bare-handed (the anchor is an attachment), huge.
  { name: "bosun", file: "Barbarian", keep: [],
    clips: ["2H_Melee_Idle", "Walking_B", "Running_A", "2H_Melee_Attack_Chop", "2H_Melee_Attack_Spin", "2H_Melee_Attack_Slice", "Hit_A", "Death_A", "Cheer", "Jump_Land", "Throw"],
    skins: { bosun_drowned: { saturation: 0.45, brightness: 0.7, tint: "#93aab0" } } },
  // Boss: the Sea Hag - the witch's hat and staff, kelp-green robes.
  { name: "hag", file: "Mage", keep: ["Mage_Hat", "2H_Staff"],
    clips: ["Idle", "Walking_C", "Running_B", "Spellcast_Shoot", "Spellcast_Raise", "Spellcast_Long", "Spellcasting", "Hit_A", "Death_A", "Cheer"],
    skins: { hag_kelp: { saturation: 0.6, brightness: 0.68, tint: "#7fb59a" } } },
  // Boss: the Captain - the long coat (cape), a cutlass and a pistol (attachments).
  { name: "captain", file: "Rogue", keep: ["Rogue_Cape"],
    clips: ["Idle", "Walking_A", "Running_A", "1H_Melee_Attack_Slice_Diagonal", "1H_Melee_Attack_Chop", "1H_Ranged_Shoot", "Dodge_Forward", "Hit_A", "Death_A", "Cheer", "Spellcast_Raise", "Jump_Land"],
    skins: { captain_crimson: { saturation: 0.75, brightness: 0.62, tint: "#b8564a" } } },
];

for (const c of CREATURES) {
  const doc = await io.read(find(c.file));
  const root = doc.getRoot();
  if (c.keep) {
    const bodyPrefix = c.file.split("_")[0];
    for (const node of root.listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const name = node.getName();
      const body = name.startsWith(bodyPrefix + "_") && /_(Head|Head_Hooded|Body|ArmLeft|ArmRight|LegLeft|LegRight)$/.test(name);
      if (!body && !c.keep.includes(name)) node.setMesh(null);
    }
  }
  const skinIds = Object.keys(c.skins);
  for (const texture of root.listTextures()) {
    const resized = await sharp(Buffer.from(texture.getImage())).resize(256, 256, { fit: "fill" }).png().toBuffer();
    const render = async (k) => {
      let img = sharp(resized).modulate({ hue: k.hue ?? 0, saturation: k.saturation ?? 1, brightness: k.brightness ?? 1 });
      if (k.tint) img = sharp(await img.png().toBuffer()).tint(k.tint);
      return img.webp({ quality: 90 }).toBuffer();
    };
    texture.setImage(await render(c.skins[skinIds[0]])).setMimeType("image/webp").setURI("");
    for (const id of skinIds) fs.writeFileSync(path.join(OUT, "skins", `${id}.webp`), await render(c.skins[id]));
  }
  for (const m of root.listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.8);
  for (const anim of root.listAnimations()) {
    if (c.clips.includes(anim.getName())) continue;
    for (const ch of anim.listChannels()) ch.dispose();
    for (const sm of anim.listSamplers()) sm.dispose();
    anim.dispose();
  }
  const missing = c.clips.filter((n) => !root.listAnimations().some((a) => a.getName() === n));
  if (missing.length) throw new Error(`${c.name}: no clips ${missing.join(", ")}`);
  await doc.transform(resample({ tolerance: 1e-3 }), prune(), dedup());
  for (const acc of root.listAccessors()) if (acc.listParents().every((p) => p.propertyType === "Root")) acc.dispose();
  const b = getBounds(root.listScenes()[0]);
  const outPath = path.join(OUT, `${c.name}.glb`);
  await io.write(outPath, doc);
  console.log(`wrote ${c.name}.glb ${(fs.statSync(outPath).size / 1e3).toFixed(0)} KB, height ${(b.max[1] - b.min[1]).toFixed(2)}, clips ${root.listAnimations().length}`);
}

/* ------------------------------------------------------------------------------------------------
 * Modelled in code: flat-shaded boxes, wedges and prisms on a tiny palette texture (one material).
 * ---------------------------------------------------------------------------------------------- */

/** Palette swatches (4 x 4 px texture; UVs point at swatch centres). */
const PALETTE = [
  "#1c1a1f", "#3a3330", "#6b4a32", "#8e6a46", // 0 felt black, 1 dark wood, 2 wood, 3 light wood
  "#c9a24a", "#8d9196", "#4c5156", "#d8cfbc", // 4 gold trim, 5 iron, 6 dark iron, 7 bone
  "#c4472f", "#e0663f", "#f0a070", "#7a2a22", // 8 crab red, 9 crab orange, 10 crab belly, 11 crab dark
  "#141414", "#e8e2d0", "#2f5f55", "#9b3b30", // 12 eye black, 13 eye white, 14 kelp, 15 rust
];
async function paletteImage() {
  const raw = Buffer.alloc(4 * 4 * 4);
  PALETTE.forEach((hex, i) => {
    const v = parseInt(hex.slice(1), 16);
    raw.set([(v >> 16) & 255, (v >> 8) & 255, v & 255, 255], i * 4);
  });
  return sharp(raw, { raw: { width: 4, height: 4, channels: 4 } }).png().toBuffer();
}
const swatchUV = (i) => [((i % 4) + 0.5) / 4, (Math.floor(i / 4) + 0.5) / 4];

/** Mesh builder: flat-shaded faces (each face its own vertices), one palette swatch per part. */
class Builder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.idx = []; }
  /** A convex polygon; `outward` (optional) is the side it faces (the winding is fixed to match). */
  face(verts, swatch, outward) {
    const [u, v] = swatchUV(swatch);
    const normalOf = (vs) => {
      const a = vs[0], b = vs[1], c = vs[2];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    };
    let n = normalOf(verts);
    if (outward && n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0) { verts = verts.slice().reverse(); n = n.map((x) => -x); }
    const l = Math.hypot(...n) || 1;
    n = n.map((x) => x / l);
    const base = this.pos.length / 3;
    for (const p of verts) { this.pos.push(...p); this.nrm.push(...n); this.uv.push(u, v); }
    for (let i = 1; i < verts.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
  }
  /** A prism: a convex polygon `ring` (x, z, counter-clockwise from above) from y0 to y1. */
  prism(ring, y0, y1, swatch, top = swatch) {
    const n = ring.length;
    const cx = ring.reduce((k, p) => k + p[0], 0) / n, cz = ring.reduce((k, p) => k + p[1], 0) / n;
    this.face(ring.map(([x, z]) => [x, y1, z]), top, [0, 1, 0]);
    this.face(ring.map(([x, z]) => [x, y0, z]), swatch, [0, -1, 0]);
    for (let i = 0; i < n; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n];
      this.face([[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]], swatch, [(x0 + x1) / 2 - cx, 0, (z0 + z1) / 2 - cz]);
    }
  }
  box(cx, cy, cz, w, h, d, swatch, top = swatch) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    this.prism([[x0, z1], [x1, z1], [x1, z0], [x0, z0]], cy - h / 2, cy + h / 2, swatch, top);
  }
  /** A regular n-gon prism (cylinder) along Y. */
  cylinder(cx, cy, cz, r, h, n, swatch, top = swatch) {
    const ring = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ring.push([cx + Math.cos(a) * r, cz - Math.sin(a) * r]); }
    this.prism(ring, cy - h / 2, cy + h / 2, swatch, top);
  }
  /** A cylinder along Z (barrels, muzzles): built along Y, then rotated. */
  cylinderZ(cx, cy, cz, r, len, n, swatch) {
    const b = new Builder();
    b.cylinder(0, 0, 0, r, len, n, swatch);
    for (let i = 0; i < b.pos.length; i += 3) { const y = b.pos[i + 1], z = b.pos[i + 2]; b.pos[i + 1] = -z; b.pos[i + 2] = y; }
    for (let i = 0; i < b.nrm.length; i += 3) { const y = b.nrm[i + 1], z = b.nrm[i + 2]; b.nrm[i + 1] = -z; b.nrm[i + 2] = y; }
    for (let i = 0; i < b.pos.length; i += 3) { b.pos[i] += cx; b.pos[i + 1] += cy; b.pos[i + 2] += cz; }
    this.append(b);
  }
  append(b) {
    const base = this.pos.length / 3;
    this.pos.push(...b.pos); this.nrm.push(...b.nrm); this.uv.push(...b.uv);
    this.idx.push(...b.idx.map((i) => i + base));
  }
}

/** A document with one palette material; `parts` = [{ name, builder, translation?, rotation? }]. */
async function modelDoc(parts) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const texture = doc.createTexture("palette").setImage(await paletteImage()).setMimeType("image/png");
  const material = doc.createMaterial("palette").setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(0.85);
  material.getBaseColorTextureInfo().setMagFilter(9728).setMinFilter(9728);
  const scene = doc.createScene();
  const nodes = {};
  for (const p of parts) {
    const node = doc.createNode(p.name);
    if (p.builder) {
      const b = p.builder;
      const prim = doc.createPrimitive().setMaterial(material)
        .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(b.pos)).setBuffer(buffer))
        .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(b.nrm)).setBuffer(buffer))
        .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(b.uv)).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(b.idx)).setBuffer(buffer));
      node.setMesh(doc.createMesh(p.name).addPrimitive(prim));
    }
    if (p.translation) node.setTranslation(p.translation);
    if (p.rotation) node.setRotation(p.rotation);
    (p.parent ? nodes[p.parent] : scene).addChild(node);
    nodes[p.name] = node;
  }
  return { doc, nodes, buffer };
}

const quatY = (deg) => { const a = (deg * Math.PI) / 360; return [0, Math.sin(a), 0, Math.cos(a)]; };
const quatX = (deg) => { const a = (deg * Math.PI) / 360; return [Math.sin(a), 0, 0, Math.cos(a)]; };
const quatZ = (deg) => { const a = (deg * Math.PI) / 360; return [0, 0, Math.sin(a), Math.cos(a)]; };

/** Tricorn: a felt crown and a three-cornered brim turned up, gold trim; sits on the head bone. */
async function tricorn() {
  const b = new Builder();
  // Brim: three upturned walls round a triangle (point forward, +z), and a flat underside.
  const R = 0.78;
  const corners = [0, 120, 240].map((deg) => { const a = (deg * Math.PI) / 180; return [Math.sin(a) * R, Math.cos(a) * R]; });
  b.prism(corners, 0, 0.06, 0, 0);
  for (let i = 0; i < 3; i++) {
    const [x0, z0] = corners[i], [x1, z1] = corners[(i + 1) % 3];
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    // A wall leaning outwards along each side, highest in the middle.
    const ox = mx * 0.18, oz = mz * 0.18;
    const wall = [[x0, 0.04, z0], [x1, 0.04, z1], [x1 * 0.95 + ox, 0.2, z1 * 0.95 + oz], [mx + ox, 0.36, mz + oz], [x0 * 0.95 + ox, 0.2, z0 * 0.95 + oz]];
    b.face(wall, 0, [mx, 0.2, mz]);
    b.face(wall, 0, [-mx, -0.2, -mz]);
    // Gold trim along the top edge (both sides).
    for (const sgn of [1, -1]) {
      b.face([[x0 * 0.95 + ox, 0.2, z0 * 0.95 + oz], [mx + ox, 0.36, mz + oz], [mx + ox * 1.25, 0.39, mz + oz * 1.25], [x0 * 0.95 + ox * 1.25, 0.23, z0 * 0.95 + oz * 1.25]], 4, [0, sgn, 0]);
      b.face([[mx + ox, 0.36, mz + oz], [x1 * 0.95 + ox, 0.2, z1 * 0.95 + oz], [x1 * 0.95 + ox * 1.25, 0.23, z1 * 0.95 + oz * 1.25], [mx + ox * 1.25, 0.39, mz + oz * 1.25]], 4, [0, sgn, 0]);
    }
  }
  // Crown: a low octagonal dome.
  b.cylinder(0, 0.2, 0, 0.42, 0.34, 8, 0);
  b.cylinder(0, 0.4, 0, 0.32, 0.08, 8, 0);
  const { doc } = await modelDoc([{ name: "tricorn", builder: b }]);
  return doc;
}

/** Musket: in the hand slot's 2H-ranged frame (like the Rogue's crossbow), pointing along +z. */
async function musket() {
  const b = new Builder();
  b.box(0, -0.04, -0.12, 0.12, 0.2, 0.55, 2);           // stock
  b.box(0, 0.0, 0.32, 0.1, 0.12, 0.45, 2);              // fore-end
  b.cylinderZ(0, 0.07, 0.62, 0.035, 1.05, 6, 6);        // barrel
  b.cylinderZ(0, 0.07, 1.16, 0.05, 0.06, 6, 5);         // muzzle band
  b.box(0, 0.08, 0.05, 0.06, 0.08, 0.1, 5);             // lock
  const { doc } = await modelDoc([{ name: "musket", builder: b, translation: [-0.1, -0.01, 0], rotation: [0, 0.7071, 0, 0.7071] }]);
  return doc;
}

/** Anchor: shank up from the fist (the hand-slot frame of a two-handed axe), flukes at the top. */
async function anchor() {
  const b = new Builder();
  b.box(0, 0.55, 0, 0.14, 1.9, 0.14, 6);                // shank
  b.box(0, -0.42, 0, 0.36, 0.08, 0.1, 5);               // ring (a bar)
  b.box(0, 1.15, 0, 0.9, 0.12, 0.12, 6);                // stock across
  // Arms and flukes: two slanted boxes and wedge tips.
  const arm = (s) => {
    const a = new Builder();
    a.box(0, 0, 0, 0.12, 0.62, 0.12, 6);
    a.prism([[-0.16, 0.08], [0.16, 0.08], [0, -0.1]].map(([x, z]) => [x, z]), 0.26, 0.42, 15);
    const ang = (s * 50 * Math.PI) / 180, c = Math.cos(ang), sn = Math.sin(ang);
    for (let i = 0; i < a.pos.length; i += 3) {
      const x = a.pos[i], y = a.pos[i + 1];
      a.pos[i] = x * c - y * sn + s * 0.24; a.pos[i + 1] = x * sn + y * c + 1.62;
    }
    for (let i = 0; i < a.nrm.length; i += 3) {
      const x = a.nrm[i], y = a.nrm[i + 1];
      a.nrm[i] = x * c - y * sn; a.nrm[i + 1] = x * sn + y * c;
    }
    b.append(a);
  };
  arm(1); arm(-1);
  b.box(0, 1.55, 0, 0.2, 0.2, 0.2, 6);                  // crown
  const { doc } = await modelDoc([{ name: "anchor", builder: b, rotation: [0, 1, 0, 0] }]);
  return doc;
}

/** Pistol: the captain's off-hand flintlock (hand-slot frame of a one-handed blade, along +y). */
async function pistol() {
  const b = new Builder();
  b.box(0, -0.05, 0, 0.1, 0.24, 0.12, 2);               // grip
  b.box(0, 0.1, 0.02, 0.1, 0.1, 0.16, 5);               // lock
  const barrel = new Builder();
  barrel.cylinder(0, 0.38, 0.02, 0.04, 0.5, 6, 6);
  b.append(barrel);
  const { doc } = await modelDoc([{ name: "pistol", builder: b, rotation: [0, 1, 0, 0] }]);
  return doc;
}

for (const [name, make] of [["tricorn", tricorn], ["musket", musket], ["anchor", anchor], ["pistol", pistol]]) {
  const doc = await make();
  const outPath = path.join(OUT, "gear", `${name}.glb`);
  await io.write(outPath, doc);
  console.log(`wrote gear/${name}.glb ${(fs.statSync(outPath).size / 1e3).toFixed(1)} KB`);
}

/* ------------------------------------------------------------------------------------------------
 * The carrion crab: body, eye stalks, two claws and six legs as separate nodes, animated by node
 * rotation (Crab_Idle, Crab_Walk, Crab_Attack, Crab_Hit, Crab_Death). ~0.55 m high, ~1.1 m wide.
 * ---------------------------------------------------------------------------------------------- */
async function crab() {
  const shell = new Builder();
  // Carapace: an octagonal slab, flattened, wider than long, with a raised ridge.
  const ring = [];
  for (let i = 0; i < 8; i++) { const a = ((i + 0.5) / 8) * Math.PI * 2; ring.push([Math.cos(a) * 0.48, -Math.sin(a) * 0.36]); }
  shell.prism(ring, 0.3, 0.48, 10, 8);
  shell.prism(ring.map(([x, z]) => [x * 0.75, z * 0.75]), 0.48, 0.58, 8, 9);
  // Eye stalks and eyes.
  for (const s of [-1, 1]) {
    shell.box(s * 0.13, 0.66, 0.24, 0.05, 0.18, 0.05, 11);
    shell.box(s * 0.13, 0.77, 0.24, 0.09, 0.09, 0.09, 12, 13);
  }
  const parts = [{ name: "Crab", builder: null }, { name: "body", builder: shell, parent: "Crab" }];
  // Legs: three a side, pivoting at the shell's rim.
  const legZ = [0.12, -0.04, -0.2];
  for (const s of [-1, 1]) {
    legZ.forEach((z, i) => {
      const leg = new Builder();
      leg.box(s * 0.16, 0.0, 0, 0.32, 0.06, 0.07, 9);            // upper, outwards from the pivot
      leg.box(s * 0.33, -0.15, 0, 0.06, 0.32, 0.06, 11);          // lower, down to the ground
      parts.push({ name: `leg_${s > 0 ? "r" : "l"}${i}`, builder: leg, parent: "body", translation: [s * 0.42, 0.36, z] });
    });
    // Claw arm: forearm forward and out, a big pincer.
    const claw = new Builder();
    claw.box(0, 0, 0.12, 0.09, 0.09, 0.26, 8);
    claw.box(s * 0.02, 0.02, 0.33, 0.2, 0.16, 0.2, 8, 9);
    claw.prism([[-0.09, 0.42], [0.09, 0.42], [0.03, 0.62], [-0.05, 0.6]].map(([x, z]) => [x + s * 0.02, z]), -0.04, 0.08, 11);
    parts.push({ name: `claw_${s > 0 ? "r" : "l"}`, builder: claw, parent: "body", translation: [s * 0.32, 0.4, 0.22], rotation: quatY(-s * 25) });
  }
  const { doc, nodes, buffer } = await modelDoc(parts);
  const root = doc.getRoot();
  // Animations: rotation keyframes per node.
  const anim = (name, duration, tracks) => {
    const a = doc.createAnimation(name);
    for (const [node, key, times, values] of tracks) {
      const sampler = doc.createAnimationSampler()
        .setInput(doc.createAccessor().setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer))
        .setOutput(doc.createAccessor().setType(key === "rotation" ? "VEC4" : "VEC3").setArray(new Float32Array(values.flat())).setBuffer(buffer))
        .setInterpolation("LINEAR");
      a.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes[node]).setTargetPath(key).setSampler(sampler));
    }
    void duration;
  };
  const legNames = ["l0", "l1", "l2", "r0", "r1", "r2"];
  const legSwing = (phase, amp, t, side) => quatZ(side * (Math.sin(t + phase) * amp));
  // Walk: alternating tripod gait, 0.5 s per cycle, the body bobbing.
  const walkT = [0, 0.125, 0.25, 0.375, 0.5];
  const walk = legNames.map((l, i) => {
    const side = l[0] === "l" ? 1 : -1, phase = (i % 2 === (l[0] === "l" ? 0 : 1) ? 0 : Math.PI);
    return [`leg_${l}`, "rotation", walkT, walkT.map((t) => { const q1 = legSwing(phase, 0.45, (t / 0.5) * Math.PI * 2, side), q2 = quatY(Math.cos((t / 0.5) * Math.PI * 2 + phase) * 22); return mulQ(q2, q1); })];
  });
  walk.push(["body", "translation", walkT, walkT.map((t) => [0, Math.abs(Math.sin((t / 0.5) * Math.PI * 2)) * 0.04, 0])]);
  walk.push(["claw_l", "rotation", walkT, walkT.map((t) => mulQ(quatY(25), quatX(Math.sin((t / 0.5) * Math.PI * 2) * 8)))]);
  walk.push(["claw_r", "rotation", walkT, walkT.map((t) => mulQ(quatY(-25), quatX(-Math.sin((t / 0.5) * Math.PI * 2) * 8)))]);
  anim("Crab_Walk", 0.5, walk);
  // Idle: claws flex, a slight sway.
  const idleT = [0, 0.6, 1.2];
  anim("Crab_Idle", 1.2, [
    ["claw_l", "rotation", idleT, [quatY(25), mulQ(quatY(35), quatX(-12)), quatY(25)]],
    ["claw_r", "rotation", idleT, [quatY(-25), mulQ(quatY(-35), quatX(-12)), quatY(-25)]],
    ["body", "translation", idleT, [[0, 0, 0], [0, 0.02, 0], [0, 0, 0]]],
  ]);
  // Attack: rear up, both claws snap forward and down.
  const atkT = [0, 0.18, 0.3, 0.55];
  anim("Crab_Attack", 0.55, [
    ["body", "rotation", atkT, [quatX(0), quatX(-22), quatX(10), quatX(0)]],
    ["claw_l", "rotation", atkT, [quatY(25), mulQ(quatY(5), quatX(-50)), mulQ(quatY(0), quatX(25)), quatY(25)]],
    ["claw_r", "rotation", atkT, [quatY(-25), mulQ(quatY(-5), quatX(-50)), mulQ(quatY(0), quatX(25)), quatY(-25)]],
  ]);
  // Hit: a jolt back.
  const hitT = [0, 0.1, 0.3];
  anim("Crab_Hit", 0.3, [["body", "rotation", hitT, [quatX(0), quatX(-14), quatX(0)]], ["body", "translation", hitT, [[0, 0, 0], [0, 0.05, -0.08], [0, 0, 0]]]]);
  // Death: flips onto its back, legs curl.
  const dT = [0, 0.25, 0.5, 0.9];
  const death = [
    ["body", "rotation", dT, [quatZ(0), quatZ(90), quatZ(180), quatZ(180)]],
    ["body", "translation", dT, [[0, 0, 0], [0, 0.35, 0], [0, 0.62, 0], [0, 0.6, 0]]],
  ];
  for (const l of legNames) { const side = l[0] === "l" ? 1 : -1; death.push([`leg_${l}`, "rotation", dT, [quatZ(0), quatZ(side * 30), quatZ(side * 60), quatZ(side * 70)]]); }
  anim("Crab_Death", 0.9, death);
  void root;
  const outPath = path.join(OUT, "crab.glb");
  await io.write(outPath, doc);
  console.log(`wrote crab.glb ${(fs.statSync(outPath).size / 1e3).toFixed(1)} KB`);
}
function mulQ(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
await crab();

/* ------------------------------------------------------------------------------------------------
 * Drowned skins for the zombie pack (shared swatch palette): pale, sea-green, bloated blue.
 * ---------------------------------------------------------------------------------------------- */
const ZSKINS = path.join(ROOT, "public/models/zombies/skins");
for (const [id, src, k] of [
  ["drowned_pale", "green", { saturation: 0.35, brightness: 0.95, tint: "#a9c3bd" }],
  ["drowned_kelp", "darkgreen", { saturation: 0.6, brightness: 0.9, tint: "#8fb79a" }],
  ["drowned_blue", "purple", { saturation: 0.45, brightness: 0.85, tint: "#8ea7c2" }],
]) {
  let img = sharp(path.join(ZSKINS, `${src}.webp`)).modulate({ saturation: k.saturation, brightness: k.brightness });
  img = sharp(await img.png().toBuffer()).tint(k.tint);
  fs.writeFileSync(path.join(OUT, "skins", `${id}.webp`), await img.webp({ quality: 90 }).toBuffer());
  console.log(`wrote skins/${id}.webp`);
}
