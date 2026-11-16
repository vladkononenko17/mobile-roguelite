// Measures hero models against the hold standard (docs/HERO_HOLD.md): bind-pose hand, forearm and
// sleeve proportions per side, and weapon lengths. node scripts/measure-heroes.mjs [hero ...]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
export const FILES = { survivor: "public/models/survivor/survivor.glb", medic: "public/models/heroes/medic.glb", demolitionist: "public/models/heroes/demolitionist.glb", drifter: "public/models/heroes/drifter.glb" };

const inv = (m) => { // 4x4 column-major inverse (affine)
  const [a, b, c, , d, e, f, , g, h, i, , x, y, z] = m;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + c * C;
  const r = [A / det, (c * h - b * i) / det, (b * f - c * e) / det, 0, B / det, (a * i - c * g) / det, (c * d - a * f) / det, 0, C / det, (b * g - a * h) / det, (a * e - b * d) / det, 0, 0, 0, 0, 1];
  r[12] = -(r[0] * x + r[4] * y + r[8] * z); r[13] = -(r[1] * x + r[5] * y + r[9] * z); r[14] = -(r[2] * x + r[6] * y + r[10] * z);
  return r;
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v) => Math.hypot(...v);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export async function measure(file) {
  const doc = await io.read(path.join(ROOT, file));
  const skin = doc.getRoot().listSkins()[0];
  const joints = skin.listJoints(), ibm = skin.getInverseBindMatrices();
  const J = {}; // bind-pose joint world positions
  joints.forEach((j, i) => { const m = inv(ibm.getElement(i, [])); J[j.getName().replace("mixamorig:", "")] = [m[12], m[13], m[14]]; });
  // Skinned vertices with their dominant joint and material.
  const verts = [];
  for (const node of doc.getRoot().listNodes()) {
    if (node.getSkin() !== skin) continue;
    for (const p of node.getMesh().listPrimitives()) {
      const mat = p.getMaterial()?.getName() ?? "";
      const P = p.getAttribute("POSITION"), JO = p.getAttribute("JOINTS_0"), W = p.getAttribute("WEIGHTS_0");
      const v = [], j = [], w = [];
      for (let i = 0; i < P.getCount(); i++) {
        P.getElement(i, v); JO.getElement(i, j); W.getElement(i, w);
        const k = w.indexOf(Math.max(...w));
        verts.push({ p: [...v], bone: joints[j[k]].getName().replace("mixamorig:", ""), mat });
      }
    }
  }
  // Skin space -> metres: the skinned node's world scale (the Survivor's mesh sits under a 100x node).
  const skinned = doc.getRoot().listNodes().find((n) => n.getSkin() === skin);
  const scale = Math.hypot(...skinned.getWorldMatrix().slice(0, 3));
  const out = { height: 0 };
  let ymin = Infinity, ymax = -Infinity;
  for (const v of verts) { ymin = Math.min(ymin, v.p[1]); ymax = Math.max(ymax, v.p[1]); }
  out.height = (ymax - ymin) * scale;
  for (const side of ["Left", "Right"]) {
    const s = side[0];
    const hand = J[`${side}Hand`], fore = J[`${side}ForeArm`], arm = J[`${side}Arm`];
    // Fingertip: the furthest hand-or-finger vertex from the wrist along the hand.
    const handDir = sub(J[`${side}HandIndex1`], hand);
    let tip = 0;
    const handVerts = verts.filter((v) => v.bone.startsWith(`${side}Hand`));
    for (const v of handVerts) tip = Math.max(tip, dot(sub(v.p, hand), handDir) / len(handDir));
    // Hand width: across the palm (T-pose: the palm faces down, the knuckles run along z).
    const across = [0, 0, 1];
    let wMin = Infinity, wMax = -Infinity;
    for (const v of handVerts) { const t = dot(sub(v.p, hand), across) / len(across); wMin = Math.min(wMin, t); wMax = Math.max(wMax, t); }
    // Radii round the forearm axis: at the wrist (last 15%), mid forearm, mid upper arm; outermost layer.
    const radius = (a, b, t0, t1) => {
      const ax = sub(b, a), L = len(ax);
      let r = 0;
      for (const v of verts) {
        const d = sub(v.p, a), t = dot(d, ax) / (L * L);
        if (t < t0 || t > t1) continue;
        const perp = Math.sqrt(Math.max(0, dot(d, d) - (t * L) ** 2));
        if (perp < 0.25 / scale * 0.5) r = Math.max(r, perp);
      }
      return r;
    };
    out[`${s}.handLen`] = tip * scale;
    out[`${s}.handWidth`] = (wMax - wMin) * scale;
    out[`${s}.forearmLen`] = len(sub(hand, fore)) * scale;
    out[`${s}.upperArmLen`] = len(sub(fore, arm)) * scale;
    out[`${s}.wristR`] = radius(fore, hand, 0.85, 1.0) * scale;
    out[`${s}.forearmR`] = radius(fore, hand, 0.4, 0.6) * scale;
    out[`${s}.upperArmR`] = radius(arm, fore, 0.4, 0.6) * scale;
  }
  return out;
}

// Gun lengths (muzzle to butt / grip back), metres, from the weapons GLB's top-level nodes.
export async function gunLengths() {
  const doc = await io.read(path.join(ROOT, "public/models/weapons/weapons.glb"));
  const { getBounds } = await import("@gltf-transform/core");
  const out = {};
  for (const n of doc.getRoot().listScenes()[0].listChildren()) { const b = getBounds(n); out[n.getName()] = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]); }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
const heroes = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FILES);
const rows = {};
for (const h of heroes) rows[h] = await measure(FILES[h]);
const keys = Object.keys(rows[heroes[0]]);
console.log(["".padEnd(14), ...heroes.map((h) => h.padStart(14))].join(""));
for (const k of keys) console.log([k.padEnd(14), ...heroes.map((h) => (rows[h][k] * (k === "height" ? 1 : 100)).toFixed(k === "height" ? 2 : 1).padStart(14))].join(""));
console.log("(height in m, the rest in cm)");
const guns = await gunLengths();
console.log("guns (cm):", Object.entries(guns).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}`).join(", "));
}
