import { Quat, Vec3 } from "playcanvas";
import { WEAPONS, type GripFrame, type Vec3Tuple, type WeaponDef, type WeaponGrip, type WeaponId } from "../config";
import type { WeaponHolder } from "../player/WeaponHolder";

interface Slider {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

const POSITION = { min: -0.15, max: 0.15, step: 0.002 };
const ROTATION = { min: -90, max: 90, step: 1 };

/**
 * Tune-panel section for fitting the held weapon without editing source: sliders offset its grips
 * (right grip = where it sits in the WeaponSocket, left grip = the support hand's target, the stock
 * for shoulder-held weapons) or, for weapons without grips, its legacy hand transform. Changes apply
 * live (the weapon is re-equipped from an override); "copy weapon" puts the resulting WEAPONS entry
 * on the clipboard, ready to paste into config.ts. Offsets are relative to the config values and are
 * not saved.
 */
export class WeaponTuner {
  private offsets = new Map<string, number>();
  private id: WeaponId | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly weapons: WeaponHolder,
  ) {}

  /** Rebuilds the sliders for the held weapon (call after the weapon changes). */
  refresh(): void {
    const id = this.weapons.current;
    if (id === this.id) return;
    this.id = id;
    this.offsets = new Map();
    this.root.replaceChildren();
    if (!id) {
      this.root.append(text("div", "tuner-title", "Weapon: none"));
      return;
    }
    const base: WeaponDef = WEAPONS.list[id];
    this.root.append(text("div", "tuner-title", `Weapon: ${base.label} (${base.class}${base.grips ? "" : ", legacy transform"})`));
    const groups: [string, Slider[]][] = [];
    if (base.grips) {
      groups.push(["Right grip / socket", frameSliders("r")]);
      groups.push(["Scale", [{ key: "scale", label: "scale", min: 0.5, max: 2, step: 0.01 }]]);
      if (base.grips.left) groups.push(["Left grip", frameSliders("l")]);
      if (base.stock) groups.push(["Stock", xyz("s", "stock", POSITION)]);
    } else {
      groups.push(["Hand transform", [...xyz("p", "pos", POSITION), ...xyz("o", "rot", ROTATION), { key: "roll", label: "roll", ...ROTATION }, { key: "scale", label: "scale", min: 0.5, max: 2, step: 0.01 }]]);
    }
    for (const [title, sliders] of groups) {
      this.root.append(text("div", "tuner-group", title));
      const grid = document.createElement("div");
      grid.className = "tuner-grid";
      for (const slider of sliders) grid.append(this.slider(slider));
      this.root.append(grid);
    }
    const actions = document.createElement("div");
    actions.className = "actions";
    const copy = button("copy weapon", () => {
      navigator.clipboard?.writeText(this.configText()).catch(() => undefined);
      output.textContent = this.configText();
    });
    const reset = button("reset weapon", () => {
      this.id = null;
      this.weapons.setOverride(id, null);
      this.refresh();
    });
    actions.append(copy, reset);
    const output = text("pre", "tuner-output", "");
    this.root.append(actions, output);
  }

  private slider({ key, label, min, max, step }: Slider): HTMLElement {
    const row = document.createElement("label");
    const name = text("span", "", label);
    const value = text("span", "value", "");
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const initial = key === "scale" ? 1 : 0;
    input.value = String(initial);
    const show = () => (value.textContent = Number(input.value).toFixed(step >= 1 ? 0 : 3));
    show();
    input.addEventListener("input", () => {
      this.offsets.set(key, Number(input.value));
      show();
      this.apply();
    });
    row.append(name, input, value);
    return row;
  }

  private get(key: string, fallback = 0): number {
    return this.offsets.get(key) ?? fallback;
  }

  /** The tuned definition: config values plus the slider offsets. */
  private tuned(): WeaponDef | null {
    if (!this.id) return null;
    const base: WeaponDef = WEAPONS.list[this.id];
    const def: WeaponDef = { ...base, scale: round((base.scale ?? 1) * this.get("scale", 1)) };
    if (base.grips) {
      def.grips = {
        right: this.tuneGrip(base.grips.right, "r"),
        left: base.grips.left ? this.tuneGrip(base.grips.left, "l") : undefined,
      };
      if (base.stock) def.stock = add(base.stock, [this.get("sx"), this.get("sy"), this.get("sz")]);
    } else {
      def.position = add(base.position, [this.get("px"), this.get("py"), this.get("pz")]);
      def.rotation = add(base.rotation, [this.get("ox"), this.get("oy"), this.get("oz")]);
      def.rollDeg = round(base.rollDeg + this.get("roll"));
    }
    return def;
  }

  private tuneGrip(grip: WeaponGrip, prefix: string): WeaponGrip {
    const rotation = new Quat().setFromEulerAngles(this.get(`${prefix}rx`), this.get(`${prefix}ry`), this.get(`${prefix}rz`));
    const turn = (v: Vec3Tuple): Vec3Tuple => {
      const r = rotation.transformVector(new Vec3(v[0], v[1], v[2]));
      return [round(r.x), round(r.y), round(r.z)];
    };
    const frame: GripFrame = {
      position: add(grip.position, [this.get(`${prefix}x`), this.get(`${prefix}y`), this.get(`${prefix}z`)]),
      axis: turn(grip.axis),
      palm: turn(grip.palm),
    };
    return { ...grip, ...frame };
  }

  private apply(): void {
    const def = this.tuned();
    if (this.id && def) this.weapons.setOverride(this.id, def);
  }

  /** The tuned entry as TypeScript for WEAPONS.list in config.ts. */
  private configText(): string {
    const def = this.tuned();
    if (!this.id || !def) return "";
    const v = (t: Vec3Tuple) => `[${t.map((n) => round(n)).join(", ")}]`;
    const grip = (g: WeaponGrip) =>
      `{ position: ${v(g.position)}, axis: ${v(g.axis)}, palm: ${v(g.palm)}, radius: ${g.radius}${g.rollRangeDeg !== undefined ? `, rollRangeDeg: ${g.rollRangeDeg}` : ""} }`;
    const lines = [
      `${this.id}: {`,
      `  label: ${JSON.stringify(def.label)}, class: "${def.class}", node: ${JSON.stringify(def.node)}, position: ${v(def.position)}, rotation: ${v(def.rotation)}, rollDeg: ${def.rollDeg}, attack: ${JSON.stringify(def.attack)},`,
    ];
    if (def.scale !== undefined && def.scale !== 1) lines.push(`  scale: ${def.scale},`);
    if (def.grips) {
      lines.push("  grips: {", `    right: ${grip(def.grips.right)},`);
      if (def.grips.left) lines.push(`    left: ${grip(def.grips.left)},`);
      lines.push("  },");
    }
    if (def.stock) lines.push(`  stock: ${v(def.stock)},`);
    lines.push("},");
    return lines.join("\n");
  }
}

function frameSliders(prefix: string): Slider[] {
  return [...xyz(prefix, "pos", POSITION), ...xyz(`${prefix}r`, "rot", ROTATION)];
}

function xyz(prefix: string, label: string, range: { min: number; max: number; step: number }): Slider[] {
  return ["x", "y", "z"].map((axis) => ({ key: `${prefix}${axis}`, label: `${label} ${axis}`, ...range }));
}

function add(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [round(a[0] + b[0]), round(a[1] + b[1]), round(a[2] + b[2])];
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function text(tag: string, className: string, content: string): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = content;
  return el;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}
