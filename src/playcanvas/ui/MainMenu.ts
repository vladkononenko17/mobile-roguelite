import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import { audio } from "../audio/Audio";
import { BIOME_AUDIO } from "../audio/soundMap";
import { ENEMIES } from "../gameplay/config";
import { BIOMES, type BiomeId } from "../world/level/Biomes";
import { loadProgress } from "./progress";

/** What the menu says about each chapter (the rest comes from the campaign data). */
const CHAPTERS: { id: BiomeId; numeral: string; name: string; tagline: string; accent: string }[] = [
  { id: "outpost", numeral: "I", name: "The Wasteland", tagline: "The dead own the city. Hold the outpost, cross the Dead Streets, and bring down what waits in the Plaza.", accent: "#d6a23c" },
  { id: "facility", numeral: "II", name: "Station ORION", tagline: "A research station gone silent. Fight through seven sectors to Project Gate, and whatever came through it.", accent: "#4fd8ff" },
  { id: "hell", numeral: "III", name: "Hell", tagline: "Nine circles of fire and ash. Descend past the Citadel to the Archfiend's throne.", accent: "#ff6a2e" },
];

const LAST_KEY = "dustline3d.chapter";

const CSS = `
#menu { position: fixed; inset: 0; z-index: 30; overflow: hidden; background: #0d0a08; color: #ece3cf;
  font: 700 14px/1.25 "Barlow Condensed", system-ui, sans-serif; -webkit-user-select: none; user-select: none; touch-action: pan-y;
  transition: opacity 0.45s; --accent: #d6a23c; }
#menu.gone { opacity: 0; pointer-events: none; }
#menu .art { position: absolute; inset: 0; background: center 40% / cover no-repeat; opacity: 0; transition: opacity 0.6s; transform: scale(1.08);
  animation: menu-drift 24s ease-in-out infinite alternate; }
#menu .art.on { opacity: 1; }
@keyframes menu-drift { from { transform: scale(1.08) translateY(0); } to { transform: scale(1.16) translateY(-2%); } }
#menu .shade { position: absolute; inset: 0; background:
  linear-gradient(180deg, rgba(10, 7, 5, 0.92) 0%, rgba(10, 7, 5, 0.35) 26%, rgba(10, 7, 5, 0.1) 44%, rgba(10, 7, 5, 0.72) 64%, rgba(10, 7, 5, 0.97) 84%),
  radial-gradient(ellipse 90% 60% at 50% 45%, transparent 40%, rgba(0, 0, 0, 0.5) 100%); }
#menu .grain { position: absolute; inset: -50%; opacity: 0.05; pointer-events: none;
  background-image: repeating-radial-gradient(circle at 17% 32%, #fff 0 0.6px, transparent 0.6px 3px); animation: menu-grain 1.2s steps(4) infinite; }
@keyframes menu-grain { 0% { transform: translate(0, 0); } 25% { transform: translate(-3%, 2%); } 50% { transform: translate(2%, -3%); } 75% { transform: translate(-2%, -1%); } }
#menu .ui { position: absolute; inset: 0; display: flex; flex-direction: column; box-sizing: border-box;
  padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
  max-width: 560px; margin: 0 auto; }
#menu .top { display: flex; align-items: flex-start; justify-content: space-between; }
#menu .logo { margin-top: 4px; }
#menu .logo small { display: block; font-size: 12px; letter-spacing: 0.42em; color: var(--accent); transition: color 0.5s; }
#menu .logo h1 { margin: 2px 0 0; font-size: clamp(46px, 15vw, 72px); font-weight: 800; line-height: 0.9; letter-spacing: 0.06em;
  background: linear-gradient(180deg, #fff6e2 20%, #c9b48f 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.6)); }
#menu .logo p { margin: 6px 0 0; font-size: 13px; letter-spacing: 0.24em; opacity: 0.7; }
#menu .icon { width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid rgba(236, 227, 207, 0.35); border-radius: 10px;
  background: rgba(13, 10, 8, 0.5); color: inherit; padding: 0; }
#menu .icon svg { width: 20px; height: 20px; }
#menu .icon.off { opacity: 0.45; }
#menu .icon.off .wave, #menu .icon:not(.off) .mute { display: none; }
#menu .grow { flex: 1; }
#menu .chapter { animation: menu-in 0.45s ease-out; }
@keyframes menu-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
#menu .kicker { font-size: 13px; letter-spacing: 0.3em; color: var(--accent); transition: color 0.5s; }
#menu .chapter h2 { margin: 2px 0 6px; font-size: clamp(34px, 10vw, 46px); font-weight: 800; letter-spacing: 0.03em; line-height: 1; text-transform: uppercase;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.8); }
#menu .chapter p { margin: 0; font: 500 15px/1.35 system-ui, sans-serif; opacity: 0.85; max-width: 42ch; text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9); }
#menu .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
#menu .chips span { padding: 4px 8px 3px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; border-radius: 4px;
  background: rgba(236, 227, 207, 0.1); border: 1px solid rgba(236, 227, 207, 0.18); }
#menu .chips .done { color: #12100c; background: var(--accent); border-color: transparent; }
#menu .tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 16px 0 12px; }
#menu .tab { position: relative; height: 74px; padding: 0; border: 2px solid rgba(236, 227, 207, 0.16); border-radius: 10px; overflow: hidden;
  background: #1a1410 center 42% / cover no-repeat; color: inherit; font: inherit; filter: saturate(0.55) brightness(0.65); transition: filter 0.25s, border-color 0.25s, transform 0.25s; }
#menu .tab::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 30%, rgba(0, 0, 0, 0.85)); }
#menu .tab b { position: absolute; left: 8px; right: 8px; bottom: 6px; z-index: 1; text-align: left; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; }
#menu .tab i { position: absolute; top: 5px; left: 8px; z-index: 1; font-style: normal; font-size: 11px; letter-spacing: 0.2em; opacity: 0.8; }
#menu .tab.on { filter: none; border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5); }
#menu .play { position: relative; width: 100%; height: 62px; border: 0; border-radius: 12px; background: var(--accent); color: #140f0b;
  font: 800 24px/1 "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.3em; text-indent: 0.3em; overflow: hidden;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.55), inset 0 -3px 0 rgba(0, 0, 0, 0.2); transition: background 0.5s, transform 0.1s; }
#menu .play::before { content: ""; position: absolute; top: 0; bottom: 0; width: 40%; left: -60%;
  background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.35), transparent); animation: menu-shine 3.2s ease-in-out infinite; }
@keyframes menu-shine { 0%, 55% { left: -60%; } 100% { left: 130%; } }
#menu .play:active { transform: scale(0.98); }
#menu .foot { margin-top: 10px; text-align: center; font: 500 11px/1.3 system-ui, sans-serif; opacity: 0.45; }
@media (min-height: 760px) { #menu .tab { height: 90px; } }
`;

const SOUND_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5H7L12 5V19L7 14.5H3Z" fill="currentColor"/><path class="wave" d="M15.5 9A4.5 4.5 0 0 1 15.5 15M18.5 6.5A8 8 0 0 1 18.5 17.5"/><path class="mute" d="M16 9.5L21 14.5M21 9.5L16 14.5"/></svg>`;

/** Level count and bosses of a chapter, from its campaign. */
function facts(id: BiomeId): { levels: number; bosses: string[] } {
  const levels = BIOMES[id].campaign?.levels ?? [];
  const bosses = levels.flatMap((l) => (l.boss ? [ENEMIES[l.boss.type].label] : []));
  return { levels: levels.length, bosses };
}

/**
 * The title screen: the game's name over live key art of the chosen chapter, the chapter's story line,
 * size, bosses and this browser's best progress, chapter tabs (tap or swipe), a sound toggle and PLAY.
 * The chapter's music plays once the first touch unlocks audio. Resolves with the chosen map; the
 * menu fades out (the loading screen underneath takes over).
 */
export function showMainMenu(): Promise<BiomeId> {
  const base = import.meta.env.BASE_URL;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement("div");
  root.id = "menu";
  root.innerHTML = `
    ${CHAPTERS.map((c) => `<div class="art" data-art="${c.id}" style="background-image:url('${base}menu/${c.id}.webp')"></div>`).join("")}
    <div class="shade"></div><div class="grain"></div>
    <div class="ui">
      <div class="top">
        <div class="logo"><small>NEON HOLLOW</small><h1>DUSTLINE</h1><p>SURVIVE THE HORDE</p></div>
        <button type="button" class="icon" aria-label="sound">${SOUND_SVG}</button>
      </div>
      <div class="grow"></div>
      <div class="chapter"></div>
      <div class="tabs">${CHAPTERS.map((c) => `<button type="button" class="tab" data-tab="${c.id}" style="background-image:url('${base}menu/${c.id}.webp')"><i>${c.numeral}</i><b>${c.name.replace(/^The /, "")}</b></button>`).join("")}</div>
      <button type="button" class="play">PLAY</button>
      <div class="foot">Art, sound and music: CC0 (Kenney, Quaternius, OpenGameArt)</div>
    </div>`;
  document.body.append(root);

  const chapterEl = root.querySelector<HTMLElement>(".chapter")!;
  let index = 0;
  try {
    index = Math.max(0, CHAPTERS.findIndex((c) => c.id === localStorage.getItem(LAST_KEY)));
  } catch {
    /* storage unavailable */
  }

  const select = (i: number, sound = true) => {
    index = (i + CHAPTERS.length) % CHAPTERS.length;
    const c = CHAPTERS[index];
    root.style.setProperty("--accent", c.accent);
    root.querySelectorAll<HTMLElement>("[data-art]").forEach((el) => el.classList.toggle("on", el.dataset.art === c.id));
    root.querySelectorAll<HTMLElement>("[data-tab]").forEach((el) => el.classList.toggle("on", el.dataset.tab === c.id));
    const f = facts(c.id);
    const p = loadProgress(c.id);
    const chips = [`${f.levels} levels`, ...f.bosses.map((b) => `Boss · ${b}`)].map((t) => `<span>${t}</span>`);
    if (p.cleared) chips.unshift(`<span class="done">Cleared · ${p.cleared}</span>`);
    else if (p.best) chips.unshift(`<span class="done">Best · level ${p.best}/${f.levels}</span>`);
    chapterEl.innerHTML = `<div class="kicker">CHAPTER ${c.numeral}</div><h2></h2><p></p><div class="chips">${chips.join("")}</div>`;
    chapterEl.querySelector("h2")!.textContent = c.name;
    chapterEl.querySelector("p")!.textContent = c.tagline;
    // Restart the entry animation.
    chapterEl.style.animation = "none";
    void chapterEl.offsetWidth;
    chapterEl.style.animation = "";
    audio.music(BIOME_AUDIO[c.id]?.music ?? null);
    if (sound) audio.play("ui");
  };
  select(index, false);

  root.querySelectorAll<HTMLElement>("[data-tab]").forEach((el, i) => el.addEventListener("click", () => select(i)));
  const soundButton = root.querySelector<HTMLElement>(".icon")!;
  soundButton.classList.toggle("off", audio.muted);
  soundButton.addEventListener("click", () => {
    audio.setMuted(!audio.muted);
    soundButton.classList.toggle("off", audio.muted);
  });

  // Swipe left / right on the art to change chapter.
  let startX = 0, startY = 0, tracking = false;
  root.addEventListener("pointerdown", (e) => {
    if ((e.target as Element).closest("button")) return;
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  });
  root.addEventListener("pointerup", (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) select(index + (dx < 0 ? 1 : -1));
  });

  return new Promise((resolve) => {
    const play = () => {
      window.removeEventListener("keydown", onKey);
      const id = CHAPTERS[index].id;
      try {
        localStorage.setItem(LAST_KEY, id);
      } catch {
        /* storage unavailable */
      }
      audio.play("upgrade");
      root.classList.add("gone");
      setTimeout(() => root.remove(), 500);
      resolve(id);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") select(index + 1);
      else if (e.key === "ArrowLeft") select(index - 1);
      else if (e.key === "Enter" || e.key === " ") play();
    };
    window.addEventListener("keydown", onKey);
    root.querySelector(".play")!.addEventListener("click", play);
  });
}

/** The menu shows unless the link asks for a map, level or difficulty directly (shared / debug links). */
export function menuWanted(): boolean {
  const params = new URLSearchParams(location.search);
  return !["level", "biome", "wave", "difficulty", "play"].some((k) => params.has(k));
}

/** Chapter name for the loading screen. */
export function chapterName(id: BiomeId): string {
  return CHAPTERS.find((c) => c.id === id)?.name ?? BIOMES[id].label;
}
