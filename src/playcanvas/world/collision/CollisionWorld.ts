import type { Entity, Vec3 } from "playcanvas";

/**
 * Lightweight top-down collision: static 2D shapes on the X/Z ground plane (oriented boxes and
 * circles) and circle movers that move-and-slide against them. No physics engine: a level of a few
 * hundred colliders costs microseconds per frame, with no allocations in the update loop.
 */

/**
 * Collider declaration, in the local space of the entity that carries it. `low`: blocks walking
 * but not shots or sight (lava, pits).
 */
export type ColliderShape =
  | { kind: "box"; width: number; depth: number; low?: boolean }
  | { kind: "circle"; radius: number; low?: boolean };

/** Tag carried by every entity that declares a collider (see `declareCollider`). */
export const SOLID_TAG = "solid";

const declared = new WeakMap<Entity, ColliderShape>();

/**
 * Marks `entity` as solid with `shape` (centred on the entity; boxes follow its yaw). Environment
 * prefabs call this for their blocking parts; `CollisionWorld.addStaticFrom` later collects every
 * tagged entity under a root. Any future level object can join collision the same way.
 */
export function declareCollider(entity: Entity, shape: ColliderShape): void {
  declared.set(entity, shape);
  entity.tags.add(SOLID_TAG);
}

export interface Collider {
  kind: "box" | "circle";
  x: number;
  z: number;
  /** Box half extents along its local axes (circles: radius in both). */
  halfW: number;
  halfD: number;
  /** Box local X axis in world space (cos, sin of the yaw). */
  axisX: number;
  axisZ: number;
  radius: number;
  /** World-space bounding radius, for the broadphase. */
  bound: number;
  /** Blocks movement only; bullets and line of sight pass over it. */
  low: boolean;
  /** Source entity (for debugging / future removal). */
  entity: Entity | null;
  stamp: number;
}

const CELL = 4;
const MAX_SUBSTEPS = 8;
const RESOLVE_ITERATIONS = 4;

function cellKey(ix: number, iz: number): number {
  // Packs two signed cell coordinates (|c| < 32768) into one number key.
  return (ix + 32768) * 65536 + (iz + 32768);
}

export class CollisionWorld {
  readonly colliders: Collider[] = [];
  private readonly grid = new Map<number, Collider[]>();
  private readonly nearby: Collider[] = [];
  private stamp = 0;

  /** Registers every entity tagged `solid` under `root`, using its current world transform. */
  addStaticFrom(root: Entity): number {
    const entities = root.findByTag(SOLID_TAG) as Entity[];
    for (const entity of entities) {
      const shape = declared.get(entity);
      if (shape) this.add(entity, shape);
    }
    return entities.length;
  }

  add(entity: Entity | null, shape: ColliderShape, position?: Vec3, yawDeg?: number): Collider {
    const p = position ?? entity!.getPosition();
    // Boxes only rotate about Y; take the yaw from the entity's world forward vector so nested
    // rotations (prefab yaw + part yaw) compose correctly.
    let axisX = 1, axisZ = 0;
    if (yawDeg !== undefined) {
      axisX = Math.cos((yawDeg * Math.PI) / 180);
      axisZ = -Math.sin((yawDeg * Math.PI) / 180);
    } else if (entity) {
      const right = entity.right;
      const len = Math.hypot(right.x, right.z) || 1;
      axisX = right.x / len;
      axisZ = right.z / len;
    }
    const collider: Collider =
      shape.kind === "box"
        ? {
            kind: "box", x: p.x, z: p.z, halfW: shape.width / 2, halfD: shape.depth / 2, axisX, axisZ, radius: 0,
            bound: Math.hypot(shape.width, shape.depth) / 2, low: shape.low ?? false, entity, stamp: 0,
          }
        : {
            kind: "circle", x: p.x, z: p.z, halfW: shape.radius, halfD: shape.radius, axisX: 1, axisZ: 0,
            radius: shape.radius, bound: shape.radius, low: shape.low ?? false, entity, stamp: 0,
          };
    this.colliders.push(collider);
    this.forCells(collider.x, collider.z, collider.bound, (key) => {
      let bucket = this.grid.get(key);
      if (!bucket) this.grid.set(key, (bucket = []));
      bucket.push(collider);
    });
    return collider;
  }

  /**
   * Moves a circle of `radius` at `position` by `delta` (X/Z), sliding along anything solid.
   * `position` is updated in place. `velocity` (optional) loses the components that pushed into
   * obstacles, so the mover keeps its speed along walls and stops dead only when blocked head-on.
   */
  moveCircle(position: Vec3, radius: number, dx: number, dz: number, velocity?: Vec3): void {
    const travel = Math.hypot(dx, dz);
    // Sub-step so a fast move can never tunnel through a thin fence.
    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(travel / (radius * 0.5))));
    let stepX = dx / steps;
    let stepZ = dz / steps;
    for (let s = 0; s < steps; s++) {
      position.x += stepX;
      position.z += stepZ;
      for (let iteration = 0; iteration < RESOLVE_ITERATIONS; iteration++) {
        let pushed = false;
        const nearby = this.query(position.x, position.z, radius + 0.05);
        for (let i = 0; i < nearby.length; i++) {
          const c = nearby[i];
          // Penetration normal (nx, nz) and depth.
          let nx = 0, nz = 0, depth = 0;
          if (c.kind === "circle") {
            const ox = position.x - c.x, oz = position.z - c.z;
            const dist = Math.hypot(ox, oz);
            depth = radius + c.radius - dist;
            if (depth <= 0) continue;
            if (dist > 1e-6) { nx = ox / dist; nz = oz / dist; } else { nx = 1; nz = 0; }
          } else {
            // Into box space.
            const ox = position.x - c.x, oz = position.z - c.z;
            const lx = ox * c.axisX + oz * c.axisZ;
            const lz = -ox * c.axisZ + oz * c.axisX;
            const cx = Math.max(-c.halfW, Math.min(c.halfW, lx));
            const cz = Math.max(-c.halfD, Math.min(c.halfD, lz));
            let lnx = lx - cx, lnz = lz - cz;
            const dist = Math.hypot(lnx, lnz);
            if (dist > 1e-6) {
              depth = radius - dist;
              if (depth <= 0) continue;
              lnx /= dist; lnz /= dist;
            } else {
              // Centre inside the box: leave through the nearest face.
              const px = c.halfW - Math.abs(lx), pz = c.halfD - Math.abs(lz);
              if (px < pz) { lnx = Math.sign(lx) || 1; lnz = 0; depth = px + radius; }
              else { lnx = 0; lnz = Math.sign(lz) || 1; depth = pz + radius; }
            }
            // Back to world space.
            nx = lnx * c.axisX - lnz * c.axisZ;
            nz = lnx * c.axisZ + lnz * c.axisX;
          }
          position.x += nx * depth;
          position.z += nz * depth;
          // Slide: drop the part of the remaining step (and the velocity) that points into it.
          const intoStep = stepX * nx + stepZ * nz;
          if (intoStep < 0) { stepX -= intoStep * nx; stepZ -= intoStep * nz; }
          if (velocity) {
            const intoVel = velocity.x * nx + velocity.z * nz;
            if (intoVel < 0) { velocity.x -= intoVel * nx; velocity.z -= intoVel * nz; }
          }
          pushed = true;
        }
        if (!pushed) break;
      }
    }
  }

  /** Colliders whose bounds may touch a circle (reused array; valid until the next query). */
  query(x: number, z: number, radius: number): Collider[] {
    const out = this.nearby;
    out.length = 0;
    const stamp = ++this.stamp;
    const x0 = Math.floor((x - radius) / CELL), x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL), z1 = Math.floor((z + radius) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const bucket = this.grid.get(cellKey(ix, iz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const c = bucket[i];
          if (c.stamp === stamp) continue;
          c.stamp = stamp;
          const reach = radius + c.bound;
          if ((c.x - x) * (c.x - x) + (c.z - z) * (c.z - z) <= reach * reach) out.push(c);
        }
      }
    }
    return out;
  }

  private forCells(x: number, z: number, radius: number, visit: (key: number) => void): void {
    const x0 = Math.floor((x - radius) / CELL), x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL), z1 = Math.floor((z + radius) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) visit(cellKey(ix, iz));
  }
}
