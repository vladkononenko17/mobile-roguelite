import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LevelDef } from "./content";
import { CELL, MAPS, blocksSight, floorOf, type MapDef } from "./maps";
import type { OutingEvent, OutingSim, Patrol } from "./outing";
import type { ActionId } from "./content";
import {
  C, CAMO_GUARD, CAMO_TCK, LOOKS, animateRig, at, camoTexture, canvasTexture, carpetTexture, facadeTexture, garageTexture,
  makeBench, makeBoat, makeBush, makeCar, makeDesk, makeDog, makeDrone, makeFan, makeHouse, makeKennel, makeLamp, makePerson,
  makePine, makePlant, makeRing, makeStall, makeTrashBins, makeTree, makeVan, mat, mesh, roofTexture, setRigOpacity, signTexture,
  wallpaperTexture, type Rig,
} from "./three/models";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface PatrolView {
  id: number;
  kind: Patrol["kind"];
  obj: THREE.Object3D;
  rig?: Rig;
  follower?: Rig;
  fx: number;
  fz: number;
  fan?: THREE.Mesh;
  ring?: THREE.Mesh;
  tag: HTMLElement;
}

interface Bubble { el: HTMLElement; x: number; y: number; z: number; until: number }

interface Fadeable { mesh: THREE.Mesh; x0: number; x1: number; z0: number; height: number; mats: THREE.Material[] }

const FAN_SEGMENTS = 26;

/** Owns the WebGL renderer: the apartment between outings and the outing maps. */
export class Scene3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 0.5, 0.1, 300);
  private hemi = new THREE.HemisphereLight(0xdfe8ff, 0x4a4a3a, 1.2);
  private sun = new THREE.DirectionalLight(0xffffff, 1.8);
  private camTarget = V(0, 0, 0);
  private camOffset = V(0, 22, 12.5);
  private clock = new THREE.Clock();
  private fxLayer: HTMLElement;
  mode: "menu" | "home" | "outing" = "menu";
  paused = false;
  sim: OutingSim | null = null;
  onEvents: ((ev: OutingEvent[]) => void) | null = null;
  onFrame: ((dt: number) => void) | null = null;

  // ---- outing
  private out = new THREE.Group();
  /** Static props, merged into one mesh per material after the map is built. */
  private statics = new THREE.Group();
  private hero: Rig | null = null;
  private heroHidden = 0;
  private patrolViews = new Map<number, PatrolView>();
  private babkaRigs: Rig[] = [];
  private babkaRings: THREE.Mesh[] = [];
  private babkaTags: HTMLElement[] = [];
  private dogModels: THREE.Group[] = [];
  private objMarkers: Array<{ ring: THREE.Mesh; beam: THREE.Mesh; tag: HTMLElement; slot: string }> = [];
  private exitMarker: { ring: THREE.Mesh; beam: THREE.Mesh; tag: HTMLElement } | null = null;
  private vaultMarker: THREE.Mesh | null = null;
  private fades: Fadeable[] = [];
  private water: THREE.Mesh[] = [];
  private precip: THREE.Points | THREE.LineSegments | null = null;
  private precipKind: "rain" | "snow" | null = null;
  private lampLights: THREE.PointLight[] = [];
  private lampSpots: THREE.Vector3[] = [];
  private bubbles: Bubble[] = [];
  private arrows: HTMLElement[] = [];
  private heroTag: HTMLElement | null = null;
  private shake = 0;
  private level: LevelDef | null = null;
  private camoTck = camoTexture(CAMO_TCK, 5);
  private camoGuard = camoTexture(CAMO_GUARD, 9);
  private noiseRings: Array<{ mesh: THREE.Mesh; t: number }> = [];

  // ---- apartment
  private home = new THREE.Group();
  private homeHero: Rig | null = null;
  private homeCat: THREE.Group | null = null;
  private homePose: ActionId | "idle" | "hide" = "idle";
  private homePoseT = 0;
  private homeLamp = new THREE.PointLight(0xffd59a, 0, 9);
  private candle = new THREE.PointLight(0xff9a3a, 0, 5);
  private windowMat = new THREE.MeshBasicMaterial({ color: 0x9fc6e8 });
  private laptopScreen = new THREE.MeshBasicMaterial({ color: 0x6fb0ff });
  private homeVan: THREE.Group | null = null;
  private homeVanT = -1;

  private container: HTMLElement;

  constructor(container: HTMLElement, fxLayer: HTMLElement) {
    this.container = container;
    this.fxLayer = fxLayer;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.out, this.home);
    this.buildHome();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.renderer.setAnimationLoop(() => this.tick());
    (window as unknown as { __three: THREE.WebGLRenderer }).__three = this.renderer;
  }

  get vw(): number { return this.container.clientWidth || window.innerWidth; }
  get vh(): number { return this.container.clientHeight || window.innerHeight; }

  resize(): void {
    const w = this.vw;
    const h = this.vh;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // narrow phones see less sideways; widen the lens a little
    this.camera.fov = w / h < 0.6 ? 52 : 45;
    this.camera.updateProjectionMatrix();
  }

  // =================================================================== HOME

  private buildHome(): void {
    const g = this.home;
    const floorTex = canvasTexture(128, 128, (c) => {
      c.fillStyle = "#9a6a42";
      c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
        const v = 150 + ((i * 7 + j * 13) % 5) * 9;
        c.fillStyle = `rgb(${v},${Math.round(v * 0.72)},${Math.round(v * 0.45)})`;
        c.fillRect(j * 32 + (i % 2) * 16, i * 16, 32, 16);
        c.strokeStyle = "rgba(0,0,0,.25)";
        c.strokeRect(j * 32 + (i % 2) * 16, i * 16, 32, 16);
      }
    });
    floorTex.repeat.set(4, 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 7), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    const paper = wallpaperTexture("#c9b98a", "#b3a272");
    paper.repeat.set(4, 1.5);
    const wallMat = new THREE.MeshLambertMaterial({ map: paper });
    const back = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 0.2), wallMat);
    at(back, 0, 1.6, -3.5, g).receiveShadow = true;
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 7), wallMat);
    at(side, -4, 1.6, 0, g).receiveShadow = true;
    // skirting
    at(mesh(new THREE.BoxGeometry(8, 0.14, 0.06), 0x6a4a2a, 0), 0, 0.07, -3.38, g);
    at(mesh(new THREE.BoxGeometry(0.06, 0.14, 7), 0x6a4a2a, 0), -3.88, 0.07, 0, g);

    // the carpet on the wall
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshLambertMaterial({ map: carpetTexture() }));
    at(carpet, -1.6, 1.75, -3.38, g);
    // window with a view
    const frame = mesh(new THREE.BoxGeometry(1.8, 1.5, 0.12), 0xeeeeee, 0.02);
    at(frame, 1.9, 1.75, -3.4, g);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), this.windowMat);
    at(glass, 1.9, 1.75, -3.33, g);
    at(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 0.04), mat(0xeeeeee)), 1.9, 1.75, -3.31, g);
    for (const s of [-1, 1]) {
      const curtain = mesh(new THREE.BoxGeometry(0.45, 1.9, 0.08), 0x9a6a4a, 0.015);
      at(curtain, 1.9 + s * 1.05, 1.65, -3.25, g);
    }
    // a van that sometimes drives past the window
    const van = makeVan();
    van.scale.setScalar(0.1);
    van.rotation.y = Math.PI / 2;
    at(van, 1.3, 1.2, -3.22, g);
    van.visible = false;
    this.homeVan = van;

    // desk + laptop + chair under the window
    at(mesh(new THREE.BoxGeometry(1.9, 0.08, 0.8), 0x8a6a4a, 0.02), 1.9, 0.78, -2.8, g);
    for (const [x, z] of [[1.05, -3.1], [2.75, -3.1], [1.05, -2.5], [2.75, -2.5]]) at(mesh(new THREE.BoxGeometry(0.07, 0.78, 0.07), 0x5a4030, 0), x, 0.39, z, g);
    const lid = mesh(new THREE.BoxGeometry(0.56, 0.38, 0.03), 0x2a2d33, 0.01);
    at(lid, 1.9, 1.0, -2.98, g).rotation.x = -0.25;
    at(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), this.laptopScreen), 1.9, 1.0, -2.96, g).rotation.x = -0.25;
    at(mesh(new THREE.BoxGeometry(0.56, 0.03, 0.36), 0x2a2d33, 0.01), 1.9, 0.83, -2.75, g);
    at(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 8), 0xe8e0d0, 0.01), 2.55, 0.88, -2.75, g); // mug
    // candle for blackouts
    at(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 6), 0xf4ecd8, 0.008), 1.2, 0.9, -2.7, g);
    at(this.candle, 1.2, 1.15, -2.7, g);
    const chair = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(0.55, 0.08, 0.55), 0x3a3a44, 0.015), 0, 0.5, 0, chair);
    at(mesh(new THREE.BoxGeometry(0.55, 0.6, 0.08), 0x3a3a44, 0.015), 0, 0.85, 0.27, chair);
    at(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), 0x222222, 0), 0, 0.25, 0, chair);
    at(chair, 1.9, 0, -1.95, g);

    // sofa on the left wall
    const sofa = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(1.0, 0.45, 2.4), 0x6a3a3a, 0.03), 0, 0.3, 0, sofa);
    at(mesh(new THREE.BoxGeometry(0.3, 0.6, 2.4), 0x6a3a3a, 0.03), -0.4, 0.75, 0, sofa);
    for (const s of [-1, 1]) at(mesh(new THREE.BoxGeometry(1.0, 0.35, 0.22), 0x6a3a3a, 0.03), 0, 0.62, s * 1.2, sofa);
    at(mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), 0xd8c8a0, 0.015), -0.1, 0.62, -0.8, sofa); // pillow
    at(sofa, -3.3, 0, -0.9, g);
    // fridge
    const fridge = mesh(new THREE.BoxGeometry(0.75, 1.8, 0.7), 0xe8e8e0, 0.03);
    at(fridge, -3.45, 0.9, 2.2, g);
    at(mesh(new THREE.BoxGeometry(0.04, 0.5, 0.05), 0x888888, 0), -3.05, 1.1, 2.0, g);
    at(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), C.yellow, 0), -3.08, 1.5, 2.3, g).rotation.y = Math.PI / 2;
    // door
    const door = mesh(new THREE.BoxGeometry(0.08, 2.1, 1.0), 0x5a3a24, 0.02);
    at(door, -3.88, 1.05, 0.9, g);
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), mat(C.yellow)), -3.82, 1.6, 0.9, g).rotation.z = Math.PI / 2;
    // floor lamp, boxes, rug
    at(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), 0x333333, 0), -3.2, 0.8, -3.0, g);
    at(mesh(new THREE.ConeGeometry(0.3, 0.35, 8, 1, true), 0xe8d8a0, 0.015), -3.2, 1.7, -3.0, g);
    at(this.homeLamp, -3.0, 1.9, -2.6, g);
    at(mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), 0xb8925a, 0.02), 3.3, 0.25, -0.5, g);
    at(mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), 0xa8824a, 0.02), 3.3, 0.7, -0.5, g).rotation.y = 0.3;
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.3, 10), mat(0x4a5a7a));
    rug.rotation.x = -Math.PI / 2;
    at(rug, -0.6, 0.01, 0.2, g);

    const hero = makePerson(LOOKS.hero(false));
    hero.root.scale.setScalar(1);
    g.add(hero.root);
    this.homeHero = hero;

    const cat = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(0.22, 0.2, 0.42), 0x3a3a3a, 0.015), 0, 0.14, 0, cat);
    at(mesh(new THREE.BoxGeometry(0.2, 0.18, 0.18), 0x3a3a3a, 0.015), 0, 0.28, 0.24, cat);
    for (const s of [-1, 1]) at(mesh(new THREE.ConeGeometry(0.05, 0.1, 4), 0x3a3a3a, 0.008), s * 0.06, 0.41, 0.24, cat);
    for (const s of [-1, 1]) at(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), mat(C.acid)), s * 0.05, 0.3, 0.335, cat);
    const tail = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.36), 0x3a3a3a, 0.008);
    tail.name = "tail";
    at(tail, 0, 0.24, -0.34, cat).rotation.x = -0.7;
    g.add(cat);
    cat.visible = false;
    this.homeCat = cat;
  }

  showHome(opts: { blackout: boolean; cat: boolean; night: boolean; hoodie: boolean; heat: number }): void {
    this.clearOuting();
    this.mode = "home";
    this.home.visible = true;
    this.out.visible = false;
    this.scene.fog = null;
    this.scene.background = new THREE.Color(opts.blackout ? 0x0c0c12 : 0x1b1a20);
    this.hemi.intensity = opts.blackout ? 0.25 : 1.0;
    this.hemi.color.set(0xfff0d8);
    this.sun.intensity = opts.blackout ? 0.15 : 1.1;
    this.sun.color.set(opts.night ? 0x8090c0 : 0xfff2dc);
    this.sun.position.set(4, 8, 6);
    this.sun.target.position.set(0, 0, 0);
    this.homeLamp.intensity = opts.blackout ? 0 : 6;
    this.candle.intensity = opts.blackout ? 4 : 0;
    this.windowMat.color.set(opts.blackout ? 0x101828 : opts.night ? 0x1a2440 : 0x9fc6e8);
    this.laptopScreen.color.set(opts.blackout ? 0x223040 : 0x6fb0ff);
    this.homeCat!.visible = opts.cat;
    this.homeCat!.position.set(-3.2, 0.62, -0.2);
    this.homeCat!.rotation.y = 1.2;
    this.homeVanT = opts.heat > 40 ? 0 : -1;
    if (this.homeVan) this.homeVan.visible = false;
    this.homePose = "idle";
    this.homePoseT = 0;
    // camera inside the room, looking into the corner
    const w = this.vw / this.vh;
    const dist = w < 0.6 ? 1.35 : 1;
    this.camera.position.set(4.6 * dist, 6.2 * dist, 7.4 * dist);
    this.camTarget.set(-0.3, 0.9, -0.9);
    this.camera.lookAt(this.camTarget);
  }

  setHomePose(pose: ActionId | "idle" | "hide"): void {
    this.homePose = pose;
    this.homePoseT = 0;
  }

  private updateHome(dt: number): void {
    const hero = this.homeHero!;
    this.homePoseT += dt;
    const t = this.homePoseT;
    hero.root.rotation.set(0, 0, 0);
    hero.body.rotation.set(0, 0, 0);
    hero.head.rotation.set(0, 0, 0);
    let speed = 0;
    let pose: "walk" | "sit" | "call" | "idle" = "idle";
    switch (this.homePose) {
      case "work":
        hero.root.position.set(1.9, 0.02, -1.95);
        hero.root.rotation.y = Math.PI;
        pose = "sit";
        break;
      case "eat":
        hero.root.position.set(-2.6, 0, 1.9);
        hero.root.rotation.y = -Math.PI / 2;
        break;
      case "sleep":
        hero.root.position.set(-3.2, 0.62, -0.9);
        hero.root.rotation.set(0, 0, 0);
        hero.body.rotation.x = -Math.PI / 2;
        hero.body.position.z = -0.6;
        break;
      case "scroll":
      case "cat":
        hero.root.position.set(-2.95, 0.28, -1.2);
        hero.root.rotation.y = Math.PI / 2;
        pose = "sit";
        break;
      case "mama":
        hero.root.position.set(1.5, 0, -2.0);
        hero.root.rotation.y = Math.PI * 0.85;
        pose = "call";
        break;
      case "pushups":
        hero.root.position.set(-0.6, 0.35, 0.3);
        hero.root.rotation.y = Math.PI / 2;
        hero.body.rotation.x = Math.PI / 2 - 0.05 + Math.sin(t * 6) * 0.06;
        hero.body.position.y = Math.sin(t * 6) * 0.08;
        break;
      case "hide":
        hero.root.position.set(-3.3, 0, 2.95);
        hero.root.rotation.y = 0.3;
        break;
      default:
        hero.root.position.set(-0.4 + Math.sin(t * 0.3) * 0.6, 0, 0.4);
        hero.root.rotation.y = Math.sin(t * 0.3) > 0 ? 0.6 : -0.4;
        speed = Math.abs(Math.cos(t * 0.3)) * 0.6;
        pose = "walk";
    }
    if (this.homePose !== "sleep") hero.body.position.z = 0;
    if (this.homePose === "sleep" || this.homePose === "pushups") {
      hero.legL.rotation.x = hero.legR.rotation.x = 0;
      hero.armL.rotation.x = hero.armR.rotation.x = this.homePose === "pushups" ? -Math.PI / 2 : 0;
    } else animateRig(hero, speed, dt, pose);
    if (this.homePose === "work") {
      hero.armL.rotation.x = -1.2 + Math.sin(t * 22) * 0.12;
      hero.armR.rotation.x = -1.2 + Math.cos(t * 19) * 0.12;
      this.laptopScreen.color.setHSL(0.58, 0.6, 0.55 + Math.sin(t * 8) * 0.05);
    }
    if (this.homePose === "eat") hero.armR.rotation.x = -2 + Math.sin(t * 5) * 0.4;
    if (this.homePose === "scroll") { hero.armR.rotation.x = -1.4; hero.head.rotation.x = 0.4; }
    if (this.homeCat?.visible) {
      const tail = this.homeCat.getObjectByName("tail");
      if (tail) tail.rotation.y = Math.sin(t * 3) * 0.4;
      if (this.homePose === "cat") {
        hero.armR.rotation.x = -1.0 + Math.sin(t * 4) * 0.3;
        this.homeCat.position.set(-2.5, 0.62, -1.2);
      } else this.homeCat.position.set(-3.2, 0.62, -0.2);
    }
    this.candle.intensity = this.candle.intensity > 0 ? 3.4 + Math.sin(t * 13) * 0.4 + Math.sin(t * 7.3) * 0.3 : 0;
    if (this.homeVan && this.homeVanT >= 0) {
      this.homeVanT += dt;
      const k = (this.homeVanT % 14) / 3.5;
      this.homeVan.visible = k < 1;
      if (k < 1) this.homeVan.position.set(1.35 + k * 1.1, 1.2, -3.22);
    }
  }

  // =================================================================== OUTING

  private clearOuting(): void {
    this.sim = null;
    this.out.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.Material[];
      for (const x of mats) {
        const map = (x as THREE.MeshLambertMaterial).map;
        if (map && map !== this.camoTck && map !== this.camoGuard) map.dispose();
        // shared cached flat materials stay
        if ((x as THREE.MeshLambertMaterial).map || (x as THREE.Material).transparent) x.dispose();
      }
    });
    this.out.clear();
    this.statics.clear();
    this.out.add(this.statics);
    for (const l of this.lampLights) this.scene.remove(l);
    this.lampLights = [];
    this.lampSpots = [];
    this.patrolViews.forEach((v) => v.tag.remove());
    this.patrolViews.clear();
    this.babkaTags.forEach((t) => t.remove());
    this.objMarkers.forEach((m) => m.tag.remove());
    this.exitMarker?.tag.remove();
    this.heroTag?.remove();
    this.bubbles.forEach((b) => b.el.remove());
    this.arrows.forEach((a) => a.remove());
    this.babkaRigs = [];
    this.babkaRings = [];
    this.babkaTags = [];
    this.dogModels = [];
    this.objMarkers = [];
    this.exitMarker = null;
    this.heroTag = null;
    this.bubbles = [];
    this.arrows = [];
    this.fades = [];
    this.water = [];
    this.noiseRings = [];
    this.precip = null;
    this.precipKind = null;
    this.vaultMarker = null;
    this.hero = null;
  }

  startOuting(sim: OutingSim, opts: { hoodie: boolean; intel: boolean; arrows: boolean }): void {
    this.clearOuting();
    this.sim = sim;
    this.level = sim.level;
    this.mode = "outing";
    this.paused = false;
    this.home.visible = false;
    this.out.visible = true;
    const map = MAPS[sim.level.map];
    this.showArrows = opts.arrows;
    const look = map.look;
    this.camOffset.set(0, look === "train" ? 17 : look === "indoor" ? 21 : 31, look === "train" ? 8.5 : look === "indoor" ? 11 : 17);
    this.setAtmosphere(sim.level, map, this.camOffset.length());
    this.buildGround(sim, map);
    this.buildCells(sim, map);
    this.buildOutskirts(sim, map);
    this.buildMarkers(sim);
    this.batch();
    this.buildActors(sim, opts.hoodie);
    if (opts.intel) this.buildRoutes(sim);
    this.buildWeather(sim.level);
    this.camTarget.set(sim.px, 0, sim.pz);
    this.placeCamera(1);
  }
  private showArrows = false;

  private setAtmosphere(lv: LevelDef, map: MapDef, dist: number): void {
    const night = !!lv.night;
    let bg = 0x9fb6c8;
    // fog distances start at the camera, which hangs ~35 m above the player
    let fog: [number, number] = [dist + 20, dist + 80];
    if (lv.weather === "rain") { bg = 0x7d8a96; fog = [dist + 8, dist + 55]; }
    if (lv.weather === "fog") { bg = 0xb8bec0; fog = [dist - 4, dist + 26]; }
    if (lv.weather === "snow") { bg = 0xc8d0d8; fog = [dist + 4, dist + 48]; }
    if (night) { bg = 0x0b1020; fog = [dist + 2, dist + 40]; }
    if (map.look === "indoor" || map.look === "train") fog = [dist + 30, dist + 120];
    this.scene.background = new THREE.Color(bg);
    this.scene.fog = new THREE.Fog(bg, fog[0], fog[1]);
    this.hemi.color.set(night ? 0x5a6a9a : 0xdfe8ff);
    this.hemi.groundColor.set(night ? 0x101018 : 0x4a4a3a);
    this.hemi.intensity = night ? 0.55 : lv.weather === "clear" ? 1.25 : 1.0;
    this.sun.color.set(night ? 0x8fa0ff : lv.weather === "clear" ? 0xfff0d8 : 0xe8ecf0);
    this.sun.intensity = night ? 0.45 : lv.weather === "clear" ? 2.0 : 1.2;
    if (map.look === "indoor" || map.look === "train") {
      // the lights are on inside, whatever the hour
      this.hemi.color.set(0xfff2dc);
      this.hemi.groundColor.set(0x5a4a3a);
      this.hemi.intensity = 1.35;
      this.sun.color.set(0xfff0d8);
      this.sun.intensity = 1.1;
      this.scene.background = new THREE.Color(0x141218);
    }
  }

  /** One canvas for the whole floor: asphalt, tiles, grass, rails, zebras, linoleum. */
  private buildGround(sim: OutingSim, map: MapDef): void {
    const P = 48;
    const rows = map.rows;
    const night = !!sim.level.night;
    const snow = sim.level.weather === "snow";
    const tex = canvasTexture(sim.w * P, sim.h * P, (g) => {
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let r = 0; r < sim.h; r++) {
        for (let c = 0; c < sim.w; c++) {
          const raw = rows[r][c];
          let ch = floorOf(rows, r, c);
          if (raw === "^" || raw === "%") ch = ".";
          const x = c * P;
          const y = r * P;
          const indoor = map.look === "indoor";
          const train = map.look === "train";
          if (indoor || train) {
            g.fillStyle = train ? "#8a6a4a" : (r + c) % 2 ? "#c8b898" : "#b8a684";
            g.fillRect(x, y, P, P);
            if (indoor) {
              g.strokeStyle = "rgba(0,0,0,.15)";
              for (let i = 0; i < P; i += P / 4) { g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i, y + P); g.stroke(); g.beginPath(); g.moveTo(x, y + i); g.lineTo(x + P, y + i); g.stroke(); }
            }
            if (train && c === 3) { g.fillStyle = "#8a2a2a"; g.fillRect(x + 8, y, P - 16, P); g.fillStyle = "#c8a040"; g.fillRect(x + 10, y, 3, P); g.fillRect(x + P - 13, y, 3, P); }
            continue;
          }
          switch (ch) {
            case "=":
              g.fillStyle = "#4a4c50";
              g.fillRect(x, y, P, P);
              for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`; g.fillRect(x + rnd() * P, y + rnd() * P, 2, 2); }
              if (rnd() < 0.15) { g.strokeStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.moveTo(x + rnd() * P, y + rnd() * P); g.lineTo(x + rnd() * P, y + rnd() * P); g.stroke(); }
              break;
            case "-":
              if (sim.level.map === "station") {
                g.fillStyle = "#5a4e44";
                g.fillRect(x, y, P, P);
                g.fillStyle = "#3a2a1e";
                for (let i = 0; i < 4; i++) g.fillRect(x + i * 12 + 2, y + 6, 6, P - 12);
                g.fillStyle = "#9aa0a4";
                g.fillRect(x, y + 12, P, 4);
                g.fillRect(x, y + P - 16, P, 4);
              } else {
                g.fillStyle = "#4a4c50";
                g.fillRect(x, y, P, P);
                g.fillStyle = "#e8e4d8";
                for (let i = 0; i < 4; i++) g.fillRect(x + i * 12 + 2, y + 4, 7, P - 8);
              }
              break;
            case ":":
              g.fillStyle = "#9a948a";
              g.fillRect(x, y, P, P);
              g.strokeStyle = "rgba(0,0,0,.18)";
              for (let i = 0; i <= P; i += 12) { g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i, y + P); g.stroke(); g.beginPath(); g.moveTo(x, y + i); g.lineTo(x + P, y + i); g.stroke(); }
              if (rnd() < 0.3) { g.fillStyle = "rgba(60,50,40,.25)"; g.fillRect(x + rnd() * 30, y + rnd() * 30, 12, 8); }
              break;
            case "~":
              g.fillStyle = "#2a4a5a";
              g.fillRect(x, y, P, P);
              break;
            default: {
              const woods = map.look === "woods";
              g.fillStyle = snow ? "#d8dde0" : woods ? "#4a5a32" : "#6a7a3a";
              g.fillRect(x, y, P, P);
              for (let i = 0; i < 26; i++) {
                const leaf = !snow && rnd() < (woods ? 0.5 : 0.35);
                g.fillStyle = leaf ? ["#c98a2a", "#a85a2a", "#d8b040"][Math.floor(rnd() * 3)] : snow ? "#eef2f4" : "#5a6a2e";
                g.fillRect(x + rnd() * P, y + rnd() * P, 3, 3);
              }
            }
          }
          // blocked cells get a darker footprint under the geometry
          if ("#GK".includes(raw)) { g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x, y, P, P); }
        }
      }
      if (night) { g.fillStyle = "rgba(10,14,40,.25)"; g.fillRect(0, 0, sim.w * P, sim.h * P); }
    }, false);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(sim.width, sim.depth), new THREE.MeshLambertMaterial({ map: tex }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(sim.width / 2, 0, sim.depth / 2);
    plane.receiveShadow = true;
    this.out.add(plane);
    // a wide skirt so the map does not float in the void
    const skirtColor = map.look === "woods" ? (snow ? 0xd8dde0 : 0x3a4a2a) : map.look === "town" ? 0x5a5c58 : 0x18161a;
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(sim.width + 120, sim.depth + 120), mat(skirtColor));
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(sim.width / 2, -0.02, sim.depth / 2);
    this.out.add(skirt);
  }

  /** Scenery beyond the playable edge so the map does not end in a void. */
  private buildOutskirts(sim: OutingSim, map: MapDef): void {
    const g = this.statics;
    const W = sim.width;
    const D = sim.depth;
    const snow = sim.level.weather === "snow";
    if (map.look === "woods") {
      let i = 0;
      for (let z = -9; z < D + 9; z += 2.6) for (const x of [-2, -5.5, -9, W + 2, W + 5.5, W + 9]) at(makePine(i++, snow), x + ((i * 7) % 5) * 0.3, 0, z, g);
      for (let x = -9; x < W + 9; x += 2.6) for (const z of [-2, -5.5, -9]) at(makePine(i++, snow), x, 0, z + ((i * 3) % 5) * 0.3, g);
      return;
    }
    if (map.look !== "town") return;
    const facade = facadeTexture(0xc8c4b8, 77, !!sim.level.night);
    facade.repeat.set(1, 1);
    const side = new THREE.MeshLambertMaterial({ map: facade });
    const roof = new THREE.MeshLambertMaterial({ color: 0x4a4746 });
    const block = (x: number, z: number, w: number, d: number, h: number) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
      box.receiveShadow = true;
      at(box, x, h / 2, z, g);
    };
    let n = 0;
    for (let z = -4; z < D + 12; z += 13) {
      const h = 9 + (n++ % 3) * 3;
      block(-8, z, 10, 11, h);
      block(W + 8, z + 6, 10, 11, 12 - (n % 2) * 3);
    }
    for (let x = 6; x < W; x += 14) block(x, -9, 12, 10, 12 + (n++ % 2) * 3);
    for (let i = 0; i < 8; i++) {
      at(makeTree(i + 40, true), -2.2, 0, 4 + i * (D / 8), g);
      at(makeTree(i + 60, true), W + 2.2, 0, 2 + i * (D / 8), g);
    }
  }

  /** Greedy rectangles of one character, for buildings and garages. */
  private rects(cells: string[][], ch: string): Array<{ r: number; c: number; h: number; w: number }> {
    const H = cells.length;
    const W = cells[0].length;
    const used = cells.map((row) => row.map(() => false));
    const out: Array<{ r: number; c: number; h: number; w: number }> = [];
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (used[r][c] || cells[r][c] !== ch) continue;
        let w = 1;
        while (c + w < W && cells[r][c + w] === ch && !used[r][c + w]) w++;
        let h = 1;
        outer: while (r + h < H) {
          for (let k = 0; k < w; k++) if (cells[r + h][c + k] !== ch || used[r + h][c + k]) break outer;
          h++;
        }
        for (let i = 0; i < h; i++) for (let k = 0; k < w; k++) used[r + i][c + k] = true;
        out.push({ r, c, h, w });
      }
    }
    return out;
  }

  private buildCells(sim: OutingSim, map: MapDef): void {
    const g = this.statics;
    const cells = sim.cells;
    const night = !!sim.level.night;
    const look = map.look;
    const snow = sim.level.weather === "snow";
    let seed = 1;

    // ---- walls / buildings
    if (look === "town") {
      const palette = [0xd8d0c0, 0xc8c8c0, 0xbfcad0, 0xd8c8a8, 0xc0b8b0];
      for (const rc of this.rects(cells, "#")) {
        const floors = 3 + ((rc.r * 7 + rc.c * 3) % 2);
        const height = floors * 3;
        const w = rc.w * CELL;
        const d = rc.h * CELL;
        const ft = facadeTexture(palette[(rc.r + rc.c) % palette.length], seed++, night);
        ft.repeat.set(w / 12, height / 12);
        const ftz = ft.clone();
        ftz.repeat.set(d / 12, height / 12);
        ftz.needsUpdate = true;
        const side = new THREE.MeshLambertMaterial({ map: ft });
        const end = new THREE.MeshLambertMaterial({ map: ftz });
        const rt = roofTexture(seed++);
        rt.repeat.set(w / 6, d / 6);
        const roof = new THREE.MeshLambertMaterial({ map: rt });
        const mats = [end, end, roof, roof, side, side];
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mats);
        box.castShadow = true;
        box.receiveShadow = true;
        at(box, rc.c * CELL + w / 2, height / 2, rc.r * CELL + d / 2, g);
        // parapet and roof clutter: the camera mostly sees roofs
        const par = mesh(new THREE.BoxGeometry(w + 0.2, 0.4, d + 0.2), new THREE.MeshLambertMaterial({ color: 0x6a6460, flatShading: true }), 0.03, false);
        par.userData.noBatch = true;
        at(par, rc.c * CELL + w / 2, height + 0.05, rc.r * CELL + d / 2, g);
        const inner = new THREE.Mesh(new THREE.BoxGeometry(w - 0.5, 0.42, d - 0.5), roof);
        at(inner, rc.c * CELL + w / 2, height + 0.08, rc.r * CELL + d / 2, g);
        for (let i = 0; i < Math.max(1, Math.floor((w * d) / 30)); i++) {
          const vent = mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), 0x8a8580, 0.02);
          at(vent, rc.c * CELL + 1 + ((i * 3.7) % (w - 2)), height + 0.5, rc.r * CELL + 1 + ((i * 2.3) % Math.max(1, d - 2)), g);
        }
        if (w * d > 30) {
          const ant = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4), 0x333333, 0);
          at(ant, rc.c * CELL + w * 0.7, height + 0.9, rc.r * CELL + d * 0.3, g);
        }
        this.fades.push({ mesh: box, x0: rc.c * CELL, x1: (rc.c + rc.w) * CELL, z0: rc.r * CELL, height, mats: [side, end, roof, par.material as THREE.Material] });
      }
    } else {
      const wallH = look === "train" ? 2.4 : look === "indoor" ? 2.8 : 3;
      const wallTex = look === "train" ? null : wallpaperTexture("#c8c0a0", "#b0a888");
      for (const rc of this.rects(cells, "#")) {
        const w = rc.w * CELL;
        const d = rc.h * CELL;
        let side: THREE.Material;
        if (wallTex) {
          const t = wallTex.clone();
          t.needsUpdate = true;
          t.repeat.set(Math.max(w, d) / 3, 1);
          side = new THREE.MeshLambertMaterial({ map: t });
        } else side = new THREE.MeshLambertMaterial({ color: 0x7a9a8a, flatShading: true });
        const top = new THREE.MeshLambertMaterial({ color: look === "train" ? 0x3a4a44 : 0x6a5a48 });
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), [side, side, top, top, side, side]);
        box.castShadow = true;
        box.receiveShadow = true;
        at(box, rc.c * CELL + w / 2, wallH / 2, rc.r * CELL + d / 2, g);
        this.fades.push({ mesh: box, x0: rc.c * CELL, x1: (rc.c + rc.w) * CELL, z0: rc.r * CELL, height: wallH, mats: [side, top] });
      }
      if (look === "train") {
        // windows along the outer walls
        for (let r = 1; r < sim.h - 1; r += 2) {
          for (const x of [0.05, sim.width - 0.05]) {
            const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ color: night ? 0x18203a : 0x9fc6e8, side: THREE.DoubleSide }));
            win.rotation.y = Math.PI / 2;
            at(win, x === 0.05 ? CELL + 0.02 : sim.width - CELL - 0.02, 1.6, (r + 0.5) * CELL, g);
          }
        }
      }
    }

    // ---- garages
    for (const rc of this.rects(cells, "G")) {
      const w = rc.w * CELL;
      const d = rc.h * CELL;
      const gt = garageTexture(seed++);
      gt.repeat.set(w / 6, 1);
      const side = new THREE.MeshLambertMaterial({ map: gt });
      const roof = new THREE.MeshLambertMaterial({ color: 0x3a3330 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, d), [side, side, roof, roof, side, side]);
      box.castShadow = true;
      box.receiveShadow = true;
      at(box, rc.c * CELL + w / 2, 1.3, rc.r * CELL + d / 2, g);
    }

    // ---- kiosks / shops / houses, signs facing their objective
    const signFor = (r: number, c: number): { label: string; dir: [number, number] } | null => {
      for (const o of sim.objectives) {
        const oc = sim.cellAt(o.x, o.z);
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          if (oc.r + dr === r && oc.c + dc === c) return { label: o.def.label.split(":")[0].toUpperCase(), dir: [-dr, -dc] };
        }
      }
      return null;
    };
    const kioskColors = [0x2a7a6a, 0xd8a030, 0x9a3a3a, 0x3a5a9a, 0x6a8a3a];
    for (const rc of this.rects(cells, "K")) {
      const w = rc.w * CELL;
      const d = rc.h * CELL;
      const cx = rc.c * CELL + w / 2;
      const cz = rc.r * CELL + d / 2;
      if (look === "woods") {
        at(makeHouse(w - 0.4, d - 0.4, seed++), cx, 0, cz, g);
      } else {
        const color = kioskColors[(rc.r * 3 + rc.c) % kioskColors.length];
        const h = sim.level.map === "checkpoint" ? 2.8 : 3.4;
        at(mesh(new THREE.BoxGeometry(w - 0.2, h, d - 0.2), color, 0.04), cx, h / 2, cz, g);
        at(mesh(new THREE.BoxGeometry(w + 0.2, 0.25, d + 0.2), 0xe8e4d8, 0.03), cx, h + 0.1, cz, g);
      }
      // a sign on each face that has an objective in front
      for (let r = rc.r; r < rc.r + rc.h; r++) for (let c = rc.c; c < rc.c + rc.w; c++) {
        const s = signFor(r, c);
        if (!s) continue;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: signTexture(s.label, "#f2b632", "#171318"), side: THREE.DoubleSide }));
        const p = sim.center(r, c);
        const [dr, dc] = s.dir;
        sign.position.set(p.x - dc * (CELL / 2 + 0.06), look === "woods" ? 2.3 : 2.75, p.z - dr * (CELL / 2 + 0.06));
        sign.rotation.y = Math.atan2(-dc, -dr);
        if (dr === -1) sign.rotation.x = -0.5;
        g.add(sign);
      }
    }

    // ---- water bodies
    for (const rc of this.rects(cells, "~")) {
      const w = rc.w * CELL;
      const d = rc.h * CELL;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d, Math.max(2, rc.w * 2), Math.max(2, rc.h * 2)), new THREE.MeshLambertMaterial({ color: night ? 0x1a2e44 : 0x3f7f95, transparent: true, opacity: 0.88, flatShading: true }));
      water.rotation.x = -Math.PI / 2;
      at(water, rc.c * CELL + w / 2, 0.08, rc.r * CELL + d / 2, this.out);
      this.water.push(water);
      if (rc.w * rc.h < 6) {
        // fountain rim
        const rim = mesh(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), 0xb8b0a0, 0.03);
        (rim.material as THREE.Material).side = THREE.DoubleSide;
        at(rim, rc.c * CELL + w / 2, 0.2, rc.r * CELL + d / 2, g).scale.y = 1;
        water.position.y = 0.46;
      }
    }

    // ---- train cars on the station tracks
    if (sim.level.map === "station") {
      for (const rc of this.rects(cells, "&")) {
        const w = rc.w * CELL;
        const d = rc.h * CELL;
        const color = rc.r < 3 ? 0x2a5a8a : 0x5a3a2a;
        const car = mesh(new THREE.BoxGeometry(w - 0.3, 3.4, d - 0.4), color, 0.04);
        at(car, rc.c * CELL + w / 2, 1.9, rc.r * CELL + d / 2, g);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(w - 0.28, 0.25, d - 0.38), mat(0xe8e4d8));
        at(stripe, rc.c * CELL + w / 2, 1.2, rc.r * CELL + d / 2, g);
        for (let i = 0; i < rc.w; i++) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, d - 0.36), mat(night ? 0xffd27a : 0x9fc6e8));
          at(win, rc.c * CELL + i * CELL + 1.5, 2.6, rc.r * CELL + d / 2, g);
        }
      }
    }

    // ---- per-cell props
    for (let r = 0; r < sim.h; r++) {
      for (let c = 0; c < sim.w; c++) {
        const ch = cells[r][c];
        const raw = sim.rows[r][c];
        const p = sim.center(r, c);
        const s = r * 31 + c * 17;
        switch (ch) {
          case "Y":
            if (look === "woods" || sim.level.map === "park") {
              for (let i = 0; i < 2; i++) {
                const tree = look === "woods" ? makePine(s + i, snow) : makeTree(s + i, true);
                at(tree, p.x + (i ? 0.7 : -0.6), 0, p.z + (i ? -0.6 : 0.5), g);
              }
            }
            break;
          case "T": {
            const tree = look === "woods" && (s % 3) ? makePine(s, snow) : makeTree(s, true);
            at(tree, p.x + ((s % 5) - 2) * 0.25, 0, p.z + ((s % 7) - 3) * 0.2, g);
            break;
          }
          case "*":
            if (look === "indoor") at(makePlant(), p.x, 0, p.z, g);
            else if (look === "train") {
              const bag = mesh(new THREE.BoxGeometry(1.4, 0.8, 1.0), 0x6a4a3a, 0.025);
              at(bag, p.x, 0.4, p.z, g).rotation.y = 0.3;
            } else at(makeBush(s, snow ? 0x8a9a8a : 0x4f7a3a), p.x, 0, p.z, g);
            break;
          case "+":
            this.buildDoor(sim, r, c, look);
            break;
          case "%":
          case "^":
            this.buildFence(sim, r, c, ch === "^", look);
            break;
          case "&":
            if (sim.level.map !== "station") {
              const car = makeCar(s);
              car.rotation.y = (s % 2 ? 0 : Math.PI) + (cells[r][c - 1] === "&" || cells[r][c + 1] === "&" ? 0 : 0);
              at(car, p.x, 0, p.z, g);
            }
            break;
          case "W":
            if (look === "indoor") at(makeDesk(s, "office"), p.x, 0, p.z, g);
            else if (look === "train") at(makeDesk(s, "train"), p.x, 0, p.z, g);
            else at(makeStall(s), p.x, 0, p.z, g);
            break;
          case "B":
            at(makeBench(), p.x, 0, p.z - 0.4, g);
            break;
          case "D":
            at(makeKennel(), p.x, 0, p.z, g);
            break;
          case "L":
            at(makeLamp(), p.x, 0, p.z, g);
            this.lampSpots.push(V(p.x, 4, p.z));
            break;
        }
        // street lamps along pavements next to roads
        if (look === "town" && raw === ":" && (r * 5 + c * 3) % 7 === 0 && [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dr, dc]) => sim.rows[r + dr]?.[c + dc] === "=")) {
          const lamp = makeLamp();
          at(lamp, p.x + 1.1, 0, p.z + 1.1, g);
          this.lampSpots.push(V(p.x + 1.1, 4, p.z + 1.1));
        }
      }
    }
    // trash bins for the very first errand
    for (const o of sim.objectives) if (o.def.icon === "🗑️") at(makeTrashBins(), o.x - 0.6, 0, o.z - 1.1, g);

    if (night) {
      for (let i = 0; i < 4; i++) {
        const l = new THREE.PointLight(0xffc870, 0, 13, 1.6);
        this.scene.add(l);
        this.lampLights.push(l);
      }
    }
  }

  /** Merge static props by material: thousands of little meshes become a few dozen draws. */
  private batch(): void {
    const g = this.statics;
    g.updateMatrixWorld(true);
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const keep: THREE.Object3D[] = [];
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (Array.isArray(m.material) || m.userData.noBatch) { keep.push(m); return; }
      let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name);
      if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo = geo.applyMatrix4(m.matrixWorld);
      const list = buckets.get(m.material) ?? [];
      list.push(geo);
      buckets.set(m.material, list);
    });
    // keepers are re-parented with their world transforms
    for (const k of keep) {
      k.updateMatrixWorld(true);
      k.matrixWorld.decompose(k.position, k.quaternion, k.scale);
    }
    g.clear();
    // their hull children were merged above
    for (const k of keep) { k.clear(); g.add(k); }
    for (const [material, geos] of buckets) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((x) => x.dispose());
      if (!merged) continue;
      const m = new THREE.Mesh(merged, material);
      m.castShadow = !(material as THREE.MeshBasicMaterial).transparent;
      m.receiveShadow = true;
      g.add(m);
    }
  }

  private buildDoor(sim: OutingSim, r: number, c: number, look: MapDef["look"]): void {
    const p = sim.center(r, c);
    const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const wall = dirs.find(([dr, dc]) => sim.cells[r + dr]?.[c + dc] === "#");
    if (look === "train") {
      const door = mesh(new THREE.BoxGeometry(1.8, 2.2, 0.15), 0x8a8a7a, 0.02);
      at(door, p.x, 1.1, p.z + (r === 1 ? -1.3 : 1.3), this.statics);
      return;
    }
    if (!wall) return;
    const [dr, dc] = wall;
    const door = mesh(new THREE.BoxGeometry(dc ? 0.12 : 1.4, 2.2, dr ? 0.12 : 1.4), 0x4a3424, 0.02);
    at(door, p.x + dc * (CELL / 2 - 0.05), 1.1, p.z + dr * (CELL / 2 - 0.05), this.statics);
    if (look === "town") {
      const canopy = mesh(new THREE.BoxGeometry(dc ? 1.4 : 2.2, 0.12, dr ? 1.4 : 2.2), 0x8a8580, 0.02);
      at(canopy, p.x + dc * (CELL / 2 - 0.7), 2.6, p.z + dr * (CELL / 2 - 0.7), this.statics);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.2), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
      at(bulb, p.x + dc * (CELL / 2 - 0.25), 2.45, p.z + dr * (CELL / 2 - 0.25), this.statics);
    }
  }

  private buildFence(sim: OutingSim, r: number, c: number, vault: boolean, look: MapDef["look"]): void {
    const p = sim.center(r, c);
    const color = vault ? 0x8a6a3a : look === "woods" ? 0x6a5030 : 0x3a6a4a;
    const h = vault ? 1.15 : 1.7;
    const link = (ch: string | undefined) => ch === "%" || ch === "^";
    const horiz = link(sim.cells[r][c - 1]) || link(sim.cells[r][c + 1]);
    const vert = link(sim.cells[r - 1]?.[c]) || link(sim.cells[r + 1]?.[c]);
    const parts: Array<[number, number]> = [];
    if (horiz || !vert) parts.push([CELL, 0.12]);
    if (vert) parts.push([0.12, CELL]);
    for (const [w, d] of parts) {
      const panel = mesh(new THREE.BoxGeometry(w, h, d), color, 0.025);
      at(panel, p.x, h / 2, p.z, this.statics);
      if (vault) {
        // planks so it reads as climbable
        for (let i = -1; i <= 1; i++) {
          const plank = new THREE.Mesh(new THREE.BoxGeometry(w > 1 ? 0.12 : 0.16, h + 0.15, d > 1 ? 0.12 : 0.16), mat(0x6a4a24));
          at(plank, p.x + (w > 1 ? i : 0), h / 2, p.z + (d > 1 ? i : 0), this.statics);
        }
      }
    }
  }

  private buildMarkers(sim: OutingSim): void {
    for (const o of sim.objectives) {
      const ring = makeRing(1.3, o.def.optional ? 0x54b7c6 : 0xf2b632, 0.85);
      at(ring, o.x, 0.06, o.z, this.out);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.9, 7, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: o.def.optional ? 0x54b7c6 : 0xf2b632, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
      );
      at(beam, o.x, 3.5, o.z, this.out);
      const tag = this.tag("obj", `<b>${o.def.icon}</b><span>${o.def.label}</span><i></i>`);
      this.objMarkers.push({ ring, beam, tag, slot: o.slot });
      // talking objectives get a person standing there
      if (o.def.kind === "talk" || (o.def.kind === "pay" && sim.level.path !== "common")) {
        const who = o.def.talk === "molfar" ? LOOKS.molfar() : o.def.talk?.startsWith("arkadiy") ? LOOKS.arkadiy() : LOOKS.clerk();
        const npc = makePerson(who);
        const c = sim.cellAt(o.x, o.z);
        const back = ([[-1, 0], [0, -1], [0, 1], [1, 0]] as Array<[number, number]>).find(([dr, dc]) => "#KGW".includes(sim.cells[c.r + dr]?.[c.c + dc] ?? "")) ?? [-1, 0];
        npc.root.position.set(o.x + back[1] * 1.0, 0, o.z + back[0] * 1.0);
        npc.root.rotation.y = Math.atan2(-back[1], -back[0]);
        this.statics.add(npc.root);
      }
    }
    const ring = makeRing(1.3, 0x8fe36b, 0.9);
    at(ring, sim.exit.x, 0.06, sim.exit.z, this.out);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, 7, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x8fe36b, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    );
    at(beam, sim.exit.x, 3.5, sim.exit.z, this.out);
    const exitLabel = sim.level.map === "train" ? "ТАМБУР" : sim.rows.some((r) => r.includes("!")) ? "ДАЛІ" : "ДОДОМУ";
    const tag = this.tag("obj exit", `<b>🏠</b><span>${exitLabel}</span>`);
    this.exitMarker = { ring, beam, tag };
    this.vaultMarker = makeRing(0.9, 0xb8d84a, 0.9);
    this.vaultMarker.visible = false;
    this.out.add(this.vaultMarker);
  }

  private buildActors(sim: OutingSim, hoodie: boolean): void {
    this.hero = makePerson(LOOKS.hero(hoodie));
    this.out.add(this.hero.root);
    this.heroTag = this.tag("hero-tag", "");
    for (const b of sim.babki) {
      const rig = makePerson(LOOKS.babka());
      rig.root.position.set(b.x, 0.1, b.z - 0.45);
      this.out.add(rig.root);
      this.babkaRigs.push(rig);
      const ring = makeRing(5.5, b.friendly ? 0x8fe36b : 0xe8602f, b.friendly ? 0.18 : 0.3);
      at(ring, b.x, 0.05, b.z, this.out);
      this.babkaRings.push(ring);
      this.babkaTags.push(this.tag("npc-tag", b.friendly ? "💚" : "👵"));
    }
    for (const d of sim.dogs) {
      const dog = makeDog();
      at(dog, d.x, 0, d.z + 0.4, this.out);
      this.dogModels.push(dog);
    }
    this.syncPatrols(sim);
  }

  private makePatrolView(p: Patrol): PatrolView {
    let obj: THREE.Object3D;
    let rig: Rig | undefined;
    let follower: Rig | undefined;
    let fan: THREE.Mesh | undefined;
    let ring: THREE.Mesh | undefined;
    switch (p.kind) {
      case "van":
        obj = makeVan();
        break;
      case "drone":
        obj = makeDrone();
        ring = makeRing(this.sim!.range(p), 0xff4a3a, 0.35);
        this.out.add(ring);
        break;
      case "boat":
        obj = makeBoat();
        break;
      default: {
        const look = p.kind === "police" ? LOOKS.police() : p.kind === "guard" ? LOOKS.guard(this.camoGuard) : LOOKS.officer(this.camoTck);
        rig = makePerson(look);
        obj = rig.root;
        if (p.kind === "officer" && !p.home) {
          follower = makePerson(LOOKS.officer(this.camoTck));
          follower.root.position.set(p.x, 0, p.z + 1);
          this.out.add(follower.root);
        }
        // a folder of summonses
        const folder = mesh(new THREE.BoxGeometry(0.3, 0.04, 0.4), p.kind === "officer" ? 0x2a5a9a : 0x222222, 0.01);
        rig.hand.add(folder);
      }
    }
    if (p.kind !== "drone") {
      fan = makeFan(FAN_SEGMENTS);
      this.out.add(fan);
    }
    obj.position.set(p.x, 0, p.z);
    this.out.add(obj);
    const icon = p.kind === "van" ? "🚐" : p.kind === "drone" ? "🛸" : p.kind === "boat" ? "🚤" : p.kind === "police" ? "🚓" : "";
    return { id: p.id, kind: p.kind, obj, rig, follower, fx: p.x, fz: p.z + 1, fan, ring, tag: this.tag("patrol-tag", icon) };
  }

  private syncPatrols(sim: OutingSim): void {
    const alive = new Set(sim.patrols.map((p) => p.id));
    for (const [id, v] of this.patrolViews) {
      if (alive.has(id)) continue;
      this.out.remove(v.obj);
      if (v.follower) this.out.remove(v.follower.root);
      if (v.fan) this.out.remove(v.fan);
      if (v.ring) this.out.remove(v.ring);
      v.tag.remove();
      this.patrolViews.delete(id);
    }
    for (const p of sim.patrols) if (!this.patrolViews.has(p.id)) this.patrolViews.set(p.id, this.makePatrolView(p));
  }

  private buildRoutes(sim: OutingSim): void {
    const group = new THREE.Group();
    for (const p of sim.patrols) {
      if (p.route.length < 2) continue;
      const pts = [...p.route, ...(p.ping ? [] : [p.route[0]])].map((w) => V(w.x, 0.09, w.z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xff5a4a, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.8 }));
      line.computeLineDistances();
      group.add(line);
    }
    this.out.add(group);
  }

  private buildWeather(lv: LevelDef): void {
    if (lv.weather === "rain") {
      const n = 900;
      const pos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 40;
        const y = Math.random() * 22;
        const z = (Math.random() - 0.5) * 40;
        pos.set([x, y, z, x + 0.05, y - 0.7, z + 0.05], i * 6);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.precip = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc8d8e8, transparent: true, opacity: 0.45 }));
      this.precipKind = "rain";
    } else if (lv.weather === "snow") {
      const n = 900;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 40, Math.random() * 22, (Math.random() - 0.5) * 40], i * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.precip = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.9 }));
      this.precipKind = "snow";
    }
    if (this.precip) {
      this.precip.frustumCulled = false;
      this.out.add(this.precip);
    }
  }

  // =================================================================== overlay

  private tag(cls: string, html: string): HTMLElement {
    const el = document.createElement("div");
    el.className = `fx-tag3 ${cls}`;
    el.innerHTML = html;
    this.fxLayer.appendChild(el);
    return el;
  }

  private project(x: number, y: number, z: number): { x: number; y: number; on: boolean; behind: boolean } {
    const v = V(x, y, z).project(this.camera);
    const w = this.vw;
    const h = this.vh;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, on: Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 && v.z < 1, behind: v.z > 1 };
  }

  private place(el: HTMLElement, x: number, y: number, z: number): boolean {
    const s = this.project(x, y, z);
    el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    el.style.visibility = s.behind ? "hidden" : "visible";
    return s.on;
  }

  say(x: number, z: number, text: string, kind: "enemy" | "me" | "babka" = "enemy"): void {
    const el = document.createElement("div");
    el.className = `fx-bubble3 ${kind}`;
    el.innerHTML = `<span></span>`;
    el.querySelector("span")!.textContent = text;
    this.fxLayer.appendChild(el);
    this.bubbles.push({ el, x, y: 3.1, z, until: performance.now() + 2100 });
  }

  floatText(text: string, color: string): void {
    if (!this.hero) return;
    const s = this.project(this.hero.root.position.x, 2.6, this.hero.root.position.z);
    const el = document.createElement("div");
    el.className = "fx-text";
    el.textContent = text;
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
    el.style.color = color;
    el.style.fontSize = "26px";
    this.fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  addShake(v: number): void { this.shake = Math.max(this.shake, v); }

  private edgeArrow(i: number, wx: number, wz: number, cls: string, label: string): void {
    let el = this.arrows[i];
    if (!el) {
      el = document.createElement("div");
      this.fxLayer.appendChild(el);
      this.arrows[i] = el;
    }
    const s = this.project(wx, 0.5, wz);
    const w = this.vw;
    const h = this.vh;
    const inside = s.x > 30 && s.x < w - 30 && s.y > 150 && s.y < h - 190;
    if (inside) { el.style.display = "none"; return; }
    const cx = w / 2;
    const cy = h / 2;
    const dx = s.x - cx;
    const dy = s.y - cy;
    const k = Math.min((w / 2 - 30) / Math.max(1, Math.abs(dx)), (h / 2 - 160) / Math.max(1, Math.abs(dy)));
    const ex = cx + dx * k;
    const ey = cy + dy * k;
    el.className = `edge-arrow ${cls}`;
    el.style.display = "block";
    el.style.transform = `translate(${ex}px, ${ey}px)`;
    el.innerHTML = `<i style="transform:rotate(${Math.atan2(dy, dx)}rad)">➤</i><b>${label}</b>`;
  }

  // =================================================================== frame

  private tick(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.mode === "home" || this.mode === "menu") {
      this.updateHome(dt);
      this.onFrame?.(dt);
    } else if (this.mode === "outing" && this.sim) {
      if (!this.paused) {
        const ev = this.sim.update(dt);
        if (ev.length) this.handleEvents(ev);
      }
      this.updateOuting(this.paused ? 0 : dt);
      this.onFrame?.(dt);
    } else this.onFrame?.(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private handleEvents(ev: OutingEvent[]): void {
    const sim = this.sim!;
    for (const e of ev) {
      if (e.type === "say") {
        const kind = e.id === "me" ? "me" : e.id === "babka" ? "babka" : "enemy";
        const p = typeof e.id === "number" ? sim.patrols.find((x) => x.id === e.id) : null;
        this.say(p ? p.x : e.x, p ? p.z : e.z, e.text, kind);
      } else if (e.type === "spotted" || e.type === "grab") this.addShake(0.35);
      else if (e.type === "noise") {
        const ring = makeRing(1, 0xffffff, 0.5);
        at(ring, e.x, 0.1, e.z, this.out);
        this.noiseRings.push({ mesh: ring, t: 0 });
        ring.userData.r = e.r;
      } else if (e.type === "bark") {
        this.say(e.x, e.z, "ГАВ! ГАВ!", "babka");
      }
    }
    this.syncPatrols(sim);
    this.onEvents?.(ev);
  }

  private fanColor(p: Patrol): number {
    if (p.state === "chase") return 0xff2a2a;
    const s = p.suspicion;
    const c = new THREE.Color(this.level?.night ? 0xfff0b0 : 0xfff6c8).lerp(new THREE.Color(0xff6a2a), Math.min(1, s * 1.4));
    return c.getHex();
  }

  private updateFan(v: PatrolView, p: Patrol): void {
    const sim = this.sim!;
    const fan = v.fan!;
    const range = sim.range(p);
    const fov = sim.fov(p);
    const pos = fan.geometry.getAttribute("position") as THREE.BufferAttribute;
    const ox = p.x;
    const oz = p.z;
    pos.setXYZ(0, ox, 0.07, oz);
    for (let i = 0; i <= FAN_SEGMENTS; i++) {
      const a = p.dir - fov + (2 * fov * i) / FAN_SEGMENTS;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      let d = 0.4;
      const isBoat = p.kind === "boat";
      while (d < range) {
        const x = ox + dx * d;
        const z = oz + dz * d;
        const { r, c } = sim.cellAt(x, z);
        const ch = sim.ch(r, c);
        if (blocksSight(ch) && !(isBoat && ch === "~")) break;
        d += 0.35;
      }
      d = Math.min(d, range);
      pos.setXYZ(i + 1, ox + dx * d, 0.07, oz + dz * d);
    }
    pos.needsUpdate = true;
    fan.geometry.computeBoundingSphere();
    const m = fan.material as THREE.MeshBasicMaterial;
    m.color.setHex(this.fanColor(p));
    const night = !!this.level?.night;
    m.opacity = p.state === "stunned" || (p.kind === "van" && p.state === "parked") || p.ignoreT > 0 ? 0.05 : night ? 0.34 : 0.22 + p.suspicion * 0.15;
  }

  private updateOuting(dt: number): void {
    const sim = this.sim!;
    const t = performance.now() / 1000;
    // ---- hero
    const hero = this.hero!;
    hero.root.position.set(sim.px, 0, sim.pz);
    hero.root.rotation.y = sim.facing;
    const grabbed = sim.phase === "qte" && (sim.qteCtx === "grab" || sim.qteCtx === "escape" || sim.qteCtx === "talkout" || sim.qteCtx === "van");
    animateRig(hero, dt > 0 ? sim.speedNow : 0, dt, grabbed ? "stunned" : "walk");
    if (sim.hidden) hero.body.position.y -= 0.25;
    this.heroHidden = lerp(this.heroHidden, sim.hidden ? 1 : 0, Math.min(1, dt * 8));
    setRigOpacity(hero, 1 - this.heroHidden * 0.6);
    if (this.heroTag) {
      this.place(this.heroTag, sim.px, 3.2, sim.pz);
      const txt = sim.hidden ? "СХОВАНИЙ" : sim.inHide ? "СТІЙ — СХОВАЄШСЯ" : "";
      if (this.heroTag.textContent !== txt) this.heroTag.textContent = txt;
      this.heroTag.classList.toggle("on", !!txt);
    }

    // ---- patrols
    for (const p of sim.patrols) {
      const v = this.patrolViews.get(p.id);
      if (!v) continue;
      if (v.kind === "drone") {
        v.obj.position.set(p.x, 4.2 + Math.sin(t * 2 + p.id) * 0.15, p.z);
        v.obj.rotation.y = p.dir;
        v.obj.children.forEach((ch) => { if (ch.name === "prop") ch.rotation.y += dt * 40; });
        const led = v.obj.getObjectByName("led") as THREE.Mesh | undefined;
        if (led) (led.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(t * 8) > 0 ? 0xff2a2a : 0x330000);
        if (v.ring) {
          v.ring.position.set(p.x, 0.08, p.z);
          (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.25 + p.suspicion * 0.5;
          (v.ring.material as THREE.MeshBasicMaterial).color.setHex(p.suspicion > 0.5 ? 0xff2a2a : 0xff8a3a);
        }
      } else {
        v.obj.position.set(p.x, v.kind === "boat" ? 0.12 + Math.sin(t * 1.7) * 0.05 : 0, p.z);
        v.obj.rotation.y = p.dir;
      }
      if (v.rig) {
        const speed = p.moving ? (p.state === "chase" ? 4.5 : p.state === "investigate" ? 2.6 : 1.7) : 0;
        const pose = p.state === "stunned" ? "stunned" : sim.phase === "qte" && sim.grabbedBy === p.id && grabbed ? "grab" : "walk";
        animateRig(v.rig, dt > 0 ? speed : 0, dt, pose);
        if (v.follower) {
          const back = 1.25;
          const tx = p.x - Math.sin(p.dir) * back + Math.cos(p.dir) * 0.55;
          const tz = p.z - Math.cos(p.dir) * back - Math.sin(p.dir) * 0.55;
          const k = Math.min(1, dt * (p.state === "chase" ? 5 : 3));
          const ox = v.fx;
          const oz = v.fz;
          v.fx = lerp(v.fx, tx, k);
          v.fz = lerp(v.fz, tz, k);
          v.follower.root.position.set(v.fx, 0, v.fz);
          const moved = Math.hypot(v.fx - ox, v.fz - oz) / Math.max(dt, 1e-4);
          if (moved > 0.2) v.follower.root.rotation.y = Math.atan2(v.fx - ox, v.fz - oz);
          animateRig(v.follower, dt > 0 ? moved : 0, dt, p.state === "stunned" ? "stunned" : "walk");
        }
      }
      if (v.fan) this.updateFan(v, p);
      const icon = p.state === "chase" ? "!" : p.state === "stunned" ? "💫" : p.ignoreT > 0 ? "" : p.suspicion > 0.28 || p.state === "investigate" || p.state === "search" ? "?" : "";
      const html = icon ? `<b class="${icon === "!" ? "alarm" : "huh"}">${icon}</b>` : v.tag.dataset.base ?? "";
      if (v.tag.dataset.cur !== html) {
        if (v.tag.dataset.base === undefined) v.tag.dataset.base = v.tag.innerHTML;
        v.tag.innerHTML = html || v.tag.dataset.base || "";
        v.tag.dataset.cur = html;
      }
      const meter = p.state !== "chase" && p.suspicion > 0.05 ? `<s style="--k:${p.suspicion.toFixed(2)}"></s>` : "";
      if (meter && !v.tag.querySelector("s")) v.tag.insertAdjacentHTML("beforeend", meter);
      const sEl = v.tag.querySelector("s") as HTMLElement | null;
      if (sEl) { if (!meter) sEl.remove(); else sEl.style.setProperty("--k", p.suspicion.toFixed(2)); }
      this.place(v.tag, p.x, v.kind === "drone" ? 5.2 : v.kind === "van" ? 3.4 : 3.0, p.z);
    }

    // ---- babusias & dogs
    sim.babki.forEach((b, i) => {
      const rig = this.babkaRigs[i];
      animateRig(rig, 0, dt, b.calling > 0 ? "call" : "sit");
      rig.root.rotation.y = Math.atan2(sim.px - b.x, sim.pz - b.z) * 0.3;
      const ring = this.babkaRings[i];
      (ring.material as THREE.MeshBasicMaterial).opacity = b.friendly ? 0.12 : 0.18 + b.suspicion * 0.5;
      const tag = this.babkaTags[i];
      const txt = b.friendly ? "💚" : b.calling > 0 ? "📞" : b.suspicion > 0.15 ? `👀 ${Math.round(b.suspicion * 100)}%` : "👵";
      if (tag.textContent !== txt) tag.textContent = txt;
      this.place(tag, b.x, 2.6, b.z);
    });
    sim.dogs.forEach((d, i) => {
      const dog = this.dogModels[i];
      const head = dog.getObjectByName("head");
      const tail = dog.getObjectByName("tail");
      dog.rotation.y = Math.atan2(sim.px - d.x, sim.pz - d.z);
      if (head) head.position.y = 0.78 + (d.barking > 0 ? Math.abs(Math.sin(t * 18)) * 0.12 : 0);
      if (tail) tail.rotation.y = Math.sin(t * (d.barking > 0 ? 20 : 4)) * 0.6;
    });

    // ---- objectives and exit
    let target: { x: number; z: number; label: string } | null = null;
    for (const m of this.objMarkers) {
      const o = sim.objectives.find((x) => x.slot === m.slot)!;
      const open = sim.objectiveOpen(o);
      m.ring.visible = open;
      m.beam.visible = open;
      m.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
      m.tag.classList.toggle("done", o.done);
      m.tag.classList.toggle("locked", !o.done && !open);
      const prog = m.tag.querySelector("i") as HTMLElement | null;
      if (prog) prog.style.setProperty("--k", o.progress.toFixed(2));
      m.tag.classList.toggle("dwell", sim.dwelling === o);
      this.place(m.tag, o.x, 3.2, o.z);
      if (open && !o.def.optional && !target) target = { x: o.x, z: o.z, label: o.def.icon };
    }
    if (this.exitMarker) {
      const show = sim.exitOpen && !sim.level.noExit;
      this.exitMarker.ring.visible = show;
      this.exitMarker.beam.visible = show;
      this.exitMarker.tag.style.display = show ? "" : "none";
      this.place(this.exitMarker.tag, sim.exit.x, 3.2, sim.exit.z);
      if (show && !target) target = { x: sim.exit.x, z: sim.exit.z, label: "🏠" };
    }
    if (this.vaultMarker) {
      this.vaultMarker.visible = !!sim.vaultCell;
      if (sim.vaultCell) {
        const p = sim.center(sim.vaultCell.r, sim.vaultCell.c);
        this.vaultMarker.position.set(p.x, 0.1, p.z);
        this.vaultMarker.scale.setScalar(1 + Math.sin(t * 6) * 0.1);
      }
    }
    // edge arrows: the goal, plus patrols with the «Де бус?» subscription
    let ai = 0;
    if (target) this.edgeArrow(ai++, target.x, target.z, "goal", target.label);
    if (this.showArrows) {
      for (const p of sim.patrols) {
        if (ai > 7) break;
        if (Math.hypot(p.x - sim.px, p.z - sim.pz) > 26) continue;
        this.edgeArrow(ai++, p.x, p.z, p.state === "chase" ? "enemy hot" : "enemy", p.kind === "van" ? "🚐" : p.kind === "drone" ? "🛸" : "👮");
      }
    }
    for (let i = ai; i < this.arrows.length; i++) this.arrows[i].style.display = "none";

    // ---- bubbles
    const now = performance.now();
    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until) { b.el.remove(); return false; }
      if (now > b.until - 250) b.el.classList.add("out");
      this.place(b.el, b.x, b.y, b.z);
      return true;
    });

    // ---- noise rings
    this.noiseRings = this.noiseRings.filter((n) => {
      n.t += dt;
      const k = n.t / 0.7;
      n.mesh.scale.setScalar(1 + k * (n.mesh.userData.r ?? 6));
      (n.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 * (1 - k));
      if (k >= 1) { this.out.remove(n.mesh); n.mesh.geometry.dispose(); (n.mesh.material as THREE.Material).dispose(); return false; }
      return true;
    });

    // ---- water, weather, lamps
    for (const w of this.water) {
      const pos = w.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(t * 1.6 + pos.getX(i) * 0.8 + pos.getY(i) * 0.5) * 0.06);
      pos.needsUpdate = true;
    }
    if (this.precip) {
      const pos = this.precip.geometry.getAttribute("position") as THREE.BufferAttribute;
      const fall = this.precipKind === "rain" ? 18 : 1.6;
      const stride = this.precipKind === "rain" ? 2 : 1;
      for (let i = 0; i < pos.count; i += stride) {
        let y = pos.getY(i) - fall * dt;
        let x = pos.getX(i) + (this.precipKind === "snow" ? Math.sin(t + i) * 0.3 * dt : 0);
        if (y < 0) y += 22;
        pos.setY(i, y);
        pos.setX(i, x);
        if (stride === 2) { pos.setY(i + 1, y - 0.7); pos.setX(i + 1, x + 0.05); }
        x = 0;
      }
      pos.needsUpdate = true;
      this.precip.position.set(this.camTarget.x, 0, this.camTarget.z);
    }
    if (this.lampLights.length) {
      const near = [...this.lampSpots].sort((a, b) => Math.hypot(a.x - sim.px, a.z - sim.pz) - Math.hypot(b.x - sim.px, b.z - sim.pz));
      this.lampLights.forEach((l, i) => {
        const s = near[i];
        if (!s) { l.intensity = 0; return; }
        l.position.copy(s);
        l.intensity = 14;
      });
    }

    // ---- occluding buildings fade out
    const pitchK = this.camOffset.z / this.camOffset.y;
    for (const f of this.fades) {
      const between = f.z0 > sim.pz - 0.5 && f.z0 - sim.pz < f.height * pitchK + 1.5 && sim.px > f.x0 - 1.5 && sim.px < f.x1 + 1.5;
      const target = between ? 0.28 : 1;
      for (const m of f.mats) {
        const cur = m.opacity ?? 1;
        const next = lerp(cur, target, Math.min(1, dt * 8));
        m.transparent = next < 0.99;
        m.opacity = next;
        m.depthWrite = next > 0.9;
      }
    }

    this.placeCamera(dt);
  }

  private placeCamera(dt: number): void {
    const sim = this.sim;
    if (!sim) return;
    const k = dt >= 1 ? 1 : Math.min(1, dt * 4);
    const offY = this.camOffset.y;
    const offZ = this.camOffset.z;
    const pitch = Math.atan2(offY, offZ);
    const half = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const down = Math.min(pitch + half, Math.PI / 2 - 0.01);
    const up = Math.max(pitch - half, 0.05);
    // ground under the bottom and top screen edges, relative to the target
    const south = offZ - offY / Math.tan(down);
    const north = offZ - offY / Math.tan(up);
    let zMin = -1.5 - north;
    let zMax = sim.depth + 1.5 - south;
    if (zMin > zMax) zMin = zMax = (zMin + zMax) / 2;
    const dist = Math.hypot(offY, offZ);
    const halfW = Math.tan(half) * dist * this.camera.aspect;
    let xMin = halfW - 1.5;
    let xMax = sim.width - halfW + 1.5;
    if (xMin > xMax) xMin = xMax = sim.width / 2;
    this.camTarget.x = lerp(this.camTarget.x, clamp(sim.px, xMin, xMax), k);
    this.camTarget.z = lerp(this.camTarget.z, clamp(sim.pz - 2.5, zMin, zMax), k);
    this.shake = Math.max(0, this.shake - (dt || 0.016) * 1.5);
    const sx = (Math.random() - 0.5) * this.shake;
    const sz = (Math.random() - 0.5) * this.shake;
    this.camera.position.set(this.camTarget.x + sx, offY, this.camTarget.z + offZ + sz);
    this.camera.lookAt(this.camTarget.x + sx * 0.5, 0, this.camTarget.z + sz * 0.5);
    this.sun.position.set(this.camTarget.x - 12, 26, this.camTarget.z + 10);
    this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z);
  }

  /** Menu backdrop: the apartment at night. */
  showMenu(): void {
    this.showHome({ blackout: false, cat: false, night: true, hoodie: false, heat: 60 });
    this.mode = "menu";
    this.homePose = "scroll";
  }

  stopOuting(): void {
    this.clearOuting();
    this.mode = "menu";
  }
}
