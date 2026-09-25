import type { Entity } from "playcanvas";
import type { LightingSpec, WeaponId } from "../../config";
import type { WaveDef } from "../../gameplay/config";
import type { AmbientEmitter } from "../AmbientFx";
import type { GroundSpec } from "../Ground";
import type { LavaSpec } from "../Lava";
import type { KitModelDef, ModelKit } from "../props/ModelKit";
import type { Lava } from "../Lava";

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
  /** A campaign of its own (else the shared WAVES): levels fought in named zones of the map. */
  campaign?: Campaign;
}

/** A zone of a large map: where a level is fought (the player, nav and spawns stay inside). */
export interface Zone {
  region: LevelBounds;
  start: Placement2D;
}

export interface Campaign {
  levels: WaveDef[];
  zones: Record<string, Zone>;
  /** How a run starts (a veteran's weapon, cash, upgrade picks) and its special beats. */
  run?: { startWeapon: WeaponId; startCash: number; startPicks: number; pactAfter: number; finalLevel: number; armory?: { after: number; weapons: readonly WeaponId[] } };
  /** Title and line shown when the whole campaign is won. */
  victory: { title: string; text: string };
  /** A level starts in `zone` (seal the way on, light the arena...). */
  onLevel?(index: number, zone: string): void;
  /** Boss phase / arena intensity 0..1 (lava brightness, runes). */
  arena?(intensity: number): void;
  /** Per frame (animated world pieces). */
  update?(dt: number): void;
  /** Hands the world's lava to the campaign (boss-phase brightness). */
  attach?(lava: Lava): void;
}
