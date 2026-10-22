import * as THREE from "three";
import { atmos } from "../world/atmos";
import { rng } from "../world/geo";

/**
 * A mowable lawn. Grass is split into 4×4 m chunks; each chunk is one
 * instanced draw of tapered, curved blades with per-blade position, rotation
 * and height in instance attributes. Mowing lowers the height of blades
 * under the deck and tints them by mowing direction, which is what makes
 * real stripes. Blades are stored in random order, so drawing only the first
 * N of a chunk thins it evenly — that is the distance LOD.
 */

export interface LawnZone {
  key: string;
  name: string;
  total: number;
  cut: number;
}

interface Chunk {
  cx: number;
  cz: number;
  mesh: THREE.Mesh;
  geo: THREE.InstancedBufferGeometry;
  n: number;
  /** Blade x, z (world). */
  x: Float32Array;
  z: Float32Array;
  zone: Uint8Array;
  tall: Float32Array;
  cut: Uint8Array;
  aH: THREE.InstancedBufferAttribute;
  aVar: THREE.InstancedBufferAttribute;
  dirty0: number;
  dirty1: number;
}

export interface LawnOptions {
  isLawn: (x: number, z: number) => boolean;
  /** Index into `zones` for a point, or -1. */
  zoneOf: (x: number, z: number) => number;
  zones: Array<{ key: string; name: string }>;
  bounds: [number, number, number, number];
  /** Blades per m². */
  density: number;
  seed?: number;
  tall?: [number, number];
  cutH?: number;
}

const CHUNK = 4;
/** Index ranges in the blade geometry: the curved blade and the one-triangle far blade. */
const NEAR_RANGE = [0, 24] as const, FAR_RANGE = [24, 3] as const;
/** Chunks further than this (nearest point) draw one-triangle blades. */
const FAR_AT = 12;

function bladeGeometry(): THREE.BufferGeometry {
  const seg = 4;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const v = i / seg;
    const w = 0.5 * (1 - v * 0.92);
    const bend = v * v * 0.35;
    pos.push(-w, v, bend, w, v, bend);
    uv.push(0, v, 1, v);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // far version: a single triangle, drawn with a draw range on distant chunks
  const b = (seg + 1) * 2;
  pos.push(-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0.35);
  uv.push(0, 0, 1, 0, 0.5, 1);
  idx.push(b, b + 1, b + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Lawn {
  readonly group = new THREE.Group();
  readonly zones: LawnZone[];
  readonly material: THREE.MeshStandardMaterial;
  readonly time = { value: 0 };
  private readonly lodU = { value: 1 };
  /** Minimum blade width per metre of distance (≈ 2 pixels), set from the camera. */
  static readonly pix = { value: 0.0045 };
  private chunks: Chunk[] = [];
  private grid = new Map<string, Chunk>();
  private cutH: number;
  /** Blades that are tall right now, for the HUD. */
  lod = 1;

  constructor(o: LawnOptions) {
    this.zones = o.zones.map((z) => ({ ...z, total: 0, cut: 0 }));
    this.cutH = o.cutH ?? 0.055;
    const r = rng(o.seed ?? 7);
    const [x0, x1, z0, z1] = o.bounds;
    const tall = o.tall ?? [0.24, 0.5];
    const blade = bladeGeometry();
    this.material = this.makeMaterial();
    for (let cx = Math.floor(x0 / CHUNK); cx * CHUNK < x1; cx++) {
      for (let cz = Math.floor(z0 / CHUNK); cz * CHUNK < z1; cz++) {
        const bx = cx * CHUNK, bz = cz * CHUNK;
        const want = Math.floor(CHUNK * CHUNK * o.density);
        const xs: number[] = [], zs: number[] = [], zn: number[] = [], hs: number[] = [];
        for (let i = 0; i < want; i++) {
          const x = bx + r() * CHUNK, z = bz + r() * CHUNK;
          if (x < x0 || x > x1 || z < z0 || z > z1 || !o.isLawn(x, z)) continue;
          const zi = o.zoneOf(x, z);
          if (zi < 0) continue;
          // clumps: taller in patches
          const clump = 0.6 + 0.4 * Math.sin(x * 1.3 + Math.sin(z * 0.9) * 2) * Math.cos(z * 1.1);
          xs.push(x); zs.push(z); zn.push(zi);
          hs.push(tall[0] + (tall[1] - tall[0]) * (0.4 * r() + 0.6 * clump));
          this.zones[zi].total++;
        }
        const n = xs.length;
        if (!n) continue;
        const geo = new THREE.InstancedBufferGeometry();
        geo.index = blade.index;
        geo.setAttribute("position", blade.getAttribute("position"));
        geo.setAttribute("normal", blade.getAttribute("normal"));
        geo.setAttribute("uv", blade.getAttribute("uv"));
        const off = new Float32Array(n * 4), aH = new Float32Array(n), vars = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          off[i * 4] = xs[i];
          off[i * 4 + 1] = zs[i];
          off[i * 4 + 2] = r() * Math.PI * 2;
          off[i * 4 + 3] = 0.022 + r() * 0.022; // width
          aH[i] = hs[i];
          vars[i * 3] = r();
          vars[i * 3 + 1] = r() < 0.14 ? 0.5 + r() * 0.5 : 0; // dry blades
          vars[i * 3 + 2] = r();
        }
        geo.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 4));
        // blades are in random order, so the index is a random rank for the distance fade
        geo.setAttribute("aRank", new THREE.InstancedBufferAttribute(Float32Array.from({ length: n }, (_, i) => (i + 0.5) / n), 1));
        const hAttr = new THREE.InstancedBufferAttribute(aH, 1);
        hAttr.setUsage(THREE.DynamicDrawUsage);
        const vAttr = new THREE.InstancedBufferAttribute(vars, 3);
        vAttr.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute("aH", hAttr);
        geo.setAttribute("aVar", vAttr);
        geo.instanceCount = n;
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(bx + CHUNK / 2, 0.3, bz + CHUNK / 2), CHUNK * 0.75 + 0.5);
        geo.boundingBox = new THREE.Box3(new THREE.Vector3(bx, 0, bz), new THREE.Vector3(bx + CHUNK, 0.6, bz + CHUNK));
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        this.group.add(mesh);
        const ch: Chunk = {
          cx, cz, mesh, geo, n,
          x: Float32Array.from(xs), z: Float32Array.from(zs), zone: Uint8Array.from(zn),
          tall: Float32Array.from(hs), cut: new Uint8Array(n), aH: hAttr, aVar: vAttr, dirty0: Infinity, dirty1: -1,
        };
        this.chunks.push(ch);
        this.grid.set(`${cx},${cz}`, ch);
      }
    }
  }

  private makeMaterial(): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 1 });
    const uTime = this.time, uLod = this.lodU;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.uniforms.uPix = Lawn.pix;
      sh.uniforms.uLod = uLod;
      sh.uniforms.uSunDir = atmos.sunDir;
      sh.uniforms.uSunCol = atmos.sunColor;
      sh.vertexShader = sh.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          attribute vec4 aOff; attribute float aH; attribute vec3 aVar; attribute float aRank; uniform float uLod;
          varying vec3 vVar; varying float vV; varying float vFar; varying vec3 vBW; uniform float uTime; uniform float uPix;`,
        )
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
          float cr = cos(aOff.z), sr = sin(aOff.z);
          objectNormal = vec3(cr * objectNormal.x + sr * objectNormal.z, objectNormal.y, -sr * objectNormal.x + cr * objectNormal.z);
          objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.8));`,
        )
        .replace(
          "#include <begin_vertex>",
          `// A blade thinner than ~2 pixels flickers as you walk: widen far blades
          // (the LOD draws fewer of them, so the lawn keeps the same coverage).
          float dCam = distance(cameraPosition.xz, vec2(aOff.x, aOff.y));
          float bw = max(aOff.w, dCam * uPix);
          // distance thinning: blades past the kept share shrink into the ground smoothly
          float keep = (dCam < 9.0 ? 1.0 : dCam < 26.0 ? 1.0 - (dCam - 9.0) / 17.0 * 0.8 : 0.2) * uLod;
          float grow = 1.0 - smoothstep(keep - 0.1, keep, aRank);
          float bh = aH * grow;
          vec3 transformed = vec3(position.x * bw * grow, position.y * bh, position.z * bh * 0.75);
          vVar = aVar; vV = uv.y; vFar = smoothstep(3.0, 20.0, dCam);
          transformed = vec3(cr * transformed.x + sr * transformed.z, transformed.y, -sr * transformed.x + cr * transformed.z);
          float wv = sin(uTime * 1.7 + aOff.x * 0.6 + aOff.y * 0.35) * 0.5 + sin(uTime * 2.9 + aOff.x * 1.7) * 0.25;
          float sway = uv.y * uv.y * bh;
          transformed.x += wv * 0.25 * sway;
          transformed.z += wv * 0.12 * sway;
          transformed += vec3(aOff.x, 0.0, aOff.y);
          vBW = transformed;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vVar; varying float vV; varying float vFar; varying vec3 vBW; uniform vec3 uSunDir, uSunCol;")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          // soft, saturated greens; the root is a shaded green, not black, so
          // neighbouring blades don't flicker light/dark as you move
          vec3 root = vec3(0.045, 0.085, 0.016);
          vec3 tip = mix(vec3(0.12, 0.30, 0.035), vec3(0.24, 0.42, 0.06), vVar.x);
          tip = mix(tip, vec3(0.52, 0.42, 0.14), vVar.y);
          tip *= 0.88 + 0.24 * vVar.z;
          float h = smoothstep(0.0, 0.95, vV);
          vec3 col = mix(root, tip, h);
          // far away: blades blend toward one average lawn colour
          vec3 avg = mix(root, tip, 0.6);
          diffuseColor.rgb = mix(col, avg, vFar * 0.85);`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          // looking toward the low sun, thin blades glow at the tips (light through the leaf)
          float back = pow(max(dot(normalize(vBW - cameraPosition), uSunDir), 0.0), 5.0);
          totalEmissiveRadiance += uSunCol * diffuseColor.rgb * back * h * 2.2;`,
        );
    };
    return mat;
  }

  /**
   * Cuts blades within `radius` of (x, z). `dir` is the mowing direction:
   * stripes are lighter one way and darker the other, like on a real lawn.
   * Returns how many blades were cut, per zone index.
   */
  mow(x: number, z: number, radius: number, dirX: number, dirZ: number): number[] {
    const out = this.zones.map(() => 0);
    const r2 = radius * radius;
    const light = Math.abs(dirZ) >= Math.abs(dirX) ? dirZ >= 0 : dirX >= 0;
    for (let cx = Math.floor((x - radius) / CHUNK); cx <= Math.floor((x + radius) / CHUNK); cx++) {
      for (let cz = Math.floor((z - radius) / CHUNK); cz <= Math.floor((z + radius) / CHUNK); cz++) {
        const ch = this.grid.get(`${cx},${cz}`);
        if (!ch) continue;
        const H = ch.aH.array as Float32Array, VA = ch.aVar.array as Float32Array;
        for (let i = 0; i < ch.n; i++) {
          if (ch.cut[i]) continue;
          const dx = ch.x[i] - x, dz = ch.z[i] - z;
          if (dx * dx + dz * dz > r2) continue;
          ch.cut[i] = 1;
          H[i] = this.cutH * (0.8 + VA[i * 3 + 2] * 0.4);
          VA[i * 3] = light ? 0.95 : 0.25;
          VA[i * 3 + 1] = 0;
          out[ch.zone[i]]++;
          this.zones[ch.zone[i]].cut++;
          if (i < ch.dirty0) ch.dirty0 = i;
          if (i > ch.dirty1) ch.dirty1 = i;
        }
      }
    }
    return out;
  }

  /** Share of a zone that is mown. */
  share(zi: number): number {
    const z = this.zones[zi];
    return z.total ? z.cut / z.total : 1;
  }

  /** Mows the first `share` of a zone, west to east (restoring a saved run). */
  restore(zi: number, share: number): void {
    if (share <= 0) return;
    const all: Array<[Chunk, number]> = [];
    for (const ch of this.chunks) for (let i = 0; i < ch.n; i++) if (ch.zone[i] === zi) all.push([ch, i]);
    all.sort((a, b) => a[0].x[a[1]] - b[0].x[b[1]]);
    const n = Math.floor(all.length * Math.min(1, share));
    for (let k = 0; k < n; k++) {
      const [ch, i] = all[k];
      ch.cut[i] = 1;
      (ch.aH.array as Float32Array)[i] = this.cutH;
      const lane = Math.floor(ch.x[i] / 0.5) % 2 === 0;
      (ch.aVar.array as Float32Array)[i * 3] = lane ? 0.95 : 0.25;
      (ch.aVar.array as Float32Array)[i * 3 + 1] = 0;
      ch.dirty0 = 0;
      ch.dirty1 = ch.n - 1;
    }
    this.zones[zi].cut = n;
  }

  /** Finishes a zone (the last few percent). */
  finish(zi: number): void {
    for (const ch of this.chunks) {
      for (let i = 0; i < ch.n; i++) {
        if (ch.zone[i] !== zi || ch.cut[i]) continue;
        ch.cut[i] = 1;
        (ch.aH.array as Float32Array)[i] = this.cutH;
        (ch.aVar.array as Float32Array)[i * 3] = 0.6;
        ch.dirty0 = Math.min(ch.dirty0, i);
        ch.dirty1 = Math.max(ch.dirty1, i);
      }
    }
    this.zones[zi].cut = this.zones[zi].total;
  }

  /** Is there tall grass near (x, z)? (For hiding coins.) */
  tallAt(x: number, z: number): boolean {
    const ch = this.grid.get(`${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`);
    if (!ch) return false;
    for (let i = 0; i < ch.n; i += 7) {
      const dx = ch.x[i] - x, dz = ch.z[i] - z;
      if (dx * dx + dz * dz < 0.25) return !ch.cut[i];
    }
    return false;
  }

  /** Uploads changed heights and thins far chunks. */
  update(cam: THREE.Vector3, t: number, quality = 1): void {
    this.time.value = t;
    this.lodU.value = quality;
    for (const ch of this.chunks) {
      if (ch.dirty1 >= 0) {
        ch.aH.clearUpdateRanges();
        ch.aH.addUpdateRange(ch.dirty0, ch.dirty1 - ch.dirty0 + 1);
        ch.aH.needsUpdate = true;
        ch.aVar.clearUpdateRanges();
        ch.aVar.addUpdateRange(ch.dirty0 * 3, (ch.dirty1 - ch.dirty0 + 1) * 3);
        ch.aVar.needsUpdate = true;
        ch.dirty0 = Infinity;
        ch.dirty1 = -1;
      }
      // nearest point of the chunk: the shader fades the rest, this only skips work
      const x0 = ch.cx * CHUNK, z0 = ch.cz * CHUNK;
      const dx = Math.max(x0 - cam.x, 0, cam.x - x0 - CHUNK), dz = Math.max(z0 - cam.z, 0, cam.z - z0 - CHUNK);
      const d = Math.sqrt(dx * dx + dz * dz);
      const f = d < 9 ? 1 : d < 26 ? 1 - ((d - 9) / 17) * 0.8 : 0.2;
      ch.geo.instanceCount = Math.max(1, Math.min(ch.n, Math.ceil(ch.n * f * quality) + 8));
      const r = d > FAR_AT ? FAR_RANGE : NEAR_RANGE;
      ch.geo.setDrawRange(r[0], r[1]);
    }
  }
}
