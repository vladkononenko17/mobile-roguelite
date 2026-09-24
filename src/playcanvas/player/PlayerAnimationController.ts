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
  private actionTime = 0;
  private actionDuration = 0;

  constructor(
    private readonly model: Entity,
    private readonly tracks: AnimTrack[],
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
        {
          // Arms and torso only (masked from the spine up), for holding a weapon while the legs
          // keep walking or running. Weight 0 (off) until a weapon pose is set.
          name: "UpperBody",
          states: [{ name: "START" }, { name: "Pose", speed: 1, loop: true }],
          transitions: [{ from: "START", to: "Pose", time: 0 }],
        },
        {
          // One-shot full-body actions (weapon attacks) over everything else; weight 0 when idle.
          name: "Action",
          states: [{ name: "START" }, { name: "Action", speed: 1, loop: false }],
          transitions: [{ from: "START", to: "Action", time: 0 }],
        },
      ],
      parameters: { speed: { name: "speed", type: ANIM_PARAMETER_FLOAT, value: 0 } },
    });
    anim.assignAnimation("Idle", resolved.Idle);
    anim.assignAnimation("Walk", resolved.Walk);
    anim.assignAnimation("Run", resolved.Run);

    const upper = anim.findAnimationLayer("UpperBody")!;
    anim.assignAnimation("Pose", resolved.Idle, "UpperBody");
    upper.weight = 0;
    anim.assignAnimation("Action", resolved.Idle, "Action");
    anim.findAnimationLayer("Action")!.weight = 0;

    const spine = model.findByName(ANIMATION.upperBodyRootBone);
    if (spine) {
      // Mask paths match the animation curve paths: entity names from the model root (included)
      // down to the bone, e.g. "target_character/mixamorig:Hips/mixamorig:Spine".
      const names: string[] = [];
      for (let e: Entity | null = spine as Entity; e; e = e === model ? null : (e.parent as Entity | null)) names.unshift(e.name);
      upper.mask = { [names.join("/")]: { children: true } };
    } else {
      console.warn(`[PlayerAnimation] ${ANIMATION.upperBodyRootBone} not found; weapon poses disabled.`);
    }
  }

  /**
   * Plays `clipName` on the arms and torso only (e.g. a rifle-aiming clip while a gun is held),
   * over the normal locomotion; null returns the whole body to locomotion.
   */
  setUpperBodyPose(clipName: string | null): void {
    const anim = this.model.anim;
    const upper = anim?.findAnimationLayer("UpperBody");
    if (!anim || !upper) return;
    const track = clipName ? findTrack(this.tracks, clipName) : undefined;
    if (clipName && !track) console.warn(`[PlayerAnimation] Upper-body clip ${clipName} not found.`);
    if (track) anim.assignAnimation("Pose", track, "UpperBody");
    upper.weight = track ? 1 : 0;
  }

  /** Plays `clipName` once on the whole body (e.g. a weapon attack). Returns false if missing. */
  playAction(clipName: string): boolean {
    const anim = this.model.anim;
    const layer = anim?.findAnimationLayer("Action");
    const track = findTrack(this.tracks, clipName);
    if (!anim || !layer || !track) {
      console.warn(`[PlayerAnimation] Action clip ${clipName} not found.`);
      return false;
    }
    anim.assignAnimation("Action", track, "Action");
    layer.play("Action");
    this.actionTime = 0;
    this.actionDuration = track.duration;
    return true;
  }

  /** How much the upper-body weapon pose shows right now (0 while none, or under a full-body action). */
  get upperBodyWeight(): number {
    const anim = this.model.anim;
    const upper = anim?.findAnimationLayer("UpperBody")?.weight ?? 0;
    const action = anim?.findAnimationLayer("Action")?.weight ?? 0;
    return upper * (1 - action);
  }

  /** True while a one-shot action is playing. */
  get acting(): boolean {
    return this.actionTime < this.actionDuration;
  }

  get state(): LocomotionState {
    return (this.model.anim?.baseLayer?.activeState ?? "Idle") as LocomotionState;
  }

  update(groundSpeed: number, dt = 0): void {
    const anim = this.model.anim;
    if (!anim) return;
    // Fade the action layer in over the first moments of the clip and out over its last ones.
    const action = anim.findAnimationLayer("Action");
    if (action) {
      if (this.actionTime < this.actionDuration) this.actionTime += dt * anim.speed;
      const fade = ANIMATION.blendTime;
      const t = this.actionTime, d = this.actionDuration;
      action.weight = t >= d ? 0 : math.clamp(Math.min(t / fade, (d - t) / fade), 0, 1);
    }
    anim.setFloat("speed", groundSpeed);
    // Match cadence to ground speed so feet stay planted when walking/running at other speeds.
    let rate = 1;
    const state = this.state;
    if (state === "Walk") rate = groundSpeed / (this.stride.walkNativeSpeed * this.strideScale);
    else if (state === "Run") rate = groundSpeed / (this.stride.runNativeSpeed * this.strideScale);
    anim.speed = state === "Idle" ? 1 : math.clamp(rate, ANIMATION.minPlaybackRate, ANIMATION.maxPlaybackRate);
  }
}
