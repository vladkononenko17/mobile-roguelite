import { math, Vec2, Vec3, type Entity } from "playcanvas";
import { PLAYER } from "../config";
import type { MoveInputSource } from "../input/MoveInput";

/** Shortest signed difference between two angles in degrees, in (-180, 180]. */
function deltaAngle(from: number, to: number): number {
  let delta = (to - from) % 360;
  if (delta > 180) delta -= 360;
  else if (delta <= -180) delta += 360;
  return delta;
}

/**
 * Moves the player root on the X/Z plane relative to the camera yaw and turns it towards the
 * movement direction. The character model is expected to face +Z at yaw 0 (true for this GLB).
 * The root never changes height.
 */
export class PlayerController {
  /** Current ground velocity (m/s). Read by the animation controller. */
  readonly velocity = new Vec3();
  /** Current facing in degrees around +Y. */
  yawDeg = 0;

  private readonly input = new Vec2();
  private readonly targetVelocity = new Vec3();
  private readonly position = new Vec3();

  constructor(
    readonly entity: Entity,
    private readonly moveInput: MoveInputSource,
    private readonly getCameraYawDeg: () => number,
  ) {
    this.yawDeg = entity.getEulerAngles().y;
  }

  get speed(): number {
    return this.velocity.length();
  }

  update(dt: number): void {
    this.moveInput.read(this.input);
    let magnitude = Math.min(1, this.input.length());
    if (magnitude < PLAYER.inputDeadZone) magnitude = 0;

    // Screen-space input -> world direction using the camera yaw.
    // Camera at yaw 0 looks down -Z, so screen-up is -Z and screen-right is +X.
    const yaw = this.getCameraYawDeg() * math.DEG_TO_RAD;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const inputLength = this.input.length() || 1;
    const ix = this.input.x / inputLength;
    const iy = this.input.y / inputLength;
    const dirX = ix * cos - iy * sin;
    const dirZ = -ix * sin - iy * cos;

    const targetSpeed = magnitude * PLAYER.runSpeed;
    this.targetVelocity.set(dirX * targetSpeed, 0, dirZ * targetSpeed);

    const sharpness = targetSpeed > this.velocity.length() ? PLAYER.acceleration : PLAYER.deceleration;
    const blend = 1 - Math.exp(-sharpness * dt);
    this.velocity.lerp(this.velocity, this.targetVelocity, blend);
    if (magnitude === 0 && this.velocity.lengthSq() < 1e-4) this.velocity.set(0, 0, 0);

    // Face where the player is asking to go, not where momentum carries them.
    if (magnitude > 0) {
      const targetYaw = Math.atan2(dirX, dirZ) * math.RAD_TO_DEG;
      const turnBlend = 1 - Math.exp(-PLAYER.turnSharpness * dt);
      this.yawDeg += deltaAngle(this.yawDeg, targetYaw) * turnBlend;
      this.yawDeg = ((this.yawDeg % 360) + 360) % 360;
    }

    this.position.copy(this.entity.getPosition());
    const limit = PLAYER.arenaHalfSize;
    this.position.x = math.clamp(this.position.x + this.velocity.x * dt, -limit, limit);
    this.position.z = math.clamp(this.position.z + this.velocity.z * dt, -limit, limit);
    // Stop pushing into the arena edge so the run cycle does not play against a wall.
    if (Math.abs(this.position.x) === limit) this.velocity.x = 0;
    if (Math.abs(this.position.z) === limit) this.velocity.z = 0;

    this.entity.setPosition(this.position);
    this.entity.setEulerAngles(0, this.yawDeg, 0);
  }
}
