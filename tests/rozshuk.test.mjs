import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, blocksMove, isWaypoint } from '../rozshuk/src/maps.ts';
import { LEVELS, PERKS, TALKS, nextLevelId } from '../rozshuk/src/content.ts';
import { Qte, mashSpec, timingSpec, swipeSpec, holdSpec, choiceSpec, BASE_MODS } from '../rozshuk/src/qte.ts';
import { OutingSim } from '../rozshuk/src/outing.ts';
import {
  newRun, doAction, outingContext, endOuting, choosePath, choosePerk, level, resolveKnock, resolveEventChoice, runXp,
} from '../rozshuk/src/run.ts';

const ctxFor = (lv, extra = {}) => ({
  level: lv, seed: 7, heat: 20, perks: [], items: [], flags: {}, trait: 'it', intel: false, money: 200000,
  nerves: 30, satiety: 70, pumped: false, doorWatch: false, prices: 1, ...extra,
});

/** Plays a QTE perfectly (or badly) in small steps. */
function solveQte(sim, good = true) {
  for (let i = 0; i < 4000 && sim.qte && !sim.qte.done; i++) {
    const q = sim.qte;
    const s = q.spec;
    if (good) {
      if (s.kind === 'mash') q.tap();
      if (s.kind === 'timing') { const [a, b] = q.zone; if (q.marker > a + 0.02 && q.marker < b - 0.02) q.tap(); }
      if (s.kind === 'swipe') q.swipe(q.seq[q.step]);
      if (s.kind === 'hold') { const [a, b] = q.band; q.press(q.marker < (a + b) / 2); }
      if (s.kind === 'choice') {
        const ids = s.options.map((o) => o.id);
        q.choose(['right', 'run', 'ok', 'truth', 'calm', 'press'].find((x) => ids.includes(x)) ?? ids[0]);
      }
    }
    sim.update(1 / 60);
  }
  sim.update(1 / 60);
}

/** Walks the player along grid paths to every objective, then to the exit. */
function autoplay(sim, { clearPatrols = true, limit = 600 } = {}) {
  if (clearPatrols) sim.patrols = [];
  let target = null;
  let path = [];
  for (let t = 0; t < limit && (sim.phase === 'explore' || sim.phase === 'qte'); t += 1 / 30) {
    if (sim.phase === 'qte') { solveQte(sim); continue; }
    const open = sim.objectives.filter((o) => sim.objectiveOpen(o) && !o.def.optional);
    const goal = open[0] ?? (sim.exitOpen ? sim.exit : null);
    if (!goal) { sim.setMove(0, 0); sim.update(1 / 30); continue; }
    if (goal !== target || !path.length) { target = goal; path = sim.findPath({ x: sim.px, z: sim.pz }, goal); }
    while (path.length && Math.hypot(path[0].x - sim.px, path[0].z - sim.pz) < 0.25) path.shift();
    const n = path[0] ?? goal;
    const dx = n.x - sim.px; const dz = n.z - sim.pz; const d = Math.hypot(dx, dz);
    sim.setMove(d > 0.05 ? dx / d : 0, d > 0.05 ? dz / d : 0);
    sim.update(1 / 30);
  }
  return sim;
}

describe('maps', () => {
  it('rows are rectangular and use known characters', () => {
    for (const [id, m] of Object.entries(MAPS)) {
      const w = m.rows[0].length;
      for (const row of m.rows) assert.equal(row.length, w, `${id}: ${row}`);
      for (const ch of m.rows.join('')) assert.match(ch, /[#GKY~%^&WBD*+TL=\-:.@!1-9a-z]/, `${id}: ${ch}`);
      assert.equal(m.rows.join('').split('@').length - 1, 1, `${id} needs one start`);
    }
  });
  it('every level points at real slots and waypoints', () => {
    for (const lv of LEVELS) {
      const rows = MAPS[lv.map].rows.join('');
      for (const o of lv.objectives) for (const s of o.slot.split('|')) assert.ok(rows.includes(s), `${lv.id} slot ${s}`);
      for (const p of [...lv.patrols, ...lv.pool]) for (const ch of p.route) assert.ok(rows.includes(ch), `${lv.id} wp ${ch}`);
    }
  });
  it('ground waypoints stand on walkable cells', () => {
    for (const lv of LEVELS) {
      const sim = new OutingSim(ctxFor(lv));
      for (const p of [...lv.patrols, ...lv.pool]) {
        if (p.kind === 'drone') continue;
        for (const ch of p.route) {
          const w = sim.waypoints.get(ch);
          const { r, c } = sim.cellAt(w.x, w.z);
          const cell = MAPS[lv.map].rows[r][c];
          assert.ok(isWaypoint(cell), `${lv.id}:${ch}`);
          if (p.kind === 'boat') assert.ok(MAPS[lv.map].rows[r].includes('~'), `${lv.id} boat on water`);
        }
      }
    }
  });
  it('vault fences have walkable ground on both sides', () => {
    for (const [id, m] of Object.entries(MAPS)) {
      m.rows.forEach((row, r) => [...row].forEach((ch, c) => {
        if (ch !== '^') return;
        const ns = !blocksMove(m.rows[r - 1]?.[c] ?? '#') && !blocksMove(m.rows[r + 1]?.[c] ?? '#');
        const we = !blocksMove(row[c - 1] ?? '#') && !blocksMove(row[c + 1] ?? '#');
        assert.ok(ns || we, `${id} vault at ${r},${c}`);
      }));
    }
  });
});

describe('levels', () => {
  it('fifteen steps on each path with a fork after seven', () => {
    for (const path of ['border', 'legal']) {
      let id = '1';
      const seen = [id];
      while ((id = nextLevelId(id, path))) seen.push(id);
      assert.equal(seen.length, 15, path);
      assert.deepEqual(seen.slice(0, 7), ['1', '2', '3', '4', '5', '6', '7']);
    }
    for (const lv of LEVELS) for (const o of lv.objectives) if (o.talk) assert.ok(TALKS[o.talk], o.talk);
  });
  it('every level can be finished by walking (no patrols)', () => {
    for (const lv of LEVELS) {
      for (const seed of [1, 2, 3]) {
        const sim = autoplay(new OutingSim(ctxFor(lv, { seed, flags: { job: true, trip: true }, items: ['bron'] })));
        assert.equal(sim.phase, 'won', `${lv.id} seed ${seed}: ${sim.phase} t=${sim.time.toFixed(1)}`);
      }
    }
  });
  it('the legal booth turns you back without papers', () => {
    const lv = LEVELS.find((l) => l.id === '15b');
    const sim = autoplay(new OutingSim(ctxFor(lv, { flags: {}, items: [] })));
    assert.equal(sim.phase, 'caught');
  });
});

describe('qte', () => {
  it('mash fills with taps and drains without', () => {
    const q = new Qte(mashSpec('t', 'p', BASE_MODS));
    for (let i = 0; i < q.spec.taps; i++) q.tap();
    assert.equal(q.result, 'win');
    const lazy = new Qte(mashSpec('t', 'p', BASE_MODS));
    for (let i = 0; i < 400 && !lazy.done; i++) lazy.update(0.05);
    assert.equal(lazy.result, 'fail');
  });
  it('timing hits inside the zone and misses outside', () => {
    const q = new Qte(timingSpec('t', 'p', BASE_MODS, 2, 0), () => 0.5);
    let guard = 0;
    while (!q.done && guard++ < 2000) {
      q.update(0.005);
      const [a, b] = q.zone;
      if (q.marker > a + 0.01 && q.marker < b - 0.01) q.tap();
    }
    assert.equal(q.result, 'win');
    const miss = new Qte(timingSpec('t', 'p', BASE_MODS, 1, 0), () => 0.9);
    miss.marker = 0; miss.tap();
    assert.equal(miss.result, 'fail');
  });
  it('swipe follows the sequence; hold needs the band; choice times out', () => {
    const s = new Qte(swipeSpec('t', 'p', BASE_MODS, 3));
    for (const d of [...s.seq]) s.swipe(d);
    assert.equal(s.result, 'win');
    const h = new Qte(holdSpec('t', 'p', BASE_MODS, 2), () => 0.5);
    for (let i = 0; i < 2000 && !h.done; i++) { const [a, b] = h.band; h.press(h.marker < (a + b) / 2); h.update(0.01); }
    assert.equal(h.result, 'win');
    const c = new Qte(choiceSpec('t', 'p', [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], BASE_MODS, 1, 'b'));
    for (let i = 0; i < 30; i++) c.update(0.05);
    assert.deepEqual(c.result, { choice: 'b' });
  });
});

describe('stealth', () => {
  const lv = LEVELS[0];
  const setup = () => {
    const sim = new OutingSim(ctxFor(lv));
    sim.babki = [];
    sim.patrols = sim.patrols.slice(0, 1);
    const p = sim.patrols[0];
    // open pavement in the middle of the yard
    p.x = 19.5; p.z = 22.5; p.dir = Math.PI; p.scanBase = Math.PI; p.route = [{ x: 19.5, z: 22.5 }]; p.wp = 0; p.path = [];
    return { sim, p };
  };
  it('a patrol that sees you fills suspicion, chases and grabs', () => {
    const { sim, p } = setup();
    sim.px = 19.5; sim.pz = 17.5; // 5 m in front of it
    const ev = [];
    for (let i = 0; i < 600 && sim.phase === 'explore'; i++) ev.push(...sim.update(1 / 30));
    assert.ok(ev.some((e) => e.type === 'spotted'));
    assert.equal(sim.phase, 'qte');
    assert.equal(sim.qteCtx, 'grab');
    assert.ok(p.state === 'chase');
  });
  it('standing still in a bush keeps you hidden', () => {
    const { sim, p } = setup();
    // bush at row 6, col 6
    sim.cells[6][6] = '*';
    sim.px = 19.5; sim.pz = 19.5; p.z = 25.5; p.route = [{ x: 19.5, z: 25.5 }];
    for (let i = 0; i < 300; i++) sim.update(1 / 30);
    assert.ok(sim.hidden);
    assert.equal(p.state === 'chase', false);
    assert.ok(p.suspicion < 0.2);
  });
  it('sprinting is heard behind your back', () => {
    const { sim, p } = setup();
    p.dir = 0; p.scanBase = 0; // facing away (south)
    sim.px = 19.5; sim.pz = 18.5;
    sim.setSprint(true); sim.setMove(1, 0);
    const ev = [];
    for (let i = 0; i < 20; i++) ev.push(...sim.update(1 / 30));
    assert.ok(ev.some((e) => e.type === 'heard'));
    assert.equal(p.state, 'investigate');
  });
  it('a grab can end in the van or a clean escape', () => {
    for (const good of [true, false]) {
      const { sim, p } = setup();
      sim.px = 19.5; sim.pz = 21.7;
      p.state = 'chase';
      for (let i = 0; i < 30 && sim.phase === 'explore'; i++) sim.update(1 / 30);
      assert.equal(sim.qteCtx, 'grab');
      if (good) solveQte(sim, true); else { while (sim.qte) solveQte(sim, false); }
      assert.equal(sim.phase, good ? 'explore' : 'caught');
    }
  });
  it('the lawyer pulls you out of the van once', () => {
    const sim = new OutingSim(ctxFor(lv, { perks: ['lawyer'] }));
    const p = sim.patrols[0];
    p.x = sim.px; p.z = sim.pz - 0.5; p.state = 'chase';
    sim.update(1 / 30);
    while (sim.qte) solveQte(sim, false);
    assert.equal(sim.phase, 'explore');
    assert.ok(sim.result().lawyerUsed);
  });
});

describe('run', () => {
  /** Plays home phases with a simple policy; outings succeed with typical rewards. */
  function playRun(path, seed = 3) {
    const s = newRun('it', seed);
    for (let guard = 0; guard < 60 && s.phase !== 'end'; guard++) {
      if (s.phase === 'home') {
        if (s.event) resolveEventChoice(s, 1);
        if (s.knock) resolveKnock(s, true);
        while (s.ap > 0) {
          if (s.satiety < 45 && s.food > 0) doAction(s, 'eat');
          else if (s.nerves > 75) doAction(s, 'sleep');
          else if (!doAction(s, 'work', 0.8).ok) doAction(s, 'sleep');
        }
        const ctx = outingContext(s);
        const sim = new OutingSim(ctx);
        autoplay(sim);
        assert.equal(sim.phase, 'won', `${level(s).id}`);
        endOuting(s, sim.result());
      } else if (s.phase === 'fork') choosePath(s, path);
      else if (s.phase === 'perk') choosePerk(s, s.perkOffer.find((p) => p !== 'lawyer') ?? null);
    }
    return s;
  }
  it('a careful legal run can afford every payment', () => {
    const s = playRun('legal');
    assert.equal(s.ending, 'legal');
    for (const f of ['job', 'trip']) assert.ok(s.flags[f], f);
    assert.ok(s.items.includes('bron'));
    assert.ok(!Object.keys(s.flags).some((k) => k.startsWith('unpaid_')), JSON.stringify(s.flags));
    assert.ok(runXp(s) >= 55);
  });
  it('a careful border run pays the guide', () => {
    const s = playRun('border', 5);
    assert.equal(s.ending, 'border');
    assert.ok(s.flags.guide);
    assert.ok(['backpack', 'blanket', 'drybag'].every((i) => s.items.includes(i)));
  });
  it('being caught ends the run', () => {
    const s = newRun('it', 1);
    endOuting(s, { won: false, caught: true, spotted: 1, escapes: 0, heat: 0, money: 0, food: 0, nerves: 0, items: [], flags: [], unpaid: [], perfect: false, time: 10, lawyerUsed: false });
    assert.equal(s.phase, 'end');
    assert.equal(s.ending, 'caught');
  });
  it('hunger and nerves bite; perks are offered between levels', () => {
    const s = newRun('it', 2);
    s.satiety = 10; s.nerves = 95;
    const sim = autoplay(new OutingSim(outingContext(s)));
    endOuting(s, sim.result());
    assert.equal(s.phase, 'perk');
    assert.equal(s.perkOffer.length, 3);
    for (const p of s.perkOffer) assert.ok(PERKS.find((x) => x.id === p));
    choosePerk(s, s.perkOffer[0]);
    assert.equal(s.satiety, 0);
    assert.ok(s.breakdown, 'nerves at 100 cause a breakdown');
    assert.equal(s.levelId, '2');
  });
});

describe('voice lines', async () => {
  const { LINES, lineFor } = await import('../rozshuk/src/lines.ts');
  const { existsSync, readFileSync } = await import('node:fs');
  it('every line has a recording and ids are unique', () => {
    assert.equal(new Set(LINES.map((l) => l.id)).size, LINES.length);
    for (const l of LINES) assert.ok(existsSync(`public/rozshuk/voice/${l.id}.mp3`), l.id);
  });
  it('every shout the outing emits has a recording', () => {
    const src = readFileSync('rozshuk/src/outing.ts', 'utf8');
    const arrays = [...src.matchAll(/const (?:SHOUT_\w+|BABKA_CALL) = \[([^\]]+)\]/g)].map((m) => m[1]);
    const shouts = arrays.flatMap((a) => [...a.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
    assert.ok(shouts.length >= 17);
    for (const t of shouts) assert.ok(lineFor(t), t);
    for (const q of TALKS ? Object.values(TALKS) : []) assert.ok(lineFor(q.line), q.line);
  });
});
