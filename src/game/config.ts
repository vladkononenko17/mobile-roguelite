import type { EnemyConfig, EnemyKind, UpgradeId } from "./types";

export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;
export const RUN_LENGTH_SECONDS = 90;

export const ENEMIES: Record<EnemyKind, EnemyConfig> = {
  raider: {
    hp: 42,
    speed: 125,
    damage: 13,
    xp: 3,
    radius: 17,
    texture: "raider",
  },
  spitter: {
    hp: 30,
    speed: 95,
    damage: 10,
    xp: 4,
    radius: 16,
    texture: "spitter",
    ranged: true,
  },
  brute: {
    hp: 170,
    speed: 78,
    damage: 24,
    xp: 12,
    radius: 27,
    texture: "brute",
  },
  boss: {
    hp: 820,
    speed: 65,
    damage: 31,
    xp: 45,
    radius: 43,
    texture: "boss",
    ranged: true,
  },
};

export const UPGRADE_COPY: Record<UpgradeId, Omit<import("./types").UpgradeChoice, "id" | "level">> = {
  damage: {
    icon: "DMG",
    title: "HOLLOW-POINT HATE",
    description: "+25% rifle damage",
  },
  firerate: {
    icon: "RPM",
    title: "ITCHY TRIGGER",
    description: "+16% fire rate",
  },
  magazine: {
    icon: "MAG",
    title: "DEEP POCKETS",
    description: "+4 rounds and instant reload",
  },
  crit: {
    icon: "CRT",
    title: "LUCKY CHAMBER",
    description: "+8% critical chance",
  },
  speed: {
    icon: "SPD",
    title: "DUST BOOTS",
    description: "+12% movement speed",
  },
  pierce: {
    icon: "PEN",
    title: "NASTY EXIT",
    description: "Bullets pierce +1 target",
  },
};
