import { Mat4, Vec3, Vec4, type CameraComponent } from "playcanvas";

/**
 * World -> screen projection for gameplay code, refreshed once per frame. CameraComponent's
 * worldToScreen() reads canvas.getBoundingClientRect() on every call; after the HUD has written to
 * the DOM that forces a synchronous layout per call (per enemy, per damage number), which is costly on
 * mobile Safari. This reads the canvas size once per frame (refresh(), before any DOM writes) and
 * projects with the camera's current view-projection matrix (so it is never a frame stale either).
 */
export class ScreenProjector {
  /** Canvas size in CSS pixels. */
  width = 1;
  height = 1;
  private readonly viewProjection = new Mat4();
  private readonly v = new Vec4();

  constructor(private readonly camera: CameraComponent) {}

  /** Call once per frame, before the HUD writes to the DOM. */
  refresh(): void {
    const rect = this.camera.system.app.graphicsDevice.clientRect;
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.viewProjection.mul2(this.camera.projectionMatrix, this.camera.viewMatrix);
  }

  /**
   * Normalised screen position of `p`: x 0..1 left to right, y 0..1 top to bottom (outside that range
   * = off-screen); z > 0 when in front of the camera.
   */
  normalized(p: Vec3, out: Vec3): Vec3 {
    const v = this.v.set(p.x, p.y, p.z, 1);
    this.viewProjection.transformVec4(v, v);
    const w = v.w;
    if (Math.abs(w) < 1e-6) return out.set(-1, -1, -1);
    return out.set((v.x / w) * 0.5 + 0.5, 0.5 - (v.y / w) * 0.5, w);
  }

  /** Screen position of `p` in CSS pixels (z > 0 when in front of the camera). */
  toScreen(p: Vec3, out: Vec3): Vec3 {
    this.normalized(p, out);
    return out.set(out.x * this.width, out.y * this.height, out.z);
  }
}
