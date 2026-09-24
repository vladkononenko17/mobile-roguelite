import { Color, Entity, StandardMaterial, Vec3, type AppBase } from "playcanvas";
import { DROPS, PLAYER_COMBAT } from "./config";

export type PickupKind = "scrap" | "health" | "upgrade";

interface Pickup {
  entity: Entity;
  /** Second bar of the health plus sign (enabled only for health). */
  bar: Entity;
  kind: PickupKind;
  value: number;
  position: Vec3;
  life: number;
  spin: number;
  active: boolean;
}

function material(color: Color, glow: number): StandardMaterial {
  const m = new StandardMaterial();
  m.diffuse.copy(color);
  m.emissive.set(color.r * glow, color.g * glow, color.b * glow);
  m.gloss = 0.6;
  m.update();
  return m;
}

const LOOK: Record<PickupKind, { size: [number, number, number]; material: () => StandardMaterial }> = {
  scrap: { size: [0.22, 0.22, 0.22], material: () => material(new Color(1, 0.72, 0.15), 0.45) },
  // A flat plus sign (the second bar is a child).
  health: { size: [0.36, 0.12, 0.12], material: () => material(new Color(0.3, 0.95, 0.35), 0.5) },
  upgrade: { size: [0.3, 0.3, 0.3], material: () => material(new Color(0.35, 0.8, 1), 0.7) },
};

/**
 * Drops on the ground: scrap (run currency), small heals and rare upgrades. Pooled primitives that
 * bob and spin (readable from the top-down camera); within the magnet radius they fly to the hero,
 * and blink before they expire. One shared material per kind.
 */
export class Pickups {
  private readonly items: Pickup[] = [];
  private readonly root = new Entity("Pickups");

  /** Called when the hero collects one. */
  onCollect: (kind: PickupKind, value: number) => void = () => {};

  constructor(app: AppBase) {
    app.root.addChild(this.root);
    const materials = new Map<PickupKind, StandardMaterial>();
    for (let i = 0; i < DROPS.pool; i++) {
      const entity = new Entity("pickup");
      entity.addComponent("render", { type: "box", castShadows: false });
      const bar = new Entity("cross");
      bar.addComponent("render", { type: "box", castShadows: false });
      bar.setLocalScale(0.3, 1, 3);
      bar.enabled = false;
      entity.addChild(bar);
      entity.enabled = false;
      this.root.addChild(entity);
      this.items.push({ entity, bar, kind: "scrap", value: 0, position: new Vec3(), life: 0, spin: 0, active: false });
    }
    this.materials = (kind) => {
      let m = materials.get(kind);
      if (!m) materials.set(kind, (m = LOOK[kind].material()));
      return m;
    };
  }

  private readonly materials: (kind: PickupKind) => StandardMaterial;

  drop(kind: PickupKind, x: number, z: number, value = 1): void {
    const p = this.items.find((i) => !i.active) ?? this.items.reduce((a, b) => (a.life < b.life ? a : b));
    const look = LOOK[kind];
    p.kind = kind;
    p.value = value;
    p.active = true;
    p.life = DROPS.lifetime;
    p.spin = Math.random() * 360;
    // A little scatter so several drops do not overlap.
    p.position.set(x + (Math.random() - 0.5) * 0.8, 0, z + (Math.random() - 0.5) * 0.8);
    p.entity.render!.meshInstances[0].material = this.materials(kind);
    p.entity.setLocalScale(look.size[0], look.size[1], look.size[2]);
    p.bar.enabled = kind === "health";
    if (p.bar.enabled) p.bar.render!.meshInstances[0].material = this.materials(kind);
    p.entity.enabled = true;
  }

  /** `vacuum`: everything flies to the hero (end of a level). */
  update(dt: number, player: Vec3, scale: number, vacuum = false): void {
    const magnet = vacuum ? 1000 : PLAYER_COMBAT.magnetRadius, grab = PLAYER_COMBAT.pickupRadius;
    for (const p of this.items) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.remove(p);
        continue;
      }
      const dx = player.x - p.position.x, dz = player.z - p.position.z;
      const d = Math.hypot(dx, dz);
      if (d < grab) {
        this.onCollect(p.kind, p.value);
        this.remove(p);
        continue;
      }
      if (d < magnet) {
        const step = Math.min(d, PLAYER_COMBAT.magnetSpeed * dt * (vacuum ? 2.5 : 1 + (magnet - d) / magnet));
        p.position.x += (dx / d) * step;
        p.position.z += (dz / d) * step;
      }
      p.spin += dt * 140;
      const bob = 0.35 + Math.sin(p.spin * 0.05) * 0.08;
      p.entity.setPosition(p.position.x, bob * scale, p.position.z);
      p.entity.setEulerAngles(p.kind === "upgrade" ? 45 : 0, p.spin, p.kind === "upgrade" ? 45 : 0);
      // Blink during the last three seconds.
      p.entity.enabled = p.life > 3 || Math.floor(p.life * 6) % 2 === 0;
    }
  }

  private remove(p: Pickup): void {
    p.active = false;
    p.entity.enabled = false;
  }

  clear(): void {
    for (const p of this.items) if (p.active) this.remove(p);
  }
}
