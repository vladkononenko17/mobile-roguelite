import { Vec3 } from "playcanvas";
import { COMBAT_FX } from "./config";
import type { Effects } from "./Effects";
import { aimY, isAlive, type Enemy, type EnemyManager } from "./EnemyManager";
import type { PlayerStats } from "./PlayerStats";

/** What dealt a hit (decides which upgrades apply and how the number is shown). */
export type HitSource = "bullet" | "ricochet" | "chain" | "explosion" | "burn" | "drone" | "shock";

/** Damage-number style for the HUD. */
export type HitStyle = "normal" | "crit" | "burn" | "tech";

const TECH: ReadonlySet<HitSource> = new Set(["chain", "drone", "shock"]);
/** Sources that apply on-hit statuses (burn, slow) and can arc chain lightning. */
const WEAPON: ReadonlySet<HitSource> = new Set(["bullet", "ricochet"]);

interface PendingExplosion {
  x: number;
  z: number;
}

/**
 * Hit resolution for everything the hero deals, driven by PlayerStats (so upgrades are data):
 *   damage modifiers (burning vulnerability, tech damage, the charger's recovery window)
 *   -> EnemyManager.damage (death happens there, exactly once)
 *   -> statuses on weapon hits (burn, slow) and chain lightning arcs
 *   -> on-kill triggers (explosions, fire spread), queued so chain reactions spread over frames.
 * Ricochets, reload shock pulses and burn ticks also go through here. Visuals come from Effects,
 * damage numbers through `onHit`. Map-independent.
 */
export class Combat {
  /** Damage number hook: (world position, amount, style). */
  onHit: (position: Vec3, amount: number, style: HitStyle) => void = () => {};
  private readonly explosions: PendingExplosion[] = [];
  private readonly point = new Vec3();
  private readonly from = new Vec3();
  private readonly visited: Enemy[] = [];
  private frostTimer = 0;

  constructor(
    private readonly enemies: EnemyManager,
    private readonly effects: Effects,
    private readonly stats: PlayerStats,
  ) {}

  /** Chest-height point of an enemy (numbers, arcs, bounces). */
  private chest(e: Enemy, out: Vec3): Vec3 {
    return out.set(e.position.x, aimY(e), e.position.z);
  }

  /**
   * One hit of `base` damage from `source` (from the point fromX / fromZ, for knockback). Returns
   * true if it killed the enemy.
   */
  hit(e: Enemy, base: number, source: HitSource, fromX: number, fromZ: number, knockback = 0, crit = false): boolean {
    if (!isAlive(e)) return false;
    const s = this.stats;
    let amount = base;
    if (e.burnTime > 0 && s.burnVulnerability > 0) amount *= 1 + s.burnVulnerability;
    if (TECH.has(source)) amount *= s.techDamageMult;
    if (this.enemies.vulnerable(e)) amount *= 1.5;
    amount = Math.max(1, Math.round(amount));
    const wasBurning = e.burnTime > 0;
    const killed = this.enemies.damage(e, amount, fromX, fromZ, knockback);
    this.onHit(this.chest(e, this.point), amount, source === "burn" ? "burn" : crit ? "crit" : TECH.has(source) ? "tech" : "normal");
    if (killed) {
      this.onKilled(e, wasBurning);
      return true;
    }
    if (WEAPON.has(source)) {
      if (s.burnDps > 0) this.ignite(e);
      if (s.slowPct > 0) {
        e.slowTime = COMBAT_FX.slowSeconds;
        e.slowPct = s.slowPct;
      }
    }
    return false;
  }

  /**
   * A bullet hit from the gun (after its own crit roll): the hit itself, then chain lightning (a roll)
   * and ricochet bounces to the nearest other enemies. Returns true if the first enemy died.
   */
  bulletHit(e: Enemy, amount: number, crit: boolean, fromX: number, fromZ: number, knockback: number): boolean {
    const killed = this.hit(e, amount, "bullet", fromX, fromZ, knockback, crit);
    this.chain(e, amount);
    this.ricochet(e, amount);
    return killed;
  }

  private chain(origin: Enemy, amount: number): void {
    const s = this.stats;
    if (s.chainChance <= 0 || Math.random() >= s.chainChance) return;
    this.chest(origin, this.from);
    const targets = this.nearest(origin.position.x, origin.position.z, COMBAT_FX.chainRange, Math.round(s.chainTargets), [origin]);
    for (const t of targets) {
      this.effects.lightning(this.from, this.chest(t, this.point));
      this.hit(t, amount * COMBAT_FX.chainDamage, "chain", origin.position.x, origin.position.z, 0);
    }
  }

  private ricochet(origin: Enemy, amount: number): void {
    const bounces = Math.round(this.stats.ricochet);
    if (bounces <= 0) return;
    this.visited.length = 0;
    this.visited.push(origin);
    let from = origin;
    let damage = amount;
    for (let i = 0; i < bounces; i++) {
      const [next] = this.nearest(from.position.x, from.position.z, COMBAT_FX.ricochetRange, 1, this.visited);
      if (!next) break;
      damage *= COMBAT_FX.ricochetDamage;
      this.effects.tracer(this.chest(from, this.from), this.chest(next, this.point));
      this.effects.bloodHit(this.point, next.position.x - from.position.x, next.position.z - from.position.z, next.def.gore);
      this.hit(next, damage, "ricochet", from.position.x, from.position.z, 0.05);
      this.visited.push(next);
      from = next;
    }
  }

  /** Up to `count` living enemies nearest to (x, z) within `range`, excluding `skip`. */
  private nearest(x: number, z: number, range: number, count: number, skip: Enemy[]): Enemy[] {
    const found: { e: Enemy; d: number }[] = [];
    for (const e of this.enemies.alive) {
      if (!isAlive(e) || skip.includes(e)) continue;
      const d = Math.hypot(e.position.x - x, e.position.z - z);
      if (d <= range) found.push({ e, d });
    }
    found.sort((a, b) => a.d - b.d);
    return found.slice(0, count).map((f) => f.e);
  }

  private ignite(e: Enemy): void {
    e.burnTime = COMBAT_FX.burnSeconds;
    e.burnDps = Math.max(e.burnDps, this.stats.burnDps);
    if (e.burnTick <= 0) e.burnTick = COMBAT_FX.burnTick;
  }

  /** On-kill triggers: an explosion (chance), fire spreading from a burning corpse. */
  private onKilled(e: Enemy, wasBurning: boolean): void {
    const s = this.stats;
    if (s.explodeChance > 0 && Math.random() < s.explodeChance) this.explosions.push({ x: e.position.x, z: e.position.z });
    if (s.fireSpread > 0 && wasBurning && s.burnDps > 0) {
      for (const t of this.nearest(e.position.x, e.position.z, COMBAT_FX.fireSpreadRadius, 4, [e])) this.ignite(t);
    }
  }

  /** Weapon splash: `damage` to every other enemy within `radius` of `origin`, with a small blast. */
  splash(origin: Enemy, radius: number, damage: number): void {
    this.effects.explosion(this.point.set(origin.position.x, 0.3, origin.position.z), radius * 0.8);
    for (const e of this.nearest(origin.position.x, origin.position.z, radius, 8, [origin])) this.hit(e, damage, "explosion", origin.position.x, origin.position.z, 0.05);
  }

  /** Weapon burn: sets `e` burning at least `dps`. */
  burnFrom(e: Enemy, dps: number): void {
    if (!isAlive(e)) return;
    e.burnTime = COMBAT_FX.burnSeconds;
    e.burnDps = Math.max(e.burnDps, dps);
    if (e.burnTick <= 0) e.burnTick = COMBAT_FX.burnTick;
  }

  /** Reload shock pulse around the hero (Shock Reload). */
  shockwave(x: number, z: number): void {
    const damage = this.stats.shockDamage;
    if (damage <= 0) return;
    this.effects.ring(this.point.set(x, 0, z), COMBAT_FX.shockRadius, true);
    for (const e of this.nearest(x, z, COMBAT_FX.shockRadius, 64, [])) this.hit(e, damage, "shock", x, z, COMBAT_FX.shockKnockback);
  }

  update(dt: number): void {
    // Burning: damage ticks and flames; slowed: frost flecks now and then.
    this.frostTimer -= dt;
    const frost = this.frostTimer <= 0;
    if (frost) this.frostTimer = 0.25;
    for (const e of this.enemies.alive) {
      if (!isAlive(e)) continue;
      if (frost && e.slowTime > 0 && Math.random() < 0.5) this.effects.frostPuff(this.chest(e, this.point));
      if (e.burnTime <= 0) continue;
      e.burnTime -= dt;
      e.burnTick -= dt;
      if (e.burnTick > 0) continue;
      e.burnTick += COMBAT_FX.burnTick;
      this.effects.flame(this.chest(e, this.point));
      this.hit(e, e.burnDps * COMBAT_FX.burnTick, "burn", e.position.x, e.position.z);
      if (e.burnTime <= 0) e.burnDps = 0;
    }
    // Explosions (kills they cause may queue more; a few per frame).
    const s = this.stats;
    for (let n = 0; n < COMBAT_FX.maxExplosionsPerFrame && this.explosions.length; n++) {
      const { x, z } = this.explosions.shift()!;
      this.effects.explosion(this.point.set(x, 0, z), COMBAT_FX.explodeRadius);
      for (const t of this.nearest(x, z, COMBAT_FX.explodeRadius, 64, [])) {
        const killed = this.hit(t, s.explodeDamage, "explosion", x, z, 0.25);
        if (!killed && s.explosionsIgnite > 0 && s.burnDps > 0) this.ignite(t);
      }
    }
  }

  /** Drops pending explosions (new wave / restart). */
  reset(): void {
    this.explosions.length = 0;
  }
}
