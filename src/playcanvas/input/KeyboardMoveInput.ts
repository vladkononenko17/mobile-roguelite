import type { Vec2 } from "playcanvas";
import type { MoveInputSource } from "./MoveInput";

const UP = new Set(["KeyW", "ArrowUp"]);
const DOWN = new Set(["KeyS", "ArrowDown"]);
const LEFT = new Set(["KeyA", "ArrowLeft"]);
const RIGHT = new Set(["KeyD", "ArrowRight"]);
const WALK = new Set(["ShiftLeft", "ShiftRight"]);

/** WASD / arrow keys. Holding Shift scales the vector down to walking magnitude. */
export class KeyboardMoveInput implements MoveInputSource {
  private up = false;
  private down = false;
  private left = false;
  private right = false;
  private walk = false;

  constructor(private readonly walkMagnitude: number, private readonly target: Window = window) {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  read(out: Vec2): void {
    const x = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    const y = (this.up ? 1 : 0) - (this.down ? 1 : 0);
    out.set(x, y);
    if (x !== 0 || y !== 0) out.normalize().mulScalar(this.walk ? this.walkMagnitude : 1);
  }

  destroy(): void {
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("blur", this.onBlur);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.set(event.code, true)) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.set(event.code, false);
  };

  private readonly onBlur = (): void => {
    this.up = this.down = this.left = this.right = this.walk = false;
  };

  private set(code: string, pressed: boolean): boolean {
    if (UP.has(code)) this.up = pressed;
    else if (DOWN.has(code)) this.down = pressed;
    else if (LEFT.has(code)) this.left = pressed;
    else if (RIGHT.has(code)) this.right = pressed;
    else if (WALK.has(code)) this.walk = pressed;
    else return false;
    return true;
  }
}
