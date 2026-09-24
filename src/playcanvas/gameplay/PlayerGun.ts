import { Vec3 } from "playcanvas";
import { PLAYER_COMBAT, type WeaponStats } from "./config";
import type { Effects } from "./Effects";
import type { Enemy, EnemyManager } from "./EnemyManager";
import { blocked } from "./NavField";
import type { PlayerStats } from "./PlayerStats";
import type { PlayerController } from "../player/PlayerController";
import type { WeaponHolder } from "../player/WeaponHolder";
import type { CollisionWorld } from "../world/collision/CollisionWorld";

const WALL_STEP = 0.4;
const SHOT_HEIGHT = 1.25;

/**
 * The hero's gun: auto-aim and auto-fire, made for one-thumb mobile play. The target is the best
 * enemy in range and in line of sight, preferring those ahead of where the player is steering, so
 * movement decides what gets shot; the hero turns to it (the legs keep running) and fires when
 * facing it. Hitscan bullets with spread, pellets and penetration; walls stop bullets. Magazine and
 * reload from the weapon stats (PlayerStats applies upgrades).
 */
export class PlayerGun {
  target: Enemy | null = null;
  ammo = 0;
  reloading = 0;
  private cooldown = 0;
  private shotCount = 0;
  /** Seconds without a target. */
  private idle = 0;
  private weaponKey = "";
  private readonly origin = new Vec3();
  private readonly muzzle = new Vec3();
  private readonly end = new Vec3();
  private readonly hits: { enemy: Enemy; t: number }[] = [];

  /** Damage number / feedback hook: (world position, amount, crit). */
  onHit: (position: Vec3, amount: number, crit: boolean) => void = () => {};
  /** Called with the enemy after a killing shot. */
  onKill: (enemy: Enemy) => void = () => {};

  constructor(
    private readonly enemies: EnemyManager,
    private readonly effects: Effects,
    private readonly collision: CollisionWorld,
    private readonly stats: PlayerStats,
  ) {}

  /** Refills the magazine (new weapon, new level). */
  reset(): void {
    const s = this.stats.weaponStats();
    this.ammo = s?.magazine ?? 0;
    this.reloading = 0;
    this.cooldown = 0.3;
    this.target = null;
  }

  update(dt: number, player: PlayerController, weapon: WeaponHolder, scale: number, active: boolean): void {
    const stats = this.stats.weaponStats();
    const key = this.stats.weapon;
    if (key !== this.weaponKey) {
      this.weaponKey = key;
      this.reset();
    }
    this.cooldown -= dt;
    if (!active || !stats) {
      this.target = null;
      player.aimYawDeg = null;
      return;
    }
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.ammo = stats.magazine;
    }
    // Empty: reload at once. Partly empty with nothing to shoot for a moment: top up.
    if (this.reloading <= 0 && this.ammo < stats.magazine && (this.ammo <= 0 || this.idle > 1.5)) this.reloading = stats.reloadSeconds;
    const position = player.entity.getPosition();
    this.origin.set(position.x, SHOT_HEIGHT * scale, position.z);
    this.target = this.pickTarget(position.x, position.z, stats, player);
    if (!this.target) {
      this.idle += dt;
      player.aimYawDeg = null;
      return;
    }
    this.idle = 0;
    const tx = this.target.position.x - position.x, tz = this.target.position.z - position.z;
    const aimYaw = (Math.atan2(tx, tz) * 180) / Math.PI;
    player.aimYawDeg = aimYaw;
    const facingError = Math.abs(((aimYaw - player.yawDeg + 540) % 360) - 180);
    if (this.cooldown > 0 || this.reloading > 0 || facingError > 20) return;
    if (this.ammo <= 0) return;
    this.fire(stats, tx, tz, weapon);
  }

  private pickTarget(x: number, z: number, stats: WeaponStats, player: PlayerController): Enemy | null {
    // Preferred direction: where the player steers, else where the hero faces.
    let px = player.moveDirection.x, pz = player.moveDirection.z;
    if (px === 0 && pz === 0) {
      const yaw = (player.yawDeg * Math.PI) / 180;
      px = Math.sin(yaw);
      pz = Math.cos(yaw);
    }
    const half = (PLAYER_COMBAT.aimHalfAngleDeg * Math.PI) / 180;
    let best: Enemy | null = null;
    let bestScore = Infinity;
    // Keep the current target while it stays valid (no flicker between equals).
    for (const e of this.enemies.alive) {
      if (e.state === "dead") continue;
      const dx = e.position.x - x, dz = e.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d > stats.range + e.def.radius) continue;
      const angle = Math.acos(Math.max(-1, Math.min(1, (dx * px + dz * pz) / (d || 1))));
      let score = d + (angle > half ? PLAYER_COMBAT.aimAnglePenalty * 2 : 0) + angle * PLAYER_COMBAT.aimAnglePenalty * 0.5;
      if (e === this.target) score -= 1.5;
      if (e.def.boss) score -= 0.5;
      if (score >= bestScore) continue;
      if (!this.lineOfSight(x, z, e.position.x, e.position.z)) continue;
      best = e;
      bestScore = score;
    }
    return best;
  }

  private lineOfSight(x0: number, z0: number, x1: number, z1: number): boolean {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.floor(d / WALL_STEP);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (blocked(this.collision, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 0.05)) return false;
    }
    return true;
  }

  /** Distance a bullet from the origin along (dx, dz) travels before a wall (up to `range`). */
  private wallDistance(dx: number, dz: number, range: number): number {
    for (let d = WALL_STEP; d < range; d += WALL_STEP) {
      if (blocked(this.collision, this.origin.x + dx * d, this.origin.z + dz * d, 0.05)) return d;
    }
    return range;
  }

  private fire(stats: WeaponStats, tx: number, tz: number, weapon: WeaponHolder): void {
    this.cooldown = 1 / stats.fireRate;
    this.ammo--;
    this.shotCount++;
    const muzzle = weapon.muzzle(this.muzzle) ?? this.muzzle.copy(this.origin);
    this.effects.muzzleFlash(muzzle, stats.pellets > 1 ? 0.32 : 0.22);
    const baseAngle = Math.atan2(tx, tz);
    const bonus = this.stats.fifthShot && this.shotCount % 5 === 0 ? 2.5 : 1;
    for (let p = 0; p < stats.pellets; p++) {
      const spread = ((Math.random() * 2 - 1) * stats.spreadDeg * Math.PI) / 180;
      const angle = baseAngle + spread;
      const dx = Math.sin(angle), dz = Math.cos(angle);
      const range = this.wallDistance(dx, dz, stats.range);
      this.enemies.raycast(this.origin.x, this.origin.z, dx, dz, range, this.hits);
      let travel = range;
      let pierce = stats.penetration;
      for (const hit of this.hits) {
        const crit = Math.random() < this.stats.critChance;
        const vulnerable = this.enemies.vulnerable(hit.enemy) ? 1.5 : 1;
        const amount = Math.round(stats.damage * bonus * (crit ? 2 : 1) * vulnerable);
        const point = this.end.set(this.origin.x + dx * hit.t, muzzle.y, this.origin.z + dz * hit.t);
        this.effects.spark(point);
        this.onHit(point, amount, crit || bonus > 1);
        if (this.enemies.damage(hit.enemy, amount, this.origin.x, this.origin.z, stats.knockback)) this.onKill(hit.enemy);
        travel = hit.t;
        if (pierce-- <= 0) break;
      }
      this.end.set(this.origin.x + dx * travel, muzzle.y, this.origin.z + dz * travel);
      this.effects.tracer(muzzle, this.end);
    }
  }
}
