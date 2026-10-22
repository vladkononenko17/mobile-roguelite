import * as THREE from "three";

/**
 * Effects in the world: the pressure-washer jet (a stream of stretched
 * droplets from the nozzle to the wall, a splash cone off the surface and a
 * mist puff), and one pooled particle system for grass clippings, suds,
 * paint chips, dust and the sparkle when a surface is finished.
 */

export class Jet {
  readonly group = new THREE.Group();
  private drops: THREE.InstancedMesh;
  private splash: THREE.InstancedMesh;
  private mist: THREE.Mesh;
  private seeds: Float32Array;
  private sseeds: Float32Array;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private t = 0;
  active = false;

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.75, depthWrite: false });
    const geo = new THREE.SphereGeometry(1, 5, 3);
    this.drops = new THREE.InstancedMesh(geo, mat, 420);
    this.splash = new THREE.InstancedMesh(geo, mat, 220);
    this.drops.frustumCulled = this.splash.frustumCulled = false;
    this.seeds = Float32Array.from({ length: 420 * 3 }, () => Math.random());
    this.sseeds = Float32Array.from({ length: 220 * 4 }, () => Math.random());
    this.mist = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.09, depthWrite: false }));
    this.group.add(this.drops, this.splash, this.mist);
    this.group.visible = false;
  }

  /** `hit` = where the jet lands (or the end of its reach), `normal` of that surface. */
  update(dt: number, from: THREE.Vector3, to: THREE.Vector3, normal: THREE.Vector3 | null, width: number): void {
    this.group.visible = this.active;
    if (!this.active) return;
    this.t += dt;
    const dir = to.clone().sub(from);
    const len = dir.length();
    dir.normalize();
    this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.q);
    for (let i = 0; i < 420; i++) {
      const k = (this.seeds[i * 3] + this.t * 3.5) % 1;
      const spread = k * width * 0.9;
      const a = this.seeds[i * 3 + 1] * Math.PI * 2;
      this.p.copy(from).addScaledVector(dir, k * len).addScaledVector(right, Math.cos(a) * spread).addScaledVector(up, Math.sin(a) * spread);
      const r = 0.003 + this.seeds[i * 3 + 2] * 0.005;
      this.s.set(r, r, r * (8 + k * 10));
      this.m.compose(this.p, this.q, this.s);
      this.drops.setMatrixAt(i, this.m);
    }
    this.drops.instanceMatrix.needsUpdate = true;
    const n = normal ?? dir.clone().negate();
    for (let i = 0; i < 220; i++) {
      const k = (this.sseeds[i * 4] + this.t * 2.6) % 1;
      const v = new THREE.Vector3(this.sseeds[i * 4 + 1] - 0.5, this.sseeds[i * 4 + 2] - 0.5, this.sseeds[i * 4 + 3] - 0.5).normalize().addScaledVector(n, 1.1).normalize();
      this.p.copy(to).addScaledVector(v, k * 0.55);
      this.p.y -= k * k * 0.25;
      const r = 0.004 * (1 - k * 0.6);
      this.s.set(r, r, r * 3);
      this.m.compose(this.p, this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v), this.s);
      this.splash.setMatrixAt(i, this.m);
    }
    this.splash.instanceMatrix.needsUpdate = true;
    this.mist.position.copy(to).addScaledVector(n, 0.12);
    const ms = width * 0.9 + Math.sin(this.t * 20) * 0.01;
    this.mist.scale.set(ms, ms, ms);
  }
}

export type Kind = "clip" | "suds" | "chip" | "dust" | "spark" | "straw" | "water";

const COLORS: Record<Kind, number[]> = {
  clip: [0x4f7a24, 0x6a8f2e, 0x3d6420],
  suds: [0xffffff, 0xeef4ff],
  chip: [0xe9e2d2, 0xd8d0c0, 0xc9c0b0],
  dust: [0x8a7a62, 0x6a5c48],
  spark: [0xfff2b0, 0xffffff, 0xaef5d8],
  straw: [0xd9bd72, 0xc9a85a],
  water: [0xdff0ff],
};

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private n = 900;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private grav: Float32Array;
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();

  constructor() {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.n);
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.life = new Float32Array(this.n);
    this.size = new Float32Array(this.n);
    this.grav = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.mesh.setColorAt(i, this.c.set(0xffffff));
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
    }
  }

  /** Emits `count` particles of a kind at `at` with velocity `v` ± `spread`. */
  emit(kind: Kind, at: THREE.Vector3, count: number, v: THREE.Vector3 = new THREE.Vector3(0, 1, 0), spread = 1): void {
    const cols = COLORS[kind];
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      this.pos[i * 3] = at.x + (Math.random() - 0.5) * 0.05;
      this.pos[i * 3 + 1] = at.y + (Math.random() - 0.5) * 0.05;
      this.pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * 0.05;
      this.vel[i * 3] = v.x + (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 1] = v.y + (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 2] = v.z + (Math.random() - 0.5) * spread;
      this.life[i] = kind === "spark" ? 0.8 : kind === "suds" ? 1.4 : 1.0 + Math.random() * 0.5;
      this.size[i] = kind === "clip" ? 0.025 : kind === "suds" ? 0.03 + Math.random() * 0.03 : kind === "spark" ? 0.035 : kind === "straw" ? 0.05 : 0.02;
      this.grav[i] = kind === "spark" ? -0.5 : kind === "suds" ? 1.2 : kind === "dust" ? 0.6 : 7;
      this.mesh.setColorAt(i, this.c.set(cols[Math.floor(Math.random() * cols.length)]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number, cam: THREE.Camera): void {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.vel[i * 3] *= 1 - dt * 1.5;
      this.vel[i * 3 + 2] *= 1 - dt * 1.5;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.01, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const sc = this.life[i] > 0 ? this.size[i] * Math.min(1, this.life[i] * 3) : 0;
      this.p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.e.set(this.life[i] * 7 + i, this.life[i] * 5, i);
      this.q.setFromEuler(this.e);
      // sparks and suds face the camera
      if (this.grav[i] < 2) this.q.copy(cam.quaternion);
      this.s.set(sc, sc * (this.grav[i] >= 7 ? 0.35 : 1), sc);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      if (this.life[i] <= 0) {
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
      }
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
