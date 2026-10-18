import type { TraitId } from "./content.ts";
import type { Ending, RunState } from "./run.ts";

/** Progress kept on this device: meta experience and the run in progress. */
export interface Meta {
  xp: number;
  runs: number;
  bestDay: number;
  endings: Partial<Record<Ending, number>>;
  lastTrait: TraitId;
}

const META_KEY = "rozshuk-meta-v1";
const RUN_KEY = "rozshuk-run-v1";

export function freshMeta(): Meta {
  return { xp: 0, runs: 0, bestDay: 0, endings: {}, lastTrait: "it" };
}

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
  } catch { /* storage blocked: progress lives for this tab */ }
}

export function loadMeta(): Meta {
  return { ...freshMeta(), ...(read<Meta>(META_KEY) ?? {}) };
}
export function saveMeta(m: Meta): void { write(META_KEY, m); }

export function loadRun(): RunState | null {
  const r = read<RunState>(RUN_KEY);
  return r && r.v === 1 && r.phase !== "end" ? r : null;
}
export function saveRun(r: RunState | null): void { write(RUN_KEY, r); }

/** Bank a finished run into the meta progression. */
export function bankRun(m: Meta, r: RunState, xp: number): void {
  m.xp += xp;
  m.runs += 1;
  m.bestDay = Math.max(m.bestDay, r.day);
  if (r.ending) m.endings[r.ending] = (m.endings[r.ending] ?? 0) + 1;
  saveMeta(m);
  saveRun(null);
}
