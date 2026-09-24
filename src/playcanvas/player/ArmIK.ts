import { Quat, Vec3, math, type Entity, type GraphNode } from "playcanvas";

const EPSILON = 1e-5;
/** The arm is solved to reach at most this fraction of its length, so the elbow never locks straight. */
const MAX_REACH = 0.96;
/** How far the collarbone may swing toward an out-of-reach target, in degrees. */
const MAX_CLAVICLE_DEG = 25;
const CLAVICLE_STEP_DEG = 2.5;
const SWIVEL_STEP_DEG = 5;

/**
 * Two-bone IK for one arm: after the animation has posed the skeleton, bends the upper arm and
 * forearm so the hand bone (wrist) reaches a target position and takes on the target rotation (see
 * WeaponHands, which derives the targets from the weapon's grips). The elbow keeps bending in the plane the animation gave it, so the arm keeps its
 * animated character. When the target is beyond the arm's reach, the collarbone first swings toward
 * it (up to MAX_CLAVICLE_DEG), like reaching forward with the shoulder. It only overrides this
 * frame's pose (the anim component re-poses the bones every frame), so the clips themselves are
 * untouched. Call `apply` every frame after animation.
 */
export class ArmIK {
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
  private readonly animatedLocal = new Quat();
  private readonly forearmDir = new Vec3();

  constructor(model: Entity, side: "Left" | "Right") {
    this.clavicle = model.findByName(`mixamorig:${side}Shoulder`);
    this.upperArm = model.findByName(`mixamorig:${side}Arm`);
    this.foreArm = model.findByName(`mixamorig:${side}ForeArm`);
    this.hand = model.findByName(`mixamorig:${side}Hand`);
    if (!this.upperArm || !this.foreArm || !this.hand) console.warn(`[ArmIK] ${side} arm bones not found; IK disabled.`);
  }

  /** The animated hand (wrist) rotation, before this frame's IK. */
  get animatedHandRotation(): Quat | null {
    return this.hand?.getRotation() ?? null;
  }

  /**
   * Moves the hand bone (wrist) toward `position` / `rotation` (world) by `weight`
   * (0 = animated pose, 1 = exactly on the target). Afterwards `twistShare` of the hand's roll about
   * the forearm axis moves into the forearm (a forearm turns about itself when the hand rolls), so
   * the skin between them does not wring. `swivelDeg` lets the elbow swing around the
   * shoulder-to-wrist line (from the animated elbow, up to that angle either way) to where the
   * forearm best lines up behind the target hand, so the wrist is not bent back.
   */
  apply(position: Vec3, rotation: Quat, weight: number, twistShare = 0.5, swivelDeg = 0): void {
    const { upperArm, foreArm, hand } = this;
    if (!upperArm || !foreArm || !hand || weight <= 0) return;
    weight = Math.min(1, weight);

    this.animatedLocal.copy(hand.getLocalRotation());
    const t = this.t.lerp(hand.getPosition(), position, weight);
    this.handRotation.slerp(hand.getRotation(), rotation, weight);
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
    if (swivelDeg > 0) this.swivelElbow(desiredElbow, a, t, toTarget, swivelDeg);

    this.rotateBone(upperArm, a, b, desiredElbow);
    this.rotateBone(foreArm, foreArm.getPosition(), hand.getPosition(), t);
    this.shareTwist(foreArm, twistShare);
    hand.setRotation(this.handRotation);
  }

  /** Swings `elbow` about the shoulder-target line to minimise the wrist bend (elbow kept below the shoulder). */
  private swivelElbow(elbow: Vec3, shoulder: Vec3, target: Vec3, axis: Vec3, rangeDeg: number): void {
    const handAxis = this.handRotation.transformVector(Vec3.UP, this.v);
    const start = this.u.sub2(elbow, shoulder);
    let bestCost = Infinity;
    let bestDeg = 0;
    for (let deg = -rangeDeg; deg <= rangeDeg; deg += SWIVEL_STEP_DEG) {
      const offset = this.q2.setFromAxisAngle(axis, deg).transformVector(start, this.toElbow);
      // Forearm direction elbow -> wrist = target - (shoulder + offset).
      const forearm = this.forearmDir.sub2(target, shoulder).sub(offset).normalize();
      const bend = Math.acos(math.clamp(forearm.dot(handAxis), -1, 1));
      // Keep the elbow from lifting above the shoulder (a raised "chicken wing").
      const lift = Math.max(0, offset.y) * 20;
      const cost = bend + lift + Math.abs(deg) * 0.002;
      if (cost < bestCost) {
        bestCost = cost;
        bestDeg = deg;
      }
    }
    this.q2.setFromAxisAngle(axis, bestDeg).transformVector(start, this.toElbow);
    elbow.add2(shoulder, this.toElbow);
  }

  /**
   * Moves `share` of the extra roll the target puts on the wrist (beyond the animated wrist roll,
   * both measured about the forearm's own axis, local +Y) into the forearm itself.
   */
  private shareTwist(foreArm: GraphNode, share: number): void {
    if (share <= 0) return;
    // Hand rotation relative to the forearm, as it will be with the target.
    const relative = this.q.copy(foreArm.getRotation()).invert().mul(this.handRotation);
    const rollDeg = (q: Quat) => 2 * Math.atan2(q.y, q.w) * math.RAD_TO_DEG;
    const extra = ((rollDeg(relative) - rollDeg(this.animatedLocal) + 540) % 360) - 180;
    const axis = this.u.copy(foreArm.getWorldTransform().getY(this.u)).normalize();
    this.q2.setFromAxisAngle(axis, extra * share);
    foreArm.setRotation(this.q.copy(this.q2).mul(foreArm.getRotation()));
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
