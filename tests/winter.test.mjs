import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// Whiteout (chapter VI): campaign data, its enemies and the kit.
const { outputFiles } = buildSync({
  stdin: {
    contents: `
      export * from "./gameplay/winterConfig.ts";
      export { ENEMIES, ENEMY_VISUALS } from "./gameplay/config.ts";
      export { BOSS_SCRIPTS } from "./gameplay/campaigns.ts";
      export { WINTER_MODELS } from "./world/props/WinterKit.ts";
      export { DAILY_CHAPTERS } from "./gameplay/daily.ts";
      export { QUESTS } from "./gameplay/profile.ts";
    `,
    resolveDir: new URL("../src/playcanvas/", import.meta.url).pathname,
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", write: false, external: ["playcanvas"],
});
const bundle = join(mkdtempSync(join(tmpdir(), "winter-")), "winter.mjs");
writeFileSync(bundle, outputFiles[0].text);
const m = await import(pathToFileURL(bundle).href);
const pub = (url) => new URL(`../public/${url}`, import.meta.url);

test("whiteout: four levels in four zones, a barn boss and the Ravager", () => {
  assert.deepEqual(m.WINTER_LEVELS.map((l) => l.zone), ["forest", "farm", "suburb", "town"]);
  assert.deepEqual(m.WINTER_LEVELS.map((l) => l.boss?.type ?? null), [null, "charger", null, "ravager"]);
  assert.equal(m.WINTER_RUN.finalLevel, 3);
  for (let i = 1; i < m.WINTER_LEVELS.length; i++) assert.ok(m.WINTER_LEVELS[i].hpScale >= m.WINTER_LEVELS[i - 1].hpScale);
  assert.equal(m.WINTER_DIFFICULTIES.nightmare.scale.hp.length, m.WINTER_LEVELS.length);
});

test("whiteout: every wave, boss and summon names a known enemy; looks exist", () => {
  for (const level of m.WINTER_LEVELS) {
    for (const phase of level.phases) for (const id of Object.keys(phase.weights)) assert.ok(m.ENEMIES[id], `${level.label}: ${id}`);
    if (level.boss) assert.ok(m.ENEMIES[level.boss.type]?.boss, level.boss.type);
  }
  const ravager = m.ENEMIES.ravager;
  assert.ok(m.BOSS_SCRIPTS[ravager.script]?.length === 3);
  for (const p of m.BOSS_SCRIPTS.ravager) for (const a of p.attacks) if (a.kind === "summon") for (const e of a.enemies) assert.ok(m.ENEMIES[e.type], e.type);
  for (const id of Object.keys(m.WINTER_ENEMIES)) for (const v of m.ENEMIES[id].visuals) {
    const look = m.ENEMY_VISUALS[v];
    assert.ok(look && fs.existsSync(pub(look.url)), `${id}: ${v}`);
  }
});

test("whiteout: every kit model is a node in the kit GLB; menu art; daily and quest", () => {
  const glb = fs.readFileSync(pub("models/winter/winter-kit.glb"));
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  const names = new Set(json.nodes.map((n) => n.name));
  for (const id of Object.keys(m.WINTER_MODELS)) assert.ok(names.has(id), id);
  assert.ok(fs.existsSync(pub("menu/winter.webp")));
  assert.ok(m.DAILY_CHAPTERS.includes("winter"));
  assert.ok(m.QUESTS.some((q) => q.id === "winWinter"));
});
