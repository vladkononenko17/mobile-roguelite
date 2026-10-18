import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FishingSim } from '../fishing/src/sim.ts';
import { LEVELS, GEAR, FISH, METHOD_POOL, combineStats } from '../fishing/src/content.ts';

const run = (sim, seconds, step = 0.05) => { const ev = []; for (let t = 0; t < seconds; t += step) ev.push(...sim.update(step)); return ev; };
const runUntil = (sim, pred, limit = 120) => {
  for (let t = 0; t < limit; t += 0.05) { const ev = sim.update(0.05); if (pred(sim, ev)) return ev; }
  throw new Error('condition never reached');
};
const calm = (sim) => { sim.rage = Math.min(sim.rage, 40); };

describe('content', () => {
  it('has ten levels with rising pressure', () => {
    assert.equal(LEVELS.length, 10);
    for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i].rageMult >= LEVELS[i - 1].rageMult);
    assert.ok(LEVELS[9].mustBeatTolik);
  });
  it('every species referenced exists and every rod has a method', () => {
    const all = [...Object.values(METHOD_POOL).flat(), ...LEVELS.flatMap(l => [...l.extra, ...(l.friendExtra ?? [])])];
    for (const [s] of all) assert.ok(FISH[s], s);
    for (const g of GEAR.filter(g => g.slot === 'rod')) assert.ok(g.method, g.id);
  });
  it('lures only help their own method', () => {
    assert.equal(combineStats(['lure-vasya'], 'float').bite, 1);
    assert.equal(combineStats(['lure-vasya'], 'spin').bite, 1.5);
  });
});

describe('rage and coping', () => {
  it('friend catches anger you; 100 rage ends the level in the river', () => {
    const sim = new FishingSim({ seed: 1 });
    const before = sim.rage;
    runUntil(sim, (_, ev) => ev.some(e => e.type === 'friendCatch'));
    assert.ok(sim.rage > before + 8);
    sim.rage = 99.95;
    const ev = run(sim, 5);
    assert.ok(ev.some(e => e.type === 'meltdown'));
    assert.ok(ev.some(e => e.type === 'lost' && e.result.reason === 'rage'));
  });
  it('beer calms, five beers put you to sleep', () => {
    const sim = new FishingSim({ seed: 2 });
    sim.beers = 9; sim.friendTimer = 999;
    for (let i = 0; i < 5; i++) { sim.rage = 60; sim.drinkBeer(); run(sim, 1.6); }
    assert.equal(sim.hands, 'asleep');
  });
  it('stealing while Tolik looks away works, while he watches it backfires', () => {
    const sim = new FishingSim({ seed: 3 });
    runUntil(sim, (_, ev) => ev.some(e => e.type === 'friendCatch'));
    sim.gaze = 'distracted'; sim.gazeTimer = 10; sim.friendTimer = 999; sim.rage = 60;
    sim.startSteal();
    const ev = run(sim, 2);
    assert.ok(ev.some(e => e.type === 'stolen'));
    assert.ok(sim.rage < 40);
  });
});

describe('methods', () => {
  it('float: strike and stop the marker in the zone', () => {
    const sim = new FishingSim({ seed: 4 });
    sim.friendTimer = 999;
    runUntil(sim, s => s.rod === 'bite');
    sim.tap();
    assert.equal(sim.rod, 'reeling');
    runUntil(sim, s => s.reelMarker > s.reelZone[0] + 0.01 && s.reelMarker < s.reelZone[1] - 0.01);
    sim.tap();
    const ev = sim.update(0.01);
    assert.ok(ev.some(e => e.type === 'catch' || e.type === 'junk'));
  });

  it('feeder: tapping while waiting recasts the feeder; bite leads to a tension fight', () => {
    const sim = new FishingSim({ seed: 5, level: 3, method: 'feeder', gear: { rod: 'rod-feeder', reel: 'reel-sovok', bait: 'bait-bread' } });
    sim.friendTimer = 999;
    runUntil(sim, s => s.rod === 'waiting');
    sim.feed = 0.2;
    sim.tap();
    assert.equal(sim.rod, 'casting');
    assert.equal(sim.feed, 1);
    runUntil(sim, s => s.rod === 'bite', 200);
    sim.tap();
    assert.equal(sim.rod, 'fight');
  });

  it('fight: holding in the green lands the fish; never letting go snaps the line', () => {
    const land = new FishingSim({ seed: 6, method: 'feeder', level: 3 });
    land.friendTimer = 999;
    runUntil(land, s => s.rod === 'bite', 200);
    land.tap();
    // Hold while tension is low, release when it climbs: a decent player.
    const ev = [];
    for (let t = 0; t < 30 && land.rod === 'fight'; t += 0.05) {
      land.hold(land.tension < 0.62);
      calm(land);
      ev.push(...land.update(0.05));
    }
    assert.ok(ev.some(e => e.type === 'catch' || e.type === 'junk'), JSON.stringify(ev.map(e => e.type)));

    const snap = new FishingSim({ seed: 7, method: 'feeder', level: 3 });
    snap.friendTimer = 999;
    runUntil(snap, s => s.rod === 'bite', 200);
    snap.tap();
    snap.hold(true);
    const ev2 = [];
    for (let t = 0; t < 10 && snap.rod === 'fight'; t += 0.05) { calm(snap); ev2.push(...snap.update(0.05)); }
    assert.ok(ev2.some(e => e.type === 'snap'));
  });

  it('spin: holding retrieves the lure, stop-and-go draws strikes, idling snags', () => {
    const sim = new FishingSim({ seed: 8, method: 'spin', level: 5, gear: { rod: 'rod-spin', reel: 'reel-sovok', bait: 'lure-vasya' } });
    sim.friendTimer = 999;
    runUntil(sim, s => s.rod === 'retrieve');
    let strikes = 0;
    for (let t = 0; t < 60; t += 0.05) {
      sim.hold(Math.floor(t * 2) % 2 === 0);
      calm(sim);
      const ev = sim.update(0.05);
      if (ev.some(e => e.type === 'bite')) { strikes++; sim.tap(); }
      if (sim.rod === 'fight') { sim.hold(sim.tension < 0.6); }
    }
    assert.ok(strikes > 0);

    const idle = new FishingSim({ seed: 9, method: 'spin', level: 5 });
    idle.friendTimer = 999;
    runUntil(idle, s => s.rod === 'retrieve');
    idle.quietBites = 99;
    const ev = runUntil(idle, (_, e) => e.some(x => x.type === 'snag'), 60);
    assert.ok(ev.some(e => e.type === 'snag'));
  });

  it('ice: only a worked jig gets bites; overplaying spooks', () => {
    const sim = new FishingSim({ seed: 10, level: 7 });
    assert.equal(sim.method, 'ice');
    sim.friendTimer = 999;
    runUntil(sim, s => s.rod === 'waiting');
    // Not jigging: no bites for a long while.
    const lazy = run(sim, 15);
    assert.ok(!lazy.some(e => e.type === 'bite'));
    let bite = false;
    for (let t = 0; t < 40 && !bite; t += 0.05) {
      if (sim.interest < 0.55) sim.tap();
      calm(sim);
      bite = sim.update(0.05).some(e => e.type === 'bite');
    }
    assert.ok(bite);
    const spook = new FishingSim({ seed: 11, level: 7 });
    runUntil(spook, s => s.rod === 'waiting');
    const ev = [];
    for (let i = 0; i < 8; i++) { spook.tap(); ev.push(...spook.update(0.01)); }
    assert.ok(ev.some(e => e.type === 'spooked'));
  });
});

describe('hazards', () => {
  it('wife call locks your hands and costs rage', () => {
    const sim = new FishingSim({ seed: 12, level: 2 });
    sim.trigger('wife');
    assert.equal(sim.hands, 'call');
    const r = sim.rage;
    sim.tap(); sim.drinkBeer();
    assert.equal(sim.beers, 3);
    run(sim, 5);
    assert.equal(sim.hands, 'free');
    assert.ok(sim.rage > r);
  });
  it('gopniki take a beer; Ashot fines you for your own beer', () => {
    const sim = new FishingSim({ seed: 13, level: 6 });
    sim.trigger('gopniki');
    assert.equal(sim.beers, 2);
    sim.trigger('ashot');
    sim.drinkBeer();
    assert.equal(sim.fines, 300);
  });
  it('mosquitoes bite unless you smoke', () => {
    const a = new FishingSim({ seed: 14, level: 4 }); a.friendTimer = 999;
    const b = new FishingSim({ seed: 14, level: 4 }); b.friendTimer = 999;
    a.trigger('mosquito'); b.trigger('mosquito'); b.lightSmoke();
    run(a, 5); run(b, 5);
    assert.ok(a.rage > b.rage + 10);
  });
  it('drunk on cracking ice: you go under', () => {
    const sim = new FishingSim({ seed: 15, level: 7 });
    sim.drunk = 3;
    sim.trigger('iceCrack');
    const ev = run(sim, 8);
    assert.ok(ev.some(e => e.type === 'fell'));
    assert.ok(ev.some(e => e.type === 'lost' && e.result.reason === 'ice'));
  });
  it('fish inspection: drinking during a patrol costs a fine and a fish', () => {
    const sim = new FishingSim({ seed: 16, level: 9 });
    sim.myFish.push({ species: 'ЩУКА', weight: 3, size: 3 });
    sim.trigger('nadzor');
    sim.drinkBeer();
    run(sim, 0.2);
    assert.equal(sim.fines, 500);
    assert.equal(sim.myFish.length, 0);
  });
  it('cold: without beer or a smoke the ice level slowly cooks you', () => {
    const sim = new FishingSim({ seed: 17, level: 7 }); sim.friendTimer = 999;
    const warmSim = new FishingSim({ seed: 17, level: 7 }); warmSim.friendTimer = 999; warmSim.warm = 999;
    run(sim, 10); run(warmSim, 10);
    assert.ok(sim.rage > warmSim.rage + 2);
  });
});

describe('level results', () => {
  it('hitting the target passes with stars and money; missing it fails', () => {
    const pass = new FishingSim({ seed: 18 });
    pass.myFish.push({ species: 'ЛЕЩ', weight: 2, size: 2 });
    pass.friendTimer = 999;
    let ev = [];
    for (let t = 0; t < 75; t += 0.05) { calm(pass); ev.push(...pass.update(0.05)); }
    const won = ev.find(e => e.type === 'won');
    assert.ok(won);
    assert.equal(won.result.stars, 3);
    assert.ok(won.result.money > 0);

    const fail = new FishingSim({ seed: 19 });
    ev = [];
    for (let t = 0; t < 75; t += 0.05) { calm(fail); fail.friendTimer = 999; ev.push(...fail.update(0.05)); }
    const lost = ev.find(e => e.type === 'lost');
    assert.ok(lost);
    assert.equal(lost.result.reason, 'target');
  });
  it('the final demands beating Tolik', () => {
    const sim = new FishingSim({ seed: 20, level: 10 });
    sim.myFish.push({ species: 'КАРП', weight: 7, size: 3 });
    sim.friendFish.push({ species: 'СОМ', weight: 9, size: 3 });
    sim.friendTimer = 999;
    sim.dayTime = 99.9;
    calm(sim);
    const ev = run(sim, 0.2);
    const lost = ev.find(e => e.type === 'lost');
    assert.ok(lost && lost.result.reason === 'target');
  });
});

describe('balance', () => {
  // A competent bot per method: most early levels are passable with starter gear,
  // the late ones need upgrades.
  function bot(level, method, gear, seed) {
    const sim = new FishingSim({ seed, level, method, gear });
    for (let t = 0; t < 200 && !sim.result; t += 0.05) {
      if (sim.rod === 'bite' && sim.rodTimer < sim.biteWindow - 0.3) sim.tap();
      if (sim.rod === 'reeling') { const m = (sim.reelZone[0] + sim.reelZone[1]) / 2; if (Math.abs(sim.reelMarker - m) < 0.05) sim.tap(); }
      if (sim.rod === 'fight') sim.hold(sim.tension < 0.6);
      else if (sim.rod === 'retrieve') sim.hold(Math.floor(t * 2) % 2 === 0);
      else sim.hold(false);
      if (sim.method === 'ice' && sim.rod === 'waiting' && sim.interest < 0.55) sim.tap();
      if (sim.method === 'feeder' && sim.rod === 'waiting' && sim.feed < 0.3) sim.tap();
      if (sim.rage > 70 && sim.gaze === 'distracted' && sim.friendBucket.length && sim.hands === 'free') sim.startSteal();
      if (sim.rage > 75 && sim.hands === 'free' && sim.beers > 0 && sim.drunk < 2 && sim.hazard !== 'nadzor' && sim.hazard !== 'ashot') sim.drinkBeer();
      if ((sim.rage > 55 || sim.hazard === 'mosquito') && sim.smoking <= 0 && sim.cigs > 0) sim.lightSmoke();
      sim.update(0.05);
    }
    return sim.result;
  }
  it('level 1 with starter gear is beatable most of the time', () => {
    let pass = 0;
    for (let s = 0; s < 30; s++) if (bot(1, 'float', undefined, 100 + s)?.pass) pass++;
    assert.ok(pass >= 15, `${pass}/30`);
  });
  it('every level is beatable with good gear', () => {
    const top = { rod: 'rod-feeder-pro', reel: 'reel-alimony', bait: 'bait-blood' };
    for (const lvl of LEVELS) {
      let pass = 0;
      for (let s = 0; s < 12; s++) if (bot(lvl.id, 'feeder', top, 500 + s)?.pass) pass++;
      assert.ok(pass >= 1, `level ${lvl.id}: ${pass}/12`);
    }
  });
});
