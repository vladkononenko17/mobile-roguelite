import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Weapon } from '../src/game/Weapon.ts';
import { joystickVector, contractComplete, timeLabel } from '../src/game/math.ts';

describe('R-12 weapon state', () => {
  it('enforces cadence and does not consume ammunition on rejected shots', () => {
    const gun = new Weapon();
    assert.equal(gun.shoot(), true);
    assert.equal(gun.shoot(), false);
    assert.equal(gun.ammo, 11);
    gun.update(gun.fireDelay);
    assert.equal(gun.shoot(), true);
  });
  it('reloads on empty and cannot shoot while reloading', () => {
    const gun = new Weapon();
    gun.ammo = 1;
    assert.equal(gun.shoot(), true);
    assert.equal(gun.ammo, 0);
    gun.update(0.2);
    assert.equal(gun.shoot(), false);
    assert.equal(gun.update(1.2), true);
    assert.equal(gun.ammo, 12);
    assert.equal(gun.update(1), false);
  });
  it('manual reload refuses a full magazine or a duplicate request', () => {
    const gun = new Weapon();
    assert.equal(gun.reload(), false);
    gun.shoot();
    assert.equal(gun.reload(), true);
    assert.equal(gun.reload(), false);
  });
  it('does not use wall-clock timers during pause', () => {
    const gun = new Weapon();
    gun.shoot();
    gun.reload();
    const before = gun.reloadLeft;
    gun.update(0);
    assert.equal(gun.reloadLeft, before);
    assert.equal(gun.ammo, 11);
  });
  it('magazine mod completes an in-progress reload', () => {
    const gun = new Weapon();
    gun.shoot();
    gun.reload();
    gun.upgrade('magazine');
    assert.equal(gun.magazine, 16);
    assert.equal(gun.ammo, 16);
    assert.equal(gun.reloadLeft, 0);
  });
  it('caps rate, crit and piercing upgrades', () => {
    const gun = new Weapon();
    for (let i = 0; i < 50; i++) {
      gun.upgrade('firerate'); gun.upgrade('crit'); gun.upgrade('pierce');
    }
    assert.equal(gun.fireDelay, 0.09);
    assert.equal(gun.critChance, 0.6);
    assert.equal(gun.pierce, 4);
  });
  it('resetting a run creates an independent, fully loaded rifle', () => {
    const oldGun = new Weapon(); oldGun.upgrade('magazine'); oldGun.shoot();
    const gun = new Weapon();
    assert.equal(gun.ammo, 12);
    assert.equal(gun.reloadLeft, 0);
    assert.equal(gun.damage, 28);
  });
});

describe('input and mission rules', () => {
  it('has a dead zone and clamps diagonals to unit length', () => {
    assert.deepEqual(joystickVector(2, 2), { x: 0, y: 0 });
    const vector = joystickVector(200, -200);
    assert.ok(Math.abs(Math.hypot(vector.x, vector.y) - 1) < 1e-8);
    assert.ok(vector.x > 0 && vector.y < 0);
  });
  it('preserves analog movement below maximum radius', () => {
    assert.deepEqual(joystickVector(21.5, 0), { x: 0.5, y: 0 });
  });
  it('requires both surviving the contract and defeating the boss', () => {
    assert.equal(contractComplete(90, 90, false), false);
    assert.equal(contractComplete(89, 90, true), false);
    assert.equal(contractComplete(96, 90, true), true);
  });
  it('formats mission countdown without negative values', () => {
    assert.equal(timeLabel(90), '01:30');
    assert.equal(timeLabel(0.1), '00:01');
    assert.equal(timeLabel(-3), '00:00');
  });
});
