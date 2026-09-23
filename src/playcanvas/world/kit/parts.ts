import { Entity } from "playcanvas";
import type { EnvironmentKit } from "./EnvironmentKit";

/**
 * Shared building blocks for modules and props. Everything here builds under a parent entity in
 * its local space (metres, y = 0 on the ground) and declares its own solid footprint where the
 * player must be blocked.
 */

export const WALL_THICKNESS = 0.36;
export const CAP_HEIGHT = 0.12;

/** Deterministic pseudo-random numbers so "random" debris looks the same on every load. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Brick wall body along X, centred at (cx, cz), with a concrete cap and a box collider. */
export function brickWall(kit: EnvironmentKit, root: Entity, length: number, height: number, cx = 0, cz = 0, thickness = WALL_THICKNESS): void {
  const bodyHeight = height - CAP_HEIGHT;
  kit.part(root, "brick", [length, bodyHeight, thickness], [cx, bodyHeight / 2, cz], { bevel: 0.03, noBottom: true });
  kit.part(root, "concrete", [length + 0.06, CAP_HEIGHT, thickness + 0.1], [cx, height - CAP_HEIGHT / 2, cz], { bevel: 0.035 });
  kit.solid(root, { kind: "box", width: length + 0.06, depth: thickness + 0.1 }, cx, cz);
}

/** Square concrete post with a small cap, used at wall corners, ends and gates. */
export function post(kit: EnvironmentKit, root: Entity, x: number, z: number, height: number, width = 0.52): void {
  kit.part(root, "concrete", [width, height, width], [x, height / 2, z], { bevel: 0.04, noBottom: true });
  kit.part(root, "concrete", [width + 0.1, 0.12, width + 0.1], [x, height + 0.06, z], { bevel: 0.035 });
  kit.solid(root, { kind: "box", width: width + 0.1, depth: width + 0.1 }, x, z);
}

/** A loose chunk of broken material lying at a random angle (walk-over: no collider). */
export function chunk(kit: EnvironmentKit, root: Entity, material: "concrete" | "brick", x: number, z: number, size: number, random: () => number): void {
  const w = size * (0.8 + random() * 0.5);
  const h = size * (0.45 + random() * 0.35);
  const d = size * (0.7 + random() * 0.5);
  kit.part(root, material, [w, h, d], [x, h * 0.4, z], {
    bevel: Math.min(w, h, d) * 0.18,
    rot: [(random() - 0.5) * 30, random() * 180, (random() - 0.5) * 30],
  });
}

/** Scatter of `count` chunks within a radius around (x, z). */
export function debris(kit: EnvironmentKit, root: Entity, x: number, z: number, radius: number, count: number, seed: number, brickShare = 0.35): void {
  const random = rng(seed);
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * radius;
    chunk(kit, root, random() < brickShare ? "brick" : "concrete", x + Math.cos(angle) * r, z + Math.sin(angle) * r, 0.2 + random() * 0.3, random);
  }
}

/** Rusty bar fence of any length along X, centred on the origin: posts every <= 3 m. */
export function fenceSection(kit: EnvironmentKit, root: Entity, length: number): void {
  const half = length / 2;
  const bays = Math.max(1, Math.round(length / 3));
  for (let i = 0; i <= bays; i++) kit.part(root, "rust", [0.12, 2.0, 0.12], [-half + (i * length) / bays, 1.0, 0], { bevel: 0.02, noBottom: true });
  for (const y of [0.25, 1.85]) kit.part(root, "rust", [length, 0.08, 0.08], [0, y, 0], { bevel: 0.012 });
  const bars = Math.round(length / 0.25);
  for (let i = 1; i < bars; i++) {
    const x = -half + (i * length) / bars;
    if (Math.abs(((x + half) / length) * bays - Math.round(((x + half) / length) * bays)) < 0.02) continue;
    kit.part(root, "rust", [0.04, 1.75, 0.04], [x, 1.05, 0]);
  }
  kit.solid(root, { kind: "box", width: length + 0.12, depth: 0.14 }, 0, 0);
}

/**
 * Gate leaf (frame, bars, diagonal brace and kick plate) of width `leaf`, centred at local x
 * `cx`, with its collider.
 */
export function gateLeaf(kit: EnvironmentKit, root: Entity, leaf: number, cx = 0): void {
  for (const y of [0.2, 1.95]) kit.part(root, "rust", [leaf, 0.1, 0.08], [cx, y, 0], { bevel: 0.015 });
  for (const x of [-leaf / 2 + 0.05, leaf / 2 - 0.05]) kit.part(root, "rust", [0.1, 1.85, 0.08], [cx + x, 1.075, 0], { bevel: 0.015 });
  for (let i = 1; i < 8; i++) kit.part(root, "rust", [0.035, 1.65, 0.035], [cx - leaf / 2 + i * (leaf / 8), 1.075, 0]);
  const brace = Math.hypot(leaf - 0.2, 1.65);
  kit.part(root, "rust", [brace, 0.08, 0.06], [cx, 1.075, 0.02], { bevel: 0.012, rot: [0, 0, (Math.atan2(1.65, leaf - 0.2) * 180) / Math.PI] });
  kit.part(root, "painted", [leaf - 0.2, 0.55, 0.03], [cx, 0.55, -0.03], { bevel: 0.01 });
  kit.solid(root, { kind: "box", width: leaf, depth: 0.14 }, cx, 0);
}

/** Child entity at (x, z) turned by yawDeg, for building a rotated sub-assembly. */
export function holder(root: Entity, name: string, x: number, z: number, yawDeg: number): Entity {
  const e = new Entity(name);
  e.setLocalPosition(x, 0, z);
  e.setLocalEulerAngles(0, yawDeg, 0);
  root.addChild(e);
  return e;
}
