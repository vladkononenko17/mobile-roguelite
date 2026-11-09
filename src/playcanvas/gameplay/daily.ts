import { HEROES, type HeroId } from "./heroes";

/**
 * The daily run (Balatro / Slay the Spire / Isaac dailies): one seeded run per calendar day, the same
 * for everyone: its chapter, hero and danger come from the date, and the game's random numbers are
 * seeded from it too, so shops, upgrades and drops start out alike. Scored, with a best per day and a
 * share card.
 */
export const DAILY_CHAPTERS = ["outpost", "facility", "medieval", "hell", "pirate"] as const;
const SESSION_KEY = "dustline.daily";

/** Today's date in the player's time zone, YYYY-MM-DD. */
export function todayKey(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** A 32-bit hash of a string (FNV-1a). */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A small seeded random generator (mulberry32): 0..1. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DailySetup {
  key: string;
  chapter: (typeof DAILY_CHAPTERS)[number];
  hero: HeroId;
  danger: number;
  seed: number;
}

/** The run for date `key`. */
export function dailySetup(key = todayKey()): DailySetup {
  const seed = hash(`dustline-daily-${key}`);
  const r = seeded(seed);
  return {
    key,
    chapter: DAILY_CHAPTERS[Math.floor(r() * DAILY_CHAPTERS.length)],
    hero: HEROES[Math.floor(r() * HEROES.length)].id,
    danger: 1 + Math.floor(r() * 4),
    seed,
  };
}

/** Score: levels cleared, kills, bosses, a win bonus, minus a little for time taken. */
export function dailyScore(r: { levels: number; kills: number; bosses: number; won: boolean; seconds: number }): number {
  return Math.max(0, Math.round(r.levels * 1000 + r.kills * 2 + r.bosses * 600 + (r.won ? 4000 : 0) - r.seconds * 0.5));
}

/** The title screen starts today's daily: remembered for this tab until the run loads. */
export function markDaily(key: string): void {
  try { sessionStorage.setItem(SESSION_KEY, key); } catch { /* storage unavailable */ }
}

/** Today's daily, if the title screen asked for it (cleared after reading a stale one). */
export function pendingDaily(): DailySetup | null {
  try {
    const key = sessionStorage.getItem(SESSION_KEY);
    if (!key) return null;
    if (key !== todayKey()) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return dailySetup(key);
  } catch {
    return null;
  }
}

export function clearDaily(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
}
