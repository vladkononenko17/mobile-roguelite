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
type Aim = Partial<Record<"spine" | "neck" | "head" | "lArm" | "lFore" | "rArm" | "rFore" | "lThigh" | "lShin" | "rThigh" | "rShin", THREE.Vector3>>;

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

// ------------------------------------------------------------------ the look up close

/** Strength of the soft rim of light round every person (the scene follows the daylight). */
export const RIM = { value: 0.3 };

const detailCache = new Map<string, THREE.Texture>();
/**
 * A normal map drawn from a texture's own shading: the folds of a sweater, the
 * weave of jeans, the creases of a face catch the light instead of being paint.
 */
function detailNormal(map: THREE.Texture, strength: number): THREE.Texture | null {
  const key = `${map.uuid}|${strength}`;
  const hit = detailCache.get(key);
  if (hit) return hit;
  const img = map.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || !img.width || typeof document === "undefined") return null;
  const N = Math.min(1024, img.width);
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const g = cv.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0, N, N);
  const src = g.getImageData(0, 0, N, N).data;
  const lum = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) lum[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.59 + src[i * 4 + 2] * 0.11) / 255;
  const out = g.createImageData(N, N);
  const L = (x: number, y: number) => lum[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (L(x + 1, y) - L(x - 1, y) + 0.5 * (L(x + 1, y - 1) - L(x - 1, y - 1) + L(x + 1, y + 1) - L(x - 1, y + 1))) * strength;
    const dy = (L(x, y + 1) - L(x, y - 1) + 0.5 * (L(x - 1, y + 1) - L(x - 1, y - 1) + L(x + 1, y + 1) - L(x + 1, y - 1))) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * N + x) * 4;
    out.data[i] = (-dx / l * 0.5 + 0.5) * 255;
    out.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
    out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = map.flipY;
  t.wrapS = map.wrapS; t.wrapT = map.wrapT;
  t.anisotropy = 4;
  detailCache.set(key, t);
  return t;
}

const upgraded = new WeakMap<THREE.Material, THREE.MeshPhysicalMaterial>();
/**
 * The avatar's flat materials made real: cloth with a sheen and its folds in
 * relief, skin with a soft peach-fuzz sheen and pores, wet eyes, hair cut out
 * with smooth edges, and a faint rim of light that lifts the figure off the floor.
 */
function upgrade(src: THREE.MeshStandardMaterial): THREE.MeshPhysicalMaterial {
  const hit = upgraded.get(src);
  if (hit) return hit;
  const name = src.name ?? "";
  const cut = src.alphaTest > 0 || src.transparent || /hair|brow|lash|beard|moustache|ponytail|braid|afro|bob/i.test(name);
  const eye = /^eyes?$|eye_|eyeball/i.test(name) && !/brow|lash/i.test(name);
  const skin = /body|skin/i.test(name);
  const m = new THREE.MeshPhysicalMaterial({
    name, map: src.map, color: src.color, side: cut ? THREE.DoubleSide : src.side,
    alphaTest: cut ? 0.4 : 0, transparent: false, depthWrite: true, metalness: 0,
  });
  m.envMapIntensity = 0.6;
  if (eye) { m.roughness = 0.12; m.clearcoat = 1; m.clearcoatRoughness = 0.05; }
  else if (cut) { m.roughness = 0.5; m.sheen = 0.5; m.sheenRoughness = 0.45; m.sheenColor = new THREE.Color(0xffffff).lerp(src.color, 0.4); m.alphaToCoverage = true; }
  else if (skin) {
    m.roughness = 0.52; m.sheen = 0.3; m.sheenRoughness = 0.5; m.sheenColor = new THREE.Color(0xffc8a8);
    const n = src.map ? detailNormal(src.map, 2.2) : null;
    if (n) { m.normalMap = n; m.normalScale.setScalar(0.35); }
  } else {
    // fabric
    m.roughness = 0.88; m.sheen = 0.7; m.sheenRoughness = 0.7; m.sheenColor = new THREE.Color(0xffffff).lerp(src.color, 0.6).multiplyScalar(0.8);
    const n = src.map ? detailNormal(src.map, 4.5) : null;
    if (n) { m.normalMap = n; m.normalScale.setScalar(0.85); }
  }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimK = RIM;
    sh.fragmentShader = "uniform float rimK;\n" + sh.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n\tfloat rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);\n\ttotalEmissiveRadiance += vec3(1.0, 0.94, 0.86) * diffuseColor.rgb * rimF * rimK;",
    );
  };
  m.customProgramCacheKey = () => "stiny-rim";
  upgraded.set(src, m);
  return m;
}

let blobMat: THREE.MeshBasicMaterial | null = null;
/** A soft dark patch under the feet: people stand on the floor instead of floating over it. */
function contactShadow(): THREE.Mesh {
  if (!blobMat) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.45, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.7), blobMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.renderOrder = 1;
  m.userData.keepShape = true;
  return m;
}

/** Where a limb points now, in the character's space. */
const _inv = new THREE.Quaternion();

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
  private shadow: THREE.Mesh;

  constructor(gltf: GLTF) {
    this.model = SkeletonUtils.clone(gltf.scene);
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        if (Array.isArray(m.material)) m.material = m.material.map((mt) => upgrade(mt as THREE.MeshStandardMaterial));
        else m.material = upgrade(m.material as THREE.MeshStandardMaterial);
        for (const mt of Array.isArray(m.material) ? m.material : [m.material]) if (!this.materials.includes(mt)) this.materials.push(mt);
      }
      if ((o as THREE.Bone).isBone) {
        const name = o.name.replace(/^mixamorig:?/, "");
        this.bones[name] = o as THREE.Bone;
      }
    });
    this.pivot.add(this.model);
    this.root.add(this.pivot);
    this.shadow = contactShadow();
    this.root.add(this.shadow);
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
    for (const m of this.materials) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; m.alphaTest = 0; (m as THREE.MeshPhysicalMaterial).alphaToCoverage = false; }
    this.shadow.visible = false;
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
    // aim the limbs: standing and walking get a natural body over the borrowed clips
    const nat = this.pose === "stand" || this.pose === "walk" || this.prev === "stand" || this.prev === "walk" ? this.natural(walking ? w : 0) : null;
    const aims = this.pose === "stand" || this.pose === "walk" ? { ...nat } : def.aim(this.t);
    const prevAims = k < 1 ? (this.prev === "stand" || this.prev === "walk" ? { ...nat } : from.aim(this.t)) : {};
    const slump = this.slump;
    if (slump > 0.01 && (this.pose === "stand" || this.pose === "walk" || (!aims.spine && !aims.neck)) && def.pitch === undefined) {
      aims.spine = V(0, 1, 0.18 * slump);
      aims.neck = V(0, 1, 0.55 * slump);
    }
    this.aimLimb("Spine1", "Neck", aims.spine, prevAims.spine, k);
    this.aimLimb("Neck", "Head", aims.neck, prevAims.neck, k);
    this.aimLimb("Head", "HeadTop_End", aims.head, prevAims.head, k);
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

  /** Where a bone points now (after the clip), in the character's space. */
  private dirOf(bone: string, child: string): THREE.Vector3 | null {
    const b = this.bones[bone], c = this.bones[child];
    if (!b || !c) return null;
    this.pivot.getWorldQuaternion(_inv).invert();
    return c.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(_inv);
  }

  /**
   * A person standing at ease: arms hanging close to the body, elbows soft,
   * legs under the hips, a slow breath. Walking (w → 1) keeps the clip's legs
   * and swings each arm against the opposite leg.
   */
  private natural(w: number): Aim {
    const t = this.t;
    const breath = Math.sin(t * 1.4) * 0.012;
    const sway = Math.sin(t * 0.37) * 0.015;
    const aim: Aim = {};
    const rT = this.dirOf("RightUpLeg", "RightLeg"), lT = this.dirOf("LeftUpLeg", "LeftLeg");
    const swingL = rT ? THREE.MathUtils.clamp(rT.z * 1.1, -0.45, 0.45) * w : 0;
    const swingR = lT ? THREE.MathUtils.clamp(lT.z * 1.1, -0.45, 0.45) * w : 0;
    aim.lArm = V(0.11 + breath, -1, 0.04 + sway + swingL);
    aim.rArm = V(-0.11 - breath, -1, 0.04 - sway + swingR);
    aim.lFore = V(0.03, -1, 0.16 + Math.max(0, swingL) * 0.9);
    aim.rFore = V(-0.03, -1, 0.16 + Math.max(0, swingR) * 0.9);
    if (w < 0.999) {
      // legs: from the clip's wide crouch to standing straight, by how much we walk
      const mix = (clip: THREE.Vector3 | null, stand: THREE.Vector3) => (clip ? stand.clone().lerp(clip, w).normalize() : stand);
      aim.lThigh = mix(lT, V(0.05 + sway, -1, 0.0));
      aim.rThigh = mix(rT, V(-0.05 + sway, -1, 0.0));
      aim.lShin = mix(this.dirOf("LeftLeg", "LeftFoot"), V(0.0, -1, -0.02));
      aim.rShin = mix(this.dirOf("RightLeg", "RightFoot"), V(0.0, -1, -0.02));
      aim.spine = V(0, 1, 0.03 + breath);
      aim.neck = V(0, 1, 0.2);
      aim.head = V(0, 1, 0.1 + Math.sin(t * 0.23) * 0.04);
    }
    return aim;
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
