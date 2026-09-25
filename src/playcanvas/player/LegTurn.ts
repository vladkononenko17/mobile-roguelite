import { Quat, Vec3, math, type Entity, type GraphNode } from "playcanvas";
import { LEG_TURN } from "../config";

/**
 * Twin-stick legs: while the hero moves in another direction than he faces (aiming at a demon
 * while kiting), the hips turn toward the movement - up to LEG_TURN.maxDeg - and the spine turns
 * back by the same amount, so the legs stride along the ground while the chest and gun keep
 * aiming. Moving backwards the legs backpedal (the reversed cycle) and turn toward the direction
 * straight behind instead. Applied after the anim system has posed the skeleton, before the aim
 * twist and the hand IK.
 */
export class LegTurn {
  private readonly hips: GraphNode | null;
  private readonly spine: GraphNode | null;
  /** Current hip turn (degrees about +Y) and whether the hero backpedals. */
  private turnDeg = 0;
  backward = false;

  private readonly up = new Vec3();
  private readonly q = new Quat();
  private readonly parent = new Quat();
  private readonly inverse = new Quat();
  private readonly spineWorld = new Quat();

  constructor(model: Entity) {
    this.hips = model.findByName(LEG_TURN.hips);
    this.spine = model.findByName(LEG_TURN.spine);
    if (!this.hips || !this.spine) console.warn("[LegTurn] hips / spine bone not found; legs follow the facing.");
  }

  /**
   * Decides backpedal vs forward from the angle between the movement and the facing (with
   * hysteresis), then turns the legs. `velocity` is the ground velocity, yaws in degrees (0 = +Z).
   * Returns whether the hero backpedals (for the animation controller).
   */
  update(velocity: Vec3, facingYawDeg: number, dt: number): boolean {
    const speed = Math.hypot(velocity.x, velocity.z);
    let target = 0;
    if (speed > LEG_TURN.minSpeed) {
      const moveYaw = Math.atan2(velocity.x, velocity.z) * math.RAD_TO_DEG;
      const rel = Math.abs(delta(facingYawDeg, moveYaw));
      if (this.backward ? rel < LEG_TURN.forwardBelowDeg : rel > LEG_TURN.backAboveDeg) this.backward = !this.backward;
      const legsYaw = facingYawDeg + (this.backward ? 180 : 0);
      target = math.clamp(delta(legsYaw, moveYaw), -LEG_TURN.maxDeg, LEG_TURN.maxDeg);
    } else {
      this.backward = false;
    }
    this.turnDeg += (target - this.turnDeg) * Math.min(1, dt * LEG_TURN.sharpness);
    this.apply();
    return this.backward;
  }

  private apply(): void {
    const { hips, spine } = this;
    if (!hips || !spine || Math.abs(this.turnDeg) < 0.1) return;
    // Keep the upper body's world orientation, turn the hips about the world up axis.
    this.spineWorld.copy(spine.getRotation());
    const parent = hips.parent;
    this.parent.copy(parent ? parent.getRotation() : Quat.IDENTITY);
    this.inverse.copy(this.parent).invert();
    this.inverse.transformVector(Vec3.UP, this.up);
    this.q.setFromAxisAngle(this.up, this.turnDeg);
    hips.setLocalRotation(this.q.mul(hips.getLocalRotation()));
    spine.setRotation(this.spineWorld);
  }
}

/** Signed smallest angle from a to b (degrees). */
function delta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}
