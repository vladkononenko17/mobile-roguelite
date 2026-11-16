// The loading screen, the way mobile games do it: the DUSTLINE mark while the page boots, then the
// chapter's key art with its number, name and tagline, a rotating gameplay tip and one smooth
// percentage bar. No download sizes, no "tap to start" (sound unlocks on the first touch in game).

import type { BiomeId } from "../world/level/Biomes";
import { chapterInfo } from "./MainMenu";

const TIPS = [
  "Your hero aims and fires on their own. Your job is to keep moving.",
  "A dash makes you untouchable for a moment: dash through a charge, not away from it.",
  "Bosses wind up before every big hit. Watch for the tell, then move.",
  "Bloaters burst when they die. Step out of the warning ring.",
  "Glowing elites are tougher, and they drop a treasure chest.",
  "Bounties pay extra cash. The contract is at the top right.",
  "Upgrades of the same family stack into synergy bonuses.",
  "Spend your cash in the shop between levels: every gun tier is a real step up.",
  "Weapon modules change how a gun handles: sights tighten, magazines last longer.",
  "Standing still is how runs end. Kite the horde in wide circles.",
];

export class LoadingScreen {
  private readonly root = document.querySelector<HTMLElement>("#loading")!;
  private readonly bar = document.querySelector<HTMLElement>("#loading-bar")!;
  private readonly pct = this.root.querySelector<HTMLElement>(".ld-pct")!;
  private readonly tip = this.root.querySelector<HTMLElement>(".ld-tip")!;
  private shown = 0;
  private target = 0;
  /** After the big downloads the rest of the start (level build, enemies) creeps toward 97%. */
  private creeping = false;
  private finished = false;
  private tipIndex = Math.floor(Math.random() * TIPS.length);
  private tipTimer = 0;
  private raf = 0;
  private last = performance.now();

  constructor() {
    this.raf = requestAnimationFrame(this.tick);
  }

  /** The chapter's art, number, name and tagline; tips start rotating. */
  showChapter(id: BiomeId): void {
    const c = chapterInfo(id);
    this.root.style.setProperty("--accent", c.accent);
    const art = this.root.querySelector<HTMLElement>(".ld-art")!;
    art.style.backgroundImage = `url("${import.meta.env.BASE_URL}menu/${id}.webp")`;
    const chapter = this.root.querySelector<HTMLElement>(".ld-chapter")!;
    chapter.replaceChildren();
    if (c.numeral) chapter.append(Object.assign(document.createElement("small"), { textContent: `CHAPTER ${c.numeral}` }));
    chapter.append(Object.assign(document.createElement("h2"), { textContent: c.name }));
    if (c.tagline) chapter.append(Object.assign(document.createElement("p"), { textContent: c.tagline }));
    this.root.classList.add("chapter");
    this.showTip();
  }

  /** Download progress of the big files (bytes; total 0 = unknown). */
  progress(loaded: number, total: number): void {
    if (total > 0) {
      this.target = Math.max(this.target, 0.85 * Math.min(1, loaded / total));
      if (loaded >= total) this.creeping = true;
    } else {
      // Unknown size: ease toward 60% as bytes arrive.
      this.target = Math.max(this.target, 0.6 * (1 - Math.exp(-loaded / 8e6)));
    }
  }

  /** Fills the bar, holds it a beat and fades out. */
  done(): void {
    this.target = 1;
    this.finished = true;
    window.setTimeout(() => {
      this.root.classList.add("done");
      window.setTimeout(() => cancelAnimationFrame(this.raf), 600);
    }, 350);
  }

  failed(message: string): void {
    this.tip.replaceChildren(Object.assign(document.createElement("b"), { textContent: "ERROR" }), document.createTextNode(` Could not start: ${message}. Reload to try again.`));
    this.tipTimer = -Infinity;
  }

  private showTip(): void {
    this.tip.classList.add("fade");
    window.setTimeout(() => {
      if (this.tipTimer === -Infinity) return;
      this.tip.replaceChildren(Object.assign(document.createElement("b"), { textContent: "TIP" }), document.createTextNode(TIPS[this.tipIndex % TIPS.length]));
      this.tip.classList.remove("fade");
      this.tipIndex++;
    }, this.tip.childNodes.length ? 350 : 0);
  }

  private readonly tick = (now: number): void => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.creeping && !this.finished) this.target = Math.min(0.97, this.target + (0.97 - this.target) * dt * 0.6);
    // Smooth, never backwards; quick at the end.
    this.shown += (this.target - this.shown) * Math.min(1, dt * (this.finished ? 12 : 4));
    this.bar.style.transform = `scaleX(${this.shown.toFixed(4)})`;
    this.pct.textContent = `${Math.round(this.shown * 100)}%`;
    if (this.root.classList.contains("chapter") && this.tipTimer !== -Infinity) {
      this.tipTimer += dt;
      if (this.tipTimer > 4.5) { this.tipTimer = 0; this.showTip(); }
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}
