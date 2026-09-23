import { calculateTangents, Mesh, SEMANTIC_TANGENT, type GraphicsDevice } from "playcanvas";

export interface BoxOptions {
  /** Chamfer width in metres (clamped to fit). 0 = sharp box. */
  bevel?: number;
  /** Axis the texture's V direction (its "grain": plank boards, rust streaks) follows. Default
   * "y": up on side faces. Use the plank's long axis for horizontal boards and slats. */
  grain?: "x" | "y" | "z";
  /** Skip the bottom face (pieces that always sit on the ground). */
  noBottom?: boolean;
}

type V3 = [number, number, number];

const cache = new Map<string, Mesh>();

/** Small deterministic hash for per-mesh UV offsets, so repeated pieces don't all start on the
 * same texel. */
function hashOffset(key: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return [((h >>> 0) % 997) / 997 * 7, ((h >>> 10) % 991) / 991 * 7];
}

/**
 * Box-projected UVs in metres: faces facing mostly sideways map (horizontal, -Y) so texture
 * "up" is world up; faces facing up/down map (X, Z). The material's tiling (1 / tileMetres) turns
 * metres into repeats, which keeps texel density identical for every size of piece.
 */
function uvFor(p: V3, n: V3, grain: "x" | "y" | "z", offset: [number, number]): [number, number] {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  let u: number;
  let v: number;
  if (ay > ax && ay > az) {
    u = p[0];
    v = p[2];
  } else if (ax >= az) {
    u = n[0] > 0 ? -p[2] : p[2];
    v = -p[1];
  } else {
    u = n[2] > 0 ? p[0] : -p[0];
    v = -p[1];
  }
  const top = ay > ax && ay > az;
  if (grain === "x") {
    // V along local X on every face that X runs across.
    if (top) [u, v] = [p[2], p[0]];
    else if (az > ax) [u, v] = [-p[1], p[0]];
  } else if (grain === "z") {
    if (ax >= az && !top) [u, v] = [-p[1], p[2]];
  }
  return [u + offset[0], v + offset[1]];
}

class Builder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  constructor(private readonly grain: "x" | "y" | "z", private readonly offset: [number, number]) {}

  /** Adds a flat convex polygon; winding is fixed up to face `normal`. */
  polygon(points: V3[], normal: V3): void {
    const len = Math.hypot(...normal);
    const n: V3 = [normal[0] / len, normal[1] / len, normal[2] / len];
    const a = points[0], b = points[1], c = points[2];
    const cross: V3 = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    const pts = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0 ? [...points].reverse() : points;
    const base = this.positions.length / 3;
    for (const p of pts) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.uvs.push(...uvFor(p, n, this.grain, this.offset));
    }
    for (let i = 1; i < pts.length - 1; i++) this.indices.push(base, base + i, base + i + 1);
  }

  build(device: GraphicsDevice): Mesh {
    const mesh = new Mesh(device);
    mesh.setPositions(this.positions);
    mesh.setNormals(this.normals);
    mesh.setUvs(0, this.uvs);
    mesh.setVertexStream(SEMANTIC_TANGENT, calculateTangents(this.positions, this.normals, this.uvs, this.indices), 4);
    mesh.setIndices(this.indices);
    mesh.update();
    return mesh;
  }
}

/**
 * Chamfered box centred on the origin: 6 faces, 12 45-degree edge strips and 8 corner triangles
 * (44 triangles). Flat-shaded chamfers catch the light along every edge, which reads far better
 * at game-camera distance than a sharp primitive cube, for a handful of extra triangles.
 */
export function boxMesh(device: GraphicsDevice, width: number, height: number, depth: number, options: BoxOptions = {}): Mesh {
  const hx = width / 2, hy = height / 2, hz = depth / 2;
  const bevel = Math.max(0, Math.min(options.bevel ?? 0, hx * 0.45, hy * 0.45, hz * 0.45));
  const key = `box|${width.toFixed(3)}|${height.toFixed(3)}|${depth.toFixed(3)}|${bevel.toFixed(3)}|${options.grain ?? "y"}|${!!options.noBottom}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const b = new Builder(options.grain ?? "y", hashOffset(key));
  const ix = hx - bevel, iy = hy - bevel, iz = hz - bevel;
  const signs = [-1, 1];

  // Main faces.
  for (const s of signs) {
    b.polygon([[s * hx, -iy, -iz], [s * hx, iy, -iz], [s * hx, iy, iz], [s * hx, -iy, iz]], [s, 0, 0]);
    if (!(options.noBottom && s < 0)) b.polygon([[-ix, s * hy, -iz], [ix, s * hy, -iz], [ix, s * hy, iz], [-ix, s * hy, iz]], [0, s, 0]);
    b.polygon([[-ix, -iy, s * hz], [ix, -iy, s * hz], [ix, iy, s * hz], [-ix, iy, s * hz]], [0, 0, s]);
  }

  if (bevel > 0) {
    // Edge chamfers.
    for (const sx of signs) for (const sy of signs) {
      if (options.noBottom && sy < 0) continue;
      b.polygon([[sx * hx, sy * iy, -iz], [sx * ix, sy * hy, -iz], [sx * ix, sy * hy, iz], [sx * hx, sy * iy, iz]], [sx, sy, 0]);
    }
    for (const sy of signs) for (const sz of signs) {
      if (options.noBottom && sy < 0) continue;
      b.polygon([[-ix, sy * hy, sz * iz], [ix, sy * hy, sz * iz], [ix, sy * iy, sz * hz], [-ix, sy * iy, sz * hz]], [0, sy, sz]);
    }
    for (const sx of signs) for (const sz of signs) {
      b.polygon([[sx * hx, -iy, sz * iz], [sx * hx, iy, sz * iz], [sx * ix, iy, sz * hz], [sx * ix, -iy, sz * hz]], [sx, 0, sz]);
    }
    // Corner triangles.
    for (const sx of signs) for (const sy of signs) for (const sz of signs) {
      if (options.noBottom && sy < 0) continue;
      b.polygon([[sx * hx, sy * iy, sz * iz], [sx * ix, sy * hy, sz * iz], [sx * ix, sy * iy, sz * hz]], [sx, sy, sz]);
    }
  }

  const mesh = b.build(device);
  cache.set(key, mesh);
  return mesh;
}

/**
 * Flat, upward-facing ground quad spanning [x0, x1] x [z0, z1] in world space, with UV0 in world
 * metres (so neighbouring quads with the same material line up seamlessly) and UV1 in 0..1 over
 * the quad (for masks).
 */
export function groundQuadMesh(device: GraphicsDevice, x0: number, z0: number, x1: number, z1: number): Mesh {
  const positions = [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1];
  const normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  const uvs = [x0, z0, x1, z0, x1, z1, x0, z1];
  // V of the mask runs from the far (z0) edge to the near (z1) edge.
  const uv1 = [0, 0, 1, 0, 1, 1, 0, 1];
  const indices = [0, 2, 1, 0, 3, 2];
  const mesh = new Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setUvs(1, uv1);
  mesh.setVertexStream(SEMANTIC_TANGENT, calculateTangents(positions, normals, uvs, indices), 4);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}
