import { Color, Mat4, Quat, Vec3, type AppBase, type Entity, type GraphNode } from "playcanvas";
import { AIM, type CharacterModel } from "../config";
import { FingerGrip } from "./FingerGrip";
import { gripMatrix } from "./GripFrame";
import { ArmIK } from "./ArmIK";
import type { WeaponHolder } from "./WeaponHolder";

const ROLL_SAMPLES = 9;
const AXIS_LENGTH = 0.07;
const RED = new Color(1, 0.2, 0.2);
const GREEN = new Color(0.2, 1, 0.3);
const BLUE = new Color(0.3, 0.5, 1);
const YELLOW = new Color(1, 0.9, 0.2);

/**
 * Hands on the held weapon, run every frame after the animation (and the aim twist):
 *   base animation
 *   -> right-hand grip: the right palm stays where the animation put it, but the hand is turned into
 *      a real pistol-grip hold so the weapon, which follows the WeaponSocket in the palm, points along
 *      the animation's aim (the animated hand's finger axis) and stays upright; right-arm IK moves the
 *      wrist and elbow behind the grip so the wrist is not bent back
 *   -> left-arm IK puts the left palm grip frame on the weapon's LeftHandGrip (wrist position and
 *      orientation)
 *   -> procedural finger grip on both hands.
 * The left hand may roll around the handguard axis (within the grip's rollRangeDeg) to stay close to
 * the animated wrist, so the arm does not twist unnaturally as clips change.
 */
export class WeaponHands {
  private readonly leftIK: ArmIK;
  private readonly rightIK: ArmIK;
  private readonly rightPalm = new Vec3();
  private readonly rightFingers: FingerGrip | null;
  private readonly leftFingers: FingerGrip | null;
  private readonly leftPalmInverse = new Mat4();
  private readonly rightHand: GraphNode | null;
  private readonly leftHand: GraphNode | null;
  debug = false;

  // Scratch values.
  private readonly target = new Mat4();
  private readonly best = new Mat4();
  private readonly roll = new Mat4();
  private readonly surface = new Mat4();
  private readonly rotation = new Quat();
  private readonly position = new Vec3();
  private readonly origin = new Vec3();
  private readonly direction = new Vec3();
  private readonly a = new Vec3();
  private readonly b = new Vec3();
  private readonly basis = new Mat4();
  private readonly q1 = new Quat();
  private readonly q2 = new Quat();
  private readonly q3 = new Quat();

  constructor(
    private readonly app: AppBase,
    model: Entity,
    private readonly character: Pick<CharacterModel, "hands" | "fingers">,
  ) {
    this.leftIK = new ArmIK(model, "Left");
    this.rightIK = new ArmIK(model, "Right");
    this.rightHand = model.findByName("mixamorig:RightHand");
    this.leftHand = model.findByName("mixamorig:LeftHand");
    const fingers = character.fingers;
    this.rightFingers = fingers ? new FingerGrip(model, "Right", fingers) : null;
    this.leftFingers = fingers ? new FingerGrip(model, "Left", fingers) : null;
    if (character.hands) {
      gripMatrix(character.hands.left, this.leftPalmInverse).invert();
      const p = character.hands.right.position;
      this.rightPalm.set(p[0], p[1], p[2]);
    }
    console.info(
      `[WeaponHands] RightHand ${this.rightHand ? "found" : "missing"}, LeftHand ${this.leftHand ? "found" : "missing"}; ` +
        `finger chains R [${this.rightFingers?.fingers.join(", ") ?? "none"}], L [${this.leftFingers?.fingers.join(", ") ?? "none"}]` +
        (fingers?.rigid ? " (rigid: whole finger block on the first joint, no thumb bone)" : ""),
    );
  }

  /** `weight`: how much the weapon pose shows (the upper-body layer weight). */
  update(weapons: WeaponHolder, weight: number): void {
    const right = weapons.grip("right");
    const left = weapons.grip("left");

    if (right && weapons.entity && this.character.hands && weight > 0) this.holdRight(weapons.entity, weight);

    let targetValid = false;
    if (left && this.character.hands && weight > 0) {
      this.solveLeftTarget(left.marker, left.def.radius, left.def.rollRangeDeg ?? 0);
      this.leftIK.apply(this.position, this.rotation, weight, AIM.forearmTwistShare, AIM.elbowSwivelDeg);
      targetValid = true;
    }
    if (right) this.wrap(this.rightFingers, right.marker, right.def.radius, 1);
    if (left) this.wrap(this.leftFingers, left.marker, left.def.radius, weight);

    if (this.debug) this.draw(weapons, targetValid);
  }

  /**
   * Right-hand grip: desired hand rotation = the one that makes the held weapon point along the
   * animated aim (hand +Y) with its top up; desired wrist position = keeps the animated palm point
   * (the WeaponSocket) where it is. Right-arm IK then places the arm.
   */
  private holdRight(weapon: Entity, weight: number): void {
    const hand = this.rightHand;
    if (!hand) return;
    const handWorld = hand.getWorldTransform();
    // Desired weapon rotation: muzzle (-Z) along the animated aim, top (+Y) toward world up.
    const z = this.a.copy(handWorld.getY(this.a)).normalize().mulScalar(-1);
    const x = this.b.cross(Vec3.UP, z);
    if (x.lengthSq() < 1e-6) return;
    x.normalize();
    const y = this.origin.cross(z, x);
    const d = this.basis.data;
    d[0] = x.x; d[1] = x.y; d[2] = x.z; d[4] = y.x; d[5] = y.y; d[6] = y.z; d[8] = z.x; d[9] = z.y; d[10] = z.z;
    d[3] = d[7] = d[11] = d[12] = d[13] = d[14] = 0; d[15] = 1;
    const desiredWeapon = this.q1.setFromMat4(this.basis);
    // weapon = hand * S with S constant (socket and grip), so hand = weapon * inverse(S).
    const handToWeapon = this.q2.copy(hand.getRotation()).invert().mul(weapon.getRotation());
    const desiredHand = this.q3.copy(desiredWeapon).mul(handToWeapon.invert());
    // Wrist position that keeps the palm point: palm - desiredHand * (palm offset * scale).
    const palm = handWorld.transformPoint(this.rightPalm, this.position);
    const scale = handWorld.getScale(this.b).x;
    const offset = desiredHand.transformVector(this.a.copy(this.rightPalm).mulScalar(scale), this.a);
    this.origin.sub2(palm, offset);
    this.rightIK.apply(this.origin, desiredHand, weight, AIM.forearmTwistShare, AIM.elbowSwivelDeg);
  }

  /**
   * Left wrist target = LeftHandGrip, rolled about the handle axis, moved out to the handle surface,
   * times the inverse left palm frame. Picks the roll (within the range) nearest the animated wrist.
   */
  private solveLeftTarget(marker: Entity, radius: number, rangeDeg: number): void {
    const animated = this.leftIK.animatedHandRotation;
    this.surface.setTranslate(0, 0, radius);
    let bestAngle = Infinity;
    for (let i = 0; i < ROLL_SAMPLES; i++) {
      const rollDeg = ROLL_SAMPLES > 1 ? -rangeDeg + (2 * rangeDeg * i) / (ROLL_SAMPLES - 1) : 0;
      this.roll.setFromAxisAngle(Vec3.UP, rollDeg);
      this.target.copy(marker.getWorldTransform()).mul(this.roll).mul(this.surface).mul(this.leftPalmInverse);
      this.rotation.setFromMat4(this.target);
      const angle = animated ? quatAngle(this.rotation, animated) : 0;
      if (angle < bestAngle) {
        bestAngle = angle;
        this.best.copy(this.target);
      }
      if (rangeDeg === 0) break;
    }
    this.best.getTranslation(this.position);
    this.rotation.setFromMat4(this.best);
  }

  private wrap(fingers: FingerGrip | null, marker: Entity, radius: number, weight: number): void {
    if (!fingers) return;
    const m = marker.getWorldTransform();
    m.getTranslation(this.origin);
    m.getY(this.direction).normalize();
    // Radius in world units (the weapon inherits the character's scale).
    fingers.apply(this.origin, this.direction, radius * m.getScale(this.a).x, weight);
  }

  private draw(weapons: WeaponHolder, targetValid: boolean): void {
    if (this.rightHand) this.axes(this.rightHand.getWorldTransform(), 1);
    if (weapons.socket) this.axes(weapons.socket.getWorldTransform(), 0.7);
    if (this.leftHand) this.axes(this.leftHand.getWorldTransform(), 1);
    const left = weapons.grip("left");
    if (left) this.axes(left.marker.getWorldTransform(), 0.7);
    const right = weapons.grip("right");
    if (right) this.axes(right.marker.getWorldTransform(), 0.5);
    if (targetValid) {
      // Yellow cross: where the IK puts the left wrist.
      const p = this.position;
      for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
        this.app.drawLine(this.a.set(p.x - dx * 0.02, p.y - dy * 0.02, p.z - dz * 0.02), this.b.set(p.x + dx * 0.02, p.y + dy * 0.02, p.z + dz * 0.02), YELLOW, false);
      }
    }
  }

  /** RGB = local X / Y / Z (for grip frames: X across, Y = handle axis, Z = toward the palm). */
  private axes(m: Mat4, scale: number): void {
    m.getTranslation(this.a);
    const length = AXIS_LENGTH * scale;
    for (const [get, color] of [[m.getX, RED], [m.getY, GREEN], [m.getZ, BLUE]] as const) {
      get.call(m, this.direction).normalize().mulScalar(length).add(this.a);
      this.app.drawLine(this.a, this.direction, color, false);
    }
  }
}

function quatAngle(a: Quat, b: Quat): number {
  const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return 2 * Math.acos(Math.min(1, dot));
}
