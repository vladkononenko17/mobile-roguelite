import * as THREE from "three";
import { instance, pbrMaterial } from "../assets";
import { applyGrime } from "./grime";
import { bakeWorldUV, box, rng } from "./geo";
import { buildLawn } from "./grass";
import { buildLeaves } from "./leaves";
import { buildTree, foliageMaterial } from "./tree";
import { HOUSE } from "./house";

/**
 * The plot around the house: front lawn to the street, a driveway along the
 * east side, a back yard behind a plank fence with a neglected pool, a deck,
 * a big tree dropping leaves, a haystack and the usual junk. Neighbours'
 * houses sit beyond the fence so the street feels lived in.
 *
 *   street z≈24..32 · sidewalk z≈22.5..24
 *   front lawn z≈5.5..22.5 · house z −5..5 · back yard z −22..−5
 *   driveway x 8.5..12.5 · pool x −9..−1, z −15..−10.5 · deck x 1.5..8, z −9.5..−5.2
 */

export const LOT = { x0: -16, x1: 16, z0: -22, z1: 22.5 };
export const POOL = { x0: -9, x1: -1, z0: -15, z1: -10.5, depth: 1.5, water: -0.22 };
export const DECK = { x0: 1.5, x1: 8, z0: -9.5, z1: -5.2 };
export const DRIVE = { x0: 8.5, x1: 12.5, z0: -6, z1: 22.5 };
export const PATH = { x0: -2.8, x1: -1.4, z0: 6.6, z1: 22.5 };
export const HAY = { x: 10.5, z: -16.5, r: 2.1, h: 2.0 };

const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }, m = 0): boolean =>
  x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

export function isLawn(x: number, z: number): boolean {
  if (!inRect(x, z, LOT)) return false;
  if (Math.abs(x) < HOUSE.halfX + 0.5 && Math.abs(z) < HOUSE.halfZ + 0.5) return false;
  if (inRect(x, z, DRIVE, 0.15) || inRect(x, z, PATH, 0.1)) return false;
  if (inRect(x, z, POOL, 0.55) || inRect(x, z, DECK, 0.1)) return false;
  if (Math.hypot(x - HAY.x, z - HAY.z) < HAY.r * 0.95) return false;
  if (z > -2 && z < 6.4 && x > -3.2 && x < -1) return false; // front steps
  return true;
}

export interface YardParts {
  group: THREE.Group;
  lawn: THREE.InstancedMesh;
  water: THREE.Mesh;
  tick: (t: number) => void;
}

export interface YardOptions {
  /** 0 = untouched, 1 = mowed. */
  mowed: (x: number, z: number) => number;
  stripe?: (x: number, z: number) => boolean;
  grassDensity: number;
}

export async function buildYard(o: YardOptions): Promise<YardParts> {
  const g = new THREE.Group();
  g.name = "yard";
  const [soil, pavers, overgrown, asphalt, coping, poolTiles, deck, fence, bark, sidewalk, leafLitter] = await Promise.all([
    pbrMaterial("leafy_grass", { scale: 0.5 }),
    pbrMaterial("patterned_concrete_pavers", { scale: 1 / 1.8 }),
    pbrMaterial("overgrown_concrete_pavers", { scale: 0.5 }),
    pbrMaterial("asphalt_02", { scale: 1 / 3 }),
    pbrMaterial("concrete_floor_02", { scale: 0.5 }),
    pbrMaterial("blue_floor_tiles_01", { scale: 0.5 }),
    pbrMaterial("weathered_brown_planks", { scale: 1 / 1.8 }),
    pbrMaterial("weathered_brown_planks", { scale: 1 / 1.8, color: 0xd8cbb8 }),
    pbrMaterial("bark_brown_02", { scale: 1 }),
    pbrMaterial("concrete_floor_02", { scale: 0.5, color: 0xd9d4ca }),
    pbrMaterial("forest_leaves_02", { scale: 1 / 3 }),
  ]);
  applyGrime(pavers, { amount: 0.7, moss: 0.5, color: 0x2c2620, scale: 1.0 });
  applyGrime(coping, { amount: 0.9, moss: 0.6, color: 0x3a3226 });
  applyGrime(poolTiles, { amount: 1.1, moss: 0.4, color: 0x2f3a18, scale: 0.7, streaks: 0.6 });
  applyGrime(deck, { amount: 0.8, moss: 0.4, color: 0x2a2219 });
  applyGrime(fence, { amount: 0.6, streaks: 0.5, splash: 0.9, color: 0x3a3020 });
  applyGrime(asphalt, { amount: 0.25, color: 0x222222 });

  // Ground: a big sheet with the pool cut out. Lawn texture under the blades.
  const groundShape = new THREE.Shape();
  groundShape.moveTo(-70, -70); groundShape.lineTo(70, -70); groundShape.lineTo(70, 70); groundShape.lineTo(-70, 70); groundShape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(POOL.x0, POOL.z0); hole.lineTo(POOL.x0, POOL.z1); hole.lineTo(POOL.x1, POOL.z1); hole.lineTo(POOL.x1, POOL.z0); hole.closePath();
  groundShape.holes.push(hole);
  const groundGeo = new THREE.ShapeGeometry(groundShape);
  groundGeo.rotateX(Math.PI / 2); // shape (x, y) → world (x, 0, y); faces end up pointing down, so normals are reset below
  const ground = new THREE.Mesh(groundGeo, soil);
  ground.receiveShadow = true;
  ground.position.y = -0.005;
  bakeWorldUV(ground);
  const nrm = ground.geometry.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  g.add(ground);
  soil.side = THREE.DoubleSide;

  // Street, curb, sidewalk, driveway, path.
  box(g, 140, 0.04, 8, 0, -0.01, 28, asphalt, { cast: false });
  box(g, 140, 0.16, 0.25, 0, 0.06, 24.0, coping);
  box(g, 140, 0.06, 1.5, 0, 0.02, 23.2, sidewalk, { cast: false });
  box(g, DRIVE.x1 - DRIVE.x0, 0.05, DRIVE.z1 - DRIVE.z0, (DRIVE.x0 + DRIVE.x1) / 2, 0.02, (DRIVE.z0 + DRIVE.z1) / 2, pavers, { cast: false });
  box(g, PATH.x1 - PATH.x0, 0.05, PATH.z1 - PATH.z0, (PATH.x0 + PATH.x1) / 2, 0.02, (PATH.z0 + PATH.z1) / 2, overgrown, { cast: false });

  // Oil stains on the driveway: soft dark decals.
  const stainTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!;
    for (let i = 0; i < 9; i++) {
      const gr = x.createRadialGradient(64 + (Math.random() - 0.5) * 50, 64 + (Math.random() - 0.5) * 50, 2, 64, 64, 30 + Math.random() * 30);
      gr.addColorStop(0, "rgba(10,8,6,0.55)");
      gr.addColorStop(1, "rgba(10,8,6,0)");
      x.fillStyle = gr;
      x.fillRect(0, 0, 128, 128);
    }
    const t = new THREE.CanvasTexture(c);
    return t;
  })();
  const stainMat = new THREE.MeshStandardMaterial({ map: stainTex, transparent: true, roughness: 0.25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const [x, z, s] of [[10.3, 8, 2.2], [10.9, 11.5, 1.4], [9.8, 3.5, 1.6], [11.2, 15, 1.2]] as const) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 1.3), stainMat);
    d.rotation.x = -Math.PI / 2;
    d.rotation.z = x;
    d.position.set(x, 0.051, z);
    d.receiveShadow = true;
    g.add(d);
  }

  // Pool: coping ring, tiled shell, murky water with algae and leaves.
  const { x0, x1, z0, z1, depth } = POOL;
  const cw = 0.45;
  box(g, x1 - x0 + 2 * cw, 0.08, cw, (x0 + x1) / 2, 0.04, z1 + cw / 2, coping);
  box(g, x1 - x0 + 2 * cw, 0.08, cw, (x0 + x1) / 2, 0.04, z0 - cw / 2, coping);
  box(g, cw, 0.08, z1 - z0, x0 - cw / 2, 0.04, (z0 + z1) / 2, coping);
  box(g, cw, 0.08, z1 - z0, x1 + cw / 2, 0.04, (z0 + z1) / 2, coping);
  const shell = new THREE.Group();
  box(shell, x1 - x0, 0.1, z1 - z0, (x0 + x1) / 2, -depth - 0.05, (z0 + z1) / 2, poolTiles, { cast: false });
  box(shell, x1 - x0, depth, 0.1, (x0 + x1) / 2, -depth / 2, z1 + 0.05, poolTiles, { cast: false });
  box(shell, x1 - x0, depth, 0.1, (x0 + x1) / 2, -depth / 2, z0 - 0.05, poolTiles, { cast: false });
  box(shell, 0.1, depth, z1 - z0, x0 - 0.05, -depth / 2, (z0 + z1) / 2, poolTiles, { cast: false });
  box(shell, 0.1, depth, z1 - z0, x1 + 0.05, -depth / 2, (z0 + z1) / 2, poolTiles, { cast: false });
  g.add(shell);
  // pool ladder
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9cdd0, metalness: 1, roughness: 0.25 });
  for (const dx of [-0.25, 0.25]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 8, 24, Math.PI), steel);
    rail.position.set(x1 - 1.2 + dx, 0.0, z1 - 0.02);
    rail.rotation.y = Math.PI / 2;
    rail.rotation.z = Math.PI / 2;
    g.add(rail);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8), steel);
    leg.position.set(x1 - 1.2 + dx, -0.6, z1 - 0.42);
    g.add(leg);
  }
  const waterNormal = makeWaterNormal();
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, z1 - z0),
    new THREE.MeshPhysicalMaterial({
      color: 0x34502a, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.9,
      normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.2,
      clearcoat: 0.6, clearcoatRoughness: 0.08,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set((x0 + x1) / 2, POOL.water, (z0 + z1) / 2);
  water.receiveShadow = true;
  g.add(water);
  // algae scum near the edges
  const scum = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: scumTexture(), transparent: true, depthWrite: false, roughness: 0.9 }));
  scum.rotation.x = -Math.PI / 2;
  scum.position.set((x0 + x1) / 2, POOL.water + 0.006, (z0 + z1) / 2);
  scum.receiveShadow = true;
  g.add(scum);

  // Deck with steps down to the lawn.
  const D = DECK, top = HOUSE.floorY - 0.04;
  box(g, D.x1 - D.x0, 0.06, D.z1 - D.z0, (D.x0 + D.x1) / 2, top - 0.03, (D.z0 + D.z1) / 2, deck);
  for (const [px, pz] of [[D.x0 + 0.1, D.z0 + 0.1], [D.x1 - 0.1, D.z0 + 0.1], [D.x0 + 0.1, D.z1 - 0.3], [D.x1 - 0.1, D.z1 - 0.3]]) box(g, 0.12, top, 0.12, px, top / 2, pz, deck);
  box(g, D.x1 - D.x0, top - 0.06, 0.04, (D.x0 + D.x1) / 2, (top - 0.06) / 2, D.z0, deck);
  box(g, 1.6, 0.05, 0.4, 4.5, top / 2, D.z0 - 0.25, deck);

  // Fence around the back yard and up the sides.
  const fenceRun = (ax: number, az: number, bx: number, bz: number): void => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 0.16);
    const alongX = az === bz;
    const r = rng(Math.round(ax * 13 + az * 7));
    const plankGeo = new THREE.BoxGeometry(alongX ? 0.14 : 0.025, 1, alongX ? 0.025 : 0.14);
    const planks = new THREE.InstancedMesh(plankGeo, fence, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const h = 1.75 + (r() - 0.5) * 0.06 - (r() < 0.04 ? 0.5 : 0);
      const lean = (r() - 0.5) * 0.03;
      m.makeRotationAxis(new THREE.Vector3(alongX ? 0 : 1, 0, alongX ? 1 : 0), lean);
      m.scale(new THREE.Vector3(1, h, 1));
      m.setPosition(ax + (bx - ax) * t, h / 2, az + (bz - az) * t);
      planks.setMatrixAt(i, m);
    }
    planks.castShadow = planks.receiveShadow = true;
    g.add(planks);
    for (const y of [0.35, 1.45]) {
      if (alongX) box(g, len, 0.09, 0.05, (ax + bx) / 2, y, az - 0.05, fence);
      else box(g, 0.05, 0.09, len, ax - 0.05 * Math.sign(ax), y, (az + bz) / 2, fence);
    }
  };
  fenceRun(LOT.x0, LOT.z0, LOT.x1, LOT.z0);
  fenceRun(LOT.x0, LOT.z0, LOT.x0, 2);
  fenceRun(LOT.x1, LOT.z0, LOT.x1, -7);

  // Lawn.
  const lawn = buildLawn({
    isLawn,
    mowed: o.mowed,
    stripe: o.stripe,
    bounds: [LOT.x0, LOT.x1, LOT.z0, LOT.z1],
    density: o.grassDensity,
  });
  g.add(lawn);
  // a looser strip of verge grass along the sidewalk and beyond the fence
  const verge = buildLawn({
    isLawn: (x, z) => (z > 24.2 && z < 24.0) || (Math.abs(x) > 16.3 && Math.abs(x) < 40 && z < 22 && z > -40) || (z < -22.3 && z > -40 && Math.abs(x) < 40),
    mowed: () => 0.4,
    bounds: [-40, 40, -40, 22],
    density: o.grassDensity * 0.18,
    seed: 3,
    tall: [0.15, 0.4],
  });
  g.add(verge);

  // Haystack — the needle-in-a-haystack spot.
  g.add(buildHaystack());

  // Trees.
  const leafGreen = foliageMaterial(0.15), leafAutumn = foliageMaterial(0.75);
  const big = buildTree({ seed: 5, height: 11, bark, leafMat: leafAutumn, leaves: 5200 });
  big.position.set(-12, 0, -16);
  g.add(big);
  const front = buildTree({ seed: 9, height: 8.5, bark, leafMat: leafGreen, leaves: 3600 });
  front.position.set(-11.5, 0, 14);
  g.add(front);
  for (const [x, z, s, h] of [[13.5, -19.5, 21, 6.5], [-30, -8, 3, 10], [30, 6, 4, 9], [24, -30, 6, 12], [-26, -32, 8, 11]] as const) {
    const t = buildTree({ seed: s, height: h, bark, leafMat: s % 2 ? leafGreen : leafAutumn, leaves: 2400 });
    t.position.set(x, 0, z);
    g.add(t);
  }

  // Leaves: thick under the big tree, drifting across the back lawn, on the deck, in the pool, in the gutter.
  g.add(buildLeaves({
    count: 9000, seed: 21,
    place: (r) => {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * 9;
      const x = -12 + Math.cos(a) * d * 1.3, z = -16 + Math.sin(a) * d;
      if (!inRect(x, z, LOT) || inRect(x, z, POOL, 0.5)) return null;
      return new THREE.Vector3(x, 0.03 + r() * 0.05, z);
    },
  }));
  g.add(buildLeaves({
    count: 900, seed: 22, tilt: 0.1,
    place: (r) => new THREE.Vector3(POOL.x0 + 0.2 + r() * (POOL.x1 - POOL.x0 - 0.4), POOL.water + 0.01, POOL.z0 + 0.2 + r() * (POOL.z1 - POOL.z0 - 0.4)),
  }));
  g.add(buildLeaves({
    count: 500, seed: 23,
    place: (r) => new THREE.Vector3(D.x0 + r() * (D.x1 - D.x0), top + 0.01, D.z0 + r() * (D.z1 - D.z0)),
  }));
  g.add(buildLeaves({
    count: 400, seed: 24,
    place: (r) => new THREE.Vector3(-14 + r() * 28, 0.04, -21.5 + r() * 2),
  }));

  // A leaf-litter mat under the big tree so the ground there reads brown.
  const litter = new THREE.Mesh(new THREE.CircleGeometry(7.5, 40), leafLitter);
  litter.rotation.x = -Math.PI / 2;
  litter.position.set(-12, 0.004, -16);
  litter.receiveShadow = true;
  bakeWorldUV(litter);
  g.add(litter);

  // Neighbours' houses beyond the fence and across the street.
  await neighbours(g);

  const tick = (t: number): void => {
    waterNormal.offset.set(t * 0.012, t * 0.007);
    (lawn.material as THREE.MeshStandardMaterial).userData.time.value = t;
    (verge.material as THREE.MeshStandardMaterial).userData.time.value = t;
  };
  return { group: g, lawn, water, tick };
}

function makeWaterNormal(): THREE.CanvasTexture {
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

function scumTexture(): THREE.CanvasTexture {
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

function buildHaystack(): THREE.Group {
  const g = new THREE.Group();
  const tex = strawTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, color: 0xf0e0b0 });
  const geo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const bump = 1 + Math.sin(a * 5) * 0.05 + Math.sin(a * 11 + y * 4) * 0.03;
    const shape = Math.pow(y, 0.85);
    p.setXYZ(i, x * HAY.r * bump * (1.05 - 0.15 * y), shape * HAY.h, z * HAY.r * bump * (1.05 - 0.15 * y));
  }
  geo.computeVertexNormals();
  const mound = new THREE.Mesh(geo, mat);
  mound.castShadow = mound.receiveShadow = true;
  g.add(mound);
  // loose straws sticking out and scattered around
  const r = rng(77);
  const n = 2600;
  const straw = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 3), new THREE.MeshStandardMaterial({ color: 0xd9bd72, roughness: 0.8 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const onGround = i > n * 0.6;
    const a = r() * Math.PI * 2;
    if (onGround) {
      const d = HAY.r * (0.95 + r() * 0.8);
      v.set(Math.cos(a) * d, 0.02, Math.sin(a) * d);
      e.set(Math.PI / 2 + (r() - 0.5) * 0.3, 0, a + (r() - 0.5) * 2);
    } else {
      const y = r();
      const rad = HAY.r * (1.02 - 0.17 * y) * Math.sqrt(Math.max(0.02, 1 - y * y));
      v.set(Math.cos(a) * rad, Math.pow(y, 0.85) * HAY.h, Math.sin(a) * rad);
      e.set((r() - 0.5) * 2.4, r() * 3, (r() - 0.5) * 2.4);
    }
    q.setFromEuler(e);
    s.set(1, 0.18 + r() * 0.3, 1);
    m.compose(v, q, s);
    straw.setMatrixAt(i, m);
  }
  straw.castShadow = true;
  g.add(straw);
  g.position.set(HAY.x, 0, HAY.z);
  return g;
}

async function neighbours(g: THREE.Group): Promise<void> {
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

/** Furniture, junk and garden props. Returns once every model is placed. */
export async function placeProps(g: THREE.Object3D): Promise<void> {
  const F = HOUSE.floorY;
  type P = [id: string, x: number, y: number, z: number, rotY?: number, scale?: number];
  const list: P[] = [
    // living room
    ["Sofa_01", -4.6, F, 0.7, 0, 1.1],
    ["ArmChair_01", -1.6, F, 2.0, -Math.PI / 2 + 0.3],
    ["CoffeeTable_01", -4.4, F, 2.0, 0],
    ["WoodenTable_01", -4.4, F, 4.6, Math.PI],
    ["Television_01", -4.4, F + 0.55, 4.6, Math.PI],
    ["wooden_bookshelf_worn", -6.6, F, 2.2, Math.PI / 2],
    ["potted_plant_01", -6.4, F, 4.4],
    ["throw_pillows_01", -5.2, F + 0.45, 0.75],
    ["ceiling_fan", -3.5, F + 2.2, 2.5],
    ["hanging_picture_frame_01", -3.2, F + 1.6, 0.08],
    ["cardboard_box_01", -0.4, F, 4.3, 0.4],
    ["cardboard_box_01", -0.1, F, 3.7, 1.1],
    ["trashbag", 0.3, F, 4.5],
    // kitchen
    ["electric_stove", 6.55, F, 1.2, -Math.PI / 2],
    ["WoodenTable_01", 3.6, F, 2.4, Math.PI / 2],
    ["dining_chair_02", 2.8, F, 2.0, Math.PI / 2],
    ["dining_chair_02", 4.4, F, 2.9, -Math.PI / 2],
    ["potted_plant_04", 4.4, F + 1.02, 4.85],
    // bedroom
    ["vintage_day_bed", -4.6, F, -3.9],
    ["ClassicNightstand_01", -2.8, F, -4.5],
    ["modern_ceiling_lamp_01", -3.5, F + 1.75, -2.5],
    // back hall
    ["Shelf_01", 6.7, F, -2.0, -Math.PI / 2],
    ["plastic_broom", 6.6, F, -4.2, -0.3],
    ["dustpan", 6.2, F, -4.6, 0.5],
    ["multi_cleaner_bottle", 6.75, F + 1.25, -2.2],
    ["metal_tool_chest", 4.0, F, -4.6],
    // yard
    ["garden_gnome", -6.0, 0, 9.5, 0.6],
    ["planter_box_01", -5.5, 0, 6.1],
    ["planter_box_01", 1.5, 0, 6.1],
    ["garden_hose_wall_mounted_01", 7.13, 0.6, -1.0, Math.PI / 2],
    ["exterior_aircon_unit", 7.4, 0, -3.8, Math.PI / 2],
    ["ladder_sectioned_01", 7.45, 0, 3.6, Math.PI / 2],
    ["metal_trash_can", 12.9, 0, 21.0],
    ["metal_trash_can", 13.6, 0, 21.2, 0.8],
    ["wooden_picnic_table", 5.0, F - 0.04, -7.3, Math.PI / 2],
    ["plastic_monobloc_chair_01", 2.4, F - 0.04, -6.6, 0.9],
    ["old_tyre", 4.5, 0, -14.5, 0, 1],
    ["compost_bags", 14.6, 0, -12.0, -0.5],
    ["tree_stump_01", 7.0, 0, -19.0],
    ["rubber_duck_toy", -4.2, POOL.water - 0.03, -12.5, 0.7],
    ["dirty_football", -10.5, 0.08, 6.5],
    ["wooden_crate_01", 13.8, 0, -20.6, 0.2],
    ["wicker_basket_01", 3.0, F - 0.04, -8.9],
    ["watering_can_metal_01", 1.0, 0, 6.2, 1.2],
    ["garden_sprinkler_01", 4.0, 0.02, 12.0],
    ["Lantern_01", 7.6, F - 0.04, -5.6],
    ["shrub_02", 9.2, 0, -21.0, 0, 0.9],
    ["shrub_02", -15.0, 0, -6.0, 1, 0.8],
    ["shrub_02", -15.0, 0, 3.0, 2, 0.7],
    ["dandelion_01", -7.4, 0, 15.0],
    ["dandelion_01", -3.8, 0, 13.0, 1],
    ["dandelion_01", 2.8, 0, 17.5, 2],
    ["weed_plant_02", -2.6, 0.05, 12.0],
    ["weed_plant_02", -1.5, 0.05, 16.0, 1],
    ["weed_plant_02", 10.0, 0.05, 6.0, 2],
    ["grass_medium_02", -1.2, 0.05, 9.0],
    ["grass_medium_02", -2.9, 0.05, 19.0, 1],
    ["grass_medium_01", 8.6, 0.05, 14.0],
    ["grass_medium_01", 12.4, 0.05, 2.0, 2],
  ];
  await Promise.all(list.map(async ([id, x, y, z, rot = 0, s = 1]) => {
    const o = await instance(id);
    o.position.set(x, y, z);
    o.rotation.y = rot;
    o.scale.setScalar(s);
    g.add(o);
  }));
  // dirty carpet in the living room
  const carpetMat = await pbrMaterial("dirty_carpet", { scale: 1 / 0.6 });
  const carpet = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.015, 2.0), carpetMat);
  carpet.position.set(-4.4, F + 0.05, 2.0);
  carpet.receiveShadow = true;
  bakeWorldUV(carpet);
  g.add(carpet);
  // kitchen counter along the right wall with a tiled top
  const [counterTop, cabinet] = await Promise.all([
    pbrMaterial("floor_tiles_06", { scale: 1 / 1.5 }),
    pbrMaterial("wood_floor_worn", { scale: 0.5, color: 0xc9b9a0 }),
  ]);
  applyGrime(counterTop, { amount: 0.8, color: 0x3a2a14, scale: 0.4 });
  applyGrime(cabinet, { amount: 0.5, color: 0x3a2a14 });
  box(g, 0.62, 0.86, 2.6, 6.58, F + 0.43, 3.4, cabinet);
  box(g, 0.66, 0.05, 2.62, 6.56, F + 0.885, 3.4, counterTop);
  box(g, 2.2, 0.86, 0.62, 4.8, F + 0.43, 4.58, cabinet);
  box(g, 2.24, 0.05, 0.66, 4.8, F + 0.885, 4.56, counterTop);
}
