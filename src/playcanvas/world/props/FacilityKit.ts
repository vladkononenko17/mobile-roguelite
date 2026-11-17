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
  // Kenney Space Kit (x4): the dish, generator, pipe ring and the hive's crystals
  sDish: circle(1.2),
  sGenerator: box(0.85),
  sPipeRing: decor,
  sCrystals: circle(1.2),
  sCrystalsLargeA: circle(1.4),
  sCrystalsLargeB: circle(1.4),
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
  // The reworked ORION (scripts/build-orion-additions.mjs: KayKit Space Base and Kenney Space
  // Station kit, CC0, textured). Hangar craft and cargo, the asteroid's survey camp and stone.
  yDropship: box(0.75),
  yDropshipPacked: box(0.8),
  yLanderA: circle(2.6),
  yLanderB: circle(2.6),
  yPadL: floor,
  yPadS: floor,
  yDepotA: box(0.85),
  yDepotB: box(0.85),
  yDepotC: box(0.85),
  yCargoA: box(0.9),
  yCargoB: box(0.9),
  yCargoPacked: box(0.9),
  yTruck: box(0.85),
  yTruckL: box(0.85),
  yTrailer: box(0.85),
  yStructTall: decor,
  yStructLow: decor,
  yLights: circle(0.3),
  yWater: box(0.85),
  yBaseA: box(0.85),
  yBaseB: box(0.85),
  yBaseC: box(0.85),
  yBaseE: box(0.85),
  yGarage: box(0.85),
  yTunnel: box(0.9),
  yDrill: circle(3.2),
  ySolar: box(0.8),
  yMobile: box(0.85),
  yEco: box(0.85),
  yRock: circle(1),
  yRocksA: circle(2.2),
  yRocksB: circle(2.6),
  yCliff: decor,
  yCliffCurve: decor,
  // The crew's furniture.
  zCompWide: box(0.85),
  zCompSystem: box(0.85),
  zCompScreen: box(0.85),
  zComputer: box(0.85),
  zTablePlanet: circle(0.9),
  zTableDisplay: box(0.9),
  zTableLarge: box(0.9),
  zTable: box(0.9),
  zTableInset: box(0.9),
  zChair: clutter,
  zChairArm: clutter,
  zBed: box(0.9),
  zBedDouble: box(0.9),
  zContTall: box(0.9),
  zContWide: box(0.9),
  zContainer: box(0.9),
  zContFlat: box(0.9),
  zDisplayWide: decor,
  zStructure: decor,
  zBarrierHigh: box(0.9),
  zSkipRocks: box(0.9),
  // Quarantine, reactor and gate (Kenney station kit and KayKit containers)
  zSkip: box(0.85),
  zRail: box(0.9),
  zDisplay: decor,
  zBedCover: clutter,
  zContFlatShut: box(0.9),
  zTableSmall: box(0.85),
  yContA: box(0.9),
  yContB: box(0.9),
  yContC: box(0.9),
} satisfies Record<string, KitModelDef>;

export type FacilityModel = keyof typeof FACILITY_MODELS;
