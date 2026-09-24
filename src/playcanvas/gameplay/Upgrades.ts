import { UPGRADES, type UpgradeDef, type UpgradeId } from "./config";
import type { PlayerStats } from "./PlayerStats";

/**
 * Upgrade effects. Each only changes PlayerStats numbers, so upgrades stack and combine into builds
 * (the gun and player read effective values from PlayerStats every shot / frame).
 */
const EFFECTS: Record<UpgradeId, (s: PlayerStats) => void> = {
  damage: (s) => { s.damageMult *= 1.15; },
  fireRate: (s) => { s.fireRateMult *= 1.15; },
  penetration: (s) => { s.penetration += 1; },
  reload: (s) => { s.reloadMult *= 1.1; },
  magazine: (s) => { s.magazineMult += 0.25; },
  crit: (s) => { s.critChance = Math.min(0.6, s.critChance + 0.1); },
  maxHp: (s) => { s.maxHp += 20; s.heal(20); },
  moveSpeed: (s) => { s.moveSpeedMult *= 1.1; },
  armor: (s) => { s.armor = Math.min(0.6, s.armor + 0.1); },
  heal: (s) => { s.heal(s.maxHp * 0.3); },
  fifthShot: (s) => { s.fifthShot = true; },
  vampire: (s) => { s.vampireChance = Math.min(0.2, s.vampireChance + 0.06); },
};

/** Applies `id` and records it (for stack limits). */
export function applyUpgrade(stats: PlayerStats, id: UpgradeId): UpgradeDef {
  EFFECTS[id](stats);
  stats.upgrades.set(id, (stats.upgrades.get(id) ?? 0) + 1);
  return UPGRADES.find((u) => u.id === id)!;
}

/** Upgrades still available (under their stack limit; "heal" only when hurt). */
export function availableUpgrades(stats: PlayerStats): UpgradeDef[] {
  return UPGRADES.filter((u) => {
    if (u.maxStacks !== undefined && (stats.upgrades.get(u.id) ?? 0) >= u.maxStacks) return false;
    if (u.id === "heal" && stats.hp >= stats.maxHp) return false;
    return true;
  });
}

/** `count` distinct random choices, at most one per category first so offers feel varied. */
export function rollUpgrades(stats: PlayerStats, count: number): UpgradeDef[] {
  const pool = [...availableUpgrades(stats)];
  shuffle(pool);
  const picked: UpgradeDef[] = [];
  const categories = new Set<string>();
  for (const u of pool) {
    if (picked.length >= count) break;
    if (categories.has(u.category)) continue;
    picked.push(u);
    categories.add(u.category);
  }
  for (const u of pool) {
    if (picked.length >= count) break;
    if (!picked.includes(u)) picked.push(u);
  }
  return picked;
}

function shuffle<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
