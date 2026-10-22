import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, TOOL_ORDER, TOOL_FOR, PERKS, PERK_IDS, STARS, DAY, CLIENTS } from '../hata/src/content.ts';
import {
  newSave, migrate, toolStats, nextPrice, buy, Ledger, starsFor, handOver, choosePerk, offerPerks,
  dayLength, clock, tick, nextDay, doneAt, money,
} from '../hata/src/sim.ts';
import { STAGES, STAGE_DONE, stageShare, currentStage, matches } from '../hata/src/game/stages.ts';

describe('Хата з краю: content', () => {
  it('every tool has levels with rising prices and the right work kinds', () => {
    for (const id of TOOL_ORDER) {
      const t = TOOLS[id];
      assert.equal(t.id, id);
      assert.ok(t.levels.length >= 1);
      for (let i = 1; i < t.levels.length; i++) assert.ok(t.levels[i].price > t.levels[i - 1].price, `${id} level ${i}`);
    }
    for (const [kind, tool] of Object.entries(TOOL_FOR)) assert.ok(TOOLS[tool].works.includes(kind), kind);
  });

  it('upgrades never make a tool worse', () => {
    for (const id of TOOL_ORDER) {
      const L = TOOLS[id].levels;
      for (let i = 1; i < L.length; i++) {
        assert.ok(L[i].radius >= L[i - 1].radius, `${id} radius`);
        assert.ok(L[i].rate >= L[i - 1].rate, `${id} rate`);
        assert.ok(L[i].range >= L[i - 1].range, `${id} range`);
      }
    }
  });

  it('stars are strictly increasing and perks have text', () => {
    for (let i = 1; i < STARS.length; i++) assert.ok(STARS[i] > STARS[i - 1]);
    for (const p of PERK_IDS) assert.ok(PERKS[p].text.length > 10);
    assert.ok(CLIENTS.length >= 4);
  });
});

describe('Хата з краю: money and tools', () => {
  it('starts with the basic kit and some money', () => {
    const s = newSave(5);
    for (const id of ['hands', 'washer', 'mower', 'leaves', 'net', 'mop', 'squeegee']) assert.equal(s.tools[id], 1, id);
    assert.equal(s.tools.paint, 0);
    assert.equal(s.tools.detector, 0);
    assert.ok(s.money > 0);
  });

  it('buys the next level only with enough money', () => {
    const s = newSave(5);
    s.money = 1000;
    assert.equal(buy(s, 'washer'), false);
    s.money = 2000;
    assert.equal(buy(s, 'washer'), true);
    assert.equal(s.tools.washer, 2);
    assert.equal(s.money, 200);
    assert.equal(toolStats(s, 'washer').name, TOOLS.washer.levels[1].name);
    s.money = 1e9;
    while (buy(s, 'washer'));
    assert.equal(nextPrice(s, 'washer'), null);
  });

  it('perks change tool stats and prices', () => {
    const s = newSave(5);
    const r0 = toolStats(s, 'washer').rate;
    s.run.perks.push('coffee', 'calluses', 'discount');
    assert.ok(toolStats(s, 'washer').rate > r0);
    assert.ok(nextPrice(s, 'washer') < TOOLS.washer.levels[1].price);
    s.tools.detector = 1;
    const d0 = toolStats(s, 'detector').range;
    s.run.perks.push('dowser');
    assert.equal(toolStats(s, 'detector').range, d0 * 2);
  });

  it('pays every whole percent once, plus a bonus on finishing', () => {
    const s = newSave(5);
    s.money = 0;
    const pays = [];
    const L = new Ledger(s, (a, k, done) => pays.push({ a, k, done }));
    L.report('wall', 1000, 0.004);
    assert.equal(pays.length, 0);
    L.report('wall', 1000, 0.105);
    assert.equal(pays.length, 1);
    assert.equal(pays[0].a, 100);
    L.report('wall', 1000, 0.1);
    assert.equal(pays.length, 1);
    L.report('wall', 1000, doneAt(s));
    assert.equal(pays.at(-1).done, true);
    // 100% of 1000 plus a 10% finishing bonus, nothing more after that
    assert.equal(Math.round(s.money), 1100);
    L.report('wall', 1000, 1);
    assert.equal(Math.round(s.money), 1100);
  });
});

describe('Хата з краю: day, hand-over and the run', () => {
  it('the clock runs from morning to evening', () => {
    const s = newSave(5);
    assert.equal(clock(s).label, '08:00');
    let ended = false;
    for (let t = 0; t < DAY.seconds + 5; t += 1) ended = tick(s, 1) || ended;
    assert.equal(ended, true);
    assert.equal(clock(s).hour, 20);
    assert.equal(nextDay(s), false);
    assert.equal(s.run.day, 2);
    s.run.perks.push('weather');
    assert.ok(dayLength(s) > DAY.seconds);
  });

  it('stars follow completion', () => {
    assert.equal(starsFor(0.3), 0);
    assert.equal(starsFor(0.35), 1);
    assert.equal(starsFor(0.5), 2);
    assert.equal(starsFor(0.85), 4);
    assert.equal(starsFor(1), 5);
  });

  it('a good hand-over continues the run and offers three different perks', () => {
    const s = newSave(5);
    const m0 = s.money;
    const r = handOver(s, 0.85, 10000, 77);
    assert.equal(r.stars, 4);
    assert.equal(r.failed, false);
    assert.ok(s.money > m0);
    assert.equal(s.run.houses, 1);
    assert.equal(s.run.seed, 77);
    assert.equal(s.run.offer.length, 3);
    assert.equal(new Set(s.run.offer).size, 3);
    const p = s.run.offer[0];
    choosePerk(s, p);
    assert.deepEqual(s.run.perks, [p]);
    assert.equal(s.run.offer, null);
  });

  it('a failed hand-over ends the run but keeps tools and money', () => {
    const s = newSave(5);
    s.tools.washer = 3;
    s.money = 999;
    handOver(s, 0.9, 10000, 9);
    choosePerk(s, s.run.offer[0]);
    const money0 = s.money;
    const r = handOver(s, 0.2, 10000, 10);
    assert.equal(r.failed, true);
    assert.equal(s.run.houses, 0);
    assert.deepEqual(s.run.perks, []);
    assert.equal(s.tools.washer, 3);
    assert.equal(s.money, money0);
    assert.equal(s.best.houses, 1);
  });

  it('perk offers never repeat a perk more than twice', () => {
    for (let seed = 0; seed < 200; seed++) {
      const owned = ['coffee', 'coffee'];
      assert.ok(!offerPerks(seed, owned).includes('coffee'));
    }
  });

  it('old or broken saves load as fresh ones', () => {
    assert.equal(migrate(null).v, 1);
    assert.equal(migrate({ v: 0, money: 5 }).money, 300);
    const s = migrate({ ...newSave(3), money: 42 });
    assert.equal(s.money, 42);
    assert.match(money(12345), /12/);
  });
});

describe('Хата з краю: economy balance', () => {
  it('the first upgrade is reachable within the first house', () => {
    // a starter house is worth ~14k at 100%; the first upgrades cost under 2k
    const cheapest = Math.min(...TOOL_ORDER.map((id) => TOOLS[id].levels.find((l) => l.price > 0)?.price ?? Infinity));
    assert.ok(cheapest <= 1500);
    const s = newSave(1);
    s.money = 0;
    const L = new Ledger(s, () => {});
    // a quarter of the front wall (≈ 2000 ₴ total) plus a few dishes
    L.report('front', 2000, 0.25);
    for (let i = 0; i < 6; i++) L.bonus('dish', 25);
    assert.ok(s.money >= 600);
  });
});

describe('Хата з краю: stages', () => {
  it('only free tools are needed to finish a stage', () => {
    // paint and the detector cost money, so no stage may depend on them
    for (const s of STAGES) {
      assert.ok(!matches(s, 'fence:back'), s.id);
      assert.ok(!s.keys.some((k) => k.startsWith('buried') || k === 'lost'), s.id);
    }
    assert.equal(TOOLS.paint.levels[0].price > 0, true);
  });
  it('prefix keys match', () => {
    const k = STAGES.find((s) => s.id === 'kitchen');
    assert.ok(matches(k, 'kitchen:counter'));
    assert.ok(matches(k, 'dishes'));
    assert.ok(!matches(k, 'floor:living'));
  });
  it('stages advance by value-weighted share', () => {
    const rows = [
      { key: 'facade:front', value: 1000, share: 1 },
      { key: 'drive', value: 500, share: 0.5 },
      { key: 'deck', value: 400, share: 0 },
      { key: 'floor:living', value: 100, share: 0 },
    ];
    assert.equal(currentStage(rows), 0);
    assert.ok(Math.abs(stageShare(STAGES[0], rows) - 1250 / 1500) < 1e-9);
    rows[1].share = 0.8; // (1000 + 400) / 1500 = 0.93
    assert.equal(currentStage(rows), 1);
    rows[2].share = 1;
    assert.equal(currentStage(rows), 2);
    rows[3].share = STAGE_DONE;
    // empty rooms count as done, so everything is done
    assert.equal(currentStage(rows), STAGES.length);
  });
});
