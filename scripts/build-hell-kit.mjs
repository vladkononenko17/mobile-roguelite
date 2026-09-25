// Builds the hell kit: public/models/hell/hell-kit.glb
//
// Sources (`hell` release, see assets-src/SOURCES.md):
// - "Inferno World" (free): basalt crags and rocks, braziers, columns, giant bones and gears, a
//   knight statue and a tower, gold, a lava well. Authored at a giant scale; placed at SCALE_INFERNO.
// - "SHS Dungeon Pack" by Small Hearth Studios (free): stone walls, pillars, archways, altars,
//   cages, stocks, a spike wheel, racks, chains, bone piles, a throne. Real-world scale. FBX
//   converted to GLB with FBX2glTF first (assets-src/shs-dungeon/glb/).
//
// Same approach as scripts/build-facility-kit.mjs: every material is baked into vertex colours on
// a shared "palette" material (graded darker, warmer and a little desaturated so it sits with the
// other maps) or, for self-lit parts (the Inferno "Emission" material), a "glow" material. Every
// model is re-centred on its footprint with its base on the ground and pre-scaled, so the level
// file places everything in metres.
//
// Not part of the normal build. To regenerate:
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp
//   node scripts/build-hell-kit.mjs
import fs from "node:fs";
import path from "node:path";
import { Document, NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compactPrimitive, dedup, dequantize, mergeDocuments, prune, simplify, unpartition, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const INF = "assets-src/inferno-world/glb";
const SHS = "assets-src/shs-dungeon/glb";
/** The SHS FBX files reference their palette by an absolute path on the author's disk, so the
 * converted GLBs carry a 1x1 placeholder; the pack's palette is sampled instead (FBX V is up). */
const SHS_PALETTE = "assets-src/shs-dungeon/palette.png";
/** "Lowpoly alien buildings" (hell2 release): skinned, animated organic growths; baked static. Their
 * FBX files do not embed textures, so each material's base colour is given here. */
const FLESH = "assets-src/hell2/buildings";
const FLESH_TEX = {
  "Material.001": "birther/shroom_low_v2_DefaultMaterial_BaseColor.png",
  BrainBody: "brain/brain_BrainBody_BaseColor.png", "Brain Detail": "brain/brain_Brain Detail_BaseColor.png",
  "Claw Body": "claw/claw_Claw Body_BaseColor.png", "Claw Detail": "claw/claw_Claw Detail_BaseColor.png",
  StomachBody: "stomach/stomach_StomachBody_BaseColor.png", "Stomach Detail": "stomach/stomach_Stomach Detail_BaseColor.png",
  Terraformer: "terraformer/terraformer_Terraformer_AlbedoTransparency.png", terraformer_detail: "terraformer/terraformer_terraformer_detail_AlbedoTransparency.png",
};
const outFile = path.join(ROOT, "public/models/hell/hell-kit.glb");

/** Inferno World is modelled ~2x real size (its brazier is 2.9 units tall). */
const SCALE_INFERNO = 0.5;

/**
 * Kit id -> [source, grade group, extra scale, keepHeight]. keepHeight: keep the model's own
 * vertical origin (wall-mounted and hanging pieces, rocks sunk into the ground).
 */
const MANIFEST = {
  // Inferno World: rock and basalt
  crag: [`${INF}/Crag_001`, "rock", 1, true],
  cragBig: [`${INF}/Crag_003`, "rock", 1, true],
  rockMid1: [`${INF}/RockMid_001`, "rock"],
  rockMid2: [`${INF}/RockMid_002`, "rock"],
  rockMid3: [`${INF}/RockMid_003`, "rock"],
  rockMid4: [`${INF}/RockMid_004`, "rock"],
  rockSmall1: [`${INF}/RockSmall_001`, "rock"],
  rockSmall2: [`${INF}/RockSmall_002`, "rock"],
  rockSmall3: [`${INF}/RockSmall_003`, "rock"],
  rockBig: [`${INF}/RockBig_001`, "rock"],
  stoneSmall1: [`${INF}/StoneSmall_001`, "rock", 1, true],
  stoneSmall2: [`${INF}/StoneSmall_002`, "rock", 1, true],
  mound: [`${INF}/Mound_005`, "rock", 1, true],
  // Inferno World: basalt plateaus (the island's cliff sides) and the round ritual platform
  plateau: [`${INF}/PlatformSmall_001`, "cliff"],
  plateauLong: [`${INF}/PlatformSmall_002`, "cliff"],
  circlePlatform: [`${INF}/CirclePlatformSmall_001`, "stone"],
  // Inferno World: ruins and relics
  column: [`${INF}/ColumnBig_001`, "stone"],
  columnBroken: [`${INF}/ColumnBigBroken_001`, "stone"],
  columnStump: [`${INF}/ColumnBigBroken_002`, "stone", 1, true],
  brazier: [`${INF}/Brazier_002`, "prop"],
  brazierLow: [`${INF}/Brazier_004`, "prop"],
  pedestal: [`${INF}/Pedestal_001`, "stone"],
  statue: [`${INF}/StatueKnight_002`, "stone"],
  tower: [`${INF}/TowerBig_001`, "stone"],
  well: [`${INF}/WellSmall_001`, "stone"],
  boneRib: [`${INF}/Bone_003`, "bone", 1, true],
  boneHorn: [`${INF}/Bone_004`, "bone", 1, true],
  boneRib2: [`${INF}/Bone_006`, "bone", 1, true],
  gear: [`${INF}/Gear_001`, "prop", 1, true],
  gearSmall: [`${INF}/Gear_002`, "prop", 1, true],
  axe: [`${INF}/Axe_001`, "prop", 1, true],
  chest: [`${INF}/ChestBig_001`, "prop"],
  goldBig: [`${INF}/GoldPileBig_001`, "prop"],
  goldSmall: [`${INF}/GoldPileSmall_001`, "prop"],
  vase: [`${INF}/Vase_001`, "prop"],
  vase2: [`${INF}/Vase_002`, "prop"],
  crate: [`${INF}/Box_001`, "prop"],
  // SHS Dungeon: architecture
  wall: [`${SHS}/Wall_plain_A`, "stone"],
  wallBump: [`${SHS}/Wall_bumb_A`, "stone"],
  wallWindow: [`${SHS}/Wall_bumb_window_A`, "stone"],
  wallJail: [`${SHS}/Wall_jail`, "prop"],
  wallJailDoor: [`${SHS}/Wall_jail_entrance`, "prop"],
  archway: [`${SHS}/Door_archway_A`, "stone"],
  gateArch: [`${SHS}/Gate_archway_A`, "stone"],
  pillar: [`${SHS}/Floor_pillar_A`, "stone"],
  pillarRough: [`${SHS}/Pillar_rough_A`, "stone"],
  stairs: [`${SHS}/Staircase_stone_big_A`, "stone"],
  // SHS Dungeon: rites and torture
  altar: [`${SHS}/Altar_round_A`, "stone"],
  altarSquare: [`${SHS}/Altar_square_A`, "stone"],
  throne: [`${SHS}/Throne_A`, "stone"],
  cage: [`${SHS}/Cage`, "prop"],
  cross: [`${SHS}/Cross`, "prop"],
  rack: [`${SHS}/Rack`, "prop"],
  spikeWheel: [`${SHS}/Spike_Wheel`, "prop"],
  stockade: [`${SHS}/Stockade`, "prop"],
  jailBench: [`${SHS}/Jail_bench`, "prop"],
  table: [`${SHS}/Table`, "prop"],
  barrel: [`${SHS}/Barrel`, "prop"],
  bones1: [`${SHS}/Bone_pile_A`, "bone"],
  bones2: [`${SHS}/Bone_pile_C`, "bone"],
  bones3: [`${SHS}/Bone_pile_D`, "bone"],
  skeleton: [`${SHS}/Bone_pile_skeleton`, "bone"],
  skull: [`${SHS}/Skeleton_skull`, "bone"],
  chain: [`${SHS}/Chain`, "prop", 1, true],
  chainHang: [`${SHS}/Chain_hanging`, "prop", 1, true],
  wallTorch: [`${SHS}/Wall_torch`, "prop", 1, true],
  lantern: [`${SHS}/Lanten`, "prop", 1, true],
  candles: [`${SHS}/Candle_B`, "prop"],
  puddleA: [`${SHS}/Puddle_A`, "blood"],
  puddleB: [`${SHS}/Puddle_B`, "blood"],
  puddleC: [`${SHS}/Puddle_C`, "blood"],
  rubble: [`${SHS}/Rubble_A`, "stone"],
  // Flesh growths: demon corruption spreading over the rock (scaled up to 5-9 m).
  fleshSpire: [`${FLESH}/bld_birther`, "flesh", 5],
  fleshBrain: [`${FLESH}/bld_brain`, "flesh", 6],
  fleshClaw: [`${FLESH}/bld_claw`, "flesh", 5],
  fleshGut: [`${FLESH}/bld_stomach`, "flesh", 6],
  fleshStalk: [`${FLESH}/bld_terraformer`, "flesh", 6],
};

/** Grade per group: [saturation kept, brightness, tint]. Grey-violet stone (as in the Inferno World
 * renders); the lava, braziers and light pools carry the orange. */
const WARM = [0.97, 0.94, 1.04];
const GRADE = {
  rock: [0.7, 0.42, WARM],
  cliff: [0.6, 0.36, WARM],
  stone: [0.7, 0.5, WARM],
  prop: [0.85, 0.62, WARM],
  bone: [0.5, 0.36, [1.05, 0.95, 0.85]],
  blood: [1, 0.3, [1.2, 0.5, 0.45]],
  flesh: [0.9, 0.55, [1.1, 0.8, 0.8]],
};
/** Heavy meshes (many small parts) reduced with the sloppy simplifier: id -> kept ratio. */
const SLOPPY = { statue: 0.25, tower: 0.2, goldBig: 0.2, chest: 0.4, cragBig: 0.5, crag: 0.6, gear: 0.6, brazier: 0.6 };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const target = new Document();
const scene = target.createScene("hell-kit");
const textureCache = new Map();

for (const [id, [file, group, extraScale = 1, keepHeight = false]] of Object.entries(MANIFEST)) {
  const doc = await io.read(path.join(ROOT, `${file}.glb`));
  for (const animation of doc.getRoot().listAnimations()) animation.dispose();
  // Skinned sources become static meshes in their bind pose.
  for (const node of doc.getRoot().listNodes()) node.setSkin(null);
  for (const skin of doc.getRoot().listSkins()) skin.dispose();
  await bakeVertexColours(doc, group, file.startsWith(SHS), file.startsWith(FLESH));
  const source = doc.getRoot().listScenes()[0];
  const scale = (file.startsWith(INF) ? SCALE_INFERNO : 1) * extraScale;
  // Re-centre on the footprint, base on the ground (unless keepHeight), then scale.
  const { min, max } = getBounds(source);
  const offset = [-(min[0] + max[0]) / 2, keepHeight ? 0 : -min[1], -(min[2] + max[2]) / 2];
  const wrapper = doc.createNode(id);
  const scaler = doc.createNode(`${id}-scale`).setScale([scale, scale, scale]).setTranslation(offset.map((v) => v * scale));
  for (const s of doc.getRoot().listScenes()) {
    for (const child of s.listChildren()) {
      s.removeChild(child);
      scaler.addChild(child);
    }
  }
  wrapper.addChild(scaler);
  source.addChild(wrapper);
  const map = mergeDocuments(target, doc);
  scene.addChild(map.get(wrapper));
}
for (const s of target.getRoot().listScenes()) if (s !== scene) s.dispose();
target.getRoot().setDefaultScene(scene);
for (const ext of target.getRoot().listExtensionsUsed()) ext.dispose();

const shared = {
  palette: target.createMaterial("palette").setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0),
  glow: target.createMaterial("glow").setBaseColorFactor([0, 0, 0, 1]).setEmissiveFactor([1, 1, 1]),
};
for (const mesh of target.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) prim.setMaterial(shared[prim.getMaterial()?.getName() ?? "palette"] ?? shared.palette);
}
for (const material of target.getRoot().listMaterials()) if (!Object.values(shared).includes(material)) material.dispose();
for (const texture of target.getRoot().listTextures()) texture.dispose();

const before = countTriangles(target);
await target.transform(unpartition(), dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.4, error: 0.004 }), prune());
await MeshoptSimplifier.ready;
for (const [id, ratio] of Object.entries(SLOPPY)) {
  const node = scene.listChildren().find((n) => n.getName() === id);
  const prims = [];
  node?.traverse((n) => n.getMesh()?.listPrimitives().forEach((p) => prims.push(p)));
  for (const prim of prims) {
    const indices = prim.getIndices();
    if (!indices) continue;
    const positions = prim.getAttribute("POSITION").getArray();
    const count = Math.max(36, Math.floor((indices.getCount() * ratio) / 3) * 3);
    const [out] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(indices.getArray()), Float32Array.from(positions), 3, null, count, 0.02);
    indices.setArray(positions.length / 3 > 65535 ? out : Uint16Array.from(out));
    compactPrimitive(prim);
  }
}
await target.transform(prune());

fs.mkdirSync(path.dirname(outFile), { recursive: true });
await io.write(outFile, target);

console.log(`materials: ${target.getRoot().listMaterials().map((m) => m.getName()).join(", ")}`);
console.log(`triangles ${before} -> ${countTriangles(target)}`);
for (const node of scene.listChildren()) {
  const { min, max } = getBounds(node);
  console.log(`  ${node.getName().padEnd(13)} ${String(countTriangles(target, node)).padStart(5)}  ${max.map((v, i) => (v - min[i]).toFixed(2)).join(" x ")}`);
}
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);

/** Bakes every primitive to vertex colours; the kind (palette / glow) goes in a marker material. */
async function bakeVertexColours(doc, group, shs, flesh) {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  await doc.transform(dequantize());
  const markers = {};
  const marker = (kind) => (markers[kind] ??= doc.createMaterial(kind));
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      const glow = (material?.getName() ?? "").startsWith("Emission");
      const factor = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const emissive = material?.getEmissiveFactor() ?? [0, 0, 0];
      const texture = glow ? (material?.getEmissiveTexture() ?? material?.getBaseColorTexture()) : material?.getBaseColorTexture();
      let image = texture ? await decode(texture) : null;
      if (shs) image = await decodeFile(path.join(ROOT, SHS_PALETTE));
      if (flesh && FLESH_TEX[material?.getName()]) image = await decodeFile(path.join(ROOT, FLESH, "textures", FLESH_TEX[material.getName()]));
      const uvs = prim.getAttribute("TEXCOORD_0");
      const count = prim.getAttribute("POSITION").getCount();
      const colours = new Uint8Array(count * 4);
      const uv = [0, 0];
      for (let i = 0; i < count; i++) {
        let rgb = [1, 1, 1];
        if (image && uvs) {
          uvs.getElement(i, uv);
          rgb = sample(image, uv[0], shs || flesh ? 1 - uv[1] : uv[1]);
        }
        const out = glow ? lavaGlow(rgb) : grade(rgb.map((c, k) => c * factor[k]), group);
        colours.set([...out.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)), 255], i * 4);
      }
      prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(colours).setNormalized(true).setBuffer(buffer));
      for (const semantic of prim.listSemantics()) {
        if (!["POSITION", "NORMAL", "COLOR_0"].includes(semantic)) prim.setAttribute(semantic, null);
      }
      for (const target of prim.listTargets()) prim.removeTarget(target);
      prim.setMaterial(marker(glow ? "glow" : "palette"));
    }
  }
}

/** Self-lit parts glow like lava whatever their source colour: brightness mapped onto a fire ramp. */
function lavaGlow(rgb) {
  const luma = Math.min(1, (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) * 1.6);
  return [Math.min(1, 0.35 + luma), 0.08 + luma * 0.5, 0.02 + luma * 0.1];
}

function grade(rgb, group) {
  const [keep, brightness, tint] = GRADE[group];
  const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return rgb.map((c, k) => (luma + (c - luma) * keep) * tint[k] * brightness);
}

async function decode(texture) {
  const key = texture.getImage();
  if (!textureCache.has(key)) {
    const { data, info } = await sharp(Buffer.from(key)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    textureCache.set(key, { data, width: info.width, height: info.height });
  }
  return textureCache.get(key);
}

async function decodeFile(file) {
  if (!textureCache.has(file)) {
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    textureCache.set(file, { data, width: info.width, height: info.height });
  }
  return textureCache.get(file);
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
