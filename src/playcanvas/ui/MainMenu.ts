import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/special-elite/latin-400.css";
import "@fontsource/permanent-marker/latin-400.css";
import { audio } from "../audio/Audio";
import { BIOME_AUDIO } from "../audio/soundMap";
import { ENEMIES } from "../gameplay/config";
import { BIOMES, type BiomeId } from "../world/level/Biomes";
import { showCredits } from "./credits";
import { showMetaShop } from "./MetaShop";
import { loadMeta } from "../gameplay/meta";
import { loadProgress } from "./progress";
import { showHeroes, showQuests } from "./ProfileScreens";
import { showSettings } from "./SettingsScreen";
import { keepSaves } from "./Install";
import { checkQuests, chooseDanger, chooseDifficulty, chosenDanger, chosenDifficulty, heroFor, dangerUnlocked, profile, QUESTS } from "../gameplay/profile";
import { dangerMods, dangerSummary } from "../gameplay/danger";
import { heroDef } from "../gameplay/heroes";
import { clearDaily, dailySetup, markDaily, todayKey } from "../gameplay/daily";

/** What the menu says about each chapter (the rest comes from the campaign data). */
/** `caption`: the note under the chapter's photo on the map. */
const CHAPTERS: { id: BiomeId; numeral: string; name: string; tagline: string; accent: string; caption: string }[] = [
  { id: "outpost", numeral: "I", name: "The Wasteland", tagline: "The dead own the city. Hold the outpost, cross the Dead Streets, and bring down what waits in the Plaza.", accent: "#d6a23c", caption: "the Plaza. don't stop here" },
  { id: "facility", numeral: "II", name: "Station ORION", tagline: "A research station gone silent. Fight through seven sectors to Project Gate, and whatever came through it.", accent: "#4fd8ff", caption: "deck 7. the lights are still on" },
  { id: "medieval", numeral: "III", name: "The Dark Kingdom", tagline: "A plague-struck realm where the dead rise. Cross the graveyard and the abbey, storm the castle, and face the Fallen King.", accent: "#c9a25a", caption: "the king's road. he isn't dead enough" },
  { id: "hell", numeral: "IV", name: "Hell", tagline: "Nine circles of fire and ash. Descend past the Citadel to the Archfiend's throne.", accent: "#ff6a2e", caption: "ninth circle. bring water" },
  { id: "pirate", numeral: "V", name: "The Black Tide", tagline: "Cursed gold woke the drowned. Escape the treasure grotto, cross the wrecks and the reef, and sink the ghost flagship.", accent: "#3fc7b0", caption: "the tide came back with them" },
  { id: "winter", numeral: "VI", name: "Whiteout", tagline: "One night of snow and the dead. Cross the black pines and a farm in the blizzard, walk the dark suburb, and survive the burning town of Ashford.", accent: "#9fc4ff", caption: "Ashford. follow the fires" },
];

const LAST_KEY = "dustline3d.chapter";

const CSS = `
/* The start screen is a survivor's road map: paper, a pencilled route with a stop per chapter, a
   photo taped on, the chapter on an index card, and the notes (difficulty, hero, upgrades) in the
   margins. Type: a typewriter for what is written down, a marker for names. */
#menu { position: fixed; inset: 0; z-index: 30; overflow: hidden; color: #2a2118; --ink: #2a2118; --red: #a3271c; --card: #f6f1e4;
  font: 400 15px/1.3 "Special Elite", "Courier New", monospace; -webkit-user-select: none; user-select: none; touch-action: pan-y; transition: opacity 0.45s;
  background: #d8c9a3;
  background-image: radial-gradient(ellipse at 28% 16%, rgba(255, 250, 230, 0.65), transparent 60%), radial-gradient(ellipse at 82% 92%, rgba(120, 90, 40, 0.38), transparent 55%),
    repeating-linear-gradient(0deg, rgba(60, 45, 20, 0.055) 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, rgba(60, 45, 20, 0.055) 0 1px, transparent 1px 28px); }
#menu.gone { opacity: 0; pointer-events: none; }
/* The map's folds. */
#menu::before, #menu::after { content: ""; position: absolute; background: rgba(60, 40, 10, 0.22); box-shadow: 1px 1px 0 rgba(255, 255, 255, 0.35); pointer-events: none; }
#menu::before { top: 0; bottom: 0; left: 50%; width: 1px; }
#menu::after { left: 0; right: 0; top: 37%; height: 1px; }
#menu button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
#menu .ui { position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; box-sizing: border-box; max-width: 520px; margin: 0 auto;
  padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left)); }
#menu .top { display: flex; align-items: flex-start; justify-content: space-between; }
#menu .logo h1 { margin: 4px 0 0; font: 400 clamp(40px, 12.5vw, 54px)/0.9 "Permanent Marker", cursive; transform: rotate(-2deg); transform-origin: 0 100%; }
#menu .logo p { margin: 8px 0 0; font-size: 13px; }
#menu .links { display: grid; justify-items: end; }
#menu .links button { min-height: 30px; padding: 4px 0 4px 14px; font-size: 14px; text-decoration: underline; text-underline-offset: 3px; }
/* The map: the route on the left, the photo on the right. */
#menu .map { position: relative; flex: 1; min-height: 150px; margin: 6px 0 4px; }
#menu .route { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
#menu .route path { fill: none; stroke: var(--red); stroke-width: 3; stroke-dasharray: 2 9; stroke-linecap: round; vector-effect: non-scaling-stroke; }
#menu .stop { position: absolute; width: 46px; height: 46px; margin: -23px 0 0 -23px; display: grid; place-items: center; }
#menu .stop b { font: 400 19px/1 "Permanent Marker", cursive; opacity: 0.55; }
/* A pencilled cross at every stop; the chosen one is ringed in red; a cleared one is ticked. */
#menu .stop::before { content: ""; position: absolute; left: 50%; top: 50%; width: 15px; height: 15px; margin: -8px 0 0 -8px; opacity: 0.4;
  background: linear-gradient(45deg, transparent 44%, var(--ink) 44% 56%, transparent 56%), linear-gradient(-45deg, transparent 44%, var(--ink) 44% 56%, transparent 56%); }
#menu .stop b { position: relative; transform: translate(15px, -13px); }
#menu .stop.done::after { content: "✓"; position: absolute; left: 4px; bottom: 0; font: 400 17px/1 "Permanent Marker", cursive; color: #2f6b3a; }
#menu .stop.on::before { width: 30px; height: 30px; margin: -15px 0 0 -15px; opacity: 1; border-radius: 50%; border: 2.5px solid var(--red);
  background: radial-gradient(circle, var(--red) 0 34%, transparent 37%); transform: rotate(-8deg) scale(1.04, 0.96); }
#menu .stop.on b { opacity: 1; color: var(--red); transform: translate(21px, -17px); font-size: 23px; }
#menu .photo { position: absolute; right: 2%; top: 3%; height: 86%; aspect-ratio: 0.8; max-width: 60%; box-sizing: border-box; padding: 8px 8px 44px; background: var(--card);
  box-shadow: 0 8px 18px rgba(40, 25, 5, 0.45); transform: rotate(3deg); }
#menu .photo .frame { position: relative; width: 100%; height: 100%; overflow: hidden; background: #1a1410; }
#menu .shot { position: absolute; inset: 0; background: center 42% / cover no-repeat; filter: sepia(0.22) contrast(1.05); opacity: 0; transition: opacity 0.35s; }
#menu .shot.on { opacity: 1; }
#menu .photo .cap { position: absolute; left: 10px; right: 8px; bottom: 6px; height: 32px; display: flex; align-items: center; font: 400 14px/1.12 "Permanent Marker", cursive; overflow: hidden; }
#menu .photo .tape { position: absolute; left: 50%; top: -11px; width: 76px; height: 22px; margin-left: -46px; background: rgba(232, 214, 140, 0.78); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); transform: rotate(-5deg); }
/* The chapter's index card: ruled, with a stamp for this browser's progress. */
#menu .chapter { position: relative; margin: 6px 0 0; padding: 12px 16px 10px; background: var(--card); box-shadow: 0 6px 14px rgba(40, 25, 5, 0.4); transform: rotate(-1.1deg);
  background-image: linear-gradient(180deg, transparent 39px, rgba(190, 60, 50, 0.6) 39px 40.5px, transparent 40.5px), repeating-linear-gradient(180deg, transparent 0 23px, rgba(70, 110, 160, 0.28) 23px 24px); background-position: 0 0, 0 41px;
  animation: menu-card 0.3s ease-out; }
@keyframes menu-card { from { transform: rotate(-3deg) translateY(10px); opacity: 0.4; } to { transform: rotate(-1.1deg); opacity: 1; } }
#menu .chapter h2 { margin: 0; font: 400 clamp(22px, 6.8vw, 28px)/1.15 "Permanent Marker", cursive; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#menu .chapter p { margin: 9px 0 0; font-size: 14.5px; line-height: 24px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
#menu .chapter .last { display: flex; justify-content: space-between; gap: 10px; font-size: 14.5px; line-height: 24px; white-space: nowrap; }
#menu .chapter .last span:last-child { overflow: hidden; text-overflow: ellipsis; }
#menu .stamp { position: absolute; right: 12px; top: -15px; padding: 5px 8px 1px; font-size: 14px; color: var(--red); border: 2.5px solid currentColor; border-radius: 3px; background: rgba(246, 241, 228, 0.7); transform: rotate(6deg); }
#menu .stamp.ok { color: #2f6b3a; }
/* The margins: difficulty ticked off on the left, the kit list on the right. */
#menu .notes { display: flex; justify-content: space-between; gap: 12px; margin-top: 12px; }
#menu .diffs { display: grid; align-content: start; }
#menu .diffs button { display: flex; align-items: center; gap: 9px; min-height: 30px; font-size: 15px; text-align: left; }
#menu .diffs button i { position: relative; width: 15px; height: 15px; border: 1.5px solid var(--ink); flex: none; }
#menu .diffs button.on i::after { content: "✗"; position: absolute; left: -2px; top: -9px; font: 400 23px/1 "Permanent Marker", cursive; font-style: normal; color: var(--red); }
#menu .danger { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 15px; }
#menu .danger button { width: 30px; height: 30px; font: 400 20px/1 "Permanent Marker", cursive; }
#menu .danger button:disabled { opacity: 0.25; }
#menu .danger b { font: 400 16px/1 "Permanent Marker", cursive; color: var(--red); }
#menu .kit { display: grid; justify-items: end; align-content: start; }
#menu .kit button { min-height: 30px; font-size: 14.5px; text-align: right; white-space: nowrap; }
#menu .kit b { margin-left: 6px; font: 400 16px/1 "Permanent Marker", cursive; }
#menu .kit .fresh b, #menu .kit .new b { color: var(--red); }
#menu .rule { min-height: 2.5em; margin-top: 6px; font-size: 12.5px; line-height: 1.25; opacity: 0.75; }
#menu .rule:empty { min-height: 0; }
/* PLAY is the stamp. */
#menu .play { align-self: center; margin: 4px 0 2px; padding: 11px 36px 5px; font-size: 30px; line-height: 1; letter-spacing: 0.06em; color: var(--red); border: 4px solid var(--red); border-radius: 6px;
  background: rgba(246, 241, 228, 0.4); box-shadow: inset 0 0 0 2px #d8c9a3, inset 0 0 0 4px var(--red); transform: rotate(-3deg); transition: transform 0.08s; }
#menu .play:active { transform: rotate(-3deg) scale(0.95); }
#menu button:focus-visible { outline: 2px dashed var(--red); outline-offset: 3px; }
@media (max-height: 720px) { #menu .chapter p { -webkit-line-clamp: 2; } #menu .rule { display: none; } }
@media (max-height: 620px) { #menu .logo p { display: none; } #menu .chapter p { display: none; } }
@media (prefers-reduced-motion: reduce) { #menu .chapter { animation: none; } #menu .shot { transition: none; } }
`;

/**
 * The stops of the route on the map (% of the map area: across, down), one per chapter, and the
 * pencilled line through them (a smooth curve; drawn in a 100 x 100 box stretched over the map).
 */
const STOPS: [number, number][] = [[9, 9], [27, 26], [25, 45], [9, 60], [18, 78], [33, 95]];
const ROUTE = STOPS.map(([x, y], i) => {
  if (i === 0) return `M${x} ${y}`;
  const [px, py] = STOPS[i - 1], [ppx, ppy] = STOPS[i - 2] ?? STOPS[i - 1], [nx, ny] = STOPS[i + 1] ?? STOPS[i];
  // Catmull-Rom through the stops, as cubic Beziers.
  return `C${(px + (x - ppx) / 6).toFixed(1)} ${(py + (y - ppy) / 6).toFixed(1)} ${(x - (nx - px) / 6).toFixed(1)} ${(y - (ny - py) / 6).toFixed(1)} ${x} ${y}`;
}).join("");

/** Settings cog: a ring, a hub, and a dashed outer ring for the teeth. */
export const COG_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="2.6" stroke-width="2.2"/><circle cx="12" cy="12" r="6.6" stroke-width="2.4"/><circle cx="12" cy="12" r="9.3" stroke-width="3" stroke-dasharray="3.65 3.654"/></svg>`;


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
  clearDaily();
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement("div");
  root.id = "menu";
  root.innerHTML = `
    <div class="ui">
      <div class="top">
        <div class="logo"><h1>Dustline</h1><p>road notes, kept by a survivor</p></div>
        <div class="links"><button type="button" class="cog">settings</button><button type="button" class="snd"></button></div>
      </div>
      <div class="map">
        <svg class="route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${ROUTE}"/></svg>
        ${CHAPTERS.map((c, i) => `<button type="button" class="stop" data-tab="${c.id}" aria-label="chapter ${i + 1}: ${c.name}" style="left:${STOPS[i][0]}%;top:${STOPS[i][1]}%"><b>${i + 1}</b></button>`).join("")}
        <div class="photo"><div class="frame">${CHAPTERS.map((c) => `<div class="shot" data-art="${c.id}" style="background-image:url('${base}menu/${c.id}.webp')"></div>`).join("")}</div><i class="tape"></i><span class="cap"></span></div>
      </div>
      <div class="chapter"></div>
      <div class="notes">
        <div class="diffs"></div>
        <div class="kit"><button type="button" class="meta">upgrades<b></b></button><button type="button" class="hero"></button><button type="button" class="quests"></button><button type="button" class="daily"></button></div>
      </div>
      <div class="rule"></div>
      <button type="button" class="play">SET OUT</button>
    </div>`;
  document.body.append(root);

  const chapterEl = root.querySelector<HTMLElement>(".chapter")!;
  let index = 0;
  try {
    index = Math.max(0, CHAPTERS.findIndex((c) => c.id === localStorage.getItem(LAST_KEY)));
  } catch {
    /* storage unavailable */
  }

  let heroRefresh = () => {};
  /** The chapter is being redrawn in place (its difficulty or danger changed). */
  let refresh = false;
  const select = (i: number, sound = true) => {
    index = (i + CHAPTERS.length) % CHAPTERS.length;
    heroRefresh();
    const c = CHAPTERS[index];
    root.style.setProperty("--accent", c.accent);
    root.querySelectorAll<HTMLElement>("[data-art]").forEach((el) => el.classList.toggle("on", el.dataset.art === c.id));
    root.querySelectorAll<HTMLElement>("[data-tab]").forEach((el) => el.classList.toggle("on", el.dataset.tab === c.id));
    const f = facts(c.id);
    const p = loadProgress(c.id);
    const top = dangerUnlocked(c.id), danger = chosenDanger(c.id);
    // The card: the chapter's name and story, its length and last boss, and a stamp for progress.
    const stamp = p.cleared ? `<span class="stamp ok">CLEARED, ${p.cleared.toUpperCase()}</span>` : p.best ? `<span class="stamp">REACHED ${p.best} OF ${f.levels}</span>` : `<span class="stamp">NOT CLEARED</span>`;
    chapterEl.innerHTML = `${stamp}<h2></h2><p></p><div class="last"><span>${f.levels} levels</span><span></span></div>`;
    chapterEl.querySelector("h2")!.textContent = `${index + 1}. ${c.name}`;
    chapterEl.querySelector("p")!.textContent = c.tagline;
    chapterEl.querySelector(".last span:last-child")!.textContent = `boss: ${f.bosses[f.bosses.length - 1]}`;
    root.querySelector(".cap")!.textContent = c.caption;
    root.querySelectorAll<HTMLElement>(".stop").forEach((el) => el.classList.toggle("done", !!loadProgress(el.dataset.tab as BiomeId).cleared));
    // Difficulty: ticked here once per chapter (remembered), not asked again before every run.
    const all = BIOMES[c.id].campaign?.difficulties;
    const ids = all ? Object.keys(all) : [];
    const difficulty = ids.length ? chosenDifficulty(c.id, ids, BIOMES[c.id].campaign?.defaultDifficulty) : "";
    const redraw = () => { refresh = true; select(index); refresh = false; };
    const diffs = root.querySelector<HTMLElement>(".diffs")!;
    diffs.innerHTML = `${ids.length > 1 ? ids.map((id) => `<button type="button" role="radio" aria-checked="${id === difficulty}" class="${id === difficulty ? "on" : ""}" data-diff="${id}"><i></i>${all![id].label.toLowerCase()}</button>`).join("") : ""}${
      top > 0 ? `<div class="danger">danger <button type="button" class="dn" aria-label="less danger" ${danger <= 0 ? "disabled" : ""}>‹</button><b>${danger}</b><button type="button" class="up" aria-label="more danger" ${danger >= top ? "disabled" : ""}>›</button></div>` : ""}`;
    diffs.querySelectorAll<HTMLElement>("[data-diff]").forEach((el) => el.addEventListener("click", () => {
      if (el.dataset.diff === difficulty) return;
      chooseDifficulty(c.id, el.dataset.diff!);
      redraw();
    }));
    if (top > 0) {
      diffs.querySelector(".dn")!.addEventListener("click", () => { chooseDanger(c.id, danger - 1); redraw(); });
      diffs.querySelector(".up")!.addEventListener("click", () => { chooseDanger(c.id, danger + 1); redraw(); });
    }
    // The chosen difficulty's rule (and the danger's), pencilled under the notes.
    const rules = [difficulty ? all![difficulty].text : "", top > 0 && danger > 0 ? `Danger ${danger}: ${dangerSummary(danger)}, Dust x${dangerMods(danger).dust.toFixed(2)}.` : ""].filter(Boolean);
    root.querySelector(".rule")!.textContent = rules.join(" ");
    // The card drops in again (not when only a setting of this chapter changed).
    if (!refresh) {
      chapterEl.style.animation = "none";
      void chapterEl.offsetWidth;
      chapterEl.style.animation = "";
    }
    audio.music(BIOME_AUDIO[c.id]?.music ?? null);
    if (sound) audio.play("ui_open");
  };
  // Menu sounds and the chapter's music load right away, so the first tap already plays them.
  audio.preload(["ui", "ui_open", "ui_close", "stamp", "upgrade", BIOME_AUDIO[CHAPTERS[index].id]?.music].filter((id): id is string => !!id));
  select(index, false);

  root.querySelectorAll<HTMLElement>("[data-tab]").forEach((el, i) => el.addEventListener("click", () => select(i)));
  const metaButton = root.querySelector<HTMLElement>(".meta")!;
  const showDust = () => {
    const m = loadMeta();
    metaButton.querySelector("b")!.textContent = `◆ ${m.dust}`;
    metaButton.classList.toggle("fresh", m.dust >= 15);
  };
  showDust();
  metaButton.addEventListener("click", () => {
    audio.play("ui_open");
    showMetaShop(showDust);
  });
  // Quests completed outside a run (none yet) and the hero / quests / daily buttons.
  checkQuests();
  const heroButton = root.querySelector<HTMLElement>(".hero")!;
  const questButton = root.querySelector<HTMLElement>(".quests")!;
  const dailyButton = root.querySelector<HTMLElement>(".daily")!;
  const showProfile = () => {
    const h = heroDef(heroFor(CHAPTERS[index].id));
    heroButton.innerHTML = `hero<b></b>`;
    heroButton.querySelector("b")!.textContent = h.name;
    const p = profile();
    questButton.innerHTML = `quests<b>${p.quests.length} of ${QUESTS.length}</b>`;
    const d = dailySetup();
    const bestToday = p.daily[d.key];
    dailyButton.innerHTML = `daily run<b>${bestToday ? bestToday.toLocaleString("en-US") : "new"}</b>`;
    dailyButton.classList.toggle("new", !bestToday);
  };
  heroRefresh = showProfile;
  showProfile();
  heroButton.addEventListener("click", () => {
    audio.play("ui_open");
    showHeroes(showProfile);
  });
  questButton.addEventListener("click", () => {
    audio.play("ui_open");
    showQuests(showProfile);
  });
  root.querySelector(".cog")!.addEventListener("click", () => {
    audio.play("ui_open");
    showSettings(() => {}, [{ label: "Credits", note: "Third-party art, sound and music", onClick: showCredits }]);
  });
  const soundButton = root.querySelector<HTMLElement>(".snd")!;
  const showSound = () => { soundButton.textContent = audio.muted ? "sound off" : "sound on"; };
  showSound();
  soundButton.addEventListener("click", () => {
    audio.setMuted(!audio.muted);
    showSound();
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
      // A tap on Play: ask the browser to keep this site's saves.
      keepSaves();
      audio.play("stamp");
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
    // Today's daily: its chapter with the day's hero and danger (the run reads the mark).
    dailyButton.addEventListener("click", () => {
      const d = dailySetup(todayKey());
      markDaily(d.key);
      index = Math.max(0, CHAPTERS.findIndex((c) => c.id === d.chapter));
      play();
    });
  });
}

/** The menu shows unless the link asks for a map, level or difficulty directly (shared / debug links). */
export function menuWanted(): boolean {
  const params = new URLSearchParams(location.search);
  return !["level", "biome", "wave", "difficulty", "play"].some((k) => params.has(k));
}

/** Chapter numeral, name, tagline and accent colour for the loading screen. */
export function chapterInfo(id: BiomeId): { numeral: string; name: string; tagline: string; accent: string } {
  const c = CHAPTERS.find((c) => c.id === id);
  return c ?? { numeral: "", name: BIOMES[id].label, tagline: "", accent: "#d6a23c" };
}

/** Chapter name for the loading screen. */
export function chapterName(id: BiomeId): string {
  return CHAPTERS.find((c) => c.id === id)?.name ?? BIOMES[id].label;
}
