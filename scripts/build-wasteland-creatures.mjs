// Builds the Wasteland's new infected from Quaternius "Zombie Apocalypse Kit" (CC0, quaternius.com;
// glTF characters downloaded into assets-src/zombie-kit/Characters/): Zombie_Basic (the rotter),
// Zombie_Chubby (the bloater), Zombie_Ribcage (the ripper), Zombie_Arm (the Abomination, boss) and
// the German Shepherd (the infected hound).
//
//   node scripts/build-wasteland-creatures.mjs [in dir] [out dir]
//
// Each character keeps its skinned mesh, rig and clips; its colour atlas is resized to 256 px WebP.
// Colour variants (skins) are the atlas hue-shifted / re-tinted, written to <out>/skins/<id>.webp.
//
// Not part of the normal build. Needs (npm i --no-save): @gltf-transform/core@4,
// @gltf-transform/extensions@4, @gltf-transform/functions@4, sharp.
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune } from "@gltf-transform/functions";
import sharp from "sharp";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const inDir = process.argv[2] ?? path.join(ROOT, "assets-src/zombie-kit/Characters");
const outDir = process.argv[3] ?? path.join(ROOT, "public/models/infected");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** Output name, source, and skins: id -> sharp modulate (hue degrees, saturation, brightness), or a tint. */
const CREATURES = [
  { name: "rotter", file: "Zombie_Basic.gltf", skins: { rotter_green: { saturation: 0.7, brightness: 0.85 }, rotter_grey: { saturation: 0.25, brightness: 0.8 }, rotter_bruised: { hue: 60, saturation: 0.6, brightness: 0.75 } } },
  { name: "bloater", file: "Zombie_Chubby.gltf", skins: { bloater_blue: { saturation: 0.75, brightness: 0.85 }, bloater_toxic: { hue: -110, saturation: 0.9, brightness: 0.8 } } },
  { name: "ripper", file: "Zombie_Ribcage.gltf", skins: { ripper_bone: { saturation: 0.6, brightness: 0.9 }, ripper_blood: { brightness: 0.8, tint: "#c05a4a" } } },
  { name: "abomination", file: "Zombie_Arm.gltf", skins: { abom_flesh: { hue: -30, saturation: 0.75, brightness: 0.8 }, abom_rot: { hue: 40, saturation: 0.45, brightness: 0.7 } } },
  { name: "hound", file: "Characters_GermanShepherd.gltf", skins: { hound_rotten: { saturation: 0.35, brightness: 0.7 }, hound_blood: { brightness: 0.7, tint: "#9a4a3c" } } },
];

/** Clips kept (EnemyVisual.clips). */
const KEEP = new Set(["Idle", "Walk", "Run", "Punch", "Run_Attack", "HitReact", "HitReact_Left", "Death", "Attack", "Jump_Land"]);

fs.mkdirSync(path.join(outDir, "skins"), { recursive: true });
for (const c of CREATURES) {
  const doc = await io.read(path.join(inDir, c.file));
  const root = doc.getRoot();
  const textures = root.listTextures();
  const skinIds = Object.keys(c.skins);
  for (const texture of textures) {
    const resized = await sharp(Buffer.from(texture.getImage())).resize(256, 256, { fit: "fill" }).png().toBuffer();
    const first = c.skins[skinIds[0]];
    const img = await sharp(resized).modulate({ hue: first.hue ?? 0, saturation: first.saturation ?? 1, brightness: first.brightness ?? 1 }).webp({ quality: 90 }).toBuffer();
    texture.setImage(img).setMimeType("image/webp");
    for (const id of skinIds) {
      const k = c.skins[id];
      // `tint` recolours (keeps the shading, replaces the hue): the gate creatures' violet.
      let img = sharp(resized).modulate({ hue: k.hue ?? 0, saturation: k.saturation ?? 1, brightness: k.brightness ?? 1 });
      if (k.tint) img = sharp(await img.png().toBuffer()).tint(k.tint);
      await img.webp({ quality: 90 }).toFile(path.join(outDir, "skins", `${id}.webp`));
    }
  }
  for (const m of root.listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.75);
  for (const anim of root.listAnimations()) anim.setName(anim.getName().replace(/^.*\|/, ""));
  // Only the clips the game plays (the kit's emotes and jumps would double the file).
  for (const anim of root.listAnimations()) if (!KEEP.has(anim.getName())) anim.dispose();
  await doc.transform(prune(), dedup());
  const outPath = path.join(outDir, `${c.name}.glb`);
  await io.write(outPath, doc);
  console.log(`wrote ${outPath} (${(fs.statSync(outPath).size / 1e3).toFixed(0)} KB), textures ${textures.length}, clips: ${root.listAnimations().map((a) => a.getName()).join(", ")}, skins: ${skinIds.join(", ")}`);
}
