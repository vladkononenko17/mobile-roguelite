import { Quat, Vec3, math, type Entity, type GraphNode } from "playcanvas";
import { AIM } from "../config";

/**
 * Aim correction for held guns: the upper-body aiming clip is authored with the torso turned, so on
 * top of forward-facing locomotion the gun points off to the side. After the animation has posed the
 * skeleton, this measures the animation's aim (the right hand's finger axis, +Y, which is where the
 * clip points the gun) against the hero's facing and twists the spine bones about the vertical axis
 * to cancel the difference (clamped to AIM.maxTwistDeg, smoothed over time). Arms and gun turn with
 * the chest, so hand placement is unchanged; run it before the hand grip and left-hand IK.
 * Like the IK it only overrides this frame's pose, so the clips are untouched.
 */
export class AimTwist {
  private readonly bones: { node: GraphNode; share: number }[] = [];
  private readonly hand: GraphNode | null;
  private twistDeg = 0;

  private readonly muzzle = new Vec3();
  private readonly q = new Quat();
  private readonly q2 = new Quat();

  constructor(model: Entity) {
    this.hand = model.findByName("mixamorig:RightHand");
    for (const { bone, share } of AIM.spine) {
      const node = model.findByName(bone);
      if (node) this.bones.push({ node, share });
      else console.warn(`[AimTwist] ${bone} not found; skipped.`);
    }
  }

  /**
   * While a gun is `armed`, turns the chest so the animation's aim points along `facingYawDeg`
   * (degrees about +Y, 0 = +Z). `weight` blends the correction in and out (the upper-body layer weight).
   */
  apply(armed: boolean, facingYawDeg: number, weight: number, dt: number): void {
    let target = 0;
    if (armed && this.hand && weight > 0) {
      const aim = this.hand.getWorldTransform().getY(this.muzzle);
      if (aim.x * aim.x + aim.z * aim.z > 1e-6) {
        const headingDeg = Math.atan2(aim.x, aim.z) * math.RAD_TO_DEG;
        const offset = ((headingDeg - facingYawDeg + 540) % 360) - 180;
        target = math.clamp(-offset, -AIM.maxTwistDeg, AIM.maxTwistDeg) * Math.min(1, weight);
      }
    }
    // Frame-rate independent smoothing: removes the run cycle's wobble and eases in on equip.
    this.twistDeg += (target - this.twistDeg) * (1 - Math.exp(-AIM.smoothing * dt));
    if (Math.abs(this.twistDeg) < 0.01) return;
    // Parent first: each bone adds its share on top of the turn inherited from the one below.
    for (const { node, share } of this.bones) {
      this.q.setFromAxisAngle(Vec3.UP, this.twistDeg * share);
      node.setRotation(this.q2.copy(this.q).mul(node.getRotation()));
    }
  }
}
