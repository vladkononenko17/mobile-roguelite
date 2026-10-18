import "./rozshuk.css";
import { Scene3D } from "./Scene3D";
import { Music } from "./music";
import { isMusicMuted, isMuted, play, setMusicMuted, setMuted, unlockAudio as unlockSfx } from "./sfx";
import { voice } from "./voice";

let voiceUnlocked = false;
function unlockAudio(): void {
  unlockSfx();
  if (!voiceUnlocked) { voiceUnlocked = true; voice.unlock(); }
}
import {
  ACTIONS, ENDINGS, KNOCK_TEXT, PERKS, SPEAKERS, TRAITS, perkById,
  type ActionId, type Msg, type PerkId, type TraitId,
} from "./content";
import { OutingSim, type OutingEvent } from "./outing";
import { BASE_MODS, DIR_ARROW, Qte, holdSpec, timingSpec, type Dir } from "./qte";
import {
  availableActions, canWork, choosePath, choosePerk, doAction, endOuting, eventById, fmt, has, level, newRun, outingContext,
  resolveEventChoice, resolveKnock, runXp, unlockedTraits, type RunState,
} from "./run";
import { bankRun, loadMeta, loadRun, saveMeta, saveRun } from "./save";

function el<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing UI element: ${selector}`);
  return found;
}
const $ = el;

const scene = new Scene3D($("#game-shell"), $("#fx"));
const music = new Music();
const meta = loadMeta();
let run: RunState | null = loadRun();
let sim: OutingSim | null = null;
let homeQte: { q: Qte; kind: "work" | "knock"; done: (q: Qte) => void } | null = null;
let shownQte: Qte | null = null;
let selectedTrait: TraitId = unlockedTraits(meta.xp).includes(meta.lastTrait) ? meta.lastTrait : "it";
let busy = false;
// console helpers for playtesting
Object.assign(window as unknown as Record<string, unknown>, { __rozshuk: { scene, get run() { return run; }, get sim() { return sim; } } });

// ================================================================ helpers

const SCREENS = ["#start-screen", "#chat-screen", "#event-screen", "#brief-screen", "#result-screen", "#perk-screen", "#fork-screen", "#end-screen", "#pause-screen"];
function showScreen(id: string | null): void {
  for (const s of SCREENS) $(s).classList.toggle("active", s === id);
  if (id) $("#toast").classList.remove("show");
}
function setText(node: HTMLElement, v: string): void { if (node.textContent !== v) node.textContent = v; }
let toastTimer = 0;
function toast(text: string, bad = false): void {
  const t = $("#toast");
  t.textContent = text;
  t.classList.toggle("bad", bad);
  t.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), 2000);
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const money = (n: number) => `${fmt(n)} ₴`;
const signed = (n: number, suffix = "") => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}${suffix}`;
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function hud(which: "none" | "home" | "out"): void {
  $("#home-hud").classList.toggle("hidden", which !== "home");
  $("#home-panel").classList.toggle("hidden", which !== "home");
  $("#out-hud").classList.toggle("hidden", which !== "out");
  $("#controls").classList.toggle("hidden", which !== "out");
}

// ================================================================ start

function renderStart(): void {
  const unlocked = unlockedTraits(meta.xp);
  const list = $("#trait-list");
  list.innerHTML = "";
  for (const t of TRAITS) {
    const ok = unlocked.includes(t.id);
    const b = document.createElement("button");
    b.className = `trait${ok ? "" : " locked"}`;
    b.setAttribute("aria-pressed", String(t.id === selectedTrait));
    b.disabled = !ok;
    b.innerHTML = `<b>${ok ? t.icon : "🔒"}</b><div><strong>${t.name}</strong><small>${ok ? t.text : `Відкривається на ${t.xp} досвіду`}</small></div>`;
    b.addEventListener("click", () => { selectedTrait = t.id; play("click"); renderStart(); });
    list.appendChild(b);
  }
  $("#continue-button").classList.toggle("hidden", !run);
  if (run) $("#continue-button").textContent = `ПРОДОВЖИТИ · ДЕНЬ ${run.day}`;
  const ends = Object.entries(meta.endings).filter(([k]) => k !== "caught").length;
  $("#meta-line").innerHTML = meta.runs
    ? `Досвід втікача: <b>${meta.xp}</b> · забігів ${meta.runs} · найдовше ${meta.bestDay} дн. · кінцівок ${ends}/2`
    : "Ходи — джойстик (ліва частина екрана), «БІГ» — праворуч. Стій у кущах, щоб сховатися.<br/>Між вилазками — дім: робота, їжа, сон, новини.";
}

function newGame(): void {
  run = newRun(selectedTrait);
  meta.lastTrait = selectedTrait;
  saveMeta(meta);
  saveRun(run);
  void enterHome();
}

// ================================================================ home

const STATUS_LABEL: Array<[(r: RunState) => boolean, string, string]> = [
  [(r) => r.breakdown, "😵 ЗРИВ: −1 ДІЯ", "bad"],
  [(r) => r.blackout, "🕯️ БЛЕКАУТ", "bad"],
  [(r) => r.satiety < 15, "🥴 ГОЛОДНИЙ", "bad"],
  [(r) => r.nerves > 75, "😰 НА НЕРВАХ", "bad"],
  [(r) => r.doorWatch, "🚪 ЧЕКАЮТЬ БІЛЯ ПІДʼЇЗДУ", "bad"],
  [(r) => r.prices > 1, "📈 ЦІНИ +30%", "bad"],
  [(r) => !!r.flags.laptopDead && !r.flags.laptop, "💻 НОУТ МЕРТВИЙ", "bad"],
  [(r) => r.intel, "📡 МАРШРУТИ ВІДОМІ", "good"],
  [(r) => r.pumped, "💪 РОЗІМ'ЯВСЯ", "good"],
];

function renderHome(): void {
  if (!run) return;
  const lv = level(run);
  setText($("#day-text"), `ДЕНЬ ${run.day}/30 · ${run.path === "border" ? "🌲 КОРДОН" : run.path === "legal" ? "🕴️ ОФІЦІЙНО" : "ВДОМА"}`);
  setText($("#level-title"), lv.title);
  setText($("#st-money"), money(run.money));
  setText($("#st-food"), String(run.food));
  $("#st-satiety").style.transform = `scaleX(${run.satiety / 100})`;
  $("#st-nerves").style.transform = `scaleX(${run.nerves / 100})`;
  $("#st-heat").style.transform = `scaleX(${run.heat / 100})`;
  const st = $("#status-row");
  const chips = STATUS_LABEL.filter(([f]) => f(run!)).map(([, t, c]) => `<span class="${c}">${t}</span>`);
  for (const p of run.perks) { const k = perkById(p); if (k) chips.push(`<span class="perk" title="${k.name}">${k.icon}</span>`); }
  for (const it of run.items) chips.push(`<span class="good">${ITEM_LABEL[it] ?? it}</span>`);
  st.innerHTML = chips.join("");
  $("#ap-pips").innerHTML = Array.from({ length: run.apMax }, (_, i) => `<i class="${i < run!.ap ? "" : "used"}"></i>`).join("");
  const grid = $("#action-grid");
  const avail = availableActions(run);
  grid.innerHTML = "";
  for (const a of ACTIONS) {
    if (!avail.includes(a.id)) continue;
    const b = document.createElement("button");
    let off = run.ap <= 0;
    if (a.id === "work" && !canWork(run).ok) off = true;
    if (a.id === "eat" && run.food <= 0) off = true;
    if (a.id === "scroll" && run.intel) off = true;
    if (a.id === "pushups" && run.pumped) off = true;
    b.className = `action${off ? " off" : ""}`;
    b.dataset.id = a.id;
    b.innerHTML = `<b>${a.icon}</b><span>${a.name}</span>`;
    b.title = a.text;
    b.addEventListener("click", () => void onAction(a.id, b));
    grid.appendChild(b);
  }
  const unread = !run.flags[`chat_${lv.id}`];
  $("#chat-badge").classList.toggle("hidden", !unread);
  setText($("#go-button"), run.ap > 0 ? "НА ВИЛАЗКУ →" : "НА ВИЛАЗКУ! →");
}

const ITEM_LABEL: Record<string, string> = {
  powerbank: "🔋 ЗАРЯДНА", backpack: "🎒 РЮКЗАК", blanket: "🪩 ТЕРМОКОВДРА", drybag: "🛍️ ГЕРМОМІШОК", bron: "🛡️ БРОНЬ",
};

async function enterHome(): Promise<void> {
  if (!run) return;
  sim = null;
  const lv = level(run);
  const abandoned = !!run.flags.inOuting;
  if (abandoned) {
    // walking out of an outing halfway is not free
    delete run.flags.inOuting;
    run.heat = Math.min(100, run.heat + 10);
  }
  scene.showHome({ blackout: run.blackout, cat: !!run.flags.cat, night: !!lv.night, hoodie: has(run, "hoodie"), heat: run.heat });
  music.mode = "home";
  showScreen(null);
  hud("home");
  renderHome();
  saveRun(run);
  busy = true;
  try {
    if (abandoned) { toast("Кинув вилазку на півдорозі — розшук +10", true); await wait(1200); }
    if (!run.flags[`chat_${lv.id}`]) {
      await wait(400);
      await showChat(lv.chat, `ДНІ ${lv.n * 2 - 1}–${lv.n * 2}`);
      run.flags[`chat_${lv.id}`] = true;
    }
    if (run.breakdown && !run.flags[`brk_${lv.id}`]) {
      run.flags[`brk_${lv.id}`] = true;
      toast("Нервовий зрив. Пів дня лежав у ванній. −1 дія", true);
      await wait(900);
    }
    if (run.event && !run.flags[`ev_${lv.id}`]) {
      await showEvent();
      run.flags[`ev_${lv.id}`] = true;
    }
    if (run.knock) await knock();
  } finally {
    busy = false;
    saveRun(run);
    showScreen(null);
    hud("home");
    renderHome();
  }
}

function showChat(msgs: Msg[], day: string, typing = true): Promise<void> {
  return new Promise((resolve) => {
    showScreen("#chat-screen");
    hud("none");
    setText($("#chat-day"), day);
    const list = $("#chat-list");
    list.innerHTML = "";
    const ok = $<HTMLButtonElement>("#chat-ok");
    ok.disabled = typing;
    let i = 0;
    let skip = !typing;
    const add = () => {
      if (i >= msgs.length) { ok.disabled = false; return; }
      const m = msgs[i++];
      list.appendChild(msgEl(m));
      list.lastElementChild?.scrollIntoView({ block: "end" });
      play("ping");
      if (skip) add();
      else setTimeout(add, 450 + Math.min(1400, m.text.length * 22));
    };
    add();
    $("#chat-screen").onclick = (e) => { if (e.target !== ok && !skip) { skip = true; while (i < msgs.length) { list.appendChild(msgEl(msgs[i++])); } ok.disabled = false; } };
    ok.onclick = () => { play("click"); $("#chat-screen").onclick = null; resolve(); };
  });
}

function msgEl(m: Msg): HTMLElement {
  const sp = SPEAKERS[m.from];
  const d = document.createElement("div");
  d.className = `msg${m.from === "me" ? " me" : ""}`;
  d.style.setProperty("--c", sp.color);
  d.innerHTML = `<span class="ava">${sp.icon}</span><div class="body"><span class="who"></span><p></p></div>`;
  d.querySelector(".who")!.textContent = sp.name;
  d.querySelector("p")!.textContent = m.text;
  return d;
}

function effectText(e?: { money?: number; nerves?: number; heat?: number; food?: number; flag?: string }): string {
  if (!e) return "";
  const parts: string[] = [];
  if (e.money) parts.push(`${signed(e.money)} ₴`);
  if (e.food) parts.push(`запаси ${signed(e.food)}`);
  if (e.nerves) parts.push(`нерви ${signed(e.nerves)}`);
  if (e.heat) parts.push(`розшук ${signed(e.heat)}`);
  return parts.join(" · ");
}

function showEvent(): Promise<void> {
  return new Promise((resolve) => {
    const e = eventById(run!.event!);
    if (!e) { resolve(); return; }
    showScreen("#event-screen");
    hud("none");
    setText($("#event-icon"), e.icon);
    setText($("#event-title"), e.title);
    const fx = effectText(e.effect);
    $("#event-text").innerHTML = `${e.text}${fx ? `<br/><b>${fx}</b>` : ""}`;
    const box = $("#event-choices");
    box.innerHTML = "";
    const choices = e.choices ?? [{ label: "ЯСНО", effect: {} }];
    choices.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = i === 0 ? "primary-button" : "secondary-button";
      const t = effectText(c.effect);
      b.innerHTML = `${c.label}${t ? `<br/><small style="font-size:11px;letter-spacing:.02em">${t}</small>` : ""}`;
      b.addEventListener("click", () => {
        play("click");
        if (e.choices) resolveEventChoice(run!, i);
        resolve();
      });
      box.appendChild(b);
    });
    play(e.id === "scam" ? "phone" : "ping");
  });
}

function knock(): Promise<void> {
  return new Promise((resolve) => {
    showScreen(null);
    hud("home");
    play("knock");
    scene.setHomePose("hide");
    setTimeout(() => play("knock"), 1600);
    const m = { ...BASE_MODS, tier: Math.min(3, Math.ceil(level(run!).n / 5)), zone: has(run!, "lungs") ? 1.4 : 1 };
    const q = new Qte(holdSpec("ТУК-ТУК-ТУК", `${KNOCK_TEXT}. Затамуй подих: тримай кнопку, щоб маркер був у зеленій смузі.`, m, 4.5));
    homeQte = {
      q, kind: "knock",
      done: (qq) => {
        const ok = qq.result === "win";
        resolveKnock(run!, ok);
        toast(ok ? "Пішли. Здається, пронесло" : "Вони почули. Чекатимуть біля підʼїзду", !ok);
        play(ok ? "lost" : "fail");
        scene.setHomePose("idle");
        resolve();
      },
    };
    openQte(q, "knock");
  });
}

async function onAction(id: ActionId, btn: HTMLElement): Promise<void> {
  if (!run || busy || homeQte) return;
  unlockAudio();
  if (run.ap <= 0) { toast("Сил на сьогодні більше немає — час на вилазку", true); return; }
  if (id === "work") {
    const w = canWork(run);
    if (!w.ok) { toast(w.why!, true); return; }
    scene.setHomePose("work");
    const m = { ...BASE_MODS, zone: has(run, "parkour") ? 1.15 : 1, tier: run.nerves > 75 ? 2 : 1 };
    const q = new Qte(timingSpec("ВІДДАЛЕНКА", "Закривай тікети: тисни, коли маркер у зеленій зоні. 5 тікетів.", m, 5, 2));
    homeQte = {
      q, kind: "work",
      done: (qq) => {
        const quality = qq.result === "win" ? 1 : qq.hits / 5;
        const r = doAction(run!, "work", quality);
        toast(`${qq.hits}/5 тікетів · ${r.text}`);
        play("coin");
        afterAction(btn);
      },
    };
    openQte(q, "work");
    return;
  }
  const r = doAction(run, id);
  if (!r.ok) { toast(r.text, true); return; }
  scene.setHomePose(id);
  play(id === "eat" ? "eat" : id === "sleep" ? "snore" : id === "mama" ? "phone" : id === "cat" ? "purr" : id === "scroll" ? "ping" : "click");
  toast(r.text);
  afterAction(btn);
}

function afterAction(btn: HTMLElement): void {
  saveRun(run);
  renderHome();
  const again = document.querySelector<HTMLElement>(`.action[data-id="${btn.dataset.id}"]`);
  again?.classList.add("flash");
  setTimeout(() => again?.classList.remove("flash"), 400);
}

// ================================================================ outing

function openBrief(): void {
  if (!run || busy) return;
  const lv = level(run);
  showScreen("#brief-screen");
  hud("none");
  setText($("#brief-eyebrow"), `ДНІ ${lv.n * 2 - 1}–${lv.n * 2} · ВИЛАЗКА ${lv.n}/15`);
  setText($("#brief-title"), lv.title);
  setText($("#brief-text"), lv.brief);
  $("#brief-objs").innerHTML = lv.objectives.map((o) => {
    const price = o.cost ? (o.kind === "shop" ? Math.round(o.cost * run!.prices) : o.cost) : 0;
    const short = price > run!.money;
    return `<li class="${o.optional ? "opt" : ""}"><em>${o.icon}</em>${o.label}${o.optional ? " · за бажанням" : ""}${price ? `<small style="${short ? "color:#d63732" : ""}">${money(price)}</small>` : ""}</li>`;
  }).join("") + (lv.survive ? `<li><em>⏱️</em>Протримайся ${lv.survive} с і вийди</li>` : "") + (!lv.objectives.length && !lv.survive ? `<li><em>🧭</em>Дійди до виходу</li>` : "");
  const notes: string[] = [];
  notes.push(run.intel ? `<span class="good">📡 МАРШРУТИ ВІДОМІ</span>` : `<span>📡 МАРШРУТИ НЕВІДОМІ</span>`);
  notes.push(`<span class="${run.heat >= 60 ? "bad" : ""}">🔎 РОЗШУК ${Math.round(run.heat)}%</span>`);
  if (lv.night) notes.push(`<span>🌙 НІЧ</span>`);
  if (lv.weather !== "clear") notes.push(`<span>${{ rain: "🌧️ ДОЩ", fog: "🌫️ ТУМАН", snow: "❄️ СНІГ", clear: "" }[lv.weather]}</span>`);
  if (lv.curfew) notes.push(`<span>⏰ КОМЕНДАНТСЬКА ЧЕРЕЗ ${mmss(lv.curfew)}</span>`);
  if (run.doorWatch) notes.push(`<span class="bad">🚪 ЧЕКАЮТЬ БІЛЯ ПІДʼЇЗДУ</span>`);
  if (run.satiety < 15) notes.push(`<span class="bad">🥴 ГОЛОДНИЙ: МАЛО СИЛ</span>`);
  if (run.pumped) notes.push(`<span class="good">💪 +ВИТРИВАЛІСТЬ</span>`);
  if (run.path === "border" && lv.n >= 13 && !run.flags.guide) notes.push(`<span class="bad">🌲 БЕЗ ПРОВІДНИКА</span>`);
  if (run.items.includes("blanket") && (lv.map === "forest" || lv.map === "river")) notes.push(`<span class="good">🪩 ТЕРМОКОВДРА: СТІЙ — ДРОН НЕ БАЧИТЬ</span>`);
  if (run.items.includes("bron")) notes.push(`<span class="good">🛡️ БРОНЬ ПРИ СОБІ</span>`);
  $("#brief-notes").innerHTML = notes.join("");
  play("click");
}

function startOuting(): void {
  if (!run) return;
  unlockAudio();
  music.start();
  sim = new OutingSim(outingContext(run));
  run.flags.inOuting = true;
  saveRun(run);
  scene.startOuting(sim, { hoodie: has(run, "hoodie"), intel: run.intel, arrows: has(run, "intel") });
  music.mode = "outing";
  showScreen(null);
  hud("out");
  buildObjList();
  setText($("#out-day"), `ДЕНЬ ${run.day} · ${level(run).title.toUpperCase()}`);
  stepT = 0;
  play("door");
  toast(level(run).brief);
}

function buildObjList(): void {
  if (!sim) return;
  const ul = $("#obj-list");
  ul.innerHTML = "";
  for (const o of sim.objectives) {
    const li = document.createElement("li");
    li.dataset.slot = o.slot;
    const price = sim.priceOf(o);
    li.innerHTML = `${o.def.icon} ${o.def.label}${price ? ` <small>${money(price)}</small>` : ""}`;
    ul.appendChild(li);
  }
  if (sim.level.survive) {
    const li = document.createElement("li");
    li.dataset.slot = "survive";
    ul.appendChild(li);
  }
  const exit = document.createElement("li");
  exit.dataset.slot = "exit";
  ul.appendChild(exit);
}

let stepT = 0;
let heartT = 0;
let lastAlertCls = "";

function frameOuting(dt: number): void {
  if (!sim) return;
  const a = sim.alert;
  const chase = sim.chased;
  $("#alert-bar").style.transform = `scaleX(${chase ? 1 : a})`;
  const cls = chase ? "chase" : a > 0.3 ? "sus" : "";
  if (cls !== lastAlertCls) {
    const block = $(".alert-block");
    block.classList.toggle("sus", cls === "sus");
    block.classList.toggle("chase", cls === "chase");
    lastAlertCls = cls;
    setText($("#alert-text"), chase ? "ПОГОНЯ!" : a > 0.3 ? "ПІДОЗРА" : "ТИХО");
  }
  const vig = $("#alert-vignette");
  vig.style.opacity = chase ? "1" : String(Math.max(0, (a - 0.3) * 0.9));
  vig.classList.toggle("chase", chase);
  music.intensity = chase ? 1 : a;
  scene.setDanger(chase ? 1 : Math.max(0, (a - 0.35) * 0.8));
  if (a > 0.55 && sim.phase === "explore") {
    heartT -= dt;
    if (heartT <= 0) { play("heart"); heartT = chase ? 0.45 : 0.75; }
  }
  const time = $("#out-time");
  if (sim.level.curfew && !sim.curfewOn) setText(time, `⏰ ${mmss(Math.max(0, sim.level.curfew - sim.time))}`);
  else setText(time, mmss(sim.time));
  time.classList.toggle("curfew", sim.curfewOn);
  setText($("#out-money"), money(sim.wallet));
  $("#stamina-fill").style.transform = `scaleX(${sim.stamina / sim.staminaMax})`;
  $("#sprint-button").classList.toggle("tired", sim.stamina < 5);
  $("#act-button").classList.toggle("hidden", !sim.vaultCell || sim.phase !== "explore");
  for (const li of Array.from($("#obj-list").children) as HTMLElement[]) {
    const slot = li.dataset.slot!;
    if (slot === "exit") {
      const show = sim.exitOpen && !sim.level.noExit;
      li.classList.toggle("hidden", !show);
      setText(li, sim.level.map === "train" ? "🚪 У тамбур і на вихід" : sim.rows.some((r) => r.includes("!")) ? "🧭 Йди далі (вихід)" : "🏠 Повертайся додому");
      continue;
    }
    if (slot === "survive") {
      const left = Math.max(0, (sim.level.survive ?? 0) - sim.time);
      setText(li, left > 0 ? `⏱️ До станції ${Math.ceil(left)} с` : "⏱️ Станція!");
      li.classList.toggle("done", left <= 0);
      continue;
    }
    const o = sim.objectives.find((x) => x.slot === slot);
    if (!o) continue;
    li.classList.toggle("done", o.done);
    li.classList.toggle("opt", !!o.def.optional && !o.done);
    li.classList.toggle("locked", !o.done && !sim.objectiveOpen(o));
  }
  // input
  const kx = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  const kz = (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
  if (sim.phase === "explore") {
    if (kx || kz) sim.setMove(kx, kz);
    else sim.setMove(stick.x, stick.y);
    sim.setSprint(sprintHeld || keys.has("ShiftLeft") || keys.has("ShiftRight"));
  }
  $("#sprint-button").classList.toggle("on", sim.sprinting);
}

function handleOutingEvents(ev: OutingEvent[]): void {
  if (!sim) return;
  for (const e of ev) {
    switch (e.type) {
      case "step":
        stepT++;
        if (stepT % 1 === 0) play("step");
        break;
      case "say":
        voice.say(e.text, e.id === "babka" ? "babka" : e.id === "me" ? "me" : "officer");
        break;
      case "spotted":
        play("spotted");
        setTimeout(() => play("whistle"), 250);
        if (navigator.vibrate) navigator.vibrate(120);
        break;
      case "suspicious": play("huh"); break;
      case "heard": play("huh"); break;
      case "lost": play("lost"); toast("Відірвався!"); break;
      case "grab": play("grab"); if (navigator.vibrate) navigator.vibrate([60, 40, 160]); break;
      case "qte": openQte(e.qte, "outing"); break;
      case "freed": {
        const t = { break: "Вирвався! Тікай!", talk: "Заговорив зуби. «Ну йди, але ми тебе запамʼятали»", docs: "Бронь спрацювала. «Вибачте, вільні»", van: "Вистрибнув з бусу!!!", lawyer: "Адвокат на звʼязку. Відпустили", dog: "«А, з собакою… Ну йди»" }[e.how];
        toast(t);
        play(e.how === "van" ? "van" : "win");
        break;
      }
      case "caught":
        voice.say("Ні-ні-ні, я ж на удальонці!", "me");
        play("van");
        setTimeout(() => play("fail"), 700);
        void finishOuting();
        break;
      case "objDone": {
        const o = sim.objectives.find((x) => x.slot === e.slot);
        play(o?.def.cost ? "coin" : "ping");
        if (o) toast(`${o.def.icon} ${o.def.label}${e.short ? " — грошей не вистачило" : " ✓"}`, e.short);
        break;
      }
      case "noMoney": toast("Не вистачає грошей!", true); break;
      case "babkaCall": play("phone"); toast("Бабця дзвонить «куди слід»! Розшук +", true); break;
      case "bark": play("bark"); break;
      case "vanStop": play("van"); toast("Бус зупинився — вибігають!", true); break;
      case "droneSpot": play("spotted"); toast("Дрон тебе бачить! Прикордонники йдуть", true); break;
      case "curfew": play("curfew"); toast("КОМЕНДАНТСЬКА! Більше патрулів", true); break;
      case "exitOpen": play("ping"); toast(sim.level.map === "train" ? "Станція! До тамбура" : "Готово. Тепер — до виходу"); break;
      case "vault": play(e.ok ? "vault" : "miss"); if (!e.ok) toast("Зірвався з паркану — гучно!", true); break;
      case "riverFail": play("splash"); toast("Течія знесла назад! Ще одна спроба", true); break;
      case "won": play("win"); void finishOuting(); break;
      default: break;
    }
  }
  if (sim.phase !== "qte" && shownQte && !homeQte) closeQte();
}

async function finishOuting(): Promise<void> {
  if (!run || !sim) return;
  const s = sim;
  const caught = s.phase === "caught";
  const before = { money: run.money, food: run.food, heat: run.heat, nerves: run.nerves };
  await wait(caught ? 1400 : 700);
  if (sim !== s) return;
  const lv = level(run);
  const r = s.result();
  delete run.flags.inOuting;
  endOuting(run, r);
  sim = null;
  closeQte();
  hud("none");
  music.intensity = 0;
  $("#alert-vignette").style.opacity = "0";
  scene.setDanger(0);
  saveRun(run.phase === "end" ? null : run);
  if (caught) { showEnd(); return; }
  showScreen("#result-screen");
  setText($("#result-eyebrow"), `ДНІ ${lv.n * 2 - 1}–${lv.n * 2} · ${lv.title.toUpperCase()}`);
  setText($("#result-title"), r.perfect ? "ЯК ТІНЬ" : r.spotted > 2 ? "ЛЕДВЕ ВТІК" : "ПОВЕРНУВСЯ");
  const cell = (v: string, label: string, cls = "") => `<div><strong class="${cls}">${v}</strong><span>${label}</span></div>`;
  const dm = run.money - before.money;
  const df = run.food - before.food;
  const dh = Math.round(run.heat - before.heat);
  $("#result-stats").innerHTML =
    cell(signed(dm), "ГРОШІ, ₴", dm >= 0 ? "up" : "down") +
    cell(signed(df), "ЗАПАСИ", df >= 0 ? "up" : "down") +
    cell(signed(dh), "РОЗШУК", dh <= 0 ? "up" : "down") +
    cell(String(r.spotted), "ПОМІТИЛИ", r.spotted ? "down" : "up") +
    cell(String(r.escapes), "ВІДІРВАВСЯ") +
    cell(mmss(r.time), "ЧАС");
  const chat = $("#result-chat");
  chat.innerHTML = "";
  const outro = [...lv.outro];
  if (r.unpaid.length) outro.push({ from: "me", text: "Грошей не вистачило. Це погано скінчиться…" });
  if (r.perfect) outro.push({ from: "channel", text: "Сьогодні в районі тихо. Нікого не впакували 👀" });
  for (const m of outro) chat.appendChild(msgEl(m));
  setText($("#result-next"), run.phase === "fork" ? "ВИРІШУВАТИ →" : run.phase === "end" ? "ФІНАЛ →" : "ДАЛІ →");
}

function afterResult(): void {
  if (!run) return;
  play("click");
  if (run.phase === "fork") { showScreen("#fork-screen"); return; }
  if (run.phase === "perk") { showPerks(); return; }
  if (run.phase === "end") { showEnd(); return; }
  void enterHome();
}

function showPerks(): void {
  if (!run) return;
  showScreen("#perk-screen");
  const list = $("#perk-list");
  list.innerHTML = "";
  for (const id of run.perkOffer) {
    const p = PERKS.find((x) => x.id === id)!;
    const b = document.createElement("button");
    b.className = "perk";
    b.innerHTML = `<b>${p.icon}</b><div><strong>${p.name}</strong><span>${p.text}</span></div>`;
    b.addEventListener("click", () => pickPerk(id));
    list.appendChild(b);
  }
}

function pickPerk(id: PerkId | null): void {
  if (!run) return;
  play(id ? "coin" : "click");
  choosePerk(run, id);
  if (run.phase === "end") { showEnd(); return; }
  void enterHome();
}

function showEnd(): void {
  if (!run) return;
  const ending = run.ending ?? "caught";
  const xp = runXp(run);
  const before = unlockedTraits(meta.xp);
  bankRun(meta, run, xp);
  const now = unlockedTraits(meta.xp).filter((t) => !before.includes(t));
  showScreen("#end-screen");
  hud("none");
  music.mode = "home";
  const e = ENDINGS[ending];
  setText($("#end-sticker"), ending === "caught" ? `ДЕНЬ ${run.day}` : "ПЕРЕМОГА?");
  $("#end-sticker").style.background = ending === "caught" ? "var(--red)" : "var(--acid)";
  setText($("#end-title"), e.title);
  setText($("#end-text"), e.text);
  const cell = (v: string, label: string) => `<div><strong>${v}</strong><span>${label}</span></div>`;
  $("#end-stats").innerHTML = cell(String(run.day), "ДНІВ") + cell(fmt(run.stats.earned), "ЗАРОБЛЕНО ₴") + cell(String(run.stats.spotted), "ПОМІТИЛИ")
    + cell(String(run.stats.escapes), "ВТЕЧ") + cell(String(run.stats.perfect), "ЧИСТИХ ВИЛАЗОК") + cell(String(run.perks.length), "ПЕРКІВ");
  setText($("#end-xp"), `+${xp} досвіду · всього ${meta.xp}${now.length ? ` · відкрито: ${now.map((t) => TRAITS.find((x) => x.id === t)!.name).join(", ")}` : ""}`);
  play(ending === "caught" ? "fail" : "win");
  run = null;
}

// ================================================================ QTE overlay

let qteKind: "work" | "knock" | "outing" = "outing";
function openQte(q: Qte, kind: "work" | "knock" | "outing"): void {
  shownQte = q;
  qteKind = kind;
  const box = $("#qte");
  box.classList.remove("hidden");
  setText($("#qte-title"), q.spec.title);
  setText($("#qte-prompt"), q.spec.prompt);
  const body = $("#qte-body");
  const s = q.spec;
  switch (s.kind) {
    case "mash":
      body.innerHTML = `<div class="qte-mash"><button class="qte-big" id="qte-btn">ТИСНИ!</button><div class="qte-progress"><i id="qte-prog"></i></div></div>`;
      break;
    case "timing":
      body.innerHTML = `<div class="qte-track"><div class="qte-zone" id="qte-zone"></div><div class="qte-marker" id="qte-marker"></div></div><div class="qte-hits" id="qte-hits"></div><button class="qte-tap" id="qte-btn">ТИСНИ</button>`;
      break;
    case "swipe":
      body.innerHTML = `<div class="qte-seq" id="qte-seq">${q.seq.map((d) => `<span>${DIR_ARROW[d]}</span>`).join("")}</div><div class="qte-arrow" id="qte-arrow"></div>
        <div class="qte-pad">${(["up", "left", "down", "right"] as Dir[]).map((d) => `<button class="${d}" data-dir="${d}">${DIR_ARROW[d]}</button>`).join("")}</div>`;
      body.querySelectorAll<HTMLButtonElement>("[data-dir]").forEach((b) => b.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); qteSwipe(b.dataset.dir as Dir); }));
      break;
    case "hold":
      body.innerHTML = `<div class="qte-hold"><div class="qte-vtrack"><div class="qte-band" id="qte-band"></div><div class="qte-vmarker" id="qte-marker"></div></div>
        <div><div class="qte-progress"><i id="qte-prog"></i></div><button class="qte-big" id="qte-btn" style="margin-top:14px">ТРИМАЙ</button></div></div>`;
      break;
    case "choice":
      body.innerHTML = `<div class="qte-choice">${(s.options ?? []).map((o, i) => `<button data-id="${o.id}"><kbd>${i + 1}</kbd>${o.label}</button>`).join("")}</div>`;
      body.querySelectorAll<HTMLButtonElement>("[data-id]").forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); play("click"); qteChoose(b.dataset.id!); }));
      break;
  }
  if (s.kind === "timing") {
    const z = $("#qte-zone");
    const [a, b] = q.zone;
    z.style.left = `${a * 100}%`;
    z.style.width = `${(b - a) * 100}%`;
  }
  if (s.kind === "hold") {
    const [a, b] = q.band;
    const band = $("#qte-band");
    band.style.bottom = `${a * 100}%`;
    band.style.height = `${(b - a) * 100}%`;
  }
}

function closeQte(): void {
  shownQte = null;
  $("#qte").classList.add("hidden");
  holdDown = false;
}

let lastFlash: string | null = null;
function frameQte(dt: number): void {
  if (homeQte) {
    homeQte.q.update(dt);
    if (homeQte.q.done) {
      const h = homeQte;
      homeQte = null;
      closeQte();
      h.done(h.q);
      return;
    }
  }
  const q = sim?.qte ?? homeQte?.q ?? null;
  if (!q) return;
  if (q !== shownQte) openQte(q, homeQte ? homeQte.kind : "outing");
  const s = q.spec;
  const timer = $("#qte-timer");
  const frac = s.kind === "swipe" ? 1 - q.stepT / (s.stepTime ?? 1.2) : 1 - q.t / s.time;
  timer.style.transform = `scaleX(${Math.max(0, frac)})`;
  if (s.kind === "mash" || s.kind === "hold") { const p = document.getElementById("qte-prog"); if (p) p.style.transform = `scaleX(${q.progress})`; }
  if (s.kind === "timing") {
    const m = document.getElementById("qte-marker");
    if (m) m.style.left = `${q.marker * 100}%`;
    const z = document.getElementById("qte-zone");
    if (z) { const [a, b] = q.zone; z.style.left = `${a * 100}%`; z.style.width = `${(b - a) * 100}%`; }
    const h = document.getElementById("qte-hits");
    if (h) setText(h, `${q.hits}/${s.hits ?? 1} · промахів можна ще: ${Math.max(0, (s.lives ?? 0) - q.misses)}`);
  }
  if (s.kind === "hold") {
    const m = document.getElementById("qte-marker");
    if (m) m.style.bottom = `${q.marker * 100}%`;
    const b = document.getElementById("qte-btn");
    b?.classList.toggle("press", q.holding);
  }
  if (s.kind === "swipe") {
    const spans = document.querySelectorAll("#qte-seq span");
    spans.forEach((sp, i) => { sp.classList.toggle("done", i < q.step); sp.classList.toggle("now", i === q.step); });
    const ar = document.getElementById("qte-arrow");
    if (ar) setText(ar, q.seq[q.step] ? DIR_ARROW[q.seq[q.step]] : "✓");
  }
  if (q.flash !== lastFlash) {
    const card = $(".qte-card");
    card.classList.remove("hit", "miss");
    if (q.flash) {
      void card.offsetWidth;
      card.classList.add(q.flash);
      play(q.flash === "hit" ? (qteKind === "work" ? "type" : "hit") : "miss");
    }
    lastFlash = q.flash;
  }
}

function activeQte(): Qte | null { return sim?.qte ?? homeQte?.q ?? null; }
function qteTap(): void {
  const q = activeQte();
  if (!q) return;
  if (q.spec.kind === "mash") { q.tap(); play("hit"); const b = document.getElementById("qte-btn"); b?.classList.add("press"); setTimeout(() => b?.classList.remove("press"), 70); }
  else if (q.spec.kind === "timing") q.tap();
}
let holdDown = false;
function qteHold(down: boolean): void {
  const q = activeQte();
  if (!q || q.spec.kind !== "hold") return;
  holdDown = down;
  q.press(down);
}
function qteSwipe(d: Dir): void {
  const q = activeQte();
  if (!q || q.spec.kind !== "swipe") return;
  q.swipe(d);
}
function qteChoose(id: string): void {
  const q = activeQte();
  if (!q || q.spec.kind !== "choice") return;
  q.choose(id);
}

// pointer input on the QTE overlay: taps, holds and swipe gestures
{
  const box = $("#qte");
  let start: { x: number; y: number } | null = null;
  box.addEventListener("pointerdown", (e) => {
    const q = activeQte();
    if (!q) return;
    unlockAudio();
    if (q.spec.kind === "mash" || q.spec.kind === "timing") qteTap();
    if (q.spec.kind === "hold") qteHold(true);
    if (q.spec.kind === "swipe") start = { x: e.clientX, y: e.clientY };
  });
  const up = (e: PointerEvent) => {
    const q = activeQte();
    if (q?.spec.kind === "hold") qteHold(false);
    if (q?.spec.kind === "swipe" && start) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > 32) qteSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    }
    start = null;
  };
  box.addEventListener("pointerup", up);
  box.addEventListener("pointercancel", up);
}

// ================================================================ controls

const stick = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
let sprintHeld = false;
const keys = new Set<string>();
{
  const zone = $("#stick-zone");
  const base = $("#stick-base");
  const knob = $("#stick-knob");
  const R = 52;
  zone.addEventListener("pointerdown", (e) => {
    if (stick.id !== -1) return;
    unlockAudio();
    stick.id = e.pointerId;
    const rect = zone.getBoundingClientRect();
    stick.ox = e.clientX - rect.left;
    stick.oy = e.clientY - rect.top;
    base.style.left = `${stick.ox}px`;
    base.style.top = `${stick.oy}px`;
    base.classList.remove("hidden");
    knob.style.transform = "";
    zone.setPointerCapture(e.pointerId);
    $(".stick-hint").classList.add("hidden");
  });
  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== stick.id) return;
    const rect = zone.getBoundingClientRect();
    let dx = e.clientX - rect.left - stick.ox;
    let dy = e.clientY - rect.top - stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx *= R / len; dy *= R / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = Math.min(1, len / R);
    stick.x = len > 6 ? (dx / Math.max(len, 1)) * (len > R ? 1 : k) : 0;
    stick.y = len > 6 ? (dy / Math.max(len, 1)) * (len > R ? 1 : k) : 0;
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== stick.id) return;
    stick.id = -1;
    stick.x = 0;
    stick.y = 0;
    base.classList.add("hidden");
  };
  zone.addEventListener("pointerup", end);
  zone.addEventListener("pointercancel", end);
  const sprint = $("#sprint-button");
  sprint.addEventListener("pointerdown", (e) => { e.stopPropagation(); sprintHeld = true; sprint.setPointerCapture(e.pointerId); });
  const sEnd = () => { sprintHeld = false; };
  sprint.addEventListener("pointerup", sEnd);
  sprint.addEventListener("pointercancel", sEnd);
  $("#act-button").addEventListener("pointerdown", (e) => { e.stopPropagation(); sim?.action(); });
}

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  const q = activeQte();
  if (q) {
    if (e.code === "Space" || e.code === "Enter") { if (q.spec.kind === "hold") qteHold(true); else if (!e.repeat) qteTap(); e.preventDefault(); }
    const dir: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right" };
    if (dir[e.code] && !e.repeat) qteSwipe(dir[e.code]);
    if (/^Digit[1-4]$/.test(e.code) && q.spec.kind === "choice") { const o = q.spec.options?.[Number(e.code.slice(5)) - 1]; if (o) qteChoose(o.id); }
    return;
  }
  if (sim && e.code === "KeyE") sim.action();
  if (e.code === "Escape" || e.code === "KeyP") togglePause();
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if ((e.code === "Space" || e.code === "Enter") && holdDown) qteHold(false);
});
window.addEventListener("blur", () => { keys.clear(); sprintHeld = false; });

// ================================================================ pause & audio

function togglePause(): void {
  if ($("#pause-screen").classList.contains("active")) { resume(); return; }
  if (sim && sim.phase === "explore") { scene.paused = true; showScreen("#pause-screen"); hud("none"); return; }
  if (run && !busy && !homeQte && !sim && !document.querySelector(".screen.active")) { showScreen("#pause-screen"); hud("none"); }
}
function resume(): void {
  play("click");
  showScreen(null);
  if (sim) { scene.paused = false; hud("out"); }
  else if (run) hud("home");
}
const GFX_NAMES = { low: "НИЗЬКА", medium: "СЕРЕДНЯ", high: "ВИСОКА" } as const;
const GFX_NEXT = { low: "medium", medium: "high", high: "low" } as const;
function syncGfx(): void {
  $("#gfx-button").textContent = `ГРАФІКА: ${GFX_NAMES[scene.quality]}`;
}

function syncAudio(): void {
  const v = $("#voice-button");
  v.textContent = voice.available ? `ГОЛОСИ: ${voice.on ? "ВКЛ" : "ВИКЛ"}` : "ГОЛОСИ: НЕМАЄ УКР. ГОЛОСУ";
  v.setAttribute("aria-pressed", String(voice.on && voice.available));
  const s = $("#sound-button");
  const m = $("#music-button");
  s.textContent = `ЗВУКИ: ${isMuted() ? "ВИКЛ" : "ВКЛ"}`;
  m.textContent = `МУЗИКА: ${isMusicMuted() ? "ВИКЛ" : "ВКЛ"}`;
  s.setAttribute("aria-pressed", String(!isMuted()));
  m.setAttribute("aria-pressed", String(!isMusicMuted()));
}

// ================================================================ wiring

$("#start-button").addEventListener("click", () => { unlockAudio(); music.start(); play("click"); newGame(); });
$("#continue-button").addEventListener("click", () => { unlockAudio(); music.start(); play("click"); void enterHome(); });
$("#go-button").addEventListener("click", () => { unlockAudio(); openBrief(); });
$("#brief-go").addEventListener("click", startOuting);
$("#brief-back").addEventListener("click", () => { play("click"); showScreen(null); hud("home"); });
$("#chat-button").addEventListener("click", async () => {
  if (!run || busy) return;
  const lv = level(run);
  busy = true;
  await showChat(lv.chat, `ДНІ ${lv.n * 2 - 1}–${lv.n * 2}`, false);
  run.flags[`chat_${lv.id}`] = true;
  busy = false;
  showScreen(null);
  hud("home");
  renderHome();
});
$("#result-next").addEventListener("click", afterResult);
$("#perk-skip").addEventListener("click", () => pickPerk(null));
document.querySelectorAll<HTMLButtonElement>(".path-card").forEach((b) => b.addEventListener("click", () => {
  if (!run) return;
  play("coin");
  choosePath(run, b.dataset.path as "border" | "legal");
  saveRun(run);
  showPerks();
}));
$("#end-button").addEventListener("click", () => { play("click"); renderStart(); showScreen("#start-screen"); scene.showMenu(); });
$("#home-pause").addEventListener("click", togglePause);
$("#out-pause").addEventListener("click", togglePause);
$("#resume-button").addEventListener("click", resume);
$("#quit-button").addEventListener("click", () => {
  play("click");
  sim = null;
  closeQte();
  scene.stopOuting();
  scene.showMenu();
  hud("none");
  music.mode = "home";
  if (run) saveRun(run);
  renderStart();
  showScreen("#start-screen");
});
$("#sound-button").addEventListener("click", () => { setMuted(!isMuted()); syncAudio(); play("click"); });
$("#music-button").addEventListener("click", () => { setMusicMuted(!isMusicMuted()); syncAudio(); });
$("#voice-button").addEventListener("click", () => { voice.on = !voice.on; syncAudio(); if (voice.on) voice.say("Голоси увімкнено", "me"); });
$("#gfx-button").addEventListener("click", () => { scene.setQuality(GFX_NEXT[scene.quality]); syncGfx(); play("click"); });
document.addEventListener("visibilitychange", () => { if (document.hidden && sim && sim.phase === "explore") togglePause(); });

scene.onEvents = handleOutingEvents;
scene.onFrame = (dt) => {
  frameQte(dt);
  if (sim) frameOuting(dt);
};

voice.load();
syncAudio();
syncGfx();
window.speechSynthesis?.addEventListener?.("voiceschanged", syncAudio);
renderStart();
scene.showMenu();
music.mode = "home";

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" }).catch(() => undefined); });
}
