/**
 * Synthesized sound effects (WebAudio). Nothing is downloaded, so there is
 * nothing to license. Buses: sfx and music, each mutable on its own.
 */
export type Sound =
  | "bell" | "splash" | "catch" | "friendCatch" | "snap" | "beer" | "swipe" | "caught" | "crack" | "plop"
  | "light" | "cast" | "ratchet" | "thunk" | "burp" | "rustle" | "steps" | "click" | "heartbeat";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let voiceBus: GainNode | null = null;
let sfxMuted = false;
let musicMuted = false;
const unlockListeners: Array<() => void> = [];

export function getAudio(): { ctx: AudioContext; sfx: GainNode; music: GainNode; voice: GainNode } | null {
  return ctx && sfxBus && musicBus && voiceBus ? { ctx, sfx: sfxBus, music: musicBus, voice: voiceBus } : null;
}

export function onUnlock(fn: () => void): void {
  if (ctx) fn();
  else unlockListeners.push(fn);
}

export function unlockAudio(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = sfxMuted ? 0 : 0.6;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = musicMuted ? 0 : 0.42;
      musicBus.connect(master);
      voiceBus = ctx.createGain();
      voiceBus.gain.value = 1;
      voiceBus.connect(master);
      unlockListeners.splice(0).forEach((fn) => fn());
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function setMuted(value: boolean): void {
  sfxMuted = value;
  if (sfxBus) sfxBus.gain.value = value ? 0 : 0.6;
}
export function isMuted(): boolean {
  return sfxMuted;
}
export function setMusicMuted(value: boolean): void {
  musicMuted = value;
  if (musicBus) musicBus.gain.value = value ? 0 : 0.42;
}
export function isMusicMuted(): boolean {
  return musicMuted;
}

export function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, bus = sfxBus): void {
  if (!ctx || !bus) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

let noiseBuffer: AudioBuffer | null = null;
function noiseBuf(): AudioBuffer {
  if (!noiseBuffer && ctx) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer!;
}

export function noise(start: number, dur: number, vol: number, from: number, to: number, type: BiquadFilterType = "bandpass", q = 1, bus = sfxBus): void {
  if (!ctx || !bus) return;
  const t = ctx.currentTime + start;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf();
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(bus);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

/** A few water droplets: short sine chirps that rise in pitch. */
function drops(start: number, n: number, vol: number): void {
  for (let i = 0; i < n; i++) {
    const f = 700 + Math.random() * 900;
    tone(f, start + Math.random() * 0.35, 0.06, "sine", vol, f * 1.9);
  }
}

export function play(sound: Sound): void {
  if (!ctx || sfxMuted) return;
  switch (sound) {
    case "bell":
      tone(1760, 0, 0.5, "sine", 0.3);
      tone(2637, 0.01, 0.3, "sine", 0.1);
      tone(1760, 0.16, 0.45, "sine", 0.22);
      tone(2637, 0.17, 0.25, "sine", 0.08);
      break;
    case "splash":
      noise(0, 0.6, 0.7, 3000, 300, "lowpass", 0.7);
      noise(0, 0.25, 0.4, 5000, 1500, "bandpass", 1.5);
      drops(0.15, 8, 0.06);
      break;
    case "plop":
      tone(520, 0, 0.14, "sine", 0.35, 160);
      noise(0, 0.12, 0.15, 1500, 400, "lowpass");
      drops(0.05, 3, 0.05);
      break;
    case "cast":
      noise(0, 0.35, 0.25, 600, 4000, "bandpass", 3);
      tone(500, 0.42, 0.12, "sine", 0.25, 150);
      drops(0.45, 3, 0.04);
      break;
    case "ratchet":
      for (let i = 0; i < 6; i++) noise(i * 0.045, 0.02, 0.18, 4200, 3000, "bandpass", 6);
      break;
    case "catch":
      noise(0, 0.4, 0.5, 2600, 400, "lowpass", 0.8);
      drops(0.05, 6, 0.06);
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.15 + i * 0.07, 0.2, "triangle", 0.12));
      break;
    case "thunk":
      tone(180, 0, 0.12, "sine", 0.35, 90);
      noise(0, 0.1, 0.25, 900, 300, "lowpass");
      tone(1400, 0.01, 0.25, "triangle", 0.05, 1300);
      break;
    case "friendCatch":
      [392, 370, 349, 311].forEach((f, i) => tone(f, i * 0.22, i === 3 ? 0.6 : 0.24, "sawtooth", 0.07, i === 3 ? 290 : undefined));
      break;
    case "snap":
      noise(0, 0.05, 0.6, 6000, 3000, "highpass");
      tone(900, 0, 0.2, "triangle", 0.2, 120);
      break;
    case "beer":
      noise(0, 0.05, 0.6, 3000, 2500, "bandpass", 2);
      noise(0.04, 0.5, 0.35, 7000, 4000, "highpass");
      for (let i = 0; i < 3; i++) tone(240 - i * 15, 0.6 + i * 0.22, 0.09, "sine", 0.22, 180);
      break;
    case "burp":
      tone(110, 0, 0.35, "sawtooth", 0.15, 70);
      noise(0, 0.3, 0.2, 400, 200, "lowpass");
      break;
    case "light":
      noise(0, 0.04, 0.5, 5000, 4000, "highpass");
      noise(0.05, 0.4, 0.25, 800, 2500, "bandpass", 1);
      break;
    case "swipe":
      noise(0, 0.12, 0.15, 1500, 6000, "bandpass", 2);
      break;
    case "click":
      tone(1800, 0, 0.03, "square", 0.05);
      break;
    case "caught":
      tone(300, 0, 0.15, "square", 0.12, 500);
      tone(500, 0.15, 0.25, "square", 0.12, 260);
      break;
    case "crack":
      noise(0, 0.15, 1, 2500, 500, "bandpass", 1);
      tone(140, 0, 0.25, "square", 0.2, 50);
      break;
    case "rustle":
      for (let i = 0; i < 5; i++) noise(i * 0.09, 0.12, 0.2, 3500, 2000, "bandpass", 1.2);
      break;
    case "steps":
      for (let i = 0; i < 4; i++) noise(i * 0.28, 0.08, 0.3, 600, 200, "lowpass");
      break;
    case "heartbeat":
      tone(60, 0, 0.12, "sine", 0.5, 40);
      tone(60, 0.18, 0.12, "sine", 0.35, 40);
      break;
  }
}
