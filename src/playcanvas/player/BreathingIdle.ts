import { AnimCurve, AnimData, AnimTrack, Quat, Vec3 } from "playcanvas";
import { IDLE } from "../config";

interface CurvePath {
  entityPath: string[];
  component: string;
  propertyPath: string[];
}

type Axis = "x" | "y" | "z";
/** Bone-local rotation offset in degrees as a function of the breath amount b (0 = exhaled, 1 = inhaled). */
type RotationOffset = { axis: Axis; degrees: (b: number) => number }[];

const AXES: Record<Axis, Vec3> = { x: Vec3.RIGHT, y: Vec3.UP, z: Vec3.BACK };

/**
 * Local axes were measured on the Mixamo-style rig shared by both GLBs:
 * - upper arm local Z lowers the left arm when negative and the right arm when positive;
 * - forearm local +X bends the elbow forward;
 * - spine local -X arches the chest back (inhale), shoulder local +X lifts the shoulder.
 */
function boneOffsets(): Record<string, RotationOffset> {
  const { armRelaxDeg, armBreathDeg, elbowBendDeg, chestDeg, shoulderDeg } = IDLE;
  return {
    "mixamorig:Spine": [{ axis: "x", degrees: (b) => -0.4 * chestDeg * b }],
    "mixamorig:Spine1": [{ axis: "x", degrees: (b) => -0.7 * chestDeg * b }],
    "mixamorig:Spine2": [{ axis: "x", degrees: (b) => -chestDeg * b }],
    // Counter-rotate so the head stays level while the chest lifts.
    "mixamorig:Neck": [{ axis: "x", degrees: (b) => 1.1 * chestDeg * b }],
    "mixamorig:Head": [{ axis: "x", degrees: (b) => 0.9 * chestDeg * b }],
    "mixamorig:LeftShoulder": [{ axis: "x", degrees: (b) => shoulderDeg * b }],
    "mixamorig:RightShoulder": [{ axis: "x", degrees: (b) => shoulderDeg * b }],
    // Drop the A-pose arms into a relaxed stance; they drift out a little on each inhale.
    "mixamorig:LeftArm": [{ axis: "z", degrees: (b) => -armRelaxDeg + armBreathDeg * b }],
    "mixamorig:RightArm": [{ axis: "z", degrees: (b) => armRelaxDeg - armBreathDeg * b }],
    "mixamorig:LeftForeArm": [{ axis: "x", degrees: (b) => elbowBendDeg + 0.5 * armBreathDeg * b }],
    "mixamorig:RightForeArm": [{ axis: "x", degrees: (b) => elbowBendDeg + 0.5 * armBreathDeg * b }],
  };
}

/**
 * Builds a looping "breathing" idle from the GLB's static rest pose: every channel of the rest
 * pose is copied, and a handful of bones get small periodic offsets. The GLB is not modified;
 * this is a stand-in until a hand-made Idle clip exists.
 */
export function createBreathingIdle(restPose: AnimTrack): AnimTrack {
  const samples = IDLE.samples;
  const period = IDLE.periodSeconds;
  const times = new Float32Array(samples + 1);
  const breath = new Float32Array(samples + 1);
  for (let i = 0; i <= samples; i++) {
    times[i] = (i / samples) * period;
    // Smooth 0 -> 1 -> 0; the last key equals the first so the loop is seamless.
    breath[i] = (1 - Math.cos((i / samples) * Math.PI * 2)) / 2;
  }

  const offsets = boneOffsets();
  const base = new Quat();
  const delta = new Quat();
  const step = new Quat();
  const result = new Quat();
  const outputs: AnimData[] = [];
  const curves: AnimCurve[] = [];

  for (const curve of restPose.curves) {
    const path = (curve.paths as unknown as CurvePath[])[0];
    const bone = path.entityPath[path.entityPath.length - 1];
    const property = path.propertyPath[0];
    const source = restPose.outputs[curve.output];
    const components = source.components;
    const first = Array.from(source.data.slice(0, components));
    const data = new Float32Array((samples + 1) * components);

    for (let i = 0; i <= samples; i++) {
      const o = i * components;
      if (property === "localRotation" && offsets[bone]) {
        base.set(first[0], first[1], first[2], first[3]);
        delta.set(0, 0, 0, 1);
        for (const { axis, degrees } of offsets[bone]) {
          step.setFromAxisAngle(AXES[axis], degrees(breath[i]));
          delta.mul(step);
        }
        result.mul2(base, delta);
        data[o] = result.x; data[o + 1] = result.y; data[o + 2] = result.z; data[o + 3] = result.w;
      } else {
        data.set(first, o);
        // Hips sink a touch on the exhale.
        if (property === "localPosition" && bone === "mixamorig:Hips") data[o + 1] -= IDLE.hipDropMetres * (1 - breath[i]);
      }
    }

    outputs.push(new AnimData(components, data));
    curves.push(new AnimCurve(curve.paths, 0, outputs.length - 1, curve.interpolation));
  }

  return new AnimTrack("Breathing (procedural)", period, [new AnimData(1, times)], outputs, curves);
}
