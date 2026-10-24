// THE DARK KINGDOM: the medieval chapter - a plague-struck realm where the dead rise. Seven levels
// from a burned village to the throne yard of a fallen king (world/level/MedievalLevel.ts). The
// roster: risen skeletons, plague ghouls, hooded cultist monks, bone mages, skeleton warriors,
// black knights and the executioner; two bosses - the Mad Abbot and the Fallen King.
// Bodies are KayKit "Adventurers" / "Skeletons" characters (CC0, Kay Lousberg), built by
// scripts/build-medieval-creatures.mjs. All data, like hellConfig.ts / spaceConfig.ts.

import type { BossPhase } from "./hellConfig";
import type { DifficultyDef, EnemyAttachment, EnemyDef, EnemyVisual, WaveDef } from "./config";

/* ------------------------------------------------------------------------------------------------
 * Looks
 * ---------------------------------------------------------------------------------------------- */

export type MedievalVisualId =
  | "mdKnight" | "mdKing" | "mdMonk" | "mdGhoul" | "mdExecutioner"
  | "mdSkeleton" | "mdSkeletonWarrior" | "mdSkeletonMage" | "mdSkeletonRogue";

export type MedievalSkinId =
  | "knight_black" | "knight_rust" | "knight_grave" | "king_fallen"
  | "monk_brown" | "monk_black" | "abbot_crimson"
  | "ghoul_rot" | "ghoul_pale" | "ghoul_plague" | "exec_black"
  | "bone_old" | "bone_grave" | "bone_warrior" | "bone_rust" | "bone_mage" | "bone_rogue";

const skin = (id: MedievalSkinId) => `models/medieval/skins/${id}.webp`;
export const MEDIEVAL_SKINS: Record<MedievalSkinId, string> = {
  knight_black: skin("knight_black"), knight_rust: skin("knight_rust"), knight_grave: skin("knight_grave"), king_fallen: skin("king_fallen"),
  monk_brown: skin("monk_brown"), monk_black: skin("monk_black"), abbot_crimson: skin("abbot_crimson"),
  ghoul_rot: skin("ghoul_rot"), ghoul_pale: skin("ghoul_pale"), ghoul_plague: skin("ghoul_plague"), exec_black: skin("exec_black"),
  bone_old: skin("bone_old"), bone_grave: skin("bone_grave"), bone_warrior: skin("bone_warrior"), bone_rust: skin("bone_rust"),
  bone_mage: skin("bone_mage"), bone_rogue: skin("bone_rogue"),
};

/** Weapons on the skeletons' hand slots (the KayKit rig's handslot bones). */
const W = (file: string, bone: "handslot.r" | "handslot.l"): EnemyAttachment => ({ bone, url: `models/medieval/weapons/${file}.glb` });

// KayKit bodies are ~2.2-2.6 units tall (big heads); `scale` brings each to the common ~1.75 m.
export const MEDIEVAL_VISUALS: Record<MedievalVisualId, EnemyVisual> = {
  // Black knight: sword and round shield, plate armour.
  mdKnight: {
    url: "models/medieval/knight.glb", scale: 0.72, moveSpeed: 1.25, skins: ["knight_black", "knight_rust", "knight_grave"],
    clips: { idle: "Idle", move: "Walking_A", attack: "1H_Melee_Attack_Chop", hit: "Block_Hit", death: ["Death_A", "Death_B"], special: "Dodge_Forward" },
  },
  // The Fallen King: the knight with a two-handed greatsword and a cape (boss).
  mdKing: {
    url: "models/medieval/king.glb", scale: 0.72, moveSpeed: 1.2, skins: ["king_fallen"],
    clips: { idle: "2H_Melee_Idle", move: "Walking_B", attack: "2H_Melee_Attack_Chop", hit: "Hit_A", death: ["Death_A"], special: "2H_Melee_Attack_Slice", roar: "Cheer", cast: "Spellcast_Summon", slam: "Jump_Land" },
  },
  // Hooded cultist monk: casts from range, robes in brown or black (the Mad Abbot in crimson).
  mdMonk: {
    url: "models/medieval/monk.glb", scale: 0.78, moveSpeed: 1.15, skins: ["monk_brown", "monk_black"],
    clips: { idle: "Idle", move: "Walking_C", attack: "Unarmed_Melee_Attack_Punch_A", hit: "Hit_A", death: ["Death_A", "Death_B"], special: "Spellcast_Shoot", roar: "Cheer", cast: "Spellcast_Long", slam: "Spellcast_Raise" },
    attachments: [{ bone: "handslot.r", color: [1.3, 0.55, 2.0], position: [0, 0.08, 0], scale: 0.12 }],
  },
  // Plague ghoul: a villager the sickness took - shambling, bare-handed.
  mdGhoul: {
    url: "models/medieval/ghoul.glb", scale: 0.8, moveSpeed: 1.1, skins: ["ghoul_rot", "ghoul_pale", "ghoul_plague"], bulk: 1.05,
    clips: { idle: "Idle", move: "Walking_C", attack: "Unarmed_Melee_Attack_Punch_A", hit: "Hit_B", death: ["Death_A", "Death_B"], special: "Unarmed_Melee_Attack_Punch_B" },
  },
  // The executioner: hooded, a huge two-handed axe.
  mdExecutioner: {
    url: "models/medieval/executioner.glb", scale: 0.73, moveSpeed: 1.2, skins: ["exec_black"], bulk: 1.15,
    clips: { idle: "2H_Melee_Idle", move: "Walking_B", attack: "2H_Melee_Attack_Chop", hit: "Hit_A", death: ["Death_A"], special: "2H_Melee_Attack_Spin", slam: "Jump_Land" },
  },
  // Risen skeleton: the grunt, crawling out of every grave.
  mdSkeleton: {
    url: "models/medieval/skeleton.glb", scale: 0.8, moveSpeed: 1.2, skins: ["bone_old", "bone_grave"],
    clips: { idle: "Idle", move: "Walking_D_Skeletons", attack: "Unarmed_Melee_Attack_Punch_A", hit: "Hit_A", death: ["Death_C_Skeletons", "Death_A"], special: "Spawn_Ground_Skeletons" },
  },
  // Skeleton warrior: blade and shield, helmet.
  mdSkeletonWarrior: {
    url: "models/medieval/skeletonWarrior.glb", scale: 0.68, moveSpeed: 1.2, skins: ["bone_warrior", "bone_rust"],
    clips: { idle: "Idle_Combat", move: "Walking_D_Skeletons", attack: "1H_Melee_Attack_Chop", hit: "Block_Hit", death: ["Death_C_Skeletons", "Death_A"], special: "1H_Melee_Attack_Jump_Chop" },
    attachments: [W("blade", "handslot.r"), W("shield", "handslot.l")],
  },
  // Bone mage: a skeleton under a witch's hat with a staff - volleys of grave-fire.
  mdSkeletonMage: {
    url: "models/medieval/skeletonMage.glb", scale: 0.72, moveSpeed: 1.2, skins: ["bone_mage"],
    clips: { idle: "Idle", move: "Walking_D_Skeletons", attack: "Spellcast_Shoot", hit: "Hit_A", death: ["Death_C_Skeletons"], special: "Spellcast_Shoot", cast: "Spellcast_Raise" },
    attachments: [W("staff", "handslot.r")],
  },
  // Skeleton cutthroat: hooded, quick, a blade - runs the hero down.
  mdSkeletonRogue: {
    url: "models/medieval/skeletonRogue.glb", scale: 0.76, moveSpeed: 3.0, skins: ["bone_rogue"],
    clips: { idle: "Idle_Combat", move: "Running_C", attack: "1H_Melee_Attack_Stab", hit: "Hit_A", death: ["Death_C_Skeletons", "Death_A"], special: "1H_Melee_Attack_Slice_Diagonal" },
    attachments: [W("blade", "handslot.r")],
  },
};

/* ------------------------------------------------------------------------------------------------
 * Enemy archetypes (the player is ~1.95 m tall; the rifle does 10 per shot). Silhouettes carry the
 * role: bones = fodder, hoods = casters, plate = elites, the axe = the brute.
 * ---------------------------------------------------------------------------------------------- */

export type MedievalEnemyId =
  | "risen" | "ghoul" | "cutthroat" | "monk" | "boneMage" | "boneWarrior" | "blackKnight" | "executioner"
  | "abbot" | "fallenKing";

export const MEDIEVAL_ENEMIES: Record<MedievalEnemyId, EnemyDef> = {
  // GRUNT: risen skeletons, in numbers; they crumble into bones.
  risen: {
    label: "Risen Dead", visuals: ["mdSkeleton"], scale: 1, scaleJitter: 0.06, behavior: "chaser", deathFx: "bones",
    maxHp: 34, speed: 1.55, radius: 0.34, damage: 9, attackRange: 1.1, attackWindup: 0.4, attackCooldown: 1.1,
    cash: 1, xp: 10, drops: { cash: 0.4, health: 0.025, upgrade: 0.006 },
  },
  // GRUNT (tough): the plague-dead villagers - slower, take more to drop.
  ghoul: {
    label: "Plague Ghoul", visuals: ["mdGhoul"], scale: 1.02, scaleJitter: 0.07, behavior: "chaser",
    maxHp: 58, speed: 1.3, radius: 0.4, damage: 12, attackRange: 1.2, attackWindup: 0.45, attackCooldown: 1.2,
    cash: 1, xp: 13, drops: { cash: 0.45, health: 0.03, upgrade: 0.007 },
  },
  // FAST: the cutthroat sprints in, a stab that cripples.
  cutthroat: {
    label: "Bone Cutthroat", visuals: ["mdSkeletonRogue"], scale: 0.96, scaleJitter: 0.04, behavior: "chaser", deathFx: "bones",
    maxHp: 30, speed: 4.2, radius: 0.32, damage: 8, attackRange: 1.1, attackWindup: 0.24, attackCooldown: 0.8,
    cash: 1, xp: 13, drops: { cash: 0.35, health: 0.02, upgrade: 0.006 },
    cripple: { slow: 0.7, seconds: 0.8 },
  },
  // CASTER: the cultist monk keeps its distance and throws violet fire.
  monk: {
    label: "Cultist Monk", visuals: ["mdMonk"], scale: 1, scaleJitter: 0.05, behavior: "caster", glow: [1.3, 0.6, 2.0],
    maxHp: 50, speed: 1.5, radius: 0.36, damage: 8, attackRange: 1.1, attackWindup: 0.4, attackCooldown: 1.3,
    cash: 2, xp: 22, drops: { cash: 0.55, health: 0.04, upgrade: 0.01 },
    bolt: { damage: 12, speed: 6.2, radius: 0.32, cooldown: 3.0, minRange: 5.5, maxRange: 11, count: 1, spreadDeg: 0, windup: 0.55 },
  },
  // CASTER (heavy): the bone mage casts a fan of grave-fire.
  boneMage: {
    label: "Bone Mage", visuals: ["mdSkeletonMage"], scale: 1.05, behavior: "caster", deathFx: "bones", glow: [0.6, 1.8, 1.2],
    maxHp: 70, speed: 1.35, radius: 0.38, damage: 9, attackRange: 1.1, attackWindup: 0.45, attackCooldown: 1.4,
    cash: 3, xp: 30, drops: { cash: 0.6, health: 0.05, upgrade: 0.012 },
    bolt: { damage: 11, speed: 6.6, radius: 0.3, cooldown: 3.4, minRange: 6, maxRange: 12, count: 3, spreadDeg: 22, windup: 0.6 },
  },
  // ARMOURED: the skeleton warrior's shield turns a third of every hit.
  boneWarrior: {
    label: "Skeleton Warrior", visuals: ["mdSkeletonWarrior"], scale: 1.06, scaleJitter: 0.04, behavior: "chaser", deathFx: "bones", armor: 0.3,
    maxHp: 95, speed: 1.6, radius: 0.42, damage: 14, attackRange: 1.35, attackWindup: 0.42, attackCooldown: 1.1,
    cash: 2, xp: 28, drops: { cash: 0.6, health: 0.04, upgrade: 0.012 },
    enrage: { below: 0.4, speed: 1.3, cooldown: 0.75 },
  },
  // ELITE: the black knight - plate (40% ignored) and a shield charge.
  blackKnight: {
    label: "Black Knight", visuals: ["mdKnight"], scale: 1.18, behavior: "charger", armor: 0.4,
    maxHp: 300, speed: 2.0, radius: 0.55, damage: 20, attackRange: 1.6, attackWindup: 0.45, attackCooldown: 1.0, knockback: 4,
    cash: 10, xp: 65, drops: { cash: 1, health: 0.3, upgrade: 0.05 },
    charge: { cooldown: 7, telegraph: 0.85, speed: 11, distance: 9, recover: 1.0, damage: 24 },
  },
  // BRUTE: the executioner - slow, a heavy chop that throws the hero back, a ground slam.
  executioner: {
    label: "The Executioner", visuals: ["mdExecutioner"], scale: 1.55, behavior: "chaser", armor: 0.15,
    maxHp: 400, speed: 1.3, radius: 0.8, damage: 26, attackRange: 2.0, attackWindup: 0.7, attackCooldown: 1.7, knockback: 7,
    cash: 8, xp: 70, drops: { cash: 1, health: 0.25, upgrade: 0.04 },
    clips: { hit: undefined },
    slam: { cooldown: 8, telegraph: 1.05, radius: 3.2, damage: 22, triggerRange: 3 },
  },
  // BOSS 1: THE MAD ABBOT - a giant in crimson robes; fire from his hands, his flock from the ground.
  abbot: {
    label: "The Mad Abbot", visuals: ["mdMonk"], scale: 2.7, behavior: "boss", script: "abbot", boss: true, glow: [1.8, 0.6, 1.6],
    maxHp: 2600, speed: 1.7, radius: 1.3, damage: 26, attackRange: 3.0, attackWindup: 0.6, attackCooldown: 1.5, knockback: 7,
    cash: 80, xp: 250, drops: { cash: 1, health: 1, upgrade: 0 },
  },
  // BOSS 2: THE FALLEN KING - armour gone black, a greatsword; his knights answer him.
  fallenKing: {
    label: "The Fallen King", visuals: ["mdKing"], scale: 3.0, behavior: "boss", script: "fallenKing", boss: true, glow: [2.0, 1.2, 0.4],
    maxHp: 10000, speed: 2.0, radius: 1.45, damage: 32, attackRange: 3.4, attackWindup: 0.55, attackCooldown: 1.2, knockback: 8,
    cash: 150, xp: 500, drops: { cash: 1, health: 1, upgrade: 0 },
  },
};

/** Skins per enemy type (overriding the look's own list). */
export const MEDIEVAL_TYPE_SKINS: Partial<Record<MedievalEnemyId, MedievalSkinId[]>> = {
  monk: ["monk_brown", "monk_black"],
  abbot: ["abbot_crimson"],
  blackKnight: ["knight_black", "knight_rust"],
};

/* ------------------------------------------------------------------------------------------------
 * Bosses (gameplay/BossBrain.ts; the shared attack vocabulary)
 * ---------------------------------------------------------------------------------------------- */

export const MEDIEVAL_BOSSES: Record<string, BossPhase[]> = {
  // Teaches: dodge the fire volleys, leave the holy-fire rings, thin out his flock.
  abbot: [
    {
      below: 1, cadence: 1.6, speed: 1,
      attacks: [
        { kind: "volley", windup: 0.7, count: 3, spreadDeg: 26, speed: 7.5, damage: 14, volleys: 2, gap: 0.45 },
        { kind: "melee", hits: 1, windup: 0.75, range: 3.0, damage: 24 },
        { kind: "eruption", count: 5, radius: 1.6, delay: 1.1, damage: 24, spacing: 2.2, fire: 2 },
        { kind: "summon", enemies: [{ type: "risen", count: 4 }], radius: 3.5, portal: 1.2 },
        { kind: "charge", telegraph: 1.15, speed: 12, distance: 13, damage: 26, recover: 1.9 },
      ],
    },
    {
      below: 0.5, cadence: 1.2, speed: 1.15, enter: { roar: 1.6, arena: 0.6, banner: "The Abbot calls his flock" },
      attacks: [
        { kind: "radial", windup: 0.8, count: 14, speed: 6.2, damage: 14, rings: 2, gap: 0.55 },
        { kind: "summon", enemies: [{ type: "monk", count: 2 }, { type: "risen", count: 3 }], radius: 4.2, portal: 1.1 },
        { kind: "eruption", count: 7, radius: 1.7, delay: 1.0, damage: 26, spacing: 2.2, fire: 3 },
        { kind: "volley", windup: 0.55, count: 5, spreadDeg: 48, speed: 8, damage: 14, volleys: 2, gap: 0.45 },
        { kind: "melee", hits: 2, windup: 0.6, range: 3.0, damage: 22 },
      ],
    },
  ],
  // The finale: the greatsword, the charge, his knights - then the castle's own catapults.
  fallenKing: [
    {
      // PHASE 1 - THE KING
      below: 1, cadence: 1.3, speed: 1,
      attacks: [
        { kind: "melee", hits: 2, windup: 0.6, range: 3.6, damage: 30 },
        { kind: "charge", telegraph: 1.0, speed: 14, distance: 16, damage: 32, recover: 1.4 },
        { kind: "slam", telegraph: 1.15, radius: 4.6, damage: 30 },
        { kind: "summon", enemies: [{ type: "boneWarrior", count: 2 }, { type: "risen", count: 3 }], radius: 4, portal: 1.1 },
        { kind: "melee", hits: 1, windup: 0.75, range: 3.6, damage: 32 },
      ],
    },
    {
      // PHASE 2 - THE OATH-BOUND ANSWER
      below: 0.65, cadence: 1.05, speed: 1.1, enter: { roar: 2.2, arena: 0.7, banner: "His knights answer" },
      attacks: [
        { kind: "summon", enemies: [{ type: "blackKnight", count: 1 }, { type: "cutthroat", count: 3 }], radius: 5, portal: 1.1 },
        { kind: "radial", windup: 0.8, count: 16, speed: 6.5, damage: 18, rings: 2, gap: 0.55 },
        { kind: "charge", telegraph: 0.9, speed: 15, distance: 16, damage: 34, recover: 1.2, repeat: 2 },
        { kind: "melee", hits: 3, windup: 0.45, range: 3.6, damage: 30 },
        { kind: "eruption", count: 7, radius: 1.7, delay: 1.0, damage: 28, spacing: 2.2, fire: 4 },
      ],
    },
    {
      // PHASE 3 - THE CASTLE FALLS (stones from the catapults on the walls)
      below: 0.3, cadence: 0.75, speed: 1.35, enter: { roar: 2.4, arena: 1, banner: "THE CASTLE FALLS" },
      attacks: [
        { kind: "meteors", count: 7, radius: 2.4, delay: 1.1, damage: 28, spread: 7, fire: 4, gap: 0.2 },
        { kind: "charge", telegraph: 0.8, speed: 16, distance: 17, damage: 36, recover: 0.8, repeat: 2 },
        { kind: "slam", telegraph: 0.95, radius: 5.2, damage: 36, fire: 4 },
        { kind: "summon", enemies: [{ type: "executioner", count: 1 }, { type: "risen", count: 5 }], radius: 5, portal: 1.2 },
        { kind: "melee", hits: 3, windup: 0.4, range: 3.6, damage: 32 },
      ],
    },
  ],
};

/* ------------------------------------------------------------------------------------------------
 * The campaign: seven levels through the Dark Kingdom (world/level/MedievalLevel.ts) - two acts of
 * medium / hard / climax, then the finale in the throne yard. The roster moves with the story:
 * the risen dead -> the graveyard -> the abbey's cult -> the king's road -> the castle's knights.
 * These numbers are Hard; MEDIEVAL_DIFFICULTIES derive Easy / Nightmare.
 * ---------------------------------------------------------------------------------------------- */

export const MEDIEVAL_LEVELS: WaveDef[] = [
  {
    label: "Kingdom I", act: "Act I · The Plague", subtitle: "The Burned Village", zone: "village",
    duration: 70, prespawn: 6, hpScale: 1, damageScale: 1,
    phases: [
      { at: 0, spawnInterval: 3.0, group: [2, 3], maxAlive: 10, weights: { risen: 1, ghoul: 0.4 } },
      { at: 20, spawnInterval: 2.6, group: [3, 4], maxAlive: 14, weights: { risen: 1, ghoul: 0.6 } },
      { at: 45, spawnInterval: 2.2, group: [3, 5], maxAlive: 17, weights: { risen: 1, ghoul: 0.7, cutthroat: 0.25 } },
    ],
  },
  {
    label: "Kingdom II", act: "Act I · The Plague", subtitle: "The Graveyard", zone: "graveyard",
    duration: 85, prespawn: 8, hpScale: 1.15, damageScale: 1.1,
    phases: [
      { at: 0, spawnInterval: 2.6, group: [3, 4], maxAlive: 14, weights: { risen: 1, ghoul: 0.5, cutthroat: 0.35 } },
      { at: 20, spawnInterval: 2.4, group: [3, 5], maxAlive: 16, weights: { risen: 1, ghoul: 0.5, cutthroat: 0.45, boneMage: 0.08 } },
      { at: 55, spawnInterval: 2.1, group: [4, 6], maxAlive: 19, weights: { risen: 1.1, ghoul: 0.5, cutthroat: 0.5, boneMage: 0.12, boneWarrior: 0.06 } },
    ],
  },
  {
    label: "Kingdom III", act: "Act I · The Plague", subtitle: "The Abbey", zone: "abbey",
    duration: 40, prespawn: 6, hpScale: 1.25, damageScale: 1.15,
    phases: [
      { at: 0, spawnInterval: 2.6, group: [3, 4], maxAlive: 12, weights: { risen: 0.8, monk: 0.4, ghoul: 0.5, cutthroat: 0.2 } },
    ],
    boss: { type: "abbot", spawnFactor: 0.25 },
  },
  {
    label: "Kingdom IV", act: "Act II · The King's Road", subtitle: "The Bridge", zone: "bridge",
    duration: 85, prespawn: 8, hpScale: 1.6, damageScale: 1.35, speedScale: 1.06,
    traps: { every: 13, kinds: ["tar", "sweep"], damage: 16 },
    phases: [
      { at: 0, spawnInterval: 2.4, group: [3, 5], maxAlive: 17, weights: { risen: 1, cutthroat: 0.6, monk: 0.4, boneWarrior: 0.3 } },
      { at: 30, spawnInterval: 2.1, group: [4, 6], maxAlive: 20, weights: { risen: 1, cutthroat: 0.6, monk: 0.5, boneWarrior: 0.4, boneMage: 0.2, blackKnight: 0.04 } },
      { at: 60, spawnInterval: 1.9, group: [4, 6], maxAlive: 22, weights: { risen: 1, cutthroat: 0.7, monk: 0.5, boneWarrior: 0.5, boneMage: 0.25, blackKnight: 0.07 } },
    ],
  },
  {
    label: "Kingdom V", act: "Act II · The King's Road", subtitle: "The Outer Bailey", zone: "bailey",
    duration: 95, prespawn: 10, hpScale: 2.0, damageScale: 1.6, speedScale: 1.1,
    traps: { every: 11, kinds: ["tar", "sweep", "cage"], damage: 18 },
    phases: [
      { at: 0, spawnInterval: 2.2, group: [4, 6], maxAlive: 20, weights: { risen: 1, boneWarrior: 0.6, cutthroat: 0.5, monk: 0.4, blackKnight: 0.08 } },
      { at: 35, spawnInterval: 1.9, group: [4, 7], maxAlive: 23, weights: { risen: 1, boneWarrior: 0.7, cutthroat: 0.5, boneMage: 0.35, blackKnight: 0.12, executioner: 0.05 } },
      { at: 70, spawnInterval: 1.7, group: [5, 7], maxAlive: 25, weights: { risen: 1.1, boneWarrior: 0.8, cutthroat: 0.5, boneMage: 0.4, blackKnight: 0.15, executioner: 0.08 } },
    ],
  },
  {
    // No boss: hold the great hall while the castle empties its crypts.
    label: "Kingdom VI", act: "Act II · The King's Road", subtitle: "The Great Hall", zone: "hall",
    duration: 80, prespawn: 8, hpScale: 2.3, damageScale: 1.75, speedScale: 1.14,
    traps: { every: 11, kinds: ["sweep", "cage", "tar"], damage: 20 },
    phases: [
      { at: 0, spawnInterval: 2.0, group: [4, 6], maxAlive: 20, weights: { boneWarrior: 1, cutthroat: 0.6, monk: 0.5, boneMage: 0.35, blackKnight: 0.1 } },
      { at: 30, spawnInterval: 1.8, group: [4, 7], maxAlive: 24, weights: { boneWarrior: 1, cutthroat: 0.7, boneMage: 0.45, blackKnight: 0.14, executioner: 0.06 } },
      { at: 60, spawnInterval: 1.6, group: [5, 7], maxAlive: 27, weights: { boneWarrior: 1.1, cutthroat: 0.7, boneMage: 0.5, blackKnight: 0.16, executioner: 0.1, risen: 0.6 } },
    ],
  },
  {
    label: "Kingdom VII", act: "Finale · The Throne", subtitle: "The Throne Yard", zone: "throne",
    duration: 30, prespawn: 5, hpScale: 2.3, damageScale: 1.8, speedScale: 1.2, bossDamageScale: 1.35,
    traps: { every: 13, kinds: ["tar", "sweep", "cage"], damage: 22 },
    // The castle's catapults keep firing into the yard.
    meteors: { every: 10, damage: 20, radius: 2.3, count: 3 },
    phases: [
      { at: 0, spawnInterval: 2.4, group: [3, 4], maxAlive: 13, weights: { risen: 0.8, boneWarrior: 0.5, cutthroat: 0.5, boneMage: 0.3 } },
    ],
    boss: { type: "fallenKing", spawnFactor: 0.25 },
  },
];

/** A run in the Dark Kingdom: a rifle, a little cash, level 1. */
export const MEDIEVAL_RUN = {
  startWeapon: "rifle" as const,
  startCash: 120,
  startPicks: 0,
  /** After this level (index) the pact is offered. */
  pactAfter: 4,
  /** Before this level (index) the final warning is shown. */
  finalLevel: 6,
  /** After the Abbot the abbey's reliquary offers one of these free. */
  armory: { after: 2, weapons: ["shotgun", "hellfire"] as const },
  text: {
    armory: ["THE ABBEY'S RELIQUARY", "Behind the altar, the monks' hoard: take one weapon - the other waits in the shop."] as [string, string],
    pact: ["THE BLACK BARGAIN", "In the bailey's chapel something offers you strength - at a price. Choose one boon; its power costs you."] as [string, string],
    finalWarning: ["THE THRONE YARD", "Beyond the hall waits the king who let the dead in. His knights still kneel to him. Read the greatsword, and keep moving."] as [string, string],
  },
};

/** The Dark Kingdom's difficulties (MEDIEVAL_LEVELS are Hard; see HELL_DIFFICULTIES for the model). */
export const MEDIEVAL_DIFFICULTIES: Record<"easy" | "hard" | "nightmare", DifficultyDef> = {
  easy: {
    label: "Easy",
    text: "A pilgrim's walk: slower dead, no traps, healing unbound.",
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
    text: "The king's road is a gauntlet: traps, relentless dead, healing capped.",
    killHealPerSecond: 2.5,
    pickupHealMax: 30,
    cripple: true,
    followHero: 0.7,
  },
  nightmare: {
    label: "Nightmare",
    text: "The kingdom wants another corpse for its graves.",
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
