import * as THREE from "three";
import type { HouseDoor } from "./house";
import { HOUSE } from "./house";
import type { Box2, WorldIndex } from "./index";

/**
 * The barriers between stages: red-and-white tape across the side passages
 * to the back yard and across the doorways inside, and the house doors shut.
 * Each passage opens when the job reaches its stage (see game/stages.ts).
 */

interface Passage {
  id: string;
  /** Opens once the current stage index reaches this. */
  opensAt: number;
  boxes: Box2[];
  tape: THREE.Group | null;
  doors: HouseDoor[];
  open: boolean;
  /** 0 → 1 while opening. */
  anim: number;
}

let tapeTex: THREE.CanvasTexture | null = null;
function tapeTexture(): THREE.CanvasTexture {
  if (tapeTex) return tapeTex;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 16;
  const x = c.getContext("2d")!;
  x.fillStyle = "#f4f1ea";
  x.fillRect(0, 0, 128, 16);
  x.fillStyle = "#e0262b";
  for (let i = -16; i < 128; i += 32) {
    x.beginPath();
    x.moveTo(i, 16); x.lineTo(i + 16, 0); x.lineTo(i + 32, 0); x.lineTo(i + 16, 16);
    x.fill();
  }
  tapeTex = new THREE.CanvasTexture(c);
  tapeTex.colorSpace = THREE.SRGBColorSpace;
  tapeTex.wrapS = THREE.RepeatWrapping;
  tapeTex.anisotropy = 4;
  return tapeTex;
}

let signTex: THREE.CanvasTexture | null = null;
function signTexture(): THREE.CanvasTexture {
  if (signTex) return signTex;
  const c = document.createElement("canvas");
  c.width = 256; c.height = 96;
  const x = c.getContext("2d")!;
  x.fillStyle = "#ffcf3c";
  x.beginPath();
  x.roundRect(0, 0, 256, 96, 16);
  x.fill();
  x.lineWidth = 8;
  x.strokeStyle = "#2a1e00";
  x.beginPath();
  x.roundRect(6, 6, 244, 84, 12);
  x.stroke();
  x.fillStyle = "#2a1e00";
  x.font = "900 40px Rubik, system-ui, sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("ЗАКРИТО", 128, 50);
  signTex = new THREE.CanvasTexture(c);
  signTex.colorSpace = THREE.SRGBColorSpace;
  return signTex;
}

/** Two strands of tape from a to b at floor height y, with posts when outdoors. */
function tapeLine(g: THREE.Group, a: THREE.Vector2, b: THREE.Vector2, y: number, posts: boolean, sign: boolean): void {
  const len = a.distanceTo(b);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const tex = tapeTexture().clone();
  tex.repeat.set(len / 0.5, 1);
  tex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, side: THREE.DoubleSide });
  for (const h of [0.8, 1.25]) {
    // sagging strand: a strip bent down in the middle
    const geo = new THREE.PlaneGeometry(len, 0.075, 12, 1);
    const p = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const t = p.getX(i) / len + 0.5;
      p.setY(i, p.getY(i) - Math.sin(t * Math.PI) * Math.min(0.12, len * 0.015));
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.set((a.x + b.x) / 2, y + h, (a.y + b.y) / 2);
    m.rotation.y = -ang;
    m.castShadow = true;
    g.add(m);
  }
  if (posts) {
    const n = Math.max(1, Math.round(len / 3));
    const postMat = new THREE.MeshStandardMaterial({ color: 0xe86a1c, roughness: 0.6 });
    const postGeo = new THREE.CylinderGeometry(0.03, 0.035, 1.4, 8);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const m = new THREE.Mesh(postGeo, postMat);
      m.position.set(a.x + (b.x - a.x) * t, y + 0.7, a.y + (b.y - a.y) * t);
      m.castShadow = true;
      g.add(m);
    }
  }
  if (sign) {
    // one plate per side, so the word reads correctly from both rooms
    const plate = new THREE.PlaneGeometry(0.62, 0.23);
    const mat = new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6 });
    for (const flip of [0, Math.PI]) {
      const s = new THREE.Mesh(plate, mat);
      s.position.set((a.x + b.x) / 2, y + 1.02, (a.y + b.y) / 2);
      s.rotation.set(0, -ang + flip, 0.04);
      s.position.x += Math.sin(-ang + flip) * 0.006;
      s.position.z += Math.cos(-ang + flip) * 0.006;
      g.add(s);
    }
  }
}

export class Gates {
  readonly group = new THREE.Group();
  private passages: Passage[] = [];
  private W: WorldIndex;

  constructor(W: WorldIndex, doors: { front: HouseDoor; back: HouseDoor; side: HouseDoor }) {
    this.W = W;
    const F = HOUSE.floorY, X = HOUSE.halfX, Z = HOUSE.halfZ;
    const V2 = (x: number, z: number) => new THREE.Vector2(x, z);
    const BZ = -Z - 0.6;

    // back yard: both side passages
    this.add("backyard", 1, [[V2(-16, BZ), V2(-X - 0.12, BZ)], [V2(X + 0.12, BZ), V2(16, BZ)]], 0, true, []);
    // the house: front door (back and side doors open with the back hall)
    this.add("house", 2, [], F, false, [doors.front], [[-2.62, -1.58, Z - 0.15, Z + 0.15]]);
    // rooms, in order: living → bedroom → kitchen → bathroom → back hall
    this.add("bed", 3, [[V2(-3.89, 0), V2(-2.99, 0)]], F, false, []);
    this.add("kitchen", 4, [[V2(1, 1.06), V2(1, 3.46)]], F, false, []);
    this.add("bath", 5, [[V2(1.21, 0), V2(2.01, 0)]], F, false, []);
    this.add("hall", 6, [[V2(4.11, 0), V2(5.71, 0)]], F, false, [doors.back, doors.side],
      [[4.48, 5.52, -Z - 0.15, -Z + 0.15], [X - 0.15, X + 0.15, -3.52, -2.48]]);
  }

  private add(
    id: string, opensAt: number, lines: Array<[THREE.Vector2, THREE.Vector2]>, y: number, outdoor: boolean,
    doors: HouseDoor[], extra: Array<[number, number, number, number]> = [],
  ): void {
    const tape = lines.length ? new THREE.Group() : null;
    const boxes: Box2[] = [];
    lines.forEach(([a, b], i) => {
      tapeLine(tape!, a, b, y, outdoor, i === 0);
      boxes.push({ x0: Math.min(a.x, b.x) - 0.12, x1: Math.max(a.x, b.x) + 0.12, z0: Math.min(a.y, b.y) - 0.12, z1: Math.max(a.y, b.y) + 0.12, y0: -1, y1: 4 });
    });
    for (const [x0, x1, z0, z1] of extra) boxes.push({ x0, x1, z0, z1, y0: -1, y1: 4 });
    if (tape) this.group.add(tape);
    this.passages.push({ id, opensAt, boxes, tape, doors, open: false, anim: 0 });
  }

  /** Closes everything not open at `stage`, opens the rest at once (loading a save). */
  init(stage: number): void {
    for (const p of this.passages) {
      p.open = stage >= p.opensAt;
      p.anim = p.open ? 1 : 0;
      for (const d of p.doors) d.pivot.rotation.y = p.open ? d.open : 0;
      if (p.tape) p.tape.visible = !p.open;
      if (!p.open) this.W.boxes.push(...p.boxes);
    }
  }

  /** Opens passages for a new stage; returns how many opened. */
  advance(stage: number): number {
    let n = 0;
    for (const p of this.passages) {
      if (p.open || stage < p.opensAt) continue;
      p.open = true;
      n++;
      this.W.boxes = this.W.boxes.filter((b) => !p.boxes.includes(b));
    }
    return n;
  }

  /** A closed passage whose barrier is within `r` of a point, if any. */
  closedNear(pos: THREE.Vector3, r: number): string | null {
    for (const p of this.passages) {
      if (p.open) continue;
      for (const b of p.boxes) {
        const dx = Math.max(b.x0 - pos.x, 0, pos.x - b.x1), dz = Math.max(b.z0 - pos.z, 0, pos.z - b.z1);
        if (Math.hypot(dx, dz) < r) return p.id;
      }
    }
    return null;
  }

  update(dt: number): void {
    for (const p of this.passages) {
      if (!p.open || p.anim >= 1) continue;
      p.anim = Math.min(1, p.anim + dt * 1.2);
      const k = 1 - Math.pow(1 - p.anim, 3);
      for (const d of p.doors) d.pivot.rotation.y = d.open * k;
      if (p.tape) {
        // the tape drops to the floor and disappears
        p.tape.position.y = -1.2 * k * k;
        p.tape.visible = p.anim < 1;
      }
    }
  }
}

/** Which stage a point needs to be reachable (−1 = always). */
export function stageAt(x: number, z: number): number {
  const X = HOUSE.halfX, Z = HOUSE.halfZ;
  if (Math.abs(x) < X && Math.abs(z) < Z) {
    if (z > 0) return x < 1 ? 2 : 4;
    if (x < 0) return 3;
    return x < 3 ? 5 : 6;
  }
  if (z < -Z - 0.6 && Math.abs(x) < 16.2) return 1;
  return -1;
}
