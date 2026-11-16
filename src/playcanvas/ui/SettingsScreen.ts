import { audio } from "../audio/Audio";
import { setSetting, settings, type Settings } from "../settings";
import { sheet } from "./ProfileScreens";
import { installKind, startInstall } from "./Install";
import { exportSave, importSave } from "../saveData";
import { BIOMES } from "../world/level/Biomes";

const CSS = `
#sheet .set { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; padding: 12px 14px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(236, 227, 207, 0.12); }
#sheet .set b { font: 800 18px "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.04em; }
#sheet .set small { grid-column: 1; opacity: 0.7; }
#sheet .set output { font: 800 16px "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.04em; color: #d6a23c; min-width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
#sheet .set input[type=range] { grid-column: 1 / -1; width: 100%; height: 30px; margin: 2px 0 0; background: none; -webkit-appearance: none; appearance: none; touch-action: pan-y; }
#sheet .set input[type=range]::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: linear-gradient(90deg, #d6a23c var(--v, 50%), rgba(236, 227, 207, 0.16) var(--v, 50%)); }
#sheet .set input[type=range]::-moz-range-track { height: 6px; border-radius: 3px; background: linear-gradient(90deg, #d6a23c var(--v, 50%), rgba(236, 227, 207, 0.16) var(--v, 50%)); }
#sheet .set input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; margin-top: -9px; border-radius: 50%; background: #f3e7d3; border: 2px solid #140f0b; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.6); }
#sheet .set input[type=range]::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: #f3e7d3; border: 2px solid #140f0b; }
#sheet button.set { width: 100%; box-sizing: border-box; text-align: left; color: inherit; font: inherit; }
#sheet .set .sw { grid-row: 1 / span 2; grid-column: 2; position: relative; width: 52px; height: 30px; border-radius: 15px; background: rgba(236, 227, 207, 0.16); transition: background 0.15s; }
#sheet .set .sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #f3e7d3; transition: transform 0.15s; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5); }
#sheet .set.on .sw { background: #d6a23c; }
#sheet .set.on .sw::after { transform: translateX(22px); }
#sheet .save textarea { width: 100%; height: 86px; box-sizing: border-box; margin: 8px 0; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(236, 227, 207, 0.25); background: rgba(0, 0, 0, 0.35); color: #ece3cf; font: 12px/1.3 ui-monospace, Menlo, monospace; resize: none; word-break: break-all; -webkit-user-select: text; user-select: text; }
#sheet .save .go { width: 100%; height: 42px; border-radius: 10px; border: 1px solid #d6a23c; background: rgba(214, 162, 60, 0.14); color: #f2c66b; font: 800 16px/1 "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.16em; }
#sheet .save .go:disabled { opacity: 0.4; }
#sheet .save .msg { min-height: 1.4em; margin: 6px 0 0; color: #9be096; }
#sheet .save .msg.bad { color: #e8806a; }
#sheet .save h3 { margin-top: 16px; }
#sheet .back { margin-top: 10px; width: 100%; height: 40px; border-radius: 10px; border: 1px solid rgba(236, 227, 207, 0.25); background: none; color: inherit; font: 800 15px/1 "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.16em; }
#sheet .set .act { grid-row: 1 / span 2; grid-column: 2; font: 800 13px "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.1em; padding: 6px 10px; border-radius: 6px; background: rgba(236, 227, 207, 0.1); }
`;

/**
 * The settings sheet (title screen and pause menu): music and sound volume, screen shake, damage
 * numbers, the battery saver, and a replay of the first-run hints. Every change applies at once.
 */
export function showSettings(onClose: () => void = () => {}, links: { label: string; note: string; onClick: () => void }[] = []): void {
  if (!document.getElementById("settings-css")) {
    const style = document.createElement("style");
    style.id = "settings-css";
    style.textContent = CSS;
    document.head.append(style);
  }
  // The sheet shows the settings, or (from its last row) the save-code page.
  let page: "settings" | "save" = "settings";
  sheet((box, redraw) => {
    if (page === "save") {
      saveCodePage(box, () => { page = "settings"; redraw(); });
      return;
    }
    box.insertAdjacentHTML("beforeend", `<h2>SETTINGS</h2><div class="sub">Saved on this device.</div><div class="list"></div>`);
    const list = box.querySelector(".list")!;

    const slider = (key: "music" | "sfx", label: string, note: string) => {
      const row = document.createElement("label");
      row.className = "set";
      row.innerHTML = `<b>${label}</b><output></output><small>${note}</small><input type="range" min="0" max="100" step="5">`;
      const input = row.querySelector("input")!, out = row.querySelector("output")!;
      const show = () => {
        const v = Math.round(settings[key] * 100);
        input.value = String(v);
        input.style.setProperty("--v", `${v}%`);
        out.textContent = v === 0 ? "OFF" : `${v}%`;
      };
      show();
      input.addEventListener("input", () => {
        setSetting(key, Number(input.value) / 100);
        show();
      });
      // A click at the new level when the thumb is let go.
      if (key === "sfx") input.addEventListener("change", () => audio.play("ui"));
      list.append(row);
    };

    const toggle = (key: keyof Pick<Settings, "shake" | "numbers" | "saver">, label: string, note: string) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `set${settings[key] ? " on" : ""}`;
      row.setAttribute("role", "switch");
      row.setAttribute("aria-checked", String(settings[key]));
      row.innerHTML = `<b>${label}</b><span class="sw"></span><small>${note}</small>`;
      row.addEventListener("click", () => {
        setSetting(key, !settings[key]);
        audio.play("ui");
        redraw();
      });
      list.append(row);
    };

    slider("music", "Music", "The chapter's theme and the boss track");
    slider("sfx", "Sound", "Guns, the horde, the interface");
    toggle("shake", "Screen shake", "The camera kicks on blasts and hits");
    toggle("numbers", "Damage numbers", "Numbers pop over enemies when you hit them");
    toggle("saver", "Battery saver", "30 frames a second and a softer picture: cooler phone, longer play");

    const hints = document.createElement("button");
    hints.type = "button";
    hints.className = "set";
    hints.innerHTML = `<b>How to play</b><span class="act">${settings.tutorial ? "ON NEXT RUN" : "SHOW AGAIN"}</span><small>The first-level hints: move, auto-fire, dash</small>`;
    hints.addEventListener("click", () => {
      setSetting("tutorial", true);
      audio.play("ui");
      redraw();
    });
    list.append(hints);

    const save = document.createElement("button");
    save.type = "button";
    save.className = "set";
    save.innerHTML = `<b>Move your save</b><span class="act">OPEN</span><small>Carry your progress to the Home Screen app or another browser</small>`;
    save.addEventListener("click", () => {
      audio.play("ui");
      page = "save";
      redraw();
    });
    list.append(save);

    // Rows that open another screen (install, credits): this sheet closes first.
    const link = (label: string, note: string, onClick: () => void) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "set";
      row.innerHTML = `<b></b><span class="act">OPEN</span><small></small>`;
      row.querySelector("b")!.textContent = label;
      row.querySelector("small")!.textContent = note;
      row.addEventListener("click", () => {
        audio.play("ui");
        box.querySelector<HTMLElement>(".close")?.click();
        onClick();
      });
      list.append(row);
    };
    if (installKind()) link("Install app", "Add Dustline to your Home Screen: full screen, its own icon", startInstall);
    for (const l of links) link(l.label, l.note, l.onClick);
  }, onClose);
}

/**
 * The save-code page: copy this browser's progress as a code; paste a code to load it here (the
 * page reloads with it). For moving to the Home Screen app, which keeps its own storage.
 */
function saveCodePage(box: HTMLElement, back: () => void): void {
  const chapters = Object.keys(BIOMES);
  box.insertAdjacentHTML("beforeend", `<h2>MOVE YOUR SAVE</h2><div class="sub">Heroes, quests, Dust, upgrades and settings travel as one code.</div>
    <div class="save">
      <h3>FROM THIS DEVICE</h3>
      <button type="button" class="go copy">COPY SAVE CODE</button>
      <div class="msg copied"></div>
      <h3>TO THIS DEVICE</h3>
      <textarea placeholder="Paste a save code here" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
      <button type="button" class="go load" disabled>LOAD THIS CODE</button>
      <div class="msg loaded"></div>
    </div>
    <button type="button" class="back">BACK TO SETTINGS</button>`);
  const area = box.querySelector("textarea")!;
  const copied = box.querySelector<HTMLElement>(".copied")!, loaded = box.querySelector<HTMLElement>(".loaded")!;
  const load = box.querySelector<HTMLButtonElement>(".load")!;
  box.querySelector(".copy")!.addEventListener("click", () => {
    const code = exportSave(chapters);
    const done = () => { copied.className = "msg copied"; copied.textContent = "Copied. Paste it into the app's Settings › Move your save."; };
    const manual = () => {
      // No clipboard access: the code goes in the box, selected, to copy by hand.
      area.value = code;
      area.focus();
      area.select();
      copied.className = "msg copied";
      copied.textContent = "Select all of the text in the box below and copy it.";
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done, manual);
    else manual();
  });
  area.addEventListener("input", () => { load.disabled = !area.value.trim(); loaded.textContent = ""; });
  load.addEventListener("click", () => {
    if (!importSave(area.value, chapters)) {
      loaded.className = "msg loaded bad";
      loaded.textContent = "That is not a Dustline save code.";
      return;
    }
    loaded.className = "msg loaded";
    loaded.textContent = "Loaded. Restarting…";
    window.setTimeout(() => location.reload(), 600);
  });
  box.querySelector(".back")!.addEventListener("click", back);
}
