import { Vec3, type Entity } from "playcanvas";
import type { ScreenProjector } from "../camera/ScreenProjector";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import { CATEGORY_COLORS, ICON_PATHS, iconSvg, type UpgradeCategory, type UpgradeIcon, type UpgradeRarity } from "./UpgradeIcons";

const CSS = `
/* One HUD language: charcoal translucent plates with a thin highlight, cream text, road-line amber
   accent, muted dollar green, dark red health; Barlow Condensed throughout. Top corners only. */
#hud { --bg: rgba(23, 23, 20, 0.74); --bg2: rgba(36, 33, 27, 0.74); --line: rgba(239, 230, 210, 0.13); --hi: rgba(239, 230, 210, 0.22);
  --cream: #ece3cf; --amber: #d6a23c; --green: #8fae6a; --red: #a33b30; --warn: #e2692a;
  position: fixed; inset: 0; pointer-events: none; font: 700 13px/1 "Barlow Condensed", system-ui, sans-serif; color: var(--cream); z-index: 5;
  font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }
#hud .plate { position: relative; background: linear-gradient(180deg, var(--bg2), var(--bg)), repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.025) 0 2px, transparent 2px 5px);
  border: 1px solid var(--line); border-top-color: var(--hi); border-radius: 3px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8); }
#hud .corner { position: absolute; top: max(10px, env(safe-area-inset-top)); display: grid; gap: 5px; }
#hud .tl { left: max(10px, env(safe-area-inset-left)); justify-items: start; }
#hud .tr { right: max(10px, env(safe-area-inset-right)); justify-items: end; }
#hud .cap { font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
/* Level + timer, with the level progress as the plate's bottom edge. */
#hud .lvl { display: grid; gap: 2px; padding: 5px 10px 7px 9px; min-width: 66px; box-shadow: inset 2px 0 0 var(--amber), 0 2px 6px rgba(0, 0, 0, 0.45); }
#hud .lvl .cap { color: var(--amber); }
#hud .lvl .time { font-size: 24px; font-weight: 800; letter-spacing: 0.03em; }
#hud .lvl .time.alert { color: var(--warn); font-size: 19px; letter-spacing: 0.1em; }
#hud .lvl .prog { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(0, 0, 0, 0.45); overflow: hidden; border-radius: 0 0 3px 3px; }
#hud .lvl .prog > i { position: absolute; inset: 0 auto 0 0; background: rgba(236, 227, 207, 0.55); transition: width 0.3s linear; }
/* Character level + XP: a slim row under the wave plate (the level-up progress, separate from waves). */
#hud .xp { display: flex; align-items: center; gap: 6px; padding: 3px 8px 4px; }
#hud .xp .cap { color: var(--cream); font-size: 10px; letter-spacing: 0.12em; min-width: 26px; }
#hud .xp .bar { position: relative; flex: 1; min-width: 44px; height: 4px; background: rgba(0, 0, 0, 0.5); border-radius: 1px; overflow: hidden; }
#hud .xp .bar > i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, #c08a2c, #efc55a); transition: width 0.25s ease-out; }
#hud .xp.up .bar > i { animation: xp-full 0.5s ease-out; }
@keyframes xp-full { 0% { filter: brightness(2); } 100% { filter: none; } }
/* Ammo: small weapon name, big magazine count, smaller capacity. */
#hud .row { display: flex; gap: 5px; align-items: stretch; }
#hud .ammo { display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; align-items: end; column-gap: 6px; padding: 4px 9px 5px 7px; }
#hud .ammo svg { grid-row: 1 / 3; width: 14px; height: 18px; fill: var(--amber); align-self: center; }
#hud .ammo .cap { font-size: 8px; opacity: 0.6; letter-spacing: 0.2em; margin-bottom: 1px; }
#hud .ammo .count { display: flex; align-items: baseline; gap: 3px; }
#hud .ammo b { font-size: 21px; font-weight: 800; transition: color 0.2s; }
#hud .ammo small { font-size: 12px; opacity: 0.55; }
#hud .ammo.low b { color: var(--warn); animation: hud-pulse 0.9s ease-in-out infinite; }
#hud .ammo.reloading b { opacity: 0.3; }
#hud .ammo.reloading .cap { color: var(--amber); opacity: 1; animation: hud-blink 0.6s steps(2, jump-none) infinite; }
#hud .gear { pointer-events: auto; width: 26px; height: 26px; align-self: center; padding: 0; display: grid; place-items: center; color: var(--cream); opacity: 0.75; }
#hud .gear svg { width: 15px; height: 15px; }
#hud .gear:active { opacity: 1; }
/* Money: note icon + amount; pops, flashes and floats "+N" when cash comes in. */
#hud .money { display: flex; align-items: center; gap: 6px; padding: 4px 9px 4px 7px; transform-origin: 100% 50%; }
#hud .money svg { width: 19px; height: 13px; fill: var(--green); }
#hud .money b { font-size: 19px; font-weight: 800; color: #b6c99a; min-width: 1ch; text-align: right; }
#hud .money.pop { animation: money-pop 0.35s ease-out; }
#hud .money.pop b { animation: money-flash 0.5s ease-out; }
#hud .gain { position: absolute; right: calc(100% + 6px); top: 5px; font-size: 14px; font-weight: 800; color: #c9d98a; opacity: 0; }
#hud .gain.show { animation: money-gain 0.8s ease-out forwards; }
@keyframes money-pop { 35% { transform: scale(1.14); } }
@keyframes money-flash { 0% { color: #f1dc86; text-shadow: 0 0 8px rgba(214, 190, 80, 0.8), 0 1px 2px #000; } 100% { color: #b6c99a; } }
@keyframes money-gain { 0% { opacity: 0; transform: translateX(6px); } 20% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-10px); } }
/* Health: heart + number over a short bar; brighter red and a pulse only when low. */
#hud .health { display: grid; grid-template-columns: auto auto; align-items: center; gap: 4px 6px; padding: 4px 9px 6px 7px; min-width: 74px; justify-content: end; }
#hud .health svg { width: 13px; height: 13px; fill: var(--red); }
#hud .health b { font-size: 17px; font-weight: 800; text-align: right; }
#hud .health .hpbar { grid-column: 1 / 3; height: 3px; background: rgba(0, 0, 0, 0.5); border-radius: 1px; overflow: hidden; position: relative; }
#hud .health .hpbar > i { position: absolute; inset: 0 auto 0 0; background: var(--red); transition: width 0.2s; }
#hud .health.low b { color: #e0553e; }
#hud .health.low svg { fill: #e0553e; animation: hud-pulse 0.8s ease-in-out infinite; }
#hud .health.low .hpbar > i { background: #d9432e; }
#hud .health.hit { animation: hp-hit 0.3s ease-out; }
@keyframes hp-hit { 30% { transform: translateX(-2px); } 60% { transform: translateX(2px); } }
@keyframes hud-pulse { 50% { opacity: 0.55; transform: scale(0.92); } }
@keyframes hud-blink { 50% { opacity: 0.35; } }
/* Boss: a narrow plate at the top centre, just under the corner stacks. */
#hud .boss { position: absolute; left: 50%; transform: translateX(-50%); width: min(46vw, 220px); top: calc(max(10px, env(safe-area-inset-top)) + 86px); display: none; padding: 4px 7px 6px; text-align: center; }
#hud .boss > span { display: block; color: #d9a0a0; margin-bottom: 4px; }
#hud .boss .bar { height: 5px; background: rgba(0, 0, 0, 0.5); border-radius: 1px; overflow: hidden; position: relative; }
#hud .boss .bar > i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, #7d2a22, #b8452f); transition: width 0.15s; }
#hud .banner { position: absolute; left: 0; right: 0; top: 34%; text-align: center; font-size: 30px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; text-shadow: 0 2px 6px #000; opacity: 0; transition: opacity 0.3s; }
#hud .banner::after { content: ""; display: block; width: 42px; height: 2px; margin: 7px auto 0; background: var(--amber); }
#hud .hurt { position: absolute; inset: 0; box-shadow: inset 0 0 90px 30px rgba(170, 20, 10, 0.55); opacity: 0; transition: opacity 0.25s; }
#hud .dmg { position: absolute; font-size: 16px; font-weight: 800; text-shadow: 0 1px 2px #000, 0 0 3px #000; transform: translate(-50%, -50%); white-space: nowrap; }
#hud .dmg.crit { color: #f0c24a; font-size: 20px; }
#hud .dmg.player { color: #e0553e; }
#hud .dmg.heal { color: #9fcf78; font-size: 17px; }
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
/* Level-up: the game is paused underneath; a punchy title and big, touch-friendly cards. */
#overlay .panel.levelup { width: min(420px, 100%); }
#overlay .panel.levelup h2 { font: 800 38px/1 "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.12em; color: #efc55a; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7); animation: lvl-pop 0.4s ease-out; }
#overlay .panel.levelup p { font: 700 14px "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.14em; text-transform: uppercase; }
#overlay .panel.levelup .card { min-height: 72px; background: linear-gradient(180deg, rgba(40, 36, 29, 0.97), rgba(24, 23, 20, 0.97)); border-radius: 6px; animation: card-in 0.3s ease-out backwards; }
#overlay .panel.levelup .card:nth-child(2) { animation-delay: 0.06s; }
#overlay .panel.levelup .card:nth-child(3) { animation-delay: 0.12s; }
#overlay .panel.levelup .card:active { transform: scale(0.98); }
#overlay .panel.levelup .card b { font: 800 19px "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.04em; }
@keyframes lvl-pop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }
@keyframes card-in { 0% { transform: translateY(14px); opacity: 0; } 100% { transform: none; opacity: 1; } }
#overlay .card:disabled { opacity: 0.4; }
#overlay .actions { margin-top: 14px; display: flex; gap: 10px; justify-content: center; }
#overlay .primary { padding: 12px 22px; border-radius: 10px; border: 0; background: #e8a92f; color: #1b140f; font: 700 16px system-ui, sans-serif; }
body:not(.debug-on) #debug { display: none; }
`;

/** Settings cog: a dashed ring makes the teeth. */
const GEAR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8.2" stroke-width="3.2" stroke-dasharray="3.2 3.24"/><circle cx="12" cy="12" r="5.6" stroke-width="2.4"/></svg>`;

/** Banknote: a frame with a round seal in the middle. */
const NOTE_SVG = `<svg viewBox="0 0 30 20" aria-hidden="true"><path fill-rule="evenodd" d="M1 2H29V18H1Z M3.5 4.5V15.5H26.5V4.5Z M15 6.2A3.8 3.8 0 1 1 14.99 6.2Z M5.5 8.5H8.5V11.5H5.5Z M21.5 8.5H24.5V11.5H21.5Z"/></svg>`;

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
  private readonly hpText: HTMLElement;
  private readonly hpBar: HTMLElement;
  private readonly levelFill: HTMLElement;
  private readonly xp: HTMLElement;
  private readonly xpLevel: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly levelName: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly money: HTMLElement;
  private readonly moneyText: HTMLElement;
  private readonly gain: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly ammoName: HTMLElement;
  private readonly ammoCount: HTMLElement;
  private readonly ammoMax: HTMLElement;
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
    const bulletSvg = `<svg viewBox="4 1 16 22" aria-hidden="true"><path d="${ICON_PATHS.bullet}"/></svg>`;
    this.root.innerHTML = `
      <div class="hurt"></div>
      <div class="corner tl">
        <div class="plate lvl"><span class="cap"></span><span class="time"></span><div class="prog"><i></i></div></div>
        <div class="plate xp"><span class="cap"></span><div class="bar"><i></i></div></div>
        <div class="row">
          <div class="plate ammo">${bulletSvg}<span class="cap"></span><span class="count"><b></b><small></small></span></div>
          <button type="button" class="plate gear" aria-label="settings">${GEAR_SVG}</button>
        </div>
      </div>
      <div class="corner tr">
        <div class="plate money">${NOTE_SVG}<b></b><span class="gain"></span></div>
        <div class="plate health"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATHS.heart}"/></svg><b></b><div class="hpbar"><i></i></div></div>
      </div>
      <div class="plate boss"><span class="cap"></span><div class="bar"><i></i></div></div>
      <div class="banner"></div>
      <div class="pulse"></div>
      <div class="upgrade"><div class="disc"></div><div class="card"><i></i><b></b><small></small></div></div>`;
    document.body.append(this.root);
    this.overlay = document.createElement("div");
    this.overlay.id = "overlay";
    document.body.append(this.overlay);
    const q = (s: string) => this.root.querySelector<HTMLElement>(s)!;
    this.health = q(".health");
    this.hpText = q(".health b");
    this.hpBar = q(".health .hpbar > i");
    this.levelFill = q(".lvl .prog > i");
    this.xp = q(".xp");
    this.xpLevel = q(".xp .cap");
    this.xpFill = q(".xp .bar > i");
    this.levelName = q(".lvl .cap");
    this.timer = q(".lvl .time");
    this.money = q(".money");
    this.moneyText = q(".money b");
    this.gain = q(".money .gain");
    this.ammo = q(".ammo");
    this.ammoName = q(".ammo .cap");
    this.ammoCount = q(".ammo b");
    this.ammoMax = q(".ammo small");
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

  private shownMaxHp = -1;

  /** Heart, number and a short bar; turns brighter red and pulses at a quarter or less, shakes on hits. */
  setHp(hp: number, max: number): void {
    const value = Math.ceil(Math.max(0, hp));
    if (value === this.shownHp && max === this.shownMaxHp) return;
    if (value < this.shownHp) restartAnimation(this.health, "hit");
    this.shownHp = value;
    this.shownMaxHp = max;
    this.hpText.textContent = String(value);
    this.hpBar.style.width = `${Math.min(100, (100 * value) / max)}%`;
    this.health.classList.toggle("low", value > 0 && value <= max * 0.25);
  }

  private shownLevel = 0;

  /** Character level and XP toward the next level (flashes on a level-up). */
  setXp(level: number, xp: number, needed: number): void {
    if (level !== this.shownLevel) {
      if (this.shownLevel > 0) restartAnimation(this.xp, "up");
      this.shownLevel = level;
      this.xpLevel.textContent = `LV ${level}`;
    }
    this.xpFill.style.width = `${Math.min(100, (100 * xp) / needed)}%`;
  }

  /** Wave name small, the timer (or BOSS / CLEAR) large, wave progress along the plate's bottom edge. */
  setWave(label: string, progress: number, right: string): void {
    this.levelFill.style.width = `${Math.round(progress * 100)}%`;
    if (this.levelName.textContent !== label) this.levelName.textContent = label;
    if (this.timer.textContent !== right) {
      this.timer.textContent = right;
      this.timer.classList.toggle("alert", !/\d/.test(right));
    }
  }

  private shownCash = -1;

  setCash(amount: number): void {
    if (amount === this.shownCash) return;
    // A pop, a gold-green flash and a floating "+N" when cash comes in (not on the first draw or
    // when spending).
    if (amount > this.shownCash && this.shownCash >= 0) {
      restartAnimation(this.money, "pop");
      this.gain.textContent = `+${Math.floor(amount - this.shownCash)}`;
      restartAnimation(this.gain, "show");
    }
    this.shownCash = amount;
    this.moneyText.textContent = String(Math.max(0, Math.floor(amount)));
  }

  private ammoKey = "";

  /** Small weapon name, the magazine count large and the capacity small; warns when low. */
  setWeapon(label: string, ammo: number, magazine: number, reloading: boolean): void {
    const key = `${label}|${ammo}|${magazine}|${reloading}`;
    if (key === this.ammoKey) return;
    this.ammoKey = key;
    this.ammoName.textContent = reloading ? "Reloading" : label;
    this.ammoCount.textContent = String(ammo);
    this.ammoMax.textContent = `/ ${magazine}`;
    this.ammo.classList.toggle("reloading", reloading);
    this.ammo.classList.toggle("low", !reloading && magazine > 0 && ammo <= magazine * 0.25);
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

  update(dt: number, camera: ScreenProjector): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.style.opacity = "0";
    }
    if (this.pulseTime > 0 && this.pulseAnchor) {
      this.pulseTime -= dt;
      camera.toScreen(this.pulseAnchor.getPosition(), this.screen);
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
      camera.toScreen(f.position, this.screen);
      f.el.style.left = `${this.screen.x}px`;
      f.el.style.top = `${this.screen.y}px`;
      f.el.style.opacity = `${Math.min(1, f.life / 0.3)}`;
    }
  }

  /** Opens the modal with a title, text, optional cards (each a button) and optional actions. */
  openModal(options: { title: string; text?: string; cards?: Card[]; compact?: boolean; levelUp?: boolean; onCard?: (index: number) => void; actions?: { label: string; onClick: () => void }[] }): void {
    const panel = document.createElement("div");
    panel.className = options.levelUp ? "panel levelup" : "panel";
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
