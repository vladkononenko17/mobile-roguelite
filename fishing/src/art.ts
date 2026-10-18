import Phaser from "phaser";

/**
 * Original low-poly art for «Не клюёт», drawn in code like the roguelite's
 * TextureFactory: flat-shaded facets, the same ink outline and paper palette.
 * Every texture is baked once at 2x and displayed at 0.5 scale.
 */

export const S = 2;
export const INK = 0x171318;
export const PAPER = 0xe7ddc6;
export const YELLOW = 0xf2b632;
export const ORANGE = 0xe8602f;
export const RED = 0xd63732;
export const ACID = 0xb8d84a;
export const BLUE = 0x54b7c6;

type G = Phaser.GameObjects.Graphics;

export function shade(color: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((color & 255) * factor)));
  return (r << 16) | (g << 8) | b;
}

function pts(points: number[], ox = 0, oy = 0): Phaser.Types.Math.Vector2Like[] {
  const out: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < points.length; i += 2) out.push({ x: (points[i] + ox) * S, y: (points[i + 1] + oy) * S });
  return out;
}

/** Plain ink-outlined polygon. */
export function poly(g: G, points: number[], fill: number, line = 2.5, alpha = 1): void {
  const p = pts(points);
  g.fillStyle(fill, alpha).fillPoints(p, true);
  if (line > 0) g.lineStyle(line * S, INK, 1).strokePoints(p, true, true);
}

/**
 * Low-poly facet fill: fan-triangulate from an off-centre apex and shade each
 * facet by how much it faces a top-left light. Thin seams sell the polygons.
 */
export function facet(g: G, points: number[], base: number, line = 2.5, light = 0.16): void {
  const p = pts(points);
  let cx = 0;
  let cy = 0;
  p.forEach((v) => { cx += v.x; cy += v.y; });
  cx /= p.length;
  cy /= p.length;
  // Shift the apex toward the light so facets read as a ridge.
  const apex = { x: cx - 4 * S, y: cy - 5 * S };
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const mx = (a.x + b.x) / 2 - apex.x;
    const my = (a.y + b.y) / 2 - apex.y;
    const len = Math.hypot(mx, my) || 1;
    const facing = (-mx * 0.6 - my * 0.8) / len; // dot with light from upper-left
    g.fillStyle(shade(base, 1 + facing * light), 1);
    g.fillTriangle(apex.x, apex.y, a.x, a.y, b.x, b.y);
  }
  g.lineStyle(1 * S, INK, 0.22);
  for (const v of p) g.lineBetween(apex.x, apex.y, v.x, v.y);
  if (line > 0) g.lineStyle(line * S, INK, 1).strokePoints(p, true, true);
}

function tri(g: G, a: number[], color: number): void {
  g.fillStyle(color, 1).fillTriangle(a[0] * S, a[1] * S, a[2] * S, a[3] * S, a[4] * S, a[5] * S);
}

function circle(g: G, x: number, y: number, r: number, fill: number, line = 2): void {
  g.fillStyle(fill, 1).fillCircle(x * S, y * S, r * S);
  if (line > 0) g.lineStyle(line * S, INK, 1).strokeCircle(x * S, y * S, r * S);
}

function seg(g: G, x1: number, y1: number, x2: number, y2: number, width: number, color = INK): void {
  g.lineStyle(width * S, color, 1).lineBetween(x1 * S, y1 * S, x2 * S, y2 * S);
}

function bake(scene: Phaser.Scene, g: G, key: string, w: number, h: number): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  g.generateTexture(key, w * S, h * S);
  g.clear();
}

// ---------------------------------------------------------------- characters

const OLIVE = 0x5f6e37;
const SKIN = 0xe0a77d;
const DENIM = 0x3d4f6e;
const BOOT = 0x3a2f2b;

function stool(g: G, x: number, y: number, w: number): void {
  seg(g, x - w / 2, y + 26, x + w / 2, y, 3.2, 0x6b4a2e);
  seg(g, x + w / 2, y + 26, x - w / 2, y, 3.2, 0x8a6038);
  poly(g, [x - w / 2 - 3, y - 3, x + w / 2 + 3, y - 3, x + w / 2 + 1, y + 4, x - w / 2 - 1, y + 4], 0x2f4f45, 2);
}

/** Hero, seen from behind and a little to the left, facing the river. */
function drawPlayerBody(g: G): void {
  g.fillStyle(INK, 0.28).fillEllipse(55 * S, 126 * S, 80 * S, 10 * S);
  stool(g, 54, 96, 40);
  // Legs folded forward: jeans knees peeking right, boots below.
  facet(g, [70, 86, 96, 84, 100, 96, 74, 100], DENIM, 2.5);
  facet(g, [86, 96, 100, 96, 102, 118, 88, 120], DENIM, 2.5);
  poly(g, [84, 116, 104, 115, 108, 124, 82, 125], BOOT, 2.5);
  // Jacket body.
  facet(g, [28, 98, 40, 46, 56, 36, 76, 40, 86, 60, 84, 100, 56, 104], OLIVE, 3);
  // Camo blotches.
  tri(g, [40, 70, 50, 62, 52, 76], shade(OLIVE, 0.72));
  tri(g, [62, 84, 74, 78, 70, 92], shade(OLIVE, 0.72));
  tri(g, [58, 52, 68, 48, 64, 60], shade(OLIVE, 1.25));
  // Collar.
  facet(g, [42, 46, 54, 34, 74, 36, 80, 46, 62, 44], shade(OLIVE, 0.85), 2.5);
  // Back arm, mostly hidden.
  facet(g, [28, 60, 38, 52, 40, 86, 30, 90], shade(OLIVE, 0.82), 2.5);
  // Rod arm reaching to the reel.
  facet(g, [72, 46, 88, 52, 104, 72, 96, 78, 80, 64], OLIVE, 3);
  circle(g, 101, 76, 6, SKIN, 2.5);
  // Belt line + reflective tab.
  seg(g, 31, 94, 84, 96, 2.5);
  poly(g, [64, 88, 72, 88, 72, 94, 64, 94], YELLOW, 1.5);
}

function drawPlayerHead(g: G, layer: "skin" | "hat"): void {
  if (layer === "skin") {
    // Neck, cheek and the tip of the nose turned toward the water.
    facet(g, [18, 52, 22, 30, 34, 18, 48, 22, 54, 34, 52, 44, 46, 54], SKIN, 3, 0.12);
    poly(g, [50, 36, 58, 38, 52, 44], SKIN, 2);
    // Ear.
    poly(g, [20, 34, 14, 36, 14, 44, 21, 46], shade(SKIN, 0.86), 2);
    // Stubble jaw.
    tri(g, [38, 48, 52, 40, 48, 52], shade(SKIN, 0.82));
    return;
  }
  // Orange watch cap, folded brim.
  facet(g, [16, 30, 18, 14, 30, 4, 46, 6, 54, 18, 54, 28], ORANGE, 3);
  facet(g, [14, 26, 54, 24, 56, 32, 16, 36], shade(ORANGE, 0.82), 2.5);
  seg(g, 24, 9, 22, 30, 1.5, shade(ORANGE, 0.6));
  seg(g, 36, 6, 36, 26, 1.5, shade(ORANGE, 0.6));
  poly(g, [26, 4, 30, 0, 36, 2, 33, 7], YELLOW, 1.5);
}

/** Tolik: wider, safari vest, bucket hat, always winning. */
function drawFriendBody(g: G, pose: "sit" | "stretch" | "phone"): void {
  const VEST = 0xb0915b;
  const SHIRT = 0x3e6ea0;
  g.fillStyle(INK, 0.28).fillEllipse(65 * S, 136 * S, 92 * S, 11 * S);
  stool(g, 66, 106, 46);
  // Knees and boots stick out to the left (he faces up-left).
  facet(g, [40, 92, 14, 92, 10, 106, 38, 110], 0x4a5541, 2.5);
  facet(g, [26, 104, 10, 104, 8, 126, 22, 128], 0x4a5541, 2.5);
  poly(g, [26, 124, 4, 123, 0, 133, 28, 134], BOOT, 2.5);
  // Shirt torso and belly.
  facet(g, [30, 106, 26, 70, 40, 46, 66, 38, 92, 46, 104, 74, 100, 108, 64, 114], SHIRT, 3);
  // Vest panels with pockets.
  facet(g, [32, 104, 30, 70, 44, 50, 58, 46, 56, 108], VEST, 2.5);
  facet(g, [74, 108, 76, 46, 92, 50, 100, 76, 98, 106], VEST, 2.5);
  poly(g, [36, 76, 50, 76, 50, 88, 36, 88], shade(VEST, 0.82), 2);
  poly(g, [80, 78, 94, 78, 94, 90, 80, 90], shade(VEST, 0.82), 2);
  for (const [x, y] of [[43, 80], [87, 82]]) circle(g, x, y, 1.5, INK, 0);
  if (pose === "stretch") {
    facet(g, [42, 52, 30, 30, 26, 6, 36, 6, 42, 28, 52, 48], SHIRT, 3);
    facet(g, [88, 50, 100, 28, 104, 6, 94, 6, 88, 28, 80, 46], SHIRT, 3);
    circle(g, 31, 6, 6, SKIN, 2.5);
    circle(g, 99, 6, 6, SKIN, 2.5);
  } else if (pose === "phone") {
    facet(g, [44, 54, 30, 70, 34, 82, 50, 70], SHIRT, 3);
    poly(g, [24, 66, 36, 62, 40, 80, 28, 84], 0x22252b, 2.5);
    poly(g, [27, 68, 35, 65, 38, 78, 30, 81], BLUE, 0);
    circle(g, 34, 80, 5, SKIN, 2.5);
  } else {
    // Rod arm toward the water on the left.
    facet(g, [48, 54, 34, 62, 18, 80, 26, 88, 44, 72], SHIRT, 3);
    circle(g, 19, 86, 6.5, SKIN, 2.5);
  }
}

function drawFriendHead(g: G, look: "back" | "player" | "sus" | "down"): void {
  const HAT = 0xd8c49a;
  if (look === "back" || look === "down") {
    facet(g, [18, 56, 14, 34, 24, 20, 44, 18, 56, 30, 56, 50, 48, 60], SKIN, 3, 0.12);
    poly(g, [52, 36, 58, 38, 58, 46, 52, 48], shade(SKIN, 0.86), 2);
    // Profile of nose + moustache on the left edge.
    poly(g, [16, 38, 8, 42, 15, 44], SKIN, 2);
    if (look === "down") tri(g, [10, 48, 24, 46, 18, 52], 0x5a3a24);
    else tri(g, [9, 46, 22, 44, 17, 50], 0x5a3a24);
  } else {
    // Turned toward the hero on his left: full face, smug or squinting.
    facet(g, [14, 52, 10, 30, 22, 18, 44, 18, 54, 30, 52, 52, 34, 62], SKIN, 3, 0.12);
    poly(g, [52, 34, 58, 36, 58, 44, 52, 46], shade(SKIN, 0.86), 2);
    poly(g, [22, 36, 16, 46, 26, 46], shade(SKIN, 0.9), 2);
    // Moustache.
    facet(g, [12, 48, 22, 44, 34, 46, 30, 52, 20, 52], 0x5a3a24, 2);
    if (look === "sus") {
      seg(g, 14, 34, 24, 36, 2.6);
      seg(g, 30, 36, 40, 34, 2.6);
      seg(g, 13, 29, 24, 32, 2);
      seg(g, 30, 31, 41, 27, 2);
    } else {
      circle(g, 19, 35, 2.4, INK, 0);
      circle(g, 35, 35, 2.4, INK, 0);
      seg(g, 13, 29, 23, 28, 2);
      seg(g, 30, 28, 40, 30, 2);
    }
  }
  // Bucket hat.
  facet(g, [18, 24, 22, 8, 46, 6, 52, 22], HAT, 3);
  facet(g, [6, 26, 60, 22, 62, 30, 4, 32], shade(HAT, 0.86), 2.5);
  seg(g, 22, 18, 50, 16, 2, 0x7f6a45);
}

// --------------------------------------------------------------------- props

function drawBobber(g: G): void {
  poly(g, [11, 0, 12, 10, 10, 10], INK, 0);
  facet(g, [11, 8, 18, 15, 11, 18, 4, 15], RED, 2, 0.25);
  facet(g, [4, 15, 11, 18, 18, 15, 11, 28], PAPER, 2, 0.2);
}

function drawCooler(g: G): void {
  g.fillStyle(INK, 0.25).fillEllipse(30 * S, 44 * S, 58 * S, 8 * S);
  facet(g, [4, 18, 56, 18, 54, 42, 6, 42], BLUE, 3);
  facet(g, [2, 10, 58, 10, 58, 20, 2, 20], PAPER, 3);
  poly(g, [22, 4, 38, 4, 38, 10, 22, 10], 0x2c3036, 2);
  poly(g, [10, 26, 22, 26, 22, 36, 10, 36], shade(BLUE, 0.75), 1.5);
}

function drawBucket(g: G): void {
  const TIN = 0x9aa3a6;
  g.fillStyle(INK, 0.25).fillEllipse(24 * S, 44 * S, 46 * S, 7 * S);
  facet(g, [4, 12, 44, 12, 38, 42, 10, 42], TIN, 3, 0.2);
  g.fillStyle(0x24343a, 1).fillEllipse(24 * S, 12 * S, 40 * S, 8 * S);
  g.lineStyle(2.5 * S, INK, 1).strokeEllipse(24 * S, 12 * S, 40 * S, 8 * S);
  seg(g, 7, 22, 41, 22, 1.5, shade(TIN, 0.7));
  seg(g, 9, 33, 39, 33, 1.5, shade(TIN, 0.7));
  g.lineStyle(2 * S, INK, 1).beginPath().arc(24 * S, 12 * S, 21 * S, Math.PI * 1.05, Math.PI * 1.95).strokePath();
}

function drawBeer(g: G): void {
  facet(g, [2, 4, 14, 4, 14, 26, 2, 26], 0xc9a227, 2, 0.3);
  poly(g, [2, 10, 14, 10, 14, 18, 2, 18], RED, 1.5);
  poly(g, [3, 1, 13, 1, 14, 4, 2, 4], 0xb7bcc0, 1.5);
}

function drawPhone(g: G): void {
  poly(g, [1, 1, 15, 1, 15, 27, 1, 27], 0x22252b, 2);
  poly(g, [3, 4, 13, 4, 13, 23, 3, 23], 0x8a3fd1, 0);
  tri(g, [3, 23, 13, 4, 13, 23], 0xe8602f);
}

function drawCig(g: G): void {
  poly(g, [0, 1, 12, 1, 12, 4, 0, 4], PAPER, 1);
  poly(g, [0, 1, 4, 1, 4, 4, 0, 4], 0xd28a3c, 0);
  g.fillStyle(0xff7a2a, 1).fillCircle(12.5 * S, 2.5 * S, 1.6 * S);
}

function drawFish(g: G, kind: "fish" | "long" | "cat"): void {
  if (kind === "long") {
    facet(g, [2, 10, 14, 4, 46, 6, 56, 10, 46, 14, 14, 16], PAPER, 2.5, 0.25);
    poly(g, [54, 10, 64, 2, 62, 10, 64, 18], PAPER, 2);
    poly(g, [28, 6, 34, 0, 38, 6], PAPER, 1.5);
    circle(g, 9, 9, 1.6, INK, 0);
    return;
  }
  if (kind === "cat") {
    facet(g, [2, 12, 12, 4, 44, 6, 56, 12, 44, 18, 12, 20], PAPER, 2.5, 0.25);
    poly(g, [54, 12, 64, 4, 62, 12, 64, 22], PAPER, 2);
    seg(g, 4, 14, 0, 22, 1.2);
    seg(g, 6, 15, 4, 24, 1.2);
    circle(g, 10, 10, 1.6, INK, 0);
    return;
  }
  facet(g, [2, 12, 12, 3, 28, 1, 40, 8, 40, 16, 28, 22, 12, 21], PAPER, 2.5, 0.25);
  poly(g, [38, 12, 50, 3, 48, 12, 50, 21], PAPER, 2);
  poly(g, [18, 3, 26, -2 + 3, 30, 3], PAPER, 1.5);
  circle(g, 9, 10, 1.7, INK, 0);
}

function drawBush(g: G): void {
  facet(g, [4, 40, 2, 24, 12, 10, 28, 4, 44, 8, 56, 20, 58, 40], 0x3f6a33, 3, 0.22);
  facet(g, [18, 40, 22, 22, 34, 16, 44, 26, 46, 40], 0x4f7d3b, 2, 0.22);
}

function drawReed(g: G): void {
  for (let i = 0; i < 5; i++) {
    const x = 4 + i * 5;
    const top = 6 + (i % 2) * 8;
    tri(g, [x, 60, x + 3, 60, x + 1 + (i - 2) * 2, top], shade(0x6f8a3a, 0.85 + i * 0.06));
  }
  poly(g, [9, 6, 13, 6, 13, 20, 9, 20], 0x6b4a2e, 1.5);
  poly(g, [19, 12, 23, 12, 23, 24, 19, 24], 0x6b4a2e, 1.5);
}

export function createFishingTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  drawPlayerBody(g); bake(scene, g, "player-body", 112, 130);
  drawPlayerHead(g, "skin"); bake(scene, g, "player-skin", 62, 60);
  drawPlayerHead(g, "hat"); bake(scene, g, "player-hat", 62, 60);
  drawFriendBody(g, "sit"); bake(scene, g, "friend-body", 112, 140);
  drawFriendBody(g, "stretch"); bake(scene, g, "friend-stretch", 112, 140);
  drawFriendBody(g, "phone"); bake(scene, g, "friend-phone", 112, 140);
  drawFriendHead(g, "back"); bake(scene, g, "friend-head-back", 66, 66);
  drawFriendHead(g, "down"); bake(scene, g, "friend-head-down", 66, 66);
  drawFriendHead(g, "player"); bake(scene, g, "friend-head-look", 66, 66);
  drawFriendHead(g, "sus"); bake(scene, g, "friend-head-sus", 66, 66);
  drawBobber(g); bake(scene, g, "bobber", 22, 30);
  drawCooler(g); bake(scene, g, "cooler", 60, 48);
  drawBucket(g); bake(scene, g, "bucket", 48, 48);
  drawBeer(g); bake(scene, g, "beer", 16, 28);
  drawPhone(g); bake(scene, g, "phone", 16, 28);
  drawCig(g); bake(scene, g, "cig", 16, 6);
  drawFish(g, "fish"); bake(scene, g, "fish", 52, 24);
  drawFish(g, "long"); bake(scene, g, "fish-long", 66, 20);
  drawFish(g, "cat"); bake(scene, g, "fish-cat", 66, 26);
  drawBush(g); bake(scene, g, "bush", 60, 44);
  drawReed(g); bake(scene, g, "reed", 30, 62);
  g.fillStyle(0xffffff, 1).fillCircle(5 * S, 5 * S, 4 * S); bake(scene, g, "dot", 10, 10);
  g.destroy();
}

export const FISH_LOOK: Record<string, { key: string; tint: number }> = {
  "ЁРШ": { key: "fish", tint: 0xa58d5c },
  "ПЛОТВА": { key: "fish", tint: 0xd7dde0 },
  "ОКУНЬ": { key: "fish", tint: 0x9cbc4a },
  "КАРАСЬ": { key: "fish", tint: 0xe7b84a },
  "ЛЕЩ": { key: "fish", tint: 0xc4a067 },
  "СУДАК": { key: "fish-long", tint: 0xaab7a4 },
  "ЩУКА": { key: "fish-long", tint: 0x7fa04a },
  "СОМ": { key: "fish-cat", tint: 0x6b6f5a },
};

// ---------------------------------------------------------------- landscape

/**
 * The static river landscape for a given viewport, baked to one texture so
 * the phone redraws a single quad per frame.
 */
export function drawLandscape(scene: Phaser.Scene, w: number, h: number, key: string): { waterTop: number; waterBottom: number; bankY: number } {
  const g = scene.add.graphics();
  const random = new Phaser.Math.RandomDataGenerator(["ne-klyuet-river"]);
  const waterTop = Math.round(h * 0.31);
  const waterBottom = Math.round(h * 0.66);
  const bankY = waterBottom;
  const F = (a: number[]) => a.map((v) => v / S);

  // Sky: horizontal low-poly bands.
  const skyBands = [0x8fc6d0, 0x9fcfd2, 0xb4d8cf, 0xcfe0c4];
  const bandH = waterTop / skyBands.length;
  skyBands.forEach((color, i) => {
    const y0 = i * bandH;
    g.fillStyle(color, 1).fillRect(0, y0 * S, w * S, (bandH + 3) * S);
    for (let x = 0; x < w; x += 60) {
      const jitter = random.between(-6, 6);
      g.fillStyle(shade(color, random.realInRange(0.97, 1.03)), 1);
      g.fillTriangle(x * S, y0 * S, (x + 60) * S, y0 * S, (x + 30) * S, (y0 + bandH + jitter + 2) * S);
      g.fillStyle(shade(color, random.realInRange(0.95, 1.02)), 1);
      g.fillTriangle((x + 30) * S, (y0 + bandH + jitter + 2) * S, (x + 60) * S, y0 * S, (x + 90) * S, (y0 + bandH + 2) * S);
      g.fillTriangle(x * S, y0 * S, (x - 30) * S, (y0 + bandH + 2) * S, (x + 30) * S, (y0 + bandH + jitter + 2) * S);
    }
  });

  // Far hills.
  const hills = [w * -0.1, waterTop - 6, w * 0.12, waterTop - 52, w * 0.34, waterTop - 30, w * 0.55, waterTop - 70, w * 0.78, waterTop - 38, w * 1.1, waterTop - 60, w * 1.1, waterTop + 4, w * -0.1, waterTop + 4];
  facet(g, F(hills.map((v) => v * S)), 0x7f9c6a, 0, 0.1);
  // Low-poly pine forest on the far bank.
  for (let i = 0; i < 26; i++) {
    const x = random.between(-10, w + 10);
    const base = waterTop + random.between(2, 6);
    const height = random.between(26, 54);
    const half = height * 0.32;
    const green = random.pick([0x2f5a3c, 0x376643, 0x2a4f37, 0x3f704a]);
    g.fillStyle(shade(green, 1.15), 1).fillTriangle((x - half) * S, base * S, x * S, (base - height) * S, x * S, base * S);
    g.fillStyle(shade(green, 0.82), 1).fillTriangle(x * S, base * S, x * S, (base - height) * S, (x + half) * S, base * S);
    g.lineStyle(1.5 * S, INK, 0.85).strokeTriangle((x - half) * S, base * S, x * S, (base - height) * S, (x + half) * S, base * S);
  }
  g.fillStyle(0x4a6b3a, 1).fillRect(0, (waterTop - 2) * S, w * S, 8 * S);
  g.lineStyle(2.5 * S, INK, 1).lineBetween(0, (waterTop + 6) * S, w * S, (waterTop + 6) * S);

  // River: faceted teal triangles, darker toward the far bank.
  const rows = 9;
  const rowH = (waterBottom - waterTop - 6) / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = waterTop + 6 + r * rowH;
    const base = shade(0x3f8f95, 0.78 + r * 0.035);
    const cell = 34 + r * 6;
    for (let x = -cell; x < w + cell; x += cell) {
      const off = r % 2 ? cell / 2 : 0;
      g.fillStyle(shade(base, random.realInRange(0.94, 1.08)), 1);
      g.fillTriangle((x + off) * S, y0 * S, (x + off + cell) * S, y0 * S, (x + off + cell / 2) * S, (y0 + rowH + 1) * S);
      g.fillStyle(shade(base, random.realInRange(0.9, 1.04)), 1);
      g.fillTriangle((x + off + cell / 2) * S, (y0 + rowH + 1) * S, (x + off + cell) * S, y0 * S, (x + off + cell * 1.5) * S, (y0 + rowH + 1) * S);
    }
  }
  // Glints.
  for (let i = 0; i < 18; i++) {
    const x = random.between(0, w);
    const y = random.between(waterTop + 14, waterBottom - 10);
    g.lineStyle(1.5 * S, 0xd9f2ee, 0.55).lineBetween(x * S, y * S, (x + random.between(8, 22)) * S, y * S);
  }

  // Near bank: grass slope with a dirt patch for the stools.
  const bank: number[] = [0, bankY + 6];
  for (let x = 0; x <= w; x += 40) bank.push(x, bankY + random.between(-6, 6));
  bank.push(w, h, 0, h);
  g.fillStyle(0x6f8f3e, 1).fillPoints(pts(bank), true);
  for (let y = bankY; y < h; y += 34) {
    for (let x = -20; x < w + 20; x += 40) {
      const off = ((y - bankY) / 34) % 2 ? 20 : 0;
      g.fillStyle(shade(0x6f8f3e, random.realInRange(0.86, 1.1) - (y - bankY) / h * 0.3), 1);
      g.fillTriangle((x + off) * S, y * S, (x + off + 40) * S, y * S, (x + off + 20) * S, (y + 36) * S);
      g.fillStyle(shade(0x668636, random.realInRange(0.86, 1.08) - (y - bankY) / h * 0.3), 1);
      g.fillTriangle((x + off + 20) * S, (y + 36) * S, (x + off + 40) * S, y * S, (x + off + 60) * S, (y + 36) * S);
    }
  }
  g.lineStyle(3 * S, INK, 1).strokePoints(pts(bank.slice(0, bank.length - 4)), false);
  // Muddy edge.
  g.fillStyle(0x7a5f3f, 1);
  for (let x = 0; x < w; x += 26) {
    g.fillTriangle(x * S, (bankY + 2) * S, (x + 26) * S, (bankY + 2) * S, (x + 13) * S, (bankY + random.between(9, 15)) * S);
  }
  // Dirt clearing.
  const dirtY = h - 200;
  facet(g, F([w * 0.04, dirtY + 26, w * 0.2, dirtY + 4, w * 0.8, dirtY + 2, w * 0.98, dirtY + 30, w * 0.9, dirtY + 66, w * 0.1, dirtY + 66].map((v) => v * S)), 0x8c6d47, 0, 0.08);
  for (let i = 0; i < 40; i++) {
    const x = random.between(0, w);
    const y = random.between(bankY + 10, h);
    g.fillStyle(0x3d5a26, 0.9).fillTriangle(x * S, y * S, (x + 3) * S, y * S, (x + 1) * S, (y - random.between(5, 10)) * S);
  }

  if (scene.textures.exists(key)) scene.textures.remove(key);
  g.generateTexture(key, w * S, h * S);
  g.destroy();
  return { waterTop, waterBottom, bankY };
}
