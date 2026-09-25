// HELL: the demon roster, the three bosses and the nine-level campaign, all as data. Every balance
// number for Hell lives in this file; the systems (EnemyManager, BossBrain, SpawnDirector, Gameplay)
// only read it. Models are built by scripts/build-demons.mjs (imp, puglin, fiend: Mixamo clips
// retargeted onto the Bestiary / Codersan rigs) and scripts/build-hell-creatures.mjs (drake, bat,
// husk: Quaternius clips); see assets-src/SOURCES.md.

import type { DifficultyDef, EnemyClips, EnemyDef, EnemyId, EnemyVisual, WaveDef } from "./config";

/* ------------------------------------------------------------------------------------------------
 * Looks
 * ---------------------------------------------------------------------------------------------- */

export type HellVisualId = "imp" | "puglin" | "fiend" | "drake" | "hellbat" | "husk";
export type HellSkinId =
  | "imp_red" | "imp_crimson" | "imp_black" | "imp_obsidian"
  | "pug_ember" | "pug_ash" | "pug_hide" | "pug_glutton"
  | "fiend_obsidian" | "fiend_archfiend"
  | "drake_crimson" | "drake_wyrm" | "bat_blood" | "husk_charred";

const skin = (id: HellSkinId) => `models/demons/skins/${id}.webp`;
export const HELL_SKINS: Record<HellSkinId, string> = {
  imp_red: skin("imp_red"), imp_crimson: skin("imp_crimson"), imp_black: skin("imp_black"), imp_obsidian: skin("imp_obsidian"),
  pug_ember: skin("pug_ember"), pug_ash: skin("pug_ash"), pug_hide: skin("pug_hide"), pug_glutton: skin("pug_glutton"),
  fiend_obsidian: skin("fiend_obsidian"), fiend_archfiend: skin("fiend_archfiend"),
  drake_crimson: skin("drake_crimson"), drake_wyrm: skin("drake_wyrm"), bat_blood: skin("bat_blood"), husk_charred: skin("husk_charred"),
};

/** Retargeted demon clips (scripts/build-demons.mjs). */
const DEMON_CLIPS: EnemyClips = {
  idle: "D_Idle", move: "D_Walk", attack: "D_Attack", hit: "D_Hit", death: ["D_Death", "D_DeathForward"],
  roar: "D_Roar", cast: "D_Cast", slam: "D_Slam",
};

export const HELL_VISUALS: Record<HellVisualId, EnemyVisual> = {
  // Bestiary imp: ~1.68 m native; a spiked mace in its right hand.
  imp: { url: "models/demons/imp.glb", scale: 1.04, clips: DEMON_CLIPS, moveSpeed: 1.0, skins: ["imp_red", "imp_crimson"] },
  // Bestiary puglin: squat and big-bellied, ~0.93 m native.
  puglin: { url: "models/demons/puglin.glb", scale: 1.0, clips: { ...DEMON_CLIPS, move: "D_Run" }, moveSpeed: 1.5, skins: ["pug_ember", "pug_ash"] },
  // Codersan alien monster: tall, clawed, spined; ~2 m native.
  fiend: {
    url: "models/demons/fiend.glb", scale: 0.9, clips: DEMON_CLIPS, moveSpeed: 1.4, skins: ["fiend_obsidian"],
    attachments: [
      // The archfiend's horns (from Inferno World's bone horn), only on the final boss.
      { bone: "mixamorig:Head", url: "models/demons/horn.glb", position: [0.07, 0.19, 0.02], rotation: [-20, 0, -28], scale: 0.036, only: ["archfiend"] },
      { bone: "mixamorig:Head", url: "models/demons/horn.glb", position: [-0.07, 0.19, 0.02], rotation: [-20, 0, 28], scale: 0.036, only: ["archfiend"] },
    ],
  },
  // Quaternius dragon: flying (clips loop in the air); ~3.9 m in its own units.
  drake: {
    url: "models/demons/drake.glb", scale: 0.45, moveSpeed: 6.5, skins: ["drake_crimson"],
    clips: {
      idle: "Dragon_Flying", move: "Dragon_Flying", attack: "Dragon_Attack", hit: "Dragon_Hit", death: ["Dragon_Death"], special: "Dragon_Attack2",
      roar: "Dragon_Attack2", cast: "Dragon_Attack", slam: "Dragon_Attack2",
    },
  },
  hellbat: {
    url: "models/demons/hellbat.glb", scale: 0.2, moveSpeed: 20, skins: ["bat_blood"],
    clips: { idle: "Bat_Flying", move: "Bat_Flying", attack: "Bat_Attack", hit: "Bat_Hit", death: ["Bat_Death"] },
  },
  // Quaternius skeleton: the caster, a charred husk with a fire orb in its hand.
  husk: {
    url: "models/demons/husk.glb", scale: 0.37, moveSpeed: 9, skins: ["husk_charred"],
    clips: { idle: "Skeleton_Idle", move: "Skeleton_Running", attack: "Skeleton_Attack", death: ["Skeleton_Death"], special: "Skeleton_Attack" },
    attachments: [{ bone: "R.DownLeg.001", color: [1.6, 0.55, 0.12], position: [0, 0.012, 0], scale: 0.006 }],
  },
};

/* ------------------------------------------------------------------------------------------------
 * Enemy archetypes. The player is ~1.95 m tall; the pistol does 14 per shot, the rifle 10.
 * Silhouettes carry the role: small + thin = fast, big + wide = tank, glowing hand = ranged,
 * wings = flying, black and glowing = elite.
 * ---------------------------------------------------------------------------------------------- */

export type HellEnemyId =
  | "imp" | "hound" | "husk" | "drake" | "hellbat" | "berserker" | "hellbrute" | "hellknight"
  | "glutton" | "wyrm" | "archfiend";

const EMBER = "ember" as const;

export const HELL_ENEMIES: Record<HellEnemyId, EnemyDef> = {
  // GRUNT: the basic demon. Medium speed, a mace swing; more HP than any zombie.
  imp: {
    label: "Imp", visuals: ["imp"], scale: 1.0, scaleJitter: 0.05, behavior: "chaser", deathFx: EMBER,
    maxHp: 70, speed: 1.9, radius: 0.38, damage: 12, attackRange: 1.25, attackWindup: 0.4, attackCooldown: 1.1,
    cash: 2, xp: 14, drops: { cash: 0.45, health: 0.02, upgrade: 0.006 },
  },
  // HOUND: small, very fast, weak; comes in packs and punishes standing still.
  hound: {
    label: "Hellhound", visuals: ["puglin"], scale: 1.1, scaleJitter: 0.06, behavior: "chaser", deathFx: EMBER,
    maxHp: 36, speed: 5.0, radius: 0.34, damage: 9, attackRange: 1.05, attackWindup: 0.22, attackCooldown: 0.8,
    // Its bite cripples: running away from a pack gets harder.
    cripple: { slow: 0.65, seconds: 1.1 },
    cash: 1, xp: 14, drops: { cash: 0.35, health: 0.02, upgrade: 0.006 },
  },
  // SPITTER / CASTER: keeps 6-11 m away and throws slow fire bolts - dodge sideways.
  husk: {
    label: "Burning Husk", visuals: ["husk"], scale: 1.0, behavior: "caster", deathFx: EMBER,
    maxHp: 55, speed: 1.7, radius: 0.36, damage: 8, attackRange: 1.1, attackWindup: 0.4, attackCooldown: 1.3,
    cash: 2, xp: 22, drops: { cash: 0.55, health: 0.04, upgrade: 0.01 },
    bolt: { damage: 12, speed: 6.0, radius: 0.32, cooldown: 3.0, minRange: 5.5, maxRange: 11, count: 1, spreadDeg: 0, windup: 0.55 },
  },
  // FLYING DEMON: circles above everything (lava, walls), spits fire, sometimes dives through.
  drake: {
    label: "Hell Drake", visuals: ["drake"], scale: 1.0, behavior: "flyer", deathFx: EMBER, aimHeight: 0.4,
    maxHp: 80, speed: 3.2, radius: 0.5, damage: 12, attackRange: 1.3, attackWindup: 0.35, attackCooldown: 1.2,
    cash: 3, xp: 30, drops: { cash: 0.6, health: 0.04, upgrade: 0.012 },
    bolt: { damage: 14, speed: 7, radius: 0.34, cooldown: 3.0, minRange: 3, maxRange: 11, count: 1, spreadDeg: 0, windup: 0.45 },
    fly: { height: 2.3, orbit: 6.5, dive: { cooldown: 8.5, telegraph: 0.9, speed: 13, distance: 12, damage: 14 } },
  },
  // Swarm: weak, fast, low flyers - dangerous in numbers.
  hellbat: {
    label: "Hellbat", visuals: ["hellbat"], scale: 1.0, scaleJitter: 0.08, behavior: "flyer", deathFx: EMBER, aimHeight: 0.3,
    maxHp: 16, speed: 4.6, radius: 0.3, damage: 6, attackRange: 0.95, attackWindup: 0.2, attackCooldown: 0.9,
    cash: 0, xp: 5, drops: { cash: 0.1, health: 0.01, upgrade: 0.002 },
    fly: { height: 1.3, orbit: 0 },
  },
  // BERSERKER: a black imp, fast and relentless; enrages at half HP.
  berserker: {
    label: "Berserker", visuals: ["imp"], scale: 1.08, behavior: "chaser", deathFx: EMBER, glow: [2.2, 0.5, 0.2],
    maxHp: 115, speed: 3.1, radius: 0.4, damage: 15, attackRange: 1.25, attackWindup: 0.25, attackCooldown: 0.55,
    cash: 3, xp: 32, drops: { cash: 0.6, health: 0.05, upgrade: 0.012 },
    clips: { move: "D_Run", attack: "D_AttackFast" },
    enrage: { below: 0.5, speed: 1.45, cooldown: 0.6 },
  },
  // BRUTE: huge and wide, slow, a heavy smash that throws the hero back, and a ground slam.
  hellbrute: {
    label: "Hellbrute", visuals: ["puglin"], scale: 2.2, behavior: "chaser", deathFx: EMBER, armor: 0.15,
    maxHp: 420, speed: 1.3, radius: 0.85, damage: 26, attackRange: 2.1, attackWindup: 0.7, attackCooldown: 1.7, knockback: 7,
    cash: 8, xp: 70, drops: { cash: 1, health: 0.25, upgrade: 0.04 },
    clips: { move: "D_Walk", attack: "D_Smash", special: "D_Slam", hit: undefined },
    slam: { cooldown: 8, telegraph: 1.05, radius: 3.2, damage: 22, triggerRange: 3 },
  },
  // ELITE: the Hell Knight - obsidian armour (40% damage ignored), glowing veins, a charge.
  hellknight: {
    label: "Hell Knight", visuals: ["fiend"], scale: 1.22, behavior: "charger", deathFx: EMBER, armor: 0.4, glow: [1.6, 0.6, 0.2],
    maxHp: 320, speed: 2.1, radius: 0.55, damage: 20, attackRange: 1.6, attackWindup: 0.45, attackCooldown: 1.0, knockback: 4,
    cash: 10, xp: 65, drops: { cash: 1, health: 0.3, upgrade: 0.05 },
    clips: { special: "D_Charge", hit: undefined },
    charge: { cooldown: 7, telegraph: 0.85, speed: 11, distance: 9, recover: 1.0, damage: 24 },
  },

  /* ---------------------------------------------------------------- bosses (see HELL_BOSSES) */
  // BOSS 1 - The Glutton: a bloated giant puglin. Heavy smash, charge, slam, calls imps.
  glutton: {
    label: "The Glutton", visuals: ["puglin"], scale: 3.6, behavior: "boss", script: "glutton", boss: true, deathFx: EMBER,
    maxHp: 2800, speed: 1.6, radius: 1.3, damage: 30, attackRange: 3.0, attackWindup: 0.75, attackCooldown: 1.6, knockback: 8,
    cash: 60, xp: 200, drops: { cash: 1, health: 1, upgrade: 0 },
    clips: { move: "D_Walk", attack: "D_Smash", special: "D_Charge", hit: undefined },
  },
  // BOSS 2 - The Infernal Wyrm: a giant drake. Fireball volleys, meteor rain, dives; phase 2 at 50%.
  wyrm: {
    label: "The Infernal Wyrm", visuals: ["drake"], scale: 2.7, behavior: "boss", script: "wyrm", boss: true, deathFx: EMBER, aimHeight: 0.4,
    maxHp: 6000, speed: 3.4, radius: 1.3, damage: 24, attackRange: 3.2, attackWindup: 0.5, attackCooldown: 1.4,
    cash: 90, xp: 320, drops: { cash: 1, health: 1, upgrade: 0 },
    fly: { height: 2.2, orbit: 6.5 },
  },
  // FINAL BOSS - The Archfiend: a horned giant fiend. Three phases (65% / 30%).
  archfiend: {
    label: "The Archfiend", visuals: ["fiend"], scale: 3.3, behavior: "boss", script: "archfiend", boss: true, deathFx: EMBER, glow: [2.2, 0.8, 0.25],
    maxHp: 24000, speed: 2.0, radius: 1.35, damage: 34, attackRange: 3.3, attackWindup: 0.55, attackCooldown: 1.2, knockback: 8,
    cash: 150, xp: 500, drops: { cash: 1, health: 1, upgrade: 0 },
    clips: { hit: undefined, special: "D_Charge" },
  },
};

/** Skins per enemy type (overriding the look's own list; e.g. the berserker is always black). */
export const HELL_TYPE_SKINS: Partial<Record<HellEnemyId, HellSkinId[]>> = {
  berserker: ["imp_black"],
  hellbrute: ["pug_hide"],
  hound: ["pug_ember", "pug_ash"],
  hellknight: ["fiend_obsidian"],
  glutton: ["pug_glutton"],
  wyrm: ["drake_wyrm"],
  archfiend: ["fiend_archfiend"],
};

/* ------------------------------------------------------------------------------------------------
 * Bosses (gameplay/BossBrain.ts). A boss runs its phases in order; each phase has an attack cycle
 * (picked in order, with `cadence` seconds between attacks) and speed / cadence multipliers. Every
 * attack is telegraphed (rings that fill, lanes, a glowing wind-up); the numbers here are the whole
 * fight. Phase changes: the boss roars (invulnerable while it roars), the arena reacts.
 * ---------------------------------------------------------------------------------------------- */

export type BossAttack =
  /** Melee strike(s) in front: `hits` swings, each with a `windup`. */
  | { kind: "melee"; hits: number; windup: number; range: number; damage: number }
  /** Ground slam: a filling ring around the boss, then the hit (and optional fire left behind). */
  | { kind: "slam"; telegraph: number; radius: number; damage: number; fire?: number }
  /** Charge: faces the player, a lane shows, then a dash; winded (+50% damage taken) after. */
  | { kind: "charge"; telegraph: number; speed: number; distance: number; damage: number; recover: number; repeat?: number }
  /** Fireball volley aimed at the player: `count` bolts fanned over `spreadDeg`, `volleys` times. */
  | { kind: "volley"; windup: number; count: number; spreadDeg: number; speed: number; damage: number; volleys: number; gap: number }
  /** Radial burst: `count` bolts in a full circle, `rings` times (alternate rings are offset). */
  | { kind: "radial"; windup: number; count: number; speed: number; damage: number; rings: number; gap: number; spiral?: number }
  /** Meteors: `count` strikes around / on the player (one always on the player's spot). */
  | { kind: "meteors"; count: number; radius: number; delay: number; damage: number; spread: number; fire: number; gap: number }
  /** Lava eruption: a line of strikes from the boss towards the player. */
  | { kind: "eruption"; count: number; radius: number; delay: number; damage: number; spacing: number; fire: number }
  /** Summon: portals open around the boss, demons step out. */
  | { kind: "summon"; enemies: { type: EnemyId; count: number }[]; radius: number; portal: number }
  /** Flying dive at the player (the wyrm). */
  | { kind: "dive"; telegraph: number; speed: number; distance: number; damage: number };

export interface BossPhase {
  /** Phase starts when HP falls to this fraction (the first phase: 1). */
  below: number;
  /** Seconds between the end of one attack and the start of the next. */
  cadence: number;
  /** Movement speed multiplier. */
  speed: number;
  attacks: BossAttack[];
  /** On entering: roar (seconds, invulnerable), arena effect intensity 0..1, banner text. */
  enter?: { roar: number; arena: number; banner: string };
}

export const HELL_BOSSES: Record<string, BossPhase[]> = {
  // Teaches: watch the wind-up, step out of the ring, punish the winded charge.
  glutton: [
    {
      below: 1, cadence: 1.5, speed: 1,
      attacks: [
        { kind: "melee", hits: 1, windup: 0.75, range: 3.2, damage: 30 },
        { kind: "charge", telegraph: 1.1, speed: 13, distance: 15, damage: 32, recover: 1.8 },
        { kind: "slam", telegraph: 1.25, radius: 4.2, damage: 30 },
        { kind: "melee", hits: 1, windup: 0.75, range: 3.2, damage: 30 },
        { kind: "summon", enemies: [{ type: "imp", count: 3 }], radius: 3.5, portal: 1.2 },
      ],
    },
    {
      below: 0.5, cadence: 1.1, speed: 1.2, enter: { roar: 1.6, arena: 0.6, banner: "The Glutton is enraged" },
      attacks: [
        { kind: "charge", telegraph: 0.95, speed: 14, distance: 15, damage: 34, recover: 1.4, repeat: 2 },
        { kind: "slam", telegraph: 1.1, radius: 4.8, damage: 32, fire: 4 },
        { kind: "melee", hits: 2, windup: 0.6, range: 3.2, damage: 28 },
        { kind: "summon", enemies: [{ type: "imp", count: 2 }, { type: "hound", count: 3 }], radius: 4, portal: 1.1 },
      ],
    },
  ],
  // Keeps its distance in the air: read the fireball fans, leave the meteor rings, stay out of fire.
  wyrm: [
    {
      below: 1, cadence: 1.4, speed: 1,
      attacks: [
        { kind: "volley", windup: 0.7, count: 3, spreadDeg: 28, speed: 7.5, damage: 18, volleys: 2, gap: 0.55 },
        { kind: "meteors", count: 3, radius: 2.2, delay: 1.3, damage: 24, spread: 5, fire: 5, gap: 0.3 },
        { kind: "dive", telegraph: 1.0, speed: 15, distance: 16, damage: 28 },
        { kind: "volley", windup: 0.6, count: 5, spreadDeg: 50, speed: 7, damage: 16, volleys: 1, gap: 0 },
      ],
    },
    {
      below: 0.5, cadence: 1.0, speed: 1.2, enter: { roar: 1.8, arena: 0.8, banner: "The sky burns" },
      attacks: [
        { kind: "radial", windup: 0.8, count: 14, speed: 6.5, damage: 18, rings: 2, gap: 0.6 },
        { kind: "meteors", count: 5, radius: 2.4, delay: 1.2, damage: 26, spread: 6, fire: 6, gap: 0.25 },
        { kind: "summon", enemies: [{ type: "hellbat", count: 6 }, { type: "drake", count: 1 }], radius: 5, portal: 1.0 },
        { kind: "dive", telegraph: 0.85, speed: 16, distance: 17, damage: 30 },
        { kind: "volley", windup: 0.5, count: 5, spreadDeg: 60, speed: 8, damage: 18, volleys: 3, gap: 0.45 },
      ],
    },
  ],
  // The final exam: every lesson at once, then faster.
  archfiend: [
    {
      // PHASE 1 - THE DEMON
      below: 1, cadence: 1.3, speed: 1,
      attacks: [
        { kind: "melee", hits: 3, windup: 0.5, range: 3.4, damage: 30 },
        { kind: "volley", windup: 0.7, count: 5, spreadDeg: 44, speed: 7.5, damage: 20, volleys: 2, gap: 0.5 },
        { kind: "charge", telegraph: 1.0, speed: 14, distance: 16, damage: 36, recover: 1.4 },
        { kind: "slam", telegraph: 1.15, radius: 4.6, damage: 36 },
      ],
    },
    {
      // PHASE 2 - THE ARENA CHANGES
      below: 0.65, cadence: 1.05, speed: 1.1, enter: { roar: 2.2, arena: 0.7, banner: "The pentagram awakens" },
      attacks: [
        { kind: "radial", windup: 0.8, count: 16, speed: 6.5, damage: 20, rings: 2, gap: 0.55 },
        { kind: "melee", hits: 3, windup: 0.45, range: 3.4, damage: 32 },
        { kind: "eruption", count: 7, radius: 1.7, delay: 1.0, damage: 30, spacing: 2.2, fire: 4 },
        { kind: "summon", enemies: [{ type: "imp", count: 3 }, { type: "husk", count: 2 }], radius: 5, portal: 1.1 },
        { kind: "meteors", count: 5, radius: 2.3, delay: 1.2, damage: 28, spread: 6, fire: 5, gap: 0.25 },
        { kind: "charge", telegraph: 0.9, speed: 15, distance: 16, damage: 36, recover: 1.1 },
      ],
    },
    {
      // PHASE 3 - RAGE
      below: 0.3, cadence: 0.75, speed: 1.35, enter: { roar: 2.4, arena: 1, banner: "RAGE" },
      attacks: [
        { kind: "charge", telegraph: 0.8, speed: 16, distance: 17, damage: 38, recover: 0.8, repeat: 2 },
        { kind: "slam", telegraph: 0.95, radius: 5.2, damage: 38, fire: 5 },
        { kind: "radial", windup: 0.65, count: 18, speed: 7, damage: 22, rings: 3, gap: 0.45, spiral: 10 },
        { kind: "summon", enemies: [{ type: "hellknight", count: 1 }, { type: "berserker", count: 2 }], radius: 5, portal: 1.2 },
        { kind: "meteors", count: 7, radius: 2.4, delay: 1.1, damage: 30, spread: 7, fire: 6, gap: 0.2 },
        { kind: "melee", hits: 3, windup: 0.4, range: 3.4, damage: 34 },
        { kind: "eruption", count: 9, radius: 1.8, delay: 0.95, damage: 32, spacing: 2.2, fire: 5 },
      ],
    },
  ],
};

/* ------------------------------------------------------------------------------------------------
 * The campaign: nine levels in three acts (medium / hard / boss each). Difficulty comes from what
 * arrives together (melee pressure + ranged + flyers + elites), how fast and from where - not
 * mostly from HP. `zone` names a part of the Hell map (world/level/HellLevel.ts).
 * ---------------------------------------------------------------------------------------------- */

export const HELL_LEVELS: WaveDef[] = [
  // ACT I - THE DESCENT
  {
    label: "Hell I", act: "Act I · The Descent", subtitle: "The Gates of Hell", zone: "gates",
    duration: 70, prespawn: 6, hpScale: 1, damageScale: 1,
    phases: [
      { at: 0, spawnInterval: 3.0, group: [2, 3], maxAlive: 10, weights: { imp: 1 } },
      { at: 20, spawnInterval: 2.6, group: [3, 4], maxAlive: 14, weights: { imp: 1, hound: 0.2 } },
      { at: 45, spawnInterval: 2.2, group: [3, 5], maxAlive: 17, weights: { imp: 1, hound: 0.35 } },
    ],
  },
  {
    label: "Hell II", act: "Act I · The Descent", subtitle: "The Infernal Wastes", zone: "wastes",
    duration: 85, prespawn: 8, hpScale: 1.15, damageScale: 1.1,
    phases: [
      { at: 0, spawnInterval: 2.6, group: [3, 4], maxAlive: 14, weights: { imp: 1, hound: 0.5 } },
      { at: 20, spawnInterval: 2.5, group: [3, 5], maxAlive: 16, weights: { imp: 1, hound: 0.6, husk: 0.25 } },
      { at: 55, spawnInterval: 2.1, group: [4, 6], maxAlive: 19, weights: { imp: 1, hound: 0.7, husk: 0.32, berserker: 0.1 } },
    ],
  },
  {
    label: "Hell III", act: "Act I · The Descent", subtitle: "The Sacrificial Pentagram", zone: "pentagram",
    duration: 40, prespawn: 6, hpScale: 1.25, damageScale: 1.15,
    phases: [
      { at: 0, spawnInterval: 2.6, group: [3, 4], maxAlive: 14, weights: { imp: 1, hound: 0.5, husk: 0.3 } },
    ],
    boss: { type: "glutton", spawnFactor: 0.35 },
  },
  // ACT II - THE BURNING CITADEL
  {
    label: "Hell IV", act: "Act II · The Burning Citadel", subtitle: "The Lava Crossing", zone: "crossing",
    duration: 90, prespawn: 8, hpScale: 1.6, damageScale: 1.3, speedScale: 1.08,
    traps: { every: 14, kinds: ["tar", "sweep"], damage: 16 },
    phases: [
      { at: 0, spawnInterval: 2.5, group: [3, 5], maxAlive: 16, weights: { imp: 1, hound: 0.5, husk: 0.4, drake: 0.15 } },
      { at: 30, spawnInterval: 2.2, group: [3, 5], maxAlive: 19, weights: { imp: 1, hound: 0.6, husk: 0.5, drake: 0.3 } },
      { at: 65, spawnInterval: 1.9, group: [4, 6], maxAlive: 22, weights: { imp: 1, hound: 0.6, husk: 0.5, drake: 0.35, berserker: 0.2 } },
    ],
  },
  {
    label: "Hell V", act: "Act II · The Burning Citadel", subtitle: "The Citadel Approach", zone: "approach",
    duration: 100, prespawn: 10, hpScale: 2.0, damageScale: 1.5, speedScale: 1.1,
    traps: { every: 12, kinds: ["tar", "sweep", "cage"], damage: 18 },
    phases: [
      { at: 0, spawnInterval: 2.3, group: [3, 5], maxAlive: 18, weights: { imp: 1, husk: 0.6, drake: 0.3, berserker: 0.3 } },
      { at: 30, spawnInterval: 2.1, group: [4, 6], maxAlive: 21, weights: { imp: 1, hound: 0.5, husk: 0.6, drake: 0.35, berserker: 0.35, hellbrute: 0.08 } },
      { at: 70, spawnInterval: 1.8, group: [4, 6], maxAlive: 24, weights: { imp: 1, hound: 0.6, husk: 0.7, drake: 0.4, berserker: 0.45, hellbrute: 0.12, hellknight: 0.06 } },
    ],
  },
  {
    label: "Hell VI", act: "Act II · The Burning Citadel", subtitle: "The Citadel", zone: "citadel",
    duration: 45, prespawn: 8, hpScale: 2.3, damageScale: 1.6, speedScale: 1.12, bossDamageScale: 1.4,
    traps: { every: 13, kinds: ["tar", "cage"], damage: 18 },
    phases: [
      { at: 0, spawnInterval: 2.3, group: [3, 5], maxAlive: 16, weights: { imp: 1, husk: 0.6, berserker: 0.35, hellbat: 0.8 } },
    ],
    boss: { type: "wyrm", spawnFactor: 0.3 },
  },
  // ACT III - THE ABYSS
  {
    label: "Hell VII", act: "Act III · The Abyss", subtitle: "Deep Hell", zone: "abyss",
    duration: 110, prespawn: 10, hpScale: 3.0, damageScale: 2.0, speedScale: 1.18,
    traps: { every: 9, kinds: ["tar", "sweep", "cage", "cage"], damage: 20 },
    phases: [
      { at: 0, spawnInterval: 2.2, group: [4, 6], maxAlive: 20, weights: { imp: 1, husk: 0.7, drake: 0.4, berserker: 0.5, hellbat: 0.7, hellbrute: 0.1 } },
      { at: 35, spawnInterval: 2.0, group: [4, 6], maxAlive: 23, weights: { imp: 1, hound: 0.6, husk: 0.8, drake: 0.45, berserker: 0.55, hellbrute: 0.14, hellknight: 0.1 } },
      { at: 80, spawnInterval: 1.7, group: [5, 7], maxAlive: 26, weights: { imp: 0.8, hound: 0.7, husk: 0.9, drake: 0.5, berserker: 0.6, hellbat: 0.8, hellbrute: 0.16, hellknight: 0.14 } },
    ],
    meteors: { every: 9, damage: 22, radius: 2.2, count: 3 },
  },
  {
    label: "Hell VIII", act: "Act III · The Abyss", subtitle: "The Final Approach", zone: "brink",
    duration: 120, prespawn: 12, hpScale: 3.6, damageScale: 2.3, speedScale: 1.22,
    traps: { every: 8, kinds: ["tar", "sweep", "cage", "sweep"], damage: 22 },
    phases: [
      { at: 0, spawnInterval: 2.0, group: [4, 6], maxAlive: 23, weights: { imp: 0.8, hound: 0.7, husk: 0.9, drake: 0.5, berserker: 0.6, hellbrute: 0.15, hellknight: 0.12 } },
      { at: 40, spawnInterval: 1.8, group: [5, 7], maxAlive: 26, weights: { imp: 0.7, hound: 0.8, husk: 1, drake: 0.6, berserker: 0.7, hellbat: 0.9, hellbrute: 0.2, hellknight: 0.18 } },
      { at: 90, spawnInterval: 1.55, group: [5, 8], maxAlive: 28, weights: { imp: 0.6, hound: 0.9, husk: 1, drake: 0.7, berserker: 0.8, hellbat: 1, hellbrute: 0.24, hellknight: 0.22 } },
    ],
    meteors: { every: 7, damage: 26, radius: 2.3, count: 4 },
  },
  {
    label: "Hell IX", act: "Act III · The Abyss", subtitle: "The Throne of the Archfiend", zone: "throne",
    duration: 30, prespawn: 8, hpScale: 4.0, damageScale: 2.5, speedScale: 1.25, bossDamageScale: 1.8,
    traps: { every: 10, kinds: ["tar", "sweep", "cage"], damage: 24 },
    phases: [
      { at: 0, spawnInterval: 2.2, group: [3, 5], maxAlive: 16, weights: { imp: 1, husk: 0.8, berserker: 0.5, hellbat: 0.6 } },
    ],
    boss: { type: "archfiend", spawnFactor: 0.25 },
  },
];

/**
 * Hell starts a run with a rifle and some cash (the hero came through Earth and ORION), at level 1:
 * the build grows from the demons killed. The Infernal Armory after the first boss, the Infernal
 * Pact before Act III and a final warning before the last level.
 */
export const HELL_RUN = {
  startWeapon: "rifle" as const,
  startCash: 120,
  /** Level-up choices offered at the start (0: none; the run starts at level 1). */
  startPicks: 0,
  /** After this level (index) the Infernal Pact is offered (one build-defining upgrade). */
  pactAfter: 5,
  /** Before this level (index) the final warning is shown. */
  finalLevel: 8,
  /** After this level (index; the Glutton) the Infernal Armory offers one of these free. */
  armory: { after: 2, weapons: ["plasma", "hellfire"] as const },
  text: {
    armory: ["THE INFERNAL ARMORY", "The Glutton guarded a cache of hellforged rifles. Take one - the other waits in the shop."] as [string, string],
    pact: ["THE INFERNAL PACT", "Deeper Hell will test your build. Choose one pact - its power has a price."] as [string, string],
    finalWarning: ["THE FINAL ENCOUNTER", "The Archfiend waits on its throne. There is no way back and no second chance: read its attacks, move, and trust your build."] as [string, string],
  },
};

/**
 * Hell's difficulties. HELL_LEVELS are Hard. Easy is Hell as first balanced (gentler scaling, no
 * traps, bosses at their old strength, healing unbound). Nightmare is built to be all but
 * impossible: the final level falls to maybe one run in a hundred, with the right build played
 * nearly perfectly.
 */
export const HELL_DIFFICULTIES: Record<"easy" | "hard" | "nightmare", DifficultyDef> = {
  easy: {
    label: "Easy",
    text: "Hell as it was first forged: gentler demons, no traps, healing unbound.",
    levels: [
      { hpScale: 1, damageScale: 1 },
      { hpScale: 1.1, damageScale: 1.05 },
      { hpScale: 1.15, damageScale: 1.1, speedScale: 1, bossDamageScale: 1 },
      { hpScale: 1.3, damageScale: 1.1, speedScale: 1, traps: undefined },
      { hpScale: 1.5, damageScale: 1.25, speedScale: 1, traps: undefined },
      { hpScale: 1.6, damageScale: 1.3, speedScale: 1, traps: undefined, bossDamageScale: 1, bossHpScale: 4400 / 6000 },
      { hpScale: 1.9, damageScale: 1.4, speedScale: 1, traps: undefined, meteors: { every: 11, damage: 22, radius: 2.2, count: 2 } },
      { hpScale: 2.2, damageScale: 1.55, speedScale: 1, traps: undefined, meteors: { every: 8, damage: 26, radius: 2.3, count: 3 } },
      { hpScale: 2.3, damageScale: 1.6, speedScale: 1, traps: undefined, bossDamageScale: 1, bossHpScale: 17500 / 24000 },
    ],
    cripple: false,
    followHero: 0,
  },
  hard: {
    label: "Hard",
    text: "Act III is a nightmare: traps, relentless demons, healing capped. The right build and good feet win.",
    killHealPerSecond: 2.5,
    pickupHealMax: 30,
    cripple: true,
    followHero: 0.7,
  },
  nightmare: {
    label: "Nightmare",
    text: "Built to kill you. Maybe one run in a hundred sees the Archfiend fall.",
    // Traps from the first act on.
    levels: [
      undefined,
      { traps: { every: 16, kinds: ["tar", "sweep"], damage: 12 } },
      { traps: { every: 15, kinds: ["tar", "sweep"], damage: 14 } },
    ],
    scale: {
      hp: [1.15, 1.2, 1.2, 1.25, 1.25, 1.3, 1.3, 1.3, 1.4],
      damage: [1.1, 1.1, 1.15, 1.15, 1.2, 1.2, 1.2, 1.2, 1.3],
      speed: [1.03, 1.03, 1.03, 1.05, 1.05, 1.05, 1.07, 1.07, 1.07],
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
