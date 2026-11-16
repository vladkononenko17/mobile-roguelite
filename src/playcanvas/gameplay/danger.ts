/**
 * Danger levels (Brotato's Danger, Hades' Heat, Slay the Spire's Ascension): after a chapter is won
 * at Danger N, Danger N+1 unlocks for it. Each level adds one rule on top of all the lower ones, and
 * pays more Dust.
 */
export const DANGER_MAX = 10;

export const DANGER_RULES: string[] = [
  "Enemies +10% HP",
  "Champions come sooner",
  "Shop prices +15%",
  "Enemies hit 10% harder",
  "Healing -30%",
  "More enemies on screen",
  "Champions +50% HP",
  "Bosses +25% HP",
  "Less interest, smaller bounties",
  "Enemies move 12% faster",
];

/** Everything a danger level changes (1 = unchanged). */
export interface DangerMods {
  enemyHp: number;
  enemyDamage: number;
  density: number;
  speed: number;
  eliteEvery: number;
  eliteHp: number;
  bossHp: number;
  shopPrice: number;
  heal: number;
  interest: number;
  bounty: number;
  /** Dust multiplier. */
  dust: number;
}

export function dangerMods(level: number): DangerMods {
  const n = Math.max(0, Math.min(DANGER_MAX, Math.round(level)));
  return {
    enemyHp: n >= 1 ? 1.1 : 1,
    eliteEvery: n >= 2 ? 0.75 : 1,
    shopPrice: n >= 3 ? 1.15 : 1,
    enemyDamage: n >= 4 ? 1.1 : 1,
    heal: n >= 5 ? 0.7 : 1,
    density: n >= 6 ? 1.15 : 1,
    eliteHp: n >= 7 ? 1.5 : 1,
    bossHp: n >= 8 ? 1.25 : 1,
    interest: n >= 9 ? 0.5 : 1,
    bounty: n >= 9 ? 0.7 : 1,
    speed: n >= 10 ? 1.12 : 1,
    dust: 1 + 0.15 * n,
  };
}

/** "D3: Enemies +10% HP · Champions come sooner · Shop prices +15%". */
export function dangerSummary(level: number): string {
  return level <= 0 ? "Danger 0: the chapter as designed" : `Danger ${level}: ${DANGER_RULES.slice(0, level).join(" · ")}`;
}
