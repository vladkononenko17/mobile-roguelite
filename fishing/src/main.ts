import "./fishing.css";
import { Scene3D } from "./Scene3D";
import { isMusicMuted, isMuted, setMusicMuted, setMuted, unlockAudio } from "./sfx";
import { voice } from "./voice";
import { DAYS, PERKS, rankFor, type PerkId, type SimSnapshot, type Video } from "./sim";

function el<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing UI element: ${selector}`);
  return found;
}

const scene = new Scene3D();
// Handy for playtesting from the console: __fishing.sim.rage = 95
(window as unknown as { __fishing: Scene3D }).__fishing = scene;
const ui = {
  hud: el("#hud"),
  rageBlock: el(".rage-block"),
  rageBar: el("#rage-bar"),
  rageText: el("#rage-text"),
  dayText: el("#day-text"),
  clockText: el("#clock-text"),
  scoreText: el("#score-text"),
  dayFill: el("#day-fill"),
  drunkRow: el("#drunk-row"),
  vignette: el("#rage-vignette"),
  sleepShade: el("#sleep-shade"),
  controls: el("#controls"),
  reel: el("#reel"),
  reelZone: el("#reel-zone"),
  reelMarker: el("#reel-marker"),
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
  shop: el("#shop-screen"),
  shopEyebrow: el("#shop-eyebrow"),
  shopScore: el("#shop-score"),
  shopList: el("#shop-list"),
  pause: el("#pause-screen"),
  result: el("#result-screen"),
  resultEyebrow: el("#result-eyebrow"),
  resultTitle: el("#result-title"),
  resultRank: el("#result-rank"),
  resultMine: el("#result-mine"),
  resultFriend: el("#result-friend"),
  resultStolen: el("#result-stolen"),
  resultNote: el("#result-note"),
  toast: el("#toast"),
};

let toastTimer = 0;
let bellTimer = 0;
let stealPointer: number | null = null;

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
  ui.vignette.style.opacity = "0";
  ui.sleepShade.classList.remove("on");
}

function toast(message: string): void {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove("show"), 1500);
}

function buzz(ms: number | number[]): void {
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}

function updateHud(s: SimSnapshot): void {
  ui.rageBar.style.transform = `scaleX(${s.rage / 100})`;
  setText(ui.rageText, String(Math.floor(s.rage)));
  ui.rageBlock.classList.toggle("hot", s.rage > 78);
  ui.vignette.style.opacity = String(Math.max(0, (s.rage - 55) / 45));
  ui.vignette.classList.toggle("pulse", s.rage > 85);
  setText(ui.dayText, `ДЕНЬ ${s.day + 1}/${DAYS.length}`);
  setText(ui.clockText, s.clock);
  setText(ui.scoreText, `ТЫ ${s.myCount} · ${s.friendCount} ТОЛИК`);
  ui.dayFill.style.transform = `scaleX(${s.dayProgress})`;
  const drunk = s.drunk > 0 ? `ПРОМИЛЛЕ ${"▮".repeat(s.drunk)}${"▯".repeat(Math.max(0, 5 - s.drunk))}` : "";
  const smoke = s.smoking > 0 ? "  · КУРИШЬ" : "";
  setText(ui.drunkRow, drunk + smoke);

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

  let label = "ПОДСЕЧЬ";
  if (s.rod === "bite") label = "ПОДСЕКАЙ!";
  else if (s.rod === "reeling") label = "ТЯНИ!";
  else if (s.hands === "asleep") label = "ХРРР…";
  else if (s.hands === "beer") label = "ГЛЫК-ГЛЫК";
  else if (s.rod === "recast") label = "ЗАБРОС…";
  setText(ui.hook, label);
  ui.hook.classList.toggle("bite", s.rod === "bite");
  ui.hook.classList.toggle("reeling", s.rod === "reeling");
  ui.reel.classList.toggle("hidden", s.rod !== "reeling");
  if (s.rod === "reeling") {
    ui.reelZone.style.left = `${s.reelZone[0] * 100}%`;
    ui.reelZone.style.width = `${(s.reelZone[1] - s.reelZone[0]) * 100}%`;
    ui.reelMarker.style.left = `${s.reelMarker * 100}%`;
  }
}

function showShop({ day, offers, snapshot }: { day: number; offers: PerkId[]; snapshot: SimSnapshot }): void {
  releaseSteal();
  hidePlay();
  ui.shopEyebrow.textContent = `ВЕЧЕР · ДЕНЬ ${day + 1} ИЗ ${DAYS.length} ПОЗАДИ`;
  ui.shopScore.textContent = `ТЫ ${snapshot.myKg.toFixed(1)} КГ · ТОЛИК ${snapshot.friendKg.toFixed(1)} КГ · ЗЛОСТЬ ЗА НОЧЬ УПАДЁТ ВДВОЕ`;
  ui.shopList.replaceChildren();
  offers.forEach((id) => {
    const perk = PERKS[id];
    const button = document.createElement("button");
    button.className = "upgrade-card";
    button.innerHTML = `<span class="upgrade-icon" style="--accent:${perk.accent}">${perk.icon}</span>
      <span class="upgrade-copy"><strong>${perk.title}</strong><span>${perk.description}</span></span>`;
    button.addEventListener("click", () => {
      hideScreens();
      showPlay();
      scene.choosePerk(id);
    }, { once: true });
    ui.shopList.append(button);
  });
  ui.shop.classList.add("active");
}

interface Result {
  won: boolean; abandoned: boolean; day: number; myKg: number; myCount: number; friendKg: number; friendCount: number; stolen: number; caught: number;
  biggest?: { species: string; weight: number };
}

function showResult(r: Result): void {
  releaseSteal();
  hidePlay();
  hideScreens();
  if (r.won) {
    const rank = rankFor(r.myKg, r.friendKg, r.stolen);
    ui.resultEyebrow.textContent = "ПОНЕДЕЛЬНИК, ВЕЧЕР · ДОСИДЕЛ";
    ui.resultEyebrow.style.color = "#b8d84a";
    ui.resultTitle.innerHTML = r.myKg > r.friendKg ? "ПЕРЕЛОВИЛ<br />ТОЛИКА" : "НЕРВЫ<br />ЖЕЛЕЗНЫЕ";
    ui.resultRank.textContent = `РАНГ ${rank.rank} · ${rank.title}`;
  } else {
    ui.resultEyebrow.textContent = r.abandoned ? "СМОТАЛ УДОЧКИ" : `ДЕНЬ ${r.day + 1} · УДОЧКА СЛОМАНА`;
    ui.resultEyebrow.style.color = "#e8602f";
    ui.resultTitle.innerHTML = r.abandoned ? "ДОМОЙ<br />РАНЬШЕ" : "НЫРНУЛ<br />В РЕКУ";
    ui.resultRank.textContent = r.abandoned ? "" : "ТОЛИК ДОСТАЛ ТЕБЯ ПОДСАЧЕКОМ";
  }
  ui.resultMine.textContent = r.myKg.toFixed(1);
  ui.resultFriend.textContent = r.friendKg.toFixed(1);
  ui.resultStolen.textContent = String(r.stolen);
  const notes = [] as string[];
  if (r.biggest) notes.push(`Лучшая рыба: ${r.biggest.species.toLowerCase()} на ${r.biggest.weight.toFixed(2)} кг.`);
  else notes.push("Ни одной своей рыбы. Классика.");
  if (r.caught) notes.push(`Спалился на краже: ${r.caught} раз.`);
  ui.resultNote.textContent = notes.join(" ");
  ui.result.classList.add("active");
}

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

press(ui.hook, () => { unlockAudio(); scene.tapRod(); });
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
  if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); scene.tapRod(); }
  if (event.code === "Digit1" || event.code === "KeyB") scene.beer();
  if (event.code === "Digit2" || event.code === "KeyC") scene.smoke();
  if (event.code === "Digit3" || event.code === "KeyT") ui.phone.classList.contains("hidden") ? scene.openPhone() : scene.swipe();
  if (event.code === "KeyX") scene.closePhone();
  if (event.code === "Digit4" || event.code === "KeyS") { ui.steal.classList.add("pressed"); stealPointer = -1; scene.stealStart(); }
  if (event.code === "Escape" || event.code === "KeyP") scene.togglePause();
});
window.addEventListener("keyup", (event) => {
  if (event.code === "Digit4" || event.code === "KeyS") releaseSteal();
});

function startRun(): void {
  unlockAudio();
  voice.unlock();
  showPlay();
  scene.startRun();
}
ui.startButton.addEventListener("click", startRun);
el("#restart-button").addEventListener("click", startRun);
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
});
window.addEventListener("blur", () => { releaseSteal(); scene.pauseIfPlaying(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { releaseSteal(); scene.pauseIfPlaying(); } });

// ---------------------------------------------------------------- scene → UI
scene.uiEvents.on("hud", updateHud);
scene.uiEvents.on("toast", toast);
scene.uiEvents.on("dayEnd", showShop);
scene.uiEvents.on("result", showResult);
scene.uiEvents.on("paused", (paused: boolean) => { releaseSteal(); ui.pause.classList.toggle("active", paused); });
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
