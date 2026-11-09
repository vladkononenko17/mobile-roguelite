// Tactical gear modelled onto a rebound hero (scripts/build-heroes.mjs): a plate carrier made from the
// avatar's own torso (front and back plates, a cummerbund, shoulder straps), magazine pouches, a radio,
// a medic patch and a thigh holster. Everything is generated here (no third-party asset), skinned to the
// same skin as the body: the carrier copies the weights of the nearest torso vertex so it bends with
// her; each pouch is rigid on the weights at its centre.
//
// Coordinates: the avatar's bind space (T-pose, facing +Z, metres), after the figure shaping.
import * as THREE from "three";

const TORSO_JOINTS = /^mixamorig:(Hips|Spine|Spine1|Spine2)$/;

/** sRGB 0-255 -> linear factor. */
const lin = (c) => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);

export const GEAR = {
  // A winter parka's trim (the puffer itself is the inflated sweater, build-heroes.mjs PUFF).
  drifter: {
    kind: "parka",
    colors: { fur: [112, 98, 80], hood: [70, 76, 52], pocket: [62, 68, 46], zip: [28, 28, 28], webbing: [40, 40, 38] },
  },
  medic: {
    colors: { carrier: [40, 41, 38], webbing: [30, 30, 29], pouch: [58, 60, 48], patch: [222, 220, 212], cross: [178, 34, 34], radio: [22, 22, 22] },
  },
};

/**
 * @param doc glTF-Transform document; @param prims the avatar's skinned primitives (positions in bind
 * space, JOINTS_0 / WEIGHTS_0 already on `skin`); @param L landmarks { hips, neck, rightUpLeg } (Vector3).
 */
export function addGear(doc, { prims, skin, parent, L, def }) {
  const r = doc.getRoot();
  const buffer = r.listBuffers()[0];
  const joints = skin.listJoints();
  const span = L.neck.y - L.hips.y;
  const hOf = (y) => (y - L.hips.y) / span;

  // ---- The vertex pool: body and clothes on the torso (no hair, eyes, boots).
  const pool = [];
  for (const p of prims) {
    const name = p.getMaterial()?.getName() ?? "";
    if (!/^(body|toigo_(?!ankle)|cortu)/.test(name)) continue;
    const P = p.getAttribute("POSITION"), J = p.getAttribute("JOINTS_0"), W = p.getAttribute("WEIGHTS_0");
    const v = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, v); J.getElement(i, j); W.getElement(i, w);
      pool.push({ x: v[0], y: v[1], z: v[2], j: [...j], w: [...w], name });
    }
  }
  const armpit = Math.min(L.leftArm.y, L.rightArm.y) - 0.035;
  const torso = pool.filter((p) => p.y > L.hips.y - 0.25 && p.y < L.neck.y + 0.08 && (Math.abs(p.x) < 0.16 || p.y < armpit - 0.02));
  const torsoSkin = torso.filter((p) => TORSO_JOINTS.test(joints[p.j[p.w.indexOf(Math.max(...p.w))]].getName()));

  // Torso axis: the middle of the front-to-back extent near x = 0, per height (smoothed).
  const zcAt = (() => {
    const rows = new Map();
    for (const p of torso) {
      if (Math.abs(p.x) > 0.05) continue;
      const k = Math.round(p.y / 0.02);
      const e = rows.get(k) ?? [Infinity, -Infinity];
      rows.set(k, [Math.min(e[0], p.z), Math.max(e[1], p.z)]);
    }
    return (y) => {
      let s = 0, n = 0;
      for (let d = -2; d <= 2; d++) {
        const e = rows.get(Math.round(y / 0.02) + d);
        if (e) { s += (e[0] + e[1]) / 2; n++; }
      }
      return n ? s / n : 0;
    };
  })();

  // ---- Radial profile r(y, θ) of the torso (θ = 0 front, +x at 90°).
  const NT = 72, dT = (2 * Math.PI) / NT;
  const y0 = L.hips.y + 0.41 * span, y1 = L.hips.y + 0.92 * span, dy = 0.01;
  const NY = Math.round((y1 - y0) / dy) + 1;
  const prof = Array.from({ length: NY }, () => new Float32Array(NT).fill(-1));
  for (const p of torso) {
    const iy = Math.round((p.y - y0) / dy);
    if (iy < 0 || iy >= NY) continue;
    const zc = zcAt(p.y), dx = p.x, dz = p.z - zc;
    let t = Math.atan2(dx, dz);
    if (t < 0) t += 2 * Math.PI;
    const it = Math.round(t / dT) % NT;
    prof[iy][it] = Math.max(prof[iy][it], Math.hypot(dx, dz));
  }
  for (let pass = 0; pass < 40; pass++) {
    let holes = 0;
    for (let iy = 0; iy < NY; iy++) for (let it = 0; it < NT; it++) {
      if (prof[iy][it] > 0) continue;
      const nb = [prof[iy][(it + 1) % NT], prof[iy][(it + NT - 1) % NT], prof[iy - 1]?.[it], prof[iy + 1]?.[it]].filter((x) => x > 0);
      if (nb.length) prof[iy][it] = Math.max(...nb);
      else holes++;
    }
    if (!holes) break;
  }
  // Smooth (keeping clear of the body: never below 97% of the raw radius).
  for (let k = 0; k < 2; k++) {
    const old = prof.map((row) => row.slice());
    for (let iy = 0; iy < NY; iy++) for (let it = 0; it < NT; it++) {
      const a = old[iy][(it + 1) % NT], b = old[iy][(it + NT - 1) % NT], c = old[Math.max(0, iy - 1)][it], d = old[Math.min(NY - 1, iy + 1)][it];
      prof[iy][it] = Math.max(old[iy][it] * 0.97, (old[iy][it] * 2 + a + b + c + d) / 6);
    }
  }

  // ---- Which cells are carrier, and how thick.
  const deg = (t) => ((t * 180) / Math.PI + 360) % 360;
  const cellOff = (iy, it) => {
    if (iy < 0 || iy >= NY - 1) return 0;
    const h = hOf(y0 + (iy + 0.5) * dy), a = deg((it + 0.5) * dT), front = Math.min(a, 360 - a), back = Math.abs(a - 180);
    if (front < 48 && h < 0.79 + 0.06 * (front / 48) ** 2) return 0.03; // front plate, scooped neckline
    if (back < 46 && h < 0.8 + 0.05 * (back / 46) ** 2) return 0.024; // back plate
    if (h < 0.55) return 0.02; // cummerbund
    return 0;
  };
  const nodeOff = (iy, it) => Math.max(cellOff(iy, it), cellOff(iy - 1, it), cellOff(iy, (it + NT - 1) % NT), cellOff(iy - 1, (it + NT - 1) % NT));
  const node = (iy, it, off) => {
    const y = y0 + iy * dy, t = (it % NT) * dT, R = prof[iy][it % NT] + off;
    return [R * Math.sin(t), y, zcAt(y) + R * Math.cos(t)];
  };

  const parts = []; // { mat, pos: [], idx: [], weightsFrom?: Vector3 (rigid) }
  const part = (mat, rigidAt = null) => {
    const p = { mat, pos: [], idx: [], rigidAt };
    parts.push(p);
    return p;
  };
  const quad = (p, a, b, c, d) => {
    const i = p.pos.length / 3;
    p.pos.push(...a, ...b, ...c, ...d);
    p.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };

  if (def.kind === "parka") parkaParts({ pool, torso, zcAt, part, quad, L, span });
  else {
  // Outer shell (shared vertices so it shades smooth) and the rim walls.
  const shell = part("carrier"), rim = part("webbing");
  const ids = new Map();
  const vid = (iy, it) => {
    const k = `${iy},${it % NT}`;
    if (!ids.has(k)) { ids.set(k, shell.pos.length / 3); shell.pos.push(...node(iy, it, nodeOff(iy, it % NT))); }
    return ids.get(k);
  };
  for (let iy = 0; iy < NY - 1; iy++) for (let it = 0; it < NT; it++) {
    if (!cellOff(iy, it)) continue;
    const a = vid(iy, it), b = vid(iy, it + 1), c = vid(iy + 1, it + 1), d = vid(iy + 1, it);
    shell.idx.push(a, c, b, a, d, c);
    const wall = (i0, t0, i1, t1) => quad(rim, node(i0, t0, 0.004), node(i1, t1, 0.004), node(i1, t1, nodeOff(i1, t1 % NT)), node(i0, t0, nodeOff(i0, t0 % NT)));
    if (!cellOff(iy - 1, it)) wall(iy, it, iy, it + 1);
    if (!cellOff(iy + 1, it)) wall(iy + 1, it + 1, iy + 1, it);
    if (!cellOff(iy, (it + NT - 1) % NT)) wall(iy + 1, it, iy, it);
    if (!cellOff(iy, (it + 1) % NT)) wall(iy, it + 1, iy + 1, it + 1);
  }

  // ---- Shoulder straps: a band over each shoulder from the front plate's top to the back plate's.
  for (const xs of [0.085, -0.085]) {
    const C = new THREE.Vector3(xs, L.hips.y + 0.78 * span, 0);
    C.z = zcAt(C.y);
    const near = torso.filter((p) => Math.abs(p.x - xs) < 0.022 && p.y > C.y - 0.05);
    const NP = 40, phi0 = -0.25, phi1 = Math.PI + 0.25;
    const rad = new Float32Array(NP + 1);
    for (let i = 0; i <= NP; i++) {
      const f = phi0 + ((phi1 - phi0) * i) / NP;
      const dir = new THREE.Vector2(Math.cos(f), Math.sin(f)); // (z, y) plane: 0 = front, π/2 = up
      let best = 0.04;
      for (const p of near) {
        const v = new THREE.Vector2(p.z - C.z, p.y - C.y), len = v.length();
        if (len > 0 && v.dot(dir) / len > Math.cos(0.09)) best = Math.max(best, len);
      }
      rad[i] = best;
    }
    for (let i = 1; i < NP; i++) rad[i] = Math.max(rad[i], (rad[i - 1] + rad[i + 1]) / 2);
    const pt = (i, x, off) => {
      const f = phi0 + ((phi1 - phi0) * i) / NP, R = rad[i] + off;
      return [x, C.y + R * Math.sin(f), C.z + R * Math.cos(f)];
    };
    const band = part("webbing");
    const w = 0.02;
    for (let i = 0; i < NP; i++) {
      quad(band, pt(i, xs - w, 0.012), pt(i, xs + w, 0.012), pt(i + 1, xs + w, 0.012), pt(i + 1, xs - w, 0.012));
      quad(band, pt(i, xs + w, 0.003), pt(i + 1, xs + w, 0.003), pt(i + 1, xs + w, 0.012), pt(i, xs + w, 0.012));
      quad(band, pt(i + 1, xs - w, 0.003), pt(i, xs - w, 0.003), pt(i, xs - w, 0.012), pt(i + 1, xs - w, 0.012));
    }
  }

  // ---- Boxes (pouches, radio, patch, holster) on the carrier's outer surface.
  const surfaceZ = (x, y) => {
    const iy = Math.max(0, Math.min(NY - 1, Math.round((y - y0) / dy)));
    const R0 = prof[iy][0] + 0.03, t = Math.asin(Math.max(-1, Math.min(1, x / R0)));
    const it = (Math.round(t / dT) + NT) % NT;
    return zcAt(y) + (prof[iy][it] + nodeOff(iy, it)) * Math.cos(t);
  };
  const box = (mat, cx, cy, cz, sx, sy, sz, rigidAt = new THREE.Vector3(cx, cy, cz - sz)) => {
    const g = new THREE.BoxGeometry(sx, sy, sz, 1, 1, 1).translate(cx, cy, cz);
    const p = part(mat, rigidAt);
    p.geom = g;
    return p;
  };
  // Three magazine pouches across the front, low on the plate, with flaps.
  for (const x of [-0.062, 0, 0.062]) {
    const y = L.hips.y + 0.47 * span, z = surfaceZ(x, y);
    box("pouch", x, y, z + 0.016, 0.052, 0.095, 0.032);
    box("webbing", x, y + 0.04, z + 0.034, 0.054, 0.03, 0.006);
  }
  // Medic patch on her left chest, a radio on the right strap.
  {
    const x = 0.075, y = L.hips.y + 0.735 * span, z = surfaceZ(x, y);
    box("patch", x, y, z + 0.002, 0.05, 0.05, 0.004);
    box("cross", x, y, z + 0.0045, 0.036, 0.011, 0.002);
    box("cross", x, y, z + 0.0045, 0.011, 0.036, 0.002);
  }
  {
    const x = -0.085, y = L.hips.y + 0.79 * span, z = surfaceZ(x, y);
    box("radio", x, y, z + 0.018, 0.034, 0.06, 0.022);
    box("radio", x + 0.009, y + 0.05, z + 0.016, 0.006, 0.045, 0.006);
  }
  // Thigh holster on the right leg (-x side), outside of the thigh.
  {
    const y = L.rightUpLeg.y - 0.17;
    const ring = pool.filter((p) => Math.abs(p.y - y) < 0.02 && p.x < -0.02);
    const xMin = Math.min(...ring.map((p) => p.x)), zs = ring.map((p) => p.z), zc = (Math.min(...zs) + Math.max(...zs)) / 2;
    const at = new THREE.Vector3(xMin + 0.03, y, zc);
    box("radio", xMin - 0.012, y, zc + 0.01, 0.035, 0.17, 0.08, at);
    // Leg strap.
    const strap = part("webbing", at);
    const thigh = ring.filter((p) => p.name === "body" || /shorts/.test(p.name));
    const cx = (Math.min(...thigh.map((p) => p.x)) + Math.max(...thigh.map((p) => p.x))) / 2;
    const NR = 24;
    const ringAt = (yy) => {
    const rr = new Float32Array(NR);
    for (const p of pool.filter((q) => Math.abs(q.y - yy) < 0.015 && q.x < -0.02 && (q.name === "body" || /shorts/.test(q.name)))) {
      let t = Math.atan2(p.x - cx, p.z - zc);
      if (t < 0) t += 2 * Math.PI;
      const k = Math.round(t / ((2 * Math.PI) / NR)) % NR;
      rr[k] = Math.max(rr[k], Math.hypot(p.x - cx, p.z - zc));
    }
    for (let k = 0; k < NR; k++) if (!rr[k]) rr[k] = Math.max(...rr) * 0.9;
    return rr;
    };
    const rings = new Map([y - 0.05, y + 0.04].map((yy) => [yy, ringAt(yy)]));
    const rp = (k, yy, off, dy) => { const rr = rings.get(yy); const t = (k % NR) * ((2 * Math.PI) / NR); return [cx + (rr[k % NR] + off) * Math.sin(t), yy + dy, zc + (rr[k % NR] + off) * Math.cos(t)]; };
    for (const yy of [y - 0.05, y + 0.04]) for (let k = 0; k < NR; k++) quad(strap, rp(k, yy, 0.007, -0.012), rp(k + 1, yy, 0.007, -0.012), rp(k + 1, yy, 0.007, 0.012), rp(k, yy, 0.007, 0.012));
  }

  }

  // ---- Skin weights and primitives, one per material.
  const nearest = (x, y, z, set) => {
    let best = null, bd = Infinity;
    for (const p of set) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  const legPool = pool.filter((p) => p.y < L.hips.y);
  const mats = new Map();
  const material = (key) => {
    if (!mats.has(key)) {
      const c = def.colors[key];
      mats.set(key, doc.createMaterial(`gear_${key}`).setBaseColorFactor([lin(c[0]), lin(c[1]), lin(c[2]), 1]).setRoughnessFactor(key === "radio" ? 0.6 : 0.9).setMetallicFactor(0).setDoubleSided(true));
    }
    return mats.get(key);
  };
  const byMat = new Map();
  for (const p of parts) {
    let geom = p.geom;
    if (!geom) {
      geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(p.pos, 3));
      geom.setIndex(p.idx);
    }
    geom.computeVertexNormals();
    // Outward: flip faces whose normals point at the torso axis on average.
    if (!p.geom) {
      const pos = geom.getAttribute("position"), nor = geom.getAttribute("normal");
      let dot = 0;
      for (let i = 0; i < pos.count; i++) dot += nor.getX(i) * pos.getX(i) + nor.getZ(i) * (pos.getZ(i) - zcAt(pos.getY(i)));
      if (dot < 0 && p.mat !== "webbing") {
        const ix = geom.getIndex().array;
        for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
        geom.computeVertexNormals();
      }
    }
    const pos = geom.getAttribute("position");
    const rigid = p.rigidAt ? nearest(p.rigidAt.x, p.rigidAt.y, p.rigidAt.z, p.rigidAt.y < L.hips.y ? legPool : torsoSkin) : null;
    const J = [], W = [];
    for (let i = 0; i < pos.count; i++) {
      const s = rigid ?? nearest(pos.getX(i), pos.getY(i), pos.getZ(i), torsoSkin);
      J.push(...s.j); W.push(...s.w);
    }
    const e = byMat.get(p.mat) ?? { P: [], N: [], J: [], W: [], I: [] };
    const base = e.P.length / 3;
    e.P.push(...pos.array); e.N.push(...geom.getAttribute("normal").array); e.J.push(...J); e.W.push(...W);
    e.I.push(...(geom.getIndex()?.array ?? [...Array(pos.count).keys()]).map((i) => i + base));
    byMat.set(p.mat, e);
  }
  const mesh = doc.createMesh("gear");
  for (const [key, e] of byMat) {
    const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
    mesh.addPrimitive(doc.createPrimitive().setMaterial(material(key))
      .setAttribute("POSITION", acc("VEC3", new Float32Array(e.P)))
      .setAttribute("NORMAL", acc("VEC3", new Float32Array(e.N)))
      .setAttribute("JOINTS_0", acc("VEC4", new Uint16Array(e.J)))
      .setAttribute("WEIGHTS_0", acc("VEC4", new Float32Array(e.W)))
      .setIndices(acc("SCALAR", new Uint32Array(e.I))));
  }
  const n = doc.createNode("gear").setMesh(mesh).setSkin(skin);
  parent.addChild(n);
  return n;
}

/**
 * Parka trim: a fur ruff round the collar, the hood bunched down the back of the neck, a zip down the
 * front, two flap pockets on the chest. All on the inflated garment's surface.
 */
function parkaParts({ pool, torso, zcAt, part, quad, L, span }) {
  const front = (x, y, w = 0.02) => {
    let z = -Infinity;
    for (const p of torso) if (Math.abs(p.x - x) < w && Math.abs(p.y - y) < 0.015) z = Math.max(z, p.z);
    return z;
  };
  const back = (y) => {
    let z = Infinity;
    for (const p of torso) if (Math.abs(p.x) < 0.03 && Math.abs(p.y - y) < 0.015) z = Math.min(z, p.z);
    return z;
  };
  const box = (mat, cx, cy, cz, sx, sy, sz, rigidAt = new THREE.Vector3(cx, cy, cz)) => {
    const p = part(mat, rigidAt);
    p.geom = new THREE.BoxGeometry(sx, sy, sz).translate(cx, cy, cz);
    return p;
  };
  // Collar ring: the garment's radius round the neck base, a fat band of fur outside it.
  const yc = L.neck.y - 0.045;
  const NR = 36, rr = new Float32Array(NR), zc = zcAt(yc);
  for (const p of pool) {
    if (Math.abs(p.y - yc) > 0.025 || Math.abs(p.x) > 0.16) continue;
    let t = Math.atan2(p.x, p.z - zc);
    if (t < 0) t += 2 * Math.PI;
    const k = Math.round(t / ((2 * Math.PI) / NR)) % NR;
    rr[k] = Math.max(rr[k], Math.hypot(p.x, p.z - zc));
  }
  const mean = rr.reduce((a, b) => a + b, 0) / Math.max(1, rr.filter(Boolean).length);
  for (let k = 0; k < NR; k++) if (!rr[k]) rr[k] = mean;
  // A rounded tube of fur (a smooth grid: shared vertices shade soft).
  const fur = part("fur", new THREE.Vector3(0, yc, back(yc)));
  const NS = 8, R = 0.022;
  for (let k = 0; k <= NR; k++) {
    const t = (k % NR) * ((2 * Math.PI) / NR), r = rr[k % NR] + R * 0.6;
    for (let q = 0; q <= NS; q++) {
      const a = -Math.PI / 2 + (q / NS) * Math.PI * 1.25; // from under the ruff, round the outside, over the top
      const rad = r + Math.cos(a) * R, y = yc + 0.01 + Math.sin(a) * R * 1.2;
      fur.pos.push(rad * Math.sin(t), y, zc + rad * Math.cos(t));
    }
  }
  for (let k = 0; k < NR; k++) for (let q = 0; q < NS; q++) {
    const a = k * (NS + 1) + q, b = (k + 1) * (NS + 1) + q;
    fur.idx.push(a, b, b + 1, a, b + 1, a + 1);
  }
  // The hood, folded down the back: a squashed dome over the shoulder blades.
  const yh = L.neck.y - 0.1, zb = back(yh);
  const hood = part("hood", new THREE.Vector3(0, yh, zb));
  hood.geom = new THREE.SphereGeometry(1, 14, 8).scale(0.15, 0.085, 0.075).translate(0, yh, zb - 0.035);
  // Zip down the front, from the collar to the hem.
  const yTop = yc - 0.03, yBot = L.hips.y - 0.06;
  for (let y = yBot; y < yTop; y += 0.03) {
    const z = front(0, y);
    if (Number.isFinite(z)) box("zip", 0, y + 0.015, z + 0.003, 0.016, 0.032, 0.008, new THREE.Vector3(0, Math.max(y, L.hips.y + 0.03), z - 0.03));
  }
  // Chest pockets with flaps.
  for (const x of [0.085, -0.085]) {
    const y = L.hips.y + 0.6 * span, z = front(x, y, 0.03);
    if (!Number.isFinite(z)) continue;
    box("pocket", x, y, z + 0.006, 0.085, 0.08, 0.016, new THREE.Vector3(x, y, z - 0.03));
    box("hood", x, y + 0.045, z + 0.012, 0.09, 0.028, 0.018, new THREE.Vector3(x, y, z - 0.03));
  }
}
