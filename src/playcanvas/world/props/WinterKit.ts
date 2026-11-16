import type { KitModelDef } from "./ModelKit";

const box = (shrink = 1, shadows = true): KitModelDef => ({ collider: { kind: "box", shrink }, shadows });
const circle = (radius: number, shadows = true): KitModelDef => ({ collider: { kind: "circle", radius }, shadows });
const clutter: KitModelDef = { collider: { kind: "none" }, shadows: false };
const decor: KitModelDef = { collider: { kind: "none" }, shadows: true };

/**
 * The winter chapter's environment kit (public/models/winter/winter-kit.glb, built by
 * scripts/build-winter-kit.mjs from Kenney CC0 packs, life size, snow caps baked in). Ids match the
 * node names in the GLB. Trees block by their trunks only; houses, cars and walls by their footprint.
 */
export const WINTER_MODELS = {
  // Forest
  pineSnowA: circle(0.55), pineSnowB: circle(0.6), pineSnowC: circle(0.5), pineBare: circle(0.5), pine: circle(0.5), pineTall: circle(0.5),
  deadTree: circle(0.4), log: box(0.85), logSmall: box(0.85), stump: circle(0.4),
  rockLarge: box(0.8), rockMedium: box(0.8), rockSmall: box(0.75), rockA: box(0.8), rockB: box(0.8), rockC: box(0.8), rockFlat: clutter,
  snowPile: clutter, snowBank: box(0.85), snowFlat: clutter, snowFlatLarge: clutter,
  // Camp
  tent: box(0.85), tentCanvas: box(0.85), tentHalf: box(0.85), campfire: clutter, campfireStand: clutter, bedroll: clutter,
  barrel: circle(0.45), barrelOpen: circle(0.45), box: box(0.9), boxLarge: box(0.9), boxOpen: box(0.9), chest: box(0.9), workbench: box(0.9),
  signpost: circle(0.15), signpostSingle: circle(0.15), planks: clutter, axe: clutter, shovel: clutter,
  fenceWood: box(), fenceFort: box(), fenceGate: box(),
  shed: box(0.95), shedRoof: decor, shack: box(0.95), shackRoof: decor, shackWall: box(), shelter: box(0.9),
  // Farm
  cabinWall: box(), cabinWindow: box(), cabinWindowB: box(), cabinWindowLarge: box(), cabinDoorway: decor, cabinDoor: box(), cabinCorner: circle(0.5),
  cabinWallLow: box(), cabinWallRoof: decor, cabinRoof: decor, cabinRoofPoint: decor, cabinRoofCorner: decor, cabinRoofChimney: decor, cabinFence: box(),
  floorWood: clutter, lantern: circle(0.2), lanternHanging: clutter, bench: box(0.9), sled: clutter, snowman: circle(0.6),
  tractor: box(0.9), tractorShovel: box(0.9),
  // Suburb
  houseA: box(0.92), houseB: box(0.92), houseC: box(0.92), houseD: box(0.92), houseE: box(0.92), houseF: box(0.92), houseG: box(0.92),
  houseH: box(0.92), houseJ: box(0.92), houseK: box(0.92), houseL: box(0.92), houseM: box(0.92), houseN: box(0.92), houseO: box(0.92),
  houseP: box(0.92), houseQ: box(0.92), houseR: box(0.92), houseS: box(0.92), houseT: box(0.92), houseU: box(0.92),
  fence1x4: box(), fence1x3: box(), fence2x3: box(), fenceLow: box(), fencePost: box(),
  gardenTree: circle(0.4), gardenTreeSmall: circle(0.35), planter: box(0.9),
  driveway: clutter, drivewayShort: clutter, path: clutter, pathStones: clutter,
  // Vehicles
  sedan: box(0.92), sedanSports: box(0.92), hatchback: box(0.92), suv: box(0.92), suvLuxury: box(0.92), van: box(0.92), truck: box(0.92),
  truckFlat: box(0.92), taxi: box(0.92), police: box(0.92), ambulance: box(0.92), firetruck: box(0.92), garbageTruck: box(0.92), delivery: box(0.92),
  sedanBurnt: box(0.92), suvBurnt: box(0.92), vanBurnt: box(0.92), policeBurnt: box(0.92), truckBurnt: box(0.92), busBurnt: box(0.92), taxiBurnt: box(0.92),
  debrisDoor: clutter, debrisBumper: clutter, debrisTire: clutter, debrisPlate: clutter, debrisAxle: clutter, wheel: clutter, cone: clutter,
  // Streets
  road: clutter, roadCross: clutter, roadT: clutter, roadEnd: clutter, roadBend: clutter, roadCrossing: clutter, roadSide: clutter, tilePavement: clutter,
  streetLight: circle(0.2), streetLightDouble: circle(0.2), streetLightCurved: circle(0.2),
  barrier: box(0.9), barrierLight: circle(0.3), roadCone: clutter, highwaySign: circle(0.3),
} satisfies Record<string, KitModelDef>;

export type WinterModel = keyof typeof WINTER_MODELS;
