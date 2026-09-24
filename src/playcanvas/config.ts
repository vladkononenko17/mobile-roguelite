// Tuning for the PlayCanvas 3D vertical slice. Units are metres, seconds and degrees.
// Everything a designer is likely to tweak while judging the visual direction lives here.
// The in-game "tune" panel edits the CAMERA and CHARACTER values live.

export interface CharacterModel {
  label: string;
  url: string;
  /** Ground speed (m/s) at which the Walking / Running clips' feet do not slide at playback
   * speed 1 and scale 1. Measured by tracing the planted toe bone across each clip. */
  walkNativeSpeed: number;
  runNativeSpeed: number;
  /** Per-model clip names, overriding ANIMATION.clips (matching is case-insensitive). */
  clips?: Partial<typeof ANIMATION.clips>;
  /** Build the breathing idle from the idle clip (for models whose only "idle" is a static rest pose). */
  proceduralIdle?: boolean;
  /**
   * Palm grip frames, one per hand, in that hand bone's own space (see GripFrame): `position` is
   * the middle of the palm where a held handle touches it, `axis` runs across the palm from the
   * little finger to the index finger, `palm` points from the handle into the palm. A weapon with
   * `grips` is placed so its right grip meets `hands.right` (the WeaponSocket), and left-hand IK
   * brings `hands.left` onto its left grip. Characters without `hands` use the weapons' legacy
   * position / rotation.
   */
  hands?: { right: GripFrame; left: GripFrame };
  /**
   * Finger rig for the procedural grip (player/FingerGrip.ts). `rigid`: the whole finger is skinned
   * to its first joint (bend only there, measure contact at the chain's tip). `curlAxis`: the local
   * axis that bends a finger toward the palm. `thickness`: finger half-thickness (m, bone space).
   */
  fingers?: { rigid: boolean; curlAxis: Vec3Tuple; thickness: number };
  /**
   * Legacy weapon placement only (weapons without `grips`): this rig's hand-bone roll about +Y
   * relative to the Vanguard's hand, which those transforms were authored on (degrees).
   */
  handRollDeg?: { left: number; right: number };
}

export type Vec3Tuple = [number, number, number];

/**
 * A grip as a frame, shared by weapons (the handle being held) and hands (the palm holding it).
 * `axis` runs along the handle from the little-finger side to the index-finger side; `palm` points
 * from the handle axis toward the palm (it is made perpendicular to `axis`). With X = axis x palm,
 * these give a right-handed frame, so a weapon grip and a hand grip line up by matching frames.
 */
export interface GripFrame {
  position: Vec3Tuple;
  axis: Vec3Tuple;
  palm: Vec3Tuple;
}

/** A weapon's grip: `position` on the handle's axis, `radius` from the axis to the surface the palm touches. */
export interface WeaponGrip extends GripFrame {
  radius: number;
  /** The left hand may roll around the handle axis by up to this much to follow the animated wrist. */
  rollRangeDeg?: number;
}

/** Character GLBs selectable from the tune panel. All use a Mixamo-style rig with Walking / Running clips. */
export const CHARACTERS = {
  survivor: {
    label: "Survivor (V3)",
    // "Zombie Apocalypse Survivor" (Mixamo rig) built by scripts/build-survivor.mjs: its own three
    // Mixamo idles plus every Vanguard clip retargeted onto it (same bone names, bone directions
    // matched, so the weapon poses carry over). Texture resized to 2048 WebP.
    url: "models/survivor/survivor.glb",
    // Vanguard's clips on ~3% longer legs.
    walkNativeSpeed: 1.49,
    runNativeSpeed: 4.72,
    clips: { idle: "Survivor_Idle" },
    proceduralIdle: false,
    // Measured on the mesh (scripts in assets-src notes): palm surface z ~ +0.025 in hand space,
    // knuckles at y 0.12, thumb on +x (right) / -x (left). The handle crosses the palm diagonally,
    // the index end nearer the knuckles.
    hands: {
      right: { position: [0.005, 0.085, 0.03], axis: [0.966, 0.259, 0], palm: [0, 0, -1] },
      left: { position: [-0.005, 0.085, 0.03], axis: [-0.966, 0.259, 0], palm: [0, 0, -1] },
    },
    // One finger bone per hand (HandIndex1) carries all four fingers; Index2-4 drive no vertices,
    // and there are no thumb bones (the thumb is skinned to the hand).
    fingers: { rigid: true, curlAxis: [1, 0, 0], thickness: 0.011 },
    handRollDeg: { left: -237.0, right: -116.8 },
  },
  vanguard: {
    label: "Ironclad Vanguard",
    // Unmodified mesh, rig and all 17 animations; textures resized to max 2048 and stored as WebP
    // (22.6 MB -> 5.4 MB).
    url: "models/vanguard/Meshy_AI_Ironclad_Vanguard_All_Animations_2k.glb",
    walkNativeSpeed: 1.45,
    runNativeSpeed: 4.6,
    // Has a real idle, so no procedural breathing. The weapon clips (Run_and_Shoot,
    // Rifle_Charge_inplace, Running_Reload, Axe_Spin_Attack, ...) are loaded but not used yet.
    clips: { idle: "Idle_10" },
    proceduralIdle: false,
    // Sculpted fists (no finger bones). Palm frames derived from the rifle hold verified on this
    // model (grip in the right fist, left fist under the handguard).
    hands: {
      right: { position: [0.036, 0.026, 0.023], axis: [-0.661, 0.464, 0.589], palm: [0.499, -0.314, 0.808] },
      left: { position: [0.067, 0.071, 0.051], axis: [0.625, -0.026, 0.78], palm: [-0.775, -0.143, 0.616] },
    },
  },
  brawler2k: {
    label: "Brawler (2K tex)",
    // Unmodified mesh, rig, animations and materials; only textures resized 4096 -> 2048.
    url: "models/brawler/Meshy_AI_Wasteland_Brawler_All_Animations_2k.glb",
    walkNativeSpeed: 1.2,
    runNativeSpeed: 3.9,
  },
  brawler4k: {
    label: "Brawler (original 4K)",
    url: "models/brawler/Meshy_AI_Wasteland_Brawler_All_Animations.glb",
    walkNativeSpeed: 1.2,
    runNativeSpeed: 3.9,
  },
  orc: {
    label: "Iron Shoulder Orc",
    url: "models/orc/Meshy_AI_Iron_Shoulder_Orc_All_Animations.glb",
    walkNativeSpeed: 1.3,
    runNativeSpeed: 3.9,
  },
} satisfies Record<string, CharacterModel>;

export type CharacterId = keyof typeof CHARACTERS;

/**
 * Hand-held weapons ("assetpack-free", merged by scripts/build-weapons.mjs). The chosen weapon is
 * parented to the hero's right-hand bone. Weapons point their muzzle along -Z with the origin at
 * the grip; the Mixamo hand bone points its +Y along the fingers, so +90° about X lays the barrel
 * along the hand with the weapon's top facing the back of the hand. `rollDeg` then turns the weapon
 * about the hand's finger axis; -43° keeps a rifle upright (not canted) in the Vanguard's aiming
 * pose (Run_and_Shoot). `position` is in hand-bone space (metres, before the character scale).
 * `class` picks the weapon class (WEAPON_CLASSES: pose and hand behaviour);
 * `attack` is the full-body clip played once by the attack action (Space / on-screen button).
 * Optional `scale` resizes the weapon.
 *
 * Optional `grips` (weapon space, muzzle -Z; see GripFrame) define how hands hold it: `right` is the
 * handle the right hand holds (the pistol grip; it goes on the hand's WeaponSocket), `left` the
 * second hand's grip (a rifle's handguard, a pistol's support grip over the right hand, later an axe's
 * lower handle). How the weapon is held (pose, placement, IK) comes from its class. On a
 * character with `hands`, the weapon is parented to the right hand's WeaponSocket so its right grip
 * sits in the palm (the right hand leads, the weapon follows it); the left hand is put on the left
 * grip by IK and both hands' fingers wrap the handles (player/WeaponHands.ts). Markers named
 * RightHandGrip / LeftHandGrip are created on the held weapon. `position` / `rotation` / `rollDeg`
 * are the legacy placement used for characters without `hands`.
 */
export const WEAPONS = {
  url: "models/weapons/weapons.glb",
  handBone: "mixamorig:RightHand",
  // Grip frames below were measured on each model (weapon space: muzzle -Z, top +Y; metres). `stock`
  // is the centre of the butt plate (shoulder-held classes).
  list: {
    // "assetpack-free" (textured)
    // Pistol grip 4.2 cm wide, slanting back from (y 0, z 0.04) to (y -0.07, z 0.075); handguard a
    // 3 x 7 cm slab (y 0.063-0.13) from z -0.32 to -0.14. Right palm on the right side of the pistol
    // grip, left palm under and to the left of the handguard.
    rifle: {
      label: "Assault rifle", class: "rifle", node: "assault_rifle_2", position: [-0.0057, 0.0893, 0.0247], rotation: [80.8, -42.19, 13.56], rollDeg: 0, attack: null,
      grips: {
        right: { position: [0, -0.035, 0.058], axis: [0, 0.88, -0.47], palm: [0.85, 0.25, 0.47], radius: 0.021 },
        left: { position: [0, 0.096, -0.23], axis: [0, 0, -1], palm: [-0.5, -0.866, 0], radius: 0.03, rollRangeDeg: 35 },
      },
    },
    // 86 cm pump gun: pistol grip y -0.08..-0.01 (z 0.05-0.13, top further back), pump / fore-end
    // under the barrel z -0.26..-0.09 (y 0-0.05), butt plate at z 0.29.
    shotgun: {
      label: "Shotgun", class: "shotgun", node: "shotgun_2", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, attack: null,
      grips: {
        right: { position: [0, -0.04, 0.083], axis: [0, 0.864, 0.504], palm: [0.85, -0.26, 0.45], radius: 0.02 },
        left: { position: [0, 0.025, -0.15], axis: [0, 0, -1], palm: [-0.5, -0.866, 0], radius: 0.03, rollRangeDeg: 35 },
      },
      stock: [0, 0.005, 0.28],
    },
    sniper: { label: "Sniper rifle", class: "rifle", node: "sniper_2", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, attack: null },
    // Grip y -0.06..0, z ~0.03-0.09, 2.8 cm wide; slide above it. Two-handed support grip: the left
    // palm sits on the FRONT-LEFT of the grip, a little low (under the trigger guard), over the right
    // hand's fingers, facing back-right into the grip; its fingers point forward-right and wrap around
    // the front of the shooting hand. (A support palm flat on the grip's left side left the fingers
    // sticking straight forward past the gun: an open hand floating beside it from the top camera.)
    pistol: {
      label: "Pistol", class: "pistol", node: "pistol_1", position: [0, 0.08, 0.03], rotation: [90, 0, 0], rollDeg: -43, attack: null,
      grips: {
        right: { position: [0, -0.03, 0.06], axis: [0, 0.96, -0.28], palm: [0.9, 0.08, 0.28], radius: 0.016 },
        left: { position: [0, -0.045, 0.05], axis: [0, 0.96, -0.28], palm: [-0.7, -0.05, -0.7], radius: 0.045, rollRangeDeg: 15 },
      },
    },
    knife: { label: "Knife", class: "axe", node: "tactical_knife", position: [0, 0.08, 0.01], rotation: [90, 0, 0], rollDeg: 0, attack: "Attack" },
    grenade: { label: "Grenade", class: "axe", node: "frag_grenade", position: [0, 0.09, -0.01], rotation: [90, 0, 0], rollDeg: 0, attack: null },
    // "Flat Guns East" (flat colours)
    eastRifle: { label: "Rifle (East)", class: "rifle", node: "Rifle_Assault_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, attack: null },
    eastBattleRifle: { label: "Battle rifle (East)", class: "rifle", node: "Rifle_Battle_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, attack: null },
    eastSmg: { label: "SMG (East)", class: "rifle", node: "SMG_Full_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, attack: null },
    eastSmgCompact: { label: "Compact SMG (East)", class: "rifle", node: "SMG_Compact_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, attack: null },
    // Box-magazine auto shotgun: pistol grip y -0.12..-0.02 at z ~0.2, fore-end z -0.28..-0.05, butt z 0.39.
    eastShotgun: {
      label: "Auto shotgun (East)", class: "shotgun", node: "Shotgun_Auto_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, attack: null,
      grips: {
        right: { position: [0, -0.07, 0.205], axis: [0, 0.98, -0.2], palm: [0.85, 0.1, 0.5], radius: 0.02 },
        left: { position: [0, 0.02, -0.11], axis: [0, 0, -1], palm: [-0.5, -0.866, 0], radius: 0.03, rollRangeDeg: 35 },
      },
      stock: [0, 0, 0.39],
    },
    // Straight-stock pump gun (no pistol grip): the right hand takes the stock's wrist at z ~0.2;
    // pump z -0.29..-0.08 under the barrel; butt z 0.42, low (y -0.045).
    eastPumpShotgun: {
      label: "Pump shotgun (East)", class: "shotgun", node: "Shotgun_Pump_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, attack: null,
      grips: {
        right: { position: [0, -0.02, 0.2], axis: [0, 0.97, 0.24], palm: [0.85, -0.13, 0.5], radius: 0.02 },
        left: { position: [0, 0, -0.12], axis: [0, 0, -1], palm: [-0.5, -0.866, 0], radius: 0.028, rollRangeDeg: 35 },
      },
      stock: [0, -0.045, 0.42],
    },
    eastSniper: { label: "Sniper (East)", class: "rifle", node: "Sniper_Rifle_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, attack: null },
    eastMarksman: { label: "Marksman rifle (East)", class: "rifle", node: "Sniper_Material_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, attack: null },
    // Grip y -0.11..-0.03 at z ~0.06 (full) / y -0.09..-0.02 at z ~0.03 (compact).
    eastPistol: {
      label: "Pistol (East)", class: "pistol", node: "Pistol_Full_East", position: [0, 0.08, 0.03], rotation: [90, 0, 0], rollDeg: -43, attack: null,
      grips: {
        right: { position: [0, -0.07, 0.06], axis: [0, 0.98, -0.21], palm: [0.9, 0.09, 0.42], radius: 0.016 },
        left: { position: [0, -0.085, 0.055], axis: [0, 0.98, -0.21], palm: [-0.7, -0.05, -0.7], radius: 0.045, rollRangeDeg: 15 },
      },
    },
    eastPistolCompact: {
      label: "Compact pistol (East)", class: "pistol", node: "Pistol_Compact_East", position: [0, 0.08, 0.03], rotation: [90, 0, 0], rollDeg: -43, attack: null,
      grips: {
        right: { position: [0, -0.055, 0.03], axis: [0, 0.98, -0.21], palm: [0.9, 0.09, 0.42], radius: 0.016 },
        left: { position: [0, -0.07, 0.025], axis: [0, 0.98, -0.21], palm: [-0.7, -0.05, -0.7], radius: 0.045, rollRangeDeg: 15 },
      },
    },
    // Low poly axe (handle along -Y, head at the top, blade toward -X), held ~0.62 m down the handle
    // with the legacy placement: that carry keeps the head away from the body in idle and run, while a
    // grip-fitted hold swung the head up by the character's head. Locomotion and attack clips move it.
    axe: { label: "Axe", class: "axe", node: "low_poly_axe", position: [0, 0.08, 0.62], rotation: [90, 0, 0], rollDeg: 0, attack: "Axe_Spin_Attack" },
  },
} satisfies {
  url: string;
  handBone: string;
  list: Record<string, WeaponDef>;
};

/**
 * Weapon classes: how a kind of weapon is carried. The class sets the pose and the hand behaviour;
 * each weapon in WEAPONS sets its exact grips (and stock). Only weapons with `grips` (on characters
 * with `hands`) are placed by the class `hold`; the others hang from the hand with their legacy
 * transform and only get the class `pose`.
 */
export type WeaponClass = "pistol" | "rifle" | "shotgun" | "axe" | "heavy";

export interface WeaponClassProfile {
  /** Upper-body clip over locomotion: a clip name, "@idle" (the character's own idle, a calm base
   * for IK holds) or null (plain locomotion arms). */
  pose: string | null;
  /**
   * How a gripped weapon is placed each frame:
   * - "clip": the right palm stays where the upper-body clip puts it and the hand turns into a grip
   *   that aims along the animated hand (the rifle; uses the spine aim twist);
   * - "chest": the right grip is held at `anchor` (right / up / forward of the chest bone, in the
   *   hero's facing frame), aiming along the facing;
   * - "shoulder": the weapon's `stock` sits at `anchor` (from the right shoulder joint), aiming along
   *   the facing;
   * - "hand": the weapon simply follows the animated right hand (melee: attacks move it freely).
   */
  hold: "clip" | "chest" | "shoulder" | "hand";
  /** Metres before the character scale (see `hold`). */
  anchor?: Vec3Tuple;
  /** Aim pitch standing still and at running speed (degrees, negative = muzzle down). */
  pitchDeg?: number;
  runPitchDeg?: number;
  /** Anchor shift at running speed (a lowered ready carry), metres before the character scale. */
  runAnchorShift?: Vec3Tuple;
  /**
   * Where the elbows point (from the shoulders), in the hero's facing frame: [outward, up, forward],
   * mirrored for the left arm; `elbowWeight` = how strongly (0 = elbows just straighten the wrists).
   * Keeps upper arms out of the torso silhouette as seen from the top-down camera.
   */
  elbows?: Vec3Tuple;
  /** Left elbow direction if it differs (a support arm crossing to the centre bulges outward). */
  elbowsLeft?: Vec3Tuple;
  elbowWeight?: number;
  /** Left arm IK onto the weapon's left grip. */
  leftHandIK: boolean;
  /** Procedural finger wrap around the grips. */
  fingerGrip: boolean;
  /** Spine twist so a clip-aimed weapon points where the hero faces. */
  aimTwist: boolean;
}

export const WEAPON_CLASSES: Record<WeaponClass, WeaponClassProfile> = {
  // Compact two-handed ready stance in front of the upper chest, over the character's idle upper body.
  // Elbows pushed out and a little down so both upper arms stay visible beside the torso from above.
  pistol: {
    pose: "@idle", hold: "chest", anchor: [-0.02, -0.01, 0.44], pitchDeg: -4, runPitchDeg: -4, elbows: [0.8, -0.55, 0.3], elbowsLeft: [0.2, -0.9, 0.5], elbowWeight: 2,
    leftHandIK: true, fingerGrip: true, aimTwist: false,
  },
  // The aiming clip drives the arms; hands are fitted to the rifle.
  rifle: { pose: "Run_and_Shoot", hold: "clip", leftHandIK: true, fingerGrip: true, aimTwist: true },
  // Stock in the right shoulder pocket (inside the shoulder joint), level; at a run the stock drops
  // off the shoulder toward the chest and the muzzle dips into a low ready carry across the body.
  shotgun: {
    pose: "@idle", hold: "shoulder", anchor: [-0.05, -0.03, 0.04], pitchDeg: -2, runPitchDeg: -16, runAnchorShift: [-0.07, -0.06, 0.02],
    leftHandIK: true, fingerGrip: true, aimTwist: false,
  },
  // One-handed melee: locomotion (and attack clips) move the arm; the fingers close on the handle.
  axe: { pose: null, hold: "hand", leftHandIK: false, fingerGrip: true, aimTwist: false },
  // Hip-carried heavy weapon (minigun), both hands; no weapon uses it yet.
  heavy: { pose: "@idle", hold: "chest", anchor: [0.1, -0.3, 0.32], pitchDeg: 0, runPitchDeg: -6, leftHandIK: true, fingerGrip: true, aimTwist: false },
};

export interface WeaponDef {
  label: string;
  class: WeaponClass;
  node: string;
  /** Legacy placement in the hand (weapons without `grips`, or characters without `hands`). */
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  rollDeg: number;
  scale?: number;
  grips?: { right: WeaponGrip; left?: WeaponGrip };
  /** Butt plate centre (weapon space), for shoulder-held classes. */
  stock?: Vec3Tuple;
  attack: string | null;
}

export type WeaponId = keyof typeof WEAPONS.list;
export const DEFAULT_WEAPON: WeaponId | null = "rifle";
export const DEFAULT_CHARACTER: CharacterId = "survivor";

import type { SurfaceTextures } from "./world/Surface";

/**
 * Stylized ground (world/Ground.ts). Surfaces are painted procedurally at load (no downloads, no
 * normal maps): flat low-contrast colour fields with soft blotches and a few specks, matching the
 * flat-shaded Atomic Realm kit. Colours are sRGB. The level decides where each surface goes.
 */
export const GROUND = {
  /** Metres covered by one repeat of the base / patch textures. */
  tileMetres: 10,
  patchTileMetres: 6,
  /** Overall multiplier; the ground stays a little darker than the props and the hero. */
  brightness: 0.7,
  surfaces: {
    /** Sun-baked sand: the default ground everywhere. */
    sand: { base: "#a68f6b", dark: "#97805e", light: "#b39c78", speckDark: "#7f6a50", speckLight: "#c0ab88", specks: 650 },
    /** Packed dirt: tracks and paths where people and vehicles went. */
    dirt: { base: "#977554", dark: "#866647", light: "#a58462", speckDark: "#6f5842", speckLight: "#b39576", specks: 700 },
    /** Poured concrete slabs (industrial yard). */
    concrete: { base: "#7f7a72", dark: "#736e67", light: "#8a857c", speckDark: "#625e58", speckLight: "#96918a", specks: 450, slabs: 4, seam: "#5d5953" },
    /** Scorched, infected soil (destroyed area). */
    ash: { base: "#5e5450", dark: "#4f4643", light: "#6c605a", speckDark: "#3c3432", speckLight: "#6f7650", specks: 800 },
  },
} as const;

export type GroundSurface = keyof typeof GROUND.surfaces;

/**
 * Environment-kit materials (world/kit). Every kit mesh carries UVs in metres, so `tileMetres` is
 * the texel density: a 1K texture over 2 m is ~512 px/m on every piece regardless of its size.
 * Normal maps are OpenGL (+Y) convention, which PlayCanvas expects. No AO maps ship with these
 * sets, and displacement is deliberately unused (no tessellation on mobile).
 */
export const KIT_SURFACES = {
  brick: {
    folder: "textures/broken_brick_wall",
    diffuse: "broken_brick_wall_diff_1k.jpg",
    normal: "broken_brick_wall_nor_gl_1k.jpg",
    // The roughness map only spans 0.85-1.0, so a constant saves a texture fetch.
    roughness: 0.93,
    bumpiness: 1,
    tileMetres: 2,
  },
  concrete: {
    folder: "textures/cracked_concrete",
    diffuse: "cracked_concrete_diff_1k.jpg",
    normal: "cracked_concrete_nor_gl_1k.jpg",
    roughnessMap: "cracked_concrete_rough_1k.jpg",
    bumpiness: 1,
    tileMetres: 2.5,
  },
  rust: {
    folder: "textures/rusty_metal_04",
    diffuse: "rusty_metal_04_diff_1k.jpg",
    normal: "rusty_metal_04_nor_gl_1k.jpg",
    // Roughness in G, metalness in B: bare steel reads metallic, rust stays matte.
    roughMetalMap: "rusty_metal_04_rough_metal_1k.jpg",
    bumpiness: 1,
    tileMetres: 2,
  },
  painted: {
    folder: "textures/rusty_metal_grid",
    diffuse: "rusty_metal_grid_diff_1k.jpg",
    normal: "rusty_metal_grid_nor_gl_1k.jpg",
    roughnessMap: "rusty_metal_grid_rough_1k.jpg",
    bumpiness: 1,
    tileMetres: 3,
  },
  planks: {
    folder: "textures/worn_planks",
    diffuse: "worn_planks_diff_1k.jpg",
    normal: "worn_planks_nor_gl_1k.jpg",
    roughnessMap: "worn_planks_rough_1k.jpg",
    bumpiness: 1,
    tileMetres: 1.6,
  },
} satisfies Record<string, SurfaceTextures>;

/** Kit pieces are slightly dimmed so the hero stays the brightest, most saturated thing on screen. */
export const KIT = {
  brightness: 0.85,
  /** Per-material colour multipliers: the teal paint is pulled towards a faded grey-green so the
   * panels stay muted accents rather than bright surfaces. */
  tints: { painted: [0.78, 0.76, 0.7] } as Partial<Record<string, readonly [number, number, number]>>,
  /** Static batching: pieces sharing a material within this many metres merge into one draw call. */
  batchCellMetres: 24,
};

/**
 * Level 1 environment kit: Atomic Realm (primary), CitySurvivalLite and 3dassets.dev CC0 props,
 * merged into one GLB by scripts/build-outpost-kit.mjs with every non-road material baked to
 * vertex colours on a single "palette" material (see that script).
 */
export const OUTPOST = {
  url: "models/outpost/outpost-kit.glb",
  /** Multiplier on the palette; the Atomic Realm colours are bright and sunny, and the hero should
   * stay the most saturated thing on screen. */
  brightness: 0.86,
  /** Static batching cell: pieces sharing a material within this many metres merge into one draw.
   * The portrait gameplay view is only ~12 x 18 m, so small cells let the camera skip most of the
   * level's triangles for a few extra draw calls. */
  batchCellMetres: 12,
};

export const CAMERA = {
  /** Downward tilt of the camera (0 = horizon, 90 = straight down). Because the hero sits below
   * the screen centre, the line of sight to him is a few degrees steeper than this. */
  pitchDeg: 52,
  /** Distance from the camera to the orbit pivot on the character, along the view direction.
   * Camera height follows from pitch + distance (+ screen offset); the tune panel shows it.
   * Arena shooter framing (measured on a 402x646 portrait phone): ~2.2x the ground area of the
   * old 50 deg / 9.5 m view (about 12 x 18 m), the hero about 13% of the screen height, so hordes,
   * boss attacks and projectiles are visible coming from every side. BASELINE: keep this distance
   * unless a gameplay reason calls for a change. */
  distance: 15.2,
  /** Vertical field of view, used in both portrait and landscape. */
  fovDeg: 42,
  /** How far below the screen centre the character sits, as a fraction of screen height.
   * 0.1 puts the pivot at 60% down the screen, leaving more room ahead of him. */
  screenOffset: 0.1,
  /** Point on the character the camera orbits, in metres above the feet at scale 1 (hips). */
  pivotHeight: 0.9,
  /** Follow smoothing; higher = tighter. Exponential, so frame-rate independent. */
  followSharpness: 8,
  /** Seconds of velocity the camera leads by, so running shows more ground ahead instead of the
   * follow lag pushing the hero towards the screen edge he is running at. */
  lookAheadTime: 0.25,
  /** World yaw of the camera. The camera does not rotate with the character. */
  yawDeg: 0,
  nearClip: 0.5,
  farClip: 95,
};

export const CHARACTER = {
  /** Uniform scale on the unmodified GLB (native height 1.70 m). A slightly heroic 1.15 reads
   * better at game-camera distance; stride-matched animation playback accounts for it. */
  scale: 1.15,
};

export const PLAYER = {
  /** Full-stick / keyboard speed. */
  runSpeed: 4.2,
  /** Speed used while holding Shift (and a light joystick push). */
  walkSpeed: 1.4,
  /** Velocity smoothing when speeding up / slowing down (per second, exponential). */
  acceleration: 12,
  deceleration: 16,
  /** Turn smoothing towards the movement direction (per second, exponential). */
  turnSharpness: 14,
  /** Input magnitudes below this are ignored (joystick dead zone). */
  inputDeadZone: 0.12,
  /** Square play area half-size around the origin (a safety clamp; curbs are the real edge). */
  arenaHalfSize: 17,
  /** Radius of the player's collision circle at character scale 1: the body / feet footprint, not
   * the swinging arms. Scaled with the character. */
  colliderRadius: 0.34,
};

export const ANIMATION = {
  /** Clip names as authored in the GLB. Matching is case-insensitive. */
  clips: {
    // The GLBs have no real idle. `restpose` (a static A-pose) is the base of the procedural
    // breathing idle below; set IDLE.procedural = false to play it as-is.
    idle: "restpose",
    walk: "Walking",
    run: "Running",
  },
  /** State thresholds on the actual ground speed (m/s). */
  idleToWalkSpeed: 0.15,
  walkToRunSpeed: 2.4,
  /** Bone at which the upper-body (weapon pose) layer starts; everything below it stays on locomotion. */
  upperBodyRootBone: "mixamorig:Spine",
  /** Cross-fade time between states. */
  blendTime: 0.18,
  /** Playback-rate clamp when matching the clip to the movement speed. */
  minPlaybackRate: 0.7,
  maxPlaybackRate: 1.35,
};

/**
 * Aim correction while a gun is held (player/AimTwist.ts): the spine twists so the gun points where
 * the hero faces. `share` splits the twist over the spine bones (lower back to chest).
 */
export const AIM = {
  maxTwistDeg: 40,
  /** Share of a gripping hand's extra roll that the forearm takes as a twist about its own axis
   * (pronation / supination) instead of the wrist (player/ArmIK.ts). */
  forearmTwistShare: 0.5,
  /** Chest bone a weapon `hold` is anchored to. */
  chestBone: "mixamorig:Spine2",
  /** How far arm IK may swing an elbow around the shoulder-wrist line to straighten the wrist. */
  elbowSwivelDeg: 75,
  /** Higher follows faster; ~8 settles in a quarter second. */
  smoothing: 8,
  spine: [
    { bone: "mixamorig:Spine", share: 0.3 },
    { bone: "mixamorig:Spine1", share: 0.35 },
    { bone: "mixamorig:Spine2", share: 0.35 },
  ],
};

/**
 * Procedural finger grip (player/FingerGrip.ts): each finger joint bends toward the palm, after the
 * animation, until the finger meets the held handle (a cylinder around the weapon grip's axis).
 */
export const FINGER_GRIP = {
  /** Upper limit per joint (degrees), so a finger never folds through the palm. */
  maxCurlDeg: 95,
  /** Search step (degrees). */
  stepDeg: 3,
  /** Right index finger on a trigger: bent this fraction of its wrap (only rigs with separate fingers). */
  triggerCurl: 0.55,
};

/** Procedural breathing idle generated from the rest pose (see player/BreathingIdle.ts). */
export const IDLE = {
  procedural: true,
  /** One full breath (in and out). */
  periodSeconds: 3.4,
  samples: 32,
  /** How far the A-pose upper arms are lowered towards the body, and how much they drift out on
   * each inhale. */
  armRelaxDeg: 12,
  armBreathDeg: 1.5,
  /** Constant elbow bend so the arms do not hang dead straight. */
  elbowBendDeg: 12,
  /** Chest lift at the top of the breath (spread over Spine / Spine1 / Spine2). */
  chestDeg: 3,
  /** Shoulder lift at the top of the breath. */
  shoulderDeg: 3.5,
  /** Hips sink by this much on the exhale. */
  hipDropMetres: 0.008,
};

export const LIGHTING = {
  /** Warm key light from the camera's front-left so the visible side of the hero is lit and
   * his shadow falls up-right, away from the joystick thumb. */
  sun: {
    // Warm late-afternoon sun: low enough for long readable shadows, not so low that tall walls
    // throw the play space into shade.
    color: [1.0, 0.86, 0.68] as const,
    intensity: 2.5,
    elevationDeg: 38,
    azimuthDeg: 318,
    // PCF3 (4 hardware-filtered taps) at 1024 over the view's range from the farther arena camera.
    shadowResolution: 1024,
    shadowDistance: 30,
    shadowBias: 0.2,
    normalOffsetBias: 0.04,
    shadowIntensity: 0.78,
  },
  /** Cool shadowless bounce from the opposite side so the shadow side keeps its shape. Fill and rim
   * only light the hero (light mask), so the ground and environment pay for a single light. */
  fill: {
    color: [0.55, 0.68, 0.95] as const,
    intensity: 0.35,
    elevationDeg: 25,
    azimuthDeg: 140,
  },
  /** Shadowless back light that outlines head and shoulders against the ground. */
  rim: {
    color: [1.0, 0.8, 0.6] as const,
    intensity: 1.3,
    elevationDeg: 30,
    azimuthDeg: 190,
  },
  /** Procedural dusty sky used only for image-based ambient + metal reflections. */
  environment: {
    zenith: [0.32, 0.45, 0.62] as const,
    horizon: [1.0, 0.72, 0.46] as const,
    ground: [0.3, 0.22, 0.15] as const,
    intensity: 0.55,
  },
  exposure: 1.0,
  /** Constant ambient for the ground, which skips image-based lighting: the ground covers the
   * whole screen and IBL cost ~25% of its shading for what is, on rough flat ground, only a soft
   * sky tint. Calibrated to match the IBL-lit ground's average colour. */
  groundAmbient: [0.79, 0.95, 1.04] as const,
  /** Dusty sand-coloured haze: only the far edge of the view fades (the map view turns fog off). */
  clearColor: [0.62, 0.52, 0.4] as const,
  fogStart: 31,
  fogEnd: 82,
};

export const DEBUG = {
  /** Show translucent collider footprints (also: "colliders" button in the tune panel, or
   * ?colliders=1 in the URL). Off by default. */
  DEBUG_COLLIDERS: false,
  /** Draw the hand / weapon grip frames: RightHand, WeaponSocket, LeftHand, LeftHandGrip and the
   * left-hand IK target (also: "grips" button in the tune panel, or ?grips=1). */
  DEBUG_GRIPS: false,
};

export const RENDER = {
  /** Cap the backbuffer resolution on high-DPI phones. */
  maxPixelRatio: 2,
  /** Dynamic resolution: drop towards minPixelRatio while fps < governorLowFps, climb back while
   * fps > governorHighFps (averaged over governorWindowSeconds). */
  dynamicResolution: true,
  minPixelRatio: 1,
  governorStep: 0.25,
  governorLowFps: 48,
  governorHighFps: 57,
  governorWindowSeconds: 1.5,
};
