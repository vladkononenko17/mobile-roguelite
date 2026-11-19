/**
 * The end-of-run card: a 1080×1350 picture of how the mind went through the
 * seasons, and a short text with a block sparkline that pastes anywhere.
 * Made to be posted: it is the game's ad.
 */
import { ENDINGS, SEASONS, TRAITS, seasonName, type EndingId, type FriendState, type TraitId } from "./content.ts";
import { num, tr } from "./i18n.ts";

export interface RunResult {
  ending: EndingId;
  trait: TraitId;
  history: number[];
  daysInside: number;
  alerts: number;
  knocks: number;
  friends: Array<{ name: string; state: FriendState; color: number }>;
  /** YYYYMMDD of a daily run. */
  daily: number;
}

const SPARK = "▁▂▃▄▅▆▇█";

export const FRIEND_MARK: Record<FriendState, string> = {
  free: "🟢", home: "🟢", hiding: "🏠", abroad: "✈️", volunteered: "🪖", front: "🪖", taken: "🚐", wounded: "🩹", dead: "🕯️",
};

export function stateWord(s: FriendState): string {
  const uk: Record<FriendState, string> = { free: "ТУТ", home: "ВДОМА", hiding: "ХОВАЄТЬСЯ", abroad: "ВИЇХАВ", volunteered: "ПІШОВ САМ", front: "ФРОНТ", taken: "ЗАБРАЛИ", wounded: "ПОРАНЕНИЙ", dead: "ЗАГИНУВ" };
  const en: Record<FriendState, string> = { free: "HERE", home: "HOME", hiding: "HIDING", abroad: "LEFT", volunteered: "ENLISTED", front: "FRONT", taken: "TAKEN", wounded: "WOUNDED", dead: "KILLED" };
  return tr(uk, en)[s];
}

const dateText = (d: number) => `${String(d % 100).padStart(2, "0")}.${String(Math.floor(d / 100) % 100).padStart(2, "0")}.${Math.floor(d / 10000)}`;

/** Green for making it, teal for the river, blue for going yourself, red for the rest. */
export function endingColor(e: EndingId): string {
  return e === "survived" || e === "together" ? "#3a6a4a" : e === "tisza" ? "#3a7a8a" : e === "enlist" ? "#3a5a8a" : "#c83a32";
}

export function gameUrl(daily: boolean): string {
  const base = `${location.origin}${location.pathname}`;
  return daily ? `${base}?daily` : base;
}

/** The text that goes with the card (and alone where pictures can't go). */
export function shareText(r: RunResult): string {
  const e = ENDINGS[r.ending];
  const lived = r.history.length;
  const spark = r.history.map((v) => SPARK[Math.max(0, Math.min(7, Math.floor((v / 100) * 8)))]).join("") + (r.ending === "survived" || r.ending === "together" ? "" : "✖");
  const head = r.daily ? `${tr("Чотири стіни · щоденний", "Four Walls · daily")} ${dateText(r.daily)}` : tr("Чотири стіни", "Four Walls");
  return [
    head,
    `${e.title} · ${lived}/${SEASONS} ${tr("сезонів", "seasons")} · ${num(r.daysInside)} ${tr("днів без вулиці", "days inside")}`,
    `🧠 ${spark}`,
    `👥 ${r.friends.map((f) => FRIEND_MARK[f.state]).join("")}`,
    gameUrl(!!r.daily),
  ].join("\n");
}

async function fontsReady(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('700 40px "Oswald"', "ЧОТИРИ СТІНИ FOUR WALLS 0123"),
      document.fonts.load('500 20px "Inter"', "днів days"),
      document.fonts.load('700 20px "Inter"', "днів days"),
    ]);
  } catch { /* draw with what we have */ }
}

/** Draws the card. Returns a PNG blob. */
export async function renderCard(r: RunResult): Promise<Blob> {
  await fontsReady();
  const W = 1080;
  const H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  const DISPLAY = '"Oswald", "Arial Narrow", sans-serif';
  const BODY = '"Inter", system-ui, sans-serif';
  const e = ENDINGS[r.ending];
  const survived = r.ending === "survived" || r.ending === "together";

  // the room: dark, with four walls drawn closing in
  g.fillStyle = "#131217";
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) {
    const m = 36 + i * 30;
    g.strokeStyle = `rgba(232,196,90,${0.05 + i * 0.012})`;
    g.lineWidth = 2;
    g.strokeRect(m, m, W - m * 2, H - m * 2);
  }
  // grain
  const img = g.getImageData(0, 0, W, H);
  let seed = 1234567;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const n = ((seed >> 16) & 31) - 16;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  const X = 120;
  let y = 190;
  g.textBaseline = "alphabetic";
  g.fillStyle = "#e8c45a";
  g.font = `700 34px ${DISPLAY}`;
  g.fillText(`${tr("ЧОТИРИ СТІНИ", "FOUR WALLS")} · 2023–2026`, X, y);
  if (r.daily) {
    const label = `${tr("ЩОДЕННИЙ", "DAILY")} ${dateText(r.daily)}`;
    g.font = `700 28px ${DISPLAY}`;
    const w = g.measureText(label).width + 36;
    g.fillStyle = "#6aa8a8";
    g.fillRect(W - X - w, y - 34, w, 46);
    g.fillStyle = "#121115";
    g.fillText(label, W - X - w + 18, y);
  }

  // the ending, as a sticker
  y += 60;
  g.save();
  g.translate(X, y);
  g.rotate(-0.035);
  g.font = `700 34px ${DISPLAY}`;
  const sticker = seasonName(Math.max(0, Math.min(SEASONS - 1, r.history.length - 1)));
  const sw = g.measureText(sticker).width + 40;
  g.fillStyle = "#121115";
  g.fillRect(8, 8, sw, 58);
  g.fillStyle = endingColor(r.ending);
  g.fillRect(0, 0, sw, 58);
  g.fillStyle = "#fff";
  g.fillText(sticker, 20, 43);
  g.restore();

  y += 205;
  g.fillStyle = "#e4ddcc";
  let size = 170;
  g.font = `700 ${size}px ${DISPLAY}`;
  while (g.measureText(e.title).width > W - X * 2 && size > 80) { size -= 8; g.font = `700 ${size}px ${DISPLAY}`; }
  g.fillText(e.title, X, y);

  y += 78;
  const trait = TRAITS.find((t) => t.id === r.trait)?.name ?? "";
  g.font = `700 44px ${DISPLAY}`;
  g.fillStyle = "#a59e90";
  g.fillText(`${trait.toUpperCase()} · ${r.history.length}/${SEASONS} ${tr("СЕЗОНІВ", "SEASONS")}`, X, y);

  // the mind across the seasons
  y += 34;
  const gx = X;
  const gw = W - X * 2;
  const gh = 240;
  g.fillStyle = "#18171c";
  g.fillRect(gx, y, gw, gh);
  g.strokeStyle = "#3a3640";
  g.lineWidth = 3;
  g.strokeRect(gx, y, gw, gh);
  g.font = `700 22px ${DISPLAY}`;
  g.fillStyle = "#6a6470";
  for (let k = 0; k < 4; k++) {
    const xx = gx + 30 + ((k * 4) / (SEASONS - 1)) * (gw - 60);
    g.fillText(String(2023 + k), xx, y + gh - 14);
    g.strokeStyle = "#26242c";
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(xx, y + 16); g.lineTo(xx, y + gh - 44); g.stroke();
  }
  g.fillText(tr("ПСИХІКА", "MIND"), gx + 20, y + 36);
  const px = (i: number) => gx + 30 + (i / (SEASONS - 1)) * (gw - 60);
  const py = (v: number) => y + gh - 50 - (v / 100) * (gh - 90);
  if (r.history.length) {
    const grad = g.createLinearGradient(0, y, 0, y + gh);
    grad.addColorStop(0, "rgba(232,196,90,.35)");
    grad.addColorStop(1, "rgba(232,196,90,0)");
    g.beginPath();
    g.moveTo(px(0), py(0));
    r.history.forEach((v, i) => g.lineTo(px(i), py(v)));
    g.lineTo(px(r.history.length - 1), py(0));
    g.closePath();
    g.fillStyle = grad;
    g.fill();
    g.beginPath();
    r.history.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v))));
    g.strokeStyle = "#e8c45a";
    g.lineWidth = 7;
    g.lineJoin = "round";
    g.stroke();
    const last = r.history.length - 1;
    g.fillStyle = survived ? "#8ac46a" : "#c83a32";
    g.beginPath(); g.arc(px(last), py(r.history[last]), 13, 0, Math.PI * 2); g.fill();
  }

  // numbers
  y += gh + 26;
  const dead = r.friends.filter((f) => f.state === "dead").length;
  const stats: Array<[string, string, boolean]> = [
    [tr("ДНІВ БЕЗ ВУЛИЦІ", "DAYS INSIDE"), num(r.daysInside), false],
    [tr("ТРИВОГ", "ALERTS"), String(r.alerts), false],
    [tr("СТУКІВ У ДВЕРІ", "KNOCKS"), String(r.knocks), false],
    [tr("ДРУЗІВ ЗАГИНУЛО", "FRIENDS KILLED"), String(dead), dead > 0],
  ];
  const cw = (gw - 20) / 2;
  stats.forEach(([label, value, bad], i) => {
    const cx = gx + (i % 2) * (cw + 20);
    const cy = y + Math.floor(i / 2) * 116;
    g.fillStyle = "#22202a";
    g.fillRect(cx, cy, cw, 100);
    g.strokeStyle = "#121115";
    g.lineWidth = 4;
    g.strokeRect(cx, cy, cw, 100);
    g.fillStyle = "#a59e90";
    g.font = `700 22px ${DISPLAY}`;
    g.fillText(label, cx + 22, cy + 34);
    g.fillStyle = bad ? "#e87a6a" : "#e4ddcc";
    g.font = `700 50px ${DISPLAY}`;
    g.fillText(value, cx + 22, cy + 86);
  });

  // the five friends
  y += 260;
  const fw = gw / Math.max(1, r.friends.length);
  r.friends.forEach((f, i) => {
    const cx = gx + fw * i + fw / 2;
    const deadF = f.state === "dead";
    g.beginPath();
    g.arc(cx, y, 30, 0, Math.PI * 2);
    g.fillStyle = deadF ? "#121115" : `#${f.color.toString(16).padStart(6, "0")}`;
    g.globalAlpha = f.state === "free" || f.state === "home" || deadF ? 1 : 0.55;
    g.fill();
    g.globalAlpha = 1;
    g.lineWidth = 4;
    g.strokeStyle = deadF ? "#e4ddcc" : "#121115";
    g.stroke();
    if (deadF) { g.beginPath(); g.moveTo(cx - 30, y + 30); g.lineTo(cx + 30, y - 30); g.stroke(); }
    g.textAlign = "center";
    g.fillStyle = "#e4ddcc";
    g.font = `700 26px ${DISPLAY}`;
    g.fillText(f.name, cx, y + 70);
    g.fillStyle = deadF ? "#e87a6a" : "#a59e90";
    g.font = `700 19px ${DISPLAY}`;
    g.fillText(stateWord(f.state), cx, y + 98);
    g.textAlign = "left";
  });

  // the invitation
  g.fillStyle = "#6aa8a8";
  g.font = `700 36px ${DISPLAY}`;
  g.fillText(tr("А ТИ ПРОТРИМАЄШСЯ?", "HOW LONG WOULD YOU LAST?"), X, H - 92);
  g.fillStyle = "#a59e90";
  g.font = `500 26px ${BODY}`;
  g.fillText(gameUrl(!!r.daily).replace(/^https?:\/\//, ""), X, H - 52);

  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/png"));
}

export type ShareOutcome = "shared" | "cancelled" | "copied" | "downloaded";

/** Native share with the picture where possible; otherwise copy the text and save the picture. */
export async function shareResult(r: RunResult, prepared: Blob | null = null): Promise<ShareOutcome> {
  const text = shareText(r);
  // the card is drawn when the run ends, so share() still runs inside the tap (Safari is strict about that)
  let blob = prepared;
  if (!blob) { try { blob = await renderCard(r); } catch { blob = null; } }
  const file = blob ? new File([blob], "four-walls.png", { type: "image/png" }) : null;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    if (file && nav.share && nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], text, title: tr("Чотири стіни", "Four Walls") }); return "shared"; }
    if (nav.share) { await nav.share({ text, title: tr("Чотири стіни", "Four Walls") }); return "shared"; }
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return "cancelled";
  }
  let copied = false;
  try { await navigator.clipboard.writeText(text); copied = true; } catch { /* no clipboard */ }
  if (blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "four-walls.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return copied ? "copied" : "downloaded";
  }
  return copied ? "copied" : "downloaded";
}
