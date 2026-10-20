/**
 * Sound for «Тікай!». Short effects are Kenney CC0 recordings (public/tikai/sfx,
 * see CREDITS.txt); sirens, the van, whistles and the score are synthesized
 * with WebAudio on top of the «Розшук» buses, and shouts reuse the «Розшук»
 * voice recordings (device speech for lines it does not have).
 */
import { getAudio, noise, play as synth, tone } from "../../rozshuk/src/sfx.ts";
import { Music } from "../../rozshuk/src/music.ts";

export { isMusicMuted, isMuted, setMusicMuted, setMuted, unlockAudio } from "../../rozshuk/src/sfx.ts";
export { synth };

export type Sample = "coin" | "jump" | "land" | "fall" | "break" | "impact" | "skid" | "engine";

const buffers = new Map<Sample, Promise<AudioBuffer | null>>();

function buffer(name: Sample): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    p = (async () => {
      const a = getAudio();
      if (!a) return null;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}tikai/sfx/${name}.mp3`);
        if (!res.ok) return null;
        return await a.ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    })();
    buffers.set(name, p);
    void p.then((b) => { if (!b) buffers.delete(name); });
  }
  return p;
}

/** Decode everything once the context exists (call after unlockAudio). */
export function preload(): void {
  for (const s of ["coin", "jump", "land", "fall", "break", "impact", "skid", "engine"] as Sample[]) void buffer(s);
}

let coinStep = 0;
let coinT = 0;
/** Play a recorded effect; `rate` pitches it. Coins climb a little scale when collected in a row. */
export function sample(name: Sample, vol = 1, rate = 1): void {
  const a = getAudio();
  if (!a) return;
  if (name === "coin") {
    const now = a.ctx.currentTime;
    coinStep = now - coinT < 0.35 ? Math.min(coinStep + 1, 7) : 0;
    coinT = now;
    rate *= Math.pow(2, [0, 2, 4, 5, 7, 9, 11, 12][coinStep] / 12);
  }
  void buffer(name).then((buf) => {
    if (!buf) return;
    const src = a.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = a.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(a.sfx);
    src.start();
  });
}

// ---------------------------------------------------------------- loops

class Loop {
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private name: Sample;
  private starting = false;
  constructor(name: Sample) { this.name = name; }
  start(vol: number): void {
    const a = getAudio();
    if (!a || this.src || this.starting) return;
    this.starting = true;
    void buffer(this.name).then((buf) => {
      this.starting = false;
      if (!buf || this.src) return;
      const src = a.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = a.ctx.createGain();
      g.gain.value = vol;
      src.connect(g).connect(a.sfx);
      src.start();
      this.src = src;
      this.gain = g;
    });
  }
  set(vol: number, rate: number): void {
    const a = getAudio();
    if (!a || !this.src || !this.gain) return;
    this.gain.gain.setTargetAtTime(vol, a.ctx.currentTime, 0.1);
    this.src.playbackRate.setTargetAtTime(rate, a.ctx.currentTime, 0.1);
  }
  stop(): void {
    try { this.src?.stop(); } catch { /* done */ }
    this.src = null;
    this.gain = null;
  }
}

export const engine = new Loop("engine");

/** Police siren that keeps wailing; `level` 0..1 is how close they are. */
class Siren {
  private o: OscillatorNode | null = null;
  private lfo: OscillatorNode | null = null;
  private g: GainNode | null = null;
  start(): void {
    const a = getAudio();
    if (!a || this.o) return;
    const o = a.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 620;
    const lfo = a.ctx.createOscillator();
    lfo.type = "triangle";
    lfo.frequency.value = 0.45;
    const lg = a.ctx.createGain();
    lg.gain.value = 260;
    lfo.connect(lg).connect(o.frequency);
    const lp = a.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1500;
    const g = a.ctx.createGain();
    g.gain.value = 0;
    o.connect(lp).connect(g).connect(a.sfx);
    o.start();
    lfo.start();
    this.o = o;
    this.lfo = lfo;
    this.g = g;
  }
  set(level: number): void {
    const a = getAudio();
    if (!a || !this.g) return;
    this.g.gain.setTargetAtTime(0.012 + level * 0.07, a.ctx.currentTime, 0.3);
  }
  stop(): void {
    try { this.o?.stop(); this.lfo?.stop(); } catch { /* done */ }
    this.o = this.lfo = null;
    this.g = null;
  }
}
export const siren = new Siren();

export const music = new Music();

export function horn(): void {
  tone(392, 0, 0.35, "square", 0.12);
  tone(494, 0, 0.35, "square", 0.1);
}

export function nitroWhoosh(): void {
  noise(0, 1.2, 0.4, 300, 3000, "bandpass", 1.2);
  tone(110, 0, 1.0, "sawtooth", 0.15, 220);
}

export function babkaPhone(): void {
  // old push-button phone dialling
  for (let i = 0; i < 5; i++) tone(700 + (i % 3) * 180, i * 0.09, 0.07, "sine", 0.08);
}

export function powerUp(): void {
  [523, 784, 1047, 1568].forEach((f, i) => tone(f, i * 0.05, 0.16, "triangle", 0.1));
}

export function powerDown(): void {
  [784, 523, 392].forEach((f, i) => tone(f, i * 0.07, 0.14, "triangle", 0.07));
}

export function nearMiss(): void {
  noise(0, 0.35, 0.22, 400, 2400, "bandpass", 1.5);
}

export function stopLoops(): void {
  engine.stop();
  siren.stop();
}
