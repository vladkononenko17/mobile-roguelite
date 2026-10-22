import type { Entity } from "playcanvas";
import type { EnvironmentKit } from "./EnvironmentKit";
import { brickWall, CAP_HEIGHT, chunk, debris, fenceSection, gateLeaf, holder, post, rng, WALL_THICKNESS } from "./parts";

/**
 * Structural environment modules: walls, concrete structures, metal structures and buildings.
 * Each builds on y = 0 centred on its origin and declares its own colliders, so a level only
 * places them (see world/level). Dimensions keep to a rough 0.5 m grid.
 */

type Build = (kit: EnvironmentKit, root: Entity) => void;

export const MODULES = {
  // ---------------------------------------------------------------- walls (brick + concrete cap)
  /** 4 m x 2.2 m straight wall. */
  wallStraight: (kit, root) => brickWall(kit, root, 4, 2.2),
  /** 2 m x 2.2 m wall. */
  wallShort: (kit, root) => brickWall(kit, root, 2, 2.2),
  /** 2.4 m x 1 m cover wall, thicker so it reads as cover. */
  wallLow: (kit, root) => brickWall(kit, root, 2.4, 1.0, 0, 0, 0.45),
  /** L corner: post at the origin, 2 m arms along +X and +Z. */
  wallCorner: (kit, root) => {
    brickWall(kit, root, 1.75, 2.2, 1.125, 0);
    brickWall(kit, holder(root, "armZ", 0, 0, -90), 1.75, 2.2, 1.125, 0);
    post(kit, root, 0, 0, 2.3);
  },
  /** 2 m wall finished with a post at its +X end. */
  wallEnd: (kit, root) => {
    brickWall(kit, root, 1.75, 2.2, -0.125, 0);
    post(kit, root, 1.0, 0, 2.3);
  },
  /** 4 m wall broken down towards its +X end; its footing still blocks along the whole length. */
  wallBroken: (kit, root) => {
    const random = rng(7);
    const t = WALL_THICKNESS;
    kit.part(root, "brick", [4, 0.35, t + 0.02], [0, 0.175, 0], { bevel: 0.03, noBottom: true });
    kit.solid(root, { kind: "box", width: 4, depth: t + 0.02 }, 0, 0);
    brickWall(kit, root, 1.5, 2.2, -1.25, 0);
    const steps: [number, number, number][] = [[-0.2, 0.75, 1.75], [0.45, 0.7, 1.2], [1.05, 0.65, 0.8], [1.6, 0.6, 0.5]];
    steps.forEach(([x, w, h], i) => {
      kit.part(root, "brick", [w, h, t - 0.02 * (i % 2)], [x, h / 2, (i % 2) * 0.012], { bevel: 0.04, noBottom: true });
    });
    kit.part(root, "concrete", [0.9, CAP_HEIGHT, t + 0.1], [0.5, 0.07, 0.8], { bevel: 0.035, rot: [4, 28, 6] });
    for (let i = 0; i < 6; i++) chunk(kit, root, "brick", -0.2 + random() * 2.2, 0.4 + random() * 0.9, 0.28, random);
  },
  /**
   * 4 m wall whose middle has collapsed into a ~1.9 m walkable breach (local x -0.9..1.0): a
   * capped stub on the left, a crumbled stub on the right, rubble spilled through the gap (rubble
   * does not block).
   */
  wallCollapsed: (kit, root) => {
    const t = WALL_THICKNESS;
    brickWall(kit, root, 0.8, 2.2, -1.6, 0);
    kit.part(root, "brick", [0.32, 1.2, t], [-1.05, 0.6, 0.01], { bevel: 0.04, noBottom: true });
    kit.solid(root, { kind: "box", width: 0.32, depth: t }, -1.05, 0);
    kit.part(root, "brick", [0.42, 0.85, t - 0.02], [1.2, 0.425, 0], { bevel: 0.04, noBottom: true });
    kit.part(root, "brick", [0.6, 1.4, t], [1.7, 0.7, 0.01], { bevel: 0.04, noBottom: true });
    kit.solid(root, { kind: "box", width: 1.0, depth: t }, 1.5, 0);
    // Fallen cap pieces and bricks spread to both sides of the breach.
    kit.part(root, "concrete", [1.1, CAP_HEIGHT, t + 0.1], [-0.1, 0.07, 0.9], { bevel: 0.035, rot: [5, 32, 8] });
    kit.part(root, "concrete", [0.8, CAP_HEIGHT, t + 0.1], [0.4, 0.07, -0.85], { bevel: 0.035, rot: [-6, -20, 4] });
    debris(kit, root, 0, 0.6, 1.2, 9, 31, 0.8);
    debris(kit, root, 0, -0.6, 0.9, 5, 37, 0.8);
  },

  // ---------------------------------------------------------------- concrete
  /** 3 m jersey-style barrier: wide foot, narrower upper section. */
  barrierLarge: (kit, root) => {
    kit.part(root, "concrete", [3, 0.36, 0.72], [0, 0.18, 0], { bevel: 0.05, noBottom: true });
    kit.part(root, "concrete", [3, 0.6, 0.4], [0, 0.36 + 0.3, 0], { bevel: 0.06 });
    kit.solid(root, { kind: "box", width: 3, depth: 0.72 }, 0, 0);
  },
  /** 3.2 m pillar with plinth and cap. */
  pillar: (kit, root) => {
    kit.part(root, "concrete", [0.8, 0.25, 0.8], [0, 0.125, 0], { bevel: 0.04, noBottom: true });
    kit.part(root, "concrete", [0.55, 2.75, 0.55], [0, 0.25 + 1.375, 0], { bevel: 0.04 });
    kit.part(root, "concrete", [0.75, 0.2, 0.75], [0, 3.1, 0], { bevel: 0.04 });
    kit.solid(root, { kind: "circle", radius: 0.42 }, 0, 0);
  },
  /** Pillar snapped off at ~1.3 m, its top lying beside it. */
  pillarBroken: (kit, root) => {
    kit.part(root, "concrete", [0.8, 0.25, 0.8], [0, 0.125, 0], { bevel: 0.04, noBottom: true });
    kit.part(root, "concrete", [0.55, 1.1, 0.55], [0, 0.25 + 0.55, 0], { bevel: 0.05 });
    kit.part(root, "concrete", [0.55, 1.5, 0.55], [0.95, 0.3, 0.4], { bevel: 0.05, rot: [90, 35, 0] });
    kit.solid(root, { kind: "circle", radius: 0.42 }, 0, 0);
    debris(kit, root, 0.3, 0.2, 0.9, 4, 41, 0);
  },
  /** Low concrete curb, 4 m long. */
  curb: (kit, root) => {
    kit.part(root, "concrete", [4, 0.5, 0.7], [0, 0.25, 0], { bevel: 0.06, noBottom: true });
    kit.solid(root, { kind: "box", width: 4, depth: 0.7 }, 0, 0);
  },

  // ---------------------------------------------------------------- metal
  /** 3 m painted steel wall panel between rusty posts and rails. */
  metalPanel: (kit, root) => {
    kit.part(root, "painted", [2.9, 2.0, 0.08], [0, 1.15, 0], { bevel: 0.015 });
    for (const x of [-1.5, 1.5]) kit.part(root, "rust", [0.16, 2.4, 0.16], [x, 1.2, 0], { bevel: 0.025, noBottom: true });
    for (const y of [0.12, 2.2]) kit.part(root, "rust", [3.0, 0.1, 0.14], [0, y, 0], { bevel: 0.02 });
    kit.solid(root, { kind: "box", width: 3.16, depth: 0.16 }, 0, 0);
  },
  /** 3 m rusty bar fence section. */
  fence: (kit, root) => fenceSection(kit, root, 3),
  /** 2.6 m gate, closed: posts and one leaf. */
  metalGate: (kit, root) => {
    for (const x of [-1.3, 1.3]) post(kit, root, x, 0, 2.2, 0.3);
    gateLeaf(kit, root, 2.3);
  },
  /** 2.6 m gate left partially open: the leaf hangs off the -X post, swung ~70 degrees to -Z. */
  metalGateOpen: (kit, root) => {
    for (const x of [-1.3, 1.3]) post(kit, root, x, 0, 2.2, 0.3);
    gateLeaf(kit, holder(root, "hinge", -1.15, 0, 70), 2.3, 1.15);
  },

  // ---------------------------------------------------------------- buildings
  /**
   * 3.2 m brick guard post with a doorway on its -X side (facing the road when placed east of
   * it). Half the roof still stands; the other half has fallen outside the +Z wall.
   */
  guardPost: (kit, root) => {
    const s = 3.2;
    const h = s / 2;
    kit.part(root, "concrete", [s + 0.4, 0.12, s + 0.4], [0, 0.06, 0], { bevel: 0.03, noBottom: true, castShadows: false });
    brickWall(kit, root, s - 0.4, 2.3, 0, -h);
    brickWall(kit, root, s - 0.4, 2.3, 0, h);
    brickWall(kit, holder(root, "back", h, 0, 90), s - 0.4, 2.3);
    // Doorway wall: two 0.9 m pieces either side of a 1.0 m opening.
    const door = holder(root, "front", -h, 0, 90);
    brickWall(kit, door, 0.9, 2.3, -0.95, 0);
    brickWall(kit, door, 0.9, 2.3, 0.95, 0);
    for (const x of [-h, h]) for (const z of [-h, h]) post(kit, root, x, z, 2.45, 0.46);
    // Remaining roof over the back half, and the fallen half leaning outside the +Z wall.
    kit.part(root, "concrete", [1.9, 0.16, s + 0.5], [0.75, 2.58, 0], { bevel: 0.03 });
    // Tilted 50 degrees about X: its inner edge rests high against the wall, its outer edge on the ground.
    kit.part(root, "concrete", [s + 0.3, 0.16, 1.9], [0.1, 0.8, h + 0.75], { bevel: 0.03, rot: [50, 0, 0] });
    kit.solid(root, { kind: "box", width: s + 0.3, depth: 1.25 }, 0.1, h + 0.75);
    debris(kit, root, -1.2, h + 1.6, 0.9, 6, 53, 0.3);
  },
} satisfies Record<string, Build>;

/**
 * Brick wall of any length from (ax, az) to (bx, bz), with optional posts at either end. For
 * level perimeters and building walls.
 */
export function wallRun(kit: EnvironmentKit, parent: Entity, ax: number, az: number, bx: number, bz: number, options: { height?: number; postA?: boolean; postB?: boolean } = {}): Entity {
  const length = Math.hypot(bx - ax, bz - az);
  const yaw = (Math.atan2(-(bz - az), bx - ax) * 180) / Math.PI;
  const run = holder(parent, "wallRun", (ax + bx) / 2, (az + bz) / 2, yaw);
  const height = options.height ?? 2.2;
  brickWall(kit, run, length, height);
  if (options.postA) post(kit, run, -length / 2, 0, height + 0.1);
  if (options.postB) post(kit, run, length / 2, 0, height + 0.1);
  return run;
}

/** Rusty fence of any length from (ax, az) to (bx, bz). */
export function fenceRun(kit: EnvironmentKit, parent: Entity, ax: number, az: number, bx: number, bz: number): Entity {
  const length = Math.hypot(bx - ax, bz - az);
  const yaw = (Math.atan2(-(bz - az), bx - ax) * 180) / Math.PI;
  const run = holder(parent, "fenceRun", (ax + bx) / 2, (az + bz) / 2, yaw);
  fenceSection(kit, run, length);
  return run;
}
