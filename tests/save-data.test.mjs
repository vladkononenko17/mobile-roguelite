import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// The save code (settings: "Move your save"): what goes out comes back in, and junk changes nothing.
const { outputFiles } = buildSync({
  entryPoints: [new URL("../src/playcanvas/saveData.ts", import.meta.url).pathname],
  bundle: true, format: "esm", platform: "node", write: false,
});
const bundle = join(mkdtempSync(join(tmpdir(), "save-")), "save.mjs");
writeFileSync(bundle, outputFiles[0].text);
const { exportSave, importSave } = await import(pathToFileURL(bundle).href);

const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), map: m };
};
const CHAPTERS = ["outpost", "winter"];

test("save code: round trip of the profile, Dust, settings and chapter progress", () => {
  const from = store({
    "dustline.profile": JSON.stringify({ hero: "medic", quests: ["firstBlood"], note: "ünïcödé ◆" }),
    "dustline.meta": JSON.stringify({ dust: 42 }),
    "dustline.settings": JSON.stringify({ music: 0.5 }),
    "outpost.best": "3", "winter.difficulty": "nightmare",
    "someone.elses": "secret",
  });
  const code = exportSave(CHAPTERS, from);
  assert.match(code, /^DL1\.[A-Za-z0-9+/=]+$/);
  const to = store({ "dustline.meta": JSON.stringify({ dust: 1 }) });
  assert.equal(importSave(`  ${code.slice(0, 20)}\n${code.slice(20)}  `, CHAPTERS, to), true);
  for (const k of ["dustline.profile", "dustline.meta", "dustline.settings", "outpost.best", "winter.difficulty"]) assert.equal(to.getItem(k), from.getItem(k), k);
  assert.equal(to.getItem("someone.elses"), null);
});

test("save code: junk, a foreign key set or a code without a profile changes nothing", () => {
  const to = store({ "dustline.profile": "{}" });
  for (const bad of ["", "hello", "DL1.", "DL1.%%%", `DL1.${btoa("[1,2]")}`, `DL1.${btoa(JSON.stringify({ "outpost.best": "9" }))}`, `DL1.${btoa(JSON.stringify({ "dustline.profile": "not json" }))}`]) {
    assert.equal(importSave(bad, CHAPTERS, to), false, bad);
  }
  assert.deepEqual([...to.map], [["dustline.profile", "{}"]]);
  // Unknown keys in a real code are dropped.
  const code = `DL1.${btoa(JSON.stringify({ "dustline.profile": "{}", "evil.key": "x", "dustline.meta": 5 }))}`;
  assert.equal(importSave(code, CHAPTERS, to), true);
  assert.equal(to.getItem("evil.key"), null);
  assert.equal(to.getItem("dustline.meta"), null);
});
