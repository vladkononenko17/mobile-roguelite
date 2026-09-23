import { Color, Entity, MeshInstance, StandardMaterial, type AppBase } from "playcanvas";
import { KIT, KIT_SURFACES } from "../../config";
import { applySurface, setSurfaceTint } from "../Surface";
import { boxMesh, type BoxOptions } from "./KitMesh";
import { PREFABS, type PrefabName } from "./Prefabs";

export type KitMaterial = keyof typeof KIT_SURFACES | "steel";

export interface PartOptions extends BoxOptions {
  /** Local Euler rotation in degrees. */
  rot?: [number, number, number];
  castShadows?: boolean;
}

/**
 * Reusable environment kit. `spawn(name, x, z, yaw)` builds a prefab (an Entity with child parts)
 * from shared materials and cached meshes, so a level can place the same pieces many times at
 * almost no extra memory. All pieces join one static batch group, which merges parts that share a
 * material into a few draw calls.
 */
export class EnvironmentKit {
  readonly materials = {} as Record<KitMaterial, StandardMaterial>;
  private readonly batchGroupId: number;

  constructor(private readonly app: AppBase) {
    for (const id of Object.keys(KIT_SURFACES) as (keyof typeof KIT_SURFACES)[]) {
      const material = new StandardMaterial();
      material.name = `kit-${id}`;
      // Neutral grey until the textures arrive (they load behind the loading screen).
      material.diffuse = new Color(0.45, 0.42, 0.38);
      material.update();
      this.materials[id] = material;
    }
    // Untextured dark steel for thin trim, brackets and bolts where a texture would be sub-pixel.
    const steel = new StandardMaterial();
    steel.name = "kit-steel";
    steel.diffuse = new Color(0.17, 0.16, 0.15);
    steel.useMetalness = true;
    steel.metalness = 0.75;
    steel.gloss = 0.45;
    steel.update();
    this.materials.steel = steel;

    this.batchGroupId = app.batcher.addGroup("EnvironmentKit", false, KIT.batchCellMetres).id;
  }

  async load(): Promise<void> {
    await Promise.all(
      (Object.keys(KIT_SURFACES) as (keyof typeof KIT_SURFACES)[]).map(async (id) => {
        const material = this.materials[id];
        try {
          await applySurface(this.app, material, KIT_SURFACES[id]);
          setSurfaceTint(material, KIT.brightness);
        } catch (error) {
          console.warn(`[Kit] ${id} textures failed to load; using flat colour.`, error);
        }
      }),
    );
  }

  /** Builds a prefab at ground position (x, z) rotated `yawDeg` about Y. */
  spawn(name: PrefabName, x: number, z: number, yawDeg = 0, parent: Entity = this.app.root): Entity {
    const root = new Entity(name);
    PREFABS[name](this, root);
    root.setLocalPosition(x, 0, z);
    root.setLocalEulerAngles(0, yawDeg, 0);
    parent.addChild(root);
    return root;
  }

  /** Adds one chamfered-box part: size in metres, centre position relative to the prefab root. */
  part(
    parent: Entity,
    material: KitMaterial,
    size: [number, number, number],
    pos: [number, number, number],
    options: PartOptions = {},
  ): Entity {
    const entity = new Entity(material);
    const mesh = boxMesh(this.app.graphicsDevice, size[0], size[1], size[2], options);
    entity.addComponent("render", {
      meshInstances: [new MeshInstance(mesh, this.materials[material])],
      castShadows: options.castShadows ?? true,
      receiveShadows: true,
      batchGroupId: this.batchGroupId,
    });
    entity.setLocalPosition(pos[0], pos[1], pos[2]);
    if (options.rot) entity.setLocalEulerAngles(options.rot[0], options.rot[1], options.rot[2]);
    parent.addChild(entity);
    return entity;
  }
}
