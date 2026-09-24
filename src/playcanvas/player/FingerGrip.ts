import { Quat, Vec3, type Entity, type GraphNode } from "playcanvas";
import { FINGER_GRIP, type CharacterModel } from "../config";

const FINGER = /Hand(Thumb|Index|Middle|Ring|Pinky)(\d)$/;

interface FingerChain {
  finger: string;
  /** Bending joints from the knuckle out (up to three). */
  joints: GraphNode[];
  /** The fingertip (end joint). */
  tip: GraphNode;
}

/**
 * Procedural finger grip for one hand, applied after the animation each frame: every finger joint
 * bends toward the palm (about the rig's curl axis, on top of its animated rotation) until the finger
 * touches the held handle, modelled as a cylinder (weapon grip axis + radius). So fingers wrap a
 * thin pistol grip further than a thick handguard, instead of closing into a fixed fist.
 *
 * Works from the bones that exist: chains are found by name (Thumb / Index / Middle / Ring / Pinky
 * + joint number). With a `rigid` rig (the whole finger skinned to its first joint) only that joint
 * bends and contact is measured at the chain tip. On a rig with separate fingers the right index
 * finger stops short of a full wrap (trigger finger). The animation re-keys the finger joints every
 * frame, so the added bend never accumulates.
 */
export class FingerGrip {
  private readonly chains: FingerChain[] = [];
  private readonly axis = new Vec3();
  private readonly base = new Quat();
  private readonly bend = new Quat();
  private readonly posed = new Quat();
  private readonly toPoint = new Vec3();

  constructor(
    model: Entity,
    private readonly side: "Left" | "Right",
    private readonly rig: NonNullable<CharacterModel["fingers"]>,
  ) {
    this.axis.set(rig.curlAxis[0], rig.curlAxis[1], rig.curlAxis[2]).normalize();
    const byFinger = new Map<string, GraphNode[]>();
    model.findByName(`mixamorig:${side}Hand`)?.forEach((node) => {
      const match = FINGER.exec(node.name);
      if (!match) return;
      const list = byFinger.get(match[1]) ?? [];
      list[Number(match[2]) - 1] = node;
      byFinger.set(match[1], list);
    });
    for (const [finger, nodes] of byFinger) {
      const chain = nodes.filter(Boolean);
      if (chain.length < 2) continue;
      this.chains.push({ finger, joints: chain.slice(0, Math.min(3, chain.length - 1)), tip: chain[chain.length - 1] });
    }
  }

  /** Finger names found on this hand (for reporting). */
  get fingers(): string[] {
    return this.chains.map((c) => c.finger);
  }

  /** Wraps the fingers around the cylinder through `origin` along unit `direction` with `radius`. */
  apply(origin: Vec3, direction: Vec3, radius: number, weight: number): void {
    if (weight <= 0 || !this.chains.length) return;
    weight = Math.min(1, weight);
    const contact = radius + this.rig.thickness;
    for (const chain of this.chains) {
      const joints = this.rig.rigid ? chain.joints.slice(0, 1) : chain.joints;
      const scale = this.side === "Right" && chain.finger === "Index" && !this.rig.rigid ? FINGER_GRIP.triggerCurl : 1;
      joints.forEach((joint, i) => {
        const probe = this.rig.rigid || i === joints.length - 1 ? chain.tip : joints[i + 1];
        this.base.copy(joint.getLocalRotation());
        let best = 0;
        let bestDistance = Infinity;
        for (let angle = 0; angle <= FINGER_GRIP.maxCurlDeg; angle += FINGER_GRIP.stepDeg) {
          joint.setLocalRotation(this.posed.copy(this.base).mul(this.bend.setFromAxisAngle(this.axis, angle)));
          const distance = distanceToLine(probe.getPosition(), origin, direction, this.toPoint);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = angle;
          }
          if (distance <= contact) break;
        }
        joint.setLocalRotation(this.posed.copy(this.base).mul(this.bend.setFromAxisAngle(this.axis, best * scale * weight)));
      });
    }
  }
}

function distanceToLine(point: Vec3, origin: Vec3, direction: Vec3, scratch: Vec3): number {
  scratch.sub2(point, origin);
  const along = scratch.dot(direction);
  return Math.sqrt(Math.max(0, scratch.lengthSq() - along * along));
}
