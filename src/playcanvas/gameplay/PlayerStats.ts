import { PLAYER_COMBAT, WEAPON_STATS, type UpgradeId, type WeaponStats } from "./config";
import type { WeaponId } from "../config";

/**
 * The hero's run state: health, currency and every modifier that upgrades and the shop change.
 * Combat reads effective values from here, so upgrades compose (they only touch these numbers).
 */
export class PlayerStats {
  maxHp = PLAYER_COMBAT.maxHp;
  hp = PLAYER_COMBAT.maxHp;
  cash = 0;
  /** Fraction of incoming damage removed (0..0.75). */
  armor = 0;
  damageMult = 1;
  fireRateMult = 1;
  reloadMult = 1;
  magazineMult = 1;
  moveSpeedMult = 1;
  penetration = 0;
  critChance = 0;
  /** Every Nth bullet deals bonus damage (0 = off). */
  fifthShot = false;
  /** Chance per kill to heal `vampireHeal`. */
  vampireChance = 0;
  vampireHeal = 5;
  weapon: WeaponId = "pistol";
  readonly owned = new Set<WeaponId>(["pistol"]);
  readonly upgrades = new Map<UpgradeId, number>();
  invulnerable = 0;
  kills = 0;

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
      reloadSeconds: base.reloadSeconds / this.reloadMult,
      magazine: Math.round(base.magazine * this.magazineMult),
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
