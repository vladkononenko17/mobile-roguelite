import type { AmbientEmitter } from "../AmbientFx";
import { Entity } from "playcanvas";
import type { GroundSpec } from "../Ground";
import type { ModelKit, SpawnOptions } from "../props/ModelKit";
import { declareCollider } from "../collision/CollisionWorld";
import type { OutpostModel } from "../props/OutpostKit";

/**
 * LEVEL 1 - "Dustline Outpost": an abandoned industrial compound fortified by survivors, 48 x 80 m,
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

export interface LevelBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const BOUNDS: LevelBounds = { minX: -23.4, maxX: 23.4, minZ: -39.4, maxZ: 39.4 };

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
];

export const GROUND_SPEC: GroundSpec = {
  base: "sand",
  pads: [
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
  // Landmark beyond the north wall: a ship hull beached in the sand.
  place("crashedShip", 3.5, -48.5, 65, { scale: 0.6, noCollider: true });
  placeAll([["pole", -8, -42.5, 0], ["pole", 12, -43, 0]]);

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
  wallRun(-23.8, -40.2, 23.8, -40.2, { rows: 2, pattern: ["wallConcreteMetal", "wallConcreteMetal", "wall", "wallConcreteMetal"], upper: ["wallMetalRed", "", "wallMetalBlue", "wallMetalRed", ""], columnsEvery: 3 });

  // Invisible walls exactly on the map edge, so nothing can slip between boundary pieces.
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
