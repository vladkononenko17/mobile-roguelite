import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { at, canvasTexture, mat, mesh, signTexture } from "../../../rozshuk/src/three/models.ts";
import { glowMat } from "../../../stiny/src/three/post.ts";
import { makeRunner, animateRunner, type Runner, type Style } from "../../../tikai/src/three/runner.ts";
import { addWoolScarf, makeSledder, type SledderLook } from "./sledder.ts";

/**
 * Low-poly winter props for «З гірки!»: snow surfaces, the things on the
 * slope (snowmen, drifts, ice holes, fishermen, sheep, generators, ramps),
 * the four rides (санчата, ночви, тюбінг, фанера), candies, and the scenery
 * of six slopes (panel blocks, the old houses of the узвіз, a baroque church,
 * колиби, mountains, garlands). Same ink-outline flat style as the other
 * games, all built in code. Every prop is centred on its lane and faces +z.
 */

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const SNOW = 0xf4f7fa;
export const SNOW_SHADE = 0xd8e4ee;
const WOOD = 0x7a5232;

// ------------------------------------------------------------- surfaces

/** The sled track: packed snow with ruts. One texture tile spans the three lanes. */
export function trackTexture(kind: "snow" | "cobble" | "ice" | "night"): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    const r = rand(kind.length * 41 + 3);
    const base = { snow: "#eef3f7", cobble: "#e6ebef", ice: "#bfe0ef", night: "#a8b4cc" }[kind];
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    // soft blue shadows in the snow
    for (let i = 0; i < 40; i++) {
      g.fillStyle = kind === "ice" ? "rgba(255,255,255,.25)" : "rgba(150,180,210,.12)";
      g.beginPath();
      g.ellipse(r() * 256, r() * 256, 10 + r() * 30, 4 + r() * 10, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    if (kind === "ice") {
      // cracks in the ice
      g.strokeStyle = "rgba(255,255,255,.7)";
      g.lineWidth = 1.5;
      for (let i = 0; i < 14; i++) {
        let x = r() * 256;
        let y = r() * 256;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); }
        g.stroke();
      }
    } else {
      // two ruts per lane from the sleds before you
      g.fillStyle = kind === "night" ? "rgba(90,110,150,.22)" : "rgba(140,170,200,.28)";
      for (let l = 0; l < 3; l++) {
        const cx = (l + 0.5) * (256 / 3);
        for (const dx of [-13, 13]) g.fillRect(cx + dx - 2.5, 0, 5, 256);
      }
    }
    if (kind === "cobble") {
      // cobbles peeking through the snow at the edges
      for (let i = 0; i < 70; i++) {
        const x = r() < 0.5 ? r() * 30 : 226 + r() * 30;
        g.fillStyle = r() < 0.5 ? "#8a8478" : "#6e6a62";
        g.beginPath();
        g.ellipse(x, r() * 256, 5 + r() * 4, 4 + r() * 3, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // sparkles
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(255,255,255,.9)" : "rgba(170,195,220,.4)";
      g.fillRect(r() * 256, r() * 256, 1 + r() * 1.5, 1 + r() * 1.5);
    }
  });
}

export function snowGroundTexture(night: boolean): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    const r = rand(night ? 7 : 3);
    g.fillStyle = night ? "#aab6cc" : "#f1f5f8";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = "rgba(140,170,205,.14)";
      g.beginPath();
      g.ellipse(r() * 128, r() * 128, 8 + r() * 18, 3 + r() * 6, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = r() < 0.6 ? "rgba(255,255,255,.9)" : "rgba(120,150,190,.25)";
      g.fillRect(r() * 128, r() * 128, 1, 1);
    }
  });
}

function flat(w: number, d: number, material: THREE.Material, y = 0.02): THREE.Mesh {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  p.rotation.x = -Math.PI / 2;
  p.position.y = y;
  p.receiveShadow = true;
  return p;
}

// ------------------------------------------------------------- on the slope

export function makeSnowman(seed: number): THREE.Group {
  const r = rand(seed * 17 + 5);
  const g = new THREE.Group();
  const balls: [number, number][] = [[0.62, 0.55], [0.46, 1.38], [0.32, 2.0]];
  for (const [rad, y] of balls) at(mesh(new THREE.IcosahedronGeometry(rad, 1), SNOW, 0.03), 0, y, 0, g);
  // coal eyes and buttons, a carrot nose
  for (const s of [-1, 1]) at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), mat(0x151316)), s * 0.11, 2.08, 0.28, g);
  for (const y of [1.25, 1.45, 1.62]) at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), mat(0x151316)), 0, y, 0.44, g);
  const nose = mesh(new THREE.ConeGeometry(0.06, 0.34, 6), 0xe8602f, 0.01);
  nose.rotation.x = Math.PI / 2;
  at(nose, 0, 1.98, 0.42, g);
  if (r() < 0.6) {
    // a bucket on the head
    at(mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.34, 8), [0x54b7c6, 0xd63732, 0x8a8a8a][Math.floor(r() * 3)], 0.015), 0, 2.38, 0, g).rotation.z = 0.15;
  } else {
    at(mesh(new THREE.TorusGeometry(0.33, 0.07, 5, 10), 0xd63732, 0.01), 0, 1.75, 0, g).rotation.x = Math.PI / 2;
  }
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.9, 4), WOOD, 0.008);
    arm.rotation.z = s * 1.0;
    at(arm, s * 0.72, 1.55, 0, g);
  }
  return g;
}

export function makeDrift(width: number, wet = false): THREE.Group {
  const g = new THREE.Group();
  const c = wet ? 0xc8ccc4 : SNOW;
  for (let i = 0; i < 4; i++) {
    const b = mesh(new THREE.IcosahedronGeometry(0.55 + (i % 2) * 0.15, 1), i % 2 ? c : wet ? 0xb8bcb4 : SNOW_SHADE, 0.02);
    b.scale.set(1.3, 0.55, 1);
    at(b, -width * 0.36 + i * width * 0.24, 0.22, (i % 2) * 0.25 - 0.1, g);
  }
  return g;
}

export function makeSnowBench(makeBench: () => THREE.Group, width: number): THREE.Group {
  const b = makeBench();
  b.scale.set(width * 0.42, 1, 1);
  at(mesh(new THREE.BoxGeometry(1.8, 0.1, 0.5), SNOW, 0.01), 0, 0.56, 0, b);
  return b;
}

export function makeHole(): THREE.Group {
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.8, 14), new THREE.MeshBasicMaterial({ color: 0x0e2a3e }));
  water.rotation.x = -Math.PI / 2;
  water.scale.set(1.15, 1, 1);
  at(water, 0, 0.03, 0, g);
  const rim = mesh(new THREE.TorusGeometry(0.85, 0.12, 4, 14), 0xdff0f8, 0.012);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1.15, 1, 1);
  at(rim, 0, 0.05, 0, g);
  // chunks of broken ice around it
  const r = rand(11);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    const chunk = mesh(new THREE.BoxGeometry(0.3, 0.08, 0.22), 0xcfe8f4, 0.008);
    chunk.rotation.y = a;
    at(chunk, Math.cos(a) * 1.15, 0.05, Math.sin(a) * 0.95, g);
  }
  return g;
}

const FISHER: Style = { top: 0x4a5a3a, pants: 0x2a2a30, hat: "beanie", hatColor: 0x3a3a44, shoes: 0x1c1a17, sole: 0x1c1a17, face: "calm", build: 1.15 };

/** A fisherman on a box over his hole: he will not move for you. */
export function makeFisher(): { group: THREE.Group; rig: Runner } {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(0.6, 0.5, 0.45), 0x5a6a7a, 0.02), 0, 0.25, 0, g);
  const rig = makeRunner(FISHER);
  rig.root.rotation.y = Math.PI;
  animateRunner(rig, "sit", 0, 1);
  g.add(rig.root);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.22, 10), new THREE.MeshBasicMaterial({ color: 0x0e2a3e }));
  hole.rotation.x = -Math.PI / 2;
  at(hole, 0, 0.03, -0.75, g);
  const rod = mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.7, 4), 0xd63732, 0);
  rod.rotation.x = -1.1;
  at(rod, 0.12, 0.75, -0.5, g);
  at(new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.6, 0.004), mat(0xeeeeee)), 0.12, 0.45, -0.8, g);
  return { group: g, rig };
}

const TOURIST = (c: number): Style => ({ top: c, pants: 0x3a3a44, hat: "beanie", hatColor: 0xf2b632, face: "calm", bag: 0x2a2a2a });

/** A tourist walking up the узвіз, phone on a stick, not looking. */
export function makeTourist(seed: number): { group: THREE.Group; rig: Runner } {
  const r = rand(seed * 5 + 1);
  const g = new THREE.Group();
  const rig = makeRunner(TOURIST([0xd63732, 0x9a6bd1, 0x3a8a4a, 0x54b7c6][Math.floor(r() * 4)]));
  rig.root.rotation.y = Math.PI;
  g.add(rig.root);
  const stick = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 4), 0x2a2a2a, 0);
  stick.position.set(0, -0.5, 0.05);
  rig.hand.add(stick);
  const phone = mesh(new THREE.BoxGeometry(0.1, 0.18, 0.02), 0x151316, 0);
  phone.position.set(0, -1.05, 0.05);
  rig.hand.add(phone);
  return { group: g, rig };
}

export function makeCobbles(width: number): THREE.Group {
  const g = new THREE.Group();
  const tex = canvasTexture(128, 128, (c) => {
    const r = rand(5);
    c.fillStyle = "#5e5a54";
    c.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      c.fillStyle = ["#8a8478", "#7a7468", "#96907f"][Math.floor(r() * 3)];
      c.beginPath();
      c.ellipse(x * 16 + 8 + (y % 2) * 8, y * 16 + 8, 7, 6, 0, 0, Math.PI * 2);
      c.fill();
    }
    // snow still lying between
    for (let i = 0; i < 18; i++) { c.fillStyle = "rgba(240,245,250,.85)"; c.beginPath(); c.ellipse(r() * 128, r() * 128, 6 + r() * 12, 4 + r() * 6, 0, 0, Math.PI * 2); c.fill(); }
  });
  tex.repeat.set(1, 2);
  g.add(flat(width * 0.95, 2.4, new THREE.MeshLambertMaterial({ map: tex }), 0.025));
  return g;
}

export function makeSheep(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.6, 0], [0.45, 0.35], [0.1, -0.5]] as const) {
    const s = new THREE.Group();
    s.name = "bob";
    const body = mesh(new THREE.IcosahedronGeometry(0.42, 1), 0xf2efe6, 0.02);
    body.scale.set(0.9, 0.8, 1.2);
    at(body, 0, 0.6, 0, s);
    at(mesh(new THREE.BoxGeometry(0.22, 0.26, 0.3), 0x2a2420, 0.012), 0, 0.72, -0.5, s);
    for (const [lx, lz] of [[-0.18, 0.25], [0.18, 0.25], [-0.18, -0.25], [0.18, -0.25]]) at(mesh(new THREE.BoxGeometry(0.08, 0.36, 0.08), 0x2a2420, 0), lx, 0.18, lz, s);
    at(s, x, 0, z, g);
  }
  return g;
}

export function makeSnowHay(makeHay: () => THREE.Group): THREE.Group {
  const h = makeHay();
  at(mesh(new THREE.ConeGeometry(0.62, 0.7, 7), SNOW, 0.02), 0, 2.02, 0, h);
  return h;
}

export function makeGenerator(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(1.1, 0.75, 0.75), 0xf2b632, 0.03), 0, 0.42, 0, g);
  at(mesh(new THREE.BoxGeometry(1.2, 0.08, 0.85), 0x2a2a2a, 0.012), 0, 0.82, 0, g);
  at(mesh(new THREE.BoxGeometry(0.5, 0.3, 0.02), 0x2a2a2a, 0), 0, 0.45, 0.385, g);
  const pipe = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), 0x4a4a4a, 0.008);
  at(pipe, 0.42, 1.0, -0.2, g);
  const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), glowMat(0xffd27a, 1.6));
  bulb.userData.noAO = true;
  at(bulb, -0.3, 1.0, 0.2, g);
  at(mesh(new THREE.BoxGeometry(0.4, 0.06, 0.4), SNOW, 0), 0.2, 0.9, 0.1, g);
  return g;
}

export function makeCable(width: number): THREE.Group {
  const g = new THREE.Group();
  const c = mesh(new THREE.CylinderGeometry(0.06, 0.06, width * 1.05, 6), 0x151316, 0);
  c.rotation.z = Math.PI / 2;
  at(c, 0, 0.32, 0, g);
  for (const s of [-1, 1]) at(mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), 0xe8602f, 0.01), s * width * 0.5, 0.2, 0, g);
  // orange flags so you can see it
  for (let i = -1; i <= 1; i++) at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.01), mat(0xe8602f)), i * width * 0.3, 0.42, 0, g);
  return g;
}

export function makeRock(seed: number): THREE.Group {
  const r = rand(seed * 3 + 7);
  const g = new THREE.Group();
  const rock = mesh(new THREE.IcosahedronGeometry(0.85, 0), [0x7a7c80, 0x6a6a70, 0x8a8478][Math.floor(r() * 3)], 0.03);
  rock.scale.set(1.1, 0.8, 1);
  rock.rotation.set(r(), r(), r());
  at(rock, 0, 0.55, 0, g);
  const cap = mesh(new THREE.IcosahedronGeometry(0.6, 0), SNOW, 0.02);
  cap.scale.set(1.2, 0.35, 1.1);
  at(cap, 0, 1.05, 0, g);
  return g;
}

/** A snow ramp: a wedge rising to 0.9 m, with red and white poles. */
export function makeRamp(width: number): THREE.Group {
  const g = new THREE.Group();
  const w = width * 0.85;
  const len = 2.4;
  const h = 0.9;
  const shape = new THREE.Shape();
  shape.moveTo(-len / 2, 0);
  shape.lineTo(len / 2, h);
  shape.lineTo(len / 2, 0);
  shape.lineTo(-len / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  geo.translate(0, 0, -w / 2);
  geo.rotateY(-Math.PI / 2);
  const ramp = mesh(geo, SNOW, 0.03);
  g.add(ramp);
  // a blue stripe along the top edge so you see it coming
  const lip = mesh(new THREE.BoxGeometry(w, 0.06, 0.12), 0x54b7c6, 0.01);
  at(lip, 0, h - 0.02, len / 2 - 0.06, g);
  for (const s of [-1, 1]) {
    const pole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 5), 0xd63732, 0.008);
    at(pole, s * (w / 2 + 0.15), 0.7, len / 2 - 0.1, g);
    at(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.01), mat(0xf2b632)), s * (w / 2 + 0.28), 1.3, len / 2 - 0.1, g);
  }
  return g;
}

let iceMat: THREE.Material | null = null;
export function makeIce(len: number, width: number): THREE.Group {
  const g = new THREE.Group();
  if (!iceMat) {
    const t = trackTexture("ice");
    iceMat = new THREE.MeshLambertMaterial({ map: t, emissive: 0x2a5a7a, emissiveIntensity: 0.25 });
  }
  g.add(flat(width, len, iceMat, 0.03));
  return g;
}

let slushMat: THREE.Material | null = null;
export function makeSlush(len: number, width: number): THREE.Group {
  const g = new THREE.Group();
  if (!slushMat) {
    const t = canvasTexture(128, 128, (c) => {
      const r = rand(9);
      c.fillStyle = "#8a8e86";
      c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 40; i++) { c.fillStyle = r() < 0.5 ? "rgba(90,96,90,.5)" : "rgba(210,215,210,.5)"; c.beginPath(); c.ellipse(r() * 128, r() * 128, 4 + r() * 14, 2 + r() * 6, 0, 0, Math.PI * 2); c.fill(); }
    });
    t.repeat.set(1, 2);
    slushMat = new THREE.MeshLambertMaterial({ map: t });
  }
  g.add(flat(width * 0.95, len, slushMat, 0.028));
  return g;
}

// ------------------------------------------------------------- candies

let candyGeo: THREE.BufferGeometry | null = null;
const candyMats = new Map<number, THREE.Material>();
/** A wrapped candy: a fat middle and two twisted ends. Bright and unlit, so it reads at speed. */
export function makeCandy(color: number): THREE.Group {
  if (!candyGeo) {
    const body = new THREE.CylinderGeometry(0.2, 0.2, 0.42, 10);
    body.rotateZ(Math.PI / 2);
    const endL = new THREE.ConeGeometry(0.17, 0.26, 6);
    endL.rotateZ(Math.PI / 2);
    endL.translate(-0.33, 0, 0);
    const endR = new THREE.ConeGeometry(0.17, 0.26, 6);
    endR.rotateZ(-Math.PI / 2);
    endR.translate(0.33, 0, 0);
    candyGeo = mergeGeometries([body.toNonIndexed(), endL.toNonIndexed(), endR.toNonIndexed()], false);
  }
  let m = candyMats.get(color);
  if (!m) {
    const t = canvasTexture(64, 32, (c) => {
      c.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
      c.fillRect(0, 0, 64, 32);
      c.fillStyle = "rgba(255,255,255,.85)";
      for (let i = -2; i < 8; i++) { c.beginPath(); c.moveTo(i * 10, 0); c.lineTo(i * 10 + 5, 0); c.lineTo(i * 10 + 15, 32); c.lineTo(i * 10 + 10, 32); c.fill(); }
    }, false);
    const mm = new THREE.MeshBasicMaterial({ map: t });
    mm.color.multiplyScalar(1.15);
    m = mm;
    candyMats.set(color, m);
  }
  const g = new THREE.Group();
  const part = new THREE.Mesh(candyGeo, m);
  part.userData.noAO = true;
  g.add(part);
  return g;
}

export const CANDY_COLORS = [0xd63732, 0xf2b632, 0x54b7c6, 0x9a6bd1, 0x3a9a5a];

// ------------------------------------------------------------- rides

export type RideKind = "sled" | "nochvy" | "tube" | "plywood" | "kid";

/** A ride; its seat is at y ≈ 0.32 (0.42 for the tube). */
export function makeRide(kind: RideKind, color = 0xd63732): THREE.Group {
  const g = new THREE.Group();
  if (kind === "sled" || kind === "kid") {
    const k = kind === "kid" ? 0.78 : 1;
    for (const s of [-1, 1]) {
      at(mesh(new THREE.BoxGeometry(0.06, 0.06, 1.3 * k), 0x3a3a40, 0.008), s * 0.24 * k, 0.04, 0, g);
      const tip = mesh(new THREE.TorusGeometry(0.14 * k, 0.03, 4, 8, Math.PI), 0x3a3a40, 0.006);
      tip.rotation.y = Math.PI / 2;
      at(tip, s * 0.24 * k, 0.18 * k, 0.65 * k, g);
      for (const z of [-0.4, 0.3]) at(mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), 0x3a3a40, 0), s * 0.24 * k, 0.15, z * k, g);
    }
    for (let i = 0; i < 4; i++) at(mesh(new THREE.BoxGeometry(0.62 * k, 0.05, 0.22 * k), i % 2 ? color : WOOD, 0.008), 0, 0.28, (-0.45 + i * 0.28) * k, g);
    // the rope you hold
    const rope = mesh(new THREE.TorusGeometry(0.2 * k, 0.015, 3, 10, Math.PI), 0xe7ddc6, 0);
    rope.rotation.x = -0.6;
    at(rope, 0, 0.36, 0.72 * k, g);
  } else if (kind === "nochvy") {
    const tub = mesh(new THREE.CylinderGeometry(0.62, 0.48, 0.36, 12, 1, true), 0xa8b0b8, 0.02);
    tub.scale.set(0.85, 1, 1.35);
    at(tub, 0, 0.2, 0, g);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), mat(0x7a8088));
    bottom.rotation.x = -Math.PI / 2;
    bottom.scale.set(0.85, 1.35, 1);
    at(bottom, 0, 0.04, 0, g);
    for (const s of [-1, 1]) at(mesh(new THREE.BoxGeometry(0.06, 0.1, 0.24), 0x7a8088, 0.006), s * 0.56, 0.36, 0, g);
    const rim = mesh(new THREE.TorusGeometry(0.62, 0.03, 4, 16), 0x8a929a, 0);
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(0.85, 1.35, 1);
    at(rim, 0, 0.38, 0, g);
  } else if (kind === "tube") {
    const t = mesh(new THREE.TorusGeometry(0.5, 0.2, 8, 16), 0xf2b632, 0.02);
    t.rotation.x = Math.PI / 2;
    at(t, 0, 0.2, 0, g);
    const seat = new THREE.Mesh(new THREE.CircleGeometry(0.32, 12), mat(0x3a3a40));
    seat.rotation.x = -Math.PI / 2;
    at(seat, 0, 0.1, 0, g);
    for (const s of [-1, 1]) at(mesh(new THREE.TorusGeometry(0.08, 0.02, 3, 8), 0x151316, 0), s * 0.62, 0.3, 0, g).rotation.y = Math.PI / 2;
  } else {
    const board = mesh(new THREE.BoxGeometry(0.85, 0.05, 1.5), 0xc99a62, 0.012);
    at(board, 0, 0.06, 0, g);
    // the front bent up a little, and a crack
    const nose = mesh(new THREE.BoxGeometry(0.85, 0.05, 0.3), 0xc99a62, 0.01);
    nose.rotation.x = -0.4;
    at(nose, 0, 0.12, 0.84, g);
    at(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.5), mat(0x5a3a24)), 0.18, 0.09, -0.2, g).rotation.y = 0.4;
  }
  return g;
}

// ------------------------------------------------------------- people

export interface KidLook { coat: number; hat: number; scarf: number; pants: number; sled: number }

export const KID_COATS = [0xd63732, 0x2b5a9a, 0x3a9a5a, 0xf2b632, 0x9a6bd1, 0xe8602f, 0x54b7c6, 0xd84a8a];

export function kidLook(look: number): KidLook {
  const k = Math.floor(look * 997);
  return {
    coat: KID_COATS[k % KID_COATS.length],
    hat: KID_COATS[(k * 7 + 3) % KID_COATS.length],
    scarf: KID_COATS[(k * 3 + 5) % KID_COATS.length],
    pants: [0x2b3550, 0x3a3a44, 0x2a2a30][k % 3],
    sled: [0xd63732, 0x2b5a9a, 0x3a9a5a, 0xf2b632][(k >> 2) % 4],
  };
}

/** How a kid of the ватага looks: coat, hat, scarf and mittens from the same few cheerful colours. */
export function kidSledLook(look: number): SledderLook {
  const l = kidLook(look);
  const k = Math.floor(look * 997);
  return {
    coat: l.coat, pants: l.pants, hat: l.hat, scarf: l.scarf, mitten: KID_COATS[(k * 5 + 1) % KID_COATS.length],
    hair: [0x6a4228, 0x2a1e18, 0xc89a50, 0x8a4a22][(k >> 1) % 4], skin: [0xf0c09a, 0xe8b08a, 0xd89a78][(k >> 3) % 3],
    face: (k >> 2) % 3 === 0 ? "cheeky" : "kid", seed: look,
  };
}

/** A kid waving by the slope, a little sled beside: ride past and they hitch on. */
export function makeWaitingKid(look: number): { group: THREE.Group; rig: Runner } {
  const l = kidLook(look);
  const g = new THREE.Group();
  const rig = makeSledder(kidSledLook(look));
  rig.root.scale.setScalar(0.66);
  rig.root.rotation.y = Math.PI;
  addWoolScarf(rig, l.scarf);
  g.add(rig.root);
  const sled = makeRide("kid", l.sled);
  at(sled, 0.55, 0, 0.1, g);
  return { group: g, rig };
}

// ------------------------------------------------------------- scenery

/** A bare winter tree with snow on the branches. */
export function makeWinterTree(seed: number): THREE.Group {
  const r = rand(seed * 29 + 11);
  const g = new THREE.Group();
  const h = 3 + r() * 1.6;
  at(mesh(new THREE.CylinderGeometry(0.1, 0.17, h, 5), 0x4a3a30, 0.02), 0, h / 2, 0, g);
  for (let i = 0; i < 5; i++) {
    const b = mesh(new THREE.CylinderGeometry(0.03, 0.06, 1.2 + r() * 0.6, 4), 0x4a3a30, 0.01);
    const a = r() * Math.PI * 2;
    b.rotation.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
    at(b, Math.sin(a) * 0.35, h * (0.55 + i * 0.09), Math.cos(a) * 0.35, g);
  }
  const cap = mesh(new THREE.IcosahedronGeometry(0.7 + r() * 0.3, 0), SNOW, 0.02);
  cap.scale.set(1, 0.45, 1);
  at(cap, 0, h + 0.1, 0, g);
  return g;
}

/** Snow on top of anything boxy: a white slab a bit larger than the roof. */
export function snowCap(w: number, d: number, y: number, parent: THREE.Object3D): THREE.Mesh {
  return at(mesh(new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3), SNOW, 0.02), 0, y + 0.17, 0, parent);
}

/** An old house of the узвіз: two or three floors, colourful, with a snowy pitched roof. */
export function makeOldHouse(seed: number, facade: THREE.Texture | null): THREE.Group {
  const r = rand(seed * 23 + 1);
  const g = new THREE.Group();
  const floors = 2 + Math.floor(r() * 2);
  const h = floors * 3;
  const w = 7 + r() * 3;
  const d = 8;
  const wall = [0xe8c87a, 0xd88a7a, 0x9ac0c8, 0xe8e0c8, 0xb8d0a0, 0xe0a8b8][Math.floor(r() * 6)];
  const wallMat = facade ? new THREE.MeshLambertMaterial({ color: wall, map: facade }) : mat(wall);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  body.castShadow = body.receiveShadow = true;
  body.userData.noBatch = true;
  at(body, 0, h / 2, 0, g);
  const roof = mesh(new THREE.CylinderGeometry(0.01, Math.max(w, d) * 0.72, 2.6, 4, 1), SNOW, 0.04);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  at(roof, 0, h + 1.3, 0, g);
  return g;
}

/** A baroque church on the hill: white walls, green domes, gold on top. */
export function makeChurch(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(9, 8, 9), 0xf2efe6, 0.05), 0, 4, 0, g);
  at(mesh(new THREE.CylinderGeometry(2.4, 2.6, 3, 8), 0xf2efe6, 0.04), 0, 9.5, 0, g);
  const dome = mesh(new THREE.SphereGeometry(2.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x3a9a7a, 0.04);
  at(dome, 0, 11, 0, g);
  at(mesh(new THREE.CylinderGeometry(0.3, 0.5, 1.6, 6), 0x3a9a7a, 0.02), 0, 13.8, 0, g);
  const gold = glowMat(0xf2b632, 1.6);
  at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), gold), 0, 14.9, 0, g);
  at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), gold), 0, 15.8, 0, g);
  at(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.12), gold), 0, 16, 0, g);
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    at(mesh(new THREE.CylinderGeometry(0.7, 0.8, 2.4, 8), 0xf2efe6, 0.02), x, 9.2, z, g);
    at(mesh(new THREE.SphereGeometry(0.8, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0x3a9a7a, 0.02), x, 10.4, z, g);
    at(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), gold), x, 11.5, z, g);
  }
  return g;
}

/** A колиба: a log hut with a steep snowy roof and a lit window. */
export function makeKoliba(seed: number, night: boolean): THREE.Group {
  const r = rand(seed * 41 + 3);
  const g = new THREE.Group();
  const w = 5 + r() * 2;
  const d = 5;
  at(mesh(new THREE.BoxGeometry(w, 2.6, d), 0x6a4a30, 0.04), 0, 1.3, 0, g);
  for (let y = 0.3; y < 2.6; y += 0.45) at(mesh(new THREE.BoxGeometry(w + 0.12, 0.08, d + 0.12), 0x4a3424, 0), 0, y, 0, g);
  const roof = mesh(new THREE.CylinderGeometry(0.01, Math.max(w, d) * 0.78, 3, 4, 1), SNOW, 0.04);
  roof.rotation.y = Math.PI / 4;
  at(roof, 0, 4.1, 0, g);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), night || r() < 0.5 ? glowMat(0xffc860, 2) : mat(0x24324f));
  win.userData.noAO = true;
  at(win, 0, 1.5, d / 2 + 0.03, g);
  at(mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), 0x8a8478, 0.02), w * 0.3, 4.2, -0.6, g);
  return g;
}

/** A mountain on the horizon: grey rock with a snow cap. */
export function makeMountain(seed: number, dusk: boolean): THREE.Group {
  const r = rand(seed * 7 + 2);
  const g = new THREE.Group();
  const h = 40 + r() * 35;
  const rad = h * (0.9 + r() * 0.4);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), mat(dusk ? 0x7a6a8a : 0x8a96a8));
  rock.userData.noBatch = true;
  at(rock, 0, h / 2 - 4, 0, g);
  rock.rotation.y = r() * 3;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.42, h * 0.42, 7), mat(dusk ? 0xf2d8d0 : 0xf4f7fa));
  cap.userData.noBatch = true;
  at(cap, 0, h - 4 - h * 0.21, 0, g);
  cap.rotation.y = rock.rotation.y;
  return g;
}

const BULBS = [0xff4a4a, 0xffd04a, 0x4ad0ff, 0x6aff6a, 0xff6ad0];
/** A garland on a wire between two poles: little coloured lights, powered by a generator somewhere. */
export function makeGarland(span: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) at(mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 5), 0x3a3d40, 0.012), s * span / 2, 2.1, 0, g);
  const n = Math.max(6, Math.floor(span / 0.7));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = -span / 2 + u * span;
    const y = 4 - Math.sin(u * Math.PI) * 1.1;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), glowMat(BULBS[(i + seed) % BULBS.length], 1.6));
    b.userData.noAO = true;
    at(b, x, y, 0, g);
    if (i < n) {
      const x2 = -span / 2 + ((i + 1) / n) * span;
      const y2 = 4 - Math.sin(((i + 1) / n) * Math.PI) * 1.1;
      const wire = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x2 - x, y2 - y), 0.02, 0.02), mat(0x151316));
      wire.rotation.z = Math.atan2(y2 - y, x2 - x);
      at(wire, (x + x2) / 2, (y + y2) / 2, 0, g);
    }
  }
  return g;
}

export function makePicketFence(len: number): THREE.Group {
  const g = new THREE.Group();
  for (const y of [0.35, 0.8]) at(mesh(new THREE.BoxGeometry(0.06, 0.08, len), WOOD, 0), 0, y, 0, g);
  for (let z = -len / 2; z <= len / 2; z += 0.5) at(mesh(new THREE.BoxGeometry(0.08, 1.1, 0.12), 0x8a6040, 0), 0, 0.55, z, g);
  at(mesh(new THREE.BoxGeometry(0.2, 0.08, len), SNOW, 0), 0, 1.12, 0, g);
  return g;
}

/** The sign at the bottom of each slope. */
export function makeFinishArch(text: string, span: number): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) at(mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.6, 6), 0x3a3d40, 0.015), s * span / 2, 2.3, 0, g);
  const board = new THREE.Mesh(new THREE.BoxGeometry(span * 0.8, 0.9, 0.08), new THREE.MeshBasicMaterial({ map: signTexture(text, "#f2b632", "#171318") }));
  board.rotation.y = Math.PI;
  at(board, 0, 4.2, 0, g);
  return g;
}

/** Grandma's house at the end of the route: lit windows, smoke, a star on the roof. */
export function makeGrandmaHouse(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(8, 3, 6), 0xe8e0c8, 0.05), 0, 1.5, 0, g);
  const roof = mesh(new THREE.CylinderGeometry(0.01, 6, 2.6, 4, 1), SNOW, 0.05);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.15, 1, 0.85);
  at(roof, 0, 4.3, 0, g);
  for (const x of [-2.4, 2.4]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1), glowMat(0xffc860, 2.4));
    w.rotation.y = Math.PI;
    w.userData.noAO = true;
    at(w, x, 1.7, -3.02, g);
  }
  at(mesh(new THREE.BoxGeometry(1.2, 2.1, 0.1), 0x6a4a30, 0.02), 0, 1.05, -3.05, g);
  at(mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), 0xb8a890, 0.02), 2, 5.2, 0.5, g);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), glowMat(0xffe27a, 4));
  star.name = "star";
  star.userData.noAO = true;
  at(star, 0, 6.4, 0, g);
  return g;
}

export function makeBlockFacade(facade: THREE.Material, roof: THREE.Material, w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(10, h, w), [facade, facade, roof, roof, facade, facade]);
  block.castShadow = block.receiveShadow = true;
  block.userData.noBatch = true;
  at(block, 0, h / 2, 0, g);
  const cap = mesh(new THREE.BoxGeometry(10.3, 0.3, w + 0.3), SNOW, 0.02);
  at(cap, 0, h + 0.15, 0, g);
  return g;
}
