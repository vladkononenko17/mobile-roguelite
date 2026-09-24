import { UPGRADES, type UpgradeDef, type UpgradeEffect, type UpgradeId, type UpgradePool } from "./config";
import type { PlayerStats } from "./PlayerStats";

/**
 * Applies upgrades from their data (UPGRADES effects). Effects only change PlayerStats numbers, so
 * upgrades stack and combine into builds (the gun and player read effective values every shot / frame).
 */
function applyEffect(stats: PlayerStats, effect: UpgradeEffect): void {
  if ("heal" in effect) {
    stats.heal(effect.heal);
    return;
  }
  if ("healFraction" in effect) {
    stats.heal(stats.maxHp * effect.healFraction);
    return;
  }
  const current = stats[effect.stat];
  let next = effect.op === "mul" ? current * effect.value : current + effect.value;
  if (effect.max !== undefined) next = Math.min(effect.max, next);
  if (effect.min !== undefined) next = Math.max(effect.min, next);
  stats[effect.stat] = next;
}

export function upgradeDef(id: UpgradeId): UpgradeDef {
  return UPGRADES.find((u) => u.id === id)!;
}

/** Applies one stack of `id` and records it (stack limits, card levels). */
export function applyUpgrade(stats: PlayerStats, id: UpgradeId): UpgradeDef {
  const def = upgradeDef(id);
  for (const effect of def.effects) applyEffect(stats, effect);
  stats.upgrades.set(id, (stats.upgrades.get(id) ?? 0) + 1);
  return def;
}

/** Stacks already taken of `id`. */
export function upgradeStacks(stats: PlayerStats, id: UpgradeId): number {
  return stats.upgrades.get(id) ?? 0;
}

/** Upgrades in `pool` still available (under their stack limit; pure heals only when hurt). */
export function availableUpgrades(stats: PlayerStats, pool: UpgradePool): UpgradeDef[] {
  return UPGRADES.filter((u) => {
    if (!(u.pools ?? ["levelUp", "drop"]).includes(pool)) return false;
    if (u.maxStacks !== undefined && upgradeStacks(stats, u.id) >= u.maxStacks) return false;
    const healOnly = u.effects.every((e) => "heal" in e || "healFraction" in e);
    if (healOnly && stats.hp >= stats.maxHp) return false;
    return true;
  });
}

/** `count` distinct random choices from `pool`, one per category first so offers feel varied. */
export function rollUpgrades(stats: PlayerStats, count: number, pool: UpgradePool): UpgradeDef[] {
  const options = [...availableUpgrades(stats, pool)];
  shuffle(options);
  const picked: UpgradeDef[] = [];
  const categories = new Set<string>();
  for (const u of options) {
    if (picked.length >= count) break;
    if (categories.has(u.category)) continue;
    picked.push(u);
    categories.add(u.category);
  }
  for (const u of options) {
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
