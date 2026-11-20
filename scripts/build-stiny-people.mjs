// Builds the people of «Чотири стіни» (stiny/) from VRM avatars made with the VRM Avatar Maker
// (github.com/ffunch/vrm-avatar-maker, MIT code; every body, skin, hair and garment CC0, from the
// MakeHuman community), rebound onto the Survivor's skeleton exactly as scripts/build-heroes.mjs does
// for the roguelite's heroes, so the walk and idle clips apply unchanged.
//
//   node scripts/export-avatars.mjs <maker web/ dir> scripts/stiny-people.json <vrm dir>
//   node scripts/build-stiny-people.mjs <name>=<avatar.vrm> [...]     (out: public/stiny/people/<name>.glb)
//
// Differences from the heroes: home clothes stay clean (no grime), garments get Stiny's tints, only the
// clips the flat needs are kept, and the side characters ship 512 px textures; the officer gets a
// simplified copy for the yard (five floors down).
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, prune, textureCompress, unpartition } from "@gltf-transform/functions";
import sharp from "sharp";
import { addGear, GEAR } from "./hero-gear.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SURVIVOR = path.join(ROOT, "public/models/survivor/survivor.glb");
const OUT = path.join(ROOT, "public/stiny/people");
/** The clips the flat needs; the rest of the Survivor's are dropped. */
const KEEP = new Set(["Walking", "Survivor_Idle", "Survivor_Idle2", "Idle_10", "restpose"]);
/** Texture size: the hero is seen close every day; the others less. */
// you (the hero at three ages, the boy) are seen closest: full 2048 px skin and clothes; everyone else 512
const TEX = (name) => (name.startsWith("hero") || name === "kid" ? 2048 : 512);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(OUT, { recursive: true });

/** VRM humanoid role -> Mixamo bone (without the "mixamorig:" prefix) for the skin weights. */
function mixamoFor(role) {
  if (!role) return null;
  const side = role.startsWith("left") ? "Left" : role.startsWith("right") ? "Right" : "";
  const r = side ? role.slice(side.length).replace(/^./, (c) => c.toLowerCase()) : role;
  if (/^thumb/.test(r)) return `${side}Hand`;
  // The four fingers bend together on the Index chain, joint for joint (so the game can curl the whole
  // finger, not just the knuckle - a straight finger block on a handguard reads as pointing).
  // Only the support (left) hand: the gun hand stays one rigid block round the grip (the shared chain's
  // joints sit at the middle finger's, so per-joint bends splay the other fingers on a tight grip).
  if (side === "Left" && /^(index|middle|ring|little)Intermediate/.test(r)) return `${side}HandIndex2`;
  if (side === "Left" && /^(index|middle|ring|little)Distal/.test(r)) return `${side}HandIndex3`;
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
  mom: { hips: 0.12, glutes: 0.16, waist: -0.07, bust: 0.03 },
  grandma: { hips: 0.1, glutes: 0.12, waist: 0.02, bust: 0.02 },
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
  // the hero: a grey T-shirt, then a grey sweater; dark trackpants
  hero1: { "elvs_crude_t-shirt_male": [128, 132, 140], toigo_wool_pants: [58, 60, 68] },
  hero2: { toigo_fisherman_sweater: [138, 144, 152], toigo_wool_pants: [58, 60, 68] },
  hero3: { toigo_fisherman_sweater: [124, 126, 128], toigo_wool_pants: [54, 56, 62] },
  // you at ten, summer 2008: a yellow T-shirt
  kid: { "elvs_crude_t-shirt_male": [226, 184, 60] },
  friend1: { namuhekam_male_polo_shirt: [200, 200, 200], toigo_wool_pants: [60, 62, 70] },
  grandma: { toigo_fisherman_sweater: [120, 70, 90] },
  // the officer: olive drab
  officer: { namuhekam_male_polo_shirt: [74, 82, 52], cortu_cargo_pants: [82, 88, 58] },
};

/**
 * Puffer garments per hero: the garment (material-name prefix) pushed out along its normals by `base`
 * plus quilted baffles (`quilt` deep, every `pitch` m: across the torso, around the sleeves), its hem
 * pulled `hem` m further down (a parka over the hips).
 */
const PUFF = {};

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

  // Puffer garment (PUFF): inflated along its normals in quilted baffles, the hem lengthened.
  const puff = PUFF[base];
  if (puff) {
    const hipsY = P("hips").y;
    for (const n of r.listNodes().filter((x) => x.getSkin() === vSkin)) {
      for (const prim of n.getMesh().listPrimitives()) {
        if (!prim.getMaterial()?.getName().startsWith(puff.garment)) continue;
        const pos = prim.getAttribute("POSITION"), idx = prim.getIndices();
        const a = pos.getArray().slice();
        // Smooth normals of the garment as it is (welded by position so seams do not split).
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
        if (idx) g.setIndex(Array.from(idx.getArray()));
        const welded = mergeVertices(g, 1e-4);
        welded.computeVertexNormals();
        const key = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
        const nmap = new Map();
        const wp = welded.getAttribute("position"), wn = welded.getAttribute("normal");
        for (let i = 0; i < wp.count; i++) nmap.set(key(wp.getX(i), wp.getY(i), wp.getZ(i)), [wn.getX(i), wn.getY(i), wn.getZ(i)]);
        let minY = Infinity;
        for (let i = 1; i < a.length; i += 3) if (Math.abs(a[i - 1]) < 0.25) minY = Math.min(minY, a[i]);
        // Sleeves taper (docs/HERO_HOLD.md): full puff on the body, `arm[0]` of it at the shoulder down to
        // `arm[1]` at the forearm, and a tight elastic cuff (`cuff`) over the last few centimetres - so the
        // sleeve never swells over the hand. On the arms the puff is radial only (no push along the arm).
        const shoulderX = Math.abs(P("leftUpperArm").x), wristX = Math.abs(P("leftHand").x);
        const [armA, armB] = puff.arm ?? [1, 1], cuff = puff.cuff ?? 1;
        for (let i = 0; i < a.length; i += 3) {
          let [nx, ny, nz] = nmap.get(key(a[i], a[i + 1], a[i + 2])) ?? [0, 0, 1];
          const arm = Math.abs(a[i]) > 0.2;
          const coord = arm ? Math.abs(a[i]) : a[i + 1];
          let f = 1;
          if (arm) {
            const t = Math.min(1, Math.max(0, (Math.abs(a[i]) - shoulderX) / (wristX - shoulderX)));
            const toWrist = wristX - Math.abs(a[i]);
            f = toWrist < 0.05 ? cuff + (armB - cuff) * Math.max(0, toWrist / 0.05) : armA + (armB - armA) * t;
            const k = Math.hypot(ny, nz) || 1;
            nx = 0; ny /= k; nz /= k;
          }
          const d = f * (puff.base + puff.quilt * Math.abs(Math.sin((Math.PI * coord) / puff.pitch)));
          a[i] += nx * d; a[i + 1] += ny * d * (arm ? 1 : 0.6); a[i + 2] += nz * d;
          // Elastic cuff: over the last `cinch.length` m the sleeve is drawn in to `cinch.radius` round the
          // forearm's axis (the knit sleeve hangs loose at the wrist; a parka's cuff does not).
          const cinch = puff.cinch;
          if (arm && cinch) {
            const side = a[i] > 0 ? "left" : "right", lo = P(`${side}LowerArm`), hd = P(`${side}Hand`);
            const u = Math.min(1, Math.max(0, (a[i] - lo.x) / (hd.x - lo.x)));
            const ay = lo.y + (hd.y - lo.y) * u, az = lo.z + (hd.z - lo.z) * u;
            const toWrist = Math.abs(hd.x) - Math.abs(a[i]);
            if (toWrist < cinch.length) {
              const dy = a[i + 1] - ay, dz = a[i + 2] - az, rr = Math.hypot(dy, dz);
              const w = Math.min(1, Math.max(0, 1 - toWrist / cinch.length)) ** 0.7;
              const target = Math.min(rr, cinch.radius + (rr - cinch.radius) * (1 - w));
              if (rr > 1e-6) { a[i + 1] = ay + (dy * target) / rr; a[i + 2] = az + (dz * target) / rr; }
            }
          }
          // The lowest band of the torso (the hem) slides down over the hips.
          if (!arm && a[i + 1] < minY + 0.09) a[i + 1] -= puff.hem * (1 - (a[i + 1] - minY) / 0.09);
        }
        void hipsY;
        prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(a).setBuffer(r.listBuffers()[0]));
        // New normals for the baffles to shade.
        const g2 = new THREE.BufferGeometry();
        g2.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
        if (idx) g2.setIndex(Array.from(idx.getArray()));
        const w2 = mergeVertices(g2, 1e-4);
        w2.computeVertexNormals();
        const n2 = new Map();
        const p2 = w2.getAttribute("position"), q2 = w2.getAttribute("normal");
        for (let i = 0; i < p2.count; i++) n2.set(key(p2.getX(i), p2.getY(i), p2.getZ(i)), [q2.getX(i), q2.getY(i), q2.getZ(i)]);
        const na = new Float32Array(a.length);
        for (let i = 0; i < a.length; i += 3) na.set(n2.get(key(a[i], a[i + 1], a[i + 2])) ?? [0, 0, 1], i);
        prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(na).setBuffer(r.listBuffers()[0]));
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
  // Tactical gear (scripts/hero-gear.mjs), skinned like the body.
  if (GEAR[base]) {
    const prims = sceneRoot.listChildren().filter((n) => n.getSkin() === sSkin && n.getMesh()).flatMap((n) => n.getMesh().listPrimitives());
    addGear(doc, { prims, skin: sSkin, parent: sceneRoot, def: GEAR[base],
      L: { hips: hipsP, neck: neckP, leftArm: P("leftUpperArm"), rightArm: P("rightUpperArm"), rightUpLeg: P("rightUpperLeg") } });
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
      const near = name.startsWith("hero") || name === "kid";
      const blur = (await src.clone().blur(near ? 1.2 : 18).raw().toBuffer());
      let mean = 0;
      for (let i = 0; i < blur.length; i += 4) mean += (blur[i] + blur[i + 1] + blur[i + 2]) / 765;
      mean /= blur.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        const lum = (blur[i] + blur[i + 1] + blur[i + 2]) / 765;
        // close up the folds and the weave stay (shade relative to the garment's own average); far away a soft wash
        const l = near ? Math.min(1.45, 0.3 + 0.7 * lum / Math.max(0.05, mean)) : (0.6 * lum + 0.4) * (0.9 + 0.1 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1));
        data[i] = Math.min(255, tint[0] * l); data[i + 1] = Math.min(255, tint[1] * l); data[i + 2] = Math.min(255, tint[2] * l);
      }
      tex.setImage(await sharp(data, { raw: info }).png().toBuffer()).setMimeType("image/png");
      continue;
    }
    // home clothes stay clean
    if (!tint) continue;
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
  for (const a of r.listAnimations()) if (!KEEP.has(a.getName())) a.dispose();
  await doc.transform(prune(), dedup(), unpartition(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [TEX(name), TEX(name)], quality: 82 }));
  const file = path.join(OUT, `${name}.glb`);
  await io.write(file, doc);
  if (name === "officer" || name === "grandma" || name === "mom" || name.startsWith("friend")) {
    // a light copy for the yard: fewer triangles, small textures
    const { simplify, weld } = await import("@gltf-transform/functions");
    const { MeshoptSimplifier } = await import("meshoptimizer");
    const lite = await io.read(file);
    await lite.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.22, error: 0.01 }), prune(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [256, 256], quality: 76 }));
    await io.write(path.join(OUT, `${name}-lite.glb`), lite);
    const lt = lite.getRoot().listMeshes().reduce((t, m) => t + m.listPrimitives().reduce((u, p) => u + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
    console.log(`  lite: ${(fs.statSync(path.join(OUT, `${name}-lite.glb`)).size / 1e6).toFixed(2)} MB, ${Math.round(lt)} triangles`);
  }
  const tris = r.listMeshes().reduce((t, m) => t + m.listPrimitives().reduce((u, p) => u + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  console.log(`${file}: ${(fs.statSync(file).size / 1e6).toFixed(2)} MB, ${Math.round(tris)} triangles, hips ${oldHipsY.toFixed(3)} -> ${newHipsY.toFixed(3)}, height ${top.toFixed(2)} m`);
}

for (const arg of process.argv.slice(2)) {
  const [name, file] = arg.split("=");
  await build(name, file);
}
