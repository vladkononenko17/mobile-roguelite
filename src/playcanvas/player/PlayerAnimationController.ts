import {
  ANIM_GREATER_THAN,
  ANIM_LESS_THAN,
  ANIM_PARAMETER_FLOAT,
  math,
  type AnimTrack,
  type Entity,
} from "playcanvas";
import { ANIMATION } from "../config";

export type LocomotionState = "Idle" | "Walk" | "Run";

function findTrack(tracks: AnimTrack[], name: string): AnimTrack | undefined {
  const wanted = name.toLowerCase();
  return tracks.find((track) => track.name.toLowerCase() === wanted)
    ?? tracks.find((track) => track.name.toLowerCase().includes(wanted));
}

/**
 * Drives an anim-component state graph (Idle / Walk / Run) from the character's ground speed.
 * Transitions are cross-faded by PlayCanvas; playback rate is scaled to the ground speed to
 * keep foot sliding down.
 */
export class PlayerAnimationController {
  readonly clipNames: Record<LocomotionState, string>;

  constructor(private readonly model: Entity, tracks: AnimTrack[]) {
    const idle = findTrack(tracks, ANIMATION.clips.idle);
    const walk = findTrack(tracks, ANIMATION.clips.walk);
    const run = findTrack(tracks, ANIMATION.clips.run);
    if (!walk || !run || !idle) {
      const available = tracks.map((track) => track.name).join(", ") || "none";
      console.warn(`[PlayerAnimation] Missing clip(s). Available: ${available}`);
    }
    const fallback = run ?? walk ?? idle ?? tracks[0];
    if (!fallback) throw new Error("Character GLB contains no animation clips.");
    const resolved = { Idle: idle ?? fallback, Walk: walk ?? fallback, Run: run ?? fallback };
    this.clipNames = { Idle: resolved.Idle.name, Walk: resolved.Walk.name, Run: resolved.Run.name };

    const t = ANIMATION.blendTime;
    const faster = (value: number) => [{ parameterName: "speed", predicate: ANIM_GREATER_THAN, value }];
    const slower = (value: number) => [{ parameterName: "speed", predicate: ANIM_LESS_THAN, value }];

    model.addComponent("anim", { activate: true });
    const anim = model.anim!;
    anim.loadStateGraph({
      layers: [
        {
          name: "Locomotion",
          states: [
            { name: "START" },
            { name: "Idle", speed: 1, loop: true },
            { name: "Walk", speed: 1, loop: true },
            { name: "Run", speed: 1, loop: true },
          ],
          transitions: [
            { from: "START", to: "Idle", time: 0 },
            { from: "Idle", to: "Walk", time: t, conditions: faster(ANIMATION.idleToWalkSpeed) },
            { from: "Idle", to: "Run", time: t, conditions: faster(ANIMATION.walkToRunSpeed) },
            { from: "Walk", to: "Run", time: t, conditions: faster(ANIMATION.walkToRunSpeed) },
            { from: "Walk", to: "Idle", time: t, conditions: slower(ANIMATION.idleToWalkSpeed) },
            { from: "Run", to: "Walk", time: t, conditions: slower(ANIMATION.walkToRunSpeed) },
            { from: "Run", to: "Idle", time: t, conditions: slower(ANIMATION.idleToWalkSpeed) },
          ],
        },
      ],
      parameters: { speed: { name: "speed", type: ANIM_PARAMETER_FLOAT, value: 0 } },
    });
    anim.assignAnimation("Idle", resolved.Idle);
    anim.assignAnimation("Walk", resolved.Walk);
    anim.assignAnimation("Run", resolved.Run);
  }

  get state(): LocomotionState {
    return (this.model.anim?.baseLayer?.activeState ?? "Idle") as LocomotionState;
  }

  update(groundSpeed: number): void {
    const anim = this.model.anim;
    if (!anim) return;
    anim.setFloat("speed", groundSpeed);
    // Match cadence to ground speed so feet stay planted when walking/running at other speeds.
    let rate = 1;
    const state = this.state;
    if (state === "Walk") rate = groundSpeed / ANIMATION.walkNativeSpeed;
    else if (state === "Run") rate = groundSpeed / ANIMATION.runNativeSpeed;
    anim.speed = state === "Idle" ? 1 : math.clamp(rate, ANIMATION.minPlaybackRate, ANIMATION.maxPlaybackRate);
  }
}
