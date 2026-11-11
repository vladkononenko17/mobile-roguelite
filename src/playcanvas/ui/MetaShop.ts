import { audio } from "../audio/Audio";
import { buyMeta, loadMeta, META, metaPrice, metaRank } from "../gameplay/meta";

const CSS = `
#meta { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(8, 6, 4, 0.86);
  font: 500 13px/1.35 system-ui, sans-serif; color: #ece3cf; }
#meta .sheet { width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow-y: auto; box-sizing: border-box;
  padding: 18px 16px 14px; background: #17120e; border: 1px solid rgba(236, 227, 207, 0.18); border-radius: 12px; }
#meta h2 { margin: 0; font: 800 28px/1 "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.12em; }
#meta .bal { margin: 6px 0 12px; font: 800 20px "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.06em; color: #8fd8ff; }
#meta .bal small { font: 500 12px system-ui, sans-serif; color: #ece3cf; opacity: 0.6; letter-spacing: 0; margin-left: 6px; }
#meta .list { display: grid; gap: 8px; }
#meta .row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(236, 227, 207, 0.12); }
#meta .row b { font: 800 17px "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.04em; }
#meta .row small { display: block; opacity: 0.75; }
#meta .pips { display: flex; gap: 4px; margin-top: 5px; }
#meta .pips i { width: 14px; height: 5px; border-radius: 2px; background: rgba(236, 227, 207, 0.18); }
#meta .pips i.on { background: #8fd8ff; }
#meta .row button { min-width: 84px; height: 40px; border: 0; border-radius: 8px; background: #8fd8ff; color: #0e1418;
  font: 800 16px "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.06em; }
#meta .row button:disabled { background: rgba(236, 227, 207, 0.12); color: rgba(236, 227, 207, 0.5); }
#meta .close { margin-top: 14px; width: 100%; height: 44px; border: 0; border-radius: 10px; background: #d6a23c; color: #140f0b;
  font: 800 18px/1 "Barlow Condensed", system-ui, sans-serif; letter-spacing: 0.2em; }
`;

/** The permanent upgrades screen (title screen): Dust balance, every upgrade with its ranks and price. */
export function showMetaShop(onClose: () => void = () => {}): void {
  if (document.getElementById("meta")) return;
  if (!document.getElementById("meta-css")) {
    const style = document.createElement("style");
    style.id = "meta-css";
    style.textContent = CSS;
    document.head.append(style);
  }
  const root = document.createElement("div");
  root.id = "meta";
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  root.append(sheet);
  const render = () => {
    const m = loadMeta();
    sheet.innerHTML = `<h2>UPGRADES</h2><div class="bal">◆ ${m.dust} DUST<small>earned in every run, won or lost · ${m.total} all time</small></div><div class="list"></div><button type="button" class="close">CLOSE</button>`;
    const list = sheet.querySelector(".list")!;
    for (const def of META) {
      const rank = metaRank(m, def.id), price = metaPrice(m, def);
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<div><b></b><small></small><div class="pips">${Array.from({ length: def.ranks }, (_, i) => `<i class="${i < rank ? "on" : ""}"></i>`).join("")}</div></div><button type="button"></button>`;
      row.querySelector("b")!.textContent = def.name;
      row.querySelector("small")!.textContent = def.text;
      const b = row.querySelector("button")!;
      b.textContent = price === null ? "MAX" : `◆ ${price}`;
      b.disabled = price === null || m.dust < price;
      b.addEventListener("click", () => {
        if (buyMeta(def.id)) {
          audio.play("upgrade");
          render();
        }
      });
      list.append(row);
    }
    sheet.querySelector(".close")!.addEventListener("click", done);
  };
  const done = () => {
    window.removeEventListener("keydown", onKey, true);
    root.remove();
    onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") done();
  };
  root.addEventListener("click", (e) => {
    if (e.target === root) done();
  });
  window.addEventListener("keydown", onKey, true);
  render();
  document.body.append(root);
}
