import type { PlayerStats } from "./PlayerStats";

/**
 * Meta-progression between runs (the genre's retention loop: Vampire Survivors' PowerUps,
 * Survivor.io's talents). Every run, won or lost, pays DUST; the title screen's Upgrades screen spends
 * it on permanent ranks that apply at the start of every run in every chapter. Kept in this browser.
 */
export type MetaId = "vitality" | "power" | "haste" | "plating" | "magnet" | "greed" | "wisdom" | "luck" | "reroll" | "secondWind";

export interface MetaDef {
  id: MetaId;
  name: string;
  /** Per rank ("+10 max HP"). */
  text: string;
  ranks: number;
  /** Price of the first rank; each next rank costs `growth` x more. */
  cost: number;
  growth: number;
  apply: (s: PlayerStats, rank: number) => void;
}

export const META: MetaDef[] = [
  { id: "vitality", name: "Vitality", text: "+10 max HP", ranks: 5, cost: 20, growth: 1.55, apply: (s, r) => { s.maxHp += 10 * r; s.hp = s.maxHp; } },
  { id: "power", name: "Power", text: "+5% weapon damage", ranks: 5, cost: 25, growth: 1.6, apply: (s, r) => { s.damageMult *= 1 + 0.05 * r; } },
  { id: "haste", name: "Trigger Discipline", text: "+4% fire rate", ranks: 5, cost: 25, growth: 1.6, apply: (s, r) => { s.fireRateMult *= 1 + 0.04 * r; } },
  { id: "plating", name: "Plating", text: "+3% damage resistance", ranks: 3, cost: 35, growth: 1.7, apply: (s, r) => { s.armor += 0.03 * r; } },
  { id: "magnet", name: "Magnetism", text: "+15% pickup radius", ranks: 3, cost: 15, growth: 1.6, apply: (s, r) => { s.magnetMult *= 1 + 0.15 * r; } },
  { id: "greed", name: "Greed", text: "+20$ starting cash", ranks: 4, cost: 20, growth: 1.6, apply: (s, r) => { s.cash += 20 * r; } },
  { id: "wisdom", name: "Wisdom", text: "+8% XP", ranks: 3, cost: 30, growth: 1.7, apply: (s, r) => { s.xpMult *= 1 + 0.08 * r; } },
  { id: "luck", name: "Luck", text: "Rarer upgrades and bigger chests", ranks: 3, cost: 40, growth: 1.7, apply: (s, r) => { s.luck += 0.2 * r; } },
  { id: "reroll", name: "Second Opinion", text: "+1 level-up reroll per run", ranks: 2, cost: 45, growth: 2, apply: (s, r) => { s.rerolls += r; } },
  { id: "secondWind", name: "Second Wind", text: "Revive once per run at half HP", ranks: 1, cost: 150, growth: 1, apply: (s, r) => { s.revives += r; } },
];

const KEY = "dustline.meta";

interface MetaSave {
  dust: number;
  ranks: Partial<Record<MetaId, number>>;
  /** Dust earned over all runs (shown on the screen). */
  total: number;
}

export function loadMeta(): MetaSave {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as MetaSave | null;
    if (raw && typeof raw.dust === "number") return { dust: raw.dust, ranks: raw.ranks ?? {}, total: raw.total ?? raw.dust };
  } catch {
    /* storage unavailable or corrupt */
  }
  return { dust: 0, ranks: {}, total: 0 };
}

function saveMeta(m: MetaSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable */
  }
}

export const metaRank = (m: MetaSave, id: MetaId): number => m.ranks[id] ?? 0;

/** Price of the next rank of `def` (null: maxed). */
export function metaPrice(m: MetaSave, def: MetaDef): number | null {
  const rank = metaRank(m, def.id);
  return rank >= def.ranks ? null : Math.round(def.cost * def.growth ** rank);
}

/** Buys the next rank if affordable; returns whether it did. */
export function buyMeta(id: MetaId): boolean {
  const m = loadMeta();
  const def = META.find((d) => d.id === id)!;
  const price = metaPrice(m, def);
  if (price === null || m.dust < price) return false;
  m.dust -= price;
  m.ranks[id] = metaRank(m, id) + 1;
  saveMeta(m);
  return true;
}

/** Applies every owned rank to a fresh run's stats. */
export function applyMeta(s: PlayerStats): void {
  const m = loadMeta();
  for (const def of META) {
    const rank = metaRank(m, def.id);
    if (rank > 0) def.apply(s, rank);
  }
}

/** What a stretch of play is worth in Dust. */
export interface DustSource {
  kills: number;
  levels: number;
  bosses: number;
  elites: number;
  won: boolean;
}

/** Dust for `r`; `mult` by difficulty (easy 0.7, hard 1, nightmare 1.5). */
export function dustFor(r: DustSource, mult = 1): number {
  const base = Math.floor(r.kills / 12) + 4 * r.levels + 12 * r.bosses + 5 * r.elites + (r.won ? 40 : 0);
  return Math.round(base * mult);
}

/** Banks `amount` Dust; returns the new balance. */
export function addDust(amount: number): number {
  const m = loadMeta();
  m.dust += amount;
  m.total += amount;
  saveMeta(m);
  return m.dust;
}
