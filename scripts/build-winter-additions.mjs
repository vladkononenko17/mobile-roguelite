// Swaps the Whiteout's toy cars and flat pines for textured ones in the winter kit
// (public/models/winter/winter-kit.glb). Run after scripts/build-winter-kit.mjs, or on its own over
// the committed kit (idempotent: every id it writes is removed first). Same ids and sizes as the
// models they replace. Shared machinery: scripts/kit-additions.mjs.
//
// Sources, all CC0 (the same files as the Wasteland's, in assets-src/city-overgrowth/, see
// assets-src/SOURCES.md):
//   - Quaternius "Zombie Apocalypse Kit" vehicles (pickup, sports car, truck) and KayKit "City
//     Builder Bits" cars (sedan, hatchback, station wagon, taxi, police car), frosted: paint gone
//     pale and cold under a white rime; the burnt-out wrecks the same cars graded to soot.
//   - Quaternius "Stylized Nature MegaKit" pines, their needles dusted white; bushes, grass tufts,
//     ferns and stones, snowed on, for detail near the hero (new ids w*).
//
//   node scripts/build-winter-additions.mjs   (needs sharp, meshoptimizer, @gltf-transform/*)
import path from "node:path";
import { addToKit } from "./kit-additions.mjs";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const KIT = path.join(ROOT, "public/models/winter/winter-kit.glb");
const SRC = path.join(ROOT, "assets-src/city-overgrowth");
const QN = `${SRC}/quaternius-nature`, QV = `${SRC}/quaternius-vehicles`, KK = `${SRC}/kaykit-city`;

const GRADES = {
  // Cars a winter in the snow: paint faded and cold, frost over everything.
  frost: { saturation: 0.55, brightness: 0.9, dust: [214, 224, 238, 0.3] },
  // The fire's wrecks: soot, a little rust.
  burnt: { saturation: 0.2, brightness: 0.24, dust: [52, 40, 34, 0.25] },
  // Needles under snow: pale, blue-white, the green only just showing.
  snowNeedles: { saturation: 0.45, brightness: 1.05, dust: [228, 236, 246, 0.5] },
  bark: { saturation: 0.6, brightness: 0.7, dust: [200, 210, 225, 0.12] },
  frostRock: { saturation: 0.3, brightness: 0.85, dust: [220, 228, 240, 0.35] },
};
const F = { "*": "frost" }, X = { "*": "burnt" };
const ROCKG = { "*": "frostRock" };
const PINE = { "Bark_NormalTree.png": "bark", "Bark_DeadTree.png": "bark", "*": "snowNeedles" };

const MODELS = {
  // Cars (lengths of the ones they replace).
  sedan: [`${KK}/car_sedan.gltf`, { len: 4.46 }, F],
  sedanSports: [`${QV}/Vehicle_Sports.gltf`, { len: 4.46 }, F],
  hatchback: [`${KK}/car_hatchback.gltf`, { len: 4.4 }, F],
  suv: [`${QV}/Vehicle_Pickup.gltf`, { len: 4.9 }, F],
  suvLuxury: [`${KK}/car_stationwagon.gltf`, { len: 4.9 }, F],
  truck: [`${QV}/Vehicle_Truck.gltf`, { len: 5.6 }, F],
  taxi: [`${KK}/car_taxi.gltf`, { len: 4.6 }, F],
  police: [`${KK}/car_police.gltf`, { len: 4.8 }, F],
  sedanBurnt: [`${KK}/car_sedan.gltf`, { len: 4.46 }, X],
  suvBurnt: [`${QV}/Vehicle_Pickup.gltf`, { len: 4.9 }, X],
  policeBurnt: [`${KK}/car_police.gltf`, { len: 4.8 }, X],
  taxiBurnt: [`${KK}/car_taxi.gltf`, { len: 4.6 }, X],
  truckBurnt: [`${QV}/Vehicle_Truck.gltf`, { len: 5.6 }, X],
  // Pines (heights of the ones they replace).
  pineSnowA: [`${QN}/Pine_1.gltf`, { h: 7.3 }, PINE],
  pineSnowB: [`${QN}/Pine_2.gltf`, { h: 8.3 }, PINE],
  pineSnowC: [`${QN}/Pine_3.gltf`, { h: 6.5 }, PINE],
  pine: [`${QN}/Pine_4.gltf`, { h: 6.3 }, PINE],
  pineTall: [`${QN}/Pine_5.gltf`, { h: 7.9 }, PINE],
  // Near-field detail (walk-over): snowed-on bushes and grass tufts, frosted stones.
  wBush: [`${QN}/Bush_Common.gltf`, { h: 1.1 }, PINE],
  wGrass: [`${QN}/Grass_Wispy_Tall.gltf`, { h: 0.7 }, PINE],
  wFern: [`${QN}/Fern_1.gltf`, { h: 0.6 }, PINE],
  wRock1: [`${QN}/Rock_Medium_1.gltf`, { h: 0.7 }, ROCKG],
  wRock2: [`${QN}/Rock_Medium_2.gltf`, { h: 0.5 }, ROCKG],
};
const RATIO = {
  sedanSports: 0.45, suv: 0.45, truck: 0.4, suvBurnt: 0.45, truckBurnt: 0.4,
  pineSnowA: 0.6, pineSnowB: 0.6, pineSnowC: 0.6, pine: 0.6, pineTall: 0.6,
};

await addToKit({ kit: KIT, models: MODELS, grades: GRADES, ratio: RATIO });
