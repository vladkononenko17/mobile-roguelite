import * as THREE from "three";
import { instance, pbrMaterial } from "../assets";
import { LOST_ITEMS, PAY } from "../content";
import type { LeafField } from "../clean/leaffield";
import type { Lawn } from "../clean/lawn";
import { rng } from "../sim";
import { HOUSE } from "../world/house";
import type { WorldIndex } from "../world/index";
import { HAY, LOT, POOL, PUMP, isLawn } from "../world/yard";

/**
 * Small jobs around the plot: trash to pick up, coins in the grass and under
 * leaves, things buried for the metal detector (and the client's lost item
 * in the haystack), broken roof tiles, and the pool chemistry once the pool
 * is skimmed. Each reports to the ledger through `pay`.
 */

export interface JobsDeps {
  W: WorldIndex;
  scene: THREE.Object3D;
  seed: number;
  restore: (key: string) => number;
  mark: (key: string, v: number) => void;
  pay: (key: string, amount: number, text: string) => void;
  toast: (text: string) => void;
  sfx: (name: "pick" | "coin" | "dig" | "fix" | "chem") => void;
  coinMul: () => number;
  onRoof: () => boolean;
  poolLeaves: LeafField;
  lawn: Lawn;
  setPoolClean: (k: number) => void;
}

interface Trash { id: string; obj: THREE.Object3D; name: string; done: boolean }
interface Coin { key: string; mesh: THREE.Mesh; value: number; done: boolean; base: number }
export interface Buried { key: string; pos: THREE.Vector3; value: number; name: string; lost: boolean; done: boolean }
interface Tile { key: string; hole: THREE.Mesh; patch: THREE.Mesh; done: boolean }

const TRASH: Array<[model: string, name: string, x: number, y: number, z: number, rot: number]> = [
  ["cardboard_box_01", "картонна коробка", -0.4, HOUSE.floorY, 4.3, 0.4],
  ["cardboard_box_01", "картонна коробка", -0.1, HOUSE.floorY, 3.7, 1.1],
  ["trashbag", "мішок зі сміттям", 0.3, HOUSE.floorY, 4.5, 0],
  ["trashbag", "мішок зі сміттям", -6.3, HOUSE.floorY, -0.8, 2],
  ["cardboard_box_01", "коробка зі старим мотлохом", -1.0, HOUSE.floorY, -4.4, 0.3],
  ["can_rusted", "іржава банка", 6.2, 0.02, 9.8, 0],
  ["can_rusted", "іржава банка", -8.5, 0.02, 17.5, 1],
  ["can_rusted", "іржава банка", 12.8, 0.05, -10.5, 2],
  ["plastic_crate_01", "поламаний ящик", 14.2, 0, -16.2, 0.4],
  ["wooden_bucket_01", "діряве відро", -14.5, 0, -19.5, 1.3],
  ["trashbag", "мішок з листям від минулих господарів", 8.0, 0, -20.6, 0.5],
  ["old_tyre", "стара шина", 4.5, 0, -14.5, 0],
  ["cardboard_box_01", "розмокла коробка", 11.6, 0.05, 1.8, 0.9],
];

export class Jobs {
  trash: Trash[] = [];
  coins: Coin[] = [];
  buried: Buried[] = [];
  tiles: Tile[] = [];
  lostName: string;
  poolChem = { done: false, t: 0, running: false };
  private d: JobsDeps;
  private flying: Array<{ obj: THREE.Object3D; t: number; from: THREE.Vector3; to: () => THREE.Vector3 }> = [];

  constructor(d: JobsDeps) {
    this.d = d;
    const r = rng(d.seed ^ 0x7a7a);
    const lost = LOST_ITEMS[Math.floor(r() * LOST_ITEMS.length)];
    this.lostName = lost.name;
    this.poolChem.done = d.restore("pool:chem") >= 1;
    this.placeCoins(r);
    this.placeBuried(r, lost.name);
    this.placeTiles(r);
    this.registerPool();
  }

  async loadTrash(): Promise<void> {
    await Promise.all(TRASH.map(async ([model, name, x, y, z, rot], i) => {
      const id = `trash:${i}`;
      if (this.d.restore(id) >= 1) return;
      let obj: THREE.Object3D;
      try { obj = await instance(model); } catch { return; }
      obj.position.set(x, y, z);
      obj.rotation.y = rot;
      this.d.scene.add(obj);
      const t: Trash = { id, obj, name, done: false };
      this.trash.push(t);
      const box = new THREE.Box3().setFromObject(obj);
      const c = box.getCenter(new THREE.Vector3());
      this.d.W.interactables.push({
        id, pos: c, reach: 2.4, kind: "pick", hold: 0, aimR: Math.max(0.3, box.getSize(new THREE.Vector3()).length() * 0.45),
        label: () => `Прибрати: ${name}`,
        enabled: () => !t.done,
        act: () => {
          t.done = true;
          this.d.mark(id, 1);
          this.d.sfx("pick");
          this.d.pay(id, PAY.trash, `Прибрав ${name}`);
          this.fly(obj);
        },
      });
    }));
  }

  /** Throws an object up and over the shoulder into the bag. */
  private fly(obj: THREE.Object3D): void {
    const from = obj.position.clone();
    this.flying.push({ obj, t: 0, from, to: () => from.clone().add(new THREE.Vector3(0, 2.2, 0)) });
  }

  private placeCoins(r: () => number): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 1, roughness: 0.28, emissive: 0x3a2800, emissiveIntensity: 0.4 });
    const geo = new THREE.CylinderGeometry(0.035, 0.035, 0.006, 20);
    let n = 0;
    for (let tries = 0; n < 16 && tries < 500; tries++) {
      const x = LOT.x0 + 1 + r() * (LOT.x1 - LOT.x0 - 2), z = LOT.z0 + 1 + r() * (LOT.z1 - LOT.z0 - 2);
      if (!isLawn(x, z)) continue;
      const key = `coin:${n}`;
      const value = 5 + Math.floor(r() * 5) * 5;
      n++;
      if (this.d.restore(key) >= 1) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0.05, z);
      mesh.rotation.set(Math.PI / 2 - 0.3, r() * 3, 0);
      mesh.castShadow = true;
      this.d.scene.add(mesh);
      this.coins.push({ key, mesh, value, done: false, base: r() * 6 });
    }
  }

  private placeBuried(r: () => number, lostName: string): void {
    const key0 = "find:lost";
    // the client's lost thing: inside the haystack, near its edge
    const a = r() * Math.PI * 2;
    this.buried.push({ key: key0, pos: new THREE.Vector3(HAY.x + Math.cos(a) * HAY.r * 0.75, 0.3, HAY.z + Math.sin(a) * HAY.r * 0.75), value: PAY.lostItem, name: lostName, lost: true, done: this.d.restore(key0) >= 1 });
    const names = ["стара монета", "ложка", "іграшкова машинка", "кільце від ключів", "гудзик від шинелі", "бляшанка з копійками"];
    let n = 0;
    for (let tries = 0; n < 6 && tries < 400; tries++) {
      const x = LOT.x0 + 1 + r() * (LOT.x1 - LOT.x0 - 2), z = LOT.z0 + 1 + r() * (LOT.z1 - LOT.z0 - 2);
      if (!isLawn(x, z)) continue;
      const key = `find:${n}`;
      this.buried.push({ key, pos: new THREE.Vector3(x, 0, z), value: 40 + Math.floor(r() * 9) * 10, name: names[n % names.length], lost: false, done: this.d.restore(key) >= 1 });
      n++;
    }
  }

  /** Digs at `pos` (the detector coil); returns the find, if any was in reach. */
  dig(pos: THREE.Vector3): Buried | null {
    let best: Buried | null = null, bd = 0.9;
    for (const b of this.buried) {
      if (b.done) continue;
      const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return null;
    best.done = true;
    this.d.mark(best.key, 1);
    this.d.sfx("dig");
    this.d.pay(best.key, best.value, best.lost ? `Знайшов ${best.name}! Господар буде радий` : `Знайшов: ${best.name}`);
    return best;
  }

  /** Distance to the nearest buried thing (for the beeps), and its direction. */
  nearestBuried(pos: THREE.Vector3): { d: number; dir: THREE.Vector3 } | null {
    let best: Buried | null = null, bd = Infinity;
    for (const b of this.buried) {
      if (b.done) continue;
      const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best ? { d: bd, dir: new THREE.Vector3(best.pos.x - pos.x, 0, best.pos.z - pos.z).normalize() } : null;
  }

  private placeTiles(r: () => number): void {
    const { floorY: F, wallH: H, halfX: X, halfZ: Z, ridge: R } = HOUSE;
    const ang = Math.atan2(R, Z);
    const top = F + H;
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x1a120e, roughness: 1 });
    // a new tile: the same clay tile texture as the roof, just clean and a bit brighter
    const patchMat = new THREE.MeshStandardMaterial({ color: 0xb4583a, roughness: 0.6 });
    void pbrMaterial("clay_roof_tiles_02", { scale: 0.4, color: 0xd9b49c }).then((m) => {
      for (const t of this.tiles) t.patch.material = m;
    }).catch(() => { /* keep the plain colour */ });
    for (let i = 0; i < 4; i++) {
      const key = `tile:${i}`;
      const s = i % 2 === 0 ? 1 : -1;
      const x = -X + 1.5 + r() * (2 * X - 3);
      const d = 1.0 + r() * (Z - 1.8);
      const z = s * d;
      const y = top + R - (d / Z) * R + 0.07 / Math.cos(ang) + 0.075;
      const mk = (mat: THREE.Material) => {
        const geo = new THREE.BoxGeometry(0.34, 0.02, 0.3);
        // UVs in roof units (metres × 0.4, like the roof slabs) so the tiles line up in size
        const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.34 * 0.4 + x * 0.16, uv.getY(k) * 0.3 * 0.4);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.x = s * ang;
        this.d.scene.add(m);
        return m;
      };
      const done = this.d.restore(key) >= 1;
      const hole = mk(holeMat), patch = mk(patchMat);
      hole.visible = !done;
      patch.visible = done;
      const tile: Tile = { key, hole, patch, done };
      this.tiles.push(tile);
      this.d.W.interactables.push({
        id: key, pos: hole.position.clone(), reach: 2.2, kind: "fix", hold: 1.2, aimR: 0.4,
        label: () => "Полатати черепицю",
        enabled: () => !tile.done && this.d.onRoof(),
        act: () => {
          tile.done = true;
          hole.visible = false;
          patch.visible = true;
          this.d.mark(key, 1);
          this.d.sfx("fix");
          this.d.pay(key, PAY.roofTile, "Нова черепиця на місці");
        },
      });
    }
  }

  private registerPool(): void {
    this.d.W.interactables.push({
      id: "pool:chem", pos: new THREE.Vector3(PUMP.x, 0.5, PUMP.z), reach: 2.4, kind: "chem", hold: 2, aimR: 0.6,
      label: () => (this.d.poolLeaves.share() < 0.9 ? `Спершу виловити листя (${Math.round(this.d.poolLeaves.share() * 100)}%)` : "Очистити воду хімією"),
      enabled: () => !this.poolChem.done && !this.poolChem.running,
      act: () => {
        if (this.d.poolLeaves.share() < 0.9) {
          this.d.toast("Спершу виловити листя сачком");
          return;
        }
        this.poolChem.running = true;
        this.d.sfx("chem");
      },
    });
  }

  update(dt: number, t: number, player: THREE.Vector3): void {
    // coins: spin and glint; picked up by walking over them
    for (const c of this.coins) {
      if (c.done) continue;
      c.mesh.rotation.z = t * 2 + c.base;
      const hidden = this.d.lawn.tallAt(c.mesh.position.x, c.mesh.position.z);
      c.mesh.position.y = hidden ? 0.05 : 0.07 + Math.sin(t * 3 + c.base) * 0.015;
      const dx = c.mesh.position.x - player.x, dz = c.mesh.position.z - player.z;
      if (dx * dx + dz * dz < 0.8 && player.y < 2.6) {
        c.done = true;
        this.d.mark(c.key, 1);
        this.d.sfx("coin");
        this.d.pay(c.key, c.value * this.d.coinMul(), "Монетка!");
        this.fly(c.mesh);
      }
    }
    if (this.poolChem.running) {
      this.poolChem.t = Math.min(1, this.poolChem.t + dt / 4);
      this.d.setPoolClean(this.poolChem.t);
      if (this.poolChem.t >= 1) {
        this.poolChem.running = false;
        this.poolChem.done = true;
        this.d.mark("pool:chem", 1);
        this.d.pay("pool:chem", PAY.poolChem, "Басейн знову блакитний");
      }
    }
    this.flying = this.flying.filter((f) => {
      f.t += dt * 2.2;
      const k = Math.min(1, f.t);
      f.obj.position.lerpVectors(f.from, f.to(), k * k);
      f.obj.scale.setScalar(Math.max(0.01, 1 - k * 0.9));
      f.obj.rotation.y += dt * 8;
      if (k >= 1) {
        f.obj.removeFromParent();
        return false;
      }
      return true;
    });
  }

  /** Counts for the checklist. */
  summary(): Array<{ key: string; name: string; done: number; total: number }> {
    return [
      { key: "trash", name: "Сміття", done: this.trash.filter((t) => t.done).length + (TRASH.length - this.trash.length), total: TRASH.length },
      { key: "tiles", name: "Черепиця на даху", done: this.tiles.filter((t) => t.done).length, total: this.tiles.length },
      { key: "lost", name: `Знайти ${this.lostName}`, done: this.buried.filter((b) => b.lost && b.done).length, total: 1 },
      { key: "pool:chem", name: "Вода в басейні", done: this.poolChem.done ? 1 : 0, total: 1 },
    ];
  }
}

export { POOL };
