import { SYNERGIES, UPGRADES, type SynergyTier, type UpgradeDef, type UpgradeEffect, type UpgradeId, type UpgradePool, type UpgradeTag } from "./config";
import type { PlayerStats } from "./PlayerStats";

/**
 * Applies upgrades from their data (UPGRADES effects). Effects only change PlayerStats numbers, so
 * upgrades stack and combine into builds (the gun, combat and player read effective values every
 * shot / frame). Tags count toward synergies (SYNERGIES), whose tiers apply once when reached;
 * evolutions (UpgradeDef.requires) are offered first as soon as their requirements are met.
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

/** Stacks already taken of `id`. */
export function upgradeStacks(stats: PlayerStats, id: UpgradeId): number {
  return stats.upgrades.get(id) ?? 0;
}

/** Upgrade stacks owned per tag. */
export function tagCounts(stats: PlayerStats): Record<UpgradeTag, number> {
  const counts: Record<UpgradeTag, number> = { fire: 0, precision: 0, tech: 0 };
  for (const [id, stacks] of stats.upgrades) for (const tag of upgradeDef(id).tags ?? []) counts[tag] += stacks;
  return counts;
}

/** A synergy tier reached by an upgrade (for the toast). */
export interface SynergyReached {
  tag: UpgradeTag;
  tier: SynergyTier;
  level: number;
}

/**
 * Applies one stack of `id` and records it (stack limits, card levels); then applies any synergy
 * tiers this reached and returns them.
 */
export function applyUpgrade(stats: PlayerStats, id: UpgradeId): { def: UpgradeDef; synergies: SynergyReached[] } {
  const def = upgradeDef(id);
  for (const effect of def.effects) applyEffect(stats, effect);
  stats.upgrades.set(id, upgradeStacks(stats, id) + 1);
  const synergies: SynergyReached[] = [];
  const counts = tagCounts(stats);
  for (const tag of Object.keys(SYNERGIES) as UpgradeTag[]) {
    const tiers = SYNERGIES[tag].tiers;
    let reached = stats.synergyTiers.get(tag) ?? 0;
    while (reached < tiers.length && counts[tag] >= tiers[reached].count) {
      for (const effect of tiers[reached].effects) applyEffect(stats, effect);
      synergies.push({ tag, tier: tiers[reached], level: reached + 1 });
      reached++;
    }
    stats.synergyTiers.set(tag, reached);
  }
  return { def, synergies };
}

/** Whether an evolution's requirements are met. */
function unlocked(stats: PlayerStats, def: UpgradeDef): boolean {
  return (def.requires ?? []).every((r) => upgradeStacks(stats, r.id) >= r.stacks);
}

/**
 * Upgrades in `pool` that can be offered: under their stack limit, not banished, requirements met
 * (evolutions), and pure heals only when hurt.
 */
export function availableUpgrades(stats: PlayerStats, pool: UpgradePool): UpgradeDef[] {
  return UPGRADES.filter((u) => {
    if (!(u.pools ?? ["levelUp", "drop"]).includes(pool)) return false;
    if (stats.banished.has(u.id)) return false;
    if (u.maxStacks !== undefined && upgradeStacks(stats, u.id) >= u.maxStacks) return false;
    if (!unlocked(stats, u)) return false;
    const healOnly = u.effects.every((e) => "heal" in e || "healFraction" in e);
    if (healOnly && stats.hp >= stats.maxHp) return false;
    return true;
  });
}

/**
 * `count` distinct random choices from `pool`: unlocked evolutions first, then one per category so
 * offers feel varied, then the rest. `exclude` keeps cards already shown (reroll / banish refills).
 */
export function rollUpgrades(stats: PlayerStats, count: number, pool: UpgradePool, exclude: UpgradeId[] = []): UpgradeDef[] {
  const options = availableUpgrades(stats, pool).filter((u) => !exclude.includes(u.id));
  shuffle(options);
  const picked: UpgradeDef[] = options.filter((u) => u.requires).slice(0, count);
  const categories = new Set<string>(picked.map((u) => u.category));
  for (const u of options) {
    if (picked.length >= count) break;
    if (picked.includes(u) || categories.has(u.category)) continue;
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
