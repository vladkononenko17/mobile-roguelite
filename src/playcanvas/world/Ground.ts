import {
  ADDRESS_CLAMP_TO_EDGE,
  ADDRESS_REPEAT,
  BLEND_NORMAL,
  Color,
  Entity,
  FILTER_LINEAR,
  FILTER_LINEAR_MIPMAP_LINEAR,
  Layer,
  PIXELFORMAT_RGBA8,
  PIXELFORMAT_SRGBA8,
  StandardMaterial,
  Texture,
  Vec2,
  type AppBase,
  type CameraComponent,
  type LightComponent,
} from "playcanvas";
import { GROUND, PLAYER, ROCKY, type SurfaceTextures } from "../config";
import { GROUND_SIZE } from "./Arena";

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  await image.decode();
  return image;
}

/** Colour maps must be sRGB; normal and roughness data are linear. */
async function loadTexture(app: AppBase, url: string, srgb: boolean): Promise<Texture> {
  const texture = new Texture(app.graphicsDevice, {
    name: url.split("/").pop(),
    format: srgb ? PIXELFORMAT_SRGBA8 : PIXELFORMAT_RGBA8,
    mipmaps: true,
    minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: FILTER_LINEAR,
    addressU: ADDRESS_REPEAT,
    addressV: ADDRESS_REPEAT,
    // The camera sees the ground at a grazing-ish angle; anisotropy keeps it sharp towards the top.
    anisotropy: 8,
  });
  texture.setSource(await loadImage(url));
  return texture;
}

/** Loads a diffuse / OpenGL-normal / roughness set onto a material. */
async function applySurface(app: AppBase, material: StandardMaterial, set: SurfaceTextures): Promise<void> {
  const base = `${import.meta.env.BASE_URL}${set.folder}`;
  const [diffuse, normal, rough] = await Promise.all([
    loadTexture(app, `${base}/${set.diffuse}`, true),
    loadTexture(app, `${base}/${set.normal}`, false),
    loadTexture(app, `${base}/${set.roughness}`, false),
  ]);
  material.diffuseMap = diffuse;
  material.normalMap = normal;
  material.bumpiness = set.bumpiness;
  // Roughness map -> gloss: PlayCanvas stores gloss, so invert it.
  material.glossMap = rough;
  material.glossMapChannel = "g";
  material.glossInvert = true;
  material.gloss = 1;
  material.useMetalness = true;
  material.metalness = 0;
}

/** Tiles the surface maps every `tileMetres` over a plane `width` x `depth` metres. */
function setTiling(
  material: StandardMaterial,
  tileMetres: number,
  width: number,
  depth: number,
  brightness: number,
  tint: readonly [number, number, number] = [1, 1, 1],
): void {
  const tiling = new Vec2(width / tileMetres, depth / tileMetres);
  material.diffuseMapTiling = tiling;
  material.normalMapTiling = tiling;
  material.glossMapTiling = tiling;
  material.diffuse = new Color(brightness * tint[0], brightness * tint[1], brightness * tint[2]);
  material.update();
}

/**
 * Soft, irregular edge for the rock overlay as an alpha mask over the whole overlay plane
 * (not tiled). On the plane primitive v = 0 is its far (-Z) edge, so the fade is drawn at the
 * bottom of the canvas, where the overlay meets the road.
 */
function createEdgeMask(app: AppBase, depth: number): Texture {
  const width = 512;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  const metresPerRow = depth / height;
  const fadeRows = ROCKY.edgeFadeMetres / metresPerRow;
  // Deterministic wobble: a few sine octaves in metres along X.
  const phases = [1.7, 4.2, 0.6, 2.9];
  for (let x = 0; x < width; x++) {
    const worldX = (x / width) * GROUND_SIZE;
    let wobble = 0;
    wobble += Math.sin(worldX * 0.21 + phases[0]) * 0.55;
    wobble += Math.sin(worldX * 0.53 + phases[1]) * 0.3;
    wobble += Math.sin(worldX * 1.37 + phases[2]) * 0.1;
    wobble += Math.sin(worldX * 3.1 + phases[3]) * 0.05;
    // Edge row for this column: the overlay's near edge minus the fade band, shifted by the wobble.
    const edge = height - fadeRows - (wobble * ROCKY.edgeNoiseMetres + ROCKY.edgeNoiseMetres) / metresPerRow;
    for (let y = 0; y < height; y++) {
      const t = Math.min(1, Math.max(0, (y - edge) / fadeRows));
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
 * Ground surfaces: the "damaged road" PBR set on the base ground, and a "rocky terrain" overlay
 * covering the far third of the arena with a soft, irregular border into the road.
 *
 * The overlay is a transparent plane on its own layer, drawn after all opaque geometry (so it
 * sits on the road and under the hero) but before the World layer's transparent pass (so the
 * hero's contact shadow still draws on top of it).
 */
export class Ground {
  private roadTile: number = GROUND.tileMetres;
  private rockTile: number = ROCKY.tileMetres;
  private brightness: number = GROUND.brightness;
  private roadLoaded = false;
  private rockLoaded = false;
  private readonly rockMaterial = new StandardMaterial();
  private readonly rockDepth: number;
  readonly rockBoundaryZ: number;

  constructor(private readonly roadMaterial: StandardMaterial) {
    const arena = PLAYER.arenaHalfSize * 2;
    this.rockBoundaryZ = -PLAYER.arenaHalfSize + arena * ROCKY.coverage;
    // The overlay runs from the far edge of the ground to just past the boundary (fade + wobble).
    this.rockDepth = this.rockBoundaryZ + ROCKY.edgeFadeMetres / 2 + ROCKY.edgeNoiseMetres + GROUND_SIZE / 2;
  }

  get tileSize(): number {
    return this.roadTile;
  }

  get rockTileSize(): number {
    return this.rockTile;
  }

  get tint(): number {
    return this.brightness;
  }

  /** Creates the overlay layer/entity; call once the camera and lights exist. */
  async load(app: AppBase): Promise<void> {
    const overlayLayer = this.createOverlayLayer(app);
    await Promise.all([
      applySurface(app, this.roadMaterial, GROUND).then(
        () => { this.roadLoaded = true; this.applyRoad(); },
        (error) => console.warn("[Ground] Road textures failed to load; keeping the procedural ground.", error),
      ),
      this.createRockOverlay(app, overlayLayer).then(
        () => { this.rockLoaded = true; this.applyRock(); },
        (error) => console.warn("[Ground] Rocky terrain failed to load; the road covers the whole arena.", error),
      ),
    ]);
  }

  setTileSize(metres: number): void {
    this.roadTile = metres;
    this.applyRoad();
  }

  setRockTileSize(metres: number): void {
    this.rockTile = metres;
    this.applyRock();
  }

  setBrightness(value: number): void {
    this.brightness = value;
    this.applyRoad();
    this.applyRock();
  }

  private createOverlayLayer(app: AppBase): Layer {
    const layers = app.scene.layers;
    const world = layers.getLayerByName("World")!;
    const overlay = new Layer({ name: "GroundOverlay" });
    layers.insertTransparent(overlay, layers.getTransparentIndex(world));
    for (const camera of app.root.findComponents("camera") as CameraComponent[]) {
      camera.layers = [...camera.layers, overlay.id];
    }
    // Lights only affect (and shadow) layers they list.
    for (const light of app.root.findComponents("light") as LightComponent[]) {
      light.layers = [...light.layers, overlay.id];
    }
    return overlay;
  }

  private async createRockOverlay(app: AppBase, layer: Layer): Promise<void> {
    await applySurface(app, this.rockMaterial, ROCKY);
    const m = this.rockMaterial;
    m.opacityMap = createEdgeMask(app, this.rockDepth);
    m.opacityMapChannel = "a";
    m.opacityMapTiling = new Vec2(1, 1);
    m.blendType = BLEND_NORMAL;
    m.depthWrite = false;

    const entity = new Entity("RockyTerrain");
    entity.addComponent("render", {
      type: "plane",
      material: m,
      castShadows: false,
      receiveShadows: true,
      layers: [layer.id],
    });
    const farZ = -GROUND_SIZE / 2;
    const nearZ = farZ + this.rockDepth;
    entity.setLocalScale(GROUND_SIZE, 1, this.rockDepth);
    // A hair above the road; depth writes are off, so there is no z-fighting to worry about.
    entity.setLocalPosition(0, 0.002, (farZ + nearZ) / 2);
    app.root.addChild(entity);
  }

  private applyRoad(): void {
    if (this.roadLoaded) setTiling(this.roadMaterial, this.roadTile, GROUND_SIZE, GROUND_SIZE, this.brightness);
  }

  private applyRock(): void {
    if (this.rockLoaded) setTiling(this.rockMaterial, this.rockTile, GROUND_SIZE, this.rockDepth, this.brightness * ROCKY.brightness, ROCKY.tint);
  }
}
