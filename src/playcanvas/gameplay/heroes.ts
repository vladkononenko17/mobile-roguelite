import type { UpgradeIcon } from "../ui/UpgradeIcons";
import type { GadgetId } from "./gadgets";
import type { PlayerStats } from "./PlayerStats";

/**
 * Playable heroes (Brotato / Vampire Survivors style kits): three, each changing the run's starting
 * numbers with a perk and a trade-off. The Survivor is free; the Medic and the Demolitionist are
 * unlocked by quests (gameplay/profile.ts). Each has its own model (config.ts CHARACTERS, same id).
 */
export type HeroId = "survivor" | "medic" | "demolitionist" | "drifter";

export interface HeroDef {
  id: HeroId;
  name: string;
  /** One-line role ("Field medic"). */
  role: string;
  perk: string;
  drawback: string;
  icon: UpgradeIcon;
  color: string;
  /** Free from the start (no quest). */
  free?: boolean;
  /** The hero a chapter starts with unless the player has picked one (Whiteout: the Drifter). */
  chapter?: string;
  /** Starts the run with this gadget (level 1). */
  gadget?: GadgetId;
  apply: (s: PlayerStats) => void;
}

export const HEROES: HeroDef[] = [
  {
    id: "survivor", name: "Survivor", role: "The all-rounder", perk: "No weaknesses", drawback: "No tricks either", icon: "star", color: "#d6a23c", free: true,
    apply: () => {},
  },
  {
    id: "drifter", name: "Drifter", role: "Dressed for the cold, alone on the road", perk: "+25 max HP · reloads 15% faster · +20% pickup reach", drawback: "-5% move speed (the parka)", icon: "shield", color: "#9fc4ff", free: true, chapter: "winter",
    apply: (s) => { s.maxHp += 25; s.hp = s.maxHp; s.reloadTimeMult *= 0.85; s.magnetMult *= 1.2; s.moveSpeedMult *= 0.95; },
  },
  {
    id: "medic", name: "Medic", role: "Field medic, quick on her feet", perk: "+2 HP per kill · all healing +50% · +10% move speed", drawback: "-12% weapon damage", icon: "medkit", color: "#7fd07a",
    apply: (s) => { s.healOnKill += 2; s.healMult *= 1.5; s.moveSpeedMult *= 1.1; s.damageMult *= 0.88; },
  },
  {
    id: "demolitionist", name: "Demolitionist", role: "Heavy, loud and hard to kill", perk: "+40 max HP · kills explode (15%) · Grenade Belt · 3 gadget slots", drawback: "-10% fire rate · -8% move speed", icon: "burst", color: "#ff8a3a", gadget: "grenade",
    apply: (s) => { s.maxHp += 40; s.hp = s.maxHp; s.explodeChance += 0.15; s.explodeDamage += 8; s.gadgetSlots = 3; s.fireRateMult *= 0.9; s.moveSpeedMult *= 0.92; },
  },
];

export const heroDef = (id: string): HeroDef => HEROES.find((h) => h.id === id) ?? HEROES[0];
