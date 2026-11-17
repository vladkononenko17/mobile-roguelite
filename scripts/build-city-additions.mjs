// Adds the reworked dead city's pieces to the Wasteland kit (public/models/outpost/outpost-kit.glb),
// replacing the old ones of the same id. Run after scripts/build-outpost-kit.mjs, or on its own over
// the committed kit (it is idempotent: every id it writes is removed first).
//
// What it adds, all CC0 (sources in assets-src/city-overgrowth/, see assets-src/SOURCES.md):
//   - Quaternius "Zombie Apocalypse Kit" vehicles WITH their texture. The main build baked them to
//     vertex colours and simplified them hard, which smeared the paint and broke the shapes; here
//     they keep their atlas (graded dusty and faded, like cars left out for years).
//   - Quaternius "Stylized Nature MegaKit": real trees (leaf cards with alpha), dead trees, bushes,
//     ferns, tall grass and rocks, replacing the old Kenney trees and the bush blown up 5x.
//   - KayKit "City Builder Bits": brick brownstones and storefronts to wall the squares and streets
//     (a city you are inside of, not walls in a desert), police cars, taxis, dumpsters - all on one
//     shared atlas, graded grimy.
// Textured pieces keep their own materials (one draw call per material per batch cell); every
// texture is graded, shrunk and stored as WebP. Normal maps are dropped.
//
//   node scripts/build-city-additions.mjs   (needs sharp, meshoptimizer, @gltf-transform/*)
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compactPrimitive, dedup, getBounds, mergeDocuments, prune, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const KIT = path.join(ROOT, "public/models/outpost/outpost-kit.glb");
const SRC = path.join(ROOT, "assets-src/city-overgrowth");
const QN = `${SRC}/quaternius-nature`, QV = `${SRC}/quaternius-vehicles`, KK = `${SRC}/kaykit-city`;

/**
 * Texture grades (applied once per source image): saturation kept, brightness, a dust colour laid
 * over at `dust` opacity, a hue turn in degrees (the twisted tree's red autumn leaves to summer green).
 */
const GRADES = {
  // Cars years in the weather: faded paint, dust.
  car: { saturation: 0.55, brightness: 0.78, dust: [120, 104, 82, 0.28] },
  // Brick, signs and awnings gone grey with grime; KayKit's toy colours down to a dead city's.
  city: { saturation: 0.5, brightness: 0.7, dust: [92, 86, 76, 0.3] },
  // Foliage a little darker and less blue than the pack, to sit with the dusty palette.
  leaves: { saturation: 0.8, brightness: 0.82, dust: [70, 80, 40, 0.12] },
  leavesRed: { saturation: 0.75, brightness: 0.85, hue: 95, dust: [70, 80, 40, 0.1] },
  bark: { saturation: 0.7, brightness: 0.8 },
  rock: { saturation: 0.6, brightness: 0.85, dust: [120, 104, 82, 0.2] },
};

/**
 * id -> [source, size, grade by texture file name (default for the rest)]. `size` gives the model's
 * target extent in metres: { h } height, { len } longest ground side, or { k } a plain scale.
 */
const C = { car: "car" }, CITY = { "*": "city" };
const NATURE = { "Leaves_TwistedTree_C.png": "leavesRed", "Bark_DeadTree.png": "bark", "Bark_NormalTree.png": "bark", "Bark_TwistedTree.png": "bark", "Rocks_Diffuse.png": "rock", "*": "leaves" };
const MODELS = {
  // Vehicles (replace the vertex-baked ones; `car` was the outpost's Atomic Realm wreck).
  vSports: [`${QV}/Vehicle_Sports.gltf`, { len: 4.6 }, C],
  vPickup: [`${QV}/Vehicle_Pickup.gltf`, { len: 5.2 }, C],
  vTruck: [`${QV}/Vehicle_Truck.gltf`, { len: 6.6 }, C],
  vPickupArmored: [`${QV}/Vehicle_Pickup_Armored.gltf`, { len: 5.4 }, C],
  vTruckArmored: [`${QV}/Vehicle_Truck_Armored.gltf`, { len: 6.8 }, C],
  car: [`${QV}/Vehicle_Pickup.gltf`, { len: 5.2 }, C],
  kSedan: [`${KK}/car_sedan.gltf`, { len: 4.6 }, CITY],
  kHatch: [`${KK}/car_hatchback.gltf`, { len: 4.1 }, CITY],
  kWagon: [`${KK}/car_stationwagon.gltf`, { len: 4.8 }, CITY],
  kTaxi: [`${KK}/car_taxi.gltf`, { len: 4.6 }, CITY],
  kPolice: [`${KK}/car_police.gltf`, { len: 4.8 }, CITY],
  // The city's walls: brownstones and storefronts (KayKit footprints are 2 x 2 units: 9 m blocks).
  kbA: [`${KK}/building_A_withoutBase.gltf`, { k: 4.5 }, CITY],
  kbB: [`${KK}/building_B_withoutBase.gltf`, { k: 4.5 }, CITY],
  kbC: [`${KK}/building_C_withoutBase.gltf`, { k: 4.5 }, CITY],
  kbD: [`${KK}/building_D_withoutBase.gltf`, { k: 4.5 }, CITY],
  kbE: [`${KK}/building_E_withoutBase.gltf`, { k: 4.5 }, CITY],
  kbF: [`${KK}/building_F_withoutBase.gltf`, { k: 4.5 }, CITY],
  kbG: [`${KK}/building_G_withoutBase.gltf`, { k: 4.5 }, CITY],
  kbH: [`${KK}/building_H_withoutBase.gltf`, { k: 4.5 }, CITY],
  kDumpster: [`${KK}/dumpster.gltf`, { len: 2.2 }, CITY],
  kBench: [`${KK}/bench.gltf`, { len: 1.9 }, CITY],
  kLight: [`${KK}/streetlight.gltf`, { h: 5.5 }, CITY],
  kBoxA: [`${KK}/box_A.gltf`, { h: 0.7 }, CITY],
  kBoxB: [`${KK}/box_B.gltf`, { h: 0.6 }, CITY],
  // Trees, taking the city back (replace the Kenney ones of the same ids).
  nTreeOak: [`${QN}/CommonTree_3.gltf`, { h: 7.5 }, NATURE],
  nTree: [`${QN}/CommonTree_5.gltf`, { h: 7 }, NATURE],
  nTreeFat: [`${QN}/CommonTree_4.gltf`, { h: 8 }, NATURE],
  nTreeTall: [`${QN}/Pine_5.gltf`, { h: 8.5 }, NATURE],
  qTwisted: [`${QN}/TwistedTree_1.gltf`, { h: 10 }, NATURE],
  qDead1: [`${QN}/DeadTree_1.gltf`, { h: 7 }, NATURE],
  qDead2: [`${QN}/DeadTree_3.gltf`, { h: 7.5 }, NATURE],
  // The outpost's two roadside trees: dead ones in the desert.
  treeRound: [`${QN}/DeadTree_2.gltf`, { h: 6 }, NATURE],
  treeTall: [`${QN}/DeadTree_4.gltf`, { h: 7 }, NATURE],
  // Undergrowth (walk-over): bushes, ferns, big-leaved weeds, tall grass; rocks for rubble.
  nBush: [`${QN}/Bush_Common.gltf`, { h: 1.5 }, NATURE],
  nBushDetailed: [`${QN}/Plant_1_Big.gltf`, { h: 1.1 }, NATURE],
  nGrass: [`${QN}/Grass_Wispy_Tall.gltf`, { h: 0.9 }, NATURE],
  nGrassLeafs: [`${QN}/Fern_1.gltf`, { h: 0.8 }, NATURE],
  qGrass: [`${QN}/Grass_Common_Tall.gltf`, { h: 0.7 }, NATURE],
  qPlant: [`${QN}/Plant_1.gltf`, { h: 0.7 }, NATURE],
  qRock1: [`${QN}/Rock_Medium_1.gltf`, { h: 0.8 }, NATURE],
  qRock2: [`${QN}/Rock_Medium_2.gltf`, { h: 0.6 }, NATURE],
  qRock3: [`${QN}/Rock_Medium_3.gltf`, { h: 0.9 }, NATURE],
};

/** Triangle budget per model (ratio kept by the simplifier). */
const RATIO = {
  vSports: 0.45, vPickup: 0.45, vTruck: 0.4, car: 0.45, vPickupArmored: 0.3, vTruckArmored: 0.3,
  qTwisted: 0.45, qDead1: 0.35, qDead2: 0.35, treeRound: 0.35, treeTall: 0.35, nTreeOak: 0.6, nTree: 0.6, nTreeFat: 0.6,
};
/** Sloppy ratio for meshes of many small islands. */
const SLOPPY = { qDead1: 0.35, qDead2: 0.35, treeRound: 0.35, treeTall: 0.35, qTwisted: 0.45, vPickupArmored: 0.5, vTruckArmored: 0.5 };
await MeshoptSimplifier.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const kit = await io.read(KIT);
const scene = kit.getRoot().getDefaultScene() ?? kit.getRoot().listScenes()[0];
// Drop what is replaced (and anything this script added before).
for (const node of scene.listChildren()) if (MODELS[node.getName()]) { scene.removeChild(node); node.dispose(); }
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
  // Textures: graded once per (image, recipe); no normal maps; no emission (KayKit windows).
  for (const m of doc.getRoot().listMaterials()) {
    m.setNormalTexture(null).setMetallicFactor(0).setRoughnessFactor(0.92);
    if (m.getAlphaMode() === "BLEND") m.setAlphaMode("MASK").setAlphaCutoff(0.4);
    const tex = m.getBaseColorTexture();
    if (tex) {
      const name = path.basename(tex.getURI() || tex.getName() || "");
      const recipe = grades[name] ?? grades["*"] ?? grades.car;
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
