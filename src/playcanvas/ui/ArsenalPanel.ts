// TEST ARSENAL (?arsenal=1): a small in-level panel to switch to any gun, any hero, and freeze the
// danger, so every hold can be checked on every body without playing up to it. Players never see it.

export const TEST_ARSENAL: boolean = new URLSearchParams(location.search).get("arsenal") === "1";

export interface ArsenalOptions {
  weapons: { id: string; label: string }[];
  heroes: { id: string; label: string }[];
  currentWeapon: () => string;
  currentHero: string;
  onWeapon: (id: string) => void;
  onHero: (id: string) => void;
  onGod: (on: boolean) => void;
  onCalm: (on: boolean) => void;
}

const CSS = `
#arsenal { position: fixed; left: 8px; top: calc(env(safe-area-inset-top, 0px) + 116px); z-index: 60; font: 600 12px/1.2 system-ui, sans-serif; color: #f3ead8; user-select: none; -webkit-user-select: none; }
#arsenal .tab { display: inline-flex; gap: 6px; align-items: center; padding: 7px 10px; border-radius: 10px; background: rgba(20,16,12,.82); border: 1px solid rgba(255,220,160,.35); cursor: pointer; }
#arsenal .tab b { color: #ffcf6e; }
#arsenal .body { display: none; margin-top: 6px; padding: 8px; width: min(300px, calc(100vw - 32px)); max-height: calc(100vh - 200px); overflow-y: auto; border-radius: 12px; background: rgba(20,16,12,.9); border: 1px solid rgba(255,220,160,.3); }
#arsenal.open .body { display: block; }
#arsenal h4 { margin: 8px 2px 5px; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #bfae8e; }
#arsenal h4:first-child { margin-top: 0; }
#arsenal .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; }
#arsenal button { font: inherit; color: inherit; padding: 7px 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); text-align: left; cursor: pointer; }
#arsenal button.on { background: #ffcf6e; color: #20160c; border-color: #ffcf6e; }
#arsenal .row { display: flex; gap: 5px; }
#arsenal .row button { flex: 1; text-align: center; }
#arsenal .hint { margin-top: 7px; font-weight: 400; font-size: 11px; color: #bfae8e; }
`;

export class ArsenalPanel {
  private readonly root = document.createElement("div");
  private readonly weaponButtons = new Map<string, HTMLButtonElement>();
  private readonly tabLabel = document.createElement("b");

  constructor(private readonly o: ArsenalOptions) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);
    this.root.id = "arsenal";
    const tab = document.createElement("div");
    tab.className = "tab";
    tab.append("TEST ·", this.tabLabel);
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

    head("Weapon");
    const step = document.createElement("div");
    step.className = "row";
    step.append(button("◀ Prev", () => this.cycle(-1)), button("Next ▶", () => this.cycle(1)));
    body.append(step);
    const weapons = document.createElement("div");
    weapons.className = "grid";
    weapons.style.marginTop = "5px";
    for (const w of o.weapons) {
      const b = button(w.label, () => this.pick(w.id));
      this.weaponButtons.set(w.id, b);
      weapons.append(b);
    }
    body.append(weapons);

    head("Hero (reloads)");
    const heroes = document.createElement("div");
    heroes.className = "grid";
    for (const h of o.heroes) {
      const b = button(h.label, () => o.onHero(h.id));
      b.classList.toggle("on", h.id === o.currentHero);
      heroes.append(b);
    }
    body.append(heroes);

    head("Test");
    const toggles = document.createElement("div");
    toggles.className = "row";
    const toggle = (label: string, on: boolean, apply: (on: boolean) => void) => {
      let state = on;
      const b = button(label, () => { state = !state; b.classList.toggle("on", state); apply(state); });
      b.classList.toggle("on", state);
      apply(state);
      return b;
    };
    toggles.append(toggle("God mode", true, o.onGod), toggle("Freeze enemies", false, o.onCalm));
    body.append(toggles);
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Keys: Q / E previous / next weapon.";
    body.append(hint);

    this.root.append(tab, body);
    // Taps on the panel must not reach the joystick or fire the gun.
    for (const type of ["pointerdown", "touchstart"] as const) this.root.addEventListener(type, (e) => e.stopPropagation());
    document.body.append(this.root);
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.key === "q" || e.key === "Q") this.cycle(-1);
      else if (e.key === "e" || e.key === "E") this.cycle(1);
    });
    this.refresh();
  }

  /** Marks the equipped weapon (call after any equip, also from the shop). */
  refresh(): void {
    const current = this.o.currentWeapon();
    for (const [id, b] of this.weaponButtons) b.classList.toggle("on", id === current);
    this.tabLabel.textContent = this.o.weapons.find((w) => w.id === current)?.label ?? current;
  }

  private pick(id: string): void {
    this.o.onWeapon(id);
    this.refresh();
  }

  private cycle(dir: number): void {
    const list = this.o.weapons;
    const i = list.findIndex((w) => w.id === this.o.currentWeapon());
    this.pick(list[(i + dir + list.length) % list.length].id);
  }
}
