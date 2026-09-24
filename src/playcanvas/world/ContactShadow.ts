import {
  BLEND_NORMAL,
  Color,
  Entity,
  PIXELFORMAT_RGBA8,
  StandardMaterial,
  Texture,
  type AppBase,
} from "playcanvas";

/** One material per opacity, shared by every contact shadow (the enemy horde has one each). */
const materials = new Map<number, StandardMaterial>();

/**
 * Soft dark ellipse under the feet. The sun shadow falls off to one side; this keeps the hero
 * visually planted on the ground from any angle, at the cost of one tiny transparent quad.
 */
export function createContactShadow(app: AppBase, opacity = 0.45): Entity {
  const entity = new Entity("ContactShadow");
  entity.addComponent("render", { type: "plane", material: contactShadowMaterial(app, opacity), castShadows: false, receiveShadows: false });
  // Unit quad; the owner scales it to the character's footprint.
  entity.setLocalPosition(0, 0.015, 0);
  return entity;
}

function contactShadowMaterial(app: AppBase, opacity: number): StandardMaterial {
  const cached = materials.get(opacity);
  if (cached) return cached;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(0.5, "rgba(0,0,0,0.55)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new Texture(app.graphicsDevice, { name: "contact-shadow", format: PIXELFORMAT_RGBA8, mipmaps: true });
  texture.setSource(canvas);

  const material = new StandardMaterial();
  material.diffuse = new Color(0, 0, 0);
  material.useLighting = false;
  material.useFog = false;
  material.opacityMap = texture;
  material.opacityMapChannel = "a";
  material.opacity = opacity;
  material.blendType = BLEND_NORMAL;
  material.depthWrite = false;
  material.update();
  materials.set(opacity, material);
  return material;
}
