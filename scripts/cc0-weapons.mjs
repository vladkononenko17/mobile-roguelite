// Makes public/models/weapons/weapons.glb CC0-only (in place): drops every weapon that did not come
// from Pichuliru's "Flat Guns East" (CC0) and adds the Plasma and Hellfire rifles as recoloured,
// static copies of two East rifles, with their light detail parts (panels, markings) on an emissive "glow"
// material (cyan / ember). The East guns are flat-colour: one primitive per colour, so a recolour is
// a per-primitive vertex-colour swap.
//   node scripts/cc0-weapons.mjs
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune } from "@gltf-transform/functions";

const FILE = "public/models/weapons/weapons.glb";
const DROP = ["assault_rifle_2", "frag_grenade", "pistol_1", "shotgun_2", "sniper_2", "tactical_knife", "low_poly_axe", "Plasma_Rifle", "Hellfire_Rifle"];

// East palette (linear grey levels) -> new colour; "glow" moves the part onto the emissive material.
const VARIANTS = [
  {
    name: "Plasma_Rifle", from: "Rifle_Battle_East", glowColor: [0.25, 0.8, 1], emissive: [0.2, 0.75, 1],
    colors: { 0.004: [0.004, 0.005, 0.007], 0.008: [0.006, 0.008, 0.012], 0.031: [0.018, 0.028, 0.045], 0.071: [0.05, 0.06, 0.078], 0.212: "glow", 0.784: "glow", red: "glow" },
  },
  {
    name: "Hellfire_Rifle", from: "Sniper_Rifle_East", glowColor: [1, 0.42, 0.08], emissive: [1, 0.36, 0.04],
    colors: { 0.004: [0.005, 0.004, 0.004], 0.008: [0.01, 0.006, 0.005], 0.031: [0.05, 0.009, 0.006], 0.071: [0.1, 0.014, 0.009], 0.212: "glow", 0.784: "glow", red: "glow" },
  },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(FILE);
const root = doc.getRoot();
const scene = root.listScenes()[0];
const top = (name) => scene.listChildren().find((n) => n.getName() === name);

for (const name of DROP) top(name)?.dispose();

const key = (c) => (c[0] > c[1] + 0.05 ? "red" : String(+c[0].toFixed(3)));
for (const v of VARIANTS) {
  const src = top(v.from);
  if (!src) throw new Error(`missing ${v.from}`);
  const body = doc.createMaterial(`${v.name}_body`).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.6).setMetallicFactor(0.15);
  const glow = doc.createMaterial(`${v.name}_glow`).setBaseColorFactor([...v.glowColor, 1]).setEmissiveFactor(v.emissive).setRoughnessFactor(0.4).setMetallicFactor(0);
  const mesh = doc.createMesh(v.name);
  src.traverse((n) => {
    const m = n.getMesh();
    if (!m) return;
    const world = n.getWorldMatrix();
    const identity = world.every((x, i) => Math.abs(x - (i % 5 === 0 ? 1 : 0)) < 1e-6);
    if (!identity) throw new Error(`${v.from}: mesh node not at the weapon origin`);
    for (const p of m.listPrimitives()) {
      const q = p.clone();
      for (const sem of q.listSemantics()) if (sem.startsWith("JOINTS") || sem.startsWith("WEIGHTS")) q.setAttribute(sem, null);
      const col = q.getAttribute("COLOR_0");
      const c = col.getElement(0, []);
      const to = v.colors[key(c)];
      if (to === undefined) throw new Error(`${v.from}: no mapping for colour ${key(c)}`);
      if (to === "glow") {
        q.setAttribute("COLOR_0", null);
        q.setMaterial(glow);
      } else {
        const out = doc.createAccessor().setType("VEC4").setArray(new Float32Array(col.getCount() * 4));
        for (let i = 0; i < col.getCount(); i++) out.setElement(i, [...to, 1]);
        q.setAttribute("COLOR_0", out);
        q.setMaterial(body);
      }
      mesh.addPrimitive(q);
    }
  });
  scene.addChild(doc.createNode(v.name).setMesh(mesh));
  console.log(`${v.name}: ${mesh.listPrimitives().length} parts from ${v.from}`);
}

await doc.transform(prune(), dedup());
await io.write(FILE, doc);
console.log("weapons:", scene.listChildren().map((n) => n.getName()).join(", "));
