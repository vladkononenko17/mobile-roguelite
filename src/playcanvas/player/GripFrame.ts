import { Mat4, Vec3 } from "playcanvas";
import type { GripFrame } from "../config";

const x = new Vec3();
const y = new Vec3();
const z = new Vec3();

/**
 * The frame of a grip as a matrix (columns: X = axis x palm, Y = axis, Z = palm), with its origin
 * moved `offset` along the palm direction (e.g. from a handle's axis out to its surface).
 */
export function gripMatrix(frame: GripFrame, out = new Mat4(), offset = 0): Mat4 {
  y.set(frame.axis[0], frame.axis[1], frame.axis[2]).normalize();
  z.set(frame.palm[0], frame.palm[1], frame.palm[2]);
  z.sub(x.copy(y).mulScalar(z.dot(y))).normalize();
  x.cross(y, z);
  const d = out.data;
  d[0] = x.x; d[1] = x.y; d[2] = x.z; d[3] = 0;
  d[4] = y.x; d[5] = y.y; d[6] = y.z; d[7] = 0;
  d[8] = z.x; d[9] = z.y; d[10] = z.z; d[11] = 0;
  d[12] = frame.position[0] + z.x * offset;
  d[13] = frame.position[1] + z.y * offset;
  d[14] = frame.position[2] + z.z * offset;
  d[15] = 1;
  return out;
}
