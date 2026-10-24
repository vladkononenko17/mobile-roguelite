// Builds the medieval chapter's creatures from KayKit "Adventurers" and "Skeletons" character
// packs (CC0, Kay Lousberg, github.com/KayKit-Game-Assets; cloned into assets-src/medieval/).
//
//   node scripts/build-medieval-creatures.mjs
//
// Each character keeps its skinned mesh, rig and the clips the game plays; the weapons it carries
// are chosen per look (the packs model every weapon on every body, hidden or shown per game).
// Colour skins are the 1024 px atlas resized to 256 px WebP and re-tinted, written to
// public/models/medieval/skins/<id>.webp. The skeletons' loose weapons become small GLBs in
// public/models/medieval/weapons/ (EnemyVisual.attachments on the hand slot).
//
// Not part of the normal build. Needs (npm i --no-save): @gltf-transform/core@4,
// @gltf-transform/extensions@4, @gltf-transform/functions@4, sharp.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample } from "@gltf-transform/functions";
import sharp from "sharp";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "assets-src/medieval");
const OUT = path.join(ROOT, "public/models/medieval");
const files = execSync(`find -L "${SRC}" -name "*.gltf" -o -name "*.glb"`, { encoding: "utf8" }).split("\n").filter(Boolean);
const find = (name) => files.find((f) => path.basename(f).replace(/\.gltf\.glb$|\.gltf$|\.glb$/, "") === name) ?? (() => { throw new Error(name); })();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** The clips the game plays (EnemyVisual.clips in medievalConfig.ts). */
const KEEP = new Set([
  "Idle", "Idle_Combat", "Walking_A", "Walking_B", "Walking_C", "Walking_D_Skeletons", "Running_A", "Running_B", "Running_C",
  "1H_Melee_Attack_Chop", "1H_Melee_Attack_Slice_Diagonal", "1H_Melee_Attack_Stab", "1H_Melee_Attack_Jump_Chop",
  "2H_Melee_Attack_Chop", "2H_Melee_Attack_Slice", "2H_Melee_Attack_Spin", "2H_Melee_Attack_Stab", "2H_Melee_Idle",
  "Unarmed_Melee_Attack_Punch_A", "Unarmed_Melee_Attack_Punch_B", "Unarmed_Melee_Attack_Kick",
  "Spellcast_Shoot", "Spellcast_Raise", "Spellcast_Long", "Spellcast_Summon", "Throw",
  "Hit_A", "Hit_B", "Block_Hit", "Death_A", "Death_B", "Death_C_Skeletons", "Cheer", "Taunt", "Jump_Land",
  "Spawn_Ground_Skeletons", "Dodge_Forward",
]);

// sharp modulate (hue degrees, saturation, brightness) and an optional tint per skin.
const CREATURES = [
  { name: "knight", clips: ["Idle", "Walking_A", "Running_A", "1H_Melee_Attack_Chop", "1H_Melee_Attack_Stab", "Block_Hit", "Death_A", "Death_B", "Dodge_Forward"], file: "Knight", keep: ["1H_Sword", "Round_Shield", "Knight_Helmet", "Knight_Cape"],
    skins: { knight_black: { saturation: 0.25, brightness: 0.55 }, knight_rust: { saturation: 0.5, brightness: 0.7, tint: "#b07a55" }, knight_grave: { saturation: 0.2, brightness: 0.75, tint: "#8fa39a" } } },
  { name: "king", clips: ["2H_Melee_Idle", "Walking_B", "Running_A", "2H_Melee_Attack_Chop", "2H_Melee_Attack_Spin", "2H_Melee_Attack_Slice", "Hit_A", "Death_A", "Cheer", "Jump_Land", "Spellcast_Summon"], file: "Knight", keep: ["2H_Sword", "Knight_Helmet", "Knight_Cape"],
    skins: { king_fallen: { saturation: 0.55, brightness: 0.6, tint: "#c8a060" } } },
  { name: "monk", clips: ["Idle", "Walking_C", "Running_B", "Spellcast_Shoot", "Spellcast_Raise", "Unarmed_Melee_Attack_Punch_A", "Hit_A", "Death_A", "Death_B", "Spellcast_Summon", "Spellcast_Long", "Cheer"], file: "Rogue_Hooded", keep: ["Rogue_Cape"],
    skins: { monk_brown: { saturation: 0.45, brightness: 0.7, tint: "#9a7452" }, monk_black: { saturation: 0.2, brightness: 0.45 }, abbot_crimson: { saturation: 0.8, brightness: 0.65, tint: "#b03a34" } } },
  { name: "ghoul", clips: ["Idle", "Walking_C", "Running_A", "Unarmed_Melee_Attack_Punch_A", "Unarmed_Melee_Attack_Punch_B", "Hit_B", "Death_A", "Death_B"], file: "Barbarian", keep: ["Barbarian_Cape"],
    skins: { ghoul_rot: { saturation: 0.35, brightness: 0.75, tint: "#8fa27a" }, ghoul_pale: { saturation: 0.15, brightness: 0.85, tint: "#b6b0a0" }, ghoul_plague: { saturation: 0.4, brightness: 0.65, tint: "#9c8f6a" } } },
  { name: "executioner", clips: ["2H_Melee_Idle", "Walking_B", "2H_Melee_Attack_Chop", "2H_Melee_Attack_Spin", "Hit_A", "Death_A", "Jump_Land"], file: "Barbarian", keep: ["2H_Axe", "Barbarian_Hat"],
    skins: { exec_black: { saturation: 0.2, brightness: 0.5 } } },
  { name: "skeleton", clips: ["Idle", "Walking_D_Skeletons", "Running_C", "Unarmed_Melee_Attack_Punch_A", "Hit_A", "Death_C_Skeletons", "Death_A", "Spawn_Ground_Skeletons"], file: "Skeleton_Minion", keep: null,
    skins: { bone_old: { saturation: 0.7, brightness: 0.9 }, bone_grave: { saturation: 0.35, brightness: 0.8, tint: "#a8b0a0" } } },
  { name: "skeletonWarrior", clips: ["Idle_Combat", "Walking_D_Skeletons", "1H_Melee_Attack_Chop", "1H_Melee_Attack_Jump_Chop", "Block_Hit", "Death_C_Skeletons", "Death_A", "Spawn_Ground_Skeletons"], file: "Skeleton_Warrior", keep: null,
    skins: { bone_warrior: { saturation: 0.6, brightness: 0.85 }, bone_rust: { saturation: 0.6, brightness: 0.75, tint: "#b89070" } } },
  { name: "skeletonMage", clips: ["Idle", "Walking_D_Skeletons", "Spellcast_Shoot", "Spellcast_Raise", "Hit_A", "Death_C_Skeletons", "Spawn_Ground_Skeletons"], file: "Skeleton_Mage", keep: null,
    skins: { bone_mage: { saturation: 0.8, brightness: 0.85 } } },
  { name: "skeletonRogue", clips: ["Idle_Combat", "Running_C", "1H_Melee_Attack_Stab", "1H_Melee_Attack_Slice_Diagonal", "Hit_A", "Death_C_Skeletons", "Death_A", "Spawn_Ground_Skeletons"], file: "Skeleton_Rogue", keep: null,
    skins: { bone_rogue: { saturation: 0.6, brightness: 0.8 } } },
];

/** Loose skeleton weapons -> GLBs for hand-slot attachments. */
const WEAPONS = { blade: "Skeleton_Blade", shield: "Skeleton_Shield_Small_A", staff: "Skeleton_Staff", axe: "Skeleton_Axe" };

fs.mkdirSync(path.join(OUT, "skins"), { recursive: true });
fs.mkdirSync(path.join(OUT, "weapons"), { recursive: true });

for (const c of CREATURES) {
  const doc = await io.read(find(c.file));
  const root = doc.getRoot();
  // Weapons and gear not worn by this look: drop their meshes.
  if (c.keep) {
    const bodyPrefix = c.file.split("_")[0];
    for (const node of root.listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const name = node.getName();
      const body = name.startsWith(bodyPrefix + "_") && !/Hat|Cape|Helmet|Shield/.test(name);
      if (!body && !c.keep.includes(name)) { node.setMesh(null); }
    }
  }
  const skinIds = Object.keys(c.skins);
  for (const texture of root.listTextures()) {
    const resized = await sharp(Buffer.from(texture.getImage())).resize(256, 256, { fit: "fill" }).png().toBuffer();
    const render = async (k) => {
      let img = sharp(resized).modulate({ hue: k.hue ?? 0, saturation: k.saturation ?? 1, brightness: k.brightness ?? 1 });
      if (k.tint) img = sharp(await img.png().toBuffer()).tint(k.tint);
      return img.webp({ quality: 90 }).toBuffer();
    };
    texture.setImage(await render(c.skins[skinIds[0]])).setMimeType("image/webp").setURI("");
    for (const id of skinIds) fs.writeFileSync(path.join(OUT, "skins", `${id}.webp`), await render(c.skins[id]));
  }
  for (const m of root.listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.8);
  for (const anim of root.listAnimations()) {
    if (c.clips.includes(anim.getName())) continue;
    // samplers outlive a disposed animation and keep its keyframe data alive: dispose them first
    for (const ch of anim.listChannels()) ch.dispose();
    for (const sm of anim.listSamplers()) sm.dispose();
    anim.dispose();
  }
  // drop redundant keyframes (the packs bake every frame of every bone)
  await doc.transform(resample({ tolerance: 1e-3 }), prune(), dedup());
  for (const acc of root.listAccessors()) if (acc.listParents().every((p) => p.propertyType === "Root")) acc.dispose();
  const b = getBounds(root.listScenes()[0]);
  const outPath = path.join(OUT, `${c.name}.glb`);
  await io.write(outPath, doc);
  console.log(`wrote ${c.name}.glb ${(fs.statSync(outPath).size / 1e3).toFixed(0)} KB, height ${(b.max[1] - b.min[1]).toFixed(2)}, ` +
    `clips ${root.listAnimations().length}, skins ${skinIds.join(" ")}`);
}

for (const [id, name] of Object.entries(WEAPONS)) {
  const doc = await io.read(find(name));
  const root = doc.getRoot();
  for (const texture of root.listTextures()) {
    const img = await sharp(Buffer.from(texture.getImage())).resize(256, 256, { fit: "fill" }).webp({ quality: 90 }).toBuffer();
    texture.setImage(img).setMimeType("image/webp").setURI("");
  }
  for (const m of root.listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.8);
  await doc.transform(prune(), dedup());
  const outPath = path.join(OUT, "weapons", `${id}.glb`);
  await io.write(outPath, doc);
  console.log(`wrote weapons/${id}.glb ${(fs.statSync(outPath).size / 1e3).toFixed(0)} KB`);
}
