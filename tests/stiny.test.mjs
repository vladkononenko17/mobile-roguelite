import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, PERKS, SEASON_DEFS, SEASONS, FRIEND_NAMES, FRIEND_ACC, TRAITS, PLACE_LABELS } from '../stiny/src/content.ts';
import {
  newRun, actionsAt, beginAction, tick, endDay, choosePerk, resolveBallistic, resolveKnock, resolveDelivery, resolveSlam,
  resolveMom, resolveNeighbor, interruptAction, busHere, maxPsyche, peep, despair,
} from '../stiny/src/sim.ts';

/** Plays a whole run with a fixed habit list; returns the finished run. */
function play(seed, style = 'careful', trait = 'it') {
  const run = newRun(seed, trait);
  let rng = seed;
  const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let g = 0; g < 40 && !run.ending; g++) {
    const d = run.day;
    const plan = style === 'careful'
      ? ['eat', 'exercise', 'work', 'shower', 'water_plant', 'mom', 'friends', 'eat', 'work', 'read', 'calendar', 'tidy', 'balcony', 'pet', 'therapy', 'journal', 'guitar', 'eat', 'cook', 'read']
      : style === 'worker' ? ['eat', 'work', 'eat', 'work', 'work', 'eat', 'stare'] : ['news', 'stare', 'eat', 'news', 'stare', 'eat', 'stare', 'news'];
    let i = 0;
    for (let safety = 0; safety < 3000 && run.day === d && !run.ending; safety++) {
      if (!d.busy) {
        let id;
        if (run.food < 2 && style !== 'doom' && !d.used.order) id = 'order';
        else if (d.alert && !d.sheltered && style === 'careful') id = 'shelter';
        else if (d.clock >= 22 * 60 || i >= plan.length) break;
        else { id = plan[i++]; if (id === 'balcony' && busHere(d)) continue; }
        if (beginAction(run, id)) continue;
      }
      const evs = tick(run, 30);
      for (const e of evs) {
        if (e.kind === 'alert' && e.ballistic) { interruptAction(run); resolveBallistic(run, style === 'careful' || rand() < 0.5); }
        if (e.kind === 'knock') resolveKnock(run, e.who, rand() < (style === 'careful' ? 0.85 : 0.6));
        if (e.kind === 'delivery') resolveDelivery(run, e.fake, e.volunteer, e.fake ? 'ignore' : 'leave');
        if (e.kind === 'mom') resolveMom(run, style !== 'doom');
        if (e.kind === 'neighbor') resolveNeighbor(run, 'silent');
      }
      if (evs.some((e) => e.kind === 'night')) break;
    }
    if (run.ending) break;
    const rep = endDay(run);
    if (rep.ending) break;
    choosePerk(run, rep.offer[0] ?? null);
  }
  return run;
}

describe('«Чотири стіни» content', () => {
  it('has sixteen seasons from winter 2023 to autumn 2026', () => {
    assert.equal(SEASON_DEFS.length, SEASONS);
    assert.equal(SEASONS, 16);
    for (const s of SEASON_DEFS) { assert.ok(s.intro.length > 20); assert.ok(s.facts.length >= 2); }
  });
  it('every action lives somewhere and every perk action has its perk', () => {
    const perkIds = new Set(PERKS.map((p) => p.id));
    for (const a of ACTIONS) {
      assert.ok(a.place === 'phone' || a.place in PLACE_LABELS, a.id);
      if (a.perk) assert.ok(perkIds.has(a.perk), a.id);
    }
    assert.equal(new Set(ACTIONS.map((a) => a.id)).size, ACTIONS.length);
    assert.equal(new Set(PERKS.map((p) => p.id)).size, PERKS.length);
  });
  it('declines every friend name', () => {
    assert.equal(FRIEND_ACC.length, FRIEND_NAMES.length);
  });
});

describe('«Чотири стіни» rules', () => {
  it('a run is reproducible from its seed', () => {
    const a = newRun(42, 'it');
    const b = newRun(42, 'it');
    assert.deepEqual(a.friends.map((f) => f.name), b.friends.map((f) => f.name));
    assert.deepEqual(a.day.plan.map((p) => p.at), b.day.plan.map((p) => p.at));
  });
  it('every run has a friend who will die', () => {
    for (let s = 1; s < 60; s++) assert.ok(newRun(s).friends.some((f) => f.arc.some(([, st]) => st === 'dead')), `seed ${s}`);
  });
  it('the ceiling sinks every season', () => {
    const r = newRun(5);
    const top0 = maxPsyche(r);
    r.season = 12;
    assert.ok(maxPsyche(r) < top0);
  });
  it('the door only lets you out when you are breaking', () => {
    const r = newRun(9);
    assert.ok(!actionsAt(r, 'door').some((a) => a.def.id === 'break_out'));
    r.psyche = 10;
    assert.ok(actionsAt(r, 'door').some((a) => a.def.id === 'break_out'));
    assert.ok(despair(r) > 0.8);
  });
  it('nothing works without power, except with the power station', () => {
    const r = newRun(3);
    r.day.blackouts = [[0, 24 * 60]];
    assert.equal(beginAction(r, 'work'), 'Немає світла');
    r.perks.push('station');
    r.station = 100;
    assert.equal(beginAction(r, 'work'), null);
  });
  it('the corridor always saves you from a ballistic strike', () => {
    for (let s = 0; s < 200; s++) {
      const r = newRun(s);
      assert.equal(resolveBallistic(r, true).ending, undefined);
    }
  });
  it('opening to a fake courier and failing to slam the door ends the run', () => {
    const r = newRun(11);
    assert.equal(resolveSlam(r, false).ending, 'bus');
    assert.equal(r.ending, 'bus');
  });
  it('the paid channel always shows the fake courier', () => {
    const r = newRun(12);
    r.perks.push('buschat');
    for (let i = 0; i < 30; i++) assert.equal(peep(r, true).kind, 'fake');
  });
  it('a season ends with the day: time moves, friends move on', () => {
    const r = newRun(21);
    const d0 = r.daysInside;
    const rep = endDay(r);
    assert.equal(r.season, 1);
    assert.ok(r.daysInside > d0);
    assert.equal(rep.offer.length, 3);
    choosePerk(r, rep.offer[0]);
    assert.ok(r.perks.includes(rep.offer[0]));
    assert.ok(r.day);
  });
  it('balance: careful living can last four years, pure work or doomscrolling breaks you', () => {
    const N = 60;
    const res = (style) => Array.from({ length: N }, (_, i) => play(i + 1, style));
    const careful = res('careful');
    const survived = careful.filter((r) => r.ending === 'survived').length;
    assert.ok(survived > N * 0.15 && survived < N * 0.8, `careful survived ${survived}/${N}`);
    const worker = res('worker');
    assert.ok(worker.every((r) => r.ending !== 'survived'), 'grinding should not get you through');
    const doom = res('doom');
    assert.ok(doom.reduce((s, r) => s + r.history.length, 0) / N < 5, 'doomscrolling should break you fast');
    // the line goes down over the years
    const avg = (k) => careful.filter((r) => r.history.length > k).reduce((s, r) => s + r.history[k], 0) / Math.max(1, careful.filter((r) => r.history.length > k).length);
    assert.ok(avg(1) > avg(12), `psyche ${avg(1)} → ${avg(12)}`);
  });
  it('every trait can start', () => {
    for (const t of TRAITS) { const r = newRun(7, t.id); assert.equal(r.trait, t.id); assert.ok(r.day); }
  });
});
