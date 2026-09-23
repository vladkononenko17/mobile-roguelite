// Packs the CC0 prop GLBs from 3dassets.dev into one file for the PlayCanvas level:
// public/models/props/wasteland-props.glb
//
// Draw calls are what matter on mobile, so the file is shaped for the static batcher:
// - every untextured material (rust, steel, rubber, ...) is baked into vertex colours on ONE
//   shared "palette" material; only the three textured materials (panel, concrete, timber) stay,
//   so all props together cost 4 draw calls per batch cell instead of one per material;
// - colours are muted here (pulled towards grey and dimmed, bright lamps/screens harder) so the
//   props sit in the level's muted palette and the hero stays the most saturated thing on screen;
// - animations and glass transmission are dropped, meshes simplified, textures downsized to 512,
//   and vertex data stored as plain floats (the engine prefers 4-byte aligned attributes).
//
// Not part of the normal build. To regenerate:
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp
//   node scripts/build-props.mjs <folder with the downloaded .glb files>
// Each source file is named after its prop id (see PROP_DEFS in src/playcanvas/world/props/PropLibrary.ts).
import fs from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, dequantize, mergeDocuments, prune, simplify, textureCompress, unpartition, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

/** Colour muting (sRGB): 1 = original saturation, 0 = grey; brightness multiplies the result. */
const MUTE = { saturation: 0.55, brightness: 0.78 };
/** Metals lose their reflections when baked to flat colour; darken them so steel does not read white. */
const METAL_DARKEN = 0.6;
const ACCENTS = new Set(["lamp", "signal", "screen", "warn", "glass"]);
const ACCENT_MUTE = { saturation: 0.3, brightness: 0.45 };

const sourceDir = process.argv[2];
const outFile = path.resolve(import.meta.dirname, "../public/models/props/wasteland-props.glb");
if (!sourceDir) throw new Error("usage: node scripts/build-props.mjs <source folder>");

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const target = new Document();
const scene = target.createScene("props");

for (const file of fs.readdirSync(sourceDir).filter((f) => f.endsWith(".glb")).sort()) {
  const id = path.basename(file, ".glb");
  const doc = await io.read(path.join(sourceDir, file));
  for (const animation of doc.getRoot().listAnimations()) animation.dispose();
  // Wrap each file's scene in one node named after the prop, so the runtime can find it.
  const wrapper = doc.createNode(id);
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
for (const ext of target.getRoot().listExtensionsUsed()) {
  if (ext.extensionName === "KHR_materials_transmission") ext.dispose();
}

const before = countTriangles(target);
await target.transform(unpartition(), dequantize(), weld());

// Bake untextured materials into vertex colours on one shared material.
const palette = target.createMaterial("palette").setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.8).setMetallicFactor(0);
const buffer = target.getRoot().listBuffers()[0];
for (const mesh of target.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const material = prim.getMaterial();
    if (!material || material.getBaseColorTexture()) continue;
    const settings = ACCENTS.has(material.getName()) ? ACCENT_MUTE : MUTE;
    const metal = material.getMetallicFactor() >= 0.5 ? METAL_DARKEN : 1;
    const colour = mute(material.getBaseColorFactor(), { ...settings, brightness: settings.brightness * metal });
    const count = prim.getAttribute("POSITION").getCount();
    // Normalised RGBA bytes: 4 bytes per vertex, aligned.
    const rgba = [...colour.map((v) => Math.round(v * 255)), 255];
    const colours = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) colours.set(rgba, i * 4);
    const accessor = target.createAccessor().setType("VEC4").setArray(colours).setNormalized(true).setBuffer(buffer);
    prim.setAttribute("COLOR_0", accessor);
    // Same vertex layout for every palette primitive, so they all batch together.
    for (const semantic of prim.listSemantics()) {
      if (!["POSITION", "NORMAL", "COLOR_0"].includes(semantic)) prim.setAttribute(semantic, null);
    }
    prim.setMaterial(palette);
  }
}
// Textured materials: unify by name across files and mute their colour factor.
const byName = new Map();
for (const material of target.getRoot().listMaterials()) {
  if (material === palette || !material.getBaseColorTexture()) continue;
  const keep = byName.get(material.getName());
  if (keep) {
    for (const parent of material.listParents()) if (parent !== target.getRoot()) parent.swap(material, keep);
    material.dispose();
    continue;
  }
  byName.set(material.getName(), material);
  material.setBaseColorFactor([...mute(material.getBaseColorFactor(), MUTE), 1]);
  material.setMetallicFactor(Math.min(material.getMetallicFactor(), 0.1));
  material.setRoughnessFactor(Math.max(material.getRoughnessFactor(), 0.85));
}

await target.transform(
  dedup(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.01 }),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], quality: 85 }),
  prune(),
);
// Vehicle tyres are modelled with tread lugs as separate islands, which the topology-preserving
// simplifier cannot collapse; from the top-down camera a smooth tyre reads the same.
await MeshoptSimplifier.ready;
for (const node of target.getRoot().listNodes()) {
  if (!/wheel/.test(node.getName()) || !node.getMesh()) continue;
  for (const prim of node.getMesh().listPrimitives()) {
    const indices = prim.getIndices();
    if (!indices || indices.getCount() < 1200) continue;
    const positions = prim.getAttribute("POSITION").getArray();
    const [simplified] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(indices.getArray()), Float32Array.from(positions), 3, null, Math.floor(indices.getCount() / 3 / 3) * 3, 0.1);
    indices.setArray(positions.length / 3 > 65535 ? simplified : Uint16Array.from(simplified));
  }
}
await target.transform(prune());

fs.mkdirSync(path.dirname(outFile), { recursive: true });
await io.write(outFile, target);

console.log(`materials: ${target.getRoot().listMaterials().map((m) => m.getName()).join(", ")}`);
console.log(`textures: ${target.getRoot().listTextures().length}, triangles ${before} -> ${countTriangles(target)}`);
for (const node of scene.listChildren()) console.log(`  ${node.getName().padEnd(20)} ${countTriangles(target, node)} tris`);
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);

/** Mutes a linear glTF colour in sRGB space and returns it linear again. */
function mute([r, g, b], { saturation, brightness }) {
  const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
  const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const c = [r, g, b].map(toSrgb);
  const grey = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return c.map((v) => toLinear(Math.min(1, (grey + (v - grey) * saturation) * brightness)));
}

function countTriangles(doc, root) {
  let total = 0;
  const visit = (node) => {
    const mesh = node.getMesh();
    if (mesh) for (const p of mesh.listPrimitives()) total += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3;
    node.listChildren().forEach(visit);
  };
  (root ? [root] : doc.getRoot().listScenes().flatMap((s) => s.listChildren())).forEach(visit);
  return total;
}
