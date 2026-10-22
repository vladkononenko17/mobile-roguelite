import * as THREE from "three";
import { pbrMaterial } from "../assets";
import { CleanSurface } from "../clean/surface";
import { PAY_PER_M2, TOUGH, type HouseStyle, type WorkKind } from "../content";
import { applyGrime, type GrimeOptions } from "./grime";
import { box, wall, type FaceMats, type Opening } from "./geo";
import type { WorldIndex } from "./index";

/**
 * The house: a one-storey cottage with an attic roof and five rooms you walk
 * through. Every face the player can clean is a CleanSurface with its own
 * dirt mask: four facades (siding + foundation), seven windows, five floors,
 * two roof slopes, bathroom tiles and fixtures; the kitchen is in kitchen.ts.
 *
 * Plan (metres, +z faces the street):
 *
 *   z=+5  ┌──────── living ─────────┬──── kitchen ────┐
 *         │  door x≈-2.1            │                 │
 *   z= 0  ├──── bedroom ───┬─ bath ─┼──── back hall ──┤
 *         │                │        │   back door     │
 *   z=-5  └────────────────┴────────┴─────────────────┘
 *        x=-7             x=0      x=3               x=7
 */

export const HOUSE = {
  floorY: 0.45,
  wallH: 2.75,
  halfX: 7,
  halfZ: 5,
  ridge: 2.5,
  overhang: 0.55,
};

export interface HouseParts {
  group: THREE.Group;
  roofSlabs: THREE.Mesh[];
  /** Height of the roof surface at (x, z), or null when off the roof. */
  roofAt: (x: number, z: number) => number | null;
  doors: { front: HouseDoor; back: HouseDoor; side: HouseDoor };
}

/** A door leaf on its hinge; `open` is the swung-open angle. */
export interface HouseDoor { pivot: THREE.Group; open: number }

export type Restore = (key: string) => number;

const op = (from: number, to: number, bottom: number, top: number): Opening => ({ from, to, bottom, top });
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Creates a surface, binds materials, fills its mask and prices it. */
export function makeSurface(
  _W: WorldIndex, _restore: Restore,
  key: string, name: string, kind: WorkKind, tough: keyof typeof TOUGH | number,
  origin: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, w: number, h: number, density = 22,
): CleanSurface {
  return new CleanSurface({ key, name, kind, value: 0, tough: typeof tough === "number" ? tough : TOUGH[tough], origin, u, v, w, h, density });
}

export function finishSurface(W: WorldIndex, restore: Restore, s: CleanSurface, valueOverride?: number): CleanSurface {
  s.init(restore(s.key));
  s.value = valueOverride ?? Math.max(s.kind === "wipe" ? 120 : 40, Math.round(s.area * (PAY_PER_M2[s.kind] ?? 10) * Math.sqrt(s.tough)));
  W.addSurface(s);
  return s;
}

export async function buildHouse(W: WorldIndex, style: HouseStyle, restore: Restore): Promise<HouseParts> {
  const g = new THREE.Group();
  g.name = "house";
  const { floorY: F, wallH: H, halfX: X, halfZ: Z, ridge: R, overhang: oh } = HOUSE;
  const top = F + H;

  const [sidingB, plasterB, plasterBedB, tilesB, concreteB, roofB, ceilB, fLivingB, fKitchenB, fBedB, fBathB, fHallB] = await Promise.all([
    pbrMaterial("weathered_plank_siding", { scale: 1 / 1.57 }),
    pbrMaterial("painted_plaster_wall", { scale: 0.5, color: 0xfff4e4 }),
    pbrMaterial("beige_wall_001", { scale: 1 / 3, color: 0xfff2dc }),
    pbrMaterial("square_tiles_03", { scale: 0.6, color: 0xeef2f2 }),
    pbrMaterial("concrete_floor_02", { scale: 0.5 }),
    pbrMaterial("clay_roof_tiles_02", { scale: 0.4 }),
    pbrMaterial("ceiling_interior", { scale: 0.5, color: 0xffffff }),
    pbrMaterial("laminate_floor_02", { scale: 1 / 1.7 }),
    pbrMaterial("floor_tiles_06", { scale: 1 / 3 }),
    pbrMaterial("herringbone_parquet", { scale: 1 / 3.4 }),
    pbrMaterial("blue_floor_tiles_01", { scale: 0.7, color: 0xdde6ea }),
    pbrMaterial("wood_floor_worn", { scale: 0.5 }),
  ]);
  for (const m of [plasterB, plasterBedB, ceilB, fLivingB, fKitchenB, fBedB, fBathB, fHallB, tilesB]) m.envMapIntensity = 0.55;

  // Dirt recipes. Facades: a thick grey-brown film with black streaks from
  // the gutters and mud splashed up from the ground; the glass is almost opaque.
  const sidingG: GrimeOptions = { paint: style.siding, film: 0.85, amount: 1, streaks: 1.2, splash: 1.3, color: 0x6e5c3c, color2: 0x4e5634, scale: 0.9 };
  const foundG: GrimeOptions = { film: 0.6, amount: 1, splash: 1.3, moss: 0.6, color: 0x2e281e, color2: 0x1e2416 };
  const floorG: GrimeOptions = { film: 0.75, amount: 1, dust: 1, color: 0x5a4630, color2: 0x4a4436, scale: 0.55 };
  const roofG: GrimeOptions = { paint: style.roof, paintStrength: 0.85, film: 0.75, amount: 1, moss: 1.3, color: 0x221e17, color2: 0x1d2414, scale: 0.6, streaks: 0.5 };
  const glassG: GrimeOptions = { glass: true, film: 0.9, amount: 1, color: 0x6a5c44, color2: 0x4a4434, scale: 0.3, streaks: 0.6 };
  const tileG: GrimeOptions = { film: 0.8, amount: 1, color: 0x6a5a30, color2: 0x3a4a3a, scale: 0.35, streaks: 0.8 };

  const plain = (m: THREE.MeshStandardMaterial, o: GrimeOptions): THREE.MeshStandardMaterial => applyGrime(m.clone(), o);
  const plaster = plain(plasterB, { amount: 0.4, film: 0.1, color: 0x5a4a38, scale: 0.9 });
  const plasterBed = plain(plasterBedB, { amount: 0.35, film: 0.1, color: 0x5a4a38 });
  const ceil = plain(ceilB, { amount: 0.3, film: 0.1, color: 0x6a5c48 });
  const concrete = plain(concreteB, foundG);
  const trim = plain(new THREE.MeshStandardMaterial({ color: style.trim, roughness: 0.55 }), { amount: 0.9, film: 0.4, streaks: 0.6, color: 0x4a3c2a, scale: 0.8 });
  const doorMat = plain(new THREE.MeshStandardMaterial({ color: style.door, roughness: 0.5 }), { amount: 0.7, film: 0.3, color: 0x3a3022 });
  const roofPlain = plain(roofB, roofG);

  const solid = (...ms: THREE.Mesh[]): void => { W.solids.push(...ms); };
  const blocks = (...ms: THREE.Mesh[]): void => { for (const m of ms) { W.blockMesh(m); W.solids.push(m); } };

  // ── Facades: siding + its strip of foundation share one mask per side.
  const T = 0.22, t = 0.12, e = T / 2;
  const facade = (key: string, name: string, origin: THREE.Vector3, u: THREE.Vector3, w: number, withGable: boolean) => {
    const s = makeSurface(W, restore, key, name, "wash", "siding", origin, u, V(0, 1, 0), w, top + (withGable ? R + 0.15 : 0.1) - 0.0, 30);
    return { s, siding: s.material(sidingB, sidingG), found: s.material(concreteB, foundG) };
  };
  const front = facade("facade:front", "Фасад", V(-X - e - 0.2, 0, Z + e), V(1, 0, 0), 2 * X + T + 0.4, false);
  const back = facade("facade:back", "Задня стіна", V(X + e + 0.2, 0, -Z - e), V(-1, 0, 0), 2 * X + T + 0.4, false);
  const left = facade("facade:left", "Ліва стіна", V(-X - e, 0, -Z - e - 0.2), V(0, 0, 1), 2 * Z + T + 0.4, true);
  const right = facade("facade:right", "Права стіна", V(X + e, 0, Z + e + 0.2), V(0, 0, -1), 2 * Z + T + 0.4, true);

  // Foundation: four sides, each outer face in its facade's mask.
  const fs = (f: { found: THREE.Material }, idx: number): FaceMats => {
    const m: FaceMats = [concrete, concrete, concrete, concrete, concrete, concrete];
    m[idx] = f.found;
    return m;
  };
  const fnd = [
    box(g, 2 * X + 0.4, F, 0.2, 0, F / 2, Z + 0.1, fs(front, 4)),
    box(g, 2 * X + 0.4, F, 0.2, 0, F / 2, -Z - 0.1, fs(back, 5)),
    box(g, 0.2, F, 2 * Z, -X - 0.1, F / 2, 0, fs(left, 1)),
    box(g, 0.2, F, 2 * Z, X + 0.1, F / 2, 0, fs(right, 0)),
  ];
  box(g, 2 * X, F - 0.02, 2 * Z, 0, (F - 0.02) / 2, 0, concrete, { cast: false });
  solid(...fnd);
  front.s.cover(fnd[0]); back.s.cover(fnd[1]); left.s.cover(fnd[2]); right.s.cover(fnd[3]);
  // Front steps.
  const st1 = box(g, 1.8, F * 0.66, 0.6, -2.1, F * 0.33, Z + 0.5, concrete);
  const st2 = box(g, 1.8, F * 0.33, 0.5, -2.1, F * 0.165, Z + 1.05, concrete);
  solid(st1, st2);
  W.platforms.push({ x0: -3.0, x1: -1.2, z0: Z + 0.2, z1: Z + 1.3, y: 0, ramp: { axis: "z", from: Z + 1.3, to: Z + 0.25, y0: 0, y1: F } });
  // Side-door step.
  const st3 = box(g, 0.7, F * 0.5, 1.2, X + 0.45, F * 0.25, -3.0, concrete);
  solid(st3);
  W.platforms.push({ x0: X + 0.1, x1: X + 0.8, z0: -3.6, z1: -2.4, y: 0, ramp: { axis: "x", from: X + 0.8, to: X + 0.15, y0: 0, y1: F } });
  // House floor platform.
  W.platforms.push({ x0: -X - 0.2, x1: X + 0.2, z0: -Z - 0.2, z1: Z + 0.2, y: F });

  // Exterior walls (openings measured from each wall's start).
  const pieces = {
    front: wall(g, [-X - e, Z], [X + e, Z], F, H, T, [op(4.41, 5.41, 0, 2.1), op(1.31, 3.31, 0.9, 2.25), op(10.61, 12.41, 1.0, 2.25)], { out: front.siding, in: plaster, trim }, 1),
    back: wall(g, [-X - e, -Z], [X + e, -Z], F, H, T, [op(2.11, 4.11, 0.9, 2.25), op(8.11, 8.91, 1.5, 2.1), op(11.61, 12.61, 0, 2.1)], { out: back.siding, in: plaster, trim }, -1),
    left: wall(g, [-X, -Z + e], [-X, Z - e], F, H, T, [op(6.39, 8.19, 0.9, 2.25), op(1.39, 3.19, 0.9, 2.25)], { out: left.siding, in: plaster, trim }, -1),
    right: wall(g, [X, -Z + e], [X, Z - e], F, H, T, [op(6.39, 7.89, 1.0, 2.25), op(1.39, 2.39, 0, 2.1)], { out: right.siding, in: plaster, trim }, 1),
  };
  for (const ps of Object.values(pieces)) blocks(...ps);
  front.s.cover(...pieces.front); back.s.cover(...pieces.back); left.s.cover(...pieces.left); right.s.cover(...pieces.right);

  // Gables in siding, inside the side facades' masks.
  const gable = new THREE.Shape([new THREE.Vector2(-Z - e, 0), new THREE.Vector2(Z + e, 0), new THREE.Vector2(0, R + 0.02)]);
  for (const [sgn, f] of [[1, right], [-1, left]] as const) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(gable), f.siding);
    m.rotation.y = (sgn * Math.PI) / 2;
    m.position.set(sgn * (X + e), top, 0);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    m.updateMatrixWorld(true);
    const uv = m.geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.57, (uv.getY(i) + top) / 1.57);
    f.s.cover(m);
    solid(m);
  }
  for (const f of [front, back, left, right]) finishSurface(W, restore, f.s);

  // ── Interior walls.
  const tileW1 = makeSurface(W, restore, "bath:tiles1", "Кахель у ванній", "wipe", "tiles", V(t / 2, F, -t / 2), V(0, 0, -1), V(0, 1, 0), Z - e - t / 2, H, 26);
  const tileW2 = makeSurface(W, restore, "bath:tiles2", "Кахель біля ванни", "wipe", "tiles", V(3 - t / 2, F, -Z + e), V(0, 0, 1), V(0, 1, 0), Z - e - t / 2, H, 26);
  const tm1 = tileW1.material(tilesB, tileG), tm2 = tileW2.material(tilesB, tileG);
  const int = { out: plaster, in: plaster, trim: plaster };
  blocks(...wall(g, [-X + e, 0], [X - e, 0], F, H, t, [op(3.0, 3.9, 0, 2.1), op(8.1, 8.9, 0, 2.1), op(11.0, 12.6, 0, 2.3)], { out: plaster, in: plasterBed, trim: plaster }, 1));
  blocks(...wall(g, [1, t / 2], [1, Z - e], F, H, t, [op(1.0, 3.4, 0, 2.3)], int, 1));
  const bw1 = wall(g, [0, -Z + e], [0, -t / 2], F, H, t, [], { out: tm1, in: plasterBed, trim: plaster }, 1);
  const bw2 = wall(g, [3, -Z + e], [3, -t / 2], F, H, t, [], { out: plaster, in: tm2, trim: plaster }, 1);
  blocks(...bw1, ...bw2);
  tileW1.cover(...bw1);
  tileW2.cover(...bw2);
  finishSurface(W, restore, tileW1);
  finishSurface(W, restore, tileW2);

  // ── Floors: one surface per room.
  const floor = (key: string, name: string, x0: number, x1: number, z0: number, z1: number, base: THREE.MeshStandardMaterial): void => {
    const s = makeSurface(W, restore, key, name, "mop", "floor", V(x0, F + 0.04, z1), V(1, 0, 0), V(0, 0, -1), x1 - x0, z1 - z0, 28);
    const m = box(g, x1 - x0, 0.04, z1 - z0, (x0 + x1) / 2, F + 0.02, (z0 + z1) / 2, s.material(base, floorG), { cast: false });
    s.cover(m);
    finishSurface(W, restore, s);
  };
  floor("floor:living", "Підлога у вітальні", -X, 1, 0, Z, fLivingB);
  floor("floor:kitchen", "Підлога на кухні", 1, X, 0, Z, fKitchenB);
  floor("floor:bed", "Підлога в спальні", -X, 0, -Z, 0, fBedB);
  floor("floor:bath", "Підлога у ванній", 0, 3, -Z, 0, fBathB);
  floor("floor:hall", "Підлога в коридорі", 3, X, -Z, 0, fHallB);

  // Ceiling.
  box(g, 2 * X, 0.08, 2 * Z, 0, top + 0.04, 0, ceil, { cast: false });

  // ── Windows: frame, mullion, sill, and the pane as a glass surface.
  let wi = 0;
  const windowAt = (axis: "x" | "z", fixed: number, c: number, w: number, y0: number, y1: number, outward: 1 | -1, name: string): void => {
    const h = y1 - y0, cy = F + (y0 + y1) / 2, ft = 0.07, fd = 0.14;
    const parts: Array<[number, number, number, number, number, number]> = [
      [w, ft, fd, 0, h / 2 - ft / 2, 0], [w, ft, fd, 0, -h / 2 + ft / 2, 0],
      [ft, h, fd, -w / 2 + ft / 2, 0, 0], [ft, h, fd, w / 2 - ft / 2, 0, 0],
      [0.05, h, 0.08, 0, 0, 0], [w + 0.16, 0.05, 0.22, 0, -h / 2 - 0.02, outward * 0.12],
    ];
    for (const [a, uu, d, oa, ou, od] of parts) {
      solid(axis === "x" ? box(g, a, uu, d, c + oa, cy + ou, fixed + od, trim) : box(g, d, uu, a, fixed + od, cy + ou, c + oa, trim));
    }
    const key = `glass:${wi++}`;
    // u × v = outward normal
    const u = axis === "x" ? V(outward, 0, 0) : V(0, 0, -outward);
    const origin = axis === "x" ? V(c - outward * w / 2, F + y0, fixed) : V(fixed, F + y0, c + outward * w / 2);
    const s = makeSurface(W, restore, key, name, "glass", "glass", origin, u, V(0, 1, 0), w, h, 40);
    const glassMat = s.material(new THREE.MeshStandardMaterial({ color: 0xa8bcc4, roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.25, envMapIntensity: 1.8 }), glassG);
    const pane = axis === "x" ? box(g, w - 0.1, h - 0.1, 0.012, c, cy, fixed, glassMat, { cast: false }) : box(g, 0.012, h - 0.1, w - 0.1, fixed, cy, c, glassMat, { cast: false });
    s.cover(pane);
    finishSurface(W, restore, s);
  };
  windowAt("x", Z, -4.7, 2, 0.9, 2.25, 1, "Вікно вітальні");
  windowAt("x", Z, 4.4, 1.8, 1.0, 2.25, 1, "Вікно кухні");
  windowAt("x", -Z, -4.0, 2, 0.9, 2.25, -1, "Вікно спальні");
  windowAt("x", -Z, 1.4, 0.8, 1.5, 2.1, -1, "Вікно ванної");
  windowAt("z", -X, 2.4, 1.8, 0.9, 2.25, -1, "Бічне вікно вітальні");
  windowAt("z", -X, -2.6, 1.8, 0.9, 2.25, -1, "Бічне вікно спальні");
  windowAt("z", X, 2.25, 1.5, 1.0, 2.25, 1, "Бічне вікно кухні");

  // ── Doors.
  const door = (axis: "x" | "z", fixed: number, c: number, w: number, open: number): HouseDoor => {
    const h = 2.1;
    if (axis === "x") {
      solid(box(g, 0.08, h + 0.08, 0.16, c - w / 2 - 0.04, F + h / 2, fixed, trim), box(g, 0.08, h + 0.08, 0.16, c + w / 2 + 0.04, F + h / 2, fixed, trim), box(g, w + 0.16, 0.08, 0.16, c, F + h + 0.04, fixed, trim));
    } else {
      solid(box(g, 0.16, h + 0.08, 0.08, fixed, F + h / 2, c - w / 2 - 0.04, trim), box(g, 0.16, h + 0.08, 0.08, fixed, F + h / 2, c + w / 2 + 0.04, trim), box(g, 0.16, 0.08, w + 0.16, fixed, F + h + 0.04, c, trim));
    }
    const pivot = new THREE.Group();
    pivot.userData.dynamic = true; // doors swing open with the stages
    if (axis === "x") pivot.position.set(c - w / 2, F, fixed);
    else pivot.position.set(fixed, F, c - w / 2);
    pivot.rotation.y = open;
    g.add(pivot);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(axis === "x" ? w : 0.05, h, axis === "x" ? 0.05 : w), doorMat);
    leaf.position.set(axis === "x" ? w / 2 : 0, h / 2, axis === "x" ? 0 : w / 2);
    leaf.castShadow = leaf.receiveShadow = true;
    pivot.add(leaf);
    solid(leaf); // the crosshair stops at a door instead of reaching through it
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0xb8954a, metalness: 1, roughness: 0.35 }));
    knob.position.set(axis === "x" ? w - 0.08 : 0.05, 1.0, axis === "x" ? 0.05 : w - 0.08);
    pivot.add(knob);
    return { pivot, open };
  };
  // doors start open; the stage gates close the ones that aren't reachable yet
  const doors = {
    front: door("x", Z, -2.1, 1.0, -1.35),
    back: door("x", -Z, 5.0, 1.0, 1.35),
    side: door("z", X, -3.0, 1.0, -1.35),
  };

  // ── Roof: two slopes, each a wash surface (moss!), fascia, ridge, gutters.
  const eaveDrop = (R * oh) / Z;
  const slope = Math.hypot(Z + oh, R + eaveDrop), ang = Math.atan2(R, Z);
  const eaveY = top - eaveDrop;
  const L = 2 * X + 2 * oh;
  const roofSlabs: THREE.Mesh[] = [];
  for (const sgn of [1, -1] as const) {
    const slab: THREE.Mesh<THREE.BoxGeometry, THREE.Material | THREE.Material[]> = new THREE.Mesh(new THREE.BoxGeometry(L, 0.14, slope), roofPlain);
    slab.position.set(0, (top + R + eaveY) / 2 + 0.07 / Math.cos(ang), (sgn * (Z + oh)) / 2);
    slab.rotation.x = sgn * ang;
    g.add(slab);
    slab.updateMatrixWorld(true);
    // plane of the top face: local (−L/2, 0.07, +slope/2), u = local +x, v = local −z
    const o = slab.localToWorld(V(-L / 2, 0.07, slope / 2));
    const u = V(1, 0, 0).transformDirection(slab.matrixWorld);
    const v = V(0, 0, -1).transformDirection(slab.matrixWorld);
    if (sgn < 0) {
      // keep u × v pointing up: walk the other way along x
      o.copy(slab.localToWorld(V(L / 2, 0.07, -slope / 2)));
      u.negate(); v.negate();
    }
    const s = makeSurface(W, restore, sgn > 0 ? "roof:front" : "roof:back", sgn > 0 ? "Дах спереду" : "Дах ззаду", "wash", "roof", o, u, v, L, slope, 22);
    slab.material = [roofPlain, roofPlain, s.material(roofB, roofG), roofPlain, roofPlain, roofPlain];
    slab.castShadow = slab.receiveShadow = true;
    const uv = slab.geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L * 0.4, uv.getY(i) * slope * 0.4);
    s.cover(slab);
    finishSurface(W, restore, s);
    roofSlabs.push(slab);
    solid(box(g, L, 0.22, 0.04, 0, eaveY - 0.02, sgn * (Z + oh), trim));
  }
  solid(box(g, L + 0.1, 0.12, 0.16, 0, top + R + 0.1, 0, roofPlain));
  const gutterMat = plain(new THREE.MeshStandardMaterial({ color: 0x8c8f8c, metalness: 0.6, roughness: 0.45 }), { amount: 1, film: 0.5, moss: 0.8, color: 0x3a3020 });
  for (const sgn of [1, -1] as const) {
    const gut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, L, 14, 1, true, 0, Math.PI), gutterMat);
    gut.rotation.z = Math.PI / 2;
    gut.rotation.x = sgn > 0 ? 0 : Math.PI;
    gut.position.set(0, eaveY - 0.08, sgn * (Z + oh + 0.06));
    (gut.material as THREE.Material).side = THREE.DoubleSide;
    g.add(gut);
  }
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, top, 10), gutterMat);
  pipe.position.set(X + 0.35, top / 2, Z + 0.62);
  g.add(pipe);

  const roofAt = (x: number, z: number): number | null => {
    if (Math.abs(x) > X + oh - 0.15 || Math.abs(z) > Z + oh - 0.1) return null;
    const d = Math.abs(z);
    return top + R - (d / Z) * R + 0.07 / Math.cos(ang) + 0.07;
  };

  await buildBathroom(g, W, restore, tilesB, concreteB);
  return { group: g, roofSlabs, roofAt, doors };
}

/** Bathtub, washbasin and toilet — white ceramic with a grimy ring, wiped with the rag. */
async function buildBathroom(g: THREE.Group, W: WorldIndex, restore: Restore, tilesB: THREE.MeshStandardMaterial, _c: THREE.MeshStandardMaterial): Promise<void> {
  const F = HOUSE.floorY;
  const ceramicB = new THREE.MeshPhysicalMaterial({ color: 0xf6f6f2, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  const scale: GrimeOptions = { film: 0.6, amount: 1, color: 0x7a6230, color2: 0x4a5a3a, scale: 0.18, streaks: 0.5 };
  // Tub along the back wall of the bathroom: x 0.1..1.8, z −4.9..−4.1
  const tub = makeSurface(W, restore, "bath:tub", "Ванна", "wipe", "fixture", V(0.1, F + 0.6, -4.05), V(1, 0, 0), V(0, 0, -1), 1.75, 0.9, 40);
  const tubM = tub.material(ceramicB, scale);
  const plainC = applyGrime(ceramicB.clone(), { ...scale, amount: 0.4 });
  const tx0 = 0.12, tx1 = 1.85, tz0 = -4.88, tz1 = -4.12;
  const tubParts = [
    box(g, tx1 - tx0, 0.06, tz1 - tz0, (tx0 + tx1) / 2, F + 0.12, (tz0 + tz1) / 2, tubM), // bottom (inside)
    box(g, tx1 - tx0, 0.55, 0.08, (tx0 + tx1) / 2, F + 0.3, tz1, [plainC, plainC, tubM, plainC, plainC, tubM]),
    box(g, tx1 - tx0, 0.55, 0.08, (tx0 + tx1) / 2, F + 0.3, tz0, [plainC, plainC, tubM, plainC, tubM, plainC]),
    box(g, 0.08, 0.55, tz1 - tz0, tx0, F + 0.3, (tz0 + tz1) / 2, [tubM, plainC, tubM, plainC, plainC, plainC]),
    box(g, 0.08, 0.55, tz1 - tz0, tx1, F + 0.3, (tz0 + tz1) / 2, [plainC, tubM, tubM, plainC, plainC, plainC]),
  ];
  tub.cover(...tubParts);
  finishSurface(W, restore, tub);
  for (const p of tubParts) { W.blockMesh(p); W.solids.push(p); }
  // Washbasin on a cabinet by the door side: x 2.3..2.9, z −1.2..−0.6
  const basin = makeSurface(W, restore, "bath:basin", "Умивальник", "wipe", "fixture", V(2.25, F + 0.85, -0.55), V(1, 0, 0), V(0, 0, -1), 0.7, 0.7, 50);
  const bm = basin.material(ceramicB, scale);
  const cab = box(g, 0.55, 0.8, 0.5, 2.6, F + 0.4, -0.9, applyGrime(new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.5 }), { amount: 0.5, film: 0.3, color: 0x5a4a30 }));
  const top = box(g, 0.62, 0.06, 0.56, 2.6, F + 0.83, -0.9, bm);
  const bowl = box(g, 0.36, 0.02, 0.3, 2.6, F + 0.865, -0.9, new THREE.MeshStandardMaterial({ color: 0xc9cfd2, roughness: 0.2, metalness: 0.2 }));
  basin.cover(top);
  finishSurface(W, restore, basin);
  W.blockMesh(cab); W.solids.push(cab, top, bowl);
  // mirror above it
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.65), new THREE.MeshStandardMaterial({ color: 0xdfe8ea, metalness: 1, roughness: 0.05 }));
  mirror.position.set(2.93, F + 1.5, -0.9);
  mirror.rotation.y = -Math.PI / 2;
  g.add(mirror);
  // Toilet: x ≈ 2.55, z ≈ −3.5
  const toilet = makeSurface(W, restore, "bath:toilet", "Унітаз", "wipe", "fixture", V(2.25, F + 0.42, -3.1), V(1, 0, 0), V(0, 0, -1), 0.6, 0.8, 50);
  const tm = toilet.material(ceramicB, { ...scale, color: 0x6a5020 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.4, 20), plainC);
  base.position.set(2.55, F + 0.2, -3.5);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 24), tm);
  seat.scale.set(1, 1, 1.3);
  seat.position.set(2.55, F + 0.42, -3.45);
  const tank = box(g, 0.42, 0.42, 0.18, 2.55, F + 0.62, -3.85, plainC);
  g.add(base, seat);
  for (const o of [base, seat]) { o.castShadow = o.receiveShadow = true; }
  toilet.cover(seat);
  finishSurface(W, restore, toilet);
  W.blockMesh(base); W.blockMesh(tank); W.solids.push(base, seat, tank);
  void tilesB;
}
