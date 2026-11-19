/**
 * Sound for «Чотири стіни», synthesized with WebAudio on top of the «Розшук»
 * buses: the siren, the moped buzz of a shahed getting closer, explosions,
 * the drill upstairs, a clock that ticks louder when you are low, tinnitus,
 * and a sparse piano that loses notes as you lose joy. Nothing to license.
 */
import { getAudio, noise, play, tone } from "../../rozshuk/src/sfx.ts";

export { isMusicMuted, isMuted, play, setMusicMuted, setMuted, unlockAudio } from "../../rozshuk/src/sfx.ts";

function ctx() { return getAudio(); }

// ------------------------------------------------------------------ where sounds come from

/** The hero's position in the flat (metres); sounds are panned and dimmed from here. */
const listener = { x: 0, z: 0 };
export function setListener(x: number, z: number): void { listener.x = x; listener.z = z; }

/** Fixed sources in and around the flat. */
export const SPOT = {
  door: [4.7, 2.6], stairs: [7, 2.2], lift: [6.8, 0.4], window: [-3.8, -4.6], fridge: [4.55, -3.05], up: [0, 0], yard: [-1, -12],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * A short-lived bus placed at (x, z): stereo pan from the hero's side, quieter
 * with distance. Everything played into it is heard from there.
 */
function spatial(x: number, z: number, vol = 1, life = 8): GainNode | undefined {
  const a = ctx();
  if (!a) return undefined;
  const dx = x - listener.x;
  const dz = z - listener.z;
  const g = a.ctx.createGain();
  g.gain.value = vol / (1 + Math.hypot(dx, dz) * 0.09);
  const p = a.ctx.createStereoPanner();
  p.pan.value = Math.max(-0.92, Math.min(0.92, dx / 4.5));
  g.connect(p).connect(a.sfx);
  setTimeout(() => { try { g.disconnect(); p.disconnect(); } catch { /* gone */ } }, life * 1000);
  return g;
}
const at = (spot: readonly [number, number], vol = 1, life = 8) => spatial(spot[0], spot[1], vol, life);

export function siren(seconds = 7): void {
  const a = ctx();
  if (!a) return;
  const o = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  o.type = "sawtooth";
  const t0 = a.ctx.currentTime;
  for (let i = 0; i < seconds / 3.5; i++) {
    o.frequency.setValueAtTime(330, t0 + i * 3.5);
    o.frequency.linearRampToValueAtTime(720, t0 + i * 3.5 + 1.6);
    o.frequency.linearRampToValueAtTime(330, t0 + i * 3.5 + 3.5);
  }
  const lp = a.ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.09, t0 + 0.8);
  g.gain.setValueAtTime(0.09, t0 + seconds - 1);
  g.gain.linearRampToValueAtTime(0, t0 + seconds);
  o.connect(lp).connect(g).connect(at(SPOT.window, 1.4, seconds + 1) ?? a.sfx);
  o.start(t0);
  o.stop(t0 + seconds + 0.1);
}

/** Fast beeps: ballistic threat. */
export function ballisticBeeps(): void {
  const a = ctx();
  if (!a) return;
  for (let i = 0; i < 10; i++) tone(980, i * 0.32, 0.16, "square", 0.08);
}

let buzz: { o: OscillatorNode; g: GainNode; lfo: OscillatorNode } | null = null;
/** The moped sound of a shahed. `level` 0..1 is how close. */
export function droneBuzz(level: number): void {
  const a = ctx();
  if (!a) return;
  if (level <= 0) {
    if (buzz) {
      const b = buzz;
      b.g.gain.setTargetAtTime(0, a.ctx.currentTime, 0.4);
      setTimeout(() => { try { b.o.stop(); b.lfo.stop(); } catch { /* already */ } }, 1500);
      buzz = null;
    }
    return;
  }
  if (!buzz) {
    const o = a.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 96;
    const lfo = a.ctx.createOscillator();
    lfo.frequency.value = 22;
    const lfoG = a.ctx.createGain();
    lfoG.gain.value = 9;
    lfo.connect(lfoG).connect(o.frequency);
    const bp = a.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 420;
    bp.Q.value = 0.8;
    const g = a.ctx.createGain();
    g.gain.value = 0;
    o.connect(bp).connect(g).connect(a.sfx);
    o.start();
    lfo.start();
    buzz = { o, g, lfo };
  }
  buzz.g.gain.setTargetAtTime(0.02 + level * 0.12, a.ctx.currentTime, 0.6);
  buzz.o.frequency.setTargetAtTime(92 + level * 18, a.ctx.currentTime, 0.6);
}

export function boom(near: boolean): void {
  const v = near ? 1 : 0.4;
  // from somewhere out there, on the window side; the glass rattles from the window
  const bus = spatial(-4 + (Math.random() - 0.5) * 10, -14, 1.6, 4);
  tone(near ? 48 : 60, 0, near ? 1.4 : 1.0, "sine", 0.55 * v, 28, bus);
  noise(0, near ? 1.6 : 1.1, 0.5 * v, near ? 1800 : 700, 60, "lowpass", 0.7, bus);
  if (near) { const glass = at(SPOT.window, 1.4, 3); noise(0.05, 0.25, 0.25, 6000, 2500, "highpass", 1, glass); for (let i = 0; i < 6; i++) tone(2400 + Math.random() * 3000, 0.3 + i * 0.06, 0.08, "triangle", 0.03, undefined, glass); }
}

export function drill(): void {
  const bus = at(SPOT.up, 1, 5);
  for (let i = 0; i < 6; i++) { noise(i * 0.55, 0.42, 0.08, 1400, 1100, "bandpass", 6, bus); tone(170, i * 0.55, 0.42, "sawtooth", 0.015, undefined, bus); }
}

/** Three knocks on the front door, heard from the door. */
export function knock(hard = false): void {
  const bus = at(SPOT.door, 1.3, 4);
  if (!bus) { play("knock"); return; }
  const blows = (t0: number, k: number) => { for (let i = 0; i < 3; i++) { tone(140, t0 + i * 0.22, 0.09, "sine", 0.6 * k, 90, bus); noise(t0 + i * 0.22, 0.06, 0.4 * k, 900, 300, "lowpass", 1, bus); } };
  blows(0, hard ? 1.2 : 1);
  if (hard) blows(0.75, 1.3);
}

export function doorbell(): void {
  const bus = at(SPOT.door, 1.2, 3);
  tone(660, 0, 0.5, "sine", 0.12, undefined, bus);
  tone(523, 0.45, 0.8, "sine", 0.12, undefined, bus);
}

// ------------------------------------------------------------------ the stairwell

/**
 * Steps coming up the stairs to your door, over `secs` seconds. Each visitor
 * walks differently: two men in boots with a radio, one heavy man with keys,
 * a woman in slippers who stops to mutter — and steps that come from nowhere.
 */
export function footsteps(who: "tck" | "police" | "neighbor" | "phantom", secs = 3.6): void {
  const a = ctx();
  if (!a) return;
  const step = (t: number, k: number, heavy: number, x: number) => {
    // each step from a little closer: up the flight, onto the landing, to the door
    const bus = spatial(x, 2.4, 0.35 + k * 1.1, 3);
    if (heavy > 0.5) { tone(62 + Math.random() * 10, t, 0.09, "sine", 0.45 * heavy, 40, bus); noise(t, 0.07, 0.3 * heavy, 600, 180, "lowpass", 1, bus); }
    else noise(t, 0.16, 0.18, 2600, 1400, "bandpass", 1.2, bus);
  };
  if (who === "phantom") {
    // in your head: centred, muffled, irregular, with a ringing that grows
    const head = a.ctx.createGain();
    head.gain.value = 0.9;
    const lp = a.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    head.connect(lp).connect(a.sfx);
    setTimeout(() => { try { head.disconnect(); lp.disconnect(); } catch { /* gone */ } }, (secs + 3) * 1000);
    let t = 0.2;
    while (t < secs) { tone(55, t, 0.25, "sine", 0.5, 35, head); noise(t, 0.3, 0.25, 300, 80, "lowpass", 0.5, head); t += 0.35 + Math.random() * 0.9; }
    tone(6800, 0, secs, "sine", 0.012, 7400, head);
    return;
  }
  const interval = who === "tck" ? 0.42 : who === "police" ? 0.56 : 0.78;
  const heavy = who === "neighbor" ? 0.2 : who === "tck" ? 1 : 0.9;
  let t = 0.15;
  let i = 0;
  while (t < secs) {
    const k = t / secs;
    const x = 9.5 - k * 4.5;
    step(t, k, heavy, x);
    if (who === "tck") step(t + 0.09, k, heavy * 0.9, x + 0.3);
    if (who === "neighbor" && i % 4 === 3) { t += 0.7; for (let j = 0; j < 4; j++) tone(190 + Math.random() * 60, t - 0.6 + j * 0.13, 0.11, "triangle", 0.025, 170, spatial(x, 2.4, 0.3 + k, 3)); }
    t += interval * (who === "neighbor" ? 0.8 + Math.random() * 0.5 : 1);
    i++;
  }
  if (who === "tck") { const r = spatial(6, 2.4, 0.9, 4); noise(secs * 0.55, 0.35, 0.08, 2400, 1800, "bandpass", 4, r); tone(1250, secs * 0.55 + 0.36, 0.12, "square", 0.02, undefined, r); }
  if (who === "police") { const r = spatial(5.6, 2.4, 0.9, 4); for (let j = 0; j < 7; j++) tone(3800 + Math.random() * 2600, secs * 0.6 + j * 0.05 + Math.random() * 0.03, 0.04, "triangle", 0.03, undefined, r); }
}

/** The lift going past your floor: motor, a clunk, doors on another landing. */
function lift(): void {
  const bus = at(SPOT.lift, 0.9, 10);
  tone(95, 0, 6, "sawtooth", 0.01, 110, bus);
  noise(0, 6, 0.03, 300, 260, "lowpass", 1, bus);
  noise(6, 0.12, 0.25, 500, 150, "lowpass", 1, bus);
  noise(6.6, 0.9, 0.05, 1200, 900, "bandpass", 2, bus);
}
/** Someone walks past on the stairs and keeps going. */
function passing(): void {
  for (let i = 0; i < 10; i++) {
    const k = i / 9;
    const near = 1 - Math.abs(k - 0.5) * 2;
    const bus = spatial(8 - near * 2.5, 2.4, 0.25 + near * 0.6, 3);
    tone(70, i * 0.5, 0.08, "sine", 0.3, 45, bus);
    noise(i * 0.5, 0.06, 0.2, 600, 200, "lowpass", 1, bus);
  }
}
function doorSlam(): void { const bus = spatial(8, 4, 0.7, 3); noise(0, 0.3, 0.4, 700, 90, "lowpass", 0.8, bus); tone(55, 0, 0.35, "sine", 0.3, 35, bus); }
function dog(): void { const bus = spatial(8, -1, 0.5, 3); for (const t of [0, 0.32]) { tone(330, t, 0.14, "sawtooth", 0.03, 210, bus); noise(t, 0.14, 0.06, 900, 500, "bandpass", 2, bus); } }
function voices(): void {
  const bus = spatial(7, 2.4, 0.5, 5);
  let t = 0;
  for (let i = 0; i < 14; i++) { const f = (i % 5 < 3 ? 140 : 230) + Math.random() * 50; tone(f, t, 0.14, "triangle", 0.02, f * 0.9, bus); t += 0.12 + Math.random() * 0.18; }
}
/** The entrance door far below bangs: with the van in the yard, every bang is someone. */
function entrance(): void { const bus = spatial(2, -6, 0.6, 3); noise(0, 0.25, 0.3, 500, 80, "lowpass", 0.8, bus); tone(48, 0, 0.3, "sine", 0.25, 30, bus); }

export function sigh(): void { noise(0, 1.2, 0.05, 600, 300, "bandpass", 0.6); }

// ------------------------------------------------------------------ the room tone

/**
 * Continuous layers, re-aimed every frame: a ticking clock, tinnitus and a
 * generator hum, each scaled by how things are.
 */
export class Ambience {
  private ring: { o: OscillatorNode; g: GainNode } | null = null;
  private hum: { o: OscillatorNode; g: GainNode } | null = null;
  private tickT = 0;
  private tock = false;
  private birdT = 2;
  private rain: { src: AudioBufferSourceNode; lp: BiquadFilterNode; g: GainNode; patter: GainNode } | null = null;
  private dripT = 1;
  private fridge: { g: GainNode; pan: StereoPannerNode } | null = null;
  private fridgeOn = true;
  private stairT = 20;

  /** The fridge hums until the power goes — and the silence is how you know. */
  private updateFridge(power: boolean): void {
    const a = ctx();
    if (!a) return;
    if (!this.fridge) {
      const g = a.ctx.createGain();
      g.gain.value = 0;
      const pan = a.ctx.createStereoPanner();
      const lp = a.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 260;
      for (const [f, v] of [[50, 1], [100, 0.6], [150, 0.25]] as const) {
        const o = a.ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f + Math.random() * 0.4;
        const og = a.ctx.createGain();
        og.gain.value = v;
        o.connect(og).connect(lp);
        o.start();
      }
      lp.connect(g).connect(pan).connect(a.sfx);
      this.fridge = { g, pan };
    }
    const [fx, fz] = SPOT.fridge;
    const d = Math.hypot(fx - listener.x, fz - listener.z);
    this.fridge.pan.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, (fx - listener.x) / 4.5)), a.ctx.currentTime, 0.2);
    if (power !== this.fridgeOn) {
      this.fridgeOn = power;
      // the compressor clunks off, or shudders back on
      const bus = at(SPOT.fridge, 1, 2);
      noise(0, 0.12, 0.2, 400, 120, "lowpass", 1, bus);
      tone(power ? 70 : 90, 0, 0.18, "sine", 0.15, power ? 50 : 40, bus);
    }
    this.fridge.g.gain.setTargetAtTime(power ? 0.022 / (1 + d * 0.25) : 0, a.ctx.currentTime, power ? 0.8 : 0.05);
  }

  /** Every so often, the building: the lift, steps, a door, a dog, voices on the landing. */
  private updateStairs(dt: number, quiet: boolean, bus: boolean): void {
    this.stairT -= dt;
    if (this.stairT > 0) return;
    this.stairT = (bus ? 12 : 25) + Math.random() * (bus ? 20 : 45);
    if (!quiet) return;
    const r = Math.random();
    if (bus && r < 0.5) entrance();
    else if (r < 0.3) lift();
    else if (r < 0.55) passing();
    else if (r < 0.7) doorSlam();
    else if (r < 0.85) voices();
    else dog();
  }

  /**
   * Rain: a hiss through the glass, a patter on the sill, and drips. With the
   * window or balcony open it gets louder and brighter — the street comes in.
   */
  private updateRain(dt: number, k: number, open: boolean): void {
    const a = ctx();
    if (!a) return;
    if (!this.rain && k > 0) {
      const len = a.ctx.sampleRate * 2;
      const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
      const ch = buf.getChannelData(0);
      // pink-ish noise: rain is not white
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056;
        ch[i] = (b0 + b1 + b2 + w * 0.05) * 0.9;
      }
      const src = a.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = a.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      const hp = a.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 160;
      const g = a.ctx.createGain();
      g.gain.value = 0;
      // the patter: the same noise, band-passed high and gated by a fast random LFO-ish modulation
      const bp = a.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3200;
      bp.Q.value = 0.7;
      const patter = a.ctx.createGain();
      patter.gain.value = 0;
      src.connect(hp).connect(lp).connect(g).connect(a.sfx);
      src.connect(bp).connect(patter).connect(a.sfx);
      src.start();
      this.rain = { src, lp, g, patter };
    }
    if (!this.rain) return;
    const t = a.ctx.currentTime;
    this.rain.g.gain.setTargetAtTime(k * (open ? 0.16 : 0.07), t, 0.8);
    this.rain.lp.frequency.setTargetAtTime(open ? 4200 : 900, t, 0.5);
    this.rain.patter.gain.setTargetAtTime(k * (open ? 0.05 : 0.012), t, 0.5);
    // drips on the tin sill
    this.dripT -= dt;
    if (k > 0.3 && this.dripT <= 0) {
      this.dripT = 0.25 + Math.random() * (open ? 0.6 : 1.4);
      const f = 1400 + Math.random() * 1800;
      tone(f, 0, 0.05, "sine", (open ? 0.03 : 0.012) * k, f * 0.55);
    }
  }

  update(dt: number, s: { despair: number; blackout: boolean; birds: boolean; quiet: boolean; rain?: number; open?: boolean; bus?: boolean; off?: boolean }): void {
    const a = ctx();
    if (!a) return;
    // clock
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 1;
      this.tock = !this.tock;
      if (s.quiet) tone(this.tock ? 2600 : 2200, 0, 0.02, "square", 0.006 + s.despair * 0.03);
    }
    // tinnitus
    if (!this.ring) {
      const o = a.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 7400;
      const g = a.ctx.createGain();
      g.gain.value = 0;
      o.connect(g).connect(a.sfx);
      o.start();
      this.ring = { o, g };
    }
    this.ring.g.gain.setTargetAtTime(s.despair > 0.45 ? (s.despair - 0.45) * 0.03 : 0, a.ctx.currentTime, 1.5);
    // a generator downstairs during blackouts
    if (!this.hum) {
      const o = a.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 50;
      const lp = a.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 220;
      const g = a.ctx.createGain();
      g.gain.value = 0;
      o.connect(lp).connect(g).connect(a.sfx);
      o.start();
      this.hum = { o, g };
    }
    this.hum.g.gain.setTargetAtTime(s.blackout ? 0.025 : 0, a.ctx.currentTime, 1);
    this.updateRain(dt, s.rain ?? 0, !!s.open);
    if (s.off) { if (this.fridge) this.fridge.g.gain.setTargetAtTime(0, a.ctx.currentTime, 0.1); return; }
    this.updateFridge(!s.blackout);
    this.updateStairs(dt, s.quiet, !!s.bus);
    // birds, while there are still birds for you
    this.birdT -= dt;
    if (s.birds && this.birdT <= 0) {
      this.birdT = 2 + Math.random() * 5;
      const f = 2400 + Math.random() * 1600;
      for (let i = 0; i < 3; i++) tone(f + i * 120, i * 0.09, 0.07, "sine", 0.02, f + 600);
    }
  }
}

// ------------------------------------------------------------------ the score

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
// D minor, slow; the melody has gaps that grow
const CHORDS = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]];
const LINE = [69, 67, 65, 64, 65, 62, 64, 65, 67, 65, 64, 61];
// the summer of 2021: D major, the same melody's shape but open, nothing missing
const CHORDS_BRIGHT = [[50, 54, 57], [55, 59, 62], [47, 50, 54], [45, 49, 52]];
const LINE_BRIGHT = [69, 71, 73, 74, 73, 69, 71, 66, 69, 71, 74, 76];

export class Score {
  private timer = 0;
  private next = 0;
  private step = 0;
  /** 0..1, how far gone. Notes drop out, the piano detunes. */
  despair = 0;
  /** Silence during alerts. */
  hush = false;
  /** The memory: major key, every note there, a little faster. */
  bright = false;

  start(): void {
    const a = ctx();
    if (!a || this.timer) return;
    this.next = a.ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 80);
  }

  private schedule(): void {
    const a = ctx();
    if (!a) return;
    if (this.next < a.ctx.currentTime - 0.1) this.next = a.ctx.currentTime + 0.05;
    while (this.next < a.ctx.currentTime + 0.4) {
      const at = this.next - a.ctx.currentTime;
      const s = this.step;
      const d = this.bright ? 0 : this.despair;
      const bar = Math.floor(s / 8) % 4;
      const keep = this.bright ? 1.2 : 1 - d * 0.75;
      const chords = this.bright ? CHORDS_BRIGHT : CHORDS;
      const line = this.bright ? LINE_BRIGHT : LINE;
      if (!this.hush) {
        const detune = d * 0.35 * (Math.random() - 0.5);
        if (s % 8 === 0 && Math.random() < keep + 0.2) for (const n of chords[bar]) piano(midiHz(n + detune), at, 3.4, 0.035, a.music);
        if (s % 2 === 0 && Math.random() < keep * 0.8) piano(midiHz(line[(s / 2) % line.length] + detune), at, 1.6, 0.05, a.music);
        // a guitar strum under the summer
        if (this.bright && s % 4 === 2) chords[bar].forEach((n, i) => tone(midiHz(n + 12), at + i * 0.03, 0.9, "triangle", 0.018, undefined, a.music));
      }
      this.next += this.bright ? 0.5 : 0.62 + d * 0.3;
      this.step++;
    }
  }
}

function piano(f: number, at: number, dur: number, vol: number, bus: GainNode): void {
  tone(f, at, dur, "sine", vol, undefined, bus);
  tone(f * 2, at, dur * 0.4, "triangle", vol * 0.25, undefined, bus);
}

// ------------------------------------------------------------------ the summer of 2021

let summerBird = 0.5;
let summerFire = 0;
/** Birds everywhere, the grill crackling, the river somewhere: called every frame in the memory. */
export function summer(dt: number): void {
  if (!ctx()) return;
  summerBird -= dt;
  if (summerBird <= 0) {
    summerBird = 0.6 + Math.random() * 1.6;
    const f = 2200 + Math.random() * 2200;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) tone(f + (i % 2) * 300, i * 0.08, 0.06, "sine", 0.025, f + 700);
  }
  summerFire -= dt;
  if (summerFire <= 0) {
    summerFire = 0.08 + Math.random() * 0.3;
    noise(0, 0.03, 0.03 + Math.random() * 0.04, 3000, 1500, "bandpass", 2);
  }
}

/** The camera shutter. */
export function shutter(): void {
  noise(0, 0.04, 0.3, 4000, 2000, "bandpass", 1);
  noise(0.09, 0.05, 0.25, 3000, 1500, "bandpass", 1);
}

// ------------------------------------------------------------------ the other memories, and the yard

let nyPop = 1.2;
let radioT = 0;
let radioStep = 0;
/** New Year's Eve: distant fireworks popping and crackling, laughter. */
export function newYearNight(dt: number): void {
  if (!ctx()) return;
  nyPop -= dt;
  if (nyPop <= 0) {
    nyPop = 0.7 + Math.random() * 1.8;
    const bus = spatial(-6 + Math.random() * 12, -14, 0.9, 3);
    tone(70 + Math.random() * 30, 0, 0.5, "sine", 0.22, 40, bus);
    noise(0, 0.5, 0.18, 1200, 200, "lowpass", 0.8, bus);
    for (let i = 0; i < 8; i++) noise(0.35 + i * 0.07 + Math.random() * 0.05, 0.03, 0.05, 4000, 2500, "highpass", 1, bus);
  }
}
/** Mom's kitchen: a radio playing an old tune, a spoon on the pot, a fly at the window. */
export function kitchenSummer(dt: number): void {
  const a = ctx();
  if (!a) return;
  radioT -= dt;
  if (radioT <= 0) {
    radioT = 0.36;
    // a little waltz through a small speaker
    const tune = [72, 76, 79, 76, 74, 77, 81, 77, 72, 76, 79, 84, 83, 79, 76, 74];
    const f = 440 * Math.pow(2, (tune[radioStep % tune.length] - 69) / 12);
    tone(f, 0, 0.3, "square", 0.008, undefined, a.music);
    if (radioStep % 3 === 0) tone(f / 4, 0, 0.32, "triangle", 0.012, undefined, a.music);
    radioStep++;
  }
  if (Math.random() < dt * 0.4) noise(0, 0.04, 0.05, 3200, 2400, "bandpass", 3);
}
/** The whole yard shouting "Hurray!" when the power comes back. */
export function cheer(): void {
  const bus = at(SPOT.yard, 1.2, 4);
  for (let i = 0; i < 9; i++) {
    const t = Math.random() * 0.5;
    const f = 220 + Math.random() * 260;
    tone(f, t, 0.9 + Math.random() * 0.5, "sawtooth", 0.012, f * 1.15, bus);
    noise(t, 1.0, 0.03, 1400, 700, "bandpass", 1.5, bus);
  }
}
