import { Entity } from "playcanvas";
import type { EnvironmentKit } from "../kit/EnvironmentKit";
import { fenceRun, wallRun } from "../kit/Modules";
import type { PrefabName } from "../kit/Prefabs";

/**
 * LEVEL 1 - "Dustline Checkpoint": an abandoned checkpoint / industrial outpost, 35 x 50 m.
 *
 * Orientation: the camera looks towards -Z, so the player progresses "up the screen" from the
 * south edge (z = +25) to the north edge (z = -25). Screen right is +X.
 *
 *   z -25  +------------- road blocked: barriers, crates, fence ---------------+  NORTH
 *          |  OPEN COMBAT AREA (~35 x 18 m): the road runs through it; sparse   |
 *          |  low cover, a ruined foundation (NW) and a pillar ruin (NE)        |
 *   z  -7  | narrow  | ruined  |       road "street"      | yard back exit  |   |
 *          | passage | house   |                          | SMALL YARD      |   |
 *          | (~3 m)  |         |                          | (concrete pad,  |   |
 *          |         |         |                          |  crates, pallets)   |
 *   z  10  +- breach -+--- brick perimeter ---[gate|gate]-guard post-- fence ----+ CHECKPOINT
 *          | (alternative route)   chicane barriers, barricades,             |
 *          |                       crates abandoned by the guard post        |
 *   z  25  +--------------- road closed with barriers --- spawn --------------+  SOUTH
 *
 * Routes from the approach to the combat area: (1) through the half-open gate and up the road,
 * (2) through the collapsed wall breach and the narrow passage, (3) through the yard and out of
 * its back exit. No dead-end maze; every space is wide enough to move around enemies.
 */

export interface LevelBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface GroundSpec {
  /** Road centreline X as a function of Z, and its half width (metres). */
  roadCentreX: (z: number) => number;
  roadHalfWidth: (z: number) => number;
  /** Poured concrete pads (opaque ground patches), axis-aligned. */
  pads: { x0: number; z0: number; x1: number; z1: number }[];
  /** Rocky ground patches (soft irregular blobs), centre and size in metres. */
  rockPatches: { x: number; z: number; w: number; d: number }[];
}

export const BOUNDS: LevelBounds = { minX: -17.5, maxX: 17.5, minZ: -25, maxZ: 25 };

/** The player starts on the road at the south end, facing north (towards the checkpoint). */
export const SPAWN = { x: 1.8, z: 21.2, yawDeg: 180 };

export const GROUND_SPEC: GroundSpec = {
  // A gentle S: straight through the checkpoint gate (x = 0 at z = 10), drifting either side.
  roadCentreX: (z) => 2.2 * Math.sin((z - 10) * 0.085),
  // ~6.8 m wide with an uneven edge; the edge itself is further broken up by the ground's mask.
  roadHalfWidth: (z) => 3.4 + 0.35 * Math.sin(z * 0.37) + 0.2 * Math.sin(z * 0.91 + 1),
  // The yard behind the checkpoint has a cracked concrete floor.
  pads: [{ x0: 4.9, z0: -3.9, x1: 17.6, z1: 9.9 }],
  // Rocky ground where nobody drove: the approach flanks, the combat area's ruined corners and
  // the land outside the fences.
  rockPatches: [
    { x: -12.5, z: 17.5, w: 10, d: 10 },
    { x: 13.0, z: 20.5, w: 9, d: 8 },
    { x: 12.5, z: -19.0, w: 11, d: 10 },
    { x: -11.5, z: -17.0, w: 12, d: 9 },
    { x: -24.0, z: 4.0, w: 14, d: 26 },
    { x: 24.0, z: -12.0, w: 14, d: 26 },
    { x: 2.0, z: -32.0, w: 26, d: 12 },
  ],
};

/** [prefab, x, z, yaw degrees] */
type Placement = [PrefabName, number, number, number];

// ------------------------------------------------------------------ south: approach
const APPROACH: Placement[] = [
  // Road closed behind the player.
  ["barrierLarge", 0.4, 24.4, 0],
  ["barrierLarge", 3.5, 24.5, 4],
  ["blockSmall", -1.9, 24.7, 12],
  // Chicane in front of the gate: vehicles had to slow down and weave.
  ["barrierLarge", -1.6, 14.8, 0],
  ["barrierLarge", 2.5, 17.6, 0],
  // Barricades dragged to the road edges.
  ["metalBarricade", -4.9, 16.6, 25],
  ["plankBarricade", 6.9, 20.4, -15],
  ["blockSmall", -4.0, 19.9, 20],
  ["blockSmall", 6.1, 22.9, -8],
  // Guard post beside the gate, supplies abandoned in front of it.
  ["guardPost", 4.6, 12.1, 0],
  ["crateStack", 5.7, 16.3, 12],
  ["crate", 7.3, 14.7, -20],
  ["palletCrate", 8.4, 16.4, 30],
  ["pallet", 7.2, 17.9, -8],
  // West approach: remains of an older structure, and rubble spilled out of the breach.
  ["pillarBroken", -14.3, 19.8, 0],
  ["wallLow", -11.8, 21.6, 75],
  ["slabBroken", -9.6, 17.6, 30],
  ["rubble", -13.9, 12.0, 0],
  ["rubbleSmall", -10.6, 13.6, 0],
];

// ------------------------------------------------------------------ z = 10: checkpoint line
const CHECKPOINT: Placement[] = [
  // Two gates across the road: the west one hangs open, the east one is shut.
  ["metalGateOpen", -1.35, 10, 0],
  ["metalGate", 1.35, 10, 0],
  // The breach in the perimeter wall, lined up with the narrow passage behind it.
  ["wallCollapsed", -13.9, 10, 0],
];

// ------------------------------------------------------------------ behind the checkpoint
const YARD: Placement[] = [
  // West side (towards the road): panels with a 3 m entrance between z 3.9 and 6.9.
  ["metalPanel", 4.8, 8.4, 90],
  ["metalPanel", 4.8, 2.4, 90],
  ["metalPanel", 4.8, -0.6, 90],
  ["wallCorner", 4.8, -4.0, 0],
  // North side: wall broken down towards the back exit (x 15..17.3).
  ["wallBroken", 13.0, -4.0, 0],
  ["rubble", 15.6, -3.1, 0],
  // Contents: supplies near the entrance, stacks along the walls, the middle kept open.
  ["crateStack", 7.9, 6.9, 8],
  ["palletCrate", 9.9, 8.3, -12],
  ["pallet", 6.9, 4.6, 20],
  ["palletStack", 15.9, 8.4, 6],
  ["crate", 14.5, 8.5, 14],
  ["crate", 15.7, 6.9, -22],
  ["metalBarricade", 11.6, 2.4, 35],
  ["crateStack", 13.6, -2.2, 2],
  ["rubbleSmall", 9.2, -3.0, 0],
];

const RUINED_HOUSE: Placement[] = [
  // Road-facing side partly collapsed, the roof fallen inside.
  ["wallBroken", -7.4, -2.0, 90],
  ["slabBroken", -9.7, 1.8, 70],
  ["pillarBroken", -9.8, -4.3, 0],
  ["rubble", -9.3, -1.2, 0],
  ["rubble", -6.3, -3.1, 0],
  // Small plaza between the perimeter wall and the house.
  ["crate", -9.0, 8.1, 18],
  ["pallet", -10.4, 7.6, -10],
];

// ------------------------------------------------------------------ north: open combat area
const COMBAT: Placement[] = [
  // Sparse low cover, spread out so there is room to move around enemies.
  ["wallLow", -8.4, -13.2, 15],
  ["wallLow", 8.8, -15.6, -10],
  ["barrierLarge", 4.2, -11.2, 60],
  ["slabBroken", -3.6, -17.2, 25],
  ["blockSmall", -0.8, -10.4, 10],
  ["blockSmall", 6.6, -20.2, -15],
  ["blockSmall", -6.6, -19.8, 30],
  // NE: pillars of a destroyed building.
  ["pillar", 11.6, -19.4, 0],
  ["pillarBroken", 14.8, -19.6, 0],
  ["pillar", 11.6, -22.8, 0],
  ["rubble", 13.3, -21.2, 0],
  // NW: foundation of a collapsed building.
  ["wallCorner", -15.6, -21.6, 0],
  ["wallBroken", -11.6, -21.6, 0],
  ["rubble", -12.8, -19.8, 0],
  ["rubbleSmall", -14.4, -17.6, 0],
  // Roadblock at the north end, with the crates it was protecting.
  ["barrierLarge", -2.4, -23.2, 0],
  ["barrierLarge", 0.9, -23.7, 6],
  ["metalBarricade", 3.9, -22.9, -20],
  ["plankBarricade", -5.9, -22.8, 15],
  ["crateStack", 1.6, -20.6, -8],
  ["pallet", 3.4, -19.9, 25],
];

/** Builds the whole level under one root entity (static, batched, collidable). */
export function buildCheckpointLevel(kit: EnvironmentKit): Entity {
  const root = new Entity("CheckpointLevel");
  const place = (list: Placement[]) => { for (const [name, x, z, yaw] of list) kit.spawn(name, x, z, yaw, root); };

  // Perimeter line at z = 10: brick wall west of the gates (with the breach), fence east of them.
  wallRun(kit, root, -2.85, 10, -11.9, 10, { postA: true, postB: true });
  wallRun(kit, root, -15.9, 10, -18.2, 10, { postA: true });
  fenceRun(kit, root, 2.85, 10, 17.8, 10);
  place(CHECKPOINT);

  // Narrow passage: warehouse wall on the west, the ruined house on the east (~2.9 m clear).
  wallRun(kit, root, -15.6, 9.8, -15.6, 3.0, { postB: true });
  wallRun(kit, root, -15.6, 3.0, -15.6, -3.5, { postB: true });
  wallRun(kit, root, -15.6, -3.5, -15.6, -7.4, { postB: true });
  // Close the strip behind the warehouse wall so it cannot become a dead-end pocket.
  wallRun(kit, root, -15.6, -7.4, -17.8, -7.4);
  // Ruined house (x -12.2..-7.4, z -7..6); its road side is broken (see RUINED_HOUSE).
  wallRun(kit, root, -12.2, 6.0, -12.2, -7.0, { postA: true, postB: true });
  wallRun(kit, root, -12.2, 6.0, -7.4, 6.0, { postB: true });
  wallRun(kit, root, -12.2, -7.0, -7.4, -7.0, { postB: true });
  wallRun(kit, root, -7.4, 6.0, -7.4, 0.0);
  wallRun(kit, root, -7.4, -4.0, -7.4, -7.0);
  place(RUINED_HOUSE);

  // Yard: east side fenced along the map edge up to the back exit.
  fenceRun(kit, root, 17.3, 9.9, 17.3, -1.0);
  wallRun(kit, root, 6.8, -4.0, 11.0, -4.0);
  place(YARD);

  place(APPROACH);
  place(COMBAT);

  // Outer boundary: fences around the combat area, curbs along the approach.
  fenceRun(kit, root, -17.3, -7.4, -17.3, -25.2);
  fenceRun(kit, root, 17.3, -4.2, 17.3, -25.2);
  fenceRun(kit, root, -17.3, -25.2, 17.3, -25.2);
  for (let z = 12; z <= 24; z += 4) {
    kit.spawn("curb", -17.9, z, 90, root);
    kit.spawn("curb", 17.9, z, 90, root);
  }
  for (let x = -16; x <= 16; x += 4) kit.spawn("curb", x, 25.9, 0, root);

  // Invisible walls exactly on the map edge, so nothing can slip between boundary pieces.
  const edge = (x: number, z: number, width: number, depth: number) => kit.solid(root, { kind: "box", width, depth }, x, z);
  const { minX, maxX, minZ, maxZ } = BOUNDS;
  edge((minX + maxX) / 2, minZ - 0.5, maxX - minX + 2, 1);
  edge((minX + maxX) / 2, maxZ + 0.5, maxX - minX + 2, 1);
  edge(minX - 0.5, (minZ + maxZ) / 2, 1, maxZ - minZ + 2);
  edge(maxX + 0.5, (minZ + maxZ) / 2, 1, maxZ - minZ + 2);

  return root;
}
