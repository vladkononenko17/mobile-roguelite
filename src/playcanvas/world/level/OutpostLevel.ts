import type { AmbientEmitter } from "../AmbientFx";
import { Entity } from "playcanvas";
import { WASTELAND_DIFFICULTIES, WASTELAND_LEVELS, WASTELAND_RUN } from "../../gameplay/wastelandConfig";
import type { GroundSpec } from "../Ground";
import type { ModelKit, SpawnOptions } from "../props/ModelKit";
import { declareCollider } from "../collision/CollisionWorld";
import { OUTPOST_MODELS, type OutpostModel } from "../props/OutpostKit";
import { LIGHTING, OUTPOST } from "../../config";
import type { Biome, LevelBounds, WayPoint, Zone } from "./Biome";

/**
 * CHAPTER 1 - THE WASTELAND: a three-level campaign, south to north (~120 x 240 m):
 *   1 DUSTLINE OUTPOST (z 40..-40)   the survivors' compound, below (48 x 80 m)
 *   2 THE DEAD STREETS (z -56..-120) a ruined city block round a crossroads (64 x 64 m)
 *   3 THE PLAZA        (z -136..-196) the Abomination's square (60 x 60 m)
 * joined by short streets through barricades that fall when a level is won (the same walk-on flow
 * as Hell and the ORION). Ruined skyscrapers stand either side of the city and a fallen tower beyond
 * the plaza; trees and weeds take the streets back (see buildCity).
 *
 * The outpost: an abandoned industrial compound fortified by survivors, 48 x 80 m,
 * built from the Atomic Realm kit (see world/props/OutpostKit.ts).
 *
 * The camera looks towards -Z: the player starts at the south edge (z = +36) and progresses "up the
 * screen" to the north edge (z = -40). Screen right is +X.
 *
 *   z -40  +---------- wall + beached ship landmark beyond ------------+  NORTH
 *          |              AREA 5: BOSS / EVENT ARENA                   |
 *          |    open ~20 m ring, cover at the edges, floodlights       |
 *   z -26  +-- broken wall ----  wide opening  ---- warehouse back ----+
 *          | AREA 4: INFECTED  |    dirt track    | AREA 3: INDUSTRIAL |
 *          | ruined house,     |   north to the   | concrete yard,     |
 *          | flipped car, ash, |      arena       | warehouse, fuel    |
 *          | spike field       |                  | depot, containers  |
 *   z   0  |  road dead-ends  ==== T junction ====  road exits east    |
 *   z   5  +-- broken wall --+                    +-- spiked fence ----+
 *          |               AREA 2: MAIN YARD (open combat)             |
 *          |   survivor camp, barricade, abandoned car, junk pile     |
 *   z  28  +===== fortified wall ======[ GATE ]====== fortified wall ===+
 *          |           AREA 1: ENTRY - chicane, spikes, wrecks         |
 *   z  40  +------------- roadblock / fence ------ spawn --------------+  SOUTH
 *
 * Only layout data and small placement helpers live here; models, colliders and batching come from
 * the kit (ModelKit + OutpostKit), the ground from world/Ground.ts.
 */

/** The outpost compound (zone 1). */
export const OUTPOST_AREA: LevelBounds = { minX: -23.4, maxX: 23.4, minZ: -39.4, maxZ: 39.4 };
/** The dead city's two zones (their edges; the regions are 1 m inside). */
const STREETS = { x0: -32, z0: -120, x1: 32, z1: -56 };
const PLAZA = { x0: -30, z0: -196, x1: 30, z1: -136 };
/** Half width of the streets joining the zones (and of the gaps the barricades close). */
const GAP = 4;
/** The whole chapter. */
export const BOUNDS: LevelBounds = { minX: -60, maxX: 60, minZ: -230, maxZ: 41 };

export const ZONES: Record<string, Zone> = {
  outpost: { region: OUTPOST_AREA, start: { x: 0, z: 14, yawDeg: 180 }, exit: { axis: "z", at: -40, dir: -1 } },
  streets: { region: { minX: STREETS.x0 + 1, maxX: STREETS.x1 - 1, minZ: STREETS.z0 + 1, maxZ: STREETS.z1 - 1 }, start: { x: 0, z: -61, yawDeg: 180 }, exit: { axis: "z", at: STREETS.z0, dir: -1 } },
  plaza: { region: { minX: PLAZA.x0 + 1, maxX: PLAZA.x1 - 1, minZ: PLAZA.z0 + 1, maxZ: PLAZA.z1 - 1 }, start: { x: 0, z: -141, yawDeg: 180 } },
};

/** The player starts on the road outside the gate, facing north. */
export const SPAWN = { x: 0.6, z: 36.4, yawDeg: 180 };

/**
 * Ambient life (world/AmbientFx.ts), placed on landmarks at the edges of the combat space: smoke from
 * the camp fire and two wrecks, sparks from the generators and a gate floodlight, dust drifting over
 * the main yard and the ruins. Kept sparse so combat stays readable.
 */
export const AMBIENT: AmbientEmitter[] = [
  { kind: "smoke", x: -12.8, y: 0.3, z: 12.1, size: [0.6, 0.6], intensity: 1 },
  { kind: "smoke", x: 11.9, y: 0.8, z: 16.4, size: [0.8, 0.8], intensity: 0.6 },
  { kind: "smoke", x: -9.2, y: 0.9, z: -10.5, size: [1, 1], intensity: 0.7 },
  { kind: "sparks", x: 12.3, y: 1.1, z: -8.9, every: 5 },
  { kind: "sparks", x: 18.6, y: 1.1, z: -34.4, every: 7 },
  { kind: "sparks", x: 6.4, y: 4.2, z: 28.9, every: 9 },
  { kind: "dust", x: 0, y: 1.2, z: 14, size: [16, 16], intensity: 1 },
  { kind: "dust", x: -14, y: 1.2, z: -12, size: [12, 12], intensity: 0.8 },
  // The dead city: burning wrecks, a sparking traffic light, dust in the streets and on the plaza.
  { kind: "smoke", x: -3, y: 0.8, z: -71, size: [0.8, 0.8], intensity: 0.8 },
  { kind: "smoke", x: 15, y: 0.8, z: -87, size: [0.8, 0.8], intensity: 0.6 },
  { kind: "smoke", x: -24, y: 0.8, z: -163, size: [1, 1], intensity: 0.7 },
  { kind: "sparks", x: 5.5, y: 4, z: -79, every: 6 },
  { kind: "dust", x: 0, y: 1.2, z: -88, size: [30, 30], intensity: 1 },
  { kind: "dust", x: 0, y: 1.2, z: -166, size: [30, 30], intensity: 1 },
];

export const GROUND_SPEC: GroundSpec = {
  base: "sand",
  areas: [
    // Desert all round; the city's pavement from the outpost's north wall on.
    { x0: -130, z0: -40, x1: 130, z1: 140 },
    { x0: -130, z0: -300, x1: 130, z1: -40, surface: "asphalt" },
  ],
  pads: [
    // The plaza's paving.
    { x0: -22, z0: -188, x1: 22, z1: -144, surface: "concrete" },
    // Industrial yard: poured concrete up to the east wall.
    { x0: 5.5, z0: -25.5, x1: 24.5, z1: 5.2, surface: "concrete" },
  ],
  patches: [
    // Dirt track from the junction to the arena, and the arena floor.
    { x: 0, z: -9, w: 9, d: 10, surface: "dirt", seed: 0 },
    { x: 0.5, z: -18, w: 10, d: 11, surface: "dirt", seed: 1 },
    { x: 0, z: -32.5, w: 26, d: 17, surface: "dirt", seed: 2 },
    // Worn ground around the camp, the car and the gate approach.
    { x: -15, z: 10.5, w: 11, d: 9, surface: "dirt", seed: 3 },
    { x: 11, z: 18, w: 9, d: 7, surface: "dirt", seed: 1 },
    { x: -11, z: 34, w: 12, d: 7, surface: "dirt", seed: 2 },
    { x: 12, z: 33, w: 10, d: 7, surface: "dirt", seed: 0 },
    // Scorched, infected soil in the west.
    { x: -15, z: -11, w: 18, d: 15, surface: "ash", seed: 0 },
    { x: -9, z: -21, w: 13, d: 10, surface: "ash", seed: 3 },
    { x: -19, z: -1, w: 11, d: 9, surface: "ash", seed: 1 },
    { x: -7, z: -3, w: 7, d: 6, surface: "ash", seed: 2 },
    { x: -18, z: -30, w: 11, d: 9, surface: "ash", seed: 1 },
    // The dead city grown over: moss and weeds in the park and along the edges; dirt drifts; scorch.
    { x: -18, z: -104, w: 24, d: 26, surface: "overgrowth", seed: 0 },
    { x: -27, z: -70, w: 10, d: 22, surface: "overgrowth", seed: 1 },
    { x: 27, z: -110, w: 10, d: 16, surface: "overgrowth", seed: 2 },
    { x: 20, z: -64, w: 18, d: 12, surface: "dirt", seed: 3 },
    { x: -26, z: -150, w: 10, d: 16, surface: "overgrowth", seed: 3 },
    { x: 25, z: -186, w: 12, d: 12, surface: "overgrowth", seed: 0 },
    { x: -3, z: -71, w: 8, d: 7, surface: "ash", seed: 2 },
    { x: 15, z: -87, w: 7, d: 6, surface: "ash", seed: 1 },
    { x: 0, z: -48, w: 10, d: 14, surface: "dirt", seed: 2 },
    { x: 0, z: -128, w: 10, d: 14, surface: "dirt", seed: 0 },
  ],
};

type Placement = [OutpostModel, number, number, number?, SpawnOptions?];

/** Road tiles are 12 m in the kit; scaled to 6.6 m (a two-lane road ~5.8 m wide) and flattened
 * to a few centimetres so the hero walks on it. */
const ROAD_TILE = 6.6;
const ROAD_SCALE: SpawnOptions = { scale: [ROAD_TILE / 12, 0.12, ROAD_TILE / 12] };

interface WallRunOptions {
  /** Models cycled along the run; "" leaves a gap (broken wall). */
  pattern: (OutpostModel | "")[];
  /** Module indices to leave out (breaches). */
  skip?: number[];
  /** Stacked rows (2 m each at scale 1). Upper rows use `upper` if given. */
  rows?: number;
  upper?: (OutpostModel | "")[];
  /** Vertical scale of every module (e.g. 1.35 for a taller fortification). */
  height?: number;
  /** Put a column post at every Nth joint (0 = none). */
  columnsEvery?: number;
  /** Turn the modules to face the other side of the line. */
  flip?: boolean;
}

/**
 * Level builder: every visible piece is a kit model. Returns the level root; every placed model
 * declares its collider, so `CollisionWorld.addStaticFrom(root)` picks up the whole level.
 */
export function buildOutpostLevel(kit: ModelKit<OutpostModel>): Entity {
  const root = new Entity("OutpostLevel");

  const place = (id: OutpostModel, x: number, z: number, yaw = 0, options: SpawnOptions = {}) => kit.spawn(id, x, z, yaw, root, options);
  const placeAll = (list: Placement[]) => { for (const [id, x, z, yaw, options] of list) place(id, x, z, yaw ?? 0, options); };

  /** A composed group: items in local coordinates around (ox, oz), all turned by `yaw`. */
  const cluster = (ox: number, oz: number, yaw: number, items: Placement[]) => {
    const r = (yaw * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    for (const [id, lx, lz, lyaw, options] of items) place(id, ox + lx * c + lz * s, oz - lx * s + lz * c, yaw + (lyaw ?? 0), options);
  };

  /** Lays 2 m wall modules along a->b (scaled to fit the length exactly). */
  const wallRun = (ax: number, az: number, bx: number, bz: number, o: WallRunOptions) => {
    const length = Math.hypot(bx - ax, bz - az);
    const count = Math.max(1, Math.round(length / 2));
    const width = length / count;
    const dx = (bx - ax) / length, dz = (bz - az) / length;
    const yaw = (Math.atan2(-dz, dx) * 180) / Math.PI + (o.flip ? 180 : 0);
    const h = o.height ?? 1;
    for (let i = 0; i < count; i++) {
      if (o.skip?.includes(i)) continue;
      const cx = ax + dx * width * (i + 0.5), cz = az + dz * width * (i + 0.5);
      for (let row = 0; row < (o.rows ?? 1); row++) {
        const pattern = row > 0 && o.upper ? o.upper : o.pattern;
        const id = pattern[(i + row) % pattern.length];
        if (!id) continue;
        // Upper rows are decoration on top of the blocking lower row.
        place(id, cx, cz, yaw, { scale: [width / 2, h, 1], y: row * 2 * h, noCollider: row > 0 });
      }
    }
    if (o.columnsEvery) {
      for (let i = 0; i <= count; i += o.columnsEvery) {
        if (o.skip?.includes(i) && o.skip?.includes(i - 1)) continue;
        place("wallColumn", ax + dx * width * i, az + dz * width * i, yaw, { scale: [1.2, h * (o.rows ?? 1), 1.2] });
      }
    }
  };

  // ------------------------------------------------------------------ roads
  place("roadT", 0, 0, 180, ROAD_SCALE);
  for (let i = 1; i <= 6; i++) place("road", 0, i * ROAD_TILE, 0, ROAD_SCALE);
  place("road", -ROAD_TILE, 0, 90, ROAD_SCALE);
  place("road", -2 * ROAD_TILE, 0, 90, ROAD_SCALE);
  place("roadEnd", -3 * ROAD_TILE, 0, -90, ROAD_SCALE);
  for (let i = 1; i <= 3; i++) place("road", i * ROAD_TILE, 0, 90, ROAD_SCALE);

  // ------------------------------------------------------------------ AREA 1: entry (z 40..28)
  // Fortified wall with the gate on the road; taller than a person so it reads as a defence line.
  const fort = { height: 1.35, columnsEvery: 2 };
  wallRun(-23.6, 28, -5.2, 28, { ...fort, pattern: ["wallConcreteMetal", "wallConcreteMetal", "wallSpiked", "wallWood", "wallConcreteMetal", "wallMetalRed", "wallSpiked", "wallWood", "wallConcreteMetal"] });
  wallRun(5.2, 28, 23.6, 28, { ...fort, pattern: ["wallSpiked", "wallConcreteMetal", "wallWood", "wallMetalBlue", "wallConcreteMetal", "wallSpiked", "wallConcreteMetal", "wallWood", "wallConcreteMetal"] });
  // Gate towers: tall posts, floodlights, and two plank gate leaves - one hanging open, one pushed in.
  placeAll([
    ["wallColumn", -5.2, 28, 0, { scale: [2.4, 2.2, 2.4] }],
    ["wallColumn", 5.2, 28, 0, { scale: [2.4, 2.2, 2.4] }],
    ["floodlight", -6.4, 28.9, 200],
    ["floodlight", 6.4, 28.9, 160],
    ["wallWood", -3.7, 26.4, 115, { scale: [1.1, 1.35, 1] }],
    ["wallWood", 3.9, 26.6, -70, { scale: [1.1, 1.35, 1] }],
    ["roadSign", 6.2, 29.6, 0],
  ]);
  // Outer defences: spike barricades and wire along the wall, a sandbag post by the gate.
  placeAll([
    ["spikeBarricade", -8.5, 30.2, 0], ["spikeBarricade", -13, 30.5, 12], ["spikeBarricade", -18, 30.1, -6], ["spikeBarricade", -21.8, 30.4, 8],
    ["spikeBarricade", 9.5, 30.3, 0], ["spikeBarricade", 14.5, 30.6, -10], ["spikeBarricade", 19.6, 30.2, 6],
    ["razorWire", -11, 29.4, 0], ["razorWire", 17, 29.4, 180],
    ["sandbags", -6.9, 30.2, 0],
  ]);
  // Chicane on the road: vehicles had to weave; a warning sign and cones mark it.
  placeAll([
    ["jersey", -2.1, 33.6, 0], ["jersey2", 2.3, 31.3, 180],
    ["sawhorseStriped", 3.4, 35.6, 12], ["cone", -0.6, 31.2, 0], ["cone", 1.1, 34.8, 30],
    ["warningSign", 5.8, 33.4, -25],
    ["trafficBarrel", -4.4, 37.6, 0, { scale: 0.5 }],
  ]);
  // Abandoned checkpoint vehicle and supplies outside the gate.
  cluster(-10.5, 35.2, 160, [
    ["car", 0, 0, 0],
    ["tire", 1.9, -1.2, 0], ["wheel", -1.6, 2.3, 60, { tiltX: 80, y: 0.35 }],
    ["jerryCan", 1.6, 1.4, 20],
  ]);
  cluster(8.2, 31.8, 0, [
    ["barrelBlue", 0, 0], ["barrelBlue", 0.75, 0.3], ["barrelBlue", 0.3, 0.9],
    ["crate", -1.4, 0.2, 12], ["jerryCan", 1.4, -0.3, 40],
  ]);
  // Roadblock behind the player (south edge) and power poles along the approach.
  placeAll([
    ["jersey", -2.4, 39.4, 0], ["jersey2", 1.6, 39.6, 4], ["wreckBarricade", 5.6, 39.2, 176],
    ["pole", -5.8, 37.5, 90], ["pole", 13.5, 36.5, 90], ["treeRound", 20.5, 35.5, 40],
  ]);

  // ------------------------------------------------------------------ AREA 2: main yard (z 28..5)
  // Just inside the gate: the guards' corner.
  cluster(7, 25.2, 0, [
    ["crate", 0, 0, 5], ["crate", 1.2, 0.15, -8], ["crate", 0.6, 0.05, 20, { y: 1.15 }],
    ["bench", 3, 0.6, 180], ["streetLamp", -1.2, 0.8, 0],
  ]);
  // West: survivor barricade line facing the infected side.
  cluster(-10.5, 19.5, 8, [
    ["sandbags", 0, 0, 0], ["jersey", -3.6, 0.3, 8],
    ["barrelBlue", 2.2, -0.4], ["barrelBlue", 2.8, 0.35],
    ["palletPile", -0.8, -1.8, 20], ["metalBoardA", 1, 1, 0, { y: 0.55, tiltX: -15 }],
  ]);
  // East: abandoned car, stripped for parts.
  cluster(11.5, 17.5, 28, [
    ["car", 0, 0, 0],
    ["tire", 1.8, 1.6, 0], ["tire", 2.2, 2.3, 30], ["wheel", -1.7, 2.2, 0],
    ["jerryCan", 1.4, -1.9, 20], ["crate", -2.3, -1.3, 15],
  ]);
  // West: survivor camp - tent, fire, cots, a lamp and planks as a floor.
  cluster(-15.5, 10.5, 0, [
    ["groundPlanks", -0.6, 0.2, 0, { scale: [1, 0.4, 1] }], ["groundPlanks", 1.4, 0.2, 90, { scale: [1, 0.4, 1] }],
    ["tent", -0.5, -0.6, 20], ["campfire", 2.7, 1.6, 0], ["cot", -0.8, 2.6, 90], ["sleepingBag", 3.2, -1.2, 40],
    ["bench", 5, 2.2, 90], ["streetLamp", -2.6, -2, 0], ["crate", -3, 1.3, 10], ["barrelRed", 1.1, -2.7, 0],
  ]);
  // East: junk pile dragged out of the houses.
  cluster(16.5, 9, -10, [
    ["sofaDamaged", 0, 0, -15], ["armchair", 2.2, 1.4, 40], ["table", -1.7, 2.2, 20],
    ["bathtub", 2.7, -1.7, 70], ["chairBroken", 0.4, 2.6, 0], ["cardboard", -2, -1.3, 0],
    ["cart", 4, 0.9, -30], ["tyreStack", -3.4, 0.6, 0],
  ]);
  // Cover near the road and lamps along it.
  placeAll([
    ["jersey2", 7.4, 12.2, 70], ["jersey", -7.4, 7.2, -60],
    ["lampDouble", -5, 15.5, 0], ["lamp", 5, 21, 180], ["lamp", 5, 8.5, 180],
    ["pole", -6, 24, 90], ["pole", -6, 5.8, 90],
    ["treeRound", -21.2, 23, 0],
  ]);

  // ------------------------------------------------------------------ AREA 3: industrial (x 5..24, z 5..-26)
  // Spiked fence between the yard and the depot, open next to the junction.
  wallRun(10, 5.6, 23.6, 5.6, { pattern: ["wallSpiked", "wallMetalBlue", "wallSpiked", "wallMetalRed"], columnsEvery: 3 });
  placeAll([["sawhorse", 7.2, 6.4, 10], ["sawhorseStriped", 8.9, 6.6, -5]]);
  // Warehouse (x 13..23, z -13..-25): two storeys of metal on concrete, partly collapsed roof.
  const wh = { rows: 2, pattern: ["wallConcreteMetal"] as OutpostModel[], upper: ["wallMetalRed", "wallMetalBlue", "wallMetalRed"] as OutpostModel[], columnsEvery: 2 };
  wallRun(13, -13, 13, -25, { ...wh, pattern: ["wallConcreteMetal", "wallWindow", "wallBoarded", "wallConcreteMetal", "wallWindow2", "wallConcreteMetal"], flip: true });
  wallRun(13, -13, 23.4, -13, { ...wh });
  wallRun(13, -25, 23.4, -25, { ...wh, flip: true });
  for (let x = 14; x <= 22; x += 2) {
    for (let z = -14; z >= -24; z -= 2) {
      // The north-west corner of the roof has fallen in; the sheets lie inside.
      if (x <= 16 && z <= -20) continue;
      place(((x + z) / 2) % 2 === 0 ? "wallMetalRed" : "wallMetalBlue", x, z + 1, 0, { y: 4.05, tiltX: -90, noCollider: true });
    }
  }
  placeAll([["metalBoardB", 14.8, -21.5, 30, { tiltX: -80, y: 0.1 }], ["metalBoardC", 15.6, -23, -20, { tiltX: -85, y: 0.1 }]]);
  // Containers along the east wall, one stacked.
  placeAll([
    ["container", 21.4, -8.4, 90], ["container", 21.4, -8.4, 92, { y: 2.62, noCollider: true }],
    ["container", 15.6, -9.2, 4],
  ]);
  // Fuel depot: bowser, generator, drum rack and drums.
  cluster(9.5, -6.5, 0, [
    ["bowser", 0, 0, 90], ["generator", 2.8, -2.4, 0], ["drumRack", -0.6, -3.9, 0],
    ["barrelBlue", 2.9, 1.3], ["barrelBlue", 3.5, 2], ["barrelBlue", 2.3, 2.3], ["jerryCan", 1.6, 2.6, 30],
    ["floodlight", -2.4, 2.2, 45],
  ]);
  // Storage corner: pallets, crates, cardboard.
  cluster(8.6, -17.8, 0, [
    ["palletStack", 0, 0, 0], ["palletStack", 1.4, 0.2, 8], ["palletPile", -1.9, 1.6, 30],
    ["crate", 1.4, -1.7, 0], ["crate", 2.6, -1.3, 12], ["crate", 2, -1.5, 25, { y: 1.15 }],
    ["cardboard", -1.2, -1.6, 0], ["barrelBlue", -2.2, -0.6],
  ]);
  placeAll([
    ["engineParts", 16.5, -3.8, 20], ["floodlight", 19, -11.4, 200], ["pole", 23, 2.8, 0], ["pole", 23, -18, 0],
  ]);

  // ------------------------------------------------------------------ AREA 4: infected ruins (x -24..-5, z 5..-26)
  // Broken wall between the yard and the ruins, with breaches.
  wallRun(-23.6, 5.2, -6.5, 5.2, { pattern: ["wall", "wallHole", "wall", "wallBrick", "wall", "wallHole", "wall", "wall"], skip: [2, 5, 6], columnsEvery: 2 });
  // Ruined house (x -21..-13, z -8..-16): no roof, the south side collapsed.
  wallRun(-21, -8, -13, -8, { pattern: ["wallWindow", "wall", "wallHole", "wallWindow2"], columnsEvery: 2 });
  wallRun(-21, -8, -21, -16, { pattern: ["wall", "wallBrick", "wallWindow", "wall"], flip: true, columnsEvery: 2 });
  wallRun(-13, -8, -13, -16, { pattern: ["wallBoarded", "wall", "wallHole", "wall"], skip: [2], columnsEvery: 2 });
  wallRun(-21, -16, -13, -16, { pattern: ["wallHole", "", "", "wall"], columnsEvery: 4 });
  placeAll([
    ["metalBoardB", -18.5, -12, 20, { tiltX: -85, y: 0.08 }], ["metalBoardA", -16.4, -10.6, -40, { tiltX: -80, y: 0.08 }],
    ["chairBroken", -15.6, -13.8, 30], ["table", -19.2, -9.9, 10], ["bottle", -18.6, -14.6, 0],
    ["rock", -16.5, -16.9, 20, { scale: 0.6 }], ["rock", -14.8, -17.2, 140, { scale: 0.45 }],
  ]);
  // A car flipped on its side, a boat left high and dry, a field of sharpened stakes.
  placeAll([
    ["car", -9.2, -10.5, 32, { tiltZ: 90, y: 1.05 }],
    ["boat", -8.6, -21, 55, { scale: 0.8 }],
    ["tire", -7.2, -8.4, 0], ["scrap", -10.8, -14, 0], ["rock", -11.6, -3.6, 20, { scale: 0.7 }],
    ["rock", -19, -20.5, 70, { scale: 0.9 }], ["rock", -6.4, -15.8, 200, { scale: 0.5 }],
    ["metalBoardC", -12.2, -6.2, 60, { tiltX: -84, y: 0.08 }],
  ]);
  for (const [x, z, t] of [[-18.5, -3.2, 18], [-17.4, -2.2, -12], [-19.6, -1.6, 22], [-16.6, -3.8, -20], [-20.4, -3.4, 10], [-18, -0.8, -16], [-8.4, -24, 15], [-7, -24.8, -18]] as const) {
    place("stick", x, z, t * 7, { tiltX: t, y: 0.6 });
  }
  placeAll([["spikeBarricade", -22, 0.5, 90], ["spikeBarricade", -22, -3.2, 84], ["tyreStack", -6.8, -1.2, 20]]);

  // ------------------------------------------------------------------ AREA 5: boss arena (z -26..-40)
  // Broken wall across the west, the warehouse closes the east; a wide opening in the middle.
  wallRun(-23.6, -26, -9.5, -26, { pattern: ["wall", "wallHole", "wallConcreteMetal", "wall", "wallBrick", "wall", "wallConcreteMetal"], skip: [3], columnsEvery: 2 });
  placeAll([["tyreStack", -8.6, -26.8, 0], ["crate", 9.8, -26.4, 20], ["crate", 10.9, -26.2, -5], ["barrelBlue", 11.9, -26.8]]);
  // Cover around the ring, well outside its open centre (room for a 2-2.5x size enemy).
  placeAll([
    ["jersey", -8.2, -28.4, 35], ["jersey2", 8.4, -28.8, -30], ["jersey", -10.2, -36.8, -65], ["jersey2", 10.4, -37.2, 60],
    ["crate", -13.6, -31.8, 10], ["crate", -13.2, -30.7, -15], ["barrelBlue", 13.4, -32.2], ["barrelBlue", 13.9, -31.4],
    ["lampDouble", -12.8, -33.5, 90], ["lampDouble", 12.8, -33.5, -90],
    ["floodlight", -16.5, -38.4, 30], ["floodlight", 16.5, -38.4, -30],
  ]);
  // Container stack in the north-west corner, generator in the north-east.
  placeAll([
    ["container", -19.4, -36.6, 90], ["container", -19.4, -36.6, 92, { y: 2.62, noCollider: true }],
    ["generator", 18.6, -34.4, 90], ["drumRack", 19.8, -30, 90],
  ]);
  // Landmark west of the city gate: a ship hull beached in the sand.
  place("crashedShip", -44, -30, 65, { scale: 0.6, noCollider: true });
  placeAll([["pole", -10, -42.5, 0], ["pole", 12, -43, 0]]);

  // ------------------------------------------------------------------ outer boundary
  // South: fence either side of the road.
  wallRun(-23.6, 40.2, -4.4, 40.2, { pattern: ["wallWood", "wallSpiked", "wallWood", "wallMetalRed"], columnsEvery: 2 });
  wallRun(7.4, 40.2, 23.6, 40.2, { pattern: ["wallSpiked", "wallWood", "wallMetalBlue", "wallWood"], columnsEvery: 2 });
  // West: mixed walls, broken in the infected area (spikes and the invisible edge still block).
  wallRun(-23.8, 40, -23.8, 28, { pattern: ["wallWood", "wallSpiked"], flip: true, columnsEvery: 2 });
  wallRun(-23.8, 28, -23.8, 5.2, { pattern: ["wallConcreteMetal", "wall", "wallBrick", "wall", "wallConcreteMetal", "wallMetalRed"], flip: true, columnsEvery: 3 });
  wallRun(-23.8, 5.2, -23.8, -26, { pattern: ["wall", "wallHole", "", "wall", "wallMetalRed", "wall", "wallWood", ""], flip: true, columnsEvery: 2 });
  wallRun(-23.8, -26, -23.8, -40, { pattern: ["wallConcreteMetal", "wall", "wallConcreteMetal"], flip: true, columnsEvery: 2 });
  // East: fence along the yard, metal walls around the depot; the east road exit is barricaded.
  wallRun(23.8, 40, 23.8, 5.6, { pattern: ["wallMetalBlue", "wallSpiked", "wallWood", "wallMetalRed", "wallConcreteMetal"], columnsEvery: 3 });
  wallRun(23.8, 5.6, 23.8, 4.4, { pattern: ["wallMetalRed"] });
  wallRun(23.8, -4.4, 23.8, -13, { pattern: ["wallMetalRed", "wallConcreteMetal", "wallMetalBlue"], columnsEvery: 2 });
  wallRun(23.8, -25, 23.8, -40, { pattern: ["wallConcreteMetal", "wallMetalRed", "wallConcreteMetal"], columnsEvery: 2 });
  placeAll([["jersey", 22.4, -2, 90], ["jersey2", 22.4, 1.6, 90], ["wreckBarricade", 25.6, 0, 90, { noCollider: true }]]);
  // North: a taller wall behind the arena.
  // North: a taller wall behind the arena, its gate (x -4..4) the way into the city.
  wallRun(-23.8, -40.2, 23.8, -40.2, { rows: 2, pattern: ["wallConcreteMetal", "wallConcreteMetal", "wall", "wallConcreteMetal"], upper: ["wallMetalRed", "", "wallMetalBlue", "wallMetalRed", ""], columnsEvery: 3, skip: [10, 11, 12, 13] });
  placeAll([["wallColumn", -4.4, -40.2, 0, { scale: [2.2, 2.4, 2.2] }], ["wallColumn", 4.4, -40.2, 0, { scale: [2.2, 2.4, 2.2] }]]);

  // Invisible walls exactly on the map edge, so nothing can slip between boundary pieces.
  const edge = (x: number, z: number, width: number, depth: number) => {
    const e = new Entity("edge");
    e.setLocalPosition(x, 0, z);
    root.addChild(e);
    declareCollider(e, { kind: "box", width, depth });
  };
  const { minX, maxX, minZ, maxZ } = OUTPOST_AREA;
  // North: open at the city gate.
  edge((minX - GAP) / 2, minZ - 0.5, -GAP - minX + 1, 1);
  edge((maxX + GAP) / 2, minZ - 0.5, maxX - GAP + 1, 1);
  edge((minX + maxX) / 2, maxZ + 0.5, maxX - minX + 2, 1);
  edge(minX - 0.5, (minZ + maxZ) / 2, 1, maxZ - minZ + 2);
  edge(maxX + 0.5, (minZ + maxZ) / 2, 1, maxZ - minZ + 2);

  buildCity(kit, root, place, placeAll, wallRun, edge);
  buildSeals(kit, root);
  return root;
}

/** Chapter 1: the Wasteland - the Dustline outpost and the dead city. */
export const OUTPOST_BIOME: Biome<OutpostModel> = {
  id: "outpost",
  label: "Wasteland",
  kit: { url: OUTPOST.url, models: OUTPOST_MODELS, brightness: OUTPOST.brightness, batchCellMetres: OUTPOST.batchCellMetres },
  lighting: LIGHTING,
  ground: GROUND_SPEC,
  bounds: BOUNDS,
  spawn: SPAWN,
  // Every wave starts in the open main yard.
  runStart: { x: 0, z: 14, yawDeg: 180 },
  ambient: AMBIENT,
  build: buildOutpostLevel,
  campaign: {
    levels: WASTELAND_LEVELS,
    zones: ZONES,
    run: WASTELAND_RUN,
    difficulties: WASTELAND_DIFFICULTIES,
    defaultDifficulty: "hard",
    victory: { title: "THE CITY IS QUIET", text: "The Abomination is down. Beyond the plaza the highway runs north - towards the ORION's landing site." },
    onLevel(_index, zoneId) {
      const region = ZONES[zoneId]?.region;
      for (const s of world.seals) {
        s.open = -1;
        s.entity.setLocalPosition(s.x, 0, s.z);
        s.entity.enabled = !!region && onEdge(region, s.x, s.z);
      }
      world.exitSeals = [];
    },
    exits(zoneId): WayPoint[] {
      const exit = ZONES[zoneId]?.exit;
      world.exitSeals = exit ? world.seals.filter((s) => s.entity.enabled && Math.abs(s.z - exit.at) < 1.5) : [];
      return world.exitSeals.map((s) => ({ x: s.x, z: s.z, width: GAP * 2, yawDeg: 0 }));
    },
    openExit(_zoneId, index) {
      const s = world.exitSeals[index];
      if (s && s.open < 0 && s.entity.enabled) s.open = 0;
    },
    update(dt) {
      for (const s of world.exitSeals) {
        if (s.open < 0 || !s.entity.enabled) continue;
        s.open = Math.min(1, s.open + dt / SEAL_OPEN_SECONDS);
        s.entity.setLocalPosition(s.x, -1.3 * s.open * s.open, s.z);
        if (s.open >= 1) s.entity.enabled = false;
      }
    },
  },
};

type Place = (id: OutpostModel, x: number, z: number, yaw?: number, options?: SpawnOptions) => Entity | null;
type Edge = (x: number, z: number, width: number, depth: number) => void;
type WallRun = (ax: number, az: number, bx: number, bz: number, o: WallRunOptions) => void;

/** Deterministic RNG so the layout is the same on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * The dead city north of the outpost: the connecting streets, THE DEAD STREETS (a crossroads with
 * a collapsed storefront, a parking lot, an overgrown park and an abandoned checkpoint in its four
 * corners), THE PLAZA (open, a wrecked convoy and a water tower at its edges) and the skyline of
 * ruined towers round them - only at the sides and beyond, never between the camera and the play.
 */
function buildCity(kit: ModelKit<OutpostModel>, root: Entity, place: Place, placeAll: (list: Placement[]) => void, wallRun: WallRun, edge: Edge): void {
  void kit; void root;
  const random = rng(4711);
  // Street tiles lifted clear of the ground and its patches (flattened to the ground they
  // z-fought with them - blinking); the hero's feet sink a few centimetres, unseen.
  const STREET: SpawnOptions = { scale: [1, 0.5, 1], y: 0.05 };
  const street = (id: OutpostModel, x: number, z: number, yaw: number) => place(id, x, z, yaw, STREET);

  // ------------------------------------------------------------------ streets (8 m tiles)
  // North-south from the outpost gate through the crossroads to the plaza; east-west across.
  const crack: OutpostModel[] = ["zkStreet", "zkStreetCrack", "zkStreet", "zkStreetCrack2"];
  let n = 0;
  for (let z = -44; z >= -132; z -= 8) {
    if (z === -84) street("zkStreet4", 0, z, 0);
    else street(crack[n++ % crack.length], 0, z, 0);
  }
  for (const x of [-40, -32, -24, -16, -8, 8, 16, 24, 32, 40]) street(crack[n++ % crack.length], x, -84, 90);

  // ------------------------------------------------------------------ connectors
  // Broken walls either side of the two short streets (low: the camera looks over them). The city
  // uses the light wall modules (the brick and holed ones are thousands of triangles each).
  for (const [z0, z1] of [[-40, -56], [-120, -136]]) {
    for (const s of [-1, 1]) {
      wallRun(s * (GAP + 0.6), z0, s * (GAP + 0.6), z1, { pattern: ["wall", "wall", "wallWindow2", "wall"], flip: s > 0, columnsEvery: 2 });
      place("nBush", s * (GAP + 2.2), (z0 + z1) / 2 + random() * 4, random() * 360);
      place("nGrass", s * (GAP + 1.4), z0 - 3 - random() * 8, random() * 360);
    }
  }
  placeAll([
    ["zkStreetLight", -GAP - 1.2, -47, 90], ["zkStreetLight", GAP + 1.2, -129, -90],
    ["zkCone", 2.4, -45, 0], ["zkCone", -2.8, -50.5, 40], ["zkTrash", 3.1, -53, 0], ["zkBlood2", -1.2, -48, 30, { y: 0.12 }],
    ["zkTownSign", 0, -131, 0, { scale: 1.1 }],
  ]);

  // ------------------------------------------------------------------ THE DEAD STREETS
  const q = STREETS;
  // Zone edges: rubble, wrecks and walls (low south, taller north), invisible walls on the lines.
  wallRun(q.x0, q.z1, -GAP, q.z1, { pattern: ["wall", "wallWindow2", "wall", "wall", "", "wallBoarded", "wall"], columnsEvery: 2 });
  wallRun(GAP, q.z1, q.x1, q.z1, { pattern: ["wall", "wallWindow", "wall", "wallWindow2", "", "wall", "wall"], columnsEvery: 2 });
  wallRun(q.x0, q.z0, -GAP, q.z0, { rows: 2, pattern: ["wallConcreteMetal", "wall", "wallWindow2", "wall"], upper: ["wall", "", "wallWindow", ""], columnsEvery: 2, flip: true });
  wallRun(GAP, q.z0, q.x1, q.z0, { rows: 2, pattern: ["wall", "wallWindow2", "wallConcreteMetal", "wall"], upper: ["", "wallWindow", "", "wall"], columnsEvery: 2, flip: true });
  for (const s of [-1, 1]) {
    // Side edges: ruined shopfronts, rubble mounds; the east-west street barricaded where it leaves.
    const x = s * q.x1;
    wallRun(x, q.z1, x, -88.5, { pattern: ["wall", "wallWindow2", "wallBoarded", "wall", "wall", "wallWindow"], flip: s < 0, columnsEvery: 2 });
    wallRun(x, -79.5, x, q.z0, { pattern: ["wallWindow2", "wall", "wallWindow", "", "wall", "wallBoarded", "wall"], flip: s < 0, columnsEvery: 2 });
    place(s < 0 ? "vPickupArmored" : "vTruckArmored", s * (q.x1 + 3), -84, 90 + random() * 20);
    place("zkBarrier", s * (q.x1 - 1.5), -82, 90);
    place("zkBarrier", s * (q.x1 - 1.5), -86, 90);
    place("wreckage", s * (q.x1 + 6), -64, random() * 360, { noCollider: true });
    place("wreckage", s * (q.x1 + 6), -108, random() * 360, { noCollider: true });
  }
  edge((q.x0 - GAP) / 2, q.z1 + 0.5, -GAP - q.x0, 1);
  edge((q.x1 + GAP) / 2, q.z1 + 0.5, q.x1 - GAP, 1);
  edge((q.x0 - GAP) / 2, q.z0 - 0.5, -GAP - q.x0, 1);
  edge((q.x1 + GAP) / 2, q.z0 - 0.5, q.x1 - GAP, 1);
  edge(q.x0 - 0.5, (q.z0 + q.z1) / 2, 1, q.z1 - q.z0);
  edge(q.x1 + 0.5, (q.z0 + q.z1) / 2, 1, q.z1 - q.z0);

  // The crossroads: traffic lights at the corners, wrecked cars left where they stopped.
  placeAll([
    ["zkTrafficLight", -5.2, -79, 0], ["zkTrafficLight", 5.2, -89, 180], ["zkTrafficLight2", 5.2, -79, -90], ["zkTrafficLight2", -5.2, -89, 90],
    ["vSports", -2.6, -71, 28], ["vTruck", 15, -86.5, 97], ["vPickup", -17, -82.5, 72, { tiltZ: 6 }], ["vSports", 1.8, -103, 200],
    ["zkHydrant", -5.4, -66, 0], ["zkHydrant", 5.4, -101, 0],
    ["zkBlood", 11, -83, 0, { y: 0.12 }], ["zkBlood2", -1, -94, 50, { y: 0.12 }], ["zkBlood", -20, -89, 120, { y: 0.12 }],
  ]);
  for (const z of [-62, -110]) for (const s of [-1, 1]) place("zkStreetLight", s * 5.6, z, s > 0 ? -90 : 90);

  // South-west: a collapsed storefront - its shell open to the street, furniture dragged out.
  wallRun(-28, -60, -12, -60, { pattern: ["wallWindow", "wall", "wallWindow2", "wall", "wallBoarded", "wall", "wallWindow", "wall"], columnsEvery: 2, flip: true });
  wallRun(-28, -60, -28, -76, { pattern: ["wall", "wallWindow2", "wall", "wall"], columnsEvery: 2 });
  wallRun(-12, -60, -12, -66, { pattern: ["wall", "wall", "wall"], flip: true, columnsEvery: 3 });
  placeAll([
    ["zkCouch", -21, -64, 20], ["crate", -25.5, -63, 10], ["crate", -24.6, -62.5, -8, { y: 1.15 }], ["zkTrash2", -14, -67.5, 0],
    ["zkTrash", -15.2, -69, 40], ["cardboard", -18.5, -70, 15], ["cart", -9.5, -72, 60], ["zkPalletBroken", -23, -73, 30],
    ["billboards", -30, -72, 90, { scale: 1.3 }],
  ]);
  // South-east: a parking lot, cars abandoned at angles.
  placeAll([
    ["vPickup", 14, -63, 80], ["vSports", 22, -66, 100], ["vTruck", 26, -74, 95, { tiltX: 4 }], ["vSports", 12, -74, 250],
    ["zkWheels", 19, -71, 0], ["zkCone", 9, -68, 0], ["zkCone", 17.5, -60, 20], ["zkCinder", 24, -61, 0], ["zkCinder", 24.6, -61.4, 40],
    ["zkPallet", 28.5, -63, 10],
  ]);
  // North-west: the park, taken back - trees, bushes, a fallen log, benches.
  placeAll([
    ["nTreeOak", -14, -96, 0], ["nTreeFat", -22, -100, 40], ["nTreeOak", -27, -110, 80], ["nTree", -12, -112, 20], ["nTreeTall", -20, -116, 0],
    ["nLog", -17, -106, 30], ["bench", -9.5, -99, 90], ["bench", -24, -93, 0], ["nBushDetailed", -10, -107, 0], ["nBush", -26, -97, 0],
    ["zkTrash", -8.6, -97.5, 0], ["nTree", -29, -92, 0],
  ]);
  // North-east: the checkpoint that fell - containers, barriers, sandbags, a floodlight.
  placeAll([
    ["zkContainerGreen", 24, -110, 90], ["zkContainerRed", 26.5, -97, 90], ["zkContainerGreen", 16, -115.5, 0],
    ["zkBarrier", 9.5, -93, 0], ["zkBarrier", 13, -93.4, 8], ["zkBarrier2", 17, -93, -4], ["sandbags", 11, -101, 90],
    ["razorWire", 20.5, -104, 0], ["floodlight", 27, -104, -90], ["zkBarrel", 21, -99, 0], ["zkBarrel", 21.8, -99.6, 0], ["crate", 12.5, -109, 10],
  ]);
  // Bushes grown along every wall, debris in the corners (trees only at the edges: they would hide
  // the fight from the camera).
  const hedge = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    for (let d = 1; d < len; d += 2.4 + random() * 2.5) {
      const t = d / len, x = ax + (bx - ax) * t + (random() - 0.5), z = az + (bz - az) * t + (random() - 0.5);
      place(random() < 0.5 ? "nBush" : "nBushDetailed", x, z, random() * 360, { scale: 0.9 + random() * 0.7 });
    }
  };
  hedge(q.x0 + 1.4, q.z1 - 1.5, q.x0 + 1.4, q.z0 + 1.5);
  hedge(q.x1 - 1.4, q.z1 - 1.5, q.x1 - 1.4, q.z0 + 1.5);
  hedge(q.x0 + 1.5, q.z0 + 1.4, -GAP - 1.5, q.z0 + 1.4);
  hedge(GAP + 1.5, q.z0 + 1.4, q.x1 - 1.5, q.z0 + 1.4);
  for (let i = 0; i < 26; i++) {
    const x = (random() < 0.5 ? -1 : 1) * (7 + random() * 23), z = q.z0 + 3 + random() * (q.z1 - q.z0 - 6);
    if (Math.abs(z + 84) < 5) continue;
    const roll = random();
    place(roll < 0.25 ? "zkPalletBroken" : roll < 0.45 ? "zkCinder" : roll < 0.65 ? "zkTrash" : roll < 0.8 ? "tire" : "zkTrash2", x, z, random() * 360);
  }
  // Weeds in the cracks everywhere (walk-over).
  for (let i = 0; i < 70; i++) {
    const x = q.x0 + 1.5 + random() * (q.x1 - q.x0 - 3), z = q.z0 + 1.5 + random() * (q.z1 - q.z0 - 3);
    place(random() < 0.6 ? "nGrass" : "nGrassLeafs", x, z, random() * 360, { scale: 0.7 + random() * 0.6 });
  }
  for (let i = 0; i < 14; i++) {
    const s = random() < 0.5 ? -1 : 1;
    place(random() < 0.5 ? "nBush" : "nBushDetailed", s * (q.x1 - 1.5 - random() * 3), q.z0 + 3 + random() * (q.z1 - q.z0 - 6), random() * 360);
  }

  // ------------------------------------------------------------------ THE PLAZA
  const p = PLAZA;
  wallRun(p.x0, p.z1, -GAP, p.z1, { pattern: ["wall", "wall", "wallWindow2", "wall", "", "wall"], columnsEvery: 2 });
  wallRun(GAP, p.z1, p.x1, p.z1, { pattern: ["wall", "", "wallWindow2", "wallWindow", "wall", "wall"], columnsEvery: 2 });
  wallRun(p.x0, p.z0, p.x1, p.z0, { rows: 2, pattern: ["wallConcreteMetal", "wall", "wallWindow2", "wall", "wallConcreteMetal"], upper: ["wall", "", "wallWindow", "", "wall", ""], columnsEvery: 3, flip: true });
  for (const s of [-1, 1]) wallRun(s * p.x1, p.z1, s * p.x1, p.z0, { pattern: ["wall", "wallWindow", "wallWindow2", "", "wall", "wallBoarded"], flip: s < 0, columnsEvery: 2 });
  edge((p.x0 - GAP) / 2, p.z1 + 0.5, -GAP - p.x0, 1);
  edge((p.x1 + GAP) / 2, p.z1 + 0.5, p.x1 - GAP, 1);
  edge(0, p.z0 - 0.5, p.x1 - p.x0 + 2, 1);
  edge(p.x0 - 0.5, (p.z0 + p.z1) / 2, 1, p.z1 - p.z0);
  edge(p.x1 + 0.5, (p.z0 + p.z1) / 2, 1, p.z1 - p.z0);
  placeAll([
    // West: the convoy that never left.
    ["vTruckArmored", -24.5, -158, 8], ["vPickupArmored", -23.5, -172, -14], ["zkContainerGreen", -25, -146.5, 90], ["sandbags", -18.5, -165, 90],
    ["zkBarrier", -19, -151, 70], ["zkBarrel", -26.5, -183, 0], ["zkBarrel", -25.8, -184.2, 0],
    // East: the water tower, a bus-stop bench, planters grown wild.
    ["zkWaterTower", 23, -186, 0], ["bench", 26, -160, -90], ["zkStreetLight", 27, -150, -90], ["zkStreetLight", 27, -175, -90],
    ["zkContainerRed", 25, -142, 90],
    // Corners: trees in the old planters.
    ["nTreeOak", -21, -141, 0], ["nTreeFat", 20, -142, 60], ["nTreeOak", -22, -190, 30], ["nTree", 14, -191, 0],
    ["nBushDetailed", -19, -143, 0], ["nBush", 18, -189, 0],
    // The square itself stays open: blood, a cone, weeds.
    ["zkBlood", -4, -160, 0, { y: 0.03 }], ["zkBlood2", 7, -174, 80, { y: 0.03 }], ["zkCone", 9, -150, 0], ["zkTrash", -9, -182, 0],
  ]);
  // Cover round the square's edge: a flipped car, barrier lines, a crate stack; bushes on the walls.
  placeAll([
    ["vSports", 14, -160, 60, { tiltZ: 90, y: 1.3 }], ["vPickup", -10, -190, 175], ["zkBarrier", 10, -181, 30], ["zkBarrier2", 13, -183, 50],
    ["zkBarrier", -12, -148, -20], ["crate", 18.5, -170, 10], ["crate", 19.4, -171, -20], ["crate", 18.9, -170.5, 5, { y: 1.15 }],
  ]);
  hedge(p.x0 + 1.4, p.z1 - 1.5, p.x0 + 1.4, p.z0 + 1.5);
  hedge(p.x1 - 1.4, p.z1 - 1.5, p.x1 - 1.4, p.z0 + 1.5);
  hedge(p.x0 + 1.5, p.z0 + 1.4, p.x1 - 1.5, p.z0 + 1.4);
  for (let i = 0; i < 40; i++) {
    const x = p.x0 + 1.5 + random() * (p.x1 - p.x0 - 3), z = p.z0 + 1.5 + random() * (p.z1 - p.z0 - 3);
    place(random() < 0.6 ? "nGrass" : "nGrassLeafs", x, z, random() * 360, { scale: 0.6 + random() * 0.6 });
  }

  // ------------------------------------------------------------------ the skyline
  // Ruined towers either side of the city and beyond the plaza (never south of a zone, where they
  // would stand between the camera and the hero). Billboards on the rubble lots.
  // Each side tower's face starts right behind the zone wall (the portrait view reaches only ~8 m
  // past the hero, so towers farther out were never seen from the play).
  const FOOT: Partial<Record<OutpostModel, [number, number]>> = { bld1: [20, 20], bld2: [20, 30], bld5: [20, 20], bld6: [32, 20], bld7: [20, 25] };
  const sideTowers: [OutpostModel, -1 | 1, number, number, number][] = [
    ["bld1", -1, -66, 0, STREETS.x1], ["bld5", -1, -98, 90, STREETS.x1], ["bld2", -1, -128, 0, PLAZA.x1], ["bld6", -1, -162, 90, PLAZA.x1], ["bld1", -1, -190, 180, PLAZA.x1],
    ["bld6", 1, -70, 90, STREETS.x1], ["bld7", 1, -104, 0, STREETS.x1], ["bld5", 1, -130, 180, PLAZA.x1], ["bld2", 1, -164, 90, PLAZA.x1], ["bld5", 1, -192, 0, PLAZA.x1],
  ];
  for (const [id, s, z, yaw, edgeX] of sideTowers) {
    const [w, d] = FOOT[id]!;
    const half = (yaw % 180 === 0 ? w : d) / 2;
    place(id, s * (edgeX + 1.5 + half), z, yaw, { noCollider: true });
  }
  for (const [id, x, z, yaw] of [["bld6", -28, -226, 0], ["bld1", 30, -224, 90]] as [OutpostModel, number, number, number][]) place(id, x, z, yaw, { noCollider: true });
  // The tower that fell across the far end of the plaza.
  place("bld7", 2, -222, 70, { tiltX: 62, y: -4, noCollider: true });
  for (const [x, z] of [[-34, -84], [34, -84], [-36, -116], [36, -60], [-34, -175], [34, -150]]) place("wreckage", x, z, random() * 360, { noCollider: true, scale: 0.8 + random() * 0.5 });
  placeAll([["billboards", 36.5, -98, -90, { scale: 1.4, noCollider: true }], ["billboards", -36.5, -150, 90, { scale: 1.4, noCollider: true }], ["fireStairs", 38, -120, -90, { noCollider: true }]]);
  // Trees and bushes on the lots round the towers.
  for (let i = 0; i < 30; i++) {
    const s = random() < 0.5 ? -1 : 1, x = s * (35 + random() * 8), z = -60 - random() * 140;
    place(random() < 0.4 ? "nTreeOak" : random() < 0.5 ? "nTreeFat" : "nBush", x, z, random() * 360, { noCollider: true, scale: 0.8 + random() * 0.6 });
  }
}

/* ------------------------------------------------------------------------------------------------
 * Barricades (the way on): a row of striped barriers across each street gap; when the level is won
 * the one ahead sinks into the ground as the hero comes near.
 * ---------------------------------------------------------------------------------------------- */

interface Seal { entity: Entity; x: number; z: number; open: number }
const SEAL_OPEN_SECONDS = 0.8;
const world = { seals: [] as Seal[], exitSeals: [] as Seal[] };

function buildSeals(kit: ModelKit<OutpostModel>, root: Entity): void {
  world.seals = [];
  world.exitSeals = [];
  for (const z of [-40.4, STREETS.z1, STREETS.z0, PLAZA.z1]) {
    const e = new Entity("barricade");
    e.setLocalPosition(0, 0, z);
    root.addChild(e);
    for (const x of [-2.9, -1, 1, 2.9]) kit.spawn(x === -1 || x === 1 ? "zkBarrier" : "zkBarrier2", x, 0, x < 0 ? 4 : -4, e, { noCollider: true });
    e.enabled = false;
    world.seals.push({ entity: e, x: 0, z, open: -1 });
  }
}

/** Whether (x, z) lies on (within 1.5 m of) the edge of `region`. */
function onEdge(region: LevelBounds, x: number, z: number): boolean {
  const inX = x >= region.minX - 1.5 && x <= region.maxX + 1.5, inZ = z >= region.minZ - 1.5 && z <= region.maxZ + 1.5;
  const nearZ = Math.abs(z - region.minZ) < 1.5 || Math.abs(z - region.maxZ) < 1.5;
  const nearX = Math.abs(x - region.minX) < 1.5 || Math.abs(x - region.maxX) < 1.5;
  return (inX && nearZ) || (inZ && nearX);
}
