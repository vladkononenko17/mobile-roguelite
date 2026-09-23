import {
  Application,
  Color,
  Entity,
  FILLMODE_FILL_WINDOW,
  GAMMA_SRGB,
  RESOLUTION_AUTO,
  TONEMAP_NEUTRAL,
  type RenderComponent,
} from "playcanvas";
import { CameraController } from "./camera/CameraController";
import { CAMERA, CHARACTER, CHARACTERS, LIGHTING, PLAYER, type CharacterId } from "./config";
import { KeyboardMoveInput } from "./input/KeyboardMoveInput";
import { TouchJoystickInput } from "./input/TouchJoystickInput";
import { CombinedMoveInput, type MoveInputSource } from "./input/MoveInput";
import { loadCharacter } from "./player/CharacterLoader";
import { PlayerAnimationController } from "./player/PlayerAnimationController";
import { PlayerController } from "./player/PlayerController";
import { DebugPanel, type TuneParam } from "./ui/DebugPanel";
import { Ground } from "./world/Ground";
import { createContactShadow } from "./world/ContactShadow";
import { CHARACTER_LIGHT_MASK, createLighting } from "./world/Environment";
import { EnvironmentKit } from "./world/kit/EnvironmentKit";
import { buildTestLayout } from "./world/kit/TestLayout";
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
  private contactShadow!: Entity;
  private characterScale: number = CHARACTER.scale;
  private ground!: Ground;
  private kit!: EnvironmentKit;
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
    this.kit = new EnvironmentKit(app);
    this.ground = new Ground(app, this.kit);

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
    // Small textures; they stream in alongside the character download. Needs camera + lights.
    const groundLoaded = this.ground.load();
    const kitLoaded = this.kit.load();
    app.root.addChild(buildTestLayout(this.kit));

    const characterModel = CHARACTERS[this.options.character];
    const character = await loadCharacter(app, `${import.meta.env.BASE_URL}${characterModel.url}`, this.options.onProgress);
    const { min, max } = { min: character.bounds.getMin(), max: character.bounds.getMax() };
    console.info(
      `[Character] ${characterModel.label}: ${character.triangleCount} triangles, bind-pose height ${(max.y - min.y).toFixed(2)} m, ` +
        `feet at y=${min.y.toFixed(3)}; clips: ${character.tracks.map((t) => `${t.name} (${t.duration.toFixed(2)}s)`).join(", ")}`,
    );

    // Player root sits on the ground and owns position/yaw; the GLB hierarchy stays untouched below it.
    const playerRoot = new Entity("Player");
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
    this.player = new PlayerController(playerRoot, this.input, () => this.camera.yawDeg);
    this.camera = new CameraController(cameraEntity, playerRoot, this.player.velocity);
    this.animation = new PlayerAnimationController(character.model, character.tracks, characterModel);
    console.info(`[PlayerAnimation] Idle=${this.animation.clipNames.Idle}, Walk=${this.animation.clipNames.Walk}, Run=${this.animation.clipNames.Run}`);

    this.setCharacterScale(this.characterScale);
    await Promise.all([groundLoaded, kitLoaded]);

    this.debug = new DebugPanel(this.options.debugRoot, this.tuneParams());
    app.on("update", this.update, this);
  }

  private update(rawDt: number): void {
    const dt = Math.min(rawDt, MAX_DT);
    this.resolution.update(rawDt);
    this.player.update(dt);
    this.animation.update(this.player.speed);
    this.camera.update(dt);

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
      { key: "metalTile", label: "Metal m", min: 1, max: 8, step: 0.5, get: () => this.ground.metalTileSize, set: (v) => this.ground.setMetalTileSize(v) },
      { key: "groundBrightness", label: "Ground lum", min: 0.3, max: 1.6, step: 0.05, get: () => this.ground.tint, set: (v) => this.ground.setBrightness(v) },
      { key: "resMax", label: "Res max", min: 0.75, max: 3, step: 0.25, get: () => this.resolution.maxRatio, set: (v) => this.resolution.setMaxRatio(v) },
      { key: "characterScale", label: "Scale", min: 0.7, max: 1.6, step: 0.01, get: () => this.characterScale, set: (v) => this.setCharacterScale(v) },
    ];
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
