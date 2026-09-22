export type RunMode = "menu" | "playing" | "paused" | "upgrading" | "won" | "lost";

export type EnemyKind = "raider" | "spitter" | "brute" | "boss";

export type UpgradeId = "damage" | "firerate" | "magazine" | "crit" | "speed" | "pierce";

export type PerformanceRank = "S" | "A" | "B" | "C";

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
  stage: number;
  stageName: string;
  stageTargetKills: number;
}

export interface ResultState {
  won: boolean;
  elapsed: number;
  kills: number;
  level: number;
  stagesCleared: number;
}

export interface UpgradeChoice {
  id: UpgradeId;
  icon: string;
  title: string;
  description: string;
  level: number;
  art: string;
}

export interface StageResult {
  stage: number;
  name: string;
  kills: number;
  targetKills: number;
  hpPercent: number;
  rank: PerformanceRank;
  recovery: number;
  choices: number;
}

export interface CampaignStage {
  name: string;
  duration: number;
  targetKills: number;
  bossAt?: number;
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
