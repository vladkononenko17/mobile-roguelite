import { math, Vec3, type Entity } from "playcanvas";
import { CAMERA } from "../config";

export interface CameraSettings {
  pitchDeg: number;
  distance: number;
  fovDeg: number;
  screenOffset: number;
  followSharpness: number;
  lookAheadTime: number;
  yawDeg: number;
}

/**
 * Perspective top-down follow camera. It orbits a pivot on the character at a fixed world yaw
 * and pitch, then slides along its own up axis so the pivot lands `screenOffset` below the
 * screen centre. The offset is exact for any aspect ratio, so portrait and landscape compose
 * the same way.
 */
export class CameraController {
  readonly settings: CameraSettings = {
    pitchDeg: CAMERA.pitchDeg,
    distance: CAMERA.distance,
    fovDeg: CAMERA.fovDeg,
    screenOffset: CAMERA.screenOffset,
    followSharpness: CAMERA.followSharpness,
    lookAheadTime: CAMERA.lookAheadTime,
    yawDeg: CAMERA.yawDeg,
  };
  /** Pivot height above the target's origin (scaled with the character). */
  pivotHeight = CAMERA.pivotHeight;

  private readonly focus = new Vec3();
  private readonly desired = new Vec3();
  private readonly position = new Vec3();
  private snapped = false;

  constructor(
    readonly entity: Entity,
    private readonly target: Entity,
    private readonly targetVelocity: Vec3,
  ) {}

  get yawDeg(): number {
    return this.settings.yawDeg;
  }

  /** Camera height above the ground for the current settings. */
  get height(): number {
    const { pitchDeg, distance } = this.settings;
    const pitch = pitchDeg * math.DEG_TO_RAD;
    return this.pivotHeight + distance * (Math.sin(pitch) + this.offsetFactor() * Math.cos(pitch));
  }

  /** Sets the camera height by changing the distance, keeping pitch, FOV and offset. */
  set height(value: number) {
    const pitch = this.settings.pitchDeg * math.DEG_TO_RAD;
    const perMetre = Math.sin(pitch) + this.offsetFactor() * Math.cos(pitch);
    this.settings.distance = Math.max(1, (value - this.pivotHeight) / perMetre);
  }

  /**
   * DEV MAP VIEW: when set, the camera ignores the player and frames this rectangle of the level
   * from high above (for inspecting layouts). The gameplay camera is untouched while it is null.
   */
  mapView: { centreX: number; centreZ: number; width: number; depth: number } | null = null;
  private gameplayFarClip = 0;

  /** Distance from the camera to the level centre in map view (for shadow / clip ranges). */
  mapViewDistance = 0;

  /** Jump straight to the target without smoothing (spawn, teleport). */
  snap(): void {
    this.snapped = false;
  }

  update(dt: number, aspect = 1): void {
    const camera = this.entity.camera!;
    if (this.mapView) {
      this.updateMapView(aspect);
      return;
    }
    if (this.gameplayFarClip) {
      camera.farClip = this.gameplayFarClip;
      this.gameplayFarClip = 0;
      this.snapped = false;
    }
    this.desired.copy(this.targetVelocity).mulScalar(this.settings.lookAheadTime).add(this.target.getPosition());
    if (!this.snapped) {
      this.focus.copy(this.desired);
      this.snapped = true;
    } else {
      this.focus.lerp(this.focus, this.desired, 1 - Math.exp(-this.settings.followSharpness * dt));
    }

    const { pitchDeg, distance, yawDeg, fovDeg } = this.settings;
    const pitch = pitchDeg * math.DEG_TO_RAD;
    const yaw = yawDeg * math.DEG_TO_RAD;
    const sinPitch = Math.sin(pitch);
    const cosPitch = Math.cos(pitch);
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);

    // Orbit position around the pivot...
    const back = distance * cosPitch;
    let x = this.focus.x + sinYaw * back;
    let y = this.focus.y + this.pivotHeight + distance * sinPitch;
    let z = this.focus.z + cosYaw * back;
    // ...then shift along the camera's up axis; at depth `distance` this moves the pivot down the
    // screen by exactly `screenOffset` of the screen height.
    const shift = this.offsetFactor() * distance;
    x += -sinYaw * sinPitch * shift;
    y += cosPitch * shift;
    z += -cosYaw * sinPitch * shift;

    // Shake: trauma squared, as a smooth wobble in the view plane (screen right / up).
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
      this.shakeTime += dt;
      const k = this.trauma * this.trauma * 0.45;
      const sx = Math.sin(this.shakeTime * 47) * k, sy = Math.sin(this.shakeTime * 59 + 1.3) * k;
      x += cosYaw * sx;
      z += -sinYaw * sx;
      y += cosPitch * sy;
    }

    this.position.set(x, y, z);
    this.entity.setPosition(this.position);
    this.entity.setEulerAngles(-pitchDeg, yawDeg, 0);
    camera.horizontalFov = false;
    camera.fov = fovDeg;
  }

  private trauma = 0;
  private shakeTime = 0;

  /** Adds screen shake (0..1 trauma; it decays in about half a second). */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Fits the map-view rectangle on screen for the current aspect ratio. */
  private updateMapView(aspect: number): void {
    const view = this.mapView!;
    const camera = this.entity.camera!;
    if (!this.gameplayFarClip) this.gameplayFarClip = camera.farClip;
    const pitchDeg = 62;
    const fovDeg = 40;
    const pitch = pitchDeg * math.DEG_TO_RAD;
    const tanV = Math.tan((fovDeg * math.DEG_TO_RAD) / 2);
    const tanH = tanV * aspect;
    // Depth foreshortens by sin(pitch); walls add a little height at the edges.
    const distance = 1.08 * Math.max((view.depth * Math.sin(pitch)) / 2 / tanV + 2, view.width / 2 / tanH + 2);
    this.mapViewDistance = distance;
    this.position.set(view.centreX, distance * Math.sin(pitch), view.centreZ + distance * Math.cos(pitch));
    this.entity.setPosition(this.position);
    this.entity.setEulerAngles(-pitchDeg, 0, 0);
    camera.horizontalFov = false;
    camera.fov = fovDeg;
    camera.farClip = distance + view.depth;
  }

  private offsetFactor(): number {
    return 2 * this.settings.screenOffset * Math.tan((this.settings.fovDeg * math.DEG_TO_RAD) / 2);
  }
}
