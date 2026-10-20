import "./tikai.css";
import { Scene3D } from "./Scene3D.ts";
import * as A from "./audio.ts";
import { voice } from "../../rozshuk/src/voice.ts";
import {
  BABKA_LINES, CHASER_NAME, ENDINGS, HEAT_TEXT, HERO_LINES, LOST_LINES, MAX_HEAT, NEAR_LINES, PICKUPS, SHOUTS, STAGES, TRAITS, perkById,
  type PerkId, type TraitId,
} from "./content.ts";
import {
  breakFree, canBreakFree, choosePerk, finishStage, has, loseRun, newRun, nextBlockpost, startStage, step,
  type Ev, type Input, type RunState, type Stage,
} from "./sim.ts";
import { bankRun, loadMeta, loadRun, saveMeta, saveRun } from "./save.ts";
import type { Quality } from "../../stiny/src/three/post.ts";

function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing UI element: ${sel}`);
  return el;
}
const setText = (el: HTMLElement, v: string) => { if (el.textContent !== v) el.textContent = v; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pickOne = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const money = (n: number) => `${Math.floor(n).toLocaleString("uk-UA")} ₴`;

const scene = new Scene3D($("#shell"));
const meta = loadMeta();
let run: RunState | null = loadRun();
let st: Stage | null = null;
let mode: "menu" | "intro" | "run" | "caught" | "perk" | "end" = "menu";
let paused = false;
let god = false;
let selTrait: TraitId = meta.owned.includes(meta.lastTrait) ? meta.lastTrait : "it";
let selHeat = Math.min(meta.lastHeat, meta.maxHeat);
let audioOn = false;
let shoutT = 3;
let lostSaid = false;
let hintT = 0;
let bpWarned = -1;
const queue: Input[] = [];
const testMode = location.hash.includes("test");
Object.assign(window as unknown as Record<string, unknown>, { __tikai: { scene, get run() { return run; }, get stage() { return st; }, meta } });

// ================================================================ small UI helpers

const SCREENS = ["#start-screen", "#stage-screen", "#perk-screen", "#end-screen", "#pause-screen"];
function showScreen(id: string | null): void {
  for (const s of SCREENS) $(s).classList.toggle("active", s === id);
}

let toastTimer = 0;
function toast(text: string, from = "", kind: "" | "bad" | "good" = "", ms = 2200): void {
  const t = $("#toast");
  t.innerHTML = from ? `<small>${esc(from)}</small>${esc(text)}` : esc(text);
  t.classList.toggle("bad", kind === "bad");
  t.classList.toggle("good", kind === "good");
  t.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), ms);
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

function say(text: string, role: "officer" | "babka" | "me" | "npc", from = ""): void {
  voice.say(text, role);
  if (from) toast(text, from, role === "me" ? "" : "bad", 1800);
}

// ================================================================ menu

function renderMenu(): void {
  const list = $("#trait-list");
  list.innerHTML = "";
  for (const t of TRAITS) {
    const owned = meta.owned.includes(t.id);
    const b = document.createElement("button");
    b.className = `trait${t.id === selTrait ? " on" : ""}${owned ? "" : " locked"}`;
    b.innerHTML = `<b><em>${t.icon}</em>${esc(t.name)}</b><small>${esc(t.text)}</small>${owned ? "" : `<span class="price">${money(t.price)}</span>`}`;
    b.addEventListener("click", () => {
      wakeAudio();
      if (owned) { selTrait = t.id; renderMenu(); return; }
      if (meta.bank < t.price) { toast(`Треба ${money(t.price)}, у заначці ${money(meta.bank)}.`, "НЕ ВИСТАЧАЄ", "bad"); return; }
      if (b.dataset.confirm) {
        meta.bank -= t.price;
        meta.owned.push(t.id);
        saveMeta(meta);
        selTrait = t.id;
        A.synth("coin");
        toast(`${t.name} — тепер з тобою.`, "КУПЛЕНО", "good");
        renderMenu();
      } else {
        b.dataset.confirm = "1";
        b.querySelector(".price")!.textContent = "КУПИТИ?";
      }
    });
    list.append(b);
  }
  const heat = $("#heat-list");
  heat.innerHTML = "";
  for (let h = 0; h <= MAX_HEAT; h++) {
    const b = document.createElement("button");
    const locked = h > meta.maxHeat;
    b.className = `heat${h === selHeat ? " on" : ""}${locked ? " locked" : ""}`;
    b.textContent = h === 0 ? "0" : "★".repeat(h);
    b.style.fontSize = h > 2 ? "10px" : "";
    b.disabled = locked;
    b.setAttribute("aria-label", `Розшук ${h}`);
    b.addEventListener("click", () => { selHeat = h; renderMenu(); });
    heat.append(b);
  }
  setText($("#heat-text"), `${HEAT_TEXT[selHeat]}${selHeat ? ` · швидше, щільніше, гривень +${selHeat * 25}%` : ""}${meta.maxHeat < MAX_HEAT ? " · добіжи до річки, щоб відкрити наступну ★" : ""}`);
  $("#continue-btn").classList.toggle("hidden", !run);
  if (run) setText($("#continue-btn"), `ПРОДОВЖИТИ · ЕТАП ${run.stage + 1}/${STAGES.length}`);
  setText($("#meta-line"), `Заначка: ${money(meta.bank)} · втеч: ${meta.runs} · до річки: ${meta.wins}`);
}

function newGame(): void {
  wakeAudio();
  run = newRun((Math.random() * 1e9) | 0, selTrait, selHeat);
  meta.lastTrait = selTrait;
  meta.lastHeat = selHeat;
  saveMeta(meta);
  saveRun(run);
  stageIntro();
}

// ================================================================ a stage

function stageIntro(): void {
  if (!run) return;
  mode = "intro";
  st = startStage(run);
  scene.setStage(st, run);
  const def = STAGES[run.stage];
  setText($("#stage-eyebrow"), `ЕТАП ${run.stage + 1} / ${STAGES.length}${run.heat ? ` · РОЗШУК ${"★".repeat(run.heat)}` : ""}`);
  setText($("#stage-title"), def.title);
  setText($("#stage-sub"), def.sub);
  setText($("#stage-intro"), def.intro);
  setText($("#stage-goal"), `${def.goal} · ${def.length} м`);
  $("#stage-controls").innerHTML = def.mode === "foot"
    ? `<div><b>← →</b>свайп — смуга</div><div><b>↑</b>стрибок</div><div><b>↓</b>підкат</div><div><b>${esc(CHASER_NAME[def.chaser])}</b>позаду. Не спотикайся.</div>`
    : `<div><b>← →</b>свайп — смуга</div><div><b>↑</b>нітро</div><div><b>↓</b>сигнал: машина попереду звільнить смугу</div><div><b>${def.blockposts ? "Блокпости" : "Поліція"}</b>${def.blockposts ? "шукай смугу без бетону" : "аварія — мінус цілість"}</div>`;
  showScreen("#stage-screen");
  $("#hud").classList.add("hidden");
}

function beginStage(): void {
  if (!st || !run) return;
  wakeAudio();
  mode = "run";
  paused = false;
  showScreen(null);
  $("#hud").classList.remove("hidden");
  $("#test-btn").classList.toggle("hidden", !testMode);
  queue.length = 0;
  shoutT = 1.2;
  lostSaid = false;
  bpWarned = -1;
  hintT = run.stage === 0 && run.history.length === 0 ? 4.5 : st.mode === "car" && run.stage === 2 ? 4 : 0;
  const def = STAGES[st.idx];
  setText($("#h-stage"), `${def.title}`);
  setText($("#h-chaser"), CHASER_NAME[def.chaser].toUpperCase());
  $("#h-car").classList.toggle("hidden", st.mode !== "car");
  setText($("#h-runner"), st.mode === "car" ? (def.theme === "checkpoints" ? "🚜" : "🚗") : "🏃");
  A.music.mode = "outing";
  if (st.mode === "car") { A.engine.start(0.25); A.siren.start(); }
  else { A.stopLoops(); A.synth("whistle"); }
  if (def.chaser === "tck") say(pickOne(SHOUTS.tck), "officer");
  if (def.chaser === "police") A.synth("curfew");
  if (st.idx === 0) setTimeout(() => say(HERO_LINES.run, "me"), 900);
}

function handleEvents(evs: Ev[]): void {
  if (!st || !run) return;
  for (const e of evs) {
    scene.onEvent(e, st);
    switch (e.kind) {
      case "coin": A.sample("coin", 0.5); break;
      case "jump": A.sample("jump", 0.7); if (Math.random() < 0.08) voice.say(HERO_LINES.jump, "me"); break;
      case "land": A.sample("land", 0.5); break;
      case "slide": A.synth("vault"); break;
      case "bump": A.sample("impact", 0.35, 1.4); break;
      case "stumble":
        A.sample(st.mode === "car" ? "skid" : "fall", 0.7);
        toast(e.second ? `Знову ${e.what}! Вони вже поруч` : `Спіткнувся: ${e.what}`, "", "bad", 1300);
        navigator.vibrate?.(40);
        break;
      case "crash":
        A.sample("impact", 1);
        if (st.mode === "car") A.sample("break", 0.7, 0.7);
        toast(st.mode === "car" ? `Бах! ${e.what}. Цілість: ${st.health}` : `Влетів у: ${e.what}`, "", "bad", 1600);
        navigator.vibrate?.([60, 30, 80]);
        break;
      case "saved":
        A.sample("break", 0.8);
        toast(e.by === "scooter" ? "Самокату кінець. Тобі — ні." : e.by === "lucky" ? "Ладанка вберегла." : "Пробив наскрізь!", "", "good", 1400);
        break;
      case "power": {
        const p = PICKUPS[e.id];
        A.powerUp();
        toast(p.text, p.name.toUpperCase(), "good", 2000);
        break;
      }
      case "powerEnd": A.powerDown(); break;
      case "babka":
        A.babkaPhone();
        say(pickOne(BABKA_LINES), "babka", "БАБУСЯ НА ЛАВЦІ");
        break;
      case "near": A.nearMiss(); toast("Впритул! +₴", "", "good", 700); break;
      case "honk": A.horn(); break;
      case "nitro": A.nitroWhoosh(); break;
      case "blockpost":
        A.synth("whistle");
        break;
      case "throughBlockpost":
        toast("Проскочив блокпост!", "", "good", 1200);
        if (STAGES[st.idx].theme === "checkpoints") voice.say(pickOne(["Стояти!", "Агов! Ти!"]), "officer");
        break;
      case "caught": onCaught(); return;
      case "finish": onFinish(); return;
    }
  }
}

// ================================================================ caught: mash to break free

let mashN = 0;
let mashNeed = 10;
let mashT = 0;
function onCaught(): void {
  if (!st || !run) return;
  mode = "caught";
  A.synth("grab");
  A.sample("impact", 0.8, 0.8);
  navigator.vibrate?.([80, 40, 120]);
  const def = STAGES[st.idx];
  setText($("#caught-line"), `«${pickOne(NEAR_LINES[def.chaser])}»`);
  voice.say(pickOne(NEAR_LINES[def.chaser]), "officer");
  $("#caught").classList.remove("hidden");
  $("#hud").classList.add("hidden");
  const can = canBreakFree(run);
  $("#mash-btn").classList.toggle("hidden", !can);
  $(".bar.mash").classList.toggle("hidden", !can);
  mashN = 0;
  mashNeed = (st.mode === "car" ? 12 : 10) + run.heat * 2;
  mashT = 3.8;
  setText($("#caught-left"), can ? `Шансів вирватися: ${run.escapes}` : "Шансів вирватися більше нема.");
  ($("#mash-fill") as HTMLElement).style.transform = "scaleX(0)";
  if (!can) {
    setTimeout(() => { voice.say(HERO_LINES.caught, "me"); }, 600);
    setTimeout(() => endRun(), 2200);
  }
}

function mash(): void {
  if (mode !== "caught" || !st || !run || !canBreakFree(run)) return;
  mashN++;
  A.synth("hit");
  navigator.vibrate?.(15);
  ($("#mash-fill") as HTMLElement).style.transform = `scaleX(${Math.min(1, mashN / mashNeed)})`;
  if (mashN >= mashNeed) {
    breakFree(st, run);
    $("#caught").classList.add("hidden");
    $("#hud").classList.remove("hidden");
    mode = "run";
    A.synth("win");
    say(HERO_LINES.escaped, "me", "");
    toast("Вирвався! Тікай!", "", "good");
  }
}

function tickCaught(dt: number): void {
  if (!run || !canBreakFree(run)) return;
  mashT -= dt;
  if (mashT <= 0) {
    setText($("#caught-left"), "Не встиг…");
    run.escapes = 0;
    mode = "end";
    setTimeout(() => endRun(), 900);
  }
}

// ================================================================ between stages

function onFinish(): void {
  if (!st || !run) return;
  const done = st;
  const def = STAGES[done.idx];
  A.stopLoops();
  A.synth("win");
  voice.say(pickOne(LOST_LINES[def.chaser]), "officer");
  const { last } = finishStage(run, done);
  saveRun(run.ending ? null : run);
  $("#hud").classList.add("hidden");
  if (last) { setTimeout(() => endRun(), 600); mode = "end"; return; }
  mode = "perk";
  setText($("#perk-title"), `${def.title}: ПРОЙДЕНО`);
  $("#perk-stats").innerHTML = [
    [money(done.coins), "ЗІБРАНО"], [`${Math.round(done.t)} с`, "ЧАС"], [money(run.coins), "ЗА ВТЕЧУ"],
  ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("");
  const list = $("#perk-list");
  list.innerHTML = "";
  for (const id of run.offer ?? []) {
    const p = perkById(id);
    const b = document.createElement("button");
    b.className = "perk";
    const n = run.perks.filter((x) => x === id).length;
    b.innerHTML = `<em>${p.icon}</em><div><b>${esc(p.name)}${n ? ` ×${n + 1}` : ""}</b><small>${esc(p.text)}</small></div>`;
    b.addEventListener("click", () => takePerk(id));
    list.append(b);
  }
  showScreen("#perk-screen");
}

function takePerk(id: PerkId | null): void {
  if (!run) return;
  A.synth("click");
  choosePerk(run, id);
  saveRun(run);
  stageIntro();
}

function endRun(): void {
  if (!run) return;
  A.stopLoops();
  if (!run.ending && st) loseRun(run, st);
  const ending = ENDINGS[run.ending ?? "bus"];
  const { heatUnlocked } = bankRun(meta, run);
  saveRun(null);
  mode = "end";
  $("#caught").classList.add("hidden");
  $("#hud").classList.add("hidden");
  setText($("#end-sticker"), ending.sticker);
  $("#end-sticker").style.background = run.ending === "river" ? "var(--acid)" : "";
  $("#end-sticker").style.color = run.ending === "river" ? "var(--ink)" : "";
  setText($("#end-title"), ending.title);
  setText($("#end-text"), ending.text);
  $("#end-route").innerHTML = STAGES.map((s, i) => `<i class="${i < run!.history.length ? "ok" : i === run!.history.length && run!.ending !== "river" ? "fail" : ""}">${esc(s.title)}</i>`).join("");
  $("#end-stats").innerHTML = [
    [`${run.history.length}/${STAGES.length}`, "ЕТАПІВ"], [money(run.coins), "ПРИНІС"], [money(meta.bank), "У ЗАНАЧЦІ"],
  ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("");
  const next = TRAITS.find((t) => !meta.owned.includes(t.id));
  const lines: string[] = [];
  if (heatUnlocked) lines.push(`Відкрито розшук ${"★".repeat(meta.maxHeat)}: швидше, складніше, дорожче.`);
  if (next) lines.push(meta.bank >= next.price ? `Вистачає на «${next.name}» — купи в меню.` : `До «${next.name}»: ще ${money(next.price - meta.bank)}.`);
  setText($("#end-unlock"), lines.join(" "));
  A.synth(run.ending === "river" ? "win" : "fail");
  A.music.mode = "home";
  if (run.ending !== "river") voice.say(HERO_LINES.caught, "me");
  showScreen("#end-screen");
  run = null;
}

function toMenu(): void {
  A.stopLoops();
  A.music.mode = "home";
  mode = "menu";
  paused = false;
  $("#hud").classList.add("hidden");
  $("#caught").classList.add("hidden");
  $("#test-btn").classList.add("hidden");
  renderMenu();
  showScreen("#start-screen");
  menuBackdrop();
}

function menuBackdrop(): void {
  const demo = newRun(1, selTrait, 0);
  st = startStage(demo);
  scene.setStage(st, demo);
}

// ================================================================ pause

function setPaused(v: boolean): void {
  if (mode !== "run" && mode !== "caught") return;
  paused = v;
  showScreen(v ? "#pause-screen" : null);
  if (v) { A.engine.set(0, 1); A.siren.set(0); }
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

function push(i: Input): void {
  if (mode !== "run" || paused) return;
  if (queue.length < 3) queue.push(i);
  hintT = Math.min(hintT, 0.6);
}

let sx = 0;
let sy = 0;
let tracking = false;
/** Direction already fired by this touch: one swipe per direction until the finger lifts or turns. */
let lastDir = "";
const SWIPE = 24;
window.addEventListener("pointerdown", (e) => {
  if ((e.target as HTMLElement).closest("button, .screen, #test-panel")) return;
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
  if (!st) return;
  const car = st.mode === "car";
  if (d === "l") push({ dx: -1 });
  else if (d === "r") push({ dx: 1 });
  else if (d === "u") push(car ? { nitro: true } : { jump: true });
  else push(car ? { honk: true } : { slide: true });
}

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === "p" || k === "escape") { setPaused(!paused); return; }
  if (mode === "caught" && (k === " " || k === "enter")) { mash(); e.preventDefault(); return; }
  if (mode === "intro" && (k === " " || k === "enter")) { beginStage(); e.preventDefault(); return; }
  if (k === "arrowleft" || k === "a") swipe("l");
  else if (k === "arrowright" || k === "d") swipe("r");
  else if (k === "arrowup" || k === "w" || k === " ") swipe("u");
  else if (k === "arrowdown" || k === "s" || k === "shift") swipe("d");
  else return;
  e.preventDefault();
});

document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "run") setPaused(true); });

// ================================================================ HUD

function hud(): void {
  if (!st || !run) return;
  const def = STAGES[st.idx];
  const k = Math.min(1, st.dist / st.length);
  ($("#h-progress") as HTMLElement).style.transform = `scaleX(${k})`;
  ($("#h-runner") as HTMLElement).style.left = `${k * 100}%`;
  setText($("#h-coins"), Math.floor(run.coins + st.coins).toLocaleString("uk-UA"));
  const g = Math.max(0, Math.min(1, st.gap / st.gapMax));
  const gi = $("#h-gap");
  gi.style.transform = `scaleX(${g})`;
  gi.classList.toggle("mid", g < 0.55 && g >= 0.3);
  gi.classList.toggle("low", g < 0.3);
  setText($("#h-escapes"), run.escapes > 0 ? "✊".repeat(Math.min(5, run.escapes)) : "");
  if (st.mode === "car") {
    setText($("#h-health"), `${"🟩".repeat(Math.max(0, st.health))}${"⬛".repeat(Math.max(0, st.maxHealth - st.health))}`);
    setText($("#h-nitro"), st.nitro > 0 ? `🔥×${st.nitro}` : "🔥×0");
  }
  const pw = $("#h-power");
  if (st.power) {
    pw.classList.remove("hidden");
    const p = PICKUPS[st.power];
    setText($("#h-power-icon"), p.icon);
    setText($("#h-power-name"), p.name.toUpperCase());
    ($("#h-power-t") as HTMLElement).style.transform = `scaleX(${Math.max(0, st.powerT / st.powerMax)})`;
  } else pw.classList.add("hidden");
  $("#red-edge").classList.toggle("on", st.gap < (st.mode === "car" ? 7 : 4));
  $("#speed-lines").classList.toggle("on", st.nitroT > 0 || st.power === "energy");
  // blockposts ahead
  const hint = $("#bp-hint");
  const bp = def.blockposts ? nextBlockpost(st) : null;
  if (bp && bp.z - st.dist < 190 && bp.z > st.dist) {
    const sees = has(run, "chat") || run.trait === "taxi";
    hint.classList.remove("hidden");
    // lanes left to right on screen
    const lanes = Array.from({ length: st.lanes }, (_, l) => (bp.open.includes(l) ? "🟩" : "⬛")).join("");
    setText(hint, sees ? `БЛОКПОСТ ${Math.round(bp.z - st.dist)} м  ${lanes}` : `БЛОКПОСТ ${Math.round(bp.z - st.dist)} м!`);
    if (bpWarned !== Math.round(bp.z)) { bpWarned = Math.round(bp.z); A.synth("whistle"); }
  } else hint.classList.add("hidden");
  const sh = $("#swipe-hint");
  if (hintT > 0) {
    sh.classList.remove("hidden");
    setText(sh, st.mode === "car" ? "← → СМУГА · ↑ НІТРО · ↓ СИГНАЛ" : "СВАЙП ← → · ↑ СТРИБОК · ↓ ПІДКАТ");
  } else sh.classList.add("hidden");
}

function chatter(dt: number): void {
  if (!st || !run) return;
  const def = STAGES[st.idx];
  shoutT -= dt;
  if (shoutT <= 0 && st.gap < st.gapMax * 0.6) {
    shoutT = 4 + Math.random() * 4;
    const line = pickOne(SHOUTS[def.chaser]);
    voice.say(line, "officer");
    if (st.gap < 5) toast(line, CHASER_NAME[def.chaser].toUpperCase(), "bad", 1300);
    if (def.chaser === "tck" && Math.random() < 0.4) A.synth("whistle");
  }
  if (!lostSaid && st.gap >= st.gapMax - 0.2 && st.t > 8) {
    lostSaid = true;
    voice.say(pickOne(LOST_LINES[def.chaser]), "officer");
  }
  if (st.gap < st.gapMax * 0.5) lostSaid = false;
  if (st.mode === "car") {
    A.engine.set(0.2 + (st.nitroT > 0 ? 0.15 : 0), 0.7 + st.speed / 40);
    A.siren.set(1 - Math.min(1, st.gap / st.gapMax));
  }
  A.music.intensity = Math.max(0.35, 1 - st.gap / st.gapMax);
}

// ================================================================ loop

let last = performance.now();
let demoT = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (st && !paused) {
    if (mode === "run") {
      const input = queue.shift() ?? {};
      const evs = step(st, run!, dt, input);
      if (god) { st.gap = Math.max(st.gap, 4); st.health = Math.max(st.health, 1); st.caught = false; }
      handleEvents(evs);
      if (mode === "run") { chatter(dt); hud(); }
      if (hintT > 0) hintT -= dt;
    } else if (mode === "caught") {
      tickCaught(dt);
    } else if (mode === "menu" || mode === "intro") {
      // the backdrop: jog on the spot, the chase just behind
      demoT += dt;
      st.speed = mode === "menu" ? 3.2 : 0;
      st.gap = 7 + Math.sin(demoT * 0.7) * 1.5;
    }
    scene.update(st, run ?? newRun(1), dt);
  }
  scene.render(dt);
  requestAnimationFrame(frame);
}

// ================================================================ wiring

$("#new-btn").addEventListener("click", () => { run = null; saveRun(null); newGame(); });
$("#continue-btn").addEventListener("click", () => { wakeAudio(); stageIntro(); });
$("#stage-go").addEventListener("click", beginStage);
$("#perk-skip").addEventListener("click", () => takePerk(null));
$("#end-btn").addEventListener("click", () => newGame());
$("#end-menu").addEventListener("click", toMenu);
$("#pause-btn").addEventListener("click", () => setPaused(true));
$("#resume-btn").addEventListener("click", () => setPaused(false));
$("#quit-btn").addEventListener("click", () => {
  paused = false;
  showScreen(null);
  if (st && run) { run.escapes = 0; mode = "end"; endRun(); }
});
$("#mash-btn").addEventListener("pointerdown", (e) => { e.preventDefault(); mash(); });
$("#sound-btn").addEventListener("click", () => { A.setMuted(!A.isMuted()); syncToggles(); });
$("#music-btn").addEventListener("click", () => { A.setMusicMuted(!A.isMusicMuted()); syncToggles(); });
$("#voice-btn").addEventListener("click", () => { voice.on = !voice.on; syncToggles(); });
$("#gfx-btn").addEventListener("click", () => { scene.setQuality(GFX[(GFX.indexOf(scene.quality) + 1) % 3]); syncToggles(); });

// test menu
if (testMode) {
  const grid = $("#test-stages");
  STAGES.forEach((s, i) => {
    const b = document.createElement("button");
    b.textContent = `${i + 1}. ${s.title}`;
    b.addEventListener("click", () => {
      $("#test-panel").classList.add("hidden");
      if (!run) run = newRun((Math.random() * 1e9) | 0, selTrait, selHeat);
      run.stage = i;
      run.ending = null;
      $("#caught").classList.add("hidden");
      stageIntro();
    });
    grid.append(b);
  });
  $("#test-btn").addEventListener("click", () => { $("#test-panel").classList.remove("hidden"); paused = true; });
  $("#test-close").addEventListener("click", () => { $("#test-panel").classList.add("hidden"); paused = false; });
  for (const b of document.querySelectorAll<HTMLButtonElement>("#test-panel [data-t]")) {
    b.addEventListener("click", () => {
      const t = b.dataset.t!;
      if (!st || !run) return;
      if (t in PICKUPS) {
        if (t === "nitro") st.nitro++;
        else if (t === "repair") st.health = Math.min(st.maxHealth, st.health + 1);
        else { st.power = t as Stage["power"]; st.powerT = st.powerMax = PICKUPS[t as keyof typeof PICKUPS].secs; st.shield = t === "scooter"; }
      }
      if (t === "gap0") st.gap = 1.5;
      if (t === "gapmax") st.gap = st.gapMax;
      if (t === "finish") st.dist = st.length - 30;
      if (t === "money") { meta.bank += 10000; saveMeta(meta); }
      if (t === "god") { god = !god; b.classList.toggle("on", god); }
      $("#test-panel").classList.add("hidden");
      paused = false;
    });
  }
  $("#test-btn").classList.remove("hidden");
}

renderMenu();
syncToggles();
menuBackdrop();
void scene.load().then(() => { if (mode === "menu") menuBackdrop(); else if (st && run && mode === "intro") scene.setStage(st, run); });
requestAnimationFrame(frame);
