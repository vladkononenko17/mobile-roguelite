import * as THREE from "three";
import { pbrMaterial } from "../assets";
import { applyGrime } from "./grime";
import { box, wall, type Opening } from "./geo";

/**
 * The house: a one-storey cottage with an attic roof, five rooms you can walk
 * through (living room, kitchen, bedroom, bathroom, back hall), real window
 * and door openings, and every surface carrying its own grime layer.
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
};

export interface HouseParts {
  group: THREE.Group;
  /** Meshes the player can wash, keyed by zone. */
  surfaces: Record<string, THREE.Mesh[]>;
}

const op = (from: number, to: number, bottom: number, top: number): Opening => ({ from, to, bottom, top });

export async function buildHouse(): Promise<HouseParts> {
  const g = new THREE.Group();
  g.name = "house";
  const { floorY: F, wallH: H, halfX: X, halfZ: Z } = HOUSE;
  const top = F + H;

  const [siding, plaster, plasterBed, tilesBath, foundation, roof, ceil, fLiving, fKitchen, fBed, fBath, fHall] = await Promise.all([
    pbrMaterial("weathered_plank_siding", { scale: 1 / 1.57, color: 0xf2ece2 }),
    pbrMaterial("painted_plaster_wall", { scale: 0.5, color: 0xf3eadb }),
    pbrMaterial("beige_wall_001", { scale: 1 / 3 }),
    pbrMaterial("square_tiles_03", { scale: 0.5 }),
    pbrMaterial("concrete_floor_02", { scale: 0.5 }),
    pbrMaterial("clay_roof_tiles_02", { scale: 0.4 }),
    pbrMaterial("ceiling_interior", { scale: 0.5 }),
    pbrMaterial("laminate_floor_02", { scale: 1 / 1.7 }),
    pbrMaterial("floor_tiles_06", { scale: 1 / 3 }),
    pbrMaterial("herringbone_parquet", { scale: 1 / 3.4 }),
    pbrMaterial("dirty_tiles", { scale: 1 / 2.26 }),
    pbrMaterial("wood_floor_worn", { scale: 0.5 }),
  ]);
  applyGrime(siding, { amount: 0.95, streaks: 0.9, splash: 0.8, color: 0x463726, scale: 1.4 });
  applyGrime(plaster, { amount: 0.35, color: 0x5a4a38, scale: 0.9 });
  applyGrime(plasterBed, { amount: 0.3, color: 0x5a4a38 });
  applyGrime(tilesBath, { amount: 0.5, color: 0x50463a, scale: 0.5 });
  applyGrime(foundation, { amount: 0.8, splash: 1, moss: 0.4, color: 0x3a3226 });
  applyGrime(roof, { amount: 0.75, moss: 1.1, color: 0x2d281f, scale: 1.6 });
  applyGrime(ceil, { amount: 0.25, color: 0x6a5c48 });
  for (const f of [fLiving, fKitchen, fBed, fHall]) applyGrime(f, { amount: 0.75, dust: 1, color: 0x4f4232, scale: 0.8 });
  applyGrime(fBath, { amount: 0.6, color: 0x4a4030, scale: 0.5 });
  for (const m of [plaster, plasterBed, ceil, fLiving, fKitchen, fBed, fBath, fHall, tilesBath]) m.envMapIntensity = 0.45;

  const trim = applyGrime(new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.55 }), { amount: 0.9, streaks: 0.6, color: 0x4a3c2a, scale: 0.8 });
  const doorMat = applyGrime(new THREE.MeshStandardMaterial({ color: 0x2f5b73, roughness: 0.5 }), { amount: 0.6, color: 0x3a3022 });
  const glass = applyGrime(
    new THREE.MeshStandardMaterial({ color: 0x9cb1ba, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32, envMapIntensity: 1.6 }),
    { amount: 0.85, color: 0x6c5d48, scale: 0.35 },
  );
  const surfaces: Record<string, THREE.Mesh[]> = { siding: [], roof: [], floors: [], windows: [] };

  // Foundation + front steps.
  box(g, 2 * X + 0.4, F, 2 * Z + 0.4, 0, F / 2, 0, foundation);
  box(g, 1.8, F * 0.66, 0.9, -2.1, F * 0.33, Z + 0.62, foundation);
  box(g, 1.8, F * 0.33, 0.5, -2.1, F * 0.165, Z + 1.3, foundation);

  // Exterior walls. Openings are measured from each wall's start.
  const T = 0.22, t = 0.12, e = T / 2;
  const ext = { out: siding, in: plaster, trim };
  surfaces.siding.push(
    ...wall(g, [-X - e, Z], [X + e, Z], F, H, T, [op(4.41, 5.41, 0, 2.1), op(1.31, 3.31, 0.9, 2.25), op(10.61, 12.41, 1.0, 2.25)], ext, 1),
    ...wall(g, [-X - e, -Z], [X + e, -Z], F, H, T, [op(2.11, 4.11, 0.9, 2.25), op(8.11, 8.91, 1.5, 2.1), op(11.61, 12.61, 0, 2.1)], ext, -1),
    ...wall(g, [-X, -Z + e], [-X, Z - e], F, H, T, [op(6.39, 8.19, 0.9, 2.25), op(1.39, 3.19, 0.9, 2.25)], ext, -1),
    ...wall(g, [X, -Z + e], [X, Z - e], F, H, T, [op(6.39, 7.89, 1.0, 2.25), op(1.39, 2.39, 0, 2.1)], ext, 1),
  );

  // Interior walls.
  const int = { out: plaster, in: plaster, trim: plaster };
  wall(g, [-X + e, 0], [X - e, 0], F, H, t, [op(3.0, 3.9, 0, 2.1), op(8.1, 8.9, 0, 2.1), op(11.0, 12.6, 0, 2.3)], { out: plaster, in: plasterBed, trim: plaster }, 1);
  wall(g, [1, t / 2], [1, Z - e], F, H, t, [op(1.0, 3.4, 0, 2.3)], int, 1);
  wall(g, [0, -Z + e], [0, -t / 2], F, H, t, [], { out: tilesBath, in: plasterBed, trim: plaster }, 1);
  wall(g, [3, -Z + e], [3, -t / 2], F, H, t, [], { out: plaster, in: tilesBath, trim: plaster }, 1);

  // Floors.
  const floor = (x0: number, x1: number, z0: number, z1: number, m: THREE.Material): void => {
    surfaces.floors.push(box(g, x1 - x0, 0.04, z1 - z0, (x0 + x1) / 2, F + 0.02, (z0 + z1) / 2, m, { cast: false }));
  };
  floor(-X, 1, 0, Z, fLiving);
  floor(1, X, 0, Z, fKitchen);
  floor(-X, 0, -Z, 0, fBed);
  floor(0, 3, -Z, 0, fBath);
  floor(3, X, -Z, 0, fHall);

  // Ceiling (one slab; its underside is what you see).
  box(g, 2 * X, 0.08, 2 * Z, 0, top + 0.04, 0, ceil, { cast: false });

  // Windows: frame, mullion, glass, sill. Positions in world space.
  const windowAt = (axis: "x" | "z", fixed: number, c: number, w: number, y0: number, y1: number, outward: 1 | -1): void => {
    const h = y1 - y0;
    const cy = F + (y0 + y1) / 2;
    const ft = 0.07, fd = 0.14;
    const parts: Array<[number, number, number, number, number, number]> = [
      // [along, up, depth, offAlong, offUp, offDepth]
      [w, ft, fd, 0, h / 2 - ft / 2, 0],
      [w, ft, fd, 0, -h / 2 + ft / 2, 0],
      [ft, h, fd, -w / 2 + ft / 2, 0, 0],
      [ft, h, fd, w / 2 - ft / 2, 0, 0],
      [0.05, h, 0.08, 0, 0, 0],
      [w + 0.16, 0.05, 0.22, 0, -h / 2 - 0.02, outward * 0.12],
    ];
    for (const [a, u, d, oa, ou, od] of parts) {
      if (axis === "x") box(g, a, u, d, c + oa, cy + ou, fixed + od, trim);
      else box(g, d, u, a, fixed + od, cy + ou, c + oa, trim);
    }
    const gl = axis === "x" ? box(g, w - 0.1, h - 0.1, 0.012, c, cy, fixed, glass, { cast: false }) : box(g, 0.012, h - 0.1, w - 0.1, fixed, cy, c, glass, { cast: false });
    surfaces.windows.push(gl);
  };
  windowAt("x", Z, -4.7, 2, 0.9, 2.25, 1);
  windowAt("x", Z, 4.4, 1.8, 1.0, 2.25, 1);
  windowAt("x", -Z, -4.0, 2, 0.9, 2.25, -1);
  windowAt("x", -Z, 1.4, 0.8, 1.5, 2.1, -1);
  windowAt("z", -X, 2.4, 1.8, 0.9, 2.25, -1);
  windowAt("z", -X, -2.6, 1.8, 0.9, 2.25, -1);
  windowAt("z", X, 2.25, 1.5, 1.0, 2.25, 1);

  // Doors: front door ajar, back and side doors closed, frames in trim.
  const door = (axis: "x" | "z", fixed: number, c: number, w: number, open: number): void => {
    const h = 2.1;
    if (axis === "x") {
      box(g, 0.08, h + 0.08, 0.16, c - w / 2 - 0.04, F + h / 2, fixed, trim);
      box(g, 0.08, h + 0.08, 0.16, c + w / 2 + 0.04, F + h / 2, fixed, trim);
      box(g, w + 0.16, 0.08, 0.16, c, F + h + 0.04, fixed, trim);
    } else {
      box(g, 0.16, h + 0.08, 0.08, fixed, F + h / 2, c - w / 2 - 0.04, trim);
      box(g, 0.16, h + 0.08, 0.08, fixed, F + h / 2, c + w / 2 + 0.04, trim);
      box(g, 0.16, 0.08, w + 0.16, fixed, F + h + 0.04, c, trim);
    }
    const pivot = new THREE.Group();
    if (axis === "x") pivot.position.set(c - w / 2, F, fixed);
    else pivot.position.set(fixed, F, c - w / 2);
    pivot.rotation.y = open;
    g.add(pivot);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(axis === "x" ? w : 0.05, h, axis === "x" ? 0.05 : w), doorMat);
    leaf.position.set(axis === "x" ? w / 2 : 0, h / 2, axis === "x" ? 0 : w / 2);
    leaf.castShadow = leaf.receiveShadow = true;
    pivot.add(leaf);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0xb8954a, metalness: 1, roughness: 0.35 }));
    knob.position.set(axis === "x" ? w - 0.08 : 0.05, 1.0, axis === "x" ? 0.05 : w - 0.08);
    pivot.add(knob);
  };
  door("x", Z, -2.1, 1.0, -1.1);
  door("x", -Z, 5.0, 1.0, 0);
  door("z", X, -3.1, 1.0, 0);

  // Roof: two slabs over the ridge along X, gable ends in siding, fascia boards.
  const R = HOUSE.ridge, oh = 0.55;
  const eaveDrop = (R * oh) / Z;
  const slope = Math.hypot(Z + oh, R + eaveDrop), ang = Math.atan2(R, Z);
  const eaveY = top - eaveDrop;
  for (const s of [1, -1] as const) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2 * X + 2 * oh, 0.14, slope), roof);
    slab.position.set(0, (top + R + eaveY) / 2 + 0.07 / Math.cos(ang), (s * (Z + oh)) / 2);
    slab.rotation.x = s * ang;
    slab.castShadow = slab.receiveShadow = true;
    g.add(slab);
    // world-space-ish UVs along the slope
    const uv = slab.geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * X + 2 * oh) * 0.4, uv.getY(i) * slope * 0.4);
    surfaces.roof.push(slab);
    box(g, 2 * X + 2 * oh, 0.22, 0.04, 0, eaveY - 0.02, s * (Z + oh), trim);
  }
  box(g, 2 * X + 2 * oh + 0.1, 0.12, 0.16, 0, top + R + 0.1, 0, roof);
  const gable = new THREE.Shape([new THREE.Vector2(-Z - 0.02, 0), new THREE.Vector2(Z + 0.02, 0), new THREE.Vector2(0, R)]);
  for (const s of [1, -1] as const) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(gable), siding);
    m.rotation.y = s * Math.PI / 2;
    m.position.set(s * (X + 0.11), top, 0);
    m.castShadow = m.receiveShadow = true;
    const uv = m.geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.57, (uv.getY(i) + top) / 1.57);
    g.add(m);
    surfaces.siding.push(m);
  }
  // Gutters along both eaves.
  const gutterMat = applyGrime(new THREE.MeshStandardMaterial({ color: 0x8c8f8c, metalness: 0.6, roughness: 0.45 }), { amount: 1, moss: 0.6, color: 0x3a3020 });
  for (const s of [1, -1] as const) {
    const gut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2 * X + 2 * oh, 14, 1, true, 0, Math.PI), gutterMat);
    gut.rotation.z = Math.PI / 2;
    gut.rotation.x = s > 0 ? 0 : Math.PI;
    gut.position.set(0, eaveY - 0.08, s * (Z + oh + 0.06));
    gut.material.side = THREE.DoubleSide;
    g.add(gut);
  }
  // Downpipe at the front-right corner.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, top, 10), gutterMat);
  pipe.position.set(X + 0.35, top / 2, Z + 0.62);
  g.add(pipe);

  return { group: g, surfaces };
}
