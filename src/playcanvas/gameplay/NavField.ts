import type { CollisionWorld } from "../world/collision/CollisionWorld";

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const DIAGONAL = Math.SQRT2;
const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, DIAGONAL], [1, -1, DIAGONAL], [-1, 1, DIAGONAL], [-1, -1, DIAGONAL],
];

/**
 * Navigation for chasing enemies: a grid over the arena (walkable = no static collider within
 * `clearance` of the cell centre) and a distance field from the player's cell, rebuilt a few times a
 * second (Dijkstra over ~4k cells). An enemy steers toward the neighbouring cell with the lowest
 * distance, so crowds route around walls and buildings instead of grinding into them.
 */
export class NavField {
  cols = 0;
  rows = 0;
  private walkable = new Uint8Array(0);
  private distance = new Float32Array(0);
  private heap = new Int32Array(0);
  private heapSize = 0;
  private sourceIndex = -1;
  private bounds: Bounds;

  constructor(
    private readonly collision: CollisionWorld,
    bounds: Bounds,
    private readonly cell = 1,
    private readonly clearance = 0.45,
  ) {
    this.bounds = bounds;
    this.setBounds(bounds);
  }

  /** Re-grids over `bounds` (a level's region of a large map); keeps the cost per rebuild small. */
  setBounds(bounds: Bounds): void {
    this.bounds = bounds;
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / this.cell);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / this.cell);
    const count = this.cols * this.rows;
    this.walkable = new Uint8Array(count);
    this.distance = new Float32Array(count).fill(Infinity);
    this.heap = new Int32Array(count * 8);
    this.sourceIndex = -1;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = bounds.minX + (c + 0.5) * this.cell;
        const z = bounds.minZ + (r + 0.5) * this.cell;
        this.walkable[r * this.cols + c] = blocked(this.collision, x, z, this.clearance) ? 0 : 1;
      }
    }
  }

  /** Cell index containing (x, z), or -1 outside the grid. */
  indexAt(x: number, z: number): number {
    const c = Math.floor((x - this.bounds.minX) / this.cell);
    const r = Math.floor((z - this.bounds.minZ) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  isWalkable(x: number, z: number): boolean {
    const i = this.indexAt(x, z);
    return i >= 0 && this.walkable[i] === 1;
  }

  /** True when (x, z) is walkable and connected to the current source (the player). */
  isReachable(x: number, z: number): boolean {
    const i = this.indexAt(x, z);
    return i >= 0 && this.walkable[i] === 1 && Number.isFinite(this.distance[i]);
  }

  /** Path distance (m) from (x, z) to the source, Infinity if unreachable. */
  distanceAt(x: number, z: number): number {
    const i = this.indexAt(x, z);
    return i < 0 ? Infinity : this.distance[i];
  }

  /** Recomputes the distance field from (x, z) (the player). */
  build(x: number, z: number): void {
    let source = this.indexAt(x, z);
    if (source < 0) return;
    if (!this.walkable[source]) source = this.nearestWalkable(source);
    if (source < 0) return;
    this.sourceIndex = source;
    const { cols, rows, walkable, distance } = this;
    distance.fill(Infinity);
    distance[source] = 0;
    this.heapSize = 0;
    this.push(source);
    while (this.heapSize > 0) {
      const i = this.pop();
      const d = distance[i];
      const c = i % cols;
      const r = (i - c) / cols;
      for (const [dc, dr, cost] of NEIGHBOURS) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const n = nr * cols + nc;
        if (!walkable[n]) continue;
        // No corner cutting past blocked cells.
        if (dc !== 0 && dr !== 0 && (!walkable[r * cols + nc] || !walkable[nr * cols + c])) continue;
        const nd = d + cost * this.cell;
        if (nd < distance[n]) {
          distance[n] = nd;
          this.push(n);
        }
      }
    }
  }

  /**
   * Direction (unit, written to `out` as [x, z]) toward the source from (x, z): toward the centre of
   * the lowest-distance neighbour cell. Returns false if there is no route (then steer directly).
   */
  direction(x: number, z: number, out: { x: number; z: number }): boolean {
    const i = this.indexAt(x, z);
    if (i < 0 || !Number.isFinite(this.distance[i])) return false;
    if (i === this.sourceIndex) return false;
    const { cols, rows, walkable, distance } = this;
    const c = i % cols;
    const r = (i - c) / cols;
    let best = distance[i];
    let bestIndex = -1;
    for (const [dc, dr] of NEIGHBOURS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const n = nr * cols + nc;
      if (!walkable[n]) continue;
      if (dc !== 0 && dr !== 0 && (!walkable[r * cols + nc] || !walkable[nr * cols + c])) continue;
      if (distance[n] < best) {
        best = distance[n];
        bestIndex = n;
      }
    }
    if (bestIndex < 0) return false;
    const bc = bestIndex % cols;
    const br = (bestIndex - bc) / cols;
    const tx = this.bounds.minX + (bc + 0.5) * this.cell - x;
    const tz = this.bounds.minZ + (br + 0.5) * this.cell - z;
    const length = Math.hypot(tx, tz) || 1;
    out.x = tx / length;
    out.z = tz / length;
    return true;
  }

  private nearestWalkable(index: number): number {
    const c0 = index % this.cols;
    const r0 = (index - c0) / this.cols;
    for (let radius = 1; radius < 6; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const c = c0 + dc, r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          const i = r * this.cols + c;
          if (this.walkable[i]) return i;
        }
      }
    }
    return -1;
  }

  // Binary min-heap on distance.
  private push(i: number): void {
    const heap = this.heap;
    if (this.heapSize >= heap.length) return;
    let k = this.heapSize++;
    heap[k] = i;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (this.distance[heap[parent]] <= this.distance[heap[k]]) break;
      [heap[parent], heap[k]] = [heap[k], heap[parent]];
      k = parent;
    }
  }

  private pop(): number {
    const heap = this.heap;
    const top = heap[0];
    heap[0] = heap[--this.heapSize];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      let m = k;
      if (l < this.heapSize && this.distance[heap[l]] < this.distance[heap[m]]) m = l;
      if (r < this.heapSize && this.distance[heap[r]] < this.distance[heap[m]]) m = r;
      if (m === k) break;
      [heap[m], heap[k]] = [heap[k], heap[m]];
      k = m;
    }
    return top;
  }
}

/** True if a circle at (x, z) overlaps any static collider. */
export function blocked(collision: CollisionWorld, x: number, z: number, radius: number, shots = false): boolean {
  for (const c of collision.query(x, z, radius)) {
    // Shots and sight pass over low obstacles (lava).
    if (shots && c.low) continue;
    if (c.kind === "circle") {
      if (Math.hypot(x - c.x, z - c.z) < radius + c.radius) return true;
    } else {
      const ox = x - c.x, oz = z - c.z;
      const lx = ox * c.axisX + oz * c.axisZ;
      const lz = -ox * c.axisZ + oz * c.axisX;
      const cx = Math.max(-c.halfW, Math.min(c.halfW, lx));
      const cz = Math.max(-c.halfD, Math.min(c.halfD, lz));
      if (Math.hypot(lx - cx, lz - cz) < radius) return true;
    }
  }
  return false;
}
