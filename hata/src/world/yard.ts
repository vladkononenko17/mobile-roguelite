import * as THREE from "three";
import { instance, pbrMaterial } from "../assets";
import { Lawn } from "../clean/lawn";
import { LeafField } from "../clean/leaffield";
import { PAY, type HouseStyle } from "../content";
import { applyGrime, type GrimeOptions } from "./grime";
import { bakeWorldUV, box, rng } from "./geo";
import { finishSurface, HOUSE, makeSurface, type Restore } from "./house";
import type { WorldIndex } from "./index";
import { proxyBox } from "./index";
import { buildHaystack, flowerBeds, HAY, horizon, inBed, makeWaterNormal, neighbours, scumTexture } from "./scenery";
import { buildTree, foliageMaterial } from "./tree";

export { HAY };

/**
 * The plot around the house: front lawn to the street, a driveway along the
 * east side, a back yard behind a plank fence with a neglected pool, a deck,
 * a big tree dropping leaves, a haystack and the usual junk.
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
export const PUMP = { x: -0.2, z: -15.6 };
export const LADDER = { x: 7.45, z: 3.6 };

const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }, m = 0): boolean =>
  x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

export function isLawn(x: number, z: number): boolean {
  if (!inRect(x, z, LOT)) return false;
  if (Math.abs(x) < HOUSE.halfX + 0.5 && Math.abs(z) < HOUSE.halfZ + 0.5) return false;
  if (inRect(x, z, DRIVE, 0.15) || inRect(x, z, PATH, 0.1)) return false;
  if (inRect(x, z, POOL, 0.55) || inRect(x, z, DECK, 0.1)) return false;
  if (Math.hypot(x - HAY.x, z - HAY.z) < HAY.r * 0.95) return false;
  if (z > 4 && z < 6.7 && x > -3.2 && x < -1) return false; // front steps
  if (inBed(x, z, 0.05)) return false;
  return true;
}

export const LAWN_ZONES = [
  { key: "lawn:front", name: "Газон перед хатою" },
  { key: "lawn:back", name: "Газон за хатою" },
  { key: "lawn:side", name: "Газон збоку" },
];
const zoneOf = (_x: number, z: number): number => (z > HOUSE.halfZ + 0.3 ? 0 : z < -HOUSE.halfZ - 0.3 ? 1 : 2);

export interface YardParts {
  group: THREE.Group;
  lawn: Lawn;
  leaves: LeafField[];
  poolLeaves: LeafField;
  water: THREE.Mesh;
  /** 0 = green swamp, 1 = clean blue water. */
  setPoolClean: (k: number) => void;
  tick: (t: number, dt: number) => void;
}

export interface YardOptions {
  grassDensity: number;
  seed: number;
}

export async function buildYard(W: WorldIndex, style: HouseStyle, restore: Restore, o: YardOptions): Promise<YardParts> {
  const g = new THREE.Group();
  g.name = "yard";
  const [soil, paversB, overgrownB, asphalt, concreteB, poolTilesB, deckB, fenceB, bark, sidewalk, leafLitter] = await Promise.all([
    pbrMaterial("grass_ground", { scale: 1 / 2.5, color: 0xa8c088 }),
    pbrMaterial("patterned_concrete_pavers", { scale: 1 / 1.8 }),
    pbrMaterial("overgrown_concrete_pavers", { scale: 0.5 }),
    pbrMaterial("asphalt_02", { scale: 1 / 3 }),
    pbrMaterial("concrete_floor_02", { scale: 0.5, color: 0xe2ddd2 }),
    pbrMaterial("blue_floor_tiles_01", { scale: 0.5 }),
    pbrMaterial("weathered_brown_planks", { scale: 1 / 1.8, color: 0xe0c8a8 }),
    pbrMaterial("weathered_brown_planks", { scale: 1 / 1.8, color: 0xd8cbb8 }),
    pbrMaterial("bark_brown_02", { scale: 1 }),
    pbrMaterial("concrete_floor_02", { scale: 0.5, color: 0xd9d4ca }),
    pbrMaterial("forest_leaves_02", { scale: 1 / 3 }),
  ]);
  const pavingG: GrimeOptions = { film: 0.8, amount: 1, moss: 0.9, color: 0x1e1a14, color2: 0x23281a, scale: 0.8, dust: 0.4 };
  const deckG: GrimeOptions = { film: 0.85, amount: 1, moss: 1.0, color: 0x1c1712, color2: 0x24301a, scale: 0.7 };
  applyGrime(asphalt, { amount: 0.25, color: 0x222222 });
  const fencePlain = applyGrime(fenceB.clone(), { film: 0.4, amount: 1, streaks: 0.6, splash: 1.0, color: 0x2a2418, color2: 0x253018 });

  // ── Ground: a big sheet with the pool cut out.
  const groundShape = new THREE.Shape();
  groundShape.moveTo(-200, -200); groundShape.lineTo(200, -200); groundShape.lineTo(200, 200); groundShape.lineTo(-200, 200); groundShape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(POOL.x0, -POOL.z1); hole.lineTo(POOL.x1, -POOL.z1); hole.lineTo(POOL.x1, -POOL.z0); hole.lineTo(POOL.x0, -POOL.z0); hole.closePath();
  groundShape.holes.push(hole);
  const groundGeo = new THREE.ShapeGeometry(groundShape);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, soil);
  ground.receiveShadow = true;
  ground.position.y = -0.005;
  bakeWorldUV(ground);
  g.add(ground);
  W.solids.push(ground);

  // ── Street, curb, sidewalk.
  W.solids.push(box(g, 140, 0.04, 8, 0, -0.01, 28, asphalt, { cast: false }));
  W.solids.push(box(g, 140, 0.16, 0.25, 0, 0.06, 24.0, concreteB));
  W.solids.push(box(g, 140, 0.06, 1.5, 0, 0.02, 23.2, sidewalk, { cast: false }));

  // ── Driveway with oil stains and the path: wash surfaces.
  const drive = makeSurface(W, restore, "drive", "Заїзд", "wash", "driveway", new THREE.Vector3(DRIVE.x0, 0.05, DRIVE.z1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), DRIVE.x1 - DRIVE.x0, DRIVE.z1 - DRIVE.z0, 12);
  const driveMesh = box(g, DRIVE.x1 - DRIVE.x0, 0.05, DRIVE.z1 - DRIVE.z0, (DRIVE.x0 + DRIVE.x1) / 2, 0.025, (DRIVE.z0 + DRIVE.z1) / 2, drive.material(paversB, { ...pavingG, splash: 0, film: 0.7 }), { cast: false });
  drive.cover(driveMesh);
  finishSurface(W, restore, drive);
  const path = makeSurface(W, restore, "path", "Доріжка до хвіртки", "wash", "path", new THREE.Vector3(PATH.x0, 0.05, PATH.z1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), PATH.x1 - PATH.x0, PATH.z1 - PATH.z0, 16);
  const pathMesh = box(g, PATH.x1 - PATH.x0, 0.05, PATH.z1 - PATH.z0, (PATH.x0 + PATH.x1) / 2, 0.025, (PATH.z0 + PATH.z1) / 2, path.material(overgrownB, pavingG), { cast: false });
  path.cover(pathMesh);
  finishSurface(W, restore, path);
  // Oil stains: dark decals the washer has to fight (part of the driveway look).
  const stainTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!;
    for (let i = 0; i < 9; i++) {
      const gr = x.createRadialGradient(64 + (Math.random() - 0.5) * 50, 64 + (Math.random() - 0.5) * 50, 2, 64, 64, 30 + Math.random() * 30);
      gr.addColorStop(0, "rgba(10,8,6,0.5)");
      gr.addColorStop(1, "rgba(10,8,6,0)");
      x.fillStyle = gr;
      x.fillRect(0, 0, 128, 128);
    }
    return new THREE.CanvasTexture(c);
  })();
  const stainMat = new THREE.MeshStandardMaterial({ map: stainTex, transparent: true, roughness: 0.25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const stains: THREE.Mesh[] = [];
  for (const [x, z, s] of [[10.3, 8, 2.2], [10.9, 11.5, 1.4], [9.8, 3.5, 1.6], [11.2, 15, 1.2]] as const) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 1.3), stainMat.clone());
    d.rotation.x = -Math.PI / 2;
    d.rotation.z = x;
    d.position.set(x, 0.052, z);
    d.receiveShadow = true;
    g.add(d);
    stains.push(d);
  }
  // stains fade as the driveway gets clean
  const driveTick = () => {
    const k = drive.share();
    for (const s of stains) (s.material as THREE.MeshStandardMaterial).opacity = 1 - k;
  };

  // ── Pool: coping (wash), tiled shell, water that turns from swamp to blue.
  const { x0, x1, z0, z1, depth } = POOL;
  const cw = 0.45;
  const coping = makeSurface(W, restore, "pool:coping", "Бортик басейну", "wash", "coping", new THREE.Vector3(x0 - cw, 0.08, z1 + cw), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), x1 - x0 + 2 * cw, z1 - z0 + 2 * cw, 18);
  const copM = coping.material(concreteB, pavingG);
  const cps = [
    box(g, x1 - x0 + 2 * cw, 0.08, cw, (x0 + x1) / 2, 0.04, z1 + cw / 2, copM),
    box(g, x1 - x0 + 2 * cw, 0.08, cw, (x0 + x1) / 2, 0.04, z0 - cw / 2, copM),
    box(g, cw, 0.08, z1 - z0, x0 - cw / 2, 0.04, (z0 + z1) / 2, copM),
    box(g, cw, 0.08, z1 - z0, x1 + cw / 2, 0.04, (z0 + z1) / 2, copM),
  ];
  coping.cover(...cps);
  finishSurface(W, restore, coping);
  const poolTiles = applyGrime(poolTilesB.clone(), { film: 0.7, amount: 1, moss: 0.6, color: 0x2f3a18, color2: 0x1e2a10, scale: 0.7, streaks: 0.6 });
  const shell = new THREE.Group();
  box(shell, x1 - x0, 0.1, z1 - z0, (x0 + x1) / 2, -depth - 0.05, (z0 + z1) / 2, poolTiles, { cast: false });
  box(shell, x1 - x0, depth, 0.1, (x0 + x1) / 2, -depth / 2, z1 + 0.05, poolTiles, { cast: false });
  box(shell, x1 - x0, depth, 0.1, (x0 + x1) / 2, -depth / 2, z0 - 0.05, poolTiles, { cast: false });
  box(shell, 0.1, depth, z1 - z0, x0 - 0.05, -depth / 2, (z0 + z1) / 2, poolTiles, { cast: false });
  box(shell, 0.1, depth, z1 - z0, x1 + 0.05, -depth / 2, (z0 + z1) / 2, poolTiles, { cast: false });
  g.add(shell);
  W.block(x0 - 0.05, x1 + 0.05, z0 - 0.05, z1 + 0.05, -2, 0.5);
  W.platforms.push({ x0: x0 - cw, x1: x1 + cw, z0: z0 - cw, z1: z1 + cw, y: 0.08 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9cdd0, metalness: 1, roughness: 0.25 });
  for (const dx of [-0.25, 0.25]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 8, 24, Math.PI), steel);
    rail.position.set(x1 - 1.2 + dx, 0.0, z1 - 0.02);
    rail.rotation.set(0, Math.PI / 2, Math.PI / 2);
    g.add(rail);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8), steel);
    leg.position.set(x1 - 1.2 + dx, -0.6, z1 - 0.42);
    g.add(leg);
  }
  const waterNormal = makeWaterNormal();
  const swamp = new THREE.Color(0x26361a), blue = new THREE.Color(0x2d8fb0);
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: swamp.clone(), roughness: 0.08, metalness: 0, transparent: true, opacity: 0.96,
    normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.2, clearcoat: 0.6, clearcoatRoughness: 0.08,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set((x0 + x1) / 2, POOL.water, (z0 + z1) / 2);
  water.receiveShadow = true;
  water.name = "water";
  g.add(water);
  W.solids.push(water);
  const scumMat = new THREE.MeshStandardMaterial({ map: scumTexture(), transparent: true, depthWrite: false, roughness: 0.9 });
  const scum = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), scumMat);
  scum.rotation.x = -Math.PI / 2;
  scum.position.set((x0 + x1) / 2, POOL.water + 0.006, (z0 + z1) / 2);
  g.add(scum);
  const setPoolClean = (k: number): void => {
    waterMat.color.copy(swamp).lerp(blue, k);
    waterMat.opacity = 0.96 - 0.3 * k;
    scumMat.opacity = 1 - k;
    poolTiles.userData.grime.gAmount.value = 1 - 0.85 * k;
  };
  setPoolClean(restore("pool:chem") >= 1 ? 1 : 0);
  // Pump box with the chemicals.
  const pump = box(g, 0.6, 0.55, 0.45, PUMP.x, 0.275, PUMP.z, applyGrime(new THREE.MeshStandardMaterial({ color: 0x2f6a8a, roughness: 0.5 }), { amount: 0.8, film: 0.5, color: 0x3a3020 }));
  W.blockMesh(pump); W.solids.push(pump);

  // ── Deck with steps down to the lawn: a wash surface.
  const D = DECK, top = HOUSE.floorY - 0.04;
  const deck = makeSurface(W, restore, "deck", "Тераса", "wash", "deck", new THREE.Vector3(D.x0, top, D.z1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), D.x1 - D.x0, D.z1 - D.z0, 18);
  const deckM = deck.material(deckB, deckG);
  const deckPlain = applyGrime(deckB.clone(), deckG);
  const deckTop = box(g, D.x1 - D.x0, 0.06, D.z1 - D.z0, (D.x0 + D.x1) / 2, top - 0.03, (D.z0 + D.z1) / 2, deckM);
  const step = box(g, 1.6, 0.05, 0.45, 4.5, top / 2, D.z0 - 0.25, deckM);
  deck.cover(deckTop, step);
  finishSurface(W, restore, deck);
  W.solids.push(deckTop, step);
  for (const [px, pz] of [[D.x0 + 0.1, D.z0 + 0.1], [D.x1 - 0.1, D.z0 + 0.1], [D.x0 + 0.1, D.z1 - 0.3], [D.x1 - 0.1, D.z1 - 0.3]]) box(g, 0.12, top, 0.12, px, top / 2, pz, deckPlain);
  box(g, D.x1 - D.x0, top - 0.06, 0.04, (D.x0 + D.x1) / 2, (top - 0.06) / 2, D.z0, deckPlain);
  W.platforms.push({ x0: D.x0, x1: D.x1, z0: D.z0, z1: D.z1 + 0.1, y: top });
  W.platforms.push({ x0: 3.7, x1: 5.3, z0: D.z0 - 0.5, z1: D.z0, y: 0, ramp: { axis: "z", from: D.z0 - 0.5, to: D.z0, y0: 0.05, y1: top } });

  // ── Fences. The back one has peeling paint: scrape, then paint.
  const fenceSurf = makeSurface(W, restore, "fence:back", "Паркан (фарбування)", "paint", "fence", new THREE.Vector3(LOT.x0, 0, LOT.z0 + 0.02), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), LOT.x1 - LOT.x0, 1.85, 18);
  const fencePaintM = fenceSurf.material(fenceB, { amount: 1, peel: { old: 0xd8d0c0, fresh: style.fencePaint } });
  const fenceRun = (ax: number, az: number, bx: number, bz: number, mat: THREE.Material): THREE.InstancedMesh => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 0.16);
    const alongX = az === bz;
    const r = rng(Math.round(ax * 13 + az * 7));
    const plankGeo = new THREE.BoxGeometry(alongX ? 0.14 : 0.025, 1, alongX ? 0.025 : 0.14);
    // world-ish UVs: one plank shows a 0.14 × 1 m slice of the texture
    const uv = plankGeo.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.14 / 1.8, uv.getY(i) / 1.8);
    const planks = new THREE.InstancedMesh(plankGeo, mat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const h = 1.75 + (r() - 0.5) * 0.06;
      m.makeScale(1, h, 1);
      m.setPosition(ax + (bx - ax) * t, h / 2, az + (bz - az) * t);
      planks.setMatrixAt(i, m);
    }
    planks.castShadow = planks.receiveShadow = true;
    planks.userData.tag = "fence";
    g.add(planks);
    for (const y of [0.35, 1.45]) {
      if (alongX) box(g, len, 0.09, 0.05, (ax + bx) / 2, y, az - 0.05, fencePlain);
      else box(g, 0.05, 0.09, len, ax - 0.05 * Math.sign(ax), y, (az + bz) / 2, fencePlain);
    }
    if (alongX) W.block(Math.min(ax, bx), Math.max(ax, bx), az - 0.15, az + 0.15);
    else W.block(ax - 0.15, ax + 0.15, Math.min(az, bz), Math.max(az, bz));
    return planks;
  };
  const backFence = fenceRun(LOT.x0, LOT.z0, LOT.x1, LOT.z0, fencePaintM);
  fenceSurf.attach(backFence);
  fenceSurf.coverRect(0, 0, LOT.x1 - LOT.x0, 1.75);
  finishSurface(W, restore, fenceSurf);
  // the whole plot is fenced in: the job is inside, the world outside is scenery
  W.solids.push(fenceRun(LOT.x0, LOT.z0, LOT.x0, LOT.z1, fencePlain));
  W.solids.push(fenceRun(LOT.x1, LOT.z0, LOT.x1, LOT.z1, fencePlain));
  W.solids.push(fenceRun(LOT.x0, LOT.z1 + 0.15, LOT.x1, LOT.z1 + 0.15, fencePlain));
  const hz = horizon();
  hz.userData.tag = "horizon";
  g.add(hz);

  // ── Lawn.
  const lawn = new Lawn({ isLawn, zoneOf, zones: LAWN_ZONES, bounds: [LOT.x0, LOT.x1, LOT.z0, LOT.z1], density: o.grassDensity, seed: o.seed });
  lawn.group.userData.tag = "lawn";
  g.add(lawn.group);
  LAWN_ZONES.forEach((z, i) => lawn.restore(i, restore(z.key)));

  // ── Flower beds by the front wall and along the path.
  g.add(flowerBeds(o.seed % 997));

  // ── Haystack.
  const hay = buildHaystack();
  hay.userData.tag = "hay";
  g.add(hay);
  W.circles.push({ x: HAY.x, z: HAY.z, r: HAY.r * 0.9, y0: -1, y1: 4 });
  const hayProxy = new THREE.Mesh(new THREE.SphereGeometry(HAY.r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  hayProxy.scale.y = HAY.h / HAY.r;
  hayProxy.position.set(HAY.x, 0, HAY.z);
  g.add(hayProxy);
  W.solids.push(hayProxy);

  // ── Trees.
  const leafGreen = foliageMaterial(0.15), leafAutumn = foliageMaterial(0.75);
  const trees: Array<[number, number, number, number, THREE.Material, number]> = [
    [-12, -16, 5, 11, leafAutumn, 4400], [-11.5, 14, 9, 8.5, leafGreen, 3000],
    [13.5, -19.5, 21, 6.5, leafGreen, 1800], [-30, -8, 3, 10, leafAutumn, 1100], [30, 6, 4, 9, leafGreen, 1100],
    [24, -30, 6, 12, leafGreen, 1100], [-26, -32, 8, 11, leafAutumn, 1100],
  ];
  for (const [x, z, s, h, mat, n] of trees) {
    const t = buildTree({ seed: s, height: h, bark, leafMat: mat, leaves: n });
    t.position.set(x, 0, z);
    t.userData.tag = inRect(x, z, LOT) ? "trees" : "trees-out";
    // trees over the fence are scenery: no shadows
    if (!inRect(x, z, LOT)) t.traverse((m) => { m.castShadow = false; });
    g.add(t);
    W.circles.push({ x, z, r: h * 0.045 + 0.15, y0: -1, y1: 4 });
  }

  // ── Leaves: thick under the big tree, drifting over the back lawn, on the deck, in the pool.
  const yardLeaves = new LeafField({
    key: "leaves:yard", name: "Листя у дворі", count: 6500, seed: o.seed + 21,
    place: (r) => {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * 10;
      const x = -11 + Math.cos(a) * d * 1.3, z = -15 + Math.sin(a) * d;
      if (!inRect(x, z, LOT, -0.3) || inRect(x, z, POOL, 0.6)) return null;
      return new THREE.Vector3(x, 0.03 + r() * 0.04, z);
    },
  });
  const frontLeaves = new LeafField({
    key: "leaves:front", name: "Листя перед хатою", count: 2200, seed: o.seed + 25,
    place: (r) => {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 7;
      const x = -11.5 + Math.cos(a) * d, z = 14 + Math.sin(a) * d * 0.8;
      if (!inRect(x, z, LOT, -0.3) || inRect(x, z, PATH, 0.2)) return null;
      return new THREE.Vector3(x, 0.03 + r() * 0.04, z);
    },
  });
  const deckLeaves = new LeafField({
    key: "leaves:deck", name: "Листя на терасі", count: 450, seed: o.seed + 23,
    place: (r) => new THREE.Vector3(D.x0 + 0.1 + r() * (D.x1 - D.x0 - 0.2), top + 0.012, D.z0 + 0.1 + r() * (D.z1 - D.z0 - 0.2)),
  });
  const poolLeaves = new LeafField({
    key: "pool:leaves", name: "Листя в басейні", count: 700, seed: o.seed + 22, tilt: 0.1, floating: true,
    place: (r) => new THREE.Vector3(x0 + 0.2 + r() * (x1 - x0 - 0.4), POOL.water + 0.012, z0 + 0.2 + r() * (z1 - z0 - 0.4)),
  });
  const leaves = [yardLeaves, frontLeaves, deckLeaves];
  for (const f of [...leaves, poolLeaves]) {
    f.restore(restore(f.key));
    f.mesh.userData.tag = "leaves";
    g.add(f.mesh);
  }
  const litter = new THREE.Mesh(new THREE.CircleGeometry(4.0, 40), leafLitter);
  litter.rotation.x = -Math.PI / 2;
  litter.position.set(-13, 0.004, -18.5);
  litter.receiveShadow = true;
  bakeWorldUV(litter);
  g.add(litter);

  // ── Neighbours and the edge of the world.
  await neighbours(g);
  W.block(-60, 60, 31.5, 33);   // across the street
  W.block(-60, 60, -42, -40);
  W.block(-42, -40, -60, 60);
  W.block(40, 42, -60, 60);
  for (const [x, z, w, d] of [[-30, 2, 13, 10], [31, 0, 12, 11], [-4, -36, 14, 9]] as const) W.block(x - w / 2, x + w / 2, z - d / 2, z + d / 2);

  const tick = (t: number, dt: number): void => {
    waterNormal.offset.set(t * 0.012, t * 0.007);
    for (const f of [...leaves, poolLeaves]) f.update(dt, t);
    driveTick();
  };
  void PAY;
  return { group: g, lawn, leaves, poolLeaves, water, setPoolClean, tick };
}

/** Furniture and garden props. Big ones block the player and the crosshair. */
/** Props; the ones inside the house go into `interior` (hidden when you're far outside). */
export async function placeProps(g: THREE.Object3D, W: WorldIndex, interior: THREE.Object3D = g): Promise<void> {
  const F = HOUSE.floorY;
  type P = [id: string, x: number, y: number, z: number, rotY?: number, scale?: number, solid?: boolean];
  const list: P[] = [
    // living room
    ["Sofa_01", -4.6, F, 0.7, 0, 1.1, true],
    ["ArmChair_01", -1.6, F, 2.0, -Math.PI / 2 + 0.3, 1, true],
    ["CoffeeTable_01", -4.4, F, 2.0, 0, 1, true],
    ["WoodenTable_01", -4.4, F, 4.6, Math.PI, 1, true],
    ["Television_01", -4.4, F + 0.55, 4.6, Math.PI],
    ["wooden_bookshelf_worn", -6.6, F, 2.2, Math.PI / 2, 1, true],
    ["potted_plant_02", -6.4, F, 4.3, 0, 0.8, true],
    ["throw_pillows_01", -5.2, F + 0.45, 0.75],
    ["ceiling_fan", -3.5, F + 2.2, 2.5],
    ["hanging_picture_frame_01", -3.2, F + 1.6, 0.08],
    // bedroom
    ["vintage_day_bed", -4.6, F, -3.9, 0, 1, true],
    ["ClassicNightstand_01", -2.8, F, -4.5, 0, 1, true],
    ["modern_ceiling_lamp_01", -3.5, F + 1.75, -2.5],
    // back hall
    ["Shelf_01", 6.7, F, -1.6, -Math.PI / 2, 1, true],
    ["metal_tool_chest", 4.0, F, -4.6, 0, 1, true],
    // yard
    ["garden_gnome", -6.0, 0, 9.5, 0.6],
    ["planter_box_01", -5.5, 0, 6.1, 0, 1, true],
    ["planter_box_01", 1.5, 0, 6.1, 0, 1, true],
    ["garden_hose_wall_mounted_01", 7.13, 0.6, -1.0, Math.PI / 2],
    ["ladder_sectioned_01", LADDER.x, 0, LADDER.z, Math.PI / 2],
    ["metal_trash_can", 12.9, 0, 21.0, 0, 1, true],
    ["metal_trash_can", 13.6, 0, 21.2, 0.8, 1, true],
    ["wooden_picnic_table", 5.0, F - 0.04, -7.3, Math.PI / 2, 1, true],
    ["plastic_monobloc_chair_01", 2.4, F - 0.04, -6.6, 0.9, 1, true],
    ["compost_bags", 14.6, 0, -12.0, -0.5, 1, true],
    ["tree_stump_01", 7.0, 0, -19.0, 0, 1, true],
    ["rubber_duck_toy", -4.2, POOL.water - 0.03, -12.5, 0.7],
    ["wicker_basket_01", 3.0, F - 0.04, -8.9],
    ["watering_can_metal_01", 1.0, 0, 6.2, 1.2],
    ["garden_sprinkler_01", 4.0, 0.02, 12.0],
    ["shrub_02", 9.2, 0, -21.0, 0, 0.9, true],
    ["shrub_02", -15.0, 0, -6.0, 1, 0.8, true],
    ["shrub_02", -15.0, 0, 3.0, 2, 0.7, true],
    ["weed_plant_02", -2.6, 0.05, 12.0],
    ["weed_plant_02", -1.5, 0.05, 16.0, 1],
    ["weed_plant_02", 10.0, 0.05, 6.0, 2],
    ["grass_medium_02", -1.2, 0.05, 9.0],
    ["grass_medium_02", -2.9, 0.05, 19.0, 1],
    ["grass_medium_01", 8.6, 0.05, 14.0],
  ];
  await Promise.all(list.map(async ([id, x, y, z, rot = 0, s = 1, solid = false]) => {
    try {
      const o = await instance(id);
      o.position.set(x, y, z);
      o.rotation.y = rot;
      o.scale.setScalar(s);
      const inside = Math.abs(x) < HOUSE.halfX && Math.abs(z) < HOUSE.halfZ;
      (inside ? interior : g).add(o);
      if (inside) o.traverse((m) => { m.castShadow = false; });
      if (solid) {
        W.blockMesh(o, 0.05);
        W.solids.push(proxyBox(g, o));
      }
    } catch (e) {
      console.warn("prop", id, e);
    }
  }));
  // dirty carpet in the living room
  const carpetMat = await pbrMaterial("dirty_carpet", { scale: 1 / 0.6 });
  const carpet = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.015, 2.0), carpetMat);
  carpet.position.set(-4.4, F + 0.05, 2.0);
  carpet.receiveShadow = true;
  bakeWorldUV(carpet);
  interior.add(carpet);
}
