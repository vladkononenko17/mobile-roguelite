export interface DebugStats {
  fps: number;
  state: string;
  clip: string;
  speed: number;
  x: number;
  z: number;
  yaw: number;
}

export interface TuneParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  get(): number;
  set(value: number): void;
  /** Derived values are shown and editable but not saved (they are recomputed from others). */
  derived?: boolean;
}

const STORAGE_KEY = "dustline3d.tune.v2";

function decimals(step: number): number {
  return step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
}

/**
 * Stats readout plus live tuning sliders. Values persist in this browser (so a phone keeps its
 * tuning across reloads); "copy" puts them on the clipboard for pasting into `config.ts`.
 */
export class DebugPanel {
  private readonly stats: HTMLElement;
  private readonly output: HTMLElement;
  private readonly rows: { param: TuneParam; input: HTMLInputElement; value: HTMLElement }[] = [];
  private readonly defaults = new Map<string, number>();
  private lastText = "";

  constructor(private readonly root: HTMLElement, params: TuneParam[]) {
    this.stats = root.querySelector<HTMLElement>("[data-stats]")!;
    this.output = root.querySelector<HTMLElement>("[data-output]")!;
    const sliders = root.querySelector<HTMLElement>("[data-sliders]")!;

    for (const param of params) {
      this.defaults.set(param.key, param.get());
      const label = document.createElement("label");
      const name = document.createElement("span");
      const value = document.createElement("span");
      const input = document.createElement("input");
      name.textContent = param.label;
      value.className = "value";
      input.type = "range";
      input.min = String(param.min);
      input.max = String(param.max);
      input.step = String(param.step);
      input.addEventListener("input", () => {
        param.set(Number(input.value));
        this.refresh(param);
        this.save();
      });
      label.append(name, input, value);
      sliders.append(label);
      this.rows.push({ param, input, value });
    }

    this.load();
    this.refresh();
    root.querySelector("[data-toggle]")!.addEventListener("click", () => root.classList.toggle("collapsed"));
    root.querySelector("[data-reset]")!.addEventListener("click", () => this.reset());
    root.querySelector("[data-copy]")!.addEventListener("click", () => {
      navigator.clipboard?.writeText(this.output.textContent ?? "").catch(() => undefined);
    });
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

  /** Re-reads every slider from its getter; one parameter can change another (height/distance). */
  private refresh(skip?: TuneParam): void {
    for (const { param, input, value } of this.rows) {
      const current = param.get();
      const text = current.toFixed(decimals(param.step));
      if (param !== skip) input.value = String(current);
      value.textContent = text;
    }
    this.output.textContent = this.rows
      .map(({ param }) => `${param.key}: ${Number(param.get().toFixed(decimals(param.step)))}`)
      .join(", ");
  }

  private reset(): void {
    // Apply defaults of the saved (non-derived) parameters; derived ones follow from them.
    for (const { param } of this.rows) if (!param.derived) param.set(this.defaults.get(param.key)!);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
    this.refresh();
  }

  private save(): void {
    const values: Record<string, number> = {};
    for (const { param } of this.rows) if (!param.derived) values[param.key] = param.get();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch { /* storage unavailable */ }
  }

  private load(): void {
    let values: Record<string, unknown> = {};
    try { values = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return; }
    for (const { param } of this.rows) {
      const value = values[param.key];
      if (!param.derived && typeof value === "number" && Number.isFinite(value)) param.set(value);
    }
    if (Object.keys(values).length > 0) this.root.dataset.tuned = "true";
  }
}
