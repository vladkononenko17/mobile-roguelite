import { Color, Mat4, Quat, Vec3, math, type AppBase, type Entity, type GraphNode } from "playcanvas";
import { AIM, type CharacterModel, type WeaponClassProfile } from "../config";
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
const WHITE = new Color(1, 1, 1);
const MAGENTA = new Color(1, 0.3, 1);

/**
 * Hands on the held weapon, run every frame after the animation (and the aim twist), following the
 * held weapon's class profile (WEAPON_CLASSES):
 *   base animation (+ the class's upper-body pose)
 *   -> right-hand grip per the class `hold`: the hand is turned into a real grip on the weapon (which
 *      follows the WeaponSocket in the palm) and right-arm IK places it:
 *        clip: palm where the clip put it, aim along the animated hand (rifle)
 *        chest: grip held in front of the chest, aim along the facing (pistol)
 *        shoulder: stock in the right shoulder pocket, aim along the facing, lowered at a run (shotgun)
 *        hand: no correction, the animation moves the weapon (melee)
 *   -> left-arm IK puts the left palm frame on the weapon's LeftHandGrip (class `leftHandIK`)
 *   -> procedural finger grip (class `fingerGrip`).
 * `weight` (the upper-body layer weight, which falls to 0 under full-body actions such as attacks)
 * fades the arm corrections, so they never fight an attack or reload clip.
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
  private readonly chest: GraphNode | null;
  private readonly rightShoulder: GraphNode | null;
  private readonly aim = new Vec3();
  private readonly pole = new Vec3();
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
    this.chest = model.findByName(AIM.chestBone);
    this.rightShoulder = model.findByName("mixamorig:RightArm");
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

  /**
   * `weight`: how much the weapon pose shows (the upper-body layer weight). `runBlend`: 0 standing
   * still .. 1 at running speed (for lowered carries).
   */
  update(weapons: WeaponHolder, weight: number, facingYawDeg: number, runBlend: number): void {
    const profile = weapons.profile;
    const right = weapons.grip("right");
    const left = weapons.grip("left");
    let targetValid = false;
    if (profile && weapons.gripped && this.character.hands) {
      this.setElbowPoles(profile, facingYawDeg);
      if (right && weapons.entity && weight > 0 && profile.hold !== "hand") {
        this.holdRight(weapons, profile, weight, facingYawDeg, runBlend);
      }
      if (left && profile.leftHandIK && weight > 0) {
        this.solveLeftTarget(left.marker, left.def.radius, left.def.rollRangeDeg ?? 0);
        this.leftIK.apply(this.position, this.rotation, weight, AIM.forearmTwistShare, AIM.elbowSwivelDeg);
        targetValid = true;
      }
      if (profile.fingerGrip) {
        if (right) this.wrap(this.rightFingers, right.marker, right.def.radius, 1);
        if (left && profile.leftHandIK) this.wrap(this.leftFingers, left.marker, left.def.radius, weight);
      }
    }
    if (this.debug) this.draw(weapons, targetValid);
  }

  /** Elbow directions for both arms from the class profile (mirrored for the left arm). */
  private setElbowPoles(profile: WeaponClassProfile, facingYawDeg: number): void {
    const elbows = profile.elbows;
    if (!elbows) {
      this.rightIK.setPole(null);
      this.leftIK.setPole(null);
      return;
    }
    const yaw = facingYawDeg * math.DEG_TO_RAD;
    const weight = profile.elbowWeight ?? 1;
    // Hero's right = (-cos, 0, sin), forward = (sin, 0, cos) at yaw.
    for (const [ik, side] of [[this.rightIK, 1], [this.leftIK, -1]] as const) {
      const [out, up, ahead] = side < 0 && profile.elbowsLeft ? profile.elbowsLeft : elbows;
      const r = out * side;
      ik.setPole(this.pole.set(-Math.cos(yaw) * r + Math.sin(yaw) * ahead, up, Math.sin(yaw) * r + Math.cos(yaw) * ahead), weight);
    }
  }

  /**
   * Right-hand grip: the desired weapon rotation (muzzle along the aim, top up) gives the desired
   * hand rotation (weapon = hand * constant socket/grip transform); the class hold gives the palm
   * point (the WeaponSocket) position. Right-arm IK then places wrist and elbow.
   */
  private holdRight(weapons: WeaponHolder, profile: WeaponClassProfile, weight: number, facingYawDeg: number, runBlend: number): void {
    const hand = this.rightHand;
    const weapon = weapons.entity;
    if (!hand || !weapon) return;
    const handWorld = hand.getWorldTransform();
    const scale = handWorld.getScale(this.b).x;
    const yaw = facingYawDeg * math.DEG_TO_RAD;
    // Aim.
    const forward = this.aim;
    if (profile.hold === "clip") {
      handWorld.getY(forward).normalize();
    } else {
      const pitchDeg = math.lerp(profile.pitchDeg ?? 0, profile.runPitchDeg ?? profile.pitchDeg ?? 0, runBlend);
      const pitch = pitchDeg * math.DEG_TO_RAD;
      forward.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    }
    // Desired weapon rotation: muzzle (-Z) along the aim, top (+Y) toward world up.
    const z = this.a.copy(forward).mulScalar(-1);
    const x = this.b.cross(Vec3.UP, z);
    if (x.lengthSq() < 1e-6) return;
    x.normalize();
    const y = this.origin.cross(z, x);
    const d = this.basis.data;
    d[0] = x.x; d[1] = x.y; d[2] = x.z; d[4] = y.x; d[5] = y.y; d[6] = y.z; d[8] = z.x; d[9] = z.y; d[10] = z.z;
    d[3] = d[7] = d[11] = d[12] = d[13] = d[14] = 0; d[15] = 1;
    const desiredWeapon = this.q1.setFromMat4(this.basis);
    const weaponInverse = this.rotation.copy(weapon.getRotation()).invert();
    // Palm point (the WeaponSocket).
    const palm = this.position;
    if (profile.hold === "clip") {
      handWorld.transformPoint(this.rightPalm, palm);
    } else {
      // Anchor in the hero's facing frame: right = (-cos, 0, sin), forward = (sin, 0, cos) at yaw.
      const anchor = profile.anchor ?? [0, 0, 0];
      const shift = profile.runAnchorShift ?? [0, 0, 0];
      const right = (anchor[0] + shift[0] * runBlend) * scale;
      const up = (anchor[1] + shift[1] * runBlend) * scale;
      const ahead = (anchor[2] + shift[2] * runBlend) * scale;
      const base = profile.hold === "shoulder" ? this.rightShoulder : this.chest;
      if (!base) return;
      palm.copy(base.getPosition()).add(this.a.set(-Math.cos(yaw) * right + Math.sin(yaw) * ahead, up, Math.sin(yaw) * right + Math.cos(yaw) * ahead));
      if (profile.hold === "shoulder") {
        // The anchor is where the stock goes: palm = stock + desired rotation * (socket - stock).
        const stock = weapons.stock, socket = weapons.socket;
        if (!stock || !socket) return;
        const local = weaponInverse.transformVector(this.b.sub2(socket.getPosition(), stock.getPosition()), this.b);
        palm.add(desiredWeapon.transformVector(local, this.b));
      }
    }
    // weapon = hand * S with S constant (socket and grip), so hand = weapon * inverse(S).
    const handToWeapon = this.q2.copy(hand.getRotation()).invert().mul(weapon.getRotation());
    const desiredHand = this.q3.copy(desiredWeapon).mul(handToWeapon.invert());
    // Wrist position that puts the palm point there: palm - desiredHand * (palm offset * scale).
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
    if (weapons.entity) {
      // White: the weapon's forward (muzzle, -Z) axis; magenta cross: the stock point.
      const m = weapons.entity.getWorldTransform();
      m.getTranslation(this.a);
      m.getZ(this.b).normalize().mulScalar(-0.6).add(this.a);
      this.app.drawLine(this.a, this.b, WHITE, false);
      if (weapons.stock) this.cross(weapons.stock.getPosition(), MAGENTA);
    }
    if (targetValid) {
      // Yellow cross: where the IK puts the left wrist.
      this.cross(this.position, YELLOW);
    }
  }

  private cross(p: Vec3, color: Color): void {
    for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      this.app.drawLine(this.origin.set(p.x - dx * 0.02, p.y - dy * 0.02, p.z - dz * 0.02), this.direction.set(p.x + dx * 0.02, p.y + dy * 0.02, p.z + dz * 0.02), color, false);
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
