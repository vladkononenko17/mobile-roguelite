// Models the Black Tide's colourful small decor in code (CC0, made here): starfish, shells, coral,
// kelp, flowering bushes, ferns, a buoy and a tiki torch - flat-shaded low-poly on one palette
// texture, one GLB per model in assets-src/pirate/decor/ (scripts/build-pirate-kit.mjs merges
// them into the kit as "d:<name>"). Sizes in metres.
//   node scripts/build-pirate-decor.mjs   (needs @gltf-transform/core@4, sharp: npm i --no-save)
import fs from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "assets-src/pirate/decor");
fs.mkdirSync(OUT, { recursive: true });

const PALETTE = [
  "#2f6b2a", "#4f9a35", "#86c24a", "#e2303a", // 0 dark leaf, 1 leaf, 2 light leaf, 3 hibiscus red
  "#ffc928", "#ff7eb6", "#ff8a2a", "#8a4fd6", // 4 yellow, 5 pink, 6 orange, 7 purple
  "#ff6f61", "#f4efe2", "#d9332b", "#c9a24a", // 8 coral, 9 white, 10 buoy red, 11 bamboo
  "#5a3a22", "#f2d3a8", "#2aa58a", "#e04bc0", // 12 dark wood, 13 shell cream, 14 kelp teal, 15 magenta
];
const swatchUV = (i) => [((i % 4) + 0.5) / 4, (Math.floor(i / 4) + 0.5) / 4];

class B {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.idx = []; }
  face(verts, swatch, outward) {
    const [u, v] = swatchUV(swatch);
    const a = verts[0], b = verts[1], c = verts[2];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (outward && n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0) { verts = verts.slice().reverse(); n = n.map((x) => -x); }
    const l = Math.hypot(...n) || 1;
    n = n.map((x) => x / l);
    const base = this.pos.length / 3;
    for (const p of verts) { this.pos.push(...p); this.nrm.push(...n); this.uv.push(u, v); }
    for (let i = 1; i < verts.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
    return this;
  }
  /** Both sides of a thin polygon (leaves, fans). */
  leaf(verts, swatch) {
    const a = verts[0], b = verts[1], c = verts[2];
    const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    this.face(verts, swatch, n);
    this.face(verts, swatch, n.map((x) => -x));
    return this;
  }
  prism(ring, y0, y1, swatch, top = swatch, shrink = 1) {
    const n = ring.length;
    const cx = ring.reduce((k, p) => k + p[0], 0) / n, cz = ring.reduce((k, p) => k + p[1], 0) / n;
    const up = ring.map(([x, z]) => [cx + (x - cx) * shrink, y1, cz + (z - cz) * shrink]);
    this.face(up, top, [0, 1, 0]);
    this.face(ring.map(([x, z]) => [x, y0, z]), swatch, [0, -1, 0]);
    for (let i = 0; i < n; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n];
      this.face([[x0, y0, z0], [x1, y0, z1], up[(i + 1) % n], up[i]], swatch, [(x0 + x1) / 2 - cx, 0, (z0 + z1) / 2 - cz]);
    }
    return this;
  }
  /** An n-gon frustum along Y, radius r0 at y0 to r1 at y1. */
  tube(r0, r1, y0, y1, n, swatch, top = swatch) {
    const ring = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ring.push([Math.cos(a) * r0, -Math.sin(a) * r0]); }
    return this.prism(ring, y0, y1, swatch, top, r0 > 0 ? r1 / r0 : 1);
  }
  /** Rotates (degrees about X, then Z, then Y) and moves everything built so far. */
  move(rx = 0, rz = 0, ry = 0, t = [0, 0, 0]) {
    const rot = (v) => {
      let [x, y, z] = v;
      let a = (rx * Math.PI) / 180; [y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
      a = (rz * Math.PI) / 180; [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
      a = (ry * Math.PI) / 180; [x, z] = [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
      return [x, y, z];
    };
    for (let i = 0; i < this.pos.length; i += 3) {
      const p = rot([this.pos[i], this.pos[i + 1], this.pos[i + 2]]);
      this.pos[i] = p[0] + t[0]; this.pos[i + 1] = p[1] + t[1]; this.pos[i + 2] = p[2] + t[2];
      const n = rot([this.nrm[i], this.nrm[i + 1], this.nrm[i + 2]]);
      this.nrm[i] = n[0]; this.nrm[i + 1] = n[1]; this.nrm[i + 2] = n[2];
    }
    return this;
  }
  add(b) {
    const base = this.pos.length / 3;
    this.pos.push(...b.pos); this.nrm.push(...b.nrm); this.uv.push(...b.uv);
    this.idx.push(...b.idx.map((i) => i + base));
    return this;
  }
}

let seed = 11;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

/** Starfish: five tapering arms, a raised middle. */
const starfish = (sw) => {
  const b = new B();
  const R = 0.22, r = 0.07;
  const ring = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const k = i % 2 ? r : R; ring.push([Math.cos(a) * k, -Math.sin(a) * k]); }
  // A star is not convex: fan it from the centre.
  for (let i = 0; i < 10; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % 10];
    b.face([[0, 0.05, 0], [x0, 0.015, z0], [x1, 0.015, z1]], sw, [0, 1, 0]);
  }
  return b;
};
/** Conch: a twisted cone on its side. */
const shell = () => {
  const b = new B().tube(0.11, 0.0, 0, 0.3, 7, 13, 5).tube(0.12, 0.08, -0.04, 0.02, 7, 5);
  return b.move(90, 0, 0, [0, 0.1, -0.12]);
};
/** Branching coral. */
const coral = (sw, tip) => {
  const b = new B();
  const branch = (len, r, rx, rz, ry, base) => b.add(new B().tube(r, r * 0.6, 0, len, 5, sw, tip).move(rx, rz, ry, base));
  branch(0.9, 0.09, 0, 0, 0, [0, 0, 0]);
  for (let i = 0; i < 6; i++) {
    const ry = i * 60 + rnd() * 30, h = 0.15 + rnd() * 0.5;
    branch(0.45 + rnd() * 0.45, 0.06, 0, 30 + rnd() * 25, ry, [0, h, 0]);
  }
  return b;
};
/** Sea fan: a flat lacy fan on a stalk. */
const fan = () => {
  const b = new B().tube(0.04, 0.03, 0, 0.3, 5, 12);
  const pts = [];
  for (let i = 0; i <= 8; i++) { const a = Math.PI * (0.1 + 0.8 * (i / 8)); pts.push([Math.cos(a) * 0.65, 0.3 + Math.sin(a) * 0.75, 0]); }
  for (let i = 0; i < 8; i++) b.leaf([[0, 0.3, 0], pts[i], pts[i + 1]], i % 2 ? 7 : 15);
  return b;
};
/** Kelp: a few tall wavy strands. */
const kelp = () => {
  const b = new B();
  for (let s = 0; s < 4; s++) {
    const ox = (rnd() - 0.5) * 0.5, oz = (rnd() - 0.5) * 0.5, h = 1.2 + rnd() * 0.9;
    for (let k = 0; k < 5; k++) {
      const y0 = (h * k) / 5, y1 = (h * (k + 1)) / 5, w = 0.14 * (1 - k / 6);
      const sx0 = Math.sin(k * 1.3 + s) * 0.12, sx1 = Math.sin((k + 1) * 1.3 + s) * 0.12;
      b.leaf([[ox + sx0 - w, y0, oz], [ox + sx0 + w, y0, oz], [ox + sx1 + w * 0.8, y1, oz], [ox + sx1 - w * 0.8, y1, oz]], k % 2 ? 14 : 1);
    }
  }
  return b;
};
/** Flowering bush: a cluster of leafy blobs studded with flowers. */
const bush = (flower) => {
  const b = new B();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, d = i ? 0.35 : 0, r = 0.42 + rnd() * 0.18;
    b.add(new B().tube(r, r * 0.45, 0, 0.55 + rnd() * 0.3, 6, i % 2 ? 0 : 1, 2).move(0, 0, rnd() * 60, [Math.cos(a) * d, 0, Math.sin(a) * d]));
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = 0.2 + rnd() * 0.45, y = 0.5 + rnd() * 0.35;
    const f = new B().tube(0.1, 0.02, 0, 0.08, 5, flower, 4);
    b.add(f.move(rnd() * 30, rnd() * 30, 0, [Math.cos(a) * d, y, Math.sin(a) * d]));
  }
  return b;
};
/** Fern / palm sprout: long leaves fanning out from the ground. */
const fern = () => {
  const b = new B();
  for (let i = 0; i < 9; i++) {
    const ry = (i / 9) * 360 + rnd() * 20, len = 0.8 + rnd() * 0.5, lift = 25 + rnd() * 35;
    const l = new B().leaf([[0, 0, -0.04], [0, 0, 0.04], [len * 0.55, 0.12, 0.13], [len, 0.02, 0], [len * 0.55, 0.12, -0.13]], i % 3 ? 1 : 2);
    b.add(l.move(0, lift, ry, [0, 0.02, 0]));
  }
  return b;
};
/** Buoy: red and white bands, a cone top, a little flag. */
const buoy = () => {
  const b = new B().tube(0.45, 0.45, 0, 0.35, 8, 10).tube(0.45, 0.4, 0.35, 0.65, 8, 9).tube(0.4, 0.1, 0.65, 1.05, 8, 10);
  b.add(new B().tube(0.03, 0.03, 1.0, 1.6, 4, 12));
  b.leaf([[0.03, 1.6, 0], [0.4, 1.5, 0], [0.03, 1.38, 0]], 4);
  return b;
};
/** Tiki torch: a bamboo pole with a bowl (the flame is an AmbientFx fire). */
const tiki = () => {
  const b = new B().tube(0.06, 0.05, 0, 1.8, 6, 11);
  for (const y of [0.5, 1.0, 1.5]) b.add(new B().tube(0.075, 0.075, y, y + 0.05, 6, 12));
  b.add(new B().tube(0.12, 0.2, 1.8, 2.05, 6, 12, 6));
  return b;
};
/** Seashells scattered (a small pile): cockles in cream, pink and orange. */
const shells = () => {
  const b = new B();
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 0.45;
    b.add(new B().tube(0.08, 0.02, 0, 0.05, 6, [13, 5, 6, 9][i % 4]).move(0, 0, 0, [Math.cos(a) * d, 0, Math.sin(a) * d]));
  }
  return b;
};

async function paletteImage() {
  const raw = Buffer.alloc(64);
  PALETTE.forEach((hex, i) => { const v = parseInt(hex.slice(1), 16); raw.set([(v >> 16) & 255, (v >> 8) & 255, v & 255, 255], i * 4); });
  return sharp(raw, { raw: { width: 4, height: 4, channels: 4 } }).png().toBuffer();
}

const io = new NodeIO();
const MODELS = {
  starfish: () => starfish(6), starfishPurple: () => starfish(7), starfishRed: () => starfish(3), conch: shell, shells,
  coralPink: () => coral(8, 5), coralOrange: () => coral(6, 4), seaFan: fan, kelp,
  bushRed: () => bush(3), bushYellow: () => bush(4), bushPink: () => bush(5), fern, buoy, tiki,
};
for (const [name, make] of Object.entries(MODELS)) {
  const b = make();
  const doc = new Document();
  const buffer = doc.createBuffer();
  const texture = doc.createTexture("decor").setImage(await paletteImage()).setMimeType("image/png");
  const material = doc.createMaterial("decor").setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(0.8);
  material.getBaseColorTextureInfo().setMagFilter(9728).setMinFilter(9728);
  const prim = doc.createPrimitive().setMaterial(material)
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(b.pos)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(b.nrm)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(b.uv)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(b.idx)).setBuffer(buffer));
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
  doc.createScene().addChild(node);
  await io.write(path.join(OUT, `${name}.glb`), doc);
}
console.log(`wrote ${Object.keys(MODELS).length} decor models to ${OUT}`);
