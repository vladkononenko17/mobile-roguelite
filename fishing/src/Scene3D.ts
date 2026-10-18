import * as THREE from "three";
import { Music } from "./music";
import { play } from "./sfx";
import { ANNOUNCER, DISTRACT_LINES, TAUNTS, TOLIK } from "./lines";
import { voice } from "./voice";
import { DAYS, FishingSim, type Fish, type PerkId, type SimEvent, type SimSnapshot } from "./sim";
import {
  C, FISH_LOOK, Limb, at, makeBobber, makeBucket, makeCan, makeCig, makeCooler, makeEnvironment, makeFish,
  makeFriend, makeHero, makePhone, mesh, paintSky, type Environment, type Fisher,
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

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (k: number) => k * k * (3 - 2 * k);

// Positions on the bank (river runs along -z).
const HERO_POS = V(-0.95, 0, 0.2);
const FRIEND_POS = V(1.05, 0, 0.1);
const MY_BOBBER = V(-1.5, 0, -6.6);
const FRIEND_BOBBER = V(1.9, 0, -8.2);

const SKY_KEYS: Array<[number, number, number, number, number]> = [
  // progress, sky top, horizon, sun light colour, sun intensity
  [0, 0x6f8fb8, 0xf4b08f, 0xffc49a, 1.4],
  [0.25, 0x5aa8d6, 0xcfe6e0, 0xfff4e0, 2.1],
  [0.7, 0x5aa0d0, 0xd8e4cf, 0xfff0d8, 2.0],
  [0.88, 0x5d6fa8, 0xff9a5a, 0xffa060, 1.6],
  [1, 0x2a2a58, 0xa45f7c, 0x9a88ff, 0.7],
];

export class Scene3D {
  readonly uiEvents = new Emitter();
  sim = new FishingSim();
  private mode: "menu" | "playing" | "paused" | "shop" | "over" = "menu";
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 0.46, 0.1, 400);
  private camBase = V(0, 3.0, 5.0);
  private camLook = V(0.05, 0.2, -4.6);
  private sunLight = new THREE.DirectionalLight(0xffffff, 2);
  private hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6a3a, 1.1);
  private env!: Environment;
  private hero!: Fisher;
  private friend!: Fisher;
  private myBobber = makeBobber();
  private friendBobber = makeBobber();
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
  private melt: { t: number; from: THREE.Vector3 } | null = null;
  private brokenRod: THREE.Mesh[] = [];
  private tmp = new THREE.Vector3();
  readonly music = new Music();
  private prevRod = "waiting";
  private ratchetClock = 0;
  private rageWarned = false;

  mount(container: HTMLElement, fx: HTMLElement): void {
    this.fx = fx;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.env = makeEnvironment();
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
    this.scene.add(this.myBobber, this.friendBobber, this.myRod, this.friendRod, this.myLine, this.friendLine);
    this.myBobber.position.copy(MY_BOBBER);
    this.friendBobber.position.copy(FRIEND_BOBBER);
    // Rod rest stick for when Tolik's hands are busy.
    const stick = mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 4), C.wood, 0.012);
    at(stick, FRIEND_POS.x + 0.55, 0.3, FRIEND_POS.z - 0.75, this.scene).rotation.z = -0.15;

    this.hero.body.add(this.can, this.phone);
    this.hero.head.add(this.cig);
    at(this.cig, 0.04, -0.09, -0.17).rotation.y = 0.5;
    this.friend.body.add(this.friendPhone);
    this.can.visible = this.phone.visible = this.cig.visible = this.friendPhone.visible = false;

    this.alertEl = this.fxEl("fx-alert", "!");
    this.questionEl = this.fxEl("fx-q", "?");
    this.youTag = this.nameTag("ВЫ", "you");
    this.tolikTag = this.nameTag("ТОЛИК", "tolik");

    this.resize();
    window.addEventListener("resize", () => this.resize());
    new ResizeObserver(() => this.resize()).observe(container);
    this.applyDayLight(0);
    this.renderer.setAnimationLoop(() => this.frame());
    this.uiEvents.emit("ready");
  }

  // -------------------------------------------------------------- public API
  startRun(): void {
    this.sim = new FishingSim(Date.now() & 0xffffffff);
    this.resetVisuals();
    this.mode = "playing";
    // The "ВЫ" marker helps on the first look at the scene, then gets out of the way.
    this.youTagUntil = this.t + 10;
    this.youTag.classList.remove("gone");
    this.toast(`${DAYS[0].name} · ДЕНЬ 1 ИЗ ${DAYS.length}`);
    this.music.start();
    this.music.setCalm(false);
    voice.say("announcer", ANNOUNCER.days[0], 3);
    this.animate(0.01, () => undefined, () => this.say(TOLIK.hello, 2600), 1.6);
    this.emitHud();
  }

  choosePerk(id: PerkId): void {
    if (this.mode !== "shop") return;
    this.sim.nextDay(id);
    this.resetVisuals();
    this.mode = "playing";
    this.toast(`${DAYS[this.sim.day].name} · ДЕНЬ ${this.sim.day + 1} ИЗ ${DAYS.length}`);
    this.music.setCalm(false);
    voice.say("announcer", ANNOUNCER.days[this.sim.day], 3);
    this.say(this.sim.day === DAYS.length - 1 ? TOLIK.day3 : TOLIK.day2, 2600);
    this.emitHud();
  }

  tapRod(): void { if (this.mode === "playing") this.sim.tap(); }
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

  abandon(): void {
    this.mode = "over";
    this.uiEvents.emit("result", this.result(false, true));
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
    this.animatePeople(snap, dt);
    this.updateRods(snap);
    this.updateParticles(dt);
    this.updateCamera(snap, dt);
    this.updateFx(snap);
    if (this.mode === "playing") {
      this.hudClock -= dt;
      if (this.hudClock <= 0) {
        this.hudClock = 0.08;
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
    this.clock.getDelta();
  }

  // -------------------------------------------------------------- animation
  private animate(duration: number, step: (k: number) => void, done?: () => void, delay = 0): void {
    this.anims.push({ t: 0, delay, duration, step, done });
  }

  private runAnims(dt: number): void {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      if (a.delay > 0) { a.delay -= dt; continue; }
      a.t += dt;
      const k = Math.min(1, a.t / a.duration);
      a.step(k);
      if (k >= 1) {
        this.anims.splice(i, 1);
        a.done?.();
      }
    }
  }

  private animateWorld(s: SimSnapshot, _dt: number): void {
    const pos = this.env.water.geometry.attributes.position as THREE.BufferAttribute;
    const base = this.env.waterBase;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const z = base[i * 3 + 2];
      pos.setY(i, -0.08 + Math.sin(x * 0.7 + this.t * 1.3) * 0.05 + Math.cos(z * 0.9 + this.t * 1.1 + x * 0.3) * 0.05);
    }
    pos.needsUpdate = true;
    this.env.water.geometry.computeVertexNormals();
    this.env.clouds.forEach((c, i) => {
      c.position.x += 0.6 * (1 + i * 0.3) * _dt;
      if (c.position.x > 60) c.position.x = -60;
    });
    this.applyDayLight(this.mode === "menu" ? 0.3 : s.dayProgress);
  }

  private applyDayLight(p: number): void {
    let i = 0;
    while (i < SKY_KEYS.length - 2 && p > SKY_KEYS[i + 1][0]) i++;
    const a = SKY_KEYS[i];
    const b = SKY_KEYS[i + 1];
    const k = ease(THREE.MathUtils.clamp((p - a[0]) / (b[0] - a[0]), 0, 1));
    const top = new THREE.Color(a[1]).lerp(new THREE.Color(b[1]), k);
    const horizon = new THREE.Color(a[2]).lerp(new THREE.Color(b[2]), k);
    paintSky(this.env, top, horizon);
    (this.scene.fog as THREE.Fog).color.copy(horizon);
    this.sunLight.color.copy(new THREE.Color(a[3]).lerp(new THREE.Color(b[3]), k));
    this.sunLight.intensity = lerp(a[4], b[4], k);
    this.hemi.intensity = 0.6 + this.sunLight.intensity * 0.3;
    const angle = Math.PI * (0.92 - p * 0.84);
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
      const shake = playing && rage > 0.78 ? (rage - 0.78) * 0.12 : 0;
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
    }

    // Hero arms. Body-local, facing -z.
    const sh = hero.shoulderR;
    const shL = hero.shoulderL;
    let rHand = V(0.27, 0.8, -0.44);
    let lHand = V(0.02, 0.72, -0.4);
    let headX = 0;
    let headY = 0.1 + Math.sin(this.t * 0.8) * 0.05;
    let headZ = 0;
    if (s.rod === "reeling") rHand = V(0.32, 0.98 + Math.sin(this.t * 18) * 0.03, -0.28);
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
    let fr = V(0.3, 0.84, -0.44);
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
    this.myRodPull = s.rod === "reeling" ? 1 : Math.max(0, this.myRodPull - dt * 2);

    // Bobbers.
    const bob = Math.sin(this.t * 2.4) * 0.02;
    let dy = bob;
    let dx = 0;
    if (s.rod === "nibble") dy = bob - Math.abs(Math.sin(this.t * 30)) * 0.05;
    if (s.rod === "bite") dy = -0.16 + Math.sin(this.t * 40) * 0.03;
    if (s.rod === "reeling") { dx = Math.sin(this.t * 7) * 0.25; dy = -0.1 + Math.sin(this.t * 11) * 0.05; }
    this.myBobber.visible = s.rod !== "broken" && s.rod !== "recast";
    this.myBobber.position.set(MY_BOBBER.x + dx, dy, MY_BOBBER.z);
    this.myBobber.rotation.z = s.rod === "bite" ? Math.sin(this.t * 30) * 0.3 : 0;
    this.friendBobber.position.set(FRIEND_BOBBER.x, Math.sin(this.t * 2 + 1) * 0.02 - this.friendRodPull * 0.12, FRIEND_BOBBER.z);

    this.updateBucketFish(s);
  }

  private updateBucketFish(s: SimSnapshot): void {
    const want = Math.min(5, s.friendBucket) + Math.min(5, s.myCount);
    if (this.bucketFish.length === want && this.bucketFish.length > 0 && (this.bucketFish[0].userData.k === `${s.friendBucket}:${s.myCount}`)) return;
    this.bucketFish.forEach((g) => g.parent?.remove(g));
    this.bucketFish = [];
    const put = (bucket: THREE.Group, n: number) => {
      for (let i = 0; i < Math.min(5, n); i++) {
        const fish = makeFish(0xc4cfa6, "fish");
        fish.scale.setScalar(0.55);
        fish.rotation.set(0, i * 1.3, Math.PI / 2 - 0.3);
        at(fish, Math.cos(i * 1.3) * 0.07, 0.3 + (i % 2) * 0.03, Math.sin(i * 1.3) * 0.07, bucket);
        fish.userData.k = `${s.friendBucket}:${s.myCount}`;
        this.bucketFish.push(fish);
      }
    };
    put(this.friendBucket, s.friendBucket);
    put(this.myBucket, s.myCount);
    if (this.bucketFish.length === 0) {
      const marker = new THREE.Group();
      marker.userData.k = `${s.friendBucket}:${s.myCount}`;
      this.bucketFish.push(marker);
    }
  }

  private makeLine(): THREE.Line {
    const geo = new THREE.BufferGeometry().setFromPoints(new Array(16).fill(0).map(() => new THREE.Vector3()));
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf4f1e6, transparent: true, opacity: 0.85 }));
  }

  private updateRods(s: SimSnapshot): void {
    const heroHand = this.hero.handR.getWorldPosition(new THREE.Vector3());
    const heroBase = this.hero.handL.getWorldPosition(new THREE.Vector3());
    const rodOk = s.rod !== "broken" && this.hero.body.visible && !this.melt;
    this.myRod.visible = rodOk;
    this.myLine.visible = rodOk && s.rod !== "recast" && s.hands !== "asleep";
    if (rodOk) {
      const butt = s.hands === "free" && s.rod !== "reeling" ? heroBase.clone().lerp(heroHand, 0.3) : heroHand.clone().add(V(-0.05, -0.15, 0.2));
      const grip = s.hands === "steal" || s.hands === "phone" || s.hands === "asleep"
        ? V(HERO_POS.x + 0.35, 0.12, HERO_POS.z - 0.6) // propped on the ground
        : heroHand;
      const tip = V(HERO_POS.x - 0.25, 2.1, HERO_POS.z - 3.6);
      this.buildRod(this.myRod, s.hands === "free" || s.hands === "beer" ? butt : grip, tip, this.myBobber.position, this.myRodPull);
      this.buildLine(this.myLine, this.myRod.userData.tip, this.myBobber.position.clone().add(V(0, 0.15, 0)), this.myRodPull);
    }
    const seated = this.friendPose === "rod" && this.friendAway === 0;
    const fHand = this.friend.handR.getWorldPosition(new THREE.Vector3());
    const base = seated ? fHand.clone().add(V(-0.05, -0.12, 0.22)) : V(FRIEND_POS.x + 0.5, 0.55, FRIEND_POS.z - 0.75);
    const ftip = V(FRIEND_POS.x + 0.5, 2.15, FRIEND_POS.z - 3.7);
    this.buildRod(this.friendRod, base, ftip, this.friendBobber.position, this.friendRodPull);
    this.buildLine(this.friendLine, this.friendRod.userData.tip, this.friendBobber.position.clone().add(V(0, 0.15, 0)), this.friendRodPull);
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
    if (this.particles.length > 90) return;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    m.position.copy(pos);
    this.scene.add(m);
    this.particles.push({ mesh: m, vel: vel.clone().add(V((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.15)), life, max: life, grow, gravity });
  }

  private splash(pos: THREE.Vector3, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(pos.clone().add(V(0, 0.05, 0)), V(Math.cos(a) * 0.9, 1.6 + Math.random() * 1.4, Math.sin(a) * 0.9), 0xe2f6f2, 0.7, 0.5, 6, 0.045);
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
    if (showAlert) this.place(this.alertEl, this.myBobber.position.clone().add(V(0, 0.55, 0)));
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

  // -------------------------------------------------------------- events
  private handle(e: SimEvent): void {
    switch (e.type) {
      case "bite":
        this.uiEvents.emit("bell");
        play("bell");
        voice.line("announcer", "bite", 4);
        this.splash(this.myBobber.position, 6);
        break;
      case "early":
        this.toast("РАНО ДЁРНУЛ!");
        if (Math.random() < 0.4) this.say(TOLIK.early, 1500);
        else voice.line("hero", "early", 2);
        break;
      case "missed":
        this.toast("ПРОЗЕВАЛ ПОКЛЁВКУ");
        voice.line("hero", "missed", 2);
        this.floatText(this.headTop(), "+8", "#d63732");
        break;
      case "hooked":
        this.splash(this.myBobber.position, 10);
        play("plop");
        voice.line("hero", "hooked", 2);
        break;
      case "catch":
        this.landFish(e.fish, this.myBobber.position.clone(), this.myBucket, "#b8d84a");
        this.toast(`${e.fish.species} · ${e.fish.weight.toFixed(2)} КГ`);
        play("catch");
        voice.line("hero", "catch", 3);
        if (e.fish.size === 1 && Math.random() < 0.6) this.animate(0.01, () => undefined, () => this.say(TOLIK.small, 1800), 1.4);
        break;
      case "snap":
        this.toast("СОШЛА!");
        play("snap");
        voice.line("hero", "snap", 3);
        this.splash(this.myBobber.position, 8);
        this.floatText(this.headTop(), "+10", "#d63732");
        break;
      case "friendCatch":
        this.friendRodPull = 1.4;
        play("ratchet");
        this.animate(0.01, () => undefined, () => {
          this.landFish(e.fish, this.friendBobber.position.clone(), this.friendBucket, "#e7ddc6");
          this.say(e.fish.species === "СОМ" ? TOLIK.catfish : TAUNTS[Math.floor(Math.random() * TAUNTS.length)], 1700);
          this.shake(0.15, 0.03 * e.fish.size);
          play("friendCatch");
        }, 0.45);
        this.floatText(this.headTop(), `+${Math.round(8 + e.fish.size * 4.5)}`, "#d63732");
        break;
      case "friendDistracted":
        this.friendPose = e.reason === "bushes" ? "away" : e.reason;
        if (e.reason === "bushes") { play("steps"); this.animate(0.01, () => undefined, () => play("rustle"), 1.0); }
        this.say(DISTRACT_LINES[e.reason][Math.floor(Math.random() * DISTRACT_LINES[e.reason].length)], 1800);
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
        for (let i = 0; i < 9; i++) this.animate(0.01, () => undefined, () => this.floatText(this.headTop(), "Z", "#e7ddc6", 20), i * 0.75);
        break;
      case "wake":
        this.uiEvents.emit("sleep", false);
        voice.line("hero", "wake", 3);
        this.toast(e.missedFish ? `ПОКА СПАЛ, ТОЛИК ПОЙМАЛ ${e.missedFish}` : "ПРОСНУЛСЯ. ГОЛОВА ГУДИТ");
        if (e.missedFish) this.say(TOLIK.wake, 2200);
        break;
      case "meltdown":
        this.meltdown();
        break;
      case "dayEnd":
        this.mode = "shop";
        this.music.setCalm(true);
        voice.say("announcer", ANNOUNCER.dayEnd, 3);
        this.uiEvents.emit("dayEnd", { day: e.day, offers: this.sim.offerPerks(), snapshot: this.sim.snapshot() });
        break;
      case "won":
        this.mode = "over";
        this.music.setCalm(true);
        voice.say("announcer", ANNOUNCER.won, 4);
        setTimeout(() => this.uiEvents.emit("result", this.result(true)), 400);
        break;
      case "lost":
        this.mode = "over";
        this.music.setCalm(true);
        this.uiEvents.emit("result", this.result(false));
        break;
      case "denied":
        this.toast(e.reason);
        break;
      default:
        break;
    }
  }

  /** Continuous sounds that follow state rather than one-off events. */
  private audioTick(s: SimSnapshot, dt: number): void {
    this.music.setState(s.rage / 100, this.mode === "menu" ? 0.3 : s.dayProgress);
    if (this.mode !== "playing") return;
    if (s.rod === "reeling") {
      this.ratchetClock -= dt;
      if (this.ratchetClock <= 0) { this.ratchetClock = 0.3; play("ratchet"); }
    }
    if (this.prevRod === "recast" && s.rod === "waiting") play("cast");
    this.prevRod = s.rod;
    if (!this.rageWarned && s.rage >= 80 && s.phase === "playing") {
      this.rageWarned = true;
      voice.line("announcer", "rageWarning", 5);
      play("heartbeat");
    } else if (this.rageWarned && s.rage < 65) {
      this.rageWarned = false;
    }
  }

  private result(won: boolean, abandoned = false) {
    const s = this.sim.snapshot();
    return {
      won, abandoned, day: s.day, myKg: s.myKg, myCount: s.myCount, friendKg: s.friendKg, friendCount: s.friendCount,
      stolen: this.sim.stolenCount, caught: this.sim.caughtStealing,
      biggest: [...this.sim.myFish].sort((a, b) => b.weight - a.weight)[0] as Fish | undefined,
    };
  }

  private landFish(fish: Fish, from: THREE.Vector3, bucket: THREE.Group, color: string): void {
    const look = FISH_LOOK[fish.species] ?? FISH_LOOK["ОКУНЬ"];
    const model = makeFish(look.color, look.kind);
    model.scale.setScalar(0.8 + fish.size * 0.35 + (fish.species === "СОМ" ? 0.6 : 0));
    this.scene.add(model);
    this.splash(from, 10);
    const to = bucket.getWorldPosition(new THREE.Vector3()).add(V(0, 0.35, 0));
    const peak = V((from.x + to.x) / 2, 2.6, (from.z + to.z) / 2);
    this.floatText(from.clone().add(V(0, 0.6, 0)), `${fish.weight.toFixed(2)} КГ`, color, 16);
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

  private meltdown(): void {
    this.uiEvents.emit("meltdown");
    this.bubble?.el.remove();
    this.bubble = null;
    this.friendLookTarget = 1.3;
    this.friendPose = "rod";
    const hand = this.hero.handR.getWorldPosition(new THREE.Vector3());
    // The rod snaps over the knee, both halves spin into the river.
    for (let i = 0; i < 2; i++) {
      const half = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.3, 5), new THREE.MeshLambertMaterial({ color: i ? 0x2c3036 : 0x5b3a1f, flatShading: true }));
      half.position.copy(hand);
      this.scene.add(half);
      this.brokenRod.push(half);
      const end = V(hand.x + (i ? 1.6 : -0.9), -0.1, hand.z - 3 - i);
      this.animate(1.1, (k) => {
        half.position.set(lerp(hand.x, end.x, k), hand.y + Math.sin(k * Math.PI) * 2.2 + (end.y - hand.y) * k, lerp(hand.z, end.z, k));
        half.rotation.set(k * (i ? 9 : -7), 0, k * 5);
      }, () => { this.splash(end, 6); half.visible = false; }, 0.45);
    }
    this.floatText(hand.clone().add(V(0, 0.5, 0)), "ХРЯСЬ!", "#f2b632", 34);
    play("crack");
    voice.line("hero", "meltdown", 9);
    this.music.stop();
    this.shake(0.35, 0.12);
    // A running dive into the river; the stool stays behind.
    const body = this.hero.body;
    const target = V(-0.7, -0.4, -4.4).sub(HERO_POS);
    this.melt = { t: 0, from: body.position.clone() };
    this.animate(0.45, (k) => { body.position.y = Math.sin(k * Math.PI) * 0.15; body.rotation.x = -k * 0.3; }, undefined, 0.3);
    this.animate(1.0, (k) => {
      const kk = ease(k);
      body.position.set(lerp(0, target.x, kk), lerp(0, target.y, k) + Math.sin(k * Math.PI) * 1.6, lerp(0, target.z, kk));
      body.rotation.x = -0.3 - k * 2.1;
      this.hero.armR.set(this.hero.shoulderR, V(0.25, 1.7, -0.2));
      this.hero.armL.set(this.hero.shoulderL, V(-0.25, 1.7, -0.2));
      this.hero.handR.position.set(0.25, 1.7, -0.2);
      this.hero.handL.position.set(-0.25, 1.7, -0.2);
    }, () => {
      body.visible = false;
      const splashAt = V(-0.7, 0, -4.4);
      this.splash(splashAt, 30);
      this.floatText(splashAt.clone().add(V(0, 0.8, 0)), "БУЛЬ!", "#54b7c6", 40);
      play("splash");
      this.shake(0.3, 0.08);
      this.say(TOLIK.splash, 2400);
      for (let i = 0; i < 12; i++) this.animate(0.01, () => undefined, () => this.spawn(splashAt.clone().add(V((Math.random() - 0.5) * 0.4, 0, 0)), V(0, 0.6, 0), 0xe2f6f2, 0.8, 1.5, 0, 0.04), 0.2 + i * 0.12);
    }, 1.1);
  }
}
