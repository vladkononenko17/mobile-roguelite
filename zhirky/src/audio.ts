/**
 * Sound for «З гірки!». Short effects are the Kenney CC0 recordings that
 * «Тікай!» ships (public/tikai/sfx); the hiss of the runners, sleigh bells,
 * the push-off count and the score are synthesized with WebAudio on the
 * «Розшук» buses.
 */
import { getAudio, noise, play as synth, tone } from "../../rozshuk/src/sfx.ts";
import { Music } from "../../rozshuk/src/music.ts";

export { isMusicMuted, isMuted, setMusicMuted, setMuted, unlockAudio } from "../../rozshuk/src/sfx.ts";
export { preload, sample } from "../../tikai/src/audio.ts";
export { synth };

export const music = new Music();

/** The hiss of runners on snow; louder and brighter with speed, glassy on ice. */
class Hiss {
  private src: AudioBufferSourceNode | null = null;
  private bp: BiquadFilterNode | null = null;
  private g: GainNode | null = null;
  start(): void {
    const a = getAudio();
    if (!a || this.src) return;
    const len = a.ctx.sampleRate * 2;
    const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = a.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const g = a.ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(g).connect(a.sfx);
    src.start();
    this.src = src;
    this.bp = bp;
    this.g = g;
  }
  set(level: number, ice: boolean): void {
    const a = getAudio();
    if (!a || !this.g || !this.bp) return;
    this.g.gain.setTargetAtTime(level * (ice ? 0.05 : 0.08), a.ctx.currentTime, 0.08);
    this.bp.frequency.setTargetAtTime(ice ? 4200 : 1200 + level * 1400, a.ctx.currentTime, 0.1);
  }
  stop(): void {
    try { this.src?.stop(); } catch { /* done */ }
    this.src = null;
    this.g = null;
    this.bp = null;
  }
}
export const hiss = new Hiss();

/** Sleigh bells: a kid hitched on. Higher for every kid in the ватага. */
export function bells(n: number): void {
  const base = 1320 * Math.pow(2, Math.min(n, 10) / 24);
  for (let i = 0; i < 6; i++) tone(base * (i % 2 ? 1.5 : 1), i * 0.045, 0.12, "triangle", 0.06);
}

export function tailLost(n: number): void {
  for (let i = 0; i < Math.min(4, n); i++) tone(660 - i * 90, i * 0.08, 0.14, "triangle", 0.08, 330 - i * 40);
  noise(0, 0.35, 0.2, 300, 1600, "lowpass", 1);
}

/** Раз, два — ГОП! */
export function beat(k: number): void {
  tone(k === 2 ? 880 : 587, 0, k === 2 ? 0.18 : 0.1, "square", 0.08);
}

export function whoosh(): void {
  noise(0, 0.6, 0.3, 500, 4000, "bandpass", 1.4);
}

export function powerUp(): void {
  [523, 784, 1047, 1568].forEach((f, i) => tone(f, i * 0.05, 0.16, "triangle", 0.1));
}

export function powerDown(): void {
  [784, 523, 392].forEach((f, i) => tone(f, i * 0.07, 0.14, "triangle", 0.07));
}

export function trick(): void {
  [659, 880, 1175].forEach((f, i) => tone(f, i * 0.06, 0.15, "square", 0.07));
}

export function petard(): void {
  noise(0, 0.9, 0.35, 200, 3000, "bandpass", 1.2);
  tone(140, 0, 0.8, "sawtooth", 0.12, 420);
}

export function stopLoops(): void {
  hiss.stop();
}
