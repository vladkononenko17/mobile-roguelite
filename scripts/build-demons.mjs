// Builds the Hell demon bodies into one small GLB each, with a demon animation set:
//
//   node scripts/build-demons.mjs <animation source.glb> <in dir> <out dir>
//
// Sources (`hell2` release, see assets-src/SOURCES.md), converted to GLB first:
// - Bestiary "Dungeon Monsters Kit" (Standard): Imp, Puglin - rigged on the Unreal mannequin
//   skeleton (pelvis, spine_01 ..), no clips; PBR textures with three base colour variants.
// - Codersan "3D Alien Monster": AlienMonster - Mixamo skeleton, no clips; one texture.
//
// Clips come from <animation source.glb> (the Vanguard GLB, Mixamo bones), retargeted by world
// rotation deltas (target world = source world x source rest^-1 x target rest; both rigs are in a
// T-pose), with the hips translation scaled by hips height. A demon posture is layered on top in
// model space and the melee / cast / roar clips are keyed procedurally from it, like the zombies
// (scripts/build-zombies.mjs). Bone directions for the posture come from each bone's child joint,
// so rigs whose bones run along X (Unreal) and along Y (Mixamo) both work.
//
// Each body is decimated for the horde, its textures reduced to base colour (512) plus the emissive
// map (glowing eyes / cracks), and recoloured into infernal skins (out dir/skins/*.webp; the GLB
// embeds the first).
//
// Not part of the normal build. Needs (npm i --no-save): three, @gltf-transform/core@4,
// @gltf-transform/extensions@4, @gltf-transform/functions@4, meshoptimizer, sharp.
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const [sourcePath, inDir, outDir] = process.argv.slice(2);
if (!outDir) throw new Error("usage: node scripts/build-demons.mjs <animation source.glb> <in dir> <out dir>");

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const source = await io.read(sourcePath);

/** Canonical (Unity humanoid) bone -> Mixamo bone of the animation source. */
const TO_MIXAMO = {
  Hips: "Hips", Spine: "Spine", Chest: "Spine1", UpperChest: "Spine2", Neck: "Neck", Head: "Head",
  ...Object.fromEntries(["Left", "Right"].flatMap((s) => [
    [`${s}Shoulder`, `${s}Shoulder`], [`${s}UpperArm`, `${s}Arm`], [`${s}LowerArm`, `${s}ForeArm`], [`${s}Hand`, `${s}Hand`],
    [`${s}UpperLeg`, `${s}UpLeg`], [`${s}LowerLeg`, `${s}Leg`], [`${s}Foot`, `${s}Foot`], [`${s}Toes`, `${s}ToeBase`],
  ])),
};
/** Canonical bone -> the bone's name in each rig. */
const RIGS = {
  ue: {
    Hips: "pelvis", Spine: "spine_01", Chest: "spine_02", UpperChest: "spine_03", Neck: "neck_01", Head: "Head",
    ...Object.fromEntries([["Left", "l"], ["Right", "r"]].flatMap(([s, k]) => [
      [`${s}Shoulder`, `clavicle_${k}`], [`${s}UpperArm`, `upperarm_${k}`], [`${s}LowerArm`, `lowerarm_${k}`], [`${s}Hand`, `hand_${k}`],
      [`${s}UpperLeg`, `thigh_${k}`], [`${s}LowerLeg`, `calf_${k}`], [`${s}Foot`, `foot_${k}`], [`${s}Toes`, `ball_${k}`],
    ])),
  },
  mixamo: Object.fromEntries(Object.entries(TO_MIXAMO).map(([canon, m]) => [canon, `mixamorig:${m}`])),
};

/**
 * The demons. `posture` is the standing pose (see POSTURES); `skins` recolour the base colour
 * texture (hue in degrees, saturation / lightness factors, and an optional dark "char" amount that
 * pushes bright areas towards black-red); `variant` picks one of the pack's base colour variants.
 */
const DEMONS = [
  {
    // Hell grunt / berserker / knight: the Bestiary imp (red demon, ~1.7 m).
    name: "imp", file: "Imp.glb", rig: "ue", posture: "stalker", keep: 0.3,
    base: "T_Imp_BaseColor_1.png", emissive: "T_Imp_Emissive.png",
    skins: {
      imp_red: { variant: 1, hue: 0, sat: 1.05, light: 0.92 },
      imp_crimson: { variant: 1, hue: -10, sat: 1.15, light: 0.72 },
      imp_black: { variant: 1, hue: 0, sat: 0.5, light: 0.45, char: 0.6 },
      imp_obsidian: { variant: 1, hue: 0, sat: 0.3, light: 0.32, char: 0.8 },
    },
  },
  {
    // Hound / brute / the first boss: the Bestiary puglin (squat, big-bellied).
    name: "puglin", file: "Puglin.glb", rig: "ue", posture: "beast", keep: 0.4,
    base: "T_Puglin_BaseColor_1.png", emissive: "T_Puglin_Emissive.png",
    skins: {
      pug_ember: { variant: 2, hue: -4, sat: 1.1, light: 0.9 },
      pug_ash: { variant: 2, hue: 0, sat: 0.5, light: 0.62, char: 0.3 },
      pug_hide: { variant: 2, hue: 0, sat: 0.7, light: 0.42, char: 0.45 },
      pug_glutton: { variant: 2, hue: 18, sat: 0.55, light: 1.12 },
    },
  },
  {
    // Elite / the final boss: the alien monster (tall, clawed, spined shoulders).
    name: "fiend", file: "alienmonster.glb", rig: "mixamo", posture: "upright", keep: 0.35,
    base: "AlienMonster.png",
    skins: {
      fiend_obsidian: { hue: -60, sat: 0.35, light: 0.42, char: 0.6, veins: [1, 0.35, 0.08] },
      fiend_archfiend: { hue: -60, sat: 0.9, light: 0.55, char: 0.4, veins: [1, 0.5, 0.1] },
    },
  },
];

/* ---------------------------------------------------------------------------------------------- */

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
 * Posture, layered in model space (+Z forward, +X the character's left, +Y up).
 * -------------------------------------------------------------------------------------------- */

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const axisAngle = (axis, degrees) => new THREE.Quaternion().setFromAxisAngle(axis, deg(degrees));
const dir = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const mix = (a, b, t) => a.clone().lerp(b, t).normalize();

/** Standing postures: hunch per spine bone, neck / head, arm directions (per side), arm freedom. */
const POSTURES = {
  // Imp: a predatory stalk - low, head thrust forward, claws out wide and ready.
  stalker: {
    hunch: { Spine: 14, Chest: 12, UpperChest: 8 }, neckPitch: -20, headTilt: 0, headTurn: 0,
    arms: {
      Left: { upper: dir(0.75, -0.45, 0.5), lower: dir(0.35, -0.2, 1), hand: dir(0.1, -0.35, 1) },
      Right: { upper: dir(-0.75, -0.45, 0.5), lower: dir(-0.35, -0.2, 1), hand: dir(-0.1, -0.35, 1) },
    },
    armFreedom: 0.2,
  },
  // Puglin: a heavy beast - deep hunch, arms hanging low and forward like an ape.
  beast: {
    hunch: { Spine: 8, Chest: 6, UpperChest: 4 }, neckPitch: -10, headTilt: 0, headTurn: 0,
    arms: {
      Left: { upper: dir(0.45, -0.85, 0.3), lower: dir(0.15, -0.8, 0.5), hand: dir(0.05, -0.8, 0.6) },
      Right: { upper: dir(-0.45, -0.85, 0.3), lower: dir(-0.15, -0.8, 0.5), hand: dir(-0.05, -0.8, 0.6) },
    },
    armFreedom: 0.25,
  },
  // Fiend: upright and menacing, shoulders squared, claws spread at the hips.
  upright: {
    hunch: { Spine: 6, Chest: 6, UpperChest: 4 }, neckPitch: -10, headTilt: 0, headTurn: 0,
    arms: {
      Left: { upper: dir(0.55, -0.8, 0.15), lower: dir(0.35, -0.6, 0.55), hand: dir(0.25, -0.5, 0.8) },
      Right: { upper: dir(-0.55, -0.8, 0.15), lower: dir(-0.35, -0.6, 0.55), hand: dir(-0.25, -0.5, 0.8) },
    },
    armFreedom: 0.2,
  },
};

/**
 * Posture function for a rig: `joints` are the skin joints, `canon` maps canonical names to them.
 * A bone's direction is the direction to its (first mapped) child joint in the bone's own frame.
 */
function makePosture(joints, canon, POSTURE) {
  const children = new Map(joints.map((j) => [j, joints.filter((c) => c.getParentNode() === j)]));
  const subtree = (bone) => [bone, ...children.get(bone).flatMap(subtree)];
  const subtrees = new Map(joints.map((j) => [j, subtree(j)]));
  const node = (name) => canon.get(name);
  const CHILD = { UpperArm: "LowerArm", LowerArm: "Hand" };
  /** Local axis of each posed bone (towards its child joint). */
  const axes = new Map();
  for (const side of ["Left", "Right"]) {
    for (const [bone, child] of Object.entries(CHILD)) {
      axes.set(`${side}${bone}`, new THREE.Vector3(...node(`${side}${child}`).getTranslation()).normalize());
    }
    // The hand: towards its longest child (the middle finger), else its own parent-to-hand direction.
    const hand = node(`${side}Hand`);
    const kids = children.get(hand);
    const longest = kids.sort((a, b) => new THREE.Vector3(...b.getTranslation()).length() - new THREE.Vector3(...a.getTranslation()).length())[0];
    axes.set(`${side}Hand`, longest ? new THREE.Vector3(...longest.getTranslation()).normalize() : axes.get(`${side}LowerArm`).clone());
  }

  const rotate = (world, name, q) => {
    for (const j of subtrees.get(node(name))) world.get(j).premultiply(q);
  };
  const aim = (world, name, target, weight = 1) => {
    const current = axes.get(name).clone().applyQuaternion(world.get(node(name)));
    rotate(world, name, new THREE.Quaternion().setFromUnitVectors(current, mix(current, target, weight)));
  };

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
 * Clips (see scripts/build-zombies.mjs for the scheme). Timings are fixed so EnemyDef wind-ups
 * line up: attack hit at 0.4 s, fast attack at 0.25 s, smash at 0.7 s, cast release at 0.5 s.
 * -------------------------------------------------------------------------------------------- */

const FPS = 30;
const up = (side) => ({ upper: dir(side * 0.35, 0.8, 0.45), lower: dir(side * 0.1, 0.9, 0.4), hand: dir(0, 0.7, 0.8) });
const down = (side) => ({ upper: dir(side * 0.15, -0.3, 1), lower: dir(0, -0.6, 1), hand: dir(0, -0.9, 1) });
const wide = (side) => ({ upper: dir(side * 1, 0.25, 0.1), lower: dir(side * 0.8, 0.55, 0.2), hand: dir(side * 0.4, 0.8, 0.4) });

function clips(POSTURE) {
  const blendArms = (side, lift, strike) => {
    const b = POSTURE.arms[side === 1 ? "Left" : "Right"];
    const u = up(side), d = down(side);
    const pick = (key) => mix(mix(b[key], u[key], lift), d[key], strike);
    return { upper: pick("upper"), lower: pick("lower"), hand: pick("hand") };
  };
  /** Claw strike: arms rise until windup - 0.12 s, rake down at windup, recover by duration. */
  const claw = (name, windup, duration, heavy = 1, oneArm = false) => ({
    name, source: "Idle_10", duration,
    pose: (t) => {
      const lift = smooth(0, windup - 0.12, t) * (1 - smooth(windup - 0.12, windup, t));
      const strike = smooth(windup - 0.12, windup, t) * (1 - smooth(windup + 0.13, duration, t));
      return {
        pitch: (-14 * lift + 26 * strike) * heavy, yaw: (oneArm ? -24 : 10) * strike + (oneArm ? 16 * lift : 0), freedom: 0,
        arms: oneArm
          ? { Right: blendArms(-1, lift, strike) }
          : { Left: blendArms(1, lift, strike), Right: blendArms(-1, lift, strike) },
      };
    },
  });
  return [
    {
      name: "D_Idle", source: "restpose", duration: 2.6,
      pose: (t, d) => ({ sway: 4 * Math.sin((2 * Math.PI * t) / d), pitch: 3 * Math.sin((4 * Math.PI * t) / d), freedom: 0.05 }),
    },
    {
      name: "D_Walk", source: "Walking",
      pose: (t, d) => {
        const s = Math.sin((2 * Math.PI * t) / d);
        return { sway: 5 * s, yaw: -5 * s, pitch: 2 * Math.abs(Math.cos((2 * Math.PI * t) / d)) };
      },
    },
    {
      // Sprint: deep lean, claws trailing back and out.
      name: "D_Run", source: "Running",
      pose: (t, d) => {
        const s = Math.sin((2 * Math.PI * t) / d);
        return {
          pitch: 20, sway: 4 * s, yaw: -5 * s, freedom: 0.35, headBack: -4,
          arms: {
            Left: { upper: dir(0.6, -0.55 + 0.15 * s, -0.4), lower: dir(0.3, -0.4, -0.3) },
            Right: { upper: dir(-0.6, -0.55 - 0.15 * s, -0.4), lower: dir(-0.3, -0.4, -0.3) },
          },
        };
      },
    },
    claw("D_Attack", 0.4, 0.95),
    claw("D_AttackFast", 0.25, 0.6, 1.1, true),
    claw("D_Smash", 0.7, 1.35, 1.5),
    {
      // Cast: both hands drawn back to the chest, then thrust forward (release at 0.5 s).
      name: "D_Cast", source: "Idle_10", duration: 1.05,
      pose: (t) => {
        const draw = smooth(0, 0.4, t) * (1 - smooth(0.4, 0.5, t));
        const thrust = smooth(0.4, 0.5, t) * (1 - smooth(0.7, 1.05, t));
        const back = (side) => ({ upper: dir(side * 0.5, -0.3, -0.6), lower: dir(side * -0.3, 0.6, 0.6), hand: dir(0, 0.5, 1) });
        const fore = (side) => ({ upper: dir(side * 0.15, 0.1, 1), lower: dir(side * 0.05, 0.1, 1), hand: dir(0, 0.3, 1) });
        const arm = (side, key) => mix(mix(POSTURE.arms[side === 1 ? "Left" : "Right"][key], back(side)[key], draw), fore(side)[key], thrust);
        const arms = (side) => ({ upper: arm(side, "upper"), lower: arm(side, "lower"), hand: arm(side, "hand") });
        return { pitch: -12 * draw + 12 * thrust, freedom: 0, arms: { Left: arms(1), Right: arms(-1) } };
      },
    },
    {
      // Roar: rear back, arms flung wide, head up; held, then settle (bosses' phase changes).
      name: "D_Roar", source: "restpose", duration: 1.6,
      pose: (t) => {
        const k = smooth(0, 0.35, t) * (1 - smooth(1.2, 1.6, t));
        const shake = Math.sin(t * 40) * 2 * k;
        return { pitch: -22 * k, headBack: 30 * k + shake, freedom: 0, arms: { Left: blendWide(1, k, POSTURE), Right: blendWide(-1, k, POSTURE) } };
      },
    },
    {
      // Charge: the run under an even deeper lean, head down (used for charges and dives).
      name: "D_Charge", source: "Running",
      pose: () => ({ pitch: 30, headBack: -12, freedom: 0.2, arms: { Left: down(1), Right: down(-1) } }),
    },
    {
      // Ground slam: the source's charged slam (rise, then both fists down at ~0.9 s) under the posture.
      name: "D_Slam", source: "Charged_Ground_Slam",
      pose: (t) => ({ weight: 0.5, pitch: 6 * smooth(0.6, 0.9, t) }),
    },
    {
      name: "D_Hit", source: "restpose", duration: 0.4,
      pose: (t) => {
        const k = smooth(0, 0.06, t) * (1 - smooth(0.1, 0.4, t));
        return { pitch: -20 * k, sway: 7 * k, headBack: 18 * k, freedom: 0 };
      },
    },
    { name: "D_Death", source: "dying_backwards", pose: (t) => ({ weight: 1 - smooth(0, 0.5, t) }) },
    { name: "D_DeathForward", source: "Shot_and_Fall_Forward", pose: (t) => ({ weight: 1 - smooth(0, 0.4, t), pitch: 10 }) },
  ];
}
function blendWide(side, k, POSTURE) {
  const b = POSTURE.arms[side === 1 ? "Left" : "Right"], w = wide(side);
  return { upper: mix(b.upper, w.upper, k), lower: mix(b.lower, w.lower, k), hand: mix(b.hand, w.hand, k) };
}

/* ----------------------------------------------------------------------------------------------
 * Skins: recolour a base colour texture (hue rotate, saturation / lightness, char = burnt dark,
 * veins = glowing cracks in the darkest crevices).
 * -------------------------------------------------------------------------------------------- */

function hsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function rgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
async function recolour(file, skin, size) {
  const { data, info } = await sharp(file).resize(size, size).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 3) {
    let [h, s, l] = hsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    h = (h + (skin.hue ?? 0) + 360) % 360;
    s = Math.min(1, s * (skin.sat ?? 1));
    l = Math.min(1, l * (skin.light ?? 1));
    let c = rgb(h, s, l);
    if (skin.char) {
      // Burnt: bright areas pulled towards a black-red char, keeping some detail.
      const t = skin.char * Math.min(1, l * 1.6);
      c = c.map((v, k) => v * (1 - t) + [0.08, 0.02, 0.02][k] * t);
    }
    if (skin.veins && l < 0.12) c = skin.veins.map((v) => v * (1 - l / 0.12) * 0.9 + c[0] * 0.1);
    for (let k = 0; k < 3; k++) out[i + k] = Math.round(Math.min(1, Math.max(0, c[k])) * 255);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } });
}

/* ---------------------------------------------------------------------------------------------- */

fs.mkdirSync(path.join(outDir, "skins"), { recursive: true });
await MeshoptSimplifier.ready;

for (const demon of DEMONS) {
  const target = await io.read(path.join(inDir, demon.file));
  const tRoot = target.getRoot();
  for (const a of tRoot.listAnimations()) a.dispose();
  const tRest = worldMatrices(target);
  const joints = [...tRoot.listSkins()[0].listJoints()].sort((a, b) => depth(a) - depth(b));
  const jointSet = new Set(joints);
  const restLocal = new Map(joints.map((j) => [j, new THREE.Quaternion(...j.getRotation())]));
  const rig = RIGS[demon.rig];
  const canon = new Map(Object.entries(rig).map(([c, n]) => [c, joints.find((j) => j.getName() === n)]));
  for (const [c, j] of canon) if (!j) throw new Error(`${demon.name}: bone ${rig[c]} (${c}) missing`);
  const POSTURE = POSTURES[demon.posture];
  const posture = makePosture(joints, canon, POSTURE);

  const mapped = new Map();
  for (const [c, joint] of canon) {
    const src = sNodes.get(`mixamorig:${TO_MIXAMO[c]}`);
    if (!src) continue;
    mapped.set(joint, { src, correction: rotationOf(sRest.get(src)).invert().multiply(rotationOf(tRest.get(joint))) });
  }
  const hips = canon.get("Hips");
  const tRestHips = positionOf(tRest.get(hips));
  // Hips height above the feet (the rigs' roots differ: the mannequin's root is at the feet).
  const feetY = Math.min(positionOf(tRest.get(canon.get("LeftFoot"))).y, positionOf(tRest.get(canon.get("RightFoot"))).y);
  const sFeetY = Math.min(positionOf(sRest.get(sNodes.get("mixamorig:LeftFoot"))).y, positionOf(sRest.get(sNodes.get("mixamorig:RightFoot"))).y);
  const hipsScale = (tRestHips.y - feetY) / (sRestHips.y - sFeetY);
  const hipsParentInverse = tRest.get(hips.getParentNode()).clone().invert();
  const parentRest = (j) => rotationOf(tRest.get(j.getParentNode()));
  const buffer = tRoot.listBuffers()[0];
  const accessor = (array, type) => target.createAccessor().setArray(array).setType(type).setBuffer(buffer);

  for (const clip of clips(POSTURE)) {
    const src = sourceClips.get(clip.source);
    if (!src) throw new Error(`source clip ${clip.source} missing`);
    const duration = clip.duration ?? src.duration;
    const frames = Math.max(2, Math.round(duration * FPS) + 1);
    const times = Array.from({ length: frames }, (_, i) => (i / (frames - 1)) * duration);
    const rotations = new Map(joints.map((j) => [j, []]));
    const hipsPositions = [];
    for (const t of times) {
      const sWorld = sourcePose(clip.source, t <= src.duration ? t : t % src.duration);
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
      const rest = restLocal.get(joint);
      let moves = false;
      for (let i = 0; i < values.length && !moves; i += 4) moves = Math.abs(values[i] * rest.x + values[i + 1] * rest.y + values[i + 2] * rest.z + values[i + 3] * rest.w) < 0.99999;
      if (moves) channel(joint, "rotation", values, "VEC4");
    }
    channel(hips, "translation", hipsPositions, "VEC3");
  }

  // Textures: base colour (the first skin) at 512 + the emissive map at 256; no normal / ORM maps.
  const texDir = path.join(inDir, "textures");
  const skinIds = Object.keys(demon.skins);
  let first = null;
  for (const id of skinIds) {
    const skin = demon.skins[id];
    const baseFile = path.join(texDir, skin.variant ? demon.base.replace(/_\d\.png$/, `_${skin.variant}.png`) : demon.base);
    const image = await recolour(baseFile, skin, 512);
    await image.clone().webp({ quality: 88 }).toFile(path.join(outDir, "skins", `${id}.webp`));
    first ??= await image.clone().jpeg({ quality: 88 }).toBuffer();
  }
  for (const texture of tRoot.listTextures()) texture.dispose();
  const baseTexture = target.createTexture(`${demon.name}_base`).setImage(first).setMimeType("image/jpeg");
  const emissive = demon.emissive
    ? target.createTexture(`${demon.name}_emissive`).setImage(await sharp(path.join(texDir, demon.emissive)).resize(256, 256).png().toBuffer()).setMimeType("image/png")
    : null;
  for (const material of tRoot.listMaterials()) {
    material.setBaseColorTexture(baseTexture).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.75);
    material.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null);
    material.setEmissiveTexture(emissive).setEmissiveFactor(emissive ? [1, 1, 1] : [0, 0, 0]);
    for (const ext of material.listExtensions()) ext.dispose();
  }
  // Horde budget: decimate (skin weights are kept per vertex).
  const before = tRoot.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + p.getIndices().getCount() / 3, 0), 0);
  for (const mesh of tRoot.listMeshes()) for (const prim of mesh.listPrimitives()) for (const sem of prim.listSemantics()) if (sem.startsWith("TEXCOORD_") && sem !== "TEXCOORD_0") prim.setAttribute(sem, null);
  await target.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: demon.keep, error: 0.01 }), prune(), dedup());
  const after = tRoot.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + p.getIndices().getCount() / 3, 0), 0);
  const outPath = path.join(outDir, `${demon.name}.glb`);
  await io.write(outPath, target);
  console.log(`wrote ${outPath} (${(fs.statSync(outPath).size / 1e3).toFixed(0)} KB, ${before} -> ${after} tris, hips scale ${hipsScale.toFixed(3)}), skins: ${skinIds.join(", ")}`);
}
