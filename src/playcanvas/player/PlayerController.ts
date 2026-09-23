import { math, Vec2, Vec3, type Entity } from "playcanvas";
import { PLAYER } from "../config";
import type { MoveInputSource } from "../input/MoveInput";
import type { CollisionWorld } from "../world/collision/CollisionWorld";

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
  /** Collision circle radius (metres); set from PLAYER.colliderRadius x character scale. */
  radius = PLAYER.colliderRadius;
  /** Safety clamp for the player position (the level's own colliders are the real edge). */
  bounds = { minX: -PLAYER.arenaHalfSize, maxX: PLAYER.arenaHalfSize, minZ: -PLAYER.arenaHalfSize, maxZ: PLAYER.arenaHalfSize };

  private readonly input = new Vec2();
  private readonly targetVelocity = new Vec3();
  private readonly position = new Vec3();

  constructor(
    readonly entity: Entity,
    private readonly moveInput: MoveInputSource,
    private readonly getCameraYawDeg: () => number,
    private readonly collision: CollisionWorld | null = null,
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
    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    if (this.collision) {
      // Move-and-slide: blocked components are removed from both the step and the velocity, so
      // running diagonally into a wall keeps the along-wall part of the motion (and the animation
      // follows the real speed); running straight into it stops.
      this.collision.moveCircle(this.position, this.radius, dx, dz, this.velocity);
    } else {
      this.position.x += dx;
      this.position.z += dz;
    }
    // Safety clamp; the level's boundary colliders are the real edge.
    const b = this.bounds;
    const clampedX = math.clamp(this.position.x, b.minX, b.maxX);
    const clampedZ = math.clamp(this.position.z, b.minZ, b.maxZ);
    if (clampedX !== this.position.x) this.velocity.x = 0;
    if (clampedZ !== this.position.z) this.velocity.z = 0;
    this.position.x = clampedX;
    this.position.z = clampedZ;

    this.entity.setPosition(this.position);
    this.entity.setEulerAngles(0, this.yawDeg, 0);
  }
}
