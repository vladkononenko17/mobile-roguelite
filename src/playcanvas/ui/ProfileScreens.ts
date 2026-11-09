import { audio } from "../audio/Audio";
import { GADGETS } from "../gameplay/gadgets";
import { HEROES } from "../gameplay/heroes";
import { chooseHero, currentHero, heroUnlocked, profile, QUESTS, rewardText } from "../gameplay/profile";
import { iconSvg } from "./UpgradeIcons";

const CSS = `
#sheet { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(8, 6, 4, 0.86);
  font: 500 13px/1.35 system-ui, sans-serif; color: #ece3cf; }
#sheet .box { width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow-y: auto; box-sizing: border-box;
  padding: 18px 16px 14px; background: #17120e; border: 1px solid rgba(236, 227, 207, 0.18); border-radius: 12px; }
#sheet h2 { margin: 0; font: 800 28px/1 "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.12em; }
#sheet .sub { margin: 6px 0 12px; opacity: 0.7; }
#sheet .list { display: grid; gap: 8px; }
#sheet .row { display: grid; grid-template-columns: 40px 1fr auto; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(236, 227, 207, 0.12); text-align: left; color: inherit; font: inherit; width: 100%; box-sizing: border-box; }
#sheet .row > span:nth-child(2) { min-width: 0; }
#sheet .row .ic { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--c, #d6a23c); color: #140f0b; }
#sheet .row .ic svg { width: 22px; height: 22px; fill: currentColor; }
#sheet .row b { font: 800 18px "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.04em; }
#sheet .row small { display: block; opacity: 0.8; }
#sheet .row .minus { color: #e69a7a; }
#sheet .row .tag { font: 800 13px "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.1em; padding: 4px 8px; border-radius: 6px; background: rgba(236, 227, 207, 0.1); }
#sheet .row.on { border-color: var(--c, #d6a23c); box-shadow: 0 0 0 1px var(--c, #d6a23c) inset; }
#sheet .row.on .tag { background: var(--c, #d6a23c); color: #140f0b; }
#sheet .row.locked { opacity: 0.55; }
#sheet .row.locked .ic { background: rgba(236, 227, 207, 0.15); color: #ece3cf; }
#sheet .row.done .tag { background: #8fd8ff; color: #0e1418; }
#sheet .bar { height: 5px; margin-top: 6px; border-radius: 3px; background: rgba(236, 227, 207, 0.12); overflow: hidden; }
#sheet .bar i { display: block; height: 100%; background: #8fd8ff; }
#sheet h3 { margin: 14px 0 6px; font: 800 16px "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.16em; opacity: 0.8; }
#sheet .close { margin-top: 14px; width: 100%; height: 44px; border: 0; border-radius: 10px; background: #d6a23c; color: #140f0b;
  font: 800 18px/1 "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.2em; }
`;

/** A modal sheet over the title screen; `fill` draws its content (again after every change). */
function sheet(fill: (box: HTMLElement, redraw: () => void) => void, onClose: () => void): void {
  if (document.getElementById("sheet")) return;
  if (!document.getElementById("sheet-css")) {
    const style = document.createElement("style");
    style.id = "sheet-css";
    style.textContent = CSS;
    document.head.append(style);
  }
  const root = document.createElement("div");
  root.id = "sheet";
  const box = document.createElement("div");
  box.className = "box";
  root.append(box);
  const done = () => {
    window.removeEventListener("keydown", onKey, true);
    root.remove();
    onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") done();
  };
  const redraw = () => {
    box.innerHTML = "";
    fill(box, redraw);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.textContent = "CLOSE";
    close.addEventListener("click", done);
    box.append(close);
  };
  root.addEventListener("click", (e) => { if (e.target === root) done(); });
  window.addEventListener("keydown", onKey, true);
  redraw();
  document.body.append(root);
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The hero picker: every hero with its perk and drawback; locked ones show the quest that frees them. */
export function showHeroes(onClose: () => void = () => {}): void {
  sheet((box, redraw) => {
    const chosen = currentHero();
    box.insertAdjacentHTML("beforeend", `<h2>HEROES</h2><div class="sub">Each hero changes how a run starts. Complete quests to unlock more.</div><div class="list"></div>`);
    const list = box.querySelector(".list")!;
    for (const h of HEROES) {
      const open = heroUnlocked(h.id);
      const quest = QUESTS.find((q) => "hero" in q.reward && q.reward.hero === h.id);
      const row = document.createElement("button");
      row.type = "button";
      row.className = `row${h.id === chosen ? " on" : ""}${open ? "" : " locked"}`;
      row.style.setProperty("--c", h.color);
      row.innerHTML = `<span class="ic">${iconSvg(h.icon)}</span><span><b>${esc(h.name)}</b> <small>${esc(h.role)}</small>
        <small>${open ? `${esc(h.perk)}<br><span class="minus">${esc(h.drawback)}</span>` : `🔒 ${esc(quest ? `${quest.name}: ${quest.text}` : "Locked")}`}</small></span>
        <span class="tag">${h.id === chosen ? "CHOSEN" : open ? "PICK" : "LOCKED"}</span>`;
      row.addEventListener("click", () => {
        if (!open) return;
        chooseHero(h.id);
        audio.play("upgrade");
        redraw();
      });
      list.append(row);
    }
  }, onClose);
}

/** Quests: progress bars, rewards; done ones at the bottom. */
export function showQuests(onClose: () => void = () => {}): void {
  sheet((box) => {
    const p = profile();
    const done = QUESTS.filter((q) => p.quests.includes(q.id));
    box.insertAdjacentHTML("beforeend", `<h2>QUESTS</h2><div class="sub">${done.length}/${QUESTS.length} complete · progress counts across every run</div><div class="list open"></div><h3>COMPLETE</h3><div class="list done"></div>`);
    const row = (q: (typeof QUESTS)[number], finished: boolean) => {
      const [have, goal] = q.progress(p);
      const el = document.createElement("div");
      el.className = `row${finished ? " done" : ""}`;
      el.style.setProperty("--c", finished ? "#8fd8ff" : "#d6a23c");
      el.innerHTML = `<span class="ic">${iconSvg(q.icon)}</span><span><b>${esc(q.name)}</b><small>${esc(q.text)} · ${esc(rewardText(q.reward))}</small>
        ${finished ? "" : `<div class="bar"><i style="width:${Math.min(100, (100 * have) / goal).toFixed(0)}%"></i></div>`}</span>
        <span class="tag">${finished ? "DONE" : `${Math.min(have, goal).toLocaleString("en-US")}/${goal.toLocaleString("en-US")}`}</span>`;
      return el;
    };
    const open = box.querySelector(".list.open")!, closed = box.querySelector(".list.done")!;
    for (const q of QUESTS) (p.quests.includes(q.id) ? closed : open).append(row(q, p.quests.includes(q.id)));
    if (!done.length) box.querySelector("h3")!.remove();
    const locked = GADGETS.filter((g) => g.locked && !p.unlocked.includes(g.id));
    if (locked.length) box.insertAdjacentHTML("beforeend", `<div class="sub" style="margin-top:12px">Gadgets still locked: ${locked.map((g) => esc(g.name)).join(", ")}</div>`);
  }, onClose);
}
