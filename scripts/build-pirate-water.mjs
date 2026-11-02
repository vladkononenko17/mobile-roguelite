// Paints the Black Tide's sea texture (public/models/pirate/water.webp): a seamless 512 px tile of
// stylised low-poly water - a deep teal base, lighter swells and thin foam crests - drawn as the
// emissive map of the self-lit sea (world/Lava.ts with the pirate chapter's spec).
//   node scripts/build-pirate-water.mjs   (needs sharp: npm i --no-save sharp)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const N = 512;
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const wrap = (draw) => [-N, 0, N].flatMap((ox) => [-N, 0, N].map((oy) => draw(ox, oy))).join("");
let shapes = "";
// Soft swells: large light and dark ellipses.
for (let i = 0; i < 22; i++) {
  const x = rnd() * N, y = rnd() * N, rx = 50 + rnd() * 90, ry = 18 + rnd() * 30, light = rnd() < 0.5;
  const c = light ? "#5fd3cf" : "#16788a", o = (0.25 + rnd() * 0.3).toFixed(2);
  shapes += wrap((ox, oy) => `<ellipse cx="${x + ox}" cy="${y + oy}" rx="${rx}" ry="${ry}" fill="${c}" opacity="${o}" filter="url(#b)"/>`);
}
// Foam crests: short curved strokes.
for (let i = 0; i < 46; i++) {
  const x = rnd() * N, y = rnd() * N, w = 14 + rnd() * 34, h = 3 + rnd() * 5, o = (0.35 + rnd() * 0.45).toFixed(2);
  shapes += wrap((ox, oy) => `<path d="M${x + ox} ${y + oy} q${w / 2} ${-h} ${w} 0" stroke="#d8f1ee" stroke-width="${(1.5 + rnd() * 2).toFixed(1)}" fill="none" stroke-linecap="round" opacity="${o}"/>`);
}
// Glints.
for (let i = 0; i < 70; i++) {
  const x = rnd() * N, y = rnd() * N, r = 1 + rnd() * 1.6;
  shapes += wrap((ox, oy) => `<circle cx="${x + ox}" cy="${y + oy}" r="${r}" fill="#bfe9e4" opacity="0.5"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter></defs>
<rect width="${N}" height="${N}" fill="#1f9aa5"/>${shapes}</svg>`;
const out = path.join(ROOT, "public/models/pirate/water.webp");
fs.mkdirSync(path.dirname(out), { recursive: true });
await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(out);
console.log(`wrote ${out} ${(fs.statSync(out).size / 1e3).toFixed(0)} KB`);
