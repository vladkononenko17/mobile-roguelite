// Builds the medieval chapter's environment kit: public/models/medieval/medieval-kit.glb
//
// Sources (all CC0, Kay Lousberg / KayKit, github.com/KayKit-Game-Assets, cloned into
// assets-src/medieval/): Dungeon Remastered (castle walls, arches, gates, pillars, torches, props),
// Medieval Hexagon Pack (castle, church, towers, houses, curtain walls, trees, rocks; modelled at
// hex-tile size, so scaled up here), Halloween Bits (graveyard: graves, crypt, fences, dead trees).
// Every model becomes one top-level node named by its kit id, scale baked in; the packs share
// three small colour atlases, so the whole kit batches into a handful of draw calls per cell.
//
// Not part of the normal build. To regenerate:
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp
//   node scripts/build-medieval-kit.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, prune, unpartition, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "assets-src/medieval");
const outFile = path.join(ROOT, "public/models/medieval/medieval-kit.glb");

// File index: every model file in the packs (names are unique enough per pack).
const files = execSync(`find -L "${SRC}" -name "*.gltf" -o -name "*.glb"`, { encoding: "utf8" }).split("\n").filter((f) => f && !/\/Characters\/|\/Samples\//.test(f));
const find = (name) => {
  const hit = files.find((f) => path.basename(f).replace(/\.gltf\.glb$|\.gltf$|\.glb$/, "") === name);
  if (!hit) throw new Error(`no model ${name}`);
  return hit;
};

const D = 1;      // Dungeon Remastered: 4 m walls already
const HX = 6.5;   // Hexagon pack: hex-tile miniatures -> real size
const HB = 1;     // Halloween Bits: metres

/** Kit id -> [source name, scale]. */
const MANIFEST = {
  // ---- castle walls (Dungeon, 4 x 4 m modules, centred on their footprint)
  wall: ["wall", D], wallArched: ["wall_arched", D], wallBroken: ["wall_broken", D], wallCracked: ["wall_cracked", D],
  wallDoorway: ["wall_doorway", D], wallGated: ["wall_gated", D], wallWindow: ["wall_window_open", D],
  wallWindowClosed: ["wall_window_closed", D], wallArchedWindow: ["wall_archedwindow_gated", D], wallHalf: ["wall_half", D],
  wallPillar: ["wall_pillar", D], wallCorner: ["wall_corner", D], wallScaffold: ["wall_scaffold", D], wallEndcap: ["wall_endcap", D],
  pillarDungeon: ["pillar", D], pillarDecorated: ["pillar_decorated", D], columnShort: ["column", D],
  stairs: ["stairs", D], stairsWide: ["stairs_wide", D], floorTile: ["floor_tile_large", D], floorTileRocks: ["floor_tile_large_rocks", D],
  floorDirt: ["floor_dirt_large", D], floorDirtRocky: ["floor_dirt_large_rocky", D],
  // ---- castle props (Dungeon)
  torchMounted: ["torch_mounted", D], torchLit: ["torch_lit", D], barrelLarge: ["barrel_large", D], barrelSmall: ["barrel_small", D],
  barrelStack: ["barrel_small_stack", D], boxLarge: ["box_large", D], boxStacked: ["box_stacked", D], cratesStacked: ["crates_stacked", D],
  chest: ["chest", D], chestGold: ["chest_gold", D], tableLong: ["table_long", D], tableBroken: ["table_long_broken", D],
  tableDecorated: ["table_long_decorated_A", D], tableClothed: ["table_long_tablecloth_decorated_A", D], chair: ["chair", D], stool: ["stool", D],
  keg: ["keg", D], kegDecorated: ["keg_decorated", D], rubble: ["rubble_large", D], rubbleHalf: ["rubble_half", D],
  shelves: ["shelves", D], bedFrame: ["bed_frame", D], swordShield: ["sword_shield", D], swordShieldBroken: ["sword_shield_broken", D],
  barrier: ["barrier", D], barrierColumn: ["barrier_column", D], trunk: ["trunk_large_A", D], trunk2: ["trunk_medium_B", D],
  candles: ["candle_triple", D], coins: ["coin_stack_large", D],
  bannerRed: ["banner_red", D], bannerPattern: ["banner_patternA_red", D], bannerShield: ["banner_shield_red", D],
  bannerTriple: ["banner_triple_red", D], bannerThin: ["banner_thin_red", D], bannerBlack: ["banner_patternB_brown", D],
  // ---- buildings (Hexagon, scaled to life size)
  castle: ["building_castle_red", HX], church: ["building_church_red", HX], tower: ["building_tower_A_red", HX], towerB: ["building_tower_B_red", HX],
  towerBase: ["building_tower_base_red", HX], towerCatapult: ["building_tower_catapult_red", HX], homeA: ["building_home_A_red", HX],
  homeB: ["building_home_B_red", HX], homeA2: ["building_home_A_yellow", HX], homeB2: ["building_home_B_blue", HX], tavern: ["building_tavern_red", HX],
  blacksmith: ["building_blacksmith_red", HX], barracks: ["building_barracks_red", HX], market: ["building_market_red", HX],
  well: ["building_well_red", HX], watermill: ["building_watermill_red", HX], ruin: ["building_destroyed", HX], scaffolding: ["building_scaffolding", HX],
  grain: ["building_grain", HX], bridge: ["building_bridge_A", HX], tent: ["tent", HX],
  curtainWall: ["wall_straight", HX], curtainGate: ["wall_straight_gate", HX], curtainCorner: ["wall_corner_A_outside", HX],
  fenceStone: ["fence_stone_straight", HX], fenceWood: ["fence_wood_straight", HX],
  // ---- nature and yard clutter (Hexagon)
  tree: ["tree_single_A", HX], tree2: ["tree_single_B", HX], treesLarge: ["trees_A_large", HX], treesMedium: ["trees_B_medium", HX],
  stump: ["tree_single_A_cut", HX], rock: ["rock_single_A", HX], rock2: ["rock_single_C", HX], rock3: ["rock_single_E", HX],
  mountain: ["mountain_A_grass_trees", HX * 2.2], mountain2: ["mountain_B_grass", HX * 2.2], hills: ["hills_A_trees", HX * 1.6],
  weaponRack: ["weaponrack", HX], wheelbarrow: ["wheelbarrow", HX], target: ["target", HX], sack: ["sack", HX], hay: ["resource_lumber", HX],
  stonePile: ["resource_stone", HX], crate: ["crate_A_big", HX], crateLong: ["crate_long_A", HX], bucket: ["bucket_water", HX], cartBarrel: ["barrel", HX],
  // ---- graveyard (Halloween Bits)
  crypt: ["crypt", HB], grave: ["grave_A", HB], graveBroken: ["grave_A_destroyed", HB], grave2: ["grave_B", HB], gravestone: ["gravestone", HB],
  gravemarker: ["gravemarker_A", HB], gravemarker2: ["gravemarker_B", HB], coffin: ["coffin", HB], coffinDecorated: ["coffin_decorated", HB],
  fenceIron: ["fence", HB], fenceIronBroken: ["fence_broken", HB], fenceIronGate: ["fence_gate", HB], fencePillar: ["fence_pillar", HB],
  arch: ["arch", HB], archGate: ["arch_gate", HB], shrine: ["shrine_candles", HB], plaque: ["plaque_candles", HB],
  treeDead: ["tree_dead_large", HB], treeDeadDecorated: ["tree_dead_large_decorated", HB], treeDeadMedium: ["tree_dead_medium", HB],
  pine: ["tree_pine_orange_large", HB], pine2: ["tree_pine_yellow_medium", HB],
  lanternPost: ["post_lantern", HB], lanternStanding: ["lantern_standing", HB], postSkull: ["post_skull", HB],
  ribcage: ["ribcage", HB], skull: ["skull", HB], bones: ["bone_A", HB], bonesB: ["bone_C", HB], benchStone: ["bench", HB],
  pumpkin: ["pumpkin_orange_jackolantern", HB], graveDirt: ["floor_dirt_grave", HB], pillarStone: ["pillar", HB],
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const out = await io.read(find("wall"));       // seed document (then emptied of its scene content)
const outRoot = out.getRoot();
const outScene = outRoot.listScenes()[0];
for (const n of outScene.listChildren()) outScene.removeChild(n);
outRoot.listNodes().forEach((n) => n.dispose());
outRoot.listAnimations().forEach((a) => a.dispose());

for (const [id, [name, scale]] of Object.entries(MANIFEST)) {
  const doc = await io.read(find(name));
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  const map = mergeDocuments(out, doc);
  const scenes = doc.getRoot().listScenes().map((s) => map.get(s));
  // The game's kit loader places each id's children and ignores the id node's own transform, so
  // the scale is baked into the children (uniform: scale their translation and scale).
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
  // Centre every model's footprint on its origin (the hexagon pack's fences sit on a tile edge).
  const bb = getBounds(holder);
  const cx = (bb.min[0] + bb.max[0]) / 2, cz = (bb.min[2] + bb.max[2]) / 2;
  if (Math.abs(cx) > 0.05 || Math.abs(cz) > 0.05) {
    for (const child of holder.listChildren()) { const t = child.getTranslation(); child.setTranslation([t[0] - cx, t[1], t[2] - cz]); }
  }
  outScene.addChild(holder);
}

// Shared atlases: one copy each; small WebP; no metal, soft roughness (stylised).
await out.transform(dedup(), prune(), unpartition());
for (const t of outRoot.listTextures()) {
  const img = await sharp(Buffer.from(t.getImage())).resize(512, 512, { fit: "inside" }).webp({ quality: 92 }).toBuffer();
  t.setImage(img).setMimeType("image/webp").setURI("");
}
for (const m of outRoot.listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.85);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
await io.write(outFile, out);
const tris = outRoot.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(2)} MB): ${Object.keys(MANIFEST).length} models, ${tris} triangles, ` +
  `${outRoot.listMaterials().length} materials, ${outRoot.listTextures().length} textures`);
