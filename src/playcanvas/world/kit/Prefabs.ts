import { MODULES } from "./Modules";
import { PROPS } from "./Props";

/**
 * Prefab registry used by `EnvironmentKit.spawn(name, x, z, yaw)`:
 * - MODULES (Modules.ts): walls, concrete and metal structures, buildings;
 * - PROPS (Props.ts): crates, pallets, barricades, debris.
 * Shared geometry helpers live in parts.ts; colliders are declared inside each recipe.
 */
export const PREFABS = { ...MODULES, ...PROPS };

export type PrefabName = keyof typeof PREFABS;
