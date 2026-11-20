import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../stiny/src/content.ts';
import { applyContentLang } from '../stiny/src/content.en.ts';
import { newRun, startDay, beginAction, finishAction, canDo, actionsAt, MINIGAME_ACTIONS } from '../stiny/src/sim.ts';

/** A fresh day at noon, rested, with water and power. */
function day(seed = 3) {
  const r = newRun(seed);
  if (!r.day) startDay(r);
  r.day.clock = 12 * 60;
  r.day.blackouts = [];
  r.day.waterOff = [];
  r.day.busy = null;
  r.energy = 80;
  r.psyche = 50;
  return r;
}

describe('«Чотири стіни» minigames', () => {
  it('every minigame action exists, and music lies on the bed', () => {
    for (const id of MINIGAME_ACTIONS) assert.ok(ACTIONS.some((a) => a.id === id), id);
    const r = day();
    assert.ok(actionsAt(r, 'bed').some((a) => a.def.id === 'music'));
  });

  it('a good game gives a little more, a bad one less, 1 is as before', () => {
    const gain = (score) => { const r = day(); assert.equal(beginAction(r, 'shower', score), null); return finishAction(r, 'shower', score).dPsyche; };
    const base = gain(1), best = gain(1.25), worst = gain(0);
    assert.ok(best > base && base > worst && worst > 0, `${worst} < ${base} < ${best}`);
  });

  it('asks before the minigame: no shower without water, no music on a dead phone', () => {
    const r = day();
    assert.equal(canDo(r, 'shower'), null);
    r.day.used.shower = 1;
    assert.ok(canDo(r, 'shower'), 'once a day: asked before the game, not after');
    const m = day();
    m.day.phone = 2;
    assert.ok(canDo(m, 'music'), 'a dead phone plays no music');
    m.day.phone = 80;
    assert.equal(canDo(m, 'music'), null);
    assert.equal(beginAction(m, 'music'), null);
    assert.equal(m.day.phone, 76, 'music costs battery');
  });

  it('music has an English label', () => {
    applyContentLang('en');
    assert.equal(ACTIONS.find((a) => a.id === 'music').label, 'Listen to music');
    applyContentLang('uk');
    assert.equal(ACTIONS.find((a) => a.id === 'music').label, 'Послухати музику');
  });
});
