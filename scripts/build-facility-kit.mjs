// Builds the ORION research facility kit: public/models/facility/facility-kit.glb
//
// Sources (see assets-src/SOURCES.md), all CC0:
// - "Molten Maps SciFi Asset Pack" v1 by Moltenbolt (`space` release): walls, floors, machines;
// - Kenney "Space Station Kit" (interiors: walls, consoles, beds, containers, pipes) at x2.4 (its
//   one-unit walls become the map's 2.4 m cutaway walls) and "Space Kit" (spacecraft, rockets,
//   turrets, hangars, meteors, craters, crystals, rover, dishes) at x4 (one unit = the 4 m grid),
//   downloaded into assets-src/kenney/. Kenney models are centred on their footprint, base on the
//   floor; their crystals glow.
// Every model becomes one node named by its kit id.
//
// Same approach as scripts/build-outpost-kit.mjs, plus a colour grade and two extra materials:
// - Everything is baked into VERTEX COLOURS (the pack uses one gradient atlas, so sampling it per
//   vertex keeps the look) and merged into three shared materials, each batching to one draw call
//   per batch cell:
//     "palette" - lit surfaces, graded from the pack's bright toy colours towards the game's gritty
//                 look: desaturated, cooler and darker (floors darkest, walls next, props least);
//     "glow"    - screens, light strips and indicators (the emissive atlas), kept saturated and unlit;
//     "glass"   - glass walls and holograms, translucent.
// - Floor tiles are flattened to a few centimetres with their top just above the ground, so the
//   hero, decals and contact shadows sit on them.
//
// Not part of the normal build. To regenerate:
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp
//   node scripts/build-facility-kit.mjs
import fs from "node:fs";
import path from "node:path";
import { Document, NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, dequantize, mergeDocuments, prune, simplify, transformPrimitive, unpartition, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const SRC = "assets-src/molten-scifi/glb";
const outFile = path.join(ROOT, "public/models/facility/facility-kit.glb");

/** Kit id -> [source model, grade group]. Ids are what the level file places. */
const MANIFEST = {
  // Walls (4 x 4 m modules)
  wallGrey: ["Wall_Grey", "wall"],
  wallBlue: ["Wall_Blue", "wall"],
  wallRed: ["Wall_Red", "wall"],
  wallOrange: ["Wall_Orange", "wall"],
  wallGreen: ["Wall_Green", "wall"],
  wallGreeblies: ["Wall_Blue_Greeblies", "wall"],
  wallDoorGrey: ["Wall_With_Door_Grey", "wall"],
  wallDoorRed: ["Wall_With_Door_Red", "wall"],
  wallDoorBlue: ["Wall_With_Door_Blue", "wall"],
  wallDoorOrange: ["Wall_With_Door_Orange", "wall"],
  wallGlass: ["Wall_Glass_Clear", "wall"],
  wallGlassBlue: ["Wall_Glass_Blue", "wall"],
  wallGlassGreen: ["Wall_Glass_Green", "wall"],
  commandWall: ["Command_Wall", "wall"],
  corridorFrame: ["Corridor_Boundary_4x4", "wall"],
  deckBlock: ["Deck_Height_Metal", "wall"],
  // Wall-mounted details
  displayBlue: ["Wall_Display_Blue", "prop"],
  displayRed: ["Wall_Display_Red", "prop"],
  displayGreen: ["Wall_Display_Green", "prop"],
  displayOff: ["Wall_Display_Off", "prop"],
  wallLightWhite: ["Wall_Light_White", "prop"],
  wallLightRed: ["Wall_Light_Red", "prop"],
  wallLightBlue: ["Wall_Light_Blue", "prop"],
  wallPipe: ["Wall_Pipe", "prop"],
  airCon: ["Air_Con", "prop"],
  // Floors (4 x 4 m; the command floor is 8 x 8 m)
  floorMetal: ["Floor_Metal_Square", "floor"],
  floorTile: ["Floor_Tile_Metal", "floor"],
  floorGrate: ["Floor_Metal_Square_Grate", "floor"],
  floorCircles: ["Floor_Metal_Circles", "floor"],
  floorPath: ["Floor_Mid_Path", "floor"],
  floorPathCorner: ["Floor_Mid_Path_Corner_1", "floor"],
  hazard1: ["Hazard_Floor_1", "floor"],
  hazard2: ["Hazard_Floor_2", "floor"],
  floorMedbay: ["Floor_Medbay", "floor"],
  floorHydro: ["Hydroponics_Floor", "floor"],
  floorCommand: ["Floor_Command_Large", "floor"],
  floorCarpet: ["Floor_Tile_Carpet_Grey", "floor"],
  // Machines
  generator: ["Generator", "prop"],
  genPile: ["Generator_Pile_Chonky", "prop"],
  genPileSmall: ["Generator_Pile_Small", "prop"],
  batteryBlue: ["Battery_Blue", "prop"],
  batteryOrange: ["Battery_Orange", "prop"],
  batteryRed: ["Battery_Red", "prop"],
  batteryGrey: ["Battery_Grey", "prop"],
  commandConsole: ["Command_Console", "prop"],
  monitorBlue: ["Large_Monitor_Blue", "prop"],
  monitorRed: ["Large_Monitor_Red", "prop"],
  monitorGreen: ["Large_Monitor_Green", "prop"],
  monitorOff: ["Large_Monitor_Off", "prop"],
  briefingBlue: ["Briefing_Screen_Blue", "prop"],
  briefingRed: ["Briefing_Screen_Red", "prop"],
  orrery: ["Orrery", "prop"],
  orreryTall: ["Orrery_Tall", "prop"],
  // Labs and medbay
  cryoOn: ["Cryo_Tube_ON", "prop"],
  cryoOff: ["Cryo_Tube_OFF", "prop"],
  casket: ["Sleeper Casket Static", "prop"],
  bioGreen: ["BioMonitor_Green", "prop"],
  bioRed: ["BioMonitor_Red", "prop"],
  // Hydroponics
  hydroFull: ["Hydroponics_Full", "prop"],
  hydroEmpty: ["Hydroponics_Empty", "prop"],
  hydroLamp: ["Hydroponics_Lamp", "prop"],
  hydroBay: ["Hydroponic_Bay", "prop"],
  plant: ["Plant_1", "prop"],
  // Crew
  bunk: ["Bunk_Double_Grey", "prop"],
  bunkRed: ["Bunk_Double_Red", "prop"],
  bunkSingle: ["Bunk_Single_Blue", "prop"],
  cafeTable: ["Cafeteria_Table", "prop"],
  cafeTableRed: ["Cafeteria_Table_Inset_Red", "prop"],
  meetingTable: ["Meeting_Table", "prop"],
  octoTable: ["Octo_Table", "prop"],
  chair: ["Chair_1", "prop"],
  endTable: ["End_Table", "prop"],
  floorLamp: ["Floor_Lamp", "prop"],
  tableLight: ["Table_Light", "prop"],
  chess: ["3D_Chess_Board", "prop"],
  // Structure
  catwalk: ["Catwalk_1", "prop"],
  railing: ["Railing_Flat", "prop"],
};

const KST = "assets-src/kenney/station/Models/GLB format";
const KSP = "assets-src/kenney/space/Models/GLTF format";
/** Kenney models: kit id -> [source (no extension) or stack of sources (bottom first), group, scale]. */
const KENNEY = {
  // Space Station Kit (interiors), x2.4
  kWall: [`${KST}/wall`, "kwall", 2.4],
  kWallWindow: [`${KST}/wall-window`, "kwall", 2.4],
  kWallDetail: [`${KST}/wall-detail`, "kwall", 2.4],
  kWallBanner: [`${KST}/wall-banner`, "kwall", 2.4],
  kWallPillar: [`${KST}/wall-pillar`, "kwall", 2.4],
  kWallSwitch: [`${KST}/wall-switch`, "kwall", 2.4],
  kStructure: [`${KST}/structure`, "kwall", 2.4],
  kBarrier: [`${KST}/structure-barrier`, "kprop", 2.4],
  kBarrierHigh: [`${KST}/structure-barrier-high`, "kprop", 2.4],
  kComputer: [`${KST}/computer`, "kprop", 2.4],
  kComputerWide: [`${KST}/computer-wide`, "kprop", 2.4],
  kComputerSystem: [`${KST}/computer-system`, "kprop", 2.4],
  kDisplayWall: [`${KST}/display-wall-wide`, "kprop", 2.4],
  kContainer: [`${KST}/container`, "kprop", 2.4],
  kContainerTall: [`${KST}/container-tall`, "kprop", 2.4],
  kContainerWide: [`${KST}/container-wide`, "kprop", 2.4],
  kContainerFlat: [`${KST}/container-flat`, "kprop", 2.4],
  kContainerOpen: [`${KST}/container-flat-open`, "kprop", 2.4],
  kBed: [`${KST}/bed-double`, "kprop", 2.4],
  kBedSingle: [`${KST}/bed-single`, "kprop", 2.4],
  kChair: [`${KST}/chair-armrest-headrest`, "kprop", 2.4],
  kTable: [`${KST}/table-large`, "kprop", 2.4],
  kTableDisplay: [`${KST}/table-display-planet`, "kprop", 2.4],
  kPipe: [`${KST}/pipe`, "kprop", 2.4],
  kPipeRing: [`${KST}/pipe-ring-colored`, "kprop", 2.4],
  kSkipRocks: [`${KST}/skip-rocks`, "kprop", 2.4],
  kRail: [`${KST}/rail`, "kprop", 2.4],
  // Space Kit (hangar, launch bay, the meteor), x4
  sCraftCargo: [`${KSP}/craft_cargoA`, "kprop", 4],
  sCraftCargoB: [`${KSP}/craft_cargoB`, "kprop", 4],
  sCraftMiner: [`${KSP}/craft_miner`, "kprop", 4],
  sCraftSpeeder: [`${KSP}/craft_speederA`, "kprop", 4],
  sCraftRacer: [`${KSP}/craft_racer`, "kprop", 4],
  sRocket: [[`${KSP}/rocket_baseA`, `${KSP}/rocket_fuelA`, `${KSP}/rocket_sidesA`, `${KSP}/rocket_topA`], "kprop", 4],
  sHangar: [`${KSP}/hangar_largeA`, "kprop", 4],
  sHangarRound: [`${KSP}/hangar_roundGlass`, "kprop", 4],
  sTurret: [`${KSP}/turret_double`, "kprop", 4],
  sTurretSingle: [`${KSP}/turret_single`, "kprop", 4],
  sDish: [`${KSP}/satelliteDish_large`, "kprop", 4],
  sRover: [`${KSP}/rover`, "kprop", 4],
  sGenerator: [`${KSP}/machine_generatorLarge`, "kprop", 4],
  sBarrels: [`${KSP}/barrels`, "kprop", 4],
  sWireless: [`${KSP}/machine_wireless`, "kprop", 4],
  sGate: [`${KSP}/gate_complex`, "kprop", 4],
  sPlatform: [`${KSP}/platform_large`, "kprop", 4],
  sSupports: [`${KSP}/supports_high`, "kprop", 4],
  sStructure: [`${KSP}/structure_detailed`, "kprop", 4],
  sPipeRing: [`${KSP}/pipe_ringHigh`, "kprop", 4],
  sMeteor: [`${KSP}/meteor_detailed`, "krock", 4],
  sMeteorHalf: [`${KSP}/meteor_half`, "krock", 4],
  sRock: [`${KSP}/rock`, "krock", 4],
  sRockLargeA: [`${KSP}/rock_largeA`, "krock", 4],
  sRockLargeB: [`${KSP}/rock_largeB`, "krock", 4],
  sRocksSmall: [`${KSP}/rocks_smallA`, "krock", 4],
  sCrystals: [`${KSP}/rock_crystals`, "krock", 4],
  sCrystalsLargeA: [`${KSP}/rock_crystalsLargeA`, "krock", 4],
  sCrystalsLargeB: [`${KSP}/rock_crystalsLargeB`, "krock", 4],
  sCrater: [`${KSP}/crater`, "krock", 4],
  sCraterLarge: [`${KSP}/craterLarge`, "krock", 4],
  sCliff: [`${KSP}/terrain_sideCliff`, "krock", 4],
  sBones: [`${KSP}/bones`, "kprop", 4],
  sAstronaut: [`${KSP}/astronautA`, "kprop", 4],
};
/** Kenney material names baked as self-lit glow. */
const KENNEY_GLOW = new Set(["crystal"]);

/** Colour grade per group: [saturation kept, brightness]. Tint is shared (cool steel blue). Kenney
 * colours are flat and near full brightness, hence their darker grades. */
const GRADE = {
  floor: [0.5, 0.16],
  wall: [0.6, 0.42],
  prop: [0.65, 0.5],
  kwall: [0.45, 0.15],
  kprop: [0.55, 0.16],
  krock: [0.3, 0.09],
};
const TINT = [0.84, 0.93, 1.06];
/** Glow colours are pushed a little towards saturation so screens read as coloured light. */
const GLOW_BOOST = 1.3;
/** Floor tiles: thickness after flattening, and the height of their top face. */
const FLOOR_THICKNESS = 0.03;
const FLOOR_TOP = 0.006;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const target = new Document();
const scene = target.createScene("facility-kit");
const textureCache = new Map();

for (const [id, [file, group]] of Object.entries(MANIFEST)) {
  const doc = await io.read(path.join(ROOT, SRC, `${file}.glb`));
  for (const animation of doc.getRoot().listAnimations()) animation.dispose();
  await bakeVertexColours(doc, group);
  if (group === "floor") flattenFloor(doc);
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
for (const [id, [source, group, scale]] of Object.entries(KENNEY)) {
  const stack = Array.isArray(source) ? source : [source];
  const doc = await io.read(path.join(ROOT, `${stack[0]}.glb`));
  // Stacked pieces (the rocket): each one set on top of the previous.
  let top = getBounds(doc.getRoot().listScenes()[0]).max[1];
  for (const extra of stack.slice(1)) {
    const piece = await io.read(path.join(ROOT, `${extra}.glb`));
    const b = getBounds(piece.getRoot().listScenes()[0]);
    const lift = piece.createNode(`${id}-stack`).setTranslation([0, top - b.min[1], 0]);
    for (const child of piece.getRoot().listScenes()[0].listChildren()) {
      piece.getRoot().listScenes()[0].removeChild(child);
      lift.addChild(child);
    }
    piece.getRoot().listScenes()[0].addChild(lift);
    top += b.max[1] - b.min[1];
    const m = mergeDocuments(doc, piece);
    doc.getRoot().listScenes()[0].addChild(m.get(lift));
    for (const s2 of doc.getRoot().listScenes().slice(1)) s2.dispose();
  }
  for (const animation of doc.getRoot().listAnimations()) animation.dispose();
  await bakeVertexColours(doc, group);
  const src = doc.getRoot().listScenes()[0];
  const { min, max } = getBounds(src);
  const wrapper = doc.createNode(id);
  const scaler = doc.createNode(`${id}-scale`).setScale([scale, scale, scale]).setTranslation([-(min[0] + max[0]) / 2 * scale, -min[1] * scale, -(min[2] + max[2]) / 2 * scale]);
  for (const child of src.listChildren()) {
    src.removeChild(child);
    scaler.addChild(child);
  }
  wrapper.addChild(scaler);
  src.addChild(wrapper);
  const map = mergeDocuments(target, doc);
  scene.addChild(map.get(wrapper));
}
for (const s of target.getRoot().listScenes()) if (s !== scene) s.dispose();
target.getRoot().setDefaultScene(scene);
for (const ext of target.getRoot().listExtensionsUsed()) ext.dispose();

// Three shared materials; the baked kind of each primitive was stored in its material name.
const shared = {
  palette: target.createMaterial("palette").setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.7).setMetallicFactor(0),
  glow: target.createMaterial("glow").setBaseColorFactor([0, 0, 0, 1]).setEmissiveFactor([1, 1, 1]),
  glass: target.createMaterial("glass").setBaseColorFactor([1, 1, 1, 0.35]).setAlphaMode("BLEND").setRoughnessFactor(0.1).setMetallicFactor(0),
};
for (const mesh of target.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) prim.setMaterial(shared[prim.getMaterial()?.getName() ?? "palette"] ?? shared.palette);
}
for (const material of target.getRoot().listMaterials()) {
  if (!Object.values(shared).includes(material)) material.dispose();
}
for (const texture of target.getRoot().listTextures()) texture.dispose();

const before = countTriangles(target);
await target.transform(
  unpartition(),
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.4, error: 0.004 }),
  prune(),
);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
await io.write(outFile, target);

console.log(`materials: ${target.getRoot().listMaterials().map((m) => m.getName()).join(", ")}; textures ${target.getRoot().listTextures().length}`);
console.log(`triangles ${before} -> ${countTriangles(target)}`);
for (const node of scene.listChildren()) console.log(`  ${node.getName().padEnd(16)} ${countTriangles(target, node)}`);
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);

/**
 * Replaces every material in `doc` by per-vertex colours, marking each primitive's kind (palette,
 * glow or glass) in a placeholder material name. Only POSITION, NORMAL and COLOR_0 are kept so the
 * baked primitives share one vertex layout (and batch together).
 */
async function bakeVertexColours(doc, group) {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  await doc.transform(dequantize());
  const markers = {};
  const marker = (kind) => (markers[kind] ??= doc.createMaterial(kind));
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      const name = material?.getName() ?? "";
      const kind = name.includes("Glass") || name.includes("Holo") ? "glass" : name.includes("Emissive") || KENNEY_GLOW.has(name) ? "glow" : "palette";
      const factor = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const emissive = material?.getEmissiveFactor() ?? [0, 0, 0];
      // Glow samples the emissive texture; holograms use their emissive colour.
      const texture = kind === "glow" ? material?.getEmissiveTexture() : material?.getBaseColorTexture();
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
        let out;
        if (kind === "glow" && KENNEY_GLOW.has(name)) out = saturate(rgb.map((c, k) => c * factor[k] * 1.3), GLOW_BOOST);
        else if (kind === "glow") out = saturate(rgb.map((c, k) => c * emissive[k]), GLOW_BOOST);
        else if (name.includes("Holo")) out = emissive.map((e) => e * 0.8);
        else out = grade(rgb.map((c, k) => c * factor[k]), group);
        colours.set([...out.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)), 255], i * 4);
      }
      prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(colours).setNormalized(true).setBuffer(buffer));
      for (const semantic of prim.listSemantics()) {
        if (!["POSITION", "NORMAL", "COLOR_0"].includes(semantic)) prim.setAttribute(semantic, null);
      }
      prim.setMaterial(marker(kind));
    }
  }
}

/** Desaturate, cool and darken a linear colour for its group. */
function grade(rgb, group) {
  const [keep, brightness] = GRADE[group];
  const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return rgb.map((c, k) => (luma + (c - luma) * keep) * TINT[k] * brightness);
}

function saturate(rgb, amount) {
  const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return rgb.map((c) => luma + (c - luma) * amount);
}

/** Scales a floor tile to FLOOR_THICKNESS with its top face at FLOOR_TOP (baked into the mesh). */
function flattenFloor(doc) {
  let minY = Infinity, maxY = -Infinity;
  const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
  for (const prim of prims) {
    const p = prim.getAttribute("POSITION");
    for (let i = 0; i < p.getCount(); i++) {
      const y = p.getElement(i, [0, 0, 0])[1];
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const s = FLOOR_THICKNESS / Math.max(1e-4, maxY - minY);
  // y' = (y - maxY) * s + FLOOR_TOP; column-major matrix.
  const matrix = [1, 0, 0, 0, 0, s, 0, 0, 0, 0, 1, 0, 0, FLOOR_TOP - maxY * s, 0, 1];
  // Node transforms in this pack are identity for floors; bake into the vertices.
  for (const prim of prims) transformPrimitive(prim, matrix);
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
