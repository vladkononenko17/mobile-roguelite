import type { KitModelDef } from "./ModelKit";

const box = (shrink = 1, shadows = true): KitModelDef => ({ collider: { kind: "box", shrink }, shadows });
const circle = (radius: number, shadows = true): KitModelDef => ({ collider: { kind: "circle", radius }, shadows });
const clutter: KitModelDef = { collider: { kind: "none" }, shadows: false };
const decor: KitModelDef = { collider: { kind: "none" }, shadows: true };

/**
 * Level 1 environment kit (public/models/outpost/outpost-kit.glb, built by
 * scripts/build-outpost-kit.mjs). Ids match the node names in the GLB. Big readable shapes block
 * and cast shadows; small clutter is walk-over and shadowless.
 */
export const OUTPOST_MODELS = {
  // Atomic Realm walls (2 x 2 m modules, origin on the front face)
  wall: box(),
  wallBrick: box(),
  wallBoarded: box(),
  wallHole: box(),
  wallWindow: box(),
  wallWindow2: box(),
  wallColumn: box(),
  wallConcreteMetal: box(),
  wallMetalRed: box(),
  wallMetalBlue: box(),
  wallSpiked: box(),
  wallWood: box(),
  spikeBarricade: box(0.8),
  metalBoardA: decor,
  metalBoardB: decor,
  metalBoardC: decor,
  // Atomic Realm props
  barrelBlue: circle(0.33),
  crate: box(0.95),
  car: box(0.92),
  pole: circle(0.2),
  tire: clutter,
  wheel: clutter,
  groundPlanks: clutter,
  jerryCan: clutter,
  palletPile: box(0.8),
  sawhorse: box(0.8),
  armchair: box(0.9),
  sofaDamaged: box(0.9),
  table: box(0.9),
  bathtub: box(0.9),
  chairBroken: clutter,
  bottle: clutter,
  stick: clutter,
  sleepingBag: clutter,
  crashedShip: box(0.7),
  boat: box(0.9),
  // Modular Roads
  road: clutter,
  roadT: clutter,
  roadEnd: clutter,
  lamp: circle(0.15),
  lampDouble: circle(0.15),
  trafficLight: circle(0.2),
  jersey: box(0.95),
  jersey2: box(0.95),
  sawhorseStriped: box(0.8),
  trafficBarrel: circle(0.45),
  cone: clutter,
  treeRound: circle(0.35),
  treeTall: circle(0.5),
  // CitySurvivalLite
  bench: box(0.9),
  tent: box(0.8),
  cardboard: clutter,
  cart: box(0.8),
  streetLamp: circle(0.15),
  barrelRed: circle(0.3),
  // 3dassets.dev (CC0)
  container: box(0.98),
  bowser: box(0.85),
  generator: box(0.9),
  drumRack: box(0.9),
  palletStack: box(0.9),
  sandbags: box(0.9),
  razorWire: box(0.8),
  floodlight: circle(0.35),
  wreckBarricade: box(0.85),
  tyreStack: box(0.8),
  scrap: clutter,
  roadSign: circle(0.15),
  warningSign: box(0.7),
  campfire: circle(0.5, false),
  cot: box(0.9, false),
  rock: box(0.75),
  engineParts: clutter,
} satisfies Record<string, KitModelDef>;

export type OutpostModel = keyof typeof OUTPOST_MODELS;
