/**
 * Rules of «Тікай!». Pure TypeScript, no rendering: the run (six stages of a
 * route), the endless-runner simulation of one stage — lanes, jumps, slides,
 * the car, the things in the way, the chase behind you — and the roguelite
 * glue between stages (perks, escapes, coins, endings).
 *
 * The chase is a single number: `gap`, metres between you and the nearest
 * pursuer. They run at a steady pace a little slower than yours, so the gap
 * slowly grows while you run clean; every stumble or crash costs you speed,
 * and while you are slow they catch up. Gap 0 = caught.
 */
import {
  MAX_HEAT, OBSTACLES, PERKS, PICKUPS, STAGES, caughtEnding, traitById,
  type DecorId, type EndingId, type Mode, type ObstId, type PerkId, type PickId, type StageDef, type TraitId,
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

function rnd(s: { rng: number }): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick<T>(s: { rng: number }, xs: readonly T[]): T { return xs[Math.floor(rnd(s) * xs.length)]; }
function weighted<T extends string>(s: { rng: number }, w: Partial<Record<T, number>>): T {
  const entries = Object.entries(w) as [T, number][];
  let total = 0;
  for (const [, v] of entries) total += v;
  let r = rnd(s) * total;
  for (const [k, v] of entries) { r -= v; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

// ------------------------------------------------------------------ run

export interface StageResult { stage: number; coins: number; time: number; escaped: number }

export interface RunState {
  v: 1;
  seed: number;
  trait: TraitId;
  heat: number;
  /** Index into STAGES of the stage being played or next. */
  stage: number;
  /** Coins (in ₴) collected over the run. */
  coins: number;
  escapes: number;
  perks: PerkId[];
  history: StageResult[];
  ending: EndingId | null;
  rng: number;
  /** Perks offered after the last finished stage, until one is chosen. */
  offer: PerkId[] | null;
}

export const COIN_VALUE = 10;

export function newRun(seed: number, trait: TraitId = "it", heat = 0): RunState {
  const run: RunState = {
    v: 1, seed, trait, heat: Math.max(0, Math.min(MAX_HEAT, heat)), stage: 0, coins: 0, escapes: 1, perks: [], history: [], ending: null,
    rng: seed ^ 0x5bd1e995, offer: null,
  };
  if (trait === "nephew") run.escapes++;
  return run;
}

export function count(run: RunState, p: PerkId): number { return run.perks.filter((x) => x === p).length; }
export function has(run: RunState, p: PerkId): boolean { return run.perks.includes(p); }

export function coinMult(run: RunState): number {
  let m = 1 + 0.3 * count(run, "stash") + 0.25 * run.heat;
  if (run.trait === "it") m += 0.2;
  if (run.trait === "nephew") m -= 0.2;
  return m;
}

// ------------------------------------------------------------------ stage

export type Cat = "obst" | "pick" | "decor";

export interface Obj {
  id: number;
  cat: Cat;
  kind: ObstId | PickId | DecorId;
  lane: number;
  x: number;
  /** Lane-changing traffic and sweeping searchlights move towards this x. */
  tx: number;
  z: number;
  /** Height above the road (coins in arcs). */
  y: number;
  len: number;
  /** Width in metres. */
  w: number;
  vz: number;
  /** Already hit, collected or passed. */
  hit: boolean;
  /** Seconds of indicator before a lane change; <0 = will change when close, 0 = none. */
  blink: number;
  /** 0..1, picks a look. */
  look: number;
  /** Side of the road for decor (−1 left, 1 right). */
  side: number;
  /** Pulled by the magnet. */
  pulled: boolean;
  /** Part of a blockpost (its index). */
  bp: number;
}

export interface Input { dx?: -1 | 0 | 1; jump?: boolean; slide?: boolean; nitro?: boolean; honk?: boolean }

export type Ev =
  | { kind: "coin"; n: number }
  | { kind: "jump" } | { kind: "land" } | { kind: "slide" }
  | { kind: "stumble"; what: string; second: boolean }
  | { kind: "crash"; what: string }
  | { kind: "bump" }
  | { kind: "saved"; by: "scooter" | "lucky" | "energy" | "nitro" }
  | { kind: "power"; id: PickId }
  | { kind: "powerEnd"; id: PickId }
  | { kind: "babka"; side: number }
  | { kind: "near" }
  | { kind: "honk"; moved: boolean }
  | { kind: "nitro" }
  | { kind: "blockpost"; open: number[] }
  | { kind: "throughBlockpost" }
  | { kind: "caught" }
  | { kind: "finish" };

export interface Stage {
  idx: number;
  mode: Mode;
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
  slide: number;
  gap: number;
  gapMax: number;
  stun: number;
  /** Seconds since the last stumble window started; a second stumble inside it hurts more. */
  stumbleT: number;
  power: PickId | null;
  powerT: number;
  powerMax: number;
  /** Scooter: the next crash breaks the scooter instead. */
  shield: boolean;
  lucky: boolean;
  health: number;
  maxHealth: number;
  nitro: number;
  nitroT: number;
  honkT: number;
  objs: Obj[];
  nextZ: number;
  nextBp: number;
  bpCount: number;
  nextPower: number;
  seq: number;
  rng: number;
  coins: number;
  caught: boolean;
  done: boolean;
  /** How many times the player was caught and broke free on this stage. */
  escaped: number;
  /** Closed lanes of blockposts: traffic queues up in front of them. */
  walls: { lane: number; z: number }[];
  cleanT: number;
  bumpT: number;
  /** Seconds of grace after a crash or breaking free: obstacles do not hit. */
  invuln: number;
}

export const FOOT = { lanes: 3, laneW: 2.2, half: 0.35, width: 0.6, side: 15 };
export const CAR = { lanes: 4, laneW: 3.4, half: 2.1, width: 1.8, side: 13 };
const JUMP_V = 8.8;
const GRAVITY = 26;
const SLIDE_T = 0.66;

export function stageDef(st: Stage | number): StageDef { return STAGES[typeof st === "number" ? st : st.idx]; }
export function laneX(st: Stage, lane: number): number { return (lane - (st.lanes - 1) / 2) * st.laneW; }
export function roadHalf(st: Stage): number { return (st.lanes / 2) * st.laneW; }

export function targetSpeed(st: Stage, run: RunState): number {
  const d = stageDef(st);
  const k = Math.min(1, st.dist / d.length);
  let v = (d.speed[0] + (d.speed[1] - d.speed[0]) * k) * (1 + 0.05 * run.heat);
  if (st.power === "scooter") v *= 1.18;
  if (st.power === "energy") v *= 1.3;
  if (st.nitroT > 0) v *= 1.45;
  return v;
}

/** How fast the gap grows while you run clean, m/s. */
export function regen(st: Stage, run: RunState): number {
  let r = st.mode === "foot" ? 0.55 : 0.95;
  if (st.mode === "foot") r *= 1 + 0.35 * count(run, "sneakers") + (run.trait === "courier" ? 0.25 : 0);
  else if (has(run, "tint")) r *= 1.4;
  return r * (1 - 0.1 * run.heat);
}

function canVault(run: RunState): boolean { return has(run, "parkour") || run.trait === "athlete"; }

export function startStage(run: RunState): Stage {
  const def = STAGES[run.stage];
  const car = def.mode === "car";
  const L = car ? CAR : FOOT;
  const st: Stage = {
    idx: run.stage, mode: def.mode, lanes: L.lanes, laneW: L.laneW, length: def.length, dist: 0, t: 0,
    speed: def.speed[0] * 0.7, lane: Math.floor(L.lanes / 2), x: 0, y: 0, vy: 0, slide: 0,
    gap: (car ? 15 : 11) + (run.trait === "nephew" ? 4 : 0), gapMax: car ? 22 : 15, stun: 0, stumbleT: 0,
    power: null, powerT: 0, powerMax: 0, shield: false, lucky: has(run, "lucky"),
    health: 0, maxHealth: 0, nitro: 0, nitroT: 0, honkT: 0,
    objs: [], nextZ: car ? 110 : 34, nextBp: def.blockposts > 0 ? 340 : Infinity, bpCount: 0, nextPower: car ? 380 : 150, seq: 1,
    rng: (run.seed * 7919 + run.stage * 104729 + run.history.length * 31) | 0, coins: 0, caught: false, done: false, escaped: 0, walls: [], cleanT: 0, bumpT: 0, invuln: 0,
  };
  st.x = laneX(st, st.lane);
  if (car) {
    st.maxHealth = 3 + count(run, "taxi") + (run.trait === "taxi" ? 1 : 0);
    st.health = st.maxHealth;
    st.nitro = 1 + 2 * count(run, "nitro") + (run.trait === "taxi" ? 1 : 0);
  } else if (has(run, "scooterstart") || run.trait === "courier") {
    givePower(st, run, "scooter");
  }
  generate(st, run);
  return st;
}

function powerSecs(run: RunState, id: PickId): number {
  let s = PICKUPS[id].secs;
  if (has(run, "hoodie") && (id === "hood" || id === "scooter" || id === "energy")) s *= 2;
  if (has(run, "powerbank") && id === "magnet") s *= 2;
  return s;
}

function givePower(st: Stage, run: RunState, id: PickId): void {
  if (id === "nitro") { st.nitro++; return; }
  if (id === "repair") { st.health = Math.min(st.maxHealth, st.health + 1); return; }
  if (id === "coin") return;
  st.power = id;
  st.powerT = st.powerMax = powerSecs(run, id);
  st.shield = id === "scooter";
}

// ------------------------------------------------------------------ track generation

function addObj(st: Stage, cat: Cat, kind: Obj["kind"], lane: number, z: number, extra: Partial<Obj> = {}): Obj {
  const x = lane < 0 ? 0 : laneX(st, lane);
  let len = 0.8;
  let w = st.laneW * 0.5;
  if (cat === "obst") {
    const d = OBSTACLES[kind as ObstId];
    len = d.len;
    w = d.w * st.laneW;
  } else if (cat === "pick") {
    len = st.mode === "car" ? 2 : 0.8;
    w = st.mode === "car" ? 2.4 : 1.2;
  }
  const o: Obj = {
    id: st.seq++, cat, kind, lane, x, tx: x, z, y: 0, len, w, vz: 0, hit: false, blink: 0, look: rnd(st), side: 0, pulled: false, bp: -1, ...extra,
  };
  st.objs.push(o);
  return o;
}

/** Where a thing moving at `vz` must start so that it is at `zMeet` when you are. */
function meetZ(st: Stage, run: RunState, zMeet: number, vz: number): number {
  const v = targetSpeed(st, run);
  const t = (zMeet - st.dist) / v;
  return zMeet - vz * t;
}

const HORIZON = { foot: 150, car: 300 };

function density(st: Stage, run: RunState, z: number): number {
  const d = stageDef(st);
  const k = Math.min(1, z / d.length);
  return (d.density[0] + (d.density[1] - d.density[0]) * k) * (1 + 0.08 * run.heat);
}

function generate(st: Stage, run: RunState): void {
  const def = stageDef(st);
  const end = def.length;
  while (st.nextZ < Math.min(st.dist + HORIZON[st.mode], end - 25)) {
    const z = st.nextZ;
    if (z > st.nextBp - 110) {
      blockpost(st, run, st.nextBp);
      st.nextZ = st.nextBp + 60;
      st.nextBp += def.blockposts * (0.85 + rnd(st) * 0.3);
      if (st.nextBp > end - 120) st.nextBp = Infinity;
      continue;
    }
    if (st.mode === "car") carRow(st, run, z);
    else footRow(st, run, z);
    const gap = 100 / density(st, run, z);
    st.nextZ += gap * (0.8 + rnd(st) * 0.4);
  }
  if (!st.objs.some((o) => o.kind === "shelter")) {
    const s = addObj(st, "decor", "shelter", -1, end + 4);
    s.side = 0;
  }
}

function freeLanes(st: Stage, blocked: Set<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < st.lanes; i++) if (!blocked.has(i)) out.push(i);
  return out;
}

function powerHere(st: Stage, z: number): PickId | null {
  if (z < st.nextPower) return null;
  st.nextPower = z + (st.mode === "car" ? 420 : 210) * (0.8 + rnd(st) * 0.5);
  if (st.mode === "car") {
    const lowHealth = st.health < st.maxHealth;
    return weighted(st, { nitro: 3, repair: lowHealth ? 3 : 0.5, magnet: 2 } as Record<PickId, number>);
  }
  return weighted(st, { scooter: 2, hood: 2, magnet: 2.5, energy: 1.5 } as Record<PickId, number>);
}

function coinLine(st: Stage, lane: number, z: number, n: number, arcOver = -1): void {
  const step = st.mode === "car" ? 6 : 2.3;
  for (let i = 0; i < n; i++) {
    const zz = z + i * step;
    let y = st.mode === "car" ? 1 : 0.75;
    if (arcOver >= 0) {
      const u = (zz - (arcOver - 3)) / 6;
      if (u > 0 && u < 1) y += Math.sin(u * Math.PI) * 1.6;
    }
    addObj(st, "pick", "coin", lane, zz, { y });
  }
}

function footRow(st: Stage, run: RunState, z: number): void {
  const def = stageDef(st);
  const r = rnd(st);
  const k = r < 0.42 ? 1 : r < 0.88 ? 2 : 3;
  const lanes = [0, 1, 2].sort(() => rnd(st) - 0.5).slice(0, k);
  const blocked = new Set<number>();
  let passable = false;
  const kinds: ObstId[] = [];
  for (const lane of lanes) {
    let kind = weighted(st, def.obstacles);
    // a full row must leave at least one jump or slide
    if (k === 3 && lane === lanes[2] && !passable) kind = weighted(st, filterClear(def.obstacles, true));
    // moving things only in rows with a free lane, and the searchlight alone
    if ((OBSTACLES[kind].moving && k === 3) || (kind === "spot" && k > 1)) kind = weighted(st, filterClear(def.obstacles, k === 3));
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
      if (kind !== "spot") zz = meetZ(st, run, z, vz);
    }
    const o = addObj(st, "obst", kind, lane, zz, { vz: kind === "spot" ? 0 : vz });
    if (kind === "spot") {
      // the searchlight sweeps across the road instead of moving along it
      o.blink = vz;
      o.tx = laneX(st, pick(st, [0, 2].filter((l) => l !== lane).concat(lane === 1 ? [0] : [1])));
    }
  });
  // coins and power-ups
  const free = freeLanes(st, blocked);
  const pw = powerHere(st, z);
  if (pw && free.length) {
    addObj(st, "pick", pw, pick(st, free), z + 6, { y: 1 });
  } else if (rnd(st) < 0.6) {
    const jumpable = lanes.filter((_l, i) => OBSTACLES[kinds[i]].clear === "jump" && !OBSTACLES[kinds[i]].moving);
    if (jumpable.length && rnd(st) < 0.45) coinLine(st, jumpable[0], z - 3, 4, z);
    else if (free.length) coinLine(st, pick(st, free), z + 3, 5 + Math.floor(rnd(st) * 4));
  }
  // a babusia on a bench by the road
  if (rnd(st) < def.babka) {
    const side = rnd(st) < 0.5 ? -1 : 1;
    const b = addObj(st, "decor", "babka", -1, z + 8, { side });
    b.x = side * (roadHalf(st) + 1.1);
    b.tx = b.x;
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
  if (!Object.keys(out).length) out[needPassable ? "fence" : "bins"] = 1;
  return out;
}

function carRow(st: Stage, run: RunState, z: number): void {
  const def = stageDef(st);
  const r = rnd(st);
  const k = r < 0.4 ? 1 : r < 0.85 ? 2 : 3;
  const order = Array.from({ length: st.lanes }, (_, i) => i).sort(() => rnd(st) - 0.5);
  const lanes = order.slice(0, k);
  const blocked = new Set<number>(lanes);
  for (const lane of lanes) {
    const kind = weighted(st, def.obstacles);
    const d = OBSTACLES[kind];
    if (d.moving) {
      // the slow lane is on the right
      const laneK = lane / (st.lanes - 1);
      const vz = d.moving[1] - (d.moving[1] - d.moving[0]) * (0.3 * rnd(st) + 0.7 * laneK);
      const zs = meetZ(st, run, z, vz);
      const x = laneX(st, lane);
      if (st.objs.some((p) => p.cat === "obst" && Math.abs(p.x - x) < st.laneW * 0.7 && Math.abs(p.z - zs) < (p.len + d.len) / 2 + 6)) { blocked.delete(lane); continue; }
      const o = addObj(st, "obst", kind, lane, zs, { vz });
      if (kind === "traffic" && rnd(st) < 0.18 + 0.04 * run.heat) o.blink = -1;
    } else {
      addObj(st, "obst", kind, lane, z);
    }
  }
  const free = freeLanes(st, blocked);
  const pw = powerHere(st, z);
  if (pw && free.length) addObj(st, "pick", pw, pick(st, free), z + 10, { y: 1.1 });
  else if (free.length && rnd(st) < 0.5) coinLine(st, pick(st, free), z + 8, 4 + Math.floor(rnd(st) * 4));
}

function blockpost(st: Stage, run: RunState, zb: number): void {
  const bp = st.bpCount++;
  const openN = run.heat >= 2 || rnd(st) < 0.45 ? 1 : 2;
  const order = Array.from({ length: st.lanes }, (_, i) => i).sort(() => rnd(st) - 0.5);
  const open = order.slice(0, openN).sort();
  // warning signs, cones and sometimes spikes on the approach
  for (const side of [-1, 1]) {
    const s = addObj(st, "decor", "sign", -1, zb - 85, { side, bp });
    s.x = s.tx = side * (roadHalf(st) + 1.6);
  }
  const coneLanes = order.slice(openN).slice(0, 1 + Math.floor(rnd(st) * 2));
  for (const l of coneLanes) addObj(st, "obst", rnd(st) < 0.25 + 0.1 * run.heat ? "spikes" : "cones", l, zb - 45 - rnd(st) * 15, { bp });
  for (let lane = 0; lane < st.lanes; lane++) {
    if (open.includes(lane)) {
      if (rnd(st) < 0.65) addObj(st, "obst", "boom", lane, zb, { bp });
      coinLine(st, lane, zb - 30, 5);
    } else {
      addObj(st, "obst", pick(st, ["blocks", "hedgehog", "blocks", "patrol"] as const), lane, zb, { bp });
      st.walls.push({ lane, z: zb });
    }
  }
  for (const side of [-1, 1]) {
    const s = addObj(st, "decor", "soldier", -1, zb + 2, { side, bp });
    s.x = s.tx = side * (roadHalf(st) + 1.3);
  }
}

/** The next blockpost ahead: where it is and which lanes are open. */
export function nextBlockpost(st: Stage): { z: number; open: number[] } | null {
  let best: { z: number; open: number[] } | null = null;
  for (const o of st.objs) {
    if (o.bp < 0 || o.cat !== "obst" || o.z < st.dist) continue;
    if (o.kind === "cones" || o.kind === "spikes") continue;
    if (!best || o.z < best.z - 1) best = { z: o.z, open: [] };
  }
  if (!best) return null;
  const row = st.objs.filter((o) => o.bp >= 0 && o.cat === "obst" && Math.abs(o.z - best!.z) < 1);
  for (let l = 0; l < st.lanes; l++) if (!row.some((o) => o.lane === l && o.kind !== "boom")) best.open.push(l);
  return best;
}

// ------------------------------------------------------------------ simulation

/** Advance the stage by `dt` seconds. */
export function step(st: Stage, run: RunState, dt: number, input: Input = {}): Ev[] {
  const evs: Ev[] = [];
  if (st.caught || st.done) return evs;
  handleInput(st, run, input, evs);
  let left = Math.min(dt, 0.25);
  while (left > 1e-6 && !st.caught && !st.done) {
    const h = Math.min(left, 1 / 60);
    tick(st, run, h, evs);
    left -= h;
  }
  return evs;
}

function blockedBeside(st: Stage, run: RunState, lane: number): Obj | null {
  const L = st.mode === "car" ? CAR : FOOT;
  for (const o of st.objs) {
    if (o.cat !== "obst" || o.hit || o.lane !== lane) continue;
    const d = OBSTACLES[o.kind as ObstId];
    if (d.soft || d.clear !== "none") continue;
    if (st.mode === "foot" && st.y > 0.3 && d.vault && canVault(run)) continue;
    if (Math.abs(o.z - st.dist) < o.len / 2 + L.half - 0.15) return o;
  }
  return null;
}

function handleInput(st: Stage, run: RunState, input: Input, evs: Ev[]): void {
  if (input.dx) {
    const lane = st.lane + input.dx;
    if (lane >= 0 && lane < st.lanes) {
      const wall = blockedBeside(st, run, lane);
      if (wall) {
        // by car you scrape and stay in your lane; on foot you stumble
        if (st.bumpT <= 0) {
          if (st.mode === "car") st.speed *= 0.9;
          else stumble(st, run, evs, OBSTACLES[wall.kind as ObstId].name, true);
          st.bumpT = 0.6;
        }
        evs.push({ kind: "bump" });
      } else st.lane = lane;
    } else {
      evs.push({ kind: "bump" });
    }
  }
  if (st.mode === "foot") {
    if (input.jump && st.y <= 0.001 && st.stun <= 0) {
      st.vy = JUMP_V * (canVault(run) ? 1.06 : 1);
      st.slide = 0;
      evs.push({ kind: "jump" });
    }
    if (input.slide && st.stun <= 0) {
      if (st.y > 0.001) st.vy = Math.min(st.vy, -15);
      st.slide = SLIDE_T;
      evs.push({ kind: "slide" });
    }
  } else {
    if (input.nitro && st.nitro > 0 && st.nitroT <= 0) {
      st.nitro--;
      st.nitroT = 2.6;
      evs.push({ kind: "nitro" });
    }
    if (input.honk && st.honkT <= 0) {
      st.honkT = 2.5;
      evs.push({ kind: "honk", moved: honk(st) });
    }
  }
}

/** The car ahead in your lane moves over if it can, or speeds up. */
function honk(st: Stage): boolean {
  let ahead: Obj | null = null;
  for (const o of st.objs) {
    if (o.cat !== "obst" || o.hit || o.vz <= 0 || o.lane !== st.lane) continue;
    const dz = o.z - st.dist;
    if (dz > 0 && dz < 70 && (!ahead || dz < ahead.z - st.dist)) ahead = o;
  }
  if (!ahead) return false;
  for (const l of [ahead.lane - 1, ahead.lane + 1].sort(() => Math.random() - 0.5)) {
    if (l < 0 || l >= st.lanes) continue;
    const busy = st.objs.some((o) => o !== ahead && o.cat === "obst" && !o.hit && o.lane === l && Math.abs(o.z - ahead!.z) < 14);
    if (!busy) {
      ahead.lane = l;
      ahead.tx = laneX(st, l);
      ahead.blink = 0;
      return true;
    }
  }
  ahead.vz += 6;
  return false;
}

function stumble(st: Stage, run: RunState, evs: Ev[], what: string, side = false): void {
  const second = st.stumbleT > 0;
  const keep = st.mode === "car" ? 0.72 : side ? 0.7 : 0.55;
  st.speed *= second ? keep * 0.7 : keep;
  st.stumbleT = 3.2;
  evs.push({ kind: "stumble", what, second });
  void run;
}

function crash(st: Stage, evs: Ev[], what: string): void {
  if (st.power === "energy") { evs.push({ kind: "saved", by: "energy" }); return; }
  if (st.shield) {
    st.shield = false;
    st.power = null;
    st.powerT = 0;
    st.speed *= 0.6;
    evs.push({ kind: "saved", by: "scooter" }, { kind: "powerEnd", id: "scooter" });
    return;
  }
  if (st.lucky) {
    st.lucky = false;
    st.speed *= 0.5;
    evs.push({ kind: "saved", by: "lucky" });
    return;
  }
  evs.push({ kind: "crash", what });
  st.invuln = st.mode === "car" ? 0.9 : 0.6;
  if (st.mode === "foot") {
    st.speed = 0;
    st.stun = 0.4;
    st.y = 0;
    st.vy = 0;
    st.slide = 0;
  } else {
    st.health--;
    st.speed *= 0.6;
    st.nitroT = 0;
    if (st.health <= 0) { st.caught = true; evs.push({ kind: "caught" }); }
  }
}

function tick(st: Stage, run: RunState, dt: number, evs: Ev[]): void {
  const L = st.mode === "car" ? CAR : FOOT;
  st.t += dt;
  // timers
  if (st.stumbleT > 0) st.stumbleT -= dt;
  if (st.honkT > 0) st.honkT -= dt;
  if (st.bumpT > 0) st.bumpT -= dt;
  if (st.invuln > 0) st.invuln -= dt;
  if (st.nitroT > 0) st.nitroT -= dt;
  if (st.power) {
    st.powerT -= dt;
    if (st.powerT <= 0) { evs.push({ kind: "powerEnd", id: st.power }); st.power = null; st.shield = false; }
  }
  // speed
  const target = targetSpeed(st, run);
  if (st.stun > 0) {
    st.stun -= dt;
    st.speed = 0;
  } else {
    const acc = st.mode === "car" ? 14 : has(run, "pie") || run.trait === "athlete" ? 14 : 9;
    st.speed = st.speed < target ? Math.min(target, st.speed + acc * dt) : Math.max(target, st.speed - 12 * dt);
  }
  const prev = st.dist;
  st.dist += st.speed * dt;
  // sideways
  const tx = laneX(st, st.lane);
  const dxs = tx - st.x;
  st.x += Math.sign(dxs) * Math.min(Math.abs(dxs), L.side * dt);
  // jump and slide
  if (st.mode === "foot") {
    if (st.y > 0 || st.vy > 0) {
      st.vy -= GRAVITY * dt;
      st.y += st.vy * dt;
      if (st.y <= 0) {
        st.y = 0;
        st.vy = 0;
        evs.push({ kind: "land" });
      }
    }
    if (st.slide > 0) st.slide -= dt;
  }
  // the chase
  const chase = targetSpeed(st, run) / (st.power === "scooter" ? 1.18 : st.power === "energy" ? 1.3 : st.nitroT > 0 ? 1.45 : 1) - regen(st, run);
  st.gap += (st.speed - chase) * dt;
  if (st.power === "hood") st.gap += 3.2 * dt;
  st.gap = Math.min(st.gap, st.gapMax);
  // the world moves
  for (const o of st.objs) {
    const pz = o.z;
    if (o.vz > 0 && o.cat === "obst") follow(st, o, dt);
    if (o.vz > 0 && st.walls.length) {
      // queue up in front of a closed lane of a blockpost
      for (const w of st.walls) {
        if (w.lane === o.lane && w.z > o.z && w.z - o.z < 30 + o.len) { o.vz = Math.max(0, o.vz - 14 * dt); o.blink = 0; }
      }
    }
    o.z += o.vz * dt;
    if (o.kind === "spot" && !o.hit) {
      // sweep between two lanes
      const a = laneX(st, o.lane);
      const k = (Math.sin(st.t * o.blink * 0.9 + o.look * 6) + 1) / 2;
      o.x = a + (o.tx - a) * k;
    } else if (o.blink < 0 && o.z - st.dist < 60 && o.z > st.dist) {
      o.blink = 1.1;
    } else if (o.blink > 0) {
      o.blink -= dt;
      if (o.blink <= 0) {
        const opts = [o.lane - 1, o.lane + 1].filter((l) => l >= 0 && l < st.lanes);
        const l = opts[Math.floor(o.look * opts.length)];
        const busy = st.objs.some((p) => p !== o && p.cat === "obst" && p.lane === l && Math.abs(p.z - o.z) < 12);
        if (!busy) { o.lane = l; o.tx = laneX(st, l); }
        o.blink = 0;
      }
    } else if (o.x !== o.tx && o.cat === "obst") {
      const d = o.tx - o.x;
      o.x += Math.sign(d) * Math.min(Math.abs(d), 3.2 * dt);
    }
    // magnet
    if (o.cat === "pick" && o.kind === "coin" && !o.hit && st.power === "magnet") {
      const dz = o.z - st.dist;
      const reach = has(run, "powerbank") ? 26 : 16;
      if (dz < reach && dz > -2) o.pulled = true;
    }
    if (o.pulled && !o.hit) {
      const k = Math.min(1, dt * 12);
      o.x += (st.x - o.x) * k;
      o.y += (1 - o.y) * k;
      o.z += (st.dist + 0.3 - o.z) * k;
    }
    if (o.hit) continue;
    collide(st, run, o, pz, prev, evs);
    if (st.caught) return;
  }
  if (st.gap <= 0) {
    st.gap = 0;
    st.caught = true;
    evs.push({ kind: "caught" });
    return;
  }
  // clean up and generate
  st.cleanT -= dt;
  if (st.cleanT <= 0) {
    st.cleanT = 0.5;
    st.objs = st.objs.filter((o) => o.z > st.dist - 40 || o.kind === "shelter");
    st.walls = st.walls.filter((w) => w.z > st.dist - 40);
  }
  generate(st, run);
  if (st.dist >= st.length) {
    st.done = true;
    evs.push({ kind: "finish" });
  }
}

/** Traffic keeps its distance: a faster car slows down behind a slower one instead of driving through it. */
function follow(st: Stage, o: Obj, dt: number): void {
  let ahead: Obj | null = null;
  for (const p of st.objs) {
    if (p === o || p.cat !== "obst" || p.z <= o.z || Math.abs(p.x - o.x) > st.laneW * 0.7) continue;
    if (!ahead || p.z < ahead.z) ahead = p;
  }
  if (!ahead) return;
  const room = ahead.z - o.z - (ahead.len + o.len) / 2;
  if (room < 14 && o.vz > ahead.vz) o.vz = Math.max(ahead.vz, o.vz - 20 * dt);
  if (room < 1.5) { o.vz = Math.min(o.vz, ahead.vz); o.z = Math.min(o.z, ahead.z - (ahead.len + o.len) / 2 - 1.5); }
}

function collide(st: Stage, run: RunState, o: Obj, objPrevZ: number, prevDist: number, evs: Ev[]): void {
  const L = st.mode === "car" ? CAR : FOOT;
  const relPrev = objPrevZ - prevDist;
  const relNow = o.z - st.dist;
  // decor: babusias call it in, soldiers wave, blockposts are passed
  if (o.cat === "decor") {
    if (relNow < 0 && relPrev >= 0) {
      o.hit = true;
      if (o.kind === "babka" && Math.abs(st.x - o.x) < st.laneW * 1.6 && st.power !== "hood" && !has(run, "chat")) {
        st.gap -= 3.5;
        evs.push({ kind: "babka", side: o.side });
      }
      if (o.kind === "soldier" && o.side < 0) evs.push({ kind: "throughBlockpost" });
      if (o.kind === "sign" && o.side < 0) {
        const bp = nextBlockpost(st);
        if (bp) evs.push({ kind: "blockpost", open: bp.open });
      }
    }
    return;
  }
  const near = Math.min(relPrev, relNow) - o.len / 2 < L.half && Math.max(relPrev, relNow) + o.len / 2 > -L.half;
  const lat = Math.abs(st.x - o.x);
  const reach = o.w / 2 + L.width / 2;
  // near miss bonus by car
  if (st.mode === "car" && o.cat === "obst" && o.vz > 0 && relNow < -o.len / 2 && relPrev >= -o.len / 2 && lat < reach + 1.2 && lat >= reach - 0.25) {
    o.hit = true;
    evs.push({ kind: "near" });
    addCoins(st, run, 3);
    return;
  }
  if (!near) return;
  if (o.cat === "pick") {
    if (lat > reach + (st.mode === "car" ? 0.2 : 0.35)) return;
    if (o.kind === "coin" && st.mode === "foot" && Math.abs(st.y + 0.75 - o.y) > 1.3 && !o.pulled) return;
    o.hit = true;
    if (o.kind === "coin") addCoins(st, run, 1);
    else {
      givePower(st, run, o.kind as PickId);
      evs.push({ kind: "power", id: o.kind as PickId });
    }
    return;
  }
  if (lat > reach - 0.15) return;
  if (st.invuln > 0) return;
  const d = OBSTACLES[o.kind as ObstId];
  // what clears it
  if (d.clear === "jump" && st.y > 0.3) return;
  if (d.clear === "slide" && st.slide > 0) return;
  if (d.vault && canVault(run) && st.y > 0.3) return;
  if ((o.kind === "dog" || o.kind === "geese") && has(run, "dog")) return;
  if (o.kind === "spot" && (st.power === "hood" || st.power === "energy")) return;
  if ((o.kind === "pothole" || o.kind === "spikes" || o.kind === "cones") && has(run, "tires")) return;
  o.hit = true;
  if (d.soft) {
    if (st.mode === "car" && (st.nitroT > 0 || o.kind === "boom")) {
      // a barrier arm is not a wall; nitro goes through anything soft
      if (st.nitroT <= 0) st.speed *= 0.8;
      evs.push({ kind: "bump" });
      return;
    }
    if (st.power === "energy") { evs.push({ kind: "saved", by: "energy" }); return; }
    if (d.dent) crash(st, evs, d.name);
    else if (o.kind === "spot") { st.gap -= 4; stumble(st, run, evs, d.name); }
    else stumble(st, run, evs, d.name);
    return;
  }
  // scraping the side of a car while changing lanes is a stumble, not a crash
  if (st.mode === "car" && lat > reach - 0.9 && o.vz > 0) {
    stumble(st, run, evs, d.name, true);
    o.x += Math.sign(o.x - st.x) * 0.6;
    return;
  }
  crash(st, evs, d.name);
}

function addCoins(st: Stage, run: RunState, n: number): void {
  st.coins += n * COIN_VALUE * coinMult(run);
}

// ------------------------------------------------------------------ between stages

/** Caught: break free if you still have a chance. Returns false when the run ends. */
export function canBreakFree(run: RunState): boolean { return run.escapes > 0; }

export function breakFree(st: Stage, run: RunState): void {
  run.escapes--;
  st.escaped++;
  st.caught = false;
  st.gap = st.mode === "car" ? 10 : 6.5;
  st.stun = 0;
  st.speed = targetSpeed(st, run) * 0.6;
  st.stumbleT = 0;
  st.invuln = 1.6;
  if (st.mode === "car") st.health = Math.max(st.health, 1);
  // clear what is right in front so you do not crash straight away
  for (const o of st.objs) if (o.cat === "obst" && o.z - st.dist < (st.mode === "car" ? 50 : 12) && o.z > st.dist - 5) o.hit = true;
}

export function loseRun(run: RunState, st: Stage): EndingId {
  run.coins += Math.floor(st.coins);
  run.ending = caughtEnding(stageDef(st));
  return run.ending;
}

/** Perks that can still matter on the stages left. */
export function offerPerks(run: RunState): PerkId[] {
  const left = new Set(STAGES.slice(run.stage).map((s) => s.mode));
  const pool = PERKS.filter((p) => (!p.mode || left.has(p.mode)) && (p.stack || !has(run, p.id)))
    .filter((p) => !(p.id === "parkour" && run.trait === "athlete") && !(p.id === "scooterstart" && run.trait === "courier"));
  const out: PerkId[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd(run) * pool.length), 1)[0].id);
  return out;
}

export function finishStage(run: RunState, st: Stage): { last: boolean } {
  run.coins += Math.floor(st.coins);
  run.history.push({ stage: st.idx, coins: Math.floor(st.coins), time: st.t, escaped: st.escaped });
  run.stage++;
  if (run.stage >= STAGES.length) {
    run.ending = "river";
    run.offer = null;
    return { last: true };
  }
  run.offer = offerPerks(run);
  return { last: false };
}

export function choosePerk(run: RunState, id: PerkId | null): void {
  if (id) {
    run.perks.push(id);
    if (id === "lawyer") run.escapes++;
  }
  run.offer = null;
}

export function traitName(id: TraitId): string { return traitById(id).name; }
