import * as THREE from "three";

/**
 * Low-poly models and procedural textures for «Розшук». Everything is built
 * from primitives and canvas drawings in code — flat shading, an ink outline
 * and the comic palette of the other games — so there are no asset licences.
 */

export const C = {
  ink: 0x171318,
  paper: 0xe7ddc6,
  yellow: 0xf2b632,
  orange: 0xe8602f,
  red: 0xd63732,
  acid: 0xb8d84a,
  blue: 0x54b7c6,
  skin: 0xe0a77d,
  denim: 0x3d4f6e,
  boot: 0x2e2724,
  olive: 0x5f6e37,
  navy: 0x24324f,
  white: 0xeef0ea,
  grey: 0x8b8f8c,
  wood: 0x7a5232,
  pine: 0x2f5a3c,
};

const matCache = new Map<number, THREE.MeshLambertMaterial>();
export function mat(color: number): THREE.MeshLambertMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    matCache.set(color, m);
  }
  return m;
}

const inkMat = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });

/** Ink outline as a slightly larger back-face shell. */
export function outline(m: THREE.Mesh, thickness = 0.025): THREE.Mesh {
  m.geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  m.geometry.boundingBox!.getSize(size);
  const hull = new THREE.Mesh(m.geometry, inkMat);
  hull.scale.set(
    1 + (2 * thickness) / Math.max(size.x, 0.01),
    1 + (2 * thickness) / Math.max(size.y, 0.01),
    1 + (2 * thickness) / Math.max(size.z, 0.01),
  );
  const c = new THREE.Vector3();
  m.geometry.boundingBox!.getCenter(c);
  hull.position.set(c.x * (1 - hull.scale.x), c.y * (1 - hull.scale.y), c.z * (1 - hull.scale.z));
  hull.name = "hull";
  m.add(hull);
  return m;
}

export function mesh(geometry: THREE.BufferGeometry, color: number | THREE.Material, ink = 0.025, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geometry, typeof color === "number" ? mat(color) : color);
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (ink > 0) outline(m, ink);
  return m;
}

export function at<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, parent?: THREE.Object3D): T {
  obj.position.set(x, y, z);
  parent?.add(obj);
  return obj;
}

// ------------------------------------------------------------- canvas textures

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  draw(g);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Pixel camo, «піксель»: the uniform everybody in this game is afraid of. */
export function camoTexture(palette: number[], seed = 3): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    const r = rand(seed);
    g.fillStyle = hex(palette[0]);
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = hex(palette[1 + Math.floor(r() * (palette.length - 1))]);
      const x = Math.floor(r() * 16) * 4;
      const y = Math.floor(r() * 16) * 4;
      g.fillRect(x, y, 4 + Math.floor(r() * 3) * 4, 4 + Math.floor(r() * 2) * 4);
    }
  });
}

export const CAMO_TCK = [0x6b6b45, 0x4a4a32, 0x8a845a, 0x3a3326, 0x76704a];
export const CAMO_GUARD = [0x4f6a3a, 0x324a2a, 0x6f8a4a, 0x2a2e22, 0x5a6a3a];

/** Soviet panel facade: seams, windows (some lit), balconies. 4×4 windows per tile. */
export function facadeTexture(base: number, seed: number, night: boolean): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    const r = rand(seed);
    g.fillStyle = hex(base);
    g.fillRect(0, 0, 256, 256);
    // panel noise
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.06})`;
      g.fillRect(r() * 256, r() * 256, 2 + r() * 6, 2 + r() * 6);
    }
    g.strokeStyle = "rgba(0,0,0,.22)";
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
    }
    for (let fy = 0; fy < 4; fy++) {
      for (let fx = 0; fx < 4; fx++) {
        const x = fx * 64 + 14;
        const y = fy * 64 + 16;
        const lit = night ? r() < 0.35 : r() < 0.08;
        g.fillStyle = lit ? (r() < 0.5 ? "#ffd27a" : "#ffe9a8") : night ? "#1a2030" : r() < 0.5 ? "#3b4a5a" : "#4d6070";
        g.fillRect(x, y, 36, 30);
        g.fillStyle = "rgba(255,255,255,.18)";
        if (!lit && !night) g.fillRect(x + 3, y + 3, 10, 24);
        g.strokeStyle = "#e9e3d6";
        g.lineWidth = 3;
        g.strokeRect(x, y, 36, 30);
        g.beginPath(); g.moveTo(x + 18, y); g.lineTo(x + 18, y + 30); g.stroke();
        if (r() < 0.45) {
          // glazed balcony, every family its own colour
          g.fillStyle = ["#c9c2b0", "#9fb0a8", "#b7a58a", "#d8d0c0", "#8a9aa8"][Math.floor(r() * 5)];
          g.fillRect(x - 6, y + 32, 48, 12);
          g.fillStyle = "rgba(0,0,0,.25)";
          g.fillRect(x - 6, y + 43, 48, 2);
        }
      }
    }
  });
}

export function roofTexture(seed: number): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    const r = rand(seed);
    g.fillStyle = "#4a4746";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
      const v = 50 + Math.floor(r() * 40);
      g.fillStyle = `rgb(${v},${v - 2},${v - 4})`;
      g.fillRect(r() * 128, r() * 128, 2, 2);
    }
    g.strokeStyle = "rgba(0,0,0,.35)";
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(r() * 128, r() * 128); g.lineTo(r() * 128, r() * 128); g.stroke(); }
  });
}

export function garageTexture(seed: number): THREE.CanvasTexture {
  return canvasTexture(128, 64, (g) => {
    const r = rand(seed);
    g.fillStyle = "#7c7a70";
    g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 2; i++) {
      const x = 8 + i * 64;
      const colors = ["#6b4a3a", "#3f5a6a", "#5a6a3a", "#7a3a2a", "#4a4a5a"];
      g.fillStyle = colors[Math.floor(r() * colors.length)];
      g.fillRect(x, 12, 48, 52);
      g.fillStyle = "rgba(160,80,30,.5)";
      for (let k = 0; k < 14; k++) g.fillRect(x + r() * 44, 12 + r() * 48, 3 + r() * 6, 2 + r() * 4);
      g.strokeStyle = "rgba(0,0,0,.4)";
      g.strokeRect(x, 12, 48, 52);
      g.beginPath(); g.moveTo(x + 24, 12); g.lineTo(x + 24, 64); g.stroke();
    }
    // graffiti
    g.font = "bold 14px sans-serif";
    g.fillStyle = "#d63732";
    if (r() < 0.6) g.fillText(["ДЕ БУС?", "ЛЮБА", "ЗАЇЗД", "ОЛЯ+ТОЛЯ", "НЕ ПАРК."][Math.floor(r() * 5)], 6 + r() * 40, 30 + r() * 20);
  });
}

export function signTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  return canvasTexture(256, 64, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = "#171318";
    g.lineWidth = 6;
    g.strokeRect(3, 3, 250, 58);
    g.fillStyle = fg;
    g.font = "bold 34px Oswald, 'Arial Narrow', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    let size = 34;
    while (g.measureText(text).width > 232 && size > 14) { size -= 2; g.font = `bold ${size}px Oswald, 'Arial Narrow', sans-serif`; }
    g.fillText(text, 128, 34);
  }, false);
}

export function wallpaperTexture(base: string, dot: string): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = dot;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const ox = x * 16 + (y % 2) * 8;
      g.beginPath();
      g.moveTo(ox + 8, y * 16 + 2); g.lineTo(ox + 13, y * 16 + 8); g.lineTo(ox + 8, y * 16 + 14); g.lineTo(ox + 3, y * 16 + 8);
      g.closePath(); g.fill();
    }
  });
}

/** The carpet on the wall. Every Ukrainian flat had one. */
export function carpetTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 160, (g) => {
    g.fillStyle = "#8a1f22";
    g.fillRect(0, 0, 256, 160);
    g.strokeStyle = "#e8b34a";
    g.lineWidth = 6;
    g.strokeRect(8, 8, 240, 144);
    g.strokeStyle = "#2a3a6a";
    g.lineWidth = 4;
    g.strokeRect(20, 20, 216, 120);
    const motif = (cx: number, cy: number, s: number, c: string) => {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(cx, cy - s); g.lineTo(cx + s, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s, cy);
      g.closePath(); g.fill();
    };
    motif(128, 80, 46, "#e8b34a");
    motif(128, 80, 32, "#2a3a6a");
    motif(128, 80, 18, "#d8d0c0");
    motif(128, 80, 8, "#8a1f22");
    for (const [x, y] of [[50, 50], [206, 50], [50, 110], [206, 110]]) { motif(x, y, 16, "#e8b34a"); motif(x, y, 7, "#2a3a6a"); }
    g.fillStyle = "#d8d0c0";
    for (let i = 0; i < 26; i++) { g.fillRect(14 + i * 9, 4, 3, 3); g.fillRect(14 + i * 9, 153, 3, 3); }
  }, false);
}

// ------------------------------------------------------------- characters

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** Optional prop held in the right hand (phone, folder, flashlight). */
  hand: THREE.Group;
  /** Materials that can fade when hidden. */
  fade: THREE.Material[];
  phase: number;
}

export interface Look {
  top: number | THREE.Texture;
  pants: number | THREE.Texture;
  skin?: number;
  shoes?: number;
  hat?: "beanie" | "cap" | "kashket" | "scarf" | "hood" | "hat" | "none";
  hatColor?: number;
  build?: number;
  beard?: number;
  glasses?: boolean;
  bag?: number;
}

function lookMat(v: number | THREE.Texture): THREE.MeshLambertMaterial {
  if (typeof v === "number") return new THREE.MeshLambertMaterial({ color: v, flatShading: true });
  return new THREE.MeshLambertMaterial({ map: v, flatShading: true });
}

/**
 * A chibi person (big head, short body) that reads well from the high camera.
 * Faces +z. Arms and legs are pivot groups so the scene can swing them.
 */
export function makePerson(look: Look): Rig {
  const fade: THREE.Material[] = [];
  const top = lookMat(look.top);
  const pants = lookMat(look.pants);
  const skin = new THREE.MeshLambertMaterial({ color: look.skin ?? C.skin, flatShading: true });
  const shoes = new THREE.MeshLambertMaterial({ color: look.shoes ?? C.boot, flatShading: true });
  fade.push(top, pants, skin, shoes);
  const b = look.build ?? 1;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    at(leg, s * 0.12 * b, 0.52, 0, body);
    const thigh = mesh(new THREE.BoxGeometry(0.17 * b, 0.46, 0.19), pants, 0.02);
    at(thigh, 0, -0.22, 0, leg);
    const shoe = mesh(new THREE.BoxGeometry(0.18 * b, 0.1, 0.28), shoes, 0.018);
    at(shoe, 0, -0.46, 0.04, leg);
    legs.push(leg);
  }
  const torso = mesh(new THREE.BoxGeometry(0.46 * b, 0.5, 0.3 * b), top, 0.025);
  at(torso, 0, 0.78, 0, body);
  const hips = mesh(new THREE.BoxGeometry(0.44 * b, 0.14, 0.28 * b), pants, 0.02);
  at(hips, 0, 0.52, 0, body);

  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    at(arm, s * 0.29 * b, 0.98, 0, body);
    const sleeve = mesh(new THREE.BoxGeometry(0.13, 0.42, 0.14), top, 0.018);
    at(sleeve, 0, -0.19, 0, arm);
    const hand = mesh(new THREE.IcosahedronGeometry(0.075, 0), skin, 0.014);
    at(hand, 0, -0.43, 0, arm);
    arms.push(arm);
  }
  const hand = new THREE.Group();
  at(hand, 0, -0.46, 0.05, arms[1]);

  const head = new THREE.Group();
  at(head, 0, 1.3, 0, body);
  const skull = outline(new THREE.Mesh(new THREE.IcosahedronGeometry(0.27, 1), skin), 0.025);
  skull.castShadow = true;
  skull.scale.set(1, 0.95, 0.95);
  head.add(skull);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.03), mat(C.ink));
    at(eye, s * 0.09, 0.02, 0.245, head);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 4), skin);
  at(nose, 0, -0.05, 0.27, head).rotation.x = Math.PI / 2;
  if (look.glasses) {
    const shades = mesh(new THREE.BoxGeometry(0.34, 0.07, 0.04), 0x111111, 0);
    at(shades, 0, 0.03, 0.25, head);
  }
  if (look.beard !== undefined) {
    const beard = mesh(new THREE.IcosahedronGeometry(0.17, 0), look.beard, 0.015);
    beard.scale.set(1.2, 0.9, 0.6);
    at(beard, 0, -0.17, 0.16, head);
  }
  const hc = look.hatColor ?? C.orange;
  switch (look.hat ?? "none") {
    case "beanie": {
      const cap = mesh(new THREE.SphereGeometry(0.285, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), hc, 0.02);
      at(cap, 0, 0.05, 0, head);
      const brim = mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.09, 8, 1, true), hc, 0.016);
      at(brim, 0, 0.07, 0, head);
      break;
    }
    case "hood": {
      const hood = mesh(new THREE.SphereGeometry(0.31, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.62), hc, 0.02);
      hood.rotation.x = -0.25;
      at(hood, 0, 0.02, -0.03, head);
      break;
    }
    case "kashket":
    case "cap": {
      const crown = mesh(new THREE.CylinderGeometry(look.hat === "kashket" ? 0.31 : 0.27, 0.27, 0.14, 8), hc, 0.02);
      at(crown, 0, 0.22, 0, head);
      const visor = mesh(new THREE.BoxGeometry(0.3, 0.03, 0.18), 0x1d1d1d, 0.012);
      at(visor, 0, 0.17, 0.27, head).rotation.x = 0.2;
      if (look.hat === "kashket") {
        const badge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.02), mat(C.yellow));
        at(badge, 0, 0.25, 0.3, head);
      }
      break;
    }
    case "scarf": {
      const scarf = mesh(new THREE.SphereGeometry(0.3, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.6), hc, 0.02);
      at(scarf, 0, 0.02, -0.02, head);
      const knot = mesh(new THREE.IcosahedronGeometry(0.08, 0), hc, 0.012);
      at(knot, 0, -0.27, 0.12, head);
      break;
    }
    case "hat": {
      const crown = mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.22, 8), hc, 0.02);
      at(crown, 0, 0.3, 0, head);
      const rim = mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.03, 10), hc, 0.016);
      at(rim, 0, 0.2, 0, head);
      break;
    }
  }
  if (look.bag !== undefined) {
    const bag = mesh(new THREE.BoxGeometry(0.4, 0.44, 0.22), look.bag, 0.02);
    at(bag, 0, 0.8, -0.27, body);
  }
  root.scale.setScalar(1.18);
  return { root, body, head, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], hand, fade, phase: Math.random() * 6 };
}

/** Swing limbs. `speed` in m/s; `t` seconds. */
export function animateRig(rig: Rig, speed: number, dt: number, pose: "walk" | "grab" | "sit" | "stunned" | "call" | "idle" = "walk"): void {
  const k = Math.min(1, speed / 5.5);
  rig.phase += dt * (3 + speed * 2.6);
  const swing = speed > 0.2 ? Math.sin(rig.phase) * (0.35 + k * 0.55) : 0;
  rig.legL.rotation.x = swing;
  rig.legR.rotation.x = -swing;
  rig.armL.rotation.x = -swing * 0.8;
  rig.armR.rotation.x = swing * 0.8;
  rig.armL.rotation.z = 0;
  rig.armR.rotation.z = 0;
  rig.body.rotation.x = speed > 4 ? 0.22 : speed > 0.2 ? 0.06 : 0;
  rig.body.position.y = speed > 0.2 ? Math.abs(Math.cos(rig.phase)) * 0.06 * (0.5 + k) : Math.sin(rig.phase * 0.4) * 0.008;
  rig.body.rotation.z = 0;
  if (pose === "grab") {
    rig.armL.rotation.x = -1.5;
    rig.armR.rotation.x = -1.5;
  } else if (pose === "call") {
    rig.armR.rotation.x = -2.3;
    rig.armR.rotation.z = 0.4;
  } else if (pose === "sit") {
    rig.legL.rotation.x = -1.45;
    rig.legR.rotation.x = -1.45;
    rig.body.position.y = -0.42;
    rig.armL.rotation.x = -0.5;
    rig.armR.rotation.x = -0.5;
  } else if (pose === "stunned") {
    rig.body.rotation.z = 0.5;
    rig.armL.rotation.z = -1.2;
    rig.armR.rotation.z = 1.2;
  }
}

export function setRigOpacity(rig: Rig, o: number): void {
  for (const m of rig.fade) {
    m.transparent = o < 0.99;
    m.opacity = o;
    m.depthWrite = o >= 0.99;
  }
}

export const LOOKS = {
  hero: (hoodie: boolean): Look => ({
    top: hoodie ? 0x23232a : 0x2f8f88, pants: C.denim, shoes: 0xe8e4da, hat: hoodie ? "hood" : "beanie",
    hatColor: hoodie ? 0x1b1b20 : C.orange, bag: 0x3a3a3a,
  }),
  officer: (camo: THREE.Texture): Look => ({ top: camo, pants: camo, hat: "kashket", hatColor: 0x5a5a3a, shoes: 0x1c1a17, build: 1.08 }),
  police: (): Look => ({ top: 0x22304c, pants: 0x1d2538, hat: "cap", hatColor: 0x1d2538, shoes: 0x111111 }),
  guard: (camo: THREE.Texture): Look => ({ top: camo, pants: camo, hat: "beanie", hatColor: 0x3a4a2a, shoes: 0x1c1a17, build: 1.06 }),
  babka: (): Look => ({ top: 0x5a3f5a, pants: 0x3a2f3a, hat: "scarf", hatColor: 0xc8463a, shoes: 0x2a2220, build: 1.12 }),
  arkadiy: (): Look => ({ top: 0x2b2b30, pants: 0x2b2b30, glasses: true, shoes: 0x111111, hat: "none" }),
  molfar: (): Look => ({ top: 0x5a4a32, pants: 0x3a3a2a, hat: "hat", hatColor: 0x2a2a22, beard: 0x8a8070, shoes: 0x3a2a1a }),
  clerk: (): Look => ({ top: 0x9a6bd1, pants: 0x2b2b30, hat: "none", shoes: 0x111111 }),
  shopper: (c: number): Look => ({ top: c, pants: 0x3a3a44, hat: "none" }),
};

// ------------------------------------------------------------- props & vehicles

export function makeVan(): THREE.Group {
  const g = new THREE.Group();
  const white = C.white;
  at(mesh(new THREE.BoxGeometry(2.1, 1.9, 4.6), white, 0.04), 0, 1.35, 0, g);
  at(mesh(new THREE.BoxGeometry(2.0, 1.0, 1.0), white, 0.035), 0, 0.95, 2.7, g);
  const glass = new THREE.MeshLambertMaterial({ color: 0x23344a, flatShading: true });
  at(mesh(new THREE.BoxGeometry(1.8, 0.55, 0.06), glass, 0), 0, 1.75, 2.31, g).rotation.x = -0.35;
  for (const s of [-1, 1]) {
    at(mesh(new THREE.BoxGeometry(0.06, 0.5, 1.2), glass, 0), s * 1.06, 1.75, 1.3, g);
    for (const z of [-1.4, 1.9]) {
      const wheel = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8), 0x1a1a1a, 0.02);
      wheel.rotation.z = Math.PI / 2;
      at(wheel, s * 1.0, 0.42, z, g);
    }
  }
  // the infamous stripe
  at(mesh(new THREE.BoxGeometry(2.12, 0.16, 4.62), 0x2b5a9a, 0), 0, 1.0, 0, g);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 1.2), mat(0xd8dad4));
  at(roof, 0, 2.34, -0.6, g);
  g.scale.setScalar(1.05);
  return g;
}

const CAR_COLORS = [0xb8b0a0, 0x7a2a2a, 0x2a4a6a, 0xd8d0c0, 0x4a5a3a, 0x8a6a2a, 0x5a5a62, 0xa63a2a];
export function makeCar(seed: number): THREE.Group {
  const r = rand(seed * 977 + 13);
  const g = new THREE.Group();
  const color = CAR_COLORS[Math.floor(r() * CAR_COLORS.length)];
  at(mesh(new THREE.BoxGeometry(1.7, 0.6, 3.9), color, 0.035), 0, 0.6, 0, g);
  at(mesh(new THREE.BoxGeometry(1.5, 0.55, 2.0), color, 0.03), 0, 1.15, -0.2, g);
  const glass = mat(0x2a3a4a);
  at(new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.4, 1.7), glass), 0, 1.15, -0.2, g);
  for (const s of [-1, 1]) for (const z of [-1.25, 1.25]) {
    const wheel = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.24, 8), 0x161616, 0.015);
    wheel.rotation.z = Math.PI / 2;
    at(wheel, s * 0.82, 0.32, z, g);
  }
  return g;
}

export function makeTree(seed: number, autumn: boolean): THREE.Group {
  const r = rand(seed * 31 + 7);
  const g = new THREE.Group();
  const h = 2.4 + r() * 1.2;
  at(mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 6), 0x5a4030, 0.02), 0, h / 2, 0, g);
  const colors = autumn ? [0xd98a2a, 0xc9a227, 0xb8562a, 0x8a9a3a, 0xe0b040] : [0x4f7a3a, 0x5f8a3e, 0x3f6a32];
  for (let i = 0; i < 3; i++) {
    const blob = mesh(new THREE.IcosahedronGeometry(0.9 + r() * 0.5, 0), colors[Math.floor(r() * colors.length)], 0.03);
    at(blob, (r() - 0.5) * 0.9, h + 0.2 + r() * 0.6, (r() - 0.5) * 0.9, g);
    blob.rotation.set(r(), r(), r());
  }
  return g;
}

export function makePine(seed: number, snow: boolean): THREE.Group {
  const r = rand(seed * 17 + 3);
  const g = new THREE.Group();
  const h = 3.4 + r() * 2;
  at(mesh(new THREE.CylinderGeometry(0.12, 0.2, h * 0.4, 5), 0x4a3424, 0.015), 0, h * 0.2, 0, g);
  const green = [0x2f5a3c, 0x2a4e36, 0x355f40][Math.floor(r() * 3)];
  for (let i = 0; i < 3; i++) {
    const rad = (1.3 - i * 0.32) * (0.85 + r() * 0.3);
    const cone = mesh(new THREE.ConeGeometry(rad, h * 0.42, 7), snow && i === 2 ? 0xdfe6ea : green, 0.03);
    at(cone, 0, h * (0.38 + i * 0.22), 0, g);
    cone.rotation.y = r() * 3;
  }
  return g;
}

export function makeBush(seed: number, color = 0x4f7a3a): THREE.Group {
  const r = rand(seed * 53 + 5);
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blob = mesh(new THREE.IcosahedronGeometry(0.55 + r() * 0.35, 0), [color, 0x3f6a32, 0x5f8a3e][i % 3], 0.025);
    at(blob, (r() - 0.5) * 1.3, 0.55 + r() * 0.3, (r() - 0.5) * 1.3, g);
    blob.rotation.set(r(), r(), r());
  }
  return g;
}

export function makeBench(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), C.wood, 0.02), 0, 0.48, 0, g);
  at(mesh(new THREE.BoxGeometry(1.8, 0.4, 0.07), C.wood, 0.02), 0, 0.78, -0.24, g);
  for (const s of [-0.8, 0.8]) at(mesh(new THREE.BoxGeometry(0.08, 0.46, 0.46), 0x333333, 0.012), s, 0.23, 0, g);
  return g;
}

export function makeLamp(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 6), 0x3a3d40, 0.015), 0, 2.1, 0, g);
  at(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.9), 0x3a3d40, 0.012), 0, 4.2, 0.35, g);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.4), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
  bulb.name = "bulb";
  at(bulb, 0, 4.12, 0.55, g);
  return g;
}

export function makeTrashBins(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, c] of [[-0.8, 0x2f6a3a], [0.2, 0x2f6a3a], [1.1, 0x3a5a8a]] as const) {
    at(mesh(new THREE.BoxGeometry(0.85, 1.0, 0.8), c, 0.025), x, 0.5, 0, g);
    at(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.85), 0x1f3a24, 0.015), x, 1.04, 0, g);
  }
  return g;
}

export function makeDog(): THREE.Group {
  const g = new THREE.Group();
  const coat = 0x8a6a4a;
  at(mesh(new THREE.BoxGeometry(0.4, 0.38, 0.85), coat, 0.02), 0, 0.5, 0, g);
  const head = mesh(new THREE.BoxGeometry(0.36, 0.34, 0.38), coat, 0.02);
  head.name = "head";
  at(head, 0, 0.78, 0.46, g);
  at(mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), 0x3a2a1a, 0.01), 0, 0.72, 0.68, g);
  for (const s of [-1, 1]) at(mesh(new THREE.ConeGeometry(0.08, 0.16, 4), 0x5a3a2a, 0.01), s * 0.12, 1.0, 0.42, g);
  for (const [x, z] of [[-0.14, 0.3], [0.14, 0.3], [-0.14, -0.3], [0.14, -0.3]]) at(mesh(new THREE.BoxGeometry(0.1, 0.32, 0.1), coat, 0.012), x, 0.16, z, g);
  const tail = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.34), coat, 0.01);
  tail.name = "tail";
  at(tail, 0, 0.66, -0.52, g).rotation.x = -0.6;
  return g;
}

export function makeKennel(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(1.1, 0.8, 1.0), C.wood, 0.025), 0, 0.4, -0.5, g);
  const roof = mesh(new THREE.ConeGeometry(0.9, 0.5, 4), 0x5a3a24, 0.02);
  roof.rotation.y = Math.PI / 4;
  at(roof, 0, 1.05, -0.5, g);
  return g;
}

export function makeDrone(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), 0x2a2d30, 0.02), 0, 0, 0, g);
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
    const arm = mesh(new THREE.BoxGeometry(0.06, 0.05, 0.62), 0x2a2d30, 0.01);
    arm.rotation.y = Math.atan2(x, z);
    at(arm, x / 2, 0, z / 2, g);
    const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 10), new THREE.MeshBasicMaterial({ color: 0x8a8f94, transparent: true, opacity: 0.5 }));
    prop.name = "prop";
    at(prop, x, 0.08, z, g);
  }
  const led = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  led.name = "led";
  at(led, 0, -0.1, 0.22, g);
  return g;
}

export function makeBoat(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(1.6, 0.5, 3.6), 0x3a4a3a, 0.03), 0, 0.2, 0, g);
  const bow = mesh(new THREE.ConeGeometry(0.8, 1.0, 4), 0x3a4a3a, 0.03);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  at(bow, 0, 0.2, 2.2, g);
  at(mesh(new THREE.BoxGeometry(1.0, 0.8, 1.0), 0xd8d8d0, 0.025), 0, 0.8, -0.4, g);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.3, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  lamp.rotation.x = Math.PI / 2;
  at(lamp, 0, 1.35, 0.1, g);
  return g;
}

export function makeStall(seed: number): THREE.Group {
  const r = rand(seed * 71 + 9);
  const g = new THREE.Group();
  at(mesh(new THREE.BoxGeometry(2.6, 0.9, 1.4), 0x8a6a4a, 0.025), 0, 0.45, 0, g);
  const goods = [0xd63732, 0xf2b632, 0x6faa3a, 0xe8602f, 0x9a6bd1, 0xe7ddc6];
  for (let i = 0; i < 6; i++) {
    const box = mesh(new THREE.BoxGeometry(0.36, 0.22, 0.36), goods[Math.floor(r() * goods.length)], 0.012);
    at(box, -1.0 + i * 0.4, 1.0, (r() - 0.5) * 0.6, g);
  }
  const awning = mesh(new THREE.BoxGeometry(2.9, 0.06, 1.8), [0x2a6a9a, 0xd63732, 0x3a8a4a, 0xe8b034][Math.floor(r() * 4)], 0.02);
  at(awning, 0, 2.1, 0, g).rotation.x = 0.12;
  for (const x of [-1.35, 1.35]) at(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.1, 5), 0x555555, 0), x, 1.05, 0.7, g);
  return g;
}

export function makeDesk(seed: number, indoor: "office" | "train"): THREE.Group {
  const r = rand(seed * 41 + 2);
  const g = new THREE.Group();
  if (indoor === "train") {
    // platzkart bunks
    at(mesh(new THREE.BoxGeometry(2.6, 0.45, 1.1), 0x6a3a2a, 0.02), 0, 0.3, 0, g);
    at(mesh(new THREE.BoxGeometry(2.6, 0.12, 1.1), 0x6a3a2a, 0.02), 0, 1.6, 0, g);
    const blanket = mesh(new THREE.BoxGeometry(1.6, 0.14, 0.9), r() < 0.5 ? 0x9a3a3a : 0x3a5a8a, 0.012);
    at(blanket, (r() - 0.5) * 0.6, 1.72, 0, g);
    at(mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), 0x8a7a6a, 0.012), 0, 0.85, 0, g);
    return g;
  }
  at(mesh(new THREE.BoxGeometry(2.2, 0.08, 1.1), 0xb89a6a, 0.02), 0, 0.78, 0, g);
  for (const [x, z] of [[-1, -0.45], [1, -0.45], [-1, 0.45], [1, 0.45]]) at(mesh(new THREE.BoxGeometry(0.07, 0.78, 0.07), 0x555555, 0), x, 0.39, z, g);
  at(mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05), 0x222428, 0.012), (r() - 0.5) * 0.8, 1.02, -0.2, g);
  for (let i = 0; i < 3; i++) at(mesh(new THREE.BoxGeometry(0.3, 0.05, 0.4), 0xeeeeee, 0.008), -0.6 + r() * 1.2, 0.85 + i * 0.05, 0.25, g);
  return g;
}

export function makePlant(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.5, 7), 0xb5562a, 0.02), 0, 0.25, 0, g);
  for (let i = 0; i < 5; i++) {
    const leaf = mesh(new THREE.ConeGeometry(0.16, 1.1, 4), 0x3f7a3a, 0.015);
    leaf.rotation.set(Math.cos(i * 1.3) * 0.5, 0, Math.sin(i * 1.3) * 0.5);
    at(leaf, 0, 0.9, 0, g);
  }
  return g;
}

/** Village house with a pitched roof. */
export function makeHouse(w: number, d: number, seed: number): THREE.Group {
  const r = rand(seed * 13 + 1);
  const g = new THREE.Group();
  const wall = [0xe8e0c8, 0xd8c8a0, 0xa8c0c8, 0xe0d0b0][Math.floor(r() * 4)];
  at(mesh(new THREE.BoxGeometry(w, 2.6, d), wall, 0.04), 0, 1.3, 0, g);
  const roofGeo = new THREE.CylinderGeometry(0.01, Math.max(w, d) * 0.72, 1.8, 4, 1);
  const roof = mesh(roofGeo, [0x7a3a2a, 0x4a5a6a, 0x5a4a3a][Math.floor(r() * 3)], 0.04);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  at(roof, 0, 3.5, 0, g);
  return g;
}

/** Vision fan: a flat sector rebuilt every frame from ray lengths. */
export function makeFan(segments: number): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((segments + 2) * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const idx: number[] = [];
  for (let i = 1; i <= segments; i++) idx.push(0, i, i + 1);
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = 2;
  m.frustumCulled = false;
  return m;
}

export function makeRing(radius: number, color: number, opacity = 0.6): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.82, radius, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  return m;
}
