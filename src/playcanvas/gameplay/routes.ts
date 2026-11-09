import type { UpgradeIcon } from "../ui/UpgradeIcons";

/**
 * Route choice between levels (Hades' doors, Slay the Spire's map): before a regular level the player
 * picks one of a few paths, each changing that level (its foes, its pay) or the next shop.
 */
export type RouteId = "champions" | "cache" | "hospital" | "cursed" | "market" | "training";

export interface RouteDef {
  id: RouteId;
  name: string;
  text: string;
  icon: UpgradeIcon;
  kind: "player" | "special" | "weapon";
  /** Applied to the level this route leads to (1 = unchanged). */
  cash?: number;
  xp?: number;
  enemyHp?: number;
  enemyDamage?: number;
  density?: number;
  /** Champion interval multiplier and chest size bonus. */
  eliteEvery?: number;
  chestBonus?: number;
  /** Heals this fraction of max HP before the level. */
  heal?: number;
  /** The next shop: discount and an extra offer. */
  shopDiscount?: number;
  extraOffer?: boolean;
}

export const ROUTES: RouteDef[] = [
  { id: "champions", name: "Champion's Hall", text: "Champions come twice as often · their chests are one size bigger", icon: "chest", kind: "special", eliteEvery: 0.45, chestBonus: 1 },
  { id: "cache", name: "Supply Cache", text: "+60% cash from kills on this level", icon: "magnet", kind: "player", cash: 1.6 },
  { id: "hospital", name: "Field Hospital", text: "Heal 40% now · 10% fewer enemies", icon: "medkit", kind: "player", heal: 0.4, density: 0.9 },
  { id: "cursed", name: "Cursed Ground", text: "Enemies +30% HP and damage · double XP · +50% cash", icon: "flame", kind: "special", enemyHp: 1.3, enemyDamage: 1.3, xp: 2, cash: 1.5 },
  { id: "market", name: "Black Market", text: "The next shop is 25% off with one extra offer", icon: "star", kind: "weapon", shopDiscount: 0.25, extraOffer: true },
  { id: "training", name: "Training Grounds", text: "+60% XP on this level", icon: "target", kind: "player", xp: 1.6 },
];

export const routeDef = (id: RouteId): RouteDef => ROUTES.find((r) => r.id === id)!;

/** `count` different routes, random (`rand` returns 0..1). */
export function rollRoutes(count: number, rand: () => number = Math.random): RouteDef[] {
  const pool = [...ROUTES];
  const out: RouteDef[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}
