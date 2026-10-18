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

export const FISH_LOOK: Record<string, { kind: "fish" | "long" | "cat"; color: number }> = {
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
}

export const WATER_EDGE_Z = -2.2;

export function makeEnvironment(): Environment {
  const r = rng(20261018);
  const group = new THREE.Group();

  // Sky dome with vertex-colour gradient (recoloured over the day).
  const skyGeo = new THREE.SphereGeometry(120, 16, 10);
  const skyColors = new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3);
  skyGeo.setAttribute("color", skyColors);
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  group.add(sky);

  const sun = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 0), new THREE.MeshBasicMaterial({ color: 0xffd76a, fog: false }));
  outline(sun, 0.25);
  group.add(sun);

  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = mesh(new THREE.IcosahedronGeometry(1.4 + r() * 1.2, 0), 0xf4f1e6, 0.12, false);
      puff.scale.y = 0.55;
      at(puff, j * 1.8 - 2.7, r() * 0.6, r() * 0.8, cloud);
    }
    at(cloud, -30 + i * 20, 16 + r() * 7, -70 - r() * 10, group);
    clouds.push(cloud);
  }

  // River: a faceted plane whose vertices bob every frame.
  const waterGeo = new THREE.PlaneGeometry(90, 70, 36, 26).toNonIndexed();
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate(0, 0, WATER_EDGE_Z - 35);
  const pos = waterGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, -0.08);
  const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: C.water, flatShading: true, roughness: 0.7, metalness: 0 }));
  water.receiveShadow = true;
  group.add(water);
  const waterBase = new Float32Array(pos.array as Float32Array);

  // Near bank: jittered low-poly ground that slopes into the water.
  // Extends under the river as a riverbed so the shoreline never shows a gap.
  const groundGeo = new THREE.PlaneGeometry(40, 20, 30, 22);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(0, 0, WATER_EDGE_Z + 6);
  const gp = groundGeo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const cGrass = new THREE.Color(C.grass);
  const cDirt = new THREE.Color(C.dirt);
  const cMud = new THREE.Color(0x4f5a30);
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const edge = z - WATER_EDGE_Z;
    let y = edge < 0 ? -0.5 + edge * 0.05 : edge < 0.9 ? -0.3 + edge * 0.33 : (r() - 0.5) * 0.08;
    if (Math.abs(x) > 3) y += (Math.abs(x) - 3) * 0.06 + r() * 0.1;
    gp.setY(i, y);
    const dirt = Math.max(0, 1 - Math.hypot(x / 2.6, (z - 0.2) / 1.4));
    const c = edge < 0.9 ? cMud : cGrass.clone().lerp(cDirt, Math.min(1, dirt * 1.6)).multiplyScalar(0.92 + r() * 0.14);
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(groundGeo.toNonIndexed(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  ground.receiveShadow = true;
  group.add(ground);

  // Far bank: hills, a dark strip of shore, and a pine forest.
  const far = -34;
  const shore = mesh(new THREE.BoxGeometry(120, 0.6, 6), 0x4a6b3a, 0, false);
  at(shore, 0, 0, far - 2, group);
  for (let i = 0; i < 7; i++) {
    const hill = mesh(new THREE.ConeGeometry(14 + r() * 10, 8 + r() * 9, 5), [0x7f9c6a, 0x739160, 0x8aa875][i % 3], 0, false);
    at(hill, -48 + i * 16 + r() * 6, 3, far - 18 - r() * 12, group).rotation.y = r() * 3;
  }
  for (let i = 0; i < 46; i++) {
    const pine = makePine(r, 2.5 + r() * 3.2);
    at(pine, -40 + r() * 80, 0.2, far - 1 - r() * 7, group);
  }
  // Near-bank trees framing the shot, and the bush Tolik disappears into.
  for (const [x, z, h] of [[-5.2, 1.5, 4.8], [5.8, 2.2, 5.4], [-7.5, -0.5, 6.2], [7.8, 0.5, 6]] as const) {
    at(makePine(r, h), x, 0.1, z, group);
  }
  const bush = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const blob = mesh(new THREE.IcosahedronGeometry(0.5 + r() * 0.3, 0), i % 2 ? 0x3f6a33 : 0x4f7d3b, 0.03);
    at(blob, (r() - 0.5) * 1.2, 0.4 + r() * 0.4, (r() - 0.5) * 0.8, bush);
  }
  at(bush, 3.6, 0, 0.6, group);
  // Reeds along the water edge.
  for (let i = 0; i < 26; i++) {
    const x = -9 + r() * 18;
    if (Math.abs(x) < 2.6) continue;
    const reed = mesh(new THREE.ConeGeometry(0.04, 0.9 + r() * 0.7, 3), 0x6f8a3a, 0, false);
    at(reed, x, 0.2, WATER_EDGE_Z + 0.2 + r() * 0.5, group).rotation.z = (r() - 0.5) * 0.3;
    if (r() < 0.35) at(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 5), 0x6b4a2e, 0.012, false), x, 0.95, reed.position.z, group);
  }
  return { group, water, waterBase, sky, skyColors, bush, sun, clouds };
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
