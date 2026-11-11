import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// Upgrades.ts imports without extensions, so bundle it (data and pure logic only, no engine).
const { outputFiles } = buildSync({
  stdin: {
    contents: `export { PlayerStats } from "./gameplay/PlayerStats.ts"; export { applyUpgrade, rollUpgrades, availableUpgrades } from "./gameplay/Upgrades.ts"; export { snapshotStats, restoreStats } from "./gameplay/checkpoint.ts"; export { dustFor, META } from "./gameplay/meta.ts"; export { XP, xpToNext, SHOP, UPGRADES, ARSENAL, WEAPON_STATS, weaponTier } from "./gameplay/config.ts";`,
    resolveDir: new URL("../src/playcanvas/", import.meta.url).pathname,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  external: ["playcanvas"],
});
const bundle = join(mkdtempSync(join(tmpdir(), "upgrades-")), "upgrades.mjs");
writeFileSync(bundle, outputFiles[0].text);
const { PlayerStats, applyUpgrade, rollUpgrades, availableUpgrades, snapshotStats, restoreStats, dustFor, META, XP, xpToNext, SHOP, UPGRADES, ARSENAL, WEAPON_STATS, weaponTier } = await import(pathToFileURL(bundle).href);

test("a capped upgrade never lowers a stat that another source already raised past its cap", () => {
  const crit = new PlayerStats();
  crit.critChance = 0.75; // Steady Hand drops + Marksman + Pact of the Eye (cap 0.9)
  applyUpgrade(crit, "headhunter"); // cap 0.7
  assert.equal(crit.critChance, 0.75);
  assert.equal(crit.critMult, 2.5); // its uncapped part still applies

  const fire = new PlayerStats();
  fire.explodeChance = 1; // Dragon's Breath
  applyUpgrade(fire, "pactRuin"); // cap 0.9
  assert.equal(fire.explodeChance, 1);
});

test("caps still stop growth below them", () => {
  const s = new PlayerStats();
  applyUpgrade(s, "headhunter");
  assert.ok(Math.abs(s.critChance - 0.08) < 1e-9);
  s.critChance = 0.68;
  applyUpgrade(s, "headhunter");
  assert.equal(s.critChance, 0.7);
});

test("the first chapter is a build: early level-ups come fast", () => {
  let xp = 0, level = 1;
  // ~200 walker-class kills (11 XP) in chapter I.
  for (let k = 0; k < 200; k++) { xp += 11; while (xp >= xpToNext(level)) { xp -= xpToNext(level); level++; } }
  assert.ok(level >= 8 && level <= 10, `chapter I ends at level ${level}`);
  assert.ok(xpToNext(1) <= 70, "the first pick comes after a handful of kills");
});

test("rarer upgrades come up less often, luck raises them", () => {
  const count = (luck) => {
    let epic = 0;
    for (let i = 0; i < 3000; i++) {
      const s = new PlayerStats();
      s.luck = luck;
      for (const u of rollUpgrades(s, 3, "levelUp")) if (u.rarity === "epic") epic++;
    }
    return epic;
  };
  const base = count(0), lucky = count(1);
  const epics = availableUpgrades(new PlayerStats(), "levelUp").filter((u) => u.rarity === "epic").length;
  const all = availableUpgrades(new PlayerStats(), "levelUp").length;
  assert.ok(base / 9000 < (epics / all) * 0.85, "epics rarer than a uniform draw");
  assert.ok(lucky > base * 1.2, "luck shows more epics");
});

test("evolutions unlock from their requirements and are offered first", () => {
  const s = new PlayerStats();
  for (let i = 0; i < 3; i++) applyUpgrade(s, "headhunter");
  assert.ok(!availableUpgrades(s, "levelUp").some((u) => u.id === "deadeye"));
  applyUpgrade(s, "piercing");
  assert.equal(rollUpgrades(s, 3, "levelUp")[0].id, "deadeye");
  const t = new PlayerStats();
  applyUpgrade(t, "chainLightning"); applyUpgrade(t, "chainLightning"); applyUpgrade(t, "drone");
  assert.equal(rollUpgrades(t, 3, "levelUp")[0].id, "stormGrid");
});

test("a checkpoint restores the build in place, deep-copied", () => {
  const s = new PlayerStats();
  applyUpgrade(s, "heavyRounds");
  s.owned.add("rifle");
  s.weaponMods.set("rifle", new Set(["suppressor"]));
  s.cash = 77;
  const snap = snapshotStats(s);
  const owned = s.owned, mods = s.weaponMods;
  applyUpgrade(s, "heavyRounds");
  s.owned.add("shotgun");
  s.weaponMods.get("rifle").add("reflex");
  s.cash = 3;
  restoreStats(s, snap);
  assert.equal(s.owned, owned, "same Set object");
  assert.equal(s.weaponMods, mods, "same Map object");
  assert.deepEqual([...s.owned].sort(), ["pistol", "rifle"]);
  assert.deepEqual([...s.weaponMods.get("rifle")], ["suppressor"]);
  assert.equal(s.upgrades.get("heavyRounds"), 1);
  assert.equal(s.cash, 77);
  assert.ok(Math.abs(s.damageMult - 1.2) < 1e-9);
});

test("dust: every run pays, a win pays more", () => {
  const lost = dustFor({ kills: 120, levels: 2, bosses: 0, elites: 1, won: false });
  const won = dustFor({ kills: 400, levels: 9, bosses: 3, elites: 4, won: true });
  assert.ok(lost >= 15 && lost < 40, `a short loss pays ${lost}`);
  assert.ok(won > 120, `a cleared chapter pays ${won}`);
  for (const m of META) assert.ok(m.ranks >= 1 && m.cost > 0);
});

test("shop: every item has a price and stat items a cap; late items come later", () => {
  for (const item of SHOP) {
    if (item.id !== "mk" && item.id !== "gadget") assert.ok(item.cost > 0, item.id);
    if (!item.weapon && !["heal", "crate", "mk", "gadget"].includes(item.id)) assert.ok(item.max, `${item.id} is capped`);
  }
  assert.ok(SHOP.filter((i) => i.from).every((i) => i.cost >= 70));
  assert.ok(UPGRADES.some((u) => u.id === "magnet"));
});

test("arsenal: every tier's guns can fire, are sold, and a higher tier costs more and hits harder", () => {
  const sustained = (w) => { const s = WEAPON_STATS[w]; const shots = s.magazine / s.fireRate; return (s.damage * s.pellets * s.fireRate * shots) / (shots + s.reloadSeconds); };
  let lastPrice = 0, lastDps = 0;
  for (const [i, tier] of ARSENAL.tiers.entries()) {
    const prices = [], dps = [];
    for (const w of tier.weapons) {
      assert.ok(WEAPON_STATS[w], `${w} has stats`);
      assert.equal(weaponTier(w), i);
      const item = SHOP.find((x) => x.weapon === w);
      if (i > 0) { assert.ok(item, `${w} is sold`); prices.push(item.cost); }
      dps.push(sustained(w));
    }
    if (i > 0) {
      assert.ok(Math.min(...prices) >= lastPrice * 0.95, `tier ${i} prices climb`);
      lastPrice = Math.min(...prices);
    }
    assert.ok(Math.max(...dps) > lastDps, `tier ${i} has a stronger gun (${Math.max(...dps).toFixed(0)})`);
    lastDps = Math.max(...dps);
  }
});

test("gunsmith Mk levels raise the equipped gun only", () => {
  const s = new PlayerStats();
  s.owned.add("rifle");
  const before = s.weaponStatsFor("rifle").damage;
  s.weaponLevel.set("rifle", 2);
  assert.ok(Math.abs(s.weaponStatsFor("rifle").damage / before - (1 + 2 * ARSENAL.mk.damage)) < 1e-9);
  assert.equal(s.weaponStatsFor("pistol").damage, new PlayerStats().weaponStatsFor("pistol").damage);
});
