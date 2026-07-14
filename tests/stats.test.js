import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, plOnDate, segmentBy } from '../web/src/stats.js';

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
