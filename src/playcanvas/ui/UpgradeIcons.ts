/**
 * Upgrade icons: simple filled glyphs as SVG path data (24 x 24 box, even-odd fill), so the same
 * shape draws in the DOM HUD (inline SVG) and onto canvas textures for the world pickups (Path2D).
 * No image files; each icon is a few hundred bytes.
 */
export type UpgradeIcon =
  | "shield" | "heart" | "medkit" | "bullet" | "rapid" | "magazine" | "reload" | "boot" | "target" | "pierce" | "star" | "drop";

export type UpgradeCategory = "weapon" | "player" | "special";
export type UpgradeRarity = "common" | "rare" | "epic";

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;

export const ICON_PATHS: Record<UpgradeIcon, string> = {
  shield: "M12 1.8L20.5 5V11C20.5 16.6 16.9 20.8 12 22.3C7.1 20.8 3.5 16.6 3.5 11V5Z M12 5.2L7 7.1V11C7 14.4 9 17.3 12 18.6Z",
  heart: "M12 21.3S2.5 14.9 2.5 8.6C2.5 5.4 5 3.2 7.8 3.2C9.7 3.2 11.2 4.2 12 5.6C12.8 4.2 14.3 3.2 16.2 3.2C19 3.2 21.5 5.4 21.5 8.6C21.5 14.9 12 21.3 12 21.3Z",
  medkit: "M8.8 2.5H15.2V8.8H21.5V15.2H15.2V21.5H8.8V15.2H2.5V8.8H8.8Z",
  bullet: "M12 1.5C14.6 3.4 15.5 6.3 15.5 9.3V10H8.5V9.3C8.5 6.3 9.4 3.4 12 1.5Z M8.5 11.5H15.5V19.5H8.5Z M7.5 20.5H16.5V22.5H7.5Z",
  rapid: "M13.8 1.5L4.5 13.5H10.8L9.2 22.5L19.5 9.8H13.2Z",
  magazine: "M7.5 1.5H15.5V5.5H16.3L18 20.8C18.1 21.7 17.5 22.5 16.6 22.5H10.4C9.7 22.5 9.1 22 9 21.3L7.5 5.5Z M10.6 8.8H15V10.4H10.8Z M11 12.8H15.5V14.4H11.2Z M11.4 16.8H15.9V18.4H11.6Z",
  reload: "M12 3.5A8.5 8.5 0 1 0 20.5 12H17.6A5.6 5.6 0 1 1 12 6.4V9.4L17 5L12 0.6Z",
  boot: "M5.5 1.8H13V11.2L18.6 13.6C20.4 14.4 21.5 15.8 21.5 17.8V19.5H3.5V2.8Z M3 20.8H22V22.8H3Z",
  target: `${circle(12, 12, 9.5)} ${circle(12, 12, 7.2)} ${circle(12, 12, 4.4)} ${circle(12, 12, 2.1)} M11 0H13V2.6H11Z M11 21.4H13V24H11Z M0 11H2.6V13H0Z M21.4 11H24V13H21.4Z`,
  pierce: "M1.5 10.6H15V6.5L22.5 12L15 17.5V13.4H1.5Z",
  star: "M12 1.5L15 8.2L22.2 8.9L16.8 13.7L18.4 20.8L12 17.1L5.6 20.8L7.2 13.7L1.8 8.9L9 8.2Z",
  drop: "M12 1.8S4.5 10.3 4.5 15C4.5 19.2 7.9 22.4 12 22.4S19.5 19.2 19.5 15C19.5 10.3 12 1.8 12 1.8Z",
};

/** Accent colour per category (HUD disc, world badge, glow). */
export const CATEGORY_COLORS: Record<UpgradeCategory, string> = {
  weapon: "#ffb13b",
  player: "#4fb8ff",
  special: "#b56cff",
};

/** Inline SVG markup for the HUD. */
export function iconSvg(icon: UpgradeIcon): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${ICON_PATHS[icon]}"/></svg>`;
}

/**
 * A round badge (category-coloured disc, light rim, white glyph) on a transparent canvas, for the
 * glowing world pickup. `size` is the canvas edge in pixels.
 */
export function badgeCanvas(icon: UpgradeIcon, category: UpgradeCategory, size = 128): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2, r = size * 0.44;
  const color = CATEGORY_COLORS[category];
  const fill = ctx.createRadialGradient(c, c * 0.8, r * 0.1, c, c, r);
  fill.addColorStop(0, "#ffffff");
  fill.addColorStop(0.35, color);
  fill.addColorStop(1, shade(color, 0.45));
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = size * 0.05;
  ctx.strokeStyle = "rgba(255, 250, 235, 0.95)";
  ctx.stroke();
  // The glyph, white with a dark outline so it reads on the coloured disc.
  const glyph = size * 0.52;
  ctx.save();
  ctx.translate(c - glyph / 2, c - glyph / 2);
  ctx.scale(glyph / 24, glyph / 24);
  const path = new Path2D(ICON_PATHS[icon]);
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(20, 12, 6, 0.75)";
  ctx.stroke(path);
  ctx.fillStyle = "#ffffff";
  ctx.fill(path, "evenodd");
  ctx.restore();
  return canvas;
}

/** `hex` darkened to `factor` of its brightness. */
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * factor);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
