import { BoundingBox, Color, Entity, type AppBase, type Asset, type ContainerResource, type RenderComponent, type StandardMaterial } from "playcanvas";
import { declareCollider, type ColliderShape } from "../collision/CollisionWorld";

/**
 * How a kit model blocks the player. "box" uses the model's own footprint (its bounds on the
 * ground plane) scaled by `shrink`, so collision follows the mesh without hand-measured numbers;
 * "circle" suits round or pole-like models; "none" is walk-over clutter.
 */
export type KitCollider = { kind: "box"; shrink?: number } | { kind: "circle"; radius: number } | { kind: "none" };

export interface KitModelDef {
  collider: KitCollider;
  /** Large readable shapes cast shadows; small clutter does not (cheaper shadow pass). Default true. */
  shadows?: boolean;
}

export interface SpawnOptions {
  /** Height offset (stacking, e.g. a container on a container). */
  y?: number;
  /** Uniform scale or per-axis [x, y, z]. Colliders follow the X/Z scale. */
  scale?: number | [number, number, number];
  /** Extra tilt in degrees about the model's local X / Z (a car on its side, a leaning board). */
  tiltX?: number;
  tiltZ?: number;
  /** Skip the collider (e.g. a piece placed outside the playable area). */
  noCollider?: boolean;
}

interface Template {
  entity: Entity;
  /** Footprint on the ground plane in the model's local space (centre offset and size). */
  footprint: { x: number; z: number; width: number; depth: number };
}

/** Colliders smaller than this (metres, both sides) are skipped: tiny props should never snag. */
const MIN_COLLIDER = 0.45;

/**
 * A set of environment models loaded from one GLB (one node per model id). Instances are clones
 * sharing meshes and materials; they join a static batch group (casters and non-casters apart), so
 * all models using the shared "palette" material merge into one draw call per batch cell.
 */
export class ModelKit<Id extends string> {
  private readonly templates = new Map<Id, Template>();
  private readonly casterGroup: number;
  private readonly flatGroup: number;

  constructor(
    private readonly app: AppBase,
    private readonly defs: Record<Id, KitModelDef>,
    options: { name: string; batchCellMetres: number; brightness: number },
  ) {
    this.casterGroup = app.batcher.addGroup(`${options.name}-casters`, false, options.batchCellMetres).id;
    this.flatGroup = app.batcher.addGroup(`${options.name}-flat`, false, options.batchCellMetres).id;
    this.brightness = options.brightness;
  }

  private readonly brightness: number;

  async load(url: string): Promise<void> {
    const asset = await new Promise<Asset>((resolve, reject) => {
      this.app.assets.loadFromUrlAndFilename(url, url.split("/").pop()!, "container", (error, loaded) => {
        if (error || !loaded) reject(new Error(`Failed to load ${url}: ${error}`));
        else resolve(loaded);
      });
    });
    const root = (asset.resource as ContainerResource).instantiateRenderEntity();
    const materials = new Set<StandardMaterial>();
    for (const render of root.findComponents("render") as RenderComponent[]) {
      for (const meshInstance of render.meshInstances) materials.add(meshInstance.material as StandardMaterial);
    }
    for (const material of materials) this.prepareMaterial(material);

    for (const id of Object.keys(this.defs) as Id[]) {
      const entity = root.findByName(id) as Entity | null;
      if (!entity) {
        console.warn(`[ModelKit] ${id} is missing from ${url}`);
        continue;
      }
      entity.parent?.removeChild(entity);
      entity.setLocalPosition(0, 0, 0);
      entity.setLocalEulerAngles(0, 0, 0);
      const shadows = this.defs[id].shadows ?? true;
      for (const render of entity.findComponents("render") as RenderComponent[]) {
        render.castShadows = shadows;
        render.receiveShadows = true;
        render.batchGroupId = shadows ? this.casterGroup : this.flatGroup;
      }
      this.templates.set(id, { entity, footprint: footprintOf(entity) });
    }
  }

  has(id: Id): boolean {
    return this.templates.has(id);
  }

  /**
   * Places a copy of `id` at ground position (x, z) turned `yawDeg` about Y, with its collider
   * declared (collected later by `CollisionWorld.addStaticFrom`). Returns null if the model is
   * missing, so a missing model never breaks the level.
   */
  spawn(id: Id, x: number, z: number, yawDeg: number, parent: Entity, options: SpawnOptions = {}): Entity | null {
    const template = this.templates.get(id);
    if (!template) return null;
    const [sx, sy, sz] = typeof options.scale === "number" ? [options.scale, options.scale, options.scale] : options.scale ?? [1, 1, 1];
    const root = new Entity(id);
    const model = template.entity.clone();
    model.setLocalScale(sx, sy, sz);
    if (options.tiltX || options.tiltZ) model.setLocalEulerAngles(options.tiltX ?? 0, 0, options.tiltZ ?? 0);
    root.addChild(model);
    root.setLocalPosition(x, options.y ?? 0, z);
    root.setLocalEulerAngles(0, yawDeg, 0);
    parent.addChild(root);

    const def = this.defs[id].collider;
    if (options.noCollider || def.kind === "none") return root;
    const { footprint } = template;
    let shape: ColliderShape;
    if (def.kind === "box") {
      const shrink = def.shrink ?? 1;
      const width = footprint.width * sx * shrink, depth = footprint.depth * sz * shrink;
      if (width < MIN_COLLIDER && depth < MIN_COLLIDER) return root;
      shape = { kind: "box", width, depth };
    } else {
      const radius = def.radius * Math.max(sx, sz);
      if (radius * 2 < MIN_COLLIDER * 0.6) return root;
      shape = { kind: "circle", radius };
    }
    const collider = new Entity("collider");
    // Boxes sit on the footprint centre; circles on the model origin (its base / pole).
    if (def.kind === "box") collider.setLocalPosition(footprint.x * sx, 0, footprint.z * sz);
    root.addChild(collider);
    declareCollider(collider, shape);
    return root;
  }

  /** "palette" carries its colours per vertex (see scripts/build-outpost-kit.mjs). */
  private prepareMaterial(material: StandardMaterial): void {
    if (material.name === "palette") {
      material.diffuseVertexColor = true;
      material.diffuseVertexColorChannel = "rgb";
    }
    material.diffuse = new Color(this.brightness, this.brightness, this.brightness);
    material.emissive = new Color(0, 0, 0);
    material.update();
  }
}

function footprintOf(entity: Entity): Template["footprint"] {
  const bounds = new BoundingBox();
  let first = true;
  for (const render of entity.findComponents("render") as RenderComponent[]) {
    for (const meshInstance of render.meshInstances) {
      if (first) bounds.copy(meshInstance.aabb);
      else bounds.add(meshInstance.aabb);
      first = false;
    }
  }
  const min = bounds.getMin();
  const max = bounds.getMax();
  return { x: (min.x + max.x) / 2, z: (min.z + max.z) / 2, width: max.x - min.x, depth: max.z - min.z };
}
