import "./fishing.css";
import { Scene3D } from "./Scene3D";
import { isMusicMuted, isMuted, setMusicMuted, setMuted, unlockAudio } from "./sfx";
import { voice } from "./voice";
import type { LevelResult, SimSnapshot, Video } from "./sim";
import { GEAR, HAZARD_TEXT, LEVELS, gearById, levelById, type GearSlot, type Method } from "./content";
import { applyResult, buy, equip, equippedMethod, loadProgress } from "./save";

function el<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing UI element: ${selector}`);
  return found;
}

const scene = new Scene3D();
const progress = loadProgress();
// Handy for playtesting from the console: __fishing.sim.rage = 95
(window as unknown as { __fishing: Scene3D }).__fishing = scene;
(window as unknown as { __progress: typeof progress }).__progress = progress;
const ui = {
  hud: el("#hud"),
  rageBlock: el(".rage-block"),
  rageBar: el("#rage-bar"),
  rageText: el("#rage-text"),
  dayText: el("#day-text"),
  clockText: el("#clock-text"),
  normText: el("#norm-text"),
  scoreText: el("#score-text"),
  dayFill: el("#day-fill"),
  drunkRow: el("#drunk-row"),
  hazardRow: el("#hazard-row"),
  vignette: el("#rage-vignette"),
  sleepShade: el("#sleep-shade"),
  controls: el("#controls"),
  reel: el("#reel"),
  reelZone: el("#reel-zone"),
  reelMarker: el("#reel-marker"),
  meter: el("#meter"),
  meterLabel: el("#meter-label"),
  meterFill: el("#meter-fill"),
  meterZone: el("#meter-zone"),
  meterMarker: el("#meter-marker"),
  meterProgress: el("#meter-progress"),
  hook: el<HTMLButtonElement>("#hook-button"),
  beer: el<HTMLButtonElement>("#beer-button"),
  beerCount: el("#beer-count"),
  smoke: el<HTMLButtonElement>("#smoke-button"),
  cigCount: el("#cig-count"),
  phoneButton: el<HTMLButtonElement>("#phone-button"),
  phoneCount: el("#phone-count"),
  steal: el<HTMLButtonElement>("#steal-button"),
  stealFill: el("#steal-fill"),
  phone: el("#phone"),
  battery: el("#battery-text"),
  bell: el("#bell"),
  video: el("#video"),
  videoEmoji: el("#video-emoji"),
  videoCaption: el("#video-caption"),
  videoRage: el("#video-rage"),
  start: el("#start-screen"),
  startButton: el<HTMLButtonElement>("#start-button"),
  map: el("#map-screen"),
  mapMoney: el("#map-money"),
  mapStars: el("#map-stars"),
  mapGear: el<HTMLButtonElement>("#map-gear"),
  levelList: el("#level-list"),
  gear: el("#gear-screen"),
  gearMoney: el("#gear-money"),
  gearList: el("#gear-list"),
  pause: el("#pause-screen"),
  result: el("#result-screen"),
  resultEyebrow: el("#result-eyebrow"),
  resultTitle: el("#result-title"),
  resultRank: el("#result-rank"),
  resultMine: el("#result-mine"),
  resultTarget: el("#result-target"),
  resultFriend: el("#result-friend"),
  resultMoney: el("#result-money"),
  resultUnlock: el("#result-unlock"),
  resultNote: el("#result-note"),
  nextButton: el<HTMLButtonElement>("#next-button"),
  toast: el("#toast"),
};

let toastTimer = 0;
let bellTimer = 0;
let stealPointer: number | null = null;
let hookPointer: number | null = null;
let currentLevel = 1;
let gearSlot: GearSlot = "rod";

const METHOD_NAME: Record<Method, string> = { float: "ПОПЛАВОК", feeder: "ФИДЕР", spin: "СПИННИНГ", ice: "МОРМЫШКА" };
const THEME_COLOR: Record<string, string> = {
  dacha: "#6f8f3e", garages: "#55594a", quarry: "#2fb3c2", night: "#1d2a4c", plant: "#8a8f40",
  paid: "#4f9a8a", ice: "#8fb8d0", swamp: "#4a5a30", reserve: "#2f6a3a", champ: "#d63732",
};
const TIPS: Record<number, string> = {
  1: "Поплавок справится", 2: "Опарыш спасёт нервы", 3: "Тут нужен фидер", 4: "Фидер + кукуруза",
  5: "Спиннинг по мутантам", 6: "Карп на фидер", 7: "Только мормышка", 8: "Щука на спиннинг",
  9: "Без пива при надзоре", 10: "Лучшее, что есть",
};
const fmtMoney = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ГРН`;
const fmtKg = (n: number) => String(Math.round(n * (n >= 10 ? 10 : 100)) / (n >= 10 ? 10 : 100)).replace(".", ",");

function setText(target: HTMLElement, value: string): void {
  if (target.textContent !== value) target.textContent = value;
}

function hideScreens(): void {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
}

function showPlay(): void {
  hideScreens();
  ui.hud.classList.remove("hidden");
  ui.controls.classList.remove("hidden");
}

function hidePlay(): void {
  ui.hud.classList.add("hidden");
  ui.controls.classList.add("hidden");
  ui.phone.classList.add("hidden");
  ui.reel.classList.add("hidden");
  ui.meter.classList.add("hidden");
  ui.vignette.style.opacity = "0";
  ui.sleepShade.classList.remove("on");
}

function toast(message: string): void {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove("show"), message.length > 30 ? 2600 : 1500);
}

function buzz(ms: number | number[]): void {
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}

const HAZARD_ICON: Record<string, string> = {
  wife: "📞 ЖЕНА НА ПРОВОДЕ", mosquito: "🦟 КОМАРЫ", gopniki: "🧢 ГОПНИКИ", jetski: "🚤 ГИДРОЦИКЛ", neighbors: "🎸 СОСЕДИ",
  dump: "🏭 СБРОС ВОДЫ", ashot: "👮 АШОТ БДИТ", tolikCheat: "💸 ТОЛИК ЖУЛЬНИЧАЕТ", iceCrack: "⚠️ ЛЁД ТРЕЩИТ", leech: "🩸 ПИЯВКА",
  nadzor: "🚨 РЫБНАДЗОР", crowd: "📣 ТОЛПА", drone: "🛸 ДРОН",
};

function hookLabel(s: SimSnapshot): string {
  if (s.hands === "asleep") return "ХРРР…";
  if (s.hands === "call") return "📞 ДА, ДОРОГАЯ…";
  if (s.hands === "beer") return "ГЛЫК-ГЛЫК";
  if (s.rod === "bite") return "ПОДСЕКАЙ!";
  if (s.rod === "reeling") return "ТЯНИ!";
  if (s.rod === "fight") return s.holding ? "ТЯНУ!" : "ДЕРЖИ — ТЯНИ!";
  if (s.rod === "recast" || s.rod === "casting") return "ЗАБРОС…";
  if (s.rod === "broken") return "…";
  switch (s.method) {
    case "feeder": return s.feed < 0.3 ? "ПЕРЕЗАБРОС!" : "ПЕРЕЗАБРОС";
    case "spin": return s.holding ? "КРУЧУ…" : "ДЕРЖИ — КРУТИ";
    case "ice": return "ИГРАТЬ";
    default: return s.rod === "nibble" ? "ЖДИ…" : "ПОДСЕЧЬ";
  }
}

function updateMeter(s: SimSnapshot): void {
  const m = ui.meter;
  let show = true;
  let label = "";
  let fill = 0;
  let zone: [number, number] | null = null;
  let marker: number | null = null;
  let fight = false;
  let low = false;
  if (s.rod === "fight") {
    fight = true;
    zone = s.greenZone;
    marker = Math.min(1, s.tension);
    label = s.tension > s.greenZone[1] ? "ОТПУСТИ! ЛЕСКА ЛОПНЕТ" : s.tension < s.greenZone[0] ? "ДЕРЖИ! СЛАБИНА — СОЙДЁТ" : "НАТЯГ ОК — ВЫВАЖИВАЙ";
  } else if (s.method === "spin" && (s.rod === "retrieve" || s.rod === "bite")) {
    fill = 1 - s.lure;
    label = "ПРОВОДКА: ДЕРЖИ И ОТПУСКАЙ — СТУПЕНЬКОЙ";
  } else if (s.method === "ice" && (s.rod === "waiting" || s.rod === "bite")) {
    zone = s.interestBand;
    marker = Math.min(1, s.interest);
    label = s.interest > s.interestBand[1] ? "ПЕРЕИГРЫВАЕШЬ!" : s.interest < s.interestBand[0] ? "ТАПАЙ В РИТМ — ИГРАЙ МОРМЫШКОЙ" : "ВОТ ТАК, РЫБА СМОТРИТ";
  } else if (s.method === "feeder" && (s.rod === "waiting" || s.rod === "nibble" || s.rod === "bite" || s.rod === "casting")) {
    fill = s.feed;
    low = s.feed < 0.3;
    label = low ? "КОРМУШКА ПУСТАЯ — ПЕРЕЗАБРОСЬ" : "КОРМ В КОРМУШКЕ";
  } else show = false;
  m.classList.toggle("hidden", !show || s.hands === "asleep");
  if (!show) return;
  m.classList.toggle("fight", fight);
  m.classList.toggle("danger", fight && s.tension > s.greenZone[1]);
  m.classList.toggle("nozone", !zone);
  m.classList.toggle("nomarker", marker === null);
  m.classList.toggle("low", low);
  setText(ui.meterLabel, label);
  ui.meterFill.style.transform = `scaleX(${fill})`;
  if (zone) {
    ui.meterZone.style.left = `${zone[0] * 100}%`;
    ui.meterZone.style.width = `${(zone[1] - zone[0]) * 100}%`;
  }
  if (marker !== null) ui.meterMarker.style.left = `${marker * 100}%`;
  ui.meterProgress.style.transform = `scaleX(${Math.min(1, s.fightProgress)})`;
}

function updateHud(s: SimSnapshot): void {
  ui.rageBar.style.transform = `scaleX(${s.rage / 100})`;
  setText(ui.rageText, String(Math.floor(s.rage)));
  ui.rageBlock.classList.toggle("hot", s.rage > 78);
  ui.vignette.style.opacity = String(Math.max(0, (s.rage - 55) / 45));
  ui.vignette.classList.toggle("pulse", s.rage > 85);
  setText(ui.dayText, `УР.${s.level} · ${METHOD_NAME[s.method]}`);
  setText(ui.clockText, s.clock);
  setText(ui.normText, `${fmtKg(s.myKg)}/${fmtKg(s.target)} КГ`);
  ui.normText.classList.toggle("done", s.myKg >= s.target);
  setText(ui.scoreText, `ТОЛИК ${fmtKg(s.friendKg)}`);
  ui.dayFill.style.transform = `scaleX(${s.dayProgress})`;
  const drunk = s.drunk > 0 ? `ПРОМИЛЛЕ ${"▮".repeat(s.drunk)}${"▯".repeat(Math.max(0, 5 - s.drunk))}` : "";
  const smoke = s.smoking > 0 ? "  · КУРИШЬ" : "";
  const fines = s.fines > 0 ? `  · ШТРАФЫ −${s.fines} ГРН` : "";
  setText(ui.drunkRow, drunk + smoke + fines);
  let hz = s.hazard ? HAZARD_ICON[s.hazard] ?? "" : "";
  if (s.hazard && s.hazardLeft > 0.5) hz += ` ${Math.ceil(s.hazardLeft)}с`;
  if (s.cold) hz += (hz ? "  · " : "") + (s.warm > 0 ? `🔥 ТЕПЛО ${Math.ceil(s.warm)}с` : "🥶 ЗАМЕРЗАЕШЬ — ПИВО ИЛИ СИГА");
  setText(ui.hazardRow, hz);

  setText(ui.beerCount, `×${s.beers}`);
  setText(ui.cigCount, `×${s.cigs}`);
  setText(ui.phoneCount, `${Math.ceil(s.battery)}%`);
  setText(ui.battery, `${Math.ceil(s.battery)}%`);
  ui.beer.classList.toggle("empty", s.beers <= 0);
  ui.smoke.classList.toggle("empty", s.cigs <= 0 || s.smoking > 0);
  ui.phoneButton.classList.toggle("empty", s.battery <= 0);
  ui.steal.classList.toggle("empty", s.friendBucket === 0 || s.stealCooldown > 0);
  ui.steal.classList.toggle("safe", s.gaze === "distracted" && s.friendBucket > 0);
  ui.steal.classList.toggle("danger", s.gaze === "suspicious" || s.gaze === "watching");
  ui.stealFill.style.transform = `scaleY(${s.stealProgress})`;

  setText(ui.hook, hookLabel(s));
  ui.hook.classList.toggle("bite", s.rod === "bite");
  ui.hook.classList.toggle("reeling", s.rod === "reeling");
  ui.hook.classList.toggle("fight", s.rod === "fight");
  ui.hook.classList.toggle("holding", s.holding);
  ui.hook.classList.toggle("call", s.hands === "call");
  ui.reel.classList.toggle("hidden", s.rod !== "reeling");
  if (s.rod === "reeling") {
    ui.reelZone.style.left = `${s.reelZone[0] * 100}%`;
    ui.reelZone.style.width = `${(s.reelZone[1] - s.reelZone[0]) * 100}%`;
    ui.reelMarker.style.left = `${s.reelMarker * 100}%`;
  }
  updateMeter(s);
}

// ---------------------------------------------------------------- map
function totalStars(): number {
  return Object.values(progress.stars).reduce((a, b) => a + b, 0);
}

function starsHtml(n: number): string {
  return `${"<b>★</b>".repeat(n)}${"☆".repeat(3 - n)}`;
}

function baitFits(): boolean {
  const bait = gearById(progress.equipped.bait);
  const method = equippedMethod(progress);
  return !bait?.methods || bait.methods.includes(method);
}

function renderTackle(): void {
  const rod = gearById(progress.equipped.rod);
  const reel = gearById(progress.equipped.reel);
  const bait = gearById(progress.equipped.bait);
  const warn = baitFits() ? "" : `<small class="warn">⚠️ ${bait?.name} не работает с этой удочкой</small>`;
  ui.mapGear.innerHTML = `<span>${rod?.icon} ${rod?.name} · ${METHOD_NAME[equippedMethod(progress)]}<small>${reel?.icon} ${reel?.name} · ${bait?.icon} ${bait?.name}</small>${warn}</span><em>СНАСТИ ›</em>`;
}

function showMap(): void {
  releaseHook();
  releaseSteal();
  hidePlay();
  hideScreens();
  setText(ui.mapMoney, fmtMoney(progress.money));
  setText(ui.mapStars, `★ ${totalStars()}/${LEVELS.length * 3}`);
  renderTackle();
  ui.levelList.replaceChildren();
  for (const level of LEVELS) {
    const locked = level.id > progress.unlocked;
    const stars = progress.stars[level.id] ?? 0;
    const card = document.createElement("button");
    card.className = `level-card${locked ? " locked" : ""}${!locked && level.id === progress.unlocked && stars === 0 ? " next" : ""}`;
    card.style.setProperty("--theme", THEME_COLOR[level.theme]);
    const hazards = level.hazards.filter(([, w]) => w > 0).map(([h]) => HAZARD_TEXT[h].toast.split(" ")[0]).join(" ");
    const norm = level.mustBeatTolik ? `НОРМА ${level.target} КГ + ОБОГНАТЬ ТОЛИКА` : `НОРМА ${level.target} КГ`;
    const forced = level.forceMethod ? ` · ${METHOD_NAME[level.forceMethod]}` : "";
    const best = progress.best[level.id] ? ` · РЕКОРД ${fmtKg(progress.best[level.id])}` : "";
    card.innerHTML = locked
      ? `<span class="num">🔒</span><span><strong>${level.id}. ${level.name}</strong><small>Пройди предыдущий водоём.</small><span class="meta">${norm}</span></span><span class="stars">☆☆☆</span>`
      : `<span class="num">${level.id}</span><span><strong>${level.name}</strong><small>${level.blurb}</small><span class="meta">${norm}${forced}${best} · ${hazards}<br />СОВЕТ: ${TIPS[level.id]}</span></span><span class="stars">${starsHtml(stars)}</span>`;
    if (!locked) card.addEventListener("click", () => startLevel(level.id));
    else card.addEventListener("click", () => toast("СНАЧАЛА ПРОЙДИ ПРЕДЫДУЩИЙ"));
    ui.levelList.append(card);
  }
  ui.map.classList.add("active");
  scene.preview(Math.min(progress.unlocked, LEVELS.length));
}

// ---------------------------------------------------------------- gear shop
function showGear(): void {
  hideScreens();
  renderGear();
  ui.gear.classList.add("active");
}

function renderGear(): void {
  setText(ui.gearMoney, fmtMoney(progress.money));
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) => t.classList.toggle("active", t.dataset.slot === gearSlot));
  ui.gearList.replaceChildren();
  const method = equippedMethod(progress);
  for (const g of GEAR.filter((x) => x.slot === gearSlot)) {
    const owned = progress.owned.includes(g.id);
    const equipped = progress.equipped[g.slot] === g.id;
    const locked = g.unlock > progress.unlocked;
    const card = document.createElement("div");
    card.className = `gear-card${locked ? " locked" : ""}`;
    const tags: string[] = [];
    if (g.method) tags.push(METHOD_NAME[g.method]);
    if (g.methods) tags.push(`ДЛЯ: ${g.methods.map((m) => METHOD_NAME[m]).join(", ")}`);
    if (g.methods && !g.methods.includes(method) && g.slot === "bait") tags.push("⚠️ НЕ К ТВОЕЙ УДОЧКЕ");
    if (g.id === "rod-ice") tags.push("ВЫДАЮТ НА ЗИМНИКЕ");
    const button = document.createElement("button");
    if (equipped) { button.textContent = "НАДЕТО"; button.className = "equipped"; button.disabled = true; }
    else if (owned) { button.textContent = "ВЗЯТЬ"; button.className = "owned"; }
    else if (locked) { button.textContent = `🔒 ОТКРОЕТСЯ НА УР. ${g.unlock}`; button.disabled = true; }
    else if (progress.money < g.price) { button.textContent = `НЕ ХВАТАЕТ · ${fmtMoney(g.price)}`; button.disabled = true; }
    else button.textContent = `КУПИТЬ · ${fmtMoney(g.price)}`;
    button.addEventListener("click", () => {
      if (owned) equip(progress, g.id);
      else if (buy(progress, g.id)) { toast(`КУПЛЕНО: ${g.name}`); buzz(30); }
      renderGear();
    });
    card.innerHTML = `<span class="icon">${g.icon}</span><div><strong>${g.name}</strong><small>${g.blurb}</small>${tags.map((t) => `<span class="tag">${t}</span>`).join(" ")}</div>`;
    card.lastElementChild!.append(button);
    ui.gearList.append(card);
  }
}

document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) => t.addEventListener("click", () => {
  gearSlot = t.dataset.slot as GearSlot;
  renderGear();
}));
el("#gear-back").addEventListener("click", showMap);
ui.mapGear.addEventListener("click", () => showGear());

// ---------------------------------------------------------------- level flow
function startLevel(id: number): void {
  unlockAudio();
  voice.unlock();
  currentLevel = id;
  const level = levelById(id);
  const gear = { ...progress.equipped };
  // Some places dictate the tackle: on the ice only the jigging rod works.
  if (level.forceMethod === "ice") gear.rod = "rod-ice";
  showPlay();
  scene.startLevel(id, gear, level.forceMethod ?? equippedMethod(progress));
}

function showResult(r: LevelResult): void {
  releaseHook();
  releaseSteal();
  hidePlay();
  hideScreens();
  const level = levelById(r.level);
  const change = applyResult(progress, r);
  const final = r.level === LEVELS.length;
  ui.resultEyebrow.textContent = `УРОВЕНЬ ${level.id} · ${level.name}`;
  ui.resultEyebrow.style.color = r.pass ? "#b8d84a" : "#e8602f";
  if (r.pass) ui.resultTitle.innerHTML = final ? "ЧЕМПИОН<br />ОБЛАСТИ" : r.stars === 3 ? "УНИЗИЛ<br />ТОЛИКА" : "НОРМА<br />ВЫПОЛНЕНА";
  else if (r.reason === "ice") ui.resultTitle.innerHTML = "ПОД ЛЁД<br />С ПИВОМ";
  else if (r.reason === "rage") ui.resultTitle.innerHTML = level.forceMethod === "ice" ? "НЫРНУЛ<br />В ЛУНКУ" : "НЫРНУЛ<br />С ГОРЯ";
  else if (final && r.myKg >= level.target) ui.resultTitle.innerHTML = "ТОЛИК<br />ЧЕМПИОН";
  else ui.resultTitle.innerHTML = "НЕ ДОБРАЛ<br />НОРМУ";
  ui.resultRank.innerHTML = starsHtml(r.stars);
  ui.resultMine.textContent = fmtKg(r.myKg);
  ui.resultTarget.textContent = fmtKg(level.target);
  ui.resultFriend.textContent = fmtKg(r.friendKg);
  const parts = [`рыба +${fmtMoney(r.fishMoney)}`];
  if (r.starMoney) parts.push(`звёзды +${fmtMoney(r.starMoney)}`);
  if (r.fines) parts.push(`штрафы −${fmtMoney(r.fines)}`);
  ui.resultMoney.innerHTML = `${parts.join(" · ")} = <b>+${fmtMoney(r.money)}</b> · В КАРМАНЕ ${fmtMoney(progress.money)}`;
  const unlock: string[] = [];
  if (change.unlockedNew) unlock.push(`ОТКРЫТ УРОВЕНЬ ${change.unlockedNew}: ${levelById(change.unlockedNew).name}`);
  if (change.newGear.length) unlock.push(`В МАГАЗИНЕ: ${change.newGear.map((id) => gearById(id)?.name).join(", ")}`);
  ui.resultUnlock.textContent = unlock.join(" · ");
  const notes: string[] = [];
  if (r.biggest) notes.push(`Лучшая рыба: ${r.biggest.species.toLowerCase()} на ${r.biggest.weight.toFixed(2)} кг.`);
  else notes.push("Ни одной своей рыбы. Классика.");
  if (r.stolen) notes.push(`Стырено у Толика: ${r.stolen}.`);
  if (r.caught) notes.push(`Спалился на краже: ${r.caught} раз.`);
  if (!r.pass && r.reason === "target") notes.push(final ? "Надо было поймать больше Толика. Он это запомнит." : "Нужно больше килограммов. Подумай о снастях получше.");
  if (!r.pass && r.reason === "ice") notes.push("Три пива на тонком льду — плохая идея. Кто бы мог подумать.");
  if (r.pass && !final && r.stars < 3) notes.push(r.myKg > r.friendKg ? "Для трёх звёзд — норма ×1,6." : "Третья звезда — если обгонишь Толика.");
  if (final && r.pass) notes.push("Толик сказал, что это подстава и вода была «не та». Поздравляем.");
  ui.resultNote.textContent = notes.join(" ");
  const hasNext = r.pass && r.level < LEVELS.length;
  ui.nextButton.classList.toggle("hidden", !hasNext);
  ui.result.classList.add("active");
}

ui.nextButton.addEventListener("click", () => startLevel(Math.min(LEVELS.length, currentLevel + 1)));
el("#restart-button").addEventListener("click", () => startLevel(currentLevel));
el("#result-map").addEventListener("click", showMap);
el("#result-gear").addEventListener("click", () => showGear());

function showVideo(video: Video): void {
  setText(ui.videoEmoji, video.emoji);
  setText(ui.videoCaption, video.caption);
  ui.videoRage.textContent = video.rage > 0 ? `+${video.rage} 😡` : `${video.rage} 😌`;
  ui.videoRage.classList.toggle("bad", video.rage > 0);
  ui.video.style.setProperty("--tint", video.tint);
  ui.video.classList.remove("next");
  void ui.video.offsetWidth;
  ui.video.classList.add("next");
}

// ---------------------------------------------------------------- input
function press(button: HTMLElement, action: () => void): void {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    action();
  });
}

// Main button: a tap strikes/jigs/recasts, holding reels and pulls.
function releaseHook(): void {
  if (hookPointer === null) return;
  hookPointer = null;
  scene.hold(false);
}
ui.hook.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  unlockAudio();
  if (hookPointer !== null) return;
  hookPointer = event.pointerId;
  try { ui.hook.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
  scene.tapRod();
  scene.hold(true);
});
ui.hook.addEventListener("pointerup", releaseHook);
ui.hook.addEventListener("pointercancel", releaseHook);
ui.hook.addEventListener("lostpointercapture", releaseHook);
press(ui.beer, () => scene.beer());
press(ui.smoke, () => scene.smoke());
press(ui.phoneButton, () => scene.openPhone());
press(el("#swipe-button"), () => scene.swipe());
press(el("#close-phone"), () => scene.closePhone());

// Swipe up on the video itself, like the real app.
let swipeStart: number | null = null;
ui.video.addEventListener("pointerdown", (e) => { swipeStart = e.clientY; });
ui.video.addEventListener("pointerup", (e) => {
  if (swipeStart !== null && swipeStart - e.clientY > 30) scene.swipe();
  swipeStart = null;
});

function releaseSteal(): void {
  if (stealPointer === null) return;
  stealPointer = null;
  ui.steal.classList.remove("pressed");
  scene.stealEnd();
}
ui.steal.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (stealPointer !== null) return;
  stealPointer = event.pointerId;
  ui.steal.setPointerCapture(event.pointerId);
  ui.steal.classList.add("pressed");
  scene.stealStart();
});
ui.steal.addEventListener("pointerup", releaseSteal);
ui.steal.addEventListener("pointercancel", releaseSteal);
ui.steal.addEventListener("lostpointercapture", releaseSteal);

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); hookPointer = -1; scene.tapRod(); scene.hold(true); }
  if (event.code === "Digit1" || event.code === "KeyB") scene.beer();
  if (event.code === "Digit2" || event.code === "KeyC") scene.smoke();
  if (event.code === "Digit3" || event.code === "KeyT") ui.phone.classList.contains("hidden") ? scene.openPhone() : scene.swipe();
  if (event.code === "KeyX") scene.closePhone();
  if (event.code === "Digit4" || event.code === "KeyS") { ui.steal.classList.add("pressed"); stealPointer = -1; scene.stealStart(); }
  if (event.code === "Escape" || event.code === "KeyP") scene.togglePause();
});
window.addEventListener("keyup", (event) => {
  if (event.code === "Digit4" || event.code === "KeyS") releaseSteal();
  if (event.code === "Space" || event.code === "Enter") releaseHook();
});

ui.startButton.addEventListener("click", () => {
  unlockAudio();
  voice.unlock();
  showMap();
});
el("#pause-button").addEventListener("click", () => scene.togglePause());
el("#resume-button").addEventListener("click", () => scene.togglePause(true));
// Three independent switches, remembered per device.
function audioToggle(id: string, key: string, label: string, get: () => boolean, set: (off: boolean) => void): void {
  const button = el<HTMLButtonElement>(id);
  try { set(localStorage.getItem(key) === "1"); } catch { /* storage blocked */ }
  const sync = () => {
    setText(button, `${label}: ${get() ? "ВЫКЛ" : "ВКЛ"}`);
    button.setAttribute("aria-pressed", String(!get()));
  };
  sync();
  button.addEventListener("click", () => {
    set(!get());
    try { localStorage.setItem(key, get() ? "1" : "0"); } catch { /* storage blocked */ }
    sync();
  });
}
audioToggle("#sound-button", "ne-klyuet-muted", "ЗВУКИ", isMuted, setMuted);
audioToggle("#music-button", "ne-klyuet-music-off", "МУЗЫКА", isMusicMuted, setMusicMuted);
audioToggle("#voice-button", "ne-klyuet-voice-off", "ГОЛОСА", () => !voice.isEnabled(), (off) => voice.setEnabled(!off));
el("#quit-button").addEventListener("click", () => {
  ui.pause.classList.remove("active");
  scene.abandon();
  showMap();
});
window.addEventListener("blur", () => { releaseSteal(); releaseHook(); scene.pauseIfPlaying(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { releaseSteal(); releaseHook(); scene.pauseIfPlaying(); } });

// ---------------------------------------------------------------- scene → UI
scene.uiEvents.on("hud", updateHud);
scene.uiEvents.on("toast", toast);
scene.uiEvents.on("result", showResult);
scene.uiEvents.on("paused", (paused: boolean) => { releaseSteal(); releaseHook(); ui.pause.classList.toggle("active", paused); });
scene.uiEvents.on("phoneOpen", () => ui.phone.classList.remove("hidden"));
scene.uiEvents.on("phoneClose", () => ui.phone.classList.add("hidden"));
scene.uiEvents.on("video", showVideo);
scene.uiEvents.on("bell", () => {
  ui.bell.classList.add("ring");
  window.clearTimeout(bellTimer);
  bellTimer = window.setTimeout(() => ui.bell.classList.remove("ring"), 700);
  buzz(60);
});
scene.uiEvents.on("sleep", (on: boolean) => ui.sleepShade.classList.toggle("on", on));
scene.uiEvents.on("meltdown", () => {
  buzz([80, 60, 200]);
  releaseHook();
  ui.controls.classList.add("hidden");
  ui.phone.classList.add("hidden");
});
scene.uiEvents.once("ready", () => {
  ui.startButton.disabled = false;
});

async function boot(): Promise<void> {
  // Floating labels use the Cyrillic display face; give it a moment to load.
  try {
    await Promise.race([document.fonts.load('700 16px "Oswald"', "АБВ"), new Promise((resolve) => setTimeout(resolve, 1500))]);
  } catch { /* fall back to system fonts */ }
  // Pre-recorded voice lines, if they have been generated (npm run voices).
  void voice.loadRecordings(`${import.meta.env.BASE_URL}fishing/voice/`, (window as unknown as { __NK_VOICES?: Record<string, string> }).__NK_VOICES);
  try {
    scene.mount(el("#game"), el("#fx"));
  } catch {
    toast("НУЖЕН БРАУЗЕР С WEBGL");
  }
}
boot();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" }).catch(() => undefined);
  });
}
