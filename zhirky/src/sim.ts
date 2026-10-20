/**
 * Rules of «З гірки!». Pure TypeScript, no rendering: the route map, the
 * endless-runner simulation of one slope — three lanes, jumps, ducking,
 * ramps and flips, ice and slush — the ватага (kids on sleds hitched behind
 * you, following your track a little late) and the roguelite glue between
 * slopes (mittens, the fair, hearts, candies, endings).
 *
 * The ватага is the heart of it. Every kid rides your exact track — your
 * jumps, your ducks — but swings into a new lane slower than you do. Swerve
 * late around a snowman and you pass; the kids behind clip it and everyone
 * from that kid back tumbles into the snow. More kids = more candies, and a
 * longer tail to protect. A crash of your own costs a heart and half the
 * ватага.
 */
import {
  MAX_FROST, MODS, OBSTACLES, PERKS, PICKUPS, ROUTE_ROWS, THEMES, rideById,
  type EndingId, type HeroId, type Mod, type ObstId, type PerkId, type PickId, type RideId, type Theme, type ThemeDef,
} from "./content.ts";

// ------------------------------------------------------------------ rng

function rnd(s: { rng: number }): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick<T>(s: { rng: number }, xs: readonly T[]): T { return xs[Math.floor(rnd(s) * xs.length)]; }
function shuffle<T>(s: { rng: number }, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(s) * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}
function weighted<T extends string>(s: { rng: number }, w: Partial<Record<T, number>>): T {
  const entries = Object.entries(w) as [T, number][];
  let total = 0;
  for (const [, v] of entries) total += v;
  let r = rnd(s) * total;
  for (const [k, v] of entries) { r -= v; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

// ------------------------------------------------------------------ the route

export interface MapNode {
  id: number;
  row: number;
  col: number;
  theme: Theme;
  mod: Mod;
  /** Ids of the nodes in the next row this one leads to. */
  next: number[];
}

/**
 * Six rows from the yard to grandma's: the first is always the yard and the
 * last always the blackout; in between, forks with twists — a blizzard, a
 * thaw, carollers, a fair.
 */
export function makeMap(s: { rng: number }): MapNode[] {
  const rows: { theme: Theme; mod: Mod }[][] = [];
  rows.push([{ theme: "yard", mod: "none" }]);
  rows.push(shuffle(s, [
    { theme: "uzviz" as Theme, mod: pick(s, ["none", "none", "storm"] as Mod[]) },
    { theme: "dnipro" as Theme, mod: pick(s, ["none", "none", "carols"] as Mod[]) },
  ]));
  const mid = shuffle(s, ["fair", pick(s, ["storm", "thaw"] as Mod[]), "carols"] as Mod[]);
  rows.push(mid.map((mod) => ({ theme: pick(s, ["uzviz", "dnipro", "forest"] as Theme[]), mod })));
  rows.push(shuffle(s, [
    { theme: "forest" as Theme, mod: pick(s, ["none", "thaw", "storm"] as Mod[]) },
    { theme: "polonyna" as Theme, mod: pick(s, ["none", "carols"] as Mod[]) },
  ]));
  rows.push(shuffle(s, [
    { theme: "polonyna" as Theme, mod: "none" as Mod },
    { theme: pick(s, ["forest", "uzviz"] as Theme[]), mod: pick(s, ["fair", "storm", "thaw"] as Mod[]) },
  ]));
  rows.push([{ theme: "blackout", mod: "none" }]);
  const nodes: MapNode[] = [];
  const byRow: MapNode[][] = [];
  rows.forEach((row, r) => {
    byRow.push(row.map((n, c) => {
      const node: MapNode = { id: nodes.length, row: r, col: c, theme: n.theme, mod: n.mod, next: [] };
      nodes.push(node);
      return node;
    }));
  });
  // each node leads to the nodes of the next row roughly below it
  for (let r = 0; r < byRow.length - 1; r++) {
    const a = byRow[r];
    const b = byRow[r + 1];
    for (const n of a) {
      const u = (n.col + 0.5) / a.length;
      for (const m of b) if (Math.abs((m.col + 0.5) / b.length - u) <= 0.5) n.next.push(m.id);
      if (!n.next.length) n.next.push(b[Math.min(b.length - 1, Math.round(u * b.length - 0.5))].id);
    }
  }
  return nodes;
}

// ------------------------------------------------------------------ run

export interface StageResult { node: number; candies: number; time: number; crew: number; tricks: number; lost: number }

export interface RunOptions {
  hero?: HeroId;
  ride?: RideId;
  frost?: number;
  /** Комора: kids at the start (levels). */
  neighbor?: number;
  /** Комора: extra hearts (levels). */
  backpack?: number;
  /** Комора: four mittens to choose from instead of three. */
  mitt4?: boolean;
  /** Комора: rows of the map you can see ahead. */
  map?: boolean;
}

export interface RunState {
  v: 1;
  seed: number;
  hero: HeroId;
  ride: RideId;
  frost: number;
  map: MapNode[];
  /** The row to play next. */
  row: number;
  /** The node played last (−1 before the first). */
  at: number;
  /** Every node chosen so far, in order (fairs too). */
  path: number[];
  /** Candies collected over the run. */
  coins: number;
  hearts: number;
  maxHearts: number;
  /** Kids in the ватага, carried from slope to slope. */
  crew: number;
  perks: PerkId[];
  history: StageResult[];
  ending: EndingId | null;
  /** Where it ended, for the text. */
  endTheme: Theme | null;
  rng: number;
  /** Mittens offered after the last slope, until one is chosen. */
  offer: PerkId[] | null;
  /** What the fair sells, while you are at one. */
  fair: { id: PerkId; price: number }[] | null;
  mitts: number;
  /** How many rows of the map ahead you can see. */
  sight: number;
  tricks: number;
  lost: number;
  bestCrew: number;
}

export function newRun(seed: number, o: RunOptions = {}): RunState {
  const hero = o.hero ?? "solomiia";
  const ride = hero === "hanna" ? "nochvy" : o.ride ?? "sled";
  const frost = Math.max(0, Math.min(MAX_FROST, o.frost ?? 0));
  const run: RunState = {
    v: 1, seed, hero, ride, frost, map: [], row: 0, at: -1, path: [], coins: 0, hearts: 3, maxHearts: 3, crew: 0, perks: [], history: [], ending: null, endTheme: null,
    rng: seed ^ 0x2c1b3c6d, offer: null, fair: null, mitts: o.mitt4 ? 4 : 3, sight: o.map ? 2 : 1, tricks: 0, lost: 0, bestCrew: 0,
  };
  run.map = makeMap(run);
  run.maxHearts = Math.max(1, 3 + rideById(ride).hearts + (hero === "hanna" ? 1 : 0) + (o.backpack ?? 0));
  run.hearts = run.maxHearts;
  run.crew = Math.min(crewMax(run), (hero === "solomiia" ? 2 : 0) + (o.neighbor ?? 0));
  run.bestCrew = run.crew;
  return run;
}

export function count(run: RunState, p: PerkId): number { return run.perks.filter((x) => x === p).length; }
export function has(run: RunState, p: PerkId): boolean { return run.perks.includes(p); }

export function crewMax(run: RunState): number { return rideById(run.ride).crewMax + 3 * count(run, "rope"); }

/** Nodes you can go to next. */
export function choices(run: RunState): MapNode[] {
  if (run.row >= ROUTE_ROWS) return [];
  const row = run.map.filter((n) => n.row === run.row);
  if (run.at < 0) return row;
  const from = run.map[run.at];
  return row.filter((n) => from.next.includes(n.id));
}

export function chooseNode(run: RunState, id: number): MapNode {
  const ok = choices(run).find((n) => n.id === id);
  if (!ok) throw new Error(`node ${id} is not reachable`);
  run.at = id;
  run.path.push(id);
  if (ok.mod === "fair") run.fair = fairOffer(run);
  return ok;
}

/** Candy multiplier for everything picked up on a slope. */
export function candyMult(run: RunState, st?: Stage): number {
  let m = (1 + 0.25 * count(run, "pocket")) * (1 + 0.25 * run.frost);
  if (st) m *= MODS[st.mod].candy * (1 + 0.15 * st.kids.length);
  return m;
}

// ------------------------------------------------------------------ slope

export type Cat = "obst" | "pick";

export interface Obj {
  id: number;
  cat: Cat;
  kind: ObstId | PickId;
  lane: number;
  x: number;
  z: number;
  /** Height above the snow (candies in arcs). */
  y: number;
  len: number;
  w: number;
  vz: number;
  /** Hit by you, collected, or ridden through. */
  hit: boolean;
  /** A kid behind you already hit it. */
  kidHit: boolean;
  /** 0..1, picks a look. */
  look: number;
  pulled: boolean;
}

/** A kid in the ватага. Its place along the slope is fixed behind you; x lags. */
export interface Kid { x: number; look: number }

export interface Input { dx?: -1 | 0 | 1; jump?: boolean; duck?: boolean }

export type Ev =
  | { kind: "candy"; n: number }
  | { kind: "kid"; n: number } | { kind: "kidFull" }
  | { kind: "jump" } | { kind: "land" } | { kind: "duck" } | { kind: "ramp" }
  | { kind: "flip" } | { kind: "trick"; n: number } | { kind: "badFlip" }
  | { kind: "stumble"; what: string }
  | { kind: "crash"; what: string; lost: number }
  | { kind: "bounce"; what: string; lost: number }
  | { kind: "saved"; by: "petard" | "ushanka" }
  | { kind: "tail"; at: number; lost: number; what: string }
  | { kind: "power"; id: PickId } | { kind: "powerEnd"; id: PickId }
  | { kind: "zone"; zone: "ice" | "slush" } | { kind: "zoneEnd" }
  | { kind: "slip" }
  | { kind: "bump" }
  | { kind: "launch"; q: number }
  | { kind: "over" }
  | { kind: "finish" };

export interface Stage {
  node: number;
  row: number;
  theme: Theme;
  mod: Mod;
  lanes: number;
  laneW: number;
  length: number;
  dist: number;
  t: number;
  speed: number;
  lane: number;
  x: number;
  y: number;
  vy: number;
  duck: number;
  /** Seconds left of a flip in progress. */
  flip: number;
  /** Airborne off a ramp (big air). */
  air: boolean;
  stun: number;
  invuln: number;
  bumpT: number;
  power: PickId | null;
  powerT: number;
  powerMax: number;
  kids: Kid[];
  crewMax: number;
  /** Your track: distance, x, y, duck — one sample per tick, oldest first. */
  hd: number[];
  hx: number[];
  hy: number[];
  hk: number[];
  objs: Obj[];
  nextZ: number;
  nextPower: number;
  seq: number;
  rng: number;
  coins: number;
  done: boolean;
  /** Out of hearts. */
  over: boolean;
  /** Before the push-off. */
  waiting: boolean;
  zone: "ice" | "slush" | null;
  zoneEnd: number;
  ushankaUsed: boolean;
  carolUsed: boolean;
  dogUsed: boolean;
  flips: number;
  lost: number;
  crashes: number;
  cleanT: number;
}

export const SLOPE = { lanes: 3, laneW: 2.2, half: 0.55, width: 0.7 };
/** Metres between kids in the ватага. */
export const KID_GAP = 1.5;
const KID_SIDE = 8.5;
const JUMP_V = 8.6;
const RAMP_V = 13.5;
const GRAVITY = 26;
const DUCK_T = 0.7;
export const FLIP_T = 0.5;
const TRICK = 20;

export function theme(st: Stage | Theme): ThemeDef { return THEMES[typeof st === "string" ? st : st.theme]; }
export function laneX(st: Stage, lane: number): number { return (lane - (st.lanes - 1) / 2) * st.laneW; }
export function roadHalf(st: Stage): number { return (st.lanes / 2) * st.laneW; }

export function targetSpeed(st: Stage, run: RunState): number {
  const d = theme(st);
  const k = Math.min(1, st.dist / d.length);
  let v = (d.speed[0] + (d.speed[1] - d.speed[0]) * k) * (1 + 0.05 * run.frost) * rideById(run.ride).speed * (1 + 0.06 * count(run, "wax"));
  if (st.zone === "ice") v *= 1.22 + 0.15 * Math.min(1, count(run, "wax")) + (run.ride === "nochvy" ? 0.12 : 0);
  if (st.zone === "slush") v *= 0.66;
  if (st.power === "petard") v *= 1.35;
  return v;
}

function sideSpeed(run: RunState): number { return rideById(run.ride).side * (run.hero === "brovko" ? 1.3 : 1); }
function kidSide(run: RunState): number { return KID_SIDE * (has(run, "grip") ? 1.5 : 1) * (run.hero === "brovko" ? 1.3 : 1); }

export function startStage(run: RunState, nodeId = run.at): Stage {
  const node = run.map[nodeId];
  const def = THEMES[node.theme];
  const st: Stage = {
    node: node.id, row: node.row, theme: node.theme, mod: node.mod, lanes: SLOPE.lanes, laneW: SLOPE.laneW, length: def.length, dist: 0, t: 0,
    speed: 0, lane: 1, x: 0, y: 0, vy: 0, duck: 0, flip: 0, air: false, stun: 0, invuln: 0, bumpT: 0, power: null, powerT: 0, powerMax: 0,
    kids: [], crewMax: crewMax(run), hd: [], hx: [], hy: [], hk: [], objs: [], nextZ: 40, nextPower: 160, seq: 1,
    rng: (run.seed * 7919 + node.id * 104729 + run.history.length * 31) | 0, coins: 0, done: false, over: false, waiting: true,
    zone: null, zoneEnd: 0, ushankaUsed: false, carolUsed: false, dogUsed: false, flips: 0, lost: 0, crashes: 0, cleanT: 0,
  };
  st.x = laneX(st, st.lane);
  const n = Math.min(st.crewMax, run.crew + (node.mod === "carols" ? 2 : 0));
  for (let i = 0; i < n; i++) st.kids.push({ x: st.x, look: rnd(st) });
  // a straight track behind you, so the kids line up
  for (let d = -KID_GAP * (st.crewMax + 2); d <= 0; d += 0.25) record(st, d);
  generate(st, run);
  return st;
}

/** The push-off: `q` 0..1 is how well the ватага hit the rhythm «раз, два — ГОП!». */
export function launch(st: Stage, run: RunState, q: number): Ev[] {
  st.waiting = false;
  q = Math.max(0, Math.min(1, q));
  st.speed = targetSpeed(st, run) * (0.45 + 0.75 * q);
  const evs: Ev[] = [{ kind: "launch", q }];
  if (q >= 0.85) addCoins(st, run, 10);
  if (has(run, "petards")) givePower(st, run, "petard", 3);
  return evs;
}

function powerSecs(run: RunState, id: PickId): number {
  let s = PICKUPS[id].secs;
  if (id === "sack" && has(run, "bag")) s *= 2;
  if (id === "petard" && has(run, "petards")) s *= 1.5;
  return s;
}

function givePower(st: Stage, run: RunState, id: PickId, secs?: number): void {
  st.power = id;
  st.powerT = st.powerMax = secs ?? powerSecs(run, id);
}

// ------------------------------------------------------------------ track generation

function addObj(st: Stage, cat: Cat, kind: Obj["kind"], lane: number, z: number, extra: Partial<Obj> = {}): Obj {
  const x = laneX(st, lane);
  let len = 0.8;
  let w = st.laneW * 0.5;
  if (cat === "obst") {
    const d = OBSTACLES[kind as ObstId];
    len = d.len;
    w = d.w * st.laneW;
  } else if (kind === "kid") {
    len = 1;
    w = st.laneW * 0.6;
  }
  const o: Obj = { id: st.seq++, cat, kind, lane, x, z, y: 0, len, w, vz: 0, hit: false, kidHit: false, look: rnd(st), pulled: false, ...extra };
  st.objs.push(o);
  return o;
}

const HORIZON = 150;

function density(st: Stage, run: RunState, z: number): number {
  const d = theme(st);
  const k = Math.min(1, z / d.length);
  return (d.density[0] + (d.density[1] - d.density[0]) * k) * (1 + 0.08 * run.frost);
}

function generate(st: Stage, run: RunState): void {
  const end = st.length;
  while (st.nextZ < Math.min(st.dist + HORIZON, end - 25)) {
    const z = st.nextZ;
    const def = theme(st);
    const r = rnd(st);
    if (r < def.ice) {
      // a sheet of ice across the slope: you slide faster and cannot steer
      const o = addObj(st, "obst", "ice", 1, z + OBSTACLES.ice.len / 2);
      o.w = st.laneW * st.lanes;
      candyLine(st, pick(st, [0, 1, 2]), z + 1.5, 4);
      st.nextZ = z + OBSTACLES.ice.len + 10;
      continue;
    }
    if (st.mod === "thaw" && r < def.ice + 0.22) {
      // puddles of slush in one or two lanes: go around
      const lanes = shuffle(st, [0, 1, 2]).slice(0, rnd(st) < 0.6 ? 1 : 2);
      for (const l of lanes) addObj(st, "obst", "slush", l, z + OBSTACLES.slush.len / 2);
      const free = [0, 1, 2].filter((l) => !lanes.includes(l));
      candyLine(st, pick(st, free), z + 1, 5);
      st.nextZ = z + OBSTACLES.slush.len + 6;
      continue;
    }
    if (r < def.ice + def.ramps + (st.mod === "thaw" ? 0.22 : 0)) rampRow(st, run, z);
    else row(st, run, z);
    const gap = 100 / density(st, run, z);
    st.nextZ += gap * (0.8 + rnd(st) * 0.4);
  }
}

function powerHere(st: Stage, run: RunState, z: number): PickId | null {
  if (z < st.nextPower) return null;
  st.nextPower = z + 220 * (0.8 + rnd(st) * 0.5);
  return weighted(st, { sack: 2.5, petard: 2, star: 1.6, thermos: run.hearts < run.maxHearts ? 1.6 : 0.4 } as Record<PickId, number>);
}

function candyLine(st: Stage, lane: number, z: number, n: number, arcOver = -1, arcH = 1.6): void {
  for (let i = 0; i < n; i++) {
    const zz = z + i * 2.3;
    let y = 0.8;
    if (arcOver >= 0) {
      const u = (zz - (arcOver - 3)) / 6;
      if (u > 0 && u < 1) y += Math.sin(u * Math.PI) * arcH;
    }
    addObj(st, "pick", "candy", lane, zz, { y });
  }
}

function filterClear(w: Partial<Record<ObstId, number>>, needPassable: boolean): Partial<Record<ObstId, number>> {
  const out: Partial<Record<ObstId, number>> = {};
  for (const [k, v] of Object.entries(w) as [ObstId, number][]) {
    const d = OBSTACLES[k];
    if (d.moving) continue;
    if (needPassable && (d.clear === "none" || d.soft)) continue;
    out[k] = v;
  }
  if (!Object.keys(out).length) out[needPassable ? "log" : "snowman"] = 1;
  return out;
}

function row(st: Stage, run: RunState, z: number): void {
  const def = theme(st);
  const r = rnd(st);
  const k = r < 0.42 ? 1 : r < 0.88 ? 2 : 3;
  const lanes = shuffle(st, [0, 1, 2]).slice(0, k);
  const blocked = new Set<number>();
  let passable = false;
  const kinds: ObstId[] = [];
  for (const lane of lanes) {
    let kind = weighted(st, def.obstacles);
    if (k === 3 && lane === lanes[2] && !passable) kind = weighted(st, filterClear(def.obstacles, true));
    if (OBSTACLES[kind].moving && k === 3) kind = weighted(st, filterClear(def.obstacles, false));
    // thaw: drifts are heavy and wet
    if (OBSTACLES[kind].clear !== "none" && !OBSTACLES[kind].soft) passable = true;
    kinds.push(kind);
    blocked.add(lane);
  }
  lanes.forEach((lane, i) => {
    const kind = kinds[i];
    const d = OBSTACLES[kind];
    let zz = z;
    let vz = 0;
    if (d.moving) {
      vz = d.moving[0] + rnd(st) * (d.moving[1] - d.moving[0]);
      zz = meetZ(st, run, z, vz);
    }
    addObj(st, "obst", kind, lane, zz, { vz });
  });
  const free = [0, 1, 2].filter((l) => !blocked.has(l));
  const pw = powerHere(st, run, z);
  const kidChance = def.kids * (st.mod === "carols" ? 2 : 1);
  if (pw && free.length) {
    addObj(st, "pick", pw, pick(st, free), z + 6, { y: 1 });
  } else if (free.length && rnd(st) < kidChance) {
    addObj(st, "pick", "kid", pick(st, free), z + 5);
  } else if (rnd(st) < 0.62) {
    const jumpable = lanes.filter((_l, i) => OBSTACLES[kinds[i]].clear === "jump" && !OBSTACLES[kinds[i]].moving);
    if (jumpable.length && rnd(st) < 0.45) candyLine(st, jumpable[0], z - 3, 4, z);
    else if (free.length) candyLine(st, pick(st, free), z + 3, 5 + Math.floor(rnd(st) * 4));
  }
}

/** A ramp in one lane with candies high over it; maybe one thing in another lane. */
function rampRow(st: Stage, run: RunState, z: number): void {
  const lane = Math.floor(rnd(st) * 3);
  addObj(st, "obst", "ramp", lane, z);
  candyLine(st, lane, z + 3, 7, z + 9, 3.2);
  if (rnd(st) < 0.6) {
    const other = pick(st, [0, 1, 2].filter((l) => l !== lane));
    addObj(st, "obst", weighted(st, filterClear(theme(st).obstacles, false)), other, z + 1);
  }
  void run;
}

/** Where a thing moving at `vz` must start so that it is at `zMeet` when you are. */
function meetZ(st: Stage, run: RunState, zMeet: number, vz: number): number {
  const v = Math.max(4, targetSpeed(st, run));
  const t = (zMeet - st.dist) / v;
  return zMeet - vz * t;
}

// ------------------------------------------------------------------ your track

function record(st: Stage, d: number): void {
  st.hd.push(d);
  st.hx.push(st.x);
  st.hy.push(st.y);
  st.hk.push(st.duck > 0 ? 1 : 0);
}

/** Index of the last sample at or before `d`. */
function histIndex(st: Stage, d: number): number {
  let lo = 0;
  let hi = st.hd.length - 1;
  if (d <= st.hd[0]) return 0;
  if (d >= st.hd[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (st.hd[mid] <= d) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Where you were when you passed `d`: x, height, ducking. */
export function trackAt(st: Stage, d: number): { x: number; y: number; duck: boolean } {
  const i = histIndex(st, d);
  const j = Math.min(i + 1, st.hd.length - 1);
  const span = st.hd[j] - st.hd[i];
  const u = span > 1e-6 ? Math.max(0, Math.min(1, (d - st.hd[i]) / span)) : 0;
  return { x: st.hx[i] + (st.hx[j] - st.hx[i]) * u, y: st.hy[i] + (st.hy[j] - st.hy[i]) * u, duck: st.hk[i] > 0 };
}

/** Distance along the slope of kid `i` (0 = right behind you). */
export function kidDist(st: Stage, i: number, dist = st.dist): number { return dist - (i + 1) * KID_GAP; }

// ------------------------------------------------------------------ simulation

/** Advance the slope by `dt` seconds. */
export function step(st: Stage, run: RunState, dt: number, input: Input = {}): Ev[] {
  const evs: Ev[] = [];
  if (st.done || st.over || st.waiting) return evs;
  handleInput(st, input, evs);
  let left = Math.min(dt, 0.25);
  while (left > 1e-6 && !st.done && !st.over) {
    const h = Math.min(left, 1 / 60);
    tick(st, run, h, evs);
    left -= h;
  }
  return evs;
}

function blockedBeside(st: Stage, lane: number): Obj | null {
  for (const o of st.objs) {
    if (o.cat !== "obst" || o.hit || o.lane !== lane) continue;
    const d = OBSTACLES[o.kind as ObstId];
    if (d.soft || d.clear !== "none") continue;
    if (Math.abs(o.z - st.dist) < o.len / 2 + SLOPE.half - 0.15) return o;
  }
  return null;
}

function handleInput(st: Stage, input: Input, evs: Ev[]): void {
  if (input.dx) {
    const lane = st.lane + input.dx;
    if (st.zone === "ice" && st.y <= 0.001) {
      evs.push({ kind: "slip" });
    } else if (lane >= 0 && lane < st.lanes) {
      const wall = blockedBeside(st, lane);
      if (wall) {
        if (st.bumpT <= 0) { st.speed *= 0.8; st.bumpT = 0.5; }
        evs.push({ kind: "bump" });
      } else st.lane = lane;
    } else {
      evs.push({ kind: "bump" });
    }
  }
  if (input.jump && st.stun <= 0) {
    if (st.y <= 0.001) {
      st.vy = JUMP_V;
      st.duck = 0;
      evs.push({ kind: "jump" });
    } else if (st.flip <= 0 && st.y > 0.4) {
      // a flip in the air: land it, or land on your head
      st.flip = FLIP_T;
      evs.push({ kind: "flip" });
    }
  }
  if (input.duck && st.stun <= 0) {
    if (st.y > 0.001 && st.flip <= 0) st.vy = Math.min(st.vy, -15);
    st.duck = DUCK_T;
    evs.push({ kind: "duck" });
  }
}

function crash(st: Stage, run: RunState, evs: Ev[], what: string): void {
  if (st.power === "petard") { evs.push({ kind: "saved", by: "petard" }); return; }
  if (run.ride === "tube") {
    // bounce into a free lane next to you
    const opts = [st.lane - 1, st.lane + 1].filter((l) => l >= 0 && l < st.lanes && !blockedBeside(st, l));
    if (opts.length) {
      st.lane = opts[Math.floor(rnd(st) * opts.length)];
      st.speed *= 0.6;
      st.invuln = 0.5;
      const lost = st.kids.length ? 1 : 0;
      cutTail(st, st.kids.length - lost);
      evs.push({ kind: "bounce", what, lost });
      return;
    }
  }
  st.crashes++;
  st.invuln = 1.4;
  st.speed *= 0.3;
  st.stun = 0.35;
  st.flip = 0;
  st.duck = 0;
  // half the ватага tumbles off — unless the dog is pulling and this is the first time
  let lost = Math.ceil(st.kids.length / 2);
  if (run.hero === "brovko" && !st.dogUsed) { st.dogUsed = true; lost = 0; }
  cutTail(st, st.kids.length - lost);
  if (has(run, "ushanka") && !st.ushankaUsed) {
    st.ushankaUsed = true;
    evs.push({ kind: "saved", by: "ushanka" });
    evs.push({ kind: "crash", what, lost });
    return;
  }
  run.hearts--;
  evs.push({ kind: "crash", what, lost });
  if (run.hearts <= 0) {
    run.hearts = 0;
    st.over = true;
    evs.push({ kind: "over" });
  }
}

/** Keep the first `keep` kids; the rest fall off. */
function cutTail(st: Stage, keep: number): number {
  keep = Math.max(0, keep);
  const lost = st.kids.length - keep;
  if (lost > 0) {
    st.kids.length = keep;
    st.lost += lost;
  }
  return Math.max(0, lost);
}

function tick(st: Stage, run: RunState, dt: number, evs: Ev[]): void {
  st.t += dt;
  if (st.bumpT > 0) st.bumpT -= dt;
  if (st.invuln > 0) st.invuln -= dt;
  if (st.power) {
    st.powerT -= dt;
    if (st.powerT <= 0) { evs.push({ kind: "powerEnd", id: st.power }); st.power = null; }
  }
  // speed
  const target = targetSpeed(st, run);
  if (st.stun > 0) {
    st.stun -= dt;
    st.speed = Math.max(0, st.speed - 20 * dt);
  } else {
    const acc = st.zone === "ice" ? 16 : 7;
    st.speed = st.speed < target ? Math.min(target, st.speed + acc * dt) : Math.max(target, st.speed - 10 * dt);
  }
  const prev = st.dist;
  st.dist += st.speed * dt;
  // sideways
  const tx = laneX(st, st.lane);
  const dxs = tx - st.x;
  st.x += Math.sign(dxs) * Math.min(Math.abs(dxs), sideSpeed(run) * dt);
  // air
  if (st.y > 0 || st.vy > 0) {
    st.vy -= GRAVITY * dt;
    st.y += st.vy * dt;
    if (st.flip > 0) {
      st.flip -= dt;
      if (st.flip <= 0) {
        st.flip = 0;
        st.flips++;
        run.tricks++;
        const n = TRICK * (1 + 0.6 * count(run, "sweater")) * (run.hero === "ostap" ? 2 : 1) * (st.air ? 1.5 : 1);
        addCoins(st, run, n);
        evs.push({ kind: "trick", n: Math.round(n * candyMult(run, st)) });
      }
    }
    if (st.y <= 0) {
      st.y = 0;
      st.vy = 0;
      st.air = false;
      evs.push({ kind: "land" });
      if (st.flip > 0) {
        st.flip = 0;
        evs.push({ kind: "badFlip" });
        crash(st, run, evs, "невдале сальто");
        if (st.over) return;
      }
    }
  }
  if (st.duck > 0) st.duck -= dt;
  record(st, st.dist);
  // zones end
  if (st.zone && st.dist > st.zoneEnd) { st.zone = null; evs.push({ kind: "zoneEnd" }); }
  // the world
  for (const o of st.objs) {
    const pz = o.z;
    o.z += o.vz * dt;
    // the sack pulls candies in
    if (o.cat === "pick" && o.kind === "candy" && !o.hit && st.power === "sack") {
      const dz = o.z - st.dist;
      if (dz < (has(run, "bag") ? 26 : 16) && dz > -2) o.pulled = true;
    }
    if (o.pulled && !o.hit) {
      const k = Math.min(1, dt * 12);
      o.x += (st.x - o.x) * k;
      o.y += (st.y + 1 - o.y) * k;
      o.z += (st.dist + 0.3 - o.z) * k;
    }
    if (!o.hit) collide(st, run, o, pz, prev, evs);
    if (st.over) return;
  }
  // the ватага follows
  kidsFollow(st, run, prev, dt, evs);
  // tidy up the track and the slope
  st.cleanT -= dt;
  if (st.cleanT <= 0) {
    st.cleanT = 0.5;
    st.objs = st.objs.filter((o) => o.z > st.dist - KID_GAP * (st.crewMax + 2) - 10);
    const keepFrom = st.dist - KID_GAP * (st.crewMax + 3);
    const cut = histIndex(st, keepFrom);
    if (cut > 50) { st.hd.splice(0, cut); st.hx.splice(0, cut); st.hy.splice(0, cut); st.hk.splice(0, cut); }
  }
  generate(st, run);
  if (st.dist >= st.length) {
    st.done = true;
    evs.push({ kind: "finish" });
  }
}

function kidsFollow(st: Stage, run: RunState, prevDist: number, dt: number, evs: Ev[]): void {
  const side = kidSide(run);
  const immune = st.invuln > 0 || st.power === "petard";
  for (let i = 0; i < st.kids.length; i++) {
    const kid = st.kids[i];
    const kd = kidDist(st, i);
    const tr = trackAt(st, kd);
    const d = tr.x - kid.x;
    kid.x += Math.sign(d) * Math.min(Math.abs(d), side * dt);
    if (immune) continue;
    const kp = kidDist(st, i, prevDist);
    for (const o of st.objs) {
      if (o.cat !== "obst" || o.hit || o.kidHit) continue;
      const od = OBSTACLES[o.kind as ObstId];
      if (od.soft || od.clear === "zone" || od.clear === "ramp") continue;
      const near = Math.min(kp, kd) < o.z + o.len / 2 + 0.35 && Math.max(kp, kd) > o.z - o.len / 2 - 0.35;
      if (!near) continue;
      if (Math.abs(kid.x - o.x) > o.w / 2 + 0.25) continue;
      if (od.clear === "jump" && tr.y > 0.3) continue;
      if (od.clear === "duck" && tr.duck) continue;
      o.kidHit = true;
      if (has(run, "carol") && !st.carolUsed) {
        st.carolUsed = true;
        st.kids.splice(i, 1);
        st.lost++;
        evs.push({ kind: "tail", at: i, lost: 1, what: od.name });
        return;
      }
      const lost = cutTail(st, i);
      evs.push({ kind: "tail", at: i, lost, what: od.name });
      return;
    }
  }
}

function collide(st: Stage, run: RunState, o: Obj, objPrevZ: number, prevDist: number, evs: Ev[]): void {
  const relPrev = objPrevZ - prevDist;
  const relNow = o.z - st.dist;
  const near = Math.min(relPrev, relNow) - o.len / 2 < SLOPE.half && Math.max(relPrev, relNow) + o.len / 2 > -SLOPE.half;
  if (!near) return;
  const lat = Math.abs(st.x - o.x);
  const reach = o.w / 2 + SLOPE.width / 2;
  if (o.cat === "pick") {
    let r = reach + 0.35;
    if (o.kind === "kid" && has(run, "bell")) r += st.laneW;
    if (lat > r) return;
    if (o.kind === "candy" && Math.abs(st.y + 0.8 - o.y) > 1.3 && !o.pulled) return;
    o.hit = true;
    if (o.kind === "candy") addCoins(st, run, 1);
    else if (o.kind === "kid") joinKids(st, run, 1, evs);
    else if (o.kind === "star") { joinKids(st, run, 2, evs); evs.push({ kind: "power", id: "star" }); }
    else if (o.kind === "thermos") {
      if (run.hearts < run.maxHearts) run.hearts++;
      else addCoins(st, run, 15);
      evs.push({ kind: "power", id: "thermos" });
    } else {
      givePower(st, run, o.kind as PickId);
      evs.push({ kind: "power", id: o.kind as PickId });
    }
    return;
  }
  const d = OBSTACLES[o.kind as ObstId];
  if (d.clear === "zone") {
    if (lat > reach - 0.2 || st.y > 0.3) return;
    o.hit = true;
    st.zone = d.zone!;
    st.zoneEnd = o.z + o.len / 2;
    evs.push({ kind: "zone", zone: d.zone! });
    return;
  }
  if (d.clear === "ramp") {
    if (lat > reach - 0.2 || st.y > 0.2) return;
    o.hit = true;
    st.vy = RAMP_V;
    st.y = 0.05;
    st.air = true;
    st.duck = 0;
    evs.push({ kind: "ramp" });
    return;
  }
  if (lat > reach - 0.15) return;
  if (st.invuln > 0) return;
  if (d.clear === "jump" && st.y > 0.3) return;
  if (d.clear === "duck" && st.duck > 0) return;
  o.hit = true;
  if (st.power === "petard") { evs.push({ kind: "saved", by: "petard" }); return; }
  if (d.soft) {
    st.speed *= st.mod === "thaw" && o.kind === "drift" ? 0.45 : 0.6;
    evs.push({ kind: "stumble", what: d.name });
    return;
  }
  crash(st, run, evs, d.name);
}

function joinKids(st: Stage, run: RunState, n: number, evs: Ev[]): void {
  let added = 0;
  for (let i = 0; i < n; i++) {
    if (st.kids.length >= st.crewMax) break;
    const tr = trackAt(st, kidDist(st, st.kids.length));
    st.kids.push({ x: tr.x, look: rnd(st) });
    added++;
  }
  if (added) evs.push({ kind: "kid", n: st.kids.length });
  else { addCoins(st, run, 5); evs.push({ kind: "kidFull" }); }
  run.bestCrew = Math.max(run.bestCrew, st.kids.length);
}

function addCoins(st: Stage, run: RunState, n: number): void {
  st.coins += n * candyMult(run, st);
}

// ------------------------------------------------------------------ between slopes

/** Candies for every kid brought to the bottom. */
export function deliveryBonus(st: Stage, run: RunState): number {
  return Math.floor(st.kids.length * 8 * (1 + 0.25 * run.frost) * (1 + 0.25 * count(run, "pocket")));
}

export function finishStage(run: RunState, st: Stage): { last: boolean; bonus: number } {
  const bonus = deliveryBonus(st, run);
  const candies = Math.floor(st.coins) + bonus;
  run.coins += candies;
  run.crew = st.kids.length;
  run.lost += st.lost;
  run.history.push({ node: st.node, candies, time: st.t, crew: st.kids.length, tricks: st.flips, lost: st.lost });
  if (has(run, "thermos")) run.hearts = Math.min(run.maxHearts, run.hearts + 1);
  run.row++;
  if (run.row >= ROUTE_ROWS) {
    run.ending = "home";
    run.endTheme = st.theme;
    run.offer = null;
    return { last: true, bonus };
  }
  run.offer = offerPerks(run);
  return { last: false, bonus };
}

export function loseRun(run: RunState, st: Stage): EndingId {
  run.coins += Math.floor(st.coins);
  run.lost += st.lost;
  run.crew = 0;
  run.ending = "drift";
  run.endTheme = st.theme;
  return run.ending;
}

/** Mittens to choose from: stackable ones can repeat, rare ones turn up half as often. */
export function offerPerks(run: RunState, n = run.mitts): PerkId[] {
  const pool = PERKS.filter((p) => p.stack || !has(run, p.id));
  const out: PerkId[] = [];
  while (out.length < n && pool.length) {
    let total = 0;
    for (const p of pool) total += p.rare ? 0.5 : 1;
    let r = rnd(run) * total;
    let k = 0;
    for (; k < pool.length - 1; k++) { r -= pool[k].rare ? 0.5 : 1; if (r <= 0) break; }
    out.push(pool.splice(k, 1)[0].id);
  }
  return out;
}

export function choosePerk(run: RunState, id: PerkId | null): void {
  if (id) applyPerk(run, id);
  run.offer = null;
}

function applyPerk(run: RunState, id: PerkId): void {
  run.perks.push(id);
  if (id === "varenyky") { run.maxHearts++; run.hearts++; }
}

export function fairOffer(run: RunState): { id: PerkId; price: number }[] {
  return offerPerks(run, 3).map((id, i) => ({ id, price: 60 + 30 * run.row + i * 20 + (PERKS.find((p) => p.id === id)!.rare ? 40 : 0) }));
}

export function buyFair(run: RunState, id: PerkId): boolean {
  const item = run.fair?.find((f) => f.id === id);
  if (!item || run.coins < item.price) return false;
  run.coins -= item.price;
  applyPerk(run, id);
  run.fair = run.fair!.filter((f) => f.id !== id);
  return true;
}

/** Leave the fair: it counts as a row of the route. */
export function leaveFair(run: RunState): void {
  run.fair = null;
  run.row++;
}
