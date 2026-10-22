import { PERKS, TOOLS, TOOL_ORDER, type PerkId, type ToolId } from "./content";
import { money, nextPrice, starsFor, type Save } from "./sim";

/**
 * The DOM layer over the 3D view: money, clock, what you are aiming at, the
 * action button, the tool bar, floating "+₴", toasts, the detector meter and
 * every menu (title, pause, garage, checklist, end of day, hand-over, perks).
 */

const svg = (d: string, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const ICONS: Record<ToolId | "shop" | "list" | "light" | "pause" | "rotate" | "arrow", string> = {
  hands: svg('<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V11M16 11V8a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2.5-4a1.5 1.5 0 0 1 2.5-1.6L7 13"/>'),
  washer: svg('<path d="M3 15h6l2-3h3"/><path d="M14 12h7"/><path d="M5 15v4h3l1-4"/><path d="M21 9l1-1M21 12h2M21 15l1 1"/>'),
  mower: svg('<path d="M4 16h13l2-4H8z"/><circle cx="7" cy="18" r="2"/><circle cx="16" cy="18" r="2"/><path d="M8 12L5 3"/><path d="M3 3h4"/>'),
  leaves: svg('<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l8-8"/>'),
  net: svg('<circle cx="15" cy="8" r="5"/><path d="M11.5 11.5L3 20"/><path d="M12 6l6 4M13 4l3 8"/>'),
  mop: svg('<path d="M16 3l-6 11"/><path d="M6 14h8l2 7H4z"/><path d="M8 17v4M11 17v4"/>'),
  squeegee: svg('<path d="M4 6h16"/><path d="M12 6v14"/><path d="M5 9c3 2 11 2 14 0"/>'),
  paint: svg('<rect x="4" y="3" width="13" height="6" rx="1.5"/><path d="M17 6h3v5h-8v3"/><rect x="10.5" y="14" width="3" height="7" rx="1"/>'),
  detector: svg('<path d="M14 3l-6 13"/><ellipse cx="7" cy="18.5" rx="5" ry="2.5"/><path d="M15 2l3 2-2 3"/>'),
  shop: svg('<path d="M3 10l2-6h14l2 6"/><path d="M4 10h16v10H4z"/><path d="M9 20v-6h6v6"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'),
  light: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'),
  pause: svg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
  rotate: svg('<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M8 3h5a4 4 0 0 1 4 4"/><path d="M15 5l2 2 2-2"/>'),
  arrow: svg('<path d="M12 20V4M5 11l7-7 7 7"/>'),
};

export interface TargetInfo {
  name: string;
  pct: number;
  value: number;
  need?: string;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  readonly root: HTMLElement;
  onTool: (id: ToolId) => void = () => {};
  onButton: (name: "shop" | "list" | "light" | "pause" | "mode") => void = () => {};
  onActionDown: () => void = () => {};
  onActionUp: () => void = () => {};
  private floatSum = 0;
  private floatT = 0;
  private lastTools = "";

  constructor() {
    const el = document.createElement("div");
    el.id = "hud";
    el.innerHTML = `
      <div id="hud-tl">
        <span class="pill" id="money">₴ 0</span>
        <span class="pill" id="clock"><span id="clock-t">08:00</span><span class="day" id="clock-d">день 1/3</span><span id="sunbar"><i></i></span></span>
        <span class="pill hidden" id="stage"><b id="stage-n"></b><span id="stage-name"></span><span id="stagebar"><i></i><em></em></span></span>
        <div id="fps" class="pill hidden"></div>
      </div>
      <div id="hud-tr">
        <button class="ibtn" id="b-light" aria-label="Підсвітити бруд">${ICONS.light}</button>
        <button class="ibtn" id="b-list" aria-label="Список робіт">${ICONS.list}</button>
        <button class="ibtn" id="b-shop" aria-label="Гараж">${ICONS.shop}</button>
        <button class="ibtn" id="b-pause" aria-label="Пауза">${ICONS.pause}</button>
      </div>
      <div id="target" class="hidden"><div class="row"><span class="name"></span><span class="pct"></span></div><div class="bar"><i></i></div><div class="row"><span class="need"></span><span class="val" style="color:var(--gold)"></span></div></div>
      <div id="crosshair"></div>
      <div id="prompt" class="hidden"><span class="t"></span><span class="hold hidden"><i></i></span></div>
      <div id="joyhint">ходити</div>
      <div id="joy"><div class="ring"></div><div class="knob"></div></div>
      <button id="mode" class="pill hidden"></button>
      <button id="action">Мити</button>
      <div id="toolsel"><div id="tools" class="hidden"></div><button id="toolbtn" class="tool" aria-label="Інструменти"></button></div>
      <div id="floaters"></div>
      <div id="toasts"></div>
      <div id="detector" class="hidden"><div class="bars"><i style="height:20%"></i><i style="height:40%"></i><i style="height:60%"></i><i style="height:80%"></i><i style="height:100%"></i></div><span class="arrow hidden">${ICONS.arrow}</span><span class="lbl">тихо</span></div>
      <div id="dishbar" class="hidden"><span id="dish-n"></span><button class="btn" id="dish-exit">Готово</button></div>
      <div id="dishhint" class="hidden">Тери пальцем по тарілці</div>
    `;
    document.body.appendChild(el);
    this.root = el;
    const rot = document.createElement("div");
    rot.id = "rotate";
    rot.innerHTML = `${ICONS.rotate}<div>Поверни телефон горизонтально</div>`;
    document.body.appendChild(rot);

    for (const b of ["shop", "list", "light", "pause"] as const) $(`b-${b}`).addEventListener("click", () => this.onButton(b));
    $("mode").addEventListener("click", () => this.onButton("mode"));
    const act = $("action");
    const down = (e: Event) => { e.preventDefault(); e.stopPropagation(); act.classList.add("pressed"); this.onActionDown(); };
    const up = (e: Event) => { e.preventDefault(); act.classList.remove("pressed"); this.onActionUp(); };
    act.addEventListener("touchstart", down, { passive: false });
    act.addEventListener("touchend", up);
    act.addEventListener("touchcancel", up);
    act.addEventListener("mousedown", down);
    act.addEventListener("mouseup", up);
    act.addEventListener("mouseleave", up);
    // One button shows the tool in hand; tapping it unfolds the others, and
    // picking one (or tapping anywhere else) folds them away again.
    $("toolbtn").addEventListener("click", () => this.toolsOpen(!this.toolsShown));
    $("tools").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-tool]");
      if (b) this.onTool(b.dataset.tool as ToolId);
      this.toolsOpen(false);
    });
    const outside = (e: Event) => {
      if (this.toolsShown && !$("toolsel").contains(e.target as Node)) this.toolsOpen(false);
    };
    document.addEventListener("touchstart", outside, { capture: true, passive: true });
    document.addEventListener("mousedown", outside, { capture: true });
    for (const id of ["hud-tr", "toolsel", "mode", "dishbar"]) {
      $(id).addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
      $(id).addEventListener("mousedown", (e) => e.stopPropagation());
    }
  }

  get joy(): { ring: HTMLElement; knob: HTMLElement } {
    return { ring: $("joy"), knob: $("joy").querySelector(".knob") as HTMLElement };
  }

  show(on: boolean): void {
    this.root.classList.toggle("hidden", !on);
  }

  playMode(play: boolean): void {
    for (const id of ["action", "toolsel", "crosshair", "joyhint", "hud-tr"]) $(id).classList.toggle("hidden", !play);
    if (!play) this.toolsOpen(false);
    $("dishbar").classList.toggle("hidden", play);
    $("dishhint").classList.toggle("hidden", play);
    if (!play) { $("target").classList.add("hidden"); $("prompt").classList.add("hidden"); $("detector").classList.add("hidden"); $("mode").classList.add("hidden"); }
  }

  setMoney(n: number): void {
    $("money").textContent = money(n);
  }

  setClock(label: string, day: number, deadline: number, frac: number): void {
    $("clock-t").textContent = label;
    $("clock-d").textContent = `день ${day}/${deadline}`;
    ($("sunbar").firstElementChild as HTMLElement).style.width = `${Math.min(100, frac * 100)}%`;
  }

  setTarget(t: TargetInfo | null): void {
    const el = $("target");
    if (!t) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    (el.querySelector(".name") as HTMLElement).textContent = t.name;
    (el.querySelector(".pct") as HTMLElement).textContent = `${Math.floor(t.pct * 100)}%`;
    ((el.querySelector(".bar i") as HTMLElement).style.width = `${t.pct * 100}%`);
    (el.querySelector(".need") as HTMLElement).textContent = t.need ?? "";
    (el.querySelector(".val") as HTMLElement).textContent = t.value ? money(t.value) : "";
  }

  setCrosshair(state: "" | "ok" | "no", scale = 1): void {
    const c = $("crosshair");
    c.className = state;
    c.style.width = c.style.height = `${Math.round(22 * scale)}px`;
    c.style.margin = `${-Math.round(11 * scale)}px 0 0 ${-Math.round(11 * scale)}px`;
  }

  setPrompt(text: string | null, hold = -1): void {
    const p = $("prompt");
    if (!text) { p.classList.add("hidden"); return; }
    p.classList.remove("hidden");
    (p.querySelector(".t") as HTMLElement).textContent = text;
    const h = p.querySelector(".hold") as HTMLElement;
    h.classList.toggle("hidden", hold < 0);
    if (hold >= 0) (h.firstElementChild as HTMLElement).style.width = `${hold * 100}%`;
  }

  setAction(label: string, style: "" | "gold" | "dim" = ""): void {
    const a = $("action");
    if (a.textContent !== label) a.textContent = label;
    a.className = style + (a.classList.contains("pressed") ? " pressed" : "");
  }

  setMode(label: string | null): void {
    const m = $("mode");
    m.classList.toggle("hidden", !label);
    if (label) m.textContent = label;
  }

  setTools(save: Save, current: ToolId, want: ToolId | null): void {
    const key = TOOL_ORDER.map((id) => save.tools[id]).join() + current + want;
    if (key === this.lastTools) return;
    this.lastTools = key;
    $("tools").innerHTML = TOOL_ORDER.filter((id) => save.tools[id] > 0 && id !== current).map((id) => `
      <button class="tool${id === want ? " want" : ""}" data-tool="${id}" aria-label="${TOOLS[id].name}">
        ${ICONS[id]}<span>${TOOLS[id].short}</span>
      </button>`).join("");
    const b = $("toolbtn");
    b.innerHTML = `${ICONS[current]}<span>${TOOLS[current].short}</span>`;
    b.classList.toggle("want", !!want && want !== current);
  }

  private toolsShown = false;
  toolsOpen(on: boolean): void {
    this.toolsShown = on;
    $("tools").classList.toggle("hidden", !on);
    $("toolbtn").classList.toggle("open", on);
  }

  /** Current stage of the job: its number, name and progress toward `need`. */
  stage(i: number, total: number, name: string, share: number, need: number): void {
    const el = $("stage");
    el.classList.remove("hidden");
    if (i >= total) {
      $("stage-n").textContent = "✓";
      $("stage-name").textContent = "Усе відкрито";
      $("stagebar").classList.add("hidden");
      return;
    }
    $("stagebar").classList.remove("hidden");
    $("stage-n").textContent = `${i + 1}/${total}`;
    $("stage-name").textContent = name;
    ($("stagebar").firstElementChild as HTMLElement).style.width = `${Math.min(100, (share / need) * 100)}%`;
  }

  stageFlash(): void {
    const el = $("stage");
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  }

  fps(n: number | null): void {
    const f = $("fps");
    f.classList.toggle("hidden", n === null);
    if (n !== null) f.textContent = `${n} FPS`;
  }

  setLight(on: boolean): void {
    $("b-light").classList.toggle("on", on);
  }

  /** Adds money to the floating "+₴" counter (merged over a short window). */
  float(amount: number): void {
    this.floatSum += amount;
    if (this.floatT <= 0) this.floatT = 0.35;
  }

  update(dt: number): void {
    if (this.floatT > 0) {
      this.floatT -= dt;
      if (this.floatT <= 0 && this.floatSum >= 0.5) {
        const f = document.createElement("div");
        f.className = "floater";
        f.textContent = `+${Math.round(this.floatSum)} ₴`;
        f.style.left = `${(Math.random() - 0.5) * 60}px`;
        $("floaters").appendChild(f);
        setTimeout(() => f.remove(), 1200);
        this.floatSum = 0;
      }
    }
  }

  toast(text: string, kind: "" | "good" | "gold" = ""): void {
    const t = document.createElement("div");
    t.className = `toast ${kind}`;
    t.textContent = text;
    const box = $("toasts");
    box.appendChild(t);
    while (box.children.length > 3) box.firstElementChild!.remove();
    setTimeout(() => t.remove(), 2900);
  }

  detector(level: number | null, arrowDeg: number | null = null, label = ""): void {
    const d = $("detector");
    if (level === null) { d.classList.add("hidden"); return; }
    d.classList.remove("hidden");
    d.querySelectorAll(".bars i").forEach((b, i) => {
      b.className = level > i / 5 ? (i >= 3 ? "hot" : "on") : "";
    });
    const a = d.querySelector(".arrow") as HTMLElement;
    a.classList.toggle("hidden", arrowDeg === null);
    if (arrowDeg !== null) a.style.transform = `rotate(${arrowDeg}deg)`;
    (d.querySelector(".lbl") as HTMLElement).textContent = label;
  }

  dishes(left: number, onExit: () => void): void {
    $("dish-n").textContent = left > 0 ? `Брудного посуду: ${left}` : "Весь посуд чистий!";
    $("dish-exit").onclick = onExit;
  }

  // ── Menus ────────────────────────────────────

  private overlay(id: string, html: string): HTMLElement {
    document.getElementById(id)?.remove();
    const o = document.createElement("div");
    o.className = "ov";
    o.id = id;
    o.innerHTML = html;
    o.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
    o.addEventListener("mousedown", (e) => e.stopPropagation());
    document.body.appendChild(o);
    return o;
  }

  close(id: string): void {
    document.getElementById(id)?.remove();
  }

  title(o: { client: string; owner: string; day: number; houses: number; stars: number; money: number; best: string; loading: boolean }, onPlay: () => void, onNew: () => void, onSettings: () => void): void {
    const el = this.overlay("ov-title", `
      <div class="side">
        <div class="eyebrow">РОГАЛИК ВІД ПЕРШОЇ ОСОБИ</div>
        <h1>Хата<br>з краю</h1>
        <div class="lead">Покоси, відмий, залатай — і купи собі техніку потужнішу.</div>
        <div class="meta">${o.client} · ${o.owner}${o.houses ? ` · бригада: ${o.houses} хат, ${o.stars}★` : ""}<br>У кишені <b>${money(o.money)}</b>${o.best ? ` · рекорд ${o.best}` : ""}</div>
        ${(navigator as Navigator & { standalone?: boolean }).standalone ? "" : `<div class="tip">Порада: «Поділитися» → «На початковий екран» — гра відкриється на весь екран.</div>`}
        <div class="loading" id="loading">${o.loading ? "Завантажую подвір'я…<i><b></b></i>" : ""}</div>
        <button class="btn primary" id="t-play" ${o.loading ? "disabled" : ""}>${o.day > 1 || o.houses ? "Продовжити" : "Почати роботу"}</button>
        <div class="btns"><button class="btn" id="t-set">Налаштування</button><button class="btn" id="t-new">Нова бригада</button></div>
      </div>`);
    el.querySelector("#t-play")!.addEventListener("click", onPlay);
    el.querySelector("#t-new")!.addEventListener("click", onNew);
    el.querySelector("#t-set")!.addEventListener("click", onSettings);
  }

  loading(frac: number, done: boolean): void {
    const l = document.getElementById("loading");
    if (!l) return;
    if (done) {
      l.innerHTML = "";
      (document.getElementById("t-play") as HTMLButtonElement | null)?.removeAttribute("disabled");
      return;
    }
    const b = l.querySelector("b") as HTMLElement | null;
    if (b) b.style.width = `${Math.round(frac * 100)}%`;
  }

  pause(onResume: () => void, onSettings: () => void, onTitle: () => void): void {
    const el = this.overlay("ov-pause", `<div class="panel" style="width:min(420px,100%)"><div class="eyebrow">ПЕРЕКУР</div><h2>Пауза</h2>
      <p>Ліва частина екрана — ходити, права — дивитися. Велика кнопка — працювати. Лампочка підсвічує бруд, який лишився.</p>
      <div class="btns"><button class="btn primary" id="p-r">Працювати далі</button><button class="btn" id="p-s">Налаштування</button><button class="btn" id="p-t">У меню</button></div></div>`);
    el.querySelector("#p-r")!.addEventListener("click", onResume);
    el.querySelector("#p-s")!.addEventListener("click", onSettings);
    el.querySelector("#p-t")!.addEventListener("click", onTitle);
  }

  settings(save: Save, onChange: () => void, onClose: () => void): void {
    const seg = (name: string, val: string, opts: Array<[string, string]>) =>
      `<span class="seg" data-k="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === val ? "on" : ""}">${l}</button>`).join("")}</span>`;
    const s = save.settings;
    const el = this.overlay("ov-set", `<div class="panel" style="width:min(460px,100%)"><h2>Налаштування</h2><div class="settings">
      <label>Графіка ${seg("quality", s.quality, [["low", "Низька"], ["medium", "Середня"], ["high", "Висока"]])}</label>
      <label>Звук ${seg("sound", String(s.sound), [["true", "Увімк."], ["false", "Вимк."]])}</label>
      <label>Чутливість огляду ${seg("sensitivity", String(s.sensitivity), [["0.7", "Низька"], ["1", "Звичайна"], ["1.4", "Висока"]])}</label>
      <label>Показувати FPS ${seg("fps", String(s.showFps), [["true", "Так"], ["false", "Ні"]])}</label>
      <p>Якість застосується після перезапуску сторінки.</p>
      </div><div class="btns"><button class="btn primary" id="s-ok">Готово</button></div></div>`);
    el.querySelectorAll<HTMLElement>(".seg").forEach((sg) => sg.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      const k = sg.dataset.k!, v = b.dataset.v!;
      if (k === "quality") s.quality = v as Save["settings"]["quality"];
      if (k === "sound") s.sound = v === "true";
      if (k === "sensitivity") s.sensitivity = Number(v);
      if (k === "fps") s.showFps = v === "true";
      sg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      onChange();
    }));
    el.querySelector("#s-ok")!.addEventListener("click", () => { this.close("ov-set"); onClose(); });
  }

  shop(save: Save, onBuy: (id: ToolId) => void, onClose: () => void): void {
    const cards = TOOL_ORDER.filter((id) => id !== "hands").map((id) => {
      const t = TOOLS[id], lv = save.tools[id], p = nextPrice(save, id);
      const cur = lv ? t.levels[lv - 1] : null;
      const next = t.levels[lv];
      return `<div class="card"><div class="head">${ICONS[id]}<b>${cur ? cur.name : t.name}</b></div>
        <div class="lvl">${t.levels.map((_, i) => `<i class="${i < lv ? "on" : ""}"></i>`).join("")}</div>
        <small>${next ? `${lv ? "Далі" : "Купити"}: <b style="color:#fff">${next.name}</b> — ${next.blurb}` : `${cur?.blurb ?? ""} Найкраща версія.`}</small>
        ${p !== null ? `<button class="btn ${save.money >= p ? "gold" : ""}" data-buy="${id}" ${save.money >= p ? "" : "disabled"}>${money(p)}</button>` : `<button class="btn" disabled>Максимум</button>`}
      </div>`;
    }).join("");
    const el = this.overlay("ov-shop", `<div class="panel" style="width:min(900px,100%)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><div class="eyebrow">ГАРАЖ</div><h2>Техніка</h2></div><span class="pill" style="color:var(--gold)">${money(save.money)}</span></div>
      <div class="shop">${cards}</div><div class="btns"><button class="btn primary" id="sh-x">До роботи</button></div></div>`);
    el.querySelectorAll<HTMLElement>("[data-buy]").forEach((b) => b.addEventListener("click", () => onBuy(b.dataset.buy as ToolId)));
    el.querySelector("#sh-x")!.addEventListener("click", onClose);
  }

  checklist(rows: Array<{ group: string; name: string; pct: number; value: number }>, overall: number, value: number, onHand: () => void, onClose: () => void, client: string): void {
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!groups.has(r.group)) groups.set(r.group, []);
      groups.get(r.group)!.push(r);
    }
    const st = starsFor(overall);
    const list = [...groups].map(([g, rs]) => `<div class="grp">${g.toUpperCase()}</div>` + rs.map((r) => `
      <div class="it${r.pct >= 0.999 ? " done" : ""}"><span>${r.name}</span><span class="bar"><i style="width:${r.pct * 100}%"></i></span><span class="p">${Math.floor(r.pct * 100)}%</span><span class="v">${r.value ? money(r.value) : ""}</span></div>`).join("")).join("");
    const el = this.overlay("ov-list", `<div class="panel" style="width:min(720px,100%)">
      <div class="overall"><div><div class="eyebrow">${client.toUpperCase()}</div><h2>Що лишилось</h2></div>
        <span class="big">${Math.floor(overall * 100)}%</span><span class="stars">${"★".repeat(st)}<s>${"★".repeat(5 - st)}</s></span></div>
      <p>Зірки за загальну чистоту: 35% · 50% · 65% · 80% · 92%. Здати хату можна будь-коли; на третій вечір господар забере її сам. Уся хата ≈ ${money(value)}.</p>
      <div class="list">${list}</div>
      <div class="btns"><button class="btn primary" id="l-x">Працювати далі</button><button class="btn gold" id="l-h">Здати хату</button></div></div>`);
    el.querySelector("#l-x")!.addEventListener("click", onClose);
    el.querySelector("#l-h")!.addEventListener("click", onHand);
  }

  dayEnd(o: { day: number; earned: number; overall: number; last: boolean }, onNext: () => void): void {
    const el = this.overlay("ov-day", `<div class="panel" style="width:min(440px,100%)"><div class="eyebrow">ВЕЧІР ${o.day}-ГО ДНЯ</div>
      <h2>${o.last ? "Час здавати хату" : "Сонце сіло"}</h2>
      <p>Хата чиста на ${Math.floor(o.overall * 100)}%. На цій хаті вже заробив ${money(o.earned)}.${o.last ? " Господар приходить приймати роботу." : " Завтра зранку продовжиш."}</p>
      <div class="btns"><button class="btn primary" id="d-n">${o.last ? "Показати господарю" : "Наступний ранок"}</button></div></div>`);
    el.querySelector("#d-n")!.addEventListener("click", onNext);
  }

  handOver(o: { client: string; owner: string; stars: number; overall: number; bonus: number; earned: number; failed: boolean; line: string }, onNext: () => void): void {
    const el = this.overlay("ov-hand", `<div class="panel" style="width:min(480px,100%)"><div class="eyebrow">${o.client.toUpperCase()}</div>
      <h2>${o.failed ? "Господар незадоволений" : "Роботу прийнято"}</h2>
      <span class="stars">${"★".repeat(o.stars)}<s>${"★".repeat(5 - o.stars)}</s></span>
      <p>${o.owner}: «${o.line}»</p>
      <p>Чистота ${Math.floor(o.overall * 100)}%. Заробив на хаті ${money(o.earned)}${o.bonus ? `, премія за зірки ${money(o.bonus)}` : ""}.${o.failed ? " Бригада розпадається: бонуси згоріли, але техніка і гроші — твої." : ""}</p>
      <div class="btns"><button class="btn primary" id="h-n">${o.failed ? "Нова бригада" : "Далі"}</button></div></div>`);
    el.querySelector("#h-n")!.addEventListener("click", onNext);
  }

  perks(offer: PerkId[], onPick: (p: PerkId) => void): void {
    const el = this.overlay("ov-perks", `<div class="panel"><div class="eyebrow">НАСТУПНА ХАТА</div><h2>Що візьмеш із собою?</h2>
      <div class="perks">${offer.map((p) => `<button class="perk" data-p="${p}"><b>${PERKS[p].name}</b><span>${PERKS[p].text}</span></button>`).join("")}</div></div>`);
    el.querySelectorAll<HTMLElement>("[data-p]").forEach((b) => b.addEventListener("click", () => onPick(b.dataset.p as PerkId)));
  }
}
