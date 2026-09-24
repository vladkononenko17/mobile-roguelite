// Builds the V3 hero ("Zombie Apocalypse Survivor", Mixamo rig) into one GLB with animations:
//
//   node scripts/build-survivor.mjs <survivor.glb> <texture.png> <animation source.glb> <out.glb> [idle.glb ...]
//
// <survivor.glb> is the character FBX converted with FBX2glTF (`FBX2glTF --binary`); its texture
// is applied from <texture.png> (resized to max 2048 WebP). Every clip of <animation source.glb>
// (the Vanguard GLB, same "mixamorig:" bone names but an A-pose rest and other proportions) is
// retargeted onto the survivor: for each limb bone the survivor's world rotation follows the
// source's, times a constant twist about the bone axis (both rigs point +Y along each bone), so bone
// directions match whatever the rest poses (A-pose vs T-pose) and the roll of each bone is kept;
// torso and head bones use the full rest-to-rest correction instead. Only rotations are
// transferred, plus the hips translation (scaled by hips height). Extra [idle.glb ...] files are
// Mixamo clips on the survivor's own rig (FBX2glTF output), copied as "Survivor_<file name>".
//
// Not part of the normal build. Needs (npm i --no-save): three, @gltf-transform/core@4,
// @gltf-transform/extensions@4, @gltf-transform/functions@4, sharp.
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

const [targetPath, texturePath, sourcePath, outPath, ...idlePaths] = process.argv.slice(2);
if (!outPath) throw new Error("usage: node scripts/build-survivor.mjs <survivor.glb> <texture.png> <animation source.glb> <out.glb> [idle.glb ...]");

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const target = await io.read(targetPath);
const source = await io.read(sourcePath);
const tRoot = target.getRoot();

const trs = (n) => new THREE.Matrix4().compose(new THREE.Vector3(...n.getTranslation()), new THREE.Quaternion(...n.getRotation()), new THREE.Vector3(...n.getScale()));
const byName = (doc) => new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
const tNodes = byName(target);

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
const rotationOf = (m) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(m));
const positionOf = (m) => new THREE.Vector3().setFromMatrixPosition(m);

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

// Rest poses. Twist correction per bone: survivor frame = source frame * twist(about +Y).
const sRest = worldMatrices(source);
const tRest = worldMatrices(target);
const depth = (n) => (n.getParentNode() ? depth(n.getParentNode()) + 1 : 0);
const joints = [...target.getRoot().listSkins()[0].listJoints()].sort((a, b) => depth(a) - depth(b));
const sNodes = byName(source);
const twist = new Map();
// Torso and head stand upright in both rest poses, but their bone axes lean differently (the
// Vanguard's head axis is tilted ~15°), so these keep the full rest-to-rest correction instead of
// matching bone directions (which would bow the survivor's head).
const UPRIGHT = new Set(["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"].map((b) => `mixamorig:${b}`));
for (const joint of joints) {
  const src = sNodes.get(joint.getName());
  if (!src) continue;
  const c = rotationOf(sRest.get(src)).invert().multiply(rotationOf(tRest.get(joint)));
  twist.set(joint, UPRIGHT.has(joint.getName()) ? c : new THREE.Quaternion(0, c.y, 0, c.w).normalize());
}
// The source clips do not animate fingers (the Vanguard has none), so the survivor's finger chain
// (one "mitten" chain per hand, bending about local +X) gets a relaxed curl instead of the flat
// T-pose hand. The game curls it further around a held weapon (player/FingerGrip.ts).
const FINGER = /Hand(Thumb|Index|Middle|Ring|Pinky)[1-3]$/;
const RELAXED_CURL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(22));
const hips = tNodes.get("mixamorig:Hips");
const sHips = sNodes.get("mixamorig:Hips");
const hipsScale = positionOf(tRest.get(hips)).y / positionOf(sRest.get(sHips)).y;
console.log(`retargeting ${twist.size} bones, hips scale ${hipsScale.toFixed(3)}`);

const buffer = tRoot.listBuffers()[0];
const accessor = (array, type) => target.createAccessor().setArray(array).setType(type).setBuffer(buffer);

function addClip(name, times, rotations, hipsPositions) {
  const anim = target.createAnimation(name);
  const input = accessor(new Float32Array(times), "SCALAR");
  for (const [node, values] of rotations) {
    const sampler = target.createAnimationSampler().setInput(input).setOutput(accessor(new Float32Array(values), "VEC4")).setInterpolation("LINEAR");
    anim.addSampler(sampler).addChannel(target.createAnimationChannel().setTargetNode(node).setTargetPath("rotation").setSampler(sampler));
  }
  if (hipsPositions) {
    const sampler = target.createAnimationSampler().setInput(input).setOutput(accessor(new Float32Array(hipsPositions), "VEC3")).setInterpolation("LINEAR");
    anim.addSampler(sampler).addChannel(target.createAnimationChannel().setTargetNode(hips).setTargetPath("translation").setSampler(sampler));
  }
}

const keyTimes = (anim) => [...new Set(anim.listSamplers().flatMap((s) => [...s.getInput().getArray()]))].sort((a, b) => a - b);

// Retarget every source clip.
const sRestHips = positionOf(sRest.get(sHips));
const tRestHips = positionOf(tRest.get(hips));
const hipsParentInverse = tRest.get(hips.getParentNode()).clone().invert();
for (const anim of source.getRoot().listAnimations()) {
  const channels = new Map();
  for (const ch of anim.listChannels()) channels.set(`${ch.getTargetNode().getName()}/${ch.getTargetPath()}`, ch.getSampler());
  const times = keyTimes(anim);
  const rotations = new Map([...twist.keys()].map((j) => [j, []]));
  const hipsPositions = [];
  for (const t of times) {
    const sWorld = worldMatrices(source, (n) => {
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
    // Survivor world rotations, parents first (joints are listed parent-before-child here).
    const tWorldRot = new Map();
    const parentWorld = (n) => {
      const p = n.getParentNode();
      return (tWorldRot.get(p) ?? rotationOf(tRest.get(p))).clone();
    };
    for (const joint of joints) {
      const src = sNodes.get(joint.getName());
      if (!twist.has(joint)) {
        // Bones the source does not have: fingers get a relaxed curl, the rest keep their rest pose.
        const local = new THREE.Quaternion(...joint.getRotation());
        if (FINGER.test(joint.getName())) {
          local.multiply(RELAXED_CURL);
          if (!rotations.has(joint)) rotations.set(joint, []);
          rotations.get(joint).push(local.x, local.y, local.z, local.w);
        }
        tWorldRot.set(joint, parentWorld(joint).multiply(local));
        continue;
      }
      const world = rotationOf(sWorld.get(src)).multiply(twist.get(joint));
      tWorldRot.set(joint, world);
      const local = parentWorld(joint).invert().multiply(world);
      rotations.get(joint).push(local.x, local.y, local.z, local.w);
    }
    const delta = positionOf(sWorld.get(sHips)).sub(sRestHips).multiplyScalar(hipsScale);
    const local = tRestHips.clone().add(delta).applyMatrix4(hipsParentInverse);
    hipsPositions.push(local.x, local.y, local.z);
  }
  addClip(anim.getName(), times, rotations, hipsPositions);
}

// The survivor's own Mixamo clips: same rig, copy rotations (and hips translation) by bone name.
for (const idlePath of idlePaths) {
  const doc = await io.read(idlePath);
  for (const anim of doc.getRoot().listAnimations()) {
    if (!anim.listChannels().length) continue;
    const times = keyTimes(anim);
    const rotations = new Map();
    let hipsPositions = null;
    for (const ch of anim.listChannels()) {
      const node = tNodes.get(ch.getTargetNode().getName());
      if (!node) continue;
      const values = times.flatMap((t) => sample(ch.getSampler(), t));
      if (ch.getTargetPath() === "rotation") rotations.set(node, values);
      else if (ch.getTargetPath() === "translation" && node === hips) hipsPositions = values;
    }
    // Key every finger joint so the game's finger grip never stacks up on an unkeyed bone.
    for (const joint of joints) {
      if (!FINGER.test(joint.getName()) || rotations.has(joint)) continue;
      const q = new THREE.Quaternion(...joint.getRotation()).multiply(RELAXED_CURL);
      rotations.set(joint, times.flatMap(() => [q.x, q.y, q.z, q.w]));
    }
    const name = `Survivor_${path.basename(idlePath, ".glb")}`;
    addClip(name, times, rotations, hipsPositions);
    console.log(`copied ${name}: ${rotations.size} bones, ${times.length} keys`);
  }
}

// Texture and a matte material (the FBX material comes through without its image).
const material = tRoot.listMaterials()[0];
const png = fs.readFileSync(texturePath);
const texture = target.createTexture("survivor_base").setImage(png).setMimeType("image/png");
material.setBaseColorTexture(texture).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.85);
material.setEmissiveFactor([0, 0, 0]);
for (const ext of material.listExtensions()) ext.dispose();

await target.transform(
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [2048, 2048], quality: 88 }),
);
await io.write(outPath, target);
console.log(`wrote ${outPath} (${(fs.statSync(outPath).size / 1e6).toFixed(2)} MB), clips: ${tRoot.listAnimations().map((a) => a.getName()).join(", ")}`);
