import * as THREE from "three";
import { animateRig, at, makeBench, makePerson, makePine, makeTree, mat, mesh, type Look, type Rig } from "../../../rozshuk/src/three/models.ts";
import type { MemoryKind } from "../content.ts";
import { glowMat } from "./post.ts";
import { Sunbeam, curtains, faceUp, smoothen, surface } from "./smooth.ts";
import { lino, plaster, tiles } from "./textures.ts";

/**
 * The photo on the fridge, lived again: July 2021, a dacha in Kozyn. Long
 * golden light, a table under the apple tree, the grill smoking, five friends
 * — and you, before: no beard, a yellow T-shirt, somewhere to go.
 */
export interface MemoryFriend { color: number; dead: boolean; look?: Partial<Look>; hair?: number }

type Spot = { x: number; z: number; yaw: number; pose: "idle" | "sit" | "call" | "grill" | "stir" | "read" | "sparkler" };

/** One remembered place: where people stand, where you start, what you cannot walk through, its light. */
interface Place {
  group: THREE.Group;
  spots: Spot[];
  start: [number, number];
  bounds: [number, number, number, number];
  blocks: Array<[number, number, number, number]>;
  child?: boolean;
  light: { sun: number; sunPos: [number, number, number]; sunI: number; hemi: number; ground: number; hemiI: number; sky: number; fog: [number, number]; cam: [number, number]; env: number };
}

interface Pal { rig: Rig; x: number; z: number; yaw: number; pose: Spot["pose"]; dead: boolean; spark?: THREE.Points }

const SPOTS: Spot[] = [
  { x: 3.3, z: -1.8, yaw: Math.PI * 0.85, pose: "grill" },
  { x: -0.7, z: -1.75, yaw: 0, pose: "sit" },
  { x: 1.7, z: 0.9, yaw: -2.3, pose: "call" },
  { x: -2.6, z: 0.4, yaw: 1.2, pose: "idle" },
  { x: 0.8, z: -0.25, yaw: Math.PI, pose: "sit" },
];

export class Memory {
  readonly group = new THREE.Group();
  hero!: Rig;
  private places: Partial<Record<MemoryKind, Place>> = {};
  kind: MemoryKind = "dacha";
  readonly heroPos = new THREE.Vector3(0, 0, 3.2);
  heroYaw = Math.PI;
  private pals: Pal[] = [];
  private smoke!: THREE.Points;
  private smokeV!: Float32Array;
  private pollen!: THREE.Points;
  private coals!: THREE.Mesh;
  // new year
  private garland: THREE.Mesh[] = [];
  private fireworks: Array<{ pts: THREE.Points; vel: Float32Array; t: number }> = [];
  private fwT = 0.5;
  private snowfall: THREE.Points | null = null;
  // the kitchen
  private steam: THREE.Points | null = null;
  private beam: Sunbeam | null = null;

  constructor() {
    // you, before
    this.hero = makePerson({ top: 0xe8c45a, pants: 0x3f5f8a, shoes: 0xf0ece4, hat: "none" });
    const hair = mesh(new THREE.SphereGeometry(0.285, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(0x5a3a22), 0.012);
    at(hair, 0, 0.04, -0.02, this.hero.head);
    faceUp(this.hero);
    smoothen(this.hero.root, true);
    this.group.add(this.hero.root);
    this.group.visible = false;
  }

  private place(kind: MemoryKind): Place {
    let p = this.places[kind];
    if (!p) {
      p = kind === "dacha" ? this.buildDacha() : kind === "newyear" ? this.buildNewYear() : this.buildKitchen();
      smoothen(p.group);
      this.group.add(p.group);
      this.places[kind] = p;
    }
    return p;
  }

  /** The light of the current memory, for the scene to apply. */
  get light(): Place["light"] { return this.place(this.kind).light; }

  private buildDacha(): Place {
    const g = new THREE.Group();
    // the grass: a warm green field with a texture of blades
    const grassTex = (() => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 256;
      const c = cv.getContext("2d")!;
      c.fillStyle = "#6f9a3c";
      c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4000; i++) {
        c.strokeStyle = `rgba(${Math.random() < 0.5 ? "150,190,70" : "60,100,30"},${0.25 + Math.random() * 0.4})`;
        c.lineWidth = 1;
        const x = Math.random() * 256, y = Math.random() * 256;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 3, y - 3 - Math.random() * 4); c.stroke();
      }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(14, 14);
      return t;
    })();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshLambertMaterial({ map: grassTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    g.add(ground);
    // tufts and flowers
    const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.32, 3), new THREE.MeshLambertMaterial({ color: 0xffffff }), 700);
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), 160);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < 700; i++) {
      const x = (Math.random() - 0.5) * 22, z = (Math.random() - 0.5) * 18;
      if (Math.abs(x) < 2 && Math.abs(z + 1) < 1.2) { m4.makeScale(0, 0, 0); tuft.setMatrixAt(i, m4); continue; }
      m4.makeRotationY(Math.random() * 3).setPosition(x, 0.14, z);
      tuft.setMatrixAt(i, m4);
      tuft.setColorAt(i, col.setHSL(0.22 + Math.random() * 0.06, 0.5, 0.28 + Math.random() * 0.15));
    }
    for (let i = 0; i < 160; i++) {
      m4.makeTranslation((Math.random() - 0.5) * 20, 0.2, (Math.random() - 0.5) * 16);
      flowers.setMatrixAt(i, m4);
      flowers.setColorAt(i, col.set([0xfff2a8, 0xffffff, 0xf2b632, 0xd8a0e8][i % 4]));
    }
    g.add(tuft, flowers);
    // the dacha: pale blue boards, a red roof, white window frames
    const house = new THREE.Group();
    const boards = (() => {
      const cv = document.createElement("canvas");
      cv.width = 128; cv.height = 128;
      const c = cv.getContext("2d")!;
      c.fillStyle = "#8fb6cf"; c.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 16) { c.fillStyle = "rgba(40,60,80,.35)"; c.fillRect(0, y, 128, 2); c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(0, y + 2, 128, 2); }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 2);
      return t;
    })();
    at(mesh(new THREE.BoxGeometry(4.6, 2.6, 3.4), new THREE.MeshLambertMaterial({ map: boards }), 0.03), 0, 1.3, 0, house);
    for (const s of [-1, 1]) {
      const roof = mesh(new THREE.BoxGeometry(5.2, 0.12, 2.3), 0xb8462e, 0.03);
      roof.rotation.x = s * 0.62;
      at(roof, 0, 3.25, s * 0.92, house);
    }
    at(mesh(new THREE.BoxGeometry(4.4, 1.4, 0.1), 0x8fb6cf, 0), 0, 3.1, 1.7, house).scale.set(1, 1, 1);
    for (const x of [-1.2, 1.2]) {
      at(mesh(new THREE.BoxGeometry(0.9, 0.9, 0.06), 0xf4f0e6, 0.02), x, 1.5, 1.72, house);
      at(new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72), glowMat(0xffe0a0, 1.1)), x, 1.5, 1.76, house);
    }
    at(mesh(new THREE.BoxGeometry(0.9, 1.9, 0.06), 0x6a4a30, 0.02), 0, 0.95, 1.72, house);
    at(mesh(new THREE.BoxGeometry(2.2, 0.14, 1.2), 0x9a7a5a, 0.02), 0, 0.07, 2.3, house);
    at(house, -5.2, 0, -5.4, g);
    house.rotation.y = 0.35;
    // the fence
    const picket = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.1, 0.04), mat(0xd8cba8), 60);
    for (let i = 0; i < 60; i++) { m4.makeTranslation(-12 + i * 0.4, 0.55, -9); picket.setMatrixAt(i, m4); }
    picket.castShadow = true;
    g.add(picket);
    at(mesh(new THREE.BoxGeometry(24, 0.08, 0.06), 0xc8bb98, 0), 0, 0.8, -8.98, g);
    // trees, the apple tree over the table
    const treeSpots: Array<[number, number, number]> = [[-1.6, -3.4, 1.6], [6.5, -6, 1.3], [-9, -3, 1.4], [8.5, 1, 1.2], [-8, 4, 1.1], [4.5, -8.5, 1.5], [-3.5, -8.6, 1.3], [10, -4.5, 1.4]];
    treeSpots.forEach(([x, z, s], i) => { const t = makeTree(i + 41, false); t.scale.setScalar(s); at(t, x, 0, z, g); });
    for (let i = 0; i < 9; i++) at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), mat(0xd8322a)), -1.6 + (Math.random() - 0.5) * 2.2, 2.6 + Math.random() * 1.2, -3.4 + (Math.random() - 0.5) * 2, g);
    // the table with its checked cloth, plates, bottles, a watermelon
    const cloth = (() => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      const c = cv.getContext("2d")!;
      c.fillStyle = "#f4f0e6"; c.fillRect(0, 0, 64, 64);
      c.fillStyle = "rgba(200,58,50,.85)";
      for (let i = 0; i < 8; i++) { c.fillRect(i * 8, 0, 4, 64); c.fillRect(0, i * 8, 64, 4); }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 1.5);
      return t;
    })();
    const table = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(2.4, 0.06, 1.1), new THREE.MeshLambertMaterial({ map: cloth }), 0.015), 0, 0.76, 0, table);
    for (const [x, z] of [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]]) at(mesh(new THREE.BoxGeometry(0.07, 0.76, 0.07), 0x6a4a30, 0), x, 0.38, z, table);
    for (let i = 0; i < 5; i++) at(mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.02, 12), 0xffffff, 0.006), -0.9 + i * 0.45, 0.8, (i % 2 ? 0.28 : -0.28), table);
    for (let i = 0; i < 3; i++) at(mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.3, 8), 0x2f7a3a, 0.006), -0.3 + i * 0.25, 0.94, 0.05, table);
    const melon = mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xd8322a, 0.01);
    melon.rotation.x = Math.PI / 2;
    at(melon, 0.7, 0.86, 0.05, table);
    at(table, -0.1, 0, -1.0, g);
    for (const z of [-1.75, -0.25]) { const b = makeBench(); b.scale.set(1.1, 1, 1); if (z > -1) b.rotation.y = Math.PI; at(b, -0.1, 0, z, g); }
    // the grill: coals glowing, skewers, smoke going up into the evening
    const grill = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(1.0, 0.26, 0.36), 0x2a2a2c, 0.02), 0, 0.72, 0, grill);
    for (const [x, z] of [[-0.45, -0.14], [0.45, -0.14], [-0.45, 0.14], [0.45, 0.14]]) at(mesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), 0x2a2a2c, 0), x, 0.3, z, grill);
    this.coals = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.3), glowMat(0xff6a20, 3.5));
    at(this.coals, 0, 0.84, 0, grill);
    for (let i = 0; i < 5; i++) {
      const sk = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 4), 0xc8c8c8, 0);
      sk.rotation.x = Math.PI / 2;
      at(sk, -0.36 + i * 0.18, 0.9, 0, grill);
      for (let j = 0; j < 4; j++) at(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), 0x8a4a28, 0), -0.36 + i * 0.18, 0.9, -0.15 + j * 0.1, grill);
    }
    at(grill, 3.0, 0, -2.6, g);
    const sp = new Float32Array(120 * 3);
    this.smokeV = new Float32Array(120);
    for (let i = 0; i < 120; i++) { sp[i * 3] = 3 + (Math.random() - 0.5) * 0.6; sp[i * 3 + 1] = 0.9 + Math.random() * 4; sp[i * 3 + 2] = -2.6 + (Math.random() - 0.5) * 0.3; this.smokeV[i] = 0.4 + Math.random() * 0.5; }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.smoke = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xe8e0d8, size: 0.35, transparent: true, opacity: 0.22, depthWrite: false }));
    g.add(this.smoke);
    // fluff in the air, catching the light
    const pp = new Float32Array(220 * 3);
    for (let i = 0; i < 220; i++) { pp[i * 3] = (Math.random() - 0.5) * 18; pp[i * 3 + 1] = 0.3 + Math.random() * 3.5; pp[i * 3 + 2] = (Math.random() - 0.5) * 14; }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute("position", new THREE.BufferAttribute(pp, 3));
    this.pollen = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: 0xfff0b0, size: 0.06, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(this.pollen);
    return {
      group: g, spots: SPOTS, start: [0, 3.2], bounds: [-9, 9, -8.2, 6],
      blocks: [[-1.4, -2.1, 1.2, 0.1], [2.4, -2.9, 3.6, -2.3], [-7.6, -7.4, -2.8, -3.4]],
      light: { sun: 0xffc98a, sunPos: [-7, 6.5, 6], sunI: 2.5, hemi: 0xcfe4ff, ground: 0x6a8a3a, hemiI: 1.0, sky: 0xf4d6a0, fog: [16, 46], cam: [5.2, 6.4], env: 0.35 },
    };
  }

  /** December 31, 2021: snow, a fir tree in lights, sparklers, fireworks over the dacha. */
  private buildNewYear(): Place {
    const g = new THREE.Group();
    const snowTex = (() => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 256;
      const c = cv.getContext("2d")!;
      c.fillStyle = "#e8eef6";
      c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "170,185,210"},${0.2 + Math.random() * 0.5})`; c.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2); }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(12, 12);
      return t;
    })();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshStandardMaterial({ map: snowTex, color: 0xb8c4e0, roughness: 0.55 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    g.add(ground);
    // drifts
    for (let i = 0; i < 14; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.8 + Math.random(), 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), surface("paint", 0xeef2f8)); d.scale.y = 0.35; at(d, (Math.random() - 0.5) * 22, 0, -4 - Math.random() * 6, g); }
    // the house with warm windows and lights along the roof
    const house = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(4.6, 2.6, 3.4), 0x8a6a52, 0.03), 0, 1.3, 0, house);
    for (const s2 of [-1, 1]) { const roof = mesh(new THREE.BoxGeometry(5.2, 0.12, 2.3), 0xf2f4f8, 0.03); roof.rotation.x = s2 * 0.62; at(roof, 0, 3.25, s2 * 0.92, house); }
    for (const x of [-1.2, 1.2]) at(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), glowMat(0xffc070, 1.8)), x, 1.5, 1.72, house);
    at(house, -4.8, 0, -5.6, g);
    house.rotation.y = 0.3;
    const bulbColors = [0xff4a4a, 0x4aff7a, 0x4a8aff, 0xffd84a, 0xff7ad8];
    for (let i = 0; i < 26; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glowMat(bulbColors[i % 5], 3));
      b.position.set(-2.4 + i * 0.19, 2.75 + Math.sin(i * 0.9) * 0.06, 1.75);
      house.add(b);
      this.garland.push(b);
    }
    // the fir tree, dressed
    const fir = makePine(7, true);
    fir.scale.setScalar(1.6);
    at(fir, 3.2, 0, -2.6, g);
    for (let i = 0; i < 46; i++) {
      const h = 0.6 + (i / 46) * 4.4;
      const rad = (1 - h / 5.6) * 1.55;
      const a = i * 2.3;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glowMat(bulbColors[i % 5], 3.2));
      at(b, 3.2 + Math.cos(a) * rad, h, -2.6 + Math.sin(a) * rad, g);
      this.garland.push(b);
    }
    at(new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glowMat(0xffe070, 4)), 3.2, 5.6, -2.6, g);
    // the warm light of the tree, the windows and the sparklers on the faces
    const treeLight = new THREE.PointLight(0xffb070, 6, 9, 1.6);
    at(treeLight, 3.0, 2.2, -1.6, g);
    const houseLight = new THREE.PointLight(0xffa860, 5, 8, 1.6);
    at(houseLight, -4.2, 1.6, -3.4, g);
    const partyLight = new THREE.PointLight(0xffe0b0, 4, 7, 1.5);
    at(partyLight, -0.4, 2.0, 0.2, g);
    // a table with a cloth, glasses, tangerines
    const table = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(1.8, 0.06, 0.9), 0xb83a3a, 0.015), 0, 0.76, 0, table);
    for (const [x, z] of [[-0.8, -0.38], [0.8, -0.38], [-0.8, 0.38], [0.8, 0.38]]) at(mesh(new THREE.BoxGeometry(0.06, 0.76, 0.06), 0x5a4030, 0), x, 0.38, z, table);
    for (let i = 0; i < 6; i++) at(mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.55, roughness: 0.05 }), 0), -0.7 + i * 0.28, 0.87, (i % 2 ? 0.2 : -0.2), table);
    for (let i = 0; i < 7; i++) at(mesh(new THREE.SphereGeometry(0.05, 12, 10), 0xf28a1a, 0), -0.3 + (i % 4) * 0.1, 0.83, 0.05 + Math.floor(i / 4) * 0.08, table);
    at(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.34, 12), 0x1e4a2a, 0.006), 0.5, 0.96, 0, table);
    at(table, -0.4, 0, -1.4, g);
    // falling snow
    const n = 700;
    const sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { sp[i * 3] = (Math.random() - 0.5) * 24; sp[i * 3 + 1] = Math.random() * 10; sp[i * 3 + 2] = (Math.random() - 0.5) * 18; }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.snowfall = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.9, depthWrite: false }));
    g.add(this.snowfall);
    // fireworks: a pool of bursts reused over the sky
    for (let k = 0; k < 4; k++) {
      const m = 90;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(m * 3), 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      pts.frustumCulled = false;
      g.add(pts);
      this.fireworks.push({ pts, vel: new Float32Array(m * 3), t: 99 });
    }
    const spots: Spot[] = [
      { x: -1.6, z: -0.2, yaw: 0.9, pose: "sparkler" },
      { x: 0.9, z: -0.3, yaw: -0.8, pose: "sparkler" },
      { x: -0.4, z: 0.6, yaw: Math.PI, pose: "call" },
      { x: 1.9, z: 0.8, yaw: -1.6, pose: "idle" },
      { x: -2.4, z: 1.2, yaw: 1.4, pose: "sparkler" },
    ];
    return {
      group: g, spots, start: [0, 3.4], bounds: [-9, 9, -8, 6], blocks: [[-1.3, -1.85, 0.5, -0.95], [2.0, -3.8, 4.4, -1.4], [-7.4, -7.6, -2.4, -3.6]],
      light: { sun: 0x7a98ff, sunPos: [6, 9, 4], sunI: 0.3, hemi: 0x2a3a7a, ground: 0x1a2240, hemiI: 0.32, sky: 0x060a1c, fog: [16, 44], cam: [5.4, 6.6], env: 0.03 },
    };
  }

  /** Summer 2008: mom's kitchen. Sun through the window, borscht on the stove, you are ten. */
  private buildKitchen(): Place {
    const g = new THREE.Group();
    const W = 3.2, D = 2.6, H = 2.6;
    const floorS = lino();
    floorS.map.repeat.set(1.6, 1.4); floorS.normal.repeat.set(1.6, 1.4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2), new THREE.MeshStandardMaterial({ map: floorS.map, normalMap: floorS.normal, roughness: 0.5 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    const wallS = plaster("#e8d8a8", 91);
    wallS.map.repeat.set(3, 1.2);
    const wallM = new THREE.MeshStandardMaterial({ map: wallS.map, normalMap: wallS.normal, roughness: 0.9 });
    const tileS = tiles();
    tileS.map.repeat.set(3, 0.5); tileS.normal.repeat.set(3, 0.5);
    const tileM = new THREE.MeshStandardMaterial({ map: tileS.map, normalMap: tileS.normal, roughness: 0.25 });
    const wall = (x: number, z: number, w: number, d: number, h: number, y = 0, m: THREE.Material = wallM) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y + h / 2, z); b.receiveShadow = true; b.castShadow = true; g.add(b); };
    // back wall with a window in the middle-left, side walls, tiles behind the stove
    wall(-2.6, -D, 1.2, 0.12, H); wall(0.9, -D, 4.6, 0.12, H);
    wall(-1.5, -D, 1.0, 0.12, 0.9); wall(-1.5, -D, 1.0, 0.12, 0.3, 2.3);
    wall(-W, 0, 0.12, D * 2, H); wall(W, 0, 0.12, D * 2, H);
    wall(1.6, -D + 0.07, 3.0, 0.02, 0.9, 0.9, tileM);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), new THREE.MeshBasicMaterial({ color: 0xfff4d8 }));
    glass.position.set(-1.5, 1.6, -D);
    g.add(glass);
    at(mesh(new THREE.BoxGeometry(1.1, 0.06, 0.3), 0xf4f0e6, 0.01), -1.5, 0.93, -D + 0.12, g);
    const cur = curtains(-2.0, -1.0, 2.4, 0xe8b8a0);
    at(cur, 0, 0, -D + 0.12, g);
    // geraniums on the sill and the cat in the sun
    for (let i = 0; i < 2; i++) {
      at(mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.14, 16), 0xb8603a, 0.008), -1.8 + i * 0.5, 1.03, -D + 0.12, g);
      for (let k = 0; k < 5; k++) at(new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), surface("plastic", 0xe8323a)), -1.8 + i * 0.5 + (Math.random() - 0.5) * 0.1, 1.2 + Math.random() * 0.05, -D + 0.12 + (Math.random() - 0.5) * 0.08, g);
    }
    const cat = new THREE.Group();
    at(mesh(new THREE.SphereGeometry(0.14, 16, 12), 0xd8843a, 0.01), 0, 0.1, 0, cat).scale.set(1.3, 0.8, 1);
    at(mesh(new THREE.SphereGeometry(0.09, 16, 12), 0xd8843a, 0.01), 0.17, 0.13, 0, cat);
    for (const s2 of [-1, 1]) at(mesh(new THREE.ConeGeometry(0.03, 0.06, 8), 0xd8843a, 0.006), 0.19, 0.22, s2 * 0.05, cat);
    at(cat, -1.25, 0.96, -D + 0.14, g);
    // stove with a pot of borscht, the counter, an old fridge with a radio on top
    at(mesh(new THREE.BoxGeometry(0.6, 0.88, 0.6), new THREE.MeshStandardMaterial({ color: 0xf0eee6, roughness: 0.22 }), 0.02), 0.9, 0.44, -D + 0.35, g);
    at(mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.22, 24), surface("enamel", 0xc83a32), 0.012), 0.82, 1.0, -D + 0.3, g);
    at(mesh(new THREE.BoxGeometry(1.6, 0.88, 0.6), 0xd8c8a0, 0.02), 2.0, 0.44, -D + 0.35, g);
    at(mesh(new THREE.BoxGeometry(1.6, 0.04, 0.62), surface("wood", 0xc8a070), 0.01), 2.0, 0.9, -D + 0.35, g);
    at(mesh(new THREE.BoxGeometry(0.66, 1.6, 0.62), new THREE.MeshStandardMaterial({ color: 0xf4f2ea, roughness: 0.25 }), 0.02), 2.75, 0.8, -D + 1.15, g);
    at(mesh(new THREE.BoxGeometry(0.32, 0.18, 0.12), 0x6a4a30, 0.008), 2.75, 1.69, -D + 1.15, g);
    // the table with oilcloth, plates of borscht, bread, a newspaper; a lamp over it
    const cloth = (() => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 128;
      const c = cv.getContext("2d")!;
      c.fillStyle = "#f4f0e2"; c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 26; i++) { c.fillStyle = ["#e86a5a", "#f2b632", "#6aa84a"][i % 3]; const x = (i * 37) % 128, y = (i * 53) % 128; c.beginPath(); for (let k = 0; k < 5; k++) { const a = k * 1.256; c.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4, 2.4, a, 0, Math.PI * 2); } c.fill(); }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(2, 1.2);
      return t;
    })();
    const table = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(1.5, 0.05, 0.9), new THREE.MeshStandardMaterial({ map: cloth, roughness: 0.3 }), 0.012), 0, 0.75, 0, table);
    for (const [x, z] of [[-0.68, -0.38], [0.68, -0.38], [-0.68, 0.38], [0.68, 0.38]]) at(mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), 0x7a5a3a, 0), x, 0.37, z, table);
    for (let i = 0; i < 3; i++) {
      at(mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.05, 20), 0xffffff, 0.005), -0.45 + i * 0.45, 0.8, i === 1 ? 0.25 : -0.2, table);
      at(new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), surface("gloss", 0xb8282a)), -0.45 + i * 0.45, 0.826, i === 1 ? 0.25 : -0.2, table).rotation.x = -Math.PI / 2;
    }
    at(mesh(new THREE.BoxGeometry(0.3, 0.1, 0.16), 0xc88a4a, 0.008), 0.2, 0.82, 0.02, table);
    at(mesh(new THREE.BoxGeometry(0.4, 0.01, 0.3), 0xe8e4d8, 0), -0.5, 0.78, 0.15, table).rotation.y = 0.3;
    at(table, -0.5, 0, 0.1, g);
    at(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 6), 0x333333, 0), -0.5, 2.3, 0.1, g);
    at(mesh(new THREE.ConeGeometry(0.3, 0.22, 24, 1, true), 0xe8a050, 0.012), -0.5, 1.95, 0.1, g);
    at(new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), glowMat(0xfff0c0, 2.2)), -0.5, 1.88, 0.1, g);
    // steam from the pot
    const n = 50;
    const sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { sp[i * 3] = 0.82 + (Math.random() - 0.5) * 0.2; sp[i * 3 + 1] = 1.1 + Math.random() * 0.9; sp[i * 3 + 2] = -D + 0.3 + (Math.random() - 0.5) * 0.15; }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.steam = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.22, depthWrite: false }));
    g.add(this.steam);
    // the summer sun through the window
    this.beam = new Sunbeam(1.0, 1.4, 3.0);
    at(this.beam.group, -1.5, 2.25, -D + 0.05, g).rotation.x = -0.9;
    const spots: Spot[] = [
      { x: 0.9, z: -D + 0.95, yaw: Math.PI, pose: "stir" },
      { x: -1.45, z: 0.15, yaw: Math.PI / 2, pose: "read" },
      { x: -0.5, z: 0.85, yaw: Math.PI, pose: "sit" },
    ];
    return {
      group: g, spots, start: [1.4, 1.6], bounds: [-2.8, 2.8, -D + 0.6, 2.3], blocks: [[-1.3, -0.4, 0.3, 0.6], [2.4, -D + 0.6, 3.1, -D + 1.5]], child: true,
      light: { sun: 0xffdcaa, sunPos: [-3, 6, -8], sunI: 1.7, hemi: 0xfff0d8, ground: 0x9a7a58, hemiI: 0.75, sky: 0x3a2a1e, fog: [30, 80], cam: [4.8, 5.2], env: 0.25 },
    };
  }

  /** Puts the people in the picture. Someone who is gone now is there, but faded. */
  setup(kind: MemoryKind, friends: MemoryFriend[]): void {
    this.kind = kind;
    const place = this.place(kind);
    for (const [k, p] of Object.entries(this.places)) p.group.visible = k === kind;
    for (const p of this.pals) this.group.remove(p.rig.root);
    // in the kitchen you are ten
    this.hero.root.scale.setScalar(place.child ? 0.86 : 1.18);
    this.pals = friends.slice(0, place.spots.length).map((f, i) => {
      const s = place.spots[i];
      const rig = makePerson({ top: f.color, pants: [0x3a3a44, 0x4a5a7a, 0x2f3f3a, 0x5a4a3a, 0x3a4a6a][i], hat: i === 2 && kind === "dacha" ? "cap" : "none", hatColor: 0xd8d0c0, build: 0.95 + (i % 3) * 0.05, ...(f.look ?? {}) });
      if (f.hair !== undefined) {
        const hair = mesh(new THREE.SphereGeometry(0.3, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(f.hair), 0.012);
        at(hair, 0, 0.03, -0.03, rig.head);
        const bun = mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(f.hair), 0.01);
        at(bun, 0, 0.2, -0.2, rig.head);
      }
      if (kind === "newyear") {
        // a hat for winter, and a sparkler for those holding one
        const cap = mesh(new THREE.SphereGeometry(0.29, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat([0xc83a32, 0x3a5a9a, 0xf2f2f2, 0x2a6a4a, 0xd8a03a][i]), 0.015);
        at(cap, 0, 0.06, 0, rig.head);
      }
      faceUp(rig);
      smoothen(rig.root, true);
      let spark: THREE.Points | undefined;
      if (s.pose === "sparkler") {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 6), new THREE.MeshBasicMaterial({ color: 0x555555 }));
        stick.position.set(0, -0.15, 0.1);
        rig.hand.add(stick);
        const m = 40;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(m * 3), 3));
        spark = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffe8a0, size: 0.05, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
        spark.position.set(0, -0.35, 0.1);
        spark.frustumCulled = false;
        rig.hand.add(spark);
      }
      // someone who is gone now: there, but see-through — outlines too (materials cloned, some are shared)
      if (f.dead) rig.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const fade = (x: THREE.Material) => { const c = x.clone(); c.transparent = true; c.opacity = 0.28; c.depthWrite = false; return c; };
        m.material = Array.isArray(m.material) ? m.material.map(fade) : fade(m.material);
        m.castShadow = false;
      });
      rig.root.position.set(s.x, 0, s.z);
      rig.root.rotation.y = s.yaw;
      if (place.child) rig.root.scale.setScalar(1.3);
      this.group.add(rig.root);
      return { rig, x: s.x, z: s.z, yaw: s.yaw, pose: s.pose, dead: f.dead, spark };
    });
    this.heroPos.set(place.start[0], 0, place.start[1]);
    this.heroYaw = Math.PI;
  }

  /** The friend you are standing next to, if any. */
  nearest(): number | null {
    let best: number | null = null;
    let bd = 1.6;
    this.pals.forEach((p, i) => { const d = Math.hypot(p.x - this.heroPos.x, p.z - this.heroPos.z); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /** World position above a friend's head (for the speech bubble). */
  head(i: number): THREE.Vector3 { const p = this.pals[i]; return new THREE.Vector3(p.x, 2.1, p.z); }

  update(dt: number, time: number, move: { x: number; y: number }, speed: number): void {
    const len = Math.min(1, Math.hypot(move.x, move.y));
    if (len > 0.05) {
      const nx = this.heroPos.x + (move.x / len) * speed * len * dt;
      const nz = this.heroPos.z + (move.y / len) * speed * len * dt;
      const pl = this.place(this.kind);
      const [bx0, bx1, bz0, bz1] = pl.bounds;
      const p = new THREE.Vector3(Math.max(bx0, Math.min(bx1, nx)), 0, Math.max(bz0, Math.min(bz1, nz)));
      // around the tables, the grill, the stove, the houses
      for (const [x0, z0, x1, z1] of pl.blocks) {
        if (p.x > x0 - 0.2 && p.x < x1 + 0.2 && p.z > z0 - 0.2 && p.z < z1 + 0.2) { p.x = this.heroPos.x; p.z = this.heroPos.z; break; }
      }
      for (const pal of this.pals) {
        const d = Math.hypot(p.x - pal.x, p.z - pal.z);
        if (d < 0.5) { p.x = this.heroPos.x; p.z = this.heroPos.z; }
      }
      this.heroPos.copy(p);
      const yaw = Math.atan2(move.x, move.y);
      let dy = yaw - this.heroYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.heroYaw += dy * Math.min(1, dt * 12);
    }
    animateRig(this.hero, speed * len, dt, "walk");
    this.hero.root.position.copy(this.heroPos);
    this.hero.root.rotation.y = this.heroYaw;
    // the friends: they turn to you when you come close (the faded one does not)
    for (const p of this.pals) {
      const r = p.rig;
      const near = !p.dead && Math.hypot(p.x - this.heroPos.x, p.z - this.heroPos.z) < 2.2;
      const want = near ? Math.atan2(this.heroPos.x - p.x, this.heroPos.z - p.z) : p.yaw;
      let dy = want - r.root.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      if (p.pose !== "sit") r.root.rotation.y += dy * Math.min(1, dt * 4);
      if (p.pose === "sit" || p.pose === "read") { animateRig(r, 0, dt, "sit"); r.head.rotation.y = near ? Math.max(-0.8, Math.min(0.8, dy)) : Math.sin(time * 0.7 + p.x) * 0.2; if (p.pose === "read" && !near) { r.armL.rotation.x = r.armR.rotation.x = -1.3; r.head.rotation.x = 0.3; } }
      else if (p.pose === "stir") { animateRig(r, 0, dt, "idle"); if (!near) { r.armR.rotation.x = -1.3 + Math.sin(time * 3) * 0.2; r.armR.rotation.z = Math.cos(time * 3) * 0.2; } }
      else if (p.pose === "sparkler") { animateRig(r, 0, dt, "idle"); r.armR.rotation.x = -1.6 + Math.sin(time * 2 + p.x) * 0.5; r.armR.rotation.z = Math.cos(time * 2 + p.x) * 0.4; }
      else if (p.pose === "call") animateRig(r, 0, dt, "call");
      else animateRig(r, 0, dt, "idle");
      if (p.pose === "grill") { r.armR.rotation.x = -1.2 + Math.sin(time * 5) * 0.25; r.armL.rotation.x = -0.9; }
      // laughing: a little bob of the head
      r.head.position.y += Math.sin(time * 6 + p.x * 3) * 0.004;
    }
    // sparklers spit
    for (const p of this.pals) {
      if (!p.spark) continue;
      const a = p.spark.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        const ang = Math.random() * Math.PI * 2, el = (Math.random() - 0.5) * Math.PI, rr = Math.random() * 0.22;
        a.setXYZ(i, Math.cos(ang) * Math.cos(el) * rr, Math.sin(el) * rr, Math.sin(ang) * Math.cos(el) * rr);
      }
      a.needsUpdate = true;
    }
    if (this.kind === "newyear") this.updateNewYear(dt, time);
    if (this.kind === "kitchen") this.updateKitchen(dt, time);
    if (this.kind !== "dacha") return;
    // smoke rises and drifts; fluff floats
    const sp = this.smoke.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      let y = sp.getY(i) + dt * this.smokeV[i];
      let x = sp.getX(i) + dt * 0.25;
      if (y > 5.5) { y = 0.9; x = 3 + (Math.random() - 0.5) * 0.5; }
      sp.setXY(i, x, y);
    }
    sp.needsUpdate = true;
    const pp = this.pollen.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) {
      pp.setX(i, pp.getX(i) + Math.sin(time * 0.3 + i) * dt * 0.15 + dt * 0.08);
      pp.setY(i, pp.getY(i) + Math.cos(time * 0.4 + i * 1.7) * dt * 0.08);
      if (pp.getX(i) > 9) pp.setX(i, -9);
    }
    pp.needsUpdate = true;
    (this.coals.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.42, 0.13).multiplyScalar(3 + Math.sin(time * 9) * 0.4 + Math.sin(time * 23) * 0.2);
  }

  /** Fireworks bursting, the garland blinking, snow coming down. */
  private updateNewYear(dt: number, time: number): void {
    this.garland.forEach((b, i) => { b.visible = Math.sin(time * 3 + i * 1.7) > -0.3; });
    if (this.snowfall) {
      const a = this.snowfall.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 0.9; if (y < 0) y += 10; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(time + i) * dt * 0.15); }
      a.needsUpdate = true;
    }
    this.fwT -= dt;
    if (this.fwT <= 0) {
      this.fwT = 0.8 + Math.random() * 1.6;
      const fw = this.fireworks.find((f) => f.t > 2.2) ?? this.fireworks[0];
      fw.t = 0;
      const cx = (Math.random() - 0.5) * 16, cy = 8 + Math.random() * 5, cz = -10 - Math.random() * 6;
      const a = fw.pts.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        a.setXYZ(i, cx, cy, cz);
        const ang = Math.random() * Math.PI * 2, el = Math.acos(2 * Math.random() - 1), sp = 3 + Math.random() * 1.5;
        fw.vel[i * 3] = Math.sin(el) * Math.cos(ang) * sp; fw.vel[i * 3 + 1] = Math.cos(el) * sp; fw.vel[i * 3 + 2] = Math.sin(el) * Math.sin(ang) * sp;
      }
      (fw.pts.material as THREE.PointsMaterial).color.setHSL(Math.random(), 0.9, 0.62);
    }
    for (const fw of this.fireworks) {
      fw.t += dt;
      const mat2 = fw.pts.material as THREE.PointsMaterial;
      mat2.opacity = fw.t < 2.2 ? Math.max(0, 1 - fw.t / 2.2) : 0;
      if (fw.t > 2.2) continue;
      const a = fw.pts.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        fw.vel[i * 3 + 1] -= dt * 2.2;
        a.setXYZ(i, a.getX(i) + fw.vel[i * 3] * dt, a.getY(i) + fw.vel[i * 3 + 1] * dt, a.getZ(i) + fw.vel[i * 3 + 2] * dt);
        fw.vel[i * 3] *= 0.985; fw.vel[i * 3 + 2] *= 0.985;
      }
      a.needsUpdate = true;
    }
  }

  /** Steam over the pot, dust in the sunbeam. */
  private updateKitchen(dt: number, time: number): void {
    if (this.steam) {
      const a = this.steam.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * (0.3 + (i % 5) * 0.06); let x = a.getX(i) + Math.sin(time * 2 + i) * dt * 0.08; if (y > 2.1) { y = 1.1; x = 0.82 + (Math.random() - 0.5) * 0.2; } a.setXY(i, x, y); }
      a.needsUpdate = true;
    }
    this.beam?.update(time, 1);
  }
}
