/**
 * Player settings, kept in this browser: music and sound volume, screen shake, damage numbers and
 * the battery saver (30 fps, lower resolution). Read `settings` anywhere; change through `setSetting`
 * (saved at once, listeners told). `tutorial` is true until the first-run hints have been shown.
 */
export interface Settings {
  /** 0..1. */
  music: number;
  sfx: number;
  shake: boolean;
  /** Floating damage numbers over enemies (the hero's own -HP / +HP always show). */
  numbers: boolean;
  /** 30 fps and a lower render resolution. */
  saver: boolean;
  /** The first-run hints are still to be shown. */
  tutorial: boolean;
}

const KEY = "dustline.settings";
const DEFAULTS: Settings = { music: 0.8, sfx: 1, shake: true, numbers: true, saver: false, tutorial: true };

function load(): Settings {
  const out = { ...DEFAULTS };
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "null") as Partial<Settings> | null;
    if (raw && typeof raw === "object") {
      for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
        if (typeof raw[k] === typeof DEFAULTS[k]) (out as Record<string, unknown>)[k] = raw[k];
      }
    }
  } catch {
    /* storage unavailable or corrupt */
  }
  out.music = Math.min(1, Math.max(0, out.music));
  out.sfx = Math.min(1, Math.max(0, out.sfx));
  return out;
}

export const settings: Settings = load();

const listeners = new Set<(s: Settings) => void>();

/** Calls `fn` after every change (returns the unsubscribe). */
export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  if (settings[key] === value) return;
  settings[key] = value;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
  for (const fn of listeners) fn(settings);
}
