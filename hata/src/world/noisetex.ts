import * as THREE from "three";

/**
 * One tileable 256×256 noise texture that the grime shader samples instead of
 * computing noise per pixel (a phone GPU can't afford ~20 noise evaluations
 * per fragment on every wall). Channels:
 *  R — large blotches (fbm, period 4 cells)
 *  G — medium patches (fbm, period 16)
 *  B — fine grain (fbm, period 64)
 *  A — splatter: crisp spots and specks, used for ragged dirt edges
 */

const S = 256;
let tex: THREE.DataTexture | null = null;

function rnd(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Periodic value noise on a `p`×`p` lattice over the texture. */
function lattice(p: number, r: () => number): Float32Array {
  const g = new Float32Array(p * p);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return g;
}

function sample(g: Float32Array, p: number, x: number, y: number): number {
  const fx = (x / S) * p, fy = (y / S) * p;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  let tx = fx - x0, ty = fy - y0;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = g[((y0 % p) * p) + (x0 % p)], b = g[((y0 % p) * p) + ((x0 + 1) % p)];
  const c = g[(((y0 + 1) % p) * p) + (x0 % p)], d = g[(((y0 + 1) % p) * p) + ((x0 + 1) % p)];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function fbm(base: number, octaves: number, seed: number): Float32Array {
  const r = rnd(seed);
  const layers = Array.from({ length: octaves }, (_, o) => ({ p: base << o, g: lattice(base << o, r) }));
  const out = new Float32Array(S * S);
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0, amp = 0.5, sum = 0;
      for (const l of layers) {
        v += amp * sample(l.g, l.p, x, y);
        sum += amp;
        amp *= 0.5;
      }
      v /= sum;
      out[y * S + x] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  // stretch to the full 0..1 range
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
}

export function noiseTexture(): THREE.DataTexture {
  if (tex) return tex;
  const R = fbm(4, 5, 11), G = fbm(16, 4, 23), B = fbm(64, 2, 37);
  // splatter: soft-edged random dots of many sizes, wrapped, plus grain
  const A = new Float32Array(S * S);
  const r = rnd(99);
  for (let k = 0; k < 900; k++) {
    const cx = r() * S, cy = r() * S, rad = 1 + Math.pow(r(), 3) * 14;
    const v = 0.5 + r() * 0.5;
    for (let dy = -Math.ceil(rad); dy <= Math.ceil(rad); dy++) {
      for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) {
        const d = Math.hypot(dx, dy) / rad;
        if (d > 1) continue;
        const x = ((Math.floor(cx + dx) % S) + S) % S, y = ((Math.floor(cy + dy) % S) + S) % S;
        A[y * S + x] = Math.max(A[y * S + x], v * (1 - d * d));
      }
    }
  }
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = R[i] * 255;
    data[i * 4 + 1] = G[i] * 255;
    data[i * 4 + 2] = B[i] * 255;
    data[i * 4 + 3] = Math.min(1, A[i] * 0.75 + B[i] * 0.35) * 255;
  }
  tex = new THREE.DataTexture(data, S, S);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
