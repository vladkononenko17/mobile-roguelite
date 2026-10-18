/**
 * The run (забіг): thirty days in fifteen levels. Survival stats, home
 * actions, random events, perks, the fork and the endings. Pure state
 * transitions — the UI calls these and the tests drive whole runs with them.
 */

import {
  ACTIONS, EVENTS, LEVELS, PERKS, TRAITS, levelById, nextLevelId,
  type ActionId, type HomeEvent, type LevelDef, type Path, type PerkId, type TraitId,
} from "./content.ts";
import { mulberry32, type OutingContext, type OutingResult } from "./outing.ts";

export type RunPhase = "home" | "perk" | "fork" | "end";
export type Ending = "border" | "legal" | "caught";

export interface RunStats {
  spotted: number;
  escapes: number;
  worked: number;
  earned: number;
  perfect: number;
  levels: number;
}

export interface RunState {
  v: 1;
  seed: number;
  rngState: number;
  trait: TraitId;
  levelId: string;
  path: Path;
  day: number;
  money: number;
  food: number;
  satiety: number;
  nerves: number;
  heat: number;
  perks: PerkId[];
  items: string[];
  flags: Record<string, boolean>;
  ap: number;
  apMax: number;
  intel: boolean;
  pumped: boolean;
  doorWatch: boolean;
  prices: number;
  blackout: boolean;
  /** Pending random event shown when the level opens. */
  event: string | null;
  /** Pending knock at the door (hold-your-breath QTE). */
  knock: boolean;
  /** A breakdown happened this morning. */
  breakdown: boolean;
  phase: RunPhase;
  perkOffer: PerkId[];
  ending: Ending | null;
  /** Owed to Arkadiy, added to the next payment. */
  debt: number;
  stats: RunStats;
  seenEvents: string[];
}

export const START_MONEY: Record<TraitId, number> = { it: 15000, athlete: 11000, quietguy: 9000, mamas: 10000, nephew: 70000 };
export const DAYS = 30;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Deterministic per-run randomness that survives save/load. */
function roll(s: RunState): number {
  const r = mulberry32(s.rngState)();
  s.rngState = (s.rngState + 0x9e3779b9) >>> 0;
  return r;
}

export function level(s: RunState): LevelDef {
  return levelById(s.levelId) ?? LEVELS[0];
}

export const has = (s: RunState, p: PerkId): boolean => s.perks.includes(p);

export function newRun(trait: TraitId = "it", seed = Math.floor(Math.random() * 1e9)): RunState {
  const s: RunState = {
    v: 1, seed, rngState: seed >>> 0, trait, levelId: "1", path: "common", day: 1,
    money: START_MONEY[trait], food: trait === "mamas" ? 7 : 3, satiety: 70, nerves: 20,
    heat: trait === "nephew" ? 50 : 25, perks: [], items: [], flags: {},
    ap: 3, apMax: 3, intel: false, pumped: false, doorWatch: false, prices: 1, blackout: false,
    event: null, knock: false, breakdown: false, phase: "home", perkOffer: [], ending: null, debt: 0,
    stats: { spotted: 0, escapes: 0, worked: 0, earned: 0, perfect: 0, levels: 0 }, seenEvents: [],
  };
  beginLevel(s, true);
  return s;
}

/** Positive nerve changes are softened by «Холодна голова». */
export function addNerves(s: RunState, v: number): void {
  if (v > 0 && has(s, "calm")) v *= 0.6;
  s.nerves = clamp(s.nerves + v, 0, 100);
}

export function applyEffect(s: RunState, e: { money?: number; nerves?: number; heat?: number; food?: number; flag?: string } | undefined): void {
  if (!e) return;
  if (e.money) s.money = Math.max(0, s.money + e.money);
  if (e.nerves) addNerves(s, e.nerves);
  if (e.heat) s.heat = clamp(s.heat + e.heat, 0, 100);
  if (e.food) s.food = Math.max(0, s.food + e.food);
  if (e.flag === "blackout") s.blackout = true;
  else if (e.flag === "intel") s.intel = true;
  else if (e.flag === "prices") s.prices = 1.3;
  else if (e.flag) s.flags[e.flag] = true;
}

/** Morning of a new level: hunger, nerves, events, knocks. */
export function beginLevel(s: RunState, first = false): void {
  const lv = level(s);
  s.day = lv.n * 2 - 1;
  s.phase = "home";
  s.intel = false;
  s.pumped = false;
  s.prices = 1;
  s.blackout = false;
  s.event = null;
  s.knock = false;
  s.breakdown = false;
  if (!first) {
    let hunger = 34;
    if (has(s, "noodles")) hunger *= 0.75;
    if (s.trait === "athlete") hunger *= 1.2;
    s.satiety -= hunger;
    if (s.satiety <= 0) { s.satiety = 0; addNerves(s, 15); }
    addNerves(s, 8);
    if (s.trait === "mamas" && lv.n % 2 === 0) s.food += 1;
  }
  if (lv.n === 3) s.flags.laptopDead = true;

  // random event from level 2 on
  if (lv.n >= 2 && roll(s) < 0.7) {
    const pool = EVENTS.filter((e) => e.from <= lv.n && (e.id === "blackout" || !s.seenEvents.includes(e.id)));
    if (lv.n === 4) {
      // the blackout level always starts dark
      s.event = "blackout";
    } else if (pool.length) {
      const e = pool[Math.floor(roll(s) * pool.length)];
      s.event = e.id;
    }
  } else if (lv.n === 4) s.event = "blackout";
  if (s.event) {
    s.seenEvents.push(s.event);
    const e = eventById(s.event);
    if (e && !e.choices) applyEffect(s, e.effect);
  }
  // knock at the door when they are hot on your trail
  if (lv.n >= 2 && s.heat >= 45 && roll(s) < (s.heat - 35) / 110) s.knock = true;

  s.apMax = 3 + (has(s, "coffee") ? 1 : 0) + (s.blackout && has(s, "station") ? 1 : 0);
  s.ap = s.apMax;
  if (s.nerves >= 100) {
    s.breakdown = true;
    s.ap = Math.max(1, s.ap - 1);
    s.nerves = 70;
    s.heat = clamp(s.heat + 6, 0, 100);
  }
}

export const eventById = (id: string): HomeEvent | undefined => EVENTS.find((e) => e.id === id);

export function resolveEventChoice(s: RunState, index: number): void {
  const e = s.event ? eventById(s.event) : undefined;
  if (!e?.choices) return;
  applyEffect(s, e.choices[index]?.effect);
}

export function resolveKnock(s: RunState, ok: boolean): void {
  s.knock = false;
  if (ok) addNerves(s, 10);
  else {
    s.doorWatch = true;
    addNerves(s, 20);
    s.heat = clamp(s.heat + 8, 0, 100);
  }
}

// ------------------------------------------------------------- home actions

export function canWork(s: RunState): { ok: boolean; why?: string } {
  if (s.flags.laptopDead && !s.flags.laptop) return { ok: false, why: "Ноутбук мертвий — спершу забери зарядку" };
  if (s.blackout && !s.items.includes("powerbank") && !has(s, "station")) return { ok: false, why: "Немає світла" };
  return { ok: true };
}

export function workIncome(s: RunState, quality: number): number {
  const lv = level(s);
  let base = 2000 + lv.n * 190;
  if (s.flags.job) base *= 2.6;
  if (s.trait === "it") base *= 1.25;
  if (has(s, "laptop")) base *= 1.3;
  if (s.blackout && !has(s, "station")) base *= 0.7;
  return Math.round((base * (0.3 + 0.7 * clamp(quality, 0, 1))) / 50) * 50;
}

export interface ActionResult { ok: boolean; text: string }

export function availableActions(s: RunState): ActionId[] {
  return ACTIONS.map((a) => a.id).filter((id) => id !== "cat" || s.flags.cat);
}

/** Do a home action. `quality` is the work minigame score 0..1. */
export function doAction(s: RunState, id: ActionId, quality = 1): ActionResult {
  if (s.phase !== "home") return { ok: false, text: "Не зараз" };
  if (s.ap <= 0) return { ok: false, text: "Сил на сьогодні більше немає. Пора на вилазку" };
  switch (id) {
    case "work": {
      const w = canWork(s);
      if (!w.ok) return { ok: false, text: w.why! };
      const pay = workIncome(s, quality);
      s.money += pay;
      s.stats.worked++;
      s.stats.earned += pay;
      addNerves(s, 5);
      s.ap--;
      return { ok: true, text: `+${fmt(pay)} ₴` };
    }
    case "eat":
      if (s.food <= 0) return { ok: false, text: "Запасів немає. Треба в магазин" };
      s.food--;
      s.satiety = clamp(s.satiety + 45, 0, 100);
      s.ap--;
      return { ok: true, text: "Ситість +45" };
    case "sleep":
      addNerves(s, -25);
      s.ap--;
      return { ok: true, text: "Нерви −25" };
    case "scroll":
      s.intel = true;
      addNerves(s, 6);
      s.ap--;
      return { ok: true, text: "Маршрути патрулів відомі" };
    case "mama": {
      addNerves(s, -15);
      s.ap--;
      const r = roll(s);
      if (s.trait === "mamas" || r < 0.25) {
        if (roll(s) < 0.5) { s.food += 1; return { ok: true, text: "Нерви −15 · мама передала вареники (+1 запас)" }; }
        s.money += 1000;
        return { ok: true, text: "Нерви −15 · мама скинула 1 000 ₴" };
      }
      return { ok: true, text: "Нерви −15 · «Шапку вдягай!»" };
    }
    case "pushups":
      s.pumped = true;
      s.satiety = clamp(s.satiety - 8, 0, 100);
      s.ap--;
      return { ok: true, text: "Витривалість +30% на вилазку" };
    case "cat":
      if (!s.flags.cat) return { ok: false, text: "Кота немає" };
      addNerves(s, -20);
      s.ap--;
      return { ok: true, text: "Мур. Нерви −20" };
  }
  return { ok: false, text: "?" };
}

// ------------------------------------------------------------- outing

export function outingContext(s: RunState, seed = Math.floor(roll(s) * 1e9)): OutingContext {
  const lv = level(s);
  let heat = s.heat;
  if (s.path === "border" && lv.n >= 13 && !s.flags.guide) heat += 25;
  return {
    level: lv, seed, heat, perks: [...s.perks], items: [...s.items], flags: { ...s.flags }, trait: s.trait,
    intel: s.intel, money: s.money, nerves: s.nerves, satiety: s.satiety, pumped: s.pumped,
    doorWatch: s.doorWatch, prices: s.prices, debt: s.debt ?? 0,
    owed: Object.keys(s.flags).filter((k) => k.startsWith("unpaid_") && s.flags[k]).map((k) => k.slice(7)),
  };
}

export function endOuting(s: RunState, r: OutingResult): void {
  const lv = level(s);
  s.stats.spotted += r.spotted;
  s.stats.escapes += r.escapes;
  s.doorWatch = false;
  if (r.lawyerUsed) s.perks = s.perks.filter((p) => p !== "lawyer");
  if (r.caught) {
    s.phase = "end";
    s.ending = "caught";
    return;
  }
  s.money = Math.max(0, s.money + r.money);
  s.food = Math.max(0, s.food + r.food);
  addNerves(s, r.nerves + (r.spotted ? Math.min(16, 2 * r.spotted) : -6));
  // the search only grows: +1 a level, a clean outing cools it down
  // the trail cools between outings; one disastrous outing cannot max it out
  s.heat = clamp(s.heat + Math.min(r.heat, 12) + (r.perfect ? -9 : -4), 0, 100);
  s.debt = r.debt ?? 0;
  for (const it of r.items) if (!s.items.includes(it)) s.items.push(it);
  for (const f of r.flags) s.flags[f] = true;
  for (const u of r.unpaid) s.flags[`unpaid_${u}`] = true;
  for (const p of r.settled ?? []) delete s.flags[`unpaid_${p}`];
  if (s.flags.laptop) s.flags.laptopDead = false;
  if (r.perfect) s.stats.perfect++;
  s.stats.levels++;
  s.day = lv.n * 2;

  if (lv.n >= 15) {
    s.phase = "end";
    s.ending = s.path === "legal" ? "legal" : "border";
    return;
  }
  if (lv.n === 7) { s.phase = "fork"; return; }
  // a perk every other level (and at the fork): eight over a run, not fourteen
  if (lv.n % 2 === 0) offerPerks(s);
  else advance(s);
}

export function choosePath(s: RunState, path: "border" | "legal"): void {
  if (s.phase !== "fork") return;
  s.path = path;
  if (s.flags.haggle && path === "legal") s.money += 5000;
  offerPerks(s);
}

function offerPerks(s: RunState): void {
  const pool = PERKS.filter((p) => !s.perks.includes(p.id));
  const offer: PerkId[] = [];
  while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(roll(s) * pool.length), 1)[0].id);
  s.perkOffer = offer;
  s.phase = "perk";
}

export function choosePerk(s: RunState, id: PerkId | null): void {
  if (s.phase !== "perk") return;
  if (id && s.perkOffer.includes(id)) {
    s.perks.push(id);
    if (id === "stash") s.money += 12000;
    if (id === "noodles") s.food += 8;
  }
  s.perkOffer = [];
  advance(s);
}

function advance(s: RunState): void {
  const next = nextLevelId(s.levelId, s.path);
  if (!next) { s.phase = "end"; s.ending = s.path === "legal" ? "legal" : "border"; return; }
  s.levelId = next;
  beginLevel(s);
}

/** Experience for the meta progression: days survived, plus a bonus for endings. */
export function runXp(s: RunState): number {
  const days = s.ending === "caught" ? s.day : DAYS;
  return days + (s.ending && s.ending !== "caught" ? 25 : 0) + s.stats.perfect * 2;
}

export function unlockedTraits(xp: number): TraitId[] {
  return TRAITS.filter((t) => xp >= t.xp).map((t) => t.id);
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString("uk-UA").replace(/ /g, " ");
}
