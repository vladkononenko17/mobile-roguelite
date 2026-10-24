// Tuning helper: how fast does the washer finish the patch left by preclean()?
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { lib } from "./shots.mjs";
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], headless: true, protocolTimeout: 3600000 });
for (const box of [[-1.2, 0.3, 1.0, 2.07], [-1.15, 0.25, 1.02, 2.05], [-1.25, 0.3, 1.0, 2.1]]) {
const pg = await b.newPage();
await pg.setViewport({ width: 720, height: 1280 });
await pg.evaluateOnNewDocument(() => localStorage.clear());
await pg.goto("http://localhost:5173/mobile-roguelite/hata/?still=1&dpr=1&q=medium", { waitUntil: "load" });
await pg.waitForFunction("window.__hata && window.__hata.ready", { timeout: 600000, polling: 1000 });
await pg.evaluate(() => { window.__hata.play(); window.__hata.simulate(0.2, false); });
await pg.evaluate(lib);
  const r = await pg.evaluate((bx) => {
    const s = window.__hata.W.surfaces.find((q) => q.key === "facade:front");
    tr.preclean("facade:front", [bx[0], bx[1], bx[2], bx[3], 4.5, 6]);
    window.__hata.setTool("washer");
    window.__hata.teleport(-0.45, 7.05, 0, 0);
    window.__hata.simulate(0.1, false);
    const out = [s.share().toFixed(4)];
    const n = 39;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      tr.sprayFor(1.6 / 30, (k) => { const t = t0 + (t1 - t0) * k; const rows = 4, rr = Math.min(rows - 1, Math.floor(t * rows)), u = (t * rows) % 1; const side = rr % 2 === 0 ? u : 1 - u; return [(side - 0.5) * 0.6, 0.05 - rr * 0.09]; }, i < n - 8);
      if (s.done) { out.push("done@" + i); break; }
      if (i % 6 === 0) out.push(i + ":" + s.share().toFixed(4));
    }
    return out.join(" ");
  }, box);
  console.log(box.join(","), "→", r);
  await pg.close();
}
await b.close();
