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
  ACTIONS, DOOR_LINES, ENDINGS, FRIEND_ACC, FRIEND_ARCS, FRIEND_IMPACT, FRIEND_NAMES, FRIEND_NEWS, FRIEND_ROLES, MIRROR_LINES,
  PERKS, SEASONS, SEASON_DEFS, TRAITS, WINDOW_LINES, actionById, seasonName, yearOf,
  type ActionDef, type ActionId, type EndingId, type FriendState, type PerkId, type PlaceId, type TraitId,
} from "./content.ts";

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

export const fmt = (n: number) => `${Math.round(n).toLocaleString("uk-UA").replace(/ /g, " ")} ₴`;
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
}

export type MsgKind = "chat" | "bus" | "friend" | "mom" | "news" | "sys";
export interface Msg { kind: MsgKind; from: string; text: string; at: number }

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

export function newRun(seed: number, traitId: TraitId = "it"): RunState {
  const t = TRAITS.find((x) => x.id === traitId) ?? TRAITS[0];
  const run: RunState = {
    v: 1, seed, rng: seed * 7919 + 13, trait: t.id, season: 0,
    psyche: t.psyche, energy: 80, satiety: 60, food: 3, money: t.money, apathy: 10, body: 60, heat: 8, clutter: 1, plant: 80,
    station: 0, daysInside: 290, perks: t.perk ? [t.perk] : [], friends: [], day: null, ending: null, history: [],
    stats: { alerts: 0, knocks: 0, deliveries: 0, worked: 0, lost: 0 }, offer: [], flags: {},
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
      arc: arc.map(([off, s]) => [Math.min(SEASONS - 1, startAt + off), s]), color: FRIEND_COLORS[k % FRIEND_COLORS.length],
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
const SPOTS = ["біля АТБ", "біля метро", "на зупинці", "біля Сільпо", "у дворі на Драгоманова", "біля школи", "на розворотці", "біля аптеки"];

export function startDay(run: RunState): void {
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
    nightAlert: false, glass: false, powerWasOn: true, waterWasOn: true, phantomHour: 8,
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
    const text = `🚐 ${pick(run, DISTRICTS)}, ${pick(run, SPOTS)}${rnd(run) < 0.4 ? ", пакують усіх" : rnd(run) < 0.5 ? ", два буси" : ""}`;
    plan.push({ at, kind: "msg", msg: { kind: "bus", from: "Де бус? · Київ", text, at } });
  }
  if (bus) {
    plan.push({ at: bus[0] + 5, kind: "msg", msg: { kind: "bus", from: "Чат будинку", text: "Біля нашого підʼїзду бус!!! Чоловіки, не виходьте", at: bus[0] + 5 } });
  }
  for (const f of run.friends) {
    const at = Math.round(between(run, 9, 22) * 4) * 15;
    const line = friendChatter(run, f);
    if (line && rnd(run) < 0.6) plan.push({ at, kind: "msg", msg: { kind: "friend", from: f.name, text: line, at } });
  }
  plan.sort((a, b) => a.at - b.at);

  // the morning
  msg(run, "sys", "Ранок", `${seasonName(run.season)}. День ${run.daysInside.toLocaleString("uk-UA")} без вулиці.`);
  if (nightAlert) msg(run, "sys", "Ніч", "Вночі була тривога. Ти заснув о пʼятій.");
  if (blackouts.length) msg(run, "chat", "ДТЕК", `Графік на сьогодні: ${blackouts.map(([a, b]) => `${clockText(a)}–${clockText(b)}`).join(", ")} без світла.`);
  if (waterOff.length) msg(run, "chat", "Чат будинку", `Води не буде ${clockText(waterOff[0][0])}–${clockText(waterOff[0][1])}. Набирайте.`);
  if (d.knowsBus) msg(run, "bus", "Де бус · канал", bus ? `Ваш двір: бус приїде близько ${clockText(bus[0])}.` : "Ваш двір: сьогодні тихо.");
}

function friendChatter(run: RunState, f: Friend): string | null {
  switch (f.state) {
    case "free": return pick(run, ["го на каву в суботу? всі будуть", "скинув фото з концерту, шкода що тебе нема", "ти живий? давно не чути"]);
    case "hiding": return pick(run, ["ти як? я вже з квартири не виходжу взагалі", "в нас бус третій день стоїть. тримайся", "дивлюсь у стелю. смішно, правда?"]);
    case "abroad": return pick(run, ["тут все дороге і все чуже", "сьогодні сниться Київ", "мама питає, чи ти виходиш. що їй сказати?"]);
    case "front": case "volunteered": return pick(run, ["живий", "на звʼязку буду через тиждень", "не переживай за мене. сам тримайся", "пришли якусь музику, тут тихо і страшно"]);
    case "wounded": return pick(run, ["вже ходжу з паличкою", "в шпиталі нудно. пиши щось"]);
    case "home": return pick(run, ["приходь, посидимо. а, ну так", "не знаю, як тепер жити звичайно"]);
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
  if (d.busy) return { ok: false, why: "Зайнятий" };
  if (def.once && (d.used[def.id] ?? 0) >= 1) return { ok: false, why: "Сьогодні вже" };
  if (def.minutes > 0 && d.clock + def.minutes > DAY_END + 30) return { ok: false, why: "Вже ніч" };
  if ((def.fx.energy ?? 0) < 0 && run.energy < 8) return { ok: false, why: "Немає сил" };
  if (def.place === "phone" && d.phone < 5) return { ok: false, why: "Телефон сів" };
  if (def.fx.food && run.food < -def.fx.food) return { ok: false, why: "Нема їжі" };
  if (def.water && !hasWater(d)) {
    if (!(def.id === "water_plant" && has(run, "bottles"))) return { ok: false, why: "Немає води" };
  }
  if (def.power && !isLight(d)) {
    if (def.id === "cook") return { ok: false, why: "Немає світла" };
    if (!(has(run, "station") && run.station >= 25)) return { ok: false, why: "Немає світла" };
  }
  if (def.id === "therapy" && run.money < 1200 * yearOf(run.season).prices) return { ok: false, why: "Немає грошей" };
  if (def.id === "order") {
    if (run.money < orderCost(run)) return { ok: false, why: "Немає грошей" };
    if (d.plan.some((p) => p.kind === "delivery" && !p.done && !p.fake && p.at > d.clock)) return { ok: false, why: "Вже їде" };
  }
  if (def.id === "shelter" && !d.alert) return { ok: false, why: "Тривоги немає" };
  if ((def.id === "balcony" || def.id === "air") && d.alert) return { ok: false, why: "Тривога" };
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
  view?: "people" | "empty" | "bus" | "night";
  /** Ends the day / run. */
  endDay?: boolean;
  ending?: EndingId;
}

/** Starts a timed action. Returns why not, or null when started. */
export function beginAction(run: RunState, id: ActionId, score = 1): string | null {
  const def = actionById(id);
  const c = check(run, def);
  if (!c.ok) return c.why ?? "Не можна";
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
      r.text = score > 0.8 ? "Все закрив. Хоч щось під контролем." : score > 0.4 ? "Щось зробив. Голова як вата." : "Дивився в екран три години.";
      if (y >= 2 && rnd(run) < 0.2) { ps -= 3; r.text += " Клієнт написав, що «переглядає бюджети»."; }
      break;
    }
    case "look": {
      const view = isNight(d) || (!isLight(d) && winter(run) && d.clock > 16 * 60) ? "night" : busHere(d) ? "bus" : y === 0 || (y === 1 && !winter(run)) ? "people" : "empty";
      r.view = view;
      r.text = pick(run, WINDOW_LINES[view]);
      ps = view === "people" ? 3 : view === "bus" ? -6 : view === "empty" ? -1 : 0;
      if (view === "bus") d.knowsBus = true;
      else if (view !== "night") d.knowsBus = true;
      break;
    }
    case "balcony": {
      if (busHere(d)) {
        ps = -7;
        run.heat = clamp(run.heat + 18, 0, 100);
        d.exposed = true;
        d.knowsBus = true;
        r.text = "Внизу бус. Один з них підняв голову. Ти присів за перила і так сидів, доки не затерпли ноги.";
      } else {
        ps = winter(run) ? 3 : run.season % 4 === 2 ? 8 : 6;
        r.text = winter(run) ? "Морозне повітря. Пара з рота. Ти рахуєш вдихи." : "Сонце на обличчі. На пʼять хвилин ти забув.";
      }
      break;
    }
    case "tomatoes": {
      if (run.season % 4 !== 0 && rnd(run) < 0.5) { run.food += 1; r.text = "Достиг помідор. Ти зʼїв його прямо на балконі."; }
      else r.text = "Листя пахне літом.";
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
      r.text = busHere(d) && d.knowsBus ? "Сходи порожні. Знизу гупають двері підʼїзду. Кожен раз — як постріл." : pick(run, ["Сходи порожні. Лампочка блимає.", "Сусідка з восьмої миє підлогу.", "Нікого. Пахне чужим борщем."]);
      break;
    }
    case "photos": {
      const dead = run.friends.filter((f) => f.state === "dead").length;
      const gone = run.friends.filter((f) => f.state !== "free" && f.state !== "hiding").length;
      ps = dead ? -3 : gone >= 3 ? -1 : 3;
      r.text = dead ? "На фото ви всі пʼятеро. На одному обличчі тепер чорна стрічка." : gone ? "Ви всі пʼятеро на дачі в Козині. Тепер ви всі в різних місцях." : "Ви всі пʼятеро на дачі в Козині. Шашлик підгорів. Найкращий день.";
      break;
    }
    case "calendar": {
      r.text = `Закреслив. ${run.daysInside.toLocaleString("uk-UA")}-й.`;
      break;
    }
    case "friends": {
      const reach = run.friends.filter((f) => ["free", "hiding", "abroad", "front", "home", "wounded", "volunteered"].includes(f.state)).length;
      const dead = run.friends.find((f) => f.state === "dead" && !f.mourned);
      if (dead) {
        dead.mourned = true;
        ps = -6;
        r.text = `Ти за звичкою відкрив чат «${dead.name}». Останнє повідомлення — твоє. Не прочитане.`;
      } else if (reach === 0) {
        ps = -4;
        r.text = "Тобі нікому писати.";
      } else {
        ps = Math.min(8, 2 * reach);
        r.text = reach >= 4 ? "Ви годину скидали один одному меми. Майже як раніше." : "Відповіли не всі. Ті, хто відповів — коротко.";
      }
      break;
    }
    case "mom": {
      if (y >= 2 && rnd(run) < 0.5) { ps = 1; r.text = "Мама питає, чи не краще «піти офіційно». Ви сваритесь, потім вона плаче. Ти теж."; }
      else r.text = pick(run, ["Мама розповідає про кота сусідки і про ціни. Ти слухаєш її голос, не слова.", "«Ти там їси? Голос у тебе якийсь не такий». — «Все добре, мам»."]);
      break;
    }
    case "chat": {
      d.knowsBus = true;
      r.text = busHere(d) ? "У чаті будинку: бус біля підʼїзду. Ніхто не виходить." : d.bus && d.clock < d.bus[0] ? "Твій двір поки чистий. Пишуть, що на сусідній вулиці пакують." : "Твій двір сьогодні чистий. Поки що.";
      break;
    }
    case "news": {
      d.doom++;
      r.text = pick(run, ["Ще одна атака. Ще одна сторіз з обвалом підʼїзду. Ще одну.", "Переговори, заяви, мапи. Нічого не змінюється, але гортаєш далі.", "Коментарі про «ухилянтів». Ти читаєш усі."]);
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
      r.text = `Замовлено на ${fmt(cost)}. «Залиште під дверима, будь ласка».`;
      break;
    }
    case "shelter": {
      r.text = "Сидиш на підлозі в коридорі. Рахуєш вибухи.";
      break;
    }
    case "stare": {
      r.text = pick(run, ["Тріщина на стелі схожа на Дніпро.", "Дві години. Ти не памʼятаєш, про що думав.", "Сусіди зверху ходять. У них є куди."]);
      break;
    }
    case "drink": {
      r.text = "Тепло в грудях. Стіни відступають. На годину.";
      break;
    }
    case "pet": {
      r.text = "Кіт муркоче і бʼє лапою по руці. Він не знає, що ти ховаєшся. Для нього ти просто вдома.";
      break;
    }
    case "tidy": {
      r.text = run.clutter >= 5 ? `Склав сміття в пакети. Пакетів у коридорі: ${run.clutter + 4}. Винести не можна.` : "Чисто. Майже як у людей.";
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
    msg(run, "sys", "Кухня", "Вибуховою хвилею вибило скло на кухні. Ти заклеїв плівкою. Тепер там гуляє вітер.");
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
      if (p.msg.from === "Чат будинку") d.knowsBus = true;
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
    return { text: "Ти встиг. Сидиш між двох стін, вуха закладає. Десь недалеко.", dPsyche: run.psyche - p0 };
  }
  if (rnd(run) < 0.05 + yearIndex(run) * 0.015) {
    run.ending = "strike";
    return { text: ENDINGS.strike.text, dPsyche: 0, ending: "strike" };
  }
  addPsyche(run, has(run, "headphones") ? -7 : -12);
  if (!d.glass) { d.glass = true; run.clutter += 2; }
  d.alert = null;
  return { text: "Вибух так близько, що підлога підстрибнула. Скло на кухні — на підлозі. Ти живий. Руки трусяться годину.", dPsyche: run.psyche - p0 };
}

/** Holding your breath behind the door. `quiet` — they did not hear you. */
export function resolveKnock(run: RunState, who: "tck" | "police" | "neighbor" | "phantom", quiet: boolean): Outcome {
  const d = run.day!;
  const p0 = run.psyche;
  run.stats.knocks++;
  let text = "";
  if (who === "phantom") {
    addPsyche(run, -4);
    text = "Ти довго стояв біля дверей. Подивився в глазок. На сходах нікого не було. Нікого й не було.";
  } else if (who === "neighbor") {
    addPsyche(run, quiet ? -3 : -2);
    text = quiet ? "У глазок — сусідка з восьмої з тарілкою пиріжків. Постояла й пішла. Тобі соромно." : "«Синку, я ж чую, що ти вдома. Пиріжки під дверима». Ти відчинив через годину. Холодні. Найсмачніші за рік.";
    if (!quiet) run.food += 1;
  } else if (quiet) {
    addPsyche(run, who === "tck" ? -8 : -6);
    run.heat = clamp(run.heat + 4, 0, 100);
    text = who === "tck" ? "Стукали хвилин пʼять. Потім щось запхнули в щілину. Повістка. На твоє імʼя, з помилкою в прізвищі." : "Дільничний постукав, поговорив по телефону і пішов. «Квартира порожня, наче».";
  } else {
    addPsyche(run, -13);
    run.heat = clamp(run.heat + 20, 0, 100);
    d.exposed = true;
    text = "«Ми знаємо, що ви там». Ти не дихав, але вони чули. Постояли, пішли. Тепер вони знають.";
  }
  return { text, dPsyche: run.psyche - p0 };
}

export type DoorChoice = "open" | "leave" | "ignore";

/** What the peephole shows. With the paid channel the fake is obvious. */
export function peep(run: RunState, fake: boolean): { text: string; kind: "courier" | "fake" | "unclear" } {
  const unclear = { text: "Кур'єр у куртці без логотипа. Пакет у руці. Обличчя не видно.", kind: "unclear" as const };
  if (!fake) {
    // some real couriers look wrong too: that is the point
    if (!has(run, "buschat") && rnd(run) < 0.2 + yearIndex(run) * 0.05) return unclear;
    return { text: pick(run, ["Кур'єр у жовтій куртці, з термосумкою. Дивиться в телефон.", "Кур'єр у зеленому. Молодий, втомлений. Пакет у руці."]), kind: "courier" };
  }
  if (has(run, "buschat") || rnd(run) < 0.55) return { text: "Чоловік у кепці. Сумки немає. Пакет тримає якось не так. За ним на сходах — ще хтось.", kind: "fake" };
  return unclear;
}

export function resolveDelivery(run: RunState, fake: boolean, volunteer: boolean, choice: DoorChoice): Outcome {
  const d = run.day!;
  const p0 = run.psyche;
  if (volunteer) {
    (d.used as Record<string, number>).__vol = 1;
    run.food += 2;
    addPsyche(run, 4);
    return { text: "Волонтерка залишила пакет і написала: «Тримайся, котику». Гречка, консерви, мандарини.", dPsyche: run.psyche - p0, food: 2 };
  }
  if (fake) {
    if (choice === "open") return { text: "Ти відчинив. Пакета немає. Є рука, що тримає двері.", dPsyche: 0 };
    addPsyche(run, -5);
    run.heat = clamp(run.heat + 6, 0, 100);
    // the real courier comes later; refund nothing now
    return { text: choice === "ignore" ? "Постукали, постояли. Пішли. Через пів години — справжній кур'єр." : "«Під дверима не можемо, треба розписатися». Голос чомусь не кур'єрський. Пішов.", dPsyche: run.psyche - p0 };
  }
  run.stats.deliveries++;
  if (choice === "ignore") {
    addPsyche(run, -2);
    return { text: "Ти не відчинив навіть справжньому кур'єру. Він поставив пакет і поїхав. Ти забрав його через годину.", dPsyche: run.psyche - p0, food: 3 };
  }
  if (choice === "leave") {
    if (yearIndex(run) >= 2 && rnd(run) < 0.12) {
      run.money += orderCost(run);
      addPsyche(run, -4);
      return { text: "Кур'єр відмовився лишати під дверима і поїхав. Гроші повернули. Їжі немає.", dPsyche: run.psyche - p0, food: 0 };
    }
    run.food += 3;
    addPsyche(run, 1);
    return { text: "Пакет під дверима. Ти почекав, поки стихне ліфт, і швидко забрав.", dPsyche: run.psyche - p0, food: 3 };
  }
  run.food += 3;
  run.heat = clamp(run.heat + 3, 0, 100);
  addPsyche(run, 4);
  return { text: "Ти відчинив. Кур'єр сказав «смачного» і посміхнувся. Перша жива людина за місяць. Ти стоїш у коридорі ще хвилину.", dPsyche: run.psyche - p0, food: 3 };
}

/** You opened the door to the wrong people and tried to slam it. */
export function resolveSlam(run: RunState, ok: boolean): Outcome {
  if (!ok) { run.ending = "bus"; return { text: ENDINGS.bus.text, dPsyche: 0, ending: "bus" }; }
  const p0 = run.psyche;
  addPsyche(run, -16);
  run.heat = clamp(run.heat + 28, 0, 100);
  run.day!.exposed = true;
  return { text: "Ти зачинив двері всім тілом. Замок, ланцюжок, ще замок. Вони гупали десять хвилин. Ти сидів на підлозі, і в тебе стукотіли зуби.", dPsyche: run.psyche - p0 };
}

export function resolveMom(run: RunState, answer: boolean): Outcome {
  const p0 = run.psyche;
  if (!answer) { addPsyche(run, -3); return { text: "Ти не взяв. Вона написала: «Ти живий? Відпиши хоч смайлик». Ти відписав смайлик.", dPsyche: run.psyche - p0 }; }
  run.day!.clock += 25;
  addPsyche(run, 5);
  return { text: pick(run, ["Мама каже, що молиться за тебе щоранку. Ти кажеш, що все добре.", "Мама надиктувала рецепт борщу. Ти записав, хоча буряка немає."]), dPsyche: run.psyche - p0 };
}

export function resolveNeighbor(run: RunState, answer: "polite" | "silent"): Outcome {
  const p0 = run.psyche;
  if (answer === "polite") {
    if (rnd(run) < 0.3 + yearIndex(run) * 0.1) {
      run.heat = clamp(run.heat + 10, 0, 100);
      addPsyche(run, -5);
      return { text: "«А ви чого не на роботі? Молодий же». Вона довго дивиться на тебе в щілину. Ти знаєш, що вона розповість.", dPsyche: run.psyche - p0 };
    }
    addPsyche(run, 3);
    return { text: "Сусідка питає, чи є в тебе світло. Ви говорите через двері про графіки. Звичайна розмова. Ти й забув, як це.", dPsyche: run.psyche - p0 };
  }
  addPsyche(run, -2);
  return { text: "Ти не відповів. Вона постукала ще раз і сказала комусь на сходах: «Там хтось живе, я чула».", dPsyche: run.psyche - p0 };
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
    lines.push(d.doom > 1 ? "Ти гортав новини до третьої ночі." : "Перед сном — ще трохи новин.");
  }
  if (d.clock < 20 * 60) {
    run.apathy = clamp(run.apathy + 6, 0, 100);
    lines.push(`Ліг о ${clockText(d.clock)}. День просто закінчився раніше.`);
  }
  const dayNet = run.psyche - d.start;
  // stretch the day over ~90 days
  let shift = Math.round(dayNet * 0.45) - yd.pressure - run.apathy * 0.07;
  if (run.clutter > 6) { shift -= 3; lines.push("Квартира заростає пакетами. Ти перестав їх помічати."); }
  if (run.body < 30) { shift -= 3; lines.push("Спина болить. Сходи до холодильника — вже кардіо."); }
  if (has(run, "meds")) shift += 4;
  if (has(run, "cat")) shift += 2;
  addPsyche(run, Math.min(shift, 8));
  if (dayNet >= 0) lines.push("Цей день був стерпним. Таких у сезоні було багато.");
  else if (dayNet > -10) lines.push("Ще девʼяносто таких днів. Вони злилися в один.");
  else lines.push("Девʼяносто днів, як цей. Ти памʼятаєш тільки стелю.");

  // money
  const income = Math.round(d.earned * 26) + trait(run).support;
  const costs = Math.round(33000 * yd.prices);
  const m0 = run.money;
  run.money += income - costs;
  lines.push(`Заробив за сезон ${fmt(income)}, комуналка й їжа — ${fmt(costs)}.`);
  if (run.money < 0) {
    addPsyche(run, run.money < -40000 ? -15 : -8);
    lines.push(run.money < -40000 ? "Борги. Мама продала золоті сережки бабусі. Вона сказала, що не носила їх." : "Не вистачило на комуналку. Мама переказала гроші, і від цього ще гірше.");
  }
  // the plant
  if (!d.used.water_plant) {
    run.plant = clamp(run.plant - 35, 0, 100);
    if (run.plant <= 0 && !run.flags.plantDead) { run.flags.plantDead = 1; addPsyche(run, -8); lines.push("Фікус засох. Ти довго не викидав його. Його теж не можна винести."); }
    else if (run.plant < 40 && !run.flags.plantDead) lines.push("Фікус скинув листя. Ти забуваєш його поливати.");
  } else if (!run.flags.plantDead) run.plant = clamp(run.plant + 10, 0, 100);
  // body, apathy, clutter, heat
  if (!d.used.exercise) run.body = clamp(run.body - 12, 0, 100);
  run.apathy = clamp(run.apathy + 2 + (d.used.stare ?? 0) * 2 - (d.used.exercise ? 4 : 0), 0, 100);
  run.clutter += 1 + Math.min(2, d.deliveries);
  run.heat = clamp(run.heat + yd.heat - (d.exposed ? 0 : 6), 0, 100);
  if (run.heat >= 60 && !run.flags.heatWarned) { run.flags.heatWarned = 1; lines.push("Тебе внесли в базу «розшук». Сусідка розповідає це всім у підʼїзді."); }
  // friends
  for (const f of run.friends) {
    while (f.arc.length && f.arc[0][0] <= run.season) {
      const [, st] = f.arc.shift()!;
      f.state = st;
      const tpl = FRIEND_NEWS[st];
      if (tpl.length) {
        const text = pick(run, tpl).replace("{n}", f.name).replace("{a}", f.acc);
        news.push({ kind: "friend", from: `${f.name}, ${f.role}`, text, at: 0 });
        addPsyche(run, FRIEND_IMPACT[st]);
        if (st === "dead") run.stats.lost++;
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
  run.season++;
  if (!ending && run.season >= SEASONS) ending = "survived";
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
