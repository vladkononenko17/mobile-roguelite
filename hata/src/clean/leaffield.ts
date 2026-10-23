import * as THREE from "three";
import { leafAtlas, leafGeometry } from "../world/leaves";
import { rng } from "../world/geo";

/**
 * A field of fallen leaves that can be collected: raked, sucked up by the
 * blower-vac or fished out of the pool. Leaves in reach lift off and fly to
 * the tool's mouth, then vanish into the bag. Active leaves are kept at the
 * front of the instance buffer (swap-remove), so a collected leaf costs two
 * tiny buffer updates.
 */

export interface LeafFieldOptions {
  key: string;
  name: string;
  count: number;
  seed: number;
  place: (r: () => number) => THREE.Vector3 | null;
  size?: [number, number];
  tilt?: number;
  /** Bob on water. */
  floating?: boolean;
}

interface Flyer {
  slot: number;
  from: THREE.Vector3;
  t: number;
  rot: THREE.Euler;
  scale: number;
}

export class LeafField {
  readonly key: string;
  readonly name: string;
  readonly mesh: THREE.InstancedMesh;
  readonly total: number;
  private pos: THREE.Vector3[] = [];
  private rot: THREE.Euler[] = [];
  private scale: number[] = [];
  private tile: Float32Array;
  private tileAttr: THREE.InstancedBufferAttribute;
  /** Number of leaves still lying (indices 0..active-1). */
  active = 0;
  private flying: Flyer[] = [];
  private floating: boolean;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private budget = 0;

  constructor(o: LeafFieldOptions) {
    this.key = o.key;
    this.name = o.name;
    this.floating = !!o.floating;
    const geo = leafGeometry();
    this.tile = new Float32Array(o.count + 64);
    const mat = new THREE.MeshStandardMaterial({ map: leafAtlas(), alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.75 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aTile;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = vMapUv * 0.5 + vec2(mod(aTile, 2.0), floor(aTile / 2.0)) * 0.5;");
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, o.count + 64);
    // leaves lying flat cast no visible shadow: keep them out of the shadow pass
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const r = rng(o.seed);
    const [s0, s1] = o.size ?? [0.07, 0.13];
    const tilt = o.tilt ?? 0.35;
    for (let i = 0; i < o.count; i++) {
      const p = o.place(r);
      if (!p) continue;
      this.pos.push(p);
      this.rot.push(new THREE.Euler((r() - 0.5) * tilt, r() * Math.PI * 2, (r() - 0.5) * tilt));
      this.scale.push(s0 + (s1 - s0) * r());
      this.tile[this.pos.length - 1] = Math.floor(r() * 4);
    }
    this.total = this.pos.length;
    this.active = this.total;
    for (let i = 0; i < this.active; i++) this.write(i);
    this.tileAttr = new THREE.InstancedBufferAttribute(this.tile, 1);
    geo.setAttribute("aTile", this.tileAttr);
    this.mesh.count = this.active;
    this.mesh.computeBoundingSphere();
    // leaves fly up to a few metres above where they lie
    if (this.mesh.boundingSphere) this.mesh.boundingSphere.radius += 3;
  }

  private write(i: number): void {
    this.q.setFromEuler(this.rot[i]);
    const k = this.scale[i];
    this.s.set(k, k, k);
    this.m.compose(this.pos[i], this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
  }

  share(): number {
    return this.total ? 1 - this.active / this.total : 1;
  }

  /** Removes the first `share` of leaves at once (restoring a saved run). */
  restore(share: number): void {
    const n = Math.floor(this.total * Math.min(1, share));
    for (let k = 0; k < n && this.active > 0; k++) this.removeAt(this.active - 1);
    this.mesh.count = this.active;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private removeAt(i: number): void {
    const last = this.active - 1;
    if (i !== last) {
      this.pos[i] = this.pos[last];
      this.rot[i] = this.rot[last];
      this.scale[i] = this.scale[last];
      this.tile[i] = this.tile[last];
      this.write(i);
      if (this.tileAttr) this.tileAttr.needsUpdate = true;
    }
    this.active--;
  }

  /**
   * Collects up to `rate × dt` leaves within `radius` of `at`; they fly to
   * `mouth`. Returns the number collected this call.
   */
  collect(at: THREE.Vector3, radius: number, rate: number, dt: number, mouth: THREE.Vector3): number {
    this.budget = Math.min(this.budget + rate * dt, rate * 0.25 + 1);
    let got = 0;
    const r2 = radius * radius;
    for (let i = this.active - 1; i >= 0 && this.budget >= 1; i--) {
      const p = this.pos[i];
      const dx = p.x - at.x, dz = p.z - at.z;
      if (dx * dx + dz * dz > r2 || Math.abs(p.y - at.y) > 1.2) continue;
      this.flying.push({ slot: -1, from: p.clone(), t: 0, rot: this.rot[i].clone(), scale: this.scale[i] });
      this.removeAt(i);
      this.budget -= 1;
      got++;
    }
    if (got) {
      this.mouth.copy(mouth);
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    return got;
  }

  /** Collects `n` random leaves (the neighbour kid). */
  steal(n: number): number {
    let got = 0;
    for (let k = 0; k < n && this.active > 0; k++) {
      this.removeAt(Math.floor(Math.random() * this.active));
      got++;
    }
    if (got) this.mesh.instanceMatrix.needsUpdate = true;
    return got;
  }

  /** Is any leaf within radius? (cheap check for hints) */
  near(at: THREE.Vector3, radius: number): boolean {
    const r2 = radius * radius;
    for (let i = 0; i < this.active; i += 3) {
      const p = this.pos[i];
      const dx = p.x - at.x, dz = p.z - at.z;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  /** Nearest lying leaf (for the "where is the rest" hint). */
  nearest(at: THREE.Vector3): THREE.Vector3 | null {
    let best = Infinity, bp: THREE.Vector3 | null = null;
    for (let i = 0; i < this.active; i++) {
      const d = this.pos[i].distanceToSquared(at);
      if (d < best) { best = d; bp = this.pos[i]; }
    }
    return bp;
  }

  private mouth = new THREE.Vector3();

  update(dt: number, t: number): void {
    // flyers live in slots after the active ones
    if (this.flying.length) {
      const e = new THREE.Euler();
      let slot = this.active;
      this.flying = this.flying.filter((f) => (f.t += dt * 3.2) < 1);
      for (const f of this.flying) {
        const k = f.t * f.t;
        const p = f.from.clone().lerp(this.mouth, k);
        p.y += Math.sin(f.t * Math.PI) * 0.6;
        e.set(f.rot.x + f.t * 9, f.rot.y + f.t * 7, f.rot.z);
        this.q.setFromEuler(e);
        const sc = f.scale * (1 - k * 0.7);
        this.s.set(sc, sc, sc);
        this.m.compose(p, this.q, this.s);
        if (slot < this.mesh.instanceMatrix.count) this.mesh.setMatrixAt(slot++, this.m);
      }
      this.mesh.count = Math.min(this.mesh.instanceMatrix.count, this.active + this.flying.length);
      this.mesh.instanceMatrix.needsUpdate = true;
    } else if (this.mesh.count !== this.active) {
      this.mesh.count = this.active;
    }
    if (this.floating && this.active) {
      // a gentle bob, updated a slice at a time
      const n = Math.min(this.active, 120);
      const start = Math.floor((t * 60) % Math.max(1, this.active - n + 1));
      for (let i = start; i < start + n; i++) {
        const p = this.pos[i];
        const by = Math.sin(t * 1.3 + p.x * 2 + p.z) * 0.006;
        const y0 = p.y;
        p.y = y0 + by;
        this.write(i);
        p.y = y0;
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
