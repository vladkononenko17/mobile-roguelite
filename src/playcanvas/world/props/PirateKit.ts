import type { KitModelDef } from "./ModelKit";

const box = (shrink = 1, shadows = true): KitModelDef => ({ collider: { kind: "box", shrink }, shadows });
const circle = (radius: number, shadows = true): KitModelDef => ({ collider: { kind: "circle", radius }, shadows });
const clutter: KitModelDef = { collider: { kind: "none" }, shadows: false };
const decor: KitModelDef = { collider: { kind: "none" }, shadows: true };

/**
 * The Black Tide's environment kit (public/models/pirate/pirate-kit.glb, built by
 * scripts/build-pirate-kit.mjs from Kenney's Pirate Kit and KayKit CC0 packs). Ids match the node
 * names in the GLB; 1 = life size except the ships, which keep the Kenney frame (4.8 x 10.6 units,
 * deck at y 2.1, bow towards +z) and are scaled where they are placed. Ships, decks and hulls have
 * no collider of their own: the level declares their rails and masts.
 */
export const PIRATE_MODELS = {
  // Ships (scenery) and the decks and hold the hero fights in.
  shipLarge: decor, shipMedium: decor, shipSmall: decor, shipMerchant: decor, shipMerchantSmall: decor,
  shipGhost: decor, shipWreck: decor, deckGhost: decor, deckWreckBow: decor, hullOpen: decor,
  rowboat: box(0.8), rowboatSmall: box(0.8),
  // Deck and harbour props.
  cannon: box(0.8), cannonMobile: box(0.8), cannonBall: clutter, barrel: circle(0.45), chest: box(0.85), crate: box(0.9), crateBottles: box(0.9),
  bottle: clutter, bottleLarge: clutter, flagPirate: circle(0.15, false), flagPirateHigh: circle(0.15), flagPiratePennant: circle(0.15), flag: circle(0.15),
  paddle: clutter, shovel: clutter, hole: clutter,
  dock: decor, dockSmall: decor, dockPosts: decor, dockPostsSmall: decor, planks: clutter, raft: clutter,
  shack: box(0.95), shackFence: box(0.95), shackFenceSides: box(0.95), shackRoof: box(0.8),
  // Fort towers.
  towerLarge: circle(3), towerSmall: circle(2.8), towerBase: circle(2.7), towerBaseDoor: circle(2.7), towerMiddle: decor, towerWindows: decor,
  towerTop: decor, towerWatch: decor, towerRoof: decor,
  // Beach and nature.
  palm: circle(0.4), palmBend: circle(0.4), palmDetailed: circle(0.4), palmDetailedBend: circle(0.4),
  rocksA: box(0.75), rocksB: box(0.75), rocksC: box(0.75), rocksSandA: box(0.75), rocksSandB: box(0.75), rocksSandC: box(0.75),
  sandPatch: clutter, sandPatchFoliage: clutter, grassPatch: clutter, grassPatchFoliage: clutter, grass: clutter, grassPlant: clutter, grassTuft: clutter,
  // The grotto's and the fort's stonework.
  wall: box(), wallBroken: box(), wallHalf: box(), wallArched: box(), wallCracked: box(), wallPillar: box(), wallCorner: box(), wallGated: box(),
  pillar: circle(0.5), column: circle(0.35), torchLit: circle(0.2, false), torchMounted: clutter, coins: box(0.8), coinsSmall: clutter,
  chestGold: box(0.9), chestPlain: box(0.9), kegs: box(0.9), boxLarge: box(0.95), cratesStacked: box(0.9),
  rubble: box(0.7), rubbleHalf: clutter, candles: clutter, swordShieldBroken: clutter, stairs: decor, floorTile: clutter,
  // Bones and lights.
  skull: clutter, ribcage: clutter, bones: clutter, bonesB: clutter, lanternStanding: clutter, lanternPost: circle(0.2), postSkull: circle(0.2),
  treeDead: circle(0.35), treeDeadMedium: circle(0.3), coffin: box(0.9), gravemarker: clutter,
  // Cliffs, rocks, curtain walls.
  mountainA: decor, mountainB: decor, mountainC: decor, mountainGrass: decor, hills: decor, hillsBare: decor,
  rock: clutter, rock2: box(0.7), rock3: box(0.7), rock4: box(0.7),
  curtainWall: box(), curtainGate: decor, curtainCorner: box(0.9), ruin: box(0.85), waterplant: clutter, waterplant2: clutter,
  waterlily: clutter, waterlily2: clutter,
  // Colour: banners, flags, awnings, market clutter.
  bannerBlue: decor, bannerYellow: decor, bannerRed: decor, bannerWhite: decor, bannerGreen: decor,
  flagRed: circle(0.15), flagBlue: circle(0.15), flagYellow: circle(0.15), flagGreen: circle(0.15),
  lanternHanging: clutter, sack: clutter, bucket: clutter, tent: box(0.8), crateOpen: box(0.85), crateLong: box(0.85), bottlesGreen: clutter, bottlesBrown: clutter,
  // Tropical decor (modelled in code).
  starfish: clutter, starfishPurple: clutter, starfishRed: clutter, conch: clutter, shells: clutter,
  coralPink: decor, coralOrange: decor, seaFan: decor, kelp: clutter,
  bushRed: circle(0.6), bushYellow: circle(0.6), bushPink: circle(0.6), fern: clutter, buoy: decor, tiki: circle(0.15),
} satisfies Record<string, KitModelDef>;

export type PirateModel = keyof typeof PIRATE_MODELS;
