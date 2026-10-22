// Builds public/models/raven/raven.glb from the Blender export (scripts/export-raven.py): the CC0
// "Raven" (opengameart.org/content/raven-0), ~590 polygons, rigged, one "fly" clip. Its texture did
// not survive the old .blend, so it gets a flat crow black with a blue sheen; scaled to a ~1 m span.
//
//   node scripts/build-raven.mjs
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune } from "@gltf-transform/functions";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path.join(ROOT, "assets-src/raven/raven_raw.glb"));
const root = doc.getRoot();
for (const m of root.listMaterials()) m.setBaseColorTexture(null).setBaseColorFactor([0.035, 0.037, 0.045, 1]).setMetallicFactor(0).setRoughnessFactor(0.55);
// A ~1.05 m wingspan (the source spans 4.2 units).
const wrapper = doc.createNode("raven").setScale([0.25, 0.25, 0.25]);
const scene = root.listScenes()[0];
for (const child of scene.listChildren()) { scene.removeChild(child); wrapper.addChild(child); }
scene.addChild(wrapper);
await doc.transform(prune(), dedup());
const out = path.join(ROOT, "public/models/raven/raven.glb");
fs.mkdirSync(path.dirname(out), { recursive: true });
await io.write(out, doc);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB), clips: ${root.listAnimations().map((a) => a.getName()).join(", ")}`);
