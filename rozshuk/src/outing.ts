/**
 * One outing (вилазка): pure stealth simulation on a grid map. No rendering
 * imports — the 3D scene draws this state and forwards input, and the node
 * tests drive it directly.
 *
 * Patrols walk their routes and see in cones. Being seen fills their
 * suspicion; full suspicion means a chase. Hiding (standing still in a bush or
 * doorway) makes you nearly invisible, sprinting is loud, babusias call it in,
 * dogs bark. If a chaser reaches you a chain of QTEs decides the run.
 */

import { BOOTH, TALKS, type LevelDef, type ObjectiveDef, type PatrolDef, type PatrolKind } from "./content.ts";
import { CELL, MAPS, blocksMove, blocksSight, isHide, isWaypoint } from "./maps.ts";
import {
  Qte, choiceSpec, holdSpec, mashSpec, swipeSpec, timingSpec, type QteMods, type QteSpec,
} from "./qte.ts";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const angleDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const turnToward = (from: number, to: number, maxStep: number) => from + clamp(angleDiff(from, to), -maxStep, maxStep);
/** Facing angle for a direction; forward is (sin a, cos a) in x/z. */
const heading = (dx: number, dz: number) => Math.atan2(dx, dz);

export interface Pt { x: number; z: number }

export interface OutingContext {
  level: LevelDef;
  seed: number;
  heat: number;
  perks: string[];
  items: string[];
  flags: Record<string, boolean>;
  trait: string;
  /** Patrol routes revealed (chat «Де бус?» or a tip). */
  intel: boolean;
  money: number;
  nerves: number;
  satiety: number;
  /** Did push-ups at home. */
  pumped: boolean;
  /** Officers heard you through the door and wait in the yard. */
  doorWatch: boolean;
  /** Shop price multiplier. */
  prices: number;
}

export type PatrolState = "route" | "pause" | "look" | "investigate" | "chase" | "search" | "return" | "stunned" | "parked";

export interface Patrol {
  id: number;
  kind: PatrolKind;
  x: number;
  z: number;
  dir: number;
  state: PatrolState;
  suspicion: number;
  /** 0..1 how well it sees the player this frame. */
  seeing: number;
  route: Pt[];
  ping: boolean;
  wp: number;
  wpStep: number;
  path: Pt[];
  timer: number;
  scanBase: number;
  lastSeen: Pt;
  losT: number;
  repath: number;
  seenFor: number;
  ignoreT: number;
  /** Spawned out of a van; walks back and vanishes after losing you. */
  home?: Pt;
  moving: boolean;
  /** Visual walk cycle phase. */
  step: number;
  /** Van that spawned officers waits. */
  spawned: boolean;
}

export interface Babka { x: number; z: number; suspicion: number; cooldown: number; friendly: boolean; calling: number }
export interface Dog { x: number; z: number; cooldown: number; barking: number }

export interface ObjState {
  def: ObjectiveDef;
  slot: string;
  x: number;
  z: number;
  progress: number;
  done: boolean;
  /** Completed without paying in full. */
  short: boolean;
}

export type Ctx = "grab" | "escape" | "talkout" | "van" | "vault" | "talk" | "river" | "booth" | "bluff";

export type OutingEvent =
  | { type: "spotted"; id: number }
  | { type: "suspicious"; id: number }
  | { type: "heard"; id: number }
  | { type: "lost"; id: number }
  | { type: "grab"; id: number }
  | { type: "qte"; qte: Qte; ctx: Ctx }
  | { type: "qteEnd"; ctx: Ctx; ok: boolean }
  | { type: "say"; id: number | "me" | "babka"; text: string; x: number; z: number }
  | { type: "freed"; how: "break" | "talk" | "docs" | "van" | "lawyer" | "dog" }
  | { type: "caught" }
  | { type: "objDone"; slot: string; short: boolean }
  | { type: "noMoney"; slot: string }
  | { type: "babkaCall"; x: number; z: number }
  | { type: "bark"; x: number; z: number }
  | { type: "vanStop"; id: number }
  | { type: "droneSpot"; id: number }
  | { type: "curfew" }
  | { type: "exitOpen" }
  | { type: "vault"; ok: boolean }
  | { type: "riverFail" }
  | { type: "won" }
  | { type: "step" }
  | { type: "noise"; x: number; z: number; r: number };

export interface OutingResult {
  won: boolean;
  caught: boolean;
  spotted: number;
  escapes: number;
  heat: number;
  money: number;
  food: number;
  nerves: number;
  items: string[];
  flags: string[];
  unpaid: string[];
  perfect: boolean;
  time: number;
  lawyerUsed: boolean;
}

interface KindStats { speed: number; chase: number; fov: number; range: number; rate: number }
const KIND: Record<PatrolKind, KindStats> = {
  officer: { speed: 1.75, chase: 4.55, fov: 0.68, range: 9, rate: 1 },
  police: { speed: 1.9, chase: 4.8, fov: 0.7, range: 9.5, rate: 1 },
  guard: { speed: 1.8, chase: 4.75, fov: 0.74, range: 10.5, rate: 1.1 },
  van: { speed: 5.2, chase: 0, fov: 0.5, range: 13, rate: 1.35 },
  drone: { speed: 2.6, chase: 0, fov: Math.PI, range: 4.3, rate: 1.25 },
  boat: { speed: 2.6, chase: 0, fov: 0.42, range: 14, rate: 1.2 },
};

const SHOUT_SPOT = ["Стояти!", "Чоловіче, документи!", "Куди зібрався?", "Агов! Ти!", "Е, ну-ка стій!", "Молодий чоловік!"];
const SHOUT_LOST = ["Та де він…", "Втік, падлюка", "Ну нічого, ще побачимось", "Шукай-шукай…"];
const SHOUT_HUH = ["Хм?", "Шо там?", "Шось шурхнуло…", "Ану…"];
const BABKA_CALL = ["Алло, Галю? Тут один ходить…", "Синку, а ти чого не на фронті?", "Я все бачу!"];

export const PLAYER_R = 0.32;
const PATROL_R = 0.3;
const GRAB_DIST = 0.95;

export class OutingSim {
  readonly ctx: OutingContext;
  readonly level: LevelDef;
  readonly rows: string[];
  readonly w: number;
  readonly h: number;
  readonly rng: () => number;
  /** Cells after per-run randomisation (some bushes missing). */
  readonly cells: string[][];
  phase: "explore" | "qte" | "won" | "caught" = "explore";
  time = 0;
  px = 0;
  pz = 0;
  facing = Math.PI;
  speedNow = 0;
  moveX = 0;
  moveZ = 0;
  sprintHeld = false;
  sprinting = false;
  stamina = 100;
  staminaMax = 100;
  private staminaDelay = 0;
  hidden = false;
  inHide = false;
  private stillT = 0;
  private noiseT = 0;
  private stepT = 0;
  start: Pt = { x: 0, z: 0 };
  exit: Pt = { x: 0, z: 0 };
  exitOpen = false;
  patrols: Patrol[] = [];
  babki: Babka[] = [];
  dogs: Dog[] = [];
  objectives: ObjState[] = [];
  waypoints = new Map<string, Pt>();
  qte: Qte | null = null;
  qteCtx: Ctx | null = null;
  grabbedBy = -1;
  curfewOn = false;
  dwelling: ObjState | null = null;
  /** Something to vault right now (fence cell). */
  vaultCell: { r: number; c: number; to: Pt } | null = null;
  // bookkeeping for the run
  spotted = 0;
  escapes = 0;
  heatGain = 0;
  moneyDelta = 0;
  foodDelta = 0;
  nervesDelta = 0;
  items: string[] = [];
  flagsSet: string[] = [];
  unpaid: string[] = [];
  lawyerUsed = false;
  private riverFails = 0;
  private boothStep = 0;
  private boothFails = 0;
  private nextId = 1;
  private talkKey = "";
  private mods: QteMods;
  private heatMult: number;
  private events: OutingEvent[] = [];

  constructor(ctx: OutingContext) {
    this.ctx = ctx;
    this.level = ctx.level;
    this.rng = mulberry32(ctx.seed);
    const map = MAPS[ctx.level.map];
    this.rows = map.rows;
    this.h = this.rows.length;
    this.w = this.rows[0].length;
    this.cells = this.rows.map((row) => row.split("").map((ch) => (ch === "*" && this.rng() < 0.18 ? "." : ch)));
    this.heatMult = 1 + clamp(ctx.heat, 0, 100) / 100 * 0.6;
    const has = (p: string) => ctx.perks.includes(p);

    // stamina
    let st = 100;
    if (has("sneakers")) st *= 1.35;
    if (ctx.trait === "athlete") st *= 1.4;
    if (ctx.pumped) st *= 1.3;
    if (ctx.satiety < 15) st *= 0.6;
    this.staminaMax = st;
    this.stamina = st;

    // QTE knobs
    let power = 1;
    if (has("sneakers")) power *= 1.25;
    if (ctx.trait === "athlete") power *= 1.2;
    if (ctx.satiety < 15) power *= 0.8;
    let zone = has("parkour") ? 1.4 : 1;
    let time = 1;
    if (ctx.nerves > 75) { zone *= 0.8; time *= 0.85; }
    this.mods = { power, zone, time, shorter: has("tongue") ? 1 : 0, tier: ctx.level.tier };

    // markers
    for (let r = 0; r < this.h; r++) {
      for (let c = 0; c < this.w; c++) {
        const ch = this.rows[r][c];
        const p = this.center(r, c);
        if (ch === "@") this.start = p;
        else if (ch === "!") this.exit = p;
        else if (isWaypoint(ch)) this.waypoints.set(ch, p);
        else if (ch === "B") this.babki.push({ x: p.x, z: p.z, suspicion: 0, cooldown: 0, friendly: !!ctx.flags.valya || has("babki"), calling: 0 });
        else if (ch === "D") this.dogs.push({ x: p.x, z: p.z, cooldown: 0, barking: 0 });
      }
    }
    if (!this.rows.some((row) => row.includes("!"))) this.exit = { ...this.start };
    this.px = this.start.x;
    this.pz = this.start.z;

    // objectives (pick one of "1|2" style slots per run)
    for (const def of ctx.level.objectives) {
      const options = def.slot.split("|");
      const slot = options[Math.floor(this.rng() * options.length)];
      const pos = this.slotPos(slot);
      this.objectives.push({ def, slot, x: pos.x, z: pos.z, progress: 0, done: false, short: false });
    }

    // patrols: fixed + some from the pool by heat and luck
    for (const def of ctx.level.patrols) this.addPatrol(def);
    const pool = [...ctx.level.pool];
    let extra = Math.floor(ctx.heat / 30) + (this.rng() < 0.3 ? 1 : 0);
    if (ctx.level.n <= 1) extra = Math.min(extra, 0);
    else if (ctx.level.n <= 3) extra = Math.min(extra, 1);
    while (extra-- > 0 && pool.length) {
      const i = Math.floor(this.rng() * pool.length);
      this.addPatrol(pool.splice(i, 1)[0]);
    }
    if (ctx.doorWatch) this.addDoorWatch();
    if (!ctx.level.survive && ctx.level.objectives.every((o) => o.optional)) this.exitOpen = true;
  }

  // ----------------------------------------------------------- geometry

  center(r: number, c: number): Pt {
    return { x: (c + 0.5) * CELL, z: (r + 0.5) * CELL };
  }
  cellAt(x: number, z: number): { r: number; c: number } {
    return { r: Math.floor(z / CELL), c: Math.floor(x / CELL) };
  }
  ch(r: number, c: number): string {
    if (r < 0 || c < 0 || r >= this.h || c >= this.w) return "#";
    return this.cells[r][c];
  }
  private slotPos(slot: string): Pt {
    for (let r = 0; r < this.h; r++) {
      const c = this.rows[r].indexOf(slot);
      if (c >= 0) return this.center(r, c);
    }
    throw new Error(`Map ${this.level.map} has no objective slot ${slot}`);
  }
  get width(): number { return this.w * CELL; }
  get depth(): number { return this.h * CELL; }

  /** Can a circle of radius `rad` stand at x/z for this walker? */
  free(x: number, z: number, rad: number, water = false): boolean {
    const c0 = Math.floor((x - rad) / CELL);
    const c1 = Math.floor((x + rad) / CELL);
    const r0 = Math.floor((z - rad) / CELL);
    const r1 = Math.floor((z + rad) / CELL);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const ch = this.ch(r, c);
        const blocked = water ? ch !== "~" : blocksMove(ch);
        if (!blocked) continue;
        // circle vs cell box
        const nx = clamp(x, c * CELL, (c + 1) * CELL);
        const nz = clamp(z, r * CELL, (r + 1) * CELL);
        if ((x - nx) ** 2 + (z - nz) ** 2 < rad * rad) return false;
      }
    }
    return true;
  }

  /** Grid ray for sight: true when nothing tall stands between a and b. */
  sight(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.4);
    const start = this.cellAt(ax, az);
    const end = this.cellAt(bx, bz);
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const { r, c } = this.cellAt(ax + (bx - ax) * k, az + (bz - az) * k);
      if ((r === start.r && c === start.c) || (r === end.r && c === end.c)) continue;
      if (blocksSight(this.ch(r, c))) return false;
    }
    return true;
  }

  private walkLine(ax: number, az: number, bx: number, bz: number, rad: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.45);
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      if (!this.free(ax + (bx - ax) * k, az + (bz - az) * k, rad)) return false;
    }
    return true;
  }

  /** Cheapest grid path (8-way, no corner cutting) as cell centres. */
  findPath(from: Pt, to: Pt, water = false): Pt[] {
    const s = this.cellAt(from.x, from.z);
    const g = this.cellAt(to.x, to.z);
    const passable = (r: number, c: number) => {
      const ch = this.ch(r, c);
      return water ? ch === "~" : !blocksMove(ch);
    };
    if (!passable(g.r, g.c)) return [to];
    const W = this.w;
    const dist = new Float32Array(W * this.h).fill(Infinity);
    const prev = new Int32Array(W * this.h).fill(-1);
    const open: number[] = [];
    const si = s.r * W + s.c;
    dist[si] = 0;
    open.push(si);
    const goal = g.r * W + g.c;
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goal) break;
      const r = Math.floor(cur / W);
      const c = cur % W;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= this.h || nc >= W || !passable(nr, nc)) continue;
          if (dr && dc && (!passable(r, nc) || !passable(nr, c))) continue;
          const ni = nr * W + nc;
          const nd = dist[cur] + (dr && dc ? 1.414 : 1);
          if (nd < dist[ni]) {
            if (dist[ni] === Infinity) open.push(ni);
            dist[ni] = nd;
            prev[ni] = cur;
          }
        }
      }
    }
    if (prev[goal] < 0 && goal !== si) return [to];
    const out: Pt[] = [];
    for (let i = goal; i !== si && i >= 0; i = prev[i]) out.push(this.center(Math.floor(i / W), i % W));
    out.reverse();
    if (out.length) out[out.length - 1] = { ...to };
    return out;
  }

  // ----------------------------------------------------------- setup

  private addPatrol(def: PatrolDef, at?: Pt): Patrol {
    let route = def.route.split("").map((ch) => {
      const p = this.waypoints.get(ch);
      if (!p) throw new Error(`Map ${this.level.map} has no waypoint ${ch}`);
      return p;
    });
    if (!route.length) route = [at ?? { ...this.start }];
    // start on a waypoint away from the player
    let wp = Math.floor(this.rng() * route.length);
    for (let i = 0; i < route.length; i++) {
      const p = route[(wp + i) % route.length];
      if (Math.hypot(p.x - this.start.x, p.z - this.start.z) > 10) { wp = (wp + i) % route.length; break; }
    }
    const pos = at ?? route[wp];
    const p: Patrol = {
      id: this.nextId++, kind: def.kind, x: pos.x, z: pos.z, dir: this.rng() * Math.PI * 2, state: "route",
      suspicion: 0, seeing: 0, route, ping: !!def.ping, wp, wpStep: 1, path: [], timer: 0, scanBase: 0,
      lastSeen: { ...pos }, losT: 0, repath: 0, seenFor: 0, ignoreT: 0, moving: false, step: this.rng() * 10, spawned: false,
    };
    p.scanBase = p.dir;
    if (route.length > 1) p.wp = (wp + 1) % route.length;
    else p.wp = 0;
    this.planRoute(p);
    this.patrols.push(p);
    return p;
  }

  private addDoorWatch(): void {
    let best = "";
    let bestD = Infinity;
    for (const [k, p] of this.waypoints) {
      const d = Math.hypot(p.x - this.start.x, p.z - this.start.z);
      if (d > 5 && d < bestD && this.free(p.x, p.z, PATROL_R)) { best = k; bestD = d; }
    }
    if (best) {
      const p = this.addPatrol({ kind: "officer", route: best }, this.waypoints.get(best));
      p.dir = heading(this.start.x - p.x, this.start.z - p.z);
    }
  }

  private planRoute(p: Patrol): void {
    if (p.kind === "drone") { p.path = [p.route[p.wp]]; return; }
    p.path = this.findPath(p, p.route[p.wp], p.kind === "boat");
  }

  private advanceWaypoint(p: Patrol): void {
    if (p.route.length <= 1) return;
    if (p.ping) {
      if (p.wp + p.wpStep >= p.route.length || p.wp + p.wpStep < 0) p.wpStep *= -1;
      p.wp += p.wpStep;
    } else p.wp = (p.wp + 1) % p.route.length;
  }

  // ----------------------------------------------------------- input

  setMove(x: number, z: number): void {
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    this.moveX = x;
    this.moveZ = z;
  }
  setSprint(on: boolean): void { this.sprintHeld = on; }

  /** Context button: vault a fence. */
  action(): void {
    if (this.phase !== "explore" || !this.vaultCell) return;
    this.startQte("vault", timingSpec("ПАРКАН", "Тисни, коли маркер у зеленій зоні", this.mods, 1, 0));
  }

  qteTap(): void { this.qte?.tap(); }
  qtePress(down: boolean): void { this.qte?.press(down); }
  qteSwipe(dir: "up" | "down" | "left" | "right"): void { this.qte?.swipe(dir); }
  qteChoose(id: string): void { this.qte?.choose(id); }

  // ----------------------------------------------------------- update

  update(dt: number): OutingEvent[] {
    this.events = [];
    if (this.phase === "won" || this.phase === "caught") return this.events;
    if (this.phase === "qte") {
      this.qte?.update(dt);
      if (this.qte?.done) this.resolveQte();
      return this.events;
    }
    this.time += dt;
    this.updatePlayer(dt);
    this.updateObjectives(dt);
    for (const p of [...this.patrols]) this.updatePatrol(p, dt);
    this.updateBabki(dt);
    this.updateDogs(dt);
    if (this.level.curfew > 0 && !this.curfewOn && this.time >= this.level.curfew) this.startCurfew();
    if (!this.exitOpen && this.requiredDone() && (!this.level.survive || this.time >= this.level.survive)) {
      this.exitOpen = true;
      if (!this.level.noExit) this.emit({ type: "exitOpen" });
    }
    if (this.exitOpen && !this.level.noExit && Math.hypot(this.px - this.exit.x, this.pz - this.exit.z) < 1.3) this.win();
    return this.events;
  }

  private emit(e: OutingEvent): void { this.events.push(e); }

  requiredDone(): boolean {
    return this.objectives.every((o) => o.done || o.def.optional);
  }

  private updatePlayer(dt: number): void {
    const has = (p: string) => this.ctx.perks.includes(p);
    const moving = Math.hypot(this.moveX, this.moveZ) > 0.08;
    const wantSprint = this.sprintHeld && moving && this.stamina > 1;
    this.sprinting = wantSprint;
    let walk = 3.3 * (has("scooter") ? 1.15 : 1);
    if (this.ctx.satiety < 15) walk *= 0.9;
    const speed = this.sprinting ? 5.7 : walk;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - 24 * dt);
      this.staminaDelay = 0.7;
    } else if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else this.stamina = Math.min(this.staminaMax, this.stamina + 15 * dt);

    const vx = this.moveX * speed;
    const vz = this.moveZ * speed;
    const ox = this.px;
    const oz = this.pz;
    if (moving) {
      const nx = this.px + vx * dt;
      if (this.free(nx, this.pz, PLAYER_R)) this.px = nx;
      const nz = this.pz + vz * dt;
      if (this.free(this.px, nz, PLAYER_R)) this.pz = nz;
      this.facing = turnToward(this.facing, heading(this.moveX, this.moveZ), 14 * dt);
    }
    this.speedNow = Math.hypot(this.px - ox, this.pz - oz) / Math.max(dt, 1e-6);

    const { r, c } = this.cellAt(this.px, this.pz);
    this.inHide = isHide(this.ch(r, c));
    if (this.speedNow < 0.25) this.stillT += dt;
    else this.stillT = 0;
    const indoors = !!this.dwelling && this.dwelling.def.kind !== "visit" && this.dwelling.def.kind !== "river" && this.dwelling.def.kind !== "booth";
    this.hidden = (this.inHide && this.stillT > 0.25) || (indoors && !this.patrols.some((p) => p.state === "chase"));

    // footsteps and noise
    if (this.speedNow > 0.5) {
      this.stepT -= dt * (this.sprinting ? 1.7 : 1);
      if (this.stepT <= 0) { this.stepT = 0.36; this.emit({ type: "step" }); }
    }
    if (this.sprinting) {
      this.noiseT -= dt;
      if (this.noiseT <= 0) {
        this.noiseT = 0.5;
        let rad = 7;
        if (has("quiet")) rad *= 0.5;
        if (this.ctx.trait === "quietguy") rad *= 0.7;
        this.noise(this.px, this.pz, rad);
      }
    }

    // vault spot nearby?
    this.vaultCell = null;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (Math.abs(dr) + Math.abs(dc) !== 1) continue;
        const vr = r + dr;
        const vc = c + dc;
        if (this.ch(vr, vc) !== "^") continue;
        const fence = this.center(vr, vc);
        if (Math.hypot(fence.x - this.px, fence.z - this.pz) > 2.6) continue;
        const to = this.center(vr + dr, vc + dc);
        if (!blocksMove(this.ch(vr + dr, vc + dc))) this.vaultCell = { r: vr, c: vc, to };
      }
    }
  }

  /** Sound at a point: patrols in earshot come to look. */
  noise(x: number, z: number, rad: number): void {
    this.emit({ type: "noise", x, z, r: rad });
    for (const p of this.patrols) {
      if (p.kind === "van" || p.kind === "drone" || p.kind === "boat") continue;
      if (p.state === "chase" || p.state === "stunned" || p.ignoreT > 0) continue;
      if (Math.hypot(p.x - x, p.z - z) > rad) continue;
      p.suspicion = Math.min(0.85, p.suspicion + 0.3);
      p.lastSeen = { x: this.px, z: this.pz };
      if (p.state !== "investigate") {
        p.state = "investigate";
        p.path = this.findPath(p, p.lastSeen);
        this.emit({ type: "heard", id: p.id });
        if (this.rng() < 0.5) this.emit({ type: "say", id: p.id, text: SHOUT_HUH[Math.floor(this.rng() * SHOUT_HUH.length)], x: p.x, z: p.z });
      }
    }
  }

  // ----------------------------------------------------------- vision

  range(p: Patrol): number {
    let r = KIND[p.kind].range;
    if (this.level.night && p.kind !== "drone") r *= p.kind === "boat" ? 0.9 : 0.8;
    if (this.level.weather === "fog" && p.kind !== "drone") r *= 0.75;
    if (this.ctx.perks.includes("hoodie") && p.kind !== "drone") r *= 0.8;
    return r;
  }
  fov(p: Patrol): number { return KIND[p.kind].fov; }

  /** 0..1 how clearly patrol p sees the player right now. */
  canSee(p: Patrol): number {
    if (p.state === "stunned" || p.ignoreT > 0 || (p.kind === "van" && p.state === "parked")) return 0;
    const dx = this.px - p.x;
    const dz = this.pz - p.z;
    const d = Math.hypot(dx, dz);
    if (p.kind === "drone") {
      const r = this.range(p);
      if (d > r) return 0;
      if (this.ctx.items.includes("blanket") && this.stillT > 0.3) return 0;
      return 0.55 + 0.45 * (1 - d / r);
    }
    if (this.hidden) {
      const near = p.state === "chase" ? 2.2 : 1.5;
      return d < near && this.sight(p.x, p.z, this.px, this.pz) ? 1 : 0;
    }
    let r = this.range(p);
    if (this.inHide) r *= 0.45;
    if (d > r) return 0;
    // a chaser keeps its eyes on you; everyone else sees only in the cone
    if (d > 1.3 && p.state !== "chase" && Math.abs(angleDiff(p.dir, heading(dx, dz))) > this.fov(p)) return 0;
    if (!this.sight(p.x, p.z, this.px, this.pz)) return 0;
    return 0.35 + 0.65 * (1 - d / r);
  }

  // ----------------------------------------------------------- patrols

  private move(p: Patrol, tx: number, tz: number, speed: number, dt: number): boolean {
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { p.moving = false; return true; }
    const step = Math.min(d, speed * dt);
    const nx = p.x + (dx / d) * step;
    const nz = p.z + (dz / d) * step;
    const flying = p.kind === "drone";
    const water = p.kind === "boat";
    if (flying || this.free(nx, nz, PATROL_R, water)) { p.x = nx; p.z = nz; }
    else {
      if (this.free(nx, p.z, PATROL_R, water)) p.x = nx;
      if (this.free(p.x, nz, PATROL_R, water)) p.z = nz;
    }
    p.dir = turnToward(p.dir, heading(dx, dz), 7 * dt);
    p.moving = true;
    p.step += step;
    return d <= step + 0.02;
  }

  private followPath(p: Patrol, speed: number, dt: number): boolean {
    while (p.path.length) {
      const n = p.path[0];
      if (Math.hypot(n.x - p.x, n.z - p.z) < 0.12) { p.path.shift(); continue; }
      // skip ahead when the next-but-one node is in a straight walkable line
      if (p.path.length > 1 && p.kind !== "drone" && this.walkLine(p.x, p.z, p.path[1].x, p.path[1].z, PATROL_R)) { p.path.shift(); continue; }
      break;
    }
    if (!p.path.length) { p.moving = false; return true; }
    const n = p.path[0];
    if (this.move(p, n.x, n.z, speed, dt) && p.path.length === 1) { p.path.shift(); return true; }
    return false;
  }

  private updatePatrol(p: Patrol, dt: number): void {
    const k = KIND[p.kind];
    if (p.ignoreT > 0) p.ignoreT -= dt;
    const see = this.canSee(p);
    p.seeing = see;
    const has = (x: string) => this.ctx.perks.includes(x);

    if (see > 0) {
      p.seenFor += dt;
      p.lastSeen = { x: this.px, z: this.pz };
      let rate = 0.95 * k.rate * see * this.heatMult;
      if (has("dog")) rate *= 0.75;
      if (this.ctx.trait === "quietguy") rate *= 0.8;
      if (this.sprinting) rate *= 1.5;
      if (this.curfewOn) rate *= 1.3;
      if (has("courier") && p.seenFor < 1.5) rate = 0;
      if (p.state !== "chase") p.suspicion = Math.min(1, p.suspicion + rate * dt);
    } else {
      p.seenFor = 0;
      if (p.state !== "chase") p.suspicion = Math.max(0, p.suspicion - 0.28 * dt);
    }

    // vans, drones and boats only watch; they call others in
    if (p.kind === "van" || p.kind === "drone" || p.kind === "boat") {
      this.updateWatcher(p, dt);
      return;
    }

    if (p.state !== "chase" && p.state !== "stunned" && p.suspicion >= 1) this.startChase(p);

    switch (p.state) {
      case "route": {
        if (see > 0 && p.suspicion > 0.28) { p.state = "look"; p.timer = 0; this.emit({ type: "suspicious", id: p.id }); break; }
        if (p.route.length === 1 && Math.hypot(p.route[0].x - p.x, p.route[0].z - p.z) < 0.2) {
          // a sentry: stand and scan
          p.moving = false;
          p.timer += dt;
          p.dir = p.scanBase + Math.sin(p.timer * 0.7) * 1.1;
          break;
        }
        if (this.followPath(p, k.speed, dt)) {
          p.state = "pause";
          p.timer = 0.9 + this.rng() * 1.1;
          p.scanBase = p.dir;
        }
        break;
      }
      case "pause": {
        p.moving = false;
        p.timer -= dt;
        p.dir = p.scanBase + Math.sin(p.timer * 2.2) * 0.9;
        if (see > 0 && p.suspicion > 0.28) { p.state = "look"; p.timer = 0; this.emit({ type: "suspicious", id: p.id }); break; }
        if (p.timer <= 0) {
          this.advanceWaypoint(p);
          this.planRoute(p);
          p.state = "route";
        }
        break;
      }
      case "look": {
        p.moving = false;
        p.dir = turnToward(p.dir, heading(p.lastSeen.x - p.x, p.lastSeen.z - p.z), 4 * dt);
        if (see > 0) p.timer = 0;
        else p.timer += dt;
        if (p.timer > 1.1) {
          if (p.suspicion > 0.4) {
            p.state = "investigate";
            p.path = this.findPath(p, p.lastSeen);
          } else if (p.suspicion < 0.15) this.backToRoute(p);
        }
        break;
      }
      case "investigate": {
        if (see > 0 && p.suspicion > 0.5) { p.state = "look"; p.timer = 0; break; }
        if (this.followPath(p, k.speed * 1.45, dt)) { p.state = "search"; p.timer = 2.6; p.scanBase = p.dir; }
        break;
      }
      case "search": {
        p.moving = false;
        p.timer -= dt;
        p.dir = p.scanBase + Math.sin(p.timer * 2.6) * 1.4;
        if (see > 0 && p.suspicion > 0.3) { p.state = "look"; p.timer = 0; break; }
        if (p.timer <= 0) {
          if (p.home) { p.state = "return"; p.path = this.findPath(p, p.home); }
          else this.backToRoute(p);
        }
        break;
      }
      case "return": {
        if (see > 0 && p.suspicion > 0.28) { p.state = "look"; p.timer = 0; break; }
        if (this.followPath(p, k.speed * 1.2, dt)) {
          if (p.home) { this.patrols = this.patrols.filter((x) => x !== p); return; }
          p.state = "route";
          this.planRoute(p);
        }
        break;
      }
      case "stunned": {
        p.moving = false;
        p.timer -= dt;
        if (p.timer <= 0) { p.state = "search"; p.timer = 2; p.scanBase = p.dir; p.suspicion = 0.6; }
        break;
      }
      case "chase": {
        if (see > 0) p.losT = 0;
        else p.losT += dt;
        const speed = k.chase * (this.curfewOn ? 1.05 : 1);
        const direct = see > 0 && this.walkLine(p.x, p.z, this.px, this.pz, PATROL_R);
        if (direct) {
          p.path = [];
          this.move(p, this.px, this.pz, speed, dt);
        } else {
          p.repath -= dt;
          if (p.repath <= 0 || !p.path.length) {
            p.repath = 0.3;
            p.path = this.findPath(p, p.lastSeen);
          }
          if (this.followPath(p, speed, dt) && see === 0) p.losT += dt * 2;
        }
        const d = Math.hypot(this.px - p.x, this.pz - p.z);
        if (d < GRAB_DIST && (!this.hidden || see > 0)) { this.grab(p); return; }
        if (p.losT > 3.2) {
          p.state = "search";
          p.timer = 3;
          p.scanBase = p.dir;
          p.suspicion = 0.55;
          this.escapes++;
          this.heatGain += 4;
          this.emit({ type: "lost", id: p.id });
          this.emit({ type: "say", id: p.id, text: SHOUT_LOST[Math.floor(this.rng() * SHOUT_LOST.length)], x: p.x, z: p.z });
        }
        break;
      }
      case "parked":
        break;
    }
  }

  private backToRoute(p: Patrol): void {
    if (p.home) { p.state = "return"; p.path = this.findPath(p, p.home); return; }
    p.state = "return";
    // nearest waypoint of its route
    let best = 0;
    let bestD = Infinity;
    p.route.forEach((w, i) => {
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d < bestD) { bestD = d; best = i; }
    });
    p.wp = best;
    p.path = this.findPath(p, p.route[best]);
  }

  private startChase(p: Patrol): void {
    p.state = "chase";
    p.suspicion = 1;
    p.losT = 0;
    p.repath = 0;
    this.spotted++;
    this.heatGain += 3;
    this.emit({ type: "spotted", id: p.id });
    this.emit({ type: "say", id: p.id, text: SHOUT_SPOT[Math.floor(this.rng() * SHOUT_SPOT.length)], x: p.x, z: p.z });
  }

  private updateWatcher(p: Patrol, dt: number): void {
    const k = KIND[p.kind];
    if (p.state === "parked") {
      p.moving = false;
      p.timer -= dt;
      if (p.timer <= 0) { p.state = "route"; p.suspicion = 0.2; this.planRoute(p); }
      return;
    }
    if (p.suspicion >= 1) {
      if (p.kind === "van") {
        p.state = "parked";
        p.timer = 9;
        p.suspicion = 0;
        const spot = this.freeSpotNear(p.x, p.z);
        const o = this.addPatrol({ kind: "officer", route: "" }, spot);
        o.home = { ...spot };
        o.lastSeen = { x: this.px, z: this.pz };
        o.dir = heading(this.px - spot.x, this.pz - spot.z);
        this.emit({ type: "vanStop", id: p.id });
        this.startChase(o);
      } else {
        // drone / boat: call the nearest ground patrol
        p.suspicion = 0.35;
        this.heatGain += 4;
        this.emit({ type: "droneSpot", id: p.id });
        const ground = this.patrols.filter((g) => g.kind !== "drone" && g.kind !== "boat" && g.kind !== "van" && g.state !== "stunned");
        ground.sort((a, b) => Math.hypot(a.x - this.px, a.z - this.pz) - Math.hypot(b.x - this.px, b.z - this.pz));
        const g = ground[0];
        if (g && g.state !== "chase") {
          g.lastSeen = { x: this.px, z: this.pz };
          g.suspicion = Math.max(g.suspicion, 0.8);
          g.state = "investigate";
          g.path = this.findPath(g, g.lastSeen);
          this.emit({ type: "heard", id: g.id });
        }
      }
      return;
    }
    // looking at the player slows a van but never stops a drone
    const speed = p.kind === "van" && p.seeing > 0 ? k.speed * 0.45 : k.speed;
    if (p.kind === "drone") {
      const t = p.route[p.wp];
      if (this.move(p, t.x, t.z, speed, dt)) this.advanceWaypoint(p);
      p.dir += dt * 0.6;
      return;
    }
    if (this.followPath(p, speed, dt)) {
      this.advanceWaypoint(p);
      this.planRoute(p);
    }
  }

  private freeSpotNear(x: number, z: number): Pt {
    const { r, c } = this.cellAt(x, z);
    let best: Pt = { x, z };
    let bestD = Infinity;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const ch = this.ch(r + dr, c + dc);
        if (blocksMove(ch) || ch === "=") continue;
        const p = this.center(r + dr, c + dc);
        const d = Math.hypot(p.x - this.px, p.z - this.pz);
        if (d < bestD) { bestD = d; best = p; }
      }
    }
    if (bestD === Infinity) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (!blocksMove(this.ch(r + dr, c + dc))) return this.center(r + dr, c + dc);
    }
    return best;
  }

  private updateBabki(dt: number): void {
    for (const b of this.babki) {
      if (b.calling > 0) b.calling -= dt;
      if (b.friendly) continue;
      if (b.cooldown > 0) { b.cooldown -= dt; continue; }
      const d = Math.hypot(this.px - b.x, this.pz - b.z);
      const sees = !this.hidden && d < 5.5 && this.sight(b.x, b.z, this.px, this.pz);
      if (sees) b.suspicion += 0.62 * dt * (this.ctx.trait === "quietguy" ? 0.8 : 1);
      else b.suspicion = Math.max(0, b.suspicion - 0.3 * dt);
      if (b.suspicion >= 1) {
        b.suspicion = 0;
        b.cooldown = 15;
        b.calling = 3;
        this.heatGain += 5;
        this.emit({ type: "babkaCall", x: b.x, z: b.z });
        this.emit({ type: "say", id: "babka", text: BABKA_CALL[Math.floor(this.rng() * BABKA_CALL.length)], x: b.x, z: b.z });
        // the nearest patrol comes to check
        const ground = this.patrols.filter((g) => g.kind === "officer" || g.kind === "police" || g.kind === "guard");
        ground.sort((a, c) => Math.hypot(a.x - this.px, a.z - this.pz) - Math.hypot(c.x - this.px, c.z - this.pz));
        const g = ground[0];
        if (g && g.state !== "chase") {
          g.lastSeen = { x: this.px, z: this.pz };
          g.suspicion = Math.max(g.suspicion, 0.6);
          g.state = "investigate";
          g.path = this.findPath(g, g.lastSeen);
        }
      }
    }
  }

  private updateDogs(dt: number): void {
    for (const d of this.dogs) {
      if (d.barking > 0) d.barking -= dt;
      if (d.cooldown > 0) { d.cooldown -= dt; continue; }
      const dist = Math.hypot(this.px - d.x, this.pz - d.z);
      if (dist < 2.6 || (dist < 4.8 && this.speedNow > 0.5 && !this.hidden)) {
        d.cooldown = 6;
        d.barking = 2.2;
        this.emit({ type: "bark", x: d.x, z: d.z });
        this.noise(d.x, d.z, 12);
      }
    }
  }

  private startCurfew(): void {
    this.curfewOn = true;
    this.emit({ type: "curfew" });
    const walkable = [...this.waypoints.entries()].filter(([, p]) => {
      const { r, c } = this.cellAt(p.x, p.z);
      return !blocksMove(this.ch(r, c)) && this.ch(r, c) !== "~";
    }).map(([k]) => k);
    for (let i = 0; i < 2 && walkable.length >= 2; i++) {
      const pool = [...walkable];
      const pick: string[] = [];
      for (let j = 0; j < Math.min(3, pool.length); j++) pick.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
      const p = this.addPatrol({ kind: "police", route: pick.join("") });
      // walk in from the edge, away from the player
      const edge = this.findEdge();
      if (edge) { p.x = edge.x; p.z = edge.z; this.planRoute(p); }
    }
  }

  private findEdge(): Pt | null {
    for (let r = 0; r < this.h; r++) {
      for (const c of [0, this.w - 1]) if (!blocksMove(this.ch(r, c)) && this.ch(r, c) !== "~") {
        const p = this.center(r, c);
        if (Math.hypot(p.x - this.px, p.z - this.pz) > 12) return p;
      }
    }
    return null;
  }

  // ----------------------------------------------------------- objectives

  objectiveOpen(o: ObjState): boolean {
    if (o.done) return false;
    if (o.def.after) {
      const dep = this.objectives.find((x) => x.def.slot.split("|").includes(o.def.after!) || x.slot === o.def.after);
      if (dep && !dep.done) return false;
    }
    return true;
  }

  priceOf(o: ObjState): number {
    const base = o.def.cost ?? 0;
    return o.def.kind === "shop" ? Math.round(base * this.ctx.prices) : base;
  }

  get wallet(): number { return this.ctx.money + this.moneyDelta; }

  private updateObjectives(dt: number): void {
    this.dwelling = null;
    for (const o of this.objectives) {
      if (!this.objectiveOpen(o)) continue;
      const d = Math.hypot(this.px - o.x, this.pz - o.z);
      if (d > 1.45) { if (o.progress > 0 && o.progress < 1) o.progress = Math.max(0, o.progress - dt * 0.5); continue; }
      this.dwelling = o;
      if (this.patrols.some((p) => p.state === "chase" && Math.hypot(p.x - this.px, p.z - this.pz) < 4)) return;
      o.progress = Math.min(1, o.progress + dt / Math.max(0.2, o.def.dwell));
      if (o.progress >= 1) this.completeObjective(o);
      return;
    }
  }

  private completeObjective(o: ObjState): void {
    const def = o.def;
    if (def.kind === "talk") { this.startTalk(o); return; }
    if (def.kind === "river") { this.startRiver(); return; }
    if (def.kind === "booth") { this.boothStep = 0; this.boothFails = 0; this.nextBooth(); return; }
    const price = this.priceOf(o);
    if (price > 0) {
      if (this.wallet >= price) this.moneyDelta -= price;
      else {
        o.short = true;
        this.emit({ type: "noMoney", slot: o.slot });
        if (def.kind === "shop" && def.gives?.food) {
          // buy what you can afford
          const part = Math.floor((this.wallet / price) * def.gives.food);
          this.moneyDelta -= Math.max(0, this.wallet);
          this.foodDelta += part;
          this.finish(o, false);
          return;
        }
        if (def.kind === "pay") {
          if (def.gives?.flag) this.unpaid.push(def.gives.flag);
          if (def.gives?.item) this.unpaid.push(def.gives.item);
          this.finish(o, false);
          return;
        }
        // a ticket without money: ride without one, more heat
        this.heatGain += 6;
      }
    }
    this.finish(o, true);
  }

  private finish(o: ObjState, give: boolean): void {
    o.done = true;
    o.progress = 1;
    const g = o.def.gives;
    if (give && g) {
      if (g.food) this.foodDelta += g.food;
      if (g.money) this.moneyDelta += g.money;
      if (g.nerves) this.nervesDelta += g.nerves;
      if (g.heat) this.heatGain += g.heat;
      if (g.item) this.items.push(g.item);
      if (g.flag) this.flagsSet.push(g.flag);
    }
    this.emit({ type: "objDone", slot: o.slot, short: o.short });
    if (this.level.noExit && this.requiredDone()) this.win();
  }

  private win(): void {
    if (this.phase === "won") return;
    this.phase = "won";
    this.emit({ type: "won" });
  }

  // ----------------------------------------------------------- QTE chains

  private startQte(ctx: Ctx, spec: QteSpec): void {
    this.qte = new Qte(spec, this.rng);
    this.qteCtx = ctx;
    this.phase = "qte";
    this.sprintHeld = false;
    this.emit({ type: "qte", qte: this.qte, ctx });
  }

  private grab(p: Patrol): void {
    this.grabbedBy = p.id;
    this.emit({ type: "grab", id: p.id });
    const opts = [
      { id: "run", label: "ВИРВАТИСЯ Й БІГТИ" },
      { id: "talk", label: "ЗАГОВОРИТИ ЗУБИ" },
    ];
    if (this.ctx.items.includes("bron")) opts.push({ id: "docs", label: "ПОКАЗАТИ БРОНЬ" });
    if (this.ctx.perks.includes("dog")) opts.push({ id: "dog", label: "«Я ПСА ВИГУЛЮЮ!»" });
    const time = this.ctx.perks.includes("tongue") ? 1.5 : 1;
    this.startQte("grab", choiceSpec("ПОПАВСЯ!", "«Чоловіче, ваші документи!» — що робиш?", opts, { ...this.mods, time: this.mods.time * time }, 3.6, "none"));
  }

  private release(how: "break" | "talk" | "docs" | "van" | "lawyer" | "dog"): void {
    const p = this.patrols.find((x) => x.id === this.grabbedBy);
    this.phase = "explore";
    this.qte = null;
    this.qteCtx = null;
    this.emit({ type: "freed", how });
    if (how === "break" || how === "van") {
      // everybody near is knocked off balance; you have a head start
      for (const q of this.patrols) {
        if (q.kind === "van" || q.kind === "drone" || q.kind === "boat") continue;
        if (Math.hypot(q.x - this.px, q.z - this.pz) < 4.5) { q.state = "stunned"; q.timer = how === "van" ? 2.6 : 2.1; q.suspicion = 1; }
      }
      this.stamina = Math.max(this.stamina, this.staminaMax * 0.7);
      this.heatGain += how === "van" ? 14 : 7;
      this.escapes++;
    } else if (p) {
      p.state = "return";
      p.suspicion = 0;
      p.ignoreT = how === "docs" ? 25 : 10;
      p.path = [];
      this.backToRoute(p);
      this.heatGain += how === "docs" ? -2 : how === "lawyer" ? 10 : 8;
      // others who were chasing calm down too
      for (const q of this.patrols) if (q !== p && q.state === "chase") { q.state = "search"; q.timer = 2; q.suspicion = 0.5; }
    }
    if (how === "lawyer") this.lawyerUsed = true;
  }

  private toVan(): void {
    this.startQte("van", mashSpec("ТЕБЕ ВЕДУТЬ ДО БУСУ", "Тисни швидко — вистрибни, поки не зачинили двері!", this.mods, 4));
  }

  private caught(): void {
    if (this.ctx.perks.includes("lawyer") && !this.lawyerUsed) { this.release("lawyer"); return; }
    this.phase = "caught";
    this.qte = null;
    this.emit({ type: "caught" });
  }

  private startTalk(o: ObjState): void {
    const t = TALKS[o.def.talk ?? ""];
    if (!t) { this.finish(o, true); return; }
    this.talkKey = o.def.talk!;
    const time = this.ctx.perks.includes("tongue") ? 1.6 : 1;
    this.startQte("talk", choiceSpec("РОЗМОВА", t.line, t.options.map((x) => ({ id: x.id, label: x.label })), { ...this.mods, time: this.mods.time * time }, 7, t.options[t.options.length - 1].id));
  }

  private startRiver(): void {
    const m = { ...this.mods };
    if (this.ctx.perks.includes("lungs")) m.power *= 1.3;
    if (this.ctx.items.includes("drybag")) m.power *= 1.1;
    this.riverStage = 0;
    this.startQte("river", mashSpec("ПЕРЕПРАВА", "Греби! Тисни якомога швидше — вода крижана", m, 2));
  }
  private riverStage = 0;

  private nextBooth(): void {
    const q = BOOTH[this.boothStep];
    const opts = [...q.wrong.map((w, i) => ({ id: `w${i}`, label: w }))];
    if (this.ctx.flags[q.paper] || this.ctx.items.includes(q.paper)) opts.splice(Math.floor(this.rng() * (opts.length + 1)), 0, { id: "right", label: q.right });
    opts.push({ id: "bluff", label: "Блефувати впевнено" });
    this.startQte("booth", choiceSpec(`КПП ${this.boothStep + 1}/3`, `Прикордонник: «${q.q}»`, opts, this.mods, 7, "w0"));
  }

  private resolveQte(): void {
    const q = this.qte!;
    const ctx = this.qteCtx!;
    const r = q.result;
    this.emit({ type: "qteEnd", ctx, ok: r === "win" || (typeof r === "object" && r !== null && r.choice !== "none") });
    this.qte = null;
    switch (ctx) {
      case "grab": {
        const choice = typeof r === "object" && r ? r.choice : "none";
        if (choice === "run") this.startQte("escape", mashSpec("ВИРИВАЙСЯ!", "Тисни якомога швидше!", this.mods));
        else if (choice === "talk") this.startQte("talkout", swipeSpec("ЗАГОВОРИ ЗУБИ", "Повторюй жести — бреши впевнено!", this.mods, 3));
        else if (choice === "docs") {
          if (this.rng() < 0.88) this.release("docs");
          else { this.emit({ type: "say", id: this.grabbedBy, text: "Бронь? Покажіть оригінал…", x: this.px, z: this.pz }); this.toVan(); }
        } else if (choice === "dog") {
          if (this.rng() < 0.55) this.release("dog");
          else { this.emit({ type: "say", id: this.grabbedBy, text: "А де пес?", x: this.px, z: this.pz }); this.toVan(); }
        } else this.toVan();
        break;
      }
      case "escape":
        if (r === "win") this.release("break");
        else this.toVan();
        break;
      case "talkout":
        if (r === "win") this.release("talk");
        else this.toVan();
        break;
      case "van":
        if (r === "win") this.release("van");
        else this.caught();
        break;
      case "vault": {
        this.phase = "explore";
        const v = this.vaultCell;
        if (r === "win" && v) {
          this.px = v.to.x;
          this.pz = v.to.z;
          this.emit({ type: "vault", ok: true });
        } else {
          this.stamina = Math.max(0, this.stamina - 30);
          this.emit({ type: "vault", ok: false });
          this.noise(this.px, this.pz, 8);
        }
        break;
      }
      case "talk": {
        this.phase = "explore";
        const choice = typeof r === "object" && r ? r.choice : "";
        const t = TALKS[this.talkKey];
        const opt = t?.options.find((x) => x.id === choice);
        if (opt?.effect) {
          if (opt.effect.money) this.moneyDelta += opt.effect.money;
          if (opt.effect.nerves) this.nervesDelta += opt.effect.nerves;
          if (opt.effect.heat) this.heatGain += opt.effect.heat;
          if (opt.effect.flag) this.flagsSet.push(opt.effect.flag);
        }
        if (opt && !opt.good) this.flagsSet.push(`bad_${this.talkKey}`);
        if (this.talkKey === "arkadiyFound" && choice === "pay" && this.wallet < 0) {
          // couldn't actually pay
          this.moneyDelta += 10000;
          this.flagsSet.push("bad_arkadiyFound");
        }
        const o = this.objectives.find((x) => x.def.talk === this.talkKey && !x.done);
        if (o) this.finish(o, true);
        break;
      }
      case "river": {
        if (r === "win") {
          this.riverStage++;
          const m = { ...this.mods };
          if (this.ctx.perks.includes("lungs")) { m.power *= 1.3; m.zone *= 1.4; }
          if (this.riverStage === 1) this.startQte("river", swipeSpec("ТЕЧІЯ", "Ухиляйся від колод — повторюй напрямки", m, 3));
          else if (this.riverStage === 2) this.startQte("river", holdSpec("ХОЛОД", "Тримай дихання рівним: утримуй маркер у смузі", m, 3.5));
          else if (this.riverStage === 3) this.startQte("river", mashSpec("БЕРЕГ", "Останній ривок!", m, 0));
          else {
            this.phase = "explore";
            const o = this.objectives.find((x) => x.def.kind === "river");
            if (o) this.finish(o, true);
          }
        } else {
          this.riverFails++;
          if (this.riverFails >= 2) { this.caught(); return; }
          this.phase = "explore";
          const o = this.objectives.find((x) => x.def.kind === "river");
          if (o) o.progress = 0;
          this.px = o ? o.x : this.px;
          this.pz = (o ? o.z : this.pz) + CELL * 1.5;
          this.stamina = 0;
          this.heatGain += 8;
          this.emit({ type: "riverFail" });
          this.noise(this.px, this.pz, 14);
        }
        break;
      }
      case "booth": {
        const choice = typeof r === "object" && r ? r.choice : "w0";
        if (choice === "bluff") { this.startQte("bluff", swipeSpec("БЛЕФ", "Тримай обличчя!", { ...this.mods, tier: 3 }, 5)); return; }
        if (choice !== "right") this.boothFails++;
        this.afterBooth();
        break;
      }
      case "bluff":
        if (r !== "win") this.boothFails++;
        this.afterBooth();
        break;
    }
  }

  private afterBooth(): void {
    if (this.boothFails > 0) {
      this.emit({ type: "say", id: "me", text: "…", x: this.px, z: this.pz });
      this.caught();
      return;
    }
    this.boothStep++;
    if (this.boothStep < BOOTH.length) { this.nextBooth(); return; }
    this.phase = "explore";
    const o = this.objectives.find((x) => x.def.kind === "booth");
    if (o) this.finish(o, true);
  }

  // ----------------------------------------------------------- result

  /** Highest suspicion among everyone watching — the HUD eye. */
  get alert(): number {
    let a = 0;
    for (const p of this.patrols) a = Math.max(a, p.state === "chase" ? 1 : p.suspicion);
    for (const b of this.babki) if (!b.friendly) a = Math.max(a, b.suspicion * 0.9);
    return a;
  }

  get chased(): boolean { return this.patrols.some((p) => p.state === "chase"); }

  result(): OutingResult {
    return {
      won: this.phase === "won",
      caught: this.phase === "caught",
      spotted: this.spotted,
      escapes: this.escapes,
      heat: this.heatGain,
      money: this.moneyDelta,
      food: this.foodDelta,
      nerves: this.nervesDelta,
      items: [...this.items],
      flags: [...this.flagsSet],
      unpaid: [...this.unpaid],
      perfect: this.phase === "won" && this.spotted === 0,
      time: this.time,
      lawyerUsed: this.lawyerUsed,
    };
  }
}
