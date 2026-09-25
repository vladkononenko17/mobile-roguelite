// ORION: the space campaign - escape the infested ship. The roster (infected crew, aliens, mechs),
// the two bosses and the six-level campaign, all as data (like hellConfig.ts). Alien and mech models
// are Quaternius "Ultimate Space Kit" characters built by scripts/build-space-creatures.mjs; the
// infected crew wear the zombie pack's models in cold skins.

import type { BossPhase } from "./hellConfig";
import type { DifficultyDef, EnemyClips, EnemyDef, EnemyVisual, WaveDef } from "./config";

/* ------------------------------------------------------------------------------------------------
 * Looks
 * ---------------------------------------------------------------------------------------------- */

export type SpaceVisualId = "skitter" | "spitter" | "glub" | "alienBrute" | "mech";
export type SpaceSkinId =
  | "skitter_green" | "skitter_violet" | "skitter_red" | "skitter_void"
  | "spitter_toxic" | "spitter_blue"
  | "glub_pink" | "glub_teal" | "glub_void"
  | "brute_green" | "brute_crimson" | "brood_queen" | "brute_void"
  | "mech_security" | "mech_warden";

const skin = (id: SpaceSkinId) => `models/aliens/skins/${id}.webp`;
export const SPACE_SKINS: Record<SpaceSkinId, string> = {
  skitter_green: skin("skitter_green"), skitter_violet: skin("skitter_violet"), skitter_red: skin("skitter_red"), skitter_void: skin("skitter_void"),
  spitter_toxic: skin("spitter_toxic"), spitter_blue: skin("spitter_blue"),
  glub_pink: skin("glub_pink"), glub_teal: skin("glub_teal"), glub_void: skin("glub_void"),
  brute_green: skin("brute_green"), brute_crimson: skin("brute_crimson"), brood_queen: skin("brood_queen"), brute_void: skin("brute_void"),
  mech_security: skin("mech_security"), mech_warden: skin("mech_warden"),
};

/** The hovering aliens share one clip set (they float: move = fast flying). */
const HOVER_CLIPS: EnemyClips = {
  idle: "Flying_Idle", move: "Fast_Flying", attack: "Punch", hit: "HitReact", death: ["Death"], special: "Headbutt", cast: "Headbutt",
};

export const SPACE_VISUALS: Record<SpaceVisualId, EnemyVisual> = {
  // Quaternius Enemy_ExtraSmall: a floating blob with little claws, ~1.7 units.
  skitter: { url: "models/aliens/skitter.glb", scale: 0.5, clips: HOVER_CLIPS, moveSpeed: 9, skins: ["skitter_green", "skitter_violet"] },
  // Enemy_Small: a hovering one-eyed alien, ~2.3 units; spits acid.
  spitter: { url: "models/aliens/spitter.glb", scale: 0.6, clips: HOVER_CLIPS, moveSpeed: 4, skins: ["spitter_toxic", "spitter_blue"] },
  // Enemy_Flying ("Glub"): a tall floating jellyfish, ~3.7 units.
  glub: { url: "models/aliens/glub.glb", scale: 0.42, clips: HOVER_CLIPS, moveSpeed: 8, skins: ["glub_pink", "glub_teal"] },
  // Enemy_Large: a hulking two-legged alien, ~3.8 units.
  alienBrute: {
    url: "models/aliens/alienBrute.glb", scale: 0.72, moveSpeed: 2.2, skins: ["brute_green", "brute_crimson"],
    clips: { idle: "Idle", move: "Walk", attack: "Punch", hit: "HitReact", death: ["Death"], special: "Weapon", roar: "Wave", cast: "Weapon", slam: "Jump_Land" },
  },
  // Quaternius mech (the frog pilot's walker), ~3 units; grey for security, red for the Warden.
  mech: {
    url: "models/aliens/mech.glb", scale: 0.78, moveSpeed: 2.6, skins: ["mech_security"],
    clips: { idle: "Idle", move: "Run", attack: "Kick", hit: "HitRecieve_1", death: ["Death"], special: "Shoot_Big", roar: "Shoot_Big", cast: "Shoot_Small", slam: "Jump_Landing" },
  },
};

/* ------------------------------------------------------------------------------------------------
 * Enemy archetypes. Silhouettes carry the role: crew shamble, tiny floaters swarm, one-eyed
 * floaters spit, jellyfish fly over the walls, the hulk slams, the mech charges.
 * ---------------------------------------------------------------------------------------------- */

export type SpaceEnemyId =
  | "infected" | "sprinter" | "subject" | "skitter" | "spitter" | "glub" | "hulk" | "secmech"
  | "voidling" | "riftglub" | "riftbrute" | "warden" | "broodmother";

export const SPACE_ENEMIES: Record<SpaceEnemyId, EnemyDef> = {
  // GRUNT: infected crew, cold-skinned.
  infected: {
    label: "Infected Crew", visuals: ["zombieMaleCasual", "zombieFemaleOffice", "zombieMaleFarmer", "zombieFemaleCasual"], scale: 1.1, scaleJitter: 0.05, behavior: "chaser",
    maxHp: 55, speed: 1.6, radius: 0.36, damage: 10, attackRange: 1.15, attackWindup: 0.4, attackCooldown: 1.1,
    cash: 1, xp: 12, drops: { cash: 0.4, health: 0.025, upgrade: 0.006 },
  },
  // FAST: infected that run.
  sprinter: {
    label: "Sprinter", visuals: ["zombieRunnerMale", "zombieRunnerFemale"], scale: 1.06, scaleJitter: 0.03, behavior: "chaser",
    maxHp: 34, speed: 4.4, radius: 0.34, damage: 8, attackRange: 1.1, attackWindup: 0.28, attackCooldown: 0.85,
    cash: 1, xp: 14, drops: { cash: 0.35, health: 0.02, upgrade: 0.006 },
    cripple: { slow: 0.7, seconds: 0.9 },
  },
  // EXPERIMENT: a lab test subject, swollen with the hive's acid - lobs it in puddles.
  subject: {
    label: "Test Subject", gore: "goo", visuals: ["zombieThrower"], scale: 1.14, behavior: "thrower",
    maxHp: 70, speed: 1.3, radius: 0.4, damage: 10, attackRange: 1.15, attackWindup: 0.45, attackCooldown: 1.3,
    cash: 2, xp: 24, drops: { cash: 0.6, health: 0.05, upgrade: 0.012 },
    projectile: { damage: 14, speed: 5.8, radius: 1.3, cooldown: 3.4, minRange: 5, maxRange: 11 },
  },
  // SWARM: tiny floating aliens, fast and weak, in packs.
  skitter: {
    label: "Skitter", gore: "goo", visuals: ["skitter"], scale: 1.0, scaleJitter: 0.1, behavior: "flyer", aimHeight: 0.35,
    maxHp: 18, speed: 4.8, radius: 0.3, damage: 6, attackRange: 0.95, attackWindup: 0.2, attackCooldown: 0.8,
    cash: 0, xp: 5, drops: { cash: 0.12, health: 0.01, upgrade: 0.002 },
    fly: { height: 0.6, orbit: 0 },
  },
  // CASTER: keeps its distance and spits slow acid orbs - dodge sideways.
  spitter: {
    label: "Spitter", gore: "goo", visuals: ["spitter"], scale: 1.0, behavior: "caster", aimHeight: 0.7,
    maxHp: 60, speed: 1.9, radius: 0.4, damage: 8, attackRange: 1.1, attackWindup: 0.4, attackCooldown: 1.3,
    cash: 2, xp: 22, drops: { cash: 0.55, health: 0.04, upgrade: 0.01 },
    bolt: { damage: 12, speed: 6.2, radius: 0.32, cooldown: 2.9, minRange: 5.5, maxRange: 11, count: 1, spreadDeg: 0, windup: 0.5 },
  },
  // FLYER: drifts over walls and machines, spits, dives through.
  glub: {
    label: "Glub", gore: "goo", visuals: ["glub"], scale: 1.0, behavior: "flyer", aimHeight: 0.5,
    maxHp: 80, speed: 3.1, radius: 0.5, damage: 12, attackRange: 1.3, attackWindup: 0.35, attackCooldown: 1.2,
    cash: 3, xp: 30, drops: { cash: 0.6, health: 0.04, upgrade: 0.012 },
    bolt: { damage: 13, speed: 7, radius: 0.34, cooldown: 3.2, minRange: 3, maxRange: 11, count: 1, spreadDeg: 0, windup: 0.45 },
    fly: { height: 2.1, orbit: 6.5, dive: { cooldown: 9, telegraph: 0.9, speed: 12.5, distance: 12, damage: 14 } },
  },
  // TANK: the alien hulk - slow, huge, a knockback smash and a ground slam.
  hulk: {
    label: "Alien Hulk", gore: "goo", visuals: ["alienBrute"], scale: 1.0, behavior: "chaser", armor: 0.15,
    maxHp: 420, speed: 1.4, radius: 0.85, damage: 22, attackRange: 2.0, attackWindup: 0.7, attackCooldown: 1.6, knockback: 7,
    cash: 12, xp: 60, drops: { cash: 1, health: 0.3, upgrade: 0.05 },
    clips: { special: "Jump_Land" },
    slam: { cooldown: 7, telegraph: 1.1, radius: 3.4, damage: 24, triggerRange: 3 },
  },
  // ELITE: a hijacked security mech - armoured, charges.
  secmech: {
    label: "Security Mech", gore: "oil", visuals: ["mech"], scale: 1.0, behavior: "charger", armor: 0.4, glow: [1.4, 0.3, 0.2],
    maxHp: 320, speed: 1.9, radius: 0.7, damage: 18, attackRange: 1.7, attackWindup: 0.55, attackCooldown: 1.3,
    cash: 15, xp: 70, drops: { cash: 1, health: 0.3, upgrade: 0.06 },
    charge: { cooldown: 6, telegraph: 0.9, speed: 11, distance: 10, recover: 1.0, damage: 22 },
  },
  // GATE CREATURES: what came through the portal - the hive's forms, dark and burning violet.
  voidling: {
    label: "Voidling", gore: "goo", visuals: ["skitter"], scale: 1.1, scaleJitter: 0.1, behavior: "flyer", aimHeight: 0.35, glow: [0.9, 0.4, 1.6],
    maxHp: 26, speed: 5.4, radius: 0.32, damage: 8, attackRange: 0.95, attackWindup: 0.18, attackCooldown: 0.75,
    cash: 0, xp: 7, drops: { cash: 0.14, health: 0.01, upgrade: 0.003 },
    fly: { height: 0.7, orbit: 0 },
  },
  riftglub: {
    label: "Rift Glub", gore: "goo", visuals: ["glub"], scale: 1.1, behavior: "flyer", aimHeight: 0.5, glow: [0.9, 0.4, 1.6],
    maxHp: 120, speed: 3.4, radius: 0.55, damage: 14, attackRange: 1.3, attackWindup: 0.3, attackCooldown: 1.1,
    cash: 3, xp: 36, drops: { cash: 0.65, health: 0.05, upgrade: 0.014 },
    bolt: { damage: 15, speed: 7.5, radius: 0.36, cooldown: 2.8, minRange: 3, maxRange: 11, count: 2, spreadDeg: 16, windup: 0.45 },
    fly: { height: 2.2, orbit: 6, dive: { cooldown: 7.5, telegraph: 0.85, speed: 13.5, distance: 13, damage: 16 } },
  },
  riftbrute: {
    label: "Rift Brute", gore: "goo", visuals: ["alienBrute"], scale: 1.15, behavior: "chaser", armor: 0.2, glow: [0.9, 0.4, 1.6],
    maxHp: 620, speed: 1.6, radius: 0.95, damage: 26, attackRange: 2.2, attackWindup: 0.65, attackCooldown: 1.5, knockback: 8,
    cash: 16, xp: 80, drops: { cash: 1, health: 0.35, upgrade: 0.06 },
    clips: { special: "Jump_Land" },
    slam: { cooldown: 6, telegraph: 1.0, radius: 3.8, damage: 26, triggerRange: 3.2 },
  },
  // BOSS 1: THE WARDEN - the ship's security mech, turned. Guns, a charge, a stomp.
  warden: {
    label: "The Warden", gore: "oil", visuals: ["mech"], scale: 2.3, behavior: "boss", script: "warden", boss: true, glow: [2, 0.4, 0.2],
    maxHp: 2600, speed: 1.8, radius: 1.4, damage: 28, attackRange: 3.0, attackWindup: 0.6, attackCooldown: 1.5, knockback: 7,
    cash: 60, xp: 200, drops: { cash: 1, health: 1, upgrade: 0 },
  },
  // BOSS 2: THE BROOD MOTHER - the hive's queen, on the asteroid it came from.
  broodmother: {
    label: "The Brood Mother", gore: "goo", visuals: ["alienBrute"], scale: 2.5, behavior: "boss", script: "broodmother", boss: true, glow: [0.6, 1.6, 0.9],
    maxHp: 10000, speed: 2.0, radius: 1.5, damage: 32, attackRange: 3.3, attackWindup: 0.55, attackCooldown: 1.2, knockback: 8,
    cash: 150, xp: 500, drops: { cash: 1, health: 1, upgrade: 0 },
  },
};

/** Skins per enemy type (overriding the look's own list). */
export const SPACE_TYPE_SKINS: Partial<Record<SpaceEnemyId, SpaceSkinId[]>> = {
  skitter: ["skitter_green", "skitter_violet", "skitter_red"],
  voidling: ["skitter_void"],
  riftglub: ["glub_void"],
  riftbrute: ["brute_void"],
  hulk: ["brute_green", "brute_crimson"],
  secmech: ["mech_security"],
  warden: ["mech_warden"],
  broodmother: ["brood_queen"],
};

/* ------------------------------------------------------------------------------------------------
 * Bosses (gameplay/BossBrain.ts; same attack vocabulary as Hell's)
 * ---------------------------------------------------------------------------------------------- */

export const SPACE_BOSSES: Record<string, BossPhase[]> = {
  // Teaches: read the gun volleys, leave the stomp ring, punish the winded charge.
  warden: [
    {
      below: 1, cadence: 1.7, speed: 1,
      attacks: [
        { kind: "volley", windup: 0.7, count: 3, spreadDeg: 24, speed: 8, damage: 14, volleys: 2, gap: 0.45 },
        { kind: "charge", telegraph: 1.1, speed: 13, distance: 15, damage: 26, recover: 1.8 },
        { kind: "slam", telegraph: 1.2, radius: 4.2, damage: 28 },
        { kind: "melee", hits: 1, windup: 0.7, range: 3.0, damage: 28 },
        { kind: "summon", enemies: [{ type: "skitter", count: 3 }], radius: 3.5, portal: 1.1 },
      ],
    },
    {
      below: 0.5, cadence: 1.3, speed: 1.15, enter: { roar: 1.6, arena: 0.6, banner: "LOCKDOWN - weapons free" },
      attacks: [
        { kind: "radial", windup: 0.8, count: 14, speed: 6.5, damage: 14, rings: 2, gap: 0.55 },
        { kind: "charge", telegraph: 0.95, speed: 14, distance: 15, damage: 28, recover: 1.3, repeat: 2 },
        { kind: "eruption", count: 7, radius: 1.6, delay: 1.0, damage: 26, spacing: 2.2, fire: 3 },
        { kind: "volley", windup: 0.5, count: 5, spreadDeg: 50, speed: 8.5, damage: 14, volleys: 2, gap: 0.45 },
        { kind: "summon", enemies: [{ type: "secmech", count: 1 }, { type: "skitter", count: 4 }], radius: 4.5, portal: 1.1 },
      ],
    },
  ],
  // The final exam on the asteroid: melee, acid, the hive, the sky falling - then faster.
  broodmother: [
    {
      // PHASE 1 - THE QUEEN
      below: 1, cadence: 1.3, speed: 1,
      attacks: [
        { kind: "melee", hits: 2, windup: 0.55, range: 3.4, damage: 30 },
        { kind: "volley", windup: 0.7, count: 5, spreadDeg: 44, speed: 7.5, damage: 18, volleys: 2, gap: 0.5 },
        { kind: "slam", telegraph: 1.15, radius: 4.6, damage: 32 },
        { kind: "summon", enemies: [{ type: "skitter", count: 6 }], radius: 4, portal: 1.1 },
        { kind: "charge", telegraph: 1.0, speed: 14, distance: 16, damage: 34, recover: 1.4 },
      ],
    },
    {
      // PHASE 2 - THE HIVE WAKES
      below: 0.65, cadence: 1.05, speed: 1.1, enter: { roar: 2.2, arena: 0.7, banner: "The hive answers" },
      attacks: [
        { kind: "radial", windup: 0.8, count: 16, speed: 6.5, damage: 18, rings: 2, gap: 0.55 },
        { kind: "meteors", count: 5, radius: 2.3, delay: 1.2, damage: 26, spread: 6, fire: 4, gap: 0.25 },
        { kind: "summon", enemies: [{ type: "spitter", count: 2 }, { type: "glub", count: 1 }, { type: "skitter", count: 4 }], radius: 5, portal: 1.1 },
        { kind: "melee", hits: 3, windup: 0.45, range: 3.4, damage: 30 },
        { kind: "eruption", count: 7, radius: 1.7, delay: 1.0, damage: 28, spacing: 2.2, fire: 4 },
      ],
    },
    {
      // PHASE 3 - FRENZY
      below: 0.3, cadence: 0.75, speed: 1.35, enter: { roar: 2.4, arena: 1, banner: "FRENZY" },
      attacks: [
        { kind: "charge", telegraph: 0.8, speed: 16, distance: 17, damage: 36, recover: 0.8, repeat: 2 },
        { kind: "radial", windup: 0.65, count: 18, speed: 7, damage: 20, rings: 3, gap: 0.45, spiral: 10 },
        { kind: "meteors", count: 7, radius: 2.4, delay: 1.1, damage: 28, spread: 7, fire: 5, gap: 0.2 },
        { kind: "summon", enemies: [{ type: "riftbrute", count: 1 }, { type: "voidling", count: 6 }], radius: 5, portal: 1.2 },
        { kind: "slam", telegraph: 0.95, radius: 5.2, damage: 36, fire: 4 },
        { kind: "melee", hits: 3, windup: 0.4, range: 3.4, damage: 32 },
      ],
    },
  ],
};

/* ------------------------------------------------------------------------------------------------
 * The campaign: seven levels through the station's sectors (world/level/ShipLevel.ts) - two acts of
 * medium / hard / climax, then the finale outside on the asteroid. The roster moves with the story:
 * crew -> security -> experiments -> aliens -> strong aliens -> gate creatures -> the Brood Mother.
 * These numbers are Hard; SPACE_DIFFICULTIES derive Easy / Nightmare.
 * ---------------------------------------------------------------------------------------------- */

export const SPACE_LEVELS: WaveDef[] = [
  {
    label: "ORION I", act: "Act I · The Station", subtitle: "The Docking Bay", zone: "dock",
    duration: 70, prespawn: 6, hpScale: 1, damageScale: 1,
    phases: [
      { at: 0, spawnInterval: 3.0, group: [2, 3], maxAlive: 10, weights: { infected: 1 } },
      { at: 20, spawnInterval: 2.6, group: [3, 4], maxAlive: 14, weights: { infected: 1, sprinter: 0.25 } },
      { at: 45, spawnInterval: 2.2, group: [3, 5], maxAlive: 17, weights: { infected: 1, sprinter: 0.3, skitter: 0.35 } },
    ],
  },
  {
    label: "ORION II", act: "Act I · The Station", subtitle: "Operations Deck", zone: "ops",
    duration: 85, prespawn: 8, hpScale: 1.15, damageScale: 1.1,
    phases: [
      { at: 0, spawnInterval: 2.6, group: [3, 4], maxAlive: 14, weights: { infected: 1, sprinter: 0.4 } },
      { at: 20, spawnInterval: 2.4, group: [3, 5], maxAlive: 16, weights: { infected: 1, sprinter: 0.45, skitter: 0.5, secmech: 0.03 } },
      { at: 55, spawnInterval: 2.1, group: [4, 6], maxAlive: 19, weights: { infected: 1, sprinter: 0.5, skitter: 0.8, secmech: 0.05 } },
    ],
  },
  {
    label: "ORION III", act: "Act I · The Station", subtitle: "The Research Lab", zone: "lab",
    duration: 40, prespawn: 6, hpScale: 1.25, damageScale: 1.15,
    phases: [
      { at: 0, spawnInterval: 2.6, group: [3, 4], maxAlive: 12, weights: { infected: 0.6, subject: 0.5, skitter: 0.6, spitter: 0.15 } },
    ],
    boss: { type: "warden", spawnFactor: 0.25 },
  },
  {
    label: "ORION IV", act: "Act II · Containment Breach", subtitle: "Quarantine", zone: "quarantine",
    duration: 85, prespawn: 8, hpScale: 1.6, damageScale: 1.35, speedScale: 1.06,
    traps: { every: 13, kinds: ["tar", "sweep"], damage: 16 },
    phases: [
      { at: 0, spawnInterval: 2.4, group: [3, 5], maxAlive: 17, weights: { skitter: 1, subject: 0.4, spitter: 0.5, infected: 0.3 } },
      { at: 30, spawnInterval: 2.1, group: [4, 6], maxAlive: 20, weights: { skitter: 1, subject: 0.4, spitter: 0.6, glub: 0.3, infected: 0.2, hulk: 0.06 } },
      { at: 60, spawnInterval: 1.9, group: [4, 6], maxAlive: 22, weights: { skitter: 1.1, subject: 0.3, spitter: 0.7, glub: 0.4, hulk: 0.1 } },
    ],
  },
  {
    label: "ORION V", act: "Act II · Containment Breach", subtitle: "The Reactor", zone: "reactor",
    duration: 95, prespawn: 10, hpScale: 2.0, damageScale: 1.6, speedScale: 1.1,
    traps: { every: 11, kinds: ["tar", "sweep", "cage"], damage: 18 },
    phases: [
      { at: 0, spawnInterval: 2.2, group: [4, 6], maxAlive: 20, weights: { skitter: 1, spitter: 0.7, glub: 0.4, sprinter: 0.4, hulk: 0.1 } },
      { at: 35, spawnInterval: 1.9, group: [4, 7], maxAlive: 23, weights: { skitter: 1, spitter: 0.8, glub: 0.45, sprinter: 0.4, hulk: 0.14, secmech: 0.1 } },
      { at: 70, spawnInterval: 1.7, group: [5, 7], maxAlive: 25, weights: { skitter: 1.1, spitter: 0.9, glub: 0.5, sprinter: 0.4, hulk: 0.18, secmech: 0.14 } },
    ],
  },
  {
    // The gate event: no boss - survive what pours through the portal until it collapses.
    label: "ORION VI", act: "Act II · Containment Breach", subtitle: "Project Gate", zone: "gate",
    duration: 80, prespawn: 8, hpScale: 2.3, damageScale: 1.75, speedScale: 1.14,
    traps: { every: 11, kinds: ["sweep", "cage", "tar"], damage: 20 },
    phases: [
      { at: 0, spawnInterval: 2.0, group: [4, 6], maxAlive: 20, weights: { voidling: 1.2, skitter: 0.4, spitter: 0.5, riftglub: 0.3 } },
      { at: 30, spawnInterval: 1.8, group: [4, 7], maxAlive: 24, weights: { voidling: 1.2, spitter: 0.6, riftglub: 0.45, hulk: 0.08, riftbrute: 0.06 } },
      { at: 60, spawnInterval: 1.6, group: [5, 7], maxAlive: 27, weights: { voidling: 1.3, spitter: 0.6, riftglub: 0.5, riftbrute: 0.12 } },
    ],
  },
  {
    label: "ORION VII", act: "Finale · Outside", subtitle: "The Asteroid", zone: "asteroid",
    duration: 30, prespawn: 5, hpScale: 2.3, damageScale: 1.8, speedScale: 1.2, bossDamageScale: 1.35,
    traps: { every: 13, kinds: ["tar", "sweep", "cage"], damage: 22 },
    // The sky over the rock never stops falling.
    meteors: { every: 10, damage: 20, radius: 2.3, count: 3 },
    phases: [
      { at: 0, spawnInterval: 2.4, group: [3, 4], maxAlive: 13, weights: { skitter: 0.6, voidling: 0.5, spitter: 0.6, glub: 0.4 } },
    ],
    boss: { type: "broodmother", spawnFactor: 0.25 },
  },
];

/** A run on the ORION: the hero comes from the outpost with a rifle and a little cash, at level 1. */
export const SPACE_RUN = {
  startWeapon: "rifle" as const,
  startCash: 120,
  startPicks: 0,
  /** After this level (index) the pact is offered. */
  pactAfter: 4,
  /** Before this level (index) the final warning is shown. */
  finalLevel: 6,
  /** After the Warden the station's armory offers one of these free. */
  armory: { after: 2, weapons: ["plasma", "shotgun"] as const },
  text: {
    armory: ["THE LAB'S ARMORY", "Past the Warden, the security locker stands open. Take one weapon - the other waits in the shop."] as [string, string],
    pact: ["EXPERIMENTAL AUGMENTS", "The reactor crew's prototypes could save you - or cost you. Choose one augment; its power has a price."] as [string, string],
    finalWarning: ["THE LAST AIRLOCK", "The gate is dead. Beyond the airlock: the rock the hive came from, and the Brood Mother. There is no station to go back to."] as [string, string],
  },
};

/** The ORION's difficulties (SPACE_LEVELS are Hard; see HELL_DIFFICULTIES for the model). */
export const SPACE_DIFFICULTIES: Record<"easy" | "hard" | "nightmare", DifficultyDef> = {
  easy: {
    label: "Easy",
    text: "A rescue drill: gentler aliens, no traps, healing unbound.",
    levels: [
      undefined,
      { hpScale: 1.1, damageScale: 1.05 },
      { hpScale: 1.15, damageScale: 1.1, bossHpScale: 0.8 },
      { hpScale: 1.3, damageScale: 1.15, speedScale: 1, traps: undefined },
      { hpScale: 1.5, damageScale: 1.25, speedScale: 1, traps: undefined },
      { hpScale: 1.7, damageScale: 1.35, speedScale: 1, traps: undefined },
      { hpScale: 1.8, damageScale: 1.4, speedScale: 1, traps: undefined, bossDamageScale: 1, bossHpScale: 0.7, meteors: { every: 12, damage: 20, radius: 2.2, count: 2 } },
    ],
    cripple: false,
    followHero: 0,
  },
  hard: {
    label: "Hard",
    text: "Act II is a nightmare: traps, relentless aliens, healing capped. The right build and good feet win.",
    killHealPerSecond: 2.5,
    pickupHealMax: 30,
    cripple: true,
    followHero: 0.7,
  },
  nightmare: {
    label: "Nightmare",
    text: "Built to kill you. Maybe one run in a hundred leaves the asteroid alive.",
    levels: [undefined, { traps: { every: 16, kinds: ["tar", "sweep"], damage: 12 } }, { traps: { every: 15, kinds: ["tar", "sweep"], damage: 14 } }],
    scale: {
      hp: [1.15, 1.2, 1.2, 1.3, 1.3, 1.35, 1.4],
      damage: [1.1, 1.1, 1.15, 1.2, 1.2, 1.25, 1.3],
      speed: [1.03, 1.03, 1.03, 1.07, 1.07, 1.07, 1.07],
      bossHp: 1.3,
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
