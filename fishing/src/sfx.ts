/** Tiny WebAudio synth: no audio files to license or download. */
type Sound = "bell" | "splash" | "catch" | "friendCatch" | "snap" | "beer" | "swipe" | "caught" | "crack" | "plop" | "light";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function unlockAudio(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.5;
}

export function isMuted(): boolean {
  return muted;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(start: number, dur: number, vol: number, from: number, to: number): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + start;
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
}

export function play(sound: Sound): void {
  if (!ctx || muted) return;
  switch (sound) {
    case "bell":
      tone(1760, 0, 0.35, "sine", 0.25);
      tone(2637, 0.01, 0.25, "sine", 0.1);
      tone(1760, 0.14, 0.3, "sine", 0.18);
      break;
    case "splash":
      noise(0, 0.35, 0.5, 2400, 400);
      break;
    case "plop":
      tone(600, 0, 0.12, "sine", 0.3, 180);
      break;
    case "catch":
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.18, "square", 0.08));
      noise(0, 0.25, 0.3, 2000, 500);
      break;
    case "friendCatch":
      // Sad trombone, because of course.
      [392, 370, 349, 311].forEach((f, i) => tone(f, i * 0.22, i === 3 ? 0.6 : 0.24, "sawtooth", 0.07, i === 3 ? 290 : undefined));
      break;
    case "snap":
      tone(900, 0, 0.18, "triangle", 0.2, 120);
      noise(0, 0.08, 0.3, 4000, 2000);
      break;
    case "beer":
      noise(0, 0.4, 0.35, 6000, 3000);
      tone(220, 0.45, 0.08, "sine", 0.2);
      tone(200, 0.65, 0.08, "sine", 0.2);
      break;
    case "light":
      noise(0, 0.12, 0.3, 3000, 6000);
      break;
    case "swipe":
      noise(0, 0.1, 0.12, 1500, 5000);
      break;
    case "caught":
      tone(300, 0, 0.15, "square", 0.12, 500);
      tone(500, 0.15, 0.25, "square", 0.12, 260);
      break;
    case "crack":
      noise(0, 0.12, 0.9, 1800, 600);
      tone(140, 0, 0.25, "square", 0.2, 50);
      break;
  }
}
