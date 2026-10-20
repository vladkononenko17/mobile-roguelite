import "./zhirky.css";
import { Scene3D } from "./Scene3D.ts";
import * as A from "./audio.ts";
import { voice } from "../../rozshuk/src/voice.ts";
import {
  DRIFT_TEXT, ENDINGS, FROST_TEXT, HEROES, HERO_LINES, KID_LINES, LOST_LINES, MAX_FROST, MODS, PICKUPS, RIDES, ROUTE_ROWS, THEMES, UPGRADES,
  perkById, type HeroId, type PerkId, type RideId, type Theme,
} from "./content.ts";
import {
  buyFair, chooseNode, choosePerk, choices, crewMax, deliveryBonus, finishStage, launch, leaveFair, loseRun, newRun, startStage, step,
  type Ev, type Input, type RunState, type Stage,
} from "./sim.ts";
import { bankRun, level, loadMeta, loadRun, saveMeta, saveRun } from "./save.ts";
import type { Quality } from "../../stiny/src/three/post.ts";

function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing UI element: ${sel}`);
  return el;
}
const setText = (el: HTMLElement, v: string) => { if (el.textContent !== v) el.textContent = v; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pickOne = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const num = (n: number) => Math.floor(n).toLocaleString("uk-UA");
const candies = (n: number) => `${num(n)} 🍬`;

const THEME_ICON: Record<Theme, string> = { yard: "🏢", uzviz: "⛪", dnipro: "🎣", forest: "🌲", polonyna: "🐑", blackout: "🕯️" };
const THEME_SHORT: Record<Theme, string> = { yard: "ДВІР", uzviz: "УЗВІЗ", dnipro: "ДНІПРО", forest: "ЛІС", polonyna: "ПОЛОНИНА", blackout: "БЛЕКАУТ" };
const MITT_COLORS = ["#54b7c6", "#d63732", "#f2b632", "#3a9a5a"];

const scene = new Scene3D($("#shell"));
const meta = loadMeta();
let run: RunState | null = loadRun();
let st: Stage | null = null;
let mode: "menu" | "map" | "intro" | "launch" | "run" | "over" | "perk" | "fair" | "end" | "store" = "menu";
let paused = false;
let god = false;
let selHero: HeroId = meta.heroes.includes(meta.lastHero) ? meta.lastHero : "solomiia";
let selRide: RideId = meta.rides.includes(meta.lastRide) ? meta.lastRide : "sled";
let selFrost = Math.min(meta.lastFrost, meta.maxFrost);
let audioOn = false;
let hintT = 0;
let rampHinted = false;
let kidLineT = 0;
const queue: Input[] = [];
const testMode = location.hash.includes("test");
Object.assign(window as unknown as Record<string, unknown>, { __zhirky: { scene, music: A.music, get run() { return run; }, get stage() { return st; }, meta } });

// ================================================================ small UI helpers

const SCREENS = ["#start-screen", "#store-screen", "#map-screen", "#stage-screen", "#perk-screen", "#fair-screen", "#end-screen", "#pause-screen"];
function showScreen(id: string | null): void {
  for (const s of SCREENS) $(s).classList.toggle("active", s === id);
}

let toastTimer = 0;
function toast(text: string, from = "", kind: "" | "bad" | "good" = "", ms = 2000): void {
  const t = $("#toast");
  t.innerHTML = from ? `<small>${esc(from)}</small>${esc(text)}` : esc(text);
  t.classList.toggle("bad", kind === "bad");
  t.classList.toggle("good", kind === "good");
  t.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), ms);
}

/** A big word in the middle of the screen: «САЛЬТО!», «+1 ДО ВАТАГИ!». */
function pop(text: string, kind: "" | "bad" | "ice" = ""): void {
  const p = $("#pop");
  p.textContent = text;
  p.className = "";
  void p.offsetWidth;
  p.className = `show${kind ? ` ${kind}` : ""}`;
}

function wakeAudio(): void {
  A.unlockAudio();
  if (audioOn) return;
  audioOn = true;
  voice.load();
  voice.unlock();
  A.preload();
  if (A.music.mode === "off") A.music.mode = "home";
  A.music.start();
}

function runOptions() {
  return {
    hero: selHero, ride: selRide, frost: selFrost, neighbor: level(meta, "neighbor"), backpack: level(meta, "backpack"),
    mitt4: level(meta, "mitt4") > 0, map: level(meta, "map") > 0,
  };
}

// ================================================================ menu

function bars(a: number, b: number): string {
  return `<span class="ride-bars">ШВИДК.<span><i style="width:${a * 100}%"></i></span>КЕРУВ.<span><i style="width:${b * 100}%"></i></span></span>`;
}

function buyButton(owned: boolean, price: number, name: string, b: HTMLButtonElement, onBuy: () => void, onPick: () => void, text: string): void {
  b.addEventListener("click", () => {
    wakeAudio();
    if (owned) { onPick(); return; }
    setText($("#pick-text"), `${name}: ${text}`);
    if (meta.bank < price) { toast(`Треба ${candies(price)}, у коморі ${candies(meta.bank)}.`, "НЕ ВИСТАЧАЄ", "bad"); return; }
    if (b.dataset.confirm) {
      meta.bank -= price;
      onBuy();
      saveMeta(meta);
      A.synth("coin");
      toast(`${name} — тепер твоє.`, "КУПЛЕНО", "good");
      renderMenu();
    } else {
      b.dataset.confirm = "1";
      const pr = b.querySelector(".price");
      if (pr) pr.textContent = "КУПИТИ?";
    }
  });
}

function renderMenu(): void {
  const heroes = $("#hero-list");
  heroes.innerHTML = "";
  for (const h of HEROES) {
    const owned = meta.heroes.includes(h.id);
    const b = document.createElement("button");
    b.className = `trait${h.id === selHero ? " on" : ""}${owned ? "" : " locked"}`;
    b.innerHTML = `<b>${esc(h.name)}</b>${owned ? "" : `<span class="price">${candies(h.price)}</span>`}`;
    buyButton(owned, h.price, h.name, b, () => { meta.heroes.push(h.id); selHero = h.id; }, () => { selHero = h.id; renderMenu(); menuBackdrop(); }, h.text);
    heroes.append(b);
  }
  const rides = $("#ride-list");
  rides.innerHTML = "";
  const forced = selHero === "hanna";
  for (const r of RIDES) {
    const owned = meta.rides.includes(r.id);
    const on = forced ? r.id === "nochvy" : r.id === selRide;
    const b = document.createElement("button");
    b.className = `trait${on ? " on" : ""}${owned ? "" : " locked"}`;
    b.innerHTML = `<b>${esc(r.name)}</b>${bars(r.bars[0], r.bars[1])}${owned ? "" : `<span class="price">${candies(r.price)}</span>`}`;
    if (forced && r.id !== "nochvy") b.disabled = true;
    buyButton(owned, r.price, r.name, b, () => { meta.rides.push(r.id); selRide = r.id; }, () => { selRide = r.id; renderMenu(); menuBackdrop(); setText($("#pick-text"), `${r.name}: ${r.text}`); }, r.text);
    rides.append(b);
  }
  const hero = HEROES.find((h) => h.id === selHero)!;
  setText($("#pick-text"), `${hero.name}: ${hero.text}`);
  const frost = $("#frost-list");
  frost.innerHTML = "";
  for (let f = 0; f <= MAX_FROST; f++) {
    const b = document.createElement("button");
    const locked = f > meta.maxFrost;
    b.className = `heat${f === selFrost ? " on" : ""}${locked ? " locked" : ""}`;
    b.textContent = f === 0 ? "0" : "★".repeat(f);
    b.style.fontSize = f > 2 ? "10px" : "";
    b.disabled = locked;
    b.setAttribute("aria-label", `Мороз ${f}`);
    b.addEventListener("click", () => { selFrost = f; renderMenu(); });
    frost.append(b);
  }
  setText($("#frost-text"), `${FROST_TEXT[selFrost]}${selFrost ? ` · швидше, щільніше, цукерок +${selFrost * 25}%` : ""}${meta.maxFrost < MAX_FROST ? " · доїдь до бабусі, щоб відкрити наступну ★" : ""}`);
  $("#continue-btn").classList.toggle("hidden", !run);
  if (run) setText($("#continue-btn"), `ПРОДОВЖИТИ · СПУСК ${Math.min(run.row + 1, ROUTE_ROWS)}/${ROUTE_ROWS}`);
  setText($("#meta-line"), `У коморі: ${candies(meta.bank)} · забігів: ${meta.runs} · до бабусі: ${meta.wins} · найбільша ватага: ${meta.bestCrew}`);
}

function renderStore(): void {
  setText($("#store-bank"), `У коморі: ${num(meta.bank)}`);
  const list = $("#store-list");
  list.innerHTML = "";
  for (const u of UPGRADES) {
    const lv = level(meta, u.id);
    const max = lv >= u.prices.length;
    const price = max ? 0 : u.prices[lv];
    const row = document.createElement("div");
    row.className = "store-item";
    row.innerHTML = `<div><span class="lvl">${u.prices.length > 1 ? `РІВЕНЬ ${lv}/${u.prices.length}` : lv ? "Є" : "НЕМА"}</span><b>${esc(u.name)}</b><small>${esc(u.text)}</small></div>`;
    const b = document.createElement("button");
    b.textContent = max ? "ВЖЕ Є" : `${num(price)} 🍬`;
    b.disabled = max;
    b.addEventListener("click", () => {
      if (meta.bank < price) { toast(`Треба ${candies(price)}.`, "НЕ ВИСТАЧАЄ", "bad"); return; }
      meta.bank -= price;
      meta.upgrades[u.id] = lv + 1;
      saveMeta(meta);
      A.synth("coin");
      toast(u.name, "КУПЛЕНО", "good");
      renderStore();
    });
    row.append(b);
    list.append(row);
  }
}

function newGame(): void {
  wakeAudio();
  run = newRun((Math.random() * 1e9) | 0, runOptions());
  meta.lastHero = selHero;
  meta.lastRide = selRide;
  meta.lastFrost = selFrost;
  saveMeta(meta);
  saveRun(run);
  showMap();
}

// ================================================================ the route map

function showMap(): void {
  if (!run) return;
  mode = "map";
  $("#hud").classList.add("hidden");
  const nodes = run.map;
  const next = new Set(choices(run).map((n) => n.id));
  setText($("#map-eyebrow"), `МАРШРУТ · СПУСК ${Math.min(run.row + 1, ROUTE_ROWS)} / ${ROUTE_ROWS}${run.frost ? ` · МОРОЗ ${"★".repeat(run.frost)}` : ""}`);
  $("#map-stats").innerHTML = [
    [`${"❤️".repeat(run.hearts)}${"🤍".repeat(Math.max(0, run.maxHearts - run.hearts))}`, "СЕРЦЯ"], [`×${run.crew}/${crewMax(run)}`, "ВАТАГА"], [num(run.coins), "ЦУКЕРКИ"],
  ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("");
  const map = $("#map");
  const H = 520;
  const rowY = (r: number) => 26 + r * ((H - 92) / (ROUTE_ROWS - 1));
  const colX = (n: { row: number; col: number }) => ((n.col + 0.5) / nodes.filter((m) => m.row === n.row).length) * 100;
  const lines: string[] = [];
  for (const n of nodes) for (const id of n.next) {
    const m = nodes[id];
    const taken = run.path.includes(n.id) && run.path.includes(m.id);
    const open = n.id === run.at && next.has(m.id);
    lines.push(`<line x1="${colX(n)}" y1="${rowY(n.row)}" x2="${colX(m)}" y2="${rowY(m.row)}" stroke="${taken ? "#f2b632" : open ? "#e7ddc6" : "#4a5068"}" stroke-width="${taken || open ? 4 : 3}" stroke-dasharray="${taken ? "0" : "2 7"}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`);
  }
  map.innerHTML = `<svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true">${lines.join("")}</svg>`;
  for (const n of nodes) {
    const b = document.createElement("button");
    const done = run.path.includes(n.id) && n.id !== run.at;
    const here = n.id === run.at;
    const can = next.has(n.id);
    const known = n.row < run.row + run.sight || run.path.includes(n.id);
    const t = THEMES[n.theme];
    const m = MODS[n.mod];
    const icon = n.mod === "fair" && known ? "🎪" : THEME_ICON[n.theme];
    b.className = `node${done ? " done" : ""}${here ? " here" : ""}${can ? " next" : ""}${!can && !done && !here ? " far" : ""}`;
    b.style.left = `${colX(n)}%`;
    b.style.top = `${rowY(n.row)}px`;
    b.disabled = !can;
    const badge = known ? (n.mod !== "none" && n.mod !== "fair" ? m.icon : "") : "❔";
    const title = n.mod === "fair" && known ? "ЯРМАРОК" : t.title;
    const sub = known ? (n.mod === "none" ? t.sub : n.mod === "fair" ? "рукавиці за цукерки" : m.name) : t.sub;
    b.innerHTML = `<span class="dot">${icon}</span>${badge ? `<span class="badge">${badge}</span>` : ""}<b>${esc(title)}</b><small>${esc(sub)}</small>`;
    b.setAttribute("aria-label", `${title}. ${sub}`);
    if (can) b.addEventListener("click", () => pickNode(n.id));
    map.append(b);
  }
  setText($("#map-hint"), next.size > 1 ? "Обирай наступну гірку. ❄️ хуртовина · 💧 відлига · ⭐ колядники · 🎪 ярмарок" : "Тисни на жовту гірку, щоб їхати далі.");
  showScreen("#map-screen");
  menuStageIfNeeded();
}

/** Keep a slope behind the map so the 3D world is not empty. */
function menuStageIfNeeded(): void {
  if (!st) menuBackdrop();
}

function pickNode(id: number): void {
  if (!run) return;
  A.synth("click");
  const node = chooseNode(run, id);
  saveRun(run);
  if (node.mod === "fair") showFair();
  else stageIntro();
}

// ================================================================ the fair

function showFair(): void {
  if (!run || !run.fair) return;
  mode = "fair";
  setText($("#fair-coins"), `Цукерок із собою: ${num(run.coins)}`);
  const list = $("#fair-list");
  list.innerHTML = "";
  run.fair.forEach((f, i) => {
    const p = perkById(f.id);
    const b = document.createElement("button");
    const cant = run!.coins < f.price;
    b.className = `perk mitt${cant ? " cant" : ""}`;
    b.innerHTML = `${mittSvg(MITT_COLORS[i % MITT_COLORS.length])}<div><b>${esc(p.name)}</b><small>${esc(p.text)}</small></div><span class="price-tag">${num(f.price)} 🍬</span>`;
    b.addEventListener("click", () => {
      if (!run) return;
      if (!buyFair(run, f.id)) { toast("Не вистачає цукерок.", "ЯРМАРОК", "bad"); return; }
      A.synth("coin");
      toast(p.name, "КУПЛЕНО", "good");
      saveRun(run);
      showFair();
    });
    list.append(b);
  });
  showScreen("#fair-screen");
}

function mittSvg(color: string): string {
  return `<svg viewBox="0 0 60 70" width="40" height="46" aria-hidden="true"><path d="M14 66 L14 30 C14 14 22 6 32 6 C42 6 48 14 48 28 L48 66 Z" fill="${color}" stroke="#151316" stroke-width="3" stroke-linejoin="round"/><path d="M14 36 C4 34 2 22 10 20 C14 19 16 24 16 30" fill="${color}" stroke="#151316" stroke-width="3" stroke-linejoin="round"/><rect x="12" y="54" width="38" height="12" fill="#f6f3ec" stroke="#151316" stroke-width="3"/><path d="M22 26 L26 22 L30 26 L34 22 L38 26 M22 36 L26 32 L30 36 L34 32 L38 36" fill="none" stroke="#f6f3ec" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
}

// ================================================================ a slope

function stageIntro(): void {
  if (!run) return;
  mode = "intro";
  st = startStage(run);
  scene.setStage(st, run);
  const def = THEMES[st.theme];
  const m = MODS[st.mod];
  setText($("#stage-eyebrow"), `СПУСК ${run.row + 1} / ${ROUTE_ROWS}${run.frost ? ` · МОРОЗ ${"★".repeat(run.frost)}` : ""}`);
  setText($("#stage-title"), def.title);
  setText($("#stage-sub"), def.sub);
  setText($("#stage-intro"), def.intro);
  const mod = $("#stage-mod");
  mod.classList.toggle("hidden", st.mod === "none");
  setText(mod, st.mod === "none" ? "" : `${m.icon} ${m.name}: ${m.text}`);
  setText($("#stage-goal"), `${def.finish} · ${def.length} м · ватага ×${st.kids.length}`);
  showScreen("#stage-screen");
  $("#hud").classList.add("hidden");
}

// ---------------------------------------------------------------- the push-off

const BEATS = [0.55, 1.1, 1.65];
const WINDOW = 0.3;
let launchT = 0;
/** Wall-clock start of the push-off (minus time spent paused). */
let launchStart = 0;
let pausedAt = 0;
let beatScore = [0, 0, 0];
let beatDone = [false, false, false];
let beatPlayed = [false, false, false];

function beginLaunch(): void {
  if (!st || !run) return;
  wakeAudio();
  scene.startRun();
  mode = "launch";
  paused = false;
  showScreen(null);
  launchT = 0;
  launchStart = performance.now();
  beatScore = [0, 0, 0];
  beatDone = [false, false, false];
  beatPlayed = [false, false, false];
  for (let i = 0; i < 3; i++) $(`#beat-${i}`).className = "";
  setText($("#launch-note"), "");
  $("#launch").classList.remove("hidden");
  A.music.mode = "outing";
}

function push(): void {
  if (mode !== "launch" || paused) return;
  launchT = (performance.now() - launchStart) / 1000;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < 3; i++) {
    if (beatDone[i]) continue;
    const d = Math.abs(launchT - BEATS[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  navigator.vibrate?.(12);
  if (best < 0 || bestD > WINDOW) { A.synth("miss"); return; }
  beatDone[best] = true;
  beatScore[best] = Math.max(0, 1 - bestD / WINDOW);
  $(`#beat-${best}`).className = beatScore[best] > 0.35 ? "hit" : "miss";
  A.synth("hit");
}

function tickLaunch(): void {
  launchT = (performance.now() - launchStart) / 1000;
  for (let i = 0; i < 3; i++) {
    if (!beatPlayed[i] && launchT >= BEATS[i]) {
      beatPlayed[i] = true;
      A.beat(i);
      if (!beatDone[i]) $(`#beat-${i}`).className = "on";
    }
    if (!beatDone[i] && launchT > BEATS[i] + WINDOW) { beatDone[i] = true; $(`#beat-${i}`).className = "miss"; }
  }
  if (launchT >= BEATS[2] + WINDOW + 0.05) {
    const q = (beatScore[0] + beatScore[1] + beatScore[2]) / 3;
    $("#launch").classList.add("hidden");
    startRide(q);
  }
}

function startRide(q: number): void {
  if (!st || !run) return;
  mode = "run";
  $("#hud").classList.remove("hidden");
  $("#test-btn").classList.toggle("hidden", !testMode);
  queue.length = 0;
  hintT = run.row === 0 && run.history.length === 0 ? 5 : 0;
  rampHinted = run.history.length > 0;
  setText($("#h-stage"), THEMES[st.theme].title);
  handleEvents(launch(st, run, q));
  pop(q >= 0.85 ? "ГОП! ІДЕАЛЬНО!" : q >= 0.5 ? "ГОП!" : "ПОЇХАЛИ…");
  A.whoosh();
  A.hiss.start();
  if (q >= 0.85) A.trick();
  voice.say(HERO_LINES.go, "me");
}

// ---------------------------------------------------------------- events

function handleEvents(evs: Ev[]): void {
  if (!st || !run) return;
  for (const e of evs) {
    scene.onEvent(e, st);
    switch (e.kind) {
      case "candy": A.sample("coin", 0.45); break;
      case "kid": {
        A.bells(e.n);
        pop("+1 ДО ВАТАГИ!");
        const c = $("#h-crew");
        c.classList.remove("bump");
        void c.offsetWidth;
        c.classList.add("bump");
        setTimeout(() => c.classList.remove("bump"), 180);
        if (kidLineT <= 0) { voice.say(pickOne(KID_LINES), "npc"); kidLineT = 5; }
        break;
      }
      case "kidFull": pop("ВАТАГА ПОВНА! +🍬"); A.sample("coin", 0.6, 1.3); break;
      case "jump": A.sample("jump", 0.6); break;
      case "land": A.sample("land", 0.5); break;
      case "duck": A.synth("vault"); break;
      case "ramp":
        A.whoosh();
        if (!rampHinted) { rampHinted = true; toast("У повітрі свайп ↑ — сальто. Не встигнеш докрутити — гепнешся.", "ТРАМПЛІН", "good", 2600); }
        break;
      case "flip": A.whoosh(); break;
      case "trick": A.trick(); pop(`САЛЬТО! +${e.n} 🍬`); if (Math.random() < 0.3) voice.say(HERO_LINES.trick, "me"); break;
      case "badFlip": pop("НЕ ДОКРУТИВ!", "bad"); break;
      case "stumble": A.sample("fall", 0.6); toast(`Застряг: ${e.what}`, "", "bad", 1200); navigator.vibrate?.(30); break;
      case "crash":
        A.sample("impact", 1);
        A.sample("break", 0.5);
        toast(e.lost ? `${e.what}! З санок злетіло дітей: ${e.lost}` : `Бах! ${e.what}`, `СЕРЦЯ: ${run.hearts}`, "bad", 1800);
        navigator.vibrate?.([60, 30, 80]);
        voice.say(HERO_LINES.crash, "me");
        break;
      case "bounce":
        A.sample("impact", 0.6, 1.3);
        toast(`Відскочив від: ${e.what}${e.lost ? ` · −${e.lost} з ватаги` : ""}`, "", "bad", 1300);
        break;
      case "saved":
        A.sample("break", 0.7);
        if (e.by === "petard") pop("НАСКРІЗЬ!");
        else toast("Вушанка вберегла серце.", "", "good", 1500);
        break;
      case "tail": {
        A.tailLost(e.lost);
        toast(`Хвіст зачепив: ${e.what}. −${e.lost} ${e.lost === 1 ? "дитина" : "дітей"}`, "ПОВЕРТАЙ РАНІШЕ", "bad", 1700);
        const c = $("#h-crew");
        c.classList.add("hurt");
        setTimeout(() => c.classList.remove("hurt"), 500);
        voice.say(pickOne(LOST_LINES), "npc");
        navigator.vibrate?.(40);
        break;
      }
      case "power": {
        const p = PICKUPS[e.id];
        if (e.id === "petard") A.petard();
        else A.powerUp();
        if (e.id === "star") A.bells(st.kids.length);
        toast(p.text, p.name.toUpperCase(), "good", 1800);
        break;
      }
      case "powerEnd": A.powerDown(); break;
      case "zone": pop(e.zone === "ice" ? "КОВЗАНКА!" : "СЛЬОТА…", e.zone === "ice" ? "ice" : "bad"); break;
      case "slip": A.sample("skid", 0.3, 1.4); break;
      case "bump": A.sample("impact", 0.3, 1.4); break;
      case "launch": break;
      case "over": onOver(); return;
      case "finish": onFinish(); return;
      case "zoneEnd": break;
    }
  }
}

function onOver(): void {
  if (!st || !run) return;
  mode = "over";
  A.stopLoops();
  A.synth("fail");
  $("#hud").classList.add("hidden");
  $("#toast").classList.remove("show");
  pop("У КУЧУГУРІ!", "bad");
  setTimeout(() => endRun(), 2000);
}

function onFinish(): void {
  if (!st || !run) return;
  const done = st;
  const bonus = deliveryBonus(done, run);
  const def = THEMES[done.theme];
  A.stopLoops();
  A.synth("win");
  A.bells(done.kids.length);
  const { last } = finishStage(run, done);
  saveRun(run.ending ? null : run);
  $("#hud").classList.add("hidden");
  mode = "perk";
  if (last) {
    voice.say(HERO_LINES.home, "me");
    setTimeout(() => endRun(), 1600);
    mode = "end";
    return;
  }
  setTimeout(() => {
    if (!run) return;
    setText($("#perk-title"), `${def.title}: ПРОЙДЕНО`);
    $("#perk-stats").innerHTML = [
      [num(done.coins), "ЗІБРАНО"], [`+${num(bonus)}`, `ЗА ДІТЕЙ (×${done.kids.length})`], [num(run.coins), "ЗА ЗАБІГ"],
    ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("");
    const list = $("#perk-list");
    list.innerHTML = "";
    (run.offer ?? []).forEach((id, i) => {
      const p = perkById(id);
      const b = document.createElement("button");
      b.className = "perk mitt";
      const n = run!.perks.filter((x) => x === id).length;
      b.innerHTML = `${mittSvg(MITT_COLORS[i % MITT_COLORS.length])}<div><b>${esc(p.name)}${n ? ` ×${n + 1}` : ""}</b><small>${esc(p.text)}</small></div>`;
      b.addEventListener("click", () => takePerk(id));
      list.append(b);
    });
    showScreen("#perk-screen");
  }, 1300);
}

function takePerk(id: PerkId | null): void {
  if (!run) return;
  A.synth("click");
  choosePerk(run, id);
  saveRun(run);
  showMap();
}

function endRun(): void {
  if (!run) return;
  A.stopLoops();
  if (!run.ending && st) loseRun(run, st);
  const home = run.ending === "home";
  const ending = ENDINGS[run.ending ?? "drift"];
  const { frostUnlocked } = bankRun(meta, run);
  saveRun(null);
  mode = "end";
  $("#hud").classList.add("hidden");
  $("#launch").classList.add("hidden");
  setText($("#end-sticker"), ending.sticker);
  $("#end-sticker").style.background = home ? "var(--acid)" : "";
  $("#end-sticker").style.color = home ? "var(--ink)" : "";
  setText($("#end-title"), ending.title);
  setText($("#end-text"), home ? ending.text : DRIFT_TEXT[run.endTheme ?? "yard"]);
  const path = run.path.map((id) => run!.map[id]);
  $("#end-route").innerHTML = path.map((n, i) => {
    const ok = home || i < path.length - 1;
    const label = n.mod === "fair" ? "ЯРМАРОК" : THEME_SHORT[n.theme];
    return `<i class="${ok ? "ok" : "fail"}">${esc(label)}</i>`;
  }).join("");
  $("#end-stats").innerHTML = [
    [`${home ? ROUTE_ROWS : Math.max(0, run.path.length - 1)}/${ROUTE_ROWS}`, "МАРШРУТУ"], [num(run.coins), "ЦУКЕРОК"], [`×${run.bestCrew}`, "НАЙБІЛЬША ВАТАГА"], [`${run.tricks}`, "САЛЬТО"],
  ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("");
  const lines: string[] = [];
  if (frostUnlocked) lines.push(`Відкрито мороз ${"★".repeat(meta.maxFrost)}: швидше, щільніше, солодше.`);
  const nextRide = RIDES.find((r) => !meta.rides.includes(r.id));
  if (nextRide) lines.push(meta.bank >= nextRide.price ? `Вистачає на «${nextRide.name}» — купи в меню.` : `До «${nextRide.name}»: ще ${candies(nextRide.price - meta.bank)}.`);
  lines.push(`У коморі: ${candies(meta.bank)}.`);
  setText($("#end-unlock"), lines.join(" "));
  A.synth(home ? "win" : "fail");
  A.music.mode = "home";
  showScreen("#end-screen");
  run = null;
}

function toMenu(): void {
  A.stopLoops();
  A.music.mode = "home";
  mode = "menu";
  paused = false;
  $("#hud").classList.add("hidden");
  $("#launch").classList.add("hidden");
  $("#test-btn").classList.add("hidden");
  renderMenu();
  showScreen("#start-screen");
  menuBackdrop();
}

function menuBackdrop(): void {
  const demo = newRun(1, { hero: selHero, ride: selRide, neighbor: 2 });
  chooseNode(demo, demo.map[0].id);
  st = startStage(demo);
  scene.setStage(st, demo);
}

// ================================================================ pause

function setPaused(v: boolean): void {
  if (mode !== "run" && mode !== "launch") return;
  if (mode === "launch") {
    if (v) pausedAt = performance.now();
    else if (paused) launchStart += performance.now() - pausedAt;
  }
  paused = v;
  showScreen(v ? "#pause-screen" : null);
  if (v) A.hiss.set(0, false);
  syncToggles();
}

const GFX: Quality[] = ["low", "medium", "high"];
const GFX_NAME: Record<Quality, string> = { low: "НИЗЬКА", medium: "СЕРЕДНЯ", high: "ВИСОКА" };
function syncToggles(): void {
  setText($("#sound-btn"), `ЗВУКИ: ${A.isMuted() ? "ВИМК" : "ВКЛ"}`);
  setText($("#music-btn"), `МУЗИКА: ${A.isMusicMuted() ? "ВИМК" : "ВКЛ"}`);
  setText($("#voice-btn"), `ГОЛОСИ: ${voice.on ? "ВКЛ" : "ВИМК"}`);
  setText($("#gfx-btn"), `ГРАФІКА: ${GFX_NAME[scene.quality]}`);
}

// ================================================================ input

function enqueue(i: Input): void {
  if (mode !== "run" || paused) return;
  if (queue.length < 3) queue.push(i);
  hintT = Math.min(hintT, 0.6);
}

let sx = 0;
let sy = 0;
let tracking = false;
let lastDir = "";
const SWIPE = 24;
window.addEventListener("pointerdown", (e) => {
  if ((e.target as HTMLElement).closest("button, .screen, #test-panel")) return;
  if (mode === "launch" && !paused) { push(); return; }
  tracking = true;
  lastDir = "";
  sx = e.clientX;
  sy = e.clientY;
}, { passive: true });
window.addEventListener("pointermove", (e) => {
  if (!tracking) return;
  const dx = e.clientX - sx;
  const dy = e.clientY - sy;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "r" : "l") : dy > 0 ? "d" : "u";
  sx = e.clientX;
  sy = e.clientY;
  if (dir === lastDir) return;
  lastDir = dir;
  swipe(dir);
}, { passive: true });
window.addEventListener("pointerup", () => { tracking = false; }, { passive: true });
window.addEventListener("pointercancel", () => { tracking = false; }, { passive: true });

function swipe(d: "l" | "r" | "u" | "d"): void {
  if (d === "l") enqueue({ dx: -1 });
  else if (d === "r") enqueue({ dx: 1 });
  else if (d === "u") enqueue({ jump: true });
  else enqueue({ duck: true });
}

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === "p" || k === "escape") { setPaused(!paused); return; }
  if (mode === "launch" && (k === " " || k === "enter" || k === "arrowup" || k === "w")) { push(); e.preventDefault(); return; }
  if (mode === "intro" && (k === " " || k === "enter")) { beginLaunch(); e.preventDefault(); return; }
  if (k === "arrowleft" || k === "a") swipe("l");
  else if (k === "arrowright" || k === "d") swipe("r");
  else if (k === "arrowup" || k === "w" || k === " ") swipe("u");
  else if (k === "arrowdown" || k === "s" || k === "shift") swipe("d");
  else return;
  e.preventDefault();
});

document.addEventListener("visibilitychange", () => { if (document.hidden && (mode === "run" || mode === "launch")) setPaused(true); });

// ================================================================ HUD

function hud(): void {
  if (!st || !run) return;
  const k = Math.min(1, st.dist / st.length);
  ($("#h-progress") as HTMLElement).style.transform = `scaleX(${k})`;
  ($("#h-sled") as HTMLElement).style.left = `${k * 100}%`;
  setText($("#h-coins"), num(run.coins + st.coins));
  setText($("#h-crew-n"), `×${st.kids.length}/${st.crewMax}`);
  const hearts = $("#h-hearts");
  const hk = `${run.hearts}/${run.maxHearts}`;
  if (hearts.dataset.k !== hk) {
    hearts.dataset.k = hk;
    hearts.innerHTML = Array.from({ length: run.maxHearts }, (_, i) => `<span class="${i < run!.hearts ? "" : "empty"}">❤️</span>`).join("");
  }
  const z = $("#h-zone");
  z.classList.toggle("hidden", !st.zone);
  z.classList.toggle("slush", st.zone === "slush");
  setText(z, st.zone === "ice" ? "ЛІД · НЕ ПОВЕРНЕШ" : st.zone === "slush" ? "СЛЬОТА" : "");
  const pw = $("#h-power");
  if (st.power) {
    pw.classList.remove("hidden");
    const p = PICKUPS[st.power];
    setText($("#h-power-icon"), p.icon);
    setText($("#h-power-name"), p.name.toUpperCase());
    ($("#h-power-t") as HTMLElement).style.transform = `scaleX(${Math.max(0, st.powerT / st.powerMax)})`;
  } else pw.classList.add("hidden");
  $("#frost-edge").classList.toggle("on", run.hearts <= 1);
  $("#speed-lines").classList.toggle("on", st.power === "petard" || st.zone === "ice");
  const sh = $("#swipe-hint");
  if (hintT > 0) {
    sh.classList.remove("hidden");
    setText(sh, "СВАЙП ← → · ↑ СТРИБОК · ↓ ЛЯГТИ");
  } else sh.classList.add("hidden");
}

// ================================================================ loop

let last = performance.now();
function logic(dt: number): void {
  if (kidLineT > 0) kidLineT -= dt;
  if (!st || paused) return;
  if (mode === "run") {
    const input = queue.shift() ?? {};
    if (god) run!.hearts = run!.maxHearts;
    const evs = step(st, run!, dt, input);
    handleEvents(evs);
    if (mode === "run") {
      hud();
      A.hiss.set(st.y < 0.05 ? Math.min(1, st.speed / 15) : 0, st.zone === "ice");
      A.music.intensity = Math.min(1, 0.35 + st.kids.length / 12);
    }
    if (hintT > 0) hintT -= dt;
  } else if (mode === "launch") {
    tickLaunch();
  }
  scene.update(st, run ?? newRun(1), dt);
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  logic(dt);
  scene.render(dt);
  requestAnimationFrame(frame);
}

// ================================================================ wiring

$("#new-btn").addEventListener("click", () => { run = null; saveRun(null); newGame(); });
$("#continue-btn").addEventListener("click", () => {
  wakeAudio();
  if (!run) return;
  if (run.fair) showFair();
  else showMap();
});
$("#store-btn").addEventListener("click", () => { wakeAudio(); mode = "store"; renderStore(); showScreen("#store-screen"); });
$("#store-back").addEventListener("click", toMenu);
$("#stage-go").addEventListener("click", beginLaunch);
$("#push-btn").addEventListener("pointerdown", (e) => { e.preventDefault(); push(); });
$("#perk-skip").addEventListener("click", () => takePerk(null));
$("#fair-leave").addEventListener("click", () => { if (!run) return; A.synth("click"); leaveFair(run); saveRun(run); showMap(); });
$("#end-btn").addEventListener("click", () => newGame());
$("#end-menu").addEventListener("click", toMenu);
$("#pause-btn").addEventListener("click", () => setPaused(true));
$("#resume-btn").addEventListener("click", () => setPaused(false));
$("#quit-btn").addEventListener("click", () => {
  paused = false;
  showScreen(null);
  if (st && run) { run.hearts = 0; st.over = true; endRun(); }
});
$("#sound-btn").addEventListener("click", () => { A.setMuted(!A.isMuted()); syncToggles(); });
$("#music-btn").addEventListener("click", () => { A.setMusicMuted(!A.isMusicMuted()); syncToggles(); });
$("#voice-btn").addEventListener("click", () => { voice.on = !voice.on; syncToggles(); });
$("#gfx-btn").addEventListener("click", () => { scene.setQuality(GFX[(GFX.indexOf(scene.quality) + 1) % 3]); syncToggles(); });

// test menu
if (testMode) {
  const grid = $("#test-stages");
  (Object.keys(THEMES) as Theme[]).forEach((t) => {
    const b = document.createElement("button");
    b.textContent = `${THEME_ICON[t]} ${THEME_SHORT[t]}`;
    b.addEventListener("click", () => {
      $("#test-panel").classList.add("hidden");
      if (!run) run = newRun((Math.random() * 1e9) | 0, runOptions());
      const node = run.map.find((n) => n.theme === t && n.mod !== "fair") ?? run.map[0];
      run.at = node.id;
      run.row = node.row;
      run.ending = null;
      paused = false;
      stageIntro();
    });
    grid.append(b);
  });
  $("#test-btn").addEventListener("click", () => { $("#test-panel").classList.remove("hidden"); paused = true; });
  $("#test-close").addEventListener("click", () => { $("#test-panel").classList.add("hidden"); paused = false; });
  for (const b of document.querySelectorAll<HTMLButtonElement>("#test-panel [data-t]")) {
    b.addEventListener("click", () => {
      const t = b.dataset.t!;
      if (t === "money") { meta.bank += 10000; saveMeta(meta); renderMenu(); }
      if (st && run) {
        if (t === "sack" || t === "petard") { st.power = t; st.powerT = st.powerMax = PICKUPS[t].secs; }
        if (t === "star") for (let i = 0; i < 2 && st.kids.length < st.crewMax; i++) st.kids.push({ x: st.x, look: Math.random() });
        if (t === "thermos") run.hearts = Math.min(run.maxHearts, run.hearts + 1);
        if (t === "kids") while (st.kids.length < st.crewMax) st.kids.push({ x: st.x, look: Math.random() });
        if (t === "finish") st.dist = st.length - 30;
      }
      if (t === "god") { god = !god; b.classList.toggle("on", god); }
      $("#test-panel").classList.add("hidden");
      paused = false;
    });
  }
  $("#test-btn").classList.remove("hidden");
  // for screenshots on slow machines: run the game forward in fixed steps
  Object.assign((window as unknown as { __zhirky: object }).__zhirky, {
    advance(sec: number) { for (let t = 0; t < sec; t += 1 / 30) logic(1 / 30); },
    skipLaunch(q = 1) { if (mode === "launch") { $("#launch").classList.add("hidden"); startRide(q); } },
  });
}

renderMenu();
syncToggles();
menuBackdrop();
void scene.load().then(() => { if (mode === "menu") menuBackdrop(); else if (st && run && mode === "intro") scene.setStage(st, run); });
requestAnimationFrame(frame);
