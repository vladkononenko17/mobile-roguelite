import { Color, Entity, StandardMaterial, Vec3, type AppBase } from "playcanvas";
import { audio } from "../audio/Audio";
import type { Combat } from "./Combat";
import type { Effects } from "./Effects";
import { aimY, isAlive, type Enemy } from "./EnemyManager";
import { gadgetStats, type GadgetId } from "./gadgets";
import type { PlayerGun } from "./PlayerGun";

const MAX_BLADES = 4;
const MAX_THROWN = 6;

interface Thrown {
  entity: Entity;
  kind: "grenade" | "molotov";
  from: Vec3;
  to: Vec3;
  t: number;
  total: number;
  level: number;
}

interface FirePatch {
  x: number;
  z: number;
  radius: number;
  burn: number;
  left: number;
  tick: number;
}

/**
 * The gadgets' behaviour (data in gadgets.ts): grenades and molotovs lobbed at the thickest visible
 * crowd, tesla arcs to the nearest foes, saw blades orbiting the hero. Damage goes through Combat as
 * "gadget" (tech) hits, so tech upgrades and the summary count them. Pooled entities, map-independent.
 */
export class GadgetSystem {
  /** A grenade went off at (x, z) (screen shake). */
  onBlast: (x: number, z: number) => void = () => {};
  private readonly root = new Entity("Gadgets");
  private readonly blades: Entity[] = [];
  private readonly thrown: Thrown[] = [];
  private readonly patches: FirePatch[] = [];
  private readonly timers = new Map<GadgetId, number>();
  private readonly cutAt = new WeakMap<Enemy, number>();
  private clock = 0;
  private spin = 0;
  private readonly a = new Vec3();
  private readonly b = new Vec3();

  constructor(
    app: AppBase,
    private readonly effects: Effects,
    private readonly combat: Combat,
    private readonly gun: PlayerGun,
  ) {
    app.root.addChild(this.root);
    const steel = new StandardMaterial();
    steel.diffuse = new Color(0.72, 0.72, 0.74);
    steel.metalness = 0.8;
    steel.useMetalness = true;
    steel.gloss = 0.7;
    steel.emissive = new Color(0.12, 0.12, 0.12);
    steel.update();
    for (let i = 0; i < MAX_BLADES; i++) {
      const e = new Entity("saw");
      e.addComponent("render", { type: "cylinder", material: steel, castShadows: false });
      e.setLocalScale(0.55, 0.03, 0.55);
      e.enabled = false;
      this.root.addChild(e);
      this.blades.push(e);
    }
    const grenade = new StandardMaterial();
    grenade.diffuse = new Color(0.25, 0.3, 0.18);
    grenade.update();
    const bottle = new StandardMaterial();
    bottle.diffuse = new Color(0.5, 0.25, 0.1);
    bottle.emissive = new Color(1, 0.45, 0.1);
    bottle.update();
    for (let i = 0; i < MAX_THROWN; i++) {
      const e = new Entity("thrown");
      e.addComponent("render", { type: "sphere", material: grenade, castShadows: false });
      e.setLocalScale(0.2, 0.2, 0.2);
      e.enabled = false;
      this.root.addChild(e);
      this.thrown.push({ entity: e, kind: "grenade", from: new Vec3(), to: new Vec3(), t: 0, total: 0, level: 1 });
    }
    this.materials = { grenade, bottle };
  }

  private readonly materials: { grenade: StandardMaterial; bottle: StandardMaterial };

  /** Clears projectiles and fire (new level / restart). */
  reset(): void {
    for (const t of this.thrown) t.entity.enabled = false;
    this.patches.length = 0;
    this.timers.clear();
  }

  update(dt: number, hero: Vec3, scale: number, owned: ReadonlyMap<GadgetId, number>, active: boolean): void {
    this.clock += dt;
    this.updateBlades(dt, hero, scale, owned.get("saws") ?? 0, active);
    this.updateThrown(dt);
    this.updatePatches(dt);
    if (!active) return;
    for (const [id, level] of owned) {
      if (id === "saws") continue;
      const s = gadgetStats(id, level);
      const left = (this.timers.get(id) ?? s.every * 0.5) - dt;
      if (left > 0) {
        this.timers.set(id, left);
        continue;
      }
      this.timers.set(id, s.every);
      if (id === "tesla") this.zap(hero, scale, s);
      else for (let i = 0; i < (s.count ?? 1); i++) this.lob(id, hero, scale, level, s.range, i);
    }
  }

  private zap(hero: Vec3, scale: number, s: Record<string, number>): void {
    const targets = this.combat.nearest(hero.x, hero.z, s.range, s.targets, []);
    if (!targets.length) return;
    this.a.set(hero.x, 1.5 * scale, hero.z);
    for (const t of targets) {
      this.b.set(t.position.x, aimY(t), t.position.z);
      this.effects.lightning(this.a, this.b);
      this.combat.hit(t, s.damage, "gadget", hero.x, hero.z, 0.08);
    }
    audio.play("shot_plasma", { rate: 1.7, volume: 0.35 });
  }

  /** Throws at the visible enemy with the most neighbours (the thickest crowd). */
  private lob(id: GadgetId, hero: Vec3, scale: number, level: number, range: number, nth: number): void {
    const first = this.gun.nearestVisible(hero.x, hero.z, range);
    if (!first) return;
    const near = this.combat.nearest(hero.x, hero.z, range, 24, []);
    let target: Enemy = first, best = -1;
    for (const e of near) {
      if (!isAlive(e)) continue;
      const crowd = this.combat.nearest(e.position.x, e.position.z, 2.5, 12, []).length;
      if (crowd > best) {
        best = crowd;
        target = e;
      }
    }
    const slot = this.thrown.find((t) => !t.entity.enabled);
    if (!slot) return;
    slot.kind = id === "molotov" ? "molotov" : "grenade";
    slot.entity.render!.material = slot.kind === "molotov" ? this.materials.bottle : this.materials.grenade;
    slot.from.set(hero.x, 1.6 * scale, hero.z);
    const off = nth * 1.6;
    slot.to.set(target.position.x + off, 0.15, target.position.z - off);
    slot.t = 0;
    slot.total = 0.5 + Math.min(0.3, Math.hypot(slot.to.x - hero.x, slot.to.z - hero.z) * 0.03);
    slot.level = level;
    slot.entity.enabled = true;
    slot.entity.setPosition(slot.from);
  }

  private updateThrown(dt: number): void {
    for (const t of this.thrown) {
      if (!t.entity.enabled) continue;
      t.t += dt;
      const k = Math.min(1, t.t / t.total);
      this.a.lerp(t.from, t.to, k);
      this.a.y += Math.sin(Math.PI * k) * 2.4;
      t.entity.setPosition(this.a);
      if (k < 1) continue;
      t.entity.enabled = false;
      const { x, z } = t.to;
      if (t.kind === "grenade") {
        const s = gadgetStats("grenade", t.level);
        this.effects.explosion(this.a.set(x, 0.2, z), s.radius);
        audio.play("explosion", { x, z, volume: 0.7, rate: 1.15 });
        for (const e of this.combat.nearest(x, z, s.radius, 32, [])) this.combat.hit(e, s.damage, "gadget", x, z, 0.3);
        this.onBlast(x, z);
      } else {
        const s = gadgetStats("molotov", t.level);
        this.patches.push({ x, z, radius: s.radius, burn: s.burn, left: s.seconds, tick: 0 });
        audio.play("pop", { x, z, rate: 1.4, volume: 0.6 });
        this.effects.ring(this.a.set(x, 0.05, z), s.radius, false);
      }
    }
  }

  private updatePatches(dt: number): void {
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const p = this.patches[i];
      p.left -= dt;
      p.tick -= dt;
      if (Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * p.radius;
        this.effects.flame(this.a.set(p.x + Math.cos(a) * r, 0.1, p.z + Math.sin(a) * r));
      }
      if (p.tick <= 0) {
        p.tick = 0.5;
        for (const e of this.combat.nearest(p.x, p.z, p.radius, 32, [])) this.combat.burnFrom(e, p.burn);
      }
      if (p.left <= 0) this.patches.splice(i, 1);
    }
  }

  private updateBlades(dt: number, hero: Vec3, scale: number, level: number, active: boolean): void {
    const s = level > 0 ? (gadgetStats("saws", level)) : null;
    const n = s ? Math.min(MAX_BLADES, s.blades) : 0;
    this.spin += dt * (s?.speed ?? 0);
    for (let i = 0; i < this.blades.length; i++) {
      const blade = this.blades[i];
      blade.enabled = i < n;
      if (i >= n || !s) continue;
      const ang = this.spin + (i / n) * Math.PI * 2;
      const x = hero.x + Math.cos(ang) * s.radius, z = hero.z + Math.sin(ang) * s.radius;
      blade.setPosition(x, 0.75 * scale, z);
      blade.setEulerAngles(0, (this.clock * 900) % 360, 0);
      if (!active) continue;
      for (const e of this.combat.nearest(x, z, 0.55 + 0.35, 6, [])) {
        if (this.clock - (this.cutAt.get(e) ?? -9) < s.hitEvery) continue;
        this.cutAt.set(e, this.clock);
        this.combat.hit(e, s.damage, "gadget", hero.x, hero.z, 0.12);
      }
    }
  }
}
