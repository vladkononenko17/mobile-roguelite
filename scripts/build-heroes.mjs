// Builds the playable heroes from the four survivors of Quaternius' "Zombie Apocalypse Kit" (CC0:
// Lis, Matt, Sam, Shaun) on the V3 Survivor's Mixamo skeleton, so every hero clip, hand grip, arm
// IK, finger curl and aim pose of the game applies unchanged:
//
//   node scripts/build-heroes.mjs [kit Characters/glTF dir] [out dir]
//
// Rebinding, not retargeting: the output is public/models/survivor/survivor.glb's own document (its
// "mixamorig:" bone names, rest rotations and all its clips) with
//   - the kit body's mesh (scaled to the Survivor model's 1.70 m) in place of the Survivor's mesh,
//   - each bone moved to the matching joint of the kit body (rest rotations kept: both rigs stand in
//     the same T-pose facing +Z, so the clips' rotations pose the new body the same way),
//   - the body's skin weights moved to the Mixamo bones (the kit has no hand bone: the first finger
//     segments (the palm) and the thumb go to the hand, the rest of the fingers to HandIndex1, the one
//     finger bone the game curls round a grip),
//   - the hips translation in every clip scaled to the new hips height,
//   - the kit's 512 px swatch atlas as the texture (256 px, flat cells: nearest-neighbour).
// Output: <out>/<name>.glb for the bodies worn as they come (matt, sam, shaun) and
// <out>/<name>_<look>.glb for the recoloured hero looks (LOOKS: lis_medic, matt_juggernaut, sam_tinkerer).
//
// Not part of the normal build. Needs three, @gltf-transform/* and sharp (devDependencies here).
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune } from "@gltf-transform/functions";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const inDir = process.argv[2] ?? path.join(ROOT, "assets-src/zombie-kit/Characters/glTF");
const outDir = process.argv[3] ?? path.join(ROOT, "public/models/heroes");
const SURVIVOR = path.join(ROOT, "public/models/survivor/survivor.glb");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(outDir, { recursive: true });

const BODIES = ["Lis", "Matt", "Sam", "Shaun"];
/** The Survivor model's height (m); the game scales both the same. */
const HEIGHT = 1.7;
/** Hand size relative to the kit's (its hands are huge next to a gun). */
const HAND_SCALE = 0.72;

/** Kit joint -> Mixamo bone for skin weights (fingers handled separately). */
const WEIGHT_MAP = {
  Root: "Hips", Body: "Hips", Hips: "Hips", PoleTarget: "Hips",
  Abdomen: "Spine", Torso: "Spine2", Neck: "Neck", Head: "Head",
  Shoulder: "Shoulder", UpperArm: "Arm", LowerArm: "ForeArm",
  UpperLeg: "UpLeg", LowerLeg: "Leg", Foot: "Foot",
};

/** "UpperArm.L" -> { base: "UpperArm", side: "Left" }. */
function split(name) {
  const m = /^(.*)\.(L|R)$/.exec(name);
  return m ? { base: m[1], side: m[2] === "L" ? "Left" : "Right" } : { base: name, side: "" };
}

/** Mixamo bone name for a kit joint's weights. */
function weightBone(name) {
  const { base, side } = split(name);
  if (/^(Thumb\d|Pinky1|Middle1|Index1)$/.test(base)) return `mixamorig:${side}Hand`;
  if (/^(Pinky|Middle|Index)[23]$/.test(base)) return `mixamorig:${side}HandIndex1`;
  const m = WEIGHT_MAP[base];
  if (!m) throw new Error(`no Mixamo bone for ${name}`);
  if (["Hips", "Spine", "Spine2", "Neck", "Head"].includes(m)) return `mixamorig:${m}`;
  if (m === "Shoulder" || m === "Arm" || m === "ForeArm" || m === "Hand") return `mixamorig:${side}${m}`;
  return `mixamorig:${side}${m}`;
}

const bindOf = (skin) => {
  const ibm = skin.getInverseBindMatrices();
  const out = new Map();
  skin.listJoints().forEach((j, i) => out.set(j.getName(), new THREE.Matrix4().fromArray(ibm.getElement(i, new Array(16))).invert()));
  return out;
};
const pos = (m) => new THREE.Vector3().setFromMatrixPosition(m);

/** Where each Mixamo bone goes on a kit body (kit bind space, before scaling). */
function targets(q) {
  const P = (n) => pos(q.get(n));
  const t = new Map();
  const mid = (a, b, k = 0.5) => a.clone().lerp(b, k);
  t.set("Hips", P("Hips"));
  t.set("Spine", P("Abdomen"));
  t.set("Spine1", mid(P("Abdomen"), P("Torso")));
  t.set("Spine2", P("Torso"));
  t.set("Neck", P("Neck"));
  t.set("Head", P("Head"));
  for (const [side, s] of [["Left", "L"], ["Right", "R"]]) {
    t.set(`${side}Shoulder`, P(`Shoulder.${s}`));
    t.set(`${side}Arm`, P(`UpperArm.${s}`));
    t.set(`${side}ForeArm`, P(`LowerArm.${s}`));
    t.set(`${side}Hand`, P(`Middle1.${s}`)); // the fingers all start at the wrist
    t.set(`${side}HandIndex1`, P(`Middle2.${s}`)); // the knuckles
    t.set(`${side}HandIndex2`, P(`Middle3.${s}`));
    const tip = P(`Middle3.${s}`).add(P(`Middle3.${s}`).sub(P(`Middle2.${s}`)).multiplyScalar(0.8));
    t.set(`${side}HandIndex3`, mid(P(`Middle3.${s}`), tip));
    t.set(`${side}HandIndex4`, tip);
    t.set(`${side}UpLeg`, P(`UpperLeg.${s}`));
    t.set(`${side}Leg`, P(`LowerLeg.${s}`));
    t.set(`${side}Foot`, P(`Foot.${s}`));
  }
  return t;
}

/** Recolours the swatch atlas with `map(h, s, l) -> [h, s, l]` for every clothing cell (skin, hair-black
 *  and near-greys kept), returned as 256 px lossless WebP. */
async function recolourAtlas(png, map, keep) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (keep.has((r << 16) | (g << 8) | b)) continue;
    const [h, sat, l] = hsl(r, g, b);
    if (l < 0.12) continue; // hair, eyes, outlines
    const [h2, s2, l2] = map(h, sat, l);
    const [nr, ng, nb] = rgb(h2, Math.max(0, Math.min(1, s2)), Math.max(0, Math.min(1, l2)));
    data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
  }
  return sharp(data, { raw: info }).resize(256, 256, { kernel: "nearest" }).webp({ lossless: true }).toBuffer();
}

/**
 * The skin colours a body shows on its head, neck and hands (skin, beard; brown hues, not saturated):
 * a look keeps them, so the face stays and the clothes change. Read from the atlas cells under those vertices' UVs.
 */
async function headColours(prim, joints, png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0"), UV = prim.getAttribute("TEXCOORD_0");
  const keep = new Set(), j = [0, 0, 0, 0], w = [0, 0, 0, 0], uv = [0, 0];
  for (let i = 0; i < UV.getCount(); i++) {
    J.getElement(i, j);
    W.getElement(i, w);
    if (!/^(Head|Neck|Pinky|Middle|Index|Thumb)/.test(joints[j[w.indexOf(Math.max(...w))]])) continue;
    UV.getElement(i, uv);
    const x = Math.min(info.width - 1, Math.floor(uv[0] * info.width)), y = Math.min(info.height - 1, Math.floor(uv[1] * info.height));
    const o = (y * info.width + x) * 4;
    // Skin-like only (browns, not saturated): a jacket collar or a beanie on the head still changes.
    const [h, sat] = hsl(data[o], data[o + 1], data[o + 2]);
    if (h >= 15 && h <= 45 && sat < 0.65) keep.add((data[o] << 16) | (data[o + 1] << 8) | data[o + 2]);
  }
  return keep;
}

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Hero looks over a body's atlas (head and hands kept): the Medic in white with red (dark clothes red,
 * light ones off-white), the Juggernaut in olive drab and charcoal, the Tinkerer in teal.
 */
const LOOKS = {
  medic: { body: "Lis", map: (h, s, l) => (l < 0.45 ? [355, 0.72, 0.4] : [h, 0.05, 0.86 + (l - 0.5) * 0.2]) },
  juggernaut: { body: "Matt", map: (h, s, l) => (l > 0.55 ? [75, 0.22, 0.42] : [80, 0.28, Math.max(0.16, l * 0.6)]) },
  tinkerer: { body: "Sam", map: (h, s, l) => [190 + (h % 40) * 0.3, Math.max(0.45, s), l] },
};

for (const body of BODIES) {
  const kit = await io.read(path.join(inDir, `Characters_${body}.gltf`));
  const kitRoot = kit.getRoot();
  const kitNode = kitRoot.listNodes().find((n) => n.getSkin() && n.getName() === body);
  const kitSkin = kitNode.getSkin();
  const kitPrim = kitNode.getMesh().listPrimitives()[0];
  const q = bindOf(kitSkin);
  const kitJoints = kitSkin.listJoints().map((j) => j.getName());

  // Scale: the kit's top of head (mesh bbox) to HEIGHT.
  const kp = kitPrim.getAttribute("POSITION");
  let top = 0;
  const v = [0, 0, 0];
  for (let i = 0; i < kp.getCount(); i++) top = Math.max(top, kp.getElement(i, v)[1]);
  const k = HEIGHT / top;

  const doc = await io.read(SURVIVOR);
  const r = doc.getRoot();
  const skin = r.listSkins()[0];
  const joints = skin.listJoints();
  const jointIndex = new Map(joints.map((j, i) => [j.getName(), i]));
  const nodes = new Map(r.listNodes().map((n) => [n.getName(), n]));

  // Bones: new world positions (scaled kit joints), rest rotations kept; local translations solved
  // top-down from the parents' new world matrices.
  const want = targets(q);
  for (const p of want.values()) p.multiplyScalar(k);
  for (const side of ["Left", "Right"]) {
    const wrist = want.get(`${side}Hand`);
    for (const f of ["HandIndex1", "HandIndex2", "HandIndex3", "HandIndex4"]) want.get(`${side}${f}`).sub(wrist).multiplyScalar(HAND_SCALE).add(wrist);
  }
  const hips = nodes.get("mixamorig:Hips");
  const oldHipsY = hips.getTranslation()[1];
  const world = new Map();
  const local = (n) => new THREE.Matrix4().compose(new THREE.Vector3(...n.getTranslation()), new THREE.Quaternion(...n.getRotation()), new THREE.Vector3(...n.getScale()));
  const visit = (n, parentWorld) => {
    const name = n.getName().replace("mixamorig:", "");
    const target = want.get(name);
    if (target && n.getName().startsWith("mixamorig:")) {
      const t = target.clone().applyMatrix4(parentWorld.clone().invert());
      n.setTranslation(t.toArray());
    } else if (/HeadTop_End$/.test(n.getName())) {
      const head = want.get("Head");
      const t = new THREE.Vector3(head.x, HEIGHT, head.z).applyMatrix4(parentWorld.clone().invert());
      n.setTranslation(t.toArray());
    } else if (/(Left|Right)ToeBase$/.test(n.getName()) || /(Left|Right)Toe_End$/.test(n.getName())) {
      const side = n.getName().includes("Left") ? "Left" : "Right";
      const foot = want.get(`${side}Foot`);
      const end = /Toe_End$/.test(n.getName());
      const t = new THREE.Vector3(foot.x, end ? 0.02 : 0.04, foot.z + (end ? 0.2 : 0.12) * k).applyMatrix4(parentWorld.clone().invert());
      n.setTranslation(t.toArray());
    }
    const w = parentWorld.clone().multiply(local(n));
    world.set(n, w);
    n.listChildren().forEach((c) => visit(c, w));
  };
  r.listScenes()[0].listChildren().forEach((n) => visit(n, new THREE.Matrix4()));
  const newHipsY = hips.getTranslation()[1];

  // Inverse bind matrices from the new rest pose (the mesh node becomes identity: vertices in world).
  const ibm = skin.getInverseBindMatrices();
  const ibmArr = new Float32Array(joints.length * 16);
  joints.forEach((j, i) => ibmArr.set(world.get(j).clone().invert().toArray(), i * 16));
  ibm.setArray(ibmArr);

  // The mesh: the kit body's primitive, scaled, with its weights moved to Mixamo bones.
  const meshNode = r.listNodes().find((n) => n.getSkin() === skin);
  meshNode.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  const prim = meshNode.getMesh().listPrimitives()[0];
  const count = kp.getCount();
  const P = new Float32Array(count * 3), N = new Float32Array(count * 3);
  const kn = kitPrim.getAttribute("NORMAL");
  for (let i = 0; i < count; i++) {
    kp.getElement(i, v);
    P.set([v[0] * k, v[1] * k, v[2] * k], i * 3);
    kn.getElement(i, v);
    N.set(v, i * 3);
  }
  const KJ = kitPrim.getAttribute("JOINTS_0"), KW = kitPrim.getAttribute("WEIGHTS_0");
  const J = new Uint16Array(count * 4), W = new Float32Array(count * 4);
  const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
  for (let i = 0; i < count; i++) {
    KJ.getElement(i, jj);
    KW.getElement(i, ww);
    const acc = new Map();
    for (let c = 0; c < 4; c++) {
      if (ww[c] <= 0) continue;
      const bone = weightBone(kitJoints[jj[c]]);
      const idx = jointIndex.get(bone);
      if (idx === undefined) throw new Error(`${bone} not in the Survivor skin`);
      acc.set(idx, (acc.get(idx) ?? 0) + ww[c]);
    }
    const top4 = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top4.reduce((s, [, x]) => s + x, 0) || 1;
    top4.forEach(([idx, x], c) => { J[i * 4 + c] = idx; W[i * 4 + c] = x / sum; });
  }
  // The kit's hands are mitts the size of a head: shrink each hand (palm and fingers) about its wrist.
  for (const side of ["Left", "Right"]) {
    const ids = new Set([jointIndex.get(`mixamorig:${side}Hand`), jointIndex.get(`mixamorig:${side}HandIndex1`)]);
    const wrist = want.get(`${side}Hand`);
    for (let i = 0; i < count; i++) {
      let w = 0;
      for (let c = 0; c < 4; c++) if (ids.has(J[i * 4 + c])) w += W[i * 4 + c];
      if (w <= 0) continue;
      const s = 1 - (1 - HAND_SCALE) * w;
      for (let a = 0; a < 3; a++) P[i * 3 + a] = wrist.getComponent(a) + (P[i * 3 + a] - wrist.getComponent(a)) * s;
    }
  }
  const setAttr = (name, array, type) => {
    const old = prim.getAttribute(name);
    const acc = doc.createAccessor().setType(type).setArray(array).setBuffer(r.listBuffers()[0]);
    prim.setAttribute(name, acc);
    if (old && old.listParents().length <= 1) old.dispose();
  };
  setAttr("POSITION", P, "VEC3");
  setAttr("NORMAL", N, "VEC3");
  setAttr("JOINTS_0", J, "VEC4");
  setAttr("WEIGHTS_0", W, "VEC4");
  const uv = kitPrim.getAttribute("TEXCOORD_0");
  setAttr("TEXCOORD_0", new Float32Array(uv.getArray()), "VEC2");
  const kitIndices = kitPrim.getIndices();
  const indices = kitIndices ? new Uint32Array(kitIndices.getArray()) : Uint32Array.from({ length: count }, (_, i) => i);
  const oldIdx = prim.getIndices();
  prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(count < 65536 ? Uint16Array.from(indices) : indices).setBuffer(r.listBuffers()[0]));
  if (oldIdx) oldIdx.dispose();
  for (const name of prim.listSemantics()) if (!["POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"].includes(name)) prim.setAttribute(name, null);

  // Texture: the kit's atlas (flat colour cells).
  const atlas = kitRoot.listTextures()[0];
  const png = Buffer.from(atlas.getImage());
  const webp = await sharp(png).resize(256, 256, { kernel: "nearest" }).webp({ lossless: true }).toBuffer();
  const tex = r.listTextures()[0];
  tex.setImage(webp).setMimeType("image/webp");
  const mat = prim.getMaterial();
  mat.setRoughnessFactor(0.85).setMetallicFactor(0).setDoubleSided(true);
  mat.getBaseColorTextureInfo().setMagFilter(9728).setMinFilter(9728);

  // Clips: the hips translation scaled to the new hips height.
  const scaled = new Set();
  for (const anim of r.listAnimations()) {
    for (const ch of anim.listChannels()) {
      if (ch.getTargetNode() !== hips || ch.getTargetPath() !== "translation") continue;
      const out = ch.getSampler().getOutput();
      if (scaled.has(out)) continue;
      scaled.add(out);
      const a = out.getArray().slice();
      for (let i = 0; i < a.length; i++) a[i] *= newHipsY / oldHipsY;
      out.setArray(a);
    }
  }
  await doc.transform(prune(), dedup());
  const file = path.join(outDir, `${body.toLowerCase()}.glb`);
  // Bodies worn as they come (Lis only appears recoloured, as the Medic).
  if (body !== "Lis") await io.write(file, doc);
  else fs.rmSync(file, { force: true });
  if (body !== "Lis") console.log(`${file}: ${(fs.statSync(file).size / 1e6).toFixed(2)} MB, scale ${k.toFixed(3)}, hips ${oldHipsY.toFixed(3)} -> ${newHipsY.toFixed(3)}`);
  // Recoloured looks of this body (their own GLB: same mesh and clips, another atlas).
  for (const [look, def] of Object.entries(LOOKS)) {
    if (def.body !== body) continue;
    const img = await recolourAtlas(png, def.map, await headColours(kitPrim, kitJoints, png));
    doc.getRoot().listTextures()[0].setImage(img).setMimeType("image/webp");
    const lookFile = path.join(outDir, `${body.toLowerCase()}_${look}.glb`);
    await io.write(lookFile, doc);
    console.log(`${lookFile}: ${(fs.statSync(lookFile).size / 1e6).toFixed(2)} MB`);
  }
}

