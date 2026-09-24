import type { KitModelDef } from "./ModelKit";

const box = (shrink = 1, shadows = true): KitModelDef => ({ collider: { kind: "box", shrink }, shadows });
const circle = (radius: number, shadows = true): KitModelDef => ({ collider: { kind: "circle", radius }, shadows });
const floor: KitModelDef = { collider: { kind: "none" }, shadows: false };
const decor: KitModelDef = { collider: { kind: "none" }, shadows: true };
const clutter: KitModelDef = { collider: { kind: "none" }, shadows: false };

/**
 * Chapter 2 environment kit: the ORION research facility (public/models/facility/facility-kit.glb,
 * built by scripts/build-facility-kit.mjs from the Molten Maps SciFi pack). Ids match the node names
 * in the GLB. Walls and machines block; floor tiles and wall-mounted details do not.
 */
export const FACILITY_MODELS = {
  // Walls: 4 x 4 m modules, centred on their line
  wallGrey: box(),
  wallBlue: box(),
  wallRed: box(),
  wallOrange: box(),
  wallGreen: box(),
  wallGreeblies: box(),
  wallDoorGrey: box(),
  wallDoorRed: box(),
  wallDoorBlue: box(),
  wallDoorOrange: box(),
  wallGlass: box(),
  wallGlassBlue: box(),
  wallGlassGreen: box(),
  commandWall: box(),
  corridorFrame: box(),
  deckBlock: box(0.96),
  // Wall-mounted details (placed against a wall, which already blocks)
  displayBlue: decor,
  displayRed: decor,
  displayGreen: decor,
  displayOff: decor,
  wallLightWhite: clutter,
  wallLightRed: clutter,
  wallLightBlue: clutter,
  wallPipe: decor,
  airCon: decor,
  // Floor tiles (flattened; walk-over)
  floorMetal: floor,
  floorTile: floor,
  floorGrate: floor,
  floorCircles: floor,
  floorPath: floor,
  floorPathCorner: floor,
  hazard1: floor,
  hazard2: floor,
  floorMedbay: floor,
  floorHydro: floor,
  floorCommand: floor,
  floorCarpet: floor,
  // Machines
  generator: box(0.85),
  genPile: circle(1.25),
  genPileSmall: circle(0.65),
  batteryBlue: box(0.9),
  batteryOrange: box(0.9),
  batteryRed: box(0.9),
  batteryGrey: box(0.9),
  commandConsole: box(0.85),
  monitorBlue: box(0.8),
  monitorRed: box(0.8),
  monitorGreen: box(0.8),
  monitorOff: box(0.8),
  briefingBlue: box(0.8),
  briefingRed: box(0.8),
  orrery: circle(1.6),
  orreryTall: circle(1.8),
  // Labs and medbay
  cryoOn: circle(0.9),
  cryoOff: circle(0.9),
  casket: box(0.85),
  bioGreen: box(0.8),
  bioRed: box(0.8),
  // Hydroponics
  hydroFull: box(0.9),
  hydroEmpty: box(0.9),
  hydroLamp: decor,
  hydroBay: box(0.9),
  plant: clutter,
  // Crew
  bunk: box(0.92),
  bunkRed: box(0.92),
  bunkSingle: box(0.9),
  cafeTable: box(0.9),
  cafeTableRed: box(0.9),
  meetingTable: box(0.92),
  octoTable: box(0.85),
  chair: clutter,
  endTable: box(0.9, false),
  floorLamp: circle(0.3),
  tableLight: clutter,
  chess: clutter,
  // Structure
  catwalk: box(0.95),
  railing: box(1),
} satisfies Record<string, KitModelDef>;

export type FacilityModel = keyof typeof FACILITY_MODELS;
