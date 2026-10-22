import * as THREE from "three";
import type { WorkKind } from "../content";
import { applyGrime, type GrimeOptions, type MaskBinding } from "../world/grime";

/**
 * A cleanable surface: one plane (a wall face, a floor, a window, a roof
 * slope) with its own dirt mask. Texels are a few centimetres; the tool
 * paints into the mask where the crosshair hits, the shader reads it.
 *
 * Mask channels: R = dirt (or old paint) left, G = wet sheen, B = new paint.
 * Only texels covered by the surface's own geometry count ("valid"), so
 * window holes in a wall never block 100%.
 */

export interface SurfaceSpec {
  key: string;
  /** Shown in the HUD. */
  name: string;
  kind: WorkKind;
  /** Pay for 100%. */
  value: number;
  /** How much longer than plain siding it takes. */
  tough: number;
  /** Plane: origin and in-plane axes (u × v = outward normal), size in metres. */
  origin: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  w: number;
  h: number;
  /** Texels per metre. */
  density?: number;
}

const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();

export class CleanSurface {
  readonly key: string;
  readonly name: string;
  readonly kind: WorkKind;
  value: number;
  readonly tough: number;
  readonly origin: THREE.Vector3;
  readonly u: THREE.Vector3;
  readonly v: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly w: number;
  readonly h: number;
  readonly rw: number;
  readonly rh: number;
  readonly data: Uint8Array<ArrayBuffer>;
  readonly valid: Uint8Array;
  readonly tex: THREE.DataTexture;
  readonly binding: MaskBinding;
  readonly meshes: THREE.Object3D[] = [];
  /** Weighted amount of work left / at the start. */
  private left = 0;
  private total = 1;
  private wetUntil = 0;
  dirty = false;
  done = false;
  area = 0;

  constructor(s: SurfaceSpec) {
    this.key = s.key;
    this.name = s.name;
    this.kind = s.kind;
    this.value = s.value;
    this.tough = s.tough;
    this.origin = s.origin.clone();
    this.u = s.u.clone().normalize();
    this.v = s.v.clone().normalize();
    this.normal = new THREE.Vector3().crossVectors(this.u, this.v).normalize();
    this.w = s.w;
    this.h = s.h;
    const d = s.density ?? 22;
    this.rw = Math.max(4, Math.min(640, Math.round(s.w * d)));
    this.rh = Math.max(4, Math.min(640, Math.round(s.h * d)));
    this.data = new Uint8Array(this.rw * this.rh * 4);
    this.valid = new Uint8Array(this.rw * this.rh);
    this.tex = new THREE.DataTexture(this.data, this.rw, this.rh);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    this.binding = { tex: this.tex, origin: this.origin, u: this.u, v: this.v, size: new THREE.Vector2(this.w, this.h), offset: new THREE.Vector3() };
  }

  /** A material for this surface: a clone of `base` with grime bound to this mask. */
  material(base: THREE.MeshStandardMaterial, g: GrimeOptions): THREE.MeshStandardMaterial {
    const m = base.clone();
    applyGrime(m, g, this.binding);
    return m;
  }

  /** Plane coordinates (texels) of a world point. */
  toTex(p: THREE.Vector3, out = new THREE.Vector2()): THREE.Vector2 {
    _p.copy(p).sub(this.origin);
    return out.set((_p.dot(this.u) / this.w) * this.rw, (_p.dot(this.v) / this.h) * this.rh);
  }

  /**
   * Marks texels covered by triangles of these meshes that face the plane's
   * normal and lie on it. Call after the meshes are placed in the world.
   */
  cover(...meshes: THREE.Mesh[]): this {
    for (const mesh of meshes) {
      this.meshes.push(mesh);
      mesh.userData.surface = this;
      mesh.updateMatrixWorld(true);
      const geo = mesh.geometry;
      const pos = geo.getAttribute("position");
      const idx = geo.index;
      const tri = idx ? idx.count / 3 : pos.count / 3;
      const ta = new THREE.Vector2(), tb = new THREE.Vector2(), tc = new THREE.Vector2();
      for (let t = 0; t < tri; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        _a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
        _b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
        _c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
        _n.subVectors(_b, _a).cross(_p.subVectors(_c, _a)).normalize();
        if (Math.abs(_n.dot(this.normal)) < 0.7) continue;
        if (Math.abs(_p.subVectors(_a, this.origin).dot(this.normal)) > 0.35) continue;
        this.toTex(_a, ta); this.toTex(_b, tb); this.toTex(_c, tc);
        this.fillTri(ta, tb, tc);
      }
    }
    return this;
  }

  /** Marks a rectangle in plane metres as valid (for instanced geometry like fence boards). */
  coverRect(u0: number, v0: number, u1: number, v1: number): this {
    const x0 = Math.max(0, Math.floor((u0 / this.w) * this.rw)), x1 = Math.min(this.rw, Math.ceil((u1 / this.w) * this.rw));
    const y0 = Math.max(0, Math.floor((v0 / this.h) * this.rh)), y1 = Math.min(this.rh, Math.ceil((v1 / this.h) * this.rh));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.valid[y * this.rw + x] = 1;
    return this;
  }

  /** Registers a mesh for raycasts without touching validity. */
  attach(...objs: THREE.Object3D[]): this {
    for (const o of objs) {
      this.meshes.push(o);
      o.userData.surface = this;
    }
    return this;
  }

  private fillTri(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): void {
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))), maxX = Math.min(this.rw - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))), maxY = Math.min(this.rh - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (Math.abs(area) < 1e-6) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b.x - px) * (c.y - py) - (c.x - px) * (b.y - py)) / area;
        const w1 = ((c.x - px) * (a.y - py) - (a.x - px) * (c.y - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) this.valid[y * this.rw + x] = 1;
      }
    }
  }

  /**
   * Fills the mask: dirt everywhere (a little uneven), nothing painted.
   * `restore` = share already clean from a saved run; it is cleared as
   * horizontal bands from the bottom so it reads as work done.
   */
  init(restore = 0): this {
    let n = 0;
    for (let i = 0; i < this.valid.length; i++) if (this.valid[i]) n++;
    this.area = (n / (this.rw * this.rh)) * this.w * this.h;
    const cleanRows = Math.floor(this.rh * Math.min(1, restore));
    for (let y = 0; y < this.rh; y++) {
      for (let x = 0; x < this.rw; x++) {
        const i = y * this.rw + x;
        const clean = y < cleanRows;
        this.data[i * 4] = this.valid[i] && !clean ? 255 : 0;
        this.data[i * 4 + 1] = 0;
        this.data[i * 4 + 2] = this.kind === "paint" && clean ? 255 : 0;
        this.data[i * 4 + 3] = 255;
      }
    }
    this.total = 0;
    for (let i = 0; i < this.valid.length; i++) if (this.valid[i]) this.total += this.kind === "paint" ? 1 : 1;
    this.recount();
    this.done = this.share() >= 0.999;
    this.tex.needsUpdate = true;
    return this;
  }

  private work(i: number): number {
    if (!this.valid[i]) return 0;
    const r = this.data[i * 4] / 255;
    if (this.kind === "paint") return r * 0.4 + (1 - this.data[i * 4 + 2] / 255) * 0.6;
    return r;
  }

  private recount(): void {
    let s = 0;
    for (let i = 0; i < this.valid.length; i++) s += this.work(i);
    this.left = s;
    if (this.total <= 0) this.total = 1;
  }

  /** Share of the surface that is clean (0..1). */
  share(): number {
    return this.done ? 1 : Math.max(0, Math.min(1, 1 - this.left / this.total));
  }

  /**
   * Cleans (or scrapes / paints) around a world point. `amount` = dirt units
   * at the centre (1 = a full layer). Returns the work done, in texel units.
   */
  brush(p: THREE.Vector3, radius: number, amount: number, mode: "clean" | "scrape" | "paint" = "clean", now = 0): number {
    if (this.done) return 0;
    const c = this.toTex(p);
    const rx = (radius / this.w) * this.rw, ry = (radius / this.h) * this.rh;
    const x0 = Math.max(0, Math.floor(c.x - rx)), x1 = Math.min(this.rw - 1, Math.ceil(c.x + rx));
    const y0 = Math.max(0, Math.floor(c.y - ry)), y1 = Math.min(this.rh - 1, Math.ceil(c.y + ry));
    const a = amount / this.tough;
    let did = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * this.rw + x;
        if (!this.valid[i]) continue;
        const dx = (x + 0.5 - c.x) / rx, dy = (y + 0.5 - c.y) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const f = d < 0.36 ? 1 : 1 - (Math.sqrt(d) - 0.6) / 0.4;
        const before = this.work(i);
        const k = i * 4;
        if (mode === "paint") {
          // new paint only takes where the old one is scraped off
          if (this.data[k] < 90) this.data[k + 2] = Math.min(255, this.data[k + 2] + a * f * 255);
        } else {
          this.data[k] = Math.max(0, this.data[k] - a * f * 255);
          if (mode === "clean") this.data[k + 1] = 255;
        }
        const after = this.work(i);
        did += before - after;
      }
    }
    if (did > 0) {
      this.left -= did;
      this.dirty = true;
      if (mode === "clean") this.wetUntil = now + 6;
    }
    return did;
  }

  /** Wipes what is left (when the share passes the "done" line). */
  finish(): void {
    for (let i = 0; i < this.valid.length; i++) {
      if (!this.valid[i]) continue;
      this.data[i * 4] = 0;
      if (this.kind === "paint") this.data[i * 4 + 2] = 255;
    }
    this.left = 0;
    this.done = true;
    this.dirty = true;
  }

  /** Dries the wet sheen over a few seconds; uploads the mask if it changed. */
  update(now: number, dt: number): void {
    if (this.wetUntil > 0) {
      const step = Math.ceil(dt * 70);
      let any = false;
      for (let i = 1; i < this.data.length; i += 4) {
        if (this.data[i] > 0) {
          this.data[i] = Math.max(0, this.data[i] - step);
          any = true;
        }
      }
      this.dirty = this.dirty || any;
      if (!any && now > this.wetUntil) this.wetUntil = 0;
    }
    if (this.dirty) {
      this.tex.needsUpdate = true;
      this.dirty = false;
    }
  }

  /** Where the dirt still is: a few world points (for hints and the "look here" arrow). */
  dirtiestPoint(): THREE.Vector3 | null {
    let best = -1, bi = -1;
    const step = Math.max(1, Math.floor(Math.sqrt((this.rw * this.rh) / 400)));
    for (let y = 0; y < this.rh; y += step) {
      for (let x = 0; x < this.rw; x += step) {
        const i = y * this.rw + x;
        const w = this.work(i);
        if (w > best) { best = w; bi = i; }
      }
    }
    if (bi < 0 || best <= 0.05) return null;
    const x = bi % this.rw, y = Math.floor(bi / this.rw);
    return this.origin.clone()
      .addScaledVector(this.u, ((x + 0.5) / this.rw) * this.w)
      .addScaledVector(this.v, ((y + 0.5) / this.rh) * this.h);
  }
}
