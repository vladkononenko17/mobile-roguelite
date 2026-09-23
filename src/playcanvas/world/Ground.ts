import {
  ADDRESS_CLAMP_TO_EDGE,
  ADDRESS_REPEAT,
  BLEND_NORMAL,
  calculateTangents,
  Entity,
  Layer,
  Mesh,
  MeshInstance,
  PIXELFORMAT_RGBA8,
  SEMANTIC_TANGENT,
  StandardMaterial,
  Texture,
  type AppBase,
  type CameraComponent,
  type LightComponent,
} from "playcanvas";
import { GROUND, PAD, ROAD, ROCKY } from "../config";
import { createGroundTexture, GROUND_SIZE } from "./Arena";
import { groundQuadMesh } from "./kit/KitMesh";
import type { GroundSpec } from "./level/CheckpointLevel";
import { applySurface, setSurfaceTiling, setSurfaceTint } from "./Surface";

const HALF = GROUND_SIZE / 2;

function maskTexture(app: AppBase, name: string, canvas: HTMLCanvasElement, repeatU: boolean): Texture {
  const texture = new Texture(app.graphicsDevice, {
    name,
    format: PIXELFORMAT_RGBA8,
    mipmaps: true,
    addressU: repeatU ? ADDRESS_REPEAT : ADDRESS_CLAMP_TO_EDGE,
    addressV: ADDRESS_CLAMP_TO_EDGE,
  });
  texture.setSource(canvas);
  return texture;
}

/**
 * Road edge alpha: U runs along the road (tileable, one repeat per ROAD.maskPeriod metres), V
 * across the edge strip (0 = inner, fully road; 1 = outer, fully dirt). The fade line wanders so
 * the edge reads as crumbled asphalt rather than a clean border.
 */
function createRoadEdgeMask(app: AppBase): Texture {
  const width = 512, height = 32;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  for (let x = 0; x < width; x++) {
    const u = (x / width) * Math.PI * 2;
    // Integer frequencies keep the mask seamless along U.
    const wobble = Math.sin(u * 3 + 0.7) * 0.5 + Math.sin(u * 7 + 2.1) * 0.3 + Math.sin(u * 19 + 4.0) * 0.14 + Math.sin(u * 41 + 1.3) * 0.06;
    const centre = 0.5 + wobble * 0.3;
    for (let y = 0; y < height; y++) {
      const v = (y + 0.5) / height;
      const t = Math.min(1, Math.max(0, (v - (centre - 0.2)) / 0.4));
      const i = (y * width + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round((1 - t * t * (3 - 2 * t)) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return maskTexture(app, "road-edge-mask", canvas, true);
}

/** Irregular soft blob (UV1 0..1 over a patch quad) for rocky patches. */
function createPatchMask(app: AppBase): Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5;
      const angle = Math.atan2(dy, dx);
      const radius = 0.34 + Math.sin(angle * 3 + 0.4) * 0.05 + Math.sin(angle * 5 + 2.2) * 0.035 + Math.sin(angle * 11 + 1.1) * 0.02;
      const d = Math.hypot(dx, dy);
      const t = Math.min(1, Math.max(0, (d - (radius - 0.12)) / 0.16));
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round((1 - t * t * (3 - 2 * t)) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return maskTexture(app, "rock-patch-mask", canvas, false);
}

/** Triangle strip between two polylines, UV0 = world metres, UV1 = (along / period, across). */
function stripMesh(app: AppBase, inner: number[], outer: number[], along: number[], period: number, v0: number, v1: number): Mesh {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], uv1: number[] = [], indices: number[] = [];
  const n = along.length;
  for (let i = 0; i < n; i++) {
    for (const [pts, v] of [[inner, v0], [outer, v1]] as const) {
      const x = pts[i * 2], z = pts[i * 2 + 1];
      positions.push(x, 0, z);
      normals.push(0, 1, 0);
      uvs.push(x, z);
      uv1.push(along[i] / period, v);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    // Wind so the face points up whichever side of the centreline the strip lies on.
    const ax = positions[a * 3], az = positions[a * 3 + 2];
    const bx = positions[b * 3], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cz = positions[c * 3 + 2];
    const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0;
    if (up) indices.push(a, b, c, b, d, c);
    else indices.push(a, c, b, b, c, d);
  }
  const mesh = new Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setUvs(1, uv1);
  mesh.setVertexStream(SEMANTIC_TANGENT, calculateTangents(positions, normals, uvs, indices), 4);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/**
 * Level ground, all with UVs in world metres so surfaces keep their texel density:
 * - dirt: one opaque quad under everything;
 * - road: an opaque strip following the level's road path, plus two thin transparent edge strips
 *   whose mask crumbles the asphalt into the dirt;
 * - pads: opaque concrete floors (the yard);
 * - rocky patches: small transparent quads with an irregular blob mask.
 * Transparent pieces sit on their own layer after the opaque pass and before the World transparent
 * pass, so the hero's contact shadow still draws over them. Only the thin road edges and the
 * patches are transparent, which keeps overdraw low; the ground skips image-based lighting.
 */
export class Ground {
  private dirtTile: number = GROUND.tileMetres;
  private rockTile: number = ROCKY.tileMetres;
  private brightness: number = GROUND.brightness;
  private readonly dirt = new StandardMaterial();
  private readonly road = new StandardMaterial();
  private readonly roadEdge = new StandardMaterial();
  private readonly pad = new StandardMaterial();
  private readonly rock = new StandardMaterial();

  constructor(private readonly app: AppBase, private readonly spec: GroundSpec) {
    for (const m of [this.dirt, this.road, this.roadEdge, this.pad, this.rock]) m.useSkybox = false;
    // Procedural dirt until the texture set loads (and if it fails).
    this.dirt.diffuseMap = createGroundTexture(app);
    this.dirt.gloss = 0.1;
    this.dirt.useMetalness = true;
    setSurfaceTiling(this.dirt, 6);
    this.addMesh("Dirt", this.dirt, groundQuadMesh(app.graphicsDevice, -HALF, -HALF, HALF, HALF), 0);
  }

  get tileSize(): number { return this.dirtTile; }
  get rockTileSize(): number { return this.rockTile; }
  get tint(): number { return this.brightness; }

  /** Loads the surface textures and builds the road, pads and patches. Needs camera + lights. */
  async load(): Promise<void> {
    const app = this.app;
    const overlay = this.createOverlayLayer();
    const warn = (what: string) => (error: unknown) => console.warn(`[Ground] ${what} failed to load.`, error);
    await Promise.all([
      applySurface(app, this.dirt, GROUND).then(() => this.applyDirt(), warn("Dirt textures")),
      Promise.all([applySurface(app, this.road, ROAD), applySurface(app, this.roadEdge, ROAD), applySurface(app, this.pad, ROAD)]).then(() => {
        this.buildRoad(overlay);
        for (const p of this.spec.pads) this.addMesh("ConcretePad", this.pad, groundQuadMesh(app.graphicsDevice, p.x0, p.z0, p.x1, p.z1), 0.004);
        this.applyRoad();
      }, warn("Road textures")),
      applySurface(app, this.rock, ROCKY).then(() => {
        const rock = this.rock;
        rock.opacityMap = createPatchMask(app);
        rock.opacityMapChannel = "a";
        rock.opacityMapUv = 1;
        rock.blendType = BLEND_NORMAL;
        rock.depthWrite = false;
        for (const p of this.spec.rockPatches) {
          this.addMesh("RockPatch", rock, groundQuadMesh(app.graphicsDevice, p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2), 0.001, [overlay.id]);
        }
        this.applyRock();
      }, warn("Rocky terrain")),
    ]);
  }

  setTileSize(metres: number): void { this.dirtTile = metres; this.applyDirt(); }
  setRockTileSize(metres: number): void { this.rockTile = metres; this.applyRock(); }

  setBrightness(value: number): void {
    this.brightness = value;
    this.applyDirt();
    this.applyRoad();
    this.applyRock();
  }

  private buildRoad(overlay: Layer): void {
    const { roadCentreX, roadHalfWidth } = this.spec;
    const step = 0.75;
    const core = [[], []] as number[][];
    const edgeL = [[], []] as number[][];
    const edgeR = [[], []] as number[][];
    const along: number[] = [];
    let distance = 0;
    let prevX = roadCentreX(-HALF), prevZ = -HALF;
    for (let z = -HALF; z <= HALF + 1e-6; z += step) {
      const x = roadCentreX(z);
      distance += Math.hypot(x - prevX, z - prevZ);
      prevX = x; prevZ = z;
      // Unit normal to the centreline in the ground plane (points towards +X).
      const slope = (roadCentreX(z + 0.01) - roadCentreX(z - 0.01)) / 0.02;
      const len = Math.hypot(1, slope);
      const nx = 1 / len, nz = -slope / len;
      const hw = roadHalfWidth(z);
      const inner = hw - ROAD.edgeInner, outer = hw + ROAD.edgeOuter;
      core[0].push(x - nx * inner, z - nz * inner);
      core[1].push(x + nx * inner, z + nz * inner);
      edgeL[0].push(x - nx * inner, z - nz * inner);
      edgeL[1].push(x - nx * outer, z - nz * outer);
      edgeR[0].push(x + nx * inner, z + nz * inner);
      edgeR[1].push(x + nx * outer, z + nz * outer);
      along.push(distance);
    }
    const app = this.app;
    this.addMesh("Road", this.road, stripMesh(app, core[0], core[1], along, ROAD.maskPeriod, 0, 0), 0.002);
    const edge = this.roadEdge;
    edge.opacityMap = createRoadEdgeMask(app);
    edge.opacityMapChannel = "a";
    edge.opacityMapUv = 1;
    edge.blendType = BLEND_NORMAL;
    edge.depthWrite = false;
    this.addMesh("RoadEdge", edge, stripMesh(app, edgeL[0], edgeL[1], along, ROAD.maskPeriod, 0, 1), 0.002, [overlay.id]);
    this.addMesh("RoadEdge", edge, stripMesh(app, edgeR[0], edgeR[1], along, ROAD.maskPeriod, 0, 1), 0.002, [overlay.id]);
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

  private applyDirt(): void {
    setSurfaceTiling(this.dirt, this.dirtTile);
    setSurfaceTint(this.dirt, this.brightness);
  }

  private applyRoad(): void {
    for (const m of [this.road, this.roadEdge]) setSurfaceTint(m, ROAD.brightness * this.brightness / GROUND.brightness, ROAD.tint);
    setSurfaceTint(this.pad, PAD.brightness * this.brightness / GROUND.brightness, PAD.tint);
  }

  private applyRock(): void {
    setSurfaceTiling(this.rock, this.rockTile);
    setSurfaceTint(this.rock, this.brightness * ROCKY.brightness, ROCKY.tint);
  }
}
