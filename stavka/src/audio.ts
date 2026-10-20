/**
 * Sound for «Ставка»: no voices, only text and sirens — everything is
 * synthesized with WebAudio on the shared «Розшук» buses: the air-raid siren,
 * the all-clear, missile launches, machine-gun bursts, blasts near and far,
 * the ballistic warning beeps and the moped drone of Shaheds overhead.
 */
import { getAudio, noise, tone } from "../../rozshuk/src/sfx.ts";

export { isMuted, setMuted, unlockAudio } from "../../rozshuk/src/sfx.ts";

/** The rising and falling air-raid siren, `cycles` times. */
export function siren(cycles = 2): void {
  const a = getAudio();
  if (!a) return;
  const { ctx, sfx } = a;
  const t = ctx.currentTime;
  const len = cycles * 2.6;
  for (const [mult, vol] of [[1, 0.09], [1.5, 0.04]] as const) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const f = osc.frequency;
    f.setValueAtTime(180 * mult, t);
    for (let i = 0; i < cycles; i++) {
      f.linearRampToValueAtTime(620 * mult, t + i * 2.6 + 1.3);
      f.linearRampToValueAtTime(240 * mult, t + i * 2.6 + 2.6);
    }
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.6);
    g.gain.setValueAtTime(vol, t + len - 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(lp).connect(g).connect(sfx);
    osc.start(t);
    osc.stop(t + len + 0.1);
  }
}
/** Відбій: one long steady tone. */
export function allClear(): void {
  tone(440, 0, 2.4, "triangle", 0.07);
  tone(660, 0, 2.4, "sine", 0.03);
}
export function warnBeep(): void {
  for (let i = 0; i < 3; i++) tone(1320, i * 0.16, 0.1, "square", 0.05);
}
export function samLaunch(): void {
  noise(0, 0.9, 0.12, 400, 2600, "bandpass", 0.8);
  tone(160, 0, 0.5, "sawtooth", 0.03, 60);
}
export function droneLaunch(): void { noise(0, 0.35, 0.05, 1800, 3500, "bandpass", 2); }
export function mgBurst(): void {
  for (let i = 0; i < 5; i++) noise(i * 0.06, 0.04, 0.07, 1400, 500, "bandpass", 1.5);
}
export function boomAir(big = false): void {
  noise(0, big ? 1.4 : 0.8, big ? 0.32 : 0.18, 900, 80, "lowpass", 1);
  tone(big ? 70 : 95, 0, big ? 1.0 : 0.5, "sine", big ? 0.22 : 0.12, 35);
}
export function boomGround(big = false): void {
  noise(0, big ? 2.2 : 1.4, big ? 0.42 : 0.28, 600, 40, "lowpass", 0.7);
  tone(50, 0, big ? 1.6 : 1.1, "sine", big ? 0.32 : 0.22, 28);
}
export function click(): void { tone(880, 0, 0.05, "square", 0.025); }
export function ok(): void { tone(660, 0, 0.08, "triangle", 0.05); tone(990, 0.07, 0.12, "triangle", 0.05); }
export function bad(): void { tone(220, 0, 0.16, "square", 0.04, 160); }
export function launchSwarm(): void { for (let i = 0; i < 4; i++) noise(i * 0.22, 1.2, 0.05, 300, 1200, "bandpass", 1.2); }

/** The moped drone of Shaheds, louder with more of them in the air. */
let buzz: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
export function droneHum(level: number): void {
  const a = getAudio();
  if (!a) return;
  if (!buzz) {
    const { ctx, sfx } = a;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 92;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lg = ctx.createGain();
    lg.gain.value = 6;
    lfo.connect(lg).connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(lp).connect(gain).connect(sfx);
    osc.start();
    lfo.start();
    buzz = { osc, lfo, gain };
  }
  buzz.gain.gain.setTargetAtTime(Math.min(0.06, level * 0.004), a.ctx.currentTime, 0.4);
}
