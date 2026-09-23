import {
  ADDRESS_REPEAT,
  Color,
  FILTER_LINEAR,
  FILTER_LINEAR_MIPMAP_LINEAR,
  PIXELFORMAT_RGBA8,
  PIXELFORMAT_SRGBA8,
  StandardMaterial,
  Texture,
  Vec2,
  type AppBase,
} from "playcanvas";

/**
 * A 1K PBR set in `public/<folder>/`. Colour is sRGB; normal (OpenGL / +Y convention, which is
 * what PlayCanvas expects), roughness and metalness are linear.
 */
export interface SurfaceTextures {
  folder: string;
  diffuse: string;
  normal: string;
  /** Roughness map (read from G). Omit to use `roughness` as a constant. */
  roughnessMap?: string;
  /** Constant roughness when there is no map (or when the map is nearly flat). */
  roughness?: number;
  /** Roughness in G and metalness in B of one texture (saves a texture fetch and a download). */
  roughMetalMap?: string;
  bumpiness: number;
  /** Metres covered by one texture repeat. Generated meshes carry UVs in metres, so this is the
   * single texel-density control for everything using the material. */
  tileMetres: number;
}

const textureCache = new Map<string, Promise<Texture>>();

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  await image.decode();
  return image;
}

/** Loads (once) a repeating, mipmapped texture. Colour maps must be sRGB; data maps linear. */
export function loadTexture(app: AppBase, url: string, srgb: boolean): Promise<Texture> {
  const key = `${url}|${srgb}`;
  let promise = textureCache.get(key);
  if (!promise) {
    promise = loadImage(url).then((image) => {
      const texture = new Texture(app.graphicsDevice, {
        name: url.split("/").pop(),
        format: srgb ? PIXELFORMAT_SRGBA8 : PIXELFORMAT_RGBA8,
        mipmaps: true,
        minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
        magFilter: FILTER_LINEAR,
        addressU: ADDRESS_REPEAT,
        addressV: ADDRESS_REPEAT,
        // The camera sees surfaces at an angle; 4x keeps them sharp at a modest mobile cost.
        anisotropy: 4,
      });
      texture.setSource(image);
      return texture;
    });
    textureCache.set(key, promise);
  }
  return promise;
}

/** Connects a PBR set to a StandardMaterial (metalness workflow). */
export async function applySurface(app: AppBase, material: StandardMaterial, set: SurfaceTextures): Promise<void> {
  const base = `${import.meta.env.BASE_URL}${set.folder}`;
  const roughUrl = set.roughMetalMap ?? set.roughnessMap;
  const [diffuse, normal, rough] = await Promise.all([
    loadTexture(app, `${base}/${set.diffuse}`, true),
    loadTexture(app, `${base}/${set.normal}`, false),
    roughUrl ? loadTexture(app, `${base}/${roughUrl}`, false) : Promise.resolve(null),
  ]);
  material.diffuseMap = diffuse;
  material.normalMap = normal;
  material.bumpiness = set.bumpiness;
  material.useMetalness = true;
  // PlayCanvas stores gloss; a roughness map is used through glossInvert.
  if (rough) {
    material.glossMap = rough;
    material.glossMapChannel = "g";
    material.glossInvert = true;
    material.gloss = 1;
  } else {
    material.glossMap = null;
    material.gloss = 1 - (set.roughness ?? 0.9);
  }
  if (set.roughMetalMap && rough) {
    material.metalnessMap = rough;
    material.metalnessMapChannel = "b";
    material.metalness = 1;
  } else {
    material.metalnessMap = null;
    material.metalness = 0;
  }
  setSurfaceTiling(material, set.tileMetres);
}

/** Applies one texture repeat per `tileMetres` to every map (meshes carry UVs in metres). */
export function setSurfaceTiling(material: StandardMaterial, tileMetres: number): void {
  const tiling = new Vec2(1 / tileMetres, 1 / tileMetres);
  material.diffuseMapTiling = tiling;
  material.normalMapTiling = tiling;
  material.glossMapTiling = tiling;
  material.metalnessMapTiling = tiling;
  material.update();
}

/** Multiplies the colour map (1 = as authored). */
export function setSurfaceTint(material: StandardMaterial, brightness: number, tint: readonly number[] = [1, 1, 1]): void {
  material.diffuse = new Color(brightness * tint[0], brightness * tint[1], brightness * tint[2]);
  material.update();
}
