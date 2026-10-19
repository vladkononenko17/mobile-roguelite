import * as THREE from "three";
import {
  C, CAMO_TCK, LOOKS, animateRig, at, camoTexture, canvasTexture, carpetTexture, facadeTextures, makeBench, makeCar, makeLamp,
  makePerson, makePine, makePlant, makeTrashBins, makeTree, makeVan, mat, mesh, wallpaperTexture, type Rig,
} from "../../rozshuk/src/three/models.ts";
import { Post, defaultQuality, glowMat, lightPoolMaterial, type Mood } from "./three/post.ts";
import type { ActionId, PlaceId } from "./content.ts";

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

interface Box { x0: number; z0: number; x1: number; z1: number }

/** A person in the courtyard. */
interface Walker { rig: Rig; from: THREE.Vector3; to: THREE.Vector3; t: number; speed: number; idle?: boolean; pose?: "call" | "idle" | "grab" }

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
  private screenMat = new THREE.MeshBasicMaterial({ color: 0x6fb0ff });
  private glassMat = new THREE.MeshLambertMaterial({ color: 0xbfd8ea, transparent: true, opacity: 0.18, depthWrite: false });
  private clock = new THREE.Clock();
  readonly post: Post;
  private container: HTMLElement;

  // flat
  private flat = new THREE.Group();
  private wallsL = new THREE.Group();
  private wallsR = new THREE.Group();
  private wallsBack = new THREE.Group();
  private boxes: Box[] = [];
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
  private ground!: THREE.Mesh;
  private groundMat = new THREE.MeshLambertMaterial({ color: 0x6a8a4a });
  private facadeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private facades: Array<{ day: { map: THREE.Texture; glow: THREE.Texture }; night: { map: THREE.Texture; glow: THREE.Texture } }> = [];
  private facadeMeshes: THREE.Mesh[] = [];
  private van: THREE.Group;
  private officers: Walker[] = [];
  private walkers: Walker[] = [];
  private yardLamps: THREE.Mesh[] = [];
  private snow: THREE.Points | null = null;
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.prepend(this.renderer.domElement);
    this.renderer.domElement.id = "gl";
    this.scene.add(this.hemi, this.sun, this.sun.target, this.flat, this.yard);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 50;
    this.sun.shadow.bias = -0.0006;
    this.post = new Post(this.renderer, this.scene, this.camera, defaultQuality());

    this.buildFlat();
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
    this.flat.add(this.hero.root);

    this.buildYard();
    this.van = makeVan();
    this.van.rotation.y = Math.PI * 0.5;
    at(this.van, -0.2, FLOOR_Y, -16.5, this.yard);
    for (let i = 0; i < 3; i++) {
      const rig = makePerson(LOOKS.officer(this.camo));
      this.yard.add(rig.root);
      this.officers.push({ rig, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, speed: 1.2 });
    }

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

  private buildFlat(): void {
    const g = this.flat;
    const H = 2.7;
    // floors
    const parquet = canvasTexture(128, 128, (c) => {
      c.fillStyle = "#9a6a42";
      c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
        const v = 140 + ((i * 7 + j * 13) % 5) * 9;
        c.fillStyle = `rgb(${v},${Math.round(v * 0.7)},${Math.round(v * 0.45)})`;
        const x = j * 32 + (i % 2) * 16;
        c.fillRect(x, i * 16, 32, 16);
        if (x + 32 > 128) c.fillRect(x - 128, i * 16, 32, 16);
        c.strokeStyle = "rgba(0,0,0,.25)";
        c.strokeRect(x, i * 16, 32, 16);
        if (x + 32 > 128) c.strokeRect(x - 128, i * 16, 32, 16);
      }
    });
    parquet.repeat.set(3, 4);
    const lino = canvasTexture(64, 64, (c) => {
      c.fillStyle = "#b9a888"; c.fillRect(0, 0, 64, 64);
      c.fillStyle = "#a8967a"; c.fillRect(0, 0, 32, 32); c.fillRect(32, 32, 32, 32);
    });
    lino.repeat.set(5, 4);
    const tiles = canvasTexture(64, 64, (c) => {
      c.fillStyle = "#cfd8d8"; c.fillRect(0, 0, 64, 64);
      c.strokeStyle = "#8a9a9a"; c.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 16, 0); c.lineTo(i * 16, 64); c.stroke(); c.beginPath(); c.moveTo(0, i * 16); c.lineTo(64, i * 16); c.stroke(); }
    });
    tiles.repeat.set(2, 2);
    const floor = (x0: number, z0: number, x1: number, z1: number, tex: THREE.Texture) => {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshLambertMaterial({ map: tex }));
      f.rotation.x = -Math.PI / 2;
      f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      f.receiveShadow = true;
      g.add(f);
    };
    floor(-5, -3.5, 0.5, 3.5, parquet);
    floor(0.5, -3.5, 5, 0, lino);
    floor(0.5, 0, 5, 3.5, lino);
    floor(0.5, 1.5, 2.4, 3.5, tiles);
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
    const paper = wallpaperTexture("#c9b98a", "#b3a272");
    paper.repeat.set(5, 1.6);
    const roomWall = new THREE.MeshLambertMaterial({ map: paper });
    const kitchenWall = new THREE.MeshLambertMaterial({ color: 0xd8d0a8 });
    const hallWall = new THREE.MeshLambertMaterial({ color: 0xa8b0a0 });
    const bathWall = new THREE.MeshLambertMaterial({ map: tiles });
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
    const door = mesh(new THREE.BoxGeometry(0.1, 2.1, 0.9), 0x5a3a24, 0.02);
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
    // desk + laptop + chair
    const desk = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(1.4, 0.07, 0.7), 0x8a6a4a, 0.02), 0, 0.76, 0, desk);
    for (const [x, z] of [[-0.62, -0.28], [0.62, -0.28], [-0.62, 0.28], [0.62, 0.28]]) at(mesh(new THREE.BoxGeometry(0.06, 0.76, 0.06), 0x5a4030, 0), x, 0.38, z, desk);
    const lid = mesh(new THREE.BoxGeometry(0.5, 0.34, 0.03), 0x2a2d33, 0.01);
    at(lid, 0, 0.97, -0.17, desk).rotation.x = -0.25;
    at(new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.28), this.screenMat), 0, 0.97, -0.152, desk).rotation.x = -0.25;
    at(mesh(new THREE.BoxGeometry(0.5, 0.03, 0.32), 0x2a2d33, 0.01), 0, 0.8, 0.02, desk);
    at(mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 8), 0xe8e0d0, 0.01), 0.5, 0.85, 0.05, desk);
    at(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6), 0xf4ecd8, 0.008), -0.55, 0.86, -0.15, desk);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 6), glowMat(0xffa040, 5));
    flame.name = "flame";
    at(flame, -0.55, 0.96, -0.15, desk);
    at(this.candle, -0.55, 1.15, -0.15, desk);
    at(desk, -2.1, 0, -3.05, g);
    this.solid(-2.8, -3.45, -1.4, -2.7);
    const chair = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(0.5, 0.07, 0.5), 0x3a3a44, 0.015), 0, 0.48, 0, chair);
    at(mesh(new THREE.BoxGeometry(0.5, 0.55, 0.07), 0x3a3a44, 0.015), 0, 0.8, 0.25, chair);
    at(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.48, 6), 0x222222, 0), 0, 0.24, 0, chair);
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
    const plant = makePlant();
    plant.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.geometry as THREE.BufferGeometry).type === "ConeGeometry") { m.material = (m.material as THREE.Material).clone(); this.plantLeaves.push(m); } });
    plant.scale.setScalar(0.85);
    at(plant, 0, 0, 0, this.plant);
    at(this.plant, -4.6, 0, -2.9, g);
    this.solid(-4.9, -3.2, -4.3, -2.6);
    // shelf with books
    const shelf = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(0.4, 1.9, 1.2), 0x6a4a2a, 0.02), 0, 0.95, 0, shelf);
    const bookColors = [0xa63a2a, 0x2a4a6a, 0xd8c890, 0x3a6a3a, 0x8a5a9a, 0xe8602f];
    for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) {
      if ((r * 7 + i * 3) % 5 === 0) continue;
      at(mesh(new THREE.BoxGeometry(0.28, 0.32, 0.12), bookColors[(r * 3 + i) % bookColors.length], 0), 0.04, 0.3 + r * 0.45, -0.45 + i * 0.17, shelf);
    }
    at(shelf, -4.75, 0, -0.5, g);
    this.solid(-5, -1.1, -4.5, 0.1);
    // bed with a blanket
    const bed = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(1.5, 0.4, 2.2), 0x6a4a3a, 0.025), 0, 0.2, 0, bed);
    at(mesh(new THREE.BoxGeometry(1.4, 0.16, 2.1), 0xe8e4d8, 0.015), 0, 0.48, 0, bed);
    at(mesh(new THREE.BoxGeometry(1.42, 0.12, 1.3), 0x3a5a7a, 0.015), 0, 0.6, 0.35, bed);
    at(mesh(new THREE.BoxGeometry(0.6, 0.14, 0.4), 0xf0ece0, 0.012), 0, 0.62, -0.8, bed);
    at(mesh(new THREE.BoxGeometry(1.5, 0.7, 0.1), 0x5a3a2a, 0.02), 0, 0.55, -1.12, bed);
    at(bed, -4.2, 0, 1.75, g);
    this.solid(-4.95, 0.6, -3.45, 2.9);
    // exercise mat
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.8), mat(0x2a6a6a));
    rug.rotation.x = -Math.PI / 2;
    rug.rotation.z = Math.PI / 2;
    at(rug, -1.6, 0.012, 0.9, g);
    // floor lamp
    at(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), 0x333333, 0), -0.3, 0.8, 2.9, g);
    at(mesh(new THREE.ConeGeometry(0.28, 0.32, 8, 1, true), 0xe8d8a0, 0.015), -0.3, 1.68, 2.9, g);
    at(this.lamp, -1.5, 2.3, 0.2, g);
    // ---------------- kitchen
    at(mesh(new THREE.BoxGeometry(2.0, 0.9, 0.6), 0xe8e4d8, 0.02), 3.2, 0.45, -3.15, g);
    at(mesh(new THREE.BoxGeometry(2.0, 0.04, 0.62), 0x8a7a6a, 0.01), 3.2, 0.92, -3.15, g);
    this.solid(2.2, -3.45, 4.2, -2.85);
    // stove
    at(mesh(new THREE.BoxGeometry(0.6, 0.9, 0.6), 0xd8d8d0, 0.02), 2.6, 0.45, -3.15, g);
    for (const [x, z] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 10), mat(0x222222));
      at(ring, 2.6 + x, 0.92, -3.15 + z, g);
    }
    const pot = mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.18, 10), 0x8a8a90, 0.012);
    at(pot, 2.46, 1.02, -3.27, g);
    this.solid(2.25, -3.45, 2.95, -2.85);
    // fridge with photos
    const fridge = mesh(new THREE.BoxGeometry(0.7, 1.85, 0.68), 0xeceae2, 0.03);
    at(fridge, 4.55, 0.92, -3.05, g);
    this.solid(4.15, -3.45, 4.95, -2.7);
    for (let i = 0; i < 5; i++) {
      const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12), new THREE.MeshLambertMaterial({ color: 0xd8c8a8 }));
      ph.rotation.y = -Math.PI / 2;
      at(ph, 4.19, 1.2 + (i % 2) * 0.18, -3.25 + i * 0.1, g);
      this.photos.push(ph);
      const rib = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.16), mat(0x111111));
      rib.rotation.y = -Math.PI / 2;
      rib.rotation.x = 0.7;
      at(rib, 4.185, 1.2 + (i % 2) * 0.18, -3.25 + i * 0.1 + 0.05, g);
      rib.visible = false;
      this.ribbons.push(rib);
    }
    // table + stools
    at(mesh(new THREE.BoxGeometry(1.0, 0.06, 0.7), 0xc8b89a, 0.015), 1.6, 0.74, -1.6, g);
    for (const [x, z] of [[1.15, -1.9], [2.05, -1.9], [1.15, -1.3], [2.05, -1.3]]) at(mesh(new THREE.BoxGeometry(0.05, 0.74, 0.05), 0x666666, 0), x, 0.37, z, g);
    at(mesh(new THREE.BoxGeometry(0.4, 0.05, 0.4), 0x8a5a3a, 0.012), 1.6, 0.46, -1.0, g);
    this.solid(1.05, -1.95, 2.15, -1.25);
    // trash: a bin and the bags that can never be taken out
    at(mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.55, 8), 0x3a5a3a, 0.015), 4.65, 0.28, -0.6, g);
    this.solid(4.4, -0.85, 4.9, -0.35);
    const bagSpots: Array<[number, number, number]> = [
      [4.6, 0.3, 0], [4.4, 0.55, 0.3], [4.65, 0.75, 0.9], [4.1, 0.35, 0.6], [3.9, 1.2, 0.2], [4.6, 1.2, 1.2],
      [-0.2, 2.9, 0.4], [0.1, -2.6, 0.8], [-1.0, 2.4, 1.5], [3.8, -1.0, 0.5], [2.9, -1.2, 1.0], [-2.9, -0.4, 0.2], [-0.6, -1.6, 2.2], [1.8, -0.5, 0.4],
    ];
    bagSpots.forEach(([x, z, ry], i) => {
      let o: THREE.Mesh;
      if (i < 6 || i % 3 === 0) o = mesh(new THREE.IcosahedronGeometry(0.24, 0), i % 2 ? 0x2a2a2a : 0x3a4a6a, 0.015);
      else if (i % 3 === 1) { o = mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), 0xc8a06a, 0.01); o.position.y = 0.03; }
      else o = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), 0x3a7a5a, 0.01);
      o.rotation.y = ry;
      if (o.geometry.type === "IcosahedronGeometry") o.scale.set(1, 1.3, 1);
      o.position.set(x, o.geometry.type === "CylinderGeometry" ? 0.15 : o.position.y || 0.25, z);
      if (o.geometry.type === "CylinderGeometry") { o.rotation.z = Math.PI / 2; o.position.y = 0.05; }
      o.visible = false;
      g.add(o);
      this.clutter.push(o);
    });
    // ---------------- bathroom
    at(mesh(new THREE.BoxGeometry(1.7, 0.55, 0.75), 0xf4f4f0, 0.02), 1.45, 0.28, 3.1, g);
    this.solid(0.55, 2.7, 2.35, 3.5);
    at(mesh(new THREE.BoxGeometry(0.45, 0.15, 0.4), 0xf4f4f0, 0.015), 0.8, 0.85, 1.95, g);
    this.solid(0.55, 1.7, 1.0, 2.2);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6), new THREE.MeshBasicMaterial({ color: 0x9ab0c0 }));
    mirror.rotation.y = Math.PI / 2;
    at(mirror, 0.57, 1.5, 1.95, g);
    at(this.kitchenLamp, 3.0, 2.3, -1.6, g);
    // ---------------- perks you picked up
    const station = new THREE.Group();
    at(mesh(new THREE.BoxGeometry(0.4, 0.28, 0.25), 0x3a3d44, 0.015), 0, 0.14, 0, station);
    at(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.01), glowMat(0x6aff8a, 3)), 0.1, 0.22, 0.13, station);
    at(station, -1.2, 0, -3.2, g);
    this.perkProps.station = station;
    const bottles = new THREE.Group();
    for (let i = 0; i < 4; i++) at(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.4, 8), 0x8ab8d8, 0.012), (i % 2) * 0.28, 0.2, Math.floor(i / 2) * 0.28, bottles);
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
    at(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 10), 0xc8823a, 0.012), 0, 0.3, 0, guitar).rotation.x = Math.PI / 2;
    at(mesh(new THREE.BoxGeometry(0.06, 0.65, 0.04), 0x5a3a24, 0.008), 0, 0.75, 0, guitar);
    guitar.rotation.x = -0.25;
    at(guitar, -4.85, 0, 0.35, g);
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
    const consoleBox = mesh(new THREE.BoxGeometry(0.3, 0.06, 0.22), 0xf0f0f0, 0.008);
    at(consoleBox, -1.65, 0.82, -3.0, g);
    this.perkProps.console = consoleBox;
    const pills = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8), 0xe8e8e8, 0.006);
    at(pills, 0.95, 0.97, 1.95, g);
    this.perkProps.meds = pills;
    const beer = new THREE.Group();
    for (let i = 0; i < 5; i++) at(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 6), 0x5a3a1a, 0.006), (i % 3) * 0.1, 0.11, Math.floor(i / 3) * 0.1, beer);
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
  }

  // ================================================================ the courtyard

  private buildYard(): void {
    const y = this.yard;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 50), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    at(this.ground, 0, FLOOR_Y, -22, y);
    const asphalt = mat(0x55575a);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(90, 5), asphalt);
    road.rotation.x = -Math.PI / 2;
    at(road, 0, FLOOR_Y + 0.02, -24, y);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 18), asphalt);
    path.rotation.x = -Math.PI / 2;
    at(path, -3, FLOOR_Y + 0.02, -13, y);
    const path2 = new THREE.Mesh(new THREE.PlaneGeometry(60, 2.2), asphalt);
    path2.rotation.x = -Math.PI / 2;
    at(path2, 0, FLOOR_Y + 0.02, -7.2, y);
    // our own building below the window: the facade under us and the entrance
    const ownMaps = facadeTextures(0xc8c2b4, 11, false);
    ownMaps.map.repeat.set(5, 1.1);
    const own = new THREE.Mesh(new THREE.BoxGeometry(60, 13.2, 0.4), new THREE.MeshLambertMaterial({ map: ownMaps.map }));
    at(own, 0, FLOOR_Y + 6.5, -3.75, y);
    at(mesh(new THREE.BoxGeometry(2.6, 0.15, 1.6), 0x8a8a84, 0.02), -3, FLOOR_Y + 2.6, -4.7, y);
    at(mesh(new THREE.BoxGeometry(1.4, 2.2, 0.1), 0x4a3a2a, 0.015), -3, FLOOR_Y + 1.1, -4.0, y);
    for (let f = 1; f < 5; f++) for (const x of [-12, -1, 10]) {
      at(mesh(new THREE.BoxGeometry(2.8, 0.15, 1.4), 0xa8a49a, 0.02), x, f * 2.7 + FLOOR_Y + 0.4, -4.65, y);
      at(mesh(new THREE.BoxGeometry(2.8, 0.9, 0.06), [0xb8b0a0, 0x8a9aa8, 0xc9c2b0][(f + x) & 1 ? 1 : 0], 0.015), x, f * 2.7 + FLOOR_Y + 0.9, -5.33, y);
    }
    // the block opposite, and two at the sides
    this.facades.push({ day: facadeTextures(0xd8d0bc, 23, false), night: facadeTextures(0xd8d0bc, 23, true) });
    const f = this.facades[0];
    f.day.map.repeat.set(6, 2.4); f.day.glow.repeat.set(6, 2.4);
    f.night.map.repeat.set(6, 2.4); f.night.glow.repeat.set(6, 2.4);
    this.facadeMat = new THREE.MeshLambertMaterial({ map: f.day.map, emissiveMap: f.day.glow, emissive: 0xffffff, emissiveIntensity: 0 });
    const opposite = new THREE.Mesh(new THREE.BoxGeometry(70, 29, 6), this.facadeMat);
    at(opposite, 0, FLOOR_Y + 14.5, -40, y);
    this.facadeMeshes.push(opposite);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(6, 29, 30), this.facadeMat);
      at(side, s * 34, FLOOR_Y + 14.5, -22, y);
      this.facadeMeshes.push(side);
    }
    // parked cars, trash bins, benches, a playground, lamps
    for (let i = 0; i < 9; i++) {
      const car = makeCar(i + 3);
      car.rotation.y = Math.PI / 2;
      at(car, -20 + i * 4.6 + (i % 3) * 0.4, FLOOR_Y, -27.5, y);
    }
    for (let i = 0; i < 4; i++) {
      const car = makeCar(i + 20);
      at(car, 6 + i * 2.6, FLOOR_Y, -11.5 - (i % 2) * 0.3, y);
    }
    at(makeTrashBins(), 10, FLOOR_Y, -8.5, y);
    for (const [x, z, r] of [[-5.5, -8.4, 0], [0.5, -8.4, 0], [8, -17, Math.PI / 2]] as const) {
      const b = makeBench();
      b.rotation.y = r;
      at(b, x, FLOOR_Y, z, y);
    }
    // swings
    const swing = new THREE.Group();
    for (const s of [-1, 1]) at(mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1), 0xc83a32, 0.012), s * 1.2, 1.2, 0, swing);
    at(mesh(new THREE.BoxGeometry(2.5, 0.1, 0.1), 0xc83a32, 0.012), 0, 2.4, 0, swing);
    at(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), 0xf2b632, 0.01), 0, 0.6, 0, swing);
    at(swing, 8, FLOOR_Y, -16, y);
    const sand = mesh(new THREE.BoxGeometry(2.6, 0.25, 2.6), 0xd8c08a, 0.02);
    at(sand, 5.5, FLOOR_Y + 0.12, -13, y);
    for (const [x, z] of [[-10, -9], [6, -8.5], [-8, -20], [12, -20]]) {
      const l = makeLamp();
      at(l, x, FLOOR_Y, z, y);
      const bulb = l.getObjectByName("bulb") as THREE.Mesh;
      this.yardLamps.push(bulb);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(3, 16), lightPoolMaterial(0xffd98a, 0.4));
      pool.rotation.x = -Math.PI / 2;
      at(pool, x, FLOOR_Y + 0.04, z + 0.6, y);
      pool.name = "pool";
      this.yardLamps.push(pool);
    }
    y.add(this.yardDress);
    // people
    const looks = [0x8a3a5a, 0x3a6a8a, 0xd8a03a, 0x5a8a4a, 0x7a5a9a, 0xc85a3a];
    for (let i = 0; i < 6; i++) {
      const rig = makePerson(i < 2 ? LOOKS.babka() : LOOKS.shopper(looks[i]));
      if (i >= 4) rig.root.scale.setScalar(0.75);
      y.add(rig.root);
      this.walkers.push({ rig, from: new THREE.Vector3(), to: new THREE.Vector3(), t: Math.random(), speed: 0.05 + Math.random() * 0.04 });
    }
  }

  /** Season dressing: trees and snow, the plant, the clutter, the beard. */
  setSeason(season: number, opts: { clutter: number; plant: number; plantDead: boolean; perks: string[]; friends: Array<{ color: number; state: string }>; glass: boolean }): void {
    const s = season % 4;
    const winter = s === 0;
    const autumn = s === 3;
    this.yardDress.clear();
    this.groundMat.color.set(winter ? 0xe4e8ea : autumn ? 0x8a8a4a : s === 2 ? 0x7a9a4a : 0x6a9a4a);
    const trees: Array<[number, number]> = [[-12, -12], [-8, -15], [12, -14], [16, -10], [-16, -18], [5, -20], [-2, -20], [20, -18], [-20, -11], [9, -9.5]];
    trees.forEach(([x, z], i) => {
      const t = winter ? makePine(i + 1, true) : makeTree(i + 1, autumn);
      if (winter && i % 2) {
        // bare deciduous tree in winter: just the trunk and branches
        const bare = new THREE.Group();
        at(mesh(new THREE.CylinderGeometry(0.12, 0.18, 3.2, 6), 0x5a4a3a, 0.02), 0, 1.6, 0, bare);
        for (let k = 0; k < 4; k++) { const br = mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.4, 5), 0x5a4a3a, 0.01); br.rotation.z = (k - 1.5) * 0.6; at(br, (k - 1.5) * 0.3, 3.2, 0, bare); }
        at(bare, x, FLOOR_Y, z, this.yardDress);
      } else at(t, x, FLOOR_Y, z, this.yardDress);
    });
    if (this.snow) { this.scene.remove(this.snow); this.snow.geometry.dispose(); this.snow = null; }
    if (winter) {
      const n = 900;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 40; pos[i * 3 + 1] = FLOOR_Y + Math.random() * 22; pos[i * 3 + 2] = -4 - Math.random() * 30; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.85, depthWrite: false }));
      this.scene.add(this.snow);
    }
    // inside
    const visibleClutter = Math.min(this.clutter.length, Math.max(0, Math.round(opts.clutter)));
    this.clutter.forEach((o, i) => { o.visible = i < visibleClutter; });
    const health = opts.plantDead ? 0 : opts.plant / 100;
    const leafColor = new THREE.Color(0x3f7a3a).lerp(new THREE.Color(0x8a6a3a), 1 - health);
    this.plantLeaves.forEach((m, i) => {
      (m.material as THREE.MeshLambertMaterial).color.copy(leafColor);
      m.visible = opts.plantDead ? i < 1 : i < 2 + Math.round(health * 3);
      m.rotation.x = Math.cos(i * 1.3) * (0.5 + (1 - health) * 0.9);
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
    const tapeOn = season >= 8;
    this.wallsBack.children.forEach((c) => { if (c.name === "tape") c.visible = tapeOn; });
    this.brokenGlass.visible = opts.glass;
    // years in the flat: hair and beard grow
    const k = season / 15;
    this.beard.visible = season >= 2;
    this.beard.scale.set(1.2 + k * 0.3, 0.5 + k * 1.1, 0.6 + k * 0.3);
    this.beard.position.y = -0.14 - k * 0.1;
    this.hair.scale.set(1 + k * 0.12, 1 + k * 0.25, 1 + k * 0.2);
  }

  setGlass(on: boolean): void { this.brokenGlass.visible = on; }

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
      const d = Math.hypot(p.x - this.heroPos.x, p.z - this.heroPos.z);
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
    if (place) this.ring.position.set(PLACES[place].x, 0.03, PLACES[place].z);
  }

  setPose(id: ActionId | null): void {
    this.pose = id;
    this.poseT = 0;
    const p = id ? POSES[id] : null;
    if (p && p.pose !== "call") { this.heroPos.set(p.x, 0, p.z); this.heroYaw = p.ry; }
    if (!id) {
      // step off the bed or chair
      if (this.heroPos.x < -3.4 && this.heroPos.z > 0.6) this.heroPos.set(-3.1, 0, 1.7);
      if (Math.abs(this.heroPos.x + 2.1) < 0.2 && Math.abs(this.heroPos.z + 2.3) < 0.2) this.heroPos.z = -1.85;
    }
  }

  private collide(p: THREE.Vector3): void {
    const r = 0.24;
    for (const b of this.boxes) {
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
    p.x = clamp(p.x, -4.75, 4.75);
    p.z = clamp(p.z, -5.0, 3.3);
    // outside the flat only on the balcony
    if (p.z < -3.4 && (p.x < -2.2 || p.x > 0.2)) p.z = -3.3;
    if (p.z < -3.4 && p.z > -3.65 && (p.x < -1.5 || p.x > -0.7)) p.z = -3.3;
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
    this.sun.position.set(Math.cos(az) * 12 - 2, 4 + Math.sin(az) * 10, -10);
    this.sun.target.position.set(0, 0, 0);
    this.sun.intensity = 0.15 + dayK * (s === 0 ? 1.1 : 1.6);
    this.sun.color.set(dayK < 0.7 ? 0xffb070 : 0xfff2dc);
    this.hemi.intensity = 0.25 + dayK * 0.85;
    this.hemi.color.set(dayK > 0.5 ? 0xdfe8ff : 0x6070a0);
    const sky = new THREE.Color(s === 0 ? 0xb8c4d0 : 0x9cc4e8).lerp(new THREE.Color(0x0c1020), 1 - dayK);
    sky.lerp(new THREE.Color(0x6a6e74), despair * 0.4);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 30, 75);
    // lights inside
    const evening = h >= set - 1 || h < rise + 0.5;
    this.lamp.intensity = light && evening ? 5.5 : 0;
    this.kitchenLamp.intensity = light && evening ? 3.5 : 0;
    const candleOn = !light && (evening || s === 0);
    this.candle.intensity = candleOn ? 3.2 + Math.sin(time * 13) * 0.35 + Math.sin(time * 7.3) * 0.25 : 0;
    this.flameMesh.visible = candleOn;
    if (candleOn) this.flameMesh.scale.set(1, 1 + Math.sin(time * 17) * 0.15, 1);
    const working = this.pose === "work" || this.pose === "game" || this.pose === "therapy" || this.pose === "journal";
    this.screenMat.color.set(working ? 0x8fc8ff : light ? 0x3a5a8a : 0x101820).multiplyScalar(working ? 2 : 1);
    // the block opposite: lit windows at night, dark in a blackout
    const f = this.facades[0];
    const want = night ? f.night : f.day;
    if (this.facadeMat.map !== want.map) { this.facadeMat.map = want.map; this.facadeMat.emissiveMap = want.glow; this.facadeMat.needsUpdate = true; }
    this.facadeMat.emissiveIntensity = night && light ? 1.2 : 0;
    for (const l of this.yardLamps) l.visible = night && light;
    // the walls come closer
    const breathe = Math.sin(time * 0.9) * 0.02 * despair;
    this.wallsL.position.x = despair * 0.32 + breathe;
    this.wallsR.position.x = -despair * 0.22 - breathe;
    this.wallsBack.position.z = this.view === "window" ? 0 : despair * 0.12 + breathe * 0.5;
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
      } else {
        o.t += dt * 0.12;
        const k = (Math.sin(o.t) + 1) / 2;
        o.rig.root.position.set(lerp(-2.4, -3, k), FLOOR_Y, lerp(-15.5, -5.2, k));
        o.rig.root.rotation.y = Math.cos(o.t) > 0 ? 0.5 : -2.6;
        animateRig(o.rig, 1.2, dt, "walk");
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
      this.camPos.set(tx * 0.85, 7.6 * k - d * 0.6, tz + 6.0 * k - d * 0.5);
      this.camLook.set(tx * 0.9, 0.6, tz - 0.4);
      this.camera.fov = (narrow ? 54 : 46) - d * 6;
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
    if (!this.paused) {
      this.onFrame?.(dt);
      this.updateHero(dt);
      this.updateWorld(dt, time);
    }
    this.updateCamera(dt, time);
    this.post.danger = this.info.danger;
    this.post.despair = this.info.despair;
    this.post.render(dt);
  }

  setMood(m: Mood): void { this.post.setMood(m); }

  /** Projects a world point to screen pixels. */
  project(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x + 1) / 2 * this.vw, y: (1 - v.y) / 2 * this.vh };
  }
}
