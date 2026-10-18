import { getAudio, noise, tone } from "./sfx";

/**
 * Generative score. At home: a slow minor pad with a music-box melody. On an
 * outing: a pulsing bass ostinato that adds hats, snare and a lead as the
 * alert rises; a chase doubles the tempo.
 */

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
// Am – F – C – E: the most Ukrainian-courtyard-at-night progression there is
const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 56, 59]];
const BASS = [45, 41, 48, 40];
const MELODY = [76, 74, 72, 71, 72, 69, 71, 72, 74, 72, 71, 68];

export class Music {
  private timer = 0;
  private next = 0;
  private step = 0;
  private running = false;
  mode: "home" | "outing" | "off" = "off";
  /** 0..1 how tense the outing is; 1 = chase. */
  intensity = 0;

  start(): void {
    const a = getAudio();
    if (!a || this.running) return;
    this.running = true;
    this.next = a.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  stop(): void {
    this.running = false;
    window.clearInterval(this.timer);
  }

  private schedule(): void {
    const a = getAudio();
    if (!a || this.mode === "off") return;
    const bus = a.music;
    // after the tab was throttled or the context suspended, do not replay a backlog
    if (this.next < a.ctx.currentTime - 0.1) this.next = a.ctx.currentTime + 0.05;
    while (this.next < a.ctx.currentTime + 0.25) {
      const at = this.next - a.ctx.currentTime;
      const s = this.step;
      if (this.mode === "home") {
        const bar = Math.floor(s / 8) % 4;
        // soft pad, bass an octave up so phone speakers can play it, music-box melody
        if (s % 8 === 0) for (const n of PROG[bar]) tone(midiHz(n), at, 2.6, "triangle", 0.05, undefined, bus);
        if (s % 4 === 0) tone(midiHz(BASS[bar]), at, 1.3, "triangle", 0.11, undefined, bus);
        if (s % 2 === 0 && Math.random() < 0.6) tone(midiHz(MELODY[(s / 2) % MELODY.length] + 12), at, 0.45, "sine", 0.07, undefined, bus);
        if (s % 2 === 0) tone(midiHz(MELODY[(s / 2) % MELODY.length]), at, 0.3, "triangle", 0.03, undefined, bus);
        this.next += 0.34;
      } else {
        const k = this.intensity;
        const chase = k >= 0.99;
        const bar = Math.floor(s / 16) % 4;
        const root = BASS[bar];
        // bass ostinato on eighths, in a range phone speakers reproduce
        if (s % 2 === 0) tone(midiHz(root + (s % 8 === 6 ? 7 : 0)), at, 0.16, "sawtooth", 0.06 + k * 0.04, undefined, bus);
        if (s % 16 === 0) for (const n of PROG[bar]) tone(midiHz(n - 12), at, 2.2, "triangle", 0.04, undefined, bus);
        // ticking clock hats from the start, denser as the alert grows
        if (s % (k > 0.4 ? 1 : 2) === 0) noise(at, 0.03, 0.05 + k * 0.06, 9000, 7000, "highpass", 1, bus);
        if (k > 0.25 && s % 8 === 4) noise(at, 0.12, 0.12 + k * 0.1, 2200, 900, "bandpass", 0.8, bus);
        if (k > 0.25 && s % 8 === 0) { tone(110, at, 0.12, "triangle", 0.2 + k * 0.1, 55, bus); noise(at, 0.06, 0.15, 1200, 300, "lowpass", 1, bus); }
        if (chase && s % 4 === 2) { tone(110, at, 0.1, "triangle", 0.22, 55, bus); noise(at, 0.05, 0.12, 1200, 300, "lowpass", 1, bus); }
        if (k > 0.6 && s % 16 === 0) for (const n of PROG[bar]) tone(midiHz(n), at, 0.5, "square", 0.035, undefined, bus);
        if (chase && s % 2 === 1) tone(midiHz(PROG[bar][(s >> 1) % 3] + 12), at, 0.08, "square", 0.03, undefined, bus);
        this.next += chase ? 0.085 : 0.15 - k * 0.03;
      }
      this.step++;
    }
  }
}
