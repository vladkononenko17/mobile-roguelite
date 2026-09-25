import { Color, Entity, StandardMaterial, Vec3, type AppBase } from "playcanvas";
import { COMBAT_FX } from "./config";
import type { Combat } from "./Combat";
import type { Effects } from "./Effects";
import type { PlayerGun } from "./PlayerGun";
import { aimY } from "./EnemyManager";

const MAX_DRONES = 5;
const ORBIT_RADIUS = 1.05;
const ORBIT_SPEED = 1.3;

interface Drone {
  entity: Entity;
  cooldown: number;
}

/**
 * Sentry drones (the Sentry Drone upgrade): small machines orbiting the hero's shoulders, each firing
 * at the nearest enemy that is visible on screen (the gun's targeting rules), with a tracer. Damage
 * goes through Combat as a "drone" (tech) hit. Pooled; the count follows PlayerStats.drones.
 */
export class Drones {
  private readonly drones: Drone[] = [];
  private readonly root = new Entity("Drones");
  private angle = 0;
  private readonly muzzle = new Vec3();
  private readonly target = new Vec3();

  constructor(
    app: AppBase,
    private readonly effects: Effects,
    private readonly combat: Combat,
    private readonly gun: PlayerGun,
  ) {
    app.root.addChild(this.root);
    const shell = new StandardMaterial();
    shell.diffuse = new Color(0.22, 0.24, 0.26);
    shell.gloss = 0.55;
    shell.metalness = 0.4;
    shell.useMetalness = true;
    shell.update();
    const eye = new StandardMaterial();
    eye.diffuse.set(0, 0, 0);
    eye.emissive = new Color(0.4, 0.85, 1);
    eye.useLighting = false;
    eye.update();
    for (let i = 0; i < MAX_DRONES; i++) {
      const entity = new Entity("drone");
      const body = new Entity("body");
      body.addComponent("render", { type: "box", material: shell, castShadows: false });
      body.setLocalScale(0.24, 0.08, 0.24);
      const light = new Entity("eye");
      light.addComponent("render", { type: "sphere", material: eye, castShadows: false });
      light.setLocalScale(0.09, 0.09, 0.09);
      light.setLocalPosition(0, 0.05, 0);
      entity.addChild(body);
      entity.addChild(light);
      entity.enabled = false;
      this.root.addChild(entity);
      this.drones.push({ entity, cooldown: COMBAT_FX.droneInterval * (i / MAX_DRONES) });
    }
  }

  update(dt: number, hero: Vec3, count: number, scale: number, active: boolean): void {
    const n = Math.min(MAX_DRONES, Math.round(count));
    this.angle += dt * ORBIT_SPEED;
    for (let i = 0; i < this.drones.length; i++) {
      const d = this.drones[i];
      d.entity.enabled = i < n;
      if (i >= n) continue;
      const a = this.angle + (i / n) * Math.PI * 2;
      const y = (1.95 + Math.sin(this.angle * 3 + i) * 0.06) * scale;
      d.entity.setPosition(hero.x + Math.cos(a) * ORBIT_RADIUS, y, hero.z + Math.sin(a) * ORBIT_RADIUS);
      d.entity.setEulerAngles(0, (-a * 180) / Math.PI, 0);
      if (!active) continue;
      d.cooldown -= dt;
      if (d.cooldown > 0) continue;
      const p = d.entity.getPosition();
      const t = this.gun.nearestVisible(p.x, p.z, COMBAT_FX.droneRange);
      if (!t) {
        d.cooldown = 0.2;
        continue;
      }
      d.cooldown = COMBAT_FX.droneInterval;
      this.muzzle.copy(p);
      this.target.set(t.position.x, aimY(t), t.position.z);
      this.effects.muzzleFlash(this.muzzle, 0.12);
      this.effects.tracer(this.muzzle, this.target);
      this.combat.hit(t, COMBAT_FX.droneDamage, "drone", p.x, p.z, 0.04);
    }
  }
}
