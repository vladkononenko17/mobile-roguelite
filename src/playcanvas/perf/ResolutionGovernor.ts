import type { AppBase } from "playcanvas";
import { RENDER } from "../config";

/**
 * Dynamic resolution. Pixel shading is the main cost of this scene on phones (a 3x iPhone has
 * ~2.5M backbuffer pixels at devicePixelRatio 2), so when the frame rate stays low the render
 * resolution steps down, and it steps back up when there is headroom. Measured over windows of
 * frames, with hysteresis, so it does not oscillate.
 */
export class ResolutionGovernor {
  /** Upper bound (tune panel "Res max"); never above the display's real pixel ratio. */
  maxRatio: number;
  private ratio: number;
  private elapsed = 0;
  private frames = 0;
  private settle = 0;

  constructor(private readonly app: AppBase) {
    this.maxRatio = Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio);
    this.ratio = this.maxRatio;
    this.apply();
  }

  get pixelRatio(): number {
    return this.ratio;
  }

  setMaxRatio(value: number): void {
    this.maxRatio = Math.min(value, window.devicePixelRatio || 1);
    this.ratio = Math.min(this.ratio, this.maxRatio);
    if (!RENDER.dynamicResolution) this.ratio = this.maxRatio;
    this.apply();
  }

  update(dt: number): void {
    if (!RENDER.dynamicResolution) return;
    // Ignore the first frames after a change while shaders compile and the GPU settles.
    if (this.settle > 0) {
      this.settle -= dt;
      return;
    }
    this.elapsed += dt;
    this.frames++;
    if (this.elapsed < RENDER.governorWindowSeconds) return;
    const fps = this.frames / this.elapsed;
    this.elapsed = 0;
    this.frames = 0;
    if (fps < RENDER.governorLowFps && this.ratio > RENDER.minPixelRatio) {
      this.ratio = Math.max(RENDER.minPixelRatio, this.ratio - RENDER.governorStep);
      this.apply();
    } else if (fps > RENDER.governorHighFps && this.ratio < this.maxRatio) {
      this.ratio = Math.min(this.maxRatio, this.ratio + RENDER.governorStep);
      this.apply();
    }
  }

  private apply(): void {
    this.app.graphicsDevice.maxPixelRatio = this.ratio;
    this.app.resizeCanvas();
    this.settle = 1;
  }
}
