/** What a daily-run share card shows. */
export interface DailyCard {
  date: string;
  chapter: string;
  hero: string;
  danger: number;
  score: number;
  won: boolean;
  kills: number;
  cleared: number;
  levels: number;
  time: number;
  /** The chapter's key art (background). */
  art: string;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Draws the card (720 x 900) over the chapter art. */
export async function renderDailyCard(c: DailyCard): Promise<HTMLCanvasElement> {
  const W = 720, H = 900;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#120d0a";
  g.fillRect(0, 0, W, H);
  const art = await loadImage(c.art);
  if (art) {
    const k = Math.max(W / art.width, H / art.height);
    g.globalAlpha = 0.55;
    g.drawImage(art, (W - art.width * k) / 2, (H - art.height * k) / 2, art.width * k, art.height * k);
    g.globalAlpha = 1;
  }
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(12, 8, 6, 0.85)");
  shade.addColorStop(0.45, "rgba(12, 8, 6, 0.35)");
  shade.addColorStop(1, "rgba(12, 8, 6, 0.95)");
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  const font = (weight: number, size: number) => `${weight} ${size}px "Barlow Condensed", system-ui, sans-serif`;
  g.textAlign = "center";
  g.fillStyle = "#d6a23c";
  g.font = font(700, 26);
  g.fillText(`DAILY RUN · ${c.date}`, W / 2, 78);
  g.fillStyle = "#f3e7d3";
  g.font = font(800, 96);
  g.fillText("DUSTLINE", W / 2, 170);
  g.font = font(700, 30);
  g.fillStyle = "rgba(243, 231, 211, 0.85)";
  g.fillText(`${c.chapter.toUpperCase()} · ${c.hero.toUpperCase()} · DANGER ${c.danger}`, W / 2, 222);
  g.fillStyle = c.won ? "#8fd8ff" : "#e2692a";
  g.font = font(800, 40);
  g.fillText(c.won ? "CHAPTER CLEARED" : `FELL ON LEVEL ${Math.min(c.levels, c.cleared + 1)}`, W / 2, 470);
  g.fillStyle = "#f3e7d3";
  g.font = font(800, 150);
  g.fillText(c.score.toLocaleString("en-US"), W / 2, 620);
  g.font = font(700, 28);
  g.fillStyle = "rgba(243, 231, 211, 0.7)";
  g.fillText("SCORE", W / 2, 662);
  const mm = Math.floor(c.time / 60), ss = String(Math.floor(c.time % 60)).padStart(2, "0");
  const cells = [[`${c.kills}`, "KILLS"], [`${c.cleared}/${c.levels}`, "LEVELS"], [`${mm}:${ss}`, "TIME"]];
  cells.forEach(([v, l], i) => {
    const x = (W / 6) * (1 + 2 * i);
    g.fillStyle = "#f3e7d3";
    g.font = font(800, 50);
    g.fillText(v, x, 770);
    g.fillStyle = "rgba(243, 231, 211, 0.6)";
    g.font = font(700, 22);
    g.fillText(l, x, 802);
  });
  g.fillStyle = "rgba(243, 231, 211, 0.45)";
  g.font = font(700, 22);
  g.fillText("Same run for everyone today. Beat it.", W / 2, 862);
  return canvas;
}

/**
 * Shares the card as an image where the device can (the share sheet), else downloads it; the text
 * line goes along (or to the clipboard).
 */
export async function shareDaily(c: DailyCard): Promise<void> {
  const text = `Dustline daily ${c.date}: ${c.score.toLocaleString("en-US")} points · ${c.chapter}, ${c.hero}, danger ${c.danger}${c.won ? " · cleared!" : ""}`;
  const canvas = await renderDailyCard(c);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (blob) {
    const file = new File([blob], `dustline-daily-${c.date}.png`, { type: "image/png" });
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], text });
        return;
      } catch {
        /* cancelled: fall through to the download */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    /* clipboard unavailable */
  }
}
