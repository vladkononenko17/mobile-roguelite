/**
 * Pure simulation for «Не клюёт». No Phaser imports: the scene only renders
 * this state and forwards taps, so every rule here is covered by node tests.
 */

export type Phase = "playing" | "meltdown" | "dayEnd" | "won" | "lost";
export type RodState = "waiting" | "nibble" | "bite" | "reeling" | "recast" | "broken";
export type Hands = "free" | "beer" | "phone" | "steal" | "asleep";
export type FriendGaze = "rod" | "distracted" | "suspicious" | "watching" | "reeling";
export type PerkId = "rod" | "bait" | "beer" | "smokes" | "powerbank" | "zen" | "hands" | "reel";

export interface Fish {
  species: string;
  weight: number;
  size: 1 | 2 | 3;
}

export type SimEvent =
  | { type: "nibble" }
  | { type: "bite" }
  | { type: "early" }
  | { type: "missed" }
  | { type: "hooked" }
  | { type: "catch"; fish: Fish }
  | { type: "snap" }
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
  | { type: "meltdown" }
  | { type: "dayEnd"; day: number }
  | { type: "won" }
  | { type: "lost" }
  | { type: "denied"; reason: string };

export interface Video {
  emoji: string;
  caption: string;
  rage: number;
  tint: string;
}

export interface PerkInfo {
  id: PerkId;
  title: string;
  description: string;
  icon: string;
  accent: string;
}

export const PERKS: Record<PerkId, PerkInfo> = {
  rod: { id: "rod", title: "КАРБОНОВОЕ УДИЛИЩЕ", description: "Окно подсечки +25%", icon: "🎣", accent: "#f2b632" },
  bait: { id: "bait", title: "МОТЫЛЬ ОТ БАБЫ НИНЫ", description: "Клюёт на 20% чаще, меньше пустых поклёвок", icon: "🪱", accent: "#d63732" },
  beer: { id: "beer", title: "ЯЩИК ПЕННОГО", description: "+2 банки в день, каждая успокаивает сильнее", icon: "🍺", accent: "#e8602f" },
  smokes: { id: "smokes", title: "БЛОК СИГАРЕТ", description: "+6 сигарет в пачке", icon: "🚬", accent: "#b8ab91" },
  powerbank: { id: "powerbank", title: "ПАУЭРБАНК", description: "Телефон заряжен и садится вдвое медленнее", icon: "🔋", accent: "#b8d84a" },
  zen: { id: "zen", title: "АУДИОКНИГА ПРО ДЗЕН", description: "Чужой улов бесит на 25% меньше", icon: "🧘", accent: "#54b7c6" },
  hands: { id: "hands", title: "ЛОВКИЕ РУКИ", description: "Тырить рыбу на 35% быстрее", icon: "🫳", accent: "#9a6bd1" },
  reel: { id: "reel", title: "БЕЗЫНЕРЦИОННАЯ КАТУШКА", description: "Зелёная зона при вываживании +35%", icon: "⚙️", accent: "#54b7c6" },
};

export const DAYS = [
  { name: "СУББОТА", length: 75, friendEvery: [8.5, 12.5] as [number, number] },
  { name: "ВОСКРЕСЕНЬЕ", length: 82, friendEvery: [6.5, 10] as [number, number] },
  { name: "ПОНЕДЕЛЬНИК (ОТГУЛ)", length: 90, friendEvery: [4.8, 7.6] as [number, number] },
];

export const VIDEOS: Video[] = [
  { emoji: "🐈", caption: "кот уронил ёлку и делает вид, что так и было", rage: -9, tint: "#f2b632" },
  { emoji: "👵", caption: "бабуля танцует под техно на рынке", rage: -8, tint: "#e8602f" },
  { emoji: "🐕", caption: "пёс впервые увидел снег", rage: -7, tint: "#54b7c6" },
  { emoji: "🦆", caption: "утка гоняет гопника по парку", rage: -10, tint: "#b8d84a" },
  { emoji: "🚗", caption: "сосед паркуется 14 минут", rage: -6, tint: "#9a6bd1" },
  { emoji: "🍳", caption: "лайфхак: яичница в чайнике", rage: -4, tint: "#e7ddc6" },
  { emoji: "🐟", caption: "блогер вытащил сома на 40 кг с первого заброса", rage: 9, tint: "#d63732" },
  { emoji: "💸", caption: "как я заработал миллион за неделю (не кликбейт)", rage: 5, tint: "#d63732" },
  { emoji: "🎣", caption: "ТОП-5 ошибок рыбака: ты делаешь все пять", rage: 7, tint: "#d63732" },
  { emoji: "🐐", caption: "коза залезла на дерево и не хочет обратно", rage: -9, tint: "#b8d84a" },
  { emoji: "🧀", caption: "кот против огурца, раунд 3", rage: -8, tint: "#f2b632" },
  { emoji: "🕺", caption: "дядя Валера на свадьбе", rage: -11, tint: "#e8602f" },
];

const PLAYER_FISH: Array<[string, number, number, 1 | 2 | 3, number]> = [
  // species, min kg, max kg, size, weight in the draw
  ["ЁРШ", 0.03, 0.08, 1, 5],
  ["ПЛОТВА", 0.08, 0.25, 1, 5],
  ["ОКУНЬ", 0.15, 0.45, 1, 4],
  ["КАРАСЬ", 0.3, 0.8, 2, 2],
  ["ЛЕЩ", 0.8, 1.9, 2, 1],
  ["ЩУКА", 2, 4.5, 3, 0.35],
];

const FRIEND_FISH: Array<[string, number, number, 1 | 2 | 3, number]> = [
  ["ОКУНЬ", 0.25, 0.6, 1, 3],
  ["КАРАСЬ", 0.4, 1.0, 2, 4],
  ["ЛЕЩ", 1.0, 2.4, 2, 4],
  ["СУДАК", 1.5, 3.2, 3, 2],
  ["ЩУКА", 2.5, 6, 3, 1.6],
  ["СОМ", 7, 16, 3, 0.35],
];

export interface SimSnapshot {
  phase: Phase;
  day: number;
  dayName: string;
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
  myCount: number;
  myKg: number;
  friendCount: number;
  friendKg: number;
  friendBucket: number;
  perks: Record<PerkId, number>;
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

export class FishingSim {
  phase: Phase = "playing";
  day = 0;
  dayTime = 0;
  rage = 18;
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
  myFish: Fish[] = [];
  friendFish: Fish[] = [];
  /** Fish still in the friend's bucket (stealable), separate from his tally. */
  friendBucket: Fish[] = [];
  stolenCount = 0;
  caughtStealing = 0;
  perks: Record<PerkId, number> = { rod: 0, bait: 0, beer: 0, smokes: 0, powerbank: 0, zen: 0, hands: 0, reel: 0 };
  suspicion = 0;

  private rodTimer = 0;
  private biteWindow = 0;
  private reelTime = 0;
  private reelSpeed = 1;
  private handsTimer = 0;
  private friendTimer = 0;
  private gazeTimer = 0;
  private drunkDecay = 0;
  private sleepMissed = 0;
  private sleepRage = 0;
  private meltdownTimer = 0;
  private videoCooldown = 0;
  private dryTime = 0;
  private events: SimEvent[] = [];
  private rng: () => number;

  constructor(seed = Date.now()) {
    this.rng = mulberry32(seed);
    this.startDay(0);
  }

  // ---------- helpers ----------
  private r(lo: number, hi: number): number {
    return lo + (hi - lo) * this.rng();
  }

  private emit(event: SimEvent): void {
    this.events.push(event);
  }

  private drawFish(table: typeof PLAYER_FISH): Fish {
    const total = table.reduce((sum, row) => sum + row[4], 0);
    let roll = this.rng() * total;
    for (const [species, lo, hi, size, w] of table) {
      roll -= w;
      if (roll <= 0) return { species, weight: Math.round(this.r(lo, hi) * 100) / 100, size };
    }
    const [species, lo, hi, size] = table[0];
    return { species, weight: Math.round(this.r(lo, hi) * 100) / 100, size };
  }

  private addRage(amount: number): void {
    if (this.phase !== "playing") return;
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
    this.meltdownTimer = 3.4;
    this.emit({ type: "meltdown" });
  }

  private recast(delay = 1.2): void {
    this.rod = "recast";
    this.rodTimer = delay;
  }

  private nextBiteDelay(): number {
    const luck = 1 + this.perks.bait * 0.2;
    // The hero is cursed: the first bite of a day takes a while.
    return this.r(6.5, 13.5) / luck;
  }

  private get biteWindowLength(): number {
    const drunkPenalty = Math.max(0, this.drunk - 1) * 0.06;
    return Math.max(0.38, 0.82 * (1 + this.perks.rod * 0.25) - drunkPenalty);
  }

  private get beerPerDay(): number {
    return 3 + this.perks.beer * 2;
  }

  get stealDuration(): number {
    return 1.7 / (1 + this.perks.hands * 0.35);
  }

  // ---------- day flow ----------
  startDay(index: number): void {
    this.day = index;
    this.dayTime = 0;
    this.phase = "playing";
    this.rod = "waiting";
    this.rodTimer = this.nextBiteDelay() + 2;
    this.hands = "free";
    this.handsTimer = 0;
    this.gaze = "rod";
    this.gazeTimer = this.r(4, 7);
    this.friendTimer = this.r(...DAYS[index].friendEvery) * 0.7;
    this.beers = this.beerPerDay;
    this.smoking = 0;
    this.stealProgress = 0;
    this.stealCooldown = 0;
    this.suspicion = Math.max(0, this.suspicion - 1);
    this.drunk = 0;
    this.dryTime = 0;
    this.friendBucket = [];
    if (index > 0) {
      // A night's sleep halves the anger, but never fully resets it.
      this.rage = Math.max(12, Math.round(this.rage * 0.5));
    }
  }

  applyPerk(id: PerkId): void {
    this.perks[id] += 1;
    if (id === "smokes") this.cigs += 6;
    if (id === "powerbank") this.battery = 100;
    if (id === "beer") this.beers = this.beerPerDay;
  }

  /** Three distinct perks offered at the end of a day. */
  offerPerks(): PerkId[] {
    const ids = Object.keys(PERKS) as PerkId[];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, 3);
  }

  nextDay(perk: PerkId): void {
    if (this.phase !== "dayEnd") return;
    this.applyPerk(perk);
    this.startDay(this.day + 1);
  }

  // ---------- player input ----------
  /** The one big contextual button: strike, then stop the reel marker. */
  tap(): void {
    if (this.phase !== "playing") return;
    if (this.hands === "asleep" || this.hands === "beer") return;
    if (this.hands === "phone") this.closePhone();
    if (this.hands === "steal") this.cancelSteal();
    switch (this.rod) {
      case "nibble":
        this.emit({ type: "early" });
        this.addRage(6);
        this.recast(1.6);
        break;
      case "waiting":
        this.emit({ type: "early" });
        this.addRage(2);
        this.recast(1.2);
        break;
      case "bite":
        this.rod = "reeling";
        this.reelTime = 0;
        this.reelMarker = 0;
        {
          const width = 0.22 * (1 + this.perks.reel * 0.35);
          const start = this.r(0.08, 0.92 - width);
          this.reelZone = [start, start + width];
        }
        this.reelSpeed = this.r(0.75, 1.05) + this.day * 0.12;
        this.emit({ type: "hooked" });
        break;
      case "reeling": {
        const [lo, hi] = this.reelZone;
        if (this.reelMarker >= lo && this.reelMarker <= hi) {
          const fish = this.drawFish(PLAYER_FISH);
          this.myFish.push(fish);
          this.dryTime = 0;
          this.emit({ type: "catch", fish });
          this.addRage(-(20 + fish.size * 6));
        } else {
          this.emit({ type: "snap" });
          this.addRage(10);
        }
        this.recast(1.5);
        break;
      }
      default:
        break;
    }
  }

  drinkBeer(): void {
    if (this.phase !== "playing") return;
    if (this.hands === "asleep" || this.hands === "beer") return;
    if (this.beers <= 0) return this.emit({ type: "denied", reason: "ПИВО КОНЧИЛОСЬ" });
    if (this.rod === "reeling") return this.emit({ type: "denied", reason: "РУКИ ЗАНЯТЫ!" });
    if (this.hands === "phone") this.closePhone();
    if (this.hands === "steal") this.cancelSteal();
    this.beers -= 1;
    this.hands = "beer";
    this.handsTimer = 1.5;
    this.emit({ type: "beerOpen" });
  }

  lightSmoke(): void {
    if (this.phase !== "playing" || this.hands === "asleep") return;
    if (this.smoking > 0) return this.emit({ type: "denied", reason: "ЕЩЁ ЭТУ НЕ ДОКУРИЛ" });
    if (this.cigs <= 0) return this.emit({ type: "denied", reason: "ПАЧКА ПУСТАЯ" });
    this.cigs -= 1;
    this.smoking = 6;
    this.emit({ type: "smoke" });
  }

  openPhone(): void {
    if (this.phase !== "playing") return;
    if (this.hands !== "free") return;
    if (this.rod === "reeling") return this.emit({ type: "denied", reason: "РУКИ ЗАНЯТЫ!" });
    if (this.battery <= 0) return this.emit({ type: "denied", reason: "ТЕЛЕФОН СЕЛ" });
    this.hands = "phone";
    this.videoCooldown = 0;
    this.emit({ type: "phoneOpen" });
    this.swipe();
  }

  /** Next video in the feed. Most are soothing, some are fishing bloggers. */
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
    if (this.phase !== "playing" || this.hands !== "free") return;
    if (this.rod === "reeling") return this.emit({ type: "denied", reason: "РУКИ ЗАНЯТЫ!" });
    if (this.stealCooldown > 0) return this.emit({ type: "denied", reason: "ТОЛИК ЕЩЁ КОСИТСЯ" });
    if (this.friendBucket.length === 0) return this.emit({ type: "denied", reason: "В САДКЕ ПУСТО" });
    this.hands = "steal";
    this.stealProgress = 0;
  }

  cancelSteal(): void {
    if (this.hands !== "steal") return;
    this.hands = "free";
    this.stealProgress = 0;
  }

  // ---------- simulation ----------
  update(dt: number): SimEvent[] {
    dt = Math.min(dt, 0.1);
    if (this.phase === "meltdown") {
      this.meltdownTimer -= dt;
      if (this.meltdownTimer <= 0) {
        this.phase = "lost";
        this.emit({ type: "lost" });
      }
      return this.flush();
    }
    if (this.phase !== "playing") return this.flush();

    const day = DAYS[this.day];
    this.dayTime += dt;
    this.updateHands(dt);
    this.updateRod(dt);
    this.updateFriend(dt, day.friendEvery);

    if (this.smoking > 0) {
      const step = Math.min(dt, this.smoking);
      this.smoking -= step;
      this.addRage(-3.2 * step);
      if (this.smoking <= 0) this.emit({ type: "smokeDone" });
    }
    if (this.stealCooldown > 0) this.stealCooldown = Math.max(0, this.stealCooldown - dt);

    // Being skunked while someone else is hauling them in slowly cooks you.
    this.dryTime += dt;
    const deficit = Math.max(0, this.friendFish.length - this.myFish.length);
    const passive = 0.18 + Math.min(0.9, deficit * 0.05) + (this.dryTime > 25 ? 0.25 : 0);
    if (this.hands !== "phone") this.addRage(passive * dt);

    this.drunkDecay += dt;
    if (this.drunkDecay > 22 && this.drunk > 0) {
      this.drunk -= 1;
      this.drunkDecay = 0;
    }

    if (this.phase === "playing" && this.dayTime >= day.length) {
      this.hands = "free";
      this.rod = "waiting";
      if (this.day >= DAYS.length - 1) {
        this.phase = "won";
        this.emit({ type: "won" });
      } else {
        this.phase = "dayEnd";
        this.emit({ type: "dayEnd", day: this.day });
      }
    }
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
          this.emit({ type: "beerDone" });
          this.addRage(-(26 + this.perks.beer * 5));
          if (this.drunk >= 5) {
            this.hands = "asleep";
            this.handsTimer = 7;
            this.sleepMissed = 0;
            this.sleepRage = 0;
            this.rod = "waiting";
            this.rodTimer = 99;
            this.emit({ type: "sleep" });
          }
        }
        break;
      case "phone":
        this.battery = Math.max(0, this.battery - dt * (3.2 / (1 + this.perks.powerbank)));
        if (this.battery <= 0) this.closePhone();
        break;
      case "steal":
        if (this.gaze === "watching") {
          this.hands = "free";
          this.stealProgress = 0;
          this.stealCooldown = 9;
          this.suspicion += 2;
          this.caughtStealing += 1;
          this.gaze = "watching";
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
          this.recast(0.5);
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
    switch (this.rod) {
      case "recast":
        this.rodTimer -= dt;
        if (this.rodTimer <= 0) {
          this.rod = "waiting";
          this.rodTimer = this.nextBiteDelay();
        }
        break;
      case "waiting":
        if (this.hands === "asleep") break;
        this.rodTimer -= dt;
        if (this.rodTimer <= 0) {
          const fakeChance = Math.max(0.15, 0.45 - this.perks.bait * 0.12);
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
          this.recast(1.4);
        }
        break;
      case "reeling": {
        this.reelTime += dt;
        // Ping-pong marker; drunk hands add a wobble.
        const wobble = this.drunk > 1 ? Math.sin(this.reelTime * 13) * 0.03 * this.drunk : 0;
        const t = (this.reelTime * this.reelSpeed) % 2;
        this.reelMarker = clamp((t < 1 ? t : 2 - t) + wobble, 0, 1);
        if (this.reelTime > 6) {
          this.emit({ type: "snap" });
          this.addRage(10);
          this.recast(1.5);
        }
        break;
      }
      default:
        break;
    }
  }

  private updateFriend(dt: number, every: [number, number]): void {
    this.friendTimer -= dt;
    if (this.friendTimer <= 0 && this.gaze !== "distracted") {
      const fish = this.drawFish(FRIEND_FISH);
      this.friendFish.push(fish);
      this.friendBucket.push(fish);
      this.friendTimer = this.r(...every);
      this.emit({ type: "friendCatch", fish });
      if (this.hands === "asleep") this.sleepMissed += 1;
      const zen = 1 - Math.min(0.6, this.perks.zen * 0.25);
      const big = fish.species === "СОМ" ? 14 : 0;
      this.addRage((8 + fish.size * 4.5 + big) * zen);
      // Hauling a fish keeps his eyes on his own line for a moment.
      if (this.gaze === "rod" || this.gaze === "suspicious") {
        this.gaze = "reeling";
        this.gazeTimer = 1.6;
      }
    }

    this.gazeTimer -= dt;
    if (this.gazeTimer > 0) return;
    switch (this.gaze) {
      case "rod":
      case "reeling": {
        const roll = this.rng();
        const glanceChance = Math.min(0.75, 0.38 + this.suspicion * 0.08);
        if (roll < glanceChance) {
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

  private flush(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  get myKg(): number {
    return Math.round(this.myFish.reduce((s, f) => s + f.weight, 0) * 100) / 100;
  }

  get friendKg(): number {
    // Stolen fish move into myFish by reference, so they stop counting for him.
    const kept = this.friendFish.filter((f) => !this.myFish.includes(f));
    return Math.round(kept.reduce((s, f) => s + f.weight, 0) * 100) / 100;
  }

  snapshot(): SimSnapshot {
    const day = DAYS[Math.min(this.day, DAYS.length - 1)];
    const progress = clamp(this.dayTime / day.length, 0, 1);
    const minutes = Math.floor(5 * 60 + progress * 16 * 60);
    return {
      phase: this.phase,
      day: this.day,
      dayName: day.name,
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
      myCount: this.myFish.length,
      myKg: this.myKg,
      friendCount: this.friendFish.length - this.stolenCount,
      friendKg: this.friendKg,
      friendBucket: this.friendBucket.length,
      perks: { ...this.perks },
    };
  }
}

export function rankFor(myKg: number, friendKg: number, stolen: number): { rank: string; title: string } {
  if (myKg > friendKg && stolen === 0) return { rank: "S", title: "ЧЕСТНЫЙ РЫБАК. ТАКИХ НЕ БЫВАЕТ" };
  if (myKg > friendKg) return { rank: "A", title: "ПЕРЕЛОВИЛ ТОЛИКА. ПОЧТИ ЧЕСТНО" };
  if (myKg > friendKg * 0.5) return { rank: "B", title: "ДОСИДЕЛ. НЕРВЫ ЦЕЛЫ" };
  return { rank: "C", title: "ГЛАВНОЕ НЕ УЛОВ, А ОТДЫХ" };
}
