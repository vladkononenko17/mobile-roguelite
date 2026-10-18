import { GEAR, LEVELS, STARTER_GEAR, gearById, type GearSlot, type Method } from "./content";
import type { LevelResult } from "./sim";

/** Player progress, kept in localStorage on this device. */
export interface Progress {
  unlocked: number;
  money: number;
  owned: string[];
  equipped: { rod: string; reel: string; bait: string };
  stars: Record<number, number>;
  best: Record<number, number>;
}

const KEY = "ne-klyuet-progress-v1";

export function freshProgress(): Progress {
  return {
    unlocked: 1,
    money: 0,
    owned: [STARTER_GEAR.rod, STARTER_GEAR.reel, STARTER_GEAR.bait],
    equipped: { ...STARTER_GEAR },
    stars: {},
    best: {},
  };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshProgress();
    const p = { ...freshProgress(), ...JSON.parse(raw) } as Progress;
    p.owned = Array.from(new Set([...freshProgress().owned, ...p.owned])).filter((id) => gearById(id));
    return p;
  } catch {
    return freshProgress();
  }
}

export function saveProgress(p: Progress): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked: progress lives for this tab */ }
}

/** Apply a finished level to progress; returns what changed for the UI. */
export function applyResult(p: Progress, r: LevelResult): { unlockedNew: number | null; newGear: string[] } {
  p.money += r.money;
  p.stars[r.level] = Math.max(p.stars[r.level] ?? 0, r.stars);
  p.best[r.level] = Math.max(p.best[r.level] ?? 0, r.myKg);
  let unlockedNew: number | null = null;
  if (r.pass && r.level >= p.unlocked && r.level < LEVELS.length) {
    p.unlocked = r.level + 1;
    unlockedNew = p.unlocked;
  }
  const newGear = unlockedNew ? GEAR.filter((g) => g.unlock === unlockedNew).map((g) => g.id) : [];
  // Free unlocks (like the ice rod) are simply handed over.
  for (const id of newGear) if (gearById(id)?.price === 0 && !p.owned.includes(id)) p.owned.push(id);
  saveProgress(p);
  return { unlockedNew, newGear };
}

export function buy(p: Progress, id: string): boolean {
  const g = gearById(id);
  if (!g || p.owned.includes(id) || g.unlock > p.unlocked || p.money < g.price) return false;
  p.money -= g.price;
  p.owned.push(id);
  equip(p, id);
  return true;
}

export function equip(p: Progress, id: string): void {
  const g = gearById(id);
  if (!g || !p.owned.includes(id)) return;
  p.equipped[g.slot as GearSlot] = id;
  saveProgress(p);
}

export function equippedMethod(p: Progress): Method {
  return gearById(p.equipped.rod)?.method ?? "float";
}
