// Registries shared by the campaigns (Hell, the ORION): boss scripts and per-type skins.
import type { EnemyId, EnemySkinId } from "./config";
import { HELL_BOSSES, HELL_TYPE_SKINS, type BossPhase } from "./hellConfig";
import { SPACE_BOSSES, SPACE_TYPE_SKINS } from "./spaceConfig";

/** Boss scripts by name (EnemyDef.script). */
export const BOSS_SCRIPTS: Record<string, BossPhase[]> = { ...HELL_BOSSES, ...SPACE_BOSSES };

/** Skins per enemy type, overriding the look's own list. */
export const TYPE_SKINS: Partial<Record<EnemyId, EnemySkinId[]>> = { ...HELL_TYPE_SKINS, ...SPACE_TYPE_SKINS };
