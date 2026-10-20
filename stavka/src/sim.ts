/**
 * «Ставка» — the rules. Pure TypeScript, deterministic from the run's seed,
 * no DOM: the scene and the UI read this state and call these functions, the
 * tests drive it with a bot.
 *
 * A run is 16 weeks; every week is a day (decisions with a few hours to
 * spend), a night (a real-time wave of drones and missiles to shoot down),
 * a strike (a target, a weapon and a route in Russia or occupied land) and a
 * report (what changed, one perk out of three).
 */
import {
  AD, ADVISORS, ALLIES, ASKS, DECISIONS, DECOY, ENDINGS, FRONT, HOURS_PER_DAY, INTERCEPTOR, ISKANDER_SITES, KALIBR_SITES,
  KH101_SITES, KINZHAL_SITES, PERKS, SECTORS, SHAHED_SITES, THREATS, WEAPONS, WEEKS, ZONES, allyById, dist, km,
  sectorById, targetById,
  type AdKind, type AdvisorId, type AllyId, type AskId, type ConditionId, type DecisionDef, type Effect, type EndingId,
  type EnemyMod, type Km, type PerkId, type SectorId, type ThreatKind, type WeaponId,
} from "./content.ts";

// ================================================================ state

export interface SectorState { id: SectorId; power: number; hitsTonight: number }
export interface AdUnit { id: number; kind: AdKind; sector: SectorId; at: Km; ammo: number; cd: number; down: boolean; movedDay: number }
export interface AllyState { id: AllyId; trust: number; tolerance: number; temper: string; permissionUntil: number; pledge: { cond: ConditionId; until: number } | null }
export interface Mod { key: EnemyMod; value: number; until: number }
export interface Stock { liutyi: number; neptune: number; flamingo: number; storm: number; atacms: number; decoys: number; interceptors: number; patriotAmmo: number; samAmmo: number }
export interface WeekLog { week: number; launched: number; downed: number; impacts: number; strike: string; strikeHits: number; destroyed: boolean }
export interface Snapshot { budget: number; morale: number; power: number; escalation: number; front: number; trust: number }

export interface Offer { ally: AllyId; ask: AskId; cond: ConditionId; give: string; refused?: string }

export interface RunState {
  v: 1;
  seed: number;
  rng: number;
  week: number;
  phase: "day" | "night" | "strike" | "report" | "end";
  difficulty: number;
  advisor: AdvisorId;
  budget: number;
  morale: number;
  escalation: number;
  industry: number;
  sectors: SectorState[];
  front: number[];
  frontReserve: number;
  allies: AllyState[];
  ad: AdUnit[];
  stock: Stock;
  hours: number;
  decisions: string[];
  usedDecisions: string[];
  targets: Record<string, { damage: number; until: number }>;
  zones: Record<string, { known: boolean; weakUntil: number }>;
  mods: Mod[];
  perks: PerkId[];
  perkOffer: PerkId[];
  blackoutNights: number;
  history: WeekLog[];
  offer: Offer | null;
  ending: EndingId | null;
  score: number;
  stats: { downed: number; launched: number; impacts: number; strikes: number; destroyed: number };
  start: Snapshot;
  /** The last week's report lines. */
  report: string[];
  nextId: number;
}

// ================================================================ rng

/** mulberry32 on the run's own state, so a saved run replays the same. */
export function rand(run: { rng: number }): number {
  let t = (run.rng = (run.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(run: RunState, xs: readonly T[]): T => xs[Math.floor(rand(run) * xs.length)];
function weighted<T>(run: RunState, xs: readonly T[], w: (x: T) => number): T {
  const ws = xs.map(w);
  let r = rand(run) * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < xs.length; i++) { r -= ws[i]; if (r <= 0) return xs[i]; }
  return xs[xs.length - 1];
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const has = (run: RunState, p: PerkId) => run.perks.includes(p);

// ================================================================ new run

const at = (ll: readonly [number, number]) => km(ll[0], ll[1]);

function placeUnit(run: RunState, kind: AdKind, sector: SectorId): AdUnit {
  const s = sectorById(sector);
  const n = run.ad.filter((u) => u.sector === sector).length;
  const a = n * 2.1 + 0.6;
  const c = at(s.city);
  const u: AdUnit = { id: run.nextId++, kind, sector, at: { x: c.x + Math.cos(a) * (10 + n * 3), y: c.y + Math.sin(a) * (10 + n * 3) }, ammo: AD[kind].ammo, cd: 0, down: false, movedDay: 0 };
  run.ad.push(u);
  return u;
}

export function newRun(seed: number, advisor: AdvisorId = "general", difficulty = 0): RunState {
  const run: RunState = {
    v: 1, seed, rng: seed | 0, week: 1, phase: "day", difficulty: clamp(difficulty, 0, 3), advisor,
    budget: 1.6, morale: 72, escalation: 10, industry: 1,
    sectors: SECTORS.map((s) => ({ id: s.id, power: 100, hitsTonight: 0 })),
    front: FRONT.map(() => 0), frontReserve: 0,
    allies: ALLIES.map((a) => ({ id: a.id, trust: 58 - difficulty * 5 + (a.id === "uk" || a.id === "pl" ? 6 : 0), tolerance: a.tolerance, temper: a.temper, permissionUntil: 0, pledge: null })),
    ad: [],
    stock: { liutyi: 12, neptune: 1, flamingo: 0, storm: 2, atacms: 0, decoys: 6, interceptors: 20, patriotAmmo: 12, samAmmo: 18 },
    hours: HOURS_PER_DAY, decisions: [], usedDecisions: [],
    targets: {}, zones: Object.fromEntries(ZONES.map((z) => [z.id, { known: difficulty >= 3 ? false : z.known, weakUntil: 0 }])),
    mods: [], perks: [], perkOffer: [], blackoutNights: 0, history: [], offer: null, ending: null, score: 0,
    stats: { downed: 0, launched: 0, impacts: 0, strikes: 0, destroyed: 0 },
    start: { budget: 0, morale: 0, power: 0, escalation: 0, front: 0, trust: 0 },
    report: [], nextId: 1,
  };
  placeUnit(run, "patriot", "kyiv");
  placeUnit(run, "irist", "dnipro");
  placeUnit(run, "nasams", "odesa");
  placeUnit(run, "gepard", "poltava");
  placeUnit(run, "gepard", "zaporizhzhia");
  for (const s of ["sumy", "kharkiv", "chernihiv", "kyiv"] as SectorId[]) placeUnit(run, "mobile", s);
  if (advisor === "general") { placeUnit(run, "irist", "kharkiv"); run.stock.patriotAmmo += 4; }
  if (advisor === "engineer") { run.stock.liutyi += 8; run.stock.neptune += 1; }
  if (advisor === "diplomat") for (const a of run.allies) a.trust += 15;
  startDay(run);
  return run;
}

// ================================================================ derived numbers

export const power = (run: RunState) => run.sectors.reduce((a, s) => a + s.power * sectorById(s.id).pop, 0) / SECTORS.reduce((a, s) => a + s.pop, 0);
export const frontAvg = (run: RunState) => run.front.reduce((a, b) => a + b, 0) / run.front.length;
export const trustAvg = (run: RunState) => run.allies.reduce((a, b) => a + b.trust, 0) / run.allies.length;
export const ally = (run: RunState, id: AllyId) => run.allies.find((a) => a.id === id)!;
export function mod(run: RunState, key: EnemyMod): number {
  return clamp(run.mods.filter((m) => m.key === key && m.until >= run.week).reduce((a, m) => a + m.value, 0), 0, 0.85);
}
function snapshot(run: RunState): Snapshot {
  return { budget: run.budget, morale: run.morale, power: power(run), escalation: run.escalation, front: frontAvg(run), trust: trustAvg(run) };
}
/** Production multiplier: industry and the grid. */
export const prodMult = (run: RunState) => clamp(run.industry, 0.3, 1.4) * (power(run) < 30 ? 0.6 : 1);
/** Front points for drawing, lon/lat, after the offsets. */
export function frontLine(run: { front: number[] }): [number, number][] {
  return FRONT.map((f, i) => {
    const o = run.front[i] ?? 0;
    const kmPerLon = Math.cos((48 * Math.PI) / 180) * 111.32;
    return [f.at[0] + (f.dir[0] * o) / kmPerLon, f.at[1] + (f.dir[1] * o) / 110.57];
  });
}

// ================================================================ effects

export function applyEffect(run: RunState, e: Effect): string[] {
  const out: string[] = [];
  if (e.budget) run.budget = Math.round((run.budget + e.budget) * 100) / 100;
  if (e.morale) run.morale = clamp(run.morale + e.morale, 0, 100);
  if (e.energy) for (const s of run.sectors) s.power = clamp(s.power + e.energy, 0, 100);
  if (e.escalation) run.escalation = clamp(run.escalation + e.escalation, 0, 100);
  if (e.industry) run.industry = clamp(run.industry + e.industry, 0.3, 1.4);
  if (e.front) for (let i = 0; i < run.front.length; i++) run.front[i] = clamp(run.front[i] + e.front, -40, 90);
  if (e.trust) for (const [k, v] of Object.entries(e.trust)) {
    for (const a of run.allies) if (k === "all" || a.id === k) a.trust = clamp(a.trust + (v ?? 0) * (v! > 0 && has(run, "diplomats") ? 1.5 : 1), 0, 100);
  }
  if (e.liutyi) run.stock.liutyi += e.liutyi;
  if (e.neptune) run.stock.neptune += e.neptune;
  if (e.decoys) run.stock.decoys += e.decoys;
  if (e.interceptors) run.stock.interceptors += e.interceptors;
  if (e.patriotAmmo) run.stock.patriotAmmo += e.patriotAmmo;
  if (e.mobile) for (let i = 0; i < e.mobile; i++) placeUnit(run, "mobile", weakestSector(run));
  if (e.revealZone) { const z = revealZone(run); if (z) out.push(`Розвідка: ${z}`); }
  return out;
}
function weakestSector(run: RunState): SectorId {
  const cover = (id: SectorId) => run.ad.filter((u) => u.sector === id).length;
  return [...SECTORS].sort((a, b) => cover(a.id) - cover(b.id) || b.pop - a.pop)[0].id;
}
export function revealZone(run: RunState): string | null {
  const hidden = ZONES.filter((z) => !run.zones[z.id].known);
  if (!hidden.length) return null;
  const border = at([36, 50]);
  const z = hidden.sort((a, b) => dist(at(a.at), border) - dist(at(b.at), border))[0];
  run.zones[z.id].known = true;
  return z.name;
}

// ================================================================ day

function startDay(run: RunState): void {
  run.phase = "day";
  run.hours = HOURS_PER_DAY;
  run.offer = null;
  run.start = snapshot(run);
  // decisions for today
  const pool = DECISIONS.filter((d) => !run.usedDecisions.includes(d.id) && (d.week ?? 0) <= run.week);
  const n = run.week === 1 ? 1 : run.week % 2 === 0 ? 2 : 1;
  run.decisions = [];
  for (let i = 0; i < n && pool.length; i++) {
    const d = pool.splice(Math.floor(rand(run) * pool.length), 1)[0];
    run.decisions.push(d.id);
  }
  if (pool.length === 0 && run.usedDecisions.length >= DECISIONS.length - 2) run.usedDecisions = [];
}
export const decisionById = (id: string): DecisionDef => DECISIONS.find((d) => d.id === id)!;

export function decide(run: RunState, id: string, choice: "a" | "b"): string[] {
  if (!run.decisions.includes(id)) return [];
  const d = decisionById(id);
  run.decisions = run.decisions.filter((x) => x !== id);
  run.usedDecisions.push(id);
  return applyEffect(run, d[choice].eff);
}

export type ActionId = "liutyi" | "neptune" | "flamingo" | "decoys" | "interceptors" | "mobile" | "repair" | "reserves" | "recon";
export interface ActionInfo { id: ActionId; name: string; text: string; cost: number; gain: string; ok: boolean; why?: string }

export function actions(run: RunState): ActionInfo[] {
  const m = prodMult(run);
  const cheap = run.advisor === "engineer" ? 0.7 : 1;
  const mobileCost = run.advisor === "general" ? 0.08 : 0.12;
  const list: Omit<ActionInfo, "ok" | "why">[] = [
    { id: "liutyi", name: "Партія Лютих", text: "Далекобійні дрони для ударів.", cost: Math.round(0.3 * cheap * 100) / 100, gain: `+${Math.round(6 * m)} Лютих` },
    { id: "neptune", name: "Довгі Нептуни", text: "Крилаті ракети: дорожчі, надійніші.", cost: 0.7, gain: `+${Math.max(1, Math.round(2 * m))} Нептуни` },
    { id: "decoys", name: "Приманки", text: "Відволікають ППО ворога під час удару.", cost: 0.2, gain: `+${Math.round(12 * m)} приманок` },
    { id: "interceptors", name: "Дрони-перехоплювачі", text: "Дешево збивають Shahed за тапом.", cost: 0.25, gain: `+${Math.round(20 * m)} перехоплювачів` },
    { id: "mobile", name: "Мобільна група", text: "Кулемети на пікапі. Ставиться в найменш прикритий сектор.", cost: mobileCost, gain: "+1 група" },
    { id: "repair", name: "Ремонт енергосистеми", text: "Енергетики латають найпошкодженіші сектори.", cost: 0.4, gain: "+15% у 3 секторах" },
    { id: "reserves", name: "Резерви на фронт", text: "Боєприпаси і техніка для оборони цього тижня.", cost: 0.5, gain: "фронт міцніший" },
    { id: "recon", name: "Розвідка ГУР", text: "Знайти приховану зону ППО ворога.", cost: 0.1, gain: "+1 зона" },
  ];
  if (has(run, "flamingo")) list.splice(2, 0, { id: "flamingo", name: "Фламінго", text: "Важка крилата ракета на 3000 км.", cost: 1.0, gain: "+1 Фламінго" });
  return list.map((a) => {
    let why: string | undefined;
    if (run.phase !== "day") why = "Лише вдень";
    else if (run.hours <= 0) why = "Години скінчились";
    else if (run.budget + 1e-9 < a.cost) why = "Не вистачає грошей";
    else if (a.id === "recon" && ZONES.every((z) => run.zones[z.id].known)) why = "Усе відомо";
    return { ...a, ok: !why, why };
  });
}

export function doAction(run: RunState, id: ActionId): string | null {
  const a = actions(run).find((x) => x.id === id);
  if (!a) return "Немає такої дії";
  if (!a.ok) return a.why ?? "Не можна";
  run.budget = Math.round((run.budget - a.cost) * 100) / 100;
  run.hours -= 1;
  const m = prodMult(run);
  switch (id) {
    case "liutyi": run.stock.liutyi += Math.round(6 * m); break;
    case "neptune": run.stock.neptune += Math.max(1, Math.round(2 * m)); break;
    case "flamingo": run.stock.flamingo += 1; break;
    case "decoys": run.stock.decoys += Math.round(12 * m); break;
    case "interceptors": run.stock.interceptors += Math.round(20 * m); break;
    case "mobile": placeUnit(run, "mobile", weakestSector(run)); break;
    case "repair": for (const s of [...run.sectors].sort((p, q) => p.power - q.power).slice(0, 3)) s.power = clamp(s.power + 14, 0, 100); break;
    case "reserves": run.frontReserve += 1; break;
    case "recon": revealZone(run); break;
  }
  return null;
}

/** Move an air-defence unit to another sector (once per unit per day, free). */
export function moveUnit(run: RunState, unitId: number, sector: SectorId): string | null {
  const u = run.ad.find((x) => x.id === unitId);
  if (!u) return "Немає такої батареї";
  if (run.phase !== "day") return "Лише вдень";
  if (u.movedDay === run.week) return "Вже переїжджала сьогодні";
  if (u.sector === sector) return null;
  run.ad = run.ad.filter((x) => x !== u);
  const nu = placeUnit(run, u.kind, sector);
  nu.id = u.id; nu.ammo = u.ammo; nu.movedDay = run.week; nu.down = u.down;
  run.nextId--;
  return null;
}

// ================================================================ allies

export function asksFor(id: AllyId) { return ASKS.filter((a) => a.from.includes(id)); }
const ASK_MIN: Record<AskId, number> = { patriotAmmo: 30, battery: 55, money: 25, permission: 60, intel: 30, longRange: 45 };

export function negotiate(run: RunState, allyId: AllyId, ask: AskId): Offer | null {
  if (run.phase !== "day" || run.hours <= 0) return null;
  if (!asksFor(allyId).some((a) => a.id === ask)) return null;
  run.hours -= 1;
  const a = ally(run, allyId);
  const def = allyById(allyId);
  const give = giveText(allyId, ask);
  if (a.trust < ASK_MIN[ask]) {
    run.offer = { ally: allyId, ask, cond: "none", give, refused: a.trust < 25 ? "Нам зараз не до вас." : "Поки що не на часі. Покажіть результат." };
    return run.offer;
  }
  let cond: ConditionId = "none";
  const generous = a.trust >= 80;
  if (!generous) {
    if (def.wants === "restraint") cond = ask === "permission" || run.escalation > 35 ? "noMoscow" : "noDeep";
    else if (def.wants === "purchases") cond = "purchase";
    else if (def.wants === "reforms") cond = "reform";
    else cond = run.escalation > def.tolerance - 10 ? "noMoscow" : rand(run) < 0.5 ? "none" : "purchase";
  }
  if (ask === "permission" && cond === "noDeep") cond = "noMoscow";
  run.offer = { ally: allyId, ask, cond, give };
  return run.offer;
}
function giveText(allyId: AllyId, ask: AskId): string {
  switch (ask) {
    case "patriotAmmo": return allyId === "de" ? "+10 ракет до IRIS-T і NASAMS" : allyId === "fr" ? "+6 ракет Aster до SAMP/T" : "+8 ракет PAC-3";
    case "battery": return allyId === "de" ? "Батарея IRIS-T SLM" : allyId === "fr" ? "Батарея SAMP/T" : "Батарея Patriot";
    case "money": return allyId === "pl" ? "+$0,3 млрд" : "+$0,6 млрд";
    case "permission": return "Дозвіл бити їхньою зброєю по РФ на 3 тижні";
    case "intel": return "Координати 2 зон ППО ворога";
    case "longRange": return allyId === "usa" ? "+3 ATACMS" : allyId === "fr" ? "+2 SCALP-EG" : "+3 Storm Shadow";
  }
}
function grant(run: RunState, allyId: AllyId, ask: AskId): void {
  switch (ask) {
    case "patriotAmmo": if (allyId === "de") run.stock.samAmmo += 10; else run.stock.patriotAmmo += allyId === "fr" ? 6 : 8; break;
    case "battery": placeUnit(run, allyId === "de" ? "irist" : allyId === "fr" ? "samp" : "patriot", "kyiv"); break;
    case "money": run.budget = Math.round((run.budget + (allyId === "pl" ? 0.3 : 0.6)) * 100) / 100; break;
    case "permission": ally(run, allyId).permissionUntil = run.week + 3; break;
    case "intel": revealZone(run); revealZone(run); break;
    case "longRange": if (allyId === "usa") run.stock.atacms += 3; else run.stock.storm += allyId === "fr" ? 2 : 3; break;
  }
}
export function respond(run: RunState, choice: "accept" | "haggle" | "decline"): string {
  const o = run.offer;
  if (!o) return "";
  run.offer = null;
  const a = ally(run, o.ally);
  const name = allyById(o.ally).name;
  if (o.refused) return `${name}: ${o.refused}`;
  if (choice === "decline") { a.trust = clamp(a.trust - 2, 0, 100); return `${name}: шкода. Повернемось до цього.`; }
  if (choice === "haggle") {
    const p = a.trust / 120 + (run.advisor === "diplomat" ? 0.15 : 0);
    if (rand(run) < p) { grant(run, o.ally, o.ask); a.trust = clamp(a.trust - 2, 0, 100); return `${name} поступились: ${o.give}, без умов.`; }
    a.trust = clamp(a.trust - 8, 0, 100);
    return `${name} образились і відклали рішення.`;
  }
  grant(run, o.ally, o.ask);
  applyCondition(run, o.ally, o.cond);
  a.trust = clamp(a.trust + 3 * (has(run, "diplomats") ? 1.5 : 1), 0, 100);
  return `${name}: домовились. ${o.give}.`;
}
function applyCondition(run: RunState, allyId: AllyId, cond: ConditionId): void {
  const a = ally(run, allyId);
  if (cond === "noDeep") a.pledge = { cond, until: run.week + 2 };
  if (cond === "noMoscow") a.pledge = { cond, until: run.week + 4 };
  if (cond === "reform") { run.morale = clamp(run.morale - 2, 0, 100); run.budget = Math.round((run.budget - 0.1) * 100) / 100; }
  if (cond === "purchase") run.budget = Math.round((run.budget - 0.3) * 100) / 100;
}
export const hasPermission = (run: RunState, id: AllyId) => ally(run, id).permissionUntil >= run.week;

// ================================================================ night

export interface Threat {
  id: number;
  kind: ThreatKind;
  path: Km[];
  seg: number;
  pos: Km;
  /** Height above ground for the picture (km-ish, exaggerated). */
  h: number;
  heading: number;
  spawn: number;
  alive: boolean;
  done: boolean;
  target: "power" | "city" | "industry" | "ad" | "strip";
  sector: SectorId;
  unitId: number;
  /** Ballistic: 0..1 along the arc. */
  t: number;
  dur: number;
  engaged: number;
}
export interface Shot { id: number; from: Km; unitId: number; kind: AdKind | "drone"; threat: number; t: number; dur: number; hit: boolean; done: boolean }
export type NightEv =
  | { type: "launch"; id: number; kind: ThreatKind }
  | { type: "warn"; id: number; kind: ThreatKind }
  | { type: "shot"; shot: Shot }
  | { type: "kill"; id: number; kind: ThreatKind; at: Km; h: number; decoy: boolean }
  | { type: "miss"; id: number }
  | { type: "impact"; id: number; kind: ThreatKind; at: Km; sector: SectorId; target: Threat["target"]; decoyEnd: boolean }
  | { type: "adLost"; unitId: number; kind: AdKind; sector: SectorId }
  | { type: "noFire"; id: number; why: string };

export interface NightState {
  t: number;
  threats: Threat[];
  shots: Shot[];
  slow: number;
  slowCharges: number;
  done: boolean;
  massive: boolean;
  stats: { launched: number; downed: number; impacts: number; decoysShot: number; waves: Record<ThreatKind, number> };
  events: NightEv[];
  nextId: number;
}

export function waveSize(run: RunState): Record<ThreatKind, number> {
  const w = run.week;
  const diff = 1 + 0.2 * run.difficulty;
  const massive = w % 4 === 0;
  const esc = 1 + run.escalation / 160;
  const shahed = Math.round((7 + w * 1.5) * diff * (1 - mod(run, "shahed")) * (massive ? 1.9 : 1) * esc);
  const kh101 = w < 2 ? 0 : Math.round((1 + w * 0.32) * diff * (1 - mod(run, "cruise")) * (massive ? 2.6 : 1) * esc);
  const kalibr = w < 3 ? 0 : Math.round((0.6 + w * 0.15) * (1 - mod(run, "kalibr")) * (massive ? 2.2 : 1) * esc);
  const iskander = w < 2 ? 0 : Math.round((0.6 + w * 0.17) * diff * (1 - mod(run, "ballistic")) * (massive ? 2 : 1));
  const kinzhal = w < 7 ? 0 : massive ? 2 : rand(run) < 0.35 ? 1 : 0;
  return { shahed, gerbera: Math.round(shahed * 0.45), kh101, kalibr, iskander, kinzhal };
}

export function startNight(run: RunState): NightState {
  run.phase = "night";
  run.offer = null;
  const n: NightState = {
    t: 0, threats: [], shots: [], slow: 0, slowCharges: 2 + (has(run, "coldHead") ? 1 : 0), done: false, massive: run.week % 4 === 0,
    stats: { launched: 0, downed: 0, impacts: 0, decoysShot: 0, waves: { shahed: 0, gerbera: 0, kh101: 0, kalibr: 0, iskander: 0, kinzhal: 0 } },
    events: [], nextId: 1,
  };
  for (const s of run.sectors) s.hitsTonight = 0;
  // reload air defence from stock
  for (const u of run.ad) {
    u.down = false; u.cd = 0;
    const def = AD[u.kind];
    const need = def.ammo - u.ammo;
    if (need <= 0) continue;
    if (u.kind === "patriot" || u.kind === "samp") { const k = Math.min(need, run.stock.patriotAmmo); u.ammo += k; run.stock.patriotAmmo -= k; }
    else if (u.kind === "irist" || u.kind === "nasams") { const k = Math.min(need, run.stock.samAmmo); u.ammo += k; run.stock.samAmmo -= k; }
    else u.ammo = def.ammo;
  }
  const wave = waveSize(run);
  n.stats.waves = wave;
  const spread = n.massive ? 62 : 48;
  const add = (kind: ThreatKind, count: number, t0: number, t1: number) => {
    for (let i = 0; i < count; i++) addThreat(run, n, kind, t0 + rand(run) * (t1 - t0));
  };
  add("shahed", wave.shahed, 1, spread);
  add("gerbera", wave.gerbera, 1, spread);
  add("kh101", wave.kh101, spread * 0.35, spread * 0.85);
  add("kalibr", wave.kalibr, spread * 0.35, spread * 0.85);
  add("iskander", wave.iskander, 10, spread + 10);
  add("kinzhal", wave.kinzhal, spread * 0.5, spread + 12);
  n.threats.sort((a, b) => a.spawn - b.spawn);
  return n;
}

function addThreat(run: RunState, n: NightState, kind: ThreatKind, spawn: number): void {
  const def = THREATS[kind];
  const sites = kind === "shahed" || kind === "gerbera" ? SHAHED_SITES : kind === "kh101" ? KH101_SITES : kind === "kalibr" ? KALIBR_SITES : kind === "iskander" ? ISKANDER_SITES : KINZHAL_SITES;
  const from = at(pick(run, sites));
  const reach = def.ballistic ? (kind === "kinzhal" ? 700 : 420) : 1e9;
  const near = def.ballistic ? 260 : kind === "shahed" || kind === "gerbera" ? 520 : 900;
  const cands = SECTORS.filter((s) => dist(at(s.city), from) < reach);
  const sec = weighted(run, cands.length ? cands : SECTORS, (s) => (s.pop + s.industry + 1) * Math.exp(-dist(at(s.city), from) / near));
  const units = run.ad.filter((u) => u.sector === sec.id && !u.down);
  const adBias = def.ballistic ? (run.difficulty >= 2 ? 0.45 : 0.3) : 0.06;
  const r = rand(run);
  let target: Threat["target"] = "power";
  if (units.length && r < adBias) target = "ad";
  else if (r < adBias + (def.ballistic ? 0.3 : 0.22)) target = "city";
  else if (sec.industry > 0 && r < adBias + 0.42) target = "industry";
  else if (sec.strip && r < adBias + 0.5) target = "strip";
  const unit = target === "ad" ? pick(run, units) : null;
  const c = at(sec.city);
  const jit = () => (rand(run) - 0.5) * 16;
  const goal: Km = target === "power" ? at(sec.power) : target === "ad" && unit ? { ...unit.at } : target === "industry" ? { x: c.x + 9, y: c.y - 6 } : target === "strip" ? { x: c.x - 14, y: c.y + 8 } : { x: c.x + jit(), y: c.y + jit() };
  const path: Km[] = [from];
  if (!def.ballistic) {
    const d = dist(from, goal);
    const mx = (from.x + goal.x) / 2, my = (from.y + goal.y) / 2;
    const nx = -(goal.y - from.y) / d, ny = (goal.x - from.x) / d;
    const bend = (rand(run) - 0.5) * (kind === "shahed" || kind === "gerbera" ? 0.55 : 0.35) * d;
    path.push({ x: mx + nx * bend, y: my + ny * bend });
    if (d > 500 && kind !== "shahed" && kind !== "gerbera") {
      const b2 = (rand(run) - 0.5) * 0.25 * d;
      path.splice(1, 0, { x: from.x + (goal.x - from.x) * 0.25 + nx * b2, y: from.y + (goal.y - from.y) * 0.25 + ny * b2 });
    }
  }
  path.push(goal);
  const d = dist(from, goal);
  const dur = kind === "iskander" ? 7 + d / 110 : kind === "kinzhal" ? 5 + d / 220 : 0;
  n.threats.push({ id: n.nextId++, kind, path, seg: 0, pos: { ...from }, h: def.alt, heading: Math.atan2(path[1].y - from.y, path[1].x - from.x), spawn, alive: false, done: false, target, sector: sec.id, unitId: unit?.id ?? -1, t: 0, dur, engaged: 0 });
}

export interface NightInput { assign?: number; slow?: boolean }

/** Which unit (or an interceptor drone) would answer a tap on this threat. */
export function bestShooter(run: RunState, n: NightState, th: Threat): { unit: AdUnit | null; drone: boolean; why?: string } {
  if (!th.alive) return { unit: null, drone: false, why: "Вже збито" };
  const def = THREATS[th.kind];
  if (def.ballistic && th.t < 0.3) return { unit: null, drone: false, why: "Ще набирає висоту" };
  if ((th.kind === "shahed" || th.kind === "gerbera") && run.stock.interceptors > 0) {
    const near = SECTORS.some((s) => dist(at(s.city), th.pos) < INTERCEPTOR.range);
    if (near) return { unit: null, drone: true };
  }
  const order: AdKind[] = def.ballistic ? ["patriot", "samp"] : th.kind === "shahed" || th.kind === "gerbera" ? ["gepard", "mobile", "nasams", "irist", "samp", "patriot"] : ["irist", "nasams", "samp", "patriot", "gepard"];
  let why = def.ballistic ? "Немає Patriot/SAMP-T у зоні" : "Немає ППО в зоні";
  for (const k of order) {
    const us = run.ad.filter((u) => u.kind === k && !u.down && (AD[k].pk[th.kind] ?? 0) > 0 && dist(u.at, th.pos) <= unitRange(run, u));
    if (!us.length) continue;
    const ready = us.filter((u) => u.ammo > 0);
    if (!ready.length) { why = `${AD[k].name}: немає ракет`; continue; }
    return { unit: ready.sort((a, b) => a.cd - b.cd)[0], drone: false };
  }
  void n;
  return { unit: null, drone: false, why };
}
export function unitRange(run: RunState, u: AdUnit): number {
  return AD[u.kind].range * ((u.kind === "mobile" || u.kind === "gepard") && has(run, "pickups") ? 1.35 : 1);
}

function fire(run: RunState, n: NightState, th: Threat, unit: AdUnit | null): void {
  const from = unit ? unit.at : nearestCity(th.pos);
  const kind: AdKind | "drone" = unit ? unit.kind : "drone";
  const pk = unit ? AD[unit.kind].pk[th.kind] ?? 0 : has(run, "nightHunters") ? 0.88 : INTERCEPTOR.pk;
  const speed = unit ? (unit.kind === "mobile" || unit.kind === "gepard" ? 60 : 120) : INTERCEPTOR.speed;
  const d = dist(from, th.pos);
  const shot: Shot = { id: n.nextId++, from: { ...from }, unitId: unit?.id ?? -1, kind, threat: th.id, t: 0, dur: Math.max(unit && (unit.kind === "mobile" || unit.kind === "gepard") ? 0.25 : 0.7, d / speed), hit: rand(run) < pk, done: false };
  if (unit) { unit.ammo -= 1; unit.cd = AD[unit.kind].reload; } else run.stock.interceptors -= 1;
  th.engaged += 1;
  n.shots.push(shot);
  n.events.push({ type: "shot", shot });
}
function nearestCity(p: Km): Km {
  return at([...SECTORS].sort((a, b) => dist(at(a.city), p) - dist(at(b.city), p))[0].city);
}

export function stepNight(run: RunState, n: NightState, dtReal: number, input: NightInput = {}): void {
  if (n.done) return;
  if (input.slow && n.slowCharges > 0 && n.slow <= 0) { n.slowCharges -= 1; n.slow = 4; }
  const dt = Math.min(0.1, dtReal) * (n.slow > 0 ? 0.35 : 1);
  if (n.slow > 0) n.slow -= Math.min(0.1, dtReal);
  n.t += dt;

  if (input.assign !== undefined) {
    const th = n.threats.find((x) => x.id === input.assign);
    if (th) {
      const b = bestShooter(run, n, th);
      if (b.unit || b.drone) fire(run, n, th, b.unit);
      else n.events.push({ type: "noFire", id: th.id, why: b.why ?? "Нема чим" });
    }
  }

  // spawn and move
  for (const th of n.threats) {
    if (th.done) continue;
    if (!th.alive) {
      if (n.t < th.spawn) continue;
      th.alive = true;
      n.stats.launched++;
      n.events.push({ type: THREATS[th.kind].ballistic ? "warn" : "launch", id: th.id, kind: th.kind });
    }
    const def = THREATS[th.kind];
    if (def.ballistic) {
      th.t += dt / th.dur;
      const a = th.path[0], b = th.path[th.path.length - 1];
      const k = Math.min(1, th.t);
      th.pos = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      th.h = Math.sin(Math.PI * k) * (18 + dist(a, b) * 0.06);
      th.heading = Math.atan2(b.y - a.y, b.x - a.x);
      if (th.t >= 1) impact(run, n, th);
      continue;
    }
    let move = def.speed * dt;
    while (move > 0 && th.seg < th.path.length - 1) {
      const to = th.path[th.seg + 1];
      const d = dist(th.pos, to);
      th.heading = Math.atan2(to.y - th.pos.y, to.x - th.pos.x);
      if (d <= move) { th.pos = { ...to }; th.seg++; move -= d; }
      else { th.pos = { x: th.pos.x + ((to.x - th.pos.x) / d) * move, y: th.pos.y + ((to.y - th.pos.y) / d) * move }; move = 0; }
    }
    // cruise missiles drop low near the end
    const left = dist(th.pos, th.path[th.path.length - 1]);
    th.h = def.alt * (left < 40 ? Math.max(0.15, left / 40) : 1);
    if (th.seg >= th.path.length - 1) impact(run, n, th);
  }

  // air defence: cooldowns and automatic fire
  for (const u of run.ad) {
    if (u.down) continue;
    u.cd = Math.max(0, u.cd - dt);
    const def = AD[u.kind];
    const autoBallistic = has(run, "patriotAuto") && (u.kind === "patriot" || u.kind === "samp");
    if (!def.auto && !autoBallistic) continue;
    if (u.cd > 0 || u.ammo <= 0) continue;
    const range = unitRange(run, u);
    let best: Threat | null = null;
    let bd = Infinity;
    for (const th of n.threats) {
      if (!th.alive || th.engaged > 0) continue;
      const tdef = THREATS[th.kind];
      if (autoBallistic && !def.auto && !tdef.ballistic) continue;
      if (tdef.ballistic && th.t < 0.3) continue;
      if (!(def.pk[th.kind] ?? 0)) continue;
      if (tdef.decoy && has(run, "nordicRadars") && !def.auto) continue;
      const d = dist(u.at, th.pos);
      if (d <= range && d < bd) { bd = d; best = th; }
    }
    if (best) fire(run, n, best, u);
  }

  // shots in flight
  for (const s of n.shots) {
    if (s.done) continue;
    s.t += dt;
    if (s.t < s.dur) continue;
    s.done = true;
    const th = n.threats.find((x) => x.id === s.threat);
    if (!th || !th.alive) continue;
    th.engaged = Math.max(0, th.engaged - 1);
    if (s.hit) {
      th.alive = false; th.done = true;
      n.stats.downed++;
      if (THREATS[th.kind].decoy) n.stats.decoysShot++;
      n.events.push({ type: "kill", id: th.id, kind: th.kind, at: { ...th.pos }, h: th.h, decoy: !!THREATS[th.kind].decoy });
    } else n.events.push({ type: "miss", id: th.id });
  }
  n.shots = n.shots.filter((s) => !s.done || s.t < s.dur + 0.5);

  const pending = n.threats.some((th) => !th.done);
  if (!pending && n.shots.every((s) => s.done)) n.done = true;
}

function impact(run: RunState, n: NightState, th: Threat): void {
  th.alive = false; th.done = true;
  const def = THREATS[th.kind];
  n.events.push({ type: "impact", id: th.id, kind: th.kind, at: { ...th.pos }, sector: th.sector, target: th.target, decoyEnd: !!def.decoy });
  if (def.decoy) return;
  n.stats.impacts++;
  const s = run.sectors.find((x) => x.id === th.sector)!;
  const sd = sectorById(th.sector);
  s.hitsTonight++;
  const sub = has(run, "undergroundSubs") ? 0.65 : 1;
  s.power = clamp(s.power - def.dmg.power * (th.target === "power" ? 2.4 : 0.5) * sub, 0, 100);
  run.morale = clamp(run.morale - def.dmg.morale * (th.target === "city" ? 0.9 : 0.25) * (0.6 + sd.pop * 0.15), 0, 100);
  if (th.target === "industry") run.industry = clamp(run.industry - def.dmg.industry * 0.12, 0.3, 1.4);
  if (th.target === "strip") run.stock.liutyi = Math.floor(run.stock.liutyi * 0.85);
  if (th.target === "ad") {
    const u = run.ad.find((x) => x.id === th.unitId);
    if (u && def.ballistic) {
      if (has(run, "dispersal")) u.down = true;
      else run.ad = run.ad.filter((x) => x !== u);
      n.events.push({ type: "adLost", unitId: u.id, kind: u.kind, sector: u.sector });
    }
  }
}

/** Night is over: tally, blackout check, move on to the strike. */
export function finishNight(run: RunState, n: NightState): string[] {
  const lines: string[] = [];
  run.stats.launched += n.stats.launched;
  run.stats.downed += n.stats.downed;
  run.stats.impacts += n.stats.impacts;
  const real = n.stats.launched - n.stats.waves.gerbera;
  const realDown = n.stats.downed - n.stats.decoysShot;
  const rate = real > 0 ? realDown / real : 1;
  lines.push(`Збито ${realDown} з ${real} (${Math.round(rate * 100)}%), влучань: ${n.stats.impacts}.`);
  if (n.stats.decoysShot) lines.push(`На приманки витрачено ${n.stats.decoysShot} пострілів.`);
  if (has(run, "feed")) { const m = Math.floor(n.stats.downed / 10); if (m) { run.morale = clamp(run.morale + m, 0, 100); lines.push(`Відео перехоплень: +${m} мораль.`); } }
  if (rate >= 0.85) { run.morale = clamp(run.morale + 2, 0, 100); for (const a of run.allies) if (allyById(a.id).wants === "results") a.trust = clamp(a.trust + 1, 0, 100); }
  const p = power(run);
  if (p < 12) { run.blackoutNights++; lines.push("Блекаут по всій країні."); } else run.blackoutNights = 0;
  if (p < 35) { const m = has(run, "generators") ? 1.5 : 3; run.morale = clamp(run.morale - m, 0, 100); lines.push(`Відключення світла: −${m} мораль.`); }
  run.history.push({ week: run.week, launched: n.stats.launched, downed: n.stats.downed, impacts: n.stats.impacts, strike: "", strikeHits: 0, destroyed: false });
  run.phase = "strike";
  checkLoss(run);
  return lines;
}

// ================================================================ strike

export interface StrikePlan { target: string; weapon: WeaponId; count: number; decoys: number; via: Km[] }
export interface StrikeRisk {
  route: Km[]; length: number; inRange: boolean; pSurvive: number; expected: number; zones: string[]; hiddenRisk: boolean;
  escalation: number; problems: string[]; violations: { ally: AllyId; text: string; trust: number }[];
}
export const launchSites = () => SECTORS.filter((s) => s.strip);
export function launchPoint(target: Km, weapon: WeaponId): Km {
  const ws = WEAPONS[weapon];
  const sites = ws.from === "domestic" && weapon === "liutyi" ? launchSites() : SECTORS.filter((s) => s.id !== "lviv" && s.id !== "vinnytsia");
  // tactical missiles launch from aircraft near the front: start them a bit forward
  const s = [...sites].sort((a, b) => dist(at(a.city), target) - dist(at(b.city), target))[0];
  const c = at(s.city);
  if (weapon === "storm" || weapon === "atacms") {
    const d = dist(c, target);
    const k = Math.min(0.45, 120 / d);
    return { x: c.x + (target.x - c.x) * k, y: c.y + (target.y - c.y) * k };
  }
  return c;
}
export function routeOf(plan: StrikePlan): Km[] {
  const t = targetById(plan.target)!;
  const goal = at(t.at);
  return [launchPoint(goal, plan.weapon), ...plan.via, goal];
}
const routeLen = (r: Km[]) => r.slice(1).reduce((a, p, i) => a + dist(r[i], p), 0);

function zonePower(run: RunState, zid: string): number {
  const z = ZONES.find((x) => x.id === zid)!;
  const st = run.zones[zid];
  const weak = st.weakUntil >= run.week ? 0.4 : 1;
  return z.power * weak * (1 + run.difficulty * 0.1);
}
/** Hazard integral along a route, per zone, plus terminal defence. */
function hazard(run: RunState, route: Km[], vuln: number, knownOnly: boolean): { h: number; zones: Set<string> } {
  let h = 0;
  const zones = new Set<string>();
  const stepKm = 5;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const d = dist(a, b);
    const n = Math.max(1, Math.ceil(d / stepKm));
    for (let k = 0; k < n; k++) {
      const p = { x: a.x + ((b.x - a.x) * (k + 0.5)) / n, y: a.y + ((b.y - a.y) * (k + 0.5)) / n };
      for (const z of ZONES) {
        if (knownOnly && !run.zones[z.id].known) continue;
        if (dist(p, at(z.at)) > z.r) continue;
        h += zonePower(run, z.id) * vuln * 0.0042 * (d / n);
        zones.add(z.id);
      }
    }
  }
  h += 0.08 * vuln; // point defence at the target
  return { h, zones };
}

export function strikeRisk(run: RunState, plan: StrikePlan): StrikeRisk {
  const t = targetById(plan.target);
  const w = WEAPONS[plan.weapon];
  const route = t ? routeOf(plan) : [];
  const length = routeLen(route);
  const problems: string[] = [];
  const violations: StrikeRisk["violations"] = [];
  if (!t) problems.push("Оберіть ціль");
  const inRange = length <= w.range;
  if (!inRange) problems.push(`Задалеко: ${Math.round(length)} км із ${w.range}`);
  if (plan.count < 1) problems.push("Немає чим бити");
  if (plan.count > run.stock[plan.weapon]) problems.push(`На складі лише ${run.stock[plan.weapon]}`);
  if (plan.decoys > run.stock.decoys) problems.push(`Приманок лише ${run.stock.decoys}`);
  const dilute = plan.count / (plan.count + plan.decoys * 1.3);
  const known = hazard(run, route, w.vuln * dilute, true);
  const all = hazard(run, route, w.vuln * dilute, false);
  const pSurvive = Math.exp(-known.h);
  // escalation and allies
  let esc = 0;
  if (t) {
    esc = t.esc * (w.from !== "domestic" ? 1.3 : 1) * (plan.count > 10 ? 1.2 : 1);
    const moscowNear = dist(at(t.at), at([37.6, 55.75])) < 260;
    if (moscowNear) esc += 4;
    if (w.from !== "domestic" && !t.occupied) {
      const a = allyById(w.from);
      if (a.redLine && !hasPermission(run, a.id)) violations.push({ ally: a.id, text: `${a.name} не дозволяли бити своєю зброєю по РФ`, trust: -30 });
    }
    const depth = Math.min(...SECTORS.map((s) => dist(at(s.city), at(t.at))));
    for (const a of run.allies) {
      if (!a.pledge || a.pledge.until < run.week) continue;
      if (a.pledge.cond === "noDeep" && depth > 500 && !t.occupied) violations.push({ ally: a.id, text: `Обіцяли ${allyById(a.id).name} не бити глибше 500 км`, trust: -20 });
      if (a.pledge.cond === "noMoscow" && moscowNear) violations.push({ ally: a.id, text: `Обіцяли ${allyById(a.id).name} не бити по Москві`, trust: -20 });
    }
  }
  return {
    route, length, inRange, pSurvive, expected: plan.count * pSurvive, zones: [...known.zones], hiddenRisk: all.h > known.h + 1e-6,
    escalation: Math.round(esc), problems, violations,
  };
}

export interface Missile { id: number; decoy: boolean; lane: number; d: number; killAt: number; dead: boolean; arrived: boolean; delay: number }
export interface StrikeFlight { plan: StrikePlan; route: Km[]; length: number; speed: number; missiles: Missile[]; t: number; done: boolean; hits: number; events: StrikeEv[] }
export type StrikeEv = { type: "down"; id: number; at: Km; decoy: boolean } | { type: "hit"; id: number; at: Km };

/** Position along the route `d` km from the start. */
export function along(route: Km[], d: number): { p: Km; heading: number } {
  let left = d;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const L = dist(a, b);
    if (left <= L || i === route.length - 1) {
      const k = L > 0 ? clamp(left / L, 0, 1) : 1;
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, heading: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    left -= L;
  }
  return { p: route[route.length - 1], heading: 0 };
}

export function launchStrike(run: RunState, plan: StrikePlan): StrikeFlight | string {
  const risk = strikeRisk(run, plan);
  if (risk.problems.length) return risk.problems[0];
  const w = WEAPONS[plan.weapon];
  run.stock[plan.weapon] -= plan.count;
  run.stock.decoys -= plan.decoys;
  run.escalation = clamp(run.escalation + risk.escalation, 0, 100);
  for (const v of risk.violations) {
    const a = ally(run, v.ally);
    a.trust = clamp(a.trust + v.trust, 0, 100);
    a.permissionUntil = 0;
  }
  run.stats.strikes++;
  // roll each missile's fate along the real hazard (hidden zones too)
  const dilute = plan.count / (plan.count + plan.decoys * 1.3);
  const total = plan.count + plan.decoys;
  const missiles: Missile[] = [];
  const route = risk.route;
  const length = risk.length;
  // hazard density per km along the route, to place kills where the zones are
  const samples: number[] = [];
  const stepKm = 5;
  for (let d = 0; d < length; d += stepKm) {
    const p = along(route, d + stepKm / 2).p;
    let h = 0;
    for (const z of ZONES) if (dist(p, at(z.at)) <= z.r) h += zonePower(run, z.id) * 0.0042 * stepKm;
    samples.push(h);
  }
  for (let i = 0; i < total; i++) {
    const decoy = i >= plan.count;
    const v = decoy ? 1.1 : w.vuln * dilute;
    let killAt = Infinity;
    for (let k = 0; k < samples.length; k++) {
      if (rand(run) < 1 - Math.exp(-samples[k] * v)) { killAt = k * stepKm + rand(run) * stepKm; break; }
    }
    if (killAt === Infinity && !decoy && rand(run) < 1 - Math.exp(-0.08 * w.vuln * dilute)) killAt = Math.max(0, length - 4);
    missiles.push({ id: i, decoy, lane: (rand(run) - 0.5) * 2, d: 0, killAt, dead: false, arrived: false, delay: decoy ? 0 : 0.6 + (i % 6) * 0.25 });
  }
  return { plan, route, length, speed: w.speed, missiles, t: 0, done: false, hits: 0, events: [] };
}

export function stepStrike(fl: StrikeFlight, dt: number): void {
  if (fl.done) return;
  fl.t += dt;
  for (const m of fl.missiles) {
    if (m.dead || m.arrived) continue;
    if (fl.t < m.delay) continue;
    m.d += fl.speed * (m.decoy ? 1.08 : 1) * dt;
    if (m.d >= m.killAt) { m.dead = true; fl.events.push({ type: "down", id: m.id, at: along(fl.route, m.killAt).p, decoy: m.decoy }); continue; }
    if (m.d >= fl.length) {
      m.arrived = true;
      if (!m.decoy) { fl.hits++; fl.events.push({ type: "hit", id: m.id, at: fl.route[fl.route.length - 1] }); }
      else m.dead = true;
    }
  }
  if (fl.missiles.every((m) => m.dead || m.arrived)) fl.done = true;
}

export interface StrikeResult { hits: number; destroyed: boolean; lines: string[] }
export function finishStrike(run: RunState, fl: StrikeFlight): StrikeResult {
  const t = targetById(fl.plan.target)!;
  const w = WEAPONS[fl.plan.weapon];
  const st = (run.targets[t.id] ??= { damage: 0, until: 0 });
  const hits = fl.hits * w.power;
  const lines: string[] = [];
  const already = st.until >= run.week;
  st.damage += hits;
  let destroyed = false;
  if (!already && st.damage >= t.hp) {
    destroyed = true;
    st.until = run.week + t.weeks;
    st.damage = 0;
    for (const [k, v] of Object.entries(t.effect)) run.mods.push({ key: k as EnemyMod, value: v!, until: run.week + t.weeks });
    if (t.kind === "radar") for (const z of ZONES) if (dist(at(z.at), at(t.at)) < 60) run.zones[z.id].weakUntil = run.week + t.weeks;
    run.stats.destroyed++;
    run.morale = clamp(run.morale + 3, 0, 100);
    for (const a of run.allies) if (allyById(a.id).wants === "results") a.trust = clamp(a.trust + 3 * (has(run, "diplomats") ? 1.5 : 1), 0, 100);
    lines.push(`${t.name}: ціль виведено з ладу на ${t.weeks} тиж. ${t.text}`);
  } else if (fl.hits > 0) {
    lines.push(already ? `${t.name}: ще не відновлена, удар додав руйнувань.` : `${t.name}: ${fl.hits} влучань, потрібно ще ${Math.max(0, t.hp - st.damage)}.`);
  } else lines.push(`${t.name}: жодного влучання.`);
  const lost = fl.missiles.filter((m) => !m.decoy && m.dead).length;
  lines.unshift(`Долетіли ${fl.hits} з ${fl.plan.count} (${w.name}), збито ${lost}.`);
  const log = run.history[run.history.length - 1];
  if (log) { log.strike = t.name; log.strikeHits = fl.hits; log.destroyed = destroyed; }
  run.phase = "report";
  endWeek(run, lines);
  return { hits: fl.hits, destroyed, lines };
}
export function skipStrike(run: RunState): string[] {
  const lines = ["Цього тижня без ударів."];
  run.phase = "report";
  endWeek(run, lines);
  return lines;
}

// ================================================================ end of week

function endWeek(run: RunState, lines: string[]): void {
  // front
  const diff = 1 + 0.15 * run.difficulty;
  const base = 2.9 * (1 + run.week * 0.035) * diff * (1 - mod(run, "econ") * 0.5) * (has(run, "engineers") ? 0.8 : 1);
  const resist = (run.morale / 100) * 1.6 + run.frontReserve * 1.1 + clamp(run.industry, 0.3, 1.4) * 0.5;
  const groups: [number, number, EnemyMod][] = [[0, 3, "frontNorth"], [3, 9, "frontEast"], [9, FRONT.length, "frontSouth"]];
  let moved = 0;
  for (const [a, b, key] of groups) {
    const push = base * (1 - mod(run, key)) * (key === "frontEast" ? 1.25 : 0.8);
    for (let i = a; i < b; i++) {
      const delta = push - resist + (rand(run) - 0.5) * 2.2;
      run.front[i] = clamp(run.front[i] + delta, -40, 90);
      moved += delta;
    }
  }
  run.frontReserve = 0;
  const avgMove = moved / FRONT.length;
  const kmText = (v: number) => v.toFixed(1).replace(".", ",");
  lines.push(avgMove > 0.3 ? `Фронт: ворог просунувся в середньому на ${kmText(avgMove)} км.` : avgMove < -0.3 ? `Фронт: ми відбили в середньому ${kmText(-avgMove)} км.` : "Фронт: лінія тримається.");

  // escalation and allies
  const decay = run.advisor === "economist" ? 12 : 6;
  run.escalation = clamp(run.escalation - decay, 0, 100);
  for (const a of run.allies) {
    const def = allyById(a.id);
    if (run.escalation > a.tolerance) { const d = Math.ceil((run.escalation - a.tolerance) / 5); a.trust = clamp(a.trust - d, 0, 100); lines.push(`${def.name} нервують через ескалацію: −${d} довіри.`); }
    else if (def.wants === "restraint") a.trust = clamp(a.trust + 1, 0, 100);
    if (def.wants === "reforms" && run.morale > 60) a.trust = clamp(a.trust + 1, 0, 100);
    if (def.election === run.week) {
      const good = rand(run) < 0.5;
      a.trust = clamp(a.trust + (good ? 12 : -18), 0, 100);
      a.tolerance = clamp(a.tolerance + (good ? 10 : -15), 10, 95);
      a.temper = good ? "Після виборів — рішучіший" : "Після виборів — обережніший";
      lines.push(`Вибори: ${def.name} — ${good ? "уряд підтримки" : "скептики при владі"}.`);
    }
    if (a.pledge && a.pledge.until < run.week) a.pledge = null;
  }
  run.mods = run.mods.filter((m) => m.until >= run.week);
  for (const [id, st] of Object.entries(run.targets)) if (st.until < run.week && st.damage > 0) run.targets[id].damage = Math.max(0, st.damage - 1);

  run.report = lines;
  checkLoss(run);
  if (run.ending) return;
  if (run.week >= WEEKS) { finalEnding(run); return; }
  const pool = PERKS.filter((p) => !run.perks.includes(p.id));
  run.perkOffer = [];
  for (let i = 0; i < 3 && pool.length; i++) run.perkOffer.push(pool.splice(Math.floor(rand(run) * pool.length), 1)[0].id);
}

function checkLoss(run: RunState): void {
  if (run.ending) return;
  if (run.blackoutNights >= 2) run.ending = "darkness";
  else if (run.morale <= 0) run.ending = "despair";
  else if (frontAvg(run) >= 38 || Math.max(...run.front) >= 80) run.ending = "breakthrough";
  if (run.ending) { run.phase = "end"; run.score = scoreOf(run); }
}
export function scoreOf(run: RunState): number {
  return Math.round(run.morale * 0.4 + (25 - frontAvg(run)) * 1.1 + trustAvg(run) * 0.3 + run.stats.destroyed * 2.5 + power(run) * 0.2);
}
function finalEnding(run: RunState): void {
  run.score = scoreOf(run);
  run.ending = run.score >= 75 ? "strength" : run.score >= 48 ? "frozen" : "hardPeace";
  run.phase = "end";
}

/** Take the perk (or none) and start the next week's day. */
export function nextWeek(run: RunState, perk: PerkId | null): void {
  if (run.phase !== "report" || run.ending) return;
  if (perk && run.perkOffer.includes(perk)) {
    run.perks.push(perk);
    if (perk === "partnerIntel") for (const z of ZONES) run.zones[z.id].known = true;
  }
  run.perkOffer = [];
  run.week++;
  // income and aid
  const plSlow = ally(run, "pl").trust < 30 ? 0.75 : 1;
  let income = 0.6 + (run.advisor === "economist" ? 0.35 : 0);
  for (const a of run.allies) {
    const def = allyById(a.id);
    income += def.money * (a.trust >= 45 ? 1 : a.trust >= 25 ? 0.5 : 0) * plSlow;
  }
  run.budget = Math.round((run.budget + income) * 100) / 100;
  if (ally(run, "usa").trust >= 50) run.stock.patriotAmmo += Math.round(5 * plSlow);
  if (ally(run, "de").trust >= 50) run.stock.samAmmo += Math.round(8 * plSlow);
  if (ally(run, "fr").trust >= 55) run.stock.patriotAmmo += 2;
  if (ally(run, "uk").trust >= 55 && run.week % 2 === 0) run.stock.storm += 2;
  if (ally(run, "pl").trust >= 40) run.stock.interceptors += 6;
  if (has(run, "decoySwarm")) run.stock.decoys += 6;
  if (has(run, "liutyiLine")) run.stock.liutyi += 4;
  if (has(run, "longNeptune")) run.stock.neptune += 1;
  if (has(run, "nightHunters")) run.stock.interceptors += 10;
  // domestic weekly production and repairs
  run.stock.liutyi += Math.round(3 * prodMult(run));
  run.stock.decoys += 2;
  for (const s of run.sectors) s.power = clamp(s.power + 3 + (has(run, "generators") ? 2 : 0), 0, 100);
  if (power(run) > 50) run.morale = clamp(run.morale + 2, 0, 100);
  run.industry = clamp(run.industry + 0.03, 0.3, 1.2);
  startDay(run);
}

// ================================================================ for the UI

export function endingInfo(run: RunState) { return run.ending ? ENDINGS[run.ending] : null; }
export const DECOY_INFO = DECOY;
export const ADVISOR_LIST = ADVISORS;
