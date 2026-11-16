// Builds VRM avatars with the VRM Avatar Maker (github.com/ffunch/vrm-avatar-maker, MIT code, CC0 assets),
// served locally and driven headless:  node scripts/export-avatars.mjs <maker web/ dir> scripts/hero-recipes.json <out dir>
import fs from "node:fs"; import http from "node:http"; import path from "node:path";
import { createRequire } from "node:module"; const require = createRequire(import.meta.url);
const pw = require("playwright");
const [webRoot, recipesFile, outDir] = process.argv.slice(2);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".gz": "application/gzip", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
const srv = http.createServer((q, s) => { const u = decodeURIComponent(new URL(q.url, "http://x").pathname); let f = path.join(webRoot, u); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html"); if (!fs.existsSync(f)) { s.writeHead(404); s.end(); return; } s.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream" }); fs.createReadStream(f).pipe(s); });
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const b = await pw.chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 900, height: 900 } });
p.on("pageerror", (e) => console.log("pageerror", e.message)); p.on("console", (m) => { if (m.type() === "error") console.log("console", m.text()); });
p.on("requestfailed", (r) => console.log("failed", r.url()));
await p.goto(`http://127.0.0.1:${srv.address().port}/editor/`);
await p.waitForFunction(() => window.avatarEditor, null, { timeout: 120000 });
const recipes = JSON.parse(fs.readFileSync(recipesFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
for (const [name, recipe] of Object.entries(recipes)) {
  const b64 = await p.evaluate(async (r) => {
    await window.avatarEditor.applyRecipe(r);
    await new Promise((res) => setTimeout(res, 1500));
    const buf = new Uint8Array(await window.avatarEditor.exportVRM());
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, recipe);
  fs.writeFileSync(path.join(outDir, `${name}.vrm`), Buffer.from(b64, "base64"));
  await p.screenshot({ path: path.join(outDir, `${name}_editor.png`) });
  console.log(name, (Buffer.from(b64, "base64").length / 1e6).toFixed(2), "MB");
}
await b.close(); srv.close();
