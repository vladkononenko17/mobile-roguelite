import { BLEND_ADDITIVE, Color, Entity, Mesh, MeshInstance, StandardMaterial, TorusGeometry, Texture, ADDRESS_REPEAT, FILTER_LINEAR, FILTER_LINEAR_MIPMAP_LINEAR, type AppBase } from "playcanvas";
import { FACILITY, FACILITY_LIGHTING } from "../../config";
import { SPACE_DIFFICULTIES, SPACE_LEVELS, SPACE_RUN } from "../../gameplay/spaceConfig";
import type { AmbientEmitter } from "../AmbientFx";
import { declareCollider } from "../collision/CollisionWorld";
import type { GroundSpec } from "../Ground";
import type { GroundSurface } from "../../config";
import type { ModelKit, SpawnOptions } from "../props/ModelKit";
import { FACILITY_MODELS, type FacilityModel } from "../props/FacilityKit";
import type { Biome, LevelBounds, WayPoint, Zone } from "./Biome";
import { FloorPaint } from "./FloorPaint";

/**
 * THE ORION - chapter 2. One research station, crossed south to north (up the screen) over seven
 * levels: six sectors inside, joined by short corridors (HallwayPACK halls bridging the void, sealed
 * by energy barriers until the level is won), then out through the airlock onto the asteroid.
 *
 *   z   64  1 DOCKING BAY        the hangar the hero lands in: parked craft, cargo, pads     Act I
 *   z  -16     ~~ corridor ~~
 *   z  -16  2 OPERATIONS DECK    ops hall, crew quarters west, mess east, a checkpoint
 *   z -100     ~~ corridor ~~
 *   z -100  3 RESEARCH LAB       the cleanest white: glass labs, pods (the Warden's lockdown)
 *   z -180     ~~ corridor ~~
 *   z -180  4 QUARANTINE         the lab's language broken: red light, the containment cell   Act II
 *   z -264     ~~ corridor ~~
 *   z -264  5 REACTOR            industrial dark: the reactor on its dais, machinery bays
 *   z -356     ~~ corridor ~~
 *   z -356  6 PROJECT GATE       the round chamber and the portal the hive came through
 *   z -408     ~~ airlock tube ~~
 *   z -432  7 THE ASTEROID       outside, on the rock (the Brood Mother)                     Finale
 *   z -536
 *
 * The station's language: white/off-white modular walls (Quaternius sci-fi), graphite, light strips,
 * and accent paint that glows the sector's colour (cyan -> red -> orange -> purple). Walls facing the
 * camera (south) are low cutaways; rooms are open combat floors with the detail along the walls.
 */

type Rect = { x0: number; z0: number; x1: number; z1: number };
type SectorId = "dock" | "ops" | "lab" | "quarantine" | "reactor" | "gate" | "asteroid";

/** Sector rooms (wall lines; multiples of the 4 m wall module). */
const ROOMS: Record<Exclude<SectorId, "gate" | "asteroid">, Rect> = {
  dock: { x0: -40, z0: 0, x1: 40, z1: 64 },
  ops: { x0: -44, z0: -84, x1: 44, z1: -16 },
  lab: { x0: -40, z0: -164, x1: 40, z1: -100 },
  quarantine: { x0: -40, z0: -248, x1: 40, z1: -180 },
  reactor: { x0: -48, z0: -340, x1: 48, z1: -264 },
};
/** The Project Gate: a round chamber. */
const GATE = { x: 0, z: -382, radius: 26 };
/** The asteroid: open rock, no walls (a rim of boulders and the void). */
const ROCK: Rect = { x0: -52, z0: -536, x1: 52, z1: -432 };

/** Corridors (north-south along x = 0, HallwayPACK halls: 8 m modules, ~8.3 m across). */
const HALL = 4.15;
const DOOR = 4;
const CORRIDORS: { z0: number; z1: number; tube?: boolean }[] = [
  { z0: -16, z1: 0 },
  { z0: -100, z1: -84 },
  { z0: -180, z1: -164 },
  { z0: -264, z1: -248 },
  { z0: -356, z1: -340 },
  { z0: -432, z1: -408, tube: true },
];

const r = (x0: number, z0: number, x1: number, z1: number): LevelBounds => ({ minX: x0, minZ: z0, maxX: x1, maxZ: z1 });
/** A zone region 1.2 m inside its room (the walls), leading north (-z) at its north wall. */
const zone = (q: Rect, start: [number, number], exit = true): Zone => ({
  region: r(q.x0 + 1.2, q.z0 + 1.2, q.x1 - 1.2, q.z1 - 1.2),
  start: { x: start[0], z: start[1], yawDeg: 180 },
  ...(exit ? { exit: { axis: "z" as const, at: q.z0, dir: -1 as const } } : {}),
});
const GATE_RECT: Rect = { x0: GATE.x - GATE.radius, z0: GATE.z - GATE.radius, x1: GATE.x + GATE.radius, z1: GATE.z + GATE.radius };
export const ZONES: Record<SectorId, Zone> = {
  dock: zone(ROOMS.dock, [0, 54]),
  ops: zone(ROOMS.ops, [0, -28]),
  lab: zone(ROOMS.lab, [0, -112]),
  quarantine: zone(ROOMS.quarantine, [0, -192]),
  reactor: zone(ROOMS.reactor, [0, -276]),
  gate: zone(GATE_RECT, [0, -364]),
  asteroid: { region: r(ROCK.x0 + 1.5, ROCK.z0 + 1.5, ROCK.x1 - 1.5, ROCK.z1 - 0.6), start: { x: 0, z: -444, yawDeg: 180 } },
};

export const BOUNDS: LevelBounds = r(-52, -536, 52, 64);
export const SPAWN = ZONES.dock.start;

/* ------------------------------------------------------------------------------------------------
 * Colour: each sector's accent paint and light.
 * ---------------------------------------------------------------------------------------------- */

type RGB = [number, number, number];
const CYAN: RGB = [0.2, 0.75, 1];
const ICE: RGB = [0.45, 0.85, 1];
const RED: RGB = [1, 0.1, 0.06];
const ORANGE: RGB = [1, 0.42, 0.06];
const VIOLET: RGB = [0.6, 0.25, 1];
const WHITE: RGB = [0.7, 0.82, 1];
const STEAM: RGB = [1.05, 1.15, 1.3];
const GOO: RGB = [0.35, 1, 0.3];

/** Accent paint per sector (tints the kit's "accent" material as the hero moves through). */
const ACCENT: Record<SectorId, RGB> = {
  dock: CYAN,
  ops: [0.25, 0.6, 1],
  lab: ICE,
  quarantine: RED,
  reactor: ORANGE,
  gate: VIOLET,
  asteroid: VIOLET,
};
/** Sector spans along z (south edge first), to pick the accent colour from the hero's z. */
const SPANS: { id: SectorId; z0: number; z1: number }[] = [
  { id: "dock", z0: 0, z1: 64 },
  { id: "ops", z0: -84, z1: -16 },
  { id: "lab", z0: -164, z1: -100 },
  { id: "quarantine", z0: -248, z1: -180 },
  { id: "reactor", z0: -340, z1: -264 },
  { id: "gate", z0: -408, z1: -356 },
  { id: "asteroid", z0: -536, z1: -432 },
];

/** The reactor (dais and core) and the portal. */
const CORE = { x: 0, z: -302, radius: 7 };
const PORTAL = { x: GATE.x, z: GATE.z - 2, radius: 4.2 };
/** The quarantine's containment cell (walls on its lines). */
const CELL: Rect = { x0: -12, z0: -224, x1: 12, z1: -204 };

/** Deterministic RNG so the layout is the same on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Light pools and ambience: sparse, at the edges, each sector in its colour. */
export const AMBIENT: AmbientEmitter[] = [
  // Sector washes.
  { kind: "glow", x: 0, z: 32, size: [76, 60], color: CYAN, intensity: 0.08 },
  { kind: "glow", x: 0, z: -50, size: [84, 64], color: WHITE, intensity: 0.08 },
  { kind: "glow", x: 0, z: -132, size: [76, 60], color: WHITE, intensity: 0.04 },
  { kind: "glow", x: 0, z: -214, size: [76, 64], color: RED, intensity: 0.14 },
  { kind: "glow", x: 0, z: -302, size: [92, 72], color: ORANGE, intensity: 0.08 },
  { kind: "glow", x: GATE.x, z: GATE.z, size: [50, 50], color: VIOLET, intensity: 0.12 },
  { kind: "glow", x: 0, z: -484, size: [96, 96], color: VIOLET, intensity: 0.1 },
  // Dock: landing pad lights.
  ...[[-24, 44], [24, 44], [-24, 16], [24, 16]].map(([x, z]): AmbientEmitter => ({ kind: "glow", x, z, size: [12, 12], color: CYAN, intensity: 0.22 })),
  // Ops: the checkpoint's scanners.
  { kind: "glow", x: -7, z: -76, size: [5, 5], color: CYAN, intensity: 0.5, pulse: 0.5 },
  { kind: "glow", x: 7, z: -76, size: [5, 5], color: CYAN, intensity: 0.5, pulse: 0.5 },
  // Lab: bright clean light over the pods.
  { kind: "glow", x: -30, z: -132, size: [14, 40], color: ICE, intensity: 0.2 },
  { kind: "glow", x: 30, z: -132, size: [14, 40], color: ICE, intensity: 0.2 },
  // Quarantine: the cell glows sick green; alarms pulse red at the corners.
  { kind: "glow", x: 0, z: -214, size: [22, 18], color: GOO, intensity: 0.35, pulse: 0.2 },
  ...[[-36, -184], [36, -184], [-36, -244], [36, -244], [0, -186]].map(([x, z]): AmbientEmitter => ({ kind: "glow", x, z, size: [10, 10], color: RED, intensity: 0.6, pulse: 0.8 })),
  { kind: "smoke", x: -26, y: 0.3, z: -236, size: [3, 3], intensity: 0.35, color: [0.7, 1, 0.7] },
  // Reactor: the core burns cyan inside orange warning light; sparks in the machinery bays.
  { kind: "glow", x: CORE.x, z: CORE.z, size: [24, 24], color: CYAN, intensity: 0.6, pulse: 0.25 },
  { kind: "sparks", x: CORE.x, y: 2.5, z: CORE.z, every: 2.2 },
  { kind: "sparks", x: -40, y: 2, z: -286, every: 3 },
  { kind: "sparks", x: 40, y: 2, z: -322, every: 3 },
  ...[[-44, -300], [44, -300]].map(([x, z]): AmbientEmitter => ({ kind: "glow", x, z, size: [9, 20], color: ORANGE, intensity: 0.35, pulse: 0.6 })),
  { kind: "smoke", x: -38, y: 0.3, z: -330, size: [3, 3], intensity: 0.45, color: STEAM },
  { kind: "smoke", x: 38, y: 0.3, z: -272, size: [3, 3], intensity: 0.45, color: STEAM },
  // Gate: the portal's light.
  { kind: "glow", x: PORTAL.x, z: PORTAL.z, size: [18, 14], color: VIOLET, intensity: 0.35, pulse: 0.3 },
  { kind: "dust", x: GATE.x, y: 1.2, z: GATE.z, size: [40, 40], intensity: 0.5, color: [0.7, 0.55, 1] },
  // Asteroid: drifting dust.
  { kind: "dust", x: 0, y: 1.2, z: -484, size: [60, 60], intensity: 0.7, color: [0.75, 0.65, 0.95] },
  // Corridors: strip lights (the airlock tube violet).
  ...CORRIDORS.map((c): AmbientEmitter => ({ kind: "glow", x: 0, z: (c.z0 + c.z1) / 2, size: [7, c.z1 - c.z0], color: c.tube ? VIOLET : WHITE, intensity: 0.2 })),
];

const ROOM_SURFACE: Record<keyof typeof ROOMS, GroundSurface> = { dock: "dockdeck", ops: "stationdeck", lab: "labdeck", quarantine: "quarantine", reactor: "grate" };
export const GROUND_SPEC: GroundSpec = {
  base: "stationdeck",
  areas: [
    ...Object.entries(ROOMS).map(([name, q]) => ({ ...q, surface: ROOM_SURFACE[name as keyof typeof ROOMS] })),
    { ...GATE_RECT, surface: "gatefloor" as const },
    { ...ROCK, surface: "asteroid" as const },
  ],
  pads: [
    // Dock: the central landing lane; ops: the checkpoint lane; lab: the clean white centre.
    { x0: -4, z0: 2, x1: 4, z1: 62, surface: "stationdeck" },
    { x0: -6, z0: -84, x1: 6, z1: -60, surface: "labdeck" },
    { x0: -14, z0: -150, x1: 14, z1: -114, surface: "stationdeck" },
    // Reactor: the dais.
    { x0: CORE.x - 11, z0: CORE.z - 11, x1: CORE.x + 11, z1: CORE.z + 11, surface: "deck" },
  ],
  patches: [
    // Grime spreads north: a little in ops, blood and goo in quarantine, scorch in the reactor.
    { x: 30, z: -70, w: 10, d: 8, surface: "grime", seed: 1 },
    { x: -26, z: -196, w: 16, d: 12, surface: "bloodrock", seed: 2 },
    { x: 20, z: -236, w: 18, d: 12, surface: "grime", seed: 3 },
    { x: 0, z: -214, w: 34, d: 28, surface: "grime", seed: 4 },
    { x: 30, z: -200, w: 10, d: 8, surface: "bloodrock", seed: 5 },
    { x: CORE.x, z: CORE.z, w: 30, d: 30, surface: "cinder", seed: 6 },
    { x: -30, z: -318, w: 16, d: 12, surface: "ash", seed: 7 },
    { x: GATE.x, z: GATE.z, w: 30, d: 30, surface: "bloodrock", seed: 8 },
    { x: -18, z: -470, w: 26, d: 20, surface: "cinder", seed: 0 },
    { x: 20, z: -500, w: 24, d: 20, surface: "boneash", seed: 1 },
  ],
};

/* ------------------------------------------------------------------------------------------------
 * Energy seals (the way on), the void, the portal.
 * ---------------------------------------------------------------------------------------------- */

interface Seal { entity: Entity; x: number; z: number; width: number; yawDeg: number; open: number }
const SEAL_HEIGHT = 3;
const SEAL_OPEN_SECONDS = 0.7;
const world = {
  seals: [] as Seal[], exitSeals: [] as Seal[], arena: 0, shown: 0, time: 0,
  barrier: null as StandardMaterial | null,
  accent: null as StandardMaterial | null, accentNow: [...CYAN] as RGB,
  backdrop: null as Entity | null,
  voidMaterial: null as StandardMaterial | null,
  camera: null as Entity | null,
  portal: null as { ring: Entity; disc: Entity; mat: StandardMaterial; collapse: number } | null,
};

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

/** A soft round additive glow (nebulae, the portal's halo). */
function hazeMaterial(app: AppBase, color: RGB, k: number): StandardMaterial {
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
  return m;
}

/** Metres of backdrop per repeat of the space texture, and how fast it drifts with the camera. */
const VOID_TILE = 240;
const VOID_PARALLAX = 0.22;
/** The backdrop's distance in front of the camera (inside the space map's far plane). */
const VOID_DISTANCE = 150;

/**
 * The void round the station: one camera-facing quad just inside the far plane, painted with stars,
 * nebulae and a planet (a seamless 1024 canvas), drifting slowly as the camera moves (parallax).
 * Everything in the level is nearer, so the level hides it wherever there is floor. (It used to be
 * big planes far below the station: on phone GPUs they sampled into blocky smears.)
 */
function buildVoid(root: Entity, app: AppBase): void {
  const random = rng(77);
  const size = 1024;
  const texture = canvasTexture(app, size, (g) => {
    g.fillStyle = "#020308";
    g.fillRect(0, 0, size, size);
    // Draws with wrap-around so the tile repeats seamlessly.
    const wrapped = (x: number, y: number, r: number, draw: (x: number, y: number) => void) => {
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        if (x + ox + r > 0 && x + ox - r < size && y + oy + r > 0 && y + oy - r < size) draw(x + ox, y + oy);
      }
    };
    g.globalCompositeOperation = "lighter";
    const nebulae: [number, number, number, string][] = [
      [230, 260, 330, "rgba(70,30,120,0.55)"], [720, 380, 380, "rgba(20,60,120,0.5)"], [520, 820, 300, "rgba(110,30,80,0.4)"], [900, 900, 220, "rgba(40,20,90,0.45)"],
    ];
    for (const [x, y, r, c] of nebulae) {
      wrapped(x, y, r, (px, py) => {
        const grad = g.createRadialGradient(px, py, 0, px, py, r);
        grad.addColorStop(0, c); grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad; g.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }
    for (let i = 0; i < 900; i++) {
      const b = random(), r = b > 0.985 ? 2.4 : b > 0.9 ? 1.6 : 1;
      const x = random() * size, y = random() * size;
      const colour = `rgba(${200 + random() * 55},${210 + random() * 45},255,${0.3 + b * 0.7})`;
      wrapped(x, y, r, (px, py) => { g.fillStyle = colour; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); });
    }
    // The planet: a shaded disc with a thin lit rim.
    g.globalCompositeOperation = "source-over";
    const [px, py, pr] = [650, 640, 120];
    const body = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
    body.addColorStop(0, "#3d7fa8"); body.addColorStop(0.6, "#1c3f5c"); body.addColorStop(1, "#08131f");
    g.fillStyle = body; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(120,200,255,0.45)"; g.lineWidth = 4; g.beginPath(); g.arc(px, py, pr + 2, Math.PI * 0.9, Math.PI * 1.7); g.stroke();
  }, true);
  const material = new StandardMaterial();
  material.diffuse.set(0, 0, 0);
  material.emissive = new Color(1, 1, 1);
  material.emissiveMap = texture;
  material.useLighting = false;
  material.useFog = false;
  material.useSkybox = false;
  material.cull = 0;
  material.update();
  const quad = new Entity("void");
  quad.addComponent("render", { type: "plane", material, castShadows: false, receiveShadows: false });
  // Parented to the camera (found when the level is attached, see SHIP_BIOME.update).
  const side = VOID_DISTANCE * 2.6;
  quad.setLocalScale(side, 1, side);
  quad.setLocalEulerAngles(90, 0, 0);
  quad.setLocalPosition(0, 0, -VOID_DISTANCE);
  material.emissiveMapTiling.set(side / VOID_TILE, side / VOID_TILE);
  world.backdrop = quad;
  world.voidMaterial = material;
  world.camera = null;
  quad.enabled = false;
  root.addChild(quad);
  void app;
}

/** The Project Gate's portal: a standing ring and a swirling disc (additive), on a dais. */
function buildPortal(root: Entity, app: AppBase): void {
  const swirl = canvasTexture(app, 256, (g) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, 256, 256);
    g.translate(128, 128);
    for (let arm = 0; arm < 5; arm++) {
      g.rotate((Math.PI * 2) / 5);
      for (let t = 0; t < 1; t += 0.01) {
        const a = t * Math.PI * 2.2, d = 8 + t * 116;
        g.fillStyle = `rgba(255,255,255,${0.55 * (1 - t) + 0.08})`;
        g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 3 + t * 10, 0, Math.PI * 2); g.fill();
      }
    }
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 128);
    core.addColorStop(0, "rgba(255,255,255,0.9)"); core.addColorStop(0.25, "rgba(255,255,255,0.2)"); core.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = core; g.fillRect(-128, -128, 256, 256);
  });
  const mat = new StandardMaterial();
  mat.diffuse.set(0, 0, 0);
  mat.emissive = new Color(VIOLET[0], VIOLET[1], VIOLET[2]);
  mat.emissiveMap = swirl;
  mat.useLighting = false; mat.blendType = BLEND_ADDITIVE; mat.depthWrite = false; mat.cull = 0;
  mat.update();
  const ringMat = new StandardMaterial();
  ringMat.diffuse.set(0.05, 0.05, 0.07);
  ringMat.emissive = new Color(0.5, 0.25, 1.1);
  ringMat.update();
  const holder = new Entity("portal");
  holder.setLocalPosition(PORTAL.x, 0, PORTAL.z);
  root.addChild(holder);
  const ring = new Entity("portal-ring");
  const torus = Mesh.fromGeometry(app.graphicsDevice, new TorusGeometry({ ringRadius: PORTAL.radius, tubeRadius: 0.38, segments: 40, sides: 10 }));
  ring.addComponent("render", { meshInstances: [new MeshInstance(torus, ringMat)], castShadows: true, receiveShadows: false });
  ring.setLocalPosition(0, PORTAL.radius + 0.3, 0);
  ring.setLocalEulerAngles(90, 0, 0);
  holder.addChild(ring);
  const disc = new Entity("portal-disc");
  disc.addComponent("render", { type: "plane", material: mat, castShadows: false, receiveShadows: false });
  disc.setLocalPosition(0, PORTAL.radius + 0.3, 0);
  disc.setLocalEulerAngles(90, 0, 0);
  disc.setLocalScale(PORTAL.radius * 1.8, 1, PORTAL.radius * 1.8);
  holder.addChild(disc);
  const halo = new Entity("portal-halo");
  halo.addComponent("render", { type: "plane", material: hazeMaterial(app, VIOLET, 0.3), castShadows: false, receiveShadows: false });
  halo.setLocalPosition(0, 0.05, 1.5);
  halo.setLocalScale(12, 1, 8);
  holder.addChild(halo);
  world.portal = { ring, disc, mat, collapse: -1 };
}

export function buildShipLevel(kit: ModelKit<FacilityModel>): Entity {
  const root = new Entity("ShipLevel");
  const random = rng(911);
  const app = kit.app;
  world.seals = [];
  world.exitSeals = [];
  world.accent = kit.material("accent") ?? null;
  const place = (id: FacilityModel, x: number, z: number, yaw = 0, options: SpawnOptions = {}) => kit.spawn(id, x, z, yaw, root, options);
  const block = (x: number, z: number, width: number, depth: number, low = false) => {
    const e = new Entity("block");
    e.setLocalPosition(x, 0, z);
    root.addChild(e);
    declareCollider(e, { kind: "box", width, depth, low });
  };
  buildVoid(root, app);

  // ------------------------------------------------------------------ walls
  // Rows of 4 m modules. North walls (facing the camera) and side walls stand full height; south
  // walls are low cutaways. `gaps` are x (or z) ranges left open (doorways). The modules are panelled
  // on one side only: walls along x always face the camera (south, yaw 0), room side walls face in.
  const FULL: FacilityModel[] = ["qWall1", "qWallEmpty", "qWall3", "qWallEmpty", "qWall5", "qWall4", "qWallEmpty", "qWall2"];
  const LOW: FacilityModel[] = ["qWallLow", "qWallLow2", "qWallLow", "qWallLow4"];
  const inGap = (v: number, gaps: [number, number][]) => gaps.some(([a, b]) => v > a && v < b);
  const rowX = (z: number, x0: number, x1: number, pattern: FacilityModel[], yaw: number, gaps: [number, number][] = []) => {
    for (let x = x0 + 2, i = 0; x < x1; x += 4, i++) if (!inGap(x, gaps)) place(pattern[i % pattern.length], x, z, yaw);
  };
  const rowZ = (x: number, z0: number, z1: number, pattern: FacilityModel[], yaw: number, gaps: [number, number][] = []) => {
    for (let z = z1 - 2, i = 0; z > z0; z -= 4, i++) if (!inGap(z, gaps)) place(pattern[i % pattern.length], x, z, yaw);
  };
  /** A free-standing wall along z, panelled both sides (the modules are one-sided). */
  const rowZ2 = (x: number, z0: number, z1: number, pattern: FacilityModel[]) => {
    rowZ(x, z0, z1, pattern, 90);
    rowZ(x, z0, z1, pattern, -90);
  };
  /** A room: full north and side walls, a low south wall; doorways at x = +-DOOR north and south. */
  const room = (q: Rect, pattern: { north: FacilityModel[]; west: FacilityModel[]; east: FacilityModel[] }, southOpen = true) => {
    const door: [number, number][] = [[-DOOR, DOOR]];
    rowX(q.z0, q.x0, q.x1, pattern.north, 0, door);
    rowX(q.z1, q.x0, q.x1, LOW, 0, southOpen ? door : []);
    rowZ(q.x0, q.z0, q.z1, pattern.west, 90);
    rowZ(q.x1, q.z0, q.z1, pattern.east, -90);
    // Columns at the corners, the doorways and every 12 m along the walls.
    for (const [x, z] of [[q.x0, q.z0], [q.x1, q.z0]]) place("qColumn3", x, z, 0);
    for (const [x, z] of [[q.x0, q.z1], [q.x1, q.z1]]) place("qColumnLow", x, z, 0);
    for (const s of [-1, 1]) {
      place("qColumn3", s * (DOOR + 0.35), q.z0, 0);
      if (southOpen) place("qColumnLow", s * (DOOR + 0.35), q.z1, 0);
    }
    for (let z = q.z1 - 12; z > q.z0 + 4; z -= 12) for (const x of [q.x0, q.x1]) place("qColumn2", x, z, 0);
  };
  const HULL = (windows: number): FacilityModel[] => [...FULL.slice(0, 8 - windows), ...Array<FacilityModel>(windows).fill("qWindowLong")];

  room(ROOMS.dock, { north: ["qWall2", "qWallEmpty", "qDoorWall", "qWallEmpty", "qWall4"], west: HULL(3), east: HULL(3) }, false);
  room(ROOMS.ops, { north: ["qWall1", "qWindowThree", "qWallEmpty", "qWall5"], west: ["qWall1", "qDoorWallSingle", "qWallEmpty", "qWall3", "qWindowSmall"], east: ["qWall4", "qWallEmpty", "qDoorWallSingle", "qWall5", "qWindowSmall"] });
  room(ROOMS.lab, { north: ["qWindowLong", "qWallEmpty", "qWall5", "qWallEmpty"], west: ["qWallEmpty", "qWindow", "qWallEmpty", "qWall3"], east: ["qWallEmpty", "qWindow", "qWallEmpty", "qWall3"] });
  room(ROOMS.quarantine, { north: ["qWall2", "qDoorWall", "qWall2", "qWallEmpty"], west: ["qWall2", "qWallEmpty", "qDoorWallSingle", "qWall4"], east: ["qWall4", "qDoorWallSingle", "qWallEmpty", "qWall2"] });
  room(ROOMS.reactor, { north: ["qWall2", "qWall4", "qWall2", "qWall5"], west: ["qWall2", "qWall4", "qWall5"], east: ["qWall5", "qWall2", "qWall4"] });

  // ------------------------------------------------------------------ the Project Gate's ring
  {
    const segments = Math.round((Math.PI * 2 * GATE.radius) / 4.1);
    for (let i = 0; i < segments; i++) {
      const a = ((i + 0.5) / segments) * Math.PI * 2;
      const x = GATE.x + Math.sin(a) * GATE.radius, z = GATE.z + Math.cos(a) * GATE.radius;
      // Doorways north (z < centre) and south (z > centre).
      if (Math.abs(x - GATE.x) < DOOR + 0.5) continue;
      const south = Math.cos(a) > 0.25;
      const yaw = (a * 180) / Math.PI + (south ? 0 : 180);
      const id: FacilityModel = south ? LOW[i % LOW.length] : i % 5 === 0 ? "qWall2" : i % 5 === 2 ? "qWall5" : i % 5 === 4 ? "qWindowLong" : "qWall4";
      place(id, x, z, yaw, { scale: [1.04, 1, 1] });
      if (i % 3 === 0) place(south ? "qColumnLow" : "qColumn3", GATE.x + Math.sin(a + Math.PI / segments) * GATE.radius, GATE.z + Math.cos(a + Math.PI / segments) * GATE.radius, yaw);
    }
    for (const s of [-1, 1]) for (const z of [GATE.z - GATE.radius, GATE.z + GATE.radius]) place(z < GATE.z ? "qColumn3" : "qColumnLow", s * (DOOR + 0.6), z + (z < GATE.z ? 0.4 : -0.4), 0);
  }

  // ------------------------------------------------------------------ corridors
  // HallwayPACK halls (roofs cut), walls declared as colliders; the airlock tube has windows.
  for (const c of CORRIDORS) {
    for (let z = c.z1 - 4, i = 0; z > c.z0; z -= 8, i++) place(c.tube || i % 2 ? "hHallWindow" : "hHall", 0, z, 0);
    const len = c.z1 - c.z0;
    for (const s of [-1, 1]) block(s * (HALL + 0.3), (c.z0 + c.z1) / 2, 0.8, len);
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
    addSeal(0, c.z0, DOOR * 2);
    addSeal(0, c.z1, DOOR * 2);
  }

  // ================================================================== 1 DOCKING BAY
  // Two landing pads each side with parked craft, cargo stacked along the hull, the lane up the middle.
  {
    const q = ROOMS.dock;
    place("sCraftCargo", -26, 46, 20);
    place("sCraftCargoB", 26, 44, -160);
    place("sCraftMiner", -24, 16, -20);
    place("sCraftSpeeder", 26, 16, 200);
    for (const [x, z] of [[-24, 44], [24, 44], [-24, 16], [24, 16]]) {
      for (const [dx, dz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) place("qFloorSide", x + dx, z + dz, Math.atan2(dx, dz) * 57.3 + 45);
    }
    // Crate islands between the pads (cover, with room round them).
    for (const s of [-1, 1]) {
      place("qCrateLong", s * 12, 32, 90, { scale: 1.6 });
      place("qCrate", s * 12.6, 28.6, 15, { scale: 1.5 });
      place("qCrate", s * 11, 35.6, -10, { scale: 1.5 });
    }
    // Cargo along the side walls, in stacks with gaps.
    for (const s of [-1, 1]) {
      for (const z of [58, 30, 4]) {
        place("qContainer", s * (q.x1 - 2.4), z, 90);
        place("qCrateLong", s * (q.x1 - 2.2), z - 2.4, 90);
        place("qCrate", s * (q.x1 - 3.8), z - 1.2, 20);
      }
      place("kContainerTall", s * (q.x1 - 3), 44, 90);
      place("kContainerWide", s * (q.x1 - 3), 18, 90);
    }
    // Along the north wall: the dock's control booths either side of the doorway.
    for (const s of [-1, 1]) {
      place("qComputer", s * 8, q.z0 + 1.2, 180);
      place("qComputerSmall", s * 10.5, q.z0 + 1, 180);
    }
    place("sRocket", -36, 58, 0, { scale: 0.8 });
  }

  // ================================================================== 2 OPERATIONS DECK
  // Crew quarters west and the mess east behind partial partitions (wide gaps), the ops consoles on the
  // north wall, a security checkpoint in front of the way on.
  {
    const q = ROOMS.ops;
    // Partitions: full walls north, low towards the camera, with a 20 m opening.
    for (const s of [-1, 1]) {
      const x = s * 24;
      rowZ2(x, q.z0, -60, ["qWall1", "qWindowSmall", "qWallEmpty"]);
      rowZ2(x, -40, q.z1, ["qWallLow", "qWallLow2"]);
      place("qColumn3", x, -60, 0);
      place("qColumnLow", x, -40, 0);
    }
    // Crew quarters (west): bunks against the wall, lockers.
    for (let z = -24; z > -80; z -= 8) {
      place("bunk", -41, z, 90);
      if (z % 16 === 0) place("qShelf", -33, z - 3, 90);
    }
    place("kTable", -33, -48, 0);
    place("kChair", -35, -46, 40);
    // Mess (east): tables, a food dispenser row.
    for (const [x, z] of [[34, -26], [34, -36], [34, -70], [30, -78]]) place("cafeTable", x, z, 90);
    place("octoTable", 36, -52, 0);
    for (let z = -24; z > -80; z -= 10) place("qComputerSmall", 42.6, z, -90);
    // Ops consoles on the north wall.
    for (const x of [-20, -14, 14, 20]) place("commandConsole", x, q.z0 + 2.2, 180);
    place("monitorBlue", -9, q.z0 + 1, 180);
    place("monitorBlue", 9, q.z0 + 1, 180);
    place("kTableDisplay", 0, -44, 0, { scale: 1.6 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      place("qComputerSmall", Math.sin(a) * 5, -44 + Math.cos(a) * 5, (a * 180) / Math.PI + 180);
    }
    // The checkpoint: two scanner posts either side of the lane.
    for (const s of [-1, 1]) {
      place("qColumnSlim", s * 6.5, -76, 0);
      place("qComputer", s * 8.5, -74, s > 0 ? -90 : 90);
      place("kBarrier", s * 12, -74, 0);
    }
  }

  // ================================================================== 3 RESEARCH LAB
  // The cleanest white room: glass-walled labs west and east (wide openings), pods and capsules in
  // rows, the centre open for the Warden.
  {
    const q = ROOMS.lab;
    for (const s of [-1, 1]) {
      const x = s * 22;
      rowZ2(x, q.z0, -140, ["qWindow", "qWindowThree"]);
      rowZ2(x, -124, q.z1, ["qWallLow"]);
      place("qColumn3", x, -140, 0);
      place("qColumnLow", x, -124, 0);
      place("qColumnLow", x, q.z1, 0);
      // Pods and capsules in the labs.
      for (let z = -108; z > -160; z -= 8) {
        place("qPod", s * 36.5, z, s > 0 ? -90 : 90);
        place("qCapsule", s * 30, z - 4, 0);
      }
      place("qComputer", s * 27, -144, s > 0 ? -90 : 90);
      place("qComputerSmall", s * 27, -150, s > 0 ? -90 : 90);
      place("qShelfTall", s * 38, -162, 0);
      place("qTeleporter", s * 30, -132, 0);
    }
    // Specimen pods standing in the hall (islands of cover).
    for (const [x, z] of [[-12, -122], [12, -122], [-12, -144], [12, -144]]) place("qPod", x, z, 0);
    // North wall: a statue of the station's founder, the lab's instruments.
    place("qStatue", 12, q.z0 + 2, 180);
    place("qLaser", -12, q.z0 + 2.4, 180);
    for (const x of [-18, 18]) place("qComputer", x, q.z0 + 1.2, 180);
    // A few vessels, tidy.
    for (const [x, z] of [[-16, -106], [16, -106], [-14, -158], [14, -158]]) {
      place("qVesselTall", x, z, 0);
      place("qVessel", x + 0.6, z + 0.4, 0);
    }
  }

  // ================================================================== 4 QUARANTINE
  // The lab's language, broken: the containment cell in the middle (glass, its door blown), combat
  // round it; red emergency light, tipped-over pods and capsules, goo.
  {
    const c = CELL;
    rowX(c.z0, c.x0, c.x1, ["qWindowThree", "qWall2"], 0);
    rowX(c.z1, c.x0, c.x1, ["qWallLow2", "qWallLow"], 0, [[-4, 4]]);
    rowZ2(c.x0, c.z0, c.z1, ["qWindowThree", "qWall2"]);
    rowZ2(c.x1, c.z0, c.z1, ["qWall2", "qWindowThree"]);
    for (const [x, z] of [[c.x0, c.z0], [c.x1, c.z0]]) place("qColumn3", x, z, 0);
    for (const [x, z] of [[c.x0, c.z1], [c.x1, c.z1], [-4.3, c.z1], [4.3, c.z1]]) place("qColumnLow", x, z, 0);
    // The specimen tank inside, cracked; pods broken open around it.
    place("qPod", 0, -216, 0, { scale: 1.6 });
    place("sCrystals", -6, -210, 30, { scale: 0.9 });
    place("sCrystalsLargeA", 7, -218, 200, { scale: 0.8 });
    place("qCapsule", -8, -208, 0, { tiltZ: 70, y: 0.4 });
    // A cordon round the cell (broken through in places).
    for (const [x, z, yaw] of [[-16, -200, 0], [16, -200, 0], [-16, -228, 0], [8, -228, 0], [-17, -214, 90], [17, -210, 90]] as [number, number, number][]) place("kBarrier", x, z, yaw);
    // Around the walls: fallen capsules, broken screens, abandoned crates.
    const wreck: [FacilityModel, number, number, number, SpawnOptions?][] = [
      ["qPod", -36, -190, 90], ["qPod", -36, -200, 90, { tiltZ: 25 }], ["qCapsule", -30, -196, 0, { tiltX: 80, y: 0.4 }],
      ["qPod", 36, -238, -90], ["qCapsule", 30, -240, 0, { tiltZ: -75, y: 0.4 }], ["qCrate", 32, -186, 30], ["qCrateLong", 35, -190, 80],
      ["qComputer", -38, -226, 90, { tiltX: -20 }], ["displayRed", -38.6, -214, 90], ["monitorRed", 38, -214, -90],
      ["qShelf", -34, -244, 0, { tiltZ: 30 }], ["qCrate", -30, -242, 10], ["bioRed", 36, -226, -90],
      ["cryoOff", 34, -200, -90, { tiltZ: -35 }], ["qVessel", -24, -188, 0, { tiltX: 90, y: 0.15 }],
    ];
    for (const [id, x, z, yaw, o] of wreck) place(id, x, z, yaw, o ?? {});
  }

  // ================================================================== 5 REACTOR
  // Industrial and dark: the reactor on its dais (a crystal core in a ring of generators), machinery
  // bays along the side walls with pipes and batteries, catwalk rails.
  {
    const q = ROOMS.reactor;
    place("qBase", CORE.x, CORE.z, 0, { scale: [4.2, 1, 4.2] });
    place("sCrystalsLargeA", CORE.x, CORE.z, 0, { scale: 2.6 });
    place("sPipeRing", CORE.x, CORE.z, 0, { scale: 1.9 });
    block(CORE.x, CORE.z, 6, 6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      place(i % 2 ? "generator" : "genPile", CORE.x + Math.sin(a) * (CORE.radius + 2), CORE.z + Math.cos(a) * (CORE.radius + 2), (a * 180) / Math.PI);
    }
    for (const s of [-1, 1]) {
      // Machinery bays: generators and batteries against the side walls.
      for (let z = q.z1 - 8; z > q.z0 + 4; z -= 12) {
        place("genPileSmall", s * (q.x1 - 3), z, 0);
        place(z % 24 ? "batteryOrange" : "batteryGrey", s * (q.x1 - 2.2), z - 4.5, s > 0 ? -90 : 90);
        place("wallPipe", s * (q.x1 - 0.5), z - 2, s > 0 ? -90 : 90);
      }
      place("sGenerator", s * 36, q.z0 + 5, 0);
      place("railing", s * 12, q.z0 + 2.5, 0, { scale: [3, 1, 1] });
    }
    for (const x of [-20, 20]) place("qPipes", x, q.z0 + 0.6, 0, { y: -3.2 });
    // Conduits across the floor from the core to the bays.
    for (const s of [-1, 1]) for (const dz of [-8, 8]) {
      for (let k = 0; k < 4; k++) place("qPipes", s * (14 + k * 7), CORE.z + dz, 0, { y: -3.95, scale: [2, 1, 1] });
    }
  }

  // ================================================================== 6 PROJECT GATE
  // The visual climax: the portal on its dais, machines and conduits round the ring, the hive's
  // crystals creeping in from the portal.
  {
    buildPortal(root, app);
    block(PORTAL.x, PORTAL.z, PORTAL.radius * 2.1, 3);
    place("qBase", PORTAL.x, PORTAL.z, 0, { scale: [2.4, 1, 1.4] });
    for (const s of [-1, 1]) {
      place("qTeleporter2", PORTAL.x + s * 7, PORTAL.z + 2, 0);
      place("qLaser", PORTAL.x + s * 9.5, PORTAL.z - 3, s * 90);
    }
    // Conduits from the ring walls to the dais.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const d = GATE.radius - 7;
      place("qPipes", GATE.x + Math.sin(a) * d, GATE.z + Math.cos(a) * d, (a * 180) / Math.PI + 90, { y: -3.95, scale: [2.2, 1, 1] });
    }
    // Machines along the ring, crystals creeping out of the portal.
    for (const deg of [-60, -30, 30, 60, 120, 240]) {
      const a = (deg * Math.PI) / 180;
      const d = GATE.radius - 2.2;
      place(deg % 60 === 0 ? "qComputer" : "generator", GATE.x + Math.sin(a + Math.PI) * d, GATE.z + Math.cos(a + Math.PI) * d, deg);
    }
    for (const [x, z, k] of [[-5, -392, 1.1], [6, -393, 0.9], [-12, -386, 0.7], [13, -380, 0.8], [-3, -398, 1.3]]) {
      place(random() < 0.5 ? "sCrystalsLargeB" : "sCrystals", GATE.x + x, z, random() * 360, { scale: k });
    }
  }

  // ================================================================== 7 THE ASTEROID
  // Low colliders round the rock (open where the airlock tube arrives), boulders over the void.
  {
    const m = ROCK;
    block(m.x0 - 0.5, (m.z0 + m.z1) / 2, 1, m.z1 - m.z0, true);
    block(m.x1 + 0.5, (m.z0 + m.z1) / 2, 1, m.z1 - m.z0, true);
    block((m.x0 + m.x1) / 2, m.z0 - 0.5, m.x1 - m.x0, 1, true);
    block((m.x0 - HALL) / 2, m.z1 + 0.5, -HALL - m.x0, 1, true);
    block((m.x1 + HALL) / 2, m.z1 + 0.5, m.x1 - HALL, 1, true);
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
    // Rocks drifting in the void round it.
    for (let i = 0; i < 22; i++) {
      const a = random() * Math.PI * 2, d = 62 + random() * 36;
      place(random() < 0.5 ? "sMeteor" : "sRockLargeA", Math.sin(a) * d, -484 + Math.cos(a) * d, random() * 360, { y: -8 - random() * 20, scale: 1 + random() * 3, noCollider: true });
    }
    // A crashed shuttle, the hive's crystal spires, a survey team's rover and dish, craters.
    place("sCraftCargo", -30, -456, 70, { tiltZ: 18, y: -0.8 });
    place("sDish", 34, -466, 200);
    place("sRover", 30, -476, 120);
    for (const [x, z, k] of [[-8, -512, 1.6], [12, -516, 1.4], [0, -524, 2]]) place("sCrystalsLargeB", x, z, random() * 360, { scale: k });
    for (let i = 0; i < 10; i++) place(random() < 0.5 ? "sCraterLarge" : "sCrater", -40 + random() * 80, -446 - random() * 84, random() * 360, { scale: 1.5 + random() * 1.5 });
    const rocks: [FacilityModel, number, number][] = [["sMeteor", -36, -500], ["sRockLargeA", 38, -506], ["sRock", -20, -482], ["sCrystals", 22, -490], ["sRocksSmall", -12, -470], ["sRock", 16, -528]];
    for (const [id, x, z] of rocks) place(id, x, z, random() * 360, { scale: 0.9 + random() * 0.4 });
    // ORION herself, seen from the rock: the station's hull runs below the rock's west and east rims
    // (lit windows facing the rock), docking arms hang in the void either side of the airlock tube.
    for (const s of [-1, 1]) {
      for (let z = m.z1 - 6, i = 0; z > m.z0 + 10; z -= 8, i++) {
        place(i % 3 === 1 ? "qWall5" : "qWindowLong", s * (m.x1 + 9), z, s > 0 ? -90 : 90, { y: -7, scale: [2, 2, 2], noCollider: true });
        if (i % 2 === 0) place("qColumn3", s * (m.x1 + 9), z - 4, 0, { y: -7, scale: [2, 2, 2], noCollider: true });
      }
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const x = s * (HALL + 6 + i * 8), z = m.z1 + 6 + (i % 2) * 3;
        place("qWindowLong", x, z, 180, { y: -3 - i * 1.5, scale: [2, 1.6, 2], noCollider: true });
        if (i % 2 === 0) place("sStructure", x, z + 5, 0, { y: -8 - i, scale: 1.6, noCollider: true });
      }
      place("sHangar", s * 64, m.z1 + 8, s > 0 ? -90 : 90, { y: -10, scale: 1.8, noCollider: true });
      place("sDish", s * 70, -470, s * 60, { y: -14, scale: 1.5, noCollider: true });
      place("sSupports", s * 60, -520, 0, { y: -18, scale: 2, noCollider: true });
    }
  }

  // ------------------------------------------------------------------ floor paint (one draw call)
  const paint = new FloorPaint(["01  DOCKING BAY", "02  OPERATIONS", "03  RESEARCH LAB", "04  QUARANTINE", "05  REACTOR", "06  PROJECT GATE"]);
  const PAINT: RGB = [0.9, 0.93, 0.96];
  const YELLOW: RGB = [1, 0.72, 0.1];
  // Every doorway: hazard stripes across the threshold, chevrons leading on.
  for (const c of CORRIDORS) {
    if (c.tube) continue;
    paint.add("hazard", 0, c.z0 - 1, DOOR * 2 - 0.6, 1.2, 0, YELLOW, 0.75);
    paint.add("hazard", 0, c.z1 + 1, DOOR * 2 - 0.6, 1.2, 0, YELLOW, 0.75);
  }
  // 1 DOCKING BAY: landing pads, the lane north, bay frames.
  for (const [x, z] of [[-24, 44], [24, 44], [-24, 16], [24, 16]]) paint.add("pad", x, z, 15, 15, 0, CYAN, 0.45);
  paint.lane(-4, 62, -4, 3, PAINT);
  paint.lane(4, 62, 4, 3, PAINT);
  for (let z = 58; z > 4; z -= 9) paint.add("chevron", 0, z, 4, 4, 0, YELLOW, 0.55);
  paint.add("label0", 0, 50, 15, 3.8, 0, PAINT, 0.28);
  for (const s of [-1, 1]) for (const z of [58, 30, 4]) paint.add("frame", s * 36, z - 1, 7, 7, 0, YELLOW, 0.35);
  // 2 OPERATIONS: the lane door to door, a ring round the holo-table, the checkpoint.
  paint.lane(-2.5, -18, -2.5, -82, PAINT);
  paint.lane(2.5, -18, 2.5, -82, PAINT);
  paint.add("ring", 0, -44, 14, 14, 0, ACCENT.ops, 0.45);
  paint.add("hazard", 0, -76, 10, 1, 0, YELLOW, 0.7);
  paint.add("label1", 0, -32, 15, 3.8, 0, PAINT, 0.25);
  for (const z of [-28, -44, -60, -76]) paint.add("frame", -36, z, 8, 7, 0, PAINT, 0.25);
  // 3 RESEARCH LAB: clean white - a ring in the centre, bay frames, little else.
  paint.add("ring", 0, -133, 20, 20, 0, ICE, 0.35);
  paint.add("cross", 0, -133, 3, 3, 0, ICE, 0.5);
  paint.add("label2", 0, -116, 15, 3.8, 0, [0.5, 0.6, 0.7], 0.25);
  for (const s of [-1, 1]) for (let z = -108; z > -160; z -= 8) paint.add("frame", s * 36.5, z, 3.4, 3.4, 0, ICE, 0.4);
  // 4 QUARANTINE: red hazard border round the cell, warnings.
  const RED_PAINT: RGB = [0.9, 0.12, 0.08];
  for (let x = CELL.x0 - 3; x <= CELL.x1 + 3; x += 3) {
    paint.add("hazard", x, CELL.z0 - 2.5, 3, 1.2, 0, RED_PAINT, 0.7);
    if (Math.abs(x) > 4) paint.add("hazard", x, CELL.z1 + 2.5, 3, 1.2, 0, RED_PAINT, 0.7);
  }
  for (let z = CELL.z0 - 1; z <= CELL.z1 + 1; z += 3) for (const x of [CELL.x0 - 2.5, CELL.x1 + 2.5]) paint.add("hazard", x, z, 3, 1.2, 90, RED_PAINT, 0.7);
  for (const [x, z] of [[-24, -196], [24, -232], [26, -194], [-26, -234]]) paint.add("warning", x, z, 4, 4, 0, RED_PAINT, 0.6);
  paint.add("label3", 0, -193, 15, 3.8, 0, RED_PAINT, 0.28);
  // 5 REACTOR: hazard ring round the dais, lanes to the bays.
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    paint.add("hazard", CORE.x + Math.sin(a) * 12, CORE.z + Math.cos(a) * 12, 3.6, 1.2, (a * 180) / Math.PI, [1, 0.5, 0.08], 0.7);
  }
  paint.add("label4", 0, -278, 15, 3.8, 0, [1, 0.5, 0.08], 0.28);
  for (const s of [-1, 1]) paint.lane(s * 14, CORE.z, s * 42, CORE.z, [1, 0.5, 0.08], 0.5, 1.2, 0.8, 0.6);
  // 6 PROJECT GATE: rings round the portal.
  for (const [rad, a] of [[11, 0.22], [17, 0.15]]) paint.add("ring", PORTAL.x, PORTAL.z, rad * 2, rad * 2, 0, VIOLET, a);
  paint.add("label5", 0, -362, 15, 3.8, 0, VIOLET, 0.25);
  paint.build(app, root);

  // ------------------------------------------------------------------ floor light strips
  // Self-lit lines in the sector's colour: along the walls, and chevrons towards the way on (the
  // brightest thing on the floor, so the eye finds the exit).
  const lights = new FloorPaint([], true);
  const strip = (ax: number, az: number, bx: number, bz: number, rgb: RGB, k = 0.55) => lights.lane(ax, az, bx, bz, rgb, 0.22, 3.2, 0.8, k);
  const SECTOR_ROOMS: [keyof typeof ROOMS, RGB][] = [["dock", CYAN], ["ops", ACCENT.ops], ["lab", ICE], ["quarantine", RED], ["reactor", ORANGE]];
  for (const [id, rgb] of SECTOR_ROOMS) {
    const q = ROOMS[id], m = 1.6;
    strip(q.x0 + m, q.z1 - m, q.x0 + m, q.z0 + m, rgb);
    strip(q.x1 - m, q.z1 - m, q.x1 - m, q.z0 + m, rgb);
    strip(q.x0 + m, q.z0 + m, -DOOR - 1, q.z0 + m, rgb);
    strip(DOOR + 1, q.z0 + m, q.x1 - m, q.z0 + m, rgb);
    for (let i = 0; i < 3; i++) lights.add("chevron", 0, q.z0 + 4 + i * 3, 2.6, 2.6, 0, rgb, 0.5 - i * 0.12);
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    lights.add("dash", GATE.x + Math.sin(a) * (GATE.radius - 1.8), GATE.z + Math.cos(a) * (GATE.radius - 1.8), 1.2, 4.5, (a * 180) / Math.PI + 90, VIOLET, 0.5);
  }
  for (let i = 0; i < 3; i++) lights.add("chevron", 0, GATE.z - GATE.radius + 4 + i * 3, 2.6, 2.6, 0, VIOLET, 0.5 - i * 0.12);
  lights.build(app, root);
  return root;
}

/** Whether (x, z) lies on (within 1.4 m of) the edge of `region`. */
function onEdge(region: LevelBounds, x: number, z: number): boolean {
  const inX = x >= region.minX - 1.4 && x <= region.maxX + 1.4, inZ = z >= region.minZ - 1.4 && z <= region.maxZ + 1.4;
  const nearZ = Math.abs(z - region.minZ) < 1.4 || Math.abs(z - region.maxZ) < 1.4;
  const nearX = Math.abs(x - region.minX) < 1.4 || Math.abs(x - region.maxX) < 1.4;
  return (inX && nearZ) || (inZ && nearX);
}

/** The accent colour at z: the sector's, blending across the corridor between two sectors. */
function accentAt(z: number): RGB {
  for (let i = 0; i < SPANS.length; i++) {
    const s = SPANS[i];
    if (z <= s.z1 + 0.01 && z >= s.z0) return ACCENT[s.id];
    const next = SPANS[i + 1];
    if (next && z < s.z0 && z > next.z1) {
      const t = (s.z0 - z) / (s.z0 - next.z1);
      const a = ACCENT[s.id], b = ACCENT[next.id];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return z > 0 ? ACCENT.dock : ACCENT.asteroid;
}

/** Accent paint: lit colour and glow. */
const ACCENT_DIFFUSE = 0.35;
const ACCENT_GLOW = 0.5;

/** Chapter 2: the ORION. */
export const SHIP_BIOME: Biome<FacilityModel> = {
  id: "facility",
  label: "ORION",
  kit: { url: FACILITY.url, models: FACILITY_MODELS, brightness: FACILITY.brightness, glowIntensity: FACILITY.glowIntensity, batchCellMetres: FACILITY.batchCellMetres },
  lighting: { ...FACILITY_LIGHTING, clearColor: [0.01, 0.012, 0.02], fogStart: 60, fogEnd: 140, farClip: 160 },
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
      const region = ZONES[zoneId as SectorId]?.region;
      for (const s of world.seals) {
        s.open = -1;
        s.entity.setLocalScale(s.width, 1, SEAL_HEIGHT);
        s.entity.setLocalPosition(s.x, SEAL_HEIGHT / 2, s.z);
        s.entity.enabled = !!region && onEdge(region, s.x, s.z);
      }
      world.exitSeals = [];
      // The portal burns until the gate's level is won (and stays dead after).
      const p = world.portal;
      if (p) {
        const past = SPANS.findIndex((s) => s.id === zoneId) > SPANS.findIndex((s) => s.id === "gate");
        p.collapse = past ? 2 : -1;
        p.ring.enabled = p.disc.enabled = !past;
      }
    },
    exits(zoneId): WayPoint[] {
      const exit = ZONES[zoneId as SectorId]?.exit;
      world.exitSeals = exit ? world.seals.filter((s) => s.entity.enabled && Math.abs((exit.axis === "z" ? s.z : s.x) - exit.at) < 0.7) : [];
      // Winning the gate's level collapses the portal.
      if (zoneId === "gate" && world.portal && world.portal.collapse < 0) world.portal.collapse = 0;
      return world.exitSeals.map((s) => ({ x: s.x, z: s.z, width: s.width, yawDeg: s.yawDeg }));
    },
    openExit(_zoneId, index) {
      const s = world.exitSeals[index];
      if (s && s.open < 0 && s.entity.enabled) s.open = 0;
    },
    arena(intensity) {
      world.arena = intensity;
    },
    update(dt, hero) {
      world.time += dt;
      world.shown += (world.arena - world.shown) * Math.min(1, dt * 1.5);
      // The void rides on the camera and drifts slowly (parallax).
      const quad = world.backdrop;
      if (quad) {
        if (!world.camera) {
          world.camera = (quad.root.findByName("Camera") as Entity | null) ?? null;
          if (world.camera) { quad.reparent(world.camera); quad.enabled = true; }
        }
        const cam = world.camera?.getPosition();
        // Just inside the far plane (the map view pulls the camera far back).
        const far = world.camera?.camera?.farClip ?? VOID_DISTANCE / 0.94;
        const d = far * 0.94, side = d * 2.6;
        quad.setLocalPosition(0, 0, -d);
        quad.setLocalScale(side, 1, side);
        if (cam && world.voidMaterial) {
          world.voidMaterial.emissiveMapTiling.set(side / VOID_TILE, side / VOID_TILE);
          world.voidMaterial.emissiveMapOffset.set((cam.x * VOID_PARALLAX) / VOID_TILE, (cam.z * VOID_PARALLAX) / VOID_TILE);
          world.voidMaterial.update();
        }
      }
      // Accent paint takes the colour of the sector the hero is in.
      const accent = world.accent;
      if (accent) {
        const want = accentAt(hero.z), now = world.accentNow;
        const k = Math.min(1, dt * 3);
        let moved = false;
        for (let i = 0; i < 3; i++) {
          const d = want[i] - now[i];
          if (Math.abs(d) > 0.002) { now[i] += d * k; moved = true; }
        }
        if (moved || world.time < 0.2) {
          accent.diffuse.set(now[0] * ACCENT_DIFFUSE, now[1] * ACCENT_DIFFUSE, now[2] * ACCENT_DIFFUSE);
          accent.emissive.set(now[0] * ACCENT_GLOW, now[1] * ACCENT_GLOW, now[2] * ACCENT_GLOW);
          accent.update();
        }
      }
      // Barriers shimmer (and flare red while a boss rages).
      const m = world.barrier;
      if (m) {
        const k = 1 + Math.sin(world.time * 6) * 0.15;
        m.emissive.set((0.25 + world.shown * 0.9) * k, 0.8 * (1 - world.shown * 0.6) * k, 1.2 * (1 - world.shown * 0.7) * k);
        m.update();
      }
      // The portal swirls (harder with the arena), then collapses once the gate's level is won.
      const p = world.portal;
      if (p && p.collapse < 2) {
        p.disc.setLocalEulerAngles(90, 0, world.time * (40 + world.shown * 80));
        let scale = 1 + Math.sin(world.time * 2.3) * 0.03;
        if (p.collapse >= 0) {
          p.collapse = Math.min(2, p.collapse + dt / 1.6);
          // Flares, then shrinks to nothing.
          scale = p.collapse < 0.3 ? 1 + p.collapse * 1.2 : Math.max(0, 1.36 * (1 - (p.collapse - 0.3) / 0.9));
          if (p.collapse >= 1.2) { p.ring.enabled = p.disc.enabled = false; p.collapse = 2; }
        }
        const k = 0.9 + world.shown * 0.8;
        p.mat.emissive.set(VIOLET[0] * k, VIOLET[1] * k, VIOLET[2] * k);
        p.mat.update();
        const d = PORTAL.radius * 1.8 * scale;
        p.disc.setLocalScale(d, 1, d);
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
