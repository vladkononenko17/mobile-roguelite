import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, PERKS, SEASON_DEFS, TRAITS, THOUGHTS, ENDINGS, FRIEND_NEWS, WINDOW_LINES, PLACE_LABELS, seasonName } from '../stiny/src/content.ts';
import { applyContentLang } from '../stiny/src/content.en.ts';
import { newRun, startDay, endDay, choosePerk, beginAction, tick, rainyDay, dailySeed, fmt } from '../stiny/src/sim.ts';
import { getLang } from '../stiny/src/i18n.ts';

const cyr = /[А-Яа-яІіЇїЄєҐґ]/;

describe('«Чотири стіни» rain', () => {
  it('never rains in winter, sometimes rains otherwise, and the weather comes from the seed alone', () => {
    let rainy = 0;
    for (let seed = 1; seed < 400; seed++) {
      for (let s = 0; s < 16; s++) {
        if (s % 4 === 0) assert.equal(rainyDay(seed, s), false);
        if (rainyDay(seed, s)) rainy++;
        assert.equal(rainyDay(seed, s), rainyDay(seed, s));
      }
    }
    const share = rainy / (399 * 12);
    assert.ok(share > 0.25 && share < 0.5, `rainy share ${share}`);
  });
  it('rolling the weather does not shift the run (same seed, same day as before)', () => {
    const a = newRun(42);
    const b = newRun(42);
    assert.deepEqual(a.day.plan.map((p) => [p.at, p.kind]), b.day.plan.map((p) => [p.at, p.kind]));
    assert.equal(a.day.rain, rainyDay(42, 0));
  });
  it('rain is cover: the balcony with the van below costs far less heat', () => {
    const r = newRun(5);
    r.season = 1;
    startDay(r);
    const d = r.day;
    d.bus = [d.clock, d.clock + 300];
    d.rain = true;
    const h0 = r.heat;
    assert.equal(beginAction(r, 'balcony'), null);
    let done = null;
    for (let i = 0; i < 100 && !done; i++) done = tick(r, 5).find((e) => e.kind === 'done');
    assert.ok(done, 'balcony finished');
    assert.ok(r.heat - h0 <= 6, `heat +${r.heat - h0}`);
    assert.equal(d.exposed, false);
  });
});

describe('«Чотири стіни» daily run', () => {
  it('the seed is the local date', () => {
    assert.equal(dailySeed(new Date(2026, 10, 19)), 20261119);
  });
  it('every player gets the same day each season, whatever they did before', () => {
    const day = 20261119;
    const a = newRun(day, 'it', day);
    const b = newRun(day, 'it', day);
    // a plays a busy day, b goes straight to bed
    for (const id of ['eat', 'work', 'news', 'mom', 'look']) { beginAction(a, id); for (let i = 0; i < 80 && a.day.busy; i++) tick(a, 5); }
    for (const r of [a, b]) { const rep = endDay(r); choosePerk(r, null); assert.equal(rep.ending, null); }
    assert.equal(a.season, 1);
    assert.deepEqual(a.day.plan.map((p) => [p.at, p.kind, p.who ?? '', !!p.ballistic]), b.day.plan.map((p) => [p.at, p.kind, p.who ?? '', !!p.ballistic]));
    assert.deepEqual(a.day.blackouts, b.day.blackouts);
    assert.deepEqual(a.day.bus, b.day.bus);
  });
});

describe('«Чотири стіни» English', () => {
  it('switches every content text to English and back to the original', () => {
    const ukIntro = SEASON_DEFS[0].intro;
    const ukAction = ACTIONS[0].label;
    applyContentLang('en');
    try {
      assert.equal(getLang(), 'en');
      const texts = [
        ...SEASON_DEFS.flatMap((s) => [s.title, s.intro, ...s.facts]),
        ...ACTIONS.flatMap((a) => [a.label, a.hint]),
        ...PERKS.flatMap((p) => [p.name, p.text]),
        ...TRAITS.flatMap((t) => [t.name, t.text]),
        ...THOUGHTS.flat(), ...Object.values(FRIEND_NEWS).flat(), ...Object.values(WINDOW_LINES).flat(),
        ...Object.values(ENDINGS).flatMap((e) => [e.title, e.sticker, e.text]), ...Object.values(PLACE_LABELS),
        seasonName(5),
      ];
      for (const t of texts) { assert.ok(t.length > 0); assert.ok(!cyr.test(t), `still Ukrainian: ${t}`); }
      assert.equal(seasonName(5), 'SPRING 2024');
      // the sim speaks English too, friends' names are transliterated
      const r = newRun(9);
      for (const m of r.day.msgs) assert.ok(!cyr.test(m.text), m.text);
      for (let s = 0; s < 8; s++) {
        const rep = endDay(r);
        for (const l of rep.lines) assert.ok(!cyr.test(l), l);
        for (const n of rep.news) { assert.ok(!cyr.test(n.text), n.text); assert.ok(!cyr.test(n.from), n.from); }
        if (rep.ending) break;
        choosePerk(r, rep.offer[0] ?? null);
      }
      assert.match(fmt(12345), /^12,345\s₴$/);
    } finally {
      applyContentLang('uk');
    }
    assert.equal(SEASON_DEFS[0].intro, ukIntro);
    assert.equal(ACTIONS[0].label, ukAction);
    assert.equal(seasonName(5), 'ВЕСНА 2024');
  });
});
