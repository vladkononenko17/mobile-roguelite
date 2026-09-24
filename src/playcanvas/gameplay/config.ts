// Gameplay data for the roguelite run: weapons stats, enemies, levels / spawning, drops, upgrades and
// the shop. Everything tunable lives here; the systems in this folder only read it.

import type { WeaponId } from "../config";

/* ------------------------------------------------------------------------------------------------
 * Player combat
 * ---------------------------------------------------------------------------------------------- */

export const PLAYER_COMBAT = {
  maxHp: 100,
  /** Seconds of invulnerability after taking a hit. */
  hitInvulnerability: 0.45,
  /** Auto-aim: targets are searched within the weapon range; enemies in front (within this half
   * angle of the hero's movement / facing) are preferred, so steering decides what gets shot. */
  aimHalfAngleDeg: 75,
  /** Extra "distance" (m) charged per radian away from the preferred direction when picking. */
  aimAnglePenalty: 4,
  /** The hero turns toward the target this fast while shooting (per second, exponential). */
  aimTurnSharpness: 18,
  /** Pickup attraction radius and speed. */
  magnetRadius: 2.6,
  magnetSpeed: 11,
  pickupRadius: 0.7,
};

/* ------------------------------------------------------------------------------------------------
 * Weapons
 * ---------------------------------------------------------------------------------------------- */

export interface WeaponStats {
  /** Damage per bullet / pellet. */
  damage: number;
  /** Shots per second. */
  fireRate: number;
  /** Effective range (m). Beyond it bullets stop. */
  range: number;
  /** Random spread per bullet, degrees (half angle). */
  spreadDeg: number;
  /** Bullets per shot (shotgun pellets). */
  pellets: number;
  /** Extra enemies a bullet passes through. */
  penetration: number;
  magazine: number;
  reloadSeconds: number;
  /** Knockback per hit (m). */
  knockback: number;
}

/** Combat stats per weapon (weapons missing here cannot be fired). */
export const WEAPON_STATS: Partial<Record<WeaponId, WeaponStats>> = {
  pistol: { damage: 14, fireRate: 3.2, range: 11, spreadDeg: 1.5, pellets: 1, penetration: 0, magazine: 12, reloadSeconds: 1.1, knockback: 0.12 },
  shotgun: { damage: 9, fireRate: 1.25, range: 7, spreadDeg: 11, pellets: 7, penetration: 0, magazine: 6, reloadSeconds: 1.6, knockback: 0.35 },
  rifle: { damage: 10, fireRate: 7.5, range: 14, spreadDeg: 3, pellets: 1, penetration: 1, magazine: 30, reloadSeconds: 1.8, knockback: 0.08 },
};

/* ------------------------------------------------------------------------------------------------
 * Enemies
 * ---------------------------------------------------------------------------------------------- */

export type EnemyId = "walker" | "runner" | "thrower" | "brute" | "charger" | "tank";
export type EnemyBehavior = "chaser" | "charger" | "thrower" | "tank";

export interface EnemyDef {
  label: string;
  /** Which character GLB the body comes from ("survivor" is the default hero model, already loaded). */
  model: "survivor" | "vanguard";
  scale: number;
  /** Multiplies the body texture (a zombie skin tone), and the hit-flash colour. */
  tint: [number, number, number];
  behavior: EnemyBehavior;
  maxHp: number;
  speed: number;
  /** Collision / hit radius (m). */
  radius: number;
  damage: number;
  /** Melee reach measured from centre to the player's centre (m). */
  attackRange: number;
  /** Wind-up before the hit lands (the player can step out). */
  attackWindup: number;
  attackCooldown: number;
  /** Scrap (currency) value when it drops scrap. */
  scrap: number;
  drops: { scrap: number; health: number; upgrade: number };
  boss?: boolean;
  /** Clip names (the survivor / vanguard GLBs share the same retargeted set). */
  clips: { move: string; attack: string; death: string; special?: string };
  /** Animation playback rate for the move clip at `speed`. */
  moveAnimRate: number;
  /** Thrower / tank projectile. */
  projectile?: { damage: number; speed: number; radius: number; cooldown: number; minRange: number; maxRange: number };
  /** Charger dash. */
  charge?: { cooldown: number; telegraph: number; speed: number; distance: number; recover: number; damage: number };
  /** Tank ground slam. */
  slam?: { cooldown: number; telegraph: number; radius: number; damage: number; triggerRange: number };
}

const CLIPS_WALK = { move: "Walking", attack: "Attack", death: "dying_backwards" };

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  walker: {
    label: "Walker", model: "survivor", scale: 1.1, tint: [0.62, 0.78, 0.55], behavior: "chaser",
    maxHp: 30, speed: 1.35, radius: 0.36, damage: 9, attackRange: 1.15, attackWindup: 0.42, attackCooldown: 1.2,
    scrap: 1, drops: { scrap: 0.4, health: 0.025, upgrade: 0.006 },
    clips: CLIPS_WALK, moveAnimRate: 0.85,
  },
  runner: {
    label: "Runner", model: "survivor", scale: 1.0, tint: [0.85, 0.55, 0.45], behavior: "chaser",
    maxHp: 22, speed: 3.9, radius: 0.34, damage: 7, attackRange: 1.1, attackWindup: 0.3, attackCooldown: 0.9,
    scrap: 1, drops: { scrap: 0.45, health: 0.03, upgrade: 0.008 },
    clips: { move: "Running", attack: "Attack", death: "dying_backwards" }, moveAnimRate: 0.9,
  },
  thrower: {
    label: "Thrower", model: "survivor", scale: 1.15, tint: [0.72, 0.8, 0.35], behavior: "thrower",
    maxHp: 55, speed: 1.1, radius: 0.38, damage: 8, attackRange: 1.15, attackWindup: 0.45, attackCooldown: 1.4,
    scrap: 2, drops: { scrap: 0.6, health: 0.05, upgrade: 0.012 },
    clips: { move: "Walking", attack: "Attack", death: "dying_backwards", special: "Skill_03" }, moveAnimRate: 0.75,
    projectile: { damage: 14, speed: 5.5, radius: 1.3, cooldown: 3.6, minRange: 5, maxRange: 11 },
  },
  brute: {
    label: "Brute", model: "vanguard", scale: 1.75, tint: [0.72, 0.62, 0.55], behavior: "chaser", boss: true,
    maxHp: 240, speed: 1.05, radius: 0.7, damage: 24, attackRange: 1.9, attackWindup: 0.7, attackCooldown: 1.6,
    scrap: 25, drops: { scrap: 1, health: 1, upgrade: 0 },
    clips: { move: "Walking", attack: "Attack", death: "dying_backwards" }, moveAnimRate: 0.6,
  },
  charger: {
    label: "Charger", model: "vanguard", scale: 1.55, tint: [0.95, 0.6, 0.45], behavior: "charger", boss: true,
    maxHp: 420, speed: 1.6, radius: 0.62, damage: 18, attackRange: 1.8, attackWindup: 0.55, attackCooldown: 1.4,
    scrap: 40, drops: { scrap: 1, health: 1, upgrade: 0 },
    clips: { move: "Walking", attack: "Attack", death: "dying_backwards", special: "Rifle_Charge_inplace" }, moveAnimRate: 0.8,
    charge: { cooldown: 5, telegraph: 1.0, speed: 12, distance: 13, recover: 1.6, damage: 28 },
  },
  tank: {
    label: "Mutant Tank", model: "vanguard", scale: 2.05, tint: [0.66, 0.55, 0.78], behavior: "tank", boss: true,
    maxHp: 900, speed: 0.95, radius: 0.85, damage: 30, attackRange: 2.2, attackWindup: 0.8, attackCooldown: 1.8,
    scrap: 60, drops: { scrap: 1, health: 1, upgrade: 0 },
    clips: { move: "Walking", attack: "Attack", death: "dying_backwards", special: "Charged_Ground_Slam" }, moveAnimRate: 0.55,
    projectile: { damage: 20, speed: 6, radius: 1.8, cooldown: 5.5, minRange: 4, maxRange: 13 },
    slam: { cooldown: 6, telegraph: 1.1, radius: 3.6, damage: 32, triggerRange: 3.4 },
  },
};

/** Pool / performance limits. */
export const ENEMY_LIMITS = {
  /** Pooled bodies per model (the maximum alive at once). */
  pool: 30,
  /** Bosses kept ready (bigger model). */
  bossPool: 1,
  /** Corpses linger this long, then sink and return to the pool. */
  corpseSeconds: 1.6,
  /** Enemies push each other apart within this factor of their radii. */
  separation: 1.05,
};

/* ------------------------------------------------------------------------------------------------
 * Levels / spawning
 * ---------------------------------------------------------------------------------------------- */

export interface LevelDef {
  label: string;
  /** Seconds of regular spawning before the boss arrives. */
  duration: number;
  /** Relative spawn weights; a type's weight can ramp in over the level (weight x clamp(t / rampIn)). */
  enemies: Partial<Record<Exclude<EnemyId, "brute" | "charger" | "tank">, { weight: number; from?: number }>>;
  /** Enemies per second at the start and at the end of the level (linear in between). */
  spawnRate: [number, number];
  /** Group size at the start / end (a group spawns together from one direction). */
  groupSize: [number, number];
  maxEnemies: [number, number];
  boss: "brute" | "charger" | "tank";
  /** While the boss is alive, regular spawning continues at this fraction of the final rate. */
  bossSpawnFactor: number;
  /** Enemy HP / damage multipliers for this level. */
  hpScale: number;
  damageScale: number;
}

export const LEVELS: LevelDef[] = [
  {
    label: "Level 1", duration: 150,
    enemies: { walker: { weight: 1 } },
    spawnRate: [0.35, 1.2], groupSize: [2, 5], maxEnemies: [8, 24],
    boss: "brute", bossSpawnFactor: 0.35, hpScale: 1, damageScale: 1,
  },
  {
    label: "Level 2", duration: 200,
    enemies: { walker: { weight: 1 }, runner: { weight: 0.45, from: 20 } },
    spawnRate: [0.6, 1.6], groupSize: [3, 6], maxEnemies: [14, 28],
    boss: "charger", bossSpawnFactor: 0.35, hpScale: 1.25, damageScale: 1.1,
  },
  {
    label: "Level 3", duration: 260,
    enemies: { walker: { weight: 1 }, runner: { weight: 0.5 }, thrower: { weight: 0.3, from: 15 } },
    spawnRate: [0.8, 1.9], groupSize: [3, 7], maxEnemies: [18, 30],
    boss: "tank", bossSpawnFactor: 0.3, hpScale: 1.55, damageScale: 1.2,
  },
];

/** Where each run (and level) starts: the open main yard in the middle of the outpost. */
export const RUN_START = { x: 0, z: 14, yawDeg: 180 };

export const SPAWNING = {
  /** Spawn ring around the player (m). Candidates inside the camera view are rejected. */
  minDistance: 12,
  maxDistance: 22,
  /** Candidates tried per group before giving up this tick. */
  attempts: 14,
  /** Groups scatter this far around their centre. */
  groupSpread: 1.6,
};

/* ------------------------------------------------------------------------------------------------
 * Drops
 * ---------------------------------------------------------------------------------------------- */

export const DROPS = {
  /** Health pickup heals this fraction of max HP. */
  healthFraction: 0.18,
  /** Bosses drop this many scrap pickups (their `scrap` value is split between them). */
  bossScrapPieces: 8,
  /** Pickups vanish after this long (s). */
  lifetime: 25,
  pool: 40,
};

/* ------------------------------------------------------------------------------------------------
 * Upgrades and shop
 * ---------------------------------------------------------------------------------------------- */

export type UpgradeId =
  | "damage" | "fireRate" | "penetration" | "reload" | "crit"
  | "maxHp" | "moveSpeed" | "armor" | "heal"
  | "fifthShot" | "vampire";

export interface UpgradeDef {
  id: UpgradeId;
  title: string;
  text: string;
  category: "weapon" | "player" | "special";
  /** How many times it can be taken per run (default unlimited). */
  maxStacks?: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: "damage", title: "Hollow Points", text: "+15% weapon damage", category: "weapon" },
  { id: "fireRate", title: "Hair Trigger", text: "+15% fire rate", category: "weapon" },
  { id: "penetration", title: "Piercing Rounds", text: "Bullets pass through +1 enemy", category: "weapon", maxStacks: 3 },
  { id: "reload", title: "Speed Loader", text: "+10% reload speed", category: "weapon", maxStacks: 5 },
  { id: "crit", title: "Steady Hand", text: "+10% critical chance (x2 damage)", category: "weapon", maxStacks: 5 },
  { id: "maxHp", title: "Thick Skin", text: "+20 max HP", category: "player" },
  { id: "moveSpeed", title: "Light Boots", text: "+10% movement speed", category: "player", maxStacks: 4 },
  { id: "armor", title: "Scrap Plating", text: "+10% damage resistance", category: "player", maxStacks: 5 },
  { id: "heal", title: "Field Dressing", text: "Heal 30% HP now", category: "player" },
  { id: "fifthShot", title: "Fifth Shot", text: "Every 5th bullet deals +150% damage", category: "special", maxStacks: 1 },
  { id: "vampire", title: "Scavenger", text: "Kills have a 6% chance to heal 5 HP", category: "special", maxStacks: 3 },
];

export type ShopItemId = "heal" | "maxHp" | "armor" | "damage" | "fireRate" | "shotgun" | "rifle";

export interface ShopItem {
  id: ShopItemId;
  title: string;
  text: string;
  cost: number;
  /** Weapon purchases equip that weapon (and can be bought once). */
  weapon?: WeaponId;
}

export const SHOP: ShopItem[] = [
  { id: "heal", title: "Medkit", text: "Heal to full", cost: 12 },
  { id: "maxHp", title: "Vest", text: "+25 max HP", cost: 18 },
  { id: "armor", title: "Plating", text: "+10% damage resistance", cost: 20 },
  { id: "damage", title: "Gun Oil", text: "+10% weapon damage", cost: 16 },
  { id: "fireRate", title: "Spring Kit", text: "+10% fire rate", cost: 16 },
  { id: "shotgun", title: "Shotgun", text: "7 pellets, brutal up close", cost: 30, weapon: "shotgun" },
  { id: "rifle", title: "Assault Rifle", text: "Fast, long range, pierces", cost: 45, weapon: "rifle" },
];
