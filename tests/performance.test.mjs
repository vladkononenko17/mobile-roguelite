import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { ENEMIES } from '../src/game/config.ts';

it('ground is baked into one reusable small texture, independent of world size', () => {
  const source = readFileSync(new URL('../src/game/World.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText;
  const exported = {};
  vm.runInNewContext(compiled, { exports: exported, require: () => ({ Math: {
    RandomDataGenerator: class { pick(values) { return values[0]; } between(min) { return min; } },
  } }) });
  for (const size of [2600, 5200]) {
    const baked = [];
    let destroyed = 0;
    let tiles = 0;
    const shape = new Proxy({}, { get: (_, key) => (...args) => {
      if (key === 'generateTexture') baked.push(args);
      if (key === 'destroy') destroyed++;
      return shape;
    } });
    const scene = { textures: { exists: () => false }, add: {
      graphics: () => shape, text: () => shape,
      tileSprite: () => { tiles++; return shape; },
    } };
    exported.drawWasteland(scene, size);
    assert.deepEqual(baked, [['wasteland-ground', 384, 384]]);
    assert.equal(destroyed, 1);
    assert.equal(tiles, 1);
  }
});

it('faster enemies retain distinct roles and remain slower than the base player', () => {
  assert.equal(ENEMIES.raider.speed, 125);
  assert.equal(ENEMIES.spitter.speed, 95);
  assert.equal(ENEMIES.brute.speed, 78);
  assert.equal(ENEMIES.boss.speed, 65);
  for (const enemy of Object.values(ENEMIES)) assert.ok(enemy.speed * 1.135 < 205);
});
