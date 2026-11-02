// Builds the pirate chapter's environment kit: public/models/pirate/pirate-kit.glb
//
// Sources (all CC0):
// - Kenney "Pirate Kit" 2.0 (www.kenney.nl; fetched into assets-src/pirate/ by the pirate-assets
//   workflow): ships, the wreck and the ghost ship, docks, cannons, chests, palms, rocks, towers.
// - KayKit packs by Kay Lousberg (github.com/KayKit-Game-Assets; cloned into assets-src/medieval/):
//   Dungeon Remastered (cave walls, torches, gold), Halloween Bits (bones, lanterns, dead trees),
//   Medieval Hexagon (bare mountains for the cliffs and the grotto, rocks, curtain walls).
// Every model becomes one top-level node named by its kit id, scale baked in (1 = life size).
// Derived models: the ships without sails or flags (the decks the hero walks on: sails would hide
// him from the camera), and the wreck's hull cut open (the flooded hold, seen from above).
//
// Not part of the normal build. To regenerate:
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp
//   node scripts/build-pirate-kit.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, prune, unpartition } from "@gltf-transform/functions";
import sharp from "sharp";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const KENNEY = path.join(ROOT, "assets-src/pirate/pirate-kit/Models/GLB format");
const KAYKIT = path.join(ROOT, "assets-src/medieval");
const outFile = path.join(ROOT, "public/models/pirate/pirate-kit.glb");

const kayFiles = execSync(`find -L "${KAYKIT}" -name "*.gltf" -o -name "*.glb"`, { encoding: "utf8" }).split("\n").filter((f) => f && !/\/Characters\/|\/Samples\//.test(f));
const find = (name) => {
  if (name.startsWith("d:")) {
    const f = path.join(ROOT, "assets-src/pirate/decor", `${name.slice(2)}.glb`);
    if (!fs.existsSync(f)) throw new Error(`no decor ${name} (run scripts/build-pirate-decor.mjs)`);
    return f;
  }
  if (name.startsWith("k:")) {
    const f = path.join(KENNEY, `${name.slice(2)}.glb`);
    if (!fs.existsSync(f)) throw new Error(`no model ${name}`);
    return f;
  }
  const hit = kayFiles.find((f) => path.basename(f).replace(/\.gltf\.glb$|\.gltf$|\.glb$/, "") === name);
  if (!hit) throw new Error(`no model ${name}`);
  return hit;
};

const P = 0.78;   // Kenney props: a barrel ~1 m tall, a chest ~0.9 m
const HX = 6.5;   // KayKit hexagon pack: hex-tile miniatures -> real size

/**
 * Kit id -> [source, scale, options]. options.drop: child node names to remove (sails, flags);
 * options.open: cut the hull open (see openHull).
 */
const MANIFEST = {
  // ---- ships (scaled where placed: decks are built at several sizes)
  shipLarge: ["k:ship-pirate-large", 1], shipMedium: ["k:ship-pirate-medium", 1], shipSmall: ["k:ship-pirate-small", 1],
  shipMerchant: ["k:ship-large", 1], shipMerchantSmall: ["k:ship-medium", 1],
  shipGhost: ["k:ship-ghost", 1], shipWreck: ["k:ship-wreck", 1],
  // The decks the hero fights on (the medium hull: one flat deck from the quarterdeck to the bow).
  deckGhost: ["k:ship-ghost", 1, { drop: /^(sail|flag)/, cut: "bowTip" }],
  deckWreckBow: ["k:ship-wreck", 1, { drop: /^(sail|grass|Group)/, cut: "brokenBow" }],
  hullOpen: ["k:ship-wreck", 1, { drop: /^(sail|grass|Group)/, cut: "hold" }],
  rowboat: ["k:boat-row-large", 0.9], rowboatSmall: ["k:boat-row-small", 0.9],
  // ---- deck and harbour props
  cannon: ["k:cannon", 0.95], cannonMobile: ["k:cannon-mobile", 0.95], cannonBall: ["k:cannon-ball", 0.5],
  barrel: ["k:barrel", P], chest: ["k:chest", P], crate: ["k:crate", P], crateBottles: ["k:crate-bottles", P],
  bottle: ["k:bottle", P], bottleLarge: ["k:bottle-large", P],
  flagPirate: ["k:flag-pirate", 1.2], flagPirateHigh: ["k:flag-pirate-high", 1.2], flagPiratePennant: ["k:flag-pirate-high-pennant", 1.2],
  flag: ["k:flag-high", 1.2], paddle: ["k:tool-paddle", 0.8], shovel: ["k:tool-shovel", 0.8], hole: ["k:hole", 1],
  // Docks: 2.5 m tiles at x2 = 5 m; the walkable top of a platform is 0.93 * 2 m up.
  dock: ["k:structure-platform", 2], dockSmall: ["k:structure-platform-small", 2], dockPosts: ["k:structure-platform-dock", 2],
  dockPostsSmall: ["k:structure-platform-dock-small", 2], planks: ["k:platform-planks", 1.4], raft: ["k:platform", 1.4],
  shack: ["k:structure", 1.6], shackFence: ["k:structure-fence", 1.6], shackFenceSides: ["k:structure-fence-sides", 1.6], shackRoof: ["k:structure-roof", 1.6],
  // ---- fort towers (Kenney; 3 m wide modules at x1.8)
  towerLarge: ["k:tower-complete-large", 1.8], towerSmall: ["k:tower-complete-small", 1.8], towerBase: ["k:tower-base", 1.8],
  towerBaseDoor: ["k:tower-base-door", 1.8], towerMiddle: ["k:tower-middle", 1.8], towerWindows: ["k:tower-middle-windows", 1.8],
  towerTop: ["k:tower-top", 1.8], towerWatch: ["k:tower-watch", 1.8], towerRoof: ["k:tower-roof", 1.8],
  // ---- beach and nature
  palm: ["k:palm-straight", 1.5], palmBend: ["k:palm-bend", 1.5], palmDetailed: ["k:palm-detailed-straight", 1.5], palmDetailedBend: ["k:palm-detailed-bend", 1.5],
  rocksA: ["k:rocks-a", 1.2], rocksB: ["k:rocks-b", 1.2], rocksC: ["k:rocks-c", 1.2],
  rocksSandA: ["k:rocks-sand-a", 1.2], rocksSandB: ["k:rocks-sand-b", 1.2], rocksSandC: ["k:rocks-sand-c", 1.2],
  sandPatch: ["k:patch-sand", 1], sandPatchFoliage: ["k:patch-sand-foliage", 1], grassPatch: ["k:patch-grass", 1], grassPatchFoliage: ["k:patch-grass-foliage", 1],
  grass: ["k:grass", 1], grassPlant: ["k:grass-plant", 1], grassTuft: ["k:grass-patch", 1],
  // ---- the grotto and the fort's stonework (KayKit Dungeon, 4 m modules)
  wall: ["wall", 1], wallBroken: ["wall_broken", 1], wallHalf: ["wall_half", 1], wallArched: ["wall_arched", 1], wallCracked: ["wall_cracked", 1],
  wallPillar: ["wall_pillar", 1], wallCorner: ["wall_corner", 1], wallGated: ["wall_gated", 1], pillar: ["pillar", 1], column: ["column", 1],
  torchLit: ["torch_lit", 1], torchMounted: ["torch_mounted", 1], coins: ["coin_stack_large", 1], coinsSmall: ["coin_stack_small", 1],
  chestGold: ["chest_gold", 1], chestPlain: ["chest", 1], kegs: ["barrel_small_stack", 1], boxLarge: ["box_large", 1], cratesStacked: ["crates_stacked", 1],
  rubble: ["rubble_large", 1], rubbleHalf: ["rubble_half", 1], candles: ["candle_triple", 1], swordShieldBroken: ["sword_shield_broken", 1],
  stairs: ["stairs", 1], floorTile: ["floor_tile_large", 1],
  // ---- bones and lights (KayKit Halloween Bits)
  skull: ["skull", 1], ribcage: ["ribcage", 1], bones: ["bone_A", 1], bonesB: ["bone_C", 1], lanternStanding: ["lantern_standing", 1],
  lanternPost: ["post_lantern", 1], postSkull: ["post_skull", 1], treeDead: ["tree_dead_large", 1], treeDeadMedium: ["tree_dead_medium", 1],
  coffin: ["coffin", 1], gravemarker: ["gravemarker_A", 1],
  // ---- cliffs, the grotto's walls, rocks, curtain walls (KayKit Hexagon)
  mountainA: ["mountain_A", HX * 2.2], mountainB: ["mountain_B", HX * 2.2], mountainC: ["mountain_C", HX * 2.2],
  mountainGrass: ["mountain_B_grass_trees", HX * 2.2], hills: ["hills_A_trees", HX * 1.6], hillsBare: ["hills_C", HX * 1.6],
  rock: ["rock_single_A", HX], rock2: ["rock_single_C", HX], rock3: ["rock_single_E", HX], rock4: ["rock_single_D", HX],
  curtainWall: ["wall_straight", HX], curtainGate: ["wall_straight_gate", HX], curtainCorner: ["wall_corner_A_outside", HX],
  ruin: ["building_destroyed", HX], waterplant: ["waterplant_B", HX], waterplant2: ["waterplant_C", HX],
  waterlily: ["waterlily_A", HX], waterlily2: ["waterlily_B", HX],
  // ---- colour: banners, flags, awnings, market clutter (KayKit Dungeon / Hexagon)
  bannerBlue: ["banner_patternA_blue", 1], bannerYellow: ["banner_patternB_yellow", 1], bannerRed: ["banner_patternC_red", 1],
  bannerWhite: ["banner_patternA_white", 1], bannerGreen: ["banner_triple_green", 1],
  flagRed: ["flag_red", HX], flagBlue: ["flag_blue", HX], flagYellow: ["flag_yellow", HX], flagGreen: ["flag_green", HX],
  lanternHanging: ["lantern_hanging", 1], sack: ["sack", HX], bucket: ["bucket_water", HX], tent: ["tent", HX],
  crateOpen: ["crate_open", HX], crateLong: ["crate_long_A", HX], bottlesGreen: ["bottle_A_labeled_green", 1], bottlesBrown: ["bottle_B_brown", 1],
  // ---- tropical decor modelled in code (scripts/build-pirate-decor.mjs)
  starfish: ["d:starfish", 1], starfishPurple: ["d:starfishPurple", 1], starfishRed: ["d:starfishRed", 1], conch: ["d:conch", 1], shells: ["d:shells", 1],
  coralPink: ["d:coralPink", 1], coralOrange: ["d:coralOrange", 1], seaFan: ["d:seaFan", 1], kelp: ["d:kelp", 1],
  bushRed: ["d:bushRed", 1], bushYellow: ["d:bushYellow", 1], bushPink: ["d:bushPink", 1], fern: ["d:fern", 1], buoy: ["d:buoy", 1], tiki: ["d:tiki", 1],
};

/**
 * Cuts triangles out of a ship (Kenney medium hull, model units: deck at y 2.1, hull floor at y 0.2,
 * bow towards +z, quarterdeck from z -1.9 sternwards; masts on the centre line):
 * - bowTip: the rails and bowsprit at the bow tip, so a gangway can come aboard over the bow;
 * - brokenBow: the bow half of a ship broken in two (everything sternwards of z -2.0 is gone);
 * - hold: the hull opened for the hold - the deck and all above it and the bow end (facing the
 *   camera) cut away, and a breach in the port side near the stern.
 */
// The bow's rails and stem rise well above the deck towards the camera (it looks from the south,
// over the bow): everything above the deck forward of model z 1.7 goes, the deck stays.
const bow = (cx, cy, cz, ymax) => (cz > 3.4 && cy > 2.0) || (cz > 1.7 && ymax > 2.25) ||
  // the masts and their collars (a pole through the middle of the arena hides the fight)
  (Math.abs(cx) < 0.8 && cz > -1.9 && cz < 1.7 && cy > 2.85) || (Math.abs(cx) < 0.8 && cz > 0.15 && cz < 1.25 && cy > 2.15) ||
  // the hatch, its coaming and its shaft (from the camera, a wall across the deck): planked over
  (Math.abs(cx) < 0.8 && cz > -1.5 && cz < 0.1 && cy > 0.9);
const CUTS = {
  bowTip: (cx, cy, cz, ymax) => bow(cx, cy, cz, ymax),
  brokenBow: (cx, cy, cz, ymax) => cz < -2.0 || bow(cx, cy, cz, ymax),
  hold: (cx, cy, cz, ymax) => (cy > 1.95 && Math.abs(cx) < 2.05) || ymax > 2.75 || cz > 1.7 || (cx < -1.0 && cz > -3.4 && cz < -2.4 && cy > 0.15) ||
    // the hatch's shaft hanging below the (cut) deck
    (Math.abs(cx) < 0.75 && cz > -1.5 && cz < 0.1 && cy > 1.0),
};

function cutShip(doc, holder, cut) {
  for (const node of holder.listChildren().flatMap((n) => [n, ...n.listChildren()])) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION"), idx = prim.getIndices();
      const keep = [];
      const v = (i) => pos.getElement(i, []);
      for (let t = 0; t < idx.getCount(); t += 3) {
        const a = v(idx.getScalar(t)), b = v(idx.getScalar(t + 1)), c = v(idx.getScalar(t + 2));
        const cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3, cx = (a[0] + b[0] + c[0]) / 3;
        const ymax = Math.max(a[1], b[1], c[1]);
        if (cut(cx, cy, cz, ymax)) continue;
        keep.push(idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2));
      }
      const acc = doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(keep)).setBuffer(idx.getBuffer());
      prim.setIndices(acc);
    }
  }
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const out = await io.read(find("wall"));
const outRoot = out.getRoot();
const outScene = outRoot.listScenes()[0];
for (const n of outScene.listChildren()) outScene.removeChild(n);
outRoot.listNodes().forEach((n) => n.dispose());
outRoot.listAnimations().forEach((a) => a.dispose());

for (const [id, [name, scale, options = {}]] of Object.entries(MANIFEST)) {
  const doc = await io.read(find(name));
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  if (options.drop) {
    for (const node of doc.getRoot().listNodes()) if (options.drop.test(node.getName()) && node.listParents().some((p) => p.propertyType === "Node")) node.dispose();
  }
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
  if (options.cut) cutShip(out, holder, CUTS[options.cut]);
  // Centre every model's footprint on its origin (flags and bent palms lean off it, and ships keep
  // the Kenney frame the level is laid out in: keep those).
  if (!/^flag|^palm.*Bend|^ship|^deck|^hull/.test(id)) {
    const bb = getBounds(holder);
    const cx = (bb.min[0] + bb.max[0]) / 2, cz = (bb.min[2] + bb.max[2]) / 2;
    if (Math.abs(cx) > 0.05 || Math.abs(cz) > 0.05) {
      for (const child of holder.listChildren()) { const t = child.getTranslation(); child.setTranslation([t[0] - cx, t[1], t[2] - cz]); }
    }
  }
  outScene.addChild(holder);
}

await out.transform(dedup(), prune(), unpartition());
for (const t of outRoot.listTextures()) {
  const img = await sharp(Buffer.from(t.getImage())).resize(512, 512, { fit: "inside" }).webp({ quality: 92 }).toBuffer();
  t.setImage(img).setMimeType("image/webp").setURI("");
}
for (const m of outRoot.listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.85).setDoubleSided(m.getName() === "colormap" ? true : m.getDoubleSided());
fs.mkdirSync(path.dirname(outFile), { recursive: true });
await io.write(outFile, out);
const tris = outRoot.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(2)} MB): ${Object.keys(MANIFEST).length} models, ${tris} triangles, ` +
  `${outRoot.listMaterials().length} materials, ${outRoot.listTextures().length} textures`);
