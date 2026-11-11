// WHITEOUT: chapter 6 as a campaign - a night of snow from the black pines to a burning town.
// The dead here are frozen (the four turned survivors in frost-pale and frost-blue skins), the
// infected hounds hunt in packs between the trees, and the Ravager - a giant grown out of the town's
// dead - waits in the square. All data, like wastelandConfig.ts.

import type { BossPhase } from "./hellConfig";
import type { DifficultyDef, EnemyDef, WaveDef } from "./config";
import { survivorsAs } from "./wastelandConfig";

export type WinterEnemyId = "frostbitten" | "stalker" | "ravager";

export const WINTER_ENEMIES: Record<WinterEnemyId, EnemyDef> = {
  // GRUNT: the frozen dead - slow, hard to put down, their grip numbs (a short slow).
  frostbitten: {
    label: "Frostbitten", visuals: survivorsAs("Frozen"), scale: 1.1, scaleJitter: 0.06, behavior: "chaser",
    maxHp: 48, speed: 1.4, radius: 0.36, damage: 11, attackRange: 1.15, attackWindup: 0.42, attackCooldown: 1.15,
    cash: 1, xp: 13, drops: { cash: 0.42, health: 0.03, upgrade: 0.007 },
    cripple: { slow: 0.75, seconds: 0.9 },
  },
  // FAST: they come out of the white at a sprint.
  stalker: {
    label: "Stalker", visuals: survivorsAs("FrozenRunner"), scale: 1.06, scaleJitter: 0.04, behavior: "chaser",
    maxHp: 32, speed: 4.5, radius: 0.34, damage: 9, attackRange: 1.1, attackWindup: 0.26, attackCooldown: 0.85,
    cash: 1, xp: 16, drops: { cash: 0.45, health: 0.03, upgrade: 0.008 },
  },
  // BOSS: THE RAVAGER - the Abomination's kind, grown bigger on a whole town, frost in its hide.
  ravager: {
    label: "The Ravager", visuals: ["zkAbomination"], scale: 3.1, tint: [0.78, 0.86, 1.0], behavior: "boss", script: "ravager", boss: true,
    maxHp: 4600, speed: 1.7, radius: 1.5, damage: 32, attackRange: 3.4, attackWindup: 0.7, attackCooldown: 1.5, knockback: 9,
    cash: 120, xp: 320, drops: { cash: 1, health: 1, upgrade: 0 },
  },
};

export const WINTER_TYPE_SKINS: Partial<Record<WinterEnemyId, "abom_rot"[]>> = { ravager: ["abom_rot"] };

export const WINTER_BOSSES: Record<string, BossPhase[]> = {
  // Reads like the Abomination, hits like a truck: then it starts throwing burning wreckage, and at
  // the end it calls the whole town's dead and never stops charging.
  ravager: [
    {
      below: 1, cadence: 1.45, speed: 1,
      attacks: [
        { kind: "melee", hits: 1, windup: 0.75, range: 3.6, damage: 30 },
        { kind: "charge", telegraph: 1.05, speed: 13, distance: 16, damage: 32, recover: 1.7 },
        { kind: "slam", telegraph: 1.2, radius: 4.8, damage: 30 },
        { kind: "volley", windup: 0.8, count: 3, spreadDeg: 30, speed: 7.5, damage: 20, volleys: 1, gap: 0 },
        { kind: "summon", enemies: [{ type: "frostbitten", count: 4 }], radius: 4, portal: 1.1 },
      ],
    },
    {
      below: 0.6, cadence: 1.2, speed: 1.15, enter: { roar: 1.6, arena: 0.6, banner: "The Ravager tears a car apart" },
      attacks: [
        { kind: "meteors", count: 4, radius: 2.3, delay: 1.25, damage: 26, spread: 6, fire: 5, gap: 0.3 },
        { kind: "charge", telegraph: 0.95, speed: 14, distance: 17, damage: 34, recover: 1.4, repeat: 2 },
        { kind: "melee", hits: 2, windup: 0.6, range: 3.6, damage: 28 },
        { kind: "slam", telegraph: 1.05, radius: 5.2, damage: 30, fire: 4 },
        { kind: "summon", enemies: [{ type: "stalker", count: 3 }, { type: "stray", count: 2 }], radius: 4.5, portal: 1.0 },
      ],
    },
    {
      below: 0.25, cadence: 0.95, speed: 1.3, enter: { roar: 1.4, arena: 1, banner: "The whole town is coming" },
      attacks: [
        { kind: "charge", telegraph: 0.85, speed: 15, distance: 18, damage: 36, recover: 1.2, repeat: 3 },
        { kind: "meteors", count: 6, radius: 2.4, delay: 1.1, damage: 26, spread: 7, fire: 6, gap: 0.22 },
        { kind: "volley", windup: 0.55, count: 5, spreadDeg: 56, speed: 8, damage: 20, volleys: 2, gap: 0.45 },
        { kind: "summon", enemies: [{ type: "frostbitten", count: 4 }, { type: "stalker", count: 3 }], radius: 5, portal: 0.9 },
      ],
    },
  ],
};

/* ------------------------------------------------------------------------------------------------
 * The campaign: four levels - the forest, the farm, the suburb, the town (boss). These are Hard.
 * ---------------------------------------------------------------------------------------------- */

export const WINTER_LEVELS: WaveDef[] = [
  {
    label: "Whiteout I", act: "Whiteout", subtitle: "The Black Pines", zone: "forest",
    duration: 75, prespawn: 6, hpScale: 1, damageScale: 1,
    phases: [
      { at: 0, spawnInterval: 2.8, group: [2, 3], maxAlive: 11, weights: { frostbitten: 1, stray: 0.35 } },
      { at: 22, spawnInterval: 2.4, group: [3, 4], maxAlive: 15, weights: { frostbitten: 1, stray: 0.6, rotter: 0.4 } },
      // The pack comes out of the trees.
      { at: 50, spawnInterval: 2.1, group: [3, 4], maxAlive: 16, weights: { frostbitten: 1, stray: 0.8, stalker: 0.25 } },
    ],
  },
  {
    label: "Whiteout II", act: "Whiteout", subtitle: "Hollow Farm", zone: "farm",
    duration: 85, prespawn: 8, hpScale: 1.15, damageScale: 1.1, speedScale: 1.03,
    traps: { every: 16, kinds: ["tar"], damage: 12 },
    phases: [
      { at: 0, spawnInterval: 2.5, group: [3, 5], maxAlive: 15, weights: { frostbitten: 1, rotter: 0.6, stalker: 0.35 } },
      { at: 28, spawnInterval: 2.2, group: [4, 6], maxAlive: 19, weights: { frostbitten: 1, stalker: 0.5, bloater: 0.15, stray: 0.4 } },
      { at: 58, spawnInterval: 1.9, group: [4, 6], maxAlive: 22, weights: { frostbitten: 1, stalker: 0.6, bloater: 0.2, ripper: 0.4, thrower: 0.15 } },
    ],
    // Something has been living in the barn.
    boss: { type: "charger", spawnFactor: 0.3 },
  },
  {
    label: "Whiteout III", act: "Whiteout", subtitle: "Maple Lane", zone: "suburb",
    duration: 95, prespawn: 10, hpScale: 1.35, damageScale: 1.2, speedScale: 1.06,
    traps: { every: 15, kinds: ["sweep"], damage: 14 },
    phases: [
      { at: 0, spawnInterval: 2.3, group: [3, 5], maxAlive: 17, weights: { frostbitten: 1, stalker: 0.55, ripper: 0.4, rotter: 0.5 } },
      { at: 32, spawnInterval: 2.0, group: [4, 6], maxAlive: 21, weights: { frostbitten: 1, stalker: 0.7, ripper: 0.5, thrower: 0.2, bloater: 0.15 } },
      { at: 64, spawnInterval: 1.85, group: [4, 6], maxAlive: 22, weights: { frostbitten: 1, stalker: 0.8, ripper: 0.6, thrower: 0.25, bloater: 0.2 } },
    ],
  },
  {
    label: "Whiteout IV", act: "Whiteout", subtitle: "Ashford, Burning", zone: "town",
    duration: 45, prespawn: 8, hpScale: 1.5, damageScale: 1.3, speedScale: 1.06,
    phases: [
      { at: 0, spawnInterval: 2.2, group: [3, 5], maxAlive: 16, weights: { frostbitten: 1, stalker: 0.6, stray: 0.4, ripper: 0.3 } },
    ],
    boss: { type: "ravager", spawnFactor: 0.3 },
  },
];

/** A Whiteout run: a veteran's chapter - the SMG, some cash, the shop climbs faster. */
export const WINTER_RUN = {
  startWeapon: "mp5" as const,
  startCash: 120,
  tierBoost: 2,
  startPicks: 0,
  pactAfter: -1,
  finalLevel: 3,
  text: {
    finalWarning: ["ASHFORD", "The town is burning and something huge is walking through the fire. Watch its wind-ups, get out of the rings - and never stop moving."] as [string, string],
  },
};

export const WINTER_DIFFICULTIES: Record<"easy" | "hard" | "nightmare", DifficultyDef> = {
  easy: {
    label: "Easy",
    text: "A long night, but you'll see the morning: slower dead, no traps, healing unbound.",
    levels: [
      undefined,
      { hpScale: 1.05, damageScale: 1, traps: undefined },
      { hpScale: 1.15, damageScale: 1.05, traps: undefined },
      { hpScale: 1.2, damageScale: 1.1, bossHpScale: 0.75 },
    ],
    cripple: false,
    followHero: 0,
  },
  hard: {
    label: "Hard",
    text: "The snow hides them until they're on you: traps, faster dead, healing capped.",
    killHealPerSecond: 3,
    pickupHealMax: 35,
    cripple: true,
    followHero: 0.6,
  },
  nightmare: {
    label: "Nightmare",
    text: "No one walks out of Ashford. Prove them wrong.",
    scale: {
      hp: [1.2, 1.3, 1.35, 1.4],
      damage: [1.1, 1.2, 1.25, 1.25],
      speed: [1.03, 1.05, 1.06, 1.06],
      bossHp: 1.35,
      bossDamage: 1.2,
      trapsEvery: 0.75,
      trapsDamage: 1.25,
      maxAlive: 1.1,
    },
    killHealPerSecond: 1.5,
    pickupHealMax: 15,
    cripple: true,
    followHero: 0.9,
  },
};
