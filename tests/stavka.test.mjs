import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AD, ALLIES, DECISIONS, PERKS, SECTORS, TARGETS, THREATS, WEAPONS, ZONES, WEEKS, km, dist } from '../stavka/src/content.ts';
import { COUNTRIES } from '../stavka/src/geo.ts';
import * as S from '../stavka/src/sim.ts';

/** A decent player: answers decisions, spends the day, taps threats, strikes something sensible. */
function goodWeek(run, opts = {}) {
  for (const d of [...run.decisions]) S.decide(run, d, 'a');
  const want = S.power(run) < 70 ? ['repair', 'interceptors', 'reserves', 'liutyi'] : ['liutyi', 'interceptors', 'reserves', 'decoys'];
  for (const id of want) S.doAction(run, id);
  const n = S.startNight(run);
  let tick = 0;
  while (!n.done) {
    let input = {};
    if (tick++ % 6 === 0) {
      const th = n.threats.find((t) => t.alive && t.engaged === 0 && t.kind !== 'gerbera' && (S.bestShooter(run, n, t).unit || S.bestShooter(run, n, t).drone));
      if (th) input = { assign: th.id };
    }
    S.stepNight(run, n, 1 / 30, input);
    assert.ok(n.t < 600, 'a night must end');
  }
  S.finishNight(run, n);
  if (run.ending) return;
  const targets = ['belgorod-depot', 'millerovo', 'kursk-launchers', 'novoshakhtinsk', 'dzhankoi', 'donetsk-depot'];
  const target = targets[run.week % targets.length];
  const plan = { target, weapon: 'liutyi', count: Math.min(10, run.stock.liutyi), decoys: Math.min(4, run.stock.decoys), via: [] };
  const fl = plan.count > 0 ? S.launchStrike(run, plan) : 'none';
  if (typeof fl === 'string') S.skipStrike(run);
  else { while (!fl.done) S.stepStrike(fl, 1 / 30); S.finishStrike(run, fl); }
  if (!run.ending) S.nextWeek(run, opts.noPerks ? null : run.perkOffer[0] ?? null);
}
function lazyWeek(run) {
  for (const d of [...run.decisions]) S.decide(run, d, 'b');
  const n = S.startNight(run);
  while (!n.done) S.stepNight(run, n, 1 / 20);
  S.finishNight(run, n);
  if (run.ending) return;
  S.skipStrike(run);
  if (!run.ending) S.nextWeek(run, null);
}
function play(seed, week, advisor = 'general', difficulty = 0) {
  const run = S.newRun(seed, advisor, difficulty);
  while (!run.ending) week(run);
  return run;
}

describe('«Ставка» content', () => {
  it('has the map: Ukraine with Crimea, Russia and neighbours', () => {
    assert.ok(COUNTRIES.UA.length >= 2, 'mainland and Crimea');
    const crimea = COUNTRIES.UA.some((r) => r.some(([x, y]) => x > 33.5 && x < 35 && y < 45));
    assert.ok(crimea, 'Crimea is drawn as Ukraine');
    for (const c of ['RU', 'BY', 'PL', 'RO', 'MD', 'TR']) assert.ok(COUNTRIES[c]?.length, c);
  });
  it('every threat has a defence that can hit it', () => {
    for (const k of Object.keys(THREATS)) assert.ok(Object.values(AD).some((a) => (a.pk[k] ?? 0) > 0), k);
  });
  it('every target is in range of some weapon from some launch site', () => {
    for (const t of TARGETS) {
      const p = km(t.at[0], t.at[1]);
      const best = Math.min(...SECTORS.map((s) => dist(km(s.city[0], s.city[1]), p)));
      assert.ok(Object.values(WEAPONS).some((w) => w.range >= best), t.id);
    }
  });
  it('ids are unique', () => {
    for (const list of [TARGETS, ZONES, PERKS, DECISIONS, ALLIES, SECTORS]) {
      const ids = list.map((x) => x.id);
      assert.equal(new Set(ids).size, ids.length);
    }
  });
});

describe('«Ставка» rules', () => {
  it('is deterministic for a seed', () => {
    const a = play(7, goodWeek), b = play(7, goodWeek);
    assert.equal(a.ending, b.ending);
    assert.equal(a.score, b.score);
    assert.deepEqual(a.front, b.front);
  });

  it('a decent player usually lasts the 16 weeks', () => {
    let wins = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const run = play(seed, goodWeek);
      assert.ok(Number.isFinite(run.score) && Number.isFinite(run.budget) && Number.isFinite(run.morale), 'numbers stay numbers');
      if (run.week >= WEEKS && ['strength', 'frozen', 'hardPeace'].includes(run.ending)) wins++;
    }
    assert.ok(wins >= 6, `wins ${wins}/8`);
  });

  it('doing nothing loses', () => {
    let losses = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const run = play(seed, lazyWeek);
      if (['darkness', 'despair', 'breakthrough', 'hardPeace'].includes(run.ending)) losses++;
    }
    assert.ok(losses >= 5, `losses ${losses}/6`);
  });

  it('every fourth night is a massive strike', () => {
    const run = S.newRun(3);
    const w1 = S.waveSize(run);
    run.week = 4;
    const w4 = S.waveSize(run);
    assert.ok(w4.shahed > w1.shahed * 1.8);
    assert.ok(w4.kh101 > 0 && w4.iskander > 0);
  });

  it('a tap on a Shahed sends a cheap interceptor first', () => {
    const run = S.newRun(5);
    run.week = 3;
    const n = S.startNight(run);
    let shot = null;
    for (let i = 0; i < 3000 && !shot; i++) {
      const th = n.threats.find((t) => t.alive && t.kind === 'shahed' && t.engaged === 0);
      const before = run.stock.interceptors;
      S.stepNight(run, n, 1 / 30, th ? { assign: th.id } : {});
      if (run.stock.interceptors < before) shot = th;
    }
    assert.ok(shot, 'an interceptor drone was launched');
  });

  it('ballistic missiles can only be hit by Patriot or SAMP/T, and not right after launch', () => {
    const run = S.newRun(9);
    run.week = 6;
    const n = S.startNight(run);
    const isk = n.threats.find((t) => t.kind === 'iskander');
    assert.ok(isk);
    while (!isk.alive && !n.done) S.stepNight(run, n, 1 / 30);
    assert.equal(S.bestShooter(run, n, isk).unit, null, 'too early');
    for (const [k, a] of Object.entries(AD)) if (k !== 'patriot' && k !== 'samp') assert.ok(!(a.pk.iskander > 0), k);
  });

  it('decoys and more missiles make a strike safer; known zones show in the risk', () => {
    const run = S.newRun(11);
    const base = { target: 'belgorod-depot', weapon: 'liutyi', count: 8, decoys: 0, via: [] };
    const r0 = S.strikeRisk(run, base);
    const r1 = S.strikeRisk(run, { ...base, decoys: 6 });
    assert.ok(r1.pSurvive > r0.pSurvive);
    assert.ok(r0.zones.includes('belgorod'));
    const nep = S.strikeRisk(run, { ...base, weapon: 'neptune', count: 1 });
    assert.ok(nep.pSurvive > r0.pSurvive, 'a cruise missile is harder to shoot down than a drone');
  });

  it('a route through a known zone is riskier than one around it', () => {
    const run = S.newRun(12);
    const around = { target: 'millerovo', weapon: 'liutyi', count: 8, decoys: 0, via: [] };
    const through = { ...around, via: [km(36.6, 50.6)] };
    const a = S.strikeRisk(run, around), b = S.strikeRisk(run, through);
    assert.ok(b.zones.includes('belgorod') && !a.zones.includes('belgorod'));
    assert.ok(b.pSurvive < a.pSurvive);
  });

  it('allied weapons on Russia without permission cost trust; occupied Crimea does not', () => {
    const run = S.newRun(13);
    run.stock.storm = 6;
    const uk = () => S.ally(run, 'uk').trust;
    const r = S.strikeRisk(run, { target: 'belgorod-depot', weapon: 'storm', count: 2, decoys: 0, via: [] });
    assert.ok(r.violations.some((v) => v.ally === 'uk'));
    const crimea = S.strikeRisk(run, { target: 'dzhankoi', weapon: 'storm', count: 2, decoys: 0, via: [] });
    assert.equal(crimea.violations.length, 0);
    const before = uk();
    S.startNight(run); run.phase = 'strike';
    const fl = S.launchStrike(run, { target: 'belgorod-depot', weapon: 'storm', count: 2, decoys: 0, via: [] });
    assert.notEqual(typeof fl, 'string');
    assert.ok(uk() <= before - 25);
  });

  it('knocking out a target weakens the enemy for a while', () => {
    const run = S.newRun(14);
    run.week = 6;
    const before = S.waveSize(run).shahed;
    run.stock.flamingo = 4;
    run.phase = 'strike';
    const fl = S.launchStrike(run, { target: 'alabuga', weapon: 'flamingo', count: 4, decoys: 0, via: [] });
    assert.notEqual(typeof fl, 'string');
    fl.missiles.forEach((m) => { m.killAt = Infinity; });
    while (!fl.done) S.stepStrike(fl, 1 / 30);
    const res = S.finishStrike(run, fl);
    assert.ok(res.destroyed);
    assert.ok(S.waveSize(run).shahed < before);
    assert.ok(run.escalation > 12, 'deep strikes escalate');
  });

  it('negotiation: low trust is refused, accepting brings the aid and the condition', () => {
    const run = S.newRun(15);
    S.ally(run, 'de').trust = 10;
    const o = S.negotiate(run, 'de', 'battery');
    assert.ok(o.refused);
    S.respond(run, 'accept');
    S.ally(run, 'usa').trust = 70;
    const units = run.ad.length;
    const o2 = S.negotiate(run, 'usa', 'battery');
    assert.ok(o2 && !o2.refused);
    S.respond(run, 'accept');
    assert.equal(run.ad.length, units + 1);
    assert.equal(run.hours, 2, 'each talk costs an hour');
  });

  it('the front moves and is drawn from the offsets', () => {
    const run = S.newRun(16);
    const line0 = S.frontLine(run);
    run.front = run.front.map(() => 20);
    const line1 = S.frontLine(run);
    assert.ok(line1[5][0] < line0[5][0], 'enemy gains push the line west');
  });

  it('losing conditions end the run', () => {
    const run = S.newRun(17);
    const n = S.startNight(run);
    S.finishNight(run, n);
    run.morale = 0;
    S.skipStrike(run);
    assert.equal(run.ending, 'despair');
    assert.equal(run.phase, 'end');
  });

  it('a saved run survives JSON', () => {
    const run = S.newRun(18);
    goodWeek(run);
    const copy = JSON.parse(JSON.stringify(run));
    goodWeek(run); goodWeek(copy);
    assert.deepEqual(copy.front, run.front);
    assert.equal(copy.budget, run.budget);
  });
});
