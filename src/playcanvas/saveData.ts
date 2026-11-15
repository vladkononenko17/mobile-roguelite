/**
 * The whole save as one code, to move progress between browsers: the Home Screen app keeps its own
 * storage, separate from the browser's, so a player who installs the game copies a code out of the
 * browser and pastes it into the app. The code is the game's localStorage entries as JSON, base64
 * with a version prefix.
 */
const PREFIX = "DL1.";
/** Profile (heroes, quests, tallies), Dust and upgrades, settings, the last chapter, the mute switch. */
const FIXED = ["dustline.profile", "dustline.meta", "dustline.settings", "dustline3d.chapter", "roguelite.sound"];
/** Per chapter: furthest level, the finished difficulty, the chosen difficulty. */
const PER_CHAPTER = ["best", "cleared", "difficulty"];

type Store = Pick<Storage, "getItem" | "setItem">;

function keys(chapters: readonly string[]): string[] {
  return [...FIXED, ...chapters.flatMap((c) => PER_CHAPTER.map((f) => `${c}.${f}`))];
}

const toBase64 = (text: string): string => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const fromBase64 = (code: string): string => new TextDecoder().decode(Uint8Array.from(atob(code), (c) => c.charCodeAt(0)));

/** The save of this browser as a code (`chapters`: the chapter ids). */
export function exportSave(chapters: readonly string[], store: Store = localStorage): string {
  const data: Record<string, string> = {};
  for (const k of keys(chapters)) {
    const v = store.getItem(k);
    if (v !== null) data[k] = v;
  }
  return PREFIX + toBase64(JSON.stringify(data));
}

/**
 * Writes a save code into this browser (replacing the entries it carries). False when the text is
 * not a save code; only known keys with string values are taken.
 */
export function importSave(code: string, chapters: readonly string[], store: Store = localStorage): boolean {
  const text = code.replace(/\s+/g, "");
  if (!text.startsWith(PREFIX)) return false;
  let data: unknown;
  try {
    data = JSON.parse(fromBase64(text.slice(PREFIX.length)));
  } catch {
    return false;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const allowed = new Set(keys(chapters));
  const entries = Object.entries(data as Record<string, unknown>).filter(([k, v]) => allowed.has(k) && typeof v === "string") as [string, string][];
  // The profile must be there and be JSON: an empty or foreign code changes nothing.
  const profile = entries.find(([k]) => k === "dustline.profile");
  if (!profile) return false;
  try {
    if (typeof JSON.parse(profile[1]) !== "object") return false;
  } catch {
    return false;
  }
  for (const [k, v] of entries) store.setItem(k, v);
  return true;
}
