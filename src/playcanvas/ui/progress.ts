/** Per-campaign progress kept in this browser (shown on the main menu). */
export interface Progress {
  /** Furthest level reached (1-based; 0: never played). */
  best: number;
  /** Difficulty label of a finished run (null: not finished yet). */
  cleared: string | null;
}

const key = (campaign: string, field: string) => `${campaign}.${field}`;

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function write(k: string, value: string): void {
  try {
    localStorage.setItem(k, value);
  } catch {
    /* storage unavailable */
  }
}

export function loadProgress(campaign: string): Progress {
  return { best: Number(read(key(campaign, "best"))) || 0, cleared: read(key(campaign, "cleared")) };
}

/** Level `level` (1-based) of `campaign` was reached. */
export function reachedLevel(campaign: string, level: number): void {
  if (level > loadProgress(campaign).best) write(key(campaign, "best"), String(level));
}

/** The campaign was finished on `difficulty` (the latest finish is shown). */
export function clearedCampaign(campaign: string, difficulty: string): void {
  write(key(campaign, "cleared"), difficulty);
}

/** The page without its query: the main menu. */
export function menuUrl(): string {
  return `${location.pathname}`;
}
