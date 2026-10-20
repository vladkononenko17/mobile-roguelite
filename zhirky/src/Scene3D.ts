import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  at, facadeTextures, makeBench, makeCar, makeHouse, makeLamp, makePine, makeStall, mat, mesh, roofTexture,
} from "../../rozshuk/src/three/models.ts";
import { CURVE, Particles, Sky, installCurve, toonify } from "../../tikai/src/three/fx.ts";
import type { Runner } from "../../tikai/src/three/runner.ts";
import { addWoolScarf, makeShaggyDog, makeSledder, type SledderLook } from "./three/sledder.ts";
import { makeBoom, makeBranch, makeHay, makeLaundry, makeLog, makePowerup } from "../../tikai/src/three/props.ts";
import { Post, defaultQuality, lightPoolMaterial, type Mood, type Quality } from "../../stiny/src/three/post.ts";
import {
  CANDY_COLORS, SNOW, kidLook, kidSledLook, makeBlockFacade, makeCable, makeCandy, makeChurch, makeCobbles, makeDrift, makeFinishArch, makeFisher,
  makeGarland, makeGenerator, makeGrandmaHouse, makeHole, makeIce, makeKoliba, makeMountain, makeOldHouse, makePicketFence, makeRamp, makeRide,
  makeRock, makeSheep, makeSlush, makeSnowBench, makeSnowHay, makeSnowman, makeTourist, makeWaitingKid, makeWinterTree, snowCap,
  snowGroundTexture, trackTexture, type RideKind,
} from "./three/props.ts";
import { HEROES, OBSTACLES, PICKUPS, THEMES, heroById, type PickId, type Theme, type ThemeDef } from "./content.ts";
import { FLIP_T, kidDist, roadHalf, trackAt, type Ev, type Obj, type RunState, type Stage } from "./sim.ts";

/**
 * The 3D world of «З гірки!». The simulation runs down the slope along +z
 * with lanes on x; the camera sits behind and above, looking downhill, and
 * the bent-world shader drops the far slope away over the horizon. Sim x is
 * mirrored (`wx`) so that "right" in the sim is right on screen.
 *
 * You ride a sled with a kid on it; the ватага rides behind on little sleds,
 * each placed on your recorded track. Kids who fall off tumble into the snow
 * and stay there. Scenery is nine baked 40 m tiles per slope, leap-frogged.
 */

installCurve();

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

interface Live { obj: THREE.Object3D; key: string; seen: number; rig?: Runner; cur?: Float32Array; t0: number }

/** A sledder: the ride, the rider on it, maybe a dog in front. */
interface Rider {
  root: THREE.Group;
  /** Rotates for flips and spins; the ride and rider sit inside. */
  body: THREE.Group;
  rig: Runner;
  scarf: THREE.Group;
  cur: Float32Array;
  dog: THREE.Group | null;
  lastX: number;
  lean: number;
}

interface Fallen { r: Rider; vx: number; vy: number; vz: number; spin: number; t: number }

type SledPose = "ride" | "duck" | "air" | "stun" | "cheer" | "wave";

/** Geometry reduced to what merging needs: position, normal, uv; not indexed. */
function plainGeo(src: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  let geo = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name);
  if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo = geo.applyMatrix4(m);
  return geo;
}

/**
 * Merge the meshes hanging off each joint of a rig (and their ink hulls) into
 * one mesh per material. Joints still move; a person goes from ~50 draws to ~20.
 */
function mergeJoints(root: THREE.Object3D): void {
  const joints: THREE.Object3D[] = [];
  root.traverse((o) => { if (!(o as THREE.Mesh).isMesh) joints.push(o); });
  for (const g of joints) {
    const meshes = g.children.filter((c) => {
      const m = c as THREE.Mesh;
      return m.isMesh && !Array.isArray(m.material) && !m.userData.noBatch && m.children.every((h) => (h as THREE.Mesh).isMesh && h.children.length === 0);
    }) as THREE.Mesh[];
    if (meshes.length < 2) continue;
    const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; shadow: boolean; noAO: boolean }>();
    const add = (geo: THREE.BufferGeometry, mx: THREE.Matrix4, material: THREE.Material, shadow: boolean, noAO: boolean) => {
      const b = buckets.get(material) ?? { geos: [], shadow: false, noAO };
      b.geos.push(plainGeo(geo, mx));
      b.shadow ||= shadow;
      buckets.set(material, b);
    };
    for (const m of meshes) {
      m.updateMatrix();
      add(m.geometry, m.matrix, m.material as THREE.Material, m.castShadow, !!m.userData.noAO);
      for (const h of m.children as THREE.Mesh[]) {
        h.updateMatrix();
        add(h.geometry, new THREE.Matrix4().multiplyMatrices(m.matrix, h.matrix), h.material as THREE.Material, false, false);
      }
      g.remove(m);
    }
    for (const [material, b] of buckets) {
      const merged = mergeGeometries(b.geos, false);
      b.geos.forEach((x) => x.dispose());
      if (!merged) continue;
      const mm = new THREE.Mesh(merged, material);
      mm.castShadow = b.shadow;
      mm.receiveShadow = true;
      if (b.noAO) mm.userData.noAO = true;
      g.add(mm);
    }
  }
}

/**
 * Kids are small on screen and sit still on their sleds: their legs (and,
 * riding, their arms) are frozen in the riding pose and folded into the body,
 * so a kid costs a dozen draws instead of thirty.
 */
function freezeLimbs(rig: Runner, arms: boolean, pose: SledPose): void {
  poseRig(rig, new Float32Array(16), null, pose, 10, 0);
  rig.root.updateMatrixWorld(true);
  const fold = (limb: THREE.Object3D, into: THREE.Object3D) => {
    const meshes: THREE.Mesh[] = [];
    limb.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.name !== "hull") meshes.push(m); });
    for (const m of meshes) into.attach(m);
  };
  for (const t of rig.thigh) fold(t, rig.hips);
  if (arms) for (const sh of rig.shoulder) fold(sh, rig.spine);
}

/**
 * Lighter rigs for the kids of the ватага (there can be eleven of them on
 * screen): small parts lose their ink outline and their shadow.
 */
function slim(root: THREE.Object3D): void {
  const small: THREE.Mesh[] = [];
  const size = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.name === "hull") return;
    m.geometry.computeBoundingBox();
    m.geometry.boundingBox!.getSize(size);
    // only the head and the body keep their outline and shadow
    if (size.x * size.y * size.z < 0.05) small.push(m);
  });
  for (const m of small) {
    m.castShadow = false;
    for (const c of [...m.children]) if (c.name === "hull") m.remove(c);
  }
}

// joint slots, as in tikai's runner
const J = { hipY: 0, lean: 1, tL: 2, tR: 3, kL: 4, kR: 5, sL: 6, sR: 7, eL: 8, eR: 9, sZL: 10, sZR: 11, head: 12, twist: 13, roll: 14 };

function poseRider(r: Rider, pose: SledPose, dt: number, t: number): void { poseRig(r.rig, r.cur, r.scarf, pose, dt, t); }

/** Ease a rig towards a sledding pose. `cur` holds its current joint angles. */
function poseRig(g: Runner, c: Float32Array, scarf: THREE.Object3D | null, pose: SledPose, dt: number, t: number): void {
  const p = new Float32Array(16);
  p[J.hipY] = 0.45; p[J.tL] = p[J.tR] = -1.5; p[J.kL] = p[J.kR] = 0.12;
  p[J.sL] = p[J.sR] = -1.05; p[J.eL] = p[J.eR] = -0.55; p[J.lean] = 0.12; p[J.head] = -0.05;
  if (pose === "duck") {
    p[J.hipY] = 0.36; p[J.lean] = -1.35; p[J.sL] = p[J.sR] = 0.2; p[J.eL] = p[J.eR] = -0.1; p[J.head] = 0.75; p[J.kL] = p[J.kR] = 0.1;
  } else if (pose === "air") {
    p[J.tL] = p[J.tR] = -1.75; p[J.kL] = p[J.kR] = 1.1; p[J.lean] = 0.3; p[J.sL] = p[J.sR] = -0.8; p[J.sZL] = 0.35; p[J.sZR] = -0.35;
  } else if (pose === "stun") {
    p[J.lean] = -0.6; p[J.sZL] = 1.4; p[J.sZR] = -1.4; p[J.eL] = p[J.eR] = -0.4; p[J.roll] = Math.sin(t * 14) * 0.3; p[J.kL] = 0.9; p[J.kR] = 0.2;
  } else if (pose === "cheer") {
    p[J.sL] = p[J.sR] = -2.9 + Math.sin(t * 8) * 0.15; p[J.eL] = p[J.eR] = -0.2; p[J.sZL] = 0.3; p[J.sZR] = -0.3; p[J.head] = 0.25;
  } else if (pose === "wave") {
    p[J.hipY] = 0.9; p[J.tL] = p[J.tR] = 0; p[J.kL] = p[J.kR] = 0; p[J.lean] = 0;
    p[J.sR] = -2.9 + Math.sin(t * 9) * 0.35; p[J.eR] = -0.3; p[J.sZR] = -0.4; p[J.sL] = 0.05; p[J.eL] = -0.3; p[J.sZL] = 0.12;
  } else {
    // a little bounce over the bumps
    p[J.hipY] += Math.abs(Math.sin(t * 9)) * 0.02;
  }
  const k = 1 - Math.exp(-dt * 14);
  for (let i = 0; i < 16; i++) c[i] += (p[i] - c[i]) * k;
  g.hips.position.y = c[J.hipY];
  g.hips.rotation.x = c[J.lean] * 0.4;
  g.spine.rotation.x = c[J.lean] * 0.6;
  g.spine.rotation.y = c[J.twist];
  g.spine.rotation.z = c[J.roll];
  g.head.rotation.x = c[J.head];
  g.thigh[0].rotation.x = c[J.tL] - c[J.lean] * 0.4;
  g.thigh[1].rotation.x = c[J.tR] - c[J.lean] * 0.4;
  g.knee[0].rotation.x = c[J.kL];
  g.knee[1].rotation.x = c[J.kR];
  g.shoulder[0].rotation.x = c[J.sL];
  g.shoulder[1].rotation.x = c[J.sR];
  g.shoulder[0].rotation.z = -c[J.sZL] - 0.08;
  g.shoulder[1].rotation.z = -c[J.sZR] + 0.08;
  g.elbow[0].rotation.x = c[J.eL];
  g.elbow[1].rotation.x = c[J.eR];
  // the scarf flies behind you
  if (scarf) {
    scarf.rotation.x = -0.25 + Math.sin(t * 17) * 0.18;
    scarf.rotation.y = Math.sin(t * 11) * 0.25;
  }
}

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  readonly post: Post;
  private world = new THREE.Group();
  private tiles: THREE.Group[] = [];
  private tileZ: number[] = [];
  private live = new Map<number, Live>();
  private pools = new Map<string, THREE.Object3D[]>();
  private templates = new Map<string, THREE.Object3D>();
  private frame = 0;
  private time = 0;
  private hemi = new THREE.HemisphereLight(0xe6f0ff, 0x8a98b0, 1.3);
  private sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  private lamp = new THREE.PointLight(0xffe2b0, 0, 26, 1.4);
  private hero: Rider | null = null;
  private crew: Rider[] = [];
  private fallen: Fallen[] = [];
  readonly sky = new Sky();
  private spray = Object.assign(new Particles(600, false), { opacity: 0.9 });
  private glow = new Particles(400, true);
  private flakes = Object.assign(new Particles(900, false), { opacity: 0.85 });
  private sprayT = 0;
  private intro = 0;
  private introHold = true;
  private def: ThemeDef = THEMES.yard;
  private storm = false;
  private shake = 0;
  private fovKick = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private flag: THREE.Object3D | null = null;
  private spin = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.domElement.id = "gl";
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.prepend(this.renderer.domElement);
    this.scene.add(this.sky.group, this.world, this.hemi, this.sun, this.sun.target, this.lamp, this.spray.points, this.glow.points, this.flakes.points);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 30; sc.bottom = -22; sc.near = 1; sc.far = 80;
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
    this.camera.fov = w / h < 0.7 ? 66 : 56;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h);
    for (const p of [this.spray, this.glow, this.flakes]) p.setScale(h, this.camera.fov);
  }

  // ================================================================ assets

  /** The Kenney CC0 flag from «Тікай!» for the finish line. Never throws. */
  async load(): Promise<void> {
    try {
      const g = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}tikai/models/plat/flag.glb`);
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mm = m.material as THREE.MeshStandardMaterial;
        const lam = new THREE.MeshLambertMaterial({ map: mm.map, color: mm.color, flatShading: true });
        if (lam.map) lam.map.colorSpace = THREE.SRGBColorSpace;
        m.material = lam;
        m.castShadow = true;
      });
      toonify(g.scene);
      this.flag = g.scene;
    } catch { /* stand-ins are fine */ }
  }

  // ================================================================ slope setup

  setStage(st: Stage, run: RunState): void {
    this.def = THEMES[st.theme];
    this.storm = st.mod === "storm";
    for (const l of this.live.values()) this.release(l);
    this.live.clear();
    this.world.clear();
    this.tiles = [];
    this.tileZ = [];
    this.pools.clear();
    this.templates.clear();
    this.crew = [];
    this.fallen = [];
    const night = this.def.time === "night";
    const dusk = this.def.time === "dusk";
    const far = this.storm ? 70 : night ? 120 : 165;
    const fogColor = this.storm ? 0xd8e2ec : night ? 0x18203a : dusk ? 0xe0c8c8 : 0xdfeaf2;
    this.scene.fog = new THREE.Fog(fogColor, this.storm ? 12 : far * 0.35, far);
    this.camera.far = far + 20;
    // the sky dome sits inside the far plane; without this it keeps the last slope's far plane
    // and a longer slope after a shorter one clips the dome to black
    this.camera.updateProjectionMatrix();
    this.scene.background = new THREE.Color(fogColor);
    this.sky.set(this.def.time, far);
    CURVE.value = 0.0016;
    this.spray.clear();
    this.glow.clear();
    this.flakes.clear();
    this.intro = 1;
    this.introHold = true;
    this.hemi.color.set(night ? 0x6a7aa8 : dusk ? 0xf0e0e8 : 0xe6f0ff);
    this.hemi.groundColor.set(night ? 0x202838 : 0x9aa8c0);
    this.hemi.intensity = night ? 0.75 : dusk ? 1.0 : 1.3;
    this.sun.color.set(night ? 0x8aa0d8 : dusk ? 0xffc8a0 : 0xfff4e0);
    this.sun.intensity = night ? 0.6 : dusk ? 1.3 : this.storm ? 1.2 : 2.2;
    this.lamp.intensity = night ? 12 : 0;
    const mood: Mood = night ? "night" : "snow";
    this.post.bloomScale = night ? 0.4 : 0.8;
    this.post.setMood(mood, true);
    for (let i = 0; i < NT; i++) {
      const tile = this.buildTile(st, this.def.id, i, night);
      toonify(tile);
      this.bake(tile);
      tile.position.z = i * TILE - TILE;
      this.world.add(tile);
      this.tiles.push(tile);
      this.tileZ.push(i * TILE - TILE);
    }
    this.buildGoal(st);
    this.hero = this.makeHero(run);
    this.world.add(this.hero.root);
    for (let i = 0; i < st.kids.length; i++) this.addKid(st.kids[i].look);
    this.camPos.set(1.4, 1.6, 5);
    this.camLook.set(0, 0.6, -3);
  }

  private makeRider(look: SledderLook, ride: RideKind, rideColor: number, scarfColor: number, scale = 1): Rider {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const sled = makeRide(ride, rideColor);
    // the ride does not bend: one mesh per material
    this.bake(sled);
    body.add(sled);
    const rig = makeSledder(look);
    if (ride === "kid") slim(rig.root);
    const scarf = addWoolScarf(rig, scarfColor);
    if (ride === "kid") freezeLimbs(rig, true, "ride");
    mergeJoints(rig.root);
    // sit back on the sled; the tube and the tub sit you a little lower or higher
    rig.root.position.set(0, ride === "tube" ? 0.0 : ride === "nochvy" ? -0.18 : ride === "plywood" ? -0.22 : -0.06, ride === "plywood" ? -0.1 : -0.25);
    rig.root.scale.multiplyScalar(ride === "kid" ? 0.66 : 1);
    body.add(rig.root);
    root.scale.setScalar(scale);
    toonify(root);
    return { root, body, rig, scarf, cur: new Float32Array(16), dog: null, lastX: 0, lean: 0 };
  }

  private makeHero(run: RunState): Rider {
    const h = heroById(run.hero);
    const l = h.look;
    const base = l.dog ? HEROES[0].look : l;
    const look: SledderLook = {
      coat: base.coat, pants: base.pants, hat: base.hat, scarf: base.scarf, old: base.old,
      face: base.old ? "old" : h.id === "ostap" ? "cheeky" : "hero", hair: h.id === "ostap" ? 0x2a1e18 : 0x8a4a22, seed: h.id === "ostap" ? 0.3 : 0.8,
    };
    const r = this.makeRider(look, run.ride, 0xd63732, base.scarf);
    if (l.dog) {
      // Бровко pulls; a kid from the yard rides
      const dog = makeShaggyDog();
      at(dog, 0, 0, 2.0, r.root);
      const rope = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1.3), mat(0xe7ddc6));
      at(rope, 0, 0.45, 1.2, r.root);
      toonify(dog);
      r.dog = dog;
    }
    return r;
  }

  private addKid(look: number): void {
    const l = kidLook(look);
    const r = this.makeRider(kidSledLook(look), "kid", l.sled, l.scarf, 1);
    // the kids at the back are behind the camera: their shadows would not be seen either
    if (this.crew.length >= 4) r.root.traverse((o) => { o.castShadow = false; });
    this.crew.push(r);
    this.world.add(r.root);
  }

  // ================================================================ scenery tiles

  private matCache = new Map<string, THREE.Material>();
  private texMat(key: string, make: () => THREE.Texture, repeat: [number, number]): THREE.Material {
    let m = this.matCache.get(key);
    if (!m) {
      const t = make();
      t.repeat.set(repeat[0], repeat[1]);
      m = new THREE.MeshLambertMaterial({ map: t });
      this.matCache.set(key, m);
    }
    return m;
  }

  private buildTile(st: Stage, theme: Theme, i: number, night: boolean): THREE.Group {
    const g = new THREE.Group();
    const r = rand(st.node * 1000 + i * 77 + 5);
    const road = roadHalf(st) * 2;
    const e = road / 2;
    const plane = (w: number, d: number, material: THREE.Material, x: number, y = 0) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
      p.rotation.x = -Math.PI / 2;
      p.receiveShadow = true;
      at(p, x, y, TILE / 2, g);
      return p;
    };
    const trackKind = theme === "uzviz" ? "cobble" : night ? "night" : "snow";
    plane(road + 0.6, TILE, this.texMat(`track-${trackKind}`, () => trackTexture(trackKind), [1, TILE / road]), 0, 0);
    const groundMat = theme === "dnipro"
      ? this.texMat("ground-ice", () => trackTexture("ice"), [10, 6])
      : this.texMat(`ground-snow-${night}`, () => snowGroundTexture(night), [14, 6]);
    for (const s of [-1, 1]) plane(140, TILE, groundMat, s * (e + 0.3 + 70), -0.01);
    // snow banks along the track
    for (const s of [-1, 1]) {
      const bank = mesh(new THREE.BoxGeometry(0.9, 0.38, TILE), SNOW, 0.02);
      bank.scale.y = 1;
      at(bank, s * (e + 0.75), 0.12, TILE / 2, g);
    }
    const side = (s: number, x: number) => s * (e + x);
    const put = (o: THREE.Object3D, s: number, x: number, z: number, rotY = 0) => { at(o, side(s, x), 0, z, g); o.rotation.y = rotY; return o; };
    // slalom flags now and then
    if (i % 2 === 0) for (const s of [-1, 1]) {
      const pole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), i % 4 === 0 ? 0xd63732 : 0x2b5a9a, 0.008);
      put(pole, s, 1.3, 8).position.y = 0.8;
    }

    if (theme === "yard" || theme === "blackout") {
      for (const s of [-1, 1]) {
        const w = 26 + r() * 10;
        const h = 14 + Math.floor(r() * 3) * 3;
        const base = [0xd8d0c0, 0xc9c2b0, 0xb8b4a8, 0xd0c4a8][Math.floor(r() * 4)];
        // a blackout: only a few windows glow (candles, power banks)
        const { map, glow } = facadeTextures(base, i * 3 + (s > 0 ? 1 : 2), theme === "yard" ? false : r() < 0.4);
        map.repeat.set(10 / 12, h / 12);
        glow.repeat.copy(map.repeat);
        const facade = new THREE.MeshLambertMaterial({ map, emissiveMap: glow, emissive: night ? 0xffaa55 : 0x000000, emissiveIntensity: night ? 0.9 : 0 });
        const roof = new THREE.MeshLambertMaterial({ map: roofTexture(i) });
        if (theme === "yard" || r() < 0.5) put(makeBlockFacade(facade, roof, w, h), s, 14 + r() * 3, TILE / 2 + (r() - 0.5) * 8);
        else { const hh = makeHouse(6 + r() * 2, 7, i * 5 + s); snowCap(6, 7, 2.6, hh); put(hh, s, 9 + r() * 2, 14, s * Math.PI / 2); put(makePicketFence(TILE * 0.8), s, 2.4, TILE / 2); }
      }
      for (const s of [-1, 1]) {
        for (let z = 4; z < TILE; z += 11 + r() * 6) {
          const k = r();
          if (k < 0.35) put(makeWinterTree(i * 10 + z + s), s, 3 + r() * 4, z);
          else if (k < 0.55) { const car = makeCar(i * 7 + Math.floor(z)); snowCap(1.8, 4, 1.5, car); put(car, s, 4.8, z, (r() - 0.5) * 0.2); }
          else if (k < 0.7) put(makePine(i * 3 + Math.floor(z), true), s, 4 + r() * 5, z);
          else if (k < 0.8) put(makeSnowman(i + Math.floor(z)), s, 3.2 + r() * 3, z, r() * 6);
        }
        if (theme === "yard") put(makeLamp(), s, 1.6, 20, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      if (theme === "blackout") {
        if (i % 2 === 0) { const gar = makeGarland(road + 3.4, i); at(gar, 0, 0, 20, g); }
        const gen = makeGenerator();
        put(gen, i % 2 ? 1 : -1, 2.6, 18, 0.4);
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), lightPoolMaterial(0xffc070, 0.18));
        pool.rotation.x = -Math.PI / 2;
        pool.userData.noBatch = true;
        pool.renderOrder = 1;
        at(pool, side(i % 2 ? 1 : -1, -0.5), 0.04, 19, g);
      }
    }
    if (theme === "uzviz") {
      for (const s of [-1, 1]) {
        for (let z = 2; z < TILE; z += 9.5) put(makeOldHouse(i * 31 + Math.floor(z) + (s > 0 ? 7 : 0), null), s, 6 + r() * 1.5, z + 4, 0);
        if (i % 2 === 1) put(makeStall(i * 7 + s), s, 2.6, 26, s > 0 ? Math.PI / 2 : -Math.PI / 2);
        put(makeLamp(), s, 1.6, 12, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      if (i % 2 === 0) { const gar = makeGarland(road + 3.4, i); at(gar, 0, 0, 30, g); }
      if (i === 1) put(makeChurch(), -1, 26, 20);
    }
    if (theme === "dnipro") {
      for (const s of [-1, 1]) {
        // fishermen on the ice, far from the track
        for (let k = 0; k < 2; k++) {
          const f = makeFisher();
          put(f.group, s, 6 + r() * 14, r() * TILE, r() * 6);
        }
        // the far bank
        for (let k = 0; k < 6; k++) put(makePine(i * 9 + k + s, true), s, 48 + r() * 10, r() * TILE);
        if (r() < 0.5) { const hh = makeHouse(6, 6, i * 3 + s); snowCap(6, 6, 2.6, hh); put(hh, s, 56, 20); }
      }
      if (i % 3 === 0) {
        // a bridge across the river, far ahead
        const bridge = new THREE.Group();
        at(mesh(new THREE.BoxGeometry(200, 1.2, 4), 0x8a92a0, 0.05), 0, 14, 0, bridge);
        for (const x of [-70, -30, 30, 70]) at(mesh(new THREE.BoxGeometry(2.4, 14, 3), 0x7a8290, 0.04), x, 7, 0, bridge);
        at(bridge, 0, 0, 30, g);
      }
    }
    if (theme === "forest") {
      for (const s of [-1, 1]) {
        for (let k = 0; k < 10; k++) put(makePine(i * 31 + k * 7 + s, true), s, 2 + r() * 18, r() * TILE);
        for (let k = 0; k < 2; k++) put(makeRock(i * 5 + k + s), s, 2.5 + r() * 8, r() * TILE);
        if (i % 2 === 0) put(makeMountain(i * 3 + (s > 0 ? 1 : 0), false), s, 70 + r() * 20, 20);
      }
    }
    if (theme === "polonyna") {
      for (const s of [-1, 1]) {
        if (r() < 0.6) put(makeKoliba(i * 7 + s, false), s, 10 + r() * 8, 14 + r() * 10, r() * 6);
        for (let k = 0; k < 3; k++) put(makePine(i * 13 + k + s, true), s, 12 + r() * 25, r() * TILE);
        if (r() < 0.5) put(makeSnowHay(makeHay), s, 5 + r() * 6, r() * TILE);
        if (r() < 0.4) put(makeSheep(), s, 6 + r() * 8, r() * TILE, r() * 6);
        put(makePicketFence(TILE * 0.9), s, 2.6, TILE / 2);
        put(makeMountain(i * 5 + (s > 0 ? 3 : 0), true), s, 65 + r() * 25, 20);
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
    const z = st.length + 4;
    const arch = makeFinishArch(this.def.finish, e * 2 + 2.4);
    at(arch, 0, 0, z, g);
    if (this.flag) for (const s of [-1, 1]) {
      const f = this.flag.clone();
      f.scale.setScalar(3);
      at(f, s * (e + 2.2), 0, z + 1, g);
    }
    if (st.theme === "blackout") {
      const house = makeGrandmaHouse();
      house.rotation.y = Math.PI;
      at(house, 0, 0, z + 14, g);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), lightPoolMaterial(0xffc070, 0.3));
      pool.rotation.x = -Math.PI / 2;
      at(pool, 0, 0.05, z + 8, g);
    }
    toonify(g);
    this.world.add(g);
  }

  // ================================================================ things on the slope

  private variants(kind: string): number {
    return ({ snowman: 4, spruce: 3, parked: 4, stall: 3, laundry: 2, rock: 3, candy: CANDY_COLORS.length } as Record<string, number>)[kind] ?? 1;
  }

  private build(kind: string, v: number, st: Stage): THREE.Object3D {
    const W = st.laneW;
    switch (kind) {
      case "snowman": return makeSnowman(v);
      case "spruce": { const p = makePine(v * 7 + 2, true); p.scale.setScalar(0.85); return p; }
      case "drift": return makeDrift(W, st.mod === "thaw");
      case "bench": return makeSnowBench(makeBench, W);
      case "log": { const l = makeLog(W); at(mesh(new THREE.BoxGeometry(W * 0.9, 0.08, 0.3), SNOW, 0), 0, 0.62, 0, l); return l; }
      case "branch": return makeBranch(W);
      case "laundry": return makeLaundry(W, v);
      case "boom": return makeBoom(W, 1.05);
      case "hole": return makeHole();
      case "parked": { const c = makeCar(v * 11 + 3); snowCap(1.8, 4, 1.5, c); return c; }
      case "stall": { const s = makeStall(v * 7 + 1); s.rotation.y = 0; return s; }
      case "cobbles": return makeCobbles(W);
      case "sheep": { const s = makeSheep(); s.rotation.y = Math.PI; return s; }
      case "haystack": return makeSnowHay(makeHay);
      case "generator": return makeGenerator();
      case "cable": return makeCable(W);
      case "rock": return makeRock(v);
      case "ramp": return makeRamp(W);
      case "ice": return makeIce(OBSTACLES.ice.len, W * 3);
      case "slush": return makeSlush(OBSTACLES.slush.len, W);
      case "candy": { const c = makeCandy(CANDY_COLORS[v % CANDY_COLORS.length]); c.scale.setScalar(1.15); return c; }
      default: {
        const p = PICKUPS[kind as PickId];
        if (p) {
          const color = { sack: 0xd63732, petard: 0xe8602f, star: 0xf2b632, thermos: 0x54b7c6, candy: 0xf2b632, kid: 0xffffff }[p.id];
          return makePowerup(p.icon, color);
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
    if (!tpl) {
      tpl = this.build(kind, v, st);
      // static things: one mesh per material (the boom swings, sheep bob, power-ups spin)
      if (tpl instanceof THREE.Group && !["boom", "sheep"].includes(kind) && !(kind in PICKUPS)) this.bake(tpl);
      toonify(tpl);
      this.templates.set(key, tpl);
    }
    return tpl.clone(true);
  }

  private release(l: Live): void {
    l.obj.removeFromParent();
    l.obj.visible = false;
    if (l.rig) return;
    const pool = this.pools.get(l.key) ?? [];
    pool.push(l.obj);
    this.pools.set(l.key, pool);
  }

  private spawn(o: Obj, st: Stage): Live {
    if (o.kind === "fisher" || o.kind === "tourist" || o.kind === "kid") {
      const made = o.kind === "fisher" ? makeFisher() : o.kind === "tourist" ? makeTourist(o.id) : makeWaitingKid(o.look);
      slim(made.group);
      if (o.kind === "kid") freezeLimbs(made.rig, false, "wave");
      mergeJoints(made.group);
      toonify(made.group);
      this.world.add(made.group);
      return { obj: made.group, key: o.kind, seen: this.frame, rig: made.rig, cur: new Float32Array(16), t0: this.time };
    }
    const v = Math.floor(o.look * this.variants(o.kind)) % this.variants(o.kind);
    const obj = this.take(o.kind, v, st);
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, obj.rotation.y, 0);
    obj.getObjectByName("arm")?.rotation.set(0, 0, 0);
    this.world.add(obj);
    return { obj, key: `${o.kind}:${v}`, seen: this.frame, t0: this.time };
  }

  // ================================================================ events

  private v = new THREE.Vector3();
  private at(st: Stage, up = 0, ahead = 0): THREE.Vector3 { return this.v.set(wx(st.x), st.y + up, st.dist + ahead); }

  onEvent(e: Ev, st: Stage): void {
    const snow = this.def.time === "night" ? [0x8a96b4, 0x7a86a4, 0x9aa6c4] : [0xffffff, 0xeef4fa, 0xd8e6f2];
    if (e.kind === "crash" || e.kind === "bounce") {
      this.shake = e.kind === "crash" ? 0.5 : 0.3;
      this.post.flash = e.kind === "crash" ? 0.3 : 0.15;
      this.spray.emit(30, this.at(st, 0.4, 0.8), { color: snow, speed: 4, up: 3, size: 0.5, grow: 2, life: 0.9, grav: -6 });
      this.glow.emit(12, this.at(st, 1, 0.6), { color: [0xfff2a0, 0xffffff], speed: 6, up: 4, size: 0.3, life: 0.4, grav: -10 });
    }
    if (e.kind === "stumble") {
      this.shake = Math.max(this.shake, 0.2);
      this.spray.emit(16, this.at(st, 0.2, 0.6), { color: st.mod === "thaw" ? [0xc8ccc4, 0xa8aca4] : snow, speed: 3, up: 2, size: 0.4, grow: 1.8, life: 0.7, grav: -5 });
    }
    if (e.kind === "bump") { this.shake = Math.max(this.shake, 0.12); this.spray.emit(6, this.at(st, 0.4, 0.4), { color: snow, speed: 3, up: 1.5, size: 0.3, life: 0.4 }); }
    if (e.kind === "saved") { this.shake = Math.max(this.shake, 0.3); this.glow.emit(24, this.at(st, 1, 0.8), { color: [0xffd27a, 0xffffff, 0xff8a4a], speed: 6, up: 4, size: 0.35, life: 0.6, grav: -8 }); }
    if (e.kind === "candy" && this.def.time !== "night") this.glow.emit(3, this.at(st, 1.0, 0.4), { color: [0xfff2a0, 0xffffff], speed: 2.5, up: 2.5, size: 0.2, life: 0.35, grav: -4 });
    if (e.kind === "power" || e.kind === "kid") this.glow.emit(14, this.at(st, 1, 1.2), { color: [0xfff2a0, 0x54b7c6, 0xffffff], speed: 4, up: 2.5, size: 0.16, life: 0.55, grav: -3 });
    if (e.kind === "land") this.spray.emit(14, this.at(st, 0.05, 0), { color: snow, speed: 3, up: 1, size: 0.45, grow: 2, life: 0.6, grav: -2 });
    if (e.kind === "ramp") { this.fovKick = 6; this.spray.emit(20, this.at(st, 0.4, -0.2), { color: snow, speed: 2.5, up: 2, size: 0.4, grow: 2, life: 0.6, grav: -3, fwd: -3 }); }
    if (e.kind === "trick") { this.glow.emit(30, this.at(st, 1.4, 0.4), { color: [0xf2b632, 0xffffff, 0xd63732], speed: 6, up: 5, size: 0.3, life: 0.8, grav: -6 }); this.fovKick = 5; }
    if (e.kind === "launch" && e.q >= 0.85) this.fovKick = 9;
    if (e.kind === "over") this.shake = 0.6;
  }

  /** Snow from under the runners; more when you turn or brake. Snowflakes fall around the camera. */
  private emitAmbient(st: Stage, dt: number): void {
    this.sprayT -= dt;
    if (this.sprayT <= 0) {
      this.sprayT = 0.04;
      if (st.y < 0.05 && st.speed > 3 && !st.waiting) {
        const turn = Math.abs(this.hero?.lean ?? 0);
        const n = st.zone === "ice" ? 0 : 1 + Math.floor(turn * 3);
        if (n) this.spray.emit(n, this.at(st, 0.1, -0.5), { color: st.zone === "slush" ? [0xa8aca4, 0xc8ccc4] : this.def.time === "night" ? [0x8a96b4, 0x9aa6c4] : [0xffffff, 0xeef4fa], speed: 1 + turn * 2, up: 0.8, size: 0.32, grow: 2.2, life: 0.55, fwd: -2, grav: -2 });
        if (st.zone === "ice") this.glow.emit(1, this.at(st, 0.05, -0.3), { color: 0xcfefff, speed: 0.6, up: 0.2, size: 0.18, life: 0.3, fwd: -6, grav: 0 });
      }
      if (st.power === "petard") this.glow.emit(3, this.at(st, 0.5, -0.9), { color: [0xff8a2a, 0xffd27a, 0xffffff], speed: 1, up: 0.6, size: 0.4, life: 0.35, fwd: -9, grav: 0 });
    }
    // falling snow, heavy in a blizzard
    const n = this.storm ? 14 : this.def.time === "night" ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const p = this.v.set(wx(st.x) + (Math.random() - 0.5) * 30, 5 + Math.random() * 6, st.dist + Math.random() * 45 - 3);
      this.flakes.emit(1, p, { color: this.def.time === "night" ? [0xd8e0f0, 0xb8c4dc] : [0xffffff, 0xf0f6fc], speed: this.storm ? 3 : 0.4, up: -0.6, size: this.storm ? 0.1 : 0.08, life: 3.2, grav: -0.8, drag: 0.4, fwd: this.storm ? -5 : 0, spread: 0 });
    }
  }

  // ================================================================ per frame

  update(st: Stage, run: RunState, dt: number): void {
    this.time += dt;
    this.frame++;
    this.emitAmbient(st, dt);
    this.spray.update(dt);
    this.glow.update(dt);
    this.flakes.update(dt);
    const z = st.dist;
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tileZ[i] + TILE < z - 30) {
        this.tileZ[i] += NT * TILE;
        this.tiles[i].position.z = this.tileZ[i];
      }
    }
    this.updateHero(st, run, dt);
    this.updateCrew(st, dt);
    this.updateFallen(dt);
    this.updateObjects(st, dt);
    this.updateCamera(st, dt);
    const hx = wx(st.x);
    this.sun.position.set(hx + 12, 30, z - 8);
    this.sun.target.position.set(hx, 0, z + 8);
    this.lamp.position.set(hx, 3.5, z + 3);
    this.post.danger = run.hearts <= 1 && !st.waiting ? 0.25 + Math.sin(this.time * 4) * 0.1 : 0;
  }

  private riderPose(st: Stage): SledPose {
    if (st.done) return "cheer";
    if (st.stun > 0 || st.over) return "stun";
    if (st.y > 0.15) return "air";
    if (st.duck > 0) return "duck";
    return "ride";
  }

  private updateHero(st: Stage, run: RunState, dt: number): void {
    const r = this.hero;
    if (!r) return;
    const vx = (st.x - r.lastX) / Math.max(dt, 1e-4);
    r.lastX = st.x;
    r.lean += (Math.max(-1, Math.min(1, vx / 10)) - r.lean) * Math.min(1, dt * 12);
    r.root.position.set(wx(st.x), st.y, st.dist);
    r.root.rotation.z = r.lean * 0.25;
    r.root.rotation.y = -r.lean * 0.2;
    // flips, spins on ice in the tub, tumbles
    const body = r.body;
    if (st.flip > 0) body.rotation.x = Math.PI * 2 * (1 - st.flip / FLIP_T);
    else {
      // nose up on the way off a ramp, down on the way back
      const pitch = st.y > 0.1 ? (st.vy > 0 ? -0.3 : 0.15) : 0;
      body.rotation.x += (pitch - body.rotation.x) * Math.min(1, dt * 10);
    }
    if (st.zone === "ice" && run.ride === "nochvy") this.spin += dt * 7;
    else if (st.stun > 0) this.spin += dt * 9;
    else this.spin += (Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2 - this.spin) * Math.min(1, dt * 6);
    body.rotation.y = this.spin;
    r.root.visible = st.invuln <= 0 || Math.floor(this.time * 14) % 2 === 0;
    poseRider(r, this.riderPose(st), dt, this.time);
    if (r.dog) {
      r.dog.position.y = Math.abs(Math.sin(this.time * 14)) * 0.1;
      let k = 0;
      r.dog.traverse((c) => { if (c.name === "leg") c.rotation.x = Math.sin(this.time * 14 + (k++ % 2) * Math.PI) * 0.6; });
      const tail = r.dog.getObjectByName("tail");
      if (tail) tail.rotation.y = Math.sin(this.time * 20) * 0.6;
    }
  }

  private updateCrew(st: Stage, dt: number): void {
    // kids that fell off: the tail of the list goes tumbling
    while (this.crew.length > st.kids.length) {
      const r = this.crew.pop()!;
      this.fallen.push({ r, vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 2, vz: st.speed * 0.5, spin: (Math.random() - 0.5) * 14, t: 0 });
      this.spray.emit(10, r.root.position, { color: this.def.time === "night" ? [0x8a96b4, 0x9aa6c4] : [0xffffff, 0xeef4fa], speed: 3, up: 2, size: 0.4, grow: 2, life: 0.7, grav: -5 });
    }
    while (this.crew.length < st.kids.length) this.addKid(st.kids[this.crew.length].look);
    const pose = st.done ? "cheer" : undefined;
    this.crew.forEach((r, i) => {
      const kid = st.kids[i];
      const kd = kidDist(st, i);
      const tr = trackAt(st, kd);
      const vx = (kid.x - r.lastX) / Math.max(dt, 1e-4);
      r.lastX = kid.x;
      r.lean += (Math.max(-1, Math.min(1, vx / 8)) - r.lean) * Math.min(1, dt * 10);
      r.root.position.set(wx(kid.x), tr.y, kd);
      r.root.rotation.z = r.lean * 0.3;
      r.root.rotation.y = -r.lean * 0.25;
      r.root.visible = true;
      poseRider(r, pose ?? (tr.y > 0.15 ? "air" : tr.duck ? "duck" : "ride"), dt, this.time + i * 0.7);
    });
  }

  private updateFallen(dt: number): void {
    for (const f of this.fallen) {
      f.t += dt;
      const p = f.r.root.position;
      if (p.y > 0 || f.vy > 0) {
        f.vy -= 18 * dt;
        p.y = Math.max(0, p.y + f.vy * dt);
        f.r.body.rotation.x += f.spin * dt;
        f.r.body.rotation.z += f.spin * 0.4 * dt;
      } else {
        // lying in the snow, sled on its side
        f.r.body.rotation.z += (1.4 - f.r.body.rotation.z) * Math.min(1, dt * 6);
        f.r.body.rotation.x += (0 - f.r.body.rotation.x) * Math.min(1, dt * 6);
      }
      f.vz *= Math.exp(-dt * 2.5);
      f.vx *= Math.exp(-dt * 2.5);
      p.x += f.vx * dt;
      p.z += f.vz * dt;
      poseRider(f.r, f.t < 1.4 ? "stun" : "wave", dt, this.time + f.t);
    }
    // forget the ones far behind
    this.fallen = this.fallen.filter((f) => {
      const keep = f.r.root.position.z > this.camera.position.z - 10;
      if (!keep) f.r.root.removeFromParent();
      return keep;
    });
  }

  private updateObjects(st: Stage, dt: number): void {
    const view = this.storm ? 90 : 150;
    for (const o of st.objs) {
      let l = this.live.get(o.id);
      const gone = o.cat === "pick" && o.hit;
      if (gone || o.z - st.dist > view || o.z < st.dist - 25) {
        if (l) { this.release(l); this.live.delete(o.id); }
        continue;
      }
      if (!l) { l = this.spawn(o, st); this.live.set(o.id, l); }
      l.seen = this.frame;
      const obj = l.obj;
      obj.position.set(wx(o.x), 0, o.z);
      const age = this.time - l.t0;
      switch (o.kind) {
        case "candy":
          obj.position.y = o.y;
          obj.rotation.y = this.time * 3 + o.z * 0.3;
          break;
        case "kid":
          if (l.rig && l.cur) poseRig(l.rig, l.cur, l.obj.getObjectByName("scarfTail") ?? null, "wave", dt, age + o.id);
          break;
        case "tourist":
          if (l.rig && l.cur) {
            poseRig(l.rig, l.cur, null, "wave", dt, age * 0.3 + o.id);
            l.rig.hips.position.y = 0.9 + Math.abs(Math.sin(age * 6)) * 0.04;
          }
          break;
        case "sheep":
          obj.traverse((c) => { if (c.name === "bob") c.position.y = Math.abs(Math.sin(age * 7 + c.position.x * 3)) * 0.08; });
          break;
        default:
          if (o.cat === "pick") {
            obj.position.y = o.y + Math.sin(this.time * 3 + o.id) * 0.15;
            const ring = obj.getObjectByName("ring");
            if (ring) ring.rotation.y = this.time * 2;
          }
      }
      // a boom you rammed through swings up
      if (o.hit && o.cat === "obst") {
        const arm = obj.getObjectByName("arm");
        if (arm) arm.rotation.z += (1.3 - arm.rotation.z) * Math.min(1, dt * 10);
      }
    }
    for (const [id, l] of this.live) {
      if (l.seen !== this.frame) { this.release(l); this.live.delete(id); }
    }
  }

  /** The slope screen shows the ватага from the front; the push-off swoops the camera behind. */
  startRun(): void { this.introHold = false; this.intro = 1; }
  holdIntro(): void { this.introHold = true; this.intro = 1; }

  private updateCamera(st: Stage, dt: number): void {
    const hx = wx(st.x);
    const kick = (st.power === "petard" || st.zone === "ice" ? 6 : 0) + this.fovKick;
    this.fovKick *= Math.exp(-dt * 2);
    const baseFov = this.camera.aspect < 0.7 ? 66 : 56;
    const fov = baseFov + kick;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
      for (const p of [this.spray, this.glow, this.flakes]) p.setScale(window.innerHeight, this.camera.fov);
    }
    // behind and above, looking down the slope (high enough to see the first kids behind you)
    const tp = new THREE.Vector3(hx * 0.65, 5.6 + st.y * 0.4, st.dist - 6.8);
    const tl = new THREE.Vector3(hx * 0.5, 0, st.dist + 5);
    if (!this.introHold && this.intro > 0) this.intro = Math.max(0, this.intro - dt / 1.3);
    const e = this.intro * this.intro * (3 - 2 * this.intro);
    if (e > 0) {
      // in front, low, looking back up the slope at you and the ватага
      const fp = new THREE.Vector3(hx + 1.6, 1.6, st.dist + 5.4);
      const fl = new THREE.Vector3(hx + 0.2, -1.7, st.dist - 3);
      tp.lerp(fp, e);
      tl.lerp(fl, e);
      // swing round to the side on the way, not through you
      const arc = Math.sin(e * Math.PI);
      tp.x += arc * 5;
      tp.y += arc * 1.5;
    }
    if (st.over) {
      tp.set(hx + 2.4, 2.4, st.dist + 3.5);
      tl.set(hx, 0.6, st.dist - 0.5);
    }
    if (st.done) {
      tp.set(hx + 2.2, 2.0, st.dist + 5);
      tl.set(hx, 0.8, st.dist - 3);
    }
    const follow = Math.min(1, dt * (st.over || st.done || e > 0 ? 3.5 : 8));
    this.camPos.lerp(tp, follow);
    if (!st.over && !st.done && e === 0) this.camPos.z = tp.z;
    this.camLook.lerp(tl, follow);
    if (!st.over && !st.done && e === 0) this.camLook.z = tl.z;
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const s = this.shake * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camLook);
    this.camera.rotateZ((this.hero?.lean ?? 0) * 0.05);
    this.sky.update(this.camera, dt);
  }

  render(dt: number): void {
    this.post.render(dt);
  }
}
