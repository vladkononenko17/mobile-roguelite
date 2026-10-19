/**
 * Sound for «Чотири стіни», synthesized with WebAudio on top of the «Розшук»
 * buses: the siren, the moped buzz of a shahed getting closer, explosions,
 * the drill upstairs, a clock that ticks louder when you are low, tinnitus,
 * and a sparse piano that loses notes as you lose joy. Nothing to license.
 */
import { getAudio, noise, play, tone } from "../../rozshuk/src/sfx.ts";

export { isMusicMuted, isMuted, play, setMusicMuted, setMuted, unlockAudio } from "../../rozshuk/src/sfx.ts";

function ctx() { return getAudio(); }

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
  o.connect(lp).connect(g).connect(a.sfx);
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
  tone(near ? 48 : 60, 0, near ? 1.4 : 1.0, "sine", 0.55 * v, 28);
  noise(0, near ? 1.6 : 1.1, 0.5 * v, near ? 1800 : 700, 60, "lowpass", 0.7);
  if (near) { noise(0.05, 0.25, 0.25, 6000, 2500, "highpass", 1); for (let i = 0; i < 6; i++) tone(2400 + Math.random() * 3000, 0.3 + i * 0.06, 0.08, "triangle", 0.03); }
}

export function drill(): void {
  for (let i = 0; i < 6; i++) { noise(i * 0.55, 0.42, 0.08, 1400, 1100, "bandpass", 6); tone(170, i * 0.55, 0.42, "sawtooth", 0.015); }
}

export function knock(hard = false): void {
  play("knock");
  if (hard) setTimeout(() => play("knock"), 750);
}

export function doorbell(): void {
  tone(660, 0, 0.5, "sine", 0.12);
  tone(523, 0.45, 0.8, "sine", 0.12);
}

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

  update(dt: number, s: { despair: number; blackout: boolean; birds: boolean; quiet: boolean }): void {
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

export class Score {
  private timer = 0;
  private next = 0;
  private step = 0;
  /** 0..1, how far gone. Notes drop out, the piano detunes. */
  despair = 0;
  /** Silence during alerts. */
  hush = false;

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
      const d = this.despair;
      const bar = Math.floor(s / 8) % 4;
      const keep = 1 - d * 0.75;
      if (!this.hush) {
        const detune = d * 0.35 * (Math.random() - 0.5);
        if (s % 8 === 0 && Math.random() < keep + 0.2) for (const n of CHORDS[bar]) piano(midiHz(n + detune), at, 3.4, 0.035, a.music);
        if (s % 2 === 0 && Math.random() < keep * 0.8) piano(midiHz(LINE[(s / 2) % LINE.length] + detune), at, 1.6, 0.05, a.music);
      }
      this.next += 0.62 + d * 0.3;
      this.step++;
    }
  }
}

function piano(f: number, at: number, dur: number, vol: number, bus: GainNode): void {
  tone(f, at, dur, "sine", vol, undefined, bus);
  tone(f * 2, at, dur * 0.4, "triangle", vol * 0.25, undefined, bus);
}
