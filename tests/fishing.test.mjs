import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FishingSim, DAYS, rankFor } from '../fishing/src/sim.ts';

function run(sim, seconds, step = 0.05) {
  const events = [];
  for (let t = 0; t < seconds; t += step) events.push(...sim.update(step));
  return events;
}

function runUntil(sim, predicate, limit = 120) {
  for (let t = 0; t < limit; t += 0.05) {
    const events = sim.update(0.05);
    if (predicate(sim, events)) return events;
  }
  throw new Error('condition never reached');
}

describe('Не клюёт: rage rules', () => {
  it('every fish the friend lands makes you angrier', () => {
    const sim = new FishingSim(1);
    const before = sim.rage;
    const events = runUntil(sim, (_, ev) => ev.some(e => e.type === 'friendCatch'));
    assert.ok(events.some(e => e.type === 'friendCatch'));
    assert.ok(sim.rage > before + 8);
    assert.equal(sim.friendBucket.length, 1);
  });

  it('rage at 100 breaks the rod and ends the run in the river', () => {
    const sim = new FishingSim(2);
    sim.rage = 99.9;
    const events = run(sim, 1);
    assert.ok(events.some(e => e.type === 'meltdown'));
    assert.equal(sim.rod, 'broken');
    assert.equal(sim.phase, 'meltdown');
    sim.tap();
    sim.drinkBeer();
    const later = run(sim, 4);
    assert.ok(later.some(e => e.type === 'lost'));
    assert.equal(sim.phase, 'lost');
  });

  it('an idle player melts down on the first day', () => {
    const sim = new FishingSim(3);
    run(sim, DAYS[0].length);
    assert.ok(['meltdown', 'lost'].includes(sim.phase));
  });
});

describe('Не клюёт: own rod', () => {
  it('strike on a bite, stop the marker in the zone, and the catch calms you', () => {
    const sim = new FishingSim(4);
    sim.rage = 60;
    runUntil(sim, s => s.rod === 'bite');
    sim.tap();
    assert.equal(sim.rod, 'reeling');
    const before = sim.rage;
    runUntil(sim, s => s.reelMarker >= s.reelZone[0] + 0.01 && s.reelMarker <= s.reelZone[1] - 0.01);
    const events = [];
    sim.tap();
    events.push(...sim.update(0.01));
    assert.ok(events.some(e => e.type === 'catch'), JSON.stringify(events));
    assert.equal(sim.myFish.length, 1);
    assert.ok(sim.rage < before - 15);
  });

  it('a missed bite and an early strike both cost rage', () => {
    const sim = new FishingSim(5);
    runUntil(sim, s => s.rod === 'bite');
    const before = sim.rage;
    const events = runUntil(sim, (_, ev) => ev.some(e => e.type === 'missed'));
    assert.ok(events.some(e => e.type === 'missed'));
    assert.ok(sim.rage > before + 7);
    runUntil(sim, s => s.rod === 'waiting');
    const r = sim.rage;
    sim.tap();
    assert.ok(sim.rage > r);
    assert.equal(sim.rod, 'recast');
  });
});

describe('Не клюёт: coping', () => {
  it('beer calms you but the fifth one puts you to sleep', () => {
    const sim = new FishingSim(6);
    sim.applyPerk('beer');
    sim.rage = 80;
    sim.drinkBeer();
    assert.equal(sim.hands, 'beer');
    run(sim, 1.6);
    assert.equal(sim.drunk, 1);
    assert.ok(sim.rage < 60);
    for (let i = 0; i < 4; i++) { sim.rage = 50; sim.drinkBeer(); run(sim, 1.6); }
    assert.equal(sim.hands, 'asleep');
    const events = runUntil(sim, (_, ev) => ev.some(e => e.type === 'wake'));
    assert.ok(events.some(e => e.type === 'wake'));
    assert.equal(sim.drunk, 2);
  });

  it('a cigarette slowly burns off rage and can not be chain-lit', () => {
    const sim = new FishingSim(7);
    sim.rage = 50;
    sim.friendTimer = 999;
    sim.lightSmoke();
    const events = [];
    sim.lightSmoke();
    events.push(...sim.update(0.01));
    assert.ok(events.some(e => e.type === 'denied'));
    run(sim, 6.2);
    assert.ok(sim.rage < 40);
    assert.equal(sim.cigs, 5);
  });

  it('TikTok stops passive rage but drains the battery', () => {
    const sim = new FishingSim(8);
    sim.friendTimer = 999;
    sim.openPhone();
    assert.equal(sim.hands, 'phone');
    const battery = sim.battery;
    run(sim, 3);
    assert.ok(sim.battery < battery - 5);
    sim.closePhone();
    assert.equal(sim.hands, 'free');
  });

  it('stealing while he looks away works, while he watches it backfires', () => {
    const sim = new FishingSim(9);
    runUntil(sim, (_, ev) => ev.some(e => e.type === 'friendCatch'));
    sim.gaze = 'distracted';
    sim.gazeTimer = 10;
    sim.friendTimer = 999;
    const friendKg = sim.friendKg;
    sim.rage = 60;
    sim.startSteal();
    assert.equal(sim.hands, 'steal');
    const events = run(sim, sim.stealDuration + 0.2);
    assert.ok(events.some(e => e.type === 'stolen'));
    assert.equal(sim.myFish.length, 1);
    assert.ok(sim.friendKg < friendKg);
    assert.ok(sim.rage < 40);

    const sim2 = new FishingSim(10);
    runUntil(sim2, (_, ev) => ev.some(e => e.type === 'friendCatch'));
    sim2.gaze = 'watching';
    sim2.gazeTimer = 10;
    sim2.friendTimer = 999;
    sim2.rage = 40;
    sim2.startSteal();
    const ev2 = run(sim2, 0.2);
    assert.ok(ev2.some(e => e.type === 'caught'));
    assert.ok(sim2.rage > 55);
    assert.ok(sim2.stealCooldown > 0);
  });
});

describe('Не клюёт: trip structure', () => {
  it('three days with a perk between them, rage halves overnight', () => {
    const sim = new FishingSim(11);
    // Keep the player calm so the day can finish.
    const calm = () => { sim.rage = 30; };
    for (let t = 0; t < DAYS[0].length + 1; t += 0.05) { calm(); sim.update(0.05); }
    assert.equal(sim.phase, 'dayEnd');
    const offer = sim.offerPerks();
    assert.equal(new Set(offer).size, 3);
    sim.rage = 80;
    sim.nextDay(offer[0]);
    assert.equal(sim.day, 1);
    assert.equal(sim.rage, 40);
    assert.equal(sim.perks[offer[0]], 1);
    for (let t = 0; t < DAYS[1].length + 1; t += 0.05) { calm(); sim.update(0.05); }
    sim.nextDay(sim.offerPerks()[0]);
    const events = [];
    for (let t = 0; t < DAYS[2].length + 1; t += 0.05) { calm(); events.push(...sim.update(0.05)); }
    assert.equal(sim.phase, 'won');
    assert.ok(events.some(e => e.type === 'won'));
  });

  it('a sensible bot usually survives, but not always', () => {
    let wins = 0;
    const N = 40;
    for (let seed = 100; seed < 100 + N; seed++) {
      const sim = new FishingSim(seed);
      for (let t = 0; t < 400 && !['won', 'lost'].includes(sim.phase); t += 0.05) {
        if (sim.phase === 'dayEnd') { sim.nextDay(sim.offerPerks()[0]); continue; }
        // Human-ish reaction: strike ~0.35s into a bite, and stop the marker mid-zone.
        if (sim.rod === 'bite' && sim.rodTimer < sim.biteWindow - 0.35) sim.tap();
        if (sim.rod === 'reeling') {
          const mid = (sim.reelZone[0] + sim.reelZone[1]) / 2;
          if (Math.abs(sim.reelMarker - mid) < 0.05 && seed % 3 !== 0) sim.tap();
        }
        if (sim.rage > 70 && sim.gaze === 'distracted' && sim.friendBucket.length && sim.hands === 'free') sim.startSteal();
        if (sim.rage > 78 && sim.hands === 'free' && sim.beers > 0 && sim.drunk < 4) sim.drinkBeer();
        if (sim.rage > 60 && sim.smoking <= 0 && sim.cigs > 0) sim.lightSmoke();
        sim.update(0.05);
      }
      if (sim.phase === 'won') wins++;
    }
    assert.ok(wins >= N * 0.35, `bot won ${wins}/${N}`);
    assert.ok(wins <= N * 0.95, `bot won ${wins}/${N}: too easy`);
  });

  it('ranks favour out-fishing the friend', () => {
    assert.equal(rankFor(5, 3, 0).rank, 'S');
    assert.equal(rankFor(5, 3, 2).rank, 'A');
    assert.equal(rankFor(2, 3, 0).rank, 'B');
    assert.equal(rankFor(0.2, 9, 0).rank, 'C');
  });
});
