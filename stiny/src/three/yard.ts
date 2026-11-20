import * as THREE from "three";
import { bake, box, canvas, cyl, fbm, group, lumpy, normalFrom, profile, put, ramp, rbox, rng, rod, rubber, std, steel, tex, type Rand } from "./kit.ts";
import { courtyardCar } from "./cars.ts";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { lightPoolMaterial } from "./post.ts";

/**
 * The courtyard five floors down: a Kyiv «двір» between nine-storey panel
 * blocks. Worn grass with desire paths, patched asphalt, whitewashed curbs
 * and tree trunks, cars parked on the lawn, a Soviet playground with painted
 * tyres, the carpet-beating frame, metal bins, shell garages, a washing line.
 * Everything static is baked into a few meshes per material.
 */

export interface Courtyard {
  root: THREE.Group;
  groundMat: THREE.MeshStandardMaterial;
  facadeMat: THREE.MeshStandardMaterial;
  facade: { map: THREE.Texture; glow: THREE.Texture };
  /** Lit windows in every block around the yard. */
  setNight(on: boolean): void;
  /** Bulbs and light pools: shown at night when there is power. */
  lamps: THREE.Object3D[];
  /** Trees, ground and snow for a season (0 winter, 1 spring, 2 summer, 3 autumn); returns the ground tint. */
  setSeason(s: number): number;
}

// ------------------------------------------------------------------ textures

function grassTextures(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const N = 512;
  const r = rng(11);
  const [cv, g] = canvas(N, N);
  const base = fbm(N, N, 3, 4, 5);
  ramp(g, N, N, base, [[0, [62, 84, 38]], [0.45, [88, 112, 52]], [0.7, [112, 128, 62]], [1, [134, 132, 76]]], 0.08, r);
  const [hc, hg] = canvas(N, N);
  hg.fillStyle = "#666"; hg.fillRect(0, 0, N, N);
  // soil showing through, then thousands of short blades
  for (let i = 0; i < 260; i++) {
    const x = r() * N, y = r() * N, s = 2 + r() * 7;
    g.fillStyle = `rgba(${96 + r() * 30},${78 + r() * 20},${52 + r() * 14},${0.25 + r() * 0.35})`;
    g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 9000; i++) {
    const x = r() * N, y = r() * N, l = 3 + r() * 7, a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    const k = r();
    const col = k < 0.15 ? [150, 150, 80] : k < 0.55 ? [70 + r() * 30, 104 + r() * 30, 44 + r() * 16] : [96 + r() * 30, 126 + r() * 26, 58 + r() * 14];
    for (const [cc, dx, dy] of [[g, 0, 0], [g, N, 0], [g, 0, N], [g, -N, 0], [g, 0, -N]] as const) {
      if (dx || dy) { if (x + dx < -10 || x + dx > N + 10 || y + dy < -10 || y + dy > N + 10) continue; }
      cc.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},0.9)`; cc.lineWidth = 1 + r() * 0.8;
      cc.beginPath(); cc.moveTo(x + dx, y + dy); cc.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); cc.stroke();
    }
    hg.strokeStyle = `rgba(255,255,255,${0.3 + r() * 0.4})`; hg.lineWidth = 1.2;
    hg.beginPath(); hg.moveTo(x, y); hg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); hg.stroke();
  }
  return { map: tex(cv), normal: normalFrom(hc, 1.6) };
}

function asphaltTextures(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const N = 512;
  const r = rng(29);
  const [cv, g] = canvas(N, N);
  ramp(g, N, N, fbm(N, N, 7, 6, 5), [[0, [70, 72, 74]], [0.5, [92, 94, 96]], [1, [112, 112, 110]]], 0.12, r);
  const [hc, hg] = canvas(N, N);
  hg.fillStyle = "#888"; hg.fillRect(0, 0, N, N);
  // patches from twenty winters of repairs: darker, with a raised edge
  for (let i = 0; i < 2; i++) {
    const w = 70 + r() * 120, h = 50 + r() * 90, x = r() * (N - w), y = r() * (N - h);
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate((r() - 0.5) * 0.2);
    g.fillStyle = `rgba(${58 + r() * 10},${60 + r() * 10},${64 + r() * 8},0.45)`; g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = "rgba(40,40,40,.35)"; g.lineWidth = 1.5; g.strokeRect(-w / 2, -h / 2, w, h);
    g.restore();
    hg.strokeStyle = "#aaa"; hg.lineWidth = 2; hg.strokeRect(x, y, w, h);
  }
  // cracks
  for (let i = 0; i < 14; i++) {
    let x = r() * N, y = r() * N, a = r() * Math.PI * 2;
    g.strokeStyle = "rgba(30,30,32,.75)"; hg.strokeStyle = "#333";
    g.lineWidth = hg.lineWidth = 1 + r() * 1.5;
    g.beginPath(); hg.beginPath(); g.moveTo(x, y); hg.moveTo(x, y);
    for (let k = 0; k < 12; k++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); hg.lineTo(x, y); }
    g.stroke(); hg.stroke();
  }
  // gravel in the surface
  for (let i = 0; i < 6000; i++) {
    const x = r() * N, y = r() * N, v = r();
    g.fillStyle = v < 0.5 ? `rgba(140,138,132,${0.4 + r() * 0.4})` : `rgba(40,40,42,${0.3 + r() * 0.4})`;
    g.fillRect(x, y, 1 + r() * 1.5, 1 + r() * 1.5);
    hg.fillStyle = v < 0.5 ? "#aaa" : "#666"; hg.fillRect(x, y, 1.5, 1.5);
  }
  // oil stains where cars stand
  for (let i = 0; i < 3; i++) { const x = r() * N, y = r() * N; const gr = g.createRadialGradient(x, y, 0, x, y, 30); gr.addColorStop(0, "rgba(20,20,24,.5)"); gr.addColorStop(1, "rgba(20,20,24,0)"); g.fillStyle = gr; g.fillRect(x - 30, y - 30, 60, 60); }
  return { map: tex(cv), normal: normalFrom(hc, 1.2) };
}

function snowTextures(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const N = 256;
  const [cv, g] = canvas(N, N);
  const f = fbm(N, N, 41, 4, 5);
  ramp(g, N, N, f, [[0, [206, 214, 224]], [0.6, [236, 240, 246]], [1, [250, 252, 255]]], 0.04, rng(3));
  const [hc, hg] = canvas(N, N);
  ramp(hg, N, N, f, [[0, [80, 80, 80]], [1, [200, 200, 200]]]);
  // footprints along the paths people take anyway
  const r = rng(5);
  for (let i = 0; i < 40; i++) { const x = r() * N, y = r() * N; g.fillStyle = "rgba(170,180,196,.5)"; g.beginPath(); g.ellipse(x, y, 3, 5, 0.3, 0, Math.PI * 2); g.fill(); hg.fillStyle = "#333"; hg.beginPath(); hg.ellipse(x, y, 3, 5, 0.3, 0, Math.PI * 2); hg.fill(); }
  return { map: tex(cv), normal: normalFrom(hc, 1.2) };
}

/** Bare earth with soft edges, for worn patches and the paths across the lawn. */
function dirtTexture(): THREE.CanvasTexture {
  const N = 256;
  const [cv, g] = canvas(N, N);
  const f = fbm(N, N, 17, 3, 4);
  const img = g.createImageData(N, N);
  const r = rng(9);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const dx = (x / N - 0.5) * 2, dy = (y / N - 0.5) * 2;
    const edge = 1 - Math.min(1, Math.hypot(dx * 1.0, dy * 1.0));
    const a = Math.max(0, Math.min(1, (edge * 1.6 + (f[i] - 0.5) * 1.2 - 0.15) * 1.8));
    const v = 0.85 + (r() - 0.5) * 0.2;
    img.data[i * 4] = 118 * v; img.data[i * 4 + 1] = 98 * v; img.data[i * 4 + 2] = 72 * v; img.data[i * 4 + 3] = a * 235;
  }
  g.putImageData(img, 0, 0);
  return tex(cv, { wrap: false });
}

function barkTexture(): THREE.CanvasTexture {
  const W = 128, H = 256;
  const r = rng(23);
  const [cv, g] = canvas(W, H);
  g.fillStyle = "#4e4236"; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const x = r() * W, w = 1 + r() * 4;
    g.fillStyle = r() < 0.5 ? `rgba(30,24,20,${0.4 + r() * 0.4})` : `rgba(120,108,92,${0.2 + r() * 0.3})`;
    g.fillRect(x, r() * H, w, 20 + r() * 80);
  }
  return tex(cv);
}

function leafTextures(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const N = 256;
  const r = rng(31);
  const [cv, g] = canvas(N, N);
  const [hc, hg] = canvas(N, N);
  g.fillStyle = "#6a6a6a"; g.fillRect(0, 0, N, N);
  hg.fillStyle = "#000"; hg.fillRect(0, 0, N, N);
  for (let i = 0; i < 5200; i++) {
    const x = r() * N, y = r() * N, s = 2 + r() * 3, a = r() * Math.PI;
    const v = 170 + r() * 85;
    for (const [dx, dy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) {
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath(); g.ellipse(x + dx, y + dy, s, s * 0.5, a, 0, Math.PI * 2); g.fill();
      hg.fillStyle = `rgba(255,255,255,${0.5 + r() * 0.5})`;
      hg.beginPath(); hg.ellipse(x + dx, y + dy, s, s * 0.5, a, 0, Math.PI * 2); hg.fill();
    }
  }
  return { map: tex(cv, { repeat: [3, 2] }), normal: normalFrom(hc, 2.2, [3, 2]) };
}

/**
 * A nine-storey panel block, 8 bays wide: panel joints, mismatched windows
 * (new white plastic, old painted wood), balcony stacks glazed by each owner
 * in their own way, air conditioners, curtains, streaks under the sills.
 * Returns the day map and a glow map of the windows lit at night.
 */
function panelFacade(seed: number, tint: [number, number, number]): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const W = 1024, H = 1152, BAYS = 8, FLOORS = 9;
  const pxM = W / (BAYS * 3);
  const plinth = 1.4 * pxM, parapet = 0.8 * pxM;
  const fh = (H - plinth - parapet) / FLOORS, bw = W / BAYS;
  const r = rng(seed);
  const [cv, g] = canvas(W, H);
  const [gc, gg] = canvas(W / 2, H / 2);
  gg.fillStyle = "#000"; gg.fillRect(0, 0, W / 2, H / 2);
  ramp(g, W, H, fbm(W, H, seed, 8, 4), [[0, [tint[0] - 26, tint[1] - 26, tint[2] - 24]], [0.5, tint], [1, [tint[0] + 14, tint[1] + 14, tint[2] + 12]]], 0.05, r);
  // the plinth and the parapet
  g.fillStyle = "rgba(90,86,80,.85)"; g.fillRect(0, H - plinth, W, plinth);
  g.fillStyle = "rgba(60,58,56,.5)"; g.fillRect(0, 0, W, parapet * 0.5);
  const balconyBays = new Set([1, 4, 6]);
  const sidings = ["#c8bca0", "#8a9aa8", "#b89a7a", "#d8d4c8", "#7a8a6a", "#a8a8a0"];
  const curtains = ["#e8e0c8", "#d8c8a0", "#c8a878", "#9aa8b8", "#b87a6a", "#e8e8e8", "#6a7a8a", "#d8b8b8"];
  for (let f = 0; f < FLOORS; f++) {
    const y0 = parapet + f * fh;
    // horizontal panel joint
    g.fillStyle = "rgba(60,58,54,.55)"; g.fillRect(0, y0 + fh - 3, W, 3);
    g.fillStyle = "rgba(230,226,216,.35)"; g.fillRect(0, y0 + fh - 5, W, 2);
    for (let b = 0; b < BAYS; b++) {
      const x0 = b * bw;
      if (f === 0) { g.fillStyle = "rgba(60,58,54,.5)"; g.fillRect(x0, 0, 3, H - plinth); g.fillStyle = "rgba(230,226,216,.3)"; g.fillRect(x0 + 3, 0, 2, H - plinth); }
      const ground = f === FLOORS - 1;
      const lit = r() < 0.42;
      const warm = r() < 0.85;
      const cur = curtains[Math.floor(r() * curtains.length)];
      if (balconyBays.has(b) && !ground) {
        // a balcony: slab line, then each owner's glazing
        const bx = x0 + bw * 0.08, bwid = bw * 0.84, by = y0 + fh * 0.12, bh = fh * 0.8;
        const style = r();
        if (style < 0.22) {
          // open: a rail, laundry, a bike
          g.fillStyle = "rgba(40,40,44,.75)"; g.fillRect(bx, by + bh * 0.1, bwid, bh * 0.46);
          g.fillStyle = "rgba(70,72,76,.9)"; for (let k = 0; k < 9; k++) g.fillRect(bx + (k / 8) * bwid - 1, by + bh * 0.48, 2, bh * 0.46);
          g.fillStyle = "#6a6c70"; g.fillRect(bx, by + bh * 0.46, bwid, 3);
          for (let k = 0; k < 4; k++) { g.fillStyle = ["#e8e8e8", "#c84a3a", "#4a6a9a", "#e8d8a0"][k]; g.fillRect(bx + 6 + k * bwid * 0.22, by + bh * 0.16, bwid * 0.14, bh * 0.22); }
        } else {
          const siding = sidings[Math.floor(r() * sidings.length)];
          g.fillStyle = siding; g.fillRect(bx, by + bh * 0.5, bwid, bh * 0.5);
          g.fillStyle = "rgba(0,0,0,.18)"; for (let k = 0; k < 6; k++) g.fillRect(bx, by + bh * 0.5 + (k / 6) * bh * 0.5, bwid, 1);
          const frame = style < 0.6 ? "#f0f0ec" : style < 0.8 ? "#a8acb0" : "#7a5a3a";
          g.fillStyle = frame; g.fillRect(bx, by, bwid, bh * 0.52);
          const panes = 3 + Math.floor(r() * 2);
          for (let k = 0; k < panes; k++) {
            const px = bx + 3 + (k / panes) * (bwid - 6), pw = (bwid - 6) / panes - 3;
            g.fillStyle = "#3e4852"; g.fillRect(px, by + 4, pw, bh * 0.44);
            g.fillStyle = "rgba(200,220,240,.18)"; g.fillRect(px, by + 4, pw * 0.4, bh * 0.44);
            if (r() < 0.5) { g.fillStyle = cur; g.globalAlpha = 0.7; g.fillRect(px, by + 4, pw, bh * 0.44); g.globalAlpha = 1; }
            if (lit && warm) { gg.fillStyle = `rgba(255,${190 + r() * 30},${110 + r() * 30},.55)`; gg.fillRect(px / 2, (by + 4) / 2, pw / 2, bh * 0.22); }
          }
        }
        // the slab under it, rust from the rail
        g.fillStyle = "rgba(80,78,72,.9)"; g.fillRect(bx - 4, by + bh, bwid + 8, 5);
        g.fillStyle = "rgba(120,80,50,.18)"; g.fillRect(bx + 4, by + bh + 5, 6, fh * 0.3);
        continue;
      }
      // a window
      const ww = bw * (ground ? 0.5 : 0.56), wh = fh * 0.56, wx = x0 + (bw - ww) / 2, wy = y0 + fh * 0.18;
      const old = r() < 0.28;
      g.fillStyle = old ? "#d8d0c0" : "#f2f2ee"; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      g.fillStyle = "#38424c"; g.fillRect(wx, wy, ww, wh);
      g.fillStyle = "rgba(190,210,230,.2)"; g.fillRect(wx, wy, ww * 0.45, wh);
      const c = r();
      if (c < 0.7) { g.fillStyle = cur; g.globalAlpha = 0.55 + r() * 0.3; g.fillRect(wx, wy, ww, wh); g.globalAlpha = 1; }
      if (c > 0.85) { g.fillStyle = "rgba(230,230,224,.8)"; for (let k = 0; k < 10; k++) g.fillRect(wx, wy + (k / 10) * wh, ww, 2); }
      g.fillStyle = old ? "#b8ac98" : "#e8e8e4";
      g.fillRect(wx + ww * (old ? 0.5 : 0.62) - 2, wy, 4, wh);
      if (old) g.fillRect(wx, wy + wh * 0.3, ww, 3);
      g.fillStyle = "rgba(210,210,206,.9)"; g.fillRect(wx - 6, wy + wh + 3, ww + 12, 4);
      g.fillStyle = "rgba(50,46,40,.12)"; g.fillRect(wx + 2, wy + wh + 7, ww - 4, fh * 0.22);
      if (ground) { g.strokeStyle = "rgba(40,40,44,.85)"; g.lineWidth = 2; for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(wx + (k / 6) * ww, wy); g.lineTo(wx + (k / 6) * ww, wy + wh); g.stroke(); } g.beginPath(); g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2); g.stroke(); }
      if (!ground && r() < 0.24) {
        const ax = r() < 0.5 ? wx - bw * 0.2 : wx + ww + 4;
        g.fillStyle = "#e8e8e4"; g.fillRect(ax, wy + wh * 0.4, bw * 0.17, fh * 0.2);
        g.fillStyle = "#9a9a98"; g.beginPath(); g.arc(ax + bw * 0.085, wy + wh * 0.4 + fh * 0.1, fh * 0.07, 0, Math.PI * 2); g.fill();
        g.fillStyle = "rgba(60,60,60,.15)"; g.fillRect(ax + bw * 0.06, wy + wh * 0.4 + fh * 0.2, 3, fh * 0.4);
      }
      if (lit) {
        const col = warm ? `rgba(255,${185 + r() * 40},${100 + r() * 50},.9)` : "rgba(150,180,255,.8)";
        gg.fillStyle = col; gg.fillRect(wx / 2, wy / 2, ww / 2, wh / 2);
        if (c < 0.7) { gg.fillStyle = "rgba(0,0,0,.35)"; gg.fillRect(wx / 2, wy / 2, ww / 4, wh / 2); }
      }
    }
  }
  // basement vents in the plinth
  for (let b = 0; b < BAYS; b++) { g.fillStyle = "#2a2a2c"; g.fillRect(b * bw + bw * 0.4, H - plinth * 0.6, bw * 0.2, plinth * 0.25); }
  // streaks of years of rain
  for (let i = 0; i < 40; i++) { const x = r() * W, y = r() * H * 0.9; const gr = g.createLinearGradient(0, y, 0, y + 120); gr.addColorStop(0, "rgba(60,56,50,.12)"); gr.addColorStop(1, "rgba(60,56,50,0)"); g.fillStyle = gr; g.fillRect(x, y, 3 + r() * 6, 120); }
  return { map: tex(cv), glow: tex(gc) };
}

// ------------------------------------------------------------------ the parts

/** A plane on the ground with UVs in metres / tile, so one material tiles evenly everywhere. */
function ground(parent: THREE.Object3D, w: number, d: number, material: THREE.Material, x: number, y: number, z: number, tile: number, ry = 0): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w + x) / tile, (uv.getY(i) * d - z) / tile);
  const m = put(parent, g, material, x, y, z, { rx: -Math.PI / 2, shadow: false });
  m.rotation.order = "YXZ";
  m.rotation.y = ry;
  return m;
}

/** Curb stones along a line, whitewashed (some years ago). */
function curbs(parent: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, y: number, r: Rand): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len));
  const ang = Math.atan2(z1 - z0, x1 - x0);
  const white = std(0xe8e6de, { rough: 0.95 }), grey = std(0xa8a69e, { rough: 0.95 });
  const g = box(len / n - 0.03, 0.16, 0.13);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    put(parent, g, r() < 0.78 ? white : grey, x0 + (x1 - x0) * t, y + 0.06, z0 + (z1 - z0) * t, { ry: -ang, shadow: false });
  }
}

function tree(parent: THREE.Object3D, seed: number, season: number): void {
  const r = rng(seed * 77 + 1);
  const bark = std(0xffffff, { map: barkTex(), rough: 0.95 });
  const lime = std(0xeeeee6, { rough: 1 });
  const H = 2.4 + r() * 0.9;
  const tips: THREE.Vector3[] = [];
  const limb = (a: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const mid = a.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3((r() - 0.5) * 0.15, 0, (r() - 0.5) * 0.15));
    const end = a.clone().addScaledVector(dir, len);
    put(parent, rod2(a, mid, rad, rad * 0.86), bark, 0, 0, 0, { shadow: false });
    put(parent, rod2(mid, end, rad * 0.86, rad * 0.7), bark, 0, 0, 0, { shadow: false });
    if (depth === 0) { tips.push(end); return; }
    const kids = 2 + (r() < 0.5 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const az = (k / kids) * Math.PI * 2 + r() * 1.5;
      const tilt = 0.45 + r() * 0.45;
      const d = new THREE.Vector3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt)).lerp(dir, 0.35).normalize();
      limb(end, d, len * (0.62 + r() * 0.15), rad * 0.62, depth - 1);
    }
  };
  limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3((r() - 0.5) * 0.12, 1, (r() - 0.5) * 0.12).normalize(), H, 0.17 + r() * 0.05, 3);
  // whitewashed for the spring cleaning, as every courtyard tree is
  put(parent, cyl(0.2, 0.22, 1.05, 14, true), lime, 0, 0.52, 0, { shadow: false });
  if (season === 0) return;
  const leaf = leafTex();
  const tones = season === 1 ? [0x8cbc58, 0x7aac4a, 0x9cc864] : season === 2 ? [0x4f7f34, 0x5a8a3a, 0x44702e] : [0xd8962a, 0xc2642a, 0xb8a43a, 0xe0b040];
  // many small clumps of leaves round every twig end, a few inside the crown: it reads as foliage, not as balls
  const mats = tones.map((c) => std(c, { map: leaf.map, normal: leaf.normal, rough: 0.9, normalScale: 1.2 }));
  const shade = tones.map((c) => std(new THREE.Color(c).multiplyScalar(0.72).getHex(), { map: leaf.map, normal: leaf.normal, rough: 0.95, normalScale: 1.2 }));
  const centre = tips.reduce((a, t) => a.add(t), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, tips.length));
  tips.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      const s = 0.36 + r() * 0.3;
      const o = new THREE.Vector3((r() - 0.5) * 0.7, (r() - 0.3) * 0.5, (r() - 0.5) * 0.7);
      const p = t.clone().add(o);
      const low = p.y < centre.y - 0.2;
      put(parent, lumpy(soft(s), 0.22, 5, seed * 7 + i * 3 + k), (low ? shade : mats)[Math.floor(r() * tones.length)], p.x, p.y + 0.1, p.z, { s: [1, 0.82, 1], ry: r() * 3 });
    }
  });
  for (let k = 0; k < 5; k++) {
    const p = centre.clone().add(new THREE.Vector3((r() - 0.5) * 1.2, (r() - 0.6) * 0.8, (r() - 0.5) * 1.2));
    put(parent, lumpy(soft(0.6 + r() * 0.2), 0.2, 4, seed * 13 + k), shade[Math.floor(r() * tones.length)], p.x, p.y, p.z, { s: [1, 0.8, 1] });
  }
}

/** A leaf clump: an icosphere with shared vertices, so the lumps shade smoothly instead of in facets. */
function soft(r: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 1);
  g.deleteAttribute("uv");
  const m = mergeVertices(g);
  // spherical UVs back on, for the leaf texture
  const p = m.getAttribute("position") as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); uv[i * 2] = 0.5 + Math.atan2(z, x) / (Math.PI * 2); uv[i * 2 + 1] = 0.5 + Math.asin(Math.max(-1, Math.min(1, y / r))) / Math.PI; }
  m.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return m;
}

/** A tapered rod. */
function rod2(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len * 1.04, 7, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/** A blue spruce in tiers of drooping branches; snow on each tier in winter. */
function spruce(parent: THREE.Object3D, seed: number, snow: boolean): void {
  const r = rng(seed * 53 + 9);
  const H = 5 + r() * 2;
  put(parent, cyl(0.1, 0.16, H * 0.5, 8), std(0x4a3a2c, { rough: 1 }), 0, H * 0.25, 0, { shadow: false });
  const needles = std(0x2e4c3c, { rough: 0.9, map: leafTex().map });
  const white = std(0xf0f4f8, { rough: 0.9 });
  const tiers = 7;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const rad = (1.5 - t * 1.25) * (0.9 + r() * 0.2);
    const y = H * (0.18 + t * 0.72);
    const g = new THREE.ConeGeometry(rad, H * 0.24, 14, 2, true);
    lumpy(g, 0.12, 6, seed + i);
    put(parent, g, needles, 0, y, 0, { ry: r() * 3, shadow: false });
    if (snow) put(parent, lumpy(new THREE.ConeGeometry(rad * 0.82, H * 0.12, 12, 1, true), 0.15, 6, seed + i + 50), white, 0, y + H * 0.07, 0, { shadow: false });
  }
}

let _bark: THREE.CanvasTexture | null = null;
const barkTex = () => (_bark ??= barkTexture());
let _leaf: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;
const leafTex = () => (_leaf ??= leafTextures());

/** A Soviet bench: two cast legs, wooden slats for the seat and the back. */
function bench(parent: THREE.Object3D, x: number, y: number, z: number, ry: number): void {
  const g = group(parent, x, y, z, ry);
  const wood = std(0x7a5a3a, { rough: 0.85 }), iron = std(0x2a2c2e, { rough: 0.6, metal: 0.5 });
  for (const s of [-0.75, 0.75]) {
    put(g, profile([[0.25, 0], [0.3, 0], [0.3, 0.42], [0.22, 0.46], [-0.18, 0.46], [-0.3, 0.92], [-0.36, 0.9], [-0.24, 0.42], [-0.25, 0]], 0.06, 0.01, 2), iron, s, 0, 0, { ry: Math.PI / 2 });
  }
  for (let k = 0; k < 4; k++) put(g, rbox(1.8, 0.035, 0.1, 0.01, 1), wood, 0, 0.47, -0.17 + k * 0.12);
  for (let k = 0; k < 3; k++) put(g, rbox(1.8, 0.09, 0.03, 0.01, 1), wood, 0, 0.6 + k * 0.12, -0.24 - k * 0.025, { rx: 0.25 });
}

/** Euro bins on a concrete pad behind a low corrugated fence. */
function bins(parent: THREE.Object3D, x: number, y: number, z: number): void {
  const g = group(parent, x, y, z);
  put(g, rbox(4.4, 0.12, 2.0, 0.02, 1), std(0x9a9890, { rough: 1 }), 0, 0.06, 0, { shadow: false });
  const fence = std(0x5a7a6a, { rough: 0.6, metal: 0.4 });
  for (const [fx, fz, w, d] of [[0, -0.95, 4.4, 0.04], [-2.18, 0, 0.04, 1.9], [2.18, 0, 0.04, 1.9]] as const) {
    put(g, box(w, 1.25, d), fence, fx, 0.75, fz);
    for (let k = 0; k < Math.max(w, d) * 8; k++) put(g, box(w > d ? 0.03 : 0.05, 1.25, w > d ? 0.05 : 0.03), std(0x4a6a5a, { rough: 0.6, metal: 0.4 }), w > d ? fx - w / 2 + k / 8 : fx + 0.02, 0.75, w > d ? fz + 0.02 : fz - d / 2 + k / 8, { shadow: false });
  }
  [0x2f5a3a, 0x2f5a3a, 0x3a5a8a, 0x4a4c4e].forEach((c, i) => {
    const b = group(g, -1.55 + i * 1.03, 0.12, 0.05, (i - 1.5) * 0.06);
    const body = std(c, { rough: 0.5, metal: 0.1 });
    put(b, rbox(0.9, 1.0, 0.95, 0.05, 2), body, 0, 0.62, 0);
    put(b, rbox(0.96, 0.1, 1.02, 0.04, 2), std(c - 0x0a0a0a, { rough: 0.45 }), 0, 1.15, 0, { rx: i === 1 ? -0.4 : 0 });
    for (const [wx, wz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) put(b, cyl(0.07, 0.07, 0.05, 10), rubber(), wx, 0.07, wz, { rz: Math.PI / 2 });
  });
  // what did not fit inside
  const bag = std(0x1a1a1c, { rough: 0.25 });
  for (let i = 0; i < 4; i++) put(g, lumpy(new THREE.IcosahedronGeometry(0.24, 2), 0.2, 6, i), bag, -1.6 + i * 0.5 + (i % 2) * 0.2, 0.32, 0.75 + (i % 2) * 0.15, { s: [1, 1.2, 1] });
  put(g, rbox(0.6, 0.4, 0.5, 0.02, 1), std(0xb08a5a, { rough: 0.9 }), 1.7, 0.32, 0.8, { ry: 0.4 });
}

/** The street lamp: a concrete post, an arm, a cobra head. Returns the bulb. */
function lamp(parent: THREE.Object3D, x: number, y: number, z: number, ry: number): THREE.Mesh {
  const g = group(parent, x, y, z, ry);
  const concrete = std(0x9a9890, { rough: 0.95 });
  put(g, cyl(0.09, 0.15, 6.2, 8), concrete, 0, 3.1, 0);
  put(g, rod(new THREE.Vector3(0, 5.9, 0), new THREE.Vector3(0, 6.3, 1.1), 0.035, 8), steel(0x5a5c5e), 0, 0, 0);
  put(g, rbox(0.3, 0.12, 0.6, 0.05, 2), std(0x6a6c6e, { rough: 0.5, metal: 0.5 }), 0, 6.3, 1.3);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
  bulbMat.color.multiplyScalar(4);
  const bulb = put(g, box(0.22, 0.03, 0.42), bulbMat, 0, 6.23, 1.3, { name: "bulb", shadow: false });
  return bulb;
}

/** The Soviet playground: swings, the climbing globe, a slide, a sandbox ringed with painted tyres. */
function playground(parent: THREE.Object3D, x: number, y: number, z: number): void {
  const g = group(parent, x, y, z);
  const red = std(0xb8382e, { rough: 0.55, metal: 0.3 }), yellow = std(0xd8a62a, { rough: 0.55, metal: 0.3 }), blue = std(0x2e5a9a, { rough: 0.55, metal: 0.3 });
  // swings: A-frames, a bar, two seats on chains
  const sw = group(g, 2.6, 0, -2.6);
  for (const s of [-1.3, 1.3]) for (const d of [-1, 1]) put(sw, rod(new THREE.Vector3(s, 0, d * 0.8), new THREE.Vector3(s, 2.4, 0), 0.045), red, 0, 0, 0);
  put(sw, rod(new THREE.Vector3(-1.4, 2.4, 0), new THREE.Vector3(1.4, 2.4, 0), 0.05), red, 0, 0, 0);
  for (const s of [-0.55, 0.55]) {
    for (const d of [-0.18, 0.18]) put(sw, rod(new THREE.Vector3(s + d, 2.38, 0), new THREE.Vector3(s + d, 0.55, 0.02), 0.008, 4), steel(), 0, 0, 0, { shadow: false });
    put(sw, rbox(0.46, 0.04, 0.22, 0.01, 1), std(0x8a5a32, { rough: 0.8 }), s, 0.54, 0.02);
  }
  // the climbing globe: meridians and parallels
  const gl = group(g, -2.4, 0, -2.2);
  const R = 1.25;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) { const t = (i / 10) * Math.PI; pts.push(new THREE.Vector3(Math.cos(t) * R * Math.cos(a), Math.sin(t) * R, Math.cos(t) * R * Math.sin(a))); }
    put(gl, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.025, 6), [red, yellow, blue][k % 3], 0, 0, 0, { shadow: false });
  }
  for (const h of [0.4, 0.8, 1.1]) { const rr = Math.sqrt(R * R - h * h); put(gl, new THREE.TorusGeometry(rr, 0.025, 6, 32), [yellow, blue, red][Math.round(h * 3) % 3], 0, h, 0, { rx: Math.PI / 2, shadow: false }); }
  // the slide: ladder, platform, a polished steel chute
  const sl = group(g, 2.4, 0, 1.6, -0.3);
  for (const s of [-0.28, 0.28]) put(sl, rod(new THREE.Vector3(s, 0, -1.0), new THREE.Vector3(s, 1.5, -0.6), 0.03), blue, 0, 0, 0);
  for (let k = 1; k < 6; k++) put(sl, rod(new THREE.Vector3(-0.28, k * 0.25, -1.0 + k * 0.067), new THREE.Vector3(0.28, k * 0.25, -1.0 + k * 0.067), 0.018), steel(), 0, 0, 0, { shadow: false });
  put(sl, rbox(0.7, 0.05, 0.5, 0.01, 1), blue, 0, 1.5, -0.4);
  put(sl, profile([[-0.15, 1.5], [0.0, 1.5], [1.9, 0.25], [2.2, 0.2], [2.2, 0.12], [1.9, 0.17], [0.0, 1.42], [-0.15, 1.42]], 0.5, 0.01, 4), std(0xc8ccd0, { rough: 0.25, metal: 0.9 }), 0, 0, 0);
  for (const s of [-0.26, 0.26]) put(sl, profile([[0.0, 1.62], [1.9, 0.37], [1.9, 0.27], [0.0, 1.52]], 0.03, 0.005, 2), yellow, s, 0, 0);
  // the sandbox with its wooden rim, ringed by tyres painted in every colour the janitor found
  const sb = group(g, -1.0, 0, 1.6);
  put(sb, rbox(2.6, 0.08, 2.6, 0.02, 1), std(0xd8c49a, { rough: 1, map: null }), 0, 0.06, 0, { shadow: false });
  for (let k = 0; k < 4; k++) put(sb, rbox(2.8, 0.22, 0.12, 0.02, 1), std(0x9a7a4a, { rough: 0.9 }), Math.sin((k * Math.PI) / 2) * 1.34, 0.11, Math.cos((k * Math.PI) / 2) * 1.34, { ry: (k * Math.PI) / 2 });
  const tyre = new THREE.TorusGeometry(0.3, 0.11, 8, 20);
  const tyreCols = [0xd8c02a, 0x2e6ab8, 0xe8e8e0, 0xc83a2e, 0x3a8a4a];
  for (let k = 0; k < 14; k++) {
    const t = -0.6 + (k / 13) * 3.2;
    put(g, tyre, std(tyreCols[k % 5], { rough: 0.7 }), -3.6 + t * 2.3, 0.05, 3.3 - Math.sin(t) * 0.3, { ry: 0.1, shadow: false });
  }
}

/** The frame for beating carpets, and the washing line beside it. */
function yardWork(parent: THREE.Object3D, x: number, y: number, z: number): void {
  const g = group(parent, x, y, z);
  const pipe = std(0x5a6a5a, { rough: 0.6, metal: 0.4 });
  for (const s of [-1.2, 1.2]) put(g, cyl(0.04, 0.04, 2.0, 8), pipe, s, 1.0, 0);
  for (const h of [1.25, 1.95]) put(g, cyl(0.035, 0.035, 2.4, 8), pipe, 0, h, 0, { rz: Math.PI / 2 });
  // the washing line: two T-posts, three lines, the neighbours' sheets
  const wl = group(g, 0, 0, -3.5);
  for (const s of [-2.5, 2.5]) { put(wl, cyl(0.04, 0.04, 2.1, 8), pipe, s, 1.05, 0); put(wl, cyl(0.03, 0.03, 0.9, 8), pipe, s, 2.05, 0, { rx: Math.PI / 2 }); }
  for (const d of [-0.35, 0, 0.35]) put(wl, rod(new THREE.Vector3(-2.5, 2.04, d), new THREE.Vector3(2.5, 1.98, d), 0.006, 3), std(0xe8e8e0), 0, 0, 0, { shadow: false });
  const cloth = [0xe8e8f0, 0xd8b8c8, 0x8ab0d0, 0xf0e0b0, 0xe8e8f0];
  cloth.forEach((c, i) => {
    const w = 0.5 + (i % 2) * 0.5;
    const geo = new THREE.PlaneGeometry(w, 0.8, 6, 4);
    const p = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 7 + i) * 0.04);
    geo.computeVertexNormals();
    put(wl, geo, std(c, { rough: 0.95, side: THREE.DoubleSide }), -1.9 + i * 0.95, 1.6, [-0.35, 0, 0.35][i % 3], { shadow: false });
  });
}

/** Shell garages: curved steel roofs, painted and rusted. */
function garages(parent: THREE.Object3D, x: number, y: number, z: number, ry: number): void {
  const g = group(parent, x, y, z, ry);
  const pts: Array<[number, number]> = [[-2.5, 0]];
  for (let i = 0; i <= 12; i++) { const t = Math.PI - (i / 12) * Math.PI; pts.push([Math.cos(t) * 2.5, 0.1 + Math.sin(t) * 1.9]); }
  pts.push([2.5, 0]);
  const shell = profile(pts, 3.0, 0.02, 2);
  [0x4a6a4a, 0x7a5a3a, 0x5a6a7a, 0x6a6a5a].forEach((c, i) => {
    put(g, shell, std(c, { rough: 0.6, metal: 0.4 }), i * 3.1, 0, 0, { ry: Math.PI / 2 });
    put(g, rbox(0.04, 1.6, 2.2, 0.01, 1), std(c - 0x101010, { rough: 0.5, metal: 0.5 }), i * 3.1, 0.85, 2.51, { ry: Math.PI / 2 });
  });
}

function entrance(parent: THREE.Object3D, x: number, y: number, z: number, facing: number): void {
  const g = group(parent, x, y, z, facing);
  const concrete = std(0xa8a49c, { rough: 0.95 });
  put(g, rbox(2.8, 0.16, 1.7, 0.02, 1), concrete, 0, 2.7, 0.85);
  put(g, rbox(2.4, 0.3, 1.2, 0.02, 1), concrete, 0, 0.15, 0.6, { shadow: false });
  put(g, rbox(1.25, 2.1, 0.08, 0.02, 2), std(0x4a2a24, { rough: 0.45, metal: 0.5 }), 0, 1.35, 0.02);
  put(g, rbox(0.14, 0.24, 0.03, 0.01, 1), std(0x9a9ea4, { rough: 0.3, metal: 0.8 }), 0.75, 1.5, 0.06);
  put(g, box(0.25, 0.12, 0.1), std(0x000000, { emissive: 0xfff0d0, emissiveIntensity: 1.2 }), 0, 2.55, 0.12);
  bench(g, -2.4, 0, 1.3, 0);
}

// ------------------------------------------------------------------ the whole yard

export function buildCourtyard(Y: number): Courtyard {
  const root = new THREE.Group();
  root.name = "courtyard";
  const r = rng(1917);
  const lamps: THREE.Object3D[] = [];

  // ground, asphalt, earth
  const grass = grassTextures();
  const snow = snowTextures();
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: grass.map, normalMap: grass.normal, roughness: 0.95 });
  grass.map.repeat.set(15, 8.3); grass.normal.repeat.set(15, 8.3);
  snow.map.repeat.set(18, 10); snow.normal.repeat.set(18, 10);
  const gr = put(root, new THREE.PlaneGeometry(90, 50), groundMat, 0, Y, -22, { rx: -Math.PI / 2, shadow: false });
  gr.receiveShadow = true;
  const asp = asphaltTextures();
  const asphalt = std(0xffffff, { map: asp.map, normal: asp.normal, rough: 0.85 });
  const flat = group(root);
  ground(flat, 90, 5.4, asphalt, 0, Y + 0.02, -24, 7);
  ground(flat, 2.4, 17, asphalt, -3, Y + 0.025, -13.2, 7);
  ground(flat, 60, 2.2, asphalt, 0, Y + 0.02, -7.2, 7);
  ground(flat, 6.5, 3.2, asphalt, 9.5, Y + 0.021, -8.6, 7);
  // curbs
  curbs(flat, -45, -21.25, 45, -21.25, Y, r);
  curbs(flat, -45, -26.75, 45, -26.75, Y, r);
  curbs(flat, -30, -8.35, -4.3, -8.35, Y, r);
  curbs(flat, -1.7, -8.35, 30, -8.35, Y, r);
  curbs(flat, -4.25, -8.4, -4.25, -21.2, Y, r);
  curbs(flat, -1.75, -8.4, -1.75, -21.2, Y, r);
  bake(flat, false);
  const dirt = std(0xffffff, { map: dirtTexture(), rough: 1, transparent: true, key: "dirt" });
  dirt.depthWrite = false;
  dirt.polygonOffset = true; dirt.polygonOffsetFactor = -1;
  const worn = group(root);
  // under the cars on the lawn, the desire paths to the playground and the bins
  for (const [x, z, w, d, ry] of [[10, -11.6, 12, 4.5, 0], [2.5, -12, 1.5, 9, 0.75], [-9, -14, 1.3, 11, -0.5], [11, -16, 7, 6, 0.2], [-15, -18.5, 4, 3, 0.4], [6, -19.5, 1.2, 6, 1.3]] as const) {
    const m = put(worn, new THREE.PlaneGeometry(w, d), dirt, x, Y + 0.012, z, { rx: -Math.PI / 2, shadow: false });
    m.rotation.order = "YXZ"; m.rotation.y = ry;
  }
  bake(worn, false);

  // our block (under the window) and the blocks around the yard
  const facade = panelFacade(23, [206, 198, 182]);
  const facadeMat = new THREE.MeshStandardMaterial({ map: facade.map, emissiveMap: facade.glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.92 });
  const front = facade.map.clone(); front.repeat.set(70 / 24, 1); front.needsUpdate = true;
  const frontGlow = facade.glow.clone(); frontGlow.repeat.set(70 / 24, 1); frontGlow.needsUpdate = true;
  facadeMat.map = front; facadeMat.emissiveMap = frontGlow;
  const blank = std(0xbcb4a4, { rough: 0.95 });
  const blocks = group(root);
  const H = 27.4;
  const opp = put(blocks, new THREE.BoxGeometry(70, H, 6), [blank, blank, blank, blank, facadeMat, blank] as unknown as THREE.Material, 0, Y + H / 2, -40, { shadow: false });
  opp.userData.smoothed = true;
  const sideMat = facadeMat.clone();
  const sm = facade.map.clone(); sm.repeat.set(30 / 24, 1); sm.needsUpdate = true;
  const sg = facade.glow.clone(); sg.repeat.set(30 / 24, 1); sg.needsUpdate = true;
  sideMat.map = sm; sideMat.emissiveMap = sg;
  for (const s of [-1, 1]) {
    const mats = [blank, blank, blank, blank, blank, blank];
    mats[s < 0 ? 0 : 1] = sideMat;
    const m = put(blocks, new THREE.BoxGeometry(6, H, 30), mats as unknown as THREE.Material, s * 34, Y + H / 2, -22, { shadow: false });
    m.userData.smoothed = true;
  }
  const ownMaps = panelFacade(57, [214, 206, 190]);
  ownMaps.map.repeat.set(60 / 24, 13.2 / H);
  ownMaps.map.offset.set(0, 1 - 13.2 / H);
  put(blocks, new THREE.BoxGeometry(60, 13.2, 0.4), [blank, blank, blank, blank, std(0xffffff, { map: ownMaps.map, rough: 0.92 }), blank] as unknown as THREE.Material, 0, Y + 6.5, -3.75, { shadow: false }).userData.smoothed = true;
  // entrances, canopies, a couple of glazed balconies sticking out, air conditioners
  const deco = group(root);
  entrance(deco, -3, Y, -3.55, Math.PI);
  for (const ex of [-22, 0, 22]) entrance(deco, ex, Y, -36.95, 0);
  const acBody = std(0xe8e8e4, { rough: 0.5 });
  for (let i = 0; i < 26; i++) {
    const bx = -33 + r() * 66, fl = Math.floor(r() * 8);
    put(deco, rbox(0.8, 0.55, 0.3, 0.03, 1), acBody, bx, Y + 2.2 + fl * 2.85, -36.85, { shadow: false });
  }
  for (const [bx, fl, c] of [[-27.3, 0, 0xf0f0ec], [-15.3, 1, 0xc8bca0], [-3.3, 0, 0xf0f0ec], [8.7, 2, 0xa8acb0], [20.7, 0, 0xd8d4c8], [-21.3, 3, 0xf0f0ec], [14.7, 1, 0xb89a7a]] as const) {
    const y0 = Y + 1.4 + fl * 2.86 + 0.3;
    put(deco, rbox(2.5, 1.3, 1.0, 0.02, 1), std(c, { rough: 0.6 }), bx, y0 + 0.65, -36.5, { shadow: false });
    put(deco, box(2.4, 0.7, 0.02), std(0x2a323a, { rough: 0.1, metal: 0.3 }), bx, y0 + 1.0, -35.99, { shadow: false });
  }
  bake(deco, true);

  // parked cars: along the road, and on the lawn by our entrance (as everyone does)
  const cars = group(root);
  const carSnow: THREE.Object3D[] = [];
  const park = (c: THREE.Group, x: number, z: number, ry: number) => {
    c.position.set(x, Y, z); c.rotation.y = ry; c.name = "";
    const s = c.getObjectByName("snow");
    if (s) carSnow.push(s);
    cars.add(c);
  };
  for (let i = 0; i < 9; i++) if (i !== 4) park(courtyardCar(i + 3), -20 + i * 4.7 + (i % 3) * 0.3, -27.6 - (i % 2) * 0.15, Math.PI / 2 + (r() - 0.5) * 0.04);
  for (let i = 0; i < 4; i++) park(courtyardCar(i + 20), 6.2 + i * 2.55, -11.6 - (i % 2) * 0.35, (r() - 0.5) * 0.12 + (i === 2 ? Math.PI : 0));
  bake(cars, true);

  // furniture of the yard
  const stuff = group(root);
  bins(stuff, 10, Y, -8.9);
  bench(stuff, -6.2, Y, -8.9, 0);
  bench(stuff, 0.8, Y, -8.9, 0);
  bench(stuff, 7.6, Y, -17.4, Math.PI / 2);
  playground(stuff, 6.5, Y, -14.5);
  yardWork(stuff, -12.5, Y, -12.5);
  garages(stuff, -27, Y, -14.5, 0);
  // low hedges under our windows
  const hedge = std(0x3e5e32, { rough: 0.95, map: leafTex().map });
  for (let i = 0; i < 8; i++) put(stuff, lumpy(rbox(2.6, 0.9, 0.9, 0.3, 3), 0.12, 3, i), hedge, -24 + i * 6.1 + (i > 3 ? 2 : 0), Y + 0.4, -5.0, { shadow: false, name: "" });
  bake(stuff, true);
  // street lamps (their bulbs stay separate: they switch on)
  for (const [x, z, ry] of [[-10, -8.6, Math.PI], [6, -8.6, Math.PI], [-8, -20.8, 0], [12, -20.8, 0]] as const) {
    const lg = group(root);
    const bulb = lamp(lg, x, Y, z, ry);
    bake(lg, true);
    lamps.push(bulb);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), lightPoolMaterial(0xffc070, 0.45));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, Y + 0.04, z + (ry === 0 ? 1.3 : -1.3));
    pool.name = "pool";
    root.add(pool);
    lamps.push(pool);
  }

  // trees: built per season
  const trees = group(root);
  const spots: Array<[number, number, boolean]> = [[-12, -10.2, false], [-8, -16, true], [13.5, -14.5, false], [16, -10, false], [-17, -18, true], [3.5, -19.6, false], [-2, -19.8, false], [20, -17.5, true], [-20, -10.5, false], [-6.5, -10.4, false], [18, -6.5, false], [-15, -6.4, false]];
  let builtFor = -1;
  const setSeason = (s: number): number => {
    for (const c of carSnow) c.visible = s === 0;
    groundMat.map = s === 0 ? snow.map : grass.map;
    groundMat.normalMap = s === 0 ? snow.normal : grass.normal;
    groundMat.needsUpdate = true;
    dirt.opacity = s === 0 ? 0 : 1;
    if (builtFor !== s) {
      builtFor = s;
      trees.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
      trees.clear();
      spots.forEach(([x, z, ever], i) => {
        const g = group(trees, x, Y, z);
        if (ever) spruce(g, i + 1, s === 0);
        else tree(g, i + 1, s);
      });
      bake(trees, true);
    }
    return s === 0 ? 0xffffff : s === 1 ? 0xe8f4dc : s === 2 ? 0xffffff : 0xe8dcb0;
  };
  const setNight = (on: boolean) => { facadeMat.emissiveIntensity = on ? 1.2 : 0; sideMat.emissiveIntensity = on ? 1.2 : 0; };
  return { root, groundMat, facadeMat, facade: { map: front, glow: frontGlow }, lamps, setSeason, setNight };
}

