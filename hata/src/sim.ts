/**
 * «Хата з краю» — rules: money, tools and upgrades, the working day, handing
 * a house over, stars, perks and the run. Pure TypeScript; the 3D world only
 * reports progress to it (`Ledger`) and reads stats from it (`toolStats`).
 */
import {
  DAY, DONE_AT, PAY, PERK_IDS, STARS, TOOLS, TOOL_ORDER, CLIENTS,
  type PerkId, type ToolId, type ToolLevel,
} from "./content.ts";

export const SAVE_VERSION = 1;

export interface Save {
  v: number;
  money: number;
  /** Owned level per tool, 1-based; 0 = not owned. */
  tools: Record<ToolId, number>;
  /** The current run (a streak of houses). */
  run: RunState;
  /** Best run: houses handed over and stars. */
  best: { houses: number; stars: number };
  totalEarned: number;
  settings: { quality: "low" | "medium" | "high"; sound: boolean; sensitivity: number };
}

export interface RunState {
  /** Houses handed over in this run. */
  houses: number;
  stars: number;
  perks: PerkId[];
  /** Seed of the house being cleaned. */
  seed: number;
  /** Working day on this house, 1-based. */
  day: number;
  /** Seconds into the current day. */
  time: number;
  /** Money earned on this house so far (shown at hand-over). */
  earnedHere: number;
  /** Perk choice waiting after a hand-over. */
  offer: PerkId[] | null;
  /** Serialized progress of the house in work (surface → share clean, etc.). */
  progress: Record<string, number>;
}

export function newRun(seed: number, perks: PerkId[] = []): RunState {
  return { houses: 0, stars: 0, perks, seed, day: 1, time: 0, earnedHere: 0, offer: null, progress: {} };
}

export function newSave(seed = 1): Save {
  const tools = Object.fromEntries(TOOL_ORDER.map((id) => [id, TOOLS[id].levels[0].price === 0 ? 1 : 0])) as Record<ToolId, number>;
  return {
    v: SAVE_VERSION,
    money: 300,
    tools,
    run: newRun(seed),
    best: { houses: 0, stars: 0 },
    totalEarned: 0,
    settings: { quality: "medium", sound: true, sensitivity: 1 },
  };
}

/** Loads a save object, filling anything missing from a fresh one. */
export function migrate(raw: unknown): Save {
  const fresh = newSave(Math.floor(Math.random() * 1e9));
  if (!raw || typeof raw !== "object") return fresh;
  const s = raw as Partial<Save>;
  if (s.v !== SAVE_VERSION) return fresh;
  return {
    ...fresh,
    ...s,
    tools: { ...fresh.tools, ...(s.tools ?? {}) },
    run: { ...fresh.run, ...(s.run ?? {}) },
    best: { ...fresh.best, ...(s.best ?? {}) },
    settings: { ...fresh.settings, ...(s.settings ?? {}) },
  } as Save;
}

export const has = (s: Save, p: PerkId): number => s.run.perks.filter((x) => x === p).length;

export interface ToolStats extends ToolLevel {
  level: number;
}

/** Stats of the owned level of a tool, with run perks applied. */
export function toolStats(s: Save, id: ToolId): ToolStats | null {
  const lv = s.tools[id];
  if (!lv) return null;
  const base = TOOLS[id].levels[lv - 1];
  const speed = 1 + 0.15 * has(s, "coffee");
  const wide = id === "washer" || id === "mop" || id === "paint" || id === "squeegee" ? 1 + 0.12 * has(s, "calluses") : 1;
  const range = id === "detector" ? base.range * (1 + has(s, "dowser")) : base.range;
  return { ...base, level: lv, rate: base.rate * speed, radius: base.radius * wide, range };
}

/** Price of the next level of a tool, or null when maxed. */
export function nextPrice(s: Save, id: ToolId): number | null {
  const lv = s.tools[id];
  const next = TOOLS[id].levels[lv];
  if (!next) return null;
  return Math.round(next.price * (1 - 0.15 * Math.min(2, has(s, "discount"))));
}

export function buy(s: Save, id: ToolId): boolean {
  const p = nextPrice(s, id);
  if (p === null || s.money < p) return false;
  s.money -= p;
  s.tools[id] += 1;
  return true;
}

/** Multiplier on everything a client pays. */
export const payMul = (s: Save): number => 1 + 0.1 * has(s, "radio");

export const doneAt = (s: Save): number => (has(s, "foreman") ? 0.95 : DONE_AT);

export function earn(s: Save, amount: number): number {
  const a = Math.round(amount * payMul(s) * 100) / 100;
  s.money += a;
  s.totalEarned += a;
  s.run.earnedHere += a;
  return a;
}

/**
 * Pays as progress grows: every whole percent of a surface pays 1% of its
 * value, so washing a wall drips money continuously. `paid` remembers how
 * many percent were paid already.
 */
export class Ledger {
  private paid = new Map<string, number>();
  private save: Save;
  private onPay: (amount: number, key: string, done: boolean) => void;

  constructor(save: Save, onPay: (amount: number, key: string, done: boolean) => void) {
    this.save = save;
    this.onPay = onPay;
  }

  /** Restore how much was paid for a surface (from a saved run). */
  restore(key: string, share: number): void {
    this.paid.set(key, Math.floor(share * 100));
  }

  report(key: string, value: number, share: number): void {
    const done = share >= doneAt(this.save);
    const pct = done ? 100 : Math.floor(share * 100);
    const before = this.paid.get(key) ?? 0;
    if (pct <= before) return;
    this.paid.set(key, pct);
    let amount = (value * (pct - before)) / 100;
    if (done) amount += value * PAY.finishBonus;
    const got = earn(this.save, amount);
    this.save.run.progress[key] = done ? 1 : share;
    this.onPay(got, key, done);
  }

  /** One-off payments: a leaf, a dish, a found ring. */
  bonus(key: string, amount: number): void {
    const got = earn(this.save, amount);
    this.onPay(got, key, false);
  }
}

export function starsFor(completion: number): number {
  let n = 0;
  for (const t of STARS) if (completion >= t - 1e-9) n++;
  return n;
}

export interface HandOver {
  stars: number;
  bonus: number;
  /** Below one star: the client refuses, the run ends. */
  failed: boolean;
}

/** Hands the house over: star bonus, run bookkeeping, a fresh house and a perk offer. */
export function handOver(s: Save, completion: number, houseValue: number, nextSeed: number): HandOver {
  const stars = starsFor(completion);
  const failed = stars === 0;
  const bonus = failed ? 0 : earn(s, houseValue * 0.06 * stars);
  if (failed) {
    s.best = bestOf(s.best, s.run);
    s.run = newRun(nextSeed);
  } else {
    s.run.houses += 1;
    s.run.stars += stars;
    s.best = bestOf(s.best, s.run);
    const perks = s.run.perks;
    s.run = { ...newRun(nextSeed, perks), houses: s.run.houses, stars: s.run.stars };
    s.run.offer = offerPerks(nextSeed, perks);
  }
  return { stars, bonus, failed };
}

function bestOf(b: Save["best"], r: RunState): Save["best"] {
  return r.stars > b.stars || (r.stars === b.stars && r.houses > b.houses) ? { houses: r.houses, stars: r.stars } : b;
}

export function choosePerk(s: Save, p: PerkId): void {
  if (!s.run.offer?.includes(p)) return;
  s.run.perks.push(p);
  s.run.offer = null;
}

export function offerPerks(seed: number, owned: PerkId[]): PerkId[] {
  const r = rng(seed ^ 0x51ed);
  // stackable perks can come again, but each at most twice
  const pool = PERK_IDS.filter((p) => owned.filter((x) => x === p).length < 2);
  const out: PerkId[] = [];
  while (out.length < 3 && pool.length) {
    const i = Math.floor(r() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/** Length of the working day in seconds, with perks. */
export function dayLength(s: Save): number {
  const hours = DAY.endHour - DAY.startHour;
  const extra = 2 * has(s, "weather") + (has(s, "nightshift") ? 1 : 0);
  return (DAY.seconds * (hours + extra)) / hours;
}

export function clock(s: Save): { hour: number; minute: number; label: string; sun: number; left: number } {
  const hours = DAY.endHour - DAY.startHour;
  const t = s.run.time / DAY.seconds;
  const h = DAY.startHour + t * hours;
  const hour = Math.floor(h), minute = Math.floor((h - hour) * 60);
  return {
    hour, minute,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    /** 0 at sunrise, 1 at the normal end of the day. */
    sun: Math.min(1.15, t),
    left: dayLength(s) - s.run.time,
  };
}

/** Advances the clock; returns true when the day just ended. */
export function tick(s: Save, dt: number): boolean {
  const before = s.run.time;
  s.run.time += dt;
  return before < dayLength(s) && s.run.time >= dayLength(s);
}

/** Starts the next day on the same house; returns true if the deadline is reached. */
export function nextDay(s: Save): boolean {
  s.run.time = 0;
  s.run.day += 1;
  return s.run.day > DAY.deadline;
}

export const client = (seed: number) => CLIENTS[Math.abs(seed) % CLIENTS.length];

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function money(n: number): string {
  return `₴ ${Math.floor(n).toLocaleString("uk-UA").replace(/,/g, " ")}`;
}
