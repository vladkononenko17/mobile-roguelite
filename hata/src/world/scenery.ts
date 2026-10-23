import * as THREE from "three";
import { pbrMaterial } from "../assets";
import { bakeWorldUV, box, rng } from "./geo";

/** Scenery helpers for the yard: pool water, algae, the haystack, the neighbours' houses. */

export const HAY = { x: 10.5, z: -16.5, r: 1.9, h: 3.1 };

export function makeWaterNormal(): THREE.CanvasTexture {
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d")!;
  const img = x.createImageData(S, S);
  const h = (i: number, j: number): number =>
    Math.sin(i * 0.11 + Math.sin(j * 0.07) * 2) * 0.5 + Math.sin(j * 0.13 + i * 0.05) * 0.4 + Math.sin((i + j) * 0.21) * 0.2;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = h(i + 1, j) - h(i - 1, j), dy = h(i, j + 1) - h(i, j - 1);
    const n = new THREE.Vector3(-dx, -dy, 1).normalize();
    const k = (j * S + i) * 4;
    img.data[k] = (n.x * 0.5 + 0.5) * 255;
    img.data[k + 1] = (n.y * 0.5 + 0.5) * 255;
    img.data[k + 2] = (n.z * 0.5 + 0.5) * 255;
    img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

export function scumTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 288;
  const x = c.getContext("2d")!;
  // thick along the edges, blotchy in the middle
  for (let i = 0; i < 260; i++) {
    const edge = Math.random() < 0.7;
    let px = Math.random() * 512, py = Math.random() * 288;
    if (edge) {
      const s = Math.floor(Math.random() * 4);
      if (s === 0) py = Math.random() * 30;
      if (s === 1) py = 288 - Math.random() * 30;
      if (s === 2) px = Math.random() * 30;
      if (s === 3) px = 512 - Math.random() * 30;
    }
    const r = 6 + Math.random() * (edge ? 26 : 16);
    const gr = x.createRadialGradient(px, py, 0, px, py, r);
    const a = edge ? 0.35 + Math.random() * 0.3 : 0.12 + Math.random() * 0.2;
    gr.addColorStop(0, `rgba(${60 + Math.random() * 30},${80 + Math.random() * 30},${25 + Math.random() * 15},${a})`);
    gr.addColorStop(1, "rgba(60,80,25,0)");
    x.fillStyle = gr;
    x.beginPath();
    x.arc(px, py, r, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function strawTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d")!;
  x.fillStyle = "#8a6a2c";
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) {
    const px = Math.random() * 512, py = Math.random() * 512, a = (Math.random() - 0.5) * 1.2 + Math.PI / 2, l = 20 + Math.random() * 60;
    const v = 150 + Math.random() * 90;
    x.strokeStyle = `rgba(${v},${v * 0.8},${v * 0.38},${0.5 + Math.random() * 0.5})`;
    x.lineWidth = 1 + Math.random() * 1.6;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

export function buildHaystack(): THREE.Group {
  const g = new THREE.Group();
  const tex = strawTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, color: 0x9a927a });
  const geo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const bump = 1 + Math.sin(a * 5 + y * 3) * 0.07 + Math.sin(a * 13 + y * 9) * 0.04 + Math.sin(a * 29) * 0.02;
    // bulge low, taper to a point: a stack, not a dome
    const prof = Math.sqrt(Math.max(0, 1 - y)) * (1 + 0.25 * Math.sin(y * Math.PI));
    const rr = HAY.r * bump * prof / Math.max(1e-3, Math.hypot(x, z));
    p.setXYZ(i, x * rr, y * HAY.h, z * rr);
  }
  geo.computeVertexNormals();
  const mound = new THREE.Mesh(geo, mat);
  mound.castShadow = mound.receiveShadow = true;
  g.add(mound);
  // loose straws sticking out and scattered around
  const r = rng(77);
  // the pole through the top
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.0, 8), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
  pole.position.y = HAY.h + 0.25;
  pole.rotation.z = 0.08;
  pole.castShadow = true;
  g.add(pole);
  // A few chunky straws, not thousands of hair-thin ones: sub-pixel straws
  // flicker as you walk.
  const n = 420;
  const straw = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), new THREE.MeshStandardMaterial({ color: 0xc8a660, roughness: 0.8 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const onGround = i > n * 0.45;
    const a = r() * Math.PI * 2;
    if (onGround) {
      const d = HAY.r * (0.95 + r() * 0.8);
      v.set(Math.cos(a) * d, 0.02, Math.sin(a) * d);
      e.set(Math.PI / 2 + (r() - 0.5) * 0.3, 0, a + (r() - 0.5) * 2);
    } else {
      const y = r() * 0.97;
      const rad = HAY.r * Math.sqrt(Math.max(0, 1 - y)) * (1 + 0.25 * Math.sin(y * Math.PI)) * (1.0 + r() * 0.05);
      v.set(Math.cos(a) * rad, y * HAY.h, Math.sin(a) * rad);
      e.set((r() - 0.5) * 2.4, r() * 3, (r() - 0.5) * 2.4);
    }
    q.setFromEuler(e);
    s.set(1, 0.15 + r() * 0.4, 1);
    m.compose(v, q, s);
    straw.setMatrixAt(i, m);
  }
  straw.castShadow = false; // thin straws: no visible shadow, real cost
  g.add(straw);
  g.position.set(HAY.x, 0, HAY.z);
  return g;
}

export async function neighbours(g: THREE.Group): Promise<void> {
  const [wallA, wallB, roofA, roofB] = await Promise.all([
    pbrMaterial("exterior_wall_cladding_02", { scale: 0.5, color: 0xd8d0c4 }),
    pbrMaterial("beige_wall_002", { scale: 1 / 3 }),
    pbrMaterial("grey_roof_tiles", { scale: 1 / 3 }),
    pbrMaterial("ceramic_roof_01", { scale: 1 / 3.5 }),
  ]);
  const house = (x: number, z: number, w: number, d: number, h: number, wall: THREE.Material, roof: THREE.Material, rot = 0): void => {
    const grp = new THREE.Group();
    box(grp, w, h, d, 0, h / 2, 0, wall);
    const ridge = d * 0.42;
    const shape = new THREE.Shape([new THREE.Vector2(-d / 2 - 0.4, 0), new THREE.Vector2(d / 2 + 0.4, 0), new THREE.Vector2(0, ridge)]);
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: w + 0.8, bevelEnabled: false });
    roofGeo.translate(0, 0, -(w + 0.8) / 2);
    const rm = new THREE.Mesh(roofGeo, roof);
    rm.rotation.y = Math.PI / 2;
    rm.position.y = h;
    rm.castShadow = rm.receiveShadow = true;
    grp.add(rm);
    bakeWorldUV(rm);
    // windows as dark insets
    const win = new THREE.MeshStandardMaterial({ color: 0x2a3438, roughness: 0.1, metalness: 0.3 });
    for (let i = -1; i <= 1; i++) {
      const wm = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.3), win);
      wm.position.set(i * w * 0.3, h * 0.55, d / 2 + 0.01);
      grp.add(wm);
    }
    grp.position.set(x, 0, z);
    grp.rotation.y = rot;
    g.add(grp);
  };
  house(-30, 2, 13, 10, 3.1, wallA, roofA);
  house(31, 0, 12, 11, 3.0, wallB, roofB);
  house(-4, -36, 14, 9, 3.2, wallB, roofA);
  house(-22, 40, 12, 10, 3.0, wallA, roofB, Math.PI);
  house(4, 41, 15, 10, 3.3, wallB, roofA, Math.PI);
  house(26, 40, 12, 10, 3.0, wallA, roofB, Math.PI);
}


/** Flower beds along the front wall and the garden path (x0, x1, z0, z1). */
export const BEDS: Array<[number, number, number, number]> = [
  [-6.7, -3.3, 5.3, 6.1],
  [-0.9, 6.7, 5.3, 6.1],
  [-3.4, -2.92, 7.2, 21.6],
  [-1.28, -0.8, 7.2, 21.6],
];

export function inBed(x: number, z: number, m = 0): boolean {
  return BEDS.some(([x0, x1, z0, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m);
}

/**
 * Bright flower beds: mulch, low leafy clumps and flower heads in saturated
 * colours. Three instanced draws in total; stems are thick enough not to
 * flicker.
 */
export function flowerBeds(seed = 5): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const mulch = new THREE.MeshStandardMaterial({ color: 0x3a2617, roughness: 1 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95 });
  const spots: Array<[number, number]> = [];
  for (const [x0, x1, z0, z1] of BEDS) {
    const w = x1 - x0, d = z1 - z0;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), mulch);
    bed.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
    bed.receiveShadow = true;
    g.add(bed);
    // a low stone edge
    for (const [ex, ez, ew, ed] of [[(x0 + x1) / 2, z0, w, 0.06], [(x0 + x1) / 2, z1, w, 0.06], [x0, (z0 + z1) / 2, 0.06, d], [x1, (z0 + z1) / 2, 0.06, d]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(ew, 0.1, ed), edge);
      e.position.set(ex, 0.05, ez);
      e.receiveShadow = true;
      g.add(e);
    }
    const n = Math.round(w * d * (w < 1 || d < 1 ? 13 : 18));
    for (let i = 0; i < n; i++) spots.push([x0 + 0.08 + r() * (w - 0.16), z0 + 0.08 + r() * (d - 0.16)]);
  }
  // soft garden colours: a few bright accents among dusty pinks, creams and lavender
  const palette = [0xc24a5a, 0xd98aa0, 0xe8c76a, 0xb79ad6, 0xece6da, 0xd9a0b8, 0xc9705a, 0xf0dca0];
  // leafy clumps
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);
  const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), Math.ceil(spots.length / 2));
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }), spots.length);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.011, 1, 5), new THREE.MeshStandardMaterial({ color: 0x3f7a1e, roughness: 0.8 }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
  let b = 0;
  spots.forEach(([x, z], i) => {
    const h = 0.16 + r() * 0.24;
    e.set((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25);
    q.setFromEuler(e);
    m.compose(p.set(x, h / 2 + 0.06, z), q, s.set(1, h, 1));
    stems.setMatrixAt(i, m);
    const hr = 0.022 + r() * 0.018;
    m.compose(p.set(x + Math.sin(e.z) * -h * 0.5, h + 0.06, z + Math.sin(e.x) * h * 0.5), q.identity(), s.set(hr, hr * 0.6, hr));
    heads.setMatrixAt(i, m);
    heads.setColorAt(i, c.setHex(palette[Math.floor(r() * palette.length)]).offsetHSL(0, 0, (r() - 0.5) * 0.08));
    if (i % 2 === 0 && b < bushes.count) {
      const br = 0.1 + r() * 0.09;
      e.set(r(), r() * 6, r());
      m.compose(p.set(x, 0.08, z), q.setFromEuler(e), s.set(br * 1.2, br * 0.8, br * 1.2));
      bushes.setMatrixAt(b, m);
      bushes.setColorAt(b, c.setHSL(0.26 + r() * 0.07, 0.5 + r() * 0.15, 0.1 + r() * 0.06));
      b++;
    }
  });
  bushes.count = b;
  for (const im of [bushes, heads, stems]) {
    im.castShadow = im === bushes; // flower heads and stems are too small to shadow
    im.receiveShadow = true;
    g.add(im);
  }
  return g;
}

/**
 * What you see over the fence: a dark tree line, a far town on one side and
 * hazy mountains behind it all. Unlit, vertex-coloured rings: three draws.
 */
export function horizon(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(91);
  const noise = (a: number, f: number[]): number => f.reduce((acc, k, i) => acc + Math.sin(a * k + i * 1.7 + r() * 0) * (1 / (i + 1)), 0);
  const ring = (radius: number, n: number, height: (a: number) => number, base: number, bottom: THREE.Color, top: THREE.Color, fog: boolean): THREE.Mesh => {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius, h = height(a);
      pos.push(x, base, z, x, h, z);
      col.push(bottom.r, bottom.g, bottom.b, top.r, top.g, top.b);
      if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog }));
    m.frustumCulled = false;
    return m;
  };
  // mountains, far and hazy
  g.add(ring(158, 160, (a) => 10 + 9 * noise(a, [3, 7, 13, 29]) + 14 * Math.max(0, Math.sin(a * 2 + 1)), -3,
    new THREE.Color(0.86, 0.62, 0.5), new THREE.Color(0.5, 0.42, 0.55), false));
  // the far town: blocks of different heights in one sector
  const town: THREE.BoxGeometry[] = [];
  for (let i = 0; i < 46; i++) {
    const a = 1.35 + (r() - 0.5) * 0.9, d = 128 + r() * 18;
    const w = 4 + r() * 7, h = 6 + Math.pow(r(), 2) * 34;
    const b = new THREE.BoxGeometry(w, h, w);
    b.translate(Math.cos(a) * d, h / 2 - 1, Math.sin(a) * d);
    town.push(b);
  }
  const townGeo = mergeBoxes(town);
  const townMesh = new THREE.Mesh(townGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.48, 0.4, 0.48), fog: false }));
  townMesh.frustumCulled = false;
  g.add(townMesh);
  // the tree line all around, closer, in the warm haze
  g.add(ring(78, 220, (a) => 5 + 2.2 * noise(a, [11, 23, 47, 97]) + 1.5 * Math.abs(Math.sin(a * 61)), -1,
    new THREE.Color(0.07, 0.07, 0.05), new THREE.Color(0.11, 0.13, 0.07), true));
  return g;
}

function mergeBoxes(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  let off = 0;
  for (const g of geos) {
    const p = g.getAttribute("position").array as Float32Array;
    for (const v of p) pos.push(v);
    for (const i of g.index!.array) idx.push(i + off);
    off += p.length / 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}
