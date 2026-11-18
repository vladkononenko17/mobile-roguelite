// Adds the reworked ORION's pieces to the station kit (public/models/facility/facility-kit.glb).
// Run after scripts/build-facility-kit.mjs, or on its own over the committed kit (idempotent: every
// id it writes is removed first). Shared machinery: scripts/kit-additions.mjs.
//
// What it adds, all CC0 (sources in assets-src/orion-additions/, see assets-src/SOURCES.md):
//   - KayKit "Space Base Bits": a dropship and landers for the hangar, landing pads, cargo depots,
//     stacked cargo, a cargo truck and trailer, gantries, floodlights, water tanks; on the asteroid a
//     survey camp - base modules, tunnels plugged into the airlock tube, a drill rig, solar panels -
//     and rocks and cliffs (the pack's orange Mars stone graded to the asteroid's violet grey).
//   - Kenney "Space Station Kit": the crew's furniture - workstations, holo tables, beds, mess tables,
//     chairs, lockers and crates, scaffold frames.
//   - For the quarantine, reactor and gate: carts, rails, wall screens, blankets, sealed crates
//     (Kenney) and KayKit container stacks.
// These replace the low-poly Kenney Space Kit craft, rocks and craters, which are removed.
//
//   node scripts/build-orion-additions.mjs   (needs sharp, meshoptimizer, @gltf-transform/*)
import path from "node:path";
import { addToKit } from "./kit-additions.mjs";

const ROOT = process.env.REPO_ROOT ?? path.resolve(import.meta.dirname, "..");
const KIT = path.join(ROOT, "public/models/facility/facility-kit.glb");
const SRC = path.join(ROOT, "assets-src/orion-additions");
const KS = `${SRC}/kaykit-space`, ST = `${SRC}/kenney-station`;

const GRADES = {
  // KayKit's white and orange, a touch quieter under the station's blue light.
  base: { saturation: 0.82, brightness: 0.9 },
  // The pack's orange rock as the asteroid's: near grey with a violet cast (the ground is violet).
  stone: { saturation: 0.1, brightness: 0.62, dust: [74, 66, 98, 0.32] },
  // Kenney's station palette as it is (it already matches the walls).
  station: { saturation: 0.9, brightness: 0.95 },
};
const B = { "*": "base" }, R = { "*": "stone" }, K = { "*": "station" };
const st = (file, size = { k: 2.6 }) => [`${ST}/${file}.glb`, size, K];

const MODELS = {
  // The hangar: craft, pads, cargo and its handling.
  yDropship: [`${KS}/dropship.gltf`, { len: 15 }, B],
  yDropshipPacked: [`${KS}/dropship_packed.gltf`, { len: 11 }, B],
  yLanderA: [`${KS}/lander_A.gltf`, { len: 7.5 }, B],
  yLanderB: [`${KS}/lander_B.gltf`, { len: 7.5 }, B],
  yPadL: [`${KS}/landingpad_large.gltf`, { len: 14 }, B],
  yPadS: [`${KS}/landingpad_small.gltf`, { len: 9 }, B],
  yDepotA: [`${KS}/cargodepot_A.gltf`, { len: 7 }, B],
  yDepotB: [`${KS}/cargodepot_B.gltf`, { len: 7 }, B],
  yDepotC: [`${KS}/cargodepot_C.gltf`, { len: 7 }, B],
  yCargoA: [`${KS}/cargo_A_stacked.gltf`, { h: 2.4 }, B],
  yCargoB: [`${KS}/cargo_B_stacked.gltf`, { h: 2.4 }, B],
  yCargoPacked: [`${KS}/cargo_A_packed.gltf`, { h: 1.3 }, B],
  yTruck: [`${KS}/spacetruck.gltf`, { len: 5 }, B],
  yTruckL: [`${KS}/spacetruck_large.gltf`, { len: 6 }, B],
  yTrailer: [`${KS}/spacetruck_trailer.gltf`, { len: 5.8 }, B],
  yStructTall: [`${KS}/structure_tall.gltf`, { h: 9 }, B],
  yStructLow: [`${KS}/structure_low.gltf`, { h: 4.5 }, B],
  yLights: [`${KS}/lights.gltf`, { h: 4.5 }, B],
  yWater: [`${KS}/water_storage.gltf`, { len: 7 }, B],
  // The survey camp on the asteroid.
  yBaseA: [`${KS}/basemodule_A.gltf`, { len: 12 }, B],
  yBaseB: [`${KS}/basemodule_B.gltf`, { len: 12 }, B],
  yBaseC: [`${KS}/basemodule_C.gltf`, { len: 12 }, B],
  yBaseE: [`${KS}/basemodule_E.gltf`, { len: 12 }, B],
  yGarage: [`${KS}/basemodule_garage.gltf`, { len: 12 }, B],
  yTunnel: [`${KS}/tunnel_straight_A.gltf`, { len: 8 }, B],
  yDrill: [`${KS}/drill_structure.gltf`, { h: 10 }, B],
  ySolar: [`${KS}/solarpanel.gltf`, { len: 5 }, B],
  yMobile: [`${KS}/mobile_base_command.gltf`, { len: 9 }, B],
  yEco: [`${KS}/eco_module.gltf`, { h: 7 }, B],
  // Asteroid stone.
  yRock: [`${KS}/rock_B.gltf`, { len: 2.6 }, R],
  yRocksA: [`${KS}/rocks_A.gltf`, { len: 6 }, R],
  yRocksB: [`${KS}/rocks_B.gltf`, { len: 7 }, R],
  yCliff: [`${KS}/terrain_tall.gltf`, { k: 5 }, R],
  yCliffCurve: [`${KS}/terrain_tall_curved.gltf`, { k: 5 }, R],
  // The crew's furniture (Kenney station kit, x2.6).
  zCompWide: st("computer-wide"),
  zCompSystem: st("computer-system"),
  zCompScreen: st("computer-screen"),
  zComputer: st("computer"),
  zTablePlanet: st("table-display-planet", { k: 4 }),
  zTableDisplay: st("table-display"),
  zTableLarge: st("table-large"),
  zTable: st("table"),
  zTableInset: st("table-inset"),
  zChair: st("chair-cushion-headrest"),
  zChairArm: st("chair-armrest-headrest"),
  zBed: st("bed-single"),
  zBedDouble: st("bed-double"),
  zContTall: st("container-tall"),
  zContWide: st("container-wide"),
  zContainer: st("container"),
  zContFlat: st("container-flat-open"),
  zDisplayWide: st("display-wall-wide"),
  zStructure: st("structure", { k: 3 }),
  zBarrierHigh: st("structure-barrier-high"),
  zSkipRocks: st("skip-rocks"),
  // Quarantine, reactor and gate: carts, rails, wall screens, blankets, sealed crates.
  zSkip: st("skip"),
  zRail: st("rail"),
  zDisplay: st("display-wall"),
  zBedCover: st("bed-single-cover"),
  zContFlatShut: st("container-flat"),
  zTableSmall: st("table-display-small"),
  yContA: [`${KS}/containers_A.gltf`, { len: 5 }, B],
  yContB: [`${KS}/containers_B.gltf`, { len: 5 }, B],
  yContC: [`${KS}/containers_C.gltf`, { len: 5 }, B],
};

// The Kenney Space Kit pieces nothing places any more (craft, rocks, craters, the hangar).
const REMOVE = ["sCliff", "sCraftCargo", "sCraftCargoB", "sCraftMiner", "sCraftSpeeder", "sCrater", "sCraterLarge", "sHangar", "sMeteor", "sMeteorHalf", "sRock", "sRockLargeA", "sRockLargeB", "sRocket", "sRocksSmall", "sRover", "sStructure", "sSupports"];

await addToKit({ kit: KIT, models: MODELS, grades: GRADES, remove: REMOVE });
