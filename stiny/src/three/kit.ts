import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * A small modelling kit for the flat and the yard: bevelled boxes, extruded
 * side profiles (car bodies, a guitar), lathes and tubes, standard materials,
 * and `bake`, which merges a finished prop into one mesh per material so a
 * room full of things still costs a handful of draw calls on a phone.
 */

export type Rand = () => number;
export function rng(seed: number): Rand {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ materials

const mats = new Map<string, THREE.MeshStandardMaterial>();
export interface Finish { rough?: number; metal?: number; map?: THREE.Texture | null; normal?: THREE.Texture | null; normalScale?: number; emissive?: number; emissiveIntensity?: number; transparent?: boolean; opacity?: number; side?: THREE.Side; alphaTest?: number; key?: string }

/** A shared standard material for a colour and finish. */
export function std(color: number, f: Finish = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${f.rough ?? 0.7}|${f.metal ?? 0}|${f.map?.uuid ?? ""}|${f.normal?.uuid ?? ""}|${f.emissive ?? ""}|${f.opacity ?? ""}|${f.side ?? ""}|${f.alphaTest ?? ""}|${f.key ?? ""}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: f.rough ?? 0.7, metalness: f.metal ?? 0, map: f.map ?? null, normalMap: f.normal ?? null,
      emissive: f.emissive ?? 0x000000, emissiveIntensity: f.emissiveIntensity ?? 1,
      transparent: f.transparent ?? (f.opacity != null && f.opacity < 1), opacity: f.opacity ?? 1, side: f.side ?? THREE.FrontSide, alphaTest: f.alphaTest ?? 0,
    });
    if (f.normal) m.normalScale.setScalar(f.normalScale ?? 1);
    mats.set(key, m);
  }
  return m;
}

/** Common finishes. */
export const paint = (c: number) => std(c, { rough: 0.85 });
export const gloss = (c: number) => std(c, { rough: 0.25 });
export const chrome = () => std(0xd8dce0, { rough: 0.18, metal: 1 });
export const steel = (c = 0x9a9ea4) => std(c, { rough: 0.45, metal: 0.8 });
export const rubber = (c = 0x1a1a1c) => std(c, { rough: 0.92 });
export const plastic = (c: number) => std(c, { rough: 0.5 });
export const glow = (c: number, k = 2) => std(0x000000, { emissive: c, emissiveIntensity: k, rough: 0.4 });

// ------------------------------------------------------------------ geometry

/** A box with rounded edges (the radius is clamped to fit). */
export function rbox(w: number, h: number, d: number, r = 0.02, seg = 2): THREE.BufferGeometry {
  const rr = Math.max(0.0005, Math.min(r, Math.min(w, h, d) / 2 - 0.0005));
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}

export function box(w: number, h: number, d: number): THREE.BufferGeometry { return new THREE.BoxGeometry(w, h, d); }
export function cyl(rt: number, rb: number, h: number, seg = 16, open = false): THREE.BufferGeometry { return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); }

/**
 * A side profile (u = along the length, positive = front; v = up) extruded
 * across the width, centred, with rounded edges. The result has its length on
 * world z (front towards +z) and its width on x.
 */
export function profile(pts: Array<[number, number]>, width: number, bevel = 0.03, curve = 6): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  return profileShape(shape, width, bevel, curve);
}

export function profileShape(shape: THREE.Shape, width: number, bevel = 0.03, curve = 6): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, width - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel,
    bevelSegments: 2, curveSegments: curve, steps: 1,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** A flat outline extruded upward (u, w on the floor plan → x, z), height h. */
export function slab(pts: Array<[number, number]>, h: number, bevel = 0.01): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, h - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return g;
}

export function lathe(pts: Array<[number, number]>, seg = 24): THREE.BufferGeometry {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

export function tube(pts: THREE.Vector3[], r: number, seg = 24, radial = 8, closed = false): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed, "catmullrom", 0.3), seg, r, radial, closed);
}

/** A straight rod between two points. */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** Pushes vertices outward by noise: soft lumps for bags, foliage, pillows. */
export function lumpy(g: THREE.BufferGeometry, amp: number, freq: number, seed = 1): THREE.BufferGeometry {
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const n = (x: number, y: number, z: number) => Math.sin(x * freq + seed) * Math.cos(y * freq * 1.3 + seed * 2) * Math.sin(z * freq * 0.9 + seed * 3)
    + 0.5 * Math.sin(x * freq * 2.1 + seed * 5) * Math.sin(y * freq * 2.3) * Math.cos(z * freq * 1.9 + seed);
  // shared positions must move together, so key them by place
  const moved = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    let k = moved.get(key);
    if (k === undefined) { k = 1 + n(v.x, v.y, v.z) * amp; moved.set(key, k); }
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ placing

export interface Place { rx?: number; ry?: number; rz?: number; s?: number | [number, number, number]; shadow?: boolean; name?: string }

/** Adds a mesh to a parent at a position. */
export function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, o: Place = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  if (o.s != null) { if (typeof o.s === "number") m.scale.setScalar(o.s); else m.scale.set(...o.s); }
  m.castShadow = o.shadow ?? true;
  m.receiveShadow = true;
  if (o.name) m.name = o.name;
  m.userData.keepShape = true;
  m.userData.noAO = true;
  parent.add(m);
  return m;
}

export function group(parent: THREE.Object3D | null, x = 0, y = 0, z = 0, ry = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent?.add(g);
  return g;
}

/**
 * Merges every unnamed mesh under `root` into one mesh per material (named
 * meshes and anything marked `userData.live` stay as they are). Call once a
 * prop is finished and placed inside `root`.
 */
export function bake(root: THREE.Object3D, shadow = true): THREE.Object3D {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const dead: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.name || m.userData.live || Array.isArray(m.material)) return;
    let skip = false;
    for (let p = m.parent; p && p !== root; p = p.parent) if (p.name || p.userData.live) skip = true;
    if (skip) return;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    g.morphAttributes = {};
    const list = buckets.get(m.material as THREE.Material) ?? [];
    list.push(g);
    buckets.set(m.material as THREE.Material, list);
    dead.push(m);
  });
  for (const m of dead) m.removeFromParent();
  // drop empty groups left behind
  const empties: THREE.Object3D[] = [];
  root.traverse((o) => { if (o !== root && !(o as THREE.Mesh).isMesh && o.children.length === 0 && !o.name && (o as THREE.Light).isLight !== true) empties.push(o); });
  for (const e of empties) e.removeFromParent();
  for (const [material, list] of buckets) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, material);
    m.castShadow = shadow && !(material as THREE.MeshStandardMaterial).transparent;
    m.receiveShadow = true;
    m.userData.keepShape = true;
    m.userData.noAO = true;
    m.userData.smoothed = true;
    root.add(m);
    for (const g of list) g.dispose();
  }
  return root;
}

// ------------------------------------------------------------------ textures

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext("2d")!];
}

export function tex(cv: HTMLCanvasElement, opts: { repeat?: [number, number]; srgb?: boolean; wrap?: boolean } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  if (opts.srgb ?? true) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.wrap ?? true) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (opts.repeat) t.repeat.set(...opts.repeat);
  t.anisotropy = 8;
  return t;
}

/** Paints a texture with a draw callback. */
export function painted(w: number, h: number, draw: (g: CanvasRenderingContext2D, r: Rand) => void, seed = 1, opts: { repeat?: [number, number]; srgb?: boolean; wrap?: boolean } = {}): THREE.CanvasTexture {
  const [cv, g] = canvas(w, h);
  draw(g, rng(seed));
  return tex(cv, opts);
}

/** A tangent-space normal map from a height canvas (brighter = higher). */
export function normalFrom(height: HTMLCanvasElement, strength = 2, repeat?: [number, number]): THREE.CanvasTexture {
  const w = height.width, h = height.height;
  const src = height.getContext("2d")!.getImageData(0, 0, w, h).data;
  const [cv, g] = canvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * w + x) * 4;
    out.data[i] = (-dx / l * 0.5 + 0.5) * 255;
    out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
    out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return tex(cv, { srgb: false, repeat });
}

/** Seeded value noise, tileable over `period` cells. */
export function noise2(seed: number, period: number): (x: number, y: number) => number {
  const r = rng(seed);
  const grid = Array.from({ length: period * period }, () => r());
  const at = (i: number, j: number) => grid[((j % period + period) % period) * period + ((i % period + period) % period)];
  return (x: number, y: number) => {
    const i = Math.floor(x), j = Math.floor(y);
    const fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** Fractal noise over a w×h canvas, tileable: returns values 0..1 per pixel. */
export function fbm(w: number, h: number, seed: number, base = 4, octaves = 4): Float32Array {
  const out = new Float32Array(w * h);
  const layers = Array.from({ length: octaves }, (_, o) => ({ n: noise2(seed + o * 101, base << o), f: base << o, a: 1 / (1 << o) }));
  const norm = layers.reduce((s, l) => s + l.a, 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (const l of layers) v += l.n((x / w) * l.f, (y / h) * l.f) * l.a;
    out[y * w + x] = v / norm;
  }
  return out;
}

/** Writes a field into a canvas through a colour ramp. */
export function ramp(g: CanvasRenderingContext2D, w: number, h: number, field: Float32Array, stops: Array<[number, [number, number, number]]>, jitter = 0, r?: Rand): void {
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(1, field[i] + (r ? (r() - 0.5) * jitter : 0)));
    let k = 0;
    while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const [a, ca] = stops[k], [b, cb] = stops[k + 1];
    const t = Math.max(0, Math.min(1, (v - a) / Math.max(1e-6, b - a)));
    img.data[i * 4] = ca[0] + (cb[0] - ca[0]) * t;
    img.data[i * 4 + 1] = ca[1] + (cb[1] - ca[1]) * t;
    img.data[i * 4 + 2] = ca[2] + (cb[2] - ca[2]) * t;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

/** Moves the vertices of every mesh under `root` (in root space): tapers, bends. */
export function warp(root: THREE.Object3D, fn: (v: THREE.Vector3) => void): void {
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.live) return;
    const p = m.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); }
    p.needsUpdate = true;
    m.geometry.computeBoundingSphere();
    m.geometry.computeBoundingBox();
  });
}
