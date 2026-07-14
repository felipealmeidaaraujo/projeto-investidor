import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePL } from '../web/src/trade.js';

test('resolvePL: green vira lucro positivo', () => {
  assert.equal(resolvePL('green', 50), 50);
});
test('resolvePL: red vira prejuízo negativo (usa o módulo do valor)', () => {
  assert.equal(resolvePL('red', 50), -50);
  assert.equal(resolvePL('red', -50), -50);
});
test('resolvePL: zerei é sempre 0', () => {
  assert.equal(resolvePL('zero', 50), 0);
});
