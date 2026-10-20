import * as THREE from "three";

/**
 * The "mobile runner" look for «Тікай!»: the bent world (the road falls away
 * over the horizon like in Subway Surfers), cel shading, a gradient sky with
 * clouds, and a small particle system for dust, sparks, coin glints, nitro
 * flames and smoke.
 */

// ================================================================ the bent world

/** How hard the world bends: y drops by curve·distance² in view space. Shared by every material. */
export const CURVE = { value: 0.0011 };
let installed = false;

/**
 * Patch three's shader chunks once, before anything compiles: every built-in
 * material (and sprites) bends vertices down with distance from the camera.
 * Shadow and depth passes stay straight, so shadows are looked up in the real
 * (unbent) world and land in the right place.
 */
export function installCurve(): void {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.common = `uniform float curveK;\n${THREE.ShaderChunk.common}`;
  const bend = `
#if !defined( DEPTH_PACKING ) && !defined( DISTANCE )
  mvPosition.y -= curveK * mvPosition.z * mvPosition.z;
#endif
gl_Position = projectionMatrix * mvPosition;`;
  THREE.ShaderChunk.project_vertex = THREE.ShaderChunk.project_vertex.replace("gl_Position = projectionMatrix * mvPosition;", bend);
  THREE.ShaderLib.sprite.vertexShader = THREE.ShaderLib.sprite.vertexShader.replace("gl_Position = projectionMatrix * mvPosition;", bend);
  // every material gets the same uniform object, so changing CURVE.value bends everything at once
  const proto = THREE.Material.prototype as unknown as { onBeforeCompile: (s: { uniforms: Record<string, unknown> }) => void };
  proto.onBeforeCompile = function (shader) { shader.uniforms.curveK = CURVE; };
}

// ================================================================ cel shading

let gradient: THREE.DataTexture | null = null;
function toonRamp(): THREE.DataTexture {
  if (!gradient) {
    const tones = [96, 170, 225, 255];
    const data = new Uint8Array(tones.length * 4);
    tones.forEach((v, i) => data.set([v, v, v, 255], i * 4));
    gradient = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const toonCache = new WeakMap<THREE.Material, THREE.Material>();
/** The cel-shaded twin of a Lambert material (same colour, texture and glow). */
export function toon(m: THREE.Material): THREE.Material {
  if (!(m as THREE.MeshLambertMaterial).isMeshLambertMaterial) return m;
  let t = toonCache.get(m);
  if (!t) {
    const l = m as THREE.MeshLambertMaterial;
    const tm = new THREE.MeshToonMaterial({
      color: l.color.clone(), map: l.map, gradientMap: toonRamp(), emissive: l.emissive.clone(), emissiveMap: l.emissiveMap,
      emissiveIntensity: l.emissiveIntensity, transparent: l.transparent, opacity: l.opacity, side: l.side, depthWrite: l.depthWrite,
    });
    (tm as unknown as { flatShading: boolean }).flatShading = l.flatShading;
    // a touch more saturation than the flat look of the other games
    const hsl = { h: 0, s: 0, l: 0 };
    tm.color.getHSL(hsl);
    tm.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.15), hsl.l);
    t = tm;
    toonCache.set(m, t);
    toonCache.set(t, t);
  }
  return t;
}

/** Swap every Lambert material under `root` for its cel-shaded twin. */
export function toonify(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (Array.isArray(m.material)) m.material = m.material.map(toon);
    else m.material = toon(m.material);
  });
}

// ================================================================ sky

export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh;
  private clouds: THREE.Mesh[] = [];
  private uniforms = {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    bottom: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0.3, 0.25, 1).normalize() },
    sunColor: { value: new THREE.Color() },
    sunSize: { value: 0.02 },
  };

  constructor() {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunSize;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.55, h), 0.8)) : mix(horizon, bottom, smoothstep(0.0, -0.15, h));
            float s = max(dot(normalize(vDir), sunDir), 0.0);
            c += sunColor * (smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.7, s) * 1.4 + pow(s, 90.0) * 0.4 + pow(s, 12.0) * 0.08);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);
    const tex = cloudTexture();
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, tint: { value: new THREE.Color(0xffffff) }, opacity: { value: 0.95 } },
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform sampler2D map; uniform vec3 tint; uniform float opacity; varying vec2 vUv;
        void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * tint, t.a * opacity); }`,
    });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), mat);
      c.renderOrder = -9;
      c.frustumCulled = false;
      this.clouds.push(c);
      this.group.add(c);
    }
  }

  set(time: "day" | "dusk" | "night", far: number): void {
    const u = this.uniforms;
    if (time === "night") {
      u.top.value.set(0x05081a); u.horizon.value.set(0x1c2a4a); u.bottom.value.set(0x0e1424);
      u.sunColor.value.set(0xd8e4ff); u.sunSize.value = 0.0012; u.sunDir.value.set(-0.4, 0.35, 1).normalize();
    } else if (time === "dusk") {
      u.top.value.set(0x3a4a8a); u.horizon.value.set(0xf0a070); u.bottom.value.set(0xc88a6a);
      u.sunColor.value.set(0xffb060); u.sunSize.value = 0.0028; u.sunDir.value.set(0.35, 0.06, 1).normalize();
    } else {
      u.top.value.set(0x3f8fe0); u.horizon.value.set(0xcfe8f4); u.bottom.value.set(0xa8cce0);
      u.sunColor.value.set(0xfff4d0); u.sunSize.value = 0.0016; u.sunDir.value.set(0.35, 0.4, 1).normalize();
    }
    const r = far * 0.92;
    this.dome.scale.setScalar(r);
    const cm = this.clouds[0].material as THREE.ShaderMaterial;
    (cm.uniforms.tint.value as THREE.Color).set(time === "night" ? 0x4a5a7a : time === "dusk" ? 0xffc8a8 : 0xffffff);
    cm.uniforms.opacity.value = time === "night" ? 0.35 : 0.95;
    this.clouds.forEach((c, i) => {
      const a = -0.9 + (i / (this.clouds.length - 1)) * 1.8 + Math.sin(i * 7.3) * 0.08;
      const w = r * (0.32 + ((i * 37) % 10) / 40);
      c.scale.set(w, w, 1);
      c.position.set(Math.sin(a) * r * 0.8, r * (0.18 + ((i * 13) % 7) / 40), Math.cos(a) * r * 0.8);
      c.lookAt(0, c.position.y * 0.6, 0);
    });
  }

  /** Keep the sky centred on the camera; clouds drift slowly. */
  update(camera: THREE.Camera, dt: number): void {
    this.group.position.copy(camera.position);
    this.group.rotation.y += dt * 0.004;
  }
}

function cloudTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 128;
  const g = cv.getContext("2d")!;
  const puffs = [[70, 82, 40], [112, 64, 52], [160, 74, 44], [196, 88, 32], [128, 92, 46], [44, 96, 26]];
  // ink rim, then the puffs, then a soft shadow on the bottom
  g.fillStyle = "rgba(60,70,90,.35)";
  for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y + 4, r + 4, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = "#ffffff";
  for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = "rgba(170,190,215,.55)";
  g.fillRect(20, 100, 220, 28);
  g.globalCompositeOperation = "destination-in";
  g.fillStyle = "#000";
  for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y + 4, r + 4, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ================================================================ particles

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number; r: number; g: number; b: number; grav: number; drag: number }

/** CPU particles drawn as soft round points. One system per blending mode. */
export class Particles {
  readonly points: THREE.Points;
  private ps: P[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private cap: number;
  /** Overall opacity: dust is soft, sparks are not. */
  opacity = 1;

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
      uniforms: { scale: { value: 400 }, curveK: CURVE },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        uniform float scale; uniform float curveK;
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          mv.y -= curveK * mv.z * mv.z;
          gl_PointSize = min(size * scale / max(0.5, -mv.z), 90.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.18, r) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.userData.noAO = true;
  }

  setScale(viewportHeight: number, fov: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = viewportHeight / (2 * Math.tan((fov * Math.PI) / 360));
  }

  emit(n: number, at: THREE.Vector3, o: { spread?: number; up?: number; fwd?: number; speed?: number; size?: number; grow?: number; life?: number; color: number | number[]; grav?: number; drag?: number }): void {
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
        vx: Math.cos(a) * sp * Math.random(), vy: (o.up ?? 1) * (0.5 + Math.random()), vz: Math.sin(a) * sp * Math.random() + (o.fwd ?? 0),
        life, max: life, size: (o.size ?? 0.4) * (0.7 + Math.random() * 0.6), grow: o.grow ?? 1, r: c.r, g: c.g, b: c.b, grav: o.grav ?? -6, drag: o.drag ?? 1.5,
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
      if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; }
      ps[w++] = p;
    }
    ps.length = w;
    for (let i = 0; i < w; i++) {
      const p = ps[i];
      const t = 1 - p.life / p.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
      this.size[i] = p.size * (1 + (p.grow - 1) * t);
      this.alpha[i] = Math.min(1, (1 - t) * 1.6) * this.opacity;
    }
    const geo = this.points.geometry;
    for (const name of ["position", "color", "size", "alpha"]) (geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
    geo.setDrawRange(0, w);
  }

  clear(): void { this.ps.length = 0; this.points.geometry.setDrawRange(0, 0); }
}
