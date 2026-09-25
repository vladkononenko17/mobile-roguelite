import {
  ADDRESS_REPEAT,
  BLEND_NORMAL,
  Color,
  Entity,
  FILTER_LINEAR,
  FILTER_LINEAR_MIPMAP_LINEAR,
  MeshInstance,
  StandardMaterial,
  Texture,
  Vec2,
  type AppBase,
  type Asset,
} from "playcanvas";
import { declareCollider } from "./collision/CollisionWorld";
import { createPatchMask } from "./Ground";
import { groundQuadMesh } from "./kit/KitMesh";

/**
 * One lava surface placed by a level: an axis-aligned rectangle (metres). `soft` pools get an
 * irregular blob outline (a mask) instead of hard edges; `solid` ones declare a low collider (it
 * blocks walking, not shots) shrunk to the visible core so the edge reads as the danger line.
 */
export interface LavaPool {
  x: number;
  z: number;
  w: number;
  d: number;
  soft?: boolean;
  solid?: boolean;
  /** Surface height (default: just above the ground). Hell's sea lies below the islands. */
  y?: number;
}

export interface LavaSpec {
  /** Texture (self-lit crust with glowing cracks); UVs in world metres. */
  url: string;
  /** Metres per texture repeat. */
  tileMetres: number;
  /** Flow speed (UV units per second) and emissive pulse. */
  flow: [number, number];
  intensity: number;
  pools: LavaPool[];
}

/**
 * Lava for the hell map: unlit, self-lit quads with a slowly flowing texture and a gentle heat
 * pulse. Hard-edged sheets (the moat round the island) and soft blob pools share one texture; two
 * materials in all. Pools just above the ground (below decals); nothing here casts shadows.
 */
export class Lava {
  private readonly root = new Entity("Lava");
  private readonly materials: StandardMaterial[] = [];
  private readonly offset = new Vec2();
  private time = 0;

  constructor(private readonly app: AppBase, private readonly spec: LavaSpec) {
    app.root.addChild(this.root);
  }

  /** Loads the texture and builds the surfaces; returns the root (colliders for addStaticFrom). */
  async load(url: string): Promise<Entity> {
    const texture = await new Promise<Texture>((resolve, reject) => {
      this.app.assets.loadFromUrl(url, "texture", (error, asset?: Asset) => {
        if (error || !asset) reject(new Error(`Lava texture: ${error}`));
        else resolve(asset.resource as Texture);
      });
    });
    texture.addressU = texture.addressV = ADDRESS_REPEAT;
    texture.minFilter = FILTER_LINEAR_MIPMAP_LINEAR;
    texture.magFilter = FILTER_LINEAR;
    const make = (soft: boolean) => {
      const m = new StandardMaterial();
      m.diffuse = new Color(0, 0, 0);
      m.emissive = new Color(1, 1, 1);
      m.emissiveMap = texture;
      m.emissiveIntensity = this.spec.intensity;
      m.useLighting = false;
      m.useSkybox = false;
      m.useFog = true;
      if (soft) {
        m.opacityMap = createPatchMask(this.app, 37);
        m.opacityMapChannel = "a";
        m.opacityMapUv = 1;
        m.blendType = BLEND_NORMAL;
        m.depthWrite = false;
      }
      m.update();
      this.materials.push(m);
      return m;
    };
    const sheet = make(false);
    const blob = make(true);
    const device = this.app.graphicsDevice;
    this.spec.pools.forEach((p, i) => {
      const mesh = groundQuadMesh(device, p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2);
      const entity = new Entity("lava");
      entity.addComponent("render", { meshInstances: [new MeshInstance(mesh, p.soft ? blob : sheet)], castShadows: false, receiveShadows: false });
      // Default: above the ground and its patches (<= 0.004), below blood decals (0.045).
      entity.setLocalPosition(0, p.y ?? (p.soft ? 0.012 + (i % 4) * 0.0005 : 0.008), 0);
      this.root.addChild(entity);
      if (p.solid) {
        const core = new Entity("lava-core");
        core.setLocalPosition(p.x, 0, p.z);
        this.root.addChild(core);
        const k = p.soft ? 0.62 : 1;
        declareCollider(core, { kind: "box", width: p.w * k, depth: p.d * k, low: true });
      }
    });
    for (const m of this.materials) this.tile(m);
    return this.root;
  }

  private tile(m: StandardMaterial): void {
    const k = 1 / this.spec.tileMetres;
    m.emissiveMapTiling = new Vec2(k, k);
  }

  update(dt: number): void {
    this.time += dt;
    const [fx, fz] = this.spec.flow;
    this.offset.set((this.time * fx) % 1, (this.time * fz) % 1);
    const pulse = this.spec.intensity * (0.9 + 0.1 * Math.sin(this.time * 1.3) + 0.05 * Math.sin(this.time * 3.7));
    for (const m of this.materials) {
      m.emissiveMapOffset = this.offset;
      m.emissiveIntensity = pulse;
      m.update();
    }
  }
}
