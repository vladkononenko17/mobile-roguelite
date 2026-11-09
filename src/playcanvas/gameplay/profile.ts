import type { UpgradeIcon } from "../ui/UpgradeIcons";
import { DANGER_MAX } from "./danger";
import type { GadgetId } from "./gadgets";
import { HEROES, type HeroId } from "./heroes";
import { addDust } from "./meta";

/**
 * The player's long-term profile, kept in this browser: lifetime tallies, which heroes and gadgets
 * are unlocked, completed quests, the chosen hero, the danger level reached and chosen per chapter,
 * and daily-run bests. Quests (Vampire Survivors / Brotato style unlock goals) read the tallies and
 * pay heroes, gadgets or Dust.
 */
export type Tally =
  | "kills" | "bosses" | "champions" | "cash" | "bounties" | "evolutions" | "dashes" | "runs" | "dailies"
  /** Best values reached in one run. */
  | "maxMk" | "maxLevel" | "maxGadgets";

export interface Profile {
  hero: HeroId;
  unlocked: string[];
  quests: string[];
  tally: Record<Tally, number>;
  /** Chapters won (any difficulty above Easy) and the highest danger won per chapter. */
  wins: Record<string, number>;
  dangerWon: Record<string, number>;
  /** The danger chosen per chapter. */
  danger: Record<string, number>;
  /** Daily runs: best score per date (YYYY-MM-DD). */
  daily: Record<string, number>;
}

const KEY = "dustline.profile";
const ZERO: Record<Tally, number> = { kills: 0, bosses: 0, champions: 0, cash: 0, bounties: 0, evolutions: 0, dashes: 0, runs: 0, dailies: 0, maxMk: 0, maxLevel: 0, maxGadgets: 0 };

let cached: Profile | null = null;

function fresh(): Profile {
  return { hero: "survivor", unlocked: [], quests: [], tally: { ...ZERO }, wins: {}, dangerWon: {}, danger: {}, daily: {} };
}

export function profile(): Profile {
  if (cached) return cached;
  let p = fresh();
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "null") as Partial<Profile> | null;
    if (raw && typeof raw === "object") p = { ...p, ...raw, tally: { ...ZERO, ...(raw.tally ?? {}) } };
  } catch {
    /* storage unavailable or corrupt */
  }
  cached = p;
  return p;
}

export function saveProfile(): void {
  if (!cached) return;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(cached));
  } catch {
    /* storage unavailable */
  }
}

/** Test hook: forget the cached profile (and optionally start from `p`). */
export function resetProfile(p: Profile | null = null): void {
  cached = p ?? fresh();
}

export function bump(t: Tally, n = 1): void {
  profile().tally[t] += n;
}

/** Records a per-run best. */
export function best(t: Tally, value: number): void {
  const p = profile();
  if (value > p.tally[t]) p.tally[t] = value;
}

export const isUnlocked = (id: string): boolean => id === "survivor" || profile().unlocked.includes(id);
export const heroUnlocked = (id: HeroId): boolean => isUnlocked(id);
export const gadgetUnlocked = (id: GadgetId, locked = false): boolean => !locked || isUnlocked(id);

export function chooseHero(id: HeroId): void {
  if (!heroUnlocked(id)) return;
  profile().hero = id;
  saveProfile();
}

export function currentHero(): HeroId {
  const h = profile().hero;
  return HEROES.some((d) => d.id === h) && heroUnlocked(h) ? h : "survivor";
}

/** Highest danger the player may pick for `chapter` (one above the highest won). */
export function dangerUnlocked(chapter: string): number {
  return Math.min(DANGER_MAX, (profile().dangerWon[chapter] ?? -1) + 1);
}

export function chosenDanger(chapter: string): number {
  return Math.max(0, Math.min(dangerUnlocked(chapter), profile().danger[chapter] ?? 0));
}

export function chooseDanger(chapter: string, level: number): void {
  profile().danger[chapter] = Math.max(0, Math.min(dangerUnlocked(chapter), level));
  saveProfile();
}

/** A won chapter: counts the win and unlocks the next danger. */
export function recordWin(chapter: string, danger: number): void {
  const p = profile();
  p.wins[chapter] = (p.wins[chapter] ?? 0) + 1;
  p.dangerWon[chapter] = Math.max(p.dangerWon[chapter] ?? -1, danger);
}

// ---- Quests.

export type QuestReward = { hero: HeroId } | { gadget: GadgetId } | { dust: number };

export interface QuestDef {
  id: string;
  name: string;
  /** The goal ("Kill 1,000 enemies"). */
  text: string;
  icon: UpgradeIcon;
  /** [progress, goal] from the profile. */
  progress: (p: Profile) => [number, number];
  reward: QuestReward;
}

const tally = (t: Tally, goal: number) => (p: Profile): [number, number] => [p.tally[t], goal];
const won = (chapter: string) => (p: Profile): [number, number] => [Math.min(1, p.wins[chapter] ?? 0), 1];
const maxDanger = (goal: number) => (p: Profile): [number, number] => [Math.max(0, ...Object.values(p.dangerWon)), goal];

export const QUESTS: QuestDef[] = [
  { id: "kills100", name: "First Blood", text: "Kill 100 enemies", icon: "bullet", progress: tally("kills", 100), reward: { dust: 20 } },
  { id: "kills1000", name: "Horde Breaker", text: "Kill 1,000 enemies", icon: "burst", progress: tally("kills", 1000), reward: { hero: "demolitionist" } },
  { id: "kills5000", name: "Exterminator", text: "Kill 5,000 enemies", icon: "bullets", progress: tally("kills", 5000), reward: { dust: 150 } },
  { id: "winOutpost", name: "Outpost Holds", text: "Win Chapter I (Normal or harder)", icon: "star", progress: won("outpost"), reward: { hero: "medic" } },
  { id: "winFacility", name: "Gate Closed", text: "Win Chapter II", icon: "star", progress: won("facility"), reward: { dust: 100 } },
  { id: "winMedieval", name: "Kingslayer", text: "Win Chapter III", icon: "star", progress: won("medieval"), reward: { dust: 120 } },
  { id: "winHell", name: "Back from Hell", text: "Win Chapter IV", icon: "star", progress: won("hell"), reward: { dust: 150 } },
  { id: "winPirate", name: "Tide Turned", text: "Win Chapter V", icon: "star", progress: won("pirate"), reward: { dust: 150 } },
  { id: "mk5", name: "Gunsmith's Pride", text: "Bring a gun to Mk V", icon: "bullet", progress: tally("maxMk", 4), reward: { dust: 60 } },
  { id: "bosses3", name: "Giant Killer", text: "Defeat 3 bosses", icon: "shield", progress: tally("bosses", 3), reward: { dust: 60 } },
  { id: "cash2500", name: "Deep Pockets", text: "Earn 2,500$ in total", icon: "magnet", progress: tally("cash", 2500), reward: { dust: 60 } },
  { id: "gadgets2", name: "Gearhead", text: "Own 2 gadgets in one run", icon: "drone", progress: tally("maxGadgets", 2), reward: { dust: 50 } },
  { id: "champions25", name: "Champion Hunter", text: "Slay 25 champions", icon: "chest", progress: tally("champions", 25), reward: { gadget: "saws" } },
  { id: "evolve1", name: "Evolution", text: "Evolve a gun at the Gunsmith", icon: "star", progress: tally("evolutions", 1), reward: { gadget: "molotov" } },
  { id: "bounties25", name: "Contractor", text: "Complete 25 bounties", icon: "target", progress: tally("bounties", 25), reward: { dust: 80 } },
  { id: "dashes300", name: "Light Feet", text: "Dash 300 times", icon: "boot", progress: tally("dashes", 300), reward: { dust: 40 } },
  { id: "level20", name: "Veteran", text: "Reach level 20 in one run", icon: "heart", progress: tally("maxLevel", 20), reward: { dust: 50 } },
  { id: "danger3", name: "Living Dangerously", text: "Win any chapter at Danger 3", icon: "flame", progress: maxDanger(3), reward: { dust: 100 } },
  { id: "danger6", name: "Hardened", text: "Win any chapter at Danger 6", icon: "flame", progress: maxDanger(6), reward: { dust: 200 } },
  { id: "dailies3", name: "Daily Grind", text: "Finish 3 daily runs", icon: "reload", progress: tally("dailies", 3), reward: { dust: 60 } },
];

export function rewardText(r: QuestReward): string {
  if ("hero" in r) return `Unlocks ${HEROES.find((h) => h.id === r.hero)?.name ?? r.hero}`;
  if ("gadget" in r) return `Unlocks gadget: ${r.gadget === "saws" ? "Saw Blades" : r.gadget === "molotov" ? "Molotov" : r.gadget}`;
  return `+${r.dust} ◆ Dust`;
}

/** Completes every quest whose goal is met (pays its reward, saves); returns the newly completed. */
export function checkQuests(): QuestDef[] {
  const p = profile();
  const done: QuestDef[] = [];
  for (const q of QUESTS) {
    if (p.quests.includes(q.id)) continue;
    const [have, goal] = q.progress(p);
    if (have < goal) continue;
    p.quests.push(q.id);
    const r = q.reward;
    if ("hero" in r && !p.unlocked.includes(r.hero)) p.unlocked.push(r.hero);
    else if ("gadget" in r && !p.unlocked.includes(r.gadget)) p.unlocked.push(r.gadget);
    else if ("dust" in r) addDust(r.dust);
    done.push(q);
  }
  saveProfile();
  return done;
}
