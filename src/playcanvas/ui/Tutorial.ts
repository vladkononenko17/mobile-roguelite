// First-run hints, shown once in a new player's very first level (settings.tutorial): how to move
// (a ghost thumb drags a stick), that the gun fires on its own, and what DASH does (the button is
// ringed). Each hint goes away when the player has done the thing, or after a while. Play never stops.

const CSS = `
#tut { position: fixed; inset: 0; z-index: 4; pointer-events: none; font: 700 15px/1.25 "Barlow Condensed", system-ui, sans-serif; color: #f3e7d3; opacity: 1; transition: opacity 0.25s; }
#tut.hide { opacity: 0; }
/* Under the hero's feet (he stands a little below the middle of the screen), clear of the dash button. */
#tut .tip { position: absolute; left: 50%; top: 68%; transform: translate(-50%, 8px); width: max-content; max-width: min(78vw, 340px); box-sizing: border-box;
  padding: 10px 16px 11px; border-radius: 12px; background: rgba(16, 12, 9, 0.86); border: 1px solid rgba(214, 162, 60, 0.75); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5); text-align: center; opacity: 0; transition: opacity 0.3s, transform 0.3s; }
#tut .tip.show { opacity: 1; transform: translate(-50%, 0); }
#tut .tip b { display: block; font-size: 19px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #f2c66b; }
#tut .tip span { display: block; margin-top: 2px; font: 500 13px/1.35 system-ui, sans-serif; opacity: 0.9; }
#tut .tip i { display: block; margin-bottom: 4px; font-style: normal; font-size: 10px; letter-spacing: 0.3em; text-indent: 0.3em; opacity: 0.6; }
/* The ghost stick: a ring, and a thumb that drags to the right, up, and back. */
#tut .stick { position: absolute; left: 50%; top: calc(68% + 90px); width: 92px; height: 92px; margin-left: -46px; border-radius: 50%;
  border: 2px dashed rgba(243, 231, 211, 0.55); background: rgba(20, 15, 12, 0.3); opacity: 0; transition: opacity 0.3s; }
#tut .stick.show { opacity: 1; }
#tut .stick::after { content: ""; position: absolute; left: 50%; top: 50%; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 50%;
  background: radial-gradient(circle at 50% 35%, #fff6e2, #d6a23c); box-shadow: 0 0 16px rgba(214, 162, 60, 0.8), 0 2px 6px rgba(0, 0, 0, 0.6); animation: tut-drag 2.6s ease-in-out infinite; }
@keyframes tut-drag { 0%, 12% { transform: translate(0, 0) scale(1.12); opacity: 0; } 20% { transform: translate(0, 0) scale(1); opacity: 1; } 42% { transform: translate(28px, -6px); } 64% { transform: translate(4px, -28px); } 84% { transform: translate(-26px, 4px); opacity: 1; } 100% { transform: translate(-26px, 4px); opacity: 0; } }
/* The ring around the dash button. */
#tut .ring { position: absolute; box-sizing: border-box; width: 76px; height: 76px; border-radius: 50%; border: 3px solid #f2c66b; box-shadow: 0 0 18px #f2c66b; display: none; animation: tut-ring 1s ease-out infinite; }
#tut .ring.show { display: block; }
@keyframes tut-ring { 0% { transform: scale(0.95); opacity: 1; } 100% { transform: scale(1.55); opacity: 0; } }
`;

/** What the player has done so far in the level. */
export interface TutorialInput {
  /** Metres walked since the level began. */
  moved: number;
  /** The gun has a target (it is firing). */
  firing: boolean;
  /** Dashes made since the level began. */
  dashes: number;
  /** Hints show only in play (not under a menu, a level-up or the pause screen). */
  visible: boolean;
}

interface Step {
  kicker: string;
  title: string;
  text: string;
  /** Seconds before it may go away, and when it goes away by itself. */
  min: number;
  max: number;
  /** Waits (hidden) until this is true, at most `wait` seconds. */
  ready?: (i: TutorialInput) => boolean;
  wait?: number;
  done: (i: TutorialInput, start: TutorialInput) => boolean;
  stick?: boolean;
  ring?: boolean;
}

export class Tutorial {
  private readonly root = document.createElement("div");
  private readonly tip = document.createElement("div");
  private readonly stick = document.createElement("div");
  private readonly ring = document.createElement("div");
  private readonly steps: Step[];
  private index = -1;
  /** Seconds in the current step: negative while waiting to show it. */
  private time = 0;
  private waited = 0;
  private shown = false;
  private start: TutorialInput = { moved: 0, firing: false, dashes: 0, visible: true };
  /** Hints shown so far (the tutorial counts as seen from the second one). */
  seen = 0;

  constructor() {
    if (!document.getElementById("tut-css")) {
      const style = document.createElement("style");
      style.id = "tut-css";
      style.textContent = CSS;
      document.head.append(style);
    }
    const touch = matchMedia("(pointer: coarse)").matches;
    this.steps = [
      {
        kicker: "1 / 3", title: "Move", text: touch ? "Drag anywhere on the screen to move." : "Move with WASD or the arrow keys.",
        min: 1.6, max: 14, stick: touch, done: (i, s) => i.moved - s.moved >= 4,
      },
      {
        kicker: "2 / 3", title: "Auto-fire", text: "Your hero aims and shoots on their own. Keep your distance and keep moving.",
        min: 4.2, max: 4.2, ready: (i) => i.firing, wait: 7, done: () => true,
      },
      {
        kicker: "3 / 3", title: "Dash", text: touch ? "Tap DASH to burst through the horde. Nothing can hit you mid-dash." : "Press SPACE to burst through the horde. Nothing can hit you mid-dash.",
        min: 1.2, max: 12, ring: touch, done: (i, s) => i.dashes > s.dashes,
      },
    ];
    this.root.id = "tut";
    this.tip.className = "tip";
    this.stick.className = "stick";
    this.ring.className = "ring";
    this.root.append(this.stick, this.ring, this.tip);
    document.body.append(this.root);
    this.next({ moved: 0, firing: false, dashes: 0, visible: true }, 1.4);
  }

  private next(input: TutorialInput, delay = 0.5): void {
    this.index++;
    this.time = -delay;
    this.waited = 0;
    this.shown = false;
    this.start = { ...input };
    this.tip.classList.remove("show");
    this.stick.classList.remove("show");
    this.ring.classList.remove("show");
  }

  /** Steps the hints; true once the last one is gone. */
  update(dt: number, input: TutorialInput): boolean {
    const step = this.steps[this.index];
    if (!step) return true;
    this.root.classList.toggle("hide", !input.visible);
    if (!input.visible) return false;
    if (!this.shown) {
      this.time += dt;
      if (this.time < 0) return false;
      // Some hints wait for their moment (the first shot).
      this.waited += dt;
      if (step.ready && !step.ready(input) && this.waited < (step.wait ?? 0)) return false;
      this.present(step, input);
      return false;
    }
    this.time += dt;
    if (this.time >= step.max || (this.time >= step.min && step.done(input, this.start))) this.next(input);
    return this.index >= this.steps.length;
  }

  private present(step: Step, input: TutorialInput): void {
    this.shown = true;
    this.seen++;
    this.time = 0;
    this.start = { ...input };
    this.tip.replaceChildren(
      Object.assign(document.createElement("i"), { textContent: `HOW TO PLAY · ${step.kicker}` }),
      Object.assign(document.createElement("b"), { textContent: step.title }),
      Object.assign(document.createElement("span"), { textContent: step.text }),
    );
    this.tip.classList.add("show");
    this.stick.classList.toggle("show", !!step.stick);
    if (step.ring) {
      // Over the dash button, wherever the layout has put it.
      const r = document.querySelector("#hud .dash")?.getBoundingClientRect();
      if (r && r.width > 0) {
        this.ring.style.left = `${r.left}px`;
        this.ring.style.top = `${r.top}px`;
        this.ring.style.width = `${r.width}px`;
        this.ring.style.height = `${r.height}px`;
        this.ring.classList.add("show");
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
