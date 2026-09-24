// Builds the ORION research facility kit: public/models/facility/facility-kit.glb
//
// Source: "Molten Maps SciFi Asset Pack" v1 by Moltenbolt (CC0), from the `space` release
// (see assets-src/SOURCES.md). Every model becomes one node named by its kit id.
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
import { Document, NodeIO } from "@gltf-transform/core";
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

/** Colour grade per group: [saturation kept, brightness]. Tint is shared (cool steel blue). */
const GRADE = {
  floor: [0.5, 0.16],
  wall: [0.6, 0.42],
  prop: [0.65, 0.5],
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
      const kind = name.includes("Glass") || name.includes("Holo") ? "glass" : name.includes("Emissive") ? "glow" : "palette";
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
        if (kind === "glow") out = saturate(rgb.map((c, k) => c * emissive[k]), GLOW_BOOST);
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
