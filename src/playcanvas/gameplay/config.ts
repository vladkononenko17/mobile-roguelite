// Gameplay data for the roguelite run: weapons stats, enemies, levels / spawning, drops, upgrades and
// the shop. Everything tunable lives here; the systems in this folder only read it.

import type { WeaponId } from "../config";
import type { UpgradeCategory, UpgradeIcon, UpgradeRarity } from "../ui/UpgradeIcons";

/* ------------------------------------------------------------------------------------------------
 * Player combat
 * ---------------------------------------------------------------------------------------------- */

export const PLAYER_COMBAT = {
  maxHp: 100,
  /** Seconds of invulnerability after taking a hit. */
  hitInvulnerability: 0.45,
  /** The hero turns toward the target this fast while shooting (per second, exponential). */
  aimTurnSharpness: 18,
  /** Pickup attraction radius and speed. */
  magnetRadius: 2.6,
  magnetSpeed: 11,
  pickupRadius: 0.7,
};

/**
 * Auto-aim eligibility: an enemy can only become (or stay) the gun's target while its chest point is
 * inside an inner "combat viewport" of the gameplay camera, i.e. clearly visible on screen, never
 * off-screen. Margins are fractions of the canvas size; the top margin also clears the corner HUD.
 */
export const TARGETING = {
  marginX: 0.06,
  marginTop: 0.12,
  marginBottom: 0.09,
  /** The current target is kept while inside the viewport grown by this fraction (no edge flicker). */
  keepSlack: 0.025,
  /** ...and for at most this long after it leaves even that (then it is dropped). */
  graceSeconds: 0.15,
  /** Height of the enemy's aim point (chest) above its feet, per unit of enemy scale (m). */
  aimHeight: 1.0,
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

/* Enemy look and behaviour are separate: an EnemyDef (AI, stats) lists the EnemyVisuals (model +
 * animation set) its bodies are drawn with, so one behaviour can wear several variant models
 * (Walker A / B / C...) and a model can be swapped without touching the AI. */

export type EnemyVisualId =
  | "zombieMaleCasual" | "zombieMaleFarmer" | "zombieFemaleCasual" | "zombieFemaleOffice"
  | "zombieRunnerMale" | "zombieRunnerFemale" | "zombieThrower" | "zombieBrute"
  | "vanguard";

/** Zombie colour skins: recoloured copies of the zombie pack's swatch palette (one small texture
 * each, shared by every zombie model), built by scripts/build-zombies.mjs. */
export type EnemySkinId = "green" | "darkgreen" | "purple" | "brown" | "toxic" | "brute";

export const ENEMY_SKINS: Record<EnemySkinId, string> = {
  green: "models/zombies/skins/green.webp",
  darkgreen: "models/zombies/skins/darkgreen.webp",
  purple: "models/zombies/skins/purple.webp",
  brown: "models/zombies/skins/brown.webp",
  toxic: "models/zombies/skins/toxic.webp",
  brute: "models/zombies/skins/brute.webp",
};

/** Clip names inside an enemy GLB. Several deaths: one is picked at random. */
export interface EnemyClips {
  idle: string;
  move: string;
  attack: string;
  /** Short flinch on a non-lethal hit (optional). */
  hit?: string;
  death: string[];
  /** Charge / throw / slam wind-up (bosses, thrower). */
  special?: string;
}

export interface EnemyVisual {
  /** GLB under public/. */
  url: string;
  /** Uniform scale that brings the model to a common ~1.75 m height before the type's own scale. */
  scale: number;
  clips: EnemyClips;
  /** Ground speed (m/s) at which the move clip, at rate 1 and scale 1, does not slide its feet. */
  moveSpeed: number;
  /** Colour skins this model can wear (one is picked per spawn); none = its own texture. */
  skins?: EnemySkinId[];
  /** Width / depth factor on top of the scale: < 1 lean (runner), > 1 bulky (brute). */
  bulk?: number;
}

const ZOMBIE_CLIPS: EnemyClips = {
  idle: "Zombie_Idle", move: "Zombie_Walk", attack: "Zombie_Attack", hit: "Zombie_Hit",
  death: ["Zombie_Death", "Zombie_DeathForward"],
};

const HORDE_SKINS: EnemySkinId[] = ["green", "darkgreen", "purple", "brown"];

/** Low-Poly Zombie Asset Pack bodies, built by scripts/build-zombies.mjs (see SOURCES.md). */
const zombie = (file: string, scale: number, extra: Partial<EnemyVisual> = {}): EnemyVisual => ({
  url: `models/zombies/${file}.glb`, scale, clips: ZOMBIE_CLIPS, moveSpeed: 1.35, skins: HORDE_SKINS, ...extra,
});
/** Sprinting: the retargeted run clip (feet match ~4.3 m/s at scale 1). */
const RUNNER: Partial<EnemyVisual> = { clips: { ...ZOMBIE_CLIPS, move: "Zombie_Run" }, moveSpeed: 4.3, bulk: 0.88 };

export const ENEMY_VISUALS: Record<EnemyVisualId, EnemyVisual> = {
  zombieMaleCasual: zombie("zombie_male_casual", 0.98),
  zombieMaleFarmer: zombie("zombie_male_farmer", 1.04),
  zombieFemaleCasual: zombie("zombie_female_casual", 1.05),
  zombieFemaleOffice: zombie("zombie_female_office", 1.08),
  // Runner: the pack's lean sport bodies, sprinting.
  zombieRunnerMale: zombie("zombie_male_sport", 1.0, RUNNER),
  zombieRunnerFemale: zombie("zombie_female_sport", 1.12, RUNNER),
  // Thrower: lab-coat zombie in a toxic yellow-green skin, a little swollen, lobbing with an overhand throw.
  zombieThrower: zombie("zombie_male_scientist", 1.02, { skins: ["toxic"], bulk: 1.12, clips: { ...ZOMBIE_CLIPS, special: "Zombie_Throw" } }),
  // Brute (boss): a big, bulked-out zombie in a dark bruised skin with a slow overhead smash.
  zombieBrute: zombie("zombie_male_casual", 0.98, { skins: ["brute"], bulk: 1.28, clips: { ...ZOMBIE_CLIPS, attack: "Zombie_Smash", hit: undefined } }),
  /** Boss rig (Meshy "Ironclad Vanguard", Mixamo clips). */
  vanguard: {
    url: "models/vanguard/Meshy_AI_Ironclad_Vanguard_All_Animations_2k.glb", scale: 1,
    clips: { idle: "Idle_10", move: "Walking", attack: "Attack", death: ["dying_backwards"] },
    moveSpeed: 1.3,
  },
};

export interface EnemyDef {
  label: string;
  /** Variant looks; each spawn picks one at random (from those loaded). */
  visuals: EnemyVisualId[];
  /** Type scale on top of the visual's own scale, and the random +- fraction per spawn. */
  scale: number;
  scaleJitter?: number;
  /** Optional colour multiplier on the body texture (bosses). */
  tint?: [number, number, number];
  /** Per-type clip overrides (on top of the visual's clips). */
  clips?: Partial<EnemyClips>;
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
  /** Cash (currency) value when it drops cash. */
  cash: number;
  drops: { cash: number; health: number; upgrade: number };
  boss?: boolean;
  /** Thrower / tank projectile. */
  projectile?: { damage: number; speed: number; radius: number; cooldown: number; minRange: number; maxRange: number };
  /** Charger dash. */
  charge?: { cooldown: number; telegraph: number; speed: number; distance: number; recover: number; damage: number };
  /** Tank ground slam. */
  slam?: { cooldown: number; telegraph: number; radius: number; damage: number; triggerRange: number };
}

const WALKER_LOOKS: EnemyVisualId[] = ["zombieMaleCasual", "zombieMaleFarmer", "zombieFemaleCasual", "zombieFemaleOffice"];

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  // Hero is ~1.95 m (1.70 m model x 1.15); walkers are 0.9 - 1.0x of that, hunched.
  walker: {
    label: "Walker", visuals: WALKER_LOOKS, scale: 1.1, scaleJitter: 0.05, behavior: "chaser",
    maxHp: 30, speed: 1.35, radius: 0.36, damage: 9, attackRange: 1.15, attackWindup: 0.42, attackCooldown: 1.2,
    cash: 1, drops: { cash: 0.4, health: 0.025, upgrade: 0.006 },
  },
  // Runner: lean and ~0.95x the hero, sprinting.
  runner: {
    label: "Runner", visuals: ["zombieRunnerMale", "zombieRunnerFemale"], scale: 1.06, scaleJitter: 0.03, behavior: "chaser",
    maxHp: 22, speed: 3.9, radius: 0.34, damage: 7, attackRange: 1.1, attackWindup: 0.3, attackCooldown: 0.9,
    cash: 1, drops: { cash: 0.45, health: 0.03, upgrade: 0.008 },
  },
  thrower: {
    label: "Thrower", visuals: ["zombieThrower"], scale: 1.12, behavior: "thrower",
    maxHp: 55, speed: 1.1, radius: 0.38, damage: 8, attackRange: 1.15, attackWindup: 0.45, attackCooldown: 1.4,
    cash: 2, drops: { cash: 0.6, health: 0.05, upgrade: 0.012 },
    projectile: { damage: 14, speed: 5.5, radius: 1.3, cooldown: 3.6, minRange: 5, maxRange: 11 },
  },
  brute: {
    // ~1.4x the hero's height and much broader.
    label: "Brute", visuals: ["zombieBrute"], scale: 1.55, behavior: "chaser", boss: true,
    maxHp: 240, speed: 1.05, radius: 0.7, damage: 24, attackRange: 1.9, attackWindup: 0.7, attackCooldown: 1.6,
    cash: 25, drops: { cash: 1, health: 1, upgrade: 0 },
  },
  charger: {
    label: "Charger", visuals: ["vanguard"], scale: 1.55, tint: [0.95, 0.6, 0.45], behavior: "charger", boss: true,
    maxHp: 420, speed: 1.6, radius: 0.62, damage: 18, attackRange: 1.8, attackWindup: 0.55, attackCooldown: 1.4,
    cash: 40, drops: { cash: 1, health: 1, upgrade: 0 },
    clips: { special: "Rifle_Charge_inplace" },
    charge: { cooldown: 5, telegraph: 1.0, speed: 12, distance: 13, recover: 1.6, damage: 28 },
  },
  tank: {
    label: "Mutant Tank", visuals: ["vanguard"], scale: 2.05, tint: [0.66, 0.55, 0.78], behavior: "tank", boss: true,
    maxHp: 900, speed: 0.95, radius: 0.85, damage: 30, attackRange: 2.2, attackWindup: 0.8, attackCooldown: 1.8,
    cash: 60, drops: { cash: 1, health: 1, upgrade: 0 },
    clips: { special: "Charged_Ground_Slam" },
    projectile: { damage: 20, speed: 6, radius: 1.8, cooldown: 5.5, minRange: 4, maxRange: 13 },
    slam: { cooldown: 6, telegraph: 1.1, radius: 3.6, damage: 32, triggerRange: 3.4 },
  },
};

/** Pool / performance limits. */
export const ENEMY_LIMITS = {
  /** Most regular enemies alive at once. */
  pool: 30,
  /** Bodies pre-built per visual when it loads; more are built on demand (up to `pool`). */
  prebuild: 8,
  /** Seconds a hit flinch lasts (and slows the enemy), and the minimum time between flinches. */
  hitReact: 0.3,
  hitReactCooldown: 0.7,
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
  /** Bosses drop this many cash pickups (their `cash` value is split between them). */
  bossCashPieces: 8,
  /** Pickups vanish after this long (s). */
  lifetime: 25,
  pool: 40,
};

/* ------------------------------------------------------------------------------------------------
 * Upgrades and shop
 * ---------------------------------------------------------------------------------------------- */

export type UpgradeId =
  | "damage" | "fireRate" | "penetration" | "reload" | "magazine" | "crit"
  | "maxHp" | "moveSpeed" | "armor" | "heal"
  | "fifthShot" | "vampire";

/**
 * One upgrade: its presentation (name, stat line, value, icon, category colour, rarity) and stacking.
 * The effect itself lives in Upgrades.ts (keyed by id). The HUD toast, the reward cards and the
 * world pickup badge are all drawn from these fields, so a new upgrade is one entry here plus one
 * effect function.
 */
export interface UpgradeDef {
  id: UpgradeId;
  /** Display name ("Scrap Plating"). */
  name: string;
  /** What it changes ("Damage Resistance") and by how much ("+10%"). */
  stat: string;
  value: string;
  icon: UpgradeIcon;
  category: UpgradeCategory;
  rarity: UpgradeRarity;
  /** How many times it can be taken per run (default unlimited). */
  maxStacks?: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: "damage", name: "Hollow Points", stat: "Weapon Damage", value: "+15%", icon: "bullet", category: "weapon", rarity: "common" },
  { id: "fireRate", name: "Hair Trigger", stat: "Fire Rate", value: "+15%", icon: "rapid", category: "weapon", rarity: "common" },
  { id: "penetration", name: "Piercing Rounds", stat: "Bullets Pierce", value: "+1 enemy", icon: "pierce", category: "weapon", rarity: "rare", maxStacks: 3 },
  { id: "reload", name: "Quick Hands", stat: "Reload Speed", value: "+10%", icon: "reload", category: "weapon", rarity: "common", maxStacks: 5 },
  { id: "magazine", name: "Extended Mag", stat: "Magazine Capacity", value: "+25%", icon: "magazine", category: "weapon", rarity: "common", maxStacks: 3 },
  { id: "crit", name: "Steady Hand", stat: "Critical Chance", value: "+10%", icon: "target", category: "weapon", rarity: "rare", maxStacks: 5 },
  { id: "maxHp", name: "Thick Skin", stat: "Max HP", value: "+20", icon: "heart", category: "player", rarity: "common" },
  { id: "moveSpeed", name: "Adrenaline", stat: "Movement Speed", value: "+10%", icon: "boot", category: "player", rarity: "common", maxStacks: 4 },
  { id: "armor", name: "Scrap Plating", stat: "Damage Resistance", value: "+10%", icon: "shield", category: "player", rarity: "common", maxStacks: 5 },
  { id: "heal", name: "Field Medkit", stat: "Restore HP", value: "30%", icon: "medkit", category: "player", rarity: "common" },
  { id: "fifthShot", name: "Fifth Shot", stat: "Every 5th Bullet", value: "+150% damage", icon: "star", category: "special", rarity: "epic", maxStacks: 1 },
  { id: "vampire", name: "Scavenger", stat: "Heal 5 HP on Kill", value: "6% chance", icon: "drop", category: "special", rarity: "rare", maxStacks: 3 },
];

/** "Damage Resistance +10%" */
export const upgradeText = (u: UpgradeDef): string => `${u.stat} ${u.value}`;

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
