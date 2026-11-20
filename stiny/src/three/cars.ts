import * as THREE from "three";
import { bake, box, canvas, chrome, cyl, group, lathe, lumpy, profile, put, rbox, rng, rubber, std, steel, tex, warp, type Rand } from "./kit.ts";

/**
 * The cars of a Kyiv courtyard, modelled from their real proportions: an old
 * Daewoo Lanos, a VAZ-2107 «сімка» with chrome bumpers, a small modern hatch,
 * a crossover, and the grey minibus that every man in the building knows.
 * Bodies are extruded side profiles with real wheel arches; glass, pillars,
 * lights, bumpers, mirrors and Ukrainian plates are separate parts. Every car
 * keeps a `snow` group for winter.
 */

export type CarKind = "lanos" | "zhiguli" | "hatch" | "suv";

const PAINTS = [0xa9adb2, 0x1d1e22, 0xe4e3de, 0x4a4d52, 0x24324c, 0x7e1d1f, 0xb6a785, 0x2f4a3c, 0x6a6f74];
const OLD_PAINTS = [0xc6b48c, 0xdcd8c8, 0x5e1c26, 0x2d2640, 0x2a4a5a, 0x3c6a62, 0xa8442a, 0x8a8f6a];

const glass = () => std(0x141a20, { rough: 0.06, metal: 0.3, key: "car-glass" });
const blackTrim = () => std(0x141416, { rough: 0.6 });
const lampGlass = () => std(0xe8eef2, { rough: 0.1, metal: 0.4, emissive: 0x30302a, emissiveIntensity: 0.4 });
const redLamp = () => std(0x8a0e10, { rough: 0.2, emissive: 0x3a0404, emissiveIntensity: 0.6 });
const amberLamp = () => std(0xd8781a, { rough: 0.25, emissive: 0x401a00, emissiveIntensity: 0.4 });

// ------------------------------------------------------------------ plates

const REGIONS = ["AA", "KA", "AI", "KI", "BC", "AX", "BH", "AE"];
const LETTERS = "ABCEHIKMOPTX";
function plateText(r: Rand): string {
  const n = String(Math.floor(r() * 9000) + 1000);
  return `${REGIONS[Math.floor(r() * REGIONS.length)]} ${n} ${LETTERS[Math.floor(r() * 12)]}${LETTERS[Math.floor(r() * 12)]}`;
}
const plateCache = new Map<string, THREE.MeshStandardMaterial>();
/** A Ukrainian plate: white, black border, the blue-and-yellow flag with UA on the left. */
function plate(text: string): THREE.MeshStandardMaterial {
  let m = plateCache.get(text);
  if (m) return m;
  const [cv, g] = canvas(256, 56);
  g.fillStyle = "#f4f4f0"; g.fillRect(0, 0, 256, 56);
  g.strokeStyle = "#111"; g.lineWidth = 3; g.strokeRect(2, 2, 252, 52);
  g.fillStyle = "#1f5aa8"; g.fillRect(5, 5, 26, 23);
  g.fillStyle = "#f5d020"; g.fillRect(5, 28, 26, 13);
  g.fillStyle = "#1f5aa8"; g.font = "bold 13px Arial, sans-serif"; g.textAlign = "center"; g.fillText("UA", 18, 52);
  g.fillStyle = "#111"; g.font = "bold 40px 'Arial Narrow', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 144, 30, 214);
  m = new THREE.MeshStandardMaterial({ map: tex(cv, { wrap: false }), roughness: 0.4, metalness: 0.2 });
  plateCache.set(text, m);
  return m;
}

// ------------------------------------------------------------------ wheels

const tireGeo = new Map<string, THREE.BufferGeometry>();
/** A tyre: a revolved cross-section with a rounded shoulder, lying on its side (axle on x). */
function tire(R: number, w: number): THREE.BufferGeometry {
  const key = `${R}|${w}`;
  let g = tireGeo.get(key);
  if (!g) {
    const r0 = R * 0.62, h = w / 2;
    const pts: Array<[number, number]> = [[r0, -h * 0.85], [R * 0.86, -h], [R * 0.97, -h * 0.9], [R, -h * 0.6], [R, h * 0.6], [R * 0.97, h * 0.9], [R * 0.86, h], [r0, h * 0.85]];
    g = lathe(pts, 12);
    g.rotateZ(Math.PI / 2);
    tireGeo.set(key, g);
  }
  return g;
}

function wheel(parent: THREE.Object3D, x: number, y: number, z: number, R: number, w: number, side: number, alloy: boolean): void {
  put(parent, tire(R, w), rubber(0x18181a), x, y, z);
  const rimR = R * 0.62;
  const face = x + side * w * 0.36;
  if (alloy) {
    put(parent, cyl(rimR, rimR, 0.04, 14), steel(0xb8bcc2), face - side * 0.02, y, z, { rz: Math.PI / 2 });
    put(parent, cyl(rimR * 0.82, rimR * 0.82, 0.045, 14), std(0x2a2c30, { rough: 0.5, metal: 0.6 }), face - side * 0.014, y, z, { rz: Math.PI / 2 });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      put(parent, box(0.03, rimR * 0.85, 0.06), steel(0xc4c8cc), face, y + Math.cos(a) * rimR * 0.42, z + Math.sin(a) * rimR * 0.42, { rx: -a });
    }
    put(parent, cyl(rimR * 0.2, rimR * 0.2, 0.05, 8), steel(0xd0d4d8), face + side * 0.005, y, z, { rz: Math.PI / 2 });
  } else {
    // a steel rim with the round hubcap of the old cars
    put(parent, cyl(rimR, rimR, 0.04, 14), std(0x3a3c40, { rough: 0.5, metal: 0.6 }), face - side * 0.02, y, z, { rz: Math.PI / 2 });
    put(parent, lathe([[0, 0.035], [rimR * 0.55, 0.025], [rimR * 0.7, 0]], 12), chrome(), face, y, z, { rz: -side * Math.PI / 2 });
  }
}

// ------------------------------------------------------------------ profiles

type P = Array<[number, number]>;
/** The bottom edge from rear to front, rising in an arch over each wheel. */
function bottom(u0: number, u1: number, v: number, wheels: Array<[number, number]>, cv: number): P {
  const pts: P = [[u0, v]];
  for (const [c, rho] of wheels) {
    pts.push([c - rho, v]);
    for (let k = 0; k <= 12; k++) { const t = Math.PI - (Math.PI * k) / 12; pts.push([c + rho * Math.cos(t), cv + rho * Math.sin(t)]); }
    pts.push([c + rho, v]);
  }
  pts.push([u1, v]);
  return pts;
}

interface Spec {
  L: number; W: number; R: number; tireW: number; wf: number; wr: number; clear: number;
  lower: P; glass: P; glassW: number; roof: P; cPillar?: P; bPillar?: [number, number, number]; aPillar: [number, number, number, number];
  head: Array<{ u: number; v: number; w: number; h: number; x: number }>; tail: Array<{ u: number; v: number; w: number; h: number; x: number }>;
  plateF: [number, number]; plateR: [number, number]; doors: number[]; doorV: [number, number]; mirror: [number, number];
  chromeBumpers?: boolean; alloy: boolean; rails?: boolean; cladding?: boolean; snowParts: Array<[number, number, number, number]>;
}

function spec(kind: CarKind): Spec {
  switch (kind) {
    case "lanos": {
      const R = 0.29, wf = 1.30, wr = -1.22;
      return {
        L: 4.24, W: 1.68, R, tireW: 0.19, wf, wr, clear: 0.3,
        lower: [...bottom(-2.02, 2.0, 0.3, [[wr, 0.37], [wf, 0.37]], 0.3),
          [2.1, 0.36], [2.13, 0.5], [2.12, 0.62], [2.06, 0.7], [1.8, 0.78], [1.2, 0.85], [0.78, 0.9],
          [-1.3, 0.93], [-1.42, 0.95], [-1.9, 0.96], [-2.08, 0.92], [-2.13, 0.8], [-2.14, 0.55], [-2.1, 0.36]],
        glass: [[0.8, 0.88], [0.02, 1.37], [-0.8, 1.39], [-1.45, 0.94], [-1.45, 0.88]], glassW: 1.42,
        roof: [[0.07, 1.355], [0.0, 1.4], [-0.82, 1.415], [-0.88, 1.375]],
        cPillar: [[-0.6, 1.37], [-0.84, 1.39], [-1.45, 0.94], [-1.08, 0.93]], bPillar: [-0.08, 0.06, 0.93], aPillar: [0.8, 0.9, 0.02, 1.37],
        head: [{ u: 2.06, v: 0.665, w: 0.42, h: 0.11, x: 0.55 }], tail: [{ u: -2.11, v: 0.84, w: 0.4, h: 0.13, x: 0.6 }],
        plateF: [2.14, 0.47], plateR: [-2.145, 0.66], doors: [0.74, -0.05, -0.98], doorV: [0.36, 0.92], mirror: [0.68, 0.98],
        alloy: false, snowParts: [[0.0, -0.82, 1.42, 1.38], [1.95, 0.85, 0.8, 1.5], [-1.48, -2.0, 0.97, 1.5]],
      };
    }
    case "zhiguli": {
      const R = 0.3, wf = 1.27, wr = -1.15;
      return {
        L: 4.14, W: 1.62, R, tireW: 0.18, wf, wr, clear: 0.32,
        lower: [...bottom(-2.0, 1.95, 0.32, [[wr, 0.37], [wf, 0.37]], 0.31),
          [2.0, 0.4], [2.02, 0.74], [1.98, 0.8], [0.85, 0.84], [0.8, 0.86],
          [-1.2, 0.88], [-1.26, 0.9], [-1.95, 0.91], [-2.04, 0.86], [-2.06, 0.42]],
        glass: [[0.82, 0.84], [0.3, 1.39], [-0.92, 1.41], [-1.3, 0.92], [-1.3, 0.85]], glassW: 1.38,
        roof: [[0.34, 1.375], [0.28, 1.42], [-0.94, 1.435], [-0.99, 1.395]],
        cPillar: [[-0.72, 1.4], [-0.95, 1.41], [-1.3, 0.92], [-1.02, 0.9]], bPillar: [-0.2, -0.12, 0.88], aPillar: [0.82, 0.86, 0.3, 1.39],
        head: [{ u: 2.02, v: 0.63, w: 0.36, h: 0.16, x: 0.56 }], tail: [{ u: -2.065, v: 0.72, w: 0.5, h: 0.17, x: 0.52 }],
        plateF: [2.11, 0.47], plateR: [-2.07, 0.58], doors: [0.76, -0.16, -1.02], doorV: [0.38, 0.87], mirror: [0.72, 0.93],
        chromeBumpers: true, alloy: false, snowParts: [[0.28, -0.94, 1.44, 1.34], [1.95, 0.85, 0.84, 1.46], [-1.3, -2.0, 0.92, 1.44]],
      };
    }
    case "hatch": {
      const R = 0.31, wf = 1.28, wr = -1.2;
      return {
        L: 4.0, W: 1.72, R, tireW: 0.2, wf, wr, clear: 0.32,
        lower: [...bottom(-1.92, 1.92, 0.32, [[wr, 0.39], [wf, 0.39]], 0.31),
          [2.0, 0.38], [2.02, 0.55], [1.98, 0.68], [1.75, 0.8], [1.05, 0.92], [0.85, 0.95],
          [-1.45, 1.0], [-1.86, 1.0], [-1.98, 0.92], [-2.0, 0.4]],
        glass: [[0.88, 0.93], [0.05, 1.43], [-1.35, 1.45], [-1.8, 1.02], [-1.8, 0.95]], glassW: 1.46,
        roof: [[0.09, 1.415], [0.03, 1.465], [-1.36, 1.48], [-1.43, 1.43]],
        cPillar: [[-1.05, 1.44], [-1.37, 1.45], [-1.8, 1.02], [-1.45, 1.0]], bPillar: [-0.2, -0.08, 0.98], aPillar: [0.88, 0.95, 0.05, 1.43],
        head: [{ u: 1.97, v: 0.69, w: 0.44, h: 0.12, x: 0.56 }], tail: [{ u: -1.97, v: 0.86, w: 0.3, h: 0.2, x: 0.68 }],
        plateF: [2.03, 0.46], plateR: [-1.995, 0.62], doors: [0.82, -0.14, -1.1], doorV: [0.38, 0.97], mirror: [0.72, 1.02],
        alloy: true, snowParts: [[0.03, -1.36, 1.46, 1.4], [1.9, 0.9, 0.86, 1.5]],
      };
    }
    case "suv": {
      const R = 0.34, wf = 1.35, wr = -1.33;
      return {
        L: 4.34, W: 1.82, R, tireW: 0.22, wf, wr, clear: 0.42,
        lower: [...bottom(-2.08, 2.05, 0.42, [[wr, 0.42], [wf, 0.42]], 0.34),
          [2.15, 0.55], [2.17, 0.8], [2.12, 0.92], [1.85, 1.02], [1.0, 1.1], [0.92, 1.12],
          [-1.75, 1.15], [-2.05, 1.15], [-2.15, 1.05], [-2.17, 0.55]],
        glass: [[0.95, 1.1], [0.18, 1.61], [-1.8, 1.63], [-2.02, 1.17], [-2.02, 1.12]], glassW: 1.56,
        roof: [[0.22, 1.595], [0.17, 1.645], [-1.82, 1.66], [-1.9, 1.61]],
        cPillar: [[-1.42, 1.62], [-1.8, 1.63], [-2.02, 1.17], [-1.7, 1.15]], bPillar: [-0.25, -0.12, 1.14], aPillar: [0.95, 1.12, 0.18, 1.61],
        head: [{ u: 2.12, v: 0.86, w: 0.46, h: 0.13, x: 0.6 }], tail: [{ u: -2.14, v: 1.0, w: 0.26, h: 0.24, x: 0.74 }],
        plateF: [2.18, 0.6], plateR: [-2.17, 0.78], doors: [0.88, -0.2, -1.32], doorV: [0.5, 1.12], mirror: [0.8, 1.18],
        alloy: true, rails: true, cladding: true, snowParts: [[0.17, -1.82, 1.66, 1.5], [2.0, 0.95, 1.06, 1.6]],
      };
    }
  }
}

/**
 * Real bodies are not slabs: the glasshouse leans in towards the roof
 * (tumblehome) and the corners round off in plan. Applied to the baked body.
 */
function shape(body: THREE.Object3D, belt: number, top: number, L: number, lean: number): void {
  warp(body, (v) => {
    if (v.y > belt) v.x *= 1 - lean * Math.min(1, (v.y - belt) / (top - belt));
    const e = Math.abs(v.z) / (L / 2);
    if (e > 0.72) v.x *= 1 - 0.08 * ((e - 0.72) / 0.28) ** 2;
  });
}

/** One parked car, its front towards +z. `seed` picks the colour and the plate. */
export function makeCar(kind: CarKind, seed: number, color?: number): THREE.Group {
  const r = rng(seed * 131 + 7);
  const s = spec(kind);
  const root = new THREE.Group();
  root.name = `car-${kind}`;
  const body = group(root);
  const paint = color ?? (kind === "zhiguli" ? OLD_PAINTS : PAINTS)[Math.floor(r() * (kind === "zhiguli" ? OLD_PAINTS.length : PAINTS.length))];
  const old = kind === "zhiguli" || kind === "lanos";
  const paintM = std(paint, { rough: old ? 0.5 : 0.28, metal: old ? 0.15 : 0.45, key: "car-paint" });
  const hw = s.W / 2;
  // the body, the glass, the roof and the pillars
  put(body, profile(s.lower, s.W, 0.06, 8), paintM, 0, 0, 0);
  put(body, profile(s.glass, s.glassW, 0.03, 4), glass(), 0, 0, 0);
  put(body, profile([...s.roof, [s.roof[3][0], s.roof[3][1] - 0.02], [s.roof[0][0], s.roof[0][1] - 0.02]], s.glassW + 0.03, 0.02, 4), paintM, 0, 0, 0);
  if (s.cPillar) for (const sd of [-1, 1]) put(body, profile(s.cPillar, 0.03, 0.008, 2), paintM, sd * (s.glassW / 2 + 0.003), 0, 0);
  const [au0, av0, au1, av1] = s.aPillar;
  for (const sd of [-1, 1]) {
    const dx = au1 - au0, dy = av1 - av0, len = Math.hypot(dx, dy);
    put(body, rbox(0.035, 0.07, len, 0.012, 1), paintM, sd * (s.glassW / 2 + 0.006), (av0 + av1) / 2, (au0 + au1) / 2, { rx: Math.atan2(-dy, dx) });
    if (s.bPillar) put(body, rbox(0.03, s.roof[1][1] - s.bPillar[2], s.bPillar[1] - s.bPillar[0], 0.008, 1), kind === "zhiguli" ? paintM : blackTrim(), sd * (s.glassW / 2 + 0.006), (s.roof[1][1] + s.bPillar[2]) / 2, (s.bPillar[0] + s.bPillar[1]) / 2);
  }
  // door gaps and handles
  for (const sd of [-1, 1]) {
    for (const u of s.doors) put(body, box(0.006, s.doorV[1] - s.doorV[0], 0.008), blackTrim(), sd * (hw + 0.001), (s.doorV[0] + s.doorV[1]) / 2, u, { shadow: false });
    for (const u of [s.doors[0] - 0.42, s.doors[1] - 0.5]) put(body, rbox(0.02, 0.025, 0.12, 0.008, 1), kind === "zhiguli" ? chrome() : paintM, sd * (hw + 0.008), s.doorV[1] - 0.12, u);
    // the mirror on its stalk
    const [mu, mv] = s.mirror;
    put(body, rbox(0.12, 0.1, 0.06, 0.025, 1), kind === "zhiguli" ? blackTrim() : paintM, sd * (hw + 0.07), mv + 0.02, mu);
    put(body, box(0.08, 0.04, 0.03), blackTrim(), sd * (hw + 0.02), mv, mu + 0.02);
  }
  // wheels, the dark inside of the arches
  for (const u of [s.wf, s.wr]) for (const sd of [-1, 1]) {
    put(body, cyl(s.R + 0.06, s.R + 0.06, 0.04, 12), std(0x0c0c0e, { rough: 1 }), sd * (hw - 0.2), s.R, u, { rz: Math.PI / 2, shadow: false });
    wheel(body, sd * (hw - s.tireW / 2 - 0.02), s.R, u, s.R, s.tireW, sd, s.alloy);
  }
  // lights
  const front = s.L / 2;
  for (const l of s.head) for (const sd of [-1, 1]) put(body, rbox(l.w, l.h, 0.08, 0.03, 1), lampGlass(), sd * l.x, l.v, l.u - 0.02);
  for (const l of s.tail) for (const sd of [-1, 1]) {
    put(body, rbox(l.w, l.h, 0.06, 0.02, 1), redLamp(), sd * l.x, l.v, l.u + 0.01);
    put(body, rbox(l.w * 0.3, l.h * 0.7, 0.065, 0.01, 1), amberLamp(), sd * (l.x + (kind === "zhiguli" ? -l.w * 0.3 : l.w * 0.3)), l.v, l.u + 0.005);
  }
  // grille and bumpers
  if (s.chromeBumpers) {
    for (const [u, v] of [[front + 0.1, 0.45], [-front - 0.04, 0.45]] as const) {
      put(body, rbox(s.W + 0.04, 0.1, 0.1, 0.03, 1), chrome(), 0, v, u);
      put(body, rbox(s.W + 0.06, 0.035, 0.11, 0.012, 1), rubber(0x101010), 0, v, u);
    }
    // the «сімка» grille: chrome frame, horizontal slats
    put(body, rbox(0.66, 0.18, 0.04, 0.01, 1), std(0x0e0e10, { rough: 0.7 }), 0, 0.63, front - 0.0);
    for (let k = 0; k < 4; k++) put(body, box(0.64, 0.012, 0.045), chrome(), 0, 0.565 + k * 0.045, front + 0.004);
    put(body, rbox(0.7, 0.21, 0.03, 0.01, 1), chrome(), 0, 0.63, front - 0.012);
    put(body, box(0.004, 0.5, 0.004), steel(0x222222), -hw + 0.12, 1.08, 1.85, { rz: 0.25, shadow: false });
    // mud flaps behind the rear wheels
    for (const sd of [-1, 1]) put(body, box(0.18, 0.26, 0.012), rubber(0x101010), sd * (hw - 0.14), 0.25, s.wr - s.R - 0.12);
  } else {
    put(body, rbox(0.6, 0.08, 0.05, 0.02, 1), std(0x101012, { rough: 0.6 }), 0, s.head[0].v - 0.01, s.head[0].u - 0.01);
    put(body, rbox(0.7, 0.13, 0.05, 0.02, 1), std(0x0c0c0e, { rough: 0.7 }), 0, s.plateF[1] - 0.03, s.plateF[0] - 0.03);
    put(body, rbox(s.W - 0.3, 0.04, 0.04, 0.015, 1), blackTrim(), 0, 0.3 + (kind === "suv" ? 0.12 : 0), -front - 0.01);
  }
  if (s.cladding) for (const sd of [-1, 1]) put(body, rbox(0.03, 0.14, s.L - 1.6, 0.012, 1), blackTrim(), sd * (hw + 0.004), 0.52, -0.02);
  if (s.rails) for (const sd of [-1, 1]) put(body, rbox(0.04, 0.04, 1.8, 0.015, 1), steel(0x6a6e74), sd * 0.62, s.roof[1][1] + 0.05, -0.85);
  // plates
  const plateM = plate(plateText(r));
  const pg = new THREE.PlaneGeometry(0.52, 0.112);
  put(body, pg, plateM, 0, s.plateF[1], s.plateF[0] + 0.012, { shadow: false });
  put(body, pg, plateM, 0, s.plateR[1], s.plateR[0] - 0.012, { ry: Math.PI, shadow: false });
  // wipers lie on the windscreen
  for (const sd of [-0.32, 0.18]) put(body, box(0.5, 0.01, 0.015), blackTrim(), sd, s.glass[0][1] + 0.05, s.glass[0][0] - 0.06, { ry: 0.15, rx: -0.4, shadow: false });
  bake(body);
  shape(body, s.doorV[1], s.roof[1][1], s.L, 0.14);
  // winter: snow on the roof, the bonnet and the boot
  const snow = group(root);
  snow.name = "snow";
  const snowM = std(0xf2f5f8, { rough: 0.9 });
  s.snowParts.forEach(([u0, u1, v, w], i) => {
    const len = Math.abs(u0 - u1);
    const geo = lumpy(rbox(w, 0.09, len, 0.04, 3), 0.18, 9, seed + i);
    put(snow, geo, snowM, 0, v + 0.035, (u0 + u1) / 2, { shadow: false });
  });
  bake(snow, false);
  snow.visible = false;
  root.userData.length = s.L;
  return root;
}

/** Picks a car the way a Kyiv courtyard does: mostly old Lanoses and Zhigulis, some newer ones. */
export function courtyardCar(seed: number): THREE.Group {
  const r = rng(seed * 17 + 3);
  const k = r();
  const kind: CarKind = k < 0.32 ? "lanos" : k < 0.55 ? "zhiguli" : k < 0.8 ? "hatch" : "suv";
  return makeCar(kind, seed);
}

/**
 * The minibus: a grey high-roof van with tinted windows, a sliding door, mud
 * on the sills and an orange beacon (`beacon`, flashed by the scene).
 */
export function makeMinibus(): THREE.Group {
  const root = new THREE.Group();
  root.name = "minibus";
  const body = group(root);
  const R = 0.36, wf = 1.85, wr = -1.82, W = 1.99, hw = W / 2;
  const paintM = std(0x8c9096, { rough: 0.42, metal: 0.35, key: "van-paint" });
  const lower: P = [...bottom(-2.9, 2.85, 0.42, [[wr, 0.45], [wf, 0.45]], 0.38),
    [2.96, 0.52], [2.98, 0.8], [2.9, 1.0], [2.56, 1.1], [2.3, 1.18], [1.6, 2.05], [1.38, 2.36], [1.05, 2.42],
    [-2.86, 2.42], [-2.95, 2.34], [-2.97, 0.56]];
  put(body, profile(lower, W, 0.08, 8), paintM, 0, 0, 0);
  // the windscreen
  const a = new THREE.Vector2(2.3, 1.18), b = new THREE.Vector2(1.6, 2.05);
  const len = a.distanceTo(b);
  put(body, rbox(W - 0.18, len - 0.06, 0.03, 0.04, 1), glass(), 0, (a.y + b.y) / 2 + 0.012, (a.x + b.x) / 2 + 0.012, { rx: Math.atan2(b.x - a.x, b.y - a.y) });
  // side glass: the cab doors, then the passenger windows (tinted)
  const cabG = profile([[2.14, 1.26], [1.66, 1.98], [1.02, 1.98], [1.02, 1.26]], 0.02, 0.006, 2);
  for (const sd of [-1, 1]) {
    put(body, cabG, glass(), sd * (hw + 0.002), 0, 0, { shadow: false });
    for (const [u0, u1] of [[0.85, -0.45], [-0.6, -1.7], [-1.85, -2.7]]) put(body, rbox(0.02, 0.58, Math.abs(u0 - u1), 0.04, 2), std(0x0c0e12, { rough: 0.08, metal: 0.4 }), sd * (hw + 0.002), 1.68, (u0 + u1) / 2);
    // door seams: cab door, sliding door, and the rail it slides on
    for (const u of [2.15, 1.0, 0.9, -0.55]) put(body, box(0.006, 1.5, 0.008), blackTrim(), sd * (hw + 0.002), 1.15, u, { shadow: false });
    put(body, box(0.01, 0.03, 2.6), blackTrim(), sd * (hw + 0.004), 2.02, -0.6, { shadow: false });
    put(body, rbox(0.16, 0.22, 0.06, 0.03, 1), blackTrim(), sd * (hw + 0.1), 1.82, 1.72);
    put(body, box(0.12, 0.04, 0.03), blackTrim(), sd * (hw + 0.04), 1.76, 1.78);
  }
  // rear doors with their windows
  put(body, box(0.006, 1.8, 0.006), blackTrim(), 0, 1.35, -2.975);
  for (const sd of [-1, 1]) put(body, rbox(0.8, 0.5, 0.02, 0.03, 1), std(0x0c0e12, { rough: 0.08, metal: 0.4 }), sd * 0.45, 1.75, -2.97);
  // wheels
  for (const u of [wf, wr]) for (const sd of [-1, 1]) {
    put(body, cyl(R + 0.08, R + 0.08, 0.04, 16), std(0x0c0c0e, { rough: 1 }), sd * (hw - 0.22), R, u, { rz: Math.PI / 2, shadow: false });
    wheel(body, sd * (hw - 0.14), R, u, R, 0.22, sd, false);
  }
  // face: black bumper and grille, headlights, plate
  put(body, rbox(W + 0.02, 0.26, 0.16, 0.05, 1), std(0x1a1b1d, { rough: 0.75 }), 0, 0.62, 2.92);
  put(body, rbox(0.9, 0.24, 0.05, 0.03, 1), std(0x111113, { rough: 0.6 }), 0, 0.92, 2.9);
  for (let k = 0; k < 3; k++) put(body, box(0.86, 0.015, 0.055), chrome(), 0, 0.84 + k * 0.08, 2.905);
  for (const sd of [-1, 1]) put(body, rbox(0.34, 0.16, 0.1, 0.04, 1), lampGlass(), sd * 0.7, 0.98, 2.84, { ry: sd * 0.25 });
  put(body, rbox(W + 0.02, 0.24, 0.12, 0.05, 1), std(0x1a1b1d, { rough: 0.75 }), 0, 0.55, -2.95);
  for (const sd of [-1, 1]) put(body, rbox(0.1, 0.4, 0.05, 0.02, 1), redLamp(), sd * (hw - 0.06), 1.1, -2.96);
  const pm = plate("AA 0217 OO");
  put(body, new THREE.PlaneGeometry(0.52, 0.112), pm, 0, 0.62, 3.005, { shadow: false });
  put(body, new THREE.PlaneGeometry(0.52, 0.112), pm, 0, 0.55, -3.015, { ry: Math.PI, shadow: false });
  bake(body);
  shape(body, 1.3, 2.42, 5.9, 0.07);
  // the beacon on the roof (flashed by the scene: a basic material it can push above 1)
  put(root, rbox(0.12, 0.05, 0.3, 0.02, 1), std(0x111111, { rough: 0.6 }), 0, 2.45, 1.0);
  const beacon = put(root, rbox(0.7, 0.13, 0.22, 0.05, 1), new THREE.MeshBasicMaterial({ color: 0x553300 }), 0, 2.53, 1.0, { name: "beacon", shadow: false });
  beacon.userData.live = true;
  const snow = group(root);
  snow.name = "snow";
  put(snow, lumpy(rbox(1.86, 0.1, 4.0, 0.05, 3), 0.14, 7, 5), std(0xf2f5f8, { rough: 0.9 }), 0, 2.47, -0.85, { shadow: false });
  bake(snow, false);
  snow.visible = false;
  return root;
}

/** The car of the funeral: a black estate, flowers on the dash. */
export function makeHearse(): THREE.Group {
  const car = makeCar("hatch", 77, 0x0f1012);
  car.name = "hearse";
  return car;
}

