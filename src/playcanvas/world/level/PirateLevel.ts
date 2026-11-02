import { BLEND_NORMAL, Color, Entity, StandardMaterial, type AppBase } from "playcanvas";
import type { AmbientEmitter } from "../AmbientFx";
import type { GroundSpec } from "../Ground";
import type { LavaPool, LavaSpec } from "../Lava";
import type { ModelKit, SpawnOptions } from "../props/ModelKit";
import { declareCollider } from "../collision/CollisionWorld";
import { PIRATE_MODELS, type PirateModel } from "../props/PirateKit";
import { PIRATE, PIRATE_LIGHTING } from "../../config";
import { PIRATE_DIFFICULTIES, PIRATE_LEVELS, PIRATE_RUN } from "../../gameplay/pirateConfig";
import type { Biome, LevelBounds, WayPoint, Zone } from "./Biome";
import { buildSeaFx, sway, updateSeaFx, type Shoreline } from "./PirateFx";

/**
 * BLACK TIDE - the pirate chapter: ten zones south to north (~90 x 820 m), the biggest map. The
 * hero walks out of a treasure grotto onto a beach, along it past the wrecks, out along a pier and
 * aboard a galleon broken in two on the reef - over its deck, down into its flooded stern - out
 * through a breach onto the shallows, up through a cliff fort to the skull rock, and across a
 * gangway onto the ghost flagship.
 *
 *   1 THE TREASURE GROTTO   rock walls, gold, an underground pool; out through the cave mouth
 *   2 SMUGGLERS' COVE       beach, palms, a shack, boats; the sea to the east
 *   3 THE WRECK SHORE       wrecks and a whale's ribs on the sand (boss: the Bosun)
 *   4 THE ROTTEN PIER       a long pier over the water, ships moored either side
 *   5 THE BROKEN DECK       the galleon's bow half: deck, cannons, masts, the open hatch
 *   6 THE FLOODED HOLD      the stern half's hull, cut open; the water rises; out by a breach
 *   7 THE REEF SHALLOWS     sandbars and tide pools; the tide rolls in from the sea
 *   8 THE CLIFF FORT        curtain walls, towers and the batteries
 *   9 SKULL ROCK            a lagoon below the great skull (boss: the Sea Hag)
 *  10 THE GHOST FLAGSHIP    its deck in deep water (boss: the Captain - and the kraken)
 *
 * The camera looks towards -Z and sees ~8 m past the hero to each side, so tall pieces stand only
 * at the sides and beyond the north edges, never south of the play. The ships keep the Kenney
 * frame (deck at y 2.1, bow towards +z) and are sunk so that their deck is the ground the hero
 * walks on; their rails, masts and hatches get colliders here.
 */

/** Sea level: the lagoon and the reef (shallow; the beaches slope into it). The flagship rides in deep water. */
const SEA_Y = -0.45;
const DEEP_Y = -3.2;
/** Half width of the lanes between zones (and of the gaps their seals close). */
const GAP = 3;

interface Box { x0: number; z0: number; x1: number; z1: number }

/* ------------------------------------------------------------------------------------------------
 * Layout: zones laid out from the south; the ships fix their own zones.
 * ---------------------------------------------------------------------------------------------- */

/** Ship placements: centre (x, z), scale; the deck (model y 2.1) is the ground. */
const DECK_S = 9, HOLD_S = 10, GHOST_S = 11;

const B: Record<string, Box> = {};
let z = 46;
const next = (id: string, x0: number, x1: number, length: number, lane: number) => {
  B[id] = { x0, x1, z1: z, z0: z - length };
  z -= length + lane;
};
next("grotto", -26, 26, 66, 18);
next("cove", -34, 20, 82, 18);
next("shore", -38, 20, 86, 20);
next("pier", -4, 16, 98, 0);
// The galleon's bow half: a 7 m gangway from the pier's end to its bow, which is open (cut) at
// model z 3.4. Its deck runs full width from the break (model z -2.0) to model z 1.7.
const WRECK = { x: 6, z: B.pier.z0 - 7 - 3.4 * DECK_S, s: DECK_S };
B.deck = { x0: WRECK.x - 2.05 * DECK_S + 1, x1: WRECK.x + 2.05 * DECK_S - 1, z0: WRECK.z - 2.0 * DECK_S + 1, z1: WRECK.z + 1.7 * DECK_S - 1.5 };
// The stern half lies 10 m on, its hull cut open (model z 1.7) towards the deck; floor at model y
// 0.2 from model z -4.1 to 1.2, 2.2 units wide; the breach in its port side at model z -3.4..-2.4.
const HOLD = { x: 6, z: WRECK.z - 2.0 * DECK_S - 10 - 1.7 * HOLD_S, s: HOLD_S };
B.hold = { x0: HOLD.x - 1.1 * HOLD_S, x1: HOLD.x + 1.1 * HOLD_S, z0: HOLD.z - 4.1 * HOLD_S + 0.5, z1: HOLD.z + 1.2 * HOLD_S - 0.5 };
const BREACH_Z = HOLD.z - 2.9 * HOLD_S;
// The shallows west of the hull (entered through the breach), then the fort and the skull rock north.
const WEST_X = -54;
B.shallows = { x0: WEST_X - 32, x1: WEST_X + 32, z0: BREACH_Z - 44, z1: BREACH_Z + 34 };
z = B.shallows.z0 - 18;
next("fort", WEST_X - 34, WEST_X + 34, 84, 18);
next("skull", WEST_X - 36, WEST_X + 36, 76, 0);
// The ghost flagship: a 7 m boarding plank to its bow (cut open at model z 3.4).
const GHOST = { x: WEST_X, z: B.skull.z0 - 7 - 3.4 * GHOST_S, s: GHOST_S };
B.flagship = { x0: GHOST.x - 2.05 * GHOST_S + 1, x1: GHOST.x + 2.05 * GHOST_S - 1, z0: GHOST.z - 1.9 * GHOST_S + 1, z1: GHOST.z + 1.7 * GHOST_S - 1.5 };

const ORDER = ["grotto", "cove", "shore", "pier", "deck", "hold", "shallows", "fort", "skull", "flagship"] as const;
type ZoneId = (typeof ORDER)[number];

/** Where each zone's way on is: a lane at `at` across its north edge (or its west edge: the breach). */
const EXITS: Record<Exclude<ZoneId, "flagship">, { side: "n" | "w"; at: number }> = {
  grotto: { side: "n", at: 0 },
  cove: { side: "n", at: -8 },
  shore: { side: "n", at: 6 },
  pier: { side: "n", at: 6 },
  deck: { side: "n", at: 6 },
  hold: { side: "w", at: BREACH_Z },
  shallows: { side: "n", at: WEST_X },
  fort: { side: "n", at: WEST_X },
  skull: { side: "n", at: WEST_X },
};

export const BOUNDS: LevelBounds = { minX: -100, maxX: 60, minZ: B.flagship.z0 - 30, maxZ: B.grotto.z1 + 4 };

const region = (b: Box): LevelBounds => ({ minX: b.x0 + 1, maxX: b.x1 - 1, minZ: b.z0 + 1, maxZ: b.z1 - 1 });
const STARTS: Record<ZoneId, { x: number; z: number; yawDeg: number }> = {
  grotto: { x: 0, z: B.grotto.z1 - 10, yawDeg: 180 },
  cove: { x: 0, z: B.cove.z1 - 5, yawDeg: 180 },
  shore: { x: -8, z: B.shore.z1 - 5, yawDeg: 180 },
  pier: { x: 6, z: B.pier.z1 - 5, yawDeg: 180 },
  deck: { x: 6, z: B.deck.z1 - 4, yawDeg: 180 },
  hold: { x: 6, z: B.hold.z1 - 4, yawDeg: 180 },
  shallows: { x: B.shallows.x1 - 5, z: BREACH_Z, yawDeg: 270 },
  fort: { x: WEST_X, z: B.fort.z1 - 5, yawDeg: 180 },
  skull: { x: WEST_X, z: B.skull.z1 - 5, yawDeg: 180 },
  flagship: { x: GHOST.x, z: B.flagship.z1 - 4, yawDeg: 180 },
};
export const ZONES: Record<string, Zone> = Object.fromEntries(ORDER.map((id) => {
  const zone: Zone = { region: region(B[id]), start: STARTS[id] };
  if (id !== "flagship") {
    const e = EXITS[id];
    zone.exit = e.side === "n" ? { axis: "z", at: B[id].z0, dir: -1 } : { axis: "x", at: B[id].x0, dir: -1 };
  }
  return [id, zone];
}));

export const SPAWN = { x: 0, z: B.grotto.z1 - 6, yawDeg: 180 };

/* ------------------------------------------------------------------------------------------------
 * Sea, ground, ambience
 * ---------------------------------------------------------------------------------------------- */

const SEA_POOLS: LavaPool[] = [
  // The lagoon and the reef: shallow water round everything south of the skull rock's reef.
  { x: -20, z: (BOUNDS.maxZ + B.skull.z0 - 12) / 2, w: 360, d: BOUNDS.maxZ - (B.skull.z0 - 12) + 80, y: SEA_Y },
  // Deep water round the flagship (the reef line hides the step).
  { x: -20, z: (B.skull.z0 - 12 + BOUNDS.minZ - 80) / 2, w: 360, d: B.skull.z0 - 12 - (BOUNDS.minZ - 80), y: DEEP_Y },
  // The grotto's underground pool (blocks walking).
  { x: 14, z: B.grotto.z0 + 30, w: 14, d: 18, soft: true, solid: true },
  // Tide pools on the shallows (walkable, a hand deep).
  ...[[-70, 0.18], [-42, 0.3], [-60, 0.62], [-32, 0.72], [-76, 0.82], [-48, 0.95]].map(([x, f]) => ({
    x, z: B.shallows.z1 - (B.shallows.z1 - B.shallows.z0) * f, w: 12 + (x % 7), d: 9 + (x % 5), soft: true,
  })),
  // Rock pools along the waterline of the cove and the shore (walkable).
  ...[0.12, 0.3, 0.46, 0.62, 0.8, 0.93].map((f, i) => ({ x: 15 + (i % 2) * 2, z: B.cove.z1 - (B.cove.z1 - B.shore.z0) * f, w: 7 + (i % 3) * 2, d: 6 + (i % 2) * 3, soft: true })),
  // The skull rock's lagoon: a pool in the middle of the arena (the Sea Hag hovers over it).
  { x: WEST_X, z: (B.skull.z0 + B.skull.z1) / 2 - 4, w: 20, d: 16, soft: true, solid: true },
];

export const SEA: LavaSpec = {
  url: "models/pirate/water.webp",
  tileMetres: 16,
  flow: [0.004, 0.011],
  intensity: 0.92,
  pools: SEA_POOLS,
};

const mid = (b: Box): [number, number] => [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2];
const [gx, gz] = mid(B.grotto), [cx, cz] = mid(B.cove), [sx, sz] = mid(B.shore), [hx, hz] = mid(B.hold), [, fz] = mid(B.fort), [kx, kz] = mid(B.skull);

/** Beach edges where the waves break (the sea on their `sea` side). */
const SHORELINES: Shoreline[] = [
  { x0: 21.7, z0: B.grotto.z0 - 8, x1: 21.7, z1: B.shore.z0 - 10, sea: [1, 0], y: SEA_Y },
  { x0: -60, z0: B.shore.z0 - 10.2, x1: 0, z1: B.shore.z0 - 10.2, sea: [0, -1], y: SEA_Y },
  { x0: B.shallows.x1 + 0.2, z0: B.shallows.z1 + 4, x1: B.shallows.x1 + 0.2, z1: B.shallows.z0 - 2, sea: [1, 0], y: SEA_Y },
  { x0: B.fort.x1 + 6.2, z0: B.shallows.z0 - 2, x1: B.fort.x1 + 6.2, z1: B.fort.z0 - 9, sea: [1, 0], y: SEA_Y },
  { x0: B.skull.x1 + 4.2, z0: B.fort.z0 - 9, x1: B.skull.x1 + 4.2, z1: B.skull.z0, sea: [1, 0], y: SEA_Y },
  { x0: -110, z0: B.skull.z0 - 0.2, x1: WEST_X - 8, z1: B.skull.z0 - 0.2, sea: [0, -1], y: SEA_Y },
  { x0: WEST_X + 8, z0: B.skull.z0 - 0.2, x1: B.skull.x1 + 4, z1: B.skull.z0 - 0.2, sea: [0, -1], y: SEA_Y },
];

/** Tiki torches lining the walk along the beach (models in buildColour, flames here). */
const TIKIS: [number, number][] = [];
for (let zz = B.cove.z1 - 8; zz > B.shore.z0 + 8; zz -= 15) TIKIS.push([zz > B.cove.z0 ? -12 : -16, zz], [zz > B.cove.z0 ? 12 : 14, zz - 7]);

/** Torches, campfires, cannon smoke, gulls; lanterns in the hold; ghost lights. Sparse so combat reads. */
export const AMBIENT: AmbientEmitter[] = [
  ...TIKIS.map(([x, zz]) => ({ kind: "fire" as const, x, y: 2.1, z: zz, size: [0.25, 0.25] as [number, number], intensity: 0.8 })),
  // Spray blowing in off the breakers, palm leaves on the wind.
  { kind: "dust", x: 22, y: 0.6, z: (B.cove.z1 + B.shore.z0) / 2, size: [8, 180], intensity: 1, color: [0.95, 1.0, 1.0] },
  { kind: "leaves", x: -10, y: 0.6, z: (B.cove.z1 + B.shore.z0) / 2, size: [50, 170], intensity: 0.9, color: [0.45, 0.75, 0.3] },
  { kind: "leaves", x: WEST_X, y: 0.6, z: (B.shallows.z1 + B.skull.z0) / 2, size: [60, 260], intensity: 0.7, color: [0.5, 0.78, 0.32] },
  { kind: "dust", x: B.fort.x1 + 4, y: 0.6, z: (B.shallows.z1 + B.skull.z0) / 2, size: [8, 260], intensity: 0.9, color: [0.95, 1.0, 1.0] },
  // Grotto: torches on the walls, gold glinting, dust in the shafts of light.
  ...[[-20, 30], [20, 30], [-20, 6], [-20, -10], [20, -10], [-6, B.grotto.z0 - 4], [6, B.grotto.z0 - 4]].map(([x, zz]) => ({ kind: "fire" as const, x, y: 1.6, z: zz, size: [0.35, 0.35] as [number, number], intensity: 0.9 })),
  { kind: "glow", x: 0, z: B.grotto.z0 + 10, size: [16, 10], color: [1.0, 0.75, 0.3], intensity: 0.45, pulse: 0.3 },
  { kind: "dust", x: gx, y: 1.2, z: gz, size: [36, 50], intensity: 0.7, color: [0.85, 0.75, 0.6] },
  // Cove: the smugglers' campfire, gulls over the water, sand blowing.
  { kind: "fire", x: -10, y: 0.4, z: cz - 6, size: [0.8, 0.8], intensity: 1 },
  { kind: "smoke", x: -10, y: 1.5, z: cz - 6, size: [1, 1], intensity: 0.8 },
  { kind: "birds", x: cx + 8, y: 7, z: cz, size: [40, 50], intensity: 1.2 },
  { kind: "leaves", x: cx, y: 0.3, z: cz, size: [40, 60], intensity: 0.6, color: [0.95, 0.88, 0.7] },
  // Wreck shore: smoke from a burning wreck, gulls.
  { kind: "fire", x: -26, y: 2.2, z: sz + 18, size: [1.6, 1.2], intensity: 0.9 },
  { kind: "smoke", x: -26, y: 3.5, z: sz + 18, size: [1.6, 1.6], intensity: 1 },
  { kind: "birds", x: sx, y: 7, z: sz, size: [44, 50], intensity: 1.4 },
  { kind: "leaves", x: sx, y: 0.3, z: sz, size: [44, 60], intensity: 0.5, color: [0.95, 0.88, 0.7] },
  // Pier: lanterns, spray.
  ...[0, 1, 2, 3, 4, 5].flatMap((i) => [-4.5, 16.5].map((x) => ({ kind: "fire" as const, x, y: 3.1, z: B.pier.z1 - 8 - i * 16, size: [0.22, 0.22] as [number, number], intensity: 0.7 }))),
  { kind: "dust", x: 6, y: 0.8, z: (B.pier.z0 + B.pier.z1) / 2, size: [30, 90], intensity: 0.8, color: [0.8, 0.9, 0.95] },
  // The galleon's deck: smoke from the broken stern, sparks off the guns.
  { kind: "smoke", x: WRECK.x, y: 2, z: B.deck.z0 - 2, size: [16, 3], intensity: 1 },
  { kind: "fire", x: WRECK.x - 9, y: 1, z: B.deck.z0 + 2, size: [1.2, 1], intensity: 0.8 },
  { kind: "dust", x: WRECK.x, y: 1, z: (B.deck.z0 + B.deck.z1) / 2, size: [30, 30], intensity: 0.8, color: [0.8, 0.88, 0.95] },
  // The hold: lanterns in the dark.
  ...[[-6, 0.15], [6, 0.35], [-6, 0.55], [6, 0.75], [-5, 0.92]].map(([x, f]) => ({ kind: "fire" as const, x: hx + x, y: 1.1, z: B.hold.z1 - (B.hold.z1 - B.hold.z0) * f, size: [0.25, 0.25] as [number, number], intensity: 1.1 })),
  { kind: "dust", x: hx, y: 1, z: hz, size: [18, 50], intensity: 0.9, color: [0.5, 0.6, 0.55] },
  // Shallows: gulls, spray.
  { kind: "birds", x: WEST_X, y: 7, z: (B.shallows.z0 + B.shallows.z1) / 2, size: [60, 70], intensity: 1.2 },
  { kind: "dust", x: WEST_X, y: 0.5, z: (B.shallows.z0 + B.shallows.z1) / 2, size: [60, 70], intensity: 0.8, color: [0.85, 0.95, 1.0] },
  // Fort: braziers by the gates and the batteries, powder smoke.
  ...[[-6, 0], [6, 0]].flatMap(([o]) => [B.fort.z1 - 3, B.fort.z0 + 3].map((zz) => ({ kind: "fire" as const, x: WEST_X + o, y: 1.3, z: zz, size: [0.4, 0.4] as [number, number], intensity: 1 }))),
  { kind: "smoke", x: B.fort.x1 - 6, y: 2, z: fz, size: [4, 50], intensity: 0.9 },
  { kind: "sparks", x: B.fort.x1 - 6, y: 1.2, z: fz, every: 5 },
  // Skull rock: green light from its eyes, ghost lights over the lagoon.
  { kind: "glow", x: kx - 26, z: B.skull.z0 - 14, size: [10, 10], color: [0.3, 1.0, 0.6], intensity: 0.9, pulse: 0.5 },
  { kind: "glow", x: kx, z: (B.skull.z0 + B.skull.z1) / 2 - 4, size: [20, 16], color: [0.25, 0.9, 0.6], intensity: 0.5, pulse: 0.25 },
  { kind: "embers", x: kx, y: 0.6, z: kz, size: [40, 40], intensity: 0.6 },
  // The flagship: green lanterns on its rails, cold mist.
  ...[0.1, 0.4, 0.7].flatMap((f) => [-1, 1].map((sd) => ({ kind: "glow" as const, x: GHOST.x + sd * (2.05 * GHOST_S - 2), z: B.flagship.z1 - (B.flagship.z1 - B.flagship.z0) * f, size: [5, 5] as [number, number], color: [0.3, 1.0, 0.65] as [number, number, number], intensity: 0.8, pulse: 0.6 }))),
  { kind: "dust", x: GHOST.x, y: 1, z: (B.flagship.z0 + B.flagship.z1) / 2, size: [44, 40], intensity: 1, color: [0.55, 0.85, 0.7] },
];

/** Deck planking for a medium hull placed at `ship`: the waist from `sternZ` (model units) to model
 * z 1.7 at full width (inside the rails), then the bow narrowing in steps to its tip. */
function deckPlanks(ship: { x: number; z: number; s: number }, sternZ: number, surface: "planks" | "ghostdeck"): GroundSpec["pads"] {
  const { x, z: zc, s } = ship;
  const out: GroundSpec["pads"] = [{ x0: x - 2.12 * s, z0: zc + sternZ * s, x1: x + 2.12 * s, z1: zc + 1.7 * s, surface }];
  const steps: [number, number, number][] = [[1.7, 2.2, 1.85], [2.2, 2.6, 1.45], [2.6, 3.0, 1.05], [3.0, 3.45, 0.62]];
  for (const [z0, z1, half] of steps) out.push({ x0: x - half * s, z0: zc + z0 * s, x1: x + half * s, z1: zc + z1 * s, surface });
  return out;
}

/** Land: ground where there is sand, rock or stone; elsewhere the sea (or a deck) shows. */
export const GROUND_SPEC: GroundSpec = {
  base: "beach",
  areas: [
    // The grotto's floor and the rock round it.
    { x0: -70, z0: B.grotto.z0 - 8, x1: 70, z1: B.grotto.z1 + 30, surface: "grotto" },
    // The beach from the cave mouth to the pier's foot (the sea begins at x 24).
    { x0: -110, z0: B.shore.z0 - 10, x1: 21.5, z1: B.grotto.z0 - 8 },
    // The shallows' sandbars, the fort's headland and the skull rock's ledges.
    { x0: -130, z0: B.shallows.z0 - 2, x1: B.shallows.x1, z1: B.shallows.z1 + 4, surface: "wetsand" },
    { x0: -140, z0: B.fort.z0 - 9, x1: B.fort.x1 + 6, z1: B.shallows.z0 - 2, surface: "jungle" },
    { x0: -140, z0: B.skull.z0, x1: B.skull.x1 + 4, z1: B.fort.z0 - 9, surface: "fortstone" },
    // The pier's boards.
    { x0: B.pier.x0 - 0.6, z0: B.pier.z0 - 8, x1: B.pier.x1 + 0.6, z1: B.pier.z1 + 1, surface: "planks" },
    // Planking laid over the decks and the hold's floor (the ships sit a hair lower): the Kenney
    // decks are flat colour, these read as boards.
    ...deckPlanks(WRECK, -2.0, "planks"),
    { x0: HOLD.x - 1.1 * HOLD_S, z0: HOLD.z - 4.1 * HOLD_S, x1: HOLD.x + 1.1 * HOLD_S, z1: HOLD.z + 1.25 * HOLD_S, surface: "planks" },
    ...deckPlanks(GHOST, -1.9, "ghostdeck"),
  ],
  pads: [
    // The fort's courtyard flagstones.
    { x0: B.fort.x0 + 4, z0: B.fort.z0 + 4, x1: B.fort.x1 - 4, z1: B.fort.z1 - 4, surface: "fortstone" },
  ],
  patches: [
    // Wet sand along the waterline of the cove and the shore.
    ...[0.1, 0.3, 0.5, 0.7, 0.9].map((f, i) => ({ x: 18, z: B.cove.z1 - (B.cove.z1 - B.shore.z0) * f, w: 12, d: 36, surface: "wetsand" as const, seed: i })),
    // Sand drifted into the cave mouth; rock ledges and grass on the beach.
    { x: 0, z: B.grotto.z0 - 2, w: 14, d: 20, surface: "beach", seed: 1 },
    { x: -30, z: cz, w: 18, d: 40, surface: "jungle", seed: 2 },
    { x: -34, z: sz - 10, w: 16, d: 30, surface: "jungle", seed: 3 },
    // Shallows: dry bars on the wet sand.
    ...[[-74, 0.2], [-46, 0.45], [-66, 0.7], [-38, 0.88]].map(([x, f], i) => ({ x, z: B.shallows.z1 - (B.shallows.z1 - B.shallows.z0) * f, w: 18, d: 12, surface: "beach" as const, seed: i })),
    // Grass on the headland round the fort, sand on the skull rock's beach.
    { x: B.fort.x0 - 6, z: fz, w: 16, d: 70, surface: "jungle", seed: 1 },
    { x: kx, z: B.skull.z1 - 10, w: 50, d: 22, surface: "wetsand", seed: 2 },
    { x: kx - 20, z: kz + 6, w: 26, d: 30, surface: "beach", seed: 3 },
    { x: kx + 22, z: kz - 10, w: 24, d: 28, surface: "wetsand", seed: 0 },
  ],
};

/* ------------------------------------------------------------------------------------------------
 * Builder
 * ---------------------------------------------------------------------------------------------- */

type Placement = [PirateModel, number, number, number?, SpawnOptions?];
type Place = (id: PirateModel, x: number, z: number, yaw?: number, options?: SpawnOptions) => Entity | null;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Built pieces the campaign animates (the hold's water, the foam, the kraken). */
interface World {
  seals: { entity: Entity; x: number; z: number; yaw: number; open: number }[];
  exitSeals: World["seals"];
  flood: { entity: Entity; level: number; target: number } | null;
  foam: { entity: Entity; base: number; phase: number }[];
  foamMaterial: StandardMaterial | null;
  tentacles: Tentacle[];
  lurkers: Tentacle[];
  kraken: number;
  time: number;
}
const world: World = { seals: [], exitSeals: [], flood: null, foam: [], foamMaterial: null, tentacles: [], lurkers: [], kraken: 0, time: 0 };

export function buildPirateLevel(kit: ModelKit<PirateModel>): Entity {
  const root = new Entity("PirateLevel");
  const random = rng(1717);
  // Palms lean, flags, banners and kelp flutter in the breeze (PirateFx).
  const place: Place = (id, x, zz, yaw = 0, options = {}) => {
    const e = kit.spawn(id, x, zz, yaw, root, options);
    if (id.startsWith("palm")) sway(e, 2.6);
    else if (id.startsWith("flag") || id.startsWith("banner")) sway(e, 7, true);
    else if (id === "kelp" || id === "buoy") sway(e, id === "kelp" ? 9 : 5, true);
    return e;
  };
  const placeAll = (list: Placement[]) => { for (const [id, x, zz, yaw, options] of list) place(id, x, zz, yaw ?? 0, options); };

  /** An invisible wall from (ax, az) to (bx, bz). */
  const wall = (ax: number, az: number, bx: number, bz: number, thick = 1, low = false) => {
    const e = new Entity("edge");
    const len = Math.hypot(bx - ax, bz - az);
    e.setLocalPosition((ax + bx) / 2, 0, (az + bz) / 2);
    e.setLocalEulerAngles(0, (Math.atan2(-(bz - az), bx - ax) * 180) / Math.PI, 0);
    root.addChild(e);
    declareCollider(e, { kind: "box", width: len + thick * 0.5, depth: thick, low });
  };
  const blockBox = (x: number, zz: number, w: number, d: number, low = false) => {
    const e = new Entity("block");
    e.setLocalPosition(x, 0, zz);
    root.addChild(e);
    declareCollider(e, { kind: "box", width: w, depth: d, low });
  };
  const blockCircle = (x: number, zz: number, r: number) => {
    const e = new Entity("post");
    e.setLocalPosition(x, 0, zz);
    root.addChild(e);
    declareCollider(e, { kind: "circle", radius: r });
  };
  /** Edges round a zone box; `openN` / `openS` / `openW` / `openE` leave a lane gap at that coordinate. */
  const zoneEdges = (b: Box, open: { n?: number; s?: number; w?: number; e?: number }) => {
    const hline = (zz: number, at?: number) => {
      if (at === undefined) wall(b.x0 - 0.5, zz, b.x1 + 0.5, zz);
      else { wall(b.x0 - 0.5, zz, at - GAP, zz); wall(at + GAP, zz, b.x1 + 0.5, zz); }
    };
    const vline = (xx: number, at?: number) => {
      if (at === undefined) wall(xx, b.z0 - 0.5, xx, b.z1 + 0.5);
      else { wall(xx, b.z0 - 0.5, xx, at - GAP); wall(xx, at + GAP, xx, b.z1 + 0.5); }
    };
    hline(b.z1 + 0.5, open.s);
    hline(b.z0 - 0.5, open.n);
    vline(b.x0 - 0.5, open.w);
    vline(b.x1 + 0.5, open.e);
  };
  /** A straight north-south lane at x from z `from` (south) to `to` (north). */
  const laneZ = (x: number, from: number, to: number) => {
    wall(x - GAP - 0.5, from, x - GAP - 0.5, to);
    wall(x + GAP + 0.5, from, x + GAP + 0.5, to);
  };
  const scatter = (ids: PirateModel[], n: number, b: Box, keepOut: (x: number, zz: number) => boolean, options: () => SpawnOptions = () => ({})) => {
    for (let i = 0; i < n; i++) {
      const x = b.x0 + random() * (b.x1 - b.x0), zz = b.z0 + random() * (b.z1 - b.z0);
      if (keepOut(x, zz)) continue;
      place(ids[Math.floor(random() * ids.length)], x, zz, random() * 360, options());
    }
  };
  const ctx = { place, placeAll, wall, blockBox, blockCircle, zoneEdges, laneZ, scatter, random, root };

  buildGrotto(ctx);
  buildCove(ctx);
  buildShore(ctx);
  buildPier(ctx);
  buildDeck(ctx);
  buildHold(ctx);
  buildShallows(ctx);
  buildFort(ctx);
  buildSkull(ctx);
  buildFlagship(ctx);
  buildFoam(root);
  buildKraken(root);
  buildColour(ctx);
  buildSeaFx(kit.app, root, SHORELINES, SEA_POOLS.slice(0, 2).map((p) => ({ x: p.x, z: p.z, w: p.w, d: p.d, y: p.y ?? SEA_Y })));
  buildSeals(kit, root);
  return root;
}

type Ctx = {
  place: Place;
  placeAll: (list: Placement[]) => void;
  wall: (ax: number, az: number, bx: number, bz: number, thick?: number, low?: boolean) => void;
  blockBox: (x: number, z: number, w: number, d: number, low?: boolean) => void;
  blockCircle: (x: number, z: number, r: number) => void;
  zoneEdges: (b: Box, open: { n?: number; s?: number; w?: number; e?: number }) => void;
  laneZ: (x: number, from: number, to: number) => void;
  scatter: (ids: PirateModel[], n: number, b: Box, keepOut: (x: number, z: number) => boolean, options?: () => SpawnOptions) => void;
  random: () => number;
  root: Entity;
};

/* ------------------------------------------------------------------------------------------------
 * 1 THE TREASURE GROTTO
 * ---------------------------------------------------------------------------------------------- */
function buildGrotto({ place, placeAll, zoneEdges, laneZ, scatter, random }: Ctx): void {
  const b = B.grotto;
  zoneEdges(b, { n: 0 });
  laneZ(0, b.z0, B.cove.z1);
  // The rock: bare mountains all round beyond the sides and the north wall (the cave mouth open at
  // x 0); low boulders along the south edge, where the camera looks from.
  for (let zz = b.z1 + 4; zz > b.z0 - 10; zz -= 15) {
    for (const sd of [-1, 1]) {
      const m: PirateModel = random() < 0.33 ? "mountainA" : random() < 0.5 ? "mountainB" : "mountainC";
      place(m, sd * (b.x1 + 9 + random() * 5), zz + random() * 6, random() * 360, { noCollider: true, scale: 0.8 + random() * 0.3 });
    }
  }
  for (const xx of [-34, -18, 18, 34]) place(random() < 0.5 ? "mountainB" : "mountainC", xx, b.z0 - 10 - random() * 4, random() * 360, { noCollider: true, scale: 0.7 + random() * 0.2 });
  for (let xx = b.x0; xx <= b.x1; xx += 6) place(random() < 0.5 ? "rocksA" : "rocksB", xx, b.z1 + 3, random() * 360, { noCollider: true, scale: 0.8 });
  // Lane through the cave mouth: rocks either side.
  for (let zz = b.z0 - 2; zz > B.cove.z1; zz -= 5) for (const sd of [-1, 1]) place(sd < 0 ? "rocksB" : "rocksC", sd * (GAP + 3), zz, random() * 360, { noCollider: true });
  // Stone pillars and boulders.
  placeAll([
    ["pillar", -14, 20, 0], ["pillar", 14, 4, 0], ["pillar", -10, -4, 0], ["pillar", 18, 30, 0],
    ["rocksC", -18, 12, 40, { scale: 0.7 }], ["rocksA", 20, -6, 120, { scale: 0.6 }], ["rocksB", -20, 34, 200, { scale: 0.6 }],
    ["rock3", 4, 14, 30], ["rock2", -6, 26, 80], ["rock4", 9, -12, 0],
  ]);
  // The hoard, north of the pool: chests of gold, coin heaps, kegs of rum, a skeleton who stayed.
  placeAll([
    ["chestGold", -4, b.z0 + 6, 160], ["chestGold", 4, b.z0 + 5, 200], ["chestGold", -14, b.z0 + 8, 120], ["chestPlain", 14, b.z0 + 7, 230],
    ["coins", 0, b.z0 + 9, 0], ["coins", -8, b.z0 + 10, 40], ["coins", 9, b.z0 + 11, 80], ["coinsSmall", -2, b.z0 + 12, 0],
    ["coinsSmall", 5, b.z0 + 14, 30], ["coinsSmall", -11, b.z0 + 13, 70], ["candles", -6, b.z0 + 7, 0], ["candles", 7, b.z0 + 8, 0],
    ["kegs", -20, b.z0 + 4, 90], ["kegs", 20, b.z0 + 12, -90], ["cratesStacked", 21, b.z0 + 4, 0], ["boxLarge", -21, b.z0 + 12, 20],
    ["skull", -1, b.z0 + 4, 20], ["ribcage", 1.5, b.z0 + 4.2, 0], ["bones", 2.5, b.z0 + 3.5, 50], ["swordShieldBroken", -2, b.z0 + 3, 30],
    ["chest", -16, 30, 70], ["barrel", 16, 18, 0], ["barrel", 17, 16.8, 0], ["crate", -18, -2, 20], ["crateBottles", -16.5, -3, 60],
    ["rowboat", 12, b.z0 + 40, 70, { noCollider: true }], ["paddle", 9, b.z0 + 38, 90], ["lanternStanding", 6, b.z0 + 44, 0],
    ["coffin", -19, 22, 90], ["gravemarker", -17, 24, 0],
  ]);
  for (const [xx, zz] of [[-20, 30], [20, 30], [-20, 6], [-20, -10], [20, -10]]) place("torchLit", xx, zz, 0, { y: 0.4, noCollider: true });
  place("torchLit", -6, b.z0 - 4, 0, { y: 0.4 });
  place("torchLit", 6, b.z0 - 4, 0, { y: 0.4 });
  scatter(["bones", "bonesB", "coinsSmall", "bottle", "rock", "skull"], 30, b, (x, zz) => Math.abs(x) < 4 && zz > b.z1 - 16);
}

/* ------------------------------------------------------------------------------------------------
 * 2 SMUGGLERS' COVE
 * ---------------------------------------------------------------------------------------------- */
function buildCove({ place, placeAll, zoneEdges, laneZ, scatter, random }: Ctx): void {
  const b = B.cove;
  zoneEdges(b, { s: 0, n: EXITS.cove.at });
  laneZ(EXITS.cove.at, b.z0, B.shore.z1);
  // Jungle along the west side: palms, grass, hills beyond.
  for (let zz = b.z1; zz > b.z0 - 10; zz -= 7) {
    place(random() < 0.5 ? "palmDetailed" : "palmDetailedBend", b.x0 - 3 - random() * 4, zz, random() * 360, { noCollider: true, scale: 0.9 + random() * 0.4 });
    place(random() < 0.5 ? "palm" : "palmBend", b.x0 - 10 - random() * 6, zz + 3, random() * 360, { noCollider: true, scale: 1 + random() * 0.4 });
    place("grassPatchFoliage", b.x0 - 6, zz, random() * 360, { noCollider: true });
  }
  for (let zz = b.z1 - 10; zz > b.z0; zz -= 30) place("hills", b.x0 - 26, zz, random() * 360, { noCollider: true });
  // The smugglers' camp: a shack, the fire, crates of contraband.
  placeAll([
    ["shack", -24, b.z1 - 22, 90], ["shackRoof", -24, b.z1 - 22, 90, { noCollider: true }], ["shackFenceSides", -24, b.z1 - 30, 90],
    ["rock", -12, cz - 6, 0], ["rock", -8, cz - 6, 120], ["rock", -10, cz - 4.2, 240], ["rock", -10, cz - 7.8, 60],
    ["crate", -18, cz - 2, 10], ["crate", -17.2, cz - 1, 50], ["crateBottles", -19, cz - 0.4, 30], ["barrel", -20, cz + 4, 0], ["barrel", -21, cz + 5, 0],
    ["flagPirate", -14, cz + 6, 30], ["kegs", -26, b.z1 - 36, 90], ["bottleLarge", -8, cz - 3, 0], ["bottle", -11.5, cz - 8, 0],
    ["hole", -2, b.z0 + 14, 0], ["chest", -2, b.z0 + 14, 20, { y: -0.35 }], ["shovel", 0.5, b.z0 + 15, 30, { tiltX: 18 }],
  ]);
  // Boats pulled up on the sand, and out on the water; a sloop at anchor.
  placeAll([
    ["rowboat", 14, b.z1 - 16, 70], ["rowboatSmall", 12, cz - 12, 100], ["paddle", 10, b.z1 - 18, 20],
    ["rowboat", 32, cz + 6, 20, { noCollider: true, y: SEA_Y + 0.1 }], ["shipSmall", 52, cz - 10, 200, { noCollider: true, scale: 2.2, y: SEA_Y - 1 }],
    ["rocksSandA", 30, b.z1 - 6, 30, { noCollider: true }], ["rocksSandC", 34, b.z0 + 10, 160, { noCollider: true }],
  ]);
  // The lane north: rocks on the sand either side.
  for (let zz = b.z0 - 3; zz > B.shore.z1; zz -= 6) for (const sd of [-1, 1]) place(sd < 0 ? "rocksSandA" : "rocksSandB", EXITS.cove.at + sd * (GAP + 3.2), zz, random() * 360, { noCollider: true, scale: 0.8 });
  scatter(["grass", "grassPlant", "grassTuft", "rock", "bottle", "cannonBall"], 34, b, (x, zz) => Math.abs(x - 0) < 4 && zz > b.z1 - 8);
}

/* ------------------------------------------------------------------------------------------------
 * 3 THE WRECK SHORE (boss: the Bosun)
 * ---------------------------------------------------------------------------------------------- */
function buildShore({ place, placeAll, zoneEdges, laneZ, scatter, random }: Ctx): void {
  const b = B.shore;
  zoneEdges(b, { s: EXITS.cove.at, n: EXITS.shore.at });
  laneZ(EXITS.shore.at, b.z0, B.pier.z1);
  // Jungle to the west.
  for (let zz = b.z1; zz > b.z0 - 10; zz -= 8) {
    place(random() < 0.5 ? "palmDetailed" : "palmBend", b.x0 - 3 - random() * 4, zz, random() * 360, { noCollider: true, scale: 0.9 + random() * 0.4 });
    place("grassPatchFoliage", b.x0 - 7, zz + 4, random() * 360, { noCollider: true });
  }
  place("hills", b.x0 - 24, sz, 0, { noCollider: true });
  // Wrecks on the sand: a hulk on its side at the west edge, a sloop rolled over in the shallows,
  // a whale's ribs bleaching in the middle (cover in the boss fight).
  placeAll([
    ["shipWreck", b.x0 - 4, sz + 16, 75, { noCollider: true, scale: 2.0, tiltZ: -28, y: -1.2 }],
    ["shipSmall", 30, sz - 14, 160, { noCollider: true, scale: 1.8, tiltZ: 34, y: SEA_Y - 1.2 }],
    ["shipMerchantSmall", 46, sz + 24, 250, { noCollider: true, scale: 2, y: SEA_Y - 1.5 }],
  ]);
  // Wreckage washed up mid-beach: a broken longboat, a mast's stump, planks and a gun (cover in the boss fight).
  placeAll([
    ["rowboat", -4, sz + 2, 30, { tiltZ: 18, y: -0.2 }], ["planks", -1, sz - 1, 70, { tiltX: 8 }], ["planks", -6, sz - 4, 140],
    ["cannonMobile", 3, sz + 5, 200, { tiltZ: 12 }], ["barrel", -8, sz + 4, 0, { tiltZ: 90, y: 0.5 }], ["crate", 4, sz - 6, 30],
  ]);
  placeAll([
    ["rocksSandA", -26, sz + 6, 20, { scale: 0.8 }], ["rocksSandB", 10, sz + 22, 100, { scale: 0.7 }], ["rocksSandC", -18, sz - 22, 250, { scale: 0.8 }],
    ["rocksSandA", 14, sz - 30, 300, { scale: 0.6 }], ["cannon", -14, sz + 26, 200, { tiltX: 14, y: -0.3 }], ["cannon", 12, sz - 6, 40, { tiltZ: 20, y: -0.3 }],
    ["barrel", -10, sz - 30, 0], ["barrel", -9, sz - 31, 0, { tiltZ: 80, y: 0.1 }], ["crate", 4, sz + 30, 20], ["crate", 5, sz + 31.2, 50],
    ["cratesStacked", -30, sz - 10, 10], ["flagPiratePennant", -22, sz - 34, 0], ["rowboat", 14, sz + 12, 210, { tiltZ: 160, y: 0.8 }],
  ]);
  scatter(["bones", "bonesB", "cannonBall", "bottle", "grassTuft", "rock", "planks"], 40, b, (x, zz) => Math.abs(x) < 6 && Math.abs(zz - sz) < 6);
}

/* ------------------------------------------------------------------------------------------------
 * 4 THE ROTTEN PIER
 * ---------------------------------------------------------------------------------------------- */
function buildPier({ place, placeAll, wall, random }: Ctx): void {
  const b = B.pier;
  // The pier's edges (open at both ends), the lane from the shore onto it.
  wall(b.x0 - 0.5, b.z1 + 0.5, b.x0 - 0.5, b.z0 - 0.5);
  wall(b.x1 + 0.5, b.z1 + 0.5, b.x1 + 0.5, b.z0 - 0.5);
  wall(b.x0 - 0.5, b.z1 + 0.5, EXITS.shore.at - GAP, b.z1 + 0.5);
  wall(EXITS.shore.at + GAP, b.z1 + 0.5, b.x1 + 0.5, b.z1 + 0.5);
  // The boards are ground (GROUND_SPEC); platforms under its edges give it sides and mooring posts.
  const T = 3.125, k = 0.625;
  for (let zz = b.z1 + T / 2, row = 0; zz > b.z0 - 9.5; zz -= T, row++) {
    for (const xx of [b.x0 + T / 2 - 0.6, b.x1 - T / 2 + 0.6]) place(row % 4 === 0 ? "dockPosts" : "dock", xx, zz, xx < 6 ? 0 : 180, { y: -1.86 * k - 0.05, noCollider: true, scale: k });
  }
  // The gangway beyond the end, to the galleon's bow.
  for (let zz = b.z0 - 2.5; zz > b.z0 - 9; zz -= 3.5) place("planks", 6, zz, 0, { y: -0.4, noCollider: true, scale: [1.6, 1, 1] });
  wall(6 - GAP - 0.5, b.z0, 6 - GAP - 0.5, b.z0 - 8);
  wall(6 + GAP + 0.5, b.z0, 6 + GAP + 0.5, b.z0 - 8);
  // On the pier: crates, barrels, nets of cargo, lantern posts, a pair of guns at the end.
  for (let i = 0; i * 16 < b.z1 - b.z0 - 4; i++) {
    const zz = b.z1 - 8 - i * 16;
    place("lanternPost", b.x0 - 0.5, zz, 90);
    place("lanternPost", b.x1 + 0.5, zz, -90);
  }
  placeAll([
    ["cratesStacked", -1, b.z1 - 18, 0], ["crate", 13, b.z1 - 26, 30], ["crate", 13.5, b.z1 - 27.4, 70], ["barrel", 0, b.z1 - 34, 0],
    ["barrel", 1, b.z1 - 35.1, 0], ["kegs", 13, b.z1 - 44, 90], ["crateBottles", -1, b.z1 - 52, 10], ["cratesStacked", 13, b.z1 - 62, 0],
    ["barrel", -1.4, b.z1 - 70, 0], ["chest", 0, b.z1 - 78, 90], ["crate", 12.8, b.z1 - 84, 10],
    ["cannon", 1, b.z0 + 3, 160], ["cannon", 11, b.z0 + 3, 200], ["cannonBall", 3, b.z0 + 4, 0], ["cannonBall", 3.4, b.z0 + 4.3, 0],
    ["flagPirateHigh", b.x1 - 1, b.z0 + 2, 0],
  ]);
  // Moored either side: a pirate ship west, a merchantman east; boats on the water.
  placeAll([
    ["shipLarge", -22, b.z1 - 40, 180, { noCollider: true, scale: 3.2, y: SEA_Y - 2.5 }],
    ["shipMerchant", 36, b.z1 - 70, 0, { noCollider: true, scale: 3.2, y: SEA_Y - 2.5 }],
    ["rowboat", 24, b.z1 - 20, 40, { noCollider: true, y: SEA_Y }], ["rowboatSmall", -12, b.z0 + 14, 120, { noCollider: true, y: SEA_Y }],
  ]);
  // The reef line under the pier's foot (it hides where the lagoon gets shallower) and rocks in the water.
  for (let xx = -60; xx < 70; xx += 7) if (Math.abs(xx - 6) > 14) place(random() < 0.5 ? "rocksA" : "rocksC", xx, b.z1 + 8 + random() * 4, random() * 360, { noCollider: true, y: SEA_Y - 0.8, scale: 0.8 + random() * 0.5 });
}

/* ------------------------------------------------------------------------------------------------
 * 5 THE BROKEN DECK (the galleon's bow half)
 * ---------------------------------------------------------------------------------------------- */
function buildDeck({ place, placeAll, wall, random }: Ctx): void {
  const b = B.deck, s = WRECK.s, X = WRECK.x, Z = WRECK.z;
  place("deckWreckBow", X, Z, 0, { scale: s, y: -2.1 * s - 0.04, noCollider: true });
  // Rails: the full-width waist, then the bow converging to the open tip (model z 1.7 -> 3.4).
  const halfW = 2.05 * s;
  wall(X - halfW, b.z0 - 1, X - halfW, Z + 1.7 * s);
  wall(X + halfW, b.z0 - 1, X + halfW, Z + 1.7 * s);
  wall(X - halfW, Z + 1.7 * s, X - GAP - 0.5, Z + 3.4 * s);
  wall(X + halfW, Z + 1.7 * s, X + GAP + 0.5, Z + 3.4 * s);
  wall(X - GAP - 0.5, Z + 3.4 * s, X - GAP - 0.5, B.pier.z0);
  wall(X + GAP + 0.5, Z + 3.4 * s, X + GAP + 0.5, B.pier.z0);
  // The region's south line (the lane from the bow opens at x 6) and the broken north edge.
  wall(X - halfW, b.z1 + 0.5, X - GAP, b.z1 + 0.5);
  wall(X + GAP, b.z1 + 0.5, X + halfW, b.z1 + 0.5);
  wall(X - halfW, b.z0 - 0.5, X - GAP, b.z0 - 0.5);
  wall(X + GAP, b.z0 - 0.5, X + halfW, b.z0 - 0.5);
  // The masts and the hatch are gone (cut from the kit model: from the camera they were walls
  // through the middle of the fight); the deck is planked over.
  // Guns along both rails, facing out; powder, shot and lashed cargo; wreckage at the break.
  for (let zz = b.z1 - 4; zz > b.z0 + 3; zz -= 7.5) {
    place("cannon", X - halfW + 1.6, zz, -90);
    place("cannon", X + halfW - 1.6, zz - 3, 90);
  }
  placeAll([
    ["barrel", X - 9, b.z1 - 8, 0], ["barrel", X - 8, b.z1 - 9, 0], ["kegs", X + 9, b.z1 - 14, 0], ["cratesStacked", X - 10, Z - 3, 0],
    ["crate", X + 6, Z + 8, 20], ["crateBottles", X + 7, Z + 9.2, 60], ["cannonBall", X - 6, Z - 6, 0], ["cannonBall", X - 5.6, Z - 6.4, 0],
    ["chest", X + 11, b.z0 + 4, 200], ["flagPirate", X + 3, b.z1 - 2, 0],
    ["rubble", X - 8, b.z0 + 1, 10, { scale: 0.6 }], ["rubbleHalf", X + 9, b.z0 + 1.5, 160], ["planks", X - 2, b.z0 + 3, 30, { tiltZ: 25, y: 0.2 }],
    ["planks", X + 4, b.z0 + 2, -20, { tiltX: 20, y: 0.3 }], ["swordShieldBroken", X + 2, Z + 3, 60],
  ]);
  // The plank bridge from the break to the stern half (over the gap of water).
  for (let zz = b.z0 - 1.5; zz > B.hold.z1 - 2; zz -= 3.5) place("planks", X, zz, 0, { y: -0.4, noCollider: true, scale: [1.6, 1, 1] });
  wall(X - GAP - 0.5, b.z0, X - GAP - 0.5, B.hold.z1);
  wall(X + GAP + 0.5, b.z0, X + GAP + 0.5, B.hold.z1);
  // Rocks of the reef round the hull.
  for (let i = 0; i < 18; i++) {
    const sd = i % 2 ? 1 : -1;
    place(random() < 0.5 ? "rocksA" : "rocksB", X + sd * (halfW + 4 + random() * 10), b.z1 + 10 - random() * 60, random() * 360, { noCollider: true, y: SEA_Y - 1, scale: 0.7 + random() * 0.6 });
  }
}

/* ------------------------------------------------------------------------------------------------
 * 6 THE FLOODED HOLD (the stern half, cut open)
 * ---------------------------------------------------------------------------------------------- */
function buildHold({ place, placeAll, wall, blockCircle, random, root }: Ctx): void {
  const b = B.hold, s = HOLD.s, X = HOLD.x, Z = HOLD.z;
  place("hullOpen", X, Z, 0, { scale: s, y: -0.2 * s - 0.04, noCollider: true });
  // The hull's sides (the breach open on the west), the far end, the open south end (the lane in).
  wall(b.x1 + 0.5, b.z1 + 4, b.x1 + 0.5, b.z0 - 0.5);
  wall(b.x0 - 0.5, b.z1 + 4, b.x0 - 0.5, BREACH_Z + GAP);
  wall(b.x0 - 0.5, BREACH_Z - GAP, b.x0 - 0.5, b.z0 - 0.5);
  wall(b.x0 - 0.5, b.z0 - 0.5, b.x1 + 0.5, b.z0 - 0.5);
  wall(b.x0 - 0.5, b.z1 + 0.5, X - GAP, b.z1 + 0.5);
  wall(X + GAP, b.z1 + 0.5, b.x1 + 0.5, b.z1 + 0.5);
  // Cargo: barrels, kegs, crates, the dead in their hammocks' place; posts holding the deck that is gone.
  for (let zz = b.z1 - 8; zz > b.z0 + 4; zz -= 10) for (const sd of [-1, 1]) blockCircle(X + sd * 4, zz, 0.45);
  for (let zz = b.z1 - 8; zz > b.z0 + 4; zz -= 10) for (const sd of [-1, 1]) place("column", X + sd * 4, zz, 0, { scale: [1.2, 2.2, 1.2], noCollider: true });
  placeAll([
    ["barrel", X - 8, b.z1 - 5, 0], ["barrel", X - 8.2, b.z1 - 6.2, 0], ["barrel", X - 7, b.z1 - 5.6, 0, { y: 1 }], ["kegs", X + 8, b.z1 - 12, -90],
    ["cratesStacked", X + 8, b.z1 - 22, 0], ["crate", X - 8, b.z1 - 26, 10], ["crateBottles", X - 8.3, b.z1 - 27.5, 70], ["chestPlain", X + 8, b.z0 + 8, -90],
    ["coffin", X - 8, b.z0 + 12, 0], ["coffin", X + 8, b.z1 - 32, 0], ["barrel", X + 8.4, b.z0 + 16, 0], ["boxLarge", X - 8, b.z0 + 4, 30],
    ["cannon", X + 6, b.z0 + 3, 180], ["cannonBall", X + 4, b.z0 + 3, 0], ["skull", X - 2, b.z1 - 18, 40], ["bones", X + 1, b.z1 - 30, 10],
  ]);
  for (const [dx, f] of [[-6, 0.15], [6, 0.35], [-6, 0.55], [6, 0.75], [-5, 0.92]]) place("lanternStanding", X + dx, b.z1 - (b.z1 - b.z0) * f, 0, { y: 0.15 });
  // The plank out through the breach to the shallows.
  for (let xx = b.x0 - 1.5; xx > B.shallows.x1 - 2; xx -= 3.5) place("planks", xx, BREACH_Z, 90, { y: -0.4, noCollider: true, scale: [1.6, 1, 1] });
  wall(b.x0, BREACH_Z - GAP - 0.5, B.shallows.x1, BREACH_Z - GAP - 0.5);
  wall(b.x0, BREACH_Z + GAP + 0.5, B.shallows.x1, BREACH_Z + GAP + 0.5);
  // The water coming in: a sheet that rises while the level lasts (PIRATE_BIOME.campaign).
  const flood = new Entity("hold-flood");
  const m = new StandardMaterial();
  m.diffuse.set(0, 0, 0);
  m.emissive = new Color(0.2, 0.48, 0.5);
  m.useLighting = false;
  m.opacity = 0.5;
  m.blendType = BLEND_NORMAL;
  m.depthWrite = false;
  m.update();
  flood.addComponent("render", { type: "plane", material: m, castShadows: false, receiveShadows: false });
  flood.setLocalScale(b.x1 - b.x0 + 3, 1, b.z1 - b.z0 + 2);
  flood.setLocalPosition(X, -0.3, (b.z0 + b.z1) / 2);
  root.addChild(flood);
  world.flood = { entity: flood, level: -0.3, target: -0.3 };
  void random;
}

/* ------------------------------------------------------------------------------------------------
 * 7 THE REEF SHALLOWS
 * ---------------------------------------------------------------------------------------------- */
function buildShallows({ place, placeAll, zoneEdges, laneZ, scatter, random }: Ctx): void {
  const b = B.shallows;
  zoneEdges(b, { e: BREACH_Z, n: WEST_X });
  laneZ(WEST_X, b.z0, B.fort.z1);
  // Reef heads, coral rocks and weed; a wreck run aground; palms on the far bar.
  placeAll([
    ["rocksA", WEST_X - 18, b.z1 - 16, 30, { scale: 0.8 }], ["rocksC", WEST_X + 6, b.z1 - 24, 110, { scale: 0.9 }], ["rocksB", WEST_X - 4, b.z0 + 22, 200, { scale: 0.7 }],
    ["rocksSandB", WEST_X + 20, b.z0 + 12, 60, { scale: 0.7 }], ["rocksSandA", WEST_X - 24, b.z0 + 30, 300, { scale: 0.8 }], ["rocksC", WEST_X + 14, b.z1 - 50, 10, { scale: 0.6 }],
    ["shipSmall", b.x0 - 8, b.z1 - 30, 100, { noCollider: true, scale: 1.8, tiltZ: -22, y: -1.4 }],
    ["rowboatSmall", WEST_X + 10, b.z0 + 32, 140, { tiltZ: 12 }], ["barrel", WEST_X - 10, b.z1 - 40, 0, { tiltZ: 90, y: 0.3 }],
    ["chest", WEST_X - 28, b.z0 + 6, 30], ["cannon", WEST_X + 24, b.z1 - 8, 210, { tiltZ: 16, y: -0.2 }],
  ]);
  for (let i = 0; i < 10; i++) place(random() < 0.5 ? "palmBend" : "palmDetailedBend", b.x0 - 4 - random() * 10, b.z1 - i * 8, random() * 360, { noCollider: true, scale: 0.9 + random() * 0.3 });
  // Rocks along the lane to the fort's stair.
  for (let zz = b.z0 - 3; zz > B.fort.z1; zz -= 5) for (const sd of [-1, 1]) place("rocksB", WEST_X + sd * (GAP + 3.2), zz, random() * 360, { noCollider: true, scale: 0.8 });
  // Reef heads and coral rocks across the bars (cover; the tide breaks over them).
  for (let i = 0; i < 26; i++) {
    const x = b.x0 + 4 + random() * (b.x1 - b.x0 - 8), zz = b.z0 + 4 + random() * (b.z1 - b.z0 - 8);
    if ((Math.abs(zz - BREACH_Z) < 5 && x > b.x1 - 12) || (Math.abs(x - WEST_X) < 5 && zz < b.z0 + 10)) continue;
    const big = random() < 0.35;
    place(big ? (random() < 0.5 ? "rocksA" : "rocksSandB") : random() < 0.5 ? "rock2" : "rock3", x, zz, random() * 360, { scale: big ? 0.45 + random() * 0.25 : 1 + random() * 0.6 });
  }
  scatter(["waterplant", "waterplant2", "rock", "grassTuft", "bonesB", "cannonBall", "bottle"], 60, b, (x, zz) => Math.abs(zz - BREACH_Z) < 4 && x > b.x1 - 8);
}

/* ------------------------------------------------------------------------------------------------
 * 8 THE CLIFF FORT
 * ---------------------------------------------------------------------------------------------- */
function buildFort({ place, placeAll, zoneEdges, laneZ, random }: Ctx): void {
  const b = B.fort;
  zoneEdges(b, { s: WEST_X, n: WEST_X });
  laneZ(WEST_X, b.z0, B.skull.z1);
  // Curtain walls (13 m sections) round the yard, gates south and north; the south wall low (the camera looks over it).
  const run = (ax: number, az: number, bx: number, bz: number, id: PirateModel, h = 1, skipMid = false) => {
    const len = Math.hypot(bx - ax, bz - az), count = Math.max(1, Math.round(len / 13)), w = len / count;
    const dx = (bx - ax) / len, dz = (bz - az) / len, yaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
    for (let i = 0; i < count; i++) {
      const px = ax + dx * w * (i + 0.5), pz = az + dz * w * (i + 0.5);
      if (skipMid && Math.abs(px - WEST_X) < 7 && Math.abs(dz) < 0.1) { place("curtainGate", px, pz, yaw, { scale: [w / 13, h, 1], noCollider: true }); continue; }
      place(id, px, pz, yaw, { scale: [w / 13, h, 1], noCollider: true });
    }
  };
  // The south wall is down (the camera looks in over it): rubble and broken stubs, gateposts.
  for (let xx = b.x0; xx < b.x1; xx += 4.2) {
    if (Math.abs(xx - WEST_X) < 5) continue;
    place(random() < 0.6 ? "wallBroken" : "rubbleHalf", xx, b.z1 + 2, random() < 0.5 ? 0 : 180, { scale: [1.05, 0.45, 1], noCollider: true });
  }
  place("towerBase", WEST_X - 6, b.z1 + 3, 0, { noCollider: true, scale: 0.5 });
  place("towerBase", WEST_X + 6, b.z1 + 3, 0, { noCollider: true, scale: 0.5 });
  run(b.x0 - 2.6, b.z0 - 2.6, b.x1 + 2.6, b.z0 - 2.6, "curtainWall", 1, true);
  run(b.x0 - 2.6, b.z1 + 2.6, b.x0 - 2.6, b.z0 - 2.6, "curtainWall");
  run(b.x1 + 2.6, b.z1 + 2.6, b.x1 + 2.6, b.z0 - 2.6, "curtainWall", 0.7);
  placeAll([
    ["towerLarge", b.x0 - 4, b.z0 - 4, 0, { noCollider: true }], ["towerLarge", b.x1 + 4, b.z0 - 4, 0, { noCollider: true }],
    ["towerSmall", b.x0 - 4, b.z1 + 4, 0, { noCollider: true, scale: 0.8 }], ["towerSmall", b.x1 + 4, b.z1 + 4, 0, { noCollider: true, scale: 0.8 }],
    ["flagPirateHigh", b.x0 - 4, b.z0 - 4, 0, { y: 18, noCollider: true, scale: 1.4 }], ["flagPirateHigh", b.x1 + 4, b.z0 - 4, 0, { y: 18, noCollider: true, scale: 1.4 }],
  ]);
  // The battery along the sea wall (east): guns facing out, shot, powder.
  for (let zz = b.z1 - 8; zz > b.z0 + 6; zz -= 9) {
    place(random() < 0.5 ? "cannonMobile" : "cannon", b.x1 - 3, zz, 90);
    place("cannonBall", b.x1 - 5.5, zz + 1.5, 0);
    place("cannonBall", b.x1 - 5.2, zz + 1.9, 0);
  }
  // The yard: low bastion walls as cover, powder stores, a ruined barracks, the chart table.
  placeAll([
    ["wallHalf", WEST_X - 14, b.z1 - 20, 0], ["wallHalf", WEST_X - 12, b.z1 - 20, 0], ["wallBroken", WEST_X + 12, b.z1 - 30, 0, { scale: [1, 0.6, 1] }],
    ["wallHalf", WEST_X - 4, (b.z0 + b.z1) / 2, 90], ["wallHalf", WEST_X + 16, b.z0 + 22, 0], ["wallHalf", WEST_X + 18, b.z0 + 22, 0],
    ["kegs", b.x1 - 10, b.z0 + 6, 0], ["kegs", b.x1 - 12, b.z0 + 6, 0], ["barrel", b.x1 - 8, b.z1 - 4, 0], ["boxLarge", WEST_X + 24, b.z1 - 50, 20],
    ["ruin", b.x0 + 9, b.z0 + 12, 90, { scale: 0.9 }], ["cratesStacked", b.x0 + 6, b.z1 - 10, 0], ["crate", b.x0 + 8, b.z1 - 14, 30],
    ["chestPlain", WEST_X - 20, b.z0 + 8, 90], ["column", WEST_X + 3, b.z1 - 40, 0], ["swordShieldBroken", WEST_X - 7, b.z1 - 46, 20],
  ]);
  // Gun emplacements and stores across the yard: clusters of cover in rows (lanes kept clear at the gates).
  const clusters: Placement[][] = [
    [["kegs", 0, 0, 0], ["barrel", 1.6, 1.2, 0], ["barrel", -1.4, 1, 0]],
    [["cratesStacked", 0, 0, 0], ["crate", 2, 0.4, 20], ["crate", 1.4, 1.6, 60]],
    [["cannonMobile", 0, 0, 180], ["cannonBall", 1.4, -0.6, 0], ["cannonBall", 1.7, -0.3, 0], ["cannonBall", 1.2, -0.2, 0]],
    [["wallHalf", 0, 0, 0], ["wallHalf", 2, 0, 0], ["rubbleHalf", 3.8, 0.6, 30]],
    [["boxLarge", 0, 0, 10], ["barrel", 1.5, 0.3, 0], ["chestPlain", -1.6, 0.2, 90]],
  ];
  let n = 0;
  for (let zz = b.z1 - 14; zz > b.z0 + 10; zz -= 13) {
    for (const xx of [b.x0 + 12, WEST_X - 13, WEST_X + 13, b.x1 - 14]) {
      if (random() < 0.25) continue;
      const c = clusters[n++ % clusters.length], yaw = random() * 40 - 20;
      for (const [id, ox, oz, y, o] of c) place(id, xx + ox, zz + oz, (y ?? 0) + yaw, o);
    }
  }
  // Grass and palms on the headland outside the walls.
  for (let zz = b.z1; zz > b.z0; zz -= 12) place("palmDetailed", b.x0 - 12 - random() * 6, zz, random() * 360, { noCollider: true });
  // Cliffs below the sea wall.
  for (let zz = b.z1 + 10; zz > b.z0 - 10; zz -= 14) place(random() < 0.5 ? "rocksA" : "rocksB", b.x1 + 10 + random() * 4, zz, random() * 360, { noCollider: true, scale: 1.2, y: SEA_Y - 0.5 });
}

/* ------------------------------------------------------------------------------------------------
 * 9 SKULL ROCK (boss: the Sea Hag)
 * ---------------------------------------------------------------------------------------------- */
function buildSkull({ place, placeAll, zoneEdges, wall, random }: Ctx): void {
  const b = B.skull;
  zoneEdges(b, { s: WEST_X, n: WEST_X });
  // The great skull in the water north-west, the reef round the lagoon, dead trees on the ledges.
  placeAll([
    ["skull", kx - 26, b.z0 - 16, 25, { noCollider: true, scale: 26, y: SEA_Y - 1.2 }],
    ["rocksA", kx - 40, b.z0 - 6, 30, { noCollider: true, scale: 1.6, y: SEA_Y - 0.6 }], ["rocksB", kx - 14, b.z0 - 10, 200, { noCollider: true, scale: 1.4, y: SEA_Y - 0.6 }],
    ["rocksC", b.x0 - 6, kz, 90, { noCollider: true, scale: 1.5 }], ["rocksB", b.x1 + 6, kz + 10, 300, { noCollider: true, scale: 1.4 }],
    ["treeDead", b.x0 + 6, b.z1 - 12, 30], ["treeDeadMedium", b.x1 - 8, b.z1 - 18, 120], ["treeDead", b.x1 - 6, b.z0 + 10, 250], ["treeDeadMedium", b.x0 + 8, b.z0 + 14, 60],
    ["postSkull", WEST_X - 6, b.z1 - 3, 0], ["postSkull", WEST_X + 6, b.z1 - 3, 0], ["lanternPost", WEST_X - 5, b.z0 + 3, 0], ["lanternPost", WEST_X + 5, b.z0 + 3, 0],
    ["chestGold", b.x0 + 5, kz - 6, 60], ["coins", b.x0 + 6, kz - 3, 10], ["rocksSandC", b.x0 + 12, kz + 14, 30, { scale: 0.7 }], ["rocksSandA", b.x1 - 12, kz - 16, 130, { scale: 0.7 }],
    ["ribcage", WEST_X + 16, kz + 8, 30, { scale: 3, noCollider: true }], ["skull", WEST_X - 14, kz - 12, 200, { scale: 2 }],
  ]);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    place(random() < 0.5 ? "rock2" : "rock3", WEST_X + Math.cos(a) * 12.5, kz - 4 + Math.sin(a) * 10, random() * 360, { noCollider: true, scale: 0.8 });
  }
  // The boarding plank to the flagship's bow; the reef line hides the step down to deep water.
  for (let zz = b.z0 - 1.5; zz > b.z0 - 8; zz -= 3.5) place("planks", WEST_X, zz, 0, { y: -0.4, noCollider: true, scale: [1.6, 1, 1] });
  for (let xx = -140; xx < 40; xx += 6) if (Math.abs(xx - WEST_X) > 22) place(random() < 0.5 ? "rocksA" : "rocksC", xx, b.z0 - 12 + random() * 3, random() * 360, { noCollider: true, y: SEA_Y - 0.8, scale: 1 + random() * 0.5 });
  wall(WEST_X - GAP - 0.5, b.z0, WEST_X - GAP - 0.5, b.z0 - 8);
  wall(WEST_X + GAP + 0.5, b.z0, WEST_X + GAP + 0.5, b.z0 - 8);
}

/* ------------------------------------------------------------------------------------------------
 * 10 THE GHOST FLAGSHIP (boss: the Captain)
 * ---------------------------------------------------------------------------------------------- */
function buildFlagship({ place, placeAll, wall, random }: Ctx): void {
  const b = B.flagship, s = GHOST.s, X = GHOST.x, Z = GHOST.z;
  place("deckGhost", X, Z, 0, { scale: s, y: -2.1 * s - 0.04, noCollider: true });
  const halfW = 2.05 * s;
  wall(X - halfW, b.z0 - 2, X - halfW, Z + 1.7 * s);
  wall(X + halfW, b.z0 - 2, X + halfW, Z + 1.7 * s);
  wall(X - halfW, Z + 1.7 * s, X - GAP - 0.5, Z + 3.4 * s);
  wall(X + halfW, Z + 1.7 * s, X + GAP + 0.5, Z + 3.4 * s);
  wall(X - GAP - 0.5, Z + 3.4 * s, X - GAP - 0.5, B.skull.z0 - 7);
  wall(X + GAP + 0.5, Z + 3.4 * s, X + GAP + 0.5, B.skull.z0 - 7);
  wall(X - halfW, b.z1 + 0.5, X - GAP, b.z1 + 0.5);
  wall(X + GAP, b.z1 + 0.5, X + halfW, b.z1 + 0.5);
  // The quarterdeck's front wall (model z -1.9) closes the north.
  wall(X - halfW, b.z0 - 0.5, X + halfW, b.z0 - 0.5);
  // Guns along the rails, the Captain's plunder by the quarterdeck, coffins of his drowned crew.
  for (let zz = b.z1 - 5; zz > b.z0 + 3; zz -= 8) {
    place("cannon", X - halfW + 1.6, zz, -90);
    place("cannon", X + halfW - 1.6, zz - 4, 90);
  }
  placeAll([
    ["chestGold", X - 6, b.z0 + 2.5, 180], ["chestGold", X + 6, b.z0 + 2.5, 180], ["coins", X - 3, b.z0 + 3, 0], ["coins", X + 3, b.z0 + 3.5, 60],
    ["coffin", X - 14, Z + 6, 0], ["coffin", X + 14, Z - 6, 0], ["barrel", X - 15, b.z1 - 6, 0], ["barrel", X - 14, b.z1 - 7, 0],
    ["kegs", X + 15, b.z1 - 10, 0], ["lanternStanding", X - 4, b.z1 - 3, 0], ["lanternStanding", X + 4, b.z1 - 3, 0],
    ["skull", X + 9, Z + 2, 40], ["bones", X - 9, Z - 4, 0],
  ]);
  // The ghost fleet in the deep water round her, sails up.
  placeAll([
    ["shipGhost", X - 70, Z + 10, 20, { noCollider: true, scale: 3.4, y: DEEP_Y - 2 }],
    ["shipGhost", X + 72, Z - 20, 200, { noCollider: true, scale: 3.6, y: DEEP_Y - 2 }],
    ["shipGhost", X - 30, Z - 120, 90, { noCollider: true, scale: 3.2, y: DEEP_Y - 2 }],
    ["shipWreck", X + 50, Z + 50, 300, { noCollider: true, scale: 2.4, y: DEEP_Y - 1, tiltZ: 18 }],
  ]);
  for (let i = 0; i < 10; i++) place(random() < 0.5 ? "rocksA" : "rocksB", X + (random() < 0.5 ? -1 : 1) * (halfW + 14 + random() * 20), Z + 40 - random() * 90, random() * 360, { noCollider: true, y: DEEP_Y - 1.5, scale: 1 + random() });
}

/* ------------------------------------------------------------------------------------------------
 * Colour: flora along the edges, shells and starfish on the sand, coral on the reef, flags and
 * banners, buoys on the water - kept off the lanes and away from where the hero starts.
 * ---------------------------------------------------------------------------------------------- */
function buildColour({ place, placeAll, random }: Ctx): void {
  const pick = <T,>(a: T[]) => a[Math.floor(random() * a.length)];
  const sprinkle = (ids: PirateModel[], n: number, b: Box, lane: number | null, opts: () => SpawnOptions = () => ({})) => {
    for (let i = 0; i < n; i++) {
      const x = b.x0 + random() * (b.x1 - b.x0), zz = b.z0 + random() * (b.z1 - b.z0);
      if (lane !== null && Math.abs(x - lane) < GAP + 1 && (zz > b.z1 - 10 || zz < b.z0 + 10)) continue;
      place(pick(ids), x, zz, random() * 360, opts());
    }
  };
  const shellsAndStars: PirateModel[] = ["starfish", "starfishRed", "starfishPurple", "shells", "conch", "shells"];
  const flora: PirateModel[] = ["bushRed", "bushYellow", "bushPink", "fern", "fern", "grassPatchFoliage"];
  // The beach: shells and starfish; a hedge of flowering bushes and ferns along the jungle side;
  // tiki torches lining the walk; buoys and a raft on the water.
  for (const id of ["cove", "shore"] as const) {
    const b = B[id];
    sprinkle(shellsAndStars, 70, b, EXITS[id].at, () => ({ scale: 1.2 + random() * 0.8 }));
    for (let zz = b.z1; zz > b.z0; zz -= 3.2) {
      place(pick(flora), b.x0 + 1 + random() * 5, zz + random() * 2, random() * 360, { scale: 0.9 + random() * 0.6 });
      if (random() < 0.6) place(pick(flora), b.x0 - 3 - random() * 6, zz, random() * 360, { scale: 1 + random() * 0.6, noCollider: true });
    }
    for (let i = 0; i < 6; i++) place("buoy", 30 + random() * 26, b.z1 - random() * (b.z1 - b.z0), random() * 360, { y: SEA_Y - 0.35, noCollider: true });
  }
  for (const [x, zz] of TIKIS) place("tiki", x, zz, 0);
  placeAll([
    ["flagRed", -20, B.cove.z1 - 18, 30], ["flagYellow", -28, B.cove.z1 - 18, 60], ["bannerBlue", -24, B.cove.z1 - 19.6, 0, { noCollider: true, y: 0.6 }],
    ["tent", -24, cz + 14, 70], ["sack", -21, cz + 12, 0], ["sack", -21.8, cz + 12.6, 40], ["bucket", -19.5, cz + 11, 0], ["crateOpen", -17, cz + 16, 20],
    ["bottlesGreen", -16.4, cz + 15.6, 0], ["raft", 34, cz - 20, 30, { y: SEA_Y + 0.05, noCollider: true }],
    ["flagBlue", -26, sz - 34, 0], ["flagRed", 10, sz + 34, 0], ["tent", -30, sz + 26, 110],
  ]);
  // The grotto: green and brown bottles, open crates of plunder, candles, a red and a gold banner.
  sprinkle(["bottlesGreen", "bottlesBrown", "candles", "coinsSmall", "sack"], 26, B.grotto, 0);
  placeAll([
    ["crateOpen", -10, B.grotto.z0 + 6, 20], ["crateOpen", 12, B.grotto.z0 + 4, -30], ["bannerRed", -6, B.grotto.z0 - 1.6, 0, { noCollider: true, y: 1 }],
    ["bannerYellow", 6, B.grotto.z0 - 1.6, 0, { noCollider: true, y: 1 }], ["lanternStanding", -12, 20, 0], ["lanternStanding", 12, 10, 0],
  ]);
  // The pier: buoys and floats along it, flags in red, blue and yellow on its posts, sacks and open crates.
  const pb = B.pier;
  for (let zz = pb.z1 - 4, i = 0; zz > pb.z0; zz -= 9, i++) {
    place(["flagRed", "flagBlue", "flagYellow"][i % 3] as PirateModel, i % 2 ? pb.x1 + 0.4 : pb.x0 - 0.4, zz, i % 2 ? -90 : 90, { noCollider: true });
    place("buoy", i % 2 ? pb.x0 - 4 - random() * 6 : pb.x1 + 4 + random() * 6, zz - 3, random() * 360, { y: SEA_Y - 0.35, noCollider: true });
  }
  sprinkle(["sack", "crateOpen", "bucket", "bottlesBrown", "barrel"], 18, { x0: pb.x0 + 1, z0: pb.z0 + 4, x1: pb.x1 - 1, z1: pb.z1 - 8 }, 6);
  // The decks and the hold: cargo spilled, sacks, bottles; the ghost ship flies green banners.
  sprinkle(["sack", "crateOpen", "bottlesGreen", "bucket", "shells"], 16, B.deck, 6);
  sprinkle(["sack", "bottlesGreen", "bottlesBrown", "candles", "crateOpen"], 18, B.hold, null);
  sprinkle(["bottlesGreen", "candles", "sack"], 12, B.flagship, GHOST.x);
  // The shallows: coral, sea fans and kelp on the reef, starfish everywhere, lilies in the pools.
  const sb = B.shallows;
  sprinkle(["coralPink", "coralOrange", "seaFan", "kelp", "coralPink"], 46, sb, WEST_X, () => ({ scale: 0.9 + random() * 0.9 }));
  sprinkle(shellsAndStars, 70, sb, WEST_X, () => ({ scale: 1.2 + random() * 0.8 }));
  for (const p of SEA_POOLS) if (p.soft && !p.solid && p.z < sb.z1 && p.z > sb.z0) for (let k = 0; k < 4; k++) place(random() < 0.5 ? "waterlily" : "waterlily2", p.x + (random() - 0.5) * p.w * 0.6, p.z + (random() - 0.5) * p.d * 0.6, random() * 360, { y: 0.02 });
  for (let i = 0; i < 18; i++) place(pick(["coralPink", "coralOrange", "seaFan", "kelp"] as PirateModel[]), sb.x1 + 3 + random() * 14, sb.z1 - random() * (sb.z1 - sb.z0), random() * 360, { y: SEA_Y - 0.4, noCollider: true, scale: 1 + random() });
  // The fort: banners hung on its walls, flags on its towers, tents and stores in the yard.
  const fb = B.fort;
  for (let zz = fb.z1 - 8, i = 0; zz > fb.z0 + 4; zz -= 11, i++) place(["bannerRed", "bannerBlue", "bannerYellow"][i % 3] as PirateModel, fb.x0 - 0.2, zz, 90, { noCollider: true, y: 1.5, scale: 1.3 });
  for (let xx = fb.x0 + 8, i = 0; xx < fb.x1 - 4; xx += 10, i++) if (Math.abs(xx - WEST_X) > 7) place(["bannerBlue", "bannerRed", "bannerWhite"][i % 3] as PirateModel, xx, fb.z0 - 1.2, 0, { noCollider: true, y: 1.5, scale: 1.3 });
  placeAll([
    ["flagRed", fb.x0 - 4, fb.z1 + 4, 0, { y: 12, noCollider: true, scale: 1.5 }], ["flagBlue", fb.x1 + 4, fb.z1 + 4, 0, { y: 12, noCollider: true, scale: 1.5 }],
    ["tent", fb.x0 + 10, fb.z1 - 26, 90], ["tent", fb.x0 + 10, fb.z1 - 36, 90], ["sack", fb.x0 + 13, fb.z1 - 30, 0], ["sack", fb.x0 + 13.6, fb.z1 - 31, 50],
  ]);
  sprinkle(["sack", "bucket", "bottlesBrown", "crateOpen", "cannonBall"], 24, fb, WEST_X);
  for (let zz = fb.z1; zz > fb.z0; zz -= 4) place(pick(flora), fb.x0 - 6 - random() * 8, zz, random() * 360, { noCollider: true, scale: 1 + random() * 0.6 });
  // Skull rock: kelp, purple fans and starfish, lilies on the lagoon.
  const kb = B.skull;
  sprinkle(["kelp", "seaFan", "starfishPurple", "coralPink", "shells", "starfishPurple"], 50, kb, WEST_X, () => ({ scale: 1 + random() * 0.8 }));
  for (let k = 0; k < 8; k++) place(random() < 0.5 ? "waterlily" : "waterlily2", WEST_X + (random() - 0.5) * 16, (kb.z0 + kb.z1) / 2 - 4 + (random() - 0.5) * 12, random() * 360, { y: 0.02 });
  // Dense dressing: a jittered 4.5 m grid over the land zones, so every screen has colour in it.
  const DRESS: Partial<Record<ZoneId, [PirateModel, number][]>> = {
    cove: [["starfish", 3], ["starfishRed", 2], ["shells", 4], ["conch", 2], ["grassTuft", 3], ["grassPlant", 2], ["fern", 2], ["bushPink", 0.6], ["bushYellow", 0.6], ["rock", 1]],
    shore: [["starfish", 3], ["starfishPurple", 2], ["shells", 4], ["conch", 2], ["grassTuft", 2], ["planks", 1], ["fern", 1.5], ["bushRed", 0.6], ["rock", 1], ["cannonBall", 0.6], ["bottle", 0.8]],
    shallows: [["starfish", 3], ["starfishPurple", 2], ["shells", 3], ["coralPink", 1.4], ["coralOrange", 1.2], ["seaFan", 1], ["kelp", 1.2], ["waterplant", 1], ["rock", 1]],
    fort: [["sack", 1], ["cannonBall", 1], ["grassTuft", 3], ["grassPlant", 2], ["bottlesBrown", 0.6], ["bucket", 0.5], ["fern", 0.8]],
    skull: [["kelp", 2], ["starfishPurple", 3], ["shells", 2], ["seaFan", 1.2], ["coralPink", 0.8], ["grassTuft", 2], ["bonesB", 1], ["waterplant", 1]],
    grotto: [["coinsSmall", 2], ["bottlesGreen", 1], ["bones", 1.5], ["rock", 2], ["candles", 0.8], ["skull", 0.5]],
  };
  for (const [id, list] of Object.entries(DRESS) as [ZoneId, [PirateModel, number][]][]) {
    const b = B[id], total = list.reduce((k, [, w]) => k + w, 0), start = STARTS[id];
    for (let x = b.x0 + 2; x < b.x1 - 1; x += 4.5) {
      for (let zz = b.z0 + 2; zz < b.z1 - 1; zz += 4.5) {
        if (random() < 0.25) continue;
        const px = x + (random() - 0.5) * 3.6, pz = zz + (random() - 0.5) * 3.6;
        if (Math.hypot(px - start.x, pz - start.z) < 3) continue;
        let r = random() * total, choice = list[0][0];
        for (const [m, w] of list) { r -= w; if (r <= 0) { choice = m; break; } }
        const small = choice.startsWith("star") || choice === "shells" || choice === "conch";
        place(choice, px, pz, random() * 360, { scale: small ? 1.6 + random() * 1 : 0.9 + random() * 0.5 });
      }
    }
  }
  // Palms on the beach itself (shade and cover), not only behind it.
  for (const id of ["cove", "shore"] as const) {
    const b = B[id];
    for (let i = 0; i < 7; i++) {
      const x = b.x0 + 8 + random() * 18, zz = b.z0 + 10 + random() * (b.z1 - b.z0 - 20);
      if (Math.abs(x - EXITS[id].at) < GAP + 2) continue;
      place(random() < 0.5 ? "palmBend" : "palmDetailedBend", x, zz, random() * 360, { scale: 0.9 + random() * 0.3 });
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Foam where the beaches meet the sea
 * ---------------------------------------------------------------------------------------------- */
function buildFoam(root: Entity): void {
  const m = new StandardMaterial();
  m.diffuse.set(0, 0, 0);
  m.emissive = new Color(0.85, 0.93, 0.92);
  m.useLighting = false;
  m.opacity = 0.55;
  m.blendType = BLEND_NORMAL;
  m.depthWrite = false;
  m.update();
  world.foamMaterial = m;
  world.foam = [];
  const strip = (x: number, zz: number, w: number, d: number, phase: number) => {
    const e = new Entity("foam");
    e.addComponent("render", { type: "plane", material: m, castShadows: false, receiveShadows: false });
    e.setLocalScale(w, 1, d);
    e.setLocalPosition(x, SEA_Y + 0.03, zz);
    root.addChild(e);
    world.foam.push({ entity: e, base: x, phase });
  };
  // The beach's sea edge (x 24) from the cave mouth to the pier's foot.
  for (let zz = B.grotto.z0 - 8; zz > B.shore.z0 - 10; zz -= 12) strip(22.7, zz - 6, 1.6, 12.4, zz * 0.13);
  // Round the shallows' bars and the fort's headland.
  for (let zz = B.shallows.z1 + 4; zz > B.skull.z0; zz -= 12) strip(B.fort.x1 + 7.2, zz - 6, 1.6, 12.4, zz * 0.13);
}

/* ------------------------------------------------------------------------------------------------
 * The kraken: tentacles (pooled), each a root at its base (yaw), a pivot (pitch: 0 up, 90 along
 * its lane) and a chain of tapering segments that curl.
 * ---------------------------------------------------------------------------------------------- */
interface Tentacle {
  root: Entity;
  pivot: Entity;
  segments: Entity[];
  /** Seconds since shown (-1: idle); telegraph length; lurker: decorative, sways by the rail. */
  t: number;
  telegraph: number;
  length: number;
  lurker: boolean;
  phase: number;
}
const SEGMENTS = 9;

function buildKraken(root: Entity): void {
  const skin = new StandardMaterial();
  skin.diffuse = new Color(0.42, 0.14, 0.22);
  skin.emissive = new Color(0.08, 0.02, 0.05);
  skin.gloss = 0.5;
  skin.update();
  const make = (lurker: boolean): Tentacle => {
    const r = new Entity("tentacle");
    const pivot = new Entity("pivot");
    r.addChild(pivot);
    const segments: Entity[] = [];
    let parent = pivot;
    for (let i = 0; i < SEGMENTS; i++) {
      const seg = new Entity(`seg${i}`);
      const shape = new Entity("shape");
      shape.addComponent("render", { type: i === SEGMENTS - 1 ? "cone" : "cylinder", material: skin, castShadows: true, receiveShadows: false });
      seg.addChild(shape);
      parent.addChild(seg);
      segments.push(seg);
      parent = seg;
    }
    r.enabled = false;
    root.addChild(r);
    return { root: r, pivot, segments, t: -1, telegraph: 1, length: 20, lurker, phase: Math.random() * 6 };
  };
  world.tentacles = Array.from({ length: 6 }, () => make(false));
  world.lurkers = Array.from({ length: 4 }, () => make(true));
  // Lurkers rise by the flagship's rails when the kraken wakes.
  const s = GHOST.s, halfW = 2.05 * s;
  [[-1, 0.2], [1, -0.6], [-1, -1.2], [1, 1.1]].forEach(([sd, f], i) => {
    const l = world.lurkers[i];
    l.root.setLocalPosition(GHOST.x + sd * (halfW + 1.5), DEEP_Y, GHOST.z + f * s);
    l.root.setLocalEulerAngles(0, sd > 0 ? 90 : -90, 0);
    sizeTentacle(l, 16);
  });
}

/** Lays out the segments for a tentacle `length` m long (tapering from the base). */
function sizeTentacle(k: Tentacle, length: number): void {
  k.length = length;
  const segLen = length / SEGMENTS;
  k.segments.forEach((seg, i) => {
    const r = 1.1 * (1 - (i / SEGMENTS) * 0.82);
    seg.setLocalPosition(0, i === 0 ? 0 : segLen, 0);
    const shape = seg.children[0] as Entity;
    shape.setLocalPosition(0, segLen / 2, 0);
    shape.setLocalScale(r * 2, segLen * 1.08, r * 2);
  });
}

/** Animates the kraken: lane tentacles rise, curl, slam down on time, lie, sink; lurkers sway. */
function updateKraken(dt: number): void {
  world.time += dt;
  for (const k of world.tentacles) {
    if (k.t < 0) continue;
    k.t += dt;
    const T = k.telegraph;
    let pitch: number, rise: number, curl: number;
    if (k.t < T) {
      // Rises out of the water and coils, leaning back over its lane.
      rise = Math.min(1, k.t / (T * 0.45));
      pitch = -12 * Math.min(1, k.t / T);
      curl = 18 + 10 * Math.sin(world.time * 5 + k.phase);
    } else if (k.t < T + 0.14) {
      rise = 1;
      const f = (k.t - T) / 0.14;
      pitch = -12 + 102 * f;
      curl = 18 * (1 - f);
    } else if (k.t < T + 0.85) {
      rise = 1;
      pitch = 90;
      curl = 2 * Math.sin(world.time * 9 + k.phase);
    } else if (k.t < T + 1.6) {
      const f = (k.t - T - 0.85) / 0.75;
      rise = 1 - f;
      pitch = 90 - 40 * f;
      curl = 10 * f;
    } else {
      k.t = -1;
      k.root.enabled = false;
      continue;
    }
    k.root.setLocalPosition(k.root.getLocalPosition().x, -k.length * 0.55 * (1 - rise) - 0.2, k.root.getLocalPosition().z);
    k.pivot.setLocalEulerAngles(pitch, 0, 0);
    k.segments.forEach((seg, i) => { if (i > 0) seg.setLocalEulerAngles(-curl * (0.4 + i * 0.12), 0, 0); });
  }
  const up = world.kraken;
  for (const l of world.lurkers) {
    const want = up >= 1 ? 1 : 0;
    l.t = l.t < 0 ? 0 : l.t;
    l.t += (want - l.t) * Math.min(1, dt * 0.8);
    l.root.enabled = l.t > 0.02;
    if (!l.root.enabled) continue;
    const p = l.root.getLocalPosition();
    l.root.setLocalPosition(p.x, DEEP_Y - l.length * (1 - l.t), p.z);
    l.pivot.setLocalEulerAngles(-25 + 12 * Math.sin(world.time * 1.3 + l.phase), 0, 8 * Math.sin(world.time * 0.9 + l.phase));
    l.segments.forEach((seg, i) => { if (i > 0) seg.setLocalEulerAngles(-(10 + 8 * Math.sin(world.time * 2 + l.phase + i * 0.5)), 0, 0); });
  }
}

/* ------------------------------------------------------------------------------------------------
 * Seals on the ways on: stacked crates and a barrel across each lane end; when the level is won the
 * one ahead sinks away as the hero comes near.
 * ---------------------------------------------------------------------------------------------- */
const SEAL_OPEN_SECONDS = 0.8;

function buildSeals(kit: ModelKit<PirateModel>, root: Entity): void {
  world.seals = [];
  world.exitSeals = [];
  const add = (x: number, zz: number, yaw: number) => {
    const e = new Entity("seal");
    e.setLocalPosition(x, 0, zz);
    e.setLocalEulerAngles(0, yaw, 0);
    root.addChild(e);
    kit.spawn("cratesStacked", -1.4, 0, 10, e, { noCollider: true });
    kit.spawn("barrel", 1.6, 0.2, 0, e, { noCollider: true });
    e.enabled = false;
    world.seals.push({ entity: e, x, z: zz, yaw, open: -1 });
  };
  ORDER.forEach((id, i) => {
    if (id === "flagship") return;
    const e = EXITS[id], nextId = ORDER[i + 1];
    if (e.side === "n") {
      add(e.at, B[id].z0, 0);
      add(e.at, B[nextId].z1, 0);
    } else {
      add(B[id].x0, e.at, 90);
      add(B[nextId].x1, e.at, 90);
    }
  });
}

function onEdge(r: LevelBounds, x: number, zz: number): boolean {
  const inX = x >= r.minX - 1.5 && x <= r.maxX + 1.5, inZ = zz >= r.minZ - 1.5 && zz <= r.maxZ + 1.5;
  const nearZ = Math.abs(zz - r.minZ) < 1.5 || Math.abs(zz - r.maxZ) < 1.5;
  const nearX = Math.abs(x - r.minX) < 1.5 || Math.abs(x - r.maxX) < 1.5;
  return (inX && nearZ) || (inZ && nearX);
}

/* ------------------------------------------------------------------------------------------------
 * Moods: each act its own light (sunset on the beach, storm over the galleon, the cursed night),
 * the grotto and the hold dark. Eased in as a level starts.
 * ---------------------------------------------------------------------------------------------- */
interface Mood { sun: [number, number, number]; sunI: number; clear: [number, number, number]; fog: [number, number]; ambient: [number, number, number] }
const L = PIRATE_LIGHTING;
const MOODS: Record<string, Mood> = {
  grotto: { sun: [1.0, 0.76, 0.5], sunI: 1.6, clear: [0.14, 0.11, 0.1], fog: [18, 60], ambient: [0.62, 0.56, 0.6] },
  beach: { sun: L.sun.color as [number, number, number], sunI: L.sun.intensity, clear: L.clearColor as [number, number, number], fog: [L.fogStart, L.fogEnd], ambient: L.groundAmbient as [number, number, number] },
  storm: { sun: [1.0, 0.92, 0.8], sunI: 2.3, clear: [0.36, 0.56, 0.66], fog: [28, 90], ambient: [0.78, 0.84, 0.95] },
  hold: { sun: [0.95, 0.75, 0.55], sunI: 1.1, clear: [0.1, 0.09, 0.08], fog: [14, 48], ambient: [0.55, 0.5, 0.48] },
  night: { sun: [1.0, 0.66, 0.5], sunI: 2.4, clear: [0.42, 0.3, 0.42], fog: [28, 92], ambient: [0.82, 0.72, 0.9] },
  cursed: { sun: [0.72, 0.95, 0.9], sunI: 2.1, clear: [0.1, 0.28, 0.3], fog: [22, 74], ambient: [0.62, 0.86, 0.86] },
};
const ZONE_MOOD: Record<ZoneId, keyof typeof MOODS> = {
  grotto: "grotto", cove: "beach", shore: "beach", pier: "storm", deck: "storm", hold: "hold",
  shallows: "night", fort: "night", skull: "cursed", flagship: "cursed",
};
const mood = {
  app: null as AppBase | null,
  current: { ...MOODS.grotto, sun: [...MOODS.grotto.sun], clear: [...MOODS.grotto.clear], ambient: [...MOODS.grotto.ambient], fog: [...MOODS.grotto.fog] } as Mood,
  target: MOODS.grotto,
};

function applyMood(dt: number): void {
  const app = mood.app;
  if (!app) return;
  const c = mood.current, t = mood.target, k = Math.min(1, dt * 0.7);
  const ease = (a: number[], b: readonly number[]) => { for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * k; };
  ease(c.sun, t.sun); ease(c.clear, t.clear); ease(c.ambient, t.ambient); ease(c.fog, t.fog);
  c.sunI += (t.sunI - c.sunI) * k;
  const sun = app.root.findByName("Sun") as Entity | null;
  if (sun?.light) { sun.light.color = new Color(c.sun[0], c.sun[1], c.sun[2]); sun.light.intensity = c.sunI; }
  const camera = app.root.findByName("Camera") as Entity | null;
  if (camera?.camera) camera.camera.clearColor = new Color(c.clear[0], c.clear[1], c.clear[2]);
  app.scene.fog.color = new Color(c.clear[0], c.clear[1], c.clear[2]);
  if (app.scene.fog.type !== "none") { app.scene.fog.start = c.fog[0]; app.scene.fog.end = c.fog[1]; }
  app.scene.ambientLight = new Color(c.ambient[0], c.ambient[1], c.ambient[2]);
}

/** Chapter 5: the Black Tide. */
export const PIRATE_BIOME: Biome<PirateModel> = {
  id: "pirate",
  label: "Black Tide",
  kit: { url: PIRATE.url, models: PIRATE_MODELS, brightness: PIRATE.brightness, batchCellMetres: PIRATE.batchCellMetres },
  lighting: PIRATE_LIGHTING,
  ground: GROUND_SPEC,
  bounds: BOUNDS,
  spawn: SPAWN,
  runStart: STARTS.grotto,
  ambient: AMBIENT,
  lava: SEA,
  // The pier, the decks and the hold are planking (the ground under them is sand).
  stepAreas: [
    { x0: B.pier.x0 - 1, z0: B.pier.z0 - 9, x1: B.pier.x1 + 1, z1: B.pier.z1 + 1, surface: "planks" },
    { x0: B.deck.x0 - 2, z0: B.hold.z0 - 1, x1: B.deck.x1 + 2, z1: B.pier.z0 - 9, surface: "planks" },
    { x0: B.flagship.x0 - 2, z0: B.flagship.z0 - 2, x1: B.flagship.x1 + 2, z1: B.skull.z0, surface: "ghostdeck" },
  ],
  build: buildPirateLevel,
  campaign: {
    levels: PIRATE_LEVELS,
    zones: ZONES,
    run: PIRATE_RUN,
    difficulties: PIRATE_DIFFICULTIES,
    defaultDifficulty: "hard",
    victory: { title: "THE TIDE TURNS", text: "The Captain is fed to his own kraken and the ghost fleet sinks for good. The gold is yours - and it is only gold again." },
    attachWorld(app) {
      mood.app = app;
      applyMood(1);
    },
    onLevel(_index, zoneId) {
      const r = ZONES[zoneId]?.region;
      for (const s of world.seals) {
        s.open = -1;
        s.entity.setLocalPosition(s.x, 0, s.z);
        s.entity.enabled = !!r && onEdge(r, s.x, s.z);
      }
      world.exitSeals = [];
      mood.target = MOODS[ZONE_MOOD[zoneId as ZoneId] ?? "beach"];
      // The hold floods while its level lasts.
      if (world.flood && zoneId === "hold") { world.flood.target = 0.3; world.flood.level = Math.max(world.flood.level, 0.015); }
      if (zoneId !== "flagship") world.kraken = 0;
    },
    arena(intensity) {
      world.kraken = intensity >= 1 ? 1 : world.kraken;
      if (intensity === 0) world.kraken = 0;
    },
    tentacle(x, zz, dx, dz, length, _width, seconds) {
      const k = world.tentacles.find((t) => t.t < 0) ?? world.tentacles[0];
      k.t = 0;
      k.root.enabled = true;
      k.root.setLocalPosition(x, -length, zz);
      k.root.setLocalEulerAngles(0, (Math.atan2(dx, dz) * 180) / Math.PI, 0);
      sizeTentacle(k, length);
      k.telegraph = seconds;
    },
    tideFrom(x) {
      // The sea lies east of the beaches and the fort, south-east of the shallows.
      return x > -10 ? [1, 0] : [0.45, 0.89];
    },
    exits(zoneId): WayPoint[] {
      const exit = ZONES[zoneId]?.exit;
      if (!exit) return (world.exitSeals = []);
      world.exitSeals = world.seals.filter((s) => s.entity.enabled && (exit.axis === "z" ? Math.abs(s.z - exit.at) < 1.5 : Math.abs(s.x - exit.at) < 1.5));
      return world.exitSeals.map((s) => ({ x: s.x, z: s.z, width: GAP * 2, yawDeg: s.yaw }));
    },
    openExit(_zoneId, index) {
      const s = world.exitSeals[index];
      if (s && s.open < 0 && s.entity.enabled) s.open = 0;
    },
    update(dt, hero) {
      updateSeaFx(dt, hero);
      for (const s of world.exitSeals) {
        if (s.open < 0 || !s.entity.enabled) continue;
        s.open = Math.min(1, s.open + dt / SEAL_OPEN_SECONDS);
        s.entity.setLocalPosition(s.x, -1.6 * s.open * s.open, s.z);
        if (s.open >= 1) s.entity.enabled = false;
      }
      applyMood(dt);
      const f = world.flood;
      if (f && Math.abs(f.target - f.level) > 0.001) {
        f.level += Math.sign(f.target - f.level) * Math.min(Math.abs(f.target - f.level), dt * 0.008);
        f.entity.setLocalPosition(f.entity.getLocalPosition().x, f.level, f.entity.getLocalPosition().z);
      }
      // Foam breathes on the beaches.
      if (world.foamMaterial) {
        world.foamMaterial.opacity = 0.42 + 0.18 * Math.sin(world.time * 1.4);
        world.foamMaterial.update();
        for (const fo of world.foam) {
          const p = fo.entity.getLocalPosition();
          fo.entity.setLocalPosition(fo.base + 0.6 * Math.sin(world.time * 0.9 + fo.phase), p.y, p.z);
        }
      }
      updateKraken(dt);
    },
  },
};
