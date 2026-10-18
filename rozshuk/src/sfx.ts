/**
 * Synthesized sound for «Розшук» (WebAudio). Nothing is downloaded, so there
 * is nothing to license. Two buses — effects and music — muted separately.
 */
export type Sound =
  | "step" | "spotted" | "huh" | "lost" | "grab" | "hit" | "miss" | "win" | "fail" | "coin" | "knock" | "type"
  | "ping" | "door" | "van" | "bark" | "phone" | "eat" | "snore" | "heart" | "whistle" | "splash" | "vault" | "click" | "curfew" | "purr";

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxMuted = false;
let musicMuted = false;

export function getAudio(): { ctx: AudioContext; sfx: GainNode; music: GainNode } | null {
  return ctx && sfxBus && musicBus ? { ctx, sfx: sfxBus, music: musicBus } : null;
}

export function unlockAudio(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = sfxMuted ? 0 : 0.6;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = musicMuted ? 0 : 0.38;
      musicBus.connect(master);
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function setMuted(v: boolean): void { sfxMuted = v; if (sfxBus) sfxBus.gain.value = v ? 0 : 0.6; }
export function isMuted(): boolean { return sfxMuted; }
export function setMusicMuted(v: boolean): void { musicMuted = v; if (musicBus) musicBus.gain.value = v ? 0 : 0.38; }
export function isMusicMuted(): boolean { return musicMuted; }

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

export function play(sound: Sound): void {
  if (!ctx || sfxMuted) return;
  switch (sound) {
    case "step":
      noise(0, 0.06, 0.12 + Math.random() * 0.05, 700, 250, "lowpass");
      break;
    case "spotted":
      // the stinger: a stab and a whistle
      tone(220, 0, 0.35, "sawtooth", 0.22, 110);
      tone(330, 0, 0.35, "square", 0.08, 160);
      tone(2600, 0.05, 0.25, "sine", 0.12, 3100);
      noise(0, 0.25, 0.3, 4000, 800, "bandpass", 2);
      break;
    case "whistle":
      tone(2800, 0, 0.18, "sine", 0.18, 3000);
      tone(2800, 0.22, 0.4, "sine", 0.2, 2700);
      break;
    case "huh":
      tone(520, 0, 0.12, "triangle", 0.12, 700);
      tone(700, 0.13, 0.14, "triangle", 0.1, 600);
      break;
    case "lost":
      [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.18, "triangle", 0.1));
      break;
    case "grab":
      noise(0, 0.2, 0.6, 1200, 200, "lowpass", 1);
      tone(110, 0, 0.3, "square", 0.2, 60);
      break;
    case "hit":
      tone(880, 0, 0.08, "square", 0.08, 1320);
      break;
    case "miss":
      tone(160, 0, 0.18, "sawtooth", 0.15, 90);
      break;
    case "win":
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.28, "triangle", 0.14));
      break;
    case "fail":
      [392, 349, 311, 233].forEach((f, i) => tone(f, i * 0.2, 0.32, "sawtooth", 0.08));
      break;
    case "coin":
      tone(1318, 0, 0.08, "square", 0.08);
      tone(1760, 0.07, 0.2, "square", 0.08);
      break;
    case "knock":
      for (let i = 0; i < 3; i++) { tone(140, i * 0.22, 0.09, "sine", 0.6, 90); noise(i * 0.22, 0.06, 0.4, 900, 300, "lowpass"); }
      break;
    case "type":
      for (let i = 0; i < 5; i++) noise(i * 0.06 + Math.random() * 0.02, 0.025, 0.2, 3000, 2000, "bandpass", 3);
      break;
    case "ping":
      tone(1320, 0, 0.12, "sine", 0.18);
      tone(1980, 0.08, 0.2, "sine", 0.12);
      break;
    case "door":
      noise(0, 0.3, 0.4, 500, 150, "lowpass");
      tone(90, 0.1, 0.25, "sine", 0.4, 60);
      break;
    case "van":
      // the sliding door
      noise(0, 0.7, 0.5, 300, 1800, "bandpass", 2);
      tone(70, 0.65, 0.35, "square", 0.25, 45);
      break;
    case "bark":
      for (let i = 0; i < 2; i++) { tone(420, i * 0.25, 0.12, "sawtooth", 0.18, 260); noise(i * 0.25, 0.1, 0.25, 1400, 500, "bandpass", 2); }
      break;
    case "phone":
      for (let i = 0; i < 3; i++) { tone(880, i * 0.4, 0.15, "square", 0.06); tone(1100, i * 0.4 + 0.16, 0.15, "square", 0.06); }
      break;
    case "eat":
      for (let i = 0; i < 4; i++) noise(i * 0.15, 0.08, 0.25, 2000, 800, "bandpass", 1.5);
      break;
    case "snore":
      noise(0, 0.9, 0.25, 200, 500, "bandpass", 2);
      noise(1.0, 0.7, 0.15, 900, 300, "bandpass", 3);
      break;
    case "purr":
      for (let i = 0; i < 10; i++) tone(28, i * 0.12, 0.1, "sawtooth", 0.15);
      break;
    case "heart":
      tone(58, 0, 0.12, "sine", 0.55, 40);
      tone(58, 0.18, 0.12, "sine", 0.4, 40);
      break;
    case "splash":
      noise(0, 0.7, 0.7, 3000, 300, "lowpass", 0.7);
      break;
    case "vault":
      noise(0, 0.12, 0.3, 800, 300, "lowpass");
      tone(300, 0.1, 0.12, "triangle", 0.12, 500);
      break;
    case "click":
      tone(1800, 0, 0.03, "square", 0.05);
      break;
    case "curfew":
      // a distant siren
      tone(600, 0, 1.2, "sine", 0.12, 900);
      tone(900, 1.2, 1.2, "sine", 0.12, 600);
      break;
  }
}
