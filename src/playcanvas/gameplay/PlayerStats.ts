import { LEVEL_UP, PLAYER_COMBAT, WEAPON_STATS, xpToNext, type UpgradeId, type UpgradeTag, type WeaponStats } from "./config";
import type { WeaponId } from "../config";

/**
 * The hero's run state: health, cash (the shop currency), character level / XP (level-ups offer
 * upgrades; separate from cash) and every modifier that upgrades and the shop change. Combat reads
 * effective values from here, so upgrades compose (they only touch these numbers).
 */
export class PlayerStats {
  maxHp = PLAYER_COMBAT.maxHp;
  hp = PLAYER_COMBAT.maxHp;
  cash = 0;
  /** Fraction of incoming damage removed (0..0.75). */
  armor = 0;
  damageMult = 1;
  fireRateMult = 1;
  /** Multiplies the reload time (< 1 = faster). */
  reloadTimeMult = 1;
  /** Extra rounds per magazine. */
  magazineBonus = 0;
  moveSpeedMult = 1;
  penetration = 0;
  critChance = 0;
  /** Crit damage multiplier; crits pierce this many extra enemies. */
  critMult = 2;
  critPierce = 0;
  healOnKill = 0;
  // Behaviour upgrades (read by gameplay/Combat.ts; 0 = off).
  /** Burn damage per second applied by hits; burning enemies take +this fraction damage. */
  burnDps = 0;
  burnVulnerability = 0;
  /** 1: burning enemies set nearby ones on fire when they die. */
  fireSpread = 0;
  /** Chance that a kill explodes, its damage, and whether explosions ignite. */
  explodeChance = 0;
  explodeDamage = 12;
  explosionsIgnite = 0;
  /** Extra enemies a bullet bounces to; extra bullets per shot. */
  ricochet = 0;
  extraBullets = 0;
  /** Chain lightning: chance per hit and targets per arc. */
  chainChance = 0;
  chainTargets = 2;
  drones = 0;
  /** Multiplies drone, arc and shock damage. */
  techDamageMult = 1;
  /** Fraction of speed removed from hit enemies. */
  slowPct = 0;
  /** Damage of the reload shock pulse (0 = off). */
  shockDamage = 0;
  /** Every 5th bullet deals bonus damage (0 = off, 1 = on). */
  fifthShot = 0;
  /** Chance per kill to heal `vampireHeal`. */
  vampireChance = 0;
  vampireHeal = 5;
  weapon: WeaponId = "pistol";
  readonly owned = new Set<WeaponId>(["pistol"]);
  /** Shop purchases this run, per item (prices grow, stat items are capped). */
  readonly bought = new Map<string, number>();
  readonly upgrades = new Map<UpgradeId, number>();
  /** Upgrades removed from the level-up offers for this run. */
  readonly banished = new Set<UpgradeId>();
  /** Highest synergy tier reached per tag (its effects already applied). */
  readonly synergyTiers = new Map<UpgradeTag, number>();
  rerolls = LEVEL_UP.rerolls;
  banishes = LEVEL_UP.banishes;
  invulnerable = 0;
  kills = 0;
  /** Character level and XP toward the next one. */
  level = 1;
  xp = 0;

  /** XP needed for the next level. */
  get xpNeeded(): number {
    return xpToNext(this.level);
  }

  /** Adds XP; returns how many levels were gained. */
  gainXp(amount: number): number {
    this.xp += amount;
    let gained = 0;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      gained++;
    }
    return gained;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /** The current weapon's stats with every modifier applied. */
  weaponStats(): WeaponStats | null {
    const base = WEAPON_STATS[this.weapon];
    if (!base) return null;
    return {
      ...base,
      damage: base.damage * this.damageMult,
      fireRate: base.fireRate * this.fireRateMult,
      reloadSeconds: base.reloadSeconds * this.reloadTimeMult,
      magazine: base.magazine + this.magazineBonus,
      penetration: base.penetration + this.penetration,
    };
  }

  /** Applies incoming damage (armor, invulnerability). Returns the damage actually taken. */
  hurt(amount: number): number {
    if (this.invulnerable > 0 || !this.alive) return 0;
    const taken = Math.max(1, Math.round(amount * (1 - this.armor)));
    this.hp = Math.max(0, this.hp - taken);
    this.invulnerable = PLAYER_COMBAT.hitInvulnerability;
    return taken;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }
}
