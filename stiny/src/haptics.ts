/**
 * Vibration for «Чотири стіни». The phone in your hand should flinch when the
 * flat does: a near blast, the fist on the door, the ballistic countdown.
 * Android/Chrome only — iOS Safari has no Vibration API, and then this is a
 * quiet no-op.
 */

const KEY = "stiny-vibe-v1";

export const supported = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

let on = (() => {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
})();

export function vibeOn(): boolean { return on && supported; }
export function setVibe(v: boolean): void {
  on = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* storage blocked */ }
  if (!v && supported) navigator.vibrate(0);
}

/** Patterns, in ms: vibrate, pause, vibrate… */
export const H = {
  tap: [8],
  miss: [30, 40, 30],
  boomNear: [220, 60, 120, 50, 60],
  boomFar: [70],
  /** One knock of a fist. */
  knock: [35],
  /** Three heavy blows. */
  knockHard: [55, 110, 55, 110, 70],
  heart: [14, 110, 22],
  ballisticTick: [28],
  ballisticHit: [500, 90, 250, 70, 120],
  phoneRing: [400, 250, 400],
  doorbell: [60, 120, 90],
  van: [160],
  siren: [600, 300, 600],
  slam: [40, 30, 90],
} satisfies Record<string, number[]>;

let last = 0;
/** Fires a pattern. `force` skips the small throttle (for minigame taps). */
export function buzz(pattern: number[], force = false): void {
  if (!on || !supported) return;
  const now = performance.now();
  if (!force && now - last < 60) return;
  last = now;
  try { navigator.vibrate(pattern); } catch { /* not allowed yet: needs a tap first */ }
}
