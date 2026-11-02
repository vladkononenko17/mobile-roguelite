import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  PIRATE_BOSSES, PIRATE_DIFFICULTIES, PIRATE_ENEMIES, PIRATE_LEVELS, PIRATE_RUN, PIRATE_SKINS, PIRATE_TYPE_SKINS, PIRATE_VISUALS,
} from "../src/playcanvas/gameplay/pirateConfig.ts";

const pub = (url) => new URL(`../public/${url}`, import.meta.url);
const ZONES = ["grotto", "cove", "shore", "pier", "deck", "hold", "shallows", "fort", "skull", "flagship"];

test("black tide: ten levels in ten zones, three of them boss fights", () => {
  assert.equal(PIRATE_LEVELS.length, 10);
  assert.deepEqual(PIRATE_LEVELS.map((l) => l.zone), ZONES);
  assert.deepEqual(PIRATE_LEVELS.map((l) => l.boss?.type ?? null), [null, null, "bosun", null, null, null, null, null, "seaHag", "captain"]);
  assert.equal(PIRATE_RUN.finalLevel, 9);
});

test("black tide: every wave, boss and summon names a known enemy; bosses have scripts", () => {
  for (const level of PIRATE_LEVELS) {
    for (const phase of level.phases) for (const id of Object.keys(phase.weights)) assert.ok(PIRATE_ENEMIES[id], `${level.label}: ${id}`);
    if (level.boss) {
      const boss = PIRATE_ENEMIES[level.boss.type];
      assert.ok(boss?.boss && boss.script, level.boss.type);
      const phases = PIRATE_BOSSES[boss.script];
      assert.ok(phases?.length, boss.script);
      for (const p of phases) for (const a of p.attacks) if (a.kind === "summon") for (const e of a.enemies) assert.ok(PIRATE_ENEMIES[e.type], `${boss.script} summons ${e.type}`);
    }
  }
});

test("black tide: the captain's last phase brings the kraken", () => {
  const last = PIRATE_BOSSES.captain.at(-1);
  assert.equal(last.enter.arena, 1);
  assert.ok(last.attacks.some((a) => a.kind === "tentacle" && a.count > 0 && a.telegraph >= 1));
});

test("black tide: every look's model, gear and skins exist", () => {
  for (const [id, v] of Object.entries(PIRATE_VISUALS)) {
    assert.ok(fs.existsSync(pub(v.url)), `${id}: ${v.url}`);
    for (const a of v.attachments ?? []) if (a.url) assert.ok(fs.existsSync(pub(a.url)), `${id}: ${a.url}`);
    for (const s of v.skins ?? []) assert.ok(PIRATE_SKINS[s], `${id}: skin ${s}`);
  }
  for (const [id, url] of Object.entries(PIRATE_SKINS)) assert.ok(fs.existsSync(pub(url)), `${id}: ${url}`);
  for (const [type, skins] of Object.entries(PIRATE_TYPE_SKINS)) for (const s of skins) assert.ok(PIRATE_SKINS[s], `${type}: ${s}`);
  for (const e of Object.values(PIRATE_ENEMIES)) for (const v of e.visuals) assert.ok(PIRATE_VISUALS[v] || v.startsWith("zombie"), `${e.label}: ${v}`);
  for (const f of ["models/pirate/pirate-kit.glb", "models/pirate/water.webp", "menu/pirate.webp"]) assert.ok(fs.existsSync(pub(f)), f);
});

test("black tide: difficulties cover every level and ramp up", () => {
  for (const d of Object.values(PIRATE_DIFFICULTIES)) if (d.levels) assert.ok(d.levels.length <= PIRATE_LEVELS.length);
  assert.equal(PIRATE_DIFFICULTIES.nightmare.scale.hp.length, 10);
  for (let i = 1; i < PIRATE_LEVELS.length - 1; i++) assert.ok(PIRATE_LEVELS[i].hpScale >= PIRATE_LEVELS[i - 1].hpScale);
});
