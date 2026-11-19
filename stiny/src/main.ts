import "./stiny.css";
import { Scene3D } from "./Scene3D.ts";
import * as A from "./audio.ts";
import {
  ENDINGS, PERKS, PLACE_LABELS, SEASONS, SEASON_DEFS, THOUGHTS, TRAITS, actionById, perkById, seasonName,
  type ActionId, type PlaceId, type TraitId,
} from "./content.ts";
import {
  actionsAt, beginAction, busHere, choosePerk, startDay, clockText, despair, endDay, fmt, has, hasWater, interruptAction, isLight, isNight,
  dailySeed, maxPsyche, newRun, peep, resolveBallistic, resolveDelivery, resolveKnock, resolveMom, resolveNeighbor, resolveSlam, tick, unlockedTraits,
  yearIndex, type ActionResult, type DayEvent, type Msg, type Outcome, type RunState, type SeasonReport,
} from "./sim.ts";
import { bankRun, loadMeta, loadRun, saveMeta, saveRun } from "./save.ts";
import { detectLang, getLang, nameOf, num, saveLang, tr, type Lang } from "./i18n.ts";
import { applyContentLang } from "./content.en.ts";
import { H, buzz, setVibe, supported as vibeSupported, vibeOn } from "./haptics.ts";
import { renderCard, shareResult, type RunResult } from "./share.ts";

applyContentLang(detectLang());

function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing UI element: ${sel}`);
  return el;
}
const setText = (el: HTMLElement, v: string) => { if (el.textContent !== v) el.textContent = v; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const scene = new Scene3D($("#shell"));
const amb = new A.Ambience();
const score = new A.Score();
const meta = loadMeta();
let run: RunState | null = loadRun();
let selected: TraitId = unlockedTraits(meta.seasons).includes(meta.lastTrait) ? meta.lastTrait : "it";
/** An async flow (event, minigame, dialog) is running: time stands still. */
let handling = false;
let mode: "menu" | "day" | "screen" = "menu";
let paused = false;
let near: PlaceId | null = null;
let panelKey = "";
let panelT = 0;
let thoughtT = 8;
let heartT = 0;
let buzzT = 0;
let ballisticOn = false;
let audioOn = false;
/** The last finished run, for the share card (drawn as soon as the run ends). */
let lastResult: RunResult | null = null;
let lastCard: Promise<Blob | null> | null = null;
Object.assign(window as unknown as Record<string, unknown>, { __stiny: { scene, get run() { return run; }, set run(v: RunState | null) { run = v; } } });

// ================================================================ small UI helpers

const SCREENS = ["#start-screen", "#season-screen", "#phone-screen", "#summary-screen", "#perk-screen", "#end-screen", "#pause-screen"];
function showScreen(id: string | null): void {
  for (const s of SCREENS) $(s).classList.toggle("active", s === id);
}

let toastTimer = 0;
function toast(text: string, from = "", bad = false, ms = 2600): void {
  const t = $("#toast");
  t.innerHTML = from ? `<small>${esc(from)}</small>${esc(text)}` : esc(text);
  t.classList.toggle("bad", bad);
  t.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), ms);
}

interface Choice { id: string; label: string; sub?: string; cls?: string }
/** A card in the middle of the screen; resolves with the chosen id. */
function note(title: string, text: string, choices: Choice[] = [{ id: "ok", label: tr("ДАЛІ", "NEXT"), cls: "main" }]): Promise<string> {
  return new Promise((resolve) => {
    $("#note-title").textContent = title;
    $("#note-text").textContent = text;
    const box = $("#note-choices");
    box.innerHTML = "";
    for (const c of choices) {
      const b = document.createElement("button");
      b.className = `choice ${c.cls ?? ""}`;
      b.innerHTML = `${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ""}`;
      b.addEventListener("click", () => { $("#note").classList.add("hidden"); A.play("click"); resolve(c.id); });
      box.appendChild(b);
    }
    $("#note").classList.remove("hidden");
  });
}

async function flow<T>(f: () => Promise<T>): Promise<T> {
  handling = true;
  $("#act-panel").classList.add("hidden");
  scene.setMove(0, 0);
  try { return await f(); } finally { handling = false; persist(); }
}

function persist(): void { if (run && !run.ending) saveRun(run); }

// ================================================================ HUD

function updateHud(): void {
  if (!run?.day) return;
  const d = run.day;
  setText($("#h-season"), seasonName(run.season));
  setText($("#h-clock"), clockText(d.clock));
  setText($("#h-days"), num(run.daysInside));
  const ps = Math.round(run.psyche);
  $("#h-psyche").style.transform = `scaleX(${run.psyche / 100})`;
  $("#h-ceiling").style.width = `${100 - maxPsyche(run)}%`;
  setText($("#h-psyche-n"), String(ps));
  document.querySelector(".psyche")!.classList.toggle("low", ps < 25);
  $("#h-energy").style.transform = `scaleX(${run.energy / 100})`;
  $("#h-satiety").style.transform = `scaleX(${run.satiety / 100})`;
  setText($("#h-food"), String(run.food));
  setText($("#h-money"), fmt(run.money));
  $("#h-money").style.color = run.money < 0 ? "#e87a6a" : "";
  setText($("#phone-batt"), `${Math.round(d.phone)}%`);
  $("#phone-badge").classList.toggle("hidden", d.unread === 0);
  const chips: string[] = [];
  if (d.alert) chips.push(`<span class="chip alert">${d.alert.ballistic ? tr("БАЛІСТИКА", "BALLISTIC") : tr("ТРИВОГА", "ALERT")}${d.sheltered ? tr(" · В КОРИДОРІ", " · IN THE CORRIDOR") : ""}</span>`);
  if (!isLight(d)) chips.push(`<span class="chip dark">${tr("БЕЗ СВІТЛА", "NO POWER")}</span>`);
  if (!hasWater(d)) chips.push(`<span class="chip dark">${tr("БЕЗ ВОДИ", "NO WATER")}</span>`);
  if (d.rain) chips.push(`<span class="chip">🌧️ ${tr("ДОЩ", "RAIN")}</span>`);
  if (busHere(d) && d.knowsBus) chips.push(`<span class="chip bad">${tr("БУС У ДВОРІ", "VAN IN THE YARD")}</span>`);
  if (has(run, "station") && !isLight(d)) chips.push(`<span class="chip">🔋 ${Math.round(run.station)}%</span>`);
  if (run.satiety < 20) chips.push(`<span class="chip bad">${tr("ГОЛОД", "HUNGRY")}</span>`);
  if (run.energy < 10) chips.push(`<span class="chip bad">${tr("НЕМАЄ СИЛ", "EXHAUSTED")}</span>`);
  const html = chips.join("");
  if ($("#chips").innerHTML !== html) $("#chips").innerHTML = html;
}

// ================================================================ action panel

function placeEnabled(p: PlaceId): boolean {
  if (!run) return false;
  if (p === "cat") return has(run, "cat");
  if (p === "corridor") return !!run.day?.alert;
  return true;
}

function renderPanel(force = false): void {
  if (!run?.day) return;
  const d = run.day;
  const show = mode === "day" && !handling && !d.busy && !!near && !paused;
  $("#act-panel").classList.toggle("hidden", !show);
  if (!show || !near) { panelKey = ""; return; }
  const list = actionsAt(run, near);
  const key = `${near}|${list.map((a) => `${a.def.id}${a.ok}${a.why ?? ""}`).join(",")}`;
  if (key === panelKey && !force) return;
  panelKey = key;
  setText($("#act-place"), PLACE_LABELS[near].toUpperCase());
  const box = $("#act-list");
  box.innerHTML = "";
  for (const a of list) {
    box.appendChild(actButton(a.def.id, a.ok, a.why));
  }
  if (!list.length) box.innerHTML = `<p class="hint">${tr("Тут нічого не зробиш.", "Nothing to do here.")}</p>`;
}

function actButton(id: ActionId, ok: boolean, why?: string): HTMLButtonElement {
  const def = actionById(id);
  const b = document.createElement("button");
  b.className = `act ${ok ? "" : "no"} ${id === "break_out" ? "dark" : ""}`;
  const mins = def.minutes ? (def.minutes >= 60 ? `${Math.floor(def.minutes / 60)} ${tr("год", "h")}${def.minutes % 60 ? ` ${def.minutes % 60}` : ""}` : `${def.minutes} ${tr("хв", "min")}`) : "";
  b.innerHTML = `<em>${def.icon}</em><div><b>${esc(def.label)}</b><small>${esc(ok ? def.hint : why ?? "")}</small></div><span>${mins}</span>`;
  b.disabled = !ok;
  b.addEventListener("click", () => { if (ok) void doAction(id); });
  return b;
}

// ================================================================ doing things

async function doAction(id: ActionId): Promise<void> {
  if (!run?.day || handling) return;
  A.play("click");
  showScreen(null);
  if (id === "sleep") {
    const early = run.day.clock < 20 * 60;
    if (early) {
      const c = await flow(() => note(tr("ЛІЖКО", "BED"), tr(`Зараз ${clockText(run!.day!.clock)}. Лягти зараз? День просто закінчиться раніше.`, `It's ${clockText(run!.day!.clock)}. Go to bed now? The day will just end earlier.`), [
        { id: "yes", label: tr("ЛЯГТИ", "GO TO BED"), cls: "main" }, { id: "no", label: tr("ЩЕ НІ", "NOT YET") },
      ]));
      if (c !== "yes") return;
    }
    await nightfall();
    return;
  }
  if (id === "break_out") {
    const c = await flow(() => note(tr("ДВЕРІ", "THE DOOR"), tr("Ти взувся. Руки не трусяться — вперше за довгий час. Просто вийти.", "You put your shoes on. Your hands aren't shaking — for the first time in a long while. Just go out."), [
      { id: "go", label: tr("ВИЙТИ", "GO OUT"), cls: "danger" }, { id: "no", label: tr("НІ. ЩЕ НІ.", "NO. NOT YET."), sub: tr("Повернутися в кімнату", "Go back to the room"), cls: "main" },
    ]));
    if (c !== "go") return;
    run.ending = "zryv";
    await finishRun();
    return;
  }
  let s = 1;
  if (id === "work") {
    s = await flow(() => workGame());
  }
  const err = beginAction(run, id, s);
  if (err) { toast(err, "", true); return; }
  $("#act-panel").classList.add("hidden");
  scene.setPose(id);
  if (id === "look") scene.windowView(true);
  if (id === "work") A.play("type");
  if (id === "eat" || id === "cook") A.play("eat");
  if (id === "pet") A.play("purr");
  if (id === "stare") A.sigh();
  const def = actionById(id);
  setText($("#busy-icon"), def.icon);
  setText($("#busy-label"), def.label);
}

async function showResult(r: ActionResult): Promise<void> {
  if (!run) return;
  if (r.view) {
    await flow(() => new Promise<void>((resolve) => {
      $("#window-text").textContent = r.text ?? "";
      $("#window-caption").classList.remove("hidden");
      $("#window-back").onclick = () => { $("#window-caption").classList.add("hidden"); scene.windowView(false); scene.setPose(null); resolve(); };
    }));
    return;
  }
  scene.setPose(null);
  if (r.id === "work" && r.money) A.play("coin");
  const delta = Math.round(r.dPsyche);
  const tail = delta ? `  ${delta > 0 ? "+" : ""}${delta} 🧠` : "";
  if (r.text && r.text.length > 70) await flow(() => note(actionById(r.id).label.toUpperCase(), r.text! + (delta ? `\n\n${tr("Психіка", "Mind")} ${delta > 0 ? "+" : ""}${delta}` : "")));
  else if (r.text) toast(r.text + tail, actionById(r.id).label);
  else if (delta) toast(`${actionById(r.id).label}${tail}`);
  if (r.ending) await finishRun();
}

// ================================================================ minigames

/** Close tickets: stop the marker in the green, five times. */
function workGame(): Promise<number> {
  return new Promise((resolve) => {
    const dsp = run ? despair(run) : 0;
    const box = $("#mini");
    $("#mini-title").textContent = tr("РОБОТА", "WORK");
    $("#mini-prompt").textContent = tr("Закрий таски: тисни, коли маркер у зеленому", "Close the tickets: tap when the marker is in the green");
    $("#mini-body").innerHTML = `<div class="dots">${"<i></i>".repeat(5)}</div><div class="track"><div class="zone"></div><div class="marker"></div></div><button class="big-tap">${tr("ЗАКРИТИ ТАСК", "CLOSE TICKET")}</button>`;
    box.classList.remove("hidden");
    const zone = box.querySelector<HTMLElement>(".zone")!;
    const marker = box.querySelector<HTMLElement>(".marker")!;
    const dots = [...box.querySelectorAll<HTMLElement>(".dots i")];
    let round = 0;
    let hits = 0;
    let t = 0;
    let z0 = 0;
    let zw = 0;
    let pos = 0;
    let last = performance.now();
    let roundT = 0;
    const speed = 1.1 + dsp * 0.9;
    const newRound = () => {
      zw = 0.24 - dsp * 0.1 - round * 0.012;
      z0 = 0.1 + Math.random() * (0.8 - zw);
      zone.style.left = `${z0 * 100}%`;
      zone.style.width = `${zw * 100}%`;
      roundT = 0;
    };
    newRound();
    let raf = 0;
    const end = () => {
      cancelAnimationFrame(raf);
      box.classList.add("hidden");
      resolve(hits / 5);
    };
    const judge = (hit: boolean) => {
      dots[round].classList.add(hit ? "hit" : "miss");
      if (hit) { hits++; A.play("type"); buzz(H.tap, true); } else { A.play("miss"); buzz(H.miss, true); }
      round++;
      if (round >= 5) { setTimeout(end, 250); return; }
      newRound();
    };
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      t += dt * speed;
      roundT += dt;
      // the marker wobbles more when your head is not here
      pos = (Math.sin(t * 2.4) + 1) / 2 + Math.sin(t * 7.3) * 0.03 * dsp;
      marker.style.left = `${Math.max(0, Math.min(1, pos)) * 100}%`;
      if (roundT > 3.2 && round < 5) judge(false);
      if (round < 5) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    box.querySelector<HTMLButtonElement>(".big-tap")!.onpointerdown = (e) => {
      e.preventDefault();
      if (round >= 5) return;
      judge(pos >= z0 && pos <= z0 + zw);
    };
  });
}

/**
 * Behind the door: they knock, then they listen. While they listen, hold your
 * breath (hold the button). Air runs out; if you gasp while they listen, they
 * hear you.
 */
function breathGame(): Promise<boolean> {
  return new Promise((resolve) => {
    const dsp = run ? despair(run) : 0;
    const box = $("#mini");
    $("#mini-title").textContent = tr("СТУКАЮТЬ", "KNOCKING");
    $("#mini-prompt").textContent = tr("Коли слухають — затамуй подих", "When they listen — hold your breath");
    $("#mini-body").innerHTML = `
      <div class="meter-row"><span>${tr("ПОВІТРЯ", "AIR")}</span><div class="bar"><i id="m-air"></i></div></div>
      <div class="meter-row"><span>${tr("ЧУТНО", "HEARD")}</span><div class="bar"><i id="m-noise"></i></div></div>
      <p id="m-state" class="eyebrow" style="text-align:center;font-size:18px;margin:10px 0"></p>
      <button class="big-tap">${tr("ТРИМАЙ — НЕ ДИХАЙ", "HOLD — DON'T BREATHE")}</button>`;
    box.classList.remove("hidden");
    const card = box.querySelector<HTMLElement>(".mini-card")!;
    const btn = box.querySelector<HTMLButtonElement>(".big-tap")!;
    const air = $("#m-air");
    const noiseEl = $("#m-noise");
    const state = $("#m-state");
    let holding = false;
    let a = 1;
    let n = 0;
    let t = 0;
    let gasp = 0;
    let last = performance.now();
    let lastPhase = "";
    let heart = 0;
    const total = 9.5;
    // knock (1.1s) → listen (1.4s), three times, then a long listen
    const phase = (x: number): "knock" | "listen" | "quiet" => {
      if (x > 7.5) return "listen";
      const c = x % 2.5;
      return c < 1.1 ? "knock" : c < 2.5 ? "listen" : "quiet";
    };
    const set = (v: boolean) => { holding = v && gasp <= 0; btn.classList.toggle("held", holding); };
    btn.onpointerdown = (e) => { e.preventDefault(); set(true); };
    btn.onpointerup = btn.onpointercancel = btn.onpointerleave = () => set(false);
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      t += dt;
      const ph = phase(t);
      if (ph !== lastPhase) {
        lastPhase = ph;
        if (ph === "knock") { A.knock(); buzz(H.knockHard, true); scene.knockDoor(); scene.squeeze(0.6); card.classList.remove("knock-flash"); void card.offsetWidth; card.classList.add("knock-flash"); }
        state.textContent = ph === "knock" ? tr("СТУКАЮТЬ", "KNOCKING") : tr("СЛУХАЮТЬ…", "LISTENING…");
      }
      gasp -= dt;
      if (holding) {
        a -= dt * (0.2 + dsp * 0.08);
        if (a <= 0) { a = 0; holding = false; gasp = 0.7; btn.classList.remove("held"); n += 0.35; A.sigh(); }
      } else {
        a = Math.min(1, a + dt * 0.45);
        if (ph === "listen") n += dt * (0.55 + dsp * 0.3);
      }
      heart -= dt;
      if (heart <= 0) { heart = holding ? 0.45 : 0.7; A.play("heart"); scene.heartbeat(); if (holding) buzz(H.heart); }
      air.style.transform = `scaleX(${a})`;
      noiseEl.style.transform = `scaleX(${Math.min(1, n)})`;
      if (n >= 1 || t >= total) {
        box.classList.add("hidden");
        resolve(n < 1);
        return;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

/** Slam the door: mash. */
function slamGame(): Promise<boolean> {
  return new Promise((resolve) => {
    const box = $("#mini");
    $("#mini-title").textContent = tr("ЦЕ НЕ КУР'ЄР", "THAT'S NOT A COURIER");
    $("#mini-prompt").textContent = tr("ЗАЧИНЯЙ! Тисни швидко!", "SHUT IT! Tap fast!");
    $("#mini-body").innerHTML = `<div class="meter-row"><span>${tr("ДВЕРІ", "DOOR")}</span><div class="bar"><i id="m-air" style="background:var(--mind)"></i></div></div><button class="big-tap">${tr("ТИСНИ!", "TAP!")}</button>`;
    box.classList.remove("hidden");
    const bar = $("#m-air");
    let k = 0.35;
    let t = 0;
    let last = performance.now();
    const goal = 1;
    box.querySelector<HTMLButtonElement>(".big-tap")!.onpointerdown = (e) => { e.preventDefault(); k += 0.075; A.play("hit"); buzz(H.tap, true); };
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      t += dt;
      k -= dt * (0.32 + (run ? despair(run) : 0) * 0.15);
      bar.style.transform = `scaleX(${Math.max(0, Math.min(1, k))})`;
      if (k >= goal || k <= 0 || t > 4) { box.classList.add("hidden"); buzz(H.slam, true); resolve(k >= goal); return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

// ================================================================ the peephole

function peepSvg(kind: "courier" | "fake" | "unclear" | "empty" | "neighbor"): string {
  const stair = `
    <rect width="200" height="200" fill="#2a2c24"/>
    <polygon points="0,0 200,0 150,60 50,60" fill="#d8d4c0"/>
    <polygon points="0,200 200,200 150,140 50,140" fill="#5a4a3a"/>
    <polygon points="0,0 50,60 50,140 0,200" fill="#3f6a52"/>
    <polygon points="200,0 150,60 150,140 200,200" fill="#3f6a52"/>
    <polygon points="0,0 50,60 50,95 0,90" fill="#cfcab4"/><polygon points="200,0 150,60 150,95 200,90" fill="#cfcab4"/>
    <rect x="50" y="60" width="100" height="80" fill="#2a2e2a"/>
    <rect x="62" y="70" width="34" height="70" fill="#5a3a24"/><rect x="104" y="70" width="34" height="70" fill="#6a4a2a"/>
    <circle cx="100" cy="64" r="4" fill="#fff6c0"/>`;
  const person = (jacket: string, bag: string | null, cap: boolean, extra = "") => `
    <g>
      <ellipse cx="100" cy="196" rx="60" ry="10" fill="rgba(0,0,0,.4)"/>
      <path d="M48 200 Q52 130 100 122 Q148 130 152 200 Z" fill="${jacket}" stroke="#111" stroke-width="3"/>
      <circle cx="100" cy="98" r="30" fill="#d8a07a" stroke="#111" stroke-width="3"/>
      ${cap ? '<path d="M70 92 Q100 58 130 92 Z" fill="#1d1d1d" stroke="#111" stroke-width="3"/><rect x="96" y="86" width="44" height="7" fill="#1d1d1d"/>' : '<path d="M72 90 Q100 62 128 90 Q118 76 100 76 Q82 76 72 90Z" fill="#3a2a20"/>'}
      <circle cx="90" cy="100" r="3" fill="#111"/><circle cx="110" cy="100" r="3" fill="#111"/>
      ${bag ? `<rect x="118" y="130" width="52" height="56" rx="4" fill="${bag}" stroke="#111" stroke-width="3"/><rect x="124" y="140" width="40" height="8" fill="rgba(255,255,255,.4)"/>` : ""}
      ${extra}
    </g>`;
  let fig = "";
  if (kind === "courier") fig = person("#e8b830", "#3a8a4a", true);
  if (kind === "unclear") fig = person("#2e3036", "#4a4a50", true);
  if (kind === "fake") fig = `<g transform="translate(-48,6) scale(.8)" opacity=".85">${person("#5a5a3a", null, true)}</g>` + person("#2a2a2e", null, true, '<rect x="42" y="150" width="30" height="16" rx="5" fill="#d8a07a" stroke="#111" stroke-width="3"/>');
  if (kind === "neighbor") fig = person("#7a3a6a", null, false, '<path d="M66 86 Q100 46 134 86 Q130 112 100 70 Q70 112 66 86Z" fill="#c8463a"/>');
  return `<defs><radialGradient id="v" cx="50%" cy="50%" r="50%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".95"/></radialGradient></defs>
    <g transform="translate(100 100) scale(1.12) translate(-100 -100)">${stair}${fig}</g><rect width="200" height="200" fill="url(#v)"/>`;
}

function peepScreen(kind: "courier" | "fake" | "unclear" | "empty" | "neighbor", text: string, choices: Choice[]): Promise<string> {
  return new Promise((resolve) => {
    $("#peep-svg").innerHTML = peepSvg(kind);
    $("#peep-text").textContent = text;
    const box = $("#peep-choices");
    box.innerHTML = "";
    for (const c of choices) {
      const b = document.createElement("button");
      b.className = `choice ${c.cls ?? ""}`;
      b.innerHTML = `${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ""}`;
      b.addEventListener("click", () => { $("#peep").classList.add("hidden"); A.play("click"); resolve(c.id); });
      box.appendChild(b);
    }
    $("#peep").classList.remove("hidden");
  });
}

// ================================================================ events

async function handle(e: DayEvent): Promise<void> {
  if (!run?.day) return;
  const d = run.day;
  switch (e.kind) {
    case "done":
      await showResult(e.result);
      break;
    case "night":
      scene.setPose(null);
      await flow(() => note(tr("ПІВНІЧ", "MIDNIGHT"), tr("Ти так і не ліг. Заснув там, де сидів, з телефоном у руці.", "You never went to bed. You fell asleep where you sat, phone in hand.")));
      await nightfall();
      break;
    case "alert": {
      A.siren(e.ballistic ? 4 : 7);
      buzz(H.siren);
      score.hush = true;
      if (e.ballistic) {
        stopBusy();
        await ballistic();
      } else toast(tr("Повітряна тривога. Шахеди на Київ. Іди в коридор — між двох стін.", "Air-raid alert. Shaheds heading for Kyiv. Go to the corridor — between two walls."), tr("ТРИВОГА", "ALERT"), true, 4200);
      break;
    }
    case "alert_end":
      A.droneBuzz(0);
      score.hush = false;
      toast(tr("Відбій тривоги.", "All clear."), tr("Київ", "Kyiv"));
      break;
    case "boom":
      scene.boom(e.near);
      A.boom(e.near);
      buzz(e.near ? H.boomNear : H.boomFar);
      toast(e.near ? tr("Вибух. Дуже близько. Задзвеніли шибки.", "An explosion. Very close. The windowpanes rang.") : tr("Десь вибух. Далеко. Мабуть.", "An explosion somewhere. Far away. Probably."), "", e.near);
      if (d.glass) scene.setGlass(true);
      break;
    case "power":
      toast(e.on ? tr("Світло дали. Заряджай усе, що можна.", "The power is back. Charge everything you can.") : tr("Світло вимкнули. За графіком — чотири години.", "The power is off. Four hours, by the schedule."), tr("ДТЕК", "DTEK"));
      if (e.on) A.play("ping");
      break;
    case "water":
      toast(e.on ? tr("Воду дали.", "The water is back.") : tr("Воду вимкнули.", "The water is off."), tr("Чат будинку", "Building chat"));
      break;
    case "bus":
      if (e.on) { A.play("van"); if (d.knowsBus) { buzz(H.van); scene.squeeze(0.45); } if (d.knowsBus) toast(tr("Бус заїхав у двір.", "The van pulled into the yard."), tr("Де бус · канал", "Where's the van · channel"), true); }
      else if (d.knowsBus) toast(tr("Бус поїхав. Можна видихнути.", "The van left. You can breathe out."), tr("Чат будинку", "Building chat"));
      break;
    case "warn":
      A.play("phone");
      buzz(H.phoneRing);
      toast(tr("«Тихо сиди. ТЦК в підʼїзді, на третьому».", "“Sit quiet. The TCC is in the building, third floor.”"), tr("Петрович, сусід", "Petrovych, neighbour"), true, 4000);
      break;
    case "drill":
      A.drill();
      toast(tr("Сусід зверху свердлить. Вже третю годину.", "The neighbour upstairs is drilling. Third hour now."));
      break;
    case "msg":
      A.play("ping");
      toast(e.msg.text, e.msg.from, e.msg.kind === "bus");
      break;
    case "knock": {
      stopBusy();
      await flow(async () => {
        A.knock(true);
        buzz(H.knockHard);
        scene.squeeze(1);
        await wait(500);
        const quiet = await breathGame();
        const o = resolveKnock(run!, e.who, quiet);
        await outcomeNote(e.who === "phantom" ? tr("СТУК", "A KNOCK") : quiet ? tr("ПІШЛИ", "THEY LEFT") : tr("ПОЧУЛИ", "THEY HEARD"), o);
      });
      break;
    }
    case "delivery":
      stopBusy();
      await flow(() => delivery(e.fake, e.volunteer));
      break;
    case "mom": {
      A.play("phone");
      buzz(H.phoneRing);
      await flow(async () => {
        const c = await note(tr("ДЗВОНИТЬ МАМА", "MOM IS CALLING"), tr("На екрані «Мама ❤️». Третій дзвінок за день.", "“Mom ❤️” on the screen. The third call today."), [
          { id: "yes", label: tr("ВЗЯТИ", "ANSWER"), cls: "main" }, { id: "no", label: tr("НЕ БРАТИ", "DON'T ANSWER"), sub: tr("Не зараз. Не можу.", "Not now. I can't.") },
        ]);
        await outcomeNote(tr("МАМА", "MOM"), resolveMom(run!, c === "yes"));
      });
      break;
    }
    case "neighbor": {
      A.knock();
      buzz(H.knock);
      scene.knockDoor();
      await flow(async () => {
        const c = await note(tr("ДВЕРІ", "THE DOOR"), tr("Тихий стук. «Синку, ти вдома? Це тьотя Валя з восьмої».", "A soft knock. “Sonny, are you home? It's Auntie Valia from number eight.”"), [
          { id: "polite", label: tr("ВІДПОВІСТИ ЧЕРЕЗ ДВЕРІ", "ANSWER THROUGH THE DOOR") }, { id: "silent", label: tr("МОВЧАТИ", "STAY SILENT") },
        ]);
        await outcomeNote(tr("СУСІДКА", "NEIGHBOUR"), resolveNeighbor(run!, c as "polite" | "silent"));
      });
      break;
    }
  }
  if (run?.ending) await finishRun();
}

function stopBusy(): void {
  if (!run?.day?.busy) return;
  const id = run.day.busy.id;
  const r = interruptAction(run);
  scene.setPose(null);
  scene.windowView(false);
  $("#window-caption").classList.add("hidden");
  if (r && id !== "look") toast(`${actionById(id).label} — ${tr("перервано", "interrupted")}`);
}

async function outcomeNote(title: string, o: Outcome): Promise<void> {
  const d = Math.round(o.dPsyche);
  await note(title, o.text + (d ? `\n\n${tr("Психіка", "Mind")} ${d > 0 ? "+" : ""}${d}` : ""));
}

async function delivery(fake: boolean, volunteer: boolean): Promise<void> {
  if (!run) return;
  A.doorbell();
  buzz(H.doorbell);
  if (volunteer) { await outcomeNote(tr("ПЕРЕДАЧКА", "A PARCEL"), resolveDelivery(run, false, true, "leave")); return; }
  let c = await note(tr("ДЗВІНОК У ДВЕРІ", "THE DOORBELL"), tr("«Доставка!» Голос за дверима.", "“Delivery!” A voice behind the door."), [
    { id: "peep", label: tr("ГЛЯНУТИ В ГЛАЗОК", "LOOK THROUGH THE PEEPHOLE"), cls: "main" },
    { id: "leave", label: tr("«ЗАЛИШТЕ ПІД ДВЕРИМА!»", "“LEAVE IT AT THE DOOR!”") },
    { id: "ignore", label: tr("НЕ ВІДПОВІДАТИ", "DON'T ANSWER") },
  ]);
  if (c === "peep") {
    const { text: seen, kind } = peep(run, fake);
    c = await peepScreen(kind, seen, [
      { id: "open", label: tr("ВІДЧИНИТИ", "OPEN"), sub: tr("Побачити живу людину", "See a living person"), cls: kind !== "courier" ? "danger" : "" },
      { id: "leave", label: tr("«ЗАЛИШТЕ ПІД ДВЕРИМА!»", "“LEAVE IT AT THE DOOR!”"), cls: "main" },
      { id: "ignore", label: tr("НЕ ВІДЧИНЯТИ", "DON'T OPEN") },
    ]);
  }
  if (fake && c === "open") {
    await note(tr("ДВЕРІ", "THE DOOR"), resolveDelivery(run, true, false, "open").text, [{ id: "go", label: tr("ЗАЧИНЯТИ!", "SHUT IT!"), cls: "danger" }]);
    const ok = await slamGame();
    const o = resolveSlam(run, ok);
    if (!o.ending) await outcomeNote(tr("ЗАЧИНИВ", "SHUT"), o);
    return;
  }
  await outcomeNote(fake ? tr("ДВЕРІ", "THE DOOR") : tr("ДОСТАВКА", "DELIVERY"), resolveDelivery(run, fake, false, c as "open" | "leave" | "ignore"));
}

async function ballistic(): Promise<void> {
  if (!run?.day) return;
  ballisticOn = true;
  A.ballisticBeeps();
  scene.windowView(false);
  $("#ballistic").classList.remove("hidden", "safe");
  $("#red-edge").classList.add("on");
  const total = 8;
  const t0 = performance.now();
  let lastSec = total + 1;
  scene.squeeze(1);
  await new Promise<void>((resolve) => {
    const loop = () => {
      const left = total - (performance.now() - t0) / 1000;
      const safe = scene.inShelter();
      const sec = Math.ceil(left);
      if (sec !== lastSec) { lastSec = sec; if (!safe) { buzz(H.ballisticTick, true); scene.heartbeat(); } }
      $("#ballistic").classList.toggle("safe", safe);
      setText($("#ballistic-n"), safe ? "✓" : String(Math.max(0, Math.ceil(left))));
      const a = scene.project(scene.heroX, 1, scene.heroZ);
      const b = scene.project(3.3, 0, 0.85);
      $("#ballistic-arrow").style.rotate = `${Math.atan2(b.y - a.y, b.x - a.x)}rad`;
      $("#ballistic-arrow").style.visibility = safe ? "hidden" : "visible";
      if (left <= 0) { resolve(); return; }
      requestAnimationFrame(loop);
    };
    loop();
  });
  $("#ballistic").classList.add("hidden");
  ballisticOn = false;
  const safe = scene.inShelter();
  scene.boom(true);
  A.boom(true);
  buzz(safe ? H.boomNear : H.ballisticHit, true);
  await flow(async () => {
    const o = resolveBallistic(run!, safe);
    $("#red-edge").classList.remove("on");
    if (!o.ending) {
      scene.setGlass(run!.day!.glass);
      await outcomeNote(safe ? tr("ВСТИГ", "MADE IT") : tr("НЕ ВСТИГ", "TOO LATE"), o);
    }
    score.hush = false;
  });
}

// ================================================================ seasons

function startSeason(): void {
  if (!run) return;
  mode = "screen";
  const def = SEASON_DEFS[run.season];
  setText($("#season-eyebrow"), `${tr("СЕЗОН", "SEASON")} ${run.season + 1} / ${SEASONS}${run.flags.daily ? ` · ${tr("ЩОДЕННИЙ", "DAILY")}` : ""}`);
  setText($("#season-title"), seasonName(run.season));
  setText($("#season-sub"), def.title);
  setText($("#season-text"), def.intro);
  $("#season-facts").innerHTML = def.facts.map((f) => `<li>${esc(f)}</li>`).join("");
  dressScene();
  scene.placeHero(-3.1, 1.7, Math.PI / 2);
  showScreen("#season-screen");
  hud(false);
}

function dressScene(): void {
  if (!run) return;
  scene.setSeason(run.season, {
    clutter: run.clutter, plant: run.plant, plantDead: !!run.flags.plantDead, perks: run.perks,
    friends: run.friends.map((f) => ({ color: f.color, state: f.state })), glass: !!run.day?.glass,
  });
  scene.setWeather(!!run.day?.rain);
}

function hud(on: boolean): void {
  $("#hud").classList.toggle("hidden", !on);
  $("#test-btn").classList.toggle("hidden", !on || !testMode());
  $("#controls").classList.toggle("hidden", !on);
  if (!on) {
    $("#act-panel").classList.add("hidden");
    $("#busy").classList.add("hidden");
    // the room tone (rain, generator, tinnitus) belongs to the day
    amb.update(0, { despair: 0, blackout: false, birds: false, quiet: false, rain: 0, open: false });
  }
}

function enterDay(): void {
  if (!run?.day) return;
  showScreen(null);
  mode = "day";
  scene.setPose(null);
  hud(true);
  persist();
  const first = run.day.msgs.slice(0, 2);
  first.forEach((m, i) => setTimeout(() => toast(m.text, m.from, false, 3200), 300 + i * 3300));
}

async function nightfall(): Promise<void> {
  if (!run?.day) return;
  stopBusy();
  A.droneBuzz(0);
  scene.setPose("sleep");
  A.play("snore");
  hud(false);
  mode = "screen";
  const rep = endDay(run);
  await wait(900);
  if (rep.ending) { await finishRun(); return; }
  saveRun(run);
  showSummary(rep);
}

function showSummary(rep: SeasonReport): void {
  if (!run) return;
  setText($("#sum-title"), rep.title);
  const sign = (v: number) => (v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`);
  $("#sum-deltas").innerHTML = `
    <div class="delta"><small>${tr("ПСИХІКА", "MIND")}</small><b class="${rep.dPsyche >= 0 ? "up" : "down"}">${Math.round(run.psyche)} <span style="font-size:14px">(${sign(rep.dPsyche)})</span></b></div>
    <div class="delta"><small>${tr("ГРОШІ", "MONEY")}</small><b class="${run.money >= 0 ? "up" : "down"}">${fmt(run.money)}</b></div>
    <div class="delta"><small>${tr("ДНІВ БЕЗ ВУЛИЦІ", "DAYS INSIDE")}</small><b>${num(run.daysInside)}</b></div>
    <div class="delta"><small>${tr("СТЕЛЯ ПСИХІКИ", "MIND CEILING")}</small><b class="down">${Math.round(maxPsyche(run))}</b></div>`;
  $("#sum-lines").innerHTML = rep.lines.map((l) => `<li>${esc(l)}</li>`).join("");
  $("#sum-news").innerHTML = rep.news.map((m) => msgHtml(m, false)).join("");
  showScreen("#summary-screen");
}

function showPerks(): void {
  if (!run) return;
  const box = $("#perk-list");
  box.innerHTML = "";
  for (const id of run.offer) {
    const p = perkById(id);
    const b = document.createElement("button");
    b.className = "perk";
    b.innerHTML = `<em>${p.icon}</em><div><b>${esc(p.name)}</b><small>${esc(p.text)}</small></div>`;
    b.addEventListener("click", () => pickPerk(id));
    box.appendChild(b);
  }
  showScreen("#perk-screen");
}

function pickPerk(id: (typeof PERKS)[number]["id"] | null): void {
  if (!run) return;
  A.play("click");
  choosePerk(run, id);
  saveRun(run);
  startSeason();
}

async function finishRun(): Promise<void> {
  if (!run) return;
  const r = run;
  const ending = r.ending ?? "zryv";
  if (r.history.length === 0 || r.history.length < r.season) r.history.push(Math.round(r.psyche));
  stopBusy();
  hud(false);
  mode = "screen";
  A.droneBuzz(0);
  $("#red-edge").classList.remove("on");
  const before = unlockedTraits(meta.seasons);
  bankRun(meta, r);
  const after = unlockedTraits(meta.seasons);
  saveRun(null);
  const e = ENDINGS[ending];
  setText($("#end-sticker"), ending === "survived" ? e.sticker : `${seasonName(Math.min(r.season, SEASONS - 1))}`);
  $("#end-sticker").style.background = ending === "survived" ? "#3a6a4a" : "var(--red)";
  setText($("#end-title"), e.title);
  setText($("#end-text"), e.text);
  // the line of the mind across the seasons
  const pts = r.history.map((v, i) => `${10 + (i / Math.max(1, SEASONS - 1)) * 300},${100 - v * 0.9}`).join(" ");
  $("#end-graph").innerHTML = `<line x1="10" y1="100" x2="310" y2="100" stroke="#3a3640"/>${[0, 4, 8, 12].map((s, i) => `<text x="${10 + (s / 15) * 300}" y="108" fill="#6a6470" font-size="8">${2023 + i}</text>`).join("")}<polyline points="${pts}" fill="none" stroke="#e8c45a" stroke-width="2.5"/>${r.history.length ? `<circle cx="${10 + ((r.history.length - 1) / Math.max(1, SEASONS - 1)) * 300}" cy="${100 - r.history[r.history.length - 1] * 0.9}" r="3.5" fill="${ending === "survived" ? "#8ac46a" : "#c83a32"}"/>` : ""}`;
  const dead = r.friends.filter((f) => f.state === "dead").length;
  $("#end-stats").innerHTML = `
    <div class="delta"><small>${tr("ДНІВ БЕЗ ВУЛИЦІ", "DAYS INSIDE")}</small><b>${num(r.daysInside)}</b></div>
    <div class="delta"><small>${tr("ТРИВОГ", "ALERTS")}</small><b>${r.stats.alerts}</b></div>
    <div class="delta"><small>${tr("СТУКІВ У ДВЕРІ", "KNOCKS AT THE DOOR")}</small><b>${r.stats.knocks}</b></div>
    <div class="delta"><small>${tr("ДРУЗІВ ЗАГИНУЛО", "FRIENDS KILLED")}</small><b class="${dead ? "down" : ""}">${dead}</b></div>`;
  lastResult = {
    ending, trait: r.trait, history: [...r.history], daysInside: r.daysInside, alerts: r.stats.alerts, knocks: r.stats.knocks,
    friends: r.friends.map((f) => ({ name: nameOf(f), state: f.state, color: f.color })), daily: r.flags.daily ?? 0,
  };
  lastCard = renderCard(lastResult).catch(() => null);
  const fresh = after.filter((t) => !before.includes(t));
  setText($("#end-unlock"), fresh.length ? `${tr("Відкрито", "Unlocked")}: ${fresh.map((t) => TRAITS.find((x) => x.id === t)!.name).join(", ")}` : `${tr("Прожито сезонів за всі забіги", "Seasons lived across all runs")}: ${meta.seasons}`);
  run = null;
  await wait(600);
  showScreen("#end-screen");
}

// ================================================================ phone

function msgHtml(m: Msg, time = true): string {
  return `<div class="msg ${m.kind}"><b>${esc(m.from)}${time ? `<time>${clockText(m.at)}</time>` : ""}</b><p>${esc(m.text)}</p></div>`;
}

function openPhone(): void {
  if (!run?.day || handling || run.day.busy) return;
  A.play("click");
  const d = run.day;
  d.unread = 0;
  setText($("#phone-time"), `${clockText(d.clock)} · 🔋${Math.round(d.phone)}%`);
  const acts = $("#phone-acts");
  acts.innerHTML = "";
  for (const a of actionsAt(run, "phone")) {
    const b = actButton(a.def.id, a.ok, a.why);
    if (a.def.id === "order") b.querySelector("small")!.textContent = a.ok ? `${fmt(Math.round(450 * [1, 1.2, 1.45, 1.7][yearIndex(run)] / 10) * 10)} · ${tr("+3 їжі", "+3 food")}` : a.why ?? "";
    acts.appendChild(b);
  }
  $("#phone-msgs").innerHTML = [...d.msgs].reverse().map((m) => msgHtml(m)).join("");
  showScreen("#phone-screen");
  paused = true;
}

// ================================================================ thoughts

function spawnThought(): void {
  if (!run) return;
  const p = run.psyche;
  const tier = p < 30 ? 2 : p < 55 ? 1 : 0;
  const pool = THOUGHTS[tier === 2 && Math.random() < 0.3 ? 1 : tier];
  const el = document.createElement("div");
  el.className = `thought ${tier === 2 ? "dark" : ""}`;
  el.textContent = pool[Math.floor(Math.random() * pool.length)];
  el.style.left = `${8 + Math.random() * 40}%`;
  el.style.top = `${30 + Math.random() * 25}%`;
  $("#thoughts").appendChild(el);
  setTimeout(() => el.remove(), 6200);
}

// ================================================================ the frame

let pending: DayEvent[] = [];

scene.onFrame = (dt) => {
  if (!run?.day || mode !== "day") return;
  const d = run.day;
  const dsp = despair(run);
  scene.heroSpeed = 2.5 * (0.55 + 0.45 * (1 - dsp)) * (run.energy < 10 ? 0.7 : 1);
  if (d.alert) d.sheltered = scene.inShelter() || d.busy?.id === "shelter";
  scene.setInfo({ clock: d.clock, light: isLight(d), alert: !!d.alert, bus: busHere(d), despair: dsp, season: run.season, danger: ballisticOn ? 1 : d.alert ? 0.25 : 0 });
  scene.setMood(!isLight(d) && (isNight(d) || winter(run)) ? "blackout" : isNight(d) ? "night" : d.clock > 19 * 60 ? "dusk" : d.rain ? "rain" : "home");
  score.despair = dsp;
  const open = d.busy?.id === "air" || d.busy?.id === "balcony" || d.busy?.id === "tomatoes" || d.busy?.id === "look";
  amb.update(dt, { despair: dsp, blackout: !isLight(d), birds: !d.rain && yearIndex(run) <= 1 && run.season % 4 !== 0 && !isNight(d) && !d.alert, quiet: !d.alert, rain: d.rain ? 1 : 0, open });
  // the sky
  if (d.alert && !d.alert.ballistic) {
    buzzT += dt;
    A.droneBuzz(0.35 + 0.35 * Math.sin(buzzT / 3) + 0.2 * Math.sin(buzzT / 1.3));
  }
  // the heart
  heartT -= dt;
  if (run.psyche < 25 && heartT <= 0) { heartT = 0.55 + run.psyche / 40; A.play("heart"); scene.heartbeat(); if (run.psyche < 15) buzz(H.heart); }
  $("#red-edge").classList.toggle("on", ballisticOn || run.psyche < 12);
  // thoughts
  thoughtT -= dt;
  if (thoughtT <= 0 && !handling) {
    thoughtT = run.psyche < 30 ? 6 + Math.random() * 4 : run.psyche < 55 ? 14 + Math.random() * 8 : 30 + Math.random() * 20;
    spawnThought();
  }
  // busy bar
  $("#busy").classList.toggle("hidden", !d.busy || handling || d.busy.id === "look");
  if (d.busy) $("#busy-bar").style.transform = `scaleX(${1 - d.busy.left / Math.max(1, d.busy.total)})`;
  // proximity
  if (!d.busy && !handling && !ballisticOn) {
    const p = scene.nearest(placeEnabled);
    if (p !== near) { near = p; renderPanel(true); }
  } else if (near) { near = null; }
  scene.highlight(!d.busy && !handling ? near : null);
  panelT -= dt;
  if (panelT <= 0) { panelT = 0.4; renderPanel(); }
  updateHud();
  // time
  if (handling || paused || ballisticOn) return;
  if (pending.length) {
    const e = pending.shift()!;
    handling = true;
    void handle(e).finally(() => { handling = false; persist(); renderPanel(true); });
    return;
  }
  const minutes = d.busy ? dt * 55 : dt * 1.4;
  pending = tick(run, minutes);
};

function winter(r: RunState): boolean { return r.season % 4 === 0; }

// ================================================================ input

const stick = { id: -1, ox: 0, oy: 0 };
(() => {
  const zone = $("#stick-zone");
  const base = $("#stick-base");
  const knob = $("#stick-knob");
  const R = 46;
  zone.addEventListener("pointerdown", (e) => {
    if (stick.id !== -1) return;
    unlock();
    stick.id = e.pointerId;
    const rect = zone.getBoundingClientRect();
    stick.ox = e.clientX - rect.left;
    stick.oy = e.clientY - rect.top;
    base.style.left = `${stick.ox}px`;
    base.style.top = `${stick.oy}px`;
    base.classList.remove("hidden");
    knob.style.transform = "";
    zone.setPointerCapture(e.pointerId);
    $("#stick-hint").classList.add("hidden");
  });
  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== stick.id) return;
    const rect = zone.getBoundingClientRect();
    let dx = e.clientX - rect.left - stick.ox;
    let dy = e.clientY - rect.top - stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = Math.min(1, len / R);
    if (!handling) scene.setMove(len > 6 ? (dx / Math.max(1, Math.hypot(dx, dy))) * k : 0, len > 6 ? (dy / Math.max(1, Math.hypot(dx, dy))) * k : 0);
  });
  const up = (e: PointerEvent) => {
    if (e.pointerId !== stick.id) return;
    stick.id = -1;
    base.classList.add("hidden");
    scene.setMove(0, 0);
  };
  zone.addEventListener("pointerup", up);
  zone.addEventListener("pointercancel", up);
})();

const keys = new Set<string>();
window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
  updateKeys();
  if (e.key === "Escape" || e.key.toLowerCase() === "p") togglePause();
  if (e.key.toLowerCase() === "e" && mode === "day") document.querySelector<HTMLButtonElement>("#act-list .act:not(.no)")?.click();
});
window.addEventListener("keyup", (e) => { keys.delete(e.key.toLowerCase()); updateKeys(); });
function updateKeys(): void {
  if (stick.id !== -1 || handling) return;
  const x = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  const y = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  const l = Math.hypot(x, y) || 1;
  scene.setMove(x / l, y / l);
}

function unlock(): void {
  A.unlockAudio();
  if (!audioOn) { audioOn = true; score.start(); }
}

function togglePause(): void {
  if (mode !== "day") return;
  if ($("#pause-screen").classList.contains("active")) { showScreen(null); paused = false; return; }
  showScreen("#pause-screen");
  paused = true;
}

// ================================================================ buttons

$("#pause-btn").addEventListener("click", () => { A.play("click"); togglePause(); });
$("#resume-btn").addEventListener("click", () => { showScreen(null); paused = false; });
$("#phone-btn").addEventListener("click", () => { unlock(); openPhone(); });
$("#phone-close").addEventListener("click", () => { showScreen(null); paused = false; });
$("#phone-acts").addEventListener("click", () => { paused = false; }, true);
$("#busy-stop").addEventListener("click", () => {
  if (!run?.day?.busy) return;
  const id = run.day.busy.id;
  const r = interruptAction(run);
  scene.setPose(null);
  if (r) void showResult({ ...r, text: r.text && id !== "work" ? r.text : undefined });
  renderPanel(true);
});
$("#season-go").addEventListener("click", () => { unlock(); A.play("click"); enterDay(); });
$("#sum-next").addEventListener("click", () => { A.play("click"); showPerks(); });
$("#perk-skip").addEventListener("click", () => pickPerk(null));
$("#end-btn").addEventListener("click", () => { A.play("click"); showStart(); });
$("#quit-btn").addEventListener("click", () => { paused = false; persist(); mode = "menu"; hud(false); showStart(); });
$("#new-btn").addEventListener("click", () => {
  unlock();
  A.play("click");
  meta.lastTrait = selected;
  saveMeta(meta);
  run = newRun((Math.random() * 1e9) | 0, selected);
  saveRun(run);
  startSeason();
});
$("#daily-btn").addEventListener("click", () => {
  unlock();
  A.play("click");
  const day = dailySeed();
  run = newRun(day, "it", day);
  saveRun(run);
  startSeason();
});
$("#share-btn").addEventListener("click", async () => {
  if (!lastResult) return;
  A.play("click");
  const btn = $<HTMLButtonElement>("#share-btn");
  btn.disabled = true;
  try {
    const o = await shareResult(lastResult, (await lastCard) ?? null);
    if (o === "copied") toast(tr("Результат скопійовано, картинку збережено.", "Result copied, picture saved."));
    else if (o === "downloaded") toast(tr("Картинку збережено.", "Picture saved."));
  } finally { btn.disabled = false; }
});
$("#continue-btn").addEventListener("click", () => {
  unlock();
  A.play("click");
  if (!run) return;
  dressScene();
  scene.placeHero(-2.2, 0, Math.PI);
  enterDay();
});
const soundBtn = $("#sound-btn");
const musicBtn = $("#music-btn");
const gfxBtn = $("#gfx-btn");
const QN = { low: ["НИЗЬКА", "LOW"], medium: ["СЕРЕДНЯ", "MEDIUM"], high: ["ВИСОКА", "HIGH"] } as const;
const onOff = (on: boolean) => (on ? tr("ВКЛ", "ON") : tr("ВИКЛ", "OFF"));
function syncToggles(): void {
  setText(soundBtn, `${tr("ЗВУКИ", "SOUND")}: ${onOff(!A.isMuted())}`);
  setText(musicBtn, `${tr("МУЗИКА", "MUSIC")}: ${onOff(!A.isMusicMuted())}`);
  setText(gfxBtn, `${tr("ГРАФІКА", "GRAPHICS")}: ${tr(QN[scene.post.quality][0], QN[scene.post.quality][1])}`);
  setText(vibeBtn, `${tr("ВІБРАЦІЯ", "VIBRATION")}: ${onOff(vibeOn())}`);
  setText(lang2Btn, tr("МОВА: УКРАЇНСЬКА", "LANGUAGE: ENGLISH"));
}
const vibeBtn = $("#vibe-btn");
const lang2Btn = $("#lang2-btn");
vibeBtn.classList.toggle("hidden", !vibeSupported);
soundBtn.addEventListener("click", () => { A.setMuted(!A.isMuted()); syncToggles(); });
vibeBtn.addEventListener("click", () => { setVibe(!vibeOn()); buzz(H.knock, true); syncToggles(); });
lang2Btn.addEventListener("click", () => { setLang(getLang() === "en" ? "uk" : "en"); });
$("#lang-btn").addEventListener("click", () => { A.play("click"); setLang(getLang() === "en" ? "uk" : "en"); });
musicBtn.addEventListener("click", () => { A.setMusicMuted(!A.isMusicMuted()); syncToggles(); });
gfxBtn.addEventListener("click", () => {
  const order = ["low", "medium", "high"] as const;
  scene.post.setQuality(order[(order.indexOf(scene.post.quality) + 1) % 3]);
  scene.resize();
  syncToggles();
});
syncToggles();

// ================================================================ start

function showStart(): void {
  mode = "menu";
  hud(false);
  const open = unlockedTraits(meta.seasons);
  if (!open.includes(selected)) selected = "it";
  const box = $("#trait-list");
  box.innerHTML = "";
  for (const t of TRAITS) {
    const b = document.createElement("button");
    const locked = !open.includes(t.id);
    b.className = `trait ${t.id === selected ? "on" : ""} ${locked ? "locked" : ""}`;
    b.innerHTML = `<b>${locked ? "🔒 " : ""}${esc(t.name)}</b><small>${esc(locked ? tr(`Проживи ${t.unlock} сезонів за всі забіги`, `Live ${t.unlock} seasons across all runs`) : `${t.text} · ${fmt(t.money)}`)}</small>`;
    b.disabled = locked;
    b.addEventListener("click", () => { selected = t.id; A.play("click"); showStart(); });
    box.appendChild(b);
  }
  $("#continue-btn").classList.toggle("hidden", !run);
  setText($("#new-btn"), run ? tr("НОВИЙ ЗАБІГ", "NEW RUN") : tr("ПОЧАТИ", "START"));
  setText($("#meta-line"), meta.runs ? tr(`Забігів: ${meta.runs} · найдовше: ${meta.best} сезонів · дожили: ${meta.survived}`, `Runs: ${meta.runs} · longest: ${meta.best} seasons · made it: ${meta.survived}`) : "");
  // a quiet room behind the menu
  scene.setInfo({ clock: 17 * 60, light: true, alert: false, bus: false, despair: 0.2, season: 3, danger: 0 });
  scene.setSeason(run?.season ?? 3, { clutter: run?.clutter ?? 2, plant: 70, plantDead: false, perks: run?.perks ?? [], friends: [], glass: false });
  scene.setWeather(!run);
  scene.setPose("stare");
  updateDailyBtn();
  showScreen("#start-screen");
}

function updateDailyBtn(): void {
  const day = dailySeed();
  const done = meta.daily?.date === day ? meta.daily : null;
  const dd = `${String(day % 100).padStart(2, "0")}.${String(Math.floor(day / 100) % 100).padStart(2, "0")}`;
  const it = TRAITS.find((t) => t.id === "it")!.name;
  $("#daily-btn").classList.toggle("done", !!done);
  setText($("#daily-sub"), done
    ? tr(`Сьогодні: ${done.seasons}/${SEASONS} сезонів · спробуй ще`, `Today: ${done.seasons}/${SEASONS} seasons · try again`)
    : tr(`${dd} · один і той самий забіг для всіх · ${it}`, `${dd} · the same run for everyone · ${it}`));
}

// ================================================================ language

/** Static text in index.html: [selector, English, is HTML]. Ukrainian is read from the page. */
const STATIC_EN: Array<[string, string, boolean?]> = [
  [".days-chip small", "days without the street"],
  [".psyche-label", "MIND"],
  ["#busy-stop", "Stop"],
  ["#stick-hint", "DRAG TO WALK"],
  ["#window-back", "STEP AWAY FROM THE WINDOW"],
  ["#ballistic b", "BALLISTIC"],
  ["#ballistic span", "TO THE CORRIDOR! BETWEEN TWO WALLS"],
  ["#start-screen .eyebrow", "ROGUELITE · 2023–2026 · 18+"],
  ["#start-screen h1", "FOUR<br /><span>WALLS</span>", true],
  ["#start-screen .lead", "You haven't left home in four years. You don't have to win here. You have to hold on — and not break."],
  ["#continue-btn", "CONTINUE"],
  ["#daily-btn", "DAILY RUN<small id=\"daily-sub\"></small>", true],
  ["#start-screen .hint.small", "A game about the state of mind of a man in Kyiv hiding from mobilisation. Not about whether that is right or wrong."],
  ["#season-go", "WAKE UP"],
  [".phone-head b", "📱 PHONE"],
  ["#sum-eyebrow", "THE SEASON IS OVER"],
  ["#sum-next", "NEXT"],
  ["#perk-screen .eyebrow", "WHAT HELPED YOU GET THROUGH THE SEASON"],
  ["#perk-screen h2", "CHOOSE ONE"],
  ["#perk-skip", "NOTHING HELPED"],
  ["#share-btn", "SHARE"],
  ["#end-btn", "AGAIN"],
  ["#pause-screen .eyebrow", "PAUSED"],
  ["#pause-screen h2", "THE WALLS WILL WAIT"],
  ["#resume-btn", "RESUME"],
  ["#quit-btn", "TO MENU"],
  ["#pause-screen .hint", "Progress is saved on this device. If real life feels this heavy for you, talk to someone. In Ukraine: Lifeline Ukraine, 7333. Elsewhere: findahelpline.com."],
];
const STATIC_UK = new Map<string, string>();

function applyStaticLang(): void {
  const en = getLang() === "en";
  document.documentElement.lang = en ? "en" : "uk";
  document.title = tr("Чотири стіни", "Four Walls");
  for (const [sel, text, html] of STATIC_EN) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) continue;
    if (!STATIC_UK.has(sel)) STATIC_UK.set(sel, html ? el.innerHTML : el.textContent ?? "");
    const v = en ? text : STATIC_UK.get(sel)!;
    if (html) el.innerHTML = v; else el.textContent = v;
  }
  setText($("#lang-btn"), en ? "УКР" : "EN");
}

function setLang(l: Lang): void {
  applyContentLang(l);
  saveLang(l);
  applyStaticLang();
  syncToggles();
  if (mode === "menu") showStart();
  renderPanel(true);
}
applyStaticLang();

// ================================================================ test menu (#test)

function testMode(): boolean { return location.hash === "#test"; }
window.addEventListener("hashchange", () => { $("#test-btn").classList.toggle("hidden", mode !== "day" || !testMode()); });

function closeTest(): void { $("#test-panel").classList.add("hidden"); paused = false; }

$("#test-btn").addEventListener("click", () => {
  if (handling || ballisticOn || mode !== "day") return;
  unlock();
  A.play("click");
  $("#test-panel").classList.remove("hidden");
  paused = true;
});
$("#test-close").addEventListener("click", closeTest);
$("#test-panel").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-t]");
  if (!b || !run?.day) return;
  const r = run;
  const d = r.day!;
  const soon = d.clock + 0.5;
  const t = b.dataset.t!;
  closeTest();
  const plan = (p: Parameters<typeof d.plan.push>[0]) => { d.plan.push(p); d.plan.sort((a, c) => a.at - c.at); };
  switch (t) {
    case "ballistic": plan({ at: soon, kind: "alert", ballistic: true }); break;
    case "alert": plan({ at: soon, kind: "alert", ballistic: false }); break;
    case "knock": plan({ at: soon, kind: "knock", who: "tck" }); break;
    case "phantom": pending.push({ kind: "knock", who: "phantom" }); break;
    case "fake": plan({ at: soon, kind: "delivery", fake: true }); break;
    case "courier": plan({ at: soon, kind: "delivery", fake: false }); break;
    case "mom": plan({ at: soon, kind: "mom" }); break;
    case "neighbor": plan({ at: soon, kind: "neighbor" }); break;
    case "drill": plan({ at: soon, kind: "drill" }); break;
    case "bus": d.bus = [soon, Math.min(24 * 60, soon + 240)]; d.knowsBus = true; break;
    case "blackout": d.blackouts.push([soon, soon + 240]); break;
    case "water": d.waterOff.push([soon, soon + 240]); break;
    case "psyche-": r.psyche = Math.max(1, r.psyche - 20); break;
    case "psyche+": r.psyche = Math.min(100, r.psyche + 20); break;
    case "evening": if (d.clock < 20 * 60) d.clock = 20 * 60; break;
    case "food": r.food += 5; r.money += 20000; break;
    case "next": stopBusy(); void nightfall(); return;
    default:
      if (t.startsWith("y")) {
        stopBusy();
        r.season = (Number(t.slice(1)) - 2023) * 4;
        r.daysInside = 290 + r.season * 91;
        r.ending = null;
        startDay(r);
        saveRun(r);
        startSeason();
        return;
      }
  }
  toast(b.textContent ?? "", "ТЕСТ");
  persist();
});

showStart();
