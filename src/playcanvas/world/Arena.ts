import {
  ADDRESS_REPEAT,
  FILTER_LINEAR,
  FILTER_LINEAR_MIPMAP_LINEAR,
  PIXELFORMAT_SRGBA8,
  Texture,
  type AppBase,
} from "playcanvas";

/** Side length of the ground (metres); the playable arena is the smaller PLAYER.arenaHalfSize square. */
export const GROUND_SIZE = 120;

/** Cracked, dusty ground drawn once on a canvas; shown until the road textures load, and kept
 * if they fail. Deliberately dark and low-contrast so it gives
 * motion and scale reference without competing with the character. */
export function createGroundTexture(app: AppBase): Texture {
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
