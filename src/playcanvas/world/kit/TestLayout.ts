import { Entity } from "playcanvas";
import { PLAYER } from "../../config";
import type { EnvironmentKit } from "./EnvironmentKit";
import type { PrefabName } from "./Prefabs";

/** [prefab, x, z, yaw°]. The hero spawns at (0, 0) and the camera looks towards -Z. */
type Placement = [PrefabName, number, number, number];

/**
 * Gameplay / collision test area around the spawn point (the hero starts at (0, 0), the camera
 * looks towards -Z, so "up the screen" is -Z):
 * - corridor: two 8 m brick walls 2.4 m apart, up-left of spawn;
 * - corner: an L corner extended into a nook, up-right;
 * - gate + fence line closing a small yard, down-right;
 * - crate and barrier clusters to weave between, right and ahead;
 * - open area: down-left, only lined by barricades.
 * Rubble and pallets are walk-over; everything else declares a collider.
 */
const PLACEMENTS: Placement[] = [
  // Corridor (walls run along Z).
  ["wallStraight", -3.0, -3.0, 90],
  ["wallStraight", -3.0, -7.0, 90],
  ["wallStraight", -5.4, -3.0, 90],
  ["wallStraight", -5.4, -7.0, 90],

  // Corner nook: corner post at (3, -9) with arms to +X and +Z, extended both ways.
  ["wallCorner", 3.0, -9.0, 0],
  ["wallStraight", 7.05, -9.0, 0],
  ["wallEnd", 3.0, -6.0, -90],

  // Barriers and blocks between spawn and the nook.
  ["barrierLarge", 2.4, -2.6, 0],
  ["blockSmall", 5.0, -2.3, 15],
  ["blockSmall", 0.3, -4.9, -10],

  // Crate cluster to the right of spawn (third crate stacked on top).
  ["crate", 6.5, 1.0, 8],
  ["crate", 7.65, 0.85, -5],
  ["crate", 7.1, 2.15, 20],
  ["pallet", 9.3, 1.6, 12],

  // Gate + fence line closing a yard down-right, with a panel wall on its far side.
  ["metalGate", 3.0, 4.6, 0],
  ["fence", 5.85, 4.6, 0],
  ["fence", 8.85, 4.6, 0],
  ["metalPanel", 10.5, 6.2, 90],
  ["crate", 7.5, 7.5, -12],

  // Low cover between pillars on the far left.
  ["pillar", -8.4, -2.0, 0],
  ["pillar", -8.4, 1.6, 0],
  ["wallLow", -8.4, -0.2, 90],

  // Open area down-left, lined by barricades.
  ["plankBarricade", -6.8, 6.8, 20],
  ["metalBarricade", -1.6, 9.2, -15],

  // Ruins out on the rocks (decor and cover).
  ["wallBroken", 0.4, -12.4, 0],
  ["rubble", 3.2, -11.9, 0],
  ["slabBroken", -3.0, -13.0, 15],
  ["wallShort", -9.0, -10.0, 90],
];

export function buildTestLayout(kit: EnvironmentKit): Entity {
  const root = new Entity("KitTestLayout");
  for (const [name, x, z, yaw] of PLACEMENTS) kit.spawn(name, x, z, yaw, root);
  // A crate stacked on the cluster (its footprint lies inside the ones below).
  kit.spawn("crate", 7.05, 1.0, 30, root).setLocalPosition(7.05, 1.0, 1.35);

  // Arena edge from 4 m concrete curbs (was four stretched primitive boxes).
  const edge = PLAYER.arenaHalfSize + 0.8;
  const count = Math.ceil((edge * 2) / 4);
  for (let i = 0; i < count; i++) {
    const t = -edge + 2 + i * 4;
    kit.spawn("curb", t, -edge, 0, root);
    kit.spawn("curb", t, edge, 0, root);
    kit.spawn("curb", -edge, t, 90, root);
    kit.spawn("curb", edge, t, 90, root);
  }
  return root;
}
