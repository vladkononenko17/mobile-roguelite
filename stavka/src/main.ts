import "./stavka.css";
import { Scene3D } from "./Scene3D.ts";
import * as A from "./audio.ts";
import {
  AD, ADVISORS, CONDITIONS, DIFFICULTY_TEXT, ENDINGS, MAX_DIFFICULTY, PERKS, SECTORS, TARGETS, THREATS, WEAPONS, WEEKS, ZONES,
  allyById, km, perkById, sectorById, targetById,
  type AdvisorId, type AllyId, type Effect, type WeaponId,
} from "./content.ts";
import * as S from "./sim.ts";
import { advisorUnlocked, loadMeta, loadRun, saveMeta, saveRun } from "./save.ts";
import type { Quality } from "../../stiny/src/three/post.ts";

function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing UI element: ${sel}`);
  return el;
}
const setText = (el: HTMLElement, v: string) => { if (el.textContent !== v) el.textContent = v; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (n: number) => `$${n.toFixed(2).replace(".", ",")} млрд`;
const signed = (n: number, digits = 0) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits).replace(".", ",")}`;

const scene = new Scene3D($("#shell"));
const meta = loadMeta();
let run: S.RunState | null = loadRun();
type Mode = "menu" | "intro" | "day" | "night" | "nightEnd" | "strike" | "flight" | "report" | "end";
let mode: Mode = "menu";
let night: S.NightState | null = null;
let flight: S.StrikeFlight | null = null;
let flightEnd = 0;
let plan: S.StrikePlan = { target: "", weapon: "liutyi", count: 0, decoys: 0, via: [] };
let addingPoint = false;
let paused = false;
let fast = false;
let god = false;
let dayTab: "decide" | "build" | "ad" | "allies" = "decide";
let openAlly: AllyId | null = null;
let selAdvisor: AdvisorId = meta.lastAdvisor;
let selDiff = Math.min(meta.lastDifficulty, meta.maxDifficulty);
let tapQueue: number[] = [];
let nightLines: string[] = [];
let strikeLines: string[] = [];
let audioOn = false;
let followCam = true;
const testMode = location.hash.includes("test");
/** Test hook: extra simulation steps per frame (headless browsers draw very few frames). */
let testSpeed = 1;
Object.assign(window as unknown as Record<string, unknown>, { __stavka: { scene, S, get run() { return run; }, get night() { return night; }, get flight() { return flight; }, meta, set speed(v: number) { testSpeed = Math.max(1, v); } } });

// ================================================================ helpers

const SCREENS = ["#start-screen", "#intro-screen", "#report-screen", "#end-screen", "#pause-screen"];
function showScreen(id: string | null): void {
  for (const s of SCREENS) $(s).classList.toggle("active", s === id);
  // the bars under a full screen only get in the way
  $("#topbar").style.visibility = id && id !== "#pause-screen" ? "hidden" : "";
}
function show(sel: string, on: boolean): void { $(sel).classList.toggle("hidden", !on); }

let toastTimer = 0;
function toast(text: string, kind: "" | "bad" | "good" = "", ms = 2200, sub = ""): void {
  const t = $("#toast");
  t.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : "");
  t.classList.toggle("bad", kind === "bad");
  t.classList.toggle("good", kind === "good");
  t.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), ms);
}
function unlockAudio(): void {
  if (audioOn) return;
  audioOn = true;
  A.unlockAudio();
}
function save(): void { if (run) saveRun(run); }
function effectText(e: Effect): string {
  const p: string[] = [];
  if (e.budget) p.push(`${e.budget > 0 ? "+" : "−"}${money(Math.abs(e.budget))}`);
  if (e.morale) p.push(`${signed(e.morale)} мораль`);
  if (e.energy) p.push(`${signed(e.energy)}% енергія`);
  if (e.escalation) p.push(`${signed(e.escalation)} ескалація`);
  if (e.industry) p.push(e.industry > 0 ? "промисловість ↑" : "промисловість ↓");
  if (e.front) p.push(e.front < 0 ? `фронт ${signed(e.front)} км` : `фронт +${e.front} км ворогу`);
  if (e.trust) for (const [k, v] of Object.entries(e.trust)) p.push(`${k === "all" ? "усі союзники" : allyById(k as AllyId).name} ${signed(v ?? 0)}`);
  if (e.liutyi) p.push(`+${e.liutyi} Лютих`);
  if (e.neptune) p.push(`+${e.neptune} Нептун`);
  if (e.decoys) p.push(`+${e.decoys} приманок`);
  if (e.interceptors) p.push(`+${e.interceptors} перехоплювачів`);
  if (e.mobile) p.push("+1 мобільна група");
  if (e.patriotAmmo) p.push(`+${e.patriotAmmo} ракет Patriot`);
  if (e.revealZone) p.push("відкрити зону ППО");
  return p.join(", ") || "без наслідків";
}
const flagHtml = (id: AllyId) => `<span class="flag">${allyById(id).flag.map((c) => `<i style="background:${c}"></i>`).join("")}</span>`;

// ================================================================ top bar

function updateTop(): void {
  if (!run) return;
  setText($("#tb-week"), `ТИЖДЕНЬ ${run.week}/${WEEKS}`);
  const phase = mode === "night" || mode === "nightEnd" ? "НІЧ" : mode === "strike" || mode === "flight" ? "УДАР" : mode === "report" ? "ЗВІТ" : "ДЕНЬ";
  setText($("#tb-phase"), phase);
  const right = $("#tb-right-value");
  if (mode === "day") { setText($("#tb-right-label"), "ГОДИНИ"); setText(right, `${run.hours} / 4`); }
  else if (mode === "night" && night) { setText($("#tb-right-label"), "В ПОВІТРІ"); setText(right, String(night.threats.filter((t) => t.alive).length)); }
  else if (mode === "flight" && flight) { setText($("#tb-right-label"), "ЛЕТЯТЬ"); setText(right, String(flight.missiles.filter((m) => !m.dead && !m.arrived).length)); }
  else { setText($("#tb-right-label"), "СКЛАД"); setText(right, `${run.stock.liutyi} Л`); }
  show("#tb-alert", mode === "night");
  setText($("#st-budget"), `$${run.budget.toFixed(1).replace(".", ",")} млрд`);
  const p = S.power(run);
  setText($("#st-power"), `${Math.round(p)}%`);
  $("#st-power-bar").style.width = `${p}%`;
  $("#st-power").className = p < 35 ? "bad" : p < 60 ? "warn" : "";
  setText($("#st-morale"), String(Math.round(run.morale)));
  $("#st-morale-bar").style.width = `${run.morale}%`;
  $("#st-morale").className = run.morale < 30 ? "bad" : "";
  const f = S.frontAvg(run);
  setText($("#st-front"), `${f > 0 ? "−" : "+"}${Math.abs(f).toFixed(1).replace(".", ",")} км`);
  $("#st-front").className = f > 15 ? "bad" : f < -1 ? "good" : "";
  setText($("#st-esc"), String(Math.round(run.escalation)));
  $("#st-esc-bar").style.width = `${run.escalation}%`;
}

// ================================================================ menu

function renderMenu(): void {
  const list = $("#advisor-list");
  list.innerHTML = ADVISORS.map((a) => {
    const open = advisorUnlocked(meta, a.unlock);
    return `<button class="pick ${a.id === selAdvisor ? "sel" : ""} ${open ? "" : "locked"}" data-adv="${a.id}" ${open ? "" : "disabled"}>
      <span class="tag">${esc(a.role.toUpperCase())}</span><b>${esc(a.name)}</b><small>${open ? esc(a.text) : a.unlock === 1 ? "Відкриється після першої каденції." : "Відкриється після першої перемоги."}</small></button>`;
  }).join("");
  const diff = $("#diff-list");
  diff.innerHTML = Array.from({ length: MAX_DIFFICULTY + 1 }, (_, i) => `<button class="heat ${i === selDiff ? "sel" : ""} ${i <= meta.maxDifficulty ? "" : "locked"}" data-diff="${i}" ${i <= meta.maxDifficulty ? "" : "disabled"} aria-label="Ескалація ${i}">${i ? "★".repeat(i) : "0"}</button>`).join("");
  setText($("#diff-text"), DIFFICULTY_TEXT[selDiff]);
  show("#continue-btn", !!run && !run.ending);
  setText($("#meta-line"), meta.runs ? `Каденцій: ${meta.runs} · перемог: ${meta.wins} · рекорд: ${meta.best}` : "Перша каденція. Щасти, пане Президенте.");
}
function showMenu(): void {
  mode = "menu";
  night = null; flight = null;
  scene.setNight(null); scene.setFlight(null); scene.showRoute(null); scene.showZones(false); scene.selectTarget(null); scene.selectUnit(null);
  scene.setMode("menu");
  if (run) scene.syncRun(run);
  scene.focus(34, 48.8, 150);
  for (const s of ["#topbar", "#day", "#night", "#strike", "#flight", "#move-hint"]) show(s, false);
  clearLabels();
  renderMenu();
  showScreen("#start-screen");
}
$("#advisor-list").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-adv]");
  if (!b || b.disabled) return;
  selAdvisor = b.dataset.adv as AdvisorId;
  A.click();
  renderMenu();
});
$("#diff-list").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-diff]");
  if (!b || b.disabled) return;
  selDiff = Number(b.dataset.diff);
  renderMenu();
});
$("#new-btn").addEventListener("click", () => {
  unlockAudio();
  meta.lastAdvisor = selAdvisor;
  meta.lastDifficulty = selDiff;
  saveMeta(meta);
  run = S.newRun((Date.now() ^ (Math.random() * 1e9)) | 0, selAdvisor, selDiff);
  save();
  weekIntro();
});
$("#continue-btn").addEventListener("click", () => { unlockAudio(); if (run) resume(); });

function resume(): void {
  if (!run) return showMenu();
  if (run.ending) return showEnd();
  if (run.phase === "strike") return enterStrike();
  if (run.phase === "report") return showReport();
  run.phase = "day";
  enterDay();
}

// ================================================================ week intro

function weekIntro(): void {
  if (!run) return;
  mode = "intro";
  scene.setMode("day");
  scene.syncRun(run);
  scene.focus(32.5, 48.9, 135);
  for (const s of ["#topbar", "#day", "#night", "#strike", "#flight"]) show(s, false);
  clearLabels();
  const massive = run.week % 4 === 0;
  setText($("#intro-eyebrow"), `ТИЖДЕНЬ ${run.week} З ${WEEKS}`);
  setText($("#intro-title"), run.week === 1 ? "ПЕРШИЙ ДЕНЬ У СТАВЦІ" : massive ? "ВОРОГ ГОТУЄ МАСОВАНИЙ УДАР" : "НОВИЙ ТИЖДЕНЬ");
  setText($("#intro-text"), run.week === 1
    ? "Вдень маєш 4 години: рішення, виробництво, ППО і союзники. Вночі — тисни на цілі в небі. Потім обираєш, куди бити у відповідь."
    : massive ? "Розвідка бачить накопичення ракет і бомбардувальників. Готуй ППО і енергетику." : "Звіт розвідки на столі. Час вирішувати.");
  const lines: string[] = [];
  const w = S.waveSize(run);
  lines.push(`Очікується вночі: ~${w.shahed + w.gerbera} дронів${w.kh101 + w.kalibr ? `, ${w.kh101 + w.kalibr} крилатих` : ""}${w.iskander + w.kinzhal ? `, ${w.iskander + w.kinzhal} балістичних` : ""}.`);
  for (const a of run.allies) if (allyById(a.id).election === run.week) lines.push(`Цього тижня вибори: ${allyById(a.id).name}.`);
  if (run.decisions.length) lines.push(`На столі рішень: ${run.decisions.length}.`);
  $("#intro-lines").innerHTML = lines.map((l) => `<p>${esc(l)}</p>`).join("");
  setText($("#intro-go"), "ДО КАБІНЕТУ");
  introGo = () => enterDay();
  showScreen("#intro-screen");
}
let introGo: () => void = () => {};
$("#intro-go").addEventListener("click", () => { A.click(); introGo(); });

// ================================================================ day

function enterDay(): void {
  if (!run) return;
  mode = "day";
  showScreen(null);
  scene.setMode("day");
  scene.syncRun(run);
  scene.showZones(false);
  scene.showRoute(null);
  scene.selectTarget(null);
  scene.focus(32.8, 48.6, 130);
  show("#topbar", true); show("#day", true); show("#night", false); show("#strike", false); show("#flight", false);
  $("#day").classList.remove("collapsed");
  dayTab = run.decisions.length ? "decide" : "build";
  renderDay();
  save();
}
function renderDay(): void {
  if (!run) return;
  document.querySelectorAll<HTMLButtonElement>("#day .tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === dayTab));
  document.querySelectorAll<HTMLElement>("#day .tab-page").forEach((p) => p.classList.toggle("active", p.id === `tab-${dayTab}`));
  setText($("#tab-decide-n"), run.decisions.length ? String(run.decisions.length) : "");
  // decisions
  $("#tab-decide").innerHTML = run.decisions.length ? run.decisions.map((id) => {
    const d = S.decisionById(id);
    return `<div class="card"><span class="from">${esc(d.from)}</span><h4>${esc(d.title)}</h4><p>${esc(d.text)}</p>
      <div class="row2"><button class="opt main" data-dec="${id}" data-c="a">${esc(d.a.label)}<small>${esc(effectText(d.a.eff))}</small></button>
      <button class="opt" data-dec="${id}" data-c="b">${esc(d.b.label)}<small>${esc(effectText(d.b.eff))}</small></button></div></div>`;
  }).join("") : `<p class="hint">Рішень на сьогодні немає. Час на тил, ППО і союзників.</p>`;
  // production
  const st = run.stock;
  $("#tab-build").innerHTML = `<p class="hint">Склад: Лютий ${st.liutyi} · Нептун ${st.neptune}${st.flamingo ? ` · Фламінго ${st.flamingo}` : ""} · Storm Shadow ${st.storm}${st.atacms ? ` · ATACMS ${st.atacms}` : ""} · приманки ${st.decoys} · перехоплювачі ${st.interceptors} · ракети Patriot ${st.patriotAmmo} · IRIS-T/NASAMS ${st.samAmmo}</p>` +
    S.actions(run).map((a) => `<button class="action" data-act="${a.id}" ${a.ok ? "" : "disabled"}><span class="txt"><b>${esc(a.name)}</b><small>${esc(a.why ?? a.text)}</small></span><span class="cost">${money(a.cost)}<small>${esc(a.gain)}</small></span></button>`).join("");
  // air defence
  const units = [...run.ad].sort((a, b) => SECTORS.findIndex((s) => s.id === a.sector) - SECTORS.findIndex((s) => s.id === b.sector));
  $("#tab-ad").innerHTML = `<p class="hint">Торкнись батареї тут або на карті, потім — сектора, куди її перекинути. Кожна може переїхати раз на день.</p>` +
    units.map((u) => {
      const d = AD[u.kind];
      return `<button class="unit ${scene.selectedUnit === u.id ? "sel" : ""}" data-unit="${u.id}"><span class="dot" style="background:#${d.color.toString(16).padStart(6, "0")}"></span><span class="txt"><b>${esc(d.name)}</b><small>${esc(sectorById(u.sector).region)} · ${d.range} км${u.movedDay === run!.week ? " · вже переїжджала" : ""}</small></span><span class="am">${u.ammo}/${d.ammo}</span></button>`;
    }).join("");
  // allies
  $("#tab-allies").innerHTML = (run.offer ? offerHtml() : "") + run.allies.map((a) => {
    const def = allyById(a.id);
    const notes: string[] = [];
    if (S.hasPermission(run!, a.id)) notes.push(`дозвіл бити по РФ до тижня ${a.permissionUntil}`);
    if (a.pledge && a.pledge.until >= run!.week) notes.push(`обіцянка: ${CONDITIONS[a.pledge.cond].toLowerCase()} (до тижня ${a.pledge.until})`);
    const asks = openAlly === a.id ? `<div class="asks">${S.asksFor(a.id).map((k) => `<button class="ask" data-ask="${k.id}" data-ally="${a.id}" ${run!.hours > 0 ? "" : "disabled"}>${esc(k.label)}</button>`).join("")}</div><p class="hint" style="text-align:left">Переговори займають 1 годину. Хоче: ${esc(def.wants === "results" ? "результатів" : def.wants === "restraint" ? "стриманості" : def.wants === "purchases" ? "контрактів" : "реформ")}. Терпить ескалацію до ${a.tolerance}.</p>` : "";
    return `<div class="card"><button class="ally" data-ally-open="${a.id}" style="text-align:left">${flagHtml(a.id)}<span class="txt"><b>${esc(def.name.toUpperCase())}</b><small>${esc(a.temper)}${notes.length ? ` · ${esc(notes.join(" · "))}` : ""}</small></span><span class="trust"><small>Довіра ${Math.round(a.trust)}</small><span class="bar"><i style="width:${a.trust}%"></i></span></span></button>${asks}</div>`;
  }).join("");
  updateTop();
}
function offerHtml(): string {
  const o = run!.offer!;
  const def = allyById(o.ally);
  if (o.refused) return `<div class="card">${flagHtml(o.ally)}<h4>${esc(def.name)}</h4><p>${esc(o.refused)}</p><button class="opt" data-offer="decline">Зрозуміло</button></div>`;
  return `<div class="card"><span class="from">Переговори</span><h4>${esc(def.name)}</h4>
    <div class="kv"><span style="color:#8be086">Дає</span><span>${esc(o.give)}</span><span style="color:#ff9a3c">Умова</span><span>${esc(CONDITIONS[o.cond])}</span></div>
    <div class="row3"><button class="opt main" data-offer="accept">Прийняти</button><button class="opt" data-offer="haggle">Торгуватися<small>шанс ~${Math.round(Math.min(95, (S.ally(run!, o.ally).trust / 120 + (run!.advisor === "diplomat" ? 0.15 : 0)) * 100))}%</small></button><button class="opt" data-offer="decline">Відмовити</button></div></div>`;
}

$("#day").addEventListener("click", (e) => {
  if (!run || mode !== "day") return;
  const el = e.target as HTMLElement;
  const tab = el.closest<HTMLButtonElement>("[data-tab]");
  if (tab) { dayTab = tab.dataset.tab as typeof dayTab; A.click(); $("#day").classList.remove("collapsed"); renderDay(); return; }
  const dec = el.closest<HTMLButtonElement>("[data-dec]");
  if (dec) {
    const lines = S.decide(run, dec.dataset.dec!, dec.dataset.c as "a" | "b");
    A.ok();
    if (lines.length) toast(lines[0], "good");
    scene.syncRun(run);
    if (!run.decisions.length) dayTab = "build";
    renderDay(); save();
    return;
  }
  const act = el.closest<HTMLButtonElement>("[data-act]");
  if (act && !act.disabled) {
    const err = S.doAction(run, act.dataset.act as S.ActionId);
    if (err) { A.bad(); toast(err, "bad"); } else { A.ok(); toast("Виконано", "good", 1200); }
    scene.syncRun(run);
    renderDay(); save();
    return;
  }
  const unit = el.closest<HTMLButtonElement>("[data-unit]");
  if (unit) { selectUnit(Number(unit.dataset.unit)); return; }
  const openA = el.closest<HTMLButtonElement>("[data-ally-open]");
  if (openA) { openAlly = openAlly === openA.dataset.allyOpen ? null : (openA.dataset.allyOpen as AllyId); A.click(); renderDay(); return; }
  const ask = el.closest<HTMLButtonElement>("[data-ask]");
  if (ask && !ask.disabled) {
    S.negotiate(run, ask.dataset.ally as AllyId, ask.dataset.ask as S.Offer["ask"]);
    A.click();
    renderDay();
    $("#day .sheet-body").scrollTop = 0;
    return;
  }
  const off = el.closest<HTMLButtonElement>("[data-offer]");
  if (off) {
    const msg = S.respond(run, off.dataset.offer as "accept" | "haggle" | "decline");
    if (msg) toast(msg, msg.includes("образились") ? "bad" : "good", 3000);
    if (off.dataset.offer === "accept") A.ok();
    scene.syncRun(run);
    renderDay(); save();
  }
});
$("#sheet-toggle").addEventListener("click", () => $("#day").classList.toggle("collapsed"));
$("#end-day").addEventListener("click", () => {
  if (!run || mode !== "day") return;
  if (run.decisions.length) { dayTab = "decide"; renderDay(); A.bad(); toast("Спершу ухвали рішення на столі", "bad"); return; }
  if (run.offer) S.respond(run, "decline");
  selectUnit(null);
  save();
  startNight();
});

function selectUnit(id: number | null): void {
  if (!run) return;
  if (id !== null && scene.selectedUnit === id) id = null;
  scene.selectUnit(id);
  const u = id !== null ? run.ad.find((x) => x.id === id) : null;
  show("#move-hint", !!u);
  if (u) {
    setText($("#move-hint"), u.movedDay === run.week ? `${AD[u.kind].name}: вже переїжджала сьогодні` : `${AD[u.kind].name} (${sectorById(u.sector).name}): торкнись сектора на карті, куди перекинути`);
    dayTab = "ad";
    $("#day").classList.add("collapsed");
    scene.focusKm(u.at, Math.min(scene.zoomDist, 110));
  }
  A.click();
  renderDay();
}

// ================================================================ night

function startNight(): void {
  if (!run) return;
  unlockAudio();
  night = S.startNight(run);
  mode = "night";
  tapQueue = [];
  fast = false;
  scene.setMode("night");
  scene.syncRun(run);
  scene.setNight(night);
  scene.focus(34.4, 49.2, 150);
  show("#day", false); show("#move-hint", false); show("#night", true);
  $("#fast-btn").classList.remove("on");
  A.siren(night.massive ? 3 : 2);
  toast(night.massive ? "Масована атака!" : "Повітряна тривога", "bad", 2600, "Тисни на цілі в небі");
  updateNightHud();
}
function updateNightHud(): void {
  if (!run || !night) return;
  const alive = night.threats.filter((t) => !t.done);
  const count = (f: (k: string) => boolean) => alive.filter((t) => f(t.kind)).length;
  setText($("#n-shahed"), String(count((k) => k === "shahed" || k === "gerbera")));
  setText($("#n-cruise"), String(count((k) => k === "kh101" || k === "kalibr")));
  setText($("#n-ball"), String(count((k) => k === "iskander" || k === "kinzhal")));
  setText($("#n-down"), String(night.stats.downed));
  setText($("#n-int"), String(run.stock.interceptors));
  const sum = (kinds: string[]) => run!.ad.filter((u) => kinds.includes(u.kind) && !u.down).reduce((a, u) => a + u.ammo, 0);
  setText($("#n-pat"), `${sum(["patriot", "samp"])} +${run.stock.patriotAmmo}`);
  setText($("#n-sam"), `${sum(["irist", "nasams"])} +${run.stock.samAmmo}`);
  setText($("#slow-n"), `залишилось ${night.slowCharges}`);
  $("#slow-btn").classList.toggle("on", night.slow > 0);
  ($("#slow-btn") as HTMLButtonElement).disabled = night.slowCharges <= 0 && night.slow <= 0;
}
let slowReq = false;
$("#slow-btn").addEventListener("click", () => { slowReq = true; A.click(); });
$("#fast-btn").addEventListener("click", () => { fast = !fast; $("#fast-btn").classList.toggle("on", fast); A.click(); });

let lastHum = 0;
function nightFrame(dt: number): void {
  if (!run || !night) return;
  const steps = (fast ? 2 : 1) * testSpeed;
  for (let i = 0; i < steps; i++) {
    const input: S.NightInput = {};
    if (tapQueue.length) input.assign = tapQueue.shift();
    if (slowReq) { input.slow = true; slowReq = false; }
    S.stepNight(run, night, dt, input);
    if (god) for (const u of run.ad) u.ammo = AD[u.kind].ammo;
  }
  const evs = night.events.splice(0);
  scene.nightEvents(evs);
  for (const e of evs) {
    if (e.type === "warn") { A.warnBeep(); toast(`Пуск: ${THREATS[e.kind].name}`, "bad", 1600, "Patriot або SAMP/T — тисни на ракету"); }
    else if (e.type === "shot") { if (e.shot.kind === "mobile" || e.shot.kind === "gepard") { if (Math.random() < 0.5) A.mgBurst(); } else if (e.shot.kind === "drone") A.droneLaunch(); else A.samLaunch(); }
    else if (e.type === "kill") A.boomAir(THREATS[e.kind].ballistic);
    else if (e.type === "impact" && !e.decoyEnd) {
      A.boomGround(THREATS[e.kind].ballistic);
      redFlash();
      toast(`Влучання: ${sectorById(e.sector).region}`, "bad", 1500, e.target === "power" ? "енергетика" : e.target === "city" ? "місто" : e.target === "industry" ? "завод" : e.target === "ad" ? "позиція ППО" : "злітна смуга");
    } else if (e.type === "adLost") toast(`Втрачено ${AD[e.kind].name} (${sectorById(e.sector).name})`, "bad", 2600);
    else if (e.type === "noFire") { A.bad(); toast(e.why, "bad", 1200); }
  }
  lastHum += dt;
  if (lastHum > 0.5) { lastHum = 0; A.droneHum(night.threats.filter((t) => t.alive && (t.kind === "shahed" || t.kind === "gerbera")).length); }
  if (night.done) endNight();
}
function redFlash(): void {
  const f = $("#flash");
  f.classList.add("on");
  window.setTimeout(() => f.classList.remove("on"), 220);
}
function endNight(): void {
  if (!run || !night) return;
  A.droneHum(0);
  nightLines = S.finishNight(run, night);
  scene.syncRun(run);
  mode = "nightEnd";
  A.allClear();
  show("#night", false);
  if (run.ending) { scene.setNight(null); night = null; return showEnd(); }
  save();
  setText($("#intro-eyebrow"), `ТИЖДЕНЬ ${run.week} · ВІДБІЙ`);
  setText($("#intro-title"), "НІЧ МИНУЛА");
  setText($("#intro-text"), "Енергетики виїжджають на місця влучань. Ставка збирається на ранкову нараду.");
  $("#intro-lines").innerHTML = nightLines.map((l) => `<p>${esc(l)}</p>`).join("");
  setText($("#intro-go"), "ДО УДАРУ У ВІДПОВІДЬ");
  introGo = () => { scene.setNight(null); night = null; enterStrike(); };
  showScreen("#intro-screen");
}

// ================================================================ strike

function defaultPlan(): S.StrikePlan {
  const r = run!;
  const avail = TARGETS.filter((t) => (r.targets[t.id]?.until ?? 0) < r.week);
  const weapon = (["liutyi", "neptune", "storm", "flamingo", "atacms"] as WeaponId[]).find((w) => r.stock[w] > 0) ?? "liutyi";
  const t = avail.find((x) => x.occupied) ?? avail[0] ?? TARGETS[0];
  return { target: t.id, weapon, count: Math.min(weapon === "liutyi" ? 10 : 2, r.stock[weapon]), decoys: Math.min(3, r.stock.decoys), via: [] };
}
function enterStrike(): void {
  if (!run) return;
  mode = "strike";
  run.phase = "strike";
  showScreen(null);
  scene.setMode("strike");
  scene.syncRun(run);
  scene.showZones(true);
  plan = defaultPlan();
  addingPoint = false;
  show("#topbar", true); show("#strike", true); show("#night", false); show("#flight", false); show("#day", false);
  $("#strike").classList.remove("collapsed");
  const t = targetById(plan.target)!;
  scene.focus((t.at[0] + 35) / 2, (t.at[1] + 50) / 2 - 0.6, 150);
  renderStrike();
  save();
}
function renderStrike(): void {
  if (!run) return;
  const r = run;
  $("#target-list").innerHTML = TARGETS.map((t) => {
    const down = (r.targets[t.id]?.until ?? 0) >= r.week;
    return `<button class="tchip ${t.id === plan.target ? "sel" : ""} ${down ? "down" : ""}" data-tgt="${t.id}">${esc(shortName(t.name))}<small>${down ? "виведено" : t.occupied ? "окуповане" : `+${t.esc} ескалації`}</small></button>`;
  }).join("");
  const t = targetById(plan.target);
  const tst = t ? r.targets[t.id] : undefined;
  $("#target-info").innerHTML = t ? `<b>${esc(t.name)}</b><br>${esc(t.text)} Потрібно влучань: ${t.hp}${tst?.damage ? ` (вже є ${tst.damage})` : ""}.${(tst?.until ?? 0) >= r.week ? ` <span class="good">Виведено до тижня ${tst!.until}.</span>` : ""}` : "";
  $("#weapon-list").innerHTML = (Object.keys(WEAPONS) as WeaponId[]).filter((w) => w !== "flamingo" || r.stock.flamingo > 0 || S.has(r, "flamingo")).map((w) => {
    const d = WEAPONS[w];
    return `<button class="wchip ${w === plan.weapon ? "sel" : ""}" data-w="${w}" ${r.stock[w] > 0 ? "" : "disabled"}>${esc(d.name)}<small>${r.stock[w]} шт · ${d.range} км</small></button>`;
  }).join("");
  plan.count = Math.min(plan.count, r.stock[plan.weapon]);
  plan.decoys = Math.min(plan.decoys, r.stock.decoys);
  setText($("#s-count"), String(plan.count));
  setText($("#s-decoys"), String(plan.decoys));
  $("#route-add").classList.toggle("on", addingPoint);
  setText($("#route-add"), addingPoint ? "ТОРКНИСЬ КАРТИ…" : `+ ТОЧКА МАРШРУТУ${plan.via.length ? ` (${plan.via.length}/3)` : ""}`);
  const risk = S.strikeRisk(r, plan);
  const zoneNames = risk.zones.map((z) => ZONES.find((x) => x.id === z)!.name);
  $("#risk").innerHTML = `
    <div class="r"><small>Маршрут</small><b class="${risk.inRange ? "" : "bad"}">${Math.round(risk.length)} км</b><small>з ${WEAPONS[plan.weapon].range}</small></div>
    <div class="r"><small>Долетять</small><b class="${risk.pSurvive > 0.7 ? "good" : risk.pSurvive < 0.4 ? "bad" : "warn"}">${risk.expected.toFixed(1).replace(".", ",")} / ${plan.count}</b><small>${Math.round(risk.pSurvive * 100)}% кожен${risk.hiddenRisk ? " ?" : ""}</small></div>
    <div class="r"><small>Ескалація</small><b class="${risk.escalation > 6 ? "bad" : ""}">+${risk.escalation}</b><small>зараз ${Math.round(r.escalation)}</small></div>
    <div class="wide">${zoneNames.length ? `Через зони ППО: ${esc(zoneNames.join(", "))}. ` : "Відомих зон ППО на шляху немає. "}${risk.hiddenRisk ? "<span class=\"warn\">Розвідка не все бачить — можуть бути сюрпризи.</span> " : ""}${risk.violations.map((v) => `<span class="bad">⚠ ${esc(v.text)} (${signed(v.trust)} довіри)</span>`).join(" ")}${risk.problems.length ? `<span class="bad">${esc(risk.problems[0])}</span>` : ""}</div>`;
  ($("#strike-go") as HTMLButtonElement).disabled = risk.problems.length > 0;
  scene.selectTarget(plan.target || null);
  scene.showRoute(risk.route, WEAPONS[plan.weapon].range);
  updateTop();
  updateLabels();
}
const shortName = (n: string) => n.replace(/^(Аеродром|Арсенал|Завод|Порт|Радар|НПЗ|Склад БК|Залізничний вузол|Пускові)\s*/, "$1 ").replace(/\s+/g, " ").replace(/«|»/g, "").slice(0, 26);

$("#strike").addEventListener("click", (e) => {
  if (!run || mode !== "strike") return;
  const el = e.target as HTMLElement;
  const tg = el.closest<HTMLButtonElement>("[data-tgt]");
  if (tg) { pickTarget(tg.dataset.tgt!); return; }
  const w = el.closest<HTMLButtonElement>("[data-w]");
  if (w && !w.disabled) { plan.weapon = w.dataset.w as WeaponId; plan.count = Math.min(plan.weapon === "liutyi" ? 10 : 2, run.stock[plan.weapon]); A.click(); renderStrike(); return; }
  const st = el.closest<HTMLButtonElement>("[data-step]");
  if (st) {
    const key = st.dataset.step as "count" | "decoys";
    const max = key === "count" ? run.stock[plan.weapon] : run.stock.decoys;
    plan[key] = Math.max(0, Math.min(max, plan[key] + Number(st.dataset.d)));
    A.click(); renderStrike();
  }
});
function pickTarget(id: string): void {
  plan.target = id;
  plan.via = [];
  A.click();
  renderStrike();
  const t = targetById(id)!;
  scene.focus(t.at[0], t.at[1] - 1.2, Math.max(scene.zoomDist, 110));
}
$("#strike-toggle").addEventListener("click", () => $("#strike").classList.toggle("collapsed"));
$("#route-add").addEventListener("click", () => {
  if (plan.via.length >= 3 && !addingPoint) { toast("Не більше трьох точок", "bad"); return; }
  addingPoint = !addingPoint;
  if (addingPoint) $("#strike").classList.add("collapsed");
  A.click(); renderStrike();
});
$("#route-clear").addEventListener("click", () => { plan.via = []; addingPoint = false; A.click(); renderStrike(); });
$("#strike-skip").addEventListener("click", () => {
  if (!run || mode !== "strike") return;
  strikeLines = S.skipStrike(run);
  scene.showRoute(null);
  showReport();
});
$("#strike-go").addEventListener("click", () => {
  if (!run || mode !== "strike") return;
  const fl = S.launchStrike(run, plan);
  if (typeof fl === "string") { A.bad(); toast(fl, "bad"); return; }
  flight = fl;
  flightEnd = 0;
  mode = "flight";
  fast = false;
  followCam = true;
  $("#f-fast").classList.remove("on");
  setText($("#f-cam-l"), "рій");
  addingPoint = false;
  scene.setFlight(fl);
  scene.followFlight(true);
  scene.zoom(0.6);
  show("#strike", false); show("#flight", true);
  setText($("#f-from"), "Старт");
  setText($("#f-target"), targetById(plan.target)!.name);
  A.launchSwarm();
  clearLabels();
});
$("#f-fast").addEventListener("click", () => { fast = !fast; $("#f-fast").classList.toggle("on", fast); A.click(); });
$("#f-cam").addEventListener("click", () => {
  followCam = !followCam;
  setText($("#f-cam-l"), followCam ? "рій" : "ціль");
  if (followCam) scene.followFlight(true);
  else { const t = targetById(plan.target)!; scene.focus(t.at[0], t.at[1] - 0.5, 60); }
  A.click();
});

function flightFrame(dt: number): void {
  if (!run || !flight) return;
  for (let i = 0; i < testSpeed; i++) S.stepStrike(flight, dt * (fast ? 2.5 : 1));
  const evs = flight.events.splice(0);
  scene.strikeEvents(evs);
  for (const e of evs) { if (e.type === "down") A.boomAir(false); else A.boomGround(true); }
  const alive = flight.missiles.filter((m) => !m.dead && !m.arrived && !m.decoy);
  const lead = flight.missiles.filter((m) => !m.decoy).reduce((a, m) => Math.max(a, Math.min(m.d, flight!.length)), 0);
  setText($("#f-eta"), alive.length ? `${Math.max(0, Math.round((flight.length - lead) / flight.speed))} с` : "—");
  setText($("#f-alive"), `${alive.length + flight.hits} / ${flight.plan.count}`);
  $("#f-progress").style.width = `${Math.min(100, (lead / flight.length) * 100)}%`;
  if (flight.done) {
    flightEnd += dt;
    if (flightEnd > 2.2) {
      const res = S.finishStrike(run, flight);
      if (res.destroyed) scene.targetDestroyed(flight.plan.target);
      strikeLines = res.lines;
      scene.syncRun(run);
      scene.followFlight(false);
      setTimeout(() => { scene.setFlight(null); }, 600);
      flight = null;
      show("#flight", false);
      if (res.destroyed) { A.ok(); toast("Ціль виведено з ладу", "good", 2400); }
      setTimeout(() => showReport(), res.destroyed ? 1600 : 500);
      mode = "report";
    }
  }
}

// ================================================================ report

function showReport(): void {
  if (!run) return;
  if (run.ending) return showEnd();
  mode = "report";
  for (const s of ["#strike", "#flight", "#night", "#day"]) show(s, false);
  scene.showRoute(null);
  scene.showZones(false);
  clearLabels();
  setText($("#report-eyebrow"), `ТИЖДЕНЬ ${run.week} З ${WEEKS}`);
  const s0 = run.start;
  const deltas: [string, string, number, boolean][] = [
    ["Бюджет", money(run.budget), run.budget - s0.budget, true],
    ["Енергія", `${Math.round(S.power(run))}%`, S.power(run) - s0.power, true],
    ["Мораль", String(Math.round(run.morale)), run.morale - s0.morale, true],
    ["Фронт", `${S.frontAvg(run) > 0 ? "−" : "+"}${Math.abs(S.frontAvg(run)).toFixed(1).replace(".", ",")} км`, -(S.frontAvg(run) - s0.front), true],
    ["Ескалація", String(Math.round(run.escalation)), run.escalation - s0.escalation, false],
    ["Довіра", String(Math.round(S.trustAvg(run))), S.trustAvg(run) - s0.trust, true],
  ];
  $("#report-deltas").innerHTML = deltas.map(([k, v, d, up]) => {
    const good = up ? d > 0.05 : d < -0.05, badd = up ? d < -0.05 : d > 0.05;
    return `<div class="delta"><small>${k}</small><b>${esc(v)}</b><em class="${good ? "good" : badd ? "bad" : ""}">${Math.abs(d) < 0.05 ? "=" : `${signed(d, k === "Бюджет" ? 2 : k === "Фронт" ? 1 : 0)}${k === "Енергія" ? "%" : k === "Фронт" ? " км" : ""}`}</em></div>`;
  }).join("");
  const lines = [...nightLines, ...strikeLines, ...run.report.filter((l) => !strikeLines.includes(l))];
  $("#report-lines").innerHTML = lines.map((l) => `<p>${esc(l)}</p>`).join("");
  $("#perk-list").innerHTML = run.perkOffer.map((id) => {
    const p = perkById(id);
    return `<button class="pick" data-perk="${id}"><span class="tag">${esc(p.tag)}</span><b>${esc(p.name)}</b><small>${esc(p.text)}</small></button>`;
  }).join("");
  showScreen("#report-screen");
  updateTop();
  save();
}
$("#perk-list").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-perk]");
  if (!b) return;
  nextWeek(b.dataset.perk as S.RunState["perks"][number]);
});
$("#perk-skip").addEventListener("click", () => nextWeek(null));
function nextWeek(perk: S.RunState["perks"][number] | null): void {
  if (!run) return;
  A.ok();
  S.nextWeek(run, perk);
  nightLines = []; strikeLines = [];
  save();
  weekIntro();
}

// ================================================================ end

function showEnd(): void {
  if (!run || !run.ending) return;
  mode = "end";
  night = null; flight = null;
  scene.setNight(null); scene.setFlight(null); scene.showRoute(null); scene.showZones(false);
  A.droneHum(0);
  for (const s of ["#topbar", "#strike", "#flight", "#night", "#day", "#move-hint"]) show(s, false);
  clearLabels();
  const e = ENDINGS[run.ending];
  scene.setMode("night");
  scene.syncRun(run);
  if (!run.history.some((h) => h.week === -1)) {
    meta.runs++;
    if (e.win) meta.wins++;
    meta.best = Math.max(meta.best, run.score);
    if (!meta.endings.includes(run.ending)) meta.endings.push(run.ending);
    let unlock = "";
    if (e.win && run.difficulty >= meta.maxDifficulty && meta.maxDifficulty < MAX_DIFFICULTY) { meta.maxDifficulty++; unlock = `Відкрито Ескалацію ${"★".repeat(meta.maxDifficulty)}.`; }
    if (meta.runs === 1) unlock += " Відкрито радника: Дипломат.";
    if (e.win && meta.wins === 1) unlock += " Відкрито радника: Економіст.";
    setText($("#end-unlock"), unlock.trim());
    run.history.push({ week: -1, launched: 0, downed: 0, impacts: 0, strike: "", strikeHits: 0, destroyed: false });
    saveMeta(meta);
  }
  saveRun(null);
  setText($("#end-sticker"), e.win ? "КІНЕЦЬ КАДЕНЦІЇ" : `ТИЖДЕНЬ ${run.week} · ПОРАЗКА`);
  setText($("#end-title"), e.title.toUpperCase());
  setText($("#end-text"), e.text);
  const st = run.stats;
  $("#end-stats").innerHTML = [
    ["Оцінка", String(run.score)], ["Тижнів", `${Math.min(run.week, WEEKS)} / ${WEEKS}`], ["Збито", `${st.downed}`],
    ["Влучань ворога", String(st.impacts)], ["Цілей уражено", String(st.destroyed)], ["Фронт", `${S.frontAvg(run) > 0 ? "−" : "+"}${Math.abs(S.frontAvg(run)).toFixed(1).replace(".", ",")} км`],
  ].map(([k, v]) => `<div class="delta"><small>${k}</small><b>${esc(v)}</b></div>`).join("");
  showScreen("#end-screen");
}
$("#end-btn").addEventListener("click", () => { run = null; showMenu(); $("#new-btn").click(); });
$("#end-menu").addEventListener("click", () => { run = null; showMenu(); });

// ================================================================ pause

$("#pause-btn").addEventListener("click", () => { paused = true; A.click(); renderPause(); showScreen("#pause-screen"); });
$("#resume-btn").addEventListener("click", () => {
  paused = false;
  showScreen(mode === "report" ? "#report-screen" : mode === "intro" || mode === "nightEnd" ? "#intro-screen" : mode === "end" ? "#end-screen" : null);
});
$("#quit-btn").addEventListener("click", () => {
  paused = false;
  A.droneHum(0);
  if (run && (mode === "night" || mode === "flight" || mode === "nightEnd")) { /* the run resumes from the last saved phase */ run = loadRun(); }
  showMenu();
});
function renderPause(): void {
  setText($("#sound-btn"), `ЗВУК: ${A.isMuted() ? "ВИКЛ" : "ВКЛ"}`);
  setText($("#gfx-btn"), `ГРАФІКА: ${({ low: "НИЗЬКА", medium: "СЕРЕДНЯ", high: "ВИСОКА" } as const)[scene.quality]}`);
}
$("#sound-btn").addEventListener("click", () => { A.setMuted(!A.isMuted()); renderPause(); });
$("#gfx-btn").addEventListener("click", () => {
  const order: Quality[] = ["low", "medium", "high"];
  scene.setQuality(order[(order.indexOf(scene.quality) + 1) % 3]);
  renderPause();
});

// ================================================================ map input

const canvas = scene.renderer.domElement;
const pointers = new Map<number, { x: number; y: number }>();
let moved = 0;
let pinch = 0;
canvas.addEventListener("pointerdown", (e) => {
  unlockAudio();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = 0;
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) {
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 10 && mode !== "menu") scene.pan(dx, dy);
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch > 0 && d > 0) scene.zoom(pinch / d);
    pinch = d;
    moved = 99;
  }
});
const up = (e: PointerEvent) => {
  const had = pointers.has(e.pointerId);
  pointers.delete(e.pointerId);
  if (had && moved <= 10 && pointers.size === 0) onTap(e.clientX, e.clientY);
  if (pointers.size < 2) pinch = 0;
};
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", (e) => { pointers.delete(e.pointerId); pinch = 0; });
canvas.addEventListener("wheel", (e) => { e.preventDefault(); if (mode !== "menu") scene.zoom(e.deltaY > 0 ? 1.12 : 0.89); }, { passive: false });

function onTap(x: number, y: number): void {
  if (!run || paused) return;
  if (mode === "night" && night) {
    const id = scene.pickThreat(x, y);
    if (id !== null) { tapQueue.push(id); return; }
    return;
  }
  if (mode === "day") {
    const u = scene.pickUnit(x, y);
    if (u !== null && u !== scene.selectedUnit) { selectUnit(u); return; }
    if (scene.selectedUnit !== null) {
      const sec = scene.pickSector(x, y);
      if (sec) {
        const unit = run.ad.find((q) => q.id === scene.selectedUnit)!;
        const err = S.moveUnit(run, unit.id, sec);
        if (err) { A.bad(); toast(err, "bad"); }
        else if (unit.sector !== sec) { A.ok(); toast(`${AD[unit.kind].name} → ${sectorById(sec).region}`, "good"); }
        scene.syncRun(run);
        selectUnit(null);
        save();
        return;
      }
      selectUnit(null);
      return;
    }
    const sec = scene.pickSector(x, y);
    if (sec) { const s = run.sectors.find((q) => q.id === sec)!; scene.highlightSector(sec); setTimeout(() => scene.highlightSector(null), 1200); toast(`${sectorById(sec).region}: енергія ${Math.round(s.power)}%`, "", 1600, `ППО: ${run.ad.filter((u) => u.sector === sec).map((u) => AD[u.kind].name).join(", ") || "немає"}`); }
    return;
  }
  if (mode === "strike") {
    if (addingPoint) {
      const g = scene.ground(x, y);
      if (g) { plan.via.push(g); addingPoint = false; A.click(); $("#strike").classList.remove("collapsed"); renderStrike(); }
      return;
    }
    const t = scene.pickTarget(x, y);
    if (t) pickTarget(t);
  }
}

// ================================================================ labels

const labels = new Map<string, HTMLElement>();
function label(key: string, cls: string, html: string): HTMLElement {
  let el = labels.get(key);
  if (!el) {
    el = document.createElement("div");
    el.className = `lbl ${cls}`;
    $("#labels").appendChild(el);
    labels.set(key, el);
    if (cls.includes("tgt")) el.addEventListener("click", () => { if (mode === "strike") pickTarget(key.slice(2)); });
  }
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  el.className = `lbl ${cls}`;
  return el;
}
function clearLabels(): void { for (const [, el] of labels) el.remove(); labels.clear(); }
function place(el: HTMLElement, p: { x: number; y: number; on: boolean }, dy = -10, force = false): void {
  const w = el.offsetWidth || 80, h = el.offsetHeight || 20;
  const r = { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y + dy - h, y1: p.y + dy };
  let ok = p.on && r.y0 > clipTop && r.y1 < clipBottom;
  if (ok && !force) ok = !placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
  el.style.display = ok ? "" : "none";
  if (!ok) return;
  placed.push(r);
  el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y + dy)}px) translate(-50%, -100%)`;
}
const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
let clipTop = 0, clipBottom = 0;
function updateLabels(): void {
  if (!run) return;
  const seen = new Set<string>();
  placed.length = 0;
  clipTop = $("#topbar").getBoundingClientRect().bottom + 4;
  const sheet = ["#day", "#strike", "#night", "#flight"].map((q) => $(q)).find((el) => !el.classList.contains("hidden"));
  clipBottom = sheet ? sheet.getBoundingClientRect().top - 2 : window.innerHeight;
  if (mode === "day" || mode === "night") {
    for (const s of run.sectors) {
      const d = sectorById(s.id);
      const key = `c:${s.id}`;
      seen.add(key);
      const pc = Math.round(s.power);
      const el = label(key, "city", `${esc(d.name)} <span class="${pc < 35 ? "bad" : pc < 65 ? "warn" : ""}">${pc}%</span>`);
      el.style.left = "0"; el.style.top = "0";
      place(el, scene.project(km(...d.city), 1.2), -4);
    }
  }
  if (mode === "night" && night) {
    for (const th of night.threats) {
      if (!th.alive || !THREATS[th.kind].ballistic) continue;
      const key = `b:${th.id}`;
      seen.add(key);
      const left = Math.max(0, Math.ceil((1 - th.t) * th.dur));
      const el = label(key, "ball", `<em>${left}</em>${esc(THREATS[th.kind].short.toUpperCase())}`);
      el.style.left = "0"; el.style.top = "0";
      const h = th.h * 0.42 + 0.25;
      place(el, scene.project(th.pos, h), -18, true);
    }
  }
  if (mode === "strike") {
    for (const t of [...TARGETS].sort((a, b) => (a.id === plan.target ? -1 : 0) - (b.id === plan.target ? -1 : 0))) {
      const key = `t:${t.id}`;
      seen.add(key);
      const down = (run.targets[t.id]?.until ?? 0) >= run.week;
      const el = label(key, `tgt ${t.id === plan.target ? "sel" : ""} ${down ? "down" : ""} ${t.occupied ? "occ" : ""}`, `<i style="background:${down ? "#6fd36a" : t.occupied ? "#4da3ff" : "#ffd43b"}"></i>${esc(shortName(t.name))}`);
      el.style.left = "0"; el.style.top = "0";
      place(el, scene.project(km(...t.at), 0.6), -14);
    }
  }
  for (const [k, el] of labels) if (!seen.has(k)) { el.remove(); labels.delete(k); }
}

// ================================================================ test menu

if (testMode) {
  show("#test-btn", true);
  $("#test-weeks").innerHTML = Array.from({ length: WEEKS }, (_, i) => `<button data-week="${i + 1}">${i + 1}</button>`).join("");
}
$("#test-btn").addEventListener("click", () => show("#test-panel", true));
$("#test-close").addEventListener("click", () => show("#test-panel", false));
$("#test-panel").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!b) return;
  if (!run) { run = S.newRun(12345, selAdvisor, selDiff); }
  const r = run;
  if (b.dataset.week) { r.week = Number(b.dataset.week); r.phase = "day"; r.ending = null; weekIntro(); show("#test-panel", false); return; }
  switch (b.dataset.t) {
    case "money": r.budget += 5; break;
    case "stock": Object.assign(r.stock, { liutyi: r.stock.liutyi + 30, neptune: r.stock.neptune + 6, flamingo: r.stock.flamingo + 4, storm: r.stock.storm + 6, atacms: r.stock.atacms + 6, decoys: r.stock.decoys + 20, interceptors: r.stock.interceptors + 60, patriotAmmo: r.stock.patriotAmmo + 30, samAmmo: r.stock.samAmmo + 30 }); break;
    case "hours": r.hours += 4; break;
    case "zones": for (const z of ZONES) r.zones[z.id].known = true; break;
    case "trust": for (const a of r.allies) a.trust = 90; break;
    case "perks": r.perks = PERKS.map((p) => p.id); break;
    case "god": god = !god; toast(god ? "Безкінечні ракети" : "Звичайні ракети"); break;
    case "night": if (mode === "day" || mode === "intro") { showScreen(null); r.decisions = []; startNight(); } break;
    case "endnight": if (night) { for (const t of night.threats) { t.done = true; t.alive = false; } night.shots = []; } break;
    case "lose": r.morale = 0; r.phase = "report"; r.ending = "despair"; showEnd(); break;
  }
  if (mode === "day") renderDay();
  if (mode === "strike") renderStrike();
  scene.syncRun(r);
  updateTop();
  show("#test-panel", false);
});

// ================================================================ loop

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    if (mode === "night") { nightFrame(dt); updateNightHud(); }
    if (mode === "flight") flightFrame(dt);
  }
  if (mode !== "menu" && mode !== "end") { updateTop(); updateLabels(); }
  scene.render(paused ? 0 : dt);
  requestAnimationFrame(frame);
}
showMenu();
requestAnimationFrame(frame);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (mode === "night" || mode === "flight") && !paused) { paused = true; renderPause(); showScreen("#pause-screen"); }
});
