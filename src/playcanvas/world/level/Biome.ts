import type { Entity } from "playcanvas";
import type { LightingSpec } from "../../config";
import type { AmbientEmitter } from "../AmbientFx";
import type { GroundSpec } from "../Ground";
import type { LavaSpec } from "../Lava";
import type { KitModelDef, ModelKit } from "../props/ModelKit";

export interface LevelBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A standing spot: position on the ground and facing (yaw 180 = up the screen, towards -Z). */
export interface Placement2D {
  x: number;
  z: number;
  yawDeg: number;
}

/**
 * One playable map: its environment kit, lighting, ground, layout and ambience. Everything the
 * run needs from a map (bounds, start position) comes from here; waves, enemies and upgrades are
 * map-independent (the NavField and spawning are built from the collision world and bounds).
 */
export interface Biome<Id extends string = string> {
  id: string;
  /** Shown in the map picker and the wave banner's chapter line. */
  label: string;
  kit: {
    url: string;
    models: Record<Id, KitModelDef>;
    brightness: number;
    glowIntensity?: number;
    batchCellMetres: number;
  };
  lighting: LightingSpec;
  ground: GroundSpec;
  bounds: LevelBounds;
  /** Where the hero stands while the game loads (and in the ?sandbox=1 movement sandbox). */
  spawn: Placement2D;
  /** Where every wave starts: an open area with room to move in every direction. */
  runStart: Placement2D;
  ambient: AmbientEmitter[];
  /** Lava surfaces (hell): self-lit, flowing; pools may block walking. */
  lava?: LavaSpec;
  /** Places every model; each declares its collider, so the returned root feeds CollisionWorld. */
  build(kit: ModelKit<Id>): Entity;
}
