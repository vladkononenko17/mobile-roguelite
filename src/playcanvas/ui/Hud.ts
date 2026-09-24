import { Vec3, type CameraComponent } from "playcanvas";

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; font: 600 14px system-ui, sans-serif; color: #f3e7d3; z-index: 5; }
#hud .top { position: absolute; left: max(10px, env(safe-area-inset-left)); right: max(10px, env(safe-area-inset-right)); top: max(10px, env(safe-area-inset-top)); display: grid; grid-template-columns: 1fr auto; gap: 6px 10px; align-items: center; }
#hud .bar { position: relative; height: 16px; border-radius: 8px; background: rgba(20, 15, 12, 0.6); border: 1px solid rgba(243, 231, 211, 0.35); overflow: hidden; }
#hud .bar > i { position: absolute; inset: 0 auto 0 0; background: #d8463a; transition: width 0.15s; }
#hud .bar > span { position: absolute; inset: 0; text-align: center; font-size: 11px; line-height: 16px; text-shadow: 0 1px 2px #000; }
#hud .level .bar > i { background: #e8a92f; }
#hud .chips { display: flex; gap: 8px; justify-content: flex-end; }
#hud .chip { background: rgba(20, 15, 12, 0.6); border: 1px solid rgba(243, 231, 211, 0.35); border-radius: 8px; padding: 2px 8px; white-space: nowrap; }
#hud .gear { pointer-events: auto; background: rgba(20, 15, 12, 0.6); border: 1px solid rgba(243, 231, 211, 0.35); color: inherit; border-radius: 8px; font: inherit; padding: 2px 8px; }
#hud .boss { position: absolute; left: 12%; right: 12%; top: calc(max(10px, env(safe-area-inset-top)) + 58px); display: none; text-align: center; font-size: 12px; text-shadow: 0 1px 2px #000; }
#hud .boss .bar { height: 12px; margin-top: 2px; }
#hud .boss .bar > i { background: #9c3bd8; }
#hud .banner { position: absolute; left: 0; right: 0; top: 34%; text-align: center; font-size: 28px; letter-spacing: 0.06em; text-shadow: 0 2px 6px #000; opacity: 0; transition: opacity 0.3s; }
#hud .hurt { position: absolute; inset: 0; box-shadow: inset 0 0 90px 30px rgba(200, 20, 10, 0.6); opacity: 0; transition: opacity 0.25s; }
#hud .dmg { position: absolute; font-size: 15px; font-weight: 800; text-shadow: 0 1px 2px #000, 0 0 3px #000; transform: translate(-50%, -50%); white-space: nowrap; }
#hud .dmg.crit { color: #ffd23a; font-size: 19px; }
#hud .dmg.player { color: #ff5a4a; }
#overlay { position: fixed; inset: 0; z-index: 6; display: none; align-items: center; justify-content: center; background: rgba(12, 8, 6, 0.72); font: 600 15px system-ui, sans-serif; color: #f3e7d3; padding: 16px; }
#overlay.open { display: flex; }
#overlay .panel { width: min(560px, 100%); max-height: 100%; overflow-y: auto; text-align: center; }
#overlay h2 { margin: 4px 0 4px; font-size: 24px; letter-spacing: 0.05em; }
#overlay p { margin: 4px 0 12px; opacity: 0.8; }
#overlay .cards { display: grid; gap: 10px; }
#overlay .card { display: block; width: 100%; text-align: left; padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(243, 231, 211, 0.45); background: rgba(43, 34, 28, 0.95); color: inherit; font: inherit; min-height: 64px; }
#overlay .card b { display: block; font-size: 17px; margin-bottom: 3px; }
#overlay .card small { opacity: 0.8; font-weight: 500; }
#overlay .card .tag { float: right; font-size: 11px; opacity: 0.7; text-transform: uppercase; }
#overlay .card.weapon { border-color: #e8a92f; }
#overlay .cards.compact { grid-template-columns: 1fr 1fr; gap: 8px; }
#overlay .cards.compact .card { min-height: 58px; padding: 9px 10px; }
#overlay .cards.compact .card b { font-size: 15px; }
#overlay .cards.compact .card .tag { display: none; }
#overlay .card.special { border-color: #9c3bd8; }
#overlay .card:disabled { opacity: 0.4; }
#overlay .actions { margin-top: 14px; display: flex; gap: 10px; justify-content: center; }
#overlay .primary { padding: 12px 22px; border-radius: 10px; border: 0; background: #e8a92f; color: #1b140f; font: 700 16px system-ui, sans-serif; }
body:not(.debug-on) #debug { display: none; }
`;

export interface Card {
  title: string;
  text: string;
  tag?: string;
  kind?: "weapon" | "player" | "special";
  disabled?: boolean;
}

interface Floater {
  el: HTMLElement;
  position: Vec3;
  life: number;
}

/**
 * Mobile gameplay HUD (DOM over the canvas): HP, level and its progress, scrap, weapon and ammo, the
 * boss health bar, floating damage numbers, a hurt flash and banners; plus the modal overlay used by
 * the level-clear, upgrade, shop and end screens (large touch targets). Debug stats hide behind the
 * gear button (or ?debug=1).
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly hp: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly level: HTMLElement;
  private readonly levelText: HTMLElement;
  private readonly scrap: HTMLElement;
  private readonly weapon: HTMLElement;
  private readonly boss: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly hurt: HTMLElement;
  private readonly floaters: Floater[] = [];
  private readonly screen = new Vec3();
  private bannerTimer = 0;

  constructor() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);
    this.root = document.createElement("div");
    this.root.id = "hud";
    this.root.innerHTML = `
      <div class="hurt"></div>
      <div class="top">
        <div class="bar hp"><i></i><span></span></div>
        <div class="chips"><span class="chip scrap"></span><button type="button" class="gear" aria-label="debug">⚙</button></div>
        <div class="level"><div class="bar"><i></i><span></span></div></div>
        <div class="chips"><span class="chip weapon"></span></div>
      </div>
      <div class="boss"><span></span><div class="bar"><i></i></div></div>
      <div class="banner"></div>`;
    document.body.append(this.root);
    this.overlay = document.createElement("div");
    this.overlay.id = "overlay";
    document.body.append(this.overlay);
    const q = (s: string) => this.root.querySelector<HTMLElement>(s)!;
    this.hp = q(".hp > i");
    this.hpText = q(".hp > span");
    this.level = q(".level .bar > i");
    this.levelText = q(".level .bar > span");
    this.scrap = q(".scrap");
    this.weapon = q(".weapon");
    this.boss = q(".boss");
    this.bossName = q(".boss > span");
    this.bossBar = q(".boss .bar > i");
    this.banner = q(".banner");
    this.hurt = q(".hurt");
    if (new URLSearchParams(location.search).get("debug") === "1") document.body.classList.add("debug-on");
    q(".gear").addEventListener("click", () => document.body.classList.toggle("debug-on"));
    for (let i = 0; i < 24; i++) {
      const el = document.createElement("div");
      el.className = "dmg";
      el.style.display = "none";
      this.root.append(el);
      this.floaters.push({ el, position: new Vec3(), life: 0 });
    }
  }

  setHp(hp: number, max: number): void {
    this.hp.style.width = `${(100 * Math.max(0, hp)) / max}%`;
    this.hpText.textContent = `${Math.ceil(Math.max(0, hp))} / ${max}`;
  }

  setLevel(label: string, progress: number, right: string): void {
    this.level.style.width = `${Math.round(progress * 100)}%`;
    this.levelText.textContent = `${label} · ${right}`;
  }

  setScrap(amount: number): void {
    this.scrap.textContent = `SCRAP ${amount}`;
  }

  setWeapon(label: string, ammo: number, magazine: number, reloading: boolean): void {
    this.weapon.textContent = `${label} ${reloading ? "reloading…" : `${ammo}/${magazine}`}`;
  }

  setBoss(name: string | null, fraction = 0): void {
    this.boss.style.display = name ? "block" : "none";
    if (!name) return;
    this.bossName.textContent = name;
    this.bossBar.style.width = `${Math.max(0, fraction) * 100}%`;
  }

  showBanner(text: string, seconds = 2): void {
    this.banner.textContent = text;
    this.banner.style.opacity = "1";
    this.bannerTimer = seconds;
  }

  flashHurt(): void {
    this.hurt.style.transition = "none";
    this.hurt.style.opacity = "1";
    requestAnimationFrame(() => {
      this.hurt.style.transition = "opacity 0.35s";
      this.hurt.style.opacity = "0";
    });
  }

  /** Floating number at a world position. */
  damageNumber(position: Vec3, text: string, kind: "normal" | "crit" | "player" = "normal"): void {
    const f = this.floaters.find((x) => x.life <= 0) ?? this.floaters.reduce((a, b) => (a.life < b.life ? a : b));
    f.position.copy(position);
    f.life = 0.7;
    f.el.textContent = text;
    f.el.className = `dmg${kind === "normal" ? "" : ` ${kind}`}`;
    f.el.style.display = "block";
  }

  update(dt: number, camera: CameraComponent): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.style.opacity = "0";
    }
    for (const f of this.floaters) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.el.style.display = "none";
        continue;
      }
      f.position.y += dt * 1.2;
      camera.worldToScreen(f.position, this.screen);
      f.el.style.left = `${this.screen.x}px`;
      f.el.style.top = `${this.screen.y}px`;
      f.el.style.opacity = `${Math.min(1, f.life / 0.3)}`;
    }
  }

  /** Opens the modal with a title, text, optional cards (each a button) and optional actions. */
  openModal(options: { title: string; text?: string; cards?: Card[]; compact?: boolean; onCard?: (index: number) => void; actions?: { label: string; onClick: () => void }[] }): void {
    const panel = document.createElement("div");
    panel.className = "panel";
    const h = document.createElement("h2");
    h.textContent = options.title;
    panel.append(h);
    if (options.text) {
      const p = document.createElement("p");
      p.textContent = options.text;
      panel.append(p);
    }
    if (options.cards) {
      const cards = document.createElement("div");
      cards.className = options.compact ? "cards compact" : "cards";
      options.cards.forEach((card, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `card ${card.kind ?? ""}`;
        b.disabled = !!card.disabled;
        b.innerHTML = `${card.tag ? `<span class="tag"></span>` : ""}<b></b><small></small>`;
        if (card.tag) b.querySelector(".tag")!.textContent = card.tag;
        b.querySelector("b")!.textContent = card.title;
        b.querySelector("small")!.textContent = card.text;
        b.addEventListener("click", () => options.onCard?.(i));
        cards.append(b);
      });
      panel.append(cards);
    }
    if (options.actions) {
      const actions = document.createElement("div");
      actions.className = "actions";
      for (const a of options.actions) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "primary";
        b.textContent = a.label;
        b.addEventListener("click", a.onClick);
        actions.append(b);
      }
      panel.append(actions);
    }
    this.overlay.replaceChildren(panel);
    this.overlay.classList.add("open");
  }

  closeModal(): void {
    this.overlay.classList.remove("open");
    this.overlay.replaceChildren();
  }

  get modalOpen(): boolean {
    return this.overlay.classList.contains("open");
  }
}
