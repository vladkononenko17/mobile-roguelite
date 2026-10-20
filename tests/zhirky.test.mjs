import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OBSTACLES, PERKS, THEMES, HEROES, RIDES, UPGRADES, ENDINGS, DRIFT_TEXT, MODS, ROUTE_ROWS } from '../zhirky/src/content.ts';
import {
  newRun, startStage, launch, step, finishStage, choosePerk, loseRun, offerPerks, laneX, targetSpeed, choices, chooseNode, makeMap,
  buyFair, leaveFair, trackAt, kidDist, crewMax, SLOPE, KID_GAP,
} from '../zhirky/src/sim.ts';

/**
 * A simple bot: keeps to the lane with the most room ahead (changing lanes
 * early enough for the ватага to follow), jumps and ducks when something is
 * close, picks up kids when a free lane has one, and flips off ramps.
 */
function botInput(st, run, skill = 1) {
  const v = Math.max(st.speed, 1);
  const look = v * 1.5 * skill + (skill >= 1 ? st.kids.length * 0.4 : 0);
  const clear = (lane) => {
    let best = Infinity;
    for (const o of st.objs) {
      if (o.cat !== 'obst' || o.hit) continue;
      const d = OBSTACLES[o.kind];
      if (d.clear === 'zone' && d.zone === 'ice') continue;
      if (d.clear === 'ramp') continue;
      const x = laneX(st, lane);
      if (Math.abs(o.x - x) > o.w / 2 + SLOPE.width / 2 - 0.2) continue;
      const dz = o.z - o.len / 2 - st.dist;
      if (dz < -o.len - 1) continue;
      if (d.clear !== 'none' && d.clear !== 'zone' && !d.moving) continue; // can be jumped/ducked
      const close = o.vz ? dz * v / Math.max(0.5, v - o.vz) : dz;
      if (close < best) best = close;
    }
    return best;
  };
  const input = {};
  const here = clear(st.lane);
  let bestLane = st.lane;
  if (here < look) {
    let bestRoom = here;
    for (const dl of [-1, 1]) {
      const l = st.lane + dl;
      if (l < 0 || l >= st.lanes) continue;
      const room = clear(l);
      if (room > bestRoom + 2) { bestRoom = room; bestLane = l; }
    }
  } else if (skill >= 1) {
    // a kid waving in a lane next to us with room
    for (const o of st.objs) {
      if (o.cat !== 'pick' || o.kind !== 'kid' || o.hit) continue;
      const dz = o.z - st.dist;
      if (dz < 4 || dz > 20 || Math.abs(o.lane - st.lane) !== 1) continue;
      if (clear(o.lane) > dz + 4) bestLane = o.lane;
    }
  }
  if (bestLane !== st.lane) input.dx = bestLane > st.lane ? 1 : -1;
  for (const o of st.objs) {
    if (o.cat !== 'obst' || o.hit) continue;
    const d = OBSTACLES[o.kind];
    // where we are heading, not where we are
    if (Math.abs(o.x - laneX(st, bestLane)) > o.w / 2 + 0.3) continue;
    const dz = o.z - st.dist;
    if (dz < 0 || dz > v * 0.24 + o.len / 2) continue;
    // a careless player misses every fourth one
    if (skill < 1 && Math.floor(o.z * 7) % 4 === 0) continue;
    if (d.clear === 'jump' && st.y === 0) input.jump = true;
    if (d.clear === 'duck' && st.duck <= 0) input.duck = true;
  }
  if (st.air && st.vy > 4 && st.flip <= 0 && skill >= 1) input.jump = true;
  return input;
}

function playStage(run, skill = 1, maxT = 400) {
  const st = startStage(run);
  launch(st, run, 0.8);
  const dt = 1 / 30;
  let lag = 0;
  for (let t = 0; t < maxT; t += dt) {
    let input = {};
    if (++lag % 3 === 0) input = botInput(st, run, skill);
    step(st, run, dt, input);
    if (st.over) return { st, ok: false };
    if (st.done) return { st, ok: true };
  }
  return { st, ok: false, timeout: true };
}

function playRun(seed, opts = {}) {
  const run = newRun(seed, opts);
  const stages = [];
  while (!run.ending) {
    const next = choices(run);
    const node = next[seed % next.length];
    chooseNode(run, node.id);
    if (node.mod === 'fair') {
      if (run.fair.length && run.coins >= run.fair[0].price) buyFair(run, run.fair[0].id);
      leaveFair(run);
      continue;
    }
    const r = playStage(run, opts.skill ?? 1);
    stages.push(r);
    if (!r.ok) { loseRun(run, r.st); break; }
    finishStage(run, r.st);
    if (run.offer) choosePerk(run, run.offer[0] ?? null);
  }
  return { run, stages };
}

const obst = (st, kind, z, lane = st.lane) => ({
  id: 9000 + Math.floor(z * 10), cat: 'obst', kind, lane, x: laneX(st, lane), z, y: 0, len: OBSTACLES[kind].len, w: OBSTACLES[kind].w * st.laneW, vz: 0,
  hit: false, kidHit: false, look: 0, pulled: false,
});

function emptySlope(seed = 5, opts = {}) {
  const run = newRun(seed, opts);
  chooseNode(run, choices(run)[0].id);
  const st = startStage(run);
  st.objs = [];
  st.nextZ = 1e9;
  launch(st, run, 1);
  st.speed = targetSpeed(st, run);
  return { run, st };
}

describe('«З гірки!» content', () => {
  it('has six themes with valid obstacles and Ukrainian text', () => {
    assert.equal(Object.keys(THEMES).length, 6);
    for (const t of Object.values(THEMES)) {
      for (const k of Object.keys(t.obstacles)) assert.ok(OBSTACLES[k], `${t.id}: ${k}`);
      assert.ok(t.speed[1] >= t.speed[0]);
      assert.match(t.intro, /[а-яіїєґ]/i);
      assert.ok(DRIFT_TEXT[t.id]);
    }
    for (const p of [...PERKS, ...HEROES, ...RIDES, ...UPGRADES]) assert.match(p.text, /[а-яіїєґ]/i);
    assert.equal(new Set(PERKS.map((p) => p.id)).size, PERKS.length);
    assert.equal(HEROES[0].price, 0);
    assert.equal(RIDES[0].price, 0);
    assert.ok(ENDINGS.home && ENDINGS.drift && MODS.fair);
  });
});

describe('«З гірки!» route', () => {
  it('runs from the yard to the blackout with forks in between', () => {
    for (let seed = 1; seed < 50; seed++) {
      const map = makeMap({ rng: seed });
      const rows = Array.from({ length: ROUTE_ROWS }, (_, r) => map.filter((n) => n.row === r));
      assert.equal(rows[0].length, 1);
      assert.equal(rows[0][0].theme, 'yard');
      assert.equal(rows[ROUTE_ROWS - 1].length, 1);
      assert.equal(rows[ROUTE_ROWS - 1][0].theme, 'blackout');
      assert.ok(rows.some((r) => r.length >= 3));
      for (const n of map) {
        if (n.row < ROUTE_ROWS - 1) assert.ok(n.next.length >= 1, `seed ${seed}: dead end at ${n.id}`);
        for (const id of n.next) assert.equal(map[id].row, n.row + 1);
      }
      // every node of a row is reachable from some node above
      for (let r = 1; r < ROUTE_ROWS; r++) for (const n of rows[r]) assert.ok(rows[r - 1].some((m) => m.next.includes(n.id)), `seed ${seed}: orphan ${n.id}`);
      // the final slope is never a fair
      assert.notEqual(rows[ROUTE_ROWS - 1][0].mod, 'fair');
    }
  });
  it('only offers nodes connected to where you are', () => {
    const run = newRun(3);
    chooseNode(run, choices(run)[0].id);
    run.row = 1;
    const ok = choices(run).map((n) => n.id);
    for (const n of run.map.filter((n) => n.row === 1)) {
      if (ok.includes(n.id)) continue;
      assert.throws(() => chooseNode(run, n.id));
    }
  });
});

describe('«З гірки!» slope', () => {
  it('is reproducible from the seed', () => {
    const a = newRun(7); chooseNode(a, choices(a)[0].id);
    const b = newRun(7); chooseNode(b, choices(b)[0].id);
    const sa = startStage(a); const sb = startStage(b);
    assert.deepEqual(sa.objs.map((o) => [o.kind, o.lane, Math.round(o.z)]), sb.objs.map((o) => [o.kind, o.lane, Math.round(o.z)]));
  });
  it('never blocks every lane with things you cannot jump or duck', () => {
    for (let seed = 1; seed < 30; seed++) {
      for (const n of makeMap({ rng: seed })) {
        if (n.mod === 'fair') continue;
        const run = newRun(seed);
        run.at = n.id;
        const st = startStage(run, n.id);
        launch(st, run, 1);
        for (let t = 0; t < 40 && !st.done; t += 0.5) {
          const rows = new Map();
          for (const o of st.objs) {
            if (o.cat !== 'obst' || o.vz !== 0 || OBSTACLES[o.kind].clear === 'zone' || OBSTACLES[o.kind].clear === 'ramp') continue;
            const key = Math.round(o.z / 4);
            if (!rows.has(key)) rows.set(key, []);
            rows.get(key).push(o);
          }
          for (const row of rows.values()) {
            const walls = new Set(row.filter((o) => OBSTACLES[o.kind].clear === 'none').map((o) => o.lane));
            assert.ok(walls.size < 3, `seed ${seed} ${n.theme}: wall of ${row.map((o) => o.kind)}`);
          }
          st.dist += 6;
          step(st, run, 0.001);
          st.over = false;
          run.hearts = 3;
        }
      }
    }
  });
  it('nothing hard sits on an ice sheet, where you cannot steer', () => {
    for (let seed = 1; seed < 40; seed++) {
      const run = newRun(seed);
      const node = run.map.find((n) => n.theme === 'dnipro');
      run.at = node.id;
      const st = startStage(run, node.id);
      for (const ice of st.objs.filter((o) => o.kind === 'ice')) {
        for (const o of st.objs) {
          if (o.cat !== 'obst' || o === ice || o.vz !== 0) continue;
          assert.ok(Math.abs(o.z - ice.z) > ice.len / 2 + o.len / 2 + 2, `seed ${seed}: ${o.kind} on the ice`);
        }
      }
    }
  });
});

describe('«З гірки!» rules', () => {
  it('jumping clears a log, riding into it costs a heart', () => {
    for (const jump of [true, false]) {
      const { run, st } = emptySlope();
      st.objs.push(obst(st, 'log', st.dist + 3));
      const h = run.hearts;
      const evs = [...step(st, run, 1 / 60, { jump })];
      for (let i = 0; i < 60; i++) evs.push(...step(st, run, 1 / 60));
      assert.equal(evs.some((e) => e.kind === 'crash'), !jump, `jump=${jump}`);
      assert.equal(run.hearts, jump ? h : h - 1);
    }
  });
  it('ducking clears a branch', () => {
    for (const duck of [true, false]) {
      const { run, st } = emptySlope();
      st.objs.push(obst(st, 'branch', st.dist + 2.5));
      const evs = [...step(st, run, 1 / 60, { duck })];
      for (let i = 0; i < 40; i++) evs.push(...step(st, run, 1 / 60));
      assert.equal(evs.some((e) => e.kind === 'crash'), !duck, `duck=${duck}`);
    }
  });
  it('the kids ride your track: they jump where you jumped', () => {
    const { run, st } = emptySlope(5, { neighbor: 2 });
    assert.equal(st.kids.length, 4);
    st.objs.push(obst(st, 'log', st.dist + 3));
    const evs = [...step(st, run, 1 / 60, { jump: true })];
    for (let i = 0; i < 120; i++) evs.push(...step(st, run, 1 / 60));
    assert.ok(!evs.some((e) => e.kind === 'tail' || e.kind === 'crash'));
    assert.equal(st.kids.length, 4);
    // and the track remembers the jump
    const tr = trackAt(st, st.objs[0].z);
    assert.ok(tr.y > 0.3, `track y ${tr.y}`);
  });
  it('a late swerve gets you past but cuts the tail', () => {
    const late = (lead) => {
      const { run, st } = emptySlope(5, { neighbor: 2 });
      const n = st.kids.length;
      st.objs.push(obst(st, 'snowman', st.dist + lead));
      const evs = [];
      // swerve when the snowman is `lead` metres ahead
      evs.push(...step(st, run, 1 / 60, { dx: 1 }));
      for (let i = 0; i < 120; i++) evs.push(...step(st, run, 1 / 60));
      return { crash: evs.some((e) => e.kind === 'crash'), lost: n - st.kids.length };
    };
    const early = late(9);
    assert.equal(early.crash, false);
    assert.equal(early.lost, 0, 'an early swerve keeps everyone');
    const tight = late(1.8);
    assert.equal(tight.crash, false, 'you get past');
    assert.ok(tight.lost > 0, 'the tail does not');
  });
  it('a crash costs a heart and half the ватага; no hearts means the end', () => {
    const { run, st } = emptySlope(5, { neighbor: 2 });
    st.kids.push({ x: st.x, look: 0 }, { x: st.x, look: 0 });
    run.hearts = 2;
    st.objs.push(obst(st, 'snowman', st.dist + 3));
    let evs = [];
    for (let i = 0; i < 60; i++) evs.push(...step(st, run, 1 / 60));
    const c = evs.find((e) => e.kind === 'crash');
    assert.ok(c);
    assert.equal(c.lost, 3);
    assert.equal(st.kids.length, 3);
    assert.equal(run.hearts, 1);
    st.invuln = 0;
    st.objs.push(obst(st, 'snowman', st.dist + 3));
    evs = [];
    for (let i = 0; i < 60; i++) evs.push(...step(st, run, 1 / 60));
    assert.ok(evs.some((e) => e.kind === 'over'));
    assert.ok(st.over);
  });
  it('a ramp throws you high; landing mid-flip is a crash, a finished flip pays', () => {
    const { run, st } = emptySlope();
    st.objs.push(obst(st, 'ramp', st.dist + 2));
    let evs = [];
    for (let i = 0; i < 400 && !evs.some((e) => e.kind === 'ramp'); i++) evs.push(...step(st, run, 1 / 60));
    for (let i = 0; i < 6; i++) step(st, run, 1 / 60);
    assert.ok(st.y > 0.8, `y ${st.y}`);
    evs = step(st, run, 1 / 60, { jump: true });
    assert.ok(evs.some((e) => e.kind === 'flip'));
    for (let i = 0; i < 90; i++) evs.push(...step(st, run, 1 / 60));
    assert.ok(evs.some((e) => e.kind === 'trick'));
    assert.ok(!evs.some((e) => e.kind === 'crash'));
    // a flip started just before landing
    const b = emptySlope();
    b.st.objs.push(obst(b.st, 'ramp', b.st.dist + 2));
    let out = [];
    for (let i = 0; i < 400 && !out.some((e) => e.kind === 'ramp'); i++) out.push(...step(b.st, b.run, 1 / 60));
    while (!(b.st.vy < 0 && b.st.y < 1)) step(b.st, b.run, 1 / 60);
    out = step(b.st, b.run, 1 / 60, { jump: true });
    for (let i = 0; i < 60; i++) out.push(...step(b.st, b.run, 1 / 60));
    assert.ok(out.some((e) => e.kind === 'badFlip'));
  });
  it('ice speeds you up and will not let you steer', () => {
    const { run, st } = emptySlope();
    const ice = obst(st, 'ice', st.dist + 6, 1);
    ice.w = st.laneW * 3;
    st.objs.push(ice);
    const v0 = targetSpeed(st, run);
    let evs = [];
    for (let i = 0; i < 40 && st.zone !== 'ice'; i++) evs.push(...step(st, run, 1 / 60));
    assert.equal(st.zone, 'ice');
    assert.ok(targetSpeed(st, run) > v0 * 1.15);
    const lane = st.lane;
    evs = step(st, run, 1 / 60, { dx: 1 });
    assert.equal(st.lane, lane);
    assert.ok(evs.some((e) => e.kind === 'slip'));
  });
  it('kids join up to the ride limit, then pay candies', () => {
    const { run, st } = emptySlope();
    const max = crewMax(run);
    for (let i = 0; i < max + 2; i++) st.objs.push({ ...obst(st, 'log', st.dist + 3 + i * 3), cat: 'pick', kind: 'kid', w: 1.3, len: 1, id: 100 + i });
    const evs = [];
    for (let i = 0; i < 400 && !st.done; i++) evs.push(...step(st, run, 1 / 60));
    assert.equal(st.kids.length, max);
    assert.ok(evs.some((e) => e.kind === 'kidFull'));
  });
  it('mittens are unique per offer and non-stacking ones are not offered twice', () => {
    const run = newRun(11);
    run.perks.push('bell', 'ushanka');
    for (let i = 0; i < 40; i++) {
      const o = offerPerks(run);
      assert.equal(new Set(o).size, o.length);
      assert.ok(!o.includes('bell') && !o.includes('ushanka'));
    }
  });
  it('the fair sells mittens for the run\'s candies and counts as a row', () => {
    const run = newRun(4);
    run.coins = 1000;
    run.row = 2;
    run.at = run.map.find((n) => n.row === 1).id;
    const fair = run.map.find((n) => n.row === 2 && n.mod === 'fair');
    run.at = run.map.find((n) => n.row === 1 && n.next.includes(fair.id)).id;
    chooseNode(run, fair.id);
    assert.equal(run.fair.length, 3);
    const item = run.fair[0];
    assert.ok(buyFair(run, item.id));
    assert.equal(run.coins, 1000 - item.price);
    assert.ok(run.perks.includes(item.id));
    leaveFair(run);
    assert.equal(run.row, 3);
  });
  it('heroes and rides change the run', () => {
    assert.equal(newRun(1).crew, 2);
    assert.equal(newRun(1, { hero: 'hanna' }).ride, 'nochvy');
    assert.equal(newRun(1, { hero: 'hanna' }).maxHearts, 4);
    assert.equal(newRun(1, { ride: 'plywood' }).maxHearts, 2);
    assert.equal(crewMax(newRun(1, { ride: 'tube' })), 4);
  });
});

describe('«З гірки!» balance', () => {
  it('a decent player gets home some of the time', () => {
    let home = 0;
    let stagesOk = 0;
    let stagesAll = 0;
    let crew = 0;
    let candies = 0;
    const N = 30;
    for (let seed = 1; seed <= N; seed++) {
      const { run, stages } = playRun(seed * 13);
      for (const s of stages) { stagesAll++; if (s.ok) stagesOk++; }
      if (run.ending === 'home') home++;
      crew += run.bestCrew;
      candies += run.coins;
    }
    console.log(`bot: ${home}/${N} runs get home; slopes ${stagesOk}/${stagesAll}; best ватага ${(crew / N).toFixed(1)}; candies ${(candies / N).toFixed(0)} a run`);
    assert.ok(home >= N * 0.15, `only ${home}/${N}`);
    assert.ok(home <= N * 0.9, `too easy: ${home}/${N}`);
  });
  it('a careless player rarely makes it', () => {
    let home = 0;
    let rows = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { run } = playRun(seed * 7, { skill: 0.3 });
      if (run.ending === 'home') home++;
      rows += run.history.length;
    }
    console.log(`careless: ${home}/20 get home, ${(rows / 20).toFixed(1)} slopes on average`);
    assert.ok(home <= 6, `${home}/20 careless runs got home`);
  });
});

void KID_GAP; void kidDist;
