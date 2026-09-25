import { BLEND_ADDITIVE, Color, Entity, StandardMaterial, Texture, ADDRESS_REPEAT, FILTER_LINEAR, FILTER_LINEAR_MIPMAP_LINEAR, type AppBase } from "playcanvas";
import { FACILITY, FACILITY_LIGHTING } from "../../config";
import { SPACE_DIFFICULTIES, SPACE_LEVELS, SPACE_RUN } from "../../gameplay/spaceConfig";
import type { AmbientEmitter } from "../AmbientFx";
import { declareCollider } from "../collision/CollisionWorld";
import type { GroundSpec } from "../Ground";
import type { GroundSurface } from "../../config";
import type { ModelKit, SpawnOptions } from "../props/ModelKit";
import { FACILITY_MODELS, type FacilityModel } from "../props/FacilityKit";
import type { Biome, LevelBounds, WayPoint, Zone } from "./Biome";

/**
 * THE ORION - chapter 2: escape the infested ship. Six zones, crossed south to north over six
 * levels (two acts: medium / hard / boss), joined by windowed corridors sealed by energy barriers
 * until the level is won; beyond the hull, the void and a planet far below.
 *
 *   z   72  CARGO BAY          containers, parked cargo craft, loading lanes          (Act I)
 *   z  -22   ~~ corridor ~~
 *   z  -22  BIO-LAB            hydroponic bays, cryo tubes, specimens got loose
 *   z -126   ~~ corridor ~~
 *   z -126  REACTOR CORE       the glowing core on its hazard ring (boss 1: the Warden)
 *   z -236   ~~ corridor ~~
 *   z -236  COMMAND DECK       consoles and screens, crew bunks, a window wall      (Act II)
 *   z -338   ~~ corridor ~~
 *   z -338  HANGAR             spacecraft, rockets, turrets; the airlock north
 *   z -458   ~~ docking tube ~~
 *   z -458  THE METEOR         the rock the hive came from (boss 2: the Brood Mother)
 *   z -562
 *
 * Camera looks towards -Z (screen up is north). Ship walls are 2.4 m (cutaway) so nothing hides the
 * hero; combat floors stay ~70% open, the detail runs along the walls and in small scenes.
 */

type Rect = { x0: number; z0: number; x1: number; z1: number };
const ROOMS: Record<string, Rect> = {
  cargo: { x0: -38.4, z0: 0, x1: 38.4, z1: 72 },
  biolab: { x0: -43.2, z0: -104, x1: 43.2, z1: -22 },
  reactor: { x0: -44, z0: -214, x1: 44, z1: -126 },
  command: { x0: -44, z0: -316, x1: 44, z1: -236 },
  hangar: { x0: -50, z0: -428, x1: 50, z1: -338 },
};
/** The meteor: open rock, no walls (a rim of boulders and the void). */
const METEOR: Rect = { x0: -52, z0: -562, x1: 52, z1: -458 };

/** Corridors (north-south, centred on x = 0) between the zones; the last is the glass docking tube. */
const HALL = 3.6;
const CORRIDORS: { z0: number; z1: number; tube?: boolean }[] = [
  { z0: -22, z1: 0 },
  { z0: -126, z1: -104 },
  { z0: -236, z1: -214 },
  { z0: -338, z1: -316 },
  { z0: -458, z1: -428, tube: true },
];

const r = (x0: number, z0: number, x1: number, z1: number): LevelBounds => ({ minX: x0, minZ: z0, maxX: x1, maxZ: z1 });
/** A zone region 1.2 m inside its room (the walls), leading north (-z) at its north wall. */
const zone = (q: Rect, start: [number, number], exit = true): Zone => ({
  region: r(q.x0 + 1.2, q.z0 + 1.2, q.x1 - 1.2, q.z1 - 1.2),
  start: { x: start[0], z: start[1], yawDeg: 180 },
  ...(exit ? { exit: { axis: "z" as const, at: q.z0, dir: -1 as const } } : {}),
});
export const ZONES: Record<string, Zone> = {
  cargo: zone(ROOMS.cargo, [0, 62]),
  biolab: zone(ROOMS.biolab, [0, -34]),
  reactor: zone(ROOMS.reactor, [0, -138]),
  command: zone(ROOMS.command, [0, -248]),
  hangar: zone(ROOMS.hangar, [0, -350]),
  meteor: { region: r(METEOR.x0 + 1.5, METEOR.z0 + 1.5, METEOR.x1 - 1.5, METEOR.z1 - 0.6), start: { x: 0, z: -470, yawDeg: 180 } },
};

export const BOUNDS: LevelBounds = r(-52, -562, 52, 72);
export const SPAWN = ZONES.cargo.start;

/* ------------------------------------------------------------------------------------------------
 * Light: every zone has its own colour.
 * ---------------------------------------------------------------------------------------------- */

const CYAN: [number, number, number] = [0.25, 0.75, 1];
const AMBER: [number, number, number] = [1, 0.6, 0.18];
const RED: [number, number, number] = [1, 0.12, 0.08];
const GREEN: [number, number, number] = [0.35, 1, 0.45];
const WHITE: [number, number, number] = [0.6, 0.72, 0.9];
const VIOLET: [number, number, number] = [0.65, 0.35, 1];
const STEAM: [number, number, number] = [1.05, 1.15, 1.3];

/** The reactor core (the Warden's arena). */
const CORE = { x: 0, z: -170, radius: 7 };

/** Deterministic RNG so the layout is the same on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Small scenes per zone (like Hell's), kept off the central lane, corridor mouths and starts. */
type SceneKind = "cargo" | "crates" | "lab" | "cryo" | "power" | "console" | "crew" | "hangar" | "fuel" | "rocks" | "crystals" | "wreck";
const ROOM_KINDS: Record<string, SceneKind[]> = {
  cargo: ["cargo", "crates", "cargo", "power"],
  biolab: ["lab", "cryo", "lab", "crates"],
  reactor: ["power", "power", "crates"],
  command: ["console", "crew", "console"],
  hangar: ["hangar", "fuel", "crates", "hangar"],
  meteor: ["rocks", "crystals", "rocks", "wreck", "crystals"],
};
const SCENES: { x: number; z: number; kind: SceneKind; seed: number }[] = (() => {
  const random = rng(4242);
  const out: { x: number; z: number; kind: SceneKind; seed: number }[] = [];
  const starts = Object.values(ZONES).map((z) => z.start);
  for (const [name, q] of [...Object.entries(ROOMS), ["meteor", METEOR] as [string, Rect]]) {
    const kinds = ROOM_KINDS[name];
    const wanted = Math.round(((q.x1 - q.x0) * (q.z1 - q.z0)) / 260);
    for (let tries = 0, n = 0; n < wanted && tries < wanted * 12; tries++) {
      const x = q.x0 + 6 + random() * (q.x1 - q.x0 - 12), z = q.z0 + 6 + random() * (q.z1 - q.z0 - 12);
      if (Math.abs(x) < 7) continue;
      if (name === "reactor" && Math.hypot(x - CORE.x, z - CORE.z) < CORE.radius + 12) continue;
      if (starts.some((p) => Math.hypot(x - p.x, z - p.z) < 9)) continue;
      if (out.some((c) => Math.hypot(c.x - x, c.z - z) < 10)) continue;
      out.push({ x, z, kind: kinds[Math.floor(random() * kinds.length)], seed: Math.floor(random() * 1e6) });
      n++;
    }
  }
  return out;
})();

/** Props per scene kind: [model, dx, dz, scale range]. */
type Prop = [FacilityModel, number, number, number, number];
const SCENE_PROPS: Record<SceneKind, Prop[]> = {
  cargo: [["kContainerTall", 0, 0, 1, 1], ["kContainerWide", 2.2, 0.4, 1, 1], ["kContainer", -2, 0.6, 1, 1], ["kContainerFlat", 0.8, 2.2, 1, 1], ["kContainerOpen", -1.4, -2, 1, 1]],
  crates: [["kContainer", 0, 0, 1, 1.1], ["kContainer", 1.5, 0.2, 1, 1.1], ["kContainerFlat", -1.6, 1, 1, 1], ["sBarrels", 1.2, -2, 0.8, 0.9]],
  lab: [["hydroBay", 0, 0, 1, 1], ["bioGreen", 3, 1, 1, 1], ["plant", -2.6, 1.4, 1, 1.2], ["hydroLamp", 0, 2.6, 1, 1], ["kComputer", -2.8, -1.6, 1, 1]],
  cryo: [["cryoOn", 0, 0, 1, 1], ["cryoOff", 2.4, 0, 1, 1], ["cryoOn", -2.4, 0, 1, 1], ["bioRed", 0, 2.4, 1, 1], ["casket", 3.2, 2.6, 1, 1]],
  power: [["generator", 0, 0, 1, 1], ["batteryBlue", 2.8, 0.6, 1, 1], ["batteryOrange", -2.8, 0.4, 1, 1], ["genPileSmall", 1.4, -2.6, 1, 1]],
  console: [["commandConsole", 0, 0, 1, 1], ["monitorBlue", 2.8, 1.2, 1, 1], ["kComputerWide", -2.6, 0.8, 1, 1], ["chair", 0.6, 1.8, 1, 1], ["kTableDisplay", -1.2, -2.4, 1, 1]],
  crew: [["bunk", 0, 0, 1, 1], ["bunkRed", 2.6, 0, 1, 1], ["kTable", -2.6, 1.2, 1, 1], ["kChair", -3.6, 2.8, 1, 1], ["endTable", 1.4, 2.4, 1, 1]],
  hangar: [["sCraftSpeeder", 0, 0, 0.9, 1], ["sBarrels", 4, 2, 1, 1], ["kContainerWide", -4, 1.5, 1, 1], ["sGenerator", 3, -3, 1, 1]],
  fuel: [["sBarrels", 0, 0, 1, 1], ["sBarrels", 2.6, 0.5, 1, 1], ["sWireless", -2.4, 0.8, 1, 1], ["kPipeRing", 0.8, 2.6, 1, 1]],
  rocks: [["sMeteor", 0, 0, 0.8, 1.2], ["sRockLargeA", 3.4, 1.2, 0.7, 1], ["sRock", -3, 1.6, 0.8, 1.1], ["sRocksSmall", 1.4, -2.8, 0.9, 1.2], ["sCrater", -2, -3, 1, 1.3]],
  crystals: [["sCrystalsLargeA", 0, 0, 0.9, 1.3], ["sCrystals", 2.6, 1, 0.9, 1.2], ["sCrystalsLargeB", -2.4, 1.6, 0.8, 1.1], ["sRocksSmall", 1, -2.6, 1, 1.2]],
  wreck: [["sCraftMiner", 0, 0, 0.9, 1], ["sRocksSmall", 4, 2, 1, 1.2], ["sAstronaut", -3.4, 2.2, 1, 1], ["sBones", 2.6, -3, 1, 1]],
};

/** Light pools: machines and screens glow, the core burns, the meteor's crystals shine violet. */
export const AMBIENT: AmbientEmitter[] = [
  // Zone washes: each zone its own colour.
  { kind: "glow", x: 0, z: 36, size: [70, 60], color: AMBER, intensity: 0.12 },
  { kind: "glow", x: 0, z: -63, size: [80, 72], color: GREEN, intensity: 0.14 },
  { kind: "glow", x: 0, z: -170, size: [80, 80], color: CYAN, intensity: 0.12 },
  { kind: "glow", x: 0, z: -276, size: [80, 70], color: WHITE, intensity: 0.12 },
  { kind: "glow", x: 0, z: -383, size: [90, 80], color: AMBER, intensity: 0.1 },
  { kind: "glow", x: 0, z: -510, size: [96, 96], color: VIOLET, intensity: 0.12 },
  // The reactor core burns cyan; alarms pulse red round it.
  { kind: "glow", x: CORE.x, z: CORE.z, size: [26, 26], color: CYAN, intensity: 0.7, pulse: 0.25 },
  { kind: "sparks", x: CORE.x, y: 2.5, z: CORE.z, every: 2 },
  ...[[-40, -130], [40, -130], [-40, -210], [40, -210]].map(([x, z]): AmbientEmitter => ({ kind: "glow", x, z, size: [9, 9], color: RED, intensity: 0.55, pulse: 0.8 })),
  // Scenes carry their light.
  ...SCENES.flatMap((s): AmbientEmitter[] => {
    const color = s.kind === "lab" || s.kind === "cryo" ? GREEN : s.kind === "crystals" ? VIOLET : s.kind === "console" ? CYAN : s.kind === "power" || s.kind === "fuel" ? AMBER : null;
    return color ? [{ kind: "glow", x: s.x, z: s.z, size: [9, 9], color, intensity: 0.4 }] : [];
  }),
  // Steam from the bio-lab vents and the hangar; dust drifting over the meteor.
  { kind: "smoke", x: -30, y: 0.3, z: -40, size: [3, 3], intensity: 0.4, color: STEAM },
  { kind: "smoke", x: 30, y: 0.3, z: -90, size: [3, 3], intensity: 0.4, color: STEAM },
  { kind: "smoke", x: -40, y: 0.3, z: -360, size: [3, 3], intensity: 0.4, color: STEAM },
  { kind: "dust", x: 0, y: 1.2, z: -510, size: [60, 60], intensity: 0.7, color: [0.75, 0.65, 0.95] },
  // The corridors' strip lights.
  ...CORRIDORS.map((c): AmbientEmitter => ({ kind: "glow", x: 0, z: (c.z0 + c.z1) / 2, size: [8, c.z1 - c.z0], color: c.tube ? VIOLET : CYAN, intensity: 0.3 })),
];

const ROOM_SURFACE: Record<string, GroundSurface> = { cargo: "hangardeck", biolab: "grime", reactor: "deck", command: "deck", hangar: "hangardeck" };
export const GROUND_SPEC: GroundSpec = {
  base: "deck",
  areas: [
    ...Object.entries(ROOMS).map(([name, q]) => ({ ...q, surface: ROOM_SURFACE[name] })),
    ...CORRIDORS.map((c) => ({ x0: -HALL, z0: c.z0, x1: HALL, z1: c.z1, surface: "deck" as const })),
    { ...METEOR, surface: "asteroid" as const },
  ],
  pads: [
    // Loading lanes and the landing pad markings.
    { x0: -3, z0: 2, x1: 3, z1: 70, surface: "deck" },
    { x0: -22, z0: -420, x1: 22, z1: -346, surface: "concrete" },
  ],
  patches: [
    { x: -20, z: -60, w: 18, d: 14, surface: "grime", seed: 1 },
    { x: 22, z: -80, w: 16, d: 12, surface: "ash", seed: 2 },
    { x: CORE.x, z: CORE.z, w: 30, d: 30, surface: "cinder", seed: 3 },
    { x: -18, z: -500, w: 26, d: 20, surface: "cinder", seed: 0 },
    { x: 20, z: -530, w: 24, d: 20, surface: "boneash", seed: 1 },
  ],
};

/* ------------------------------------------------------------------------------------------------
 * Energy seals (the way on), the void.
 * ---------------------------------------------------------------------------------------------- */

interface Seal { entity: Entity; x: number; z: number; width: number; yawDeg: number; open: number }
const SEAL_HEIGHT = 3;
const SEAL_OPEN_SECONDS = 0.7;
const world = { seals: [] as Seal[], exitSeals: [] as Seal[], arena: 0, shown: 0, time: 0, barrier: null as StandardMaterial | null };

function canvasTexture(app: AppBase, size: number, paint: (g: CanvasRenderingContext2D) => void, repeat = false): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  paint(canvas.getContext("2d")!);
  const t = new Texture(app.graphicsDevice, { width: size, height: size, mipmaps: true, minFilter: FILTER_LINEAR_MIPMAP_LINEAR, magFilter: FILTER_LINEAR });
  if (repeat) t.addressU = t.addressV = ADDRESS_REPEAT;
  t.setSource(canvas);
  return t;
}

/** A shimmering energy barrier: bright edges and horizontal scan bands. */
function barrierMaterial(app: AppBase): StandardMaterial {
  const m = new StandardMaterial();
  m.diffuse.set(0, 0, 0);
  m.emissive = new Color(0.25, 0.8, 1.2);
  m.emissiveMap = canvasTexture(app, 128, (g) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 8) { g.fillStyle = `rgba(255,255,255,${0.2 + (y % 16 ? 0.1 : 0.3)})`; g.fillRect(0, y, 128, 3); }
    const edge = g.createLinearGradient(0, 0, 128, 0);
    edge.addColorStop(0, "rgba(255,255,255,0.9)"); edge.addColorStop(0.08, "rgba(255,255,255,0)"); edge.addColorStop(0.92, "rgba(255,255,255,0)"); edge.addColorStop(1, "rgba(255,255,255,0.9)");
    g.fillStyle = edge; g.fillRect(0, 0, 128, 128);
  });
  m.useLighting = false;
  m.blendType = BLEND_ADDITIVE;
  m.depthWrite = false;
  m.cull = 0;
  m.update();
  return m;
}

/** The void outside: a starfield far below, a nebula haze and a planet. */
function buildVoid(root: Entity, app: AppBase): void {
  const random = rng(77);
  const stars = canvasTexture(app, 512, (g) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 520; i++) {
      const b = random(), s = b > 0.97 ? 2.2 : b > 0.85 ? 1.4 : 0.8;
      g.fillStyle = `rgba(${200 + random() * 55},${210 + random() * 45},255,${0.35 + b * 0.65})`;
      g.beginPath(); g.arc(random() * 512, random() * 512, s, 0, Math.PI * 2); g.fill();
    }
  }, true);
  const starMat = new StandardMaterial();
  starMat.diffuse.set(0, 0, 0);
  starMat.emissive = new Color(0.9, 0.95, 1.1);
  starMat.emissiveMap = stars;
  starMat.emissiveMapTiling.set(10, 10);
  starMat.useLighting = false;
  starMat.useFog = false;
  starMat.update();
  const plane = new Entity("starfield");
  plane.addComponent("render", { type: "plane", material: starMat, castShadows: false, receiveShadows: false });
  plane.setLocalScale(900, 1, 1100);
  plane.setLocalPosition(0, -60, -250);
  root.addChild(plane);
  // Nebula haze and the planet's glow below the ship.
  const haze = (x: number, z: number, size: number, color: [number, number, number], k: number) => {
    const m = new StandardMaterial();
    m.diffuse.set(0, 0, 0);
    m.emissive = new Color(color[0] * k, color[1] * k, color[2] * k);
    m.emissiveMap = canvasTexture(app, 128, (g) => {
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "#fff"); grad.addColorStop(0.5, "rgba(255,255,255,0.35)"); grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    });
    m.useLighting = false; m.useFog = false; m.blendType = BLEND_ADDITIVE; m.depthWrite = false;
    m.update();
    const e = new Entity("nebula");
    e.addComponent("render", { type: "plane", material: m, castShadows: false, receiveShadows: false });
    e.setLocalScale(size, 1, size);
    e.setLocalPosition(x, -58, z);
    root.addChild(e);
  };
  haze(-160, -40, 320, [0.25, 0.12, 0.45], 0.9);
  haze(180, -320, 360, [0.08, 0.25, 0.45], 0.8);
  haze(-120, -520, 300, [0.4, 0.12, 0.3], 0.8);
  const planetMat = new StandardMaterial();
  planetMat.diffuse.set(0.05, 0.08, 0.12);
  planetMat.emissive = new Color(0.12, 0.3, 0.45);
  planetMat.useFog = false;
  planetMat.update();
  const planet = new Entity("planet");
  planet.addComponent("render", { type: "sphere", material: planetMat, castShadows: false, receiveShadows: false });
  planet.setLocalScale(260, 260, 260);
  planet.setLocalPosition(230, -190, -140);
  root.addChild(planet);
}

export function buildShipLevel(kit: ModelKit<FacilityModel>): Entity {
  const root = new Entity("ShipLevel");
  const random = rng(911);
  const app = kit.app;
  world.seals = [];
  world.exitSeals = [];
  const place = (id: FacilityModel, x: number, z: number, yaw = 0, options: SpawnOptions = {}) => kit.spawn(id, x, z, yaw, root, options);
  const lowBox = (x: number, z: number, width: number, depth: number) => {
    const e = new Entity("rim");
    e.setLocalPosition(x, 0, z);
    root.addChild(e);
    declareCollider(e, { kind: "box", width, depth, low: true });
  };
  buildVoid(root, app);

  // ------------------------------------------------------------------ hull walls (2.4 m, cutaway)
  const wallLine = (ax: number, az: number, bx: number, bz: number, pattern: FacilityModel[]) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) return;
    const n = Math.max(1, Math.round(len / 2.4)), w = len / n;
    const dx = (bx - ax) / len, dz = (bz - az) / len, yaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
    for (let i = 0; i < n; i++) place(pattern[i % pattern.length], ax + dx * w * (i + 0.5), az + dz * w * (i + 0.5), yaw, { scale: [w / 2.4, 1, 1] });
  };
  const WALL: FacilityModel[] = ["kWall", "kWall", "kWallDetail", "kWall", "kWallBanner", "kWall", "kWallSwitch"];
  const WINDOWS: FacilityModel[] = ["kWallWindow", "kWallWindow", "kWallPillar"];
  for (const [name, q] of Object.entries(ROOMS)) {
    // South and north walls open at the corridors (x = +-HALL); the north wall of the command deck is
    // a window wall onto the void.
    const southOpen = CORRIDORS.some((c) => Math.abs(c.z0 - q.z1) < 0.1) || name === "cargo";
    const northOpen = CORRIDORS.some((c) => Math.abs(c.z1 - q.z0) < 0.1);
    for (const [z, open, pattern] of [[q.z1, southOpen, WALL], [q.z0, northOpen, name === "command" ? WINDOWS : WALL]] as [number, boolean, FacilityModel[]][]) {
      if (open) {
        wallLine(q.x0, z, -HALL, z, pattern);
        wallLine(HALL, z, q.x1, z, pattern);
        place("kWallPillar", -HALL - 0.6, z, 0);
        place("kWallPillar", HALL + 0.6, z, 0);
      } else wallLine(q.x0, z, q.x1, z, pattern);
    }
    wallLine(q.x0, q.z1, q.x0, q.z0, name === "biolab" || name === "hangar" ? WINDOWS : WALL);
    wallLine(q.x1, q.z1, q.x1, q.z0, name === "biolab" || name === "hangar" ? WINDOWS : WALL);
  }
  // The cargo bay's south wall is the ship's aft bulkhead: closed.
  wallLine(-HALL, ROOMS.cargo.z1, HALL, ROOMS.cargo.z1, WALL);

  // Corridors: window walls both sides; the docking tube is glass all the way.
  for (const c of CORRIDORS) {
    wallLine(-HALL, c.z1, -HALL, c.z0, c.tube ? ["kWallWindow"] : ["kWallWindow", "kWall"]);
    wallLine(HALL, c.z1, HALL, c.z0, c.tube ? ["kWallWindow"] : ["kWallWindow", "kWall"]);
  }

  // ------------------------------------------------------------------ energy seals (the way on)
  const mat = world.barrier ?? (world.barrier = barrierMaterial(app));
  const addSeal = (x: number, z: number, width: number) => {
    const e = new Entity("seal");
    e.addComponent("render", { type: "plane", material: mat, castShadows: false, receiveShadows: false });
    e.setLocalScale(width, 1, SEAL_HEIGHT);
    e.setLocalPosition(x, SEAL_HEIGHT / 2, z);
    e.setLocalEulerAngles(90, 0, 0);
    e.enabled = false;
    root.addChild(e);
    world.seals.push({ entity: e, x, z, width, yawDeg: 0, open: -1 });
  };
  for (const c of CORRIDORS) {
    addSeal(0, c.z0, HALL * 2 + 0.4);
    addSeal(0, c.z1, HALL * 2 + 0.4);
  }

  // ------------------------------------------------------------------ the meteor's rim
  // Low colliders round the rock (open where the docking tube arrives), boulders and cliffs over the void.
  const m = METEOR;
  lowBox(m.x0 - 0.5, (m.z0 + m.z1) / 2, 1, m.z1 - m.z0);
  lowBox(m.x1 + 0.5, (m.z0 + m.z1) / 2, 1, m.z1 - m.z0);
  lowBox((m.x0 + m.x1) / 2, m.z0 - 0.5, m.x1 - m.x0, 1);
  lowBox((m.x0 - HALL) / 2, m.z1 + 0.5, -HALL - m.x0, 1);
  lowBox((m.x1 + HALL) / 2, m.z1 + 0.5, m.x1 - HALL, 1);
  const edges: [number, number, number, number][] = [[m.x0, m.z0, m.x1, m.z0], [m.x0, m.z1, m.x1, m.z1], [m.x0, m.z0, m.x0, m.z1], [m.x1, m.z0, m.x1, m.z1]];
  for (const [x0, z0, x1, z1] of edges) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let d = 0; d <= len; d += 3 + random() * 3) {
      const t = d / len;
      const x = x0 + (x1 - x0) * t + (random() - 0.5) * 2, z = z0 + (z1 - z0) * t + (random() - 0.5) * 2;
      if (Math.abs(x) < HALL + 3 && Math.abs(z - m.z1) < 4) continue;
      const roll = random();
      place(roll < 0.4 ? "sMeteor" : roll < 0.7 ? "sRockLargeB" : "sMeteorHalf", x, z, random() * 360, { scale: 0.9 + random() * 1.1, y: -0.6, noCollider: true });
      if (random() < 0.3) place("sCliff", x, z, random() * 360, { scale: [2, 2.5, 2], y: -9, noCollider: true });
    }
  }
  // Meteors drifting in the void round the rock.
  for (let i = 0; i < 26; i++) {
    const a = random() * Math.PI * 2, d = 62 + random() * 40;
    place(random() < 0.5 ? "sMeteor" : "sRockLargeA", Math.sin(a) * d, -510 + Math.cos(a) * d, random() * 360, { y: -8 - random() * 20, scale: 1 + random() * 3, noCollider: true });
  }

  // ------------------------------------------------------------------ CARGO BAY
  for (const side of [-1, 1]) {
    // Cargo craft parked either side of the loading lane, container stacks along the walls.
    place("sCraftCargo", side * 22, 50, side > 0 ? 180 : 0);
    place("sCraftCargoB", side * 24, 18, side > 0 ? 180 : 0);
    for (let z = 8; z < 68; z += 7) place(z % 14 < 7 ? "kContainerTall" : "kContainerWide", side * 35.4, z, 90);
  }
  for (let z = 6; z < 70; z += 8) place("hazard1", 0, z, 0);

  // ------------------------------------------------------------------ BIO-LAB
  for (const side of [-1, 1]) {
    for (let z = -34; z > -96; z -= 10) {
      place("hydroFull", side * 14, z, 90);
      place("hydroLamp", side * 14, z, 90, { y: 0 });
    }
    for (let z = -30; z > -100; z -= 9) place("cryoOn", side * 40, z, side > 0 ? 270 : 90);
  }
  place("cryoOff", -38.5, -62, 90, { tiltZ: 40 });

  // ------------------------------------------------------------------ REACTOR CORE
  // The core: a crystal heart on a glowing ring, generators round it, hazard floor.
  place("sCrystalsLargeA", CORE.x, CORE.z, 0, { scale: 3.2 });
  place("sPipeRing", CORE.x, CORE.z, 0, { scale: 2.2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    place(i % 2 ? "generator" : "genPile", CORE.x + Math.sin(a) * (CORE.radius + 3), CORE.z + Math.cos(a) * (CORE.radius + 3), (a * 180) / Math.PI);
    place("hazard2", CORE.x + Math.sin(a + 0.4) * (CORE.radius + 7), CORE.z + Math.cos(a + 0.4) * (CORE.radius + 7), (a * 180) / Math.PI);
  }
  for (const [x, z] of [[-36, -140], [36, -140], [-36, -200], [36, -200]]) place("genPileSmall", x, z, 0);

  // ------------------------------------------------------------------ COMMAND DECK
  // The bridge: consoles facing the window wall, the captain's holo table; crew bunks east.
  for (let x = -24; x <= 24; x += 8) place("commandConsole", x, -304, 180);
  place("kTableDisplay", 0, -290, 0, { scale: 2 });
  place("orrery", 0, -270, 0);
  for (let z = -250; z > -300; z -= 8) { place("bunk", 38, z, 90); place("bunkRed", -38, z, 270); }

  // ------------------------------------------------------------------ HANGAR
  // Launch pads with spacecraft, a rocket on its stand, turrets by the airlock, the airlock gate.
  place("sCraftMiner", -20, -370, 30);
  place("sCraftRacer", 22, -365, -40);
  place("sCraftSpeeder", -26, -405, 160);
  place("sRocket", 34, -400, 0, { scale: 1.2 });
  place("sRocket", -38, -352, 0);
  place("sHangar", 40, -350, 270);
  for (const side of [-1, 1]) place("sTurret", side * 10, -420, 180);
  place("sGate", 0, -427, 0, { scale: [1.6, 1.2, 1] });

  // ------------------------------------------------------------------ THE METEOR
  // A crashed shuttle, the hive's crystal spires, a dead rover and dish from a survey team.
  place("sCraftCargo", -30, -480, 70, { tiltZ: 18, y: -0.8 });
  place("sDish", 34, -490, 200);
  place("sRover", 30, -500, 120);
  for (const [x, z, k] of [[-8, -535, 1.6], [12, -540, 1.4], [0, -548, 2]]) place("sCrystalsLargeB", x, z, random() * 360, { scale: k });
  for (let i = 0; i < 10; i++) place(random() < 0.5 ? "sCraterLarge" : "sCrater", -40 + random() * 80, -470 - random() * 85, random() * 360, { scale: 1.5 + random() * 1.5 });

  // ------------------------------------------------------------------ small scenes
  for (const s of SCENES) {
    const rand = rng(s.seed);
    const turn = rand() * Math.PI * 2, cos = Math.cos(turn), sin = Math.sin(turn);
    const yaw = (-turn * 180) / Math.PI;
    for (const [id, dx, dz, k0, k1] of SCENE_PROPS[s.kind]) {
      if (dx !== 0 && rand() < 0.2) continue;
      place(id, s.x + dx * cos - dz * sin, s.z + dx * sin + dz * cos, yaw + (rand() - 0.5) * 20, { scale: k0 + rand() * (k1 - k0) });
    }
  }
  return root;
}

/** Whether (x, z) lies on (within 1.2 m of) the edge of `region`. */
function onEdge(region: LevelBounds, x: number, z: number): boolean {
  const inX = x >= region.minX - 1.4 && x <= region.maxX + 1.4, inZ = z >= region.minZ - 1.4 && z <= region.maxZ + 1.4;
  const nearZ = Math.abs(z - region.minZ) < 1.4 || Math.abs(z - region.maxZ) < 1.4;
  const nearX = Math.abs(x - region.minX) < 1.4 || Math.abs(x - region.maxX) < 1.4;
  return (inX && nearZ) || (inZ && nearX);
}

/** Chapter 2: the ORION. */
export const SHIP_BIOME: Biome<FacilityModel> = {
  id: "facility",
  label: "ORION",
  kit: { url: FACILITY.url, models: FACILITY_MODELS, brightness: FACILITY.brightness, glowIntensity: FACILITY.glowIntensity, batchCellMetres: FACILITY.batchCellMetres },
  lighting: { ...FACILITY_LIGHTING, clearColor: [0.01, 0.012, 0.02], fogStart: 60, fogEnd: 140 },
  ground: GROUND_SPEC,
  bounds: BOUNDS,
  spawn: SPAWN,
  runStart: SPAWN,
  ambient: AMBIENT,
  build: buildShipLevel,
  campaign: {
    levels: SPACE_LEVELS,
    zones: ZONES,
    run: SPACE_RUN,
    difficulties: SPACE_DIFFICULTIES,
    defaultDifficulty: "hard",
    victory: { title: "ORION IS SILENT", text: "The Brood Mother is dead and the hive with her. Somewhere a rescue beacon is still blinking." },
    onLevel(_index, zoneId) {
      const region = ZONES[zoneId]?.region;
      for (const s of world.seals) {
        s.open = -1;
        s.entity.setLocalScale(s.width, 1, SEAL_HEIGHT);
        s.entity.setLocalPosition(s.x, SEAL_HEIGHT / 2, s.z);
        s.entity.enabled = !!region && onEdge(region, s.x, s.z);
      }
      world.exitSeals = [];
    },
    exits(zoneId): WayPoint[] {
      const exit = ZONES[zoneId]?.exit;
      world.exitSeals = exit ? world.seals.filter((s) => s.entity.enabled && Math.abs((exit.axis === "z" ? s.z : s.x) - exit.at) < 0.7) : [];
      return world.exitSeals.map((s) => ({ x: s.x, z: s.z, width: s.width, yawDeg: s.yawDeg }));
    },
    openExit(_zoneId, index) {
      const s = world.exitSeals[index];
      if (s && s.open < 0 && s.entity.enabled) s.open = 0;
    },
    arena(intensity) {
      world.arena = intensity;
    },
    update(dt) {
      world.time += dt;
      world.shown += (world.arena - world.shown) * Math.min(1, dt * 1.5);
      // Barriers shimmer (and flare red while a boss rages).
      const m = world.barrier;
      if (m) {
        const k = 1 + Math.sin(world.time * 6) * 0.15;
        m.emissive.set((0.25 + world.shown * 0.9) * k, 0.8 * (1 - world.shown * 0.6) * k, 1.2 * (1 - world.shown * 0.7) * k);
        m.update();
      }
      for (const s of world.exitSeals) {
        if (s.open < 0 || !s.entity.enabled) continue;
        s.open = Math.min(1, s.open + dt / SEAL_OPEN_SECONDS);
        const f = 1 - s.open * s.open;
        s.entity.setLocalScale(s.width * (1 - s.open * 0.3), 1, Math.max(0.01, SEAL_HEIGHT * f));
        s.entity.setLocalPosition(s.x, (SEAL_HEIGHT / 2) * f, s.z);
        if (s.open >= 1) s.entity.enabled = false;
      }
    },
  },
};
