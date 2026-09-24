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
  /** Character XP for the kill. */
  xp: number;
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
    cash: 1, xp: 10, drops: { cash: 0.4, health: 0.025, upgrade: 0.006 },
  },
  // Runner: lean and ~0.95x the hero, sprinting.
  runner: {
    label: "Runner", visuals: ["zombieRunnerMale", "zombieRunnerFemale"], scale: 1.06, scaleJitter: 0.03, behavior: "chaser",
    maxHp: 22, speed: 3.9, radius: 0.34, damage: 7, attackRange: 1.1, attackWindup: 0.3, attackCooldown: 0.9,
    cash: 1, xp: 15, drops: { cash: 0.45, health: 0.03, upgrade: 0.008 },
  },
  thrower: {
    label: "Thrower", visuals: ["zombieThrower"], scale: 1.12, behavior: "thrower",
    maxHp: 55, speed: 1.1, radius: 0.38, damage: 8, attackRange: 1.15, attackWindup: 0.45, attackCooldown: 1.4,
    cash: 2, xp: 25, drops: { cash: 0.6, health: 0.05, upgrade: 0.012 },
    projectile: { damage: 14, speed: 5.5, radius: 1.3, cooldown: 3.6, minRange: 5, maxRange: 11 },
  },
  brute: {
    // ~1.4x the hero's height and much broader.
    label: "Brute", visuals: ["zombieBrute"], scale: 1.55, behavior: "chaser", boss: true,
    maxHp: 240, speed: 1.05, radius: 0.7, damage: 24, attackRange: 1.9, attackWindup: 0.7, attackCooldown: 1.6,
    cash: 25, xp: 60, drops: { cash: 1, health: 1, upgrade: 0 },
  },
  charger: {
    label: "Charger", visuals: ["vanguard"], scale: 1.55, tint: [0.95, 0.6, 0.45], behavior: "charger", boss: true,
    maxHp: 420, speed: 1.6, radius: 0.62, damage: 18, attackRange: 1.8, attackWindup: 0.55, attackCooldown: 1.4,
    cash: 40, xp: 80, drops: { cash: 1, health: 1, upgrade: 0 },
    clips: { special: "Rifle_Charge_inplace" },
    charge: { cooldown: 5, telegraph: 1.0, speed: 12, distance: 13, recover: 1.6, damage: 28 },
  },
  tank: {
    label: "Mutant Tank", visuals: ["vanguard"], scale: 2.05, tint: [0.66, 0.55, 0.78], behavior: "tank", boss: true,
    maxHp: 900, speed: 0.95, radius: 0.85, damage: 30, attackRange: 2.2, attackWindup: 0.8, attackCooldown: 1.8,
    cash: 60, xp: 120, drops: { cash: 1, health: 1, upgrade: 0 },
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
  /** The death clip plays this long ("dying"), then the corpse lingers, sinks and returns to the pool. */
  dyingSeconds: 2.3,
  corpseSeconds: 0.6,
  /** Enemies push each other apart within this factor of their radii. */
  separation: 1.05,
};

/* ------------------------------------------------------------------------------------------------
 * Waves / spawning
 *
 * A run is a sequence of WAVES (timed survival phases). Everything a wave does is data here, with no
 * map-specific values, so another biome (space, hell) can use its own wave list, enemy roster and map
 * without touching the systems. Character level / XP is a separate system (XP below).
 * ---------------------------------------------------------------------------------------------- */

/** Regular (non-boss) enemy types a wave can spawn. */
export type WaveEnemyId = Exclude<EnemyId, "brute" | "charger" | "tank">;
export type BossId = Extract<EnemyId, "brute" | "charger" | "tank">;

/** One pacing step of a wave, in effect from `at` seconds until the next step. */
export interface WavePhase {
  at: number;
  /** Seconds between groups. */
  spawnInterval: number;
  /** Group size range (a group comes from one direction). */
  group: [number, number];
  /** No new groups while this many enemies are alive. */
  maxAlive: number;
  /** Relative spawn weights of the enemy types in this step. */
  weights: Partial<Record<WaveEnemyId, number>>;
}

export interface WaveDef {
  label: string;
  /** Seconds of survival; the wave completes when it runs out (after the boss dies, if it has one). */
  duration: number;
  /** Enemies placed just outside the view at the start, so the first ones walk in within ~1-2 s. */
  prespawn: number;
  phases: WavePhase[];
  /** Enemy HP / damage multipliers (difficulty). */
  hpScale: number;
  damageScale: number;
  /** Optional boss: arrives when the time runs out; regular spawning continues at `spawnFactor` of the last step's rate. */
  boss?: { type: BossId; spawnFactor: number };
}

export const WAVES: WaveDef[] = [
  {
    // ~55 s, no boss: small walker groups, rising pressure, the first runners after 30 s.
    label: "Wave 1", duration: 55, prespawn: 6, hpScale: 1, damageScale: 1,
    phases: [
      { at: 0, spawnInterval: 3.2, group: [2, 3], maxAlive: 9, weights: { walker: 1 } },
      { at: 10, spawnInterval: 2.8, group: [3, 4], maxAlive: 12, weights: { walker: 1 } },
      { at: 30, spawnInterval: 2.6, group: [3, 5], maxAlive: 15, weights: { walker: 1, runner: 0.15 } },
      { at: 45, spawnInterval: 2.0, group: [4, 6], maxAlive: 19, weights: { walker: 1, runner: 0.25 } },
    ],
  },
  {
    label: "Wave 2", duration: 75, prespawn: 8, hpScale: 1.15, damageScale: 1.05,
    phases: [
      { at: 0, spawnInterval: 2.8, group: [3, 4], maxAlive: 12, weights: { walker: 1, runner: 0.2 } },
      { at: 25, spawnInterval: 2.4, group: [3, 5], maxAlive: 16, weights: { walker: 1, runner: 0.35 } },
      { at: 55, spawnInterval: 2.0, group: [4, 6], maxAlive: 20, weights: { walker: 1, runner: 0.45 } },
    ],
    boss: { type: "brute", spawnFactor: 0.4 },
  },
  {
    label: "Wave 3", duration: 90, prespawn: 8, hpScale: 1.3, damageScale: 1.1,
    phases: [
      { at: 0, spawnInterval: 2.6, group: [3, 5], maxAlive: 14, weights: { walker: 1, runner: 0.35 } },
      { at: 20, spawnInterval: 2.3, group: [3, 5], maxAlive: 18, weights: { walker: 1, runner: 0.4, thrower: 0.2 } },
      { at: 60, spawnInterval: 1.9, group: [4, 6], maxAlive: 22, weights: { walker: 1, runner: 0.5, thrower: 0.3 } },
    ],
    boss: { type: "charger", spawnFactor: 0.35 },
  },
  {
    label: "Wave 4", duration: 110, prespawn: 10, hpScale: 1.55, damageScale: 1.2,
    phases: [
      { at: 0, spawnInterval: 2.4, group: [3, 5], maxAlive: 16, weights: { walker: 1, runner: 0.45, thrower: 0.25 } },
      { at: 40, spawnInterval: 2.0, group: [4, 6], maxAlive: 22, weights: { walker: 1, runner: 0.5, thrower: 0.3 } },
      { at: 80, spawnInterval: 1.7, group: [4, 7], maxAlive: 26, weights: { walker: 1, runner: 0.55, thrower: 0.35 } },
    ],
    boss: { type: "tank", spawnFactor: 0.3 },
  },
];

/**
 * Character XP and levels (independent of waves): kills give XP (EnemyDef.xp); each level-up offers a
 * choice of 3 upgrades. `toNext[i]` = XP from level i + 1 to i + 2; past the table each level needs
 * `growth` more than the one before.
 */
export const XP = {
  toNext: [50, 90, 140, 200, 270],
  growth: 80,
  /** Upgrade cards offered per level-up. */
  choices: 3,
};

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  const table = XP.toNext;
  return level <= table.length ? table[level - 1] : table[table.length - 1] + (level - table.length) * XP.growth;
}


export const SPAWNING = {
  /** Groups appear just outside the visible area (so they walk in soon, never pop in on screen): a
   * spawn point is the first point along a random direction that is off-screen by `screenMargin` px,
   * pushed out a further `extra` metres. Farther than `maxDistance`, the direction is skipped. */
  screenMargin: 30,
  extra: [0.6, 2.8] as [number, number],
  minDistance: 4.5,
  maxDistance: 24,
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
  | "rapidFire" | "heavyRounds" | "extendedMag" | "vitality" | "quickHands" | "piercing" | "adrenaline"
  | "incendiary" | "volatile" | "ricochet" | "splitShot" | "headhunter" | "chainLightning" | "drone" | "cryo" | "shockReload" | "bloodthirst"
  | "dragonsBreath"
  | "armor" | "crit" | "medkit" | "fifthShot" | "vampire";

/** PlayerStats numbers an upgrade (or a synergy tier) may change. */
export type UpgradeStat =
  | "damageMult" | "fireRateMult" | "reloadTimeMult" | "magazineBonus" | "moveSpeedMult" | "penetration"
  | "critChance" | "critMult" | "critPierce" | "armor" | "maxHp" | "fifthShot" | "vampireChance" | "healOnKill"
  | "burnDps" | "burnVulnerability" | "fireSpread" | "explodeChance" | "explodeDamage" | "explosionsIgnite"
  | "ricochet" | "extraBullets"
  | "chainChance" | "chainTargets" | "drones" | "techDamageMult" | "slowPct" | "shockDamage";

/**
 * One effect: `add` or `mul` a stat (clamped to `max` / `min`); `heal` restores HP (absolute) and
 * `healFraction` a fraction of max HP.
 */
export type UpgradeEffect =
  | { stat: UpgradeStat; op: "add" | "mul"; value: number; max?: number; min?: number }
  | { heal: number }
  | { healFraction: number };

/** Where an upgrade can be offered: level-up cards and/or rare world pickups. */
export type UpgradePool = "levelUp" | "drop";

/** Build families: owning several upgrades of one tag unlocks its synergy tiers (SYNERGIES). */
export type UpgradeTag = "fire" | "precision" | "tech";

/**
 * One upgrade, pure data: presentation (name, stat line, value, icon, category colour, rarity), its
 * effects per stack, the stack limit, its build tags and the pools it appears in. Upgrades.ts applies
 * effects generically; combat reads the resulting PlayerStats numbers (gameplay/Combat.ts). The
 * level-up cards, pickup badges and toasts draw from these fields. A new upgrade is one entry here.
 */
export interface UpgradeDef {
  id: UpgradeId;
  /** Display name ("Rapid Fire"). */
  name: string;
  /** What it changes ("Fire Rate") and by how much per stack ("+15%"). */
  stat: string;
  value: string;
  icon: UpgradeIcon;
  category: UpgradeCategory;
  rarity: UpgradeRarity;
  effects: UpgradeEffect[];
  /** How many times it can be taken per run (default unlimited). */
  maxStacks?: number;
  /** Default: both pools. */
  pools?: UpgradePool[];
  tags?: UpgradeTag[];
  /** Evolution: only offered once these upgrades have these many stacks; then always offered first. */
  requires?: { id: UpgradeId; stacks: number }[];
}

export const UPGRADES: UpgradeDef[] = [
  // ---- Level-up pool: stats.
  { id: "rapidFire", name: "Rapid Fire", stat: "Fire Rate", value: "+15%", icon: "bullets", category: "weapon", rarity: "common", maxStacks: 5, tags: ["precision"],
    effects: [{ stat: "fireRateMult", op: "mul", value: 1.15 }] },
  { id: "heavyRounds", name: "Heavy Rounds", stat: "Weapon Damage", value: "+20%", icon: "bullet", category: "weapon", rarity: "common", maxStacks: 5,
    effects: [{ stat: "damageMult", op: "mul", value: 1.2 }] },
  { id: "extendedMag", name: "Extended Magazine", stat: "Magazine", value: "+3 rounds", icon: "magazine", category: "weapon", rarity: "common", maxStacks: 4, tags: ["tech"],
    effects: [{ stat: "magazineBonus", op: "add", value: 3 }] },
  { id: "vitality", name: "Vitality", stat: "Max HP", value: "+20", icon: "heart", category: "player", rarity: "common", maxStacks: 5,
    effects: [{ stat: "maxHp", op: "add", value: 20 }, { heal: 20 }] },
  { id: "quickHands", name: "Quick Hands", stat: "Reload Time", value: "-20%", icon: "reload", category: "weapon", rarity: "common", maxStacks: 3, tags: ["tech"],
    effects: [{ stat: "reloadTimeMult", op: "mul", value: 0.8 }] },
  { id: "piercing", name: "Piercing Round", stat: "Bullets Pierce", value: "+1 enemy", icon: "pierce", category: "weapon", rarity: "rare", maxStacks: 3, tags: ["precision"],
    effects: [{ stat: "penetration", op: "add", value: 1 }] },
  { id: "adrenaline", name: "Adrenaline", stat: "Movement Speed", value: "+10%", icon: "boot", category: "player", rarity: "common", maxStacks: 3,
    effects: [{ stat: "moveSpeedMult", op: "mul", value: 1.1 }] },
  // ---- Level-up pool: behaviour-changing.
  { id: "incendiary", name: "Incendiary Rounds", stat: "Hits Set Enemies on Fire", value: "+4 burn/s", icon: "flame", category: "special", rarity: "rare", maxStacks: 3, tags: ["fire"],
    effects: [{ stat: "burnDps", op: "add", value: 4 }] },
  { id: "volatile", name: "Volatile Corpses", stat: "Kills Explode (18 dmg)", value: "+30% chance", icon: "burst", category: "special", rarity: "rare", maxStacks: 3, tags: ["fire"],
    effects: [{ stat: "explodeChance", op: "add", value: 0.3, max: 1 }, { stat: "explodeDamage", op: "add", value: 6 }] },
  { id: "ricochet", name: "Ricochet", stat: "Bullets Bounce to", value: "+1 enemy", icon: "ricochet", category: "weapon", rarity: "rare", maxStacks: 3, tags: ["precision"],
    effects: [{ stat: "ricochet", op: "add", value: 1 }] },
  { id: "splitShot", name: "Split Shot", stat: "Bullets per Shot", value: "+1", icon: "split", category: "weapon", rarity: "epic", maxStacks: 2, tags: ["precision"],
    effects: [{ stat: "extraBullets", op: "add", value: 1 }] },
  { id: "headhunter", name: "Headhunter", stat: "Crit Chance +8%", value: "Crit Damage +50%", icon: "target", category: "weapon", rarity: "common", maxStacks: 3, tags: ["precision"],
    effects: [{ stat: "critChance", op: "add", value: 0.08, max: 0.7 }, { stat: "critMult", op: "add", value: 0.5 }] },
  { id: "chainLightning", name: "Chain Lightning", stat: "Hits Arc to 2 Enemies", value: "+15% chance", icon: "rapid", category: "special", rarity: "rare", maxStacks: 3, tags: ["tech"],
    effects: [{ stat: "chainChance", op: "add", value: 0.15, max: 1 }] },
  { id: "drone", name: "Sentry Drone", stat: "Orbiting Drone", value: "+1 drone", icon: "drone", category: "special", rarity: "epic", maxStacks: 3, tags: ["tech"],
    effects: [{ stat: "drones", op: "add", value: 1 }] },
  { id: "cryo", name: "Cryo Rounds", stat: "Hits Slow Enemies", value: "+15% slow", icon: "snowflake", category: "special", rarity: "common", maxStacks: 3, tags: ["tech"],
    effects: [{ stat: "slowPct", op: "add", value: 0.15, max: 0.6 }] },
  { id: "shockReload", name: "Shock Reload", stat: "Reloading Blasts Nearby", value: "+25 damage", icon: "pulse", category: "special", rarity: "rare", maxStacks: 2, tags: ["tech"],
    effects: [{ stat: "shockDamage", op: "add", value: 25 }] },
  { id: "bloodthirst", name: "Bloodthirst", stat: "Heal on Kill", value: "+1 HP", icon: "drop", category: "player", rarity: "common", maxStacks: 3,
    effects: [{ stat: "healOnKill", op: "add", value: 1 }] },
  // ---- Evolution (offered once its requirements are met).
  { id: "dragonsBreath", name: "Dragon's Breath", stat: "Kills Explode in Flames ·", value: "Burn x2", icon: "flame", category: "special", rarity: "epic", maxStacks: 1, pools: ["levelUp"], tags: ["fire"],
    requires: [{ id: "incendiary", stacks: 3 }, { id: "volatile", stacks: 1 }],
    effects: [{ stat: "burnDps", op: "mul", value: 2 }, { stat: "explodeChance", op: "add", value: 1, max: 1 }, { stat: "explosionsIgnite", op: "add", value: 1, max: 1 }, { stat: "explodeDamage", op: "add", value: 10 }] },
  // ---- Rare world pickups only.
  { id: "armor", name: "Scrap Plating", stat: "Damage Resistance", value: "+10%", icon: "shield", category: "player", rarity: "common", maxStacks: 5, pools: ["drop"],
    effects: [{ stat: "armor", op: "add", value: 0.1, max: 0.6 }] },
  { id: "crit", name: "Steady Hand", stat: "Critical Chance", value: "+10%", icon: "target", category: "weapon", rarity: "rare", maxStacks: 5, pools: ["drop"],
    effects: [{ stat: "critChance", op: "add", value: 0.1, max: 0.7 }] },
  { id: "medkit", name: "Field Medkit", stat: "Restore HP", value: "30%", icon: "medkit", category: "player", rarity: "common", pools: ["drop"],
    effects: [{ healFraction: 0.3 }] },
  { id: "fifthShot", name: "Fifth Shot", stat: "Every 5th Bullet", value: "+150% damage", icon: "star", category: "special", rarity: "epic", maxStacks: 1, pools: ["drop"],
    effects: [{ stat: "fifthShot", op: "add", value: 1, max: 1 }] },
  { id: "vampire", name: "Scavenger", stat: "Heal 5 HP on Kill", value: "6% chance", icon: "drop", category: "special", rarity: "rare", maxStacks: 3, pools: ["drop"],
    effects: [{ stat: "vampireChance", op: "add", value: 0.06, max: 0.2 }] },
];

/**
 * Synergies: each upgrade stack with a tag counts toward that tag; reaching a tier's count applies its
 * effects once (the level-up screen shows progress, a toast announces the tier).
 */
export interface SynergyTier {
  count: number;
  name: string;
  text: string;
  effects: UpgradeEffect[];
}

export const SYNERGIES: Record<UpgradeTag, { label: string; color: string; icon: UpgradeIcon; tiers: SynergyTier[] }> = {
  fire: {
    label: "Fire", color: "#e8653a", icon: "flame",
    tiers: [
      { count: 3, name: "Kindling", text: "Burning enemies take +25% damage", effects: [{ stat: "burnVulnerability", op: "add", value: 0.25 }] },
      { count: 5, name: "Wildfire", text: "Burning enemies spread fire when they die", effects: [{ stat: "fireSpread", op: "add", value: 1, max: 1 }] },
    ],
  },
  precision: {
    label: "Precision", color: "#e8c35a", icon: "target",
    tiers: [
      { count: 3, name: "Marksman", text: "Crit Chance +10%", effects: [{ stat: "critChance", op: "add", value: 0.1, max: 0.8 }] },
      { count: 5, name: "Deadeye", text: "Crits pierce +1 enemy", effects: [{ stat: "critPierce", op: "add", value: 1 }] },
    ],
  },
  tech: {
    label: "Tech", color: "#4fb8ff", icon: "drone",
    tiers: [
      { count: 3, name: "Overcharge", text: "Drones, arcs and shocks +30% damage", effects: [{ stat: "techDamageMult", op: "mul", value: 1.3 }] },
      { count: 5, name: "Overclock", text: "+1 drone, arcs hit +1 enemy", effects: [{ stat: "drones", op: "add", value: 1 }, { stat: "chainTargets", op: "add", value: 1 }] },
    ],
  },
};

/** Level-up screen: rerolls and banishes per run (+ rerolls gained at every wave start). */
export const LEVEL_UP = { rerolls: 2, rerollsPerWave: 1, banishes: 2 };

/**
 * Tuning of the behaviour upgrades (the per-stack numbers are in UPGRADES; these are the fixed ones).
 */
export const COMBAT_FX = {
  burnSeconds: 3,
  burnTick: 0.5,
  explodeRadius: 2.2,
  /** Explosions triggered per frame at most (chain reactions spread over frames). */
  maxExplosionsPerFrame: 6,
  ricochetRange: 5.5,
  ricochetDamage: 0.7,
  splitSpreadDeg: 8,
  chainRange: 4.5,
  chainDamage: 0.6,
  droneDamage: 9,
  droneInterval: 0.9,
  droneRange: 9,
  slowSeconds: 1.5,
  shockRadius: 3,
  shockKnockback: 0.6,
  fireSpreadRadius: 2.2,
};

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
