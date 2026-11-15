// "Install app": Dustline as a Home Screen app (full screen, its own icon, saves the browser does
// not clear). Android / desktop Chrome offer a real prompt (beforeinstallprompt, kept here until the
// player asks); iOS has no prompt, so the player is shown the three taps. Hidden once installed.

import { sheet } from "./ProfileScreens";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let promptEvent: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const DISMISS_KEY = "dustline.install.hidden";

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    promptEvent = e as InstallPromptEvent;
    for (const fn of listeners) fn();
  });
  window.addEventListener("appinstalled", () => {
    promptEvent = null;
    for (const fn of listeners) fn();
  });
}

/** Running as an installed app (no browser bars). */
export function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** How the game can be installed here: a real prompt, the iOS steps, or not at all (already installed, desktop Safari...). */
export function installKind(): "prompt" | "ios" | null {
  if (isStandalone()) return null;
  if (promptEvent) return "prompt";
  return isIos() ? "ios" : null;
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Asks the browser to keep this site's saves (not cleared when storage runs low or the site goes unvisited). */
export function keepSaves(): void {
  try {
    void navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* not supported */
  }
}

/**
 * Wires the title screen's install pill: shown while the game can be installed and the player has
 * not closed it; a tap opens the browser's prompt, or the iOS steps.
 */
export function setupInstall(pill: HTMLElement, onSound: () => void): void {
  const show = () => { pill.hidden = !installKind() || dismissed(); };
  show();
  listeners.add(show);
  pill.querySelector(".x")?.addEventListener("click", (e) => {
    e.stopPropagation();
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage unavailable */ }
    show();
  });
  pill.addEventListener("click", () => {
    onSound();
    if (promptEvent) {
      const e = promptEvent;
      promptEvent = null;
      void e.prompt().then(() => e.userChoice).then(show, show);
      return;
    }
    showIosSteps();
  });
}

const CSS = `
#sheet .steps { display: grid; gap: 8px; counter-reset: step; }
#sheet .steps div { display: grid; grid-template-columns: 34px 1fr; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 10px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(236, 227, 207, 0.12); }
#sheet .steps div::before { counter-increment: step; content: counter(step); width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: #d6a23c; color: #140f0b; font: 800 18px "Barlow Condensed", system-ui, sans-serif; }
#sheet .steps b { font: 800 17px "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.04em; }
#sheet .steps small { display: block; opacity: 0.75; }
#sheet .steps svg { width: 15px; height: 15px; vertical-align: -2px; }
#sheet .note { margin-top: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(143, 216, 255, 0.4); background: rgba(10, 18, 24, 0.5); color: #cfeaff; }
`;

const SHARE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;

/** iOS: Share, Add to Home Screen, Add; and the note about the app's separate save. */
function showIosSteps(): void {
  if (!document.getElementById("install-css")) {
    const style = document.createElement("style");
    style.id = "install-css";
    style.textContent = CSS;
    document.head.append(style);
  }
  sheet((box) => {
    box.insertAdjacentHTML("beforeend", `<h2>INSTALL DUSTLINE</h2><div class="sub">Play full screen, with its own icon, like any other game on your phone.</div>
      <div class="steps">
        <div><span><b>Open this page in Safari</b><small>If you are in another app's browser, use its "Open in Safari".</small></span></div>
        <div><span><b>Tap Share ${SHARE_SVG}</b><small>The square with the arrow, in Safari's bar.</small></span></div>
        <div><span><b>Add to Home Screen</b><small>Scroll the list down to find it, then tap Add.</small></span></div>
      </div>
      <div class="note">The app keeps its own save. To bring your progress along: Settings › Move your save, copy the code here, and load it in the app.</div>`);
  }, () => {});
}
