import type { CampaignStage, EnemyConfig, EnemyKind, UpgradeId } from "./types";

export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;
export const RUN_LENGTH_SECONDS = 90;

// Short, readable contracts work better on a phone than one long survival timer.
// The last sector keeps the boss finale, while the first two let the player build a run.
export const CAMPAIGN_STAGES: CampaignStage[] = [
  { name: "RUST GATE", duration: 34, targetKills: 17 },
  { name: "TANKER YARD", duration: 42, targetKills: 27 },
  { name: "FOREMAN'S PIT", duration: 54, targetKills: 38, bossAt: 28 },
];

function upgradeArt(symbol: string, accent: string, detail: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="8" fill="#1b171b"/><path d="M7 73 74 15l15 8-65 66Z" fill="${accent}" stroke="#0e0d10" stroke-width="5"/><path d="M15 26h67M16 82h54" stroke="#e7ddc6" stroke-width="4" opacity=".86"/><circle cx="28" cy="66" r="12" fill="#e7ddc6" stroke="#0e0d10" stroke-width="4"/><text x="48" y="54" text-anchor="middle" font-family="Arial Black,Arial" font-size="22" fill="#0e0d10">${symbol}</text><text x="48" y="91" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#e7ddc6">${detail}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const ENEMIES: Record<EnemyKind, EnemyConfig> = {
  raider: {
    hp: 42,
    speed: 125,
    damage: 13,
    xp: 3,
    radius: 17,
    texture: "enemy-raider-v2",
    visualScale: 0.48,
  },
  spitter: {
    hp: 30,
    speed: 95,
    damage: 10,
    xp: 4,
    radius: 16,
    texture: "enemy-spitter-v2",
    visualScale: 0.48,
    ranged: true,
  },
  brute: {
    hp: 170,
    speed: 78,
    damage: 24,
    xp: 12,
    radius: 27,
    texture: "enemy-brute-v2",
    visualScale: 0.52,
  },
  boss: {
    hp: 820,
    speed: 65,
    damage: 31,
    xp: 45,
    radius: 43,
    texture: "enemy-boss-v2",
    visualScale: 0.52,
    ranged: true,
  },
};

export const UPGRADE_COPY: Record<UpgradeId, Omit<import("./types").UpgradeChoice, "id" | "level">> = {
  damage: {
    icon: "DMG",
    title: "HOLLOW-POINT HATE",
    description: "+25% rifle damage",
    art: upgradeArt("+", "#e8602f", "HOLLOW POINT"),
  },
  firerate: {
    icon: "RPM",
    title: "ITCHY TRIGGER",
    description: "+16% fire rate",
    art: upgradeArt("»", "#f2b632", "RAPID CYCLE"),
  },
  magazine: {
    icon: "MAG",
    title: "DEEP POCKETS",
    description: "+4 rounds and instant reload",
    art: upgradeArt("12", "#54b7c6", "EXTENDED MAG"),
  },
  crit: {
    icon: "CRT",
    title: "LUCKY CHAMBER",
    description: "+8% critical chance",
    art: upgradeArt("!", "#b8d84a", "CRIT ROUND"),
  },
  speed: {
    icon: "SPD",
    title: "DUST BOOTS",
    description: "+12% movement speed",
    art: upgradeArt("»", "#54b7c6", "QUICK STEP"),
  },
  pierce: {
    icon: "PEN",
    title: "NASTY EXIT",
    description: "Bullets pierce +1 target",
    art: upgradeArt("//", "#d63732", "PENETRATOR"),
  },
};
