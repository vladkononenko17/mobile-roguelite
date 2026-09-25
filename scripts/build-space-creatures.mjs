// Builds the ORION campaign's aliens and mechs from Quaternius "Ultimate Space Kit" (CC0,
// quaternius.com; glTF characters downloaded into assets-src/quaternius-space/characters/):
// Enemy_ExtraSmall (skitter swarm), Enemy_Small (spitter), Enemy_Flying (the "glub" flyer),
// Enemy_Large (alien brute, and the Brood Mother boss) and a Mech (security mech, and the Warden boss).
//
//   node scripts/build-space-creatures.mjs [in dir] [out dir]
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
const inDir = process.argv[2] ?? path.join(ROOT, "assets-src/quaternius-space/characters");
const outDir = process.argv[3] ?? path.join(ROOT, "public/models/aliens");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** Output name, source, and skins: id -> sharp modulate (hue degrees, saturation, brightness). */
const CREATURES = [
  { name: "skitter", file: "Enemy_ExtraSmall.gltf", skins: { skitter_green: { hue: 0 }, skitter_violet: { hue: 150, saturation: 1.1 }, skitter_red: { hue: -90, saturation: 1.2, brightness: 0.9 } } },
  { name: "spitter", file: "Enemy_Small.gltf", skins: { spitter_toxic: { hue: 0 }, spitter_blue: { hue: 120 } } },
  { name: "glub", file: "Enemy_Flying.gltf", skins: { glub_pink: { hue: 0 }, glub_teal: { hue: 160, saturation: 1.1 } } },
  { name: "alienBrute", file: "Enemy_Large.gltf", skins: { brute_green: { hue: 0 }, brute_crimson: { hue: -110, saturation: 1.2, brightness: 0.85 }, brood_queen: { hue: 170, saturation: 1.3, brightness: 0.75 } } },
  { name: "mech", file: "Mech_FinnTheFrog.gltf", skins: { mech_security: { hue: 0, saturation: 0.35, brightness: 0.8 }, mech_warden: { hue: -100, saturation: 1.3, brightness: 0.7 } } },
];

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
      await sharp(resized).modulate({ hue: k.hue ?? 0, saturation: k.saturation ?? 1, brightness: k.brightness ?? 1 }).webp({ quality: 90 }).toFile(path.join(outDir, "skins", `${id}.webp`));
    }
  }
  for (const m of root.listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.75);
  for (const anim of root.listAnimations()) anim.setName(anim.getName().replace(/^.*\|/, ""));
  await doc.transform(prune(), dedup());
  const outPath = path.join(outDir, `${c.name}.glb`);
  await io.write(outPath, doc);
  console.log(`wrote ${outPath} (${(fs.statSync(outPath).size / 1e3).toFixed(0)} KB), textures ${textures.length}, clips: ${root.listAnimations().map((a) => a.getName()).join(", ")}, skins: ${skinIds.join(", ")}`);
}
