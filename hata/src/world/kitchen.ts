import * as THREE from "three";
import { instance, pbrMaterial } from "../assets";
import { CleanSurface } from "../clean/surface";
import { PAY, TOUGH } from "../content";
import { applyGrime, type GrimeOptions } from "./grime";
import { box } from "./geo";
import { finishSurface, HOUSE, makeSurface, type Restore } from "./house";
import type { WorldIndex } from "./index";

/**
 * The kitchen: base and wall cabinets with doors and handles, a counter with
 * a sink under the window, a tiled backsplash, a stove, a fridge, a drying
 * rack and a stack of dirty dishes. Counter, backsplash and cabinet fronts
 * are rag surfaces; every dish is its own little surface, washed one by one
 * at the sink (see DishStation).
 */

const F = HOUSE.floorY;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const WALL_Z = HOUSE.halfZ - 0.11; // inner face of the front wall
const WALL_X = HOUSE.halfX - 0.11; // inner face of the right wall
export const SINK = { x: 4.4, z: 4.56, top: F + 0.9 };

export interface Dish {
  kind: "plate" | "bowl" | "cup" | "pan";
  mesh: THREE.Group;
  surface: CleanSurface;
  /** Radius of the washable top, metres. */
  r: number;
  /** Rim height above its base. */
  h: number;
  home: THREE.Vector3;
  rack: THREE.Vector3;
  done: boolean;
}

function lathe(points: Array<[number, number]>, seg = 40): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

const DISH_GEO = {
  plate: () => lathe([[0, 0.004], [0.075, 0.003], [0.09, 0], [0.095, 0.006], [0.122, 0.022], [0.124, 0.025], [0.118, 0.026], [0.098, 0.014], [0.08, 0.01], [0, 0.011]]),
  bowl: () => lathe([[0, 0], [0.045, 0], [0.05, 0.006], [0.082, 0.05], [0.085, 0.062], [0.08, 0.063], [0.074, 0.05], [0.045, 0.014], [0, 0.012]]),
  cup: () => lathe([[0, 0], [0.04, 0], [0.046, 0.01], [0.046, 0.09], [0.042, 0.092], [0.039, 0.088], [0.039, 0.012], [0, 0.01]]),
  pan: () => lathe([[0, 0], [0.11, 0], [0.125, 0.008], [0.13, 0.05], [0.124, 0.052], [0.118, 0.012], [0, 0.008]]),
};

export async function buildKitchen(g: THREE.Group, W: WorldIndex, restore: Restore): Promise<Dish[]> {
  const [woodB, counterB, splashB] = await Promise.all([
    pbrMaterial("wood_floor_worn", { scale: 0.7, color: 0xb8c4a8 }),
    pbrMaterial("granite_tile", { scale: 1.2, color: 0xe8e4dc }),
    pbrMaterial("white_bricks", { scale: 1.6 }),
  ]);
  const grease: GrimeOptions = { film: 0.5, amount: 0.9, color: 0x6a5a38, color2: 0x4a3e26, scale: 0.18, streaks: 0.7 };
  const crumbs: GrimeOptions = { film: 0.5, amount: 1, color: 0x5a3a18, color2: 0x7a5a28, scale: 0.12, dust: 0.6 };
  const wood = applyGrime(woodB.clone(), { amount: 0.5, film: 0.25, color: 0x3a2a14 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1, roughness: 0.25 });
  const darkGap = new THREE.MeshStandardMaterial({ color: 0x2a2a26, roughness: 0.9 });
  const add = (m: THREE.Mesh, block = true) => { if (block) W.blockMesh(m); W.solids.push(m); return m; };

  // ── Base cabinets: along the front wall (x 1.15..6.89) and the right wall (z 3.2..4.29).
  // the base run is split so the sink bowl has room under the counter
  const sxa = SINK.x - 0.35, sxb = SINK.x + 0.35;
  const cabFront = add(box(g, sxa - 1.15, 0.86, 0.58, (1.15 + sxa) / 2, F + 0.43, WALL_Z - 0.29, wood));
  add(box(g, WALL_X - sxb, 0.86, 0.58, (sxb + WALL_X) / 2, F + 0.43, WALL_Z - 0.29, wood));
  add(box(g, sxb - sxa, 0.6, 0.58, SINK.x, F + 0.3, WALL_Z - 0.29, wood));
  box(g, sxb - sxa, 0.26, 0.02, SINK.x, F + 0.73, WALL_Z - 0.57, wood);
  const cabSide = add(box(g, 0.58, 0.86, 4.29 - 3.2, WALL_X - 0.29, F + 0.43, (3.2 + 4.29) / 2, wood));
  void cabFront; void cabSide;
  const handle = (x: number, y: number, z: number, alongX: boolean) => {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8), steel);
    h.rotation.z = alongX ? Math.PI / 2 : 0;
    h.position.set(x, y, z);
    g.add(h);
  };
  // door seams and handles on the base fronts
  for (let x = 1.15 + 0.55; x < WALL_X - 0.1; x += 0.55) box(g, 0.008, 0.8, 0.01, x, F + 0.45, WALL_Z - 0.585, darkGap, { cast: false });
  for (let x = 1.15 + 0.27; x < WALL_X - 0.1; x += 0.55) handle(x, F + 0.74, WALL_Z - 0.6, true);
  box(g, WALL_X - 1.15, 0.008, 0.01, (1.15 + WALL_X) / 2, F + 0.66, WALL_Z - 0.585, darkGap, { cast: false });
  for (const z of [3.2 + 0.545]) box(g, 0.01, 0.8, 0.008, WALL_X - 0.585, F + 0.45, z, darkGap, { cast: false });
  handle(WALL_X - 0.6, F + 0.74, 3.47, false);
  handle(WALL_X - 0.6, F + 0.74, 4.0, false);

  // ── Counter top with the sink cut out; one rag surface.
  const counter = makeSurface(W, restore, "kitchen:counter", "Стільниця", "wipe", "counter", V(1.15, F + 0.9, WALL_Z), V(1, 0, 0), V(0, 0, -1), WALL_X - 1.15, WALL_Z - 3.2, 36);
  const cm = counter.material(counterB, crumbs);
  const sx0 = SINK.x - 0.33, sx1 = SINK.x + 0.33, sz0 = SINK.z - 0.23, sz1 = SINK.z + 0.23;
  const tops = [
    box(g, sx0 - 1.15, 0.04, 0.6, (1.15 + sx0) / 2, F + 0.88, WALL_Z - 0.3, cm),
    box(g, WALL_X - sx1, 0.04, 0.6, (sx1 + WALL_X) / 2, F + 0.88, WALL_Z - 0.3, cm),
    box(g, sx1 - sx0, 0.04, sz0 - (WALL_Z - 0.6), SINK.x, F + 0.88, (sz0 + WALL_Z - 0.6) / 2, cm),
    box(g, sx1 - sx0, 0.04, WALL_Z - sz1, SINK.x, F + 0.88, (sz1 + WALL_Z) / 2, cm),
    box(g, 0.6, 0.04, WALL_Z - 0.6 - 3.2, WALL_X - 0.3, F + 0.88, (3.2 + WALL_Z - 0.6) / 2, cm),
  ];
  tops.forEach((m) => add(m, false));
  counter.cover(...tops);
  finishSurface(W, restore, counter);

  // Sink basin: a recessed steel box, faucet over it.
  const basinD = 0.18;
  const bx = box(g, sx1 - sx0 - 0.04, 0.02, sz1 - sz0 - 0.04, SINK.x, F + 0.9 - basinD, SINK.z, steel, { cast: false });
  for (const [w, d, x, z] of [
    [sx1 - sx0, 0.02, SINK.x, sz0 + 0.01], [sx1 - sx0, 0.02, SINK.x, sz1 - 0.01],
    [0.02, sz1 - sz0, sx0 + 0.01, SINK.z], [0.02, sz1 - sz0, sx1 - 0.01, SINK.z],
  ] as const) add(box(g, w, basinD, d, x, F + 0.9 - basinD / 2, z, steel, { cast: false }), false);
  add(bx, false);
  const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.005, 16), darkGap);
  drain.position.set(SINK.x, F + 0.9 - basinD + 0.013, SINK.z);
  g.add(drain);
  const fauBase = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 16), steel);
  fauBase.position.set(SINK.x, F + 0.94, WALL_Z - 0.06);
  const spout = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 0.28, 0), V(0, 0.33, -0.08), V(0, 0.26, -0.2)]), 24, 0.012, 10), steel);
  spout.position.set(SINK.x, F + 0.95, WALL_Z - 0.06);
  const lever = box(g, 0.1, 0.012, 0.02, SINK.x + 0.05, F + 1.0, WALL_Z - 0.06, steel);
  g.add(fauBase, spout);
  void lever;

  // ── Backsplash tiles beside the window (rag surface) and on the side wall.
  const splash = makeSurface(W, restore, "kitchen:splash", "Кахель над стільницею", "wipe", "tiles", V(WALL_X, F + 0.9, WALL_Z - 0.01), V(-1, 0, 0), V(0, 1, 0), WALL_X - 1.15, 0.6, 36);
  const sm = splash.material(splashB, grease);
  const sp = [
    box(g, 3.48 - 1.15, 0.55, 0.02, (1.15 + 3.48) / 2, F + 1.18, WALL_Z - 0.01, sm, { cast: false }),
    box(g, WALL_X - 5.32, 0.55, 0.02, (5.32 + WALL_X) / 2, F + 1.18, WALL_Z - 0.01, sm, { cast: false }),
  ];
  sp.forEach((m) => add(m, false));
  splash.cover(...sp);
  finishSurface(W, restore, splash);
  add(box(g, 0.02, 0.55, WALL_Z - 3.2, WALL_X - 0.01, F + 1.18, (3.2 + WALL_Z) / 2, applyGrime(splashB.clone(), grease), { cast: false }), false);

  // ── Wall cabinets: left of the window on the front wall, and on the right wall.
  const wc = makeSurface(W, restore, "kitchen:cabinets", "Шафки", "wipe", "cabinets", V(3.4, F + 1.45, WALL_Z - 0.35), V(-1, 0, 0), V(0, 1, 0), 3.4 - 1.15, 0.75, 30);
  const wcm = wc.material(woodB, grease);
  const upF = box(g, 3.4 - 1.15, 0.75, 0.35, (1.15 + 3.4) / 2, F + 1.825, WALL_Z - 0.175, [wood, wood, wood, wood, wood, wcm]);
  add(upF, false);
  wc.cover(upF);
  finishSurface(W, restore, wc);
  const wc2 = makeSurface(W, restore, "kitchen:cabinets2", "Шафки над плитою", "wipe", "cabinets", V(WALL_X - 0.35, F + 1.45, 3.2), V(0, 0, 1), V(0, 1, 0), WALL_Z - 3.2, 0.75, 30);
  const wcm2 = wc2.material(woodB, grease);
  const upS = box(g, 0.35, 0.75, WALL_Z - 3.2, WALL_X - 0.175, F + 1.825, (3.2 + WALL_Z) / 2, [wood, wcm2, wood, wood, wood, wood]);
  add(upS, false);
  wc2.cover(upS);
  finishSurface(W, restore, wc2);
  for (let x = 1.15 + 0.5625; x < 3.39; x += 0.5625) box(g, 0.008, 0.72, 0.01, x, F + 1.825, WALL_Z - 0.355, darkGap, { cast: false });
  for (let x = 1.15 + 0.48; x < 3.39; x += 0.5625) handle(x, F + 1.52, WALL_Z - 0.37, false);
  box(g, 0.01, 0.72, 0.008, WALL_X - 0.355, F + 1.825, (3.2 + WALL_Z) / 2, darkGap, { cast: false });
  handle(WALL_X - 0.37, F + 1.52, 3.9, false);
  handle(WALL_X - 0.37, F + 1.52, 4.2, false);

  // ── Stove under the side window, fridge in the corner.
  const stove = await instance("electric_stove");
  stove.position.set(WALL_X - 0.33, F, 2.35);
  stove.rotation.y = -Math.PI / 2;
  g.add(stove);
  W.blockMesh(stove);
  const fridgeMat = applyGrime(new THREE.MeshPhysicalMaterial({ color: 0xeeeeea, roughness: 0.3, clearcoat: 0.4 }), { amount: 0.6, film: 0.35, color: 0x6a5a40, scale: 0.4 });
  const fridge = box(g, 0.7, 1.85, 0.68, 1.5, F + 0.925, 0.45, fridgeMat);
  add(fridge);
  box(g, 0.01, 1.8, 0.008, 1.5 + 0.351, F + 0.95, 0.45, darkGap, { cast: false });
  handle(1.86, F + 1.2, 0.2, false);
  for (const name of ["pot_enamel_01", "vintage_electric_kettle", "jug_01"] as const) {
    try {
      const o = await instance(name);
      if (name === "pot_enamel_01") o.position.set(WALL_X - 0.3, F + 0.88, 2.2);
      if (name === "vintage_electric_kettle") o.position.set(WALL_X - 0.3, F + 0.9, 3.95);
      if (name === "jug_01") o.position.set(1.5, F + 0.9, WALL_Z - 0.25);
      g.add(o);
    } catch { /* optional prop */ }
  }

  // ── Drying rack right of the sink.
  const rack = new THREE.Group();
  const wire = new THREE.MeshStandardMaterial({ color: 0xd8dadc, metalness: 0.9, roughness: 0.3 });
  const rx0 = 4.85, rx1 = 5.75, rz = WALL_Z - 0.3;
  for (let i = 0; i <= 12; i++) {
    const x = rx0 + ((rx1 - rx0) * i) / 12;
    for (const dz of [-0.12, 0.12]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 5), wire);
      p.position.set(x, F + 0.96, rz + dz);
      rack.add(p);
    }
  }
  for (const dz of [-0.12, 0.12]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, rx1 - rx0, 6), wire);
    bar.rotation.z = Math.PI / 2;
    bar.position.set((rx0 + rx1) / 2, F + 0.91, rz + dz);
    rack.add(bar);
  }
  g.add(rack);

  // ── Dishes: plates stacked left of the sink, bowls and cups beside them, a pan.
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xf8f6f0, roughness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.1 });
  const blueRim = new THREE.MeshPhysicalMaterial({ color: 0x3d6a9a, roughness: 0.2, clearcoat: 0.6 });
  const panMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.45, metalness: 0.6 });
  const food: GrimeOptions = { film: 0.65, amount: 1, color: 0x8a3a12, color2: 0x7a6a2a, scale: 0.035, streaks: 0, splash: 0 };
  const burnt: GrimeOptions = { film: 0.8, amount: 1, color: 0x2a1608, color2: 0x5a3a12, scale: 0.04 };
  const dishes: Dish[] = [];
  const doneCount = Math.round(restore("dishes") || 0);
  const spec: Array<{ kind: Dish["kind"]; at: THREE.Vector3 }> = [];
  for (let i = 0; i < 6; i++) spec.push({ kind: "plate", at: V(3.55, F + 0.9 + i * 0.022, WALL_Z - 0.3) });
  spec.push({ kind: "bowl", at: V(3.1, F + 0.9, WALL_Z - 0.4) }, { kind: "bowl", at: V(3.1, F + 0.965, WALL_Z - 0.4) });
  spec.push({ kind: "cup", at: V(2.75, F + 0.9, WALL_Z - 0.45) }, { kind: "cup", at: V(2.85, F + 0.9, WALL_Z - 0.22) }, { kind: "cup", at: V(2.62, F + 0.9, WALL_Z - 0.25) });
  spec.push({ kind: "pan", at: V(WALL_X - 0.3, F + 0.9, 3.55) });
  spec.forEach(({ kind, at }, i) => {
    const geo = DISH_GEO[kind]();
    const r = kind === "plate" ? 0.124 : kind === "bowl" ? 0.085 : kind === "cup" ? 0.046 : 0.13;
    const h = kind === "plate" ? 0.026 : kind === "bowl" ? 0.063 : kind === "cup" ? 0.092 : 0.052;
    const s = new CleanSurface({
      key: `dish:${i}`, name: kind === "plate" ? "Тарілка" : kind === "bowl" ? "Миска" : kind === "cup" ? "Чашка" : "Сковорідка",
      kind: "dish", value: PAY.dish, tough: TOUGH.dish * (kind === "pan" ? 1.6 : 1),
      origin: V(at.x - r, at.y + h * 0.5, at.z + r), u: V(1, 0, 0), v: V(0, 0, -1), w: 2 * r, h: 2 * r, density: 260,
    });
    const base = kind === "pan" ? panMat : ceramic;
    const mat = s.material(base as THREE.MeshStandardMaterial, kind === "pan" ? burnt : food);
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(geo, mat);
    body.castShadow = body.receiveShadow = true;
    mesh.add(body);
    if (kind === "plate" || kind === "bowl") {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.004, 0.0025, 6, 48), blueRim);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = h - 0.001;
      mesh.add(rim);
    }
    if (kind === "cup") {
      const hd = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 8, 20, Math.PI * 1.2), ceramic);
      hd.position.set(0.05, 0.05, 0);
      hd.rotation.z = -Math.PI * 0.6;
      mesh.add(hd);
    }
    if (kind === "pan") {
      const hd = box(mesh, 0.2, 0.02, 0.03, 0.22, 0.04, 0, panMat);
      void hd;
    }
    mesh.position.copy(at);
    g.add(mesh);
    mesh.updateMatrixWorld(true);
    s.cover(body);
    const slot = i;
    const rackPos = V(rx0 + 0.04 + (slot % 12) * ((rx1 - rx0 - 0.08) / 11), F + 0.92, rz);
    const dish: Dish = { kind, mesh, surface: s, r, h, home: at.clone(), rack: rackPos, done: false };
    s.init(i < doneCount ? 1 : 0);
    if (i < doneCount) {
      dish.done = true;
      placeOnRack(dish);
    }
    syncDish(dish);
    dishes.push(dish);
  });
  return dishes;
}

/** Keeps a dish's dirt mask glued to the dish when it moves. */
export function syncDish(d: Dish): void {
  const p = d.mesh.position;
  d.surface.origin.set(p.x - d.r, p.y + d.h * 0.5, p.z + d.r);
  d.surface.binding.offset!.set(-p.x, -p.y, -p.z);
}

export function placeOnRack(d: Dish): void {
  d.mesh.position.copy(d.rack);
  // plates and bowls stand on edge in the rack, cups upside down
  if (d.kind === "plate" || d.kind === "bowl" || d.kind === "pan") d.mesh.rotation.set(0, 0, Math.PI / 2 - 0.12);
  else d.mesh.rotation.set(Math.PI, 0, 0);
  if (d.kind === "plate" || d.kind === "bowl" || d.kind === "pan") d.mesh.position.y += d.r * 0.9;
  else d.mesh.position.y += d.h;
}
