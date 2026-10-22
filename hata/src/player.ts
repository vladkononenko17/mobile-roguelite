import * as THREE from "three";
import type { WorldIndex } from "./world/index";

/**
 * First-person body: a 0.28 m circle that slides along walls, steps up onto
 * floors, decks and stairs, and can walk on the roof once it has climbed
 * the ladder. The camera sits at eye height with a little head bob.
 */

export class Player {
  readonly pos = new THREE.Vector3();
  feet = 0;
  yaw = 0;
  pitch = 0;
  onRoof = false;
  readonly eye = 1.62;
  readonly radius = 0.28;
  speed = 3.0;
  private bob = 0;
  private vy = 0;
  moving = 0;
  readonly forward = new THREE.Vector3();

  place(x: number, z: number, yaw: number, feet = 0): void {
    this.pos.set(x, 0, z);
    this.feet = feet;
    this.yaw = yaw;
    this.pitch = -0.08;
  }

  look(dx: number, dy: number, sens: number): void {
    this.yaw -= dx * 0.0042 * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0042 * sens, -1.45, 1.35);
  }

  update(dt: number, mx: number, my: number, W: WorldIndex, roofAt: (x: number, z: number) => number | null, walk = 1, sprint = false): void {
    const sp = this.speed * walk * (sprint ? 1.6 : 1) * (this.onRoof ? 0.55 : 1);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const vx = (fx * my + rx * mx) * sp, vz = (fz * my + rz * mx) * sp;
    this.forward.set(fx, 0, fz);
    this.moving = Math.min(1, Math.hypot(mx, my));
    const nx = this.pos.x + vx * dt, nz = this.pos.z + vz * dt;
    if (this.onRoof) {
      const h = roofAt(nx, nz);
      if (h !== null) {
        this.pos.x = nx;
        this.pos.z = nz;
        this.feet = h;
      } else {
        // slide along the edge
        const hx = roofAt(nx, this.pos.z), hz = roofAt(this.pos.x, nz);
        if (hx !== null) { this.pos.x = nx; this.feet = hx; }
        else if (hz !== null) { this.pos.z = nz; this.feet = hz; }
      }
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
      this.collide(W);
      const g = W.groundAt(this.pos.x, this.pos.z, this.feet);
      if (g > this.feet) {
        // step up smoothly
        this.feet = Math.min(g, this.feet + dt * 3.5);
        this.vy = 0;
      } else if (g < this.feet) {
        this.vy -= 9.8 * dt;
        this.feet = Math.max(g, this.feet + this.vy * dt);
        if (this.feet === g) this.vy = 0;
      }
    }
    this.bob += dt * this.moving * sp * 2.6;
  }

  private collide(W: WorldIndex): void {
    const r = this.radius, y0 = this.feet + 0.32, y1 = this.feet + 1.8;
    for (let pass = 0; pass < 3; pass++) {
      for (const b of W.boxes) {
        if (b.y1 < y0 || b.y0 > y1) continue;
        const cx = Math.max(b.x0, Math.min(this.pos.x, b.x1));
        const cz = Math.max(b.z0, Math.min(this.pos.z, b.z1));
        let dx = this.pos.x - cx, dz = this.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-8) {
          // centre inside the box: push out along the shallowest side
          const l = this.pos.x - b.x0, rr = b.x1 - this.pos.x, n = this.pos.z - b.z0, f = b.z1 - this.pos.z;
          const m = Math.min(l, rr, n, f);
          if (m === l) this.pos.x = b.x0 - r;
          else if (m === rr) this.pos.x = b.x1 + r;
          else if (m === n) this.pos.z = b.z0 - r;
          else this.pos.z = b.z1 + r;
          continue;
        }
        const d = Math.sqrt(d2);
        dx /= d; dz /= d;
        this.pos.x = cx + dx * r;
        this.pos.z = cz + dz * r;
      }
      for (const c of W.circles) {
        if (c.y1 < y0 || c.y0 > y1) continue;
        const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
        const d = Math.hypot(dx, dz), m = c.r + r;
        if (d >= m || d < 1e-6) continue;
        this.pos.x = c.x + (dx / d) * m;
        this.pos.z = c.z + (dz / d) * m;
      }
    }
  }

  applyCamera(cam: THREE.Camera): void {
    const b = Math.sin(this.bob) * 0.025 * this.moving;
    cam.position.set(this.pos.x, this.feet + this.eye + b, this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, Math.sin(this.bob * 0.5) * 0.004 * this.moving, "YXZ");
  }
}
