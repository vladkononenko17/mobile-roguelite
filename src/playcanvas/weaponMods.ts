import type { WeaponId } from "./config";
import type { WeaponStats } from "./gameplay/config";

/** A run-scoped attachment fitted to one weapon. One item may occupy each slot. */
export type WeaponModId = "suppressor" | "reflex" | "extendedMag" | "foregrip";
export type WeaponModSlot = "muzzle" | "optic" | "magazine" | "underbarrel";

export interface WeaponModDef {
  id: WeaponModId;
  name: string;
  slot: WeaponModSlot;
  cost: number;
  /** One-line workshop copy. */
  text: string;
  /** Only these guns expose a compatible mount in the first Wasteland test. */
  weapons: readonly WeaponId[];
  /** Optional low-poly model, mounted on the named weapon node. */
  visual?: { url: string; mount: string; muzzleExtension?: number };
  /** Visual stretch of the weapon's existing magazine node. */
  magazineScale?: number;
  stats: {
    damage?: number;
    fireRate?: number;
    range?: number;
    spread?: number;
    magazine?: number;
    reload?: number;
    soundVolume?: number;
    soundLowpassHz?: number;
    muzzleSize?: number;
  };
}

const TEST_WEAPONS = ["rifle", "mp5", "dualUzi"] as const satisfies readonly WeaponId[];

// Vite emits these already-versioned source GLBs as hashed production assets. Keeping the source
// pack as the single copy avoids checking the same binary into both assets-src/ and public/.
const SUPPRESSOR_URL = new URL("../../assets-src/flat-attachments/Flat_Attachments/GLB/Suppressor_East.glb", import.meta.url).href;
const RED_DOT_URL = new URL("../../assets-src/flat-attachments/Flat_Attachments/GLB/RedDot_East.glb", import.meta.url).href;
const FOREGRIP_URL = new URL("../../assets-src/flat-attachments/Flat_Attachments/GLB/Foregrip_East.glb", import.meta.url).href;

/**
 * Wasteland weapon-bench modules. Models are the CC0 Pichuliru Flat Gun Attachments pack already
 * used by the repository's Flat Guns; the stat trade-offs are deliberately easy to read on mobile.
 */
export const WEAPON_MODS: readonly WeaponModDef[] = [
  {
    id: "suppressor",
    name: "Suppressor",
    slot: "muzzle",
    cost: 35,
    text: "Muffled shots · -20% spread · smaller muzzle flash",
    weapons: TEST_WEAPONS,
    visual: { url: SUPPRESSOR_URL, mount: "Attach_Muzzle", muzzleExtension: 0.148 },
    // Keep the shot audible on a phone speaker. The low-pass provides the suppressed character;
    // gain reduction alone made compact weapons effectively silent under music and enemy voices.
    stats: { spread: 0.8, soundVolume: 0.78, soundLowpassHz: 2400, muzzleSize: 0.45 },
  },
  {
    id: "reflex",
    name: "Reflex Sight",
    slot: "optic",
    cost: 30,
    text: "+18% range · -28% spread",
    weapons: TEST_WEAPONS,
    visual: { url: RED_DOT_URL, mount: "Attach_Scope" },
    stats: { range: 1.18, spread: 0.72 },
  },
  {
    id: "extendedMag",
    name: "Extended Magazine",
    slot: "magazine",
    cost: 35,
    text: "+45% magazine · reload takes 12% longer",
    weapons: TEST_WEAPONS,
    magazineScale: 1.35,
    stats: { magazine: 1.45, reload: 1.12 },
  },
  {
    id: "foregrip",
    name: "Foregrip",
    slot: "underbarrel",
    cost: 30,
    text: "-30% spread · +5% fire rate",
    weapons: ["rifle", "mp5"],
    visual: { url: FOREGRIP_URL, mount: "Attach_Rail.Bottom" },
    stats: { spread: 0.7, fireRate: 1.05 },
  },
] as const;

export function weaponMod(id: WeaponModId): WeaponModDef {
  return WEAPON_MODS.find((mod) => mod.id === id)!;
}

export function modsForWeapon(weapon: WeaponId): readonly WeaponModDef[] {
  return WEAPON_MODS.filter((mod) => mod.weapons.includes(weapon));
}

/** Pure stat projection used by PlayerStats and unit tests. */
export function applyWeaponMods(base: WeaponStats, mods: Iterable<WeaponModId>, fallbackSound: string): WeaponStats {
  const result: WeaponStats = {
    ...base,
    fx: base.fx ? { ...base.fx } : undefined,
    audio: {
      id: base.audio?.id ?? fallbackSound,
      volume: base.audio?.volume ?? 1,
      rate: base.audio?.rate ?? 1,
      lowpassHz: base.audio?.lowpassHz,
    },
  };
  for (const id of mods) {
    const m = weaponMod(id).stats;
    result.damage *= m.damage ?? 1;
    result.fireRate *= m.fireRate ?? 1;
    result.range *= m.range ?? 1;
    result.spreadDeg *= m.spread ?? 1;
    result.magazine = Math.max(1, Math.round(result.magazine * (m.magazine ?? 1)));
    result.reloadSeconds *= m.reload ?? 1;
    result.audio!.volume! *= m.soundVolume ?? 1;
    if (m.soundLowpassHz !== undefined) result.audio!.lowpassHz = m.soundLowpassHz;
    if (m.muzzleSize !== undefined) {
      result.fx ??= {};
      result.fx.muzzleSize = (result.fx.muzzleSize ?? (result.pellets > 1 ? 0.32 : 0.22)) * m.muzzleSize;
    }
  }
  return result;
}
