/**
 * Input for a first-person game on a phone held sideways: the left part of
 * the screen is a floating joystick, the rest is drag-to-look, and the HUD
 * buttons (action, tools…) sit on top and swallow their own touches.
 * Desktop: WASD/arrows, mouse drag or pointer lock to look, Space or left
 * mouse to work, number keys for tools.
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
  /** Pointer position for direct-touch modes (dish washing), normalised device coords. */
  pointer: { x: number; y: number; down: boolean };
  sprint: boolean;
}

type Key = string;

export class Input {
  readonly state: InputState = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, action: false, actionDown: false, pointer: { x: 0, y: 0, down: false }, sprint: false };
  private keys = new Set<Key>();
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private actionHeld = false;
  private wasAction = false;
  private mouseLook = false;
  /** Fired for single key presses (tool numbers, menus). */
  onKey: (code: string) => void = () => {};
  /** The visual joystick (moved by this class). */
  joyEl: HTMLElement | null = null;
  joyKnob: HTMLElement | null = null;
  /** In direct-touch mode the right side drives `pointer` instead of looking. */
  direct = false;

  constructor(private el: HTMLElement) {
    el.addEventListener("touchstart", this.touchStart, { passive: false });
    el.addEventListener("touchmove", this.touchMove, { passive: false });
    el.addEventListener("touchend", this.touchEnd);
    el.addEventListener("touchcancel", this.touchEnd);
    el.addEventListener("mousedown", this.mouseDown);
    addEventListener("mousemove", this.mouseMove);
    addEventListener("mouseup", this.mouseUp);
    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "Space") this.actionHeld = true;
      this.onKey(e.code);
      if (["Space", "Tab", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
    });
    addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "Space") this.actionHeld = false;
    });
    addEventListener("blur", () => {
      this.keys.clear();
      this.actionHeld = false;
    });
  }

  /** The action button in the HUD calls these. */
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

  private mouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.mouseLook = true;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.ndc(e.clientX, e.clientY);
      this.state.pointer.down = true;
      if (document.pointerLockElement === this.el) this.actionHeld = true;
    }
    if (e.button === 2) this.actionHeld = true;
  };

  private mouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement === this.el) {
      this.state.look.x += e.movementX;
      this.state.look.y += e.movementY;
      return;
    }
    if (!this.mouseLook) return;
    this.ndc(e.clientX, e.clientY);
    if (!this.direct) {
      this.state.look.x += e.clientX - this.lookLast.x;
      this.state.look.y += e.clientY - this.lookLast.y;
    }
    this.lookLast = { x: e.clientX, y: e.clientY };
  };

  private mouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.mouseLook = false;
      this.state.pointer.down = false;
      if (document.pointerLockElement === this.el) this.actionHeld = false;
    }
    if (e.button === 2) this.actionHeld = false;
  };

  /** Call once per frame before reading `state`; `consume` clears look deltas after. */
  poll(): InputState {
    const k = this.keys;
    let x = this.joyVec.x, y = this.joyVec.y;
    if (k.has("KeyW") || k.has("ArrowUp")) y += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) y -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) x += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.state.move.x = x;
    this.state.move.y = y;
    this.state.sprint = k.has("ShiftLeft") || k.has("ShiftRight");
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
    this.keys.clear();
    if (this.joyEl) this.joyEl.classList.remove("on");
  }
}
