// Shared by scripts/build-city-additions.mjs and scripts/build-orion-additions.mjs: adds textured
// third-party models to one of the game's environment kits (a GLB of named nodes read by ModelKit),
// replacing nodes of the same id, so the step is idempotent and can run over the committed kit.
//
// Per model: animations dropped; base-colour textures graded (saturation, brightness, a colour laid
// over, a hue turn) once per (image, recipe); normal maps dropped; vertex attributes cut to position,
// normal and UV; optional simplification (topology-preserving `ratio`, or the sloppy one for meshes
// of many small islands); scaled to a target size and set on the ground. Then the kit is deduplicated
// and the new PNGs stored as 512 px WebP.
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compactPrimitive, dedup, getBounds, mergeDocuments, prune, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

/**
 * @param {object} o
 * @param {string} o.kit  path of the kit GLB (read and rewritten)
 * @param {Record<string, [string, {h?: number, len?: number, k?: number}, Record<string, string>]>} o.models
 *   id -> [source glTF, target size ({ h } height, { len } longest ground side, { k } scale), grade per texture file name ("*": default)]
 * @param {Record<string, {saturation: number, brightness: number, hue?: number, dust?: [number, number, number, number]}>} o.grades
 * @param {Record<string, number>} [o.ratio]  topology-preserving simplification ratio per id
 * @param {Record<string, number>} [o.sloppy] sloppy simplification ratio per id
 * @param {(id: string, doc: import("@gltf-transform/core").Document) => void} [o.tweak]  per-model edits before scaling
 * @param {Record<string, number>} [o.rescale]  existing kit models to resize (factor of their original size; idempotent)
 * @param {string[]} [o.remove]  existing kit models to drop (no longer placed anywhere)
 */
export async function addToKit({ kit: KIT, models: MODELS, grades: GRADES, ratio: RATIO = {}, sloppy: SLOPPY = {}, tweak, rescale = {}, remove = [] }) {
await MeshoptSimplifier.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const kit = await io.read(KIT);
const scene = kit.getRoot().getDefaultScene() ?? kit.getRoot().listScenes()[0];
// Drop what is replaced (and anything this script added before).
for (const node of scene.listChildren()) if (MODELS[node.getName()] || remove.includes(node.getName())) { scene.removeChild(node); node.dispose(); }
// Resized models: the factor goes on the model's children (ModelKit sets the model node's own scale
// when it places a copy). Each child keeps its original transform in extras, so running again does
// not compound.
for (const node of scene.listChildren()) {
  const f = rescale[node.getName()];
  if (!f) continue;
  for (const child of node.listChildren()) {
    const extras = child.getExtras();
    const base = extras.base ?? { s: child.getScale(), t: child.getTranslation() };
    child.setExtras({ ...extras, base }).setScale(base.s.map((v) => v * f)).setTranslation(base.t.map((v) => v * f));
  }
}
await kit.transform(prune());

const graded = new Map();
async function grade(image, recipe) {
  const key = `${recipe}:${image.length}:${image.subarray(0, 64).toString("hex")}`;
  if (graded.has(key)) return graded.get(key);
  const g = GRADES[recipe];
  let img = sharp(image).modulate({ saturation: g.saturation, brightness: g.brightness, ...(g.hue ? { hue: g.hue } : {}) });
  const meta = await sharp(image).metadata();
  if (g.dust) {
    const [r, gg, b, a] = g.dust;
    const over = await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: { r, g: gg, b, alpha: a } } }).png().toBuffer();
    // Dust over the colour only: the alpha (leaf cut-outs) is kept from the source.
    const rgb = await img.removeAlpha().composite([{ input: over, blend: "over" }]).toBuffer();
    img = meta.hasAlpha ? sharp(rgb).joinChannel(await sharp(image).extractChannel("alpha").toBuffer()) : sharp(rgb);
  }
  const out = await img.png().toBuffer();
  graded.set(key, out);
  return out;
}

const target = kit;
for (const [id, [file, size, grades]] of Object.entries(MODELS)) {
  const doc = await io.read(file);
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  // Static props: no skeletons (a skinned mesh in the kit breaks PlayCanvas's bounds for the batch).
  for (const node of doc.getRoot().listNodes()) node.setSkin(null);
  for (const skin of doc.getRoot().listSkins()) skin.dispose();
  // Textures: graded once per (image, recipe); no normal maps; no emission (KayKit windows).
  for (const m of doc.getRoot().listMaterials()) {
    m.setNormalTexture(null).setMetallicFactor(0).setRoughnessFactor(0.92);
    if (m.getAlphaMode() === "BLEND") m.setAlphaMode("MASK").setAlphaCutoff(0.4);
    const tex = m.getBaseColorTexture();
    if (tex) {
      const name = path.basename(tex.getURI() || tex.getName() || "");
      const recipe = grades[name] ?? grades["*"];
      tex.setImage(await grade(Buffer.from(tex.getImage()), recipe)).setMimeType("image/png");
      tex.setURI(`${recipe}-${(name || "atlas.png").replace(/\.png$/, "")}.png`);
      // One shared material per graded texture across the kit (dedup merges them by content).
      m.setName(`${recipe}-${m.getName()}`);
    }
  }
  for (const t of doc.getRoot().listTextures()) if (!doc.getRoot().listMaterials().some((m) => m.getBaseColorTexture() === t)) t.dispose();
  // Fewer triangles where the camera never gets close enough to tell (vehicles are seen top-down,
  // trees mostly as crowns): the topology-preserving simplifier keeps UVs and silhouettes.
  // Only what the kit's textured materials read: position, normal, UV (the nature pack's vertex
  // colours drive a wind shader we do not have).
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) for (const sem of p.listSemantics()) if (!["POSITION", "NORMAL", "TEXCOORD_0"].includes(sem)) p.setAttribute(sem, null);
  const ratio = RATIO[id];
  if (ratio) await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004 }));
  // Branches and armour plates are many small islands the simplifier above cannot merge: thin these
  // with the sloppy one (the camera sees them from 15 m up).
  if (SLOPPY[id]) {
    for (const m of doc.getRoot().listMeshes()) for (const prim of m.listPrimitives()) {
      const indices = prim.getIndices(), position = prim.getAttribute("POSITION");
      if (!indices || prim.getMode() !== 4 || position.getNormalized() || position.getComponentSize() !== 4) continue;
      // Leaf cards stay: they are already two triangles each.
      if (/leav|leaf/i.test(prim.getMaterial()?.getName() ?? "")) continue;
      const count = indices.getCount(), goal = Math.min(count, Math.max(36, Math.floor((count * SLOPPY[id]) / 3) * 3));
      const [out] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(indices.getArray()), Float32Array.from(position.getArray()), 3, null, goal, 0.02);
      indices.setArray(position.getCount() > 65535 ? out : Uint16Array.from(out));
      compactPrimitive(prim);
    }
    await doc.transform(prune());
  }
  tweak?.(id, doc);
  // Scale to the target size.
  const src = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const { min, max } = getBounds(src);
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const k = size.k ?? (size.h ? size.h / ext[1] : size.len / Math.max(ext[0], ext[2]));
  const wrapper = doc.createNode(id);
  const inner = doc.createNode(`${id}-scale`).setScale([k, k, k]);
  // Sit on the ground (some sources have their origin mid-height).
  inner.setTranslation([0, -min[1] * k, 0]);
  for (const s of doc.getRoot().listScenes()) for (const child of s.listChildren()) { s.removeChild(child); inner.addChild(child); }
  wrapper.addChild(inner);
  src.addChild(wrapper);
  const map = mergeDocuments(target, doc);
  scene.addChild(map.get(wrapper));
  console.log(`${id.padEnd(15)} x${k.toFixed(2)}  ${(ext[0] * k).toFixed(1)} x ${(ext[1] * k).toFixed(1)} x ${(ext[2] * k).toFixed(1)} m`);
}
for (const s of target.getRoot().listScenes()) if (s !== scene) s.dispose();
target.getRoot().setDefaultScene(scene);
for (const b of target.getRoot().listBuffers().slice(1)) {
  // One buffer for the GLB.
  for (const a of target.getRoot().listAccessors()) if (a.getBuffer() === b) a.setBuffer(target.getRoot().listBuffers()[0]);
  b.dispose();
}
await target.transform(
  dedup(),
  // Only the new PNGs are touched (the kit's own textures are WebP already).
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], quality: 82, pattern: /png/ }),
  prune(),
);
await io.write(KIT, target);
const tris = (node) => { let n = 0; node.traverse((c) => c.getMesh()?.listPrimitives().forEach((p) => (n += (p.getIndices()?.getCount() ?? 0) / 3))); return n; };
for (const node of scene.listChildren()) if (MODELS[node.getName()]) console.log(`  ${node.getName().padEnd(15)} ${tris(node)} tris`);
console.log(`materials: ${target.getRoot().listMaterials().map((m) => m.getName()).join(", ")}`);
console.log(`wrote ${KIT} (${(fs.statSync(KIT).size / 1024).toFixed(0)} KB)`);

}
