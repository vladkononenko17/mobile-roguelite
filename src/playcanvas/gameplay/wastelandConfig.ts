// THE WASTELAND: chapter 1 as a campaign - the Dustline outpost, then north into the dead city.
// The new infected (Quaternius "Zombie Apocalypse Kit", CC0; built by
// scripts/build-wasteland-creatures.mjs) join the outpost's zombies, and the Abomination waits on
// the plaza. All data, like hellConfig.ts / spaceConfig.ts.

import type { BossPhase } from "./hellConfig";
import type { DifficultyDef, EnemyClips, EnemyDef, EnemyVisual, WaveDef } from "./config";

/* ------------------------------------------------------------------------------------------------
 * Looks
 * ---------------------------------------------------------------------------------------------- */

export type WastelandVisualId = "zkRotter" | "zkBloater" | "zkRipper" | "zkHound" | "zkAbomination";
export type WastelandSkinId =
  | "rotter_green" | "rotter_grey" | "rotter_bruised"
  | "bloater_blue" | "bloater_toxic"
  | "ripper_bone" | "ripper_blood"
  | "abom_flesh" | "abom_rot"
  | "hound_rotten" | "hound_blood";

const skin = (id: WastelandSkinId) => `models/infected/skins/${id}.webp`;
export const WASTELAND_SKINS: Record<WastelandSkinId, string> = {
  rotter_green: skin("rotter_green"), rotter_grey: skin("rotter_grey"), rotter_bruised: skin("rotter_bruised"),
  bloater_blue: skin("bloater_blue"), bloater_toxic: skin("bloater_toxic"),
  ripper_bone: skin("ripper_bone"), ripper_blood: skin("ripper_blood"),
  abom_flesh: skin("abom_flesh"), abom_rot: skin("abom_rot"),
  hound_rotten: skin("hound_rotten"), hound_blood: skin("hound_blood"),
};

/** Quaternius zombie clips (the kit's shared rig). */
const ZOMBIE_KIT_CLIPS: EnemyClips = {
  idle: "Idle", move: "Walk", attack: "Punch", hit: "HitReact", death: ["Death"], special: "Run_Attack", roar: "Punch", cast: "Punch", slam: "Jump_Land",
};

export const WASTELAND_VISUALS: Record<WastelandVisualId, EnemyVisual> = {
  // Zombie_Basic: a hunched green rotter, ~1.36 units tall.
  zkRotter: { url: "models/infected/rotter.glb", scale: 1.35, clips: ZOMBIE_KIT_CLIPS, moveSpeed: 1.3, skins: ["rotter_green", "rotter_grey", "rotter_bruised"] },
  // Zombie_Chubby: the bloater, wide and slow, ~1.64 units.
  zkBloater: { url: "models/infected/bloater.glb", scale: 1.3, clips: ZOMBIE_KIT_CLIPS, moveSpeed: 1.2, skins: ["bloater_blue", "bloater_toxic"] },
  // Zombie_Ribcage: a skeletal ripper, small and quick, ~1.06 units (no punch: it leaps).
  zkRipper: { url: "models/infected/ripper.glb", scale: 1.35, clips: { ...ZOMBIE_KIT_CLIPS, move: "Run", attack: "Jump_Land", special: "Jump_Land" }, moveSpeed: 3.6, skins: ["ripper_bone", "ripper_blood"] },
  // German Shepherd, infected: runs in packs.
  zkHound: {
    url: "models/infected/hound.glb", scale: 1.25, moveSpeed: 4.2, skins: ["hound_rotten", "hound_blood"],
    clips: { idle: "Idle", move: "Run", attack: "Attack", hit: "HitReact_Left", death: ["Death"], special: "Attack" },
  },
  // Zombie_Arm: the Abomination, one arm grown into a club, ~1.57 units.
  zkAbomination: { url: "models/infected/abomination.glb", scale: 1.3, clips: { ...ZOMBIE_KIT_CLIPS, move: "Walk", special: "Run_Attack" }, moveSpeed: 1.4, skins: ["abom_flesh", "abom_rot"] },
};

/* ------------------------------------------------------------------------------------------------
 * The new infected (the outpost's walkers, runners, throwers, brutes and chargers stay in the mix)
 * ---------------------------------------------------------------------------------------------- */

export type WastelandEnemyId = "rotter" | "bloater" | "ripper" | "stray" | "abomination";

export const WASTELAND_ENEMIES: Record<WastelandEnemyId, EnemyDef> = {
  // GRUNT: the city's dead, in numbers.
  rotter: {
    label: "Rotter", visuals: ["zkRotter"], scale: 1, scaleJitter: 0.06, behavior: "chaser",
    maxHp: 42, speed: 1.45, radius: 0.36, damage: 10, attackRange: 1.15, attackWindup: 0.42, attackCooldown: 1.15,
    cash: 1, xp: 11, drops: { cash: 0.4, health: 0.025, upgrade: 0.006 },
  },
  // FAST: a stripped skeleton that sprints and leaps.
  ripper: {
    label: "Ripper", visuals: ["zkRipper"], scale: 1, scaleJitter: 0.05, behavior: "chaser",
    maxHp: 26, speed: 4.3, radius: 0.3, damage: 8, attackRange: 1.05, attackWindup: 0.26, attackCooldown: 0.85,
    cash: 1, xp: 13, drops: { cash: 0.35, health: 0.02, upgrade: 0.006 },
    cripple: { slow: 0.7, seconds: 0.8 },
  },
  // PACK: infected dogs - low, fast, bite to cripple.
  stray: {
    label: "Infected Hound", visuals: ["zkHound"], scale: 1, scaleJitter: 0.08, behavior: "chaser", aimHeight: 0.45,
    maxHp: 30, speed: 5.0, radius: 0.34, damage: 7, attackRange: 1.1, attackWindup: 0.22, attackCooldown: 0.8,
    cash: 1, xp: 12, drops: { cash: 0.3, health: 0.02, upgrade: 0.005 },
    cripple: { slow: 0.65, seconds: 0.9 },
  },
  // CASTER / TANK: the bloater keeps coming and spews bile from range.
  bloater: {
    label: "Bloater", visuals: ["zkBloater"], scale: 1, behavior: "thrower", armor: 0.1,
    maxHp: 150, speed: 1.05, radius: 0.55, damage: 14, attackRange: 1.4, attackWindup: 0.55, attackCooldown: 1.5, knockback: 4,
    cash: 4, xp: 36, drops: { cash: 0.8, health: 0.12, upgrade: 0.02 },
    projectile: { damage: 16, speed: 5.2, radius: 1.6, cooldown: 4.2, minRange: 4, maxRange: 11 },
  },
  // BOSS: THE ABOMINATION - a giant grown out of the city's dead, one arm a club of bone.
  abomination: {
    label: "The Abomination", visuals: ["zkAbomination"], scale: 2.6, behavior: "boss", script: "abomination", boss: true,
    maxHp: 2400, speed: 1.6, radius: 1.3, damage: 28, attackRange: 3.0, attackWindup: 0.7, attackCooldown: 1.5, knockback: 8,
    cash: 80, xp: 250, drops: { cash: 1, health: 1, upgrade: 0 },
  },
};

/** Skins per enemy type (overriding the look's own list). */
export const WASTELAND_TYPE_SKINS: Partial<Record<WastelandEnemyId, WastelandSkinId[]>> = {
  abomination: ["abom_flesh"],
};

/* ------------------------------------------------------------------------------------------------
 * The boss (gameplay/BossBrain.ts; the same attack vocabulary as Hell's)
 * ---------------------------------------------------------------------------------------------- */

export const WASTELAND_BOSSES: Record<string, BossPhase[]> = {
  // The first boss of the game teaches the vocabulary: watch the wind-up, leave the ring, punish the
  // winded charge; at half health it calls the city's dead and gets angry.
  abomination: [
    {
      below: 1, cadence: 1.6, speed: 1,
      attacks: [
        { kind: "melee", hits: 1, windup: 0.8, range: 3.2, damage: 26 },
        { kind: "slam", telegraph: 1.3, radius: 4.2, damage: 26 },
        { kind: "charge", telegraph: 1.15, speed: 12, distance: 14, damage: 28, recover: 1.9 },
        { kind: "melee", hits: 1, windup: 0.8, range: 3.2, damage: 26 },
        { kind: "summon", enemies: [{ type: "rotter", count: 4 }], radius: 3.5, portal: 1.2 },
      ],
    },
    {
      below: 0.5, cadence: 1.2, speed: 1.2, enter: { roar: 1.6, arena: 0.6, banner: "The Abomination is enraged" },
      attacks: [
        { kind: "charge", telegraph: 1.0, speed: 13, distance: 15, damage: 30, recover: 1.5, repeat: 2 },
        { kind: "slam", telegraph: 1.1, radius: 4.8, damage: 28 },
        { kind: "melee", hits: 2, windup: 0.65, range: 3.2, damage: 24 },
        { kind: "summon", enemies: [{ type: "stray", count: 3 }, { type: "ripper", count: 2 }], radius: 4, portal: 1.1 },
      ],
    },
  ],
};

/* ------------------------------------------------------------------------------------------------
 * The campaign: three levels - the outpost (medium), the dead streets (hard), the plaza (boss).
 * These numbers are Hard; WASTELAND_DIFFICULTIES derive Easy / Nightmare.
 * ---------------------------------------------------------------------------------------------- */

export const WASTELAND_LEVELS: WaveDef[] = [
  {
    label: "Wasteland I", act: "The Wasteland", subtitle: "Dustline Outpost", zone: "outpost",
    duration: 70, prespawn: 6, hpScale: 1, damageScale: 1,
    phases: [
      { at: 0, spawnInterval: 3.0, group: [2, 3], maxAlive: 10, weights: { walker: 1, rotter: 0.6 } },
      { at: 20, spawnInterval: 2.6, group: [3, 4], maxAlive: 14, weights: { walker: 1, rotter: 0.8, runner: 0.3 } },
      { at: 45, spawnInterval: 2.2, group: [3, 5], maxAlive: 17, weights: { walker: 1, rotter: 0.8, runner: 0.4, stray: 0.3, thrower: 0.1 } },
    ],
  },
  {
    label: "Wasteland II", act: "The Wasteland", subtitle: "The Dead Streets", zone: "streets",
    duration: 90, prespawn: 8, hpScale: 1.25, damageScale: 1.15, speedScale: 1.05,
    traps: { every: 15, kinds: ["tar", "sweep"], damage: 14 },
    phases: [
      { at: 0, spawnInterval: 2.5, group: [3, 5], maxAlive: 15, weights: { rotter: 1, walker: 0.6, ripper: 0.4, stray: 0.3 } },
      { at: 30, spawnInterval: 2.2, group: [4, 6], maxAlive: 19, weights: { rotter: 1, walker: 0.5, ripper: 0.5, stray: 0.4, bloater: 0.12, thrower: 0.2 } },
      { at: 60, spawnInterval: 1.9, group: [4, 6], maxAlive: 22, weights: { rotter: 1, ripper: 0.6, stray: 0.5, bloater: 0.18, thrower: 0.25, runner: 0.4 } },
    ],
  },
  {
    label: "Wasteland III", act: "The Wasteland", subtitle: "The Plaza", zone: "plaza",
    duration: 35, prespawn: 6, hpScale: 1.35, damageScale: 1.2,
    phases: [
      { at: 0, spawnInterval: 2.6, group: [3, 4], maxAlive: 12, weights: { rotter: 1, ripper: 0.4, stray: 0.3 } },
    ],
    boss: { type: "abomination", spawnFactor: 0.3 },
  },
];

/** A Wasteland run: the hero's first chapter - a rifle, a little cash, level 1. */
export const WASTELAND_RUN = {
  startWeapon: "rifle" as const,
  startCash: 60,
  startPicks: 0,
  /** No pact in the first chapter. */
  pactAfter: -1,
  /** Before this level (index) the final warning is shown. */
  finalLevel: 2,
  text: {
    finalWarning: ["THE PLAZA", "Something huge has been feeding on the city's dead. Read its wind-ups, get out of its rings - and keep moving."] as [string, string],
  },
};

/** The Wasteland's difficulties (WASTELAND_LEVELS are Hard; see HELL_DIFFICULTIES for the model). */
export const WASTELAND_DIFFICULTIES: Record<"easy" | "hard" | "nightmare", DifficultyDef> = {
  easy: {
    label: "Easy",
    text: "Learn the ropes: slower dead, no traps, healing unbound.",
    levels: [
      undefined,
      { hpScale: 1.1, damageScale: 1.05, speedScale: 1, traps: undefined },
      { hpScale: 1.15, damageScale: 1.1, bossHpScale: 0.8 },
    ],
    cripple: false,
    followHero: 0,
  },
  hard: {
    label: "Hard",
    text: "The streets bite back: traps, faster dead, healing capped.",
    killHealPerSecond: 3,
    pickupHealMax: 35,
    cripple: true,
    followHero: 0.6,
  },
  nightmare: {
    label: "Nightmare",
    text: "The city wants you dead - and it has more dead than you have bullets.",
    levels: [{ traps: { every: 16, kinds: ["tar", "sweep"], damage: 12 } }],
    scale: {
      hp: [1.2, 1.3, 1.35],
      damage: [1.1, 1.2, 1.25],
      speed: [1.03, 1.06, 1.06],
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
