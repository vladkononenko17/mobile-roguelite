import * as THREE from "three";
import type { CleanSurface } from "../clean/surface";
import type { WorkKind } from "../content";

/**
 * Everything the game needs to know about the built world, gathered while
 * the house and yard are built: cleanable surfaces, walls to bump into, floor
 * heights to stand on, meshes that block the crosshair and things to use.
 */

export interface Box2 {
  x0: number; x1: number; z0: number; z1: number;
  /** Vertical extent; the player only collides when overlapping it. */
  y0: number; y1: number;
}

export interface Circle { x: number; z: number; r: number; y0: number; y1: number }

/** A walkable rectangle at a height (house floor, deck, steps). `ramp` slopes along an axis. */
export interface Platform {
  x0: number; x1: number; z0: number; z1: number; y: number;
  ramp?: { axis: "x" | "z"; from: number; to: number; y0: number; y1: number };
}

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  /** How close the player must be (metres from the eye). */
  reach: number;
  kind: WorkKind | "ladder" | "chem" | "use";
  label: () => string;
  enabled: () => boolean;
  /** Seconds to hold; 0 = instant. */
  hold: number;
  act: () => void;
  /** Optional mesh for aiming; otherwise a sphere of `aimR` around `pos`. */
  aimR?: number;
}

export class WorldIndex {
  surfaces: CleanSurface[] = [];
  boxes: Box2[] = [];
  circles: Circle[] = [];
  platforms: Platform[] = [];
  /** Meshes the crosshair can hit (walls, floors, furniture proxies, surfaces). */
  solids: THREE.Object3D[] = [];
  interactables: Interactable[] = [];

  addSurface(s: CleanSurface): CleanSurface {
    this.surfaces.push(s);
    for (const m of s.meshes) if (!this.solids.includes(m)) this.solids.push(m);
    return s;
  }

  /** Blocks the player with a mesh's world bounding box. */
  blockMesh(o: THREE.Object3D, pad = 0): void {
    o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty()) return;
    this.boxes.push({ x0: b.min.x - pad, x1: b.max.x + pad, z0: b.min.z - pad, z1: b.max.z + pad, y0: b.min.y, y1: b.max.y });
  }

  block(x0: number, x1: number, z0: number, z1: number, y0 = -1, y1 = 3): void {
    this.boxes.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1 });
  }

  /** Floor height under a point (ground = 0). */
  groundAt(x: number, z: number, feetY = 0): number {
    let y = 0;
    for (const p of this.platforms) {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      let h = p.y;
      if (p.ramp) {
        const r = p.ramp;
        const t = THREE.MathUtils.clamp(((r.axis === "x" ? x : z) - r.from) / (r.to - r.from), 0, 1);
        h = r.y0 + (r.y1 - r.y0) * t;
      }
      // can step up at most half a metre
      if (h <= feetY + 0.55 && h > y) y = h;
    }
    return y;
  }
}

/** A raycast target that is invisible but blocks the crosshair (furniture, trees). */
export function proxyBox(parent: THREE.Object3D, o: THREE.Object3D): THREE.Mesh {
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.copy(c);
  parent.add(m);
  m.updateMatrixWorld(true);
  return m;
}
