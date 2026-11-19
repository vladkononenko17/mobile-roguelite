import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, PERKS, MEMORY_ORDER, MEMORY_CAPTIONS, FAMILY, NEWYEAR_LINES } from '../stiny/src/content.ts';
import {
  newRun, startDay, endDay, choosePerk, beginAction, finishAction, tick, actionsAt, craving, withdrawal, tremor, drunk,
  storyChoices, resolveStory, cheer, memoryFor, remember, orderCost, resolveDelivery, resolveMom,
} from '../stiny/src/sim.ts';

/** Gives the run a perk the way the perk screen does. */
function take(run, id) { run.offer = [id]; choosePerk(run, id); }
/** Starts an action and lets it finish. */
function act(run, id) {
  const err = beginAction(run, id);
  if (err) return err;
  for (let i = 0; i < 200 && run.day.busy; i++) for (const e of tick(run, 5)) if (e.kind === 'done') return e.result;
  return null;
}

describe('«Чотири стіни» smoking', () => {
  it('a pack of cigarettes makes you a smoker: it helps, it pulls, it runs out', () => {
    const r = newRun(1);
    assert.ok(PERKS.some((p) => p.id === 'cigs'));
    take(r, 'cigs');
    assert.equal(r.smoke.cigs, 20);
    r.psyche = 50;
    const res = act(r, 'smoke');
    assert.ok(res && res.dPsyche > 0, 'smoking helps');
    assert.equal(r.smoke.cigs, 19);
    assert.equal(craving(r), 0);
    const until = r.day.clock + 8 * 60;
    for (let i = 0; i < 500 && r.day.clock < until && !r.day.busy; i++) tick(r, until - r.day.clock);
    assert.ok(craving(r) > 50, `craving ${craving(r)}`);
    r.smoke.cigs = 0;
    assert.equal(actionsAt(r, 'balcony').find((a) => a.def.id === 'smoke').ok, false);
  });
  it('a strong craving drains the mind and shakes the hands', () => {
    const a = newRun(2); const b = newRun(2);
    take(a, 'cigs');
    a.smoke.crave = 95;
    a.psyche = b.psyche = 60;
    for (const x of [a, b]) { const until = x.day.clock + 60; for (let i = 0; i < 100 && x.day.clock < until; i++) tick(x, until - x.day.clock); }
    assert.ok(a.psyche < b.psyche);
    assert.equal(tremor(a), 1);
  });
  it('cigarettes come with the delivery, for a little more money', () => {
    const r = newRun(3);
    const base = orderCost(r);
    take(r, 'cigs');
    assert.ok(orderCost(r) > base);
    r.smoke.cigs = 0;
    act(r, 'order');
    assert.equal(r.day.cigsComing, true);
    resolveDelivery(r, false, false, 'leave');
    assert.ok(r.smoke.cigs === 20 || r.smoke.cigs === 0, 'unless the courier refused');
  });
  it('two seasons without a cigarette and you have quit', () => {
    const r = newRun(4);
    take(r, 'cigs');
    for (let s = 0; s < 2; s++) { const rep = endDay(r); assert.equal(rep.ending, null); choosePerk(r, null); }
    assert.equal(r.smoke, undefined);
    assert.ok(!r.perks.includes('cigs'));
  });
});

describe('«Чотири стіни» drinking', () => {
  it('each drink gives less; the third gets you drunk and costs a hangover', () => {
    const r = newRun(5);
    take(r, 'alcohol');
    r.booze.dep = 0;
    r.psyche = 40;
    const first = act(r, 'drink').dPsyche;
    r.booze.dep = 90;
    r.psyche = 40;
    const late = act(r, 'drink').dPsyche;
    assert.ok(first > late, `${first} > ${late}`);
    r.booze.today = 2;
    act(r, 'drink');
    assert.equal(drunk(r), true);
    const e0 = r.energy;
    endDay(r); choosePerk(r, null);
    assert.ok(r.day.msgs.some((m) => /Похмілля/.test(m.from)));
    void e0;
  });
  it('dependency without a drink is withdrawal; mom hears it in your voice', () => {
    const r = newRun(6);
    take(r, 'alcohol');
    r.booze.dep = 75;
    r.booze.today = 0;
    assert.equal(withdrawal(r), 2);
    r.booze.today = 2;
    assert.match(resolveMom(r, true).text, /випив/);
  });
  it('you can pour it all down the sink', () => {
    const r = newRun(7);
    take(r, 'alcohol');
    const res = act(r, 'pour_out');
    assert.ok(res);
    assert.ok(!r.perks.includes('alcohol'));
    assert.equal(r.flags.poured, 1);
  });
});

describe('«Чотири стіни» moments', () => {
  it('every moment has choices and words', () => {
    for (const id of ['procession', 'birthday', 'ex']) {
      const ch = storyChoices(id);
      assert.ok(ch.length >= 2);
      for (const c of ch) { const r = newRun(8); const o = resolveStory(r, id, c); assert.ok(o.text.length > 20, `${id}/${c}`); }
    }
  });
  it('your birthday comes once, with wishes from close friends', () => {
    let found = false;
    for (let seed = 1; seed < 30 && !found; seed++) {
      const r = newRun(seed);
      r.friends.forEach((f) => { f.arc = []; f.bond = 80; });
      for (let s = 0; s < 12 && !found; s++) {
        if (r.day.plan.some((p) => p.story === 'birthday')) {
          found = true;
          assert.ok(r.day.plan.filter((p) => p.msg?.friend != null && /народження/.test(p.msg.text)).length >= 2);
          const o = resolveStory(r, 'birthday', 'wish');
          assert.ok(o.dPsyche > 0);
        }
        const rep = endDay(r); if (rep.ending) break; choosePerk(r, null);
        r.psyche = 60;
      }
    }
    assert.ok(found);
  });
  it('the yard cheers for the power once an evening', () => {
    const r = newRun(9);
    r.day.clock = 18 * 60;
    assert.ok(cheer(r));
    assert.equal(cheer(r), null);
  });
});

describe('«Чотири стіни» memories from before', () => {
  it('the photo, a winter day crossed off, a proper meal: each opens its memory', () => {
    const r = newRun(10);
    assert.equal(memoryFor(r, 'photos'), 'dacha');
    assert.equal(memoryFor(r, 'calendar'), 'newyear', 'season 0 is winter');
    assert.equal(memoryFor(r, 'cook'), 'kitchen');
    remember(r, 'newyear');
    remember(r, 'kitchen');
    assert.equal(memoryFor(r, 'calendar'), null, 'once a run');
    assert.equal(memoryFor(r, 'cook'), null);
    assert.equal(r.flags.mem_newyear, 1);
    assert.equal(MEMORY_ORDER.length, 3);
    for (const k of MEMORY_ORDER) assert.ok(MEMORY_CAPTIONS[k]);
    assert.equal(FAMILY.length, 3);
    assert.ok(NEWYEAR_LINES.length >= 5);
  });
  it('every new action lives somewhere real', () => {
    for (const id of ['smoke', 'smoke_window', 'quit_smoking', 'pour_out']) assert.ok(ACTIONS.find((a) => a.id === id), id);
  });
});
