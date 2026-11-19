/**
 * Rules of «Чотири стіни». Pure TypeScript, no rendering: the run (sixteen
 * seasons), the single day that stands for each season, time passing, the
 * things that happen to you and the slow arithmetic of a mind in a flat.
 *
 * One played day is the template for ~90 identical ones, so at night the day
 * is "stretched" over the season: half of what you gained or lost today, minus
 * the weight of the year.
 */
import {
  ACTIONS, DOOR_LINES, ENDINGS, FRIEND_ACC, REPLY_BACK, FRIEND_ARCS, FRIEND_IMPACT, FRIEND_NAMES, FRIEND_NEWS, FRIEND_ROLES, MIRROR_LINES,
  PERKS, SEASONS, SEASON_DEFS, TRAITS, WINDOW_LINES, actionById, seasonName, yearOf,
  type ActionDef, type ActionId, type EndingId, type FriendState, type PerkId, type PlaceId, type TraitId,
} from "./content.ts";
import { accOf, nameOf, num, roleOf, tr } from "./i18n.ts";

// ------------------------------------------------------------------ rng

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draws from the run's own stream so a saved run replays the same. */
function rnd(run: RunState): number {
  run.rng = (run.rng + 0x6d2b79f5) | 0;
  let t = run.rng;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(run: RunState, arr: readonly T[]): T => arr[Math.floor(rnd(run) * arr.length) % arr.length];
const between = (run: RunState, a: number, b: number) => a + rnd(run) * (b - a);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const fmt = (n: number) => `${num(n)} ₴`;
export const clockText = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

// ------------------------------------------------------------------ state

export interface Friend {
  name: string;
  acc: string;
  role: string;
  state: FriendState;
  /** [season, state] beats still to come. */
  arc: Array<[number, FriendState]>;
  color: number;
  /** You already opened the chat of this dead friend. */
  mourned?: boolean;
  /** 0..100: how close you still are. Replies keep it up, silence wears it down. */
  bond?: number;
}

export const bondOf = (f: Friend) => f.bond ?? 60;
const setBond = (f: Friend, v: number) => { f.bond = clamp(v, 0, 100); };
/** Friends who can still write and read. */
const reachable = (f: Friend) => f.state !== "dead" && f.state !== "taken";

export type MsgKind = "chat" | "bus" | "friend" | "mom" | "news" | "sys";
export interface Msg {
  kind: MsgKind; from: string; text: string; at: number;
  /** From the building chat: you now know about the van. */
  house?: boolean;
  /** Index of the friend who wrote it: you can answer. */
  friend?: number;
  replied?: boolean;
}

export type PlannedKind = "alert" | "knock" | "mom" | "neighbor" | "delivery" | "volunteer" | "msg" | "drill" | "warn";
export interface Planned {
  at: number;
  kind: PlannedKind;
  ballistic?: boolean;
  /** For knocks: who is really there. */
  who?: "tck" | "police" | "neighbor";
  /** For deliveries: a fake courier. */
  fake?: boolean;
  msg?: Msg;
  done?: boolean;
}

export interface AlertState {
  ballistic: boolean;
  until: number;
  booms: number[];
}

export interface DayState {
  clock: number;
  /** Psyche when you woke up. */
  start: number;
  blackouts: Array<[number, number]>;
  waterOff: Array<[number, number]>;
  bus: [number, number] | null;
  plan: Planned[];
  used: Partial<Record<ActionId, number>>;
  earned: number;
  deliveries: number;
  doom: number;
  alert: AlertState | null;
  /** The hero is between two walls (set by the scene each frame, or by the shelter action). */
  sheltered: boolean;
  phone: number;
  /** You know whether the van is in the courtyard today. */
  knowsBus: boolean;
  /** Something today exposed you (balcony with the van, opened door, a heard knock). */
  exposed: boolean;
  /** Action in progress. */
  busy: { id: ActionId; left: number; total: number; score: number } | null;
  msgs: Msg[];
  unread: number;
  nightAlert: boolean;
  glass: boolean;
  powerWasOn: boolean;
  waterWasOn: boolean;
  /** Last hour a phantom knock was rolled. */
  phantomHour: number;
  /** It rains all day (spring, summer, autumn). Rain is cover: nobody looks up. */
  rain?: boolean;
}

export interface RunState {
  v: 1;
  seed: number;
  rng: number;
  trait: TraitId;
  season: number;
  psyche: number;
  energy: number;
  satiety: number;
  food: number;
  money: number;
  apathy: number;
  body: number;
  heat: number;
  clutter: number;
  plant: number;
  station: number;
  daysInside: number;
  perks: PerkId[];
  friends: Friend[];
  day: DayState | null;
  ending: EndingId | null;
  /** psyche at the end of each season, for the final graph. */
  history: number[];
  stats: { alerts: number; knocks: number; deliveries: number; worked: number; lost: number };
  offer: PerkId[];
  flags: Record<string, number>;
}

export function has(run: RunState, p: PerkId): boolean { return run.perks.includes(p); }
export function trait(run: RunState) { return TRAITS.find((t) => t.id === run.trait) ?? TRAITS[0]; }

const FRIEND_COLORS = [0xd96a4a, 0x4a8ad9, 0x6ac46a, 0xd9b84a, 0x9a6ad9, 0x4ac4c4, 0xd94a8a];

export function newRun(seed: number, traitId: TraitId = "it", daily = 0): RunState {
  const t = TRAITS.find((x) => x.id === traitId) ?? TRAITS[0];
  const run: RunState = {
    v: 1, seed, rng: seed * 7919 + 13, trait: t.id, season: 0,
    psyche: t.psyche, energy: 80, satiety: 60, food: 3, money: t.money, apathy: 10, body: 60, heat: 8, clutter: 1, plant: 80,
    station: 0, daysInside: 290, perks: t.perk ? [t.perk] : [], friends: [], day: null, ending: null, history: [],
    stats: { alerts: 0, knocks: 0, deliveries: 0, worked: 0, lost: 0 }, offer: [], flags: daily ? { daily } : {},
  };
  // five friends, each with a life story that will happen while you sit here
  const names = [...FRIEND_NAMES.keys()].sort(() => rnd(run) - 0.5).slice(0, 5);
  const arcs = [...FRIEND_ARCS.keys()].sort(() => rnd(run) - 0.5);
  // at least one death and one taken in every run: that is what these years were
  const deadly = arcs.findIndex((i) => FRIEND_ARCS[i].some(([, s]) => s === "dead"));
  if (deadly > 4) [arcs[0], arcs[deadly]] = [arcs[deadly], arcs[0]];
  names.forEach((ni, k) => {
    const arc = FRIEND_ARCS[arcs[k]];
    const startAt = Math.floor(between(run, 0, 7));
    run.friends.push({
      name: FRIEND_NAMES[ni], acc: FRIEND_ACC[ni], role: pick(run, FRIEND_ROLES), state: "free",
      arc: arc.map(([off, s]) => [Math.min(SEASONS - 1, startAt + off), s]), color: FRIEND_COLORS[k % FRIEND_COLORS.length], bond: 60,
    });
  });
  startDay(run);
  return run;
}

// ------------------------------------------------------------------ the day

const DAY_START = 8 * 60;
const DAY_END = 24 * 60;

export function isLight(d: DayState, at = d.clock): boolean { return !d.blackouts.some(([a, b]) => at >= a && at < b); }
export function hasWater(d: DayState, at = d.clock): boolean { return !d.waterOff.some(([a, b]) => at >= a && at < b); }
export function busHere(d: DayState, at = d.clock): boolean { return !!d.bus && at >= d.bus[0] && at < d.bus[1]; }
export function isNight(d: DayState): boolean { return d.clock >= 21 * 60 || d.clock < 6 * 60; }
export function yearIndex(run: RunState): number { return Math.min(3, Math.floor(run.season / 4)); }
export function winter(run: RunState): boolean { return run.season % 4 === 0; }

/** Positive feelings are dimmer when you are low (anhedonia) and on meds. */
export function joy(run: RunState): number {
  const j = clamp(0.4 + run.psyche / 150 - run.apathy / 220, 0.3, 1.1);
  return has(run, "meds") ? j * 0.8 : j;
}

/**
 * The ceiling: even the best day is not as good as it used to be. It sinks a
 * little every season and a lot with every friend you lose.
 */
export function maxPsyche(run: RunState): number {
  return clamp(100 - run.season * 2.5 - run.stats.lost * 6, 30, 100);
}

function addPsyche(run: RunState, v: number): number {
  const k = v > 0 ? joy(run) : has(run, "meds") ? 0.6 : 1;
  const d = v * k;
  const top = maxPsyche(run);
  run.psyche = v > 0 ? Math.min(Math.max(run.psyche, top), run.psyche + d, top) : clamp(run.psyche + d, 0, 100);
  return d;
}

function msg(run: RunState, kind: MsgKind, from: string, text: string): Msg {
  const m: Msg = { kind, from, text, at: run.day?.clock ?? DAY_START };
  if (run.day) { run.day.msgs.push(m); run.day.unread++; }
  return m;
}

const DISTRICTS = ["Позняки", "Оболонь", "Троєщина", "Виноградар", "Харківський", "Лісовий", "Борщагівка", "Теремки", "Вітряні гори", "Нивки"];
const DISTRICTS_EN = ["Pozniaky", "Obolon", "Troieshchyna", "Vynohradar", "Kharkivskyi", "Lisovyi", "Borshchahivka", "Teremky", "Vitriani Hory", "Nyvky"];
const SPOTS = ["біля АТБ", "біля метро", "на зупинці", "біля Сільпо", "у дворі на Драгоманова", "біля школи", "на розворотці", "біля аптеки"];
const SPOTS_EN = ["by the ATB", "by the metro", "at the bus stop", "by the Silpo", "in a yard on Drahomanova", "by the school", "at the turnaround", "by the pharmacy"];

/** Same seed for everyone on the same calendar day (local date). */
export function dailySeed(date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}
export function isDaily(run: RunState): boolean { return !!run.flags.daily; }

/** Weather for a season, from the seed alone: it never shifts the run's own random stream. */
export function rainyDay(seed: number, season: number): boolean {
  const chance = [0, 0.35, 0.25, 0.55][season % 4];
  return mulberry32((seed ^ Math.imul(season + 1, 0x9e3779b1)) | 0)() < chance;
}

export function startDay(run: RunState): void {
  // a daily run: every player gets the same day each season, whatever they did before
  if (run.flags.daily) run.rng = (Math.imul(run.seed, 2654435761) + run.season * 7919 + 13) | 0;
  const def = SEASON_DEFS[run.season];
  const yd = yearOf(run.season);
  const y = yearIndex(run);
  const blackouts: Array<[number, number]> = [];
  if (def.blackout >= 1) {
    const a = Math.round(between(run, 9, 12)) * 60;
    blackouts.push([a, a + 4 * 60]);
  }
  if (def.blackout >= 2) {
    const a = Math.round(between(run, 17, 19)) * 60;
    blackouts.push([a, a + 4 * 60]);
  }
  const waterOff: Array<[number, number]> = [];
  if (def.water) {
    const a = Math.round(between(run, 8, 13)) * 60;
    waterOff.push([a, a + Math.round(between(run, 5, 9)) * 60]);
  }
  let bus: [number, number] | null = null;
  if (rnd(run) < yd.bus) {
    const a = Math.round(between(run, 8.5, 16) * 4) * 15;
    bus = [a, Math.min(DAY_END, a + Math.round(between(run, 2, y >= 3 ? 10 : 5)) * 60)];
  }
  const nightAlert = run.day?.nightAlert ?? false;
  const d: DayState = {
    clock: DAY_START, start: 0, blackouts, waterOff, bus, plan: [], used: {}, earned: 0, deliveries: 0, doom: 0,
    alert: null, sheltered: false, phone: 85, knowsBus: has(run, "buschat"), exposed: false, busy: null, msgs: [], unread: 0,
    nightAlert: false, glass: false, powerWasOn: true, waterWasOn: true, phantomHour: 8, rain: rainyDay(run.seed, run.season),
  };
  run.day = d;
  run.energy = clamp(50 + run.body * 0.35 - (nightAlert ? 15 : 0) - run.apathy * 0.1, 15, 100);
  run.satiety = 55;
  d.start = run.psyche;
  d.powerWasOn = isLight(d);
  d.waterWasOn = hasWater(d);

  const plan = d.plan;
  // the sky
  if (rnd(run) < yd.alert) {
    plan.push({ at: Math.round(between(run, 9, 21) * 4) * 15, kind: "alert", ballistic: rnd(run) < yd.ballistic });
    if (y >= 2 && rnd(run) < 0.35) plan.push({ at: Math.round(between(run, 13, 23) * 4) * 15, kind: "alert", ballistic: rnd(run) < yd.ballistic });
  }
  // the door
  if (rnd(run) < yd.knock + run.heat / 250) {
    const who = rnd(run) < 0.7 ? "tck" : rnd(run) < 0.5 ? "police" : "neighbor";
    const at = Math.round(between(run, 9.5, 20) * 4) * 15;
    plan.push({ at, kind: "knock", who });
    if (has(run, "neighbor") && who !== "neighbor") plan.push({ at: at - 20, kind: "warn" });
  }
  if (rnd(run) < 0.55) plan.push({ at: Math.round(between(run, 11, 20) * 4) * 15, kind: "mom" });
  if (rnd(run) < 0.22 + y * 0.05) plan.push({ at: Math.round(between(run, 10, 19) * 4) * 15, kind: "neighbor" });
  if (rnd(run) < 0.3) plan.push({ at: Math.round(between(run, 10, 17) * 4) * 15, kind: "drill" });
  if (has(run, "volunteer")) plan.push({ at: Math.round(between(run, 12, 16) * 4) * 15, kind: "delivery" });
  // the chats
  const chatter = 2 + y;
  for (let i = 0; i < chatter; i++) {
    const at = Math.round(between(run, 8.5, 22) * 4) * 15;
    const text = `🚐 ${pick(run, tr(DISTRICTS, DISTRICTS_EN))}, ${pick(run, tr(SPOTS, SPOTS_EN))}${rnd(run) < 0.4 ? tr(", пакують усіх", ", grabbing everyone") : rnd(run) < 0.5 ? tr(", два буси", ", two vans") : ""}`;
    plan.push({ at, kind: "msg", msg: { kind: "bus", from: tr("Де бус? · Київ", "Where's the van? · Kyiv"), text, at } });
  }
  if (bus) {
    plan.push({ at: bus[0] + 5, kind: "msg", msg: { kind: "bus", from: tr("Чат будинку", "Building chat"), text: tr("Біля нашого підʼїзду бус!!! Чоловіки, не виходьте", "The van is by our entrance!!! Men, don't go out"), at: bus[0] + 5, house: true } });
  }
  run.friends.forEach((f, i) => {
    // a friend you stopped answering stops writing
    if (bondOf(f) < 25) return;
    const at = Math.round(between(run, 9, 22) * 4) * 15;
    const line = friendChatter(run, f);
    if (line && rnd(run) < 0.6) plan.push({ at, kind: "msg", msg: { kind: "friend", from: nameOf(f), text: line, at, friend: i } });
  });
  plan.sort((a, b) => a.at - b.at);

  // the morning
  msg(run, "sys", tr("Ранок", "Morning"), tr(`${seasonName(run.season)}. День ${num(run.daysInside)} без вулиці.`, `${seasonName(run.season)}. Day ${num(run.daysInside)} without the street.`));
  if (nightAlert) msg(run, "sys", tr("Ніч", "Night"), tr("Вночі була тривога. Ти заснув о пʼятій.", "There was an alert in the night. You fell asleep at five."));
  if (d.rain) msg(run, "sys", tr("Погода", "Weather"), tr("Дощ на весь день. У дощ ніхто не дивиться вгору.", "Rain all day. Nobody looks up in the rain."));
  if (blackouts.length) msg(run, "chat", tr("ДТЕК", "DTEK"), tr(`Графік на сьогодні: ${blackouts.map(([a, b]) => `${clockText(a)}–${clockText(b)}`).join(", ")} без світла.`, `Today's schedule: no power ${blackouts.map(([a, b]) => `${clockText(a)}–${clockText(b)}`).join(", ")}.`));
  if (waterOff.length) msg(run, "chat", tr("Чат будинку", "Building chat"), tr(`Води не буде ${clockText(waterOff[0][0])}–${clockText(waterOff[0][1])}. Набирайте.`, `No water ${clockText(waterOff[0][0])}–${clockText(waterOff[0][1])}. Fill up.`));
  if (d.knowsBus) msg(run, "bus", tr("Де бус · канал", "Where's the van · channel"), bus ? tr(`Ваш двір: бус приїде близько ${clockText(bus[0])}.`, `Your yard: the van will arrive around ${clockText(bus[0])}.`) : tr("Ваш двір: сьогодні тихо.", "Your yard: quiet today."));
}

function friendChatter(run: RunState, f: Friend): string | null {
  switch (f.state) {
    case "free": return pick(run, tr(["го на каву в суботу? всі будуть", "скинув фото з концерту, шкода що тебе нема", "ти живий? давно не чути"], ["coffee on saturday? everyone's coming", "posted photos from the gig, shame you weren't there", "you alive? haven't heard from you in ages"]));
    case "hiding": return pick(run, tr(["ти як? я вже з квартири не виходжу взагалі", "в нас бус третій день стоїть. тримайся", "дивлюсь у стелю. смішно, правда?"], ["how are you? I don't leave the flat at all any more", "the van's been in our yard three days. hang in there", "staring at the ceiling. funny, right?"]));
    case "abroad": return pick(run, tr(["тут все дороге і все чуже", "сьогодні сниться Київ", "мама питає, чи ти виходиш. що їй сказати?"], ["everything here is expensive and strange", "dreamed of Kyiv tonight", "mom asks if you go out. what do I tell her?"]));
    case "front": case "volunteered": return pick(run, tr(["живий", "на звʼязку буду через тиждень", "не переживай за мене. сам тримайся", "пришли якусь музику, тут тихо і страшно"], ["alive", "I'll be in touch in a week", "don't worry about me. you hang in there", "send me some music, it's quiet and scary here"]));
    case "wounded": return pick(run, tr(["вже ходжу з паличкою", "в шпиталі нудно. пиши щось"], ["walking with a cane already", "the hospital is boring. write me something"]));
    case "home": return pick(run, tr(["приходь, посидимо. а, ну так", "не знаю, як тепер жити звичайно"], ["come over, let's sit. ah, right", "don't know how to live normally now"]));
    default: return null;
  }
}

// ------------------------------------------------------------------ what you can do

export interface Avail { def: ActionDef; ok: boolean; why?: string }

export function actionsAt(run: RunState, place: PlaceId | "phone"): Avail[] {
  const d = run.day!;
  const out: Avail[] = [];
  for (const def of ACTIONS) {
    if (def.place !== place) continue;
    if (def.perk && !has(run, def.perk)) continue;
    if (def.id === "break_out" && run.psyche > 12) continue;
    if (def.id === "go_out" && run.psyche <= 12) continue;
    if (def.id === "wash_bottle" && hasWater(d)) continue;
    if (def.id === "shower" && !hasWater(d) && has(run, "bottles")) continue;
    out.push({ def, ...check(run, def) });
  }
  return out;
}

function check(run: RunState, def: ActionDef): { ok: boolean; why?: string } {
  const d = run.day!;
  if (d.busy) return { ok: false, why: tr("Зайнятий", "Busy") };
  if (def.once && (d.used[def.id] ?? 0) >= 1) return { ok: false, why: tr("Сьогодні вже", "Done today") };
  if (def.minutes > 0 && d.clock + def.minutes > DAY_END + 30) return { ok: false, why: tr("Вже ніч", "It's night") };
  if ((def.fx.energy ?? 0) < 0 && run.energy < 8) return { ok: false, why: tr("Немає сил", "No strength") };
  if (def.place === "phone" && d.phone < 5) return { ok: false, why: tr("Телефон сів", "Phone is dead") };
  if (def.fx.food && run.food < -def.fx.food) return { ok: false, why: tr("Нема їжі", "No food") };
  if (def.water && !hasWater(d)) {
    if (!(def.id === "water_plant" && has(run, "bottles"))) return { ok: false, why: tr("Немає води", "No water") };
  }
  if (def.power && !isLight(d)) {
    if (def.id === "cook") return { ok: false, why: tr("Немає світла", "No power") };
    if (!(has(run, "station") && run.station >= 25)) return { ok: false, why: tr("Немає світла", "No power") };
  }
  if (def.id === "therapy" && run.money < 1200 * yearOf(run.season).prices) return { ok: false, why: tr("Немає грошей", "No money") };
  if (def.id === "order") {
    if (run.money < orderCost(run)) return { ok: false, why: tr("Немає грошей", "No money") };
    if (d.plan.some((p) => p.kind === "delivery" && !p.done && !p.fake && p.at > d.clock)) return { ok: false, why: tr("Вже їде", "On its way") };
  }
  if (def.id === "shelter" && !d.alert) return { ok: false, why: tr("Тривоги немає", "No alert") };
  if ((def.id === "balcony" || def.id === "air") && d.alert) return { ok: false, why: tr("Тривога", "Alert") };
  return { ok: true };
}

export function orderCost(run: RunState): number { return Math.round(450 * yearOf(run.season).prices / 10) * 10; }

export interface ActionResult {
  id: ActionId;
  /** Text to show (what happened). */
  text?: string;
  /** Psyche change actually applied. */
  dPsyche: number;
  money?: number;
  /** The scene should show the courtyard. */
  view?: "people" | "empty" | "bus" | "night" | "rain";
  /** Ends the day / run. */
  endDay?: boolean;
  ending?: EndingId;
}

/** Starts a timed action. Returns why not, or null when started. */
export function beginAction(run: RunState, id: ActionId, score = 1): string | null {
  const def = actionById(id);
  const c = check(run, def);
  if (!c.ok) return c.why ?? tr("Не можна", "Can't");
  const d = run.day!;
  d.used[id] = (d.used[id] ?? 0) + 1;
  if (def.place === "phone") d.phone = Math.max(0, d.phone - 6);
  if (def.power && !isLight(d) && def.id !== "cook") run.station = Math.max(0, run.station - (id === "work" ? 40 : 15));
  d.busy = { id, left: def.minutes, total: def.minutes, score };
  if (id === "shelter") d.sheltered = true;
  return null;
}

/** Applies what an action gives. `score` (0..1) is the work minigame result. */
export function finishAction(run: RunState, id: ActionId, score = 1, part = 1): ActionResult {
  const def = actionById(id);
  const d = run.day!;
  d.busy = null;
  const y = yearIndex(run);
  const fx = def.fx;
  const r: ActionResult = { id, dPsyche: 0 };
  const p0 = run.psyche;
  if (fx.energy) run.energy = clamp(run.energy + fx.energy * part, 0, 100);
  if (fx.satiety) run.satiety = clamp(run.satiety + fx.satiety * part, 0, 100);
  if (fx.food) run.food = Math.max(0, run.food + fx.food);
  if (fx.apathy) run.apathy = clamp(run.apathy + fx.apathy * part, 0, 100);
  if (fx.body) run.body = clamp(run.body + fx.body * part * (has(run, "dumbbells") ? 1.5 : 1), 0, 100);
  if (fx.clutter) run.clutter = Math.max(0, run.clutter + fx.clutter);
  if (fx.plant) run.plant = clamp(run.plant + fx.plant, 0, 100);
  if (fx.money) run.money += fx.money * yearOf(run.season).prices;
  let ps = (fx.psyche ?? 0) * part;
  if (id === "exercise" && has(run, "dumbbells")) ps += 3;
  if (id === "read" && has(run, "books")) ps += 3;

  switch (id) {
    case "work": {
      const t = trait(run);
      const earned = t.wage * yearOf(run.season).market * (0.35 + 0.65 * score) * (has(run, "client") ? 1.4 : 1) * part;
      d.earned += earned;
      run.stats.worked++;
      r.money = earned;
      r.text = score > 0.8 ? tr("Все закрив. Хоч щось під контролем.", "Closed everything. At least something is under control.") : score > 0.4 ? tr("Щось зробив. Голова як вата.", "Got something done. Head full of cotton wool.") : tr("Дивився в екран три години.", "Stared at the screen for three hours.");
      if (y >= 2 && rnd(run) < 0.2) { ps -= 3; r.text += tr(" Клієнт написав, що «переглядає бюджети».", " The client wrote that they're “reviewing budgets”."); }
      break;
    }
    case "look": {
      const view = isNight(d) || (!isLight(d) && winter(run) && d.clock > 16 * 60) ? "night" : busHere(d) ? "bus" : d.rain ? "rain" : y === 0 || (y === 1 && !winter(run)) ? "people" : "empty";
      r.view = view;
      r.text = pick(run, WINDOW_LINES[view]);
      ps = view === "people" ? 3 : view === "bus" ? -6 : view === "empty" ? -1 : view === "rain" ? 2 : 0;
      if (view === "bus") d.knowsBus = true;
      else if (view !== "night") d.knowsBus = true;
      break;
    }
    case "air": {
      if (d.rain) {
        ps = 5;
        r.text = tr("Пахне дощем. Мокрим асфальтом і листям. Ти стоїш біля кватирки, доки не змерзнеш.", "It smells of rain. Wet asphalt and leaves. You stand at the open vent until you're cold.");
      }
      break;
    }
    case "balcony": {
      if (busHere(d) && d.rain) {
        // rain is cover: everyone down there looks at their feet
        ps = -2;
        run.heat = clamp(run.heat + 5, 0, 100);
        d.knowsBus = true;
        r.text = tr("Внизу бус, але в таку зливу ніхто не дивиться вгору. Ти стоїш за стіною води, мокрий, і дихаєш.", "The van is down there, but in a downpour like this nobody looks up. You stand behind a wall of water, soaked, and breathe.");
      } else if (busHere(d)) {
        ps = -7;
        run.heat = clamp(run.heat + 18, 0, 100);
        d.exposed = true;
        d.knowsBus = true;
        r.text = tr("Внизу бус. Один з них підняв голову. Ти присів за перила і так сидів, доки не затерпли ноги.", "The van is below. One of them looked up. You crouched behind the railing and stayed there until your legs went numb.");
      } else if (d.rain) {
        ps = 7;
        r.text = tr("Дощ барабанить по даху балкона. Бризки на обличчі. Тебе не видно за сірою стіною води.", "Rain drums on the balcony roof. Spray on your face. Nobody can see you behind the grey wall of water.");
      } else {
        ps = winter(run) ? 3 : run.season % 4 === 2 ? 8 : 6;
        r.text = winter(run) ? tr("Морозне повітря. Пара з рота. Ти рахуєш вдихи.", "Frosty air. Your breath steams. You count the breaths.") : tr("Сонце на обличчі. На пʼять хвилин ти забув.", "Sun on your face. For five minutes you forgot.");
      }
      break;
    }
    case "tomatoes": {
      if (run.season % 4 !== 0 && rnd(run) < 0.5) { run.food += 1; r.text = tr("Достиг помідор. Ти зʼїв його прямо на балконі.", "A tomato ripened. You ate it right there on the balcony."); }
      else r.text = tr("Листя пахне літом.", "The leaves smell of summer.");
      break;
    }
    case "mirror": {
      ps = y === 0 ? 0 : -2;
      r.text = MIRROR_LINES[y];
      break;
    }
    case "go_out": {
      r.text = pick(run, DOOR_LINES);
      break;
    }
    case "break_out": {
      r.ending = "zryv";
      r.text = ENDINGS.zryv.text;
      run.ending = "zryv";
      break;
    }
    case "peephole": {
      r.text = busHere(d) && d.knowsBus ? tr("Сходи порожні. Знизу гупають двері підʼїзду. Кожен раз — як постріл.", "The stairs are empty. Below, the entrance door bangs. Every time — like a gunshot.") : pick(run, tr(["Сходи порожні. Лампочка блимає.", "Сусідка з восьмої миє підлогу.", "Нікого. Пахне чужим борщем."], ["The stairs are empty. The bulb flickers.", "The neighbour from number eight is mopping the floor.", "Nobody. It smells of someone else's borscht."]));
      break;
    }
    case "photos": {
      const dead = run.friends.filter((f) => f.state === "dead").length;
      const gone = run.friends.filter((f) => f.state !== "free" && f.state !== "hiding").length;
      ps = dead ? -3 : gone >= 3 ? -1 : 3;
      r.text = dead ? tr("На фото ви всі пʼятеро. На одному обличчі тепер чорна стрічка.", "All five of you in the photo. One face now has a black ribbon.") : gone ? tr("Ви всі пʼятеро на дачі в Козині. Тепер ви всі в різних місцях.", "All five of you at the dacha in Kozyn. Now you're all in different places.") : tr("Ви всі пʼятеро на дачі в Козині. Шашлик підгорів. Найкращий день.", "All five of you at the dacha in Kozyn. The shashlik got burnt. The best day.");
      break;
    }
    case "calendar": {
      r.text = tr(`Закреслив. ${num(run.daysInside)}-й.`, `Crossed off. Day ${num(run.daysInside)}.`);
      break;
    }
    case "friends": {
      const reach = run.friends.filter((f) => ["free", "hiding", "abroad", "front", "home", "wounded", "volunteered"].includes(f.state)).length;
      const dead = run.friends.find((f) => f.state === "dead" && !f.mourned);
      if (dead) {
        dead.mourned = true;
        ps = -6;
        r.text = tr(`Ти за звичкою відкрив чат «${nameOf(dead)}». Останнє повідомлення — твоє. Не прочитане.`, `Out of habit you opened the chat with ${nameOf(dead)}. The last message is yours. Unread.`);
      } else if (reach === 0) {
        ps = -4;
        r.text = tr("Тобі нікому писати.", "There's nobody to write to.");
      } else {
        ps = Math.min(8, 2 * reach);
        r.text = reach >= 4 ? tr("Ви годину скидали один одному меми. Майже як раніше.", "You spent an hour sending each other memes. Almost like before.") : tr("Відповіли не всі. Ті, хто відповів — коротко.", "Not everyone answered. Those who did — briefly.");
      }
      break;
    }
    case "mom": {
      if (y >= 2 && rnd(run) < 0.5) { ps = 1; r.text = tr("Мама питає, чи не краще «піти офіційно». Ви сваритесь, потім вона плаче. Ти теж.", "Mom asks if it wouldn't be better to “go officially”. You argue, then she cries. So do you."); }
      else r.text = pick(run, tr(["Мама розповідає про кота сусідки і про ціни. Ти слухаєш її голос, не слова.", "«Ти там їси? Голос у тебе якийсь не такий». — «Все добре, мам»."], ["Mom talks about the neighbour's cat and about prices. You listen to her voice, not the words.", "“Are you eating? Your voice sounds off.” — “I'm fine, mom.”"]));
      break;
    }
    case "chat": {
      d.knowsBus = true;
      r.text = busHere(d) ? tr("У чаті будинку: бус біля підʼїзду. Ніхто не виходить.", "Building chat: the van is by the entrance. Nobody goes out.") : d.bus && d.clock < d.bus[0] ? tr("Твій двір поки чистий. Пишуть, що на сусідній вулиці пакують.", "Your yard is clear for now. They say they're grabbing people on the next street.") : tr("Твій двір сьогодні чистий. Поки що.", "Your yard is clear today. For now.");
      break;
    }
    case "news": {
      d.doom++;
      r.text = pick(run, tr(["Ще одна атака. Ще одна сторіз з обвалом підʼїзду. Ще одну.", "Переговори, заяви, мапи. Нічого не змінюється, але гортаєш далі.", "Коментарі про «ухилянтів». Ти читаєш усі."], ["Another attack. Another story of a collapsed stairwell. One more.", "Talks, statements, maps. Nothing changes, but you keep scrolling.", "Comments about “draft dodgers”. You read them all."]));
      break;
    }
    case "order": {
      const cost = orderCost(run);
      run.money -= cost;
      r.money = -cost;
      const y2 = yearIndex(run);
      const fakeChance = run.season >= 5 ? [0, 0.08, 0.18, 0.28][y2] + run.heat / 400 : 0;
      const fake = rnd(run) < fakeChance;
      const at = d.clock + Math.round(between(run, 40, 90));
      d.plan.push({ at, kind: "delivery", fake });
      if (fake) d.plan.push({ at: at + 35, kind: "delivery", fake: false });
      d.plan.sort((a, b) => a.at - b.at);
      d.deliveries++;
      r.text = tr(`Замовлено на ${fmt(cost)}. «Залиште під дверима, будь ласка».`, `Ordered for ${fmt(cost)}. “Please leave it at the door.”`);
      break;
    }
    case "shelter": {
      r.text = tr("Сидиш на підлозі в коридорі. Рахуєш вибухи.", "You sit on the corridor floor. Counting the explosions.");
      break;
    }
    case "stare": {
      r.text = pick(run, tr(["Тріщина на стелі схожа на Дніпро.", "Дві години. Ти не памʼятаєш, про що думав.", "Сусіди зверху ходять. У них є куди."], ["The crack in the ceiling looks like the Dnipro.", "Two hours. You don't remember what you were thinking about.", "The neighbours upstairs are walking around. They have somewhere to go."]));
      break;
    }
    case "drink": {
      r.text = tr("Тепло в грудях. Стіни відступають. На годину.", "Warmth in your chest. The walls step back. For an hour.");
      break;
    }
    case "pet": {
      r.text = tr("Кіт муркоче і бʼє лапою по руці. Він не знає, що ти ховаєшся. Для нього ти просто вдома.", "The cat purrs and paws at your hand. He doesn't know you're hiding. To him you're just home.");
      break;
    }
    case "tidy": {
      r.text = run.clutter >= 5 ? tr(`Склав сміття в пакети. Пакетів у коридорі: ${run.clutter + 4}. Винести не можна.`, `Bagged the rubbish. Bags in the hallway: ${run.clutter + 4}. You can't take them out.`) : tr("Чисто. Майже як у людей.", "Clean. Almost like normal people.");
      break;
    }
    case "sleep": {
      r.endDay = true;
      break;
    }
    default: break;
  }
  // the same comfort twice in a day helps less
  if (ps > 0) ps /= Math.max(1, d.used[id] ?? 1);
  if (ps) r.dPsyche = addPsyche(run, ps);
  r.dPsyche = run.psyche - p0;
  return r;
}

// ------------------------------------------------------------------ time

export type DayEvent =
  | { kind: "done"; result: ActionResult }
  | { kind: "alert"; ballistic: boolean }
  | { kind: "alert_end" }
  | { kind: "boom"; near: boolean }
  | { kind: "power"; on: boolean }
  | { kind: "water"; on: boolean }
  | { kind: "bus"; on: boolean }
  | { kind: "knock"; who: "tck" | "police" | "neighbor" | "phantom" }
  | { kind: "delivery"; fake: boolean; volunteer: boolean }
  | { kind: "mom" }
  | { kind: "neighbor" }
  | { kind: "drill" }
  | { kind: "warn" }
  | { kind: "msg"; msg: Msg }
  | { kind: "night" };

/**
 * Lets time pass, up to `minutes`. Stops at the first thing that happens and
 * returns it (the caller resolves it and keeps going). Returns [] when the
 * whole span passed quietly.
 */
export function tick(run: RunState, minutes: number): DayEvent[] {
  const d = run.day!;
  const out: DayEvent[] = [];
  let left = minutes;
  while (left > 0 && out.length === 0) {
    const step = Math.min(1, left);
    left -= step;
    const prev = d.clock;
    d.clock += step;
    hourly(run, step / 60);
    // scheduled things
    for (const p of d.plan) {
      if (p.done || p.at > d.clock) continue;
      p.done = true;
      out.push(...fire(run, p));
      if (out.length) break;
    }
    if (out.length) break;
    // alert in progress
    if (d.alert) {
      const b = d.alert.booms.findIndex((t) => t <= d.clock);
      if (b >= 0) {
        d.alert.booms.splice(b, 1);
        const near = rnd(run) < (d.alert.ballistic ? 0.45 : 0.3);
        boomHit(run, near);
        out.push({ kind: "boom", near });
        break;
      }
      if (d.clock >= d.alert.until) {
        d.alert = null;
        d.sheltered = false;
        out.push({ kind: "alert_end" });
        break;
      }
    }
    // schedules
    const light = isLight(d);
    if (light !== d.powerWasOn) { d.powerWasOn = light; out.push({ kind: "power", on: light }); break; }
    const water = hasWater(d);
    if (water !== d.waterWasOn) { d.waterWasOn = water; out.push({ kind: "water", on: water }); break; }
    if (d.bus && prev < d.bus[0] && d.clock >= d.bus[0]) { out.push({ kind: "bus", on: true }); break; }
    if (d.bus && prev < d.bus[1] && d.clock >= d.bus[1]) { out.push({ kind: "bus", on: false }); break; }
    // the head knocks too
    const hour = Math.floor(d.clock / 60);
    if (hour !== d.phantomHour) {
      d.phantomHour = hour;
      if (run.psyche < 35 && rnd(run) < 0.12 + (35 - run.psyche) / 120) { out.push({ kind: "knock", who: "phantom" }); break; }
    }
    // the action in progress
    if (d.busy) {
      d.busy.left -= step;
      if (d.busy.left <= 0) {
        out.push({ kind: "done", result: finishAction(run, d.busy.id, d.busy.score) });
        break;
      }
    }
    if (d.clock >= DAY_END) { out.push({ kind: "night" }); break; }
  }
  return out;
}

function hourly(run: RunState, h: number): void {
  const d = run.day!;
  const y = yearIndex(run);
  run.satiety = clamp(run.satiety - 4 * h, 0, 100);
  run.energy = clamp(run.energy - 2.2 * h, 0, 100);
  let drain = 0.35 + 0.15 * y;
  if (run.satiety < 25) drain += 1.5;
  if (run.energy < 12) drain += 0.8;
  if (run.clutter > 6) drain += 0.3;
  if (d.alert && !d.sheltered) drain += 1.2;
  if (d.alert && d.sheltered) drain += 0.4;
  if (busHere(d) && d.knowsBus) drain += 0.7;
  if (!isLight(d) && winter(run)) drain += 0.5;
  if (d.glass) drain += 0.6;
  addPsyche(run, -drain * h);
  // phone and power station
  if (isLight(d)) {
    d.phone = clamp(d.phone + 25 * h, 0, 100);
    if (has(run, "station")) run.station = clamp(run.station + 45 * h, 0, 100);
  } else {
    d.phone = clamp(d.phone - 1.5 * h, 0, 100);
    if (has(run, "powerbank") && d.phone < 15 && !(d.used as Record<string, number>).__pb) { d.phone = 75; (d.used as Record<string, number>).__pb = 1; }
  }
}

function boomHit(run: RunState, near: boolean): void {
  const d = run.day!;
  let hit = near ? (d.sheltered ? -4 : -8) : (d.sheltered ? -1 : -2);
  if (has(run, "headphones")) hit = Math.round(hit / 2);
  addPsyche(run, hit);
  if (near && !d.sheltered && !d.glass && rnd(run) < 0.25) {
    d.glass = true;
    run.clutter += 2;
    msg(run, "sys", tr("Кухня", "Kitchen"), tr("Вибуховою хвилею вибило скло на кухні. Ти заклеїв плівкою. Тепер там гуляє вітер.", "The blast wave knocked out the kitchen window. You covered it with film. Now the wind blows through."));
  }
}

function fire(run: RunState, p: Planned): DayEvent[] {
  const d = run.day!;
  switch (p.kind) {
    case "alert": {
      if (d.alert) { d.alert.until = Math.max(d.alert.until, p.at + 60); return []; }
      run.stats.alerts++;
      const len = p.ballistic ? 20 : Math.round(between(run, 80, 220));
      const booms: number[] = [];
      const n = p.ballistic ? 1 : 2 + Math.floor(rnd(run) * (2 + yearIndex(run)));
      for (let i = 0; i < n; i++) booms.push(p.at + (p.ballistic ? 1 : Math.round(between(run, 15, len - 5))));
      d.alert = { ballistic: !!p.ballistic, until: p.at + len, booms: p.ballistic ? [] : booms.sort((a, b) => a - b) };
      d.sheltered = false;
      return [{ kind: "alert", ballistic: !!p.ballistic }];
    }
    case "knock": return [{ kind: "knock", who: p.who ?? "tck" }];
    case "warn": return [{ kind: "warn" }];
    case "mom": return [{ kind: "mom" }];
    case "neighbor": return [{ kind: "neighbor" }];
    case "drill": addPsyche(run, -2); return [{ kind: "drill" }];
    case "delivery": return [{ kind: "delivery", fake: !!p.fake, volunteer: !p.fake && has(run, "volunteer") && !d.used.order && !(d.used as Record<string, number>).__vol }];
    case "msg": {
      if (!p.msg) return [];
      const m = { ...p.msg, at: d.clock };
      d.msgs.push(m);
      d.unread++;
      if (p.msg.house) d.knowsBus = true;
      return [{ kind: "msg", msg: m }];
    }
    default: return [];
  }
}

/** Cancels the action in progress (an alert, a knock), keeping a share of its effect. */
export function interruptAction(run: RunState): ActionResult | null {
  const d = run.day!;
  if (!d.busy) return null;
  const { id, left, total, score } = d.busy;
  const part = total > 0 ? clamp(1 - left / total, 0, 1) : 1;
  if (id === "shelter") { d.busy = null; return null; }
  return finishAction(run, id, score, part);
}

// ------------------------------------------------------------------ resolving events

export interface Outcome { text: string; dPsyche: number; ending?: EndingId; food?: number }

/** Ballistic: did you reach the corridor in time? */
export function resolveBallistic(run: RunState, sheltered: boolean): Outcome {
  const d = run.day!;
  const p0 = run.psyche;
  if (sheltered) {
    addPsyche(run, has(run, "headphones") ? -2 : -4);
    d.alert = null;
    return { text: tr("Ти встиг. Сидиш між двох стін, вуха закладає. Десь недалеко.", "You made it. You sit between two walls, your ears pop. Somewhere close."), dPsyche: run.psyche - p0 };
  }
  if (rnd(run) < 0.05 + yearIndex(run) * 0.015) {
    run.ending = "strike";
    return { text: ENDINGS.strike.text, dPsyche: 0, ending: "strike" };
  }
  addPsyche(run, has(run, "headphones") ? -7 : -12);
  if (!d.glass) { d.glass = true; run.clutter += 2; }
  d.alert = null;
  return { text: tr("Вибух так близько, що підлога підстрибнула. Скло на кухні — на підлозі. Ти живий. Руки трусяться годину.", "The blast was so close the floor jumped. The kitchen glass is on the floor. You're alive. Your hands shake for an hour."), dPsyche: run.psyche - p0 };
}

/** Holding your breath behind the door. `quiet` — they did not hear you. */
export function resolveKnock(run: RunState, who: Visitor, quiet: boolean, read: StepRead = "none"): Outcome {
  const d = run.day!;
  const p0 = run.psyche;
  run.stats.knocks++;
  let text = "";
  // knowing who is out there is less terrible than not knowing; getting it wrong is worse
  if (read === "wrong") addPsyche(run, -3);
  if (who === "phantom" && read === "right") {
    addPsyche(run, -1);
    return { text: tr("Ти прислухався: кроків не було. Стук — у твоїй голові. Ти навіть не встав.", "You listened: there were no steps. The knock is in your head. You didn't even get up."), dPsyche: run.psyche - p0 };
  }
  if (who === "neighbor" && read === "right" && !quiet) {
    run.food += 1;
    run.heat = clamp(run.heat + 2, 0, 100);
    addPsyche(run, 4);
    return { text: tr("Ти впізнав її човгання ще на сходах і відчинив сам. Тьотя Валя з пиріжками. Вона нічого не спитала. Просто погладила тебе по руці.", "You knew her shuffle on the stairs and opened the door yourself. Auntie Valia with pies. She didn't ask anything. Just patted your hand."), dPsyche: run.psyche - p0 };
  }
  if (read === "right" && who !== "neighbor") addPsyche(run, 2);
  if (who === "phantom") {
    addPsyche(run, -4);
    text = tr("Ти довго стояв біля дверей. Подивився в глазок. На сходах нікого не було. Нікого й не було.", "You stood by the door a long time. Looked through the peephole. Nobody on the stairs. There never was anybody.");
  } else if (who === "neighbor") {
    addPsyche(run, quiet ? -3 : -2);
    text = quiet ? tr("У глазок — сусідка з восьмої з тарілкою пиріжків. Постояла й пішла. Тобі соромно.", "Through the peephole — the neighbour from number eight with a plate of pies. She waited and left. You feel ashamed.") : tr("«Синку, я ж чую, що ти вдома. Пиріжки під дверима». Ти відчинив через годину. Холодні. Найсмачніші за рік.", "“Sonny, I can hear you're home. Pies at the door.” You opened an hour later. Cold. The tastiest in a year.");
    if (!quiet) run.food += 1;
  } else if (quiet) {
    addPsyche(run, who === "tck" ? -8 : -6);
    run.heat = clamp(run.heat + 4, 0, 100);
    text = who === "tck" ? tr("Стукали хвилин пʼять. Потім щось запхнули в щілину. Повістка. На твоє імʼя, з помилкою в прізвищі.", "They knocked for about five minutes. Then they pushed something into the gap. A summons. In your name, with your surname misspelt.") : tr("Дільничний постукав, поговорив по телефону і пішов. «Квартира порожня, наче».", "The local cop knocked, talked on the phone and left. “Flat's empty, looks like.”");
  } else {
    addPsyche(run, -13);
    run.heat = clamp(run.heat + 20, 0, 100);
    d.exposed = true;
    text = tr("«Ми знаємо, що ви там». Ти не дихав, але вони чули. Постояли, пішли. Тепер вони знають.", "“We know you're in there.” You didn't breathe, but they heard. They stood a while, then left. Now they know.");
  }
  return { text, dPsyche: run.psyche - p0 };
}

export type DoorChoice = "open" | "leave" | "ignore";

/** What the peephole shows. With the paid channel the fake is obvious. */
export function peep(run: RunState, fake: boolean): { text: string; kind: "courier" | "fake" | "unclear" } {
  const unclear = { text: tr("Кур'єр у куртці без логотипа. Пакет у руці. Обличчя не видно.", "A courier in a jacket with no logo. A bag in his hand. You can't see his face."), kind: "unclear" as const };
  if (!fake) {
    // some real couriers look wrong too: that is the point
    if (!has(run, "buschat") && rnd(run) < 0.2 + yearIndex(run) * 0.05) return unclear;
    return { text: pick(run, tr(["Кур'єр у жовтій куртці, з термосумкою. Дивиться в телефон.", "Кур'єр у зеленому. Молодий, втомлений. Пакет у руці."], ["A courier in a yellow jacket, with a thermal bag. Looking at his phone.", "A courier in green. Young, tired. A bag in his hand."])), kind: "courier" };
  }
  if (has(run, "buschat") || rnd(run) < 0.55) return { text: tr("Чоловік у кепці. Сумки немає. Пакет тримає якось не так. За ним на сходах — ще хтось.", "A man in a cap. No bag. He's holding the package wrong somehow. Someone else is behind him on the stairs."), kind: "fake" };
  return unclear;
}

export function resolveDelivery(run: RunState, fake: boolean, volunteer: boolean, choice: DoorChoice): Outcome {
  const d = run.day!;
  const p0 = run.psyche;
  if (volunteer) {
    (d.used as Record<string, number>).__vol = 1;
    run.food += 2;
    addPsyche(run, 4);
    return { text: tr("Волонтерка залишила пакет і написала: «Тримайся, котику». Гречка, консерви, мандарини.", "The volunteer left a bag and texted: “Hang in there, sweetie.” Buckwheat, tins, tangerines."), dPsyche: run.psyche - p0, food: 2 };
  }
  if (fake) {
    if (choice === "open") return { text: tr("Ти відчинив. Пакета немає. Є рука, що тримає двері.", "You opened. There is no bag. There is a hand holding the door."), dPsyche: 0 };
    addPsyche(run, -5);
    run.heat = clamp(run.heat + 6, 0, 100);
    // the real courier comes later; refund nothing now
    return { text: choice === "ignore" ? tr("Постукали, постояли. Пішли. Через пів години — справжній кур'єр.", "They knocked, waited. Left. Half an hour later — the real courier.") : tr("«Під дверима не можемо, треба розписатися». Голос чомусь не кур'єрський. Пішов.", "“Can't leave it at the door, you need to sign.” The voice doesn't sound like a courier somehow. He left."), dPsyche: run.psyche - p0 };
  }
  run.stats.deliveries++;
  if (choice === "ignore") {
    addPsyche(run, -2);
    return { text: tr("Ти не відчинив навіть справжньому кур'єру. Він поставив пакет і поїхав. Ти забрав його через годину.", "You didn't open even for the real courier. He left the bag and drove off. You took it in an hour later."), dPsyche: run.psyche - p0, food: 3 };
  }
  if (choice === "leave") {
    if (yearIndex(run) >= 2 && rnd(run) < 0.12) {
      run.money += orderCost(run);
      addPsyche(run, -4);
      return { text: tr("Кур'єр відмовився лишати під дверима і поїхав. Гроші повернули. Їжі немає.", "The courier refused to leave it at the door and drove off. Money refunded. No food."), dPsyche: run.psyche - p0, food: 0 };
    }
    run.food += 3;
    addPsyche(run, 1);
    return { text: tr("Пакет під дверима. Ти почекав, поки стихне ліфт, і швидко забрав.", "The bag is at the door. You waited for the lift to go quiet and grabbed it fast."), dPsyche: run.psyche - p0, food: 3 };
  }
  run.food += 3;
  run.heat = clamp(run.heat + 3, 0, 100);
  addPsyche(run, 4);
  return { text: tr("Ти відчинив. Кур'єр сказав «смачного» і посміхнувся. Перша жива людина за місяць. Ти стоїш у коридорі ще хвилину.", "You opened. The courier said “enjoy” and smiled. The first living person in a month. You stand in the hallway another minute."), dPsyche: run.psyche - p0, food: 3 };
}

/** You opened the door to the wrong people and tried to slam it. */
export function resolveSlam(run: RunState, ok: boolean): Outcome {
  if (!ok) { run.ending = "bus"; return { text: ENDINGS.bus.text, dPsyche: 0, ending: "bus" }; }
  const p0 = run.psyche;
  addPsyche(run, -16);
  run.heat = clamp(run.heat + 28, 0, 100);
  run.day!.exposed = true;
  return { text: tr("Ти зачинив двері всім тілом. Замок, ланцюжок, ще замок. Вони гупали десять хвилин. Ти сидів на підлозі, і в тебе стукотіли зуби.", "You shut the door with your whole body. Lock, chain, another lock. They pounded for ten minutes. You sat on the floor, your teeth chattering."), dPsyche: run.psyche - p0 };
}

export function resolveMom(run: RunState, answer: boolean): Outcome {
  const p0 = run.psyche;
  if (!answer) { addPsyche(run, -3); return { text: tr("Ти не взяв. Вона написала: «Ти живий? Відпиши хоч смайлик». Ти відписав смайлик.", "You didn't pick up. She wrote: “Are you alive? Send at least a smiley.” You sent a smiley."), dPsyche: run.psyche - p0 }; }
  run.day!.clock += 25;
  addPsyche(run, 5);
  return { text: pick(run, tr(["Мама каже, що молиться за тебе щоранку. Ти кажеш, що все добре.", "Мама надиктувала рецепт борщу. Ти записав, хоча буряка немає."], ["Mom says she prays for you every morning. You say everything's fine.", "Mom dictated her borscht recipe. You wrote it down, though there are no beets."])), dPsyche: run.psyche - p0 };
}

export function resolveNeighbor(run: RunState, answer: "polite" | "silent"): Outcome {
  const p0 = run.psyche;
  if (answer === "polite") {
    if (rnd(run) < 0.3 + yearIndex(run) * 0.1) {
      run.heat = clamp(run.heat + 10, 0, 100);
      addPsyche(run, -5);
      return { text: tr("«А ви чого не на роботі? Молодий же». Вона довго дивиться на тебе в щілину. Ти знаєш, що вона розповість.", "“And why aren't you at work? You're young.” She looks at you through the gap for a long time. You know she'll tell."), dPsyche: run.psyche - p0 };
    }
    addPsyche(run, 3);
    return { text: tr("Сусідка питає, чи є в тебе світло. Ви говорите через двері про графіки. Звичайна розмова. Ти й забув, як це.", "The neighbour asks if you have power. You talk through the door about schedules. An ordinary conversation. You'd forgotten what that's like."), dPsyche: run.psyche - p0 };
  }
  addPsyche(run, -2);
  return { text: tr("Ти не відповів. Вона постукала ще раз і сказала комусь на сходах: «Там хтось живе, я чула».", "You didn't answer. She knocked again and said to someone on the stairs: “Someone lives there, I heard.”"), dPsyche: run.psyche - p0 };
}

// ------------------------------------------------------------------ answering friends

export type ReplyKind = "warm" | "emoji" | "music";

/** How you can answer a friend's message (nothing, if it was answered or he can't read it). */
export function replyOptions(run: RunState, m: Msg): ReplyKind[] {
  if (m.friend == null || m.replied) return [];
  const f = run.friends[m.friend];
  if (!f || !reachable(f)) return [];
  const out: ReplyKind[] = ["warm", "emoji"];
  if (f.state === "front" || f.state === "volunteered" || f.state === "wounded") out.splice(1, 0, "music");
  return out;
}

/** You answer a friend. Warm words take time and bring an answer back later in the day. */
export function replyFriend(run: RunState, m: Msg, kind: ReplyKind): Outcome {
  const d = run.day!;
  const p0 = run.psyche;
  if (!replyOptions(run, m).includes(kind)) return { text: "", dPsyche: 0 };
  const f = run.friends[m.friend!];
  m.replied = true;
  d.phone = Math.max(0, d.phone - 2);
  let text: string;
  if (kind === "emoji") {
    setBond(f, bondOf(f) + 3);
    addPsyche(run, 1);
    d.clock += 1;
    text = tr(`Ти відписав ${nameOf(f)} смайликом. Краще, ніж нічого.`, `You sent ${nameOf(f)} a smiley. Better than nothing.`);
  } else {
    const music = kind === "music";
    setBond(f, bondOf(f) + (music ? 15 : 12));
    addPsyche(run, music ? 3 : 4);
    d.clock += music ? 10 : 15;
    text = music
      ? tr(`Ти довго вибирав пісні для ${accOf(f)}. Ті, під які ви колись їхали на дачу.`, `You took ages choosing songs for ${nameOf(f)}. The ones you used to drive to the dacha to.`)
      : tr(`Ти написав ${nameOf(f)} по-справжньому — не «норм», а як є. Стало легше обом.`, `You wrote to ${nameOf(f)} for real — not “fine”, but how it is. It got easier for both of you.`);
    const back = REPLY_BACK[f.state];
    if (back?.length) {
      const at = d.clock + Math.round(between(run, 25, 80));
      d.plan.push({ at, kind: "msg", msg: { kind: "friend", from: nameOf(f), text: pick(run, back), at, replied: true } });
      d.plan.sort((a, b) => a.at - b.at);
    }
  }
  return { text, dPsyche: run.psyche - p0 };
}

// ------------------------------------------------------------------ steps on the stairs

export type Visitor = "tck" | "police" | "neighbor" | "phantom";
export type StepRead = "right" | "wrong" | "none";

/** Before a knock: you listen to the steps and guess who it is. */
export function readSteps(who: Visitor, guess: Visitor | null): StepRead {
  if (!guess) return "none";
  return guess === who ? "right" : "wrong";
}

// ------------------------------------------------------------------ the memory

/** You look at the photo from Kozyn long enough to be there again. */
export function remember(run: RunState): ActionResult {
  const d = run.day!;
  const p0 = run.psyche;
  d.used.photos = (d.used.photos ?? 0) + 1;
  d.clock += 30;
  const dead = run.friends.filter((f) => f.state === "dead").length;
  const gone = run.friends.filter((f) => f.state !== "free" && f.state !== "hiding").length;
  addPsyche(run, 7 - dead * 2.5);
  const text = dead
    ? tr("Ти був там пів години. Пахло димом і річкою. Потім фото знову стало фото — з чорною стрічкою на одному обличчі. У спогаді він ще сміється.", "You were there for half an hour. It smelled of smoke and the river. Then the photo became a photo again — with a black ribbon on one face. In the memory he's still laughing.")
    : gone >= 3
      ? tr("Ти був там пів години. Всі п'ятеро, всі живі, всі разом. Тепер ви в різних країнах, окопах і квартирах.", "You were there for half an hour. All five of you, alive, together. Now you're in different countries, trenches and flats.")
      : tr("Ти був там пів години. Пахло димом і річкою, і ніхто нікуди не поспішав. Найкращий день.", "You were there for half an hour. It smelled of smoke and the river, and nobody was in a hurry. The best day.");
  return { id: "photos", text, dPsyche: run.psyche - p0 };
}

// ------------------------------------------------------------------ decisions that end a run

export type OfferId = "enlist" | "tisza";
export function tiszaCost(): number { return 90000; }

/** A decision waiting for you this morning, if any. */
export function pendingOffer(run: RunState): OfferId | null {
  if (run.flags.offerEnlist === 1) return "enlist";
  if (run.flags.offerTisza === 1) return "tisza";
  return null;
}

/** You decide. Yes ends the run (one way or another); no lets it pass. */
export function takeOffer(run: RunState, id: OfferId, yes: boolean): Outcome {
  const p0 = run.psyche;
  if (id === "enlist") run.flags.offerEnlist = 2;
  else run.flags.offerTisza = 2;
  if (!yes) {
    addPsyche(run, -2);
    return {
      text: id === "enlist"
        ? tr("Ти зняв куртку і повісив назад. Ще ні. Може, ніколи. Ти не знаєш, чи це правильно — і ніхто не знає.", "You took off the jacket and hung it back up. Not yet. Maybe never. You don't know if it's right — nobody does.")
        : tr("Ти видалив номер. Гроші лежать, де лежали. Вночі тобі сниться ріка.", "You deleted the number. The money stays where it was. At night you dream of a river."),
      dPsyche: run.psyche - p0,
    };
  }
  if (id === "enlist") { run.ending = "enlist"; return { text: ENDINGS.enlist.text, dPsyche: 0, ending: "enlist" }; }
  run.money -= tiszaCost();
  const crossed = rnd(run) < 0.55;
  run.ending = crossed ? "tisza" : "border";
  return { text: ENDINGS[run.ending].text, dPsyche: 0, ending: run.ending };
}

// ------------------------------------------------------------------ night: the day becomes a season

export interface SeasonReport {
  title: string;
  lines: string[];
  news: Msg[];
  dPsyche: number;
  dMoney: number;
  ending: EndingId | null;
  offer: PerkId[];
}

export function endDay(run: RunState): SeasonReport {
  const d = run.day!;
  if (d.busy) interruptAction(run);
  const yd = yearOf(run.season);
  const lines: string[] = [];
  const news: Msg[] = [];
  const title = seasonName(run.season);
  const pStart = run.psyche;

  if (d.doom > 0) {
    addPsyche(run, -3 * d.doom);
    lines.push(d.doom > 1 ? tr("Ти гортав новини до третьої ночі.", "You scrolled the news until three in the morning.") : tr("Перед сном — ще трохи новин.", "Before sleep — a little more news."));
  }
  if (d.clock < 20 * 60) {
    run.apathy = clamp(run.apathy + 6, 0, 100);
    lines.push(tr(`Ліг о ${clockText(d.clock)}. День просто закінчився раніше.`, `In bed at ${clockText(d.clock)}. The day just ended earlier.`));
  }
  const dayNet = run.psyche - d.start;
  // stretch the day over ~90 days
  let shift = Math.round(dayNet * 0.45) - yd.pressure - run.apathy * 0.07;
  if (run.clutter > 6) { shift -= 3; lines.push(tr("Квартира заростає пакетами. Ти перестав їх помічати.", "The flat is overgrown with bags. You've stopped noticing them.")); }
  if (run.body < 30) { shift -= 3; lines.push(tr("Спина болить. Сходи до холодильника — вже кардіо.", "Your back hurts. The walk to the fridge is cardio now.")); }
  if (has(run, "meds")) shift += 4;
  if (has(run, "cat")) shift += 2;
  // friends: silence wears a friendship down, answers hold it up
  for (const m of d.msgs) {
    if (m.friend != null && !m.replied && run.friends[m.friend]) setBond(run.friends[m.friend], bondOf(run.friends[m.friend]) - 6);
  }
  const close = run.friends.filter((f) => reachable(f) && bondOf(f) >= 70);
  if (close.length) {
    shift += Math.min(3, close.length);
    lines.push(close.length > 1
      ? tr(`${close.map(nameOf).join(" і ")} пишуть майже щодня. Це тримає.`, `${close.map(nameOf).join(" and ")} write almost every day. It holds you up.`)
      : tr(`${nameOf(close[0])} пише майже щодня. Це тримає.`, `${nameOf(close[0])} writes almost every day. It holds you up.`));
  }
  run.friends.forEach((f, i) => {
    if (reachable(f) && bondOf(f) < 25 && !run.flags[`quiet${i}`]) {
      run.flags[`quiet${i}`] = 1;
      lines.push(tr(`${nameOf(f)} перестав писати. Ти теж.`, `${nameOf(f)} stopped writing. So did you.`));
    }
    if (f.state === "abroad" && bondOf(f) >= 70 && !run.flags[`sent${i}`]) {
      run.flags[`sent${i}`] = 1;
      run.money += 5000;
      lines.push(tr(`${nameOf(f)} переказав 5 000 ₴ з Варшави: «на каву, якої ми не вип'ємо».`, `${nameOf(f)} sent 5,000 ₴ from Warsaw: “for the coffee we won't drink”.`));
    }
  });
  addPsyche(run, Math.min(shift, 8));
  if (dayNet >= 0) lines.push(tr("Цей день був стерпним. Таких у сезоні було багато.", "This day was bearable. There were many like it this season."));
  else if (dayNet > -10) lines.push(tr("Ще девʼяносто таких днів. Вони злилися в один.", "Ninety more days like this. They merged into one."));
  else lines.push(tr("Девʼяносто днів, як цей. Ти памʼятаєш тільки стелю.", "Ninety days like this one. You only remember the ceiling."));

  // money
  const income = Math.round(d.earned * 26) + trait(run).support;
  const costs = Math.round(33000 * yd.prices);
  const m0 = run.money;
  run.money += income - costs;
  lines.push(tr(`Заробив за сезон ${fmt(income)}, комуналка й їжа — ${fmt(costs)}.`, `Earned this season: ${fmt(income)}. Bills and food: ${fmt(costs)}.`));
  if (run.money < 0) {
    addPsyche(run, run.money < -40000 ? -15 : -8);
    lines.push(run.money < -40000 ? tr("Борги. Мама продала золоті сережки бабусі. Вона сказала, що не носила їх.", "Debts. Mom sold grandma's gold earrings. She said she never wore them.") : tr("Не вистачило на комуналку. Мама переказала гроші, і від цього ще гірше.", "Not enough for the bills. Mom sent money, and that makes it worse."));
  }
  // the plant
  if (!d.used.water_plant) {
    run.plant = clamp(run.plant - 35, 0, 100);
    if (run.plant <= 0 && !run.flags.plantDead) { run.flags.plantDead = 1; addPsyche(run, -8); lines.push(tr("Фікус засох. Ти довго не викидав його. Його теж не можна винести.", "The ficus dried out. You didn't throw it away for a long time. You can't take it out either.")); }
    else if (run.plant < 40 && !run.flags.plantDead) lines.push(tr("Фікус скинув листя. Ти забуваєш його поливати.", "The ficus dropped its leaves. You keep forgetting to water it."));
  } else if (!run.flags.plantDead) run.plant = clamp(run.plant + 10, 0, 100);
  // body, apathy, clutter, heat
  if (!d.used.exercise) run.body = clamp(run.body - 12, 0, 100);
  run.apathy = clamp(run.apathy + 2 + (d.used.stare ?? 0) * 2 - (d.used.exercise ? 4 : 0), 0, 100);
  run.clutter += 1 + Math.min(2, d.deliveries);
  run.heat = clamp(run.heat + yd.heat - (d.exposed ? 0 : 6), 0, 100);
  if (run.heat >= 60 && !run.flags.heatWarned) { run.flags.heatWarned = 1; lines.push(tr("Тебе внесли в базу «розшук». Сусідка розповідає це всім у підʼїзді.", "You've been put on the “wanted” list. The neighbour is telling everyone in the building.")); }
  // friends
  for (const f of run.friends) {
    while (f.arc.length && f.arc[0][0] <= run.season) {
      const [, st] = f.arc.shift()!;
      f.state = st;
      const tpl = FRIEND_NEWS[st];
      if (tpl.length) {
        let text = pick(run, tpl).replace("{n}", nameOf(f)).replace("{a}", accOf(f));
        if (st === "dead" && bondOf(f) >= 70) text += tr(" Останнє повідомлення в чаті — від нього: «тримайся там».", " The last message in the chat is from him: “hang in there”.");
        news.push({ kind: "friend", from: `${nameOf(f)}, ${roleOf(f)}`, text, at: 0 });
        // the closer you were, the harder it hits
        const imp = FRIEND_IMPACT[st];
        addPsyche(run, imp < 0 ? imp * (0.5 + bondOf(f) / 120) : imp);
        run.flags[`fate_${st}`] = 1;
        if (st === "dead") {
          run.stats.lost++;
          if (bondOf(f) >= 55 && !run.flags.offerEnlist) run.flags.offerEnlist = 1;
        }
      }
    }
  }
  // the night that ends the season
  d.nightAlert = rnd(run) < yd.alert * 0.5;
  run.daysInside += run.season % 4 === 0 ? 90 : 92;
  run.history.push(Math.round(run.psyche));

  const dPsyche = run.psyche - pStart;
  let ending: EndingId | null = run.ending;
  if (!ending && run.psyche <= 0) ending = "zryv";
  if (!ending && run.apathy >= 95) ending = "faded";
  run.season++;
  if (!ending && run.season >= SEASONS) {
    const close = run.friends.filter((f) => reachable(f) && bondOf(f) >= 70).length;
    ending = close >= 2 ? "together" : "survived";
  }
  // someone abroad knows a man who takes people across the river
  if (!ending && !run.flags.offerTisza && run.season >= 8 && run.money >= tiszaCost() && run.friends.some((f) => f.state === "abroad" && bondOf(f) >= 50)) {
    run.flags.offerTisza = 1;
  }
  run.ending = ending;
  const offer = ending ? [] : offerPerks(run);
  run.offer = offer;
  return { title, lines, news, dPsyche, dMoney: run.money - m0, ending, offer };
}

function offerPerks(run: RunState): PerkId[] {
  const pool = PERKS.filter((p) => !run.perks.includes(p.id) && (p.from ?? 0) <= run.season).map((p) => p.id);
  const out: PerkId[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd(run) * pool.length), 1)[0]);
  return out;
}

/** Picks what helped (or nothing) and starts the next season's day. */
export function choosePerk(run: RunState, id: PerkId | null): void {
  if (id && run.offer.includes(id) && !run.perks.includes(id)) run.perks.push(id);
  run.offer = [];
  startDay(run);
}

// ------------------------------------------------------------------ meta

export function runXp(run: RunState): number { return run.history.length; }
export function unlockedTraits(totalSeasons: number): TraitId[] {
  return TRAITS.filter((t) => t.unlock <= totalSeasons).map((t) => t.id);
}

/** 0 = fine … 1 = breaking: drives the visual and sound distortion. */
export function despair(run: RunState): number {
  return clamp((60 - run.psyche) / 55, 0, 1);
}
