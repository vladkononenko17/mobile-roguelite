import type { RunState } from "./sim.ts";
import type { AdvisorId } from "./content.ts";

/** What all runs add up to on this device. */
export interface Meta {
  runs: number;
  wins: number;
  best: number;
  /** Highest Ескалація ★ unlocked. */
  maxDifficulty: number;
  lastAdvisor: AdvisorId;
  lastDifficulty: number;
  endings: string[];
}

const META_KEY = "stavka-meta-v1";
const RUN_KEY = "stavka-run-v1";

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
  return { runs: 0, wins: 0, best: 0, maxDifficulty: 0, lastAdvisor: "general", lastDifficulty: 0, endings: [], ...(read<Partial<Meta>>(META_KEY) ?? {}) };
}
export function saveMeta(m: Meta): void { write(META_KEY, m); }

export function loadRun(): RunState | null {
  const r = read<RunState>(RUN_KEY);
  return r && r.v === 1 && !r.ending ? r : null;
}
export function saveRun(r: RunState | null): void { write(RUN_KEY, r && !r.ending ? r : null); }

/** Advisors unlock by finished runs and wins. */
export function advisorUnlocked(m: Meta, unlock: number): boolean {
  return unlock === 0 || (unlock === 1 ? m.runs >= 1 : m.wins >= 1);
}
