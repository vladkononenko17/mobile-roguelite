import { tr } from "./i18n.ts";
import * as A from "./audio.ts";
import { H, buzz } from "./haptics.ts";

/**
 * Small games played at the start of an action. Each returns a score:
 * 0..1, or 1.25 for a perfect game (the sim treats 1 as "as before").
 *
 * - work: a Jira board with a CI pipeline, Slack pinging you while you merge
 * - cook: pick the ingredients in order, then hold the flame in the zone
 * - game: a retro arcade on the old TV
 * - shower: the building's hot water swings; keep it bearable
 * - music / guitar: tap along with the beat, three lanes
 */

export interface MiniCtx {
  /** 0..1: how broken the head is. */
  despair: number;
  /** 0..1: shaking hands (craving, withdrawal, drink). */
  shake: number;
}

type Close = () => void;

/** Opens the minigame layer with an app-like card; returns its body and a closer. */
function open(kind: string, title: string, prompt: string): { body: HTMLElement; close: Close } {
  const box = document.querySelector<HTMLElement>("#mini")!;
  const card = box.querySelector<HTMLElement>(".mini-card")!;
  card.classList.add("mg", `mg-${kind}`);
  document.querySelector("#mini-title")!.textContent = title;
  document.querySelector("#mini-prompt")!.textContent = prompt;
  const body = document.querySelector<HTMLElement>("#mini-body")!;
  body.innerHTML = "";
  box.classList.remove("hidden");
  return {
    body,
    close: () => {
      box.classList.add("hidden");
      card.classList.remove("mg", `mg-${kind}`);
      body.innerHTML = "";
    },
  };
}

const el = <T extends HTMLElement = HTMLElement>(root: ParentNode, q: string) => root.querySelector<T>(q)!;
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const shuffle = <T,>(a: T[]) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A short synth note (silent when sound is off or locked). */
const note = (f: number, dur = 0.18, type: OscillatorType = "triangle", vol = 0.05, at = 0) => A.tone(f, at, dur, type, vol);

// ================================================================ work: Jira + Slack

const TICKETS: Array<[string, string, "bug" | "story" | "task"]> = [
  ["Кнопка «Оплатити» не реагує на Android", "The Pay button does nothing on Android", "bug"],
  ["Падає вхід через SSO після оновлення", "SSO login crashes after the update", "bug"],
  ["Додати темну тему в налаштування", "Add a dark theme to settings", "story"],
  ["Оновити залежності до React 19", "Upgrade dependencies to React 19", "task"],
  ["Часовий пояс ламає місячний звіт", "Time zone breaks the monthly report", "bug"],
  ["Експорт CSV для бухгалтерії", "CSV export for accounting", "story"],
  ["Прибрати console.log з продакшену", "Remove console.log from production", "task"],
  ["Кеш не скидається після релізу", "Cache is not cleared after a release", "bug"],
  ["Пуші приходять двічі", "Push notifications arrive twice", "bug"],
  ["Фільтр за датою в історії замовлень", "Date filter in order history", "story"],
  ["Покрити тестами модуль оплат", "Cover the payments module with tests", "task"],
];

const SLACK: Array<[string, string, string, string]> = [
  ["Ірина · PM", "Iryna · PM", "є апдейт по {key}? 🙏", "any update on {key}? 🙏"],
  ["Олег · Tech Lead", "Oleh · Tech Lead", "глянь мій PR, коли будеш", "check my PR when you're around"],
  ["Ірина · PM", "Iryna · PM", "клієнт питає про дедлайн 😬", "the client is asking about the deadline 😬"],
  ["#general", "#general", "хто сьогодні на дейлі? камери вмикаємо", "who's on the daily today? cameras on"],
  ["HR Bot", "HR Bot", "Не забудьте заповнити таймшит до 18:00", "Don't forget your timesheet by 6 pm"],
  ["Олег · Tech Lead", "Oleh · Tech Lead", "у тебе зелений пайплайн? в мене все червоне", "is your pipeline green? mine is all red"],
  ["Ірина · PM", "Iryna · PM", "можна на 5 хв созвон?", "got 5 min for a quick call?"],
];

const TYPE_ICON = { bug: "●", story: "▲", task: "■" } as const;

export function workGame(ctx: MiniCtx): Promise<number> {
  return new Promise((resolve) => {
    const { body, close } = open("jira", tr("РОБОТА", "WORK"), "");
    const sprint = 12 + Math.floor(Math.random() * 20);
    const picked = shuffle(TICKETS).slice(0, 5).map(([uk, en, type], i) => ({ key: `STN-${140 + Math.floor(Math.random() * 60) + i * 7}`, title: tr(uk, en), type, sp: pick([1, 2, 3, 5, 8]) }));
    body.innerHTML = `
      <div class="jr">
        <header class="jr-top"><b class="jr-logo">◆</b><span class="jr-proj">STN <small>${tr("Спринт", "Sprint")} ${sprint}</small></span><i class="jr-av">${tr("Я", "ME")}</i></header>
        <div class="jr-cols">
          <section><h6>${tr("ДО РОБОТИ", "TO DO")} <em class="n-todo">0</em></h6><div class="jr-list" data-col="todo"></div></section>
          <section><h6>${tr("В РОБОТІ", "IN PROGRESS")}</h6><div class="jr-list" data-col="prog"></div></section>
          <section><h6>${tr("ГОТОВО", "DONE")} <em class="n-done">0</em></h6><div class="jr-list" data-col="done"></div></section>
        </div>
        <div class="jr-ci">
          <div class="jr-ci-head"><span>CI · pipeline <b class="jr-run">#4821</b></span><span class="jr-state">${tr("чекає", "waiting")}</span></div>
          <div class="jr-bar"><div class="jr-zone"></div><div class="jr-mark"></div></div>
          <div class="jr-stages"><span>build</span><span>test</span><span>deploy</span></div>
        </div>
        <button class="jr-merge">${tr("Злити PR", "Merge PR")} ✓</button>
        <p class="jr-hint">${tr("Тисни «Злити», коли маркер у зеленій зоні тестів", "Tap Merge while the marker is in the green test zone")}</p>
        <div class="sl-pop hidden"><i class="sl-av"></i><div><b class="sl-from"></b><span class="sl-text"></span></div><small>${tr("щойно", "now")}</small></div>
      </div>`;
    const lists = { todo: el(body, '[data-col="todo"]'), prog: el(body, '[data-col="prog"]'), done: el(body, '[data-col="done"]') };
    const cards = picked.map((t) => {
      const c = document.createElement("div");
      c.className = `jr-card t-${t.type}`;
      c.innerHTML = `<span class="jr-key"><i>${TYPE_ICON[t.type]}</i>${t.key}</span><p>${t.title}</p><span class="jr-meta"><em>${t.sp}</em><i class="jr-av s">${tr("Я", "ME")}</i></span>`;
      lists.todo.appendChild(c);
      return c;
    });
    const nTodo = el(body, ".n-todo"), nDone = el(body, ".n-done");
    const zone = el(body, ".jr-zone"), mark = el(body, ".jr-mark"), state = el(body, ".jr-state"), run = el(body, ".jr-run");
    const pop = el(body, ".sl-pop");
    const counts = () => { nTodo.textContent = String(lists.todo.children.length); nDone.textContent = String(lists.done.children.length); };
    let round = 0, hits = 0, t = 0, pos = 0, z0 = 0, zw = 0, roundT = 0, busy = false, popT = 0, sp = 0;
    let last = performance.now();
    const speed = 1.05 + ctx.despair * 0.85 + ctx.shake * 0.3;
    const setZone = () => {
      const w = zw * (popT > 0 ? 0.7 : 1);
      zone.style.left = `${z0 * 100}%`;
      zone.style.width = `${w * 100}%`;
    };
    const slack = () => {
      const [fu, fe, tu, te] = pick(SLACK);
      el(pop, ".sl-from").textContent = tr(fu, fe);
      el(pop, ".sl-text").textContent = tr(tu, te).replace("{key}", picked[round]?.key ?? "STN-1");
      el(pop, ".sl-av").textContent = tr(fu, fe).replace("#", "").slice(0, 1).toUpperCase();
      pop.classList.remove("hidden", "gone");
      popT = 2.4;
      A.play("ping");
      buzz(H.tap, true);
    };
    pop.onpointerdown = (e) => { e.preventDefault(); popT = 0; pop.classList.add("gone"); note(880, 0.08, "sine", 0.03); };
    const begin = () => {
      const c = cards[round];
      lists.prog.appendChild(c);
      c.classList.add("active");
      counts();
      zw = Math.max(0.12, 0.25 - ctx.despair * 0.1 - round * 0.012);
      z0 = 0.12 + Math.random() * (0.82 - zw);
      roundT = 0;
      busy = false;
      run.textContent = `#${4821 + round * 3}`;
      state.textContent = tr("тести йдуть…", "tests running…");
      state.className = "jr-state";
      setZone();
      if (Math.random() < 0.3 + ctx.despair * 0.45 && round > 0) setTimeout(slack, 400 + Math.random() * 900);
    };
    const finish = async () => {
      cancelAnimationFrame(raf);
      state.textContent = tr(`закрито ${hits} з 5 · ${sp} SP`, `closed ${hits} of 5 · ${sp} SP`);
      state.className = `jr-state ${hits >= 4 ? "ok" : hits >= 2 ? "" : "bad"}`;
      if (hits >= 4) A.play("coin");
      await wait(1100);
      close();
      resolve(hits === 5 ? 1.25 : hits / 5);
    };
    const judge = async (hit: boolean, why: "tap" | "late") => {
      busy = true;
      const c = cards[round];
      c.classList.remove("active");
      if (hit) {
        hits++;
        sp += picked[round].sp;
        c.classList.add("done");
        state.textContent = tr("passed ✓ · злито", "passed ✓ · merged");
        state.className = "jr-state ok";
        A.play("type");
        note(660, 0.1, "sine", 0.04); note(990, 0.14, "sine", 0.04, 0.08);
        buzz(H.tap, true);
        lists.done.prepend(c);
      } else {
        c.classList.add("failed");
        state.textContent = why === "late" ? tr("таймаут ✕", "timed out ✕") : tr("failed ✕ · тести впали", "failed ✕ · tests broke");
        state.className = "jr-state bad";
        A.play("miss");
        buzz(H.miss, true);
        await wait(350);
        c.classList.remove("failed");
        lists.todo.appendChild(c);
        c.classList.add("back");
      }
      counts();
      round++;
      await wait(450);
      if (round >= 5) void finish();
      else begin();
    };
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!busy) {
        t += dt * speed;
        roundT += dt;
        pos = (Math.sin(t * 2.3) + 1) / 2 + Math.sin(t * 7.1) * 0.03 * ctx.despair + Math.sin(t * 13.7) * 0.05 * ctx.shake;
        pos = Math.max(0, Math.min(1, pos));
        mark.style.left = `${pos * 100}%`;
        if (roundT > 3.6) void judge(false, "late");
      }
      if (popT > 0) { popT -= dt; if (popT <= 0) pop.classList.add("gone"); setZone(); }
      raf = requestAnimationFrame(loop);
    };
    el<HTMLButtonElement>(body, ".jr-merge").onpointerdown = (e) => {
      e.preventDefault();
      if (busy || round >= 5) return;
      const w = zw * (popT > 0 ? 0.7 : 1);
      void judge(pos >= z0 && pos <= z0 + w, "tap");
    };
    counts();
    begin();
    raf = requestAnimationFrame(loop);
  });
}

// ================================================================ cook

const RECIPES: Array<{ uk: string; en: string; steps: Array<[string, string, string]> }> = [
  { uk: "Деруни", en: "Potato pancakes", steps: [["🥔", "Картопля", "Potatoes"], ["🧅", "Цибуля", "Onion"], ["🥚", "Яйце", "Egg"], ["🧂", "Сіль", "Salt"]] },
  { uk: "Гречка з грибами", en: "Buckwheat with mushrooms", steps: [["🧈", "Масло", "Butter"], ["🧅", "Цибуля", "Onion"], ["🍄", "Гриби", "Mushrooms"], ["🌾", "Гречка", "Buckwheat"]] },
  { uk: "Макарони по-флотськи", en: "Navy-style pasta", steps: [["🧅", "Цибуля", "Onion"], ["🥩", "Фарш", "Mince"], ["🍝", "Макарони", "Pasta"], ["🧂", "Сіль", "Salt"]] },
  { uk: "Омлет", en: "Omelette", steps: [["🧈", "Масло", "Butter"], ["🥚", "Яйця", "Eggs"], ["🥛", "Молоко", "Milk"], ["🧀", "Сир", "Cheese"]] },
];
const DECOYS: Array<[string, string, string]> = [["🍫", "Шоколад", "Chocolate"], ["🍋", "Лимон", "Lemon"], ["🍌", "Банан", "Banana"], ["🍓", "Полуниця", "Strawberry"], ["🥫", "Тушонка", "Tinned meat"]];

export function cookGame(ctx: MiniCtx): Promise<number> {
  return new Promise((resolve) => {
    const rec = pick(RECIPES);
    const { body, close } = open("cook", tr("ПЛИТА", "STOVE"), tr(rec.uk, rec.en));
    const items = shuffle([...rec.steps, ...shuffle(DECOYS).slice(0, 2)]);
    body.innerHTML = `
      <div class="ck">
        <ol class="ck-recipe">${rec.steps.map(([e, u, n]) => `<li><i>${e}</i>${tr(u, n)}</li>`).join("")}</ol>
        <div class="ck-pan"><div class="ck-oil"></div><div class="ck-in"></div><div class="ck-smoke"></div></div>
        <p class="ck-say">${tr("Кидай у сковорідку по черзі", "Into the pan, in order")}</p>
        <div class="ck-grid">${items.map(([e, u, n], i) => `<button data-i="${i}"><i>${e}</i>${tr(u, n)}</button>`).join("")}</div>
        <div class="ck-heat hidden"><div class="ck-gauge"><div class="ck-band"></div><div class="ck-needle"></div></div><button class="ck-fire">🔥 ${tr("ТРИМАЙ ВОГОНЬ", "HOLD THE FLAME")}</button></div>
      </div>`;
    const lis = [...body.querySelectorAll<HTMLElement>(".ck-recipe li")];
    const say = el(body, ".ck-say"), pan = el(body, ".ck-in");
    let step = 0, wrong = 0;
    lis[0].classList.add("now");
    body.querySelectorAll<HTMLButtonElement>(".ck-grid button").forEach((b) => {
      b.onpointerdown = (e) => {
        e.preventDefault();
        if (step >= rec.steps.length || b.disabled) return;
        const it = items[Number(b.dataset.i)];
        if (it === rec.steps[step]) {
          b.disabled = true;
          lis[step].classList.remove("now");
          lis[step].classList.add("ok");
          const s = document.createElement("i");
          s.textContent = it[0];
          s.style.left = `${20 + Math.random() * 55}%`;
          pan.appendChild(s);
          A.play("splash");
          buzz(H.tap, true);
          step++;
          if (step < rec.steps.length) lis[step].classList.add("now");
          else void heat();
        } else {
          wrong++;
          b.classList.remove("no"); void b.offsetWidth; b.classList.add("no");
          say.textContent = tr(`Не те. Зараз — ${tr(rec.steps[step][1], rec.steps[step][2]).toLowerCase()}`, `Not that. Now: ${tr(rec.steps[step][1], rec.steps[step][2]).toLowerCase()}`);
          A.play("miss");
          buzz(H.miss, true);
        }
      };
    });
    // phase two: the flame. Hold to heat; the band is a golden crust, above it burns
    const heat = async () => {
      await wait(300);
      el(body, ".ck-grid").classList.add("hidden");
      el(body, ".ck-heat").classList.remove("hidden");
      say.textContent = tr("Тримай температуру в золотій зоні", "Keep the heat in the golden band");
      const needle = el(body, ".ck-needle"), band = el(body, ".ck-band"), smoke = el(body, ".ck-smoke"), oil = el(body, ".ck-oil");
      const lo = 0.52, hi = 0.74 - ctx.despair * 0.05;
      band.style.bottom = `${lo * 100}%`;
      band.style.height = `${(hi - lo) * 100}%`;
      let temp = 0.2, held = false, inZone = 0, burnt = 0, T = 0, last = performance.now(), raf = 0, tick = 0;
      const fire = el<HTMLButtonElement>(body, ".ck-fire");
      fire.onpointerdown = (e) => { e.preventDefault(); held = true; fire.classList.add("held"); };
      fire.onpointerup = fire.onpointerleave = fire.onpointercancel = () => { held = false; fire.classList.remove("held"); };
      const DUR = 7;
      await new Promise<void>((done) => {
        const loop = (now: number) => {
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          T += dt;
          temp += (held ? 0.32 : -0.2) * dt + Math.sin(T * 9) * 0.004 * (1 + ctx.shake * 3);
          temp = Math.max(0, Math.min(1, temp));
          needle.style.bottom = `${temp * 100}%`;
          const ok = temp >= lo && temp <= hi;
          if (ok) inZone += dt;
          if (temp > hi + 0.08) burnt += dt;
          oil.style.opacity = String(0.3 + temp * 0.6);
          smoke.style.opacity = String(Math.min(1, burnt * 0.8));
          pan.classList.toggle("sizzle", ok);
          tick += dt;
          if (ok && tick > 0.18) { tick = 0; A.tone(1800 + Math.random() * 1600, 0, 0.04, "sawtooth", 0.006); }
          say.textContent = temp > hi ? tr("Горить!", "It's burning!") : ok ? tr("Шкварчить як треба", "Sizzling just right") : tr("Холодно, піддай вогню", "Too cold, more heat");
          if (T >= DUR) { done(); return; }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      });
      cancelAnimationFrame(raf);
      const order = rec.steps.length / (rec.steps.length + wrong);
      const fry = Math.max(0, inZone / (DUR - 1.2) - burnt * 0.15);
      const s = Math.min(1, order * 0.45 + Math.min(1, fry) * 0.55);
      say.textContent = s > 0.9 ? tr("Як у мами.", "Like mum's.") : s > 0.55 ? tr("Їстівно. Навіть смачно.", "Edible. Even tasty.") : tr("Підгоріло. Їсти можна.", "Burnt a bit. Still edible.");
      if (s > 0.9) A.play("win");
      await wait(1000);
      close();
      resolve(s > 0.92 ? 1.25 : s);
    };
  });
}

// ================================================================ the console: a retro arcade

export function consoleGame(ctx: MiniCtx): Promise<number> {
  return new Promise((resolve) => {
    const { body, close } = open("arcade", tr("ПРИСТАВКА", "CONSOLE"), "");
    body.innerHTML = `
      <div class="ar">
        <div class="ar-tv"><canvas width="240" height="200"></canvas><div class="ar-scan"></div></div>
        <div class="ar-hud"><span class="ar-lives">♥♥♥</span><span class="ar-score">0</span></div>
        <div class="ar-pad"><button data-d="-1">◀</button><button data-d="1">▶</button></div>
      </div>`;
    const cv = el<HTMLCanvasElement>(body, "canvas");
    const g = cv.getContext("2d")!;
    const W = 240, Hh = 200;
    let x = W / 2, dir = 0, lives = 3, stars = 0, T = 0, last = performance.now(), raf = 0, spawn = 0, inv = 0, over = false;
    const rocks: Array<{ x: number; y: number; v: number; r: number; star: boolean }> = [];
    const DUR = 16;
    const livesEl = el(body, ".ar-lives"), scoreEl = el(body, ".ar-score");
    body.querySelectorAll<HTMLButtonElement>(".ar-pad button").forEach((b) => {
      const d = Number(b.dataset.d);
      b.onpointerdown = (e) => { e.preventDefault(); dir = d; b.classList.add("held"); };
      b.onpointerup = b.onpointerleave = b.onpointercancel = () => { if (dir === d) dir = 0; b.classList.remove("held"); };
    });
    // drag on the screen too
    cv.onpointermove = (e) => { if (e.buttons || e.pointerType === "touch") { const r = cv.getBoundingClientRect(); x = ((e.clientX - r.left) / r.width) * W; } };
    const starsBg = Array.from({ length: 40 }, () => [Math.random() * W, Math.random() * Hh, Math.random()]);
    const draw = () => {
      g.fillStyle = "#06070c"; g.fillRect(0, 0, W, Hh);
      for (const s of starsBg) { s[1] = (s[1] + 0.4 + s[2]) % Hh; g.fillStyle = s[2] > 0.6 ? "#8890b0" : "#3a4060"; g.fillRect(s[0] | 0, s[1] | 0, 1, 1); }
      for (const r of rocks) {
        if (r.star) { g.fillStyle = "#ffd84a"; g.fillRect(r.x - 3, r.y - 1, 7, 3); g.fillRect(r.x - 1, r.y - 3, 3, 7); continue; }
        g.fillStyle = "#8a6a4a"; g.fillRect(r.x - r.r, r.y - r.r, r.r * 2, r.r * 2);
        g.fillStyle = "#5a4430"; g.fillRect(r.x - r.r + 2, r.y - 1, 3, 3); g.fillRect(r.x + 1, r.y - r.r + 2, 2, 2);
      }
      if (!(inv > 0 && Math.floor(T * 12) % 2)) {
        g.fillStyle = "#6ad0ff"; g.fillRect(x - 2, Hh - 22, 4, 6);
        g.fillStyle = "#e8e8f0"; g.fillRect(x - 7, Hh - 16, 14, 6); g.fillRect(x - 3, Hh - 19, 6, 3);
        g.fillStyle = "#ff6a3a"; g.fillRect(x - 5, Hh - 10, 3, 3 + (Math.floor(T * 20) % 2)); g.fillRect(x + 2, Hh - 10, 3, 3 + (Math.floor(T * 20 + 1) % 2));
      }
      // the time left, as a bar
      g.fillStyle = "#2a3050"; g.fillRect(4, 4, W - 8, 3);
      g.fillStyle = "#6ad0ff"; g.fillRect(4, 4, (W - 8) * Math.max(0, 1 - T / DUR), 3);
    };
    const end = async () => {
      over = true;
      cancelAnimationFrame(raf);
      g.fillStyle = "rgba(6,7,12,.7)"; g.fillRect(0, 0, W, Hh);
      g.fillStyle = lives > 0 ? "#ffd84a" : "#ff5a4a"; g.font = "bold 18px monospace"; g.textAlign = "center";
      g.fillText(lives > 0 ? tr("РІВЕНЬ ПРОЙДЕНО", "LEVEL CLEAR") : "GAME OVER", W / 2, Hh / 2);
      g.font = "12px monospace"; g.fillStyle = "#e8e8f0"; g.fillText(`★ ${stars}`, W / 2, Hh / 2 + 20);
      if (lives > 0) { note(523, 0.12, "square", 0.03); note(659, 0.12, "square", 0.03, 0.12); note(784, 0.2, "square", 0.03, 0.24); }
      await wait(1200);
      close();
      const s = Math.min(1, (T / DUR) * (0.45 + 0.55 * lives / 3) + stars * 0.04);
      resolve(lives === 3 && stars >= 4 ? 1.25 : s);
    };
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      T += dt;
      inv = Math.max(0, inv - dt);
      x = Math.max(8, Math.min(W - 8, x + dir * 150 * dt));
      spawn -= dt;
      const rate = 0.55 - Math.min(0.32, T * 0.02) - ctx.despair * 0.08;
      if (spawn <= 0) { spawn = rate; const star = Math.random() < 0.18; rocks.push({ x: 8 + Math.random() * (W - 16), y: -8, v: 60 + T * 5 + Math.random() * 40, r: 4 + Math.random() * 5, star }); }
      for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        r.y += r.v * dt;
        if (r.y > Hh + 10) { rocks.splice(i, 1); continue; }
        if (Math.abs(r.x - x) < r.r + 6 && Math.abs(r.y - (Hh - 14)) < r.r + 5) {
          rocks.splice(i, 1);
          if (r.star) { stars++; note(1046, 0.08, "square", 0.03); note(1318, 0.1, "square", 0.03, 0.06); }
          else if (inv <= 0) { lives--; inv = 1.2; note(110, 0.3, "square", 0.05, 0); buzz(H.miss, true); }
        }
      }
      livesEl.textContent = "♥".repeat(Math.max(0, lives)) + "♡".repeat(3 - Math.max(0, lives));
      scoreEl.textContent = `★ ${stars}`;
      draw();
      if (!over && (lives <= 0 || T >= DUR)) { void end(); return; }
      raf = requestAnimationFrame(loop);
    };
    note(392, 0.1, "square", 0.03); note(523, 0.15, "square", 0.03, 0.1);
    raf = requestAnimationFrame(loop);
  });
}

// ================================================================ shower

export function showerGame(ctx: MiniCtx): Promise<number> {
  return new Promise((resolve) => {
    const { body, close } = open("shower", tr("ДУШ", "SHOWER"), tr("Гаряча вода в будинку гуляє. Тримай терпимо.", "The building's hot water swings. Keep it bearable."));
    body.innerHTML = `
      <div class="sh">
        <div class="sh-stage"><div class="sh-head"></div><div class="sh-drops"></div><div class="sh-steam"></div><p class="sh-say"></p></div>
        <div class="sh-gauge"><div class="sh-band"></div><div class="sh-fill"></div><span class="sh-t">38°</span></div>
        <div class="sh-taps"><button data-d="-1" class="cold">❄ ${tr("ХОЛОДНІШЕ", "COLDER")}</button><button data-d="1" class="hot">🔥 ${tr("ГАРЯЧІШЕ", "HOTTER")}</button></div>
      </div>`;
    const drops = el(body, ".sh-drops");
    for (let i = 0; i < 22; i++) { const d = document.createElement("i"); d.style.left = `${10 + Math.random() * 80}%`; d.style.animationDelay = `${-Math.random()}s`; d.style.animationDuration = `${0.45 + Math.random() * 0.3}s`; drops.appendChild(d); }
    const fill = el(body, ".sh-fill"), tEl = el(body, ".sh-t"), say = el(body, ".sh-say"), steam = el(body, ".sh-steam");
    const MIN = 15, MAX = 65, LO = 36, HI = 41;
    const band = el(body, ".sh-band");
    band.style.bottom = `${((LO - MIN) / (MAX - MIN)) * 100}%`;
    band.style.height = `${((HI - LO) / (MAX - MIN)) * 100}%`;
    let temp = 30, drift = 0, valve = 0, T = 0, inZone = 0, last = performance.now(), raf = 0, event = 2.5;
    const DUR = 10;
    body.querySelectorAll<HTMLButtonElement>(".sh-taps button").forEach((b) => {
      b.onpointerdown = (e) => { e.preventDefault(); valve += Number(b.dataset.d) * 2.6; b.classList.remove("tap"); void b.offsetWidth; b.classList.add("tap"); A.play("click"); };
    });
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      T += dt;
      event -= dt;
      // somebody upstairs opens a tap: the water jumps
      if (event <= 0) {
        event = 1.6 + Math.random() * 2;
        const up = Math.random() < 0.5;
        drift += (up ? 1 : -1) * (6 + Math.random() * 6 + ctx.despair * 4);
        say.textContent = up ? tr("Окріп!", "Scalding!") : tr("Крижана!", "Ice cold!");
        say.classList.remove("pop"); void say.offsetWidth; say.classList.add("pop");
        A.play("splash");
      }
      drift *= Math.pow(0.55, dt);
      temp += (38 + valve + drift - temp) * Math.min(1, dt * 2.2) + Math.sin(T * 11) * 0.05 * (1 + ctx.shake * 4);
      temp = Math.max(MIN, Math.min(MAX, temp));
      const ok = temp >= LO && temp <= HI;
      if (ok) inZone += dt;
      fill.style.height = `${((temp - MIN) / (MAX - MIN)) * 100}%`;
      fill.style.background = temp > HI ? "#d8502e" : temp < LO ? "#4a8ad8" : "#6ac46a";
      tEl.textContent = `${Math.round(temp)}°`;
      steam.style.opacity = String(Math.max(0, Math.min(0.9, (temp - 34) / 20)));
      if (ok && !say.classList.contains("pop")) say.textContent = tr("Добре…", "Nice…");
      if (T >= DUR) {
        cancelAnimationFrame(raf);
        const s = inZone / DUR;
        say.textContent = s > 0.75 ? tr("Нарешті тепло.", "Finally warm.") : s > 0.4 ? tr("Терпимо.", "Bearable.") : tr("То окріп, то крига.", "Scalding, then ice.");
        void wait(900).then(() => { close(); resolve(s > 0.85 ? 1.25 : Math.min(1, s * 1.15)); });
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  });
}

// ================================================================ music and the guitar: tap along

const MIDI = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export function rhythmGame(ctx: MiniCtx, kind: "music" | "guitar"): Promise<number> {
  return new Promise((resolve) => {
    const guitar = kind === "guitar";
    const { body, close } = open("rhythm", guitar ? tr("ГІТАРА", "GUITAR") : tr("НАВУШНИКИ", "HEADPHONES"), guitar ? tr("Бий акорд, коли нота на лінії", "Strum the chord when the note hits the line") : tr("Відстукуй ритм — і думки затихнуть", "Tap the beat — and the thoughts go quiet"));
    const lanes = guitar ? ["Am", "C", "G"] : ["●", "◆", "▲"];
    const chords = [[57, 60, 64], [60, 64, 67], [55, 59, 62]];
    const melody = [69, 72, 76];
    body.innerHTML = `
      <div class="rh ${guitar ? "rh-g" : "rh-m"}">
        <div class="rh-field">${lanes.map((_, i) => `<div class="rh-lane" data-l="${i}"></div>`).join("")}<div class="rh-line"></div><p class="rh-say"></p></div>
        <div class="rh-meta"><span class="rh-combo"></span><span class="rh-acc">0%</span></div>
        <div class="rh-pads">${lanes.map((l, i) => `<button data-l="${i}">${l}</button>`).join("")}</div>
      </div>`;
    const field = el(body, ".rh-field");
    const laneEls = [...body.querySelectorAll<HTMLElement>(".rh-lane")];
    const say = el(body, ".rh-say"), comboEl = el(body, ".rh-combo"), accEl = el(body, ".rh-acc");
    const beat = 0.5 + ctx.despair * 0.04;
    const fall = 1.6;
    // a song: 24 notes on the beat, sometimes on the off-beat, never two at once
    const pattern: Array<{ t: number; l: number; el?: HTMLElement; done?: boolean }> = [];
    let tt = 1.4;
    let prev = 1;
    for (let i = 0; i < 24; i++) {
      let l = Math.floor(Math.random() * 3);
      if (l === prev && Math.random() < 0.5) l = (l + 1) % 3;
      prev = l;
      pattern.push({ t: tt, l });
      tt += beat * (Math.random() < 0.25 ? 0.5 : 1) * (i % 8 === 7 ? 2 : 1);
    }
    const END = tt + 0.8;
    let T = 0, last = performance.now(), raf = 0, hits = 0, perfect = 0, combo = 0, judged = 0;
    const flash = (txt: string, cls: string) => { say.textContent = txt; say.className = `rh-say ${cls}`; void say.offsetWidth; say.classList.add("pop"); };
    const play = (l: number, good: boolean) => {
      if (guitar) chords[l].forEach((n, i) => note(MIDI(n), 0.5, "triangle", good ? 0.035 : 0.015, i * 0.018));
      else { note(MIDI(melody[l]), 0.22, "triangle", good ? 0.05 : 0.02); if (l === 0) A.tone(90, 0, 0.18, "sine", 0.08, 45); }
    };
    // a soft bass on the beat, so you hear it as well as see it
    let nextBeat = 1.4;
    const press = (l: number) => {
      const pad = body.querySelectorAll<HTMLElement>(".rh-pads button")[l];
      pad.classList.remove("tap"); void pad.offsetWidth; pad.classList.add("tap");
      let best: (typeof pattern)[number] | null = null;
      let bd = 9;
      for (const n of pattern) if (!n.done && n.l === l) { const d = Math.abs(n.t - T); if (d < bd) { bd = d; best = n; } }
      if (best && bd < 0.24) {
        best.done = true;
        judged++;
        hits++;
        combo++;
        if (bd < 0.1) { perfect++; flash(tr("ідеально", "perfect"), "p"); } else flash(tr("добре", "good"), "g");
        best.el?.classList.add("hit");
        play(l, true);
        buzz(H.tap, true);
      } else {
        combo = 0;
        flash(tr("мимо", "miss"), "m");
        play(l, false);
      }
    };
    body.querySelectorAll<HTMLButtonElement>(".rh-pads button").forEach((b) => { b.onpointerdown = (e) => { e.preventDefault(); press(Number(b.dataset.l)); }; });
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      T += dt;
      if (T >= nextBeat && T < END - 0.5) { nextBeat += beat; A.tone(guitar ? 82 : 55, 0, 0.16, "sine", 0.05, guitar ? 70 : 40); }
      const H0 = field.clientHeight;
      const lineY = H0 * 0.82;
      for (const n of pattern) {
        const y = lineY - ((n.t - T) / fall) * lineY;
        if (!n.el && n.t - T < fall) { n.el = document.createElement("i"); n.el.className = "rh-note"; laneEls[n.l].appendChild(n.el); }
        if (n.el) n.el.style.transform = `translateY(${y}px)`;
        if (!n.done && T - n.t > 0.24) { n.done = true; judged++; combo = 0; n.el?.classList.add("gone"); flash(tr("мимо", "miss"), "m"); }
      }
      comboEl.textContent = combo >= 3 ? `×${combo}` : "";
      accEl.textContent = `${judged ? Math.round((hits / judged) * 100) : 0}%`;
      if (T >= END) {
        cancelAnimationFrame(raf);
        const s = hits / pattern.length;
        flash(s > 0.85 ? tr("Музика заглушила думки", "The music drowned the thoughts") : s > 0.5 ? tr("Трохи відпустило", "It let go a little") : tr("Ритм не тримається", "Can't keep the beat"), s > 0.5 ? "g" : "m");
        void wait(1000).then(() => { close(); resolve(s > 0.9 && perfect > pattern.length * 0.5 ? 1.25 : s); });
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  });
}
