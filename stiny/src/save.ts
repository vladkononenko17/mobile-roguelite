import type { RunState } from "./sim.ts";
import type { TraitId } from "./content.ts";

/** Progress on the device: the run in progress and what all runs added up to. */
export interface Meta {
  /** Seasons lived through, across all runs: unlocks who you can start as. */
  seasons: number;
  runs: number;
  best: number;
  survived: number;
  lastTrait: TraitId;
}

const META_KEY = "stiny-meta-v1";
const RUN_KEY = "stiny-run-v1";

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
  return { seasons: 0, runs: 0, best: 0, survived: 0, lastTrait: "it", ...(read<Partial<Meta>>(META_KEY) ?? {}) };
}
export function saveMeta(m: Meta): void { write(META_KEY, m); }

export function loadRun(): RunState | null {
  const r = read<RunState>(RUN_KEY);
  if (!r || r.v !== 1 || r.ending || !r.day) return null;
  r.day.busy = null;
  return r;
}
export function saveRun(r: RunState | null): void { write(RUN_KEY, r); }

export function bankRun(m: Meta, r: RunState): void {
  m.seasons += r.history.length;
  m.runs++;
  m.best = Math.max(m.best, r.history.length);
  if (r.ending === "survived") m.survived++;
  saveMeta(m);
}
