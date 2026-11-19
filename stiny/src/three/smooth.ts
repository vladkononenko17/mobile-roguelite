import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Rig } from "../../../rozshuk/src/three/models.ts";

/**
 * The smooth look for «Чотири стіни». The shared models are low-poly by
 * design (flat shading, hard boxes) — here every primitive is rebuilt round
 * and soft: boxes get bevelled edges, cylinders and spheres get many segments,
 * flat-shaded Lambert becomes smooth physically based material, the ink
 * outline thins and warms. Plus real surfaces (wood grain, linen, knit,
 * enamel, brushed metal, glossy plastic), faces with eyes that shine,
 * curtains, a leafy ficus, and sunbeams with dust.
 */

// ------------------------------------------------------------------ textures for materials

function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void, seed: number, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d")!;
  draw(g, rng(seed));
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Light wood grain, to be tinted by the material colour. */
const woodTex = () => canvasTex(512, (g, r) => {
  g.fillStyle = "#d9c3a5";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 140; i++) {
    const y = r() * 512;
    const amp = 2 + r() * 8;
    const f = 0.004 + r() * 0.012;
    const ph = r() * 6;
    g.strokeStyle = `rgba(${90 + r() * 40},${55 + r() * 25},${25},${0.08 + r() * 0.22})`;
    g.lineWidth = 0.6 + r() * 2.4;
    g.beginPath();
    for (let x = 0; x <= 512; x += 6) g.lineTo(x, y + Math.sin(ph + x * f) * amp + Math.sin(x * f * 3.7) * amp * 0.25);
    g.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const x = r() * 512, y = r() * 512;
    for (let k = 7; k > 0; k--) { g.strokeStyle = `rgba(80,45,20,${0.06 + k * 0.025})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y, k * 5, k * 2, 0, 0, Math.PI * 2); g.stroke(); }
  }
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(60,35,15,${r() * 0.05})`; g.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1); }
}, 3);

/** Linen: a fine weave. */
const linenTex = () => canvasTex(256, (g, r) => {
  g.fillStyle = "#e9e5dc";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 2) {
    g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`; g.fillRect(0, i, 256, 1);
    g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.04})`; g.fillRect(i, 0, 1, 256);
  }
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`; g.lineWidth = 2 + r() * 6; g.beginPath(); const x = r() * 256; g.moveTo(x, 0); g.bezierCurveTo(x + 30, 80, x - 30, 170, x + 10, 256); g.stroke(); }
}, 5);

/** Knitted wool: rows of little V stitches. */
const knitTex = () => canvasTex(256, (g, r) => {
  g.fillStyle = "#d8d8d8";
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) for (let x = 0; x < 256; x += 8) {
    const v = 0.75 + r() * 0.25;
    g.fillStyle = `rgba(${255 * v | 0},${255 * v | 0},${255 * v | 0},1)`;
    g.beginPath(); g.ellipse(x + 2, y + 4, 2.2, 4, 0.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(x + 6, y + 4, 2.2, 4, -0.5, 0, Math.PI * 2); g.fill();
  }
  // a stripe pattern woven in
  for (let y = 0; y < 256; y += 64) { g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(0, y + 24, 256, 8); }
}, 7);

/** Brushed metal / enamel speckle. */
const brushedTex = () => canvasTex(256, (g, r) => {
  g.fillStyle = "#c8c8c8";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "0,0,0"},${0.04 + r() * 0.06})`; g.fillRect(0, r() * 256, 256, 1); }
}, 9, false);

/** Book spines: a shelf's worth of colours, titles as pale bars. */
const spinesTex = () => canvasTex(256, (g, r) => {
  const cols = ["#8a2e2a", "#2a4a6a", "#c8b070", "#3a5a3a", "#6a4a7a", "#c86a2a", "#2a2a2a", "#7a6a5a", "#a8483a"];
  let x = 0;
  while (x < 256) {
    const w = 10 + r() * 18;
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.fillRect(x, 0, w, 256);
    g.fillStyle = "rgba(255,240,200,.55)";
    g.fillRect(x + w * 0.25, 60 + r() * 40, w * 0.5, 50 + r() * 60);
    g.fillStyle = "rgba(0,0,0,.25)";
    g.fillRect(x + w - 1.5, 0, 1.5, 256);
    g.fillStyle = "rgba(255,255,255,.08)";
    g.fillRect(x, 0, 2, 256);
    x += w;
  }
}, 13);

let cache: Record<string, THREE.Texture> | null = null;
function textures(): Record<string, THREE.Texture> {
  if (!cache) cache = { wood: woodTex(), linen: linenTex(), knit: knitTex(), brushed: brushedTex(), spines: spinesTex() };
  return cache;
}

export type Surface = "wood" | "linen" | "knit" | "enamel" | "metal" | "plastic" | "gloss" | "rubber" | "spines" | "skin" | "paint";

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** A smooth physically based material of a kind, tinted. Shared per kind and colour. */
export function surface(kind: Surface, color: number, repeat = 1): THREE.MeshStandardMaterial {
  const key = `${kind}:${color}:${repeat}`;
  let m = matCache.get(key);
  if (m) return m;
  const t = textures();
  const withMap = (tex: THREE.Texture) => { const c = tex.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c; };
  switch (kind) {
    case "wood": m = new THREE.MeshStandardMaterial({ color, map: withMap(t.wood), roughness: 0.55, metalness: 0 }); break;
    case "linen": m = new THREE.MeshStandardMaterial({ color, map: withMap(t.linen), roughness: 0.95, metalness: 0 }); break;
    case "knit": m = new THREE.MeshStandardMaterial({ color, map: withMap(t.knit), roughness: 1, metalness: 0 }); break;
    case "enamel": m = new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.02 }); break;
    case "metal": m = new THREE.MeshStandardMaterial({ color, roughnessMap: withMap(t.brushed), roughness: 0.42, metalness: 0.85 }); break;
    case "plastic": m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0 }); break;
    case "gloss": m = new THREE.MeshStandardMaterial({ color, roughness: 0.18, metalness: 0 }); break;
    case "rubber": m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }); break;
    case "spines": m = new THREE.MeshStandardMaterial({ color, map: withMap(t.spines), roughness: 0.75, metalness: 0 }); break;
    case "skin": m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 }); break;
    default: m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 });
  }
  matCache.set(key, m);
  return m;
}

// ------------------------------------------------------------------ the smoothing pass

/** How much detail: characters (round limbs), near (the flat), far (the yard, five floors down). */
export type Detail = "character" | "near" | "far";
const geoCache: Record<Detail, WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>> = { character: new WeakMap(), near: new WeakMap(), far: new WeakMap() };
const softCache = new WeakMap<THREE.Material, THREE.Material>();
const softInk = new THREE.MeshBasicMaterial({ color: 0x2a2026, side: THREE.BackSide });

/** A round, many-segmented version of a primitive (or the geometry itself). */
function roundGeometry(g: THREE.BufferGeometry, detail: Detail): THREE.BufferGeometry {
  const character = detail === "character";
  const far = detail === "far";
  const hit = geoCache[detail].get(g);
  if (hit) return hit;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (g as any).parameters ?? {};
  let out: THREE.BufferGeometry = g;
  switch (g.type) {
    case "BoxGeometry": {
      const w = p.width, h = p.height, d = p.depth;
      const min = Math.min(w, h, d);
      if (min >= 0.012 && !(far && Math.max(w, h, d) > 8)) {
        const r = Math.min(min * (character ? 0.42 : 0.2), character ? 0.09 : far ? 0.08 : 0.045);
        // small parts (book spines, railings, chair legs) need only one ring of bevel
        const small = Math.max(w, h, d) < 0.3;
        out = new RoundedBoxGeometry(w, h, d, character ? 3 : far || small ? 1 : 2, r);
      }
      break;
    }
    case "CylinderGeometry":
      out = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, Math.max(far ? 12 : 24, p.radialSegments), Math.max(1, p.heightSegments), p.openEnded, p.thetaStart, p.thetaLength);
      break;
    case "ConeGeometry":
      out = new THREE.ConeGeometry(p.radius, p.height, Math.max(far ? 12 : 20, p.radialSegments), Math.max(1, p.heightSegments), p.openEnded, p.thetaStart, p.thetaLength);
      break;
    case "SphereGeometry":
      out = new THREE.SphereGeometry(p.radius, Math.max(far ? 14 : character ? 24 : 20, p.widthSegments), Math.max(far ? 9 : character ? 16 : 12, p.heightSegments), p.phiStart, p.phiLength, p.thetaStart, p.thetaLength);
      break;
    case "IcosahedronGeometry":
      out = new THREE.IcosahedronGeometry(p.radius, Math.max(p.detail, far ? 1 : character && p.radius > 0.2 ? 3 : p.radius > 0.1 ? 2 : 1));
      break;
    case "CircleGeometry":
      out = new THREE.CircleGeometry(p.radius, Math.max(far ? 16 : 32, p.segments), p.thetaStart, p.thetaLength);
      break;
    case "RingGeometry":
      out = new THREE.RingGeometry(p.innerRadius, p.outerRadius, Math.max(48, p.thetaSegments), p.phiSegments, p.thetaStart, p.thetaLength);
      break;
  }
  geoCache[detail].set(g, out);
  return out;
}

/** Flat-shaded Lambert → smooth standard material with the same look. */
function softMaterial(m: THREE.Material): THREE.Material {
  const hit = softCache.get(m);
  if (hit) return hit;
  let out: THREE.Material = m;
  if ((m as THREE.MeshLambertMaterial).isMeshLambertMaterial) {
    const l = m as THREE.MeshLambertMaterial;
    const s = new THREE.MeshStandardMaterial({
      color: l.color, map: l.map, emissive: l.emissive, emissiveMap: l.emissiveMap, emissiveIntensity: l.emissiveIntensity,
      transparent: l.transparent, opacity: l.opacity, depthWrite: l.depthWrite, side: l.side, alphaTest: l.alphaTest,
      polygonOffset: l.polygonOffset, polygonOffsetFactor: l.polygonOffsetFactor,
      roughness: 0.78, metalness: 0, flatShading: false,
    });
    out = s;
  } else if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial && (m as THREE.MeshStandardMaterial).flatShading) {
    const c = (m as THREE.MeshStandardMaterial).clone();
    c.flatShading = false;
    out = c;
  }
  softCache.set(m, out);
  return out;
}

/**
 * Rebuilds everything under `root` round and smooth. "character" makes boxes
 * much rounder (limbs, torsos); "far" keeps the triangle count low for things
 * seen from five floors up, and drops their outlines. Safe to call more than once.
 */
export function smoothen(root: THREE.Object3D, level: Detail | boolean = "near"): void {
  const detail: Detail = level === true ? "character" : level === false ? "near" : level;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.smoothed || m.userData.keepShape) return;
    m.userData.smoothed = true;
    if (m.name === "hull") {
      // far away an outline is a pixel of noise and twice the triangles
      if (detail === "far") { m.visible = false; return; }
      // the ink outline: thinner, warmer, following the new shape
      const parent = m.parent as THREE.Mesh | null;
      if (parent?.isMesh) m.geometry = roundGeometry(parent.geometry.userData.src ?? parent.geometry, detail);
      m.material = softInk;
      m.scale.set(1 + (m.scale.x - 1) * 0.55, 1 + (m.scale.y - 1) * 0.55, 1 + (m.scale.z - 1) * 0.55);
      return;
    }
    const src = m.geometry;
    m.geometry = roundGeometry(src, detail);
    m.geometry.userData.src = src;
    m.material = Array.isArray(m.material) ? m.material.map(softMaterial) : softMaterial(m.material);
  });
  // hull children were visited before or after their parents: refit any that saw the old geometry
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.name === "hull" && m.visible && (m.parent as THREE.Mesh)?.isMesh) m.geometry = (m.parent as THREE.Mesh).geometry;
  });
}

// ------------------------------------------------------------------ faces

/**
 * Soft faces for the chibi people: glossy dark eyes with a white catchlight,
 * brows, a small mouth, warm cheeks, ears. Replaces the box eyes.
 */
export function faceUp(rig: Rig, opts: { brow?: number; cheeks?: boolean; tired?: boolean } = {}): void {
  const head = rig.head;
  for (const c of [...head.children]) {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.geometry.type.includes("Box") && Math.abs(m.position.z - 0.245) < 0.02 && Math.abs(m.position.y - 0.02) < 0.02) head.remove(m);
  }
  const eyeMat = surface("gloss", 0x1a1418);
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const brow = surface("rubber", opts.brow ?? 0x3a2a20);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 20, 14), eyeMat);
    eye.scale.set(1, 1.25, 0.6);
    eye.position.set(s * 0.092, 0.02, 0.238);
    eye.userData.smoothed = true;
    head.add(eye);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), shine);
    hi.position.set(s * 0.092 + 0.012, 0.038, 0.262);
    hi.userData.smoothed = true;
    head.add(hi);
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.05, 4, 8), brow);
    b.rotation.z = Math.PI / 2 + s * (opts.tired ? -0.25 : 0.12);
    b.position.set(s * 0.095, 0.085 - (opts.tired ? 0.008 : 0), 0.236);
    b.userData.smoothed = true;
    head.add(b);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), surface("skin", 0xd99a72));
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(s * 0.262, -0.01, 0);
    ear.userData.smoothed = true;
    head.add(ear);
    if (opts.cheeks !== false) {
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshBasicMaterial({ color: 0xe87a6a, transparent: true, opacity: 0.35, depthWrite: false }));
      cheek.position.set(s * 0.14, -0.05, 0.232);
      cheek.rotation.y = s * 0.45;
      cheek.userData.smoothed = true;
      head.add(cheek);
    }
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 16, Math.PI), surface("rubber", 0x5a2a28));
  mouth.rotation.z = opts.tired ? 0 : Math.PI;
  mouth.position.set(0, opts.tired ? -0.135 : -0.11, 0.24);
  mouth.userData.smoothed = true;
  head.add(mouth);
}

// ------------------------------------------------------------------ curtains

/** Two curtain panels hanging in soft folds from a rod, for a window from x0 to x1. */
export function curtains(x0: number, x1: number, top: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const fabric = new THREE.MeshStandardMaterial({ color, map: textures().linen, roughness: 0.95, side: THREE.DoubleSide });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, x1 - x0 + 0.6, 16), surface("metal", 0xb8a888));
  rod.rotation.z = Math.PI / 2;
  rod.position.set((x0 + x1) / 2, top, 0);
  g.add(rod);
  const panel = (cx: number, w: number) => {
    const geo = new THREE.PlaneGeometry(w, top - 0.05, 36, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // folds deeper towards the bottom, gathered at the top
      pos.setZ(i, Math.sin(x * 34) * (0.025 + (0.5 - y / (top - 0.05)) * 0.02));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, fabric);
    m.position.set(cx, (top - 0.05) / 2, 0.02);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.smoothed = true;
    g.add(m);
  };
  panel(x0 - 0.05, 0.5);
  panel(x1 + 0.05, 0.5);
  return g;
}

// ------------------------------------------------------------------ the ficus

/** A leafy ficus in a terracotta pot. Returns the group and its leaves (for the health of the plant). */
export function ficus(): { group: THREE.Group; leaves: THREE.Mesh[] } {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.34, 32), surface("paint", 0xb8603a));
  pot.position.y = 0.17;
  pot.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 10, 32), surface("paint", 0xa85530));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.34;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.19, 32), surface("rubber", 0x3a2a1c));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.32;
  g.add(pot, rim, soil);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 1.0, 12), surface("wood", 0x6a5038));
  stem.position.y = 0.82;
  g.add(stem);
  const leafGeo = new THREE.SphereGeometry(0.1, 16, 10);
  leafGeo.scale(0.62, 0.08, 1.15);
  leafGeo.translate(0, 0, 0.1);
  const leaves: THREE.Mesh[] = [];
  const r = rng(21);
  for (let i = 0; i < 16; i++) {
    const leaf = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.45 }));
    const h = 0.55 + (i / 16) * 0.78;
    const a = i * 2.4;
    leaf.position.set(Math.cos(a) * 0.04, h, Math.sin(a) * 0.04);
    leaf.rotation.set(-0.5 - r() * 0.4, -a + Math.PI / 2, 0);
    leaf.castShadow = true;
    leaf.userData.smoothed = true;
    g.add(leaf);
    leaves.push(leaf);
  }
  for (const o of [pot, rim, soil, stem]) o.userData.smoothed = true;
  return { group: g, leaves };
}

// ------------------------------------------------------------------ sunbeams

/** A soft beam of window light falling into the room, with dust turning in it. */
export class Sunbeam {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private dust: THREE.Points;
  private base: Float32Array;

  constructor(w: number, h: number, len: number) {
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { k: { value: 0 }, color: { value: new THREE.Color(0xffe2b0) }, time: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float k; uniform vec3 color; uniform float time; varying vec2 vUv;
        void main() {
          float along = 1.0 - vUv.y;
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          float shimmer = 0.85 + 0.15 * sin(vUv.x * 40.0 + time * 0.6);
          gl_FragColor = vec4(color * k * 0.16 * along * edge * shimmer, 1.0);
        }`,
    });
    // a slanted quad from the window to the floor
    const geo = new THREE.PlaneGeometry(w, len, 1, 1);
    geo.translate(0, -len / 2, 0);
    const beam = new THREE.Mesh(geo, this.mat);
    beam.userData.noAO = true;
    beam.userData.smoothed = true;
    this.group.add(beam);
    const n = 70;
    this.base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.base[i * 3] = (Math.random() - 0.5) * w; this.base[i * 3 + 1] = -Math.random() * len; this.base[i * 3 + 2] = (Math.random() - 0.5) * 0.3; }
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute("position", new THREE.BufferAttribute(this.base.slice(), 3));
    this.dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ color: 0xfff0d0, size: 0.018, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.dust.userData.noAO = true;
    this.group.add(this.dust);
    void h;
  }

  update(time: number, k: number): void {
    this.group.visible = k > 0.02;
    this.mat.uniforms.k.value = k;
    this.mat.uniforms.time.value = time;
    (this.dust.material as THREE.PointsMaterial).opacity = 0.75 * k;
    const p = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, this.base[i * 3] + Math.sin(time * 0.2 + i) * 0.06, this.base[i * 3 + 1] + Math.sin(time * 0.13 + i * 1.7) * 0.08, this.base[i * 3 + 2] + Math.cos(time * 0.17 + i) * 0.05);
    }
    p.needsUpdate = true;
  }
}
