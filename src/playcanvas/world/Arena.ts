import {
  ADDRESS_REPEAT,
  Color,
  Entity,
  FILTER_LINEAR,
  FILTER_LINEAR_MIPMAP_LINEAR,
  PIXELFORMAT_SRGBA8,
  StandardMaterial,
  Texture,
  Vec2,
  type AppBase,
} from "playcanvas";
import { PLAYER } from "../config";

/** Metres covered by one repeat of the procedural fallback ground texture. */
const GROUND_TILE_METRES = 6;
export const GROUND_SIZE = 120;

/** Cracked, dusty ground drawn once on a canvas; shown until the road textures load, and kept
 * if they fail. Deliberately dark and low-contrast so it gives
 * motion and scale reference without competing with the character. */
function createGroundTexture(app: AppBase): Texture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#6e5746";
  ctx.fillRect(0, 0, size, size);

  // Deterministic noise so the texture looks the same every load.
  let seed = 1337;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Soft low-frequency patches (drawn with wrap-around copies so the tile stays seamless).
  for (let i = 0; i < 18; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 60 + random() * 110;
    const light = random() > 0.5;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, light ? "rgba(140,112,88,0.22)" : "rgba(58,42,30,0.22)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  // Fine grit.
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = random() > 0.5 ? `rgba(150,124,100,${0.25 * random()})` : `rgba(40,30,22,${0.25 * random()})`;
    const r = 0.5 + random() * 1.4;
    ctx.fillRect(random() * size, random() * size, r, r);
  }
  // Worn slab seams: two per tile, wrapping cleanly.
  ctx.strokeStyle = "rgba(48,34,24,0.07)";
  ctx.lineWidth = 2;
  for (const p of [0, size / 2]) {
    ctx.beginPath();
    ctx.moveTo(p + 1.5, 0); ctx.lineTo(p + 1.5, size);
    ctx.moveTo(0, p + 1.5); ctx.lineTo(size, p + 1.5);
    ctx.stroke();
  }
  // A few hairline cracks.
  ctx.strokeStyle = "rgba(44,30,20,0.22)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    let x = random() * size;
    let y = random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (random() - 0.5) * 50;
      y += (random() - 0.5) * 50;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const texture = new Texture(app.graphicsDevice, {
    name: "ground",
    format: PIXELFORMAT_SRGBA8,
    mipmaps: true,
    minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: FILTER_LINEAR,
    addressU: ADDRESS_REPEAT,
    addressV: ADDRESS_REPEAT,
    anisotropy: 4,
  });
  texture.setSource(canvas);
  return texture;
}

function material(color: string, gloss: number, metalness = 0): StandardMaterial {
  const m = new StandardMaterial();
  m.diffuse = new Color().fromString(color);
  m.gloss = gloss;
  m.metalness = metalness;
  m.useMetalness = true;
  m.update();
  return m;
}

function addPrimitive(
  app: AppBase,
  type: "box" | "cylinder",
  mat: StandardMaterial,
  position: [number, number, number],
  scale: [number, number, number],
  yawDeg = 0,
): void {
  const entity = new Entity(type);
  entity.addComponent("render", { type, material: mat, castShadows: true, receiveShadows: true });
  entity.setLocalScale(scale[0], scale[1], scale[2]);
  entity.setLocalPosition(position[0], position[1] + scale[1] / 2, position[2]);
  entity.setLocalEulerAngles(0, yawDeg, 0);
  app.root.addChild(entity);
}

/**
 * Flat test arena: textured ground plus a handful of placeholder crates, barrels and barrier
 * blocks for scale, parallax and shadow reference. No collision yet; the player is clamped to
 * the arena square instead.
 */
export function createArena(app: AppBase): { groundMaterial: StandardMaterial } {
  const groundMaterial = new StandardMaterial();
  groundMaterial.diffuseMap = createGroundTexture(app);
  const tiling = GROUND_SIZE / GROUND_TILE_METRES;
  groundMaterial.diffuseMapTiling = new Vec2(tiling, tiling);
  groundMaterial.gloss = 0.1;
  groundMaterial.useMetalness = true;
  groundMaterial.metalness = 0;
  groundMaterial.update();

  const ground = new Entity("Ground");
  ground.addComponent("render", { type: "plane", material: groundMaterial, castShadows: false, receiveShadows: true });
  ground.setLocalScale(GROUND_SIZE, 1, GROUND_SIZE);
  app.root.addChild(ground);

  const crate = material("#5f4a3a", 0.25);
  const rust = material("#5a3b2c", 0.4, 0.4);
  const concrete = material("#6f6961", 0.1);
  const hazard = material("#7c6236", 0.3);

  // A few pieces close to spawn so the portrait camera always has scale reference in view.
  addPrimitive(app, "box", crate, [2.3, 0, -2.2], [1.1, 1.1, 1.1], 20);
  addPrimitive(app, "box", crate, [3.2, 0, -1.4], [0.8, 0.8, 0.8], -10);
  addPrimitive(app, "cylinder", rust, [-2.2, 0, -3.8], [0.7, 1.1, 0.7]);
  addPrimitive(app, "box", concrete, [-2.6, 0, 1.8], [1.8, 0.7, 0.6], 15);
  addPrimitive(app, "box", crate, [4, 0, -3], [1.2, 1.2, 1.2], 20);
  addPrimitive(app, "box", crate, [-6, 0, 4], [1.4, 1.1, 1.4], 45);
  addPrimitive(app, "cylinder", rust, [-4, 0, -5], [0.8, 1.2, 0.8]);
  addPrimitive(app, "cylinder", hazard, [-3.1, 0, -5.6], [0.8, 1.2, 0.8]);
  addPrimitive(app, "cylinder", rust, [7, 0, 6], [0.8, 1.2, 0.8]);
  addPrimitive(app, "box", concrete, [0, 0, -10], [6, 1, 0.8]);
  addPrimitive(app, "box", concrete, [-10, 0, 0], [0.8, 1, 5], 8);
  addPrimitive(app, "box", rust, [10, 0, -8], [2.5, 2.4, 1.2], -30);

  // Low walls marking the arena edge the player is clamped to.
  const edge = PLAYER.arenaHalfSize + 0.8;
  const length = edge * 2 + 1.6;
  addPrimitive(app, "box", concrete, [0, 0, -edge], [length, 0.6, 0.8]);
  addPrimitive(app, "box", concrete, [0, 0, edge], [length, 0.6, 0.8]);
  addPrimitive(app, "box", concrete, [-edge, 0, 0], [0.8, 0.6, length]);
  addPrimitive(app, "box", concrete, [edge, 0, 0], [0.8, 0.6, length]);

  return { groundMaterial };
}
