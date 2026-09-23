import type { CameraSettings } from "../camera/CameraController";

interface DebugStats {
  fps: number;
  state: string;
  clip: string;
  speed: number;
  x: number;
  z: number;
  yaw: number;
}

const SLIDERS: { key: keyof CameraSettings; label: string; min: number; max: number; step: number }[] = [
  { key: "pitchDeg", label: "Pitch", min: 30, max: 85, step: 1 },
  { key: "height", label: "Height", min: 4, max: 25, step: 0.1 },
  { key: "distance", label: "Distance", min: 0, max: 20, step: 0.1 },
  { key: "fovDeg", label: "FOV", min: 20, max: 75, step: 1 },
];

/**
 * Small readout plus live camera sliders for judging framing in the browser. Values edited here
 * are not persisted; copy them into `config.ts` once they look right.
 */
export class DebugPanel {
  private readonly stats: HTMLElement;
  private lastText = "";

  constructor(root: HTMLElement, camera: CameraSettings) {
    this.stats = root.querySelector<HTMLElement>("[data-stats]")!;
    const sliders = root.querySelector<HTMLElement>("[data-sliders]")!;
    const output = root.querySelector<HTMLElement>("[data-output]")!;
    const printConfig = () => {
      output.textContent = `pitchDeg: ${camera.pitchDeg}, height: ${camera.height}, distance: ${camera.distance}, fovDeg: ${camera.fovDeg}`;
    };
    for (const slider of SLIDERS) {
      const label = document.createElement("label");
      const value = document.createElement("span");
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(slider.min);
      input.max = String(slider.max);
      input.step = String(slider.step);
      input.value = String(camera[slider.key]);
      value.textContent = input.value;
      input.addEventListener("input", () => {
        camera[slider.key] = Number(input.value);
        value.textContent = input.value;
        printConfig();
      });
      label.append(slider.label, input, value);
      sliders.append(label);
    }
    printConfig();
    root.querySelector("[data-toggle]")!.addEventListener("click", () => root.classList.toggle("collapsed"));
  }

  update(stats: DebugStats): void {
    const text = `${stats.fps.toFixed(0)} fps · ${stats.state} (${stats.clip}) · ${stats.speed.toFixed(2)} m/s\n` +
      `pos ${stats.x.toFixed(1)}, ${stats.z.toFixed(1)} · yaw ${stats.yaw.toFixed(0)}°`;
    // Avoid DOM writes (and layout) on frames where nothing visible changed.
    if (text !== this.lastText) {
      this.stats.textContent = text;
      this.lastText = text;
    }
  }
}
