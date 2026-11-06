import { Vec3 } from "playcanvas";
import type { ScreenProjector } from "../camera/ScreenProjector";

/** What a bar needs from an enemy (gameplay/EnemyManager.ts Enemy fits). */
export interface BarTarget {
  position: Vec3;
  hp: number;
  maxHp: number;
  scale: number;
  lift: number;
  def: { boss?: boolean; aimHeight?: number };
  elite?: boolean;
}

/** Bar width (CSS px) by toughness; height above the feet per unit of aim height. */
const BARS = {
  width: { grunt: 38, elite: 54, champion: 62, boss: 86, hero: 60 },
  /** Max HP from which a foe counts as an elite (wider bar). */
  eliteHp: 200,
  /** Head top ~ 1.8 x the chest aim point, plus clearance (m). */
  headOverAim: 1.8,
  clearance: 0.32,
  heroHeight: 2.25,
  /** Fill colours: healthy, hurt, critical; the hero's own. */
  /** Enemies red, the hero green: friend and foe read at a glance. */
  colors: { enemy: "#e5403a", hero: "#5fd65a" },
};

interface Bar { el: HTMLElement; fill: HTMLElement; flash: HTMLElement; shown: boolean; frac: number; flashT: number; cls: string }

/**
 * Health bars over every living enemy and over the hero (DOM, pooled, moved with transforms).
 * Full-health foes show a dimmed bar; a hit flashes the lost part white.
 */
export class HealthBars {
  private readonly root: HTMLElement;
  private readonly pool: Bar[] = [];
  private readonly hero: Bar;
  private readonly owners = new Map<BarTarget, Bar>();
  private readonly free: Bar[] = [];
  private readonly top = new Vec3();
  private readonly screen = new Vec3();

  constructor() {
    this.root = document.createElement("div");
    this.root.id = "hpbars";
    document.body.append(this.root);
    this.hero = this.make();
    this.hero.el.classList.add("hero");
    this.hero.el.style.setProperty("--w", `${BARS.width.hero}px`);
  }

  private make(): Bar {
    const el = document.createElement("div");
    el.className = "hb";
    el.innerHTML = "<i></i><b></b>";
    this.root.append(el);
    const bar: Bar = { el, fill: el.firstElementChild as HTMLElement, flash: el.lastElementChild as HTMLElement, shown: false, frac: -1, flashT: 0, cls: "" };
    this.pool.push(bar);
    return bar;
  }

  private show(bar: Bar, on: boolean): void {
    if (bar.shown === on) return;
    bar.shown = on;
    bar.el.style.display = on ? "block" : "none";
  }

  private place(bar: Bar, p: Vec3, camera: ScreenProjector): boolean {
    camera.toScreen(p, this.screen);
    const s = this.screen;
    if (s.z <= 0 || s.x < -60 || s.y < -20 || s.x > camera.width + 60 || s.y > camera.height + 20) return false;
    bar.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
    return true;
  }

  private fill(bar: Bar, frac: number, color: string, dt: number): void {
    frac = Math.max(0, Math.min(1, frac));
    if (bar.frac >= 0 && frac < bar.frac - 0.001) {
      // The lost part flashes white for a moment.
      bar.flash.style.transform = `translateX(${(frac * 100).toFixed(1)}%) scaleX(${(bar.frac - frac).toFixed(3)})`;
      bar.flashT = 0.35;
    }
    if (bar.flashT > 0) {
      bar.flashT -= dt;
      bar.flash.style.opacity = `${Math.max(0, bar.flashT / 0.35).toFixed(2)}`;
    }
    if (frac !== bar.frac) {
      bar.fill.style.transform = `scaleX(${frac.toFixed(3)})`;
      bar.fill.style.setProperty("--c", color);
      bar.el.classList.toggle("full", frac >= 0.999 && bar !== this.hero);
      bar.frac = frac;
    }
  }

  /** Call once per frame after the camera moved. `visible` false hides everything (menus, death). */
  update(dt: number, enemies: readonly BarTarget[], hero: { position: Vec3; hp: number; maxHp: number }, camera: ScreenProjector, visible: boolean): void {
    this.root.style.display = visible ? "block" : "none";
    if (!visible) return;
    // Bars follow their enemy; enemies gone give theirs back.
    const live = new Set(enemies);
    for (const [owner, bar] of this.owners) {
      if (!live.has(owner) || owner.hp <= 0) {
        this.owners.delete(owner);
        this.show(bar, false);
        bar.frac = -1;
        bar.flashT = 0;
        bar.flash.style.opacity = "0";
        this.free.push(bar);
      }
    }
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      let bar = this.owners.get(e);
      if (!bar) {
        bar = this.free.pop() ?? this.make();
        this.owners.set(e, bar);
      }
      const kind = e.def.boss ? "boss" : e.elite ? "champion" : e.maxHp >= BARS.eliteHp ? "elite" : "grunt";
      if (bar.cls !== kind) {
        if (bar.cls && bar.cls !== "grunt") bar.el.classList.remove(bar.cls);
        if (kind !== "grunt") bar.el.classList.add(kind);
        bar.cls = kind;
        bar.el.style.setProperty("--w", `${BARS.width[kind]}px`);
      }
      const aim = (e.def.aimHeight ?? 1) * e.scale;
      this.top.set(e.position.x, e.lift + aim * BARS.headOverAim + BARS.clearance, e.position.z);
      const onScreen = this.place(bar, this.top, camera);
      this.show(bar, onScreen);
      if (!onScreen) continue;
      const frac = e.hp / e.maxHp;
      this.fill(bar, frac, BARS.colors.enemy, dt);
    }
    // The hero.
    this.top.set(hero.position.x, BARS.heroHeight, hero.position.z);
    const heroOn = hero.hp > 0 && this.place(this.hero, this.top, camera);
    this.show(this.hero, heroOn);
    if (heroOn) {
      const frac = hero.hp / Math.max(1, hero.maxHp);
      this.fill(this.hero, frac, BARS.colors.hero, dt);
    }
  }
}
