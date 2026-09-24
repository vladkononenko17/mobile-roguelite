import { Quat, Vec3, type Entity, type GraphNode } from "playcanvas";

const FINGER = /Hand(Index|Middle|Ring|Pinky)([1-3])$/;

/**
 * Closes one hand's fingers around a held weapon. Finger joints bend about their local +X (Mixamo
 * convention); each gets `curlDeg[joint - 1]` more bend on top of its animated rotation, scaled by
 * `weight`. Every clip keys the finger joints (see scripts/build-survivor.mjs), so the animation
 * re-poses them each frame and the extra bend never accumulates. Rigs without finger joints (the
 * Vanguard) are left alone. Run after the animation each frame, like the IK.
 */
export class FingerGrip {
  private readonly fingers: { node: GraphNode; joint: number }[] = [];
  private readonly bend = new Quat();
  private readonly posed = new Quat();

  constructor(model: Entity, side: "Left" | "Right") {
    const hand = model.findByName(`mixamorig:${side}Hand`);
    hand?.forEach((node) => {
      const match = FINGER.exec(node.name);
      if (match) this.fingers.push({ node, joint: Number(match[2]) });
    });
  }

  apply(curlDeg: readonly number[], weight: number): void {
    if (weight <= 0) return;
    weight = Math.min(1, weight);
    for (const { node, joint } of this.fingers) {
      this.bend.setFromAxisAngle(Vec3.RIGHT, (curlDeg[joint - 1] ?? 0) * weight);
      node.setLocalRotation(this.posed.copy(node.getLocalRotation()).mul(this.bend));
    }
  }
}
