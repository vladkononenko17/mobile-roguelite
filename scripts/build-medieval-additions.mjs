// Adds the reworked Dark Kingdom's pieces to the medieval kit (public/models/medieval/medieval-kit.glb)
// and resizes two of its old ones. Run after scripts/build-medieval-kit.mjs, or on its own over the
// committed kit (idempotent). Shared machinery: scripts/kit-additions.mjs.
//
// What it adds, all CC0 (sources in assets-src/medieval-additions/, see assets-src/SOURCES.md):
//   - Kenney "Castle Kit": siege engines, whole and wrecked (catapult, trebuchet, ram, ballista,
//     siege tower) for the bridge and the throne yard, long banners, rocks.
//   - Kenney "Fantasy Town Kit": market stalls, carts, a fountain, lanterns for the bailey and village.
//   - Quaternius "Fantasy Props MegaKit": training dummies, weapon stands, workbenches and an anvil,
//     feast tables and benches, bookcases, candle stands, a fallen chandelier, barrels, crates.
// Resized: the skull (it stood 0.9 m) and the rubble heaps (8 m brown blobs).
//
//   node scripts/build-medieval-additions.mjs   (needs sharp, meshoptimizer, @gltf-transform/*)
import path from "node:path";
import { addToKit } from "./kit-additions.mjs";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const KIT = path.join(ROOT, "public/models/medieval/medieval-kit.glb");
const SRC = path.join(ROOT, "assets-src/medieval-additions");
const Q = `${SRC}/quaternius-fantasy`, T = `${SRC}/kenney-town`, C = `${SRC}/kenney-castle`;

const GRADES = {
  // Kenney's bright toy orange and blue, weathered to sit with KayKit's stone and the dusk light.
  kenney: { saturation: 0.5, brightness: 0.74, dust: [78, 70, 62, 0.24] },
  // Quaternius wood and iron: a little darker.
  props: { saturation: 0.68, brightness: 0.8 },
};
const K = { "*": "kenney" }, P = { "*": "props" };
const c = (file, size) => [`${C}/${file}.glb`, size, K];
const t = (file, size) => [`${T}/${file}.glb`, size, K];
const q = (file, size) => [`${Q}/${file}.gltf`, size, P];

const MODELS = {
  // Siege engines (the bridge, the throne yard).
  cCatapult: c("siege-catapult", { len: 5 }),
  cCatapultWreck: c("siege-catapult-demolished", { len: 5 }),
  cTrebuchet: c("siege-trebuchet", { h: 7 }),
  cTrebuchetWreck: c("siege-trebuchet-demolished", { len: 7 }),
  cRam: c("siege-ram", { len: 5 }),
  cRamWreck: c("siege-ram-demolished", { len: 5 }),
  cBallista: c("siege-ballista", { len: 3.4 }),
  cBallistaWreck: c("siege-ballista-demolished", { len: 3.4 }),
  cTowerWreck: c("siege-tower-demolished", { h: 6 }),
  cBanner: c("flag-banner-long", { h: 4.2 }),
  cRocks: c("rocks-large", { len: 3 }),
  // The market (bailey, village).
  tStallRed: t("stall-red", { len: 3.4 }),
  tStallGreen: t("stall-green", { len: 3.4 }),
  tStall: t("stall", { len: 3.4 }),
  tStallBench: t("stall-bench", { len: 1.8 }),
  tCart: t("cart", { len: 3 }),
  tCartHigh: t("cart-high", { len: 3.2 }),
  tFountain: t("fountain-round", { len: 5.5 }),
  tLantern: t("lantern", { h: 2.6 }),
  // Yard, smithy, hall and abbey furniture.
  fDummy: q("Dummy", { h: 1.85 }),
  fWeaponStand: q("WeaponStand", { h: 1.7 }),
  fWorkbench: q("Workbench", { len: 2.2 }),
  fAnvil: q("Anvil_Log", { h: 0.9 }),
  fTable: q("Table_Large", { len: 2.8 }),
  fBench: q("Bench", { len: 2.2 }),
  fBookcase: q("Bookcase_2", { h: 2.3 }),
  fBookStand: q("BookStand", { h: 1.3 }),
  fCandleStand: q("CandleStick_Stand", { h: 1.7 }),
  fChandelier: q("Chandelier", { len: 2.2 }),
  fBarrel: q("Barrel", { h: 1 }),
  fBarrelApples: q("Barrel_Apples", { h: 1 }),
  fCrate: q("Crate_Wooden", { h: 0.8 }),
  fCauldron: q("Cauldron", { h: 0.9 }),
  fStallCart: q("Stall_Cart_Empty", { len: 3.2 }),
  fPegRack: q("Peg_Rack", { h: 1.6 }),
  fVaseRubble: q("Vase_Rubble_Medium", { len: 0.9 }),
  fChest: q("Chest_Wood", { h: 0.7 }),
  fBooks: q("BookGroup_Medium_1", { len: 0.6 }),
};

/** The Quaternius props are dense for objects ~1 m across seen from 15 m up. */
const RATIO = { fCandleStand: 0.2, fChandelier: 0.25, fAnvil: 0.25, fStallCart: 0.35, fDummy: 0.35, fWeaponStand: 0.35, fChest: 0.35, fCauldron: 0.35, fBarrelApples: 0.3, fBookcase: 0.45, fBookStand: 0.35, fCrate: 0.35, fWorkbench: 0.5, fVaseRubble: 0.5, fBarrel: 0.5 };
const SLOPPY = { fCandleStand: 0.3, fChandelier: 0.35, fAnvil: 0.35, fBarrelApples: 0.4, fStallCart: 0.5, fWeaponStand: 0.5 };

await addToKit({ kit: KIT, models: MODELS, grades: GRADES, ratio: RATIO, sloppy: SLOPPY, rescale: { skull: 0.32, rubble: 0.45, rubbleHalf: 0.55, ribcage: 0.6 } });
