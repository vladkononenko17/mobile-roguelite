import { Entity } from "playcanvas";
import type { EnvironmentKit } from "./EnvironmentKit";

/**
 * Prefab recipes. Each builds its parts under `root`, standing on y = 0 and centred on the origin
 * unless noted, so it can be placed with a single (x, z, yaw). Dimensions are metres and keep to a
 * rough 0.5 m grid so pieces butt together cleanly when building levels.
 *
 * Shapes are deliberately chunky and readable from the top-down camera: walls carry a concrete cap
 * (the top is what the camera sees most), and every visible edge is chamfered so it catches light.
 */

type Build = (kit: EnvironmentKit, root: Entity) => void;

/** Deterministic pseudo-random numbers so "random" rubble looks the same on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const WALL_THICKNESS = 0.36;
const CAP_HEIGHT = 0.12;

/** Brick wall body along X, centred at (cx, cz), with a concrete cap. */
function brickWall(kit: EnvironmentKit, root: Entity, length: number, height: number, cx = 0, cz = 0, thickness = WALL_THICKNESS): void {
  const bodyHeight = height - CAP_HEIGHT;
  kit.part(root, "brick", [length, bodyHeight, thickness], [cx, bodyHeight / 2, cz], { bevel: 0.03, noBottom: true });
  kit.part(root, "concrete", [length + 0.06, CAP_HEIGHT, thickness + 0.1], [cx, height - CAP_HEIGHT / 2, cz], { bevel: 0.035 });
}

/** Square concrete post with a small cap, used at wall corners and ends. */
function post(kit: EnvironmentKit, root: Entity, x: number, z: number, height: number, width = 0.52): void {
  kit.part(root, "concrete", [width, height, width], [x, height / 2, z], { bevel: 0.04, noBottom: true });
  kit.part(root, "concrete", [width + 0.1, 0.12, width + 0.1], [x, height + 0.06, z], { bevel: 0.035 });
}

/** A loose chunk of broken material lying at a random angle. */
function chunk(kit: EnvironmentKit, root: Entity, material: "concrete" | "brick", x: number, z: number, size: number, random: () => number): void {
  const w = size * (0.8 + random() * 0.5);
  const h = size * (0.45 + random() * 0.35);
  const d = size * (0.7 + random() * 0.5);
  kit.part(root, material, [w, h, d], [x, h * 0.4, z], {
    bevel: Math.min(w, h, d) * 0.18,
    rot: [(random() - 0.5) * 30, random() * 180, (random() - 0.5) * 30],
  });
}

export const PREFABS = {
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
    // Second arm: the same wall built along X under a holder turned to face +Z.
    const armZ = new Entity("armZ");
    armZ.setLocalEulerAngles(0, -90, 0);
    root.addChild(armZ);
    brickWall(kit, armZ, 1.75, 2.2, 1.125, 0);
    post(kit, root, 0, 0, 2.3);
  },
  /** 2 m wall finished with a post at its +X end. */
  wallEnd: (kit, root) => {
    brickWall(kit, root, 1.75, 2.2, -0.125, 0);
    post(kit, root, 1.0, 0, 2.3);
  },
  /** 4 m wall broken down to rubble towards its +X end: an intact capped section, then stepped
   * remains on a continuous footing. Neighbouring pieces overlap and sit at slightly different
   * depths so no chamfer seams show between them. */
  wallBroken: (kit, root) => {
    const random = rng(7);
    const t = WALL_THICKNESS;
    // Continuous footing along the whole length.
    kit.part(root, "brick", [4, 0.35, t + 0.02], [0, 0.175, 0], { bevel: 0.03, noBottom: true });
    // Intact section with its cap.
    brickWall(kit, root, 1.5, 2.2, -1.25, 0);
    // Stepped remains: [centre x, width, height].
    const steps: [number, number, number][] = [[-0.2, 0.75, 1.75], [0.45, 0.7, 1.2], [1.05, 0.65, 0.8], [1.6, 0.6, 0.5]];
    steps.forEach(([x, w, h], i) => {
      kit.part(root, "brick", [w, h, t - 0.02 * (i % 2)], [x, h / 2, (i % 2) * 0.012], { bevel: 0.04, noBottom: true });
    });
    // A cap piece that fell off, and bricks scattered in front of the breach.
    kit.part(root, "concrete", [0.9, CAP_HEIGHT, t + 0.1], [0.5, 0.07, 0.8], { bevel: 0.035, rot: [4, 28, 6] });
    for (let i = 0; i < 6; i++) chunk(kit, root, "brick", -0.2 + random() * 2.2, 0.4 + random() * 0.9, 0.28, random);
  },

  // ---------------------------------------------------------------- concrete / stone
  /** 3 m jersey-style barrier: wide foot, narrower upper section. */
  barrierLarge: (kit, root) => {
    kit.part(root, "concrete", [3, 0.36, 0.72], [0, 0.18, 0], { bevel: 0.05, noBottom: true });
    kit.part(root, "concrete", [3, 0.6, 0.4], [0, 0.36 + 0.3, 0], { bevel: 0.06 });
  },
  /** 0.9 m concrete block. */
  blockSmall: (kit, root) => {
    kit.part(root, "concrete", [0.9, 0.6, 0.9], [0, 0.3, 0], { bevel: 0.06, noBottom: true });
  },
  /** 3.2 m pillar with plinth and cap. */
  pillar: (kit, root) => {
    kit.part(root, "concrete", [0.8, 0.25, 0.8], [0, 0.125, 0], { bevel: 0.04, noBottom: true });
    kit.part(root, "concrete", [0.55, 2.75, 0.55], [0, 0.25 + 1.375, 0], { bevel: 0.04 });
    kit.part(root, "concrete", [0.75, 0.2, 0.75], [0, 3.1, 0], { bevel: 0.04 });
  },
  /** Cracked slab tipped up on a chunk of debris. */
  slabBroken: (kit, root) => {
    const random = rng(11);
    kit.part(root, "concrete", [2.2, 0.22, 1.4], [0, 0.28, 0], { bevel: 0.05, rot: [7, 0, -9] });
    kit.part(root, "concrete", [0.9, 0.2, 0.8], [1.45, 0.1, 0.35], { bevel: 0.05, rot: [0, 25, 4] });
    chunk(kit, root, "concrete", -1.2, -0.6, 0.35, random);
    chunk(kit, root, "concrete", 0.6, 0.95, 0.3, random);
  },
  /** Low rubble pile of concrete and brick chunks (~2 m across). */
  rubble: (kit, root) => {
    const random = rng(23);
    for (let i = 0; i < 9; i++) {
      const angle = random() * Math.PI * 2;
      const radius = random() * 0.9;
      chunk(kit, root, i % 3 === 0 ? "brick" : "concrete", Math.cos(angle) * radius, Math.sin(angle) * radius, 0.25 + random() * 0.35, random);
    }
  },

  // ---------------------------------------------------------------- metal
  /** 3 m painted steel wall panel between rusty posts and rails. */
  metalPanel: (kit, root) => {
    kit.part(root, "painted", [2.9, 2.0, 0.08], [0, 1.15, 0], { bevel: 0.015 });
    for (const x of [-1.5, 1.5]) kit.part(root, "rust", [0.16, 2.4, 0.16], [x, 1.2, 0], { bevel: 0.025, noBottom: true });
    for (const y of [0.12, 2.2]) kit.part(root, "rust", [3.0, 0.1, 0.14], [0, y, 0], { bevel: 0.02 });
  },
  /** 3 m rusty bar fence section. */
  fence: (kit, root) => {
    for (const x of [-1.5, 1.5]) kit.part(root, "rust", [0.12, 2.0, 0.12], [x, 1.0, 0], { bevel: 0.02, noBottom: true });
    for (const y of [0.25, 1.85]) kit.part(root, "rust", [3.0, 0.08, 0.08], [0, y, 0], { bevel: 0.012 });
    for (let i = 0; i < 11; i++) kit.part(root, "rust", [0.04, 1.75, 0.04], [-1.25 + i * 0.25, 1.05, 0], { castShadows: true });
  },
  /** Sheet-metal barricade leaning on braces, with a patched plate. */
  metalBarricade: (kit, root) => {
    kit.part(root, "rust", [2.4, 1.2, 0.06], [0, 0.66, 0], { bevel: 0.015, rot: [-12, 0, 0] });
    kit.part(root, "painted", [0.8, 0.55, 0.03], [0.55, 0.78, 0.07], { bevel: 0.01, rot: [-12, 0, 4] });
    for (const x of [-0.9, 0.9]) kit.part(root, "rust", [0.08, 1.25, 0.08], [x, 0.58, -0.32], { bevel: 0.015, rot: [28, 0, 0] });
    kit.part(root, "steel", [2.5, 0.08, 0.5], [0, 0.04, -0.12], { bevel: 0.015 });
  },
  /** 2.6 m gate: posts, framed leaf with bars, diagonal brace and a kick plate. */
  metalGate: (kit, root) => {
    for (const x of [-1.3, 1.3]) post(kit, root, x, 0, 2.2, 0.3);
    const leaf = 2.3;
    for (const y of [0.2, 1.95]) kit.part(root, "rust", [leaf, 0.1, 0.08], [0, y, 0], { bevel: 0.015 });
    for (const x of [-leaf / 2 + 0.05, leaf / 2 - 0.05]) kit.part(root, "rust", [0.1, 1.85, 0.08], [x, 1.075, 0], { bevel: 0.015 });
    for (let i = 1; i < 8; i++) kit.part(root, "rust", [0.035, 1.65, 0.035], [-leaf / 2 + i * (leaf / 8), 1.075, 0]);
    const brace = Math.hypot(leaf - 0.2, 1.65);
    kit.part(root, "rust", [brace, 0.08, 0.06], [0, 1.075, 0.02], { bevel: 0.012, rot: [0, 0, (Math.atan2(1.65, leaf - 0.2) * 180) / Math.PI] });
    kit.part(root, "painted", [leaf - 0.2, 0.55, 0.03], [0, 0.55, -0.03], { bevel: 0.01 });
  },

  // ---------------------------------------------------------------- wood
  /** 1 m crate: plank box with edge battens. */
  crate: (kit, root) => {
    const s = 1.0;
    const h = s / 2;
    kit.part(root, "planks", [s - 0.06, s - 0.06, s - 0.06], [0, h, 0], { bevel: 0.02 });
    const b = 0.1;
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      kit.part(root, "planks", [b, s, b], [x * (h - b / 2), h, z * (h - b / 2)], { bevel: 0.015 });
    }
    for (const y of [b / 2, s - b / 2]) {
      for (const z of [-1, 1]) kit.part(root, "planks", [s - 2 * b, b, b], [0, y, z * (h - b / 2)], { bevel: 0.015, grain: "x" });
      for (const x of [-1, 1]) kit.part(root, "planks", [b, b, s - 2 * b], [x * (h - b / 2), y, 0], { bevel: 0.015, grain: "z" });
    }
  },
  /** 1.2 x 1.0 m pallet. */
  pallet: (kit, root) => {
    for (const x of [-0.52, 0, 0.52]) kit.part(root, "planks", [0.1, 0.09, 1.0], [x, 0.07, 0], { bevel: 0.012, grain: "z" });
    for (let i = 0; i < 5; i++) kit.part(root, "planks", [1.2, 0.025, 0.14], [0, 0.1275, -0.43 + i * 0.215], { bevel: 0.006, grain: "x" });
    for (const z of [-0.43, 0, 0.43]) kit.part(root, "planks", [1.2, 0.025, 0.14], [0, 0.0125, z], { grain: "x", castShadows: false });
  },
  /** 2.4 m barricade of boards nailed across two posts. */
  plankBarricade: (kit, root) => {
    for (const x of [-1.0, 1.0]) kit.part(root, "planks", [0.14, 1.6, 0.14], [x, 0.8, 0], { bevel: 0.02, noBottom: true });
    const boards: [number, number][] = [[0.45, -4], [0.85, 3], [1.3, -2]];
    for (const [y, angle] of boards) kit.part(root, "planks", [2.5, 0.2, 0.05], [0, y, 0.1], { bevel: 0.012, grain: "x", rot: [0, 0, angle] });
    kit.part(root, "planks", [2.55, 0.2, 0.05], [0, 0.85, 0.15], { bevel: 0.012, grain: "x", rot: [0, 0, 27] });
  },

  // ---------------------------------------------------------------- level furniture
  /** Low concrete curb, 4 m long. Chain them to edge an area. */
  curb: (kit, root) => {
    kit.part(root, "concrete", [4, 0.5, 0.7], [0, 0.25, 0], { bevel: 0.06, noBottom: true });
  },
} satisfies Record<string, Build>;

export type PrefabName = keyof typeof PREFABS;
