import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  C, CAMO_GUARD, CAMO_TCK, LOOKS, animateRig, at, camoTexture, facadeTextures, garageTexture, makeBench, makeBush, makeCar, makeDog,
  makeDrone, makeHouse, makeKennel, makeLamp, makePerson, makePine, makeStall, makeTrashBins, makeTree, makeVan, mat, mesh, outline, roofTexture,
  type Rig,
} from "../../rozshuk/src/three/models.ts";
import { Post, defaultQuality, glowMat, lightPoolMaterial, type Mood, type Quality } from "../../stiny/src/three/post.ts";
import {
  groundTexture, makeBillboard, makeBoom, makeBranch, makeCart, makeConcrete, makeCones, makeCrates, makeGeese, makeGuardRail, makeHay, makeHedgehogs, makeKiosk,
  makeLada, makeLaundry, makeLog, makeLorry, makeLowFence, makeManhole, makeMarshrutka, makePolice, makePothole, makePowerPole, makePowerup, makePuddle,
  makeRoadworks, makeScaffold, makeSignBoard, makeSpikes, makeSpot, makeTractor, roadTexture,
} from "./three/props.ts";
import { PICKUPS, STAGES, traitById, type Chaser, type PickId, type StageDef, type Theme } from "./content.ts";
import { roadHalf, type Ev, type Obj, type RunState, type Stage } from "./sim.ts";

/**
 * The 3D world of «Тікай!». The simulation runs along +z with lanes on x; the
 * camera sits behind the hero looking down the road. Sim x is mirrored (`wx`)
 * so that "right" in the sim is right on screen.
 *
 * The scenery is nine prebuilt 40 m tiles per stage, baked into one mesh per
 * material and leap-frogged forward as you run. Things on the road are cloned
 * from per-kind templates and pooled.
 */

const TILE = 40;
const NT = 9;
const wx = (x: number) => -x;

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Ink outlines on every mesh of a loaded model (collected first: outlines are meshes too). */
function inkAll(root: THREE.Object3D): void {
  const list: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) list.push(o as THREE.Mesh); });
  for (const m of list) outline(m, 0.012);
}

interface Live { obj: THREE.Object3D; key: string; seen: number; rig?: Rig; t0: number }

const GOAL_SIGN: Record<string, string> = {
  yard: "ПІДЗЕМНИЙ ПЕРЕХІД", market: "ПАРКОВКА", road: "ЗАЇЗД У СЕЛО", village: "ПОЛЕ · ТРАКТОР", checkpoints: "ЛІСОВА ДОРОГА", forest: "РІЧКА",
};
const BILLBOARDS: [string, string, string][] = [
  ["ШИНОМОНТАЖ 24/7", "#f2b632", "#171318"], ["КАВА 2 КМ →", "#2a2a2a", "#f2b632"], ["ВАРЕНИКИ В ДОРОГУ", "#e7ddc6", "#c83a32"],
  ["ПРИСТЕБНИСЬ!", "#2b5aa8", "#ffffff"], ["АВТОМИЙКА · ШАУРМА", "#d63732", "#ffffff"], ["КРЕДИТ ЗА 5 ХВ", "#3a8a4a", "#ffffff"],
];

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  readonly post: Post;
  private world = new THREE.Group();
  private tiles: THREE.Group[] = [];
  private tileZ: number[] = [];
  private live = new Map<number, Live>();
  private pools = new Map<string, THREE.Object3D[]>();
  private templates = new Map<string, THREE.Object3D>();
  private frame = 0;
  private time = 0;
  private hemi = new THREE.HemisphereLight(0xdfefff, 0x5a4a30, 1.2);
  private sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  private torch = new THREE.PointLight(0xffe2b0, 0, 24, 1.4);
  private head = new THREE.SpotLight(0xfff2c8, 0, 60, 0.55, 0.5, 1.2);
  private hero: Rig | null = null;
  private heroExtras: { scooter: THREE.Object3D; hood: THREE.Object3D; aura: THREE.Object3D } | null = null;
  private vehicle: THREE.Group | null = null;
  private chasers: Rig[] = [];
  private chaseCars: THREE.Group[] = [];
  private chaseVan: THREE.Group | null = null;
  private torches: THREE.Mesh[] = [];
  private def: StageDef = STAGES[0];
  private shake = 0;
  private fovKick = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private lean = 0;
  private lastX = 0;
  private heroLook = traitById("it").look;
  private kenney: { trucks: THREE.Object3D[]; moto: THREE.Object3D | null; forest: THREE.Object3D | null; coin: THREE.Object3D | null; cloud: THREE.Object3D | null; flag: THREE.Object3D | null } =
    { trucks: [], moto: null, forest: null, coin: null, cloud: null, flag: null };
  private camoTck = camoTexture(CAMO_TCK, 5);
  private camoGuard = camoTexture(CAMO_GUARD, 9);
  /** Babusias that are on the phone now. */
  private calling = new Set<number>();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.domElement.id = "gl";
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.prepend(this.renderer.domElement);
    this.scene.add(this.world, this.hemi, this.sun, this.sun.target, this.torch, this.head, this.head.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 26; sc.bottom = -18; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.post = new Post(this.renderer, this.scene, this.camera, defaultQuality());
    this.applyQuality();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  get quality(): Quality { return this.post.quality; }
  setQuality(q: Quality): void { this.post.setQuality(q); this.applyQuality(); this.resize(); }
  private applyQuality(): void {
    this.renderer.shadowMap.enabled = this.post.quality !== "low";
    this.sun.castShadow = this.post.quality !== "low";
    this.sun.shadow.mapSize.setScalar(this.post.quality === "high" ? 2048 : 1024);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // portrait phones see the three lanes; keep the horizontal view wide enough
    this.camera.fov = w / h < 0.7 ? 68 : 58;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h);
  }

  // ================================================================ assets

  /** Kenney CC0 models. Never throws: the game draws stand-ins without them. */
  async load(): Promise<void> {
    const base = `${import.meta.env.BASE_URL}tikai/models/`;
    const loader = new GLTFLoader();
    const get = async (path: string): Promise<THREE.Object3D | null> => {
      try {
        const g = await loader.loadAsync(base + path);
        const root = g.scene;
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = true;
          m.receiveShadow = true;
          const mm = m.material as THREE.MeshStandardMaterial;
          // match the flat Lambert look of everything else
          const lam = new THREE.MeshLambertMaterial({ map: mm.map, color: mm.color, flatShading: true });
          if (lam.map) lam.map.colorSpace = THREE.SRGBColorSpace;
          m.material = lam;
        });
        return root;
      } catch {
        return null;
      }
    };
    const [green, purple, red, yellow, moto, forest, coin, cloud, flag] = await Promise.all([
      get("racing/vehicle-truck-green.glb"), get("racing/vehicle-truck-purple.glb"), get("racing/vehicle-truck-red.glb"), get("racing/vehicle-truck-yellow.glb"),
      get("racing/vehicle-motorcycle.glb"), get("racing/decoration-forest.glb"), get("plat/coin.glb"), get("plat/cloud.glb"), get("plat/flag.glb"),
    ]);
    for (const t of [green, purple, red, yellow]) if (t) {
      inkAll(t);
      const g = new THREE.Group();
      t.scale.setScalar(2.6);
      g.add(t);
      this.kenney.trucks.push(g);
    }
    this.kenney.moto = moto;
    this.kenney.forest = forest;
    if (coin) {
      coin.traverse((o) => { o.castShadow = false; });
      inkAll(coin);
      coin.scale.setScalar(1.6);
      const g = new THREE.Group();
      coin.position.y = -0.33;
      g.add(coin);
      this.kenney.coin = g;
    }
    if (cloud) {
      const white = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa8b8, flatShading: true });
      cloud.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = white; m.castShadow = false; } });
    }
    this.kenney.cloud = cloud;
    this.kenney.flag = flag;
  }

  // ================================================================ stage setup

  setStage(st: Stage, run: RunState): void {
    this.def = STAGES[st.idx];
    this.heroLook = traitById(run.trait).look;
    for (const l of this.live.values()) this.release(l);
    this.live.clear();
    this.calling.clear();
    this.world.clear();
    this.tiles = [];
    this.tileZ = [];
    this.pools.clear();
    this.templates.clear();
    this.hero = null;
    this.vehicle = null;
    this.chasers = [];
    this.chaseCars = [];
    this.chaseVan = null;
    this.torches = [];
    const night = this.def.time === "night";
    const dusk = this.def.time === "dusk";
    // sky, fog and light
    const sky = night ? 0x0e1424 : dusk ? 0xd08860 : this.def.theme === "road" ? 0xa8cce0 : 0x9fc4d8;
    this.scene.background = new THREE.Color(sky);
    const far = st.mode === "car" ? (night ? 230 : 320) : night ? 120 : 175;
    this.scene.fog = new THREE.Fog(sky, far * 0.3, far);
    this.camera.far = far + 20;
    this.camera.updateProjectionMatrix();
    this.hemi.color.set(night ? 0x6a7aa8 : dusk ? 0xffc8a0 : 0xdfefff);
    this.hemi.groundColor.set(night ? 0x141018 : 0x5a4a30);
    this.hemi.intensity = night ? 0.95 : dusk ? 0.9 : 1.2;
    this.sun.color.set(night ? 0x8aa0d8 : dusk ? 0xffa060 : 0xfff1d6);
    this.sun.intensity = night ? 0.8 : dusk ? 1.6 : 2.3;
    this.torch.intensity = night && st.mode === "foot" ? 28 : dusk && st.mode === "foot" ? 8 : 0;
    this.head.intensity = night && st.mode === "car" ? 160 : 0;
    const mood: Mood = night ? "night" : dusk ? "dusk" : "day";
    this.post.setMood(mood, true);
    // the road
    for (let i = 0; i < NT; i++) {
      const tile = this.buildTile(st, this.def.theme, i, night);
      this.bake(tile);
      tile.position.z = i * TILE - TILE;
      this.world.add(tile);
      this.tiles.push(tile);
      this.tileZ.push(i * TILE - TILE);
    }
    this.buildGoal(st);
    // you
    if (st.mode === "car") {
      this.vehicle = this.def.theme === "checkpoints" ? makeTractor() : makeLada();
      this.world.add(this.vehicle);
    } else {
      this.makeHero();
    }
    this.makeChasers(this.def.chaser, st);
    this.camPos.set(0, 6, -14);
    this.camLook.set(0, 1, 10);
  }

  private makeHero(): void {
    const l = this.heroLook;
    const rig = makePerson({ top: l.top, pants: l.pants, hat: l.hat, hatColor: l.hatColor, bag: l.bag, glasses: l.glasses, shoes: 0xe8e4da });
    this.hero = rig;
    this.world.add(rig.root);
    const scooter = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(0.22, 0.06, 1.0), 0x2a2a2a, 0.012), 0, 0.12, 0, scooter);
    at(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5), 0x8a8f94, 0.008), 0, 0.65, 0.42, scooter);
    at(mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), 0x2a2a2a, 0.008), 0, 1.2, 0.42, scooter);
    for (const z of [-0.4, 0.42]) { const w = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8), 0x161616, 0.008); w.rotation.z = Math.PI / 2; at(w, 0, 0.1, z, scooter); }
    scooter.visible = false;
    rig.root.add(scooter);
    const hood = mesh(new THREE.SphereGeometry(0.32, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.62), 0x1b1b20, 0.02);
    hood.rotation.x = -0.25;
    hood.position.set(0, 0.02, -0.03);
    hood.visible = false;
    rig.head.add(hood);
    const aura = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: 0x8aff5a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.position.y = 0.9;
    aura.visible = false;
    aura.userData.noAO = true;
    rig.root.add(aura);
    this.heroExtras = { scooter, hood, aura };
  }

  private makeChasers(chaser: Chaser, st: Stage): void {
    if (st.mode === "car") {
      for (let i = 0; i < 2; i++) {
        const car = makePolice();
        this.chaseCars.push(car);
        this.world.add(car);
      }
      return;
    }
    for (let i = 0; i < 2; i++) {
      const look = chaser === "guard" ? LOOKS.guard(this.camoGuard) : LOOKS.officer(this.camoTck);
      const rig = makePerson(look);
      this.chasers.push(rig);
      this.world.add(rig.root);
      if (chaser === "guard" || this.def.time !== "day") {
        // flashlight: a bulb in the hand and a pool of light on the road ahead
        const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 6), glowMat(0xfff2c0, 4));
        bulb.rotation.x = Math.PI / 2;
        rig.hand.add(bulb);
        const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.2), lightPoolMaterial(0xfff2c0, 0.55));
        beam.rotation.x = -Math.PI / 2;
        beam.renderOrder = 1;
        beam.userData.noAO = true;
        this.world.add(beam);
        this.torches.push(beam);
      }
    }
    if (chaser === "tck") {
      this.chaseVan = makeVan();
      this.world.add(this.chaseVan);
    }
  }

  // ================================================================ scenery tiles

  private matCache = new Map<string, THREE.Material>();
  private texMat(key: string, make: () => THREE.Texture, repeat: [number, number], lambert = true): THREE.Material {
    let m = this.matCache.get(key);
    if (!m) {
      const t = make();
      t.repeat.set(repeat[0], repeat[1]);
      m = lambert ? new THREE.MeshLambertMaterial({ map: t }) : new THREE.MeshBasicMaterial({ map: t });
      this.matCache.set(key, m);
    }
    return m;
  }

  private buildTile(st: Stage, theme: Theme, i: number, night: boolean): THREE.Group {
    const g = new THREE.Group();
    const r = rand(st.idx * 1000 + i * 77 + 5);
    const road = roadHalf(st) * 2;
    const e = road / 2;
    const plane = (w: number, d: number, material: THREE.Material, x: number, y = 0) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
      p.rotation.x = -Math.PI / 2;
      p.receiveShadow = true;
      at(p, x, y, TILE / 2, g);
      return p;
    };
    const roadKind = theme === "road" ? "highway" : theme === "checkpoints" ? "night" : theme === "yard" ? "paving" : theme === "market" ? "market" : theme === "village" ? "dirt" : "forest";
    const along = roadKind === "highway" || roadKind === "night" ? TILE / 10 : TILE / road;
    plane(road + 0.4, TILE, this.texMat(`road-${roadKind}`, () => roadTexture(roadKind, st.lanes), [1, along]), 0, 0);
    const groundKind = theme === "yard" || theme === "market" ? "sidewalk" : night ? "night" : theme === "road" || theme === "village" ? "dry" : "grass";
    const ground = this.texMat(`ground-${groundKind}-${night}`, () => groundTexture(groundKind), [12, 6]);
    for (const s of [-1, 1]) plane(120, TILE, ground, s * (e + 0.2 + 60), -0.01);
    const side = (s: number, x: number) => s * (e + x);
    const put = (o: THREE.Object3D, s: number, x: number, z: number, rotY = 0) => { at(o, side(s, x), 0, z, g); o.rotation.y = rotY; return o; };

    if (theme === "yard" || theme === "market") {
      // curbs
      for (const s of [-1, 1]) at(mesh(new THREE.BoxGeometry(0.3, 0.16, TILE), 0xb8b2a4, 0), s * (e + 0.15), 0.08, TILE / 2, g);
      // panel blocks
      for (const s of [-1, 1]) {
        const w = 26 + r() * 10;
        const h = theme === "yard" ? 14 + Math.floor(r() * 3) * 3 : 9;
        const base = [0xd8d0c0, 0xc9c2b0, 0xb8b4a8, 0xd0c4a8][Math.floor(r() * 4)];
        const { map, glow } = facadeTextures(base, i * 3 + (s > 0 ? 1 : 2), night);
        map.repeat.set(10 / 12, h / 12);
        glow.repeat.copy(map.repeat);
        const facade = new THREE.MeshLambertMaterial({ map, emissiveMap: glow, emissive: night ? 0xffffff : 0x000000, emissiveIntensity: night ? 1.6 : 0 });
        const roof = new THREE.MeshLambertMaterial({ map: roofTexture(i) });
        const block = new THREE.Mesh(new THREE.BoxGeometry(10, h, w), [facade, facade, roof, roof, facade, facade]);
        block.castShadow = block.receiveShadow = true;
        block.userData.noBatch = true;
        put(block, s, (theme === "yard" ? 13 : 16) + r() * 3, TILE / 2 + (r() - 0.5) * 8).position.y = h / 2;
      }
    }
    if (theme === "yard") {
      for (const s of [-1, 1]) {
        for (let z = 4; z < TILE; z += 13 + r() * 6) {
          const k = r();
          if (k < 0.3) put(makeTree(i * 10 + z, false), s, 3 + r() * 3, z);
          else if (k < 0.5) put(makeCar(i * 7 + z), s, 4.2, z, (r() - 0.5) * 0.2);
          else if (k < 0.62) put(makeTrashBins(), s, 2.2, z, s * Math.PI / 2);
          else if (k < 0.78) put(makeBush(i + z), s, 2.5, z);
          else { const gar = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 6), [mat(0x7c7a70), mat(0x7c7a70), mat(0x5a5856), mat(0x5a5856), new THREE.MeshLambertMaterial({ map: garageTexture(z) }), new THREE.MeshLambertMaterial({ map: garageTexture(z) })]); gar.userData.noBatch = true; gar.castShadow = true; put(gar, s, 7, z, Math.PI / 2).position.y = 1.3; }
        }
        put(makeLamp(), s, 1.0, 20, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
    }
    if (theme === "market") {
      for (const s of [-1, 1]) {
        for (let z = 2; z < TILE; z += 3.4) put(makeStall(i * 31 + z * 3 + s), s, 2.2, z, s > 0 ? Math.PI / 2 : -Math.PI / 2);
        for (let z = 6; z < TILE; z += 14 + r() * 8) {
          const p = makePerson(LOOKS.shopper([0xd63732, 0x54b7c6, 0x9a6bd1, 0xf2b632, 0x3a8a4a][Math.floor(r() * 5)]));
          animateRig(p, 0, 0, "idle");
          put(p.root, s, 4.2, z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
        }
        if (i % 3 === 0) put(makeKiosk(i + (s > 0 ? 3 : 0)), s, 6.5, 22, s > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      if (i === 1) {
        const arch = makeSignBoard("РИНОК «ЗАТИШНИЙ»", "#2b5aa8", "#f2b632");
        arch.scale.set(e * 0.95, 1.6, 1);
        at(arch, 0, 0, 5, g);
      }
    }
    if (theme === "road" || theme === "checkpoints") {
      for (const s of [-1, 1]) {
        at(makeGuardRail(TILE), side(s, 1.2), 0, TILE / 2, g).rotation.y = s > 0 ? 0 : Math.PI;
        if (theme === "road" && i % 2 === 0) put(makePowerPole(), s, 9, 10);
        if (theme === "checkpoints" || i % 2 === 1) {
          const lamp = makeLamp();
          put(lamp, s, 2.2, 30, s > 0 ? -Math.PI / 2 : Math.PI / 2);
          if (night) {
            const pool = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), lightPoolMaterial(0xffb860, 0.45));
            pool.rotation.x = -Math.PI / 2;
            pool.userData.noBatch = true;
            pool.renderOrder = 1;
            at(pool, side(s, -1.2), 0.03, 30, g);
          }
        }
        // the forest beyond the fields
        if (this.kenney.forest && r() < 0.8) {
          const f = this.kenney.forest.clone();
          f.scale.setScalar(2.2);
          put(f, s, 22 + r() * 18, TILE / 2, Math.floor(r() * 4) * Math.PI / 2);
        } else {
          for (let k = 0; k < 3; k++) put(makePine(i * 9 + k + s, false), s, 14 + r() * 20, r() * TILE);
        }
      }
      if (theme === "road" && i % 3 === 1) {
        const [t, bg, fg] = BILLBOARDS[i % BILLBOARDS.length];
        const s = i % 2 ? 1 : -1;
        put(makeBillboard(t, bg, fg), s, 7, 20, 0).rotation.y = Math.PI;
      }
    }
    if (theme === "village") {
      for (const s of [-1, 1]) {
        const fence = makeLowFence(TILE, "picket");
        fence.rotation.y = Math.PI / 2;
        at(fence, side(s, 1.3), 0, TILE / 2, g);
        const hx = 8 + r() * 3;
        put(makeHouse(6 + r() * 2, 7, i * 5 + s), s, hx, 14, s * Math.PI / 2);
        if (r() < 0.6) put(makeKennel(), s, hx - 4, 26, s > 0 ? -Math.PI / 2 : Math.PI / 2);
        for (let z = 3; z < TILE; z += 9 + r() * 6) put(makeTree(i * 13 + z + s, true), s, 4 + r() * 12, z);
        // sunflowers along the fence
        for (let z = 30; z < TILE - 1; z += 1.4) {
          const f = new THREE.Group();
          at(mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.8, 4), 0x4a7a2a, 0), 0, 0.9, 0, f);
          const head = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 8), 0xf2b632, 0.01);
          head.rotation.x = Math.PI / 2 - 0.4;
          at(head, 0, 1.85, 0.05, f);
          put(f, s, 2.2, z, s > 0 ? -0.5 : 0.5);
        }
      }
    }
    if (theme === "forest") {
      for (const s of [-1, 1]) {
        for (let k = 0; k < 9; k++) put(makePine(i * 31 + k * 7 + s, false), s, 1.5 + r() * 16, r() * TILE);
        for (let k = 0; k < 3; k++) put(makeBush(i * 3 + k + s, 0x2f5a3c), s, 1.2 + r() * 4, r() * TILE);
        if (this.kenney.forest) {
          const f = this.kenney.forest.clone();
          f.scale.setScalar(2.4);
          put(f, s, 24 + r() * 8, TILE / 2, Math.floor(r() * 4) * Math.PI / 2);
        }
      }
    }
    return g;
  }

  /** Merge every static mesh of a group into one mesh per material. */
  private bake(g: THREE.Group): void {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const keep: THREE.Object3D[] = [];
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Sprite).isSprite) return;
      if ((o as THREE.Sprite).isSprite || Array.isArray(m.material) || m.userData.noBatch) { keep.push(m); return; }
      let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name);
      if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo = geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      const list = buckets.get(m.material) ?? [];
      list.push(geo);
      buckets.set(m.material, list);
    });
    for (const k of keep) {
      const mw = new THREE.Matrix4().multiplyMatrices(inv, k.matrixWorld);
      mw.decompose(k.position, k.quaternion, k.scale);
    }
    g.clear();
    for (const k of keep) { k.clear(); g.add(k); }
    for (const [material, geos] of buckets) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((x) => x.dispose());
      if (!merged) continue;
      const m = new THREE.Mesh(merged, material);
      const basic = material as THREE.MeshBasicMaterial;
      m.castShadow = !basic.transparent && material.type !== "MeshBasicMaterial";
      m.receiveShadow = true;
      g.add(m);
    }
  }

  private buildGoal(st: Stage): void {
    const g = new THREE.Group();
    const e = roadHalf(st);
    const z = st.length + 6;
    const sign = makeSignBoard(GOAL_SIGN[this.def.theme] ?? "ФІНІШ", "#f2b632", "#171318");
    sign.scale.set(e * 0.8, 1.4, 1);
    at(sign, 0, 0, z, g);
    if (this.kenney.flag) for (const s of [-1, 1]) {
      const f = this.kenney.flag.clone();
      f.scale.setScalar(3);
      at(f, s * (e + 1), 0, z, g);
    }
    if (this.def.theme === "forest") {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshLambertMaterial({ color: 0x2a4a6a, emissive: 0x0a1a2a }));
      water.rotation.x = -Math.PI / 2;
      at(water, 0, 0.05, z + 34, g);
    }
    if (this.def.theme === "market") { const car = makeLada(0x8a2a2a); at(car, 0, 0, z + 8, g); }
    if (this.def.theme === "village") { const t = makeTractor(); at(t, 0, 0, z + 9, g); }
    this.world.add(g);
  }

  // ================================================================ things on the road

  private variants(kind: string): number {
    return ({ traffic: Math.max(2, this.kenney.trucks.length + 3), parked: 4, kiosk: 3, stall: 3, laundry: 2, truck: 3, bus: 3, fence: 1 } as Record<string, number>)[kind] ?? 1;
  }

  private build(kind: string, v: number, st: Stage): THREE.Object3D {
    const W = st.laneW;
    switch (kind) {
      case "bench": { const b = makeBench(); b.scale.set(W * 0.42, 1, 1); return b; }
      case "bins": return makeTrashBins();
      case "parked": { const c = makeCar(v * 11 + 3); return c; }
      case "kiosk": return makeKiosk(v);
      case "fence": return makeLowFence(W, this.def.theme === "village" ? "picket" : "repair");
      case "laundry": return makeLaundry(W, v);
      case "scaffold": return makeScaffold(W);
      case "puddle": return makePuddle(2.2, W * 0.85);
      case "manhole": return makeManhole();
      case "crates": return makeCrates(v);
      case "stall": { const s = makeStall(v * 7 + 1); s.rotation.y = 0; return s; }
      case "dog": { const d = makeDog(); d.rotation.y = Math.PI; return d; }
      case "geese": { const gg = makeGeese(); gg.rotation.y = Math.PI; return gg; }
      case "hay": return makeHay();
      case "cart": return makeCart();
      case "log": return makeLog(W);
      case "branch": return makeBranch(W);
      case "spot": {
        const s = makeSpot(W);
        const drone = makeDrone();
        drone.name = "drone";
        at(drone, 0, 7, 0, s);
        return s;
      }
      case "roadworks": return makeRoadworks(W);
      case "boomlow": return makeBoom(W, 1.25);
      case "traffic": {
        const nk = this.kenney.trucks.length;
        if (v < nk) return this.kenney.trucks[v].clone();
        return makeCar(v * 17 + 5);
      }
      case "truck": return makeLorry(v);
      case "bus": return makeMarshrutka(v);
      case "pothole": return makePothole();
      case "spikes": return makeSpikes(W);
      case "blocks": return makeConcrete(W);
      case "hedgehog": return makeHedgehogs(W);
      case "patrol": { const p = makePolice(); p.rotation.y = Math.PI / 2; const g = new THREE.Group(); g.add(p); return g; }
      case "cones": return makeCones(W);
      case "boom": return makeBoom(W, 1.15);
      case "coin": {
        if (this.kenney.coin) { const c = this.kenney.coin.clone(); if (st.mode === "car") c.scale.setScalar(1.5); return c; }
        const c = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 12), C.yellow, 0.015);
        c.rotation.x = Math.PI / 2;
        const g = new THREE.Group(); g.add(c); return g;
      }
      case "sign": return makeSignBoard("БЛОКПОСТ · СТОП", "#d63732", "#ffffff");
      case "shelter": return new THREE.Group();
      default: {
        const p = PICKUPS[kind as PickId];
        if (p) {
          const color = { scooter: 0x54b7c6, hood: 0x6a6a7a, magnet: 0xf2b632, energy: 0x8ad84a, nitro: 0xe8602f, repair: 0xb8b8b8, coin: 0xf2b632 }[p.id];
          const g = makePowerup(p.icon, color);
          if (st.mode === "car") g.scale.setScalar(1.6);
          return g;
        }
        return new THREE.Group();
      }
    }
  }

  private take(kind: string, v: number, st: Stage): THREE.Object3D {
    const key = `${kind}:${v}`;
    const pool = this.pools.get(key);
    const reuse = pool?.pop();
    if (reuse) { reuse.visible = true; return reuse; }
    let tpl = this.templates.get(key);
    if (!tpl) { tpl = this.build(kind, v, st); this.templates.set(key, tpl); }
    return tpl.clone(true);
  }

  private release(l: Live): void {
    l.obj.removeFromParent();
    l.obj.visible = false;
    if (l.rig) return; // rigs are not pooled
    const pool = this.pools.get(l.key) ?? [];
    pool.push(l.obj);
    this.pools.set(l.key, pool);
  }

  private spawn(o: Obj, st: Stage): Live {
    if (o.kind === "courier" || o.kind === "babka" || o.kind === "soldier") {
      let rig: Rig;
      const root = new THREE.Group();
      if (o.kind === "courier") {
        rig = makePerson({ top: 0xf2b632, pants: 0x2b2b30, hat: "cap", hatColor: 0xf2b632, bag: 0xf2b632 });
        rig.root.rotation.y = Math.PI;
        root.add(rig.root);
        const deck = mesh(new THREE.BoxGeometry(0.22, 0.06, 1.0), 0x2a2a2a, 0.012);
        at(deck, 0, 0.12, 0, root);
        const bag = mesh(new THREE.BoxGeometry(0.6, 0.6, 0.5), 0xf2b632, 0.02);
        at(bag, 0, 1.25, 0.35, root);
      } else if (o.kind === "babka") {
        rig = makePerson(LOOKS.babka());
        const bench = makeBench();
        bench.rotation.y = o.side > 0 ? -Math.PI / 2 : Math.PI / 2;
        root.add(bench);
        rig.root.rotation.y = bench.rotation.y;
        rig.root.position.set(o.side > 0 ? 0.1 : -0.1, 0, 0);
        animateRig(rig, 0, 0, "sit");
        root.add(rig.root);
      } else {
        rig = makePerson(LOOKS.guard(this.camoGuard));
        rig.root.rotation.y = Math.PI;
        root.add(rig.root);
      }
      this.world.add(root);
      return { obj: root, key: o.kind, seen: this.frame, rig, t0: this.time };
    }
    const v = Math.floor(o.look * this.variants(o.kind)) % this.variants(o.kind);
    const obj = this.take(o.kind, v, st);
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, obj.rotation.y, 0);
    obj.getObjectByName("arm")?.rotation.set(0, 0, 0);
    obj.traverse((c) => { if (c.name === "cone") { c.position.y = 0; c.rotation.set(0, 0, 0); } });
    this.world.add(obj);
    return { obj, key: `${o.kind}:${v}`, seen: this.frame, t0: this.time };
  }

  // ================================================================ per frame

  onEvent(e: Ev, st: Stage): void {
    if (e.kind === "crash") { this.shake = st.mode === "car" ? 0.6 : 0.45; this.post.flash = 0.35; }
    if (e.kind === "stumble") this.shake = Math.max(this.shake, 0.22);
    if (e.kind === "bump") this.shake = Math.max(this.shake, 0.12);
    if (e.kind === "saved") this.shake = Math.max(this.shake, 0.3);
    if (e.kind === "nitro") this.fovKick = 10;
    if (e.kind === "babka") {
      for (const o of st.objs) if (o.kind === "babka" && o.hit && Math.abs(o.z - st.dist) < 6) this.calling.add(o.id);
    }
  }

  update(st: Stage, run: RunState, dt: number): void {
    this.time += dt;
    this.frame++;
    const z = st.dist;
    // leap-frog scenery tiles
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tileZ[i] + TILE < z - 30) {
        this.tileZ[i] += NT * TILE;
        this.tiles[i].position.z = this.tileZ[i];
      }
    }
    this.updateHero(st, run, dt);
    this.updateChasers(st, dt);
    this.updateObjects(st, dt);
    this.updateCamera(st, dt);
    // light follows you
    const hx = wx(st.x);
    this.sun.position.set(hx + 12, 30, z - 10);
    this.sun.target.position.set(hx, 0, z + 6);
    this.torch.position.set(hx, 4, z + 3);
    this.head.position.set(hx, 1.4, z + 2);
    this.head.target.position.set(hx * 0.6, 0, z + 30);
    // danger: how close they are
    const near = 1 - Math.min(1, st.gap / (st.mode === "car" ? 14 : 9));
    this.post.danger = Math.max(0, near) * 0.9;
  }

  private updateHero(st: Stage, run: RunState, dt: number): void {
    const vx = (st.x - this.lastX) / Math.max(dt, 1e-4);
    this.lastX = st.x;
    this.lean += (Math.max(-1, Math.min(1, vx / 12)) - this.lean) * Math.min(1, dt * 12);
    const hx = wx(st.x);
    if (this.vehicle) {
      const v = this.vehicle;
      v.position.set(hx, 0, st.dist);
      v.rotation.y = this.lean * 0.12;
      v.rotation.z = this.lean * 0.06;
      v.position.y = Math.abs(Math.sin(this.time * 14)) * 0.02 * (st.speed / 30);
      v.traverse((c) => {
        if (c.name === "wheel") c.rotation.x += st.speed * dt * 2.5;
        if (c.name === "flame") { c.visible = st.nitroT > 0; c.scale.setScalar(0.8 + Math.random() * 0.5); }
      });
      return;
    }
    const rig = this.hero;
    if (!rig || !this.heroExtras) return;
    rig.root.position.set(hx, st.y, st.dist);
    rig.root.rotation.z = this.lean * 0.18;
    rig.root.rotation.y = -this.lean * 0.25;
    const ex = this.heroExtras;
    ex.scooter.visible = st.power === "scooter";
    ex.hood.visible = st.power === "hood";
    ex.aura.visible = st.power === "energy";
    if (ex.aura.visible) ex.aura.scale.setScalar(1 + Math.sin(this.time * 18) * 0.06);
    if (st.stun > 0) {
      animateRig(rig, 0, dt, "stunned");
    } else if (st.power === "scooter") {
      animateRig(rig, 0, dt, "idle");
      rig.body.rotation.x = 0.15;
      rig.armL.rotation.x = rig.armR.rotation.x = -1.2;
      rig.body.position.y = 0.12;
    } else {
      animateRig(rig, st.speed, dt * (st.power === "energy" ? 1.4 : 1), "walk");
      rig.armR.rotation.x *= 1.3;
      rig.armL.rotation.x *= 1.3;
    }
    if (st.y > 0.01 && st.power !== "scooter") {
      rig.legL.rotation.x = -1.1;
      rig.legR.rotation.x = 0.5;
      rig.armL.rotation.x = -2.4;
      rig.armR.rotation.x = 0.8;
    }
    if (st.slide > 0 && st.y <= 0.01) {
      rig.body.rotation.x = -1.15;
      rig.body.position.y = -0.38;
      rig.legL.rotation.x = rig.legR.rotation.x = -1.45;
      rig.armL.rotation.x = rig.armR.rotation.x = -0.4;
    }
    void run;
  }

  private updateChasers(st: Stage, dt: number): void {
    const hx = wx(st.x);
    const zc = st.dist - Math.max(1.2, st.gap);
    if (st.mode === "car") {
      this.chaseCars.forEach((car, i) => {
        const zz = zc - 2.4 - i * 9;
        const tx = i === 0 ? hx : wx(st.x + (st.x > 0 ? -1 : 1) * st.laneW);
        car.position.x += (tx - car.position.x) * Math.min(1, dt * (i === 0 ? 1.6 : 1.1));
        car.position.z = zz;
        car.rotation.y = (tx - car.position.x) * -0.04;
        car.visible = st.gap < 60;
        const on = Math.floor(this.time * 7 + i) % 2 === 0;
        const a = car.getObjectByName("barA");
        const b = car.getObjectByName("barB");
        if (a) a.visible = on;
        if (b) b.visible = !on;
        car.traverse((c) => { if (c.name === "wheel") c.rotation.x += st.speed * dt * 2.5; });
      });
      return;
    }
    const caught = st.caught;
    this.chasers.forEach((rig, i) => {
      const zz = zc - i * 1.6 - (caught ? -0.4 : 0);
      const off = (i === 0 ? -0.5 : 0.6) * (st.laneW / 2.2);
      const tx = hx + off;
      rig.root.position.x += (tx - rig.root.position.x) * Math.min(1, dt * 5);
      rig.root.position.z = zz;
      rig.root.visible = st.gap < 28;
      const pool = this.torches[i];
      if (pool) { pool.position.set(rig.root.position.x + Math.sin(this.time * 1.7 + i) * 0.8, 0.04, zz + 4.5); pool.visible = rig.root.visible; }
      const v = st.stun > 0 ? 9 : st.speed;
      animateRig(rig, caught ? 0 : v, dt, caught || st.gap < 2.5 ? "grab" : "walk");
      if (!caught && st.gap >= 2.5 && i === 0 && Math.sin(this.time * 2) > 0.6) {
        rig.armR.rotation.x = -2.3;
      }
    });
    if (this.chaseVan) {
      const van = this.chaseVan;
      van.position.set(wx(0), 0, zc - 10);
      van.visible = st.gap < 30;
      const beacon = van.getObjectByName("beacon") as THREE.Mesh | undefined;
      if (beacon) (beacon.material as THREE.MeshBasicMaterial).color.setHex(Math.floor(this.time * 4) % 2 ? 0xff8a1a : 0x553300).multiplyScalar(Math.floor(this.time * 4) % 2 ? 3 : 1);
    }
  }

  private updateObjects(st: Stage, dt: number): void {
    const view = st.mode === "car" ? 290 : 150;
    for (const o of st.objs) {
      if (o.kind === "shelter") continue;
      let l = this.live.get(o.id);
      const gone = o.cat === "pick" && o.hit;
      if (gone || o.z - st.dist > view || o.z < st.dist - 30) {
        if (l) { this.release(l); this.live.delete(o.id); }
        continue;
      }
      if (!l) { l = this.spawn(o, st); this.live.set(o.id, l); }
      l.seen = this.frame;
      const obj = l.obj;
      obj.position.set(wx(o.x), 0, o.z);
      const age = this.time - l.t0;
      switch (o.kind) {
        case "coin":
          obj.position.y = o.y;
          obj.rotation.y = this.time * 3 + o.z * 0.3;
          break;
        case "babka":
          if (l.rig) {
            animateRig(l.rig, 0, dt, "sit");
            if (this.calling.has(o.id)) { l.rig.armR.rotation.x = -2.3; l.rig.armR.rotation.z = 0.4; }
          }
          break;
        case "soldier":
          if (l.rig) { animateRig(l.rig, 0, dt, "idle"); l.rig.armR.rotation.x = -2.6 + Math.sin(this.time * 6) * 0.3; }
          break;
        case "courier":
          if (l.rig) animateRig(l.rig, 0, dt, "idle");
          break;
        case "dog": {
          obj.position.y = Math.abs(Math.sin(age * 12)) * 0.12;
          const tail = obj.getObjectByName("tail");
          if (tail) tail.rotation.y = Math.sin(age * 20) * 0.6;
          break;
        }
        case "geese":
          obj.traverse((c) => { if (c.name === "bob") c.position.y = Math.abs(Math.sin(age * 9 + c.position.x * 3)) * 0.1; });
          break;
        case "spot": {
          const drone = obj.getObjectByName("drone");
          if (drone) { drone.position.y = 7 + Math.sin(age * 2) * 0.3; drone.traverse((c) => { if (c.name === "prop") c.rotation.y += dt * 40; }); }
          break;
        }
        case "patrol": {
          const on = Math.floor(this.time * 6) % 2 === 0;
          const a = obj.getObjectByName("barA");
          const b = obj.getObjectByName("barB");
          if (a) a.visible = on;
          if (b) b.visible = !on;
          break;
        }
        case "traffic": case "truck": case "bus": {
          obj.rotation.y = (o.tx - o.x) * 0.06;
          obj.traverse((c) => {
            if (c.name === "wheel") c.rotation.x += o.vz * dt * 2.5;
            if (c.name === "tail") c.visible = o.blink <= 0 || Math.floor(this.time * 6) % 2 === 0;
          });
          if (o.hit && o.vz > 0) obj.rotation.z = 0;
          break;
        }
        default:
          if (o.cat === "pick") {
            obj.position.y = o.y + Math.sin(this.time * 3 + o.id) * 0.15;
            const ring = obj.getObjectByName("ring");
            if (ring) ring.rotation.y = this.time * 2;
          }
      }
      // rammed things fly
      if (o.hit && o.cat === "obst") {
        const arm = obj.getObjectByName("arm");
        if (arm) arm.rotation.z += (1.3 - arm.rotation.z) * Math.min(1, dt * 10);
        obj.traverse((c) => { if (c.name === "cone") { c.position.y += dt * 4; c.position.z += dt * 6; c.rotation.x += dt * 9; } });
      }
    }
    for (const [id, l] of this.live) {
      if (l.seen !== this.frame) { this.release(l); this.live.delete(id); this.calling.delete(id); }
    }
  }

  private updateCamera(st: Stage, dt: number): void {
    const car = st.mode === "car";
    const hx = wx(st.x);
    const kick = (st.nitroT > 0 || st.power === "energy" ? 7 : 0) + this.fovKick;
    this.fovKick *= Math.exp(-dt * 2);
    const baseFov = this.camera.aspect < 0.7 ? 68 : 58;
    const fov = baseFov + kick;
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4); this.camera.updateProjectionMatrix(); }
    const tp = new THREE.Vector3(hx * 0.7, car ? 5.4 : 3.4 + st.y * 0.35, st.dist - (car ? 11 : 6.8));
    const tl = new THREE.Vector3(hx * 0.55, car ? 1.0 : 1.2, st.dist + (car ? 18 : 9));
    this.camPos.lerp(tp, Math.min(1, dt * 8));
    this.camPos.z = tp.z;
    this.camLook.lerp(tl, Math.min(1, dt * 8));
    this.camLook.z = tl.z;
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const s = this.shake * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camLook);
  }

  render(dt: number): void {
    this.post.render(dt);
  }

  /** Idle menu backdrop: the stage scrolls by on its own. */
  get canvas(): HTMLCanvasElement { return this.renderer.domElement; }
}

