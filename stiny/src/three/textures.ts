import * as THREE from "three";

/**
 * Surfaces of the flat, drawn in code at 512 px: parquet with grain and worn
 * varnish, Soviet lino, bathroom tiles with dirty grout and one cracked tile,
 * yellowing wallpaper, plaster. Each comes with a normal map made from its own
 * height, so light from the window catches the seams. Plus stains and marks
 * that the years leave on the walls.
 */

/** Small seeded random, so the flat looks the same on every visit. */
function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext("2d", { willReadFrequently: true })!];
}

function tex(cv: HTMLCanvasElement, srgb = true, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** A normal map from a greyscale height canvas (Sobel). */
function normalFrom(height: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const w = height.width;
  const h = height.height;
  const src = height.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const [cv, g] = canvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      out.data[i] = (nx * 0.5 + 0.5) * 255;
      out.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      out.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return tex(cv, false);
}

/** Fine grain over a whole canvas. */
function speckle(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, amount: number, alpha = 0.06): void {
  for (let i = 0; i < amount; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${alpha * r()})` : `rgba(255,255,255,${alpha * r()})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

export interface Surface { map: THREE.CanvasTexture; normal: THREE.CanvasTexture; rough?: THREE.CanvasTexture }

/** Oak parquet in a brick pattern: grain in every plank, dark gaps, varnish worn pale along the paths. */
export function parquet(): Surface {
  const S = 512;
  const r = rng(11);
  const [cv, g] = canvas(S, S);
  const [hc, hg] = canvas(S, S);
  const [rc, rg] = canvas(S, S);
  hg.fillStyle = "#888";
  hg.fillRect(0, 0, S, S);
  rg.fillStyle = "#7a7a7a";
  rg.fillRect(0, 0, S, S);
  const rows = 8;
  const ph = S / rows;
  const pw = S / 4;
  for (let i = 0; i < rows; i++) {
    for (let j = -1; j < 5; j++) {
      const x = j * pw + (i % 2) * (pw / 2);
      const y = i * ph;
      const tone = 0.82 + r() * 0.3;
      const base = [150 * tone, 102 * tone, 62 * tone];
      g.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
      g.fillRect(x, y, pw, ph);
      // grain: long wavy lines along the plank
      const lines = 9 + Math.floor(r() * 6);
      for (let k = 0; k < lines; k++) {
        const yy = y + 3 + r() * (ph - 6);
        const amp = 1 + r() * 2.5;
        const freq = 0.02 + r() * 0.04;
        const ph0 = r() * 6;
        g.strokeStyle = `rgba(${60 + r() * 30},${35 + r() * 20},${15},${0.12 + r() * 0.2})`;
        g.lineWidth = 0.6 + r() * 1.4;
        g.beginPath();
        for (let xx = 0; xx <= pw; xx += 4) g.lineTo(x + xx, yy + Math.sin(ph0 + xx * freq) * amp);
        g.stroke();
      }
      // a knot now and then
      if (r() < 0.25) {
        const kx = x + 10 + r() * (pw - 20);
        const ky = y + 8 + r() * (ph - 16);
        for (let q = 4; q > 0; q--) { g.strokeStyle = `rgba(70,40,18,${0.15 + q * 0.05})`; g.beginPath(); g.ellipse(kx, ky, q * 2.6, q * 1.4, 0, 0, Math.PI * 2); g.stroke(); }
      }
      // gaps between planks: dark in colour, deep in height, rough in finish
      g.fillStyle = "rgba(25,14,6,.75)";
      g.fillRect(x, y, pw, 1.5);
      g.fillRect(x, y, 1.5, ph);
      hg.fillStyle = `rgb(${120 + r() * 30 | 0},${120 + r() * 30 | 0},${120 + r() * 30 | 0})`;
      hg.fillRect(x + 2, y + 2, pw - 3, ph - 3);
      hg.fillStyle = "#000";
      hg.fillRect(x, y, pw, 2);
      hg.fillRect(x, y, 2, ph);
      rg.fillStyle = `rgb(${90 + r() * 50 | 0},0,0)`;
      rg.fillRect(x + 2, y + 2, pw - 3, ph - 3);
    }
  }
  speckle(g, S, S, r, 9000, 0.08);
  // worn varnish: paler, rougher patches
  for (let i = 0; i < 6; i++) {
    const cx = r() * S, cy = r() * S, rad = 60 + r() * 90;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    gr.addColorStop(0, "rgba(210,180,140,.16)");
    gr.addColorStop(1, "rgba(210,180,140,0)");
    g.fillStyle = gr;
    g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    const rr = rg.createRadialGradient(cx, cy, 0, cx, cy, rad);
    rr.addColorStop(0, "rgba(230,230,230,.5)");
    rr.addColorStop(1, "rgba(230,230,230,0)");
    rg.fillStyle = rr;
    rg.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  return { map: tex(cv), normal: normalFrom(hc, 2.2), rough: tex(rc, false) };
}

/** Kitchen lino: a faded two-tone pattern, mottled, with scuffs and a worn path. */
export function lino(): Surface {
  const S = 512;
  const r = rng(23);
  const [cv, g] = canvas(S, S);
  const [hc, hg] = canvas(S, S);
  g.fillStyle = "#b8a684";
  g.fillRect(0, 0, S, S);
  const c = S / 8;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    if ((i + j) % 2) continue;
    g.fillStyle = `rgba(150,128,96,${0.55 + r() * 0.15})`;
    g.fillRect(i * c, j * c, c, c);
    // the little diamond in every other square
    g.fillStyle = "rgba(120,90,60,.35)";
    g.beginPath(); g.moveTo(i * c + c / 2, j * c + 10); g.lineTo(i * c + c - 10, j * c + c / 2); g.lineTo(i * c + c / 2, j * c + c - 10); g.lineTo(i * c + 10, j * c + c / 2); g.closePath(); g.fill();
  }
  // mottling
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "255,255,240" : "60,40,20"},${0.02 + r() * 0.04})`; g.beginPath(); g.arc(r() * S, r() * S, 2 + r() * 10, 0, Math.PI * 2); g.fill(); }
  // scuffs: short dark arcs from chair legs and shoes
  for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(40,30,20,${0.1 + r() * 0.2})`; g.lineWidth = 1 + r() * 2; g.beginPath(); const x = r() * S, y = r() * S; g.arc(x, y, 6 + r() * 20, r() * 6, r() * 6 + 0.6 + r()); g.stroke(); }
  speckle(g, S, S, r, 6000, 0.06);
  hg.fillStyle = "#808080";
  hg.fillRect(0, 0, S, S);
  for (let i = 0; i < 1500; i++) { hg.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "0,0,0"},${0.05 + r() * 0.08})`; hg.fillRect(r() * S, r() * S, 2, 2); }
  return { map: tex(cv), normal: normalFrom(hc, 1.2) };
}

/** Bathroom tiles: pale blue-grey, slightly different each, grout gone grey, one cracked. */
export function tiles(): Surface {
  const S = 512;
  const r = rng(37);
  const [cv, g] = canvas(S, S);
  const [hc, hg] = canvas(S, S);
  const n = 8;
  const t = S / n;
  g.fillStyle = "#7d8a88";
  g.fillRect(0, 0, S, S);
  hg.fillStyle = "#000";
  hg.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 0.92 + r() * 0.1;
    g.fillStyle = `rgb(${200 * v | 0},${214 * v | 0},${214 * v | 0})`;
    g.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
    const gr = g.createLinearGradient(i * t, j * t, i * t + t, j * t + t);
    gr.addColorStop(0, "rgba(255,255,255,.18)");
    gr.addColorStop(1, "rgba(0,0,0,.06)");
    g.fillStyle = gr;
    g.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
    hg.fillStyle = "#c8c8c8";
    hg.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
    hg.fillStyle = "#e0e0e0";
    hg.fillRect(i * t + 6, j * t + 6, t - 12, t - 12);
  }
  // one cracked tile
  const ci = 5, cj = 2;
  g.strokeStyle = "rgba(60,60,60,.7)";
  g.lineWidth = 1.2;
  g.beginPath();
  let x = ci * t + 8, y = cj * t + t * 0.3;
  g.moveTo(x, y);
  for (let k = 0; k < 7; k++) { x += t / 8; y += (r() - 0.4) * 10; g.lineTo(x, y); }
  g.stroke();
  // grime in the grout near the bottom
  const gr = g.createLinearGradient(0, S * 0.6, 0, S);
  gr.addColorStop(0, "rgba(70,60,40,0)");
  gr.addColorStop(1, "rgba(70,60,40,.18)");
  g.fillStyle = gr;
  g.fillRect(0, S * 0.6, S, S * 0.4);
  speckle(g, S, S, r, 3000, 0.04);
  return { map: tex(cv), normal: normalFrom(hc, 3) };
}

/** Soviet wallpaper: a damask-ish motif on cream, yellowed, with faint seams. */
export function wallpaper(): Surface {
  const S = 512;
  const r = rng(51);
  const [cv, g] = canvas(S, S);
  const [hc, hg] = canvas(S, S);
  g.fillStyle = "#cdbd8e";
  g.fillRect(0, 0, S, S);
  hg.fillStyle = "#808080";
  hg.fillRect(0, 0, S, S);
  const motif = (cx: number, cy: number, s: number, c: string, h: CanvasRenderingContext2D, hc2: string) => {
    for (const [ctx2, col] of [[g, c], [h, hc2]] as const) {
      ctx2.fillStyle = col;
      ctx2.beginPath();
      ctx2.moveTo(cx, cy - s);
      ctx2.bezierCurveTo(cx + s * 0.5, cy - s * 0.6, cx + s * 0.75, cy - s * 0.1, cx, cy + s);
      ctx2.bezierCurveTo(cx - s * 0.75, cy - s * 0.1, cx - s * 0.5, cy - s * 0.6, cx, cy - s);
      ctx2.fill();
      ctx2.beginPath();
      ctx2.arc(cx, cy - s * 0.15, s * 0.16, 0, Math.PI * 2);
      ctx2.fillStyle = col === c ? "rgba(160,140,90,.55)" : "#a0a0a0";
      ctx2.fill();
    }
  };
  const step = S / 4;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const cx = i * step + (j % 2) * step / 2 + step / 4;
    const cy = j * step + step / 2;
    motif(cx, cy, step * 0.34, "rgba(176,156,104,.75)", hg, "#9a9a9a");
    motif(cx + (j % 2 ? -1 : 1) * step / 2, cy, step * 0.12, "rgba(176,156,104,.5)", hg, "#909090");
  }
  // vertical stripes of the pattern roll
  for (let i = 0; i < 8; i++) { g.fillStyle = "rgba(255,250,230,.05)"; g.fillRect(i * 64 + 30, 0, 8, S); }
  // yellowing, unevenly
  for (let i = 0; i < 30; i++) {
    const cx = r() * S, cy = r() * S, rad = 40 + r() * 120;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    gr.addColorStop(0, `rgba(170,130,50,${0.04 + r() * 0.06})`);
    gr.addColorStop(1, "rgba(170,130,50,0)");
    g.fillStyle = gr;
    g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  // a seam between strips
  g.fillStyle = "rgba(90,70,40,.18)";
  g.fillRect(S - 2, 0, 2, S);
  speckle(g, S, S, r, 7000, 0.05);
  return { map: tex(cv), normal: normalFrom(hc, 0.9) };
}

/** Painted plaster for the kitchen and the hall: flat colour, faint trowel marks. */
export function plaster(color: string, seed: number): Surface {
  const S = 256;
  const r = rng(seed);
  const [cv, g] = canvas(S, S);
  const [hc, hg] = canvas(S, S);
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  hg.fillStyle = "#808080";
  hg.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) {
    const x = r() * S, y = r() * S, rad = 6 + r() * 26;
    const a = 0.02 + r() * 0.04;
    g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    g.beginPath(); g.ellipse(x, y, rad, rad * 0.4, r() * 3, 0, Math.PI * 2); g.fill();
    hg.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a * 3})` : `rgba(0,0,0,${a * 3})`;
    hg.beginPath(); hg.ellipse(x, y, rad, rad * 0.4, r() * 3, 0, Math.PI * 2); hg.fill();
  }
  speckle(g, S, S, r, 2500, 0.05);
  return { map: tex(cv), normal: normalFrom(hc, 1) };
}

// ------------------------------------------------------------------ what the years leave on the walls

export type Mark = "damp" | "mould" | "peel" | "ghost" | "scuff" | "tally";

/** A transparent decal: a damp stain, mould by the window, peeling wallpaper, the pale ghost of a removed picture… */
export function markTexture(kind: Mark, seed = 1): THREE.CanvasTexture {
  const S = 256;
  const r = rng(seed * 97 + kind.length);
  const [cv, g] = canvas(S, S);
  if (kind === "damp") {
    for (let ring = 0; ring < 5; ring++) {
      g.strokeStyle = `rgba(110,80,30,${0.16 - ring * 0.02})`;
      g.lineWidth = 3;
      g.fillStyle = `rgba(140,105,45,${0.07})`;
      g.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) {
        const rad = (40 + ring * 16) * (0.8 + r() * 0.35);
        g.lineTo(S / 2 + Math.cos(a) * rad, S * 0.42 + Math.sin(a) * rad * 0.8);
      }
      g.closePath(); g.fill(); g.stroke();
    }
    // the drip run down from it
    for (let i = 0; i < 3; i++) { g.fillStyle = "rgba(120,90,40,.12)"; g.fillRect(S / 2 - 30 + i * 25 + r() * 10, S * 0.5, 4 + r() * 4, 60 + r() * 60); }
  } else if (kind === "mould") {
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.6) * S * 0.45;
      g.fillStyle = `rgba(${30 + r() * 30},${40 + r() * 30},${30},${0.1 + r() * 0.3})`;
      g.beginPath(); g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d * 0.7, 1 + r() * 3.5, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === "peel") {
    // a torn strip of wallpaper curling away, with bare grey plaster behind
    g.fillStyle = "rgba(150,148,140,.95)";
    g.beginPath(); g.moveTo(60, 0); g.lineTo(200, 0); g.lineTo(190, 70); g.lineTo(150, 130); g.lineTo(110, 110); g.lineTo(80, 60); g.closePath(); g.fill();
    g.fillStyle = "rgba(205,190,145,1)";
    g.beginPath(); g.moveTo(150, 130); g.quadraticCurveTo(210, 150, 230, 95); g.lineTo(190, 70); g.closePath(); g.fill();
    g.strokeStyle = "rgba(90,70,40,.5)"; g.lineWidth = 2; g.stroke();
  } else if (kind === "ghost") {
    // where a picture hung: the wall around it yellowed, under it did not
    g.fillStyle = "rgba(255,250,225,.28)";
    g.fillRect(40, 50, 176, 140);
    g.strokeStyle = "rgba(80,60,30,.25)";
    g.strokeRect(40, 50, 176, 140);
    g.fillStyle = "rgba(60,50,40,.6)";
    g.beginPath(); g.arc(128, 36, 3, 0, Math.PI * 2); g.fill();
  } else if (kind === "scuff") {
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(40,30,20,${0.06 + r() * 0.12})`; g.lineWidth = 1 + r() * 3; g.beginPath(); const x = r() * S; const y = S * 0.55 + r() * S * 0.4; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 50, y + (r() - 0.5) * 12); g.stroke(); }
    // a handprint by the door
    g.fillStyle = "rgba(60,45,30,.12)";
    g.beginPath(); g.ellipse(128, 100, 22, 26, 0, 0, Math.PI * 2); g.fill();
    for (let f = 0; f < 4; f++) { g.beginPath(); g.ellipse(104 + f * 15, 66 - (f === 1 || f === 2 ? 8 : 0), 5, 14, 0, 0, Math.PI * 2); g.fill(); }
  } else {
    // tally marks: days counted on the wall, in pencil
    g.strokeStyle = "rgba(50,45,55,.55)";
    g.lineWidth = 2;
    for (let grp = 0; grp < 14; grp++) {
      const gx = 14 + (grp % 5) * 48;
      const gy = 20 + Math.floor(grp / 5) * 70;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(gx + k * 8 + r() * 2, gy); g.lineTo(gx + k * 8 + r() * 2, gy + 40); g.stroke(); }
      g.beginPath(); g.moveTo(gx - 4, gy + 32); g.lineTo(gx + 32, gy + 6); g.stroke();
    }
  }
  return tex(cv, true, false);
}
