import { Quat, Vec3, math, type Entity, type GraphNode } from "playcanvas";

const EPSILON = 1e-5;
/** The arm is solved to reach at most this fraction of its length, so the elbow never locks straight. */
const MAX_REACH = 0.96;
/** How far the collarbone may swing toward an out-of-reach target, in degrees. */
const MAX_CLAVICLE_DEG = 25;
const CLAVICLE_STEP_DEG = 2.5;

/**
 * Two-bone IK for the left arm: after the animation has posed the skeleton, bends the upper arm and
 * forearm so the left hand bone reaches a target entity (a weapon's `leftHandGrip` socket) and takes
 * on its rotation. The elbow keeps bending in the plane the animation gave it, so the arm keeps its
 * animated character. When the target is beyond the arm's reach, the collarbone first swings toward
 * it (up to MAX_CLAVICLE_DEG), like reaching forward with the shoulder. It only overrides this
 * frame's pose (the anim component re-poses the bones every frame), so the clips themselves are
 * untouched. Call `apply` every frame after animation.
 */
export class LeftHandIK {
  private readonly clavicle: GraphNode | null;
  private readonly upperArm: GraphNode | null;
  private readonly foreArm: GraphNode | null;
  private readonly hand: GraphNode | null;

  // Scratch values, reused every frame.
  private readonly a = new Vec3();
  private readonly b = new Vec3();
  private readonly t = new Vec3();
  private readonly toTarget = new Vec3();
  private readonly toElbow = new Vec3();
  private readonly normal = new Vec3();
  private readonly lastNormal = new Vec3(1, 0, 0);
  private readonly desiredElbow = new Vec3();
  private readonly u = new Vec3();
  private readonly v = new Vec3();
  private readonly q = new Quat();
  private readonly q2 = new Quat();
  private readonly handRotation = new Quat();

  constructor(model: Entity) {
    this.clavicle = model.findByName("mixamorig:LeftShoulder");
    this.upperArm = model.findByName("mixamorig:LeftArm");
    this.foreArm = model.findByName("mixamorig:LeftForeArm");
    this.hand = model.findByName("mixamorig:LeftHand");
    if (!this.upperArm || !this.foreArm || !this.hand) console.warn("[LeftHandIK] Left arm bones not found; IK disabled.");
  }

  /** Moves the left hand toward `target` by `weight` (0 = animated pose, 1 = on the target). */
  apply(target: GraphNode | null, weight: number): void {
    const { upperArm, foreArm, hand } = this;
    if (!target || !upperArm || !foreArm || !hand || weight <= 0) return;
    weight = Math.min(1, weight);

    const t = this.t.lerp(hand.getPosition(), target.getPosition(), weight);
    this.handRotation.slerp(hand.getRotation(), target.getRotation(), weight);
    const l1 = foreArm.getPosition().distance(upperArm.getPosition());
    const l2 = hand.getPosition().distance(foreArm.getPosition());
    if (this.clavicle) this.reachWithClavicle(this.clavicle, upperArm.getPosition(), t, (l1 + l2) * MAX_REACH);

    const a = this.a.copy(upperArm.getPosition());
    const b = this.b.copy(foreArm.getPosition());
    const toTarget = this.toTarget.sub2(t, a);
    const d = math.clamp(toTarget.length(), Math.abs(l1 - l2) + EPSILON, (l1 + l2) * MAX_REACH);
    toTarget.normalize();

    // Bend plane from the animated elbow; fall back to last frame's if the arm is straight.
    const normal = this.normal.cross(toTarget, this.toElbow.sub2(b, a));
    if (normal.lengthSq() > EPSILON) this.lastNormal.copy(normal.normalize());
    else normal.copy(this.lastNormal);

    // Law of cosines: the shoulder angle between the shoulder->target line and the upper arm.
    const cosShoulder = math.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    this.q.setFromAxisAngle(normal, Math.acos(cosShoulder) * math.RAD_TO_DEG);
    const desiredElbow = this.q.transformVector(toTarget, this.desiredElbow).mulScalar(l1).add(a);

    this.rotateBone(upperArm, a, b, desiredElbow);
    this.rotateBone(foreArm, foreArm.getPosition(), hand.getPosition(), t);
    hand.setRotation(this.handRotation);
  }

  /** Swings the collarbone toward `target` by the smallest step that brings `shoulder` within `reach`. */
  private reachWithClavicle(clavicle: GraphNode, shoulder: Vec3, target: Vec3, reach: number): void {
    if (shoulder.distance(target) <= reach) return;
    const root = clavicle.getPosition();
    const u = this.u.sub2(shoulder, root);
    const axis = this.normal.cross(u, this.v.sub2(target, root));
    if (axis.lengthSq() < EPSILON) return;
    axis.normalize();
    let angle = 0;
    const moved = this.desiredElbow;
    while (angle < MAX_CLAVICLE_DEG) {
      angle = Math.min(MAX_CLAVICLE_DEG, angle + CLAVICLE_STEP_DEG);
      this.q2.setFromAxisAngle(axis, angle).transformVector(u, moved).add(root);
      if (moved.distance(target) <= reach) break;
    }
    this.q2.setFromAxisAngle(axis, angle);
    clavicle.setRotation(this.q.copy(this.q2).mul(clavicle.getRotation()));
  }

  /** Rotates `bone` (at `pivot`) so the direction pivot->`from` turns to pivot->`to`. */
  private rotateBone(bone: GraphNode, pivot: Vec3, from: Vec3, to: Vec3): void {
    const u = this.u.sub2(from, pivot).normalize();
    const v = this.v.sub2(to, pivot).normalize();
    const axis = this.normal.cross(u, v);
    const sin = axis.length();
    if (sin < EPSILON) return;
    const angle = Math.atan2(sin, u.dot(v)) * math.RAD_TO_DEG;
    this.q2.setFromAxisAngle(axis.mulScalar(1 / sin), angle);
    bone.setRotation(this.q.copy(this.q2).mul(bone.getRotation()));
  }
}
