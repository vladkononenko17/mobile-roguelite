import * as THREE from "three";
import { at, canvasTexture, mesh } from "../../../rozshuk/src/three/models.ts";
import type { Runner } from "../../../tikai/src/three/runner.ts";

/**
 * The riders of «З гірки!»: chubby winter kids (and one grandma) in puffer
 * jackets, snow trousers and fur-topped boots, with a knitted beanie and a
 * pompom, mittens on a string, a scarf whose ends fly in the wind, and a
 * painted face wrapped onto a round head. Smooth (not faceted) shapes so the
 * cel shading reads as soft bands.
 *
 * The skeleton is the same as the runners of «Тікай!» (hips at 0.9 m, the
 * same joint offsets and limb lengths), so the sledding poses work on both.
 */

export type FaceKind = "hero" | "kid" | "old" | "cheeky";

export interface SledderLook {
  coat: number;
  pants: number;
  hat: number;
  scarf: number;
  /** Mittens; the scarf colour if unset. */
  mitten?: number;
  boots?: number;
  hair?: number;
  skin?: number;
  face?: FaceKind;
  /** Headscarf and a long coat instead of a beanie and trousers. */
  old?: boolean;
  /** 0..1, small variations (pompom, stripes, freckles). */
  seed?: number;
}

const INK = 0.018;

const smooth = (color: number, map?: THREE.Texture) => new THREE.MeshLambertMaterial({ color, map: map ?? null });
const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

// ------------------------------------------------------------- textures

const faces = new Map<string, THREE.CanvasTexture>();
/** Big cartoon eyes, eyebrows, a mouth and rosy cold cheeks, drawn for a curved patch of the head. */
function faceTexture(kind: FaceKind, freckles: boolean): THREE.CanvasTexture {
  const key = `${kind}:${freckles}`;
  let t = faces.get(key);
  if (t) return t;
  t = canvasTexture(256, 160, (g) => {
    g.clearRect(0, 0, 256, 160);
    g.lineCap = "round";
    g.lineJoin = "round";
    // cheeks red with frost
    g.fillStyle = "rgba(235,90,90,.42)";
    for (const x of [62, 194]) { g.beginPath(); g.ellipse(x, 104, 24, 15, 0, 0, Math.PI * 2); g.fill(); }
    if (freckles) {
      g.fillStyle = "rgba(150,80,40,.55)";
      for (const [x, y] of [[76, 92], [86, 99], [70, 100], [180, 92], [170, 99], [186, 100]]) { g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
    }
    if (kind === "old") {
      // eyes smiling behind round glasses, a kind grin
      g.strokeStyle = "#151316";
      g.lineWidth = 6;
      for (const x of [92, 164]) {
        g.beginPath(); g.arc(x, 70, 25, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 5; g.beginPath(); g.moveTo(x - 12, 74); g.quadraticCurveTo(x, 62, x + 12, 74); g.stroke(); g.lineWidth = 6;
      }
      g.beginPath(); g.moveTo(117, 68); g.lineTo(139, 68); g.stroke();
      g.lineWidth = 5;
      g.beginPath(); g.moveTo(104, 122); g.quadraticCurveTo(128, 138, 152, 122); g.stroke();
      g.strokeStyle = "rgba(120,70,50,.5)"; g.lineWidth = 3;
      for (const x of [58, 198]) { g.beginPath(); g.moveTo(x - 6, 66); g.lineTo(x + 6, 62); g.moveTo(x - 6, 74); g.lineTo(x + 6, 74); g.stroke(); }
      return;
    }
    const eye = (x: number, look: number) => {
      g.fillStyle = "#ffffff";
      g.beginPath(); g.ellipse(x, 72, 19, 23, 0, 0, Math.PI * 2); g.fill();
      g.lineWidth = 4; g.strokeStyle = "#151316"; g.stroke();
      g.fillStyle = "#3a2a1e";
      g.beginPath(); g.ellipse(x + look, 77, 11, 13, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#151316";
      g.beginPath(); g.ellipse(x + look, 78, 6.5, 7.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath(); g.arc(x + look + 4, 71, 4, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(x + look - 3, 83, 1.8, 0, Math.PI * 2); g.fill();
    };
    eye(98, kind === "cheeky" ? 3 : 0);
    eye(158, kind === "cheeky" ? 3 : 0);
    g.strokeStyle = "#3a2418";
    g.lineWidth = 6;
    if (kind === "cheeky") {
      g.beginPath(); g.moveTo(78, 38); g.quadraticCurveTo(98, 30, 116, 42); g.stroke();
      g.beginPath(); g.moveTo(140, 36); g.quadraticCurveTo(158, 28, 178, 34); g.stroke();
    } else {
      g.beginPath(); g.moveTo(80, 40); g.quadraticCurveTo(98, 30, 116, 38); g.stroke();
      g.beginPath(); g.moveTo(140, 38); g.quadraticCurveTo(158, 30, 176, 40); g.stroke();
    }
    // the mouth: a big open laugh for the hero, a grin for the others
    if (kind === "hero") {
      g.fillStyle = "#7a2028";
      g.beginPath(); g.moveTo(106, 112); g.quadraticCurveTo(128, 148, 150, 112); g.closePath(); g.fill();
      g.lineWidth = 4; g.strokeStyle = "#151316"; g.stroke();
      g.fillStyle = "#ffffff"; g.fillRect(112, 112, 32, 7);
      g.fillStyle = "#e86a7a"; g.beginPath(); g.ellipse(128, 132, 10, 5, 0, 0, Math.PI * 2); g.fill();
    } else if (kind === "cheeky") {
      g.lineWidth = 5; g.strokeStyle = "#151316";
      g.beginPath(); g.moveTo(108, 118); g.quadraticCurveTo(132, 134, 152, 112); g.stroke();
    } else {
      g.fillStyle = "#7a2028";
      g.beginPath(); g.ellipse(128, 120, 12, 9, 0, 0, Math.PI * 2); g.fill();
      g.lineWidth = 4; g.strokeStyle = "#151316"; g.stroke();
    }
  }, false);
  faces.set(key, t);
  return t;
}

let knit: THREE.CanvasTexture | null = null;
/** Knitted rib, white so the material colour tints it; a stripe across. */
function knitTexture(): THREE.CanvasTexture {
  if (knit) return knit;
  knit = canvasTexture(64, 64, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 4) {
      g.fillStyle = "rgba(0,0,0,.14)";
      g.fillRect(x, 0, 1.4, 64);
      for (let y = 0; y < 64; y += 6) {
        g.fillStyle = "rgba(0,0,0,.08)";
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2, y + 3); g.lineTo(x + 4, y); g.stroke();
      }
    }
    // a pale band with little crosses, like a granny's pattern
    g.fillStyle = "rgba(255,255,255,.55)";
    g.fillRect(0, 24, 64, 12);
    g.fillStyle = "rgba(0,0,0,.25)";
    for (let x = 2; x < 64; x += 8) { g.fillRect(x, 29, 4, 2); g.fillRect(x + 1, 27, 2, 6); }
  });
  knit.repeat.set(6, 1);
  return knit;
}

let quilt: THREE.CanvasTexture | null = null;
/** Puffer-jacket quilting: soft horizontal bands. */
function quiltTexture(): THREE.CanvasTexture {
  if (quilt) return quilt;
  quilt = canvasTexture(16, 64, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 16);
    gr.addColorStop(0, "#cfcfcf"); gr.addColorStop(0.5, "#ffffff"); gr.addColorStop(1, "#cfcfcf");
    for (let y = 0; y < 64; y += 16) { g.fillStyle = gr; g.save(); g.translate(0, y); g.fillRect(0, 0, 16, 16); g.restore(); }
    g.fillStyle = "rgba(0,0,0,.25)";
    for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 16, 1.5);
  });
  return quilt;
}

// ------------------------------------------------------------- the body

function capsule(r: number, len: number, mat: THREE.Material, ink = INK): THREE.Mesh {
  return mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat, ink);
}

export function makeSledder(l: SledderLook): Runner {
  const seed = l.seed ?? 0.5;
  const coat = smooth(l.coat, quiltTexture());
  const coatTrim = smooth(shade(l.coat, 0.8));
  const pants = smooth(l.pants, quiltTexture());
  const skin = smooth(l.skin ?? 0xf0c09a);
  const boots = smooth(l.boots ?? 0x4a3328);
  const fur = smooth(0xf4efe6);
  const mitten = smooth(l.mitten ?? l.scarf, knitTexture());
  const hatMat = smooth(l.hat, knitTexture());
  const hair = smooth(l.hair ?? 0x6a4228);
  const root = new THREE.Group();
  const hips = new THREE.Group();
  at(hips, 0, 0.9, 0, root);
  const pelvis = mesh(new THREE.SphereGeometry(0.2, 16, 10), l.old ? coat : pants, INK);
  pelvis.scale.set(1.05, 0.72, 0.85);
  at(pelvis, 0, -0.02, 0, hips);
  // legs: thigh → knee → shin → boot
  const thighs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const thigh = new THREE.Group();
    at(thigh, side * 0.1, -0.04, 0, hips);
    at(capsule(0.1, 0.24, pants), 0, -0.2, 0, thigh);
    const knee = new THREE.Group();
    at(knee, 0, -0.42, 0, thigh);
    at(capsule(0.088, 0.26, pants), 0, -0.2, 0, knee);
    const foot = new THREE.Group();
    at(foot, 0, -0.42, 0, knee);
    const boot = capsule(0.095, 0.14, boots);
    boot.rotation.x = Math.PI / 2;
    at(boot, 0, -0.02, 0.07, foot);
    const sole = mesh(new THREE.CapsuleGeometry(0.085, 0.16, 4, 10), smooth(0x2a1e18), 0.008);
    sole.rotation.x = Math.PI / 2;
    sole.scale.set(1.05, 1, 0.45);
    at(sole, 0, -0.08, 0.07, foot);
    const cuff = mesh(new THREE.TorusGeometry(0.095, 0.042, 8, 18), fur, 0.008);
    cuff.rotation.x = Math.PI / 2;
    at(cuff, 0, 0.1, 0, foot);
    thighs.push(thigh);
    knees.push(knee);
  }
  if (l.old) {
    // a long winter coat over the knees
    at(mesh(new THREE.CylinderGeometry(0.24, 0.36, 0.62, 18), coat, INK), 0, -0.28, 0, hips);
  }
  // the puffer jacket
  const spine = new THREE.Group();
  at(spine, 0, 0.08, 0, hips);
  const body = mesh(new THREE.SphereGeometry(0.27, 20, 14), coat, INK);
  body.scale.set(1.05, 1.2, 0.9);
  at(body, 0, 0.3, 0, spine);
  at(mesh(new THREE.BoxGeometry(0.025, 0.46, 0.02), smooth(0x2a2a2e), 0), 0, 0.3, 0.243, spine);
  const hem = mesh(new THREE.TorusGeometry(0.255, 0.04, 8, 22), coatTrim, 0.008);
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1.05, 0.9, 1);
  at(hem, 0, 0.04, 0, spine);
  // a hood with a fur trim behind the neck
  const hood = mesh(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), coat, 0.01);
  hood.rotation.x = -1.9;
  at(hood, 0, 0.58, -0.12, spine);
  const trim = mesh(new THREE.TorusGeometry(0.15, 0.045, 8, 18), l.old ? coatTrim : fur, 0.008);
  trim.rotation.x = Math.PI / 2 - 0.3;
  at(trim, 0, 0.6, -0.04, spine);
  // arms: shoulder → elbow → forearm → mitten
  const shoulders: THREE.Group[] = [];
  const elbows: THREE.Group[] = [];
  let hand = new THREE.Group();
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    at(sh, side * 0.29, 0.5, 0, spine);
    at(capsule(0.085, 0.16, coat), 0, -0.13, 0, sh);
    const el = new THREE.Group();
    at(el, 0, -0.28, 0, sh);
    at(capsule(0.078, 0.13, coat), 0, -0.11, 0, el);
    const cuff = mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 14), coatTrim, 0);
    cuff.rotation.x = Math.PI / 2;
    at(cuff, 0, -0.22, 0, el);
    const m = mesh(new THREE.SphereGeometry(0.085, 12, 10), mitten, 0.012);
    m.scale.set(0.9, 1.15, 0.85);
    at(m, 0, -0.3, 0.01, el);
    at(mesh(new THREE.SphereGeometry(0.036, 8, 6), mitten, 0), -side * 0.06, -0.26, 0.05, el);
    if (side > 0) { hand = new THREE.Group(); at(hand, 0, -0.32, 0.04, el); }
    shoulders.push(sh);
    elbows.push(el);
  }
  // the head: round, with the face wrapped on
  const head = new THREE.Group();
  at(head, 0, 0.66, 0, spine);
  const skull = mesh(new THREE.SphereGeometry(0.27, 22, 16), skin, 0.022);
  skull.scale.set(1, 0.96, 0.95);
  at(skull, 0, 0.2, 0, head);
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(l.face ?? "kid", seed > 0.6 && !l.old), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.276, 20, 12, Math.PI / 2 - 0.85, 1.7, Math.PI * 0.3, Math.PI * 0.42), faceMat);
  face.scale.copy(skull.scale);
  face.userData.noAO = true;
  face.renderOrder = 2;
  at(face, 0, 0.2, 0, head);
  const nose = mesh(new THREE.SphereGeometry(0.048, 10, 8), smooth(0xf29484), 0.008);
  at(nose, 0, 0.15, 0.262, head);
  for (const side of [-1, 1]) at(mesh(new THREE.SphereGeometry(0.05, 8, 6), skin, 0.008), side * 0.26, 0.17, -0.01, head);
  if (l.old) {
    // a headscarf knotted under the chin
    // the cloth frames the face: a dome on top, falling down the back and the sides
    const scarf = mesh(new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), hatMat, 0.02);
    scarf.rotation.x = -0.55;
    at(scarf, 0, 0.22, -0.04, head);
    const back = mesh(new THREE.SphereGeometry(0.295, 18, 10, Math.PI / 2 + 1.1, Math.PI * 2 - 2.2, Math.PI * 0.2, Math.PI * 0.55), hatMat, 0.015);
    at(back, 0, 0.2, -0.02, head);
    at(mesh(new THREE.SphereGeometry(0.06, 8, 6), hatMat, 0.01), 0, -0.07, 0.15, head);
    const tail = mesh(new THREE.ConeGeometry(0.12, 0.22, 4), hatMat, 0.01);
    tail.rotation.x = Math.PI;
    at(tail, 0, 0.0, -0.24, head);
  } else {
    // hair peeking out under the beanie, a fringe at the front
    const back = mesh(new THREE.SphereGeometry(0.278, 18, 10, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, Math.PI * 0.28, Math.PI * 0.32), hair, 0.01);
    at(back, 0, 0.2, 0, head);
    for (let i = -2; i <= 2; i++) {
      const lock = mesh(new THREE.SphereGeometry(0.06, 8, 6), hair, 0);
      lock.scale.set(1, 0.6, 0.6);
      at(lock, i * 0.07, 0.36 - Math.abs(i) * 0.012, 0.2 - Math.abs(i) * 0.02, head);
    }
    // the beanie: a dome, a folded band, a pompom
    const dome = mesh(new THREE.SphereGeometry(0.29, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hatMat, 0.022);
    dome.scale.set(1, 1.05, 1);
    at(dome, 0, 0.31, -0.02, head);
    const band = mesh(new THREE.CylinderGeometry(0.296, 0.3, 0.1, 22, 1), smooth(shade(l.hat, 0.8), knitTexture()), 0.012);
    band.rotation.x = -0.12;
    at(band, 0, 0.34, -0.02, head);
    const pom = mesh(new THREE.IcosahedronGeometry(0.09, 2), smooth(seed < 0.5 ? 0xf4efe6 : l.scarf), 0.012);
    at(pom, 0, 0.64, -0.03, head);
  }
  root.scale.setScalar(1.05);
  return {
    root, hips, spine, head, thigh: [thighs[0], thighs[1]], knee: [knees[0], knees[1]], shoulder: [shoulders[0], shoulders[1]], elbow: [elbows[0], elbows[1]],
    hand, phase: seed * 6, cur: new Float32Array(16),
  };
}

/** A knitted scarf round the neck, its two ends flying behind you (the group that flaps). */
export function addWoolScarf(rig: Runner, color: number): THREE.Group {
  const m = smooth(color, knitTexture());
  const neck = mesh(new THREE.TorusGeometry(0.15, 0.065, 8, 18), m, 0.01);
  neck.rotation.x = Math.PI / 2;
  at(neck, 0, -0.03, 0, rig.head);
  const tail = new THREE.Group();
  tail.name = "scarfTail";
  at(tail, 0.07, -0.03, -0.15, rig.head);
  for (const [x, len] of [[0, 0.44], [0.07, 0.36]] as const) {
    const end = mesh(new THREE.BoxGeometry(0.1, 0.035, len), m, 0.008);
    at(end, x, 0, -len / 2, tail);
    // fringe
    for (let i = 0; i < 3; i++) at(mesh(new THREE.BoxGeometry(0.015, 0.015, 0.06), m, 0), x - 0.035 + i * 0.035, 0, -len - 0.03, tail);
  }
  return tail;
}

/** A shaggy, friendly dog in a red harness (Бровко). Faces +z; named parts: tail, head, legs. */
export function makeShaggyDog(): THREE.Group {
  const g = new THREE.Group();
  const coat = smooth(0xc99a62);
  const dark = smooth(0x8a5a32);
  const light = smooth(0xf0dcb8);
  const body = mesh(new THREE.CapsuleGeometry(0.24, 0.5, 6, 14), coat, 0.02);
  body.rotation.x = Math.PI / 2;
  at(body, 0, 0.55, 0, g);
  const chest = mesh(new THREE.SphereGeometry(0.2, 12, 10), light, 0.012);
  at(chest, 0, 0.5, 0.36, g);
  const head = new THREE.Group();
  head.name = "head";
  at(head, 0, 0.82, 0.48, g);
  at(mesh(new THREE.SphereGeometry(0.21, 16, 12), coat, 0.02), 0, 0, 0, head);
  const snout = mesh(new THREE.CapsuleGeometry(0.1, 0.12, 4, 10), light, 0.012);
  snout.rotation.x = Math.PI / 2;
  at(snout, 0, -0.06, 0.18, head);
  at(mesh(new THREE.SphereGeometry(0.05, 8, 6), smooth(0x151316), 0), 0, -0.02, 0.32, head);
  const tongue = mesh(new THREE.CapsuleGeometry(0.035, 0.06, 3, 6), smooth(0xe86a7a), 0);
  at(tongue, 0, -0.17, 0.24, head).rotation.x = 0.3;
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), new THREE.MeshBasicMaterial({ color: 0x151316 }));
    at(eye, side * 0.09, 0.06, 0.18, head);
    at(new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })), side * 0.09 + 0.012, 0.075, 0.214, head);
    const ear = mesh(new THREE.CapsuleGeometry(0.065, 0.14, 4, 8), dark, 0.01);
    ear.rotation.z = side * 0.35;
    at(ear, side * 0.19, 0.0, -0.02, head);
  }
  for (const [x, z] of [[-0.14, 0.3], [0.14, 0.3], [-0.14, -0.3], [0.14, -0.3]]) {
    const leg = mesh(new THREE.CapsuleGeometry(0.065, 0.24, 4, 8), coat, 0.012);
    leg.name = "leg";
    at(leg, x, 0.2, z, g);
    at(mesh(new THREE.SphereGeometry(0.075, 8, 6), light, 0.008), x, 0.05, z + 0.03, g);
  }
  const tail = new THREE.Group();
  tail.name = "tail";
  at(tail, 0, 0.66, -0.48, g);
  const t = mesh(new THREE.CapsuleGeometry(0.05, 0.26, 4, 8), coat, 0.01);
  t.rotation.x = -0.7;
  at(t, 0, 0.12, -0.1, tail);
  // the red harness
  const strap = mesh(new THREE.TorusGeometry(0.255, 0.035, 6, 18), smooth(0xd63732), 0.008);
  at(strap, 0, 0.56, 0.12, g);
  const collar = mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 14), smooth(0xd63732), 0.006);
  collar.rotation.x = Math.PI / 2 - 0.5;
  at(collar, 0, 0.7, 0.42, g);
  return g;
}
