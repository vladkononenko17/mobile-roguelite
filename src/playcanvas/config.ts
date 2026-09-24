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
   * How this rig's hand bones are rolled about their own axis (+Y, along the fingers) relative to
   * the Vanguard's, in degrees. Weapon grips and sockets are authored on the Vanguard's hands; the
   * weapon holder and left-hand IK undo this roll so they fit any rig. Printed by the build script.
   */
  handRollDeg?: { left: number; right: number };
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
 * `pose` is the clip played on the arms and torso while the weapon is held (null = normal arms);
 * `attack` is the full-body clip played once by the attack action (Space / on-screen button).
 * Optional `scale` resizes the weapon. Optional `sockets` are poses in the weapon's own space
 * (muzzle -Z) that become child entities of the held weapon (WeaponHolder.socket):
 * `rightHandGrip` marks where the right palm holds it; `leftHandGrip` is where the left hand bone
 * (wrist) goes and how it is turned when supporting the weapon. When a weapon has a `leftHandGrip`,
 * left-hand IK (player/LeftHandIK.ts) pulls the left hand onto it while the aiming pose plays.
 */
export const WEAPONS = {
  url: "models/weapons/weapons.glb",
  handBone: "mixamorig:RightHand",
  list: {
    // "assetpack-free" (textured)
    // Two-handed: left-hand IK puts the left hand on `leftHandGrip`, the rear of the handguard (the
    // hand's pose was measured from Run_and_Shoot with the palm under the handguard). The rifle is the
    // usual grip turned 10° inward about the pistol grip, so the handguard stays within the Vanguard's
    // short arm reach while the muzzle still points almost straight ahead.
    rifle: {
      label: "Assault rifle", node: "assault_rifle_2", position: [-0.0057, 0.0893, 0.0247], rotation: [80.8, -42.19, 13.56], rollDeg: 0, pose: "Run_and_Shoot", attack: null,
      sockets: {
        rightHandGrip: { position: [0, -0.02, 0.045] },
        leftHandGrip: { position: [-0.0901, 0.0784, -0.1503], rotation: [178.11, 38.7, 67.05] },
      },
    },
    shotgun: { label: "Shotgun", node: "shotgun_2", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, pose: "Run_and_Shoot", attack: null },
    sniper: { label: "Sniper rifle", node: "sniper_2", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, pose: "Run_and_Shoot", attack: null },
    pistol: { label: "Pistol", node: "pistol_1", position: [0, 0.08, 0.03], rotation: [90, 0, 0], rollDeg: -43, pose: "Run_and_Shoot", attack: null },
    knife: { label: "Knife", node: "tactical_knife", position: [0, 0.08, 0.01], rotation: [90, 0, 0], rollDeg: 0, pose: null, attack: "Attack" },
    grenade: { label: "Grenade", node: "frag_grenade", position: [0, 0.09, -0.01], rotation: [90, 0, 0], rollDeg: 0, pose: null, attack: null },
    // "Flat Guns East" (flat colours)
    eastRifle: { label: "Rifle (East)", node: "Rifle_Assault_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, pose: "Run_and_Shoot", attack: null },
    eastBattleRifle: { label: "Battle rifle (East)", node: "Rifle_Battle_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, pose: "Run_and_Shoot", attack: null },
    eastSmg: { label: "SMG (East)", node: "SMG_Full_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, pose: "Run_and_Shoot", attack: null },
    eastSmgCompact: { label: "Compact SMG (East)", node: "SMG_Compact_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, pose: "Run_and_Shoot", attack: null },
    eastShotgun: { label: "Auto shotgun (East)", node: "Shotgun_Auto_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, pose: "Run_and_Shoot", attack: null },
    eastPumpShotgun: { label: "Pump shotgun (East)", node: "Shotgun_Pump_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, pose: "Run_and_Shoot", attack: null },
    eastSniper: { label: "Sniper (East)", node: "Sniper_Rifle_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, pose: "Run_and_Shoot", attack: null },
    eastMarksman: { label: "Marksman rifle (East)", node: "Sniper_Material_East", position: [0, 0.09, 0.03], rotation: [90, 0, 0], rollDeg: -43, pose: "Run_and_Shoot", attack: null },
    eastPistol: { label: "Pistol (East)", node: "Pistol_Full_East", position: [0, 0.08, 0.03], rotation: [90, 0, 0], rollDeg: -43, pose: "Run_and_Shoot", attack: null },
    eastPistolCompact: { label: "Compact pistol (East)", node: "Pistol_Compact_East", position: [0, 0.08, 0.03], rotation: [90, 0, 0], rollDeg: -43, pose: "Run_and_Shoot", attack: null },
    // Low poly axe: head up past the thumb, gripped ~0.6 m down the handle.
    axe: { label: "Axe", node: "low_poly_axe", position: [0, 0.08, 0.62], rotation: [90, 0, 0], rollDeg: 0, pose: null, attack: "Axe_Spin_Attack" },
  },
} satisfies {
  url: string;
  handBone: string;
  list: Record<string, WeaponDef>;
};

type Vec3Tuple = [number, number, number];
export type WeaponSocket = "rightHandGrip" | "leftHandGrip";

export interface WeaponDef {
  label: string;
  node: string;
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  rollDeg: number;
  scale?: number;
  sockets?: Partial<Record<WeaponSocket, { position: Vec3Tuple; rotation?: Vec3Tuple }>>;
  pose: string | null;
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
   * The portrait gameplay view is only ~7 x 13 m, so small cells let the camera skip most of the
   * level's triangles for a few extra draw calls. */
  batchCellMetres: 12,
};

export const CAMERA = {
  /** Downward tilt of the camera (0 = horizon, 90 = straight down). Because the hero sits below
   * the screen centre, the line of sight to him is a few degrees steeper than this. */
  pitchDeg: 50,
  /** Distance from the camera to the orbit pivot on the character, along the view direction.
   * Camera height follows from pitch + distance (+ screen offset); the tune panel shows it. */
  distance: 9.5,
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
  farClip: 70,
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
  maxTwistDeg: 30,
  /** Higher follows faster; ~8 settles in a quarter second. */
  smoothing: 8,
  spine: [
    { bone: "mixamorig:Spine", share: 0.3 },
    { bone: "mixamorig:Spine1", share: 0.35 },
    { bone: "mixamorig:Spine2", share: 0.35 },
  ],
};

/**
 * Extra finger bend (degrees per joint, knuckle to tip) on top of the animation while holding a
 * weapon (player/FingerGrip.ts; only rigs with finger joints, e.g. the Survivor).
 */
export const FINGER_GRIP = {
  /** Right hand around any held weapon's grip. */
  weaponDeg: [50, 65, 50],
  /** Left hand under a two-handed weapon's handguard. */
  supportDeg: [30, 40, 30],
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
    // PCF3 (4 hardware-filtered taps) at 1024 over an 18 m range: ~2 cm texels near the hero,
    // a fraction of the PCF5 / 2048 / 22 m cost per pixel and per shadow pass.
    shadowResolution: 1024,
    shadowDistance: 18,
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
  fogStart: 22,
  fogEnd: 60,
};

export const DEBUG = {
  /** Show translucent collider footprints (also: "colliders" button in the tune panel, or
   * ?colliders=1 in the URL). Off by default. */
  DEBUG_COLLIDERS: false,
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
