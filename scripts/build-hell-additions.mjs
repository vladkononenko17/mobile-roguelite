// Adds textured dead trees and basalt boulders to the Hell kit (public/models/hell/hell-kit.glb).
// Run after scripts/build-hell-kit.mjs, or on its own over the committed kit (idempotent: every id
// it writes is removed first). Shared machinery: scripts/kit-additions.mjs.
//
// What it adds, CC0 (Quaternius "Stylized Nature MegaKit", the same sources as the Wasteland's
// trees, in assets-src/city-overgrowth/quaternius-nature/, see assets-src/SOURCES.md):
//   - treeDead / treeDead2: real dead trees (bark texture) charred near black with an ember-red
//     cast, in place of the flat low-poly ones (same ids and height, so the level is unchanged).
//   - hRock1..3: boulders and stones, the pack's rock graded to dark basalt with ash in the cracks,
//     for the scenes along the road and the litter on the islands.
//
//   node scripts/build-hell-additions.mjs   (needs sharp, meshoptimizer, @gltf-transform/*)
import path from "node:path";
import { addToKit } from "./kit-additions.mjs";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const KIT = path.join(ROOT, "public/models/hell/hell-kit.glb");
const QN = path.join(ROOT, "assets-src/city-overgrowth/quaternius-nature");

const GRADES = {
  // Burnt wood: near black, a little ember red left in it.
  charred: { saturation: 0.25, brightness: 0.34, dust: [70, 26, 18, 0.22] },
  // The pack's grey-green rock as basalt: dark, cold, ash settled on it.
  basalt: { saturation: 0.1, brightness: 0.42, dust: [64, 44, 40, 0.24] },
};
const TREE = { "*": "charred" }, ROCK = { "*": "basalt" };

const MODELS = {
  treeDead: [`${QN}/DeadTree_1.gltf`, { h: 5.9 }, TREE],
  treeDead2: [`${QN}/DeadTree_3.gltf`, { h: 5.9 }, TREE],
  hRock1: [`${QN}/Rock_Medium_1.gltf`, { h: 1.3 }, ROCK],
  hRock2: [`${QN}/Rock_Medium_2.gltf`, { h: 0.8 }, ROCK],
  hRock3: [`${QN}/Rock_Medium_3.gltf`, { h: 1.6 }, ROCK],
};
const RATIO = { treeDead: 0.35, treeDead2: 0.35 };
const SLOPPY = { treeDead: 0.35, treeDead2: 0.35 };

await addToKit({ kit: KIT, models: MODELS, grades: GRADES, ratio: RATIO, sloppy: SLOPPY });
