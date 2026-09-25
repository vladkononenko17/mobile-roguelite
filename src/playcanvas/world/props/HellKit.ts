import type { KitModelDef } from "./ModelKit";

const box = (shrink = 1, shadows = true): KitModelDef => ({ collider: { kind: "box", shrink }, shadows });
const circle = (radius: number, shadows = true): KitModelDef => ({ collider: { kind: "circle", radius }, shadows });
const decor: KitModelDef = { collider: { kind: "none" }, shadows: true };
const clutter: KitModelDef = { collider: { kind: "none" }, shadows: false };

/**
 * Chapter 3 environment kit: the pit (public/models/hell/hell-kit.glb, built by
 * scripts/build-hell-kit.mjs from Inferno World, the SHS Dungeon Pack, the hell2 flesh growths and
 * Kenney's Graveyard / Nature kits). Every model is centred
 * on its footprint with its base on the ground, in metres. Rocks are round blockers; walls,
 * machines and relics block by footprint; bones, puddles and small clutter are walk-over.
 */
export const HELL_MODELS = {
  // Basalt and rock
  crag: circle(2.1),
  cragBig: circle(3.2),
  rockMid1: circle(2.6),
  rockMid2: circle(2.1),
  rockMid3: circle(2.0),
  rockMid4: circle(2.2),
  rockSmall1: circle(0.8),
  rockSmall2: circle(0.9),
  rockSmall3: circle(0.75),
  rockBig: circle(4.5),
  stoneSmall1: clutter,
  stoneSmall2: clutter,
  mound: clutter,
  // Island cliffs (placed sunk into the lava, under the island edges) and the ritual platform
  // (no shadows: they lie under the ground, and the shadow pass is the costly one here)
  plateau: clutter,
  plateauLong: clutter,
  circlePlatform: clutter,
  // Ruins and relics
  column: circle(0.95),
  columnBroken: box(0.8),
  columnStump: circle(0.55),
  brazier: circle(0.45),
  brazierLow: box(0.85),
  pedestal: box(0.95),
  statue: box(0.6),
  tower: circle(3.2),
  well: circle(1.15),
  boneRib: circle(0.4),
  boneHorn: circle(0.4),
  boneRib2: circle(0.4),
  gear: box(0.85),
  gearSmall: box(0.85),
  axe: box(0.5),
  chest: box(0.9),
  goldBig: box(0.8),
  goldSmall: clutter,
  vase: circle(0.3),
  vase2: circle(0.28),
  crate: box(0.9),
  // Architecture (2 x 3 m wall modules)
  wall: box(),
  wallBump: box(),
  wallWindow: box(),
  wallJail: box(),
  wallJailDoor: box(),
  archway: box(),
  gateArch: box(),
  pillar: box(0.9),
  pillarRough: circle(0.26),
  stairs: box(0.95),
  // Rites and torture
  altar: circle(0.38),
  altarSquare: box(0.9),
  throne: box(0.9),
  cage: box(0.95),
  cross: box(0.5),
  rack: box(0.85),
  spikeWheel: box(0.9),
  stockade: box(0.9),
  jailBench: clutter,
  table: box(0.9),
  barrel: circle(0.24),
  bones1: clutter,
  bones2: clutter,
  bones3: clutter,
  skeleton: clutter,
  skull: clutter,
  chain: decor,
  chainHang: decor,
  wallTorch: clutter,
  lantern: clutter,
  candles: clutter,
  puddleA: clutter,
  puddleB: clutter,
  puddleC: clutter,
  rubble: clutter,
  // Flesh growths (demon corruption)
  fleshSpire: circle(2.4),
  fleshBrain: box(0.8),
  fleshClaw: circle(1.1),
  fleshGut: box(0.75),
  fleshStalk: circle(1.0),
  // Lava crystals (self-lit), for the crossing
  crystal1: circle(0.9),
  crystal2: circle(0.6),
  crystal3: circle(0.7),
  // Kenney Graveyard (CC0): the abyss graveyard
  crypt: box(0.95),
  cryptRoof: decor,
  cryptSmall: box(0.95),
  cryptSmallRoof: decor,
  graveCross: clutter,
  graveRound: clutter,
  graveBroken: clutter,
  graveDeco: clutter,
  ironFence: box(0.9),
  ironFenceBroken: box(0.9),
  obelisk: circle(0.55),
  coffin: clutter,
  fireBasket: clutter,
  urn: clutter,
  candlesMany: clutter,
  altarStone: box(0.9),
  // Charred dead trees and wood (trunks block, the crowns overhang)
  treeDead: circle(0.45),
  treeDead2: circle(0.45),
  trunk: circle(0.5),
  stump: clutter,
  log: box(0.85),
  // Kenney Nature (CC0): tall rock spires of the wastes' badlands
  spireA: circle(2.8),
  spireC: circle(1.8),
  spireF: circle(2.0),
  spireH: circle(2.3),
} satisfies Record<string, KitModelDef>;

export type HellModel = keyof typeof HELL_MODELS;
