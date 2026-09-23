// Packs the weapon GLBs ("assetpack-free": assault rifle, pistol, shotgun, sniper, grenade,
// knife) into one file for the PlayCanvas prototype: public/models/weapons/weapons.glb
//
// Each source weapon carries three 2048² maps (colour, normal, metal-rough). A hand-held weapon is
// a few dozen pixels on a phone, so textures are downsized to 512² WebP; meshes are untouched.
// Every weapon is wrapped in a node named after its file (e.g. "assault_rifle_2") so the runtime
// can find it.
//
// Not part of the normal build. To regenerate:
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 sharp
//   node scripts/build-weapons.mjs <folder with the weapon .glb files>
import fs from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, prune, textureCompress, unpartition } from "@gltf-transform/functions";
import sharp from "sharp";

const sourceDir = process.argv[2];
const outFile = path.resolve(import.meta.dirname, "../public/models/weapons/weapons.glb");
if (!sourceDir) throw new Error("usage: node scripts/build-weapons.mjs <source folder>");

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const target = new Document();
const scene = target.createScene("weapons");

for (const file of fs.readdirSync(sourceDir).filter((f) => f.endsWith(".glb")).sort()) {
  const doc = await io.read(path.join(sourceDir, file));
  const wrapper = doc.createNode(path.basename(file, ".glb"));
  for (const s of doc.getRoot().listScenes()) {
    for (const child of s.listChildren()) {
      s.removeChild(child);
      wrapper.addChild(child);
    }
  }
  doc.getRoot().listScenes()[0].addChild(wrapper);
  const map = mergeDocuments(target, doc);
  scene.addChild(map.get(wrapper));
}
for (const s of target.getRoot().listScenes()) if (s !== scene) s.dispose();
target.getRoot().setDefaultScene(scene);

await target.transform(
  unpartition(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], quality: 88 }),
  prune(),
);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
await io.write(outFile, target);
console.log(`weapons: ${scene.listChildren().map((n) => n.getName()).join(", ")}`);
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
