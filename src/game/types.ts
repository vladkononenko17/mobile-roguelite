export type RunMode = "menu" | "playing" | "paused" | "upgrading" | "won" | "lost";

export type EnemyKind = "raider" | "spitter" | "brute" | "boss";

export type UpgradeId = "damage" | "firerate" | "magazine" | "crit" | "speed" | "pierce";

export interface HudState {
  hp: number;
  maxHp: number;
  ammo: number;
  magazine: number;
  reloading: boolean;
  reloadProgress: number;
  remaining: number;
  kills: number;
  level: number;
  xp: number;
  xpToNext: number;
  bossRatio: number | null;
  bossDefeated: boolean;
}

export interface ResultState {
  won: boolean;
  elapsed: number;
  kills: number;
  level: number;
}

export interface UpgradeChoice {
  id: UpgradeId;
  icon: string;
  title: string;
  description: string;
  level: number;
}

export interface EnemyConfig {
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  radius: number;
  texture: string;
  ranged?: boolean;
}
