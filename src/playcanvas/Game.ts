import {
  Application,
  Color,
  Entity,
  FILLMODE_FILL_WINDOW,
  GAMMA_SRGB,
  RESOLUTION_AUTO,
  TONEMAP_ACES,
} from "playcanvas";
import { CameraController } from "./camera/CameraController";
import { ASSETS, CAMERA, LIGHTING, PLAYER, RENDER } from "./config";
import { KeyboardMoveInput } from "./input/KeyboardMoveInput";
import { TouchJoystickInput } from "./input/TouchJoystickInput";
import { CombinedMoveInput, type MoveInputSource } from "./input/MoveInput";
import { loadCharacter } from "./player/CharacterLoader";
import { PlayerAnimationController } from "./player/PlayerAnimationController";
import { PlayerController } from "./player/PlayerController";
import { DebugPanel } from "./ui/DebugPanel";
import { createArena } from "./world/Arena";
import { createLighting } from "./world/Environment";

export interface GameOptions {
  canvas: HTMLCanvasElement;
  debugRoot: HTMLElement;
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
  private debug!: DebugPanel;
  private debugTimer = 0;
  private frames = 0;
  private readonly debugStats = { fps: 0, state: "", clip: "", speed: 0, x: 0, z: 0, yaw: 0 };

  constructor(private readonly options: GameOptions) {
    this.app = new Application(options.canvas, {
      graphicsDeviceOptions: { antialias: true, alpha: false, powerPreference: "high-performance" },
    });
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio);
    this.app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(RESOLUTION_AUTO);
    // Only two directional lights: the non-clustered forward path is cheaper on mobile GPUs.
    this.app.scene.clusteredLightingEnabled = false;
  }

  async start(): Promise<void> {
    const { app } = this;
    window.addEventListener("resize", this.onResize);
    app.start();

    createLighting(app);
    createArena(app);

    const cameraEntity = new Entity("Camera");
    const [r, g, b] = LIGHTING.clearColor;
    cameraEntity.addComponent("camera", {
      clearColor: new Color(r, g, b),
      fov: CAMERA.fovDeg,
      nearClip: CAMERA.nearClip,
      farClip: CAMERA.farClip,
      toneMapping: TONEMAP_ACES,
      gammaCorrection: GAMMA_SRGB,
    });
    app.root.addChild(cameraEntity);

    const character = await loadCharacter(app, `${import.meta.env.BASE_URL}${ASSETS.character}`, this.options.onProgress);
    const { min, max } = { min: character.bounds.getMin(), max: character.bounds.getMax() };
    console.info(
      `[Character] ${character.triangleCount} triangles, bind-pose height ${(max.y - min.y).toFixed(2)} m, ` +
        `feet at y=${min.y.toFixed(3)}; clips: ${character.tracks.map((t) => `${t.name} (${t.duration.toFixed(2)}s)`).join(", ")}`,
    );

    // Player root sits on the ground and owns position/yaw; the GLB hierarchy stays untouched below it.
    const playerRoot = new Entity("Player");
    playerRoot.addChild(character.model);
    app.root.addChild(playerRoot);

    this.input = new CombinedMoveInput([
      new KeyboardMoveInput(PLAYER.walkSpeed / PLAYER.runSpeed),
      new TouchJoystickInput(this.options.canvas),
    ]);
    this.camera = new CameraController(cameraEntity, playerRoot);
    this.player = new PlayerController(playerRoot, this.input, () => this.camera.yawDeg);
    this.animation = new PlayerAnimationController(character.model, character.tracks);
    console.info(`[PlayerAnimation] Idle=${this.animation.clipNames.Idle}, Walk=${this.animation.clipNames.Walk}, Run=${this.animation.clipNames.Run}`);

    this.debug = new DebugPanel(this.options.debugRoot, this.camera.settings);
    app.on("update", this.update, this);
  }

  private update(rawDt: number): void {
    const dt = Math.min(rawDt, MAX_DT);
    this.player.update(dt);
    this.animation.update(this.player.speed);
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
      this.debug.update(stats);
      this.debugTimer = 0;
      this.frames = 0;
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
