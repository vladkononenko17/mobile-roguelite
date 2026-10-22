// Builds the ORION station kit: public/models/facility/facility-kit.glb
//
// Sources (see assets-src/SOURCES.md), all CC0:
// - Quaternius "Ultimate Modular Sci-Fi Pack" (FBX converted to GLB in assets-src/quaternius-scifi/glb):
//   the station's white architecture (4 m wall modules, columns, doors) and lab props. Its orange
//   "Accent" paint becomes the "accent" material, tinted per sector at runtime (ShipLevel);
//   camera-facing walls get low cutaway variants (`clip`: cut at a height and capped); the busiest
//   props are simplified harder (`simplify`);
// - "HallwayPACK" spaceship modules (assets-src/hallwaypack): corridor halls between the sectors,
//   their roofs clipped off so the camera sees in;
// - "Molten Maps SciFi Asset Pack" v1 by Moltenbolt (`space` release): machines, consoles, bunks;
// - Kenney "Space Station Kit" (containers, tables, barriers) at x2.4 and "Space Kit" (spacecraft,
//   rockets, hangars, meteors, craters, crystals, rover, dishes) at x4 (one unit = the 4 m grid),
//   downloaded into assets-src/kenney/. Kenney models are centred on their footprint, base on the
//   floor; their crystals glow.
// Only the models ShipLevel places are listed. Every model becomes one node named by its kit id.
//
// Same approach as scripts/build-outpost-kit.mjs, plus a colour grade and two extra materials:
// - Everything is baked into VERTEX COLOURS (the pack uses one gradient atlas, so sampling it per
//   vertex keeps the look) and merged into three shared materials, each batching to one draw call
//   per batch cell:
//     "palette" - lit surfaces, graded from the pack's bright toy colours towards the game's gritty
//                 look: desaturated, cooler and darker (floors darkest, walls next, props least);
//     "glow"    - screens, light strips and indicators (the emissive atlas), kept saturated and unlit;
//     "glass"   - glass walls and holograms, translucent;
//     "accent"  - the Quaternius accent paint: white vertex colours, tinted (and lit up a little) at
//                 runtime in the sector's colour.
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
import { clearNodeTransform, dedup, dequantize, mergeDocuments, normals, prune, simplify, transformPrimitive, unpartition, unweld, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const SRC = "assets-src/molten-scifi/glb";
const outFile = path.join(ROOT, "public/models/facility/facility-kit.glb");

/** Kit id -> [source model, grade group]. Ids are what the level file places. */
const MANIFEST = {
  // Wall-mounted details
  displayRed: ["Wall_Display_Red", "prop"],
  wallPipe: ["Wall_Pipe", "prop"],
  // Machines
  generator: ["Generator", "prop"],
  genPile: ["Generator_Pile_Chonky", "prop"],
  genPileSmall: ["Generator_Pile_Small", "prop"],
  batteryOrange: ["Battery_Orange", "prop"],
  batteryGrey: ["Battery_Grey", "prop"],
  commandConsole: ["Command_Console", "prop"],
  monitorBlue: ["Large_Monitor_Blue", "prop"],
  monitorRed: ["Large_Monitor_Red", "prop"],
  // Labs and medbay
  cryoOff: ["Cryo_Tube_OFF", "prop"],
  bioRed: ["BioMonitor_Red", "prop"],
  // Crew
  bunk: ["Bunk_Double_Grey", "prop"],
  cafeTable: ["Cafeteria_Table", "prop"],
  octoTable: ["Octo_Table", "prop"],
  // Structure
  railing: ["Railing_Flat", "prop"],
};

const KST = "assets-src/kenney/station/Models/GLB format";
const KSP = "assets-src/kenney/space/Models/GLTF format";
/** Kenney models: kit id -> [source (no extension) or stack of sources (bottom first), group, scale]. */
const KENNEY = {
  // Space Station Kit (interiors), x2.4
  kBarrier: [`${KST}/structure-barrier`, "kprop", 2.4],
  kContainerTall: [`${KST}/container-tall`, "kprop", 2.4],
  kContainerWide: [`${KST}/container-wide`, "kprop", 2.4],
  kChair: [`${KST}/chair-armrest-headrest`, "kprop", 2.4],
  kTable: [`${KST}/table-large`, "kprop", 2.4],
  kTableDisplay: [`${KST}/table-display-planet`, "kprop", 2.4],
  // Space Kit (hangar, launch bay, the meteor), x4
  sCraftCargo: [`${KSP}/craft_cargoA`, "kprop", 4],
  sCraftCargoB: [`${KSP}/craft_cargoB`, "kprop", 4],
  sCraftMiner: [`${KSP}/craft_miner`, "kprop", 4],
  sCraftSpeeder: [`${KSP}/craft_speederA`, "kprop", 4],
  sRocket: [[`${KSP}/rocket_baseA`, `${KSP}/rocket_fuelA`, `${KSP}/rocket_sidesA`, `${KSP}/rocket_topA`], "kprop", 4],
  sHangar: [`${KSP}/hangar_largeA`, "kprop", 4],
  sDish: [`${KSP}/satelliteDish_large`, "kprop", 4],
  sRover: [`${KSP}/rover`, "kprop", 4],
  sGenerator: [`${KSP}/machine_generatorLarge`, "kprop", 4],
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
};
const QSF = "assets-src/quaternius-scifi/glb";
/**
 * Quaternius modular sci-fi: kit id -> [source, options]. `clip` cuts the model at that height (and
 * caps the cut); `floor` flattens a floor tile; `simplify` is a triangle ratio for busy props. Walls are 4 m wide, 4.43 m tall, on the line z = 0
 * with their panelled side towards +z.
 */
const QUAT = {
  // Walls (full height: the far/north and side walls)
  qWall1: ["Wall_1"],
  qWall2: ["Wall_2"],
  qWall3: ["Wall_3"],
  qWall4: ["Wall_4"],
  qWall5: ["Wall_5"],
  qWallEmpty: ["Wall_Empty"],
  qWindowLong: ["LongWindow_Wall_SideA"],
  qWindowSmall: ["SmallWindows_Wall_SideA"],
  qWindowThree: ["ThreeWindows_Wall_SideA"],
  qWindow: ["Window_Wall_SideA"],
  qDoorWall: ["DoorDouble_Wall_SideA"],
  qDoorWallSingle: ["DoorSingle_Wall_SideA"],
  // Cutaway walls (the camera-facing sides): the plinth and the first accent band
  qWallLow: ["Wall_Empty", { clip: 1.25 }],
  qWallLow2: ["Wall_2", { clip: 1.25 }],
  qWallLow4: ["Wall_4", { clip: 1.25 }],
  // Columns
  qColumn2: ["Column_2"],
  qColumn3: ["Column_3"],
  qColumnSlim: ["Column_Slim"],
  qColumnLow: ["Column_3", { clip: 1.6 }],
  // Floor tiles (2 x 2 m) for landmarks
  qFloorSide: ["FloorTile_Side", { floor: true }],
  // Props
  qCapsule: ["Props_Capsule", { simplify: 0.5 }],
  qPod: ["Props_Pod", { simplify: 0.5 }],
  qComputer: ["Props_Computer"],
  qComputerSmall: ["Props_ComputerSmall"],
  qContainer: ["Props_ContainerFull", { simplify: 0.25 }],
  qCrate: ["Props_Crate", { simplify: 0.3 }],
  qCrateLong: ["Props_CrateLong", { simplify: 0.3 }],
  qLaser: ["Props_Laser"],
  qShelf: ["Props_Shelf"],
  qShelfTall: ["Props_Shelf_Tall"],
  qStatue: ["Props_Statue"],
  qTeleporter: ["Props_Teleporter_1"],
  qTeleporter2: ["Props_Teleporter_2"],
  qVessel: ["Props_Vessel"],
  qVesselTall: ["Props_Vessel_Tall"],
  qBase: ["Props_Base"],
  qPipes: ["Pipes"],
  // Wall details
};
/** Quaternius materials -> [kind, linear colour]. "accent" is tinted per sector at runtime. */
const QMAT = {
  Main: ["palette", [0.42, 0.43, 0.45]],
  DarkGrey: ["palette", [0.045, 0.05, 0.058]],
  Black: ["palette", [0.01, 0.011, 0.014]],
  Pipes: ["palette", [0.018, 0.019, 0.023]],
  Accent: ["accent", [1, 1, 1]],
  DarkAccent: ["accent", [0.3, 0.3, 0.3]],
  Light: ["glow", [0.6, 0.78, 1]],
  Glass: ["glass", [0.25, 0.42, 0.5]],
};
/** Cut caps (the top of a clipped wall): graphite. */
const CAP_COLOUR = [0.03, 0.033, 0.04];

const HPK = "assets-src/hallwaypack";
/** HallwayPACK: kit id -> [file, node, options]. Halls run along z (8 m), ~8.3 m across. */
const HALL = {
  hHall: ["HallwayPACK_GLB.glb", "Hall_NoLight", { clip: 2.6 }],
  hHallWindow: ["HallwayPACK_GLB.glb", "Hall_NoLight_Window", { clip: 2.6 }],
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
  hall: [0.2, 0.62],
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
for (const [id, [file, options = {}]] of Object.entries(QUAT)) {
  const doc = await io.read(path.join(ROOT, QSF, `${file}.glb`));
  for (const animation of doc.getRoot().listAnimations()) animation.dispose();
  bakeTransforms(doc);
  await bakeVertexColours(doc, "prop", QMAT);
  if (options.clip) clipAbove(doc, options.clip, false);
  if (options.floor) flattenFloor(doc);
  if (options.simplify) {
    // Flat-shaded: drop the split normals so the mesh welds, simplify, then re-flatten.
    for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) prim.setAttribute("NORMAL", null);
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: options.simplify, error: 0.02 }), unweld(), normals({ overwrite: true }));
  }
  addModel(doc, id, false);
}
for (const [id, [file, nodeName, options]] of Object.entries(HALL)) {
  const doc = await io.read(path.join(ROOT, HPK, file));
  for (const animation of doc.getRoot().listAnimations()) animation.dispose();
  for (const node of doc.getRoot().listScenes()[0].listChildren()) if (node.getName() !== nodeName) node.dispose();
  await doc.transform(prune());
  bakeTransforms(doc);
  await bakeVertexColours(doc, "hall");
  if (options.clip) clipAbove(doc, options.clip, true);
  addModel(doc, id, true);
}

for (const s of target.getRoot().listScenes()) if (s !== scene) s.dispose();
target.getRoot().setDefaultScene(scene);
for (const ext of target.getRoot().listExtensionsUsed()) ext.dispose();

// Three shared materials; the baked kind of each primitive was stored in its material name.
const shared = {
  palette: target.createMaterial("palette").setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.7).setMetallicFactor(0),
  glow: target.createMaterial("glow").setBaseColorFactor([0, 0, 0, 1]).setEmissiveFactor([1, 1, 1]),
  glass: target.createMaterial("glass").setBaseColorFactor([1, 1, 1, 0.35]).setAlphaMode("BLEND").setRoughnessFactor(0.1).setMetallicFactor(0),
  accent: target.createMaterial("accent").setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.5).setMetallicFactor(0),
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
async function bakeVertexColours(doc, group, table = null) {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  await doc.transform(dequantize());
  const markers = {};
  const marker = (kind) => (markers[kind] ??= doc.createMaterial(kind));
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      const name = material?.getName() ?? "";
      const fixed = table?.[name] ?? (table ? ["palette", [0.1, 0.1, 0.1]] : null);
      const kind = fixed ? fixed[0] : name.includes("Glass") || name.includes("Holo") ? "glass" : name.includes("Emissive") || KENNEY_GLOW.has(name) ? "glow" : "palette";
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
        if (fixed) out = fixed[1];
        else if (kind === "glow" && KENNEY_GLOW.has(name)) out = saturate(rgb.map((c, k) => c * factor[k] * 1.3), GLOW_BOOST);
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

/** Moves a model (a document) into the kit as node `id`; `centre` puts its footprint centre on the origin. */
function addModel(doc, id, centre) {
  const src = doc.getRoot().listScenes()[0];
  const wrapper = doc.createNode(id);
  const inner = doc.createNode(`${id}-model`);
  if (centre) {
    const { min, max } = getBounds(src);
    inner.setTranslation([-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2]);
  }
  for (const child of src.listChildren()) {
    src.removeChild(child);
    inner.addChild(child);
  }
  wrapper.addChild(inner);
  src.addChild(wrapper);
  const map = mergeDocuments(target, doc);
  scene.addChild(map.get(wrapper));
}

/** Bakes every node transform into its mesh (top down), so clipping works in model space. */
function bakeTransforms(doc) {
  const visit = (node) => {
    clearNodeTransform(node);
    node.listChildren().forEach(visit);
  };
  doc.getRoot().listScenes()[0].listChildren().forEach(visit);
}

/**
 * Cuts every triangle of `doc` at height `h` (keeping what is below) and caps the cut with flat
 * graphite tops: one cap over the whole cut, or (`split`) one per side of x = 0 (a hall's two walls).
 */
function clipAbove(doc, h, split) {
  const buffer = doc.getRoot().listBuffers()[0];
  const cuts = [];
  let paletteMaterial = null;
  let capMesh = null;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMaterial()?.getName() === "palette") paletteMaterial = prim.getMaterial();
      const P = prim.getAttribute("POSITION"), N = prim.getAttribute("NORMAL"), C = prim.getAttribute("COLOR_0");
      const indices = prim.getIndices();
      const count = indices ? indices.getCount() : P.getCount();
      const vertex = (i) => {
        const v = indices ? indices.getScalar(i) : i;
        return { p: P.getElement(v, []), n: N ? N.getElement(v, []) : [0, 1, 0], c: C.getElement(v, []) };
      };
      const lerp = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
      const out = { p: [], n: [], c: [] };
      const push = (v) => { out.p.push(...v.p); out.n.push(...v.n); out.c.push(...v.c); };
      for (let t = 0; t + 2 < count; t += 3) {
        const tri = [vertex(t), vertex(t + 1), vertex(t + 2)];
        const poly = [];
        for (let k = 0; k < 3; k++) {
          const a = tri[k], b = tri[(k + 1) % 3];
          const aIn = a.p[1] <= h, bIn = b.p[1] <= h;
          if (aIn) poly.push(a);
          if (aIn !== bIn) {
            const f = (h - a.p[1]) / (b.p[1] - a.p[1]);
            const v = { p: lerp(a.p, b.p, f), n: lerp(a.n, b.n, f), c: lerp(a.c, b.c, f) };
            v.p[1] = h;
            poly.push(v);
            cuts.push(v.p);
          }
        }
        for (let k = 1; k + 1 < poly.length; k++) { push(poly[0]); push(poly[k]); push(poly[k + 1]); }
      }
      if (!out.p.length) { prim.dispose(); continue; }
      prim.setIndices(null);
      prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(out.p)).setBuffer(buffer));
      prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(out.n)).setBuffer(buffer));
      prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(new Uint8Array(out.c.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255)))).setNormalized(true).setBuffer(buffer));
      capMesh ??= mesh;
    }
  }
  if (!capMesh || !cuts.length) return;
  const groups = split ? [cuts.filter((p) => p[0] < 0), cuts.filter((p) => p[0] >= 0)] : [cuts];
  const p = [], n = [], c = [];
  const y = h + 0.01;
  for (const g of groups) {
    if (!g.length) continue;
    const x0 = Math.min(...g.map((q) => q[0])), x1 = Math.max(...g.map((q) => q[0]));
    const z0 = Math.min(...g.map((q) => q[2])), z1 = Math.max(...g.map((q) => q[2]));
    p.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
    for (let i = 0; i < 6; i++) { n.push(0, 1, 0); c.push(...CAP_COLOUR.map((v) => Math.round(v * 255)), 255); }
  }
  const cap = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(p)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(n)).setBuffer(buffer))
    .setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(new Uint8Array(c)).setNormalized(true).setBuffer(buffer))
    .setMaterial(paletteMaterial ?? doc.createMaterial("palette"));
  capMesh.addPrimitive(cap);
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
