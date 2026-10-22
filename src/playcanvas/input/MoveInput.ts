import { Vec2 } from "playcanvas";

/**
 * A source of 2D movement intent in screen space: +x = right, +y = up (away from the camera).
 * Length is the analog magnitude in [0, 1]; 1 = run, lower values walk.
 * Keyboard, a future on-screen joystick and gamepads all implement this.
 */
export interface MoveInputSource {
  read(out: Vec2): void;
  destroy(): void;
}

/** Picks whichever source is pushed hardest, so keyboard and touch can coexist. */
export class CombinedMoveInput implements MoveInputSource {
  private readonly scratch = new Vec2();

  constructor(private readonly sources: MoveInputSource[]) {}

  read(out: Vec2): void {
    out.set(0, 0);
    let best = 0;
    for (const source of this.sources) {
      source.read(this.scratch);
      const lengthSq = this.scratch.lengthSq();
      if (lengthSq > best) {
        best = lengthSq;
        out.copy(this.scratch);
      }
    }
  }

  destroy(): void {
    for (const source of this.sources) source.destroy();
  }
}
