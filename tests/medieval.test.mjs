import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  MEDIEVAL_BOSSES, MEDIEVAL_DIFFICULTIES, MEDIEVAL_ENEMIES, MEDIEVAL_LEVELS, MEDIEVAL_RUN, MEDIEVAL_SKINS, MEDIEVAL_TYPE_SKINS, MEDIEVAL_VISUALS,
} from "../src/playcanvas/gameplay/medievalConfig.ts";

const pub = (url) => new URL(`../public/${url}`, import.meta.url);

test("medieval: seven levels in seven zones, two of them boss fights", () => {
  assert.equal(MEDIEVAL_LEVELS.length, 7);
  const zones = MEDIEVAL_LEVELS.map((l) => l.zone);
  assert.deepEqual(zones, ["village", "graveyard", "abbey", "bridge", "bailey", "hall", "throne"]);
  assert.deepEqual(MEDIEVAL_LEVELS.map((l) => l.boss?.type ?? null), [null, null, "abbot", null, null, null, "fallenKing"]);
  assert.equal(MEDIEVAL_RUN.finalLevel, 6);
});

test("medieval: every wave, boss and summon names a known enemy; bosses have scripts", () => {
  for (const level of MEDIEVAL_LEVELS) {
    for (const phase of level.phases) for (const id of Object.keys(phase.weights)) assert.ok(MEDIEVAL_ENEMIES[id], `${level.label}: ${id}`);
    if (level.boss) {
      const boss = MEDIEVAL_ENEMIES[level.boss.type];
      assert.ok(boss?.boss && boss.script, level.boss.type);
      const phases = MEDIEVAL_BOSSES[boss.script];
      assert.ok(phases?.length, boss.script);
      for (const p of phases) for (const a of p.attacks) if (a.kind === "summon") for (const e of a.enemies) assert.ok(MEDIEVAL_ENEMIES[e.type], `${boss.script} summons ${e.type}`);
    }
  }
});

test("medieval: every look's model, weapons and skins exist", () => {
  for (const [id, v] of Object.entries(MEDIEVAL_VISUALS)) {
    assert.ok(fs.existsSync(pub(v.url)), `${id}: ${v.url}`);
    for (const a of v.attachments ?? []) if (a.url) assert.ok(fs.existsSync(pub(a.url)), `${id}: ${a.url}`);
    for (const s of v.skins ?? []) assert.ok(MEDIEVAL_SKINS[s], `${id}: skin ${s}`);
  }
  for (const [id, url] of Object.entries(MEDIEVAL_SKINS)) assert.ok(fs.existsSync(pub(url)), `${id}: ${url}`);
  for (const [type, skins] of Object.entries(MEDIEVAL_TYPE_SKINS)) for (const s of skins) assert.ok(MEDIEVAL_SKINS[s], `${type}: ${s}`);
  for (const e of Object.values(MEDIEVAL_ENEMIES)) for (const v of e.visuals) assert.ok(MEDIEVAL_VISUALS[v], `${e.label}: ${v}`);
  assert.ok(fs.existsSync(pub("models/medieval/medieval-kit.glb")));
  assert.ok(fs.existsSync(pub("menu/medieval.webp")));
});

test("medieval: difficulties cover every level and ramp up", () => {
  for (const d of Object.values(MEDIEVAL_DIFFICULTIES)) if (d.levels) assert.ok(d.levels.length <= MEDIEVAL_LEVELS.length);
  assert.equal(MEDIEVAL_DIFFICULTIES.nightmare.scale.hp.length, 7);
  for (let i = 1; i < MEDIEVAL_LEVELS.length - 1; i++) assert.ok(MEDIEVAL_LEVELS[i].hpScale >= MEDIEVAL_LEVELS[i - 1].hpScale);
});
