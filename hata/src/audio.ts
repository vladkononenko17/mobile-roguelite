/**
 * All sound is synthesized with WebAudio — no files. Loops (washer hiss,
 * mower engine, vacuum, water tap, scrubbing) are faded in and out by the
 * tools; one-shots cover coins, pick-ups, "done" chimes and detector beeps.
 * Birds chirp now and then for the garden.
 */

export type Loop = "washer" | "mower" | "vacuum" | "tap" | "scrub" | "roller";
export type Shot = "coin" | "pick" | "done" | "beep" | "dig" | "fix" | "chem" | "buy" | "click" | "splash" | "rake";

/** What you're walking on. */
export type Ground = "grass" | "leaves" | "dirt" | "stone" | "wood" | "tile" | "deck" | "roof";

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private loops = new Map<Loop, { gain: GainNode; target: number; nodes: AudioNode[]; rate?: AudioParam }>();
  enabled = true;
  private noise!: AudioBuffer;
  private birdT = 4;

  /** Must be called from a user gesture (first tap). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try { if (nav.audioSession) nav.audioSession.type = "playback"; } catch { /* old Safari */ }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.buildLoops();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  private noiseSrc(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start();
    return s;
  }

  private buildLoops(): void {
    const c = this.ctx!;
    const mk = (name: Loop, build: (out: GainNode) => { nodes: AudioNode[]; rate?: AudioParam }) => {
      const gain = c.createGain();
      gain.gain.value = 0;
      gain.connect(this.master);
      const r = build(gain);
      this.loops.set(name, { gain, target: 0, ...r });
    };
    mk("washer", (out) => {
      const n = this.noiseSrc();
      const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900;
      const bp = c.createBiquadFilter(); bp.type = "peaking"; bp.frequency.value = 3200; bp.gain.value = 8;
      const pump = c.createOscillator(); pump.type = "sawtooth"; pump.frequency.value = 48;
      const pg = c.createGain(); pg.gain.value = 0.05;
      pump.connect(pg).connect(out); pump.start();
      n.connect(hp).connect(bp).connect(out);
      return { nodes: [n, pump], rate: pump.frequency };
    });
    mk("mower", (out) => {
      const o1 = c.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 42;
      const o2 = c.createOscillator(); o2.type = "square"; o2.frequency.value = 84.5;
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700;
      const g2 = c.createGain(); g2.gain.value = 0.35;
      const lfo = c.createOscillator(); lfo.frequency.value = 11;
      const lg = c.createGain(); lg.gain.value = 3;
      lfo.connect(lg).connect(o1.frequency);
      o1.connect(lp); o2.connect(g2).connect(lp); lp.connect(out);
      const n = this.noiseSrc(); const nb = c.createBiquadFilter(); nb.type = "bandpass"; nb.frequency.value = 2400; const ng = c.createGain(); ng.gain.value = 0.25;
      n.connect(nb).connect(ng).connect(out);
      o1.start(); o2.start(); lfo.start();
      return { nodes: [o1, o2, lfo, n], rate: o1.frequency };
    });
    mk("vacuum", (out) => {
      const n = this.noiseSrc();
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 0.8;
      const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = 180; const og = c.createGain(); og.gain.value = 0.15;
      o.connect(og).connect(out); o.start();
      n.connect(bp).connect(out);
      return { nodes: [n, o], rate: bp.frequency };
    });
    mk("tap", (out) => {
      const n = this.noiseSrc();
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2000; bp.Q.value = 0.4;
      n.connect(bp).connect(out);
      return { nodes: [n] };
    });
    mk("scrub", (out) => {
      const n = this.noiseSrc();
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3000; bp.Q.value = 1.5;
      const am = c.createGain(); am.gain.value = 0.5;
      const lfo = c.createOscillator(); lfo.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain); lfo.start();
      n.connect(bp).connect(am).connect(out);
      return { nodes: [n, lfo], rate: lfo.frequency };
    });
    mk("roller", (out) => {
      const n = this.noiseSrc();
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
      n.connect(lp).connect(out);
      return { nodes: [n] };
    });
  }

  /** Sets a loop's level (0..1) and optionally its pitch/rate factor. */
  loop(name: Loop, level: number, pitch = 1): void {
    const l = this.loops.get(name);
    if (!l || !this.ctx) return;
    const base: Record<Loop, number> = { washer: 0.35, mower: 0.3, vacuum: 0.28, tap: 0.12, scrub: 0.22, roller: 0.15 };
    if (Math.abs(l.target - level) > 0.01) {
      l.target = level;
      l.gain.gain.setTargetAtTime(level * base[name], this.ctx.currentTime, level > 0 ? 0.04 : 0.12);
    }
    if (l.rate) {
      const ref: Partial<Record<Loop, number>> = { washer: 48, mower: 42, vacuum: 1100, scrub: 7 };
      const r = ref[name];
      if (r) l.rate.setTargetAtTime(r * pitch, this.ctx.currentTime, 0.1);
    }
  }

  stopLoops(): void {
    for (const k of this.loops.keys()) this.loop(k, 0);
  }

  shot(name: Shot, k = 1): void {
    const c = this.ctx;
    if (!c || !this.enabled) return;
    const t = c.currentTime;
    const tone = (f: number, at: number, dur: number, type: OscillatorType = "sine", vol = 0.2, f2?: number) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t + at);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + at + dur);
      g.gain.setValueAtTime(0, t + at);
      g.gain.linearRampToValueAtTime(vol, t + at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g).connect(this.master);
      o.start(t + at);
      o.stop(t + at + dur + 0.05);
    };
    const burst = (at: number, dur: number, freq: number, vol = 0.3, q = 1) => {
      const s = c.createBufferSource();
      s.buffer = this.noise;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      s.connect(bp).connect(g).connect(this.master);
      s.start(t + at, Math.random());
      s.stop(t + at + dur + 0.05);
    };
    switch (name) {
      case "coin": tone(1320, 0, 0.09, "square", 0.08); tone(1760, 0.07, 0.22, "square", 0.08); break;
      case "pick": burst(0, 0.12, 400, 0.4); tone(220, 0, 0.12, "sine", 0.15, 120); break;
      case "done": tone(784, 0, 0.25, "triangle", 0.18); tone(988, 0.1, 0.25, "triangle", 0.18); tone(1319, 0.2, 0.5, "triangle", 0.2); break;
      case "beep": tone(1800 + 600 * k, 0, 0.06, "sine", 0.12); break;
      case "dig": burst(0, 0.18, 300, 0.5); burst(0.2, 0.18, 260, 0.5); tone(880, 0.45, 0.3, "triangle", 0.18); tone(1320, 0.55, 0.4, "triangle", 0.18); break;
      case "fix": for (let i = 0; i < 3; i++) { burst(i * 0.18, 0.05, 2500, 0.6, 3); tone(300, i * 0.18, 0.06, "square", 0.08); } break;
      case "chem": burst(0, 1.2, 600, 0.25, 0.5); tone(440, 0.4, 0.8, "sine", 0.06, 880); break;
      case "buy": tone(523, 0, 0.12, "triangle", 0.2); tone(659, 0.08, 0.12, "triangle", 0.2); tone(1047, 0.16, 0.3, "triangle", 0.2); break;
      case "click": tone(900, 0, 0.03, "square", 0.05); break;
      case "splash": burst(0, 0.3, 1500, 0.3, 0.6); break;
      case "rake": burst(0, 0.15, 4200, 0.12, 2); break;
    }
  }

  /**
   * One footstep on a surface: a short filtered noise burst for the texture
   * (swish of grass, crunch of leaves, grit on paving, clack of clay tiles)
   * plus a low thump for the heel. Pitch and level vary a little per step.
   */
  step(g: Ground, loud = 1): void {
    const c = this.ctx;
    if (!c || !this.enabled) return;
    const t = c.currentTime;
    const v = (0.85 + Math.random() * 0.3) * loud, p = 0.9 + Math.random() * 0.2;
    const burst = (at: number, dur: number, freq: number, vol: number, q: number, type: BiquadFilterType = "bandpass") => {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq * p; f.Q.value = q;
      const gn = c.createGain();
      gn.gain.setValueAtTime(0.0001, t + at);
      gn.gain.linearRampToValueAtTime(vol * v, t + at + Math.min(0.012, dur * 0.25));
      gn.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      src.connect(f).connect(gn).connect(this.master);
      src.start(t + at, Math.random() * 1.5);
      src.stop(t + at + dur + 0.03);
    };
    const thump = (freq: number, dur: number, vol: number) => {
      const o = c.createOscillator(), gn = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq * p, t);
      o.frequency.exponentialRampToValueAtTime(freq * p * 0.55, t + dur);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.linearRampToValueAtTime(vol * v, t + 0.006);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.03);
    };
    switch (g) {
      case "grass": burst(0, 0.16, 2600, 0.09, 0.6); burst(0.03, 0.1, 5200, 0.04, 0.8); thump(85, 0.08, 0.12); break;
      case "leaves": burst(0, 0.12, 3400, 0.12, 1.2); burst(0.05, 0.14, 2200, 0.1, 1); burst(0.1, 0.08, 4600, 0.06, 1.5); thump(85, 0.07, 0.1); break;
      case "dirt": burst(0, 0.1, 900, 0.14, 0.8); burst(0.02, 0.07, 2400, 0.05, 1); thump(95, 0.08, 0.16); break;
      case "stone": burst(0, 0.05, 1700, 0.14, 1.5); burst(0.01, 0.04, 4200, 0.05, 2); thump(120, 0.06, 0.18); break;
      case "wood": burst(0, 0.04, 700, 0.1, 2); thump(150, 0.09, 0.22); break;
      case "tile": burst(0, 0.03, 3000, 0.1, 3); thump(180, 0.06, 0.16); break;
      case "deck": burst(0, 0.12, 480, 0.12, 5); thump(110, 0.14, 0.24); break;
      case "roof": burst(0, 0.06, 1250, 0.16, 5); burst(0.015, 0.05, 2500, 0.08, 4); thump(160, 0.05, 0.12); break;
    }
  }

  /** Background: birds now and then. */
  update(dt: number): void {
    if (!this.ctx || !this.enabled) return;
    this.birdT -= dt;
    if (this.birdT > 0) return;
    this.birdT = 3 + Math.random() * 7;
    const c = this.ctx, t = c.currentTime;
    const base = 2600 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sine";
      const at = t + i * 0.13;
      o.frequency.setValueAtTime(base, at);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), at + 0.07);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.025, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
      o.connect(g).connect(this.master);
      o.start(at);
      o.stop(at + 0.15);
    }
  }
}
