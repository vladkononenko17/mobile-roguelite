import { getAudio } from "../../rozshuk/src/sfx.ts";

/**
 * The score of «З гірки!»: a generative arrangement of «Щедрик» (Mykola
 * Leontovych's 1916 setting of the folk щедрівка — public domain), built in
 * WebAudio from softer instruments than the chiptune of the other games:
 *
 * - a plucked harp for the four-note ostinato,
 * - glassy bells (sine partials at inharmonic ratios) for the counter-lines,
 * - a warm string pad (detuned saws through a slow low-pass),
 * - a round bass doubled an octave up for phone speakers,
 * - sleigh bells, a soft kick, a brushed snare and hats on a hall reverb.
 *
 * Two arrangements: «home» (menus, the map) is slow and quiet — harp, pad and
 * bells; «outing» (on the slope) is a driving 3/4 with drums and sleigh bells,
 * and adds layers as `intensity` (how big your ватага is) rises.
 */

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// G minor: the ostinato B♭–A–B♭–G over a descending bass G–F–E♭–D
const OSTINATO = [70, 69, 70, 67];
const OST_STEPS = [0, 2, 3, 4];
const OST_LEN = [2, 1, 1, 2];
const COUNTER = [74, 72, 74, 70];
const HIGH = [79, 77, 75, 74];
const BASS = [43, 41, 39, 38];
const CHORDS = [[55, 58, 62], [53, 57, 62], [51, 55, 58], [50, 54, 57]];
/** The falling phrase that answers the ostinato (bars 13–16), one note per beat. */
const ANSWER = [
  [74, 74, 72], [70, 72, 70], [69, 69, 67], [66, 67, 69],
];

interface Voice { stop(at: number): void }

export class Music {
  mode: "home" | "outing" | "off" = "off";
  /** 0..1: how many layers play on the slope. */
  intensity = 0;
  private running = false;
  private timer = 0;
  private next = 0;
  private step = 0;
  private out: GainNode | null = null;
  private wet: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastMode: Music["mode"] = "off";
  private pads: Voice[] = [];

  start(): void {
    const a = getAudio();
    if (!a || this.running) return;
    this.running = true;
    this.build(a.ctx, a.music);
    this.next = a.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  stop(): void {
    this.running = false;
    window.clearInterval(this.timer);
  }

  private build(ctx: BaseAudioContext, bus: GainNode): void {
    this.out = ctx.createGain();
    this.out.gain.value = 1.5;
    this.out.connect(bus);
    // a hall: two seconds of decaying stereo noise
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 5200;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;
    this.wet.connect(tone).connect(verb).connect(this.out);
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
  }

  /** Route a voice: dry to the music bus, some of it to the hall. */
  private send(node: AudioNode, wet: number): void {
    node.connect(this.out!);
    if (wet > 0) {
      const ctx = node.context;
      const g = ctx.createGain();
      g.gain.value = wet;
      node.connect(g).connect(this.wet!);
    }
  }

  private env(ctx: BaseAudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  // ------------------------------------------------------------- instruments

  private harp(ctx: BaseAudioContext, m: number, t: number, vol: number, dur = 1.4): void {
    const f = midiHz(m);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(7000, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + dur * 0.6);
    const g = this.env(ctx, t, vol, 0.004, dur);
    for (const [k, type, v] of [[1, "triangle", 1], [2, "sine", 0.35], [3, "sine", 0.12]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * k;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    lp.connect(g);
    this.send(g, 0.5);
  }

  private bell(ctx: BaseAudioContext, m: number, t: number, vol: number, dur = 2.2): void {
    const f = midiHz(m);
    for (const [k, v, d] of [[1, 1, 1], [2.76, 0.35, 0.5], [5.4, 0.12, 0.25], [0.5, 0.15, 0.8]] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * k;
      const g = this.env(ctx, t, vol * v, 0.002, dur * d);
      o.connect(g);
      this.send(g, 0.6);
      o.start(t);
      o.stop(t + dur * d + 0.05);
    }
  }

  private pad(ctx: BaseAudioContext, notes: number[], t: number, dur: number, vol: number): Voice {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(800, t + dur);
    lp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.6, dur * 0.3));
    g.gain.setValueAtTime(vol, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
    const oscs: OscillatorNode[] = [];
    for (const n of notes) for (const cents of [-8, 7]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = midiHz(n);
      o.detune.value = cents;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.5);
      oscs.push(o);
    }
    lp.connect(g);
    this.send(g, 0.55);
    return { stop: (at: number) => { g.gain.cancelScheduledValues(at); g.gain.setTargetAtTime(0.0001, at, 0.15); for (const o of oscs) { try { o.stop(at + 0.8); } catch { /* done */ } } } };
  }

  private bass(ctx: BaseAudioContext, m: number, t: number, dur: number, vol: number): void {
    const g = this.env(ctx, t, vol, 0.01, dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    for (const [k, type, v] of [[1, "sine", 1], [2, "triangle", 0.45]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = midiHz(m) * k;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    lp.connect(g);
    this.send(g, 0.08);
  }

  private noise(ctx: BaseAudioContext, t: number, vol: number, dur: number, type: BiquadFilterType, freq: number, q = 1, wet = 0.2, rate = 1): void {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.env(ctx, t, vol, 0.002, dur);
    src.connect(f).connect(g);
    this.send(g, wet);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private kick(ctx: BaseAudioContext, t: number, vol: number): void {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(62, t + 0.12);
    const g = this.env(ctx, t, vol, 0.003, 0.28);
    o.connect(g);
    this.send(g, 0.05);
    o.start(t);
    o.stop(t + 0.35);
  }

  /** A shake of sleigh bells: a few jingles a hair apart. */
  private sleigh(ctx: BaseAudioContext, t: number, vol: number): void {
    for (let i = 0; i < 3; i++) this.noise(ctx, t + i * 0.018, vol * (1 - i * 0.25), 0.09, "bandpass", 7200 + i * 900, 6, 0.3);
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 5300 + Math.random() * 400;
    const g = this.env(ctx, t, vol * 0.08, 0.001, 0.06);
    o.connect(g);
    this.send(g, 0.3);
    o.start(t);
    o.stop(t + 0.1);
  }

  // ------------------------------------------------------------- the score

  private schedule(): void {
    const a = getAudio();
    if (!a || !this.out || this.mode === "off") return;
    this.fill(a.ctx, a.ctx.currentTime, a.ctx.currentTime + 0.3);
  }

  /**
   * Render `seconds` of one arrangement offline (for listening to it outside
   * the game: `__zhirky.music.preview("outing", 0.8)` downloads a WAV).
   */
  async render(mode: "home" | "outing", intensity: number, seconds: number): Promise<AudioBuffer> {
    const ctx = new OfflineAudioContext(2, Math.floor(44100 * seconds), 44100);
    const saved = { mode: this.mode, intensity: this.intensity, out: this.out, wet: this.wet, noise: this.noiseBuf, next: this.next, step: this.step, last: this.lastMode, pads: this.pads };
    const bus = ctx.createGain();
    bus.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    bus.connect(comp).connect(ctx.destination);
    this.build(ctx, bus);
    this.mode = mode;
    this.intensity = intensity;
    this.lastMode = "off";
    this.pads = [];
    this.next = 0.05;
    this.fill(ctx, 0, seconds - 1);
    Object.assign(this, { mode: saved.mode, intensity: saved.intensity, out: saved.out, wet: saved.wet, noiseBuf: saved.noise, next: saved.next, step: saved.step, lastMode: saved.last, pads: saved.pads });
    return ctx.startRendering();
  }

  private fill(ctx: BaseAudioContext, now: number, until: number): void {
    if (this.mode !== this.lastMode) {
      // a new arrangement starts from the top, the old pad fades out
      for (const p of this.pads) p.stop(now);
      this.pads = [];
      this.lastMode = this.mode;
      this.step = 0;
      this.next = Math.max(this.next, now + 0.05);
    }
    if (this.next < now - 0.1) this.next = now + 0.05;
    const home = this.mode === "home";
    // eighth notes; six to a bar of 3/4
    const eighth = home ? 0.3 : 0.2;
    while (this.next < until) {
      const t = this.next;
      const s = this.step;
      const pos = s % 6;
      const barN = Math.floor(s / 6);
      const bar = barN % 4;
      const section = Math.floor(barN / 4) % 4;
      const k = home ? 0 : this.intensity;
      // the pad holds each chord for a bar
      if (pos === 0) {
        this.pads = this.pads.filter((p, i) => { if (i < this.pads.length - 1) p.stop(t + 0.2); return i >= this.pads.length - 1; });
        this.pads.push(this.pad(ctx, CHORDS[bar], t, eighth * 6 + 0.1, home ? 0.022 : 0.016 + k * 0.01));
      }
      // the ostinato on the harp (a music box an octave up at home)
      const oi = OST_STEPS.indexOf(pos);
      if (oi >= 0) {
        const m = OSTINATO[oi];
        this.harp(ctx, m, t, home ? 0.1 : 0.12, eighth * OST_LEN[oi] * 2.5);
        if (home && section >= 1) this.bell(ctx, m + 12, t, 0.05, 1.4);
        // the counter-line a third above, from the second section
        if (section >= 1 && (!home || section >= 2)) this.harp(ctx, COUNTER[oi], t, home ? 0.05 : 0.05 + k * 0.03, eighth * OST_LEN[oi] * 2);
      }
      // long bells on top, from the third section
      if (section >= 2 && pos === 0 && (home || k > 0.25)) this.bell(ctx, HIGH[bar] + 12, t, home ? 0.07 : 0.09, eighth * 6 * 1.6);
      // the answering phrase in the last section
      if (section === 3 && pos % 2 === 0 && (home || k > 0.45)) this.bell(ctx, ANSWER[bar][pos / 2] + 12, t, home ? 0.06 : 0.08, 1.2);
      // bass: a held note at home, a waltz pulse on the slope
      if (home) {
        if (pos === 0) this.bass(ctx, BASS[bar] + 12, t, eighth * 6, 0.07);
      } else {
        if (pos === 0) this.bass(ctx, BASS[bar] + 12, t, eighth * 2.2, 0.1);
        if (pos === 2 || pos === 4) this.bass(ctx, BASS[bar] + 19, t, eighth * 1.2, 0.05);
      }
      // drums and sleigh bells only on the slope
      if (!home) {
        if (pos === 0) this.kick(ctx, t, 0.26);
        if (pos === 3 && k > 0.3) this.kick(ctx, t, 0.16);
        if (pos === 4) this.noise(ctx, t, 0.12 + k * 0.08, 0.16, "bandpass", 1900, 0.8, 0.25);
        this.noise(ctx, t, pos % 2 ? 0.05 : 0.08, 0.04, "highpass", 8000, 0.7, 0.1);
        if (pos % 2 === 0 || k > 0.6) this.sleigh(ctx, t, (pos % 2 ? 0.08 : 0.14) * (0.6 + k * 0.6));
      } else if (section >= 2 && pos === 0) {
        this.sleigh(ctx, t, 0.04);
      }
      this.next += eighth;
      this.step++;
    }
  }
}
