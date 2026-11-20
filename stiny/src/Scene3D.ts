import * as THREE from "three";
import {
  C, CAMO_TCK, LOOKS, animateRig, at, camoTexture, canvasTexture, carpetTexture, makePerson, mat, mesh, type Rig,
} from "../../rozshuk/src/three/models.ts";
import { Post, defaultQuality, glowMat, type Mood } from "./three/post.ts";
import { RainField, rainGlassMaterial } from "./three/weather.ts";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { lino, markTexture, parquet, plaster, tiles, wallpaper, type Mark, type Surface } from "./three/textures.ts";
import { LaptopScreen, type ScreenMode } from "./three/screen.ts";
import { Memory, type MemoryFriend } from "./three/memory.ts";
import { Sunbeam, curtains, faceUp, ficus, smoothen, surface, type Surface as Finish } from "./three/smooth.ts";
import { buildCourtyard, type Courtyard } from "./three/yard.ts";
import * as F from "./three/furniture.ts";
import { makeHearse, makeMinibus } from "./three/cars.ts";
import { Human, loadPerson, replaceRig, type PersonId, type Pose as BodyPose } from "./three/people.ts";
import type { ActionId, MemoryKind, PlaceId } from "./content.ts";

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Interactive spots in the flat (metres; x to the right, z towards the camera). */
export const PLACES: Record<PlaceId, { x: number; z: number; r: number }> = {
  desk: { x: -2.1, z: -2.55, r: 0.85 },
  window: { x: -3.8, z: -2.8, r: 0.8 },
  plant: { x: -4.55, z: -2.3, r: 0.6 },
  calendar: { x: -1.2, z: -2.95, r: 0.5 },
  balcony: { x: -1.0, z: -4.3, r: 0.9 },
  shelf: { x: -4.3, z: -0.5, r: 0.8 },
  bed: { x: -3.3, z: 1.8, r: 1.0 },
  mat: { x: -1.6, z: 0.9, r: 0.8 },
  cat: { x: -4.2, z: 2.9, r: 0.6 },
  fridge: { x: 4.2, z: -2.4, r: 0.8 },
  photos: { x: 3.7, z: -2.6, r: 0.4 },
  stove: { x: 2.6, z: -2.5, r: 0.75 },
  trash: { x: 4.5, z: -0.7, r: 0.6 },
  mirror: { x: 1.05, z: 2.2, r: 0.6 },
  bath: { x: 1.4, z: 3.0, r: 0.7 },
  corridor: { x: 3.3, z: 0.85, r: 0.75 },
  door: { x: 4.45, z: 2.6, r: 0.75 },
};

/** Where the hero stands and how, while doing something. */
const POSES: Partial<Record<ActionId, { x: number; z: number; ry: number; pose: "sit" | "idle" | "call" | "lie" | "push" | "floor" | "walk" }>> = {
  work: { x: -2.1, z: -2.3, ry: Math.PI, pose: "sit" },
  game: { x: -2.1, z: -2.3, ry: Math.PI, pose: "sit" },
  therapy: { x: -2.1, z: -2.3, ry: Math.PI, pose: "sit" },
  eat: { x: 1.6, z: -1.1, ry: Math.PI, pose: "sit" },
  drink: { x: 1.6, z: -1.1, ry: Math.PI, pose: "sit" },
  cook: { x: 2.6, z: -2.35, ry: Math.PI, pose: "idle" },
  stare: { x: -4.1, z: 1.7, ry: 0, pose: "lie" },
  sleep: { x: -4.1, z: 1.7, ry: 0, pose: "lie" },
  look: { x: -3.8, z: -2.85, ry: Math.PI, pose: "idle" },
  air: { x: -3.8, z: -2.85, ry: Math.PI, pose: "idle" },
  balcony: { x: -1.0, z: -4.4, ry: Math.PI, pose: "idle" },
  tomatoes: { x: -1.6, z: -4.4, ry: Math.PI, pose: "idle" },
  shower: { x: 1.4, z: 3.0, ry: 0, pose: "idle" },
  wash_bottle: { x: 1.4, z: 3.0, ry: 0, pose: "idle" },
  mirror: { x: 1.05, z: 2.2, ry: -Math.PI / 2, pose: "idle" },
  water_plant: { x: -4.2, z: -2.3, ry: -2.4, pose: "idle" },
  exercise: { x: -1.6, z: 0.9, ry: Math.PI / 2, pose: "push" },
  read: { x: -4.1, z: 1.4, ry: Math.PI / 2, pose: "sit" },
  journal: { x: -2.1, z: -2.3, ry: Math.PI, pose: "sit" },
  guitar: { x: -4.1, z: 1.4, ry: Math.PI / 2, pose: "sit" },
  tidy: { x: 4.2, z: -0.7, ry: Math.PI / 2, pose: "walk" },
  go_out: { x: 4.5, z: 2.6, ry: Math.PI / 2, pose: "idle" },
  break_out: { x: 4.5, z: 2.6, ry: Math.PI / 2, pose: "idle" },
  peephole: { x: 4.55, z: 2.6, ry: Math.PI / 2, pose: "idle" },
  calendar: { x: -1.2, z: -2.95, ry: Math.PI, pose: "idle" },
  pet: { x: -3.7, z: 2.6, ry: -Math.PI / 2, pose: "floor" },
  photos: { x: 3.7, z: -2.4, ry: Math.PI, pose: "idle" },
  shelter: { x: 3.3, z: 0.85, ry: 0, pose: "floor" },
};

interface Box { x0: number; z0: number; x1: number; z1: number; /** Which wall it leans on (moves with it). */ side?: Side }
type Side = "L" | "R" | "B";

/** A person in the courtyard. */
interface Walker { rig: Rig; from: THREE.Vector3; to: THREE.Vector3; t: number; speed: number; idle?: boolean; pose?: "call" | "idle" | "grab"; human?: Human }

/** What the real body does for each action (the chibi rig had its own poses). */
const BODY: Partial<Record<ActionId, BodyPose>> = {
  work: "type", game: "type", therapy: "type", journal: "type", eat: "eat", drink: "eat", read: "read", guitar: "guitar",
  stare: "lie", sleep: "lie", exercise: "push", pet: "floor", shelter: "curl", look: "sill", air: "sill", balcony: "sill",
  tomatoes: "water", water_plant: "water", cook: "stir", tidy: "stir", shower: "arms_up", wash_bottle: "arms_up",
  go_out: "reach", break_out: "reach", calendar: "reach", peephole: "lean", smoke: "smoke", smoke_window: "smoke",
  chat: "call", news: "call", friends: "call", mom: "call", order: "call", photos: "stand", mirror: "stand",
};
/** Seat heights (hips) where the sitting actions happen. */
const SEAT: Partial<Record<ActionId, number>> = { work: 0.6, game: 0.6, therapy: 0.6, journal: 0.6, eat: 0.58, drink: 0.58, read: 0.74, guitar: 0.74 };

export interface FrameInfo {
  clock: number;
  light: boolean;
  alert: boolean;
  bus: boolean;
  despair: number;
  season: number;
  danger: number;
}

const FLOOR_Y = -13.5;

/** Owns the WebGL renderer: the flat, the courtyard five floors down, the hero. */
export class Scene3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(48, 0.5, 0.1, 200);
  private hemi = new THREE.HemisphereLight(0xdfe8ff, 0x4a4a3a, 1.1);
  private sun = new THREE.DirectionalLight(0xffffff, 1.6);
  private lamp = new THREE.PointLight(0xffd59a, 0, 9, 1.4);
  private kitchenLamp = new THREE.PointLight(0xfff0d0, 0, 7, 1.4);
  private candle = new THREE.PointLight(0xff9a3a, 0, 4.5, 1.6);
  private flashLight = new THREE.PointLight(0xfff0d8, 0, 20, 1.2);
  private flameMesh: THREE.Mesh;
  private laptop = new LaptopScreen();
  private screenMat = new THREE.MeshBasicMaterial({ map: this.laptop.texture });
  /** The laptop lights your face at night. */
  private screenLight = new THREE.PointLight(0x9cc8ff, 0, 3.5, 1.6);
  /** Stains, mould, peeling paper, tally marks: they come with the years. */
  private marks: Array<{ m: THREE.Mesh; from: number }> = [];
  private beams: Sunbeam[] = [];
  /** A funeral going through the yard: a car with a flag, people on their knees. */
  private procession = new THREE.Group();
  private processionT = -1;
  private mourners: Rig[] = [];
  /** Empty bottles gathering by the bin. */
  private bottles: THREE.Mesh[] = [];
  // the memory of Kozyn
  private memory: Memory | null = null;
  memoryOn = false;
  private glassMat = rainGlassMaterial();
  private clock = new THREE.Clock();
  readonly post: Post;
  private container: HTMLElement;

  // flat
  private flat = new THREE.Group();
  private wallsL = new THREE.Group();
  private wallsR = new THREE.Group();
  private wallsBack = new THREE.Group();
  private boxes: Box[] = [];
  /** Furniture that stands against a wall and moves with it when the walls close in. */
  private followers: Array<{ o: THREE.Object3D; base: THREE.Vector3; side: Side }> = [];
  /** How far each wall has come in right now (metres). */
  private off = { L: 0, R: 0, B: 0 };
  /** Panic: a sudden inward lurch of the walls + a dolly zoom, decays by itself. */
  private squeezeV = 0;
  /** The last heartbeat, decays fast. */
  private beat = 0;
  private clutter: THREE.Object3D[] = [];
  private plant = new THREE.Group();
  private plantLeaves: THREE.Mesh[] = [];
  private photos: THREE.Mesh[] = [];
  private ribbons: THREE.Mesh[] = [];
  private perkProps: Record<string, THREE.Object3D> = {};
  private cat = new THREE.Group();
  private door: THREE.Mesh;
  private brokenGlass: THREE.Mesh;
  private ring: THREE.Mesh;

  // hero
  hero: Rig;
  private beard: THREE.Mesh;
  /** The hero as a real person (CC0 MakeHuman avatar), when loaded; the chibi rig is the fallback. */
  private heroHuman: Human | null = null;
  private heroModel: PersonId | null = null;
  private mournerHumans: Array<Human | null> = [];
  private hair: THREE.Mesh;
  private heroPos = new THREE.Vector3(-2.2, 0, 0);
  private heroYaw = Math.PI;
  private move = { x: 0, y: 0 };
  private pose: ActionId | null = null;
  private poseT = 0;
  heroSpeed = 2.4;

  // yard
  private yard = new THREE.Group();
  private yardDress = new THREE.Group();
  private groundMat!: THREE.MeshStandardMaterial;
  private court!: Courtyard;
  private van: THREE.Group;
  private officers: Walker[] = [];
  private walkers: Walker[] = [];
  private yardLamps: THREE.Mesh[] = [];
  private snow: THREE.Points | null = null;
  private rain = new RainField(1600, { x0: -24, x1: 24, y0: FLOOR_Y, y1: 9, z0: -34, z1: -3.9 });
  private rainOn = false;
  /** 0..1, eased towards rainOn. */
  private rainK = 0;
  private groundBase = new THREE.Color(0x6a8a4a);
  private camo = camoTexture(CAMO_TCK, 5);

  // camera
  private view: "room" | "window" = "room";
  private camPos = new THREE.Vector3(0, 9, 7);
  private camLook = new THREE.Vector3();
  private shake = 0;
  private info: FrameInfo = { clock: 480, light: true, alert: false, bus: false, despair: 0, season: 0, danger: 0 };
  paused = false;
  onFrame: ((dt: number) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // neutral tone mapping keeps the palette's hues and rolls highlights off softly
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    container.prepend(this.renderer.domElement);
    this.renderer.domElement.id = "gl";
    this.scene.add(this.hemi, this.sun, this.sun.target, this.flat, this.yard);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(defaultQuality() === "low" ? 1024 : 2048, defaultQuality() === "low" ? 1024 : 2048);
    this.sun.shadow.normalBias = 0.02;
    const sc = this.sun.shadow.camera;
    sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 50;
    this.sun.shadow.bias = -0.0006;
    this.post = new Post(this.renderer, this.scene, this.camera, defaultQuality());
    // a soft room reflection for the glossy surfaces (varnished floor, fridge enamel)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.buildFlat();
    this.dressFlat();
    this.collectFollowers();
    this.scene.add(this.rain.lines);
    this.door = this.flat.getObjectByName("door") as THREE.Mesh;
    this.brokenGlass = this.flat.getObjectByName("broken") as THREE.Mesh;
    this.flameMesh = this.flat.getObjectByName("flame") as THREE.Mesh;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 28), new THREE.MeshBasicMaterial({ color: 0xf2b632, transparent: true, opacity: 0.85, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 3;
    this.flat.add(this.ring);

    // the hero: grey hoodie, sweatpants, slippers
    this.hero = makePerson({ top: 0x5f6068, pants: 0x30323c, shoes: 0x7a5a44, hat: "none" });
    this.hero.root.scale.setScalar(1.0);
    const hairMat = mat(0x3a2a20);
    this.hair = mesh(new THREE.SphereGeometry(0.285, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat, 0.015);
    at(this.hair, 0, 0.03, -0.02, this.hero.head);
    this.beard = mesh(new THREE.IcosahedronGeometry(0.17, 0), hairMat, 0.012);
    this.beard.scale.set(1.25, 0.9, 0.65);
    at(this.beard, 0, -0.16, 0.15, this.hero.head);
    faceUp(this.hero, { tired: true });
    smoothen(this.hero.root, true);
    this.flat.add(this.hero.root);
    smoothen(this.flat);

    this.buildYard();
    this.van = makeMinibus();
    this.van.rotation.y = Math.PI * 0.5;
    at(this.van, -0.2, FLOOR_Y, -16.5, this.yard);
    for (let i = 0; i < 3; i++) {
      const rig = makePerson(LOOKS.officer(this.camo));
      faceUp(rig, { cheeks: false, brow: 0x2a2018 });
      smoothen(rig.root, "far");
      this.yard.add(rig.root);
      this.officers.push({ rig, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, speed: 1.2 });
    }

    this.buildProcession();
    smoothen(this.yard, "far");
    this.loadPeople();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.renderer.setAnimationLoop(() => this.tick());
    (window as unknown as { __three: THREE.WebGLRenderer }).__three = this.renderer;
  }

  get vw(): number { return this.container.clientWidth || window.innerWidth; }
  get vh(): number { return this.container.clientHeight || window.innerHeight; }

  resize(): void {
    this.post.setSize(this.vw, this.vh);
    this.camera.aspect = this.vw / this.vh;
    this.camera.updateProjectionMatrix();
  }

  // ================================================================ the flat

  private wall(g: THREE.Group, x0: number, z0: number, x1: number, z1: number, h: number, material: THREE.Material, y0 = 0, solid = true): THREE.Mesh {
    const t = 0.12;
    const w = Math.max(Math.abs(x1 - x0), t);
    const d = Math.max(Math.abs(z1 - z0), t);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    if (solid && y0 < 0.5) this.boxes.push({ x0: Math.min(x0, x1) - (w === t ? t / 2 : 0), z0: Math.min(z0, z1) - (d === t ? t / 2 : 0), x1: Math.max(x0, x1) + (w === t ? t / 2 : 0), z1: Math.max(z0, z1) + (d === t ? t / 2 : 0) });
    return m;
  }

  private solid(x0: number, z0: number, x1: number, z1: number): void {
    this.boxes.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
  }

  /**
   * Real surfaces for the furniture: the shared models only know colours, so
   * each colour of the flat is given its finish — wood for the desk and the bed,
   * knit for the blanket, enamel for the stove and the bath, metal, glossy bags.
   */
  private dressFlat(): void {
    const finish: Record<number, Finish> = {
      0x8a6a4a: "wood", 0x5a4030: "wood", 0x6a4a2a: "wood", 0x6a4a3a: "wood", 0x5a3a2a: "wood", 0x5a3a24: "wood", 0xc8b89a: "wood", 0x8a5a3a: "wood", 0xc8823a: "wood",
      0x3a5a7a: "knit", 0xf0ece0: "linen", 0xe8d8a0: "linen", 0xe8e4d8: "linen",
      0xd8d8d0: "enamel", 0xf4f4f0: "enamel", 0xeeeeee: "enamel", 0xe8e0d0: "enamel", 0xf4ecd8: "enamel", 0xf0f0f0: "plastic", 0xe8e8e8: "plastic",
      0x8a8a90: "metal", 0x222222: "metal", 0x333333: "metal", 0x4a4a4a: "metal", 0x3a3a3a: "metal", 0x555555: "metal", 0x666666: "metal",
      0x2a2d33: "plastic", 0x3a3d44: "plastic", 0x3a3a44: "rubber", 0x3a5a3a: "plastic", 0x2a6a6a: "rubber",
      0x2a2a2a: "gloss", 0x3a4a6a: "gloss", 0x3a7a5a: "gloss", 0x5a3a1a: "gloss", 0x8ab8d8: "gloss", 0x8a7a6a: "enamel", 0xa8a49a: "paint", 0xc8a06a: "paint",
    };
    // the cat first: soft dark fur, not a bin bag
    this.cat.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.MeshLambertMaterial).isMeshLambertMaterial) m.material = surface("rubber", 0x26242a); });
    smoothen(this.cat, true);
    this.flat.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.name === "hull") return;
      const l = m.material as THREE.MeshLambertMaterial;
      if (!l.isMeshLambertMaterial || l.map) return;
      const hex = l.color.getHex();
      let kind = finish[hex];
      if (!kind) return;
      // the kitchen counter shares the bed sheet's colour: laminate, not linen
      const p = (m.geometry as THREE.BoxGeometry).parameters as { width?: number; height?: number } | undefined;
      if (kind === "linen" && hex === 0xe8e4d8 && p?.height && p.height > 0.5) kind = "enamel";
      const tint = new THREE.Color(hex);
      if (kind === "wood") tint.multiplyScalar(1.25);
      m.material = surface(kind, tint.getHex(), kind === "wood" ? 1 : 1);
    });
    // curtains at the windows, in soft folds
    const room = curtains(-4.5, -3.1, 2.48, 0x7d8a68);
    at(room, 0, 0, -3.37, this.wallsBack);
    const kitchen = curtains(3.0, 4.2, 2.48, 0xc8a070);
    at(kitchen, 0, 0, -3.37, this.wallsBack);
    // sunbeams through the windows, slanting in towards the room
    this.beams = [new Sunbeam(1.3, 1.4, 3.4), new Sunbeam(1.1, 1.4, 3.0)];
    at(this.beams[0].group, -3.8, 2.25, -3.42, this.flat).rotation.x = -0.95;
    at(this.beams[1].group, 3.6, 2.25, -3.42, this.flat).rotation.x = -0.95;
  }

  /**
   * Real people for the yard (light copies: they are five floors down), the
   * officers and the mourners; the hero is loaded by season in setSeason.
   */
  private loadPeople(): void {
    const put = (rig: Rig, id: PersonId, size: number, done?: (h: Human) => void) => {
      loadPerson(id, true).then((g) => { const h = new Human(g); h.size = size; replaceRig(rig, h); done?.(h); }).catch(() => { /* the chibi stays */ });
    };
    const walkerIds: PersonId[] = ["grandma", "grandma", "mom", "friend2", "friend5", "friend1"];
    this.walkers.forEach((w, i) => put(w.rig, walkerIds[i], i >= 4 ? 0.82 : 1, (h) => { w.human = h; }));
    this.officers.forEach((o) => put(o.rig, "officer", 1.02, (h) => { o.human = h; }));
    const mournerIds: PersonId[] = ["grandma", "mom", "friend3", "grandma", "friend4", "mom", "friend2", "grandma"];
    this.mourners.forEach((r, i) => { this.mournerHumans[i] = null; put(r, mournerIds[i], 1, (h) => { this.mournerHumans[i] = h; }); });
  }

  /** The hero's body for a season: stubble in 2023, a beard by 2024, long hair and a long beard by 2026. */
  private heroFor(season: number): void {
    const id: PersonId = season < 4 ? "hero1" : season < 10 ? "hero2" : "hero3";
    if (id === this.heroModel) return;
    this.heroModel = id;
    loadPerson(id).then((g) => {
      if (this.heroModel !== id) return;
      const h = new Human(g);
      replaceRig(this.hero, h);
      this.heroHuman = h;
    }).catch(() => { /* the chibi stays */ });
  }

  /** Starts loading the people of a memory, so they are there when it opens. */
  preloadMemory(ids: PersonId[]): Promise<unknown> {
    return Promise.all(ids.map((id) => loadPerson(id).catch(() => null)));
  }

  /** The funeral car with a flag and the people who kneel along the path. */
  private buildProcession(): void {
    const car = makeHearse();
    car.rotation.y = Math.PI / 2;
    car.name = "hearse";
    this.procession.add(car);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 8), surface("metal", 0x888888));
    pole.position.set(0.6, 2.2, 0);
    car.add(pole);
    const flagTex = (() => { const cv = document.createElement("canvas"); cv.width = 64; cv.height = 40; const c = cv.getContext("2d")!; c.fillStyle = "#2a6ad8"; c.fillRect(0, 0, 64, 20); c.fillStyle = "#f2d22a"; c.fillRect(0, 20, 64, 20); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.56, 8, 1), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(0.6, 2.7, 0.46);
    flag.rotation.y = Math.PI / 2;
    flag.name = "flag";
    car.add(flag);
    // people along the path who will kneel
    const spots: Array<[number, number]> = [[-6, -8.6], [-4.5, -8.7], [-1.2, -8.6], [1.5, -8.8], [3.6, -8.6], [6.2, -8.7], [-3.6, -6.0], [4.4, -6.1]];
    spots.forEach(([x, z], i) => {
      const rig = makePerson(i % 3 === 0 ? LOOKS.babka() : LOOKS.shopper([0x5a5a6a, 0x3a3a44, 0x6a4a3a, 0x2a3a4a][i % 4]));
      smoothen(rig.root, "far");
      rig.root.position.set(x, FLOOR_Y, z);
      rig.root.rotation.y = z < -7 ? Math.PI : 0;
      this.procession.add(rig.root);
      this.mourners.push(rig);
    });
    this.procession.visible = false;
    this.yard.add(this.procession);
    // bottles by the bin, as many as the drinking leaves
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 14), surface("gloss", i % 3 ? 0x4a3a1a : 0x2a5a3a));
      b.position.set(4.25 - (i % 5) * 0.11, 0.12, -0.2 + Math.floor(i / 5) * 0.12);
      if (i > 9) { b.rotation.z = Math.PI / 2; b.position.y = 0.04; b.position.x -= 0.2; }
      b.castShadow = true;
      b.visible = false;
      this.flat.add(b);
      this.bottles.push(b);
    }
  }

  /** Starts (or ends) the funeral procession in the yard. */
  setProcession(on: boolean): void {
    this.processionT = on ? 0 : -1;
    this.procession.visible = on;
  }

  /** How much you drink, as bottles by the bin (0..100). */
  setBottles(dep: number): void {
    const n = Math.min(this.bottles.length, Math.round(dep / 7));
    this.bottles.forEach((b, i) => { b.visible = i < n; });
  }

  /** Which wall a footprint leans on, if any. Left and right win over the back. */
  private static sideOf(x0: number, x1: number, z0: number, z1: number): Side | undefined {
    if (x0 < -4.45 && x1 < -2.5) return "L";
    if (x0 > 4.1) return "R";
    if (z0 < -3.0 && z0 > -3.7 && z1 < -2.4) return "B";
    return undefined;
  }

  /**
   * After the flat is built: everything standing against a wall (shelf, bed,
   * fridge, desk, counter) follows that wall in, and so do the collision boxes,
   * so the walls never slide through furniture and the hero never walks into a wall.
   */
  private collectFollowers(): void {
    const box = new THREE.Box3();
    this.flat.updateMatrixWorld(true);
    for (const o of this.flat.children) {
      if (o === this.wallsL || o === this.wallsR || o === this.wallsBack || (o as THREE.Light).isLight) continue;
      box.setFromObject(o);
      if (box.isEmpty()) continue;
      const side = Scene3D.sideOf(box.min.x, box.max.x, box.min.z, box.max.z);
      if (side) this.followers.push({ o, base: o.position.clone(), side });
    }
    for (const b of this.boxes) b.side = Scene3D.sideOf(b.x0, b.x1, b.z0, b.z1);
  }

  /** Offset of a spot near a wall, so poses and rings follow the furniture. */
  private shiftFor(x: number, z: number): { x: number; z: number } {
    const side = x < -3.5 ? "L" : x > 3.8 ? "R" : z < -2.2 && z > -3.6 ? "B" : null;
    return { x: side === "L" ? this.off.L : side === "R" ? -this.off.R : 0, z: side === "B" ? this.off.B : 0 };
  }

  private buildFlat(): void {
    const g = this.flat;
    const H = 2.7;
    // floors
    // surfaces drawn at 512 px with normal maps: the window light catches every seam
    const rep2 = (sf: Surface, x: number, y: number) => { for (const t of [sf.map, sf.normal, sf.rough]) t?.repeat.set(x, y); return sf; };
    const wood = rep2(parquet(), 3, 4);
    const linoS = rep2(lino(), 1.25, 1);
    const tileS = tiles();
    const floorMat = (sf: Surface, rough: number) => new THREE.MeshStandardMaterial({ map: sf.map, normalMap: sf.normal, roughnessMap: sf.rough ?? null, roughness: rough, metalness: 0 });
    const woodMat = floorMat(wood, 0.8);
    const linoMat = floorMat(linoS, 0.5);
    const tileMat = floorMat(tileS, 0.3);
    const floor = (x0: number, z0: number, x1: number, z1: number, material: THREE.Material) => {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), material);
      f.rotation.x = -Math.PI / 2;
      f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      f.receiveShadow = true;
      g.add(f);
      return f;
    };
    floor(-5, -3.5, 0.5, 3.5, woodMat);
    floor(0.5, -3.5, 5, 0, linoMat);
    floor(0.5, 0, 5, 3.5, linoMat);
    floor(0.5, 1.5, 2.4, 3.5, tileMat);
    // balcony slab
    const slab = mesh(new THREE.BoxGeometry(2.8, 0.18, 1.6), 0xa8a49a, 0.02);
    at(slab, -1.0, -0.09, -4.3, g);
    this.solid(-2.45, -5.15, 0.45, -5.05);
    this.solid(-2.45, -5.1, -2.35, -3.5);
    this.solid(0.35, -5.1, 0.45, -3.5);
    for (let i = 0; i < 12; i++) at(mesh(new THREE.BoxGeometry(0.04, 1.0, 0.04), 0x4a4a4a, 0), -2.35 + i * 0.25, 0.5, -5.08, g);
    at(mesh(new THREE.BoxGeometry(2.8, 0.06, 0.08), 0x3a3a3a, 0.01), -1.0, 1.02, -5.08, g);
    for (const x of [-2.4, 0.4]) at(mesh(new THREE.BoxGeometry(0.08, 0.06, 1.6), 0x3a3a3a, 0.01), x, 1.02, -4.3, g);

    // walls
    const paper = rep2(wallpaper(), 5, 1.6);
    const wallMat = (sf: Surface) => new THREE.MeshStandardMaterial({ map: sf.map, normalMap: sf.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.92, metalness: 0 });
    const roomWall = wallMat(paper);
    const kitchenWall = wallMat(rep2(plaster("#d8d0a8", 61), 4, 1.4));
    const hallWall = wallMat(rep2(plaster("#a8b0a0", 73), 4, 1.4));
    const bathTiles = tiles();
    for (const t of [bathTiles.map, bathTiles.normal]) t.repeat.set(1.4, 0.8);
    const bathWall = new THREE.MeshStandardMaterial({ map: bathTiles.map, normalMap: bathTiles.normal, roughness: 0.25, metalness: 0 });
    const outer = new THREE.MeshLambertMaterial({ color: 0xbfb8a8 });
    // back wall with openings: room window, balcony door, kitchen window
    const back = this.wallsBack;
    g.add(back);
    const spans: Array<[number, number, "solid" | "win" | "door"]> = [
      [-5, -4.5, "solid"], [-4.5, -3.1, "win"], [-3.1, -1.6, "solid"], [-1.6, -0.6, "door"], [-0.6, 0.5, "solid"],
      [0.5, 3.0, "solid"], [3.0, 4.2, "win"], [4.2, 5, "solid"],
    ];
    for (const [a, b, kind] of spans) {
      const m = a >= 0.5 ? kitchenWall : roomWall;
      if (kind === "solid") this.wall(back, a, -3.5, b, -3.5, H, m);
      else if (kind === "win") {
        this.wall(back, a, -3.5, b, -3.5, 0.9, m);
        this.wall(back, a, -3.5, b, -3.5, H - 2.3, m, 2.3, false);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 1.4), this.glassMat);
        glass.renderOrder = 2;
        at(glass, (a + b) / 2, 1.6, -3.5, back);
        at(mesh(new THREE.BoxGeometry(b - a, 0.06, 0.25), 0xeeeeee, 0.01), (a + b) / 2, 0.93, -3.42, back);
        at(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.4, 0.05), mat(0xeeeeee)), (a + b) / 2, 1.6, -3.5, back).name = "mullion";
        for (const y of [0.9, 2.3]) at(new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.06, 0.06), mat(0xeeeeee)), (a + b) / 2, y, -3.5, back);
        // tape on the glass, from winter 2025
        const tape = new THREE.Group();
        tape.name = "tape";
        const tmat = new THREE.MeshBasicMaterial({ color: 0xd8c890, transparent: true, opacity: 0.7 });
        const len = Math.hypot(b - a, 1.4);
        for (const s of [-1, 1]) {
          const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.06), tmat);
          strip.rotation.z = s * Math.atan2(1.4, b - a);
          tape.add(strip);
        }
        at(tape, (a + b) / 2, 1.6, -3.47, back);
        tape.visible = false;
      } else {
        this.wall(back, a, -3.5, b, -3.5, H - 2.2, m, 2.2, false);
        const frame = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 2.2), this.glassMat);
        frame.renderOrder = 2;
        at(frame, (a + b) / 2, 1.1, -3.52, back);
      }
    }
    // broken kitchen glass replaced with plastic film
    const broken = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.4), new THREE.MeshLambertMaterial({ color: 0xe8e8f0, transparent: true, opacity: 0.6 }));
    broken.name = "broken";
    broken.visible = false;
    at(broken, 3.6, 1.6, -3.46, back);
    // left wall (with the carpet) and right wall (with the door)
    g.add(this.wallsL, this.wallsR);
    this.wall(this.wallsL, -5, -3.5, -5, 3.5, H, roomWall);
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshLambertMaterial({ map: carpetTexture() }));
    carpet.rotation.y = Math.PI / 2;
    at(carpet, -4.93, 1.55, 1.6, this.wallsL);
    this.wall(this.wallsR, 5, -3.5, 5, 2.1, H, outer);
    this.wall(this.wallsR, 5, 3.0, 5, 3.5, H, outer);
    this.wall(this.wallsR, 5, 2.1, 5, 3.0, H - 2.15, outer, 2.15, false);
    this.solid(5, 2.1, 5.2, 3.0);
    // the padded front door: leatherette in diamonds and brass studs
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.08, 0.88), F.paddedDoor());
    door.castShadow = true;
    door.receiveShadow = true;
    door.userData.keepShape = true;
    door.name = "door";
    at(door, 4.98, 1.05, 2.55, this.wallsR);
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8), mat(C.yellow)), 4.9, 1.0, 2.9, this.wallsR).rotation.z = Math.PI / 2;
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), mat(0x222222)), 4.92, 1.55, 2.55, this.wallsR).rotation.z = Math.PI / 2;
    // interior walls: room | kitchen + hall, with the doorway to the hall
    this.wall(g, 0.5, -3.5, 0.5, 0.2, H, roomWall);
    this.wall(g, 0.5, 1.4, 0.5, 3.5, H, roomWall);
    this.wall(g, 0.5, 0.2, 0.5, 1.4, H - 2.1, roomWall, 2.1, false);
    // kitchen | hall: cut-away so the kitchen stays visible
    this.wall(g, 0.5, 0, 1.4, 0, 1.1, kitchenWall);
    this.wall(g, 2.4, 0, 5, 0, 1.1, kitchenWall);
    // bathroom
    this.wall(g, 0.5, 1.5, 2.4, 1.5, 1.1, bathWall);
    this.wall(g, 2.4, 1.5, 2.4, 2.2, 1.1, bathWall);
    this.wall(g, 2.4, 3.0, 2.4, 3.5, 1.1, bathWall);
    // front: a low edge so the dollhouse reads
    this.wall(g, -5, 3.5, 5, 3.5, 0.25, hallWall);
    this.wall(g, 2.4, 1.5, 5, 1.5, 0.02, hallWall, 0, false);

    // ---------------- room
    const place = (o: THREE.Object3D, x: number, y: number, z: number, ry = 0, parent: THREE.Object3D = g) => { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };
    // desk: drawers, the laptop, a mug, papers, the lamp; the candle for the blackouts
    const desk = new THREE.Group();
    desk.add(F.desk());
    const TOP = 0.7625;
    place(F.laptopBody(), 0, TOP, -0.02, 0, desk);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), this.screenMat);
    scr.position.set(0, TOP + 0.12 + 0.002, -0.14 + 0.005);
    scr.rotation.x = -0.25;
    scr.userData.keepShape = true;
    desk.add(scr);
    at(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6), 0xf4ecd8, 0.008), -0.55, TOP + 0.07, -0.15, desk);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 6), glowMat(0xffa040, 5));
    flame.name = "flame";
    at(flame, -0.55, TOP + 0.17, -0.15, desk);
    at(this.candle, -0.55, TOP + 0.36, -0.15, desk);
    at(this.screenLight, 0, 1.05, 0.35, desk);
    at(desk, -2.1, 0, -3.05, g);
    this.solid(-2.8, -3.45, -1.4, -2.7);
    const chair = new THREE.Group();
    chair.add(F.officeChair());
    chair.name = "chair";
    at(chair, -2.1, 0, -2.3, g);
    // calendar above the desk
    const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.55), new THREE.MeshLambertMaterial({ map: canvasTexture(64, 84, (c) => {
      c.fillStyle = "#f4f0e6"; c.fillRect(0, 0, 64, 84);
      c.fillStyle = "#c83a32"; c.fillRect(0, 0, 64, 14);
      c.strokeStyle = "#c83a32"; c.lineWidth = 2;
      for (let i = 0; i < 30; i++) { const x = 4 + (i % 7) * 8.5, y = 20 + Math.floor(i / 7) * 12; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6, y + 8); c.moveTo(x + 6, y); c.lineTo(x, y + 8); c.stroke(); }
    }, false) }));
    at(cal, -1.2, 1.65, -3.43, g);
    // the plant by the window
    const { group: plant, leaves } = ficus();
    for (const l of leaves) { l.userData.rx = l.rotation.x; this.plantLeaves.push(l); }
    plant.scale.setScalar(0.95);
    at(plant, 0, 0, 0, this.plant);
    at(this.plant, -4.6, 0, -2.9, g);
    this.solid(-4.9, -3.2, -4.3, -2.6);
    // the bookcase, the bed and its bedside table, the old carpet
    place(F.bookcase(), -4.76, 0, -0.5, Math.PI / 2);
    this.solid(-5, -1.1, -4.5, 0.1);
    const bookColors = [0xa63a2a, 0x2a4a6a, 0xd8c890, 0x3a6a3a, 0x8a5a9a, 0xe8602f];
    place(F.bed(), -4.2, 0, 1.75);
    this.solid(-4.95, 0.6, -3.45, 2.9);
    place(F.nightstand(), -3.19, 0, 0.84);
    this.solid(-3.42, 0.62, -2.96, 1.05);
    place(F.rug(2.3, 1.6), -2.55, 0, -0.6);
    place(F.radiator(11), -3.8, 0, -3.34);
    // exercise mat
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.8), mat(0x2a6a6a));
    rug.rotation.x = -Math.PI / 2;
    rug.rotation.z = Math.PI / 2;
    at(rug, -1.6, 0.012, 0.9, g);
    // the wardrobe, the chest of drawers with the television, the floor lamp
    place(F.wardrobe(), 0.17, 0, 2.45, -Math.PI / 2);
    this.solid(-0.11, 1.65, 0.45, 3.25);
    place(F.dresser(), 0.2, 0, -2.45, -Math.PI / 2);
    this.solid(-0.03, -2.95, 0.45, -1.95);
    place(F.floorLamp(), -0.45, 0, 1.2);
    at(this.lamp, -1.5, 2.3, 0.2, g);
    // a clock between the window and the balcony door; trims round the doorways; skirting
    place(F.clock(), -2.35, 2.12, -3.42, 0, this.wallsBack);
    place(F.architrave(1.0, 2.2), -1.1, 0, -3.43, 0, this.wallsBack);
    place(F.architrave(1.2, 2.1), 0.43, 0, 0.8, -Math.PI / 2);
    place(F.architrave(1.2, 2.1), 0.57, 0, 0.8, Math.PI / 2);
    place(F.architrave(0.9, 2.15), 4.93, 0, 2.55, -Math.PI / 2, this.wallsR);
    const skirt = (parent: THREE.Object3D, x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(F.skirting(len), F.skirtingMat());
      m.position.set((x0 + x1) / 2, 0.035, (z0 + z1) / 2);
      m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      m.userData.keepShape = true;
      m.receiveShadow = true;
      parent.add(m);
    };
    skirt(this.wallsL, -4.93, -3.44, -4.93, 3.44);
    skirt(this.wallsBack, -4.94, -3.43, -1.65, -3.43);
    skirt(this.wallsBack, -0.55, -3.43, 0.44, -3.43);
    skirt(g, 0.43, -3.44, 0.43, 0.2);
    skirt(g, 0.43, 1.4, 0.43, 3.44);
    skirt(this.wallsR, 4.93, 0.05, 4.93, 2.05);
    skirt(g, 2.45, 0.07, 4.94, 0.07);
    // ---------------- kitchen: laminate cabinets, the gas stove, the sink under the window
    place(F.kitchenRun(1.0, 4.2, [2.32, 2.88], 3.65), 0, 0, -3.14);
    this.solid(0.98, -3.45, 4.2, -2.85);
    place(F.gasStove(), 2.6, 0, -3.14);
    const pot = mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.18, 10), 0x8a8a90, 0.012);
    at(pot, 2.47, 0.99, -3.27, g);
    place(F.kettle(), 2.73, 0.9, -3.02, -0.6);
    place(F.counterThings(), 1.15, 0.918, -3.25);
    place(F.wallCabinets(1.8), 1.95, 1.48, -3.27, 0, this.wallsBack);
    const splashS = tiles();
    for (const t of [splashS.map, splashS.normal]) { t.repeat.set(3.4, 0.6); }
    const splash = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.56), new THREE.MeshStandardMaterial({ map: splashS.map, normalMap: splashS.normal, roughness: 0.25 }));
    splash.userData.keepShape = true;
    at(splash, 2.6, 1.2, -3.435, this.wallsBack);
    // the fridge with photos
    place(F.fridge(), 4.52, 0, -3.08);
    this.solid(4.15, -3.45, 4.95, -2.7);
    for (let i = 0; i < 5; i++) {
      const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12), new THREE.MeshLambertMaterial({ color: 0xd8c8a8 }));
      ph.rotation.y = -Math.PI / 2;
      at(ph, 4.205, 1.2 + (i % 2) * 0.18, -3.25 + i * 0.1, g);
      this.photos.push(ph);
      const rib = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.16), mat(0x111111));
      rib.rotation.y = -Math.PI / 2;
      rib.rotation.x = 0.7;
      at(rib, 4.2, 1.2 + (i % 2) * 0.18, -3.25 + i * 0.1 + 0.05, g);
      rib.visible = false;
      this.ribbons.push(rib);
    }
    // table under the oilcloth, two stools
    place(F.kitchenTable(), 1.6, 0, -1.6);
    place(F.stool(), 1.6, 0, -0.98, 0.2);
    place(F.stool(), 0.92, 0, -1.7, -0.3);
    this.solid(1.05, -1.95, 2.15, -1.25);
    // trash: a bin and the bags that can never be taken out
    place(F.pedalBin(), 4.65, 0, -0.6);
    this.solid(4.4, -0.85, 4.9, -0.35);
    const bagSpots: Array<[number, number, number]> = [
      [4.6, 0.3, 0], [4.4, 0.55, 0.3], [4.65, 0.75, 0.9], [4.1, 0.35, 0.6], [3.9, 1.2, 0.2], [4.6, 1.2, 1.2],
      [-0.2, 2.9, 0.4], [0.1, -2.6, 0.8], [-1.0, 2.4, 1.5], [3.8, -1.0, 0.5], [2.9, -1.2, 1.0], [-2.9, -0.4, 0.2], [-0.6, -1.6, 2.2], [1.8, -0.5, 0.4],
    ];
    bagSpots.forEach(([x, z, ry], i) => {
      const o = i < 6 || i % 3 === 0 ? F.trashBag(i + 1, i % 2 ? 0x1e1e20 : 0x2a3a5a) : i % 3 === 1 ? F.pizzaBox() : F.plasticBottle();
      o.position.set(x, 0, z);
      o.rotation.y = ry;
      o.visible = false;
      g.add(o);
      this.clutter.push(o);
    });
    // ---------------- bathroom
    place(F.bathtub(), 1.45, 0, 3.1);
    this.solid(0.55, 2.7, 2.35, 3.5);
    place(F.basin(), 0.79, 0, 1.95, Math.PI / 2);
    this.solid(0.55, 1.7, 1.0, 2.2);
    place(F.washer(), 1.95, 0, 1.86);
    this.solid(1.64, 1.55, 2.26, 2.14);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6), new THREE.MeshBasicMaterial({ color: 0x9ab0c0 }));
    mirror.rotation.y = Math.PI / 2;
    at(mirror, 0.57, 1.5, 1.95, g);
    at(this.kitchenLamp, 3.0, 2.3, -1.6, g);
    // ---------------- hall: jackets on hooks, shoes, the go-bag by the door, a mat
    place(F.coatRack(), 4.93, 0, 0.9, -Math.PI / 2, this.wallsR);
    place(F.goBag(), 4.62, 0, 1.75, -0.4);
    place(F.doorMat(), 4.5, 0, 2.55, Math.PI / 2);
    // ---------------- the balcony: preserves, boxes, the drying rack
    place(F.balconyStuff(), -1.0, 0, -4.35);
    // ---------------- perks you picked up
    const station = F.powerStation();
    at(station, -1.2, 0, -3.2, g);
    this.perkProps.station = station;
    const bottles = F.waterBottles();
    at(bottles, 1.8, 0, 0.4, g);
    this.perkProps.bottles = bottles;
    const dumb = new THREE.Group();
    for (const s of [-0.18, 0.18]) {
      const bar = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 6), 0x555555, 0);
      bar.rotation.z = Math.PI / 2;
      at(bar, 0, 0.07, s, dumb);
      for (const e of [-0.13, 0.13]) { const w = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8), 0x222222, 0.008); w.rotation.z = Math.PI / 2; at(w, e, 0.07, s, dumb); }
    }
    at(dumb, -0.9, 0, 1.5, g);
    this.perkProps.dumbbells = dumb;
    const guitar = new THREE.Group();
    const gInner = F.guitar();
    gInner.rotation.x = -0.22;
    guitar.add(gInner);
    guitar.rotation.y = Math.PI / 2;
    at(guitar, -4.82, 0, 0.42, g);
    this.perkProps.guitar = guitar;
    const books = new THREE.Group();
    for (let i = 0; i < 6; i++) at(mesh(new THREE.BoxGeometry(0.35, 0.07, 0.25), bookColors[i], 0.008), (i % 2) * 0.03, 0.035 + i * 0.07, 0, books).rotation.y = i * 0.2;
    at(books, -3.2, 0, -0.1, g);
    this.perkProps.books = books;
    const tomatoes = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(0.8, 0.3, 0.3), 0x8a5a3a, 0.015), 0, 0.15, 0, tomatoes);
    for (let i = 0; i < 3; i++) {
      at(mesh(new THREE.IcosahedronGeometry(0.18, 0), 0x3f7a3a, 0.012), -0.25 + i * 0.25, 0.5, 0, tomatoes);
      at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), mat(0xd63732)), -0.22 + i * 0.25, 0.45, 0.12, tomatoes);
    }
    at(tomatoes, -1.9, 0, -4.85, g);
    this.perkProps.tomatoes = tomatoes;
    const consoleBox = F.gamepad();
    at(consoleBox, -1.65, TOP, -3.0, g);
    this.perkProps.console = consoleBox;
    const pills = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8), 0xe8e8e8, 0.006);
    at(pills, 0.95, 0.9, 1.9, g);
    this.perkProps.meds = pills;
    const beer = F.beerBottles();
    at(beer, 3.7, 0, -2.6, g);
    this.perkProps.alcohol = beer;
    // the cat
    const fur = 0x2a2a2a;
    at(mesh(new THREE.BoxGeometry(0.22, 0.2, 0.42), fur, 0.015), 0, 0.14, 0, this.cat);
    at(mesh(new THREE.BoxGeometry(0.2, 0.18, 0.18), fur, 0.015), 0, 0.28, 0.24, this.cat);
    for (const s of [-1, 1]) at(mesh(new THREE.ConeGeometry(0.05, 0.1, 4), fur, 0.008), s * 0.06, 0.41, 0.24, this.cat);
    for (const s of [-1, 1]) at(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), glowMat(C.acid, 1.5)), s * 0.05, 0.3, 0.335, this.cat);
    const tail = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.36), fur, 0.008);
    tail.name = "tail";
    at(tail, 0, 0.24, -0.34, this.cat).rotation.x = -0.7;
    at(this.cat, -4.3, 0.62, 2.6, g);
    this.cat.visible = false;
    at(this.flashLight, -1.0, 1.8, -4.5, g);
    // what the years leave on the walls (shown in setSeason)
    const mark = (parent: THREE.Object3D, kind: Mark, w: number, h: number, x: number, y: number, z: number, ry: number, from: number, seed = 1) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: markTexture(kind, seed), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.rotation.y = ry;
      m.userData.noAO = true;
      at(m, x, y, z, parent);
      m.visible = false;
      this.marks.push({ m, from });
    };
    mark(this.wallsL, "damp", 1.3, 1.1, -4.92, 2.05, -2.4, Math.PI / 2, 4);
    mark(this.wallsL, "peel", 0.7, 0.7, -4.92, 2.25, 0.25, Math.PI / 2, 6);
    mark(this.wallsBack, "mould", 0.46, 0.6, -4.75, 2.05, -3.42, 0, 8);
    mark(this.wallsBack, "mould", 0.5, 0.5, 4.6, 2.2, -3.42, 0, 10, 2);
    mark(this.wallsBack, "ghost", 0.5, 0.45, -0.05, 1.55, -3.42, 0, 5);
    mark(this.wallsR, "scuff", 1.1, 1.1, 4.92, 1.0, 1.65, -Math.PI / 2, 3);
    mark(g, "tally", 0.75, 0.55, 0.43, 1.3, -1.6, -Math.PI / 2, 4);
    mark(g, "damp", 0.9, 0.8, 0.43, 2.2, 2.6, -Math.PI / 2, 12, 3);
  }

  // ================================================================ the courtyard

  private buildYard(): void {
    const y = this.yard;
    this.court = buildCourtyard(FLOOR_Y);
    y.add(this.court.root);
    this.groundMat = this.court.groundMat;
    this.yardLamps.push(...(this.court.lamps as THREE.Mesh[]));
    y.add(this.yardDress);
    // people
    const looks = [0x8a3a5a, 0x3a6a8a, 0xd8a03a, 0x5a8a4a, 0x7a5a9a, 0xc85a3a];
    for (let i = 0; i < 6; i++) {
      const rig = makePerson(i < 2 ? LOOKS.babka() : LOOKS.shopper(looks[i]));
      smoothen(rig.root, "far");
      if (i >= 4) rig.root.scale.setScalar(0.75);
      y.add(rig.root);
      this.walkers.push({ rig, from: new THREE.Vector3(), to: new THREE.Vector3(), t: Math.random(), speed: 0.05 + Math.random() * 0.04 });
    }
  }

  /** Season dressing: trees and snow, the plant, the clutter, the beard. */
  setSeason(season: number, opts: { clutter: number; plant: number; plantDead: boolean; perks: string[]; friends: Array<{ color: number; state: string }>; glass: boolean }): void {
    const s = season % 4;
    const winter = s === 0;
    this.groundBase.set(this.court.setSeason(s));
    if (this.snow) { this.scene.remove(this.snow); this.snow.geometry.dispose(); this.snow = null; }
    if (winter) {
      const n = 900;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 40; pos[i * 3 + 1] = FLOOR_Y + Math.random() * 22; pos[i * 3 + 2] = -4 - Math.random() * 30; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      // round, soft flakes (a square point sprite reads as confetti)
      const flake = canvasTexture(32, 32, (c) => { const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.5, "rgba(255,255,255,.7)"); gr.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); }, false);
      this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.1, map: flake, transparent: true, opacity: 0.9, depthWrite: false }));
      this.scene.add(this.snow);
    }
    // inside
    const visibleClutter = Math.min(this.clutter.length, Math.max(0, Math.round(opts.clutter)));
    this.clutter.forEach((o, i) => { o.visible = i < visibleClutter; });
    const health = opts.plantDead ? 0 : opts.plant / 100;
    const leafColor = new THREE.Color(0x3f7a3a).lerp(new THREE.Color(0x8a6a3a), 1 - health);
    this.plantLeaves.forEach((m, i) => {
      (m.material as THREE.MeshLambertMaterial).color.copy(leafColor);
      m.visible = opts.plantDead ? i < 2 : i < 4 + Math.round(health * (this.plantLeaves.length - 4));
      // a thirsty ficus lets its leaves hang
      m.rotation.x = (m.userData.rx ?? 0) + (1 - health) * 1.3;
    });
    for (const [k, o] of Object.entries(this.perkProps)) o.visible = opts.perks.includes(k);
    this.cat.visible = opts.perks.includes("cat");
    opts.friends.forEach((f, i) => {
      const ph = this.photos[i];
      if (!ph) return;
      const gone = f.state === "taken" || f.state === "front" || f.state === "volunteered" || f.state === "wounded";
      (ph.material as THREE.MeshLambertMaterial).color.set(f.color).lerp(new THREE.Color(0x8a8a8a), gone ? 0.6 : 0.2);
      this.ribbons[i].visible = f.state === "dead";
    });
    for (const { m, from } of this.marks) {
      const k = clamp((season - from + 1) / 4, 0, 1);
      m.visible = k > 0;
      (m.material as THREE.MeshLambertMaterial).opacity = k;
    }
    const tapeOn = season >= 8;
    this.wallsBack.children.forEach((c) => { if (c.name === "tape") c.visible = tapeOn; });
    this.brokenGlass.visible = opts.glass;
    this.heroFor(season);
    // years in the flat: hair and beard grow
    const k = season / 15;
    this.beard.visible = season >= 2;
    this.beard.scale.set(1.2 + k * 0.3, 0.5 + k * 1.1, 0.6 + k * 0.3);
    this.beard.position.y = -0.14 - k * 0.1;
    this.hair.scale.set(1 + k * 0.12, 1 + k * 0.25, 1 + k * 0.2);
  }

  setGlass(on: boolean): void { this.brokenGlass.visible = on; }

  /** A rainy day (eases in and out). */
  setWeather(rain: boolean): void { this.rainOn = rain; }

  /** Panic: the walls lurch in and the room stretches (dolly zoom). 0..1. */
  squeeze(k: number): void { this.squeezeV = Math.max(this.squeezeV, clamp(k, 0, 1)); }

  /** One heartbeat: the walls throb with it, harder the worse it gets. */
  heartbeat(): void { this.beat = 1; }

  // ================================================================ the memory

  /** Into the photo: summer 2021 in Kozyn. The flat and the yard go away. */
  enterMemory(kind: MemoryKind, friends: MemoryFriend[]): void {
    if (!this.memory) { this.memory = new Memory(); this.scene.add(this.memory.group); }
    this.memory.setup(kind, friends);
    this.memoryOn = true;
    this.memory.group.visible = true;
    this.flat.visible = false;
    this.yard.visible = false;
    this.rain.lines.visible = false;
    if (this.snow) this.snow.visible = false;
    this.post.setMood("memory", true);
    this.camera.position.set(0, 6, 10);
  }

  exitMemory(): void {
    this.memoryOn = false;
    if (this.memory) this.memory.group.visible = false;
    this.flat.visible = true;
    this.yard.visible = true;
    if (this.snow) this.snow.visible = true;
    this.post.setMood("home", true);
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  memoryNearest(): number | null { return this.memory?.nearest() ?? null; }

  /** Screen position above a friend's head in the memory. */
  memoryHead(i: number): { x: number; y: number } {
    const v = this.memory!.head(i).project(this.camera);
    return { x: (v.x + 1) / 2 * this.vw, y: (1 - v.y) / 2 * this.vh };
  }

  /** The shutter: a flash, the picture is taken. */
  memoryFlash(): void { this.post.flash = 0.9; }

  private updateMemory(dt: number, time: number): void {
    const m = this.memory!;
    m.update(dt, time, this.move, 2.6);
    // each memory has its light: golden hour at the dacha, moonlight and garlands, a sunny kitchen
    const L = m.light;
    this.sun.position.set(...L.sunPos);
    this.sun.target.position.set(0, 0, -1);
    this.sun.color.set(L.sun);
    this.sun.intensity = L.sunI;
    this.hemi.color.set(L.hemi);
    this.hemi.groundColor.set(L.ground);
    this.hemi.intensity = L.hemiI;
    this.scene.environmentIntensity = L.env;
    const sky = new THREE.Color(L.sky);
    this.scene.background = sky;
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(sky, 30, 75);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(sky);
    fog.near = L.fog[0];
    fog.far = L.fog[1];
    // the camera follows you, lower and closer than in the flat: this is a warm place
    const hp = m.heroPos;
    this.camPos.set(hp.x * 0.8, L.cam[0], hp.z + L.cam[1]);
    this.camLook.set(hp.x * 0.85, 0.8, hp.z - 1.2);
    this.camera.fov = this.vw / this.vh < 0.62 ? 58 : 50;
    const cam = this.camera;
    cam.position.lerp(this.camPos, Math.min(1, dt * 3));
    cam.lookAt(this.camLook);
    cam.updateProjectionMatrix();
  }

  // ================================================================ input & hero

  setMove(x: number, y: number): void { this.move.x = x; this.move.y = y; }

  get heroX(): number { return this.heroPos.x; }
  get heroZ(): number { return this.heroPos.z; }

  placeHero(x: number, z: number, yaw = Math.PI): void {
    this.heroPos.set(x, 0, z);
    this.heroYaw = yaw;
  }

  /** The closest interactive spot within reach, if any. */
  nearest(enabled: (p: PlaceId) => boolean): PlaceId | null {
    let best: PlaceId | null = null;
    let bd = Infinity;
    for (const [id, p] of Object.entries(PLACES) as Array<[PlaceId, { x: number; z: number; r: number }]>) {
      if (!enabled(id)) continue;
      const o = this.shiftFor(p.x, p.z);
      const d = Math.hypot(p.x + o.x - this.heroPos.x, p.z + o.z - this.heroPos.z);
      if (d < p.r + 0.35 && d < bd) { bd = d; best = id; }
    }
    return best;
  }

  /** Between two walls, away from windows. */
  inShelter(): boolean {
    const p = PLACES.corridor;
    return Math.hypot(this.heroPos.x - p.x, this.heroPos.z - p.z) < 1.15 || (this.heroPos.x > 0.6 && this.heroPos.x < 2.35 && this.heroPos.z > 1.55);
  }

  highlight(place: PlaceId | null): void {
    this.ring.visible = !!place && !this.pose;
    if (place) { const p = PLACES[place]; const o = this.shiftFor(p.x, p.z); this.ring.position.set(p.x + o.x, 0.03, p.z + o.z); }
  }

  setPose(id: ActionId | null): void {
    this.pose = id;
    this.poseT = 0;
    const p = id ? POSES[id] : null;
    if (p && p.pose !== "call") { const o = this.shiftFor(p.x, p.z); this.heroPos.set(p.x + o.x, 0, p.z + o.z); this.heroYaw = p.ry; }
    if (!id) {
      // step off the bed or chair
      if (this.heroPos.x < -3.4 && this.heroPos.z > 0.6) this.heroPos.set(-3.1, 0, 1.7);
      if (Math.abs(this.heroPos.x + 2.1) < 0.2 && Math.abs(this.heroPos.z + 2.3) < 0.2) this.heroPos.z = -1.85;
    }
  }

  private collide(p: THREE.Vector3): void {
    const r = 0.24;
    const off = this.off;
    for (const box of this.boxes) {
      const dx0 = box.side === "L" ? off.L : box.side === "R" ? -off.R : 0;
      const dz0 = box.side === "B" ? off.B : 0;
      const b = dx0 || dz0 ? { x0: box.x0 + dx0, x1: box.x1 + dx0, z0: box.z0 + dz0, z1: box.z1 + dz0 } : box;
      const cx = clamp(p.x, b.x0, b.x1);
      const cz = clamp(p.z, b.z0, b.z1);
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 1e-6) {
          // inside: push out along the shortest axis
          const opts = [[p.x - b.x0 + r, -1, 0], [b.x1 - p.x + r, 1, 0], [p.z - b.z0 + r, 0, -1], [b.z1 - p.z + r, 0, 1]] as const;
          const m = [...opts].sort((a, c) => a[0] - c[0])[0];
          p.x += m[1] * m[0];
          p.z += m[2] * m[0];
        } else {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        }
      }
    }
    p.x = clamp(p.x, -4.75 + off.L, 4.75 - off.R);
    p.z = clamp(p.z, -5.0, 3.3);
    // outside the flat only on the balcony (through the balcony door, which moves with the back wall)
    const bz = -3.4 + off.B;
    if (p.z < bz && (p.x < -2.2 || p.x > 0.2)) p.z = bz + 0.1;
    if (p.z < bz && p.z > bz - 0.25 && (p.x < -1.5 || p.x > -0.7)) p.z = bz + 0.1;
  }

  private updateHero(dt: number): void {
    const rig = this.hero;
    rig.root.rotation.set(0, 0, 0);
    rig.body.rotation.set(0, 0, 0);
    rig.body.position.set(0, 0, 0);
    rig.head.rotation.set(0, 0, 0);
    this.poseT += dt;
    const t = this.poseT;
    if (this.pose) {
      const p = POSES[this.pose];
      const kind = p?.pose ?? "call";
      if (kind === "call") {
        animateRig(rig, 0, dt, "call");
        rig.head.rotation.x = 0.35;
        rig.armR.rotation.x = this.pose === "mom" ? -2.3 : -1.3;
      } else if (kind === "sit") {
        animateRig(rig, 0, dt, "sit");
        if (this.pose === "work" || this.pose === "game" || this.pose === "journal") {
          rig.armL.rotation.x = -1.2 + Math.sin(t * 20) * 0.1;
          rig.armR.rotation.x = -1.2 + Math.cos(t * 17) * 0.1;
        }
        if (this.pose === "eat" || this.pose === "drink") rig.armR.rotation.x = -2 + Math.sin(t * 4) * 0.35;
        if (this.pose === "read") { rig.armL.rotation.x = rig.armR.rotation.x = -1.3; rig.head.rotation.x = 0.35; }
        if (this.pose === "guitar") { rig.armR.rotation.x = -0.9 + Math.sin(t * 9) * 0.25; rig.armL.rotation.x = -1.4; }
        if (this.pose === "read" || this.pose === "guitar") rig.body.position.y -= 0.0;
      } else if (kind === "lie") {
        rig.body.rotation.x = -Math.PI / 2;
        rig.body.position.set(0, 0.62, -0.55);
        rig.legL.rotation.x = rig.legR.rotation.x = 0;
        rig.armL.rotation.x = rig.armR.rotation.x = 0;
        rig.body.rotation.z = Math.sin(t * 0.4) * 0.03;
      } else if (kind === "push") {
        rig.body.rotation.x = Math.PI / 2 - 0.05 + Math.sin(t * 5) * 0.07;
        rig.body.position.set(0, 0.35 + Math.sin(t * 5) * 0.08, 0);
        rig.legL.rotation.x = rig.legR.rotation.x = 0;
        rig.armL.rotation.x = rig.armR.rotation.x = -Math.PI / 2;
      } else if (kind === "floor") {
        animateRig(rig, 0, dt, "sit");
        rig.body.position.y = -0.85;
        rig.legL.rotation.x = rig.legR.rotation.x = -1.3;
        rig.armL.rotation.x = rig.armR.rotation.x = -1.0;
        rig.head.rotation.x = 0.3 + Math.sin(t * 0.7) * 0.05;
        if (this.pose === "pet") rig.armR.rotation.x = -0.7 + Math.sin(t * 3) * 0.3;
      } else {
        animateRig(rig, kind === "walk" ? 0.8 : 0, dt, "idle");
        if (this.pose === "cook" || this.pose === "tidy") { rig.armL.rotation.x = rig.armR.rotation.x = -1.2 + Math.sin(t * 6) * 0.2; }
        if (this.pose === "shower" || this.pose === "wash_bottle") { rig.armL.rotation.x = -2.6 + Math.sin(t * 5) * 0.3; rig.armR.rotation.x = -2.6 + Math.cos(t * 5) * 0.3; }
        if (this.pose === "water_plant") { rig.armR.rotation.x = -1.2; rig.head.rotation.x = 0.4; }
        if (this.pose === "go_out" || this.pose === "break_out") { rig.armR.rotation.x = -1.1; rig.head.rotation.x = 0.25 + Math.sin(t * 0.3) * 0.05; }
        if (this.pose === "peephole") { rig.head.rotation.x = -0.05; rig.body.rotation.x = 0.15; }
        if (this.pose === "balcony") { rig.head.rotation.x = -0.25; rig.armL.rotation.x = rig.armR.rotation.x = -0.6; }
        if (this.pose === "look") { rig.head.rotation.x = 0.35; rig.armL.rotation.x = -0.4; }
      }
    } else {
      const mx = this.move.x;
      const mz = this.move.y;
      const len = Math.min(1, Math.hypot(mx, mz));
      const speed = this.heroSpeed * len;
      if (len > 0.05) {
        const nx = this.heroPos.x + (mx / Math.max(len, 1e-3)) * speed * dt * len;
        const nz = this.heroPos.z + (mz / Math.max(len, 1e-3)) * speed * dt * len;
        const p = new THREE.Vector3(nx, 0, nz);
        this.collide(p);
        this.heroPos.copy(p);
        const yaw = Math.atan2(mx, mz);
        let dy = yaw - this.heroYaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.heroYaw += dy * Math.min(1, dt * 12);
      }
      animateRig(rig, speed, dt, "walk");
      // the head droops when things are bad
      rig.head.rotation.x = this.info.despair * 0.35;
      rig.body.rotation.x += this.info.despair * 0.12;
    }
    rig.root.position.copy(this.heroPos);
    rig.root.rotation.y = this.heroYaw;
    rig.root.visible = this.view !== "window";
    const hh = this.heroHuman;
    if (hh) {
      const act = this.pose;
      hh.setPose(act ? BODY[act] ?? "stand" : "stand");
      hh.seat = act ? SEAT[act] ?? null : null;
      hh.slump = this.info.despair;
      const moving = !act ? Math.min(1, Math.hypot(this.move.x, this.move.y)) * this.heroSpeed : 0;
      hh.update(dt, moving);
    }
  }

  // ================================================================ window view

  windowView(on: boolean): void {
    this.view = on ? "window" : "room";
    this.wallsBack.children.forEach((c) => { if (c.name === "mullion") c.visible = !on; });
    if (on) this.camera.position.copy(this.camPos.set(-3.8, 1.65, -3.38));
  }

  knockDoor(): void {
    const d = this.door;
    let n = 0;
    const iv = window.setInterval(() => {
      d.rotation.y = n % 2 ? 0.025 : -0.015;
      if (++n > 5) { window.clearInterval(iv); d.rotation.y = 0; }
    }, 70);
  }

  boom(near: boolean): void {
    this.shake = near ? 0.55 : 0.18;
    this.post.flash = near ? 0.55 : 0.18;
    this.flashLight.intensity = near ? 40 : 12;
  }

  // ================================================================ per frame

  setInfo(i: FrameInfo): void { this.info = i; }

  private updateWorld(dt: number, time: number): void {
    const { clock, light, despair, bus, season } = this.info;
    const h = clock / 60;
    const s = season % 4;
    // sun: up 7..20 in summer, 8..17 in winter
    const rise = s === 0 ? 8 : s === 2 ? 5.5 : 7;
    const set = s === 0 ? 16.5 : s === 2 ? 21 : 19;
    const dayK = clamp(Math.min((h - rise) / 1.5, (set - h) / 1.5), 0, 1);
    const night = dayK < 0.3;
    const az = ((h - rise) / (set - rise)) * Math.PI;
    // looking down into the yard, the shadows follow the eye: the sun's box moves down there and widens
    const yardView = this.view === "window";
    const sx = yardView ? -2 : 0, sy = yardView ? FLOOR_Y : 0, sz = yardView ? -17 : 0;
    this.sun.position.set(sx + Math.cos(az) * 12 - 2, sy + 4 + Math.sin(az) * 10, sz - 10);
    this.sun.target.position.set(sx, sy, sz);
    const sc = this.sun.shadow.camera;
    const span = yardView ? 17 : 8;
    if (sc.right !== span) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix(); }
    this.sun.intensity = 0.15 + dayK * (s === 0 ? 1.1 : 1.6);
    this.sun.color.set(dayK < 0.7 ? 0xffb070 : 0xfff2dc);
    this.hemi.intensity = 0.25 + dayK * 0.85;
    this.hemi.color.set(dayK > 0.5 ? 0xdfe8ff : 0x6070a0);
    // rain: a low grey sky, a closer horizon, a darker wet yard
    this.rainK += ((this.rainOn ? 1 : 0) - this.rainK) * Math.min(1, dt * 0.6);
    const wet = this.rainK;
    this.sun.intensity *= 1 - wet * 0.65;
    this.hemi.intensity *= 1 - wet * 0.2;
    const sky = new THREE.Color(s === 0 ? 0xb8c4d0 : 0x9cc4e8).lerp(new THREE.Color(0x7c848e), wet * 0.75).lerp(new THREE.Color(0x0c1020), 1 - dayK);
    sky.lerp(new THREE.Color(0x6a6e74), despair * 0.4);
    this.scene.background = sky;
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(sky, 30, 75);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(sky);
    fog.near = lerp(30, 14, wet);
    fog.far = lerp(75, 48, wet);
    this.groundMat.color.copy(this.groundBase).multiplyScalar(1 - wet * 0.32);
    this.rain.update(dt, wet, 0.3 + dayK * 0.7);
    const gu = this.glassMat.uniforms;
    gu.time.value = time;
    gu.rain.value = wet;
    gu.bright.value = 0.3 + dayK * 0.7 * (1 - wet * 0.25);
    const beamK = dayK * (1 - wet) * (s === 0 ? 0.6 : 1) * (this.view === "window" ? 0 : 1);
    for (const b of this.beams) b.update(time, beamK);
    // the room reflection follows the daylight: glossy things do not glow at night
    this.scene.environmentIntensity = 0.08 + dayK * 0.27 * (1 - wet * 0.3);
    // lights inside
    const evening = h >= set - 1 || h < rise + 0.5;
    this.lamp.intensity = light && evening ? 5.5 : 0;
    this.kitchenLamp.intensity = light && evening ? 3.5 : 0;
    const candleOn = !light && (evening || s === 0);
    this.candle.intensity = candleOn ? 3.2 + Math.sin(time * 13) * 0.35 + Math.sin(time * 7.3) * 0.25 : 0;
    this.flameMesh.visible = candleOn;
    if (candleOn) this.flameMesh.scale.set(1, 1 + Math.sin(time * 17) * 0.15, 1);
    const working = this.pose === "work" || this.pose === "game" || this.pose === "therapy" || this.pose === "journal";
    const mode: ScreenMode = this.pose === "work" ? "code" : this.pose === "game" ? "game" : this.pose === "therapy" ? "call" : this.pose === "journal" ? "doc" : light ? "lock" : "off";
    this.laptop.update(dt, mode, clock);
    this.screenMat.color.setScalar(working ? 1.7 : 0.9);
    this.screenLight.intensity = working ? this.laptop.glow * (night || !light ? 2.4 : 0.8) * (0.92 + Math.sin(time * 7) * 0.08) : 0;
    // the block opposite: lit windows at night, dark in a blackout
    this.court.setNight(night && light);
    for (const l of this.yardLamps) l.visible = night && light;
    // the walls come closer: slowly with despair, they breathe, they throb with the heart, they lurch in panic
    this.squeezeV = Math.max(0, this.squeezeV - dt * 0.9);
    this.beat = Math.max(0, this.beat - dt * 4.5);
    const breathe = Math.sin(time * 0.9) * 0.02 * despair;
    const throb = this.beat * this.beat * (0.012 + despair * 0.05);
    const sq = this.squeezeV * this.squeezeV;
    this.off.L = despair * 0.32 + breathe + throb + sq * 0.16;
    this.off.R = despair * 0.22 + breathe + throb + sq * 0.14;
    this.off.B = this.view === "window" ? 0 : despair * 0.12 + breathe * 0.5 + throb * 0.6 + sq * 0.09;
    this.wallsL.position.x = this.off.L;
    this.wallsR.position.x = -this.off.R;
    this.wallsBack.position.z = this.off.B;
    for (const f of this.followers) {
      f.o.position.copy(f.base);
      if (f.side === "L") f.o.position.x += this.off.L;
      else if (f.side === "R") f.o.position.x -= this.off.R;
      else f.o.position.z += this.off.B;
    }
    // the funeral: the car crawls along the road, the yard kneels as it passes
    if (this.processionT >= 0) {
      this.processionT += dt;
      const car = this.procession.getObjectByName("hearse")!;
      const x = -10 + this.processionT * 1.3;
      car.position.set(x, FLOOR_Y, -7.2);
      const flag = car.getObjectByName("flag") as THREE.Mesh;
      flag.rotation.x = Math.sin(time * 4) * 0.1;
      this.mourners.forEach((r, i) => {
        const passed = x > r.root.position.x - 3;
        animateRig(r, 0, dt, "idle");
        if (passed) { r.body.position.y = -0.38; r.legL.rotation.x = r.legR.rotation.x = -1.4; r.head.rotation.x = 0.35; }
        const mh = this.mournerHumans[i];
        if (mh) { mh.setPose(passed ? "kneel" : "stand"); mh.update(dt, 0); }
      });
      if (x > 20) this.setProcession(false);
    }
    // the van
    this.van.visible = bus;
    if (bus) {
      const beacon = this.van.getObjectByName("beacon") as THREE.Mesh;
      (beacon.material as THREE.MeshBasicMaterial).color.set(Math.sin(time * 8) > 0 ? 0xff8a1a : 0x552200).multiplyScalar(Math.sin(time * 8) > 0 ? 3 : 1);
    }
    this.officers.forEach((o, i) => {
      o.rig.root.visible = bus;
      if (!bus) return;
      if (i < 2) {
        o.rig.root.position.set(-2.4 + i * 1.0, FLOOR_Y, -14.6 - i * 0.4);
        o.rig.root.rotation.y = i ? -2.4 : 2.6;
        animateRig(o.rig, 0, dt, "call");
        o.rig.armR.rotation.x = i ? -2.0 : -1.4;
        if (o.human) { o.human.setPose(i ? "smoke" : "call"); o.human.update(dt, 0); }
      } else {
        o.t += dt * 0.12;
        const k = (Math.sin(o.t) + 1) / 2;
        o.rig.root.position.set(lerp(-2.4, -3, k), FLOOR_Y, lerp(-15.5, -5.2, k));
        o.rig.root.rotation.y = Math.cos(o.t) > 0 ? 0.5 : -2.6;
        animateRig(o.rig, 1.2, dt, "walk");
        o.human?.update(dt, 1.2);
      }
    });
    // people: many in 2023, few later, none when the van is here or at night
    const year = Math.floor(season / 4);
    const crowd = night ? 0 : bus ? 1 : Math.max(1, 6 - year * 2 - (s === 0 ? 2 : 0));
    this.walkers.forEach((w, i) => {
      // men disappear from the courtyard first: babusias stay
      const visible = i < 2 ? i < Math.max(1, crowd) : i < crowd;
      w.rig.root.visible = visible;
      if (!visible) return;
      w.t += dt * w.speed;
      if (w.t >= 1 || w.from.lengthSq() === 0) {
        w.t = 0;
        const lane = (i * 7 + Math.floor(time)) % 3;
        const zz = lane === 0 ? -7.2 : lane === 1 ? -24 : -13;
        w.from.set(lane === 2 ? -3 : -22, FLOOR_Y, lane === 2 ? -6.5 : zz);
        w.to.set(lane === 2 ? -3 : 22, FLOOR_Y, lane === 2 ? -22 : zz);
        if (i % 2) [w.from, w.to] = [w.to, w.from];
      }
      w.rig.root.position.lerpVectors(w.from, w.to, w.t);
      w.rig.root.rotation.y = Math.atan2(w.to.x - w.from.x, w.to.z - w.from.z);
      animateRig(w.rig, i < 2 ? 0.7 : 1.3, dt, "walk");
      w.human?.update(dt, i < 2 ? 0.7 : 1.3);
    });
    // snow falls
    if (this.snow) {
      const p = this.snow.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        let yv = p.getY(i) - dt * 1.2;
        if (yv < FLOOR_Y) yv += 22;
        p.setY(i, yv);
        p.setX(i, p.getX(i) + Math.sin(time + i) * dt * 0.2);
      }
      p.needsUpdate = true;
    }
    // the cat
    if (this.cat.visible) {
      const tail = this.cat.getObjectByName("tail");
      if (tail) tail.rotation.y = Math.sin(time * 3) * 0.4;
      if (this.pose === "pet") this.cat.position.set(-4.0, 0, 2.5);
      else this.cat.position.set(-4.3, 0.62, 2.6);
    }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 80);
  }

  private updateCamera(dt: number, time: number): void {
    const d = this.info.despair;
    const narrow = this.vw / this.vh < 0.62;
    if (this.view === "window") {
      this.camPos.set(-3.8, 1.65, -3.38);
      this.camLook.set(-2.2, FLOOR_Y + 2.5, -19);
      this.camera.fov = 60;
    } else {
      const k = narrow ? 1.18 : 1;
      const tx = clamp(this.heroPos.x, -3.2, 3.2);
      const tz = this.heroPos.z;
      // a squeeze is a dolly zoom: the lens narrows while the camera pulls back, the room stretches
      const sq = this.squeezeV;
      this.camPos.set(tx * 0.85, 7.6 * k - d * 0.6 + sq * 2.2, tz + 6.0 * k - d * 0.5 + sq * 1.8);
      this.camLook.set(tx * 0.9, 0.6, tz - 0.4);
      this.camera.fov = (narrow ? 54 : 46) - d * 6 - sq * 13;
    }
    const cam = this.camera;
    const a = Math.min(1, dt * (this.view === "window" ? 3 : 5));
    cam.position.lerp(this.camPos, a);
    const look = new THREE.Vector3();
    cam.getWorldDirection(look);
    const target = this.camLook.clone();
    this.shake = Math.max(0, this.shake - dt * 1.4);
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.4;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }
    cam.lookAt(target);
    // a slow sway when the head is not right
    cam.rotation.z += Math.sin(time * 0.6) * 0.015 * d;
    cam.updateProjectionMatrix();
  }

  private tick(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    if (this.memoryOn) {
      if (!this.paused) this.updateMemory(dt, time);
      this.post.danger = 0;
      this.post.despair = 0;
      this.post.pulse = 0;
      this.post.tilt = this.post.quality === "low" ? 0 : 0.4;
      this.post.render(dt);
      return;
    }
    if (!this.paused) {
      this.onFrame?.(dt);
      this.updateHero(dt);
      this.updateWorld(dt, time);
    }
    this.updateCamera(dt, time);
    this.post.danger = this.info.danger;
    this.post.despair = this.info.despair;
    this.post.pulse = clamp(this.beat * this.beat * (0.15 + this.info.despair * 0.85) + this.squeezeV * 0.6, 0, 1.2);
    // the diorama look: soft top and bottom, sharp where you are (not up close at the window)
    this.post.tilt = this.post.quality === "low" || this.view === "window" ? 0 : 0.55;
    this.post.render(dt);
  }

  setMood(m: Mood): void { this.post.setMood(m); }

  /** Projects a world point to screen pixels. */
  project(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x + 1) / 2 * this.vw, y: (1 - v.y) / 2 * this.vh };
  }
}
