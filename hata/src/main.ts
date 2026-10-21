import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { hdri, setAnisotropy } from "./assets";
import { buildHouse, HOUSE } from "./world/house";
import { buildYard, placeProps, POOL, HAY } from "./world/yard";
import { addCleanZone } from "./world/grime";
import { blenderTool, detector, spray } from "./tools";

/**
 * «Хата з краю» — prototype runtime. For now it builds the whole plot and
 * frames one of the concept shots (?shot=mow|wash|backyard|living|kitchen|
 * roof|find|aerial). Free look with WASD + mouse drag on desktop.
 */

declare global {
  interface Window {
    __hata: { ready: boolean; renderer?: THREE.WebGLRenderer; frames: number; error?: string; capture?: () => string };
  }
}
window.__hata = { ready: false, frames: 0 };

const params = new URLSearchParams(location.search);
const shot = params.get("shot") ?? "mow";
const density = Number(params.get("grass") ?? 160);

const view = document.getElementById("view")!;
const still = params.has("still");
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: still });
renderer.setPixelRatio(Math.min(devicePixelRatio, Number(params.get("dpr") ?? 2)));
renderer.setSize(view.clientWidth, view.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = Number(params.get("exp") ?? 0.95);
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);
setAnisotropy(renderer.capabilities.getMaxAnisotropy());
window.__hata.renderer = renderer;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, view.clientWidth / view.clientHeight, 0.03, 400);
scene.add(camera);

interface Shot {
  pos: [number, number, number];
  look: [number, number, number];
  fov?: number;
  sun?: [number, number, number];
  mowed?: (x: number, z: number) => number;
  stripe?: (x: number, z: number) => boolean;
  setup?: () => Promise<void>;
  exposure?: number;
}

const lane = 0.55;
const SHOTS: Record<string, Shot> = {
  mow: {
    pos: [-6.3, 1.55, 19.2],
    look: [-4.6, 0.0, 15.6],
    fov: 55,
    mowed: (x, z) => (x < -6.6 && z > 7 && z < 22.5 ? 1 : 0),
    stripe: (x) => Math.floor(x / lane) % 2 === 0,
    setup: async () => {
      // The mower stands on the lawn, handle half a metre in front of the player.
      const m = await blenderTool("mower");
      const [px, , pz] = S.pos, [lx, , lz] = S.look;
      const d = new THREE.Vector3(lx - px, 0, lz - pz).normalize();
      m.position.set(px + d.x * 1.55, 0, pz + d.z * 1.55);
      m.rotation.y = Math.atan2(-d.x, -d.z) + Math.PI;
      scene.add(m);
      addCleanZone({ x: -7.2, y: 0.4, z: 5.0 }, { x: -3.8, y: 1.7, z: 5.6 }, 0.0, 0.2);
    },
  },
  wash: {
    pos: [10.4, 1.62, 1.6],
    look: [7.1, 1.3, 0.6],
    fov: 50,
    setup: async () => {
      // already-washed band and the area under the jet, wet
      addCleanZone({ x: 6.8, y: 0.45, z: 1.0 }, { x: 7.5, y: 1.75, z: 4.95 }, 0.55, 0.18);
      addCleanZone({ x: 6.8, y: 1.75, z: 2.6 }, { x: 7.5, y: 2.4, z: 4.95 }, 0.3, 0.18);
      addCleanZone({ x: 6.8, y: 0.45, z: -0.2 }, { x: 7.5, y: 1.2, z: 1.0 }, 0.9, 0.22);
      addCleanZone({ x: 9.6, y: -0.2, z: 1.2 }, { x: 12.6, y: 0.2, z: 3.8 }, 0.8, 0.25);
      const gun = await blenderTool("washer");
      gun.position.set(0.16, -0.3, -0.12);
      gun.rotation.set(-0.06, 0.3, 0);
      camera.add(gun);
      camera.updateMatrixWorld(true);
      const tip = gun.getObjectByName("washer_tip")!.getWorldPosition(new THREE.Vector3());
      scene.add(spray(tip, new THREE.Vector3(7.12, 1.0, 0.55)));
    },
  },
  backyard: {
    pos: [6.6, 2.05, -6.4],
    look: [-3.5, 0.0, -14.0],
    fov: 55,
  },
  living: {
    pos: [0.4, 1.6, 1.0],
    look: [-5.4, 1.1, 4.6],
    fov: 60,
    exposure: 1.15,
    setup: async () => {
      addCleanZone({ x: -2.0, y: 0.3, z: 0.2 }, { x: 0.9, y: 0.6, z: 1.6 }, 0.0, 0.25);
    },
  },
  kitchen: {
    pos: [1.6, 1.6, 1.0],
    look: [6.6, 1.0, 3.6],
    fov: 60,
    exposure: 1.15,
  },
  roof: {
    pos: [-4.2, HOUSE.floorY + HOUSE.wallH + 2.3, 1.7],
    look: [2.5, HOUSE.floorY + HOUSE.wallH + 0.6, 4.6],
    fov: 55,
  },
  find: {
    pos: [7.0, 1.6, -12.4],
    look: [HAY.x, 0.6, HAY.z],
    fov: 52,
    setup: async () => {
      const d = await detector();
      d.position.set(0.15, -1.25, -1.0);
      d.rotation.set(0.25, Math.PI / 2 + 0.25, 0);
      camera.add(d);
    },
  },
  aerial: {
    pos: [24, 24, 30],
    look: [0, 0, -2],
    fov: 42,
    mowed: () => 0,
  },
};
const S = SHOTS[shot] ?? SHOTS.mow;

async function boot(): Promise<void> {
  const { env, background } = await hdri(renderer, "kloofendal_48d_partly_cloudy_puresky");
  scene.environment = env;
  scene.background = background;
  scene.backgroundIntensity = 0.85;
  scene.environmentIntensity = 0.85;
  scene.fog = new THREE.Fog(0xc6d4da, 45, 160);

  const sunDir = new THREE.Vector3(...(S.sun ?? [-0.55, 0.62, 0.55])).normalize();
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.4);
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // warm bounce inside the rooms (no shadows)
  for (const [x, z] of [[-3.5, 2.5], [4, 2.5], [-3.5, -2.5], [5, -2.5]]) {
    const l = new THREE.PointLight(0xffe2bd, 2.2, 7, 1.6);
    l.position.set(x, HOUSE.floorY + 2.2, z);
    scene.add(l);
  }

  await S.setup?.();
  const [house, yard] = await Promise.all([
    buildHouse(),
    buildYard({
      mowed: S.mowed ?? (() => 0), stripe: S.stripe, grassDensity: density,
      focus: S.pos[1] < 3 ? { x: S.pos[0], z: S.pos[2], r: Number(params.get("ring") ?? 11), density: Number(params.get("ringd") ?? 700) } : undefined,
    }),
  ]);
  scene.add(house.group, yard.group);
  await placeProps(scene);

  camera.fov = S.fov ?? 50;
  camera.position.set(...S.pos);
  camera.lookAt(...S.look);
  camera.updateProjectionMatrix();
  if (S.exposure) renderer.toneMappingExposure = S.exposure;

  const w = view.clientWidth, h = view.clientHeight;
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, w, h);
  ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 16 });
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.12, 0.4, 0.92));
  composer.addPass(new OutputPass());

  // Desktop free look for development.
  const keys = new Set<string>();
  addEventListener("keydown", (e) => keys.add(e.code));
  addEventListener("keyup", (e) => keys.delete(e.code));
  let yaw = 0, pitch = 0;
  {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    yaw = e.y; pitch = e.x;
  }
  let drag: { x: number; y: number } | null = null;
  renderer.domElement.addEventListener("pointerdown", (e) => (drag = { x: e.clientX, y: e.clientY }));
  addEventListener("pointerup", () => (drag = null));
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    yaw -= (e.clientX - drag.x) * 0.004;
    pitch = Math.max(-1.4, Math.min(1.4, pitch - (e.clientY - drag.y) * 0.004));
    drag = { x: e.clientX, y: e.clientY };
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  });

  const clock = new THREE.Clock();
  const frame = (): void => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = Number(params.get("t") ?? clock.elapsedTime);
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const sp = (keys.has("ShiftLeft") ? 6 : 2.5) * dt;
    if (keys.has("KeyW")) camera.position.addScaledVector(f, sp);
    if (keys.has("KeyS")) camera.position.addScaledVector(f, -sp);
    if (keys.has("KeyD")) camera.position.addScaledVector(r, sp);
    if (keys.has("KeyA")) camera.position.addScaledVector(r, -sp);
    yard.tick(t);
    composer.render();
    window.__hata.frames++;
    if (still) {
      // offline capture: one warm-up frame (shader compile, shadow map), then stop
      if (window.__hata.frames >= 2) {
        window.__hata.capture = () => renderer.domElement.toDataURL("image/png");
        window.__hata.ready = true;
        return;
      }
      setTimeout(frame, 0);
      return;
    }
    if (window.__hata.frames === 3) window.__hata.ready = true;
    requestAnimationFrame(frame);
  };
  frame();
  addEventListener("resize", () => {
    camera.aspect = view.clientWidth / view.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(view.clientWidth, view.clientHeight);
    composer.setSize(view.clientWidth, view.clientHeight);
  });
}

boot().catch((e) => {
  console.error(e);
  window.__hata.error = String(e?.stack ?? e);
  document.body.insertAdjacentHTML("beforeend", `<pre style="color:#f88;position:fixed;top:0;left:0">${String(e?.stack ?? e)}</pre>`);
});

export { POOL };
