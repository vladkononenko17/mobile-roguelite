import type { AmbientEmitter } from "../AmbientFx";
import { Entity } from "playcanvas";
import { MEDIEVAL_DIFFICULTIES, MEDIEVAL_LEVELS, MEDIEVAL_RUN } from "../../gameplay/medievalConfig";
import type { GroundSpec } from "../Ground";
import type { ModelKit, SpawnOptions } from "../props/ModelKit";
import { declareCollider } from "../collision/CollisionWorld";
import { MEDIEVAL_MODELS, type MedievalModel } from "../props/MedievalKit";
import { MEDIEVAL, MEDIEVAL_LIGHTING } from "../../config";
import type { Biome, LevelBounds, WayPoint, Zone } from "./Biome";

/**
 * THE DARK KINGDOM - the medieval chapter: seven zones, south to north (~120 x 540 m), joined by
 * short lanes through barricades that fall when a level is won (the walk-on flow of the other maps).
 *
 *   z   36..-24   1 THE BURNED VILLAGE   houses either side of the lane, a well and a market
 *   z  -40..-96   2 THE GRAVEYARD        rows of graves inside iron fences, crypts, dead trees
 *   z -112..-168  3 THE ABBEY            cloister walls and pillars round a cobbled court, the church north (boss)
 *   z -184..-240  4 THE BRIDGE           a narrow stone causeway between parapets, towers at its ends
 *   z -256..-312  5 THE OUTER BAILEY     curtain walls and towers, barracks, smithy, training yard
 *   z -328..-384  6 THE GREAT HALL       a roofless hall: pillars, long tables, banners, torches
 *   z -400..-460  7 THE THRONE YARD      flagstones under the castle keep (boss)
 *
 * The camera looks towards -Z (up the screen) and sees ~8 m past the hero to each side, so tall
 * buildings stand only at the sides and beyond the north edge of a zone, never south of the play.
 */

interface Box { x0: number; z0: number; x1: number; z1: number }
const ZONE_BOXES: Record<string, Box> = {
  village: { x0: -30, z0: -24, x1: 30, z1: 36 },
  graveyard: { x0: -30, z0: -96, x1: 30, z1: -40 },
  abbey: { x0: -30, z0: -168, x1: 30, z1: -112 },
  bridge: { x0: -14, z0: -240, x1: 14, z1: -184 },
  bailey: { x0: -30, z0: -312, x1: 30, z1: -256 },
  hall: { x0: -24, z0: -384, x1: 24, z1: -328 },
  throne: { x0: -30, z0: -460, x1: 30, z1: -400 },
};
const ORDER = ["village", "graveyard", "abbey", "bridge", "bailey", "hall", "throne"] as const;
/** Half width of the lanes joining the zones (and of the gaps the barricades close). */
const GAP = 4;
export const BOUNDS: LevelBounds = { minX: -60, maxX: 60, minZ: -500, maxZ: 40 };

const region = (b: Box): LevelBounds => ({ minX: b.x0 + 1, maxX: b.x1 - 1, minZ: b.z0 + 1, maxZ: b.z1 - 1 });
export const ZONES: Record<string, Zone> = Object.fromEntries(ORDER.map((id, i) => {
  const b = ZONE_BOXES[id];
  const start = { x: 0, z: i === 0 ? 22 : b.z1 - 5, yawDeg: 180 };
  const zone: Zone = { region: region(b), start };
  if (i < ORDER.length - 1) zone.exit = { axis: "z", at: b.z0, dir: -1 };
  return [id, zone];
}));

export const SPAWN = { x: 0, z: 30, yawDeg: 180 };

/** Torches, braziers, burning roofs, smoke, crows, drifting ash and leaves; sparse so combat reads. */
export const AMBIENT: AmbientEmitter[] = [
  // Village: thatch still burning, smoke over the lane.
  { kind: "fire", x: -22, y: 3.2, z: 14, size: [1.6, 1.2], intensity: 1 },
  { kind: "fire", x: 23, y: 3, z: -4, size: [1.4, 1.2], intensity: 0.9 },
  { kind: "smoke", x: -22, y: 4, z: 14, size: [1.4, 1.4], intensity: 1 },
  { kind: "smoke", x: 23, y: 4, z: -4, size: [1.2, 1.2], intensity: 0.8 },
  { kind: "smoke", x: 0, y: 1, z: 6, size: [20, 20], intensity: 0.5 },
  { kind: "birds", x: 0, y: 5, z: 4, size: [24, 24], intensity: 1 },
  { kind: "leaves", x: 0, y: 0.4, z: 4, size: [24, 24], intensity: 0.8, color: [0.9, 0.7, 0.4] },
  // Graveyard: crows, ground mist, lantern flames.
  { kind: "birds", x: 0, y: 6, z: -68, size: [28, 28], intensity: 1.3 },
  { kind: "dust", x: 0, y: 0.6, z: -68, size: [30, 30], intensity: 1, color: [0.7, 0.75, 0.85] },
  { kind: "fire", x: -GAP - 1.6, y: 2.1, z: -43, size: [0.25, 0.25], intensity: 0.6 },
  { kind: "fire", x: GAP + 1.6, y: 2.1, z: -43, size: [0.25, 0.25], intensity: 0.6 },
  // Abbey: braziers by the church steps, candle smoke.
  { kind: "fire", x: -8, y: 1.3, z: -160, size: [0.4, 0.4], intensity: 0.8 },
  { kind: "fire", x: 8, y: 1.3, z: -160, size: [0.4, 0.4], intensity: 0.8 },
  { kind: "dust", x: 0, y: 1, z: -140, size: [24, 24], intensity: 0.7 },
  // Bridge: wind and leaves across the causeway.
  { kind: "leaves", x: 0, y: 0.5, z: -212, size: [14, 40], intensity: 1, color: [0.9, 0.75, 0.45] },
  { kind: "birds", x: 0, y: 7, z: -212, size: [30, 40], intensity: 1 },
  // Bailey: the smithy forge, torches on the gate.
  { kind: "fire", x: 22, y: 1.2, z: -282, size: [0.6, 0.5], intensity: 0.9 },
  { kind: "sparks", x: 22, y: 1.4, z: -282, every: 4 },
  { kind: "smoke", x: 22, y: 3, z: -282, size: [1, 1], intensity: 0.7 },
  { kind: "dust", x: 0, y: 1, z: -284, size: [30, 30], intensity: 0.8 },
  // Great hall: torches along the walls.
  ...[-352, -366].flatMap((z) => [-20.5, 20.5].map((x) => ({ kind: "fire" as const, x, y: 2.6, z, size: [0.3, 0.3] as [number, number], intensity: 0.8 }))),
  { kind: "dust", x: 0, y: 1.2, z: -356, size: [24, 30], intensity: 0.7 },
  // Throne yard: braziers round the arena, embers, crows over the keep.
  ...[[-14, -418], [14, -418], [-14, -444], [14, -444]].map(([x, z]) => ({ kind: "fire" as const, x, y: 1.3, z, size: [0.45, 0.45] as [number, number], intensity: 1 })),
  { kind: "sparks", x: 0, y: 1, z: -430, every: 6 },
  { kind: "birds", x: 0, y: 8, z: -440, size: [30, 30], intensity: 1.2 },
];

export const GROUND_SPEC: GroundSpec = {
  base: "meadow",
  // The whole chapter (the default ground square is far smaller than this 540 m map).
  areas: [{ x0: -130, z0: -540, x1: 130, z1: 140 }],
  pads: [
    // Cobbled courts: the abbey, the bridge deck, the bailey yard; flagstones in the hall and the throne yard.
    { x0: -22, z0: -164, x1: 22, z1: -118, surface: "cobble" },
    { x0: -10, z0: -246, x1: 10, z1: -178, surface: "cobble" },
    { x0: -26, z0: -306, x1: 26, z1: -262, surface: "cobble" },
    { x0: -23, z0: -383, x1: 23, z1: -329, surface: "flagstone" },
    { x0: -26, z0: -456, x1: 26, z1: -404, surface: "flagstone" },
    // The lanes between the zones.
    ...ORDER.slice(0, -1).map((id) => ({ x0: -GAP - 1, z0: ZONE_BOXES[id].z0 - 16, x1: GAP + 1, z1: ZONE_BOXES[id].z0 + 2, surface: "mud" as const })),
  ],
  patches: [
    // Village lane and muddy yards.
    { x: 0, z: 6, w: 10, d: 56, surface: "mud", seed: 0 },
    { x: -14, z: 18, w: 14, d: 10, surface: "mud", seed: 1 },
    { x: 13, z: -6, w: 14, d: 12, surface: "mud", seed: 2 },
    { x: 0, z: -14, w: 20, d: 12, surface: "mud", seed: 3 },
    // Graveyard earth.
    { x: 0, z: -68, w: 52, d: 50, surface: "gravedirt", seed: 0 },
    { x: -18, z: -54, w: 16, d: 14, surface: "gravedirt", seed: 1 },
    { x: 18, z: -84, w: 16, d: 14, surface: "gravedirt", seed: 2 },
    // Mud round the bailey's buildings and in the training yard.
    { x: -18, z: -270, w: 14, d: 12, surface: "mud", seed: 1 },
    { x: 18, z: -296, w: 14, d: 12, surface: "mud", seed: 2 },
    // The ravine either side of the bridge: dark mud and stones.
    { x: -24, z: -212, w: 18, d: 60, surface: "mud", seed: 3 },
    { x: 24, z: -212, w: 18, d: 60, surface: "mud", seed: 0 },
  ],
};

type Placement = [MedievalModel, number, number, number?, SpawnOptions?];

/** Wall-like models whose length runs along their local Z. */
const ALONG_Z = new Set<MedievalModel>(["fenceStone", "fenceWood"]);

/** Deterministic RNG so the layout is the same on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

interface WallRunOptions {
  /** Models cycled along the run; "" leaves a gap. */
  pattern: (MedievalModel | "")[];
  /** Module width the models are built at (castle walls 4 m, iron fence 4 m, curtain wall 13 m). */
  module?: number;
  skip?: number[];
  /** Vertical scale (e.g. 0.6 for a low south wall the camera looks over). */
  height?: number;
  /** Put a pillar at every Nth joint (0 = none). */
  pillarsEvery?: number;
  pillar?: MedievalModel;
  flip?: boolean;
  noCollider?: boolean;
}

/** Level builder: every visible piece is a kit model; colliders come with the models. */
export function buildMedievalLevel(kit: ModelKit<MedievalModel>): Entity {
  const root = new Entity("MedievalLevel");
  const random = rng(1066);
  const place = (id: MedievalModel, x: number, z: number, yaw = 0, options: SpawnOptions = {}) => kit.spawn(id, x, z, yaw, root, options);
  const placeAll = (list: Placement[]) => { for (const [id, x, z, yaw, options] of list) place(id, x, z, yaw ?? 0, options); };

  const wallRun = (ax: number, az: number, bx: number, bz: number, o: WallRunOptions) => {
    const module = o.module ?? 4;
    const length = Math.hypot(bx - ax, bz - az);
    const count = Math.max(1, Math.round(length / module));
    const width = length / count;
    const dx = (bx - ax) / length, dz = (bz - az) / length;
    const yaw = (Math.atan2(-dz, dx) * 180) / Math.PI + (o.flip ? 180 : 0);
    const h = o.height ?? 1;
    for (let i = 0; i < count; i++) {
      if (o.skip?.includes(i)) continue;
      const id = o.pattern[i % o.pattern.length];
      if (!id) continue;
      // Models built along their local Z (the stone fence) turn a quarter and stretch on Z.
      const alongZ = ALONG_Z.has(id);
      place(id, ax + dx * width * (i + 0.5), az + dz * width * (i + 0.5), yaw + (alongZ ? 90 : 0),
        { scale: alongZ ? [1, h, width / module] : [width / module, h, 1], noCollider: o.noCollider });
    }
    if (o.pillarsEvery) {
      for (let i = 0; i <= count; i += o.pillarsEvery) place(o.pillar ?? "wallPillar", ax + dx * width * i, az + dz * width * i, yaw, { scale: [1, h, 1], noCollider: o.noCollider });
    }
  };

  /** Invisible walls exactly on the zone edges so nothing slips between pieces. */
  const edge = (x: number, z: number, width: number, depth: number) => {
    const e = new Entity("edge");
    e.setLocalPosition(x, 0, z);
    root.addChild(e);
    declareCollider(e, { kind: "box", width, depth });
  };
  /** Edges round a zone box, open (GAP) at the south and/or north lane. */
  const zoneEdges = (b: Box, openSouth: boolean, openNorth: boolean) => {
    const line = (z: number, open: boolean) => {
      if (open) {
        edge((b.x0 - GAP) / 2, z, -GAP - b.x0, 1);
        edge((b.x1 + GAP) / 2, z, b.x1 - GAP, 1);
      } else edge((b.x0 + b.x1) / 2, z, b.x1 - b.x0 + 2, 1);
    };
    line(b.z1 + 0.5, openSouth);
    line(b.z0 - 0.5, openNorth);
    edge(b.x0 - 0.5, (b.z0 + b.z1) / 2, 1, b.z1 - b.z0 + 2);
    edge(b.x1 + 0.5, (b.z0 + b.z1) / 2, 1, b.z1 - b.z0 + 2);
  };
  /** A lane north from zone `b` to the next zone: walls / fences either side, lanterns. */
  const lane = (b: Box, next: Box, side: MedievalModel, height = 1) => {
    for (const s of [-1, 1]) {
      wallRun(s * (GAP + 0.5), b.z0, s * (GAP + 0.5), next.z1, { pattern: [side], height, flip: s > 0 });
      edge(s * (GAP + 1), (b.z0 + next.z1) / 2, 1, b.z0 - next.z1);
    }
    place("lanternPost", -GAP - 1.6, b.z0 - 3, 0);
    place("lanternPost", GAP + 1.6, next.z1 + 3, 0);
  };
  /** Scatter of `ids` in a rectangle, skipping a clear strip round the centre lane. */
  const scatter = (ids: MedievalModel[], n: number, b: Box, clearHalf: number, options: () => SpawnOptions = () => ({})) => {
    for (let i = 0; i < n; i++) {
      const x = b.x0 + random() * (b.x1 - b.x0), z = b.z0 + random() * (b.z1 - b.z0);
      if (Math.abs(x) < clearHalf) continue;
      place(ids[Math.floor(random() * ids.length)], x, z, random() * 360, options());
    }
  };

  buildVillage(place, placeAll, wallRun, scatter, random);
  buildGraveyard(place, placeAll, wallRun, scatter, random);
  buildAbbey(place, placeAll, wallRun, random);
  buildBridge(place, placeAll, wallRun, scatter, random);
  buildBailey(place, placeAll, wallRun, random);
  buildHall(place, placeAll, wallRun);
  buildThrone(place, placeAll, wallRun, random);

  // Zone edges and the lanes between the zones.
  ORDER.forEach((id, i) => zoneEdges(ZONE_BOXES[id], i > 0, i < ORDER.length - 1));
  const laneSides: MedievalModel[] = ["fenceWood", "fenceIron", "wallHalf", "fenceStone", "wall", "wall"];
  ORDER.slice(0, -1).forEach((id, i) => lane(ZONE_BOXES[id], ZONE_BOXES[ORDER[i + 1]], laneSides[i], laneSides[i] === "wall" ? 0.8 : 1));
  // South of the village: the road the hero came by.
  edge(0, ZONE_BOXES.village.z1 + 0.5, 62, 1);

  buildBackdrop(place, random);
  buildSeals(kit, root);
  return root;
}

type Place = (id: MedievalModel, x: number, z: number, yaw?: number, options?: SpawnOptions) => Entity | null;
type PlaceAll = (list: Placement[]) => void;
type WallRun = (ax: number, az: number, bx: number, bz: number, o: WallRunOptions) => void;
type Scatter = (ids: MedievalModel[], n: number, b: Box, clearHalf: number, options?: () => SpawnOptions) => void;

/* ------------------------------------------------------------------------------------------------
 * 1 THE BURNED VILLAGE
 * ---------------------------------------------------------------------------------------------- */
function buildVillage(place: Place, placeAll: PlaceAll, wallRun: WallRun, scatter: Scatter, random: () => number): void {
  void place;
  const b = ZONE_BOXES.village;
  // A low wooden fence along the south (the camera looks over it), stone walls with gaps north.
  wallRun(b.x0, b.z1, b.x1, b.z1, { pattern: ["fenceWood"], module: 7.5, height: 0.8 });
  wallRun(b.x0, b.z0, -GAP, b.z0, { pattern: ["fenceStone", "fenceStone", ""], module: 7.5 });
  wallRun(GAP, b.z0, b.x1, b.z0, { pattern: ["", "fenceStone", "fenceStone"], module: 7.5 });
  // Houses down both sides of the lane, gables to the street; two burned to the frame.
  placeAll([
    ["homeA", -23, 25, 90], ["homeB", -22, 14, 90, { scale: 1.1 }], ["ruin", -23, 2, 90], ["tavern", -22, -12, 90],
    ["homeB2", 23, 27, -90], ["blacksmith", 22, 15, -90], ["homeA2", 23, -4, -90, { scale: 1.1 }], ["scaffolding", 22.5, -15, -90],
    ["grain", -27, -20, 0], ["watermill", 27, -21, -90, { scale: 0.9 }],
  ]);
  // The square: a well, the market stall, carts and crates as cover.
  placeAll([
    ["well", 0, 2, 0], ["market", -9, -8, 20], ["market", 9.5, 11, -160],
    ["wheelbarrow", 6, -2, 60], ["hay", -7, 15, 10], ["hay", -8.5, 16.5, 80], ["crate", 11, -9, 0], ["crate", 11.8, -10.4, 30],
    ["cartBarrel", -12, 4, 0], ["cartBarrel", -12.6, 5.1, 0], ["sack", 8, 1, 0], ["sack", 8.6, 1.5, 40], ["crateLong", -4, -17, 90],
    ["tent", 13, 24, -30], ["stump", -14, 27, 0], ["tree", -27, 32, 0], ["tree2", 27, 33, 0], ["treesMedium", -28, 6, 40],
  ]);
  scatter(["sack", "bucket", "stonePile", "rubbleHalf", "trunk"], 26, { x0: b.x0 + 3, z0: b.z0 + 3, x1: b.x1 - 3, z1: b.z1 - 3 }, 5);
  void random;
}

/* ------------------------------------------------------------------------------------------------
 * 2 THE GRAVEYARD
 * ---------------------------------------------------------------------------------------------- */
function buildGraveyard(place: Place, placeAll: PlaceAll, wallRun: WallRun, scatter: Scatter, random: () => number): void {
  const b = ZONE_BOXES.graveyard;
  // Iron fences all round, the entry and exit gates in the middle.
  wallRun(b.x0, b.z1, -GAP, b.z1, { pattern: ["fenceIron", "fenceIronBroken", "fenceIron"], pillarsEvery: 1, pillar: "fencePillar", height: 0.8 });
  wallRun(GAP, b.z1, b.x1, b.z1, { pattern: ["fenceIron", "fenceIron", "fenceIronBroken"], pillarsEvery: 1, pillar: "fencePillar", height: 0.8 });
  wallRun(b.x0, b.z0, -GAP, b.z0, { pattern: ["fenceIron", "fenceIronBroken", "fenceIron", "fenceIron"], pillarsEvery: 1, pillar: "fencePillar" });
  wallRun(GAP, b.z0, b.x1, b.z0, { pattern: ["fenceIron", "fenceIron", "fenceIronBroken", "fenceIron"], pillarsEvery: 1, pillar: "fencePillar" });
  for (const s of [-1, 1]) wallRun(s * b.x1, b.z1, s * b.x1, b.z0, { pattern: ["fenceIron", "fenceIron", "fenceIronBroken"], pillarsEvery: 1, pillar: "fencePillar", flip: s < 0 });
  place("archGate", 0, b.z1 - 0.6, 0, { noCollider: true });
  place("archGate", 0, b.z0 + 0.6, 0, { noCollider: true });
  // Rows of graves in four plots, lanes between them; old graves broken open (the dead got out).
  const graves: MedievalModel[] = ["grave", "grave2", "graveBroken", "gravestone", "grave", "graveBroken"];
  for (const [px, pz] of [[-17, -52], [17, -52], [-17, -82], [17, -82]]) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      if (random() < 0.15) continue;
      place(graves[Math.floor(random() * graves.length)], px - 6 + c * 4 + (random() - 0.5), pz - 4 + r * 4, 180 + (random() - 0.5) * 16);
    }
  }
  // Crypts at the sides of the north end, dead trees, a shrine and coffins dragged out.
  placeAll([
    ["crypt", -24, -90, 90], ["crypt", 24, -90, -90], ["shrine", 0, -67, 0], ["coffin", -6, -64, 30], ["coffinDecorated", 7, -71, -50],
    ["treeDead", -26, -45, 0], ["treeDeadDecorated", 26, -47, 60], ["treeDeadMedium", -9, -75, 20], ["treeDead", 11, -58, 130],
    ["treeDeadMedium", 27, -66, 0], ["treeDead", -27, -70, 90],
    ["lanternPost", -6, -48, 0], ["lanternPost", 6, -88, 0], ["benchStone", -27.5, -58, 90], ["benchStone", 27.5, -78, -90],
  ]);
  scatter(["gravemarker", "gravemarker2", "skull", "bones", "bonesB", "ribcage", "pumpkin", "graveDirt"], 46, { x0: b.x0 + 2, z0: b.z0 + 2, x1: b.x1 - 2, z1: b.z1 - 2 }, 0);
}

/* ------------------------------------------------------------------------------------------------
 * 3 THE ABBEY (boss: the Mad Abbot)
 * ---------------------------------------------------------------------------------------------- */
function buildAbbey(place: Place, placeAll: PlaceAll, wallRun: WallRun, random: () => number): void {
  const b = ZONE_BOXES.abbey;
  // Cloister walls with arched windows on the sides, low south wall, full north wall behind the church.
  wallRun(b.x0, b.z1, -GAP, b.z1, { pattern: ["wallHalf"], height: 0.7 });
  wallRun(GAP, b.z1, b.x1, b.z1, { pattern: ["wallHalf"], height: 0.7 });
  for (const s of [-1, 1]) wallRun(s * b.x1, b.z1, s * b.x1, b.z0, { pattern: ["wallArched", "wallArchedWindow", "wallArched", "wallWindow"], pillarsEvery: 1, flip: s < 0 });
  wallRun(b.x0, b.z0, -GAP, b.z0, { pattern: ["wall", "wallWindowClosed", "wall"], pillarsEvery: 2 });
  wallRun(GAP, b.z0, b.x1, b.z0, { pattern: ["wall", "wallWindowClosed", "wall"], pillarsEvery: 2 });
  // The church beyond the north wall (the way on runs past its door), towers either side.
  place("church", -16, b.z0 - 9, 0, { scale: 1.8, noCollider: true });
  place("tower", 16, b.z0 - 7, 0, { scale: 1.3, noCollider: true });
  // Cloister arcades: two rows of pillars down the court, banners on them.
  for (const s of [-1, 1]) for (let z = b.z1 - 10; z > b.z0 + 8; z -= 9) {
    place("pillarDecorated", s * 15, z, 0);
    if (random() < 0.6) place("bannerPattern", s * 15.6, z, s > 0 ? -90 : 90, { noCollider: true });
  }
  // The court: an altar shrine, benches, candles, a fallen bell (rubble) - cover at the edges.
  placeAll([
    ["shrine", 0, b.z0 + 6, 180, { scale: 1.3 }], ["candles", -2.5, b.z0 + 6, 0], ["candles", 2.5, b.z0 + 6, 0],
    ["torchLit", -8, b.z0 + 8, 0], ["torchLit", 8, b.z0 + 8, 0],
    ["benchStone", -21, -126, 90], ["benchStone", -21, -132, 90], ["benchStone", 21, -150, -90], ["benchStone", 21, -144, -90],
    ["rubble", -9, -128, 30], ["rubbleHalf", 10, -152, 60], ["tableBroken", 9, -127, 15], ["barrelStack", -24, -160, 0],
    ["chest", 24, -122, -90], ["keg", -25, -119, 0], ["shelves", 26.5, -160, -90],
  ]);
}

/* ------------------------------------------------------------------------------------------------
 * 4 THE BRIDGE
 * ---------------------------------------------------------------------------------------------- */
function buildBridge(place: Place, placeAll: PlaceAll, wallRun: WallRun, scatter: Scatter, random: () => number): void {
  void place;
  const b = ZONE_BOXES.bridge;
  // Stone parapets along the causeway (low: the camera sees over), gate towers at both ends.
  for (const s of [-1, 1]) wallRun(s * b.x1, b.z1, s * b.x1, b.z0, { pattern: ["fenceStone"], module: 7.5, height: 1.2, flip: s < 0 });
  wallRun(b.x0, b.z1, -GAP, b.z1, { pattern: ["wallHalf"], height: 0.7 });
  wallRun(GAP, b.z1, b.x1, b.z1, { pattern: ["wallHalf"], height: 0.7 });
  wallRun(b.x0, b.z0, -GAP, b.z0, { pattern: ["wall"] });
  wallRun(GAP, b.z0, b.x1, b.z0, { pattern: ["wall"] });
  placeAll([
    ["towerBase", -GAP - 5.5, b.z0 - 3, 0, { noCollider: true }], ["towerBase", GAP + 5.5, b.z0 - 3, 0, { noCollider: true }],
    ["towerCatapult", -24, b.z0 - 10, 30, { noCollider: true }], ["towerCatapult", 24, b.z1 + 6, -30, { noCollider: true }],
  ]);
  // On the deck: an overturned cart, barrels, barricades, banners on the parapets.
  placeAll([
    ["barrier", -6, -196, 10], ["barrier", 7, -206, -15], ["barrier", -5, -226, 20], ["barrierColumn", 10, -220, 0],
    ["wheelbarrow", 9, -194, 120, { tiltZ: 70 }], ["barrelLarge", -10, -212, 0], ["cratesStacked", 10.5, -232, 0],
    ["bannerTriple", -13.2, -200, 90, { noCollider: true }], ["bannerTriple", 13.2, -224, -90, { noCollider: true }],
    ["swordShieldBroken", 2, -214, 30], ["skull", -3, -203, 0], ["bones", 4, -230, 70],
  ]);
  // The ravine either side: rocks and dead trees below the parapets.
  scatter(["rock", "rock2", "rock3", "treeDeadMedium", "stump"], 40, { x0: -40, z0: b.z0, x1: 40, z1: b.z1 }, 17, () => ({ noCollider: true, scale: 0.8 + random() * 0.8 }));
}

/* ------------------------------------------------------------------------------------------------
 * 5 THE OUTER BAILEY
 * ---------------------------------------------------------------------------------------------- */
function buildBailey(place: Place, placeAll: PlaceAll, wallRun: WallRun, random: () => number): void {
  void place;
  const b = ZONE_BOXES.bailey;
  wallRun(b.x0, b.z1, -GAP, b.z1, { pattern: ["wallHalf", "wallHalf", "wallBroken"], height: 0.7 });
  wallRun(GAP, b.z1, b.x1, b.z1, { pattern: ["wallBroken", "wallHalf", "wallHalf"], height: 0.7 });
  // Curtain walls (13 m sections) with towers at the corners; the inner gate north.
  for (const s of [-1, 1]) wallRun(s * b.x1, b.z1, s * b.x1, b.z0, { pattern: ["curtainWall"], module: 13, flip: s < 0 });
  wallRun(b.x0, b.z0, -GAP, b.z0, { pattern: ["curtainWall"], module: 13 });
  wallRun(GAP, b.z0, b.x1, b.z0, { pattern: ["curtainWall"], module: 13 });
  placeAll([
    ["tower", -b.x1 - 2, b.z0 - 2, 0, { noCollider: true }], ["tower", b.x1 + 2, b.z0 - 2, 0, { noCollider: true }],
    ["towerB", -b.x1 - 3, b.z1 + 4, 0, { noCollider: true }], ["towerB", b.x1 + 3, b.z1 + 4, 0, { noCollider: true }],
    ["towerBase", -GAP - 4, b.z0 - 3, 0, { noCollider: true, scale: 0.8 }], ["towerBase", GAP + 4, b.z0 - 3, 0, { noCollider: true, scale: 0.8 }],
  ]);
  // Barracks and the smithy inside the walls, the training yard between them.
  placeAll([
    ["barracks", -20, -270, 90], ["blacksmith", 21, -284, -90], ["tent", -21, -298, 60], ["tent", 20, -267, -40],
    ["weaponRack", -12, -283, 90], ["weaponRack", -12, -288, 90], ["target", 8, -298, 180], ["target", 13, -300, 200],
    ["hay", 10, -301, 0], ["crate", -9, -302, 10], ["crate", -9.6, -303.3, 40], ["cratesStacked", 24, -306, 0],
    ["barrelStack", -25, -258, 0], ["cartBarrel", 6, -266, 0], ["wheelbarrow", -5, -296, 200],
    ["bannerShield", -GAP - 1.2, b.z0 + 0.6, 0, { noCollider: true }], ["bannerShield", GAP + 1.2, b.z0 + 0.6, 0, { noCollider: true }],
    ["torchLit", -7, -262, 0], ["torchLit", 7, -262, 0], ["well", 0, -284, 0, { scale: 0.8 }],
  ]);
  void random;
}

/* ------------------------------------------------------------------------------------------------
 * 6 THE GREAT HALL (roofless: the camera looks in from above)
 * ---------------------------------------------------------------------------------------------- */
function buildHall(place: Place, placeAll: PlaceAll, wallRun: WallRun): void {
  const b = ZONE_BOXES.hall;
  wallRun(b.x0, b.z1, -GAP, b.z1, { pattern: ["wallHalf"], height: 0.7 });
  wallRun(GAP, b.z1, b.x1, b.z1, { pattern: ["wallHalf"], height: 0.7 });
  for (const s of [-1, 1]) wallRun(s * b.x1, b.z1, s * b.x1, b.z0, { pattern: ["wall", "wallWindowClosed", "wall", "wallCracked"], pillarsEvery: 1, flip: s < 0 });
  wallRun(b.x0, b.z0, -GAP, b.z0, { pattern: ["wall", "wallArched"], pillarsEvery: 1 });
  wallRun(GAP, b.z0, b.x1, b.z0, { pattern: ["wallArched", "wall"], pillarsEvery: 1 });
  // Two rows of pillars, long tables between them and the walls, banners and torches on the walls.
  for (const s of [-1, 1]) {
    for (let z = b.z1 - 8; z > b.z0 + 6; z -= 8) place("pillarDungeon", s * 9, z, 0);
    for (const z of [-338, -352, -366, -378]) place("torchMounted", s * (b.x1 - 0.6), z, s > 0 ? -90 : 90);
    for (const z of [-344, -360, -374]) place(z === -360 ? "bannerTriple" : "bannerRed", s * (b.x1 - 0.7), z, s > 0 ? -90 : 90, { noCollider: true });
  }
  placeAll([
    ["tableClothed", -16, -340, 90], ["tableLong", -16, -354, 90], ["tableBroken", -16, -368, 80],
    ["tableDecorated", 16, -342, 90], ["tableLong", 16, -358, 95], ["tableClothed", 16, -372, 90],
    ["chair", -14, -338, 90], ["chair", -18, -342, -90], ["stool", 14, -356, 0], ["stool", 18, -360, 0],
    ["chestGold", -20, -381, 0], ["chest", 20, -381, 0], ["keg", -21.5, -331, 0], ["kegDecorated", 21.5, -331, 0],
    ["barrelStack", -21.5, -360, 0], ["shelves", 21.8, -350, -90], ["coins", -19, -380, 0], ["candles", 0, -379, 0],
    ["rubble", 4, -350, 40], ["swordShield", -3, -364, 0],
  ]);
}

/* ------------------------------------------------------------------------------------------------
 * 7 THE THRONE YARD (boss: the Fallen King)
 * ---------------------------------------------------------------------------------------------- */
function buildThrone(place: Place, placeAll: PlaceAll, wallRun: WallRun, random: () => number): void {
  void place;
  const b = ZONE_BOXES.throne;
  wallRun(b.x0, b.z1, -GAP, b.z1, { pattern: ["wallHalf"], height: 0.7 });
  wallRun(GAP, b.z1, b.x1, b.z1, { pattern: ["wallHalf"], height: 0.7 });
  for (const s of [-1, 1]) wallRun(s * b.x1, b.z1, s * b.x1, b.z0, { pattern: ["curtainWall"], module: 13, flip: s < 0 });
  wallRun(b.x0, b.z0, b.x1, b.z0, { pattern: ["curtainWall", "curtainGate", "curtainWall"], module: 13 });
  // The keep towers over the north wall; towers at the corners.
  placeAll([
    ["castle", 0, b.z0 - 14, 0, { scale: 2.4, noCollider: true }],
    ["tower", -b.x1 - 2, b.z0 - 2, 0, { noCollider: true, scale: 1.2 }], ["tower", b.x1 + 2, b.z0 - 2, 0, { noCollider: true, scale: 1.2 }],
    ["towerCatapult", -b.x1 - 4, -428, 90, { noCollider: true }], ["towerCatapult", b.x1 + 4, -428, -90, { noCollider: true }],
  ]);
  // The arena: braziers on columns, the throne (a gilded chair on stairs) at the north end, banners.
  placeAll([
    ["stairsWide", 0, b.z0 + 2.5, 180, { noCollider: true, scale: [1.2, 0.35, 0.8] }],
    ["chair", 0, b.z0 + 3.2, 0, { scale: 2.2, y: 1.6 }],
    ["bannerTriple", -5, b.z0 + 0.8, 0, { noCollider: true, scale: 1.5 }], ["bannerTriple", 5, b.z0 + 0.8, 0, { noCollider: true, scale: 1.5 }],
    ["columnShort", -14, -418, 0, { scale: 1.2 }], ["columnShort", 14, -418, 0, { scale: 1.2 }],
    ["columnShort", -14, -444, 0, { scale: 1.2 }], ["columnShort", 14, -444, 0, { scale: 1.2 }],
    ["torchLit", -14, -418, 0, { y: 1.7, noCollider: true }], ["torchLit", 14, -418, 0, { y: 1.7, noCollider: true }],
    ["torchLit", -14, -444, 0, { y: 1.7, noCollider: true }], ["torchLit", 14, -444, 0, { y: 1.7, noCollider: true }],
    ["swordShieldBroken", -8, -430, 20], ["swordShield", 9, -437, -30], ["skull", 3, -424, 0], ["bones", -6, -446, 50],
    ["rubble", -22, -410, 0], ["rubble", 23, -452, 60], ["barrelStack", -25, -452, 0], ["cratesStacked", 25, -408, 0],
  ]);
  void random;
}

/* ------------------------------------------------------------------------------------------------
 * The backdrop: mountains and forest beyond the sides, never south of a zone.
 * ---------------------------------------------------------------------------------------------- */
function buildBackdrop(place: Place, random: () => number): void {
  for (let z = 30; z > -470; z -= 26) {
    for (const s of [-1, 1]) {
      const inner = Math.abs(z + 212) < 30 ? 22 : 36;   // closer in by the narrow bridge
      place(random() < 0.5 ? "mountain" : "mountain2", s * (inner + 14 + random() * 10), z + random() * 10, random() * 360, { noCollider: true });
      place(random() < 0.5 ? "treesLarge" : "pine", s * (inner + 2 + random() * 6), z + 8 + random() * 10, random() * 360, { noCollider: true, scale: 1 + random() * 0.6 });
    }
  }
  place("hills", -20, -490, 0, { noCollider: true, scale: 2 });
  place("hills", 22, -492, 90, { noCollider: true, scale: 2 });
}

/* ------------------------------------------------------------------------------------------------
 * Barricades (the way on): a barrier pair across each lane end; when the level is won the one
 * ahead sinks into the ground as the hero comes near.
 * ---------------------------------------------------------------------------------------------- */
interface Seal { entity: Entity; x: number; z: number; open: number }
const SEAL_OPEN_SECONDS = 0.8;
const world = { seals: [] as Seal[], exitSeals: [] as Seal[] };

function buildSeals(kit: ModelKit<MedievalModel>, root: Entity): void {
  world.seals = [];
  world.exitSeals = [];
  const lines: number[] = [];
  ORDER.forEach((id, i) => { if (i > 0) lines.push(ZONE_BOXES[id].z1); if (i < ORDER.length - 1) lines.push(ZONE_BOXES[id].z0); });
  for (const z of lines) {
    const e = new Entity("barricade");
    e.setLocalPosition(0, 0, z);
    root.addChild(e);
    for (const x of [-2, 2]) kit.spawn("barrier", x, 0, x < 0 ? 3 : -3, e, { noCollider: true });
    e.enabled = false;
    world.seals.push({ entity: e, x: 0, z, open: -1 });
  }
}

/** Whether (x, z) lies on (within 1.5 m of) the edge of `region`. */
function onEdge(r: LevelBounds, x: number, z: number): boolean {
  const inX = x >= r.minX - 1.5 && x <= r.maxX + 1.5, inZ = z >= r.minZ - 1.5 && z <= r.maxZ + 1.5;
  const nearZ = Math.abs(z - r.minZ) < 1.5 || Math.abs(z - r.maxZ) < 1.5;
  const nearX = Math.abs(x - r.minX) < 1.5 || Math.abs(x - r.maxX) < 1.5;
  return (inX && nearZ) || (inZ && nearX);
}

/** Chapter 4: the Dark Kingdom. */
export const MEDIEVAL_BIOME: Biome<MedievalModel> = {
  id: "medieval",
  label: "Dark Kingdom",
  kit: { url: MEDIEVAL.url, models: MEDIEVAL_MODELS, brightness: MEDIEVAL.brightness, batchCellMetres: MEDIEVAL.batchCellMetres },
  lighting: MEDIEVAL_LIGHTING,
  ground: GROUND_SPEC,
  bounds: BOUNDS,
  spawn: SPAWN,
  runStart: { x: 0, z: 22, yawDeg: 180 },
  ambient: AMBIENT,
  build: buildMedievalLevel,
  campaign: {
    levels: MEDIEVAL_LEVELS,
    zones: ZONES,
    run: MEDIEVAL_RUN,
    difficulties: MEDIEVAL_DIFFICULTIES,
    defaultDifficulty: "hard",
    victory: { title: "THE KING HAS FALLEN", text: "The Fallen King is dust. The bells of the abbey ring again - and the dead lie still." },
    onLevel(_index, zoneId) {
      const r = ZONES[zoneId]?.region;
      for (const s of world.seals) {
        s.open = -1;
        s.entity.setLocalPosition(s.x, 0, s.z);
        s.entity.enabled = !!r && onEdge(r, s.x, s.z);
      }
      world.exitSeals = [];
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
        s.entity.setLocalPosition(s.x, -1.3 * s.open * s.open, s.z);
        if (s.open >= 1) s.entity.enabled = false;
      }
    },
  },
};
