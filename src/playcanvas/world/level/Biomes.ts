import type { Biome } from "./Biome";
import { FACILITY_BIOME } from "./FacilityLevel";
import { OUTPOST_BIOME } from "./OutpostLevel";

/** Every playable map, in chapter order. */
export const BIOMES = {
  outpost: OUTPOST_BIOME as Biome,
  facility: FACILITY_BIOME as Biome,
};

export type BiomeId = keyof typeof BIOMES;

const KEY = "dustline3d.biome";
export const isBiomeId = (value: string | null): value is BiomeId => value !== null && value in BIOMES;

/** ?biome=<id> wins, then the last map picked in this browser, then chapter 1. */
export function pickBiome(): BiomeId {
  const fromUrl = new URLSearchParams(location.search).get("biome");
  if (isBiomeId(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(KEY);
    if (isBiomeId(saved)) return saved;
  } catch { /* storage unavailable */ }
  return "outpost";
}

/** Remembers the map and reloads with it (one kit in GPU memory at a time). */
export function switchBiome(id: BiomeId): void {
  try { localStorage.setItem(KEY, id); } catch { /* storage unavailable */ }
  const url = new URL(location.href);
  url.searchParams.set("biome", id);
  location.replace(url);
}
