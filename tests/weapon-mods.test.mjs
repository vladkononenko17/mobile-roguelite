import assert from "node:assert/strict";
import test from "node:test";

import { applyWeaponMods, modsForWeapon } from "../src/playcanvas/weaponMods.ts";

const base = {
  damage: 10,
  fireRate: 10,
  range: 10,
  spreadDeg: 10,
  pellets: 1,
  penetration: 0,
  magazine: 20,
  reloadSeconds: 1,
  knockback: 0,
};

test("suppressor and reflex sight project their weapon stats", () => {
  const result = applyWeaponMods(base, ["suppressor", "reflex"], "shot_test");

  assert.ok(Math.abs(result.range - 11.8) < 1e-9);
  assert.ok(Math.abs(result.spreadDeg - 5.76) < 1e-9);
  assert.equal(result.audio?.id, "shot_test");
  assert.equal(result.audio?.volume, 0.32);
  assert.ok(Math.abs((result.fx?.muzzleSize ?? 0) - 0.099) < 1e-9);
});

test("extended magazine has the documented capacity and reload trade-off", () => {
  const result = applyWeaponMods(base, ["extendedMag"], "shot_test");

  assert.equal(result.magazine, 29);
  assert.equal(result.reloadSeconds, 1.12);
});

test("dual Uzis exclude the two-handed foregrip", () => {
  assert.deepEqual(modsForWeapon("dualUzi").map((mod) => mod.id), ["suppressor", "reflex", "extendedMag"]);
  assert.ok(modsForWeapon("mp5").some((mod) => mod.id === "foregrip"));
});
