import {
  ADDRESS_CLAMP_TO_EDGE,
  BLEND_NORMAL,
  Entity,
  Layer,
  MeshInstance,
  PIXELFORMAT_RGBA8,
  StandardMaterial,
  Texture,
  type AppBase,
  type CameraComponent,
  type LightComponent,
} from "playcanvas";
import { GROUND, PLAYER, ROCKY } from "../config";
import { createGroundTexture, GROUND_SIZE } from "./Arena";
import { groundQuadMesh } from "./kit/KitMesh";
import { applySurface, setSurfaceTiling, setSurfaceTint } from "./Surface";

const HALF = GROUND_SIZE / 2;

/**
 * Alpha mask for the rock -> road border strip (UV1 runs 0..1 across the strip, V = 0 on the rock
 * side). The fade band wanders along X so the border reads as natural ground, not a ruler line.
 */
function createEdgeMask(app: AppBase, depth: number): Texture {
  const width = 512;
  const height = 64;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  const phases = [1.7, 4.2, 0.6, 2.9];
  for (let x = 0; x < width; x++) {
    const worldX = (x / width) * GROUND_SIZE;
    const wobble =
      Math.sin(worldX * 0.21 + phases[0]) * 0.55 +
      Math.sin(worldX * 0.53 + phases[1]) * 0.3 +
      Math.sin(worldX * 1.37 + phases[2]) * 0.1 +
      Math.sin(worldX * 3.1 + phases[3]) * 0.05;
    const centre = depth / 2 + wobble * ROCKY.edgeNoiseMetres;
    for (let y = 0; y < height; y++) {
      const metres = ((y + 0.5) / height) * depth;
      const t = Math.min(1, Math.max(0, (metres - (centre - ROCKY.edgeFadeMetres / 2)) / ROCKY.edgeFadeMetres));
      const alpha = 1 - t * t * (3 - 2 * t);
      const i = (y * width + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new Texture(app.graphicsDevice, {
    name: "rocky-edge-mask",
    format: PIXELFORMAT_RGBA8,
    mipmaps: true,
    addressU: ADDRESS_CLAMP_TO_EDGE,
    addressV: ADDRESS_CLAMP_TO_EDGE,
  });
  texture.setSource(canvas);
  return texture;
}

/**
 * Ground surfaces, built from non-overlapping world-space quads (UVs in metres, so every surface
 * keeps its texel density and neighbouring quads line up):
 * - road: from the rock border strip to the near edge;
 * - rock: opaque from the far edge to the border strip;
 * - border strip: the only transparent ground (~5.5 m deep), blending rock into road. It sits on
 *   its own layer after all opaque geometry and before the World transparent pass, so the hero's
 *   contact shadow still draws on top of it;
 *
 * The rusty metal plate textures are kept for kit props (panels, gates, barricades), not ground.
 */
export class Ground {
  private roadTile: number = GROUND.tileMetres;
  private rockTile: number = ROCKY.tileMetres;
  private brightness: number = GROUND.brightness;
  private readonly road = new StandardMaterial();
  private readonly rock = new StandardMaterial();
  private readonly rockBand = new StandardMaterial();
  private readonly bandFarZ: number;
  private readonly bandNearZ: number;

  constructor(private readonly app: AppBase) {
    const arena = PLAYER.arenaHalfSize * 2;
    const boundary = -PLAYER.arenaHalfSize + arena * ROCKY.coverage;
    const halfBand = ROCKY.edgeFadeMetres / 2 + ROCKY.edgeNoiseMetres;
    this.bandFarZ = boundary - halfBand;
    this.bandNearZ = boundary + halfBand;

    // The ground skips image-based lighting (see LIGHTING.groundAmbient); it is the biggest
    // per-pixel cost in the scene because it covers the whole screen.
    for (const m of [this.road, this.rock, this.rockBand]) m.useSkybox = false;

    // Procedural road texture until the road set loads (and if it fails).
    this.road.diffuseMap = createGroundTexture(app);
    this.road.gloss = 0.1;
    this.road.useMetalness = true;
    setSurfaceTiling(this.road, 6);

    this.addQuad("Road", this.road, -HALF, this.bandFarZ, HALF, HALF, 0);
  }

  get tileSize(): number { return this.roadTile; }
  get rockTileSize(): number { return this.rockTile; }
  get tint(): number { return this.brightness; }

  /** Loads all surface textures and adds the rock and its border strip. Needs camera + lights. */
  async load(): Promise<void> {
    const app = this.app;
    const overlay = this.createOverlayLayer();
    const warn = (what: string) => (error: unknown) => console.warn(`[Ground] ${what} failed to load.`, error);
    await Promise.all([
      applySurface(app, this.road, GROUND).then(() => this.applyRoad(), warn("Road textures")),
      Promise.all([applySurface(app, this.rock, ROCKY), applySurface(app, this.rockBand, ROCKY)]).then(() => {
        this.addQuad("RockyTerrain", this.rock, -HALF, -HALF, HALF, this.bandFarZ, 0.001);
        const band = this.rockBand;
        band.opacityMap = createEdgeMask(app, this.bandNearZ - this.bandFarZ);
        band.opacityMapChannel = "a";
        band.opacityMapUv = 1;
        band.blendType = BLEND_NORMAL;
        band.depthWrite = false;
        this.addQuad("RockyBorder", band, -HALF, this.bandFarZ, HALF, this.bandNearZ, 0.001, [overlay.id]);
        this.applyRock();
      }, warn("Rocky terrain")),
    ]);
  }

  setTileSize(metres: number): void { this.roadTile = metres; this.applyRoad(); }
  setRockTileSize(metres: number): void { this.rockTile = metres; this.applyRock(); }

  setBrightness(value: number): void {
    this.brightness = value;
    this.applyRoad();
    this.applyRock();
  }

  private addQuad(name: string, material: StandardMaterial, x0: number, z0: number, x1: number, z1: number, y: number, layers?: number[]): void {
    const entity = new Entity(name);
    entity.addComponent("render", {
      meshInstances: [new MeshInstance(groundQuadMesh(this.app.graphicsDevice, x0, z0, x1, z1), material)],
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

  private applyRoad(): void {
    setSurfaceTiling(this.road, this.roadTile);
    setSurfaceTint(this.road, this.brightness);
  }

  private applyRock(): void {
    for (const m of [this.rock, this.rockBand]) {
      setSurfaceTiling(m, this.rockTile);
      setSurfaceTint(m, this.brightness * ROCKY.brightness, ROCKY.tint);
    }
  }
}
