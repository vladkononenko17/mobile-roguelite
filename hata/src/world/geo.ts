import * as THREE from "three";

/**
 * Geometry helpers for architecture built in code. Static pieces get UVs
 * projected from world space in metres (picked per face by its dominant
 * normal axis), so a texture tiles seamlessly across wall segments and
 * pbrMaterial's `scale` means "repeats per metre".
 */

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

export function bakeWorldUV(mesh: THREE.Mesh): void {
  mesh.updateMatrixWorld(true);
  const g = mesh.geometry;
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  _m3.getNormalMatrix(mesh.matrixWorld);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    _n.fromBufferAttribute(nor, i).applyMatrix3(_m3).normalize();
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
    let u: number, w: number;
    if (ay >= ax && ay >= az) {
      u = _v.x; w = -_v.z;
    } else if (ax >= az) {
      u = _n.x > 0 ? -_v.z : _v.z; w = _v.y;
    } else {
      u = _n.z > 0 ? _v.x : -_v.x; w = _v.y;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = w;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/** BoxGeometry face order: +x, -x, +y, -y, +z, -z. */
export type FaceMats = [THREE.Material, THREE.Material, THREE.Material, THREE.Material, THREE.Material, THREE.Material];

export function box(
  parent: THREE.Object3D,
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  mat: THREE.Material | FaceMats,
  opts: { cast?: boolean; receive?: boolean; rotY?: number } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat as THREE.Material);
  m.position.set(x, y, z);
  if (opts.rotY) m.rotation.y = opts.rotY;
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  parent.add(m);
  bakeWorldUV(m);
  return m;
}

export interface Opening {
  /** Distance along the wall from its start, metres. */
  from: number;
  to: number;
  /** Height above the floor. */
  bottom: number;
  top: number;
}

/**
 * A straight wall from `a` to `b` (on the XZ plane, axis-aligned) with
 * rectangular openings cut as separate boxes. `outer` is the side whose
 * face gets `outMat` (+1 = the +normal side of the wall direction rotated
 * left), the other face gets `inMat`; ends and reveals get `trimMat`.
 */
export function wall(
  parent: THREE.Object3D,
  a: [number, number], b: [number, number],
  floorY: number, height: number, thick: number,
  openings: Opening[],
  mats: { out: THREE.Material; in: THREE.Material; trim: THREE.Material },
  outerSign: 1 | -1,
): THREE.Mesh[] {
  const alongX = a[1] === b[1];
  const len = alongX ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
  const dir = alongX ? Math.sign(b[0] - a[0]) : Math.sign(b[1] - a[1]);
  const ops = [...openings].sort((p, q) => p.from - q.from);
  const pieces: Array<{ s: number; e: number; y0: number; y1: number }> = [];
  let cur = 0;
  for (const o of ops) {
    if (o.from > cur) pieces.push({ s: cur, e: o.from, y0: 0, y1: height });
    if (o.bottom > 0) pieces.push({ s: o.from, e: o.to, y0: 0, y1: o.bottom });
    if (o.top < height) pieces.push({ s: o.from, e: o.to, y0: o.top, y1: height });
    cur = o.to;
  }
  if (cur < len) pieces.push({ s: cur, e: len, y0: 0, y1: height });

  // Face materials. A wall along +X has its left normal = -Z ... keep it simple:
  // for walls along X the faces are ±z, for walls along Z they are ±x.
  const out: THREE.Mesh[] = [];
  for (const p of pieces) {
    const mid = (p.s + p.e) / 2;
    const L = p.e - p.s;
    const H = p.y1 - p.y0;
    const cy = floorY + (p.y0 + p.y1) / 2;
    let m: THREE.Mesh;
    if (alongX) {
      const x = a[0] + dir * mid;
      const faces: FaceMats = [mats.trim, mats.trim, mats.trim, mats.trim, mats.trim, mats.trim];
      faces[4] = outerSign > 0 ? mats.out : mats.in;
      faces[5] = outerSign > 0 ? mats.in : mats.out;
      m = box(parent, L, H, thick, x, cy, a[1], faces);
    } else {
      const z = a[1] + dir * mid;
      const faces: FaceMats = [mats.trim, mats.trim, mats.trim, mats.trim, mats.trim, mats.trim];
      faces[0] = outerSign > 0 ? mats.out : mats.in;
      faces[1] = outerSign > 0 ? mats.in : mats.out;
      m = box(parent, thick, H, L, a[0], cy, z, faces);
    }
    out.push(m);
  }
  return out;
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
