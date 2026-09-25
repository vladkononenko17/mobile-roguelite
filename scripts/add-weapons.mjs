// Adds the Hell-chapter rifles to public/models/weapons/weapons.glb (in place: the other weapons'
// sources are not needed). Sources: AR_2 / AR_3 (.gltf, flat colours, supplied in chat), local only
// in assets-src/new-ars/.
//
// Each source is re-oriented to the weapon convention (muzzle -Z, top +Y, origin at the pistol grip
// centre), scaled to a hand-held size and flattened into one node with two primitives:
// - the black / grey / white parts baked to vertex colours on the shared "flat" material;
// - the accent parts ("Main") on the weapon's own emissive material (cyan plasma / orange hellfire).
// Re-running replaces the weapons it builds.
//
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4
//   node scripts/add-weapons.mjs [source folder = assets-src/new-ars]
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weldPrimitive } from "@gltf-transform/functions";

const root = path.resolve(import.meta.dirname, "..");
const srcDir = path.resolve(process.argv[2] ?? path.join(root, "assets-src/new-ars"));
const outFile = path.join(root, "public/models/weapons/weapons.glb");

// grip: pistol grip centre in source space (x = toward the muzzle, y = up), measured on side views.
// palette: the source's Black / Grey / White recoloured (linear RGB) so each reads as its element
// from the top-down camera (the source White is the whole top surface).
const WEAPONS = [
  {
    file: "AR_2.gltf", node: "Plasma_Rifle", scale: 0.52, grip: [-0.22, 0.015], accent: [0.25, 0.85, 1], emissive: [0.2, 0.75, 1],
    palette: { Black: [0.02, 0.025, 0.03], Grey: [0.07, 0.08, 0.1], White: [0.26, 0.31, 0.36] },
  },
  {
    file: "AR_3.gltf", node: "Hellfire_Rifle", scale: 0.47, grip: [0.0, 0.01], accent: [1, 0.42, 0.08], emissive: [1, 0.36, 0.04],
    palette: { Black: [0.02, 0.012, 0.01], Grey: [0.07, 0.03, 0.025], White: [0.26, 0.055, 0.025] },
  },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(outFile);
const droot = doc.getRoot();
const scene = droot.getDefaultScene() ?? droot.listScenes()[0];
const buffer = droot.listBuffers()[0];
const flat = droot.listMaterials().find((m) => m.getName() === "flat");
if (!flat) throw new Error("weapons.glb has no shared 'flat' material");

for (const w of WEAPONS) {
  for (const old of scene.listChildren().filter((n) => n.getName() === w.node)) old.dispose();
  const src = await io.read(path.join(srcDir, w.file));
  // Gathered geometry per group: positions / normals / colours (flat) in weapon space.
  const groups = { flat: { p: [], n: [], c: [] }, glow: { p: [], n: [] } };
  const place = (x, y, z) => {
    // Source muzzle +X -> -Z; origin at the grip; scaled.
    const gx = x - w.grip[0], gy = y - w.grip[1];
    return [z * w.scale, gy * w.scale, -gx * w.scale];
  };
  for (const node of src.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      const glow = material.getName() === "Main";
      const g = glow ? groups.glow : groups.flat;
      const [r, gg, b] = w.palette[material.getName()] ?? material.getBaseColorFactor();
      const rgba = [r, gg, b].map((v) => Math.round(Math.min(1, v) * 255)).concat(255);
      const pos = prim.getAttribute("POSITION"), nrm = prim.getAttribute("NORMAL"), idx = prim.getIndices();
      const count = idx ? idx.getCount() : pos.getCount();
      for (let i = 0; i < count; i++) {
        const k = idx ? idx.getScalar(i) : i;
        const [x, y, z] = pos.getElement(k, []);
        g.p.push(...place(x * m[0] + y * m[4] + z * m[8] + m[12], x * m[1] + y * m[5] + z * m[9] + m[13], x * m[2] + y * m[6] + z * m[10] + m[14]));
        const [nx, ny, nz] = nrm.getElement(k, []);
        const tx = nx * m[0] + ny * m[4] + nz * m[8], ty = nx * m[1] + ny * m[5] + nz * m[9], tz = nx * m[2] + ny * m[6] + nz * m[10];
        const l = Math.hypot(tx, ty, tz) || 1;
        g.n.push(tz / l, ty / l, -tx / l);
        if (!glow) g.c.push(...rgba);
      }
    }
  }
  const mesh = doc.createMesh(w.node);
  const accessor = (type, array, normalized = false) => doc.createAccessor().setType(type).setArray(array).setNormalized(normalized).setBuffer(buffer);
  const flatPrim = doc.createPrimitive().setMaterial(flat)
    .setAttribute("POSITION", accessor("VEC3", new Float32Array(groups.flat.p)))
    .setAttribute("NORMAL", accessor("VEC3", new Float32Array(groups.flat.n)))
    .setAttribute("COLOR_0", accessor("VEC4", new Uint8Array(groups.flat.c), true));
  mesh.addPrimitive(flatPrim);
  if (groups.glow.p.length) {
    const glowMat = doc.createMaterial(`${w.node}_glow`).setBaseColorFactor([...w.accent, 1]).setEmissiveFactor(w.emissive).setRoughnessFactor(0.4).setMetallicFactor(0);
    mesh.addPrimitive(doc.createPrimitive().setMaterial(glowMat)
      .setAttribute("POSITION", accessor("VEC3", new Float32Array(groups.glow.p)))
      .setAttribute("NORMAL", accessor("VEC3", new Float32Array(groups.glow.n))));
  }
  for (const prim of mesh.listPrimitives()) weldPrimitive(prim);
  scene.addChild(doc.createNode(w.node).setMesh(mesh));
  const zs = groups.flat.p.filter((_, i) => i % 3 === 2);
  console.log(`${w.node}: ${groups.flat.p.length / 9 + groups.glow.p.length / 9} tris, z ${Math.min(...zs).toFixed(3)}..${Math.max(...zs).toFixed(3)}`);
}

await doc.transform(dedup(), prune());
await io.write(outFile, doc);
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
