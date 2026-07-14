import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopLossStatus } from '../web/src/stats.js';

const cfg = { initial: 1000, dailyStopLossPct: 0.1 }; // limite = R$ 100

test('stopLossStatus: sem perdas no dia → nada usado, não atingido', () => {
  const s = stopLossStatus(cfg, [{ date: '2026-07-14T10:00', pl: 30 }], '2026-07-14');
  assert.equal(s.limit, 100);
  assert.equal(s.lossToday, 0);
  assert.equal(s.used, 0);
  assert.equal(s.hit, false);
});

test('stopLossStatus: perda parcial → fração usada', () => {
  const s = stopLossStatus(cfg, [{ date: '2026-07-14T10:00', pl: -80 }], '2026-07-14');
  assert.equal(s.lossToday, 80);
  assert.ok(Math.abs(s.used - 0.8) < 1e-9);
  assert.equal(s.hit, false);
});

test('stopLossStatus: perda >= limite → atingido e travado em 100%', () => {
  const s = stopLossStatus(cfg, [{ date: '2026-07-14T10:00', pl: -120 }], '2026-07-14');
  assert.equal(s.hit, true);
  assert.equal(s.used, 1);
});
