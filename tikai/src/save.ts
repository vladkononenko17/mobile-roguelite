import type { RunState } from "./sim.ts";
import type { TraitId } from "./content.ts";

/** Progress on the device: the run between stages and what all runs added up to. */
export interface Meta {
  /** Hryvnias in the stash: spent on who you can start as. */
  bank: number;
  /** All hryvnias ever brought home. */
  earned: number;
  owned: TraitId[];
  /** Highest розшук ★ unlocked. */
  maxHeat: number;
  runs: number;
  /** Most stages finished in one run. */
  best: number;
  wins: number;
  lastTrait: TraitId;
  lastHeat: number;
}

const META_KEY = "tikai-meta-v1";
const RUN_KEY = "tikai-run-v1";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage blocked: play without saving */ }
}

export function loadMeta(): Meta {
  const m: Meta = { bank: 0, earned: 0, owned: ["it"], maxHeat: 0, runs: 0, best: 0, wins: 0, lastTrait: "it", lastHeat: 0, ...(read<Partial<Meta>>(META_KEY) ?? {}) };
  if (!m.owned.includes("it")) m.owned.push("it");
  return m;
}
export function saveMeta(m: Meta): void { write(META_KEY, m); }

export function loadRun(): RunState | null {
  const r = read<RunState>(RUN_KEY);
  if (!r || r.v !== 1 || r.ending) return null;
  return r;
}
export function saveRun(r: RunState | null): void { write(RUN_KEY, r); }

/** A run ended: bank its money, maybe unlock the next розшук ★. Returns what changed. */
export function bankRun(m: Meta, r: RunState): { heatUnlocked: boolean } {
  m.bank += r.coins;
  m.earned += r.coins;
  m.runs++;
  m.best = Math.max(m.best, r.history.length);
  let heatUnlocked = false;
  if (r.ending === "river") {
    m.wins++;
    if (r.heat >= m.maxHeat && m.maxHeat < 4) { m.maxHeat = r.heat + 1; heatUnlocked = true; }
  }
  saveMeta(m);
  return { heatUnlocked };
}
