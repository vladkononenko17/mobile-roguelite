import { getAudio, noise, tone } from "./sfx";

/**
 * Generative background score: a lazy fingerpicked guitar (Karplus–Strong)
 * over a «дворовая» progression, plus river and bird ambience. It tightens
 * with rage: faster tempo, a pulsing bass, then a heartbeat.
 */

// [bass, alternate bass, three treble notes] as MIDI numbers.
const CHORDS: number[][] = [
  [45, 52, 57, 60, 64], // Am
  [50, 57, 62, 65, 69], // Dm
  [43, 50, 55, 59, 62], // G
  [48, 55, 60, 64, 67], // C
  [41, 48, 57, 60, 65], // F
  [50, 57, 62, 65, 69], // Dm
  [40, 47, 56, 59, 64], // E
  [40, 47, 56, 59, 64], // E
];
// Eighth-note picking pattern: index into the chord.
const PATTERN = [0, 4, 3, 2, 1, 3, 2, 4];

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private plucks = new Map<number, AudioBuffer>();
  private timer = 0;
  private ambienceTimer = 0;
  private river: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private nextTime = 0;
  private step = 0;
  private rage = 0;
  private dayProgress = 0.3;
  private running = false;
  private calm = false;

  /** Start playing (safe to call repeatedly). */
  start(): void {
    const a = getAudio();
    if (!a || this.running) return;
    this.running = true;
    this.nextTime = a.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 60);
    this.ambienceTimer = window.setInterval(() => this.ambience(), 900);
    this.startRiver();
  }

  stop(): void {
    this.running = false;
    window.clearInterval(this.timer);
    window.clearInterval(this.ambienceTimer);
    if (this.river) {
      const a = getAudio();
      if (a) this.river.gain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.3);
      const r = this.river;
      setTimeout(() => { try { r.src.stop(); } catch { /* already stopped */ } }, 1500);
      this.river = null;
    }
  }

  /** Menus get a gentler arrangement. */
  setCalm(calm: boolean): void {
    this.calm = calm;
  }

  setState(rage01: number, dayProgress: number): void {
    this.rage = rage01;
    this.dayProgress = dayProgress;
  }

  private pluck(midi: number): AudioBuffer | null {
    const a = getAudio();
    if (!a) return null;
    let buf = this.plucks.get(midi);
    if (buf) return buf;
    const sr = a.ctx.sampleRate;
    const length = Math.floor(sr * 1.8);
    buf = a.ctx.createBuffer(1, length, sr);
    const out = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / midiHz(midi)));
    const ring = new Float32Array(period);
    // Slightly low-passed noise burst gives a nylon-string attack.
    let prev = 0;
    for (let i = 0; i < period; i++) {
      const n = Math.random() * 2 - 1;
      prev = prev * 0.5 + n * 0.5;
      ring[i] = prev;
    }
    const decay = midi < 50 ? 0.9965 : 0.994;
    let idx = 0;
    for (let i = 0; i < length; i++) {
      const next = (idx + 1) % period;
      const v = (ring[idx] + ring[next]) * 0.5 * decay;
      out[i] = ring[idx];
      ring[idx] = v;
      idx = next;
    }
    this.plucks.set(midi, buf);
    return buf;
  }

  private playPluck(midi: number, at: number, vol: number): void {
    const a = getAudio();
    const buf = this.pluck(midi);
    if (!a || !buf) return;
    const src = a.ctx.createBufferSource();
    src.buffer = buf;
    const gain = a.ctx.createGain();
    gain.gain.value = vol;
    const tone = a.ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 3200;
    src.connect(tone).connect(gain).connect(a.music);
    src.start(at);
    src.stop(at + 1.8);
  }

  private schedule(): void {
    const a = getAudio();
    if (!a || !this.running) return;
    const tempo = this.calm ? 80 : 88 + this.rage * 34;
    const eighth = 60 / tempo / 2;
    while (this.nextTime < a.ctx.currentTime + 0.25) {
      const bar = Math.floor(this.step / 8) % CHORDS.length;
      const pos = this.step % 8;
      const chord = CHORDS[bar];
      const t = this.nextTime;
      const human = (Math.random() - 0.5) * 0.012;
      this.playPluck(chord[PATTERN[pos]], t + human, pos === 0 ? 0.55 : 0.32);
      // A soft full strum at the top of every other bar.
      if (pos === 0 && bar % 2 === 0) chord.slice(2).forEach((n, i) => this.playPluck(n + 12, t + 0.02 + i * 0.018, 0.12));
      if (!this.calm && this.rage > 0.5 && pos % 2 === 0) {
        // Tension: a muted low pulse on every beat.
        tone(midiHz(chord[0] - 12), t - a.ctx.currentTime, eighth * 0.9, "sawtooth", 0.05 + (this.rage - 0.5) * 0.12, undefined, a.music);
      }
      if (!this.calm && this.rage > 0.8 && pos % 4 === 0) {
        tone(58, t - a.ctx.currentTime, 0.14, "sine", 0.55, 38, a.music);
        tone(58, t - a.ctx.currentTime + 0.17, 0.12, "sine", 0.35, 38, a.music);
      }
      this.nextTime += eighth;
      this.step += 1;
    }
  }

  private startRiver(): void {
    const a = getAudio();
    if (!a) return;
    // Brown noise, filtered: a steady river murmur under everything.
    const sr = a.ctx.sampleRate;
    const buf = a.ctx.createBuffer(1, sr * 4, sr);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    const src = a.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = a.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    const gain = a.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.22, a.ctx.currentTime, 1.5);
    src.connect(filter).connect(gain).connect(a.sfx);
    src.start();
    this.river = { src, gain };
  }

  private ambience(): void {
    if (!getAudio() || !this.running) return;
    const p = this.dayProgress;
    if (p < 0.82 && Math.random() < 0.28) {
      // A bird: a few quick rising chirps.
      const base = 2200 + Math.random() * 1600;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) tone(base, i * 0.11, 0.07, "sine", 0.05, base * 1.45);
    }
    if (p > 0.78) {
      // Crickets at dusk.
      for (let i = 0; i < 6; i++) noise(i * 0.06, 0.035, 0.05, 4800, 4600, "bandpass", 18);
    }
    if (Math.random() < 0.12) noise(0, 0.5, 0.05, 900, 500, "lowpass"); // a lap of water on the bank
  }
}
