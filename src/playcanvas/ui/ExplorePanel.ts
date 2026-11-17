// EXPLORE MODE (?explore=1): walk a whole chapter with no enemies, no gates and no timer, to check
// the map, its textures and its edges. A small panel jumps between zones, speeds the hero up, lets
// him walk through walls, zooms the camera or shows the whole map from above, and hides the HUD for
// clean screenshots. Nothing is saved from an explore session. Players never see it.

export const EXPLORE: boolean = new URLSearchParams(location.search).get("explore") === "1";

export interface ExploreOptions {
  zones: { id: string; label: string }[];
  onZone: (id: string) => void;
  onSpeed: (mult: number) => void;
  onGhost: (on: boolean) => void;
  onHud: (shown: boolean) => void;
  onMap: (on: boolean) => void;
  onZoom: (dir: -1 | 1) => void;
}

const CSS = `
#explore { position: fixed; left: 8px; top: calc(env(safe-area-inset-top, 0px) + 116px); z-index: 60; font: 600 12px/1.2 system-ui, sans-serif; color: #f3ead8; user-select: none; -webkit-user-select: none; }
#explore .tab { display: inline-flex; gap: 6px; align-items: center; padding: 7px 10px; border-radius: 10px; background: rgba(20,16,12,.82); border: 1px solid rgba(140,220,255,.45); cursor: pointer; }
#explore .tab b { color: #8fd8ff; }
#explore .body { display: none; margin-top: 6px; padding: 8px; width: min(300px, calc(100vw - 32px)); max-height: calc(100vh - 200px); overflow-y: auto; border-radius: 12px; background: rgba(20,16,12,.9); border: 1px solid rgba(140,220,255,.3); }
#explore.open .body { display: block; }
#explore h4 { margin: 8px 2px 5px; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #bfae8e; }
#explore h4:first-child { margin-top: 0; }
#explore .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; }
#explore .row { display: flex; gap: 5px; }
#explore .row button { flex: 1; text-align: center; }
#explore button { font: inherit; color: inherit; padding: 7px 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); text-align: left; cursor: pointer; }
#explore button.on { background: #8fd8ff; color: #10161c; border-color: #8fd8ff; }
#explore .hint { margin-top: 7px; font-weight: 400; font-size: 11px; color: #bfae8e; }
/* The hidden HUD (screenshots): everything but this panel. */
body.explore-clean #hud, body.explore-clean #arsenal, body.explore-clean .dash, body.explore-clean #hpbars { display: none !important; }
`;

export class ExplorePanel {
  private readonly root = document.createElement("div");
  private readonly tabLabel = document.createElement("b");
  private readonly zoneButtons = new Map<string, HTMLButtonElement>();

  constructor(private readonly o: ExploreOptions) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);
    this.root.id = "explore";
    const tab = document.createElement("div");
    tab.className = "tab";
    tab.append("EXPLORE ·", this.tabLabel);
    tab.addEventListener("click", () => this.root.classList.toggle("open"));
    const body = document.createElement("div");
    body.className = "body";

    const head = (text: string) => { const h = document.createElement("h4"); h.textContent = text; body.append(h); };
    const button = (label: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
      return b;
    };
    const row = (...items: HTMLElement[]) => { const r = document.createElement("div"); r.className = "row"; r.append(...items); body.append(r); return r; };
    const toggle = (label: string, on: boolean, apply: (on: boolean) => void) => {
      let state = on;
      const b = button(label, () => { state = !state; b.classList.toggle("on", state); apply(state); });
      b.classList.toggle("on", state);
      return b;
    };

    head("Jump to zone");
    const zones = document.createElement("div");
    zones.className = "grid";
    o.zones.forEach((z, i) => {
      const b = button(`${i + 1}. ${z.label}`, () => { o.onZone(z.id); this.root.classList.remove("open"); });
      this.zoneButtons.set(z.id, b);
      zones.append(b);
    });
    body.append(zones);

    head("Speed");
    const speeds = [1, 2, 4].map((m) => {
      const b = button(`${m}×`, () => { speeds.forEach((s) => s.classList.toggle("on", s === b)); o.onSpeed(m); });
      return b;
    });
    speeds[1].classList.add("on");
    row(...speeds);

    head("Camera");
    row(button("Zoom in", () => o.onZoom(-1)), button("Zoom out", () => o.onZoom(1)));
    row(toggle("Whole map", false, o.onMap));

    head("Check");
    row(toggle("Walk through walls", false, o.onGhost), toggle("Hide HUD", false, (on) => {
      document.body.classList.toggle("explore-clean", on);
      o.onHud(!on);
    }));
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "No enemies, gates or timer; nothing is saved. Tap EXPLORE to fold or open this panel.";
    body.append(hint);

    this.root.append(tab, body);
    // Taps on the panel must not reach the joystick.
    for (const type of ["pointerdown", "touchstart"] as const) this.root.addEventListener(type, (e) => e.stopPropagation());
    document.body.append(this.root);
  }

  /** Marks the zone the hero is in. */
  setZone(id: string): void {
    for (const [z, b] of this.zoneButtons) b.classList.toggle("on", z === id);
    const label = this.o.zones.find((z) => z.id === id)?.label ?? id;
    this.tabLabel.textContent = label;
  }
}
