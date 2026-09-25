import { BLEND_ADDITIVE, Color, Entity, StandardMaterial, math, type AppBase } from "playcanvas";
import { HELL, HELL_LIGHTING } from "../../config";
import { HELL_DIFFICULTIES, HELL_LEVELS, HELL_RUN } from "../../gameplay/hellConfig";
import { pentagram, type AmbientEmitter } from "../AmbientFx";
import { declareCollider } from "../collision/CollisionWorld";
import type { GroundSpec } from "../Ground";
import type { GroundSurface } from "../../config";
import type { Lava, LavaFall, LavaPool } from "../Lava";
import type { ModelKit, SpawnOptions } from "../props/ModelKit";
import { HELL_MODELS, type HellModel } from "../props/HellKit";
import type { Biome, LevelBounds, WayPoint, Zone } from "./Biome";

/**
 * HELL - one connected infernal world, ~120 x 760 m, crossed south to north over nine levels. Seven
 * basalt islands stand out of a lava sea (LAVA_Y below the ground), joined by walled bridges; each
 * level is fought inside one zone (its region bounds the hero, the nav grid and the spawns) and the
 * way on is sealed by a burning rune; once the level is won the hero walks there, the seal sinks away
 * and the next level starts as he enters its zone.
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
 *
 * The layout is drawn in the coordinates above and built S times larger (islands, bridge lengths,
 * zones, set-piece positions); props, bridge widths, the central road and gate gaps keep their size.
 * Each level's zone is then ~2x the outpost / ORION maps.
 */

/** Layout scale (see above). */
const S = 2;
type XZ = [number, number];
const at = ([x, z]: XZ): XZ => [x * S, z * S];

/** Height of the lava sea below the islands (the plateau cliffs are this tall). */
const LAVA_Y = -2.3;

type Rect = { x0: number; z0: number; x1: number; z1: number };
const scaleRect = (q: Rect): Rect => ({ x0: q.x0 * S, z0: q.z0 * S, x1: q.x1 * S, z1: q.z1 * S });
const ISLANDS: Record<string, Rect> = Object.fromEntries(Object.entries({
  gates: { x0: -22, z0: 118, x1: 22, z1: 154 },
  wastes: { x0: -30, z0: 62, x1: 30, z1: 110 },
  pentagram: { x0: -24, z0: 6, x1: 24, z1: 54 },
  d1: { x0: -26, z0: -24, x1: -4, z1: -4 },
  d2: { x0: 4, z0: -26, x1: 26, z1: -6 },
  d3: { x0: -14, z0: -56, x1: 14, z1: -34 },
  citadel: { x0: -30, z0: -114, x1: 30, z1: -64 },
  abyss: { x0: -28, z0: -170, x1: 28, z1: -122 },
  throne: { x0: -25, z0: -228, x1: 25, z1: -178 },
}).map(([k, q]) => [k, scaleRect(q)]));

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
].map((b): Bridge => ({ ...b, axis: b.axis as Bridge["axis"], c: b.c * S, a0: b.a0 * S, a1: b.a1 * S }));
const deckRect = (b: Bridge): Rect => b.axis === "z"
  ? { x0: b.c - b.width / 2, z0: b.a0, x1: b.c + b.width / 2, z1: b.a1 }
  : { x0: b.a0, z0: b.c - b.width / 2, x1: b.a1, z1: b.c + b.width / 2 };

/** Passages through walls inside an island (the citadel's inner gate): sealed like bridges. */
const GATES: { x: number; z: number; width: number }[] = [
  { x: 0, z: -86 * S, width: 6 },
  // A wall of runes across the throne island: the final approach stops short of the arena.
  { x: 0, z: -196 * S, width: 50 * S },
];

const SIGIL_C = { x: 0, z: 28 * S, radius: 9.5 * S };
const SIGIL_F = { x: 0, z: -205 * S, radius: 11 * S };

const r = (x0: number, z0: number, x1: number, z1: number): LevelBounds => ({ minX: x0, minZ: z0, maxX: x1, maxZ: z1 });
/** A zone region from layout-space edges: scaled, 0.6 m inside (null = that edge exactly, scaled). */
const zr = (x0: number, z0: number, x1: number, z1: number, exact: { z0?: number; z1?: number } = {}): LevelBounds =>
  r(x0 * S + 0.6, exact.z0 !== undefined ? exact.z0 * S : z0 * S + 0.6, x1 * S - 0.6, exact.z1 !== undefined ? exact.z1 * S : z1 * S - 0.6);
const start = (x: number, z: number) => ({ x: x * S, z: z * S, yawDeg: 180 });
/** Every level's way on leads south (-z), across the line at layout z. */
const south = (z: number) => ({ axis: "z" as const, at: z * S, dir: -1 as const });
/** Each level's zone: its playable region (a little inside the islands) and where it starts. */
export const ZONES: Record<string, Zone> = {
  gates: { region: zr(-22, 118, 22, 154), start: start(0, 147), exit: south(118) },
  wastes: { region: zr(-30, 62, 30, 110), start: start(0, 104), exit: south(62) },
  pentagram: { region: zr(-24, 6, 24, 54), start: start(0, 46), exit: south(6) },
  crossing: { region: zr(-26, -56, 26, -4), start: start(-15, -9), exit: south(-56) },
  // The outer yard ends at the inner wall (its gate is sealed).
  approach: { region: zr(-30, 0, 30, -34, { z0: -86.2 }), start: start(0, -40), exit: south(-86) },
  citadel: { region: zr(-30, -114, 30, 0, { z1: -86.3 }), start: start(0, -91), exit: south(-114) },
  abyss: { region: zr(-28, -170, 28, -122), start: start(0, -128), exit: south(-170) },
  // The abyss and the throne island up to the wall of runes.
  brink: { region: zr(-28, 0, 28, -122, { z0: -196 }), start: start(0, -160), exit: south(-196) },
  throne: { region: zr(-25, -228, 25, -178), start: start(0, -185) },
};

export const BOUNDS: LevelBounds = r(-30 * S, -228 * S, 30 * S, 154 * S);
export const SPAWN = start(0, 147);
export const RUN_START = ZONES.gates.start;

const FIRE: [number, number, number] = [1, 0.45, 0.12];
const HOT: [number, number, number] = [1, 0.32, 0.08];
const BLOOD: [number, number, number] = [1, 0.12, 0.04];
const SOOT: [number, number, number] = [0.45, 0.38, 0.36];
/** Ghost-green soul light (the abyss graveyard). */
const SOUL: [number, number, number] = [0.3, 0.95, 0.5];

/** Deterministic RNG so the layout is the same on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Every island has its own look, so crossing a bridge is arriving somewhere new: its ground and the
 * kinds of small scenes spread over it.
 */
type ClusterKind = "rocks" | "bones" | "flesh" | "ruin" | "torture" | "spires" | "deadwood" | "ritual" | "crystals" | "barracks" | "graves" | "crypt";
const ISLAND_LOOK: Record<string, { surface: GroundSurface; kinds: ClusterKind[] }> = {
  // Gates of Hell: basalt, ruins and the damned on display.
  gates: { surface: "basalt", kinds: ["ruin", "torture", "rocks", "ruin"] },
  // Infernal Wastes: ash badlands - rock spires, charred dead trees, bones, flesh.
  wastes: { surface: "ash", kinds: ["spires", "deadwood", "spires", "bones", "flesh", "deadwood"] },
  // Sacrificial Pentagram: blood-soaked rock, obelisks and candles, altars.
  pentagram: { surface: "bloodrock", kinds: ["ritual", "bones", "torture", "ritual"] },
  // Lava Crossing: obsidian veined with fire, lava crystals.
  d1: { surface: "obsidian", kinds: ["crystals", "rocks", "crystals"] },
  d2: { surface: "obsidian", kinds: ["crystals", "rocks", "crystals"] },
  d3: { surface: "obsidian", kinds: ["crystals", "rocks", "crystals"] },
  // Demon Citadel: paved throughout, barracks and torture.
  citadel: { surface: "flagstone", kinds: ["barracks", "torture", "ruin", "barracks"] },
  // The Abyss: a graveyard of the damned on pale bone-ash.
  abyss: { surface: "boneash", kinds: ["graves", "crypt", "deadwood", "graves", "bones"] },
  // Throne of the Archfiend: charred ground, ritual stones.
  throne: { surface: "cinder", kinds: ["ritual", "rocks", "bones"] },
};

/** Fire baskets lining the gates' avenue (either side of the road, every 11 m). */
const GATE_BASKETS: XZ[] = [];
for (let z = 118 * S + 10; z < 154 * S - 6; z += 11) GATE_BASKETS.push([-4.6, z], [4.6, z]);

/** The abyss's walled grave plots (layout space: centre, size), clear of the ribcage avenue. */
const GRAVE_PLOTS = ([[-17, -131], [17, -131], [-17, -150], [17, -148], [-18, -163]] as XZ[]).map(([x, z]) => ({ x: x * S, z: z * S, w: 13, d: 9 }));

/**
 * Small scenes spread over every island (the doubled layout would otherwise leave long bare
 * stretches), of the island's kinds (ISLAND_LOOK). Some carry a brazier.
 * Kept off the central road, the pentagrams, bridge mouths, grave plots and the level starts, and apart.
 */
const CLUSTERS: { x: number; z: number; kind: ClusterKind; fire: boolean; seed: number }[] = (() => {
  const random = rng(1313);
  const starts = Object.values(ZONES).map((zone) => zone.start);
  const out: { x: number; z: number; kind: ClusterKind; fire: boolean; seed: number }[] = [];
  for (const [name, isl] of Object.entries(ISLANDS)) {
    const kinds = ISLAND_LOOK[name]?.kinds ?? ["rocks", "bones"];
    const area = (isl.x1 - isl.x0) * (isl.z1 - isl.z0);
    const wanted = Math.round(area / 220);
    for (let tries = 0, n = 0; n < wanted && tries < wanted * 12; tries++) {
      const x = isl.x0 + 5 + random() * (isl.x1 - isl.x0 - 10), z = isl.z0 + 5 + random() * (isl.z1 - isl.z0 - 10);
      if (Math.abs(x) < 6) continue;
      if (Math.hypot(x - SIGIL_C.x, z - SIGIL_C.z) < SIGIL_C.radius + 9 || Math.hypot(x - SIGIL_F.x, z - SIGIL_F.z) < SIGIL_F.radius + 11) continue;
      if (BRIDGES.some((b) => b.axis === "z" ? Math.abs(x - b.c) < b.width / 2 + 6 && z > b.a0 - 8 && z < b.a1 + 8 : Math.abs(z - b.c) < b.width / 2 + 6 && x > b.a0 - 8 && x < b.a1 + 8)) continue;
      if (starts.some((p) => Math.hypot(x - p.x, z - p.z) < 9)) continue;
      if (Math.abs(z + 86 * S) < 6 || Math.abs(z + 196 * S) < 6 || Math.abs(z + 114 * S) < 5) continue;
      if (out.some((c) => Math.hypot(c.x - x, c.z - z) < 9)) continue;
      if (GRAVE_PLOTS.some((g) => Math.abs(x - g.x) < g.w / 2 + 5 && Math.abs(z - g.z) < g.d / 2 + 5)) continue;
      out.push({ x, z, kind: kinds[Math.floor(random() * kinds.length)], fire: random() < 0.22, seed: Math.floor(random() * 1e6) });
      n++;
    }
  }
  return out;
})();

/** Braziers (x, z) across the world; each gets a fire-light pool. */
const BRAZIERS: [number, number][] = [
  ...([
    [-4, 142], [4, 142], [-4, 132], [4, 132], [-7, 124], [7, 124],
    [-18, 100], [18, 100], [-10, 72], [10, 72], [-22, 86], [22, 86],
    [-18, -10], [18, -14], [-6, -44], [6, -44],
    [-10, -70], [10, -70], [-20, -108], [20, -108], [-24, -96], [24, -96],
    [-12, -132], [12, -132], [-20, -160], [20, -160], [-22, -146], [22, -146],
    [-14, 144], [14, 144], [-16, 20], [16, 38],
  ] as XZ[]).map(at),
  // Either side of the citadel's inner gate (the gap keeps its size).
  [-5, -86 * S + 2], [5, -86 * S + 2],
  ...CLUSTERS.filter((c) => c.fire).map((c): [number, number] => [c.x + 1.8, c.z - 1.2]),
  ...[0, 1, 2, 3, 4].map((i): [number, number] => [SIGIL_C.x + Math.sin((i * 72 * Math.PI) / 180) * (SIGIL_C.radius + 1.3), SIGIL_C.z - Math.cos((i * 72 * Math.PI) / 180) * (SIGIL_C.radius + 1.3)]),
  ...[0, 1, 2, 3, 4].map((i): [number, number] => [SIGIL_F.x + Math.sin((i * 72 * Math.PI) / 180) * (SIGIL_F.radius + 1.3), SIGIL_F.z - Math.cos((i * 72 * Math.PI) / 180) * (SIGIL_F.radius + 1.3)]),
];

/** Lava cracks inside the islands (soft pools; they block walking, not bullets). */
const POOLS: LavaPool[] = [
  // The sea below everything.
  { x: 0, z: -37 * S, w: 220 * S, d: 460 * S, y: LAVA_Y },
  // Lava cracks (layout space; scaled below): wastes, crossing, citadel outer yard moat, abyss.
  ...[
    { x: -18, z: 90, w: 9, d: 6 }, { x: 17, z: 80, w: 8, d: 9 }, { x: -4, z: 70, w: 7, d: 5 }, { x: 22, z: 104, w: 5, d: 4 },
    { x: -16, z: -48, w: 5, d: 4 }, { x: 18, z: -20, w: 4, d: 5 },
    { x: -20, z: -76, w: 8, d: 6 }, { x: 20, z: -76, w: 8, d: 6 },
    { x: -14, z: -146, w: 9, d: 7 }, { x: 15, z: -140, w: 7, d: 8 }, { x: 2, z: -160, w: 8, d: 5 },
  ].map((p): LavaPool => ({ x: p.x * S, z: p.z * S, w: p.w * 1.6, d: p.d * 1.6, soft: true, solid: true })),
];

/** Lava falls pouring off distant cliffs (scenery). */
const FALLS: LavaFall[] = [
  { x: -44, z: 40, y: 14, width: 7, height: 18, yawDeg: 90 },
  { x: 46, z: -20, y: 16, width: 8, height: 20, yawDeg: -90 },
  { x: -46, z: -100, y: 15, width: 7, height: 19, yawDeg: 90 },
  { x: 0, z: -262, y: 22, width: 16, height: 26, yawDeg: 0 },
  { x: 44, z: -190, y: 14, width: 6, height: 17, yawDeg: -90 },
  { x: 46, z: 120, y: 14, width: 7, height: 18, yawDeg: -90 },
  { x: -44, z: -160, y: 15, width: 7, height: 19, yawDeg: 90 },
].map((f) => ({ ...f, x: f.x * S, z: f.z * S, y: f.y * 1.3, width: f.width * 1.4, height: f.height * 1.3 }));

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
  // Zone light: lava crystals burn, the abyss's graves glow ghost-green, candles round the ritual stones.
  ...CLUSTERS.filter((c) => c.kind === "crystals").map((c): AmbientEmitter => ({ kind: "glow", x: c.x, z: c.z, size: [7, 7], color: HOT, intensity: 0.45 })),
  ...CLUSTERS.filter((c) => c.kind === "ritual").map((c): AmbientEmitter => ({ kind: "glow", x: c.x, z: c.z, size: [5, 5], color: FIRE, intensity: 0.3 })),
  ...CLUSTERS.filter((c) => c.kind === "graves" || c.kind === "crypt").map((c): AmbientEmitter => ({ kind: "glow", x: c.x, z: c.z, size: [8, 8], color: SOUL, intensity: 0.28, pulse: 0.2 })),
  ...GRAVE_PLOTS.flatMap((g): AmbientEmitter[] => [
    { kind: "glow", x: g.x, z: g.z, size: [g.w + 6, g.d + 6], color: SOUL, intensity: 0.3, pulse: 0.25 },
    { kind: "dust", x: g.x, y: 0.6, z: g.z, size: [g.w, g.d], intensity: 0.5, color: [0.55, 0.9, 0.65] },
  ]),
  ...GATE_BASKETS.flatMap(([x, z], i): AmbientEmitter[] => [
    { kind: "glow", x, z, size: [4.5, 4.5], color: FIRE, intensity: 0.45 },
    ...(i % 4 === 0 ? [{ kind: "sparks" as const, x, y: 0.5, z, every: 3 + (i % 3) }] : []),
  ]),
  // Ash storms over the wastes.
  { kind: "dust", x: -30 * S / 2, y: 1.4, z: 96 * S, size: [30, 24], intensity: 0.8, color: [0.75, 0.68, 0.62] },
  { kind: "dust", x: 30 * S / 2, y: 1.4, z: 72 * S, size: [30, 24], intensity: 0.8, color: [0.75, 0.68, 0.62] },
  // The two great pentagrams glow blood red.
  { kind: "glow", x: SIGIL_C.x, z: SIGIL_C.z, size: [26 * S, 26 * S], color: BLOOD, intensity: 0.35, pulse: 0.3 },
  { kind: "glow", x: SIGIL_F.x, z: SIGIL_F.z, size: [30 * S, 30 * S], color: BLOOD, intensity: 0.4, pulse: 0.25 },
  { kind: "embers", x: SIGIL_F.x, y: 0.3, z: SIGIL_F.z, size: [10 * S, 10 * S], intensity: 1 },
  // Ash drifting over the wastes and the abyss.
  { kind: "dust", x: 0, y: 1.2, z: 86 * S, size: [24 * S, 20 * S], intensity: 0.7, color: [0.8, 0.6, 0.55] },
  { kind: "dust", x: 0, y: 1.2, z: -146 * S, size: [24 * S, 20 * S], intensity: 0.7, color: [0.8, 0.6, 0.55] },
];

export const GROUND_SPEC: GroundSpec = {
  base: "basalt",
  areas: Object.entries(ISLANDS).map(([name, isl]) => ({ ...isl, surface: ISLAND_LOOK[name]?.surface })),
  pads: [
    ...BRIDGES.map((b) => ({ ...rect(deckRect(b)), surface: "flagstone" as const })),
    // Roads of flagstone through the keep areas (the road keeps its width).
    { x0: -2.8, z0: 118 * S, x1: 2.8, z1: 152 * S, surface: "flagstone" },
    { x0: -26 * S, z0: -86 * S, x1: 26 * S, z1: -86 * S + 5, surface: "flagstone" },
    { x0: -2.8, z0: -114 * S, x1: 2.8, z1: -64 * S, surface: "flagstone" },
    { x0: -16 * S, z0: -112 * S, x1: 16 * S, z1: -92 * S, surface: "flagstone" },
    { x0: -2.8, z0: -195 * S, x1: 2.8, z1: -178 * S, surface: "flagstone" },
  ],
  patches: ([
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
    { x: -18, z: 150, w: 10, d: 6, surface: "ash", seed: 0 },
    { x: 0, z: 100, w: 16, d: 8, surface: "ash", seed: 1 },
    { x: 16, z: 48, w: 12, d: 8, surface: "ash", seed: 2 },
    { x: -18, z: -104, w: 12, d: 10, surface: "ash", seed: 3 },
    { x: 18, z: -166, w: 12, d: 8, surface: "ash", seed: 0 },
  ] as GroundSpec["patches"]).map((p) => ({ ...p, x: p.x * S, z: p.z * S, w: p.w * S, d: p.d * S })),
};

function rect(r: Rect) {
  return { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 };
}

type Placement = [HellModel, number, number, number?, SpawnOptions?];

/** Props of a small scene (offsets from its centre, metres): [model, dx, dz, scale range]. */
const CLUSTER_PROPS: Record<ClusterKind, [HellModel, number, number, number, number][]> = {
  rocks: [["crag", 0, 0, 0.45, 0.7], ["rockMid4", 2.6, 1.4, 0.7, 1.1], ["rockSmall2", -2.2, 1.8, 0.7, 1.2], ["rockSmall1", 1.2, -2.4, 0.6, 1]],
  bones: [["boneRib", 0, 0, 0.9, 1.2], ["skeleton", 2.4, 1.2, 1, 1], ["bones2", -1.8, -1.6, 0.9, 1.3], ["skull", 1.4, -1.8, 1, 1.4]],
  flesh: [["fleshStalk", 0, 0, 0.7, 1], ["fleshClaw", 2.4, -1, 0.5, 0.8], ["puddleC", -1.4, 1.2, 1, 1.5], ["bones2", 1.6, 2, 0.8, 1.2]],
  ruin: [["columnBroken", 0, 0, 0.8, 1], ["columnStump", 2.4, 1.5, 0.9, 1.1], ["rubble", -2, -1, 0.8, 1.3], ["stoneSmall1", 1, -2.2, 0.8, 1.2]],
  torture: [["cage", 0, 0, 0.9, 1.1], ["cross", 2.6, 0.8, 0.8, 1], ["skeleton", -1.8, 1.8, 1, 1], ["bones1", 1.2, -2, 0.9, 1.2]],
  spires: [["spireA", 0, 0, 0.8, 1.15], ["spireF", 4.2, 2, 0.7, 1], ["spireC", -3.6, 2.6, 0.8, 1.15], ["rockSmall2", 2, -3.4, 0.8, 1.2], ["spireH", -2.5, -3.5, 0.6, 0.9]],
  deadwood: [["treeDead", 0, 0, 0.8, 1.15], ["stump", 2.6, 1.6, 0.9, 1.2], ["log", -2.6, -1.2, 0.8, 1], ["treeDead2", -3.4, 2.8, 0.7, 0.95], ["skull", 1.4, -2, 1, 1.3]],
  ritual: [["obelisk", 0, 0, 0.9, 1.15], ["candlesMany", 1.5, 0.8, 1, 1.3], ["altarStone", -2.4, 0.4, 0.9, 1], ["urn", 1.2, -1.6, 1, 1.3], ["candlesMany", -1.7, -1.9, 1, 1.3], ["obelisk", 3.2, -2.4, 0.7, 0.9]],
  crystals: [["crystal1", 0, 0, 0.8, 1.3], ["crystal2", 1.7, 1, 0.8, 1.25], ["crystal3", -1.5, 1.3, 0.8, 1.2], ["crystal2", -0.8, -1.6, 0.6, 0.9], ["rockSmall2", 2, -1.8, 0.7, 1]],
  barracks: [["barrel", 0, 0, 1, 1.1], ["barrel", 0.95, 0.6, 1, 1.1], ["crate", -1.9, 0.4, 1, 1.2], ["table", 2.4, -1.4, 1, 1], ["jailBench", -1.3, -2.1, 1, 1], ["rack", 3.4, 1.8, 0.9, 1]],
  graves: [["graveCross", 0, 0, 0.9, 1.1], ["graveRound", 1.7, 0, 0.9, 1.1], ["graveBroken", 3.4, 0.2, 0.9, 1.1], ["graveDeco", 0, 2, 0.9, 1.1], ["graveCross", 1.7, 2, 0.9, 1.1], ["graveRound", 3.4, 2, 0.9, 1.1], ["coffin", -2, 1, 1, 1]],
  crypt: [["cryptSmall", 0, 0, 1, 1], ["cryptSmallRoof", 0, 0, 1, 1], ["urn", 3, 2.8, 1, 1.2], ["candlesMany", -2.9, 2.6, 1, 1.2], ["graveCross", 3, -2.4, 0.9, 1.1], ["treeDead", -4, -3, 0.7, 0.9]],
};
/** Kinds laid out in rows facing one way (graves, crypts), not scattered at random angles. */
const ALIGNED: ReadonlySet<ClusterKind> = new Set(["graves", "crypt"]);

/* ------------------------------------------------------------------------------------------------
 * World state driven by the campaign: the rune seals on the way on, the arena's glow.
 * ---------------------------------------------------------------------------------------------- */

/** A rune seal; `open` runs 0..1 while it sinks away (-1: standing). */
interface Seal { entity: Entity; x: number; z: number; width: number; yawDeg: number; open: number }
const SEAL_HEIGHT = 3.4;
const SEAL_OPEN_SECONDS = 0.8;
const world = {
  seals: [] as Seal[],
  /** The current way-on seals (exits()), by index. */
  exitSeals: [] as Seal[],
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
  const placeRaw = (list: Placement[]) => { for (const [id, x, z, yaw, options] of list) place(id, x, z, yaw ?? 0, options); };
  /** Hand-placed set pieces, in layout space (positions scaled by S). */
  const placeAll = (list: Placement[]) => { for (const [id, x, z, yaw, options] of list) place(id, x * S, z * S, yaw ?? 0, options); };
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
  const broken = ([[26, -16, 38, -16], [-28, -150, -40, -150], [30, 86, 40, 86], [-14, -56, -14, -64], [-30, 96, -40, 96], [28, -196, 38, -196]] as [number, number, number, number][])
    .map((b) => b.map((v) => v * S));
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
    e.setLocalScale(width, 1, SEAL_HEIGHT);
    e.setLocalPosition(x, SEAL_HEIGHT / 2, z);
    e.setLocalEulerAngles(90, yaw, 0);
    e.enabled = false;
    root.addChild(e);
    world.seals.push({ entity: e, x, z, width, yawDeg: yaw, open: -1 });
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
  for (let i = 0; i < 190; i++) {
    const z = (170 - random() * 420) * S;
    const side = random() < 0.5 ? -1 : 1;
    const x = side * (32 * S + 4 + random() * 34);
    lavaRock(x, z, random() < 0.35);
  }
  // Rocks in the chasms between islands.
  for (const [x, z] of [[-20, 114], [16, 115], [-24, 58], [0, 58], [24, 59], [0, 0], [-24, 0], [24, -1], [0, -29], [-22, -30], [22, -31], [-18, -60], [16, -61], [-16, -118], [18, -117], [-18, -174], [18, -175]]) {
    place(random() < 0.5 ? "rockSmall1" : "rockMid3", x * S, z * S, random() * 360, { y: LAVA_Y - 0.4, scale: 0.6 + random() * 0.4, noCollider: true });
  }
  // Landmarks.
  placeAll([
    // The gate's guardian statues, knee-deep in lava either side of the gate bridge.
    ["statue", -18, 113, 20, { y: LAVA_Y, scale: 1.1, noCollider: true }],
    ["statue", 18, 113, -20, { y: LAVA_Y, scale: 1.1, noCollider: true }],
    // Towers of the citadel beyond its walls.
    ["tower", -37, -95, 30, { y: LAVA_Y, noCollider: true }],
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
    place("chain", x * S, z * S, random() * 90, { y: LAVA_Y, scale: [5, h, 5], noCollider: true });
  }
  placeAll([
    ["chainHang", 0, -234, 0, { y: 11, scale: [44, 7, 7], noCollider: true }],
    ["chainHang", -33.5, -95, 90, { y: 7, scale: [10, 5, 5], noCollider: true }],
  ]);

  // ------------------------------------------------------------------ A: GATES OF HELL (z 118..154)
  // The gate: two great pillars at the bridge mouth with fire on top and chains between them.
  const gateZ = 118 * S + 1.5;
  placeRaw([
    ["pillar", -5.2, gateZ, 0, { scale: [1.6, 2.2, 1.6] }], ["pillar", 5.2, gateZ, 0, { scale: [1.6, 2.2, 1.6] }],
    ["brazier", -5.2, gateZ, 0, { y: 8.2, scale: 1.3, noCollider: true }], ["brazier", 5.2, gateZ, 0, { y: 8.2, scale: 1.3, noCollider: true }],
    ["chainHang", 0, gateZ + 0.1, 0, { y: 6.5, scale: [7.5, 2.6, 2.6], noCollider: true }],
    ["boneHorn", -9.5, gateZ + 1.5, -30, { tiltZ: 12 }], ["boneHorn", 9.5, gateZ + 1.5, 210, { tiltZ: 12 }],
  ]);
  placeAll([
    // Arrival: bones and spikes.
    ["boneRib", -7, 147, 20, { tiltZ: -14 }], ["boneRib2", 7.5, 143, -30, { tiltZ: 10 }],
    ["crag", -16, 146, 30, { scale: 0.8 }], ["crag", 17, 138, 200, { scale: 0.75 }], ["cragBig", -19, 127, 70, { scale: 0.42, y: -1 }],
    ["rockMid3", 14, 150, 20, { scale: 0.7 }], ["rockSmall1", -12, 130, 0], ["rockSmall2", 11, 124, 60],
    ["cage", -14, 124, 15], ["cage", 15, 132, -20], ["skeleton", 2.2, 136, 40], ["bones1", -2, 150, 0], ["skull", -4.5, 128, 20],
    // The approach to the gate: an avenue of broken columns and impaled dead.
    ["columnBroken", -8, 144, 30], ["column", 8, 146, 0, { scale: [0.8, 0.9, 0.8] }], ["columnStump", -9, 134, 0], ["columnBroken", 9, 128, 200],
    ["cross", -18, 140, 20], ["cross", 19, 146, -30], ["fleshStalk", -19, 121, 40], ["gear", 12, 139, 0, { tiltX: 72, y: 0.3 }],
    ["crag", 14, 150, 40, { scale: 0.5 }], ["rockMid4", -6, 139, 10], ["stockade", 18, 124, 0],
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
    // More of the wastes: a second ribcage, burnt cages, flesh taking the rock.
    ["boneRib", 16, 70, 160, { tiltZ: 14 }], ["boneRib2", 19, 68, 190, { tiltZ: -10 }], ["fleshGut", -12, 76, 80], ["fleshSpire", 8, 78, 0, { scale: 0.8 }],
    ["cage", 24, 92, 40], ["skeleton", -20, 108, 10], ["gearSmall", -26, 104, 30, { tiltX: 80, y: 0.2 }], ["crag", -14, 96, 90, { scale: 0.55 }],
    ["rack", -2, 64, 0], ["cross", 26, 64, 20], ["rockMid4", 4, 94, 60],
  ]);

  // ------------------------------------------------------------------ C: SACRIFICIAL PENTAGRAM (z 6..54)
  place("circlePlatform", SIGIL_C.x, SIGIL_C.z, 0, { y: -1.92, scale: [2.05 * S, 1, 2.05 * S], noCollider: true });
  world.sigils.push(sigil(root, app, SIGIL_C.x, SIGIL_C.z, SIGIL_C.radius, 1.2));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = SIGIL_C.x + Math.sin(a) * (SIGIL_C.radius + 7), z = SIGIL_C.z + Math.cos(a) * (SIGIL_C.radius + 7);
    place(i % 3 === 2 ? "columnBroken" : "column", x, z, (a * 180) / Math.PI, { scale: [0.8, 0.9, 0.8] });
  }
  placeAll([
    ["altar", -4, 43, 0], ["altar", 4, 43, 0], ["cross", 0, 48.5, 0],
    ["crag", -21, 50, 60, { scale: 0.75 }], ["crag", 21.5, 9, 150, { scale: 0.8 }], ["cragBig", -22, 10, 20, { scale: 0.45, y: -1 }],
    ["cage", 20, 48, 20], ["cage", -20, 30, -20], ["skeleton", 17, 30, 60], ["boneRib", 20, 18, 30, { tiltZ: 12 }],
    ["fleshClaw", -20, 14, 60], ["fleshStalk", 21, 36, 0], ["cross", -21, 42, 10], ["columnStump", 14, 51, 0], ["crag", 22, 26, 40, { scale: 0.55 }],
  ]);
  // Statues of the lords watching the circle from the lava.
  placeAll([["statue", -40, 28, 90, { y: LAVA_Y, scale: 0.9, noCollider: true }], ["statue", 40, 28, -90, { y: LAVA_Y, scale: 0.9, noCollider: true }]]);

  // ------------------------------------------------------------------ D: LAVA CROSSING (z -4..-56)
  placeAll([
    ["crag", -22, -20, 30, { scale: 0.7 }], ["fleshClaw", -24, -8, 20], ["rockMid3", -8, -20, 0, { scale: 0.6 }], ["cage", -20, -21, 0],
    ["crag", 23, -22, 60, { scale: 0.75 }], ["fleshStalk", 22, -9, 10], ["columnBroken", 8, -22, 30], ["skeleton", 14, -20, 40],
    ["boneRib", -10, -52, 20, { tiltZ: -12 }], ["boneRib2", 10, -52, -30, { tiltZ: 10 }], ["cragBig", 12, -36, 40, { scale: 0.4, y: -1 }],
    ["altar", -3, -45, 0], ["altar", 3, -45, 0],
    ["fleshBrain", -16, -12, 40, { scale: 0.8 }], ["cage", 20, -12, 0], ["gearSmall", -12, -8, 20, { tiltX: 80, y: 0.2 }], ["rockMid4", 12, -10, 80],
    ["cage", -10, -40, 20], ["crag", -11, -54, 60, { scale: 0.5 }], ["skeleton", 8, -48, 30],
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
  // The inner gate keeps its real width (6 m).
  wallLine(-30 * S, -86 * S, -3, -86 * S, ["wall", "wallBump", "wall", "wallWindow"]);
  wallLine(3, -86 * S, 30 * S, -86 * S, ["wall", "wallWindow", "wall", "wallBump"]);
  // North wall of the citadel (the keep's face), taller, with the keep gate over the abyss bridge.
  wallLine(-30 * S, -114 * S, -4, -114 * S, ["wall", "wallWindow", "wallBump", "wall", "wallWindow", "wall"], 1.4);
  wallLine(4, -114 * S, 30 * S, -114 * S, ["wall", "wallWindow", "wallBump", "wall", "wallWindow", "wall"], 1.4);
  placeRaw([
    ["column", -4.8, -114 * S + 0.6, 0, { scale: [0.9, 1.5, 0.9] }], ["column", 4.8, -114 * S + 0.6, 0, { scale: [0.9, 1.5, 0.9] }],
    ["brazier", -4.8, -114 * S + 0.6, 0, { y: 6, noCollider: true }], ["brazier", 4.8, -114 * S + 0.6, 0, { y: 6, noCollider: true }],
  ]);
  placeRaw([
    ["column", -3.8, -86 * S, 0, { scale: [0.85, 1.1, 0.85] }], ["column", 3.8, -86 * S, 0, { scale: [0.85, 1.1, 0.85] }],
    ["brazier", -3.8, -86 * S, 0, { y: 4.4, noCollider: true }], ["brazier", 3.8, -86 * S, 0, { y: 4.4, noCollider: true }],
  ]);
  // Towers along the inner wall.
  for (const x of [-44, -24, 24, 44]) placeRaw([["column", x, -86 * S, 0, { scale: [1, 1.3, 1] }], ["brazier", x, -86 * S, 0, { y: 5.2, noCollider: true }]]);
  placeAll([
    ["column", -29, -86, 0, { scale: [1, 1.3, 1] }], ["column", 29, -86, 0, { scale: [1, 1.3, 1] }],
    ["column", -29, -113, 0, { scale: [1, 1.8, 1] }], ["column", 29, -113, 0, { scale: [1, 1.8, 1] }],
    // Outer yard: cages, racks, a spike wheel - the citadel's killing ground.
    ["rack", -14, -70, 25], ["spikeWheel", 14, -72, 70], ["cage", -26, -68, 15], ["cage", 25, -80, -20],
    ["stockade", -8, -80, 90], ["stockade", -6, -80, 90], ["crag", 26, -67, 30, { scale: 0.7 }],
    // Courtyard: the ring of pillars where the wyrm lands; a throne for its master, empty.
    ["pedestal", -9, -110, 0, { scale: [2.2, 1, 1.5] }], ["throne", -9, -110.4, 0, { y: 0.54, noCollider: true }],
    ["cage", -24, -110, 20], ["cage", 24, -110, -20], ["skeleton", -20, -96, 30], ["bones1", 18, -98, 0],
    // Outer yard: more of the killing ground.
    ["rack", 12, -66, -20], ["spikeWheel", -22, -80, 20], ["cage", 8, -74, 0], ["cross", -26, -74, 10], ["cross", 26, -70, -10],
    ["stockade", 8, -78, 90], ["stockade", 10, -78, 90], ["skeleton", -2, -68, 60],
    // Courtyard corners.
    ["spikeWheel", -24, -92, 40], ["rack", 24, -94, -30], ["crag", -26, -104, 30, { scale: 0.6 }], ["crag", 26, -106, 200, { scale: 0.6 }],
  ]);
  // Rotated half a step so no pillar stands on the central road (or the level's start).
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    place("pillar", Math.sin(a) * 15 * S, (-100 + Math.cos(a) * 9) * S, 0, { scale: [0.9, 1, 0.9] });
  }

  // ------------------------------------------------------------------ G: THE ABYSS (z -122..-170)
  // An ossuary of giants: ribcages rising from the rock, gears, flesh, chains.
  for (let i = 0; i < 9; i++) {
    const z = -130 * S - i * 7.5;
    place("boneRib", -11, z, 90, { tiltZ: -18, scale: 1.3 });
    place("boneRib2", 11, z - 2, -90, { tiltZ: 18, scale: 1.3 });
  }
  placeAll([
    ["gearSmall", 20, -156, -20, { tiltX: 80, y: 0.2 }],
    ["axe", 22, -128, 20, { tiltZ: 12, y: -2.2 }], ["fleshGut", 22, -166, 60], ["fleshBrain", -24, -138, 30],
    ["cage", -12, -126, 15], ["cage", 12, -126, -15], ["cross", 0, -166, 0], ["crag", 25, -145, 60, { scale: 0.8 }], ["crag", -25, -154, 150, { scale: 0.75 }],
    ["skeleton", -4, -140, 40], ["skeleton", 5, -152, -20], ["bones3", 0, -134, 0],
    ["boneHorn", -22, -126, -40, { tiltZ: 12 }], ["boneHorn", 22, -168, 150, { tiltZ: 12 }], ["fleshClaw", 24, -150, 20],
    ["gear", 18, -164, 70, { tiltX: 72, y: 0.6 }], ["cage", -24, -168, 30], ["cross", 24, -132, 0], ["rockMid4", -8, -164, 40],
  ]);

  // ------------------------------------------------------------------ F: THRONE OF THE ARCHFIEND (z -178..-228)
  place("circlePlatform", SIGIL_F.x, SIGIL_F.z, 0, { y: -1.92, scale: [2.4 * S, 1, 2.4 * S], noCollider: true });
  world.sigils.push(sigil(root, app, SIGIL_F.x, SIGIL_F.z, SIGIL_F.radius, 1.4));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = SIGIL_F.x + Math.sin(a) * (SIGIL_F.radius + 8), z = SIGIL_F.z + Math.cos(a) * (SIGIL_F.radius + 8);
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
    const n = Math.round(area / 50);
    for (let k = 0; k < n; k++) {
      const x = isl.x0 + 1.5 + random() * (isl.x1 - isl.x0 - 3), z = isl.z0 + 1.5 + random() * (isl.z1 - isl.z0 - 3);
      if (pathsClear(x, z)) continue;
      const ids: HellModel[] = ["stoneSmall1", "stoneSmall2", "rubble", "mound", "skull", "bones2", "puddleC"];
      place(ids[Math.floor(random() * ids.length)], x, z, random() * 360, { scale: 0.7 + random() * 0.7, y: -0.05 });
    }
  }
  for (const [x, z] of BRAZIERS) place("brazier", x, z);
  for (const c of CLUSTERS) {
    const rand = rng(c.seed);
    const turn = rand() * Math.PI * 2, cos = Math.cos(turn), sin = Math.sin(turn);
    const aligned = ALIGNED.has(c.kind);
    for (const [id, dx, dz, k0, k1] of CLUSTER_PROPS[c.kind]) {
      if (dx !== 0 && rand() < 0.25) continue;
      const tilt = id === "boneRib" ? { tiltZ: (rand() - 0.5) * 30 } : id === "graveCross" || id === "graveRound" ? { tiltZ: (rand() - 0.5) * 14 } : {};
      const yaw = aligned ? -turn * math.RAD_TO_DEG + (rand() - 0.5) * 10 : rand() * 360;
      place(id, c.x + dx * cos - dz * sin, c.z + dx * sin + dz * cos, yaw, { scale: k0 + rand() * (k1 - k0), ...tilt, ...(id === "crag" ? { y: -0.5 } : {}) });
    }
  }

  // ------------------------------------------------------------------ zone signatures
  // Gates: an avenue of fire baskets up to the gate.
  // (No fences: the first fight starts here and needs room to kite.)
  for (const [x, z] of GATE_BASKETS) place("fireBasket", x, z, 0);
  // Pentagram: a ring of obelisks and candles just outside the circle.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = SIGIL_C.radius + 3.2;
    place("obelisk", SIGIL_C.x + Math.sin(a) * r, SIGIL_C.z + Math.cos(a) * r, (a * 180) / Math.PI);
    place("candlesMany", SIGIL_C.x + Math.sin(a + 0.31) * (r - 0.6), SIGIL_C.z + Math.cos(a + 0.31) * (r - 0.6), 0);
  }
  // The abyss: walled grave plots (rows of graves inside a broken iron fence, a crypt at one end).
  for (const [n, g] of GRAVE_PLOTS.entries()) {
    const rand = rng(900 + n);
    const graves: HellModel[] = ["graveCross", "graveRound", "graveDeco", "graveBroken", "graveCross"];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        if (rand() < 0.15) continue;
        const x = g.x - g.w / 2 + 2.2 + col * 2.2, z = g.z - g.d / 2 + 1.8 + row * 2.6;
        place(graves[Math.floor(rand() * graves.length)], x, z, 180 + (rand() - 0.5) * 12, { scale: 0.9 + rand() * 0.3, tiltZ: (rand() - 0.5) * 12 });
      }
    }
    const fence = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), count = Math.floor(len / 1.6);
      const yaw = (Math.atan2(x1 - x0, z1 - z0) * 180) / Math.PI + 90;
      for (let k = 0; k < count; k++) {
        const r = rand();
        if (r < 0.28) continue;
        const t = (k + 0.5) / count;
        place(r < 0.45 ? "ironFenceBroken" : "ironFence", x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, yaw);
      }
    };
    const x0 = g.x - g.w / 2, x1 = g.x + g.w / 2, z0 = g.z - g.d / 2, z1 = g.z + g.d / 2;
    fence(x0, z0, x1, z0);
    fence(x0, z1, x0 + g.w * 0.35, z1);
    fence(x1 - g.w * 0.35, z1, x1, z1);
    fence(x0, z0, x0, z1);
    fence(x1, z0, x1, z1);
    place("crypt", g.x, z0 - 4.5, 180);
    place("cryptRoof", g.x, z0 - 4.5, 180);
  }

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
    difficulties: HELL_DIFFICULTIES,
    defaultDifficulty: "hard",
    victory: { title: "HELL IS SILENT", text: "The Archfiend is dead. You were not supposed to survive this." },
    onLevel(_index, zone) {
      // Seal every way out of this level's region (bridge ends and gates on its edge).
      const region = ZONES[zone]?.region;
      for (const s of world.seals) {
        s.open = -1;
        s.entity.setLocalScale(s.width, 1, SEAL_HEIGHT);
        s.entity.setLocalPosition(s.x, SEAL_HEIGHT / 2, s.z);
        s.entity.enabled = !!region && onEdge(region, s.x, s.z);
      }
      world.exitSeals = [];
    },
    exits(zone): WayPoint[] {
      const exit = ZONES[zone]?.exit;
      world.exitSeals = exit ? world.seals.filter((s) => s.entity.enabled && Math.abs((exit.axis === "z" ? s.z : s.x) - exit.at) < 0.7) : [];
      return world.exitSeals.map((s) => ({ x: s.x, z: s.z, width: s.width, yawDeg: s.yawDeg }));
    },
    openExit(_zone, index) {
      const s = world.exitSeals[index];
      if (s && s.open < 0 && s.entity.enabled) s.open = 0;
    },
    arena(intensity) {
      world.arena = intensity;
    },
    attach(lava) {
      world.lava = lava;
    },
    update(dt) {
      world.time += dt;
      // Opening seals sink into the ground.
      for (const s of world.exitSeals) {
        if (s.open < 0 || !s.entity.enabled) continue;
        s.open = Math.min(1, s.open + dt / SEAL_OPEN_SECONDS);
        const f = 1 - s.open * s.open;
        s.entity.setLocalScale(s.width, 1, Math.max(0.01, SEAL_HEIGHT * f));
        s.entity.setLocalPosition(s.x, (SEAL_HEIGHT / 2) * f, s.z);
        if (s.open >= 1) s.entity.enabled = false;
      }
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
