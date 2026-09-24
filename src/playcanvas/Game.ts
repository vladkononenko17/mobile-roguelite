import {
  Application,
  Color,
  Entity,
  FILLMODE_FILL_WINDOW,
  GAMMA_SRGB,
  RESOLUTION_AUTO,
  TONEMAP_NEUTRAL,
  FOG_LINEAR,
  FOG_NONE,
  type RenderComponent,
} from "playcanvas";
import { CameraController } from "./camera/CameraController";
import { CAMERA, CHARACTER, CHARACTERS, DEBUG, DEFAULT_WEAPON, LIGHTING, OUTPOST, PLAYER, WEAPONS, type CharacterId, type WeaponId } from "./config";
import { KeyboardMoveInput } from "./input/KeyboardMoveInput";
import { TouchJoystickInput } from "./input/TouchJoystickInput";
import { CombinedMoveInput, type MoveInputSource } from "./input/MoveInput";
import { loadCharacter } from "./player/CharacterLoader";
import { LeftHandIK } from "./player/LeftHandIK";
import { PlayerAnimationController } from "./player/PlayerAnimationController";
import { PlayerController } from "./player/PlayerController";
import { WeaponHolder } from "./player/WeaponHolder";
import { DebugPanel, type TuneParam } from "./ui/DebugPanel";
import { Ground } from "./world/Ground";
import { createContactShadow } from "./world/ContactShadow";
import { CHARACTER_LIGHT_MASK, createLighting } from "./world/Environment";
import { ColliderDebugView } from "./world/collision/ColliderDebugView";
import { CollisionWorld } from "./world/collision/CollisionWorld";
import { BOUNDS, buildOutpostLevel, GROUND_SPEC, SPAWN } from "./world/level/OutpostLevel";
import { ModelKit } from "./world/props/ModelKit";
import { OUTPOST_MODELS, type OutpostModel } from "./world/props/OutpostKit";
import { ResolutionGovernor } from "./perf/ResolutionGovernor";

export interface GameOptions {
  canvas: HTMLCanvasElement;
  debugRoot: HTMLElement;
  character: CharacterId;
  onProgress: (loaded: number, total: number) => void;
}

/** Longest frame step we simulate; avoids teleporting after a background tab resumes. */
const MAX_DT = 1 / 15;
const DEBUG_INTERVAL = 0.25;

/** Bootstraps the PlayCanvas app, builds the arena and wires the player systems together. */
export class Game {
  readonly app: Application;
  player!: PlayerController;
  animation!: PlayerAnimationController;
  camera!: CameraController;

  private input!: MoveInputSource;
  private model!: Entity;
  private leftHandIK: LeftHandIK | null = null;
  weapons!: WeaponHolder;
  private contactShadow!: Entity;
  private characterScale: number = CHARACTER.scale;
  private ground!: Ground;
  private kit!: ModelKit<OutpostModel>;
  readonly collision = new CollisionWorld();
  colliderDebug!: ColliderDebugView;
  private resolution!: ResolutionGovernor;
  private debug!: DebugPanel;
  private debugTimer = 0;
  private frames = 0;
  private readonly debugStats = { fps: 0, state: "", clip: "", speed: 0, x: 0, z: 0, yaw: 0, pixelRatio: 1, width: 0, height: 0, drawCalls: 0, triangles: 0, shadowCalls: 0 };

  constructor(private readonly options: GameOptions) {
    this.app = new Application(options.canvas, {
      graphicsDeviceOptions: { antialias: true, alpha: false, powerPreference: "high-performance" },
    });
    this.app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(RESOLUTION_AUTO);
    // Only two directional lights: the non-clustered forward path is cheaper on mobile GPUs.
    this.app.scene.clusteredLightingEnabled = false;
  }

  async start(): Promise<void> {
    const { app } = this;
    window.addEventListener("resize", this.onResize);
    app.start();

    this.resolution = new ResolutionGovernor(app);
    createLighting(app);
    this.kit = new ModelKit(app, OUTPOST_MODELS, { name: "Outpost", batchCellMetres: OUTPOST.batchCellMetres, brightness: OUTPOST.brightness });
    this.ground = new Ground(app, GROUND_SPEC);

    const cameraEntity = new Entity("Camera");
    const [r, g, b] = LIGHTING.clearColor;
    cameraEntity.addComponent("camera", {
      clearColor: new Color(r, g, b),
      fov: CAMERA.fovDeg,
      nearClip: CAMERA.nearClip,
      farClip: CAMERA.farClip,
      // Neutral keeps hue and saturation of the armour and yellow accents better than ACES.
      toneMapping: TONEMAP_NEUTRAL,
      gammaCorrection: GAMMA_SRGB,
    });
    app.root.addChild(cameraEntity);
    // The ground is painted procedurally (no download). Needs camera + lights.
    const groundLoaded = this.ground.load();
    // The environment kit (~3 MB) downloads alongside the character; the level is built from it and
    // every placed model that declared itself solid joins the static collision world.
    const levelLoaded = this.kit.load(`${import.meta.env.BASE_URL}${OUTPOST.url}`).then(
      () => {
        const layout = buildOutpostLevel(this.kit);
        app.root.addChild(layout);
        this.collision.addStaticFrom(layout);
      },
      (error: unknown) => console.error("[Level] environment kit failed to load.", error),
    );

    // Weapons (~1.5 MB) download alongside the character; a failure only leaves the hands empty.
    this.weapons = new WeaponHolder(app);
    const weaponsLoaded = this.weapons.load(`${import.meta.env.BASE_URL}${WEAPONS.url}`).catch((error: unknown) =>
      console.warn("[Weapons] not loaded.", error),
    );

    const characterModel = CHARACTERS[this.options.character];
    const character = await loadCharacter(app, `${import.meta.env.BASE_URL}${characterModel.url}`, this.options.onProgress);
    const { min, max } = { min: character.bounds.getMin(), max: character.bounds.getMax() };
    console.info(
      `[Character] ${characterModel.label}: ${character.triangleCount} triangles, bind-pose height ${(max.y - min.y).toFixed(2)} m, ` +
        `feet at y=${min.y.toFixed(3)}; clips: ${character.tracks.map((t) => `${t.name} (${t.duration.toFixed(2)}s)`).join(", ")}`,
    );

    // Player root sits on the ground and owns position/yaw; the GLB hierarchy stays untouched below it.
    const playerRoot = new Entity("Player");
    playerRoot.setPosition(SPAWN.x, 0, SPAWN.z);
    playerRoot.setEulerAngles(0, SPAWN.yawDeg, 0);
    playerRoot.addChild(character.model);
    this.contactShadow = createContactShadow(app);
    playerRoot.addChild(this.contactShadow);
    app.root.addChild(playerRoot);
    this.model = character.model;
    // Fill and rim lights are masked to the hero only.
    for (const render of character.model.findComponents("render") as RenderComponent[]) {
      for (const meshInstance of render.meshInstances) meshInstance.mask |= CHARACTER_LIGHT_MASK;
    }

    this.input = new CombinedMoveInput([
      new KeyboardMoveInput(PLAYER.walkSpeed / PLAYER.runSpeed),
      new TouchJoystickInput(this.options.canvas),
    ]);
    this.player = new PlayerController(playerRoot, this.input, () => this.camera.yawDeg, this.collision);
    this.camera = new CameraController(cameraEntity, playerRoot, this.player.velocity);
    this.animation = new PlayerAnimationController(character.model, character.tracks, characterModel);
    console.info(`[PlayerAnimation] Idle=${this.animation.clipNames.Idle}, Walk=${this.animation.clipNames.Walk}, Run=${this.animation.clipNames.Run}`);

    this.setCharacterScale(this.characterScale);
    await Promise.all([groundLoaded, levelLoaded, weaponsLoaded]);
    this.weapons.onPoseChange = (clip) => this.animation.setUpperBodyPose(clip);
    // Attack: Space, or the on-screen button (shown only when the weapon has an attack clip).
    const attackButton = document.querySelector<HTMLElement>("[data-attack]");
    this.weapons.onChange = () => attackButton?.classList.toggle("hidden", !this.weapons.attackClip);
    const attack = () => {
      const clip = this.weapons.attackClip;
      if (clip && !this.animation.acting) this.animation.playAction(clip);
    };
    attackButton?.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      event.preventDefault();
      attack();
    });
    window.addEventListener("keydown", (event) => { if (event.code === "Space") attack(); });
    this.weapons.attachTo(character.model);
    this.leftHandIK = new LeftHandIK(character.model);
    this.setupWeaponSelect();

    this.colliderDebug = new ColliderDebugView(app, this.collision, playerRoot, () => this.player.radius);
    this.colliderDebug.enabled = DEBUG.DEBUG_COLLIDERS || new URLSearchParams(location.search).get("colliders") === "1";
    this.options.debugRoot.querySelector("[data-colliders]")?.addEventListener("click", () => {
      this.colliderDebug.enabled = !this.colliderDebug.enabled;
    });
    this.player.bounds = BOUNDS;

    // DEV MAP VIEW: tune panel button, the M key, or ?map=1.
    this.options.debugRoot.querySelector("[data-mapview]")?.addEventListener("click", () => this.setMapView(!this.camera.mapView));
    window.addEventListener("keydown", (event) => { if (event.code === "KeyM") this.setMapView(!this.camera.mapView); });
    if (new URLSearchParams(location.search).get("map") === "1") this.setMapView(true);

    this.debug = new DebugPanel(this.options.debugRoot, this.tuneParams());
    app.on("update", this.update, this);
  }

  private update(rawDt: number): void {
    const dt = Math.min(rawDt, MAX_DT);
    this.resolution.update(rawDt);
    this.player.update(dt);
    this.animation.update(this.player.speed, dt);
    // After the anim system has posed the skeleton this frame: left hand onto the weapon.
    this.leftHandIK?.apply(this.weapons.socket("leftHandGrip"), this.animation.upperBodyWeight);
    const device = this.app.graphicsDevice;
    this.camera.update(dt, device.width / Math.max(1, device.height));

    this.frames++;
    this.debugTimer += rawDt;
    if (this.debugTimer >= DEBUG_INTERVAL) {
      const stats = this.debugStats;
      const position = this.player.entity.getPosition();
      stats.fps = this.frames / this.debugTimer;
      stats.state = this.animation.state;
      stats.clip = this.animation.clipNames[this.animation.state];
      stats.speed = this.player.speed;
      stats.x = position.x;
      stats.z = position.z;
      stats.yaw = this.player.yawDeg;
      const device = this.app.graphicsDevice;
      const engine = this.app.stats;
      stats.pixelRatio = this.resolution.pixelRatio;
      stats.width = device.width;
      stats.height = device.height;
      stats.drawCalls = engine.drawCalls.total;
      stats.shadowCalls = engine.drawCalls.shadow;
      stats.triangles = engine.frame.triangles;
      this.debug.update(stats);
      this.debugTimer = 0;
      this.frames = 0;
    }
  }

  /** Scales the GLB root uniformly; camera pivot and stride matching follow the new size. */
  private setCharacterScale(scale: number): void {
    this.characterScale = scale;
    this.model.setLocalScale(scale, scale, scale);
    this.contactShadow.setLocalScale(1.1 * scale, 1, 1.1 * scale);
    this.camera.pivotHeight = CAMERA.pivotHeight * scale;
    this.animation.strideScale = scale;
    this.player.radius = PLAYER.colliderRadius * scale;
    this.colliderDebug?.update();
  }

  private tuneParams(): TuneParam[] {
    const camera = this.camera;
    const settings = camera.settings;
    return [
      { key: "pitchDeg", label: "Pitch°", min: 35, max: 80, step: 1, get: () => settings.pitchDeg, set: (v) => (settings.pitchDeg = v) },
      { key: "distance", label: "Distance", min: 4, max: 20, step: 0.1, get: () => settings.distance, set: (v) => (settings.distance = v) },
      { key: "height", label: "Height", min: 3, max: 18, step: 0.1, get: () => camera.height, set: (v) => (camera.height = v), derived: true },
      { key: "fovDeg", label: "FOV°", min: 25, max: 70, step: 1, get: () => settings.fovDeg, set: (v) => (settings.fovDeg = v) },
      { key: "screenOffset", label: "Offset", min: -0.1, max: 0.3, step: 0.01, get: () => settings.screenOffset, set: (v) => (settings.screenOffset = v) },
      { key: "followSharpness", label: "Follow", min: 1, max: 30, step: 0.5, get: () => settings.followSharpness, set: (v) => (settings.followSharpness = v) },
      { key: "lookAheadTime", label: "Lead s", min: 0, max: 0.6, step: 0.05, get: () => settings.lookAheadTime, set: (v) => (settings.lookAheadTime = v) },
      { key: "groundTile", label: "Ground m", min: 1, max: 12, step: 0.5, get: () => this.ground.tileSize, set: (v) => this.ground.setTileSize(v) },
      { key: "rockTile", label: "Rock m", min: 1, max: 12, step: 0.5, get: () => this.ground.rockTileSize, set: (v) => this.ground.setRockTileSize(v) },
      { key: "groundBrightness", label: "Ground lum", min: 0.3, max: 1.6, step: 0.05, get: () => this.ground.tint, set: (v) => this.ground.setBrightness(v) },
      { key: "resMax", label: "Res max", min: 0.75, max: 3, step: 0.25, get: () => this.resolution.maxRatio, set: (v) => this.resolution.setMaxRatio(v) },
      { key: "characterScale", label: "Scale", min: 0.7, max: 1.6, step: 0.01, get: () => this.characterScale, set: (v) => this.setCharacterScale(v) },
    ];
  }

  /**
   * DEV MAP VIEW: frames the whole level from above for layout inspection. Fog is lifted and the
   * sun's shadow range stretched to cover it; both return to gameplay values when switched off.
   * The player can still be moved while it is on.
   */
  /** Tune-panel weapon picker; ?weapon=<id|none> wins, then the last choice in this browser. */
  private setupWeaponSelect(): void {
    const KEY = "dustline3d.weapon";
    const isWeapon = (value: string | null): value is WeaponId => value !== null && value in WEAPONS.list;
    const fromUrl = new URLSearchParams(location.search).get("weapon");
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
    const pick = fromUrl ?? saved;
    const initial: WeaponId | null = pick === "none" ? null : isWeapon(pick) ? pick : DEFAULT_WEAPON;
    this.weapons.equip(initial);

    const select = this.options.debugRoot.querySelector<HTMLSelectElement>("[data-weapon]");
    if (!select) return;
    select.add(new Option("None", "none", false, initial === null));
    for (const [id, weapon] of Object.entries(WEAPONS.list)) select.add(new Option(weapon.label, id, false, id === initial));
    select.addEventListener("change", () => {
      try { localStorage.setItem(KEY, select.value); } catch { /* storage unavailable */ }
      this.weapons.equip(isWeapon(select.value) ? select.value : null);
    });
  }

  setMapView(on: boolean): void {
    const sun = (this.app.root.findByName("Sun") as Entity).light!;
    if (on) {
      this.camera.mapView = {
        centreX: (BOUNDS.minX + BOUNDS.maxX) / 2,
        centreZ: (BOUNDS.minZ + BOUNDS.maxZ) / 2,
        width: BOUNDS.maxX - BOUNDS.minX + 3,
        depth: BOUNDS.maxZ - BOUNDS.minZ + 3,
      };
      this.app.scene.fog.type = FOG_NONE;
      sun.shadowDistance = 110;
    } else {
      this.camera.mapView = null;
      this.app.scene.fog.type = FOG_LINEAR;
      sun.shadowDistance = LIGHTING.sun.shadowDistance;
    }
  }

  private readonly onResize = (): void => {
    this.app.resizeCanvas();
  };

  destroy(): void {
    window.removeEventListener("resize", this.onResize);
    this.input?.destroy();
    this.app.destroy();
  }
}
