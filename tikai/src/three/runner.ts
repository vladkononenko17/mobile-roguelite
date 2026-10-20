import * as THREE from "three";
import { at, canvasTexture, mesh } from "../../../rozshuk/src/three/models.ts";

/**
 * Characters for «Тікай!»: stylised cartoon people with knees, elbows and a
 * drawn face, animated procedurally (run cycle, jump tuck, slide, stumble,
 * grab, sitting on a bench with a phone, waving at a blockpost). Faces +z.
 */

export type Pose = "run" | "jump" | "slide" | "stun" | "idle" | "grab" | "sit" | "call" | "stop" | "drive" | "scoot";
export type Face = "hero" | "angry" | "old" | "calm";
export type Hat = "beanie" | "cap" | "kashket" | "hood" | "scarf" | "helmet" | "none";

export interface Style {
  top: number | THREE.Texture;
  pants: number | THREE.Texture;
  skin?: number;
  shoes?: number;
  sole?: number;
  hair?: number;
  hat?: Hat;
  hatColor?: number;
  face?: Face;
  build?: number;
  bag?: number;
  glasses?: boolean;
  /** Long coat / skirt instead of trousers (babusias). */
  skirt?: boolean;
  /** Hoodie strings, a stripe, a vest. */
  vest?: number;
}

export interface Runner {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  thigh: [THREE.Group, THREE.Group];
  knee: [THREE.Group, THREE.Group];
  shoulder: [THREE.Group, THREE.Group];
  elbow: [THREE.Group, THREE.Group];
  /** Right hand: props attach here (phone, flashlight). */
  hand: THREE.Group;
  phase: number;
  /** Current joint angles, eased towards each pose. */
  cur: Float32Array;
}

const faces = new Map<Face, THREE.CanvasTexture>();
function faceTexture(kind: Face): THREE.CanvasTexture {
  let t = faces.get(kind);
  if (t) return t;
  t = canvasTexture(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    const eye = (x: number, look = 0) => {
      g.fillStyle = "#ffffff";
      g.beginPath(); g.ellipse(x, 58, 13, 16, 0, 0, Math.PI * 2); g.fill();
      g.lineWidth = 3; g.strokeStyle = "#151316"; g.stroke();
      g.fillStyle = "#151316";
      g.beginPath(); g.ellipse(x + look, 61, 6.5, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath(); g.arc(x + look + 2.5, 57, 2.4, 0, Math.PI * 2); g.fill();
    };
    g.lineCap = "round";
    if (kind === "old") {
      // squinting babusia behind big glasses
      g.strokeStyle = "#151316"; g.lineWidth = 4;
      for (const x of [42, 86]) { g.beginPath(); g.arc(x, 60, 17, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(x - 8, 62); g.quadraticCurveTo(x, 54, x + 8, 62); g.stroke(); }
      g.beginPath(); g.moveTo(59, 58); g.lineTo(69, 58); g.stroke();
      g.beginPath(); g.moveTo(50, 98); g.quadraticCurveTo(64, 92, 78, 98); g.stroke();
      g.fillStyle = "rgba(220,90,90,.35)"; g.beginPath(); g.arc(30, 84, 9, 0, 7); g.arc(98, 84, 9, 0, 7); g.fill();
      return;
    }
    eye(44, kind === "hero" ? -1 : 0);
    eye(84, kind === "hero" ? -1 : 0);
    g.strokeStyle = "#151316";
    g.lineWidth = 6;
    if (kind === "angry") {
      g.beginPath(); g.moveTo(28, 34); g.lineTo(56, 44); g.stroke();
      g.beginPath(); g.moveTo(100, 34); g.lineTo(72, 44); g.stroke();
      g.lineWidth = 5; g.beginPath(); g.moveTo(50, 98); g.quadraticCurveTo(64, 90, 78, 98); g.stroke();
    } else if (kind === "hero") {
      g.beginPath(); g.moveTo(30, 38); g.quadraticCurveTo(44, 30, 56, 38); g.stroke();
      g.beginPath(); g.moveTo(72, 38); g.quadraticCurveTo(84, 30, 98, 38); g.stroke();
      // a worried open mouth
      g.fillStyle = "#6a2020"; g.beginPath(); g.ellipse(64, 96, 9, 7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(230,110,90,.35)"; g.beginPath(); g.arc(26, 82, 9, 0, 7); g.arc(102, 82, 9, 0, 7); g.fill();
    } else {
      g.beginPath(); g.moveTo(32, 38); g.lineTo(56, 38); g.stroke();
      g.beginPath(); g.moveTo(72, 38); g.lineTo(96, 38); g.stroke();
      g.lineWidth = 5; g.beginPath(); g.moveTo(52, 96); g.lineTo(76, 96); g.stroke();
    }
  }, false);
  faces.set(kind, t);
  return t;
}

function mat(v: number | THREE.Texture): THREE.MeshLambertMaterial {
  return typeof v === "number" ? new THREE.MeshLambertMaterial({ color: v, flatShading: true }) : new THREE.MeshLambertMaterial({ map: v, flatShading: true });
}

/** Rounded box: a box with its edges pulled in, so limbs read as cartoon not crates. */
function rbox(w: number, h: number, d: number, r = 0.35): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ex = Math.abs(v.x) > w * 0.49 ? 1 : 0;
    const ey = Math.abs(v.y) > h * 0.49 ? 1 : 0;
    const ez = Math.abs(v.z) > d * 0.49 ? 1 : 0;
    if (ex + ey + ez >= 2) {
      const k = 1 - r * 0.25;
      if (ex) v.x *= k;
      if (ey) v.y *= ex + ez ? 1 - r * 0.12 : 1;
      if (ez) v.z *= k;
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Build a person. Sizes are in metres; the hero is about 1.75 m with a big cartoon head. */
export function makeRunner(s: Style): Runner {
  const b = s.build ?? 1;
  const top = mat(s.top);
  const pants = mat(s.pants);
  const skin = mat(s.skin ?? 0xe8b08a);
  const shoes = mat(s.shoes ?? 0x2a2a2e);
  const sole = mat(s.sole ?? 0xf2f0ea);
  const hair = mat(s.hair ?? 0x3a2a20);
  const ink = 0.022;
  const root = new THREE.Group();
  const hips = new THREE.Group();
  at(hips, 0, 0.9, 0, root);
  // pelvis
  at(mesh(rbox(0.38 * b, 0.2, 0.24 * b), pants, ink), 0, 0, 0, hips);
  // legs: thigh → knee → shin → shoe
  const thighs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const thigh = new THREE.Group();
    at(thigh, side * 0.1 * b, -0.04, 0, hips);
    at(mesh(rbox(0.16 * b, 0.42, 0.18 * b), s.skirt ? top : pants, ink), 0, -0.2, 0, thigh);
    const knee = new THREE.Group();
    at(knee, 0, -0.42, 0, thigh);
    at(mesh(rbox(0.14 * b, 0.4, 0.15 * b), s.skirt ? skin : pants, ink), 0, -0.2, 0, knee);
    const foot = new THREE.Group();
    at(foot, 0, -0.42, 0, knee);
    at(mesh(rbox(0.16 * b, 0.12, 0.3), shoes, 0.016), 0, -0.02, 0.06, foot);
    at(mesh(new THREE.BoxGeometry(0.17 * b, 0.04, 0.31), sole, 0), 0, -0.08, 0.06, foot);
    thighs.push(thigh);
    knees.push(knee);
  }
  if (s.skirt) {
    const coat = mesh(new THREE.CylinderGeometry(0.24 * b, 0.34 * b, 0.62, 8), top, ink);
    at(coat, 0, -0.26, 0, hips);
  }
  // torso
  const spine = new THREE.Group();
  at(spine, 0, 0.08, 0, hips);
  at(mesh(rbox(0.46 * b, 0.56, 0.3 * b, 0.5), top, ink), 0, 0.3, 0, spine);
  if (s.vest !== undefined) at(mesh(rbox(0.48 * b, 0.36, 0.32 * b, 0.4), s.vest, 0.012), 0, 0.36, 0, spine);
  if (s.bag !== undefined) {
    at(mesh(rbox(0.36, 0.42, 0.18), s.bag, 0.02), 0, 0.32, -0.24 * b, spine);
    for (const side of [-1, 1]) at(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), s.bag, 0), side * 0.14, 0.4, -0.16 * b, spine).rotation.x = 0.1;
  }
  // arms: shoulder → elbow → forearm → hand
  const shoulders: THREE.Group[] = [];
  const elbows: THREE.Group[] = [];
  let hand = new THREE.Group();
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    at(sh, side * 0.29 * b, 0.52, 0, spine);
    at(mesh(rbox(0.13, 0.3, 0.14), top, ink), 0, -0.13, 0, sh);
    const el = new THREE.Group();
    at(el, 0, -0.28, 0, sh);
    at(mesh(rbox(0.12, 0.27, 0.13), top, ink), 0, -0.12, 0, el);
    const fist = mesh(new THREE.IcosahedronGeometry(0.075, 0), skin, 0.014);
    at(fist, 0, -0.29, 0, el);
    if (side > 0) { hand = new THREE.Group(); at(hand, 0, -0.32, 0.04, el); }
    shoulders.push(sh);
    elbows.push(el);
  }
  // head
  const head = new THREE.Group();
  at(head, 0, 0.68, 0, spine);
  at(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 6), skin, 0.012), 0, -0.07, 0, head);
  const skull = mesh(rbox(0.46, 0.46, 0.42, 0.9), skin, 0.026);
  at(skull, 0, 0.18, 0, head);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: faceTexture(s.face ?? "calm"), transparent: true, depthWrite: false }));
  face.userData.noAO = true;
  at(face, 0, 0.16, 0.213, head);
  const nose = mesh(new THREE.BoxGeometry(0.07, 0.08, 0.06), skin, 0.01);
  at(nose, 0, 0.13, 0.22, head);
  for (const side of [-1, 1]) at(mesh(new THREE.BoxGeometry(0.05, 0.1, 0.08), skin, 0.01), side * 0.24, 0.16, 0, head);
  if (s.glasses) at(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0x111111 })), 0, 0.2, 0.225, head);
  const hc = s.hatColor ?? 0xe8602f;
  const hatMat = mat(hc);
  switch (s.hat ?? "none") {
    case "beanie":
      at(mesh(rbox(0.5, 0.2, 0.46, 0.9), hatMat, 0.02), 0, 0.38, -0.01, head);
      at(mesh(new THREE.BoxGeometry(0.5, 0.08, 0.47), hatMat, 0.012), 0, 0.29, -0.01, head);
      at(mesh(new THREE.IcosahedronGeometry(0.07, 0), mat(0xf2f0ea), 0.01), 0, 0.5, -0.02, head);
      break;
    case "hood":
      at(mesh(rbox(0.54, 0.54, 0.5, 0.9), hatMat, 0.02), 0, 0.2, -0.05, head).scale.set(1, 1, 1);
      break;
    case "cap":
    case "kashket": {
      const big = s.hat === "kashket";
      at(mesh(rbox(big ? 0.56 : 0.48, big ? 0.16 : 0.14, big ? 0.52 : 0.46, 0.6), hatMat, 0.02), 0, 0.42, 0, head);
      const visor = mesh(new THREE.BoxGeometry(0.4, 0.03, 0.2), big ? mat(0x1d1d1d) : hatMat, 0.012);
      at(visor, 0, 0.36, 0.28, head).rotation.x = 0.15;
      if (big) at(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.02), mat(0xf2b632)), 0, 0.44, 0.27, head);
      break;
    }
    case "helmet":
      at(mesh(new THREE.SphereGeometry(0.29, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hatMat, 0.02), 0, 0.3, 0, head);
      break;
    case "scarf":
      at(mesh(rbox(0.52, 0.42, 0.48, 0.9), hatMat, 0.02), 0, 0.26, -0.04, head);
      at(mesh(new THREE.IcosahedronGeometry(0.08, 0), hatMat, 0.01), 0, -0.02, 0.2, head);
      break;
    default:
      at(mesh(rbox(0.48, 0.14, 0.44, 0.8), hair, 0.02), 0, 0.4, -0.02, head);
      at(mesh(new THREE.BoxGeometry(0.48, 0.2, 0.1), hair, 0.012), 0, 0.3, -0.19, head);
  }
  root.scale.setScalar(1.05);
  const r: Runner = {
    root, hips, spine, head, thigh: [thighs[0], thighs[1]], knee: [knees[0], knees[1]], shoulder: [shoulders[0], shoulders[1]], elbow: [elbows[0], elbows[1]],
    hand, phase: Math.random() * 6, cur: new Float32Array(16),
  };
  return r;
}

// joint slots in `cur`
const J = { hipY: 0, lean: 1, tL: 2, tR: 3, kL: 4, kR: 5, sL: 6, sR: 7, eL: 8, eR: 9, sZL: 10, sZR: 11, head: 12, twist: 13, roll: 14 };

/** Animate a runner. `speed` in m/s drives the run cycle. */
export function animateRunner(r: Runner, pose: Pose, speed: number, dt: number): void {
  const t = new Float32Array(16);
  t[J.hipY] = 0.9;
  const run = pose === "run";
  if (run || pose === "grab") {
    const k = Math.min(1, speed / 9);
    r.phase += dt * (4 + speed * 0.95);
    const p = r.phase;
    const s = Math.sin(p);
    const amp = 0.45 + k * 0.6;
    t[J.tL] = -s * amp; t[J.tR] = s * amp;
    // the knee folds on the back swing
    t[J.kL] = 0.25 + Math.max(0, Math.sin(p + 1.4)) * (0.6 + k * 1.1);
    t[J.kR] = 0.25 + Math.max(0, Math.sin(p + 1.4 + Math.PI)) * (0.6 + k * 1.1);
    t[J.sL] = s * amp * 0.9; t[J.sR] = -s * amp * 0.9;
    t[J.eL] = -1.3; t[J.eR] = -1.3;
    t[J.lean] = 0.12 + k * 0.2;
    t[J.hipY] = 0.86 + Math.abs(Math.cos(p)) * 0.07 * (0.4 + k);
    t[J.twist] = s * 0.18 * k;
    t[J.head] = -0.1 * k;
    if (pose === "grab") { t[J.sL] = t[J.sR] = -1.5; t[J.eL] = t[J.eR] = -0.25; t[J.lean] = 0.3; }
  } else if (pose === "jump") {
    t[J.tL] = -1.25; t[J.tR] = -0.5; t[J.kL] = 1.9; t[J.kR] = 1.2;
    t[J.sL] = -2.6; t[J.sR] = -2.2; t[J.eL] = -0.3; t[J.eR] = -0.4; t[J.sZL] = 0.5; t[J.sZR] = -0.5;
    t[J.lean] = 0.25; t[J.hipY] = 0.95;
  } else if (pose === "slide") {
    t[J.hipY] = 0.32; t[J.lean] = -1.0; t[J.tL] = -1.45; t[J.tR] = -1.25; t[J.kL] = 0.2; t[J.kR] = 0.7;
    t[J.sL] = 0.6; t[J.sR] = -1.2; t[J.eL] = -0.2; t[J.eR] = -0.6; t[J.sZL] = 0.7; t[J.head] = 0.7;
  } else if (pose === "stun") {
    t[J.hipY] = 0.7; t[J.lean] = -0.5; t[J.tL] = -0.7; t[J.tR] = -0.2; t[J.kL] = 0.9; t[J.kR] = 0.4;
    t[J.sZL] = 1.4; t[J.sZR] = -1.4; t[J.eL] = -0.6; t[J.eR] = -0.6; t[J.roll] = Math.sin(r.phase += dt * 9) * 0.25;
  } else if (pose === "sit" || pose === "call") {
    t[J.hipY] = 0.52; t[J.tL] = t[J.tR] = -1.5; t[J.kL] = t[J.kR] = 1.5; t[J.sL] = t[J.sR] = -0.4; t[J.eL] = t[J.eR] = -0.7;
    if (pose === "call") { t[J.sR] = -2.3; t[J.eR] = -2.1; t[J.sZR] = -0.3; t[J.head] = 0.15; }
  } else if (pose === "stop") {
    r.phase += dt * 6;
    t[J.sR] = -2.9 + Math.sin(r.phase) * 0.25; t[J.eR] = -0.2; t[J.sZR] = -0.2; t[J.sL] = -0.2; t[J.eL] = -0.4;
  } else if (pose === "drive") {
    t[J.hipY] = 0.52; t[J.tL] = t[J.tR] = -1.4; t[J.kL] = t[J.kR] = 1.3; t[J.sL] = t[J.sR] = -1.2; t[J.eL] = t[J.eR] = -0.5;
  } else if (pose === "scoot") {
    t[J.tL] = -0.15; t[J.tR] = 0.2; t[J.kL] = 0.25; t[J.kR] = 0.35; t[J.sL] = t[J.sR] = -1.2; t[J.eL] = t[J.eR] = -0.4; t[J.lean] = 0.2;
  } else {
    r.phase += dt * 2;
    t[J.hipY] = 0.9 + Math.sin(r.phase) * 0.008; t[J.sL] = 0.05; t[J.sR] = 0.05; t[J.eL] = t[J.eR] = -0.2; t[J.sZL] = 0.12; t[J.sZR] = -0.12;
  }
  // ease towards the pose (instant enough for the run cycle, soft for transitions)
  const k = 1 - Math.exp(-dt * (run ? 30 : 16));
  const c = r.cur;
  for (let i = 0; i < 16; i++) c[i] += (t[i] - c[i]) * k;
  r.hips.position.y = c[J.hipY];
  r.hips.rotation.x = c[J.lean] * 0.4;
  r.spine.rotation.x = c[J.lean] * 0.6;
  r.spine.rotation.y = c[J.twist];
  r.spine.rotation.z = c[J.roll];
  r.head.rotation.x = c[J.head];
  r.thigh[0].rotation.x = c[J.tL] - c[J.lean] * 0.4;
  r.thigh[1].rotation.x = c[J.tR] - c[J.lean] * 0.4;
  r.knee[0].rotation.x = c[J.kL];
  r.knee[1].rotation.x = c[J.kR];
  r.shoulder[0].rotation.x = c[J.sL];
  r.shoulder[1].rotation.x = c[J.sR];
  r.shoulder[0].rotation.z = -c[J.sZL] - 0.08;
  r.shoulder[1].rotation.z = -c[J.sZR] + 0.08;
  r.elbow[0].rotation.x = c[J.eL];
  r.elbow[1].rotation.x = c[J.eR];
}

/** A camo jacket with a vest? No — just the looks the game needs. */
export const STYLES = {
  officer: (camo: THREE.Texture): Style => ({ top: camo, pants: camo, hat: "kashket", hatColor: 0x5a5a3a, shoes: 0x1c1a17, sole: 0x1c1a17, face: "angry", build: 1.12 }),
  guard: (camo: THREE.Texture): Style => ({ top: camo, pants: camo, hat: "beanie", hatColor: 0x3a4a2a, shoes: 0x1c1a17, sole: 0x1c1a17, face: "angry", build: 1.08 }),
  soldier: (camo: THREE.Texture): Style => ({ top: camo, pants: camo, hat: "helmet", hatColor: 0x4a5a3a, shoes: 0x1c1a17, sole: 0x1c1a17, face: "calm", vest: 0x3a4a2a, build: 1.08 }),
  babka: (): Style => ({ top: 0x6a3f6a, pants: 0x3a2f3a, hat: "scarf", hatColor: 0xc8463a, shoes: 0x2a2220, sole: 0x2a2220, face: "old", skirt: true, build: 1.15 }),
  courier: (): Style => ({ top: 0xf2b632, pants: 0x2b2b30, hat: "cap", hatColor: 0xf2b632, bag: 0xf2b632, face: "calm" }),
  shopper: (c: number, hair: number): Style => ({ top: c, pants: 0x3a3a44, hair, face: "calm" }),
};
