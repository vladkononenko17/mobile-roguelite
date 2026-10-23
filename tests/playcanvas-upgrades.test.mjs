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
    contents: `export { PlayerStats } from "./gameplay/PlayerStats.ts"; export { applyUpgrade } from "./gameplay/Upgrades.ts";`,
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
const { PlayerStats, applyUpgrade } = await import(pathToFileURL(bundle).href);

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
