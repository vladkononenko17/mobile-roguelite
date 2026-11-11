import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// Heroes, danger, routes, evolutions, gadgets, quests and the daily seed: data and pure logic.
const { outputFiles } = buildSync({
  stdin: {
    contents: `
      export { PlayerStats } from "./gameplay/PlayerStats.ts";
      export { applyUpgrade } from "./gameplay/Upgrades.ts";
      export { HEROES, heroDef } from "./gameplay/heroes.ts";
      export { DANGER_MAX, DANGER_RULES, dangerMods } from "./gameplay/danger.ts";
      export { ROUTES, rollRoutes } from "./gameplay/routes.ts";
      export { EVOLUTIONS } from "./gameplay/evolutions.ts";
      export { GADGETS, GADGET_MAX_LEVEL, gadgetStats, gadgetPrice } from "./gameplay/gadgets.ts";
      export { QUESTS, checkQuests, resetProfile, profile, bump, best, recordWin, dangerUnlocked, chooseDanger, chosenDanger, heroUnlocked } from "./gameplay/profile.ts";
      export { dailySetup, dailyScore, seeded, hash, todayKey } from "./gameplay/daily.ts";
      export { UPGRADES, WEAPON_STATS } from "./gameplay/config.ts";
    `,
    resolveDir: new URL("../src/playcanvas/", import.meta.url).pathname,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  external: ["playcanvas"],
});
const bundle = join(mkdtempSync(join(tmpdir(), "roguelite-")), "roguelite.mjs");
writeFileSync(bundle, outputFiles[0].text);
const m = await import(pathToFileURL(bundle).href);

test("four heroes, the Survivor and the Drifter free", () => {
  assert.equal(m.HEROES.length, 4);
  assert.deepEqual(m.HEROES.filter((h) => h.free).map((h) => h.id), ["survivor", "drifter"]);
  assert.equal(m.HEROES[0].id, "survivor");
});

test("every hero applies cleanly, keeps the hero alive and has a real trade-off", () => {
  for (const h of m.HEROES) {
    const s = new m.PlayerStats();
    h.apply(s);
    assert.ok(s.maxHp > 0 && s.hp === s.maxHp, `${h.id} HP`);
    assert.ok(h.perk && h.drawback, `${h.id} text`);
  }
  assert.equal(m.heroDef("nope").id, "survivor");
  const t = new m.PlayerStats();
  m.heroDef("demolitionist").apply(t);
  assert.equal(t.gadgetSlots, 3);
});

test("every locked hero and gadget has a quest that unlocks it", () => {
  const rewards = m.QUESTS.map((q) => q.reward);
  for (const h of m.HEROES.filter((x) => !x.free)) assert.ok(rewards.some((r) => r.hero === h.id), h.id);
  for (const g of m.GADGETS.filter((x) => x.locked)) assert.ok(rewards.some((r) => r.gadget === g.id), g.id);
});

test("quests pay once, unlock heroes and respect their goals", () => {
  m.resetProfile();
  assert.equal(m.heroUnlocked("demolitionist"), false);
  m.bump("kills", 999);
  assert.deepEqual(m.checkQuests().map((q) => q.id), ["kills100"]);
  m.bump("kills", 1);
  assert.deepEqual(m.checkQuests().map((q) => q.id), ["kills1000"]);
  assert.equal(m.heroUnlocked("demolitionist"), true);
  assert.deepEqual(m.checkQuests(), []);
  assert.equal(m.heroUnlocked("drifter"), true);
  m.best("maxMk", 4);
  m.best("maxMk", 2);
  assert.equal(m.profile().tally.maxMk, 4);
});

test("danger: each level adds a rule; winning unlocks the next level for that chapter only", () => {
  assert.equal(m.DANGER_RULES.length, m.DANGER_MAX);
  let prev = m.dangerMods(0);
  assert.equal(prev.dust, 1);
  for (let n = 1; n <= m.DANGER_MAX; n++) {
    const cur = m.dangerMods(n);
    const harder = Object.keys(cur).filter((k) => k !== "dust" && cur[k] !== prev[k]);
    assert.equal(harder.length >= 1, true, `danger ${n} changes something`);
    assert.ok(cur.dust > prev.dust);
    prev = cur;
  }
  m.resetProfile();
  assert.equal(m.dangerUnlocked("outpost"), 0);
  m.recordWin("outpost", 0);
  assert.equal(m.dangerUnlocked("outpost"), 1);
  assert.equal(m.dangerUnlocked("hell"), 0);
  m.chooseDanger("outpost", 5);
  assert.equal(m.chosenDanger("outpost"), 1);
});

test("routes roll distinct doors and each changes something", () => {
  const r = m.rollRoutes(3, m.seeded(7));
  assert.equal(new Set(r.map((x) => x.id)).size, 3);
  for (const route of m.ROUTES) assert.ok(Object.keys(route).length > 5, route.id);
});

test("an evolution needs a level-up upgrade and makes its gun stronger", () => {
  const levelUp = new Set(m.UPGRADES.filter((u) => !u.pools || u.pools.includes("levelUp")).map((u) => u.id));
  for (const [id, evo] of Object.entries(m.EVOLUTIONS)) {
    assert.ok(m.WEAPON_STATS[id], id);
    assert.ok(levelUp.has(evo.needs), `${id} needs ${evo.needs}, offered on level-ups`);
    const s = new m.PlayerStats();
    const before = s.weaponStatsFor(id);
    s.evolved.add(id);
    const after = s.weaponStatsFor(id);
    const dps = (w) => w.damage * w.pellets * w.fireRate * (1 + (w.fx?.splash?.fraction ?? 0)) + (w.fx?.burn ?? 0) + w.penetration * 3;
    assert.ok(dps(after) > dps(before), `${id} evolves stronger`);
  }
  for (const id of Object.keys(m.WEAPON_STATS)) assert.ok(m.EVOLUTIONS[id], `${id} has an evolution`);
});

test("gadgets grow with level and their price climbs", () => {
  for (const g of m.GADGETS) {
    const a = m.gadgetStats(g.id, 1), b = m.gadgetStats(g.id, m.GADGET_MAX_LEVEL);
    const power = (x) => (x.damage ?? x.burn) * (x.targets ?? x.blades ?? x.count ?? 1) / (x.every ?? 1);
    assert.ok(power(b) > power(a) * 1.8, g.id);
  }
  for (let l = 1; l < m.GADGET_MAX_LEVEL; l++) assert.ok(m.gadgetPrice(l) > m.gadgetPrice(l - 1) || l === 1);
});

test("dash upgrades change the dash stats", () => {
  const s = new m.PlayerStats();
  m.applyUpgrade(s, "blink");
  m.applyUpgrade(s, "quickStep");
  m.applyUpgrade(s, "afterburn");
  assert.equal(s.dashCharges, 2);
  assert.ok(s.dashCooldownMult < 1);
  assert.ok(s.dashBlast > 0);
});

test("the daily run is the same for everyone on a date and differs between dates", () => {
  const a = m.dailySetup("2026-11-09"), b = m.dailySetup("2026-11-09"), c = m.dailySetup("2026-11-10");
  assert.deepEqual(a, b);
  assert.notEqual(a.seed, c.seed);
  assert.ok(a.danger >= 1 && a.danger <= 4);
  const r1 = m.seeded(a.seed), r2 = m.seeded(a.seed);
  for (let i = 0; i < 5; i++) assert.equal(r1(), r2());
  assert.ok(m.dailyScore({ levels: 3, kills: 100, bosses: 1, won: false, seconds: 300 }) < m.dailyScore({ levels: 9, kills: 400, bosses: 2, won: true, seconds: 900 }));
  assert.match(m.todayKey(new Date(2026, 0, 5)), /^2026-01-05$/);
});
