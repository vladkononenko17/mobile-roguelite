// Builds the zombie enemy bodies ("Low-Poly Zombie Asset Pack", Unity humanoid rig) into one small
// GLB each, with a zombie animation set:
//
//   node scripts/build-zombies.mjs <animation source.glb> <palette.png> <out dir> <zombie.glb ...>
//
// Each <zombie.glb> is a character FBX of the pack converted with FBX2glTF (`FBX2glTF --binary`);
// it is written to <out dir>/<name in lower case>.glb. The pack's colour palette <palette.png>
// (every face samples one flat swatch) is embedded at a quarter of its size.
//
// Clips come from <animation source.glb> (the Vanguard GLB, Mixamo "mixamorig:" bones) retargeted
// the same way as scripts/build-survivor.mjs: limb bones follow the source's world bone directions
// (plus a constant twist so each bone's roll is kept), torso / head bones take the full rest-to-rest
// correction, and the hips translation is scaled by hips height. The Unity bone names are mapped to
// the Mixamo ones (Chest = Spine1, UpperArm = Arm, ...). On top of the retargeted motion a zombie
// posture is layered in model space (hunched spine, head hanging to one side, arms reaching forward,
// limp wrists), and the melee and hit clips are keyed procedurally from that posture, so no
// weapon or human-combat pose ends up on an enemy. Clips: Zombie_Idle, Zombie_Walk, Zombie_Attack,
// Zombie_Hit, Zombie_Death, Zombie_DeathForward.
//
// Not part of the normal build. Needs (npm i --no-save): three, @gltf-transform/core@4,
// @gltf-transform/extensions@4, @gltf-transform/functions@4, sharp.
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune } from "@gltf-transform/functions";
import sharp from "sharp";

const [sourcePath, palettePath, outDir, ...targetPaths] = process.argv.slice(2);
if (!targetPaths.length) throw new Error("usage: node scripts/build-zombies.mjs <animation source.glb> <palette.png> <out dir> <zombie.glb ...>");

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const source = await io.read(sourcePath);

/** Unity humanoid bone -> Mixamo bone of the animation source. */
const BONE_MAP = {
  Hips: "Hips", Spine: "Spine", Chest: "Spine1", UpperChest: "Spine2", Neck: "Neck", Head: "Head",
  ...Object.fromEntries(["Left", "Right"].flatMap((s) => [
    [`${s}Shoulder`, `${s}Shoulder`], [`${s}UpperArm`, `${s}Arm`], [`${s}LowerArm`, `${s}ForeArm`], [`${s}Hand`, `${s}Hand`],
    [`${s}UpperLeg`, `${s}UpLeg`], [`${s}LowerLeg`, `${s}Leg`], [`${s}Foot`, `${s}Foot`], [`${s}Toes`, `${s}ToeBase`],
  ])),
};
const UPRIGHT = new Set(["Hips", "Spine", "Chest", "UpperChest", "Neck", "Head"]);

const trs = (n) => new THREE.Matrix4().compose(new THREE.Vector3(...n.getTranslation()), new THREE.Quaternion(...n.getRotation()), new THREE.Vector3(...n.getScale()));
const byName = (doc) => new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
const rotationOf = (m) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(m));
const positionOf = (m) => new THREE.Vector3().setFromMatrixPosition(m);
const depth = (n) => (n.getParentNode() ? depth(n.getParentNode()) + 1 : 0);
const deg = THREE.MathUtils.degToRad;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** World matrices for every node of `doc`, with `local(node)` overriding rest local transforms. */
function worldMatrices(doc, local = trs) {
  const world = new Map();
  const visit = (n, parent) => {
    const m = parent.clone().multiply(local(n));
    world.set(n, m);
    n.listChildren().forEach((c) => visit(c, m));
  };
  doc.getRoot().listScenes()[0].listChildren().forEach((n) => visit(n, new THREE.Matrix4()));
  return world;
}

/** Samples a glTF sampler (LINEAR / STEP) at time t. */
function sample(sampler, t) {
  const input = sampler.getInput().getArray();
  const output = sampler.getOutput();
  const size = output.getElementSize();
  const at = (i) => output.getElement(i, new Array(size).fill(0));
  if (t <= input[0]) return at(0);
  const last = input.length - 1;
  if (t >= input[last]) return at(last);
  let i = 0;
  while (input[i + 1] < t) i++;
  const a = at(i), b = at(i + 1);
  if (sampler.getInterpolation() === "STEP") return a;
  const u = (t - input[i]) / (input[i + 1] - input[i]);
  if (size === 4) {
    const q = new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), u);
    return [q.x, q.y, q.z, q.w];
  }
  return a.map((v, k) => v + (b[k] - v) * u);
}

// Source clips by name, and the source pose (world matrices) at any time of one.
const sNodes = byName(source);
const sRest = worldMatrices(source);
const sHips = sNodes.get("mixamorig:Hips");
const sRestHips = positionOf(sRest.get(sHips));
const sourceClips = new Map(source.getRoot().listAnimations().map((anim) => {
  const channels = new Map();
  for (const ch of anim.listChannels()) channels.set(`${ch.getTargetNode().getName()}/${ch.getTargetPath()}`, ch.getSampler());
  const duration = Math.max(...anim.listSamplers().map((s) => s.getInput().getMax([])[0]));
  return [anim.getName(), { channels, duration }];
}));
function sourcePose(clipName, t) {
  const { channels } = sourceClips.get(clipName);
  return worldMatrices(source, (n) => {
    const m = trs(n);
    const r = channels.get(`${n.getName()}/rotation`);
    const p = channels.get(`${n.getName()}/translation`);
    if (!r && !p) return m;
    const pos = new THREE.Vector3(), rot = new THREE.Quaternion(), scl = new THREE.Vector3();
    m.decompose(pos, rot, scl);
    if (r) rot.set(...sample(r, t));
    if (p) pos.set(...sample(p, t));
    return m.compose(pos, rot, scl);
  });
}

/* ----------------------------------------------------------------------------------------------
 * Zombie posture, layered in model space (+Z forward, +X the character's left, +Y up) on a pose
 * of world rotations. Rotating a bone rotates its whole subtree about the bone's own joint.
 * -------------------------------------------------------------------------------------------- */

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const axisAngle = (axis, degrees) => new THREE.Quaternion().setFromAxisAngle(axis, deg(degrees));
const dir = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const mix = (a, b, t) => a.clone().lerp(b, t).normalize();

/** The standing posture every zombie clip starts from (per side: +1 left, -1 right). */
const POSTURE = {
  /** Forward hunch per spine bone (degrees about the model's X axis). */
  hunch: { Spine: 16, Chest: 12, UpperChest: 8 },
  /** The neck lifts the head back up a little; the head hangs to the right. */
  neckPitch: -12, headTilt: -16, headTurn: 8,
  /** Upper arm / forearm / hand directions: arms reach forward, the right one lower and looser. */
  arms: {
    Left: { upper: dir(0.28, -0.12, 1), lower: dir(0.08, 0.02, 1), hand: dir(0.08, -0.55, 1) },
    Right: { upper: dir(-0.3, -0.55, 1), lower: dir(-0.1, -0.35, 1), hand: dir(-0.05, -0.8, 1) },
  },
  /** How much of the source animation's own arm motion survives (0 = fully posed). */
  armFreedom: 0.12,
};

function makePosture(joints) {
  const byBone = new Map(joints.map((j) => [j.getName(), j]));
  const children = new Map(joints.map((j) => [j, joints.filter((c) => c.getParentNode() === j)]));
  const subtree = (bone) => [bone, ...children.get(bone).flatMap(subtree)];
  const subtrees = new Map(joints.map((j) => [j, subtree(j)]));

  /** Pre-multiplies the world rotation of `bone` and everything below it by `q`. */
  const rotate = (world, name, q) => {
    for (const j of subtrees.get(byBone.get(name))) world.get(j).premultiply(q);
  };
  /** Turns `bone` (and below) so its +Y axis moves `weight` of the way to `target`. */
  const aim = (world, name, target, weight = 1) => {
    const current = Y.clone().applyQuaternion(world.get(byBone.get(name)));
    rotate(world, name, new THREE.Quaternion().setFromUnitVectors(current, mix(current, target, weight)));
  };

  /**
   * Applies the posture. `p` overrides: pitch (extra hunch, degrees), sway / yaw (upper body,
   * degrees), armLift (-1 reach down .. 1 arms raised), headBack (degrees), arms (direction
   * overrides per side), freedom (source arm motion kept), weight (0 = untouched source pose).
   */
  return (world, p = {}) => {
    const w = p.weight ?? 1;
    if (w <= 0) return;
    for (const [bone, degrees] of Object.entries(POSTURE.hunch)) rotate(world, bone, axisAngle(X, degrees * w));
    if (p.pitch) rotate(world, "Spine", axisAngle(X, p.pitch * w));
    if (p.sway) rotate(world, "Spine", axisAngle(Z, p.sway * w));
    if (p.yaw) rotate(world, "Spine", axisAngle(Y, p.yaw * w));
    rotate(world, "Neck", axisAngle(X, (POSTURE.neckPitch - (p.headBack ?? 0)) * w));
    rotate(world, "Head", axisAngle(Z, POSTURE.headTilt * w).multiply(axisAngle(Y, POSTURE.headTurn * w)));
    const freedom = p.freedom ?? POSTURE.armFreedom;
    for (const side of ["Left", "Right"]) {
      const a = { ...POSTURE.arms[side], ...(p.arms?.[side] ?? {}) };
      const k = w * (1 - freedom);
      aim(world, `${side}UpperArm`, a.upper, k);
      aim(world, `${side}LowerArm`, a.lower, k);
      aim(world, `${side}Hand`, a.hand, k);
    }
  };
}

/* ----------------------------------------------------------------------------------------------
 * Clips. `source` is the Vanguard clip sampled for the base motion; `duration` overrides its
 * length (the source then loops); `pose(t, duration)` returns the posture parameters at time t.
 * -------------------------------------------------------------------------------------------- */

const FPS = 30;
const up = (side) => ({ upper: dir(side * 0.25, 0.75, 0.6), lower: dir(side * 0.05, 0.85, 0.5), hand: dir(0, 0.6, 1) });
const down = (side) => ({ upper: dir(side * 0.18, -0.25, 1), lower: dir(side * 0.02, -0.55, 1), hand: dir(0, -0.9, 1) });
const blendArms = (side, lift, strike) => {
  const b = POSTURE.arms[side === 1 ? "Left" : "Right"];
  const u = up(side), d = down(side);
  const pick = (key) => mix(mix(b[key], u[key], lift), d[key], strike);
  return { upper: pick("upper"), lower: pick("lower"), hand: pick("hand") };
};

const CLIPS = [
  {
    // Swaying on the spot, arms hanging forward (legs from the source's straight rest pose).
    name: "Zombie_Idle", source: "restpose", duration: 3.2,
    pose: (t, d) => {
      const s = Math.sin((2 * Math.PI * t) / d);
      return { sway: 5 * s, yaw: 4 * Math.sin((4 * Math.PI * t) / d), pitch: 2 * Math.cos((2 * Math.PI * t) / d), freedom: 0.05 };
    },
  },
  {
    // The source walk under a hunch that rolls with the steps (one sway per stride).
    name: "Zombie_Walk", source: "Walking",
    pose: (t, d) => {
      const s = Math.sin((2 * Math.PI * t) / d);
      return {
        sway: 7 * s, yaw: -6 * s, pitch: 3 * Math.abs(Math.cos((2 * Math.PI * t) / d)),
        arms: {
          Left: { upper: dir(0.28, -0.12 + 0.12 * s, 1) },
          Right: { upper: dir(-0.3, -0.55 - 0.12 * s, 1) },
        },
      };
    },
  },
  {
    // Melee: both arms rise (0 - 0.3 s), then claw down with a lunge (the hit lands ~0.42 s), then
    // recover. Matches EnemyDef.attackWindup of the walker.
    name: "Zombie_Attack", source: "Idle_10", duration: 1.0,
    pose: (t) => {
      const lift = smooth(0, 0.3, t) * (1 - smooth(0.3, 0.42, t));
      const strike = smooth(0.3, 0.42, t) * (1 - smooth(0.55, 1.0, t));
      return {
        pitch: -14 * lift + 24 * strike, yaw: 10 * strike, freedom: 0,
        arms: { Left: blendArms(1, lift, strike), Right: blendArms(-1, lift, strike) },
      };
    },
  },
  {
    // A short flinch: the torso snaps back and the head whips, then settles.
    name: "Zombie_Hit", source: "restpose", duration: 0.4,
    pose: (t) => {
      const k = smooth(0, 0.06, t) * (1 - smooth(0.1, 0.4, t));
      return { pitch: -22 * k, sway: 8 * k, headBack: 20 * k, freedom: 0 };
    },
  },
  // Deaths: the source motion; the posture fades out as the body goes down.
  { name: "Zombie_Death", source: "dying_backwards", pose: (t) => ({ weight: 1 - smooth(0, 0.5, t) }) },
  { name: "Zombie_DeathForward", source: "Shot_and_Fall_Forward", pose: (t) => ({ weight: 1 - smooth(0, 0.4, t), pitch: 10 }) },
];

/* ---------------------------------------------------------------------------------------------- */

const palette = await sharp(palettePath).metadata();
const paletteImage = await sharp(palettePath)
  .resize(Math.round(palette.width / 4), Math.round(palette.height / 4))
  .png({ palette: true, colours: 256 })
  .toBuffer();
fs.mkdirSync(outDir, { recursive: true });

for (const targetPath of targetPaths) {
  const target = await io.read(targetPath);
  const tRoot = target.getRoot();
  const tRest = worldMatrices(target);
  const joints = [...tRoot.listSkins()[0].listJoints()].sort((a, b) => depth(a) - depth(b));
  const jointSet = new Set(joints);
  const restLocal = new Map(joints.map((j) => [j, new THREE.Quaternion(...j.getRotation())]));
  const posture = makePosture(joints);

  // Twist correction per mapped bone: target frame = source frame * correction.
  const mapped = new Map();
  for (const joint of joints) {
    const src = sNodes.get(`mixamorig:${BONE_MAP[joint.getName()]}`);
    if (!BONE_MAP[joint.getName()] || !src) continue;
    const c = rotationOf(sRest.get(src)).invert().multiply(rotationOf(tRest.get(joint)));
    mapped.set(joint, { src, correction: UPRIGHT.has(joint.getName()) ? c : new THREE.Quaternion(0, c.y, 0, c.w).normalize() });
  }
  const hips = joints.find((j) => j.getName() === "Hips");
  const hipsScale = positionOf(tRest.get(hips)).y / sRestHips.y;
  const tRestHips = positionOf(tRest.get(hips));
  const hipsParentInverse = tRest.get(hips.getParentNode()).clone().invert();
  const parentRest = (j) => rotationOf(tRest.get(j.getParentNode()));
  const buffer = tRoot.listBuffers()[0];
  const accessor = (array, type) => target.createAccessor().setArray(array).setType(type).setBuffer(buffer);

  for (const clip of CLIPS) {
    const src = sourceClips.get(clip.source);
    if (!src) throw new Error(`source clip ${clip.source} missing`);
    const duration = clip.duration ?? src.duration;
    const frames = Math.max(2, Math.round(duration * FPS) + 1);
    const times = Array.from({ length: frames }, (_, i) => (i / (frames - 1)) * duration);
    const rotations = new Map(joints.map((j) => [j, []]));
    const hipsPositions = [];
    for (const t of times) {
      const sWorld = sourcePose(clip.source, t % src.duration);
      // Retargeted world rotations, parents first; unmapped bones keep their rest local rotation.
      const world = new Map();
      for (const joint of joints) {
        const m = mapped.get(joint);
        const parent = jointSet.has(joint.getParentNode()) ? world.get(joint.getParentNode()) : parentRest(joint);
        world.set(joint, m ? rotationOf(sWorld.get(m.src)).multiply(m.correction) : parent.clone().multiply(restLocal.get(joint)));
      }
      posture(world, clip.pose(t, duration));
      for (const joint of joints) {
        const parent = jointSet.has(joint.getParentNode()) ? world.get(joint.getParentNode()) : parentRest(joint);
        const local = parent.clone().invert().multiply(world.get(joint));
        rotations.get(joint).push(local.x, local.y, local.z, local.w);
      }
      const delta = positionOf(sWorld.get(sHips)).sub(sRestHips).multiplyScalar(hipsScale);
      const local = tRestHips.clone().add(delta).applyMatrix4(hipsParentInverse);
      hipsPositions.push(local.x, local.y, local.z);
    }
    const anim = target.createAnimation(clip.name);
    const input = accessor(new Float32Array(times), "SCALAR");
    const channel = (node, pathName, values, type) => {
      const sampler = target.createAnimationSampler().setInput(input).setOutput(accessor(new Float32Array(values), type)).setInterpolation("LINEAR");
      anim.addSampler(sampler).addChannel(target.createAnimationChannel().setTargetNode(node).setTargetPath(pathName).setSampler(sampler));
    };
    for (const [joint, values] of rotations) {
      // Skip bones that never leave their rest rotation (fingers, end bones).
      const rest = restLocal.get(joint);
      let moves = false;
      for (let i = 0; i < values.length && !moves; i += 4) moves = Math.abs(values[i] * rest.x + values[i + 1] * rest.y + values[i + 2] * rest.z + values[i + 3] * rest.w) < 0.99999;
      if (moves) channel(joint, "rotation", values, "VEC4");
    }
    channel(hips, "translation", hipsPositions, "VEC3");
  }

  // Palette texture, matte.
  for (const texture of tRoot.listTextures()) texture.dispose();
  const texture = target.createTexture("zombie_palette").setImage(paletteImage).setMimeType("image/png");
  for (const material of tRoot.listMaterials()) {
    material.setBaseColorTexture(texture).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.9);
    material.setEmissiveFactor([0, 0, 0]);
    for (const ext of material.listExtensions()) ext.dispose();
  }

  await target.transform(prune(), dedup());
  const outPath = path.join(outDir, `${path.basename(targetPath, ".glb").toLowerCase()}.glb`);
  await io.write(outPath, target);
  console.log(`wrote ${outPath} (${(fs.statSync(outPath).size / 1e3).toFixed(0)} KB, hips scale ${hipsScale.toFixed(3)}), clips: ${tRoot.listAnimations().map((a) => a.getName()).join(", ")}`);
}
