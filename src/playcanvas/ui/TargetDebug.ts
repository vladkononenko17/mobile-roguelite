import type { TargetingDebug } from "../gameplay/PlayerGun";

const CSS = `
#target-debug { position: fixed; inset: 0; pointer-events: none; z-index: 4; display: none; font: 600 10px/1.2 ui-monospace, monospace; color: #9fe8ff; }
body.debug-on #target-debug, #target-debug.forced { display: block; }
#target-debug .view { position: absolute; border: 1px dashed rgba(120, 220, 255, 0.8); }
#target-debug .mark { position: absolute; width: 22px; height: 22px; margin: -12px 0 0 -12px; border: 2px solid #ff5a3c; border-radius: 50%; box-shadow: 0 0 0 1px #000; }
#target-debug .info { position: absolute; transform: translate(14px, -6px); white-space: nowrap; text-shadow: 0 1px 2px #000; color: #ffd0c4; }
#target-debug .none { position: absolute; left: 50%; bottom: 12%; transform: translateX(-50%); color: rgba(159, 232, 255, 0.8); text-shadow: 0 1px 2px #000; }
`;

/**
 * DEV ONLY: draws the auto-aim combat viewport (dashed box), a ring on the current target with its
 * screen position and distance, or "no target". Shown only with the debug gear on or `?targets=1`;
 * never in normal play.
 */
export class TargetDebug {
  private readonly root = document.createElement("div");
  private readonly view = document.createElement("div");
  private readonly mark = document.createElement("div");
  private readonly info = document.createElement("div");
  private readonly none = document.createElement("div");

  constructor() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);
    this.root.id = "target-debug";
    this.view.className = "view";
    this.mark.className = "mark";
    this.info.className = "info";
    this.none.className = "none";
    this.none.textContent = "no target";
    this.root.append(this.view, this.mark, this.info, this.none);
    document.body.append(this.root);
    if (new URLSearchParams(location.search).get("targets") === "1") this.root.classList.add("forced");
  }

  private get visible(): boolean {
    return this.root.classList.contains("forced") || document.body.classList.contains("debug-on");
  }

  update(d: TargetingDebug): void {
    if (!this.visible) return;
    Object.assign(this.view.style, { left: `${d.left}px`, top: `${d.top}px`, width: `${d.right - d.left}px`, height: `${d.bottom - d.top}px` });
    const t = d.target;
    this.mark.style.display = this.info.style.display = t ? "block" : "none";
    this.none.style.display = t ? "none" : "block";
    if (!t) return;
    this.mark.style.left = this.info.style.left = `${t.x}px`;
    this.mark.style.top = this.info.style.top = `${t.y}px`;
    this.info.textContent = `${t.label} (${Math.round(t.x)}, ${Math.round(t.y)}) ${t.distance.toFixed(1)} m`;
  }
}
