import { Entity } from "playcanvas";
import { HELL, HELL_LIGHTING } from "../../config";
import type { AmbientEmitter } from "../AmbientFx";
import { declareCollider } from "../collision/CollisionWorld";
import type { GroundSpec } from "../Ground";
import type { LavaPool } from "../Lava";
import type { ModelKit, SpawnOptions } from "../props/ModelKit";
import { HELL_MODELS, type HellModel } from "../props/HellKit";
import type { Biome, LevelBounds } from "./Biome";

/**
 * CHAPTER 3 - "The Pit", after the Inferno World renders: three basalt islands standing out of a
 * sea of lava, joined by stone bridges with fire towers. Built from Inferno World (basalt plateaus
 * for the cliff sides, crags, braziers, the ritual platform, the knight statue and tower) and the
 * SHS Dungeon Pack (bridge walls, gates, altars, torture gear). 48 x 80 m playable.
 *
 * The ground is at y = 0 on the islands only; the lava sea lies LAVA_Y below, seen in the chasms
 * and all round. Chasms block walking (low colliders), not bullets.
 *
 *   z -40  ~~~~~~~~~ lava: the knight statue, towers and crags beyond ~~~~~~~~~~~~  NORTH
 *          |  NORTH ISLAND - throne of the pit (boss arena)                      |
 *   z -20  ~~~~~~~~~~[bridge]~~~~~~~~ chasm ~~~~~~~~~~~~[bridge]~~~~~~~~~~~~~~~~~~
 *   z -13  |  MIDDLE ISLAND - torture pens | summoning circle | the hoard         |
 *          |                                  (runs start south of the circle)   |
 *   z  13  ~~~~~~~~~~~~~~~~~~~~~~[ BRIDGE ]~~~~~~~~ chasm ~~~~~~~[bridge]~~~~~~~~~~
 *   z  21  |  SOUTH ISLAND - the arrival: path, spikes, bones                    |
 *   z  40  ~~~~~~~~~~~~~~~~~~~~~~~~ lava ~~~~~~~~~~~~ spawn ~~~~~~~~~~~~~~~~~~~~~~~  SOUTH
 */

export const BOUNDS: LevelBounds = { minX: -23.4, maxX: 23.4, minZ: -39.4, maxZ: 39.4 };

/** The hero arrives on the south island, facing north. */
export const SPAWN = { x: 0, z: 33, yawDeg: 180 };

/** Every wave starts on the middle island, south of the summoning circle. */
export const RUN_START = { x: 0, z: 7.5, yawDeg: 180 };

/** Height of the lava sea below the islands (the plateau cliffs are this tall). */
const LAVA_Y = -2.3;

type Rect = { x0: number; z0: number; x1: number; z1: number };
const ISLANDS: Rect[] = [
  { x0: -24, z0: 21, x1: 24, z1: 40 },
  { x0: -24, z0: -13, x1: 24, z1: 13 },
  { x0: -24, z0: -40, x1: 24, z1: -20 },
];
/** Bridges across the chasms: [x centre, deck width, chasm]. */
const BRIDGES: { x: number; width: number; z0: number; z1: number }[] = [
  { x: 0, width: 6, z0: 13, z1: 21 },
  { x: 15, width: 4, z0: 13, z1: 21 },
  { x: -11, width: 4.4, z0: -20, z1: -13 },
  { x: 11, width: 4.4, z0: -20, z1: -13 },
];
const SIGIL = { x: 0, z: -3, radius: 4.8 };

const FIRE: [number, number, number] = [1, 0.45, 0.12];
const HOT: [number, number, number] = [1, 0.32, 0.08];
const BLOOD: [number, number, number] = [1, 0.12, 0.04];

/** Fire towers at the bridge corners (on the islands). */
const TOWERS: [number, number][] = BRIDGES.flatMap((b) => [
  [b.x - b.width / 2 - 0.9, b.z0 - 0.9], [b.x + b.width / 2 + 0.9, b.z0 - 0.9],
  [b.x - b.width / 2 - 0.9, b.z1 + 0.9], [b.x + b.width / 2 + 0.9, b.z1 + 0.9],
]);
/** Braziers at the five star points of the summoning circle (one pointing north). */
const STAR: [number, number][] = [0, 1, 2, 3, 4].map((i) => {
  const a = (i * 72 * Math.PI) / 180;
  return [SIGIL.x + Math.sin(a) * (SIGIL.radius + 0.7), SIGIL.z - Math.cos(a) * (SIGIL.radius + 0.7)];
});
/** Free-standing braziers: the arrival path and the throne. */
const BRAZIERS: [number, number][] = [
  [-3.4, 30], [3.4, 30], [-3.4, 24.5], [3.4, 24.5],
  [-5, -30], [5, -30], [-2.8, -35.5], [2.8, -35.5],
];

const LAVA: LavaPool[] = [{ x: 0, z: 0, w: 260, d: 260, y: LAVA_Y }];

export const AMBIENT: AmbientEmitter[] = [
  // The summoning circle: a molten pentagram, pulsing, embers rising off it.
  { kind: "sigil", x: SIGIL.x, y: 0.06, z: SIGIL.z, size: [SIGIL.radius * 2.05, SIGIL.radius * 2.05], color: [1, 0.55, 0.2], intensity: 1.4, pulse: 0.3 },
  { kind: "glow", x: SIGIL.x, z: SIGIL.z, size: [16, 16], color: FIRE, intensity: 0.45 },
  { kind: "embers", x: SIGIL.x, y: 0.3, z: SIGIL.z, size: [4, 4], intensity: 0.8 },
  // Fire light: towers, star braziers, free braziers.
  // (One pool per bridge head covers its two towers: fewer draw calls.)
  ...BRIDGES.flatMap((b): AmbientEmitter[] => [b.z0 - 0.9, b.z1 + 0.9].map((z) => ({ kind: "glow", x: b.x, z, size: [b.width + 5, 5], color: FIRE, intensity: 0.4 }))),
  ...[...STAR, ...BRAZIERS].map(([x, z]): AmbientEmitter => ({ kind: "glow", x, z, size: [5.5, 5.5], color: FIRE, intensity: 0.4 })),
  ...TOWERS.filter((_, i) => i % 3 === 0).map(([x, z], i): AmbientEmitter => ({ kind: "sparks", x, y: 3.4, z, every: 4 + (i % 3) })),
  // Lava light spilling over every cliff edge, embers rising out of the chasms.
  ...[13, 21, -13, -20].map((z): AmbientEmitter => ({ kind: "glow", x: 0, z: z + (z === 21 || z === -13 ? 1 : -1), size: [56, 3.2], color: HOT, intensity: 0.3 })),
  { kind: "glow", x: 0, z: 39, size: [56, 3.2], color: HOT, intensity: 0.3 },
  { kind: "glow", x: 0, z: -39, size: [56, 3.2], color: HOT, intensity: 0.3 },
  { kind: "glow", x: -23, z: 0, size: [3.2, 84], color: HOT, intensity: 0.25 },
  { kind: "glow", x: 23, z: 0, size: [3.2, 84], color: HOT, intensity: 0.25 },
  { kind: "embers", x: -10, y: LAVA_Y + 0.3, z: 17, size: [12, 3], intensity: 1 },
  { kind: "embers", x: 10, y: LAVA_Y + 0.3, z: 17, size: [10, 3], intensity: 0.8 },
  { kind: "embers", x: 0, y: LAVA_Y + 0.3, z: -16.5, size: [16, 3], intensity: 1 },
  { kind: "embers", x: 0, y: LAVA_Y + 0.3, z: 42, size: [30, 3], intensity: 0.8 },
  { kind: "embers", x: 0, y: LAVA_Y + 0.3, z: -42, size: [30, 3], intensity: 0.8 },
  { kind: "embers", x: -26, y: LAVA_Y + 0.3, z: 0, size: [3, 40], intensity: 0.8 },
  { kind: "embers", x: 26, y: LAVA_Y + 0.3, z: 0, size: [3, 40], intensity: 0.8 },
  // The throne: a slow blood-red pulse.
  { kind: "glow", x: 0, z: -36, size: [12, 8], color: BLOOD, intensity: 0.5, pulse: 0.25 },
];

export const GROUND_SPEC: GroundSpec = {
  base: "basalt",
  areas: ISLANDS,
  pads: [
    // Flagstone: the arrival path, every bridge deck, the throne floor.
    { x0: -2.6, z0: 21, x1: 2.6, z1: 38.5, surface: "flagstone" },
    ...BRIDGES.map((b) => ({ x0: b.x - b.width / 2, z0: b.z0 - 0.02, x1: b.x + b.width / 2, z1: b.z1 + 0.02, surface: "flagstone" as const })),
    { x0: -2.6, z0: 1.8, x1: 2.6, z1: 13, surface: "flagstone" },
    { x0: -10, z0: -38.5, x1: 10, z1: -25, surface: "flagstone" },
    { x0: -2.6, z0: -25, x1: 2.6, z1: -20, surface: "flagstone" },
  ],
  patches: [
    { x: -15, z: 2, w: 12, d: 14, surface: "cinder", seed: 0 },
    { x: 15, z: -4, w: 11, d: 12, surface: "cinder", seed: 1 },
    { x: -12, z: 31, w: 12, d: 9, surface: "cinder", seed: 2 },
    { x: 14, z: -30, w: 12, d: 10, surface: "cinder", seed: 3 },
    { x: -15, z: -31, w: 11, d: 10, surface: "cinder", seed: 1 },
  ],
};

type Placement = [HellModel, number, number, number?, SpawnOptions?];

/** Deterministic RNG so rocks land in the same places on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function buildHellLevel(kit: ModelKit<HellModel>): Entity {
  const root = new Entity("HellLevel");
  const random = rng(666);

  const place = (id: HellModel, x: number, z: number, yaw = 0, options: SpawnOptions = {}) => kit.spawn(id, x, z, yaw, root, options);
  const placeAll = (list: Placement[]) => { for (const [id, x, z, yaw, options] of list) place(id, x, z, yaw ?? 0, options); };
  const lowBox = (x: number, z: number, width: number, depth: number) => {
    const e = new Entity("chasm");
    e.setLocalPosition(x, 0, z);
    root.addChild(e);
    declareCollider(e, { kind: "box", width, depth, low: true });
  };

  // ------------------------------------------------------------------ islands: cliff sides
  // Basalt plateaus under every island edge: their tops sit just below the ground and their
  // faces drop to the lava; a metre of ledge shows past the edge.
  const cliffRun = (x0: number, z0: number, x1: number, z1: number, outward: [number, number]) => {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const length = along ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const count = Math.ceil(length / 15);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const id: HellModel = random() < 0.5 ? "plateau" : "plateauLong";
      const depth = id === "plateau" ? 12.5 : 13.9, height = id === "plateau" ? 2.33 : 4.19;
      const inset = depth / 2 - 1;
      const x = x0 + (x1 - x0) * t - outward[0] * inset, z = z0 + (z1 - z0) * t - outward[1] * inset;
      const yaw = (along ? 0 : 90) + (random() < 0.5 ? 180 : 0);
      place(id, x, z, yaw, { y: LAVA_Y - 0.1, scale: [1, (-LAVA_Y + 0.06) / height, 1], noCollider: true });
    }
  };
  for (const r of ISLANDS) {
    cliffRun(r.x0, r.z0, r.x1, r.z0, [0, -1]);
    cliffRun(r.x0, r.z1, r.x1, r.z1, [0, 1]);
    cliffRun(r.x0, r.z0, r.x0, r.z1, [-1, 0]);
    cliffRun(r.x1, r.z0, r.x1, r.z1, [1, 0]);
  }
  // Chasms (low colliders between the bridges).
  const chasm = (z0: number, z1: number) => {
    const decks = BRIDGES.filter((b) => b.z0 === z0).sort((a, b) => a.x - b.x);
    let x = -24;
    for (const b of [...decks, { x: 24 + 1e-3, width: 0 }]) {
      const end = b.x - b.width / 2;
      if (end > x) lowBox((x + end) / 2, (z0 + z1) / 2, end - x, z1 - z0);
      x = b.x + b.width / 2;
    }
  };
  chasm(13, 21);
  chasm(-20, -13);

  // ------------------------------------------------------------------ bridges and fire towers
  // Each side is a line of stone walls standing in the lava and rising into a parapet.
  for (const b of BRIDGES) {
    for (const side of [-1, 1]) {
      const x = b.x + side * (b.width / 2 + 0.17);
      const count = Math.round((b.z1 - b.z0) / 2);
      const step = (b.z1 - b.z0) / count;
      for (let i = 0; i < count; i++) {
        place(i % 2 ? "wallWindow" : "wall", x, b.z0 + step * (i + 0.5), side > 0 ? 90 : -90, { y: LAVA_Y - 0.2, scale: [step / 2, (-LAVA_Y + 1.1) / 3, 1] });
      }
    }
  }
  for (const [x, z] of TOWERS) {
    place("column", x, z, random() * 360, { scale: [0.75, 0.62, 0.75] });
    place("brazier", x, z, 0, { y: 2.5, noCollider: true });
  }

  // ------------------------------------------------------------------ in the lava: spikes, statue, towers
  const lavaRock = (x: number, z: number, big: boolean) =>
    place(big ? "cragBig" : random() < 0.5 ? "crag" : "rockMid2", x, z, random() * 360, { y: LAVA_Y - (big ? 1.5 : 0.6), scale: (big ? 0.7 : 0.8) + random() * 0.5, noCollider: true });
  for (let i = 0; i < 30; i++) {
    const side = i % 4, t = random() * 2 - 1, out = 5 + random() * 9;
    const [x, z] = side === 0 ? [t * 32, -40 - out] : side === 1 ? [t * 32, 40 + out] : side === 2 ? [-24 - out, t * 44] : [24 + out, t * 44];
    lavaRock(x, z, random() < 0.35);
  }
  for (const [x, z] of [[-19, 17.5], [-8, 16.2], [7.5, 18], [21.5, 16.5], [-19.5, -16.5], [-3.5, -17.8], [4, -15.5], [20, -17]]) {
    place(random() < 0.5 ? "rockSmall1" : "rockMid3", x, z, random() * 360, { y: LAVA_Y - 0.4, scale: 0.6 + random() * 0.3, noCollider: true });
  }
  place("statue", 0, -55, 0, { y: LAVA_Y, noCollider: true });
  place("tower", -21, -50, 20, { y: LAVA_Y, noCollider: true });
  place("tower", 24, -57, -40, { y: LAVA_Y, scale: 0.85, noCollider: true });

  // ------------------------------------------------------------------ SOUTH ISLAND: the arrival (z 21..40)
  placeAll([
    ["crag", -9, 34.5, 30, { scale: 0.75 }], ["cragBig", -20.5, 27, 70, { scale: 0.45, y: -1 }], ["crag", 18.5, 34, 200, { scale: 0.8 }],
    ["rockMid3", 13, 25.5, 20, { scale: 0.7 }], ["rockSmall1", -14.5, 24, 0], ["rockSmall2", 8.5, 36.5, 60],
    ["boneRib", -6.5, 27.5, 20, { tiltZ: -14 }], ["boneRib2", 7.5, 29.5, -30, { tiltZ: 10 }], ["boneHorn", -12.5, 29.5, 60, { tiltZ: 12 }],
    ["skeleton", 1.8, 27.2, 40], ["bones1", -1.8, 35.8, 0], ["bones3", 5.2, 33.4, 70], ["skull", -4.6, 31.8, 20],
    ["columnBroken", 11, 30.5, 80], ["columnStump", -16, 36, 0],
  ]);

  // ------------------------------------------------------------------ MIDDLE ISLAND (z 13..-13)
  // The summoning circle.
  place("circlePlatform", SIGIL.x, SIGIL.z, 0, { y: -1.9, noCollider: true });
  for (const [x, z] of STAR) place("brazier", x, z);
  // West: torture pens.
  wallRunLine(place, -24, 9.5, -14, 9.5, ["wall", "wallBump", "", "wall", "wallWindow"]);
  placeAll([
    ["cage", -20.5, 6.5, 15], ["cage", -17, 6.8, -10], ["skeleton", -22.2, 3.8, 80], ["chain", -23.2, 6, 0, { y: 0.9 }],
    ["rack", -19.5, -1.5, 25], ["spikeWheel", -13.5, -6.5, 70], ["stockade", -21.8, -6, 90], ["stockade", -21.8, -8, 90],
    ["cross", -16, -10.5, 10], ["table", -12.5, 1, 35], ["barrel", -11.4, 2.6], ["barrel", -12, 3.3],
    ["bones1", -15.4, 3, 0], ["puddleA", -18, -4, 0, { scale: 1.8 }], ["puddleA", -14.2, -1.6, 70],
  ]);
  // East: a ruined gate before the hoard.
  placeAll([
    ["gateArch", 13, -1, 90, { scale: [1.4, 1.15, 1] }], ["pillar", 13, 2.4, 0, { scale: [0.9, 0.8, 0.9] }], ["pillar", 13, -4.4, 0, { scale: [0.9, 0.8, 0.9] }],
    ["chest", 21.6, -2, -90], ["goldBig", 21, 1.2, 30], ["goldSmall", 19.6, -4.8, 0], ["goldSmall", 22.6, 3.8, 60],
    ["vase", 22.4, -7.2], ["vase2", 21.6, -8.2], ["crate", 22.6, 6.8, 10], ["brazierLow", 18.5, 1.6, 0],
    ["crag", 20.5, 10.6, 120, { scale: 0.7 }], ["cragBig", 22.5, -11, 30, { scale: 0.4, y: -1 }],
    ["columnBroken", 9, 9, 200], ["column", -9, 9.5, 0, { scale: [0.8, 0.8, 0.8] }], ["columnStump", 8.4, -10.5, 0],
    ["boneRib", 5.5, -10.5, 50, { tiltZ: 8 }], ["skeleton", -6.2, 4.4, 20], ["skull", 5.4, 5.6, -40],
  ]);

  // ------------------------------------------------------------------ NORTH ISLAND: throne of the pit (z -20..-40)
  placeAll([
    ["pedestal", 0, -37.4, 0, { scale: [2.2, 1, 1.5] }], ["throne", 0, -37.8, 0, { y: 0.54, noCollider: true }],
    ["pillar", -5, -38.6, 0], ["pillar", 5, -38.6, 0], ["pillar", -11, -38.6, 0], ["pillar", 11, -38.6, 0],
    ["column", -13, -28, 0], ["column", 13, -28, 0],
    ["crag", -20, -35, 60, { scale: 0.8 }], ["crag", 20.5, -34, 150, { scale: 0.85 }], ["cragBig", -21.5, -25, 20, { scale: 0.4, y: -1 }],
    ["axe", 17, -24.5, 25, { tiltZ: 14, y: -2.2 }], ["gear", -17, -29.5, 60, { tiltX: 72, y: 0.4 }],
    ["skeleton", -2.6, -33.5, 30], ["bones1", 2.8, -33, 0], ["puddleA", 0, -32, 0, { scale: 2 }],
    ["cage", -8.5, -38, 20], ["cage", 8.5, -38, -20], ["chainHang", 0, -39.3, 0, { y: 3.1, scale: [3, 1.2, 1.2] }],
    ["boneHorn", 9, -23, -60, { tiltZ: 10 }],
  ]);
  for (const [x, z] of BRAZIERS) place("brazier", x, z);

  // ------------------------------------------------------------------ scatter
  // Walk-over rubble, stones and bones everywhere, plus a few basalt blocks as cover; kept off the
  // paths, the summoning circle, the run start and the bridge heads.
  const clear = (x: number, z: number, pad: number) =>
    Math.abs(x) < 3.5 + pad ||
    Math.hypot(x - SIGIL.x, z - SIGIL.z) < SIGIL.radius + 1.6 + pad ||
    Math.hypot(x - RUN_START.x, z - RUN_START.z) < 4 + pad ||
    BRIDGES.some((b) => Math.abs(x - b.x) < b.width / 2 + 2 + pad && (Math.abs(z - b.z0) < 3 + pad || Math.abs(z - b.z1) < 3 + pad));
  const scatter = (ids: HellModel[], count: number, pad: number, options: () => SpawnOptions) => {
    for (let n = 0, tries = 0; n < count && tries < count * 20; tries++) {
      const island = ISLANDS[Math.floor(random() * ISLANDS.length)];
      const x = island.x0 + 1.5 + random() * (island.x1 - island.x0 - 3), z = island.z0 + 1.5 + random() * (island.z1 - island.z0 - 3);
      if (clear(x, z, pad)) continue;
      place(ids[Math.floor(random() * ids.length)], x, z, random() * 360, options());
      n++;
    }
  };
  scatter(["stoneSmall1", "stoneSmall2", "rubble", "mound", "skull", "bones2", "puddleC"], 70, 0, () => ({ scale: 0.7 + random() * 0.7, y: -0.05 }));
  scatter(["rockSmall1", "rockSmall2", "rockSmall3", "columnStump"], 14, 1.2, () => ({ scale: 0.7 + random() * 0.4 }));

  // Invisible walls exactly on the playable edge (the lava is beyond them).
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

/** 2 m stone wall modules along a->b (cut down to 2.4 m); "" leaves a gap. */
function wallRunLine(place: (id: HellModel, x: number, z: number, yaw?: number, o?: SpawnOptions) => unknown, ax: number, az: number, bx: number, bz: number, pattern: (HellModel | "")[]): void {
  const length = Math.hypot(bx - ax, bz - az);
  const count = Math.max(1, Math.round(length / 2));
  const width = length / count;
  const dx = (bx - ax) / length, dz = (bz - az) / length;
  const yaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
  for (let i = 0; i < count; i++) {
    const id = pattern[i % pattern.length];
    if (id) place(id, ax + dx * width * (i + 0.5), az + dz * width * (i + 0.5), yaw, { scale: [width / 2, 0.8, 1] });
  }
}

/** Chapter 3: the pit. */
export const HELL_BIOME: Biome<HellModel> = {
  id: "hell",
  label: "The Pit",
  kit: { url: HELL.url, models: HELL_MODELS, brightness: HELL.brightness, glowIntensity: HELL.glowIntensity, batchCellMetres: HELL.batchCellMetres },
  lighting: HELL_LIGHTING,
  ground: GROUND_SPEC,
  bounds: BOUNDS,
  spawn: SPAWN,
  runStart: RUN_START,
  ambient: AMBIENT,
  lava: { url: HELL.lavaUrl, tileMetres: 12, flow: [0.003, 0.008], intensity: 1.25, pools: LAVA },
  build: buildHellLevel,
};
