import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiltWarning } from '../web/src/stats.js';

const day = '2026-07-14';

test('tiltWarning: sem trades no dia → sem alerta', () => {
  assert.equal(tiltWarning([], day, 50), false);
});

test('tiltWarning: último trade do dia foi RED e o novo stake é MAIOR → alerta', () => {
  const trades = [{ date: '2026-07-14T10:00', result: 'red', stake: 20 }];
  assert.equal(tiltWarning(trades, day, 30), true);
});

test('tiltWarning: red mas stake igual ou menor → sem alerta', () => {
  const trades = [{ date: '2026-07-14T10:00', result: 'red', stake: 20 }];
  assert.equal(tiltWarning(trades, day, 20), false);
  assert.equal(tiltWarning(trades, day, 10), false);
});

test('tiltWarning: último trade foi green → sem alerta mesmo aumentando', () => {
  const trades = [{ date: '2026-07-14T10:00', result: 'green', stake: 20 }];
  assert.equal(tiltWarning(trades, day, 100), false);
});

test('tiltWarning: red de outro dia não conta', () => {
  const trades = [{ date: '2026-07-13T10:00', result: 'red', stake: 20 }];
  assert.equal(tiltWarning(trades, day, 100), false);
});
