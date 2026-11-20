import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

/**
 * Real people for «Чотири стіни»: CC0 MakeHuman avatars (made with the VRM
 * Avatar Maker, built by scripts/build-stiny-people.mjs onto the Survivor's
 * skeleton) with skin, eyes, hair, beards and clothes. They carry two clips —
 * idle and walk — and everything else (sitting at the laptop, lying on the
 * bed, push-ups, a phone at the ear, a cigarette at the mouth, curled up in
 * the corridor) is posed here, limb by limb, by aiming each bone in the
 * character's own space and blending that over the clip.
 */

export type PersonId =
  | "hero1" | "hero2" | "hero3" | "kid" | "friend1" | "friend2" | "friend3" | "friend4" | "friend5" | "mom" | "dad" | "grandma" | "officer";

export type Pose =
  | "stand" | "walk" | "sit" | "type" | "eat" | "read" | "guitar" | "lie" | "push" | "floor" | "curl" | "call" | "smoke"
  | "reach" | "lean" | "sill" | "arms_up" | "stir" | "water" | "sparkler" | "kneel";

const BASE = `${import.meta.env?.BASE_URL ?? "/"}stiny/people/`;

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<GLTF>>();

/** Loads (once) a person's model; `lite` is the light copy for the yard. */
export function loadPerson(id: PersonId, lite = false): Promise<GLTF> {
  const key = `${id}${lite ? "-lite" : ""}`;
  let p = cache.get(key);
  if (!p) {
    p = loader.loadAsync(`${BASE}${key}.glb`).then((g) => { prepareClips(g.animations); return g; });
    cache.set(key, p);
  }
  return p;
}

/** The walk clip moves the hips forward: keep it walking on the spot (the game moves the person). */
function prepareClips(clips: THREE.AnimationClip[]): void {
  for (const c of clips) {
    for (const t of c.tracks) {
      if (!/Hips\.position$/.test(t.name)) continue;
      const v = t.values;
      const x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

/**
 * Where each limb points, in the character's space (+Z forward, +Y up, +X is the
 * character's left). Bones not listed keep the clip.
 */
type Aim = Partial<Record<"spine" | "neck" | "lArm" | "lFore" | "rArm" | "rFore" | "lThigh" | "lShin" | "rThigh" | "rShin", THREE.Vector3>>;

interface PoseDef {
  aim: (t: number) => Aim;
  /** Height of the hips above the root, metres (sitting on a chair ≈ 0.5); undefined keeps standing. */
  hips?: number;
  /** Pitch of the whole body: −90° lying face up, +90° face down (push-ups). */
  pitch?: number;
  /** For a pitched body: how high its back lies, and how far its feet sit back along the facing (metres). */
  lift?: [number, number];
  /** Clip under the pose. */
  clip?: "idle" | "walk";
}

const down = V(0, -1, 0);
const POSES: Record<Pose, PoseDef> = {
  stand: { aim: () => ({}) },
  walk: { aim: () => ({}), clip: "walk" },
  sit: { hips: 0.5, aim: () => ({ lThigh: V(0.08, -0.05, 1), rThigh: V(-0.08, -0.05, 1), lShin: V(0, -1, 0.1), rShin: V(0, -1, 0.1), lArm: V(0.15, -0.9, 0.35), rArm: V(-0.15, -0.9, 0.35), lFore: V(0, -0.3, 1), rFore: V(0, -0.3, 1) }) },
  type: { hips: 0.5, aim: (t) => ({ spine: V(0, 1, 0.12), lThigh: V(0.08, -0.05, 1), rThigh: V(-0.08, -0.05, 1), lShin: V(0, -1, 0.1), rShin: V(0, -1, 0.1), lArm: V(0.25, -0.75, 0.55), rArm: V(-0.25, -0.75, 0.55), lFore: V(-0.25, -0.05 + Math.sin(t * 18) * 0.04, 1), rFore: V(0.25, -0.05 + Math.cos(t * 15) * 0.04, 1) }) },
  eat: { hips: 0.5, aim: (t) => ({ lThigh: V(0.08, -0.05, 1), rThigh: V(-0.08, -0.05, 1), lShin: V(0, -1, 0.1), rShin: V(0, -1, 0.1), lArm: V(0.2, -0.8, 0.5), lFore: V(-0.1, -0.1, 1), rArm: V(-0.25, -0.65, 0.7), rFore: V(0.35, 0.4 + Math.sin(t * 3) * 0.45, 0.6) }) },
  read: { hips: 0.5, aim: () => ({ lThigh: V(0.08, -0.05, 1), rThigh: V(-0.08, -0.05, 1), lShin: V(0, -1, 0.1), rShin: V(0, -1, 0.1), neck: V(0, 0.8, 0.6), lArm: V(0.2, -0.85, 0.45), rArm: V(-0.2, -0.85, 0.45), lFore: V(-0.3, 0.45, 0.85), rFore: V(0.3, 0.45, 0.85) }) },
  guitar: { hips: 0.5, aim: (t) => ({ lThigh: V(0.1, -0.05, 1), rThigh: V(-0.1, -0.05, 1), lShin: V(0, -1, 0.1), rShin: V(0, -1, 0.1), neck: V(-0.1, 0.85, 0.5), lArm: V(0.5, -0.5, 0.7), lFore: V(-0.3, 0.3, 1), rArm: V(-0.3, -0.85, 0.4), rFore: V(0.6, -0.2 + Math.sin(t * 9) * 0.2, 0.75) }) },
  lie: { pitch: -Math.PI / 2, lift: [0.7, 0.9], aim: (t) => ({ lThigh: down, rThigh: down, lShin: down, rShin: down, lArm: V(0.22, -1, 0.05), rArm: V(-0.22, -1, 0.05), lFore: V(0.05, -1, 0.12), rFore: V(-0.05, -1, 0.12 + Math.sin(t * 0.4) * 0.03) }) },
  push: { pitch: Math.PI / 2, lift: [0.32, -0.85], aim: (t) => { const b = (Math.sin(t * 5) + 1) / 2; return { lThigh: down, rThigh: down, lShin: down, rShin: down, lArm: V(0.35, -0.2 * b, 1), rArm: V(-0.35, -0.2 * b, 1), lFore: V(0, -0.9 * b, 1 - 0.4 * b), rFore: V(0, -0.9 * b, 1 - 0.4 * b) }; } },
  floor: { hips: 0.14, aim: () => ({ spine: V(0, 1, 0.3), neck: V(0, 0.7, 0.7), lThigh: V(0.15, 0.55, 0.85), rThigh: V(-0.15, 0.55, 0.85), lShin: V(0, -1, 0.15), rShin: V(0, -1, 0.15), lArm: V(0.2, -0.55, 0.8), rArm: V(-0.2, -0.55, 0.8), lFore: V(-0.6, -0.2, 0.75), rFore: V(0.6, -0.2, 0.75) }) },
  curl: { hips: 0.14, aim: (t) => ({ spine: V(0, 1, 0.55), neck: V(0, 0.4, 0.9 + Math.sin(t * 0.7) * 0.05), lThigh: V(0.12, 0.75, 0.6), rThigh: V(-0.12, 0.75, 0.6), lShin: V(0, -1, 0.05), rShin: V(0, -1, 0.05), lArm: V(0.2, -0.3, 0.9), rArm: V(-0.2, -0.3, 0.9), lFore: V(-0.8, 0.1, 0.5), rFore: V(0.8, 0.1, 0.5) }) },
  call: { aim: () => ({ neck: V(-0.25, 1, 0.1), rArm: V(-0.55, -0.35, 0.45), rFore: V(0.35, 0.9, -0.15) }) },
  smoke: { aim: (t) => { const k = Math.max(0, Math.sin(t * 0.9)); return { rArm: V(-0.3, -0.85 + k * 0.35, 0.4 + k * 0.3), rFore: V(0.2 + k * 0.3, 0.25 + k * 0.7, 0.9 - k * 0.5) }; } },
  reach: { aim: () => ({ rArm: V(-0.15, -0.25, 1), rFore: V(0, -0.1, 1) }) },
  lean: { aim: () => ({ spine: V(0, 1, 0.3), neck: V(0, 0.9, 0.45) }) },
  sill: { aim: () => ({ spine: V(0, 1, 0.18), lArm: V(0.15, -0.7, 0.7), rArm: V(-0.15, -0.7, 0.7), lFore: V(-0.2, -0.6, 0.8), rFore: V(0.2, -0.6, 0.8) }) },
  arms_up: { aim: (t) => ({ lArm: V(0.35, 0.9, 0.2), rArm: V(-0.35, 0.9, 0.2), lFore: V(-0.6, 0.5 + Math.sin(t * 5) * 0.2, 0.3), rFore: V(0.6, 0.5 + Math.cos(t * 5) * 0.2, 0.3) }) },
  stir: { aim: (t) => ({ spine: V(0, 1, 0.12), lArm: V(0.2, -0.8, 0.5), lFore: V(-0.2, -0.2, 1), rArm: V(-0.2, -0.75, 0.6), rFore: V(0.25 + Math.cos(t * 3) * 0.2, -0.45, 0.85 + Math.sin(t * 3) * 0.15) }) },
  water: { aim: () => ({ spine: V(0, 1, 0.2), rArm: V(-0.15, -0.5, 0.85), rFore: V(0, -0.6, 0.8) }) },
  sparkler: { aim: (t) => ({ rArm: V(-0.4, 0.2 + Math.sin(t * 2) * 0.3, 0.9), rFore: V(Math.cos(t * 2) * 0.5, 0.6 + Math.sin(t * 2.4) * 0.3, 0.6) }) },
  kneel: { hips: 0.42, aim: () => ({ spine: V(0, 1, 0.1), neck: V(0, 0.75, 0.65), lThigh: V(0.1, -1, 0.05), rThigh: V(-0.1, -1, 0.05), lShin: V(0, -0.15, -1), rShin: V(0, -0.15, -1), lArm: V(0.1, -1, 0.1), rArm: V(-0.1, -1, 0.1) }) },
};

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();

/** One person: a skinned model, its clips, and the pose laid over them. */
export class Human {
  /** Add this to the scene (or under an old rig's root): it faces +Z. */
  readonly root = new THREE.Group();
  private pivot = new THREE.Group();
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction | null;
  private walk: THREE.AnimationAction | null;
  private bones: Record<string, THREE.Bone> = {};
  private restHips = 0.93;
  pose: Pose = "stand";
  private prev: Pose = "stand";
  private blend = 1;
  private lastNow = 0;
  private t = Math.random() * 10;
  /** 0..1: how low the head and shoulders hang (despair). */
  slump = 0;
  /** The person's height relative to the model (a child, someone tall). */
  size = 1;
  /** Seat height for the sitting poses here (a chair, a bed's edge, a stool), metres of hips. */
  seat: number | null = null;
  readonly materials: THREE.Material[] = [];

  constructor(gltf: GLTF) {
    this.model = SkeletonUtils.clone(gltf.scene);
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mt of mats) {
          const s = mt as THREE.MeshStandardMaterial;
          // hair, brows and lashes are cut-outs: no sorting troubles
          if (s.transparent && s.map) { s.alphaTest = 0.45; s.transparent = false; s.depthWrite = true; }
          s.envMapIntensity = 0.6;
          this.materials.push(s);
        }
      }
      if ((o as THREE.Bone).isBone) {
        const name = o.name.replace(/^mixamorig:?/, "");
        this.bones[name] = o as THREE.Bone;
      }
    });
    this.pivot.add(this.model);
    this.root.add(this.pivot);
    this.mixer = new THREE.AnimationMixer(this.model);
    const clip = (n: string) => gltf.animations.find((a) => a.name === n);
    const idleClip = clip("Survivor_Idle") ?? clip("Idle_10") ?? null;
    const walkClip = clip("Walking") ?? null;
    this.idle = idleClip ? this.mixer.clipAction(idleClip) : null;
    this.walk = walkClip ? this.mixer.clipAction(walkClip) : null;
    this.idle?.play();
    if (this.walk) { this.walk.play(); this.walk.setEffectiveWeight(0); }
    this.mixer.update(Math.random() * 3);
    this.model.updateMatrixWorld(true);
    const hips = this.bones.Hips;
    if (hips) this.restHips = hips.getWorldPosition(_a).y - this.root.getWorldPosition(_b).y;
  }

  /** A bone by its Mixamo name (Hips, Head, RightHand…), to hang things on. */
  bone(name: string): THREE.Bone | undefined { return this.bones[name]; }

  /** Tints a garment (material name starts with `prefix`), e.g. a friend's colour on his shirt. */
  tint(prefix: RegExp, color: number): void {
    for (const m of this.materials) if (prefix.test(m.name)) (m as THREE.MeshStandardMaterial).color.set(color);
  }

  /** See-through, for someone who is gone now. */
  fade(opacity: number): void {
    for (const m of this.materials) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; m.alphaTest = 0; }
    this.model.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = false; });
  }

  setPose(p: Pose): void {
    if (p === this.pose) return;
    this.prev = this.pose;
    this.pose = p;
    this.blend = 0;
  }

  /** `speed` m/s while walking freely; the pose decides the rest. */
  update(dt: number, speed = 0): void {
    this.t += dt;
    // blend by real time, so a slow frame never leaves a pose half-way
    const now = performance.now();
    const real = this.lastNow ? Math.min(0.5, (now - this.lastNow) / 1000) : dt;
    this.lastNow = now;
    this.blend = Math.min(1, this.blend + real * 4);
    // keep the right size whatever the parent's scale (old rigs were scaled up)
    const ps = this.root.parent?.scale.x ?? 1;
    this.root.scale.setScalar(this.size / ps);
    const def = POSES[this.pose];
    const walking = def.clip === "walk" || (this.pose === "stand" && speed > 0.15);
    const w = walking ? Math.min(1, speed / 1.6 + 0.35) : 0;
    this.walk?.setEffectiveWeight(w);
    this.idle?.setEffectiveWeight(1 - w);
    if (this.walk) this.walk.timeScale = Math.max(0.6, Math.min(1.6, speed / 1.3));
    this.mixer.update(dt);
    // the whole body: pitched for lying and planking, lowered for sitting
    const from = POSES[this.prev];
    const k = this.blend * this.blend * (3 - 2 * this.blend);
    const pitch = THREE.MathUtils.lerp(from.pitch ?? 0, def.pitch ?? 0, k);
    this.pivot.rotation.x = pitch;
    this.root.updateMatrixWorld(true);
    // aim the limbs
    const aims = def.aim(this.t);
    const prevAims = k < 1 ? from.aim(this.t) : {};
    const slump = this.slump;
    if (slump > 0.01 && !aims.spine && !aims.neck && def.pitch === undefined) {
      aims.spine = V(0, 1, 0.18 * slump);
      aims.neck = V(0, 1, 0.55 * slump);
    }
    this.aimLimb("Spine1", "Neck", aims.spine, prevAims.spine, k);
    this.aimLimb("Neck", "Head", aims.neck, prevAims.neck, k);
    for (const [side, s] of [["Left", "l"], ["Right", "r"]] as const) {
      this.aimLimb(`${side}Arm`, `${side}ForeArm`, aims[`${s}Arm`], prevAims[`${s}Arm`], k);
      this.aimLimb(`${side}ForeArm`, `${side}Hand`, aims[`${s}Fore`], prevAims[`${s}Fore`], k);
      this.aimLimb(`${side}UpLeg`, `${side}Leg`, aims[`${s}Thigh`], prevAims[`${s}Thigh`], k);
      this.aimLimb(`${side}Leg`, `${side}Foot`, aims[`${s}Shin`], prevAims[`${s}Shin`], k);
    }
    // where the body rests: a pitched body (lying, planking) is lifted and slid along the facing;
    // an upright one is lowered until its hips sit at the pose's height (a chair, the floor, kneeling)
    const lf = from.lift ?? [0, 0];
    const lt = def.lift ?? [0, 0];
    this.pivot.position.set(0, THREE.MathUtils.lerp(lf[0], lt[0], k), THREE.MathUtils.lerp(lf[1], lt[1], k));
    this.model.position.y = 0;
    const hips = this.bones.Hips;
    if (hips && Math.abs(pitch) < 0.3) {
      const h = (d: PoseDef) => (d.hips !== undefined && this.seat !== null && d.hips >= 0.4 ? this.seat : d.hips ?? this.restHips);
      const target = THREE.MathUtils.lerp(h(from), h(def), k);
      this.model.updateMatrixWorld(true);
      const hy = (hips.getWorldPosition(_a).y - this.root.getWorldPosition(_b).y) / (this.size || 1);
      this.model.position.y = Math.min(0, target - hy);
    }
  }

  /**
   * Turns `bone` so the direction to `child` points along `dir` (character
   * space), blended from `prevDir` by `k`. Missing dirs fall back to the clip.
   */
  private aimLimb(bone: string, child: string, dir: THREE.Vector3 | undefined, prevDir: THREE.Vector3 | undefined, k: number): void {
    const b = this.bones[bone];
    const c = this.bones[child];
    if (!b || !c) return;
    let want: THREE.Vector3 | undefined;
    let weight = 1;
    if (dir && prevDir) want = _d.copy(prevDir).lerp(dir, k).normalize();
    else if (dir) { want = _d.copy(dir); weight = k; }
    else if (prevDir) { want = _d.copy(prevDir); weight = 1 - k; }
    if (!want || weight <= 0.001) return;
    b.updateWorldMatrix(true, false);
    c.updateWorldMatrix(false, false);
    const from = c.getWorldPosition(_a).sub(b.getWorldPosition(_b)).normalize();
    // the character's space → world: the pivot carries the facing and the pitch
    this.pivot.getWorldQuaternion(_q2);
    const to = want.clone().applyQuaternion(_q2);
    _q.setFromUnitVectors(from, to);
    const world = b.getWorldQuaternion(new THREE.Quaternion());
    const target = _q.multiply(world);
    const parentQ = b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const local = parentQ.invert().multiply(target);
    b.quaternion.slerp(local, weight);
    b.updateMatrixWorld(true);
  }
}

/**
 * Puts a real person in place of an old chibi rig: the rig keeps its root (the
 * game moves and turns it), its own body is hidden.
 */
export function replaceRig(rig: { root: THREE.Object3D; body: THREE.Object3D }, h: Human): void {
  for (const c of [...rig.root.children]) if (c.userData.human) rig.root.remove(c);
  h.root.userData.human = true;
  rig.root.add(h.root);
  rig.body.visible = false;
}
