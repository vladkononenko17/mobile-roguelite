import { Color, Mat4, Quat, Vec3, math, type AppBase, type Entity, type GraphNode } from "playcanvas";
import { AIM, AIM_STANCE, FINGER_GRIP, ONE_HAND, RECOIL, RELOAD, WEAPON_CLASSES, type CharacterModel, type WeaponClassProfile } from "../config";
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
  private readonly leftGunPalmInverse = new Mat4();
  private readonly rightHand: GraphNode | null;
  private readonly leftHand: GraphNode | null;
  private readonly leftShoulder: GraphNode | null;
  private readonly hips: GraphNode | null;
  private readonly spine: GraphNode | null;
  private readonly head: GraphNode | null;
  private readonly leftForeArm: GraphNode | null;
  /** The left hand's bind-pose local rotation (straight on the forearm). */
  private readonly leftRest = new Quat();
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
    private readonly character: Pick<CharacterModel, "hands" | "fingers" | "reach" | "supportRollDeg" | "leftGunHand">,
  ) {
    this.leftIK = new ArmIK(model, "Left");
    this.rightIK = new ArmIK(model, "Right");
    this.rightHand = model.findByName("mixamorig:RightHand");
    this.leftHand = model.findByName("mixamorig:LeftHand");
    this.leftShoulder = model.findByName("mixamorig:LeftArm");
    this.hips = model.findByName("mixamorig:Hips");
    this.spine = model.findByName("mixamorig:Spine");
    this.head = model.findByName("mixamorig:Head");
    this.leftForeArm = model.findByName("mixamorig:LeftForeArm");
    if (this.leftHand) this.leftRest.copy(this.leftHand.getLocalRotation());
    this.chest = model.findByName(AIM.chestBone);
    this.rightShoulder = model.findByName("mixamorig:RightArm");
    const fingers = character.fingers;
    this.rightFingers = fingers ? new FingerGrip(model, "Right", fingers) : null;
    this.leftFingers = fingers ? new FingerGrip(model, "Left", fingers.supportJoints ? { ...fingers, rigid: false } : fingers) : null;
    if (character.hands) {
      gripMatrix(character.hands.left, this.leftPalmInverse).invert();
      gripMatrix(character.leftGunHand ?? character.hands.left, this.leftGunPalmInverse).invert();
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
      const shoulder = profile.hold === "shoulder";
      // Standing still with a long gun: side-on to the target, leaning into the gun (fades at a run).
      const set = weight * (1 - runBlend);
      if (shoulder && set > 0) this.stance(set, facingYawDeg);
      if (right && weapons.entity && weight > 0 && profile.hold !== "hand") {
        this.holdRight(weapons, profile, weight, facingYawDeg, runBlend);
      }
      // Reload: the support hand leaves the gun for the magazine and back (0 -> 1 -> 0 over the reload).
      const r = weapons.reloadPhase;
      // (Dual guns: no fetch - each hand keeps its own gun through the reload.)
      const fetchW = r >= 0 && profile !== WEAPON_CLASSES.dual ? smooth(0, 0.15, r) * (1 - smooth(0.82, 1, r)) : 0;
      const oneHanded = AIM.oneHanded.some((c) => WEAPON_CLASSES[c] === profile);
      if (oneHanded && weight > 0) {
        this.relaxLeft(weight * (1 - fetchW), facingYawDeg);
        if (fetchW > 0 && left) {
          this.solveLeftTarget(left.marker, left.def.radius, left.def.rollRangeDeg ?? 0);
          this.toMagazine(weapons, r, 1);
          this.leftIK.apply(this.position, this.rotation, weight * fetchW, AIM.forearmTwistShare, AIM.elbowSwivelDeg);
        }
      } else if (left && profile.leftHandIK && weight > 0) {
        this.solveLeftTarget(left.marker, left.def.radius, left.def.rollRangeDeg ?? 0, profile === WEAPON_CLASSES.dual);
        // Shorter arms hold further back on the handguard (the grips are set for the Survivor's reach).
        // (Not for dual guns: the second gun is already placed for this hero's reach.)
        const k = profile === WEAPON_CLASSES.dual ? 1 : Math.min(1, (this.character.reach ?? 1) / 0.94) ** 2;
        if (k < 1 && right) this.position.sub(this.a.copy(right.marker.getPosition())).mulScalar(k).add(right.marker.getPosition());
        // Dual guns: each hand keeps its own gun (both magazines drop and refill on their own).
        if (fetchW > 0 && profile !== WEAPON_CLASSES.dual) this.toMagazine(weapons, r, fetchW);
        this.leftIK.apply(this.position, this.rotation, weight, AIM.forearmTwistShare, AIM.elbowSwivelDeg);
        targetValid = true;
      }
      // Cheek on the stock (after the arms, so the head follows the shouldered gun).
      if (shoulder && set > 0) this.cheekWeld(set * (1 - fetchW), facingYawDeg);
      if (profile.fingerGrip) {
        if (right) this.wrap(this.rightFingers, right.marker, right.def.radius, 1);
        // Long guns: the support fingers close round the handguard at least FINGER_GRIP.supportMinDeg.
        const minDeg = profile === WEAPON_CLASSES.dual ? 0 : FINGER_GRIP.supportMinDeg;
        if (left && profile.leftHandIK && !oneHanded) this.wrap(this.leftFingers, left.marker, left.def.radius, weight * (1 - fetchW), minDeg);
        // Reloading: the fingers hold the magazine (a closed grip round the hand's own palm line).
        if (fetchW > 0 && this.leftFingers && this.leftHand && profile !== WEAPON_CLASSES.dual) {
          const m = this.leftHand.getWorldTransform();
          m.getTranslation(this.origin);
          m.getZ(this.direction).normalize();
          this.leftFingers.apply(this.origin, this.direction, 0.012 * m.getScale(this.a).x, weight * fetchW);
        }
      }
    }
    if (this.debug) this.draw(weapons, targetValid);
  }

  /** How far into the reload's "gun on its side" pose (0..1). */
  private reloadTip(weapons: WeaponHolder): number {
    const r = weapons.reloadPhase;
    return r >= 0 ? smooth(0, 0.2, r) * (1 - smooth(0.75, 1, r)) : 0;
  }

  /**
   * The support hand during a reload: from its grip to the magazine well, down to the belt for a fresh
   * magazine (mid reload), back up into the well and home to the grip (`fetchW` blends it in and out).
   */
  private toMagazine(weapons: WeaponHolder, r: number, fetchW: number): void {
    const left = weapons.grip("left");
    const mag = this.magazine(weapons, this.a);
    if (!mag || !left) return;
    const scale = this.leftHand ? this.leftHand.getWorldTransform().getScale(this.b).x : 1;
    const down = Math.sin(Math.PI * Math.min(1, Math.max(0, (r - 0.25) / 0.4))) * RELOAD.pouchMetres;
    mag.y -= down * scale;
    // Move the whole hand by the grip -> magazine offset (the wrist target is the grip's, so the palm
    // lands on the magazine exactly as it lands on the handguard).
    this.position.add(mag.sub(left.marker.getPosition()).mulScalar(fetchW));
  }

  /** The magazine well point: the gun's magazine node, else under the firing hand's grip. */
  private magazine(weapons: WeaponHolder, out: Vec3): Vec3 | null {
    if (weapons.magazinePoint(out)) return out;
    const right = weapons.grip("right");
    return right ? out.copy(right.marker.getPosition()).add(this.b.set(0, -0.07, 0)) : null;
  }

  /**
   * Bladed stance: the hips turn the gun side back (`AIM_STANCE.bladeDeg`), the chest turns part of
   * the way back toward the target, the spine leans forward into the gun. World-space turns, so they
   * read the same on every rig; the arms are solved afterwards.
   */
  private stance(weight: number, facingYawDeg: number): void {
    const yaw = facingYawDeg * math.DEG_TO_RAD;
    const right = this.b.set(-Math.cos(yaw), 0, Math.sin(yaw));
    if (this.hips) this.turn(this.hips, Vec3.UP, -AIM_STANCE.bladeDeg * weight);
    if (this.spine) this.turn(this.spine, right, -AIM_STANCE.leanDeg * weight);
    if (this.chest) this.turn(this.chest, Vec3.UP, AIM_STANCE.bladeDeg * AIM_STANCE.chestBack * weight);
  }

  /** Cheek weld: the head nods forward and leans toward the stock (the right side). */
  private cheekWeld(weight: number, facingYawDeg: number): void {
    if (!this.head) return;
    const yaw = facingYawDeg * math.DEG_TO_RAD;
    this.turn(this.head, this.b.set(-Math.cos(yaw), 0, Math.sin(yaw)), -AIM_STANCE.headNodDeg * weight);
    this.turn(this.head, this.b.set(Math.sin(yaw), 0, Math.cos(yaw)), AIM_STANCE.headTiltDeg * weight);
  }

  /** Turns a bone by `deg` about a world axis (keeping its position). */
  private turn(bone: GraphNode, axis: Vec3, deg: number): void {
    this.q3.setFromAxisAngle(axis, deg).mul(bone.getRotation());
    bone.setRotation(this.q3);
  }

  /**
   * The free arm of a one-handed hold: the wrist hangs beside the hip (a hair forward and out), the
   * elbow a little back, the hand straight on the forearm - instead of where the aim clip left it.
   */
  private readonly anchorTmp: [number, number, number] = [0, 0, 0];

  private relaxLeft(weight: number, facingYawDeg: number): void {
    const shoulder = this.leftShoulder, hand = this.leftHand, fore = this.leftForeArm;
    if (!shoulder || !hand || !fore) return;
    const yaw = facingYawDeg * math.DEG_TO_RAD;
    const lx = Math.cos(yaw), lz = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
    const reach = shoulder.getPosition().distance(fore.getPosition()) + fore.getPosition().distance(hand.getPosition());
    const s = shoulder.getPosition();
    this.position.set(s.x + lx * 0.07 + fx * 0.06, s.y - reach * 0.93, s.z + lz * 0.07 + fz * 0.06);
    this.leftIK.setPole(this.pole.set(lx * 0.3 - fx, -0.2, lz * 0.3 - fz), 1);
    this.leftIK.apply(this.position, hand.getRotation(), weight, 0, 0);
    // Straight wrist: the hand's own bend from the aim clip, eased out.
    this.q1.copy(hand.getLocalRotation()).slerp(hand.getLocalRotation(), this.leftRest, weight);
    hand.setLocalRotation(this.q1);
  }

  /** Elbow directions for both arms from the class profile (mirrored for the left arm). */
  private setElbowPoles(profile: WeaponClassProfile, facingYawDeg: number): void {
    const oneHand = AIM.oneHanded.some((c) => WEAPON_CLASSES[c] === profile);
    const elbows = oneHand ? ONE_HAND.elbow : profile.elbows;
    if (!elbows) {
      this.rightIK.setPole(null);
      this.leftIK.setPole(null);
      return;
    }
    const yaw = facingYawDeg * math.DEG_TO_RAD;
    const weight = oneHand ? 1 : profile.elbowWeight ?? 1;
    // Hero's right = (-cos, 0, sin), forward = (sin, 0, cos) at yaw.
    for (const [ik, side] of [[this.rightIK, 1], [this.leftIK, -1]] as const) {
      const [out, up, ahead] = side < 0 && profile.elbowsLeft && !oneHand ? profile.elbowsLeft : elbows;
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
    const oneHand = AIM.oneHanded.some((c) => WEAPON_CLASSES[c] === profile);
    // Pistols and dual SMGs are held out at arm's length: let the arms open almost straight.
    const extended = oneHand || profile === WEAPON_CLASSES.dual;
    this.rightIK.maxReach = extended ? ONE_HAND.maxReach : 0.96;
    this.leftIK.maxReach = profile === WEAPON_CLASSES.dual ? ONE_HAND.maxReach : 0.96;
    if (profile.hold === "clip") {
      handWorld.getY(forward).normalize();
    } else {
      const pitchDeg = oneHand
        ? math.lerp(ONE_HAND.pitchDeg, ONE_HAND.runPitchDeg, runBlend)
        : math.lerp(profile.pitchDeg ?? 0, profile.runPitchDeg ?? profile.pitchDeg ?? 0, runBlend);
      // Recoil flips the muzzle up; a reload tips it down toward the support hand.
      const tipDeg = profile === WEAPON_CLASSES.dual ? -RELOAD.dualTipDeg : RELOAD.tipDeg;
      const pitch = (pitchDeg + weapons.recoil * RECOIL.pitchDeg - this.reloadTip(weapons) * tipDeg) * math.DEG_TO_RAD;
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
    // Reload: the gun rolls onto its side (magazine toward the support hand).
    const tip = this.reloadTip(weapons);
    // (Not dual guns: rolling the pair about the right grip would swing the left gun up or down.)
    if (tip > 0 && profile !== WEAPON_CLASSES.dual) desiredWeapon.mul(this.q2.setFromAxisAngle(Vec3.FORWARD, -RELOAD.rollDeg * tip));
    const weaponInverse = this.rotation.copy(weapon.getRotation()).invert();
    // Palm point (the WeaponSocket).
    const palm = this.position;
    if (profile.hold === "clip") {
      handWorld.transformPoint(this.rightPalm, palm);
    } else {
      // Anchor in the hero's facing frame: right = (-cos, 0, sin), forward = (sin, 0, cos) at yaw.
      // One-handed (pistols): from the right shoulder, the arm out almost straight (GTA / CoD / BF).
      const hold = oneHand ? ONE_HAND.anchor : profile.anchor ?? [0, 0, 0];
      const shift = oneHand ? ONE_HAND.runAnchorShift : profile.runAnchorShift ?? [0, 0, 0];
      // Reloading: a pistol (or a pair of guns) comes in from arm's length (GTA / CoD), and back out.
      const inAnchor = oneHand ? RELOAD.pistolAnchor : profile === WEAPON_CLASSES.dual ? RELOAD.dualAnchor : null;
      const pull = inAnchor ? this.reloadTip(weapons) : 0;
      const anchor = this.anchorTmp;
      for (let i = 0; i < 3; i++) anchor[i] = math.lerp(hold[i], inAnchor ? inAnchor[i] : hold[i], pull);
      // Stances are tuned on the Survivor's arms: shorter arms hold the gun closer.
      const reach = scale * (this.character.reach ?? 1);
      const run = runBlend * (1 - pull);
      // Dual guns: the pair stays centred on the chest (the second gun's offset is fixed, so a
      // reach-scaled right gun would push the left one out past a shorter left arm).
      const right = (anchor[0] + shift[0] * run) * (profile === WEAPON_CLASSES.dual ? scale : reach);
      const up = (anchor[1] + shift[1] * run) * reach;
      const ahead = (anchor[2] + shift[2] * run) * reach;
      const base = profile.hold === "shoulder" || oneHand ? this.rightShoulder : this.chest;
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
    // Recoil drives the gun back along its line (into the shoulder) and the reload drops it a little.
    palm.sub(this.a.copy(forward).mulScalar(weapons.recoil * RECOIL.backMetres * scale));
    palm.y -= tip * RELOAD.dropMetres * scale;
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
  private solveLeftTarget(marker: Entity, radius: number, rangeDeg: number, gunHand = false): void {
    const palmInverse = gunHand ? this.leftGunPalmInverse : this.leftPalmInverse;
    const baseRoll = gunHand ? 0 : this.character.supportRollDeg ?? 0;
    const animated = this.leftIK.animatedHandRotation;
    this.surface.setTranslate(0, 0, radius);
    let bestAngle = Infinity;
    for (let i = 0; i < ROLL_SAMPLES; i++) {
      const rollDeg = ROLL_SAMPLES > 1 ? -rangeDeg + (2 * rangeDeg * i) / (ROLL_SAMPLES - 1) : 0;
      this.roll.setFromAxisAngle(Vec3.UP, rollDeg + baseRoll);
      this.target.copy(marker.getWorldTransform()).mul(this.roll).mul(this.surface).mul(palmInverse);
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

  private wrap(fingers: FingerGrip | null, marker: Entity, radius: number, weight: number, minDeg = 0): void {
    if (!fingers) return;
    const m = marker.getWorldTransform();
    m.getTranslation(this.origin);
    m.getY(this.direction).normalize();
    // Radius in world units (the weapon inherits the character's scale).
    fingers.apply(this.origin, this.direction, radius * m.getScale(this.a).x, weight, minDeg);
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

/** 0 below a, 1 above b, smooth between. */
function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function quatAngle(a: Quat, b: Quat): number {
  const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return 2 * Math.acos(Math.min(1, dot));
}
