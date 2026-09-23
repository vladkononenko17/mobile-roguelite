import type { Entity } from "playcanvas";
import type { EnvironmentKit } from "./EnvironmentKit";
import { chunk, debris, rng } from "./parts";

/**
 * Props: movable-looking objects placed to tell the story of the location (crates, pallets,
 * barricades, debris). Crates, blocks and barricades block the player; pallets and rubble are
 * walk-over.
 */

type Build = (kit: EnvironmentKit, root: Entity) => void;

/** 1 m crate: plank box with edge battens. */
function crate(kit: EnvironmentKit, root: Entity, y = 0): void {
  const s = 1.0;
  const h = s / 2;
  kit.part(root, "planks", [s - 0.06, s - 0.06, s - 0.06], [0, y + h, 0], { bevel: 0.02 });
  const b = 0.1;
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    kit.part(root, "planks", [b, s, b], [x * (h - b / 2), y + h, z * (h - b / 2)], { bevel: 0.015 });
  }
  for (const by of [b / 2, s - b / 2]) {
    for (const z of [-1, 1]) kit.part(root, "planks", [s - 2 * b, b, b], [0, y + by, z * (h - b / 2)], { bevel: 0.015, grain: "x" });
    for (const x of [-1, 1]) kit.part(root, "planks", [b, b, s - 2 * b], [x * (h - b / 2), y + by, 0], { bevel: 0.015, grain: "z" });
  }
}

export const PROPS = {
  /** 1 m crate. */
  crate: (kit, root) => {
    crate(kit, root);
    kit.solid(root, { kind: "box", width: 1, depth: 1 }, 0, 0);
  },
  /** Two crates side by side with a third stacked across them. */
  crateStack: (kit, root) => {
    for (const [x, z, yaw] of [[-0.52, 0.05, 4], [0.53, -0.04, -6]] as const) {
      const e = kit.group(root, x, z, yaw);
      crate(kit, e);
    }
    crate(kit, kit.group(root, 0.05, 0, 28), 1.0);
    kit.solid(root, { kind: "box", width: 2.15, depth: 1.1 }, 0, 0);
  },
  /** 1.2 x 1.0 m pallet. 14 cm tall: walk-over. */
  pallet: (kit, root) => {
    for (const x of [-0.52, 0, 0.52]) kit.part(root, "planks", [0.1, 0.09, 1.0], [x, 0.07, 0], { bevel: 0.012, grain: "z" });
    for (let i = 0; i < 5; i++) kit.part(root, "planks", [1.2, 0.025, 0.14], [0, 0.1275, -0.43 + i * 0.215], { bevel: 0.006, grain: "x" });
    for (const z of [-0.43, 0, 0.43]) kit.part(root, "planks", [1.2, 0.025, 0.14], [0, 0.0125, z], { grain: "x", castShadows: false });
  },
  /** Pallet with a crate left on it. */
  palletCrate: (kit, root) => {
    PROPS.pallet(kit, root);
    crate(kit, kit.group(root, 0.05, 0, 10), 0.14);
    kit.solid(root, { kind: "box", width: 1.2, depth: 1.0 }, 0, 0);
  },
  /** Three pallets stacked, slightly askew. Blocks. */
  palletStack: (kit, root) => {
    for (let i = 0; i < 3; i++) {
      const e = kit.group(root, (i % 2) * 0.05, 0, i * 7 - 6);
      e.setLocalPosition((i % 2) * 0.05, i * 0.14, 0);
      PROPS.pallet(kit, e);
    }
    kit.solid(root, { kind: "box", width: 1.25, depth: 1.05 }, 0, 0);
  },
  /** 0.9 m concrete block. */
  blockSmall: (kit, root) => {
    kit.part(root, "concrete", [0.9, 0.6, 0.9], [0, 0.3, 0], { bevel: 0.06, noBottom: true });
    kit.solid(root, { kind: "box", width: 0.9, depth: 0.9 }, 0, 0);
  },
  /** 2.4 m barricade of boards nailed across two posts. */
  plankBarricade: (kit, root) => {
    for (const x of [-1.0, 1.0]) kit.part(root, "planks", [0.14, 1.6, 0.14], [x, 0.8, 0], { bevel: 0.02, noBottom: true });
    const boards: [number, number][] = [[0.45, -4], [0.85, 3], [1.3, -2]];
    for (const [y, angle] of boards) kit.part(root, "planks", [2.5, 0.2, 0.05], [0, y, 0.1], { bevel: 0.012, grain: "x", rot: [0, 0, angle] });
    kit.part(root, "planks", [2.55, 0.2, 0.05], [0, 0.85, 0.15], { bevel: 0.012, grain: "x", rot: [0, 0, 27] });
    kit.solid(root, { kind: "box", width: 2.6, depth: 0.4 }, 0, 0.05);
  },
  /** Sheet-metal barricade leaning on braces, with a patched plate. */
  metalBarricade: (kit, root) => {
    kit.part(root, "rust", [2.4, 1.2, 0.06], [0, 0.66, 0], { bevel: 0.015, rot: [-12, 0, 0] });
    kit.part(root, "painted", [0.8, 0.55, 0.03], [0.55, 0.78, 0.07], { bevel: 0.01, rot: [-12, 0, 4] });
    for (const x of [-0.9, 0.9]) kit.part(root, "rust", [0.08, 1.25, 0.08], [x, 0.58, -0.32], { bevel: 0.015, rot: [28, 0, 0] });
    kit.part(root, "steel", [2.5, 0.08, 0.5], [0, 0.04, -0.12], { bevel: 0.015 });
    kit.solid(root, { kind: "box", width: 2.5, depth: 0.75 }, 0, -0.12);
  },
  /** Cracked slab tipped up on debris. The slab blocks; the chunks are walk-over. */
  slabBroken: (kit, root) => {
    const random = rng(11);
    kit.part(root, "concrete", [2.2, 0.22, 1.4], [0, 0.28, 0], { bevel: 0.05, rot: [7, 0, -9] });
    kit.part(root, "concrete", [0.9, 0.2, 0.8], [1.45, 0.1, 0.35], { bevel: 0.05, rot: [0, 25, 4] });
    kit.solid(root, { kind: "box", width: 2.2, depth: 1.4 }, 0, 0);
    chunk(kit, root, "concrete", -1.2, -0.6, 0.35, random);
    chunk(kit, root, "concrete", 0.6, 0.95, 0.3, random);
  },
  /** Low rubble pile (~2 m). Walk-over debris. */
  rubble: (kit, root) => debris(kit, root, 0, 0, 0.95, 9, 23, 0.35),
  /** Small scatter of brick and concrete bits (~1.2 m). Walk-over. */
  rubbleSmall: (kit, root) => debris(kit, root, 0, 0, 0.6, 5, 29, 0.5),
} satisfies Record<string, Build>;
