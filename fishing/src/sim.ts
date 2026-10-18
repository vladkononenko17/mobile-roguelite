/**
 * Pure simulation for «Не клюёт». No rendering imports: the scene only draws
 * this state and forwards input, so every rule here is covered by node tests.
 *
 * One run = one location (level). Four fishing methods share the same rage,
 * coping and Tolik systems but each has its own hook-and-land minigame:
 *  - float:  wait → bite → tap → stop the marker in the green zone
 *  - feeder: keep the feeder topped up → long bite → tap → tension fight
 *  - spin:   hold to retrieve, twitch the lure → strike → tap → tension fight
 *  - ice:    tap to work the jig in rhythm → bite → tap → tension fight
 */

import {
  FISH, FRIEND_POOL, LEVELS, METHOD_POOL, MONEY_PER_STAR, combineStats,
  type Hazard, type Level, type Method, type Stats,
} from "./content.ts";

export type Phase = "playing" | "meltdown" | "fell" | "won" | "lost";
export type RodState = "waiting" | "nibble" | "bite" | "reeling" | "fight" | "retrieve" | "casting" | "recast" | "broken";
export type Hands = "free" | "beer" | "phone" | "steal" | "asleep" | "call";
export type FriendGaze = "rod" | "distracted" | "suspicious" | "watching" | "reeling";

export interface Fish {
  species: string;
  weight: number;
  size: 1 | 2 | 3;
  junk?: boolean;
}

export type LoseReason = "rage" | "ice" | "target";

export type SimEvent =
  | { type: "nibble" }
  | { type: "bite" }
  | { type: "early" }
  | { type: "missed" }
  | { type: "hooked"; fish: Fish }
  | { type: "catch"; fish: Fish }
  | { type: "junk"; fish: Fish }
  | { type: "snap" }
  | { type: "escaped" }
  | { type: "snag" }
  | { type: "cast" }
  | { type: "spooked" }
  | { type: "surge" }
  | { type: "friendCatch"; fish: Fish }
  | { type: "friendDistracted"; reason: "phone" | "bushes" | "stretch" }
  | { type: "friendBack" }
  | { type: "friendSuspicious" }
  | { type: "friendWatching" }
  | { type: "stolen"; fish: Fish }
  | { type: "caught" }
  | { type: "beerOpen" }
  | { type: "beerDone" }
  | { type: "smoke" }
  | { type: "smokeDone" }
  | { type: "phoneOpen" }
  | { type: "phoneClose" }
  | { type: "video"; video: Video }
  | { type: "sleep" }
  | { type: "wake"; missedFish: number }
  | { type: "hazard"; hazard: Hazard }
  | { type: "hazardEnd"; hazard: Hazard }
  | { type: "fine"; amount: number; reason: string }
  | { type: "meltdown" }
  | { type: "fell" }
  | { type: "won"; result: LevelResult }
  | { type: "lost"; result: LevelResult }
  | { type: "denied"; reason: string };

export interface Video {
  emoji: string;
  caption: string;
  rage: number;
  tint: string;
}

export const VIDEOS: Video[] = [
  { emoji: "🐈", caption: "кот уронил ёлку и делает вид, что так и было", rage: -9, tint: "#f2b632" },
  { emoji: "👵", caption: "бабуля танцует под техно на рынке", rage: -8, tint: "#e8602f" },
  { emoji: "🦆", caption: "утка гоняет гопника по парку", rage: -10, tint: "#b8d84a" },
  { emoji: "🚗", caption: "сосед паркуется 14 минут и сдаётся", rage: -7, tint: "#9a6bd1" },
  { emoji: "🐐", caption: "коза залезла на дерево и не хочет обратно", rage: -9, tint: "#b8d84a" },
  { emoji: "🕺", caption: "дядя Валера на свадьбе, 3 часа ночи", rage: -11, tint: "#e8602f" },
  { emoji: "🤡", caption: "мужик пытается пройти по льду с пивом. спойлер: нет", rage: -12, tint: "#54b7c6" },
  { emoji: "🐟", caption: "блогер вытащил сома на 40 кг с первого заброса", rage: 9, tint: "#d63732" },
  { emoji: "💸", caption: "как я заработал миллион за неделю (не кликбейт)", rage: 6, tint: "#d63732" },
  { emoji: "🎣", caption: "ТОП-5 ошибок рыбака: ты делаешь все пять", rage: 7, tint: "#d63732" },
  { emoji: "💍", caption: "твоя бывшая выходит замуж за рыбака. он с сомом на фото", rage: 14, tint: "#d63732" },
  { emoji: "👴", caption: "дед 92 лет ловит щуку голыми руками", rage: 8, tint: "#d63732" },
];

export interface SimSnapshot {
  phase: Phase;
  level: number;
  levelName: string;
  method: Method;
  dayProgress: number;
  clock: string;
  rage: number;
  drunk: number;
  rod: RodState;
  hands: Hands;
  gaze: FriendGaze;
  smoking: number;
  beers: number;
  cigs: number;
  battery: number;
  stealProgress: number;
  stealCooldown: number;
  reelMarker: number;
  reelZone: [number, number];
  tension: number;
  fightProgress: number;
  greenZone: [number, number];
  lure: number;
  holding: boolean;
  interest: number;
  interestBand: [number, number];
  feed: number;
  warm: number;
  cold: boolean;
  hazard: Hazard | null;
  hazardLeft: number;
  myCount: number;
  myKg: number;
  target: number;
  friendCount: number;
  friendKg: number;
  friendBucket: number;
  fines: number;
}

export interface LevelResult {
  level: number;
  pass: boolean;
  reason?: LoseReason;
  stars: number;
  myKg: number;
  friendKg: number;
  myCount: number;
  fishMoney: number;
  starMoney: number;
  fines: number;
  money: number;
  stolen: number;
  caught: number;
  biggest?: Fish;
}

export interface SimOptions {
  seed?: number;
  level?: number;
  /** Equipped gear ids: rod, reel, bait. */
  gear?: { rod: string; reel: string; bait: string };
  method?: Method;
}

/** Small deterministic PRNG so tests and replays are stable. */
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

/** Tension band that lands fish; wider with better gear. */
const GREEN: [number, number] = [0.3, 0.82];
const INTEREST_BAND: [number, number] = [0.42, 0.88];

export class FishingSim {
  readonly level: Level;
  readonly method: Method;
  readonly stats: Stats;
  phase: Phase = "playing";
  dayTime = 0;
  rage = 15;
  drunk = 0;
  rod: RodState = "waiting";
  hands: Hands = "free";
  gaze: FriendGaze = "rod";
  beers = 3;
  cigs = 6;
  battery = 100;
  smoking = 0;
  stealProgress = 0;
  stealCooldown = 0;
  reelMarker = 0;
  reelZone: [number, number] = [0.4, 0.6];
  tension = 0;
  fightProgress = 0;
  lure = 0;
  holding = false;
  interest = 0;
  feed = 1;
  warm = 0;
  fines = 0;
  myFish: Fish[] = [];
  friendFish: Fish[] = [];
  friendBucket: Fish[] = [];
  stolenCount = 0;
  caughtStealing = 0;
  suspicion = 0;
  hazard: Hazard | null = null;
  hazardLeft = 0;
  result: LevelResult | null = null;

  private rodTimer = 0;
  private biteWindow = 0;
  private reelTime = 0;
  private reelSpeed = 1;
  private hooked: Fish | null = null;
  private slackTime = 0;
  private surgeTimer = 0;
  private fightTime = 0;
  private overload = 0;
  private idleHold = 0;
  private lastHold = false;
  private twitch = 0;
  private handsTimer = 0;
  private friendTimer = 0;
  private gazeTimer = 0;
  private drunkDecay = 0;
  private sleepMissed = 0;
  private sleepRage = 0;
  private meltdownTimer = 0;
  private videoCooldown = 0;
  private dryTime = 0;
  private hazardTimer = 0;
  private quietBites = 0;
  private lastSteal = -99;
  private iceWarned = false;
  private nadzorBusted = false;
  private events: SimEvent[] = [];
  private rng: () => number;

  constructor(opts: SimOptions | number = {}) {
    const o: SimOptions = typeof opts === "number" ? { seed: opts } : opts;
    this.rng = mulberry32(o.seed ?? Date.now());
    this.level = LEVELS[clamp((o.level ?? 1) - 1, 0, LEVELS.length - 1)];
    const gear = o.gear ?? { rod: "rod-bamboo", reel: "reel-sovok", bait: "bait-bread" };
    this.method = this.level.forceMethod ?? o.method ?? "float";
    this.stats = combineStats([gear.rod, gear.reel, gear.bait], this.method);
    this.friendTimer = this.r(...this.level.friendEvery) * 0.7;
    this.gazeTimer = this.r(4, 7);
    this.hazardTimer = this.r(10, 18);
    this.startRod(2);
  }

  // ---------------------------------------------------------------- helpers
  private r(lo: number, hi: number): number {
    return lo + (hi - lo) * this.rng();
  }

  private emit(event: SimEvent): void {
    this.events.push(event);
  }

  private pick<T>(rows: Array<[T, number]>): T {
    const total = rows.reduce((s, r) => s + r[1], 0);
    let roll = this.rng() * total;
    for (const [v, w] of rows) {
      roll -= w;
      if (roll <= 0) return v;
    }
    return rows[0][0];
  }

  private makeFish(species: string): Fish {
    const info = FISH[species];
    const w = Math.round(this.r(info.kg[0], info.kg[1]) * 100) / 100;
    return { species, weight: w, size: info.size, junk: info.junk };
  }

  private drawMyFish(): Fish {
    const rows: Array<[string, number]> = [...METHOD_POOL[this.method], ...this.level.extra]
      .map(([s, w]) => [s, FISH[s].size === 3 ? w * (1 + this.stats.size * 0.35) : w] as [string, number]);
    return this.makeFish(this.pick(rows));
  }

  private drawFriendFish(): Fish {
    const rows: Array<[string, number]> = [...FRIEND_POOL, ...(this.level.friendExtra ?? [])];
    // The final's boss fish lands late in the day, when it hurts most.
    const species = this.pick(rows.filter(([s]) => s !== "ЦАРЬ-СОМ" || this.dayTime > this.level.length * 0.6));
    return this.makeFish(species);
  }

  private addRage(amount: number): void {
    if (this.phase !== "playing") return;
    if (amount > 0) amount *= this.level.rageMult;
    if (this.hands === "asleep" && amount > 0) {
      this.sleepRage += amount;
      return;
    }
    this.rage = clamp(this.rage + amount, 0, 100);
    if (this.rage >= 100) this.startMeltdown();
  }

  private startMeltdown(): void {
    this.phase = "meltdown";
    this.rod = "broken";
    this.hands = "free";
    this.holding = false;
    this.meltdownTimer = 3.4;
    this.emit({ type: "meltdown" });
  }

  private fine(amount: number, reason: string): void {
    this.fines += amount;
    this.emit({ type: "fine", amount, reason });
  }

  private get canAct(): boolean {
    return this.phase === "playing" && this.hands !== "asleep" && this.hands !== "call";
  }

  /** Put the rig back in the water in whatever way this method waits. */
  private startRod(delay = 1.2): void {
    this.hooked = null;
    this.tension = 0;
    this.fightProgress = 0;
    this.rod = "recast";
    this.rodTimer = delay;
  }

  private nextBiteDelay(): number {
    let base = this.r(5.5, 11);
    if (this.method === "feeder") base = this.r(7, 14) / (0.45 + this.feed * 0.85);
    return base / this.stats.bite + this.quietBites;
  }

  private get biteWindowLength(): number {
    const drunkPenalty = Math.max(0, this.drunk - 1) * 0.06;
    const base = this.method === "feeder" ? 1.3 : this.method === "spin" ? 0.6 : this.method === "ice" ? 0.75 : 0.82;
    return Math.max(0.35, base * this.stats.window - drunkPenalty);
  }

  get stealDuration(): number {
    return 1.7;
  }

  // ---------------------------------------------------------------- input
  /** Main button pressed. */
  tap(): void {
    if (!this.canAct) return;
    if (this.hands === "phone") this.closePhone();
    if (this.hands === "steal") this.cancelSteal();
    switch (this.rod) {
      case "nibble":
        this.emit({ type: "early" });
        this.addRage(6);
        this.startRod(1.6);
        break;
      case "waiting":
        if (this.method === "feeder") {
          // Recast with a fresh feeder: no penalty, just time.
          this.rod = "casting";
          this.rodTimer = 2;
          this.feed = 1;
          this.emit({ type: "cast" });
        } else if (this.method === "ice") {
          this.jig();
        } else {
          this.emit({ type: "early" });
          this.addRage(2);
          this.startRod(1.2);
        }
        break;
      case "bite":
        this.hookFish();
        break;
      case "reeling": {
        const [lo, hi] = this.reelZone;
        if (this.reelMarker >= lo && this.reelMarker <= hi) this.land();
        else {
          this.emit({ type: "snap" });
          this.addRage(10);
          this.startRod(1.5);
        }
        break;
      }
      default:
        break;
    }
  }

  /** Main button held/released: retrieve (spin) and pull (fights). */
  hold(down: boolean): void {
    if (!this.canAct && down) return;
    this.holding = down;
  }

  private jig(): void {
    this.interest += 0.2;
    if (this.interest > 1) {
      this.interest = 0;
      this.emit({ type: "spooked" });
      this.addRage(3);
    }
  }

  private hookFish(): void {
    const fish = this.drawMyFish();
    this.hooked = fish;
    this.emit({ type: "hooked", fish });
    if (this.method === "float") {
      this.rod = "reeling";
      this.reelTime = 0;
      this.reelMarker = 0;
      const width = clamp(0.22 * this.stats.zone - (fish.size - 1) * 0.02, 0.1, 0.5);
      const start = this.r(0.08, 0.92 - width);
      this.reelZone = [start, start + width];
      this.reelSpeed = this.r(0.75, 1.05) + this.level.id * 0.05;
    } else {
      this.rod = "fight";
      this.tension = 0.45;
      this.overload = 0;
      this.fightProgress = 0;
      this.slackTime = 0;
      this.fightTime = 0;
      this.surgeTimer = this.r(0.8, 1.6);
    }
  }

  private land(): void {
    const fish = this.hooked ?? this.drawMyFish();
    this.hooked = null;
    if (fish.junk) {
      this.emit({ type: "junk", fish });
      this.addRage(fish.species === "ПОКРЫШКА" ? 12 : 6);
    } else {
      this.myFish.push(fish);
      this.dryTime = 0;
      this.emit({ type: "catch", fish });
      this.addRage(-(18 + fish.size * 6));
    }
    this.startRod(1.5);
  }

  drinkBeer(): void {
    if (!this.canAct || this.hands === "beer") return;
    if (this.beers <= 0) return this.emit({ type: "denied", reason: "ПИВО КОНЧИЛОСЬ" });
    if (this.rod === "reeling" || this.rod === "fight") return this.emit({ type: "denied", reason: "РУКИ ЗАНЯТЫ!" });
    if (this.hands === "phone") this.closePhone();
    if (this.hands === "steal") this.cancelSteal();
    this.beers -= 1;
    this.hands = "beer";
    this.handsTimer = 1.5;
    this.emit({ type: "beerOpen" });
    if (this.hazard === "ashot") this.fine(300, "СВОЁ ПИВО У АШОТА");
  }

  lightSmoke(): void {
    if (!this.canAct) return;
    if (this.smoking > 0) return this.emit({ type: "denied", reason: "ЕЩЁ ЭТУ НЕ ДОКУРИЛ" });
    if (this.cigs <= 0) return this.emit({ type: "denied", reason: "ПАЧКА ПУСТАЯ" });
    this.cigs -= 1;
    this.smoking = 6;
    this.warm = Math.max(this.warm, 8);
    this.emit({ type: "smoke" });
  }

  openPhone(): void {
    if (!this.canAct || this.hands !== "free") return;
    if (this.rod === "reeling" || this.rod === "fight") return this.emit({ type: "denied", reason: "РУКИ ЗАНЯТЫ!" });
    if (this.battery <= 0) return this.emit({ type: "denied", reason: "ТЕЛЕФОН СЕЛ" });
    this.hands = "phone";
    this.holding = false;
    this.videoCooldown = 0;
    this.emit({ type: "phoneOpen" });
    this.swipe();
  }

  swipe(): Video | null {
    if (this.hands !== "phone" || this.videoCooldown > 0) return null;
    const video = VIDEOS[Math.floor(this.rng() * VIDEOS.length)];
    this.videoCooldown = 0.55;
    this.emit({ type: "video", video });
    this.addRage(video.rage);
    return video;
  }

  closePhone(): void {
    if (this.hands !== "phone") return;
    this.hands = "free";
    this.emit({ type: "phoneClose" });
  }

  startSteal(): void {
    if (!this.canAct || this.hands !== "free") return;
    if (this.rod === "reeling" || this.rod === "fight") return this.emit({ type: "denied", reason: "РУКИ ЗАНЯТЫ!" });
    if (this.stealCooldown > 0) return this.emit({ type: "denied", reason: "ТОЛИК ЕЩЁ КОСИТСЯ" });
    if (this.friendBucket.length === 0) return this.emit({ type: "denied", reason: "В САДКЕ ПУСТО" });
    this.hands = "steal";
    this.holding = false;
    this.stealProgress = 0;
  }

  cancelSteal(): void {
    if (this.hands !== "steal") return;
    this.hands = "free";
    this.stealProgress = 0;
  }

  // ---------------------------------------------------------------- update
  update(dt: number): SimEvent[] {
    dt = Math.min(dt, 0.1);
    if (this.phase === "meltdown" || this.phase === "fell") {
      this.meltdownTimer -= dt;
      if (this.meltdownTimer <= 0) this.finish(false, this.phase === "fell" ? "ice" : "rage");
      return this.flush();
    }
    if (this.phase !== "playing") return this.flush();

    this.dayTime += dt;
    this.updateHands(dt);
    this.updateRod(dt);
    this.updateFriend(dt);
    this.updateHazards(dt);

    if (this.smoking > 0) {
      const step = Math.min(dt, this.smoking);
      this.smoking -= step;
      this.addRage(-3.2 * step);
      if (this.smoking <= 0) this.emit({ type: "smokeDone" });
    }
    if (this.stealCooldown > 0) this.stealCooldown = Math.max(0, this.stealCooldown - dt);
    if (this.warm > 0) this.warm = Math.max(0, this.warm - dt);
    if (this.quietBites > 0) this.quietBites = Math.max(0, this.quietBites - dt * 0.5);

    this.dryTime += dt;
    const deficit = Math.max(0, this.friendFish.length - this.myFish.length);
    let passive = 0.16 + Math.min(0.9, deficit * 0.05) + (this.dryTime > 25 ? 0.25 : 0);
    if (this.level.cold && this.warm <= 0) passive += 0.3;
    if (this.hands !== "phone") this.addRage(passive * dt);

    this.drunkDecay += dt;
    if (this.drunkDecay > 22 && this.drunk > 0) {
      this.drunk -= 1;
      this.drunkDecay = 0;
    }

    if (this.phase === "playing" && this.dayTime >= this.level.length) this.finish(true);
    return this.flush();
  }

  private updateHands(dt: number): void {
    if (this.videoCooldown > 0) this.videoCooldown -= dt;
    switch (this.hands) {
      case "beer":
        this.handsTimer -= dt;
        if (this.handsTimer <= 0) {
          this.hands = "free";
          this.drunk += 1;
          this.drunkDecay = 0;
          this.warm = Math.max(this.warm, 25);
          this.emit({ type: "beerDone" });
          this.addRage(-26);
          if (this.drunk >= 5 && this.phase === "playing") {
            this.hands = "asleep";
            this.handsTimer = 7;
            this.sleepMissed = 0;
            this.sleepRage = 0;
            this.holding = false;
            this.startRod(99);
            this.emit({ type: "sleep" });
          }
        }
        break;
      case "phone":
        this.battery = Math.max(0, this.battery - dt * 3.2);
        if (this.battery <= 0) this.closePhone();
        break;
      case "call":
        this.handsTimer -= dt;
        this.addRage(1.6 * dt);
        if (this.handsTimer <= 0) {
          this.hands = "free";
          this.emit({ type: "hazardEnd", hazard: "wife" });
        }
        break;
      case "steal":
        if (this.gaze === "watching") {
          this.hands = "free";
          this.stealProgress = 0;
          this.stealCooldown = 9;
          this.suspicion += 2;
          this.caughtStealing += 1;
          this.gazeTimer = 2.2;
          this.emit({ type: "caught" });
          this.addRage(22);
          break;
        }
        this.stealProgress += dt / this.stealDuration;
        if (this.stealProgress >= 1) {
          const fish = this.friendBucket.pop();
          this.hands = "free";
          this.stealProgress = 0;
          this.stealCooldown = 4;
          this.suspicion += 1;
          this.lastSteal = this.dayTime;
          if (fish) {
            this.myFish.push(fish);
            this.stolenCount += 1;
            this.dryTime = 0;
            this.emit({ type: "stolen", fish });
            this.addRage(-34);
          }
        }
        break;
      case "asleep":
        this.handsTimer -= dt;
        if (this.handsTimer <= 0) {
          this.hands = "free";
          this.drunk = 2;
          this.startRod(0.5);
          this.emit({ type: "wake", missedFish: this.sleepMissed });
          const pending = this.sleepRage;
          this.sleepRage = 0;
          this.addRage(pending + 8);
        }
        break;
      default:
        break;
    }
  }

  private updateRod(dt: number): void {
    if (this.method === "feeder") this.feed = Math.max(0, this.feed - dt / 40);
    if (this.method === "ice") this.interest = Math.max(0, this.interest - dt * 0.33);
    const busy = this.hands === "asleep" || this.hands === "call";
    switch (this.rod) {
      case "recast":
        this.rodTimer -= dt;
        if (this.rodTimer <= 0) {
          if (this.method === "spin") {
            this.rod = "retrieve";
            this.lure = 1;
            this.idleHold = 0;
            this.emit({ type: "cast" });
          } else {
            this.rod = "waiting";
            this.rodTimer = this.nextBiteDelay();
            if (this.method === "float") this.emit({ type: "cast" });
          }
        }
        break;
      case "casting":
        this.rodTimer -= dt;
        if (this.rodTimer <= 0) {
          this.rod = "waiting";
          this.rodTimer = this.nextBiteDelay();
        }
        break;
      case "waiting":
        if (busy) break;
        if (this.method === "ice") {
          // Bites only come while the jig is worked in rhythm.
          const [lo, hi] = INTEREST_BAND;
          if (this.interest >= lo && this.interest <= hi && this.quietBites <= 0.5 && this.rng() < dt * 0.55 * this.stats.bite) {
            this.rod = "bite";
            this.biteWindow = this.biteWindowLength;
            this.rodTimer = this.biteWindow;
            this.emit({ type: "bite" });
          }
          break;
        }
        this.rodTimer -= dt;
        if (this.rodTimer <= 0) {
          const fakeChance = this.method === "feeder" ? 0.15 : Math.max(0.08, 0.32 - this.stats.fake);
          if (this.rng() < fakeChance) {
            this.rod = "nibble";
            this.rodTimer = 0.9;
            this.emit({ type: "nibble" });
          } else {
            this.rod = "bite";
            this.biteWindow = this.biteWindowLength;
            this.rodTimer = this.biteWindow;
            this.emit({ type: "bite" });
          }
        }
        break;
      case "nibble":
        this.rodTimer -= dt;
        if (this.rodTimer <= 0) {
          this.rod = "waiting";
          this.rodTimer = this.r(1.2, 3.5);
        }
        break;
      case "bite":
        this.rodTimer -= dt;
        if (this.rodTimer <= 0) {
          this.emit({ type: "missed" });
          this.addRage(8);
          if (this.method === "spin" && this.lure > 0.05) {
            this.rod = "retrieve";
          } else this.startRod(1.4);
        }
        break;
      case "retrieve":
        if (busy) break;
        this.updateRetrieve(dt);
        break;
      case "reeling": {
        this.reelTime += dt;
        const wobble = this.drunk > 1 ? Math.sin(this.reelTime * 13) * 0.03 * this.drunk : 0;
        const t = (this.reelTime * this.reelSpeed) % 2;
        this.reelMarker = clamp((t < 1 ? t : 2 - t) + wobble, 0, 1);
        if (this.reelTime > 6) {
          this.emit({ type: "snap" });
          this.addRage(10);
          this.startRod(1.5);
        }
        break;
      }
      case "fight":
        this.updateFight(dt);
        break;
      default:
        break;
    }
  }

  private updateRetrieve(dt: number): void {
    if (this.holding !== this.lastHold) {
      // Stop-and-go "ступенька" retrieve is what predators fall for.
      this.twitch = Math.min(3, this.twitch + 0.6);
      this.lastHold = this.holding;
    }
    this.twitch = Math.max(0, this.twitch - dt * 0.8);
    if (this.holding) {
      this.lure = Math.max(0, this.lure - dt * 0.12 * this.stats.retrieve);
      this.idleHold = 0;
    } else {
      this.idleHold += dt;
      if (this.idleHold > 3 && this.rng() < dt * 0.3) {
        this.emit({ type: "snag" });
        this.addRage(8);
        this.startRod(2);
        return;
      }
    }
    const chance = (this.holding ? 0.07 : 0.025) + this.twitch * 0.042;
    if (this.quietBites <= 0.5 && this.lure > 0.08 && this.rng() < dt * chance * this.stats.bite) {
      this.rod = "bite";
      this.biteWindow = this.biteWindowLength;
      this.rodTimer = this.biteWindow;
      this.emit({ type: "bite" });
      return;
    }
    if (this.lure <= 0) this.startRod(0.8);
  }

  private updateFight(dt: number): void {
    const fish = this.hooked;
    if (!fish) return this.startRod(1);
    this.fightTime += dt;
    const heft = 0.6 + fish.size * 0.22 + Math.min(1.2, fish.weight / 8);
    if (this.holding) this.tension += dt * (0.38 + heft * 0.2) / this.stats.power;
    else this.tension -= dt * 0.5;
    if (this.drunk > 1) this.tension += Math.sin(this.fightTime * 11) * 0.012 * this.drunk;
    this.surgeTimer -= dt;
    if (this.surgeTimer <= 0) {
      this.surgeTimer = this.r(0.9, 2.2);
      this.tension += 0.08 + 0.06 * fish.size;
      this.emit({ type: "surge" });
    }
    this.tension = clamp(this.tension, 0, 1.05);
    const [lo, hi] = GREEN;
    if (this.tension >= lo && this.tension <= hi && this.holding) {
      this.fightProgress += dt * 0.38 * this.stats.power / heft;
    }
    if (this.tension < 0.06) this.slackTime += dt;
    else this.slackTime = 0;
    // A moment of grace at the limit: humans need a beat to let go.
    this.overload = this.tension >= 1 ? this.overload + dt : 0;
    if (this.overload > 0.4) {
      this.emit({ type: "snap" });
      this.addRage(12);
      this.startRod(1.5);
    } else if (this.slackTime > 1.6 || this.fightTime > 24) {
      this.emit({ type: "escaped" });
      this.addRage(9);
      this.startRod(1.5);
    } else if (this.fightProgress >= 1) {
      this.land();
    }
  }

  private updateFriend(dt: number): void {
    this.friendTimer -= dt;
    if (this.friendTimer <= 0 && this.gaze !== "distracted") {
      const fish = this.drawFriendFish();
      this.friendTimer = this.r(...this.level.friendEvery) + this.quietBites * 0.5;
      this.giveFriend(fish);
    }
    this.gazeTimer -= dt;
    if (this.gazeTimer > 0) return;
    switch (this.gaze) {
      case "rod":
      case "reeling": {
        const glanceChance = Math.min(0.75, 0.38 + this.suspicion * 0.08);
        if (this.rng() < glanceChance) {
          this.gaze = "suspicious";
          this.gazeTimer = Math.max(0.42, 0.7 - this.suspicion * 0.04);
          this.emit({ type: "friendSuspicious" });
        } else {
          const reasons = ["phone", "bushes", "stretch"] as const;
          const reason = reasons[Math.floor(this.rng() * reasons.length)];
          this.gaze = "distracted";
          this.gazeTimer = reason === "bushes" ? this.r(5, 7) : this.r(2.8, 4.5);
          this.emit({ type: "friendDistracted", reason });
        }
        break;
      }
      case "suspicious":
        this.gaze = "watching";
        this.gazeTimer = this.r(1.1, 1.8);
        this.emit({ type: "friendWatching" });
        break;
      case "watching":
      case "distracted":
        this.gaze = "rod";
        this.gazeTimer = this.r(2.5, 5.5) / (1 + this.suspicion * 0.12);
        this.emit({ type: "friendBack" });
        break;
    }
  }

  private giveFriend(fish: Fish): void {
    this.friendFish.push(fish);
    this.friendBucket.push(fish);
    this.emit({ type: "friendCatch", fish });
    if (this.hands === "asleep") this.sleepMissed += 1;
    const big = fish.species === "СОМ" ? 14 : fish.species === "ЦАРЬ-СОМ" ? 30 : 0;
    this.addRage(8 + fish.size * 4.5 + big);
    if (this.gaze === "rod" || this.gaze === "suspicious") {
      this.gaze = "reeling";
      this.gazeTimer = 1.6;
    }
  }

  // ---------------------------------------------------------------- hazards
  private updateHazards(dt: number): void {
    if (this.hazard) {
      this.hazardLeft -= dt;
      switch (this.hazard) {
        case "mosquito":
          if (this.smoking <= 0) this.addRage(0.9 * dt);
          break;
        case "neighbors":
          this.addRage(0.45 * dt);
          break;
        case "drone":
          this.addRage(0.3 * dt);
          break;
        case "nadzor":
          if (this.hands === "steal" || this.hands === "beer") this.nadzorBust(this.hands === "steal" ? "ВОРОВСТВО РЫБЫ" : "ПЬЯНСТВО НА ВОДОЁМЕ");
          break;
        case "iceCrack":
          if (this.hazardLeft <= 0 && this.drunk >= 3 && this.phase === "playing") {
            this.phase = "fell";
            this.rod = "broken";
            this.meltdownTimer = 3;
            this.emit({ type: "fell" });
            return;
          }
          break;
        default:
          break;
      }
      if (this.hazardLeft <= 0) {
        if (this.hazard === "nadzor" && this.drunk >= 2) this.nadzorBust("ПЬЯНЫЙ НА ВОДЕ");
        if (this.hazard === "nadzor" && this.dayTime - this.lastSteal < 20) this.nadzorBust("ВОРОВСТВО РЫБЫ");
        if (this.hazard !== "wife") this.emit({ type: "hazardEnd", hazard: this.hazard });
        this.hazard = null;
      }
      return;
    }
    const pool = this.level.hazards.filter(([, w]) => w > 0);
    if (pool.length === 0) return;
    this.hazardTimer -= dt;
    if (this.hazardTimer > 0) return;
    const total = pool.reduce((s, [, w]) => s + w, 0);
    this.hazardTimer = this.r(14, 24) / Math.max(0.5, total * 0.8);
    this.trigger(this.pick(pool));
  }

  private nadzorBust(reason: string): void {
    if (this.hazard !== "nadzor" || this.nadzorBusted) return;
    this.nadzorBusted = true;
    this.fine(500, reason);
    const taken = this.myFish.pop();
    if (taken) this.emit({ type: "denied", reason: `ИЗЪЯЛИ: ${taken.species}` });
    this.addRage(15);
    this.hazardLeft = 0.5;
  }

  /** Start a hazard right now (also used by tests). */
  trigger(h: Hazard): void {
    if (this.phase !== "playing") return;
    this.hazard = h;
    this.hazardLeft = 0;
    this.emit({ type: "hazard", hazard: h });
    switch (h) {
      case "wife":
        if (this.hands === "phone") this.closePhone();
        if (this.hands === "steal") this.cancelSteal();
        if (this.hands !== "asleep") {
          this.hands = "call";
          this.handsTimer = 4.5;
          this.holding = false;
        }
        this.addRage(6);
        break;
      case "mosquito":
        this.hazardLeft = 12;
        break;
      case "gopniki":
        if (this.beers > 0) this.beers -= 1;
        else this.cigs = Math.max(0, this.cigs - 3);
        this.addRage(9);
        break;
      case "jetski":
      case "dump":
        this.quietBites = 7;
        if (this.rod === "waiting") this.rodTimer += 7;
        this.friendTimer += h === "dump" ? 6 : 2;
        this.addRage(5);
        this.hazardLeft = 7;
        break;
      case "neighbors":
        this.hazardLeft = 10;
        this.addRage(4);
        break;
      case "ashot":
        this.hazardLeft = 10;
        if (this.hands === "beer") this.fine(300, "СВОЁ ПИВО У АШОТА");
        break;
      case "tolikCheat":
        this.giveFriend(this.makeFish("КАРП"));
        this.giveFriend(this.makeFish("КАРП"));
        break;
      case "iceCrack":
        this.hazardLeft = 3.5;
        this.iceWarned = this.drunk >= 3;
        break;
      case "leech":
        this.addRage(7);
        break;
      case "nadzor":
        this.hazardLeft = 8;
        this.nadzorBusted = false;
        break;
      case "crowd":
        this.hazardLeft = 8;
        this.addRage(5);
        break;
      case "drone":
        this.hazardLeft = 9;
        this.quietBites = Math.max(this.quietBites, 3);
        break;
    }
  }

  get iceDanger(): boolean {
    return this.iceWarned;
  }

  // ---------------------------------------------------------------- results
  private finish(survived: boolean, reason?: LoseReason): void {
    const myKg = this.myKg;
    const friendKg = this.friendKg;
    const metTarget = myKg >= this.level.target && (!this.level.mustBeatTolik || myKg > friendKg);
    const pass = survived && metTarget;
    let stars = 0;
    if (pass) {
      stars = 1;
      if (myKg >= this.level.target * 1.6) stars += 1;
      if (myKg > friendKg) stars += 1;
    }
    const fishMoney = Math.round(this.myFish.reduce((s, f) => s + f.weight * (FISH[f.species]?.price ?? 0), 0));
    const starMoney = stars * MONEY_PER_STAR * this.level.id;
    const money = Math.max(0, fishMoney + starMoney - this.fines);
    this.result = {
      level: this.level.id,
      pass,
      reason: pass ? undefined : reason ?? (survived ? "target" : "rage"),
      stars,
      myKg,
      friendKg,
      myCount: this.myFish.length,
      fishMoney,
      starMoney,
      fines: this.fines,
      money,
      stolen: this.stolenCount,
      caught: this.caughtStealing,
      biggest: [...this.myFish].sort((a, b) => b.weight - a.weight)[0],
    };
    this.phase = pass ? "won" : "lost";
    this.hands = "free";
    this.holding = false;
    this.emit(pass ? { type: "won", result: this.result } : { type: "lost", result: this.result });
  }

  private flush(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  get myKg(): number {
    return Math.round(this.myFish.reduce((s, f) => s + f.weight, 0) * 100) / 100;
  }

  get friendKg(): number {
    const kept = this.friendFish.filter((f) => !this.myFish.includes(f));
    return Math.round(kept.reduce((s, f) => s + f.weight, 0) * 100) / 100;
  }

  snapshot(): SimSnapshot {
    const progress = clamp(this.dayTime / this.level.length, 0, 1);
    const minutes = Math.floor(5 * 60 + progress * 16 * 60);
    return {
      phase: this.phase,
      level: this.level.id,
      levelName: this.level.name,
      method: this.method,
      dayProgress: progress,
      clock: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
      rage: this.rage,
      drunk: this.drunk,
      rod: this.rod,
      hands: this.hands,
      gaze: this.gaze,
      smoking: this.smoking,
      beers: this.beers,
      cigs: this.cigs,
      battery: this.battery,
      stealProgress: this.stealProgress,
      stealCooldown: this.stealCooldown,
      reelMarker: this.reelMarker,
      reelZone: this.reelZone,
      tension: this.tension,
      fightProgress: this.fightProgress,
      greenZone: GREEN,
      lure: this.lure,
      holding: this.holding,
      interest: this.interest,
      interestBand: INTEREST_BAND,
      feed: this.feed,
      warm: this.warm,
      cold: !!this.level.cold,
      hazard: this.hazard,
      hazardLeft: this.hazardLeft,
      myCount: this.myFish.length,
      myKg: this.myKg,
      target: this.level.target,
      friendCount: this.friendFish.length - this.stolenCount,
      friendKg: this.friendKg,
      friendBucket: this.friendBucket.length,
      fines: this.fines,
    };
  }
}
