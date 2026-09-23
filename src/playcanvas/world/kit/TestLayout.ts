import { Entity } from "playcanvas";
import { PLAYER } from "../../config";
import type { EnvironmentKit } from "./EnvironmentKit";
import type { PrefabName } from "./Prefabs";

/** [prefab, x, z, yaw°]. The hero spawns at (0, 0) and the camera looks towards -Z. */
type Placement = [PrefabName, number, number, number];

/**
 * Small environment-kit test composition around the spawn point. It exercises every prefab on the
 * three ground zones (rock at the top, road in the middle, steel deck bottom-right) while keeping a
 * clear ring around the hero. Not a level; later levels place the same prefabs from data like this.
 */
const PLACEMENTS: Placement[] = [
  // Brick compound to the upper-left: corner, straight run and a finished end.
  ["wallCorner", -6.8, -3.2, 0],
  ["wallStraight", -2.85, -3.2, 0],
  ["wallEnd", -6.8, -0.2, -90],
  ["wallShort", 7.6, -4.4, 0],

  // Broken wall and debris out on the rocks.
  ["wallBroken", 3.4, -7.8, 0],
  ["rubble", 6.1, -6.9, 0],
  ["slabBroken", 0.4, -6.4, 15],

  // Concrete cover along the road.
  ["barrierLarge", 2.9, -2.1, -14],
  ["blockSmall", 4.6, -1.1, 20],
  ["blockSmall", 5.3, -2.3, -8],
  ["pillar", -3.6, 3.6, 0],
  ["pillar", -3.6, 7.2, 0],
  ["wallLow", -3.6, 5.4, 90],

  // Wood between the pillars and the deck.
  ["plankBarricade", -1.2, 8.4, 8],

  // Metal: gate and fences along the deck's top edge, a panel wall on its right, a barricade by the road.
  ["metalGate", 5.3, 2.55, 0],
  ["fence", 8.1, 2.55, 0],
  ["fence", 11.1, 2.55, 0],
  ["metalPanel", 14.2, 5.6, 90],
  ["metalBarricade", 1.6, 5.4, -20],

  // Crates and pallets on the deck.
  ["crate", 8.2, 6.3, 12],
  ["crate", 9.3, 6.0, -6],
  ["pallet", 10.9, 7.6, 18],
  ["pallet", 7.6, 8.2, -30],
];

export function buildTestLayout(kit: EnvironmentKit): Entity {
  const root = new Entity("KitTestLayout");
  for (const [name, x, z, yaw] of PLACEMENTS) kit.spawn(name, x, z, yaw, root);
  // A third crate stacked on the first two.
  kit.spawn("crate", 8.75, 6.15, 30, root).setLocalPosition(8.75, 1.0, 6.15);

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
