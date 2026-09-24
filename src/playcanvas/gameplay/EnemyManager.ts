import { Entity, Vec3, type AnimTrack, type AppBase, type ContainerResource, type MeshInstance, type RenderComponent, type StandardMaterial } from "playcanvas";
import { ENEMIES, ENEMY_LIMITS, type EnemyDef, type EnemyId } from "./config";
import type { Hazards } from "./Hazards";
import type { NavField } from "./NavField";
import type { CollisionWorld } from "../world/collision/CollisionWorld";

/** A loaded character GLB that enemy bodies are cloned from. */
export interface BodySource {
  resource: ContainerResource;
  tracks: AnimTrack[];
}

type State = "move" | "attack" | "telegraph" | "charge" | "recover" | "throw" | "slam" | "dead";

export interface Enemy {
  id: EnemyId;
  def: EnemyDef;
  root: Entity;
  model: Entity;
  meshes: MeshInstance[];
  normalMaterial: StandardMaterial;
  flashMaterial: StandardMaterial;
  active: boolean;
  hp: number;
  maxHp: number;
  damageScale: number;
  position: Vec3;
  /** Knockback / charge velocity (m/s), decays. */
  push: Vec3;
  state: State;
  stateTime: number;
  cooldown: number;
  specialCooldown: number;
  flash: number;
  yaw: number;
  dirX: number;
  dirZ: number;
  hitDone: boolean;
  marker: ReturnType<Hazards["ring"]>;
  /** Seconds spent somewhere the player cannot be reached from (outside the arena, inside a wall). */
  stuck: number;
}

interface Pool {
  source: BodySource;
  free: Enemy[];
  /** The GLB's own material, the base for the per-type tinted copies. */
  baseMaterial: StandardMaterial | null;
  bodies: Set<Enemy>;
}

/**
 * Enemies: pooled bodies cloned from the already loaded character GLBs (tinted per type, sharing one
 * material per type; a second material flashes on hits), each with a tiny anim graph (Move / Attack /
 * Death / Special). Behaviour per type from ENEMIES (`chaser`, `charger`, `thrower`, `tank`): chase
 * along the NavField, separate from each other, slide along walls, wind up and hit in melee, plus
 * the bosses' specials. No physics engine; everything is a circle on the ground plane.
 */
export class EnemyManager {
  readonly alive: Enemy[] = [];
  private readonly pools = new Map<string, Pool>();
  private readonly materials = new Map<string, { normal: StandardMaterial; flash: StandardMaterial }>();
  /** Set when the boss rig failed to load: bosses use the survivor body. */
  bossFallback = false;
  private readonly root = new Entity("Enemies");
  private readonly steer = { x: 0, z: 0 };
  private readonly tmp = new Vec3();

  /** Called when an enemy lands a melee (or charge / slam) hit on the player. */
  onPlayerHit: (damage: number, from: Enemy) => void = () => {};
  /** Called when an enemy dies. */
  onDeath: (enemy: Enemy) => void = () => {};
  /** Called for a boss stranded somewhere unreachable (move it); regular enemies are recycled. */
  onStranded: (enemy: Enemy) => void = () => {};

  constructor(
    app: AppBase,
    private readonly collision: CollisionWorld,
    private readonly nav: NavField,
    private readonly hazards: Hazards,
  ) {
    app.root.addChild(this.root);
  }

  /** Registers a body source ("survivor", "vanguard") and pre-builds `count` pooled bodies. */
  addSource(name: string, source: BodySource, count: number): void {
    const pool: Pool = { source, free: [], baseMaterial: null, bodies: new Set() };
    this.pools.set(name, pool);
    for (let i = 0; i < count; i++) {
      const enemy = this.build(pool, i);
      pool.bodies.add(enemy);
      pool.free.push(enemy);
    }
  }

  hasSource(name: string): boolean {
    return this.pools.has(name);
  }

  private build(pool: Pool, index: number): Enemy {
    const root = new Entity(`enemy-${index}`);
    const model = pool.source.resource.instantiateRenderEntity({ castShadows: false, receiveShadows: true });
    root.addChild(model);
    const meshes: MeshInstance[] = [];
    for (const render of model.findComponents("render") as RenderComponent[]) meshes.push(...render.meshInstances);
    model.addComponent("anim", { activate: true });
    const anim = model.anim!;
    anim.loadStateGraph({
      layers: [{
        name: "Base",
        states: [{ name: "START" }, { name: "Move", speed: 1, loop: true }, { name: "Attack", speed: 1, loop: false }, { name: "Death", speed: 1, loop: false }, { name: "Special", speed: 1, loop: true }],
        transitions: [{ from: "START", to: "Move", time: 0 }],
      }],
      parameters: {},
    });
    root.enabled = false;
    this.root.addChild(root);
    const first = meshes[0]?.material as StandardMaterial;
    pool.baseMaterial ??= first;
    return {
      id: "walker", def: ENEMIES.walker, root, model, meshes, normalMaterial: first, flashMaterial: first,
      active: false, hp: 1, maxHp: 1, damageScale: 1, position: new Vec3(), push: new Vec3(),
      state: "move", stateTime: 0, cooldown: 0, specialCooldown: 0, flash: 0, yaw: 0, dirX: 0, dirZ: 1, hitDone: false, marker: null, stuck: 0,
    };
  }

  private materialsFor(id: EnemyId, base: StandardMaterial): { normal: StandardMaterial; flash: StandardMaterial } {
    const key = `${id}/${base.name}/${base.id}`;
    let m = this.materials.get(key);
    if (!m) {
      const [r, g, b] = ENEMIES[id].tint;
      const normal = base.clone() as StandardMaterial;
      normal.diffuse.set(r, g, b);
      normal.update();
      const flash = base.clone() as StandardMaterial;
      flash.diffuse.set(1, 1, 1);
      flash.emissive.set(0.9, 0.35, 0.25);
      flash.update();
      m = { normal, flash };
      this.materials.set(key, m);
    }
    return m;
  }

  /** Spawns `id` at (x, z); returns null if its pool is empty or not loaded yet. */
  spawn(id: EnemyId, x: number, z: number, hpScale = 1, damageScale = 1): Enemy | null {
    const def = ENEMIES[id];
    // Bosses fall back to the survivor rig if the boss rig is not loaded (yet / at all).
    const pool = this.pools.get(def.model) ?? (def.model !== "survivor" && this.bossFallback ? this.pools.get("survivor") : undefined);
    const enemy = pool?.free.pop();
    if (!pool || !enemy) return null;
    enemy.id = id;
    enemy.def = def;
    enemy.maxHp = enemy.hp = Math.round(def.maxHp * hpScale);
    enemy.damageScale = damageScale;
    enemy.active = true;
    enemy.position.set(x, 0, z);
    enemy.push.set(0, 0, 0);
    enemy.state = "move";
    enemy.stateTime = 0;
    enemy.cooldown = 0.5;
    enemy.specialCooldown = (def.charge?.cooldown ?? def.projectile?.cooldown ?? def.slam?.cooldown ?? 3) * (0.5 + Math.random() * 0.5);
    enemy.flash = 0;
    enemy.hitDone = false;
    enemy.marker = null;
    enemy.stuck = 0;
    // Materials (per type) and animation clips.
    const mats = this.materialsFor(id, pool.baseMaterial!);
    enemy.normalMaterial = mats.normal;
    enemy.flashMaterial = mats.flash;
    for (const mi of enemy.meshes) mi.material = mats.normal;
    const anim = enemy.model.anim!;
    const track = (name: string) => pool.source.tracks.find((t) => t.name === name) ?? pool.source.tracks[0];
    anim.assignAnimation("Move", track(def.clips.move));
    anim.assignAnimation("Attack", track(def.clips.attack));
    anim.assignAnimation("Death", track(def.clips.death));
    anim.assignAnimation("Special", track(def.clips.special ?? def.clips.move));
    anim.speed = def.moveAnimRate;
    anim.baseLayer!.play("Move");
    enemy.root.setLocalScale(def.scale, def.scale, def.scale);
    enemy.root.setPosition(enemy.position);
    enemy.model.setLocalPosition(0, 0, 0);
    enemy.root.enabled = true;
    this.alive.push(enemy);
    return enemy;
  }

  /** Damage from the player. Returns true if it killed the enemy. */
  damage(enemy: Enemy, amount: number, fromX: number, fromZ: number, knockback: number): boolean {
    if (!enemy.active || enemy.state === "dead") return false;
    enemy.hp -= amount;
    enemy.flash = 0.08;
    for (const mi of enemy.meshes) mi.material = enemy.flashMaterial;
    const dx = enemy.position.x - fromX, dz = enemy.position.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const resist = enemy.def.boss ? 0.15 : 1;
    enemy.push.x += (dx / d) * knockback * 12 * resist;
    enemy.push.z += (dz / d) * knockback * 12 * resist;
    if (enemy.hp <= 0) {
      this.kill(enemy);
      return true;
    }
    return false;
  }

  private kill(enemy: Enemy): void {
    enemy.hp = 0;
    this.setState(enemy, "dead");
    this.hazards.clear(enemy.marker);
    enemy.model.anim!.speed = 1;
    enemy.model.anim!.baseLayer!.transition("Death", 0.1);
    this.onDeath(enemy);
  }

  private release(enemy: Enemy): void {
    enemy.active = false;
    enemy.root.enabled = false;
    const i = this.alive.indexOf(enemy);
    if (i >= 0) this.alive.splice(i, 1);
    this.poolOf(enemy)?.free.push(enemy);
  }

  private poolOf(enemy: Enemy): Pool | undefined {
    for (const pool of this.pools.values()) if (pool.bodies.has(enemy)) return pool;
    return undefined;
  }

  /** Kills every regular (non-boss) enemy without rewards (the level is over). */
  killAll(): void {
    for (const enemy of [...this.alive]) {
      if (enemy.state === "dead") continue;
      enemy.hp = 0;
      this.setState(enemy, "dead");
      this.hazards.clear(enemy.marker);
      enemy.model.anim!.speed = 1;
      enemy.model.anim!.baseLayer!.transition("Death", 0.1);
    }
  }

  /** Removes every enemy immediately (new level / restart). */
  clear(): void {
    for (const enemy of [...this.alive]) {
      this.hazards.clear(enemy.marker);
      this.release(enemy);
    }
  }

  get livingCount(): number {
    let n = 0;
    for (const e of this.alive) if (e.state !== "dead") n++;
    return n;
  }

  private setState(enemy: Enemy, state: State): void {
    enemy.state = state;
    enemy.stateTime = 0;
    enemy.hitDone = false;
  }

  update(dt: number, player: Vec3, playerAlive: boolean): void {
    const alive = this.alive;
    // Separation (O(n^2) over at most ~30 bodies).
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      if (a.state === "dead") continue;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        if (b.state === "dead") continue;
        const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
        const min = (a.def.radius + b.def.radius) * ENEMY_LIMITS.separation;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        const wa = a.def.boss ? 0.15 : 1, wb = b.def.boss ? 0.15 : 1;
        a.position.x -= (dx / d) * push * wa;
        a.position.z -= (dz / d) * push * wa;
        b.position.x += (dx / d) * push * wb;
        b.position.z += (dz / d) * push * wb;
      }
    }
    for (let i = alive.length - 1; i >= 0; i--) this.updateEnemy(alive[i], dt, player, playerAlive);
  }

  private updateEnemy(enemy: Enemy, dt: number, player: Vec3, playerAlive: boolean): void {
    const def = enemy.def;
    enemy.stateTime += dt;
    if (enemy.flash > 0) {
      enemy.flash -= dt;
      if (enemy.flash <= 0) for (const mi of enemy.meshes) mi.material = enemy.normalMaterial;
    }
    if (enemy.state === "dead") {
      // Lie there, then sink and go back to the pool.
      const t = enemy.stateTime - ENEMY_LIMITS.corpseSeconds;
      if (t > 0) enemy.model.setLocalPosition(0, -t * 0.9, 0);
      if (t > 1.2) this.release(enemy);
      return;
    }
    enemy.cooldown -= dt;
    enemy.specialCooldown -= dt;
    // Safety net: never leave an enemy stranded where it cannot reach the player.
    enemy.stuck = this.nav.isReachable(enemy.position.x, enemy.position.z) ? 0 : enemy.stuck + dt;
    if (enemy.stuck > 3) {
      enemy.stuck = 0;
      if (enemy.def.boss) this.onStranded(enemy);
      else {
        this.hazards.clear(enemy.marker);
        this.release(enemy);
        return;
      }
    }
    const dx = player.x - enemy.position.x, dz = player.z - enemy.position.z;
    const distance = Math.hypot(dx, dz);
    const toX = dx / (distance || 1), toZ = dz / (distance || 1);
    let moveX = 0, moveZ = 0, speed = 0;
    const anim = enemy.model.anim!;

    switch (enemy.state) {
      case "move": {
        if (!playerAlive) break;
        // Specials first.
        if (def.charge && enemy.specialCooldown <= 0 && distance < def.charge.distance && distance > 3) {
          this.setState(enemy, "telegraph");
          enemy.dirX = toX;
          enemy.dirZ = toZ;
          enemy.marker = this.hazards.lane(enemy.position.x, enemy.position.z, toX, toZ, def.charge.distance, def.radius * 2.2, def.charge.telegraph);
          anim.baseLayer!.transition("Special", 0.15);
          break;
        }
        if (def.slam && enemy.specialCooldown <= 0 && distance < def.slam.triggerRange) {
          this.setState(enemy, "slam");
          enemy.marker = this.hazards.ring(enemy.position.x, enemy.position.z, def.slam.radius, def.slam.telegraph);
          anim.speed = 1;
          anim.baseLayer!.transition("Special", 0.1);
          break;
        }
        if (def.projectile && enemy.specialCooldown <= 0 && distance >= def.projectile.minRange && distance <= def.projectile.maxRange) {
          this.setState(enemy, "throw");
          anim.speed = 1;
          anim.baseLayer!.transition(def.behavior === "thrower" ? "Special" : "Attack", 0.1);
          break;
        }
        if (distance <= def.attackRange * 0.92 && enemy.cooldown <= 0) {
          this.setState(enemy, "attack");
          anim.speed = 1;
          anim.baseLayer!.transition("Attack", 0.1);
          break;
        }
        // Throwers keep their distance.
        if (def.behavior === "thrower" && def.projectile && distance < def.projectile.minRange * 0.9) {
          moveX = -toX;
          moveZ = -toZ;
        } else if (distance > def.attackRange * 0.8) {
          if (distance > 2.5 && this.nav.direction(enemy.position.x, enemy.position.z, this.steer)) {
            moveX = this.steer.x;
            moveZ = this.steer.z;
          } else {
            moveX = toX;
            moveZ = toZ;
          }
        }
        speed = def.speed;
        break;
      }
      case "attack": {
        this.face(enemy, toX, toZ, dt, 10);
        if (!enemy.hitDone && enemy.stateTime >= def.attackWindup) {
          enemy.hitDone = true;
          if (playerAlive && distance <= def.attackRange * 1.15) this.onPlayerHit(def.damage * enemy.damageScale, enemy);
        }
        if (enemy.stateTime >= def.attackWindup + 0.45) this.backToMove(enemy, def.attackCooldown);
        break;
      }
      case "telegraph": {
        // Charger: aim, flash the lane, then go.
        if (enemy.stateTime >= (def.charge?.telegraph ?? 1)) {
          this.setState(enemy, "charge");
          this.hazards.clear(enemy.marker);
          enemy.marker = null;
        }
        this.face(enemy, enemy.dirX, enemy.dirZ, dt, 12);
        break;
      }
      case "charge": {
        const c = def.charge!;
        moveX = enemy.dirX;
        moveZ = enemy.dirZ;
        speed = c.speed;
        anim.speed = 1.6;
        if (!enemy.hitDone && distance < def.radius + 0.6) {
          enemy.hitDone = true;
          if (playerAlive) this.onPlayerHit(c.damage * enemy.damageScale, enemy);
        }
        const travelled = enemy.stateTime * c.speed;
        if (travelled >= c.distance) {
          // Overshot: winded and vulnerable for a moment.
          this.setState(enemy, "recover");
          anim.speed = 0.4;
          anim.baseLayer!.transition("Move", 0.2);
        }
        break;
      }
      case "recover": {
        if (enemy.stateTime >= (def.charge?.recover ?? 1)) this.backToMove(enemy, 0.5, def.charge?.cooldown);
        break;
      }
      case "throw": {
        this.face(enemy, toX, toZ, dt, 10);
        if (!enemy.hitDone && enemy.stateTime >= 0.55) {
          enemy.hitDone = true;
          const p = def.projectile!;
          this.tmp.set(enemy.position.x, 1.6 * def.scale, enemy.position.z);
          this.hazards.throw(this.tmp, player.x, player.z, p.speed, p.radius, p.damage * enemy.damageScale);
        }
        if (enemy.stateTime >= 1.1) this.backToMove(enemy, 0.3, def.projectile?.cooldown);
        break;
      }
      case "slam": {
        const s = def.slam!;
        if (!enemy.hitDone && enemy.stateTime >= s.telegraph) {
          enemy.hitDone = true;
          this.hazards.clear(enemy.marker);
          enemy.marker = null;
          if (playerAlive && distance <= s.radius) this.onPlayerHit(s.damage * enemy.damageScale, enemy);
        }
        if (enemy.stateTime >= s.telegraph + 0.5) this.backToMove(enemy, 0.6, s.cooldown);
        break;
      }
    }

    // Move with knockback, slide along walls.
    const px = enemy.push.x * dt, pz = enemy.push.z * dt;
    enemy.push.mulScalar(Math.exp(-10 * dt));
    const stepX = moveX * speed * dt + px, stepZ = moveZ * speed * dt + pz;
    if (stepX !== 0 || stepZ !== 0) this.collision.moveCircle(enemy.position, def.radius, stepX, stepZ);
    if (speed > 0 && (moveX !== 0 || moveZ !== 0)) this.face(enemy, moveX, moveZ, dt, enemy.state === "charge" ? 20 : 8);
    if (enemy.state === "move") anim.speed = speed > 0 ? def.moveAnimRate : 0.3;
    enemy.root.setPosition(enemy.position);
    enemy.root.setEulerAngles(0, enemy.yaw, 0);
  }

  private backToMove(enemy: Enemy, cooldown: number, specialCooldown?: number): void {
    this.setState(enemy, "move");
    enemy.cooldown = cooldown;
    if (specialCooldown !== undefined) enemy.specialCooldown = specialCooldown;
    enemy.model.anim!.speed = enemy.def.moveAnimRate;
    enemy.model.anim!.baseLayer!.transition("Move", 0.2);
  }

  private face(enemy: Enemy, x: number, z: number, dt: number, sharpness: number): void {
    const target = (Math.atan2(x, z) * 180) / Math.PI;
    let delta = ((target - enemy.yaw + 540) % 360) - 180;
    delta *= 1 - Math.exp(-sharpness * dt);
    enemy.yaw += delta;
  }

  /** True while the charger is recovering (takes extra damage). */
  vulnerable(enemy: Enemy): boolean {
    return enemy.state === "recover";
  }

  /** Nearest living enemy whose body a ray from (ox, oz) along (dx, dz) hits within `range`. */
  raycast(ox: number, oz: number, dx: number, dz: number, range: number, out: { enemy: Enemy; t: number }[]): void {
    out.length = 0;
    for (const e of this.alive) {
      if (e.state === "dead") continue;
      const r = e.def.radius * 1.35;
      const cx = e.position.x - ox, cz = e.position.z - oz;
      const along = cx * dx + cz * dz;
      if (along < 0 || along > range + r) continue;
      const perp2 = cx * cx + cz * cz - along * along;
      if (perp2 > r * r) continue;
      const t = along - Math.sqrt(r * r - perp2);
      if (t <= range) out.push({ enemy: e, t: Math.max(0, t) });
    }
    out.sort((a, b) => a.t - b.t);
  }

  get bosses(): Enemy[] {
    return this.alive.filter((e) => e.def.boss && e.state !== "dead");
  }

  /** Whether a pooled body for `id` is free (and its model is loaded). */
  canSpawn(id: EnemyId): boolean {
    const pool = this.pools.get(ENEMIES[id].model) ?? (this.bossFallback ? this.pools.get("survivor") : undefined);
    return !!pool && pool.free.length > 0;
  }
}
