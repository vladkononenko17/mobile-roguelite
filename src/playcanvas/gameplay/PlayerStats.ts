import { PLAYER_COMBAT, WEAPON_STATS, xpToNext, type UpgradeId, type WeaponStats } from "./config";
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
  /** Every 5th bullet deals bonus damage (0 = off, 1 = on). */
  fifthShot = 0;
  /** Chance per kill to heal `vampireHeal`. */
  vampireChance = 0;
  vampireHeal = 5;
  weapon: WeaponId = "pistol";
  readonly owned = new Set<WeaponId>(["pistol"]);
  readonly upgrades = new Map<UpgradeId, number>();
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
