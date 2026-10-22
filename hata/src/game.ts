import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { hdri, setAnisotropy } from "./assets";
import { Audio } from "./audio";
import { Lawn } from "./clean/lawn";
import type { CleanSurface } from "./clean/surface";
import { DAY, PAY, PAY_PER_M2, TOOL_FOR, TOOLS, type PerkId, type ToolId, type WorkKind } from "./content";
import { DishStation } from "./dishes";
import { Jet, Particles } from "./fx";
import { Jobs } from "./game/jobs";
import { Hud, type TargetInfo } from "./hud";
import { Input } from "./input";
import { Player } from "./player";
import {
  buy, choosePerk, client, clock, dayLength, doneAt, handOver, has, Ledger, migrate, newRun, nextDay, rng, tick, toolStats, type Save,
} from "./sim";
import { grimeGlobals } from "./world/grime";
import { buildHouse, HOUSE } from "./world/house";
import { Gates, stageAt } from "./world/gates";
import { SunsetSky } from "./world/sky";
import { atmos, Motes } from "./world/atmos";
import { mergeStatic } from "./world/merge";
import { currentStage, matches, STAGE_DONE, STAGES, stageShare } from "./game/stages";
import { WorldIndex, type Interactable } from "./world/index";
import { buildKitchen, SINK } from "./world/kitchen";
import { buildYard, LADDER, LAWN_ZONES, placeProps, POOL } from "./world/yard";

/**
 * «Клін Клінич» — a first-person cleaning roguelite. You get a dirty house
 * and three days; every percent you clean pays, the money buys better tools,
 * and the client's stars decide whether your crew goes on to the next house.
 */

declare global {
  interface Window {
    __hata: Record<string, unknown> & { ready: boolean; frames: number };
  }
}

const SAVE_KEY = "hata.save.v1";
const params = new URLSearchParams(location.search);

function loadSave(): Save {
  try {
    return migrate(JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null"));
  } catch {
    return migrate(null);
  }
}
const save = loadSave();
if (!localStorage.getItem(SAVE_KEY)) save.settings.quality = "medium";
// If the tab died during the first seconds of play last time (out of memory on a phone),
// step the graphics down one notch before loading anything.
let downgraded = false;
try {
  if (localStorage.getItem("hata.crash")) {
    localStorage.removeItem("hata.crash");
    if (save.settings.quality !== "low") {
      save.settings.quality = save.settings.quality === "high" ? "medium" : "low";
      downgraded = true;
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    }
  }
} catch { /* private mode */ }
function persist(): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ }
}

const QUALITY = {
  low: { dpr: 1.0, minDpr: 0.75, shadow: 1024, ao: false, grass: 55, lod: 0.6 },
  medium: { dpr: 1.5, minDpr: 0.9, shadow: 1536, ao: false, grass: 80, lod: 0.8 },
  high: { dpr: 2, minDpr: 1.1, shadow: 2048, ao: true, grass: 110, lod: 1 },
};
const Q = QUALITY[(params.get("q") as Save["settings"]["quality"]) ?? save.settings.quality];

// ── Renderer, scene, cameras ────────────────────────────────────────────────
const view = document.getElementById("view")!;
const still = params.has("still");
const renderer = new THREE.WebGLRenderer({ antialias: !Q.ao, powerPreference: "high-performance", preserveDrawingBuffer: still });
renderer.setPixelRatio(Math.min(devicePixelRatio, Number(params.get("dpr") ?? Q.dpr)));
renderer.setSize(view.clientWidth, view.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// shadows are redrawn every other frame (and whenever the sun's box moves):
// the sun barely moves and 30 Hz is plenty for the few things that do
renderer.shadowMap.autoUpdate = false;
let shadowTick = 0;
let shadowFocus = "";
// ACES plus a little extra saturation and warmth: a cheap colour grade that
// costs nothing extra (no post-processing pass), applied in every material.
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  "vec3 CustomToneMapping( vec3 color ) { return color; }",
  `vec3 CustomToneMapping( vec3 color ) {
    vec3 c = ACESFilmicToneMapping( color );
    float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
    c = mix( vec3( l ), c, 1.15 ) * vec3( 1.09, 0.99, 0.84 );
    c = c * c * ( 3.0 - 2.0 * c ) * 0.25 + c * 0.75; // a touch of S-curve contrast
    return clamp( c, 0.0, 1.0 );
  }`,
);
renderer.toneMapping = THREE.CustomToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);
setAnisotropy(Math.min(4, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, view.clientWidth / view.clientHeight, 0.05, 260);
scene.add(camera);
camera.near = 0.03;
camera.updateProjectionMatrix();
// Tools in hand live in their own tiny scene, drawn after the world on a cleared
// depth buffer (the usual first-person trick): nothing in the world — a wall,
// grass, the sky dome — can ever hide or cut them. The view-model camera sits at
// the origin with the main camera's rotation, so "vm space + camera position"
// is world space. Its own sun and sky light copy the world's every frame.
const VM_SCALE = 0.25;
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(62, view.clientWidth / view.clientHeight, 0.005, 4);
vmScene.add(vmCam);
const vmRoot = new THREE.Group();
vmRoot.scale.setScalar(VM_SCALE);
vmCam.add(vmRoot);
const vmSun = new THREE.DirectionalLight(0xffffff, 1);
const vmHemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
const vmRoom = new THREE.PointLight(0xffe6c8, 0, 9, 1.4);
vmScene.add(vmSun, vmSun.target, vmHemi, vmRoom);
function syncVmCamera(): void {
  vmCam.quaternion.copy(camera.quaternion);
  if (vmCam.aspect !== camera.aspect || vmCam.fov !== camera.fov) {
    vmCam.aspect = camera.aspect;
    vmCam.fov = camera.fov;
    vmCam.updateProjectionMatrix();
  }
  vmCam.updateMatrixWorld(true);
}

const hud = new Hud();
hud.show(false);
const input = new Input(view);
input.joyEl = hud.joy.ring.parentElement as HTMLElement;
input.joyEl = document.getElementById("joy");
input.joyKnob = hud.joy.knob;
const audio = new Audio();
audio.enabled = save.settings.sound;

window.__hata = { ready: false, frames: 0, save };

// ── Game state ──────────────────────────────────────────────────────────────
type Mode = "title" | "play" | "dishes" | "menu";
let mode: Mode = "title";
let tool: ToolId = "washer";
let highlight = false;
/** Washer switched on (tap to toggle). */
let sprayOn = false;
/** The action button was touched since the last frame (a quick tap can start and end between frames). */
let actionTap = false;
let nozzleWide = false;
let lastPaintMode: "scrape" | "paint" = "scrape";
const player = new Player();
const W = new WorldIndex();
const style = client(save.run.seed);
const restore = (k: string): number => save.run.progress[k] ?? 0;
const ledger = new Ledger(save, (amount, key, done) => {
  hud.float(amount);
  if (done) onSurfaceDone(key);
});

let roofAt: (x: number, z: number) => number | null = () => null;
let yard: Awaited<ReturnType<typeof buildYard>>;
let jobs: Jobs;
let station: DishStation;
const jet = new Jet();
const fx = new Particles();
scene.add(jet.group, fx.mesh);
const motes = new Motes();
scene.add(motes.points);
const sun = new THREE.DirectionalLight(0xffd6a0, 4.0);
const hemi = new THREE.HemisphereLight(0xc6b8e8, 0x6a4a30, 0.55);
/** Sun azimuth: low from the street-and-east corner, so the front and the east side glow. */
const SUN_AZ = 0.8;
let sky: SunsetSky | null = null;
/** Furniture, kitchen and everything else inside: drawn only when you're in or near the house. */
const interior = new THREE.Group();
let houseGroup: THREE.Group = new THREE.Group();
interior.name = "interior";
/** The sky panorama and the direction of its sun, atan2(z, x) in three's equirect mapping. */
const SKY = { id: "kloppenheim_06_puresky", sunAngle: (0.6123 - 0.5) * Math.PI * 2 };
/** One warm light that follows you indoors (a single light keeps every shader cheap). */
const roomLight = new THREE.PointLight(0xffe6c8, 0, 9, 1.4);
const toolsGltf: Record<string, THREE.Object3D> = {};
const vms: Partial<Record<string, THREE.Object3D>> = {};
let mower: THREE.Object3D | null = null;

function surfaceByKey(k: string): CleanSurface | undefined {
  return W.surfaces.find((s) => s.key === k);
}

function onSurfaceDone(key: string): void {
  const s = surfaceByKey(key);
  if (s) {
    s.finish();
    const c = s.origin.clone().addScaledVector(s.u, s.w / 2).addScaledVector(s.v, s.h / 2);
    const near = aimHit?.point ?? c;
    fx.emit("spark", near, 30, s.normal.clone().multiplyScalar(0.8), 1.6);
    hud.toast(`${s.name} — чисто!`, "good");
    audio.shot("done");
    return;
  }
  const zi = LAWN_ZONES.findIndex((z) => z.key === key);
  if (zi >= 0) {
    yard.lawn.finish(zi);
    hud.toast(`${LAWN_ZONES[zi].name} — скошено!`, "good");
    audio.shot("done");
  }
}

// ── Values & completion ─────────────────────────────────────────────────────
interface Row { group: string; name: string; key: string; value: number; share: () => number }
let rows: Row[] = [];
function buildRows(): void {
  const grp = (s: CleanSurface): string => {
    if (s.kind === "glass") return "Вікна";
    if (s.key.startsWith("facade") || s.key.startsWith("roof")) return "Фасади і дах";
    if (s.key.startsWith("kitchen") || s.key.startsWith("dish")) return "Кухня";
    if (s.key.startsWith("floor") || s.key.startsWith("bath")) return "У хаті";
    return "Подвір'я";
  };
  rows = W.surfaces.map((s) => ({ group: grp(s), name: s.name, key: s.key, value: s.value, share: () => s.share() }));
  LAWN_ZONES.forEach((z, i) => {
    // area from blade count, so the price does not depend on graphics quality
    const area = yard.lawn.zones[i].total / Q.grass;
    rows.push({ group: "Газон і листя", name: z.name, key: z.key, value: Math.max(50, Math.round(area * (PAY_PER_M2.lawn ?? 2))), share: () => yard.lawn.share(i) });
  });
  for (const f of yard.leaves) rows.push({ group: "Газон і листя", name: f.name, key: f.key, value: Math.round(f.total * PAY.leaf), share: () => f.share() });
  rows.push({ group: "Басейн", name: yard.poolLeaves.name, key: yard.poolLeaves.key, value: Math.round(yard.poolLeaves.total * PAY.poolLeaf), share: () => yard.poolLeaves.share() });
  rows.push({ group: "Басейн", name: "Вода в басейні", key: "pool:chem", value: PAY.poolChem, share: () => (jobs.poolChem.done ? 1 : 0) });
  rows.push({ group: "Кухня", name: "Посуд", key: "dishes", value: station.dishes.length * PAY.dish, share: () => station.done() / station.dishes.length });
  for (const j of jobs.summary()) {
    if (j.key === "pool:chem") continue;
    const v = j.key === "trash" ? j.total * PAY.trash : j.key === "tiles" ? j.total * PAY.roofTile : PAY.lostItem;
    rows.push({ group: "Дрібниці", name: j.name, key: j.key, value: v, share: () => { const s = jobs.summary().find((x) => x.key === j.key)!; return s.done / s.total; } });
  }
}
const houseValue = (): number => rows.reduce((a, r) => a + r.value, 0);
const overall = (): number => {
  const v = houseValue();
  return v ? rows.reduce((a, r) => a + r.value * r.share(), 0) / v : 0;
};

// ── Loading ─────────────────────────────────────────────────────────────────
let loadSteps = 0;
const LOAD_TOTAL = 8;
const step = () => { loadSteps++; hud.loading(loadSteps / LOAD_TOTAL, false); };

function showTitle(loading: boolean): void {
  hud.title({
    client: style.name, owner: style.owner, day: save.run.day, houses: save.run.houses, stars: save.run.stars, money: save.money,
    best: save.best.houses ? `${save.best.houses} хат, ${save.best.stars}★` : "", loading,
  }, startPlay, () => {
    if (!confirm("Почати нову бригаду? Поточна хата і бонуси пропадуть, техніка і гроші лишаться.")) return;
    save.run = newRun(Math.floor(Math.random() * 1e9));
    persist();
    location.reload();
  }, () => hud.settings(save, applySettings, () => {}));
}

function applySettings(): void {
  audio.setEnabled(save.settings.sound);
  persist();
}

async function boot(): Promise<void> {
  showTitle(true);
  const { env, background } = await hdri(renderer, SKY.id);
  scene.environment = env;
  scene.environmentIntensity = 0.7;
  // turn the sky so its low sun sits where our sun light comes from
  const skyRot = SKY.sunAngle - Math.atan2(Math.cos(SUN_AZ), Math.sin(SUN_AZ));
  scene.environmentRotation.set(0, skyRot, 0);
  sky = new SunsetSky(background, skyRot);
  scene.add(sky.mesh);

  // warm sunset haze
  scene.fog = new THREE.Fog(0xe2b88e, 40, 165);
  step();

  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  const sc = sun.shadow.camera;
  sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target, hemi);
  scene.add(roomLight);

  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}hata/models/tools.glb`);
  for (const name of ["washer", "mower", "blower", "detector", "rake", "net", "mop", "squeegee", "roller", "scraper", "rag", "sponge"]) {
    const o = gltf.scene.getObjectByName(name);
    if (o) {
      const c = o.clone(true);
      c.position.set(0, 0, 0);
      c.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; } });
      toolsGltf[name] = c;
    }
  }
  step();

  const house = await buildHouse(W, style, restore);
  roofAt = house.roofAt;
  scene.add(house.group);
  houseGroup = house.group;
  gates = new Gates(W, house.doors);
  scene.add(gates.group);
  step();
  scene.add(interior);
  const dishes = await buildKitchen(interior, W, restore);
  step();
  yard = await buildYard(W, style, restore, { grassDensity: Q.grass, seed: save.run.seed });
  scene.add(yard.group);
  step();
  await placeProps(scene, W, interior);
  // the sun only reaches the rooms through the windows: furniture needn't cast
  interior.traverse((o) => { o.castShadow = false; });
  step();
  jobs = new Jobs({
    W, scene, seed: save.run.seed, restore,
    mark: (k, v) => { save.run.progress[k] = v; },
    pay: (_k, amount, text) => { ledger.bonus(_k, amount); hud.toast(`${text} +${Math.round(amount)} ₴`, "gold"); },
    toast: (t) => hud.toast(t),
    sfx: (n) => audio.shot(n),
    coinMul: () => 1 + has(save, "pockets"),
    onRoof: () => player.onRoof,
    poolLeaves: yard.poolLeaves,
    lawn: yard.lawn,
    setPoolClean: yard.setPoolClean,
  });
  await jobs.loadTrash();
  step();
  const sponge = toolsGltf.sponge?.clone(true) ?? new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: 0xffd23c }));
  station = new DishStation(dishes, sponge, scene);
  registerInteractables();
  // bake static meshes into one draw per material (house, rooms, yard separately)
  mergeStatic(houseGroup);
  mergeStatic(interior);
  mergeStatic(yard.group);
  buildRows();
  stage = stageNow();
  gates.init(stage);
  setupViewmodels();
  step();

  player.place(-2.2, 12.5, 0);
  if (params.has("x")) player.place(Number(params.get("x")), Number(params.get("z")), Number(params.get("yaw") ?? 0));
  if (params.has("pitch")) player.pitch = Number(params.get("pitch"));
  player.applyCamera(camera);
  if (params.has("tool")) tool = params.get("tool") as ToolId;
  hud.loading(1, true);
  window.__hata.ready = true;
  setupComposer();
  rendering = true;
  // offline checks drive the game through __hata.simulate and render on capture
  if (!still) frame();
  if (params.has("play")) startPlay();
}

function registerInteractables(): void {
  const ladder: Interactable = {
    id: "ladder", pos: new THREE.Vector3(LADDER.x, 1.4, LADDER.z), reach: 2.4, kind: "ladder", hold: 0.4, aimR: 0.9,
    label: () => "Залізти на дах", enabled: () => !player.onRoof,
    act: () => {
      player.onRoof = true;
      player.pos.set(6.3, 0, 4.4);
      player.feet = roofAt(6.3, 4.4) ?? 5;
      player.yaw = Math.PI / 2;
      hud.toast("Обережно, дах похилий");
    },
  };
  const down: Interactable = {
    id: "roofdown", pos: new THREE.Vector3(7.2, 3.6, 4.9), reach: 2.0, kind: "ladder", hold: 0.3, aimR: 1.0,
    label: () => "Злізти з даху", enabled: () => player.onRoof,
    act: () => {
      player.onRoof = false;
      player.pos.set(8.4, 0, 3.6);
      player.feet = 0;
      player.yaw = Math.PI / 2;
    },
  };
  const sink: Interactable = {
    id: "sink", pos: new THREE.Vector3(SINK.x, SINK.top, SINK.z), reach: 1.9, kind: "dish", hold: 0, aimR: 0.55,
    label: () => `Мити посуд (${station.left()})`,
    // only from inside the kitchen, never through the window
    enabled: () => station.left() > 0 && Math.abs(player.pos.x) < HOUSE.halfX && Math.abs(player.pos.z) < HOUSE.halfZ && !player.onRoof,
    act: () => enterDishes(),
  };
  W.interactables.push(ladder, down, sink);
}

// ── Viewmodels ──────────────────────────────────────────────────────────────
interface VM { node: string; pos: [number, number, number]; rot: [number, number, number] }
const VMS: Record<string, VM> = {
  rag: { node: "rag", pos: [0.17, -0.2, -0.4], rot: [0.55, 0.15, 0] },
  washer: { node: "washer", pos: [0.14, -0.22, -0.18], rot: [0.08, 0.12, 0] },
  rake: { node: "rake", pos: [0.26, -0.34, -0.2], rot: [0.0, 0.2, 0] },
  blower: { node: "blower", pos: [0.24, -0.32, -0.3], rot: [0.12, 0.08, 0] },
  net: { node: "net", pos: [0.24, -0.34, -0.15], rot: [0.0, 0.15, 0] },
  mop: { node: "mop", pos: [0.22, -0.34, -0.2], rot: [0.0, 0.15, 0] },
  squeegee: { node: "squeegee", pos: [0.2, -0.2, -0.36], rot: [0.3, 0.05, 0] },
  scraper: { node: "scraper", pos: [0.18, -0.24, -0.4], rot: [0.35, 0.1, 0] },
  roller: { node: "roller", pos: [0.16, -0.24, -0.4], rot: [0.35, 0.1, 0] },
  detector: { node: "detector", pos: [0.24, -0.52, -0.28], rot: [0.05, 0.12, 0] },
};
/** Long-handled tools stand in the world: the head on the ground ahead, the grip in your hands. */
const POLE_TOOLS: Record<string, { drop: number; side: number; ahead: number; tilt: number }> = {
  rake: { drop: 0.5, side: 0.13, ahead: 0.18, tilt: 0 },
  mop: { drop: 0.5, side: 0.13, ahead: 0.42, tilt: 0 },
  net: { drop: 0.42, side: 0.22, ahead: 0.3, tilt: 0.35 },
  detector: { drop: 0.6, side: 0.24, ahead: 0.25, tilt: 0 },
};
function setupViewmodels(): void {
  for (const [k, v] of Object.entries(VMS)) {
    const src = toolsGltf[v.node];
    if (!src) continue;
    const o = src.clone(true);
    o.visible = false;
    if (POLE_TOOLS[k]) {
      o.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = true; });
      scene.add(o);
    } else {
      vmRoot.add(o);
    }
    vms[k] = o;
  }
  if (vms.squeegee) vms.squeegee.scale.setScalar(0.62);
  if (toolsGltf.mower) {
    mower = toolsGltf.mower.clone(true);
    mower.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = true; });
    mower.visible = false;
    mower.traverse((m) => { m.castShadow = false; });
    vmScene.add(mower);
  }
}
function mowerScale(): number {
  const lv = save.tools.mower;
  return lv >= 4 ? 1.5 : lv >= 3 ? 1.12 : 1;
}
/** Deck centre ahead of you: the handle (1.08 m long) ends ~45 cm in front of the eye. */
function mowerAhead(): number {
  return 1.08 * mowerScale() + 0.55;
}
function vmKey(): string | null {
  switch (tool) {
    case "hands": return "rag";
    case "washer": return "washer";
    case "leaves": return (save.tools.leaves ?? 1) > 1 ? "blower" : "rake";
    case "net": return "net";
    case "mop": return "mop";
    case "squeegee": return "squeegee";
    case "paint": return lastPaintMode === "scrape" ? "scraper" : "roller";
    case "detector": return "detector";
    default: return null;
  }
}

// ── Rendering ───────────────────────────────────────────────────────────────
// Plain renderer.render on low/medium (no extra full-screen passes); the
// ambient-occlusion composer only on high.
let composer: EffectComposer | null = null;
let dpr = Math.min(devicePixelRatio, Number(params.get("dpr") ?? Q.dpr));
function setupComposer(): void {
  if (!Q.ao) return;
  const w = view.clientWidth, h = view.clientHeight;
  // multisampled target: the AO path keeps antialiasing (and alpha-to-coverage on foliage)
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w * renderer.getPixelRatio(), h * renderer.getPixelRatio(), { samples: 4, type: THREE.HalfFloatType }));
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, w / 2, h / 2);
  ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 8 });
  ao.blendIntensity = 0.8;
  composer.addPass(ao);
  const out = new OutputPass();
  // the output pass knows only the stock tone mappings: call our graded one directly
  out.material.fragmentShader = out.material.fragmentShader.replace(
    "gl_FragColor = texture2D( tDiffuse, vUv );",
    "gl_FragColor = texture2D( tDiffuse, vUv );\n\tgl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );",
  );
  composer.addPass(out);
}
/** Keeps the frame rate up by trading resolution: measured over ~1 s windows. */
let fpsAcc = 0, fpsN = 0, fps = 60;
function adaptResolution(dt: number): void {
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc < 1) return;
  fps = fpsN / fpsAcc;
  fpsAcc = 0;
  fpsN = 0;
  if (still || mode !== "play") return;
  const max = Math.min(devicePixelRatio, Q.dpr);
  let next = dpr;
  if (fps < 48) next = Math.max(Q.minDpr, dpr - 0.15);
  else if (fps > 58 && dpr < max) next = Math.min(max, dpr + 0.1);
  if (Math.abs(next - dpr) > 0.01) {
    dpr = next;
    renderer.setPixelRatio(dpr);
    renderer.setSize(view.clientWidth, view.clientHeight);
    composer?.setPixelRatio(dpr);
    composer?.setSize(view.clientWidth, view.clientHeight);
  }
  hud.fps(save.settings.showFps ? Math.round(fps) : null);
}
addEventListener("resize", () => {
  camera.aspect = view.clientWidth / view.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(view.clientWidth, view.clientHeight);
  composer?.setSize(view.clientWidth, view.clientHeight);
});

// ── Modes ───────────────────────────────────────────────────────────────────
function startPlay(): void {
  audio.unlock();
  audio.setEnabled(save.settings.sound);
  hud.close("ov-title");
  hud.show(true);
  hud.playMode(true);
  mode = "play";
  if (save.run.offer) showPerks();
  try {
    localStorage.setItem("hata.crash", "1");
    setTimeout(() => { try { localStorage.removeItem("hata.crash"); } catch { /* */ } }, 20000);
  } catch { /* private mode */ }
  if (downgraded) hud.toast(`Знизив якість графіки до «${save.settings.quality === "low" ? "низька" : "середня"}», щоб не вилітало`);
}
function openMenu(fn: () => void): void {
  mode = "menu";
  sprayOn = false;
  input.reset();
  audio.stopLoops();
  jet.active = false;
  fn();
}
function closeMenu(id: string): void {
  hud.close(id);
  mode = "play";
  persist();
}
function enterDishes(): void {
  mode = "dishes";
  sprayOn = false;
  input.reset();
  input.direct = true;
  audio.stopLoops();
  jet.active = false;
  hud.playMode(false);
  station.enter();
  hud.dishes(station.left(), exitDishes);
  for (const o of Object.values(vms)) if (o) o.visible = false;
}
function exitDishes(): void {
  station.exit();
  input.direct = false;
  input.reset();
  audio.stopLoops();
  hud.playMode(true);
  mode = "play";
  persist();
}
function showPerks(): void {
  const offer = save.run.offer;
  if (!offer) return;
  openMenu(() => hud.perks(offer, (p: PerkId) => {
    choosePerk(save, p);
    persist();
    closeMenu("ov-perks");
    hud.toast(`Бонус бригади: ${p ? "взято" : ""}`, "good");
  }));
}
function handOverNow(): void {
  const ov = overall();
  const before = save.run.earnedHere;
  const c = client(save.run.seed);
  const r = handOver(save, ov, houseValue(), Math.floor(Math.random() * 1e9));
  const lines = r.failed
    ? ["Я за це платити не буду.", "Ви тут взагалі були?", "Та воно брудніше, ніж було!"]
    : r.stars >= 5 ? ["Як нова! Розкажу всім сусідам.", "Та це ж не моя хата — така чиста!"] : r.stars >= 3 ? ["Добре попрацювали, дякую.", "Оце я розумію — порядок."] : ["Ну, хоч щось.", "Могло бути й краще."];
  persist();
  openMenu(() => hud.handOver({ client: c.name, owner: c.owner, stars: r.stars, overall: ov, bonus: r.bonus, earned: before + r.bonus, failed: r.failed, line: lines[Math.floor(Math.random() * lines.length)] }, () => {
    persist();
    location.reload();
  }));
}
function dayOver(): void {
  const last = save.run.day >= DAY.deadline;
  persist();
  openMenu(() => hud.dayEnd({ day: save.run.day, earned: save.run.earnedHere, overall: overall(), last }, () => {
    hud.close("ov-day");
    if (last) { handOverNow(); return; }
    nextDay(save);
    persist();
    mode = "play";
    hud.toast(`Ранок ${save.run.day}-го дня`, "good");
  }));
}

hud.onTool = (id) => { tool = id; audio.shot("click"); };
hud.onButton = (b) => {
  if (mode !== "play") return;
  if (b === "light") { highlight = !highlight; hud.setLight(highlight); grimeGlobals.highlight.value = highlight ? 1 : 0; }
  if (b === "mode") {
    if (tool === "washer") { nozzleWide = !nozzleWide; hud.toast(nozzleWide ? "Сопло 40°: ширше, але слабше" : "Сопло 15°: вузько і сильно"); }
  }
  if (b === "pause") openMenu(() => hud.pause(() => closeMenu("ov-pause"), () => hud.settings(save, applySettings, () => {}), () => { persist(); location.reload(); }));
  if (b === "shop") openMenu(showShop);
  if (b === "list") openMenu(() => hud.checklist(rows.map((r) => ({ group: r.group, name: r.name, pct: r.share(), value: r.value, now: !!STAGES[stage] && matches(STAGES[stage], r.key) })), overall(), houseValue(), () => {
    if (!confirm("Здати хату зараз? Господар оцінить те, що є.")) return;
    hud.close("ov-list");
    handOverNow();
  }, () => closeMenu("ov-list"), `${style.name} · ${style.owner}`,
  STAGES[stage] ? { name: STAGES[stage].name, pct: stageShare(STAGES[stage], stageRows()), need: STAGE_DONE, next: STAGES[stage + 1]?.name ?? null } : undefined));
};
function showShop(): void {
  hud.shop(save, (id) => {
    if (buy(save, id)) {
      audio.shot("buy");
      hud.toast(`Нова техніка: ${TOOLS[id].levels[save.tools[id] - 1].name}`, "gold");
      tool = id;
      persist();
    }
    showShop();
  }, () => closeMenu("ov-shop"));
}
hud.onActionDown = () => { audio.unlock(); input.setAction(true); actionTap = true; };
hud.onActionUp = () => input.setAction(false);
view.addEventListener("touchstart", () => audio.unlock(), { passive: true });
document.addEventListener("visibilitychange", () => { if (document.hidden) { persist(); audio.stopLoops(); } });
addEventListener("pagehide", persist);

// ── Aim ─────────────────────────────────────────────────────────────────────
const ray = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
let aimHit: THREE.Intersection | null = null;
let aimSurface: CleanSurface | null = null;
let aimInter: Interactable | null = null;
let holdT = 0;
let paidT = 0;
let beepT = 0;
let digT = 0;
const dirtyReport = new Set<CleanSurface>();

function aim(): void {
  ray.setFromCamera(center, camera);
  ray.far = 8;
  const hits = ray.intersectObjects(W.solids, false);
  aimHit = hits.find((h) => h.object.visible !== false || (h.object as THREE.Mesh).material) ?? null;
  aimSurface = (aimHit?.object.userData.surface as CleanSurface | undefined) ?? null;
  // a wall's inner face belongs to the room, not to the facade on its other side
  if (aimSurface && aimHit?.face) {
    const n = aimHit.face.normal.clone().transformDirection(aimHit.object.matrixWorld);
    if (Math.abs(n.dot(aimSurface.normal)) < 0.5 || (aimSurface.kind !== "glass" && n.dot(aimSurface.normal) < 0)) aimSurface = null;
  }
  // interactables: closest one along the view ray, not behind a wall
  aimInter = null;
  let bestT = Infinity;
  const o = ray.ray.origin, d = ray.ray.direction;
  for (const it of W.interactables) {
    if (!it.enabled()) continue;
    const to = it.pos.clone().sub(o);
    const t = to.dot(d);
    if (t < 0 || t > it.reach + 0.6) continue;
    const dist = to.clone().addScaledVector(d, -t).length();
    if (dist > (it.aimR ?? 0.5)) continue;
    if (aimHit && aimHit.distance < t - 0.6) continue;
    // nothing is reachable through a window pane or an outside wall
    const hs = aimHit?.object.userData.surface as CleanSurface | undefined;
    if (aimHit && hs && (hs.kind === "glass" || hs.key.startsWith("facade")) && aimHit.distance < t - 0.05) continue;
    if (t < bestT) { bestT = t; aimInter = it; }
  }
}

function needTool(kind: WorkKind): ToolId {
  return TOOL_FOR[kind];
}

// ── Frame ───────────────────────────────────────────────────────────────────
const clockT = new THREE.Clock();
let t = 0;
let saveT = 0;
const ACTION_LABEL: Record<ToolId, string> = {
  hands: "Терти", washer: "Мити", mower: "Косити", leaves: "Збирати", net: "Ловити", mop: "Мити", squeegee: "Терти", paint: "Шкребти", detector: "Копати",
};

const seenErrors = new Set<string>();
function frame(): void {
  requestAnimationFrame(frame);
  const raw = clockT.getDelta();
  const dt = Math.min(raw, 0.05);
  adaptResolution(raw);
  // an error in one frame must not freeze the game: keep rendering and say what broke
  try {
    update(dt);
  } catch (e) {
    const msg = e instanceof Error ? `${e.message} @ ${(e.stack ?? "").split("\n")[1]?.trim() ?? ""}` : String(e);
    if (!seenErrors.has(msg)) { seenErrors.add(msg); console.error(e); hud.toast(`Помилка: ${msg.slice(0, 120)}`); }
  }
  try { vmVisibility(); } catch { /* */ }
  render();
}

/** The tool in hand is always the current one, whatever else happened this frame. */
function vmVisibility(): void {
  const key = mode === "play" ? vmKey() : null;
  for (const [k, o] of Object.entries(vms)) if (o) o.visible = k === key;
}

function update(dt: number): void {
  t += dt;
  grimeGlobals.time.value = t;
  atmos.time.value = t;
  motes.update(dt, camera.position, t);
  const st = input.poll();
  audio.update(dt);
  if (mode === "play") {
    const stats = toolStats(save, tool) ?? toolStats(save, "hands")!;
    player.look(st.look.x, st.look.y, save.settings.sensitivity);
    const px = player.pos.x, pz = player.pos.z;
    player.update(dt, st.move.x, st.move.y, W, roofAt, tool === "mower" ? stats.walk ?? 1 : 1, st.sprint);
    // never step into an area of a later stage (unless already standing in one)
    if (!player.onRoof && stageAt(player.pos.x, player.pos.z) > stage && stageAt(px, pz) <= stage) { player.pos.x = px; player.pos.z = pz; }
    stageUpdate(dt, Math.hypot(st.move.x, st.move.y) > 0.3);
    player.applyCamera(camera);
    camera.updateMatrixWorld();
    aim();
    // the washer is switched on and off with a tap, so the other thumb is free to look
    // around; everything else (and using things like the sink) works while held
    if (tool === "washer" && !aimInter) {
      if (actionTap) sprayOn = !sprayOn;
    } else sprayOn = false;
    actionTap = false;
    work(dt, tool === "washer" && !aimInter ? sprayOn : st.action, st.actionDown, stats);
    if (tick(save, dt)) dayOver();
  } else if (mode === "dishes") {
    camera.position.lerp(station.camPos, Math.min(1, dt * 5));
    const m = new THREE.Matrix4().lookAt(camera.position, station.camLook, new THREE.Vector3(0, 1, 0));
    camera.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(m), Math.min(1, dt * 5));
    camera.updateMatrixWorld();
    const r = station.update(dt, camera, st.pointer, st.action, 2.6 * (1 + 0.15 * has(save, "coffee")), doneAt(save));
    audio.loop("tap", 1);
    audio.loop("scrub", station.scrubbing ? 1 : 0, 1.2);
    if (station.lastHit && Math.random() < 0.5) fx.emit("suds", station.lastHit, 1, new THREE.Vector3(0, 0.3, 0), 0.3);
    if (r.finished) {
      ledger.bonus("dish", PAY.dish);
      save.run.progress.dishes = station.done();
      audio.shot("done");
      fx.emit("spark", r.finished.mesh.position, 14, new THREE.Vector3(0, 0.6, 0), 0.8);
      hud.dishes(station.left(), exitDishes);
      if (!station.left()) { hud.toast("Увесь посуд чистий!", "good"); setTimeout(() => { if (mode === "dishes") exitDishes(); }, 900); }
    }
    if (tick(save, dt)) { exitDishes(); dayOver(); }
  }
  input.consume();
  // world updates
  if (yard) {
    yard.tick(t, dt);
    yard.lawn.update(camera.position, t, Q.lod);
    // ~3 pixels at 1 m, for the grass width floor
    Lawn.pix.value = (3.0 * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(200, renderer.domElement.height);
    jobs.update(dt, t, new THREE.Vector3(player.pos.x, player.feet, player.pos.z));
    gates.update(dt);
    if (has(save, "kid") && Math.random() < dt * 1.2 * has(save, "kid")) {
      const f = yard.leaves.find((x) => x.active > 0);
      if (f) {
        const n = f.steal(2);
        ledger.bonus(f.key, n * PAY.leaf);
        save.run.progress[f.key] = f.share();
      }
    }
  }
  for (const s of W.surfaces) s.update(t, dt);
  fx.update(dt, camera);
  sunUpdate();
  hudUpdate(dt);
  saveT += dt;
  if (saveT > 5) { saveT = 0; persist(); }
}

function work(dt: number, held: boolean, pressed: boolean, stats: ReturnType<typeof toolStats> & object): void {
  const T = TOOLS[tool];
  let label = tool === "washer" && sprayOn ? "Стоп" : ACTION_LABEL[tool];
  let style: "" | "gold" | "dim" | "on" = tool === "washer" && sprayOn ? "on" : "";
  let want: ToolId | null = null;
  let target: TargetInfo | null = null;
  let prompt: string | null = null;
  let holdFrac = -1;
  let cross: "" | "ok" | "no" = "";
  let using = false;
  const eye = camera.position;

  // Interactable first.
  if (aimInter) {
    const it = aimInter;
    label = it.kind === "pick" ? "Підняти" : it.kind === "fix" ? "Латати" : it.kind === "dish" ? "Мити посуд" : it.kind === "ladder" ? "Лізти" : it.kind === "chem" ? "Хімія" : "Взяти";
    style = "gold";
    prompt = it.label();
    cross = "ok";
    if (held) {
      holdT += dt;
      holdFrac = it.hold > 0 ? Math.min(1, holdT / it.hold) : 1;
      if (holdT >= it.hold && (it.hold > 0 || pressed)) {
        it.act();
        holdT = -999;
      }
    } else {
      holdT = 0;
    }
    hudSet(label, style, null, target, prompt, holdFrac, cross);
    toolEffects(false, dt, null, null);
    return;
  }
  holdT = 0;

  // Surfaces under the crosshair.
  if (aimSurface && aimHit) {
    const s = aimSurface;
    const inRange = aimHit.distance <= Math.max(T.levels[0].range, stats.range) + 0.01;
    const right = T.works.includes(s.kind);
    target = { name: s.name, pct: s.share(), value: s.value };
    const surfaceTool = tool === "washer" || tool === "mop" || tool === "squeegee" || tool === "hands" || tool === "paint";
    if (!right && !s.done && surfaceTool) {
      want = needTool(s.kind);
      target.need = save.tools[want] ? `Потрібно: ${TOOLS[want].short}` : `Потрібно: ${TOOLS[want].name} (у гаражі)`;
      if (save.tools[want]) { label = `Взяти: ${TOOLS[want].short}`; style = "dim"; if (pressed) { tool = want; audio.shot("click"); } }
      cross = "no";
    } else if (right && !inRange && !s.done) {
      target.need = "Підійди ближче";
      cross = "no";
    } else if (right && !s.done) {
      cross = "ok";
    }
  }
  // Non-surface tools: lawn, leaves, pool, detector.
  if (tool === "mower") {
    const zi = LAWN_ZONES.findIndex((_, i) => yard.lawn.zones[i].total > 0 && Math.abs(player.pos.z) > 0); // keep hint simple
    void zi;
    const z = player.pos.z > HOUSE.halfZ + 0.3 ? 0 : player.pos.z < -HOUSE.halfZ - 0.3 ? 1 : 2;
    target = { name: LAWN_ZONES[z].name, pct: yard.lawn.share(z), value: rows.find((r) => r.key === LAWN_ZONES[z].key)?.value ?? 0 };
  }

  if (held) {
    switch (tool) {
      case "washer":
      case "mop":
      case "squeegee":
      case "hands":
      case "paint": {
        if (aimSurface && aimHit && T.works.includes(aimSurface.kind) && aimHit.distance <= stats.range + 0.01) {
          const wide = tool === "washer" && nozzleWide;
          const r = stats.radius * (wide ? 1.7 : 1);
          const a = stats.rate * (wide ? 0.55 : 1) * dt;
          let did = 0;
          if (tool === "paint") {
            did = aimSurface.brush(aimHit.point, r, a * 1.3, "scrape", t);
            if (did > 0.01) { lastPaintMode = "scrape"; if (Math.random() < 0.6) fx.emit("chip", aimHit.point, 1, aimSurface.normal.clone().multiplyScalar(0.6), 0.8); }
            else {
              did = aimSurface.brush(aimHit.point, r, a, "paint", t);
              if (did > 0) lastPaintMode = "paint";
            }
          } else {
            did = aimSurface.brush(aimHit.point, r, a, "clean", t);
            if (did > 0 && tool !== "washer" && Math.random() < 0.5) fx.emit("suds", aimHit.point, 1, aimSurface.normal.clone().multiplyScalar(0.2), 0.3);
            if (did > 0 && tool === "washer" && Math.random() < 0.3) fx.emit("dust", aimHit.point, 1, aimSurface.normal.clone().multiplyScalar(0.8), 0.6);
          }
          if (did > 0) dirtyReport.add(aimSurface);
        }
        using = true;
        break;
      }
      case "mower": {
        const ahead = mowerAhead();
        const c = new THREE.Vector3(player.pos.x + player.forward.x * ahead, 0, player.pos.z + player.forward.z * ahead);
        const cut = yard.lawn.mow(c.x, c.z, stats.radius, player.forward.x, player.forward.z);
        const total = cut.reduce((a, b) => a + b, 0);
        if (total > 0) {
          fx.emit("clip", c.clone().setY(0.15), Math.min(6, total), new THREE.Vector3(-player.forward.x * 0.5, 1.6, -player.forward.z * 0.5), 1.5);
          cut.forEach((n, zi) => { if (n) reportLawn(zi); });
        }
        using = true;
        break;
      }
      case "leaves": {
        const reach = stats.range;
        let p: THREE.Vector3 | null = null;
        if (aimHit && aimHit.distance <= reach && aimHit.point.y < HOUSE.floorY + 0.3) p = aimHit.point.clone();
        if (!p) {
          // aim at the ground in front
          p = new THREE.Vector3(player.pos.x + player.forward.x * Math.min(reach, 1.8), player.feet, player.pos.z + player.forward.z * Math.min(reach, 1.8));
        }
        const mouth = (vms.blower?.visible || vms.rake?.visible) ? eye.clone().add(new THREE.Vector3(0, -0.6, 0)).addScaledVector(player.forward, 0.4) : eye.clone();
        for (const f of yard.leaves) {
          const n = f.collect(p, stats.radius, stats.rate, dt, mouth);
          if (n) {
            ledger.bonus(f.key, n * PAY.leaf);
            save.run.progress[f.key] = f.share();
            if (save.tools.leaves === 1 && Math.random() < 0.3) audio.shot("rake");
          }
        }
        using = true;
        break;
      }
      case "net": {
        const o = ray.ray.origin, d = ray.ray.direction;
        if (d.y < -0.05) {
          const k = (POOL.water - o.y) / d.y;
          const p = o.clone().addScaledVector(d, k);
          if (k <= stats.range + 0.5 && p.x > POOL.x0 && p.x < POOL.x1 && p.z > POOL.z0 && p.z < POOL.z1) {
            const n = yard.poolLeaves.collect(p, stats.radius, stats.rate, dt, eye.clone().add(new THREE.Vector3(0, -0.4, 0)));
            if (n) {
              ledger.bonus(yard.poolLeaves.key, n * PAY.poolLeaf);
              save.run.progress[yard.poolLeaves.key] = yard.poolLeaves.share();
              fx.emit("water", p, 3, new THREE.Vector3(0, 1.2, 0), 1);
              if (Math.random() < 0.3) audio.shot("splash");
            }
          }
        }
        using = true;
        break;
      }
      case "detector": {
        const coil = new THREE.Vector3(player.pos.x + player.forward.x * 1.1, 0, player.pos.z + player.forward.z * 1.1);
        const nb = jobs.nearestBuried(coil);
        if (nb && nb.d < 0.9) {
          digT += dt * stats.rate;
          holdFrac = Math.min(1, digT / 1.2);
          prompt = "Копаю…";
          if (Math.random() < 0.4) fx.emit("dust", coil.clone().setY(0.05), 2, new THREE.Vector3(0, 1.4, 0), 1.2);
          if (digT >= 1.2) {
            jobs.dig(coil);
            digT = 0;
          }
        } else {
          prompt = "Тут нічого не пищить";
          digT = 0;
        }
        using = true;
        break;
      }
    }
  } else {
    digT = 0;
  }

  if (tool === "detector") {
    const coil = new THREE.Vector3(player.pos.x + player.forward.x * 1.1, 0, player.pos.z + player.forward.z * 1.1);
    const nb = jobs.nearestBuried(coil);
    const range = stats.range;
    const close = nb ? Math.max(0, 1 - nb.d / range) : 0;
    beepT -= dt;
    if (close > 0 && beepT <= 0) { audio.shot("beep", close); beepT = 1.1 - close * 1.0; }
    let arrow: number | null = null;
    if (nb && stats.level >= 2 && close > 0) {
      const rel = Math.atan2(nb.dir.x, -nb.dir.z) - Math.atan2(player.forward.x, -player.forward.z);
      arrow = (rel * 180) / Math.PI;
    }
    hud.detector(close, arrow, close > 0.85 ? "копай тут!" : close > 0.5 ? "гаряче" : close > 0.15 ? "тепліше" : "тихо");
    if (!held && close > 0.85) prompt = "Тримай кнопку — копати";
  } else {
    hud.detector(null);
  }

  // Pay for surfaces a few times a second.
  paidT += dt;
  if (paidT > 0.2) {
    paidT = 0;
    for (const s of dirtyReport) ledger.report(s.key, s.value, s.share());
    dirtyReport.clear();
  }

  if (tool === "washer") hud.setMode(nozzleWide ? "Сопло 40°" : "Сопло 15°");
  else hud.setMode(null);
  hudSet(label, style, want, target, prompt, holdFrac, cross);
  toolEffects(using, dt, stats, held);
}

function reportLawn(zi: number): void {
  const row = rows.find((r) => r.key === LAWN_ZONES[zi].key);
  if (row) ledger.report(row.key, row.value, yard.lawn.share(zi));
}

function hudSet(label: string, style: "" | "gold" | "dim" | "on", want: ToolId | null, target: TargetInfo | null, prompt: string | null, hold: number, cross: "" | "ok" | "no"): void {
  hud.setAction(label, style);
  hud.setTools(save, tool, want);
  hud.setTarget(target);
  hud.setPrompt(prompt, hold);
  const st = toolStats(save, tool);
  hud.setCrosshair(cross, tool === "washer" || tool === "mop" || tool === "paint" || tool === "squeegee" ? 0.8 + (st?.radius ?? 0.2) * 2 : 1);
}

// ── Tool visuals & sounds ───────────────────────────────────────────────────
let swayX = 0, swayY = 0, useAnim = 0;
function toolEffects(using: boolean, dt: number, stats: ReturnType<typeof toolStats> | null, held: boolean | null): void {

  const key = mode === "play" ? vmKey() : null;
  swayX = THREE.MathUtils.lerp(swayX, -input.state.look.x * 0.0004, 0.2);
  swayY = THREE.MathUtils.lerp(swayY, input.state.look.y * 0.0004, 0.2);
  useAnim += dt * (using ? 9 : 0);
  for (const [k, o] of Object.entries(vms)) {
    if (!o) continue;
    o.visible = k === key;
    if (!o.visible) continue;
    const c = VMS[k];
    const bob = Math.sin(t * 7) * 0.006 * player.moving;
    const pole = POLE_TOOLS[k];
    if (pole) {
      const sw = using ? Math.sin(useAnim) * (k === "detector" ? 0.35 : 0.12) : Math.sin(t * 1.3) * 0.03;
      const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
      o.position.set(player.pos.x, player.feet + player.eye - pole.drop + bob, player.pos.z)
        .addScaledVector(player.forward, pole.ahead + (k === "mop" && using ? Math.sin(useAnim) * 0.12 : 0))
        .addScaledVector(right, pole.side);
      o.rotation.set(0, 0, 0);
      o.rotateY(player.yaw + sw);
      o.rotateX(THREE.MathUtils.clamp(player.pitch * pole.tilt, -0.3, 0.25) + (k === "mop" || k === "rake" ? 0.13 : 0));
      continue;
    }
    const scrub = using && ["rag", "mop", "squeegee", "roller", "scraper", "rake"].includes(k) ? Math.sin(useAnim) * 0.035 : 0;
    const kick = using && k === "washer" ? Math.sin(t * 60) * 0.0015 : 0;
    o.position.set(c.pos[0] + swayX + scrub, c.pos[1] + swayY + bob + kick + (k === "rake" ? Math.abs(scrub) : 0), c.pos[2] + (k === "mop" ? scrub : 0));
    o.rotation.set(c.rot[0], c.rot[1], c.rot[2]);
  }
  // The mower is pushed ahead of you, its handle just in front of your hands.
  // It's drawn with the tools in hand (on top of the grass, which would hide
  // it) and lifted a little while you look ahead so the handle and engine are
  // in view; looking down, it sits right on the ground.
  if (mower) {
    mower.visible = mode === "play" && tool === "mower";
    if (mower.visible) {
      mower.scale.setScalar(mowerScale());
      const ahead = mowerAhead();
      const lift = 0.24 * THREE.MathUtils.clamp((player.pitch + 0.75) / 0.75, 0, 1);
      mower.position.set(player.forward.x * ahead, player.feet - camera.position.y + lift + (using ? Math.sin(t * 40) * 0.004 : 0), player.forward.z * ahead);
      mower.rotation.set(0, player.yaw + Math.PI, 0);
      mower.updateMatrixWorld();
    }
  }
  // washer jet
  jet.active = mode === "play" && tool === "washer" && !!held;
  if (jet.active) {
    const tip = vms.washer?.getObjectByName("washer_tip");
    syncVmCamera();
    // vm space is world space shifted to the eye
    const from = tip ? tip.getWorldPosition(new THREE.Vector3()).add(camera.position) : camera.position.clone();
    const reach = stats?.range ?? 4.5;
    const to = aimHit && aimHit.distance <= reach ? aimHit.point.clone() : ray.ray.origin.clone().addScaledVector(ray.ray.direction, reach);
    const n = aimHit?.face ? aimHit.face.normal.clone().transformDirection(aimHit.object.matrixWorld) : null;
    jet.update(dt, from, to, n, (stats?.radius ?? 0.2) * (nozzleWide ? 1.7 : 1));
  } else {
    jet.update(dt, camera.position, camera.position, null, 0);
  }
  // sounds
  const playing = mode === "play";
  audio.loop("washer", playing && tool === "washer" && !!held ? 1 : 0, nozzleWide ? 0.9 : 1.05);
  audio.loop("mower", playing && tool === "mower" ? (held ? 1 : 0.35) : 0, held ? 1.15 : 0.8);
  audio.loop("vacuum", playing && tool === "leaves" && save.tools.leaves > 1 && !!held ? 1 : 0, 1);
  audio.loop("scrub", playing && !!held && (tool === "mop" || tool === "hands" || tool === "squeegee" || (tool === "paint" && lastPaintMode === "scrape")) && cleaningNow() ? 1 : 0, tool === "squeegee" ? 1.6 : 1);
  audio.loop("roller", playing && !!held && tool === "paint" && lastPaintMode === "paint" ? 1 : 0);
  if (mode !== "dishes") audio.loop("tap", 0);
}
function cleaningNow(): boolean {
  return !!(aimSurface && aimHit && TOOLS[tool].works.includes(aimSurface.kind));
}

// ── Sun ─────────────────────────────────────────────────────────────────────
function sunUpdate(): void {
  // A sunset that lasts the whole working day: the sun hangs just above the
  // horizon (where the sky panorama has it) and only sinks a little and turns
  // redder toward the evening. Long shadows, orange light.
  const c = clock(save);
  const k = Math.min(1, Math.max(0, c.sun));
  const el = THREE.MathUtils.lerp(0.24, 0.13, k);
  const dir = new THREE.Vector3(Math.sin(SUN_AZ) * Math.cos(el), Math.sin(el), Math.cos(SUN_AZ) * Math.cos(el));
  const focus = new THREE.Vector3(Math.round(player.pos.x / 2) * 2, 0, Math.round(player.pos.z / 2) * 2);
  sun.position.copy(focus).addScaledVector(dir, 60);
  const fk = `${focus.x},${focus.z}`;
  if (fk !== shadowFocus) { shadowFocus = fk; renderer.shadowMap.needsUpdate = true; }
  sun.target.position.copy(focus);
  sun.color.setRGB(1, THREE.MathUtils.lerp(0.58, 0.48, k), THREE.MathUtils.lerp(0.28, 0.2, k));
  sun.intensity = THREE.MathUtils.lerp(5.0, 4.3, k);
  scene.environmentIntensity = THREE.MathUtils.lerp(0.6, 0.5, k);
  sky?.update(camera.position, dir, THREE.MathUtils.lerp(0.95, 0.8, k));
  atmos.sunDir.value.copy(dir);
  atmos.sunColor.value.copy(sun.color).multiplyScalar(sun.intensity / 4.5);
  // skip drawing the rooms when you're well away from the house
  const near = Math.abs(player.pos.x) < HOUSE.halfX + 5 && Math.abs(player.pos.z) < HOUSE.halfZ + 5;
  interior.visible = near || mode === "dishes";
  // indoor light follows you inside the house
  const inside = Math.abs(player.pos.x) < HOUSE.halfX && Math.abs(player.pos.z) < HOUSE.halfZ && !player.onRoof;
  roomLight.intensity = THREE.MathUtils.lerp(roomLight.intensity, inside ? 7 : 0, 0.1);
  roomLight.position.set(player.pos.x, HOUSE.floorY + 2.4, player.pos.z);
}

// ── Stages ──────────────────────────────────────────────────────────────────
let gates: Gates;
let stage = 0;
let stageT = 0;
let bumpT = 0;
function stageRows() {
  return rows.map((r) => ({ key: r.key, value: r.value, share: r.share() }));
}
function stageNow(): number {
  return currentStage(stageRows());
}
function stageUpdate(dt: number, moving: boolean): void {
  stageT -= dt;
  bumpT -= dt;
  if (stageT <= 0) {
    stageT = 0.4;
    const rs = stageRows();
    const next = currentStage(rs);
    if (next > stage) {
      const opened = STAGES.slice(stage + 1, next + 1).map((s) => s.name);
      stage = next;
      gates.advance(stage);
      hud.stageFlash();
      audio.shot("done");
      hud.toast(next >= STAGES.length ? "Усю хату відкрито!" : `Етап готово! Відкрито: ${opened.join(", ")}`, "good");
    }
    const cur = STAGES[stage];
    hud.stage(stage, STAGES.length, cur?.name ?? "", cur ? stageShare(cur, rs) : 1, STAGE_DONE);
  }
  if (moving && bumpT <= 0 && stage < STAGES.length && gates.closedNear(player.pos, 0.75)) {
    bumpT = 5;
    const cur = STAGES[stage];
    const pct = Math.floor(stageShare(cur, stageRows()) * 100);
    hud.toast(`Закрито. Спершу доробіть «${cur.name}»: ${pct}% із ${Math.round(STAGE_DONE * 100)}%`);
  }
}

// ── HUD ─────────────────────────────────────────────────────────────────────
let lastMoney = -1;
function hudUpdate(dt: number): void {
  hud.update(dt);
  if (Math.floor(save.money) !== lastMoney) { lastMoney = Math.floor(save.money); hud.setMoney(save.money); }
  const c = clock(save);
  hud.setClock(c.label, save.run.day, DAY.deadline, save.run.time / dayLength(save));
}

let rendering = false;
function render(): void {
  if (!rendering) return;
  sky?.mesh.position.copy(camera.position);
  if ((shadowTick++ & 1) === 0 || still) renderer.shadowMap.needsUpdate = true;
  if (composer) composer.render();
  else renderer.render(scene, camera);
  renderViewmodel();
  window.__hata.frames++;
}

/** The tool in hand, on top of everything (see vmScene). */
function renderViewmodel(): void {
  if (!vmRoot.children.some((o) => o.visible) && !mower?.visible) return;
  syncVmCamera();
  vmSun.color.copy(sun.color);
  vmSun.intensity = sun.intensity;
  vmSun.position.copy(sun.position).sub(sun.target.position).normalize().multiplyScalar(2);
  vmHemi.color.copy(hemi.color);
  vmHemi.groundColor.copy(hemi.groundColor);
  vmHemi.intensity = hemi.intensity;
  vmRoom.intensity = roomLight.intensity;
  vmRoom.position.copy(roomLight.position).sub(camera.position);
  vmScene.environment = scene.environment;
  vmScene.environmentIntensity = scene.environmentIntensity;
  vmScene.environmentRotation.copy(scene.environmentRotation);
  const auto = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(null);
  renderer.clearDepth();
  renderer.render(vmScene, vmCam);
  renderer.autoClear = auto;
}

// ── Test hooks (used by the offline renders and the scripted checks) ───────
Object.assign(window.__hata, {
  player, W, setTool: (v: ToolId) => { tool = v; }, getTool: () => tool, spray: () => sprayOn,
  setMode: (m: Mode) => { mode = m; },
  play: startPlay,
  /** Runs the game for `sec` seconds at 30 fps with the action held (or not). */
  simulate: (sec: number, hold = true, move: [number, number] = [0, 0], look: [number, number] = [0, 0]) => {
    const n = Math.round(sec * 30);
    const forced = tool === "washer" && hold && !sprayOn;
    if (forced) sprayOn = true;
    for (let i = 0; i < n; i++) {
      input.setAction(hold);
      (input as unknown as { joyVec: { x: number; y: number } }).joyVec = { x: move[0], y: move[1] };
      input.state.look.x += look[0];
      input.state.look.y += look[1];
      update(1 / 30);
    }
    input.setAction(false);
    if (forced) sprayOn = false;
    (input as unknown as { joyVec: { x: number; y: number } }).joyVec = { x: 0, y: 0 };
  },
  teleport: (x: number, z: number, yaw: number, pitch = 0, roof = false) => {
    player.onRoof = roof;
    player.place(x, z, yaw, roof ? roofAt(x, z) ?? 0 : W.groundAt(x, z, 2));
    player.pitch = pitch;
    player.applyCamera(camera);
    camera.updateMatrixWorld();
  },
  vms, overall, houseValue, rows: () => rows.map((r) => ({ key: r.key, name: r.name, value: r.value, pct: r.share() })),
  dishes: () => station, enterDishes, exitDishes,
  capture: () => { render(); return renderer.domElement.toDataURL("image/jpeg", 0.88); },
  scene,
  info: () => {
    renderer.info.autoReset = false;
    renderer.info.reset();
    render();
    renderer.info.autoReset = true;
    const r = renderer.info.render;
    return { calls: r.calls, tris: r.triangles, progs: renderer.info.programs?.length };
  },
  highlight: (on: boolean) => { highlight = on; grimeGlobals.highlight.value = on ? 1 : 0; },
  setTime: (sec: number) => { save.run.time = sec; },
  dayOver, handOver: handOverNow, getStage: () => stage, getMode: () => mode,
  rng,
});

boot().catch((e) => {
  console.error(e);
  const msg = e instanceof Error ? e.message : e instanceof Event ? `Не вдалося завантажити ${(e.target as HTMLImageElement | null)?.src ?? "файл"}` : String(e);
  window.__hata.error = msg;
  const box = document.createElement("div");
  box.className = "ov";
  box.style.zIndex = "60";
  box.innerHTML = `<div class="panel" style="width:min(460px,100%)"><div class="eyebrow">ОЙ</div><h2>Подвір'я не завантажилось</h2>
    <p>Схоже, інтернет підвів або сайт саме оновлюється. Спробуй ще раз за хвилинку.</p><p style="font-size:12px;opacity:.7">${msg.replace(/</g, "&lt;")}</p>
    <div class="btns"><button class="btn primary" id="retry">Спробувати ще</button></div></div>`;
  document.body.appendChild(box);
  box.querySelector("#retry")!.addEventListener("click", () => location.reload());
});
