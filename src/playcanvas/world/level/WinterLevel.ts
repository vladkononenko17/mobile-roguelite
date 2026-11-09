import { Color, Entity, type AppBase } from "playcanvas";
import type { AmbientEmitter } from "../AmbientFx";
import { WINTER_DIFFICULTIES, WINTER_LEVELS, WINTER_RUN } from "../../gameplay/winterConfig";
import type { GroundSpec } from "../Ground";
import type { ModelKit, SpawnOptions } from "../props/ModelKit";
import { declareCollider } from "../collision/CollisionWorld";
import { WINTER_MODELS, type WinterModel } from "../props/WinterKit";
import { WINTER, WINTER_LIGHTING } from "../../config";
import type { Biome, LevelBounds, WayPoint, Zone } from "./Biome";

/**
 * CHAPTER 6 - WHITEOUT: one night of snow, four levels south to north (~140 x 330 m):
 *   1 THE BLACK PINES (z 36..-28)     a forest road through snowed-in pines, a hunters' camp (52 x 64 m)
 *   2 HOLLOW FARM     (z -44..-104)   a farmhouse, a gutted barn and a white field in a blizzard (60 x 60 m)
 *   3 MAPLE LANE      (z -120..-184)  a suburban street at night, houses dark, one burning (64 x 64 m)
 *   4 ASHFORD         (z -200..-264)  the town square on fire, wrecks everywhere: the Ravager's arena (64 x 64 m)
 * joined by short tracks through barriers that sink when a level is won (the Wasteland's flow).
 *
 * Scary on purpose: the light goes from a blue dusk to a whiteout to black night to a fire-lit sky
 * (MOODS), the snow haze closes in at ~30 m, the hero carries a flashlight, street lamps fail and
 * police lights strobe over the bodies. Tall things stand only at the sides and beyond each zone, never
 * between the camera (south) and the play.
 */

const FOREST = { x0: -26, z0: -28, x1: 26, z1: 36 };
const FARM = { x0: -30, z0: -104, x1: 30, z1: -44 };
const SUBURB = { x0: -32, z0: -184, x1: 32, z1: -120 };
const TOWN = { x0: -32, z0: -264, x1: 32, z1: -200 };
type Rect = typeof FOREST;
/** Half width of the tracks joining the zones (and of the gaps the barriers close). */
const GAP = 4;
export const BOUNDS: LevelBounds = { minX: -70, maxX: 70, minZ: -300, maxZ: 44 };
const region = (r: Rect): LevelBounds => ({ minX: r.x0 + 1, maxX: r.x1 - 1, minZ: r.z0 + 1, maxZ: r.z1 - 1 });

export const ZONES: Record<string, Zone> = {
  forest: { region: region(FOREST), start: { x: 0, z: 24, yawDeg: 180 }, exit: { axis: "z", at: FOREST.z0, dir: -1 } },
  farm: { region: region(FARM), start: { x: 0, z: -50, yawDeg: 180 }, exit: { axis: "z", at: FARM.z0, dir: -1 } },
  suburb: { region: region(SUBURB), start: { x: 0, z: -126, yawDeg: 180 }, exit: { axis: "z", at: SUBURB.z0, dir: -1 } },
  town: { region: region(TOWN), start: { x: 0, z: -206, yawDeg: 180 } },
};
const SPAWN = { x: 0, z: 30, yawDeg: 180 };

/* ------------------------------------------------------------------------------------------------
 * Ambience
 * ---------------------------------------------------------------------------------------------- */
const RED: [number, number, number] = [1, 0.12, 0.08];
const BLUE: [number, number, number] = [0.15, 0.35, 1];
const LAMP: [number, number, number] = [1, 0.78, 0.45];
const AMBIENT: AmbientEmitter[] = [
  // Snow over everything, travelling with the hero.
  { kind: "snow", x: 0, z: 0, y: 7, size: [26, 30], intensity: 1.1 },
  // Snow scraps blowing across each zone (the leaf sprite, white).
  { kind: "leaves", x: 0, y: 0.3, z: 4, size: [40, 50], intensity: 1.2, color: [1.15, 1.25, 1.35] },
  { kind: "leaves", x: 0, y: 0.3, z: -74, size: [50, 50], intensity: 1.8, color: [1.15, 1.25, 1.35] },
  { kind: "leaves", x: 0, y: 0.3, z: -152, size: [50, 50], intensity: 1, color: [1.15, 1.25, 1.35] },
  { kind: "leaves", x: 0, y: 0.3, z: -232, size: [50, 50], intensity: 0.8, color: [0.6, 0.5, 0.45] },
  // Forest: the police car in the trees strobing red and blue; the camp's dead fire; a hurricane lamp.
  { kind: "glow", x: -15, z: -7, size: [9, 9], color: RED, intensity: 0.5, pulse: 1.4 },
  { kind: "glow", x: -13.5, z: -8.5, size: [9, 9], color: BLUE, intensity: 0.5, pulse: 1.1 },
  { kind: "smoke", x: 15.5, y: 0.2, z: 16, size: [0.5, 0.5], intensity: 0.7 },
  { kind: "glow", x: 12, z: 19.5, size: [5, 5], color: LAMP, intensity: 0.45, flicker: true },
  { kind: "birds", x: 0, y: 6, z: 4, size: [30, 30], intensity: 1 },
  // Farm: the porch lamp, a burning oil drum by the barn.
  { kind: "glow", x: -11, z: -60, size: [6, 6], color: LAMP, intensity: 0.5, flicker: true },
  { kind: "fire", x: 6.5, y: 1.05, z: -80, size: [0.5, 0.5], intensity: 0.8 },
  { kind: "smoke", x: 6.5, y: 1.2, z: -80, size: [0.5, 0.5], intensity: 0.6 },
  { kind: "glow", x: 18, z: -92, size: [5, 5], color: LAMP, intensity: 0.35, flicker: true },
  // Suburb: failing street lamps, the police block at the cross street, the burning house.
  { kind: "glow", x: -5.4, z: -132, size: [8, 8], color: LAMP, intensity: 0.55, flicker: true },
  { kind: "glow", x: 5.4, z: -144, size: [8, 8], color: LAMP, intensity: 0.55 },
  { kind: "glow", x: -5.4, z: -164, size: [8, 8], color: LAMP, intensity: 0.55, flicker: true },
  { kind: "glow", x: 5.4, z: -178, size: [8, 8], color: LAMP, intensity: 0.5, flicker: true },
  { kind: "glow", x: 9, z: -152, size: [10, 10], color: RED, intensity: 0.55, pulse: 1.5 },
  { kind: "glow", x: 11, z: -153.5, size: [10, 10], color: BLUE, intensity: 0.55, pulse: 1.2 },
  { kind: "fire", x: 20, y: 5.5, z: -170, size: [4, 3], intensity: 1.4 },
  { kind: "fire", x: 18, y: 0.4, z: -165.5, size: [2, 1], intensity: 1 },
  { kind: "smoke", x: 20, y: 7, z: -170, size: [3, 3], intensity: 1.2 },
  { kind: "fire", x: -10, y: 0.9, z: -176, size: [1.4, 1], intensity: 0.9 },
  // Town: everything burns.
  { kind: "fire", x: -9, y: 0.9, z: -214, size: [1.6, 1.2], intensity: 1.1 },
  { kind: "fire", x: 12, y: 1, z: -222, size: [2, 1.4], intensity: 1.2 },
  { kind: "fire", x: -16, y: 1.2, z: -240, size: [2.2, 1.6], intensity: 1.2 },
  { kind: "fire", x: 18, y: 0.9, z: -246, size: [1.4, 1], intensity: 1 },
  { kind: "fire", x: 3, y: 1.4, z: -256, size: [2.6, 1.6], intensity: 1.3 },
  { kind: "fire", x: -24, y: 5, z: -254, size: [4, 3], intensity: 1.3 },
  { kind: "fire", x: 25, y: 5, z: -212, size: [4, 3], intensity: 1.3 },
  { kind: "fire", x: 22.5, y: 1.1, z: -232, size: [0.5, 0.5], intensity: 0.8 },
  { kind: "fire", x: -22.5, y: 1.1, z: -226, size: [0.5, 0.5], intensity: 0.8 },
  { kind: "smoke", x: 12, y: 1.5, z: -222, size: [1.5, 1.5], intensity: 1 },
  { kind: "smoke", x: -16, y: 1.6, z: -240, size: [1.5, 1.5], intensity: 1 },
  { kind: "smoke", x: -24, y: 6, z: -254, size: [3, 3], intensity: 1.3 },
  { kind: "smoke", x: 25, y: 6, z: -212, size: [3, 3], intensity: 1.3 },
  { kind: "embers", x: 0, y: 0.5, z: -234, size: [30, 30], intensity: 1.2 },
  { kind: "sparks", x: -5.5, y: 4.2, z: -226, every: 5 },
  { kind: "glow", x: -6, z: -205, size: [9, 9], color: RED, intensity: 0.5, pulse: 1.6 },
  { kind: "glow", x: -4, z: -206.5, size: [9, 9], color: BLUE, intensity: 0.5, pulse: 1.3 },
];

/* ------------------------------------------------------------------------------------------------
 * Ground
 * ---------------------------------------------------------------------------------------------- */
const GROUND_SPEC: GroundSpec = {
  base: "snow",
  areas: [{ x0: -160, z0: -340, x1: 160, z1: 160 }],
  pads: [],
  patches: [
    // The frozen pond in the forest.
    { x: -14, z: 20.5, w: 11, d: 9, surface: "ice", seed: 2 }, { x: -12.5, z: 19, w: 7, d: 6, surface: "ice", seed: 0 },
    // Forest road (trodden), winding north.
    { x: 1, z: 30, w: 7, d: 12, surface: "snowpack", seed: 0 }, { x: 2, z: 18, w: 7, d: 14, surface: "snowpack", seed: 1 },
    { x: -1, z: 4, w: 7, d: 16, surface: "snowpack", seed: 2 }, { x: 0, z: -12, w: 7, d: 16, surface: "snowpack", seed: 3 },
    { x: 0, z: -30, w: 7, d: 14, surface: "snowpack", seed: 0 },
    // Blood where the hunters made their stand; a trail to the north.
    { x: 13, z: 14, w: 5, d: 4, surface: "bloodsnow", seed: 1 }, { x: 6, z: 2, w: 3, d: 2.5, surface: "bloodsnow", seed: 2 },
    { x: 3, z: -9, w: 2.5, d: 2, surface: "bloodsnow", seed: 3 }, { x: -14, z: -9, w: 4, d: 3, surface: "bloodsnow", seed: 0 },
    // Farm: the yard, the track to the barn, furrows in the field.
    { x: -10, z: -68, w: 16, d: 14, surface: "snowpack", seed: 1 }, { x: 4, z: -80, w: 12, d: 8, surface: "snowpack", seed: 2 },
    { x: 15, z: -90, w: 16, d: 14, surface: "snowpack", seed: 3 }, { x: 0, z: -110, w: 7, d: 14, surface: "snowpack", seed: 0 },
    { x: 14, z: -58, w: 10, d: 3, surface: "snowpack", seed: 1 }, { x: 14, z: -64, w: 10, d: 3, surface: "snowpack", seed: 2 },
    { x: -14, z: -94, w: 12, d: 3, surface: "snowpack", seed: 3 },
    { x: -4, z: -72, w: 4, d: 3, surface: "bloodsnow", seed: 1 }, { x: 13, z: -84, w: 5, d: 4, surface: "bloodsnow", seed: 0 },
    // Suburb: slush on the street, blood on the lawns.
    { x: 0, z: -152, w: 9, d: 66, surface: "slush", seed: 0 }, { x: 0, z: -152, w: 66, d: 9, surface: "slush", seed: 1 },
    { x: -15, z: -138, w: 4, d: 3, surface: "bloodsnow", seed: 2 }, { x: 10, z: -158, w: 5, d: 4, surface: "bloodsnow", seed: 3 },
    { x: -4, z: -176, w: 3, d: 3, surface: "bloodsnow", seed: 0 }, { x: 0, z: -192, w: 7, d: 14, surface: "snowpack", seed: 1 },
    // Town: slush, soot and blood.
    { x: 0, z: -232, w: 12, d: 66, surface: "slush", seed: 2 }, { x: 0, z: -232, w: 66, d: 12, surface: "slush", seed: 3 },
    { x: 0, z: -234, w: 24, d: 22, surface: "snowpack", seed: 0 },
    { x: -6, z: -238, w: 6, d: 5, surface: "bloodsnow", seed: 1 }, { x: 8, z: -228, w: 5, d: 4, surface: "bloodsnow", seed: 2 },
    { x: -12, z: -216, w: 4, d: 4, surface: "bloodsnow", seed: 3 }, { x: 14, z: -250, w: 6, d: 4, surface: "bloodsnow", seed: 0 },
    // Soot round the burning wrecks and the ruins.
    { x: 12, z: -222, w: 10, d: 7, surface: "ash", seed: 1 }, { x: -9, z: -214, w: 7, d: 6, surface: "ash", seed: 2 },
    { x: -16, z: -240, w: 9, d: 8, surface: "ash", seed: 3 }, { x: 18, z: -246, w: 7, d: 6, surface: "ash", seed: 0 },
    { x: 3, z: -256, w: 10, d: 6, surface: "ash", seed: 1 }, { x: -24, z: -254, w: 12, d: 10, surface: "ash", seed: 2 },
    { x: 25, z: -212, w: 12, d: 10, surface: "ash", seed: 3 }, { x: 20, z: -170, w: 12, d: 10, surface: "ash", seed: 0 },
  ],
};

type Placement = [WinterModel, number, number, number?, SpawnOptions?];

/** Deterministic RNG so the layout is the same on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ------------------------------------------------------------------------------------------------
 * Builder
 * ---------------------------------------------------------------------------------------------- */
export function buildWinterLevel(kit: ModelKit<WinterModel>): Entity {
  const root = new Entity("WinterLevel");
  const random = rng(1993);
  const place = (id: WinterModel, x: number, z: number, yaw = 0, options: SpawnOptions = {}) => kit.spawn(id, x, z, yaw, root, options);
  const placeAll = (list: Placement[]) => { for (const [id, x, z, yaw, options] of list) place(id, x, z, yaw ?? 0, options); };
  const cluster = (ox: number, oz: number, yaw: number, items: Placement[]) => {
    const r = (yaw * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    for (const [id, lx, lz, lyaw, options] of items) place(id, ox + lx * c + lz * s, oz - lx * s + lz * c, yaw + (lyaw ?? 0), options);
  };
  const edge = (x: number, z: number, width: number, depth: number) => {
    const e = new Entity("edge");
    e.setLocalPosition(x, 0, z);
    root.addChild(e);
    declareCollider(e, { kind: "box", width, depth });
  };
  /** Invisible walls round a zone, open where the tracks come in (south) and leave (north). */
  const fence = (r: Rect, openSouth: boolean, openNorth: boolean) => {
    const w = r.x1 - r.x0;
    for (const [z, open] of [[r.z1 + 0.5, openSouth], [r.z0 - 0.5, openNorth]] as const) {
      if (open) { edge((r.x0 - GAP) / 2, z, -GAP - r.x0 + 1, 1); edge((r.x1 + GAP) / 2, z, r.x1 - GAP + 1, 1); }
      else edge((r.x0 + r.x1) / 2, z, w + 2, 1);
    }
    edge(r.x0 - 0.5, (r.z0 + r.z1) / 2, 1, r.z1 - r.z0 + 2);
    edge(r.x1 + 0.5, (r.z0 + r.z1) / 2, 1, r.z1 - r.z0 + 2);
  };
  const PINES: WinterModel[] = ["pineSnowA", "pineSnowB", "pine", "pineTall", "pineSnowA", "pineSnowB", "pineSnowC"];
  const pineAt = (x: number, z: number, scale = 1, collide = true) =>
    place(PINES[Math.floor(random() * PINES.length)], x, z, random() * 360, { scale: scale * (0.85 + random() * 0.4), noCollider: !collide });
  /** A belt of pines `depth` deep along a->b, offset to one side (`side` = +1 left of the direction). */
  const treeBelt = (ax: number, az: number, bx: number, bz: number, depth: number, side: 1 | -1, density = 1) => {
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    const nx = -dz * side, nz = dx * side;
    const count = Math.round(((len * depth) / 9) * density);
    for (let i = 0; i < count; i++) {
      const t = random() * len, o = 0.5 + random() * depth;
      pineAt(ax + dx * t + nx * o, az + dz * t + nz * o, 1 + random() * 0.4, o < 3);
    }
  };
  /** Low clutter along a zone's south edge (the camera looks over it). */
  const lowEdge = (x0: number, x1: number, z: number) => {
    for (let x = x0 + 1; x < x1; x += 2.5 + random() * 3) {
      if (Math.abs(x) < GAP + 1) continue;
      const roll = random();
      place(roll < 0.45 ? "snowBank" : roll < 0.7 ? "log" : roll < 0.85 ? "rockSmall" : "pineSnowC", x, z + random() * 1.5, random() * 360, { scale: roll >= 0.85 ? 0.6 : 1 });
    }
  };
  const scatterSnow = (r: Rect, n: number) => {
    // Drifts: low mounds (the kit's flat snow sheets read as bright slabs on the painted ground).
    for (let i = 0; i < n; i++) place("snowPile", r.x0 + 2 + random() * (r.x1 - r.x0 - 4), r.z0 + 2 + random() * (r.z1 - r.z0 - 4), random() * 360, { scale: 0.45 + random() * 0.5 });
  };

  // ================================================================== 1 THE BLACK PINES
  const f = FOREST;
  fence(f, false, true);
  // Dense pines all round, beyond the zone (and low clutter on the south edge).
  treeBelt(f.x0, f.z1 + 6, f.x0, f.z0 - 6, 14, -1);
  treeBelt(f.x1, f.z1 + 6, f.x1, f.z0 - 6, 14, 1);
  treeBelt(f.x0 - 4, f.z0, -GAP - 1.5, f.z0, 10, -1, 1.3);
  treeBelt(GAP + 1.5, f.z0, f.x1 + 4, f.z0, 10, -1, 1.3);
  lowEdge(f.x0, f.x1, f.z1 + 0.8);
  // Trees inside as cover, away from the road; logs and rocks between them.
  for (const [x, z] of [[-18, 30], [-21, 8], [-8, 12], [-19, -2], [-6, -18], [-20, -20], [9, 28], [20, 4], [11, -2], [19, -14], [8, -21], [22, 26], [-11, 0], [16, 9]]) pineAt(x + random() * 2, z + random() * 2, 1.1);
  placeAll([
    ["log", -5, 15, 30], ["log", 13.5, -8, 110], ["logSmall", -16, 4, 70], ["logSmall", 7, 12, 20], ["stump", -9, 27, 0], ["stump", 18.5, 21, 0],
    ["stump", -3, -6, 0], ["rockLarge", -22, 18, 40], ["rockMedium", 21, -22, 120], ["rockSmall", -9, -24, 200], ["rockMedium", 4, -14, 300],
    ["rockSmall", -20, 27, 10], ["deadTree", -13, -16, 0], ["deadTree", 17, 30, 70], ["rockFlat", -2, 9, 0],
  ]);
  // The frozen pond: rocks round its rim.
  placeAll([["rockSmall", -19.5, 19, 60], ["rockMedium", -8.4, 23.6, 150], ["rockSmall", -14, 25.8, 0], ["snowBank", -9, 15.4, 10]]);
  // An abandoned car on the road, doors torn off; the police car that hit a pine.
  cluster(3, 6, 12, [["sedan", 0, 0, 0], ["debrisDoor", 1.8, -0.8, 80, { tiltZ: 90, y: 0.15 }], ["debrisDoor", -2.3, 1.2, -40, { tiltZ: 90, y: 0.15 }], ["snowPile", 0.4, 2.7, 0]]);
  cluster(-14.5, -7.5, 128, [["police", 0, 0, 0, { tiltX: -6 }], ["debrisBumper", 0.3, 3, 20], ["debrisTire", -1.6, 2.2, 0], ["cone", 2, -2.6, 0]]);
  // The hunters' camp: tents, the cold fire pit, bedrolls, crates, an axe in a stump, a lamp on a post.
  cluster(15, 17, -15, [
    ["tentCanvas", -2.5, -2, 30], ["tentHalf", 2.6, -2.4, -20], ["campfire", 0.5, 1, 0], ["campfireStand", 0.5, 1, 0], ["bedroll", -1.8, 2.4, 70],
    ["box", 3.4, 1.8, 15], ["boxLarge", 4, 0.4, -10], ["chest", -4.3, 0.6, 20], ["stump", -3.4, 3.4, 0], ["axe", -3.4, 3.4, 30, { y: 1.1, tiltX: 20 }],
    ["lantern", -3, -0.6, 0], ["workbench", 4.8, -2.4, 90], ["signpostSingle", -5.5, -4, 30],
  ]);
  // A signpost where the road leaves the forest.
  placeAll([["signpost", 5.5, -24, 200], ["barrel", -5.8, -25, 0], ["barrelOpen", -6.6, -24.2, 0]]);
  scatterSnow(f, 12);

  // ------------------------------------------------------------------ track: forest -> farm (z -28..-44)
  for (const s of [-1, 1]) {
    treeBelt(s * (GAP + 0.8), -27, s * (GAP + 0.8), -45, 12, s > 0 ? 1 : -1, 1.4);
    place("fenceWood", s * (GAP + 0.7), -36, 90, { scale: [2.2, 1, 1] });
  }

  // ================================================================== 2 HOLLOW FARM
  const m = FARM;
  fence(m, true, true);
  // Farm fence round the field (posts and rails), pines beyond it.
  const rails = (ax: number, az: number, bx: number, bz: number, skip: number[] = []) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 2), yaw = (Math.atan2(-(bz - az), bx - ax) * 180) / Math.PI;
    for (let i = 0; i < n; i++) {
      if (skip.includes(i)) continue;
      const t = (i + 0.5) / n;
      place(random() < 0.12 ? "fenceGate" : "fenceWood", ax + (bx - ax) * t, az + (bz - az) * t, yaw, { scale: [(len / n) / 2, 1, 1] });
    }
  };
  rails(m.x0, m.z1, -GAP, m.z1, [3, 7]);
  rails(GAP, m.z1, m.x1, m.z1, [5]);
  rails(m.x0, m.z0, -GAP, m.z0);
  rails(GAP, m.z0, m.x1, m.z0, [9]);
  rails(m.x0, m.z1, m.x0, m.z0, [6, 7, 18]);
  rails(m.x1, m.z1, m.x1, m.z0, [11, 22]);
  treeBelt(m.x0 - 1, m.z1, m.x0 - 1, m.z0 - 4, 12, -1, 0.9);
  treeBelt(m.x1 + 1, m.z1, m.x1 + 1, m.z0 - 4, 12, 1, 0.9);
  treeBelt(m.x0 - 6, m.z0 - 1, -GAP - 1.5, m.z0 - 1, 9, -1, 1.2);
  treeBelt(GAP + 1.5, m.z0 - 1, m.x1 + 6, m.z0 - 1, 9, -1, 1.2);
  // The farmhouse (west, its porch to the yard) and a woodshed.
  placeAll([
    ["houseN", -17, -66, 90], ["shed", -22, -80, 0], ["shedRoof", -22, -80, 0, { y: 0 }],
    ["lantern", -11, -60, 0], ["bench", -11.5, -64, 90], ["planks", -21, -76.5, 30], ["log", -19, -84, 80], ["logSmall", -24.5, -84, 10],
    ["snowman", -8, -54, 160], ["sled", -6.6, -55.5, 30], ["axe", -20.5, -78.5, 90, { y: 0.6, tiltX: 30 }],
    ["truckFlat", -6, -76, 160], ["boxLarge", -4.6, -79.3, 20], ["barrel", -8.5, -79, 0],
  ]);
  // The barn (east): log walls, no roof (it fell in), the tractor still inside.
  const wall = (ax: number, az: number, bx: number, bz: number, pattern: WinterModel[], skip: number[] = []) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 3)), yaw = (Math.atan2(-(bz - az), bx - ax) * 180) / Math.PI;
    for (let i = 0; i < n; i++) {
      if (skip.includes(i)) continue;
      const t = (i + 0.5) / n;
      place(pattern[i % pattern.length], ax + (bx - ax) * t, az + (bz - az) * t, yaw, { scale: [(len / n) / 3, 1.25, 1] });
    }
    place("cabinCorner", ax, az, 0, { scale: [1, 1.25, 1] });
    place("cabinCorner", bx, bz, 0, { scale: [1, 1.25, 1] });
  };
  const B = { x0: 9, x1: 24, z0: -98, z1: -86 };
  wall(B.x0, B.z1, B.x1, B.z1, ["cabinWall", "cabinWindow", "cabinWall", "cabinWall", "cabinWindowB"], [2]);
  wall(B.x0, B.z0, B.x1, B.z0, ["cabinWall", "cabinWall", "cabinWindowLarge", "cabinWall", "cabinWall"]);
  wall(B.x0, B.z1, B.x0, B.z0, ["cabinWall", "cabinWallLow", "cabinWall", "cabinWall"], [1]);
  wall(B.x1, B.z1, B.x1, B.z0, ["cabinWall", "cabinWindow", "cabinWall", "cabinWall"]);
  placeAll([
    ["tractor", 19, -92, 200], ["boxLarge", 11, -96, 0], ["box", 12, -95.8, 20, { y: 0.9 }], ["barrelOpen", 22.5, -96.4, 0], ["planks", 15, -94, 60],
    ["cabinRoof", 13, -91, 0, { tiltZ: 32, y: -0.6, noCollider: true }], ["lanternHanging", 18, -87, 0, { y: 1.6 }],
    ["barrelOpen", 6.5, -80, 0], ["barrel", 7.5, -81, 0], ["barrel", 5.8, -81.2, 0],
  ]);
  // The field: the abandoned tractor-plough, hay bales (crates), a scarecrow post, the frozen dead's tracks.
  placeAll([
    ["tractorShovel", 13, -60, 250], ["boxLarge", 21, -54, 15, { scale: [1.6, 1.4, 1.6] }], ["boxLarge", 22.6, -55.5, -10, { scale: [1.6, 1.4, 1.6] }],
    ["boxLarge", -20, -98, 40, { scale: [1.6, 1.4, 1.6] }], ["signpostSingle", 4, -66, 0, { scale: 2 }], ["stump", -3, -92, 0],
    ["rockMedium", 25, -78, 60], ["rockSmall", -26, -54, 10], ["deadTree", 26, -102, 0], ["deadTree", -27, -48, 30],
    ["pineSnowB", 2, -97, 0], ["pineSnowA", -12, -100, 40], ["pine", 26, -66, 0],
  ]);
  scatterSnow(m, 12);

  // ------------------------------------------------------------------ track: farm -> suburb (z -104..-120)
  for (const s of [-1, 1]) {
    treeBelt(s * (GAP + 0.8), -105, s * (GAP + 0.8), -121, 10, s > 0 ? 1 : -1, 1.4);
    place("streetLight", s * (GAP + 1), -116, s > 0 ? -90 : 90);
  }
  place("highwaySign", -GAP - 2.5, -110, 90);

  // ================================================================== 3 MAPLE LANE
  const u = SUBURB;
  fence(u, true, true);
  // The street (north-south) and the cross street (8 m tiles, lifted clear of the ground patches).
  const ROAD: SpawnOptions = { y: 0.04 };
  // (The kit's straight tile runs along x: turned 90 to run north-south.)
  for (let z = -116; z >= -188; z -= 8) place(z === -148 ? "roadCross" : "road", 0, z - 4, z === -148 ? 0 : 90, ROAD);
  for (const x of [-36, -28, -20, -12, -4, 12, 20, 28, 36]) if (x !== -4) place("road", x, -152, 0, ROAD);
  place("road", 8, -152, 0, ROAD);
  // Houses either side, fronts to the street; garden fences between; trees in the gardens.
  const HOUSES: WinterModel[] = ["houseA", "houseB", "houseC", "houseD", "houseE", "houseF", "houseG", "houseJ", "houseK", "houseL", "houseO", "houseP"];
  let hi = 0;
  for (const s of [-1, 1]) {
    for (const z of [-130, -141, -164, -176]) {
      const id = HOUSES[hi++ % HOUSES.length];
      place(id, s * 19, z, s < 0 ? 90 : -90);
      // Driveway and a car in it (some crashed out on the lawn).
      place("driveway", s * 9.5, z + 3.2, 90, { y: 0.02 });
      const car = (["sedan", "suv", "van", "hatchback", "suvLuxury", "sedanSports", "truck", "taxi"] as WinterModel[])[(hi * 3) % 8];
      if (hi % 3 !== 0) place(car, s * (9 + random() * 2), z + 3.2 + random(), s < 0 ? 90 + random() * 30 : -90 - random() * 30);
      place("fence1x4", s * 22, z - 6, 0, { noCollider: false });
      place(random() < 0.5 ? "gardenTree" : "gardenTreeSmall", s * 28.5, z + random() * 4, random() * 360);
    }
    // Back fences at the zone's side edges.
    for (let z = u.z1 - 4; z > u.z0; z -= 8) place("fence1x4", s * (u.x1 - 0.6), z, 90, { scale: [1, 1, 1] });
  }
  // The cross street's ends are blocked: police barriers and a patrol car (east), a crashed van (west).
  placeAll([
    ["police", 10, -152.5, 75], ["barrier", 13.5, -149, 90], ["barrier", 13.5, -155.5, 90], ["barrierLight", 13.8, -152, 0], ["roadCone", 8, -156, 0], ["roadCone", 7, -149, 0],
    ["vanBurnt", -12, -151.5, 120, { tiltZ: 90, y: 1.4 }], ["debrisTire", -9, -149, 0], ["debrisPlate", -14, -155, 30],
    ["ambulance", -3.4, -168, 165], ["debrisDoor", -1.3, -170.5, 60, { tiltZ: 90, y: 0.15 }], ["boxOpen", -5.5, -171, 20],
    ["sedanBurnt", 4, -137, 200], ["debrisBumper", 2, -133.5, 20],
  ]);
  // Street lamps (some failing: see AMBIENT), mailbox-height clutter, a snowman in a back garden.
  for (const [x, z, yaw] of [[-5.4, -132, 90], [5.4, -144, -90], [-5.4, -164, 90], [5.4, -178, -90], [5.4, -126, -90], [-5.4, -182, 90]] as const) place("streetLight", x, z, yaw);
  placeAll([
    ["snowman", 27, -133, 200], ["snowman", -27, -170, 40], ["sled", -26, -168, 0], ["planter", -11, -126, 0], ["planter", 11, -170, 0],
    ["cone", -2, -124, 0], ["wheel", 6.5, -140, 0, { tiltZ: 90, y: 0.3 }], ["bench", 26, -158, 90],
  ]);
  // The burning house (east, z -170): its fire and smoke in AMBIENT; debris thrown on the lawn.
  placeAll([["debrisPlate", 16, -165, 40], ["planks", 14, -168, 10], ["debrisDoor", 15, -172, 70, { tiltZ: 90, y: 0.15 }]]);
  scatterSnow(u, 8);
  // Pines and dark houses beyond the north edge.
  treeBelt(u.x0 - 4, u.z0 - 1, -GAP - 1.5, u.z0 - 1, 9, -1, 1.1);
  treeBelt(GAP + 1.5, u.z0 - 1, u.x1 + 4, u.z0 - 1, 9, -1, 1.1);
  for (const s of [-1, 1]) treeBelt(s * (u.x1 + 1), u.z1, s * (u.x1 + 1), u.z0, 10, s < 0 ? -1 : 1, 0.8);
  lowEdge(u.x0, u.x1, u.z1 + 0.8);

  // ------------------------------------------------------------------ track: suburb -> town (z -184..-200)
  for (const s of [-1, 1]) {
    place("barrier", s * (GAP + 0.8), -192, 90);
    place(s < 0 ? "suvBurnt" : "taxiBurnt", s * (GAP + 4), -192, s * 70, { noCollider: true });
    treeBelt(s * (GAP + 6), -185, s * (GAP + 6), -199, 6, s > 0 ? 1 : -1, 1);
  }
  for (let z = -184; z >= -200; z -= 8) place("road", 0, z - 4, 90, ROAD);
  for (const s of [-1, 1]) edge(s * (GAP + 1), -192, 1, 16);
  for (const s of [-1, 1]) edge(s * (GAP + 1), -36, 1, 16);
  for (const s of [-1, 1]) edge(s * (GAP + 1), -112, 1, 16);

  // ================================================================== 4 ASHFORD
  const t = TOWN;
  fence(t, true, false);
  for (let z = -200; z >= -264; z -= 8) place(z === -228 ? "roadCross" : "road", 0, z - 4, z === -228 ? 0 : 90, ROAD);
  for (const x of [-36, -28, -20, -12, 12, 20, 28, 36]) place("road", x, -232, 0, ROAD);
  // Buildings at the four corners of the square (shops), set back so the square stays open.
  placeAll([
    ["houseD", -24, -212, 90], ["houseN", -24, -252, 90], ["houseB", 24, -212, -90], ["houseS", 24, -252, -90],
    ["houseT", -12, -270, 180, { noCollider: true }], ["houseU", 12, -270, 180, { noCollider: true }], ["shack", 0, -272, 0, { noCollider: true }],
  ]);
  // The wrecks: a burning bus, burning cars, a flipped car, the fire truck that never got there,
  // the police line that failed.
  placeAll([
    ["busBurnt", 12, -222, 75], ["sedanBurnt", -9, -214, 160], ["truckBurnt", -16, -240, 20], ["policeBurnt", 18, -246, 120],
    ["suv", 3, -256, 95, { tiltZ: 90, y: 1.3 }], ["firetruck", 9, -258, 250], ["taxi", -13, -258, 200],
    ["police", -5, -205.5, 100], ["barrier", -1.5, -208, 0], ["barrier", 2.8, -208.2, 6], ["barrierLight", 5.6, -208, 0],
    ["ambulance", 21, -236, 10, { tiltX: 4 }],
  ]);
  // Debris and burning drums round the square's edge; the square itself open for the fight.
  for (let i = 0; i < 30; i++) {
    const a = random() * Math.PI * 2, r = 13 + random() * 15;
    const x = Math.cos(a) * r, z = -232 + Math.sin(a) * r;
    if (Math.abs(x) > t.x1 - 2 || z > t.z1 - 2 || z < t.z0 + 2) continue;
    const roll = random();
    place(roll < 0.2 ? "debrisTire" : roll < 0.38 ? "debrisPlate" : roll < 0.5 ? "debrisBumper" : roll < 0.62 ? "debrisDoor" : roll < 0.74 ? "wheel" : roll < 0.86 ? "boxOpen" : "planks",
      x, z, random() * 360, roll >= 0.5 && roll < 0.62 ? { tiltZ: 90, y: 0.15 } : {});
  }
  placeAll([
    ["barrelOpen", 22.5, -232, 0], ["barrel", 23.4, -231, 0], ["barrelOpen", -22.5, -226, 0], ["barrel", -23.3, -227.2, 0],
    ["streetLightDouble", -6, -226, 90], ["streetLight", 6, -238, -90], ["streetLight", -6, -248, 90, { tiltZ: 18 }], ["streetLight", 6, -214, -90],
    ["highwaySign", 28, -226, -90], ["snowBank", -28, -244, 90], ["snowBank", 28, -258, 90], ["roadCone", -2.5, -219, 0], ["roadCone", 9.5, -244, 0],
  ]);
  // Edges: burnt-out cars and barriers along the sides, the ruins beyond.
  for (const s of [-1, 1]) {
    for (let z = t.z1 - 6; z > t.z0; z -= 9) place(random() < 0.5 ? "barrier" : "snowBank", s * (t.x1 - 1), z, 90);
    treeBelt(s * (t.x1 + 1), t.z1, s * (t.x1 + 1), t.z0, 8, s < 0 ? -1 : 1, 0.6);
  }
  for (let x = t.x0 + 2; x < t.x1; x += 5) place(random() < 0.4 ? "barrier" : "snowBank", x, t.z0 + 0.8, 0);
  lowEdge(t.x0, t.x1, t.z1 + 0.8);
  scatterSnow(t, 4);

  buildSeals(kit, root);
  return root;
}

/* ------------------------------------------------------------------------------------------------
 * Barriers (the way on): a row of road barriers across each track; the one ahead sinks when won.
 * ---------------------------------------------------------------------------------------------- */
interface Seal { entity: Entity; x: number; z: number; open: number }
const SEAL_OPEN_SECONDS = 0.8;
const world = { seals: [] as Seal[], exitSeals: [] as Seal[] };

function buildSeals(kit: ModelKit<WinterModel>, root: Entity): void {
  world.seals = [];
  world.exitSeals = [];
  for (const z of [FOREST.z0, FARM.z1, FARM.z0, SUBURB.z1, SUBURB.z0, TOWN.z1]) {
    const e = new Entity("barrier");
    e.setLocalPosition(0, 0, z);
    root.addChild(e);
    for (const x of [-2.6, 0, 2.6]) kit.spawn("barrier", x, 0, 0, e, { noCollider: true, scale: [1, 1.2, 1] });
    kit.spawn("barrierLight", 3.8, 0, 0, e, { noCollider: true });
    e.enabled = false;
    world.seals.push({ entity: e, x: 0, z, open: -1 });
  }
}

function onEdge(r: LevelBounds, x: number, z: number): boolean {
  const inX = x >= r.minX - 1.5 && x <= r.maxX + 1.5, inZ = z >= r.minZ - 1.5 && z <= r.maxZ + 1.5;
  const nearZ = Math.abs(z - r.minZ) < 1.5 || Math.abs(z - r.maxZ) < 1.5;
  const nearX = Math.abs(x - r.minX) < 1.5 || Math.abs(x - r.maxX) < 1.5;
  return (inX && nearZ) || (inZ && nearX);
}

/* ------------------------------------------------------------------------------------------------
 * Moods: dusk in the pines, a whiteout on the farm, black night in the suburb, the sky lit by the
 * burning town. Eased in as a level starts. The flashlight: a spot from the hero's chest along his
 * facing, brighter as the night gets darker.
 * ---------------------------------------------------------------------------------------------- */
interface Mood { sun: [number, number, number]; sunI: number; clear: [number, number, number]; fog: [number, number]; ambient: [number, number, number]; torch: number; vignette: number }
const W = WINTER_LIGHTING;
const MOODS: Record<string, Mood> = {
  forest: { sun: W.sun.color as [number, number, number], sunI: W.sun.intensity, clear: W.clearColor as [number, number, number], fog: [W.fogStart, W.fogEnd], ambient: W.groundAmbient as [number, number, number], torch: 1.6, vignette: 0.8 },
  farm: { sun: [0.78, 0.82, 0.95], sunI: 1.1, clear: [0.44, 0.47, 0.53], fog: [11, 36], ambient: [0.62, 0.66, 0.76], torch: 1.2, vignette: 0.55 },
  suburb: { sun: [0.5, 0.58, 0.9], sunI: 1.0, clear: [0.07, 0.08, 0.13], fog: [13, 42], ambient: [0.42, 0.46, 0.62], torch: 2.4, vignette: 1 },
  town: { sun: [1.0, 0.58, 0.32], sunI: 0.95, clear: [0.13, 0.075, 0.05], fog: [13, 42], ambient: [0.4, 0.33, 0.3], torch: 2.2, vignette: 0.85 },
};
const clone = (m: Mood): Mood => ({ ...m, sun: [...m.sun], clear: [...m.clear], ambient: [...m.ambient], fog: [...m.fog] });
const mood = { app: null as AppBase | null, current: clone(MOODS.forest), target: MOODS.forest, torch: null as Entity | null, sun: null as Entity | null, camera: null as Entity | null, vignette: null as HTMLElement | null };

function attachMood(app: AppBase): void {
  mood.app = app;
  mood.sun = app.root.findByName("Sun") as Entity | null;
  mood.camera = app.root.findByName("Camera") as Entity | null;
  // A dark vignette over the edges of the screen (a page overlay: free on the GPU, under the HUD):
  // the night closes in round the hero.
  if (typeof document !== "undefined" && !mood.vignette) {
    const v = document.createElement("div");
    v.id = "winter-vignette";
    v.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:4;transition:opacity 1.5s;" +
      "background:radial-gradient(ellipse 78% 64% at 50% 50%, rgba(0,0,0,0) 52%, rgba(3,6,14,0.5) 80%, rgba(1,2,8,0.88) 100%)," +
      "radial-gradient(ellipse 110% 90% at 50% 50%, rgba(0,0,0,0) 70%, rgba(190,210,240,0.07) 100%);";
    document.body.append(v);
    mood.vignette = v;
  }
  applyMood(1);
}

/** The flashlight, once the hero exists (the world is attached before he is). */
function ensureTorch(app: AppBase): void {
  if (mood.torch) return;
  const player = app.root.findByName("Player") as Entity | null;
  if (player) {
    const torch = new Entity("Flashlight");
    torch.addComponent("light", {
      type: "spot", color: new Color(1, 0.93, 0.8), intensity: MOODS.forest.torch, range: 17, innerConeAngle: 16, outerConeAngle: 34,
      castShadows: false,
    });
    // Chest height, a little ahead; aimed along the hero's facing (+z of the player root), tipped down.
    torch.setLocalPosition(0, 1.35, 0.25);
    torch.setLocalEulerAngles(-78, 0, 0);
    player.addChild(torch);
    mood.torch = torch;
  }
}

function applyMood(dt: number): void {
  const app = mood.app;
  if (!app) return;
  ensureTorch(app);
  const c = mood.current, t = mood.target, k = Math.min(1, dt * 0.6);
  const ease = (a: number[], b: readonly number[]) => { for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * k; };
  ease(c.sun, t.sun); ease(c.clear, t.clear); ease(c.ambient, t.ambient); ease(c.fog, t.fog);
  c.sunI += (t.sunI - c.sunI) * k;
  c.torch += (t.torch - c.torch) * k;
  c.vignette += (t.vignette - c.vignette) * k;
  if (mood.vignette) mood.vignette.style.opacity = c.vignette.toFixed(2);
  if (mood.sun?.light) { mood.sun.light.color = new Color(c.sun[0], c.sun[1], c.sun[2]); mood.sun.light.intensity = c.sunI; }
  if (mood.camera?.camera) mood.camera.camera.clearColor = new Color(c.clear[0], c.clear[1], c.clear[2]);
  app.scene.fog.color = new Color(c.clear[0], c.clear[1], c.clear[2]);
  if (app.scene.fog.type !== "none") { app.scene.fog.start = c.fog[0]; app.scene.fog.end = c.fog[1]; }
  app.scene.ambientLight = new Color(c.ambient[0], c.ambient[1], c.ambient[2]);
  // The flashlight wavers a touch (a hand-held beam), and stutters now and then like a dying battery.
  if (mood.torch?.light) {
    const time = performance.now() / 1000;
    const stutter = Math.sin(time * 0.37) > 0.985 ? 0.25 + Math.random() * 0.5 : 1;
    mood.torch.light.intensity = c.torch * stutter * (0.96 + 0.04 * Math.sin(time * 7.1));
  }
}

/** Chapter 6: Whiteout. */
export const WINTER_BIOME: Biome<WinterModel> = {
  id: "winter",
  label: "Whiteout",
  kit: { url: WINTER.url, models: WINTER_MODELS, brightness: WINTER.brightness, batchCellMetres: WINTER.batchCellMetres },
  lighting: WINTER_LIGHTING,
  ground: GROUND_SPEC,
  stepAreas: [
    { x0: -4, z0: -188, x1: 4, z1: -116, surface: "slush" }, { x0: -40, z0: -156, x1: 40, z1: -148, surface: "slush" },
    { x0: -4, z0: -268, x1: 4, z1: -188, surface: "slush" }, { x0: -40, z0: -236, x1: 40, z1: -228, surface: "slush" },
  ],
  bounds: BOUNDS,
  spawn: SPAWN,
  runStart: ZONES.forest.start,
  ambient: AMBIENT,
  build: buildWinterLevel,
  campaign: {
    levels: WINTER_LEVELS,
    zones: ZONES,
    run: WINTER_RUN,
    difficulties: WINTER_DIFFICULTIES,
    defaultDifficulty: "hard",
    victory: { title: "MORNING", text: "The Ravager burns with the town. The snow stops before dawn, and the road south is open - for whoever is left to take it." },
    attachWorld(app) {
      attachMood(app);
    },
    onLevel(_index, zoneId) {
      const r = ZONES[zoneId]?.region;
      for (const s of world.seals) {
        s.open = -1;
        s.entity.setLocalPosition(s.x, 0, s.z);
        s.entity.enabled = !!r && onEdge(r, s.x, s.z);
      }
      world.exitSeals = [];
      mood.target = MOODS[zoneId] ?? MOODS.forest;
    },
    exits(zoneId): WayPoint[] {
      const exit = ZONES[zoneId]?.exit;
      world.exitSeals = exit ? world.seals.filter((s) => s.entity.enabled && Math.abs(s.z - exit.at) < 1.5) : [];
      return world.exitSeals.map((s) => ({ x: s.x, z: s.z, width: GAP * 2, yawDeg: 0 }));
    },
    openExit(_zoneId, index) {
      const s = world.exitSeals[index];
      if (s && s.open < 0 && s.entity.enabled) s.open = 0;
    },
    update(dt) {
      for (const s of world.exitSeals) {
        if (s.open < 0 || !s.entity.enabled) continue;
        s.open = Math.min(1, s.open + dt / SEAL_OPEN_SECONDS);
        s.entity.setLocalPosition(s.x, -1.4 * s.open * s.open, s.z);
        if (s.open >= 1) s.entity.enabled = false;
      }
      applyMood(dt);
    },
  },
};
