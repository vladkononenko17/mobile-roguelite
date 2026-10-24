import type { KitModelDef } from "./ModelKit";

const box = (shrink = 1, shadows = true): KitModelDef => ({ collider: { kind: "box", shrink }, shadows });
const circle = (radius: number, shadows = true): KitModelDef => ({ collider: { kind: "circle", radius }, shadows });
const clutter: KitModelDef = { collider: { kind: "none" }, shadows: false };
const decor: KitModelDef = { collider: { kind: "none" }, shadows: true };

/**
 * The medieval chapter's environment kit (public/models/medieval/medieval-kit.glb, built by
 * scripts/build-medieval-kit.mjs from KayKit CC0 packs). Ids match the node names in the GLB.
 * Walls, buildings and big props block and cast shadows; small clutter is walk-over.
 */
export const MEDIEVAL_MODELS = {
  // Castle wall modules (4 x 4 m, 1 m deep, centred)
  wall: box(), wallArched: box(), wallBroken: box(), wallCracked: box(), wallDoorway: box(), wallGated: box(),
  wallWindow: box(), wallWindowClosed: box(), wallArchedWindow: box(), wallHalf: box(), wallPillar: box(),
  wallCorner: box(), wallScaffold: box(), wallEndcap: box(),
  pillarDungeon: circle(0.45), pillarDecorated: circle(0.5), columnShort: circle(0.3),
  stairs: decor, stairsWide: decor, floorTile: clutter, floorTileRocks: clutter, floorDirt: clutter, floorDirtRocky: clutter,
  // Castle props
  torchMounted: clutter, torchLit: circle(0.2, false), barrelLarge: circle(0.85), barrelSmall: circle(0.4), barrelStack: box(0.9),
  boxLarge: box(0.95), boxStacked: box(0.9), cratesStacked: box(0.9), chest: box(0.9), chestGold: box(0.9),
  tableLong: box(0.95), tableBroken: box(0.9), tableDecorated: box(0.95), tableClothed: box(0.95), chair: clutter, stool: clutter,
  keg: circle(0.5), kegDecorated: circle(0.5), rubble: box(0.7), rubbleHalf: clutter, shelves: box(0.9), bedFrame: box(0.9),
  swordShield: clutter, swordShieldBroken: clutter, barrier: box(0.95), barrierColumn: circle(0.35), trunk: clutter, trunk2: clutter,
  candles: clutter, coins: clutter,
  bannerRed: decor, bannerPattern: decor, bannerShield: decor, bannerTriple: decor, bannerThin: decor, bannerBlack: decor,
  // Buildings (life size)
  castle: box(0.9), church: box(0.9), tower: box(0.85), towerB: box(0.85), towerBase: box(0.85), towerCatapult: box(0.85),
  homeA: box(0.85), homeB: box(0.85), homeA2: box(0.85), homeB2: box(0.85), tavern: box(0.85), blacksmith: box(0.85),
  barracks: box(0.85), market: box(0.8), well: circle(1.6), watermill: box(0.85), ruin: box(0.8), scaffolding: box(0.8),
  grain: box(0.8), bridge: decor, tent: box(0.8),
  curtainWall: box(), curtainGate: box(), curtainCorner: box(0.9), fenceStone: box(), fenceWood: box(),
  // Nature and yard clutter
  tree: circle(0.5), tree2: circle(0.5), treesLarge: box(0.6), treesMedium: box(0.6), stump: circle(0.4),
  rock: box(0.8), rock2: box(0.8), rock3: box(0.8), mountain: decor, mountain2: decor, hills: decor,
  weaponRack: box(0.9), wheelbarrow: box(0.8), target: box(0.7), sack: clutter, hay: box(0.85), stonePile: box(0.8),
  crate: box(0.95), crateLong: box(0.95), bucket: clutter, cartBarrel: circle(0.5),
  // Graveyard
  crypt: box(0.95), grave: box(0.9), graveBroken: box(0.8), grave2: box(0.9), gravestone: box(0.85),
  gravemarker: clutter, gravemarker2: clutter, coffin: box(0.9), coffinDecorated: box(0.9),
  fenceIron: box(), fenceIronBroken: box(), fenceIronGate: box(), fencePillar: circle(0.35),
  arch: box(0.9), archGate: box(0.9), shrine: box(0.9), plaque: decor,
  treeDead: circle(0.45), treeDeadDecorated: circle(0.45), treeDeadMedium: circle(0.4), pine: circle(0.5), pine2: circle(0.45),
  lanternPost: circle(0.2), lanternStanding: clutter, postSkull: circle(0.2), ribcage: clutter, skull: clutter, bones: clutter,
  bonesB: clutter, benchStone: box(0.9), pumpkin: clutter, graveDirt: clutter, pillarStone: circle(0.5),
} satisfies Record<string, KitModelDef>;

export type MedievalModel = keyof typeof MEDIEVAL_MODELS;
