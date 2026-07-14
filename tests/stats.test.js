import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, plOnDate, segmentBy, clvStats, clvTrend, clvBySegment } from '../web/src/stats.js';

const approx = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `esperado ~${b}, veio ${a}`);

const trades = [
  { date: '2026-07-14T10:00:00Z', market: 'Match Odds', surface: 'clay', stake: 100, pl: 20, result: 'green', oddEntry: 2.1, oddClose: 2.0 },
  { date: '2026-07-14T12:00:00Z', market: 'Match Odds', surface: 'hard', stake: 100, pl: -100, result: 'red', oddEntry: 1.8, oddClose: 2.0 },
  { date: '2026-07-13T09:00:00Z', market: 'Set 1', surface: 'clay', stake: 50, pl: 0, result: 'zero', oddEntry: 1.9 }, // sem oddClose
];

test('summarize: agrega totais, ROI e win rate', () => {
  const s = summarize(trades);
  assert.equal(s.count, 3);
  approx(s.totalPL, -80);
  approx(s.totalStaked, 250);
  approx(s.roi, -80 / 250);
  assert.equal(s.greens, 1);
  assert.equal(s.reds, 1);
  // win rate exclui o "zero" (só green/red contam)
  approx(s.winRate, 0.5);
});

test('summarize: CLV médio só considera trades com odd de fechamento', () => {
  const s = summarize(trades);
  // clv(2.1,2.0)=+5% ; clv(1.8,2.0)=-10% ; terceiro não tem oddClose
  approx(s.avgClvPct, (5 + -10) / 2, 1e-6);
});

test('summarize: lista vazia não quebra', () => {
  const s = summarize([]);
  assert.equal(s.count, 0);
  approx(s.roi, 0);
  approx(s.winRate, 0);
  approx(s.avgClvPct, 0);
});

test('plOnDate: soma o P/L apenas do dia informado (para o stop-loss)', () => {
  approx(plOnDate(trades, '2026-07-14'), -80);
  approx(plOnDate(trades, '2026-07-13'), 0);
  approx(plOnDate(trades, '2026-07-12'), 0);
});

test('segmentBy: agrupa por chave com P/L e ROI (o que deu bom x ruim)', () => {
  const seg = segmentBy(trades, 'surface');
  assert.equal(seg.clay.count, 2);
  approx(seg.clay.pl, 20);
  approx(seg.clay.staked, 150);
  approx(seg.hard.pl, -100);
  approx(seg.hard.roi, -1);
});

const clvTrades = [
  { date: '2026-07-10', market: 'Match Odds', surface: 'clay', clv: 4 },
  { date: '2026-07-11', market: 'Match Odds', surface: 'hard', clv: 2 },
  { date: '2026-07-12', market: 'Handicap', surface: 'clay', clv: -3 },
  { date: '2026-07-13', market: 'Match Odds', surface: 'grass' }, // sem clv → ignorado
];

test('clvStats: média, beat rate e contagem só de trades com CLV', () => {
  const s = clvStats(clvTrades);
  assert.equal(s.measured, 3);
  approx(s.avgClv, (4 + 2 - 3) / 3);
  assert.equal(s.beatCount, 2);
  approx(s.beatRate, 2 / 3);
});

test('clvStats: sem trades medidos não quebra', () => {
  const s = clvStats([{ date: 'x' }]);
  assert.equal(s.measured, 0);
  approx(s.avgClv, 0);
  approx(s.beatRate, 0);
  assert.equal(s.beatCount, 0);
});

test('clvTrend: CLV médio acumulado em ordem de data', () => {
  const t = clvTrend([
    { date: '2026-07-12', clv: -3 },
    { date: '2026-07-10', clv: 4 },
    { date: '2026-07-11', clv: 2 },
  ]);
  // ordena por data: 4, 2, -3 → acumulado: 4, 3, 1
  assert.equal(t.length, 3);
  approx(t[0], 4);
  approx(t[1], 3);
  approx(t[2], 1);
});

test('clvTrend: vazio e 1 elemento', () => {
  assert.deepEqual(clvTrend([]), []);
  const one = clvTrend([{ date: 'a', clv: 5 }]);
  assert.equal(one.length, 1);
  approx(one[0], 5);
});

test('clvBySegment: agrupa por chave só trades com CLV', () => {
  const g = clvBySegment([
    { market: 'Match Odds', clv: 4 },
    { market: 'Match Odds', clv: -2 },
    { market: 'Handicap', clv: 6 },
    { market: 'Handicap' }, // sem clv → ignorado
  ], 'market');
  assert.equal(g['Match Odds'].count, 2);
  approx(g['Match Odds'].avgClv, 1);
  approx(g['Match Odds'].beatRate, 0.5);
  assert.equal(g['Handicap'].count, 1);
  approx(g['Handicap'].avgClv, 6);
  approx(g['Handicap'].beatRate, 1);
});

test('clvBySegment: chave ausente cai em —', () => {
  const g = clvBySegment([{ clv: 3 }], 'surface');
  assert.equal(g['—'].count, 1);
  approx(g['—'].avgClv, 3);
});
