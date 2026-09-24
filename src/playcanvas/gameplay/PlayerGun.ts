import { Vec3 } from "playcanvas";
import type { ScreenProjector } from "../camera/ScreenProjector";
import { TARGETING, type WeaponStats } from "./config";
import type { Effects } from "./Effects";
import { isAlive, type Enemy, type EnemyManager } from "./EnemyManager";
import { blocked } from "./NavField";
import type { PlayerStats } from "./PlayerStats";
import type { PlayerController } from "../player/PlayerController";
import type { WeaponHolder } from "../player/WeaponHolder";
import type { CollisionWorld } from "../world/collision/CollisionWorld";

const WALL_STEP = 0.4;
const SHOT_HEIGHT = 1.25;

/** Screen-space debug info for the targeting overlay (CSS pixels of the canvas). */
export interface TargetingDebug {
  /** The inner combat viewport. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** The current target's aim point on screen and its distance (null: no target). */
  target: { x: number; y: number; distance: number; label: string } | null;
}

/**
 * The hero's gun: auto-aim and auto-fire, made for one-thumb mobile play. Only enemies the player can
 * see are ever targeted: candidates are alive enemies whose chest point is inside the inner combat
 * viewport of the gameplay camera (TARGETING margins), in weapon range and in line of sight, and the
 * nearest one is picked. The target is then kept (no flicker between equals) while it stays valid,
 * with a little slack and a very short grace at the viewport edge; off-screen enemies never become
 * targets, and with no valid target the gun does not fire. The hero turns to the target (the legs
 * keep running) and fires when facing it. Hitscan bullets with spread, pellets and penetration; walls
 * stop bullets. Magazine and reload from the weapon stats (PlayerStats applies upgrades).
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
  private readonly aimPoint = new Vec3();
  private readonly screen = new Vec3();
  /** Seconds the current target has been outside the (slack) viewport. */
  private hidden = 0;
  /** Filled every update for the debug overlay. */
  readonly debug: TargetingDebug = { left: 0, top: 0, right: 0, bottom: 0, target: null };

  /** Damage number / feedback hook: (world position, amount, crit). */
  onHit: (position: Vec3, amount: number, crit: boolean) => void = () => {};
  /** Called with the enemy after a killing shot. */
  onKill: (enemy: Enemy) => void = () => {};

  constructor(
    private readonly enemies: EnemyManager,
    private readonly effects: Effects,
    private readonly collision: CollisionWorld,
    private readonly stats: PlayerStats,
    private readonly camera: ScreenProjector,
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
      this.debug.target = null;
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
    this.target = this.pickTarget(position.x, position.z, stats, dt);
    this.updateDebug(position.x, position.z);
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

  /**
   * The current target while it stays valid (alive, in range, in sight, on screen within the slack
   * and grace), else the nearest valid enemy inside the combat viewport, else null.
   */
  private pickTarget(x: number, z: number, stats: WeaponStats, dt: number): Enemy | null {
    const current = this.target;
    if (current && this.valid(current, x, z, stats)) {
      this.hidden = this.onScreen(current, TARGETING.keepSlack) ? 0 : this.hidden + dt;
      if (this.hidden <= TARGETING.graceSeconds) return current;
    }
    this.hidden = 0;
    let best: Enemy | null = null;
    let bestDistance = Infinity;
    for (const e of this.enemies.alive) {
      const d = Math.hypot(e.position.x - x, e.position.z - z);
      if (d >= bestDistance || e === current) continue;
      if (!this.valid(e, x, z, stats) || !this.onScreen(e, 0)) continue;
      best = e;
      bestDistance = d;
    }
    return best;
  }

  /** Alive, in weapon range and in line of sight (screen visibility is checked separately). */
  private valid(e: Enemy, x: number, z: number, stats: WeaponStats): boolean {
    if (!isAlive(e)) return false;
    if (Math.hypot(e.position.x - x, e.position.z - z) > stats.range + e.def.radius) return false;
    return this.lineOfSight(x, z, e.position.x, e.position.z);
  }

  /** Whether the enemy's chest point is inside the combat viewport grown by `slack` (fraction). */
  private onScreen(e: Enemy, slack: number): boolean {
    this.aimPoint.set(e.position.x, TARGETING.aimHeight * e.scale, e.position.z);
    const s = this.camera.normalized(this.aimPoint, this.screen);
    if (s.z <= 0) return false;
    return (
      s.x >= TARGETING.marginX - slack && s.x <= 1 - TARGETING.marginX + slack &&
      s.y >= TARGETING.marginTop - slack && s.y <= 1 - TARGETING.marginBottom + slack
    );
  }

  private updateDebug(x: number, z: number): void {
    const { width, height } = this.camera;
    const d = this.debug;
    d.left = width * TARGETING.marginX;
    d.right = width * (1 - TARGETING.marginX);
    d.top = height * TARGETING.marginTop;
    d.bottom = height * (1 - TARGETING.marginBottom);
    const t = this.target;
    if (!t) {
      d.target = null;
      return;
    }
    this.aimPoint.set(t.position.x, TARGETING.aimHeight * t.scale, t.position.z);
    const s = this.camera.toScreen(this.aimPoint, this.screen);
    d.target = { x: s.x, y: s.y, distance: Math.hypot(t.position.x - x, t.position.z - z), label: t.def.label };
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
    // A casing flies out to the right (the hero faces the target when firing).
    this.effects.casing(muzzle, -Math.cos(baseAngle), Math.sin(baseAngle));
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
        this.effects.bloodHit(point, dx, dz);
        this.onHit(point, amount, crit || bonus > 1);
        if (this.enemies.damage(hit.enemy, amount, this.origin.x, this.origin.z, stats.knockback)) this.onKill(hit.enemy);
        travel = hit.t;
        if (pierce-- <= 0) break;
      }
      this.end.set(this.origin.x + dx * travel, muzzle.y, this.origin.z + dz * travel);
      this.effects.tracer(muzzle, this.end);
      // Stopped by a wall (not an enemy, not the end of the range): dust and a spark there.
      if (travel === range && range < stats.range) this.effects.impact(this.end);
    }
  }
}
