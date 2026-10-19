import "./stiny.css";
import { Scene3D } from "./Scene3D.ts";
import * as A from "./audio.ts";
import {
  ENDINGS, PERKS, PLACE_LABELS, SEASONS, SEASON_DEFS, THOUGHTS, TRAITS, actionById, perkById, seasonName,
  type ActionId, type PlaceId, type TraitId,
} from "./content.ts";
import {
  actionsAt, beginAction, busHere, choosePerk, clockText, despair, endDay, fmt, has, hasWater, interruptAction, isLight, isNight,
  maxPsyche, newRun, peep, resolveBallistic, resolveDelivery, resolveKnock, resolveMom, resolveNeighbor, resolveSlam, tick, unlockedTraits,
  yearIndex, type ActionResult, type DayEvent, type Msg, type Outcome, type RunState, type SeasonReport,
} from "./sim.ts";
import { bankRun, loadMeta, loadRun, saveMeta, saveRun } from "./save.ts";

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
function note(title: string, text: string, choices: Choice[] = [{ id: "ok", label: "ДАЛІ", cls: "main" }]): Promise<string> {
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
  setText($("#h-days"), run.daysInside.toLocaleString("uk-UA"));
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
  if (d.alert) chips.push(`<span class="chip alert">${d.alert.ballistic ? "БАЛІСТИКА" : "ТРИВОГА"}${d.sheltered ? " · В КОРИДОРІ" : ""}</span>`);
  if (!isLight(d)) chips.push('<span class="chip dark">БЕЗ СВІТЛА</span>');
  if (!hasWater(d)) chips.push('<span class="chip dark">БЕЗ ВОДИ</span>');
  if (busHere(d) && d.knowsBus) chips.push('<span class="chip bad">БУС У ДВОРІ</span>');
  if (has(run, "station") && !isLight(d)) chips.push(`<span class="chip">🔋 ${Math.round(run.station)}%</span>`);
  if (run.satiety < 20) chips.push('<span class="chip bad">ГОЛОД</span>');
  if (run.energy < 10) chips.push('<span class="chip bad">НЕМАЄ СИЛ</span>');
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
  if (!list.length) box.innerHTML = '<p class="hint">Тут нічого не зробиш.</p>';
}

function actButton(id: ActionId, ok: boolean, why?: string): HTMLButtonElement {
  const def = actionById(id);
  const b = document.createElement("button");
  b.className = `act ${ok ? "" : "no"} ${id === "break_out" ? "dark" : ""}`;
  const mins = def.minutes ? (def.minutes >= 60 ? `${Math.floor(def.minutes / 60)} год${def.minutes % 60 ? ` ${def.minutes % 60}` : ""}` : `${def.minutes} хв`) : "";
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
      const c = await flow(() => note("ЛІЖКО", `Зараз ${clockText(run!.day!.clock)}. Лягти зараз? День просто закінчиться раніше.`, [
        { id: "yes", label: "ЛЯГТИ", cls: "main" }, { id: "no", label: "ЩЕ НІ" },
      ]));
      if (c !== "yes") return;
    }
    await nightfall();
    return;
  }
  if (id === "break_out") {
    const c = await flow(() => note("ДВЕРІ", "Ти взувся. Руки не трусяться — вперше за довгий час. Просто вийти.", [
      { id: "go", label: "ВИЙТИ", cls: "danger" }, { id: "no", label: "НІ. ЩЕ НІ.", sub: "Повернутися в кімнату", cls: "main" },
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
  if (r.text && r.text.length > 70) await flow(() => note(actionById(r.id).label.toUpperCase(), r.text! + (delta ? `\n\nПсихіка ${delta > 0 ? "+" : ""}${delta}` : "")));
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
    $("#mini-title").textContent = "РОБОТА";
    $("#mini-prompt").textContent = "Закрий таски: тисни, коли маркер у зеленому";
    $("#mini-body").innerHTML = `<div class="dots">${"<i></i>".repeat(5)}</div><div class="track"><div class="zone"></div><div class="marker"></div></div><button class="big-tap">ЗАКРИТИ ТАСК</button>`;
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
      if (hit) { hits++; A.play("type"); } else A.play("miss");
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
    $("#mini-title").textContent = "СТУКАЮТЬ";
    $("#mini-prompt").textContent = "Коли слухають — затамуй подих";
    $("#mini-body").innerHTML = `
      <div class="meter-row"><span>ПОВІТРЯ</span><div class="bar"><i id="m-air"></i></div></div>
      <div class="meter-row"><span>ЧУТНО</span><div class="bar"><i id="m-noise"></i></div></div>
      <p id="m-state" class="eyebrow" style="text-align:center;font-size:18px;margin:10px 0"></p>
      <button class="big-tap">ТРИМАЙ — НЕ ДИХАЙ</button>`;
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
        if (ph === "knock") { A.knock(); scene.knockDoor(); card.classList.remove("knock-flash"); void card.offsetWidth; card.classList.add("knock-flash"); }
        state.textContent = ph === "knock" ? "СТУКАЮТЬ" : "СЛУХАЮТЬ…";
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
      if (heart <= 0) { heart = holding ? 0.45 : 0.7; A.play("heart"); }
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
    $("#mini-title").textContent = "ЦЕ НЕ КУР'ЄР";
    $("#mini-prompt").textContent = "ЗАЧИНЯЙ! Тисни швидко!";
    $("#mini-body").innerHTML = `<div class="meter-row"><span>ДВЕРІ</span><div class="bar"><i id="m-air" style="background:var(--mind)"></i></div></div><button class="big-tap">ТИСНИ!</button>`;
    box.classList.remove("hidden");
    const bar = $("#m-air");
    let k = 0.35;
    let t = 0;
    let last = performance.now();
    const goal = 1;
    box.querySelector<HTMLButtonElement>(".big-tap")!.onpointerdown = (e) => { e.preventDefault(); k += 0.075; A.play("hit"); };
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      t += dt;
      k -= dt * (0.32 + (run ? despair(run) : 0) * 0.15);
      bar.style.transform = `scaleX(${Math.max(0, Math.min(1, k))})`;
      if (k >= goal || k <= 0 || t > 4) { box.classList.add("hidden"); resolve(k >= goal); return; }
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
      await flow(() => note("ПІВНІЧ", "Ти так і не ліг. Заснув там, де сидів, з телефоном у руці."));
      await nightfall();
      break;
    case "alert": {
      A.siren(e.ballistic ? 4 : 7);
      score.hush = true;
      if (e.ballistic) {
        stopBusy();
        await ballistic();
      } else toast("Повітряна тривога. Шахеди на Київ. Іди в коридор — між двох стін.", "ТРИВОГА", true, 4200);
      break;
    }
    case "alert_end":
      A.droneBuzz(0);
      score.hush = false;
      toast("Відбій тривоги.", "Київ");
      break;
    case "boom":
      scene.boom(e.near);
      A.boom(e.near);
      toast(e.near ? "Вибух. Дуже близько. Задзвеніли шибки." : "Десь вибух. Далеко. Мабуть.", "", e.near);
      if (d.glass) scene.setGlass(true);
      break;
    case "power":
      toast(e.on ? "Світло дали. Заряджай усе, що можна." : "Світло вимкнули. За графіком — чотири години.", "ДТЕК");
      if (e.on) A.play("ping");
      break;
    case "water":
      toast(e.on ? "Воду дали." : "Воду вимкнули.", "Чат будинку");
      break;
    case "bus":
      if (e.on) { A.play("van"); if (d.knowsBus) toast("Бус заїхав у двір.", "Де бус · канал", true); }
      else if (d.knowsBus) toast("Бус поїхав. Можна видихнути.", "Чат будинку");
      break;
    case "warn":
      A.play("phone");
      toast("«Тихо сиди. ТЦК в підʼїзді, на третьому».", "Петрович, сусід", true, 4000);
      break;
    case "drill":
      A.drill();
      toast("Сусід зверху свердлить. Вже третю годину.");
      break;
    case "msg":
      A.play("ping");
      toast(e.msg.text, e.msg.from, e.msg.kind === "bus");
      break;
    case "knock": {
      stopBusy();
      await flow(async () => {
        A.knock(true);
        await wait(500);
        const quiet = await breathGame();
        const o = resolveKnock(run!, e.who, quiet);
        await outcomeNote(e.who === "phantom" ? "СТУК" : quiet ? "ПІШЛИ" : "ПОЧУЛИ", o);
      });
      break;
    }
    case "delivery":
      stopBusy();
      await flow(() => delivery(e.fake, e.volunteer));
      break;
    case "mom": {
      A.play("phone");
      await flow(async () => {
        const c = await note("ДЗВОНИТЬ МАМА", "На екрані «Мама ❤️». Третій дзвінок за день.", [
          { id: "yes", label: "ВЗЯТИ", cls: "main" }, { id: "no", label: "НЕ БРАТИ", sub: "Не зараз. Не можу." },
        ]);
        await outcomeNote("МАМА", resolveMom(run!, c === "yes"));
      });
      break;
    }
    case "neighbor": {
      A.knock();
      scene.knockDoor();
      await flow(async () => {
        const c = await note("ДВЕРІ", "Тихий стук. «Синку, ти вдома? Це тьотя Валя з восьмої».", [
          { id: "polite", label: "ВІДПОВІСТИ ЧЕРЕЗ ДВЕРІ" }, { id: "silent", label: "МОВЧАТИ" },
        ]);
        await outcomeNote("СУСІДКА", resolveNeighbor(run!, c as "polite" | "silent"));
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
  if (r && id !== "look") toast(`${actionById(id).label} — перервано`);
}

async function outcomeNote(title: string, o: Outcome): Promise<void> {
  const d = Math.round(o.dPsyche);
  await note(title, o.text + (d ? `\n\nПсихіка ${d > 0 ? "+" : ""}${d}` : ""));
}

async function delivery(fake: boolean, volunteer: boolean): Promise<void> {
  if (!run) return;
  A.doorbell();
  if (volunteer) { await outcomeNote("ПЕРЕДАЧКА", resolveDelivery(run, false, true, "leave")); return; }
  let c = await note("ДЗВІНОК У ДВЕРІ", "«Доставка!» Голос за дверима.", [
    { id: "peep", label: "ГЛЯНУТИ В ГЛАЗОК", cls: "main" },
    { id: "leave", label: "«ЗАЛИШТЕ ПІД ДВЕРИМА!»" },
    { id: "ignore", label: "НЕ ВІДПОВІДАТИ" },
  ]);
  if (c === "peep") {
    const { text: seen, kind } = peep(run, fake);
    c = await peepScreen(kind, seen, [
      { id: "open", label: "ВІДЧИНИТИ", sub: "Побачити живу людину", cls: kind !== "courier" ? "danger" : "" },
      { id: "leave", label: "«ЗАЛИШТЕ ПІД ДВЕРИМА!»", cls: "main" },
      { id: "ignore", label: "НЕ ВІДЧИНЯТИ" },
    ]);
  }
  if (fake && c === "open") {
    await note("ДВЕРІ", resolveDelivery(run, true, false, "open").text, [{ id: "go", label: "ЗАЧИНЯТИ!", cls: "danger" }]);
    const ok = await slamGame();
    const o = resolveSlam(run, ok);
    if (!o.ending) await outcomeNote("ЗАЧИНИВ", o);
    return;
  }
  await outcomeNote(fake ? "ДВЕРІ" : "ДОСТАВКА", resolveDelivery(run, fake, false, c as "open" | "leave" | "ignore"));
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
  await new Promise<void>((resolve) => {
    const loop = () => {
      const left = total - (performance.now() - t0) / 1000;
      const safe = scene.inShelter();
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
  await flow(async () => {
    const o = resolveBallistic(run!, safe);
    $("#red-edge").classList.remove("on");
    if (!o.ending) {
      scene.setGlass(run!.day!.glass);
      await outcomeNote(safe ? "ВСТИГ" : "НЕ ВСТИГ", o);
    }
    score.hush = false;
  });
}

// ================================================================ seasons

function startSeason(): void {
  if (!run) return;
  mode = "screen";
  const def = SEASON_DEFS[run.season];
  setText($("#season-eyebrow"), `СЕЗОН ${run.season + 1} / ${SEASONS}`);
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
}

function hud(on: boolean): void {
  $("#hud").classList.toggle("hidden", !on);
  $("#controls").classList.toggle("hidden", !on);
  if (!on) { $("#act-panel").classList.add("hidden"); $("#busy").classList.add("hidden"); }
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
    <div class="delta"><small>ПСИХІКА</small><b class="${rep.dPsyche >= 0 ? "up" : "down"}">${Math.round(run.psyche)} <span style="font-size:14px">(${sign(rep.dPsyche)})</span></b></div>
    <div class="delta"><small>ГРОШІ</small><b class="${run.money >= 0 ? "up" : "down"}">${fmt(run.money)}</b></div>
    <div class="delta"><small>ДНІВ БЕЗ ВУЛИЦІ</small><b>${run.daysInside.toLocaleString("uk-UA")}</b></div>
    <div class="delta"><small>СТЕЛЯ ПСИХІКИ</small><b class="down">${Math.round(maxPsyche(run))}</b></div>`;
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
  $("#end-graph").innerHTML = `<line x1="10" y1="100" x2="310" y2="100" stroke="#3a3640"/>${[0, 4, 8, 12].map((s, i) => `<text x="${10 + (s / 15) * 300}" y="108" fill="#6a6470" font-size="8">${2023 + i}</text>`).join("")}<polyline points="${pts}" fill="none" stroke="#e8c45a" stroke-width="2.5"/>`;
  const dead = r.friends.filter((f) => f.state === "dead").length;
  $("#end-stats").innerHTML = `
    <div class="delta"><small>ДНІВ БЕЗ ВУЛИЦІ</small><b>${r.daysInside.toLocaleString("uk-UA")}</b></div>
    <div class="delta"><small>ТРИВОГ</small><b>${r.stats.alerts}</b></div>
    <div class="delta"><small>СТУКІВ У ДВЕРІ</small><b>${r.stats.knocks}</b></div>
    <div class="delta"><small>ДРУЗІВ ЗАГИНУЛО</small><b class="${dead ? "down" : ""}">${dead}</b></div>`;
  const fresh = after.filter((t) => !before.includes(t));
  setText($("#end-unlock"), fresh.length ? `Відкрито: ${fresh.map((t) => TRAITS.find((x) => x.id === t)!.name).join(", ")}` : `Прожито сезонів за всі забіги: ${meta.seasons}`);
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
    if (a.def.id === "order") b.querySelector("small")!.textContent = a.ok ? `${fmt(Math.round(450 * [1, 1.2, 1.45, 1.7][yearIndex(run)] / 10) * 10)} · +3 їжі` : a.why ?? "";
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
  scene.setMood(!isLight(d) && (isNight(d) || winter(run)) ? "blackout" : isNight(d) ? "night" : d.clock > 19 * 60 ? "dusk" : "home");
  score.despair = dsp;
  amb.update(dt, { despair: dsp, blackout: !isLight(d), birds: yearIndex(run) <= 1 && run.season % 4 !== 0 && !isNight(d) && !d.alert, quiet: !d.alert });
  // the sky
  if (d.alert && !d.alert.ballistic) {
    buzzT += dt;
    A.droneBuzz(0.35 + 0.35 * Math.sin(buzzT / 3) + 0.2 * Math.sin(buzzT / 1.3));
  }
  // the heart
  heartT -= dt;
  if (run.psyche < 25 && heartT <= 0) { heartT = 0.55 + run.psyche / 40; A.play("heart"); }
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
const QN = { low: "НИЗЬКА", medium: "СЕРЕДНЯ", high: "ВИСОКА" } as const;
function syncToggles(): void {
  setText(soundBtn, `ЗВУКИ: ${A.isMuted() ? "ВИКЛ" : "ВКЛ"}`);
  setText(musicBtn, `МУЗИКА: ${A.isMusicMuted() ? "ВИКЛ" : "ВКЛ"}`);
  setText(gfxBtn, `ГРАФІКА: ${QN[scene.post.quality]}`);
}
soundBtn.addEventListener("click", () => { A.setMuted(!A.isMuted()); syncToggles(); });
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
    b.innerHTML = `<b>${locked ? "🔒 " : ""}${esc(t.name)}</b><small>${esc(locked ? `Проживи ${t.unlock} сезонів за всі забіги` : `${t.text} · ${fmt(t.money)}`)}</small>`;
    b.disabled = locked;
    b.addEventListener("click", () => { selected = t.id; A.play("click"); showStart(); });
    box.appendChild(b);
  }
  $("#continue-btn").classList.toggle("hidden", !run);
  setText($("#new-btn"), run ? "НОВИЙ ЗАБІГ" : "ПОЧАТИ");
  setText($("#meta-line"), meta.runs ? `Забігів: ${meta.runs} · найдовше: ${meta.best} сезонів · дожили: ${meta.survived}` : "");
  // a quiet room behind the menu
  scene.setInfo({ clock: 17 * 60, light: true, alert: false, bus: false, despair: 0.2, season: 3, danger: 0 });
  scene.setSeason(run?.season ?? 3, { clutter: run?.clutter ?? 2, plant: 70, plantDead: false, perks: run?.perks ?? [], friends: [], glass: false });
  scene.setPose("stare");
  showScreen("#start-screen");
}

showStart();
