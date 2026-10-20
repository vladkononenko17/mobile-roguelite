import * as THREE from "three";
import { C, at, canvasTexture, mat, mesh, signTexture } from "../../../rozshuk/src/three/models.ts";
import { glowMat, lightPoolMaterial } from "../../../stiny/src/three/post.ts";

/**
 * Low-poly props for «Тікай!» that «Розшук» does not have: road surfaces,
 * the things that block a lane, vehicles (кумова «копійка», a tractor, police
 * cars, фури, маршрутки) and blockposts. Same ink-outline flat style, all
 * built in code. Every prop is centred on its lane and faces +z.
 */

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ------------------------------------------------------------- surfaces

/** 10 m of road. `lanes`/`laneW` decide the markings; one texture tile spans the road width. */
export function roadTexture(kind: "highway" | "night" | "paving" | "market" | "dirt" | "forest", lanes: number): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    const r = rand(kind.length * 97 + lanes);
    const base = { highway: "#4a4a4e", night: "#36363c", paving: "#8e8a82", market: "#7a756c", dirt: "#7a6448", forest: "#4e4232" }[kind];
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    // grit
    for (let i = 0; i < 1800; i++) {
      const v = r();
      g.fillStyle = v < 0.5 ? "rgba(0,0,0,.09)" : "rgba(255,255,255,.06)";
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
    }
    if (kind === "paving" || kind === "market") {
      // concrete tiles, a few cracked or missing
      g.strokeStyle = "rgba(0,0,0,.25)";
      g.lineWidth = 2;
      const n = kind === "paving" ? 8 : 6;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const s = 256 / n;
        g.strokeRect(x * s + ((y % 2) * s) / 2, y * s, s, s);
        if (r() < 0.06) { g.fillStyle = "rgba(60,50,40,.35)"; g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4); }
      }
    }
    if (kind === "dirt" || kind === "forest") {
      // ruts
      g.fillStyle = "rgba(0,0,0,.12)";
      for (const x of [70, 186]) g.fillRect(x - 14, 0, 28, 256);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = kind === "forest" ? "rgba(40,70,30,.35)" : "rgba(90,110,50,.3)";
        g.fillRect(r() * 256, r() * 256, 3 + r() * 10, 2 + r() * 4);
      }
    }
    if (kind === "highway" || kind === "night") {
      // edge lines and dashed lane lines
      g.fillStyle = "#e8e4d8";
      g.fillRect(4, 0, 5, 256);
      g.fillRect(247, 0, 5, 256);
      for (let l = 1; l < lanes; l++) {
        const x = (l / lanes) * 256;
        for (let y = 0; y < 256; y += 64) g.fillRect(x - 2, y + 8, 4, 34);
      }
      // patches
      for (let i = 0; i < 5; i++) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(r() * 220, r() * 220, 20 + r() * 40, 10 + r() * 30); }
    }
  });
}

export function groundTexture(kind: "grass" | "dry" | "night" | "sidewalk" | "snow"): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    const r = rand(kind.length * 31);
    const base = { grass: "#5f7f3e", dry: "#8a8048", night: "#25301f", sidewalk: "#9a958a", snow: "#dfe4e6" }[kind];
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.07)";
      g.fillRect(r() * 128, r() * 128, 1 + r() * 3, 1 + r() * 3);
    }
  });
}

// ------------------------------------------------------------- foot obstacles

export function makeKiosk(seed: number): THREE.Group {
  const r = rand(seed * 7 + 1);
  const g = new THREE.Group();
  const color = [0x3a7a9a, 0xd8c8a0, 0x9a3a3a, 0x4a8a5a][Math.floor(r() * 4)];
  at(mesh(new THREE.BoxGeometry(2, 2.4, 2.8), color, 0.04), 0, 1.2, 0, g);
  at(mesh(new THREE.BoxGeometry(2.2, 0.15, 3.0), 0x2a2a2a, 0.02), 0, 2.48, 0, g);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), new THREE.MeshBasicMaterial({ map: signTexture(["КАВА", "ШАУРМА", "ПИВО", "ЛОМБАРД", "ОБМІН ВАЛЮТ", "СИГАРЕТИ"][Math.floor(r() * 6)], "#f2b632", "#171318") }));
  at(sign, 0, 2.15, -1.42, g).rotation.y = Math.PI;
  const window = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), mat(0x24324f));
  at(window, 0, 1.35, -1.41, g).rotation.y = Math.PI;
  return g;
}

/** Low fence across the lane: red-white repair barrier or a village picket fence. */
export function makeLowFence(width: number, kind: "repair" | "picket"): THREE.Group {
  const g = new THREE.Group();
  if (kind === "repair") {
    const stripes = canvasTexture(128, 16, (c) => {
      for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "#eeeeee" : "#d63732"; c.fillRect(i * 16, 0, 16, 16); }
    }, false);
    const board = mesh(new THREE.BoxGeometry(width * 0.9, 0.24, 0.06), new THREE.MeshLambertMaterial({ map: stripes }), 0.015);
    at(board, 0, 0.7, 0, g);
    for (const s of [-1, 1]) {
      at(mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), 0x333333, 0.01), s * width * 0.42, 0.4, 0, g);
      at(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), 0x333333, 0.01), s * width * 0.42, 0.03, 0, g);
    }
  } else {
    for (let i = 0; i < 7; i++) {
      const x = -width * 0.45 + (i * width * 0.9) / 6;
      at(mesh(new THREE.BoxGeometry(0.14, 0.95, 0.05), C.wood, 0.012), x, 0.47, 0, g);
    }
    for (const y of [0.3, 0.7]) at(mesh(new THREE.BoxGeometry(width * 0.95, 0.08, 0.06), 0x6a4a2a, 0.012), 0, y, -0.05, g);
  }
  return g;
}

/** A rope with washing across the lane at head height: slide under. */
export function makeLaundry(width: number, seed: number): THREE.Group {
  const r = rand(seed * 13 + 3);
  const g = new THREE.Group();
  for (const s of [-1, 1]) at(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 5), 0x6a6a6a, 0.01), s * width * 0.52, 1.05, 0, g);
  at(new THREE.Mesh(new THREE.BoxGeometry(width * 1.04, 0.02, 0.02), mat(0xdddddd)), 0, 1.9, 0, g);
  const colors = [0xeef0ea, 0xd63732, 0x54b7c6, 0xf2b632, 0x9a6bd1, 0x3d4f6e];
  let x = -width * 0.45;
  while (x < width * 0.42) {
    const w = 0.3 + r() * 0.35;
    const h = 0.4 + r() * 0.5;
    at(mesh(new THREE.BoxGeometry(w, h, 0.03), colors[Math.floor(r() * colors.length)], 0.01), x + w / 2, 1.9 - h / 2, 0, g);
    x += w + 0.08;
  }
  return g;
}

export function makeScaffold(width: number): THREE.Group {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-0.5, 0.5]) at(mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5), 0x8a8f94, 0.01), sx * width * 0.5, 1.6, sz, g);
  at(mesh(new THREE.BoxGeometry(width * 1.05, 0.08, 1.2), C.wood, 0.015), 0, 1.45, 0, g);
  at(mesh(new THREE.BoxGeometry(width * 1.05, 0.08, 1.2), C.wood, 0.015), 0, 3.0, 0, g);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.05, 1.4), new THREE.MeshLambertMaterial({ color: 0x3a8a4a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  at(net, 0, 2.25, -0.6, g);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: signTexture("ОБЕРЕЖНО", "#f2b632", "#171318") }));
  at(sign, 0, 1.25, -0.62, g).rotation.y = Math.PI;
  return g;
}

export function makePuddle(len: number, w: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), new THREE.MeshLambertMaterial({ color: 0x3a5a6a, transparent: true, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(w, len, 1);
  m.position.y = 0.02;
  m.userData.noAO = true;
  return m;
}

export function makeManhole(): THREE.Group {
  const g = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.5, 10), mat(0x0c0c0e));
  hole.rotation.x = -Math.PI / 2;
  at(hole, 0, 0.02, 0, g);
  const lid = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 10), 0x3a3a3c, 0.015);
  at(lid, 0.75, 0.05, 0.3, g).rotation.z = 0.15;
  for (let i = 0; i < 2; i++) {
    const cone = mesh(new THREE.ConeGeometry(0.16, 0.5, 6), C.orange, 0.012);
    at(cone, -0.6 + i * 1.2, 0.25, -0.6, g);
  }
  return g;
}

export function makeCrates(seed: number): THREE.Group {
  const r = rand(seed * 5 + 2);
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const c = mesh(new THREE.BoxGeometry(0.62, 0.42, 0.5), 0x9a7a4a, 0.015);
    at(c, -0.6 + i * 0.62, 0.21, (r() - 0.5) * 0.2, g);
    const pot = mesh(new THREE.IcosahedronGeometry(0.2, 0), [0xc8a060, 0xd63732, 0x6faa3a][Math.floor(r() * 3)], 0.01);
    at(pot, -0.6 + i * 0.62, 0.5, 0, g);
  }
  return g;
}

export function makeGeese(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.5, 0], [0.3, 0.5], [0.4, -0.5]]) {
    const goose = new THREE.Group();
    at(mesh(new THREE.IcosahedronGeometry(0.28, 0), 0xf2f2ea, 0.015), 0, 0.35, 0, goose).scale.set(0.9, 0.8, 1.3);
    at(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.4, 5), 0xf2f2ea, 0.01), 0, 0.65, 0.25, goose).rotation.x = 0.3;
    at(mesh(new THREE.ConeGeometry(0.05, 0.15, 4), C.orange, 0.006), 0, 0.85, 0.38, goose).rotation.x = Math.PI / 2;
    goose.name = "bob";
    at(goose, x, 0, z, g);
  }
  return g;
}

export function makeHay(): THREE.Group {
  const g = new THREE.Group();
  const stack = mesh(new THREE.ConeGeometry(1.0, 2.2, 7), 0xd8b44a, 0.03);
  at(stack, 0, 1.1, 0, g);
  at(mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.5, 7), 0xc8a43a, 0.03), 0, 0.25, 0, g);
  return g;
}

export function makeCart(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(1.5, 0.6, 2.6), C.wood, 0.03), 0, 0.85, 0, g);
  for (const s of [-1, 1]) for (const z of [-0.8, 0.8]) {
    const wheel = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 10), 0x5a3a24, 0.015);
    wheel.rotation.z = Math.PI / 2;
    at(wheel, s * 0.82, 0.45, z, g);
  }
  at(mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), 0x5a3a24, 0.01), 0, 0.6, 2, g);
  const hay = mesh(new THREE.IcosahedronGeometry(0.8, 0), 0xd8b44a, 0.02);
  hay.scale.set(0.9, 0.6, 1.4);
  at(hay, 0, 1.4, 0, g);
  return g;
}

export function makeLog(width: number): THREE.Group {
  const g = new THREE.Group();
  const log = mesh(new THREE.CylinderGeometry(0.3, 0.34, width * 0.95, 7), 0x6a4a30, 0.02);
  log.rotation.z = Math.PI / 2;
  at(log, 0, 0.3, 0, g);
  for (const s of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CircleGeometry(0.3, 7), mat(0xc8a070));
    end.rotation.y = (s * Math.PI) / 2;
    at(end, s * width * 0.476, 0.3, 0, g);
  }
  return g;
}

export function makeBranch(width: number): THREE.Group {
  const g = new THREE.Group();
  const b = mesh(new THREE.CylinderGeometry(0.12, 0.18, width * 1.3, 6), 0x4a3424, 0.015);
  b.rotation.z = Math.PI / 2 - 0.1;
  at(b, 0, 1.45, 0, g);
  for (let i = 0; i < 4; i++) {
    const leaf = mesh(new THREE.IcosahedronGeometry(0.45, 0), [0x2f5a3c, 0x3f6a32][i % 2], 0.015);
    at(leaf, -width * 0.5 + i * width * 0.33, 1.65 + (i % 2) * 0.15, 0, g);
  }
  return g;
}

export function makeRoadworks(width: number): THREE.Group {
  const g = new THREE.Group();
  const mound = mesh(new THREE.IcosahedronGeometry(0.6, 0), 0x7a6448, 0.02);
  mound.scale.set(width * 0.7, 0.45, 1.1);
  at(mound, 0, 0.18, 0, g);
  for (let i = 0; i < 4; i++) {
    const tile = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), 0x8e8a82, 0.01);
    tile.rotation.set(0.4 * i, i, 0.3);
    at(tile, -width * 0.4 + i * width * 0.27, 0.35, (i % 2) * 0.4 - 0.2, g);
  }
  return g;
}

/** Barrier arm across the lane. `h` is its height; the arm is the "arm" child (it flies up when rammed). */
export function makeBoom(width: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const post = mesh(new THREE.BoxGeometry(0.3, h + 0.2, 0.3), 0xd8d8d0, 0.02);
  at(post, -width * 0.5, (h + 0.2) / 2, 0, g);
  const stripes = canvasTexture(128, 16, (c) => {
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "#eeeeee" : "#d63732"; c.fillRect(i * 16, 0, 16, 16); }
  }, false);
  const pivot = new THREE.Group();
  pivot.name = "arm";
  at(pivot, -width * 0.5, h, 0, g);
  const arm = mesh(new THREE.BoxGeometry(width, 0.14, 0.14), new THREE.MeshLambertMaterial({ map: stripes }), 0.015);
  at(arm, width / 2, 0, 0, pivot);
  return g;
}

/** Searchlight from a drone: a pool of light on the road. */
export function makeSpot(width: number): THREE.Group {
  const g = new THREE.Group();
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.3, 3.6), lightPoolMaterial(0xcfe8ff, 0.85));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.05;
  pool.renderOrder = 2;
  g.add(pool);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, width * 0.55, 7, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  beam.position.y = 3.5;
  beam.userData.noAO = true;
  g.add(beam);
  return g;
}

// ------------------------------------------------------------- vehicles

function wheels(g: THREE.Group, x: number, zs: number[], r: number, wdt = 0.26): void {
  for (const s of [-1, 1]) for (const z of zs) {
    const w = mesh(new THREE.CylinderGeometry(r, r, wdt, 10), 0x161616, 0.015);
    w.rotation.z = Math.PI / 2;
    w.name = "wheel";
    at(w, s * x, r, z, g);
  }
}

function lamps(g: THREE.Group, x: number, y: number, zFront: number, zBack: number, round = false): void {
  for (const s of [-1, 1]) {
    const geo = round ? new THREE.CylinderGeometry(0.13, 0.13, 0.05, 10) : new THREE.BoxGeometry(0.34, 0.16, 0.05);
    const head = new THREE.Mesh(geo, glowMat(0xfff2c0, 2.5));
    if (round) head.rotation.x = Math.PI / 2;
    at(head, s * x, y, zFront, g);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.05), glowMat(0xff3020, 2));
    tail.name = "tail";
    at(tail, s * x, y, zBack, g);
  }
}

/** Кумова «копійка»: boxy, beige, proud. */
export function makeLada(color = 0xd8c8a0): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(1.62, 0.62, 4.1), color, 0.035), 0, 0.68, 0, g);
  at(mesh(new THREE.BoxGeometry(1.48, 0.58, 2.0), color, 0.03), 0, 1.27, -0.25, g);
  const glass = mat(0x2a3a4a);
  at(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.44, 1.8), glass), 0, 1.29, -0.25, g);
  for (const z of [2.07, -2.07]) at(mesh(new THREE.BoxGeometry(1.7, 0.12, 0.1), 0xc8c8c8, 0.01), 0, 0.48, z, g);
  at(mesh(new THREE.BoxGeometry(1.0, 0.2, 0.04), 0x9a9a9a, 0), 0, 0.72, 2.06, g);
  wheels(g, 0.78, [-1.25, 1.25], 0.33);
  lamps(g, 0.58, 0.72, 2.07, -2.07, true);
  // the driver
  const head = mesh(new THREE.IcosahedronGeometry(0.2, 1), C.skin, 0.015);
  at(head, -0.35, 1.45, 0.1, g);
  const beanie = mesh(new THREE.SphereGeometry(0.21, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), C.orange, 0.012);
  at(beanie, -0.35, 1.5, 0.1, g);
  // nitro flames
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), glowMat(0x5ab8ff, 3));
  flame.rotation.x = -Math.PI / 2;
  flame.name = "flame";
  flame.visible = false;
  at(flame, 0.5, 0.42, -2.55, g);
  return g;
}

/** Blue farm tractor: huge back wheels, tiny front ones. */
export function makeTractor(): THREE.Group {
  const g = new THREE.Group();
  const blue = 0x2f5aa8;
  at(mesh(new THREE.BoxGeometry(1.0, 0.8, 2.2), blue, 0.03), 0, 1.1, 0.6, g);
  at(mesh(new THREE.BoxGeometry(1.5, 1.3, 1.3), blue, 0.03), 0, 1.75, -0.8, g);
  at(new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.9, 1.2), mat(0x2a3a4a)), 0, 1.95, -0.8, g);
  at(mesh(new THREE.BoxGeometry(1.6, 0.1, 1.5), 0xeeeeee, 0.015), 0, 2.45, -0.8, g);
  at(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), 0x2a2a2a, 0.01), 0.35, 2.0, 1.2, g);
  for (const s of [-1, 1]) {
    const back = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.5, 12), 0x161616, 0.02);
    back.rotation.z = Math.PI / 2;
    back.name = "wheel";
    at(back, s * 1.0, 0.85, -0.8, g);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.52, 8), mat(C.yellow));
    hub.rotation.z = Math.PI / 2;
    at(hub, s * 1.0, 0.85, -0.8, g);
    const front = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), 0x161616, 0.015);
    front.rotation.z = Math.PI / 2;
    front.name = "wheel";
    at(front, s * 0.65, 0.42, 1.4, g);
  }
  lamps(g, 0.35, 1.25, 1.72, -1.5, true);
  const head = mesh(new THREE.IcosahedronGeometry(0.2, 1), C.skin, 0.015);
  at(head, 0, 2.05, -0.75, g);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.8, 6), glowMat(0x5ab8ff, 3));
  flame.name = "flame";
  flame.visible = false;
  at(flame, 0.35, 2.75, 1.2, g);
  return g;
}

let policeSide: THREE.CanvasTexture | null = null;
/** White patrol car with the blue stripe and a light bar ("bar" children blink). */
export function makePolice(): THREE.Group {
  const g = new THREE.Group();
  if (!policeSide) {
    policeSide = canvasTexture(256, 64, (c) => {
      c.fillStyle = "#f2f2ee";
      c.fillRect(0, 0, 256, 64);
      c.fillStyle = "#2b5aa8";
      c.fillRect(0, 26, 256, 22);
      c.fillStyle = "#f2b632";
      c.fillRect(0, 48, 256, 5);
      c.fillStyle = "#ffffff";
      c.font = "bold 18px Oswald, 'Arial Narrow', sans-serif";
      c.textAlign = "center";
      c.fillText("ПОЛІЦІЯ", 128, 43);
    }, false);
  }
  const body = new THREE.MeshLambertMaterial({ map: policeSide, flatShading: true });
  at(mesh(new THREE.BoxGeometry(1.75, 0.62, 4.3), body, 0.035), 0, 0.68, 0, g);
  at(mesh(new THREE.BoxGeometry(1.55, 0.52, 2.2), 0xf2f2ee, 0.03), 0, 1.25, -0.2, g);
  at(new THREE.Mesh(new THREE.BoxGeometry(1.57, 0.4, 2.0), mat(0x1e2a3a)), 0, 1.27, -0.2, g);
  wheels(g, 0.82, [-1.35, 1.35], 0.33);
  lamps(g, 0.6, 0.75, 2.16, -2.16);
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.26), glowMat(0xff2a2a, 4));
  red.name = "barA";
  at(red, -0.3, 1.58, -0.1, g);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.26), glowMat(0x2a6aff, 4));
  blue.name = "barB";
  at(blue, 0.3, 1.58, -0.1, g);
  return g;
}

/** Фура: cab and a long trailer. */
export function makeLorry(seed: number): THREE.Group {
  const r = rand(seed * 19 + 4);
  const g = new THREE.Group();
  const cab = [0xd63732, 0x2a4a8a, 0xeeeeee, 0x3a7a4a][Math.floor(r() * 4)];
  at(mesh(new THREE.BoxGeometry(2.3, 2.2, 1.9), cab, 0.04), 0, 1.6, 3.4, g);
  at(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 0.05), mat(0x2a3a4a)), 0, 2.05, 4.37, g);
  const tarp = [0x6a7a5a, 0x8a8a8a, 0x2a4a6a, 0xd8c8a0][Math.floor(r() * 4)];
  at(mesh(new THREE.BoxGeometry(2.4, 2.7, 6.6), tarp, 0.05), 0, 2.0, -0.9, g);
  wheels(g, 1.05, [-3.2, -2.2, 0.8, 3.4], 0.48, 0.4);
  lamps(g, 0.85, 1.0, 4.36, -4.22);
  return g;
}

/** Маршрутка: yellow van with a route number. */
export function makeMarshrutka(seed: number): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(2.0, 1.9, 5.0), 0xf2c232, 0.04), 0, 1.35, 0, g);
  at(new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.55, 3.6), mat(0x2a3a4a)), 0, 1.75, -0.4, g);
  at(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.05), mat(0x2a3a4a)), 0, 1.75, 2.51, g);
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: signTexture(`№ ${[215, 7, 42, 166, 299][seed % 5]}`, "#eeeeee", "#171318") }));
  at(num, 0, 2.1, -2.52, g).rotation.y = Math.PI;
  wheels(g, 0.95, [-1.6, 1.6], 0.4, 0.3);
  lamps(g, 0.7, 0.8, 2.51, -2.51);
  return g;
}

export function makePothole(): THREE.Group {
  const g = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.5, 7), mat(0x1c1c1e));
  hole.rotation.x = -Math.PI / 2;
  hole.scale.set(1.6, 1.2, 1);
  at(hole, 0, 0.02, 0, g);
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 7), mat(0x3a3a3c));
  rim.rotation.x = -Math.PI / 2;
  rim.scale.set(1.6, 1.2, 1);
  at(rim, 0, 0.025, 0, g);
  return g;
}

export function makeSpikes(width: number): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(width * 0.95, 0.05, 0.5), 0x2a2a2a, 0.01), 0, 0.03, 0, g);
  const spike = new THREE.ConeGeometry(0.05, 0.16, 4);
  for (let i = 0; i < 16; i++) at(new THREE.Mesh(spike, mat(0xb8b8b8)), -width * 0.45 + (i * width * 0.9) / 15, 0.12, (i % 2) * 0.2 - 0.1, g);
  return g;
}

export function makeConcrete(width: number): THREE.Group {
  const g = new THREE.Group();
  const n = Math.max(2, Math.round(width / 1.5));
  for (let i = 0; i < n; i++) {
    const b = mesh(new THREE.BoxGeometry(width / n - 0.08, 1.0, 1.2), 0xa8a49a, 0.025);
    at(b, -width / 2 + (i + 0.5) * (width / n), 0.5, 0, g);
  }
  // sandbags on top
  for (let i = 0; i < n * 2; i++) {
    const s = mesh(new THREE.BoxGeometry(0.6, 0.22, 0.4), 0x8a7a5a, 0.012);
    at(s, -width / 2 + 0.4 + i * (width - 0.8) / (n * 2 - 1), 1.12, (i % 2) * 0.3 - 0.15, g);
  }
  return g;
}

export function makeHedgehogs(width: number): THREE.Group {
  const g = new THREE.Group();
  const beam = new THREE.BoxGeometry(0.16, 1.9, 0.16);
  for (let k = 0; k < 2; k++) {
    const h = new THREE.Group();
    for (const [rx, rz] of [[0.95, 0], [-0.95, 0], [0, 0.95]]) {
      const b = mesh(beam, 0x5a4a3a, 0.012);
      b.rotation.set(rx, k, rz);
      h.add(b);
    }
    at(h, -width / 4 + (k * width) / 2, 0.75, 0, g);
  }
  return g;
}

export function makeCones(width: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Group();
    at(mesh(new THREE.ConeGeometry(0.22, 0.7, 7), C.orange, 0.015), 0, 0.35, 0, cone);
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.1, 7), mat(0xeeeeee)), 0, 0.38, 0, cone);
    at(mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5), 0x2a2a2a, 0.01), 0, 0.025, 0, cone);
    cone.name = "cone";
    at(cone, -width * 0.32 + i * width * 0.32, 0, (i % 2) * 0.4, g);
  }
  return g;
}

export function makeSignBoard(text: string, bg = "#d63732", fg = "#ffffff"): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) at(mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), 0x3a3a3a, 0.01), s * 1.1, 1.3, 0, g);
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 0.06), new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) }));
  board.rotation.y = Math.PI;
  at(board, 0, 2.3, 0, g);
  return g;
}

export function makeBillboard(text: string, bg: string, fg: string): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) at(mesh(new THREE.BoxGeometry(0.2, 4.5, 0.2), 0x3a3a3a, 0.012), s * 2.4, 2.25, 0, g);
  const board = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 0.12), new THREE.MeshLambertMaterial({ map: signTexture(text, bg, fg) }));
  at(board, 0, 5.2, 0, g);
  return g;
}

export function makeGuardRail(len: number): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(0.08, 0.3, len), 0xb8bcc0, 0.012), 0, 0.65, 0, g);
  for (let z = -len / 2; z <= len / 2; z += 4) at(mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), 0x6a6e72, 0.01), 0.1, 0.35, z, g);
  return g;
}

export function makePowerPole(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.CylinderGeometry(0.12, 0.16, 8, 6), 0x8a8478, 0.015), 0, 4, 0, g);
  at(mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), 0x6a6458, 0.01), 0, 7.4, 0, g);
  return g;
}

/** Floating power-up: a glowing ring and the icon on a billboard sprite. */
const iconTex = new Map<string, THREE.CanvasTexture>();
export function makePowerup(icon: string, color: number): THREE.Group {
  const g = new THREE.Group();
  let t = iconTex.get(icon);
  if (!t) {
    t = canvasTexture(128, 128, (c) => {
      c.fillStyle = hex(color);
      c.beginPath();
      c.arc(64, 64, 58, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 8;
      c.strokeStyle = "#171318";
      c.stroke();
      c.font = "68px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(icon, 64, 70);
    }, false);
    iconTex.set(icon, t);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
  sprite.scale.setScalar(1.1);
  sprite.name = "icon";
  g.add(sprite);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 24), glowMat(color, 2.5));
  ring.name = "ring";
  g.add(ring);
  return g;
}
