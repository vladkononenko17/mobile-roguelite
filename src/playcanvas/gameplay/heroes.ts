import type { UpgradeIcon } from "../ui/UpgradeIcons";
import type { GadgetId } from "./gadgets";
import type { PlayerStats } from "./PlayerStats";

/**
 * Playable heroes (Brotato / Vampire Survivors style kits): each changes the run's starting numbers
 * with a perk and a trade-off, some start with a gadget or a better gun. All share the Survivor's
 * model. The Survivor is free; the others are unlocked by quests (gameplay/profile.ts).
 */
export type HeroId = "survivor" | "medic" | "gunslinger" | "demolitionist" | "scavenger" | "juggernaut" | "tinkerer";

export interface HeroDef {
  id: HeroId;
  name: string;
  /** One-line role ("Field medic"). */
  role: string;
  perk: string;
  drawback: string;
  icon: UpgradeIcon;
  color: string;
  /** Starts the run with this gadget (level 1). */
  gadget?: GadgetId;
  apply: (s: PlayerStats) => void;
}

export const HEROES: HeroDef[] = [
  {
    id: "survivor", name: "Survivor", role: "The all-rounder", perk: "No weaknesses", drawback: "No tricks either", icon: "star", color: "#d6a23c",
    apply: () => {},
  },
  {
    id: "medic", name: "Medic", role: "Field medic", perk: "+2 HP per kill · +20 max HP · all healing +50%", drawback: "-12% weapon damage", icon: "medkit", color: "#7fd07a",
    apply: (s) => { s.healOnKill += 2; s.maxHp += 20; s.hp = s.maxHp; s.healMult *= 1.5; s.damageMult *= 0.88; },
  },
  {
    id: "gunslinger", name: "Gunslinger", role: "Fast hands", perk: "+15% fire rate · +8% crit · pistol starts at Mk II", drawback: "-20 max HP", icon: "rapid", color: "#e8c35a",
    apply: (s) => { s.fireRateMult *= 1.15; s.critChance += 0.08; s.weaponLevel.set("pistol", 1); s.maxHp -= 20; s.hp = s.maxHp; },
  },
  {
    id: "demolitionist", name: "Demolitionist", role: "Loud solutions", perk: "Kills explode (15%) · starts with a Grenade Belt", drawback: "-15 max HP · -10% fire rate", icon: "burst", color: "#ff8a3a", gadget: "grenade",
    apply: (s) => { s.explodeChance += 0.15; s.explodeDamage += 8; s.maxHp -= 15; s.hp = s.maxHp; s.fireRateMult *= 0.9; },
  },
  {
    id: "scavenger", name: "Scavenger", role: "Knows where the cash is", perk: "+25% cash · +40$ to start · +30% pickup radius", drawback: "-10% weapon damage", icon: "magnet", color: "#8fae6a",
    apply: (s) => { s.cashMult *= 1.25; s.cash += 40; s.magnetMult *= 1.3; s.damageMult *= 0.9; },
  },
  {
    id: "juggernaut", name: "Juggernaut", role: "Walks through it", perk: "+60 max HP · +12% damage resistance", drawback: "-12% move speed · -10% fire rate", icon: "shield", color: "#c26a52",
    apply: (s) => { s.maxHp += 60; s.hp = s.maxHp; s.armor += 0.12; s.moveSpeedMult *= 0.88; s.fireRateMult *= 0.9; },
  },
  {
    id: "tinkerer", name: "Tinkerer", role: "Brings toys", perk: "3 gadget slots · tech damage +25% · starts with a Tesla Coil", drawback: "-15% weapon damage", icon: "drone", color: "#4fb8ff", gadget: "tesla",
    apply: (s) => { s.gadgetSlots = 3; s.techDamageMult *= 1.25; s.damageMult *= 0.85; },
  },
];

export const heroDef = (id: string): HeroDef => HEROES.find((h) => h.id === id) ?? HEROES[0];
