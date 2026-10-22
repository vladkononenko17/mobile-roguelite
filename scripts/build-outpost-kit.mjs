// Builds the Level 1 environment kit: public/models/outpost/outpost-kit.glb
//
// Sources (see assets-src/SOURCES.md): Atomic Realm packs (primary look), CitySurvivalLite and
// 3dassets.dev CC0 props (secondary); the dead city's streets, props, vehicles, ruined skyscrapers
// and overgrowth (CITY: Quaternius, Majadroid and Kenney, all CC0). Every model becomes one node
// named by its kit id.
//
// Draw calls are what matter on mobile, so:
// - Every material except the road tiles is baked into VERTEX COLOURS on one shared "palette"
//   material. The Atomic Realm / CitySurvival / Ocean atlases are grids of flat colours and
//   vertical linear gradients; sampling the texture at each vertex's UV reproduces a linear
//   gradient exactly across a triangle, so the look is kept while the whole kit batches into one
//   draw call per batch cell.
// - Road tiles keep their textures (lane markings, curbs) and are flattened to near-ground height.
// - Heavy meshes are simplified; vertices are stored as plain floats (4-byte aligned).
//
// Not part of the normal build. To regenerate:
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp
//   node scripts/build-outpost-kit.mjs
import fs from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compactPrimitive, dedup, dequantize, mergeDocuments, prune, simplify, textureCompress, unpartition, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const AR = "assets-src/atomic-realm";
const outFile = path.join(ROOT, "public/models/outpost/outpost-kit.glb");

/** Kit id -> source file. Ids are what the level file places. */
const MANIFEST = {
  // Atomic Realm: Post-Apocalyptic Starter Pack
  wall: `${AR}/post-apocalyptic-starter/wall_1.glb`,
  wallBrick: `${AR}/post-apocalyptic-starter/wall_1_brick.glb`,
  wallBoarded: `${AR}/post-apocalyptic-starter/wall_1_door_boarded.glb`,
  wallHole: `${AR}/post-apocalyptic-starter/wall_1_hole.glb`,
  wallWindow: `${AR}/post-apocalyptic-starter/wall_1_window_1.glb`,
  wallWindow2: `${AR}/post-apocalyptic-starter/wall_1_window_2.glb`,
  wallColumn: `${AR}/post-apocalyptic-starter/wall_column.glb`,
  wallConcreteMetal: `${AR}/post-apocalyptic-starter/wall_concrete_metal.glb`,
  wallMetalRed: `${AR}/post-apocalyptic-starter/wall_metal_1.glb`,
  wallMetalBlue: `${AR}/post-apocalyptic-starter/wall_metal_2.glb`,
  wallSpiked: `${AR}/post-apocalyptic-starter/wall_spiked.glb`,
  wallWood: `${AR}/post-apocalyptic-starter/wooden_wall.glb`,
  spikeBarricade: `${AR}/post-apocalyptic-starter/wooden_spike_barricade.glb`,
  metalBoardA: `${AR}/post-apocalyptic-starter/metal_board_1.glb`,
  metalBoardB: `${AR}/post-apocalyptic-starter/metal_board_2.glb`,
  metalBoardC: `${AR}/post-apocalyptic-starter/metal_board_3.glb`,
  barrelBlue: `${AR}/post-apocalyptic-starter/barrel.glb`,
  crate: `${AR}/post-apocalyptic-starter/box_1.glb`,
  car: `${AR}/post-apocalyptic-starter/car.glb`,
  pole: `${AR}/post-apocalyptic-starter/electric_pole_1.glb`,
  tire: `${AR}/post-apocalyptic-starter/tire.glb`,
  wheel: `${AR}/post-apocalyptic-starter/wheel.glb`,
  groundPlanks: `${AR}/post-apocalyptic-starter/ground_planks.glb`,
  // Atomic Realm: Gas Station, Interiors, Into The Wild, Ocean
  jerryCan: `${AR}/gas-station/jerry_can_with_nozzle.glb`,
  palletPile: `${AR}/gas-station/pallet_cluster_1.glb`,
  sawhorse: `${AR}/gas-station/road_barrier.glb`,
  armchair: `${AR}/interiors/arm_chair_1.glb`,
  sofaDamaged: `${AR}/interiors/sofa_1_damaged.glb`,
  table: `${AR}/interiors/table_1.glb`,
  bathtub: `${AR}/interiors/bathtub.glb`,
  chairBroken: `${AR}/interiors/chair_1_destroyed_3.glb`,
  bottle: `${AR}/interiors/bottle_1_destroeyd.glb`,
  stick: `${AR}/into-the-wild/sharpened_stick.glb`,
  sleepingBag: `${AR}/into-the-wild/sleeping_bag.glb`,
  crashedShip: `${AR}/ocean/crashed_ship.glb`,
  boat: `${AR}/ocean/small_boat.glb`,
  // Atomic Realm: Modular Roads
  road: `${AR}/modular-roads/Road1.glb`,
  roadT: `${AR}/modular-roads/Road2_T.glb`,
  roadEnd: `${AR}/modular-roads/Road6_End.glb`,
  lamp: `${AR}/modular-roads/lamp_1.glb`,
  lampDouble: `${AR}/modular-roads/lamp_2.glb`,
  trafficLight: `${AR}/modular-roads/traffic_light_1.glb`,
  jersey: `${AR}/modular-roads/road_barier_2a.glb`,
  jersey2: `${AR}/modular-roads/road_barier_2b.glb`,
  sawhorseStriped: `${AR}/modular-roads/road_barrier_1.glb`,
  trafficBarrel: `${AR}/modular-roads/traffic_barell_1.glb`,
  cone: `${AR}/modular-roads/hazzard_cone_1.glb`,
  treeRound: `${AR}/modular-roads/tree_1_a.glb`,
  treeTall: `${AR}/modular-roads/Tree4.glb`,
  // CitySurvivalLite
  bench: "assets-src/city-survival-lite/Bench.glb",
  tent: "assets-src/city-survival-lite/Tent.glb",
  cardboard: "assets-src/city-survival-lite/CardboardBox.glb",
  cart: "assets-src/city-survival-lite/ShoppingCart.glb",
  streetLamp: "assets-src/city-survival-lite/Lamppost.glb",
  barrelRed: "assets-src/city-survival-lite/BarrelOpenRed.glb",
  // 3dassets.dev (CC0)
  container: "assets-src/3dassets/wasteland-props/shipping-container.glb",
  bowser: "assets-src/3dassets/wasteland-props/fuel-bowser.glb",
  generator: "assets-src/3dassets/wasteland-props/generator-unit.glb",
  drumRack: "assets-src/3dassets/wasteland-props/fuel-drum-rack.glb",
  palletStack: "assets-src/3dassets/wasteland-props/pallet-stack.glb",
  sandbags: "assets-src/3dassets/wasteland-props/sandbag-wall.glb",
  razorWire: "assets-src/3dassets/wasteland-props/razor-wire-coil.glb",
  floodlight: "assets-src/3dassets/wasteland-props/floodlight-mast.glb",
  wreckBarricade: "assets-src/3dassets/wasteland-props/wreck-barricade.glb",
  tyreStack: "assets-src/3dassets/wasteland-props/tyre-stack.glb",
  scrap: "assets-src/3dassets/wasteland-props/scrap-pile.glb",
  roadSign: "assets-src/3dassets/wasteland-props/road-sign.glb",
  warningSign: "assets-src/3dassets/warning-sign-tripod.glb",
  campfire: "assets-src/3dassets/campfire.glb",
  cot: "assets-src/3dassets/field-cot.glb",
  rock: "assets-src/3dassets/shoreline-rock.glb",
  engineParts: "assets-src/3dassets/powertrain-recovery.glb",
};

const ZK = "assets-src/zombie-kit/Environment";
const ZV = "assets-src/zombie-kit/Vehicles";
const RC = "assets-src/ruined-city/glb";
const KN = "assets-src/kenney/nature/Models/GLTF format";
/**
 * The dead city (Wasteland zones 2-3): kit id -> [source, options]. `scale` is baked in; `grade`
 * [saturation kept, brightness] tones the bright toy colours down to the outpost's dusty look;
 * `textured` keeps the source's textures (street markings, the skyscrapers' concrete and facades).
 *   - Quaternius "Zombie Apocalypse Kit" (CC0): streets, city props, vehicles;
 *   - Majadroid "LowPoly Apocalyptic Buildings" (CC0): ruined skyscrapers, billboards, wreckage;
 *   - Kenney "Nature Kit" (CC0): trees, bushes and grass taking the streets back.
 */
/** Kenney's bright greens pulled towards a dusty olive (less blue). */
const OLIVE = [1.0, 0.95, 0.45];
const CITY = {
  zkStreet: [`${ZK}/Street_Straight.gltf`, { textured: true }],
  zkStreetCrack: [`${ZK}/Street_Straight_Crack1.gltf`, { textured: true }],
  zkStreetCrack2: [`${ZK}/Street_Straight_Crack2.gltf`, { textured: true }],
  zkStreetT: [`${ZK}/Street_T.gltf`, { textured: true }],
  zkStreet4: [`${ZK}/Street_4Way.gltf`, { textured: true }],
  zkStreetTurn: [`${ZK}/Street_Turn.gltf`, { textured: true }],
  zkContainerGreen: [`${ZK}/Container_Green.gltf`, { grade: [0.6, 0.75] }],
  zkContainerRed: [`${ZK}/Container_Red.gltf`, { grade: [0.6, 0.75] }],
  zkCouch: [`${ZK}/Couch.gltf`, { grade: [0.55, 0.75] }],
  zkHydrant: [`${ZK}/FireHydrant.gltf`, { grade: [0.7, 0.8] }],
  zkPallet: [`${ZK}/Pallet.gltf`, { grade: [0.6, 0.75] }],
  zkPalletBroken: [`${ZK}/Pallet_Broken.gltf`, { grade: [0.6, 0.75] }],
  zkPipes: [`${ZK}/Pipes.gltf`, { grade: [0.6, 0.75] }],
  zkPlasticBarrier: [`${ZK}/PlasticBarrier.gltf`, { grade: [0.65, 0.8] }],
  zkStreetLight: [`${ZK}/StreetLights.gltf`, { grade: [0.6, 0.8] }],
  zkTownSign: [`${ZK}/TownSign.gltf`, { grade: [0.6, 0.75] }],
  zkBarrier: [`${ZK}/TrafficBarrier_1.gltf`, { grade: [0.65, 0.8] }],
  zkBarrier2: [`${ZK}/TrafficBarrier_2.gltf`, { grade: [0.65, 0.8] }],
  zkCone: [`${ZK}/TrafficCone_1.gltf`, { grade: [0.7, 0.8] }],
  zkTrafficLight: [`${ZK}/TrafficLight_1.gltf`, { grade: [0.6, 0.75] }],
  zkTrafficLight2: [`${ZK}/TrafficLight_2.gltf`, { grade: [0.6, 0.75] }],
  zkTrash: [`${ZK}/TrashBag_1.gltf`, { grade: [0.5, 0.75] }],
  zkTrash2: [`${ZK}/TrashBag_2.gltf`, { grade: [0.5, 0.75] }],
  zkWaterTower: [`${ZK}/WaterTower.gltf`, { grade: [0.5, 0.75] }],
  zkWheels: [`${ZK}/Wheels_Stack.gltf`, { grade: [0.6, 0.75] }],
  zkBarrel: [`${ZK}/Barrel.gltf`, { grade: [0.6, 0.75] }],
  zkCinder: [`${ZK}/CinderBlock.gltf`, { grade: [0.5, 0.8] }],
  zkBlood: [`${ZK}/Blood_1.gltf`, { grade: [0.8, 0.55] }],
  zkBlood2: [`${ZK}/Blood_2.gltf`, { grade: [0.8, 0.55] }],
  vPickup: [`${ZV}/Vehicle_Pickup.gltf`, { grade: [0.5, 0.7] }],
  vSports: [`${ZV}/Vehicle_Sports.gltf`, { grade: [0.5, 0.7] }],
  vTruck: [`${ZV}/Vehicle_Truck.gltf`, { grade: [0.5, 0.7] }],
  vPickupArmored: [`${ZV}/Vehicle_Pickup_Armored.gltf`, { grade: [0.5, 0.7] }],
  vTruckArmored: [`${ZV}/Vehicle_Truck_Armored.gltf`, { grade: [0.5, 0.7] }],
  bld1: [`${RC}/building-01.glb`, { textured: true, scale: 0.4 }],
  bld2: [`${RC}/building-02.glb`, { textured: true, scale: 0.4 }],
  bld5: [`${RC}/building-05.glb`, { textured: true, scale: 0.4 }],
  bld6: [`${RC}/building-06.glb`, { textured: true, scale: 0.4 }],
  bld7: [`${RC}/building-07.glb`, { textured: true, scale: 0.4 }],
  billboards: [`${RC}/billboards-4-types.glb`, { textured: true }],
  wreckage: [`${RC}/wreckage-3-types.glb`, { textured: true, scale: 0.5 }],
  fireStairs: [`${RC}/fire-stairs.glb`, { grade: [0.6, 0.8] }],
  nTreeOak: [`${KN}/tree_oak_dark.glb`, { scale: 3.6, grade: [0.8, 0.5], tint: OLIVE }],
  nTree: [`${KN}/tree_default_dark.glb`, { scale: 3.2, grade: [0.8, 0.5], tint: OLIVE }],
  nTreeFat: [`${KN}/tree_fat_darkh.glb`, { scale: 3.8, grade: [0.8, 0.5], tint: OLIVE }],
  nTreeTall: [`${KN}/tree_tall_dark.glb`, { scale: 3.6, grade: [0.8, 0.5], tint: OLIVE }],
  nBush: [`${KN}/plant_bushLarge.glb`, { scale: 5, grade: [0.8, 0.5], tint: OLIVE }],
  nBushDetailed: [`${KN}/plant_bushDetailed.glb`, { scale: 4, grade: [0.8, 0.5], tint: OLIVE }],
  nGrass: [`${KN}/grass_large.glb`, { scale: 4, grade: [0.8, 0.5], tint: OLIVE }],
  nGrassLeafs: [`${KN}/grass_leafsLarge.glb`, { scale: 4, grade: [0.8, 0.5], tint: OLIVE }],
  nLog: [`${KN}/log_large.glb`, { scale: 3, grade: [0.8, 0.5], tint: OLIVE }],
};

/** Road tiles keep their textures; everything else is baked to vertex colours. */
const TEXTURED = new Set(["road", "roadT", "roadEnd"]);
/** Emissive embers stay bright when baked. */
const GLOW = new Set(["ember"]);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const target = new Document();
const scene = target.createScene("outpost-kit");
const textureCache = new Map();

for (const [id, file] of Object.entries(MANIFEST)) {
  const doc = await io.read(path.join(ROOT, file));
  for (const animation of doc.getRoot().listAnimations()) animation.dispose();
  if (!TEXTURED.has(id)) await bakeVertexColours(doc);
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
for (const [id, [file, o]] of Object.entries(CITY)) {
  const doc = await io.read(path.join(ROOT, file));
  for (const animation of doc.getRoot().listAnimations()) animation.dispose();
  if (o.textured) {
    // Textured pieces: a darker, dustier tint on their own materials.
    for (const m of doc.getRoot().listMaterials()) m.setBaseColorFactor([0.62, 0.6, 0.57, 1]).setMetallicFactor(0).setRoughnessFactor(0.95).setEmissiveFactor([0, 0, 0]);
  } else await bakeVertexColours(doc, o.grade, o.tint);
  const wrapper = doc.createNode(id);
  const k = o.scale ?? 1;
  const inner = doc.createNode(`${id}-scale`).setScale([k, k, k]);
  for (const s of doc.getRoot().listScenes()) {
    for (const child of s.listChildren()) {
      s.removeChild(child);
      inner.addChild(child);
    }
  }
  wrapper.addChild(inner);
  doc.getRoot().listScenes()[0].addChild(wrapper);
  const map = mergeDocuments(target, doc);
  scene.addChild(map.get(wrapper));
}
for (const s of target.getRoot().listScenes()) if (s !== scene) s.dispose();
target.getRoot().setDefaultScene(scene);
for (const ext of target.getRoot().listExtensionsUsed()) {
  if (ext.extensionName === "KHR_materials_transmission" || ext.extensionName === "KHR_materials_emissive_strength") ext.dispose();
}

// One shared palette material for every baked primitive.
const palette = target.createMaterial("palette").setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0);
for (const mesh of target.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    if (prim.getAttribute("COLOR_0")) prim.setMaterial(palette);
  }
}
for (const material of target.getRoot().listMaterials()) {
  if (material !== palette && material.listParents().length <= 1) material.dispose();
}

const before = countTriangles(target);
await target.transform(
  unpartition(),
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.01 }),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], quality: 85 }),
  prune(),
);
// Meshes made of many small islands (bricks, sandbags, leaves, machine parts) do not simplify
// with the topology-preserving pass; reduce these few with the sloppy simplifier instead.
const SLOPPY = {
  bowser: 0.3, engineParts: 0.35, treeRound: 0.35, sandbags: 0.5, wallBrick: 0.3,
  // Repeated many times across the level: every triangle here counts dozens of times.
  // (Walls, crates, barrels and containers are seen up close and smear under the sloppy pass.)
  car: 0.55, spikeBarricade: 0.5, floodlight: 0.45, tyreStack: 0.5,
  // The dead city: heavy vehicles and the skyscrapers (backdrop, seen from far).
  vPickup: 0.4, vSports: 0.4, vTruck: 0.4, vPickupArmored: 0.3, vTruckArmored: 0.3, zkCouch: 0.4, zkTrash2: 0.4,
  bld1: 0.25, bld2: 0.25, bld5: 0.25, bld6: 0.25, bld7: 0.3, billboards: 0.15, fireStairs: 0.4, zkWheels: 0.4, zkBarrel: 0.5, zkHydrant: 0.5,
};
await MeshoptSimplifier.ready;
for (const [id, ratio] of Object.entries(SLOPPY)) {
  const node = scene.listChildren().find((n) => n.getName() === id);
  const prims = [];
  node?.traverse((n) => n.getMesh()?.listPrimitives().forEach((p) => prims.push(p)));
  for (const prim of prims) {
    const indices = prim.getIndices();
    if (!indices) continue;
    const position = prim.getAttribute("POSITION");
    // Sloppy simplification wants plain float triangles.
    if (prim.getMode() !== 4 || position.getComponentSize() !== 4 || position.getNormalized()) continue;
    const positions = position.getArray();
    const target = Math.min(indices.getCount(), Math.max(36, Math.floor((indices.getCount() * ratio) / 3) * 3));
    const [out] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(indices.getArray()), Float32Array.from(positions), 3, null, target, 0.05);
    indices.setArray(positions.length / 3 > 65535 ? out : Uint16Array.from(out));
    compactPrimitive(prim);
  }
}
await target.transform(prune());

fs.mkdirSync(path.dirname(outFile), { recursive: true });
await io.write(outFile, target);

console.log(`materials: ${target.getRoot().listMaterials().map((m) => m.getName()).join(", ")}; textures ${target.getRoot().listTextures().length}`);
console.log(`triangles ${before} -> ${countTriangles(target)}`);
for (const node of scene.listChildren()) console.log(`  ${node.getName().padEnd(18)} ${countTriangles(target, node)}`);
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);

/**
 * Replaces every material in `doc` by per-vertex colours: base colour factor x texture sampled at
 * the vertex UV (sRGB decoded to linear). Only POSITION, NORMAL and COLOR_0 are kept so all baked
 * primitives share one vertex layout (and batch together).
 */
async function bakeVertexColours(doc, grade = null, tint = null) {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  await doc.transform(dequantize());
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      const factor = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const emissive = material?.getEmissiveFactor() ?? [0, 0, 0];
      const glow = GLOW.has(material?.getName() ?? "") || Math.max(...emissive) > 0.5;
      const texture = material?.getBaseColorTexture();
      const image = texture ? await decode(texture) : null;
      const uvs = prim.getAttribute("TEXCOORD_0");
      const count = prim.getAttribute("POSITION").getCount();
      const colours = new Uint8Array(count * 4);
      const uv = [0, 0];
      for (let i = 0; i < count; i++) {
        let rgb = [1, 1, 1];
        if (image && uvs) {
          uvs.getElement(i, uv);
          rgb = sample(image, uv[0], uv[1]);
        }
        const linear = rgb.map((c, k) => c * factor[k]);
        let out = glow ? emissive.map((e, k) => Math.max(linear[k], e)) : linear;
        if (grade && !glow) {
          const luma = out[0] * 0.2126 + out[1] * 0.7152 + out[2] * 0.0722;
          out = out.map((c) => (luma + (c - luma) * grade[0]) * grade[1]);
        }
        if (tint) out = out.map((c, k) => c * tint[k]);
        colours.set([...out.map((v) => Math.round(Math.min(1, v) * 255)), 255], i * 4);
      }
      prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(colours).setNormalized(true).setBuffer(buffer));
      for (const semantic of prim.listSemantics()) {
        if (!["POSITION", "NORMAL", "COLOR_0"].includes(semantic)) prim.setAttribute(semantic, null);
      }
    }
  }
}

async function decode(texture) {
  const key = texture.getImage();
  if (!textureCache.has(key)) {
    const { data, info } = await sharp(Buffer.from(key)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    textureCache.set(key, { data, width: info.width, height: info.height });
  }
  return textureCache.get(key);
}

/** Nearest-texel sample with repeat wrap, returned as linear RGB. */
function sample(image, u, v) {
  const x = ((Math.floor((u - Math.floor(u)) * image.width) % image.width) + image.width) % image.width;
  const y = ((Math.floor((v - Math.floor(v)) * image.height) % image.height) + image.height) % image.height;
  const i = (y * image.width + x) * 3;
  const toLinear = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return [toLinear(image.data[i]), toLinear(image.data[i + 1]), toLinear(image.data[i + 2])];
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
