import {
  ADDRESS_CLAMP_TO_EDGE,
  ADDRESS_REPEAT,
  BLEND_NORMAL,
  Color,
  Entity,
  FILTER_LINEAR,
  FILTER_LINEAR_MIPMAP_LINEAR,
  Layer,
  MeshInstance,
  PIXELFORMAT_RGBA8,
  StandardMaterial,
  Texture,
  type AppBase,
  type CameraComponent,
  type LightComponent,
  type Mesh,
} from "playcanvas";
import { GROUND, type GroundSurface } from "../config";
import { GROUND_SIZE } from "./Arena";
import { groundQuadMesh } from "./kit/KitMesh";
import { setSurfaceTiling } from "./Surface";

const HALF = GROUND_SIZE / 2;

/** Where each ground surface goes (the level provides this). */
export interface GroundSpec {
  /** Surface under everything. */
  base: GroundSurface;
  /** Where the base surface exists (islands); default: everywhere. Outside, whatever lies below
   * (hell's lava sea) shows. */
  areas?: { x0: number; z0: number; x1: number; z1: number }[];
  /** Opaque rectangles (e.g. poured concrete floors), axis-aligned, metres. */
  pads: { x0: number; z0: number; x1: number; z1: number; surface: GroundSurface }[];
  /** Soft irregular patches (transparent blob masks) blended over the base: tracks, scorched
   * soil, dust. Centre and size in metres. */
  patches: { x: number; z: number; w: number; d: number; surface: GroundSurface; seed?: number }[];
}

/** Small deterministic RNG so the painted textures are identical on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Paints a tileable stylized surface: flat base colour, large soft blotches (drawn with wrap-around
 * so the tile is seamless), then small specks. Concrete also gets slab seams. The result reads as
 * hand-painted low-poly ground rather than a photo texture.
 */
function paintSurface(surface: GroundSurface, seed: number): HTMLCanvasElement {
  const style = GROUND.surfaces[surface] as (typeof GROUND.surfaces)[GroundSurface] & { slabs?: number; seam?: string };
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const random = rng(seed);
  ctx.fillStyle = style.base;
  ctx.fillRect(0, 0, size, size);
  const wrapped = (draw: (ox: number, oy: number) => void) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) draw(ox, oy);
  };
  // Large, low-contrast blotches.
  for (let i = 0; i < 26; i++) {
    const x = random() * size, y = random() * size, r = 40 + random() * 110;
    const colour = random() < 0.5 ? style.dark : style.light;
    const alpha = 0.25 + random() * 0.3;
    wrapped((ox, oy) => {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, colour);
      g.addColorStop(1, colour + "00");
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
  ctx.globalAlpha = 1;
  if (style.slabs && style.seam) {
    // Slab seams, slightly irregular, plus a few hairline cracks.
    const step = size / style.slabs;
    ctx.strokeStyle = style.seam;
    ctx.lineWidth = 3;
    for (let i = 0; i <= style.slabs; i++) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
    }
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      let x = random() * size, y = random() * size;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (random() - 0.5) * 60; y += (random() - 0.5) * 60; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  // Specks: pebbles and grit, a mix of darker and lighter dots.
  for (let i = 0; i < style.specks; i++) {
    const x = random() * size, y = random() * size, r = 0.8 + random() * (random() < 0.08 ? 4 : 1.8);
    ctx.fillStyle = random() < 0.6 ? style.speckDark : style.speckLight;
    ctx.globalAlpha = 0.5 + random() * 0.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function canvasTexture(app: AppBase, name: string, canvas: HTMLCanvasElement, repeat: boolean): Texture {
  const texture = new Texture(app.graphicsDevice, {
    name,
    format: PIXELFORMAT_RGBA8,
    mipmaps: true,
    minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: FILTER_LINEAR,
    addressU: repeat ? ADDRESS_REPEAT : ADDRESS_CLAMP_TO_EDGE,
    addressV: repeat ? ADDRESS_REPEAT : ADDRESS_CLAMP_TO_EDGE,
  });
  texture.setSource(canvas);
  return texture;
}

/** Irregular soft blob (UV1 0..1 over a patch quad); each seed gives a different outline. */
export function createPatchMask(app: AppBase, seed: number): Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  const random = rng(seed);
  const phase = [random() * 6.28, random() * 6.28, random() * 6.28];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5;
      const angle = Math.atan2(dy, dx);
      const radius = 0.33 + Math.sin(angle * 3 + phase[0]) * 0.06 + Math.sin(angle * 5 + phase[1]) * 0.04 + Math.sin(angle * 9 + phase[2]) * 0.025;
      const t = Math.min(1, Math.max(0, (Math.hypot(dx, dy) - (radius - 0.1)) / 0.14));
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round((1 - t * t * (3 - 2 * t)) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvasTexture(app, `patch-mask-${seed}`, canvas, false);
}

/**
 * Level ground, all with UVs in world metres so surfaces keep their texel density:
 * - base: one opaque quad under everything;
 * - pads: opaque rectangles (concrete floors);
 * - patches: transparent quads with irregular blob masks (tracks, scorched soil).
 * Every surface is painted procedurally (config GROUND). Transparent pieces sit on their own layer
 * after the opaque pass and before the World transparent pass, so the hero's contact shadow still
 * draws over them. The ground skips image-based lighting and has no normal maps.
 */
export class Ground {
  private baseTile: number = GROUND.tileMetres;
  private patchTile: number = GROUND.patchTileMetres;
  private brightness: number = GROUND.brightness;
  private readonly textures = new Map<GroundSurface, Texture>();
  private readonly opaque = new Map<GroundSurface, StandardMaterial>();
  private readonly patchMaterials: StandardMaterial[] = [];

  constructor(private readonly app: AppBase, private readonly spec: GroundSpec) {
    const base = this.opaqueMaterial(spec.base);
    for (const a of spec.areas ?? [{ x0: -HALF, z0: -HALF, x1: HALF, z1: HALF }]) {
      this.addMesh("Ground", base, groundQuadMesh(app.graphicsDevice, a.x0, a.z0, a.x1, a.z1), 0);
    }
  }

  get tileSize(): number { return this.baseTile; }
  get rockTileSize(): number { return this.patchTile; }
  get tint(): number { return this.brightness; }

  /** Builds pads and patches. Needs camera + lights (the patch layer is added to them). */
  async load(): Promise<void> {
    const app = this.app;
    const overlay = this.createOverlayLayer();
    for (const pad of this.spec.pads) {
      this.addMesh("GroundPad", this.opaqueMaterial(pad.surface), groundQuadMesh(app.graphicsDevice, pad.x0, pad.z0, pad.x1, pad.z1), 0.004);
    }
    // A handful of mask shapes is enough; patches cycle through them.
    const masks = [11, 23, 37, 41].map((seed) => createPatchMask(app, seed));
    const bySurfaceAndMask = new Map<string, StandardMaterial>();
    this.spec.patches.forEach((p, i) => {
      const maskIndex = (p.seed ?? i) % masks.length;
      const key = `${p.surface}:${maskIndex}`;
      let material = bySurfaceAndMask.get(key);
      if (!material) {
        material = this.createMaterial(p.surface);
        material.opacityMap = masks[maskIndex];
        material.opacityMapChannel = "a";
        material.opacityMapUv = 1;
        material.blendType = BLEND_NORMAL;
        material.depthWrite = false;
        bySurfaceAndMask.set(key, material);
        this.patchMaterials.push(material);
      }
      // Tiny height steps keep overlapping patches from z-fighting.
      this.addMesh("GroundPatch", material, groundQuadMesh(app.graphicsDevice, p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2), 0.001 + (i % 8) * 0.0004, [overlay.id]);
    });
    this.apply();
  }

  setTileSize(metres: number): void { this.baseTile = metres; this.apply(); }
  setRockTileSize(metres: number): void { this.patchTile = metres; this.apply(); }
  setBrightness(value: number): void { this.brightness = value; this.apply(); }

  private texture(surface: GroundSurface): Texture {
    let texture = this.textures.get(surface);
    if (!texture) {
      texture = canvasTexture(this.app, `ground-${surface}`, paintSurface(surface, surface.length * 97 + 7), true);
      this.textures.set(surface, texture);
    }
    return texture;
  }

  private createMaterial(surface: GroundSurface): StandardMaterial {
    const material = new StandardMaterial();
    material.name = `ground-${surface}`;
    material.useSkybox = false;
    material.useMetalness = true;
    material.metalness = 0;
    material.gloss = 0.08;
    material.diffuseMap = this.texture(surface);
    return material;
  }

  private opaqueMaterial(surface: GroundSurface): StandardMaterial {
    let material = this.opaque.get(surface);
    if (!material) {
      material = this.createMaterial(surface);
      this.opaque.set(surface, material);
      this.applyTo(material, this.baseTile);
    }
    return material;
  }

  private addMesh(name: string, material: StandardMaterial, mesh: Mesh, y: number, layers?: number[]): void {
    const entity = new Entity(name);
    entity.addComponent("render", {
      meshInstances: [new MeshInstance(mesh, material)],
      castShadows: false,
      receiveShadows: true,
      ...(layers ? { layers } : {}),
    });
    entity.setLocalPosition(0, y, 0);
    this.app.root.addChild(entity);
  }

  private createOverlayLayer(): Layer {
    const layers = this.app.scene.layers;
    const world = layers.getLayerByName("World")!;
    const overlay = new Layer({ name: "GroundOverlay" });
    layers.insertTransparent(overlay, layers.getTransparentIndex(world));
    for (const camera of this.app.root.findComponents("camera") as CameraComponent[]) camera.layers = [...camera.layers, overlay.id];
    // Lights only affect (and shadow) layers they list.
    for (const light of this.app.root.findComponents("light") as LightComponent[]) light.layers = [...light.layers, overlay.id];
    return overlay;
  }

  private applyTo(material: StandardMaterial, tile: number): void {
    setSurfaceTiling(material, tile);
    material.diffuse = new Color(this.brightness, this.brightness, this.brightness);
    material.update();
  }

  private apply(): void {
    for (const material of this.opaque.values()) this.applyTo(material, this.baseTile);
    for (const material of this.patchMaterials) this.applyTo(material, this.patchTile);
  }
}
