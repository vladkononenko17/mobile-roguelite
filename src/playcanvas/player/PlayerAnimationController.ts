import {
  ANIM_GREATER_THAN,
  ANIM_LESS_THAN,
  ANIM_PARAMETER_FLOAT,
  math,
  type AnimTrack,
  type Entity,
} from "playcanvas";
import { ANIMATION, IDLE, type CharacterModel } from "../config";
import { createBreathingIdle } from "./BreathingIdle";

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
  /** Character scale; a bigger body covers more ground per stride, so clips play slower. */
  strideScale = 1;

  constructor(
    private readonly model: Entity,
    tracks: AnimTrack[],
    private readonly stride: Pick<CharacterModel, "walkNativeSpeed" | "runNativeSpeed" | "clips" | "proceduralIdle">,
  ) {
    const clips = { ...ANIMATION.clips, ...stride.clips };
    const idleClip = findTrack(tracks, clips.idle);
    const procedural = stride.proceduralIdle ?? IDLE.procedural;
    const idle = idleClip && procedural ? createBreathingIdle(idleClip) : idleClip;
    const walk = findTrack(tracks, clips.walk);
    const run = findTrack(tracks, clips.run);
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
    if (state === "Walk") rate = groundSpeed / (this.stride.walkNativeSpeed * this.strideScale);
    else if (state === "Run") rate = groundSpeed / (this.stride.runNativeSpeed * this.strideScale);
    anim.speed = state === "Idle" ? 1 : math.clamp(rate, ANIMATION.minPlaybackRate, ANIMATION.maxPlaybackRate);
  }
}
