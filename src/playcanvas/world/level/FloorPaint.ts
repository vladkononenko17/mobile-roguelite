import {
  BLEND_ADDITIVE, BLEND_NORMAL, Entity, FILTER_LINEAR, FILTER_LINEAR_MIPMAP_LINEAR, Mesh, MeshInstance, StandardMaterial, Texture, type AppBase,
} from "playcanvas";

/**
 * Painted floor markings (lanes, hazard stripes, landing pads, sector names): quads laid on the floor,
 * all merged into ONE mesh with one canvas atlas, so a whole level's paint is a single draw call.
 * Each quad carries its colour (vertex colour x the white atlas) and opacity.
 */
export type PaintSymbol = "hazard" | "chevron" | "ring" | "pad" | "cross" | "dash" | "frame" | "warning" | `label${number}`;

/** Atlas: 1024 x 512. Row 0: eight 128 px symbols; rows 1-3: two 512 x 128 labels each. */
const SYMBOLS: PaintSymbol[] = ["hazard", "chevron", "ring", "pad", "cross", "dash", "frame", "warning"];

function cell(symbol: PaintSymbol): [number, number, number, number] {
  const i = SYMBOLS.indexOf(symbol);
  if (i >= 0) return [(i * 128) / 1024, 0, ((i + 1) * 128) / 1024, 128 / 512];
  const n = Number(symbol.slice(5));
  const col = n % 2, row = 1 + Math.floor(n / 2);
  return [(col * 512) / 1024, (row * 128) / 512, ((col + 1) * 512) / 1024, ((row + 1) * 128) / 512];
}

function paintAtlas(g: CanvasRenderingContext2D, labels: string[]): void {
  g.clearRect(0, 0, 1024, 512);
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  const at = (i: number, draw: () => void) => { g.save(); g.translate(i * 128, 0); g.beginPath(); g.rect(0, 0, 128, 128); g.clip(); draw(); g.restore(); };
  // Hazard stripes (diagonal bands; tinted yellow / red by the quad's colour).
  at(0, () => { for (let k = -128; k < 256; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 16, 0); g.lineTo(k + 16 - 128, 128); g.lineTo(k - 128, 128); g.fill(); } });
  // Chevron pointing up (north).
  at(1, () => { g.lineWidth = 16; g.lineJoin = "miter"; for (const y of [30, 70]) { g.beginPath(); g.moveTo(22, y + 34); g.lineTo(64, y); g.lineTo(106, y + 34); g.stroke(); } });
  // Ring.
  at(2, () => { g.lineWidth = 9; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); g.stroke(); });
  // Landing pad: ring with an H.
  at(3, () => {
    g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke();
    g.fillRect(36, 34, 12, 60); g.fillRect(80, 34, 12, 60); g.fillRect(36, 58, 56, 12);
  });
  // Cross marker.
  at(4, () => { g.fillRect(56, 16, 16, 96); g.fillRect(16, 56, 96, 16); });
  // Dash (a lane segment along the quad's length).
  at(5, () => { g.fillRect(52, 8, 24, 112); });
  // Frame (a square outline: bays, spawn pads).
  at(6, () => { g.lineWidth = 10; g.strokeRect(8, 8, 112, 112); for (const [x, y] of [[8, 8], [96, 8], [8, 96], [96, 96]]) g.fillRect(x, y, 24, 24); });
  // Warning triangle.
  at(7, () => {
    g.lineWidth = 10; g.lineJoin = "round"; g.beginPath(); g.moveTo(64, 14); g.lineTo(116, 110); g.lineTo(12, 110); g.closePath(); g.stroke();
    g.fillRect(58, 44, 12, 38); g.fillRect(58, 90, 12, 12);
  });
  // Labels.
  g.textAlign = "center";
  g.textBaseline = "middle";
  labels.forEach((text, n) => {
    const col = n % 2, row = 1 + Math.floor(n / 2);
    g.save();
    g.translate(col * 512 + 256, row * 128 + 64);
    g.font = "900 64px Arial, Helvetica, sans-serif";
    const w = g.measureText(text).width;
    const k = Math.min(1, 470 / w);
    g.scale(k, 1);
    g.fillText(text, 0, 4);
    g.restore();
  });
}

export class FloorPaint {
  private readonly positions: number[] = [];
  private readonly uvs: number[] = [];
  private readonly colours: number[] = [];
  private readonly indices: number[] = [];

  /** `glow`: self-lit additive strips (light lines in the floor) instead of lit paint. */
  constructor(private readonly labels: string[], private readonly glow = false) {}

  /**
   * One quad centred on (x, z), `w` across and `d` along its "up" (the symbol's top points north at
   * yaw 0), turned `yawDeg` about Y, at height `y` (above the floor and its patches).
   */
  add(symbol: PaintSymbol, x: number, z: number, w: number, d: number, yawDeg: number, rgb: [number, number, number], alpha = 0.8, y = 0.025): void {
    const [u0, v0, u1, v1] = cell(symbol);
    const a = (yawDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const base = this.positions.length / 3;
    // Corners: top-left, top-right, bottom-right, bottom-left (top = -z before turning).
    for (const [lx, lz, u, v] of [[-w / 2, -d / 2, u0, v0], [w / 2, -d / 2, u1, v0], [w / 2, d / 2, u1, v1], [-w / 2, d / 2, u0, v1]]) {
      this.positions.push(x + lx * c + lz * s, y, z - lx * s + lz * c);
      this.uvs.push(u, v);
      const k = this.glow ? alpha : 1;
      this.colours.push(Math.round(rgb[0] * k * 255), Math.round(rgb[1] * k * 255), Math.round(rgb[2] * k * 255), Math.round(alpha * 255));
    }
    this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  /** A dashed lane from (ax, az) to (bx, bz). */
  lane(ax: number, az: number, bx: number, bz: number, rgb: [number, number, number], width = 0.35, dash = 1.6, gap = 1.2, alpha = 0.7): void {
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = (Math.atan2(-(bx - ax), -(bz - az)) * 180) / Math.PI;
    for (let t = dash / 2; t < len; t += dash + gap) {
      const f = t / len;
      this.add("dash", ax + (bx - ax) * f, az + (bz - az) * f, width * 5.3, dash * 1.14, yaw, rgb, alpha);
    }
  }

  build(app: AppBase, parent: Entity): Entity | null {
    if (!this.indices.length) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    paintAtlas(canvas.getContext("2d")!, this.labels);
    const texture = new Texture(app.graphicsDevice, { width: 1024, height: 512, mipmaps: true, minFilter: FILTER_LINEAR_MIPMAP_LINEAR, magFilter: FILTER_LINEAR, anisotropy: 4 });
    texture.setSource(canvas);
    const material = new StandardMaterial();
    if (this.glow) {
      // Light strips: colour x atlas, added on top (alpha scales the colour instead).
      material.diffuse.set(0, 0, 0);
      material.emissive.set(1, 1, 1);
      material.emissiveMap = texture;
      material.emissiveVertexColor = true;
      material.emissiveVertexColorChannel = "rgb";
      material.useLighting = false;
      material.blendType = BLEND_ADDITIVE;
    } else {
      material.diffuseMap = texture;
      material.diffuseVertexColor = true;
      material.diffuseVertexColorChannel = "rgb";
      material.opacityMap = texture;
      material.opacityMapChannel = "a";
      material.opacityVertexColor = true;
      material.opacityVertexColorChannel = "a";
      material.blendType = BLEND_NORMAL;
    }
    material.depthWrite = false;
    material.useSkybox = false;
    material.update();
    const mesh = new Mesh(app.graphicsDevice);
    mesh.setPositions(this.positions);
    mesh.setNormals(this.positions.map((_, i) => (i % 3 === 1 ? 1 : 0)));
    mesh.setUvs(0, this.uvs);
    mesh.setColors32(this.colours);
    mesh.setIndices(this.indices);
    mesh.update();
    const entity = new Entity(this.glow ? "floor-light" : "floor-paint");
    entity.addComponent("render", { meshInstances: [new MeshInstance(mesh, material)], castShadows: false, receiveShadows: true });
    parent.addChild(entity);
    return entity;
  }
}
