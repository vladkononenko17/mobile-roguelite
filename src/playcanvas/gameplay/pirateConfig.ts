// BLACK TIDE: the pirate chapter - cursed gold woke the drowned. Ten levels from a treasure grotto
// over a beach of wrecks, a pier, the deck and the flooded hold of a galleon broken on the reef, the
// shallows and a cliff fort to the skull rock and the deck of the ghost flagship
// (world/level/PirateLevel.ts). The crew: drowned sailors, skeleton boarders, musketeers, powder
// monkeys, carrion crabs, quartermasters and the barnacle brute; three bosses - the Bosun, the Sea
// Hag and the Captain, with the kraken under his ship.
// Bodies: KayKit "Adventurers" / "Skeletons" (CC0, Kay Lousberg) and the CC0 rotter in drowned
// skins; the crab, the tricorn, the musket, the pistol and the anchor are modelled in
// scripts/build-pirate-creatures.mjs. All data, like medievalConfig.ts / hellConfig.ts.

import type { BossPhase } from "./hellConfig";
import type { DifficultyDef, EnemyAttachment, EnemyClips, EnemyDef, EnemyVisual, WaveDef } from "./config";

/* ------------------------------------------------------------------------------------------------
 * Looks
 * ---------------------------------------------------------------------------------------------- */

export type PirateVisualId =
  | "ptBoarder" | "ptMusketeer" | "ptPowder" | "ptQuartermaster" | "ptBrute" | "ptCrab"
  | "ptBosun" | "ptHag" | "ptCaptain";

export type PirateSkinId =
  | "drowned_pale" | "drowned_kelp" | "drowned_blue"
  | "bone_salt" | "bone_kelp" | "coat_blue" | "coat_red" | "powder_tar" | "qm_barnacle" | "qm_rust" | "coral"
  | "bosun_drowned" | "hag_kelp" | "captain_crimson";

const skin = (id: PirateSkinId) => `models/pirate/skins/${id}.webp`;
export const PIRATE_SKINS: Record<PirateSkinId, string> = {
  drowned_pale: skin("drowned_pale"), drowned_kelp: skin("drowned_kelp"), drowned_blue: skin("drowned_blue"),
  bone_salt: skin("bone_salt"), bone_kelp: skin("bone_kelp"), coat_blue: skin("coat_blue"), coat_red: skin("coat_red"),
  powder_tar: skin("powder_tar"), qm_barnacle: skin("qm_barnacle"), qm_rust: skin("qm_rust"), coral: skin("coral"),
  bosun_drowned: skin("bosun_drowned"), hag_kelp: skin("hag_kelp"), captain_crimson: skin("captain_crimson"),
};

/** Gear on bones: the KayKit rig's head and hand slots. */
const HAT: EnemyAttachment = { bone: "head", url: "models/pirate/gear/tricorn.glb", position: [0, 0.62, 0.02], rotation: [-6, 0, 0], scale: 1 };
const BLADE: EnemyAttachment = { bone: "handslot.r", url: "models/medieval/weapons/blade.glb" };
const MUSKET: EnemyAttachment = { bone: "handslot.r", url: "models/pirate/gear/musket.glb" };

const CRAB_CLIPS: EnemyClips = { idle: "Crab_Idle", move: "Crab_Walk", attack: "Crab_Attack", hit: "Crab_Hit", death: ["Crab_Death"] };

// KayKit bodies are ~2.2 units tall (big heads); `scale` brings each to the common ~1.75 m.
export const PIRATE_VISUALS: Record<PirateVisualId, EnemyVisual> = {
  // Skeleton boarder: tricorn and cutlass, sprints in.
  ptBoarder: {
    url: "models/pirate/boarder.glb", scale: 0.76, moveSpeed: 3.0, skins: ["bone_salt", "bone_kelp"],
    clips: { idle: "Idle_Combat", move: "Running_C", attack: "1H_Melee_Attack_Slice_Diagonal", hit: "Hit_A", death: ["Death_C_Skeletons", "Death_A"], special: "1H_Melee_Attack_Chop" },
    attachments: [HAT, BLADE],
  },
  // Drowned musketeer: a sea-rotted coat, a tricorn, a long musket.
  ptMusketeer: {
    url: "models/pirate/musketeer.glb", scale: 0.78, moveSpeed: 1.2, skins: ["coat_blue", "coat_red"],
    clips: { idle: "2H_Ranged_Aiming", move: "Walking_B", attack: "Unarmed_Melee_Attack_Punch_A", hit: "Hit_A", death: ["Death_A", "Death_B"], special: "2H_Ranged_Shoot" },
    attachments: [HAT, MUSKET],
  },
  // Powder monkey: hooded, a lit bomb.
  ptPowder: {
    url: "models/pirate/powder.glb", scale: 0.74, moveSpeed: 1.15, skins: ["powder_tar"],
    clips: { idle: "Idle", move: "Walking_C", attack: "Throw", hit: "Hit_B", death: ["Death_A", "Death_B"], special: "Throw" },
    attachments: [{ bone: "handslot.r", color: [1.8, 0.7, 0.2], position: [0, 0.5, 0], scale: 0.1 }],
  },
  // Quartermaster: shield and hatchet, barnacles; charges.
  ptQuartermaster: {
    url: "models/pirate/quartermaster.glb", scale: 0.8, moveSpeed: 1.25, skins: ["qm_barnacle", "qm_rust"], bulk: 1.08,
    clips: { idle: "Idle", move: "Walking_A", attack: "1H_Melee_Attack_Chop", hit: "Block_Hit", death: ["Death_A", "Death_B"], special: "Dodge_Forward" },
    attachments: [HAT],
  },
  // The barnacle brute: coral-grown, a two-handed axe.
  ptBrute: {
    url: "models/pirate/brute.glb", scale: 0.74, moveSpeed: 1.2, skins: ["coral"], bulk: 1.15,
    clips: { idle: "2H_Melee_Idle", move: "Walking_B", attack: "2H_Melee_Attack_Chop", hit: "Hit_A", death: ["Death_A"], special: "2H_Melee_Attack_Spin", slam: "Jump_Land" },
  },
  // Carrion crab: scuttles in swarms (modelled in code, ~0.55 m high at scale 1).
  ptCrab: { url: "models/pirate/crab.glb", scale: 1, moveSpeed: 2.6, clips: CRAB_CLIPS },
  // Boss: the Bosun, an anchor on his fist.
  ptBosun: {
    url: "models/pirate/bosun.glb", scale: 0.74, moveSpeed: 1.2, skins: ["bosun_drowned"], bulk: 1.1,
    clips: { idle: "2H_Melee_Idle", move: "Walking_B", attack: "2H_Melee_Attack_Chop", hit: "Hit_A", death: ["Death_A"], special: "2H_Melee_Attack_Slice", roar: "Cheer", cast: "Throw", slam: "2H_Melee_Attack_Spin" },
    attachments: [{ bone: "handslot.r", url: "models/pirate/gear/anchor.glb" }, HAT],
  },
  // Boss: the Sea Hag - the witch's hat, a staff, kelp robes.
  ptHag: {
    url: "models/pirate/hag.glb", scale: 0.66, moveSpeed: 1.15, skins: ["hag_kelp"],
    clips: { idle: "Idle", move: "Walking_C", attack: "Spellcast_Shoot", hit: "Hit_A", death: ["Death_A"], special: "Spellcast_Shoot", roar: "Cheer", cast: "Spellcast_Long", slam: "Spellcast_Raise" },
    attachments: [{ bone: "handslot.l", color: [0.4, 1.6, 1.1], position: [0, 0.1, 0], scale: 0.14 }],
  },
  // Boss: the Captain - long red coat, tricorn, cutlass and pistol.
  ptCaptain: {
    url: "models/pirate/captain.glb", scale: 0.76, moveSpeed: 1.25, skins: ["captain_crimson"],
    clips: { idle: "Idle", move: "Walking_A", attack: "1H_Melee_Attack_Slice_Diagonal", hit: "Hit_A", death: ["Death_A"], special: "Dodge_Forward", roar: "Cheer", cast: "1H_Ranged_Shoot", slam: "Jump_Land" },
    attachments: [HAT, BLADE, { bone: "handslot.l", url: "models/pirate/gear/pistol.glb" }],
  },
};

/* ------------------------------------------------------------------------------------------------
 * Enemy archetypes (the player is ~1.95 m tall; the rifle does 10 per shot). Silhouettes carry the
 * role: the drowned and the crabs = fodder, tricorns with blades = fast, muskets and bombs = range,
 * shields and coral = elites.
 * ---------------------------------------------------------------------------------------------- */

export type PirateEnemyId =
  | "drowned" | "crab" | "boarder" | "musketeer" | "powderMonkey" | "quartermaster" | "barnacle"
  | "bosun" | "seaHag" | "captain";

const DROWNED_LOOKS = ["zombieWalker"] as const;

export const PIRATE_ENEMIES: Record<PirateEnemyId, EnemyDef> = {
  // GRUNT: drowned sailors climbing out of the sea, slow, in numbers.
  drowned: {
    label: "Drowned", visuals: [...DROWNED_LOOKS], scale: 1.08, scaleJitter: 0.06, behavior: "chaser",
    maxHp: 40, speed: 1.4, radius: 0.36, damage: 10, attackRange: 1.15, attackWindup: 0.42, attackCooldown: 1.2,
    cash: 1, xp: 11, drops: { cash: 0.4, health: 0.025, upgrade: 0.006 },
  },
  // SWARM: carrion crabs - small, quick, weak; they come in clutches.
  crab: {
    label: "Carrion Crab", visuals: ["ptCrab"], scale: 1.05, scaleJitter: 0.12, behavior: "chaser",
    maxHp: 16, speed: 3.1, radius: 0.32, damage: 5, attackRange: 0.95, attackWindup: 0.3, attackCooldown: 0.9,
    cash: 1, xp: 6, drops: { cash: 0.25, health: 0.012, upgrade: 0.003 },
    aimHeight: 0.35,
  },
  // FAST: the boarder sprints in, a slash that staggers.
  boarder: {
    label: "Boarder", visuals: ["ptBoarder"], scale: 0.98, scaleJitter: 0.04, behavior: "chaser", deathFx: "bones",
    maxHp: 32, speed: 4.1, radius: 0.32, damage: 9, attackRange: 1.15, attackWindup: 0.26, attackCooldown: 0.85,
    cash: 1, xp: 13, drops: { cash: 0.35, health: 0.02, upgrade: 0.006 },
    cripple: { slow: 0.7, seconds: 0.7 },
  },
  // RANGED: the musketeer keeps his distance; one fast ball, a long reload.
  musketeer: {
    label: "Musketeer", visuals: ["ptMusketeer"], scale: 1, scaleJitter: 0.04, behavior: "caster",
    maxHp: 48, speed: 1.4, radius: 0.36, damage: 8, attackRange: 1.1, attackWindup: 0.4, attackCooldown: 1.3,
    cash: 2, xp: 22, drops: { cash: 0.55, health: 0.04, upgrade: 0.01 },
    bolt: { damage: 14, speed: 10, radius: 0.24, cooldown: 3.4, minRange: 6, maxRange: 13, count: 1, spreadDeg: 0, windup: 0.75 },
  },
  // LOBBER: the powder monkey throws lit bombs; killed, his powder goes up - not at arm's length.
  powderMonkey: {
    label: "Powder Monkey", visuals: ["ptPowder"], scale: 0.96, behavior: "thrower",
    deathFx: "burst", deathBurst: { radius: 2.4, damage: 18, delay: 0.7 },
    maxHp: 44, speed: 1.3, radius: 0.36, damage: 8, attackRange: 1.15, attackWindup: 0.45, attackCooldown: 1.4,
    cash: 2, xp: 24, drops: { cash: 0.6, health: 0.05, upgrade: 0.012 },
    projectile: { damage: 16, speed: 6.5, radius: 1.8, cooldown: 3.6, minRange: 4, maxRange: 11 },
  },
  // ELITE: the quartermaster - a shield (35% ignored) and a shield charge.
  quartermaster: {
    label: "Quartermaster", visuals: ["ptQuartermaster"], scale: 1.18, behavior: "charger", armor: 0.35,
    maxHp: 280, speed: 2.0, radius: 0.55, damage: 19, attackRange: 1.6, attackWindup: 0.45, attackCooldown: 1.0, knockback: 4,
    cash: 10, xp: 62, drops: { cash: 1, health: 0.3, upgrade: 0.05 },
    charge: { cooldown: 7, telegraph: 0.85, speed: 11, distance: 9, recover: 1.0, damage: 22 },
  },
  // BRUTE: the barnacle brute - slow, a chop that throws the hero back, a ground slam.
  barnacle: {
    label: "Barnacle Brute", visuals: ["ptBrute"], scale: 1.6, behavior: "chaser", armor: 0.15,
    maxHp: 420, speed: 1.3, radius: 0.8, damage: 26, attackRange: 2.0, attackWindup: 0.7, attackCooldown: 1.7, knockback: 7,
    cash: 8, xp: 70, drops: { cash: 1, health: 0.25, upgrade: 0.04 },
    clips: { hit: undefined },
    slam: { cooldown: 8, telegraph: 1.05, radius: 3.2, damage: 22, triggerRange: 3 },
  },
  // BOSS 1: THE BOSUN - drowned with the anchor he was chained to; swings it, hurls it, drags it.
  bosun: {
    label: "The Bosun", visuals: ["ptBosun"], scale: 2.8, behavior: "boss", script: "bosun", boss: true,
    maxHp: 2800, speed: 1.8, radius: 1.35, damage: 26, attackRange: 3.2, attackWindup: 0.6, attackCooldown: 1.5, knockback: 7,
    cash: 80, xp: 250, drops: { cash: 1, health: 1, upgrade: 0 },
  },
  // BOSS 2: THE SEA HAG - hovers over the lagoon, calls the drowned, throws the sea at the hero.
  seaHag: {
    label: "The Sea Hag", visuals: ["ptHag"], scale: 2.6, behavior: "boss", script: "seaHag", boss: true, glow: [0.4, 1.6, 1.1],
    maxHp: 5200, speed: 2.2, radius: 1.2, damage: 24, attackRange: 3.0, attackWindup: 0.6, attackCooldown: 1.5, knockback: 6,
    cash: 110, xp: 380, drops: { cash: 1, health: 1, upgrade: 0 },
    fly: { height: 1.2, orbit: 8 },
  },
  // BOSS 3: THE CAPTAIN - cutlass and pistol, his crew, his guns; and what lives under his ship.
  captain: {
    label: "The Captain", visuals: ["ptCaptain"], scale: 3.0, behavior: "boss", script: "captain", boss: true, glow: [1.6, 0.5, 0.3],
    maxHp: 11500, speed: 2.1, radius: 1.4, damage: 32, attackRange: 3.4, attackWindup: 0.55, attackCooldown: 1.2, knockback: 8,
    cash: 160, xp: 550, drops: { cash: 1, health: 1, upgrade: 0 },
  },
};

/** Skins per enemy type (overriding the look's own list): the drowned wear the sea. */
export const PIRATE_TYPE_SKINS: Partial<Record<PirateEnemyId, PirateSkinId[]>> = {
  drowned: ["drowned_pale", "drowned_kelp", "drowned_blue"],
};

/* ------------------------------------------------------------------------------------------------
 * Bosses (gameplay/BossBrain.ts; the shared attack vocabulary + the kraken's tentacles)
 * ---------------------------------------------------------------------------------------------- */

export const PIRATE_BOSSES: Record<string, BossPhase[]> = {
  // Teaches: keep out of the anchor's circle, sidestep the drag, watch the line it is hurled along.
  bosun: [
    {
      below: 1, cadence: 1.5, speed: 1,
      attacks: [
        { kind: "melee", hits: 2, windup: 0.7, range: 3.2, damage: 24 },
        { kind: "slam", telegraph: 1.2, radius: 4.4, damage: 26 },
        { kind: "eruption", count: 6, radius: 1.5, delay: 1.0, damage: 24, spacing: 2.0, fire: 0 },
        { kind: "summon", enemies: [{ type: "drowned", count: 4 }], radius: 3.5, portal: 1.2 },
        { kind: "charge", telegraph: 1.15, speed: 12, distance: 13, damage: 26, recover: 1.9 },
      ],
    },
    {
      below: 0.5, cadence: 1.15, speed: 1.15, enter: { roar: 1.6, arena: 0.6, banner: "The Bosun pipes all hands" },
      attacks: [
        { kind: "slam", telegraph: 1.0, radius: 5.0, damage: 28 },
        { kind: "summon", enemies: [{ type: "boarder", count: 3 }, { type: "crab", count: 4 }], radius: 4.2, portal: 1.1 },
        { kind: "charge", telegraph: 0.95, speed: 13, distance: 14, damage: 28, recover: 1.4, repeat: 2 },
        { kind: "eruption", count: 8, radius: 1.6, delay: 0.95, damage: 26, spacing: 2.0, fire: 0 },
        { kind: "melee", hits: 3, windup: 0.55, range: 3.2, damage: 22 },
      ],
    },
  ],
  // Teaches: dodge between the bolts while she circles, leave the geysers, thin out her drowned.
  seaHag: [
    {
      below: 1, cadence: 1.5, speed: 1,
      attacks: [
        { kind: "volley", windup: 0.7, count: 3, spreadDeg: 26, speed: 7.5, damage: 15, volleys: 2, gap: 0.45 },
        { kind: "eruption", count: 6, radius: 1.6, delay: 1.1, damage: 24, spacing: 2.2, fire: 0 },
        { kind: "summon", enemies: [{ type: "drowned", count: 4 }], radius: 3.8, portal: 1.2 },
        { kind: "radial", windup: 0.8, count: 12, speed: 6.2, damage: 14, rings: 2, gap: 0.55 },
        { kind: "meteors", count: 4, radius: 2.0, delay: 1.2, damage: 22, spread: 5, fire: 0, gap: 0.3 },
      ],
    },
    {
      below: 0.55, cadence: 1.1, speed: 1.15, enter: { roar: 1.8, arena: 0.7, banner: "The sea answers her" },
      attacks: [
        { kind: "radial", windup: 0.7, count: 16, speed: 6.6, damage: 15, rings: 3, gap: 0.5, spiral: 9 },
        { kind: "summon", enemies: [{ type: "musketeer", count: 2 }, { type: "crab", count: 5 }], radius: 4.5, portal: 1.1 },
        { kind: "eruption", count: 8, radius: 1.7, delay: 1.0, damage: 26, spacing: 2.2, fire: 0 },
        { kind: "volley", windup: 0.5, count: 5, spreadDeg: 50, speed: 8, damage: 15, volleys: 2, gap: 0.4 },
        { kind: "meteors", count: 6, radius: 2.2, delay: 1.1, damage: 24, spread: 6, fire: 0, gap: 0.22 },
      ],
    },
  ],
  // The finale: the cutlass, the pistol and the lunge; then his crew and his guns; then the kraken.
  captain: [
    {
      // PHASE 1 - THE CAPTAIN
      below: 1, cadence: 1.25, speed: 1,
      attacks: [
        { kind: "melee", hits: 2, windup: 0.55, range: 3.6, damage: 30 },
        { kind: "volley", windup: 0.6, count: 1, spreadDeg: 0, speed: 11, damage: 22, volleys: 3, gap: 0.35 },
        { kind: "charge", telegraph: 0.95, speed: 15, distance: 16, damage: 32, recover: 1.3 },
        { kind: "summon", enemies: [{ type: "boarder", count: 3 }, { type: "drowned", count: 2 }], radius: 4, portal: 1.1 },
        { kind: "melee", hits: 1, windup: 0.7, range: 3.6, damage: 34 },
      ],
    },
    {
      // PHASE 2 - ALL HANDS, RUN OUT THE GUNS
      below: 0.66, cadence: 1.05, speed: 1.1, enter: { roar: 2.2, arena: 0.6, banner: "Run out the guns!" },
      attacks: [
        { kind: "meteors", count: 6, radius: 2.3, delay: 1.15, damage: 28, spread: 7, fire: 3, gap: 0.2 },
        { kind: "summon", enemies: [{ type: "quartermaster", count: 1 }, { type: "musketeer", count: 2 }], radius: 5, portal: 1.1 },
        { kind: "charge", telegraph: 0.85, speed: 16, distance: 16, damage: 34, recover: 1.1, repeat: 2 },
        { kind: "volley", windup: 0.5, count: 3, spreadDeg: 24, speed: 11, damage: 20, volleys: 3, gap: 0.35 },
        { kind: "melee", hits: 3, windup: 0.45, range: 3.6, damage: 30 },
      ],
    },
    {
      // PHASE 3 - THE KRAKEN (tentacles come over the rails and slam across the deck)
      below: 0.33, cadence: 0.8, speed: 1.3, enter: { roar: 2.6, arena: 1, banner: "RELEASE THE KRAKEN" },
      attacks: [
        { kind: "tentacle", count: 3, telegraph: 1.25, length: 22, width: 2.6, damage: 34, gap: 0.45 },
        { kind: "charge", telegraph: 0.8, speed: 16, distance: 17, damage: 36, recover: 0.9, repeat: 2 },
        { kind: "tentacle", count: 4, telegraph: 1.15, length: 22, width: 2.6, damage: 34, gap: 0.35 },
        { kind: "summon", enemies: [{ type: "crab", count: 6 }, { type: "barnacle", count: 1 }], radius: 5, portal: 1.2 },
        { kind: "meteors", count: 6, radius: 2.4, delay: 1.1, damage: 28, spread: 7, fire: 3, gap: 0.2 },
        { kind: "melee", hits: 3, windup: 0.4, range: 3.6, damage: 32 },
      ],
    },
  ],
};

/* ------------------------------------------------------------------------------------------------
 * The campaign: ten levels in three acts (world/level/PirateLevel.ts). The crew grows with the story:
 * the drowned and crabs of the grotto -> boarders and muskets on the beach -> the galleon's crew ->
 * the fort's guns -> the captain's own. These numbers are Hard; PIRATE_DIFFICULTIES derive the rest.
 * ---------------------------------------------------------------------------------------------- */

export const PIRATE_LEVELS: WaveDef[] = [
  {
    label: "Black Tide I", act: "Act I · Cursed Gold", subtitle: "The Treasure Grotto", zone: "grotto",
    duration: 65, prespawn: 6, hpScale: 1, damageScale: 1,
    phases: [
      { at: 0, spawnInterval: 3.0, group: [2, 3], maxAlive: 10, weights: { drowned: 1, crab: 0.5 } },
      { at: 20, spawnInterval: 2.6, group: [3, 4], maxAlive: 14, weights: { drowned: 1, crab: 0.7 } },
      { at: 45, spawnInterval: 2.2, group: [3, 5], maxAlive: 17, weights: { drowned: 1, crab: 0.8, boarder: 0.2 } },
    ],
  },
  {
    label: "Black Tide II", act: "Act I · Cursed Gold", subtitle: "Smugglers' Cove", zone: "cove",
    duration: 80, prespawn: 8, hpScale: 1.12, damageScale: 1.08,
    phases: [
      { at: 0, spawnInterval: 2.6, group: [3, 4], maxAlive: 14, weights: { drowned: 1, crab: 0.6, boarder: 0.3 } },
      { at: 25, spawnInterval: 2.4, group: [3, 5], maxAlive: 16, weights: { drowned: 1, crab: 0.6, boarder: 0.45, musketeer: 0.1 } },
      { at: 55, spawnInterval: 2.1, group: [4, 6], maxAlive: 19, weights: { drowned: 1.1, crab: 0.7, boarder: 0.5, musketeer: 0.15, powderMonkey: 0.06 } },
    ],
  },
  {
    label: "Black Tide III", act: "Act I · Cursed Gold", subtitle: "The Wreck Shore", zone: "shore",
    duration: 40, prespawn: 6, hpScale: 1.22, damageScale: 1.15,
    phases: [
      { at: 0, spawnInterval: 2.6, group: [3, 4], maxAlive: 12, weights: { drowned: 1, crab: 0.6, boarder: 0.3 } },
    ],
    boss: { type: "bosun", spawnFactor: 0.25 },
  },
  {
    label: "Black Tide IV", act: "Act II · The Galleon", subtitle: "The Rotten Pier", zone: "pier",
    duration: 85, prespawn: 8, hpScale: 1.5, damageScale: 1.3, speedScale: 1.05,
    // The galleon on the reef fires on the pier.
    meteors: { every: 11, damage: 18, radius: 2.2, count: 2 },
    phases: [
      { at: 0, spawnInterval: 2.4, group: [3, 5], maxAlive: 16, weights: { drowned: 1, boarder: 0.6, musketeer: 0.35, crab: 0.4 } },
      { at: 30, spawnInterval: 2.1, group: [4, 6], maxAlive: 19, weights: { drowned: 1, boarder: 0.6, musketeer: 0.4, powderMonkey: 0.2, crab: 0.4 } },
      { at: 60, spawnInterval: 1.9, group: [4, 6], maxAlive: 21, weights: { drowned: 1, boarder: 0.7, musketeer: 0.45, powderMonkey: 0.25, quartermaster: 0.04 } },
    ],
  },
  {
    label: "Black Tide V", act: "Act II · The Galleon", subtitle: "The Broken Deck", zone: "deck",
    duration: 90, prespawn: 10, hpScale: 1.8, damageScale: 1.5, speedScale: 1.08,
    traps: { every: 13, kinds: ["sweep"], damage: 16 },
    phases: [
      { at: 0, spawnInterval: 2.2, group: [4, 6], maxAlive: 19, weights: { boarder: 1, drowned: 0.8, musketeer: 0.45, powderMonkey: 0.25, quartermaster: 0.06 } },
      { at: 35, spawnInterval: 1.9, group: [4, 7], maxAlive: 22, weights: { boarder: 1, drowned: 0.8, musketeer: 0.5, powderMonkey: 0.3, quartermaster: 0.1 } },
      { at: 70, spawnInterval: 1.7, group: [5, 7], maxAlive: 24, weights: { boarder: 1.1, drowned: 0.8, musketeer: 0.5, powderMonkey: 0.35, quartermaster: 0.13, barnacle: 0.04 } },
    ],
  },
  {
    // No boss: hold out in the dark while the hold floods.
    label: "Black Tide VI", act: "Act II · The Galleon", subtitle: "The Flooded Hold", zone: "hold",
    duration: 80, prespawn: 8, hpScale: 2.0, damageScale: 1.6, speedScale: 1.1,
    phases: [
      { at: 0, spawnInterval: 2.0, group: [4, 6], maxAlive: 20, weights: { drowned: 1, crab: 1, boarder: 0.4 } },
      { at: 30, spawnInterval: 1.8, group: [5, 7], maxAlive: 24, weights: { drowned: 1, crab: 1.2, boarder: 0.5, barnacle: 0.05 } },
      { at: 55, spawnInterval: 1.6, group: [5, 8], maxAlive: 27, weights: { drowned: 1.1, crab: 1.3, boarder: 0.6, powderMonkey: 0.2, barnacle: 0.08 } },
    ],
  },
  {
    label: "Black Tide VII", act: "Act III · The Black Flag", subtitle: "The Reef Shallows", zone: "shallows",
    duration: 85, prespawn: 8, hpScale: 2.2, damageScale: 1.7, speedScale: 1.12,
    // The tide rolls in across the bars.
    traps: { every: 12, kinds: ["tide"], damage: 18 },
    phases: [
      { at: 0, spawnInterval: 2.0, group: [4, 6], maxAlive: 20, weights: { drowned: 1, crab: 0.9, boarder: 0.6, musketeer: 0.4 } },
      { at: 30, spawnInterval: 1.8, group: [4, 7], maxAlive: 23, weights: { drowned: 1, crab: 0.9, boarder: 0.7, musketeer: 0.45, quartermaster: 0.1 } },
      { at: 60, spawnInterval: 1.6, group: [5, 7], maxAlive: 25, weights: { drowned: 1, crab: 1, boarder: 0.7, musketeer: 0.5, quartermaster: 0.13, barnacle: 0.06 } },
    ],
  },
  {
    label: "Black Tide VIII", act: "Act III · The Black Flag", subtitle: "The Cliff Fort", zone: "fort",
    duration: 95, prespawn: 10, hpScale: 2.45, damageScale: 1.8, speedScale: 1.14,
    // The fort's batteries fire on their own yard.
    meteors: { every: 10, damage: 20, radius: 2.3, count: 3 },
    phases: [
      { at: 0, spawnInterval: 2.0, group: [4, 6], maxAlive: 21, weights: { boarder: 1, musketeer: 0.6, powderMonkey: 0.4, drowned: 0.6, quartermaster: 0.1 } },
      { at: 35, spawnInterval: 1.8, group: [4, 7], maxAlive: 24, weights: { boarder: 1, musketeer: 0.7, powderMonkey: 0.45, quartermaster: 0.14, barnacle: 0.07 } },
      { at: 70, spawnInterval: 1.6, group: [5, 7], maxAlive: 27, weights: { boarder: 1.1, musketeer: 0.7, powderMonkey: 0.5, quartermaster: 0.16, barnacle: 0.1, drowned: 0.6 } },
    ],
  },
  {
    label: "Black Tide IX", act: "Act III · The Black Flag", subtitle: "Skull Rock", zone: "skull",
    duration: 35, prespawn: 6, hpScale: 2.5, damageScale: 1.85, speedScale: 1.16,
    traps: { every: 14, kinds: ["tide"], damage: 18 },
    phases: [
      { at: 0, spawnInterval: 2.4, group: [3, 4], maxAlive: 13, weights: { drowned: 1, crab: 0.8, boarder: 0.4, musketeer: 0.3 } },
    ],
    boss: { type: "seaHag", spawnFactor: 0.25 },
  },
  {
    label: "Black Tide X", act: "Finale · The Ghost Flagship", subtitle: "The Ghost Flagship", zone: "flagship",
    duration: 30, prespawn: 5, hpScale: 2.6, damageScale: 1.9, speedScale: 1.2, bossDamageScale: 1.35,
    // Broadsides from the ghost fleet keep falling on the deck.
    meteors: { every: 11, damage: 20, radius: 2.3, count: 3 },
    phases: [
      { at: 0, spawnInterval: 2.4, group: [3, 4], maxAlive: 13, weights: { boarder: 0.8, drowned: 0.6, musketeer: 0.4, crab: 0.5 } },
    ],
    boss: { type: "captain", spawnFactor: 0.25 },
  },
];

/** A run on the Black Tide: a rifle, a little cash, level 1. */
export const PIRATE_RUN = {
  startWeapon: "rifle" as const,
  startCash: 120,
  startPicks: 0,
  /** After this level (index) the pact is offered. */
  pactAfter: 6,
  /** Before this level (index) the final warning is shown. */
  finalLevel: 9,
  /** After the Bosun his sea chest offers one of these free. */
  armory: { after: 2, weapons: ["shotgun", "hellfire"] as const },
  text: {
    armory: ["THE BOSUN'S SEA CHEST", "Under the anchor chain, his chest: take one weapon - the other waits in the shop."] as [string, string],
    pact: ["THE BLACK SPOT", "On the fort's chart table someone has left you the black spot - and an offer. Choose one boon; its power costs you."] as [string, string],
    finalWarning: ["THE GHOST FLAGSHIP", "The Captain waits on his own deck, and something vast moves under the keel. Read the cutlass and the guns, and when the deck starts to shake - keep moving."] as [string, string],
  },
};

/** The Black Tide's difficulties (PIRATE_LEVELS are Hard; see HELL_DIFFICULTIES for the model). */
export const PIRATE_DIFFICULTIES: Record<"easy" | "hard" | "nightmare", DifficultyDef> = {
  easy: {
    label: "Easy",
    text: "Calm seas: slower crews, gentle tides, healing unbound.",
    levels: [
      undefined,
      { hpScale: 1.08, damageScale: 1.04 },
      { hpScale: 1.15, damageScale: 1.1, bossHpScale: 0.8 },
      { hpScale: 1.3, damageScale: 1.15, speedScale: 1, meteors: { every: 15, damage: 14, radius: 2.0, count: 1 } },
      { hpScale: 1.45, damageScale: 1.22, speedScale: 1, traps: undefined },
      { hpScale: 1.6, damageScale: 1.3, speedScale: 1 },
      { hpScale: 1.7, damageScale: 1.35, speedScale: 1, traps: { every: 18, kinds: ["tide"], damage: 12 } },
      { hpScale: 1.8, damageScale: 1.4, speedScale: 1, meteors: { every: 14, damage: 15, radius: 2.1, count: 2 } },
      { hpScale: 1.85, damageScale: 1.42, speedScale: 1, traps: undefined, bossHpScale: 0.75 },
      { hpScale: 1.9, damageScale: 1.45, speedScale: 1, bossDamageScale: 1, bossHpScale: 0.7, meteors: { every: 14, damage: 16, radius: 2.1, count: 2 } },
    ],
    cripple: false,
    followHero: 0,
  },
  hard: {
    label: "Hard",
    text: "The sea gives nothing back: cannon fire, tides, healing capped.",
    killHealPerSecond: 2.5,
    pickupHealMax: 30,
    cripple: true,
    followHero: 0.7,
  },
  nightmare: {
    label: "Nightmare",
    text: "Davy Jones keeps a locker with your name on it.",
    levels: [undefined, { traps: { every: 16, kinds: ["sweep"], damage: 12 } }, { traps: { every: 15, kinds: ["tide"], damage: 14 } }],
    scale: {
      hp: [1.15, 1.2, 1.2, 1.3, 1.3, 1.35, 1.35, 1.4, 1.4, 1.45],
      damage: [1.1, 1.1, 1.15, 1.2, 1.2, 1.25, 1.25, 1.3, 1.3, 1.3],
      speed: [1.03, 1.03, 1.03, 1.07, 1.07, 1.07, 1.07, 1.07, 1.07, 1.07],
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
