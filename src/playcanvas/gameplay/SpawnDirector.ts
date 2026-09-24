import { Vec3 } from "playcanvas";
import type { ScreenProjector } from "../camera/ScreenProjector";
import { SPAWNING, WAVES, type EnemyId, type WaveDef, type WaveEnemyId, type WavePhase } from "./config";
import { isAlive, type Enemy, type EnemyManager } from "./EnemyManager";
import type { NavField } from "./NavField";

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** "waves": timed spawning; "boss": time is up and the boss is alive; "complete": the wave is over. */
export type DirectorPhase = "waves" | "boss" | "complete";

/**
 * Runs one wave from its WaveDef data: the pacing step in effect (spawn interval, group size, alive
 * cap, type weights) decides when a group spawns and of what; when the time runs out the wave
 * completes, or its boss arrives and the wave completes when the boss dies. At the start a few
 * enemies are placed just outside the view so the first ones walk into sight within a second or two.
 *
 * Spawn points: along a random direction from the player, the first point that is just off-screen
 * (never on screen, never next to the player), pushed a little further out, on a navigable cell
 * connected to the player. So enemies arrive from every side soon after they spawn, whatever the
 * camera shows. Nothing here depends on the map beyond the NavField and the arena bounds.
 */
export class SpawnDirector {
  wave: WaveDef = WAVES[0];
  waveIndex = 0;
  time = 0;
  phase: DirectorPhase = "waves";
  boss: Enemy | null = null;
  /** Multiplies every wave's time (debug: ?waveTime=0.2 for quick tests). */
  durationScale = 1;
  private nextGroup = 0;
  private prespawnPending = false;
  private readonly screen = new Vec3();
  private readonly world = new Vec3();

  constructor(
    private readonly enemies: EnemyManager,
    private readonly nav: NavField,
    private readonly bounds: Bounds,
  ) {}

  start(waveIndex: number): void {
    this.waveIndex = waveIndex;
    this.wave = WAVES[waveIndex];
    this.time = 0;
    this.phase = "waves";
    this.boss = null;
    this.nextGroup = this.wave.phases[0].spawnInterval;
    // Placed on the first update, once the camera follows the hero at the new start position (the
    // off-screen tests use the camera's projection).
    this.prespawnPending = true;
  }

  /** 0..1 through the wave's time. */
  get progress(): number {
    return Math.min(1, this.time / this.duration);
  }

  /** This wave's time (s). */
  get duration(): number {
    return this.wave.duration * this.durationScale;
  }

  /** The pacing step in effect. */
  private get step(): WavePhase {
    const phases = this.wave.phases;
    const t = this.time / this.durationScale;
    let current = phases[0];
    for (const p of phases) if (p.at <= t) current = p;
    return current;
  }

  update(dt: number, player: Vec3, camera: ScreenProjector): void {
    if (this.phase === "complete") return;
    if (this.prespawnPending && this.time > 0.05) {
      this.prespawnPending = false;
      this.prespawn(player, camera);
    }
    this.time += dt;
    if (this.phase === "waves" && this.time >= this.duration) {
      const boss = this.wave.boss;
      if (!boss) {
        this.phase = "complete";
        return;
      }
      if (this.spawnBoss(boss.type, player, camera)) this.phase = "boss";
    }
    if (this.phase === "boss" && this.boss && !isAlive(this.boss)) {
      this.phase = "complete";
      return;
    }
    const step = this.step;
    const interval = this.phase === "boss" ? step.spawnInterval / (this.wave.boss?.spawnFactor ?? 1) : step.spawnInterval;
    this.nextGroup -= dt;
    if (this.nextGroup > 0) return;
    this.nextGroup = interval;
    const room = step.maxAlive - this.enemies.livingCount;
    if (room <= 0) return;
    const size = step.group[0] + Math.floor(Math.random() * (step.group[1] - step.group[0] + 1));
    this.spawnGroup(Math.min(size, room), step, player, camera);
  }

  /** The wave's opening enemies, in groups of 2-3 from different sides just outside the view. */
  private prespawn(player: Vec3, camera: ScreenProjector): void {
    let left = this.wave.prespawn;
    const step = this.wave.phases[0];
    while (left > 0) {
      const n = Math.min(left, 2 + Math.floor(Math.random() * 2));
      this.spawnGroup(n, step, player, camera, [0.3, 1.2]);
      left -= n;
    }
  }

  private pickType(step: WavePhase): EnemyId {
    const entries = Object.entries(step.weights) as [WaveEnemyId, number][];
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = Math.random() * total;
    for (const [id, w] of entries) {
      r -= w;
      if (r <= 0) return id;
    }
    return entries[0][0];
  }

  private spawnGroup(count: number, step: WavePhase, player: Vec3, camera: ScreenProjector, extra = SPAWNING.extra): void {
    const centre = this.findSpot(player, camera, extra);
    if (!centre) return;
    for (let i = 0; i < count; i++) {
      const type = this.pickType(step);
      if (!this.enemies.canSpawn(type)) continue;
      // Scatter within the group, on walkable cells that are still off-screen.
      let x = centre.x, z = centre.z;
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * SPAWNING.groupSpread;
        const cx = centre.x + Math.cos(a) * r, cz = centre.z + Math.sin(a) * r;
        if (this.nav.isReachable(cx, cz) && !this.onScreen(cx, cz, camera)) {
          x = cx;
          z = cz;
          break;
        }
      }
      this.enemies.spawn(type, x, z, this.wave.hpScale, this.wave.damageScale);
    }
  }

  private spawnBoss(type: EnemyId, player: Vec3, camera: ScreenProjector): boolean {
    const spot = this.findSpot(player, camera, [2, 4]);
    if (!spot) return false;
    this.boss = this.enemies.spawn(type, spot.x, spot.z, 1, 1);
    return this.boss !== null;
  }

  /** Moves a stranded enemy (a boss) to a fresh spawn point. */
  relocate(enemy: Enemy, player: Vec3, camera: ScreenProjector): void {
    const spot = this.findSpot(player, camera, SPAWNING.extra);
    if (spot) enemy.position.set(spot.x, 0, spot.z);
  }

  /**
   * A reachable point just outside the view: along a random direction, the first point off-screen
   * by the margin, plus `extra` metres (random in range). Falls back to any reachable off-screen point.
   */
  private findSpot(player: Vec3, camera: ScreenProjector, extra: [number, number]): { x: number; z: number } | null {
    for (let i = 0; i < SPAWNING.attempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      let edge = -1;
      for (let d = SPAWNING.minDistance; d <= SPAWNING.maxDistance; d += 0.5) {
        if (!this.onScreen(player.x + dx * d, player.z + dz * d, camera)) {
          edge = d;
          break;
        }
      }
      if (edge < 0) continue;
      const d = Math.min(SPAWNING.maxDistance, edge + extra[0] + Math.random() * (extra[1] - extra[0]));
      const x = player.x + dx * d, z = player.z + dz * d;
      if (x < this.bounds.minX + 1 || x > this.bounds.maxX - 1 || z < this.bounds.minZ + 1 || z > this.bounds.maxZ - 1) continue;
      if (!this.nav.isReachable(x, z) || this.onScreen(x, z, camera)) continue;
      return { x, z };
    }
    return null;
  }

  /** Whether any part of a body standing at (x, z) could be on screen (feet or head, with margin). */
  private onScreen(x: number, z: number, camera: ScreenProjector): boolean {
    const mx = SPAWNING.screenMargin / camera.width, my = SPAWNING.screenMargin / camera.height;
    for (const y of [0, 2]) {
      this.world.set(x, y, z);
      const s = camera.normalized(this.world, this.screen);
      if (s.z > 0 && s.x > -mx && s.x < 1 + mx && s.y > -my && s.y < 1 + my) return true;
    }
    return false;
  }
}
