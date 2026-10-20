import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OBSTACLES, PERKS, STAGES, TRAITS, ENDINGS, SHOUTS, caughtEnding } from '../tikai/src/content.ts';
import {
  newRun, startStage, step, finishStage, choosePerk, breakFree, canBreakFree, loseRun, offerPerks, laneX, nextBlockpost, targetSpeed, FOOT, CAR,
} from '../tikai/src/sim.ts';

/**
 * A simple bot: keeps to the lane with the most room ahead, jumps and slides
 * when something is close. Not a great player — a decent one.
 */
function botInput(st, run, skill = 1) {
  const L = st.mode === 'car' ? CAR : FOOT;
  const v = Math.max(st.speed, 1);
  const look = v * (st.mode === 'car' ? 1.6 : 1.4) * skill;
  const clear = (lane) => {
    let best = Infinity;
    for (const o of st.objs) {
      if (o.cat !== 'obst' || o.hit) continue;
      const d = OBSTACLES[o.kind];
      const x = laneX(st, lane);
      if (Math.abs(o.x - x) > o.w / 2 + L.width / 2 - 0.2) continue;
      const dz = o.z - o.len / 2 - st.dist;
      if (dz < -o.len - 1) continue;
      if (st.mode === 'foot' && d.clear !== 'none' && !d.moving && o.kind !== 'spot') continue; // can be jumped/slid
      // moving things: when will they reach me?
      const close = o.vz ? dz * v / Math.max(0.5, v - o.vz) : dz;
      if (close < best) best = close;
    }
    return best;
  };
  const input = {};
  const here = clear(st.lane);
  if (here < look) {
    let bestLane = st.lane;
    let bestRoom = here;
    for (const dl of [-1, 1]) {
      const l = st.lane + dl;
      if (l < 0 || l >= st.lanes) continue;
      const side = st.objs.some((o) => o.cat === 'obst' && !o.hit && o.lane === l && OBSTACLES[o.kind].clear === 'none' && !OBSTACLES[o.kind].soft && Math.abs(o.z - st.dist) < o.len / 2 + L.half + 0.5);
      if (side) continue;
      const room = clear(l);
      if (room > bestRoom + 2) { bestRoom = room; bestLane = l; }
    }
    if (bestLane !== st.lane) input.dx = bestLane > st.lane ? 1 : -1;
    else if (st.mode === 'car' && st.nitro > 0 && st.nitroT <= 0 && here < look * 0.5) input.honk = true;
  }
  if (st.mode === 'foot') {
    for (const o of st.objs) {
      if (o.cat !== 'obst' || o.hit) continue;
      const d = OBSTACLES[o.kind];
      if (Math.abs(o.x - st.x) > o.w / 2 + 0.3) continue;
      const dz = o.z - st.dist;
      if (dz < 0 || dz > v * 0.24 + o.len / 2) continue;
      if (d.clear === 'jump' && st.y === 0) input.jump = true;
      if (d.clear === 'slide' && st.slide <= 0) input.slide = true;
    }
  } else {
    const bp = nextBlockpost(st);
    if (bp && bp.z - st.dist < 140 && !bp.open.includes(st.lane)) {
      const target = bp.open.reduce((a, b) => (Math.abs(b - st.lane) < Math.abs(a - st.lane) ? b : a));
      const l = st.lane + (target > st.lane ? 1 : -1);
      const side = st.objs.some((o) => o.cat === 'obst' && !o.hit && o.lane === l && !OBSTACLES[o.kind].soft && Math.abs(o.z - st.dist) < o.len / 2 + L.half + 0.5);
      if (!input.dx && !side) input.dx = target > st.lane ? 1 : -1;
    }
  }
  return input;
}

function playStage(run, skill = 1, maxT = 400) {
  const st = startStage(run);
  const dt = 1 / 30;
  let lag = 0;
  let caught = 0;
  for (let t = 0; t < maxT; t += dt) {
    let input = {};
    // reaction lag: the bot acts every few frames
    if (++lag % 3 === 0) input = botInput(st, run, skill);
    step(st, run, dt, input);
    if (st.caught) {
      caught++;
      if (!canBreakFree(run)) return { st, ok: false, caught };
      breakFree(st, run);
    }
    if (st.done) return { st, ok: true, caught };
  }
  return { st, ok: false, caught, timeout: true };
}

function playRun(seed, opts = {}) {
  const run = newRun(seed, opts.trait ?? 'it', opts.heat ?? 0);
  if (opts.escapes) run.escapes = opts.escapes;
  const stages = [];
  while (!run.ending) {
    const r = playStage(run, opts.skill ?? 1);
    stages.push(r);
    if (!r.ok) { loseRun(run, r.st); break; }
    finishStage(run, r.st);
    if (run.offer) choosePerk(run, run.offer[0] ?? null);
  }
  return { run, stages };
}

describe('«Тікай!» content', () => {
  it('has six stages that alternate on foot and by car and end at the river', () => {
    assert.equal(STAGES.length, 6);
    assert.ok(STAGES.some((s) => s.mode === 'car'));
    assert.ok(STAGES.some((s) => s.blockposts > 0));
    for (const s of STAGES) {
      for (const k of Object.keys(s.obstacles)) assert.equal(OBSTACLES[k].mode, s.mode, `${s.id}: ${k}`);
      assert.ok(s.speed[1] >= s.speed[0]);
      assert.ok(SHOUTS[s.chaser].length > 0);
      assert.ok(ENDINGS[caughtEnding(s)]);
    }
  });
  it('perks and traits have unique ids and Ukrainian text', () => {
    assert.equal(new Set(PERKS.map((p) => p.id)).size, PERKS.length);
    assert.equal(new Set(TRAITS.map((p) => p.id)).size, TRAITS.length);
    for (const p of [...PERKS, ...TRAITS]) assert.match(p.text, /[а-яіїєґ]/i);
    assert.equal(TRAITS[0].price, 0);
  });
});

describe('«Тікай!» track', () => {
  it('is reproducible from the seed', () => {
    const a = startStage(newRun(7));
    const b = startStage(newRun(7));
    assert.deepEqual(a.objs.map((o) => [o.kind, o.lane, Math.round(o.z)]), b.objs.map((o) => [o.kind, o.lane, Math.round(o.z)]));
  });
  it('never blocks every lane on foot with things you cannot jump or slide', () => {
    for (let seed = 1; seed < 40; seed++) {
      for (let s = 0; s < STAGES.length; s++) {
        if (STAGES[s].mode !== 'foot') continue;
        const run = newRun(seed);
        run.stage = s;
        const st = startStage(run);
        for (let t = 0; t < 60 && !st.done; t += 0.5) {
          // look at static rows only
          const rows = new Map();
          for (const o of st.objs) {
            if (o.cat !== 'obst' || o.vz !== 0 || o.kind === 'spot') continue;
            const key = Math.round(o.z / 4);
            if (!rows.has(key)) rows.set(key, []);
            rows.get(key).push(o);
          }
          for (const row of rows.values()) {
            const walls = new Set(row.filter((o) => OBSTACLES[o.kind].clear === 'none').map((o) => o.lane));
            assert.ok(walls.size < 3, `seed ${seed} stage ${s}: wall of ${row.map((o) => o.kind)}`);
          }
          // run blindly forward without colliding: teleport
          st.dist += 5;
          step(st, run, 0.001);
          st.caught = false;
          st.gap = 10;
        }
      }
    }
  });
  it('every blockpost leaves an open lane', () => {
    for (let seed = 1; seed < 30; seed++) {
      const run = newRun(seed, 'it', 3);
      run.stage = STAGES.findIndex((s) => s.blockposts > 0);
      const st = startStage(run);
      let seen = 0;
      for (let z = 0; z < st.length; z += 20) {
        st.dist = z;
        step(st, run, 0.001);
        st.caught = false;
        st.gap = 10;
        const bp = nextBlockpost(st);
        if (bp) { assert.ok(bp.open.length >= 1 && bp.open.length <= 2, `seed ${seed}`); seen++; }
      }
      assert.ok(seen > 0);
    }
  });
});

describe('«Тікай!» rules', () => {
  it('traffic never drives through other traffic', () => {
    for (let seed = 1; seed < 15; seed++) {
      const run = newRun(seed);
      run.stage = 2;
      const st = startStage(run);
      for (let i = 0; i < 1500 && !st.done; i++) {
        step(st, run, 1 / 30);
        st.caught = false; st.gap = 15; st.health = 3; st.invuln = 1; st.lane = 0; st.x = -6;
        const cars = st.objs.filter((o) => o.cat === 'obst' && o.vz > 0 && !o.hit);
        for (const a of cars) for (const b of cars) {
          if (a === b || Math.abs(a.x - b.x) > 1) continue;
          assert.ok(Math.abs(a.z - b.z) >= (a.len + b.len) / 2 - 0.05, `seed ${seed}: ${a.kind} inside ${b.kind}`);
        }
      }
    }
  });
  it('running clean slowly widens the gap', () => {
    const run = newRun(3);
    const st = startStage(run);
    st.objs = st.objs.filter((o) => o.cat !== 'obst');
    st.nextZ = 1e9;
    const g0 = st.gap;
    for (let i = 0; i < 300; i++) step(st, run, 1 / 30);
    assert.ok(st.gap > g0 - 0.5, `${g0} → ${st.gap}`);
  });
  it('standing still gets you caught', () => {
    const run = newRun(3);
    const st = startStage(run);
    let caught = false;
    for (let i = 0; i < 600 && !caught; i++) {
      st.speed = 0;
      st.stun = 1;
      caught = step(st, run, 1 / 30).some((e) => e.kind === 'caught');
    }
    assert.ok(caught);
  });
  it('jumping clears a bench, running into it does not', () => {
    for (const jump of [true, false]) {
      const run = newRun(5);
      const st = startStage(run);
      st.objs = [];
      st.nextZ = 1e9;
      st.speed = targetSpeed(st, run);
      st.objs.push({ id: 999, cat: 'obst', kind: 'bench', lane: st.lane, x: st.x, tx: st.x, z: st.dist + 3, y: 0, len: 0.7, w: 1.8, vz: 0, hit: false, blink: 0, look: 0, side: 0, pulled: false, bp: -1 });
      const evs = [];
      evs.push(...step(st, run, 1 / 60, { jump }));
      for (let i = 0; i < 60; i++) evs.push(...step(st, run, 1 / 60));
      assert.equal(evs.some((e) => e.kind === 'crash'), !jump, `jump=${jump}`);
    }
  });
  it('a car crash costs a dent, and no dents left means caught', () => {
    const run = newRun(5);
    run.stage = 2;
    const st = startStage(run);
    assert.ok(st.health >= 3);
    st.health = 1;
    st.objs = [{ id: 999, cat: 'obst', kind: 'blocks', lane: st.lane, x: st.x, tx: st.x, z: st.dist + 3, y: 0, len: 1.6, w: 3.4, vz: 0, hit: false, blink: 0, look: 0, side: 0, pulled: false, bp: -1 }];
    st.nextZ = 1e9;
    let caught = false;
    for (let i = 0; i < 60; i++) caught ||= step(st, run, 1 / 60).some((e) => e.kind === 'caught');
    assert.ok(caught);
  });
  it('perk offers are unique and never offer car perks when no car stage is left', () => {
    const run = newRun(11);
    run.stage = 5;
    for (let i = 0; i < 30; i++) {
      const o = offerPerks(run);
      assert.equal(new Set(o).size, o.length);
      for (const id of o) assert.notEqual(PERKS.find((p) => p.id === id).mode, 'car');
    }
  });
});

describe('«Тікай!» balance', () => {
  it('a decent player finishes most stages; the route is winnable', () => {
    let finished = 0;
    let stagesOk = 0;
    let stagesAll = 0;
    const per = STAGES.map(() => [0, 0]);
    const N = 30;
    for (let seed = 1; seed <= N; seed++) {
      const { run, stages } = playRun(seed * 13, { escapes: 3 });
      for (const s of stages) { stagesAll++; per[s.st.idx][1]++; if (s.ok) { stagesOk++; per[s.st.idx][0]++; } }
      if (run.ending === 'river') finished++;
    }
    console.log(`bot: ${finished}/${N} runs reach the river; stages ${stagesOk}/${stagesAll}; per stage ${per.map(([a, b]) => `${a}/${b}`).join(' ')}`);
    assert.ok(finished >= N * 0.15, `only ${finished}/${N}`);
    assert.ok(finished <= N * 0.95, `too easy: ${finished}/${N}`);
  });
  it('a careless player rarely makes it', () => {
    let river = 0;
    let stages = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { run } = playRun(seed * 7, { skill: 0.25 });
      if (run.ending === 'river') river++;
      stages += run.history.length;
    }
    console.log(`careless: ${river}/20 reach the river, ${(stages / 20).toFixed(1)} stages on average`);
    assert.ok(river <= 8, `${river}/20 careless runs reached the river`);
    assert.ok(stages / 20 < 4.5);
  });
});
