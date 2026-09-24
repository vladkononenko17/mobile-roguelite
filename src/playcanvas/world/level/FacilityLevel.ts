import { Entity } from "playcanvas";
import { FACILITY, FACILITY_LIGHTING } from "../../config";
import type { AmbientEmitter } from "../AmbientFx";
import { declareCollider } from "../collision/CollisionWorld";
import type { GroundSpec } from "../Ground";
import type { ModelKit, SpawnOptions } from "../props/ModelKit";
import { FACILITY_MODELS, type FacilityModel } from "../props/FacilityKit";
import type { Biome, LevelBounds } from "./Biome";

/**
 * CHAPTER 2 - "ORION research facility", deck B: where the outbreak started. 48 x 80 m, built from
 * the Molten Maps SciFi kit on a 4 m grid (see world/props/FacilityKit.ts), graded dark and cold
 * with self-lit screens, coloured light pools and red alarm beacons.
 *
 * The camera looks towards -Z: screen up is north, screen right is +X. Walls are cut down to
 * 2.4 m (cutaway style) so nothing hides the hero or the horde; only the north wall is full height.
 *
 *   z -40  +--------------- command wall, big screens ----------------+  NORTH
 *          |          COMMAND DECK (boss arena, open centre)           |
 *   z -24  +--- wall --[door]--+      open       +--[door]-- wall -----+
 *          | CRYO LAB          |    CORRIDOR     | GENERATOR ROOM      |
 *          | cryo tubes, the   |   (to command)  | reactor on hazard   |
 *          | broken tube       |                 | floor, power cells  |
 *   z  -8  +-[ ]-- wall --[ ]--+     open        +--[ ]-- wall --[ ]---+
 *          | HYDRO-   |         ATRIUM           |   CREW QUARTERS     |
 *          | PONICS   |  orrery on the command   |   bunks, mess hall  |
 *          | (glass)  |  floor; runs start here  |                     |
 *   z  16  +-[ ]-wall-+          open            +--wall--[ ]--wall----+
 *          |                CARGO BAY (open combat)                    |
 *          |   power-cell stacks, cargo blocks, loading lanes         |
 *   z  40  +-------------------- low bulkhead ---- spawn --------------+  SOUTH
 */

export const BOUNDS: LevelBounds = { minX: -23.4, maxX: 23.4, minZ: -39.4, maxZ: 39.4 };

/** The hero arrives in the cargo bay, facing north. */
export const SPAWN = { x: 0, z: 34, yawDeg: 180 };

/** Every wave starts in the atrium, south of the orrery, with open floor all round. */
export const RUN_START = { x: 0, z: 10, yawDeg: 180 };

/** Cool steel-blue ambience; light pools under screens and lamps; alarms pulse red. */
const CYAN: [number, number, number] = [0.25, 0.75, 1];
const WHITE: [number, number, number] = [0.55, 0.7, 0.85];
const RED: [number, number, number] = [1, 0.12, 0.08];
const ORANGE: [number, number, number] = [1, 0.5, 0.15];
const GREEN: [number, number, number] = [0.35, 1, 0.35];
const STEAM: [number, number, number] = [1.05, 1.15, 1.3];

export const AMBIENT: AmbientEmitter[] = [
  // Command deck: screen glow along the north wall, alarms in the corners.
  { kind: "glow", x: 0, z: -37.5, size: [12, 6], color: CYAN, intensity: 0.5 },
  { kind: "glow", x: -12, z: -38, size: [6, 4], color: CYAN, intensity: 0.4 },
  { kind: "glow", x: 12, z: -38, size: [6, 4], color: RED, intensity: 0.4 },
  { kind: "glow", x: -21, z: -26.5, size: [7, 7], color: RED, intensity: 0.55, pulse: 0.7 },
  { kind: "glow", x: 21, z: -26.5, size: [7, 7], color: RED, intensity: 0.55, pulse: 0.7 },
  // Cryo lab: tubes glow cyan; the broken one sparks; alarm.
  { kind: "glow", x: -16, z: -20.5, size: [14, 5], color: CYAN, intensity: 0.45 },
  { kind: "glow", x: -12, z: -13, size: [8, 8], color: RED, intensity: 0.6, pulse: 0.9 },
  { kind: "sparks", x: -10.5, y: 2.2, z: -21.2, every: 3 },
  // Generator room: hot orange reactor light, sparks, steam from the vents.
  { kind: "glow", x: 16, z: -16, size: [12, 12], color: ORANGE, intensity: 0.55 },
  { kind: "sparks", x: 16, y: 2.6, z: -16, every: 5 },
  { kind: "sparks", x: 21.5, y: 2, z: -10.5, every: 7 },
  { kind: "smoke", x: 22.6, y: 0.6, z: -20, size: [0.6, 0.6], intensity: 0.8, color: STEAM },
  // Hydroponics: grow lamps.
  { kind: "glow", x: -18, z: -1, size: [10, 9], color: GREEN, intensity: 0.35 },
  { kind: "glow", x: -18, z: 10, size: [10, 9], color: GREEN, intensity: 0.35 },
  // Atrium: the orrery's pool of light and drifting dust.
  { kind: "glow", x: 0, z: 2, size: [11, 11], color: CYAN, intensity: 0.3 },
  { kind: "dust", x: 0, y: 1.2, z: 4, size: [14, 14], intensity: 0.8, color: [0.8, 0.95, 1.3] },
  // Crew quarters: warm lamps.
  { kind: "glow", x: 17, z: 8, size: [9, 9], color: ORANGE, intensity: 0.3 },
  { kind: "glow", x: 20, z: -3, size: [6, 8], color: WHITE, intensity: 0.3 },
  // Cargo bay: work lights, a leaking pipe, dust over the open floor.
  { kind: "glow", x: -12, z: 26, size: [10, 10], color: WHITE, intensity: 0.35 },
  { kind: "glow", x: 12, z: 30, size: [10, 10], color: WHITE, intensity: 0.35 },
  { kind: "glow", x: 0, z: 18.5, size: [16, 4], color: RED, intensity: 0.35, pulse: 0.5 },
  { kind: "smoke", x: -22.6, y: 0.6, z: 30, size: [0.6, 0.6], intensity: 0.7, color: STEAM },
  { kind: "glow", x: 6.3, z: 27.4, size: [5, 5], color: CYAN, intensity: 0.35 },
  { kind: "sparks", x: 7.6, y: 1.6, z: 26.2, every: 4 },
  { kind: "dust", x: 0, y: 1.2, z: 28, size: [16, 14], intensity: 0.7, color: [0.8, 0.95, 1.3] },
];

export const GROUND_SPEC: GroundSpec = {
  base: "deck",
  pads: [],
  // Grime where the fighting was: trodden paths, oil under the machines, the lab's spill.
  patches: [
    { x: 0, z: 22, w: 12, d: 8, surface: "grime", seed: 0 },
    { x: -14, z: 32, w: 9, d: 7, surface: "grime", seed: 1 },
    { x: 15, z: 22, w: 8, d: 6, surface: "grime", seed: 2 },
    { x: 0, z: -14, w: 8, d: 9, surface: "grime", seed: 3 },
    { x: 7, z: -4, w: 7, d: 5, surface: "grime", seed: 1 },
    { x: -6, z: 12, w: 6, d: 5, surface: "grime", seed: 2 },
    { x: 0, z: -30, w: 10, d: 6, surface: "grime", seed: 0 },
  ],
};

type Placement = [FacilityModel, number, number, number?, SpawnOptions?];

/** Interior walls are cut down (cutaway style); the north wall stands full height. */
const WALL_HEIGHT = 0.6;
const CELL = 4;
/** Power cells are toy-sized in the kit; scaled up they read as waist-high cover. */
const CELL_SCALE: SpawnOptions = { scale: 1.5 };

interface WallRunOptions {
  /** Models cycled along the run; "" leaves a gap (a doorway). */
  pattern: (FacilityModel | "")[];
  /** Vertical scale (default WALL_HEIGHT). */
  height?: number;
  /** Turn the modules to face the other side of the line. */
  flip?: boolean;
}

/** Places every piece of the facility. Every placed model declares its collider. */
export function buildFacilityLevel(kit: ModelKit<FacilityModel>): Entity {
  const root = new Entity("FacilityLevel");

  const place = (id: FacilityModel, x: number, z: number, yaw = 0, options: SpawnOptions = {}) => kit.spawn(id, x, z, yaw, root, options);
  const placeAll = (list: Placement[]) => { for (const [id, x, z, yaw, options] of list) place(id, x, z, yaw ?? 0, options); };

  /** 4 m wall modules along a->b (axis-aligned lines on the grid). */
  const wallRun = (ax: number, az: number, bx: number, bz: number, o: WallRunOptions) => {
    const length = Math.hypot(bx - ax, bz - az);
    const count = Math.max(1, Math.round(length / CELL));
    const width = length / count;
    const dx = (bx - ax) / length, dz = (bz - az) / length;
    const yaw = (Math.atan2(-dz, dx) * 180) / Math.PI + (o.flip ? 180 : 0);
    for (let i = 0; i < count; i++) {
      const id = o.pattern[i % o.pattern.length];
      if (!id) continue;
      place(id, ax + dx * width * (i + 0.5), az + dz * width * (i + 0.5), yaw, { scale: [width / CELL, o.height ?? WALL_HEIGHT, 1] });
    }
  };

  /** Fills the rectangle (grid-aligned) with 4 m floor tiles, cycling `ids`. */
  const tiles = (ids: FacilityModel[], x0: number, z0: number, x1: number, z1: number, yaw = 0) => {
    let n = 0;
    for (let x = x0 + CELL / 2; x < x1; x += CELL) {
      for (let z = z0 + CELL / 2; z < z1; z += CELL) place(ids[n++ % ids.length], x, z, yaw);
    }
  };

  // ------------------------------------------------------------------ floors
  // Command deck: metal tiles round the command floor, paths to the doors.
  tiles(["floorTile"], -24, -40, -4, -24);
  tiles(["floorTile"], 4, -40, 24, -24);
  tiles(["floorTile"], -4, -40, 4, -36);
  place("floorCommand", 0, -30);
  // Cryo lab, generator room, corridor.
  tiles(["floorMedbay"], -24, -24, -8, -8);
  tiles(["hazard1"], 12, -20, 20, -12);
  tiles(["floorGrate"], 8, -24, 24, -20);
  tiles(["floorGrate"], 8, -12, 24, -8);
  tiles(["floorGrate"], 8, -20, 12, -12);
  tiles(["floorGrate"], 20, -20, 24, -12);
  tiles(["floorPath"], -2, -24, 2, -8, 90);
  // Hydroponics, crew quarters, the atrium centre.
  tiles(["floorHydro"], -24, -8, -12, 16);
  tiles(["floorTile", "floorMetal"], 12, -8, 24, 16);
  place("floorCommand", 0, 2);
  // Cargo bay: loading lanes and a hazard line at the bulkhead.
  tiles(["hazard2"], -8, 16, 8, 20);
  tiles(["floorGrate"], -20, 24, -16, 36);
  tiles(["floorGrate"], 16, 24, 20, 36);

  // ------------------------------------------------------------------ outer walls
  // North: full height; the command wall's screens in the middle.
  wallRun(-24, -40, -4, -40, { pattern: ["wallGreeblies", "wallBlue", "wallGreeblies", "wallBlue", "wallGreeblies"], height: 1 });
  wallRun(4, -40, 24, -40, { pattern: ["wallGreeblies", "wallBlue", "wallGreeblies", "wallBlue", "wallGreeblies"], height: 1 });
  place("commandWall", 0, -40, 0);
  // West and east hull walls.
  wallRun(-24, 40, -24, -40, { pattern: ["wallGrey", "wallGrey", "wallDoorGrey", "wallGrey", "wallGreeblies"] });
  wallRun(24, 40, 24, -40, { pattern: ["wallGrey", "wallGreeblies", "wallGrey", "wallGrey", "wallDoorGrey"], flip: true });
  // South: a low bulkhead behind the spawn.
  wallRun(-24, 40, 24, 40, { pattern: ["wallGrey", "wallOrange", "wallGrey"], height: 0.35, flip: true });

  // ------------------------------------------------------------------ interior walls
  // z -24: command deck | lab, corridor, generator room.
  wallRun(-24, -24, -8, -24, { pattern: ["wallBlue", "", "wallDoorBlue", "wallBlue"] });
  wallRun(8, -24, 24, -24, { pattern: ["wallRed", "wallDoorRed", "", "wallRed"] });
  // x -8 / x 8: the corridor's sides (glass into the lab, steel into the reactor).
  wallRun(-8, -24, -8, -8, { pattern: ["wallGlassBlue", "wallGlassBlue", "", "wallGlassBlue"] });
  wallRun(8, -24, 8, -8, { pattern: ["wallRed", "wallRed", "", "wallDoorRed"], flip: true });
  // z -8: lab | hydroponics and atrium; generator | atrium and crew.
  wallRun(-24, -8, -8, -8, { pattern: ["wallBlue", "", "wallBlue", ""] });
  wallRun(8, -8, 24, -8, { pattern: ["", "wallRed", "", "wallRed"] });
  // x -12: hydroponics behind glass; x 12: crew quarters.
  wallRun(-12, -8, -12, 16, { pattern: ["wallGreen", "wallGlassGreen", "", "", "wallGlassGreen", "wallGreen"] });
  wallRun(12, -8, 12, 16, { pattern: ["wallOrange", "", "wallDoorOrange", "wallOrange", "", "wallOrange"], flip: true });
  // z 16: the middle band | cargo bay.
  wallRun(-24, 16, -8, 16, { pattern: ["wallGreen", "", "wallGreen", "wallGrey"] });
  wallRun(8, 16, 24, 16, { pattern: ["wallGrey", "wallOrange", "", "wallOrange"] });

  // ------------------------------------------------------------------ COMMAND DECK (boss arena)
  placeAll([
    ["commandConsole", 0, -36.2, 180],
    ["monitorBlue", -12, -39.2, 0], ["monitorBlue", -7.6, -39.2, 0], ["monitorRed", 12, -39.2, 0], ["monitorOff", 7.6, -39.2, 0],
    ["briefingBlue", -21, -38.9, 0], ["briefingRed", 21, -38.9, 0],
    ["wallLightRed", -23.5, -26, 90, { y: 2.4 }], ["wallLightRed", 23.5, -26, -90, { y: 2.4 }],
  ]);
  // Cover round the open centre: pedestal blocks and power cells.
  placeAll([
    ["genPileSmall", -13, -31], ["genPileSmall", 13, -31],
    ["batteryBlue", -17.5, -35.5, 20, CELL_SCALE], ["batteryGrey", -18.4, -34.6, -10, CELL_SCALE],
    ["batteryRed", 17.8, -35.2, -25, CELL_SCALE], ["genPileSmall", 20.5, -36.5],
    ["chair", -2.5, -33.6, 160], ["chair", 2.4, -33.4, 200],
  ]);

  // ------------------------------------------------------------------ CRYO LAB (x -24..-8, z -24..-8)
  placeAll([
    ["cryoOn", -21.5, -21.6], ["cryoOn", -18, -21.6], ["cryoOn", -14.5, -21.6], ["cryoOff", -10.5, -21.6],
    ["bioRed", -21.8, -17.2, 90], ["bioGreen", -21.8, -15.4, 90],
    ["casket", -19, -12.4, 90], ["casket", -15.2, -12.4, 90],
    ["displayRed", -18, -8.4, 180, { y: 0.2 }],
    ["wallLightRed", -12.5, -23.5, 0, { y: 2.3 }],
  ]);

  // ------------------------------------------------------------------ CORRIDOR (x -8..8, z -24..-8)
  placeAll([
    ["wallLightBlue", -7.6, -20, -90, { y: 2.2 }], ["wallLightBlue", 7.6, -20, 90, { y: 2.2 }],
    ["wallPipe", 7.5, -10.5, 90],
    ["batteryOrange", -5.8, -9.8, 15, CELL_SCALE],
  ]);

  // ------------------------------------------------------------------ GENERATOR ROOM (x 8..24, z -24..-8)
  placeAll([
    ["generator", 16, -16, 0],
    ["genPile", 21.4, -21.5], ["genPileSmall", 10.6, -21.6], ["genPile", 21.4, -10.8],
    ["batteryOrange", 11, -10.6, 10, CELL_SCALE], ["batteryOrange", 12.2, -10.2, -15, CELL_SCALE], ["batteryRed", 11.6, -11.6, 30, CELL_SCALE],
    ["railing", 16, -12.6, 0], ["railing", 16, -19.4, 0],
    ["wallPipe", 23.4, -20, -90], ["wallPipe", 23.4, -14, -90],
  ]);

  // ------------------------------------------------------------------ HYDROPONICS (x -24..-12, z -8..16)
  for (const z of [-5, -0.8, 7.6, 11.8]) {
    placeAll([["hydroFull", -21.6, z], ["hydroFull", -17.8, z], [z > 5 ? "hydroEmpty" : "hydroFull", -14.6, z]]);
  }
  placeAll([
    ["hydroLamp", -23.3, -3, 0], ["hydroLamp", -23.3, 9.7, 0],
    ["plant", -16.3, 3.2, 0], ["plant", -20.4, 4, 50], ["plant", -13.4, 14.2, 120],
    ["hydroBay", -19.8, 14.9, 0],
  ]);

  // ------------------------------------------------------------------ ATRIUM (x -12..12, z -8..16)
  placeAll([
    ["orrery", 0, 2],
    ["floorLamp", -9.5, -5.5, 45], ["floorLamp", 9.5, -5.5, -45], ["floorLamp", -9.5, 13.5, 135], ["floorLamp", 9.5, 13.5, -135],
    ["batteryGrey", -7.4, 9, 12, CELL_SCALE], ["batteryBlue", 7.6, 8.2, -20, CELL_SCALE],
    ["displayBlue", -11.6, 2, 90, { y: 0.2 }], ["displayGreen", 11.6, 6, -90, { y: 0.2 }],
  ]);

  // ------------------------------------------------------------------ CREW QUARTERS (x 12..24, z -8..16)
  placeAll([
    ["bunk", 22.3, -5.4, 90], ["bunkRed", 22.3, -1.2, 90], ["bunk", 22.3, 3, 90],
    ["bunkSingle", 14.2, -5.6, 0],
    ["cafeTable", 16.6, 8, 90], ["cafeTableRed", 20.8, 8, 90], ["cafeTable", 18.7, 13, 90],
    ["chair", 15.3, 9.4, 0], ["chair", 17.9, 6.6, 180], ["chair", 19.5, 9.4, 0], ["chair", 22.2, 6.8, 190],
    ["endTable", 14, 14.2, 0], ["tableLight", 14, 14.2, 0, { y: 0.93 }],
    ["floorLamp", 23, 14.4, -120],
  ]);

  // ------------------------------------------------------------------ CARGO BAY (z 16..40)
  // Cargo blocks and power-cell stacks along the walls and in loose islands, the centre open.
  placeAll([
    ["deckBlock", -19.6, 22, 0, { scale: [0.45, 0.42, 0.9] }], ["deckBlock", -19.6, 27, 0, { scale: [0.45, 0.42, 0.9] }],
    ["deckBlock", 19.6, 33, 0, { scale: [0.45, 0.42, 0.9] }],
    ["batteryBlue", -11.8, 25.6, 10, CELL_SCALE], ["batteryBlue", -10.9, 26.6, -20, CELL_SCALE], ["batteryGrey", -12.8, 26.8, 35, CELL_SCALE],
    ["batteryOrange", 11.4, 23.4, -15, CELL_SCALE], ["batteryRed", 12.6, 22.8, 20, CELL_SCALE],
    ["genPileSmall", 10.6, 31.8], ["batteryGrey", 11.8, 32.6, 25, CELL_SCALE],
    ["batteryOrange", -7.4, 33.4, 5, CELL_SCALE], ["batteryBlue", -6.4, 34.4, 40, CELL_SCALE],
    ["genPile", 20.6, 20.4], ["genPileSmall", -21.4, 36.6],
    ["wallPipe", -23.4, 30, 90],
    ["wallLightWhite", -23.5, 20, 90, { y: 2.2 }], ["wallLightWhite", 23.5, 26, -90, { y: 2.2 }],
    ["displayOff", 6, 16.4, 0, { y: 0.2 }],
  ]);
  // Freight: stacked cargo blocks and specimen tubes waiting to ship (one tube split open).
  const cargo = (x: number, z: number, yaw: number, stacked: boolean) => {
    place("deckBlock", x, z, yaw, { scale: [0.5, 0.42, 0.9] });
    if (stacked) place("deckBlock", x, z, yaw + 2, { scale: [0.5, 0.36, 0.8], y: 1.74, noCollider: true });
  };
  cargo(-14.5, 33.5, 90, true);
  cargo(-3.5, 25.5, 0, false);
  cargo(15.5, 36, 90, false);
  placeAll([
    ["cryoOff", 5.2, 26.4], ["cryoOff", 7.6, 26.2], ["cryoOn", 5.4, 28.8],
    ["monitorOff", -5.2, 16.5, 0],
    ["catwalk", -22.8, 34, 0], ["railing", -21.8, 32, 90],
  ]);

  // Invisible walls exactly on the map edge, so nothing slips between boundary pieces.
  const edge = (x: number, z: number, width: number, depth: number) => {
    const e = new Entity("edge");
    e.setLocalPosition(x, 0, z);
    root.addChild(e);
    declareCollider(e, { kind: "box", width, depth });
  };
  const { minX, maxX, minZ, maxZ } = BOUNDS;
  edge((minX + maxX) / 2, minZ - 0.5, maxX - minX + 2, 1);
  edge((minX + maxX) / 2, maxZ + 0.5, maxX - minX + 2, 1);
  edge(minX - 0.5, (minZ + maxZ) / 2, 1, maxZ - minZ + 2);
  edge(maxX + 0.5, (minZ + maxZ) / 2, 1, maxZ - minZ + 2);

  return root;
}

/** Chapter 2: the ORION research facility. */
export const FACILITY_BIOME: Biome<FacilityModel> = {
  id: "facility",
  label: "ORION Facility",
  kit: { url: FACILITY.url, models: FACILITY_MODELS, brightness: FACILITY.brightness, glowIntensity: FACILITY.glowIntensity, batchCellMetres: FACILITY.batchCellMetres },
  lighting: FACILITY_LIGHTING,
  ground: GROUND_SPEC,
  bounds: BOUNDS,
  spawn: SPAWN,
  runStart: RUN_START,
  ambient: AMBIENT,
  build: buildFacilityLevel,
};
