import * as THREE from "three";

/**
 * Look helpers for «Ставка»: cel-shaded materials (the same 4-tone ramp as
 * «Тікай!», without its bent world), glowing materials for bloom, a soft
 * sprite, a small particle system for fire and smoke, and fading trails
 * behind everything that flies.
 */

let ramp: THREE.DataTexture | null = null;
export function toonRamp(): THREE.DataTexture {
  if (!ramp) {
    const tones = [92, 168, 224, 255];
    const data = new Uint8Array(tones.length * 4);
    tones.forEach((v, i) => data.set([v, v, v, 255], i * 4));
    ramp = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
  }
  return ramp;
}

const cache = new Map<string, THREE.MeshToonMaterial>();
/** Cached cel-shaded material. */
export function toon(color: number, opts: { emissive?: number; opacity?: number } = {}): THREE.MeshToonMaterial {
  const key = `${color}|${opts.emissive ?? 0}|${opts.opacity ?? 1}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), emissive: opts.emissive ?? 0 });
    if (opts.opacity !== undefined && opts.opacity < 1) { m.transparent = true; m.opacity = opts.opacity; m.depthWrite = false; }
    cache.set(key, m);
  }
  return m;
}

/** Unlit, brighter than white so the bloom pass catches it. */
export function glow(color: number, k = 2.5, opacity = 1): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  m.color.multiplyScalar(k);
  return m;
}

let softTex: THREE.CanvasTexture | null = null;
export function softTexture(): THREE.CanvasTexture {
  if (!softTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,255,255,0.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    softTex = new THREE.CanvasTexture(c);
  }
  return softTex;
}
export function glowSprite(color: number, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(size, size, 1);
  s.renderOrder = 6;
  return s;
}

// ================================================================ particles

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number; r: number; g: number; b: number; grav: number; drag: number }

export class Particles {
  readonly points: THREE.Points;
  private ps: P[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private cap: number;
  floor = 0.7;

  constructor(cap: number, additive: boolean) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        uniform float scale;
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(size * scale / max(0.5, -mv.z), 120.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          gl_FragColor = vec4(vColor, smoothstep(0.5, 0.15, r) * vAlpha);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setScale(viewportHeight: number, fov: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = viewportHeight / (2 * Math.tan((fov * Math.PI) / 360));
  }

  emit(n: number, at: THREE.Vector3, o: { spread?: number; up?: number; speed?: number; size?: number; grow?: number; life?: number; color: number | number[]; grav?: number; drag?: number }): void {
    const colors = Array.isArray(o.color) ? o.color : [o.color];
    for (let i = 0; i < n; i++) {
      if (this.ps.length >= this.cap) this.ps.shift();
      const c = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
      const sp = o.speed ?? 2;
      const a = Math.random() * Math.PI * 2;
      const s = o.spread ?? 0.3;
      const life = (o.life ?? 0.6) * (0.7 + Math.random() * 0.6);
      this.ps.push({
        x: at.x + (Math.random() - 0.5) * s, y: at.y + Math.random() * s * 0.5, z: at.z + (Math.random() - 0.5) * s,
        vx: Math.cos(a) * sp * Math.random(), vy: (o.up ?? 1) * (0.5 + Math.random()), vz: Math.sin(a) * sp * Math.random(),
        life, max: life, size: (o.size ?? 0.4) * (0.7 + Math.random() * 0.6), grow: o.grow ?? 1, r: c.r, g: c.g, b: c.b, grav: o.grav ?? -4, drag: o.drag ?? 1.5,
      });
    }
  }

  update(dt: number): void {
    const ps = this.ps;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < this.floor) { p.y = this.floor; p.vy *= -0.2; }
      ps[w++] = p;
    }
    ps.length = w;
    for (let i = 0; i < w; i++) {
      const p = ps[i];
      const t = 1 - p.life / p.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
      this.size[i] = p.size * (1 + (p.grow - 1) * t);
      this.alpha[i] = Math.min(1, (1 - t) * 1.6);
    }
    const geo = this.points.geometry;
    for (const name of ["position", "color", "size", "alpha"]) (geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
    geo.setDrawRange(0, w);
  }

  clear(): void { this.ps.length = 0; this.points.geometry.setDrawRange(0, 0); }
}

// ================================================================ trails

/**
 * Fading line trails, all in one draw call: each trail is a ring of the last
 * N positions, drawn as line segments whose colour fades out to the tail.
 */
export class Trails {
  readonly lines: THREE.LineSegments;
  private n: number;
  private cap: number;
  private pts = new Map<number, { buf: THREE.Vector3[]; color: THREE.Color; k: number; dead: number; stamp: number }>();
  private pos: Float32Array;
  private col: Float32Array;

  constructor(cap: number, n = 18, additive = true) {
    this.cap = cap;
    this.n = n;
    this.pos = new Float32Array(cap * (n - 1) * 2 * 3);
    this.col = new Float32Array(cap * (n - 1) * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 4;
  }

  /** Add the current position of trail `id` (call every frame or every few frames). */
  push(id: number, p: THREE.Vector3, color: number, k = 1, stamp = 0): void {
    let t = this.pts.get(id);
    if (!t) {
      if (this.pts.size >= this.cap) return;
      t = { buf: [], color: new THREE.Color(color).multiplyScalar(k), k, dead: 0, stamp };
      this.pts.set(id, t);
    }
    t.dead = 0;
    const last = t.buf[t.buf.length - 1];
    if (last && last.distanceToSquared(p) < 0.0004) return;
    t.buf.push(p.clone());
    if (t.buf.length > this.n) t.buf.shift();
  }
  /** Let a trail fade away (its head stops being fed). */
  release(id: number): void { const t = this.pts.get(id); if (t) t.dead = Math.max(t.dead, 0.001); }
  clear(): void { this.pts.clear(); this.lines.geometry.setDrawRange(0, 0); }

  update(dt: number): void {
    let v = 0;
    for (const [id, t] of this.pts) {
      if (t.dead > 0) {
        t.dead += dt;
        if (t.dead > 1.2 || t.buf.length < 2) { this.pts.delete(id); continue; }
        if (Math.random() < dt * 14) t.buf.shift();
      }
      const fade = t.dead > 0 ? Math.max(0, 1 - t.dead / 1.2) : 1;
      for (let i = 1; i < t.buf.length; i++) {
        const a = t.buf[i - 1], b = t.buf[i];
        const ka = ((i - 1) / (t.buf.length - 1)) * fade, kb = (i / (t.buf.length - 1)) * fade;
        this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], v * 3);
        this.col.set([t.color.r * ka, t.color.g * ka, t.color.b * ka, t.color.r * kb, t.color.g * kb, t.color.b * kb], v * 3);
        v += 2;
      }
    }
    const geo = this.lines.geometry;
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    geo.setDrawRange(0, v);
  }
}
