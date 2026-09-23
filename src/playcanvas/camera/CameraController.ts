import { math, Vec3, type Entity } from "playcanvas";
import { CAMERA } from "../config";

export type CameraSettings = Pick<typeof CAMERA, "pitchDeg" | "height" | "distance" | "fovDeg" | "yawDeg">;

/**
 * Perspective top-down follow camera. The camera keeps a fixed world yaw and pitch and sits
 * `height` above and `distance` behind the followed point, smoothing towards it each frame.
 */
export class CameraController {
  readonly settings: CameraSettings;

  private readonly focus = new Vec3();
  private readonly desired = new Vec3();
  private readonly position = new Vec3();
  private snapped = false;

  constructor(readonly entity: Entity, private readonly target: Entity) {
    this.settings = {
      pitchDeg: CAMERA.pitchDeg,
      height: CAMERA.height,
      distance: CAMERA.distance,
      fovDeg: CAMERA.fovDeg,
      yawDeg: CAMERA.yawDeg,
    };
  }

  get yawDeg(): number {
    return this.settings.yawDeg;
  }

  /** Jump straight to the target without smoothing (spawn, teleport). */
  snap(): void {
    this.snapped = false;
  }

  update(dt: number, aspect: number): void {
    this.desired.copy(this.target.getPosition());
    if (!this.snapped) {
      this.focus.copy(this.desired);
      this.snapped = true;
    } else {
      this.focus.lerp(this.focus, this.desired, 1 - Math.exp(-CAMERA.followSharpness * dt));
    }

    const { pitchDeg, height, distance, yawDeg } = this.settings;
    const yaw = yawDeg * math.DEG_TO_RAD;
    this.position.set(
      this.focus.x + Math.sin(yaw) * distance,
      this.focus.y + height,
      this.focus.z + Math.cos(yaw) * distance,
    );
    this.entity.setPosition(this.position);
    this.entity.setEulerAngles(-pitchDeg, yawDeg, 0);
    this.updateFov(aspect);
  }

  private updateFov(aspect: number): void {
    const camera = this.entity.camera!;
    // Convert the landscape vertical FOV to horizontal; on narrow portrait screens fall back to
    // a minimum horizontal FOV so the arena does not collapse into a thin strip.
    const vertical = this.settings.fovDeg * math.DEG_TO_RAD;
    const horizontalDeg = 2 * Math.atan(Math.tan(vertical / 2) * aspect) * math.RAD_TO_DEG;
    if (horizontalDeg < CAMERA.minHorizontalFovDeg) {
      camera.horizontalFov = true;
      camera.fov = CAMERA.minHorizontalFovDeg;
    } else {
      camera.horizontalFov = false;
      camera.fov = this.settings.fovDeg;
    }
  }
}
