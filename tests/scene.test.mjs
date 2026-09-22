import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Weapon } from '../src/game/Weapon.ts';
import * as math from '../src/game/math.ts';

// Exercise real scene state transitions with a small physics/UI boundary double.
// This deliberately does not claim to test the renderer or real collision geometry.
const source = readFileSync(new URL('../src/game/GameScene.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const fakePhaser = {
  Scene: class {},
  Events: { EventEmitter },
  Math: { Vector2: class { x = 0; y = 0; set(x, y) { this.x = x; this.y = y; } } },
  Utils: { Array: { Shuffle: array => array } },
};
const exported = {};
vm.runInNewContext(compiled, {
  exports: exported,
  require: name => {
    if (name === 'phaser') return fakePhaser;
    if (name === './Weapon') return { Weapon };
    if (name === './math') return math;
    if (name === './config') return {
      CAMPAIGN_STAGES: [
        { name: 'Rust Gate', duration: 34, targetKills: 17 },
        { name: 'Tanker Yard', duration: 42, targetKills: 27 },
        { name: 'Foreman Pit', duration: 54, targetKills: 38, bossAt: 28 },
      ],
      UPGRADE_COPY: { damage: { title: 'Damage' }, crit: { title: 'Crit' }, magazine: { title: 'Magazine' } },
    };
    return {};
  },
});

function scene() {
  const s = new exported.GameScene();
  s.physics = { paused: false, pause() { this.paused = true; }, resume() { this.paused = false; } };
  s.tweens = { paused: false, pauseAll() { this.paused = true; }, resumeAll() { this.paused = false; } };
  s.player = { setVelocity() {} };
  s.rifle = { setVisible() {} };
  s.heroArt = { setVisible() {} };
  s.muzzle = { setVisible() {} };
  s.mode = 'playing';
  return s;
}

describe('Scene lifecycle regressions', () => {
  it('creates a UI event bus before Phaser has booted', () => {
    const s = new exported.GameScene();
    assert.ok(s.uiEvents instanceof EventEmitter);
  });
  it('starts with smart auto-fire enabled for touch-first combat', () => {
    const s = new exported.GameScene();
    const chain = { setAlpha() { return this; }, clearTint() { return this; }, setVelocity() { return this; }, setAngle() { return this; }, enableBody() { return this; } };
    s.tweens = { killAll() {}, resumeAll() {}, pauseAll() {} };
    s.effects = { clear() {} };
    s.clearGroups = () => {};
    s.physics = { resume() {}, pause() {} };
    s.player = chain;
    s.rifle = { setVisible() {} };
    s.heroArt = { setPosition() { return this; }, setTexture() { return this; }, setVisible() { return this; }, setFlipX() { return this; }, setAngle() { return this; } };
    s.muzzle = { setVisible() {} };
    s.cameras = { main: { fadeIn() {} } };
    s.healthBars = { clear() {} };
    s.startRun('damage');
    assert.equal(s.autoFire, true);
  });
  it('pause freezes physics, tweens and simulation clock', () => {
    const s = scene();
    s.togglePause();
    s.update(1000, 1000);
    assert.equal(s.physics.paused, true);
    assert.equal(s.tweens.paused, true);
    assert.equal(s.elapsed, 0);
    s.togglePause(true);
    assert.equal(s.mode, 'playing');
    assert.equal(s.physics.paused, false);
  });
  it('backgrounding never accidentally resumes a paused run', () => {
    const s = scene();
    s.pauseIfPlaying(); s.pauseIfPlaying();
    assert.equal(s.mode, 'paused');
    assert.equal(s.physics.paused, true);
  });
  it('upgrade picker freezes combat, applies exactly once, then resumes', () => {
    const s = scene();
    let choices;
    s.uiEvents.on('upgrade', result => { choices = result; });
    s.presentUpgrade();
    assert.equal(choices.length, 3);
    assert.equal(s.physics.paused, true);
    s.applyUpgrade('damage');
    assert.equal(s.weapon.damage, 35);
    assert.equal(s.physics.paused, false);
    s.applyUpgrade('damage');
    assert.equal(s.weapon.damage, 35);
  });
  it('grades cleared sectors and turns performance into a fair upgrade reward', () => {
    const s = new exported.GameScene();
    s.stageIndex = 0;
    s.stageKills = 20;
    s.hp = 95;
    s.maxHp = 100;
    const elite = s.evaluateStage();
    assert.equal(elite.rank, 'S');
    assert.equal(elite.choices, 3);
    assert.equal(elite.recovery, 24);

    s.stageKills = 2;
    s.hp = 18;
    const rough = s.evaluateStage();
    assert.equal(rough.rank, 'C');
    assert.equal(rough.choices, 2);
    assert.ok(rough.recovery < elite.recovery);
  });
  it('result is terminal and freezes the world without duplicate results', () => {
    const s = scene();
    let count = 0;
    s.uiEvents.on('result', () => { count++; });
    s.finish(false); s.finish(false);
    assert.equal(count, 1);
    assert.equal(s.physics.paused, true);
    assert.equal(s.mode, 'lost');
  });
  it('collisions cannot kill enemies or collect XP behind overlays', () => {
    const s = scene();
    s.togglePause();
    s.collectPickup({}, { active: true });
    s.hitEnemy({ active: true }, { active: true });
    assert.equal(s.xp, 0);
    assert.equal(s.kills, 0);
  });
});
