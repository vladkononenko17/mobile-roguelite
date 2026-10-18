/**
 * Quick-time events for «Розшук». Pure logic; the UI only draws `Qte` and
 * forwards taps, holds, swipes and choices.
 *
 *  mash    tap fast to fill the bar before it drains (wriggle free, swim)
 *  timing  tap when the sweeping marker is in the green (vault, dodge, work)
 *  swipe   follow the arrows in time (talk your way out, dodge through a crowd)
 *  hold    hold to raise the marker, release to drop it; keep it in the band
 *  choice  pick an answer before the timer runs out
 */

export type QteKind = "mash" | "timing" | "swipe" | "hold" | "choice";
export type Dir = "up" | "down" | "left" | "right";
export const DIRS: Dir[] = ["up", "down", "left", "right"];
export const DIR_ARROW: Record<Dir, string> = { up: "↑", down: "↓", left: "←", right: "→" };

export interface QteOption { id: string; label: string }

export interface QteSpec {
  kind: QteKind;
  title: string;
  prompt: string;
  /** Overall time limit in seconds. */
  time: number;
  /** mash: taps needed if none drained; drain per second as a fraction. */
  taps?: number;
  drain?: number;
  /** timing: sweeps per second, green width (0..1), hits needed, misses allowed. */
  speed?: number;
  zone?: number;
  hits?: number;
  lives?: number;
  /** swipe: number of arrows and seconds per arrow. */
  steps?: number;
  stepTime?: number;
  /** hold: band and how long to stay in it; rise/fall speeds. */
  band?: [number, number];
  holdTime?: number;
  rise?: number;
  fall?: number;
  /** hold: random gusts that push the marker. */
  wobble?: number;
  /** choice */
  options?: QteOption[];
  /** Option picked when the timer runs out. */
  timeoutOption?: string;
}

export type QteResult = null | "win" | "fail" | { choice: string };

export class Qte {
  readonly spec: QteSpec;
  t = 0;
  /** mash / hold progress 0..1 */
  progress = 0;
  /** timing / hold marker 0..1 */
  marker = 0;
  zoneStart = 0;
  hits = 0;
  misses = 0;
  seq: Dir[] = [];
  step = 0;
  stepT = 0;
  holding = false;
  /** hold: seconds spent outside the band */
  outside = 0;
  flash: "hit" | "miss" | null = null;
  flashT = 0;
  result: QteResult = null;
  private dirSign = 1;
  private gust = 0;
  private gustT = 0;
  private rng: () => number;

  constructor(spec: QteSpec, rng: () => number = Math.random) {
    this.spec = spec;
    this.rng = rng;
    if (spec.kind === "timing") this.placeZone();
    if (spec.kind === "swipe") {
      const n = spec.steps ?? 4;
      for (let i = 0; i < n; i++) {
        let d = DIRS[Math.floor(rng() * 4)];
        if (i > 0 && d === this.seq[i - 1] && rng() < 0.6) d = DIRS[(DIRS.indexOf(d) + 1 + Math.floor(rng() * 3)) % 4];
        this.seq.push(d);
      }
    }
    if (spec.kind === "hold") this.marker = 0.15;
  }

  get done(): boolean { return this.result !== null; }
  get timeLeft(): number { return Math.max(0, this.spec.time - this.t); }
  get zone(): [number, number] {
    const w = this.spec.zone ?? 0.2;
    return [this.zoneStart, this.zoneStart + w];
  }
  get band(): [number, number] { return this.spec.band ?? [0.4, 0.7]; }

  private placeZone(): void {
    const w = this.spec.zone ?? 0.2;
    this.zoneStart = 0.08 + this.rng() * Math.max(0, 0.84 - w);
  }

  update(dt: number): void {
    if (this.result) return;
    this.t += dt;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash = null; }
    const s = this.spec;
    switch (s.kind) {
      case "mash":
        this.progress = Math.max(0, this.progress - (s.drain ?? 0.25) * dt);
        break;
      case "timing": {
        this.marker += this.dirSign * (s.speed ?? 0.8) * dt;
        if (this.marker > 1) { this.marker = 2 - this.marker; this.dirSign = -1; }
        if (this.marker < 0) { this.marker = -this.marker; this.dirSign = 1; }
        break;
      }
      case "swipe":
        this.stepT += dt;
        if (this.stepT > (s.stepTime ?? 1.2)) { this.result = "fail"; this.flash = "miss"; return; }
        break;
      case "hold": {
        this.gustT -= dt;
        if (this.gustT <= 0) { this.gust = (this.rng() - 0.5) * 2 * (s.wobble ?? 0.25); this.gustT = 0.5 + this.rng() * 0.8; }
        const v = this.holding ? (s.rise ?? 0.55) : -(s.fall ?? 0.5);
        this.marker = Math.max(0, Math.min(1, this.marker + (v + this.gust) * dt));
        const [a, b] = this.band;
        if (this.marker >= a && this.marker <= b) this.progress += dt / (s.holdTime ?? 4);
        else if (this.t > 0.8) this.outside += dt;
        if (this.progress >= 1) { this.result = "win"; return; }
        if (this.outside > 1.6) { this.result = "fail"; return; }
        break;
      }
      case "choice":
        break;
    }
    if (this.t >= s.time) {
      if (s.kind === "choice") this.result = { choice: s.timeoutOption ?? s.options?.[s.options.length - 1]?.id ?? "" };
      else if (s.kind === "hold") this.result = this.progress >= 0.75 ? "win" : "fail";
      else this.result = "fail";
    }
  }

  tap(): void {
    if (this.result) return;
    const s = this.spec;
    if (s.kind === "mash") {
      this.progress += 1 / (s.taps ?? 12);
      if (this.progress >= 1 - 1e-9) this.result = "win";
    } else if (s.kind === "timing") {
      const [a, b] = this.zone;
      if (this.marker >= a - 0.015 && this.marker <= b + 0.015) {
        this.hits++;
        this.flash = "hit";
        this.flashT = 0.25;
        if (this.hits >= (s.hits ?? 1)) { this.result = "win"; return; }
        this.placeZone();
      } else {
        this.misses++;
        this.flash = "miss";
        this.flashT = 0.25;
        if (this.misses > (s.lives ?? 0)) this.result = "fail";
      }
    }
  }

  press(down: boolean): void {
    if (this.spec.kind === "hold") this.holding = down;
    else if (down) this.tap();
  }

  swipe(dir: Dir): void {
    if (this.result || this.spec.kind !== "swipe") return;
    if (dir === this.seq[this.step]) {
      this.step++;
      this.stepT = 0;
      this.flash = "hit";
      this.flashT = 0.2;
      if (this.step >= this.seq.length) this.result = "win";
    } else {
      this.flash = "miss";
      this.result = "fail";
    }
  }

  choose(id: string): void {
    if (this.result || this.spec.kind !== "choice") return;
    if (this.spec.options?.some((o) => o.id === id)) this.result = { choice: id };
  }
}

/** Difficulty knobs shared by every QTE builder. */
export interface QteMods {
  /** 1 = normal, higher = easier mashing. */
  power: number;
  /** Multiplier for green zones and bands. */
  zone: number;
  /** Multiplier for reaction times. */
  time: number;
  /** Swipe steps removed. */
  shorter: number;
  /** 1..3 */
  tier: number;
}

export const BASE_MODS: QteMods = { power: 1, zone: 1, time: 1, shorter: 0, tier: 1 };

/**
 * Tuned for a thumb on glass: ~6–7 taps a second clears tier 3 in time,
 * ~5 a second is plenty on tier 1. `extra` adds taps and a little time.
 */
export function mashSpec(title: string, prompt: string, m: QteMods, extra = 0): QteSpec {
  const taps = Math.round((10 + m.tier * 3 + extra) / m.power);
  return { kind: "mash", title, prompt, time: (5 + m.tier * 0.5) * m.time + extra * 0.8, taps, drain: 0.08 + m.tier * 0.04 };
}

export function timingSpec(title: string, prompt: string, m: QteMods, hits = 1, lives = 1): QteSpec {
  return {
    kind: "timing", title, prompt, time: 3.2 + hits * 1.6, hits, lives,
    zone: Math.min(0.5, (0.26 - m.tier * 0.03) * m.zone), speed: 0.7 + m.tier * 0.18,
  };
}

export function swipeSpec(title: string, prompt: string, m: QteMods, steps = 4): QteSpec {
  const n = Math.max(2, steps + m.tier - 1 - m.shorter);
  return { kind: "swipe", title, prompt, time: 30, steps: n, stepTime: (1.45 - m.tier * 0.15) * m.time };
}

export function holdSpec(title: string, prompt: string, m: QteMods, holdTime = 4): QteSpec {
  const w = Math.min(0.45, (0.3 - m.tier * 0.03) * m.zone);
  const mid = 0.55;
  return {
    kind: "hold", title, prompt, time: holdTime * 2.2, holdTime, band: [mid - w / 2, mid + w / 2],
    rise: 0.55, fall: 0.5, wobble: 0.1 + m.tier * 0.05,
  };
}

export function choiceSpec(title: string, prompt: string, options: QteOption[], m: QteMods, time = 5, timeoutOption?: string): QteSpec {
  return { kind: "choice", title, prompt, time: time * m.time, options, timeoutOption };
}
