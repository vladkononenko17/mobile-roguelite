import * as THREE from "three";
import { Post, defaultQuality, type Mood, type Quality } from "../../stiny/src/three/post.ts";
import { COUNTRIES } from "./geo.ts";
import {
  AD, OCCUPIED_BACK, SECTORS, TARGETS, THREATS, ZONES, km, lonlat,
  type Km, type SectorId, type ThreatKind, type WeaponId,
} from "./content.ts";
import { along, frontLine, type NightEv, type NightState, type RunState, type StrikeEv, type StrikeFlight, type Threat } from "./sim.ts";
import { Particles, Trails, glow, glowSprite, toon, toonRamp } from "./three/fx.ts";
import * as MD from "./three/models.ts";

/**
 * The world of «Ставка»: one low-poly map of Ukraine and its neighbours seen
 * from above, by day (a board to plan on), by night (city lights, the wave
 * coming in, interceptors going up) and at dusk (a strike flying into Russia).
 *
 * 1 world unit = 10 km. North is −Z. The scene only draws; the rules live in
 * sim.ts and the UI in main.ts.
 */

export type ViewMode = "menu" | "day" | "night" | "strike";
const U = 10;
const UA_Y = 0.7;
const LAND_Y = 0.5;
export const toWorld = (p: Km, y = UA_Y) => new THREE.Vector3(p.x / U, y, -p.y / U);
const fromWorld = (v: THREE.Vector3): Km => ({ x: v.x * U, y: -v.z * U });
const ll = (l: readonly [number, number], y = UA_Y) => toWorld(km(l[0], l[1]), y);

interface Palette { sea: number; ua: number; ru: number; other: number; occ: number; sky: number; fog: number; block: number; blockRu: number; tree: number; river: number }
const PAL: Record<"day" | "night" | "dusk", Palette> = {
  day: { sea: 0x6fb6cf, ua: 0xa9c77a, ru: 0xc9b98f, other: 0xb9c29a, occ: 0xc79f86, sky: 0xbfe3f2, fog: 0xcfe7ef, block: 0xebe5d6, blockRu: 0xd9ccb8, tree: 0x5e8b46, river: 0x64aed0 },
  night: { sea: 0x0a1626, ua: 0x1d2c42, ru: 0x261d24, other: 0x182030, occ: 0x33202a, sky: 0x04060c, fog: 0x060a14, block: 0x2a3550, blockRu: 0x33303a, tree: 0x13261f, river: 0x0e2a44 },
  dusk: { sea: 0x4a7f99, ua: 0x8fae63, ru: 0xb7a983, other: 0x9aa47a, occ: 0xa98a74, sky: 0xe9c4a2, fog: 0xd9c0a8, block: 0xe2d4bc, blockRu: 0xd6c6aa, tree: 0x4e6b3a, river: 0x5a93b2 },
};

interface Live { obj: THREE.Object3D; glow: THREE.Sprite; kind: string }
interface UnitView { obj: THREE.Group; ring: THREE.Mesh; disc: THREE.Mesh; kind: string; sector: SectorId }
interface BalView { arc: THREE.Line; mark: THREE.Mesh }

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1200);
  readonly post: Post;
  private mode: ViewMode = "menu";
  private pal: Palette = PAL.night;
  private hemi = new THREE.HemisphereLight(0xffffff, 0x6a6a50, 1.2);
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private mats = {
    sea: toonMat(0), ua: toonMat(0), ru: toonMat(0), other: toonMat(0), river: new THREE.MeshBasicMaterial({ color: 0 }),
    block: toonMat(0), blockRu: toonMat(0), tree: toonMat(0),
  };
  private borderMat = new THREE.LineBasicMaterial({ color: 0x6fb2ff, transparent: true, opacity: 0.55 });
  private occTex: THREE.CanvasTexture;
  private occCanvas: HTMLCanvasElement;
  private occUniforms = { occMask: { value: null as THREE.Texture | null }, occBox: { value: new THREE.Vector4() }, occColor: { value: new THREE.Color() } };
  private frontMesh: THREE.Mesh | null = null;
  private frontGlow: THREE.Mesh | null = null;
  private frontKey = "";
  private windows!: THREE.InstancedMesh;
  private windowInfo: { sector: SectorId | null; thr: number; m: THREE.Matrix4 }[] = [];
  private winMat = glow(0xffc870, 2.2);
  private cityGlows = new Map<string, THREE.Sprite>();
  private sectorPower = new Map<SectorId, number>();
  private plants = new Map<SectorId, THREE.Group>();
  private strips = new Map<SectorId, THREE.Group>();
  private units = new Map<number, UnitView>();
  private targets = new Map<string, THREE.Group>();
  private targetState = new Map<string, boolean>();
  private zones = new Map<string, THREE.Group>();
  private trees: THREE.InstancedMesh | null = null;
  private threats = new Map<number, Live>();
  private ballistic = new Map<number, BalView>();
  private shots = new Map<number, Live>();
  private flight = new Map<number, Live>();
  private pools = new Map<string, THREE.Object3D[]>();
  private fire = new Particles(1400, true);
  private smoke = new Particles(900, false);
  private trails = new Trails(260, 22, true);
  private flashes: { s: THREE.Sprite; t: number; max: number; size: number }[] = [];
  private burning: { at: THREE.Vector3; t: number; k: number }[] = [];
  private routeLine: THREE.Line | null = null;
  private routeDots: THREE.Mesh[] = [];
  private rangeRing: THREE.Mesh | null = null;
  private selRing: THREE.Mesh;
  private targetRing: THREE.Mesh;
  private sectorRing: THREE.Mesh;
  private night: NightState | null = null;
  private fl: StrikeFlight | null = null;
  private revealDecoys = false;
  // camera rig
  private camTarget = new THREE.Vector3();
  private camGoal = new THREE.Vector3();
  private dist = 140;
  private distGoal = 140;
  private follow: (() => THREE.Vector3 | null) | null = null;
  private shake = 0;
  private time = 0;
  private frontFxT = 0;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -UA_Y);
  selectedUnit: number | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.domElement.id = "gl";
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.prepend(this.renderer.domElement);
    this.scene.fog = new THREE.Fog(0, 200, 600);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fire.points, this.smoke.points, this.trails.lines);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.fire.floor = UA_Y;
    this.smoke.floor = UA_Y;
    this.occCanvas = document.createElement("canvas");
    this.occCanvas.width = 512; this.occCanvas.height = 256;
    this.occTex = new THREE.CanvasTexture(this.occCanvas);
    this.occUniforms.occMask.value = this.occTex;
    const a = ll([22, 53.5]), b = ll([44, 43]);
    this.occUniforms.occBox.value.set(a.x, a.z, b.x - a.x, b.z - a.z);
    this.patchOccupied(this.mats.ua);

    this.selRing = ringMesh(1, 0.25, 0xffd43b, 0.95);
    this.targetRing = ringMesh(4.2, 0.4, 0xffd43b, 0.95);
    this.sectorRing = ringMesh(6.5, 0.35, 0xffd43b, 0.9);
    this.selRing.visible = this.targetRing.visible = this.sectorRing.visible = false;
    this.scene.add(this.selRing, this.targetRing, this.sectorRing);

    this.buildMap();
    this.post = new Post(this.renderer, this.scene, this.camera, defaultQuality());
    this.applyQuality();
    this.setMode("menu", true);
    this.camGoal.copy(ll([33.5, 48.6], 0));
    this.camTarget.copy(this.camGoal);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  get quality(): Quality { return this.post.quality; }
  setQuality(q: Quality): void { this.post.setQuality(q); this.applyQuality(); this.resize(); }
  private applyQuality(): void {
    this.renderer.shadowMap.enabled = this.post.quality !== "low";
    this.sun.castShadow = this.post.quality !== "low";
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.7 ? 58 : 46;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h);
    this.fire.setScale(h, this.camera.fov);
    this.smoke.setScale(h, this.camera.fov);
  }

  // ================================================================ the map

  private patchOccupied(m: THREE.MeshToonMaterial): void {
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.occUniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform vec4 occBox;\nvarying vec2 vOcc;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvOcc = (transformed.xz - occBox.xy) / occBox.zw;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D occMask;\nuniform vec3 occColor;\nvarying vec2 vOcc;")
        .replace("#include <color_fragment>", "#include <color_fragment>\nfloat occ = texture2D(occMask, vec2(vOcc.x, 1.0 - vOcc.y)).r;\ndiffuseColor.rgb = mix(diffuseColor.rgb, occColor, occ * 0.9);");
    };
  }

  private buildMap(): void {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), this.mats.sea);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.05;
    sea.receiveShadow = true;
    this.scene.add(sea);
    for (const [code, rings] of Object.entries(COUNTRIES)) {
      const isUA = code === "UA", isRU = code === "RU";
      const mat = isUA ? this.mats.ua : isRU ? this.mats.ru : this.mats.other;
      for (const ring of rings) {
        const shape = new THREE.Shape(ring.map(([lon, lat]) => { const p = km(lon, lat); return new THREE.Vector2(p.x / U, p.y / U); }));
        const g = new THREE.ExtrudeGeometry(shape, { depth: isUA ? UA_Y : LAND_Y, bevelEnabled: false });
        g.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = true;
        this.scene.add(m);
      }
    }
    // Ukraine's border, so it reads at night
    for (const ring of COUNTRIES.UA ?? []) {
      const pts = ring.map(([lon, lat]) => ll([lon, lat], UA_Y + 0.04));
      pts.push(pts[0].clone());
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.borderMat);
      line.renderOrder = 2;
      this.scene.add(line);
    }
    // the Dnipro
    const dnipro: [number, number][] = [[30.6, 51.5], [30.55, 50.45], [31.5, 49.8], [32.06, 49.44], [33.4, 49.06], [34.6, 48.6], [35.05, 48.46], [35.1, 47.85], [34.4, 47.5], [33.6, 47.1], [32.6, 46.7], [31.9, 46.5]];
    const river = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(dnipro.map((p) => ll(p, UA_Y + 0.01))), 120, 0.42, 4), this.mats.river);
    river.scale.y = 0.15;
    river.position.y = UA_Y * 0.85;
    this.scene.add(river);

    // cities: instanced blocks + windows
    const blocks: THREE.Matrix4[] = [];
    const blocksRu: THREE.Matrix4[] = [];
    const wins: { sector: SectorId | null; m: THREE.Matrix4 }[] = [];
    let seed = 11;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const city = (at: THREE.Vector3, size: number, sector: SectorId | null, ru: boolean) => {
      const n = Math.round(10 + size * 13);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * size * 1.5;
        const h = 0.3 + r() * (0.5 + size * 0.45) * (rr < size * 0.6 ? 1.6 : 0.8);
        const w = 0.32 + r() * 0.25, d = 0.32 + r() * 0.25;
        const x = at.x + Math.cos(a) * rr, z = at.z + Math.sin(a) * rr;
        (ru ? blocksRu : blocks).push(new THREE.Matrix4().compose(new THREE.Vector3(x, at.y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d)));
        wins.push({ sector, m: new THREE.Matrix4().compose(new THREE.Vector3(x, at.y + h + 0.03, z), new THREE.Quaternion(), new THREE.Vector3(w * 0.85, 1, d * 0.85)) });
      }
      const s = glowSprite(ru ? 0xff9a5a : 0xffb85a, size * 7, 0.5);
      s.position.set(at.x, at.y + 1.2, at.z);
      this.scene.add(s);
      return s;
    };
    for (const s of SECTORS) {
      const sz = 0.7 + s.pop * 0.35;
      this.cityGlows.set(s.id, city(ll(s.city), sz, s.id, false));
      this.sectorPower.set(s.id, 100);
    }
    const ruCities: [number, number, number][] = [[36.6, 50.6, 1], [36.19, 51.73, 1], [39.2, 51.66, 1.3], [34.36, 53.24, 1], [39.7, 47.23, 1.4], [38.9, 47.2, 0.7], [37.8, 48.0, 1.3], [39.3, 48.57, 1], [37.55, 47.1, 0.9], [33.52, 44.6, 0.8], [37.62, 55.75, 2.6], [39.7, 54.62, 1.0], [44.5, 48.7, 1.3], [46.0, 51.53, 1.2], [49.1, 55.8, 1.3], [36.07, 52.97, 0.9], [37.77, 44.72, 0.9], [34.1, 44.95, 0.9], [27.56, 53.9, 1.6]];
    for (const [lon, lat, s] of ruCities) this.cityGlows.set(`ru${lon}`, city(ll([lon, lat], lat < 46 && lon < 36.7 ? UA_Y : LAND_Y), s, null, true));
    const mk = (list: THREE.Matrix4[], mat: THREE.Material) => {
      const im = new THREE.InstancedMesh(MD.blockGeo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true; im.receiveShadow = true;
      this.scene.add(im);
      return im;
    };
    mk(blocks, this.mats.block);
    mk(blocksRu, this.mats.blockRu);
    this.windows = new THREE.InstancedMesh(MD.windowGeo, this.winMat, wins.length);
    wins.forEach((w, i) => { this.windows.setMatrixAt(i, w.m); this.windowInfo.push({ ...w, thr: r() }); });
    this.scene.add(this.windows);

    // trees (day board)
    const treeGeo = new THREE.ConeGeometry(0.28, 0.8, 5).translate(0, 0.4, 0);
    const tm: THREE.Matrix4[] = [];
    for (let i = 0; i < 1800; i++) {
      const lon = 22.5 + r() * 18, lat = 44.5 + r() * 8;
      const p = km(lon, lat);
      if (!insideAny(COUNTRIES.UA, lon, lat) && !insideAny(COUNTRIES.RU, lon, lat) && !insideAny(COUNTRIES.BY, lon, lat)) continue;
      if (SECTORS.some((s) => Math.hypot(s.city[0] - lon, s.city[1] - lat) < 0.45)) continue;
      const y = insideAny(COUNTRIES.UA, lon, lat) ? UA_Y : LAND_Y;
      const sc = 0.7 + r() * 0.6;
      tm.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x / U, y, -p.y / U), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)));
    }
    this.trees = new THREE.InstancedMesh(treeGeo, this.mats.tree, tm.length);
    tm.forEach((m, i) => this.trees!.setMatrixAt(i, m));
    this.trees.castShadow = true;
    this.scene.add(this.trees);

    // power plants, factories, strips
    for (const s of SECTORS) {
      const pp = MD.powerPlant();
      pp.scale.setScalar(0.5);
      pp.position.copy(ll(s.power));
      this.scene.add(pp);
      this.plants.set(s.id, pp);
      if (s.industry >= 2) { const f = MD.ourFactory(); f.scale.setScalar(0.55); f.position.copy(toWorld({ x: km(...s.city).x + 9, y: km(...s.city).y - 6 })); this.scene.add(f); }
      if (s.strip) {
        const st = MD.airstrip();
        st.scale.setScalar(0.55);
        st.rotation.y = 0.4;
        st.position.copy(toWorld({ x: km(...s.city).x - 14, y: km(...s.city).y + 8 }));
        for (let i = 0; i < 4; i++) { const d = MD.liutyi(); d.scale.setScalar(0.55); d.rotation.y = Math.PI / 2; d.position.set(-2.4 + i * 1.6, 0.4, 1.4); d.name = "parked"; st.add(d); }
        this.scene.add(st);
        this.strips.set(s.id, st);
      }
    }
    // targets in Russia and occupied land
    for (const t of TARGETS) {
      const g = MD.targetModel(t.kind, t.id.length * 7 + 3);
      g.scale.multiplyScalar(0.5);
      const occ = t.occupied || t.id === "bridge";
      g.position.copy(ll(t.at, t.kind === "bridge" ? 0 : occ ? UA_Y : LAND_Y));
      if (t.kind === "bridge") g.scale.multiplyScalar(1.4);
      g.userData.id = t.id;
      this.scene.add(g);
      this.targets.set(t.id, g);
    }
    // enemy air-defence zones
    for (const z of ZONES) {
      const g = new THREE.Group();
      const r0 = z.r / U;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r0, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
      dome.scale.y = 0.35;
      g.add(dome);
      const ring = ringMesh(r0, 0.35, 0xff3b3b, 0.85);
      ring.position.y = 0.06;
      g.add(ring);
      g.position.copy(ll(z.at, LAND_Y));
      g.visible = false;
      this.scene.add(g);
      this.zones.set(z.id, g);
    }
  }

  // ================================================================ modes and run state

  setMode(mode: ViewMode, instant = false): void {
    this.mode = mode;
    const key = mode === "day" ? "day" : mode === "strike" ? "dusk" : "night";
    this.pal = PAL[key];
    const p = this.pal;
    this.mats.sea.color.setHex(p.sea);
    this.mats.ua.color.setHex(p.ua);
    this.mats.ru.color.setHex(p.ru);
    this.mats.other.color.setHex(p.other);
    this.mats.river.color.setHex(p.river);
    this.mats.block.color.setHex(p.block);
    this.mats.blockRu.color.setHex(p.blockRu);
    this.mats.tree.color.setHex(p.tree);
    this.occUniforms.occColor.value.setHex(p.occ);
    this.scene.background = new THREE.Color(p.sky);
    (this.scene.fog as THREE.Fog).color.setHex(p.fog);
    const nightish = key === "night";
    this.hemi.color.setHex(nightish ? 0x3a5a8c : 0xffffff);
    this.hemi.groundColor.setHex(nightish ? 0x0a0a12 : 0x6a6a50);
    this.hemi.intensity = nightish ? 0.9 : key === "dusk" ? 1.0 : 1.3;
    this.sun.color.setHex(nightish ? 0x9fb8ff : key === "dusk" ? 0xffc89a : 0xffffff);
    this.sun.intensity = nightish ? 0.8 : key === "dusk" ? 2.1 : 2.0;
    this.sun.position.set(key === "dusk" ? 80 : -50, key === "dusk" ? 45 : 90, 40);
    this.windows.visible = nightish;
    this.borderMat.color.setHex(nightish ? 0x6fb2ff : 0x3d5a2c);
    this.borderMat.opacity = nightish ? 0.6 : 0.45;
    for (const [, s] of this.cityGlows) s.visible = nightish;
    if (this.trees) this.trees.visible = !nightish || this.post.quality === "high";
    this.post.setMood((nightish ? "night" : key === "dusk" ? "dusk" : "day") as Mood, instant);
    for (const [, u] of this.units) this.styleUnit(u);
    if (this.frontMesh) this.frontKey = "";
    for (const [, z] of this.zones) z.visible = false;
    this.selRing.visible = false;
    this.targetRing.visible = mode === "strike" && this.targetRing.visible;
    this.sectorRing.visible = false;
  }
  get viewMode(): ViewMode { return this.mode; }

  /** Pull everything that persists between phases from the run. */
  syncRun(run: RunState): void {
    // front line + occupied mask
    const line = frontLine(run);
    const key = line.map(([a, b]) => `${a.toFixed(3)},${b.toFixed(3)}`).join(";") + this.mode;
    if (key !== this.frontKey) { this.frontKey = key; this.buildFront(line); }
    // city lights and plant smoke
    for (const s of run.sectors) this.sectorPower.set(s.id, s.power);
    this.windowInfo.forEach((w, i) => {
      const on = w.sector === null || w.thr < (this.sectorPower.get(w.sector) ?? 100) / 100;
      this.windows.setMatrixAt(i, on ? w.m : ZERO);
    });
    this.windows.instanceMatrix.needsUpdate = true;
    for (const s of SECTORS) {
      const g = this.cityGlows.get(s.id);
      const p = (this.sectorPower.get(s.id) ?? 100) / 100;
      if (g) { (g.material as THREE.SpriteMaterial).opacity = 0.12 + 0.45 * p; g.scale.setScalar((0.7 + s.pop * 0.35) * (3 + 4 * p)); }
    }
    // air defence units
    const seen = new Set<number>();
    for (const u of run.ad) {
      seen.add(u.id);
      let v = this.units.get(u.id);
      if (!v || v.kind !== u.kind || v.sector !== u.sector) {
        if (v) this.removeUnit(u.id);
        const obj = MD.adModel(u.kind);
        obj.scale.setScalar(0.5);
        const r0 = AD[u.kind].range / U * (run.perks.includes("pickups") && (u.kind === "mobile" || u.kind === "gepard") ? 1.35 : 1);
        const ring = ringMesh(r0, Math.max(0.18, r0 * 0.012), AD[u.kind].color, 0.6);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(r0, 48), new THREE.MeshBasicMaterial({ color: AD[u.kind].color, transparent: true, opacity: 0.06, depthWrite: false }));
        disc.rotation.x = -Math.PI / 2;
        v = { obj, ring, disc, kind: u.kind, sector: u.sector };
        this.scene.add(obj, ring, disc);
        this.units.set(u.id, v);
        this.styleUnit(v);
      }
      const p = toWorld(u.at);
      v.obj.position.copy(p);
      v.obj.rotation.y = (u.id * 1.7) % (Math.PI * 2);
      v.ring.position.set(p.x, UA_Y + 0.04 + (u.id % 7) * 0.004, p.z);
      v.disc.position.set(p.x, UA_Y + 0.03, p.z);
      v.obj.visible = !u.down;
    }
    for (const id of [...this.units.keys()]) if (!seen.has(id)) this.removeUnit(id);
    // strips: parked drones by stock
    const parked = Math.min(4, Math.ceil(run.stock.liutyi / 4));
    for (const [, st] of this.strips) st.children.filter((c) => c.name === "parked").forEach((c, i) => { c.visible = i < parked; });
    // targets knocked out burn
    for (const t of TARGETS) {
      const down = (run.targets[t.id]?.until ?? 0) >= run.week;
      if (down !== this.targetState.get(t.id)) {
        this.targetState.set(t.id, down);
        const g = this.targets.get(t.id)!;
        g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.name === "flare") m.visible = !down; });
        this.burning = this.burning.filter((b) => b.at.distanceTo(g.position) > 0.1);
        if (down) this.burning.push({ at: g.position.clone().add(new THREE.Vector3(0, 0.6, 0)), t: 0, k: 1 });
      }
    }
    // zones known
    for (const z of ZONES) this.zones.get(z.id)!.userData.known = run.zones[z.id].known;
    this.revealDecoys = run.perks.includes("nordicRadars");
  }
  private removeUnit(id: number): void {
    const v = this.units.get(id);
    if (!v) return;
    this.scene.remove(v.obj, v.ring, v.disc);
    this.units.delete(id);
  }
  private styleUnit(v: UnitView): void {
    const night = this.mode === "night" || this.mode === "menu";
    (v.ring.material as THREE.MeshBasicMaterial).opacity = night ? 0.45 : 0.75;
    (v.disc.material as THREE.MeshBasicMaterial).opacity = night ? 0.035 : 0.07;
    const show = this.mode !== "strike";
    v.ring.visible = v.disc.visible = show;
  }

  private buildFront(line: [number, number][]): void {
    if (this.frontMesh) this.scene.remove(this.frontMesh);
    if (this.frontGlow) this.scene.remove(this.frontGlow);
    const curve = new THREE.CatmullRomCurve3(line.map((p) => ll(p, UA_Y + 0.2)));
    const night = this.mode !== "day";
    this.frontMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.3, 6), night ? glow(0xff4a2a, 2.2) : toon(0xd2342a));
    this.frontGlow = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.95, 6), new THREE.MeshBasicMaterial({ color: 0xff3010, transparent: true, opacity: night ? 0.16 : 0.08, depthWrite: false, blending: night ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.scene.add(this.frontMesh, this.frontGlow);
    // occupied mask: front line + the corners behind it
    const g = this.occCanvas.getContext("2d")!;
    const W = this.occCanvas.width, H = this.occCanvas.height;
    const toC = ([lon, lat]: readonly [number, number]) => [((lon - 22) / 22) * W, ((53.5 - lat) / 10.5) * H] as const;
    g.clearRect(0, 0, W, H);
    g.filter = "blur(1.5px)";
    g.fillStyle = "#fff";
    g.beginPath();
    const pts = [...line, ...OCCUPIED_BACK];
    pts.forEach((p, i) => { const [x, y] = toC(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.closePath();
    g.fill();
    g.filter = "none";
    this.occTex.needsUpdate = true;
  }

  // ================================================================ camera

  focus(lon: number, lat: number, dist?: number, instant = false): void {
    this.follow = null;
    this.camGoal.copy(ll([lon, lat], 0));
    if (dist) this.distGoal = dist;
    if (instant) { this.camTarget.copy(this.camGoal); this.dist = this.distGoal; }
  }
  focusKm(p: Km, dist?: number): void { const [lon, lat] = lonlat(p); this.focus(lon, lat, dist); }
  followFlight(on: boolean): void {
    this.follow = on ? () => {
      const fl = this.fl;
      if (!fl) return null;
      const alive = fl.missiles.filter((m) => !m.dead && !m.arrived && fl.t >= m.delay);
      if (!alive.length) return toWorld(fl.route[fl.route.length - 1], 0);
      const d = alive.reduce((a, m) => a + m.d, 0) / alive.length;
      return toWorld(along(fl.route, d).p, 0);
    } : null;
  }
  pan(dxPx: number, dyPx: number): void {
    this.follow = null;
    const k = (this.dist * 1.6) / window.innerHeight;
    this.camGoal.x -= dxPx * k;
    this.camGoal.z -= dyPx * k * 1.3;
    this.camGoal.x = THREE.MathUtils.clamp(this.camGoal.x, -110, 230);
    this.camGoal.z = THREE.MathUtils.clamp(this.camGoal.z, -95, 60);
  }
  zoom(f: number): void { this.distGoal = THREE.MathUtils.clamp(this.distGoal * f, 22, 300); }
  get zoomDist(): number { return this.distGoal; }
  addShake(v: number): void { this.shake = Math.min(1.2, this.shake + v); }

  private updateCamera(dt: number): void {
    if (this.follow) { const p = this.follow(); if (p) this.camGoal.lerp(p, Math.min(1, dt * 2)); }
    const k = 1 - Math.exp(-dt * 4);
    this.camTarget.lerp(this.camGoal, k);
    this.dist += (this.distGoal - this.dist) * k;
    if (this.mode === "menu") { this.camGoal.x += dt * 1.6; if (this.camGoal.x > 60) this.camGoal.x = -20; }
    const pitch = THREE.MathUtils.lerp(0.95, 1.18, THREE.MathUtils.clamp((this.dist - 30) / 200, 0, 1));
    this.camera.position.set(this.camTarget.x, this.dist * Math.sin(pitch), this.camTarget.z + this.dist * Math.cos(pitch));
    this.camera.lookAt(this.camTarget);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * this.shake * 0.8;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    const sc = this.sun.shadow.camera;
    const ext = Math.min(160, this.dist * 0.9);
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 400;
    sc.updateProjectionMatrix();
    this.sun.target.position.copy(this.camTarget);
    this.sun.position.copy(this.camTarget).add(this.mode === "strike" ? new THREE.Vector3(120, 70, 40) : new THREE.Vector3(-60, 140, 60));
    (this.scene.fog as THREE.Fog).near = this.dist * 1.3;
    (this.scene.fog as THREE.Fog).far = this.dist * 3.6;
  }

  // ================================================================ picking

  project(p: Km, h = 0): { x: number; y: number; on: boolean } {
    const v = toWorld(p, UA_Y + h).project(this.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, on: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
  }
  projectWorld(v3: THREE.Vector3): { x: number; y: number; on: boolean } {
    const v = v3.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, on: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
  }
  ground(x: number, y: number): Km | null {
    this.raycaster.setFromCamera(new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1), this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, p) ? fromWorld(p) : null;
  }
  pickThreat(x: number, y: number, radius = 44): number | null {
    let best: number | null = null, bd = radius;
    for (const [id, l] of this.threats) {
      if (!l.obj.visible) continue;
      const s = this.projectWorld(l.obj.position);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  pickTarget(x: number, y: number, radius = 46): string | null {
    let best: string | null = null, bd = radius;
    for (const [id, g] of this.targets) {
      const s = this.projectWorld(g.position);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  pickUnit(x: number, y: number, radius = 36): number | null {
    let best: number | null = null, bd = radius;
    for (const [id, v] of this.units) {
      const s = this.projectWorld(v.obj.position);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  pickSector(x: number, y: number): SectorId | null {
    const g = this.ground(x, y);
    if (!g) return null;
    let best: SectorId | null = null, bd = 130;
    for (const s of SECTORS) { const d = Math.hypot(km(...s.city).x - g.x, km(...s.city).y - g.y); if (d < bd) { bd = d; best = s.id; } }
    return best;
  }

  // ================================================================ selection overlays

  selectUnit(id: number | null): void {
    this.selectedUnit = id;
    const v = id !== null ? this.units.get(id) : null;
    this.selRing.visible = !!v;
    if (v) { this.selRing.position.set(v.obj.position.x, UA_Y + 0.12, v.obj.position.z); this.selRing.scale.setScalar(1.6); }
  }
  highlightSector(id: SectorId | null): void {
    this.sectorRing.visible = !!id;
    if (id) this.sectorRing.position.copy(ll(SECTORS.find((s) => s.id === id)!.city, UA_Y + 0.1));
  }
  selectTarget(id: string | null): void {
    const g = id ? this.targets.get(id) : null;
    this.targetRing.visible = !!g;
    if (g) this.targetRing.position.set(g.position.x, g.position.y + 0.15, g.position.z);
  }
  showZones(on: boolean): void { for (const [, z] of this.zones) z.visible = on && !!z.userData.known; }

  /** The planned route (dashed yellow), its waypoints and the weapon's range from the launch point. */
  showRoute(route: Km[] | null, range = 0): void {
    if (this.routeLine) { this.scene.remove(this.routeLine); this.routeLine = null; }
    for (const d of this.routeDots) this.scene.remove(d);
    this.routeDots = [];
    if (this.rangeRing) { this.scene.remove(this.rangeRing); this.rangeRing = null; }
    if (!route || route.length < 2) return;
    const pts = route.map((p) => toWorld(p, UA_Y + 1.6));
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.1);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(160));
    this.routeLine = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xffd43b, dashSize: 1.4, gapSize: 0.9, linewidth: 2 }));
    this.routeLine.computeLineDistances();
    this.routeLine.renderOrder = 7;
    this.scene.add(this.routeLine);
    route.slice(1, -1).forEach((p) => {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16), new THREE.MeshBasicMaterial({ color: 0xffd43b }));
      d.position.copy(toWorld(p, UA_Y + 1.6));
      this.scene.add(d);
      this.routeDots.push(d);
    });
    const start = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.15, 16), new THREE.MeshBasicMaterial({ color: 0x4da3ff }));
    start.position.copy(pts[0]);
    this.scene.add(start);
    this.routeDots.push(start);
    if (range > 0) {
      this.rangeRing = ringMesh(range / U, 0.35, 0xffd43b, 0.35);
      this.rangeRing.position.set(pts[0].x, UA_Y + 0.08, pts[0].z);
      this.scene.add(this.rangeRing);
    }
  }

  // ================================================================ night

  setNight(n: NightState | null): void {
    this.night = n;
    if (!n) {
      for (const [id] of this.threats) this.dropThreat(id);
      for (const [id] of this.shots) this.dropShot(id);
      for (const [id] of this.ballistic) this.dropBallistic(id);
    }
  }
  setRevealDecoys(on: boolean): void { this.revealDecoys = on; }

  private take(kind: string): THREE.Object3D {
    const pool = this.pools.get(kind);
    if (pool?.length) { const o = pool.pop()!; o.visible = true; return o; }
    let o: THREE.Object3D;
    switch (kind) {
      case "shahed": case "gerbera": o = MD.shahed(); o.scale.setScalar(0.55); break;
      case "gerbera-seen": o = MD.shahed(); o.scale.setScalar(0.55); o.traverse((m) => { const mm = m as THREE.Mesh; if (mm.isMesh && mm.name !== "hull") mm.material = toon(0x6a6a6a, { opacity: 0.55 }); }); break;
      case "kh101": o = MD.kh101(); o.scale.setScalar(0.5); break;
      case "kalibr": o = MD.kalibr(); o.scale.setScalar(0.5); break;
      case "iskander": o = MD.iskander(); o.scale.setScalar(0.65); break;
      case "kinzhal": o = MD.kinzhal(); o.scale.setScalar(0.6); break;
      case "sam": o = MD.samMissile(); o.scale.setScalar(0.5); break;
      case "drone": o = MD.interceptorDrone(); o.scale.setScalar(0.7); break;
      case "liutyi": o = MD.liutyi(); o.scale.setScalar(0.5); break;
      case "neptune": o = MD.neptune(); o.scale.setScalar(0.45); break;
      case "flamingo": o = MD.flamingo(); o.scale.setScalar(0.4); break;
      case "storm": o = MD.storm(); o.scale.setScalar(0.45); break;
      case "atacms": o = MD.atacms(); o.scale.setScalar(0.5); break;
      case "decoy": o = MD.decoy(); o.scale.setScalar(0.5); break;
      default: o = glowSprite(0xffe08a, 0.9, 1); break;
    }
    o.userData.kind = kind;
    o.userData.base = o.scale.x;
    this.scene.add(o);
    return o;
  }
  private give(o: THREE.Object3D): void {
    o.visible = false;
    const k = o.userData.kind as string;
    (this.pools.get(k) ?? this.pools.set(k, []).get(k)!).push(o);
  }

  private threatColor(kind: ThreatKind): number {
    return kind === "shahed" || kind === "gerbera" ? 0xff8a2a : kind === "kh101" || kind === "kalibr" ? 0xcfe0ff : 0xff3b3b;
  }
  private threatWorld(th: Threat): THREE.Vector3 {
    const ball = THREATS[th.kind].ballistic;
    return toWorld(th.pos, UA_Y + (ball ? th.h * 0.42 : th.h * 1.05) + 0.25);
  }
  private dropThreat(id: number): void {
    const l = this.threats.get(id);
    if (!l) return;
    this.give(l.obj);
    this.scene.remove(l.glow);
    this.threats.delete(id);
    this.trails.release(id);
  }
  private dropShot(id: number): void {
    const l = this.shots.get(id);
    if (!l) return;
    this.give(l.obj);
    this.scene.remove(l.glow);
    this.shots.delete(id);
    this.trails.release(100000 + id);
  }
  private dropBallistic(id: number): void {
    const b = this.ballistic.get(id);
    if (!b) return;
    this.scene.remove(b.arc, b.mark);
    this.ballistic.delete(id);
  }

  /** Far out, flying things grow so they stay readable on a phone. */
  private get zoomK(): number { return THREE.MathUtils.clamp(this.dist / 70, 1, 2.6); }
  private syncNight(): void {
    const n = this.night;
    if (!n) return;
    const zk = this.zoomK;
    for (const th of n.threats) {
      if (!th.alive) { if (this.threats.has(th.id)) this.dropThreat(th.id); continue; }
      let l = this.threats.get(th.id);
      const def = THREATS[th.kind];
      if (!l) {
        const kind = th.kind === "gerbera" && this.revealDecoys ? "gerbera-seen" : th.kind;
        const size = def.ballistic ? 5 : th.kind === "shahed" || th.kind === "gerbera" ? 2.2 : 2.6;
        l = { obj: this.take(kind), glow: glowSprite(this.threatColor(th.kind), size, 0.9), kind };
        l.glow.userData.base = size;
        this.scene.add(l.glow);
        this.threats.set(th.id, l);
        if (def.ballistic && !this.ballistic.has(th.id)) this.addArc(th);
      }
      const p = this.threatWorld(th);
      l.obj.position.copy(p);
      l.glow.position.copy(p);
      l.obj.scale.setScalar((l.obj.userData.base as number) * zk);
      l.glow.scale.setScalar((l.glow.userData.base as number) * zk);
      if (def.ballistic) {
        const a = th.path[0], b = th.path[th.path.length - 1];
        const k2 = Math.min(1, th.t + 0.02);
        const next = toWorld({ x: a.x + (b.x - a.x) * k2, y: a.y + (b.y - a.y) * k2 }, UA_Y + Math.sin(Math.PI * k2) * (18 + Math.hypot(b.x - a.x, b.y - a.y) * 0.06) * 0.42 + 0.25);
        const dir = next.sub(p).normalize();
        l.obj.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      } else {
        l.obj.rotation.set(0, th.heading, 0);
        const prop = l.obj.getObjectByName("prop");
        if (prop) prop.rotation.x += 0.9;
      }
      this.trails.push(th.id, p, this.threatColor(th.kind), def.ballistic ? 1.6 : 1);
    }
    for (const s of n.shots) {
      const th = n.threats.find((x) => x.id === s.threat);
      if (s.done || s.t >= s.dur) { if (this.shots.has(s.id)) this.dropShot(s.id); continue; }
      let l = this.shots.get(s.id);
      const mg = s.kind === "mobile" || s.kind === "gepard";
      if (!l) {
        const kind = mg ? "tracer" : s.kind === "drone" ? "drone" : "sam";
        l = { obj: this.take(kind), glow: glowSprite(mg ? 0xffe08a : 0xffd8a0, mg ? 0.6 : 1.6, 0.9), kind };
        this.scene.add(l.glow);
        this.shots.set(s.id, l);
      }
      const from = toWorld(s.from, UA_Y + 0.6);
      const to = th ? this.threatWorld(th) : from;
      const k = Math.min(1, s.t / s.dur);
      const p = from.clone().lerp(to, k);
      p.y += Math.sin(k * Math.PI) * (mg ? 0.3 : 2.5);
      const dir = to.clone().sub(p);
      if (dir.lengthSq() > 1e-6 && !mg) l.obj.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
      l.obj.position.copy(p);
      l.glow.position.copy(p);
      if (!mg) l.obj.scale.setScalar((l.obj.userData.base as number) * zk);
      this.trails.push(100000 + s.id, p, mg ? 0xffe08a : 0xb8dcff, mg ? 0.8 : 1.2);
    }
    for (const [id] of this.ballistic) { const th = n.threats.find((x) => x.id === id); if (!th || th.done) this.dropBallistic(id); }
  }
  private addArc(th: Threat): void {
    const a = th.path[0], b = th.path[th.path.length - 1];
    const pts: THREE.Vector3[] = [];
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    for (let i = 0; i <= 40; i++) { const k = i / 40; pts.push(toWorld({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, UA_Y + Math.sin(Math.PI * k) * (18 + span * 0.06) * 0.42 + 0.25)); }
    const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xff4d4d, dashSize: 0.8, gapSize: 0.8, transparent: true, opacity: 0.7 }));
    arc.computeLineDistances();
    const mark = ringMesh(1.6, 0.3, 0xff3b3b, 0.95);
    mark.position.copy(toWorld(b, UA_Y + 0.1));
    this.scene.add(arc, mark);
    this.ballistic.set(th.id, { arc, mark });
  }

  /** Night events → explosions, flashes, shake. */
  nightEvents(evs: NightEv[]): void {
    for (const e of evs) {
      if (e.type === "kill") {
        const p = toWorld(e.at, UA_Y + (THREATS[e.kind].ballistic ? e.h * 0.42 : e.h * 1.05) + 0.25);
        const big = THREATS[e.kind].ballistic;
        this.airBurst(p, big ? 2.2 : e.kind === "kh101" || e.kind === "kalibr" ? 1.5 : 1);
        if (big) { this.post.flash = Math.max(this.post.flash, 0.35); this.addShake(0.35); }
      } else if (e.type === "impact") {
        if (e.decoyEnd) continue;
        const p = toWorld(e.at, UA_Y + 0.2);
        const big = THREATS[e.kind].ballistic || e.kind === "kh101" || e.kind === "kalibr";
        this.groundBlast(p, big ? 1.8 : 1.1);
        this.burning.push({ at: p.clone(), t: 0, k: big ? 1 : 0.6 });
        this.post.flash = Math.max(this.post.flash, big ? 0.3 : 0.15);
        this.addShake(big ? 0.5 : 0.25);
      }
    }
  }
  strikeEvents(evs: StrikeEv[]): void {
    for (const e of evs) {
      if (e.type === "down") this.airBurst(toWorld(e.at, LAND_Y + 1.4), 1);
      else {
        const p = toWorld(e.at, LAND_Y + 0.3);
        p.x += (Math.random() - 0.5) * 2; p.z += (Math.random() - 0.5) * 2;
        this.groundBlast(p, 2);
        this.post.flash = Math.max(this.post.flash, 0.3);
        this.addShake(0.45);
      }
    }
  }
  /** A big finish on the target when it's knocked out. */
  targetDestroyed(id: string): void {
    const g = this.targets.get(id);
    if (!g) return;
    for (let i = 0; i < 5; i++) {
      const p = g.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0.4, (Math.random() - 0.5) * 3));
      setTimeout(() => this.groundBlast(p, 2.4), i * 220);
    }
    this.post.flash = 0.5;
    this.addShake(0.8);
  }

  private airBurst(p: THREE.Vector3, k: number): void {
    this.fire.emit(Math.round(26 * k), p, { spread: 0.6 * k, up: 1.2, speed: 3.5 * k, size: 0.9 * k, grow: 1.5, life: 0.7, color: [0xffd27a, 0xff8a2a, 0xffffff], grav: -2, drag: 2.5 });
    this.smoke.emit(Math.round(8 * k), p, { spread: 0.8 * k, up: 0.3, speed: 0.8, size: 1.6 * k, grow: 2.2, life: 2.2, color: [0x3d3a3a, 0x55504c], grav: 0.2, drag: 1 });
    this.flash(p, 6 * k, 0.35);
  }
  private groundBlast(p: THREE.Vector3, k: number): void {
    this.fire.emit(Math.round(40 * k), p, { spread: 0.8 * k, up: 3.2 * k, speed: 3 * k, size: 1.1 * k, grow: 1.8, life: 0.9, color: [0xffe0a0, 0xff7a20, 0xff4a10], grav: -3, drag: 1.8 });
    this.smoke.emit(Math.round(14 * k), p, { spread: 1.2 * k, up: 1.6 * k, speed: 1.2, size: 2.2 * k, grow: 2.6, life: 3.2, color: [0x2c2a2a, 0x4a4542], grav: 0.4, drag: 1 });
    this.flash(p, 10 * k, 0.5);
  }
  private flash(p: THREE.Vector3, size: number, max: number): void {
    const s = glowSprite(0xffd8a0, size, 1);
    s.position.copy(p);
    this.scene.add(s);
    this.flashes.push({ s, t: 0, max, size });
  }

  // ================================================================ strike flight

  setFlight(fl: StrikeFlight | null): void {
    this.fl = fl;
    if (!fl) { for (const [id, l] of this.flight) { this.give(l.obj); this.scene.remove(l.glow); this.trails.release(200000 + id); } this.flight.clear(); }
  }
  private syncFlight(): void {
    const fl = this.fl;
    if (!fl) return;
    const weapon = fl.plan.weapon as WeaponId;
    const cruise = weapon !== "liutyi";
    const zk = this.zoomK;
    for (const m of fl.missiles) {
      const gone = m.dead || m.arrived;
      let l = this.flight.get(m.id);
      if (gone || fl.t < m.delay) { if (l) { this.give(l.obj); this.scene.remove(l.glow); this.flight.delete(m.id); this.trails.release(200000 + m.id); } continue; }
      if (!l) {
        const kind = m.decoy ? "decoy" : weapon;
        l = { obj: this.take(kind), glow: glowSprite(m.decoy ? 0xffcf7a : cruise ? 0xffe2b0 : 0xffd060, cruise ? 2.2 : 1.6, 0.85), kind };
        this.scene.add(l.glow);
        this.flight.set(m.id, l);
      }
      const { p, heading } = along(fl.route, m.d);
      const nx = -Math.sin(heading), ny = Math.cos(heading);
      const lane = m.lane * (cruise ? 6 : 9);
      const left = fl.length - m.d;
      const alt = weapon === "atacms" ? Math.sin(Math.PI * Math.min(1, m.d / fl.length)) * 14 + 1 : (cruise ? 1.1 : 1.8) * (left < 30 ? Math.max(0.2, left / 30) : 1);
      const w = toWorld({ x: p.x + nx * lane * (left < 60 ? left / 60 : 1), y: p.y + ny * lane * (left < 60 ? left / 60 : 1) }, LAND_Y + alt + 0.4);
      l.obj.position.copy(w);
      l.glow.position.copy(w);
      l.obj.scale.setScalar((l.obj.userData.base as number) * zk);
      l.obj.rotation.set(0, heading, 0);
      const prop = l.obj.getObjectByName("prop");
      if (prop) prop.rotation.x += 0.9;
      this.trails.push(200000 + m.id, w, m.decoy ? 0xffcf7a : 0xffe7a0, 0.9);
    }
  }

  // ================================================================ frame

  render(dt: number): void {
    this.time += dt;
    this.syncNight();
    this.syncFlight();
    this.fire.update(dt);
    this.smoke.update(dt);
    this.trails.update(dt);
    for (const f of this.flashes) {
      f.t += dt;
      const k = Math.max(0, 1 - f.t / f.max);
      (f.s.material as THREE.SpriteMaterial).opacity = k;
      f.s.scale.setScalar(f.size * (1 + f.t * 2));
      if (k <= 0) this.scene.remove(f.s);
    }
    this.flashes = this.flashes.filter((f) => f.t < f.max);
    // fires that keep burning
    for (const b of this.burning) {
      b.t += dt;
      if (Math.random() < dt * 6 * b.k) this.smoke.emit(1, b.at, { spread: 0.6, up: 1.4, speed: 0.4, size: 1.4 * b.k + 0.4, grow: 2.4, life: 3, color: [0x2c2a2a, 0x3d3836], grav: 0.3, drag: 0.6 });
      if (Math.random() < dt * 5 * b.k && this.mode !== "day") this.fire.emit(1, b.at, { spread: 0.5, up: 0.8, speed: 0.4, size: 0.6, life: 0.6, color: [0xff8a2a, 0xffc060], grav: 0.5 });
    }
    this.burning = this.burning.filter((b) => b.k >= 1 || b.t < 40);
    // power plant smoke where the grid is hurt
    if (this.mode !== "strike") for (const [id, pp] of this.plants) {
      const p = this.sectorPower.get(id) ?? 100;
      if (p < 60 && Math.random() < dt * (60 - p) * 0.06) this.smoke.emit(1, pp.position.clone().add(new THREE.Vector3(0, 1, 0)), { spread: 0.5, up: 1.1, speed: 0.3, size: 1.1, grow: 2.2, life: 2.6, color: [0x3a3634, 0x4c4642], grav: 0.25, drag: 0.6 });
    }
    // the front flickers at night
    if (this.mode === "night" || this.mode === "menu") {
      this.frontFxT -= dt;
      if (this.frontFxT <= 0 && this.frontMesh) {
        this.frontFxT = 0.08 + Math.random() * 0.25;
        const curve = (this.frontMesh.geometry as THREE.TubeGeometry).parameters.path;
        const p = curve.getPointAt(Math.random()).clone();
        p.x += (Math.random() - 0.5) * 1.5; p.z += (Math.random() - 0.5) * 1.5;
        this.fire.emit(4, p, { spread: 0.4, up: 0.8, speed: 0.8, size: 0.5, life: 0.4, color: [0xffb060, 0xff6a20], grav: -1 });
      }
    }
    // pulses
    const pulse = 1 + Math.sin(this.time * 6) * 0.08;
    if (this.selRing.visible) this.selRing.scale.setScalar(1.6 * pulse);
    if (this.targetRing.visible) this.targetRing.scale.setScalar(pulse);
    for (const [, b] of this.ballistic) b.mark.scale.setScalar(1 + ((this.time * 2) % 1) * 0.6);
    for (const [, g] of this.targets) { const d = g.getObjectByName("dish"); if (d) d.rotation.z = this.time * 0.8; }
    this.updateCamera(dt);
    this.post.render(dt);
  }
}

// ================================================================ helpers

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function toonMat(color: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() });
}
function ringMesh(r: number, w: number, color: number, opacity: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.01, r - w), r, 72), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  return m;
}
function insideAny(rings: readonly (readonly (readonly [number, number])[])[] | undefined, x: number, y: number): boolean {
  if (!rings) return false;
  for (const ring of rings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

