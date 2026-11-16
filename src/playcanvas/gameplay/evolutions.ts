import type { WeaponId } from "../config";
import type { UpgradeId, WeaponStats } from "./config";

/**
 * Gun evolutions (Vampire Survivors' weapon + passive): a gun at Mk V whose owner holds the matching
 * upgrade can be evolved at the Gunsmith into a new gun with a new behaviour and look (tracer colour).
 */
export interface EvolutionDef {
  name: string;
  /** The upgrade (any stacks) the evolution needs. */
  needs: UpgradeId;
  text: string;
  color: [number, number, number];
  apply: (w: WeaponStats) => WeaponStats;
}

const fx = (w: WeaponStats, color: [number, number, number], extra: Partial<NonNullable<WeaponStats["fx"]>> = {}): WeaponStats["fx"] => ({
  ...w.fx,
  tracer: color,
  tracerWidth: Math.max(w.fx?.tracerWidth ?? 0.05, 0.07),
  muzzle: color,
  ...extra,
});

export const EVOLUTIONS: Partial<Record<WeaponId, EvolutionDef>> = {
  pistol: {
    name: "Peacemaker", needs: "headhunter", text: "Twin rounds that pierce 2 · +30% damage", color: [1, 0.85, 0.35],
    apply: (w) => ({ ...w, damage: w.damage * 1.3, pellets: w.pellets + 1, spreadDeg: w.spreadDeg + 2, penetration: w.penetration + 2, fx: fx(w, [1, 0.85, 0.35]) }),
  },
  handCannon: {
    name: "Widowmaker", needs: "piercing", text: "Pierces 5 · every hit bursts (40%)", color: [1, 0.55, 0.3],
    apply: (w) => ({ ...w, penetration: w.penetration + 4, fx: fx(w, [1, 0.55, 0.3], { splash: { radius: 1.4, fraction: 0.4 } }) }),
  },
  shotgun: {
    name: "Dragon Pump", needs: "incendiary", text: "+3 pellets · sets everything ablaze", color: [1, 0.45, 0.15],
    apply: (w) => ({ ...w, pellets: w.pellets + 3, fx: fx(w, [1, 0.45, 0.15], { burn: 14 }) }),
  },
  mp5: {
    name: "Buzzsaw", needs: "rapidFire", text: "+40% fire rate · +50% magazine", color: [1, 0.9, 0.5],
    apply: (w) => ({ ...w, fireRate: w.fireRate * 1.4, magazine: Math.round(w.magazine * 1.5), fx: fx(w, [1, 0.9, 0.5]) }),
  },
  dualUzi: {
    name: "Hornet Pair", needs: "ricochet", text: "Two bullets a shot · pierce 1", color: [1, 0.75, 0.25],
    apply: (w) => ({ ...w, pellets: w.pellets + 1, penetration: w.penetration + 1, fx: fx(w, [1, 0.75, 0.25]) }),
  },
  autoShotgun: {
    name: "Thunder Drum", needs: "volatile", text: "Every pellet explodes (50%) · +4 magazine", color: [1, 0.6, 0.2],
    apply: (w) => ({ ...w, magazine: w.magazine + 4, fx: fx(w, [1, 0.6, 0.2], { splash: { radius: 1.6, fraction: 0.5 } }) }),
  },
  rifle: {
    name: "Warden", needs: "heavyRounds", text: "+35% damage · pierce 2", color: [0.95, 0.95, 0.6],
    apply: (w) => ({ ...w, damage: w.damage * 1.35, penetration: w.penetration + 2, fx: fx(w, [0.95, 0.95, 0.6]) }),
  },
  battleRifle: {
    name: "Judgement", needs: "extendedMag", text: "+40% damage · hits burst (35%)", color: [1, 0.8, 0.4],
    apply: (w) => ({ ...w, damage: w.damage * 1.4, fx: fx(w, [1, 0.8, 0.4], { splash: { radius: 1.3, fraction: 0.35 } }) }),
  },
  marksman: {
    name: "Longbow", needs: "headhunter", text: "+60% damage · pierces everything in line", color: [0.7, 1, 0.6],
    apply: (w) => ({ ...w, damage: w.damage * 1.6, penetration: w.penetration + 8, range: w.range + 4, fx: fx(w, [0.7, 1, 0.6]) }),
  },
  plasma: {
    name: "Arc Lance", needs: "chainLightning", text: "Wide plasma bursts (60%) · +20% damage", color: [0.4, 0.9, 1],
    apply: (w) => ({ ...w, damage: w.damage * 1.2, fx: fx(w, [0.4, 0.9, 1], { splash: { radius: 1.6, fraction: 0.6 } }) }),
  },
  pulseSmg: {
    name: "Glacier", needs: "cryo", text: "+25% fire rate · bigger bursts", color: [0.6, 0.95, 1],
    apply: (w) => ({ ...w, fireRate: w.fireRate * 1.25, fx: fx(w, [0.6, 0.95, 1], { splash: { radius: 1.5, fraction: 0.55 } }) }),
  },
  railgun: {
    name: "Godspear", needs: "piercing", text: "+50% damage · pierces 20 · bursts on every hit", color: [0.8, 0.7, 1],
    apply: (w) => ({ ...w, damage: w.damage * 1.5, penetration: w.penetration + 12, fx: fx(w, [0.8, 0.7, 1], { splash: { radius: 1.6, fraction: 0.4 } }) }),
  },
  hellfire: {
    name: "Inferno", needs: "incendiary", text: "Double burn · bursts of fire (45%)", color: [1, 0.35, 0.1],
    apply: (w) => ({ ...w, fx: fx(w, [1, 0.35, 0.1], { burn: (w.fx?.burn ?? 8) * 2, splash: { radius: 1.5, fraction: 0.45 } }) }),
  },
};
