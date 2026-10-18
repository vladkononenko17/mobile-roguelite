import * as THREE from "three";

/**
 * Low-poly models for «Не клюёт», built from primitives in code: flat shading,
 * an inverted-hull ink outline and the Neon Hollow palette. No external assets.
 */

export const C = {
  ink: 0x171318,
  paper: 0xe7ddc6,
  yellow: 0xf2b632,
  orange: 0xe8602f,
  red: 0xd63732,
  acid: 0xb8d84a,
  blue: 0x54b7c6,
  skin: 0xe0a77d,
  olive: 0x5f6e37,
  denim: 0x3d4f6e,
  boot: 0x3a2f2b,
  vest: 0xb0915b,
  shirt: 0x3e6ea0,
  khaki: 0x4a5541,
  hat: 0xd8c49a,
  wood: 0x7a5232,
  tin: 0x9aa3a6,
  grass: 0x6f8f3e,
  dirt: 0x8c6d47,
  water: 0x3f8f95,
  pine: 0x2f5a3c,
};

const matCache = new Map<number, THREE.MeshLambertMaterial>();
export function mat(color: number): THREE.MeshLambertMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    matCache.set(color, m);
  }
  return m;
}

const inkMat = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });

/** Add an ink outline as a slightly larger back-face shell. */
export function outline(mesh: THREE.Mesh, thickness = 0.025): THREE.Mesh {
  mesh.geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  mesh.geometry.boundingBox!.getSize(size);
  const hull = new THREE.Mesh(mesh.geometry, inkMat);
  hull.scale.set(
    1 + (2 * thickness) / Math.max(size.x, 0.01),
    1 + (2 * thickness) / Math.max(size.y, 0.01),
    1 + (2 * thickness) / Math.max(size.z, 0.01),
  );
  const center = new THREE.Vector3();
  mesh.geometry.boundingBox!.getCenter(center);
  hull.position.set(center.x * (1 - hull.scale.x), center.y * (1 - hull.scale.y), center.z * (1 - hull.scale.z));
  hull.name = "hull";
  mesh.add(hull);
  return mesh;
}

export function mesh(geometry: THREE.BufferGeometry, color: number, ink = 0.025, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geometry, mat(color));
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (ink > 0) outline(m, ink);
  return m;
}

export function at<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, parent?: THREE.Object3D): T {
  obj.position.set(x, y, z);
  parent?.add(obj);
  return obj;
}

/** A cylinder stretched between two points, re-aimable every frame for arms. */
export class Limb {
  readonly mesh: THREE.Mesh;
  private hull: THREE.Mesh;
  private radius: number;
  private static up = new THREE.Vector3(0, 1, 0);

  constructor(parent: THREE.Object3D, radius: number, color: number) {
    this.radius = radius;
    const geo = new THREE.CylinderGeometry(radius, radius * 0.9, 1, 6, 1);
    this.mesh = new THREE.Mesh(geo, mat(color));
    this.mesh.castShadow = true;
    this.hull = new THREE.Mesh(geo, inkMat);
    this.mesh.add(this.hull);
    parent.add(this.mesh);
  }

  set(a: THREE.Vector3, b: THREE.Vector3): void {
    const dir = b.clone().sub(a);
    const len = Math.max(0.001, dir.length());
    this.mesh.position.copy(a).addScaledVector(dir, 0.5);
    this.mesh.quaternion.setFromUnitVectors(Limb.up, dir.normalize());
    this.mesh.scale.set(1, len, 1);
    const t = 0.022;
    this.hull.scale.set(1 + t / this.radius, 1 + (2 * t) / len, 1 + t / this.radius);
  }
}

// ------------------------------------------------------------------ people

export interface Fisher {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  skin: THREE.MeshLambertMaterial;
  armR: Limb;
  armL: Limb;
  handR: THREE.Mesh;
  handL: THREE.Mesh;
  shoulderR: THREE.Vector3;
  shoulderL: THREE.Vector3;
  face?: THREE.Group;
}

function stool(parent: THREE.Object3D, width: number): void {
  const seat = mesh(new THREE.BoxGeometry(width, 0.05, 0.36), 0x2f4f45, 0.018);
  at(seat, 0, 0.44, 0, parent);
  for (const s of [-1, 1]) {
    const legA = new Limb(parent, 0.02, C.wood);
    legA.set(new THREE.Vector3(s * width * 0.45, 0.42, -0.15), new THREE.Vector3(s * width * 0.45, 0, 0.17));
    const legB = new Limb(parent, 0.02, C.wood);
    legB.set(new THREE.Vector3(s * width * 0.45, 0.42, 0.15), new THREE.Vector3(s * width * 0.45, 0, -0.17));
  }
}

function legs(parent: THREE.Object3D, spread: number, pants: number): void {
  for (const s of [-1, 1]) {
    const thigh = new Limb(parent, 0.085, pants);
    const hip = new THREE.Vector3(s * spread, 0.52, 0.02);
    const knee = new THREE.Vector3(s * (spread + 0.04), 0.56, -0.42);
    const ankle = new THREE.Vector3(s * (spread + 0.05), 0.1, -0.5);
    thigh.set(hip, knee);
    const shin = new Limb(parent, 0.075, pants);
    shin.set(knee, ankle);
    const boot = mesh(new THREE.BoxGeometry(0.14, 0.12, 0.26), C.boot, 0.018);
    at(boot, s * (spread + 0.05), 0.06, -0.56, parent);
  }
}

/** The hero: orange watch cap, camo jacket. Faces -z, toward the river. */
export function makeHero(): Fisher {
  const root = new THREE.Group();
  stool(root, 0.46);
  const body = new THREE.Group();
  root.add(body);
  legs(body, 0.11, C.denim);
  const torso = mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.6, 7, 1), C.olive);
  at(torso, 0, 0.78, 0, body).rotation.x = -0.16;
  // Camo patches.
  for (const [x, y, z, c] of [[0.12, 0.85, 0.2, 0x4a5a2b], [-0.14, 0.7, 0.21, 0x7a8a4a], [0.02, 0.62, 0.25, 0x4a5a2b]] as const) {
    const patch = mesh(new THREE.IcosahedronGeometry(0.06, 0), c, 0);
    patch.scale.set(1.3, 0.8, 0.35);
    at(patch, x, y, z, body);
  }
  const collar = mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.08, 7), 0x4f5c2e, 0.02);
  at(collar, 0, 1.08, -0.04, body);

  const head = new THREE.Group();
  at(head, 0, 1.25, -0.04, body);
  const skin = new THREE.MeshLambertMaterial({ color: C.skin, flatShading: true });
  const skull = outline(new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), skin), 0.02);
  skull.castShadow = true;
  skull.scale.set(1, 1.08, 1);
  head.add(skull);
  for (const s of [-1, 1]) at(outline(new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), skin), 0.012), s * 0.16, 0, 0.01, head);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 4), skin);
  at(nose, 0, -0.02, -0.17, head).rotation.x = -Math.PI / 2;
  const cap = mesh(new THREE.SphereGeometry(0.175, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), C.orange, 0.02);
  at(cap, 0, 0.03, 0.01, head);
  const brim = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.07, 7, 1, true), 0xc94f24, 0.018);
  at(brim, 0, 0.04, 0.01, head);
  const pom = mesh(new THREE.IcosahedronGeometry(0.045, 0), C.yellow, 0.014);
  at(pom, 0, 0.2, 0.01, head);

  const armR = new Limb(body, 0.07, C.olive);
  const armL = new Limb(body, 0.07, C.olive);
  const handR = mesh(new THREE.IcosahedronGeometry(0.055, 0), C.skin, 0.014);
  const handL = mesh(new THREE.IcosahedronGeometry(0.055, 0), C.skin, 0.014);
  body.add(handR, handL);
  return {
    root, body, head, skin, armR, armL, handR, handL,
    shoulderR: new THREE.Vector3(0.24, 1.0, -0.02),
    shoulderL: new THREE.Vector3(-0.24, 1.0, -0.02),
  };
}

/** Tolik: bigger, safari vest over a blue shirt, bucket hat and a moustache. */
export function makeFriend(): Fisher {
  const root = new THREE.Group();
  stool(root, 0.52);
  const body = new THREE.Group();
  root.add(body);
  legs(body, 0.13, C.khaki);
  const torso = mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.62, 7, 1), C.shirt);
  at(torso, 0, 0.8, 0, body).rotation.x = -0.12;
  const belly = mesh(new THREE.IcosahedronGeometry(0.26, 1), C.shirt, 0.02);
  belly.scale.set(1, 0.85, 0.9);
  at(belly, 0, 0.66, -0.08, body);
  const vest = mesh(new THREE.CylinderGeometry(0.26, 0.335, 0.5, 7, 1, true), C.vest, 0.02);
  at(vest, 0, 0.82, 0, body).rotation.x = -0.12;
  for (const [x, y] of [[0.17, 0.78], [-0.17, 0.78], [0.18, 0.92], [-0.18, 0.92]]) {
    const pocket = mesh(new THREE.BoxGeometry(0.11, 0.1, 0.04), 0x8f7446, 0.012);
    at(pocket, x, y, 0.26, body).rotation.y = x > 0 ? 0.5 : -0.5;
  }
  const head = new THREE.Group();
  at(head, 0, 1.3, -0.04, body);
  const skin = new THREE.MeshLambertMaterial({ color: C.skin, flatShading: true });
  const skull = outline(new THREE.Mesh(new THREE.IcosahedronGeometry(0.175, 1), skin), 0.02);
  skull.castShadow = true;
  skull.scale.set(1, 1.05, 1);
  head.add(skull);
  for (const s of [-1, 1]) at(outline(new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), skin), 0.012), s * 0.175, 0, 0.01, head);
  // Face sits on the -z side; it shows when he turns round.
  const face = new THREE.Group();
  head.add(face);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 4), skin);
  at(nose, 0, -0.02, -0.19, face).rotation.x = -Math.PI / 2;
  const tache = mesh(new THREE.BoxGeometry(0.2, 0.05, 0.06), 0x5a3a24, 0.012);
  at(tache, 0, -0.08, -0.16, face);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.02), mat(C.ink));
    eye.name = "eye";
    at(eye, s * 0.065, 0.03, -0.165, face);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.02), mat(C.ink));
    brow.name = "brow";
    at(brow, s * 0.065, 0.085, -0.16, face).rotation.z = s * -0.25;
  }
  const crown = mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.13, 7), C.hat, 0.02);
  at(crown, 0, 0.13, 0, head);
  const rim = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 9), 0xc8b385, 0.016);
  at(rim, 0, 0.07, 0, head).rotation.x = 0.08;
  const band = mesh(new THREE.CylinderGeometry(0.165, 0.18, 0.04, 7), 0x7f6a45, 0);
  at(band, 0, 0.1, 0, head);

  const armR = new Limb(body, 0.08, C.shirt);
  const armL = new Limb(body, 0.08, C.shirt);
  const handR = mesh(new THREE.IcosahedronGeometry(0.06, 0), C.skin, 0.014);
  const handL = mesh(new THREE.IcosahedronGeometry(0.06, 0), C.skin, 0.014);
  body.add(handR, handL);
  return {
    root, body, head, skin, armR, armL, handR, handL, face,
    shoulderR: new THREE.Vector3(0.29, 1.04, -0.02),
    shoulderL: new THREE.Vector3(-0.29, 1.04, -0.02),
  };
}

// ------------------------------------------------------------------- props

export function makeBucket(): THREE.Group {
  const g = new THREE.Group();
  const shell = mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 8, 1, true), C.tin, 0.02);
  (shell.material as THREE.Material).side = THREE.DoubleSide;
  at(shell, 0, 0.15, 0, g);
  const bottom = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 8), 0x7d8588, 0);
  at(bottom, 0, 0.01, 0, g);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.19, 8), mat(0x24434a));
  water.rotation.x = -Math.PI / 2;
  at(water, 0, 0.25, 0, g);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 4, 10, Math.PI), mat(C.ink));
  at(handle, 0, 0.29, 0, g).rotation.y = 0.3;
  return g;
}

export function makeCooler(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(0.55, 0.32, 0.36), C.blue), 0, 0.16, 0, g);
  at(mesh(new THREE.BoxGeometry(0.58, 0.08, 0.39), C.paper), 0, 0.36, 0, g);
  at(mesh(new THREE.BoxGeometry(0.24, 0.05, 0.08), 0x2c3036, 0.012), 0, 0.42, 0, g);
  return g;
}

export function makeCan(): THREE.Mesh {
  const can = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.13, 8), 0xc9a227, 0.01);
  at(mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.05, 8), C.red, 0), 0, 0, 0, can);
  return can;
}

export function makePhone(): THREE.Mesh {
  const phone = mesh(new THREE.BoxGeometry(0.09, 0.17, 0.015), 0x22252b, 0.008);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.15), new THREE.MeshBasicMaterial({ color: 0x9a6bd1 }));
  at(screen, 0, 0, 0.009, phone);
  return phone;
}

export function makeCig(): THREE.Group {
  const g = new THREE.Group();
  const stick = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 5), C.paper, 0.004);
  stick.rotation.x = Math.PI / 2;
  g.add(stick);
  const ember = new THREE.Mesh(new THREE.IcosahedronGeometry(0.011, 0), new THREE.MeshBasicMaterial({ color: 0xff7a2a }));
  at(ember, 0, 0, -0.04, g);
  return g;
}

export function makeBobber(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.ConeGeometry(0.06, 0.12, 6), C.red, 0.012), 0, 0.06, 0, g);
  const bottom = mesh(new THREE.ConeGeometry(0.06, 0.14, 6), C.paper, 0.012);
  bottom.rotation.x = Math.PI;
  at(bottom, 0, -0.07, 0, g);
  at(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4), C.ink, 0), 0, 0.15, 0, g);
  return g;
}

/** Low-poly fish: faceted body, tail and dorsal fin. Long variant for pike/zander. */
export function makeFish(color: number, kind: "fish" | "long" | "cat"): THREE.Group {
  const g = new THREE.Group();
  const length = kind === "fish" ? 1 : 1.5;
  const body = mesh(new THREE.IcosahedronGeometry(0.12, 1), color, 0.012, false);
  body.scale.set(length * 1.6, kind === "fish" ? 1 : 0.62, 0.5);
  g.add(body);
  const tail = mesh(new THREE.ConeGeometry(0.09, 0.12, 4), color, 0.01, false);
  tail.rotation.z = Math.PI / 2;
  at(tail, 0.2 * length + 0.04, 0, 0, g);
  const fin = mesh(new THREE.ConeGeometry(0.05, 0.08, 3), color, 0.008, false);
  at(fin, -0.02, kind === "fish" ? 0.12 : 0.08, 0, g);
  if (kind === "cat") {
    for (const s of [-1, 1]) {
      const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 3), mat(C.ink));
      whisker.rotation.z = 0.9;
      at(whisker, -0.27, -0.03, s * 0.03, g);
    }
  }
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.13), mat(C.ink));
  at(eye, -0.12 * length, 0.03, 0, g);
  return g;
}

export const FISH_LOOK: Record<string, { kind: "fish" | "long" | "cat" | "junk"; color: number }> = {
  "ЁРШ": { kind: "fish", color: 0xa58d5c },
  "ПЛОТВА": { kind: "fish", color: 0xd7dde0 },
  "ОКУНЬ": { kind: "fish", color: 0x9cbc4a },
  "КАРАСЬ": { kind: "fish", color: 0xe7b84a },
  "ЛЕЩ": { kind: "fish", color: 0xc4a067 },
  "СУДАК": { kind: "long", color: 0xaab7a4 },
  "ЩУКА": { kind: "long", color: 0x7fa04a },
  "СОМ": { kind: "cat", color: 0x6b6f5a },
};

// ------------------------------------------------------------- environment

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makePine(r: () => number, height: number): THREE.Group {
  const g = new THREE.Group();
  const green = [0x2f5a3c, 0x376643, 0x2a4f37, 0x3f704a][Math.floor(r() * 4)];
  at(mesh(new THREE.CylinderGeometry(0.08, 0.12, height * 0.3, 5), 0x5a3d28, 0, false), 0, height * 0.15, 0, g);
  for (let i = 0; i < 3; i++) {
    const tier = mesh(new THREE.ConeGeometry(height * (0.32 - i * 0.07), height * 0.42, 6), green, 0.035, true);
    at(tier, 0, height * (0.38 + i * 0.2), 0, g);
    tier.rotation.y = r() * 3;
  }
  return g;
}

export interface Environment {
  group: THREE.Group;
  water: THREE.Mesh;
  waterBase: Float32Array;
  sky: THREE.Mesh;
  skyColors: THREE.BufferAttribute;
  bush: THREE.Group;
  sun: THREE.Mesh;
  clouds: THREE.Group[];
  /** Ice levels: the water is a frozen sheet with holes. */
  frozen: boolean;
  /** Lights that flicker (campfire) — the scene animates their intensity. */
  flicker: THREE.PointLight[];
  /** Hazard props the scene moves around: boat, jetski, drone. */
  boat: THREE.Group;
  jetski: THREE.Group;
  drone: THREE.Group;
  crowd: THREE.Group[];
  steam: THREE.Vector3[];
}

export const WATER_EDGE_Z = -2.2;

export type ThemeId = "dacha" | "garages" | "quarry" | "night" | "plant" | "paid" | "ice" | "swamp" | "reserve" | "champ";

interface Palette {
  water: number;
  grass: number;
  dirt: number;
  mud: number;
  shore: number;
  hills: number[];
  pines: number[];
  snow?: boolean;
  trees: number;
  reeds: boolean;
}

const PALETTES: Record<ThemeId, Palette> = {
  dacha: { water: 0x3f8f95, grass: 0x6f8f3e, dirt: 0x8c6d47, mud: 0x4f5a30, shore: 0x4a6b3a, hills: [0x7f9c6a, 0x739160, 0x8aa875], pines: [0x2f5a3c, 0x376643], trees: 46, reeds: true },
  garages: { water: 0x4d6b62, grass: 0x6b7a40, dirt: 0x6d5f4f, mud: 0x3f3a2c, shore: 0x55594a, hills: [0x77806a, 0x6a735e], pines: [0x2f4a3c, 0x3a5040], trees: 14, reeds: true },
  quarry: { water: 0x2fb3c2, grass: 0x8f9a4e, dirt: 0xd8b878, mud: 0xc9a565, shore: 0xd9bd80, hills: [0xe0c58a, 0xd4b273, 0xc9a465], pines: [0x2f5a3c], trees: 12, reeds: false },
  night: { water: 0x1d4a5c, grass: 0x3e5a2c, dirt: 0x5c4a35, mud: 0x2f3a20, shore: 0x2b3f25, hills: [0x2e4436, 0x283d30], pines: [0x1c3326, 0x22402c], trees: 40, reeds: true },
  plant: { water: 0x5fae6c, grass: 0x6b7a3a, dirt: 0x7a6a50, mud: 0x4a5530, shore: 0x5c6650, hills: [0x8a8f78, 0x7a8068], pines: [0x3a5038], trees: 10, reeds: true },
  paid: { water: 0x4f9a8a, grass: 0x7aa045, dirt: 0x9a7a52, mud: 0x5a6a35, shore: 0x5f8040, hills: [0x86a86e, 0x7c9a62], pines: [0x2f5a3c, 0x376643], trees: 24, reeds: false },
  ice: { water: 0xdfeef5, grass: 0xf2f6f8, dirt: 0xe4ecf0, mud: 0xd5e2ea, shore: 0xeef4f7, hills: [0xdfe8ee, 0xd2dde5], pines: [0x2a4a3a, 0x30503f], snow: true, trees: 40, reeds: false },
  swamp: { water: 0x4a5a30, grass: 0x55602e, dirt: 0x4f4632, mud: 0x3a3a22, shore: 0x3d4a28, hills: [0x5a6448, 0x4f5a40], pines: [0x2a3d28], trees: 8, reeds: true },
  reserve: { water: 0x2f7f8a, grass: 0x5f8a38, dirt: 0x7a6440, mud: 0x45552c, shore: 0x3f6232, hills: [0x5f8a58, 0x557e4e], pines: [0x1f4a30, 0x2a5838], trees: 70, reeds: true },
  champ: { water: 0x3a92a8, grass: 0x7aa045, dirt: 0xd9c08a, mud: 0xc9ad74, shore: 0xd9c08a, hills: [0x8aa878, 0x7f9c6a], pines: [0x2f5a3c], trees: 16, reeds: false },
};

/** Text on a sign, drawn into a canvas texture. */
export function makeSign(text: string, w: number, h: number, bg = "#e7ddc6", fg = "#171318"): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.round(512 * (h / w));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#171318";
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
  ctx.fillStyle = fg;
  const lines = text.split("\n");
  const size = Math.min(canvas.height / (lines.length + 0.6), 96);
  ctx.font = `700 ${size}px Oswald, "Arial Narrow", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * size * 1.05, canvas.width - 40));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  return sign;
}

function signOnPosts(text: string, w: number, h: number, bg?: string, fg?: string): THREE.Group {
  const g = new THREE.Group();
  const board = makeSign(text, w, h, bg, fg);
  at(board, 0, 1.1 + h / 2, 0.03, g);
  const back = mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.05), C.wood, 0.02, false);
  at(back, 0, 1.1 + h / 2, 0, g);
  for (const s of [-1, 1]) at(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2 + h, 5), C.wood, 0.015), s * (w / 2 - 0.1), (1.2 + h) / 2, -0.04, g);
  return g;
}

function makeHouse(r: () => number, color: number, roof: number, w = 3, d = 3, hgt = 2.2): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(w, hgt, d), color, 0.04), 0, hgt / 2, 0, g);
  const roofGeo = new THREE.CylinderGeometry(0.01, w * 0.78, 1.3, 4, 1);
  const rf = mesh(roofGeo, roof, 0.04);
  rf.rotation.y = Math.PI / 4;
  rf.scale.z = d / w;
  at(rf, 0, hgt + 0.65, 0, g);
  at(mesh(new THREE.BoxGeometry(0.6, 1.2, 0.05), 0x5a3a24, 0.015), w * 0.15, 0.6, d / 2 + 0.03, g);
  at(mesh(new THREE.BoxGeometry(0.6, 0.5, 0.05), 0x9fd0e0, 0.015), -w * 0.25, hgt * 0.6, d / 2 + 0.03, g);
  void r;
  return g;
}

function makeGarage(color: number): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(3, 2.4, 5), color, 0.05), 0, 1.2, 0, g);
  at(mesh(new THREE.BoxGeometry(2.4, 2, 0.08), 0x6a5a48, 0.02), 0, 1.05, 2.52, g);
  at(mesh(new THREE.BoxGeometry(3.2, 0.15, 5.2), 0x3a3a3a, 0.02), 0, 2.45, 0, g);
  return g;
}

function makeChimney(h: number, stripes = true): THREE.Group {
  const g = new THREE.Group();
  const n = stripes ? 6 : 1;
  for (let i = 0; i < n; i++) {
    const seg = mesh(new THREE.CylinderGeometry(1.1 - i * 0.08, 1.2 - i * 0.08, h / n, 8), stripes ? (i % 2 ? 0xd63732 : 0xe7ddc6) : 0x9aa3a6, 0.08, false);
    at(seg, 0, h / n * (i + 0.5), 0, g);
  }
  return g;
}

export function makePerson(color: number, r: () => number): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 6), color, 0.02), 0, 0.45, 0, g);
  at(mesh(new THREE.IcosahedronGeometry(0.17, 0), C.skin, 0.015), 0, 1.05, 0, g);
  if (r() < 0.5) at(mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.1, 6), [0xd63732, 0xf2b632, 0x54b7c6][Math.floor(r() * 3)], 0.01), 0, 1.2, 0, g);
  return g;
}

function makeBoat(): THREE.Group {
  const g = new THREE.Group();
  const hull = mesh(new THREE.BoxGeometry(3.2, 0.6, 1.3), 0xe7ddc6, 0.04);
  at(hull, 0, 0.1, 0, g);
  at(mesh(new THREE.BoxGeometry(1, 0.7, 0.9), 0x3e6ea0, 0.03), -0.4, 0.75, 0, g);
  const light = mesh(new THREE.BoxGeometry(0.25, 0.15, 0.3), 0x3a7bff, 0.01, false);
  light.name = "siren";
  at(light, -0.4, 1.2, 0, g);
  at(makeSign("РЫБНАДЗОР", 1.6, 0.35, "#e7ddc6", "#3e6ea0"), 0.2, 0.3, 0.67, g);
  at(makePerson(0x2e3b2a, rng(5)), 0.9, 0.35, 0, g);
  g.visible = false;
  return g;
}

function makeJetski(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.ConeGeometry(0.45, 2, 5), 0xd63732, 0.03);
  body.rotation.z = Math.PI / 2;
  at(body, 0, 0.25, 0, g);
  at(makePerson(0xf2b632, rng(9)), 0.2, 0.2, 0, g);
  g.visible = false;
  return g;
}

function makeDrone(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), 0x22252b, 0.015), 0, 0, 0, g);
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    const rotor = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 8), 0x9aa3a6, 0.008);
    rotor.name = "rotor";
    at(rotor, x, 0.08, z, g);
  }
  const led = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), new THREE.MeshBasicMaterial({ color: 0xff3a2a }));
  at(led, 0, -0.06, 0.2, g);
  g.visible = false;
  return g;
}

function makeDeadTree(r: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = 3 + r() * 3;
  at(mesh(new THREE.CylinderGeometry(0.08, 0.2, h, 5), 0x4a3f30, 0.03, false), 0, h / 2, 0, g).rotation.z = (r() - 0.5) * 0.3;
  for (let i = 0; i < 3; i++) {
    const br = mesh(new THREE.CylinderGeometry(0.03, 0.07, 1.2, 4), 0x4a3f30, 0.02, false);
    br.rotation.z = (r() - 0.5) * 2.2;
    at(br, (r() - 0.5) * 0.5, h * (0.5 + i * 0.15), 0, g);
  }
  return g;
}

export function makeEnvironment(theme: ThemeId = "dacha"): Environment {
  const r = rng(20261018 + theme.length * 7919);
  const P = PALETTES[theme];
  const group = new THREE.Group();
  const flicker: THREE.PointLight[] = [];
  const crowd: THREE.Group[] = [];
  const steam: THREE.Vector3[] = [];

  // Sky dome with vertex-colour gradient (recoloured over the day).
  const skyGeo = new THREE.SphereGeometry(120, 16, 10);
  const skyColors = new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3);
  skyGeo.setAttribute("color", skyColors);
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  group.add(sky);

  const sun = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 0), new THREE.MeshBasicMaterial({ color: theme === "night" ? 0xe7ecf5 : 0xffd76a, fog: false }));
  outline(sun, 0.25);
  group.add(sun);

  const clouds: THREE.Group[] = [];
  for (let i = 0; i < (theme === "night" ? 1 : 4); i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = mesh(new THREE.IcosahedronGeometry(1.4 + r() * 1.2, 0), theme === "plant" ? 0xb8b39a : 0xf4f1e6, 0.12, false);
      puff.scale.y = 0.55;
      at(puff, j * 1.8 - 2.7, r() * 0.6, r() * 0.8, cloud);
    }
    at(cloud, -30 + i * 20, 16 + r() * 7, -70 - r() * 10, group);
    clouds.push(cloud);
  }
  if (theme === "night") {
    // Stars.
    const starGeo = new THREE.BufferGeometry();
    const sp: number[] = [];
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2;
      const e = 0.12 + r() * 1.2;
      sp.push(Math.cos(a) * Math.cos(e) * 110, Math.sin(e) * 110, -Math.abs(Math.sin(a) * Math.cos(e) * 110));
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, fog: false })));
  }

  // Water: a faceted plane whose vertices bob every frame (or a frozen sheet).
  const frozen = theme === "ice";
  const waterGeo = new THREE.PlaneGeometry(90, 70, 36, 26).toNonIndexed();
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate(0, 0, (frozen ? WATER_EDGE_Z + 2 : WATER_EDGE_Z) - 35);
  const pos = waterGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, frozen ? -0.02 + r() * 0.03 : -0.08);
  const waterMat = new THREE.MeshStandardMaterial({ color: P.water, flatShading: true, roughness: frozen ? 0.35 : 0.7, metalness: 0 });
  if (theme === "plant") { waterMat.emissive = new THREE.Color(0x2fd05a); waterMat.emissiveIntensity = 0.25; }
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.receiveShadow = true;
  group.add(water);
  const waterBase = new Float32Array(pos.array as Float32Array);
  if (frozen) waterGeo.computeVertexNormals();

  // Near bank: jittered low-poly ground that slopes into the water.
  const groundGeo = new THREE.PlaneGeometry(40, 20, 30, 22);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(0, 0, WATER_EDGE_Z + 6);
  const gp = groundGeo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const cGrass = new THREE.Color(P.grass);
  const cDirt = new THREE.Color(P.dirt);
  const cMud = new THREE.Color(P.mud);
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const edge = z - WATER_EDGE_Z;
    let y = frozen ? (edge < 0 ? -0.2 : (r() - 0.5) * 0.06) : edge < 0 ? -0.5 + edge * 0.05 : edge < 0.9 ? -0.3 + edge * 0.33 : (r() - 0.5) * 0.08;
    if (Math.abs(x) > 3) y += (Math.abs(x) - 3) * 0.06 + r() * 0.1;
    gp.setY(i, y);
    const dirt = Math.max(0, 1 - Math.hypot(x / 2.6, (z - 0.2) / 1.4));
    const c = edge < 0.9 && !frozen ? cMud : cGrass.clone().lerp(cDirt, Math.min(1, dirt * 1.6)).multiplyScalar(0.92 + r() * 0.14);
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(groundGeo.toNonIndexed(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  ground.receiveShadow = true;
  group.add(ground);

  // Far bank: hills, a strip of shore, and trees.
  const far = -34;
  at(mesh(new THREE.BoxGeometry(120, 0.6, 6), P.shore, 0, false), 0, 0, far - 2, group);
  const hillCount = theme === "quarry" ? 9 : 7;
  for (let i = 0; i < hillCount; i++) {
    const hill = theme === "quarry"
      ? mesh(new THREE.CylinderGeometry(8 + r() * 6, 12 + r() * 6, 10 + r() * 8, 6), P.hills[i % P.hills.length], 0.15, false)
      : mesh(new THREE.ConeGeometry(14 + r() * 10, 8 + r() * 9, 5), P.hills[i % P.hills.length], 0, false);
    at(hill, -48 + i * (96 / hillCount) + r() * 6, theme === "quarry" ? 4 : 3, far - (theme === "quarry" ? 8 : 18) - r() * 12, group).rotation.y = r() * 3;
  }
  const treeMaker = theme === "swamp" ? () => makeDeadTree(r) : () => makePine(r, 2.5 + r() * 3.2);
  for (let i = 0; i < P.trees; i++) {
    const t = treeMaker();
    if (P.snow) t.children.slice(1).forEach((c) => { ((c as THREE.Mesh).material as THREE.MeshLambertMaterial) = mat(0xeef4f7); });
    at(t, -40 + r() * 80, 0.2, far - 1 - r() * 7, group);
  }
  // Near-bank trees framing the shot, and the bush Tolik disappears into.
  for (const [x, z, h] of [[-5.2, 1.5, 4.8], [5.8, 2.2, 5.4], [-7.5, -0.5, 6.2], [7.8, 0.5, 6]] as const) {
    const t = theme === "swamp" ? makeDeadTree(r) : makePine(r, h);
    if (P.snow) t.children.slice(1).forEach((c) => { ((c as THREE.Mesh).material as THREE.MeshLambertMaterial) = mat(0xeef4f7); });
    at(t, x, 0.1, z, group);
  }
  const bush = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const blob = mesh(new THREE.IcosahedronGeometry(0.5 + r() * 0.3, 0), P.snow ? (i % 2 ? 0xdfe8ee : 0xeef4f7) : i % 2 ? 0x3f6a33 : 0x4f7d3b, 0.03);
    at(blob, (r() - 0.5) * 1.2, 0.4 + r() * 0.4, (r() - 0.5) * 0.8, bush);
  }
  at(bush, 3.6, 0, 0.6, group);
  if (P.reeds) {
    for (let i = 0; i < 26; i++) {
      const x = -9 + r() * 18;
      if (Math.abs(x) < 2.6) continue;
      const reed = mesh(new THREE.ConeGeometry(0.04, 0.9 + r() * 0.7, 3), theme === "swamp" ? 0x6a6a30 : 0x6f8a3a, 0, false);
      at(reed, x, 0.2, WATER_EDGE_Z + 0.2 + r() * 0.5, group).rotation.z = (r() - 0.5) * 0.3;
      if (r() < 0.35) at(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 5), 0x6b4a2e, 0.012, false), x, 0.95, reed.position.z, group);
    }
  }

  // ---- theme props
  switch (theme) {
    case "dacha": {
      at(makeHouse(r, 0xd9c08a, 0xa83a2a), -7.5, 0, 4.5, group).rotation.y = 0.5;
      for (let i = 0; i < 9; i++) at(mesh(new THREE.BoxGeometry(0.12, 1, 0.05), 0x9a7a52, 0.012), -9 + i * 0.4, 0.5, 2.8, group);
      const gh = mesh(new THREE.CylinderGeometry(1, 1, 3, 6, 1, true, 0, Math.PI), 0xcfe6e0, 0.02);
      gh.rotation.z = Math.PI / 2;
      at(gh, 7, 0, 4.5, group);
      break;
    }
    case "garages": {
      const colors = [0x7a5a3a, 0x5a6a7a, 0x8a4a3a, 0x6a6a5a, 0x4a5a4a];
      for (let i = 0; i < 12; i++) at(makeGarage(colors[i % colors.length]), -26 + i * 3.4, 0.3, far + 1, group);
      at(signOnPosts("ГСК «МОТОР»\nПОСТОРОННИМ ВЪЕЗД ЗАПРЕЩЁН", 2.2, 0.9), -4.6, 0, 2.6, group).rotation.y = 0.35;
      for (let i = 0; i < 3; i++) {
        const tyre = mesh(new THREE.TorusGeometry(0.35, 0.14, 5, 8), 0x1f1f1f, 0.015);
        tyre.rotation.x = Math.PI / 2;
        at(tyre, 4.5 + i * 0.2, 0.14 + i * 0.26, 1.8, group);
      }
      const barrel = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8), 0x7a3a2a, 0.02);
      at(barrel, -3.6, 0.4, 1.4, group);
      const fire = new THREE.PointLight(0xff8a3a, 1.5, 5);
      at(fire, -3.6, 1.1, 1.4, group);
      flicker.push(fire);
      steam.push(new THREE.Vector3(-3.6, 1, 1.4));
      break;
    }
    case "quarry":
      at(signOnPosts("КУПАНИЕ ЗАПРЕЩЕНО\nВСЁ ЗАПРЕЩЕНО", 2, 0.8), 4.8, 0, 2.4, group).rotation.y = -0.4;
      break;
    case "night": {
      const tent = mesh(new THREE.ConeGeometry(1.4, 1.6, 4), 0x3e6ea0, 0.03);
      at(tent, -5.6, 0.8, 2.6, group).rotation.y = 0.8;
      for (let i = 0; i < 5; i++) {
        const log = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 5), 0x5a3a24, 0.015);
        log.rotation.set(Math.PI / 2.4, (i / 5) * Math.PI * 2, 0);
        at(log, -2.9, 0.18, 1.5, group);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 5), new THREE.MeshBasicMaterial({ color: 0xffa83a }));
      flame.name = "flame";
      at(flame, -2.9, 0.5, 1.5, group);
      const fire = new THREE.PointLight(0xff9a4a, 3, 9);
      at(fire, -2.9, 1, 1.5, group);
      flicker.push(fire);
      steam.push(new THREE.Vector3(-2.9, 0.9, 1.5));
      break;
    }
    case "plant": {
      for (let i = 0; i < 3; i++) {
        at(makeChimney(22 + i * 4), -18 + i * 9, 0, far - 8, group);
        steam.push(new THREE.Vector3(-18 + i * 9, 24 + i * 4, far - 8));
      }
      const tower = mesh(new THREE.CylinderGeometry(5, 7, 14, 10, 1, true), 0x9aa3a6, 0.1, false);
      at(tower, 18, 7, far - 10, group);
      steam.push(new THREE.Vector3(18, 14, far - 10));
      at(signOnPosts("ГРЭС-2\nКУПАТЬСЯ НЕЛЬЗЯ\nЛОВИТЬ МОЖНО", 2, 1.1), 4.8, 0, 2.4, group).rotation.y = -0.4;
      break;
    }
    case "paid": {
      for (let i = 0; i < 16; i++) at(mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), 0x9a7a52, 0.012), -9 + i * 1.2, 0.55, WATER_EDGE_Z + 1, group).visible = Math.abs(-9 + i * 1.2) > 2.8;
      const kiosk = makeHouse(r, 0xe8602f, 0x7a3a2a, 2.4, 2, 2);
      at(kiosk, -6.5, 0, 3.4, group).rotation.y = 0.45;
      at(signOnPosts("ПЛАТНИК «У АШОТА»\nВХОД 1500 ₽ · КАРП ПО 400", 2.6, 0.9, "#f2b632"), 4.8, 0, 2.6, group).rotation.y = -0.45;
      steam.push(new THREE.Vector3(-5, 1.2, 2.6));
      const grill = mesh(new THREE.BoxGeometry(0.9, 0.3, 0.35), 0x2c3036, 0.015);
      at(grill, -5, 0.8, 2.6, group);
      break;
    }
    case "ice": {
      for (let i = 0; i < 12; i++) {
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.16 + r() * 0.08, 8), mat(0x1d3540));
        hole.rotation.x = -Math.PI / 2;
        at(hole, -12 + r() * 24, 0.01, -2 - r() * 20, group);
      }
      for (let i = 0; i < 4; i++) at(makePerson(0x3a4a5a, r), -14 + r() * 28, 0, -8 - r() * 14, group);
      break;
    }
    case "swamp": {
      for (let i = 0; i < 14; i++) {
        const pad = new THREE.Mesh(new THREE.CircleGeometry(0.3 + r() * 0.3, 6), mat(0x4f7d3b));
        pad.rotation.x = -Math.PI / 2;
        at(pad, -8 + r() * 16, -0.02, -3 - r() * 9, group);
      }
      const tyre = mesh(new THREE.TorusGeometry(0.4, 0.15, 5, 8), 0x1f1f1f, 0.015);
      tyre.rotation.x = Math.PI / 2.3;
      at(tyre, -4.2, 0.05, -2.6, group);
      at(signOnPosts("ОСТОРОЖНО\nТОПЬ", 1.2, 0.6), 4.6, 0, 2.2, group).rotation.y = -0.4;
      break;
    }
    case "reserve":
      at(signOnPosts("ЗАПОВЕДНИК\nЛОВ РЫБЫ ЗАПРЕЩЁН\nШТРАФ 500 000 ₽", 2.4, 1.1, "#d63732", "#e7ddc6"), 4.8, 0, 2.4, group).rotation.y = -0.4;
      break;
    case "champ": {
      const banner = makeSign("ЧЕМПИОНАТ ОБЛАСТИ ПО ЛОВЛЕ РЫБЫ · ФИНАЛ", 14, 1.4, "#f2b632");
      at(banner, 0, 4.6, -24, group);
      const tribune = mesh(new THREE.BoxGeometry(9, 1.2, 3), 0x3e6ea0, 0.04);
      at(tribune, -7.5, 0.6, 5.5, group).rotation.y = 0.3;
      for (let i = 0; i < 16; i++) {
        const p = makePerson([0xd63732, 0xf2b632, 0x54b7c6, 0xe7ddc6, 0x9a6bd1][i % 5], r);
        at(p, -11 + (i % 8) * 1.05 + r() * 0.2, 1.2 + Math.floor(i / 8) * 0.4, 4.5 + Math.floor(i / 8) * 1 - (i % 8) * 0.3, group);
        crowd.push(p);
      }
      for (let i = 0; i < 6; i++) {
        const p = makePerson([0x2c3036, 0xd63732, 0x54b7c6][i % 3], r);
        at(p, 5 + i * 0.9, 0, 3.4 + (i % 2) * 0.6, group);
        crowd.push(p);
      }
      const cam = new THREE.Group();
      at(mesh(new THREE.BoxGeometry(0.5, 0.35, 0.7), 0x22252b, 0.02), 0, 1.5, 0, cam);
      for (const a of [0, 2.1, 4.2]) {
        const leg = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 4), 0x22252b, 0.008);
        leg.rotation.set(0.25 * Math.cos(a), 0, 0.25 * Math.sin(a));
        at(leg, 0, 0.75, 0, cam);
      }
      at(cam, 4.2, 0, 1.8, group).rotation.y = -0.6;
      break;
    }
  }

  const boat = makeBoat();
  group.add(boat);
  const jetski = makeJetski();
  group.add(jetski);
  const drone = makeDrone();
  group.add(drone);
  return { group, water, waterBase, sky, skyColors, bush, sun, clouds, frozen, flicker, boat, jetski, drone, crowd, steam };
}

/** Paint the sky dome as a vertical gradient between two colours. */
export function paintSky(env: Environment, top: THREE.Color, horizon: THREE.Color): void {
  const pos = env.sky.geometry.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / 70));
    c.copy(horizon).lerp(top, Math.pow(t, 0.7));
    env.skyColors.setXYZ(i, c.r, c.g, c.b);
  }
  env.skyColors.needsUpdate = true;
}

/** Anything that comes out of the water: fish (by species colour/shape) or junk. */
export function makeCatch(species: string, look: "fish" | "long" | "cat" | "junk", color: number): THREE.Group {
  if (look !== "junk") return makeFish(color, look);
  const g = new THREE.Group();
  if (species === "ГАЛОША") {
    at(mesh(new THREE.BoxGeometry(0.34, 0.12, 0.14), 0x2a2a2a, 0.012, false), 0, 0, 0, g);
    at(mesh(new THREE.BoxGeometry(0.12, 0.16, 0.14), 0x2a2a2a, 0.012, false), -0.12, 0.1, 0, g);
  } else if (species === "ПАКЕТ-МАЙКА") {
    const bag = mesh(new THREE.IcosahedronGeometry(0.2, 0), 0xe7ddc6, 0.012, false);
    bag.scale.set(1, 1.3, 0.4);
    g.add(bag);
  } else if (species === "ПОКРЫШКА") {
    g.add(mesh(new THREE.TorusGeometry(0.35, 0.14, 5, 8), 0x1f1f1f, 0.015, false));
  } else {
    const bottle = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.32, 6), 0x3f7a4a, 0.01, false);
    bottle.rotation.z = Math.PI / 2;
    g.add(bottle);
    const neck = mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.12, 6), 0x3f7a4a, 0.008, false);
    neck.rotation.z = Math.PI / 2;
    at(neck, 0.22, 0, 0, g);
  }
  return g;
}

/** Spinning lure: a little acid-yellow wobbler. */
export function makeLure(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.IcosahedronGeometry(0.07, 0), 0xc9f04a, 0.01, false);
  body.scale.set(1.8, 0.8, 0.7);
  g.add(body);
  at(mesh(new THREE.ConeGeometry(0.03, 0.06, 3), 0xd63732, 0.006, false), 0.13, 0, 0, g).rotation.z = -Math.PI / 2;
  return g;
}

/** Feeder rod pod: a forked stand the rod rests on. */
export function makeRodPod(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, h] of [[0, 0.55], [0.0, 0.85]] as const) {
    const leg = mesh(new THREE.CylinderGeometry(0.02, 0.02, h, 4), 0x2c3036, 0.008);
    at(leg, x, h / 2, 0, g);
  }
  return g;
}

/** Ice hole with a ring of slush. */
export function makeIceHole(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.3, 8), mat(0xc9dbe6));
  ring.rotation.x = -Math.PI / 2;
  at(ring, 0, 0.012, 0, g);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.19, 8), mat(0x16303a));
  hole.rotation.x = -Math.PI / 2;
  at(hole, 0, 0.01, 0, g);
  return g;
}
