import assert from "node:assert/strict";
import test from "node:test";
import { FILES, gunLengths, measure } from "../scripts/measure-heroes.mjs";

// docs/HERO_HOLD.md §1-2: built heroes (the CC0 avatars) against real proportions.
const AVATARS = ["medic", "demolitionist", "drifter"];
const rows = Object.fromEntries(await Promise.all(AVATARS.map(async (h) => [h, await measure(FILES[h])])));
const guns = await gunLengths();

for (const hero of AVATARS) {
  test(`${hero}: hands, wrists and sleeves in proportion`, () => {
    const m = rows[hero];
    for (const s of ["L", "R"]) {
      const hand = m[`${s}.handLen`] / m.height;
      assert.ok(hand >= 0.095 && hand <= 0.12, `${s} hand ${hand.toFixed(3)} x height`);
      assert.ok(m[`${s}.wristR`] <= 0.038, `${s} wrist ${(m[`${s}.wristR`] * 100).toFixed(1)} cm`);
      assert.ok(m[`${s}.forearmR`] <= 0.06, `${s} forearm ${(m[`${s}.forearmR`] * 100).toFixed(1)} cm`);
      assert.ok(m[`${s}.upperArmR`] <= 0.095, `${s} upper arm ${(m[`${s}.upperArmR`] * 100).toFixed(1)} cm`);
    }
    for (const k of ["handLen", "wristR", "forearmR", "upperArmR"]) {
      const l = m[`L.${k}`], r = m[`R.${k}`];
      assert.ok(Math.abs(l - r) / Math.max(l, r) <= 0.05, `${k} left ${l} vs right ${r}`);
    }
  });
  test(`${hero}: guns against the hand`, () => {
    const hand = rows[hero]["R.handLen"];
    const ratio = (node) => guns[node] / hand;
    assert.ok(ratio("Pistol_Full_East") >= 0.9 && ratio("Pistol_Full_East") <= 1.3, `pistol ${ratio("Pistol_Full_East")}`);
    assert.ok(ratio("SMG_Full_East") >= 2.6 && ratio("SMG_Full_East") <= 3.3, `smg ${ratio("SMG_Full_East")}`);
    assert.ok(ratio("Rifle_Assault_East") >= 3.5 && ratio("Rifle_Assault_East") <= 4.7, `rifle ${ratio("Rifle_Assault_East")}`);
  });
}
