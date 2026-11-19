import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ENDINGS, ENDING_ORDER, ENDING_HINTS, MEMORY_LINES } from '../stiny/src/content.ts';
import {
  newRun, endDay, choosePerk, tick, replyOptions, replyFriend, bondOf, resolveKnock, readSteps, remember,
  pendingOffer, takeOffer, tiszaCost,
} from '../stiny/src/sim.ts';

/** A friend's message, as it lands in the phone. */
function friendMsg(run, i) {
  const m = { kind: 'friend', from: run.friends[i].name, text: 'ти як?', at: run.day.clock, friend: i };
  run.day.msgs.push(m);
  return m;
}

describe('«Чотири стіни» friends you answer', () => {
  it('a warm answer brings the friend closer and an answer back later that day', () => {
    const r = newRun(3);
    const m = friendMsg(r, 0);
    assert.deepEqual(replyOptions(r, m), ['warm', 'emoji']);
    const b0 = bondOf(r.friends[0]);
    const plan0 = r.day.plan.length;
    const o = replyFriend(r, m, 'warm');
    assert.ok(o.text.length > 0);
    assert.ok(bondOf(r.friends[0]) > b0);
    assert.equal(m.replied, true);
    assert.equal(r.day.plan.length, plan0 + 1, 'his answer is on its way');
    assert.deepEqual(replyOptions(r, m), [], 'answered once');
  });
  it('friends at the front can get music', () => {
    const r = newRun(4);
    r.friends[1].state = 'front';
    assert.ok(replyOptions(r, friendMsg(r, 1)).includes('music'));
    r.friends[2].state = 'dead';
    assert.deepEqual(replyOptions(r, friendMsg(r, 2)), []);
  });
  it('silence wears a friendship down; a silent friend stops writing', () => {
    const r = newRun(5);
    for (let s = 0; s < 6; s++) { for (let k = 0; k < 2; k++) friendMsg(r, 0); const rep = endDay(r); if (rep.ending) break; choosePerk(r, null); }
    assert.ok(bondOf(r.friends[0]) < 25);
    assert.ok(!r.day.plan.some((p) => p.msg?.friend === 0), 'no more messages from him');
  });
  it('close friends hold you up, and surviving with them is its own ending', () => {
    const r = newRun(6);
    r.friends.forEach((f) => { f.state = 'free'; f.arc = []; f.bond = 90; });
    r.season = 15;
    r.psyche = 60;
    const rep = endDay(r);
    assert.ok(rep.lines.some((l) => /пишуть майже щодня/.test(l)));
    assert.equal(rep.ending, 'together');
  });
  it('losing a close friend offers the choice to go yourself; yes ends the run, no lets it pass', () => {
    const r = newRun(7);
    r.friends[0].arc = [[r.season, 'dead']];
    r.friends[0].bond = 80;
    const rep = endDay(r);
    assert.ok(rep.news.some((n) => /тримайся там/.test(n.text)));
    choosePerk(r, null);
    assert.equal(pendingOffer(r), 'enlist');
    takeOffer(r, 'enlist', false);
    assert.equal(pendingOffer(r), null);
    assert.equal(r.ending, null);
    const r2 = newRun(7);
    r2.flags.offerEnlist = 1;
    assert.equal(takeOffer(r2, 'enlist', true).ending, 'enlist');
  });
  it('a friend abroad can know a man who takes people across: it costs, and it can fail', () => {
    const ends = new Set();
    for (let seed = 1; seed < 40; seed++) {
      const r = newRun(seed);
      r.season = 9;
      r.money = tiszaCost() + 50000;
      r.psyche = 70;
      r.friends.forEach((f) => { f.arc = []; });
      r.friends[0].state = 'abroad'; r.friends[0].bond = 75;
      const rep = endDay(r);
      if (rep.ending) continue;
      assert.equal(pendingOffer(r), 'tisza');
      const m0 = r.money;
      const o = takeOffer(r, 'tisza', true);
      assert.equal(r.money, m0 - tiszaCost());
      ends.add(o.ending);
    }
    assert.deepEqual([...ends].sort(), ['border', 'tisza']);
  });
});

describe('«Чотири стіни» steps on the stairs', () => {
  it('reading the steps right helps, wrong hurts', () => {
    assert.equal(readSteps('tck', 'tck'), 'right');
    assert.equal(readSteps('tck', 'neighbor'), 'wrong');
    assert.equal(readSteps('tck', null), 'none');
    const a = newRun(8); const b = newRun(8); const c = newRun(8);
    const right = resolveKnock(a, 'tck', true, 'right').dPsyche;
    const none = resolveKnock(b, 'tck', true, 'none').dPsyche;
    const wrong = resolveKnock(c, 'tck', true, 'wrong').dPsyche;
    assert.ok(right > none && none > wrong, `${right} ${none} ${wrong}`);
  });
  it('knowing the knock is in your head takes most of its weight away', () => {
    const a = newRun(9); const b = newRun(9);
    assert.ok(resolveKnock(a, 'phantom', true, 'right').dPsyche > resolveKnock(b, 'phantom', true).dPsyche);
  });
  it('knowing her shuffle, you can open to the neighbour', () => {
    const r = newRun(10);
    const f0 = r.food;
    const o = resolveKnock(r, 'neighbor', false, 'right');
    assert.equal(r.food, f0 + 1);
    assert.ok(o.dPsyche > 0);
  });
});

describe('«Чотири стіни» the memory and the endings', () => {
  it('the memory of Kozyn helps, less when someone from the photo is gone', () => {
    const a = newRun(11); a.psyche = 40;
    const b = newRun(11); b.psyche = 40; b.friends[0].state = 'dead';
    const ra = remember(a); const rb = remember(b);
    assert.ok(ra.dPsyche > rb.dPsyche);
    assert.equal(a.day.used.photos, 1);
    assert.ok(MEMORY_LINES.length >= 5);
  });
  it('apathy can end it quietly', () => {
    const r = newRun(12);
    r.apathy = 99;
    r.psyche = 50;
    assert.equal(endDay(r).ending, 'faded');
  });
  it('every ending has a title, a text and a hint, and the collection lists them all', () => {
    assert.equal(new Set(ENDING_ORDER).size, Object.keys(ENDINGS).length);
    for (const id of ENDING_ORDER) { assert.ok(ENDINGS[id].title && ENDINGS[id].text.length > 40); assert.ok(ENDING_HINTS[id]); }
  });
  it('reply-backs reach the phone as plain messages', () => {
    const r = newRun(13);
    const m = friendMsg(r, 0);
    replyFriend(r, m, 'warm');
    let got = null;
    for (let i = 0; i < 200 && !got; i++) for (const e of tick(r, 1)) if (e.kind === 'msg' && e.msg.kind === 'friend' && e.msg.replied) got = e.msg;
    assert.ok(got, 'answer arrived');
    assert.deepEqual(replyOptions(r, got), []);
  });
});
