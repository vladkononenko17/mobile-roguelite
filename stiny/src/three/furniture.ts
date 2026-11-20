import * as THREE from "three";
import { bake, box, canvas, chrome, cyl, fbm, group, lathe, lumpy, normalFrom, plastic, profile, put, rbox, rng, rod, rubber, std, steel, tex, tube } from "./kit.ts";
import { surface } from "./smooth.ts";

/**
 * The things of a one-room Kyiv flat, built at real sizes (metres): a desk
 * with a drawer pedestal, an office chair, a bed with a crumpled duvet, a
 * bookcase of real-looking books, a polished wardrobe, a cast-iron radiator,
 * a Soviet carpet, a kitchen of laminate cabinets with a gas stove and a
 * whistling kettle, an enamel bath, a padded front door, jackets on hooks and
 * the go-bag by the door. Each builder returns a group, front towards +z,
 * standing on y = 0; static parts are baked.
 */

const wood = (c: number) => surface("wood", c);
const fabric = (c: number) => surface("linen", c);
const knit = (c: number) => surface("knit", c);
const enamel = (c: number) => surface("enamel", c);

// ------------------------------------------------------------------ textures

let _rug: THREE.CanvasTexture | null = null;
/** A wool carpet with the medallion every Soviet flat had (on the floor or on the wall). */
export function rugTexture(): THREE.CanvasTexture {
  if (_rug) return _rug;
  const W = 512, H = 360;
  const r = rng(7);
  const [cv, g] = canvas(W, H);
  g.fillStyle = "#6a1c22"; g.fillRect(0, 0, W, H);
  const border = (inset: number, w: number, col: string) => { g.strokeStyle = col; g.lineWidth = w; g.strokeRect(inset, inset, W - inset * 2, H - inset * 2); };
  border(10, 14, "#1e2a40"); border(24, 4, "#d8b878"); border(34, 10, "#2a3a2a");
  // the repeating motif in the border band
  for (let x = 20; x < W - 20; x += 22) for (const yy of [17, H - 17]) { g.fillStyle = "#c89a4a"; g.beginPath(); g.moveTo(x, yy - 5); g.lineTo(x + 5, yy); g.lineTo(x, yy + 5); g.lineTo(x - 5, yy); g.fill(); }
  for (let y = 20; y < H - 20; y += 22) for (const x of [17, W - 17]) { g.fillStyle = "#c89a4a"; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.fill(); }
  // the central medallion: nested diamonds and rosettes
  const cx = W / 2, cy = H / 2;
  const diamond = (s: number, col: string) => { g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy - s * 0.62); g.lineTo(cx + s, cy); g.lineTo(cx, cy + s * 0.62); g.lineTo(cx - s, cy); g.closePath(); g.fill(); };
  diamond(170, "#1e2a40"); diamond(150, "#8a2a2a"); diamond(118, "#d8b878"); diamond(104, "#5a1a20"); diamond(70, "#2a4a5a"); diamond(48, "#d8b878"); diamond(30, "#8a2a2a");
  for (const [dx, dy] of [[-150, -100], [150, -100], [-150, 100], [150, 100]]) {
    g.fillStyle = "#1e2a40"; g.beginPath(); g.arc(cx + dx, cy + dy, 26, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.fillStyle = k % 2 ? "#d8b878" : "#c84a3a"; g.beginPath(); g.arc(cx + dx + Math.cos(a) * 16, cy + dy + Math.sin(a) * 16, 6, 0, Math.PI * 2); g.fill(); }
  }
  // wool: fibre noise, a worn path across the middle
  const img = g.getImageData(0, 0, W, H);
  const f = fbm(W, H, 5, 6, 3);
  for (let i = 0; i < W * H; i++) {
    const n = 0.86 + r() * 0.2 + (f[i] - 0.5) * 0.15;
    const x = i % W;
    const worn = Math.exp(-(((x - W * 0.55) / (W * 0.18)) ** 2)) * 0.12 * (0.6 + f[i]);
    img.data[i * 4] = Math.min(255, img.data[i * 4] * n + worn * 120);
    img.data[i * 4 + 1] = Math.min(255, img.data[i * 4 + 1] * n + worn * 100);
    img.data[i * 4 + 2] = Math.min(255, img.data[i * 4 + 2] * n + worn * 90);
  }
  g.putImageData(img, 0, 0);
  _rug = tex(cv, { wrap: false });
  return _rug;
}

let _oil: THREE.CanvasTexture | null = null;
/** The oilcloth on the kitchen table: checks and little flowers. */
function oilcloth(): THREE.CanvasTexture {
  if (_oil) return _oil;
  const N = 256;
  const r = rng(3);
  const [cv, g] = canvas(N, N);
  g.fillStyle = "#f2ece0"; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 8; i++) { g.fillStyle = "rgba(170,40,40,.28)"; g.fillRect(i * 32, 0, 14, N); g.fillRect(0, i * 32, N, 14); }
  for (let i = 0; i < 40; i++) {
    const x = r() * N, y = r() * N;
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.fillStyle = "#d84a3a"; g.beginPath(); g.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.4, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#f2c84a"; g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#4a8a3a"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 3, y + 3); g.lineTo(x + 8, y + 7); g.stroke();
  }
  _oil = tex(cv, { repeat: [2, 1.4] });
  return _oil;
}

let _quilt: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;
/** The padded front door: brown leatherette in diamonds, a brass stud at every crossing. */
function quilted(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  if (_quilt) return _quilt;
  const W = 128, H = 256;
  const [cv, g] = canvas(W, H);
  const [hc, hg] = canvas(W, H);
  const cell = 32;
  g.fillStyle = "#4a2a1e"; g.fillRect(0, 0, W, H);
  hg.fillStyle = "#000"; hg.fillRect(0, 0, W, H);
  for (let y = -cell; y < H + cell; y += cell) for (let x = -cell; x < W + cell; x += cell) {
    const ox = ((y / cell) % 2) * (cell / 2);
    const cx = x + ox, cy = y;
    const gr = hg.createRadialGradient(cx, cy, 2, cx, cy, cell * 0.62);
    gr.addColorStop(0, "#fff"); gr.addColorStop(1, "#000");
    hg.fillStyle = gr; hg.beginPath(); hg.moveTo(cx, cy - cell * 0.5); hg.lineTo(cx + cell * 0.5, cy); hg.lineTo(cx, cy + cell * 0.5); hg.lineTo(cx - cell * 0.5, cy); hg.fill();
    const lg = g.createRadialGradient(cx - 4, cy - 4, 1, cx, cy, cell * 0.6);
    lg.addColorStop(0, "rgba(140,90,60,.6)"); lg.addColorStop(1, "rgba(0,0,0,.25)");
    g.fillStyle = lg; g.beginPath(); g.moveTo(cx, cy - cell * 0.5); g.lineTo(cx + cell * 0.5, cy); g.lineTo(cx, cy + cell * 0.5); g.lineTo(cx - cell * 0.5, cy); g.fill();
  }
  for (let y = -cell / 2; y < H + cell; y += cell) for (let x = 0; x < W + cell; x += cell) {
    const ox = (((y + cell / 2) / cell) % 2) * (cell / 2);
    g.fillStyle = "#d8b060"; g.beginPath(); g.arc(x + ox + cell / 2, y, 2.6, 0, Math.PI * 2); g.fill();
  }
  _quilt = { map: tex(cv, { repeat: [1, 1] }), normal: normalFrom(hc, 3) };
  return _quilt;
}

let _keys: THREE.CanvasTexture | null = null;
function keyboard(): THREE.CanvasTexture {
  if (_keys) return _keys;
  const [cv, g] = canvas(256, 128);
  g.fillStyle = "#24262a"; g.fillRect(0, 0, 256, 128);
  for (let row = 0; row < 5; row++) for (let k = 0; k < 14; k++) { g.fillStyle = "#3a3d42"; g.fillRect(8 + k * 17.4, 8 + row * 16, 15, 13); }
  g.fillStyle = "#3a3d42"; g.fillRect(60, 90, 120, 13);
  g.fillStyle = "#2e3034"; g.fillRect(88, 106, 80, 18);
  _keys = tex(cv, { wrap: false });
  return _keys;
}

const spines = new Map<number, THREE.MeshStandardMaterial>();
/** Book spines: a cloth colour with a title band and gilt lines. */
function spine(color: number): THREE.MeshStandardMaterial {
  let m = spines.get(color);
  if (!m) {
    const [cv, g] = canvas(32, 128);
    const c = new THREE.Color(color);
    g.fillStyle = `#${c.getHexString()}`; g.fillRect(0, 0, 32, 128);
    g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, 34, 32, 30);
    g.fillStyle = "rgba(230,200,120,.85)"; g.fillRect(0, 12, 32, 2); g.fillRect(0, 112, 32, 2);
    g.fillStyle = "rgba(240,230,200,.7)"; for (let i = 0; i < 4; i++) g.fillRect(9, 38 + i * 6, 14, 2);
    m = new THREE.MeshStandardMaterial({ map: tex(cv, { wrap: false }), roughness: 0.8 });
    spines.set(color, m);
  }
  return m;
}

// ------------------------------------------------------------------ the room

/** The desk: a laminate top, a pedestal of three drawers, steel legs, the things on it. */
export function desk(): THREE.Group {
  const g = new THREE.Group();
  const top = wood(0x9a7a56);
  put(g, rbox(1.4, 0.035, 0.7, 0.008, 2), top, 0, 0.745, 0);
  put(g, rbox(0.42, 0.72, 0.62, 0.01, 1), wood(0x8a6a48), -0.47, 0.36, 0.02);
  for (let k = 0; k < 3; k++) {
    put(g, rbox(0.39, 0.2, 0.02, 0.006, 1), wood(0x9a7a56), -0.47, 0.6 - k * 0.235, 0.335);
    put(g, rbox(0.12, 0.018, 0.025, 0.008, 1), steel(0xb8bcc0), -0.47, 0.62 - k * 0.235, 0.355);
  }
  const leg = steel(0x2a2c30);
  for (const z of [-0.3, 0.3]) put(g, rbox(0.04, 0.72, 0.04, 0.008, 1), leg, 0.66, 0.36, z);
  put(g, rbox(0.04, 0.04, 0.62, 0.008, 1), leg, 0.66, 0.06, 0);
  put(g, rbox(0.9, 0.3, 0.015, 0.004, 1), wood(0x8a6a48), 0.18, 0.5, -0.33);
  // a mug of cold tea, a notebook and a pen, papers, the mouse, a desk lamp
  put(g, lathe([[0, 0], [0.04, 0], [0.042, 0.005], [0.043, 0.1], [0.039, 0.1], [0.038, 0.012], [0, 0.012]], 18), enamel(0xe8e2d6), 0.5, 0.762, 0.08);
  put(g, new THREE.TorusGeometry(0.025, 0.007, 6, 12, Math.PI), enamel(0xe8e2d6), 0.545, 0.81, 0.08, { rz: -Math.PI / 2 });
  put(g, cyl(0.036, 0.036, 0.004, 14), std(0x5a3a1a, { rough: 0.15 }), 0.5, 0.85, 0.08, { shadow: false });
  put(g, rbox(0.2, 0.014, 0.27, 0.004, 1), std(0x2a3a5a, { rough: 0.7 }), 0.4, 0.77, -0.16, { ry: 0.25 });
  put(g, cyl(0.004, 0.004, 0.14, 6), plastic(0x1a3a8a), 0.36, 0.782, -0.12, { rz: Math.PI / 2, ry: 0.6 });
  for (let i = 0; i < 4; i++) put(g, box(0.21, 0.002, 0.297), std(0xf4f2ec, { rough: 0.9 }), -0.4 + i * 0.01, 0.765 + i * 0.002, 0.14 + i * 0.008, { ry: 0.1 - i * 0.08, shadow: false });
  put(g, rbox(0.22, 0.003, 0.18, 0.002, 1), std(0x1e1f22, { rough: 0.9 }), 0.38, 0.764, 0.18, { shadow: false });
  put(g, lumpy(new THREE.SphereGeometry(0.03, 10, 6), 0, 1), plastic(0x2a2a2e), 0.38, 0.775, 0.18, { s: [0.9, 0.5, 1.4] });
  const lampG = group(g, 0.6, 0.763, -0.24, -0.6);
  put(lampG, cyl(0.07, 0.075, 0.02, 18), steel(0x2a2c30), 0, 0.01, 0);
  put(lampG, rod(new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0.02, 0.3, 0.05), 0.008), steel(0x2a2c30), 0, 0, 0);
  put(lampG, rod(new THREE.Vector3(0.02, 0.3, 0.05), new THREE.Vector3(-0.08, 0.38, 0.2), 0.007), steel(0x2a2c30), 0, 0, 0);
  put(lampG, lathe([[0.012, 0], [0.06, -0.08], [0.062, -0.085]], 16), steel(0x2a2c30), -0.08, 0.4, 0.21, { rx: 0.6 });
  // the charger cable down to the socket
  put(g, tube([new THREE.Vector3(0.22, 0.765, -0.2), new THREE.Vector3(0.45, 0.765, -0.3), new THREE.Vector3(0.6, 0.6, -0.34), new THREE.Vector3(0.62, 0.15, -0.34), new THREE.Vector3(0.8, 0.02, -0.33)], 0.004, 20, 4), rubber(0x111111), 0, 0, 0, { shadow: false });
  bake(g);
  return g;
}

/** The laptop's body: keyboard, trackpad, a lid frame (the screen plane is the scene's). */
export function laptopBody(): THREE.Group {
  const g = new THREE.Group();
  const alu = std(0x6a6e74, { rough: 0.35, metal: 0.7 });
  put(g, rbox(0.34, 0.016, 0.24, 0.006, 2), alu, 0, 0.008, 0);
  put(g, new THREE.PlaneGeometry(0.31, 0.15), std(0xffffff, { map: keyboard(), rough: 0.6 }), 0, 0.0165, -0.03, { rx: -Math.PI / 2, shadow: false });
  put(g, rbox(0.34, 0.24, 0.008, 0.006, 2), alu, 0, 0.12, -0.12, { rx: -0.25 });
  bake(g);
  return g;
}

/** The office chair: five-star base on casters, gas lift, padded seat and a mesh back, a hoodie over it. */
export function officeChair(hoodie = true): THREE.Group {
  const g = new THREE.Group();
  const black = std(0x1c1d20, { rough: 0.5 });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    put(g, rbox(0.04, 0.035, 0.3, 0.01, 1), black, Math.sin(a) * 0.15, 0.07, Math.cos(a) * 0.15, { ry: a });
    put(g, lumpy(new THREE.SphereGeometry(0.025, 8, 6), 0, 1), rubber(), Math.sin(a) * 0.29, 0.028, Math.cos(a) * 0.29, { s: [1, 1, 1.4] });
  }
  put(g, cyl(0.025, 0.03, 0.35, 12), steel(0x9a9ea4), 0, 0.26, 0);
  put(g, rbox(0.48, 0.07, 0.46, 0.03, 2), fabric(0x34363c), 0, 0.47, 0);
  put(g, rbox(0.04, 0.32, 0.04, 0.01, 1), black, 0, 0.6, 0.24);
  put(g, rbox(0.44, 0.48, 0.035, 0.04, 2), std(0x24262a, { rough: 0.85 }), 0, 0.88, 0.26, { rx: 0.12 });
  for (const s of [-1, 1]) {
    put(g, rbox(0.03, 0.2, 0.04, 0.01, 1), black, s * 0.24, 0.6, 0.02);
    put(g, rbox(0.06, 0.025, 0.24, 0.012, 1), black, s * 0.24, 0.7, 0.02);
  }
  if (hoodie) put(g, lumpy(rbox(0.46, 0.34, 0.1, 0.05, 3), 0.12, 9, 4), knit(0x5a5c62), 0, 0.98, 0.31, { rx: 0.15 });
  bake(g);
  return g;
}

/** A wooden bed: frame and headboard, mattress, a crumpled duvet, two pillows, a plaid at the foot. Head towards −z. */
export function bed(): THREE.Group {
  const g = new THREE.Group();
  const frame = wood(0x6a4a34);
  put(g, rbox(1.52, 0.26, 2.12, 0.02, 2), frame, 0, 0.22, 0);
  for (const [x, z] of [[-0.7, -1.0], [0.7, -1.0], [-0.7, 1.0], [0.7, 1.0]]) put(g, rbox(0.07, 0.1, 0.07, 0.01, 1), frame, x, 0.05, z);
  put(g, profile([[-0.06, 0], [0.0, 0], [0.0, 0.92], [-0.02, 0.96], [-0.04, 0.96], [-0.06, 0.92]], 1.56, 0.012, 4), frame, 0, 0, -1.04);
  put(g, rbox(1.44, 0.2, 2.02, 0.07, 3), fabric(0xece6da), 0, 0.44, 0.02);
  put(g, lumpy(rbox(1.5, 0.11, 1.38, 0.05, 4), 0.05, 5, 3), knit(0x3a5470), 0.02, 0.58, 0.34, { ry: 0.03 });
  put(g, lumpy(rbox(1.46, 0.12, 0.3, 0.05, 3), 0.08, 7, 5), knit(0x3a5470), 0.04, 0.6, -0.36, { rx: 0.3 });
  for (const s of [-0.34, 0.33]) put(g, lumpy(rbox(0.6, 0.14, 0.4, 0.07, 3), 0.08, 8, s * 10), fabric(0xf2eee4), s, 0.6, -0.78, { ry: s * 0.12 });
  put(g, lumpy(rbox(1.1, 0.06, 0.42, 0.03, 2), 0.06, 8, 9), knit(0x8a3a32), 0.05, 0.66, 0.86, { ry: -0.08 });
  bake(g);
  return g;
}

/** The bedside table with a lamp, the phone on its cable, a glass of water. */
export function nightstand(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(0.44, 0.5, 0.4, 0.012, 1), wood(0x6a4a34), 0, 0.25, 0);
  put(g, rbox(0.4, 0.14, 0.02, 0.006, 1), wood(0x7a5a40), 0, 0.38, 0.2);
  put(g, cyl(0.012, 0.012, 0.02, 8), std(0xc8a050, { rough: 0.3, metal: 0.9 }), 0, 0.38, 0.215, { rx: Math.PI / 2 });
  put(g, lathe([[0, 0], [0.06, 0], [0.065, 0.02], [0.03, 0.04], [0.025, 0.2], [0, 0.2]], 16), enamel(0xc8b898), -0.1, 0.5, -0.05);
  put(g, lathe([[0.06, 0], [0.11, -0.15], [0.112, -0.155]], 18), fabric(0xe8dcc0), -0.1, 0.84, -0.05, { rx: Math.PI });
  put(g, lathe([[0, 0], [0.03, 0], [0.034, 0.1], [0.03, 0.1], [0.027, 0.004], [0, 0.004]], 14), std(0xd8e8f0, { rough: 0.05, opacity: 0.45, transparent: true }), 0.12, 0.5, 0.06);
  put(g, rbox(0.075, 0.008, 0.155, 0.004, 1), std(0x111214, { rough: 0.2 }), 0.08, 0.505, -0.1, { ry: 0.3 });
  bake(g);
  return g;
}

/** A bookcase of books: real heights and colours, some leaning, some lying in stacks; a photo, a box. Front +z. */
export function bookcase(seed = 4): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const W = 1.2, D = 0.36, H = 1.95;
  const frame = wood(0x5e4230);
  for (const s of [-1, 1]) put(g, rbox(0.025, H, D, 0.006, 1), frame, s * (W / 2 - 0.0125), H / 2, 0);
  put(g, rbox(W, 0.025, D, 0.006, 1), frame, 0, H - 0.0125, 0);
  put(g, rbox(W - 0.05, 0.08, 0.02, 0.004, 1), frame, 0, 0.04, D / 2 - 0.02);
  put(g, box(W - 0.04, H - 0.04, 0.01), wood(0x4a3424), 0, H / 2, -D / 2 + 0.005);
  const shelves = [0.08, 0.5, 0.9, 1.3, 1.62];
  for (const y of shelves) put(g, rbox(W - 0.05, 0.02, D - 0.02, 0.004, 1), frame, 0, y, 0);
  const cols = [0x7a2a24, 0x2a3a5a, 0xc8b890, 0x3a5a3a, 0x5a3a5a, 0x8a6a3a, 0x2a2a2a, 0xa8483a, 0x4a6a7a, 0xd8d0b8, 0x6a5a2a];
  shelves.slice(0, 4).forEach((y, si) => {
    let x = -W / 2 + 0.04;
    const end = W / 2 - 0.04;
    while (x < end - 0.03) {
      const roll = r();
      if (roll < 0.07 && x < end - 0.25) {
        // a stack lying flat
        for (let k = 0; k < 3 + Math.floor(r() * 3); k++) put(g, box(0.2 + r() * 0.06, 0.035, 0.24), spine(cols[Math.floor(r() * cols.length)]), x + 0.12, y + 0.028 + k * 0.036, 0.01, { ry: (r() - 0.5) * 0.2 });
        x += 0.26;
        continue;
      }
      if (roll < 0.11 && si !== 1) {
        // a framed photo or a little box instead of books
        put(g, rbox(0.13, 0.17, 0.015, 0.004, 1), wood(0x3a2a1e), x + 0.07, y + 0.095, 0.05, { rx: -0.15 });
        put(g, new THREE.PlaneGeometry(0.1, 0.13), std(0xb8a888, { rough: 0.6 }), x + 0.07, y + 0.097, 0.059, { rx: -0.15, shadow: false });
        x += 0.16;
        continue;
      }
      const t = 0.022 + r() * 0.035, h = 0.18 + r() * 0.13, d = 0.15 + r() * 0.08;
      const lean = r() < 0.08 ? 0.18 : 0;
      put(g, box(t, h, d), spine(cols[Math.floor(r() * cols.length)]), x + t / 2 + (lean ? h * 0.08 : 0), y + 0.01 + h / 2, D / 2 - d / 2 - 0.02, { ry: Math.PI / 2, rz: lean });
      x += t + 0.002 + (lean ? 0.04 : 0);
      if (r() < 0.04) x += 0.05;
    }
  });
  // on top: a box and rolled papers
  put(g, rbox(0.4, 0.22, 0.3, 0.01, 1), std(0xb08a5a, { rough: 0.9 }), -0.25, H + 0.11, 0);
  put(g, cyl(0.03, 0.03, 0.5, 10), std(0xe8e2d0, { rough: 0.9 }), 0.25, H + 0.03, 0.05, { rz: Math.PI / 2, ry: 0.3 });
  bake(g);
  return g;
}

/** A polished veneer wardrobe: two doors and a mirror door, a drawer, a suitcase on top. Front +z. */
export function wardrobe(): THREE.Group {
  const g = new THREE.Group();
  const W = 1.6, H = 2.1, D = 0.55;
  const veneer = std(0x5a3424, { rough: 0.32, map: surfaceMap("wood"), key: "veneer" });
  put(g, rbox(W, H, D, 0.012, 1), veneer, 0, H / 2 + 0.06, 0);
  put(g, box(W - 0.06, 0.06, D - 0.04), std(0x2a1a14, { rough: 0.8 }), 0, 0.03, 0);
  const dw = (W - 0.06) / 3;
  for (let k = 0; k < 3; k++) {
    const x = -W / 2 + 0.03 + dw * (k + 0.5);
    put(g, rbox(dw - 0.012, 1.68, 0.02, 0.006, 1), veneer, x, 1.25, D / 2 + 0.01);
    if (k === 1) put(g, rbox(dw - 0.12, 1.4, 0.006, 0.004, 1), std(0xc8d4dc, { rough: 0.02, metal: 1 }), x, 1.25, D / 2 + 0.022);
    put(g, cyl(0.008, 0.008, 0.12, 8), std(0xc8a050, { rough: 0.3, metal: 0.9 }), x + (k === 0 ? dw / 2 - 0.05 : -dw / 2 + 0.05), 1.2, D / 2 + 0.035);
  }
  put(g, rbox(W - 0.06, 0.26, 0.02, 0.006, 1), veneer, 0, 0.26, D / 2 + 0.01);
  put(g, rbox(0.3, 0.02, 0.02, 0.008, 1), std(0xc8a050, { rough: 0.3, metal: 0.9 }), 0, 0.28, D / 2 + 0.03);
  put(g, rbox(0.7, 0.22, 0.45, 0.04, 2), std(0x3a2a24, { rough: 0.6 }), -0.3, H + 0.17, 0);
  put(g, rbox(0.5, 0.3, 0.4, 0.01, 1), std(0xb08a5a, { rough: 0.9 }), 0.4, H + 0.21, 0);
  bake(g);
  return g;
}

function surfaceMap(kind: "wood"): THREE.Texture | null {
  return (surface(kind, 0xffffff).map as THREE.Texture) ?? null;
}

/** A chest of drawers with a television, the router blinking, a jar of coins. Front +z. */
export function dresser(): THREE.Group {
  const g = new THREE.Group();
  const veneer = std(0x5a3424, { rough: 0.32, map: surfaceMap("wood"), key: "veneer" });
  put(g, rbox(1.0, 0.82, 0.45, 0.01, 1), veneer, 0, 0.45, 0);
  put(g, box(0.94, 0.04, 0.4), std(0x2a1a14), 0, 0.02, 0);
  for (let k = 0; k < 3; k++) {
    put(g, rbox(0.94, 0.24, 0.02, 0.006, 1), veneer, 0, 0.74 - k * 0.26, 0.23);
    for (const s of [-0.28, 0.28]) put(g, rbox(0.1, 0.018, 0.02, 0.008, 1), std(0xc8a050, { rough: 0.3, metal: 0.9 }), s, 0.76 - k * 0.26, 0.25);
  }
  const tv = group(g, -0.1, 0.86, -0.05);
  put(tv, rbox(0.25, 0.015, 0.16, 0.005, 1), std(0x1a1a1c, { rough: 0.4 }), 0, 0.008, 0);
  put(tv, rbox(0.04, 0.06, 0.03, 0.005, 1), std(0x1a1a1c, { rough: 0.4 }), 0, 0.04, 0);
  put(tv, rbox(0.82, 0.48, 0.04, 0.01, 1), std(0x111214, { rough: 0.3 }), 0, 0.31, -0.01);
  put(tv, new THREE.PlaneGeometry(0.79, 0.45), std(0x0a0c10, { rough: 0.05, metal: 0.4 }), 0, 0.31, 0.011, { shadow: false });
  put(g, rbox(0.2, 0.03, 0.14, 0.01, 1), plastic(0xe8e8e4), 0.36, 0.875, -0.02);
  for (let k = 0; k < 4; k++) put(g, box(0.008, 0.006, 0.004), std(0x000000, { emissive: 0x40ff60, emissiveIntensity: 2 }), 0.3 + k * 0.025, 0.885, 0.051, { shadow: false });
  put(g, lathe([[0, 0], [0.04, 0], [0.042, 0.1], [0.03, 0.12], [0, 0.12]], 14), std(0xc8dce0, { rough: 0.05, opacity: 0.5, transparent: true }), 0.38, 0.86, 0.12);
  bake(g);
  return g;
}

/** A cast-iron radiator in sections, painted over many times. */
export function radiator(sections = 10): THREE.Group {
  const g = new THREE.Group();
  const paint = std(0xece6d6, { rough: 0.45 });
  const sec = rbox(0.07, 0.56, 0.12, 0.025, 2);
  for (let k = 0; k < sections; k++) put(g, sec, paint, (k - (sections - 1) / 2) * 0.085, 0.38, 0);
  for (const y of [0.16, 0.6]) put(g, cyl(0.02, 0.02, sections * 0.085 + 0.1, 10), paint, 0, y, 0, { rz: Math.PI / 2 });
  put(g, rod(new THREE.Vector3(sections * 0.0425 + 0.05, 0.6, 0), new THREE.Vector3(sections * 0.0425 + 0.12, 0.6, -0.05), 0.015), steel(0x8a8e94), 0, 0, 0);
  put(g, cyl(0.016, 0.016, 0.7, 8), steel(0x8a8e94), sections * 0.0425 + 0.12, 0.95, -0.05);
  bake(g);
  return g;
}

/** A carpet on the floor, its fringe at the ends. */
export function rug(w: number, d: number): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(w, 0.012, d, 0.004, 1), std(0xffffff, { map: rugTexture(), rough: 1 }), 0, 0.006, 0, { shadow: false });
  for (const s of [-1, 1]) for (let k = 0; k < Math.round(w * 30); k++) put(g, box(0.006, 0.003, 0.05), std(0xe8dcc0, { rough: 1 }), -w / 2 + 0.02 + k / 30, 0.004, s * (d / 2 + 0.024), { shadow: false });
  bake(g, false);
  return g;
}

/** The floor lamp: three wooden legs, a fabric drum shade. */
export function floorLamp(): THREE.Group {
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    put(g, rod(new THREE.Vector3(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25), new THREE.Vector3(0, 1.45, 0), 0.015), wood(0x7a5a3a), 0, 0, 0);
  }
  put(g, lathe([[0.2, 0], [0.18, 0.32], [0.175, 0.32], [0.195, 0]], 24), std(0xe8dcbc, { rough: 0.9, side: THREE.DoubleSide }), 0, 1.38, 0);
  bake(g);
  return g;
}

/** Skirting along a wall. */
export function skirting(len: number): THREE.BufferGeometry { return rbox(len, 0.07, 0.016, 0.005, 1); }
export const skirtingMat = () => wood(0x6a4a34);

/** Door trim (architrave) round an opening of width w, height h. Front +z. */
export function architrave(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const m = std(0xece6d8, { rough: 0.5 });
  for (const s of [-1, 1]) put(g, rbox(0.07, h + 0.035, 0.02, 0.005, 1), m, s * (w / 2 + 0.035), (h + 0.035) / 2, 0);
  put(g, rbox(w + 0.14, 0.07, 0.02, 0.005, 1), m, 0, h + 0.035, 0);
  bake(g);
  return g;
}

/** A wall clock. */
export function clock(): THREE.Group {
  const g = new THREE.Group();
  put(g, cyl(0.15, 0.15, 0.04, 28), plastic(0x2a2a2e), 0, 0, 0, { rx: Math.PI / 2 });
  put(g, cyl(0.135, 0.135, 0.005, 28), std(0xf4f0e6), 0, 0, 0.021, { rx: Math.PI / 2, shadow: false });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; put(g, box(0.008, 0.02, 0.002), plastic(0x111111), Math.sin(a) * 0.115, Math.cos(a) * 0.115, 0.025, { rz: -a, shadow: false }); }
  put(g, box(0.006, 0.08, 0.002), plastic(0x111111), 0.02, 0.02, 0.027, { rz: -0.8, shadow: false });
  put(g, box(0.005, 0.11, 0.002), plastic(0x111111), -0.03, 0.045, 0.028, { rz: 0.6, shadow: false });
  bake(g);
  return g;
}

// ------------------------------------------------------------------ the kitchen

/** A run of laminate base cabinets from x0 to x1 (local x), with a worktop, a stainless sink at `sinkX`, a gap for the stove. */
export function kitchenRun(x0: number, x1: number, gap: [number, number], sinkX: number): THREE.Group {
  const g = new THREE.Group();
  const carcass = std(0xe8e0cc, { rough: 0.4 });
  const front = std(0xd8ccae, { rough: 0.35 });
  const handle = steel(0xb8bcc0);
  const worktop = std(0xd8d0c0, { rough: 0.45, map: surfaceMap("wood"), key: "worktop" });
  const spans: Array<[number, number]> = [[x0, gap[0]], [gap[1], x1]];
  for (const [a, b] of spans) {
    if (b - a < 0.05) continue;
    put(g, rbox(b - a, 0.82, 0.58, 0.005, 1), carcass, (a + b) / 2, 0.47, 0);
    put(g, box(b - a - 0.02, 0.08, 0.5), std(0x3a3632, { rough: 0.9 }), (a + b) / 2, 0.04, -0.02);
    put(g, rbox(b - a + 0.01, 0.035, 0.62, 0.008, 2), worktop, (a + b) / 2, 0.9, 0.01);
    const n = Math.max(1, Math.round((b - a) / 0.5));
    const w = (b - a) / n;
    for (let k = 0; k < n; k++) {
      const x = a + w * (k + 0.5);
      put(g, rbox(w - 0.008, 0.7, 0.018, 0.004, 1), front, x, 0.47, 0.3);
      put(g, rbox(w - 0.008, 0.11, 0.018, 0.004, 1), front, x, 0.81, 0.3);
      put(g, rbox(0.12, 0.012, 0.025, 0.006, 1), handle, x, 0.81, 0.325);
      put(g, rbox(0.012, 0.12, 0.025, 0.006, 1), handle, x + (k % 2 ? -1 : 1) * (w / 2 - 0.06), 0.66, 0.325);
    }
  }
  // the sink: a steel bowl set into the worktop, a mixer tap
  put(g, rbox(0.5, 0.02, 0.44, 0.02, 2), steel(0xc8ccd0), sinkX, 0.918, 0.02);
  put(g, rbox(0.4, 0.015, 0.34, 0.03, 2), steel(0x8a8e92), sinkX, 0.925, 0.02, { shadow: false });
  put(g, tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.28, 0), new THREE.Vector3(0, 0.32, 0.06), new THREE.Vector3(0, 0.26, 0.17)], 0.012, 16, 8), chrome(), sinkX, 0.93, -0.19);
  put(g, cyl(0.025, 0.028, 0.05, 12), chrome(), sinkX, 0.95, -0.19);
  put(g, rbox(0.012, 0.012, 0.09, 0.005, 1), chrome(), sinkX + 0.04, 0.99, -0.17, { ry: 0.5 });
  bake(g);
  return g;
}

/** A white enamel gas stove: four burners on grates, knobs, the oven door with its window. Front +z. */
export function gasStove(): THREE.Group {
  const g = new THREE.Group();
  const white = enamel(0xeeece6);
  put(g, rbox(0.56, 0.86, 0.58, 0.012, 2), white, 0, 0.43, 0);
  put(g, rbox(0.56, 0.008, 0.58, 0.004, 1), std(0x2a2a2c, { rough: 0.4 }), 0, 0.865, 0, { shadow: false });
  for (const [x, z, r] of [[-0.13, -0.13, 0.05], [0.13, -0.13, 0.04], [-0.13, 0.12, 0.04], [0.13, 0.12, 0.05]] as const) {
    put(g, cyl(r, r + 0.008, 0.02, 16), std(0x1a1a1c, { rough: 0.5, metal: 0.5 }), x, 0.875, z);
    put(g, cyl(r * 0.45, r * 0.45, 0.012, 12), std(0x3a3a3e, { rough: 0.5, metal: 0.5 }), x, 0.89, z);
    for (let k = 0; k < 4; k++) put(g, box(r * 2.6, 0.01, 0.012), std(0x111112, { rough: 0.6, metal: 0.4 }), x, 0.9, z, { ry: (k * Math.PI) / 4 });
  }
  put(g, rbox(0.54, 0.08, 0.03, 0.01, 1), white, 0, 0.8, 0.29);
  for (let k = 0; k < 4; k++) put(g, cyl(0.02, 0.022, 0.025, 14), plastic(0x2a2a2c), -0.18 + k * 0.12, 0.8, 0.31, { rx: Math.PI / 2 });
  put(g, rbox(0.5, 0.5, 0.02, 0.01, 1), white, 0, 0.42, 0.295);
  put(g, rbox(0.3, 0.2, 0.006, 0.01, 1), std(0x15161a, { rough: 0.05, metal: 0.4 }), 0, 0.46, 0.305, { shadow: false });
  put(g, cyl(0.012, 0.012, 0.42, 10), chrome(), 0, 0.69, 0.33, { rz: Math.PI / 2 });
  bake(g);
  return g;
}

/** The whistling kettle. */
export function kettle(): THREE.Group {
  const g = new THREE.Group();
  const body = enamel(0xc8382e);
  put(g, lathe([[0, 0], [0.1, 0], [0.11, 0.03], [0.1, 0.12], [0.06, 0.16], [0.03, 0.17], [0, 0.18]], 22), body, 0, 0, 0);
  put(g, tube([new THREE.Vector3(0.08, 0.06, 0), new THREE.Vector3(0.14, 0.12, 0), new THREE.Vector3(0.17, 0.17, 0)], 0.013, 10, 8), body, 0, 0, 0);
  put(g, tube([new THREE.Vector3(-0.06, 0.15, 0), new THREE.Vector3(-0.03, 0.25, 0), new THREE.Vector3(0.05, 0.25, 0), new THREE.Vector3(0.07, 0.15, 0)], 0.008, 16, 6), plastic(0x1a1a1a), 0, 0, 0);
  bake(g);
  return g;
}

/** An upper wall cabinet run (w wide), doors and handles, a plate rack shelf under it. */
export function wallCabinets(w: number): THREE.Group {
  const g = new THREE.Group();
  const carcass = std(0xe8e0cc, { rough: 0.4 });
  const front = std(0xd8ccae, { rough: 0.35 });
  put(g, rbox(w, 0.7, 0.32, 0.005, 1), carcass, 0, 0.35, 0);
  const n = Math.max(1, Math.round(w / 0.5));
  for (let k = 0; k < n; k++) {
    const x = -w / 2 + (w / n) * (k + 0.5);
    put(g, rbox(w / n - 0.008, 0.68, 0.018, 0.004, 1), front, x, 0.35, 0.165);
    put(g, rbox(0.012, 0.1, 0.025, 0.006, 1), steel(0xb8bcc0), x + (k % 2 ? 1 : -1) * (w / n / 2 - 0.05), 0.1, 0.18);
  }
  bake(g);
  return g;
}

/** The fridge: an old two-door with a long chrome handle. Front +z. */
export function fridge(): THREE.Group {
  const g = new THREE.Group();
  const body = std(0xeceae2, { rough: 0.3, metal: 0.05 });
  put(g, rbox(0.6, 1.85, 0.62, 0.03, 2), body, 0, 0.925, 0);
  put(g, box(0.58, 0.006, 0.01), std(0x8a8a88), 0, 1.2, 0.312, { shadow: false });
  for (const [y, h] of [[1.55, 0.3], [0.85, 0.36]]) put(g, rbox(0.03, h, 0.04, 0.012, 1), chrome(), 0.24, y, 0.33);
  put(g, rbox(0.56, 0.08, 0.02, 0.01, 1), std(0x2a2a2c, { rough: 0.6 }), 0, 0.05, 0.3);
  bake(g);
  return g;
}

/** The kitchen table under its oilcloth, a napkin holder and a sugar bowl. */
export function kitchenTable(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(1.0, 0.03, 0.7, 0.006, 1), wood(0x8a6a4a), 0, 0.73, 0);
  put(g, profile([[-0.36, 0.745], [0.36, 0.745], [0.37, 0.74], [0.37, 0.68], [0.365, 0.68], [0.36, 0.735], [-0.36, 0.735], [-0.365, 0.68], [-0.37, 0.68], [-0.37, 0.74]], 1.02, 0.003, 2), std(0xffffff, { map: oilcloth(), rough: 0.25 }), 0, 0, 0);
  for (const [x, z] of [[-0.44, -0.29], [0.44, -0.29], [-0.44, 0.29], [0.44, 0.29]]) put(g, rbox(0.04, 0.72, 0.04, 0.008, 1), wood(0x6a4a34), x, 0.36, z);
  put(g, rbox(0.12, 0.08, 0.05, 0.01, 1), plastic(0xe8e4dc), 0.15, 0.79, -0.1);
  put(g, lathe([[0, 0], [0.04, 0], [0.05, 0.05], [0.045, 0.07], [0, 0.07]], 16), enamel(0xf0ece4), -0.2, 0.75, 0.05);
  bake(g);
  return g;
}

/** A wooden stool. */
export function stool(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(0.34, 0.035, 0.34, 0.01, 2), wood(0x9a7a4a), 0, 0.45, 0);
  for (const [x, z] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) put(g, rod(new THREE.Vector3(x, 0.44, z), new THREE.Vector3(x * 1.25, 0, z * 1.25), 0.016), wood(0x7a5a3a), 0, 0, 0);
  for (const s of [-1, 1]) put(g, cyl(0.01, 0.01, 0.3, 6), wood(0x7a5a3a), s * 0.15, 0.18, 0, { rx: Math.PI / 2 });
  bake(g);
  return g;
}

/** Jars of buckwheat, rice and sugar; a bread board; a pan. */
export function counterThings(): THREE.Group {
  const g = new THREE.Group();
  const glassM = std(0xd8e4e8, { rough: 0.05, opacity: 0.4, transparent: true });
  [[0xb08a5a, 0], [0xf0ece0, 0.13], [0xe8d8b0, 0.26]].forEach(([c, x]) => {
    put(g, cyl(0.05, 0.05, 0.14, 14), std(c, { rough: 0.9 }), x, 0.06, 0);
    put(g, cyl(0.055, 0.055, 0.18, 14), glassM, x, 0.09, 0);
    put(g, cyl(0.058, 0.058, 0.025, 14), plastic(0xc83a2e), x, 0.19, 0);
  });
  put(g, rbox(0.4, 0.02, 0.26, 0.008, 1), wood(0xb08a5a), 0.62, 0.01, 0.05);
  put(g, lumpy(new THREE.SphereGeometry(0.08, 12, 8), 0.06, 6, 2), std(0xc89a5a, { rough: 0.9 }), 0.6, 0.06, 0.05, { s: [1.6, 0.8, 1] });
  bake(g);
  return g;
}

/** A pedal bin. */
export function pedalBin(): THREE.Group {
  const g = new THREE.Group();
  put(g, cyl(0.16, 0.15, 0.48, 18), std(0x3a5a3a, { rough: 0.4 }), 0, 0.24, 0);
  put(g, lathe([[0, 0.05], [0.12, 0.04], [0.165, 0], [0.165, -0.01]], 18), std(0x2e4a2e, { rough: 0.35 }), 0, 0.5, 0);
  put(g, rbox(0.1, 0.02, 0.06, 0.008, 1), plastic(0x222222), 0, 0.02, 0.17);
  bake(g);
  return g;
}

// ------------------------------------------------------------------ bathroom and hall

/** The enamel bath with a shower hose and a curtain rail. Long side along x. */
export function bathtub(): THREE.Group {
  const g = new THREE.Group();
  const white = enamel(0xf2f0ea);
  put(g, rbox(1.7, 0.56, 0.74, 0.06, 3), white, 0, 0.28, 0);
  put(g, rbox(1.56, 0.06, 0.6, 0.12, 3), std(0xdde4e8, { rough: 0.1 }), 0, 0.535, 0, { shadow: false });
  put(g, tube([new THREE.Vector3(0.7, 0.62, -0.32), new THREE.Vector3(0.75, 0.7, -0.34), new THREE.Vector3(0.6, 0.9, -0.36), new THREE.Vector3(0.4, 1.0, -0.36)], 0.01, 16, 6), chrome(), 0, 0, 0);
  put(g, rbox(0.2, 0.05, 0.06, 0.02, 1), chrome(), 0.72, 0.68, -0.35);
  put(g, cyl(0.012, 0.012, 1.7, 8), chrome(), 0, 1.95, 0.32, { rz: Math.PI / 2 });
  const curtain = new THREE.PlaneGeometry(0.6, 1.3, 12, 1);
  const p = curtain.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 40) * 0.025);
  curtain.computeVertexNormals();
  put(g, curtain, std(0x8ab8c8, { rough: 0.7, side: THREE.DoubleSide }), 0.52, 1.3, 0.32, { shadow: false });
  bake(g);
  return g;
}

/** The washbasin on its pedestal with a tap. Front +z. */
export function basin(): THREE.Group {
  const g = new THREE.Group();
  const white = enamel(0xf2f0ea);
  put(g, lathe([[0.06, 0], [0.07, 0], [0.05, 0.5], [0.08, 0.72], [0, 0.72]], 16), white, 0, 0, -0.08);
  put(g, rbox(0.5, 0.14, 0.4, 0.05, 3), white, 0, 0.78, 0);
  put(g, rbox(0.4, 0.04, 0.3, 0.06, 2), std(0xdde4e8, { rough: 0.1 }), 0, 0.84, 0.02, { shadow: false });
  put(g, tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0, 0.12, 0.08)], 0.01, 10, 6), chrome(), 0, 0.85, -0.16);
  put(g, lumpy(rbox(0.08, 0.03, 0.05, 0.012, 2), 0.1, 10, 1), std(0xe8d8a8, { rough: 0.4 }), 0.17, 0.865, -0.12);
  bake(g);
  return g;
}

/** The washing machine. Front +z. */
export function washer(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(0.6, 0.85, 0.55, 0.02, 2), enamel(0xf0f0ec), 0, 0.425, 0);
  put(g, new THREE.TorusGeometry(0.17, 0.03, 10, 28), std(0xb8bcc0, { rough: 0.3, metal: 0.8 }), 0, 0.42, 0.278);
  put(g, cyl(0.15, 0.15, 0.02, 28), std(0x2a3038, { rough: 0.05, metal: 0.3 }), 0, 0.42, 0.276, { rx: Math.PI / 2, shadow: false });
  put(g, rbox(0.56, 0.1, 0.02, 0.01, 1), plastic(0xe0e0dc), 0, 0.78, 0.28);
  put(g, cyl(0.025, 0.025, 0.02, 14), plastic(0xb8bcc0), 0.18, 0.78, 0.29, { rx: Math.PI / 2 });
  bake(g);
  return g;
}

/** Hooks with jackets, a cap, a shopping bag; the shoe rack under them. Against a wall, front +z. */
export function coatRack(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(1.1, 0.1, 0.03, 0.01, 1), wood(0x6a4a34), 0, 1.75, 0);
  for (let k = 0; k < 5; k++) put(g, rod(new THREE.Vector3(-0.44 + k * 0.22, 1.74, 0.01), new THREE.Vector3(-0.44 + k * 0.22, 1.78, 0.09), 0.008), steel(0xb8a070), 0, 0, 0);
  // a winter coat, a parka, a light jacket: soft lumps hanging from the hooks
  const coats: Array<[number, number, number, number]> = [[-0.44, 0x2a2c30, 1.0, 0.42], [-0.18, 0x4a5a3a, 0.85, 0.4], [0.1, 0x6a3a2a, 0.75, 0.36], [0.4, 0x1e2a40, 0.9, 0.38]];
  coats.forEach(([x, c, h, w], i) => put(g, lumpy(rbox(w, h, 0.16, 0.07, 3), 0.1, 6, i + 2), knit(c), x, 1.74 - h / 2 + 0.02, 0.1, { rz: (i - 1.5) * 0.04 }));
  put(g, lumpy(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.05, 8, 3), knit(0x8a2a2a), 0.4, 1.8, 0.08);
  // the shoe rack and the shoes
  put(g, rbox(0.9, 0.04, 0.3, 0.008, 1), wood(0x6a4a34), 0, 0.3, 0.16);
  put(g, rbox(0.9, 0.04, 0.3, 0.008, 1), wood(0x6a4a34), 0, 0.05, 0.16);
  for (const s of [-0.43, 0.43]) put(g, rbox(0.03, 0.32, 0.3, 0.006, 1), wood(0x6a4a34), s, 0.17, 0.16);
  const shoes: Array<[number, number, number]> = [[-0.3, 0.32, 0x2a1e18], [-0.1, 0.32, 0x1a1a1c], [0.15, 0.32, 0xe8e8e4], [-0.25, 0.07, 0x4a3424], [0.05, 0.07, 0x2a2a2c], [0.3, 0.07, 0x5a6a7a]];
  shoes.forEach(([x, y, c], i) => { for (const d of [-0.045, 0.045]) put(g, lumpy(rbox(0.08, 0.08, 0.26, 0.035, 2), 0.06, 10, i), std(c, { rough: 0.5 }), x + d, y + 0.06, 0.16, { ry: (i % 2) * 0.1 }); });
  bake(g);
  return g;
}

/** The go-bag: a packed backpack by the door, a power bank and documents in a file on top. */
export function goBag(): THREE.Group {
  const g = new THREE.Group();
  put(g, lumpy(rbox(0.36, 0.5, 0.24, 0.08, 3), 0.06, 6, 7), knit(0x3a4430), 0, 0.25, 0);
  put(g, lumpy(rbox(0.28, 0.18, 0.08, 0.04, 2), 0.06, 8, 8), knit(0x343e2a), 0, 0.18, 0.15);
  for (const s of [-0.1, 0.1]) put(g, tube([new THREE.Vector3(s, 0.45, -0.12), new THREE.Vector3(s, 0.35, -0.2), new THREE.Vector3(s, 0.08, -0.14)], 0.02, 10, 5), knit(0x2a3222), 0, 0, 0);
  put(g, rbox(0.24, 0.02, 0.32, 0.004, 1), plastic(0x2a5a9a), 0, 0.52, 0, { ry: 0.2 });
  bake(g);
  return g;
}

/** A door mat. */
export function doorMat(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(0.8, 0.015, 0.5, 0.005, 1), std(0x4a3a2a, { rough: 1 }), 0, 0.008, 0, { shadow: false });
  bake(g, false);
  return g;
}

/** The padded front door's material. */
export function paddedDoor(): THREE.MeshStandardMaterial {
  const q = quilted();
  q.map.repeat.set(1, 1);
  return std(0xffffff, { map: q.map, normal: q.normal, rough: 0.55, normalScale: 1.3, key: "padded" });
}

// ------------------------------------------------------------------ the balcony

/** Balcony storage: a shelf of preserves, boxes, a drying rack with laundry. */
export function balconyStuff(): THREE.Group {
  const g = new THREE.Group();
  const shelf = group(g, 1.0, 0, -0.55);
  for (const y of [0.05, 0.45, 0.85]) put(shelf, rbox(0.7, 0.025, 0.25, 0.004, 1), wood(0x7a5a3a), 0, y, 0);
  for (const s of [-0.34, 0.34]) put(shelf, rbox(0.025, 1.0, 0.25, 0.004, 1), wood(0x7a5a3a), s, 0.5, 0);
  const jarG = std(0xd8e4e0, { rough: 0.05, opacity: 0.45, transparent: true });
  const fills = [0xc83a2e, 0x8a3a5a, 0xd8a03a, 0x6a8a3a, 0xc85a2a];
  for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) {
    const x = -0.24 + k * 0.16, y = 0.07 + row * 0.4;
    put(shelf, cyl(0.055, 0.055, 0.15, 12), std(fills[(row * 4 + k) % 5], { rough: 0.6 }), x, y + 0.075, 0);
    put(shelf, cyl(0.06, 0.06, 0.19, 12), jarG, x, y + 0.095, 0);
    put(shelf, cyl(0.062, 0.062, 0.02, 12), std(0xc8b060, { rough: 0.3, metal: 0.8 }), x, y + 0.2, 0);
  }
  put(g, rbox(0.5, 0.35, 0.4, 0.01, 1), std(0xb08a5a, { rough: 0.9 }), 0.2, 0.175, -0.5, { ry: 0.1 });
  put(g, rbox(0.4, 0.3, 0.35, 0.01, 1), std(0xa07a4a, { rough: 0.9 }), 0.25, 0.5, -0.5, { ry: -0.15 });
  // the drying rack: a folding frame, laundry over the rails
  const rack = group(g, -0.7, 0, 0.05);
  const wire = steel(0xe8e8e4);
  for (const s of [-0.5, 0.5]) for (const d of [-1, 1]) put(rack, rod(new THREE.Vector3(s, 0, d * 0.35), new THREE.Vector3(s, 0.9, 0), 0.01), wire, 0, 0, 0);
  for (let k = 0; k < 6; k++) put(rack, cyl(0.005, 0.005, 1.0, 5), wire, 0, 0.9, -0.25 + k * 0.1, { rz: Math.PI / 2, shadow: false });
  [[0x3a4a6a, -0.25, 0.5], [0xe8e8e4, 0.15, 0.3], [0x8a2a2a, -0.05, 0.25]].forEach(([c, z, w], i) => {
    const cl = new THREE.PlaneGeometry(w, 0.5, 4, 4);
    const pp = cl.getAttribute("position") as THREE.BufferAttribute;
    for (let k = 0; k < pp.count; k++) pp.setZ(k, Math.sin(pp.getY(k) * 6 + i) * 0.02);
    cl.computeVertexNormals();
    put(rack, cl, std(c, { rough: 0.95, side: THREE.DoubleSide }), (i - 1) * 0.3, 0.66, z, { ry: Math.PI / 2, shadow: false });
  });
  bake(g);
  return g;
}

// ------------------------------------------------------------------ perks and clutter

/** A charging station (the blackout box): handle, display, vents, a cable. */
export function powerStation(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(0.4, 0.28, 0.26, 0.03, 2), std(0x2a2c30, { rough: 0.5 }), 0, 0.14, 0);
  put(g, rbox(0.4, 0.05, 0.27, 0.02, 2), std(0x8a8e94, { rough: 0.4, metal: 0.5 }), 0, 0.29, 0);
  put(g, rbox(0.3, 0.035, 0.05, 0.015, 1), std(0x1a1a1c, { rough: 0.5 }), 0, 0.33, 0);
  for (let k = 0; k < 6; k++) put(g, box(0.004, 0.12, 0.003), std(0x111112), -0.15 + k * 0.012, 0.14, 0.131, { shadow: false });
  put(g, tube([new THREE.Vector3(0.2, 0.06, 0), new THREE.Vector3(0.35, 0.01, 0.1), new THREE.Vector3(0.5, 0.01, 0.2)], 0.006, 10, 4), rubber(0x111111), 0, 0, 0, { shadow: false });
  bake(g);
  const screen = put(g, box(0.1, 0.05, 0.004), std(0x000000, { emissive: 0x6aff8a, emissiveIntensity: 2.4 }), 0.08, 0.18, 0.132, { shadow: false });
  screen.userData.live = true;
  return g;
}

/** Six-litre water bottles, two rows. */
export function waterBottles(): THREE.Group {
  const g = new THREE.Group();
  const bottle = lathe([[0, 0], [0.11, 0], [0.12, 0.02], [0.12, 0.3], [0.09, 0.36], [0.03, 0.4], [0.03, 0.43], [0, 0.43]], 18);
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * 0.27, z = Math.floor(i / 2) * 0.27;
    put(g, bottle, std(0x9ac8e8, { rough: 0.08, opacity: 0.55, transparent: true }), x, 0, z);
    put(g, cyl(0.032, 0.032, 0.03, 10), plastic(0x2a6ab8), x, 0.44, z);
    put(g, new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI), plastic(0x2a6ab8), x + 0.05, 0.4, z, { rz: -Math.PI / 2 });
  }
  bake(g);
  return g;
}

/** An acoustic guitar leaning on the wall. */
export function guitar(): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    const y = Math.cos(t);
    const lower = y < 0 ? 1 : 0.8;
    const waist = 1 - 0.18 * Math.exp(-((y - 0.15) ** 2) / 0.05);
    pts.push(new THREE.Vector2(Math.sin(t) * 0.19 * lower * waist, 0.25 + y * 0.24));
  }
  shape.setFromPoints(pts);
  const bodyG = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 4 });
  bodyG.translate(0, 0, -0.04);
  put(g, bodyG, std(0xc8823a, { rough: 0.25, map: surfaceMap("wood"), key: "guitar" }), 0, 0, 0);
  put(g, cyl(0.045, 0.045, 0.006, 20), std(0x111111), 0, 0.33, 0.052, { rx: Math.PI / 2, shadow: false });
  put(g, rbox(0.05, 0.5, 0.03, 0.01, 1), wood(0x4a2a1a), 0, 0.73, 0.01);
  put(g, rbox(0.08, 0.16, 0.025, 0.01, 1), wood(0x3a2014), 0, 1.05, 0.0);
  put(g, rbox(0.1, 0.015, 0.02, 0.005, 1), wood(0x2a1a10), 0, 0.14, 0.055);
  bake(g);
  return g;
}

/** A game controller. */
export function gamepad(): THREE.Group {
  const g = new THREE.Group();
  put(g, lumpy(rbox(0.15, 0.035, 0.09, 0.03, 3), 0.03, 20, 1), plastic(0x1e1f22), 0, 0.02, 0);
  for (const s of [-0.03, 0.03]) put(g, cyl(0.011, 0.011, 0.012, 10), plastic(0x2a2a2e), s, 0.04, 0.01);
  bake(g);
  return g;
}

/** Beer bottles, empty and not. */
export function beerBottles(n = 5): THREE.Group {
  const g = new THREE.Group();
  const b = lathe([[0, 0], [0.032, 0], [0.033, 0.15], [0.02, 0.19], [0.013, 0.23], [0.013, 0.25], [0, 0.25]], 14);
  for (let i = 0; i < n; i++) {
    const down = i === n - 1;
    put(g, b, std(0x5a3010, { rough: 0.1, opacity: 0.85, transparent: true }), (i % 3) * 0.08, down ? 0.032 : 0, Math.floor(i / 3) * 0.09, down ? { rz: Math.PI / 2 } : {});
  }
  bake(g);
  return g;
}

/** A garbage bag, knotted. */
export function trashBag(seed: number, color: number): THREE.Group {
  const g = new THREE.Group();
  put(g, lumpy(new THREE.SphereGeometry(0.24, 14, 10), 0.18, 6, seed), std(color, { rough: 0.22 }), 0, 0.22, 0, { s: [1, 1.15, 0.95] });
  put(g, lumpy(new THREE.ConeGeometry(0.06, 0.14, 8), 0.2, 12, seed), std(color, { rough: 0.22 }), 0, 0.5, 0);
  bake(g);
  return g;
}

/** A pizza box. */
export function pizzaBox(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(0.4, 0.045, 0.4, 0.004, 1), std(0xc8a06a, { rough: 0.95 }), 0, 0.023, 0);
  bake(g);
  return g;
}

/** A plastic bottle on its side. */
export function plasticBottle(color = 0x3a7a5a): THREE.Group {
  const g = new THREE.Group();
  put(g, lathe([[0, 0], [0.04, 0], [0.042, 0.22], [0.02, 0.27], [0.015, 0.3], [0, 0.3]], 12), std(color, { rough: 0.1, opacity: 0.7, transparent: true }), 0, 0.042, 0, { rz: Math.PI / 2 });
  bake(g);
  return g;
}

