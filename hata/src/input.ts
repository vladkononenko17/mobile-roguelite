/**
 * Touch input for an iPhone held sideways: the left part of the screen is a
 * floating joystick (push it to the edge to jog), the rest is drag-to-look,
 * and the HUD buttons (action, tools…) sit on top and swallow their own
 * touches. In dish-washing mode the right side drives `pointer` instead.
 */

export interface InputState {
  /** Joystick: x = strafe right, y = forward, −1..1. */
  move: { x: number; y: number };
  /** Look delta since last frame, in pixels. */
  look: { x: number; y: number };
  /** The action button is held. */
  action: boolean;
  /** Became pressed this frame. */
  actionDown: boolean;
  /** Finger position for direct-touch modes (dish washing), normalised device coords. */
  pointer: { x: number; y: number; down: boolean };
  /** Stick pushed to the edge. */
  sprint: boolean;
}

export class Input {
  readonly state: InputState = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, action: false, actionDown: false, pointer: { x: 0, y: 0, down: false }, sprint: false };
  private el: HTMLElement;
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private actionHeld = false;
  private wasAction = false;
  /** The visual joystick (moved by this class). */
  joyEl: HTMLElement | null = null;
  joyKnob: HTMLElement | null = null;
  /** In direct-touch mode the right side drives `pointer` instead of looking. */
  direct = false;

  constructor(el: HTMLElement) {
    this.el = el;
    el.addEventListener("touchstart", this.touchStart, { passive: false });
    el.addEventListener("touchmove", this.touchMove, { passive: false });
    el.addEventListener("touchend", this.touchEnd);
    el.addEventListener("touchcancel", this.touchEnd);
    // iOS: no pinch-zoom or double-tap zoom on the game
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    addEventListener("blur", () => this.reset());
  }

  /** The action button in the HUD calls this. */
  setAction(on: boolean): void {
    this.actionHeld = on;
  }

  private ndc(x: number, y: number): void {
    const r = this.el.getBoundingClientRect();
    this.state.pointer.x = ((x - r.left) / r.width) * 2 - 1;
    this.state.pointer.y = -((y - r.top) / r.height) * 2 + 1;
  }

  private touchStart = (e: TouchEvent): void => {
    e.preventDefault();
    const w = this.el.clientWidth;
    for (const t of Array.from(e.changedTouches)) {
      if (!this.direct && t.clientX < w * 0.42 && this.joyId === null) {
        this.joyId = t.identifier;
        this.joyOrigin = { x: t.clientX, y: t.clientY };
        this.joyVec = { x: 0, y: 0 };
        if (this.joyEl) {
          this.joyEl.style.transform = `translate(${t.clientX}px, ${t.clientY}px)`;
          this.joyEl.classList.add("on");
        }
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lookLast = { x: t.clientX, y: t.clientY };
        this.ndc(t.clientX, t.clientY);
        this.state.pointer.down = true;
      }
    }
  };

  private touchMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyId) {
        const dx = t.clientX - this.joyOrigin.x, dy = t.clientY - this.joyOrigin.y;
        const R = 56;
        const len = Math.hypot(dx, dy);
        const k = len > R ? R / len : 1;
        this.joyVec = { x: (dx * k) / R, y: (-dy * k) / R };
        if (this.joyKnob) this.joyKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      } else if (t.identifier === this.lookId) {
        this.state.look.x += t.clientX - this.lookLast.x;
        this.state.look.y += t.clientY - this.lookLast.y;
        this.lookLast = { x: t.clientX, y: t.clientY };
        this.ndc(t.clientX, t.clientY);
      }
    }
  };

  private touchEnd = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyId) {
        this.joyId = null;
        this.joyVec = { x: 0, y: 0 };
        if (this.joyEl) this.joyEl.classList.remove("on");
        if (this.joyKnob) this.joyKnob.style.transform = "";
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
        this.state.pointer.down = false;
      }
    }
  };

  /** Call once per frame before reading `state`; `consume` clears look deltas after. */
  poll(): InputState {
    const { x, y } = this.joyVec;
    this.state.move.x = x;
    this.state.move.y = y;
    this.state.sprint = Math.hypot(x, y) > 0.97;
    this.state.action = this.actionHeld;
    this.state.actionDown = this.actionHeld && !this.wasAction;
    this.wasAction = this.actionHeld;
    return this.state;
  }

  consume(): void {
    this.state.look.x = 0;
    this.state.look.y = 0;
  }

  reset(): void {
    this.joyId = this.lookId = null;
    this.joyVec = { x: 0, y: 0 };
    this.actionHeld = false;
    this.state.pointer.down = false;
    if (this.joyEl) this.joyEl.classList.remove("on");
    if (this.joyKnob) this.joyKnob.style.transform = "";
  }
}
