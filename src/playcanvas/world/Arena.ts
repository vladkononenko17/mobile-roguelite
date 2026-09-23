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

/** Metres covered by one repeat of the ground texture. */
const GROUND_TILE_METRES = 4;
const GROUND_SIZE = 120;

/** Cracked, dusty ground drawn once on a canvas; gives the eye motion and scale reference. */
function createGroundTexture(app: AppBase): Texture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#94694a";
  ctx.fillRect(0, 0, size, size);

  // Deterministic speckle so the texture looks the same every load.
  let seed = 1337;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const shade = random();
    ctx.fillStyle = shade > 0.5 ? `rgba(196,150,104,${0.3 * random()})` : `rgba(92,62,40,${0.3 * random()})`;
    const r = 1 + random() * 9;
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Worn slab seams: two per tile, wrapping cleanly.
  ctx.strokeStyle = "rgba(70,46,30,0.45)";
  ctx.lineWidth = 3;
  for (const p of [0, size / 2]) {
    ctx.beginPath();
    ctx.moveTo(p + 1.5, 0); ctx.lineTo(p + 1.5, size);
    ctx.moveTo(0, p + 1.5); ctx.lineTo(size, p + 1.5);
    ctx.stroke();
  }
  // A few hairline cracks.
  ctx.strokeStyle = "rgba(60,38,24,0.5)";
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
export function createArena(app: AppBase): void {
  const groundMaterial = new StandardMaterial();
  groundMaterial.diffuseMap = createGroundTexture(app);
  const tiling = GROUND_SIZE / GROUND_TILE_METRES;
  groundMaterial.diffuseMapTiling = new Vec2(tiling, tiling);
  groundMaterial.gloss = 0.18;
  groundMaterial.useMetalness = true;
  groundMaterial.metalness = 0;
  groundMaterial.update();

  const ground = new Entity("Ground");
  ground.addComponent("render", { type: "plane", material: groundMaterial, castShadows: false, receiveShadows: true });
  ground.setLocalScale(GROUND_SIZE, 1, GROUND_SIZE);
  app.root.addChild(ground);

  const crate = material("#8a5a32", 0.3);
  const rust = material("#7b3f24", 0.45, 0.55);
  const concrete = material("#9c9285", 0.12);
  const hazard = material("#d99a2b", 0.35);

  addPrimitive(app, "box", crate, [4, 0, -3], [1.2, 1.2, 1.2], 20);
  addPrimitive(app, "box", crate, [5.1, 0, -2.2], [0.9, 0.9, 0.9], -10);
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
}
