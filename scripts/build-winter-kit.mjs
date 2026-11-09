// Builds the winter chapter's environment kit: public/models/winter/winter-kit.glb
//
// Sources (all CC0, Kenney, www.kenney.nl; mirrored at github.com/series-ai/jam-ready-assets and copied
// into assets-src/winter-kenney/<pack>/, git-ignored): Holiday Kit 2.0 (snowy pines, rocks, snow
// drifts, log cabin pieces, lanterns, sleds), City Kit Suburban (houses, fences, garden trees,
// driveways), Car Kit (cars, trucks, police, ambulance, fire truck, tractor, debris), Survival Kit
// (pines, logs, stumps, tents, camp fires, barrels, crates, fences, sheds) and City Kit Roads (road
// tiles, street lights, construction barriers).
//
// Every model becomes one top-level node named by its kit id with its scale baked in. Two passes make
// the town a winter one:
//   - snow caps: every up-facing face (normal y > 0.5) of a model gets a copy lifted a few centimetres
//     along its normal in a shared white "snow" material: roofs, car roofs and bonnets, crates, fences;
//   - charred variants (`char`): the model's materials darkened to soot (burnt-out cars, the fire's
//     wrecks), with snow only on what has cooled.
//
//   node scripts/build-winter-kit.mjs           (SRC=assets-src/winter-kenney by default)
import fs from "node:fs";
import path from "node:path";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, prune, unpartition } from "@gltf-transform/functions";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = process.env.SRC ?? path.join(ROOT, "assets-src/winter-kenney");
const outFile = path.join(ROOT, "public/models/winter/winter-kit.glb");
const PACK = { H: "kenney-holiday-kit", S: "kenney-city-kit-suburban", C: "kenney-car-kit", V: "kenney-survival-kit", R: "kenney-city-kit-roads" };

/** Kit id -> [pack:file, scale, options]. options.snow (default true): add snow caps; char: soot. */
const NO = { snow: false };
const CAR = 1.75;
const MANIFEST = {
  // ---- forest (Holiday pines are already snowed on; the Survival pines get caps)
  pineSnowA: ["H:tree-snow-a", 3.8, NO], pineSnowB: ["H:tree-snow-b", 4.2, NO], pineSnowC: ["H:tree-snow-c", 3.4, NO], pineBare: ["H:tree", 3.6],
  pine: ["V:tree", 4.4], pineTall: ["V:tree-tall", 4.6], deadTree: ["V:tree-autumn-trunk", 5], log: ["V:tree-log", 4], logSmall: ["V:tree-log-small", 4], stump: ["V:tree-trunk", 4],
  rockLarge: ["H:rocks-large", 1.5, NO], rockMedium: ["H:rocks-medium", 1.5, NO], rockSmall: ["H:rocks-small", 1.5, NO],
  rockA: ["V:rock-a", 3], rockB: ["V:rock-b", 3], rockC: ["V:rock-c", 3], rockFlat: ["V:rock-flat", 3],
  snowPile: ["H:snow-pile", 3, NO], snowBank: ["H:snow-bunker", 2.2, NO], snowFlat: ["H:snow-flat", 2.5, NO], snowFlatLarge: ["H:snow-flat-large", 2.5, NO],
  // ---- the hunters' camp
  tent: ["V:tent", 4], tentCanvas: ["V:tent-canvas", 4], tentHalf: ["V:tent-canvas-half", 4], campfire: ["V:campfire-pit", 4, NO], campfireStand: ["V:campfire-stand", 4],
  bedroll: ["V:bedroll", 4, NO], barrel: ["V:barrel", 3.4], barrelOpen: ["V:barrel-open", 3.4], box: ["V:box", 3], boxLarge: ["V:box-large", 3], boxOpen: ["V:box-large-open", 3],
  chest: ["V:chest", 3], workbench: ["V:workbench", 3.5], signpost: ["V:signpost", 4], signpostSingle: ["V:signpost-single", 4], planks: ["V:resource-planks", 4],
  axe: ["V:tool-axe", 4, NO], shovel: ["V:tool-shovel", 4, NO],
  fenceWood: ["V:fence", 4], fenceFort: ["V:fence-fortified", 4], fenceGate: ["V:fence-doorway", 4],
  shed: ["V:structure", 6], shedRoof: ["V:structure-roof", 6], shack: ["V:structure-metal", 6], shackRoof: ["V:structure-metal-roof", 6], shackWall: ["V:structure-metal-wall", 6], shelter: ["V:structure-canvas", 6],
  // ---- the farm: log cabin modules (3 m), sleds, lanterns
  cabinWall: ["H:cabin-wall", 3], cabinWindow: ["H:cabin-window-a", 3], cabinWindowB: ["H:cabin-window-b", 3], cabinWindowLarge: ["H:cabin-window-large", 3],
  cabinDoorway: ["H:cabin-doorway", 3], cabinDoor: ["H:cabin-door-rotate", 3], cabinCorner: ["H:cabin-corner-logs", 3], cabinWallLow: ["H:cabin-wall-low", 3],
  cabinWallRoof: ["H:cabin-wall-roof", 3], cabinRoof: ["H:cabin-roof-snow", 3, NO], cabinRoofPoint: ["H:cabin-roof-snow-point", 3, NO], cabinRoofCorner: ["H:cabin-roof-snow-corner", 3, NO],
  cabinRoofChimney: ["H:cabin-roof-snow-chimney", 3, NO], cabinFence: ["H:cabin-fence", 2.6], floorWood: ["H:floor-wood-snow", 3, NO],
  lantern: ["H:lantern", 1.3], lanternHanging: ["H:lantern-hanging", 1.3], bench: ["H:bench", 1.6], sled: ["H:sled", 1.6], snowman: ["H:snowman", 1.5, NO],
  tractor: ["C:tractor", CAR], tractorShovel: ["C:tractor-shovel", CAR],
  // ---- the suburb: houses (x7), garden fences, trees, driveways
  houseA: ["S:building-type-a", 7], houseB: ["S:building-type-b", 7], houseC: ["S:building-type-c", 7], houseD: ["S:building-type-d", 7], houseE: ["S:building-type-e", 7],
  houseF: ["S:building-type-f", 7], houseG: ["S:building-type-g", 7], houseH: ["S:building-type-h", 7], houseJ: ["S:building-type-j", 7], houseK: ["S:building-type-k", 7],
  houseL: ["S:building-type-l", 7], houseM: ["S:building-type-m", 7], houseN: ["S:building-type-n", 7], houseO: ["S:building-type-o", 7], houseP: ["S:building-type-p", 7],
  houseQ: ["S:building-type-q", 7], houseR: ["S:building-type-r", 7], houseS: ["S:building-type-s", 7], houseT: ["S:building-type-t", 7], houseU: ["S:building-type-u", 7],
  fence1x4: ["S:fence-1x4", 4.6], fence1x3: ["S:fence-1x3", 4.6], fence2x3: ["S:fence-2x3", 4.6], fenceLow: ["S:fence-low", 4.6], fencePost: ["S:fence", 4.6],
  gardenTree: ["S:tree-large", 7], gardenTreeSmall: ["S:tree-small", 7], planter: ["S:planter", 4.6],
  driveway: ["S:driveway-long", 7.5, NO], drivewayShort: ["S:driveway-short", 7.5, NO], path: ["S:path-long", 7.5, NO], pathStones: ["S:path-stones-messy", 7.5, NO],
  // ---- vehicles (x1.75: a sedan ~4.4 m) and their charred wrecks
  sedan: ["C:sedan", CAR], sedanSports: ["C:sedan-sports", CAR], hatchback: ["C:hatchback-sports", CAR], suv: ["C:suv", CAR], suvLuxury: ["C:suv-luxury", CAR],
  van: ["C:van", CAR], truck: ["C:truck", CAR], truckFlat: ["C:truck-flat", CAR], taxi: ["C:taxi", CAR], police: ["C:police", CAR], ambulance: ["C:ambulance", CAR],
  firetruck: ["C:firetruck", CAR], garbageTruck: ["C:garbage-truck", CAR], delivery: ["C:delivery", CAR],
  sedanBurnt: ["C:sedan", CAR, { char: true, snow: false }], suvBurnt: ["C:suv", CAR, { char: true, snow: false }], vanBurnt: ["C:van", CAR, { char: true, snow: false }], policeBurnt: ["C:police", CAR, { char: true, snow: false }],
  truckBurnt: ["C:truck", CAR, { char: true, snow: false }], busBurnt: ["C:garbage-truck", CAR, { char: true, snow: false }], taxiBurnt: ["C:taxi", CAR, { char: true, snow: false }],
  debrisDoor: ["C:debris-door-window", CAR], debrisBumper: ["C:debris-bumper", CAR], debrisTire: ["C:debris-tire", CAR], debrisPlate: ["C:debris-plate-a", CAR],
  debrisAxle: ["C:debris-drivetrain", CAR], wheel: ["C:wheel-dark", CAR], cone: ["C:cone", 1.5],
  // ---- streets (8 m tiles), lights, barriers
  road: ["R:road-straight", 8, NO], roadCross: ["R:road-crossroad", 8, NO], roadT: ["R:road-intersection", 8, NO], roadEnd: ["R:road-end", 8, NO], roadBend: ["R:road-bend", 8, NO],
  roadCrossing: ["R:road-crossing", 8, NO], roadSide: ["R:road-side", 8, NO], tilePavement: ["R:tile-low", 8, NO],
  streetLight: ["R:light-square", 8], streetLightDouble: ["R:light-square-double", 8], streetLightCurved: ["R:light-curved", 8],
  barrier: ["R:construction-barrier", 8], barrierLight: ["R:construction-light", 8], roadCone: ["R:construction-cone", 8], highwaySign: ["R:sign-highway", 6],
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const file = (ref) => {
  const [pack, name] = ref.split(":");
  const f = path.join(SRC, PACK[pack], `${name}.glb`);
  if (!fs.existsSync(f)) throw new Error(`no model ${ref} (${f})`);
  return f;
};

const out = await io.read(file("H:bench"));
const outRoot = out.getRoot();
const outScene = outRoot.listScenes()[0];
for (const n of outScene.listChildren()) outScene.removeChild(n);
outRoot.listNodes().forEach((n) => n.dispose());
outRoot.listAnimations().forEach((a) => a.dispose());
const buffer = outRoot.listBuffers()[0];
const snowMat = out.createMaterial("snow").setBaseColorFactor([0.86, 0.9, 0.96, 1]).setRoughnessFactor(1).setMetallicFactor(0);
const charred = new Map();
const charMat = (m) => {
  if (!charred.has(m)) charred.set(m, m.clone().setName(`${m.getName()}_charred`).setBaseColorFactor([0.2, 0.18, 0.17, 1]));
  return charred.get(m);
};

/** World-space up-facing triangles of everything under `holder`, lifted along their normals. */
function snowCap(holder, lift) {
  const P = [], N = [];
  const visit = (node) => {
    const mesh = node.getMesh();
    if (mesh) {
      const m = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMaterial() === snowMat) continue;
        const pos = prim.getAttribute("POSITION"), idx = prim.getIndices();
        const count = idx ? idx.getCount() : pos.getCount();
        const v = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], el = [0, 0, 0];
        for (let t = 0; t < count; t += 3) {
          for (let k = 0; k < 3; k++) {
            pos.getElement(idx ? idx.getScalar(t + k) : t + k, el);
            v[k] = [m[0] * el[0] + m[4] * el[1] + m[8] * el[2] + m[12], m[1] * el[0] + m[5] * el[1] + m[9] * el[2] + m[13], m[2] * el[0] + m[6] * el[1] + m[10] * el[2] + m[14]];
          }
          const ax = v[1][0] - v[0][0], ay = v[1][1] - v[0][1], az = v[1][2] - v[0][2];
          const bx = v[2][0] - v[0][0], by = v[2][1] - v[0][1], bz = v[2][2] - v[0][2];
          let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
          const len = Math.hypot(nx, ny, nz);
          if (len < 1e-9) continue;
          nx /= len; ny /= len; nz /= len;
          if (ny < 0.5) continue;
          // Ground-level faces (wheels' treads, footings) stay bare: snow lies on what stands up.
          if (Math.max(v[0][1], v[1][1], v[2][1]) < 0.12) continue;
          for (const p of v) { P.push(p[0] + nx * lift, p[1] + ny * lift, p[2] + nz * lift); N.push(nx, ny, nz); }
        }
      }
    }
    node.listChildren().forEach(visit);
  };
  visit(holder);
  if (!P.length) return null;
  const prim = out.createPrimitive().setMaterial(snowMat)
    .setAttribute("POSITION", out.createAccessor().setType("VEC3").setArray(new Float32Array(P)).setBuffer(buffer))
    .setAttribute("NORMAL", out.createAccessor().setType("VEC3").setArray(new Float32Array(N)).setBuffer(buffer));
  // Snow takes no texture: give it UVs anyway (the kit's materials expect TEXCOORD_0 to batch alike).
  prim.setAttribute("TEXCOORD_0", out.createAccessor().setType("VEC2").setArray(new Float32Array((P.length / 3) * 2)).setBuffer(buffer));
  return out.createNode("snow").setMesh(out.createMesh("snow").addPrimitive(prim));
}

let caps = 0;
for (const [id, [ref, scale, opt = {}]] of Object.entries(MANIFEST)) {
  const doc = await io.read(file(ref));
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  const map = mergeDocuments(out, doc);
  const scenes = doc.getRoot().listScenes().map((s) => map.get(s));
  const holder = out.createNode(id);
  for (const s of scenes) {
    for (const child of s.listChildren()) {
      s.removeChild(child);
      const t = child.getTranslation(), k = child.getScale();
      child.setTranslation([t[0] * scale, t[1] * scale, t[2] * scale]).setScale([k[0] * scale, k[1] * scale, k[2] * scale]);
      holder.addChild(child);
    }
    s.dispose();
  }
  // Centre the footprint on the origin.
  const bb = getBounds(holder);
  const cx = (bb.min[0] + bb.max[0]) / 2, cz = (bb.min[2] + bb.max[2]) / 2;
  for (const child of holder.listChildren()) { const t = child.getTranslation(); child.setTranslation([t[0] - cx, t[1] - bb.min[1], t[2] - cz]); }
  if (opt.char) {
    const visit = (n) => { for (const p of n.getMesh()?.listPrimitives() ?? []) if (p.getMaterial()) p.setMaterial(charMat(p.getMaterial())); n.listChildren().forEach(visit); };
    visit(holder);
  }
  if (opt.snow !== false) {
    const cap = snowCap(holder, 0.025 + 0.004 * scale);
    if (cap) { holder.addChild(cap); caps++; }
  }
  outScene.addChild(holder);
}

await out.transform(dedup(), prune(), unpartition());
for (const t of outRoot.listTextures()) {
  const img = await sharp(Buffer.from(t.getImage())).resize(256, 256, { fit: "inside", kernel: "nearest" }).webp({ quality: 95 }).toBuffer();
  t.setImage(img).setMimeType("image/webp").setURI("");
}
for (const m of outRoot.listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(m === snowMat ? 1 : 0.85);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
await io.write(outFile, out);
const tris = outRoot.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3, 0), 0);
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(2)} MB): ${Object.keys(MANIFEST).length} models (${caps} snow-capped), ${Math.round(tris)} triangles, ` +
  `${outRoot.listMaterials().length} materials, ${outRoot.listTextures().length} textures`);
