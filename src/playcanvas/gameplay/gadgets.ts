import type { UpgradeIcon } from "../ui/UpgradeIcons";

/**
 * Gadgets: automatic side weapons in their own slots (Brotato's extra weapons, Vampire Survivors'
 * stacked attacks), bought and levelled in the shop (Lv 1-4). Two slots (the Tinkerer has three).
 * Grenades and the Tesla Coil are there from the start; Saw Blades and the Molotov are quest unlocks.
 * Runtime behaviour: gameplay/Gadgets.ts.
 */
export type GadgetId = "grenade" | "tesla" | "saws" | "molotov";

export interface GadgetDef {
  id: GadgetId;
  name: string;
  text: string;
  icon: UpgradeIcon;
  color: string;
  /** Needs a quest unlock (gameplay/profile.ts). */
  locked?: boolean;
}

export const GADGET_MAX_LEVEL = 4;

export const GADGETS: GadgetDef[] = [
  { id: "grenade", name: "Grenade Belt", text: "Lobs a grenade at the horde every few seconds", icon: "burst", color: "#ff8a3a" },
  { id: "tesla", name: "Tesla Coil", text: "Zaps the nearest enemies around you", icon: "rapid", color: "#4fb8ff" },
  { id: "saws", name: "Saw Blades", text: "Spinning blades orbit you and cut what they touch", icon: "split", color: "#d8d2c4", locked: true },
  { id: "molotov", name: "Molotov", text: "Sets a patch of ground on fire under a crowd", icon: "flame", color: "#e8653a", locked: true },
];

export const gadgetDef = (id: GadgetId): GadgetDef => GADGETS.find((g) => g.id === id)!;

/** Numbers per level (1-4). */
export function gadgetStats(id: GadgetId, level: number): Record<string, number> {
  const l = Math.max(1, Math.min(GADGET_MAX_LEVEL, level)) - 1;
  switch (id) {
    case "grenade": return { every: 3.2 * 0.88 ** l, damage: 28 + 16 * l, radius: 2.3 + 0.2 * l, count: l >= 3 ? 2 : 1, range: 10 };
    case "tesla": return { every: 1.4 * 0.9 ** l, damage: 13 + 9 * l, targets: 2 + l, range: 5.5 + 0.5 * l };
    case "saws": return { blades: 2 + Math.floor((l + 1) / 2), damage: 10 + 7 * l, radius: 2.1 + 0.15 * l, hitEvery: 0.45, speed: 2.6 + 0.3 * l };
    case "molotov": return { every: 4.5 * 0.9 ** l, burn: 12 + 7 * l, radius: 2.3 + 0.25 * l, seconds: 3 + 0.5 * l, range: 9 };
  }
}

/** One-line level summary for shop cards. */
export function gadgetLine(id: GadgetId, level: number): string {
  const s = gadgetStats(id, level);
  switch (id) {
    case "grenade": return `${s.damage} dmg blast every ${s.every.toFixed(1)}s${s.count > 1 ? " · 2 grenades" : ""}`;
    case "tesla": return `${s.damage} dmg to ${s.targets} foes every ${s.every.toFixed(1)}s`;
    case "saws": return `${s.blades} blades · ${s.damage} dmg per cut`;
    case "molotov": return `${s.burn} burn/s fire for ${s.seconds.toFixed(1)}s every ${s.every.toFixed(1)}s`;
  }
}

/** Price of buying `id` at its next level (`owned`: current level, 0 = new). */
export function gadgetPrice(owned: number): number {
  return owned <= 0 ? 48 : Math.round(34 * 1.55 ** (owned - 1));
}
