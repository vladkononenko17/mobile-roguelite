import { Vec3, type CameraComponent, type Entity } from "playcanvas";
import "@fontsource/barlow-condensed/latin-800.css";
import { CATEGORY_COLORS, ICON_PATHS, iconSvg, type UpgradeCategory, type UpgradeIcon, type UpgradeRarity } from "./UpgradeIcons";

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; font: 600 14px system-ui, sans-serif; color: #f3e7d3; z-index: 5; }
#hud .top { position: absolute; left: max(10px, env(safe-area-inset-left)); right: max(10px, env(safe-area-inset-right)); top: max(10px, env(safe-area-inset-top)); display: grid; grid-template-columns: 1fr auto; gap: 6px 10px; align-items: center; }
#hud .bar { position: relative; height: 16px; border-radius: 8px; background: rgba(20, 15, 12, 0.6); border: 1px solid rgba(243, 231, 211, 0.35); overflow: hidden; }
#hud .bar > i { position: absolute; inset: 0 auto 0 0; background: #d8463a; transition: width 0.15s; }
#hud .bar > span { position: absolute; inset: 0; text-align: center; font-size: 11px; line-height: 16px; text-shadow: 0 1px 2px #000; }
#hud .level .bar > i { background: #e8a92f; }
#hud .chips { display: flex; gap: 8px; justify-content: flex-start; }
#hud .left { display: grid; gap: 6px; align-content: start; }
/* GTA III style: money and health as big outlined numbers, top right. */
#hud .gta { display: grid; justify-items: end; gap: 0; font: 800 30px/1 "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }
#hud .gta .money, #hud .gta .health { position: relative; display: grid; transform-origin: 100% 50%; }
#hud .gta .money > *, #hud .gta .health > .num > * { grid-area: 1 / 1; }
/* Outline layer under the fill layer (a stroke on gradient-clipped text is unreliable on Safari). */
#hud .gta .o { color: #000; -webkit-text-stroke: 5px #000; text-shadow: 0 2px 3px rgba(0, 0, 0, 0.7); }
#hud .gta .money .f { color: #58b83c; background: linear-gradient(100deg, #2f7d22 0%, #5cc23f 30%, #5cc23f 42%, #f2ffd8 50%, #5cc23f 58%, #5cc23f 70%, #2f7d22 100%);
  background-size: 300% 100%; background-position: 100% 0; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: money-shine 3.2s ease-in-out infinite; }
#hud .gta .money.pop { animation: money-pop 0.3s ease-out; }
#hud .gta .money.pop .f { animation: money-shine 3.2s ease-in-out infinite, money-flash 0.45s ease-out; }
@keyframes money-shine { 0%, 55% { background-position: 100% 0; } 100% { background-position: 0% 0; } }
@keyframes money-flash { 0% { filter: brightness(1.9); } 100% { filter: brightness(1); } }
@keyframes money-pop { 40% { transform: scale(1.12); } }
#hud .gta .health { grid-auto-flow: column; align-items: center; gap: 5px; font-size: 26px; }
#hud .gta .health svg { width: 20px; height: 20px; fill: #ff7aa2; stroke: #000; stroke-width: 2.4px; paint-order: stroke; filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.6)); }
#hud .gta .health .num { display: grid; }
#hud .gta .health .f { color: #ff7aa2; }
#hud .gta .health.low { animation: hp-blink 0.8s steps(2, jump-none) infinite; }
#hud .gta .health.hit { animation: hp-hit 0.3s ease-out; }
@keyframes hp-blink { 50% { opacity: 0.25; } }
@keyframes hp-hit { 30% { transform: scale(1.15); filter: brightness(1.6); } }
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
#hud .dmg.heal { color: #7dff8a; font-size: 17px; }
#hud .upgrade { --c: #ffb13b; position: absolute; left: 50%; top: 19%; transform: translateX(-50%); max-width: min(52vw, 280px); display: flex; flex-direction: column; align-items: center; gap: 7px; opacity: 0; }
#hud .upgrade.show { animation: up-life 1.6s ease-out forwards; }
#hud .upgrade .disc { position: relative; width: 66px; height: 66px; border-radius: 50%; display: grid; place-items: center; border: 2px solid rgba(255, 250, 235, 0.9);
  background: radial-gradient(circle at 50% 32%, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0) 55%), radial-gradient(circle, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.35)), var(--c);
  box-shadow: 0 0 18px 3px var(--c), 0 2px 6px rgba(0, 0, 0, 0.6); }
#hud .upgrade .disc svg { width: 38px; height: 38px; fill: #fff; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.7)); }
#hud .upgrade .disc::after { content: ""; position: absolute; inset: -5px; border-radius: 50%; border: 3px solid var(--c); opacity: 0; }
#hud .upgrade.show .disc { animation: up-pop 0.45s ease-out; }
#hud .upgrade.show .disc::after { animation: up-ring 0.75s 0.12s ease-out; }
#hud .upgrade .card { background: rgba(20, 15, 12, 0.78); border: 1px solid var(--c); border-radius: 10px; padding: 5px 12px 6px; text-align: center; line-height: 1.25; }
#hud .upgrade .card b { display: block; font-size: 15px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; text-shadow: 0 1px 2px #000; }
#hud .upgrade .card small { display: block; font-size: 12px; font-weight: 600; opacity: 0.9; }
#hud .upgrade .card small em { font-style: normal; color: var(--c); }
#hud .upgrade .card i { display: block; font-style: normal; font-size: 9px; letter-spacing: 0.14em; color: var(--c); }
#hud .pulse { --c: #ffb13b; position: absolute; width: 110px; height: 70px; margin: -35px 0 0 -55px; border-radius: 50%; border: 3px solid var(--c); background: radial-gradient(closest-side, rgba(255, 255, 255, 0) 60%, var(--c)); opacity: 0; }
#hud .pulse.show { animation: up-pulse 0.7s ease-out forwards; }
@keyframes up-life { 0% { opacity: 0; } 8% { opacity: 1; } 78% { opacity: 1; transform: translateX(-50%); } 100% { opacity: 0; transform: translate(-50%, -12px); } }
@keyframes up-pop { 0% { transform: scale(0.5); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }
@keyframes up-ring { 0% { opacity: 0.9; transform: scale(0.85); } 100% { opacity: 0; transform: scale(1.9); } }
@keyframes up-pulse { 0% { opacity: 0.9; transform: scale(0.3); } 100% { opacity: 0; transform: scale(1.7); } }
#overlay { position: fixed; inset: 0; z-index: 6; display: none; align-items: center; justify-content: center; background: rgba(12, 8, 6, 0.72); font: 600 15px system-ui, sans-serif; color: #f3e7d3; padding: 16px; }
#overlay.open { display: flex; }
#overlay .panel { width: min(560px, 100%); max-height: 100%; overflow-y: auto; text-align: center; }
#overlay h2 { margin: 4px 0 4px; font-size: 24px; letter-spacing: 0.05em; }
#overlay p { margin: 4px 0 12px; opacity: 0.8; }
#overlay .cards { display: grid; gap: 10px; }
#overlay .card { display: block; width: 100%; text-align: left; padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(243, 231, 211, 0.45); background: rgba(43, 34, 28, 0.95); color: inherit; font: inherit; min-height: 64px; }
#overlay .card b { display: block; font-size: 17px; margin-bottom: 3px; }
#overlay .card .ci { float: left; width: 38px; height: 38px; margin: 0 12px 0 0; border-radius: 50%; display: grid; place-items: center; border: 1px solid rgba(255, 250, 235, 0.8); box-shadow: 0 0 8px var(--c); background: radial-gradient(circle at 50% 32%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 55%), var(--c); }
#overlay .card .ci svg { width: 23px; height: 23px; fill: #fff; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.7)); }
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

/** Re-triggers a one-shot CSS animation class. */
function restartAnimation(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export interface Card {
  title: string;
  text: string;
  tag?: string;
  kind?: "weapon" | "player" | "special";
  /** Upgrade icon shown in a category-coloured disc. */
  icon?: UpgradeIcon;
  disabled?: boolean;
}

/** What the upgrade toast shows (an UpgradeDef fits). */
export interface UpgradeNotice {
  name: string;
  stat: string;
  value: string;
  icon: UpgradeIcon;
  category: UpgradeCategory;
  rarity: UpgradeRarity;
}

interface Floater {
  el: HTMLElement;
  position: Vec3;
  life: number;
}

/**
 * Mobile gameplay HUD (DOM over the canvas): HP, level and its progress, cash, weapon and ammo, the
 * boss health bar, floating damage numbers, a hurt flash and banners; plus the modal overlay used by
 * the level-clear, upgrade, shop and end screens (large touch targets). Debug stats hide behind the
 * gear button (or ?debug=1).
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly health: HTMLElement;
  private readonly hpText: HTMLElement[];
  private readonly level: HTMLElement;
  private readonly levelText: HTMLElement;
  private readonly money: HTMLElement;
  private readonly moneyText: HTMLElement[];
  private readonly weapon: HTMLElement;
  private readonly boss: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly hurt: HTMLElement;
  private readonly floaters: Floater[] = [];
  private readonly screen = new Vec3();
  private bannerTimer = 0;
  private readonly upgrade: HTMLElement;
  private readonly pulse: HTMLElement;
  private readonly upgradeQueue: UpgradeNotice[] = [];
  private upgradeShowing = false;
  private pulseAnchor: Entity | null = null;
  private pulseTime = 0;

  constructor() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);
    this.root = document.createElement("div");
    this.root.id = "hud";
    this.root.innerHTML = `
      <div class="hurt"></div>
      <div class="top">
        <div class="left">
          <div class="level"><div class="bar"><i></i><span></span></div></div>
          <div class="chips"><span class="chip weapon"></span><button type="button" class="gear" aria-label="debug">⚙</button></div>
        </div>
        <div class="gta">
          <div class="money"><span class="o"></span><span class="f"></span></div>
          <div class="health"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATHS.heart}"/></svg><span class="num"><span class="o"></span><span class="f"></span></span></div>
        </div>
      </div>
      <div class="boss"><span></span><div class="bar"><i></i></div></div>
      <div class="banner"></div>
      <div class="pulse"></div>
      <div class="upgrade"><div class="disc"></div><div class="card"><i></i><b></b><small></small></div></div>`;
    document.body.append(this.root);
    this.overlay = document.createElement("div");
    this.overlay.id = "overlay";
    document.body.append(this.overlay);
    const q = (s: string) => this.root.querySelector<HTMLElement>(s)!;
    this.health = q(".gta .health");
    this.hpText = [...this.health.querySelectorAll<HTMLElement>(".num > span")];
    this.level = q(".level .bar > i");
    this.levelText = q(".level .bar > span");
    this.money = q(".gta .money");
    this.moneyText = [...this.money.querySelectorAll<HTMLElement>(":scope > span")];
    this.weapon = q(".weapon");
    this.boss = q(".boss");
    this.bossName = q(".boss > span");
    this.bossBar = q(".boss .bar > i");
    this.banner = q(".banner");
    this.hurt = q(".hurt");
    this.upgrade = q(".upgrade");
    this.pulse = q(".pulse");
    this.upgrade.addEventListener("animationend", (e) => {
      if (e.target !== this.upgrade) return;
      this.upgrade.classList.remove("show");
      this.upgradeShowing = false;
      this.nextUpgrade();
    });
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

  private shownHp = -1;

  /** Health as a plain number (GTA style); it blinks below a quarter and bumps when it drops. */
  setHp(hp: number, max: number): void {
    const value = Math.ceil(Math.max(0, hp));
    if (value === this.shownHp) return;
    if (value < this.shownHp) restartAnimation(this.health, "hit");
    this.shownHp = value;
    for (const el of this.hpText) el.textContent = String(value);
    this.health.classList.toggle("low", value > 0 && value <= max * 0.25);
  }

  setLevel(label: string, progress: number, right: string): void {
    this.level.style.width = `${Math.round(progress * 100)}%`;
    this.levelText.textContent = `${label} · ${right}`;
  }

  private shownCash = -1;

  setCash(amount: number): void {
    if (amount === this.shownCash) return;
    // A pop and flash when cash comes in (not on the first draw or when spending).
    if (amount > this.shownCash && this.shownCash >= 0) restartAnimation(this.money, "pop");
    this.shownCash = amount;
    // Just the amount, growing with the run: "0$", "20$", "1250$".
    const text = `${Math.max(0, Math.floor(amount))}$`;
    for (const el of this.moneyText) el.textContent = text;
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

  /**
   * Upgrade acquired: a category-coloured icon disc pops in above the action with a glow ring, a
   * compact name / stat card under it, a ring pulse on the ground around `anchor` (the hero), then
   * everything fades (~1.6 s). Gameplay keeps running; several notices play one after another.
   */
  showUpgrade(notice: UpgradeNotice, anchor: Entity | null = null): void {
    this.upgradeQueue.push(notice);
    if (anchor) {
      this.pulseAnchor = anchor;
      this.pulseTime = 0.7;
      this.pulse.style.setProperty("--c", CATEGORY_COLORS[notice.category]);
      this.pulse.classList.remove("show");
      void this.pulse.offsetWidth;
      this.pulse.classList.add("show");
    }
    if (!this.upgradeShowing) this.nextUpgrade();
  }

  private nextUpgrade(): void {
    const notice = this.upgradeQueue.shift();
    if (!notice) return;
    this.upgradeShowing = true;
    const el = this.upgrade;
    el.style.setProperty("--c", CATEGORY_COLORS[notice.category]);
    el.querySelector(".disc")!.innerHTML = iconSvg(notice.icon);
    el.querySelector(".card i")!.textContent = notice.rarity === "common" ? "" : notice.rarity.toUpperCase();
    el.querySelector(".card b")!.textContent = notice.name;
    const small = el.querySelector(".card small")!;
    small.textContent = `${notice.stat} `;
    const em = document.createElement("em");
    em.textContent = notice.value;
    small.append(em);
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
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
  damageNumber(position: Vec3, text: string, kind: "normal" | "crit" | "player" | "heal" = "normal"): void {
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
    if (this.pulseTime > 0 && this.pulseAnchor) {
      this.pulseTime -= dt;
      camera.worldToScreen(this.pulseAnchor.getPosition(), this.screen);
      this.pulse.style.left = `${this.screen.x}px`;
      this.pulse.style.top = `${this.screen.y}px`;
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
        b.innerHTML = `${card.icon ? `<span class="ci">${iconSvg(card.icon)}</span>` : ""}${card.tag ? `<span class="tag"></span>` : ""}<b></b><small></small>`;
        if (card.icon && card.kind) b.style.setProperty("--c", CATEGORY_COLORS[card.kind]);
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
