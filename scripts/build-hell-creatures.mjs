// Builds the Hell's animated flyers and casters from Quaternius "Monster Pack Animated" (CC0,
// `hell2` release): Dragon (the drake flyer and the second boss), Bat (the swarm) and Skeleton (the
// caster). FBX converted to GLB with FBX2glTF first (assets-src/hell2/creatures/q_*.glb).
//
//   node scripts/build-hell-creatures.mjs <in dir> <out dir>
//
// The pack colours each part with a flat material (Main, Belly, Wings, Eyes...). EnemyManager draws
// a body with one material, so every material is baked into a tiny swatch texture (each primitive's
// UVs point at its swatch) in an infernal palette per skin, with a matching emissive swatch map for
// the glowing parts (eyes, a lava belly). Clip names lose their armature prefix
// ("DragonArmature|Dragon_Flying" -> "Dragon_Flying").
//
// Not part of the normal build. Needs (npm i --no-save): @gltf-transform/core@4,
// @gltf-transform/extensions@4, @gltf-transform/functions@4, sharp.
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune } from "@gltf-transform/functions";
import sharp from "sharp";

const [inDir, outDir] = process.argv.slice(2);
if (!outDir) throw new Error("usage: node scripts/build-hell-creatures.mjs <in dir> <out dir>");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/**
 * Per creature: material -> swatch colour (sRGB 0..1) per skin, and glow (emissive sRGB) per
 * material. The first skin is embedded; all are written to out/skins/<skin>.webp.
 */
const CREATURES = [
  {
    name: "drake", file: "q_dragon.glb",
    materials: ["Main", "Belly", "Claws", "Wings", "Eyes"],
    glow: { Belly: [0.55, 0.16, 0.02], Eyes: [1, 0.85, 0.3] },
    skins: {
      drake_crimson: { Main: [0.42, 0.07, 0.06], Belly: [0.95, 0.42, 0.08], Claws: [0.8, 0.72, 0.58], Wings: [0.16, 0.04, 0.04], Eyes: [1, 0.9, 0.4] },
      drake_wyrm: { Main: [0.1, 0.08, 0.09], Belly: [1, 0.55, 0.12], Claws: [0.9, 0.85, 0.75], Wings: [0.32, 0.05, 0.04], Eyes: [1, 1, 0.8] },
    },
  },
  {
    name: "hellbat", file: "q_bat.glb",
    materials: ["Main", "Belly", "Black", "Nose", "Eyes"],
    glow: { Eyes: [1, 0.2, 0.1] },
    skins: {
      bat_blood: { Main: [0.22, 0.05, 0.1], Belly: [0.55, 0.12, 0.08], Black: [0.06, 0.02, 0.03], Nose: [0.3, 0.1, 0.1], Eyes: [1, 0.25, 0.15] },
    },
  },
  {
    name: "husk", file: "q_skeleton.glb",
    materials: ["Skeleton"],
    glow: {},
    skins: {
      // Charred bone.
      husk_charred: { Skeleton: [0.36, 0.3, 0.26] },
    },
  },
];

const SWATCH = 8; // pixels per swatch; swatches in one row
fs.mkdirSync(path.join(outDir, "skins"), { recursive: true });

async function swatches(colours) {
  const n = colours.length, w = n * SWATCH, h = SWATCH;
  const data = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = colours[Math.floor(x / SWATCH)];
    for (let k = 0; k < 3; k++) data[(y * w + x) * 3 + k] = Math.round(c[k] * 255);
  }
  return sharp(data, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

for (const creature of CREATURES) {
  const doc = await io.read(path.join(inDir, creature.file));
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const index = new Map(creature.materials.map((m, i) => [m, i]));
  const n = creature.materials.length;
  // Point every primitive's UVs at the centre of its material's swatch.
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const name = prim.getMaterial()?.getName() ?? creature.materials[0];
      const i = index.get(name) ?? 0;
      const count = prim.getAttribute("POSITION").getCount();
      const uv = new Float32Array(count * 2);
      for (let v = 0; v < count; v++) {
        uv[v * 2] = (i + 0.5) / n;
        uv[v * 2 + 1] = 0.5;
      }
      prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(uv).setBuffer(buffer));
      for (const sem of prim.listSemantics()) if (sem.startsWith("TEXCOORD_") && sem !== "TEXCOORD_0") prim.setAttribute(sem, null);
    }
  }
  const skinIds = Object.keys(creature.skins);
  for (const id of skinIds) {
    const png = await swatches(creature.materials.map((m) => creature.skins[id][m]));
    await sharp(png).webp({ lossless: true }).toFile(path.join(outDir, "skins", `${id}.webp`));
  }
  const base = doc.createTexture(`${creature.name}_swatches`).setImage(await swatches(creature.materials.map((m) => creature.skins[skinIds[0]][m]))).setMimeType("image/png");
  const glowColours = creature.materials.map((m) => creature.glow[m] ?? [0, 0, 0]);
  const hasGlow = glowColours.some((c) => c.some((v) => v > 0));
  const emissive = hasGlow ? doc.createTexture(`${creature.name}_glow`).setImage(await swatches(glowColours)).setMimeType("image/png") : null;
  const material = doc.createMaterial(`${creature.name}`).setBaseColorTexture(base).setMetallicFactor(0).setRoughnessFactor(0.8)
    .setEmissiveTexture(emissive).setEmissiveFactor(hasGlow ? [1, 1, 1] : [0, 0, 0]);
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) prim.setMaterial(material);
  // Nearest filtering keeps the swatches crisp.
  for (const info of [material.getBaseColorTextureInfo(), material.getEmissiveTextureInfo()]) info?.setMagFilter(9728).setMinFilter(9728);
  for (const anim of root.listAnimations()) anim.setName(anim.getName().replace(/^.*\|/, ""));
  await doc.transform(prune(), dedup());
  const outPath = path.join(outDir, `${creature.name}.glb`);
  await io.write(outPath, doc);
  console.log(`wrote ${outPath} (${(fs.statSync(outPath).size / 1e3).toFixed(0)} KB), clips: ${root.listAnimations().map((a) => a.getName()).join(", ")}, skins: ${skinIds.join(", ")}`);
}
