import * as THREE from "three";

/**
 * Shared shader inputs for the light effects that make the sunset read:
 * where the sun is (for grass and leaves glowing when you look toward it),
 * its colour, and a clock for the wind. Updated once per frame by the game.
 */
export const atmos = {
  sunDir: { value: new THREE.Vector3(0.7, 0.2, 0.7).normalize() },
  sunColor: { value: new THREE.Color(1, 0.6, 0.3) },
  time: { value: 0 },
};

/**
 * Light dust and pollen floating in the air around you: a few hundred soft
 * points that catch the low sun. One additive draw, no depth writes.
 */
export class Motes {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private readonly n = 260;
  private readonly box = 9;

  constructor() {
    const n = this.n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.box;
      this.pos[i * 3 + 1] = 0.3 + Math.random() * 2.6;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.box;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.08;
      this.vel[i * 3 + 1] = (Math.random() - 0.4) * 0.04;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,240,210,0.5)");
    g.addColorStop(1, "rgba(255,230,200,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(c), size: 0.035, sizeAttenuation: true, color: 0xffd9a0,
      transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /** Drifts the motes and keeps them in a box around `center` (positions are world space). */
  update(dt: number, center: THREE.Vector3, t: number): void {
    const p = this.pos, v = this.vel, h = this.box / 2;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      p[k] += (v[k] + Math.sin(t * 0.7 + i) * 0.03) * dt;
      p[k + 1] += (v[k + 1] + Math.sin(t * 0.9 + i * 1.7) * 0.02) * dt;
      p[k + 2] += (v[k + 2] + Math.cos(t * 0.6 + i * 0.5) * 0.03) * dt;
      // wrap around the player
      if (p[k] < center.x - h) p[k] += this.box; else if (p[k] > center.x + h) p[k] -= this.box;
      if (p[k + 2] < center.z - h) p[k + 2] += this.box; else if (p[k + 2] > center.z + h) p[k + 2] -= this.box;
      if (p[k + 1] < 0.2) p[k + 1] = 2.9; else if (p[k + 1] > 3) p[k + 1] = 0.25;
    }
    (this.points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }
}
