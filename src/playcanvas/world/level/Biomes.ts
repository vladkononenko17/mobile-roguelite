import type { Biome } from "./Biome";
import { FACILITY_BIOME } from "./FacilityLevel";
import { OUTPOST_BIOME } from "./OutpostLevel";

/** Every playable map, in chapter order. */
export const BIOMES = {
  outpost: OUTPOST_BIOME as Biome,
  facility: FACILITY_BIOME as Biome,
};

export type BiomeId = keyof typeof BIOMES;

export const isBiomeId = (value: string | null): value is BiomeId => value !== null && value in BIOMES;

/** Short names accepted in the URL besides the ids. */
const ALIASES: Record<string, BiomeId> = { space: "facility", orion: "facility", desert: "outpost" };

/**
 * The map comes from the URL only, so each map has its own link and the plain link is always
 * chapter 1: ?level=space (or ?biome=facility) opens the ORION facility; space.html redirects there.
 */
export function pickBiome(): BiomeId {
  const params = new URLSearchParams(location.search);
  const value = (params.get("level") ?? params.get("biome") ?? "").toLowerCase();
  if (isBiomeId(value)) return value;
  return ALIASES[value] ?? "outpost";
}

/** Reloads with the chosen map (one kit in GPU memory at a time). */
export function switchBiome(id: BiomeId): void {
  const url = new URL(location.href);
  url.searchParams.delete("biome");
  if (id === "outpost") url.searchParams.delete("level");
  else url.searchParams.set("level", id === "facility" ? "space" : id);
  location.replace(url);
}
