import Phaser from "phaser";
import "../styles.css";
import { GAME_HEIGHT, GAME_WIDTH } from "./game/config";
import { GameScene } from "./game/GameScene";
import type { HudState, ResultState, UpgradeChoice, UpgradeId } from "./game/types";
import { joystickVector, timeLabel } from "./game/math";

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing UI element: ${selector}`);
  return found;
}

const gameScene = new GameScene();

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#342c28",
  render: {
    antialias: false,
    antialiasGL: false,
    roundPixels: true,
    powerPreference: "high-performance",
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
      gravity: { x: 0, y: 0 },
    },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [gameScene],
};

const ui = {
  hud: element<HTMLElement>("#hud"),
  healthBar: element<HTMLElement>("#health-bar"),
  healthText: element<HTMLElement>("#health-text"),
  timerText: element<HTMLElement>("#timer-text"),
  killsText: element<HTMLElement>("#kills-text"),
  xpFill: element<HTMLElement>("#xp-fill"),
  controls: element<HTMLElement>("#controls"),
  ammoPanel: element<HTMLElement>("#ammo-panel"),
  ammoText: element<HTMLElement>("#ammo-text"),
  reloadText: element<HTMLElement>("#reload-text"),
  startScreen: element<HTMLElement>("#start-screen"),
  upgradeScreen: element<HTMLElement>("#upgrade-screen"),
  upgradeList: element<HTMLElement>("#upgrade-list"),
  pauseScreen: element<HTMLElement>("#pause-screen"),
  resultScreen: element<HTMLElement>("#result-screen"),
  resultEyebrow: element<HTMLElement>("#result-eyebrow"),
  resultTitle: element<HTMLElement>("#result-title"),
  resultTime: element<HTMLElement>("#result-time"),
  resultKills: element<HTMLElement>("#result-kills"),
  resultLevel: element<HTMLElement>("#result-level"),
  fireButton: element<HTMLButtonElement>("#fire-button"),
  reloadButton: element<HTMLButtonElement>("#reload-button"),
  joystick: element<HTMLElement>("#joystick"),
  joystickKnob: element<HTMLElement>(".joystick-knob"),
  toast: element<HTMLElement>("#toast"),
  boss: element<HTMLElement>("#boss-panel"),
  bossFill: element<HTMLElement>("#boss-fill"),
  stage: element<HTMLElement>("#stage-text"),
  auto: element<HTMLButtonElement>("#auto-button"),
};

let toastTimer = 0;
let joystickPointer: number | null = null;
let joystickCenter = { x: 0, y: 0 };
let sceneReady = false;
let loadout: UpgradeId = "damage";
let firePointer: number | null = null;
let fireOrigin = { x: 0, y: 0 };
const startButton = element<HTMLButtonElement>("#start-button");
startButton.disabled = true;

function hideScreens(): void {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
}

function showPlayUi(): void {
  hideScreens();
  ui.hud.classList.remove("hidden");
  ui.controls.classList.remove("hidden");
  ui.ammoPanel.classList.remove("hidden");
}

function startRun(): void {
  if (!sceneReady) return;
  showPlayUi();
  ui.auto.setAttribute("aria-pressed", "false");
  gameScene.startRun(loadout);
}

function showToast(message: string): void {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove("show"), 1450);
}

function setHudText(target: HTMLElement, value: string): void {
  if (target.textContent !== value) target.textContent = value;
}

function updateHud(state: HudState): void {
  ui.healthBar.style.transform = `scaleX(${Math.max(0, state.hp / state.maxHp)})`;
  setHudText(ui.healthText, String(Math.ceil(state.hp)));
  setHudText(ui.timerText, timeLabel(state.remaining));
  setHudText(ui.killsText, `${state.kills} SCRAPPED`);
  ui.xpFill.style.transform = `scaleX(${Math.max(0, state.xp / state.xpToNext)})`;
  setHudText(ui.ammoText, `${state.ammo} / ${state.magazine}`);
  setHudText(ui.reloadText, state.reloading
    ? `RELOADING ${Math.floor(state.reloadProgress * 100)}%`
    : state.ammo === 0
      ? "EMPTY"
      : "READY");
  ui.reloadButton.disabled = state.reloading;
  ui.boss.classList.toggle("hidden", state.bossRatio === null);
  ui.bossFill.style.transform = `scaleX(${state.bossRatio ?? 0})`;
  setHudText(ui.stage, state.remaining === 0 && !state.bossDefeated ? "FINISH THE FOREMAN" : `DUSTLINE // RANK ${state.level}`);
}

function presentUpgrade(choices: UpgradeChoice[]): void {
  resetControls();
  ui.upgradeList.replaceChildren();
  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "upgrade-card";
    button.innerHTML = `
      <span class="upgrade-icon">${choice.icon}</span>
      <span class="upgrade-copy"><strong>${choice.title}</strong><span>${choice.description}</span></span>
      <span class="upgrade-level">MK ${choice.level}</span>
    `;
    button.addEventListener("click", () => gameScene.applyUpgrade(choice.id as UpgradeId), { once: true });
    ui.upgradeList.append(button);
  });
  ui.upgradeScreen.classList.add("active");
}

function showResult(result: ResultState): void {
  hideScreens();
  resetControls();
  ui.hud.classList.add("hidden");
  ui.controls.classList.add("hidden");
  ui.ammoPanel.classList.add("hidden");
  ui.resultEyebrow.textContent = result.won ? "CONTRACT COMPLETE" : "CONTRACT FAILED";
  ui.resultEyebrow.style.color = result.won ? "#b8d84a" : "#e8602f";
  ui.resultTitle.innerHTML = result.won ? "YOU MADE<br />A MESS" : "THE WASTE<br />BIT BACK";
  ui.resultTime.textContent = timeLabel(result.elapsed);
  ui.resultKills.textContent = String(result.kills);
  ui.resultLevel.textContent = String(result.level);
  ui.resultScreen.classList.add("active");
}

function updateJoystick(clientX: number, clientY: number): void {
  const dx = clientX - joystickCenter.x;
  const dy = clientY - joystickCenter.y;
  const distance = Math.hypot(dx, dy);
  const max = 43;
  const ratio = distance > 0 ? Math.min(1, max / distance) : 0;
  const knobX = dx * ratio;
  const knobY = dy * ratio;
  ui.joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
  const vector = joystickVector(dx, dy, max);
  gameScene.setMove(vector.x, vector.y);
}

function resetControls(): void {
  joystickPointer = null;
  firePointer = null;
  gameScene.setMove(0, 0);
  gameScene.setAim(null);
  gameScene.setFiring(false);
  ui.fireButton.classList.remove("pressed");
  ui.joystickKnob.style.transform = "translate(-50%, -50%)";
}

ui.joystick.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (joystickPointer !== null) return;
  joystickPointer = event.pointerId;
  const rect = ui.joystick.getBoundingClientRect();
  joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  ui.joystick.setPointerCapture(event.pointerId);
  updateJoystick(event.clientX, event.clientY);
});

ui.joystick.addEventListener("pointermove", (event) => {
  if (event.pointerId !== joystickPointer) return;
  event.preventDefault();
  updateJoystick(event.clientX, event.clientY);
});

const releaseJoystick = (event: PointerEvent): void => {
  if (event.pointerId !== joystickPointer) return;
  joystickPointer = null;
  gameScene.setMove(0, 0);
  ui.joystickKnob.style.transform = "translate(-50%, -50%)";
};

ui.joystick.addEventListener("pointerup", releaseJoystick);
ui.joystick.addEventListener("pointercancel", releaseJoystick);
ui.joystick.addEventListener("lostpointercapture", releaseJoystick);

ui.fireButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (firePointer !== null) return;
  firePointer = event.pointerId;
  fireOrigin = { x: event.clientX, y: event.clientY };
  ui.fireButton.setPointerCapture(event.pointerId);
  ui.fireButton.classList.add("pressed");
  gameScene.setFiring(true);
});

const releaseFire = (): void => {
  firePointer = null;
  ui.fireButton.classList.remove("pressed");
  gameScene.setFiring(false);
  gameScene.setAim(null);
};

ui.fireButton.addEventListener("pointermove", (event) => {
  if (event.pointerId !== firePointer) return;
  const dx = event.clientX - fireOrigin.x;
  const dy = event.clientY - fireOrigin.y;
  gameScene.setAim(Math.hypot(dx, dy) > 14 ? Math.atan2(dy, dx) : null);
});
ui.fireButton.addEventListener("pointerup", releaseFire);
ui.fireButton.addEventListener("pointercancel", releaseFire);
ui.fireButton.addEventListener("lostpointercapture", releaseFire);
ui.reloadButton.addEventListener("click", () => gameScene.requestReload());
ui.auto.addEventListener("click", () => {
  const enabled = ui.auto.getAttribute("aria-pressed") !== "true";
  ui.auto.setAttribute("aria-pressed", String(enabled));
  gameScene.setAutoFire(enabled);
});

startButton.addEventListener("click", startRun);
element<HTMLButtonElement>("#restart-button").addEventListener("click", startRun);
element<HTMLButtonElement>("#pause-button").addEventListener("click", () => gameScene.togglePause());
element<HTMLButtonElement>("#resume-button").addEventListener("click", () => gameScene.togglePause(true));
element<HTMLButtonElement>("#quit-button").addEventListener("click", () => {
  ui.pauseScreen.classList.remove("active");
  gameScene.abandonRun();
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "Space") {
    event.preventDefault();
    ui.fireButton.classList.add("pressed");
    gameScene.setFiring(true);
  }
  if (event.code === "KeyR") gameScene.requestReload();
  if (event.code === "Escape" || event.code === "KeyP") gameScene.togglePause();
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") releaseFire();
});

window.addEventListener("blur", () => { resetControls(); gameScene.pauseIfPlaying(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { resetControls(); gameScene.pauseIfPlaying(); }
});

document.querySelectorAll<HTMLButtonElement>(".loadout-option").forEach((button) => {
  button.addEventListener("click", () => {
    loadout = button.dataset.mod as UpgradeId;
    document.querySelectorAll(".loadout-option").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
    element<HTMLElement>("#loadout-description").textContent = button.dataset.description ?? "";
  });
});

gameScene.uiEvents.on("hud", updateHud);
gameScene.uiEvents.once("ready", () => {
  sceneReady = true;
  startButton.disabled = false;
});
gameScene.uiEvents.on("toast", showToast);
gameScene.uiEvents.on("upgrade", presentUpgrade);
gameScene.uiEvents.on("upgrade-closed", () => ui.upgradeScreen.classList.remove("active"));
gameScene.uiEvents.on("paused", (paused: boolean) => {
  resetControls();
  ui.pauseScreen.classList.toggle("active", paused);
});
gameScene.uiEvents.on("result", showResult);

new Phaser.Game(gameConfig);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // A v1 cache-first page can load once before the new worker takes control.
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then((registration) => registration.update()).catch(() => undefined);
  });
}
