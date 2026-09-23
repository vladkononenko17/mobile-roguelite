import type { Vec2 } from "playcanvas";
import type { MoveInputSource } from "./MoveInput";

/**
 * Floating virtual joystick: the first touch on the game surface becomes the stick centre,
 * dragging sets direction and magnitude (a light push walks, a full push runs).
 */
export class TouchJoystickInput implements MoveInputSource {
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private x = 0;
  private y = 0;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;

  constructor(private readonly surface: HTMLElement, private readonly radiusPx = 64) {
    this.base = document.createElement("div");
    this.base.className = "joystick";
    this.knob = document.createElement("div");
    this.knob.className = "joystick-knob";
    this.base.append(this.knob);
    document.body.append(this.base);

    surface.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
  }

  read(out: Vec2): void {
    out.set(this.x, this.y);
  }

  destroy(): void {
    this.surface.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    this.base.remove();
  }

  private readonly onDown = (event: PointerEvent): void => {
    // Mouse stays on the keyboard path; this is for touch and pen.
    if (event.pointerType === "mouse" || this.pointerId !== null) return;
    this.pointerId = event.pointerId;
    this.originX = event.clientX;
    this.originY = event.clientY;
    this.base.style.transform = `translate(${this.originX}px, ${this.originY}px)`;
    this.knob.style.transform = "translate(0px, 0px)";
    this.base.classList.add("active");
    event.preventDefault();
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    let dx = event.clientX - this.originX;
    let dy = event.clientY - this.originY;
    const length = Math.hypot(dx, dy);
    if (length > this.radiusPx) {
      dx = (dx / length) * this.radiusPx;
      dy = (dy / length) * this.radiusPx;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Screen y grows downwards; move input uses +y = up.
    this.x = dx / this.radiusPx;
    this.y = -dy / this.radiusPx;
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.x = this.y = 0;
    this.base.classList.remove("active");
  };
}
