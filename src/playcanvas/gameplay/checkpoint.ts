import type { PlayerStats } from "./PlayerStats";

/**
 * Act checkpoints: the hero's whole run state at the start of an act (or the final level), so a death
 * can continue from there with the build he had then. A deep copy of PlayerStats' own fields (numbers,
 * the weapon, and its Maps / Sets, including the per-weapon module sets).
 */
export type StatsSnapshot = Record<string, unknown>;

const copy = (v: unknown): unknown => {
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, copy(x)]));
  if (v instanceof Set) return new Set(v);
  return v;
};

export function snapshotStats(s: PlayerStats): StatsSnapshot {
  const out: StatsSnapshot = {};
  for (const [k, v] of Object.entries(s)) out[k] = copy(v);
  return out;
}

/** Writes `snap` back into `s` in place (the systems keep their reference to the same object). */
export function restoreStats(s: PlayerStats, snap: StatsSnapshot): void {
  const target = s as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(snap)) {
    const cur = target[k];
    if (cur instanceof Map && v instanceof Map) {
      cur.clear();
      for (const [key, x] of v) cur.set(key, copy(x));
    } else if (cur instanceof Set && v instanceof Set) {
      cur.clear();
      for (const x of v) cur.add(x);
    } else target[k] = copy(v);
  }
}
