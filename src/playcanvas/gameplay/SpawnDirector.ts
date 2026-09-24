import { Vec3, type CameraComponent } from "playcanvas";
import { LEVELS, SPAWNING, type EnemyId, type LevelDef } from "./config";
import type { Enemy, EnemyManager } from "./EnemyManager";
import type { NavField } from "./NavField";

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type DirectorPhase = "waves" | "boss" | "cleared";

/**
 * Decides what spawns, when and where, from LEVELS data: spawn rate, group size, the enemy cap and
 * the type mix ramp linearly over the level; when the level time is up the boss arrives (regular
 * spawning continues at a lower rate) and killing it clears the level. Spawn points are on a ring
 * around the player, outside the camera view, on navigable cells connected to the player; each group
 * comes from one direction, so pressure arrives from different sides.
 */
export class SpawnDirector {
  level: LevelDef = LEVELS[0];
  levelIndex = 0;
  time = 0;
  phase: DirectorPhase = "waves";
  boss: Enemy | null = null;
  /** Multiplies every level's wave time (debug: ?levelTime=0.2 for quick tests). */
  durationScale = 1;
  private accumulator = 0;
  private readonly screen = new Vec3();
  private readonly world = new Vec3();

  constructor(
    private readonly enemies: EnemyManager,
    private readonly nav: NavField,
    private readonly bounds: Bounds,
  ) {}

  start(levelIndex: number): void {
    this.levelIndex = levelIndex;
    this.level = LEVELS[levelIndex];
    this.time = 0;
    this.phase = "waves";
    this.boss = null;
    this.accumulator = 1.2;
  }

  /** 0..1 through the level's wave time. */
  get progress(): number {
    return Math.min(1, this.time / this.duration);
  }

  /** This level's wave time (s). */
  get duration(): number {
    return this.level.duration * this.durationScale;
  }

  update(dt: number, player: Vec3, camera: CameraComponent): void {
    if (this.phase === "cleared") return;
    this.time += dt;
    const level = this.level;
    const t = this.progress;
    if (this.phase === "waves" && this.time >= this.duration) {
      if (this.spawnBoss(player, camera)) this.phase = "boss";
    }
    if (this.phase === "boss" && this.boss && (this.boss.state === "dead" || !this.boss.active)) {
      this.phase = "cleared";
      return;
    }
    const rate = this.phase === "boss" ? level.spawnRate[1] * level.bossSpawnFactor : lerp(level.spawnRate[0], level.spawnRate[1], t);
    const cap = Math.round(lerp(level.maxEnemies[0], level.maxEnemies[1], t));
    this.accumulator += rate * dt;
    const group = Math.round(lerp(level.groupSize[0], level.groupSize[1], t));
    if (this.accumulator >= group && this.enemies.livingCount < cap) {
      const count = Math.min(group, cap - this.enemies.livingCount);
      this.spawnGroup(count, player, camera);
      this.accumulator -= group;
    }
    this.accumulator = Math.min(this.accumulator, group * 2);
  }

  private pickType(): EnemyId {
    const entries = Object.entries(this.level.enemies) as [EnemyId, { weight: number; from?: number }][];
    let total = 0;
    const weights = entries.map(([, e]) => {
      const w = e.from && this.time < e.from ? 0 : e.weight;
      total += w;
      return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < entries.length; i++) {
      r -= weights[i];
      if (r <= 0) return entries[i][0];
    }
    return entries[0][0];
  }

  private spawnGroup(count: number, player: Vec3, camera: CameraComponent): void {
    const centre = this.findSpot(player, camera, SPAWNING.minDistance, SPAWNING.maxDistance);
    if (!centre) return;
    for (let i = 0; i < count; i++) {
      const type = this.pickType();
      if (!this.enemies.canSpawn(type)) continue;
      // Scatter within the group, on walkable cells.
      let x = centre.x, z = centre.z;
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * SPAWNING.groupSpread;
        const cx = centre.x + Math.cos(a) * r, cz = centre.z + Math.sin(a) * r;
        if (this.nav.isReachable(cx, cz)) {
          x = cx;
          z = cz;
          break;
        }
      }
      this.enemies.spawn(type, x, z, this.level.hpScale, this.level.damageScale);
    }
  }

  private spawnBoss(player: Vec3, camera: CameraComponent): boolean {
    const spot = this.findSpot(player, camera, SPAWNING.minDistance * 0.9, SPAWNING.maxDistance);
    if (!spot) return false;
    this.boss = this.enemies.spawn(this.level.boss, spot.x, spot.z, 1, 1);
    return this.boss !== null;
  }

  /** Moves a stranded enemy (a boss) to a fresh spawn point. */
  relocate(enemy: Enemy, player: Vec3, camera: CameraComponent): void {
    const spot = this.findSpot(player, camera, SPAWNING.minDistance * 0.6, SPAWNING.maxDistance);
    if (spot) enemy.position.set(spot.x, 0, spot.z);
  }

  /** A reachable point on the ring around the player, preferably off-screen. */
  private findSpot(player: Vec3, camera: CameraComponent, min: number, max: number): { x: number; z: number } | null {
    let fallback: { x: number; z: number } | null = null;
    for (let i = 0; i < SPAWNING.attempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = min + Math.random() * (max - min);
      const x = clamp(player.x + Math.cos(angle) * distance, this.bounds.minX + 1, this.bounds.maxX - 1);
      const z = clamp(player.z + Math.sin(angle) * distance, this.bounds.minZ + 1, this.bounds.maxZ - 1);
      if (!this.nav.isReachable(x, z)) continue;
      if (Math.hypot(x - player.x, z - player.z) < min * 0.75) continue;
      if (!this.onScreen(x, z, camera)) return { x, z };
      fallback ??= { x, z };
    }
    return fallback;
  }

  private onScreen(x: number, z: number, camera: CameraComponent): boolean {
    this.world.set(x, 0.9, z);
    camera.worldToScreen(this.world, this.screen);
    const rect = camera.system.app.graphicsDevice.clientRect;
    const w = rect.width, h = rect.height;
    const margin = 40;
    return this.screen.z > 0 && this.screen.x > -margin && this.screen.x < w + margin && this.screen.y > -margin && this.screen.y < h + margin;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
