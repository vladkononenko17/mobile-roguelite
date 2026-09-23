import { BoundingBox, Color, Entity, type AppBase, type Asset, type ContainerResource, type RenderComponent, type StandardMaterial } from "playcanvas";
import { PROPS } from "../../config";
import { declareCollider, type ColliderShape } from "../collision/CollisionWorld";

/**
 * How each imported prop blocks the player. "box" uses the model's own footprint (its bounds on
 * the ground plane) scaled by `shrink`, so collision follows the mesh without hand-measured
 * numbers; "circle" suits round or pole-like props; "none" is walk-over clutter.
 */
type PropCollider = { kind: "box"; shrink?: number } | { kind: "circle"; radius: number } | { kind: "none" };

/** Node names inside wasteland-props.glb (one per source file, see scripts/build-props.mjs). */
export const PROP_DEFS = {
  "pickup-battered": { kind: "box", shrink: 0.9 },
  "wreck-barricade": { kind: "box", shrink: 0.85 },
  "shipping-container": { kind: "box", shrink: 0.97 },
  "fuel-bowser": { kind: "box", shrink: 0.85 },
  "fuel-drum-rack": { kind: "box", shrink: 0.9 },
  "generator-unit": { kind: "box", shrink: 0.9 },
  "floodlight-mast": { kind: "circle", radius: 0.35 },
  "road-sign": { kind: "circle", radius: 0.2 },
  "sandbag-wall": { kind: "box", shrink: 0.9 },
  "razor-wire-coil": { kind: "box", shrink: 0.85 },
  "tyre-stack": { kind: "box", shrink: 0.8 },
  "oil-drum": { kind: "circle", radius: 0.32 },
  "pallet-stack": { kind: "box", shrink: 0.9 },
  "scrap-pile": { kind: "none" },
} satisfies Record<string, PropCollider>;

export type PropId = keyof typeof PROP_DEFS;

interface PropTemplate {
  entity: Entity;
  /** Footprint on the ground plane in the prop's local space (centre offset and size). */
  footprint: { x: number; z: number; width: number; depth: number };
}

/**
 * Imported GLB props. The whole set is one container: materials are shared across props (the
 * source pack reuses one palette), so with the kit's static batch group every prop using "rust"
 * or "steel" merges into a single draw call per batch cell.
 */
export class PropLibrary {
  private readonly templates = new Map<PropId, PropTemplate>();

  constructor(
    private readonly app: AppBase,
    private readonly batchGroupId: number,
  ) {}

  async load(url: string): Promise<void> {
    const asset = await new Promise<Asset>((resolve, reject) => {
      this.app.assets.loadFromUrlAndFilename(url, url.split("/").pop()!, "container", (error, loaded) => {
        if (error || !loaded) reject(new Error(`Failed to load props ${url}: ${error}`));
        else resolve(loaded);
      });
    });
    const root = (asset.resource as ContainerResource).instantiateRenderEntity();

    const materials = new Set<StandardMaterial>();
    for (const render of root.findComponents("render") as RenderComponent[]) {
      render.batchGroupId = this.batchGroupId;
      for (const meshInstance of render.meshInstances) materials.add(meshInstance.material as StandardMaterial);
    }
    for (const material of materials) prepareMaterial(material);

    for (const id of Object.keys(PROP_DEFS) as PropId[]) {
      const entity = root.findByName(id) as Entity | null;
      if (!entity) {
        console.warn(`[Props] ${id} is missing from ${url}`);
        continue;
      }
      entity.parent?.removeChild(entity);
      entity.setLocalPosition(0, 0, 0);
      entity.setLocalEulerAngles(0, 0, 0);
      this.templates.set(id, { entity, footprint: footprintOf(entity) });
    }
  }

  /**
   * Places a copy of prop `id` at ground position (x, z) turned `yawDeg` about Y, with its
   * collider declared (collected later by `CollisionWorld.addStaticFrom`). Returns null if the
   * prop failed to load, so a missing model never breaks the level.
   */
  spawn(id: PropId, x: number, z: number, yawDeg: number, parent: Entity): Entity | null {
    const template = this.templates.get(id);
    if (!template) return null;
    const root = new Entity(id);
    root.addChild(template.entity.clone());
    root.setLocalPosition(x, 0, z);
    root.setLocalEulerAngles(0, yawDeg, 0);
    parent.addChild(root);

    const def: PropCollider = PROP_DEFS[id];
    let shape: ColliderShape | null = null;
    const { footprint } = template;
    if (def.kind === "box") {
      const shrink = def.shrink ?? 1;
      shape = { kind: "box", width: footprint.width * shrink, depth: footprint.depth * shrink };
    } else if (def.kind === "circle") {
      shape = { kind: "circle", radius: def.radius };
    }
    if (shape) {
      const collider = new Entity("collider");
      // Circles sit on the prop's origin (its base / pole); boxes on its footprint centre.
      if (def.kind === "box") collider.setLocalPosition(footprint.x, 0, footprint.z);
      root.addChild(collider);
      declareCollider(collider, shape);
    }
    return root;
  }
}

function footprintOf(entity: Entity): PropTemplate["footprint"] {
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

/**
 * Final touches on the (already muted) prop materials: "palette" carries its colours per vertex
 * (see scripts/build-props.mjs), and everything is kept rough and non-emissive.
 */
function prepareMaterial(material: StandardMaterial): void {
  if (material.name === "palette") {
    material.diffuseVertexColor = true;
    material.diffuseVertexColorChannel = "rgb";
  }
  const c = material.diffuse;
  material.diffuse = new Color(c.r * PROPS.brightness, c.g * PROPS.brightness, c.b * PROPS.brightness);
  material.emissive = new Color(0, 0, 0);
  material.update();
}
