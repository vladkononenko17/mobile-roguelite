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
}

/** Character GLBs selectable from the tune panel. All share the same Mixamo-style rig and clips. */
export const CHARACTERS = {
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
export const DEFAULT_CHARACTER: CharacterId = "brawler2k";

/** Ground surface: "Damaged Road" PBR set (1K) from the user-supplied road_damaged_1k.blend.zip.
 * EXR normal/roughness were converted to 8-bit JPG; the displacement map is not used. */
export const GROUND = {
  folder: "textures/road_damaged",
  diffuse: "road_damaged_diff_1k.jpg",
  normal: "road_damaged_nor_gl_1k.jpg",
  roughness: "road_damaged_rough_1k.jpg",
  /** Metres covered by one repeat of the texture. */
  tileMetres: 5,
  /** Multiplier on the colour map; below 1 keeps the ground from competing with the hero. */
  brightness: 0.85,
  bumpiness: 1,
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
  /** Square play area half-size around the origin. */
  arenaHalfSize: 17,
};

export const ANIMATION = {
  /** Clip names as authored in the GLB. Matching is case-insensitive. */
  clips: {
    // The GLB has no dedicated idle. `restpose` is a static A-pose used as a temporary idle.
    idle: "restpose",
    walk: "Walking",
    run: "Running",
  },
  /** State thresholds on the actual ground speed (m/s). */
  idleToWalkSpeed: 0.15,
  walkToRunSpeed: 2.4,
  /** Cross-fade time between states. */
  blendTime: 0.18,
  /** Playback-rate clamp when matching the clip to the movement speed. */
  minPlaybackRate: 0.7,
  maxPlaybackRate: 1.35,
};

export const LIGHTING = {
  /** Warm key light from the camera's front-left so the visible side of the hero is lit and
   * his shadow falls up-right, away from the joystick thumb. */
  sun: {
    color: [1.0, 0.87, 0.7] as const,
    intensity: 2.6,
    elevationDeg: 46,
    azimuthDeg: 318,
    shadowResolution: 2048,
    shadowDistance: 22,
    shadowBias: 0.2,
    normalOffsetBias: 0.04,
    shadowIntensity: 0.72,
  },
  /** Cool shadowless bounce from the opposite side so the shadow side keeps its shape. */
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
  clearColor: [0.4, 0.31, 0.24] as const,
  fogStart: 16,
  fogEnd: 42,
};

export const RENDER = {
  /** Cap the backbuffer resolution on high-DPI phones. */
  maxPixelRatio: 2,
};
