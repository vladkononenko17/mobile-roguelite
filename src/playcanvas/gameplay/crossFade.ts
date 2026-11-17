import type { AnimComponentLayer } from "playcanvas";

/**
 * Cross-fades an animation layer to state `name` over `seconds`. Re-entering the state the layer is
 * already in (an attack chained straight onto an attack) restarts it instead: PlayCanvas's anim
 * controller throws when asked for a transition from a state to itself while it is still blending
 * into it, and a throw there stops the whole game loop. A looping state ("Move") already playing is
 * left alone. Any other failure falls back to a cut.
 */
export function crossFade(layer: AnimComponentLayer | null | undefined, name: string, seconds: number): void {
  if (!layer) return;
  if (layer.activeState === name) {
    if (name !== "Move") layer.activeStateCurrentTime = 0;
    return;
  }
  try {
    layer.transition(name, seconds);
  } catch {
    layer.play(name);
  }
}
