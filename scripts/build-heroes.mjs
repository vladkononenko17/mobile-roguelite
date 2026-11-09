// Builds the playable heroes' models from VRM avatars made with the VRM Avatar Maker
// (github.com/ffunch/vrm-avatar-maker: realistic people from the MakeHuman community's CC0 assets;
// every body, skin, hair and garment CC0), rebound onto the V3 Survivor's Mixamo skeleton so every
// hero clip, hand grip, arm IK, finger curl and aim pose of the game applies unchanged:
//
//   node scripts/build-heroes.mjs <name>=<avatar.vrm> [...]     (out: public/models/heroes/<name>.glb)
//
// Rebinding, not retargeting: the output is public/models/survivor/survivor.glb's own document (its
// "mixamorig:" bone names, rest rotations and all its clips) with
//   - the avatar's meshes in place of the Survivor's (body, eyes, brows, lashes, hair, clothes; the
//     teeth and tongue dropped), skinned to the Survivor's skin,
//   - each Mixamo bone moved to the avatar's matching joint (both stand in a T-pose facing +Z, so the
//     clips' rotations pose the new body the same way),
//   - the avatar's skin weights moved to the Mixamo bones by humanoid role (VRMC_vrm humanBones):
//     thumbs to the hand, the other fingers to HandIndex1 (the one finger bone the game curls round a
//     grip), extra joints to their nearest mapped ancestor,
//   - the hips translation in every clip scaled to the new hips height,
//   - textures at most 1024 px (WebP), and a little grime on the clothes to sit beside the Survivor.
//
// Avatars: made from scripts/hero-recipes.json by scripts/export-avatars.mjs (the maker served locally,
// headless); kept in assets-src/heroes/ (git-ignored). Not part of the normal build.
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, prune, textureCompress, unpartition } from "@gltf-transform/functions";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SURVIVOR = path.join(ROOT, "public/models/survivor/survivor.glb");
const OUT = path.join(ROOT, "public/models/heroes");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(OUT, { recursive: true });

/** VRM humanoid role -> Mixamo bone (without the "mixamorig:" prefix) for the skin weights. */
function mixamoFor(role) {
  if (!role) return null;
  const side = role.startsWith("left") ? "Left" : role.startsWith("right") ? "Right" : "";
  const r = side ? role.slice(side.length).replace(/^./, (c) => c.toLowerCase()) : role;
  if (/^thumb/.test(r)) return `${side}Hand`;
  if (/^(index|middle|ring|little)/.test(r)) return `${side}HandIndex1`;
  const map = {
    hips: "Hips", spine: "Spine", chest: "Spine1", upperChest: "Spine2", neck: "Neck", head: "Head", eye: "Head", jaw: "Head",
    shoulder: "Shoulder", upperArm: "Arm", lowerArm: "ForeArm", hand: "Hand",
    upperLeg: "UpLeg", lowerLeg: "Leg", foot: "Foot", toes: "ToeBase",
  };
  const m = map[r];
  return m ? `${["Shoulder", "Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase"].includes(m) ? side : ""}${m}` : null;
}

/**
 * Figure shaping per hero (the maker has no bust / hip sliders): amounts are fractions, landmarks are
 * shares of the hips-to-neck height. Wider hips and fuller glutes, a narrower waist, a fuller bust.
 */
const SHAPES = {
  medic: { hips: 0.13, glutes: 0.2, waist: -0.09, bust: 0.035 },
};

/** A smooth deformation of the T-posed body (facing +Z) by SHAPES; arms (|x| beyond the torso) untouched. */
function shaper(d, hipsY, neckY) {
  const span = neckY - hipsY;
  const g = (y, at, sigma) => Math.exp(-(((y - (hipsY + at * span)) / (sigma * span)) ** 2));
  return (v) => {
    const torso = Math.exp(-((Math.max(0, Math.abs(v.x) - 0.17) / 0.05) ** 2)); // falls off past the torso's side
    const hip = g(v.y, -0.02, 0.22) * torso, waist = g(v.y, 0.4, 0.12) * torso, bust = g(v.y, 0.68, 0.1) * torso;
    const sx = 1 + d.hips * hip + d.waist * waist;
    const sz = 1 + d.waist * waist * 0.8;
    v.x *= sx;
    v.z *= sz;
    if (v.z < 0) v.z *= 1 + d.glutes * g(v.y, -0.05, 0.16) * torso;
    if (v.z > 0) v.z += d.bust * bust * Math.min(1, v.z / 0.06) * Math.exp(-(((Math.abs(v.x) - 0.08) / 0.07) ** 2));
    return v;
  };
}

/** Solid colours for garments by material-name prefix, per hero (base colour, before shading). */
const TINTS = {
  medic: { toigo_keyhole_tank_top: [44, 44, 42], cortu_cargo_pants: [92, 96, 62] },
};

/** Spine, Spine1, Spine2 as shares of the Survivor's hips-to-neck height (1.133 -> 1.679 m). */
const SPINE = [(1.242 - 1.133) / 0.546, (1.369 - 1.133) / 0.546, (1.515 - 1.133) / 0.546];

/** Clothing materials get grime: darker, a touch brown and less saturated (the Survivor is filthy). */
const CLEAN = /^(body|eyes|eyebrow|eyelashes)/;

async function build(name, vrmPath) {
  const raw = (() => {
    const b = fs.readFileSync(vrmPath);
    return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  })();
  const roleOf = new Map(Object.entries(raw.extensions.VRMC_vrm.humanoid.humanBones).map(([role, v]) => [raw.nodes[v.node].name, role]));

  const doc = await io.read(SURVIVOR);
  const avatar = await io.read(vrmPath);
  mergeDocuments(doc, avatar);
  const r = doc.getRoot();
  const sScene = r.listScenes()[0];
  const sSkin = r.listSkins()[0];
  const vSkin = r.listSkins()[1];
  const sJoints = sSkin.listJoints();
  const sIndex = new Map(sJoints.map((j, i) => [j.getName(), i]));
  const vJoints = vSkin.listJoints();
  const base = name.replace(/_.*$/, "");
  const shapeDef = SHAPES[base];
  const tints = TINTS[base] ?? {};

  // The avatar's bind pose (its mesh nodes are identity: vertices are world positions).
  const ibm = vSkin.getInverseBindMatrices();
  const vWorld = vJoints.map((_, i) => new THREE.Matrix4().fromArray(ibm.getElement(i, new Array(16))).invert());
  const rawP = (role) => {
    const i = vJoints.findIndex((j) => roleOf.get(j.getName()) === role);
    if (i < 0) throw new Error(`${name}: no ${role}`);
    return new THREE.Vector3().setFromMatrixPosition(vWorld[i]);
  };
  // Optional figure shaping (SHAPES): one smooth field over body, clothes and joints alike.
  const field = shapeDef ? shaper(shapeDef, rawP("hips").y, rawP("neck").y) : null;
  const P = (role) => (field ? field(rawP(role)) : rawP(role));
  if (field) {
    for (const n of r.listNodes().filter((x) => x.getSkin() === vSkin)) {
      for (const prim of n.getMesh().listPrimitives()) {
        const pos = prim.getAttribute("POSITION");
        const a = pos.getArray().slice(), v = new THREE.Vector3();
        for (let i = 0; i < a.length; i += 3) {
          field(v.set(a[i], a[i + 1], a[i + 2]));
          a[i] = v.x; a[i + 1] = v.y; a[i + 2] = v.z;
        }
        prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(a).setBuffer(r.listBuffers()[0]));
      }
    }
  }

  // Where each Mixamo bone goes.
  // The spine bones at the Survivor's share of the hips-to-neck height (MakeHuman's upper chest sits
  // far lower than Mixamo's Spine2, and the weapon stances hang off that bone).
  const hipsP = P("hips"), neckP = P("neck");
  const spineAt = (f) => hipsP.clone().lerp(neckP, f);
  const want = new Map([["Hips", hipsP], ["Spine", spineAt(SPINE[0])], ["Spine1", spineAt(SPINE[1])], ["Spine2", spineAt(SPINE[2])], ["Neck", neckP], ["Head", P("head")]]);
  for (const [side, s] of [["Left", "left"], ["Right", "right"]]) {
    want.set(`${side}Shoulder`, P(`${s}Shoulder`));
    want.set(`${side}Arm`, P(`${s}UpperArm`));
    want.set(`${side}ForeArm`, P(`${s}LowerArm`));
    want.set(`${side}Hand`, P(`${s}Hand`));
    want.set(`${side}HandIndex1`, P(`${s}MiddleProximal`));
    want.set(`${side}HandIndex2`, P(`${s}MiddleIntermediate`));
    want.set(`${side}HandIndex3`, P(`${s}MiddleDistal`));
    want.set(`${side}HandIndex4`, P(`${s}MiddleDistal`).add(P(`${s}MiddleDistal`).sub(P(`${s}MiddleIntermediate`))));
    want.set(`${side}UpLeg`, P(`${s}UpperLeg`));
    want.set(`${side}Leg`, P(`${s}LowerLeg`));
    want.set(`${side}Foot`, P(`${s}Foot`));
    want.set(`${side}ToeBase`, P(`${s}Toes`));
    want.set(`${side}Toe_End`, P(`${s}Toes`).add(new THREE.Vector3(0, 0, 0.07)));
  }

  // The avatar's meshes: keep all but the teeth and tongue; their top gives the head's end.
  const meshNodes = r.listNodes().filter((n) => n.getSkin() === vSkin);
  let top = 0;
  for (const n of meshNodes) {
    const keep = !/^(teeth|tongue)/.test(n.getName());
    if (!keep) { n.dispose(); continue; }
    const pos = n.getMesh().listPrimitives()[0].getAttribute("POSITION");
    const v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) top = Math.max(top, pos.getElement(i, v)[1]);
  }
  want.set("HeadTop_End", new THREE.Vector3(want.get("Head").x, top, want.get("Head").z));

  // Move the Survivor's bones there (rest rotations kept), solving local translations top-down.
  const hips = r.listNodes().find((n) => n.getName() === "mixamorig:Hips");
  const oldHipsY = hips.getTranslation()[1];
  const world = new Map();
  const local = (n) => new THREE.Matrix4().compose(new THREE.Vector3(...n.getTranslation()), new THREE.Quaternion(...n.getRotation()), new THREE.Vector3(...n.getScale()));
  const visit = (n, parentWorld) => {
    const target = want.get(n.getName().replace("mixamorig:", ""));
    if (target && n.getName().startsWith("mixamorig:")) n.setTranslation(target.clone().applyMatrix4(parentWorld.clone().invert()).toArray());
    const w = parentWorld.clone().multiply(local(n));
    world.set(n, w);
    n.listChildren().forEach((c) => visit(c, w));
  };
  sScene.listChildren().forEach((n) => visit(n, new THREE.Matrix4()));
  const newHipsY = hips.getTranslation()[1];
  const sIbm = sSkin.getInverseBindMatrices();
  const arr = new Float32Array(sJoints.length * 16);
  sJoints.forEach((j, i) => arr.set(world.get(j).clone().invert().toArray(), i * 16));
  sIbm.setArray(arr);

  // Avatar joint -> Survivor joint index (humanoid role, else the nearest mapped ancestor).
  const parentOf = new Map();
  for (const n of r.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  const remap = vJoints.map((j) => {
    for (let n = j; n; n = parentOf.get(n)) {
      const m = mixamoFor(roleOf.get(n.getName()));
      if (m && sIndex.has(`mixamorig:${m}`)) return sIndex.get(`mixamorig:${m}`);
    }
    return sIndex.get("mixamorig:Hips");
  });

  // Re-skin the avatar's meshes to the Survivor's skin, under the Survivor's scene.
  const oldMeshNode = r.listNodes().find((n) => n.getSkin() === sSkin);
  oldMeshNode.getMesh().dispose();
  oldMeshNode.dispose();
  const sceneRoot = sScene.listChildren()[0];
  for (const n of r.listNodes().filter((x) => x.getSkin() === vSkin)) {
    const prim = n.getMesh().listPrimitives()[0];
    const J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0");
    const count = J.getCount(), out = new Uint16Array(count * 4), wout = new Float32Array(count * 4);
    const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
    for (let i = 0; i < count; i++) {
      J.getElement(i, jj);
      W.getElement(i, ww);
      const acc = new Map();
      for (let c = 0; c < 4; c++) if (ww[c] > 0) acc.set(remap[jj[c]], (acc.get(remap[jj[c]]) ?? 0) + ww[c]);
      const top4 = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = top4.reduce((s, [, x]) => s + x, 0) || 1;
      top4.forEach(([idx, x], c) => { out[i * 4 + c] = idx; wout[i * 4 + c] = x / sum; });
    }
    prim.setAttribute("JOINTS_0", doc.createAccessor().setType("VEC4").setArray(out).setBuffer(r.listBuffers()[0]));
    prim.setAttribute("WEIGHTS_0", doc.createAccessor().setType("VEC4").setArray(wout).setBuffer(r.listBuffers()[0]));
    n.setSkin(sSkin);
    n.listParents().forEach((p) => p !== r && p.removeChild?.(n));
    sceneRoot.addChild(n);
  }
  // Drop the avatar's skeleton and scene.
  vSkin.dispose();
  for (const s of r.listScenes().slice(1)) s.dispose();
  for (const j of vJoints) j.dispose();
  doc.getRoot().setDefaultScene(sScene);

  // Clips: the hips translation scaled to the new hips height.
  const scaled = new Set();
  for (const anim of r.listAnimations()) {
    for (const ch of anim.listChannels()) {
      if (ch.getTargetNode() !== hips || ch.getTargetPath() !== "translation") continue;
      const o = ch.getSampler().getOutput();
      if (scaled.has(o)) continue;
      scaled.add(o);
      const a = o.getArray().slice();
      for (let i = 0; i < a.length; i++) a[i] *= newHipsY / oldHipsY;
      o.setArray(a);
    }
  }

  // Grime on the clothes and hair-free garments, then textures to <= 1024 px WebP.
  for (const mat of r.listMaterials()) {
    const tex = mat.getBaseColorTexture();
    if (!tex || CLEAN.test(mat.getName()) || /hair|ponytail|braid|bob|afro|short0/i.test(mat.getName())) continue;
    const tint = Object.entries(tints).find(([k]) => mat.getName().startsWith(k))?.[1];
    if (tint) {
      // A loud print (leopard, hot pink) becomes one solid colour: the pattern is blurred away and the
      // fabric's light and shade kept as a soft luminance on top.
      const src = sharp(Buffer.from(tex.getImage())).ensureAlpha();
      const { data, info } = await src.clone().raw().toBuffer({ resolveWithObject: true });
      const blur = (await src.clone().blur(18).raw().toBuffer());
      for (let i = 0; i < data.length; i += 4) {
        const l = (0.6 * (blur[i] + blur[i + 1] + blur[i + 2]) / 765 + 0.4) * (0.9 + 0.1 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1));
        data[i] = Math.min(255, tint[0] * l); data[i + 1] = Math.min(255, tint[1] * l); data[i + 2] = Math.min(255, tint[2] * l);
      }
      tex.setImage(await sharp(data, { raw: info }).png().toBuffer()).setMimeType("image/png");
      continue;
    }
    const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      const g = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const noise = 0.85 + 0.15 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);
      data[i] = Math.min(255, (data[i] * 0.6 + g * 0.4) * 0.72 * noise + 14);
      data[i + 1] = Math.min(255, (data[i + 1] * 0.6 + g * 0.4) * 0.68 * noise + 10);
      data[i + 2] = Math.min(255, (data[i + 2] * 0.6 + g * 0.4) * 0.62 * noise + 6);
    }
    tex.setImage(await sharp(data, { raw: info }).png().toBuffer()).setMimeType("image/png");
  }
  await doc.transform(prune(), dedup(), unpartition(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 82 }));
  const file = path.join(OUT, `${name}.glb`);
  await io.write(file, doc);
  const tris = r.listMeshes().reduce((t, m) => t + m.listPrimitives().reduce((u, p) => u + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  console.log(`${file}: ${(fs.statSync(file).size / 1e6).toFixed(2)} MB, ${Math.round(tris)} triangles, hips ${oldHipsY.toFixed(3)} -> ${newHipsY.toFixed(3)}, height ${top.toFixed(2)} m`);
}

for (const arg of process.argv.slice(2)) {
  const [name, file] = arg.split("=");
  await build(name, file);
}
