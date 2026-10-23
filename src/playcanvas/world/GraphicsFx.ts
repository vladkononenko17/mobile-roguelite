import { CameraFrame, Color, TONEMAP_NEUTRAL, type AppBase, type CameraComponent } from "playcanvas";

/**
 * Graphics experiments, switched on from the URL for side-by-side checks on a real phone
 * (e.g. ?fx=rim,bloom). Nothing here is on by default.
 * - rim:   enemies get the hero's rim and fill lights (silhouettes read against the ground).
 * - bloom: HDR bloom through CameraFrame (muzzle flashes, fire, lava and plasma glow).
 * - grade: per-chapter colour grading through CameraFrame (contrast, saturation, tint).
 * - half:  the 3D scene renders at 75% resolution and is sharpened (the DOM HUD stays sharp).
 */
export const FX: ReadonlySet<string> = new Set(
  (new URLSearchParams(location.search).get("fx") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);

/** Colour grading per chapter: [contrast, saturation, tint rgb]. */
const GRADES: Record<string, [number, number, [number, number, number]]> = {
  outpost: [1.06, 1.1, [1.0, 0.99, 0.97]],
  facility: [1.06, 1.04, [0.98, 1.0, 1.02]],
  hell: [1.05, 1.06, [1.0, 1.0, 1.0]],
};

/** Post-processing for the gameplay camera when an experiment asks for it (else null). */
export function createPostFx(app: AppBase, camera: CameraComponent, biome: string): CameraFrame | null {
  if (!FX.has("bloom") && !FX.has("grade") && !FX.has("half")) return null;
  const frame = new CameraFrame(app, camera);
  frame.rendering.toneMapping = TONEMAP_NEUTRAL;
  // The backbuffer's own MSAA does not apply to the offscreen scene target: ask for it there.
  frame.rendering.samples = FX.has("nomsaa") ? 1 : 4;
  if (FX.has("half")) {
    frame.rendering.renderTargetScale = 0.75;
    frame.rendering.sharpness = 0.5;
  }
  if (FX.has("bloom")) {
    frame.bloom.intensity = 0.012;
    frame.bloom.blurLevel = 6;
  }
  if (FX.has("grade")) {
    const [contrast, saturation, tint] = GRADES[biome] ?? GRADES.outpost;
    frame.grading.enabled = true;
    frame.grading.contrast = contrast;
    frame.grading.saturation = saturation;
    frame.grading.tint = new Color(tint[0], tint[1], tint[2]);
  }
  frame.update();
  return frame;
}
