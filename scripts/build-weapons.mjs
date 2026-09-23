// Packs the weapon GLBs into one file for the PlayCanvas prototype: public/models/weapons/weapons.glb
// Sources: "assetpack-free" (textured: assault rifle, pistol, shotgun, sniper, grenade, knife),
// "Flat Guns East" (10 flat-colour guns) and the low poly axe (converted by scripts/fbx-to-glb.mjs).
//
// - Textures are downsized to 512² WebP: a hand-held weapon is a few dozen pixels on a phone.
// - Untextured (flat-colour) materials are baked into vertex colours on one shared "flat" material,
//   so a Flat Guns weapon is one draw call instead of 6-8.
// - Meshes are otherwise untouched. Every weapon is wrapped in a node named after its file (e.g.
//   "assault_rifle_2", "Rifle_Assault_East") so the runtime can find it.
//
// Not part of the normal build. To regenerate:
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 sharp
//   node scripts/build-weapons.mjs <folder with .glb files> [more folders...]
import fs from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, dequantize, mergeDocuments, prune, textureCompress, unpartition } from "@gltf-transform/functions";
import sharp from "sharp";

const sourceDirs = process.argv.slice(2);
const outFile = path.resolve(import.meta.dirname, "../public/models/weapons/weapons.glb");
if (!sourceDirs.length) throw new Error("usage: node scripts/build-weapons.mjs <source folder> [more folders...]");

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const target = new Document();
const scene = target.createScene("weapons");

const files = sourceDirs.flatMap((dir) => fs.readdirSync(dir).filter((f) => f.endsWith(".glb")).sort().map((f) => path.join(dir, f)));
for (const file of files) {
  const doc = await io.read(file);
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

await target.transform(unpartition(), dequantize());
const flat = target.createMaterial("flat").setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.75).setMetallicFactor(0);
const buffer = target.getRoot().listBuffers()[0];
for (const mesh of target.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const material = prim.getMaterial();
    if (!material || material.getBaseColorTexture()) continue;
    const [r, g, b] = material.getBaseColorFactor();
    const rgba = [r, g, b].map((v) => Math.round(Math.min(1, v) * 255)).concat(255);
    const count = prim.getAttribute("POSITION").getCount();
    const colours = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) colours.set(rgba, i * 4);
    prim.setAttribute("COLOR_0", target.createAccessor().setType("VEC4").setArray(colours).setNormalized(true).setBuffer(buffer));
    for (const semantic of prim.listSemantics()) {
      if (!["POSITION", "NORMAL", "COLOR_0"].includes(semantic)) prim.setAttribute(semantic, null);
    }
    prim.setMaterial(flat);
  }
}

await target.transform(
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], quality: 88 }),
  prune(),
);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
await io.write(outFile, target);
console.log(`weapons: ${scene.listChildren().map((n) => n.getName()).join(", ")}`);
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
