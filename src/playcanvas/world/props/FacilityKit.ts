import type { KitModelDef } from "./ModelKit";

const box = (shrink = 1, shadows = true): KitModelDef => ({ collider: { kind: "box", shrink }, shadows });
const circle = (radius: number, shadows = true): KitModelDef => ({ collider: { kind: "circle", radius }, shadows });
const floor: KitModelDef = { collider: { kind: "none" }, shadows: false };
const decor: KitModelDef = { collider: { kind: "none" }, shadows: true };
const clutter: KitModelDef = { collider: { kind: "none" }, shadows: false };

/**
 * Chapter 2 environment kit: the ORION station (public/models/facility/facility-kit.glb, built by
 * scripts/build-facility-kit.mjs from the Quaternius modular sci-fi pack, HallwayPACK halls, a few
 * Molten Maps SciFi machines and Kenney's Space Station / Space kits). Only what ShipLevel places is
 * in the kit. Ids match the node names in the GLB. Walls and machines block; floor tiles and
 * wall-mounted details do not.
 */
export const FACILITY_MODELS = {
  // Molten Maps SciFi: wall-mounted details (placed against a wall, which already blocks)
  displayRed: decor,
  wallPipe: decor,
  // Machines
  generator: box(0.85),
  genPile: circle(1.25),
  genPileSmall: circle(0.65),
  batteryOrange: box(0.9),
  batteryGrey: box(0.9),
  commandConsole: box(0.85),
  monitorBlue: box(0.8),
  monitorRed: box(0.8),
  // Labs and medbay
  cryoOff: circle(0.9),
  bioRed: box(0.8),
  // Crew
  bunk: box(0.92),
  cafeTable: box(0.9),
  octoTable: box(0.85),
  // Structure
  railing: box(1),
  // Kenney Space Station Kit (x2.4): interior props
  kBarrier: box(0.9),
  kContainerTall: box(0.9),
  kContainerWide: box(0.9),
  kChair: clutter,
  kTable: box(0.85),
  kTableDisplay: circle(0.5),
  // Kenney Space Kit (x4): hangar, launch bay and the meteor
  sCraftCargo: box(0.8),
  sCraftCargoB: box(0.8),
  sCraftMiner: box(0.8),
  sCraftSpeeder: box(0.75),
  sRocket: circle(2.6),
  sHangar: box(0.95),
  sDish: circle(1.2),
  sRover: box(0.85),
  sGenerator: box(0.85),
  sSupports: decor,
  sStructure: box(0.9),
  sPipeRing: decor,
  sMeteor: circle(1.5),
  sMeteorHalf: circle(1.4),
  sRock: circle(1.2),
  sRockLargeA: circle(1.6),
  sRockLargeB: circle(1.6),
  sRocksSmall: clutter,
  sCrystals: circle(1.2),
  sCrystalsLargeA: circle(1.4),
  sCrystalsLargeB: circle(1.4),
  sCrater: floor,
  sCraterLarge: floor,
  sCliff: clutter,
  // Quaternius modular sci-fi: the station's white architecture (walls 4 m on their line z = 0)
  qWall1: box(),
  qWall2: box(),
  qWall3: box(),
  qWall4: box(),
  qWall5: box(),
  qWallEmpty: box(),
  qWindowLong: box(),
  qWindowSmall: box(),
  qWindowThree: box(),
  qWindow: box(),
  qDoorWall: box(),
  qDoorWallSingle: box(),
  qWallLow: box(1, false),
  qWallLow2: box(1, false),
  qWallLow4: box(1, false),
  qColumn2: box(),
  qColumn3: box(),
  qColumnSlim: box(),
  qColumnLow: box(1, false),
  qFloorSide: floor,
  qCapsule: circle(0.42),
  qPod: circle(0.85),
  qComputer: box(0.85),
  qComputerSmall: box(0.85),
  qContainer: box(0.95),
  qCrate: box(0.95),
  qCrateLong: box(0.95),
  qLaser: box(0.85),
  qShelf: box(0.95),
  qShelfTall: box(0.95),
  qStatue: box(0.8),
  qTeleporter: circle(0.55),
  qTeleporter2: circle(0.55),
  qVessel: clutter,
  qVesselTall: clutter,
  qBase: floor,
  qPipes: decor,
  // HallwayPACK corridor halls (8 m along z, roofs cut; the level declares their walls' colliders)
  hHall: floor,
  hHallWindow: floor,
} satisfies Record<string, KitModelDef>;

export type FacilityModel = keyof typeof FACILITY_MODELS;
