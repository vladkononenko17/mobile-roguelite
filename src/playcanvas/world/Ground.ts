import {
  ADDRESS_REPEAT,
  Color,
  FILTER_LINEAR,
  FILTER_LINEAR_MIPMAP_LINEAR,
  PIXELFORMAT_RGBA8,
  PIXELFORMAT_SRGBA8,
  Texture,
  Vec2,
  type AppBase,
  type StandardMaterial,
} from "playcanvas";
import { GROUND } from "../config";
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

/**
 * PBR "damaged road" ground: diffuse + OpenGL normal + roughness, tiled every `tileMetres`.
 * Tile size and brightness can be changed live from the tune panel.
 */
export class Ground {
  private tileMetres: number = GROUND.tileMetres;
  private brightness: number = GROUND.brightness;
  private loaded = false;

  constructor(private readonly material: StandardMaterial) {}

  get tileSize(): number {
    return this.tileMetres;
  }

  get tint(): number {
    return this.brightness;
  }

  async load(app: AppBase): Promise<void> {
    const base = `${import.meta.env.BASE_URL}${GROUND.folder}`;
    try {
      const [diffuse, normal, rough] = await Promise.all([
        loadTexture(app, `${base}/${GROUND.diffuse}`, true),
        loadTexture(app, `${base}/${GROUND.normal}`, false),
        loadTexture(app, `${base}/${GROUND.roughness}`, false),
      ]);
      const m = this.material;
      m.diffuseMap = diffuse;
      m.normalMap = normal;
      m.bumpiness = GROUND.bumpiness;
      // Roughness map -> gloss: PlayCanvas stores gloss, so invert it.
      m.glossMap = rough;
      m.glossMapChannel = "g";
      m.glossInvert = true;
      m.gloss = 1;
      this.loaded = true;
      this.apply();
    } catch (error) {
      console.warn("[Ground] Road textures failed to load; keeping the procedural ground.", error);
    }
  }

  setTileSize(metres: number): void {
    this.tileMetres = metres;
    this.apply();
  }

  setBrightness(value: number): void {
    this.brightness = value;
    this.apply();
  }

  private apply(): void {
    if (!this.loaded) return;
    const m = this.material;
    const repeats = GROUND_SIZE / this.tileMetres;
    const tiling = new Vec2(repeats, repeats);
    m.diffuseMapTiling = tiling;
    m.normalMapTiling = tiling;
    m.glossMapTiling = tiling;
    m.diffuse = new Color(this.brightness, this.brightness, this.brightness);
    m.update();
  }
}
