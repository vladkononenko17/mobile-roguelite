// Tuning for the PlayCanvas 3D vertical slice. Units are metres, seconds and degrees.
// Everything a designer is likely to tweak while judging the visual direction lives here.

export const ASSETS = {
  character: "models/orc/Meshy_AI_Iron_Shoulder_Orc_All_Animations.glb",
};

export const CAMERA = {
  /** Downward tilt of the camera (0 = horizon, 90 = straight down). */
  pitchDeg: 53,
  /** Camera height above the followed point on the ground. */
  height: 9.5,
  /** Horizontal distance behind the followed point (towards the bottom of the screen). */
  distance: 6,
  /** Vertical field of view for landscape screens. */
  fovDeg: 42,
  /** Portrait phones would otherwise see a very narrow strip; keep at least this horizontal FOV. */
  minHorizontalFovDeg: 34,
  /** World yaw of the camera. The camera does not rotate with the character. */
  yawDeg: 0,
  /** Follow smoothing; higher = tighter. Exponential, so frame-rate independent. */
  followSharpness: 7,
  nearClip: 0.5,
  farClip: 90,
};
// With the defaults the ray to the character's chest (~1 m) is atan(8.5 / 6) ≈ 54.8°, slightly
// steeper than the 53° pitch, so the hero sits a little below the screen centre.

export const PLAYER = {
  /** Full-stick / keyboard speed. */
  runSpeed: 4.2,
  /** Speed used while holding Shift (and, later, a light joystick push). */
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
  /** Ground speed (m/s) at which each clip's feet do not slide at playback speed 1. Measured
   * from the GLB by tracing the planted toe bone across each clip. */
  walkNativeSpeed: 1.3,
  runNativeSpeed: 3.9,
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
  /** Warm low-ish desert sun. Elevation above the horizon and compass direction it shines from. */
  sun: {
    color: [1.0, 0.84, 0.64] as const,
    intensity: 1.9,
    elevationDeg: 48,
    azimuthDeg: 320,
    shadowResolution: 2048,
    shadowDistance: 30,
    shadowBias: 0.2,
    normalOffsetBias: 0.04,
    shadowIntensity: 0.85,
  },
  /** Cool shadowless bounce from the opposite side so the shadow side keeps its shape. */
  fill: {
    color: [0.52, 0.66, 0.92] as const,
    intensity: 0.45,
    elevationDeg: 30,
    azimuthDeg: 140,
  },
  /** Procedural dusty sky used only for image-based ambient + metal reflections. */
  environment: {
    zenith: [0.32, 0.45, 0.62] as const,
    horizon: [1.0, 0.72, 0.46] as const,
    ground: [0.34, 0.24, 0.16] as const,
    intensity: 0.9,
  },
  exposure: 0.95,
  clearColor: [0.78, 0.6, 0.42] as const,
  fogStart: 26,
  fogEnd: 60,
};

export const RENDER = {
  /** Cap the backbuffer resolution on high-DPI phones. */
  maxPixelRatio: 2,
};
