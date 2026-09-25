import { BLEND_ADDITIVE, Color, Entity, StandardMaterial, type AppBase } from "playcanvas";
import { HELL, HELL_LIGHTING } from "../../config";
import { HELL_LEVELS, HELL_RUN } from "../../gameplay/hellConfig";
import { pentagram, type AmbientEmitter } from "../AmbientFx";
import { declareCollider } from "../collision/CollisionWorld";
import type { GroundSpec } from "../Ground";
import type { Lava, LavaFall, LavaPool } from "../Lava";
import type { ModelKit, SpawnOptions } from "../props/ModelKit";
import { HELL_MODELS, type HellModel } from "../props/HellKit";
import type { Biome, LevelBounds, Zone } from "./Biome";

/**
 * HELL - one connected infernal world, ~60 x 380 m, crossed south to north over nine levels. Seven
 * basalt islands stand out of a lava sea (LAVA_Y below the ground), joined by walled bridges; each
 * level is fought inside one zone (its region bounds the hero, the nav grid and the spawns) and the
 * way on is sealed by a burning rune until the level is won.
 *
 *   z  154  GATES OF HELL (A)        arrival; the gate pillars and their guardian statues
 *   z  110   ~~ bridge ~~
 *   z  110  INFERNAL WASTES (B)       lava cracks, flesh growths, giant bones, cages
 *   z   54   ~~ two bridges ~~
 *   z   54  SACRIFICIAL PENTAGRAM (C)   the great summoning circle (boss 1: the Glutton)
 *   z    6   ~~ bridges ~~
 *   z   -4  LAVA CROSSING (D)          three islands, narrow and broken bridges, lava falls
 *   z  -64   ~~ bridge ~~
 *   z  -64  DEMON CITADEL (E)          outer yard | inner wall | courtyard (boss 2: the Wyrm)
 *   z -122   ~~ bridge ~~
 *   z -122  THE ABYSS (G)              ossuary of giants: ribs, gears, chains, flesh
 *   z -178   ~~ bridge ~~
 *   z -178  THRONE OF THE ARCHFIEND (F)  the final pentagram, the throne (final boss)
 *
 * The camera looks towards -Z: screen up is north. Combat surfaces stay ~70% open; the heavy detail
 * sits on the island rims, between zones and out in the lava.
 */

/** Height of the lava sea below the islands (the plateau cliffs are this tall). */
const LAVA_Y = -2.3;

type Rect = { x0: number; z0: number; x1: number; z1: number };
const ISLANDS: Record<string, Rect> = {
  gates: { x0: -22, z0: 118, x1: 22, z1: 154 },
  wastes: { x0: -30, z0: 62, x1: 30, z1: 110 },
  pentagram: { x0: -24, z0: 6, x1: 24, z1: 54 },
  d1: { x0: -26, z0: -24, x1: -4, z1: -4 },
  d2: { x0: 4, z0: -26, x1: 26, z1: -6 },
  d3: { x0: -14, z0: -56, x1: 14, z1: -34 },
  citadel: { x0: -30, z0: -114, x1: 30, z1: -64 },
  abyss: { x0: -28, z0: -170, x1: 28, z1: -122 },
  throne: { x0: -25, z0: -228, x1: 25, z1: -178 },
};

/** A walled bridge deck: `axis` z runs north-south (x centre, z0..z1), x runs east-west. */
interface Bridge { axis: "z" | "x"; c: number; width: number; a0: number; a1: number }
const BRIDGES: Bridge[] = [
  { axis: "z", c: 0, width: 6, a0: 110, a1: 118 },
  { axis: "z", c: -12, width: 5, a0: 54, a1: 62 },
  { axis: "z", c: 12, width: 5, a0: 54, a1: 62 },
  { axis: "z", c: -14, width: 4.5, a0: -4, a1: 6 },
  { axis: "z", c: 15, width: 4.5, a0: -6, a1: 6 },
  { axis: "x", c: -14, width: 4, a0: -4, a1: 4 },
  { axis: "z", c: -9, width: 4, a0: -34, a1: -24 },
  { axis: "z", c: 9, width: 4, a0: -34, a1: -26 },
  { axis: "z", c: 0, width: 5, a0: -64, a1: -56 },
  { axis: "z", c: 0, width: 6, a0: -122, a1: -114 },
  { axis: "z", c: 0, width: 6, a0: -178, a1: -170 },
];
const deckRect = (b: Bridge): Rect => b.axis === "z"
  ? { x0: b.c - b.width / 2, z0: b.a0, x1: b.c + b.width / 2, z1: b.a1 }
  : { x0: b.a0, z0: b.c - b.width / 2, x1: b.a1, z1: b.c + b.width / 2 };

/** Passages through walls inside an island (the citadel's inner gate): sealed like bridges. */
const GATES: { x: number; z: number; width: number }[] = [
  { x: 0, z: -86, width: 6 },
  // A wall of runes across the throne island: the final approach stops short of the arena.
  { x: 0, z: -196, width: 50 },
];

const SIGIL_C = { x: 0, z: 28, radius: 9.5 };
const SIGIL_F = { x: 0, z: -205, radius: 11 };

const r = (x0: number, z0: number, x1: number, z1: number): LevelBounds => ({ minX: x0, minZ: z0, maxX: x1, maxZ: z1 });
/** Each level's zone: its playable region (a little inside the islands) and where it starts. */
export const ZONES: Record<string, Zone> = {
  gates: { region: r(-21.4, 118.6, 21.4, 153.4), start: { x: 0, z: 147, yawDeg: 180 } },
  wastes: { region: r(-29.4, 62.6, 29.4, 109.4), start: { x: 0, z: 104, yawDeg: 180 } },
  pentagram: { region: r(-23.4, 6.6, 23.4, 53.4), start: { x: 0, z: 46, yawDeg: 180 } },
  crossing: { region: r(-25.4, -55.4, 25.4, -4.6), start: { x: -15, z: -9, yawDeg: 180 } },
  approach: { region: r(-29.4, -86.4, 29.4, -34.6), start: { x: 0, z: -40, yawDeg: 180 } },
  citadel: { region: r(-29.4, -113.4, 29.4, -86.6), start: { x: 0, z: -91, yawDeg: 180 } },
  abyss: { region: r(-27.4, -169.4, 27.4, -122.6), start: { x: 0, z: -128, yawDeg: 180 } },
  brink: { region: r(-27.4, -196, 27.4, -122.6), start: { x: 0, z: -160, yawDeg: 180 } },
  throne: { region: r(-24.4, -227.4, 24.4, -178.6), start: { x: 0, z: -185, yawDeg: 180 } },
};

export const BOUNDS: LevelBounds = r(-30, -228, 30, 154);
export const SPAWN = { x: 0, z: 147, yawDeg: 180 };
export const RUN_START = ZONES.gates.start;

const FIRE: [number, number, number] = [1, 0.45, 0.12];
const HOT: [number, number, number] = [1, 0.32, 0.08];
const BLOOD: [number, number, number] = [1, 0.12, 0.04];
const SOOT: [number, number, number] = [0.45, 0.38, 0.36];

/** Braziers (x, z) across the world; each gets a fire-light pool. */
const BRAZIERS: [number, number][] = [
  [-4, 142], [4, 142], [-4, 132], [4, 132], [-7, 121], [7, 121],
  [-18, 100], [18, 100], [-10, 72], [10, 72],
  ...[0, 1, 2, 3, 4].map((i): [number, number] => [SIGIL_C.x + Math.sin((i * 72 * Math.PI) / 180) * (SIGIL_C.radius + 1.3), SIGIL_C.z - Math.cos((i * 72 * Math.PI) / 180) * (SIGIL_C.radius + 1.3)]),
  [-18, -10], [18, -14], [-6, -44], [6, -44],
  [-10, -70], [10, -70], [-5, -88], [5, -88], [-20, -108], [20, -108],
  [-12, -132], [12, -132], [-20, -160], [20, -160],
  ...[0, 1, 2, 3, 4].map((i): [number, number] => [SIGIL_F.x + Math.sin((i * 72 * Math.PI) / 180) * (SIGIL_F.radius + 1.3), SIGIL_F.z - Math.cos((i * 72 * Math.PI) / 180) * (SIGIL_F.radius + 1.3)]),
];

/** Lava cracks inside the islands (soft pools; they block walking, not bullets). */
const POOLS: LavaPool[] = [
  // The sea below everything.
  { x: 0, z: -37, w: 220, d: 460, y: LAVA_Y },
  // Wastes: cracks.
  { x: -18, z: 90, w: 9, d: 6, soft: true, solid: true },
  { x: 17, z: 80, w: 8, d: 9, soft: true, solid: true },
  { x: -4, z: 70, w: 7, d: 5, soft: true, solid: true },
  // Citadel outer yard moat pieces.
  { x: -20, z: -76, w: 8, d: 6, soft: true, solid: true },
  { x: 20, z: -76, w: 8, d: 6, soft: true, solid: true },
  // Abyss: pools among the bones.
  { x: -14, z: -146, w: 9, d: 7, soft: true, solid: true },
  { x: 15, z: -140, w: 7, d: 8, soft: true, solid: true },
  { x: 2, z: -160, w: 8, d: 5, soft: true, solid: true },
];

/** Lava falls pouring off distant cliffs (scenery). */
const FALLS: LavaFall[] = [
  { x: -44, z: 40, y: 14, width: 7, height: 18, yawDeg: 90 },
  { x: 46, z: -20, y: 16, width: 8, height: 20, yawDeg: -90 },
  { x: -46, z: -100, y: 15, width: 7, height: 19, yawDeg: 90 },
  { x: 0, z: -262, y: 22, width: 16, height: 26, yawDeg: 0 },
  { x: 44, z: -190, y: 14, width: 6, height: 17, yawDeg: -90 },
];

export const AMBIENT: AmbientEmitter[] = [
  ...BRAZIERS.map(([x, z]): AmbientEmitter => ({ kind: "glow", x, z, size: [5.5, 5.5], color: FIRE, intensity: 0.4 })),
  ...BRAZIERS.filter((_, i) => i % 3 === 0).map(([x, z], i): AmbientEmitter => ({ kind: "sparks", x, y: 1.4, z, every: 4 + (i % 3) })),
  // Lava light on every island rim and embers rising out of the chasms and the sea.
  ...Object.values(ISLANDS).flatMap((isl): AmbientEmitter[] => [
    { kind: "glow", x: (isl.x0 + isl.x1) / 2, z: isl.z0 + 1, size: [isl.x1 - isl.x0 + 4, 3], color: HOT, intensity: 0.28 },
    { kind: "glow", x: (isl.x0 + isl.x1) / 2, z: isl.z1 - 1, size: [isl.x1 - isl.x0 + 4, 3], color: HOT, intensity: 0.28 },
    { kind: "embers", x: (isl.x0 + isl.x1) / 2, y: LAVA_Y + 0.3, z: isl.z0 - 3, size: [isl.x1 - isl.x0, 3], intensity: 0.8 },
    { kind: "embers", x: isl.x0 - 3, y: LAVA_Y + 0.3, z: (isl.z0 + isl.z1) / 2, size: [3, isl.z1 - isl.z0], intensity: 0.6 },
  ]),
  ...POOLS.filter((p) => p.soft).flatMap((p): AmbientEmitter[] => [
    { kind: "glow", x: p.x, z: p.z, size: [p.w * 1.5, p.d * 1.5], color: HOT, intensity: 0.5 },
    { kind: "embers", x: p.x, y: 0.2, z: p.z, size: [p.w * 0.5, p.d * 0.5], intensity: 0.8 },
    { kind: "smoke", x: p.x, y: 0.2, z: p.z, size: [2, 2], intensity: 0.35, color: SOOT },
  ]),
  // The two great pentagrams glow blood red.
  { kind: "glow", x: SIGIL_C.x, z: SIGIL_C.z, size: [26, 26], color: BLOOD, intensity: 0.35, pulse: 0.3 },
  { kind: "glow", x: SIGIL_F.x, z: SIGIL_F.z, size: [30, 30], color: BLOOD, intensity: 0.4, pulse: 0.25 },
  { kind: "embers", x: SIGIL_F.x, y: 0.3, z: SIGIL_F.z, size: [10, 10], intensity: 1 },
  // Ash drifting over the wastes and the abyss.
  { kind: "dust", x: 0, y: 1.2, z: 86, size: [24, 20], intensity: 0.7, color: [0.8, 0.6, 0.55] },
  { kind: "dust", x: 0, y: 1.2, z: -146, size: [24, 20], intensity: 0.7, color: [0.8, 0.6, 0.55] },
];

export const GROUND_SPEC: GroundSpec = {
  base: "basalt",
  areas: Object.values(ISLANDS),
  pads: [
    ...BRIDGES.map((b) => ({ ...rect(deckRect(b)), surface: "flagstone" as const })),
    // Roads of flagstone through the keep areas.
    { x0: -2.8, z0: 118, x1: 2.8, z1: 152, surface: "flagstone" },
    { x0: -26, z0: -86, x1: 26, z1: -82, surface: "flagstone" },
    { x0: -2.8, z0: -114, x1: 2.8, z1: -64, surface: "flagstone" },
    { x0: -16, z0: -112, x1: 16, z1: -92, surface: "flagstone" },
    { x0: -2.8, z0: -195, x1: 2.8, z1: -178, surface: "flagstone" },
  ],
  patches: [
    { x: -14, z: 136, w: 12, d: 10, surface: "cinder", seed: 0 },
    { x: 15, z: 128, w: 10, d: 12, surface: "cinder", seed: 1 },
    { x: -18, z: 90, w: 14, d: 11, surface: "cinder", seed: 2 },
    { x: 17, z: 80, w: 12, d: 13, surface: "cinder", seed: 3 },
    { x: 0, z: 28, w: 26, d: 26, surface: "cinder", seed: 1 },
    { x: -15, z: -14, w: 14, d: 12, surface: "ash", seed: 2 },
    { x: 15, z: -16, w: 14, d: 12, surface: "ash", seed: 3 },
    { x: 0, z: -45, w: 18, d: 14, surface: "cinder", seed: 0 },
    { x: -14, z: -146, w: 14, d: 11, surface: "cinder", seed: 1 },
    { x: 15, z: -140, w: 11, d: 12, surface: "cinder", seed: 2 },
    { x: 0, z: -205, w: 30, d: 30, surface: "cinder", seed: 3 },
  ],
};

function rect(r: Rect) {
  return { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 };
}

type Placement = [HellModel, number, number, number?, SpawnOptions?];

/** Deterministic RNG so the scatter is the same on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ------------------------------------------------------------------------------------------------
 * World state driven by the campaign: the rune seals on the way on, the arena's glow.
 * ---------------------------------------------------------------------------------------------- */

interface Seal { entity: Entity; x: number; z: number }
const world = {
  seals: [] as Seal[],
  sigils: [] as StandardMaterial[],
  lava: null as Lava | null,
  arena: 0,
  shown: 0,
  time: 0,
};

function sealMaterial(app: AppBase): StandardMaterial {
  const m = new StandardMaterial();
  m.diffuse.set(0, 0, 0);
  m.emissive = new Color(1.2, 0.18, 0.08);
  m.emissiveMap = pentagram(app);
  m.useLighting = false;
  m.blendType = BLEND_ADDITIVE;
  m.depthWrite = false;
  m.cull = 0;
  m.update();
  return m;
}

export function buildHellLevel(kit: ModelKit<HellModel>): Entity {
  const root = new Entity("HellLevel");
  const random = rng(666);
  const app = kit.app;
  world.seals = [];
  world.sigils = [];

  const place = (id: HellModel, x: number, z: number, yaw = 0, options: SpawnOptions = {}) => kit.spawn(id, x, z, yaw, root, options);
  const placeAll = (list: Placement[]) => { for (const [id, x, z, yaw, options] of list) place(id, x, z, yaw ?? 0, options); };
  const lowBox = (x: number, z: number, width: number, depth: number) => {
    const e = new Entity("rim");
    e.setLocalPosition(x, 0, z);
    root.addChild(e);
    declareCollider(e, { kind: "box", width, depth, low: true });
  };

  // ------------------------------------------------------------------ islands: cliffs and rims
  const decks = BRIDGES.map(deckRect);
  const cliffRun = (x0: number, z0: number, x1: number, z1: number, outward: [number, number]) => {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const length = along ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const count = Math.max(1, Math.ceil(length / 15));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const id: HellModel = random() < 0.5 ? "plateau" : "plateauLong";
      const depth = id === "plateau" ? 12.5 : 13.9, height = id === "plateau" ? 2.33 : 4.19;
      const inset = Math.min(depth / 2 - 1, (along ? 999 : 999));
      const x = x0 + (x1 - x0) * t - outward[0] * inset, z = z0 + (z1 - z0) * t - outward[1] * inset;
      const yaw = (along ? 0 : 90) + (random() < 0.5 ? 180 : 0);
      place(id, x, z, yaw, { y: LAVA_Y - 0.1, scale: [Math.min(1, (length / count + 2) / (id === "plateau" ? 17.7 : 24)), (-LAVA_Y + 0.06) / height, 1], noCollider: true });
    }
  };
  /** Rim colliders just outside an island edge, open where a bridge deck meets it. */
  const rim = (isl: Rect) => {
    const edge = (fixed: number, from: number, to: number, vertical: boolean, side: number) => {
      // Openings: decks touching this edge.
      const opens = decks.filter((d) => vertical
        ? (side < 0 ? Math.abs(d.x1 - fixed) < 0.01 : Math.abs(d.x0 - fixed) < 0.01) && d.z1 > from && d.z0 < to
        : (side < 0 ? Math.abs(d.z1 - fixed) < 0.01 : Math.abs(d.z0 - fixed) < 0.01) && d.x1 > from && d.x0 < to,
      ).map((d) => vertical ? [d.z0, d.z1] : [d.x0, d.x1]).sort((a, b) => a[0] - b[0]);
      let a = from - 1;
      for (const [o0, o1] of [...opens, [to + 1, to + 1]]) {
        if (o0 > a) {
          const mid = (a + o0) / 2, len = o0 - a;
          if (vertical) lowBox(fixed + side * 0.5, mid, 1, len);
          else lowBox(mid, fixed + side * 0.5, len, 1);
        }
        a = o1;
      }
    };
    edge(isl.x0, isl.z0, isl.z1, true, -1);
    edge(isl.x1, isl.z0, isl.z1, true, 1);
    edge(isl.z0, isl.x0, isl.x1, false, -1);
    edge(isl.z1, isl.x0, isl.x1, false, 1);
    cliffRun(isl.x0, isl.z0, isl.x1, isl.z0, [0, -1]);
    cliffRun(isl.x0, isl.z1, isl.x1, isl.z1, [0, 1]);
    cliffRun(isl.x0, isl.z0, isl.x0, isl.z1, [-1, 0]);
    cliffRun(isl.x1, isl.z0, isl.x1, isl.z1, [1, 0]);
  };
  for (const isl of Object.values(ISLANDS)) rim(isl);
  // Rock and basalt spikes along every rim (breaking the straight edges), clear of bridge mouths.
  const nearDeck = (x: number, z: number) => decks.some((d) => x > d.x0 - 3 && x < d.x1 + 3 && z > d.z0 - 3 && z < d.z1 + 3);
  for (const isl of Object.values(ISLANDS)) {
    const edges: [number, number, number, number][] = [[isl.x0, isl.z0, isl.x1, isl.z0], [isl.x0, isl.z1, isl.x1, isl.z1], [isl.x0, isl.z0, isl.x0, isl.z1], [isl.x1, isl.z0, isl.x1, isl.z1]];
    for (const [x0, z0, x1, z1] of edges) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (let d = 0; d <= len; d += 2.2 + random() * 2.6) {
        const t = d / len;
        const x = x0 + (x1 - x0) * t + (random() - 0.5) * 1.2, z = z0 + (z1 - z0) * t + (random() - 0.5) * 1.2;
        if (nearDeck(x, z)) continue;
        const roll = random();
        const id: HellModel = roll < 0.18 ? "crag" : roll < 0.5 ? "rockMid4" : roll < 0.75 ? "rockSmall2" : "rockSmall1";
        const k = id === "crag" ? 0.35 + random() * 0.3 : 0.6 + random() * 0.6;
        place(id, x, z, random() * 360, { y: id === "crag" ? -0.8 : -0.3, scale: k, noCollider: true });
      }
    }
  }

  // ------------------------------------------------------------------ bridges and fire towers
  for (const b of BRIDGES) {
    const len = b.a1 - b.a0;
    const count = Math.max(1, Math.round(len / 2));
    const step = len / count;
    for (const side of [-1, 1]) {
      for (let i = 0; i < count; i++) {
        const along = b.a0 + step * (i + 0.5), across = b.c + side * (b.width / 2 + 0.17);
        const [x, z] = b.axis === "z" ? [across, along] : [along, across];
        const yaw = b.axis === "z" ? (side > 0 ? 90 : -90) : (side > 0 ? 180 : 0);
        place(i % 2 ? "wallWindow" : "wall", x, z, yaw, { y: LAVA_Y - 0.2, scale: [step / 2, (-LAVA_Y + 1.1) / 3, 1] });
      }
    }
    // Fire towers at the four corners (on the islands).
    for (const end of [b.a0 - 0.9, b.a1 + 0.9]) {
      for (const side of [-1, 1]) {
        const across = b.c + side * (b.width / 2 + 0.9);
        const [x, z] = b.axis === "z" ? [across, end] : [end, across];
        place("column", x, z, random() * 360, { scale: [0.72, 0.62, 0.72] });
        place("brazier", x, z, 0, { y: 2.5, noCollider: true });
      }
    }
  }
  // Broken bridges: stubs reaching into the lava and ending in rubble (scenery).
  const broken: [number, number, number, number][] = [[26, -16, 38, -16], [-28, -150, -40, -150], [30, 86, 40, 86], [-14, -56, -14, -64]];
  for (const [x0, z0, x1, z1] of broken) {
    const len = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    const yaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
    for (let d = 1; d < len; d += 2) {
      const drop = d > len * 0.55 ? (d - len * 0.55) * 0.6 : 0;
      for (const side of [-1.8, 1.8]) {
        place(d % 4 < 2 ? "wall" : "wallWindow", x0 + dx * d - dz * side, z0 + dz * d + dx * side, yaw, { y: LAVA_Y - 0.2 - drop, scale: [1, (-LAVA_Y + 1.1) / 3, 1], noCollider: true });
      }
    }
    place("rubble", x1, z1, 0, { y: LAVA_Y + 0.1, scale: 3, noCollider: true });
    place("columnStump", x1 - dx * 1.5, z1 - dz * 1.5, 30, { y: LAVA_Y - 0.4, noCollider: true });
  }

  // ------------------------------------------------------------------ rune seals (the way on)
  const sealMat = sealMaterial(app);
  const addSeal = (x: number, z: number, width: number, yaw: number) => {
    const e = new Entity("seal");
    e.addComponent("render", { type: "plane", material: sealMat, castShadows: false, receiveShadows: false });
    e.setLocalScale(width, 1, 3.4);
    e.setLocalPosition(x, 1.7, z);
    e.setLocalEulerAngles(90, yaw, 0);
    e.enabled = false;
    root.addChild(e);
    world.seals.push({ entity: e, x, z });
  };
  for (const b of BRIDGES) {
    // One seal at each end of every bridge; a level shows those on its region's edge.
    for (const end of [b.a0, b.a1]) {
      if (b.axis === "z") addSeal(b.c, end, b.width + 0.6, 0);
      else addSeal(end, b.c, b.width + 0.6, 90);
    }
  }
  for (const g of GATES) addSeal(g.x, g.z, g.width + 0.6, 0);

  // ------------------------------------------------------------------ lava sea: spikes, statues, towers, chains
  const lavaRock = (x: number, z: number, big: boolean) =>
    place(big ? "cragBig" : random() < 0.5 ? "crag" : "rockMid2", x, z, random() * 360, { y: LAVA_Y - (big ? 1.5 : 0.6), scale: (big ? 0.7 : 0.8) + random() * 0.6, noCollider: true });
  for (let i = 0; i < 110; i++) {
    const z = 170 - random() * 420;
    const side = random() < 0.5 ? -1 : 1;
    const x = side * (34 + random() * 22);
    lavaRock(x, z, random() < 0.35);
  }
  // Rocks in the chasms between islands.
  for (const [x, z] of [[-20, 114], [16, 115], [-24, 58], [0, 58], [24, 59], [0, 0], [-24, 0], [24, -1], [0, -29], [-22, -30], [22, -31], [-18, -60], [16, -61], [-16, -118], [18, -117], [-18, -174], [18, -175]]) {
    place(random() < 0.5 ? "rockSmall1" : "rockMid3", x, z, random() * 360, { y: LAVA_Y - 0.4, scale: 0.6 + random() * 0.4, noCollider: true });
  }
  // Landmarks.
  placeAll([
    // The gate's guardian statues, knee-deep in lava either side of the gate bridge.
    ["statue", -18, 113, 20, { y: LAVA_Y, scale: 1.1, noCollider: true }],
    ["statue", 18, 113, -20, { y: LAVA_Y, scale: 1.1, noCollider: true }],
    // Towers of the citadel beyond its walls.
    ["tower", -38, -95, 30, { y: LAVA_Y, noCollider: true }],
    ["tower", 38, -92, -30, { y: LAVA_Y, scale: 0.9, noCollider: true }],
    ["tower", -30, -122, 0, { y: LAVA_Y, scale: 0.75, noCollider: true }],
    // The demon lord's colossus behind the throne, and two more towers.
    ["statue", 0, -252, 0, { y: LAVA_Y - 4, scale: 2.2, noCollider: true }],
    ["tower", -34, -236, 20, { y: LAVA_Y, scale: 1.2, noCollider: true }],
    ["tower", 34, -240, -20, { y: LAVA_Y, scale: 1.2, noCollider: true }],
    // Far silhouettes along the way.
    ["rockBig", -52, 70, 40, { y: LAVA_Y, scale: 1.4, noCollider: true }],
    ["rockBig", 55, 10, 200, { y: LAVA_Y, scale: 1.6, noCollider: true }],
    ["rockBig", -56, -40, 120, { y: LAVA_Y, scale: 1.5, noCollider: true }],
    ["rockBig", 58, -150, 70, { y: LAVA_Y, scale: 1.7, noCollider: true }],
    ["statue", 50, 60, -70, { y: LAVA_Y - 6, scale: 1.4, noCollider: true }],
  ]);
  // Giant chains rising out of the lava, and hung between towers.
  for (const [x, z, h] of [[-36, 20, 9], [38, -40, 11], [-40, -130, 10], [36, -170, 12], [-28, 96, 8]] as const) {
    place("chain", x, z, random() * 90, { y: LAVA_Y, scale: [5, h, 5], noCollider: true });
  }
  placeAll([
    ["chainHang", 0, -232, 0, { y: 9, scale: [22, 6, 6], noCollider: true }],
    ["chainHang", -30, -95, 90, { y: 7, scale: [10, 5, 5], noCollider: true }],
  ]);

  // ------------------------------------------------------------------ A: GATES OF HELL (z 118..154)
  placeAll([
    // The gate: two great pillars with fire on top and chains between them.
    ["pillar", -5.2, 119.5, 0, { scale: [1.6, 2.2, 1.6] }], ["pillar", 5.2, 119.5, 0, { scale: [1.6, 2.2, 1.6] }],
    ["brazier", -5.2, 119.5, 0, { y: 8.2, scale: 1.3, noCollider: true }], ["brazier", 5.2, 119.5, 0, { y: 8.2, scale: 1.3, noCollider: true }],
    ["chainHang", 0, 119.6, 0, { y: 6.5, scale: [7.5, 2.6, 2.6], noCollider: true }],
    ["boneHorn", -9.5, 121, -30, { tiltZ: 12 }], ["boneHorn", 9.5, 121, 210, { tiltZ: 12 }],
    // Arrival: bones and spikes.
    ["boneRib", -7, 147, 20, { tiltZ: -14 }], ["boneRib2", 7.5, 143, -30, { tiltZ: 10 }],
    ["crag", -16, 146, 30, { scale: 0.8 }], ["crag", 17, 138, 200, { scale: 0.75 }], ["cragBig", -19, 127, 70, { scale: 0.42, y: -1 }],
    ["rockMid3", 14, 150, 20, { scale: 0.7 }], ["rockSmall1", -12, 130, 0], ["rockSmall2", 11, 124, 60],
    ["cage", -14, 124, 15], ["cage", 15, 132, -20], ["skeleton", 2.2, 136, 40], ["bones1", -2, 150, 0], ["skull", -4.5, 128, 20],
  ]);

  // ------------------------------------------------------------------ B: INFERNAL WASTES (z 62..110)
  placeAll([
    // Flesh growths: the corruption spreading over the rock.
    ["fleshSpire", -22, 102, 30], ["fleshGut", 22, 99, 110], ["fleshBrain", -24, 72, 200], ["fleshClaw", 24, 70, 0],
    ["fleshStalk", -8, 92, 80], ["fleshStalk", 10, 66, 200], ["fleshClaw", 0, 84, 40, { scale: 0.7 }],
    // Giant bones and gears half buried; spikes.
    ["boneRib", -10, 104, 20, { tiltZ: -16 }], ["boneRib2", -8, 101, 5, { tiltZ: -8 }], ["boneRib", -6, 98, -15, { tiltZ: 10 }],
    ["gear", 20, 88, 40, { tiltX: 70, y: 0.4 }], ["axe", -26, 82, 30, { tiltZ: 16, y: -2.2 }],
    ["crag", 26, 106, 60, { scale: 0.8 }], ["crag", -27, 64, 150, { scale: 0.75 }], ["cragBig", 27, 76, 20, { scale: 0.4, y: -1 }],
    ["cage", 6, 106, 20], ["cage", -14, 66, -15], ["skeleton", 12, 94, 70], ["stockade", -26, 94, 90],
    ["columnBroken", 15, 104, 80], ["columnStump", -18, 78, 0],
  ]);

  // ------------------------------------------------------------------ C: SACRIFICIAL PENTAGRAM (z 6..54)
  place("circlePlatform", SIGIL_C.x, SIGIL_C.z, 0, { y: -1.92, scale: [2.05, 1, 2.05], noCollider: true });
  world.sigils.push(sigil(root, app, SIGIL_C.x, SIGIL_C.z, SIGIL_C.radius, 1.2));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = SIGIL_C.x + Math.sin(a) * 16.5, z = SIGIL_C.z + Math.cos(a) * 16.5;
    place(i % 3 === 2 ? "columnBroken" : "column", x, z, (a * 180) / Math.PI, { scale: [0.8, 0.9, 0.8] });
  }
  placeAll([
    ["altar", -4, 43, 0], ["altar", 4, 43, 0], ["cross", 0, 48.5, 0],
    ["crag", -21, 50, 60, { scale: 0.75 }], ["crag", 21.5, 9, 150, { scale: 0.8 }], ["cragBig", -22, 10, 20, { scale: 0.45, y: -1 }],
    ["cage", 20, 48, 20], ["cage", -20, 30, -20], ["skeleton", 17, 30, 60], ["boneRib", 20, 18, 30, { tiltZ: 12 }],
  ]);
  // Statues of the lords watching the circle from the lava.
  placeAll([["statue", -40, 28, 90, { y: LAVA_Y, scale: 0.9, noCollider: true }], ["statue", 40, 28, -90, { y: LAVA_Y, scale: 0.9, noCollider: true }]]);

  // ------------------------------------------------------------------ D: LAVA CROSSING (z -4..-56)
  placeAll([
    ["crag", -22, -20, 30, { scale: 0.7 }], ["fleshClaw", -24, -8, 20], ["rockMid3", -8, -20, 0, { scale: 0.6 }], ["cage", -20, -21, 0],
    ["crag", 23, -22, 60, { scale: 0.75 }], ["fleshStalk", 22, -9, 10], ["columnBroken", 8, -22, 30], ["skeleton", 14, -20, 40],
    ["boneRib", -10, -52, 20, { tiltZ: -12 }], ["boneRib2", 10, -52, -30, { tiltZ: 10 }], ["cragBig", 12, -36, 40, { scale: 0.4, y: -1 }],
    ["altar", -3, -45, 0], ["altar", 3, -45, 0],
  ]);

  // ------------------------------------------------------------------ E: DEMON CITADEL (z -64..-114)
  // Inner wall across the island at z -86 with a gate; cutaway height; towers at the ends and the gate.
  const wallLine = (ax: number, az: number, bx: number, bz: number, pattern: (HellModel | "")[], height = 0.9) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2)), w = len / n;
    const dx = (bx - ax) / len, dz = (bz - az) / len, yaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
    for (let i = 0; i < n; i++) {
      const id = pattern[i % pattern.length];
      if (id) place(id, ax + dx * w * (i + 0.5), az + dz * w * (i + 0.5), yaw, { scale: [w / 2, height, 1] });
    }
  };
  wallLine(-30, -86, -3, -86, ["wall", "wallBump", "wall", "wallWindow"]);
  wallLine(3, -86, 30, -86, ["wall", "wallWindow", "wall", "wallBump"]);
  // North wall of the citadel (the keep's face), taller.
  wallLine(-30, -114, 30, -114, ["wall", "wallWindow", "wallBump", "wall", "wallWindow", "wall"], 1.4);
  placeAll([
    ["column", -3.8, -86, 0, { scale: [0.85, 1.1, 0.85] }], ["column", 3.8, -86, 0, { scale: [0.85, 1.1, 0.85] }],
    ["brazier", -3.8, -86, 0, { y: 4.4, noCollider: true }], ["brazier", 3.8, -86, 0, { y: 4.4, noCollider: true }],
    ["column", -29, -86, 0, { scale: [1, 1.3, 1] }], ["column", 29, -86, 0, { scale: [1, 1.3, 1] }],
    ["column", -29, -113, 0, { scale: [1, 1.8, 1] }], ["column", 29, -113, 0, { scale: [1, 1.8, 1] }],
    // Outer yard: cages, racks, a spike wheel - the citadel's killing ground.
    ["rack", -14, -70, 25], ["spikeWheel", 14, -72, 70], ["cage", -26, -68, 15], ["cage", 25, -80, -20],
    ["stockade", -8, -80, 90], ["stockade", -6, -80, 90], ["crag", 26, -67, 30, { scale: 0.7 }],
    // Courtyard: the ring of pillars where the wyrm lands; a throne for its master, empty.
    ["pedestal", 0, -110, 0, { scale: [2.2, 1, 1.5] }], ["throne", 0, -110.4, 0, { y: 0.54, noCollider: true }],
    ["cage", -24, -110, 20], ["cage", 24, -110, -20], ["skeleton", -20, -96, 30], ["bones1", 18, -98, 0],
  ]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    place("pillar", Math.sin(a) * 15, -100 + Math.cos(a) * 9, 0, { scale: [0.9, 1, 0.9] });
  }

  // ------------------------------------------------------------------ G: THE ABYSS (z -122..-170)
  // An ossuary of giants: ribcages rising from the rock, gears, flesh, chains.
  for (let i = 0; i < 5; i++) {
    const z = -130 - i * 7;
    place("boneRib", -8, z, 90, { tiltZ: -18, scale: 1.3 });
    place("boneRib2", 8, z - 2, -90, { tiltZ: 18, scale: 1.3 });
  }
  placeAll([
    ["gear", -20, -130, 30, { tiltX: 72, y: 0.6, scale: 1.2 }], ["gearSmall", 20, -156, -20, { tiltX: 80, y: 0.2 }],
    ["axe", 22, -128, 20, { tiltZ: 12, y: -2.2 }], ["fleshSpire", -22, -164, 0], ["fleshGut", 22, -166, 60], ["fleshBrain", -24, -138, 30],
    ["cage", -12, -126, 15], ["cage", 12, -126, -15], ["cross", 0, -166, 0], ["crag", 25, -145, 60, { scale: 0.8 }], ["crag", -25, -154, 150, { scale: 0.75 }],
    ["skeleton", -4, -140, 40], ["skeleton", 5, -152, -20], ["bones3", 0, -134, 0],
  ]);

  // ------------------------------------------------------------------ F: THRONE OF THE ARCHFIEND (z -178..-228)
  place("circlePlatform", SIGIL_F.x, SIGIL_F.z, 0, { y: -1.92, scale: [2.4, 1, 2.4], noCollider: true });
  world.sigils.push(sigil(root, app, SIGIL_F.x, SIGIL_F.z, SIGIL_F.radius, 1.4));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = SIGIL_F.x + Math.sin(a) * 19, z = SIGIL_F.z + Math.cos(a) * 19;
    place("pillar", x, z, 0, { scale: [1.1, 1.4, 1.1] });
    place("brazier", x, z, 0, { y: 5.2, noCollider: true });
  }
  placeAll([
    ["pedestal", 0, -225.5, 0, { scale: [3, 1.4, 1.6] }], ["throne", 0, -226, 0, { y: 0.76, scale: 1.6, noCollider: true }],
    ["boneHorn", -6, -225, -20, { tiltZ: 10, scale: 1.3 }], ["boneHorn", 6, -225, 200, { tiltZ: 10, scale: 1.3 }],
    ["crag", -22, -224, 60, { scale: 0.8 }], ["crag", 22, -222, 150, { scale: 0.8 }], ["cragBig", -23, -182, 20, { scale: 0.4, y: -1 }], ["cragBig", 23, -184, 200, { scale: 0.4, y: -1 }],
  ]);

  // ------------------------------------------------------------------ scatter (walk-over detail)
  const pathsClear = (x: number, z: number) => Math.abs(x) < 3.2 || Math.hypot(x - SIGIL_C.x, z - SIGIL_C.z) < SIGIL_C.radius + 2 || Math.hypot(x - SIGIL_F.x, z - SIGIL_F.z) < SIGIL_F.radius + 2;
  for (const isl of Object.values(ISLANDS)) {
    const area = (isl.x1 - isl.x0) * (isl.z1 - isl.z0);
    const n = Math.round(area / 45);
    for (let k = 0; k < n; k++) {
      const x = isl.x0 + 1.5 + random() * (isl.x1 - isl.x0 - 3), z = isl.z0 + 1.5 + random() * (isl.z1 - isl.z0 - 3);
      if (pathsClear(x, z)) continue;
      const ids: HellModel[] = ["stoneSmall1", "stoneSmall2", "rubble", "mound", "skull", "bones2", "puddleC"];
      place(ids[Math.floor(random() * ids.length)], x, z, random() * 360, { scale: 0.7 + random() * 0.7, y: -0.05 });
    }
  }
  for (const [x, z] of BRAZIERS) place("brazier", x, z);

  return root;
}

/** A glowing pentagram decal (additive) over a ritual platform; returns its material (arena glow). */
function sigil(root: Entity, app: AppBase, x: number, z: number, radius: number, intensity: number): StandardMaterial {
  const m = new StandardMaterial();
  m.diffuse.set(0, 0, 0);
  m.emissive = new Color(1, 0.5, 0.18);
  m.emissiveMap = pentagram(app);
  m.emissiveIntensity = intensity;
  m.useLighting = false;
  m.useSkybox = false;
  m.blendType = BLEND_ADDITIVE;
  m.depthWrite = false;
  m.update();
  const e = new Entity("sigil");
  e.addComponent("render", { type: "plane", material: m, castShadows: false, receiveShadows: false });
  e.setLocalScale(radius * 2.05, 1, radius * 2.05);
  e.setLocalPosition(x, 0.06, z);
  root.addChild(e);
  return m;
}

/** Chapter 3: Hell. */
export const HELL_BIOME: Biome<HellModel> = {
  id: "hell",
  label: "Hell",
  kit: { url: HELL.url, models: HELL_MODELS, brightness: HELL.brightness, glowIntensity: HELL.glowIntensity, batchCellMetres: HELL.batchCellMetres },
  lighting: HELL_LIGHTING,
  ground: GROUND_SPEC,
  bounds: BOUNDS,
  spawn: SPAWN,
  runStart: RUN_START,
  ambient: AMBIENT,
  lava: { url: HELL.lavaUrl, tileMetres: 12, flow: [0.003, 0.008], intensity: 1.25, pools: POOLS, falls: FALLS },
  build: buildHellLevel,
  campaign: {
    levels: HELL_LEVELS,
    zones: ZONES,
    run: HELL_RUN,
    victory: { title: "HELL IS SILENT", text: "The Archfiend is dead. You were not supposed to survive this." },
    onLevel(_index, zone) {
      // Seal every way out of this level's region (bridge ends and gates on its edge).
      const region = ZONES[zone]?.region;
      for (const s of world.seals) {
        s.entity.enabled = !!region && onEdge(region, s.x, s.z);
      }
    },
    arena(intensity) {
      world.arena = intensity;
    },
    attach(lava) {
      world.lava = lava;
    },
    update(dt) {
      world.time += dt;
      world.shown += (world.arena - world.shown) * Math.min(1, dt * 1.5);
      if (world.lava) world.lava.boost = world.shown;
      for (const m of world.sigils) {
        m.emissiveIntensity = 1.2 + world.shown * (1.6 + Math.sin(world.time * 5) * 0.6) + Math.sin(world.time * 1.4) * 0.15;
        m.update();
      }
    },
  },
};

/** Whether (x, z) lies on (within 1.2 m of) the edge of `region` - a seal there closes the way on. */
function onEdge(region: LevelBounds, x: number, z: number): boolean {
  const inX = x >= region.minX - 1.2 && x <= region.maxX + 1.2, inZ = z >= region.minZ - 1.2 && z <= region.maxZ + 1.2;
  const nearZ = Math.abs(z - region.minZ) < 1.2 || Math.abs(z - region.maxZ) < 1.2;
  const nearX = Math.abs(x - region.minX) < 1.2 || Math.abs(x - region.maxX) < 1.2;
  return (inX && nearZ) || (inZ && nearX);
}
