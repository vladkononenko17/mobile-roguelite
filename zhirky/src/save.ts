import type { RunState } from "./sim.ts";
import { MAX_FROST, type HeroId, type RideId, type UpgradeId } from "./content.ts";

/** Progress on the device: the run between slopes, and what all runs added up to. */
export interface Meta {
  /** Candies in the Комора: spent on heroes, rides and upgrades. */
  bank: number;
  earned: number;
  heroes: HeroId[];
  rides: RideId[];
  upgrades: Partial<Record<UpgradeId, number>>;
  /** Highest Мороз ★ unlocked. */
  maxFrost: number;
  runs: number;
  wins: number;
  /** Most kids ever in one ватага. */
  bestCrew: number;
  lastHero: HeroId;
  lastRide: RideId;
  lastFrost: number;
}

const META_KEY = "zhirky-meta-v1";
const RUN_KEY = "zhirky-run-v1";

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
  const m: Meta = {
    bank: 0, earned: 0, heroes: ["solomiia"], rides: ["sled"], upgrades: {}, maxFrost: 0, runs: 0, wins: 0, bestCrew: 0,
    lastHero: "solomiia", lastRide: "sled", lastFrost: 0, ...(read<Partial<Meta>>(META_KEY) ?? {}),
  };
  if (!m.heroes.includes("solomiia")) m.heroes.push("solomiia");
  if (!m.rides.includes("sled")) m.rides.push("sled");
  return m;
}
export function saveMeta(m: Meta): void { write(META_KEY, m); }

export function level(m: Meta, id: UpgradeId): number { return m.upgrades[id] ?? 0; }

export function loadRun(): RunState | null {
  const r = read<RunState>(RUN_KEY);
  if (!r || r.v !== 1 || r.ending) return null;
  return r;
}
export function saveRun(r: RunState | null): void { write(RUN_KEY, r); }

/** A run ended: bank its candies, maybe unlock the next Мороз ★. */
export function bankRun(m: Meta, r: RunState): { frostUnlocked: boolean } {
  m.bank += r.coins;
  m.earned += r.coins;
  m.runs++;
  m.bestCrew = Math.max(m.bestCrew, r.bestCrew);
  let frostUnlocked = false;
  if (r.ending === "home") {
    m.wins++;
    if (r.frost >= m.maxFrost && m.maxFrost < MAX_FROST) { m.maxFrost = r.frost + 1; frostUnlocked = true; }
  }
  saveMeta(m);
  return { frostUnlocked };
}
