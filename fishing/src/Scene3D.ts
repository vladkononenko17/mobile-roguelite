import * as THREE from "three";
import { Music } from "./music";
import { play } from "./sfx";
import { ANNOUNCER, DISTRACT_LINES, TOLIK } from "./lines";
import { voice } from "./voice";
import { FishingSim, type Fish, type LevelResult, type SimEvent, type SimSnapshot } from "./sim";
import { BASE_TAUNTS, FISH, HAZARD_TEXT, LEVELS, levelById, type Hazard, type Level, type Method } from "./content";
import {
  C, Limb, at, makeBobber, makeBucket, makeCan, makeCatch, makeCig, makeCooler, makeEnvironment, makeFish,
  makeFriend, makeHero, makeIceHole, makeLure, makePerson, makePhone, makeRodPod, mesh, paintSky,
  type Environment, type Fisher, type ThemeId,
} from "./three/models";

type Listener = (...args: any[]) => void;
class Emitter {
  private map = new Map<string, Set<Listener>>();
  on(name: string, fn: Listener): void {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name)!.add(fn);
  }
  once(name: string, fn: Listener): void {
    const wrap: Listener = (...args) => { this.map.get(name)?.delete(wrap); fn(...args); };
    this.on(name, wrap);
  }
  emit(name: string, ...args: unknown[]): void {
    this.map.get(name)?.forEach((fn) => fn(...args));
  }
}

interface Anim { t: number; delay: number; duration: number; step: (k: number) => void; done?: () => void }
interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; max: number; grow: number; gravity: number }

export interface Gear { rod: string; reel: string; bait: string }

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (k: number) => k * k * (3 - 2 * k);
const pickOne = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

// Positions on the bank (river runs along -z).
const HERO_POS = V(-0.95, 0, 0.2);
const FRIEND_POS = V(1.05, 0, 0.1);
const MY_BOBBER = V(-1.5, 0, -6.6);
const FRIEND_BOBBER = V(1.9, 0, -8.2);
const FEEDER_SPOT = V(-2.3, 0, -12.5);
const LURE_FAR = V(-1.7, 0, -11);
const LURE_NEAR = V(-1.1, 0, -2.5);
const MY_HOLE = V(-0.32, 0, -1.25);
const FRIEND_HOLE = V(0.5, 0, -1.65);

type SkyKey = [number, number, number, number, number];
const SKY_DAY: SkyKey[] = [
  // progress, sky top, horizon, sun light colour, sun intensity
  [0, 0x6f8fb8, 0xf4b08f, 0xffc49a, 1.4],
  [0.25, 0x5aa8d6, 0xcfe6e0, 0xfff4e0, 2.1],
  [0.7, 0x5aa0d0, 0xd8e4cf, 0xfff0d8, 2.0],
  [0.88, 0x5d6fa8, 0xff9a5a, 0xffa060, 1.6],
  [1, 0x2a2a58, 0xa45f7c, 0x9a88ff, 0.7],
];
const SKY_THEME: Partial<Record<ThemeId, { keys: SkyKey[]; fog: [number, number] }>> = {
  night: {
    keys: [[0, 0x0a0f2a, 0x2a2650, 0x9aa0ff, 0.6], [0.6, 0x0c1230, 0x332a55, 0x9aa0ff, 0.55], [0.9, 0x2a2a58, 0x8a5a78, 0xffa070, 0.6], [1, 0x5d6fa8, 0xff9a5a, 0xffb080, 1.2]],
    fog: [14, 70],
  },
  ice: {
    keys: [[0, 0x8fa8c4, 0xf0d8d0, 0xffe0d0, 1.5], [0.4, 0x9fc2dc, 0xeef4f7, 0xffffff, 2.0], [1, 0x7a86a8, 0xe8c0b8, 0xffc8b0, 1.3]],
    fog: [16, 80],
  },
  plant: {
    keys: [[0, 0x8a8f78, 0xd8c890, 0xffe0a0, 1.5], [0.5, 0x9aa088, 0xe0d4a0, 0xfff0c0, 1.8], [1, 0x6a5a68, 0xd89a60, 0xffa060, 1.3]],
    fog: [16, 75],
  },
  swamp: {
    keys: [[0, 0x5a6a58, 0xa8b08a, 0xd8e0b0, 1.2], [0.5, 0x6a7a68, 0xb8c098, 0xe8f0c0, 1.5], [1, 0x3a3a48, 0x8a7a6a, 0xc0a080, 0.9]],
    fog: [8, 48],
  },
};

export class Scene3D {
  readonly uiEvents = new Emitter();
  sim = new FishingSim({ level: 1 });
  level: Level = LEVELS[0];
  private mode: "menu" | "playing" | "paused" | "over" = "menu";
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 0.46, 0.1, 400);
  private camBase = V(0, 3.0, 5.0);
  private camLook = V(0.05, 0.2, -4.6);
  private sunLight = new THREE.DirectionalLight(0xffffff, 2);
  private hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6a3a, 1.1);
  private env!: Environment;
  private theme: ThemeId = "dacha";
  private snow: THREE.Points | null = null;
  private hero!: Fisher;
  private friend!: Fisher;
  private myBobber = makeBobber();
  private friendBobber = makeBobber();
  private lure = makeLure();
  private pod = makeRodPod();
  private myHole = makeIceHole();
  private friendHole = makeIceHole();
  private stick!: THREE.Mesh;
  private myRod = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: 0x5b3a1f, flatShading: true }));
  private friendRod = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: 0x2c3036, flatShading: true }));
  private myLine = this.makeLine();
  private friendLine = this.makeLine();
  private myBucket = makeBucket();
  private friendBucket = makeBucket();
  private bucketFish: THREE.Group[] = [];
  private can = makeCan();
  private phone = makePhone();
  private friendPhone = makePhone();
  private cig = makeCig();
  private stealArm!: Limb;
  private anims: Anim[] = [];
  private particles: Particle[] = [];
  private props: THREE.Object3D[] = [];
  private fx!: HTMLElement;
  private alertEl!: HTMLElement;
  private questionEl!: HTMLElement;
  private youTag!: HTMLElement;
  private tolikTag!: HTMLElement;
  private youTagUntil = 0;
  private bubble: { el: HTMLElement; until: number } | null = null;
  private clock = new THREE.Clock();
  private t = 0;
  private hudClock = 0;
  private puffClock = 0;
  private envClock = 0;
  private shakeTime = 0;
  private shakePower = 0;
  private sway = 0;
  private friendPose: "rod" | "phone" | "stretch" | "away" = "rod";
  private friendAway = 0; // 0 seated … 1 in the bushes
  private friendLookTarget = 0;
  private friendRodPull = 0;
  private myRodPull = 0;
  private sleepTilt = 0;
  private beerT = -1;
  private jig = 0;
  private prevInterest = 0;
  private lineEnd = MY_BOBBER.clone();
  private hookedAt = LURE_FAR.clone();
  private castAnim = 1;
  private hazardT = 0;
  private melt: { t: number; from: THREE.Vector3 } | null = null;
  private brokenRod: THREE.Mesh[] = [];
  private tmp = new THREE.Vector3();
  readonly music = new Music();
  private ratchetClock = 0;
  private rageWarned = false;

  mount(container: HTMLElement, fx: HTMLElement): void {
    this.fx = fx;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.env = makeEnvironment("dacha");
    this.scene.add(this.env.group);
    this.scene.fog = new THREE.Fog(0xcfe6e0, 22, 95);
    this.scene.add(this.hemi);
    this.sunLight.position.set(-6, 10, 4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sunLight.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
    this.sunLight.shadow.bias = -0.002;
    this.scene.add(this.sunLight, this.sunLight.target);

    this.hero = makeHero();
    this.hero.root.position.copy(HERO_POS);
    this.hero.root.rotation.y = 0.12;
    this.friend = makeFriend();
    this.friend.root.position.copy(FRIEND_POS);
    this.friend.root.rotation.y = -0.18;
    this.scene.add(this.hero.root, this.friend.root);
    this.stealArm = new Limb(this.hero.body, 0.065, C.olive);
    this.stealArm.mesh.visible = false;

    at(this.myBucket, -1.55, 0, 0.75, this.scene);
    at(this.friendBucket, 0.1, 0, -0.25, this.scene);
    const cooler = makeCooler();
    at(cooler, -1.75, 0, -0.2, this.scene).rotation.y = 0.5;
    this.myRod.castShadow = this.friendRod.castShadow = true;
    this.scene.add(this.myBobber, this.friendBobber, this.myRod, this.friendRod, this.myLine, this.friendLine, this.lure);
    this.myBobber.position.copy(MY_BOBBER);
    this.friendBobber.position.copy(FRIEND_BOBBER);
    at(this.pod, HERO_POS.x + 0.42, 0, HERO_POS.z - 0.55, this.scene);
    at(this.myHole, MY_HOLE.x, 0.04, MY_HOLE.z, this.scene).scale.setScalar(1.5);
    at(this.friendHole, FRIEND_HOLE.x, 0.04, FRIEND_HOLE.z, this.scene).scale.setScalar(1.5);
    // Rod rest stick for when Tolik's hands are busy.
    this.stick = mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 4), C.wood, 0.012);
    at(this.stick, FRIEND_POS.x + 0.55, 0.3, FRIEND_POS.z - 0.75, this.scene).rotation.z = -0.15;

    this.hero.body.add(this.can, this.phone);
    this.hero.head.add(this.cig);
    at(this.cig, 0.04, -0.09, -0.17).rotation.y = 0.5;
    this.friend.body.add(this.friendPhone);
    this.can.visible = this.phone.visible = this.cig.visible = this.friendPhone.visible = false;

    this.alertEl = this.fxEl("fx-alert", "!");
    this.questionEl = this.fxEl("fx-q", "?");
    this.youTag = this.nameTag("ВЫ", "you");
    this.tolikTag = this.nameTag("ТОЛИК", "tolik");

    this.myHole.visible = this.friendHole.visible = false;
    this.applyRig("float");
    this.resize();
    window.addEventListener("resize", () => this.resize());
    new ResizeObserver(() => this.resize()).observe(container);
    this.applyDayLight(0.3);
    this.renderer.setAnimationLoop(() => this.frame());
    this.uiEvents.emit("ready");
  }

  // -------------------------------------------------------------- public API
  /** Show a location behind the menus (map preview). */
  preview(levelId: number): void {
    if (this.mode === "playing" || this.mode === "paused") return;
    this.setTheme(levelById(levelId).theme);
  }

  startLevel(levelId: number, gear: Gear, method: Method): void {
    this.level = levelById(levelId);
    this.sim = new FishingSim({ seed: Date.now() & 0xffffffff, level: this.level.id, gear, method });
    this.setTheme(this.level.theme);
    this.resetVisuals();
    this.applyRig(this.sim.method);
    this.mode = "playing";
    this.rageWarned = false;
    // The "ВЫ" marker helps on the first look at the scene, then gets out of the way.
    this.youTagUntil = this.t + 10;
    this.youTag.classList.remove("gone");
    this.toast(`УРОВЕНЬ ${this.level.id} · ${this.level.name}`);
    this.music.start();
    this.music.setCalm(false);
    voice.say("announcer", this.level.intro, 3);
    this.animate(0.01, () => undefined, () => this.say(this.level.tolikIntro, 2800), 2.2);
    this.emitHud();
  }

  tapRod(): void { if (this.mode === "playing") this.sim.tap(); }
  hold(down: boolean): void { if (this.mode === "playing" || !down) this.sim.hold(down); }
  beer(): void { if (this.mode === "playing") this.sim.drinkBeer(); }
  smoke(): void { if (this.mode === "playing") this.sim.lightSmoke(); }
  openPhone(): void { if (this.mode === "playing") this.sim.openPhone(); }
  swipe(): void { if (this.mode === "playing") this.sim.swipe(); }
  closePhone(): void { if (this.mode === "playing") this.sim.closePhone(); }
  stealStart(): void { if (this.mode === "playing") this.sim.startSteal(); }
  stealEnd(): void { if (this.mode === "playing") this.sim.cancelSteal(); }

  togglePause(force?: boolean): void {
    if (this.mode === "playing" && force !== true) {
      this.mode = "paused";
      this.sim.hold(false);
      voice.stop();
      this.music.setCalm(true);
      this.uiEvents.emit("paused", true);
    } else if (this.mode === "paused") {
      this.mode = "playing";
      this.clock.getDelta();
      this.music.setCalm(false);
      this.uiEvents.emit("paused", false);
    }
  }

  pauseIfPlaying(): void {
    if (this.mode === "playing") this.togglePause();
  }

  /** Leave the level without a result (back to the map). */
  abandon(): void {
    this.mode = "menu";
    voice.stop();
    this.music.setCalm(true);
    this.resetVisuals();
  }

  // -------------------------------------------------------------- level setup
  private setTheme(theme: ThemeId): void {
    if (theme === this.theme && this.env) return;
    this.theme = theme;
    this.scene.remove(this.env.group);
    this.env.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.env = makeEnvironment(theme);
    this.scene.add(this.env.group);
    const sky = SKY_THEME[theme];
    const fog = this.scene.fog as THREE.Fog;
    fog.near = sky?.fog[0] ?? 22;
    fog.far = sky?.fog[1] ?? 95;
    this.hemi.groundColor.setHex(theme === "ice" ? 0xbfd0dc : theme === "night" ? 0x3a4060 : 0x5a6a3a);
    this.hemi.color.setHex(theme === "night" ? 0x8a9aff : 0xcfe6ff);
    this.snow = null;
    if (theme === "ice") this.makeSnow();
    const icy = theme === "ice";
    this.myHole.visible = this.friendHole.visible = icy;
    this.stick.visible = !icy;
    this.applyDayLight(this.mode === "playing" ? 0 : 0.3);
  }

  private makeSnow(): void {
    const n = 380;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = Math.random() * 7;
      pos[i * 3 + 2] = 3 - Math.random() * 16;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.85 }));
    this.env.group.add(this.snow);
  }

  /** Which rig sits in the water for the chosen method. */
  private applyRig(method: Method): void {
    this.myBobber.visible = method === "float";
    this.lure.visible = method === "spin";
    this.pod.visible = method === "feeder";
    this.friendBobber.visible = method !== "ice";
    this.myBobber.scale.setScalar(1);
  }

  // -------------------------------------------------------------- frame loop
  private resize(): void {
    const parent = this.renderer.domElement.parentElement;
    const w = Math.max(1, parent?.clientWidth ?? window.innerWidth);
    const h = Math.max(1, parent?.clientHeight ?? window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep both fishermen in frame on narrow phones: widen the lens as needed.
    const needHalfWidth = 2.75;
    const dist = this.camBase.distanceTo(V(0, 0.6, 0.2));
    const hFov = 2 * Math.atan(needHalfWidth / dist);
    const vFov = 2 * Math.atan(Math.tan(hFov / 2) / this.camera.aspect);
    this.camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vFov), 48, 82);
    // Shift the picture up so the bank sits above the thumb controls.
    const controls = Math.min(210, h * 0.26);
    this.camera.setViewOffset(w, h + controls, 0, controls * 0.45, w, h);
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(0.1, this.clock.getDelta());
    if (this.mode === "paused") {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.t += dt;
    if (this.mode === "playing") {
      const events = this.sim.update(dt);
      events.forEach((e) => this.handle(e));
    }
    const snap = this.sim.snapshot();
    this.audioTick(snap, dt);
    this.runAnims(dt);
    this.animateWorld(snap, dt);
    this.animateHazards(snap, dt);
    this.animatePeople(snap, dt);
    this.updateRods(snap, dt);
    this.updateParticles(dt);
    this.updateCamera(snap, dt);
    this.updateFx(snap);
    if (this.mode === "playing") {
      this.hudClock -= dt;
      if (this.hudClock <= 0) {
        this.hudClock = 0.06;
        this.emitHud(snap);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  private emitHud(snap = this.sim.snapshot()): void {
    this.uiEvents.emit("hud", snap);
  }

  private resetVisuals(): void {
    this.anims = [];
    this.particles.forEach((p) => this.scene.remove(p.mesh));
    this.particles = [];
    this.brokenRod.forEach((m) => this.scene.remove(m));
    this.brokenRod = [];
    this.props.forEach((p) => this.scene.remove(p));
    this.props = [];
    this.melt = null;
    this.bubble?.el.remove();
    this.bubble = null;
    this.hero.root.position.copy(HERO_POS);
    this.hero.root.rotation.set(0, 0.12, 0);
    this.hero.root.children.forEach((c) => { c.visible = true; });
    this.hero.body.position.set(0, 0, 0);
    this.hero.body.rotation.set(0, 0, 0);
    this.hero.body.visible = true;
    this.friendPose = "rod";
    this.friendAway = 0;
    this.friendLookTarget = 0;
    this.sleepTilt = 0;
    this.beerT = -1;
    this.sway = 0;
    this.castAnim = 1;
    this.env.boat.visible = this.env.jetski.visible = this.env.drone.visible = false;
    this.clock.getDelta();
  }

  // -------------------------------------------------------------- animation
  private animate(duration: number, step: (k: number) => void, done?: () => void, delay = 0): void {
    this.anims.push({ t: 0, delay, duration, step, done });
  }

  private later(delay: number, fn: () => void): void {
    this.animate(0.01, () => undefined, fn, delay);
  }

  private runAnims(dt: number): void {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      if (!a) continue;
      if (a.delay > 0) { a.delay -= dt; continue; }
      a.t += dt;
      const k = Math.min(1, a.t / a.duration);
      a.step(k);
      if (k >= 1) {
        this.anims.splice(this.anims.indexOf(a), 1);
        a.done?.();
      }
    }
  }

  private animateWorld(s: SimSnapshot, dt: number): void {
    if (!this.env.frozen) {
      const pos = this.env.water.geometry.attributes.position as THREE.BufferAttribute;
      const base = this.env.waterBase;
      const rough = s.hazard === "jetski" || s.hazard === "dump" ? 2.2 : 1;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const z = base[i * 3 + 2];
        pos.setY(i, -0.08 + (Math.sin(x * 0.7 + this.t * 1.3) * 0.05 + Math.cos(z * 0.9 + this.t * 1.1 + x * 0.3) * 0.05) * rough);
      }
      pos.needsUpdate = true;
      this.env.water.geometry.computeVertexNormals();
    }
    this.env.clouds.forEach((c, i) => {
      c.position.x += 0.6 * (1 + i * 0.3) * dt;
      if (c.position.x > 60) c.position.x = -60;
    });
    this.env.flicker.forEach((l, i) => {
      l.userData.base ??= l.intensity;
      l.intensity = l.userData.base * (0.8 + Math.sin(this.t * 13 + i) * 0.1 + Math.random() * 0.2);
    });
    this.envClock -= dt;
    if (this.envClock <= 0) {
      this.envClock = 0.35;
      for (const p of this.env.steam) {
        const far = p.z < -15;
        this.spawn(p.clone().add(V((Math.random() - 0.5) * (far ? 1 : 0.1), 0, 0)), V(far ? 0.6 : 0.05, far ? 2.2 : 0.4, 0), far ? 0xcfcfc4 : 0x9a9a92, far ? 4 : 2.2, 2.2, 0, far ? 0.9 : 0.06);
      }
    }
    if (this.snow) {
      const pos = this.snow.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - dt * (0.5 + (i % 5) * 0.12);
        if (y < 0) y = 7;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(this.t + i) * dt * 0.15);
      }
      pos.needsUpdate = true;
    }
    if (this.env.crowd.length) {
      const hype = s.hazard === "crowd" ? 1 : 0.15;
      this.env.crowd.forEach((p, i) => {
        p.userData.y ??= p.position.y;
        p.position.y = p.userData.y + Math.abs(Math.sin(this.t * (6 + (i % 3)) + i)) * 0.3 * hype;
      });
    }
    this.applyDayLight(this.mode === "menu" ? 0.3 : s.dayProgress);
  }

  /** Moving hazard props: the fishing inspector's boat, a jet ski, a drone, bugs. */
  private animateHazards(s: SimSnapshot, dt: number): void {
    const h = this.mode === "menu" ? null : s.hazard;
    this.hazardT = h ? this.hazardT + dt : 0;
    const { boat, jetski, drone } = this.env;
    if (h === "nadzor") {
      boat.visible = true;
      const k = ease(Math.min(1, this.hazardT / 2.2));
      boat.position.set(lerp(-16, -3.2, k), Math.sin(this.t * 2) * 0.05, -6.2);
      boat.rotation.z = Math.sin(this.t * 1.6) * 0.03;
      const siren = boat.getObjectByName("siren") as THREE.Mesh | undefined;
      if (siren) (siren.material as THREE.MeshLambertMaterial).color.setHex(Math.floor(this.t * 6) % 2 ? 0x3a7bff : 0xd63732);
    } else if (boat.visible) {
      boat.position.x -= dt * 7;
      if (boat.position.x < -18) boat.visible = false;
    }
    if (h === "jetski") {
      jetski.visible = true;
      const k = Math.min(1, this.hazardT / 3.5);
      jetski.position.set(lerp(-22, 22, k), 0.05 + Math.abs(Math.sin(this.t * 9)) * 0.12, -8.5);
      jetski.rotation.set(0, 0, Math.sin(this.t * 7) * 0.1);
      if (Math.random() < 0.6) this.spawn(jetski.position.clone().add(V(-1, 0.1, 0)), V(-1.5, 1.8, (Math.random() - 0.5)), 0xe2f6f2, 0.6, 0.4, 5, 0.07);
      if (k >= 1) jetski.visible = false;
    } else jetski.visible = false;
    if (h === "drone") {
      drone.visible = true;
      drone.position.set(Math.sin(this.t * 0.7) * 1.3, 1.9 + Math.sin(this.t * 2.3) * 0.12, -1.6 + Math.cos(this.t * 0.5) * 0.4);
      drone.rotation.z = Math.sin(this.t * 1.4) * 0.12;
      drone.children.forEach((c) => { if (c.name === "rotor") c.rotation.y += dt * 40; });
    } else drone.visible = false;
    if (h === "mosquito" && Math.random() < 0.5) {
      const head = this.hero.head.getWorldPosition(new THREE.Vector3());
      this.spawn(head.add(V((Math.random() - 0.5) * 0.7, (Math.random() - 0.2) * 0.6, (Math.random() - 0.5) * 0.5)), V((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.8, 0), 0x171318, 0.5, 0, 0, 0.018);
    }
    if (h === "dump" && Math.random() < 0.5) {
      this.spawn(V((Math.random() - 0.5) * 10, 0, -6 - Math.random() * 8), V(0, 0.8, 0), 0xc9e0c0, 1.2, 2, 0, 0.08);
    }
    if (h === "neighbors" && Math.random() < dt * 1.5) {
      this.floatText(V(-1.8 + Math.random() * 0.6, 1.9, -1.6), pickOne(["♪", "♫", "♬"]), "#e7ddc6", 24);
    }
    if (h === "crowd" && Math.random() < dt * 0.8) {
      this.floatText(V(-2.2 + Math.random() * 1.2, 2.2, 1.6), "ТО-ЛИК!", "#f2b632", 18);
    }
  }

  private applyDayLight(p: number): void {
    const keys = SKY_THEME[this.theme]?.keys ?? SKY_DAY;
    let i = 0;
    while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const k = ease(THREE.MathUtils.clamp((p - a[0]) / (b[0] - a[0]), 0, 1));
    const top = new THREE.Color(a[1]).lerp(new THREE.Color(b[1]), k);
    const horizon = new THREE.Color(a[2]).lerp(new THREE.Color(b[2]), k);
    paintSky(this.env, top, horizon);
    (this.scene.fog as THREE.Fog).color.copy(horizon);
    this.sunLight.color.copy(new THREE.Color(a[3]).lerp(new THREE.Color(b[3]), k));
    this.sunLight.intensity = lerp(a[4], b[4], k);
    this.hemi.intensity = (this.theme === "night" ? 0.75 : 0.6) + this.sunLight.intensity * 0.3;
    const angle = Math.PI * (0.92 - p * 0.84);
    this.env.sun.visible = this.theme !== "night" || p > 0.85;
    this.env.sun.position.set(Math.cos(angle) * 60, 6 + Math.sin(angle) * 32, -90);
    this.sunLight.position.set(Math.cos(angle) * 8, 4 + Math.sin(angle) * 8, -2);
  }

  private bodyLocal(fisher: Fisher, world: THREE.Vector3): THREE.Vector3 {
    fisher.body.updateWorldMatrix(true, false);
    return fisher.body.worldToLocal(world.clone());
  }

  private animatePeople(s: SimSnapshot, dt: number): void {
    const hero = this.hero;
    const playing = s.phase === "playing";
    // Rage: face reddens, steam, trembling.
    const rage = s.rage / 100;
    hero.skin.color.setHex(C.skin).lerp(new THREE.Color(0xff3a2a), Math.max(0, rage - 0.35) / 0.65 * 0.85);
    if (!this.melt) {
      const shiver = s.cold && s.warm <= 0 && playing ? 0.012 : 0;
      const shake = playing && rage > 0.78 ? (rage - 0.78) * 0.12 : shiver;
      hero.body.position.x = (Math.random() - 0.5) * shake;
    }
    this.puffClock -= dt;
    if (this.puffClock <= 0) {
      this.puffClock = 0.3;
      const headWorld = hero.head.getWorldPosition(this.tmp).clone();
      if (rage > 0.6 && s.hands !== "asleep" && !this.melt) {
        this.puffClock = 0.7 - rage * 0.45;
        for (const side of [-1, 1]) this.spawn(headWorld.clone().add(V(side * 0.17, 0.02, 0)), V(side * 0.4, 0.9, 0), 0xf4f1e6, 0.9, 2.5);
      }
      if (s.smoking > 0) this.spawn(this.cig.getWorldPosition(new THREE.Vector3()), V(0.1, 0.5, 0), 0xb9b9b9, 1.4, 3);
      // Breath in the frost.
      if (s.cold && !this.melt) {
        this.spawn(headWorld.clone().add(V(0.05, -0.05, -0.2)), V(0, 0.15, -0.3), 0xf4f8fb, 0.8, 2, 0, 0.03);
        this.spawn(this.friend.head.getWorldPosition(new THREE.Vector3()).add(V(-0.05, -0.05, -0.2)), V(0, 0.15, -0.3), 0xf4f8fb, 0.8, 2, 0, 0.03);
      }
    }

    // Hero arms. Body-local, facing -z.
    const sh = hero.shoulderR;
    const shL = hero.shoulderL;
    let rHand = V(0.27, 0.8, -0.44);
    let lHand = V(0.02, 0.72, -0.4);
    let headX = 0;
    let headY = 0.1 + Math.sin(this.t * 0.8) * 0.05;
    let headZ = 0;
    const fighting = s.rod === "reeling" || s.rod === "fight";
    if (fighting) rHand = V(0.32, 0.98 + Math.sin(this.t * 18) * 0.03, -0.28);
    if (s.rod === "fight") lHand = V(0.05, 0.9 - s.tension * 0.1, -0.5);
    if (s.method === "spin" && s.rod === "retrieve" && s.holding) rHand = V(0.3, 0.9 + Math.sin(this.t * 16) * 0.03, -0.32);
    if (s.method === "ice") {
      rHand = V(0.18, 0.66 + this.jig * 0.12, -0.5);
      lHand = V(-0.05, 0.62, -0.42);
      headX = 0.35;
    }
    if (s.hands === "beer") {
      this.beerT = Math.min(1, this.beerT < 0 ? 0 : this.beerT + dt / 1.5);
      const k = Math.sin(this.beerT * Math.PI);
      lHand = V(lerp(-0.12, -0.04, k), lerp(0.85, 1.17, k), lerp(-0.35, -0.24, k));
      headX = k * 0.5;
      this.can.visible = true;
      this.can.position.copy(lHand).add(V(0, 0.05, -0.02));
      this.can.rotation.x = -k * 1.9;
    } else {
      this.beerT = -1;
      this.can.visible = false;
    }
    if (s.hands === "phone") {
      rHand = V(0.06, 0.94, -0.38);
      lHand = V(-0.08, 0.92, -0.37);
      headX = -0.45;
      this.phone.visible = true;
      this.phone.position.set(-0.01, 1.0, -0.42);
      this.phone.rotation.set(0.6, 0, 0);
    } else if (s.hands === "call") {
      // Wife on the line: phone to the ear, head down.
      rHand = V(0.2, 1.3, -0.1);
      headX = 0.25;
      headZ = -0.2;
      this.phone.visible = true;
      this.phone.position.set(0.17, 1.33, -0.08);
      this.phone.rotation.set(0, 1.4, 0);
    } else {
      this.phone.visible = false;
    }
    this.stealArm.mesh.visible = s.hands === "steal";
    if (s.hands === "steal") {
      const target = this.bodyLocal(hero, this.friendBucket.getWorldPosition(new THREE.Vector3()).add(V(0, 0.3, 0)));
      const start = V(0.25, 0.85, -0.25);
      rHand = start.clone().lerp(target, 0.35 + s.stealProgress * 0.65);
      headY = -0.5;
      hero.body.rotation.y = -0.25 - s.stealProgress * 0.15;
    } else if (!this.melt) {
      hero.body.rotation.y = lerp(hero.body.rotation.y, 0, 0.15);
    }
    if (s.hands === "asleep") this.sleepTilt = Math.min(1, this.sleepTilt + dt * 1.5);
    else this.sleepTilt = Math.max(0, this.sleepTilt - dt * 3);
    headX += -0.6 * this.sleepTilt;
    headZ += 0.35 * this.sleepTilt;
    if (s.hands === "asleep") { rHand = V(0.2, 0.62, -0.3); lHand = V(-0.15, 0.62, -0.3); }
    hero.head.rotation.set(lerp(hero.head.rotation.x, headX, 0.2), lerp(hero.head.rotation.y, headY, 0.15), lerp(hero.head.rotation.z, headZ, 0.2));
    this.cig.visible = s.smoking > 0;
    if (!this.melt) {
      hero.armR.set(sh, rHand);
      hero.armL.set(shL, lHand);
      hero.handR.position.copy(rHand);
      hero.handL.position.copy(lHand);
    }

    // Tolik.
    const f = this.friend;
    const away = this.friendPose === "away";
    this.friendAway = THREE.MathUtils.clamp(this.friendAway + (away ? dt : -dt) * 1.2, 0, 1);
    const walk = ease(this.friendAway);
    f.body.position.set(lerp(0, 2.4, walk), Math.abs(Math.sin(this.t * 9)) * 0.06 * (walk > 0 && walk < 1 ? 1 : 0), lerp(0, 0.6, walk));
    f.body.visible = this.friendAway < 0.98;
    f.body.rotation.y = lerp(0, -1.4, Math.min(1, walk * 3));
    this.env.bush.rotation.z = away && this.friendAway > 0.9 ? Math.sin(this.t * 22) * 0.06 : 0;
    let fr = s.method === "ice" ? V(0.2, 0.66, -0.5) : V(0.3, 0.84, -0.44);
    let fl = V(0.05, 0.74, -0.42);
    if (this.friendPose === "phone") { fr = V(0.2, 1.32, -0.12); fl = V(-0.05, 0.7, -0.38); }
    if (this.friendPose === "stretch") { fr = V(0.32, 1.85, 0.05); fl = V(-0.32, 1.85, 0.05); }
    if (walk > 0) { fr = V(0.32, 0.6, 0.05); fl = V(-0.32, 0.6, 0.05); }
    if (this.friendRodPull > 0) fr = V(0.34, 0.84 + this.friendRodPull * 0.25, -0.4 + this.friendRodPull * 0.2);
    f.armR.set(f.shoulderR, fr);
    f.armL.set(f.shoulderL, fl);
    f.handR.position.copy(fr);
    f.handL.position.copy(fl);
    this.friendPhone.visible = this.friendPose === "phone";
    this.friendPhone.position.copy(fr).add(V(-0.04, 0.02, 0.02));
    this.friendPhone.rotation.set(0, 1.2, 0);
    let fx = 0.05;
    let fy = this.friendLookTarget;
    if (this.friendPose === "phone") { fx = -0.15; fy = 0.3; }
    if (this.friendPose === "stretch") { fx = 0.4; fy = 0; }
    f.head.rotation.x = lerp(f.head.rotation.x, fx, 0.15);
    f.head.rotation.y = lerp(f.head.rotation.y, fy, 0.18);
    // Brows: angry when watching, suspicious when squinting.
    f.face?.children.forEach((c) => {
      if (c.name === "brow") c.rotation.z = (c.position.x > 0 ? 1 : -1) * (s.gaze === "watching" ? 0.45 : s.gaze === "suspicious" ? -0.1 : -0.25);
      if (c.name === "eye") c.scale.y = s.gaze === "suspicious" ? 0.35 : 1;
    });
    this.friendRodPull = Math.max(0, this.friendRodPull - dt * 0.9);
    const want = s.rod === "reeling" ? 1 : s.rod === "fight" ? 0.5 + s.tension * 0.9 : 0;
    this.myRodPull = want > 0 ? lerp(this.myRodPull, want, 0.2) : Math.max(0, this.myRodPull - dt * 2);

    // Friend's float (or nothing: on the ice he jigs a hole).
    this.friendBobber.position.set(FRIEND_BOBBER.x, Math.sin(this.t * 2 + 1) * 0.02 - this.friendRodPull * 0.12, FRIEND_BOBBER.z);
    this.updateBucketFish(s);
  }

  private updateBucketFish(s: SimSnapshot): void {
    const key = `${s.friendBucket}:${s.myCount}`;
    if (this.bucketFish.length > 0 && this.bucketFish[0].userData.k === key) return;
    this.bucketFish.forEach((g) => g.parent?.remove(g));
    this.bucketFish = [];
    const put = (bucket: THREE.Group, n: number) => {
      for (let i = 0; i < Math.min(5, n); i++) {
        const fish = makeFish(0xc4cfa6, "fish");
        fish.scale.setScalar(0.55);
        fish.rotation.set(0, i * 1.3, Math.PI / 2 - 0.3);
        at(fish, Math.cos(i * 1.3) * 0.07, 0.3 + (i % 2) * 0.03, Math.sin(i * 1.3) * 0.07, bucket);
        fish.userData.k = key;
        this.bucketFish.push(fish);
      }
    };
    put(this.friendBucket, s.friendBucket);
    put(this.myBucket, s.myCount);
    if (this.bucketFish.length === 0) {
      const marker = new THREE.Group();
      marker.userData.k = key;
      this.bucketFish.push(marker);
    }
  }

  private makeLine(): THREE.Line {
    const geo = new THREE.BufferGeometry().setFromPoints(new Array(16).fill(0).map(() => new THREE.Vector3()));
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf4f1e6, transparent: true, opacity: 0.85 }));
  }

  /** Where my line goes into the water this frame, per method. */
  private computeLineEnd(s: SimSnapshot): THREE.Vector3 {
    const wob = (a: number) => Math.sin(this.t * 7) * a;
    switch (s.method) {
      case "float": {
        const bob = Math.sin(this.t * 2.4) * 0.02;
        let dy = bob;
        let dx = 0;
        if (s.rod === "nibble") dy = bob - Math.abs(Math.sin(this.t * 30)) * 0.05;
        if (s.rod === "bite") dy = -0.16 + Math.sin(this.t * 40) * 0.03;
        if (s.rod === "reeling") { dx = wob(0.25); dy = -0.1 + Math.sin(this.t * 11) * 0.05; }
        return V(MY_BOBBER.x + dx, dy, MY_BOBBER.z);
      }
      case "feeder": {
        if (s.rod === "fight") return FEEDER_SPOT.clone().lerp(LURE_NEAR, s.fightProgress * 0.85).add(V(wob(0.4), -0.05, 0));
        return FEEDER_SPOT.clone();
      }
      case "spin": {
        if (s.rod === "fight") return this.hookedAt.clone().lerp(LURE_NEAR, s.fightProgress * 0.9).add(V(wob(0.35), -0.05, 0));
        const p = LURE_NEAR.clone().lerp(LURE_FAR, s.lure);
        p.y = -0.04 + (s.holding ? 0 : -0.06);
        if (s.rod === "bite") p.add(V(Math.sin(this.t * 40) * 0.08, -0.05, 0));
        this.hookedAt.copy(p);
        return p;
      }
      case "ice":
        return MY_HOLE.clone().add(V(0, s.rod === "bite" ? -0.05 : 0.02, 0));
    }
  }

  private updateRods(s: SimSnapshot, dt: number): void {
    // Jig rhythm on the ice: a bump every time interest rises.
    if (s.interest > this.prevInterest + 0.05) this.jig = 1;
    this.prevInterest = s.interest;
    this.jig = Math.max(0, this.jig - dt * 4);

    this.lineEnd.copy(this.computeLineEnd(s));
    const castDone = this.castAnim >= 1;
    this.castAnim = Math.min(1, this.castAnim + dt * 1.6);

    const heroHand = this.hero.handR.getWorldPosition(new THREE.Vector3());
    const heroBase = this.hero.handL.getWorldPosition(new THREE.Vector3());
    const rodOk = s.rod !== "broken" && this.hero.body.visible && !this.melt;
    const inWater = s.rod !== "recast" && s.rod !== "casting";
    this.myRod.visible = rodOk;
    this.myLine.visible = rodOk && (inWater || !castDone) && s.hands !== "asleep";
    this.myBobber.visible = s.method === "float" && rodOk && s.rod !== "recast";
    this.lure.visible = s.method === "spin" && rodOk && (inWater || !castDone);
    if (rodOk) {
      const handsBusy = s.hands === "steal" || s.hands === "phone" || s.hands === "asleep" || s.hands === "call";
      const fight = s.rod === "fight" || s.rod === "reeling";
      let from: THREE.Vector3;
      let tip: THREE.Vector3;
      let pull = this.myRodPull;
      switch (s.method) {
        case "feeder": {
          // Rests on the pod until something takes; the tip shakes on bites.
          if (fight) {
            from = heroHand.clone().add(V(-0.05, -0.15, 0.2));
            tip = V(HERO_POS.x - 0.3, 2.1, HERO_POS.z - 3.4);
          } else {
            from = V(HERO_POS.x + 0.28, 0.25, HERO_POS.z - 0.1);
            tip = V(HERO_POS.x + 0.65, 1.75, HERO_POS.z - 2.7);
            if (s.rod === "nibble") tip.y += Math.sin(this.t * 30) * 0.03;
            if (s.rod === "bite") { tip.y -= 0.18 + Math.abs(Math.sin(this.t * 24)) * 0.12; pull = 0.4; }
          }
          break;
        }
        case "ice": {
          from = handsBusy ? V(MY_HOLE.x + 0.15, 0.08, MY_HOLE.z + 0.45) : heroHand.clone().add(V(0, -0.02, 0.12));
          tip = V(MY_HOLE.x - 0.05, 0.55 + this.jig * 0.12 - (s.rod === "bite" ? 0.16 : 0), MY_HOLE.z + 0.05);
          break;
        }
        default: {
          const butt = s.hands === "free" && !fight ? heroBase.clone().lerp(heroHand, 0.3) : heroHand.clone().add(V(-0.05, -0.15, 0.2));
          from = handsBusy ? V(HERO_POS.x + 0.35, 0.12, HERO_POS.z - 0.6) : butt;
          tip = V(HERO_POS.x - 0.25, 2.1, HERO_POS.z - 3.6);
          if (s.method === "spin" && s.rod === "retrieve" && s.holding) tip.add(V(Math.sin(this.t * 9) * 0.08, Math.sin(this.t * 13) * 0.05, 0));
        }
      }
      if (s.method === "ice") {
        // A short stubby jigging rod: straight shaft, line drops into the hole.
        const geo = new THREE.CylinderGeometry(0.012, 0.02, 1, 5);
        geo.translate(0, 0.5, 0);
        geo.rotateX(Math.PI / 2);
        this.myRod.geometry.dispose();
        const len = from.distanceTo(tip);
        geo.scale(1, 1, len);
        this.myRod.geometry = geo;
        this.myRod.position.copy(from);
        this.myRod.lookAt(tip);
        this.myRod.userData.tip = tip;
      } else {
        this.myRod.position.set(0, 0, 0);
        this.myRod.rotation.set(0, 0, 0);
        this.buildRod(this.myRod, from, tip, this.lineEnd, pull);
      }
      // Casting: the rig flies along an arc from the tip to the water.
      let end = this.lineEnd;
      if (!castDone) {
        const k = this.castAnim;
        const rodTip = this.myRod.userData.tip as THREE.Vector3;
        end = rodTip.clone().lerp(this.lineEnd, k);
        end.y += Math.sin(k * Math.PI) * 2.2;
      }
      this.myBobber.position.copy(end);
      this.myBobber.rotation.z = s.rod === "bite" ? Math.sin(this.t * 30) * 0.3 : 0;
      this.lure.position.copy(end);
      this.lure.rotation.set(0, Math.PI / 2, Math.sin(this.t * 12) * 0.3);
      this.buildLine(this.myLine, this.myRod.userData.tip, end.clone().add(V(0, s.method === "float" ? 0.15 : 0.02, 0)), s.method === "ice" ? 1 : this.myRodPull);
    }

    // Tolik.
    const seated = this.friendPose === "rod" && this.friendAway === 0;
    const fHand = this.friend.handR.getWorldPosition(new THREE.Vector3());
    if (this.env.frozen) {
      const fFrom = seated ? fHand.clone().add(V(0, -0.02, 0.12)) : V(FRIEND_HOLE.x - 0.15, 0.08, FRIEND_HOLE.z + 0.45);
      const fTip = V(FRIEND_HOLE.x + 0.05, 0.55 + Math.abs(Math.sin(this.t * 5)) * 0.05 - this.friendRodPull * 0.1, FRIEND_HOLE.z);
      const geo = new THREE.CylinderGeometry(0.012, 0.02, 1, 5);
      geo.translate(0, 0.5, 0);
      geo.rotateX(Math.PI / 2);
      geo.scale(1, 1, fFrom.distanceTo(fTip));
      this.friendRod.geometry.dispose();
      this.friendRod.geometry = geo;
      this.friendRod.position.copy(fFrom);
      this.friendRod.lookAt(fTip);
      this.buildLine(this.friendLine, fTip, FRIEND_HOLE.clone().add(V(0, 0.02, 0)), 1);
    } else {
      const base = seated ? fHand.clone().add(V(-0.05, -0.12, 0.22)) : V(FRIEND_POS.x + 0.5, 0.55, FRIEND_POS.z - 0.75);
      const ftip = V(FRIEND_POS.x + 0.5, 2.15, FRIEND_POS.z - 3.7);
      this.friendRod.position.set(0, 0, 0);
      this.friendRod.rotation.set(0, 0, 0);
      this.buildRod(this.friendRod, base, ftip, this.friendBobber.position, this.friendRodPull);
      this.buildLine(this.friendLine, this.friendRod.userData.tip, this.friendBobber.position.clone().add(V(0, 0.15, 0)), this.friendRodPull);
    }
  }

  private buildRod(rod: THREE.Mesh, from: THREE.Vector3, tip: THREE.Vector3, bobber: THREE.Vector3, pull: number): void {
    const bent = tip.clone().lerp(bobber, 0.1 * pull).add(V(0, -0.5 * pull, 0));
    const ctrl = from.clone().lerp(bent, 0.55).add(V(0, 0.15 * pull, 0));
    const curve = new THREE.QuadraticBezierCurve3(from, ctrl, bent);
    rod.geometry.dispose();
    rod.geometry = new THREE.TubeGeometry(curve, 10, 0.022, 5, false);
    rod.userData.tip = bent;
  }

  private buildLine(line: THREE.Line, tip: THREE.Vector3, bobber: THREE.Vector3, pull: number): void {
    const mid = tip.clone().lerp(bobber, 0.5);
    mid.y = Math.max(0.05, Math.min(tip.y, bobber.y) + (1 - pull) * 0.1 - 0.4 * (1 - pull));
    if (pull >= 1) mid.copy(tip).lerp(bobber, 0.5);
    const curve = new THREE.QuadraticBezierCurve3(tip, mid, bobber);
    const pos = line.geometry.attributes.position as THREE.BufferAttribute;
    curve.getPoints(15).forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z));
    pos.needsUpdate = true;
  }

  private updateCamera(s: SimSnapshot, dt: number): void {
    const target = s.drunk >= 2 && s.phase === "playing" ? Math.sin(this.t * 0.9) * 0.012 * s.drunk : 0;
    this.sway = lerp(this.sway, target, 0.06);
    this.camera.position.copy(this.camBase);
    if (s.drunk >= 2) this.camera.position.x += Math.sin(this.t * 0.6) * 0.06 * s.drunk;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      this.camera.position.add(V((Math.random() - 0.5) * this.shakePower, (Math.random() - 0.5) * this.shakePower, 0));
    }
    this.camera.lookAt(this.camLook);
    this.camera.rotateZ(this.sway);
  }

  private shake(time: number, power: number): void {
    this.shakeTime = time;
    this.shakePower = power;
  }

  // -------------------------------------------------------------- particles
  private spawn(pos: THREE.Vector3, vel: THREE.Vector3, color: number, life: number, grow: number, gravity = 0, size = 0.05): void {
    if (this.particles.length > 110) return;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    m.position.copy(pos);
    this.scene.add(m);
    this.particles.push({ mesh: m, vel: vel.clone().add(V((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.15)), life, max: life, grow, gravity });
  }

  private splash(pos: THREE.Vector3, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(pos.clone().add(V(0, 0.05, 0)), V(Math.cos(a) * 0.9, 1.6 + Math.random() * 1.4, Math.sin(a) * 0.9), this.env.frozen ? 0xf4f8fb : 0xe2f6f2, 0.7, 0.5, 6, 0.045);
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const k = 1 - p.life / p.max;
      p.mesh.scale.setScalar(1 + k * p.grow);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  // -------------------------------------------------------------- DOM effects
  private fxEl(cls: string, text: string): HTMLElement {
    const el = document.createElement("div");
    el.className = cls;
    el.textContent = text;
    el.hidden = true;
    this.fx.appendChild(el);
    return el;
  }

  /** Call of Duty–style overhead nameplate: rank pip, name, chevron. */
  private nameTag(name: string, side: "you" | "tolik"): HTMLElement {
    const el = document.createElement("div");
    el.className = `fx-tag fx-tag-${side}`;
    el.innerHTML = `<div class="fx-tag-inner"><span class="fx-tag-name"><i></i>${name}</span><b></b></div>`;
    el.hidden = true;
    this.fx.appendChild(el);
    return el;
  }

  private project(world: THREE.Vector3): { x: number; y: number } {
    const p = world.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: (p.x * 0.5 + 0.5) * rect.width, y: (-p.y * 0.5 + 0.5) * rect.height };
  }

  private place(el: HTMLElement, world: THREE.Vector3): void {
    const { x, y } = this.project(world);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  private updateFx(s: SimSnapshot): void {
    const showAlert = s.rod === "bite" && s.hands !== "phone" && this.mode === "playing";
    this.alertEl.hidden = !showAlert;
    if (showAlert) {
      const anchor = s.method === "feeder" ? (this.myRod.userData.tip as THREE.Vector3).clone().add(V(0, 0.45, 0)) : this.lineEnd.clone().add(V(0, 0.55, 0));
      this.place(this.alertEl, anchor);
    }
    const showQ = s.gaze === "suspicious" && this.friendAway === 0 && this.mode === "playing";
    this.questionEl.hidden = !showQ;
    const inGame = this.mode !== "menu";
    const youVisible = inGame && this.hero.body.visible && this.t < this.youTagUntil;
    this.youTag.hidden = !inGame || !this.hero.body.visible;
    this.youTag.classList.toggle("gone", !youVisible);
    if (!this.youTag.hidden) this.place(this.youTag, this.hero.head.getWorldPosition(new THREE.Vector3()).add(V(0, 0.42, 0)));
    this.tolikTag.hidden = !inGame || this.friendAway > 0.3;
    if (!this.tolikTag.hidden) this.place(this.tolikTag, this.friend.head.getWorldPosition(new THREE.Vector3()).add(V(0, 0.46, 0)));
    if (showQ) this.place(this.questionEl, this.friend.head.getWorldPosition(new THREE.Vector3()).add(V(0.38, 0.25, 0)));
    if (this.bubble) {
      if (performance.now() > this.bubble.until) {
        this.bubble.el.classList.add("out");
        const el = this.bubble.el;
        setTimeout(() => el.remove(), 200);
        this.bubble = null;
      } else {
        const anchor = this.friendAway > 0.5 ? this.env.bush.getWorldPosition(new THREE.Vector3()).add(V(0, 1.4, 0)) : this.friend.head.getWorldPosition(new THREE.Vector3()).add(V(-0.2, 0.8, 0));
        this.place(this.bubble.el, anchor);
      }
    }
  }

  private floatText(world: THREE.Vector3, text: string, color: string, size = 22): void {
    const el = document.createElement("div");
    el.className = "fx-text";
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = `${size}px`;
    const { x, y } = this.project(world);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.fx.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }

  private say(text: string, ms: number, priority = 1): void {
    voice.say("tolik", text, priority);
    this.bubble?.el.remove();
    const el = document.createElement("div");
    el.className = "fx-bubble";
    el.innerHTML = `<span>${text}</span>`;
    this.fx.appendChild(el);
    this.bubble = { el, until: performance.now() + ms };
    this.updateFx(this.sim.snapshot());
  }

  private toast(text: string): void {
    this.uiEvents.emit("toast", text);
  }

  private headTop(): THREE.Vector3 {
    return this.hero.head.getWorldPosition(new THREE.Vector3()).add(V(0.15, 0.45, 0));
  }

  /** People walking up to the bank (gopniki, Ashot) and leaving again. */
  private visit(colors: number[], to: THREE.Vector3, stay: number): void {
    const group = new THREE.Group();
    colors.forEach((c, i) => at(makePerson(c, Math.random), i * 0.55, 0, (i % 2) * 0.3, group));
    const from = V(-5.5, 0, to.z);
    group.position.copy(from);
    this.scene.add(group);
    this.props.push(group);
    const bounce = () => Math.abs(Math.sin(this.t * 9)) * 0.06;
    this.animate(1.3, (k) => { group.position.lerpVectors(from, to, ease(k)); group.position.y = bounce(); group.rotation.y = -Math.PI / 2; });
    this.animate(0.3, () => { group.rotation.y = 0.3; group.position.y = 0; }, undefined, 1.3);
    this.animate(1.5, (k) => { group.position.lerpVectors(to, from, ease(k)); group.position.y = bounce(); group.rotation.y = Math.PI / 2; }, () => {
      this.scene.remove(group);
      this.props = this.props.filter((p) => p !== group);
    }, 1.3 + stay);
  }

  // -------------------------------------------------------------- events
  private handle(e: SimEvent): void {
    switch (e.type) {
      case "bite":
        this.uiEvents.emit("bell");
        play("bell");
        voice.line("announcer", "bite", 4);
        if (this.sim.method !== "feeder") this.splash(this.lineEnd, 6);
        break;
      case "early":
        this.toast(this.sim.method === "float" ? "РАНО ДЁРНУЛ!" : "МИМО!");
        if (Math.random() < 0.4) this.say(TOLIK.early, 1500);
        else voice.line("hero", "early", 2);
        break;
      case "missed":
        this.toast("ПРОЗЕВАЛ ПОКЛЁВКУ");
        voice.line("hero", "missed", 2);
        this.floatText(this.headTop(), "+8", "#d63732");
        break;
      case "hooked":
        this.splash(this.lineEnd, 10);
        play("plop");
        voice.line("hero", "hooked", 2);
        if (this.sim.method !== "float") this.toast("ДЕРЖИ — НЕ ПЕРЕТЯНИ!");
        break;
      case "cast":
        play("cast");
        this.castAnim = 0;
        this.later(0.62, () => this.splash(this.lineEnd, 5));
        break;
      case "surge":
        this.splash(this.lineEnd, 4);
        play("ratchet");
        break;
      case "catch":
        this.landFish(e.fish, this.lineEnd.clone(), this.myBucket, "#b8d84a");
        this.toast(`${e.fish.species} · ${e.fish.weight.toFixed(2)} КГ`);
        play("catch");
        voice.line("hero", "catch", 3);
        if (e.fish.size === 1 && Math.random() < 0.6) this.later(1.4, () => this.say(TOLIK.small, 1800));
        break;
      case "junk":
        this.landJunk(e.fish);
        this.toast(`${e.fish.species}. ПРОСТО ОХРЕНЕННО`);
        voice.line("hero", "junk", 3);
        this.floatText(this.headTop(), `+${e.fish.species === "ПОКРЫШКА" ? 12 : 6}`, "#d63732");
        if (Math.random() < 0.5) this.later(1.5, () => this.say(TOLIK.junk, 2000));
        break;
      case "snap":
        this.toast("ЛЕСКА — ВСЁ!");
        play("snap");
        voice.line("hero", "snap", 3);
        this.splash(this.lineEnd, 8);
        this.floatText(this.headTop(), "+10", "#d63732");
        break;
      case "escaped":
        this.toast("СОШЛА! ДЕРЖАТЬ НАДО БЫЛО");
        play("splash");
        voice.line("hero", "escaped", 3);
        this.splash(this.lineEnd, 8);
        this.floatText(this.headTop(), "+9", "#d63732");
        break;
      case "snag":
        this.toast("ЗАЦЕП! КОРЯГА ЗАБРАЛА ВОБЛЕР");
        play("snap");
        voice.line("hero", "snag", 3);
        this.floatText(this.headTop(), "+8", "#d63732");
        break;
      case "spooked":
        this.toast("ПЕРЕИГРАЛ — РЫБА УШЛА");
        this.floatText(this.headTop(), "+3", "#d63732");
        break;
      case "friendCatch": {
        this.friendRodPull = 1.4;
        play("ratchet");
        const king = e.fish.species === "ЦАРЬ-СОМ";
        this.later(0.45, () => {
          const from = this.env.frozen ? FRIEND_HOLE.clone() : this.friendBobber.position.clone();
          this.landFish(e.fish, from, this.friendBucket, "#e7ddc6");
          this.say(king ? TOLIK.king : e.fish.species === "СОМ" ? TOLIK.catfish : pickOne([...BASE_TAUNTS, ...this.level.taunts, ...this.level.taunts]), king ? 2600 : 1900, king ? 5 : 1);
          this.shake(king ? 0.6 : 0.15, king ? 0.12 : 0.03 * e.fish.size);
          play("friendCatch");
        });
        const big = e.fish.species === "СОМ" ? 14 : king ? 30 : 0;
        this.floatText(this.headTop(), `+${Math.round((8 + e.fish.size * 4.5 + big) * this.level.rageMult)}`, "#d63732");
        break;
      }
      case "friendDistracted":
        this.friendPose = e.reason === "bushes" ? "away" : e.reason;
        if (e.reason === "bushes") { play("steps"); this.later(1.0, () => play("rustle")); }
        this.say(pickOne(DISTRACT_LINES[e.reason]), 1800);
        break;
      case "friendBack":
        if (this.friendPose === "away") play("steps");
        this.friendPose = "rod";
        this.friendLookTarget = 0;
        break;
      case "friendSuspicious":
        this.friendLookTarget = 0.7;
        break;
      case "friendWatching":
        this.friendLookTarget = 1.3;
        break;
      case "stolen":
        this.landFish(e.fish, this.friendBucket.getWorldPosition(new THREE.Vector3()).add(V(0, 0.3, 0)), this.myBucket, "#cbb9e6");
        this.toast(`СТЫРИЛ: ${e.fish.species} ${e.fish.weight.toFixed(2)} КГ`);
        play("plop");
        voice.line("hero", "stolen", 2);
        break;
      case "caught":
        this.friendLookTarget = 1.3;
        this.say(TOLIK.caught, 2000, 4);
        this.toast("СПАЛИЛСЯ");
        play("caught");
        this.shake(0.25, 0.06);
        this.floatText(this.headTop(), "+22", "#d63732");
        break;
      case "beerOpen":
        this.floatText(this.headTop(), "ПШШШ", "#e7ddc6", 16);
        play("beer");
        voice.line("hero", "beer", 2);
        break;
      case "beerDone":
        if (this.sim.drunk >= 2) {
          this.floatText(this.headTop(), "ИК!", "#f2b632", 18);
          play("burp");
          voice.line("hero", "hic", 1);
        }
        if (this.sim.drunk === 4) this.toast("ЕЩЁ ОДНА — И СПАТЬ");
        if (this.sim.level.cold && this.sim.drunk >= 3) this.toast("⚠️ ЛЁД ТЕБЯ УЖЕ НЕ ДЕРЖИТ");
        break;
      case "smoke":
        this.floatText(this.headTop(), "ЧИРК", "#f2b632", 15);
        play("light");
        voice.line("hero", "smoke", 1);
        break;
      case "video":
        play("swipe");
        this.uiEvents.emit("video", e.video);
        break;
      case "phoneOpen":
      case "phoneClose":
        this.uiEvents.emit(e.type);
        break;
      case "sleep":
        this.uiEvents.emit("sleep", true);
        this.toast("УСНУЛ…");
        voice.line("hero", "sleep", 2);
        for (let i = 0; i < 9; i++) this.later(i * 0.75, () => this.floatText(this.headTop(), "Z", "#e7ddc6", 20));
        break;
      case "wake":
        this.uiEvents.emit("sleep", false);
        voice.line("hero", "wake", 3);
        this.toast(e.missedFish ? `ПОКА СПАЛ, ТОЛИК ПОЙМАЛ ${e.missedFish}` : "ПРОСНУЛСЯ. ГОЛОВА ГУДИТ");
        if (e.missedFish) this.say(TOLIK.wake, 2200);
        break;
      case "hazard":
        this.onHazard(e.hazard);
        break;
      case "hazardEnd":
        if (e.hazard === "nadzor" && !this.sim.snapshot().fines) this.toast("РЫБНАДЗОР УПЛЫЛ. ПРОНЕСЛО");
        if (e.hazard === "mosquito") this.toast("КОМАРЫ НАЕЛИСЬ");
        break;
      case "fine":
        this.toast(`ШТРАФ ${e.amount} ₽ · ${e.reason}`);
        this.floatText(this.headTop().add(V(0, 0.3, 0)), `−${e.amount} ₽`, "#d63732", 26);
        play("caught");
        voice.line("hero", "fine", 4);
        this.later(1.6, () => this.say(TOLIK.fine, 1800));
        this.shake(0.2, 0.05);
        break;
      case "meltdown":
        this.meltdown();
        break;
      case "fell":
        this.fallThroughIce();
        break;
      case "won":
      case "lost":
        this.finishLevel(e.result);
        break;
      case "denied":
        this.toast(e.reason);
        break;
      default:
        break;
    }
  }

  private onHazard(h: Hazard): void {
    const text = HAZARD_TEXT[h];
    this.toast(text.toast);
    if (text.tolik) this.later(1.2, () => this.say(text.tolik!, 2400, 2));
    switch (h) {
      case "wife":
        play("bell");
        this.later(0.8, () => voice.line("hero", "call", 3));
        break;
      case "gopniki":
        this.visit([0x2c3036, 0xe7ddc6, 0x2c3036], V(-2.15, 0, -1.3), 2.2);
        play("steps");
        this.floatText(this.headTop(), "+9", "#d63732");
        break;
      case "ashot":
        this.visit([0x7a2a2a], V(-1.9, 0, -0.8), 3);
        play("steps");
        break;
      case "tolikCheat":
        this.visit([0x7a2a2a], V(0.1, 0, -1.0), 1.5);
        break;
      case "leech":
        this.floatText(this.headTop(), "🩸 +7", "#d63732", 22);
        play("thunk");
        break;
      case "iceCrack":
        play("crack");
        this.shake(0.6, 0.05);
        this.floatText(HERO_POS.clone().add(V(0, 0.3, -0.6)), "ХРУСТЬ", "#e7ddc6", 26);
        for (let i = 0; i < 14; i++) this.spawn(HERO_POS.clone().add(V((Math.random() - 0.5) * 1.6, 0.05, -0.5 - Math.random())), V((Math.random() - 0.5), 0.6, 0), 0xffffff, 0.8, 0.4, 2, 0.03);
        break;
      case "nadzor":
        play("caught");
        break;
      case "dump":
        play("splash");
        this.shake(0.5, 0.03);
        break;
      case "jetski":
        play("ratchet");
        break;
      case "drone":
      case "crowd":
      case "neighbors":
      case "mosquito":
        break;
    }
  }

  private finishLevel(result: LevelResult): void {
    this.mode = "over";
    this.sim.hold(false);
    this.music.setCalm(true);
    if (result.pass) {
      voice.say("announcer", result.level === LEVELS.length ? ANNOUNCER.champion : ANNOUNCER.levelWon, 6);
    } else if (result.reason === "target") {
      voice.say("announcer", ANNOUNCER.levelLost, 6);
    }
    setTimeout(() => this.uiEvents.emit("result", result), result.pass || result.reason === "target" ? 600 : 0);
  }

  /** Continuous sounds that follow state rather than one-off events. */
  private audioTick(s: SimSnapshot, dt: number): void {
    this.music.setState(s.rage / 100, this.mode === "menu" ? 0.3 : s.dayProgress);
    if (this.mode !== "playing") return;
    const cranking = s.rod === "reeling" || (s.rod === "fight" && s.holding) || (s.rod === "retrieve" && s.holding);
    if (cranking) {
      this.ratchetClock -= dt;
      if (this.ratchetClock <= 0) { this.ratchetClock = s.rod === "fight" ? 0.18 + (1 - s.tension) * 0.2 : 0.3; play("ratchet"); }
    }
    if (!this.rageWarned && s.rage >= 80 && s.phase === "playing") {
      this.rageWarned = true;
      voice.line("announcer", "rageWarning", 5);
      play("heartbeat");
    } else if (this.rageWarned && s.rage < 65) {
      this.rageWarned = false;
    }
  }

  private landFish(fish: Fish, from: THREE.Vector3, bucket: THREE.Group, color: string): void {
    const info = FISH[fish.species] ?? FISH["ОКУНЬ"];
    const model = makeCatch(fish.species, info.look, info.color);
    const king = fish.species === "ЦАРЬ-СОМ";
    model.scale.setScalar(0.8 + fish.size * 0.35 + (info.look === "cat" ? 0.6 : 0) + (king ? 1.2 : 0));
    if (fish.species === "ТРЁХГЛАЗЫЙ КАРАСЬ" || fish.species === "ОКУНЬ-МУТАНТ") {
      // Glows faintly: it lived next to the power plant.
      model.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
        if (m && "emissive" in m) { m.emissive = new THREE.Color(0x4a8a10); }
      });
    }
    this.scene.add(model);
    this.splash(from, king ? 30 : 10);
    const to = bucket.getWorldPosition(new THREE.Vector3()).add(V(0, 0.35, 0));
    const peak = V((from.x + to.x) / 2, 2.6, (from.z + to.z) / 2);
    this.floatText(from.clone().add(V(0, 0.6, 0)), `${fish.weight.toFixed(2)} КГ`, color, king ? 28 : 16);
    this.animate(0.85, (k) => {
      const a = from.clone().lerp(peak, k);
      const b = peak.clone().lerp(to, k);
      model.position.copy(a.lerp(b, k));
      model.rotation.set(Math.sin(this.t * 25) * 0.6, k * 3, Math.sin(this.t * 31) * 0.5);
    }, () => {
      this.scene.remove(model);
      play("thunk");
      this.animate(0.16, (k) => bucket.scale.set(1 + Math.sin(k * Math.PI) * 0.12, 1 - Math.sin(k * Math.PI) * 0.12, 1 + Math.sin(k * Math.PI) * 0.12));
    });
  }

  /** Junk comes up, hangs in front of your face, then gets flung onto the bank. */
  private landJunk(fish: Fish): void {
    const info = FISH[fish.species];
    const model = makeCatch(fish.species, "junk", info?.color ?? 0x2a2a2a);
    this.scene.add(model);
    this.props.push(model);
    const from = this.lineEnd.clone();
    this.splash(from, 8);
    const hang = HERO_POS.clone().add(V(0.1, 1.5, -1.0));
    const land = V(-2.3 + Math.random() * 0.5, 0.1, 1.1 + Math.random() * 0.4);
    this.floatText(hang.clone().add(V(0, 0.5, 0)), fish.species, "#e7ddc6", 18);
    this.animate(0.7, (k) => {
      model.position.copy(from.clone().lerp(hang, ease(k)));
      model.position.y += Math.sin(k * Math.PI) * 1.2;
      model.rotation.y = k * 4;
    });
    this.animate(0.6, (k) => {
      model.position.copy(hang.clone().lerp(land, k));
      model.position.y += Math.sin(k * Math.PI) * 0.8;
      model.rotation.z = k * 6;
    }, () => play("thunk"), 1.4);
  }

  private meltdown(): void {
    this.uiEvents.emit("meltdown");
    this.bubble?.el.remove();
    this.bubble = null;
    this.friendLookTarget = 1.3;
    this.friendPose = "rod";
    const hand = this.hero.handR.getWorldPosition(new THREE.Vector3());
    // The rod snaps over the knee, both halves spin away.
    for (let i = 0; i < 2; i++) {
      const half = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.3, 5), new THREE.MeshLambertMaterial({ color: i ? 0x2c3036 : 0x5b3a1f, flatShading: true }));
      half.position.copy(hand);
      this.scene.add(half);
      this.brokenRod.push(half);
      const end = V(hand.x + (i ? 1.6 : -0.9), -0.1, hand.z - 3 - i);
      this.animate(1.1, (k) => {
        half.position.set(lerp(hand.x, end.x, k), hand.y + Math.sin(k * Math.PI) * 2.2 + (end.y - hand.y) * k, lerp(hand.z, end.z, k));
        half.rotation.set(k * (i ? 9 : -7), 0, k * 5);
      }, () => { this.splash(end, 6); half.visible = this.env.frozen; }, 0.45);
    }
    this.floatText(hand.clone().add(V(0, 0.5, 0)), "ХРЯСЬ!", "#f2b632", 34);
    play("crack");
    voice.line("hero", "meltdown", 9);
    this.music.stop();
    this.shake(0.35, 0.12);
    const body = this.hero.body;
    if (this.env.frozen) {
      // No river to jump into: he dives head-first into his own ice hole.
      this.diveInto(MY_HOLE, 0.3, () => this.say(TOLIK.splash, 2400));
      return;
    }
    // A running dive into the river; the stool stays behind.
    const target = V(-0.7, -0.4, -4.4).sub(HERO_POS);
    this.melt = { t: 0, from: body.position.clone() };
    this.animate(0.45, (k) => { body.position.y = Math.sin(k * Math.PI) * 0.15; body.rotation.x = -k * 0.3; }, undefined, 0.3);
    this.animate(1.0, (k) => {
      const kk = ease(k);
      body.position.set(lerp(0, target.x, kk), lerp(0, target.y, k) + Math.sin(k * Math.PI) * 1.6, lerp(0, target.z, kk));
      body.rotation.x = -0.3 - k * 2.1;
      this.armsUp();
    }, () => {
      body.visible = false;
      const splashAt = V(-0.7, 0, -4.4);
      this.splash(splashAt, 30);
      this.floatText(splashAt.clone().add(V(0, 0.8, 0)), "БУЛЬ!", "#54b7c6", 40);
      play("splash");
      this.shake(0.3, 0.08);
      this.say(TOLIK.splash, 2400);
      for (let i = 0; i < 12; i++) this.later(0.2 + i * 0.12, () => this.spawn(splashAt.clone().add(V((Math.random() - 0.5) * 0.4, 0, 0)), V(0, 0.6, 0), 0xe2f6f2, 0.8, 1.5, 0, 0.04));
    }, 1.1);
  }

  private armsUp(): void {
    this.hero.armR.set(this.hero.shoulderR, V(0.25, 1.7, -0.2));
    this.hero.armL.set(this.hero.shoulderL, V(-0.25, 1.7, -0.2));
    this.hero.handR.position.set(0.25, 1.7, -0.2);
    this.hero.handL.position.set(-0.25, 1.7, -0.2);
  }

  /** Head-first into a hole in the ice (meltdown on the ice, or the ice gave way). */
  private diveInto(hole: THREE.Vector3, delay: number, after: () => void): void {
    const body = this.hero.body;
    this.melt = { t: 0, from: body.position.clone() };
    const target = hole.clone().sub(HERO_POS);
    this.animate(0.9, (k) => {
      const kk = ease(k);
      body.position.set(lerp(0, target.x, kk), Math.sin(k * Math.PI) * 0.9 - k * k * 1.6, lerp(0, target.z, kk));
      body.rotation.x = -k * 2.6;
      body.scale.setScalar(1 - k * 0.35);
      this.armsUp();
    }, () => {
      body.visible = false;
      body.scale.setScalar(1);
      this.splash(hole, 26);
      this.floatText(hole.clone().add(V(0, 0.8, 0)), "БУЛЬ!", "#54b7c6", 40);
      play("splash");
      this.shake(0.3, 0.08);
      after();
    }, delay);
  }

  private fallThroughIce(): void {
    this.uiEvents.emit("meltdown");
    this.bubble?.el.remove();
    this.bubble = null;
    this.friendLookTarget = 1.3;
    play("crack");
    this.shake(0.5, 0.1);
    this.floatText(this.headTop(), "ТРЕСК!", "#e7ddc6", 34);
    voice.line("hero", "fell", 9);
    this.music.stop();
    // The ice under the stool simply opens.
    const hole = makeIceHole();
    hole.scale.setScalar(3.2);
    at(hole, HERO_POS.x, 0.005, HERO_POS.z - 0.1, this.scene);
    this.props.push(hole);
    const body = this.hero.body;
    this.melt = { t: 0, from: body.position.clone() };
    this.animate(0.7, (k) => {
      body.position.y = -k * k * 1.8;
      body.rotation.z = Math.sin(k * 12) * 0.2;
      this.armsUp();
    }, () => {
      body.visible = false;
      this.splash(HERO_POS.clone(), 26);
      play("splash");
      this.floatText(HERO_POS.clone().add(V(0, 0.8, 0)), "БУЛЬ!", "#54b7c6", 40);
      voice.say("announcer", ANNOUNCER.fell, 6);
      this.later(1.2, () => this.say(TOLIK.fell, 2400));
    }, 0.25);
  }
}
