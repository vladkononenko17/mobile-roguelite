import * as THREE from "three";
import { animateRig, at, makeBench, makePerson, makeTree, mat, mesh, type Rig } from "../../../rozshuk/src/three/models.ts";
import { glowMat } from "./post.ts";

/**
 * The photo on the fridge, lived again: July 2021, a dacha in Kozyn. Long
 * golden light, a table under the apple tree, the grill smoking, five friends
 * — and you, before: no beard, a yellow T-shirt, somewhere to go.
 */
export interface MemoryFriend { color: number; dead: boolean }

interface Pal { rig: Rig; x: number; z: number; yaw: number; pose: "idle" | "sit" | "call" | "grill"; dead: boolean }

const SPOTS: Array<{ x: number; z: number; yaw: number; pose: Pal["pose"] }> = [
  { x: 3.3, z: -1.8, yaw: Math.PI * 0.85, pose: "grill" },
  { x: -0.7, z: -1.75, yaw: 0, pose: "sit" },
  { x: 1.7, z: 0.9, yaw: -2.3, pose: "call" },
  { x: -2.6, z: 0.4, yaw: 1.2, pose: "idle" },
  { x: 0.8, z: -0.25, yaw: Math.PI, pose: "sit" },
];

export class Memory {
  readonly group = new THREE.Group();
  readonly hero: Rig;
  readonly heroPos = new THREE.Vector3(0, 0, 3.2);
  heroYaw = Math.PI;
  private pals: Pal[] = [];
  private smoke: THREE.Points;
  private smokeV: Float32Array;
  private pollen: THREE.Points;
  private coals: THREE.Mesh;

  constructor() {
    const g = this.group;
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
    // you, before
    this.hero = makePerson({ top: 0xe8c45a, pants: 0x3f5f8a, shoes: 0xf0ece4, hat: "none" });
    const hair = mesh(new THREE.SphereGeometry(0.285, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(0x5a3a22), 0.012);
    at(hair, 0, 0.04, -0.02, this.hero.head);
    g.add(this.hero.root);
    g.visible = false;
  }

  /** Puts the five friends in the picture. Someone who is gone now is there, but faded. */
  setup(friends: MemoryFriend[]): void {
    for (const p of this.pals) this.group.remove(p.rig.root);
    this.pals = friends.slice(0, 5).map((f, i) => {
      const s = SPOTS[i];
      const rig = makePerson({ top: f.color, pants: [0x3a3a44, 0x4a5a7a, 0x2f3f3a, 0x5a4a3a, 0x3a4a6a][i], hat: i === 2 ? "cap" : "none", hatColor: 0xd8d0c0, build: 0.95 + (i % 3) * 0.05 });
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
      this.group.add(rig.root);
      return { rig, x: s.x, z: s.z, yaw: s.yaw, pose: s.pose, dead: f.dead };
    });
    this.heroPos.set(0, 0, 3.2);
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
      const p = new THREE.Vector3(Math.max(-9, Math.min(9, nx)), 0, Math.max(-8.2, Math.min(6, nz)));
      // around the table, the grill, the house
      const blocks: Array<[number, number, number, number]> = [[-1.4, -2.1, 1.2, 0.1], [2.4, -2.9, 3.6, -2.3], [-7.6, -7.4, -2.8, -3.4]];
      for (const [x0, z0, x1, z1] of blocks) {
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
      if (p.pose === "sit") { animateRig(r, 0, dt, "sit"); r.head.rotation.y = near ? Math.max(-0.8, Math.min(0.8, dy)) : Math.sin(time * 0.7 + p.x) * 0.2; }
      else if (p.pose === "call") animateRig(r, 0, dt, "call");
      else animateRig(r, 0, dt, "idle");
      if (p.pose === "grill") { r.armR.rotation.x = -1.2 + Math.sin(time * 5) * 0.25; r.armL.rotation.x = -0.9; }
      // laughing: a little bob of the head
      r.head.position.y += Math.sin(time * 6 + p.x * 3) * 0.004;
    }
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
}
