import { BLEND_ADDITIVE, Color, Entity, StandardMaterial, Vec3, type AnimTrack, type Texture, type AppBase, type ContainerResource, type MeshInstance, type RenderComponent } from "playcanvas";
import { ENEMIES, ENEMY_LIMITS, ENEMY_VISUALS, TARGETING, type EnemyClips, type EnemyDef, type EnemyId, type EnemySkinId, type EnemyVisualId } from "./config";
import { TYPE_SKINS } from "./campaigns";
import type { BossBrain, BossState } from "./BossBrain";
import type { Hazards } from "./Hazards";
import type { NavField } from "./NavField";
import type { CollisionWorld } from "../world/collision/CollisionWorld";
import { createContactShadow } from "../world/ContactShadow";

/** A loaded enemy GLB that bodies are cloned from. */
export interface BodySource {
  resource: ContainerResource;
  tracks: AnimTrack[];
}

/**
 * Lifecycle: the combat states (alive) -> "dying" (death clip playing; set once, by die()) ->
 * "dead" (corpse resting, then sinking) -> despawn (back to the pool). Only alive enemies can be
 * targeted, hit, attack, push others or count toward the cap.
 */
export type EnemyState = "move" | "attack" | "telegraph" | "charge" | "recover" | "throw" | "slam" | "cast" | "dive" | "boss" | "dying" | "dead";
type State = EnemyState;
/** States that start an attack (EnemyManager.onAttack: the attack cry). */
const ATTACK_STATES = new Set<State>(["attack", "telegraph", "throw", "cast", "slam"]);

/** Alive = spawned and not dying / dead. */
export function isAlive(e: Enemy): boolean {
  return e.active && e.state !== "dying" && e.state !== "dead";
}

/** Height of an enemy's aim point (chest; flyers include their altitude). */
export function aimY(e: Enemy): number {
  return e.lift + (e.def.aimHeight ?? TARGETING.aimHeight) * e.scale;
}

export interface Enemy {
  id: EnemyId;
  def: EnemyDef;
  /** The look this body wears (fixed per pooled body). */
  visual: EnemyVisualId;
  /** Colour skin worn this spawn (null: the model's own texture). */
  skin: EnemySkinId | null;
  /** The visual's clips with the type's overrides. */
  clips: EnemyClips;
  /** Type scale x visual scale x per-spawn jitter. */
  scale: number;
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
  /** Hit flinch time left, and the time until the next flinch may start. */
  hitReact: number;
  hitCooldown: number;
  /** How many times die() ran for this spawn (must stay <= 1; checked by tests). */
  deaths: number;
  /** Status effects (gameplay/Combat.ts): burning (time left, damage per second, tick timer), slowed. */
  burnTime: number;
  burnDps: number;
  burnTick: number;
  slowTime: number;
  slowPct: number;
  /** Altitude of flyers (m); 0 on the ground. */
  lift: number;
  /** Flyers: angle around the player they circle at. */
  orbit: number;
  /** Enraged (berserker below half HP). */
  enraged: boolean;
  /** Bone attachments (enabled per type). */
  attachments: { entity: Entity; only?: EnemyId[] }[];
  /** Boss script state (bosses only). */
  brain: BossState | null;
}

interface Pool {
  visual: EnemyVisualId;
  source: BodySource;
  free: Enemy[];
  /** The GLB's own material, the base for the per-type (tinted) and hit-flash copies. */
  baseMaterial: StandardMaterial | null;
  bodies: Set<Enemy>;
}

/**
 * Enemies: pooled bodies, one pool per look (ENEMY_VISUALS, e.g. each zombie model), sharing one
 * material per type and look (a second material flashes on hits), each with a tiny anim graph (Move /
 * Attack / Hit / Death / Special). Looks are data: a type lists its visuals and every spawn picks one,
 * so the behaviour code never knows which model it drives. Behaviour per type from ENEMIES
 * (`chaser`, `charger`, `thrower`, `tank`): chase
 * along the NavField, separate from each other, slide along walls, wind up and hit in melee, plus
 * the bosses' specials. No physics engine; everything is a circle on the ground plane.
 */
export class EnemyManager {
  readonly alive: Enemy[] = [];
  private readonly pools = new Map<string, Pool>();
  private readonly materials = new Map<string, { normal: StandardMaterial; flash: StandardMaterial }>();
  private bodyCount = 0;
  private readonly skins = new Map<EnemySkinId, Texture>();
  private readonly root = new Entity("Enemies");
  private readonly steer = { x: 0, z: 0 };
  private readonly tmp = new Vec3();

  /** Called when an enemy lands a melee (or charge / slam) hit on the player. */
  onPlayerHit: (damage: number, from: Enemy) => void = () => {};
  /** Called when an enemy starts an attack (melee wind-up, charge / dive telegraph, throw, cast, slam). */
  onAttack: (enemy: Enemy) => void = () => {};
  /** Called when an enemy dies. */
  onDeath: (enemy: Enemy) => void = () => {};
  /** Called for a boss stranded somewhere unreachable (move it); regular enemies are recycled. */
  onStranded: (enemy: Enemy) => void = () => {};
  /** Boss scripts (set by Gameplay). */
  brain: BossBrain | null = null;
  /** The player's ground position this frame (read by the boss scripts). */
  readonly playerPosition = new Vec3();
  /** Loaded attachment models by URL (set before the looks that use them are added). */
  readonly attachmentModels = new Map<string, ContainerResource>();
  private orbMaterial: StandardMaterial | null = null;
  /** Nav / flyer bounds of the current level region. */
  bounds = { minX: -1e4, maxX: 1e4, minZ: -1e4, maxZ: 1e4 };

  constructor(
    private readonly app: AppBase,
    private readonly collision: CollisionWorld,
    private readonly nav: NavField,
    private readonly hazards: Hazards,
  ) {
    app.root.addChild(this.root);
  }

  /** Registers a loaded look and pre-builds `count` pooled bodies (more are built on demand). */
  addVisual(visual: EnemyVisualId, source: BodySource, count: number): void {
    const pool: Pool = { visual, source, free: [], baseMaterial: null, bodies: new Set() };
    this.pools.set(visual, pool);
    for (let i = 0; i < count; i++) pool.free.push(this.build(pool));
  }

  /** Registers a loaded colour skin texture (spawns pick among the loaded ones). */
  addSkin(skin: EnemySkinId, texture: Texture): void {
    this.skins.set(skin, texture);
  }

  hasVisual(visual: EnemyVisualId): boolean {
    return this.pools.has(visual);
  }

  private build(pool: Pool): Enemy {
    const root = new Entity(`enemy-${pool.visual}-${this.bodyCount++}`);
    const model = pool.source.resource.instantiateRenderEntity({ castShadows: false, receiveShadows: true });
    root.addChild(model);
    // No sun shadows for the horde; a soft blob keeps each body planted (one shared material).
    const blob = createContactShadow(this.app, 0.4);
    blob.setLocalScale(1.0, 1, 1.0);
    root.addChild(blob);
    const meshes: MeshInstance[] = [];
    for (const render of model.findComponents("render") as RenderComponent[]) {
      // No shadow casting for the horde (a shadow pass per enemy is the costliest part on mobile).
      render.castShadows = false;
      meshes.push(...render.meshInstances);
    }
    model.addComponent("anim", { activate: true });
    const anim = model.anim!;
    anim.loadStateGraph({
      layers: [{
        name: "Base",
        states: [
          { name: "START" }, { name: "Move", speed: 1, loop: true }, { name: "Attack", speed: 1, loop: false }, { name: "Hit", speed: 1, loop: false },
          { name: "Death", speed: 1, loop: false }, { name: "Special", speed: 1, loop: true },
          { name: "Roar", speed: 1, loop: false }, { name: "Cast", speed: 1, loop: false }, { name: "Slam", speed: 1, loop: false },
        ],
        transitions: [{ from: "START", to: "Move", time: 0 }],
      }],
      parameters: {},
    });
    root.enabled = false;
    this.root.addChild(root);
    const attachments: Enemy["attachments"] = [];
    for (const a of ENEMY_VISUALS[pool.visual].attachments ?? []) {
      const bone = model.findByName(a.bone) as Entity | null;
      if (!bone) continue;
      let entity: Entity;
      if (a.url) {
        const resource = this.attachmentModels.get(a.url);
        if (!resource) continue;
        entity = resource.instantiateRenderEntity({ castShadows: false, receiveShadows: true });
      } else {
        entity = new Entity("orb");
        if (!this.orbMaterial) {
          const m = new StandardMaterial();
          m.diffuse.set(0, 0, 0);
          m.useLighting = false;
          m.blendType = BLEND_ADDITIVE;
          m.depthWrite = false;
          m.emissive = new Color(1.6, 0.55, 0.12);
          m.update();
          this.orbMaterial = m;
        }
        entity.addComponent("render", { type: "sphere", material: this.orbMaterial, castShadows: false, receiveShadows: false });
      }
      const [px, py, pz] = a.position ?? [0, 0, 0];
      const [rx, ry, rz] = a.rotation ?? [0, 0, 0];
      const k = a.scale ?? 1;
      entity.setLocalPosition(px, py, pz);
      entity.setLocalEulerAngles(rx, ry, rz);
      entity.setLocalScale(k, k, k);
      bone.addChild(entity);
      attachments.push({ entity, only: a.only });
    }
    const first = meshes[0]?.material as StandardMaterial;
    pool.baseMaterial ??= first;
    const enemy: Enemy = {
      id: "walker", def: ENEMIES.walker, visual: pool.visual, skin: null, clips: ENEMY_VISUALS[pool.visual].clips, scale: 1,
      root, model, meshes, normalMaterial: first, flashMaterial: first,
      active: false, hp: 1, maxHp: 1, damageScale: 1, position: new Vec3(), push: new Vec3(),
      state: "move", stateTime: 0, cooldown: 0, specialCooldown: 0, flash: 0, yaw: 0, dirX: 0, dirZ: 1, hitDone: false, marker: null, stuck: 0,
      hitReact: 0, hitCooldown: 0, deaths: 0, burnTime: 0, burnDps: 0, burnTick: 0, slowTime: 0, slowPct: 0,
      lift: 0, orbit: 0, enraged: false, attachments, brain: null,
    };
    pool.bodies.add(enemy);
    return enemy;
  }

  /** Materials per type, model and skin (shared by every body wearing that combination). */
  private materialsFor(id: EnemyId, base: StandardMaterial, skin: EnemySkinId | null): { normal: StandardMaterial; flash: StandardMaterial } {
    const key = `${id}/${base.name}/${base.id}/${skin}`;
    let m = this.materials.get(key);
    if (!m) {
      const { tint, glow } = ENEMIES[id];
      const texture = skin ? this.skins.get(skin) : undefined;
      const normal = tint || texture || glow ? (base.clone() as StandardMaterial) : base;
      if (tint) normal.diffuse.set(tint[0], tint[1], tint[2]);
      if (texture) normal.diffuseMap = texture;
      // Glowing eyes / cracks: tints the look's emissive map.
      if (glow && normal.emissiveMap) normal.emissive.set(glow[0], glow[1], glow[2]);
      if (normal !== base) normal.update();
      const flash = base.clone() as StandardMaterial;
      flash.diffuse.set(1, 1, 1);
      if (texture) flash.diffuseMap = texture;
      flash.emissiveMap = null;
      flash.emissive.set(0.9, 0.35, 0.25);
      flash.update();
      m = { normal, flash };
      this.materials.set(key, m);
    }
    return m;
  }

  /** A loaded look for `id` (random among its variants), or null if none is loaded / the cap is hit. */
  private pickPool(id: EnemyId): Pool | null {
    const def = ENEMIES[id];
    if (!def.boss && this.livingRegular >= ENEMY_LIMITS.pool) return null;
    const loaded = def.visuals.map((v) => this.pools.get(v)).filter((p): p is Pool => !!p);
    if (!loaded.length) return null;
    return loaded[Math.floor(Math.random() * loaded.length)];
  }

  private get livingRegular(): number {
    let n = 0;
    for (const e of this.alive) if (!e.def.boss) n++;
    return n;
  }

  /** Spawns `id` at (x, z); returns null if none of its looks is loaded yet or the cap is hit. */
  spawn(id: EnemyId, x: number, z: number, hpScale = 1, damageScale = 1): Enemy | null {
    const def = ENEMIES[id];
    const pool = this.pickPool(id);
    if (!pool) return null;
    const enemy = pool.free.pop() ?? this.build(pool);
    const visual = ENEMY_VISUALS[pool.visual];
    enemy.id = id;
    enemy.def = def;
    enemy.clips = def.clips ? { ...visual.clips, ...def.clips } : visual.clips;
    enemy.scale = def.scale * visual.scale * (1 + (Math.random() * 2 - 1) * (def.scaleJitter ?? 0));
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
    enemy.hitReact = 0;
    enemy.hitCooldown = 0;
    enemy.deaths = 0;
    enemy.burnTime = enemy.burnDps = enemy.burnTick = enemy.slowTime = enemy.slowPct = 0;
    enemy.lift = def.fly ? def.fly.height : 0;
    enemy.orbit = Math.random() * Math.PI * 2;
    enemy.enraged = false;
    enemy.brain = def.script && this.brain ? this.brain.create(enemy) : null;
    for (const a of enemy.attachments) a.entity.enabled = !a.only || a.only.includes(id);
    // Materials (per type) and animation clips.
    const skins = (TYPE_SKINS[id] ?? visual.skins ?? []).filter((k) => this.skins.has(k));
    enemy.skin = skins.length ? skins[Math.floor(Math.random() * skins.length)] : null;
    const mats = this.materialsFor(id, pool.baseMaterial!, enemy.skin);
    enemy.normalMaterial = mats.normal;
    enemy.flashMaterial = mats.flash;
    for (const mi of enemy.meshes) mi.material = mats.normal;
    const anim = enemy.model.anim!;
    const track = (name: string) => pool.source.tracks.find((t) => t.name === name) ?? pool.source.tracks[0];
    const clips = enemy.clips;
    // assignAnimation's `loop` argument defaults to true and overrides the state graph, so one-shot
    // clips must say so: a looping Death clip replays (the corpse stands up and dies again).
    anim.assignAnimation("Move", track(clips.move), undefined, 1, true);
    anim.assignAnimation("Attack", track(clips.attack), undefined, 1, false);
    anim.assignAnimation("Hit", track(clips.hit ?? clips.move), undefined, 1, false);
    anim.assignAnimation("Death", track(clips.death[Math.floor(Math.random() * clips.death.length)]), undefined, 1, false);
    anim.assignAnimation("Special", track(clips.special ?? clips.move), undefined, 1, true);
    anim.assignAnimation("Roar", track(clips.roar ?? clips.special ?? clips.attack), undefined, 1, false);
    anim.assignAnimation("Cast", track(clips.cast ?? clips.attack), undefined, 1, false);
    anim.assignAnimation("Slam", track(clips.slam ?? clips.attack), undefined, 1, false);
    anim.speed = this.moveRate(enemy);
    anim.baseLayer!.play("Move");
    // Start each body at a different point of its walk cycle so a group does not march in step.
    anim.baseLayer!.activeStateCurrentTime = Math.random() * track(clips.move).duration;
    const bulk = visual.bulk ?? 1;
    enemy.root.setLocalScale(enemy.scale * bulk, enemy.scale, enemy.scale * bulk);
    enemy.root.setPosition(enemy.position.x, enemy.lift, enemy.position.z);
    enemy.model.setLocalPosition(0, 0, 0);
    enemy.root.enabled = true;
    this.alive.push(enemy);
    return enemy;
  }

  /** Damage from the player. Returns true if it killed the enemy. */
  damage(enemy: Enemy, amount: number, fromX: number, fromZ: number, knockback: number): boolean {
    if (!isAlive(enemy)) return false;
    // Bosses are invulnerable while they roar (a phase change).
    if (enemy.brain && this.brain?.invulnerable(enemy)) return false;
    enemy.hp -= amount * (1 - (enemy.def.armor ?? 0));
    enemy.flash = 0.08;
    const enrage = enemy.def.enrage;
    if (enrage && !enemy.enraged && enemy.hp / enemy.maxHp < enrage.below) enemy.enraged = true;
    for (const mi of enemy.meshes) mi.material = enemy.flashMaterial;
    const dx = enemy.position.x - fromX, dz = enemy.position.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const resist = enemy.def.boss ? 0.15 : 1;
    enemy.push.x += (dx / d) * knockback * 12 * resist;
    enemy.push.z += (dz / d) * knockback * 12 * resist;
    if (enemy.hp <= 0) return this.die(enemy, true);
    // Flinch (regular enemies walking, not too often; the attack wind-up is not interrupted).
    if (enemy.clips.hit && !enemy.def.boss && enemy.state === "move" && enemy.hitCooldown <= 0) {
      enemy.hitReact = ENEMY_LIMITS.hitReact;
      enemy.hitCooldown = ENEMY_LIMITS.hitReactCooldown;
      enemy.model.anim!.speed = 1;
      enemy.model.anim!.baseLayer!.transition("Hit", 0.05);
    }
    return false;
  }

  /** Move clip playback rate that matches the feet to the ground speed. */
  private moveRate(enemy: Enemy): number {
    return (this.speedOf(enemy) * this.slowFactor(enemy)) / (ENEMY_VISUALS[enemy.visual].moveSpeed * enemy.scale);
  }

  /** Speed multiplier for every enemy (the level's pace and the hero's speed upgrades; set per frame). */
  pace = 1;

  /** Ground speed with enrage / boss phase multipliers and the pace. */
  private speedOf(enemy: Enemy): number {
    let v = enemy.def.speed * this.pace;
    if (enemy.enraged && enemy.def.enrage) v *= enemy.def.enrage.speed;
    if (enemy.brain && this.brain) v *= this.brain.speedFactor(enemy);
    return v;
  }

  /** 1, or less while slowed (bosses resist half of it). */
  private slowFactor(enemy: Enemy): number {
    if (enemy.slowTime <= 0) return 1;
    return 1 - enemy.slowPct * (enemy.def.boss ? 0.5 : 1);
  }

  /**
   * The only way an enemy dies: alive -> "dying" once. Plays the death clip, clears its telegraph
   * and (with `reward`) reports the kill (XP, drops) exactly once. Returns false if it was not alive
   * (a second bullet / pellet / hit callback in the same frame changes nothing).
   */
  private die(enemy: Enemy, reward: boolean): boolean {
    if (!isAlive(enemy)) return false;
    enemy.deaths++;
    enemy.hp = 0;
    enemy.hitReact = 0;
    enemy.push.set(0, 0, 0);
    this.setState(enemy, "dying");
    this.brain?.release(enemy);
    this.hazards.clear(enemy.marker);
    enemy.marker = null;
    enemy.model.anim!.speed = 1;
    enemy.model.anim!.baseLayer!.transition("Death", 0.1);
    // Flyers fall to the ground as they die.
    if (reward) this.onDeath(enemy);
    return true;
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

  /** Kills every enemy still alive, without rewards (the wave is over). */
  killAll(): void {
    for (const enemy of [...this.alive]) this.die(enemy, false);
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
    for (const e of this.alive) if (isAlive(e)) n++;
    return n;
  }

  private setState(enemy: Enemy, state: State): void {
    enemy.state = state;
    enemy.stateTime = 0;
    enemy.hitDone = false;
    if (ATTACK_STATES.has(state)) this.onAttack(enemy);
  }

  update(dt: number, player: Vec3, playerAlive: boolean): void {
    this.playerPosition.copy(player);
    const alive = this.alive;
    // Separation (O(n^2) over at most ~30 bodies).
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      if (!isAlive(a)) continue;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        if (!isAlive(b)) continue;
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
    if (enemy.state === "dying") {
      // The death clip plays out (it ends lying down), then the body is a corpse. Flyers drop.
      if (enemy.lift > 0) {
        enemy.lift = Math.max(0, enemy.lift - dt * 6);
        enemy.root.setPosition(enemy.position.x, enemy.lift, enemy.position.z);
      }
      if (enemy.stateTime >= ENEMY_LIMITS.dyingSeconds) this.setState(enemy, "dead");
      return;
    }
    if (enemy.state === "dead") {
      // Lie there, then sink and despawn (back to the pool).
      const t = enemy.stateTime - ENEMY_LIMITS.corpseSeconds;
      if (t > 0) enemy.model.setLocalPosition(0, -t * 0.9, 0);
      if (t > 1.2) this.release(enemy);
      return;
    }
    enemy.cooldown -= dt;
    enemy.specialCooldown -= dt;
    enemy.hitCooldown -= dt;
    if (enemy.slowTime > 0) enemy.slowTime -= dt;
    if (enemy.hitReact > 0) {
      enemy.hitReact -= dt;
      if (enemy.hitReact <= 0 && enemy.state === "move") enemy.model.anim!.baseLayer!.transition("Move", 0.15);
    }
    const flyer = !!def.fly;
    // Safety net: never leave a walker stranded where it cannot reach the player (flyers go anywhere).
    if (!flyer) {
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
    }
    const dx = player.x - enemy.position.x, dz = player.z - enemy.position.z;
    const distance = Math.hypot(dx, dz);
    const toX = dx / (distance || 1), toZ = dz / (distance || 1);
    let moveX = 0, moveZ = 0, speed = 0;
    const anim = enemy.model.anim!;
    const rage = enemy.enraged && def.enrage ? def.enrage.cooldown : 1;

    if (enemy.brain && this.brain) {
      // Bosses: the script decides (movement comes back through `steer`).
      const out = this.brain.update(enemy, dt, player, playerAlive);
      moveX = out.x;
      moveZ = out.z;
      speed = out.speed;
      if (out.useNav && distance > 2.5 && !flyer && this.nav.direction(enemy.position.x, enemy.position.z, this.steer)) {
        moveX = this.steer.x;
        moveZ = this.steer.z;
      }
    } else switch (enemy.state) {
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
        if (def.fly?.dive && enemy.specialCooldown <= 0 && distance < def.fly.dive.distance * 0.8 && distance > 3) {
          // Dive: the lane shows while it hovers, then it swoops low through it.
          this.setState(enemy, "telegraph");
          enemy.dirX = toX;
          enemy.dirZ = toZ;
          enemy.marker = this.hazards.lane(enemy.position.x, enemy.position.z, toX, toZ, def.fly.dive.distance, def.radius * 2.4, def.fly.dive.telegraph);
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
        if (def.bolt && enemy.specialCooldown <= 0 && distance >= def.bolt.minRange && distance <= def.bolt.maxRange) {
          this.setState(enemy, "cast");
          anim.speed = 1;
          anim.baseLayer!.transition(enemy.clips.special ? "Special" : "Attack", 0.1);
          break;
        }
        if (distance <= def.attackRange * 0.92 && enemy.cooldown <= 0) {
          this.setState(enemy, "attack");
          anim.speed = 1;
          anim.baseLayer!.transition("Attack", 0.1);
          break;
        }
        if (flyer) {
          // Circle the player at the orbit distance (orbit 0: close in to bite).
          const orbit = def.fly!.orbit;
          enemy.orbit += dt * (0.35 + (enemy.maxHp % 7) * 0.02);
          const tx = orbit > 0 ? player.x - Math.sin(enemy.orbit) * orbit : player.x;
          const tz = orbit > 0 ? player.z - Math.cos(enemy.orbit) * orbit : player.z;
          const ox = tx - enemy.position.x, oz = tz - enemy.position.z;
          const od = Math.hypot(ox, oz);
          if (od > 0.4 && (orbit > 0 || distance > def.attackRange * 0.8)) {
            moveX = ox / od;
            moveZ = oz / od;
          }
        } else if ((def.behavior === "thrower" && def.projectile && distance < def.projectile.minRange * 0.9) || (def.behavior === "caster" && def.bolt && distance < def.bolt.minRange * 0.85)) {
          // Ranged enemies keep their distance.
          moveX = -toX;
          moveZ = -toZ;
        } else if (def.behavior === "caster" && def.bolt && distance < def.bolt.maxRange * 0.8) {
          // In range: sidestep around the player while the bolt recharges.
          moveX = -toZ * (enemy.maxHp % 2 ? 1 : -1);
          moveZ = toX * (enemy.maxHp % 2 ? 1 : -1);
        } else if (distance > def.attackRange * 0.8) {
          if (distance > 2.5 && this.nav.direction(enemy.position.x, enemy.position.z, this.steer)) {
            moveX = this.steer.x;
            moveZ = this.steer.z;
          } else {
            moveX = toX;
            moveZ = toZ;
          }
        }
        // Staggered while flinching; slowed by cryo hits.
        speed = (enemy.hitReact > 0 ? this.speedOf(enemy) * 0.3 : this.speedOf(enemy)) * this.slowFactor(enemy);
        if (def.behavior === "caster" && distance < def.bolt!.maxRange * 0.8 && distance >= def.bolt!.minRange * 0.85) speed *= 0.5;
        break;
      }
      case "attack": {
        this.face(enemy, toX, toZ, dt, 10);
        if (!enemy.hitDone && enemy.stateTime >= def.attackWindup) {
          enemy.hitDone = true;
          if (playerAlive && distance <= def.attackRange * 1.15) this.onPlayerHit(def.damage * enemy.damageScale, enemy);
        }
        if (enemy.stateTime >= def.attackWindup + 0.45 * rage) this.backToMove(enemy, def.attackCooldown * rage);
        break;
      }
      case "telegraph": {
        // Charger / diving flyer: aim, flash the lane, then go.
        const wait = def.charge?.telegraph ?? def.fly?.dive?.telegraph ?? 1;
        if (enemy.stateTime >= wait) {
          this.setState(enemy, def.charge ? "charge" : "dive");
          this.hazards.clear(enemy.marker);
          enemy.marker = null;
        }
        this.face(enemy, enemy.dirX, enemy.dirZ, dt, 12);
        break;
      }
      case "charge":
      case "dive": {
        const c = enemy.state === "charge" ? def.charge! : def.fly!.dive!;
        moveX = enemy.dirX;
        moveZ = enemy.dirZ;
        speed = c.speed;
        anim.speed = 1.6;
        if (enemy.state === "dive") enemy.lift = Math.max(0.7, enemy.lift - dt * 8);
        if (!enemy.hitDone && distance < def.radius + 0.7) {
          enemy.hitDone = true;
          if (playerAlive) this.onPlayerHit(c.damage * enemy.damageScale, enemy);
        }
        const travelled = enemy.stateTime * c.speed;
        if (travelled >= c.distance) {
          if (enemy.state === "dive") {
            this.backToMove(enemy, 0.8, def.fly!.dive!.cooldown);
          } else {
            // Overshot: winded and vulnerable for a moment.
            this.setState(enemy, "recover");
            anim.speed = 0.4;
            anim.baseLayer!.transition("Move", 0.2);
          }
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
          this.tmp.set(enemy.position.x, 1.6 * enemy.scale, enemy.position.z);
          this.hazards.throw(this.tmp, player.x, player.z, p.speed, p.radius, p.damage * enemy.damageScale);
        }
        if (enemy.stateTime >= 1.1) this.backToMove(enemy, 0.3, def.projectile?.cooldown);
        break;
      }
      case "cast": {
        // The hand glows through the wind-up (the clip), then the bolt(s) fly: dodge sideways.
        const b = def.bolt!;
        this.face(enemy, toX, toZ, dt, 12);
        if (!enemy.hitDone && enemy.stateTime >= b.windup) {
          enemy.hitDone = true;
          this.tmp.set(enemy.position.x + toX * 0.5, enemy.lift + 1.2, enemy.position.z + toZ * 0.5);
          this.fan(this.tmp, toX, toZ, b.count, b.spreadDeg, b.speed, b.radius, b.damage * enemy.damageScale, b.maxRange * 1.6);
        }
        if (enemy.stateTime >= b.windup + 0.45) this.backToMove(enemy, 0.4, b.cooldown * (0.85 + Math.random() * 0.3));
        break;
      }
      case "slam": {
        const sl = def.slam!;
        if (!enemy.hitDone && enemy.stateTime >= sl.telegraph) {
          enemy.hitDone = true;
          this.hazards.clear(enemy.marker);
          enemy.marker = null;
          if (playerAlive && distance <= sl.radius) this.onPlayerHit(sl.damage * enemy.damageScale, enemy);
          this.onSlam(enemy.position, sl.radius);
        }
        if (enemy.stateTime >= sl.telegraph + 0.5) this.backToMove(enemy, 0.6, sl.cooldown);
        break;
      }
    }

    // Move: walkers slide along walls with knockback; flyers go straight over everything.
    const px = enemy.push.x * dt, pz = enemy.push.z * dt;
    enemy.push.mulScalar(Math.exp(-10 * dt));
    const stepX = moveX * speed * dt + px, stepZ = moveZ * speed * dt + pz;
    if (flyer) {
      const b = this.bounds;
      enemy.position.x = Math.min(b.maxX + 2, Math.max(b.minX - 2, enemy.position.x + stepX));
      enemy.position.z = Math.min(b.maxZ + 2, Math.max(b.minZ - 2, enemy.position.z + stepZ));
      if (enemy.state !== "dive") enemy.lift += ((def.fly!.height) - enemy.lift) * Math.min(1, dt * 3);
      if (speed === 0) this.face(enemy, toX, toZ, dt, 6);
    } else if (stepX !== 0 || stepZ !== 0) {
      this.collision.moveCircle(enemy.position, def.radius, stepX, stepZ);
    }
    if (speed > 0 && (moveX !== 0 || moveZ !== 0)) this.face(enemy, moveX, moveZ, dt, enemy.state === "charge" || enemy.state === "dive" ? 20 : 8);
    if (enemy.state === "move" && enemy.hitReact <= 0) anim.speed = speed > 0 ? this.moveRate(enemy) : flyer ? 1 : 0.3;
    const bob = flyer ? Math.sin(enemy.stateTime * 3 + enemy.orbit) * 0.12 : 0;
    enemy.root.setPosition(enemy.position.x, enemy.lift + bob, enemy.position.z);
    enemy.root.setEulerAngles(0, enemy.yaw, 0);
  }

  /** Fires `count` bolts fanned over `spreadDeg` around the direction (dx, dz). */
  fan(from: Vec3, dx: number, dz: number, count: number, spreadDeg: number, speed: number, radius: number, damage: number, range: number): void {
    const base = Math.atan2(dx, dz);
    for (let i = 0; i < count; i++) {
      const a = base + (count > 1 ? ((i / (count - 1)) - 0.5) * ((spreadDeg * Math.PI) / 180) : 0);
      this.hazards.bolt(from, Math.sin(a), Math.cos(a), speed, radius, damage, range);
    }
  }

  /** Visual hook for slams (dust / shock ring). */
  onSlam: (position: Vec3, radius: number) => void = () => {};

  private backToMove(enemy: Enemy, cooldown: number, specialCooldown?: number): void {
    this.setState(enemy, "move");
    enemy.cooldown = cooldown;
    if (specialCooldown !== undefined) enemy.specialCooldown = specialCooldown;
    enemy.hitReact = 0;
    enemy.model.anim!.speed = this.moveRate(enemy);
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
    return enemy.state === "recover" || (!!enemy.brain && !!this.brain?.vulnerable(enemy));
  }

  /** Nearest living enemy whose body a ray from (ox, oz) along (dx, dz) hits within `range`. */
  raycast(ox: number, oz: number, dx: number, dz: number, range: number, out: { enemy: Enemy; t: number }[]): void {
    out.length = 0;
    for (const e of this.alive) {
      if (!isAlive(e)) continue;
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
    return this.alive.filter((e) => e.def.boss && isAlive(e));
  }

  /** Whether `id` can spawn now (one of its looks is loaded, under the enemy cap). */
  canSpawn(id: EnemyId): boolean {
    const def = ENEMIES[id];
    if (!def.boss && this.livingRegular >= ENEMY_LIMITS.pool) return false;
    return def.visuals.some((v) => this.pools.has(v));
  }
}
