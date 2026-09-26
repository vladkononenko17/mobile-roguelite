import type { EnemyDef, EnemyId } from "../gameplay/config";
import type { GroundSurface } from "../config";
import type { GroundSpec } from "../world/Ground";

/** Music and zone-seal sound per map. */
export const BIOME_AUDIO: Record<string, { music: string; gate: string }> = {
  outpost: { music: "music_wasteland", gate: "gate_wood" },
  facility: { music: "music_station", gate: "gate_space" },
  hell: { music: "music_hell", gate: "gate_hell" },
};
export const BOSS_MUSIC = "music_boss";

/** Footstep sound per ground surface (unknown surfaces: concrete). */
const STEP: Partial<Record<GroundSurface, string>> = {
  sand: "step_sand", dirt: "step_sand", ash: "step_sand", cinder: "step_sand", boneash: "step_sand",
  concrete: "step_concrete", asphalt: "step_concrete", flagstone: "step_concrete",
  basalt: "step_stone", obsidian: "step_stone", bloodrock: "step_stone", asteroid: "step_stone",
  overgrowth: "step_grass",
  deck: "step_metal", hangardeck: "step_metal", stationdeck: "step_metal", labdeck: "step_metal", quarantine: "step_metal",
  grate: "step_metal", gatefloor: "step_metal", dockdeck: "step_metal",
};

const inside = (r: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** The footstep sound for the ground at (x, z): the top pad, else the area, else the base. */
export function footstepAt(ground: GroundSpec, x: number, z: number): string {
  let surface: GroundSurface | undefined;
  for (let i = ground.pads.length - 1; i >= 0 && !surface; i--) if (inside(ground.pads[i], x, z)) surface = ground.pads[i].surface;
  const areas = ground.areas ?? [];
  for (let i = areas.length - 1; i >= 0 && !surface; i--) if (inside(areas[i], x, z)) surface = areas[i].surface ?? ground.base;
  return STEP[surface ?? ground.base] ?? "step_concrete";
}

/** Every footstep sound a map can use (for preloading). */
export function footstepsOf(ground: GroundSpec): Set<string> {
  const surfaces = [ground.base, ...ground.pads.map((p) => p.surface), ...(ground.areas ?? []).map((a) => a.surface ?? ground.base)];
  return new Set(surfaces.map((s) => STEP[s] ?? "step_concrete"));
}

/** Enemy voice: set per type (hounds), else from the look of its death (aliens bleed goo, machines oil, demons burn). */
export type Voice = "zombie" | "demon" | "alien" | "hound" | "mech";
const VOICES: Partial<Record<EnemyId, Voice>> = { hound: "hound", stray: "hound" };

export function voiceOf(id: EnemyId, def: EnemyDef): Voice {
  return VOICES[id] ?? (def.gore === "goo" ? "alien" : def.gore === "oil" ? "mech" : def.deathFx === "ember" ? "demon" : "zombie");
}

/** Sounds every map uses. */
export const COMMON_SOUNDS = ["reload", "hurt", "die", "cash", "heal", "upgrade", "levelup", "ui", "explosion", "slam"];
